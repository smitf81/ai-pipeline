import { clamp } from '../core/math.js';
import { EnemyAttackPhase, EnemyAttackProfileId } from '../data/enemyAttackProfiles.js';

const READY_PHASE = 'ready';

export function buildRaiderPhysicalPose({ transform, radius, projection, profile, attackState, intent }) {
  const scale = profile.visual.scale;
  const chestForward = axis(intent.attention.chestFacing);
  const headForward = axis(intent.attention.headFacing);
  const travelForward = axis(intent.locomotion.travelFacing);
  const chestRight = { x: -chestForward.y, y: chestForward.x };
  const travelRight = { x: -travelForward.y, y: travelForward.x };
  const speed01 = intent.locomotion.speed01;
  const strideSway = Math.sin(intent.locomotion.stepPhase * Math.PI * 2) * speed01;
  const accelerationForward = clamp(
    intent.pelvis.accelerationX * travelForward.x + intent.pelvis.accelerationY * travelForward.y,
    -5,
    5
  );
  const inertiaLean = clamp(accelerationForward * 0.012, -0.055, 0.055)
    - intent.locomotion.stopping01 * 0.035;
  const recoil = intent.weapon.recoil01 ?? 0;
  const weaponGoal = intent.weapon.frozenImpact ?? intent.weapon.predictedImpact;
  const weaponForward = weaponGoal
    ? normalise(weaponGoal.x - intent.pelvis.x, weaponGoal.y - intent.pelvis.y, chestForward)
    : chestForward;

  const pelvis = point(intent.pelvis.x, intent.pelvis.y, 0.92);
  const hips = add3(pelvis, travelForward, -0.045 + inertiaLean * 0.18);
  let chest = add3(pelvis, chestForward, profile.body.torsoLength * 0.54 + inertiaLean);
  chest = add3(chest, chestRight, strideSway * 0.018);
  chest = add3(chest, weaponForward, -0.022 * recoil);
  chest.height = 1.32 - Math.abs(strideSway) * 0.018;
  let head = add3(chest, headForward, profile.head.forward * 0.74);
  head.height = 1.66 + Math.sin(projection.idlePhase * 0.5) * 0.012;

  const torsoTwist = spearTorsoTwist(attackState);
  const shoulderAxis = rotate(chestRight, chestForward, torsoTwist);
  const leftShoulder = add3(chest, shoulderAxis, -profile.body.shoulderWidth * 0.5);
  const rightShoulder = add3(chest, shoulderAxis, profile.body.shoulderWidth * 0.5);
  leftShoulder.height = rightShoulder.height = 1.34;
  leftShoulder.x -= weaponForward.x * 0.04 * recoil;
  leftShoulder.y -= weaponForward.y * 0.04 * recoil;
  rightShoulder.x -= weaponForward.x * 0.028 * recoil;
  rightShoulder.y -= weaponForward.y * 0.028 * recoil;

  const leftHip = add3(hips, travelRight, -profile.body.hipWidth * 0.5);
  const rightHip = add3(hips, travelRight, profile.body.hipWidth * 0.5);
  leftHip.height = rightHip.height = 0.91;
  const leftFoot = contactPoint(intent.contacts.left);
  const rightFoot = contactPoint(intent.contacts.right);
  const legPoleForward = speed01 > 0.05 ? travelForward : chestForward;
  const leftKnee = solveTwoBone(leftHip, leftFoot, profile.limbs.thighLength, profile.limbs.calfLength, pole(legPoleForward, travelRight, -1, 0.7));
  const rightKnee = solveTwoBone(rightHip, rightFoot, profile.limbs.thighLength, profile.limbs.calfLength, pole(legPoleForward, travelRight, 1, 0.7));

  const spear = solveSpear(intent, attackState, chestForward, chestRight, scale);
  const leftHand = spear.frontGrip;
  const rightHand = spear.rearGrip;
  const armForward = spear.axis;
  const armRight = { x: -armForward.y, y: armForward.x };
  const leftElbow = solveTwoBone(leftShoulder, leftHand, profile.limbs.upperArmLength, profile.limbs.forearmLength, pole(armForward, armRight, -1, 0.5));
  const rightElbow = solveTwoBone(rightShoulder, rightHand, profile.limbs.upperArmLength, profile.limbs.forearmLength, pole(armForward, armRight, 1, 0.5));

  const torchForward = rotateAxis(chestForward, chestRight, 0.18);
  const torchGrip = add3(rightHip, chestRight, 0.08);
  torchGrip.height = 0.98;
  const torchTip = add3(torchGrip, torchForward, profile.torch.length * scale);
  torchTip.height = 1.32;
  const torchFlame = add3(torchTip, torchForward, profile.torch.flameRadius * 0.4 * scale);
  torchFlame.height = 1.48;

  const points = {
    center: point(intent.pelvis.x, intent.pelvis.y, 1.05),
    chest,
    hips,
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
    spearButt: spear.butt,
    spearTip: spear.tip,
    spearFrontGrip: spear.frontGrip,
    spearRearGrip: spear.rearGrip,
    torchGrip,
    torchTip,
    torchFlame: withRadius(torchFlame, profile.torch.flameRadius * scale)
  };
  const sockets = buildSockets(points, chestForward, chestRight, torchForward, spear.axis);
  return {
    points,
    sockets,
    visualBounds: boundsFor(points, Math.max(profile.visual.boundsPadding * scale, radius * 0.35)),
    partCount: 23,
    animationState: {
      locomotionId: speed01 > 0.08 ? 'physical_walk_v0' : 'physical_idle_v0',
      step: Number((intent.locomotion.stepPhase * 2 - 1).toFixed(4)),
      stride: Number(intent.locomotion.strideLength.toFixed(4)),
      armSwing: 0,
      attackProfileId: attackState?.profileId ?? null,
      attackPhase: attackState?.phase ?? EnemyAttackPhase.IDLE,
      attackProgress01: attackState?.progress01 ?? 0,
      physicalIntentContract: intent.contract,
      supportFoot: intent.locomotion.supportFoot,
      leftFootPlanted: intent.contacts.left.planted,
      rightFootPlanted: intent.contacts.right.planted,
      chestTravelDelta: intent.attention.chestTravelDelta,
      impactFrozen: intent.weapon.committed,
      recoil01: recoil
    }
  };
}

function solveSpear(intent, attackState, fallbackForward, right, scale) {
  const origin = point(intent.pelvis.x, intent.pelvis.y, 1.08);
  const goal = intent.weapon.frozenImpact ?? intent.weapon.predictedImpact;
  const spearAxis = goal ? normalise(goal.x - origin.x, goal.y - origin.y, fallbackForward) : fallbackForward;
  const goalDistance = goal ? clamp(Math.hypot(goal.x - origin.x, goal.y - origin.y), 0.58, 1.28) : 0.84;
  let tipDistance = 0.84;
  if (attackState?.profileId === EnemyAttackProfileId.RAIDER_SPEAR_JAB) {
    if (attackState.phase === READY_PHASE) tipDistance = Math.min(0.86, goalDistance * 0.9);
    else if (attackState.phase === EnemyAttackPhase.WINDUP) tipDistance = lerp(Math.min(0.86, goalDistance * 0.9), 0.43, attackState.anticipation01);
    else if (attackState.phase === EnemyAttackPhase.ACTIVE) tipDistance = lerp(0.43, goalDistance, smoothstep(0.02, attackState.damageTime01, attackState.progress01));
    else if (attackState.phase === EnemyAttackPhase.RECOVER) tipDistance = lerp(goalDistance, 0.84, smoothstep(0.12, 1, attackState.progress01));
  }
  const sideOffset = attackState?.phase === EnemyAttackPhase.WINDUP ? -0.055 * attackState.anticipation01 : -0.025;
  let tip = add3(add3(origin, spearAxis, tipDistance), right, sideOffset);
  tip.height = lerp(1.12, 1.22, attackState?.strike01 ?? 0);
  const recoil = intent.weapon.recoil01 ?? 0;
  tip = add3(tip, spearAxis, -0.07 * recoil);
  const frontGrip = add3(tip, spearAxis, -0.48 * scale);
  const rearGrip = add3(tip, spearAxis, -0.76 * scale);
  const butt = add3(rearGrip, spearAxis, -0.29 * scale);
  frontGrip.height = 1.12;
  rearGrip.height = 1.02;
  butt.height = 0.91;
  return { axis: spearAxis, tip, frontGrip, rearGrip, butt };
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

function spearTorsoTwist(state) {
  if (!state || state.profileId !== EnemyAttackProfileId.RAIDER_SPEAR_JAB) return -0.04;
  if (state.phase === EnemyAttackPhase.WINDUP) return lerp(-0.05, -0.2, state.anticipation01);
  if (state.phase === EnemyAttackPhase.ACTIVE) return lerp(-0.2, 0.08, state.strike01);
  if (state.phase === EnemyAttackPhase.RECOVER) return lerp(0.08, -0.04, state.progress01);
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
  sockets.spearGrip = socket(points.spearFrontGrip, spearForward, spearRight, 'spear_grip_socket');
  sockets.spearFrontGrip = socket(points.spearFrontGrip, spearForward, spearRight, 'spear_front_grip_socket');
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

function boundsFor(points, padding) {
  const values = Object.values(points).filter((value) => Number.isFinite(value?.x) && Number.isFinite(value?.y));
  const minX = Math.min(...values.map((value) => value.x - (value.radius ?? 0)), Infinity) - padding;
  const minY = Math.min(...values.map((value) => value.y - (value.radius ?? 0)), Infinity) - padding;
  const maxX = Math.max(...values.map((value) => value.x + (value.radius ?? 0)), -Infinity) + padding;
  const maxY = Math.max(...values.map((value) => value.y + (value.radius ?? 0)), -Infinity) + padding;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}
