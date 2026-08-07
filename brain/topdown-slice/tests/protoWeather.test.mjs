import test from 'node:test';
import assert from 'node:assert/strict';

import { createEntityStore } from '../src/entities/entityStore.js';
import { createField, createProtoWeatherState, getFieldValue, recomputeFieldsFromWorld, summarizeProtoWeather, tickProtoWeather } from '../src/world/fields.js';
import { createTilemap } from '../src/world/tilemap.js';
import { spawnUnit } from '../src/units/units.js';
import { CONFLICT_FACTIONS, CONFLICT_UNIT_TYPE, createConflictUnitState } from '../src/units/conflict.js';

function createWeatherTestState() {
  const map = createTilemap();
  const store = createEntityStore();
  store.agent.x = 8;
  store.agent.y = 6;

  return {
    map,
    store,
    emergence: {
      frame: 0,
      reinforcement: createField(map.width, map.height, 0),
      weather: createProtoWeatherState(map.width, map.height)
    },
    conflict: {
      recentAttacks: []
    }
  };
}

test('proto-weather forms clouds where heat and moisture overlap', () => {
  const state = createWeatherTestState();

  for (let tick = 0; tick < 16; tick += 1) {
    tickProtoWeather(state);
    state.emergence.frame += 1;
  }

  const weather = summarizeProtoWeather(state);
  assert.ok(weather.cloudTiles > 0);
  assert.ok(weather.condensationTiles > 0);
  assert.ok((weather.wettestTile?.value ?? 0) > 0);
  assert.ok((weather.hottestTile?.value ?? 0) > 0);
  assert.ok((weather.cloudiestTile?.value ?? 0) > 0);
  assert.ok((getFieldValue(state.emergence.weather.moisture, 9, 6) ?? 0) > 0);
});

test('recent attacks inject a stronger localized heat burst into the weather field', () => {
  const state = createWeatherTestState();
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

  state.conflict.recentAttacks = [{
    frame: 0,
    attackerId: red.unit.id,
    targetId: blue.unit.id
  }];

  tickProtoWeather(state);

  const attackerHeat = getFieldValue(state.emergence.weather.heat, red.unit.x, red.unit.y) ?? 0;
  const targetHeat = getFieldValue(state.emergence.weather.heat, blue.unit.x, blue.unit.y) ?? 0;

  assert.ok(attackerHeat >= 0.09);
  assert.ok(targetHeat >= 0.06);
});

test('recomputed world fields expose heat, moisture, condensation, and clouds for overlays', () => {
  const state = createWeatherTestState();

  for (let tick = 0; tick < 8; tick += 1) {
    tickProtoWeather(state);
    state.emergence.frame += 1;
  }

  const fields = recomputeFieldsFromWorld(state);

  assert.equal(fields.heat, state.emergence.weather.heat);
  assert.equal(fields.moisture, state.emergence.weather.moisture);
  assert.equal(fields.condensation, state.emergence.weather.condensation);
  assert.equal(fields.clouds, state.emergence.weather.clouds);
});
