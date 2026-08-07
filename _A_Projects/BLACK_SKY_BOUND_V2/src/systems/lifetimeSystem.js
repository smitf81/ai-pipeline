import { ComponentType } from '../constants/componentTypes.js';
import { getComponent, removeEntity } from '../ecs/world.js';
import { query } from '../ecs/query.js';

export function lifetimeSystem({ game, dt }) {
  const expired = [];
  for (const entity of query(game.world, [ComponentType.Lifetime])) {
    const lifetime = getComponent(game.world, entity, ComponentType.Lifetime);
    lifetime.age += dt;
    if (lifetime.age >= lifetime.duration) expired.push(entity);
  }
  for (const entity of expired) removeEntity(game.world, entity);
}
