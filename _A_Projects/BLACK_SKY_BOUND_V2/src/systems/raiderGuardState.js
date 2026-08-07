import { ComponentType } from '../constants/componentTypes.js';
import { DamageType } from '../constants/damageTypes.js';
import { EnemyAttackPhase } from '../data/enemyAttackProfiles.js';
import { getComponent } from '../ecs/world.js';

const BLOCKABLE_DAMAGE = new Set([
  DamageType.BITE,
  DamageType.CLAW,
  DamageType.SPEAR,
  DamageType.BODY,
  DamageType.CONTACT
]);

export function isRaiderGuardActive(ai) {
  return ai?.guardEnabled === true
    && (ai.guardHoldTimer ?? 0) > 0
    && (ai.guardRecoveryTimer ?? 0) <= 0
    && ai.attackPhase === EnemyAttackPhase.IDLE;
}

export function isRaiderGuardRecovering(ai) {
  return ai?.guardEnabled === true
    && (ai.guardRecoveryTimer ?? 0) > 0
    && ai.attackPhase === EnemyAttackPhase.IDLE;
}

export function canAttackFromGuardState(ai) {
  return !isRaiderGuardActive(ai) && !isRaiderGuardRecovering(ai);
}

export function resolveDirectionalGuardDamage(world, target, source, amount, damageType) {
  const ai = getComponent(world, target, ComponentType.EnemyPressureAI);
  if (!isRaiderGuardActive(ai) || !BLOCKABLE_DAMAGE.has(damageType)) return unguarded(amount, 'guard_inactive_or_unblockable');
  const defender = getComponent(world, target, ComponentType.Transform);
  const attacker = getComponent(world, source, ComponentType.Transform);
  if (!defender || !attacker) return unguarded(amount, 'missing_directional_source');
  const dx = attacker.x - defender.x;
  const dy = attacker.y - defender.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= 0.001) return unguarded(amount, 'overlapping_source');
  const forwardX = Math.cos(defender.rotation ?? 0);
  const forwardY = Math.sin(defender.rotation ?? 0);
  const incomingDot = (dx * forwardX + dy * forwardY) / distance;
  const protectedArc = Math.max(0, Math.min(Math.PI * 2, ai.guardProtectedArcRadians ?? 0));
  if (incomingDot < Math.cos(protectedArc * 0.5)) return unguarded(amount, 'outside_protected_sector', incomingDot);

  const before = Math.max(0, Number(amount) || 0);
  const after = before * Math.max(0, Math.min(1, ai.guardDamageMultiplier ?? 1));
  ai.guardHoldTimer = 0;
  ai.guardRecoveryTimer = Math.max(ai.guardRecoveryTimer ?? 0, ai.guardRecoverySeconds ?? 0);
  ai.guardCooldownTimer = Math.max(ai.guardCooldownTimer ?? 0, ai.guardCooldownSeconds ?? 0);
  ai.guardBlockedCount = (ai.guardBlockedCount ?? 0) + 1;
  ai.guardLastAttackerId = source;
  ai.guardLastDamageBefore = before;
  ai.guardLastDamageAfter = after;
  ai.guardLastReason = 'directional_hit_mitigated';
  return { amount: after, guarded: true, reason: ai.guardLastReason, incomingDot };
}

function unguarded(amount, reason, incomingDot = null) {
  return { amount: Math.max(0, Number(amount) || 0), guarded: false, reason, incomingDot };
}
