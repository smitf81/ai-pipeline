export function buildRaiderPhysicalMotionText(intent, roundPoint) {
  if (!intent) return null;
  return {
    contract: intent.contract,
    poseEnabled: intent.poseEnabled === true,
    poseActivation: intent.poseActivation ?? null,
    supportFoot: intent.locomotion?.supportFoot ?? null,
    speed01: Number((intent.locomotion?.speed01 ?? 0).toFixed(3)),
    blendSpace: {
      forward: Number((intent.locomotion?.forward ?? 0).toFixed(3)),
      lateral: Number((intent.locomotion?.lateral ?? 0).toFixed(3)),
      idle: Number((intent.locomotion?.idleWeight ?? 1).toFixed(3)),
      walk: Number((intent.locomotion?.walkWeight ?? 0).toFixed(3)),
      run: Number((intent.locomotion?.runWeight ?? 0).toFixed(3))
    },
    equipmentPolicy: intent.equipment?.policy ?? null,
    chestTravelDelta: Number((intent.attention?.chestTravelDelta ?? 0).toFixed(3)),
    attackPhase: intent.weapon?.phase ?? 'idle',
    predictedImpact: intent.weapon?.predictedImpact ? roundPoint(intent.weapon.predictedImpact) : null,
    frozenImpact: intent.weapon?.frozenImpact ? roundPoint(intent.weapon.frozenImpact) : null,
    impactCommitted: intent.weapon?.committed === true,
    plantedFeet: ['left', 'right'].filter((side) => intent.contacts?.[side]?.planted === true),
    recoil01: Number((intent.weapon?.recoil01 ?? 0).toFixed(3))
  };
}
