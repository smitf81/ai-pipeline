import {
  getActiveInputLabels,
  getInputAction,
  InputActionId,
  resolveMovementInput,
  wasInputActionPressed
} from '../data/inputActions.js';
import {
  OPENING_SEQUENCE,
  OpeningAudioCueId,
  OpeningSequencePhase
} from '../data/openingSequence.js';

export function createOpeningSequenceState(options = {}) {
  const enabled = options.enabled !== false;
  const required = OPENING_SEQUENCE.requiredMovementEdges;
  return {
    contract: OPENING_SEQUENCE.contract,
    classification: OPENING_SEQUENCE.classification,
    enabled,
    source: options.source ?? (enabled ? 'fresh_launch' : 'explicit_skip'),
    phase: enabled ? OpeningSequencePhase.INSIDE_EGG : OpeningSequencePhase.RELEASED,
    elapsedReal: 0,
    phaseElapsedReal: 0,
    acceptedInputCount: enabled ? 0 : required,
    requiredInputCount: required,
    crackStage: enabled ? 0 : required,
    strainProgress: enabled ? 0 : 1,
    openingProgress: enabled ? 0 : 1,
    emergenceProgress: enabled ? 0 : 1,
    settleProgress: enabled ? 0 : 1,
    egressProgress: enabled ? 0 : 1,
    promptVisible: false,
    inputCooldownRemaining: 0,
    rockPulse: 0,
    movementPulse: 0,
    lightPulse: 0,
    lastInputLabel: null,
    lastMovementDirection: { x: 0, y: -1 },
    movementHistory: [],
    shellBreakAtRealSeconds: null,
    egg: createEggAnchor(options),
    released: !enabled,
    releasedAtRealSeconds: enabled ? null : 0,
    audio: {
      sequence: 0,
      cueId: null,
      reason: null,
      events: [],
      soundscapeFired: [],
      emitters: createOpeningAudioEmitters(options)
    },
    diagnostics: {
      acceptedInputEdges: enabled ? 0 : required,
      rejectedBeforePrompt: 0,
      rejectedDuringCooldown: 0,
      automaticPhaseTransitions: enabled ? 0 : 3,
      simulationGateTicks: 0,
      releaseCount: enabled ? 0 : 1
    }
  };
}

export function updateOpeningSequence({ opening, input, realDt = 0 }) {
  if (!opening || opening.released) return { blocked: false, accepted: false, releasedNow: false };
  const delta = Math.max(0, Number(realDt) || 0);
  opening.elapsedReal += delta;
  opening.inputCooldownRemaining = Math.max(0, opening.inputCooldownRemaining - delta);
  opening.rockPulse = decayPulse(opening.rockPulse, delta, OPENING_SEQUENCE.timing.rockPulseSeconds);
  opening.movementPulse = decayPulse(opening.movementPulse, delta, OPENING_SEQUENCE.timing.movementPulseSeconds);
  opening.lightPulse = decayPulse(opening.lightPulse, delta, OPENING_SEQUENCE.timing.lightPulseSeconds);
  opening.diagnostics.simulationGateTicks += 1;

  if (isAutomaticPhase(opening.phase)) {
    const releasedNow = advanceAutomaticPhases(opening, delta);
    return finishOpeningUpdate(opening, { blocked: !releasedNow, accepted: false, releasedNow });
  }

  opening.phaseElapsedReal += delta;
  opening.promptVisible = opening.elapsedReal >= OPENING_SEQUENCE.timing.promptDelaySeconds;
  if (!wasInputActionPressed(input, InputActionId.MOVE)) {
    return finishOpeningUpdate(opening, { blocked: true, accepted: false, releasedNow: false });
  }
  if (!opening.promptVisible) {
    opening.diagnostics.rejectedBeforePrompt += 1;
    return finishOpeningUpdate(opening, { blocked: true, accepted: false, releasedNow: false });
  }
  if (opening.inputCooldownRemaining > 0) {
    opening.diagnostics.rejectedDuringCooldown += 1;
    return finishOpeningUpdate(opening, { blocked: true, accepted: false, releasedNow: false });
  }

  acceptMovementEdge(opening, input);
  return finishOpeningUpdate(opening, { blocked: true, accepted: true, releasedNow: false });
}

export function releaseOpeningSequence(opening) {
  if (!opening || opening.released) return false;
  opening.phase = OpeningSequencePhase.RELEASED;
  opening.phaseElapsedReal = 0;
  opening.openingProgress = 1;
  opening.emergenceProgress = 1;
  opening.settleProgress = 1;
  opening.egressProgress = 1;
  opening.promptVisible = false;
  opening.rockPulse = 0;
  opening.movementPulse = 0;
  opening.lightPulse = 0;
  opening.released = true;
  opening.releasedAtRealSeconds = opening.elapsedReal;
  opening.diagnostics.releaseCount += 1;
  return true;
}

export function isOpeningSequenceBlockingGameplay(opening) {
  return !!opening && opening.released !== true;
}

function acceptMovementEdge(opening, input) {
  opening.acceptedInputCount = Math.min(opening.requiredInputCount, opening.acceptedInputCount + 1);
  opening.crackStage = opening.acceptedInputCount;
  opening.strainProgress = opening.acceptedInputCount / Math.max(1, opening.requiredInputCount);
  opening.lastInputLabel = getActiveInputLabels(input, InputActionId.MOVE)[0]
    ?? getInputAction(InputActionId.MOVE)?.label
    ?? InputActionId.MOVE;
  opening.lastMovementDirection = normalizeDirection(resolveMovementInput(input), opening.lastMovementDirection);
  opening.movementHistory.push({
    stage: opening.acceptedInputCount,
    label: opening.lastInputLabel,
    direction: { ...opening.lastMovementDirection },
    atRealSeconds: round3(opening.elapsedReal)
  });
  while (opening.movementHistory.length > 6) opening.movementHistory.shift();
  opening.inputCooldownRemaining = OPENING_SEQUENCE.timing.inputCooldownSeconds;
  opening.rockPulse = 1;
  opening.movementPulse = 1;
  opening.lightPulse = 1;
  opening.phaseElapsedReal = 0;
  opening.diagnostics.acceptedInputEdges += 1;

  if (opening.acceptedInputCount >= opening.requiredInputCount) {
    opening.phase = OpeningSequencePhase.OPENING;
    opening.promptVisible = false;
    opening.shellBreakAtRealSeconds = opening.elapsedReal;
    queueOpeningAudio(opening, OpeningAudioCueId.BREAK, 'shell_crown_released');
    return;
  }
  opening.phase = OpeningSequencePhase.CRACKING;
  queueOpeningAudio(
    opening,
    opening.acceptedInputCount === 1 ? OpeningAudioCueId.ROCK : OpeningAudioCueId.CRACK,
    `crack_stage_${opening.acceptedInputCount}`
  );
}

function advanceAutomaticPhases(opening, delta) {
  let remaining = delta;
  while (remaining >= 0 && !opening.released) {
    const duration = phaseDuration(opening.phase);
    const available = Math.max(0, duration - opening.phaseElapsedReal);
    const consumed = Math.min(remaining, available);
    opening.phaseElapsedReal += consumed;
    remaining -= consumed;
    syncAutomaticProgress(opening);
    if (opening.phaseElapsedReal + 0.000001 < duration) return false;
    if (!advanceAutomaticPhase(opening)) return true;
    if (remaining <= 0) return false;
  }
  return opening.released;
}

function advanceAutomaticPhase(opening) {
  opening.phaseElapsedReal = 0;
  opening.diagnostics.automaticPhaseTransitions += 1;
  if (opening.phase === OpeningSequencePhase.OPENING) {
    opening.openingProgress = 1;
    opening.phase = OpeningSequencePhase.EMERGING;
    return true;
  }
  if (opening.phase === OpeningSequencePhase.EMERGING) {
    opening.emergenceProgress = 1;
    opening.egressProgress = 1;
    opening.phase = OpeningSequencePhase.SETTLING;
    return true;
  }
  if (opening.phase === OpeningSequencePhase.SETTLING) {
    return !releaseOpeningSequence(opening);
  }
  return false;
}

function syncAutomaticProgress(opening) {
  if (opening.phase === OpeningSequencePhase.OPENING) {
    opening.openingProgress = clamp01(opening.phaseElapsedReal / OPENING_SEQUENCE.timing.openingSeconds);
    return;
  }
  if (opening.phase === OpeningSequencePhase.EMERGING) {
    opening.emergenceProgress = clamp01(opening.phaseElapsedReal / OPENING_SEQUENCE.timing.emergenceSeconds);
    opening.egressProgress = smoothstep(0.14, 0.94, opening.emergenceProgress);
    return;
  }
  if (opening.phase === OpeningSequencePhase.SETTLING) {
    opening.settleProgress = clamp01(opening.phaseElapsedReal / OPENING_SEQUENCE.timing.settlingSeconds);
    opening.egressProgress = 1;
  }
}

function phaseDuration(phase) {
  if (phase === OpeningSequencePhase.OPENING) return OPENING_SEQUENCE.timing.openingSeconds;
  if (phase === OpeningSequencePhase.EMERGING) return OPENING_SEQUENCE.timing.emergenceSeconds;
  if (phase === OpeningSequencePhase.SETTLING) return OPENING_SEQUENCE.timing.settlingSeconds;
  return 0;
}

function isAutomaticPhase(phase) {
  return phase === OpeningSequencePhase.OPENING
    || phase === OpeningSequencePhase.EMERGING
    || phase === OpeningSequencePhase.SETTLING;
}

function createEggAnchor(options) {
  const exitDistanceTiles = finite(options.exitDistanceTiles, OPENING_SEQUENCE.visual.exitDistanceTiles);
  const rotation = finite(options.eggRotation, 0);
  return {
    mapId: options.eggMapId ?? null,
    tileX: finite(options.eggTileX, 0),
    tileY: finite(options.eggTileY, 0),
    worldX: finite(options.eggWorldX, 0),
    worldY: finite(options.eggWorldY, 0),
    rotation,
    exitAngle: finite(options.eggExitAngle, rotation),
    exitDistanceTiles,
    exitDistanceWorld: finite(options.exitDistanceWorld, exitDistanceTiles * finite(options.tileSize, 32))
  };
}

function finishOpeningUpdate(opening, result) {
  queueAuthoredOpeningSoundscape(opening);
  return result;
}

function queueAuthoredOpeningSoundscape(opening) {
  const fired = opening.audio.soundscapeFired ?? [];
  for (const sound of OPENING_SEQUENCE.soundscape ?? []) {
    if (fired.includes(sound.id)) continue;
    const anchorTime = resolveSoundAnchorTime(opening, sound.anchor);
    if (anchorTime == null || opening.elapsedReal + 0.000001 < anchorTime + sound.anchor.delaySeconds) continue;
    fired.push(sound.id);
    queueOpeningAudio(opening, sound.cueId, sound.id, {
      intensity: sound.intensity,
      soundscapeId: sound.id,
      perspective: sound.perspective
      ,sourceRef: sound.sourceRef
    });
  }
  opening.audio.soundscapeFired = fired;
}

function resolveSoundAnchorTime(opening, anchor) {
  if (anchor?.kind === 'shell_break') return opening.shellBreakAtRealSeconds;
  if (anchor?.kind === 'movement_edge') {
    return opening.movementHistory.find((entry) => entry.stage === anchor.stage)?.atRealSeconds ?? null;
  }
  return null;
}

function queueOpeningAudio(opening, cueId, reason, options = {}) {
  const sequence = opening.audio.sequence + 1;
  const event = {
    sequence,
    cueId,
    reason,
    intensity: options.intensity ?? null,
    soundscapeId: options.soundscapeId ?? null,
    perspective: options.perspective ?? null,
    sourceRef: options.sourceRef ?? null,
    atRealSeconds: round3(opening.elapsedReal)
  };
  const events = [...(opening.audio.events ?? []), event];
  while (events.length > 24) events.shift();
  opening.audio = {
    ...opening.audio,
    sequence,
    cueId,
    reason,
    events
  };
}

function createOpeningAudioEmitters(options) {
  const x = finite(options.eggWorldX, 0);
  const y = finite(options.eggWorldY, 0);
  return {
    'opening-storm': {
      sourceRef: { ownerKind: 'openingEvent', ownerId: 'opening-storm', emitterId: 'thunder' },
      profileId: 'storm_spatial_v1', emitterId: 'thunder', x: x - 36, y: y - 24, anchorHeightMeters: 7
    },
    'opening-mama-answer': {
      sourceRef: { ownerKind: 'openingEvent', ownerId: 'opening-mama-answer', emitterId: 'voice' },
      profileId: 'mama_voice_spatial_v1', emitterId: 'voice', x: x + 56, y: y - 42, anchorHeightMeters: 9.2
    }
  };
}

function normalizeDirection(direction, fallback) {
  const x = Number(direction?.x) || 0;
  const y = Number(direction?.y) || 0;
  const length = Math.hypot(x, y);
  if (length <= 0.001) return { ...(fallback ?? { x: 0, y: -1 }) };
  return { x: x / length, y: y / length };
}

function decayPulse(value, delta, duration) {
  return Math.max(0, (Number(value) || 0) - delta / Math.max(0.001, duration));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / Math.max(0.001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function round3(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}
