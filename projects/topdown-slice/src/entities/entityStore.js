function makeId(prefix, n) {
  return `${prefix}-${String(n).padStart(3, '0')}`;
}

export function createEntityStore() {
  return {
    counters: { unit: 1, building: 1 },
    units: [],
    buildings: [],
    agent: { id: 'agent-001', type: 'god-agent', x: 3, y: 3, state: 'idle', actionQueue: [] }
  };
}

export function nextEntityId(store, kind) {
  const id = makeId(kind, store.counters[kind]);
  store.counters[kind] += 1;
  return id;
}
