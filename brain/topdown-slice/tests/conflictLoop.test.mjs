import test from 'node:test';
import assert from 'node:assert/strict';

import { tickAllActors } from '../src/ai/agentStub.js';
import { createConflictState, seedConflictScenario, summarizeConflictState, tickConflictLoop } from '../src/combat/conflictLoop.js';
import { createEntityStore } from '../src/entities/entityStore.js';
import { createField } from '../src/world/fields.js';
import { createTilemap } from '../src/world/tilemap.js';
import { CONFLICT_FACTIONS, CONFLICT_RULES, CONFLICT_UNIT_TYPE, createConflictUnitState } from '../src/units/conflict.js';
import { spawnUnit } from '../src/units/units.js';

function createConflictTestState() {
  const map = createTilemap();
  const store = createEntityStore();

  return {
    map,
    store,
    conflict: createConflictState(),
    emergence: {
      frame: 0,
      reinforcement: createField(map.width, map.height, 0)
    }
  };
}

test('conflict seeding creates a balanced red-vs-blue fighter setup', () => {
  const state = createConflictTestState();
  const seeded = seedConflictScenario(state.store, state.map);

  assert.equal(seeded.ok, true);
  assert.equal(seeded.spawnedUnits.length, 6);

  const summary = summarizeConflictState(state);
  assert.equal(summary.livingByFaction.red, 3);
  assert.equal(summary.livingByFaction.blue, 3);
  assert.deepEqual(summary.rules, CONFLICT_RULES);
  assert.ok(seeded.spawnedUnits.every((unit) => unit.type === CONFLICT_UNIT_TYPE));
});

test('conflict loop applies deterministic attack rules and records explainable eliminations', () => {
  const state = createConflictTestState();

  const red = spawnUnit(state.store, state.map, {
    type: CONFLICT_UNIT_TYPE,
    x: 6,
    y: 6,
    ...createConflictUnitState({ faction: CONFLICT_FACTIONS.RED })
  });
  const blue = spawnUnit(state.store, state.map, {
    type: CONFLICT_UNIT_TYPE,
    x: 7,
    y: 6,
    ...createConflictUnitState({ faction: CONFLICT_FACTIONS.BLUE })
  });

  assert.equal(red.ok, true);
  assert.equal(blue.ok, true);

  blue.unit.hp = 1;

  tickConflictLoop(state, () => {});
  assert.equal(red.unit.currentTask, null);
  assert.equal(red.unit.taskQueue[0]?.type, 'attackUnit');
  assert.equal(blue.unit.taskQueue[0]?.type, 'attackUnit');

  tickAllActors(state, () => {});
  assert.equal(blue.unit.hp, 0);

  tickConflictLoop(state, () => {});

  const summary = summarizeConflictState(state);
  assert.equal(summary.livingByFaction.red, 1);
  assert.equal(summary.livingByFaction.blue, 0);
  assert.equal(summary.casualtyCounts.blue, 1);
  assert.equal(summary.lastOutcome, CONFLICT_FACTIONS.RED);
  assert.equal(summary.recentAttacks.length, 1);
  assert.equal(summary.recentAttacks[0].rules.damage, CONFLICT_RULES.damage);
  assert.match(summary.recentAttacks[0].explanation, /deterministic combat uses range 1, damage 1, cooldown 10, health 6/i);
  assert.equal(summary.units[0].combat.attacksResolved, 1);
  assert.equal(summary.units[0].combat.kills, 1);
  assert.equal(summary.recentEliminations.length, 1);
  assert.match(summary.recentEliminations[0].explanation, /deterministic combat applies 1 damage per landed hit at range 1 with 10-frame cooldown/i);
});

test('cooldown blocks repeat damage until enough frames pass', () => {
  const state = createConflictTestState();

  const red = spawnUnit(state.store, state.map, {
    type: CONFLICT_UNIT_TYPE,
    x: 6,
    y: 6,
    ...createConflictUnitState({ faction: CONFLICT_FACTIONS.RED })
  });
  const blue = spawnUnit(state.store, state.map, {
    type: CONFLICT_UNIT_TYPE,
    x: 7,
    y: 6,
    ...createConflictUnitState({ faction: CONFLICT_FACTIONS.BLUE })
  });

  assert.equal(red.ok, true);
  assert.equal(blue.ok, true);

  tickConflictLoop(state, () => {});
  tickAllActors(state, () => {});
  assert.equal(blue.unit.hp, blue.unit.maxHp - CONFLICT_RULES.damage);

  tickAllActors(state, () => {});
  assert.equal(blue.unit.hp, blue.unit.maxHp - CONFLICT_RULES.damage);
});
