import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveIntentChanges, RESOLVER_WEIGHTS } from '../src/ai/resolver.js';
import { createDefensibilityIntent, evaluateIntentPressure } from '../src/ai/intents.js';
import { createEntityStore } from '../src/entities/entityStore.js';
import { recomputeFieldsFromWorld } from '../src/world/fields.js';

function createWorldFromTiles(tiles) {
  const map = {
    width: tiles[0].length,
    height: tiles.length,
    tiles
  };
  const store = createEntityStore();
  store.agent.x = 0;
  store.agent.y = 0;

  return {
    map,
    store,
    emergence: {}
  };
}

function buildResolverInputs(world, intent) {
  const fields = recomputeFieldsFromWorld(world);
  const intents = [intent];
  const pressureFields = {
    defensibility: evaluateIntentPressure(intent, fields)
  };

  return { fields, intents, pressureFields };
}

test('rejects paint candidates that would choke local traversal below the threshold', () => {
  const world = createWorldFromTiles([
    ['grass', 'grass', 'grass', 'grass', 'grass'],
    ['grass', 'grass', 'water', 'grass', 'grass'],
    ['grass', 'water', 'grass', 'water', 'grass'],
    ['grass', 'grass', 'water', 'grass', 'grass'],
    ['grass', 'grass', 'grass', 'grass', 'grass']
  ]);
  const intent = createDefensibilityIntent({ id: 'def-center', x: 2, y: 2, radius: 3, weight: 1 });
  const { fields, intents, pressureFields } = buildResolverInputs(world, intent);

  const candidates = resolveIntentChanges({
    world,
    fields,
    intents,
    pressureFields,
    maxCandidates: 4
  });

  assert.equal(candidates.some((candidate) => candidate.target.x === 2 && candidate.target.y === 2), false);
  assert.ok(Array.isArray(candidates.rejectedEntries));

  const rejection = candidates.rejectedEntries.find((entry) => entry.target.x === 2 && entry.target.y === 2);
  assert.ok(rejection);
  assert.equal(rejection.reason, 'rejected: traversal threshold');
  assert.equal(rejection.rejectionReason, 'traversal threshold');
  assert.ok(rejection.scoreBreakdown.projectedLocalTraversal < rejection.scoreBreakdown.traversalThreshold);
});

test('treats traversal scoring as projected local cost rather than a raw delta', () => {
  const world = createWorldFromTiles([
    ['grass', 'grass', 'grass', 'grass', 'grass'],
    ['grass', 'grass', 'grass', 'grass', 'grass'],
    ['grass', 'grass', 'grass', 'grass', 'grass'],
    ['grass', 'grass', 'grass', 'grass', 'grass'],
    ['grass', 'grass', 'grass', 'grass', 'grass']
  ]);
  const intent = createDefensibilityIntent({ id: 'def-center', x: 2, y: 2, radius: 3, weight: 1 });
  const { fields, intents, pressureFields } = buildResolverInputs(world, intent);

  const candidates = resolveIntentChanges({
    world,
    fields,
    intents,
    pressureFields,
    maxCandidates: 4
  });

  const topCandidate = candidates[0];
  assert.ok(topCandidate);
  assert.equal(topCandidate.scoreBreakdown.projectedLocalTraversal > topCandidate.scoreBreakdown.traversalThreshold, true);
  assert.equal(
    topCandidate.scoreBreakdown.traversalCost,
    1 - topCandidate.scoreBreakdown.projectedLocalTraversal
  );
  assert.ok(
    Math.abs(
      topCandidate.scoreBreakdown.baseTraversalCostPenalty
        - (RESOLVER_WEIGHTS.traversalCostPenalty * topCandidate.scoreBreakdown.traversalCost)
    ) < 1e-9
  );
});
