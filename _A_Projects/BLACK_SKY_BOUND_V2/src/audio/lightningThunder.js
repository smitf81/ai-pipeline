import { SceneLightSourceKind } from '../data/sceneLights.js';
import { AudioSpatialProfileId, resolveAudioEmitter } from '../data/audio/spatialAudioProfiles.js';

const THUNDER_EMITTER_PROFILE = resolveAudioEmitter({
  profileId: AudioSpatialProfileId.STORM,
  emitterId: 'thunder',
  anchorHeightMeters: 7,
  transmissionClass: 'exterior_world'
});

export function createLightningThunderBridge() {
  return new LightningThunderBridge();
}

class LightningThunderBridge {
  constructor() {
    this.observedKeys = new Set();
    this.keyOrder = [];
    this.pending = [];
    this.recent = [];
    this.thunderCount = 0;
    this.emitters = new Map();
    this.lastTimeMs = 0;
  }

  collect(game, timeMs) {
    this.lastTimeMs = timeMs;
    const player = findPlayer(game);
    for (const light of game?.lights ?? []) {
      if (light?.sourceKind !== SceneLightSourceKind.LIGHTNING || !light.stormEvent) continue;
      const event = light.stormEvent;
      const key = `${event.eventIndex}:${event.eventStart}:${event.sourceEventId ?? 'scheduled'}`;
      if (this.observedKeys.has(key)) continue;
      this.rememberKey(key);
      const distanceTiles = player ? Math.hypot((light.x ?? 0) - player.x, (light.y ?? 0) - player.y) : 24;
      const thunder = event.thunder ?? {};
      const delay = thunder.delay ?? {};
      const delayMs = Math.round(finite(delay.baseMs, 520)
        + Math.min(finite(delay.maxDistanceMs, 1700), distanceTiles * finite(delay.perTileMs, 24)));
      const intensityTuning = thunder.intensity ?? {};
      const pending = {
        key,
        dueAtMs: timeMs + delayMs,
        flashAtMs: timeMs,
        delayMs,
        distanceTiles: rounded(distanceTiles),
        intensity: clamp01(finite(intensityTuning.base, 0.62)
          + (light.intensity ?? 0.6) * finite(intensityTuning.flashWeight, 0.38)),
        cameraShake: resolveCameraShake(thunder.cameraShake),
        sourceEventId: event.sourceEventId ?? null,
        sourceRef: { ownerKind: 'worldEvent', ownerId: `lightning:${key}`, emitterId: 'thunder' }
      };
      this.emitters.set(pending.sourceRef.ownerId, {
        sourceRef: pending.sourceRef,
        profileId: 'storm_spatial_v1',
        emitterId: 'thunder',
        x: Number(light.x) || 0,
        y: Number(light.y) || 0,
        heightMeters: 7
      });
      this.pending.push(pending);
      this.pending.sort((a, b) => a.dueAtMs - b.dueAtMs);
      while (this.pending.length > 8) this.pending.shift();
      this.recent.push({
        key,
        flashAtMs: Math.round(timeMs),
        thunderDueAtMs: Math.round(pending.dueAtMs),
        delayMs,
        distanceTiles: pending.distanceTiles,
        intensity: pending.intensity,
        cameraShake: pending.cameraShake,
        sourceEventId: pending.sourceEventId,
        firedAtMs: null,
        played: false
      });
      while (this.recent.length > 12) this.recent.shift();
    }
  }

  process(timeMs, muffleIntensity, playCue) {
    this.lastTimeMs = timeMs;
    const ready = this.pending.filter((entry) => entry.dueAtMs <= timeMs);
    this.pending = this.pending.filter((entry) => entry.dueAtMs > timeMs);
    for (const entry of ready) {
      const played = playCue('world.storm.thunder', {
        intensity: entry.intensity,
        reason: 'lightning_flash_delayed_thunder',
        lightningKey: entry.key,
        sourceRef: entry.sourceRef,
        muffleAtPlay: muffleIntensity
      });
      const recent = this.recent.find((candidate) => candidate.key === entry.key);
      if (recent) {
        recent.firedAtMs = Math.round(timeMs);
        recent.played = !!played;
      }
      if (played) this.thunderCount += 1;
    }
  }

  snapshot() {
    return {
      pendingThunder: this.pending.map((entry) => ({
        key: entry.key,
        dueAtMs: Math.round(entry.dueAtMs),
        delayMs: entry.delayMs,
        distanceTiles: entry.distanceTiles,
        sourceEventId: entry.sourceEventId
      })),
      recentStrikes: this.recent.map((entry) => ({ ...entry })),
      thunderCount: this.thunderCount,
      cameraShake: this.activeCameraShake()
    };
  }

  getSpatialEmitters() {
    return [...this.emitters.values()].map((entry) => ({
      sourceRef: entry.sourceRef,
      profile: THUNDER_EMITTER_PROFILE,
      position: { x: entry.x * 0.5, y: entry.heightMeters, z: entry.y * 0.5 },
      forward: { x: 0, y: -1, z: 0 }
    }));
  }

  activeCameraShake() {
    const strike = [...this.recent].reverse().find((entry) => {
      if (!entry.played || entry.firedAtMs == null) return false;
      const elapsedMs = Math.max(0, this.lastTimeMs - entry.firedAtMs);
      return elapsedMs <= entry.cameraShake.durationMs;
    });
    if (!strike) return { active: false, sourcePolicy: 'delayed_thunder_arrival_only' };
    return {
      active: true,
      key: strike.key,
      elapsedMs: Math.max(0, Math.round(this.lastTimeMs - strike.firedAtMs)),
      intensity: strike.intensity,
      ...strike.cameraShake,
      sourcePolicy: 'delayed_thunder_arrival_only'
    };
  }

  rememberKey(key) {
    this.observedKeys.add(key);
    this.keyOrder.push(key);
    while (this.keyOrder.length > 32) this.observedKeys.delete(this.keyOrder.shift());
  }
}

function findPlayer(game) {
  return (game?.actors ?? []).find((actor) => actor.id === game.dragonId)
    ?? (game?.actors ?? []).find((actor) => actor.team === 'player')
    ?? null;
}

function rounded(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(3)) : 0;
}

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function resolveCameraShake(value = {}) {
  return {
    durationMs: Math.max(80, finite(value.durationMs, 720)),
    amplitudeTiles: Math.max(0, finite(value.amplitudeTiles, 0.18)),
    frequencyHz: Math.max(1, finite(value.frequencyHz, 12.5)),
    decayPower: Math.max(0.5, finite(value.decayPower, 2.05))
  };
}

function finite(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}
