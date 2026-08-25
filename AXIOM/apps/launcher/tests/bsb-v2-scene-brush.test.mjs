import assert from 'node:assert/strict';
import {
  createDefaultBsbV2AuthoringDocument,
  validateBsbV2AuthoringDocument
} from '../public/bsb-v2-map-authoring.js';
import {
  BSB_V2_SCENE_BRUSH_CONFIG_CONTRACT,
  BSB_V2_SCENE_BRUSH_PREVIEW_CONTRACT,
  BSB_V2_SCENE_BRUSH_RECEIPT_CONTRACT,
  applyBsbV2SceneBrushPreview,
  createBsbV2SceneBrushPreview,
  normalizeBsbV2SceneBrushConfig,
  undoBsbV2SceneBrush
} from '../public/bsb-v2-scene-brush.js';

const source = createDefaultBsbV2AuthoringDocument();
source.sceneObjects = [];
source.unitPlacements = [];
source.unitSpawners = [];
source.tiles = source.tiles.map((row, y) => row.map((tile, x) => (
  x > 0 && y > 0 && x < source.width - 1 && y < source.height - 1 ? 'grass' : tile
)));
const document = validateBsbV2AuthoringDocument(source);

const treeConfig = normalizeBsbV2SceneBrushConfig({
  family: 'tree',
  radiusTiles: 3,
  falloff: 0,
  density: 1,
  seed: 77123,
  treeType: 'tree',
  treeSpecies: 'ancient_oak'
});
assert.equal(treeConfig.contract, BSB_V2_SCENE_BRUSH_CONFIG_CONTRACT);
const centers = [{ x: 10, y: 10 }, { x: 12, y: 10 }, { x: 12, y: 10 }];
const treePreview = createBsbV2SceneBrushPreview(document, centers, treeConfig);
assert.equal(treePreview.contract, BSB_V2_SCENE_BRUSH_PREVIEW_CONTRACT);
assert.deepEqual(createBsbV2SceneBrushPreview(document, centers, treeConfig), treePreview, 'scene previews must be deterministic for map revision, stroke, and seed');
assert.ok(treePreview.diagnostics.deduplicated > 0);
assert.ok(treePreview.candidates.length > 4);
assert.ok(treePreview.candidates.every((entry) => entry.family === 'tree' && entry.species === 'ancient_oak'));

const committedTrees = applyBsbV2SceneBrushPreview(document, treePreview);
assert.equal(committedTrees.contract, BSB_V2_SCENE_BRUSH_RECEIPT_CONTRACT);
assert.equal(committedTrees.operation, 'paint');
assert.equal(committedTrees.document.revision, document.revision + 1, 'one tree stroke should commit in one canonical revision');
assert.equal(committedTrees.createdCount, treePreview.candidates.length);
const treeRecords = committedTrees.document.sceneObjects.filter((entry) => committedTrees.createdIds.includes(entry.id));
assert.ok(treeRecords.every((entry) => entry.tree?.species === 'ancient_oak'));
assert.ok(treeRecords.every((entry) => !('geometry' in entry) && !('mesh' in entry)), 'scene paint should persist tree intent DNA only');

assert.throws(
  () => applyBsbV2SceneBrushPreview({ ...document, revision: document.revision + 1 }, treePreview),
  /bsb_scene_brush_preview_stale/
);
assert.throws(
  () => applyBsbV2SceneBrushPreview(document, {
    ...treePreview,
    candidates: [{ ...treePreview.candidates[0], family: 'geology' }]
  }),
  /bsb_scene_brush_candidate_family_invalid/
);

const undoneTrees = undoBsbV2SceneBrush(committedTrees.document, committedTrees);
assert.equal(undoneTrees.operation, 'undo');
assert.equal(undoneTrees.document.revision, document.revision + 2);
assert.deepEqual(undoneTrees.document.sceneObjects, document.sceneObjects);

const geologyConfig = normalizeBsbV2SceneBrushConfig({
  family: 'geology',
  radiusTiles: 4,
  falloff: .25,
  density: 1,
  seed: 99173,
  geologyFormation: 'fractured_basalt'
});
const geologyPreview = createBsbV2SceneBrushPreview(document, [{ x: 24, y: 18 }], geologyConfig);
assert.ok(geologyPreview.candidates.length > 1);
assert.ok(geologyPreview.candidates.every((entry) => entry.type === 'boulder' && entry.formation === 'fractured_basalt'));
assert.ok(geologyPreview.candidates.every((entry) => entry.footprint.w === 2 && entry.footprint.h === 2));
for (let index = 0; index < geologyPreview.candidates.length; index += 1) {
  for (let other = index + 1; other < geologyPreview.candidates.length; other += 1) {
    assert.equal(overlaps(geologyPreview.candidates[index].footprint, geologyPreview.candidates[other].footprint), false, 'rock candidates must preserve 2x2 collision footprints');
  }
}
const committedGeology = applyBsbV2SceneBrushPreview(document, geologyPreview);
const geologyRecords = committedGeology.document.sceneObjects.filter((entry) => committedGeology.createdIds.includes(entry.id));
assert.ok(geologyRecords.every((entry) => entry.geology?.formation === 'fractured_basalt'));
assert.ok(geologyRecords.every((entry) => !('hull' in entry.geology) && !('cracks' in entry.geology)), 'rock paint should persist geology DNA rather than derived geometry');
assert.doesNotThrow(() => validateBsbV2AuthoringDocument(committedGeology.document));

console.log('bsb-v2-scene-brush.test.mjs: ok');

function overlaps(left, right) {
  return left.x < right.x + right.w && left.x + left.w > right.x
    && left.y < right.y + right.h && left.y + left.h > right.y;
}
