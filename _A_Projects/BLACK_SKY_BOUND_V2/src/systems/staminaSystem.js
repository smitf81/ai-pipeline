import { ComponentType } from '../constants/componentTypes.js';
import { getComponent } from '../ecs/world.js';
import { query } from '../ecs/query.js';
import {
  advanceBufferedPlayerDodge,
  queueDodgeChain,
  requestPlayerDodge,
  resolvePlayerDodgeDirection
} from './dodgeState.js';
import { openPounceCounterWindow, queuePounceCounter } from './chargeCounterSystem.js';
import { emitEvent } from '../ecs/events.js';
import { EventType } from '../constants/eventTypes.js';
import { AbilityId } from '../constants/abilityIds.js';
import { getAbilityDefinition } from '../data/abilities.js';
import { resolveSprintResumeThreshold } from './dodgeStaminaGradient.js';

export function staminaSystem({ game, dt }) {
  const delta = Math.max(0, Number(dt) || 0);
  for (const entity of query(game.world, [ComponentType.Stamina, ComponentType.Health])) {
    const stamina = getComponent(game.world, entity, ComponentType.Stamina);
    const health = getComponent(game.world, entity, ComponentType.Health);
    const dodge = getComponent(game.world, entity, ComponentType.DodgeState);
    const pounce = getComponent(game.world, entity, ComponentType.PounceCounterState);
    const intent = getComponent(game.world, entity, ComponentType.PlayerIntent);
    const action = getComponent(game.world, entity, ComponentType.ActionState);
    stamina.current = clamp(stamina.current, 0, stamina.max);
    stamina.sprintResumeThreshold = resolveSprintResumeThreshold(stamina);
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
    let queuedPounce = false;
    let queuedDodge = false;
    const bufferedResult = dodge?.buffered ? advanceBufferedPlayerDodge(game.world, entity, delta) : null;
    if (bufferedResult?.outcome === 'started') {
      startedDodge = true;
      if (dodge.followupsEnabled) openPounceCounterWindow(game.world, entity);
      emitAcceptedDodge(game, entity, bufferedResult.receipt);
      clearConflictingIntent(intent);
    } else if (bufferedResult?.outcome === 'pending') {
      if (intent?.dodge) dodge.lastDeniedReason = 'dodge_buffer_occupied';
      clearConflictingIntent(intent);
    } else if (intent?.dodgeChain) {
      const transform = getComponent(game.world, entity, ComponentType.Transform);
      queuedDodge = queueDodgeChain(game.world, entity, resolvePlayerDodgeDirection(intent, transform));
      intent.dodgeChain = false;
      if (queuedDodge) {
        clearConflictingIntent(intent);
      }
    } else if (intent?.pounceCounter) {
      const transform = getComponent(game.world, entity, ComponentType.Transform);
      queuedPounce = queuePounceCounter(game.world, entity, resolvePounceDirection(intent, transform));
      intent.pounceCounter = false;
      if (queuedPounce) {
        emitAcceptedAction(game, entity, AbilityId.POUNCE_COUNTER);
        clearConflictingIntent(intent);
      }
    } else if (intent?.dodge) {
      const transform = getComponent(game.world, entity, ComponentType.Transform);
      const request = requestPlayerDodge(game.world, entity, resolvePlayerDodgeDirection(intent, transform), 'player_input');
      startedDodge = request.outcome === 'started';
      intent.dodge = false;
      if (request.ok) {
        if (startedDodge && dodge.followupsEnabled) openPounceCounterWindow(game.world, entity);
        if (startedDodge) emitAcceptedDodge(game, entity, request.receipt);
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
      && !dodge?.buffered
      && !pounce?.active
      && !pounce?.queued
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
    } else if (!dodge?.active && !dodge?.buffered && !pounce?.active && !pounce?.queued && regenerationDelta > 0 && stamina.current < stamina.max) {
      const before = stamina.current;
      stamina.current = Math.min(stamina.max, stamina.current + stamina.regenPerSecond * regenerationDelta);
      stamina.regeneratedTotal += stamina.current - before;
    }

    const motion = getComponent(game.world, entity, ComponentType.Motion);
    if (motion) motion.speedMultiplier = stamina.sprinting ? stamina.sprintMultiplier : 1;
    if (pounce?.queued || queuedPounce) stamina.state = 'pounce_queued';
    else if (pounce?.active) stamina.state = pounce.state === 'recover' ? 'pounce_recovery' : 'pouncing';
    else if (dodge?.queuedChain || queuedDodge) stamina.state = 'dodge_chain_queued';
    else if (dodge?.buffered) stamina.state = 'dodge_buffered';
    else if (dodge?.active || startedDodge) stamina.state = dodge?.mode === 'emergency' ? 'emergency_dodging' : 'dodging';
    else if (stamina.sprinting) stamina.state = 'sprinting';
    else if (stamina.exhausted) stamina.state = 'exhausted';
    else stamina.state = stamina.recoveryTimer > 0 ? 'recovering' : 'ready';
  }
}

function emitAcceptedDodge(game, source, receipt) {
  emitAcceptedAction(game, source, AbilityId.DODGE, {
    dodgeMode: receipt?.mode ?? 'full',
    energy01: receipt?.energy01 ?? 1,
    effectiveness: receipt?.effectiveness ?? 1,
    followupsEnabled: receipt?.followupsEnabled === true,
    buffered: receipt?.buffered === true,
    interruptedActionId: receipt?.interruptedAction?.actionId ?? null
  });
}

function emitAcceptedAction(game, source, abilityId, details = {}) {
  const ability = getAbilityDefinition(abilityId);
  emitEvent(game.world, EventType.PLAYER_ACTION_ACCEPTED, {
    source,
    abilityId,
    inputAction: ability?.inputAction ?? null,
    ...details
  });
}

function clearConflictingIntent(intent) {
  intent.melee = false;
  intent.bite = false;
  intent.lunge = false;
  intent.smoke = false;
  intent.sprint = false;
  intent.dodge = false;
  intent.dodgeChain = false;
  intent.pounceCounter = false;
}

function resolvePounceDirection(intent, transform) {
  if (intent?.aimActive) {
    const dx = intent.aimX - transform.x;
    const dy = intent.aimY - transform.y;
    const length = Math.hypot(dx, dy);
    if (length > 0.001) return { x: dx / length, y: dy / length };
  }
  return { x: Math.cos(transform.rotation ?? 0), y: Math.sin(transform.rotation ?? 0) };
}

function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}
