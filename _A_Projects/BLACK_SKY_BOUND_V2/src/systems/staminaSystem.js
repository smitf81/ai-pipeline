import { ComponentType } from '../constants/componentTypes.js';
import { getComponent } from '../ecs/world.js';
import { query } from '../ecs/query.js';
import { resolvePlayerDodgeDirection, startDodge } from './dodgeState.js';
import { openChargeCounterWindow, queueChargeCounter } from './chargeCounterSystem.js';
import { emitEvent } from '../ecs/events.js';
import { EventType } from '../constants/eventTypes.js';
import { AbilityId } from '../constants/abilityIds.js';
import { getAbilityDefinition } from '../data/abilities.js';

export function staminaSystem({ game, dt }) {
  const delta = Math.max(0, Number(dt) || 0);
  for (const entity of query(game.world, [ComponentType.Stamina, ComponentType.Health])) {
    const stamina = getComponent(game.world, entity, ComponentType.Stamina);
    const health = getComponent(game.world, entity, ComponentType.Health);
    const dodge = getComponent(game.world, entity, ComponentType.DodgeState);
    const charge = getComponent(game.world, entity, ComponentType.ChargeCounterState);
    const intent = getComponent(game.world, entity, ComponentType.PlayerIntent);
    const action = getComponent(game.world, entity, ComponentType.ActionState);
    stamina.current = clamp(stamina.current, 0, stamina.max);
    const recoveryBefore = stamina.recoveryTimer;
    stamina.recoveryTimer = Math.max(0, recoveryBefore - delta);
    const regenerationDelta = Math.max(0, delta - recoveryBefore);
    if (dodge) dodge.cooldownRemaining = Math.max(0, dodge.cooldownRemaining - delta);
    if (!health.alive) {
      stamina.sprinting = false;
      stamina.state = 'inactive';
      if (dodge) {
        dodge.active = false;
        dodge.recovering = false;
      }
      continue;
    }

    let startedDodge = false;
    let queuedCharge = false;
    if (intent?.dodgeFollowup) {
      queuedCharge = queueChargeCounter(game.world, entity);
      intent.dodgeFollowup = false;
      if (queuedCharge) {
        emitAcceptedAction(game, entity, AbilityId.CHARGE_COUNTER);
        clearConflictingIntent(intent);
      }
    } else if (intent?.dodge) {
      const transform = getComponent(game.world, entity, ComponentType.Transform);
      startedDodge = startDodge(game.world, entity, resolvePlayerDodgeDirection(intent, transform), 'player_input');
      intent.dodge = false;
      if (startedDodge) {
        openChargeCounterWindow(game.world, entity);
        emitAcceptedAction(game, entity, AbilityId.DODGE);
        clearConflictingIntent(intent);
      }
    }

    if (stamina.exhausted && stamina.current >= stamina.sprintResumeThreshold) stamina.exhausted = false;
    const moving = Math.hypot(intent?.moveX ?? 0, intent?.moveY ?? 0) > 0.001;
    const wantsSprint = intent?.sprint === true && moving;
    stamina.sprinting = stamina.sprintEnabled
      && wantsSprint
      && !stamina.exhausted
      && stamina.current > 0
      && !dodge?.active
      && !charge?.active
      && !charge?.queued
      && !action?.active;
    if (stamina.sprinting) {
      const spent = Math.min(stamina.current, stamina.sprintDrainPerSecond * delta);
      stamina.current -= spent;
      stamina.spentTotal += spent;
      stamina.lastSpendReason = 'sprint';
      stamina.recoveryTimer = stamina.recoveryDelay;
      if (stamina.current <= 0.0001) {
        stamina.current = 0;
        stamina.sprinting = false;
        stamina.exhausted = true;
      }
    } else if (!dodge?.active && !charge?.active && !charge?.queued && regenerationDelta > 0 && stamina.current < stamina.max) {
      const before = stamina.current;
      stamina.current = Math.min(stamina.max, stamina.current + stamina.regenPerSecond * regenerationDelta);
      stamina.regeneratedTotal += stamina.current - before;
    }

    const motion = getComponent(game.world, entity, ComponentType.Motion);
    if (motion) motion.speedMultiplier = stamina.sprinting ? stamina.sprintMultiplier : 1;
    if (charge?.queued || queuedCharge) stamina.state = 'charge_queued';
    else if (charge?.active) stamina.state = charge.state === 'recover' ? 'charge_recovery' : 'charging';
    else if (dodge?.active || startedDodge) stamina.state = 'dodging';
    else if (stamina.sprinting) stamina.state = 'sprinting';
    else if (stamina.exhausted) stamina.state = 'exhausted';
    else stamina.state = stamina.recoveryTimer > 0 ? 'recovering' : 'ready';
  }
}

function emitAcceptedAction(game, source, abilityId) {
  const ability = getAbilityDefinition(abilityId);
  emitEvent(game.world, EventType.PLAYER_ACTION_ACCEPTED, {
    source,
    abilityId,
    inputAction: ability?.inputAction ?? null
  });
}

function clearConflictingIntent(intent) {
  intent.melee = false;
  intent.bite = false;
  intent.lunge = false;
  intent.smoke = false;
  intent.sprint = false;
  intent.dodge = false;
  intent.dodgeFollowup = false;
}

function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}
