import { ComponentType } from '../constants/componentTypes.js';

const VALID_COMPONENTS = new Set(Object.values(ComponentType));

export function validateWorldState(world) {
  const errors = [];
  for (const componentName of world.components.keys()) {
    if (!VALID_COMPONENTS.has(componentName)) errors.push(`unknown_component:${componentName}`);
  }
  for (const [componentName, store] of world.components.entries()) {
    for (const entity of store.keys()) {
      if (!world.entities.has(entity)) errors.push(`orphan_component:${componentName}:${entity}`);
    }
  }
  for (const entity of world.components.get(ComponentType.Renderable)?.keys() ?? []) {
    if (!world.components.get(ComponentType.Transform)?.has(entity)) errors.push(`renderable_without_transform:${entity}`);
  }
  for (const entity of world.components.get(ComponentType.Health)?.keys() ?? []) {
    const health = world.components.get(ComponentType.Health).get(entity);
    if (health.maxHp <= 0 || health.hp < 0 || health.hp > health.maxHp) errors.push(`invalid_health:${entity}`);
  }
  return { ok: errors.length === 0, errors };
}
