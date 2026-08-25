import { clamp } from '../core/math.js';
import { ComponentType } from '../constants/componentTypes.js';
import { EnemyAttackPhase, EnemyAttackProfileId, getEnemyAttackProfile } from '../data/enemyAttackProfiles.js';
import { getComponent } from '../ecs/world.js';
import { query } from '../ecs/query.js';

const TAU = Math.PI * 2;
const FOOT_SPREAD = 0.22;
const FOOT_REST_BACK = 0.18;
const FOOT_STAGGER = 0.11;
const MAX_PREDICTION_OFFSET = 0.42;
const MAX_PREDICTION_TURN = Math.PI * 0.18;
const TELEPORT_DISTANCE = 1.35;

export function raiderPhysicalMotionSystem({ game, dt }) {
  const delta = Math.max(0, Number(dt) || 0);
  for (const entity of query(game.world, [ComponentType.Transform, ComponentType.RaiderPhysicalMotion])) {
    const transform = getComponent(game.world, entity, ComponentType.Transform);
    const intent = getComponent(game.world, entity, ComponentType.RaiderPhysicalMotion);
    if (!transform || !intent?.enabled) continue;
    const health = getComponent(game.world, entity, ComponentType.Health);
    const motion = getComponent(game.world, entity, ComponentType.Motion);
    const ai = getComponent(game.world, entity, ComponentType.EnemyPressureAI);
    if (health?.alive === false) {
      settleDefeatedIntent(intent);
      continue;
    }
    updateMotionIntent(game.world, entity, transform, motion, ai, intent, delta);
  }
}

export function commitRaiderSpearImpact(world, entity, ai) {
  if (ai?.activeAttackProfileId !== EnemyAttackProfileId.RAIDER_SPEAR_JAB) return null;
  const intent = getComponent(world, entity, ComponentType.RaiderPhysicalMotion);
  const transform = getComponent(world, entity, ComponentType.Transform);
  if (!intent || !transform) return null;
  const fallback = currentTargetPoint(world, ai.pendingAttackTargetId) ?? {
    x: transform.x + Math.cos(transform.rotation ?? 0) * getEnemyAttackProfile(EnemyAttackProfileId.RAIDER_SPEAR_JAB).weaponReach,
    y: transform.y + Math.sin(transform.rotation ?? 0) * getEnemyAttackProfile(EnemyAttackProfileId.RAIDER_SPEAR_JAB).weaponReach
  };
  const point = intent.weapon.predictedImpact ?? fallback;
  intent.weapon.frozenImpact = { x: point.x, y: point.y };
  intent.weapon.committed = true;
  intent.weapon.commitUpdate = intent.updateCount;
  intent.weapon.phase = EnemyAttackPhase.ACTIVE;
  const origin = intent.pelvis ?? transform;
  const facing = Math.atan2(point.y - origin.y, point.x - origin.x);
  intent.attention.chestFacing = facing;
  intent.attention.headFacing = facing;
  transform.rotation = facing;
  return intent.weapon.frozenImpact;
}

export function registerRaiderSpearRecoil(world, entity, hitCount) {
  const intent = getComponent(world, entity, ComponentType.RaiderPhysicalMotion);
  if (!intent || intent.weapon.profileId !== EnemyAttackProfileId.RAIDER_SPEAR_JAB || hitCount <= 0) return false;
  intent.weapon.recoilTimer = intent.weapon.recoilDuration;
  intent.weapon.recoil01 = 1;
  intent.weapon.contactCount += 1;
  intent.weapon.lastContactHitCount = hitCount;
  return true;
}

export function solveClampedImpactPoint(origin, target, velocity, remainingWindup, weaponReach) {
  const direct = normalise(target.x - origin.x, target.y - origin.y, { x: 1, y: 0 });
  const leadSeconds = clamp(Number(remainingWindup) || 0, 0, 0.36);
  const rawOffsetX = (Number(velocity.x) || 0) * leadSeconds;
  const rawOffsetY = (Number(velocity.y) || 0) * leadSeconds;
  const rawOffsetLength = Math.hypot(rawOffsetX, rawOffsetY);
  const offsetScale = rawOffsetLength > MAX_PREDICTION_OFFSET ? MAX_PREDICTION_OFFSET / rawOffsetLength : 1;
  const led = {
    x: target.x + rawOffsetX * offsetScale,
    y: target.y + rawOffsetY * offsetScale
  };
  const ledDirection = normalise(led.x - origin.x, led.y - origin.y, direct);
  const directAngle = Math.atan2(direct.y, direct.x);
  const rawTurn = shortestAngle(Math.atan2(ledDirection.y, ledDirection.x) - directAngle);
  const turn = clamp(rawTurn, -MAX_PREDICTION_TURN, MAX_PREDICTION_TURN);
  const direction = { x: Math.cos(directAngle + turn), y: Math.sin(directAngle + turn) };
  const distance = Math.min(Math.max(0.58, Math.hypot(led.x - origin.x, led.y - origin.y)), Math.max(0.58, weaponReach));
  return {
    point: { x: origin.x + direction.x * distance, y: origin.y + direction.y * distance },
    leadSeconds,
    offset: Math.min(rawOffsetLength, MAX_PREDICTION_OFFSET),
    turnRadians: turn,
    clamped: rawOffsetLength > MAX_PREDICTION_OFFSET + 0.0001 || Math.abs(rawTurn) > MAX_PREDICTION_TURN + 0.0001
  };
}

function updateMotionIntent(world, entity, transform, motion, ai, intent, dt) {
  intent.updateCount += 1;
  const previousSourceX = Number.isFinite(intent.sourceX) ? intent.sourceX : transform.x;
  const previousSourceY = Number.isFinite(intent.sourceY) ? intent.sourceY : transform.y;
  const sourceDx = transform.x - previousSourceX;
  const sourceDy = transform.y - previousSourceY;
  intent.sourceX = transform.x;
  intent.sourceY = transform.y;
  if (Math.hypot(sourceDx, sourceDy) > TELEPORT_DISTANCE) rebaseIntent(intent, transform);

  const measuredX = dt > 0 ? sourceDx / dt : 0;
  const measuredY = dt > 0 ? sourceDy / dt : 0;
  const maxObservedSpeed = Math.max(1, Number(motion?.speed ?? 3.1) * 1.55);
  const measured = limitVector(measuredX, measuredY, maxObservedSpeed);
  const oldVelocityX = intent.pelvis.velocityX;
  const oldVelocityY = intent.pelvis.velocityY;
  const response = dt > 0 ? 1 - Math.exp(-dt * (Math.hypot(measured.x, measured.y) > 0.03 ? 13 : 7.5)) : 0;
  intent.pelvis.measuredVelocityX = measured.x;
  intent.pelvis.measuredVelocityY = measured.y;
  intent.pelvis.velocityX = lerp(oldVelocityX, measured.x, response);
  intent.pelvis.velocityY = lerp(oldVelocityY, measured.y, response);
  intent.pelvis.accelerationX = dt > 0 ? (intent.pelvis.velocityX - oldVelocityX) / dt : 0;
  intent.pelvis.accelerationY = dt > 0 ? (intent.pelvis.velocityY - oldVelocityY) / dt : 0;

  updateLocomotionState(intent, transform, motion, dt);
  updateAttention(world, ai, intent, transform, dt);
  updateLocomotionBlend(intent);
  updateWeaponPrediction(world, entity, ai, intent);
  updateAttackWeight(intent, ai, dt);
  updateFootContacts(intent, transform, ai, dt);
  updatePelvisPosition(intent, transform, dt);
  updateContinuity(intent, ai);
}

function updateLocomotionState(intent, transform, motion, dt) {
  const measuredSpeed = Math.hypot(intent.pelvis.measuredVelocityX, intent.pelvis.measuredVelocityY);
  const filteredSpeed = Math.hypot(intent.pelvis.velocityX, intent.pelvis.velocityY);
  const maxSpeed = Math.max(0.1, Number(motion?.speed ?? 3.1));
  const wasMoving = intent.locomotion.moving;
  const moving = measuredSpeed > 0.035 || filteredSpeed > 0.11;
  if (filteredSpeed > 0.05) intent.locomotion.travelFacing = Math.atan2(intent.pelvis.velocityY, intent.pelvis.velocityX);
  else if (!wasMoving) intent.locomotion.travelFacing = transform.rotation ?? intent.locomotion.travelFacing;
  intent.locomotion.speed = filteredSpeed;
  intent.locomotion.speed01 = clamp(filteredSpeed / maxSpeed, 0, 1);
  intent.locomotion.maxSpeed = maxSpeed;
  intent.locomotion.moving = moving;
  intent.locomotion.starting01 = approach(intent.locomotion.starting01, measuredSpeed > 0.08 ? 1 : 0, dt, 8);
  intent.locomotion.stopping01 = approach(intent.locomotion.stopping01, measuredSpeed <= 0.035 && filteredSpeed > 0.05 ? 1 : 0, dt, 7);
  intent.locomotion.cadence = moving ? clamp(filteredSpeed / 0.38, 2.2, 8.6) : 0;
  intent.attention.travelFacing = intent.locomotion.travelFacing;
  if (!wasMoving && moving) beginSwing(intent, transform);
  if (wasMoving && !moving) plantBothFeet(intent);
}

function updateLocomotionBlend(intent) {
  const chestForward = axis(intent.attention.chestFacing);
  const chestRight = { x: -chestForward.y, y: chestForward.x };
  const maxSpeed = Math.max(0.1, Number(intent.locomotion.maxSpeed) || 3.1);
  intent.locomotion.forward = clamp(
    (intent.pelvis.velocityX * chestForward.x + intent.pelvis.velocityY * chestForward.y) / maxSpeed,
    -1,
    1
  );
  intent.locomotion.lateral = clamp(
    (intent.pelvis.velocityX * chestRight.x + intent.pelvis.velocityY * chestRight.y) / maxSpeed,
    -1,
    1
  );
  const movingWeight = smoothstep(0.04, 0.12, intent.locomotion.speed01);
  intent.locomotion.runWeight = movingWeight * smoothstep(0.55, 0.8, intent.locomotion.speed01);
  intent.locomotion.walkWeight = movingWeight - intent.locomotion.runWeight;
  intent.locomotion.idleWeight = 1 - movingWeight;
}

function updateAttention(world, ai, intent, transform, dt) {
  const targetId = ai?.pendingAttackTargetId ?? ai?.targetId ?? null;
  const target = currentTargetPoint(world, targetId);
  updateTargetVelocity(intent.targetTrack, targetId, target, dt);
  let desired = intent.locomotion.travelFacing;
  if (target) {
    intent.attention.targetId = targetId;
    intent.attention.targetX = target.x;
    intent.attention.targetY = target.y;
    desired = Math.atan2(target.y - intent.pelvis.y, target.x - intent.pelvis.x);
  } else {
    intent.attention.targetId = null;
    intent.attention.targetX = null;
    intent.attention.targetY = null;
  }
  if (intent.weapon.committed && intent.weapon.frozenImpact) {
    desired = Math.atan2(intent.weapon.frozenImpact.y - intent.pelvis.y, intent.weapon.frozenImpact.x - intent.pelvis.x);
  }
  intent.attention.chestFacing = rotateToward(intent.attention.chestFacing, desired, dt * 7.8);
  intent.attention.headFacing = rotateToward(intent.attention.headFacing, desired, dt * 11.5);
  intent.attention.chestTravelDelta = shortestAngle(intent.attention.chestFacing - intent.locomotion.travelFacing);
  intent.attention.headChestDelta = shortestAngle(intent.attention.headFacing - intent.attention.chestFacing);
}

function updateTargetVelocity(track, targetId, target, dt) {
  if (!target || targetId !== track.targetId) {
    track.targetId = target ? targetId : null;
    track.lastX = target?.x ?? null;
    track.lastY = target?.y ?? null;
    track.velocityX = 0;
    track.velocityY = 0;
    return;
  }
  if (dt > 0 && Number.isFinite(track.lastX) && Number.isFinite(track.lastY)) {
    const raw = limitVector((target.x - track.lastX) / dt, (target.y - track.lastY) / dt, 5.2);
    track.velocityX = lerp(track.velocityX, raw.x, 0.46);
    track.velocityY = lerp(track.velocityY, raw.y, 0.46);
  }
  track.lastX = target.x;
  track.lastY = target.y;
}

function updateWeaponPrediction(world, entity, ai, intent) {
  const spearBusy = ai?.activeAttackProfileId === EnemyAttackProfileId.RAIDER_SPEAR_JAB
    && [EnemyAttackPhase.WINDUP, EnemyAttackPhase.ACTIVE, EnemyAttackPhase.RECOVER].includes(ai.attackPhase);
  if (!spearBusy) {
    intent.weapon.profileId = null;
    intent.weapon.phase = EnemyAttackPhase.IDLE;
    intent.weapon.predictedImpact = null;
    intent.weapon.frozenImpact = null;
    intent.weapon.committed = false;
    intent.weapon.commitUpdate = null;
    return;
  }
  intent.weapon.profileId = EnemyAttackProfileId.RAIDER_SPEAR_JAB;
  intent.weapon.phase = ai.attackPhase;
  if (ai.attackPhase !== EnemyAttackPhase.WINDUP || intent.weapon.committed) return;
  const target = currentTargetPoint(world, ai.pendingAttackTargetId);
  if (!target) return;
  const profile = getEnemyAttackProfile(EnemyAttackProfileId.RAIDER_SPEAR_JAB);
  const prediction = solveClampedImpactPoint(
    intent.pelvis,
    target,
    { x: intent.targetTrack.velocityX, y: intent.targetTrack.velocityY },
    ai.attackTimer,
    profile.weaponReach
  );
  intent.weapon.predictedImpact = prediction.point;
  intent.weapon.predictionLeadSeconds = prediction.leadSeconds;
  intent.weapon.predictionOffset = prediction.offset;
  intent.weapon.predictionClamped = prediction.clamped;
  intent.weapon.predictionTurnRadians = prediction.turnRadians;
  const facing = Math.atan2(prediction.point.y - intent.pelvis.y, prediction.point.x - intent.pelvis.x);
  intent.attention.chestFacing = rotateToward(intent.attention.chestFacing, facing, 0.2);
}

function updateAttackWeight(intent, ai, dt) {
  const profile = ai?.activeAttackProfileId === EnemyAttackProfileId.RAIDER_SPEAR_JAB
    ? getEnemyAttackProfile(EnemyAttackProfileId.RAIDER_SPEAR_JAB)
    : null;
  let shift = 0;
  let weightBias = 0;
  if (profile && ai.attackPhase === EnemyAttackPhase.WINDUP) {
    const progress = progress01(ai.attackTimer, profile.windup);
    shift = -0.18 * smooth(progress);
    weightBias = -0.85 * smooth(progress);
  } else if (profile && ai.attackPhase === EnemyAttackPhase.ACTIVE) {
    const progress = progress01(ai.attackTimer, profile.active);
    shift = lerp(-0.18, 0.23, smooth(progress));
    weightBias = lerp(-0.85, 0.64, smooth(progress));
  } else if (profile && ai.attackPhase === EnemyAttackPhase.RECOVER) {
    const progress = progress01(ai.attackTimer, profile.recovery);
    shift = 0.23 * (1 - smooth(progress));
    weightBias = 0.64 * (1 - smooth(progress));
  }
  const forward = axis(intent.attention.chestFacing);
  intent.pelvis.attackShiftX = forward.x * shift;
  intent.pelvis.attackShiftY = forward.y * shift;
  intent.pelvis.weightBias = weightBias;
  intent.weapon.recoilTimer = Math.max(0, intent.weapon.recoilTimer - dt);
  intent.weapon.recoil01 = intent.weapon.recoilDuration > 0 ? clamp(intent.weapon.recoilTimer / intent.weapon.recoilDuration, 0, 1) : 0;
  intent.pelvis.recoilShiftX = -forward.x * 0.012 * intent.weapon.recoil01;
  intent.pelvis.recoilShiftY = -forward.y * 0.012 * intent.weapon.recoil01;
}

function updateFootContacts(intent, transform, ai, dt) {
  const attackLocked = [EnemyAttackPhase.WINDUP, EnemyAttackPhase.ACTIVE, EnemyAttackPhase.RECOVER].includes(ai?.attackPhase);
  if (attackLocked) {
    if (intent.continuity.lastPhase === EnemyAttackPhase.IDLE) chooseRearSupport(intent);
    plantBothFeet(intent, intent.locomotion.supportFoot);
    return;
  }
  if (!intent.locomotion.moving || dt <= 0) return;
  intent.locomotion.stepPhase += dt * intent.locomotion.cadence;
  while (intent.locomotion.stepPhase >= 1) {
    intent.locomotion.stepPhase -= 1;
    completeSwing(intent);
    beginSwing(intent, transform);
  }
  updateSwing(intent);
}

function beginSwing(intent, transform) {
  const swing = intent.contacts[intent.locomotion.swingFoot];
  const forward = axis(intent.locomotion.travelFacing);
  const right = { x: -forward.y, y: forward.x };
  const side = intent.locomotion.swingFoot === 'left' ? -1 : 1;
  const speed01 = intent.locomotion.speed01;
  const reach = lerp(0.17, 0.34, speed01);
  swing.swingStartX = swing.x;
  swing.swingStartY = swing.y;
  swing.targetX = transform.x + forward.x * reach + right.x * side * FOOT_SPREAD;
  swing.targetY = transform.y + forward.y * reach + right.y * side * FOOT_SPREAD;
  swing.planted = false;
  swing.support = false;
  intent.contacts[intent.locomotion.supportFoot].support = true;
  intent.contacts[intent.locomotion.supportFoot].planted = true;
  intent.locomotion.strideLength = Math.hypot(swing.targetX - swing.x, swing.targetY - swing.y);
}

function updateSwing(intent) {
  const swing = intent.contacts[intent.locomotion.swingFoot];
  if (!Number.isFinite(swing.targetX) || !Number.isFinite(swing.swingStartX)) return;
  const t = smooth(intent.locomotion.stepPhase);
  swing.x = lerp(swing.swingStartX, swing.targetX, t);
  swing.y = lerp(swing.swingStartY, swing.targetY, t);
  swing.lift = Math.sin(Math.PI * clamp(intent.locomotion.stepPhase, 0, 1)) * 0.13;
  swing.height = 0.07 + swing.lift;
}

function completeSwing(intent) {
  const oldSupportName = intent.locomotion.supportFoot;
  const newSupportName = intent.locomotion.swingFoot;
  const newSupport = intent.contacts[newSupportName];
  if (Number.isFinite(newSupport.targetX)) {
    newSupport.x = newSupport.targetX;
    newSupport.y = newSupport.targetY;
  }
  newSupport.height = 0.07;
  newSupport.lift = 0;
  newSupport.planted = true;
  newSupport.support = true;
  newSupport.plantId += 1;
  const oldSupport = intent.contacts[oldSupportName];
  oldSupport.support = false;
  intent.locomotion.supportFoot = newSupportName;
  intent.locomotion.swingFoot = oldSupportName;
  intent.continuity.plantSwitchCount += 1;
  intent.continuity[`${newSupportName}PlantCount`] += 1;
}

function chooseRearSupport(intent) {
  const forward = axis(intent.attention.chestFacing);
  const left = intent.contacts.left;
  const right = intent.contacts.right;
  const leftDepth = left.x * forward.x + left.y * forward.y;
  const rightDepth = right.x * forward.x + right.y * forward.y;
  intent.locomotion.supportFoot = leftDepth <= rightDepth ? 'left' : 'right';
  intent.locomotion.swingFoot = intent.locomotion.supportFoot === 'left' ? 'right' : 'left';
}

function plantBothFeet(intent, supportName = intent.locomotion.supportFoot) {
  for (const [name, contact] of Object.entries(intent.contacts)) {
    contact.planted = true;
    contact.support = name === supportName;
    contact.height = 0.07;
    contact.lift = 0;
  }
}

function updatePelvisPosition(intent, transform, dt) {
  const velocityLag = 0.028 + intent.locomotion.stopping01 * 0.02;
  const desiredX = transform.x - intent.pelvis.velocityX * velocityLag + intent.pelvis.attackShiftX + intent.pelvis.recoilShiftX;
  const desiredY = transform.y - intent.pelvis.velocityY * velocityLag + intent.pelvis.attackShiftY + intent.pelvis.recoilShiftY;
  const response = dt > 0 ? 1 - Math.exp(-dt * 18) : 1;
  intent.pelvis.x = lerp(intent.pelvis.x, desiredX, response);
  intent.pelvis.y = lerp(intent.pelvis.y, desiredY, response);
}

function updateContinuity(intent, ai) {
  const phase = ai?.attackPhase ?? EnemyAttackPhase.IDLE;
  if (phase !== intent.continuity.lastPhase && Math.hypot(intent.pelvis.velocityX, intent.pelvis.velocityY) > 0.02) {
    intent.continuity.preservedVelocityTransitions += 1;
  }
  intent.continuity.lastPhase = phase;
  intent.continuity.lastSupportFoot = intent.locomotion.supportFoot;
}

function rebaseIntent(intent, transform) {
  const forward = axis(transform.rotation ?? intent.locomotion.travelFacing);
  const right = { x: -forward.y, y: forward.x };
  intent.pelvis.x = transform.x;
  intent.pelvis.y = transform.y;
  for (const [name, contact] of Object.entries(intent.contacts)) {
    const side = name === 'left' ? -1 : 1;
    contact.x = transform.x + right.x * side * FOOT_SPREAD + forward.x * side * FOOT_STAGGER - forward.x * FOOT_REST_BACK;
    contact.y = transform.y + right.y * side * FOOT_SPREAD + forward.y * side * FOOT_STAGGER - forward.y * FOOT_REST_BACK;
    contact.height = 0.07;
    contact.planted = true;
    contact.lift = 0;
  }
}

function settleDefeatedIntent(intent) {
  intent.locomotion.moving = false;
  intent.locomotion.speed = 0;
  intent.locomotion.speed01 = 0;
  intent.locomotion.forward = 0;
  intent.locomotion.lateral = 0;
  intent.locomotion.idleWeight = 1;
  intent.locomotion.walkWeight = 0;
  intent.locomotion.runWeight = 0;
  intent.weapon.phase = EnemyAttackPhase.IDLE;
  intent.weapon.committed = false;
  plantBothFeet(intent);
}

function currentTargetPoint(world, entity) {
  if (!entity) return null;
  const transform = getComponent(world, entity, ComponentType.Transform);
  const health = getComponent(world, entity, ComponentType.Health);
  return transform && health?.alive !== false ? { x: transform.x, y: transform.y } : null;
}

function progress01(timer, duration) { return duration > 0 ? clamp(1 - (Number(timer) || 0) / duration, 0, 1) : 1; }
function approach(value, target, dt, rate) { return lerp(value, target, dt > 0 ? 1 - Math.exp(-dt * rate) : 0); }
function axis(angle) { return { x: Math.cos(angle), y: Math.sin(angle) }; }
function lerp(a, b, t) { return a + (b - a) * t; }
function smooth(value) { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); }
function smoothstep(edge0, edge1, value) { return smooth((value - edge0) / Math.max(0.0001, edge1 - edge0)); }
function shortestAngle(value) { return ((value + Math.PI) % TAU + TAU) % TAU - Math.PI; }
function rotateToward(current, target, amount) { return current + clamp(shortestAngle(target - current), -amount, amount); }
function normalise(x, y, fallback) { const length = Math.hypot(x, y); return length > 0.0001 ? { x: x / length, y: y / length } : { ...fallback }; }
function limitVector(x, y, limit) { const length = Math.hypot(x, y); const scale = length > limit ? limit / length : 1; return { x: x * scale, y: y * scale }; }
