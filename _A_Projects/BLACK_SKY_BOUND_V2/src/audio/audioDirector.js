import { EventType } from '../constants/eventTypes.js';
import { AUDIO_TUNING } from '../data/audio/audioTuning.js';
import { buildBodyStateProjection } from '../projection/bodyStateProjection.js';
import { AudioAssetBank } from './audioAssetBank.js';
import { startDecodedFileVoice } from './audioFileVoice.js';
import { AudioBusGraph, setAudioParam } from './audioBus.js';
import {
  clamp01,
  damageIntensity,
  findAudioPlayer,
  findNearestEnemy,
  resolveOpeningMix,
  rounded,
  summarizePayload
} from './audioStateMath.js';
import { createLightningThunderBridge } from './lightningThunder.js';
import { createLoopState, isPlayerBodyLoopCue, loopVoiceIsActive, syncLoopSuspension } from './audioLoopLifecycle.js';
import {
  buildProceduralLoop,
  buildProceduralOneShot,
  proceduralDuration,
  randomPitch
} from './proceduralAudio.js';
import { getSoundCue, SOUND_CUES } from './soundManifest.js';
import { AudioEventType, createAudioEventQueue, resolveActionAudioEvent } from './soundEvents.js';

const LOOP_CUE_IDS = Object.freeze([
  'ambience.forest_night',
  'player.breath.calm',
  'player.breath.strained',
  'player.heartbeat'
]);

const EVENT_CUES = Object.freeze({
  [AudioEventType.PLAYER_STAMINA_LOW]: 'player.stamina.low',
  [AudioEventType.PLAYER_ACTION_CLAW]: 'player.claw.swipe',
  [AudioEventType.PLAYER_ACTION_BITE]: 'player.bite.snap',
  [AudioEventType.PLAYER_ACTION_LUNGE]: 'player.lunge.body',
  [AudioEventType.PLAYER_SMOKE_EXHALE]: 'player.smoke.exhale',
  [AudioEventType.COMBAT_ENEMY_HIT]: 'combat.enemy.hit.flesh',
  [AudioEventType.ENEMY_NEAR]: 'enemy.raider.near',
  [AudioEventType.ENEMY_ATTACK_WARNING]: 'enemy.raider.warn',
  [AudioEventType.MAMA_WYVERN_ROAR]: 'world.mama_wyvern.distant_roar',
  [AudioEventType.MAMA_WYVERN_FLYOVER]: 'world.mama_wyvern.flyover_roar',
  [AudioEventType.MAMA_WYVERN_NAPALM]: 'world.mama_wyvern.napalm_projection',
  [AudioEventType.MAMA_WYVERN_AFTERMATH]: 'world.mama_wyvern.inferno_aftermath',
  [AudioEventType.UI_PAUSE]: 'ui.pause.breath_stop'
});

export function createAudioDirector(options = {}) {
  return new AudioDirector(options);
}

export class AudioDirector {
  constructor(options = {}) {
    this.contract = 'black-sky-bound.audio-director.v0';
    this.enabled = options.enabled !== false;
    const busOptions = { tuning: options.tuning ?? AUDIO_TUNING }; if (Object.hasOwn(options, 'context')) busOptions.context = options.context;
    this.bus = new AudioBusGraph(busOptions);
    this.assets = options.assetBank ?? new AudioAssetBank({ context: this.bus.context, fetchImpl: options.fetchImpl });
    this.assets.preloadCues(SOUND_CUES);
    this.queue = createAudioEventQueue();
    this.seenWorldEvents = new WeakSet();
    this.loopVoices = new Map();
    this.activeVoices = new Map();
    this.lastCueTimes = new Map();
    this.lastActionId = null;
    this.lastPauseState = false;
    this.staminaLowArmed = true;
    this.nearEnemyLastAtMs = -Infinity;
    this.attackWarningKeys = new Map();
    this.timeMs = 0;
    this.playbackSequence = 0;
    this.unlocked = !this.bus.context;
    this.unlockTarget = null;
    this.recentEvents = [];
    this.recentCues = [];
    this.recentErrors = [];
    this.reportedErrorKeys = new Set();
    this.suppressed = { cooldown: 0, maxVoices: 0, disabled: 0, paused: 0 };
    this.pressure = {
      healthPressure: 0,
      staminaPressure: 0,
      hitPulse: 0,
      muffleIntensity: 0,
      breathStrain: 0,
      heartbeat: 0
    };
    this.nearestEnemy = null;
    this.opening = {
      active: false,
      phase: 'released',
      observedAudioSequence: 0
    };
    this.lightning = createLightningThunderBridge();
  }

  attachUnlockTarget(target = null) {
    if (!target || this.unlockTarget || !this.bus.context) return;
    const unlock = () => {
      this.unlock();
      target.removeEventListener?.('pointerdown', unlock);
      target.removeEventListener?.('mousedown', unlock);
      globalThis.window?.removeEventListener?.('keydown', unlock);
    };
    target.addEventListener?.('pointerdown', unlock, { passive: true });
    target.addEventListener?.('mousedown', unlock, { passive: true });
    globalThis.window?.addEventListener?.('keydown', unlock, { passive: true });
    this.unlockTarget = target;
  }

  unlock() {
    this.unlocked = true;
    return Promise.all([this.bus.resume(), this.assets.preloadCues(SOUND_CUES)]).then(([resumed]) => resumed);
  }

  emit(type, payload = {}) {
    const event = this.queue.emit(type, payload);
    this.recordRecent(this.recentEvents, { type, payload: summarizePayload(payload), atMs: Math.round(this.timeMs) });
    return event;
  }

  update(state, dt = 0) {
    if (!this.enabled) return this.getDebugState();
    const paused = state?.paused === true;
    this.timeMs += Math.max(0, Number(dt) || 0) * 1000;
    this.bus.setPaused(paused);
    this.bus.applyUserMix(state?.playerProfile?.settings?.audio);
    this.ensureLoops(paused);
    this.updatePressureLoops(state);
    this.collectOpeningState(state?.opening);
    if (!paused) this.lightning.collect(state?.game, this.timeMs);
    if (state?.opening?.released !== false) {
      this.collectWorldEvents(state?.game);
      this.collectStateTransitions(state);
    }
    this.processQueuedEvents(paused);
    if (!paused) this.lightning.process(this.timeMs, this.pressure.muffleIntensity, (cueId, payload) => this.playCue(cueId, payload));
    this.cleanupVoices();
    return this.getDebugState();
  }

  collectOpeningState(opening) {
    this.opening.active = opening?.released === false;
    this.opening.phase = opening?.phase ?? 'released';
    const sequence = opening?.audio?.sequence ?? 0;
    if (sequence <= this.opening.observedAudioSequence) return;
    const events = Array.isArray(opening.audio?.events) && opening.audio.events.length
      ? opening.audio.events.filter((event) => event.sequence > this.opening.observedAudioSequence)
      : [{
          sequence,
          cueId: opening.audio?.cueId,
          reason: opening.audio?.reason,
          intensity: null,
          soundscapeId: null,
          perspective: null
        }];
    const openingMix = resolveOpeningMix(opening);
    for (const event of events.sort((a, b) => a.sequence - b.sequence)) {
      this.opening.observedAudioSequence = Math.max(this.opening.observedAudioSequence, event.sequence);
      if (!event.cueId) continue;
      this.playCue(event.cueId, {
        intensity: event.intensity ?? (event.cueId.endsWith('.break') ? 1 : 0.72),
        reason: event.reason,
        soundscapeId: event.soundscapeId,
        perspective: event.perspective,
        openingPhase: opening?.phase ?? 'released',
        muffleAtPlay: openingMix.muffle
      });
    }
  }

  collectWorldEvents(game) {
    for (const event of game?.world?.events ?? []) {
      if (!event || this.seenWorldEvents.has(event)) continue;
      this.seenWorldEvents.add(event);
      this.translateWorldEvent(game, event);
    }
  }

  translateWorldEvent(game, event) {
    const payload = event.payload ?? {};
    if (event.type === EventType.DAMAGE_APPLIED) {
      if (payload.target === game.dragonId) {
        this.emit(AudioEventType.PLAYER_HIT, {
          intensity: damageIntensity(payload.amount),
          amount: payload.amount,
          heavy: damageIntensity(payload.amount) >= 0.62,
          source: payload.source,
          damageType: payload.damageType
        });
      } else if (payload.source === game.dragonId) {
        this.emit(AudioEventType.COMBAT_ENEMY_HIT, {
          cueId: game.actors?.find((actor) => actor.id === payload.target)?.creatureRecipe?.gameplay?.audioCueIds?.receivedHit, intensity: damageIntensity(payload.amount),
          target: payload.target,
          killed: payload.killed === true,
          damageType: payload.damageType
        });
      }
      return;
    }

    if (event.type === EventType.SMOKE_EMITTED && payload.source === game.dragonId) {
      this.emit(AudioEventType.PLAYER_SMOKE_EXHALE, {
        intensity: clamp01((payload.radius ?? 0.4) / 1.2),
        puffCount: payload.puffCount,
        sourceKind: payload.sourceKind
      });
      return;
    }

    if (event.type === EventType.LUNGE_TRIGGERED && payload.source === game.dragonId) {
      this.emit(AudioEventType.PLAYER_ACTION_LUNGE, { intensity: 0.76 });
    }
  }

  collectStateTransitions(state) {
    const game = state?.game;
    const player = findAudioPlayer(game);
    const paused = state?.paused === true;
    if (paused !== this.lastPauseState) this.emit(AudioEventType.UI_PAUSE, { paused, intensity: paused ? 0.48 : 0.32 });
    this.lastPauseState = paused;
    if (paused) {
      this.nearestEnemy = null;
      return;
    }
    const actionState = player?.wyvernProjection?.actionState;
    const currentActionId = actionState?.active ? actionState.actionId : null;
    if (currentActionId && currentActionId !== this.lastActionId) {
      const audioEvent = resolveActionAudioEvent(currentActionId);
      if (audioEvent && audioEvent !== AudioEventType.PLAYER_ACTION_LUNGE) {
        this.emit(audioEvent, { actionId: currentActionId, intensity: 0.62 });
      }
    }
    this.lastActionId = currentActionId;

    const bodyState = buildBodyStateProjection(game, state?.time ?? game?.renderTime ?? 0);
    if (bodyState.stamina.pressure >= 0.72 && this.staminaLowArmed) {
      this.emit(AudioEventType.PLAYER_STAMINA_LOW, { intensity: bodyState.stamina.pressure });
      this.staminaLowArmed = false;
    }
    if (bodyState.stamina.pressure < 0.42) this.staminaLowArmed = true;

    this.collectEnemyPressure(game, player);
  }

  collectEnemyPressure(game, player) {
    const nearest = findNearestEnemy(game, player);
    this.nearestEnemy = nearest ? {
      id: nearest.actor.id,
      type: nearest.actor.type,
      distance: Number(nearest.distance.toFixed(2)),
      intensity: Number(proximityIntensity(nearest.distance).toFixed(3))
    } : null;
    if (nearest && nearest.distance <= AUDIO_TUNING.proximity.warningRangeTiles) {
      const cooldown = AUDIO_TUNING.proximity.repeatCooldownMs;
      if (this.timeMs - this.nearEnemyLastAtMs >= cooldown) {
        this.nearEnemyLastAtMs = this.timeMs;
        this.emit(AudioEventType.ENEMY_NEAR, {
          cueId: nearest.actor.creatureRecipe?.gameplay?.audioCueIds?.proximity, actorId: nearest.actor.id,
          actorType: nearest.actor.type,
          distance: nearest.distance,
          intensity: proximityIntensity(nearest.distance)
        });
      }
    }

    for (const actor of game?.actors ?? []) {
      const ai = actor.enemyBehaviour;
      if (!actor.alive || ai?.attackPhase !== 'windup' || ai.pendingAttackTargetId !== game.dragonId) continue;
      const key = `${actor.id}:${ai.activeAttackProfileId ?? 'attack'}`;
      const lastAt = this.attackWarningKeys.get(key) ?? -Infinity;
      if (this.timeMs - lastAt >= AUDIO_TUNING.proximity.attackWarningCooldownMs) {
        this.attackWarningKeys.set(key, this.timeMs);
        this.emit(AudioEventType.ENEMY_ATTACK_WARNING, {
          cueId: actor.creatureRecipe?.gameplay?.audioCueIds?.attackWarning, actorId: actor.id,
          actorType: actor.type,
          profileId: ai.activeAttackProfileId,
          intensity: 0.82
        });
      }
    }
  }

  processQueuedEvents(paused = false) {
    for (const event of this.queue.drain()) {
      if (paused && event.type !== AudioEventType.UI_PAUSE) {
        this.suppressed.paused += 1;
        continue;
      }
      this.playEvent(event.type, event.payload ?? {});
    }
  }

  playEvent(type, payload = {}) {
    const cueId = resolveCueId(type, payload);
    if (!cueId) return false;
    return this.playCue(cueId, payload);
  }

  playCue(cueId, payload = {}) {
    const cue = getSoundCue(cueId);
    if (!cue || !this.enabled) {
      this.suppressed.disabled += 1;
      return false;
    }
    const now = this.timeMs;
    const lastAt = this.lastCueTimes.get(cue.id) ?? -Infinity;
    if (now - lastAt < cue.cooldownMs) {
      this.suppressed.cooldown += 1;
      return false;
    }
    const voices = this.activeVoices.get(cue.id) ?? [];
    if (voices.length >= cue.maxVoices) {
      this.suppressed.maxVoices += 1;
      return false;
    }
    const sequence = this.playbackSequence;
    this.playbackSequence += 1;
    const voice = this.startOneShot(cue, payload, sequence);
    if (!voice) return false;
    this.lastCueTimes.set(cue.id, now);
    this.recordRecent(this.recentCues, {
      cueId: cue.id,
      bus: cue.bus,
      source: voice.source,
      file: voice.file ?? null,
      pitch: rounded(voice.pitch ?? 1),
      durationMs: Math.round(voice.durationMs ?? proceduralDuration(cue)),
      intensity: Number((payload.intensity ?? 1).toFixed?.(3) ?? payload.intensity ?? 1),
      muffleAtPlay: rounded(payload.muffleAtPlay ?? this.pressure.muffleIntensity),
      reason: payload.reason ?? null,
      soundscapeId: payload.soundscapeId ?? null,
      perspective: payload.perspective ?? null,
      openingPhase: payload.openingPhase ?? null,
      atMs: Math.round(now)
    }, 20);
    voices.push(voice);
    this.activeVoices.set(cue.id, voices);
    return true;
  }

  ensureLoops(paused = false) {
    for (const cueId of LOOP_CUE_IDS) {
      if (!this.loopVoices.has(cueId)) this.loopVoices.set(cueId, createLoopState(cueId));
      const loop = this.loopVoices.get(cueId);
      if (syncLoopSuspension(loop, paused && isPlayerBodyLoopCue(cueId))) continue;
      if (!loop.voice && this.bus.context && this.unlocked) loop.voice = this.startLoopVoice(getSoundCue(cueId), loop.targetGain);
    }
  }

  updatePressureLoops(state) {
    const bodyState = buildBodyStateProjection(state?.game, state?.time ?? state?.game?.renderTime ?? 0);
    const muffleProfile = AUDIO_TUNING.bodyState.muffle;
    const muffleIntensity = clamp01(
      bodyState.health.pressure * muffleProfile.healthWeight
      + bodyState.health.hitPulse * muffleProfile.hitPulseWeight
    );
    const breathProfile = AUDIO_TUNING.bodyState.breath;
    const breathStrain = clamp01(
      bodyState.stamina.pressure * breathProfile.staminaWeight
      + bodyState.health.pressure * breathProfile.healthWeight
      + bodyState.stamina.breathPulse * breathProfile.pulseWeight
    );
    const heartProfile = AUDIO_TUNING.bodyState.heartbeat;
    const heartbeat = clamp01(
      (bodyState.health.pressure - heartProfile.startsAtPressure) / Math.max(0.001, 1 - heartProfile.startsAtPressure)
      + bodyState.health.hitPulse * heartProfile.hitPulseBoost
    );
    const openingMix = resolveOpeningMix(state?.opening);
    const bodyLoopScale = state?.paused === true ? 0 : 1;

    this.pressure = {
      healthPressure: rounded(bodyState.health.pressure),
      staminaPressure: rounded(bodyState.stamina.pressure),
      hitPulse: rounded(bodyState.health.hitPulse),
      muffleIntensity: rounded(Math.max(muffleIntensity, openingMix.muffle)),
      breathStrain: rounded(breathStrain),
      heartbeat: rounded(Math.max(heartbeat, openingMix.heartbeat))
    };
    this.bus.setMuffleIntensity(this.pressure.muffleIntensity);

    this.setLoopGain('ambience.forest_night', getSoundCue('ambience.forest_night').volume * (1 - bodyState.health.pressure * 0.24) * openingMix.ambience);
    this.setLoopGain('player.breath.calm', breathProfile.calmBaseGain * (1 - breathStrain * breathProfile.calmPressureDuck) * openingMix.breath * bodyLoopScale);
    this.setLoopGain('player.breath.strained', breathProfile.strainedBaseGain * breathStrain * bodyLoopScale);
    this.setLoopGain('player.heartbeat', heartProfile.baseGain * Math.max(heartbeat, openingMix.heartbeat) * bodyLoopScale);
  }

  setLoopGain(cueId, value) {
    const loop = this.loopVoices.get(cueId) ?? createLoopState(cueId);
    loop.targetGain = Math.max(0, Number(value) || 0);
    this.loopVoices.set(cueId, loop);
    if (loop.voice?.gain?.gain && this.bus.context) {
      setAudioParam(loop.voice.gain.gain, this.bus.context.currentTime, loop.targetGain, 0.08);
    }
  }

  startLoopVoice(cue, initialGain = 0) {
    if (!cue || !this.bus.context) return null;
    const gain = this.bus.createVoiceGain(cue.bus, 0);
    if (!gain) return null;
    setAudioParam(gain.gain, this.bus.context.currentTime, initialGain, 0.08);
    const voice = cue.source === 'file'
      ? startDecodedFileVoice(this, cue, gain, 1, 0, true)
      : buildProceduralLoop(this.bus.context, cue, gain);
    return voice ? {
      gain,
      nodes: voice.nodes,
      source: voice.source,
      file: voice.file ?? null,
      mode: voice.mode,
      tonal: voice.tonal,
      startedAtMs: this.timeMs
    } : null;
  }

  startOneShot(cue, payload, sequence = 0) {
    const pitch = randomPitch(cue, payload, sequence);
    if (!this.bus.context || !this.unlocked) {
      const durationMs = proceduralDuration(cue);
      return {
        headless: true,
        source: 'headless',
        pitch,
        durationMs,
        endsAtMs: this.timeMs + durationMs,
        startedAtMs: this.timeMs
      };
    }
    const gain = this.bus.createVoiceGain(cue.bus, 0);
    if (!gain) return null;
    const intensity = clamp01(payload.intensity ?? 1);
    const volume = cue.volume * (0.54 + intensity * 0.46);
    setAudioParam(gain.gain, this.bus.context.currentTime, volume, 0.012);
    const voice = cue.source === 'file'
      ? startDecodedFileVoice(this, cue, gain, pitch, sequence)
      : buildProceduralOneShot(this.bus.context, cue, gain, pitch);
    if (!voice) return null;
    return {
      gain,
      nodes: voice.nodes,
      source: voice.source ?? cue.source,
      file: voice.file ?? null,
      pitch,
      durationMs: voice.durationMs,
      startedAtMs: this.timeMs,
      endsAtMs: this.timeMs + voice.durationMs
    };
  }

  recordPlaybackError(cue, file, reason) {
    const key = `${cue.id}:${file ?? 'missing'}:${reason}`;
    if (this.reportedErrorKeys.has(key)) return;
    this.reportedErrorKeys.add(key);
    const error = {
      cueId: cue.id,
      file,
      reason,
      atMs: Math.round(this.timeMs)
    };
    this.recordRecent(this.recentErrors, error);
    console.error(`[BSB audio] ${cue.id} blocked: ${file ?? 'no file'} (${reason})`);
  }

  cleanupVoices() {
    for (const [cueId, voices] of this.activeVoices.entries()) {
      const active = voices.filter((voice) => voice.endsAtMs == null || voice.endsAtMs > this.timeMs);
      if (active.length) this.activeVoices.set(cueId, active);
      else this.activeVoices.delete(cueId);
    }
  }

  getDebugState() {
    return {
      contract: this.contract,
      enabled: this.enabled,
      available: this.bus.available,
      unlocked: this.unlocked,
      pressure: { ...this.pressure },
      nearestEnemy: this.nearestEnemy,
      opening: { ...this.opening },
      lightning: this.lightning.snapshot(),
      loops: Object.fromEntries([...this.loopVoices.entries()].map(([cueId, loop]) => [
        cueId,
        {
          targetGain: rounded(loop.targetGain),
          active: loopVoiceIsActive(loop, !!this.bus.context),
          suspended: loop.suspended === true,
          source: loop.voice?.source ?? getSoundCue(cueId)?.source ?? null,
          file: loop.voice?.file ?? getSoundCue(cueId)?.files?.[0] ?? null,
          mode: loop.voice?.mode ?? getSoundCue(cueId)?.procedural?.type ?? null,
          tonal: loop.voice?.tonal ?? false
        }
      ])),
      recentEvents: [...this.recentEvents],
      recentCues: [...this.recentCues],
      recentErrors: [...this.recentErrors],
      assets: this.assets.snapshot(),
      suppressed: { ...this.suppressed },
      pauseMix: {
        active: this.bus.paused,
        mode: this.bus.tuning.pause?.mode ?? null
      },
      mix: this.bus.snapshot().userMix,
      buses: this.bus.snapshot().buses
    };
  }

  recordRecent(target, value, limit = 12) {
    target.push(value);
    while (target.length > limit) target.shift();
  }
}

function resolveCueId(type, payload) {
  if (type === AudioEventType.PLAYER_HIT) return payload.heavy ? 'player.hit.heavy' : 'player.hit.light';
  return payload?.cueId ?? EVENT_CUES[type] ?? null;
}

function proximityIntensity(distance) {
  const range = AUDIO_TUNING.proximity.warningRangeTiles;
  return clamp01(1 - Math.max(0, distance) / range);
}
