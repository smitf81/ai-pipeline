import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildResolverDecisionSnapshot,
  getResolverPresentationEntries,
  toResolverPresentationEntry
} from '../src/debug/resolverPresentation.js';
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

test('resolver presentation snapshot marks winner and guarded near-winners distinctly', () => {
  const baseline = buildInspection();
  const topFirst = baseline.topRanked[0].target;
  const topSecond = baseline.topRanked[1].target;

  const guarded = buildInspection({
    isAlreadyQueued: (candidate) => tileKey(candidate.target) === tileKey(topFirst),
    getCooldownRemaining: (x, y) => (x === topSecond.x && y === topSecond.y ? 2 : 0)
  });

  const winnerCandidate = guarded.candidates.find((candidate) =>
    tileKey(candidate.target) !== tileKey(topFirst)
    && tileKey(candidate.target) !== tileKey(topSecond)
  );

  assert.ok(winnerCandidate, 'expected an eligible third candidate');

  const snapshot = buildResolverDecisionSnapshot({
    cycle: 7,
    frame: 168,
    topRanked: guarded.topRanked,
    winnerCandidate
  });

  assert.equal(snapshot.cycle, 7);
  assert.equal(tileKey(snapshot.winnerTile), tileKey(winnerCandidate.target));

  const firstEntry = snapshot.entries.find((entry) => tileKey(entry.target) === tileKey(topFirst));
  const secondEntry = snapshot.entries.find((entry) => tileKey(entry.target) === tileKey(topSecond));
  const winnerEntry = snapshot.entries.find((entry) => tileKey(entry.target) === tileKey(winnerCandidate.target));

  assert.equal(firstEntry.presentationStatus, 'rejected');
  assert.equal(firstEntry.rejectionCategory, 'already-queued');
  assert.equal(secondEntry.presentationStatus, 'rejected');
  assert.equal(secondEntry.rejectionCategory, 'cooldown');
  assert.equal(winnerEntry.presentationStatus, 'accepted');
  assert.equal(winnerEntry.isCycleWinner, true);
});

test('resolver presentation fallback keeps the live leader visible and exposes tie badges', () => {
  const inspection = buildTieInspection();
  const liveEntries = getResolverPresentationEntries(null, inspection.topRanked);
  const liveLeader = toResolverPresentationEntry(inspection.topRanked[0]);

  assert.equal(liveEntries[0].presentationStatus, 'accepted');
  assert.equal(liveLeader.isCycleWinner, false);
  assert.ok(liveEntries.some((entry) => entry.badges.includes('tie')));
});
