import * as THREE from 'three';
import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import {
  TERRAIN_MATERIAL_LAYER_CONTRACT,
  TERRAIN_MATERIAL_LAYERS,
  TERRAIN_PBR_TEXTURE_CONTRACT
} from '../src/data/terrainMaterialLayers.js';
import { buildSceneryProjection } from '../src/projection/sceneObjectProjection.js';
import { buildTerrainProjection } from '../src/projection/terrainProjection.js';
import {
  TerrainDebugMode,
  ThreeTerrainMaterialSystem
} from '../src/render/backends/three/ThreeTerrainMaterialSystem.js';
import { createTerrainBlendMask } from '../src/render/backends/three/ThreeTerrainBlendMask.js';
import {
  createTerrainPbrTextures,
  evaluateTerrainSurface,
  TERRAIN_NORMAL_DERIVATIVE_SCALE,
  sampleTerrainHeight
} from '../src/render/backends/three/ThreeTerrainPbrTextures.js';
import { WORLD_SCALE } from '../src/data/worldScale.js';
import { createDemoMap } from '../src/world/map.js';

for (const [index, definition] of TERRAIN_MATERIAL_LAYERS.entries()) {
  equal(definition.contract, TERRAIN_MATERIAL_LAYER_CONTRACT, `${definition.id} should declare the layered terrain contract`);
  equal(definition.textureContract, TERRAIN_PBR_TEXTURE_CONTRACT, `${definition.id} should declare the PBR texture contract`);
  equal(definition.index, index, `${definition.id} should retain its texture-array layer index`);
  equal(definition.source, 'procedural_original_no_external_asset', `${definition.id} should record its source`);
  assert(definition.roughness >= 0.8 && definition.roughness <= 1, `${definition.id} roughness should suit an earthy dielectric`);
  assert(definition.ambientOcclusion >= 0.8 && definition.ambientOcclusion <= 1, `${definition.id} AO should remain conservative`);
}
equal(new Set(TERRAIN_MATERIAL_LAYERS.map((entry) => entry.textureWorldMeters)).size, 1, 'all layers should use identical world texel density');

const textures = createTerrainPbrTextures({ size: 32, anisotropy: 4 });
equal(textures.depth, 3, 'PBR arrays should contain exactly the focused three layers');
equal(textures.baseColour.wrapS, THREE.RepeatWrapping, 'base colour should repeat without an atlas edge');
equal(textures.normal.minFilter, THREE.LinearMipmapLinearFilter, 'normal array should use stable trilinear mipmapping');
equal(textures.surface.generateMipmaps, true, 'packed roughness/AO/height should generate mipmaps');
for (const range of textures.ranges) {
  assert(range.minRoughness >= 0.68 && range.maxRoughness <= 1, `${range.id} roughness pixels should remain sensible`);
  assert(range.minAo >= 0.7 && range.maxAo <= 1, `${range.id} AO pixels should remain conservative`);
}

for (const definition of TERRAIN_MATERIAL_LAYERS) {
  for (const sample of [0.13, 0.47, 0.81]) {
    nearly(sampleTerrainHeight(definition, 0, sample), sampleTerrainHeight(definition, 1, sample), 1e-9, `${definition.id} height should wrap in U`);
    nearly(sampleTerrainHeight(definition, sample, 0), sampleTerrainHeight(definition, sample, 1), 1e-9, `${definition.id} height should wrap in V`);
    const a = evaluateTerrainSurface(definition, 0, sample);
    const b = evaluateTerrainSurface(definition, 1, sample);
    a.baseColour.forEach((value, channel) => nearly(value, b.baseColour[channel], 1e-7, `${definition.id} base colour channel should wrap`));
  }
}

const normalData = textures.normal.image.data;
const normalSize = textures.size;
const normalX = 11;
const normalY = 17;
const grass = TERRAIN_MATERIAL_LAYERS[0];
const normalOffset = (normalY * normalSize + normalX) * 4;
const decoded = normalize([
  normalData[normalOffset] / 255 * 2 - 1,
  normalData[normalOffset + 1] / 255 * 2 - 1,
  normalData[normalOffset + 2] / 255 * 2 - 1
]);
const expected = normalize([
  -(sampleTerrainHeight(grass, (normalX + 1) / normalSize, normalY / normalSize) - sampleTerrainHeight(grass, (normalX - 1) / normalSize, normalY / normalSize)) * grass.normalStrength * TERRAIN_NORMAL_DERIVATIVE_SCALE,
  -(sampleTerrainHeight(grass, normalX / normalSize, (normalY + 1) / normalSize) - sampleTerrainHeight(grass, normalX / normalSize, (normalY - 1) / normalSize)) * grass.normalStrength * TERRAIN_NORMAL_DERIVATIVE_SCALE,
  0.58
]);
assert(dot(decoded, expected) > 0.999, 'encoded OpenGL normal should point with the sampled height gradient, not invert Y');
textures.dispose();

const map = createDemoMap();
const terrain = buildTerrainProjection(map, CONFIG.tileSize);
const scenery = buildSceneryProjection(map.sceneObjects, CONFIG.tileSize);
assert(terrain.detailExclusionZones.some((zone) => zone.source === 'map_spawn'), 'terrain projection should clear grass around authored spawn');
assert(terrain.detailExclusionZones.some((zone) => zone.source === 'map_escape_zone'), 'terrain projection should clear grass around the authored escape region');
const blendMask = createTerrainBlendMask(terrain, new Map(TERRAIN_MATERIAL_LAYERS.map((entry) => [entry.terrainType, entry])));
assert(blendMask.pixelsPerTile >= 8, 'organic contours should have enough sub-tile resolution to avoid a tile staircase');
assert(blendMask.contourDisplacedPixels > 0, 'the dominant visual contour should move beyond authored square boundaries');
equal(blendMask.authoredCentreMismatches, 0, 'organic contour deformation should retain the authored identity at every target tile centre');
assert(blendMask.edgePolicy.includes('path_capsules') && blendMask.edgePolicy.includes('edge_lobes'), 'mask should use shape features, not straight-edge feathering alone');
blendMask.dispose();
const root = new THREE.Group();
const system = new ThreeTerrainMaterialSystem(root, { tileMeters: WORLD_SCALE.tileMeters, anisotropy: 4 });
system.rebuild(terrain, scenery);
let diagnostics = system.diagnostics();
equal(diagnostics.terrain.status, 'ready', 'three-material system should build without a flat fallback');
equal(diagnostics.terrain.layeredDrawBatches, 1, 'grass, dirt, and scorched tiles should share one draw batch');
equal(diagnostics.terrain.layeredTileCount, terrain.tiles.filter((tile) => ['grass', 'dirt', 'scorched'].includes(tile.type)).length, 'layered batch should retain every target tile');
const floor = system.group.getObjectByName('terrain:layered-floor:grass-dirt-scorched');
assert(floor?.isInstancedMesh, 'layered floor should be an InstancedMesh');
assert(floor.geometry.getAttribute('terrainLayer')?.isInstancedBufferAttribute, 'layer identity should be a per-instance attribute');

system.updateView({ cameraTarget: new THREE.Vector3(20, 0, 16) });
diagnostics = system.diagnostics();
assert(diagnostics.grassDetail.candidateCount > 0, 'deterministic scatter should create sparse grass candidates');
assert(diagnostics.grassDetail.visibleCount > 0, 'distance culling should retain nearby grass candidates');
assert(diagnostics.grassDetail.visibleCount < diagnostics.grassDetail.candidateCount, 'distance culling should reject far candidates');
const firstSignature = diagnostics.grassDetail.scatterSignature;
system.rebuild(terrain, scenery);
equal(system.diagnostics().grassDetail.scatterSignature, firstSignature, 'same map should reproduce identical grass placement');
equal(system.setDebugMode(TerrainDebugMode.MATERIAL_ID), TerrainDebugMode.MATERIAL_ID, 'material ID view should be selectable');
equal(system.cycleDebugMode(), TerrainDebugMode.NORMAL_ONLY, 'terrain diagnostic view should cycle to normal-only');
equal(system.setGroundDetailEnabled(false), false, 'ground detail geometry should be toggleable');

const brokenTerrain = {
  ...terrain,
  tiles: terrain.tiles.map((tile, index) => index === terrain.tiles.findIndex((entry) => entry.type === 'grass')
    ? { ...tile, material: { ...tile.material, profileId: 'missing_terrain_material' } }
    : tile)
};
const originalError = console.error;
let diagnosticLog = '';
console.error = (message) => { diagnosticLog += String(message); };
try { system.rebuild(brokenTerrain, scenery); } finally { console.error = originalError; }
equal(system.diagnostics().terrain.status, 'error_visible_diagnostic', 'missing material data should fail visibly');
assert(system.group.getObjectByName('terrain:material-error-visible-diagnostic'), 'missing material data should render a magenta diagnostic mesh');
assert(diagnosticLog.includes('missing_terrain_material'), 'missing material data should emit a diagnostic error');
system.dispose();

function nearly(actual, expectedValue, epsilon, message) {
  assert(Math.abs(actual - expectedValue) <= epsilon, `${message}: ${actual} !== ${expectedValue}`);
}

function normalize(values) {
  const length = Math.hypot(...values) || 1;
  return values.map((value) => value / length);
}

function dot(a, b) { return a.reduce((sum, value, index) => sum + value * b[index], 0); }
