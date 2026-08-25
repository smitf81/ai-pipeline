import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { assert, equal } from './assert.mjs';
import {
  PROCEDURAL_UNDERGROWTH_DEFINITION_CONTRACT,
  UNDERGROWTH_DNA_CONTRACT,
  resolveProceduralUndergrowthDefinition
} from '../src/data/proceduralUndergrowth.js';
import {
  generateProceduralUndergrowthSkeleton,
  PROCEDURAL_UNDERGROWTH_SKELETON_CONTRACT
} from '../src/world/proceduralUndergrowthGenerator.js';
import { createSceneObject } from '../src/world/sceneObjects.js';
import { buildSceneryProjection } from '../src/projection/sceneObjectProjection.js';
import { buildWebGLSceneryDepthItems } from '../src/render/backends/webgl/layers/WebGLSceneryLayer.js';
import { ThreeUndergrowthLayer } from '../src/render/backends/three/ThreeUndergrowthLayer.js';

const authored = {
  contract: UNDERGROWTH_DNA_CONTRACT,
  seed: 78231,
  species: 'wood_fern',
  ageYears: 7,
  health: .92,
  season: 'summer',
  heightMeters: .62,
  spreadMeters: 1.72,
  density: .88,
  stemCount: 11,
  leafSize: .17,
  curl: .34,
  lean: .16,
  irregularity: .31,
  groundCover: .48,
  burn: 0,
  char: 0,
  stemColour: '#36513a',
  leafColour: '#2f6339'
};

const definition = resolveProceduralUndergrowthDefinition(authored, { id: 'fern:proof', type: 'fern_patch', x: 8, y: 6 });
equal(definition.contract, PROCEDURAL_UNDERGROWTH_DEFINITION_CONTRACT, 'Undergrowth DNA should resolve into one runtime definition contract');
equal(definition.seed, 78231, 'seed should remain compact authored truth');
equal(definition.species, 'wood_fern', 'species should select a recipe without storing mesh geometry');

const first = generateProceduralUndergrowthSkeleton(definition);
const second = generateProceduralUndergrowthSkeleton(definition);
equal(first.contract, PROCEDURAL_UNDERGROWTH_SKELETON_CONTRACT, 'generator should publish one inspectable skeleton contract');
assert(JSON.stringify(first) === JSON.stringify(second), 'the same undergrowth seed should reproduce the same spline skeleton');
assert(first.stems.length >= 6, 'healthy fern DNA should generate multiple frond splines');
assert(first.stems.every((stem) => stem.points.length >= 4), 'undergrowth stems should be sampled splines rather than fixed triangles');
assert(first.units === 'metres_y_up' && first.stems.every((stem) => stem.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z))), 'v2 undergrowth skeleton points should be renderer-neutral metre-space xyz data');
assert(first.leaves.length >= 8, 'healthy summer undergrowth should generate bounded leaf clusters');

const damaged = generateProceduralUndergrowthSkeleton(resolveProceduralUndergrowthDefinition({ ...authored, health: .18 }, { id: 'fern:damaged', type: 'fern_patch' }));
assert(damaged.leaves.length < first.leaves.length, 'health intent should reduce generated foliage without rewriting geometry');
const alternate = generateProceduralUndergrowthSkeleton(resolveProceduralUndergrowthDefinition({ ...authored, seed: 78232 }, { id: 'fern:alternate', type: 'fern_patch' }));
assert(JSON.stringify(alternate.stems) !== JSON.stringify(first.stems), 'changing only the seed should create distinct undergrowth splines');

const runtimeObjects = [
  createSceneObject({ id: 'fern:legacy', type: 'fern_patch', x: 4, y: 6 }),
  createSceneObject({ id: 'shrub:dna', type: 'forest_shrub', x: 8, y: 6, undergrowth: { seed: 41, species: 'forest_shrub', density: .92 } }),
  createSceneObject({ id: 'bramble:ember', type: 'smouldering_bramble', x: 12, y: 6 })
];
assert(runtimeObjects.every((object) => object.undergrowthDefinition?.contract === PROCEDURAL_UNDERGROWTH_DEFINITION_CONTRACT), 'legacy undergrowth types should normalize at the runtime boundary');
assert(runtimeObjects.every((object) => object.render.kind === 'procedural_undergrowth'), 'all undergrowth species should share one procedural renderer path');
assert(runtimeObjects[0].visualWidthTiles > runtimeObjects[0].collisionFootprint.w, 'generated spread should remain separate from nonblocking collision truth');
assert(runtimeObjects[2].emitter?.lightEmitterId, 'smouldering bramble should retain its existing emitter contract');

const projection = { scenery: buildSceneryProjection(runtimeObjects, 16) };
assert(projection.scenery.every((object) => object.undergrowthDefinition?.species), 'renderer-neutral projection should carry resolved undergrowth intent');
const built = buildWebGLSceneryDepthItems(projection, {
  camera: { visibleWorldBounds: () => ({ left: 0, top: 0, right: 512, bottom: 512 }) },
  lightSpaceCulling: { enabled: false }
});
equal(built.proceduralUndergrowthCount, 3, 'WebGL diagnostics should prove all three records used the procedural path');
assert(built.proceduralUndergrowthSplineCount >= 12, 'WebGL diagnostics should expose generated spline count');
assert(built.proceduralUndergrowthLeafClusterCount >= 8, 'WebGL diagnostics should expose generated leaf clusters');
assert(built.items.every((item) => item.proceduralUndergrowth?.generatedTriangleCount > 0), 'procedural undergrowth should triangulate only at the renderer boundary');

const batchRoot = new THREE.Group();
const batch = new ThreeUndergrowthLayer(batchRoot, 16);
batch.rebuild(projection.scenery);
const batchDiagnostics = batch.diagnostics();
equal(batchDiagnostics.objectCount, 3, 'Three.js should batch every undergrowth object through one layer');
assert(batchDiagnostics.drawCalls <= batchDiagnostics.chunkCount * 4, 'Three.js undergrowth should retain four or fewer material batches per cullable chunk');
equal(batch.renderEnvelopeObjects().length, batchDiagnostics.chunkCount, 'every undergrowth chunk should expose one foliage render-envelope candidate');
equal(batchDiagnostics.objectIdRangeCount, 3, 'Three.js undergrowth should retain object-ID ranges for targeted fire updates');
assert(batchDiagnostics.leafCount > 0 && batchDiagnostics.groundClusterCount > 0, 'Three.js batch should carry recipe leaves and ground clusters rather than stand-ins');
const shrubRange = batch.objectRanges.get('shrub:dna').leaves;
const baseScale = new THREE.Vector3();
shrubRange.baseMatrices[shrubRange.start].decompose(new THREE.Vector3(), new THREE.Quaternion(), baseScale);
batch.applyMaterialUpdates([{ id: 'shrub:dna', material: { state: { firePhase: 'burnt_out', charAmount: 1, heatAmount: 0, emberAmount: 0 } } }]);
const burntMatrix = new THREE.Matrix4();
const burntScale = new THREE.Vector3();
shrubRange.mesh.getMatrixAt(shrubRange.start, burntMatrix);
burntMatrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), burntScale);
assert(burntScale.length() < baseScale.length() * 0.1, 'targeted burnt-out updates should deplete foliage instances without rebuilding the batch');
batch.dispose();

const scenerySource = readFileSync(new URL('../src/render/backends/webgl/layers/WebGLSceneryLayer.js', import.meta.url), 'utf8');
for (const divergentBuilder of ['buildFernPatch', 'buildForestShrub', 'buildSmoulderingFern', 'buildSmoulderingBramble']) {
  assert(!scenerySource.includes(divergentBuilder), `${divergentBuilder} should be deleted after procedural migration`);
}
const threeFactorySource = readFileSync(new URL('../src/render/backends/three/ThreeSceneryFactory.js', import.meta.url), 'utf8');
assert(!threeFactorySource.includes('createFern') && !threeFactorySource.includes('createShrub'), 'Three.js fixed primitive undergrowth branches should be deleted');
