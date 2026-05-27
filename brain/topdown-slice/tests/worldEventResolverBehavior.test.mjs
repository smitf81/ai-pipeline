import test from 'node:test';
import assert from 'node:assert/strict';

import { createDefensibilityIntent, evaluateIntentPressure } from '../src/ai/intents.js';
import { inspectIntentResolution } from '../src/ai/resolver.js';
import { createEntityStore } from '../src/entities/entityStore.js';
import { createField, recomputeFieldsFromWorld } from '../src/world/fields.js';
import {
  applyWorldEventsToFields,
  buildWorldEventPressureFields,
  createWorldEventsState,
  triggerWorldEvent
} from '../src/world/worldEvents.js';

function createWorld() {
  const tiles = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => 'grass'));
  return {
    map: { width: 8, height: 8, tiles },
    store: createEntityStore(),
    emergence: { worldEvents: createWorldEventsState() }
  };
}

function resolveTopTarget(world, intents) {
  const fields = recomputeFieldsFromWorld(world);
  applyWorldEventsToFields(fields, world.emergence.worldEvents);

  const pressureFields = {
    defensibility: evaluateIntentPressure(intents[0], fields),
    flow: createField(fields.cover.width, fields.cover.height, 0),
    threat: createField(fields.cover.width, fields.cover.height, 0)
  };

  const eventPressures = buildWorldEventPressureFields(fields, world.emergence.worldEvents);
  for (let y = 0; y < fields.cover.height; y += 1) {
    for (let x = 0; x < fields.cover.width; x += 1) {
      pressureFields.defensibility.values[y][x] = Math.max(0, Math.min(1, pressureFields.defensibility.values[y][x] + (eventPressures.defensibility.values[y][x] ?? 0)));
      pressureFields.flow.values[y][x] = Math.max(0, Math.min(1, eventPressures.flow.values[y][x] ?? 0));
      pressureFields.threat.values[y][x] = Math.max(0, Math.min(1, eventPressures.threat.values[y][x] ?? 0));
    }
  }

  const inspection = inspectIntentResolution({
    world,
    fields,
    intents,
    pressureFields,
    maxCandidates: 1
  });

  return inspection.candidates[0]?.target ?? null;
}

test('panic event changes resolver top-ranked tile when centered on current favorite', () => {
  const world = createWorld();
  const intents = [createDefensibilityIntent({ id: 'anchor', x: 2, y: 2, radius: 4, weight: 1 })];

  const baselineTop = resolveTopTarget(world, intents);
  assert.ok(baselineTop);

  triggerWorldEvent(world.emergence.worldEvents, {
    type: 'panic',
    x: baselineTop.x,
    y: baselineTop.y,
    radius: 3,
    durationFrames: 180
  });

  const withPanicTop = resolveTopTarget(world, intents);
  assert.ok(withPanicTop);
  assert.notDeepEqual(withPanicTop, baselineTop);
});
