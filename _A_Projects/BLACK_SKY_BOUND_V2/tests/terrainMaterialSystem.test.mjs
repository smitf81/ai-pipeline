import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
import {
  createRockTerrainMaterial,
  ROCK_TERRAIN_MATERIAL_CONTRACT,
  ROCK_TERRAIN_TEXTURE_SET
} from '../src/render/backends/three/ThreeRockTerrainMaterial.js';
import {
  createWaterTerrainMaterial,
  THREE_WATER_TERRAIN_MATERIAL_CONTRACT
} from '../src/render/backends/three/ThreeWaterTerrainMaterial.js';
import {
  resolveTerrainRainWetness,
  TERRAIN_WETNESS_RESPONSE,
  THREE_TERRAIN_WETNESS_CONTRACT
} from '../src/render/backends/three/ThreeTerrainWetness.js';
import {
  createGrassTerrainPbrTextures,
  GRASS_TERRAIN_PBR_CONTRACT,
  GRASS_TERRAIN_TEXTURE_SET
} from '../src/render/backends/three/ThreeGrassTerrainPbrTextures.js';
import {
  createMudTerrainPbrTextures,
  MUD_TERRAIN_PBR_CONTRACT,
  MUD_TERRAIN_TEXTURE_SET
} from '../src/render/backends/three/ThreeMudTerrainPbrTextures.js';
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

equal(ROCK_TERRAIN_TEXTURE_SET.textureWorldMeters, 2, 'rock texture should preserve the reference two-metre material scale');
equal(ROCK_TERRAIN_TEXTURE_SET.size, 1024, 'rock runtime textures should retain the authored 1K power-of-two size');
equal(ROCK_TERRAIN_TEXTURE_SET.normalOrientation, 'open_gl_positive_green_v', 'rock normal orientation should be explicit');
for (const kind of ['albedo', 'normal', 'orm', 'height']) {
  const png = readFileSync(fileURLToPath(ROCK_TERRAIN_TEXTURE_SET[kind]));
  equal(png.subarray(1, 4).toString('ascii'), 'PNG', `${kind} should resolve to a PNG asset`);
  equal(png.readUInt32BE(16), 1024, `${kind} texture width should match the manifest`);
  equal(png.readUInt32BE(20), 1024, `${kind} texture height should match the manifest`);
}
const rockHandle = createRockTerrainMaterial({ anisotropy: 4 });
equal(rockHandle.state.contract, ROCK_TERRAIN_MATERIAL_CONTRACT, 'rock material should expose its runtime contract');
equal(rockHandle.state.status, 'headless_descriptor', 'headless validation should not pretend browser image loading completed');
equal(rockHandle.material.userData.rockUniforms.uRockTextureFailure.value, 1, 'unloaded rock textures should remain fail-visible');
const shaderProbe = {
  uniforms: {},
  vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <project_vertex>',
  fragmentShader: '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>\n#include <normal_fragment_maps>\n#include <aomap_fragment>\n#include <opaque_fragment>'
};
rockHandle.material.onBeforeCompile(shaderProbe);
assert(shaderProbe.fragmentShader.includes('rockDominantUv'), 'rock shader should install dominant-axis world-space triplanar sampling');
assert(shaderProbe.fragmentShader.includes('uRockTextureFailure'), 'rock shader should retain a fail-visible texture diagnostic');
assert(shaderProbe.fragmentShader.includes('rockPbr.worldNormal'), 'rock shader should use the reference-derived normal map');
assert(shaderProbe.fragmentShader.includes('terrainRainMask'), 'rock shader should derive rain wetness from the shared world-space mask');
assert(shaderProbe.fragmentShader.includes('rockPbr.wetness'), 'rock shader should expose wetness in its diagnostic path');
rockHandle.disposeTextures();

const dryWetness = resolveTerrainRainWetness({ enabled: false, tuning: { rainEnabled: true, rainDensity: 1 } }, 2);
const rainWetness = resolveTerrainRainWetness({ enabled: true, tuning: { rainEnabled: true, rainDensity: 0.82 } }, 3.5);
equal(dryWetness.contract, THREE_TERRAIN_WETNESS_CONTRACT, 'terrain wetness should expose a stable shared contract');
equal(dryWetness.rainIntensity, 0, 'disabled atmospheric projection should leave terrain dry');
equal(rainWetness.rainIntensity, 0.82, 'terrain wetness should consume canonical projected rain density');
assert(TERRAIN_WETNESS_RESPONSE.dirt.response > TERRAIN_WETNESS_RESPONSE.grass.response, 'mud should pool rain more strongly than fibrous grass');
assert(TERRAIN_WETNESS_RESPONSE.rock.wetRoughness < 0.2, 'wet rock should reach a visibly reflective dielectric roughness');

const waterHandle = createWaterTerrainMaterial({ debugMode: 0 });
equal(waterHandle.state.contract, THREE_WATER_TERRAIN_MATERIAL_CONTRACT, 'water should expose its dedicated physical-material contract');
equal(waterHandle.state.status, 'ready', 'procedural water should be immediately ready without an image load');
const waterShaderProbe = {
  uniforms: {},
  vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <project_vertex>',
  fragmentShader: '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>\n#include <opaque_fragment>'
};
waterHandle.material.onBeforeCompile(waterShaderProbe);
assert(waterShaderProbe.fragmentShader.includes('waterSurfaceNormal'), 'water should derive continuous moving world-space normals');
assert(waterShaderProbe.fragmentShader.includes('terrainRainReflection'), 'water should include the shared dielectric sky-reflection response');
waterHandle.setRain(rainWetness);
equal(waterHandle.material.userData.waterUniforms.uRainWetness.value, 0.82, 'water rain ripples should follow projected rain intensity');

equal(GRASS_TERRAIN_TEXTURE_SET.textureWorldMeters, 1.6, 'grass texture should preserve the layered terrain texel scale');
equal(GRASS_TERRAIN_TEXTURE_SET.size, 1024, 'grass runtime textures should retain the authored 1K power-of-two size');
equal(GRASS_TERRAIN_TEXTURE_SET.normalOrientation, 'open_gl_positive_green_v', 'grass normal orientation should be explicit');
for (const kind of ['albedo', 'normal', 'orm', 'height']) {
  const png = readFileSync(fileURLToPath(GRASS_TERRAIN_TEXTURE_SET[kind]));
  equal(png.subarray(1, 4).toString('ascii'), 'PNG', `grass ${kind} should resolve to a PNG asset`);
  equal(png.readUInt32BE(16), 1024, `grass ${kind} texture width should match the manifest`);
  equal(png.readUInt32BE(20), 1024, `grass ${kind} texture height should match the manifest`);
}
const grassHandle = createGrassTerrainPbrTextures({ anisotropy: 4 });
equal(grassHandle.state.contract, GRASS_TERRAIN_PBR_CONTRACT, 'grass texture loader should expose its runtime contract');
equal(grassHandle.state.status, 'headless_descriptor', 'headless validation should not pretend browser grass loading completed');
equal(grassHandle.uniforms.uGrassTextureFailure.value, 1, 'unloaded grass textures should remain fail-visible');
grassHandle.dispose();

equal(MUD_TERRAIN_TEXTURE_SET.textureWorldMeters, 1.6, 'mud texture should preserve the layered terrain texel scale');
equal(MUD_TERRAIN_TEXTURE_SET.size, 1024, 'mud runtime textures should retain the authored 1K power-of-two size');
equal(MUD_TERRAIN_TEXTURE_SET.normalOrientation, 'open_gl_positive_green_v', 'mud normal orientation should be explicit');
for (const kind of ['albedo', 'normal', 'orm', 'height']) {
  const png = readFileSync(fileURLToPath(MUD_TERRAIN_TEXTURE_SET[kind]));
  equal(png.subarray(1, 4).toString('ascii'), 'PNG', `mud ${kind} should resolve to a PNG asset`);
  equal(png.readUInt32BE(16), 1024, `mud ${kind} texture width should match the manifest`);
  equal(png.readUInt32BE(20), 1024, `mud ${kind} texture height should match the manifest`);
}
const mudHandle = createMudTerrainPbrTextures({ anisotropy: 4 });
equal(mudHandle.state.contract, MUD_TERRAIN_PBR_CONTRACT, 'mud texture loader should expose its runtime contract');
equal(mudHandle.state.status, 'headless_descriptor', 'headless validation should not pretend browser mud loading completed');
equal(mudHandle.state.textureSetCount, 1, 'the path layer should use exactly one mud texture set');
equal(mudHandle.uniforms.uMudTextureFailure.value, 1, 'unloaded mud textures should remain fail-visible');
mudHandle.dispose();

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
assert(diagnostics.terrain.layeredDrawBatches > 1, 'layered terrain should be split into spatially cullable instanced chunks');
equal(diagnostics.terrain.layeredTileCount, terrain.tiles.filter((tile) => ['grass', 'dirt', 'scorched'].includes(tile.type)).length, 'layered batch should retain every target tile');
equal(diagnostics.terrain.rockTileCount, terrain.tiles.filter((tile) => tile.type === 'rock').length, 'rock material should retain every authored blocked tile');
assert(diagnostics.terrain.rockDrawBatches > 1, 'authored rock should retain one material while splitting into cullable chunks');
equal(diagnostics.terrain.waterTileCount, terrain.tiles.filter((tile) => tile.type === 'water').length, 'reflective water should retain every authored water tile');
assert(diagnostics.terrain.waterDrawBatches >= 1, 'water tiles should retain reflective spatial chunks');
equal(system.renderEnvelopeObjects().length, diagnostics.terrain.terrainChunkCount, 'every terrain chunk should be registered as one render-envelope candidate');
assert(system.renderEnvelopeObjects().every((entry) => entry.object.boundingBox?.isBox3 && !entry.object.boundingBox.isEmpty()), 'terrain chunks should expose finite world bounds for early culling');
equal(diagnostics.terrain.authoredGrassTextureCount, 4, 'layered floor should bind the four authored grass PBR textures');
equal(diagnostics.terrain.authoredMudTextureCount, 4, 'layered floor should bind the four authored mud PBR textures');
equal(diagnostics.terrain.grassMaterial?.status, 'headless_descriptor', 'headless diagnostics should distinguish the unexecuted grass browser load');
equal(diagnostics.terrain.mudMaterial?.status, 'headless_descriptor', 'headless diagnostics should distinguish the unexecuted mud browser load');
equal(diagnostics.terrain.rockMaterial?.status, 'headless_descriptor', 'headless diagnostics should distinguish the unexecuted browser load');
equal(diagnostics.terrain.waterMaterial?.status, 'ready', 'procedural reflective water should be ready in headless diagnostics');
const floor = system.group.getObjectByName('terrain:layered-floor:grass-dirt-scorched');
assert(floor?.isInstancedMesh, 'layered floor should be an InstancedMesh');
assert(floor.geometry.getAttribute('terrainLayer')?.isInstancedBufferAttribute, 'layer identity should be a per-instance attribute');
equal(floor.material.userData.terrainUniforms.uGrassTextureFailure.value, 1, 'layered shader should surface an unloaded grass texture diagnostic');
equal(floor.material.userData.terrainUniforms.uMudTextureFailure.value, 1, 'layered shader should surface an unloaded mud texture diagnostic');
equal(floor.material.userData.terrainUniforms.uRainWetness.value, 0, 'layered floor should start dry before weather projection is consumed');
const terrainShaderProbe = {
  uniforms: {},
  vertexShader: '#include <common>\n#include <begin_vertex>\n#include <project_vertex>',
  fragmentShader: '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>\n#include <aomap_fragment>\n#include <opaque_fragment>'
};
floor.material.onBeforeCompile(terrainShaderProbe);
assert(terrainShaderProbe.fragmentShader.includes('terrainBaseBlend'), 'layered shader should replace the procedural grass array sample');
assert(terrainShaderProbe.fragmentShader.includes('uGrassTextureFailure'), 'layered shader should retain a fail-visible grass texture diagnostic');
assert(terrainShaderProbe.fragmentShader.includes('texture( uMudBaseColour, uv ) * weights.g'), 'layered shader should replace the procedural dirt-array sample with authored mud');
assert(terrainShaderProbe.fragmentShader.includes('uMudTextureFailure'), 'layered shader should retain a fail-visible mud texture diagnostic');
assert(terrainShaderProbe.fragmentShader.includes('terrainRainMask'), 'layered shader should share the world-space rain wetness mask');
assert(terrainShaderProbe.fragmentShader.includes('terrainPbr.wetness'), 'layered shader should expose the wetness mask to diagnostics');
const rockFloor = system.group.getObjectByName('terrain:rock:pbr');
assert(rockFloor?.isInstancedMesh, 'rock terrain should remain one instanced obstacle mesh');
equal(rockFloor.material.name, 'terrain:rock:triplanar-pbr-material', 'rock terrain should no longer use the scalar grey legacy material');
const waterFloor = system.group.getObjectByName('terrain:water:reflective');
assert(waterFloor?.isInstancedMesh, 'water terrain should remain one instanced floor mesh');
equal(waterFloor.material.name, 'terrain:water:reflective-physical-material', 'water should use the dedicated reflective shader');

system.updateWeather({ enabled: true, tuning: { rainEnabled: true, rainDensity: 0.82 } }, 3.5);
equal(floor.material.userData.terrainUniforms.uRainWetness.value, 0.82, 'layered ground wetness should follow projected rain intensity');
equal(rockFloor.material.userData.rockUniforms.uRainWetness.value, 0.82, 'rock wetness should follow the same projected rain intensity');
equal(waterFloor.material.userData.waterUniforms.uRainWetness.value, 0.82, 'water ripples should follow the same projected rain intensity');
equal(system.diagnostics().terrain.wetness.source, 'renderer_neutral_atmospheric_overlay_projection', 'diagnostics should identify the canonical rain source');

system.updateView({ cameraTarget: new THREE.Vector3(20, 0, 16) });
diagnostics = system.diagnostics();
assert(diagnostics.grassDetail.candidateCount > 0, 'deterministic scatter should create sparse grass candidates');
assert(diagnostics.grassDetail.visibleCount > 0, 'distance culling should retain nearby grass candidates');
assert(diagnostics.grassDetail.visibleCount < diagnostics.grassDetail.candidateCount, 'distance culling should reject far candidates');
const firstSignature = diagnostics.grassDetail.scatterSignature;
system.rebuild(terrain, scenery);
equal(system.diagnostics().grassDetail.scatterSignature, firstSignature, 'same map should reproduce identical grass placement');
const rebuiltRockFloor = system.group.getObjectByName('terrain:rock:pbr');
equal(system.setDebugMode(TerrainDebugMode.MATERIAL_ID), TerrainDebugMode.MATERIAL_ID, 'material ID view should be selectable');
equal(rebuiltRockFloor.material.userData.rockUniforms.uRockDebugMode.value, 1, 'rock material should follow the shared material-ID debug mode');
equal(system.cycleDebugMode(), TerrainDebugMode.NORMAL_ONLY, 'terrain diagnostic view should cycle to normal-only');
equal(rebuiltRockFloor.material.userData.rockUniforms.uRockDebugMode.value, 2, 'rock material should expose its sampled normal in normal-only mode');
equal(system.cycleDebugMode(), TerrainDebugMode.WETNESS, 'terrain diagnostic view should cycle to the rain-wetness mask');
equal(rebuiltRockFloor.material.userData.rockUniforms.uRockDebugMode.value, 3, 'rock material should expose the shared wetness diagnostic');
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
