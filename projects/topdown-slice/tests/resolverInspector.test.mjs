import test from 'node:test';
import assert from 'node:assert/strict';

import { inspectIntentResolution } from '../src/ai/resolver.js';
import { createDefensibilityIntent, createFlowIntent, evaluateIntentPressure } from '../src/ai/intents.js';
import { createEntityStore } from '../src/entities/entityStore.js';
import { createField, recomputeFieldsFromWorld } from '../src/world/fields.js';
import { createTilemap } from '../src/world/tilemap.js';

function buildWorld() {
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

function buildInspection(options = {}) {
  const world = buildWorld();
  const intents = [
    createDefensibilityIntent({
      id: 'demo-defensibility',
      x: 17,
      y: 8,
      radius: 4,
      weight: 1
    }),
    createFlowIntent({
      id: 'demo-flow',
      x: 18,
      y: 8,
      radius: 3,
      weight: 1.2
    })
  ];
  const fields = recomputeFieldsFromWorld(world);
  const pressureFields = Object.fromEntries(intents.map((intent) => [intent.type, evaluateIntentPressure(intent, fields)]));

  return inspectIntentResolution({
    world,
    fields,
    intents,
    pressureFields,
    maxCandidates: 3,
    ...options
  });
}

function buildTieInspection() {
  const world = buildWorld();
  world.map.tiles = world.map.tiles.map((row) => row.map(() => 'grass'));

  const intents = [
    createDefensibilityIntent({
      id: 'tie-defensibility',
      x: 12,
      y: 9,
      radius: 4,
      weight: 1
    })
  ];
  const fields = recomputeFieldsFromWorld(world);
  const pressureFields = Object.fromEntries(intents.map((intent) => [intent.type, evaluateIntentPressure(intent, fields)]));

  return inspectIntentResolution({
    world,
    fields,
    intents,
    pressureFields,
    maxCandidates: 3
  });
}

function tileKey(tile) {
  return `${tile.x},${tile.y}`;
}

test('resolver inspector keeps top-three ranking deterministic and exposes tie metadata', () => {
  const inspection = buildTieInspection();

  assert.equal(inspection.candidates.length, 3);
  assert.equal(inspection.topRanked.length, 3);
  assert.ok(
    inspection.topRanked.some((entry) =>
      entry.tieGroupSize > 1
      && /locality distance/.test(entry.tieBreakReason ?? '')
    )
  );
});

test('resolver inspector records explicit rejection reasons for locality and traversal stops', () => {
  const inspection = buildInspection();

  assert.equal(inspection.tileDiagnostics['0,0'].rejectionCategory, 'locality');

  const waterEntry = Object.values(inspection.tileDiagnostics).find((entry) =>
    entry.tileType === 'water'
    && entry.gradient > 0
  );

  assert.ok(waterEntry, 'expected a water tile inside the active locality');
  assert.equal(waterEntry.rejectionCategory, 'traversal-stop');
});

test('resolver inspector reports already-queued and cooldown guard rejections without changing ranking order', () => {
  const baseline = buildInspection();
  const topFirst = baseline.topRanked[0].target;
  const topSecond = baseline.topRanked[1].target;

  const guarded = buildInspection({
    isAlreadyQueued: (candidate) => tileKey(candidate.target) === tileKey(topFirst),
    getCooldownRemaining: (x, y) => (x === topSecond.x && y === topSecond.y ? 2 : 0)
  });

  assert.equal(guarded.topRanked[0].target.x, topFirst.x);
  assert.equal(guarded.topRanked[0].target.y, topFirst.y);
  assert.equal(guarded.tileDiagnostics[tileKey(topFirst)].rejectionCategory, 'already-queued');
  assert.equal(guarded.tileDiagnostics[tileKey(topSecond)].rejectionCategory, 'cooldown');
});
