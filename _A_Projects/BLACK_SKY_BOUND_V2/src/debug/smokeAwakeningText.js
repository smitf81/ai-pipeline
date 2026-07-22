import { buildSmokeAwakeningProjection } from '../projection/smokeAwakeningProjection.js';

export function buildSmokeAwakeningText(state) {
  const scene = buildSmokeAwakeningProjection(state);
  if (!scene) return null;
  return {
    contract: scene.contract,
    source: scene.source,
    active: scene.active,
    phase: scene.phase,
    elapsedReal: rounded(scene.elapsedReal),
    phaseElapsedReal: rounded(scene.phaseElapsedReal),
    phaseProgress: rounded(scene.phaseProgress),
    acceptedInputCount: scene.acceptedInputCount,
    requiredInputCount: scene.requiredInputCount,
    smokeCoverage: rounded(scene.smokeCoverage),
    pocket01: rounded(scene.pocket01),
    impactPulse: rounded(scene.impactPulse),
    exhalePulse: rounded(scene.exhalePulse),
    raiderShadowCount: scene.raiderShadows.length,
    raiderShadows: scene.raiderShadows.map((shadow) => ({
      sourceActorId: shadow.sourceActorId,
      sourceType: shadow.sourceType,
      sourceTeam: shadow.sourceTeam,
      torch: shadow.torch
    })),
    prompt: scene.prompt,
    camera: scene.camera,
    narrative: scene.narrative,
    unlockApplied: scene.unlockApplied,
    radialSmokeEmitted: scene.radialSmokeEmitted,
    released: scene.released,
    simulationGateTicks: state.smokeAwakening?.diagnostics?.simulationGateTicks ?? 0,
    audio: { ...(state.smokeAwakening?.audio ?? {}) },
    reducedMotion: scene.settings.reducedMotion
  };
}

function rounded(value) {
  return Number((Number(value) || 0).toFixed(3));
}
