export function query(world, componentNames) {
  const [first, ...rest] = componentNames;
  const firstStore = world.components.get(first);
  if (!firstStore) return [];
  const results = [];
  for (const entity of firstStore.keys()) {
    if (!world.entities.has(entity)) continue;
    if (rest.every((name) => world.components.get(name)?.has(entity))) results.push(entity);
  }
  return results;
}

export function hasComponents(world, entity, componentNames) {
  return componentNames.every((name) => world.components.get(name)?.has(entity));
}
