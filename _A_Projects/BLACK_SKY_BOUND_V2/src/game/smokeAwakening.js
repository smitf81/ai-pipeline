import { consumeInputActionPressed, getActiveInputLabels, InputActionId } from '../data/inputActions.js';
import {
  SMOKE_AWAKENING,
  SmokeAwakeningCueId,
  SmokeAwakeningPhase
} from '../data/smokeAwakening.js';

export function createSmokeAwakeningState(options = {}) {
  const enabled = options.enabled === true;
  return {
    contract: SMOKE_AWAKENING.contract,
    classification: SMOKE_AWAKENING.classification,
    enabled,
    source: options.source ?? (enabled ? 'level_transition' : 'not_requested'),
    fromMapId: options.fromMapId ?? null,
    mapId: options.mapId ?? null,
    phase: enabled ? SmokeAwakeningPhase.IMPACT : SmokeAwakeningPhase.INACTIVE,
    elapsedReal: 0,
    phaseElapsedReal: 0,
    acceptedInputCount: 0,
    requiredInputCount: SMOKE_AWAKENING.requiredExhaleEdges,
    promptVisible: false,
    inputCooldownRemaining: 0,
    impactPulse: enabled ? 1 : 0,
    exhalePulse: 0,
    lastInputLabel: null,
    exhaleHistory: [],
    anchor: {
      worldX: finite(options.worldX, 0),
      worldY: finite(options.worldY, 0),
      rotation: finite(options.rotation, 0)
    },
    unlockApplied: false,
    radialSmokeEmitted: false,
    released: !enabled,
    releasedAtRealSeconds: null,
    audio: createAudioState(enabled),
    diagnostics: {
      acceptedInputEdges: 0,
      rejectedBeforePrompt: 0,
      rejectedDuringCooldown: 0,
      automaticPhaseTransitions: 0,
      simulationGateTicks: 0,
      releaseCount: 0
    }
  };
}

export function updateSmokeAwakening({ scene, input, realDt = 0 }) {
  if (!scene || scene.released) return result(false, false, false, false);
  const delta = Math.max(0, Number(realDt) || 0);
  scene.elapsedReal += delta;
  scene.inputCooldownRemaining = Math.max(0, scene.inputCooldownRemaining - delta);
  scene.impactPulse = decay(scene.impactPulse, delta, 1.1);
  scene.exhalePulse = decay(scene.exhalePulse, delta, SMOKE_AWAKENING.timing.pulseSeconds);
  scene.diagnostics.simulationGateTicks += 1;

  if (scene.phase !== SmokeAwakeningPhase.EXHALE) {
    const releasedNow = advanceAutomaticPhases(scene, delta);
    return result(!releasedNow, false, false, releasedNow);
  }

  scene.phaseElapsedReal += delta;
  scene.promptVisible = scene.phaseElapsedReal >= SMOKE_AWAKENING.timing.promptDelaySeconds;
  if (!consumeInputActionPressed(input, InputActionId.SMOKE)) return result(true, false, false, false);
  if (!scene.promptVisible) {
    scene.diagnostics.rejectedBeforePrompt += 1;
    return result(true, false, false, false);
  }
  if (scene.inputCooldownRemaining > 0) {
    scene.diagnostics.rejectedDuringCooldown += 1;
    return result(true, false, false, false);
  }

  const finalExhaleNow = acceptExhale(scene, input);
  return result(true, true, finalExhaleNow, false);
}

export function isSmokeAwakeningBlockingGameplay(scene) {
  return scene?.released === false;
}

function acceptExhale(scene, input) {
  scene.acceptedInputCount = Math.min(scene.requiredInputCount, scene.acceptedInputCount + 1);
  scene.lastInputLabel = getActiveInputLabels(input, InputActionId.SMOKE)[0] ?? 'RMB';
  scene.exhaleHistory.push({
    stage: scene.acceptedInputCount,
    label: scene.lastInputLabel,
    atRealSeconds: round3(scene.elapsedReal)
  });
  scene.inputCooldownRemaining = SMOKE_AWAKENING.timing.inputCooldownSeconds;
  scene.exhalePulse = 1;
  scene.diagnostics.acceptedInputEdges += 1;
  queueAudio(scene, scene.acceptedInputCount < scene.requiredInputCount
    ? SmokeAwakeningCueId.COUGH
    : SmokeAwakeningCueId.EXHALE, `exhale_stage_${scene.acceptedInputCount}`, scene.acceptedInputCount / scene.requiredInputCount);
  if (scene.acceptedInputCount < scene.requiredInputCount) return false;
  scene.phase = SmokeAwakeningPhase.CLEARING;
  scene.phaseElapsedReal = 0;
  scene.promptVisible = false;
  return true;
}

function advanceAutomaticPhases(scene, delta) {
  let remaining = delta;
  while (remaining >= 0 && !scene.released && scene.phase !== SmokeAwakeningPhase.EXHALE) {
    const duration = phaseDuration(scene.phase);
    const available = Math.max(0, duration - scene.phaseElapsedReal);
    const consumed = Math.min(remaining, available);
    scene.phaseElapsedReal += consumed;
    remaining -= consumed;
    if (scene.phaseElapsedReal + 0.000001 < duration) return false;
    advancePhase(scene);
    if (remaining <= 0 || scene.phase === SmokeAwakeningPhase.EXHALE) return scene.released;
  }
  return scene.released;
}

function advancePhase(scene) {
  scene.phaseElapsedReal = 0;
  scene.diagnostics.automaticPhaseTransitions += 1;
  if (scene.phase === SmokeAwakeningPhase.IMPACT) {
    scene.phase = SmokeAwakeningPhase.SCATTER;
    queueAudio(scene, SmokeAwakeningCueId.DEBRIS, 'canopy_and_stone_cascade', 0.86);
    queueAudio(scene, SmokeAwakeningCueId.RAIDER_SHOUT, 'raiders_scatter_from_offscreen_impact', 0.72);
    return;
  }
  if (scene.phase === SmokeAwakeningPhase.SCATTER) {
    scene.phase = SmokeAwakeningPhase.SMOKE_ROLL;
    queueAudio(scene, SmokeAwakeningCueId.MAMA_ROAR, 'mama_close_offscreen_roar', 1);
    return;
  }
  if (scene.phase === SmokeAwakeningPhase.SMOKE_ROLL) {
    scene.phase = SmokeAwakeningPhase.EXHALE;
    return;
  }
  if (scene.phase === SmokeAwakeningPhase.CLEARING) releaseScene(scene);
}

function releaseScene(scene) {
  scene.phase = SmokeAwakeningPhase.RELEASED;
  scene.phaseElapsedReal = 0;
  scene.released = true;
  scene.releasedAtRealSeconds = scene.elapsedReal;
  scene.impactPulse = 0;
  scene.exhalePulse = 0;
  scene.diagnostics.releaseCount += 1;
}

function phaseDuration(phase) {
  if (phase === SmokeAwakeningPhase.IMPACT) return SMOKE_AWAKENING.timing.impactSeconds;
  if (phase === SmokeAwakeningPhase.SCATTER) return SMOKE_AWAKENING.timing.scatterSeconds;
  if (phase === SmokeAwakeningPhase.SMOKE_ROLL) return SMOKE_AWAKENING.timing.smokeRollSeconds;
  if (phase === SmokeAwakeningPhase.CLEARING) return SMOKE_AWAKENING.timing.clearingSeconds;
  return 0;
}

function createAudioState(enabled) {
  const holder = { elapsedReal: 0, audio: { sequence: 0, cueId: null, reason: null, events: [] } };
  if (enabled) queueAudio(holder, SmokeAwakeningCueId.IMPACT, 'mama_lands_offscreen', 1);
  return holder.audio;
}

function queueAudio(scene, cueId, reason, intensity) {
  const sequence = scene.audio.sequence + 1;
  const event = { sequence, cueId, reason, intensity, atRealSeconds: round3(scene.elapsedReal) };
  scene.audio = { sequence, cueId, reason, events: [...scene.audio.events, event].slice(-20) };
}

function result(blocked, accepted, finalExhaleNow, releasedNow) {
  return { blocked, accepted, finalExhaleNow, releasedNow };
}

function decay(value, delta, seconds) {
  return Math.max(0, (Number(value) || 0) - delta / Math.max(0.001, seconds));
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function round3(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}
