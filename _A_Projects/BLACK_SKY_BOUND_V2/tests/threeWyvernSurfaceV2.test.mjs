import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { syncGameViews } from '../src/game/selectors.js';
import { createRenderProjection3DCompiler } from '../src/projection/renderProjection3D.js';
import { createCamera } from '../src/render/camera.js';
import { WORLD_SCALE } from '../src/data/worldScale.js';
import { ThreeActorLayer } from '../src/render/backends/three/ThreeActorLayer.js';
import {
  PROCEDURAL_WYVERN_SURFACE_V2_CONTRACT,
  ThreeWyvernSurfaceV2
} from '../src/render/backends/three/ThreeWyvernSurfaceV2.js';
import { wyvernProjectionSystem } from '../src/systems/wyvernProjectionSystem.js';
import { bodyContactRigSystem } from '../src/systems/bodyContactRigSystem.js';
import { createDemoMap } from '../src/world/map.js';

const map = createDemoMap();
const game = createInitialGameState(map);
wyvernProjectionSystem({ game, dt: 1 / 60 });
bodyContactRigSystem({ game });
syncGameViews(game);
const compiler = createRenderProjection3DCompiler(CONFIG);
const projection = compiler.compile({ time: 0, map, game, camera: createCamera({ clientWidth: 1280, clientHeight: 720 }, map) });
const actor = projection.dynamicWorld.actors.find((entry) => entry.team === 'player');
const rig = actor.wyvernProjection.rigPose;
const gameplaySnapshot = JSON.stringify({ x: actor.x, y: actor.y, rotation: actor.rotation, radius: actor.radius, bodyContactRig: actor.bodyContactRig });
equal(rig.shapeSpace.height, 'render_metres_above_ground', 'rig contract should document elevation units');
equal(rig.shapeSpace.verticalRadius, 'render_metres_from_point_centre', 'rig contract should document vertical-radius units');

for (const point of collectRigPoints(rig)) {
  assert(Number.isFinite(point.height), `${point.role} should publish elevation in render metres`);
  assert(Number.isFinite(point.verticalRadius) && point.verticalRadius > 0, `${point.role} should publish positive vertical radius`);
}
assert(Number.isFinite(rig.visualBounds.minElevation), 'rig diagnostics should include a finite minimum elevation');
assert(rig.visualBounds.maxElevation > rig.visualBounds.minElevation, 'rig diagnostics should include a non-zero elevation range');

const root = new THREE.Group();
const surface = new ThreeWyvernSurfaceV2(root, actor);
surface.update(actor);
const diagnostics = surface.diagnostics();
equal(surface.group.userData.contract, PROCEDURAL_WYVERN_SURFACE_V2_CONTRACT, 'v2 surface should publish its versioned renderer contract');
equal(diagnostics.embodimentVersion, 'surface-v2-production', 'production embodiment should be explicit in diagnostics');
assert(diagnostics.triangleCount <= 6000, 'candidate should stay inside the 6,000-triangle budget');
assert(diagnostics.drawCallCount <= 10, 'candidate should stay inside the ten-draw-call budget');
assert(diagnostics.materialFamilyCount <= 4, 'candidate should use no more than four material families');
equal(diagnostics.topologyBuilds, 1, 'candidate topology should be built exactly once');
equal(diagnostics.membranePanelCount, 12, 'four ordered digits should form six individually faceted panels per wing');
equal(diagnostics.malformedFrameCount, 0, 'valid canonical poses should not create malformed frames');
equal(diagnostics.nonFiniteVertexCount, 0, 'valid canonical poses should not create non-finite vertices');
assert(diagnostics.tailBindCurveMeters > 0, 'candidate bind shape should break the rigid spear-tail read without owning animation state');
equal(surface.group.userData.bodyContactRig, actor.bodyContactRig, 'candidate should expose canonical gameplay contacts without owning them');
equal(surface.sweeps.definitions.get('axial').pointCount, 8 + rig.tail.length, 'skull, neck, torso, hips, and tail should share one continuous axial sweep');
assert(surface.sweeps.geometry.index && surface.sweeps.geometry.getAttribute('position')
  && surface.sweeps.geometry.getAttribute('normal') && surface.sweeps.geometry.getAttribute('color'), 'candidate should preallocate indexed position, normal, and colour buffers');

assertClosedIndexedSurface(surface.sweeps.geometry);
assertFiniteNormals(surface.sweeps.geometry);
assertFiniteNormals(surface.membranes.geometry);
assertFirstAxialFaceWindsOutward(surface, rig);
equal([...surface.membranes.geometry.index.array].join(','), expectedMembraneIndices().join(','), 'membrane panels should preserve ordered wrist-to-digit fans on both wings');
const bounds = new THREE.Box3().setFromObject(surface.group);
assert(bounds.min.y >= -0.012, `candidate anatomy should not penetrate the floor (${bounds.min.y})`);

const sweepId = surface.sweeps.geometry.uuid;
const membraneId = surface.membranes.geometry.uuid;
const sweepArray = surface.sweeps.geometry.getAttribute('position').array;
surface.update(actor);
equal(surface.diagnostics(), diagnostics, 'per-frame diagnostics should reuse one preallocated object');
equal(surface.sweeps.geometry.uuid, sweepId, 'pose updates should reuse axial and limb topology');
equal(surface.membranes.geometry.uuid, membraneId, 'pose updates should reuse membrane topology');
equal(surface.sweeps.geometry.getAttribute('position').array, sweepArray, 'pose updates should reuse the preallocated position buffer');
equal(surface.diagnostics().poseUpdates, 2, 'pose update diagnostics should count reused-frame writes');
equal(JSON.stringify({ x: actor.x, y: actor.y, rotation: actor.rotation, radius: actor.radius, bodyContactRig: actor.bodyContactRig }), gameplaySnapshot, 'candidate pose updates should not mutate gameplay transform, collider, or contact truth');

const malformed = new ThreeWyvernSurfaceV2(root, actor);
const malformedActor = structuredClone(actor);
malformedActor.wyvernProjection.rigPose.axial.chest.height = Number.NaN;
let malformedFailed = false;
try { malformed.update(malformedActor); } catch (error) { malformedFailed = String(error.message).includes('wyvern_surface_point_invalid'); }
assert(malformedFailed, 'malformed canonical frames should fail before reaching the GPU');
equal(malformed.diagnostics().malformedFrameCount, 1, 'malformed-frame diagnostics should register rejected updates');
malformed.dispose();

const candidateSource = await readFile(new URL('../src/render/backends/three/ThreeWyvernSurfaceV2.js', import.meta.url), 'utf8');
const actorLayerSource = await readFile(new URL('../src/render/backends/three/ThreeActorLayer.js', import.meta.url), 'utf8');
assert(!candidateSource.includes('GLTFLoader'), 'candidate should not import the rejected baby GLB path');
assert(!candidateSource.includes('dragon_main_march_v5_baby_rig'), 'candidate should not reference the rejected baby rig asset');
assert(!candidateSource.includes('SkinnedMesh'), 'candidate should stay renderer-neutral and procedural');
assert(!actorLayerSource.includes('ThreeWyvernMesh'), 'production actor layer should not retain the v1 runtime symbol');
assert(!actorLayerSource.includes('readWyvernEmbodiment'), 'production actor layer should not retain a query-selected embodiment path');

let disposedGeometryCount = 0;
surface.sweeps.geometry.addEventListener('dispose', () => { disposedGeometryCount += 1; });
surface.membranes.geometry.addEventListener('dispose', () => { disposedGeometryCount += 1; });
surface.dispose();
equal(disposedGeometryCount, 2, 'candidate should dispose its dynamic surface buffers');
equal(surface.group.parent, null, 'candidate should detach its render group during disposal');
equal(surface.diagnostics().disposed, true, 'candidate diagnostics should record disposal');

const layerRoot = new THREE.Group();
const layer = new ThreeActorLayer(layerRoot);
layer.update([actor]);
const layerDiagnostics = layer.diagnostics();
equal(layerDiagnostics.wyvernEmbodiment, 'surface-v2', 'production actor layer should unconditionally activate v2 anatomy');
equal(layerDiagnostics.wyvernEmbodimentVersion, 'surface-v2-production', 'actor-layer diagnostics should identify promoted production embodiment');
equal(layerDiagnostics.wyvernContract, PROCEDURAL_WYVERN_SURFACE_V2_CONTRACT, 'actor-layer diagnostics should expose the candidate contract');
equal(layerDiagnostics.wyvernTopologyBuildCount, 1, 'actor-layer diagnostics should expose topology builds');
equal(layerDiagnostics.wyvernMembranePanelCount, 12, 'actor-layer diagnostics should expose membrane panels');
equal(layerDiagnostics.wyvernMalformedFrameCount, 0, 'actor-layer diagnostics should expose malformed frames');
equal(layerDiagnostics.wyvernNonFiniteVertexCount, 0, 'actor-layer diagnostics should expose non-finite vertices');
layer.dispose();

compiler.dispose();

function collectRigPoints(value, output = []) {
  if (!value || typeof value !== 'object') return output;
  if (value.classification?.includes('point')) output.push(value);
  for (const nested of Object.values(value)) collectRigPoints(nested, output);
  return output;
}

function assertClosedIndexedSurface(geometry) {
  const indices = geometry.index.array;
  const edges = new Map();
  for (let index = 0; index < indices.length; index += 3) {
    for (const [a, b] of [[indices[index], indices[index + 1]], [indices[index + 1], indices[index + 2]], [indices[index + 2], indices[index]]]) {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  assert([...edges.values()].every((uses) => uses === 2), 'every axial and limb sweep edge should be closed and manifold');
}

function assertFiniteNormals(geometry) {
  const normals = geometry.getAttribute('normal').array;
  assert([...normals].every(Number.isFinite), 'surface normals should remain finite');
  assert([...normals].some((value) => Math.abs(value) > 0.01), 'surface normals should contain non-zero lighting directions');
}

function assertFirstAxialFaceWindsOutward(surface, rig) {
  const positions = surface.sweeps.geometry.getAttribute('position');
  const [aIndex, bIndex, cIndex] = surface.sweeps.geometry.index.array;
  const a = new THREE.Vector3().fromBufferAttribute(positions, aIndex);
  const b = new THREE.Vector3().fromBufferAttribute(positions, bIndex);
  const c = new THREE.Vector3().fromBufferAttribute(positions, cIndex);
  const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
  const center = new THREE.Vector3(rig.head.snoutTip.x * WORLD_SCALE.tileMeters, rig.head.snoutTip.height, rig.head.snoutTip.y * WORLD_SCALE.tileMeters);
  const radial = a.clone().add(b).add(c).multiplyScalar(1 / 3).sub(center);
  assert(normal.dot(radial) > 0, 'the continuous axial sweep should wind outward');
}

function expectedMembraneIndices() {
  const indices = [];
  for (const offset of [0, 8]) for (let point = 1; point < 7; point += 1) indices.push(offset, offset + point, offset + point + 1);
  return indices;
}
