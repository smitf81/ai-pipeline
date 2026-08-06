export function buildRaiderPhysicalMotionText(intent, roundPoint) {
  if (!intent) return null;
  return {
    contract: intent.contract,
    poseEnabled: intent.poseEnabled === true,
    poseActivation: intent.poseActivation ?? null,
    supportFoot: intent.locomotion?.supportFoot ?? null,
    speed01: Number((intent.locomotion?.speed01 ?? 0).toFixed(3)),
    chestTravelDelta: Number((intent.attention?.chestTravelDelta ?? 0).toFixed(3)),
    attackPhase: intent.weapon?.phase ?? 'idle',
    predictedImpact: intent.weapon?.predictedImpact ? roundPoint(intent.weapon.predictedImpact) : null,
    frozenImpact: intent.weapon?.frozenImpact ? roundPoint(intent.weapon.frozenImpact) : null,
    impactCommitted: intent.weapon?.committed === true,
    plantedFeet: ['left', 'right'].filter((side) => intent.contacts?.[side]?.planted === true),
    recoil01: Number((intent.weapon?.recoil01 ?? 0).toFixed(3))
  };
}
