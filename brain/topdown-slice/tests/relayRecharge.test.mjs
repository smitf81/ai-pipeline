import test from 'node:test';
import assert from 'node:assert/strict';

import { BUILDING_STATE, placeBuilding } from '../src/buildings/buildings.js';
import { createEntityStore } from '../src/entities/entityStore.js';
import { createTask, enqueueActorTask, tickAllActors } from '../src/ai/agentStub.js';
import { RELAY_RECHARGE_FRAMES } from '../src/units/energy.js';
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
      reinforcement: createField(map.width, map.height, 0)
    }
  };
}

function tickFrames(state, frames) {
  for (let step = 0; step < frames; step += 1) {
    tickAllActors(state, () => {});
  }
}

test('workers do not passively regenerate energy away from relays', () => {
  const state = createTestState();
  const spawn = spawnUnit(state.store, state.map, { type: 'worker', x: 5, y: 5 });
  assert.equal(spawn.ok, true);

  spawn.unit.energy = 8;
  tickFrames(state, RELAY_RECHARGE_FRAMES + 4);

  assert.equal(spawn.unit.energy, 8);
  assert.equal(spawn.unit.state, 'idle');
});

test('idle workers recharge only when on or adjacent to a complete relay', () => {
  const state = createTestState();
  const relay = placeBuilding(state.store, state.map, {
    type: 'relay',
    x: 6,
    y: 5,
    state: BUILDING_STATE.COMPLETE,
    buildProgress: 5,
    buildRequired: 5
  });
  const spawn = spawnUnit(state.store, state.map, { type: 'worker', x: 5, y: 5 });

  assert.equal(relay.ok, true);
  assert.equal(spawn.ok, true);

  spawn.unit.energy = 10;
  tickFrames(state, RELAY_RECHARGE_FRAMES + 1);

  assert.equal(spawn.unit.energy, 11);
  assert.equal(spawn.unit.state, 'recharging');
  assert.equal(spawn.unit.rechargeBuildingId, relay.building.id);
});

test('blocked workers can recover at a relay and then resume their task', () => {
  const state = createTestState();
  const relay = placeBuilding(state.store, state.map, {
    type: 'relay',
    x: 6,
    y: 5,
    state: BUILDING_STATE.COMPLETE,
    buildProgress: 5,
    buildRequired: 5
  });
  const spawn = spawnUnit(state.store, state.map, { type: 'worker', x: 5, y: 5 });

  assert.equal(relay.ok, true);
  assert.equal(spawn.ok, true);

  spawn.unit.energy = 0;
  const task = createTask(state.store, {
    type: 'paintTile',
    target: { x: 5, y: 5 },
    payload: { tileType: 'stone' },
    assignedActorId: spawn.unit.id,
    issuedByActorId: state.store.agent.id
  });
  enqueueActorTask(spawn.unit, task);

  tickFrames(state, 1);
  assert.equal(spawn.unit.state, 'exhausted');
  assert.equal(spawn.unit.currentTask?.status, 'blocked');

  tickFrames(state, RELAY_RECHARGE_FRAMES + 2);

  assert.equal(state.map.tiles[5][5], 'stone');
  assert.equal(spawn.unit.currentTask, null);
  assert.equal(spawn.unit.taskHistory.length, 1);
});
