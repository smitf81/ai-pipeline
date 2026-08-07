import assert from 'node:assert/strict';
import {
  createDefaultBsbV2AuthoringDocument,
  validateBsbV2AuthoringDocument
} from '../public/bsb-v2-map-authoring.js';
import {
  BSB_V2_UNDERGROWTH_BRUSH_CONFIG_CONTRACT,
  BSB_V2_UNDERGROWTH_BRUSH_PREVIEW_CONTRACT,
  BSB_V2_UNDERGROWTH_BRUSH_RECEIPT_CONTRACT,
  applyBsbV2UndergrowthBrushPreview,
  createBsbV2UndergrowthBrushPreview,
  normalizeBsbV2UndergrowthBrushConfig,
  undoBsbV2UndergrowthBrush
} from '../public/bsb-v2-undergrowth-brush.js';

const source = createDefaultBsbV2AuthoringDocument();
source.sceneObjects = [{ id: 'boulder:blocker', type: 'boulder', x: 20, y: 15 }];
source.unitPlacements = [];
source.unitSpawners = [];
source.tiles = source.tiles.map((row, y) => row.map((tile, x) => (x > 0 && y > 0 && x < source.width - 1 && y < source.height - 1 ? 'grass' : tile)));
const document = validateBsbV2AuthoringDocument(source);
const config = normalizeBsbV2UndergrowthBrushConfig({
  radiusTiles: 2,
  falloff: 0,
  density: 1,
  seed: 77123,
  speciesMix: { wood_fern: 5, forest_shrub: 3, ember_bramble: 2 }
});
assert.equal(config.contract, BSB_V2_UNDERGROWTH_BRUSH_CONFIG_CONTRACT);
assert.equal(config.speciesMix.wood_fern + config.speciesMix.forest_shrub + config.speciesMix.ember_bramble, 1);

const centers = [{ x: 19, y: 15 }, { x: 20, y: 15 }, { x: 20, y: 15 }];
const preview = createBsbV2UndergrowthBrushPreview(document, centers, config);
const repeatedPreview = createBsbV2UndergrowthBrushPreview(document, centers, config);
assert.equal(preview.contract, BSB_V2_UNDERGROWTH_BRUSH_PREVIEW_CONTRACT);
assert.deepEqual(repeatedPreview, preview, 'the same map revision, stroke, and seed must produce the same visible candidates');
assert.ok(preview.diagnostics.deduplicated > 0, 'overlapping drag centers should deduplicate sampled tiles');
assert.ok(preview.blocked.some((entry) => entry.x === 20 && entry.y === 15 && entry.reason.startsWith('sceneObject:')), 'authored occupancy should be visibly rejected');
assert.ok(preview.candidates.every((entry) => !(entry.x === 20 && entry.y === 15)));
assert.ok(new Set(preview.candidates.map((entry) => `${entry.x},${entry.y}`)).size === preview.candidates.length, 'a drag stroke should never produce duplicate placements');
assert.ok(new Set(preview.candidates.map((entry) => entry.species)).size >= 2, 'a weighted mix should produce more than one recipe across a sufficiently large stroke');

const committed = applyBsbV2UndergrowthBrushPreview(document, preview);
assert.equal(committed.contract, BSB_V2_UNDERGROWTH_BRUSH_RECEIPT_CONTRACT);
assert.equal(committed.operation, 'paint');
assert.equal(committed.document.revision, document.revision + 1, 'the entire drag stroke must be one canonical revision');
assert.equal(committed.createdCount, preview.candidates.length, 'commit must consume the exact visible preview batch');
const createdRecords = committed.document.sceneObjects.filter((entry) => committed.createdIds.includes(entry.id));
assert.deepEqual(
  createdRecords.map((entry) => ({ id: entry.id, x: entry.x, y: entry.y, type: entry.type, species: entry.undergrowth.species, seed: entry.undergrowth.seed })),
  preview.candidates,
  'preview and commit must agree tile-for-tile, recipe-for-recipe, and seed-for-seed'
);
assert.ok(createdRecords.every((entry) => !('geometry' in entry) && !('vertices' in entry) && !('mesh' in entry)), 'the brush should persist intent DNA, never geometry');
assert.doesNotThrow(() => validateBsbV2AuthoringDocument(committed.document));

assert.throws(
  () => applyBsbV2UndergrowthBrushPreview({ ...document, revision: document.revision + 1 }, preview),
  /bsb_undergrowth_brush_preview_stale/,
  'a preview from a different canonical revision must never commit'
);
assert.throws(
  () => applyBsbV2UndergrowthBrushPreview(document, {
    ...preview,
    candidates: [{ ...preview.candidates[0], type: 'boulder' }]
  }),
  /bsb_undergrowth_brush_candidate_type_invalid/,
  'the public batch boundary must reject a forged candidate that bypasses its species recipe'
);

const undone = undoBsbV2UndergrowthBrush(committed.document, committed);
assert.equal(undone.operation, 'undo');
assert.equal(undone.document.revision, committed.document.revision + 1, 'undo should be one explicit canonical revision');
assert.equal(undone.removedCount, committed.createdCount);
assert.deepEqual(undone.document.sceneObjects, document.sceneObjects, 'one undo receipt should remove exactly the committed batch');
assert.throws(
  () => undoBsbV2UndergrowthBrush({ ...committed.document, revision: committed.document.revision + 1 }, committed),
  /bsb_undergrowth_brush_undo_stale/,
  'one-step undo must refuse to rewrite a newer authoring revision'
);

const sparse = createBsbV2UndergrowthBrushPreview(document, [{ x: 10, y: 10 }], {
  ...config,
  density: 0.1,
  falloff: 1,
  speciesMix: { wood_fern: 1, forest_shrub: 0, ember_bramble: 0 }
});
assert.ok(sparse.candidates.length < preview.candidates.length, 'density and falloff controls should materially change the generated batch');
assert.ok(sparse.candidates.every((entry) => entry.species === 'wood_fern'));

const smoulderingFernPreview = createBsbV2UndergrowthBrushPreview(document, [{ x: 10, y: 10 }], {
  ...config,
  radiusTiles: 1,
  woodFernType: 'smouldering_fern',
  speciesMix: { wood_fern: 1, forest_shrub: 0, ember_bramble: 0 }
});
assert.ok(smoulderingFernPreview.candidates.every((entry) => entry.type === 'smouldering_fern'), 'the smouldering fern palette variant should retain its emitter-owning authored type');

console.log('bsb-v2-undergrowth-brush.test.mjs: ok');
