export const RAIDER_PHYSICAL_MOTION_INTENT_CONTRACT = 'black-sky-bound.raider-physical-motion-intent.v1';

export function createRaiderPhysicalMotionIntent(x, y, facing = 0) {
  const originX = finite(x, 0);
  const originY = finite(y, 0);
  const heading = finite(facing, 0);
  const forward = { x: Math.cos(heading), y: Math.sin(heading) };
  const right = { x: -forward.y, y: forward.x };
  const leftFoot = contactAt(originX, originY, forward, right, -1, 0);
  const rightFoot = contactAt(originX, originY, forward, right, 1, 0);
  return {
    classification: 'raider_physical_motion_intent_component',
    contract: RAIDER_PHYSICAL_MOTION_INTENT_CONTRACT,
    solverId: 'raider_ink_contact_intent_solver_v1',
    enabled: true,
    poseEnabled: true,
    poseActivation: 'production_raider_ink_stick_v1',
    updateCount: 0,
    pelvis: {
      x: originX,
      y: originY,
      velocityX: 0,
      velocityY: 0,
      measuredVelocityX: 0,
      measuredVelocityY: 0,
      accelerationX: 0,
      accelerationY: 0,
      attackShiftX: 0,
      attackShiftY: 0,
      recoilShiftX: 0,
      recoilShiftY: 0,
      weightBias: 0
    },
    locomotion: {
      speed: 0,
      speed01: 0,
      maxSpeed: 3.1,
      forward: 0,
      lateral: 0,
      idleWeight: 1,
      walkWeight: 0,
      runWeight: 0,
      travelFacing: heading,
      stepPhase: 0,
      supportFoot: 'left',
      swingFoot: 'right',
      moving: false,
      starting01: 0,
      stopping01: 0,
      strideLength: 0,
      cadence: 0
    },
    contacts: {
      left: leftFoot,
      right: rightFoot
    },
    attention: {
      targetId: null,
      targetX: null,
      targetY: null,
      travelFacing: heading,
      chestFacing: heading,
      headFacing: heading,
      chestTravelDelta: 0,
      headChestDelta: 0
    },
    targetTrack: {
      targetId: null,
      lastX: null,
      lastY: null,
      velocityX: 0,
      velocityY: 0
    },
    weapon: {
      profileId: null,
      phase: 'idle',
      predictedImpact: null,
      frozenImpact: null,
      committed: false,
      commitUpdate: null,
      predictionLeadSeconds: 0,
      predictionOffset: 0,
      predictionClamped: false,
      predictionTurnRadians: 0,
      recoil01: 0,
      recoilTimer: 0,
      recoilDuration: 0.16,
      contactCount: 0,
      lastContactHitCount: 0
    },
    equipment: {
      policy: 'right_hand_spear_left_hand_torch_v1',
      spearHand: 'right',
      torchHand: 'left'
    },
    continuity: {
      plantSwitchCount: 0,
      leftPlantCount: 1,
      rightPlantCount: 1,
      maxSupportDrift: 0,
      lastPhase: 'idle',
      lastSupportFoot: 'left',
      preservedVelocityTransitions: 0
    }
  };
}

function contactAt(x, y, forward, right, side, plantId) {
  return {
    x: x + right.x * side * 0.22 + forward.x * side * 0.11 - forward.x * 0.18,
    y: y + right.y * side * 0.22 + forward.y * side * 0.11 - forward.y * 0.18,
    height: 0.07,
    planted: true,
    support: side < 0,
    lift: 0,
    plantId,
    swingStartX: null,
    swingStartY: null,
    targetX: null,
    targetY: null
  };
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
