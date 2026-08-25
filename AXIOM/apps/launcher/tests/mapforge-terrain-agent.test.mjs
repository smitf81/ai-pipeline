import assert from 'node:assert/strict';
import {
  BSB_V2_TERRAIN_AGENT_CONTEXT_CONTRACT,
  BSB_V2_TERRAIN_PATCH_PREVIEW_CONTRACT,
  BSB_V2_TERRAIN_PATCH_RECEIPT_CONTRACT,
  applyBsbV2TerrainPatchPreview,
  createBsbV2TerrainPatchPreview,
  createDefaultBsbV2AuthoringDocument,
  describeBsbV2TerrainForAgent,
  undoBsbV2TerrainPatch,
  validateBsbV2AuthoringDocument
} from '../public/bsb-v2-map-authoring.js';

const source = structuredClone(createDefaultBsbV2AuthoringDocument());
for (let y = 0; y < source.height; y += 1) {
  for (let x = 0; x < source.width; x += 1) {
    source.tiles[y][x] = x === 0 || y === 0 || x === source.width - 1 || y === source.height - 1 ? 'rock' : 'grass';
  }
}
const inner = { minX: 10, minY: 8, maxX: 22, maxY: 18 };
for (let x = inner.minX; x <= inner.maxX; x += 1) {
  source.tiles[inner.minY][x] = 'rock';
  source.tiles[inner.maxY][x] = 'rock';
}
for (let y = inner.minY; y <= inner.maxY; y += 1) {
  source.tiles[y][inner.minX] = 'rock';
  source.tiles[y][inner.maxX] = 'rock';
}
const fixture = validateBsbV2AuthoringDocument(source);
const context = describeBsbV2TerrainForAgent(fixture);
assert.equal(context.contract, BSB_V2_TERRAIN_AGENT_CONTEXT_CONTRACT);
assert.equal(context.mapId, fixture.mapId);
assert.equal(context.revision, fixture.revision);
const oldBoundary = context.rockComponents.find(component => component.likelyEnclosure && !component.touchesMapEdge);
assert.ok(oldBoundary, 'the agent context should identify the disconnected inner enclosure from live tiles');
assert.equal(oldBoundary.suggestedReplacementTerrain, 'grass');

const preview = createBsbV2TerrainPatchPreview(fixture, {
  expectedRevision: fixture.revision,
  label: 'Replace obsolete enclosure and trace expanded playable boundary',
  operations: [
    { op: 'relocate_enclosure', componentId: oldBoundary.id, regionId: 'map_interior', replacementTerrain: 'adjacent_dominant', thickness: 1 }
  ]
});
assert.equal(preview.contract, BSB_V2_TERRAIN_PATCH_PREVIEW_CONTRACT);
assert.equal(preview.classification, 'projection');
assert.equal(preview.sourceRevision, fixture.revision);
assert.ok(preview.candidateCount > oldBoundary.tileCount, 'the patch should both remove the old ring and author a larger one');
assert.equal(fixture.tiles[inner.minY][inner.minX], 'rock', 'preview must not mutate its source');

const applied = applyBsbV2TerrainPatchPreview(fixture, preview);
assert.equal(applied.receipt.contract, BSB_V2_TERRAIN_PATCH_RECEIPT_CONTRACT);
assert.equal(applied.receipt.afterRevision, fixture.revision + 1);
assert.equal(applied.receipt.verification.ok, true);
assert.equal(applied.document.tiles[inner.minY][inner.minX], 'grass', 'the obsolete inner rock ring should be replaced');
assert.equal(applied.document.tiles[1][1], 'rock', 'the full map interior should receive the new rock outline');

assert.throws(
  () => applyBsbV2TerrainPatchPreview({ ...applied.document, revision: applied.document.revision + 1 }, preview),
  /bsb_terrain_patch_revision_stale/,
  'a stale preview must never apply to a later revision'
);

const undone = undoBsbV2TerrainPatch(applied.document, applied.receipt);
assert.equal(undone.receipt.verification.ok, true);
assert.deepEqual(undone.document.tiles, fixture.tiles, 'undo should restore every exact before tile from the receipt');

console.log('Map Forge terrain agent contract tests passed.');
