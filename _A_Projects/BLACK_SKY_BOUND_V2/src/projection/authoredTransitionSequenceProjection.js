import { CONFIG } from '../config.js';
import { AuthoredTransitionPhase } from '../game/authoredTransitionSequence.js';

export function buildAuthoredTransitionSequenceProjection(state) {
  const scene = state.authoredTransitionSequence;
  if (!scene?.sequence || scene.failed) return inactiveProjection(scene);
  const sequence = scene.sequence;
  const visible = scene.active || scene.complete;
  const impactDuration = sequence.phases.find((entry) => entry.id === AuthoredTransitionPhase.IMPACT)?.durationSeconds ?? 1;
  const debrisProgress = clamp01(scene.elapsedReal / Math.max(0.1, impactDuration + 0.85));
  const rumble01 = scene.phase === AuthoredTransitionPhase.IMPACT
    ? 1 - clamp01(scene.phaseElapsedReal / sequence.landing.rumble.durationSeconds)
    : 0;
  const shake = sequence.landing.rumble.intensity * 6.4 * rumble01;
  const smokeCoverage = scene.complete ? 1 : scene.smokeCoverage;
  return {
    classification: 'renderer_neutral_authored_transition_sequence_projection',
    active: visible,
    screenActive: visible,
    sequenceId: sequence.id,
    label: sequence.label,
    phase: scene.phase,
    phaseProgress: scene.phaseProgress,
    elapsedReal: scene.elapsedReal,
    actorTracks: scene.actorEntities.map((entry) => ({ actorId: entry.actorId, entityId: entry.entity })),
    landing: {
      worldX: sequence.landing.anchor.x * CONFIG.tileSize,
      worldY: sequence.landing.anchor.y * CONFIG.tileSize,
      direction: sequence.landing.debris.direction,
      debrisProgress,
      debris: buildDebris(sequence.landing.debris.count, debrisProgress)
    },
    smoke: {
      direction: sequence.smoke.direction,
      coverage: smokeCoverage,
      threshold: sequence.smoke.coverageThreshold
    },
    camera: scene.playerAnchor ? {
      anchorWorldX: scene.playerAnchor.x * CONFIG.tileSize,
      anchorWorldY: scene.playerAnchor.y * CONFIG.tileSize,
      impulseWorldX: Math.sin(scene.elapsedReal * 79) * shake * 0.42,
      impulseWorldY: Math.cos(scene.elapsedReal * 61) * shake,
      zoom: sequence.camera.zoom
    } : null,
    diagnostics: {
      resolvedActorIds: [...scene.diagnostics.resolvedActorIds],
      missingActorIds: [...scene.diagnostics.missingActorIds],
      handoffReady: scene.handoffReady,
      smokeCoverage
    }
  };
}

function buildDebris(count, progress) {
  return Array.from({ length: count }, (_, index) => {
    const lane = fract((index + 1) * 0.61803398875);
    const delay = (index % 7) * 0.035;
    const travel = clamp01((progress - delay) / Math.max(0.15, 1 - delay));
    return {
      x01: 0.04 + lane * 0.92,
      y01: -0.12 + travel * (1.24 + (index % 5) * 0.075),
      size: 2.4 + (index % 4) * 1.15,
      rotation: index * 1.71 + progress * (2.2 + index % 3),
      opacity: (1 - clamp01((travel - 0.72) / 0.28)) * (0.38 + (index % 3) * 0.13)
    };
  });
}

function inactiveProjection(scene) {
  return {
    classification: 'renderer_neutral_authored_transition_sequence_projection',
    active: false,
    screenActive: false,
    sequenceId: scene?.sequenceId ?? null,
    phase: scene?.phase ?? AuthoredTransitionPhase.INACTIVE,
    actorTracks: [],
    landing: null,
    smoke: { direction: 'north_to_south', coverage: 0, threshold: 1 },
    camera: null,
    diagnostics: {
      resolvedActorIds: [...(scene?.diagnostics?.resolvedActorIds ?? [])],
      missingActorIds: [...(scene?.diagnostics?.missingActorIds ?? [])],
      handoffReady: false,
      smokeCoverage: 0
    }
  };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function fract(value) {
  return value - Math.floor(value);
}
