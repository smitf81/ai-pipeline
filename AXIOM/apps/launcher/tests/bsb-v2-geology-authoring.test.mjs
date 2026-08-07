import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  applyBsbV2GeologyOperation,
  buildBsbV2RuntimeMap,
  createDefaultBsbV2AuthoringDocument,
  validateBsbV2AuthoringDocument
} from '../public/bsb-v2-map-authoring.js';
import {
  BSB_V2_GEOLOGY_DNA_CONTRACT,
  BSB_V2_GEOLOGY_OPERATION_CONTRACT,
  applyBsbV2GeologyOperation as applyRecordOperation,
  createBsbV2GeologyDefinition,
  normalizeBsbV2GeologyRecord
} from '../public/bsb-v2-geology-authoring.js';

const authored = {
  seed: 48117,
  formation: 'fractured_basalt',
  scale: 1.28,
  heightMeters: 1.82,
  angularity: .88,
  strataAngleDegrees: 84,
  strataDensity: .62,
  erosion: .14,
  crackDensity: .78,
  fracture: .82,
  moss: .12,
  wetness: .34
};
const first = createBsbV2GeologyDefinition(authored, { id: 'boulder:proof', type: 'boulder', x: 8, y: 9 });
const second = createBsbV2GeologyDefinition(authored, { id: 'boulder:proof', type: 'boulder', x: 8, y: 9 });
assert.deepEqual(first, second, 'the same compact Geology DNA should normalize deterministically');
assert.equal(first.contract, BSB_V2_GEOLOGY_DNA_CONTRACT);
assert.equal(first.formation, 'fractured_basalt');

const legacy = normalizeBsbV2GeologyRecord({ id: 'legacy-boulder', type: 'boulder', x: 3, y: 4 });
assert.equal(legacy.geology.contract, BSB_V2_GEOLOGY_DNA_CONTRACT, 'legacy boulders should gain compact DNA at the authoring boundary');
assert.equal(legacy.geology.formation, 'fieldstone');
const fractured = applyRecordOperation(legacy, { op: 'fracture', amount: .25 });
assert.ok(fractured.geology.fracture > legacy.geology.fracture);
assert.ok(fractured.geology.crackDensity > legacy.geology.crackDensity);
const weathered = applyRecordOperation(fractured, { op: 'weather', amount: .2 });
assert.ok(weathered.geology.erosion > fractured.geology.erosion);
assert.ok(weathered.geology.moss > fractured.geology.moss);

const base = {
  ...createDefaultBsbV2AuthoringDocument(),
  revision: 0,
  spawn: { x: 1, y: 1 },
  sceneObjects: [],
  unitPlacements: [],
  unitSpawners: []
};
const created = applyBsbV2GeologyOperation(base, {
  op: 'create', id: 'boulder:single-proof', x: 8, y: 8, ...authored
});
assert.equal(created.contract, BSB_V2_GEOLOGY_OPERATION_CONTRACT);
assert.equal(created.afterRevision, 1);
assert.deepEqual(created.affectedIds, ['boulder:single-proof']);
assert.equal(created.document.sceneObjects[0].geology.formation, 'fractured_basalt');

const clusterRequest = {
  op: 'create_cluster', idPrefix: 'proof-cluster', x: 20, y: 15,
  count: 6, radiusTiles: 5, seed: 99531, formation: 'weathered_outcrop', scale: 1.22
};
const cluster = applyBsbV2GeologyOperation(base, clusterRequest);
const repeatedCluster = applyBsbV2GeologyOperation(base, clusterRequest);
assert.equal(cluster.afterRevision, 1, 'a semantic cluster should commit as one authoring revision');
assert.equal(cluster.createdCount, 6);
assert.equal(cluster.skippedCount, 0);
assert.deepEqual(cluster.affectedIds, repeatedCluster.affectedIds, 'cluster positions and ids should be deterministic');
assert.deepEqual(
  cluster.document.sceneObjects.map((entry) => entry.geology),
  repeatedCluster.document.sceneObjects.map((entry) => entry.geology),
  'cluster DNA should be deterministic for the same seed'
);
for (let left = 0; left < cluster.document.sceneObjects.length; left += 1) {
  const a = cluster.document.sceneObjects[left];
  assert.ok(a.x >= 0 && a.y >= 0 && a.x + 2 <= cluster.document.width && a.y + 2 <= cluster.document.height);
  for (let right = left + 1; right < cluster.document.sceneObjects.length; right += 1) {
    const b = cluster.document.sceneObjects[right];
    assert.ok(a.x + 2 <= b.x || b.x + 2 <= a.x || a.y + 2 <= b.y || b.y + 2 <= a.y, 'cluster blockers must not overlap');
  }
}

const migrated = validateBsbV2AuthoringDocument({ ...base, sceneObjects: [{ id: 'legacy-map-boulder', type: 'boulder', x: 5, y: 5 }] });
assert.equal(migrated.sceneObjects[0].geology.contract, BSB_V2_GEOLOGY_DNA_CONTRACT);
const runtime = buildBsbV2RuntimeMap(cluster.document);
assert.equal(runtime.sceneObjects.every((entry) => entry.geology?.contract === BSB_V2_GEOLOGY_DNA_CONTRACT), true);
for (const entry of runtime.sceneObjects) {
  assert.equal(Object.hasOwn(entry.geology, 'hull'), false, 'runtime bake should carry intent, not generated hull geometry');
  assert.equal(Object.hasOwn(entry.geology, 'cracks'), false, 'runtime bake should not persist disposable crack projections');
}

const serverSource = await readFile(new URL('../server.js', import.meta.url), 'utf8');
const editorSource = await readFile(new URL('../public/axiom-editor.html', import.meta.url), 'utf8');
assert.match(serverSource, /name: "axiom_geology_apply"/, 'MCP should expose semantic geology operations');
assert.match(editorSource, /geology_action: \['axiom_geology_apply'\]/, 'local AI should own a geology intent lane');
assert.match(editorSource, /bsb_geology_operation/, 'MCP geology receipts should apply through the browser editor API');

console.log('bsb-v2-geology-authoring.test.mjs passed');
