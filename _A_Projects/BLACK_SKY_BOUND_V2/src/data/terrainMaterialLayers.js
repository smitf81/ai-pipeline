import { MaterialProfileId } from './materialProfiles.js';

export const TERRAIN_MATERIAL_LAYER_CONTRACT = 'black-sky-bound.terrain-material-layer.v1';
export const TERRAIN_PBR_TEXTURE_CONTRACT = 'black-sky-bound.procedural-seamless-pbr-texture-array.v1';

export const TERRAIN_MATERIAL_LAYERS = Object.freeze([
  layer({
    index: 0,
    id: 'dark_wild_grass',
    terrainType: 'grass',
    materialProfileId: MaterialProfileId.SOIL_GRASS,
    baseColourSrgb: [37, 57, 34],
    secondaryColourSrgb: [23, 34, 23],
    roughness: 0.84,
    roughnessVariation: 0.09,
    ambientOcclusion: 0.9,
    heightStrength: 0.085,
    normalStrength: 2.15,
    textureWorldMeters: 1.6,
    tags: ['dark_soil', 'short_grass', 'wild']
  }),
  layer({
    index: 1,
    id: 'compacted_dirt_path',
    terrainType: 'dirt',
    materialProfileId: MaterialProfileId.SOIL_DIRT,
    baseColourSrgb: [84, 68, 52],
    secondaryColourSrgb: [51, 41, 32],
    roughness: 0.88,
    roughnessVariation: 0.065,
    ambientOcclusion: 0.92,
    heightStrength: 0.06,
    normalStrength: 1.7,
    textureWorldMeters: 1.6,
    tags: ['soil', 'compacted', 'path']
  }),
  layer({
    index: 2,
    id: 'scorched_earth',
    terrainType: 'scorched',
    materialProfileId: MaterialProfileId.SCORCHED_SOIL,
    baseColourSrgb: [47, 40, 34],
    secondaryColourSrgb: [20, 18, 17],
    roughness: 0.94,
    roughnessVariation: 0.04,
    ambientOcclusion: 0.84,
    heightStrength: 0.062,
    normalStrength: 1.95,
    textureWorldMeters: 1.6,
    tags: ['ash', 'char', 'burnt_soil']
  })
]);

export const TERRAIN_DETAIL_TUNING = Object.freeze({
  contract: 'black-sky-bound.ground-detail-tuning.v1',
  defaultEnabled: true,
  defaultDensity: 0.36,
  minDensity: 0,
  maxDensity: 1.5,
  candidatesPerGrassTile: 2,
  cullDistanceMeters: 7.5,
  minCullDistanceMeters: 2,
  maxCullDistanceMeters: 18,
  cullCellMeters: 1,
  occupiedClearanceTiles: 0.42,
  naturalFeatureInnerClearanceTiles: 0.48,
  naturalFeatureOuterBiasTiles: 2.1,
  naturalFeatureDensityMultiplier: 1.42,
  forestRockBoundaryDensityMultiplier: 1.28,
  travelledBoundaryDensityMultiplier: 0.32,
  travelledBoundaryClearanceTiles: 0.26,
  spawnClearanceTiles: 1.55,
  escapeClearanceTiles: 0.8,
  bladeTrianglesPerInstance: 30,
  sourcePolicy: 'deterministic_hash_from_map_identity_tile_and_candidate_v1'
});

const BY_PROFILE = new Map(TERRAIN_MATERIAL_LAYERS.map((entry) => [entry.materialProfileId, entry]));
const BY_TYPE = new Map(TERRAIN_MATERIAL_LAYERS.map((entry) => [entry.terrainType, entry]));

export function getTerrainMaterialLayerByProfileId(profileId) {
  const definition = BY_PROFILE.get(profileId);
  if (!definition) throw new Error(`terrain_material_layer_missing:${profileId ?? 'missing'}`);
  return definition;
}

export function findTerrainMaterialLayerByType(type) {
  return BY_TYPE.get(type) ?? null;
}

export function isLayeredTerrainType(type) {
  return BY_TYPE.has(type);
}

function layer(definition) {
  return Object.freeze({
    contract: TERRAIN_MATERIAL_LAYER_CONTRACT,
    textureContract: TERRAIN_PBR_TEXTURE_CONTRACT,
    texelDensityPolicy: 'shared_128px_layer_at_equal_world_scale',
    source: 'procedural_original_no_external_asset',
    licence: 'project_source_same_terms_no_external_licence',
    ...definition,
    baseColourSrgb: Object.freeze([...definition.baseColourSrgb]),
    secondaryColourSrgb: Object.freeze([...definition.secondaryColourSrgb]),
    tags: Object.freeze([...definition.tags])
  });
}
