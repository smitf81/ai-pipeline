import assert from 'node:assert/strict';
import {
  derivePathCorridorStrokeCenters,
  evaluateLevelDesignSession,
  isLevelDesignGoal,
  normalizeLevelDesignPlan
} from '../public/level-design-session.js';
import {
  applyBsbV2AgentSessionUndo,
  createDefaultBsbV2AuthoringDocument,
  validateBsbV2AuthoringDocument
} from '../public/bsb-v2-map-authoring.js';
import { applyBsbV2SceneBrushPreview, createBsbV2SceneBrushPreview } from '../public/bsb-v2-scene-brush.js';
import { applyBsbV2UndergrowthBrushPreview, createBsbV2UndergrowthBrushPreview } from '../public/bsb-v2-undergrowth-brush.js';

assert.equal(isLevelDesignGoal('build out a forest biome around the path through the Ash Road Threshold map'), true);
assert.equal(isLevelDesignGoal('can you create a 10 minute path through a forest biome scene in the current map please (ash road)'), true);
assert.equal(isLevelDesignGoal('place a tree at 4 7'), false);

const plan = normalizeLevelDesignPlan({
  summary: 'Frame the path with irregular pine groups.',
  rationale: 'The alternating gaps preserve sightlines while establishing a forest threshold.',
  family: 'tree',
  bandMin: 4,
  bandMax: 8,
  radiusTiles: 1,
  density: .6,
  falloff: .4,
  variant: 'old_pine'
}, 'tree');
assert.equal(plan.variant, 'old_pine');
assert.throws(() => normalizeLevelDesignPlan({ ...plan, family: 'geology' }, 'tree'), /family_invalid/);

const source = createDefaultBsbV2AuthoringDocument();
source.revision = 90;
source.sceneObjects = [];
source.unitPlacements = [];
source.unitSpawners = [];
source.tiles = source.tiles.map((row, y) => row.map((_tile, x) => (x === 12 ? 'dirt' : 'grass')));
const document = validateBsbV2AuthoringDocument(source);
const centers = derivePathCorridorStrokeCenters(document, plan, { seed: 'session_test' });
assert.ok(centers.length >= 2);
assert.ok(centers.every(point => Math.abs(point.x - 12) >= plan.bandMin + plan.radiusTiles));

const treePreview = createBsbV2SceneBrushPreview(document, centers.slice(0, 2), {
  family: 'tree', radiusTiles: 1, falloff: 0, density: 1, seed: 501, treeType: 'tree', treeSpecies: 'old_pine'
});
const trees = applyBsbV2SceneBrushPreview(document, treePreview);
const growthPreview = createBsbV2UndergrowthBrushPreview(trees.document, [{ x: 5, y: 5 }], {
  radiusTiles: 1, falloff: 0, density: 1, seed: 502,
  speciesMix: { wood_fern: 1, forest_shrub: 0, ember_bramble: 0 }
});
const growth = applyBsbV2UndergrowthBrushPreview(trees.document, growthPreview);
const undone = applyBsbV2AgentSessionUndo(growth.document, 'level_test_session', [trees, growth]);
assert.equal(undone.operation, 'undo_session');
assert.equal(undone.removedCount, trees.createdCount + growth.createdCount);
assert.deepEqual(undone.document.sceneObjects, document.sceneObjects);
assert.equal(undone.afterRevision, growth.document.revision + 1);

const session = {
  successCriteria: { minimumCreated: 3, minimumPathClearanceTiles: 1.5 },
  batches: [
    { family: 'tree', receipt: { createdIds: ['tree:one'], createdCount: 1 } },
    { family: 'undergrowth', receipt: { createdIds: ['growth:one'], createdCount: 1 } },
    { family: 'geology', receipt: { createdIds: ['rock:one'], createdCount: 1 } }
  ]
};
const evaluatedDocument = {
  ...document,
  revision: 93,
  sceneObjects: [
    { id: 'tree:one', x: 4, y: 4, tree: {} },
    { id: 'growth:one', x: 4, y: 9, undergrowth: {} },
    { id: 'rock:one', x: 4, y: 14, geology: {} }
  ]
};
const evaluation = evaluateLevelDesignSession(session, evaluatedDocument);
assert.equal(evaluation.integrityGate.pass, true);
assert.equal(evaluation.designGate.pass, false);
assert.equal(evaluation.criteriaMet, false);
assert.equal(evaluation.nextAction.kind, 'route_revision_required');
assert.deepEqual(evaluation.metrics.familyCoverage.sort(), ['geology', 'tree', 'undergrowth']);

console.log('level-design-session-client.test.mjs: ok');
