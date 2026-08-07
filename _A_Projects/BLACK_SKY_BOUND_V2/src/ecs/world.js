export function createWorld() {
  return {
    nextEntityId: 1,
    entities: new Set(),
    components: new Map(),
    events: []
  };
}

export function createEntity(world, prefix = 'entity') {
  const entity = `${prefix}_${world.nextEntityId++}`;
  world.entities.add(entity);
  return entity;
}

export function addComponent(world, entity, componentName, data = {}) {
  if (!world.entities.has(entity)) throw new Error(`Cannot add ${componentName}; unknown entity ${entity}`);
  if (!world.components.has(componentName)) world.components.set(componentName, new Map());
  world.components.get(componentName).set(entity, data);
  return data;
}

export function setComponent(world, entity, componentName, data = {}) {
  return addComponent(world, entity, componentName, data);
}

export function getComponent(world, entity, componentName) {
  return world.components.get(componentName)?.get(entity) ?? null;
}

export function hasComponent(world, entity, componentName) {
  return world.components.get(componentName)?.has(entity) ?? false;
}

export function removeComponent(world, entity, componentName) {
  world.components.get(componentName)?.delete(entity);
}

export function removeEntity(world, entity) {
  world.entities.delete(entity);
  for (const store of world.components.values()) store.delete(entity);
}
