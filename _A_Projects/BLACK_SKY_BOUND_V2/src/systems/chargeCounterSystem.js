import { AbilityId } from '../constants/abilityIds.js';
import { ComponentType } from '../constants/componentTypes.js';
import { ABILITIES } from '../data/abilities.js';
import { WyvernActionId } from '../data/creatures/groundedWyvernMotionProfiles.js';
import { getComponent } from '../ecs/world.js';
import { query } from '../ecs/query.js';
import { canUseAbility } from '../game/playerAbilities.js';
import { startProceduralAction } from './proceduralActionState.js';

const CHARGE_ABILITY = ABILITIES[AbilityId.CHARGE_COUNTER];

export function openChargeCounterWindow(world, entity) {
  const charge = getComponent(world, entity, ComponentType.ChargeCounterState);
  if (!charge || !canUseAbility(world, entity, AbilityId.CHARGE_COUNTER)) return false;
  charge.followupWindowRemaining = charge.bufferWindowSeconds;
  charge.lastDeniedReason = null;
  return true;
}

export function queueChargeCounter(world, entity) {
  const charge = getComponent(world, entity, ComponentType.ChargeCounterState);
  const dodge = getComponent(world, entity, ComponentType.DodgeState);
  const stamina = getComponent(world, entity, ComponentType.Stamina);
  const health = getComponent(world, entity, ComponentType.Health);
  const denied = chargeCounterDenial(world, entity, charge, dodge, stamina, health);
  if (denied) {
    if (charge) charge.lastDeniedReason = denied;
    return false;
  }
  stamina.current = Math.max(0, stamina.current - CHARGE_ABILITY.staminaCost);
  stamina.spentTotal += CHARGE_ABILITY.staminaCost;
  stamina.lastSpendReason = AbilityId.CHARGE_COUNTER;
  stamina.recoveryTimer = stamina.recoveryDelay;
  stamina.sprinting = false;
  Object.assign(charge, {
    state: 'queued',
    queued: true,
    active: false,
    followupWindowRemaining: 0,
    lastDeniedReason: null,
    lastHitIds: [],
    hitCount: 0
  });
  return true;
}

export function chargeCounterSystem({ game, dt = 0 }) {
  const delta = Math.max(0, Number(dt) || 0);
  for (const entity of query(game.world, [ComponentType.ChargeCounterState, ComponentType.Health])) {
    const charge = getComponent(game.world, entity, ComponentType.ChargeCounterState);
    const health = getComponent(game.world, entity, ComponentType.Health);
    const dodge = getComponent(game.world, entity, ComponentType.DodgeState);
    const action = getComponent(game.world, entity, ComponentType.ActionState);
    charge.followupWindowRemaining = Math.max(0, charge.followupWindowRemaining - delta);
    if (!health.alive) {
      resetChargeCounterState(charge);
      continue;
    }
    if (charge.queued && !dodge?.active) beginQueuedCharge(game.world, entity, charge);
    syncChargeStateFromAction(charge, action);
  }
}

export function resolveChargeCounterDirection(intent, transform, dodge) {
  const dodgeDirection = normalise(dodge?.directionX, dodge?.directionY)
    ?? facingDirection(transform);
  const desired = normalise(intent?.moveX, intent?.moveY)
    ?? normalise((intent?.aimX ?? transform?.x) - (transform?.x ?? 0), (intent?.aimY ?? transform?.y) - (transform?.y ?? 0))
    ?? dodgeDirection
    ?? facingDirection(transform);
  return limitRedirect(dodgeDirection, desired, ABILITIES[AbilityId.CHARGE_COUNTER].maxRedirectDegrees * Math.PI / 180);
}

export function resetChargeCounterState(charge) {
  if (!charge) return;
  Object.assign(charge, {
    state: 'idle',
    active: false,
    queued: false,
    followupWindowRemaining: 0,
    queuedDirectionX: 0,
    queuedDirectionY: 0,
    hitCount: 0,
    lastHitIds: []
  });
}

function chargeCounterDenial(world, entity, charge, dodge, stamina, health) {
  if (!charge) return 'charge_state_missing';
  if (!canUseAbility(world, entity, AbilityId.CHARGE_COUNTER)) return 'charge_locked';
  if (!health?.alive) return 'not_alive';
  if (charge.active || charge.queued) return 'charge_already_committed';
  if (!(dodge?.active || dodge?.recovering) || charge.followupWindowRemaining <= 0) return 'followup_window_closed';
  if (!stamina || stamina.current + 0.0001 < CHARGE_ABILITY.staminaCost) return 'insufficient_stamina';
  return null;
}

function beginQueuedCharge(world, entity, charge) {
  const transform = getComponent(world, entity, ComponentType.Transform);
  const intent = getComponent(world, entity, ComponentType.PlayerIntent);
  const dodge = getComponent(world, entity, ComponentType.DodgeState);
  const direction = resolveChargeCounterDirection(intent, transform, dodge);
  const started = startProceduralAction(world, entity, WyvernActionId.CHARGE_COUNTER, {
    force: true,
    sourceAbilityId: AbilityId.CHARGE_COUNTER,
    aimX: transform.x + direction.x * 5,
    aimY: transform.y + direction.y * 5
  });
  if (!started) {
    charge.queued = false;
    charge.state = 'idle';
    charge.lastDeniedReason = 'charge_action_start_failed';
    refundChargeCost(world, entity);
    return;
  }
  Object.assign(charge, {
    queued: false,
    active: true,
    state: 'plant',
    queuedDirectionX: direction.x,
    queuedDirectionY: direction.y,
    count: charge.count + 1,
    lastDeniedReason: null,
    lastReceipt: null
  });
}

function syncChargeStateFromAction(charge, action) {
  if (!charge.active) return;
  if (action?.active && action.actionId === WyvernActionId.CHARGE_COUNTER) {
    charge.state = action.phaseLabel ?? 'plant';
    charge.lastHitIds = [...(action.resolvedContacts ?? charge.lastHitIds)];
    charge.hitCount = charge.lastHitIds.length;
    return;
  }
  if (action?.recovering && action.recoveryActionId === WyvernActionId.CHARGE_COUNTER) {
    charge.state = 'recover';
    return;
  }
  charge.lastReceipt = {
    abilityId: AbilityId.CHARGE_COUNTER,
    count: charge.count,
    hitCount: charge.hitCount,
    hitIds: [...charge.lastHitIds]
  };
  charge.state = 'idle';
  charge.active = false;
}

function refundChargeCost(world, entity) {
  const stamina = getComponent(world, entity, ComponentType.Stamina);
  if (!stamina) return;
  stamina.current = Math.min(stamina.max, stamina.current + CHARGE_ABILITY.staminaCost);
  stamina.spentTotal = Math.max(0, stamina.spentTotal - CHARGE_ABILITY.staminaCost);
}

function limitRedirect(base, desired, maxRadians) {
  const baseAngle = Math.atan2(base.y, base.x);
  const desiredAngle = Math.atan2(desired.y, desired.x);
  const delta = Math.atan2(Math.sin(desiredAngle - baseAngle), Math.cos(desiredAngle - baseAngle));
  const limited = Math.max(-maxRadians, Math.min(maxRadians, delta));
  return { x: Math.cos(baseAngle + limited), y: Math.sin(baseAngle + limited) };
}

function facingDirection(transform) {
  const rotation = transform?.rotation ?? 0;
  return { x: Math.cos(rotation), y: Math.sin(rotation) };
}

function normalise(x, y) {
  const dx = Number(x);
  const dy = Number(y);
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length <= 0.001) return null;
  return { x: dx / length, y: dy / length };
}
