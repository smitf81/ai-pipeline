import { clamp } from '../core/math.js';
import { ComponentType } from '../constants/componentTypes.js';
import { getComponent } from '../ecs/world.js';
import { query } from '../ecs/query.js';
import { getHumanoidProjectionProfile } from '../data/humanoids/raiderHumanoid.js';
import { EnemyAttackPhase, EnemyAttackProfileId, getEnemyAttackProfile } from '../data/enemyAttackProfiles.js';
import { getImpactReactionProfile } from '../data/impactReactionProfiles.js';
import { buildImpactPoseState } from './impactResponseState.js';
import { isRaiderGuardActive, isRaiderGuardRecovering } from './raiderGuardState.js';

const TAU = Math.PI * 2;
const READY_PHASE = 'ready';
const GUARD_PHASE = 'guard';
const GUARD_RECOVER_PHASE = 'guard_recover';

export function humanoidProjectionSystem({ game, dt }) {
  for (const entity of query(game.world, [ComponentType.Transform, ComponentType.Collider, ComponentType.HumanoidProjection])) {
    const transform = getComponent(game.world, entity, ComponentType.Transform);
    const collider = getComponent(game.world, entity, ComponentType.Collider);
    const projection = getComponent(game.world, entity, ComponentType.HumanoidProjection);
    if (!transform || !collider || !projection) continue;

    const profile = getHumanoidProjectionProfile(projection.profileId, game.creatureTuning);
    const health = getComponent(game.world, entity, ComponentType.Health);
    const enemyAI = getComponent(game.world, entity, ComponentType.EnemyPressureAI);
    const impactResponse = getComponent(game.world, entity, ComponentType.ImpactResponse);
    const dodgeState = getComponent(game.world, entity, ComponentType.DodgeState);
    const alive = health?.alive !== false;
    const guardState = alive ? buildGuardProjectionState(enemyAI) : null;
    const attackState = alive && !guardState ? buildAttackProjectionState(enemyAI) : null;
    const dx = transform.x - projection.lastX;
    const dy = transform.y - projection.lastY;
    const moved = Math.hypot(dx, dy);
    const speed = dt > 0 ? moved / dt : 0;
    const moving = moved > 0.0001;
    const facing = attackState || guardState || dodgeState?.active
      ? (transform.rotation ?? projection.facing ?? 0)
      : (moving ? Math.atan2(dy, dx) : (transform.rotation ?? projection.facing ?? 0));
    const reactionState = alive ? buildImpactPoseState(impactResponse, facing) : null;
    transform.rotation = facing;

    projection.movement01 = alive ? clamp(speed / profile.gait.maxMovementForFullGait, 0, 1) : 0;
    projection.gaitPhase = (projection.gaitPhase + moved * profile.gait.phasePerWorldUnit) % TAU;
    projection.idlePhase = (projection.idlePhase + Math.max(0, dt) * profile.gait.idlePhaseSpeed) % TAU;
    projection.facing = facing;
    projection.motionState = resolveMotionState({ alive, dodgeState, reactionState, attackState, guardState, projection, profile });
    projection.lastX = transform.x;
    projection.lastY = transform.y;

    const pose = buildHumanoidPose(transform, collider.radius, projection, profile, attackState, reactionState, guardState);
    if (alive) updateMotionTrails(projection, pose.points, attackState, Math.max(0, dt));
    else projection.motionTrails = [];
    projection.points = pose.points;
    projection.sockets = pose.sockets;
    projection.visualBounds = pose.visualBounds;
    projection.partCount = pose.partCount;
    projection.collisionPolicy = profile.collision.policy;
    projection.shadowPolicy = profile.shadow.policy;
    projection.animationState = pose.animationState;
    projection.attackState = attackState;
    projection.guardState = guardState;
    projection.reactionState = reactionState;
    projection.profileLabel = profile.label;
    projection.scaleProfileId = profile.scaleProfileId;
  }
}

export function buildHumanoidPose(transform, radius, projection, profile, attackState = null, reactionState = null, guardState = null) {
  const scale = profile.visual.scale;
  const forward = { x: Math.cos(projection.facing), y: Math.sin(projection.facing) };
  const right = { x: -Math.sin(projection.facing), y: Math.cos(projection.facing) };
  const move01 = projection.movement01 ?? 0;
  const gaitProfile = profile.gait ?? {};
  const posture = profile.posture ?? {};
  const gait = Math.sin(projection.gaitPhase) * move01;
  const counterGait = Math.sin(projection.gaitPhase + Math.PI) * move01;
  const asymmetry = Number(gaitProfile.asymmetry ?? 0);
  const rightGait = gait * (1 + asymmetry * 0.45);
  const leftGait = counterGait * (1 - asymmetry * 0.25);
  const idle = Math.sin(projection.idlePhase) * (1 - move01) * 0.025 * scale;
  const sway = Math.sin(projection.gaitPhase * 0.5 + Math.PI * 0.1) * move01 * (gaitProfile.bodySway ?? 0) * scale;
  const lurch = Math.abs(Math.sin(projection.gaitPhase + Math.PI * 0.18)) * move01 * (gaitProfile.forwardLurch ?? 0) * scale;
  const reactionProfile = getImpactReactionProfile(reactionState?.profileId);
  const reactionScale = reactionState
    ? reactionState.recoil01 * Math.min(1.4, 0.55 + reactionState.impulse * 0.78 + reactionState.stagger * 0.3)
    : 0;
  const reactionDirection = reactionState ? { x: reactionState.directionX, y: reactionState.directionY } : { x: 0, y: 0 };
  const commitDistance = (attackState?.forwardCommitDistance ?? 0) * (attackState?.commit01 ?? 0) * scale;
  const guardBrace = guardState?.phase === GUARD_PHASE ? -0.035 * scale : 0;
  const baseCenter = add({ x: transform.x + right.x * (idle + sway), y: transform.y + right.y * (idle + sway) }, forward, lurch + commitDistance + guardBrace);
  const center = add(baseCenter, reactionDirection, reactionProfile.centerPush * reactionScale);

  const torsoLength = profile.body.torsoLength * scale;
  const shoulderWidth = profile.body.shoulderWidth * scale;
  const hipWidth = profile.body.hipWidth * scale;
  const legSpread = profile.gait.legSpread * scale;
  const stride = profile.gait.stride * scale;
  const armSwing = profile.gait.armSwing * scale;
  const torchProfile = profile.torch ?? {};
  const torchEnabled = torchProfile.enabled !== false;
  const spearProfile = profile.spear ?? {};
  const spearEnabled = spearProfile.enabled === true;
  const torsoTwist = resolveTorsoTwist(attackState, guardState) * scale;
  const compression = resolveBodyCompression(attackState, guardState) * scale;

  let chest = add(add(center, forward, torsoLength * 0.26 + (posture.chestLead ?? 0) * scale - compression), right, rightGait * (posture.chestSway ?? 0) * scale);
  let hips = add(add(center, forward, -torsoLength * 0.34 - (posture.hipDrag ?? 0) * scale - compression * 0.32), right, counterGait * (posture.hipSway ?? 0) * scale);
  chest = add(chest, reactionDirection, (reactionProfile.chestPush - reactionProfile.centerPush) * reactionScale);
  hips = add(hips, reactionDirection, (reactionProfile.hipPush - reactionProfile.centerPush) * reactionScale);
  let head = add(add(chest, forward, profile.head.forward * scale - (posture.headDrop ?? 0) * scale - compression * 0.42), right, Math.sin(projection.idlePhase * 0.5) * (posture.headSway ?? 0) * scale);
  head = add(head, reactionDirection, (reactionProfile.headPush - reactionProfile.chestPush) * reactionScale);
  const leftShoulder = add(add(add(chest, right, -shoulderWidth * 0.5 + (posture.shoulderCurl ?? 0) * scale), forward, (posture.shoulderForward ?? 0) * scale), forward, torsoTwist);
  const rightShoulder = add(add(add(chest, right, shoulderWidth * 0.5 - (posture.shoulderCurl ?? 0) * scale), forward, (posture.shoulderForward ?? 0) * scale), forward, -torsoTwist);
  const leftHip = add(hips, right, -hipWidth * 0.5);
  const rightHip = add(hips, right, hipWidth * 0.5);
  const handForwardBias = (posture.handForwardBias ?? 0) * scale;
  const handInwardBias = (posture.handInwardBias ?? 0) * scale;
  const handDragBias = (posture.handDragBias ?? 0) * scale;
  const leftHandBase = limbEnd(leftShoulder, right, forward, -1, profile.limbs.armLength * scale, leftGait * armSwing);
  const rightHandBase = limbEnd(rightShoulder, right, forward, 1, profile.limbs.armLength * scale, rightGait * armSwing);
  let leftHand = add(add(leftHandBase, forward, handForwardBias - Math.abs(leftGait) * handDragBias), right, handInwardBias);
  let rightHand = add(add(rightHandBase, forward, handForwardBias - Math.abs(rightGait) * handDragBias), right, -handInwardBias);
  let spearButt = null;
  let spearTip = null;
  let spearFrontGrip = null;
  let spearRearGrip = null;
  let torchGrip = null;
  let torchForward = forward;

  if (spearEnabled && (guardState || attackState?.profileId === EnemyAttackProfileId.RAIDER_SPEAR_JAB)) {
    const spearPose = resolveSpearPose(transform, center, forward, right, attackState, guardState, spearProfile, scale);
    ({ spearButt, spearTip, spearFrontGrip, spearRearGrip } = spearPose);
    leftHand = spearFrontGrip;
    rightHand = spearRearGrip;
    torchGrip = add(add(rightHip, right, 0.08 * scale), forward, -0.03 * scale);
    torchForward = rotateAxis(forward, right, 0.18);
  } else if (attackState?.profileId === EnemyAttackProfileId.RAIDER_TORCH_SWING && torchEnabled) {
    const angle = resolveTorchSwingAngle(attackState);
    torchForward = rotateAxis(forward, right, angle);
    const gripReach = Math.max(0.2, (attackState.weaponReach ?? 0.88) - (torchProfile.length + torchProfile.flameRadius * 0.4) * scale);
    rightHand = add({ x: transform.x, y: transform.y }, torchForward, gripReach);
    torchGrip = rightHand;
    const spearStow = add(add(leftHip, right, -0.08 * scale), forward, -0.06 * scale);
    leftHand = spearStow;
    const spearAxis = rotateAxis(forward, right, -1.32);
    spearFrontGrip = spearStow;
    spearRearGrip = spearStow;
    spearButt = add(spearStow, spearAxis, -0.46 * scale);
    spearTip = add(spearStow, spearAxis, 0.66 * scale);
  } else {
    if (torchEnabled) {
      rightHand = add(add(rightHand, forward, torchProfile.handOffsetForward * scale), right, torchProfile.handOffsetRight * scale);
      torchGrip = rightHand;
    }
    if (spearEnabled) {
      const spearAxis = rotateAxis(forward, right, -0.08);
      spearFrontGrip = leftHand;
      spearRearGrip = leftHand;
      spearButt = add(leftHand, spearAxis, -spearProfile.buttLength * scale);
      spearTip = add(leftHand, spearAxis, spearProfile.length * scale);
    }
  }

  if (!spearEnabled && attackState?.profileId === EnemyAttackProfileId.HUSK_CLAW_MAUL) {
    ({ leftHand, rightHand } = resolveHuskMaulHands(center, forward, right, attackState, leftHand, rightHand, scale));
  }

  const upperArm = (profile.limbs.upperArmLength ?? profile.limbs.armLength * 0.62) * scale;
  const forearm = (profile.limbs.forearmLength ?? profile.limbs.armLength * 0.62) * scale;
  const leftElbow = solveBentJoint(leftShoulder, leftHand, upperArm, forearm, -1, right);
  const rightElbow = solveBentJoint(rightShoulder, rightHand, upperArm, forearm, 1, right);
  const footRearBias = (posture.footRearBias ?? 0) * scale;
  const leftFoot = footEnd(leftHip, right, forward, -1, profile.limbs.legLength * scale, leftGait * stride - footRearBias, legSpread);
  const rightFoot = footEnd(rightHip, right, forward, 1, profile.limbs.legLength * scale, rightGait * stride - footRearBias, legSpread);
  const thigh = (profile.limbs.thighLength ?? profile.limbs.legLength * 0.62) * scale;
  const calf = (profile.limbs.calfLength ?? profile.limbs.legLength * 0.62) * scale;
  const leftKnee = solveBentJoint(leftHip, leftFoot, thigh, calf, -1, right);
  const rightKnee = solveBentJoint(rightHip, rightFoot, thigh, calf, 1, right);
  const torchTip = torchEnabled && torchGrip ? add(torchGrip, torchForward, torchProfile.length * scale) : null;
  const torchFlame = torchTip ? add(torchTip, torchForward, torchProfile.flameRadius * scale * 0.4) : null;

  const points = {
    center, chest, hips,
    head: withRadius(head, profile.head.radius * scale),
    leftShoulder, rightShoulder, leftElbow, rightElbow, leftHip, rightHip, leftKnee, rightKnee,
    leftHand: withRadius(leftHand, profile.limbs.handRadius * scale),
    rightHand: withRadius(rightHand, profile.limbs.handRadius * scale),
    leftFoot: withRadius(leftFoot, profile.limbs.footRadius * scale),
    rightFoot: withRadius(rightFoot, profile.limbs.footRadius * scale)
  };
  if (torchTip && torchFlame && torchGrip) Object.assign(points, { torchGrip, torchTip, torchFlame: withRadius(torchFlame, torchProfile.flameRadius * scale) });
  if (spearButt && spearTip && spearFrontGrip && spearRearGrip) Object.assign(points, { spearButt, spearTip, spearFrontGrip, spearRearGrip });

  const sockets = buildHumanoidSockets(points, forward, right, torchForward);
  return {
    points,
    sockets,
    visualBounds: boundsFor(points, Math.max(profile.visual.boundsPadding * scale, radius * 0.35)),
    partCount: 15 + (torchEnabled ? 4 : 0) + (spearEnabled ? 4 : 0),
    animationState: {
      locomotionId: move01 > 0.08 ? (gaitProfile.motionId ?? 'walk') : 'idle',
      step: Number(Math.sin(projection.gaitPhase).toFixed(4)),
      stride: Number((stride * move01).toFixed(4)),
      armSwing: Number((armSwing * move01).toFixed(4)),
      attackProfileId: attackState?.profileId ?? null,
      attackPhase: attackState?.phase ?? EnemyAttackPhase.IDLE,
      attackProgress01: attackState?.progress01 ?? 0,
      guardPhase: guardState?.phase ?? null,
      reactionProfileId: reactionState?.profileId ?? null,
      reactionRemaining01: reactionState?.remaining01 ?? 0
    }
  };
}

export function buildAttackProjectionState(ai) {
  const profileId = ai?.activeAttackProfileId ?? resolveReadyProfileId(ai);
  if (!profileId) return null;
  let profile;
  try { profile = getEnemyAttackProfile(profileId); } catch { return null; }
  const busy = [EnemyAttackPhase.WINDUP, EnemyAttackPhase.ACTIVE, EnemyAttackPhase.RECOVER].includes(ai.attackPhase);
  if (!busy) return ai?.targetId ? attackProjection(profile, READY_PHASE, 0) : null;
  const duration = ai.attackPhase === EnemyAttackPhase.WINDUP
    ? profile.windup
    : (ai.attackPhase === EnemyAttackPhase.ACTIVE ? profile.active : profile.recovery);
  const progress01 = duration > 0 ? clamp(1 - (ai.attackTimer ?? 0) / duration, 0, 1) : 1;
  return attackProjection(profile, ai.attackPhase, progress01);
}

export function buildGuardProjectionState(ai) {
  if (isRaiderGuardActive(ai)) {
    const duration = Math.max(0.001, ai.guardHoldSeconds ?? 0);
    return {
      phase: GUARD_PHASE,
      progress01: clamp(1 - (ai.guardHoldTimer ?? 0) / duration, 0, 1),
      protectedArcRadians: ai.guardProtectedArcRadians ?? 0,
      damageMultiplier: ai.guardDamageMultiplier ?? 1
    };
  }
  if (isRaiderGuardRecovering(ai)) {
    const duration = Math.max(0.001, ai.guardRecoverySeconds ?? 0);
    return {
      phase: GUARD_RECOVER_PHASE,
      progress01: clamp(1 - (ai.guardRecoveryTimer ?? 0) / duration, 0, 1),
      protectedArcRadians: 0,
      damageMultiplier: 1
    };
  }
  return null;
}

function attackProjection(profile, phase, progress01) {
  const anticipation01 = phase === EnemyAttackPhase.WINDUP ? smooth01(progress01) : 0;
  const strike01 = phase === EnemyAttackPhase.ACTIVE
    ? smoothstep(0.02, Math.max(0.08, profile.damageTime01 ?? 0.5), progress01)
    : (phase === EnemyAttackPhase.RECOVER ? 1 - smoothstep(0.18, 1, progress01) : 0);
  return {
    profileId: profile.id,
    phase,
    progress01,
    commit01: phase === EnemyAttackPhase.ACTIVE ? strike01 : (phase === EnemyAttackPhase.RECOVER ? strike01 : 0),
    anticipation01,
    strike01,
    recovery01: phase === EnemyAttackPhase.RECOVER ? progress01 : 0,
    damageTime01: profile.damageTime01 ?? 0.5,
    damageWindowActive: phase === EnemyAttackPhase.ACTIVE,
    attackMotion: profile.attackMotion,
    poseProfile: profile.poseProfile,
    weaponReach: profile.weaponReach ?? profile.range,
    forwardCommitDistance: profile.forwardCommitDistance ?? 0,
    recoveryExposure: profile.recoveryExposure ?? 0,
    hitShape: { ...profile.hitShape },
    telegraphVisual: profile.telegraphVisual ?? null,
    strikeOriginSocket: profile.strikeOriginSocket ?? null,
    strikeEndpointSocket: profile.strikeEndpointSocket ?? null,
    weaponSocket: profile.weaponSocket ?? profile.strikeEndpointSocket ?? null,
    debugVisual: profile.debugVisual ? { ...profile.debugVisual } : null
  };
}

function resolveReadyProfileId(ai) {
  if (!ai?.targetId || !Array.isArray(ai.attackProfileIds) || ai.attackProfileIds.length === 0) return null;
  const index = Math.max(0, Math.floor(Number(ai.nextAttackProfileIndex) || 0)) % ai.attackProfileIds.length;
  return ai.attackProfileIds[index] ?? null;
}

function resolveSpearPose(transform, center, forward, right, attackState, guardState, spearProfile, scale) {
  if (guardState) {
    const angle = guardState.phase === GUARD_PHASE ? Math.PI * 0.5 : lerp(Math.PI * 0.5, 0.2, smooth01(guardState.progress01));
    const axis = rotateAxis(forward, right, angle);
    const weaponCenter = add(center, forward, guardState.phase === GUARD_PHASE ? 0.3 * scale : 0.18 * scale);
    return {
      spearButt: add(weaponCenter, axis, -0.56 * scale),
      spearTip: add(weaponCenter, axis, 0.56 * scale),
      spearFrontGrip: add(weaponCenter, axis, -0.17 * scale),
      spearRearGrip: add(weaponCenter, axis, 0.17 * scale)
    };
  }
  const reach = resolveSpearReach(attackState);
  const anticipation = attackState?.phase === EnemyAttackPhase.WINDUP ? attackState.anticipation01 : 0;
  const axis = rotateAxis(forward, right, -0.2 * anticipation);
  const tip = add({ x: transform.x, y: transform.y }, axis, reach);
  const frontGrip = add(tip, axis, -0.58 * scale);
  const rearGrip = add(frontGrip, axis, -0.28 * scale);
  return {
    spearButt: add(rearGrip, axis, -Math.max(0.22, spearProfile.buttLength ?? 0.2) * scale),
    spearTip: tip,
    spearFrontGrip: frontGrip,
    spearRearGrip: rearGrip
  };
}

function resolveSpearReach(state) {
  const reach = Math.max(0.2, state?.weaponReach ?? 1.15);
  if (!state || state.phase === READY_PHASE) return reach * 0.84;
  if (state.phase === EnemyAttackPhase.WINDUP) return reach * lerp(0.84, 0.52, state.anticipation01);
  if (state.phase === EnemyAttackPhase.ACTIVE) return reach * lerp(0.52, 1, smoothstep(0, state.damageTime01, state.progress01));
  return reach * lerp(1, 0.84, smoothstep(0.28, 1, state.progress01));
}

function resolveTorchSwingAngle(state) {
  if (!state || state.phase === READY_PHASE) return 1.05;
  if (state.phase === EnemyAttackPhase.WINDUP) return lerp(1.05, 1.35, state.anticipation01);
  if (state.phase === EnemyAttackPhase.ACTIVE) return lerp(1.35, -1.2, smoothstep(0.08, 0.82, state.progress01));
  return lerp(-1.2, 1.05, smoothstep(0.26, 1, state.progress01));
}

function resolveHuskMaulHands(center, forward, right, state, leftFallback, rightFallback, scale) {
  let forwardReach = 0.22;
  let spread = 0.24;
  if (state.phase === EnemyAttackPhase.WINDUP) {
    forwardReach = lerp(0.22, -0.04, state.anticipation01);
    spread = lerp(0.24, 0.13, state.anticipation01);
  } else if (state.phase === EnemyAttackPhase.ACTIVE) {
    forwardReach = lerp(-0.04, 0.66, smoothstep(0, state.damageTime01, state.progress01));
    spread = lerp(0.13, 0.28, state.strike01);
  } else if (state.phase === EnemyAttackPhase.RECOVER) {
    forwardReach = lerp(0.66, 0.22, smooth01(state.progress01));
    spread = lerp(0.28, 0.24, state.progress01);
  } else if (state.phase !== READY_PHASE) {
    return { leftHand: leftFallback, rightHand: rightFallback };
  }
  return {
    leftHand: add(add(center, forward, forwardReach * scale), right, -spread * scale),
    rightHand: add(add(center, forward, forwardReach * scale), right, spread * scale)
  };
}

function buildHumanoidSockets(points, forward, right, torchForward) {
  const sockets = {
    leftHand: socket(points.leftHand, forward, right, 'left_hand_socket'),
    rightHand: socket(points.rightHand, forward, right, 'right_hand_socket'),
    leftElbow: socket(points.leftElbow, forward, right, 'left_elbow_socket'),
    rightElbow: socket(points.rightElbow, forward, right, 'right_elbow_socket'),
    chest: socket(points.chest, forward, right, 'chest_socket'),
    head: socket(points.head, forward, right, 'head_socket'),
    leftFoot: socket(points.leftFoot, forward, right, 'left_foot_socket'),
    rightFoot: socket(points.rightFoot, forward, right, 'right_foot_socket'),
    clawHandMidpoint: socket(midpoint(points.leftHand, points.rightHand), forward, right, 'claw_hand_midpoint_socket')
  };
  if (points.torchGrip && points.torchTip && points.torchFlame) {
    const torchRight = { x: -torchForward.y, y: torchForward.x };
    sockets.torchHand = socket(points.torchGrip, torchForward, torchRight, 'torch_hand_socket');
    sockets.torchTip = socket(points.torchTip, torchForward, torchRight, 'torch_tip_socket');
    sockets.torchFlame = socket(points.torchFlame, torchForward, torchRight, 'torch_flame_socket');
  }
  if (points.spearButt && points.spearTip) {
    const spearForward = normalise(points.spearTip.x - points.spearButt.x, points.spearTip.y - points.spearButt.y, forward);
    const spearRight = { x: -spearForward.y, y: spearForward.x };
    sockets.spearGrip = socket(points.spearFrontGrip, spearForward, spearRight, 'spear_grip_socket');
    sockets.spearFrontGrip = socket(points.spearFrontGrip, spearForward, spearRight, 'spear_front_grip_socket');
    sockets.spearRearGrip = socket(points.spearRearGrip, spearForward, spearRight, 'spear_rear_grip_socket');
    sockets.spearTip = socket(points.spearTip, spearForward, spearRight, 'spear_tip_socket');
  }
  return sockets;
}

function updateMotionTrails(projection, points, attackState, dt) {
  const trails = (projection.motionTrails ?? []).map((sample) => ({ ...sample, age: (sample.age ?? 0) + dt })).filter((sample) => sample.age < sample.lifetime);
  appendTrailSample(trails, 'flame_motion', points.torchFlame, 0.2, 8, 0.012);
  const active = attackState?.phase === EnemyAttackPhase.ACTIVE;
  appendTrailSample(trails, 'spear_jab', points.spearTip, 0.12, 6, 0.01, active && attackState?.profileId === EnemyAttackProfileId.RAIDER_SPEAR_JAB);
  const clawActive = active && attackState?.profileId === EnemyAttackProfileId.HUSK_CLAW_MAUL;
  appendTrailSample(trails, 'claw_left', points.leftHand, 0.13, 5, 0.012, clawActive);
  appendTrailSample(trails, 'claw_right', points.rightHand, 0.13, 5, 0.012, clawActive);
  projection.motionTrails = trails.slice(-28);
}

function appendTrailSample(trails, role, point, lifetime, maxSamples, minDistance, active = true) {
  if (!active || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
  const samples = trails.filter((sample) => sample.role === role);
  const latest = samples.at(-1);
  if (latest && Math.hypot(point.x - latest.x, point.y - latest.y) < minDistance) return;
  trails.push({ classification: 'procedural_motion_trail_sample', role, x: point.x, y: point.y, age: 0, lifetime });
  while (trails.filter((sample) => sample.role === role).length > maxSamples) trails.splice(trails.findIndex((sample) => sample.role === role), 1);
}

function resolveMotionState({ alive, dodgeState, reactionState, attackState, guardState, projection, profile }) {
  if (!alive) return 'defeated';
  if (dodgeState?.active) return 'dodge';
  if (reactionState) return 'hit_react';
  if (guardState) return guardState.phase;
  if (attackState) return `attack_${attackState.phase}`;
  return projection.movement01 > 0.08 ? (profile.gait.motionId ?? 'walk') : 'idle';
}

function resolveTorsoTwist(attackState, guardState) {
  if (guardState?.phase === GUARD_PHASE) return 0.04;
  if (!attackState) return 0;
  if (attackState.profileId === EnemyAttackProfileId.RAIDER_SPEAR_JAB) {
    if (attackState.phase === READY_PHASE) return -0.08;
    if (attackState.phase === EnemyAttackPhase.WINDUP) return lerp(-0.08, -0.25, attackState.anticipation01);
    if (attackState.phase === EnemyAttackPhase.ACTIVE) return lerp(-0.25, 0.1, attackState.strike01);
    return lerp(0.1, -0.08, attackState.progress01);
  }
  if (attackState.profileId === EnemyAttackProfileId.RAIDER_TORCH_SWING) return Math.sin(resolveTorchSwingAngle(attackState)) * 0.1;
  return 0;
}

function resolveBodyCompression(attackState, guardState) {
  if (guardState?.phase === GUARD_PHASE) return 0.045;
  if (!attackState) return 0;
  if (attackState.profileId === EnemyAttackProfileId.HUSK_CLAW_MAUL && attackState.phase === EnemyAttackPhase.WINDUP) return 0.1 * attackState.anticipation01;
  if (attackState.profileId === EnemyAttackProfileId.RAIDER_SPEAR_JAB && attackState.phase === EnemyAttackPhase.WINDUP) return 0.035 * attackState.anticipation01;
  return 0;
}

function solveBentJoint(start, end, upperLength, lowerLength, bendSide, rightAxis) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.max(0.0001, Math.hypot(dx, dy));
  const upper = Math.max(upperLength, distance * 0.52);
  const lower = Math.max(lowerLength, distance * 0.52);
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));
  const ux = dx / distance;
  const uy = dy / distance;
  const base = { x: start.x + ux * along, y: start.y + uy * along };
  const offset = { x: -uy * height, y: ux * height };
  const first = add(base, offset, 1);
  const second = add(base, offset, -1);
  const firstSide = ((first.x - base.x) * rightAxis.x + (first.y - base.y) * rightAxis.y) * bendSide;
  const secondSide = ((second.x - base.x) * rightAxis.x + (second.y - base.y) * rightAxis.y) * bendSide;
  return firstSide >= secondSide ? first : second;
}

function limbEnd(anchor, right, forward, side, length, swing) {
  return { x: anchor.x + right.x * side * length * 0.88 + forward.x * swing, y: anchor.y + right.y * side * length * 0.88 + forward.y * swing };
}

function footEnd(anchor, right, forward, side, length, stride, spread) {
  return { x: anchor.x + right.x * side * spread + forward.x * (-length + stride), y: anchor.y + right.y * side * spread + forward.y * (-length + stride) };
}

function add(point, axis, distance) { return { x: point.x + axis.x * distance, y: point.y + axis.y * distance }; }
function midpoint(a, b) { return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 }; }
function withRadius(point, radius) { return { ...point, radius }; }
function rotateAxis(forward, right, radians) { return { x: forward.x * Math.cos(radians) + right.x * Math.sin(radians), y: forward.y * Math.cos(radians) + right.y * Math.sin(radians) }; }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(edge0, edge1, value) { return smooth01((value - edge0) / Math.max(0.001, edge1 - edge0)); }
function smooth01(value) { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); }
function normalise(x, y, fallback) { const length = Math.hypot(x, y); return length > 0.0001 ? { x: x / length, y: y / length } : { ...fallback }; }
function socket(point, forward, right, role) { return { x: point.x, y: point.y, forward: { ...forward }, right: { ...right }, role, classification: 'projection_socket' }; }

function boundsFor(points, padding) {
  const values = Object.values(points).filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y));
  const minX = Math.min(...values.map((point) => point.x - (point.radius ?? 0)), Infinity) - padding;
  const minY = Math.min(...values.map((point) => point.y - (point.radius ?? 0)), Infinity) - padding;
  const maxX = Math.max(...values.map((point) => point.x + (point.radius ?? 0)), -Infinity) + padding;
  const maxY = Math.max(...values.map((point) => point.y + (point.radius ?? 0)), -Infinity) + padding;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}
