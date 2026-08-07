import {
  getInputAction,
  getInputActionPromptLabels,
  InputActionId
} from '../data/inputActions.js';
import {
  OPENING_CRACK_SEGMENTS,
  OPENING_LIGHT_RAYS,
  OPENING_SEQUENCE,
  OPENING_SHELL_FRAGMENTS,
  OPENING_WORLD_SHELL_PIECES,
  OpeningSequencePhase
} from '../data/openingSequence.js';

export function buildOpeningSequenceProjection(state) {
  const opening = state?.opening;
  if (!opening) return null;
  const active = opening.released !== true;
  const openingProgress = clamp01(opening.openingProgress);
  const emergence = clamp01(opening.emergenceProgress);
  const settling = clamp01(opening.settleProgress);
  const darknessOpacity = resolveDarknessOpacity(opening.phase, opening.crackStage, openingProgress);
  const fragmentProgress = resolveFragmentProgress(opening.phase, openingProgress, emergence);
  const shellFragments = fragmentProgress == null
    ? []
    : OPENING_SHELL_FRAGMENTS.map((fragment) => ({ ...fragment, progress: fragmentProgress }));
  const currentMapId = state.map?.id ?? null;
  const eggOnCurrentMap = !opening.egg?.mapId || opening.egg.mapId === currentMapId;
  const eggVisible = opening.enabled !== false && eggOnCurrentMap;
  const reducedMotion = state.playerProfile?.settings?.reducedMotion === true;
  return {
    classification: 'renderer_neutral_embodied_hatch_projection_v2',
    contract: opening.contract ?? OPENING_SEQUENCE.contract,
    source: opening.source ?? 'unknown',
    active,
    screenActive: active && (darknessOpacity > 0.01 || shellFragments.length > 0),
    phase: opening.phase,
    elapsedReal: opening.elapsedReal,
    phaseElapsedReal: opening.phaseElapsedReal,
    acceptedInputCount: opening.acceptedInputCount,
    requiredInputCount: opening.requiredInputCount,
    crackStage: opening.crackStage,
    strainProgress: clamp01(opening.strainProgress),
    openingProgress,
    emergenceProgress: emergence,
    settleProgress: settling,
    egressProgress: clamp01(opening.egressProgress),
    rockPulse: clamp01(opening.rockPulse),
    movementPulse: clamp01(opening.movementPulse),
    lightPulse: clamp01(opening.lightPulse),
    lastMovementDirection: { ...(opening.lastMovementDirection ?? { x: 0, y: -1 }) },
    movementHistory: (opening.movementHistory ?? []).map((entry) => ({
      ...entry,
      direction: { ...entry.direction }
    })),
    released: opening.released === true,
    darknessOpacity,
    moonlightStrength: resolveMoonlightStrength(opening.phase, opening.crackStage, openingProgress),
    shellInteriorOpacity: resolveShellInteriorOpacity(opening.phase, openingProgress),
    prompt: active && isInteractivePhase(opening.phase) && opening.promptVisible
      ? {
          actionId: InputActionId.MOVE,
          title: getInputAction(InputActionId.MOVE)?.label ?? 'MOVE',
          bindings: getInputActionPromptLabels(InputActionId.MOVE),
          lastAcceptedLabel: opening.lastInputLabel
        }
      : null,
    cracks: OPENING_CRACK_SEGMENTS.filter((segment) => segment.stage <= opening.crackStage),
    lightRays: OPENING_LIGHT_RAYS
      .filter((ray) => ray.stage <= opening.crackStage)
      .map((ray) => ({ ...ray, pulse: clamp01(opening.lightPulse) })),
    shellFragments,
    egg: buildEggProjection(opening, {
      currentMapId,
      visible: eggVisible,
      openingProgress,
      emergence,
      settling
    }),
    camera: buildOpeningCameraProjection(opening, reducedMotion),
    settings: { reducedMotion }
  };
}

function buildEggProjection(opening, progress) {
  const egg = opening.egg ?? {};
  const revealOpacity = opening.released
    ? 1
    : opening.phase === OpeningSequencePhase.OPENING
      ? smoothstep(0.12, 0.78, progress.openingProgress)
      : phaseAtLeastEmerging(opening.phase) ? 1 : 0;
  const shellOpenProgress = opening.phase === OpeningSequencePhase.OPENING
    ? smoothstep(0.04, 0.92, progress.openingProgress)
    : phaseAtLeastEmerging(opening.phase) || opening.released ? 1 : 0;
  return {
    classification: 'renderer_neutral_world_space_hatching_egg_v2',
    visible: progress.visible,
    mapId: egg.mapId ?? null,
    worldX: egg.worldX ?? 0,
    worldY: egg.worldY ?? 0,
    rotation: egg.rotation ?? 0,
    radiusX: OPENING_SEQUENCE.visual.eggRadiusWorld.x,
    radiusY: OPENING_SEQUENCE.visual.eggRadiusWorld.y,
    revealOpacity,
    shellOpenProgress,
    emergenceProgress: progress.emergence,
    settleProgress: progress.settling,
    shellPieceCount: OPENING_WORLD_SHELL_PIECES.length,
    shellPieces: OPENING_WORLD_SHELL_PIECES.map((piece) => ({
      ...piece,
      points: piece.points.map((point) => ({ ...point })),
      progress: shellOpenProgress
    }))
  };
}

function buildOpeningCameraProjection(opening, reducedMotion) {
  const phase = opening.phase;
  const openingProgress = smooth01(opening.openingProgress);
  const emergence = smooth01(opening.emergenceProgress);
  const settling = smooth01(opening.settleProgress);
  const zoom = phase === OpeningSequencePhase.OPENING
    ? lerp(OPENING_SEQUENCE.visual.cameraZoom.trapped, OPENING_SEQUENCE.visual.cameraZoom.opening, openingProgress)
    : phase === OpeningSequencePhase.EMERGING
      ? lerp(OPENING_SEQUENCE.visual.cameraZoom.opening, OPENING_SEQUENCE.visual.cameraZoom.emerging, emergence)
      : phase === OpeningSequencePhase.SETTLING
        ? lerp(OPENING_SEQUENCE.visual.cameraZoom.emerging, OPENING_SEQUENCE.visual.cameraZoom.released, settling)
        : phase === OpeningSequencePhase.RELEASED
          ? OPENING_SEQUENCE.visual.cameraZoom.released
          : lerp(OPENING_SEQUENCE.visual.cameraZoom.trapped, 3.94, clamp01(opening.strainProgress) * 0.35);
  const exitDistance = opening.egg?.exitDistanceWorld ?? OPENING_SEQUENCE.visual.exitDistanceTiles * 32;
  const egress = clamp01(opening.egressProgress);
  const rotation = opening.egg?.exitAngle ?? opening.egg?.rotation ?? 0;
  const direction = opening.lastMovementDirection ?? { x: 0, y: -1 };
  const impact = reducedMotion ? 0 : clamp01(opening.movementPulse) * 1.8;
  return {
    zoom,
    anchorWorldX: (opening.egg?.worldX ?? 0) + Math.cos(rotation) * exitDistance * egress * 0.42,
    anchorWorldY: (opening.egg?.worldY ?? 0) + Math.sin(rotation) * exitDistance * egress * 0.42,
    impulseWorldX: direction.x * impact,
    impulseWorldY: direction.y * impact,
    reducedMotion
  };
}

function resolveDarknessOpacity(phase, crackStage, openingProgress) {
  if (phase === OpeningSequencePhase.RELEASED || phase === OpeningSequencePhase.SETTLING || phase === OpeningSequencePhase.EMERGING) return 0;
  if (phase === OpeningSequencePhase.OPENING) return 0.76 * (1 - smoothstep(0.02, 0.92, openingProgress));
  return Math.max(0.74, 0.992 - crackStage * 0.041);
}

function resolveMoonlightStrength(phase, crackStage, openingProgress) {
  if (phase === OpeningSequencePhase.OPENING) return 0.78 + openingProgress * 0.22;
  if (phaseAtLeastEmerging(phase)) return 1;
  return 0.035 + crackStage * 0.135;
}

function resolveShellInteriorOpacity(phase, openingProgress) {
  if (phase === OpeningSequencePhase.OPENING) return 0.88 * (1 - smoothstep(0.08, 0.94, openingProgress));
  if (phaseAtLeastEmerging(phase)) return 0;
  return 0.88;
}

function resolveFragmentProgress(phase, openingProgress, emergence) {
  if (phase === OpeningSequencePhase.OPENING) return openingProgress * 0.82;
  if (phase === OpeningSequencePhase.EMERGING && emergence < 0.14) {
    return 0.82 + smoothstep(0, 0.14, emergence) * 0.18;
  }
  return null;
}

function isInteractivePhase(phase) {
  return phase === OpeningSequencePhase.INSIDE_EGG || phase === OpeningSequencePhase.CRACKING;
}

function phaseAtLeastEmerging(phase) {
  return phase === OpeningSequencePhase.EMERGING
    || phase === OpeningSequencePhase.SETTLING
    || phase === OpeningSequencePhase.RELEASED;
}

function lerp(a, b, t) {
  return a + (b - a) * clamp01(t);
}

function smooth01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function smoothstep(edge0, edge1, value) {
  return smooth01((value - edge0) / Math.max(0.001, edge1 - edge0));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}
