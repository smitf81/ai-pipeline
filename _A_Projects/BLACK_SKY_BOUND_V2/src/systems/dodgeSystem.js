import { ComponentType } from '../constants/componentTypes.js';
import { getComponent } from '../ecs/world.js';
import { query } from '../ecs/query.js';
import { moveEntityRaw } from './movementSystem.js';
import {
  cancelBufferedPlayerDodge,
  queuedDodgeResolution,
  refundQueuedDodgeCost,
  startDodge
} from './dodgeState.js';
import { openPounceCounterWindow } from './chargeCounterSystem.js';
import { AbilityId } from '../constants/abilityIds.js';
import { EventType } from '../constants/eventTypes.js';
import { emitEvent } from '../ecs/events.js';
import { getAbilityDefinition } from '../data/abilities.js';

export function dodgeSystem({ game, map, dt }) {
  const delta = Math.max(0, Number(dt) || 0);
  for (const entity of query(game.world, [ComponentType.Transform, ComponentType.DodgeState, ComponentType.Health])) {
    const dodge = getComponent(game.world, entity, ComponentType.DodgeState);
    const health = getComponent(game.world, entity, ComponentType.Health);
    if (!health.alive) {
      if (dodge.buffered) cancelBufferedPlayerDodge(game.world, entity, 'dodge_buffer_death_refund');
      if (dodge.queuedChain) refundQueuedDodgeCost(game.world, entity, 'dodge_chain_death_refund');
      clearDodgeVisualState(dodge);
      continue;
    }
    if (!dodge.active) {
      if (dodge.recovering) {
        advanceDodgeRecovery(dodge, delta);
        if (dodge.queuedChain) {
          dodge.landingHoldRemaining = Math.max(0, dodge.landingHoldRemaining - delta);
          if (dodge.landingHoldRemaining <= 0) launchQueuedDodge(game, entity, dodge);
        }
      }
      continue;
    }
    const transform = getComponent(game.world, entity, ComponentType.Transform);
    const previousPhase = dodge.phase;
    const remaining = Math.max(0, dodge.distance - dodge.distanceApplied);
    const step = Math.min(remaining, dodge.distance * delta / Math.max(0.01, dodge.duration));
    const beforeX = transform.x;
    const beforeY = transform.y;
    const moved = step > 0 && moveEntityRaw(game.world, entity, dodge.directionX * step, dodge.directionY * step, map);
    const applied = Math.hypot(transform.x - beforeX, transform.y - beforeY);
    dodge.distanceApplied = Math.min(dodge.distance, dodge.distanceApplied + applied);
    dodge.elapsed = Math.min(dodge.duration, dodge.elapsed + delta);
    dodge.phase = Math.min(1, dodge.elapsed / dodge.duration) * dodge.visualRecoveryStartPhase;
    if (!moved && remaining > 0.0001) {
      dodge.blocked = true;
      beginDodgeRecovery(dodge, previousPhase);
    } else if (dodge.elapsed >= dodge.duration || dodge.distanceApplied >= dodge.distance - 0.0001) {
      beginDodgeRecovery(dodge, previousPhase);
    }
  }
}

function beginDodgeRecovery(dodge, previousPhase) {
  const duration = Math.max(0, Number(dodge.visualRecoveryDuration) || 0);
  const startPhase = Math.max(
    0,
    Math.min(1, Math.max(Number(dodge.visualRecoveryStartPhase) || 0, Number(previousPhase) || 0))
  );
  dodge.active = false;
  dodge.recovering = duration > 0 && startPhase < 1;
  dodge.recoveryElapsed = 0;
  dodge.recoveryProgress = 0;
  dodge.recoveryStartPhase = startPhase;
  dodge.landingHoldRemaining = dodge.queuedChain ? dodge.chainLandingHoldSeconds : 0;
  dodge.phase = startPhase;
  if (!dodge.recovering) dodge.phase = 1;
}

function launchQueuedDodge(game, entity, dodge) {
  const world = game.world;
  const direction = { x: dodge.queuedDirectionX, y: dodge.queuedDirectionY };
  const nextChainIndex = (dodge.chainIndex ?? 1) + 1;
  const resolvedGradient = queuedDodgeResolution(dodge);
  const started = startDodge(world, entity, direction, 'queued_dodge_chain', {
    allowCooldownBypass: true,
    allowPartialStamina: true,
    costAlreadyPaid: true,
    chainIndex: nextChainIndex,
    resolvedGradient
  });
  if (started) {
    if (dodge.followupsEnabled) openPounceCounterWindow(world, entity);
    const ability = getAbilityDefinition(AbilityId.DODGE);
    emitEvent(world, EventType.PLAYER_ACTION_ACCEPTED, {
      source: entity,
      abilityId: AbilityId.DODGE,
      inputAction: ability?.inputAction ?? null,
      chained: true,
      chainIndex: nextChainIndex,
      dodgeMode: resolvedGradient.mode,
      energy01: resolvedGradient.energy01,
      effectiveness: resolvedGradient.effectiveness,
      followupsEnabled: resolvedGradient.followupsEnabled
    });
    return;
  }
  refundQueuedDodgeCost(world, entity, 'dodge_chain_launch_refund');
}

function advanceDodgeRecovery(dodge, delta) {
  dodge.recoveryElapsed = Math.min(dodge.visualRecoveryDuration, dodge.recoveryElapsed + delta);
  dodge.recoveryProgress = dodge.visualRecoveryDuration > 0
    ? Math.min(1, dodge.recoveryElapsed / dodge.visualRecoveryDuration)
    : 1;
  dodge.phase = lerp(dodge.recoveryStartPhase, 1, smooth01(dodge.recoveryProgress));
  if (dodge.recoveryProgress >= 1) {
    dodge.recovering = false;
    dodge.phase = 1;
  }
}

function clearDodgeVisualState(dodge) {
  dodge.active = false;
  dodge.recovering = false;
  dodge.recoveryElapsed = 0;
  dodge.recoveryProgress = 0;
  dodge.recoveryStartPhase = 1;
  dodge.phase = 1;
  dodge.landingHoldRemaining = 0;
  dodge.queuedChain = false;
  dodge.queuedDirectionX = 0;
  dodge.queuedDirectionY = 0;
  dodge.reservedChainCost = 0;
  dodge.committedBranch = null;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smooth01(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}
