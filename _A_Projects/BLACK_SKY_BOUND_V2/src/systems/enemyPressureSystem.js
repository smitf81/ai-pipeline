import { ComponentType } from '../constants/componentTypes.js';
import { getComponent } from '../ecs/world.js';
import { query } from '../ecs/query.js';
import { moveEntityWithSteering } from './movementSystem.js';
import { findDragonSmokeConcealment, smokeAt } from './smokeSystem.js';
import { entityDistance } from './combatSystem.js';
import { EnemyPressureState, isEnemyPressureState } from '../constants/enemyPressureStates.js';
import { clamp } from '../core/math.js';
import { SMOKE_TACTICS } from '../data/smokeTactics.js';
import {
  EnemyAttackPhase,
  EnemyAttackProfileId,
  getEnemyAttackRange,
  isEnemyAttackProfileId
} from '../data/enemyAttackProfiles.js';
import { beginEnemyAttack, isEnemyAttackBusy, resetEnemyAttack } from './enemyAttackSystem.js';
import { tryStartThreatDodge } from './dodgeState.js';
import { hydrateEnemySmokeSearchState, updateEnemySmokeTactics } from './enemySmokeSearchState.js';
import { findNearestHostileEntity, resolveValidEnemyTarget } from './enemyTargetSelection.js';

export { findNearestHostileEntity } from './enemyTargetSelection.js';

const RETURN_DISTANCE = 0.35;
const ROAM_TARGET_DISTANCE = 0.3;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const STUCK_POSITION_EPSILON = 0.012;
const STUCK_DISTANCE_EPSILON = 0.018;
const STUCK_PROGRESS_WINDOW_SECONDS = 0.18;
const STUCK_FORCE_RETREAT_SECONDS = 0.82;
const UNSTICK_HOLD_SECONDS = 0.24;
const REPATH_PAUSE_SECONDS = 0.2;
const RETREAT_SECONDS = 0.32;
const TARGET_RESET_DISTANCE = 0.65;
const UNSTICK_CANDIDATES = Object.freeze([
  { mode: 'forward_left', forward: 0.62, side: 0.86 },
  { mode: 'forward_right', forward: 0.62, side: -0.86 },
  { mode: 'side_left', forward: 0, side: 1 },
  { mode: 'side_right', forward: 0, side: -1 },
  { mode: 'back_left', forward: -0.38, side: 0.78 },
  { mode: 'back_right', forward: -0.38, side: -0.78 }
]);
const RETREAT_CANDIDATES = Object.freeze([
  { mode: 'retreat_back_left', forward: -0.86, side: 0.54 },
  { mode: 'retreat_back_right', forward: -0.86, side: -0.54 },
  { mode: 'retreat_side_left', forward: -0.24, side: 1 },
  { mode: 'retreat_side_right', forward: -0.24, side: -1 }
]);

export function enemyPressureSystem({ game, map, dt }) {
  const delta = Math.max(0, Number(dt) || 0);
  const playerTransform = getComponent(game.world, game.dragonId, ComponentType.Transform);
  const playerHealth = getComponent(game.world, game.dragonId, ComponentType.Health);
  const playerSmoke = playerTransform && playerHealth?.alive
    ? findDragonSmokeConcealment(game, playerTransform.x, playerTransform.y, {
      minimumDensity: SMOKE_TACTICS.concealmentDensityThreshold
    })
    : null;
  for (const enemy of query(game.world, [ComponentType.EnemyPressureAI, ComponentType.Transform, ComponentType.Motion, ComponentType.Cooldowns, ComponentType.Health, ComponentType.Team])) {
    const health = getComponent(game.world, enemy, ComponentType.Health);
    if (!health.alive) continue;
    const transform = getComponent(game.world, enemy, ComponentType.Transform);
    const ai = getComponent(game.world, enemy, ComponentType.EnemyPressureAI);
    if (ai.disabled === true) continue;
    ensureEnemyPressureState(ai, transform);
    ai.elapsed += delta;
    ai.decisionCooldown = Math.max(0, ai.decisionCooldown - delta);
    ai.roamTargetCooldown = Math.max(0, ai.roamTargetCooldown - delta);
    ai.repathPauseTimer = Math.max(0, ai.repathPauseTimer - delta);
    ai.retreatTimer = Math.max(0, ai.retreatTimer - delta);
    ai.guardHoldTimer = Math.max(0, ai.guardHoldTimer - delta);
    ai.guardCooldownTimer = Math.max(0, ai.guardCooldownTimer - delta);
    ai.guardRecoveryTimer = Math.max(0, ai.guardRecoveryTimer - delta);
    const cooldowns = getComponent(game.world, enemy, ComponentType.Cooldowns);
    ai.cooldownTimer = Math.max(0, Number(cooldowns.attack) || 0);
    const status = getComponent(game.world, enemy, ComponentType.StatusEffects) ?? {};
    const impact = getComponent(game.world, enemy, ComponentType.ImpactResponse) ?? {};
    const smoke = smokeAt(game, transform.x, transform.y);
    const enemySmoke = findDragonSmokeConcealment(game, transform.x, transform.y, {
      minimumDensity: SMOKE_TACTICS.concealmentDensityThreshold
    });
    const staggerMul = impact.staggerTimer > 0 ? 0.35 : 1;
    const speedMul = (smoke ? smoke.slowMultiplier : status.panicTimer > 0 ? 0.7 : 1) * staggerMul;
    if (getComponent(game.world, enemy, ComponentType.DodgeState)?.active) {
      if (ai.state !== EnemyPressureState.SEARCH) setEnemyPressureState(ai, EnemyPressureState.ALERT);
      continue;
    }

    if (ai.retreatTimer > 0 && ai.retreatTargetX != null && ai.retreatTargetY != null) {
      clearEnemyTarget(ai);
      resetEnemyAttack(ai);
      setEnemyPressureState(ai, EnemyPressureState.ALERT);
      moveToward(game.world, enemy, transform, ai.retreatTargetX, ai.retreatTargetY, delta * speedMul, map, 0.12, ai);
      continue;
    }

    const anchorDistance = Math.hypot(transform.x - ai.anchorX, transform.y - ai.anchorY);
    if (ai.state === EnemyPressureState.RETURN || anchorDistance > ai.leashRange) {
      clearEnemyTarget(ai);
      resetEnemyAttack(ai);
      if (anchorDistance > RETURN_DISTANCE) {
        setEnemyPressureState(ai, EnemyPressureState.RETURN);
        moveToward(game.world, enemy, transform, ai.anchorX, ai.anchorY, delta * speedMul, map, RETURN_DISTANCE, ai);
        continue;
      }
      setEnemyPressureState(ai, EnemyPressureState.ROAM);
      ai.decisionCooldown = 0;
      ai.roamTargetCooldown = 0;
    }

    const smokeTactics = updateEnemySmokeTactics({
      game, map, enemy, transform, ai, cooldowns, playerTransform, playerHealth, playerSmoke, enemySmoke,
      delta,
      speedMultiplier: speedMul,
      moveSearch: (x, y, searchDt) => moveToward(game.world, enemy, transform, x, y, searchDt, map, ROAM_TARGET_DISTANCE, ai)
    });
    if (smokeTactics.handled) continue;
    const { playerHiddenFromEnemy } = smokeTactics;

    let target = resolveValidEnemyTarget(game.world, enemy, ai);
    if (!target && ai.targetId) clearEnemyTarget(ai);
    if (isEnemyAttackBusy(ai)) {
      setEnemyPressureState(ai, EnemyPressureState.ATTACK);
      continue;
    }
    if (ai.decisionCooldown <= 0) {
      target = findNearestHostileEntity(game.world, enemy, ai.aggroRange, {
        anchorX: ai.anchorX,
        anchorY: ai.anchorY,
        leashRange: ai.leashRange,
        excludedEntityIds: playerHiddenFromEnemy ? [game.dragonId] : []
      });
      ai.targetId = target;
      ai.decisionCooldown = ai.decisionInterval;
    }

    if (target && tryStartThreatDodge(game.world, enemy, target)) {
      setEnemyPressureState(ai, EnemyPressureState.ALERT);
      continue;
    }

    if (target) {
      const targetTransform = getComponent(game.world, target, ComponentType.Transform);
      const distance = entityDistance(game.world, enemy, target);
      if (distance <= ai.attackRange) {
        setEnemyPressureState(ai, EnemyPressureState.ATTACK);
        if (cooldowns.attack <= 0) {
          const profile = beginEnemyAttack(game.world, enemy, ai, target);
          if (profile && smoke) ai.pendingAttackCooldown = Math.max(1.6, profile.cooldown);
        }
      } else {
        setEnemyPressureState(ai, EnemyPressureState.ALERT);
        const engagement = getEngagementPoint(game.world, enemy, target, ai.attackRange);
        ai.engagementTargetX = engagement.x;
        ai.engagementTargetY = engagement.y;
        ai.engagementSlotAngle = engagement.angle;
        ai.engagementDistance = engagement.distance;
        if (holdRaiderGuardPosition(game.world, enemy, transform, targetTransform, distance, ai)) continue;
        moveToward(game.world, enemy, transform, engagement.x, engagement.y, delta * speedMul, map, 0.12, ai);
      }
      continue;
    }

    setEnemyPressureState(ai, EnemyPressureState.ROAM);
    updateRoamTarget(enemy, ai, transform, map);
    moveToward(game.world, enemy, transform, ai.roamTargetX, ai.roamTargetY, delta * speedMul, map, ROAM_TARGET_DISTANCE, ai);
  }
}

export function getEngagementPoint(world, source, target, attackRange) {
  const sourceTransform = getComponent(world, source, ComponentType.Transform);
  const targetTransform = getComponent(world, target, ComponentType.Transform);
  const sourceRadius = getComponent(world, source, ComponentType.Collider)?.radius ?? 0;
  const targetRadius = getComponent(world, target, ComponentType.Collider)?.radius ?? 0;
  const safeRange = Math.max(0.1, Number(attackRange) || 0.82);
  const bodyClearance = sourceRadius + targetRadius + 0.06;
  const preferredDistance = Math.min(safeRange * 0.9, Math.max(bodyClearance, safeRange * 0.72));
  const angle = deterministicSlotAngle(source, target);
  return {
    x: targetTransform.x + Math.cos(angle) * preferredDistance,
    y: targetTransform.y + Math.sin(angle) * preferredDistance,
    angle,
    distance: preferredDistance,
    sourceDistance: Math.hypot(targetTransform.x - sourceTransform.x, targetTransform.y - sourceTransform.y)
  };
}

function moveToward(world, entity, transform, x, y, dt, map, stopDistance, ai) {
  const dx = x - transform.x;
  const dy = y - transform.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= stopDistance) {
    ai.movementBlocked = false;
    ai.usedObstacleSteering = false;
    ai.usedStuckRecovery = false;
    clearUnstickDirection(ai);
    resetEnemyMovementProgress(ai, transform, x, y);
    return;
  }
  ai.unstickCooldown = Math.max(0, ai.unstickCooldown - dt);
  const desiredX = dx / distance;
  const desiredY = dy / distance;
  const targetShift = ai.attemptedTargetX == null || ai.attemptedTargetY == null
    ? 0
    : Math.hypot(x - ai.attemptedTargetX, y - ai.attemptedTargetY);
  if (targetShift > TARGET_RESET_DISTANCE) resetEnemyMovementProgress(ai, transform, x, y);
  ai.attemptedTargetX = x;
  ai.attemptedTargetY = y;

  const beforeX = transform.x;
  const beforeY = transform.y;
  const beforeDistance = distance;
  let result = null;
  let usedStuckRecovery = false;
  let recoveryMode = null;

  if (ai.unstickCooldown > 0 && Math.hypot(ai.currentUnstickDirectionX, ai.currentUnstickDirectionY) > 0.001) {
    result = moveEntityWithSteering(world, entity, ai.currentUnstickDirectionX, ai.currentUnstickDirectionY, dt, map);
    usedStuckRecovery = result.moved;
    recoveryMode = result.moved ? ai.currentUnstickMode : null;
    if (!result.moved) clearUnstickDirection(ai);
  }

  const shouldPreferRecovery = ai.timeSinceMeaningfulProgress >= STUCK_PROGRESS_WINDOW_SECONDS
    || ai.failedMoveCount >= 2
    || ai.repathPauseTimer > 0;
  if (!result?.moved && shouldPreferRecovery) {
    const recovery = tryLocalUnstick(world, entity, desiredX, desiredY, dt, map, ai, ai.timeSinceMeaningfulProgress >= STUCK_FORCE_RETREAT_SECONDS);
    if (recovery?.moved) {
      result = recovery;
      usedStuckRecovery = true;
      recoveryMode = recovery.recoveryMode;
    }
  }

  if (!result?.moved) result = moveEntityWithSteering(world, entity, desiredX, desiredY, dt, map);
  if (!result.moved && result.blocked) {
    const recovery = tryLocalUnstick(world, entity, desiredX, desiredY, dt, map, ai, ai.timeSinceMeaningfulProgress >= STUCK_FORCE_RETREAT_SECONDS);
    if (recovery?.moved) {
      result = recovery;
      usedStuckRecovery = true;
      recoveryMode = recovery.recoveryMode;
    }
  }

  const progress = recordEnemyMovementProgress(ai, transform, beforeX, beforeY, beforeDistance, x, y, dt, result);
  ai.lastSteeringAngleDegrees = result.steeringAngleDegrees;
  ai.usedObstacleSteering = result.moved && (result.steeringAngleDegrees !== 0 || usedStuckRecovery);
  ai.usedStuckRecovery = usedStuckRecovery;
  ai.currentUnstickMode = usedStuckRecovery ? recoveryMode : (ai.unstickCooldown > 0 ? ai.currentUnstickMode : null);
  ai.movementBlocked = !result.moved && result.blocked;
  if (ai.usedObstacleSteering) ai.steeringSuccessCount += 1;
  if (ai.movementBlocked) ai.blockedMoveCount += 1;
  if (!usedStuckRecovery && progress.distanceReduced > STUCK_DISTANCE_EPSILON) clearUnstickDirection(ai);
  if (ai.timeSinceMeaningfulProgress >= STUCK_FORCE_RETREAT_SECONDS && ai.retreatTimer <= 0) {
    beginShortRetreat(ai, transform, desiredX, desiredY, entity);
  }
}

function tryLocalUnstick(world, entity, desiredX, desiredY, dt, map, ai, preferRetreat = false) {
  const candidates = buildUnstickCandidates(entity, desiredX, desiredY, preferRetreat);
  for (const candidate of candidates) {
    const result = moveEntityWithSteering(world, entity, candidate.x, candidate.y, dt, map);
    if (!result.moved) continue;
    ai.currentUnstickDirectionX = candidate.x;
    ai.currentUnstickDirectionY = candidate.y;
    ai.currentUnstickMode = candidate.mode;
    ai.unstickCooldown = UNSTICK_HOLD_SECONDS;
    ai.stuckRecoveryCount += 1;
    return {
      ...result,
      recoveryMode: candidate.mode
    };
  }
  return null;
}

function buildUnstickCandidates(entity, desiredX, desiredY, preferRetreat) {
  const px = -desiredY;
  const py = desiredX;
  const side = hashEntityId(`${entity}:unstick_side`) % 2 === 0 ? 1 : -1;
  const source = preferRetreat ? RETREAT_CANDIDATES : UNSTICK_CANDIDATES;
  const ordered = side > 0 ? source : source.map((candidate) => ({ ...candidate, side: -candidate.side }));
  return ordered.map((candidate) => {
    const x = desiredX * candidate.forward + px * candidate.side;
    const y = desiredY * candidate.forward + py * candidate.side;
    const length = Math.hypot(x, y) || 1;
    return {
      mode: candidate.mode,
      x: x / length,
      y: y / length
    };
  });
}

function recordEnemyMovementProgress(ai, transform, beforeX, beforeY, beforeDistance, targetX, targetY, dt, result) {
  const movedDistance = Math.hypot(transform.x - beforeX, transform.y - beforeY);
  const afterDistance = Math.hypot(targetX - transform.x, targetY - transform.y);
  const distanceReduced = beforeDistance - afterDistance;
  ai.previousPositionX = transform.x;
  ai.previousPositionY = transform.y;
  ai.previousTargetDistance = afterDistance;
  ai.lastProgressDelta = distanceReduced;
  const meaningful = distanceReduced > STUCK_DISTANCE_EPSILON;
  if (meaningful) {
    ai.timeSinceMeaningfulProgress = 0;
    ai.failedMoveCount = 0;
  } else {
    ai.timeSinceMeaningfulProgress += Math.max(0, dt);
    if (!result.moved || movedDistance <= STUCK_POSITION_EPSILON) ai.failedMoveCount += 1;
  }
  return { movedDistance, afterDistance, distanceReduced, meaningful };
}

function resetEnemyMovementProgress(ai, transform, targetX, targetY) {
  ai.previousPositionX = transform.x;
  ai.previousPositionY = transform.y;
  ai.attemptedTargetX = targetX;
  ai.attemptedTargetY = targetY;
  ai.previousTargetDistance = Math.hypot(targetX - transform.x, targetY - transform.y);
  ai.timeSinceMeaningfulProgress = 0;
  ai.failedMoveCount = 0;
  ai.lastProgressDelta = 0;
}

function clearUnstickDirection(ai) {
  ai.currentUnstickDirectionX = 0;
  ai.currentUnstickDirectionY = 0;
  ai.currentUnstickMode = null;
  ai.unstickCooldown = 0;
}

function beginShortRetreat(ai, transform, desiredX, desiredY, entity) {
  const side = hashEntityId(`${entity}:retreat_side`) % 2 === 0 ? 1 : -1;
  const px = -desiredY;
  const py = desiredX;
  const retreatX = -desiredX * 0.95 + px * 0.38 * side;
  const retreatY = -desiredY * 0.95 + py * 0.38 * side;
  const length = Math.hypot(retreatX, retreatY) || 1;
  ai.retreatTargetX = transform.x + (retreatX / length) * 1.1;
  ai.retreatTargetY = transform.y + (retreatY / length) * 1.1;
  ai.retreatTimer = RETREAT_SECONDS;
  ai.repathPauseTimer = REPATH_PAUSE_SECONDS;
  ai.decisionCooldown = Math.max(ai.decisionCooldown, REPATH_PAUSE_SECONDS);
  ai.targetId = null;
  ai.stuckRetreatCount += 1;
}

function updateRoamTarget(entity, ai, transform, map) {
  const targetDistance = Math.hypot(ai.roamTargetX - transform.x, ai.roamTargetY - transform.y);
  if (ai.roamTargetCooldown > 0 && targetDistance > ROAM_TARGET_DISTANCE) return;
  if (ai.roamTargetCooldown > 0) return;
  const index = ai.roamDecisionIndex + 1;
  const seed = hashEntityId(entity);
  const noise = deterministicNoise(seed, index);
  const angle = (seed * 0.013 + index * GOLDEN_ANGLE) % (Math.PI * 2);
  const radius = ai.roamRadius * (0.35 + noise * 0.6);
  ai.roamDecisionIndex = index;
  ai.roamTargetX = clamp(ai.anchorX + Math.cos(angle) * radius, 1.1, map.width - 1.1);
  ai.roamTargetY = clamp(ai.anchorY + Math.sin(angle) * radius, 1.1, map.height - 1.1);
  ai.roamTargetCooldown = Math.max(1.4, ai.decisionInterval * (3.4 + noise));
}

function clearEnemyTarget(ai) {
  ai.targetId = null;
}

function setEnemyPressureState(ai, state) {
  if (ai.state === state) return;
  ai.state = state;
  ai.lastStateChangeAt = ai.elapsed;
}

function ensureEnemyPressureState(ai, transform) {
  ai.classification = 'enemy_pressure_ai_state_v3_smoke_search';
  if (!isEnemyPressureState(ai.state)) ai.state = EnemyPressureState.ROAM;
  if (typeof ai.targetId !== 'string') ai.targetId = null;
  ai.anchorX = finiteNumber(ai.anchorX, transform.x);
  ai.anchorY = finiteNumber(ai.anchorY, transform.y);
  ai.aggroRange = Math.max(0, finiteNumber(ai.aggroRange, 14));
  ai.attackProfileIds = Array.isArray(ai.attackProfileIds) && ai.attackProfileIds.length > 0
    ? ai.attackProfileIds.filter(isEnemyAttackProfileId)
    : [EnemyAttackProfileId.LEGACY_CONTACT];
  if (ai.attackProfileIds.length === 0) ai.attackProfileIds = [EnemyAttackProfileId.LEGACY_CONTACT];
  const profileRange = getEnemyAttackRange(ai.attackProfileIds, finiteNumber(ai.attackRange, 0.82));
  ai.attackRange = Math.max(0, ai.attackProfileIds[0] === EnemyAttackProfileId.LEGACY_CONTACT
    ? finiteNumber(ai.attackRange, profileRange)
    : profileRange);
  ai.attackCooldown = Math.max(0.05, finiteNumber(ai.attackCooldown, 0.95));
  ai.damage = Math.max(0, finiteNumber(ai.damage, 1));
  ai.nextAttackProfileIndex = Math.max(0, Math.floor(finiteNumber(ai.nextAttackProfileIndex, 0))) % ai.attackProfileIds.length;
  ai.activeAttackProfileId = isEnemyAttackProfileId(ai.activeAttackProfileId) ? ai.activeAttackProfileId : null;
  ai.attackPhase = Object.values(EnemyAttackPhase).includes(ai.attackPhase) ? ai.attackPhase : EnemyAttackPhase.IDLE;
  ai.attackTimer = Math.max(0, finiteNumber(ai.attackTimer, 0));
  ai.attackDamageApplied = ai.attackDamageApplied === true;
  ai.cooldownTimer = Math.max(0, finiteNumber(ai.cooldownTimer, 0));
  ai.pendingAttackCooldown = ai.pendingAttackCooldown == null
    ? null
    : (Number.isFinite(Number(ai.pendingAttackCooldown)) ? Math.max(0, Number(ai.pendingAttackCooldown)) : null);
  ai.pendingAttackTargetId = typeof ai.pendingAttackTargetId === 'string' ? ai.pendingAttackTargetId : null;
  ai.lastAttackAt = ai.lastAttackAt == null
    ? null
    : (Number.isFinite(Number(ai.lastAttackAt)) ? Math.max(0, Number(ai.lastAttackAt)) : null);
  ai.lastAttackProfileId = typeof ai.lastAttackProfileId === 'string' ? ai.lastAttackProfileId : null;
  ai.lastAttackHitIds = Array.isArray(ai.lastAttackHitIds) ? ai.lastAttackHitIds.filter((id) => typeof id === 'string') : [];
  ai.lastAttackHitCount = Math.max(0, Math.floor(finiteNumber(ai.lastAttackHitCount, ai.lastAttackHitIds.length)));
  hydrateEnemySmokeSearchState(ai);
  ai.engagementTargetX = nullableFiniteNumber(ai.engagementTargetX);
  ai.engagementTargetY = nullableFiniteNumber(ai.engagementTargetY);
  ai.engagementSlotAngle = nullableFiniteNumber(ai.engagementSlotAngle);
  ai.engagementDistance = nullableFiniteNumber(ai.engagementDistance);
  ai.previousPositionX = finiteNumber(ai.previousPositionX, transform.x);
  ai.previousPositionY = finiteNumber(ai.previousPositionY, transform.y);
  ai.attemptedTargetX = nullableFiniteNumber(ai.attemptedTargetX);
  ai.attemptedTargetY = nullableFiniteNumber(ai.attemptedTargetY);
  ai.previousTargetDistance = nullableFiniteNumber(ai.previousTargetDistance);
  ai.timeSinceMeaningfulProgress = Math.max(0, finiteNumber(ai.timeSinceMeaningfulProgress, 0));
  ai.failedMoveCount = Math.max(0, Math.floor(finiteNumber(ai.failedMoveCount, finiteNumber(ai.blockedMoveCount, 0))));
  ai.currentUnstickDirectionX = finiteNumber(ai.currentUnstickDirectionX, 0);
  ai.currentUnstickDirectionY = finiteNumber(ai.currentUnstickDirectionY, 0);
  if (Math.hypot(ai.currentUnstickDirectionX, ai.currentUnstickDirectionY) <= 0.001) {
    ai.currentUnstickDirectionX = 0;
    ai.currentUnstickDirectionY = 0;
  }
  ai.currentUnstickMode = typeof ai.currentUnstickMode === 'string' ? ai.currentUnstickMode : null;
  ai.unstickCooldown = Math.max(0, finiteNumber(ai.unstickCooldown, 0));
  ai.repathPauseTimer = Math.max(0, finiteNumber(ai.repathPauseTimer, 0));
  ai.retreatTimer = Math.max(0, finiteNumber(ai.retreatTimer, 0));
  ai.retreatTargetX = nullableFiniteNumber(ai.retreatTargetX);
  ai.retreatTargetY = nullableFiniteNumber(ai.retreatTargetY);
  ai.stuckRecoveryCount = Math.max(0, Math.floor(finiteNumber(ai.stuckRecoveryCount, 0)));
  ai.stuckRetreatCount = Math.max(0, Math.floor(finiteNumber(ai.stuckRetreatCount, 0)));
  ai.lastProgressDelta = finiteNumber(ai.lastProgressDelta, 0);
  ai.lastSteeringAngleDegrees = finiteNumber(ai.lastSteeringAngleDegrees, 0);
  ai.usedObstacleSteering = ai.usedObstacleSteering === true;
  ai.usedStuckRecovery = ai.usedStuckRecovery === true;
  ai.movementBlocked = ai.movementBlocked === true;
  ai.steeringSuccessCount = Math.max(0, Math.floor(finiteNumber(ai.steeringSuccessCount, 0)));
  ai.blockedMoveCount = Math.max(0, Math.floor(finiteNumber(ai.blockedMoveCount, 0)));
  ai.guardEnabled = ai.guardEnabled === true;
  ai.guardHoldDistance = Math.max(0, finiteNumber(ai.guardHoldDistance, 0));
  ai.guardHoldSeconds = Math.max(0, finiteNumber(ai.guardHoldSeconds, 0));
  ai.guardCooldownSeconds = Math.max(0, finiteNumber(ai.guardCooldownSeconds, 0));
  ai.guardProtectedArcRadians = Math.max(0, finiteNumber(ai.guardProtectedArcRadians, 0));
  ai.guardDamageMultiplier = clamp(finiteNumber(ai.guardDamageMultiplier, 1), 0, 1);
  ai.guardRecoverySeconds = Math.max(0, finiteNumber(ai.guardRecoverySeconds, 0));
  ai.guardHoldTimer = Math.max(0, finiteNumber(ai.guardHoldTimer, 0)); ai.guardCooldownTimer = Math.max(0, finiteNumber(ai.guardCooldownTimer, 0));
  ai.guardRecoveryTimer = Math.max(0, finiteNumber(ai.guardRecoveryTimer, 0)); ai.guardHoldCount = Math.max(0, Math.floor(finiteNumber(ai.guardHoldCount, 0)));
  ai.guardBlockedCount = Math.max(0, Math.floor(finiteNumber(ai.guardBlockedCount, 0))); ai.guardLastAttackerId = typeof ai.guardLastAttackerId === 'string' ? ai.guardLastAttackerId : null;
  ai.guardLastDamageBefore = nullableFiniteNumber(ai.guardLastDamageBefore); ai.guardLastDamageAfter = nullableFiniteNumber(ai.guardLastDamageAfter);
  ai.guardLastReason = typeof ai.guardLastReason === 'string' ? ai.guardLastReason : null;
  ai.roamRadius = Math.max(0, finiteNumber(ai.roamRadius, Math.min(6, ai.aggroRange * 0.5)));
  ai.leashRange = Math.max(ai.roamRadius, finiteNumber(ai.leashRange, Math.max(ai.aggroRange * 1.5, ai.roamRadius * 2)));
  ai.roamTargetX = finiteNumber(ai.roamTargetX, ai.anchorX);
  ai.roamTargetY = finiteNumber(ai.roamTargetY, ai.anchorY);
  ai.roamTargetCooldown = Math.max(0, finiteNumber(ai.roamTargetCooldown, 0));
  ai.roamDecisionIndex = Math.max(0, Math.floor(finiteNumber(ai.roamDecisionIndex, 0)));
  ai.decisionInterval = Math.max(0.1, finiteNumber(ai.decisionInterval, 0.7));
  ai.decisionCooldown = Math.max(0, finiteNumber(ai.decisionCooldown, 0));
  ai.elapsed = Math.max(0, finiteNumber(ai.elapsed, 0));
  ai.lastStateChangeAt = Math.max(0, finiteNumber(ai.lastStateChangeAt, 0));
}

function hashEntityId(entity) {
  let hash = 2166136261;
  for (const char of String(entity)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function deterministicNoise(seed, index) {
  const value = Math.sin((seed % 100000) * 0.017 + index * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function deterministicSlotAngle(source, target) {
  const sourceOrdinal = numericEntityOrdinal(source);
  const targetPhase = (hashEntityId(`${target}|engagement_slot`) % 1024) / 1024 * Math.PI * 2;
  return (targetPhase + (sourceOrdinal % 8) * Math.PI / 4) % (Math.PI * 2);
}

function numericEntityOrdinal(entity) {
  const match = String(entity).match(/_(\d+)$/);
  return match ? Number(match[1]) : hashEntityId(entity);
}

function finiteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function nullableFiniteNumber(value) {
  if (value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function holdRaiderGuardPosition(world, entity, transform, targetTransform, distance, ai) {
  if (!ai.guardEnabled || ai.guardHoldDistance <= 0 || ai.guardHoldSeconds <= 0) return false;
  if (ai.guardRecoveryTimer > 0 || isEnemyAttackBusy(ai)) return false;
  if (distance > ai.guardHoldDistance) return false;
  if (distance <= ai.attackRange * 1.02) return false;
  if (ai.guardHoldTimer <= 0 && ai.guardCooldownTimer <= 0) {
    ai.guardHoldTimer = ai.guardHoldSeconds;
    ai.guardCooldownTimer = ai.guardCooldownSeconds;
    ai.guardHoldCount += 1;
    ai.guardLastReason = 'target_inside_guard_band';
  }
  if (ai.guardHoldTimer <= 0) return false;
  const dx = targetTransform.x - transform.x;
  const dy = targetTransform.y - transform.y;
  if (Math.hypot(dx, dy) > 0.001) transform.rotation = Math.atan2(dy, dx);
  ai.movementBlocked = false;
  ai.usedObstacleSteering = false;
  ai.usedStuckRecovery = false;
  resetEnemyMovementProgress(ai, transform, transform.x, transform.y);
  return true;
}
