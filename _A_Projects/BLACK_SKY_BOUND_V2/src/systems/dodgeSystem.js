import { ComponentType } from '../constants/componentTypes.js';
import { getComponent } from '../ecs/world.js';
import { query } from '../ecs/query.js';
import { moveEntityRaw } from './movementSystem.js';

export function dodgeSystem({ game, map, dt }) {
  const delta = Math.max(0, Number(dt) || 0);
  for (const entity of query(game.world, [ComponentType.Transform, ComponentType.DodgeState, ComponentType.Health])) {
    const dodge = getComponent(game.world, entity, ComponentType.DodgeState);
    const health = getComponent(game.world, entity, ComponentType.Health);
    if (!health.alive) {
      clearDodgeVisualState(dodge);
      continue;
    }
    if (!dodge.active) {
      if (dodge.recovering) advanceDodgeRecovery(dodge, delta);
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
  dodge.phase = startPhase;
  if (!dodge.recovering) dodge.phase = 1;
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
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smooth01(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}
