import { ComponentType } from '../constants/componentTypes.js';
import { areFactionsFriendly, areFactionsHostile } from '../constants/factions.js';
import {
  EnemyAttackPhase,
  EnemyAttackProfileId,
  EnemyCollateralMode,
  EnemyHitShape,
  getEnemyAttackProfile
} from '../data/enemyAttackProfiles.js';
import { getComponent } from '../ecs/world.js';
import { query } from '../ecs/query.js';
import { spawnEffect } from '../game/spawn.js';
import { isPlayerInteractiveLifecycle } from '../data/playerLifecycle.js';
import { applyDamageToEntity } from './healthSystem.js';
import { applyImpactToReceiver } from './impactResponseState.js';
import { canAttackFromGuardState } from './raiderGuardState.js';
import { EventType } from '../constants/eventTypes.js';
import { emitEvent } from '../ecs/events.js';

export function enemyAttackSystem({ game, dt }) {
  const delta = Math.max(0, Number(dt) || 0);
  for (const attacker of query(game.world, [
    ComponentType.EnemyPressureAI,
    ComponentType.Transform,
    ComponentType.Health,
    ComponentType.Team,
    ComponentType.Cooldowns
  ])) {
    const ai = getComponent(game.world, attacker, ComponentType.EnemyPressureAI);
    const health = getComponent(game.world, attacker, ComponentType.Health);
    const cooldowns = getComponent(game.world, attacker, ComponentType.Cooldowns);
    ai.cooldownTimer = Math.max(0, Number(cooldowns.attack) || 0);
    if (!health.alive) {
      resetEnemyAttack(ai);
      continue;
    }
    if (!isEnemyAttackBusy(ai)) continue;

    advanceEnemyAttack(game, attacker, ai, cooldowns, delta);
  }
}

export function beginEnemyAttack(world, attacker, ai, target) {
  if (isEnemyAttackBusy(ai) || !canAttackFromGuardState(ai) || !isIntentionalEnemyTarget(world, attacker, target)) return null;
  const cooldowns = getComponent(world, attacker, ComponentType.Cooldowns);
  if (!cooldowns || cooldowns.attack > 0) return null;
  const attackerTransform = getComponent(world, attacker, ComponentType.Transform);
  const targetTransform = getComponent(world, target, ComponentType.Transform);
  if (!attackerTransform || !targetTransform) return null;
  const distance = Math.hypot(targetTransform.x - attackerTransform.x, targetTransform.y - attackerTransform.y);
  const selection = selectEnemyAttackProfile(ai, distance);
  if (!selection) return null;

  attackerTransform.rotation = Math.atan2(targetTransform.y - attackerTransform.y, targetTransform.x - attackerTransform.x);
  ai.activeAttackProfileId = selection.profile.id;
  ai.attackPhase = EnemyAttackPhase.WINDUP;
  ai.attackTimer = selection.profile.windup;
  ai.attackDamageApplied = false;
  ai.pendingAttackCooldown = selection.profile.cooldown;
  ai.pendingAttackTargetId = target;
  ai.nextAttackProfileIndex = selection.nextIndex;
  ai.lastAttackHitIds = [];
  ai.lastAttackHitCount = 0;
  emitEvent(world, EventType.ENEMY_ATTACK_COMMITTED, {
    attacker,
    target,
    profileId: selection.profile.id,
    windupSeconds: selection.profile.windup
  });
  return selection.profile;
}

export function isEnemyAttackBusy(ai) {
  return ai?.attackPhase === EnemyAttackPhase.WINDUP
    || ai?.attackPhase === EnemyAttackPhase.ACTIVE
    || ai?.attackPhase === EnemyAttackPhase.RECOVER;
}

export function resetEnemyAttack(ai) {
  ai.attackPhase = EnemyAttackPhase.IDLE;
  ai.attackTimer = 0;
  ai.attackDamageApplied = false;
  ai.activeAttackProfileId = null;
  ai.pendingAttackCooldown = null;
  ai.pendingAttackTargetId = null;
}

function advanceEnemyAttack(game, attacker, ai, cooldowns, delta) {
  let remaining = Math.max(0, delta);
  for (let transitionCount = 0; transitionCount < 4 && isEnemyAttackBusy(ai); transitionCount += 1) {
    const profile = resolveAttackProfile(ai, ai.activeAttackProfileId);
    const duration = phaseDuration(profile, ai.attackPhase);
    const timerBefore = Math.max(0, Number(ai.attackTimer) || 0);
    const consumed = Math.min(timerBefore, remaining);
    ai.attackTimer = Math.max(0, timerBefore - consumed);
    remaining = Math.max(0, remaining - consumed);

    if (ai.attackPhase === EnemyAttackPhase.ACTIVE && !ai.attackDamageApplied) {
      const progress01 = duration > 0 ? 1 - ai.attackTimer / duration : 1;
      if (progress01 + 0.000001 >= Math.max(0, Math.min(1, profile.damageTime01 ?? 0.5))) {
        resolveEnemyAttackDamage(game, attacker, ai, cooldowns, profile);
      }
    }
    if (ai.attackTimer > 0) return;

    if (ai.attackPhase === EnemyAttackPhase.WINDUP) {
      ai.attackPhase = EnemyAttackPhase.ACTIVE;
      ai.attackTimer = Math.max(0, profile.active ?? 0);
      ai.attackDamageApplied = false;
    } else if (ai.attackPhase === EnemyAttackPhase.ACTIVE) {
      if (!ai.attackDamageApplied) resolveEnemyAttackDamage(game, attacker, ai, cooldowns, profile);
      ai.attackPhase = EnemyAttackPhase.RECOVER;
      ai.attackTimer = Math.max(0, profile.recovery ?? 0);
      returnFromZeroRecovery(ai);
    } else {
      resetEnemyAttack(ai);
    }
    if (remaining <= 0) return;
  }
}

function resolveEnemyAttackDamage(game, attacker, ai, cooldowns, profile) {
  if (ai.attackDamageApplied) return;
  const target = ai.pendingAttackTargetId;
  const targetValid = ai.targetId === target && isIntentionalEnemyTarget(game.world, attacker, target);
  const hitIds = targetValid ? resolveEnemyAttackHits(game.world, attacker, target, profile) : [];
  for (const hitId of hitIds) applyEnemyAttackHit(game, attacker, hitId, profile);
  spawnEnemyStrikeVisual(game, attacker, profile, hitIds.length);
  ai.attackDamageApplied = true;
  ai.lastAttackAt = ai.elapsed;
  ai.lastAttackProfileId = profile.id;
  ai.lastAttackHitIds = [...hitIds];
  ai.lastAttackHitCount = hitIds.length;
  emitEvent(game.world, EventType.ENEMY_ATTACK_RESOLVED, {
    attacker,
    target,
    profileId: profile.id,
    hitIds: [...hitIds]
  });
  ai.pendingAttackTargetId = null;
  if (!targetValid && ai.targetId === target) ai.targetId = null;
  const resolvedCooldown = Math.max(profile.cooldown, Number(ai.pendingAttackCooldown) || 0);
  cooldowns.attack = Math.max(cooldowns.attack ?? 0, resolvedCooldown);
  ai.cooldownTimer = cooldowns.attack;
}

function phaseDuration(profile, phase) {
  if (phase === EnemyAttackPhase.WINDUP) return Math.max(0, profile.windup ?? 0);
  if (phase === EnemyAttackPhase.ACTIVE) return Math.max(0, profile.active ?? 0);
  return Math.max(0, profile.recovery ?? 0);
}

export function resolveEnemyAttackHits(world, attacker, intendedTarget, profile) {
  const sourceTransform = getComponent(world, attacker, ComponentType.Transform);
  if (!sourceTransform || !getComponent(world, attacker, ComponentType.Team)?.id) return [];
  const hits = [];
  for (const candidate of query(world, [ComponentType.Transform, ComponentType.Health, ComponentType.Team, ComponentType.Collider])) {
    if (candidate === attacker) continue;
    const health = getComponent(world, candidate, ComponentType.Health);
    if (!health.alive) continue;
    if (!canEnemyAttackDamageCandidate(world, attacker, candidate, intendedTarget, profile.collateralMode)) continue;
    if (!isInsideEnemyAttackShape(world, attacker, candidate, profile.hitShape)) continue;
    hits.push(candidate);
  }
  return hits;
}

export function canEnemyAttackDamageCandidate(world, attacker, candidate, intendedTarget, collateralMode) {
  if (!candidate || candidate === attacker) return false;
  const health = getComponent(world, candidate, ComponentType.Health);
  if (!health?.alive) return false;
  if (!isPlayerInteractiveLifecycle(getComponent(world, candidate, ComponentType.PlayerLifecycle))) return false;
  if (collateralMode === EnemyCollateralMode.TARGET_ONLY) return candidate === intendedTarget;
  if (collateralMode === EnemyCollateralMode.ALL_DAMAGEABLE) return true;
  const sourceTeam = getComponent(world, attacker, ComponentType.Team)?.id;
  const candidateTeam = getComponent(world, candidate, ComponentType.Team)?.id;
  if (!sourceTeam || !candidateTeam) return false;
  if (collateralMode === EnemyCollateralMode.HOSTILE_ONLY) {
    return areFactionsHostile(sourceTeam, candidateTeam);
  }
  if (collateralMode === EnemyCollateralMode.HOSTILE_AND_FRIENDLY) {
    return areFactionsHostile(sourceTeam, candidateTeam) || areFactionsFriendly(sourceTeam, candidateTeam);
  }
  return false;
}

export function isIntentionalEnemyTarget(world, attacker, target) {
  if (!target || target === attacker || !world.entities.has(target)) return false;
  const sourceTeam = getComponent(world, attacker, ComponentType.Team)?.id;
  const targetTeam = getComponent(world, target, ComponentType.Team)?.id;
  const targetHealth = getComponent(world, target, ComponentType.Health);
  return !!sourceTeam
    && !!targetTeam
    && targetHealth?.alive === true
    && isPlayerInteractiveLifecycle(getComponent(world, target, ComponentType.PlayerLifecycle))
    && areFactionsHostile(sourceTeam, targetTeam);
}

function selectEnemyAttackProfile(ai, distance) {
  const ids = Array.isArray(ai.attackProfileIds) && ai.attackProfileIds.length > 0
    ? ai.attackProfileIds
    : [EnemyAttackProfileId.LEGACY_CONTACT];
  const start = Math.max(0, Math.floor(Number(ai.nextAttackProfileIndex) || 0)) % ids.length;
  for (let offset = 0; offset < ids.length; offset += 1) {
    const index = (start + offset) % ids.length;
    const profile = resolveAttackProfile(ai, ids[index]);
    if (distance <= profile.range) return { profile, nextIndex: (index + 1) % ids.length };
  }
  return null;
}

function resolveAttackProfile(ai, profileId) {
  const id = profileId ?? EnemyAttackProfileId.LEGACY_CONTACT;
  const profile = getEnemyAttackProfile(id);
  if (id !== EnemyAttackProfileId.LEGACY_CONTACT) return profile;
  const range = Math.max(0, finiteNumber(ai.attackRange, profile.range));
  return {
    ...profile,
    range,
    damage: Math.max(0, finiteNumber(ai.damage, profile.damage)),
    cooldown: Math.max(0.05, finiteNumber(ai.attackCooldown, profile.cooldown)),
    hitShape: { ...profile.hitShape, radius: range }
  };
}

function isInsideEnemyAttackShape(world, attacker, candidate, hitShape) {
  const source = getComponent(world, attacker, ComponentType.Transform);
  const target = getComponent(world, candidate, ComponentType.Transform);
  const collider = getComponent(world, candidate, ComponentType.Collider);
  if (!source || !target) return false;
  const radius = Math.max(0, collider?.radius ?? 0);
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.hypot(dx, dy);
  if (hitShape.type === EnemyHitShape.CIRCLE) return distance <= hitShape.radius + radius;

  const forwardX = Math.cos(source.rotation ?? 0);
  const forwardY = Math.sin(source.rotation ?? 0);
  if (hitShape.type === EnemyHitShape.FORWARD_ARC) {
    if (distance > hitShape.radius + radius) return false;
    if (distance <= radius) return true;
    const dot = (dx * forwardX + dy * forwardY) / distance;
    return dot >= Math.cos((hitShape.arcRadians ?? Math.PI) * 0.5);
  }
  if (hitShape.type === EnemyHitShape.FORWARD_CAPSULE) {
    const length = Math.max(0, hitShape.length ?? 0);
    const projection = Math.max(0, Math.min(length, dx * forwardX + dy * forwardY));
    const closestX = source.x + forwardX * projection;
    const closestY = source.y + forwardY * projection;
    return Math.hypot(target.x - closestX, target.y - closestY) <= (hitShape.halfWidth ?? 0) + radius;
  }
  return false;
}

function applyEnemyAttackHit(game, attacker, target, profile) {
  const world = game.world;
  const targetTransform = getComponent(world, target, ComponentType.Transform);
  applyDamageToEntity(world, target, profile.damage, attacker, profile.damageType);
  applyAttackImpact(world, attacker, target, profile);
  if (targetTransform) {
    spawnEffect(world, { kind: 'hurt', x: targetTransform.x, y: targetTransform.y, radius: 0.7, lifetime: 0.18, hits: 1 });
  }
}

function applyAttackImpact(world, attacker, target, profile) {
  if (!(profile.knockback > 0) && !(profile.stagger > 0)) return;
  const source = getComponent(world, attacker, ComponentType.Transform);
  const targetTransform = getComponent(world, target, ComponentType.Transform);
  const impact = getComponent(world, target, ComponentType.ImpactResponse);
  if (!source || !targetTransform || !impact) return;
  const dx = targetTransform.x - source.x;
  const dy = targetTransform.y - source.y;
  applyImpactToReceiver(impact, {
    source: attacker,
    target,
    actionId: profile.id,
    contactBodyPart: profile.weaponSocket ?? profile.telegraphVisual ?? 'enemy_attack_front',
    impactDirection: 'attacker_to_target',
    directionX: dx,
    directionY: dy,
    impactStrength: profile.knockback,
    staggerStrength: profile.stagger,
    phase: 1
  });
}

function spawnEnemyStrikeVisual(game, attacker, profile, hits) {
  const transform = getComponent(game.world, attacker, ComponentType.Transform);
  const visual = profile.strikeVisual;
  if (!transform || !visual) return;
  const directionX = Math.cos(transform.rotation ?? 0);
  const directionY = Math.sin(transform.rotation ?? 0);
  const reach = Math.max(0.2, profile.range * 0.72);
  const endpoint = resolveStrikeEndpoint(game.world, attacker, profile.strikeEndpointSocket);
  spawnEffect(game.world, {
    kind: visual.kind,
    x: endpoint?.x ?? transform.x + directionX * reach,
    y: endpoint?.y ?? transform.y + directionY * reach,
    radius: Math.max(0.28, profile.range * 0.52),
    lifetime: visual.lifetime,
    hits,
    style: {
      visualRole: visual.visualRole,
      stroke: visual.colour,
      fill: visual.fillColour ?? visual.colour,
      opacity: visual.opacity ?? 1,
      lineWidth: visual.lineWidth,
      directionX,
      directionY,
      attackProfileId: profile.id,
      strikeEndpointSocket: profile.strikeEndpointSocket ?? null
    }
  }, game.renderLayers?.diagnostics ?? null);
}

function resolveStrikeEndpoint(world, attacker, socketRole) {
  if (!socketRole) return null;
  const humanoid = getComponent(world, attacker, ComponentType.HumanoidProjection);
  const predator = getComponent(world, attacker, ComponentType.PredatorProjection);
  return [...Object.values(humanoid?.sockets ?? {}), ...Object.values(predator?.sockets ?? {})]
    .find((entry) => entry?.role === socketRole) ?? null;
}

function returnFromZeroRecovery(ai) {
  if (ai.attackTimer <= 0) resetEnemyAttack(ai);
}

function finiteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}
