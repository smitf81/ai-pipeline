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
import { createRockTerrainMaterial } from './ThreeRockTerrainMaterial.js';
import { createGrassTerrainPbrTextures } from './ThreeGrassTerrainPbrTextures.js';
import { createMudTerrainPbrTextures } from './ThreeMudTerrainPbrTextures.js';
import { createLayeredTerrainMaterial } from './ThreeLayeredTerrainMaterial.js';
import { createWaterTerrainMaterial } from './ThreeWaterTerrainMaterial.js';
import { resolveTerrainRainWetness, TERRAIN_WETNESS_RESPONSE } from './ThreeTerrainWetness.js';

export const THREE_TERRAIN_MATERIAL_SYSTEM_CONTRACT = 'black-sky-bound.three-terrain-material-system.v1';
export const TerrainDebugMode = Object.freeze({ LIT: 'lit', MATERIAL_ID: 'material-id', NORMAL_ONLY: 'normal-only', WETNESS: 'wetness' });

const DEBUG_MODE_VALUE = Object.freeze({ [TerrainDebugMode.LIT]: 0, [TerrainDebugMode.MATERIAL_ID]: 1, [TerrainDebugMode.NORMAL_ONLY]: 2, [TerrainDebugMode.WETNESS]: 3 });
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
    this.chunkSizeTiles = Math.max(1, Math.round(options.chunkSizeTiles ?? 24));
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
    this.grassPbrTextures = null;
    this.mudPbrTextures = null;
    this.blendMask = null;
    this.resources = [];
    this.legacyMaterials = [];
    this.rockMaterialHandles = [];
    this.waterMaterialHandles = [];
    this.layeredMaterial = null;
    this.wetness = resolveTerrainRainWetness(null, 0);
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
    let layeredDrawBatches = 0;
    const legacyDrawBatches = new Map();
    this.lastError = null;
    try {
      if (layeredTiles.length) {
        this.ensurePbrTextures();
        this.ensureGrassPbrTextures();
        this.ensureMudPbrTextures();
        validateLayeredTiles(layeredTiles);
        this.blendMask = createTerrainBlendMask(terrain, new Map(TERRAIN_MATERIAL_LAYERS.map((entry) => [entry.terrainType, entry])));
        layeredDrawBatches = this.buildLayeredFloor(layeredTiles, terrain);
        layeredStatus = 'ready';
      }
    } catch (error) {
      this.lastError = String(error?.message || error);
      layeredStatus = 'error_visible_diagnostic';
      layeredDrawBatches = this.buildDiagnosticFloor(layeredTiles, this.lastError);
      console.error(`[BSB terrain] layered material failure: ${this.lastError}`);
    }
    for (const type of legacyTypes) legacyDrawBatches.set(type, this.buildLegacyTerrain(type, grouped.get(type)));
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
      layeredDrawBatches,
      legacyDrawBatches: [...legacyDrawBatches.values()].reduce((sum, count) => sum + count, 0),
      chunkSizeTiles: this.chunkSizeTiles,
      terrainChunkCount: this.resources.length,
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
      authoredGrassTextureCount: this.grassPbrTextures ? 4 : 0,
      authoredMudTextureCount: this.mudPbrTextures ? 4 : 0,
      rockTileCount: grouped.get('rock')?.length ?? 0,
      rockDrawBatches: legacyDrawBatches.get('rock') ?? 0,
      waterTileCount: grouped.get('water')?.length ?? 0,
      waterDrawBatches: legacyDrawBatches.get('water') ?? 0,
      wetnessContract: this.wetness.contract,
      fallbackPolicy: 'explicit_magenta_diagnostic_never_flat_colour'
    };
  }

  ensurePbrTextures() {
    if (!this.pbrTextures) this.pbrTextures = createTerrainPbrTextures({ anisotropy: this.anisotropy });
  }

  ensureGrassPbrTextures() {
    if (!this.grassPbrTextures) this.grassPbrTextures = createGrassTerrainPbrTextures({ anisotropy: this.anisotropy });
  }

  ensureMudPbrTextures() { if (!this.mudPbrTextures) this.mudPbrTextures = createMudTerrainPbrTextures({ anisotropy: this.anisotropy }); }

  buildLayeredFloor(tiles, terrain) {
    const material = createLayeredTerrainMaterial({
      pbrTextures: this.pbrTextures,
      grassPbrTextures: this.grassPbrTextures,
      mudPbrTextures: this.mudPbrTextures,
      blendMask: this.blendMask,
      mapWidthMeters: terrain.mapWidth * this.tileMeters,
      mapHeightMeters: terrain.mapHeight * this.tileMeters,
      textureWorldMeters: TERRAIN_MATERIAL_LAYERS[0].textureWorldMeters,
      debugModeValue: DEBUG_MODE_VALUE[this.debugMode]
    });
    this.layeredMaterial = material;
    const chunks = groupTilesIntoSpatialChunks(tiles, this.chunkSizeTiles);
    chunks.forEach(({ key, tiles: chunkTiles }, chunkIndex) => {
      const geometry = new THREE.PlaneGeometry(this.tileMeters * 1.006, this.tileMeters * 1.006, 1, 1);
      geometry.rotateX(-Math.PI / 2);
      const layerValues = new Float32Array(chunkTiles.length);
      const mesh = new THREE.InstancedMesh(geometry, material, chunkTiles.length);
      const matrix = new THREE.Matrix4();
      chunkTiles.forEach((tile, index) => {
        const definition = getTerrainMaterialLayerByProfileId(tile.material?.profileId);
        layerValues[index] = definition.index;
        matrix.makeTranslation((tile.x + 0.5) * this.tileMeters, 0.026, (tile.y + 0.5) * this.tileMeters);
        mesh.setMatrixAt(index, matrix);
      });
      geometry.setAttribute('terrainLayer', new THREE.InstancedBufferAttribute(layerValues, 1));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.name = chunkIndex === 0 ? 'terrain:layered-floor:grass-dirt-scorched' : `terrain:layered-floor:grass-dirt-scorched:${key}`;
      mesh.userData.contract = THREE_TERRAIN_MATERIAL_SYSTEM_CONTRACT;
      mesh.userData.materialProfileIds = TERRAIN_MATERIAL_LAYERS.map((entry) => entry.materialProfileId);
      installChunkBounds(mesh);
      this.group.add(mesh);
      this.resources.push({ mesh, geometry, material, cameraOccluder: false, occlusionRole: 'terrain_ground', renderEnvelopeKind: 'terrain' });
    });
    return chunks.length;
  }

  buildLegacyTerrain(type, tiles) {
    if (!tiles?.length) return;
    if (type === 'water') {
      return this.buildWaterTerrain(tiles);
    }
    if (type === 'rock') {
      return this.buildRockTerrain(tiles);
    }
    const blocked = tiles[0]?.blocks === true;
    const height = blocked ? 0.72 : 0.08;
    const geometry = new THREE.BoxGeometry(this.tileMeters * 1.015, height, this.tileMeters * 1.015);
    const sample = tiles[0];
    const material = new THREE.MeshStandardMaterial({
      color: sample.material?.uniforms?.baseColour ?? sample.colour,
      roughness: Number(sample.material?.uniforms?.roughness ?? 0.92),
      metalness: 0,
      flatShading: true
    });
    const baseColour = material.color.clone();
    const chunks = groupTilesIntoSpatialChunks(tiles, this.chunkSizeTiles);
    chunks.forEach(({ key, tiles: chunkTiles }, chunkIndex) => {
      const mesh = createTerrainChunkMesh(geometry, material, chunkTiles, this.tileMeters, height);
      mesh.castShadow = blocked;
      mesh.receiveShadow = true;
      mesh.name = chunkIndex === 0 ? `terrain:${type}` : `terrain:${type}:${key}`;
      this.group.add(mesh);
      this.resources.push({ mesh, geometry, material, cameraOccluder: blocked, occlusionRole: blocked ? 'terrain_obstacle' : 'terrain_ground', renderEnvelopeKind: 'terrain' });
    });
    this.legacyMaterials.push({ type, material, baseColour, roughness: material.roughness });
    return chunks.length;
  }

  buildWaterTerrain(tiles) {
    const height = 0.035;
    const geometry = new THREE.BoxGeometry(this.tileMeters * 1.015, height, this.tileMeters * 1.015);
    const handle = createWaterTerrainMaterial({ debugMode: DEBUG_MODE_VALUE[this.debugMode] });
    handle.setRain(this.wetness);
    const chunks = groupTilesIntoSpatialChunks(tiles, this.chunkSizeTiles);
    chunks.forEach(({ key, tiles: chunkTiles }, chunkIndex) => {
      const mesh = createTerrainChunkMesh(geometry, handle.material, chunkTiles, this.tileMeters, height);
      mesh.receiveShadow = true;
      mesh.name = chunkIndex === 0 ? 'terrain:water:reflective' : `terrain:water:reflective:${key}`;
      mesh.userData.contract = THREE_TERRAIN_MATERIAL_SYSTEM_CONTRACT;
      mesh.userData.materialContract = handle.state.contract;
      this.group.add(mesh);
      this.resources.push({ mesh, geometry, material: handle.material, cameraOccluder: false, occlusionRole: 'terrain_ground', renderEnvelopeKind: 'terrain' });
    });
    this.waterMaterialHandles.push(handle);
    return chunks.length;
  }

  buildRockTerrain(tiles) {
    const height = 0.72;
    const geometry = new THREE.BoxGeometry(this.tileMeters * 1.015, height, this.tileMeters * 1.015);
    const handle = createRockTerrainMaterial({
      anisotropy: this.anisotropy,
      debugMode: DEBUG_MODE_VALUE[this.debugMode]
    });
    const chunks = groupTilesIntoSpatialChunks(tiles, this.chunkSizeTiles);
    chunks.forEach(({ key, tiles: chunkTiles }, chunkIndex) => {
      const mesh = createTerrainChunkMesh(geometry, handle.material, chunkTiles, this.tileMeters, height);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = chunkIndex === 0 ? 'terrain:rock:pbr' : `terrain:rock:pbr:${key}`;
      mesh.userData.contract = THREE_TERRAIN_MATERIAL_SYSTEM_CONTRACT;
      mesh.userData.materialContract = handle.state.contract;
      this.group.add(mesh);
      this.resources.push({ mesh, geometry, material: handle.material, cameraOccluder: true, occlusionRole: 'terrain_obstacle', renderEnvelopeKind: 'terrain' });
    });
    this.rockMaterialHandles.push(handle);
    return chunks.length;
  }

  buildDiagnosticFloor(tiles, error) {
    if (!tiles.length) return;
    const geometry = new THREE.PlaneGeometry(this.tileMeters * 0.98, this.tileMeters * 0.98);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ color: 0xff00cc, wireframe: true, side: THREE.DoubleSide });
    const chunks = groupTilesIntoSpatialChunks(tiles, this.chunkSizeTiles);
    chunks.forEach(({ key, tiles: chunkTiles }, chunkIndex) => {
      const mesh = createTerrainChunkMesh(geometry, material, chunkTiles, this.tileMeters, 0.2, 0.045);
      mesh.name = chunkIndex === 0 ? 'terrain:material-error-visible-diagnostic' : `terrain:material-error-visible-diagnostic:${key}`;
      mesh.userData.diagnostic = error;
      this.group.add(mesh);
      this.resources.push({ mesh, geometry, material, cameraOccluder: false, occlusionRole: 'terrain_diagnostic', renderEnvelopeKind: 'terrain' });
    });
    return chunks.length;
  }

  updateView(view) { this.grassDetail.update(view?.cameraTarget); }

  updateWeather(packet, renderTime = 0) {
    this.wetness = resolveTerrainRainWetness(packet, renderTime);
    const uniforms = this.layeredMaterial?.userData?.terrainUniforms;
    if (uniforms) {
      uniforms.uRainWetness.value = this.wetness.rainIntensity;
      uniforms.uRainRenderTime.value = this.wetness.renderTime;
    }
    for (const handle of this.rockMaterialHandles) handle.setRain(this.wetness);
    for (const handle of this.waterMaterialHandles) handle.setRain(this.wetness);
    for (const entry of this.legacyMaterials) this.applyLegacyWetness(entry);
    return this.wetness;
  }

  cameraOcclusionObjects() {
    return this.resources
      .filter((resource) => resource.cameraOccluder === true)
      .map((resource) => ({ object: resource.mesh, role: resource.occlusionRole }));
  }

  renderEnvelopeObjects() {
    return this.resources.map((resource) => ({
      object: resource.mesh,
      id: resource.mesh.name,
      kind: resource.renderEnvelopeKind ?? 'terrain'
    }));
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
    for (const handle of this.rockMaterialHandles) handle.setDebugMode(DEBUG_MODE_VALUE[this.debugMode]);
    for (const handle of this.waterMaterialHandles) handle.setDebugMode(DEBUG_MODE_VALUE[this.debugMode]);
    for (const entry of this.legacyMaterials) {
      if (this.debugMode === TerrainDebugMode.LIT) {
        this.applyLegacyWetness(entry);
        entry.material.emissive.set(0x000000);
        entry.material.emissiveIntensity = 0;
      } else {
        const colour = this.debugMode === TerrainDebugMode.MATERIAL_ID
          ? MATERIAL_ID_COLOURS[entry.type] ?? 0xff00cc
          : this.debugMode === TerrainDebugMode.WETNESS ? 0x3fb8ff : 0x8080ff;
        entry.material.color.setHex(colour);
        entry.material.emissive.setHex(colour);
        entry.material.emissiveIntensity = 0.28;
        entry.material.roughness = 1;
      }
      entry.material.needsUpdate = true;
    }
  }

  applyLegacyWetness(entry) {
    const response = TERRAIN_WETNESS_RESPONSE[entry.type] ?? TERRAIN_WETNESS_RESPONSE.forest;
    const amount = this.wetness.rainIntensity * response.response;
    entry.material.color.copy(entry.baseColour).multiplyScalar(THREE.MathUtils.lerp(1, response.darken, amount));
    entry.material.roughness = THREE.MathUtils.lerp(entry.roughness, response.wetRoughness, amount);
  }

  setGroundDetailEnabled(value) {
    this.grassDetail.setEnabled(value);
    return this.grassDetail.enabled;
  }

  toggleGroundDetail() { return this.setGroundDetailEnabled(!this.grassDetail.enabled); }
  setDebugVisible(value) { this.grassDetail.setDebugVisible(value); }

  diagnostics() {
    const rockMaterial = this.rockMaterialHandles[0]?.state ?? null;
    const waterMaterial = this.waterMaterialHandles[0]?.state ?? null;
    const grassMaterial = this.grassPbrTextures?.state ?? null;
    const mudMaterial = this.mudPbrTextures?.state ?? null;
    return {
      terrain: {
        ...this.stats,
        grassMaterial: grassMaterial ? { ...grassMaterial, errors: [...grassMaterial.errors] } : null,
        mudMaterial: mudMaterial ? { ...mudMaterial, errors: [...mudMaterial.errors] } : null,
        rockMaterial: rockMaterial ? { ...rockMaterial, errors: [...rockMaterial.errors] } : null,
        waterMaterial: waterMaterial ? { ...waterMaterial, errors: [...waterMaterial.errors] } : null,
        wetness: this.wetness
      },
      grassDetail: this.grassDetail.diagnostics()
    };
  }

  clearSurfaces() {
    this.blendMask?.dispose();
    this.blendMask = null;
    for (const handle of this.rockMaterialHandles) handle.disposeTextures();
    this.rockMaterialHandles.length = 0;
    this.waterMaterialHandles.length = 0;
    const geometries = new Set();
    const materials = new Set();
    for (const resource of this.resources) {
      resource.mesh.removeFromParent();
      geometries.add(resource.geometry);
      materials.add(resource.material);
    }
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.resources.length = 0;
    this.legacyMaterials.length = 0;
    this.layeredMaterial = null;
  }

  dispose() {
    this.clearSurfaces();
    this.pbrTextures?.dispose();
    this.pbrTextures = null;
    this.grassPbrTextures?.dispose();
    this.grassPbrTextures = null;
    this.mudPbrTextures?.dispose();
    this.mudPbrTextures = null;
    this.grassDetail.dispose();
    this.group.removeFromParent();
  }
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

function groupTilesIntoSpatialChunks(tiles, chunkSizeTiles) {
  const groups = new Map();
  for (const tile of tiles) {
    const key = `${Math.floor(tile.x / chunkSizeTiles)}:${Math.floor(tile.y / chunkSizeTiles)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tile);
  }
  return [...groups.entries()].map(([key, chunkTiles]) => ({ key, tiles: chunkTiles }));
}

function createTerrainChunkMesh(geometry, material, tiles, tileMeters, height, y = height * 0.5 - 0.055) {
  const mesh = new THREE.InstancedMesh(geometry, material, tiles.length);
  const matrix = new THREE.Matrix4();
  tiles.forEach((tile, index) => {
    matrix.makeTranslation((tile.x + 0.5) * tileMeters, y, (tile.y + 0.5) * tileMeters);
    mesh.setMatrixAt(index, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  installChunkBounds(mesh);
  return mesh;
}

function installChunkBounds(mesh) {
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  mesh.frustumCulled = true;
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
