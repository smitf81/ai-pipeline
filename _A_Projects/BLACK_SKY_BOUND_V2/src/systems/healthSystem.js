import { ComponentType } from '../constants/componentTypes.js';
import { EventType } from '../constants/eventTypes.js';
import { getComponent } from '../ecs/world.js';
import { emitEvent } from '../ecs/events.js';
import { query } from '../ecs/query.js';
import { COMBAT_BALANCE, resolveHitSlowForTarget, resolveIncomingDamageAmount } from '../data/combatBalance.js';
import { resolveDirectionalGuardDamage } from './raiderGuardState.js';
import { areFactionsHostile } from '../constants/factions.js';

export function applyDamageToEntity(world, entity, amount, source = null, damageType = 'unknown') {
  const health = getComponent(world, entity, ComponentType.Health);
  if (!health?.alive) return false;
  const scaledDamage = resolveIncomingDamageAmount(world, source, entity, amount, getTeamId);
  const guard = resolveDirectionalGuardDamage(world, entity, source, scaledDamage, damageType);
  const damage = guard.amount;
  const healthRatioBefore = health.hp / Math.max(1, health.maxHp ?? 1);
  health.hp = Math.max(0, health.hp - damage);
  health.alive = health.hp > 0;
  if (damage > 0) {
    registerHealthPressureHit(health, damage, damageType);
    applyHitSlow(world, entity, source);
  }
  registerNearDeathSignal(world, entity, source, health, healthRatioBefore, damageType);
  emitEvent(world, EventType.DAMAGE_APPLIED, {
    source,
    target: entity,
    amount: damage,
    baseAmount: Math.max(0, Number(amount) || 0),
    damageType,
    guarded: guard.guarded,
    guardReason: guard.reason,
    killed: !health.alive
  });
  if (!health.alive) emitEvent(world, EventType.ENTITY_DIED, { entity, source, damageType });
  return !health.alive;
}

function registerNearDeathSignal(world, entity, source, health, ratioBefore, damageType) {
  if (health.nearDeathSignaled === true || !health.alive || !getComponent(world, entity, ComponentType.PlayerControlled)) return;
  const sourceTeam = getTeamId(world, source);
  const targetTeam = getTeamId(world, entity);
  if (!sourceTeam || !targetTeam || !areFactionsHostile(sourceTeam, targetTeam)) return;
  const threshold = Math.max(0, Math.min(1, health.criticalHealthThreshold ?? 0.34));
  const ratioAfter = health.hp / Math.max(1, health.maxHp ?? 1);
  if (ratioBefore <= threshold || ratioAfter > threshold) return;
  health.nearDeathSignaled = true;
  health.nearDeathSignalCount = (health.nearDeathSignalCount ?? 0) + 1;
  emitEvent(world, EventType.PLAYER_NEAR_DEATH, {
    player: entity,
    source,
    damageType,
    healthRatio: ratioAfter,
    pressure: health.pressure,
    threshold
  });
}

export function healthSystem({ game, dt } = {}) {
  if (!game?.world) return;
  const delta = Math.max(0, Number(dt) || 0);
  const deltaMs = delta * 1000;
  for (const entity of query(game.world, [ComponentType.Health])) {
    const health = getComponent(game.world, entity, ComponentType.Health);
    const isPlayer = !!getComponent(game.world, entity, ComponentType.PlayerControlled);
    const directPursuerCount = isPlayer ? countDirectPursuers(game.world, entity) : 0;
    const pursuitBlocksRecovery = isPlayer
      && health.hp < health.maxHp
      && directPursuerCount > 0
      && COMBAT_BALANCE.playerRecovery.directPursuitBlocksRegeneration;
    let delayBeforeMs = health.recoveryDelayRemainingMs ?? 0;
    if (pursuitBlocksRecovery && COMBAT_BALANCE.playerRecovery.delayRestartsWhileDirectlyPursued) {
      delayBeforeMs = Math.max(delayBeforeMs, health.regenDelayMs ?? 0);
      health.safeRecoveryElapsedMs = 0;
    }
    health.directPursuerCount = directPursuerCount;
    health.recoveryBlockedByThreat = pursuitBlocksRecovery;
    health.hitPulseRemainingMs = Math.max(0, (health.hitPulseRemainingMs ?? 0) - deltaMs);
    health.recoveryDelayRemainingMs = Math.max(0, delayBeforeMs - deltaMs);
    const regenSeconds = delayBeforeMs > 0 ? Math.max(0, delta - delayBeforeMs / 1000) : delta;
    health.recovering = false;
    if (!health.alive) {
      health.safeRecoveryElapsedMs = 0;
      health.regenRampMultiplier = 0;
      health.regenActivityMultiplier = 1;
      health.pressure = resolveHealthPressure(health);
      continue;
    }
    if (isPlayer && health.regenEnabled && !pursuitBlocksRecovery && health.recoveryDelayRemainingMs <= 0 && regenSeconds > 0 && health.hp < health.maxHp) {
      health.safeRecoveryElapsedMs = (health.safeRecoveryElapsedMs ?? 0) + regenSeconds * 1000;
      const rampMultiplier = resolveRegenRampMultiplier(health);
      const activityMultiplier = resolveRegenActivityMultiplier(game.world, entity, health);
      const before = health.hp;
      health.hp = Math.min(health.maxHp, health.hp + Math.max(0, health.regenPerSecond ?? 0) * rampMultiplier * activityMultiplier * regenSeconds);
      health.regeneratedTotal = (health.regeneratedTotal ?? 0) + health.hp - before;
      health.recovering = health.hp > before && health.hp < health.maxHp;
      health.regenRampMultiplier = rampMultiplier;
      health.regenActivityMultiplier = activityMultiplier;
    } else if (health.recoveryDelayRemainingMs > 0 || health.hp >= health.maxHp) {
      health.safeRecoveryElapsedMs = health.hp >= health.maxHp ? 0 : (health.safeRecoveryElapsedMs ?? 0);
      health.regenRampMultiplier = health.hp >= health.maxHp ? 0 : (health.regenRampMultiplier ?? 0);
      health.regenActivityMultiplier = 1;
    }
    health.pressure = resolveHealthPressure(health);
  }
}

function registerHealthPressureHit(health, amount, damageType) {
  health.recoveryDelayRemainingMs = Math.max(health.recoveryDelayRemainingMs ?? 0, health.regenDelayMs ?? 0);
  health.safeRecoveryElapsedMs = 0;
  health.regenRampMultiplier = 0;
  health.regenActivityMultiplier = 1;
  health.hitPulseRemainingMs = Math.max(health.hitPulseRemainingMs ?? 0, health.hitPulseDurationMs ?? 1);
  health.lastDamageAmount = amount;
  health.lastDamageType = damageType;
  health.recovering = false;
  health.pressure = resolveHealthPressure(health);
}

function resolveHealthPressure(health) {
  const maxHp = Math.max(1, health.maxHp ?? 1);
  const missing = Math.max(0, Math.min(1, 1 - (health.hp ?? 0) / maxHp));
  return Math.min(health.maxPressure ?? 1, missing * (health.maxPressure ?? 1));
}

function applyHitSlow(world, entity, source) {
  const slow = resolveHitSlowForTarget(world, entity, getTeamId);
  if (!slow) return;
  const status = getComponent(world, entity, ComponentType.StatusEffects);
  if (!status) return;
  status.movementSlowTimer = Math.max(status.movementSlowTimer ?? 0, slow.durationSeconds);
  status.movementSlowMultiplier = Math.min(
    status.movementSlowMultiplier ?? 1,
    Math.max(0.1, Math.min(1, slow.movementMultiplier))
  );
  status.movementSlowSource = source;
}

function resolveRegenRampMultiplier(health) {
  const rampMs = Math.max(0, Number(health.regenRampMs) || 0);
  const start = Math.max(0, Math.min(1, Number(health.regenStartMultiplier) || 0));
  if (rampMs <= 0) return 1;
  const progress = Math.max(0, Math.min(1, (health.safeRecoveryElapsedMs ?? 0) / rampMs));
  return start + (1 - start) * progress;
}

function resolveRegenActivityMultiplier(world, entity, health) {
  const stamina = getComponent(world, entity, ComponentType.Stamina);
  const action = getComponent(world, entity, ComponentType.ActionState);
  let multiplier = 1;
  if (stamina?.sprinting) multiplier *= Math.max(0, Math.min(1, health.regenSprintingMultiplier ?? 1));
  if (action?.active) multiplier *= Math.max(0, Math.min(1, health.regenActionMultiplier ?? 1));
  return multiplier;
}

function countDirectPursuers(world, player) {
  let count = 0;
  for (const entity of query(world, [ComponentType.EnemyPressureAI, ComponentType.Health, ComponentType.Team])) {
    const ai = getComponent(world, entity, ComponentType.EnemyPressureAI);
    const health = getComponent(world, entity, ComponentType.Health);
    if (ai?.disabled === true || health?.alive !== true) continue;
    if (ai.targetId !== player && ai.pendingAttackTargetId !== player) continue;
    if (!areFactionsHostile(getTeamId(world, entity), getTeamId(world, player))) continue;
    count += 1;
  }
  return count;
}

function getTeamId(world, entity) {
  return entity ? getComponent(world, entity, ComponentType.Team)?.id ?? null : null;
}
