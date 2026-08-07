import { ComponentType } from '../constants/componentTypes.js';
import { EnemyAttackPhase } from '../data/enemyAttackProfiles.js';
import { getWyvernActionProfile } from '../data/creatures/groundedWyvernMotionProfiles.js';
import { getComponent } from '../ecs/world.js';
import { cancelProceduralRecovery } from './proceduralActionState.js';

export function startDodge(world, entity, direction, reason = 'manual') {
  const check = canStartDodge(world, entity);
  const dodge = getComponent(world, entity, ComponentType.DodgeState);
  if (!check.ok) {
    if (dodge) dodge.lastDeniedReason = check.reason;
    return false;
  }
  const normalized = normalizeDirection(direction?.x, direction?.y);
  if (!normalized) {
    dodge.lastDeniedReason = 'missing_direction';
    return false;
  }
  const stamina = getComponent(world, entity, ComponentType.Stamina);
  cancelProceduralRecovery(getComponent(world, entity, ComponentType.ActionState));
  stamina.current = Math.max(0, stamina.current - dodge.cost);
  stamina.spentTotal += dodge.cost;
  stamina.lastSpendReason = 'dodge';
  stamina.recoveryTimer = stamina.recoveryDelay;
  stamina.sprinting = false;
  if (stamina.current <= 0) stamina.exhausted = true;
  Object.assign(dodge, {
    active: true,
    recovering: false,
    directionX: normalized.x,
    directionY: normalized.y,
    elapsed: 0,
    phase: 0,
    recoveryElapsed: 0,
    recoveryProgress: 0,
    recoveryStartPhase: 1,
    distanceApplied: 0,
    blocked: false,
    cooldownRemaining: dodge.cooldown,
    count: dodge.count + 1,
    lastReason: reason,
    lastDeniedReason: null
  });
  return true;
}

export function canStartDodge(world, entity) {
  const dodge = getComponent(world, entity, ComponentType.DodgeState);
  const stamina = getComponent(world, entity, ComponentType.Stamina);
  const health = getComponent(world, entity, ComponentType.Health);
  const action = getComponent(world, entity, ComponentType.ActionState);
  const charge = getComponent(world, entity, ComponentType.ChargeCounterState);
  const enemyAI = getComponent(world, entity, ComponentType.EnemyPressureAI);
  const impact = getComponent(world, entity, ComponentType.ImpactResponse);
  if (!dodge?.enabled) return { ok: false, reason: 'dodge_disabled' };
  if (!health?.alive) return { ok: false, reason: 'not_alive' };
  if (dodge.active) return { ok: false, reason: 'dodge_active' };
  if (charge?.active || charge?.queued) return { ok: false, reason: 'charge_counter_committed' };
  if (dodge.cooldownRemaining > 0) return { ok: false, reason: 'dodge_cooldown' };
  if (!stamina || stamina.current + 0.0001 < dodge.cost) return { ok: false, reason: 'insufficient_stamina' };
  if (action?.active) return { ok: false, reason: 'procedural_action_active' };
  if (enemyAI?.attackPhase === EnemyAttackPhase.WINDUP
    || enemyAI?.attackPhase === EnemyAttackPhase.ACTIVE
    || enemyAI?.attackPhase === EnemyAttackPhase.RECOVER) {
    return { ok: false, reason: 'enemy_attack_active' };
  }
  if ((impact?.staggerTimer ?? 0) > 0) return { ok: false, reason: 'staggered' };
  return { ok: true, reason: null };
}

export function resolvePlayerDodgeDirection(intent, transform) {
  const movement = normalizeDirection(intent?.moveX, intent?.moveY);
  if (movement) return movement;
  const aim = transform ? normalizeDirection((intent?.aimX ?? transform.x) - transform.x, (intent?.aimY ?? transform.y) - transform.y) : null;
  if (aim) return aim;
  const rotation = transform?.rotation ?? 0;
  return { x: Math.cos(rotation), y: Math.sin(rotation) };
}

export function tryStartThreatDodge(world, defender, attacker) {
  const dodge = getComponent(world, defender, ComponentType.DodgeState);
  if (!dodge?.enabled || !dodge.aiStyle || !isIncomingAttackThreat(world, defender, attacker, dodge.aiTriggerRange)) return false;
  return startDodge(world, defender, resolveThreatDodgeDirection(world, defender, attacker), `incoming_attack:${attacker}`);
}

export function isIncomingAttackThreat(world, defender, attacker, triggerRange) {
  if (!attacker || attacker === defender) return false;
  const defenderTransform = getComponent(world, defender, ComponentType.Transform);
  const attackerTransform = getComponent(world, attacker, ComponentType.Transform);
  if (!defenderTransform || !attackerTransform) return false;
  if (Math.hypot(defenderTransform.x - attackerTransform.x, defenderTransform.y - attackerTransform.y) > triggerRange) return false;

  const enemyAI = getComponent(world, attacker, ComponentType.EnemyPressureAI);
  if (enemyAI?.attackPhase === EnemyAttackPhase.WINDUP && enemyAI.pendingAttackTargetId === defender) return true;

  const action = getComponent(world, attacker, ComponentType.ActionState);
  if (!action?.active) return false;
  const profile = getWyvernActionProfile(action.actionId);
  if (!profile?.contact || action.phase > profile.contact.activePhaseEnd) return false;
  const towardDefender = normalizeDirection(defenderTransform.x - attackerTransform.x, defenderTransform.y - attackerTransform.y);
  const attackDirection = normalizeDirection(action.directionX, action.directionY);
  return !!towardDefender && !!attackDirection && towardDefender.x * attackDirection.x + towardDefender.y * attackDirection.y >= 0.42;
}

export function resolveThreatDodgeDirection(world, defender, attacker) {
  const defenderTransform = getComponent(world, defender, ComponentType.Transform);
  const attackerTransform = getComponent(world, attacker, ComponentType.Transform);
  const dodge = getComponent(world, defender, ComponentType.DodgeState);
  const away = normalizeDirection(defenderTransform.x - attackerTransform.x, defenderTransform.y - attackerTransform.y) ?? { x: 1, y: 0 };
  const sideSign = deterministicSide(`${defender}:${dodge?.count ?? 0}`);
  const side = { x: -away.y * sideSign, y: away.x * sideSign };
  if (dodge?.aiStyle === 'side') return side;
  return normalizeDirection(away.x * 0.72 + side.x * 0.7, away.y * 0.72 + side.y * 0.7) ?? away;
}

function normalizeDirection(x, y) {
  const nx = Number(x);
  const ny = Number(y);
  const length = Math.hypot(nx, ny);
  if (!Number.isFinite(length) || length <= 0.001) return null;
  return { x: nx / length, y: ny / length };
}

function deterministicSide(value) {
  let hash = 2166136261;
  for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash & 1) === 0 ? 1 : -1;
}
