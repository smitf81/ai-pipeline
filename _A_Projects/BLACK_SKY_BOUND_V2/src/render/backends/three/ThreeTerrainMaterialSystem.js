import * as THREE from 'three';
import {
  TERRAIN_DETAIL_TUNING,
  TERRAIN_MATERIAL_LAYERS,
  findTerrainMaterialLayerByType,
  getTerrainMaterialLayerByProfileId,
  isLayeredTerrainType
} from '../../../data/terrainMaterialLayers.js';
import { createTerrainBlendMask } from './ThreeTerrainBlendMask.js';
import { ThreeGrassDetail } from './ThreeGrassDetail.js';
import { createTerrainPbrTextures } from './ThreeTerrainPbrTextures.js';

export const THREE_TERRAIN_MATERIAL_SYSTEM_CONTRACT = 'black-sky-bound.three-terrain-material-system.v1';
export const TerrainDebugMode = Object.freeze({ LIT: 'lit', MATERIAL_ID: 'material-id', NORMAL_ONLY: 'normal-only' });

const DEBUG_MODE_VALUE = Object.freeze({ [TerrainDebugMode.LIT]: 0, [TerrainDebugMode.MATERIAL_ID]: 1, [TerrainDebugMode.NORMAL_ONLY]: 2 });
const MATERIAL_ID_COLOURS = Object.freeze({
  grass: 0x2fbf71,
  dirt: 0xc98b45,
  scorched: 0xcc3f67,
  forest: 0x28654a,
  water: 0x438dcc,
  rock: 0x8a8f96
});

export class ThreeTerrainMaterialSystem {
  constructor(root, options = {}) {
    this.root = root;
    this.tileMeters = options.tileMeters;
    this.anisotropy = options.anisotropy ?? 1;
    this.search = options.search ?? '';
    this.debugMode = readDebugMode(this.search);
    this.group = new THREE.Group();
    this.group.name = 'terrain:material-system';
    const detailOptions = readDetailOptions(this.search);
    this.grassDetail = new ThreeGrassDetail({ tileMeters: this.tileMeters, ...detailOptions });
    this.group.add(this.grassDetail.group);
    this.root.add(this.group);
    this.pbrTextures = null;
    this.blendMask = null;
    this.resources = [];
    this.legacyMaterials = [];
    this.layeredMaterial = null;
    this.lastError = null;
    this.stats = emptyStats(this.debugMode);
  }

  rebuild(terrain, scenery = []) {
    this.clearSurfaces();
    if (this.group.parent !== this.root) this.root.add(this.group);
    const grouped = groupTiles(terrain?.tiles ?? []);
    const layeredTiles = (terrain?.tiles ?? []).filter((tile) => isLayeredTerrainType(tile.type));
    const legacyTypes = [...grouped.keys()].filter((type) => !isLayeredTerrainType(type));
    let layeredStatus = 'inactive';
    this.lastError = null;
    try {
      if (layeredTiles.length) {
        this.ensurePbrTextures();
        validateLayeredTiles(layeredTiles);
        this.blendMask = createTerrainBlendMask(terrain, new Map(TERRAIN_MATERIAL_LAYERS.map((entry) => [entry.terrainType, entry])));
        this.buildLayeredFloor(layeredTiles, terrain);
        layeredStatus = 'ready';
      }
    } catch (error) {
      this.lastError = String(error?.message || error);
      layeredStatus = 'error_visible_diagnostic';
      this.buildDiagnosticFloor(layeredTiles, this.lastError);
      console.error(`[BSB terrain] layered material failure: ${this.lastError}`);
    }
    for (const type of legacyTypes) this.buildLegacyTerrain(type, grouped.get(type));
    if (layeredStatus === 'ready') this.grassDetail.rebuild(terrain, scenery);
    else this.grassDetail.rebuild({ ...terrain, tiles: [], detailExclusionZones: [] }, []);
    this.grassDetail.setDebugVisible(false);
    this.applyLegacyDebugMode();
    this.stats = {
      contract: THREE_TERRAIN_MATERIAL_SYSTEM_CONTRACT,
      status: layeredStatus,
      error: this.lastError,
      debugMode: this.debugMode,
      layeredTypes: TERRAIN_MATERIAL_LAYERS.map((entry) => entry.terrainType),
      layeredTileCount: layeredTiles.length,
      legacyTileCount: (terrain?.tiles?.length ?? 0) - layeredTiles.length,
      layeredDrawBatches: layeredTiles.length ? 1 : 0,
      legacyDrawBatches: legacyTypes.length,
      heightPolicy: 'normal_detail_only_no_displacement',
      uvPolicy: 'continuous_world_space_equal_texel_density',
      repetitionPolicy: 'dual_rotated_micro_sample_plus_world_macro_colour_and_roughness',
      blendPolicy: this.blendMask?.contract ?? 'unavailable',
      texturePolicy: this.pbrTextures?.contract ?? 'unavailable',
      normalOrientation: this.pbrTextures?.normalOrientation ?? null,
      textureArraySize: this.pbrTextures ? `${this.pbrTextures.size}x${this.pbrTextures.size}x${this.pbrTextures.depth}` : null,
      textureCount: this.pbrTextures ? 3 : 0,
      blendMaskSize: this.blendMask ? `${this.blendMask.width}x${this.blendMask.height}` : null,
      blendedMaskPixels: this.blendMask?.blendedPixels ?? 0,
      contourDisplacedPixels: this.blendMask?.contourDisplacedPixels ?? 0,
      authoredCentreMismatches: this.blendMask?.authoredCentreMismatches ?? 0,
      blendEdgePolicy: this.blendMask?.edgePolicy ?? null,
      blendIdentityPolicy: this.blendMask?.identityPolicy ?? null,
      assetSource: this.pbrTextures?.source ?? null,
      assetLicence: this.pbrTextures?.licence ?? null,
      fallbackPolicy: 'explicit_magenta_diagnostic_never_flat_colour'
    };
  }

  ensurePbrTextures() {
    if (!this.pbrTextures) this.pbrTextures = createTerrainPbrTextures({ anisotropy: this.anisotropy });
  }

  buildLayeredFloor(tiles, terrain) {
    const geometry = new THREE.PlaneGeometry(this.tileMeters * 1.006, this.tileMeters * 1.006, 1, 1);
    geometry.rotateX(-Math.PI / 2);
    const layerValues = new Float32Array(tiles.length);
    const material = createLayeredMaterial({
      pbrTextures: this.pbrTextures,
      blendMask: this.blendMask,
      mapWidthMeters: terrain.mapWidth * this.tileMeters,
      mapHeightMeters: terrain.mapHeight * this.tileMeters,
      textureWorldMeters: TERRAIN_MATERIAL_LAYERS[0].textureWorldMeters,
      debugMode: this.debugMode
    });
    const mesh = new THREE.InstancedMesh(geometry, material, tiles.length);
    const matrix = new THREE.Matrix4();
    tiles.forEach((tile, index) => {
      const definition = getTerrainMaterialLayerByProfileId(tile.material?.profileId);
      layerValues[index] = definition.index;
      matrix.makeTranslation((tile.x + 0.5) * this.tileMeters, 0.026, (tile.y + 0.5) * this.tileMeters);
      mesh.setMatrixAt(index, matrix);
    });
    geometry.setAttribute('terrainLayer', new THREE.InstancedBufferAttribute(layerValues, 1));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.name = 'terrain:layered-floor:grass-dirt-scorched';
    mesh.userData.contract = THREE_TERRAIN_MATERIAL_SYSTEM_CONTRACT;
    mesh.userData.materialProfileIds = TERRAIN_MATERIAL_LAYERS.map((entry) => entry.materialProfileId);
    mesh.computeBoundingSphere();
    this.group.add(mesh);
    this.resources.push({ mesh, geometry, material, cameraOccluder: false, occlusionRole: 'terrain_ground' });
    this.layeredMaterial = material;
  }

  buildLegacyTerrain(type, tiles) {
    if (!tiles?.length) return;
    const blocked = tiles[0]?.blocks === true;
    const height = blocked ? 0.72 : type === 'water' ? 0.035 : 0.08;
    const geometry = new THREE.BoxGeometry(this.tileMeters * 1.015, height, this.tileMeters * 1.015);
    const sample = tiles[0];
    const material = new THREE.MeshStandardMaterial({
      color: sample.material?.uniforms?.baseColour ?? sample.colour,
      roughness: type === 'water' ? 0.22 : Number(sample.material?.uniforms?.roughness ?? 0.92),
      metalness: 0,
      flatShading: true
    });
    const baseColour = material.color.clone();
    const mesh = new THREE.InstancedMesh(geometry, material, tiles.length);
    const matrix = new THREE.Matrix4();
    tiles.forEach((tile, index) => {
      matrix.makeTranslation((tile.x + 0.5) * this.tileMeters, height * 0.5 - 0.055, (tile.y + 0.5) * this.tileMeters);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = blocked;
    mesh.receiveShadow = true;
    mesh.name = `terrain:${type}`;
    this.group.add(mesh);
    this.resources.push({ mesh, geometry, material, cameraOccluder: blocked, occlusionRole: blocked ? 'terrain_obstacle' : 'terrain_ground' });
    this.legacyMaterials.push({ type, material, baseColour, roughness: material.roughness });
  }

  buildDiagnosticFloor(tiles, error) {
    if (!tiles.length) return;
    const geometry = new THREE.PlaneGeometry(this.tileMeters * 0.98, this.tileMeters * 0.98);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ color: 0xff00cc, wireframe: true, side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(geometry, material, tiles.length);
    const matrix = new THREE.Matrix4();
    tiles.forEach((tile, index) => {
      matrix.makeTranslation((tile.x + 0.5) * this.tileMeters, 0.045, (tile.y + 0.5) * this.tileMeters);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.name = 'terrain:material-error-visible-diagnostic';
    mesh.userData.diagnostic = error;
    this.group.add(mesh);
    this.resources.push({ mesh, geometry, material, cameraOccluder: false, occlusionRole: 'terrain_diagnostic' });
  }

  updateView(view) { this.grassDetail.update(view?.cameraTarget); }

  cameraOcclusionObjects() {
    return this.resources
      .filter((resource) => resource.cameraOccluder === true)
      .map((resource) => ({ object: resource.mesh, role: resource.occlusionRole }));
  }

  setDebugMode(mode) {
    this.debugMode = normalizeDebugMode(mode);
    const uniform = this.layeredMaterial?.userData?.terrainUniforms?.uTerrainDebugMode;
    if (uniform) uniform.value = DEBUG_MODE_VALUE[this.debugMode];
    this.applyLegacyDebugMode();
    this.stats.debugMode = this.debugMode;
    return this.debugMode;
  }

  cycleDebugMode() {
    const modes = Object.values(TerrainDebugMode);
    return this.setDebugMode(modes[(modes.indexOf(this.debugMode) + 1) % modes.length]);
  }

  applyLegacyDebugMode() {
    for (const entry of this.legacyMaterials) {
      if (this.debugMode === TerrainDebugMode.LIT) {
        entry.material.color.copy(entry.baseColour);
        entry.material.emissive.set(0x000000);
        entry.material.emissiveIntensity = 0;
        entry.material.roughness = entry.roughness;
      } else {
        const colour = this.debugMode === TerrainDebugMode.MATERIAL_ID ? MATERIAL_ID_COLOURS[entry.type] ?? 0xff00cc : 0x8080ff;
        entry.material.color.setHex(colour);
        entry.material.emissive.setHex(colour);
        entry.material.emissiveIntensity = 0.28;
        entry.material.roughness = 1;
      }
      entry.material.needsUpdate = true;
    }
  }

  setGroundDetailEnabled(value) {
    this.grassDetail.setEnabled(value);
    return this.grassDetail.enabled;
  }

  toggleGroundDetail() { return this.setGroundDetailEnabled(!this.grassDetail.enabled); }
  setDebugVisible(value) { this.grassDetail.setDebugVisible(value); }

  diagnostics() {
    return { terrain: { ...this.stats }, grassDetail: this.grassDetail.diagnostics() };
  }

  clearSurfaces() {
    this.blendMask?.dispose();
    this.blendMask = null;
    for (const resource of this.resources) {
      resource.mesh.removeFromParent();
      resource.geometry.dispose();
      resource.material.dispose();
    }
    this.resources.length = 0;
    this.legacyMaterials.length = 0;
    this.layeredMaterial = null;
  }

  dispose() {
    this.clearSurfaces();
    this.pbrTextures?.dispose();
    this.pbrTextures = null;
    this.grassDetail.dispose();
    this.group.removeFromParent();
  }
}

function createLayeredMaterial(options) {
  const uniforms = {
    uTerrainBaseColour: { value: options.pbrTextures.baseColour },
    uTerrainNormal: { value: options.pbrTextures.normal },
    uTerrainSurface: { value: options.pbrTextures.surface },
    uTerrainBlendMask: { value: options.blendMask.texture },
    uTerrainMapMeters: { value: new THREE.Vector2(options.mapWidthMeters, options.mapHeightMeters) },
    uTerrainMicroScale: { value: 1 / options.textureWorldMeters },
    uTerrainDebugMode: { value: DEBUG_MODE_VALUE[options.debugMode] }
  };
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  material.name = 'terrain:layered-pbr-array-material';
  material.userData.terrainUniforms = uniforms;
  material.customProgramCacheKey = () => THREE_TERRAIN_MATERIAL_SYSTEM_CONTRACT;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float terrainLayer;
flat varying float vTerrainLayer;
varying vec3 vTerrainWorldPosition;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vTerrainLayer = terrainLayer;`)
      .replace('#include <project_vertex>', `vec4 terrainWorldPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
terrainWorldPosition = batchingMatrix * terrainWorldPosition;
#endif
#ifdef USE_INSTANCING
terrainWorldPosition = instanceMatrix * terrainWorldPosition;
#endif
vTerrainWorldPosition = ( modelMatrix * terrainWorldPosition ).xyz;
#include <project_vertex>`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
precision highp sampler2DArray;
uniform sampler2DArray uTerrainBaseColour;
uniform sampler2DArray uTerrainNormal;
uniform sampler2DArray uTerrainSurface;
uniform sampler2D uTerrainBlendMask;
uniform vec2 uTerrainMapMeters;
uniform float uTerrainMicroScale;
uniform int uTerrainDebugMode;
flat varying float vTerrainLayer;
varying vec3 vTerrainWorldPosition;

struct TerrainPbrSample {
  vec3 colour;
  vec3 tangentNormal;
  float roughness;
  float ao;
  float height;
  vec3 weights;
};

vec4 terrainArrayBlend( sampler2DArray source, vec2 uv, vec3 weights ) {
  return texture( source, vec3( uv, 0.0 ) ) * weights.r
    + texture( source, vec3( uv, 1.0 ) ) * weights.g
    + texture( source, vec3( uv, 2.0 ) ) * weights.b;
}

vec3 terrainSrgbToLinear( vec3 colour ) {
  bvec3 cutoff = lessThanEqual( colour, vec3( 0.04045 ) );
  vec3 low = colour / 12.92;
  vec3 high = pow( ( colour + 0.055 ) / 1.055, vec3( 2.4 ) );
  return mix( high, low, vec3( cutoff ) );
}

float terrainMacroNoise( vec2 worldPosition ) {
  float broad = sin( worldPosition.x * 0.47 + sin( worldPosition.y * 0.31 ) * 1.6 );
  float cross = cos( worldPosition.y * 0.37 - sin( worldPosition.x * 0.19 ) * 2.0 );
  float diagonal = sin( worldPosition.x * 0.13 + worldPosition.y * 0.17 + cross );
  return clamp( broad * 0.24 + cross * 0.19 + diagonal * 0.13 + 0.5, 0.0, 1.0 );
}

TerrainPbrSample sampleTerrainPbr( vec2 worldPosition ) {
  vec2 maskUv = clamp( worldPosition / uTerrainMapMeters, vec2( 0.0001 ), vec2( 0.9999 ) );
  vec3 weights = texture( uTerrainBlendMask, maskUv ).rgb;
  float weightSum = weights.r + weights.g + weights.b;
  if ( weightSum < 0.001 ) {
    weights = vec3( vTerrainLayer < 0.5 ? 1.0 : 0.0, vTerrainLayer >= 0.5 && vTerrainLayer < 1.5 ? 1.0 : 0.0, vTerrainLayer >= 1.5 ? 1.0 : 0.0 );
  } else {
    weights /= weightSum;
  }
  vec2 microUv = worldPosition * uTerrainMicroScale;
  mat2 rotated = mat2( 0.819152, -0.573576, 0.573576, 0.819152 );
  vec2 secondaryUv = rotated * microUv * 0.537 + vec2( 0.173, 0.419 );
  float macro = terrainMacroNoise( worldPosition );
  vec4 baseA = terrainArrayBlend( uTerrainBaseColour, microUv, weights );
  vec4 baseB = terrainArrayBlend( uTerrainBaseColour, secondaryUv, weights );
  vec4 normalA = terrainArrayBlend( uTerrainNormal, microUv, weights );
  vec4 normalB = terrainArrayBlend( uTerrainNormal, secondaryUv, weights );
  vec4 surfaceA = terrainArrayBlend( uTerrainSurface, microUv, weights );
  vec4 surfaceB = terrainArrayBlend( uTerrainSurface, secondaryUv, weights );
  float secondaryMix = 0.18 + macro * 0.12;
  TerrainPbrSample sampleValue;
  sampleValue.colour = terrainSrgbToLinear( mix( baseA.rgb, baseB.rgb, secondaryMix ) ) * mix( 0.94, 1.09, macro );
  sampleValue.tangentNormal = normalize( mix( normalA.rgb, normalB.rgb, secondaryMix * 0.7 ) * 2.0 - 1.0 );
  vec3 surfaceValue = mix( surfaceA.rgb, surfaceB.rgb, secondaryMix );
  sampleValue.roughness = clamp( surfaceValue.r + ( 0.5 - macro ) * 0.09, 0.68, 1.0 );
  sampleValue.ao = clamp( surfaceValue.g, 0.68, 1.0 );
  sampleValue.height = surfaceValue.b;
  sampleValue.weights = weights;
  return sampleValue;
}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
TerrainPbrSample terrainPbr = sampleTerrainPbr( vTerrainWorldPosition.xz );
diffuseColor.rgb = terrainPbr.colour;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = terrainPbr.roughness;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
vec3 terrainWorldNormal = normalize( vec3( terrainPbr.tangentNormal.x, max( 0.08, terrainPbr.tangentNormal.z ), terrainPbr.tangentNormal.y ) );
normal = normalize( mat3( viewMatrix ) * terrainWorldNormal );`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
reflectedLight.indirectDiffuse *= terrainPbr.ao;
reflectedLight.indirectSpecular *= terrainPbr.ao;`)
      .replace('#include <opaque_fragment>', `if ( uTerrainDebugMode == 1 ) {
  outgoingLight = terrainPbr.weights.r * vec3( 0.08, 0.72, 0.28 ) + terrainPbr.weights.g * vec3( 0.72, 0.31, 0.08 ) + terrainPbr.weights.b * vec3( 0.74, 0.06, 0.28 );
} else if ( uTerrainDebugMode == 2 ) {
  outgoingLight = terrainPbr.tangentNormal * 0.5 + 0.5;
}
#include <opaque_fragment>`);
  };
  return material;
}

function validateLayeredTiles(tiles) {
  for (const tile of tiles) {
    const definition = getTerrainMaterialLayerByProfileId(tile.material?.profileId);
    if (definition.terrainType !== tile.type) {
      throw new Error(`terrain_material_profile_mismatch:${tile.type}:${tile.material?.profileId}:${definition.terrainType}`);
    }
  }
  const worldScales = new Set(TERRAIN_MATERIAL_LAYERS.map((entry) => entry.textureWorldMeters));
  if (worldScales.size !== 1) throw new Error('terrain_material_texel_density_mismatch');
}

function groupTiles(tiles) {
  const grouped = new Map();
  for (const tile of tiles) {
    if (!grouped.has(tile.type)) grouped.set(tile.type, []);
    grouped.get(tile.type).push(tile);
  }
  return grouped;
}

function readDetailOptions(search) {
  const params = new URLSearchParams(search);
  const enabledValue = params.get('groundDetail');
  const enabled = enabledValue == null ? TERRAIN_DETAIL_TUNING.defaultEnabled : !['0', 'off', 'false'].includes(enabledValue.toLowerCase());
  return {
    enabled,
    density: finiteParam(params.get('groundDetailDensity'), TERRAIN_DETAIL_TUNING.defaultDensity),
    cullDistanceMeters: finiteParam(params.get('groundDetailDistance'), TERRAIN_DETAIL_TUNING.cullDistanceMeters)
  };
}

function readDebugMode(search) { return normalizeDebugMode(new URLSearchParams(search).get('terrainView')); }
function normalizeDebugMode(mode) { return Object.values(TerrainDebugMode).includes(mode) ? mode : TerrainDebugMode.LIT; }
function finiteParam(value, fallback) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function emptyStats(debugMode) {
  return {
    contract: THREE_TERRAIN_MATERIAL_SYSTEM_CONTRACT,
    status: 'unbuilt',
    error: null,
    debugMode,
    layeredTileCount: 0,
    legacyTileCount: 0,
    fallbackPolicy: 'explicit_magenta_diagnostic_never_flat_colour'
  };
}
