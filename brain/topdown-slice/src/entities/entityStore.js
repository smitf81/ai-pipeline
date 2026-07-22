import { getInitialActorEnergyState } from '../units/energy.js';
import { withWorldPosition } from '../world/coordinates.js';

function makeId(prefix, n) {
  return `${prefix}-${String(n).padStart(3, '0')}`;
}

export function createTaskActorBase({ id, type, x, y, z = 0, position = null }) {
  const energyState = getInitialActorEnergyState(type);
  const actor = withWorldPosition({
    id,
    type,
    state: 'idle',
    currentTask: null,
    taskQueue: [],
    failedTasks: [],
    taskHistory: [],
    moveCooldownFrames: 0,
    rechargeCooldownFrames: 0,
    rechargeBuildingId: null,
    ...energyState
  }, position ?? { x, y, z });

  return actor;
}

export function createEntityStore() {
  return {
    counters: { unit: 1, building: 1, task: 1 },
    units: [],
    buildings: [],
    agent: createTaskActorBase({ id: 'agent-001', type: 'god-agent', x: 3, y: 3 })
  };
}

export function nextEntityId(store, kind) {
  const id = makeId(kind, store.counters[kind]);
  store.counters[kind] += 1;
  return id;
}
