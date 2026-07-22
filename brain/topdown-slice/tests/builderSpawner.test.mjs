import test from 'node:test';
import assert from 'node:assert/strict';

import { createTask, enqueueActorTask, tickAllActors } from '../src/ai/agentStub.js';
import {
  BUILDER_SPAWNER_DEFAULT_COOLDOWN_CYCLES,
  advanceBuilderSpawnerCooldowns,
  getBuilderSpawnerActivation
} from '../src/buildings/builderSpawner.js';
import { placeBuilding } from '../src/buildings/buildings.js';
import { createEntityStore } from '../src/entities/entityStore.js';
import { spawnUnit } from '../src/units/units.js';
import { createField } from '../src/world/fields.js';
import { createTilemap } from '../src/world/tilemap.js';

function createTestState() {
  const map = createTilemap();
  const store = createEntityStore();
  return {
    map,
    store,
    emergence: {
      reinforcement: createField(map.width, map.height, 0),
      resolveCycle: 0
    }
  };
}

test('builder spawner reports ready with the first free adjacent tile', () => {
  const state = createTestState();
  const placed = placeBuilding(state.store, state.map, { type: 'builder-spawner', x: 5, y: 5 });

  assert.equal(placed.ok, true);

  const activation = getBuilderSpawnerActivation(state, placed.building);
  assert.equal(activation.ok, true);
  assert.equal(activation.status, 'ready');
  assert.deepEqual(activation.spawnTile, { x: 6, y: 5 });
});

test('builder spawner reports occupied when every adjacent exit is blocked', () => {
  const state = createTestState();
  const placed = placeBuilding(state.store, state.map, { type: 'builder-spawner', x: 5, y: 5 });

  assert.equal(placed.ok, true);
  assert.equal(spawnUnit(state.store, state.map, { type: 'worker', x: 6, y: 5 }).ok, true);
  assert.equal(spawnUnit(state.store, state.map, { type: 'worker', x: 5, y: 6 }).ok, true);
  assert.equal(spawnUnit(state.store, state.map, { type: 'worker', x: 4, y: 5 }).ok, true);
  state.store.agent.x = 5;
  state.store.agent.y = 4;

  const activation = getBuilderSpawnerActivation(state, placed.building);
  assert.equal(activation.ok, false);
  assert.equal(activation.status, 'occupied');
  assert.equal(activation.spawnTile, null);
});

test('builder spawner reports pending when a builder spawn task is already queued', () => {
  const state = createTestState();
  const placed = placeBuilding(state.store, state.map, { type: 'builder-spawner', x: 5, y: 5 });

  assert.equal(placed.ok, true);

  const queuedTask = createTask(state.store, {
    type: 'spawnUnit',
    target: { x: placed.building.x, y: placed.building.y },
    payload: {
      unitType: 'worker',
      role: 'builder',
      source: 'builder-spawner',
      spawnerId: placed.building.id,
      spawnAt: { x: 6, y: 5 }
    },
    assignedActorId: state.store.agent.id,
    issuedByActorId: state.store.agent.id
  });
  enqueueActorTask(state.store.agent, queuedTask);

  const activation = getBuilderSpawnerActivation(state, placed.building);
  assert.equal(activation.ok, false);
  assert.equal(activation.status, 'pending');
  assert.equal(activation.pendingTasks.length, 1);
});

test('builder spawner task path spawns and registers one builder through the existing agent system', () => {
  const state = createTestState();
  const placed = placeBuilding(state.store, state.map, { type: 'builder-spawner', x: 4, y: 3 });

  assert.equal(placed.ok, true);

  const activation = getBuilderSpawnerActivation(state, placed.building);
  assert.equal(activation.ok, true);

  const task = createTask(state.store, {
    type: 'spawnUnit',
    target: { x: placed.building.x, y: placed.building.y },
    payload: {
      unitType: 'worker',
      role: 'builder',
      source: 'builder-spawner',
      spawnerId: placed.building.id,
      spawnAt: activation.spawnTile
    },
    assignedActorId: state.store.agent.id,
    issuedByActorId: state.store.agent.id
  });
  enqueueActorTask(state.store.agent, task);

  state.emergence.resolveCycle = 4;
  tickAllActors(state, () => {});

  assert.equal(state.store.units.length, 1);
  assert.equal(state.store.units[0].role, 'builder');
  assert.equal(state.store.units[0].spawnedBySpawnerId, placed.building.id);
  assert.deepEqual(
    placed.building.spawner.activeBuilderIds,
    [state.store.units[0].id]
  );
  assert.equal(
    placed.building.spawner.cooldownRemaining,
    BUILDER_SPAWNER_DEFAULT_COOLDOWN_CYCLES
  );
  assert.equal(placed.building.spawner.lastSpawnedCycle, 4);

  let followUp = getBuilderSpawnerActivation(state, placed.building);
  assert.equal(followUp.ok, false);
  assert.equal(followUp.status, 'cap');

  state.store.units.length = 0;
  advanceBuilderSpawnerCooldowns(state);
  advanceBuilderSpawnerCooldowns(state);
  advanceBuilderSpawnerCooldowns(state);
  followUp = getBuilderSpawnerActivation(state, placed.building);
  assert.equal(followUp.ok, true);
  assert.equal(followUp.status, 'ready');
});
