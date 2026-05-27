import test from 'node:test';
import assert from 'node:assert/strict';

import { recomputeFieldsFromWorld, getFieldValue } from '../src/world/fields.js';
import {
  applyWorldEventsToFields,
  buildWorldEventPressureFields,
  createWorldEventsState,
  tickWorldEvents,
  triggerWorldEvent
} from '../src/world/worldEvents.js';
import { createEntityStore } from '../src/entities/entityStore.js';

function createWorld(width = 8, height = 8) {
  return {
    map: {
      width,
      height,
      tiles: Array.from({ length: height }, () => Array.from({ length: width }, () => 'grass'))
    },
    store: createEntityStore(),
    emergence: {
      worldEvents: createWorldEventsState()
    }
  };
}

test('world events decay and expire deterministically', () => {
  const state = createWorldEventsState();
  const event = triggerWorldEvent(state, { type: 'panic', x: 3, y: 4, durationFrames: 3 });

  assert.equal(event.remainingFrames, 3);
  tickWorldEvents(state);
  assert.equal(state.active[0].remainingFrames, 2);
  tickWorldEvents(state);
  tickWorldEvents(state);
  assert.equal(state.active.length, 0);
});

test('breach changes fields and emits pressure near its center', () => {
  const world = createWorld();
  triggerWorldEvent(world.emergence.worldEvents, { type: 'breach', x: 4, y: 4, durationFrames: 120 });

  const fields = recomputeFieldsFromWorld(world);
  applyWorldEventsToFields(fields, world.emergence.worldEvents);
  const eventPressure = buildWorldEventPressureFields(fields, world.emergence.worldEvents);

  const centerTraversal = getFieldValue(fields.traversal, 4, 4);
  const centerCover = getFieldValue(fields.cover, 4, 4);
  const centerFlow = getFieldValue(eventPressure.flow, 4, 4);
  const centerDef = getFieldValue(eventPressure.defensibility, 4, 4);

  assert.ok(centerTraversal < 0.08, `expected traversal to drop from grass baseline, got ${centerTraversal}`);
  assert.ok(centerCover < 0.12, `expected cover to drop from grass baseline, got ${centerCover}`);
  assert.ok(centerFlow > 0.2, `expected breach flow pressure, got ${centerFlow}`);
  assert.ok(centerDef < 0, `expected breach to suppress defensibility pressure, got ${centerDef}`);
});
