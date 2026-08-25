export function buildPlayerDodgeDebug(dodge) {
  if (!dodge) return null;
  return {
    active: dodge.active === true,
    recovering: dodge.recovering === true,
    buffered: dodge.buffered === true,
    mode: dodge.mode ?? dodge.bufferedMode ?? null,
    energy01: rounded(dodge.buffered ? dodge.bufferedEnergy01 : dodge.energy01),
    effectiveness: rounded(dodge.buffered ? dodge.bufferedEffectiveness : dodge.effectiveness),
    requestedMeters: rounded(dodge.buffered ? dodge.bufferedDistanceMeters : dodge.distanceRequestedMeters),
    appliedMeters: rounded((dodge.distanceApplied ?? 0) * 0.5),
    apexMeters: rounded(dodge.buffered ? dodge.bufferedApexHeightMeters : dodge.apexHeightMeters),
    landingCompressionMeters: rounded(dodge.buffered ? dodge.bufferedLandingCompressionMeters : dodge.landingCompressionMeters),
    cooldownApplied: rounded(dodge.buffered ? dodge.bufferedCooldown : dodge.cooldownApplied),
    staminaSpent: dodge.staminaSpent ?? 0,
    followupsEnabled: dodge.followupsEnabled === true,
    bufferRemaining: rounded(dodge.bufferRemaining),
    bufferedDirectionX: rounded(dodge.bufferedDirectionX),
    bufferedDirectionY: rounded(dodge.bufferedDirectionY),
    bufferedReservation: dodge.bufferedReservedCost ?? 0,
    phase: rounded(dodge.phase),
    recoveryProgress: rounded(dodge.recoveryProgress),
    cooldownRemaining: rounded(dodge.cooldownRemaining),
    count: dodge.count ?? 0,
    chainIndex: dodge.chainIndex ?? 0,
    queuedBranch: dodge.committedBranch ?? null,
    queuedDirectionX: rounded(dodge.queuedDirectionX),
    queuedDirectionY: rounded(dodge.queuedDirectionY),
    reservedCost: dodge.reservedChainCost ?? 0,
    landingHold: rounded(dodge.landingHoldRemaining),
    lastReason: dodge.lastReason ?? null,
    lastDeniedReason: dodge.lastDeniedReason ?? null,
    lastRequestReceipt: dodge.lastRequestReceipt ?? null
  };
}

export function buildPlayerActionDebug(action) {
  if (!action) return null;
  return {
    active: action.active === true,
    recovering: action.recovering === true,
    recoveryKind: action.recoveryKind ?? null,
    actionId: action.actionId ?? null,
    recoveryActionId: action.recoveryActionId ?? null,
    phase: rounded(action.phase),
    recoveryPhase: rounded(action.recoveryPhase, 1),
    recoveryProgress: rounded(action.recoveryProgress),
    directionX: rounded(action.directionX),
    directionY: rounded(action.directionY),
    committedFacing: rounded(action.committedFacing),
    movementBlocked: action.movementBlocked === true,
    requestedMeters: rounded(action.movementDistanceMeters),
    requestedTiles: rounded(action.movementDistanceTiles),
    appliedTiles: rounded(action.movementImpulseApplied),
    travelCapTiles: rounded(action.movementDistanceLimit),
    impactLanding: action.impactLanding === true,
    contactClosed: action.contactClosed === true,
    lastImpactReceipt: action.lastImpactReceipt ?? null,
    lastInterruptionReceipt: action.lastInterruptionReceipt ?? null
  };
}

export function buildPlayerFacingDebug(dragon) {
  const motion = dragon?.wyvernProjection?.motionState;
  const axial = dragon?.wyvernProjection?.axialTurn;
  if (!motion) return null;
  return {
    body: rounded(dragon.rotation),
    aim: rounded(motion.aimFacing),
    headYaw: rounded(motion.headLookYaw),
    neckYaw: rounded(motion.neckLookYaw),
    turnError: rounded(motion.turnError),
    turnVelocity: rounded(motion.turnVelocity),
    turnEffort: rounded(motion.turnEffort),
    turnPhase: rounded(motion.turnPhase),
    turnPlantSide: motion.turnPlantSide ?? 1,
    turningInPlace: motion.turningInPlace === true,
    localForward: rounded(motion.localTravelForward),
    localRight: rounded(motion.localTravelRight),
    poseElevationMeters: rounded(dragon.wyvernProjection.proceduralPose?.elevationMeters),
    axialFacing: axial ? {
      head: rounded(axial.headFacing),
      chest: rounded(axial.chestFacing),
      hips: rounded(axial.hipFacing),
      tail: rounded(axial.tailFacing)
    } : null,
    axialLag: axial ? {
      neck: rounded(axial.neckLag),
      chest: rounded(axial.chestLag),
      hips: rounded(axial.hipLag),
      tail: rounded(axial.tailLag)
    } : null,
    malformedTurnFrames: axial?.malformedFrameCount ?? dragon.wyvernProjection.malformedTurnFrameCount ?? 0
  };
}

function rounded(value, fallback = 0) { return Number((value ?? fallback).toFixed(3)); }
