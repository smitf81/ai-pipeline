import test from 'node:test';
import assert from 'node:assert/strict';

import { createDefensibilityIntent, evaluateIntentPressure } from '../src/ai/intents.js';
import { inspectIntentResolution } from '../src/ai/resolver.js';
import { createEntityStore } from '../src/entities/entityStore.js';
import { createField, recomputeFieldsFromWorld } from '../src/world/fields.js';
import {
  applyDirectorPhaseToFields,
  buildDirectorPressureFields,
  createDirectorState,
  triggerDirectorPhase
} from '../src/world/directorPhases.js';

function createWorld() {
  const map = {
    width: 10,
    height: 10,
    tiles: Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 'grass'))
  };
  const store = createEntityStore();
  store.buildings.push({ id: 'relay-east', type: 'relay', x: 8, y: 8, state: 'complete' });
  return {
    map,
    store,
    emergence: {
      frame: 0,
      director: createDirectorState(map.width, map.height)
    }
  };
}

function topTarget(world, intent) {
  const fields = recomputeFieldsFromWorld(world);
  applyDirectorPhaseToFields(fields, world, world.emergence.frame);

  const pressure = {
    defensibility: evaluateIntentPressure(intent, fields),
    flow: createField(fields.cover.width, fields.cover.height, 0),
    threat: createField(fields.cover.width, fields.cover.height, 0)
  };

  const directorPressure = buildDirectorPressureFields(fields, world, world.emergence.frame);
  for (let y = 0; y < fields.cover.height; y += 1) {
    for (let x = 0; x < fields.cover.width; x += 1) {
      pressure.defensibility.values[y][x] = Math.max(0, Math.min(1, pressure.defensibility.values[y][x] + (directorPressure.defensibility.values[y][x] ?? 0)));
      pressure.flow.values[y][x] = Math.max(0, Math.min(1, directorPressure.flow.values[y][x] ?? 0));
      pressure.threat.values[y][x] = Math.max(0, Math.min(1, directorPressure.threat.values[y][x] ?? 0));
    }
  }

  const inspection = inspectIntentResolution({
    world,
    fields,
    intents: [intent],
    pressureFields: pressure,
    maxCandidates: 1
  });

  return inspection.candidates[0]?.target ?? null;
}

test('collapse phase shifts resolver away from the current preferred tile', () => {
  const world = createWorld();
  const intent = createDefensibilityIntent({ id: 'def-origin', x: 2, y: 2, radius: 4, weight: 1 });

  const baseline = topTarget(world, intent);
  assert.ok(baseline);

  world.emergence.director.collapseRegion = { x: baseline.x, y: baseline.y, radius: 3 };
  triggerDirectorPhase(world.emergence.director, world.map, 'collapse');
  world.emergence.frame = 30;
  const collapsed = topTarget(world, intent);

  assert.ok(collapsed);
  assert.notDeepEqual(collapsed, baseline);
});
