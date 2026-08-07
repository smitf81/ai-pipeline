import { buildAuthoredTransitionSequenceProjection } from '../projection/authoredTransitionSequenceProjection.js';

export function buildAuthoredTransitionText(state) {
  const projection = buildAuthoredTransitionSequenceProjection(state);
  return {
    active: projection.active,
    sequenceId: projection.sequenceId,
    phase: projection.phase,
    phaseProgress: Number((projection.phaseProgress ?? 0).toFixed(3)),
    smokeCoverage: Number((projection.smoke?.coverage ?? 0).toFixed(3)),
    smokeThreshold: projection.smoke?.threshold ?? null,
    landingDirection: projection.landing?.direction ?? null,
    debrisCount: projection.landing?.debris?.length ?? 0,
    actorTracks: projection.actorTracks,
    diagnostics: projection.diagnostics,
    error: state.authoredTransitionSequence?.error ?? null,
    audio: { ...(state.authoredTransitionSequence?.audio ?? {}) }
  };
}
