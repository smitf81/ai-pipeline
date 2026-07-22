import { ComponentType } from '../constants/componentTypes.js';
import { getComponent } from '../ecs/world.js';
import { query } from '../ecs/query.js';

export function timerSystem({ game, dt }) {
  for (const entity of query(game.world, [ComponentType.Cooldowns])) {
    const cooldowns = getComponent(game.world, entity, ComponentType.Cooldowns);
    for (const key of Object.keys(cooldowns)) cooldowns[key] = Math.max(0, cooldowns[key] - dt);
  }
  for (const entity of query(game.world, [ComponentType.StatusEffects])) {
    const status = getComponent(game.world, entity, ComponentType.StatusEffects);
    status.panicTimer = Math.max(0, (status.panicTimer ?? 0) - dt);
    status.movementSlowTimer = Math.max(0, (status.movementSlowTimer ?? 0) - dt);
    if (status.movementSlowTimer <= 0) {
      status.movementSlowMultiplier = 1;
      status.movementSlowSource = null;
    }
  }
}
