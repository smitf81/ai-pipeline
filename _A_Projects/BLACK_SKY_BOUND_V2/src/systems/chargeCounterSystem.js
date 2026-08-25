import { AbilityId } from '../constants/abilityIds.js';
import { ComponentType } from '../constants/componentTypes.js';
import { ABILITIES } from '../data/abilities.js';
import { WyvernActionId } from '../data/creatures/groundedWyvernMotionProfiles.js';
import { getComponent } from '../ecs/world.js';
import { query } from '../ecs/query.js';
import { canUseAbility } from '../game/playerAbilities.js';
import { startProceduralAction } from './proceduralActionState.js';

const POUNCE_ABILITY = ABILITIES[AbilityId.POUNCE_COUNTER];

export function openPounceCounterWindow(world, entity) {
  const pounce = getComponent(world, entity, ComponentType.PounceCounterState);
  const dodge = getComponent(world, entity, ComponentType.DodgeState);
  if (!pounce || dodge?.followupsEnabled === false || !canUseAbility(world, entity, AbilityId.POUNCE_COUNTER)) {
    if (pounce && dodge?.followupsEnabled === false) {
      pounce.followupWindowRemaining = 0;
      pounce.lastDeniedReason = 'emergency_dodge_no_followup';
    }
    return false;
  }
  pounce.followupWindowRemaining = pounce.bufferWindowSeconds;
  pounce.lastDeniedReason = null;
  return true;
}

export function queuePounceCounter(world, entity, direction) {
  const pounce = getComponent(world, entity, ComponentType.PounceCounterState);
  const dodge = getComponent(world, entity, ComponentType.DodgeState);
  const stamina = getComponent(world, entity, ComponentType.Stamina);
  const health = getComponent(world, entity, ComponentType.Health);
  const normalized = normalise(direction?.x, direction?.y);
  const denied = pounceCounterDenial(world, entity, pounce, dodge, stamina, health, normalized);
  if (denied) {
    if (pounce) pounce.lastDeniedReason = denied;
    if (dodge && denied === 'followup_committed') dodge.lastDeniedReason = denied;
    return false;
  }
  stamina.current = Math.max(0, stamina.current - POUNCE_ABILITY.staminaCost);
  stamina.spentTotal += POUNCE_ABILITY.staminaCost;
  stamina.lastSpendReason = AbilityId.POUNCE_COUNTER;
  stamina.recoveryTimer = stamina.recoveryDelay;
  stamina.sprinting = false;
  Object.assign(pounce, {
    state: 'queued',
    queued: true,
    active: false,
    followupWindowRemaining: 0,
    queuedDirectionX: normalized.x,
    queuedDirectionY: normalized.y,
    lastDeniedReason: null,
    lastImpactReceipt: null,
    lastHitIds: [],
    hitCount: 0
  });
  dodge.committedBranch = 'pounce_counter';
  const transform = getComponent(world, entity, ComponentType.Transform);
  if (transform) transform.rotation = Math.atan2(normalized.y, normalized.x);
  return true;
}

export function pounceCounterSystem({ game, dt = 0 }) {
  const delta = Math.max(0, Number(dt) || 0);
  for (const entity of query(game.world, [ComponentType.PounceCounterState, ComponentType.Health])) {
    const pounce = getComponent(game.world, entity, ComponentType.PounceCounterState);
    const health = getComponent(game.world, entity, ComponentType.Health);
    const dodge = getComponent(game.world, entity, ComponentType.DodgeState);
    const action = getComponent(game.world, entity, ComponentType.ActionState);
    pounce.followupWindowRemaining = Math.max(0, pounce.followupWindowRemaining - delta);
    if (!health.alive) {
      resetPounceCounterState(pounce);
      continue;
    }
    if (pounce.queued && !dodge?.active) beginQueuedPounce(game.world, entity, pounce);
    syncPounceStateFromAction(pounce, action);
  }
}

export function resolvePounceCounterDirection(intent, transform) {
  return (intent?.aimActive
    ? normalise((intent?.aimX ?? transform?.x) - (transform?.x ?? 0), (intent?.aimY ?? transform?.y) - (transform?.y ?? 0))
    : null) ?? facingDirection(transform);
}

export function resetPounceCounterState(pounce) {
  if (!pounce) return;
  Object.assign(pounce, {
    state: 'idle',
    active: false,
    queued: false,
    followupWindowRemaining: 0,
    queuedDirectionX: 0,
    queuedDirectionY: 0,
    hitCount: 0,
    lastHitIds: [],
    lastImpactReceipt: null
  });
}

function pounceCounterDenial(world, entity, pounce, dodge, stamina, health, direction) {
  if (!pounce) return 'pounce_state_missing';
  if (!canUseAbility(world, entity, AbilityId.POUNCE_COUNTER)) return 'pounce_locked';
  if (!health?.alive) return 'not_alive';
  if (pounce.active || pounce.queued) return 'pounce_already_committed';
  if (dodge?.followupsEnabled === false) return 'emergency_dodge_no_followup';
  if (dodge?.committedBranch) return 'followup_committed';
  if (!(dodge?.active || dodge?.recovering || pounce.followupWindowRemaining > 0) || pounce.followupWindowRemaining <= 0) return 'followup_window_closed';
  if (!direction) return 'missing_direction';
  if (!stamina || stamina.current + 0.0001 < POUNCE_ABILITY.staminaCost) return 'insufficient_stamina';
  return null;
}

function beginQueuedPounce(world, entity, pounce) {
  const transform = getComponent(world, entity, ComponentType.Transform);
  const direction = normalise(pounce.queuedDirectionX, pounce.queuedDirectionY) ?? facingDirection(transform);
  const started = startProceduralAction(world, entity, WyvernActionId.POUNCE_COUNTER, {
    force: true,
    sourceAbilityId: AbilityId.POUNCE_COUNTER,
    aimX: transform.x + direction.x * 5,
    aimY: transform.y + direction.y * 5
  });
  if (!started) {
    pounce.queued = false;
    pounce.state = 'idle';
    pounce.lastDeniedReason = 'pounce_action_start_failed';
    refundPounceCost(world, entity);
    return;
  }
  Object.assign(pounce, {
    queued: false,
    active: true,
    state: 'coil',
    queuedDirectionX: direction.x,
    queuedDirectionY: direction.y,
    count: pounce.count + 1,
    lastDeniedReason: null,
    lastReceipt: null
  });
}

function syncPounceStateFromAction(pounce, action) {
  if (!pounce.active) return;
  if (action?.active && action.actionId === WyvernActionId.POUNCE_COUNTER) {
    pounce.state = action.phaseLabel ?? 'coil';
    pounce.lastHitIds = [...(action.resolvedContacts ?? pounce.lastHitIds)];
    pounce.hitCount = pounce.lastHitIds.length;
    pounce.lastImpactReceipt = action.lastImpactReceipt ?? pounce.lastImpactReceipt;
    return;
  }
  if (action?.recovering && action.recoveryActionId === WyvernActionId.POUNCE_COUNTER) {
    pounce.state = 'recover';
    return;
  }
  pounce.lastReceipt = {
    abilityId: AbilityId.POUNCE_COUNTER,
    count: pounce.count,
    hitCount: pounce.hitCount,
    hitIds: [...pounce.lastHitIds],
    impact: pounce.lastImpactReceipt
  };
  pounce.state = 'idle';
  pounce.active = false;
}

function refundPounceCost(world, entity) {
  const stamina = getComponent(world, entity, ComponentType.Stamina);
  if (!stamina) return;
  stamina.current = Math.min(stamina.max, stamina.current + POUNCE_ABILITY.staminaCost);
  stamina.spentTotal = Math.max(0, stamina.spentTotal - POUNCE_ABILITY.staminaCost);
}

function facingDirection(transform) {
  const rotation = transform?.rotation ?? 0;
  return { x: Math.cos(rotation), y: Math.sin(rotation) };
}

export const openChargeCounterWindow = openPounceCounterWindow;
export const queueChargeCounter = queuePounceCounter;
export const chargeCounterSystem = pounceCounterSystem;
export const resolveChargeCounterDirection = resolvePounceCounterDirection;
export const resetChargeCounterState = resetPounceCounterState;

function normalise(x, y) {
  const dx = Number(x);
  const dy = Number(y);
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length <= 0.001) return null;
  return { x: dx / length, y: dy / length };
}
