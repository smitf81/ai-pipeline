import { clamp } from '../core/math.js';
import { EnemyAttackPhase, EnemyAttackProfileId } from '../data/enemyAttackProfiles.js';

const READY_PHASE = 'ready';
const GUARD_PHASE = 'guard';

export function buildRaiderPhysicalPose({
  transform,
  radius,
  projection,
  profile,
  attackState,
  reactionState = null,
  guardState = null,
  dodgeState = null,
  intent
}) {
  const scale = profile.visual.scale;
  const chestForward = axis(intent.attention.chestFacing);
  const headForward = axis(intent.attention.headFacing);
  const travelForward = axis(intent.locomotion.travelFacing);
  const chestRight = { x: -chestForward.y, y: chestForward.x };
  const travelRight = { x: -travelForward.y, y: travelForward.x };
  const speed01 = intent.locomotion.speed01;
  const walkWeight = intent.locomotion.walkWeight ?? clamp(speed01 * 2, 0, 1);
  const runWeight = intent.locomotion.runWeight ?? 0;
  const movingWeight = clamp(walkWeight + runWeight, 0, 1);
  const strideSway = Math.sin(intent.locomotion.stepPhase * Math.PI * 2) * movingWeight;
  const accelerationForward = clamp(
    intent.pelvis.accelerationX * travelForward.x + intent.pelvis.accelerationY * travelForward.y,
    -5,
    5
  );
  const inertiaLean = clamp(accelerationForward * 0.012, -0.055, 0.055)
    - intent.locomotion.stopping01 * 0.035;
  const recoil = intent.weapon.recoil01 ?? 0;
  const dodge01 = dodgeState?.active ? Math.sin(clamp(dodgeState.phase ?? 0, 0, 1) * Math.PI) : 0;
  const dodgeForward = dodgeState?.active
    ? normalise(dodgeState.directionX, dodgeState.directionY, travelForward)
    : travelForward;
  const reaction01 = clamp(reactionState?.recoil01 ?? 0, 0, 1);
  const reactionDirection = reactionState
    ? normalise(reactionState.directionX, reactionState.directionY, { x: -chestForward.x, y: -chestForward.y })
    : { x: 0, y: 0 };
  const weaponGoal = intent.weapon.frozenImpact ?? intent.weapon.predictedImpact;
  const weaponForward = weaponGoal
    ? normalise(weaponGoal.x - intent.pelvis.x, weaponGoal.y - intent.pelvis.y, chestForward)
    : chestForward;

  const dodgeLift = dodge01 * Math.max(0, dodgeState?.apexHeightMeters ?? 0.1);
  const reactionShift = 0.075 * reaction01;
  const pelvis = point(intent.pelvis.x, intent.pelvis.y, 0.92 + dodgeLift);
  const hips = add3(pelvis, travelForward, -0.045 + inertiaLean * 0.18);
  let chest = add3(pelvis, chestForward, profile.body.torsoLength * 0.54 + inertiaLean + runWeight * 0.035);
  chest = add3(chest, chestRight, strideSway * (0.018 + runWeight * 0.018));
  chest = add3(chest, dodgeForward, dodge01 * 0.045);
  chest = add3(chest, reactionDirection, reactionShift);
  chest = add3(chest, weaponForward, -0.022 * recoil);
  chest.height = 1.32 + dodgeLift - Math.abs(strideSway) * (0.018 + runWeight * 0.012) - reaction01 * 0.035;
  let neck = add3(chest, headForward, profile.head.forward * 0.34);
  neck.height = chest.height + 0.17;
  let head = add3(neck, headForward, profile.head.forward * 0.42);
  head = add3(head, reactionDirection, reactionShift * 0.48);
  head.height = neck.height + 0.17 + Math.sin(projection.idlePhase * 0.5) * 0.012 - reaction01 * 0.025;

  const torsoTwist = resolveTorsoTwist(attackState, guardState);
  const shoulderAxis = rotate(chestRight, chestForward, torsoTwist);
  const leftShoulder = add3(chest, shoulderAxis, -profile.body.shoulderWidth * 0.5);
  const rightShoulder = add3(chest, shoulderAxis, profile.body.shoulderWidth * 0.5);
  leftShoulder.height = rightShoulder.height = chest.height + 0.02;
  leftShoulder.x -= weaponForward.x * 0.04 * recoil;
  leftShoulder.y -= weaponForward.y * 0.04 * recoil;
  rightShoulder.x -= weaponForward.x * 0.028 * recoil;
  rightShoulder.y -= weaponForward.y * 0.028 * recoil;

  const leftHip = add3(hips, travelRight, -profile.body.hipWidth * 0.5);
  const rightHip = add3(hips, travelRight, profile.body.hipWidth * 0.5);
  leftHip.height = rightHip.height = pelvis.height - 0.01;
  const leftFoot = contactPoint(intent.contacts.left);
  const rightFoot = contactPoint(intent.contacts.right);
  if (dodgeState?.active) {
    leftFoot.height += dodgeLift * (intent.contacts.left.support ? 0.35 : 0.75);
    rightFoot.height += dodgeLift * (intent.contacts.right.support ? 0.35 : 0.75);
  }
  const legPoleForward = speed01 > 0.05 ? travelForward : chestForward;
  const leftKnee = solveTwoBone(leftHip, leftFoot, profile.limbs.thighLength, profile.limbs.calfLength, pole(legPoleForward, travelRight, -1, 0.7));
  const rightKnee = solveTwoBone(rightHip, rightFoot, profile.limbs.thighLength, profile.limbs.calfLength, pole(legPoleForward, travelRight, 1, 0.7));
  const toeForward = speed01 > 0.05 ? travelForward : chestForward;
  const leftToe = add3(leftFoot, toeForward, 0.13 * scale);
  const rightToe = add3(rightFoot, toeForward, 0.13 * scale);
  leftToe.height = rightToe.height = 0.045;

  const spear = solveSpear(intent, attackState, guardState, chestForward, chestRight, scale);
  const torch = solveTorch(attackState, guardState, chest, chestForward, chestRight, profile, scale);
  const leftHand = torch.grip;
  const rightHand = spear.rearGrip;
  const leftElbow = solveTwoBone(
    leftShoulder,
    leftHand,
    profile.limbs.upperArmLength,
    profile.limbs.forearmLength,
    pole(torch.axis, { x: -torch.axis.y, y: torch.axis.x }, -1, 0.42)
  );
  const rightElbow = solveTwoBone(
    rightShoulder,
    rightHand,
    profile.limbs.upperArmLength,
    profile.limbs.forearmLength,
    pole(spear.axis, { x: -spear.axis.y, y: spear.axis.x }, 1, 0.46)
  );

  const points = {
    center: point(intent.pelvis.x, intent.pelvis.y, 1.05 + dodgeLift),
    chest,
    hips,
    neck,
    head: withRadius(head, profile.head.radius * scale),
    leftShoulder,
    rightShoulder,
    leftElbow,
    rightElbow,
    leftHip,
    rightHip,
    leftKnee,
    rightKnee,
    leftHand: withRadius(leftHand, profile.limbs.handRadius * scale),
    rightHand: withRadius(rightHand, profile.limbs.handRadius * scale),
    leftFoot: withContact(leftFoot, profile.limbs.footRadius * scale, intent.contacts.left),
    rightFoot: withContact(rightFoot, profile.limbs.footRadius * scale, intent.contacts.right),
    leftToe,
    rightToe,
    spearButt: spear.butt,
    spearTip: spear.tip,
    spearFrontGrip: spear.frontGrip,
    spearRearGrip: spear.rearGrip,
    torchGrip: torch.grip,
    torchTip: torch.tip,
    torchFlame: withRadius(torch.flame, profile.torch.flameRadius * scale)
  };
  const sockets = buildSockets(points, chestForward, chestRight, torch.axis, spear.axis);
  const blendSpace = {
    forward: finite4(intent.locomotion.forward ?? 0),
    lateral: finite4(intent.locomotion.lateral ?? 0),
    speed: finite4(speed01),
    idleWeight: finite4(intent.locomotion.idleWeight ?? (1 - movingWeight)),
    walkWeight: finite4(walkWeight),
    runWeight: finite4(runWeight)
  };
  return {
    points,
    sockets,
    visualBounds: boundsFor(points, Math.max(profile.visual.boundsPadding * scale, radius * 0.35)),
    partCount: 26,
    animationState: {
      locomotionId: runWeight > 0.5 ? 'physical_run_v1' : (movingWeight > 0.08 ? 'physical_walk_v1' : 'physical_idle_v1'),
      blendSpace,
      step: finite4(intent.locomotion.stepPhase * 2 - 1),
      stride: finite4(intent.locomotion.strideLength),
      armSwing: 0,
      attackProfileId: attackState?.profileId ?? null,
      attackPhase: attackState?.phase ?? EnemyAttackPhase.IDLE,
      attackProgress01: attackState?.progress01 ?? 0,
      guardPhase: guardState?.phase ?? null,
      reactionProfileId: reactionState?.profileId ?? null,
      reactionRemaining01: reactionState?.remaining01 ?? 0,
      dodgePhase: dodgeState?.active ? dodgeState.phase : null,
      physicalIntentContract: intent.contract,
      supportFoot: intent.locomotion.supportFoot,
      leftFootPlanted: intent.contacts.left.planted,
      rightFootPlanted: intent.contacts.right.planted,
      chestTravelDelta: intent.attention.chestTravelDelta,
      impactFrozen: intent.weapon.committed,
      recoil01: recoil,
      equipment: {
        policy: intent.equipment?.policy ?? 'right_hand_spear_left_hand_torch_v1',
        spearHand: 'right',
        torchHand: 'left'
      }
    }
  };
}

function solveSpear(intent, attackState, guardState, fallbackForward, right, scale) {
  const origin = point(intent.pelvis.x, intent.pelvis.y, 1.08);
  const goal = intent.weapon.frozenImpact ?? intent.weapon.predictedImpact;
  let spearAxis = goal ? normalise(goal.x - origin.x, goal.y - origin.y, fallbackForward) : fallbackForward;
  const goalDistance = goal ? clamp(Math.hypot(goal.x - origin.x, goal.y - origin.y), 0.58, 1.28) : 0.84;
  let tipDistance = 0.84;
  let sideOffset = -0.025;
  let tipHeight = 1.18;

  if (guardState) {
    const guard01 = guardState.phase === GUARD_PHASE ? 1 : 1 - smoothstep(0.08, 1, guardState.progress01);
    spearAxis = rotateAxis(fallbackForward, right, lerp(-0.08, 1.08, guard01));
    tipDistance = lerp(0.84, 0.72, guard01);
    sideOffset = lerp(-0.025, 0.14, guard01);
    tipHeight = lerp(1.18, 1.48, guard01);
  } else if (attackState?.profileId === EnemyAttackProfileId.RAIDER_SPEAR_JAB) {
    if (attackState.phase === READY_PHASE) tipDistance = Math.min(0.86, goalDistance * 0.9);
    else if (attackState.phase === EnemyAttackPhase.WINDUP) tipDistance = lerp(Math.min(0.86, goalDistance * 0.9), 0.43, attackState.anticipation01);
    else if (attackState.phase === EnemyAttackPhase.ACTIVE) tipDistance = lerp(0.43, goalDistance, smoothstep(0.02, attackState.damageTime01, attackState.progress01));
    else if (attackState.phase === EnemyAttackPhase.RECOVER) tipDistance = lerp(goalDistance, 0.84, smoothstep(0.12, 1, attackState.progress01));
    sideOffset = attackState.phase === EnemyAttackPhase.WINDUP ? -0.055 * attackState.anticipation01 : -0.025;
    tipHeight = lerp(1.12, 1.22, attackState.strike01 ?? 0);
  }

  let tip = add3(add3(origin, spearAxis, tipDistance), right, sideOffset);
  tip.height = tipHeight;
  const recoil = intent.weapon.recoil01 ?? 0;
  tip = add3(tip, spearAxis, -0.07 * recoil);
  const frontGrip = add3(tip, spearAxis, -0.48 * scale);
  const rearGrip = add3(tip, spearAxis, -0.76 * scale);
  const butt = add3(rearGrip, spearAxis, -0.29 * scale);
  frontGrip.height = lerp(1.14, tip.height, 0.34);
  rearGrip.height = lerp(1.02, tip.height, 0.16);
  butt.height = Math.max(0.82, rearGrip.height - 0.11);
  return { axis: spearAxis, tip, frontGrip, rearGrip, butt };
}

function solveTorch(attackState, guardState, chest, forward, right, profile, scale) {
  let angle = -0.7;
  let reach = 0.3;
  let gripHeight = chest.height - 0.15;
  let tipHeight = chest.height + 0.18;
  const torchAttack = attackState?.profileId === EnemyAttackProfileId.RAIDER_TORCH_SWING;
  if (torchAttack) {
    if (attackState.phase === READY_PHASE) angle = -0.7;
    else if (attackState.phase === EnemyAttackPhase.WINDUP) angle = lerp(-0.7, -1.38, attackState.anticipation01);
    else if (attackState.phase === EnemyAttackPhase.ACTIVE) angle = lerp(-1.38, 1.03, smoothstep(0.04, 0.86, attackState.progress01));
    else if (attackState.phase === EnemyAttackPhase.RECOVER) angle = lerp(1.03, -0.7, smoothstep(0.18, 1, attackState.progress01));
    reach = lerp(0.35, 0.43, attackState.strike01 ?? 0);
    gripHeight += attackState.phase === EnemyAttackPhase.WINDUP ? 0.17 * attackState.anticipation01 : 0.05 * (attackState.strike01 ?? 0);
    tipHeight = gripHeight + lerp(0.44, 0.2, attackState.strike01 ?? 0);
  }
  if (guardState) {
    const guard01 = guardState.phase === GUARD_PHASE ? 1 : 1 - smoothstep(0.08, 1, guardState.progress01);
    angle = lerp(angle, -1.02, guard01);
    reach = lerp(reach, 0.3, guard01);
    gripHeight += 0.2 * guard01;
    tipHeight += 0.18 * guard01;
  }
  const torchAxis = rotateAxis(forward, right, angle);
  let grip = add3(chest, torchAxis, reach * scale);
  grip = add3(grip, right, -0.24 * scale);
  grip.height = gripHeight;
  const tip = add3(grip, torchAxis, profile.torch.length * 0.46 * scale);
  tip.height = tipHeight;
  const flame = add3(tip, torchAxis, profile.torch.flameRadius * 0.34 * scale);
  flame.height = tip.height + profile.torch.flameRadius * 0.72 * scale;
  return { axis: torchAxis, grip, tip, flame };
}

function solveTwoBone(start, end, upperLength, lowerLength, poleDirection) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dh = end.height - start.height;
  const distance = Math.max(0.0001, Math.hypot(dx, dy, dh));
  const upper = Math.max(upperLength, distance * 0.505);
  const lower = Math.max(lowerLength, distance * 0.505);
  const along = clamp((upper * upper - lower * lower + distance * distance) / (2 * distance), 0, distance);
  const bend = Math.sqrt(Math.max(0, upper * upper - along * along));
  const direction = { x: dx / distance, y: dy / distance, h: dh / distance };
  const poleDot = poleDirection.x * direction.x + poleDirection.y * direction.y + poleDirection.h * direction.h;
  const projected = {
    x: poleDirection.x - direction.x * poleDot,
    y: poleDirection.y - direction.y * poleDot,
    h: poleDirection.h - direction.h * poleDot
  };
  const poleLength = Math.hypot(projected.x, projected.y, projected.h) || 1;
  return point(
    start.x + direction.x * along + projected.x / poleLength * bend,
    start.y + direction.y * along + projected.y / poleLength * bend,
    start.height + direction.h * along + projected.h / poleLength * bend
  );
}

function pole(forward, right, side, height) {
  return { x: forward.x * 0.82 + right.x * side * 0.34, y: forward.y * 0.82 + right.y * side * 0.34, h: height };
}

function resolveTorsoTwist(attackState, guardState) {
  if (guardState?.phase === GUARD_PHASE) return 0.06;
  if (!attackState) return -0.04;
  if (attackState.profileId === EnemyAttackProfileId.RAIDER_TORCH_SWING) {
    if (attackState.phase === EnemyAttackPhase.WINDUP) return lerp(-0.04, -0.15, attackState.anticipation01);
    if (attackState.phase === EnemyAttackPhase.ACTIVE) return lerp(-0.15, 0.13, attackState.strike01);
    return lerp(0.13, -0.04, attackState.progress01);
  }
  if (attackState.profileId !== EnemyAttackProfileId.RAIDER_SPEAR_JAB) return -0.04;
  if (attackState.phase === EnemyAttackPhase.WINDUP) return lerp(-0.05, -0.2, attackState.anticipation01);
  if (attackState.phase === EnemyAttackPhase.ACTIVE) return lerp(-0.2, 0.08, attackState.strike01);
  if (attackState.phase === EnemyAttackPhase.RECOVER) return lerp(0.08, -0.04, attackState.progress01);
  return -0.05;
}

function buildSockets(points, forward, right, torchForward, spearForward) {
  const sockets = {
    leftHand: socket(points.leftHand, forward, right, 'left_hand_socket'),
    rightHand: socket(points.rightHand, forward, right, 'right_hand_socket'),
    leftElbow: socket(points.leftElbow, forward, right, 'left_elbow_socket'),
    rightElbow: socket(points.rightElbow, forward, right, 'right_elbow_socket'),
    leftShoulder: socket(points.leftShoulder, forward, right, 'left_shoulder_socket'),
    rightShoulder: socket(points.rightShoulder, forward, right, 'right_shoulder_socket'),
    chest: socket(points.chest, forward, right, 'chest_socket'),
    hips: socket(points.hips, forward, right, 'hips_socket'),
    back: socket(add3(points.chest, forward, -0.1), forward, right, 'back_socket'),
    head: socket(points.head, forward, right, 'head_socket'),
    leftFoot: socket(points.leftFoot, forward, right, 'left_foot_socket'),
    rightFoot: socket(points.rightFoot, forward, right, 'right_foot_socket'),
    clawHandMidpoint: socket(midpoint(points.leftHand, points.rightHand), forward, right, 'claw_hand_midpoint_socket')
  };
  const spearRight = { x: -spearForward.y, y: spearForward.x };
  sockets.spearGrip = socket(points.spearRearGrip, spearForward, spearRight, 'spear_grip_socket');
  sockets.spearFrontGrip = socket(points.spearFrontGrip, spearForward, spearRight, 'spear_front_guide_socket');
  sockets.spearRearGrip = socket(points.spearRearGrip, spearForward, spearRight, 'spear_rear_grip_socket');
  sockets.spearTip = socket(points.spearTip, spearForward, spearRight, 'spear_tip_socket');
  const torchRight = { x: -torchForward.y, y: torchForward.x };
  sockets.torchHand = socket(points.torchGrip, torchForward, torchRight, 'torch_hand_socket');
  sockets.torchTip = socket(points.torchTip, torchForward, torchRight, 'torch_tip_socket');
  sockets.torchFlame = socket(points.torchFlame, torchForward, torchRight, 'torch_flame_socket');
  return sockets;
}

function point(x, y, height) { return { x, y, height }; }
function contactPoint(value) { return point(value.x, value.y, value.height ?? 0.07); }
function withRadius(value, radius) { return { ...value, radius }; }
function withContact(value, radius, contact) { return { ...value, radius, planted: contact.planted, support: contact.support, plantId: contact.plantId, lift: contact.lift }; }
function add3(value, direction, distance) { return point(value.x + direction.x * distance, value.y + direction.y * distance, value.height); }
function midpoint(a, b) { return point((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, (a.height + b.height) * 0.5); }
function axis(angle) { return { x: Math.cos(angle), y: Math.sin(angle) }; }
function rotate(right, forward, angle) { return { x: right.x * Math.cos(angle) + forward.x * Math.sin(angle), y: right.y * Math.cos(angle) + forward.y * Math.sin(angle) }; }
function rotateAxis(forward, right, angle) { return { x: forward.x * Math.cos(angle) + right.x * Math.sin(angle), y: forward.y * Math.cos(angle) + right.y * Math.sin(angle) }; }
function normalise(x, y, fallback) { const length = Math.hypot(x, y); return length > 0.0001 ? { x: x / length, y: y / length } : { ...fallback }; }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(edge0, edge1, value) { const t = clamp((value - edge0) / Math.max(0.001, edge1 - edge0), 0, 1); return t * t * (3 - 2 * t); }
function socket(value, forward, right, role) { return { x: value.x, y: value.y, height: value.height, forward: { ...forward }, right: { ...right }, role, classification: 'projection_socket' }; }
function finite4(value) { return Number((Number(value) || 0).toFixed(4)); }

function boundsFor(points, padding) {
  const values = Object.values(points).filter((value) => Number.isFinite(value?.x) && Number.isFinite(value?.y));
  const minX = Math.min(...values.map((value) => value.x - (value.radius ?? 0)), Infinity) - padding;
  const minY = Math.min(...values.map((value) => value.y - (value.radius ?? 0)), Infinity) - padding;
  const maxX = Math.max(...values.map((value) => value.x + (value.radius ?? 0)), -Infinity) + padding;
  const maxY = Math.max(...values.map((value) => value.y + (value.radius ?? 0)), -Infinity) + padding;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}
