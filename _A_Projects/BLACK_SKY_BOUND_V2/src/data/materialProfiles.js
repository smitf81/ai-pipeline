export const MaterialFamily = Object.freeze({
  ENTITY: 'entity',
  SCENE_OBJECT: 'sceneObject',
  TERRAIN: 'terrain',
  EFFECT: 'effect',
  DEBUG: 'debug'
});

export const MaterialProfileId = Object.freeze({
  SCALE_WYVERN_COPPER: 'scale_wyvern_copper',
  CLOTH_RAIDER: 'cloth_raider',
  LEATHER_RAIDER: 'leather_raider',
  SKIN_HUMAN: 'skin_human',
  WOOD_WEAPON: 'wood_weapon',
  METAL_IRON: 'metal_iron',
  FIRE_CARRIED: 'fire_carried',
  FLESH_HUSK: 'flesh_husk',
  FUR_WEREWOLF: 'fur_werewolf',
  WOOD_PINE: 'wood_pine',
  WOOD_BIRCH: 'wood_birch',
  WOOD_DEAD_SNAG: 'wood_dead_snag',
  STONE_MOSS: 'stone_moss',
  WALL_STONE: 'wall_stone',
  FOLIAGE_FERN: 'foliage_fern',
  FOLIAGE_SHRUB: 'foliage_shrub',
  FOREST_FLOOR_DECAL: 'forest_floor_decal',
  SOIL_GRASS: 'soil_grass',
  SOIL_DIRT: 'soil_dirt',
  FOREST_UNDERSTORY: 'forest_understory',
  WATER_DARK: 'water_dark',
  STONE_ROCK: 'stone_rock',
  SCORCHED_SOIL: 'scorched_soil',
  LAVA_EMISSIVE: 'lava_emissive',
  SMOKE_SOFT: 'smoke_soft',
  FIRE_GLOW: 'fire_glow',
  DEBUG_HIGHLIGHT: 'debug_highlight'
});

const DEFAULT_STATE = Object.freeze({
  damageAmount: 0,
  burnAmount: 0,
  wetness: 0,
  factionTint: null,
  nightReveal: 1,
  windSway: 0,
  density: 1,
  integrity: 1,
  selectionHighlight: 0
});

export const MATERIAL_PROFILES = Object.freeze({
  [MaterialProfileId.SCALE_WYVERN_COPPER]: profile(MaterialProfileId.SCALE_WYVERN_COPPER, MaterialFamily.ENTITY, 'entityMaterial.scale_organic_v0', '#5c2f25', { roughness: 0.78, nightReveal: 0.78, windSway: 0.04, tags: ['scale', 'organic', 'player'] }),
  [MaterialProfileId.CLOTH_RAIDER]: profile(MaterialProfileId.CLOTH_RAIDER, MaterialFamily.ENTITY, 'entityMaterial.cloth_skin_v0', '#7e5637', { roughness: 0.86, nightReveal: 0.72, tags: ['cloth', 'human'] }),
  [MaterialProfileId.LEATHER_RAIDER]: profile(MaterialProfileId.LEATHER_RAIDER, MaterialFamily.ENTITY, 'entityMaterial.leather_worn_v0', '#3b261c', { roughness: 0.82, nightReveal: 0.58, tags: ['leather', 'human', 'equipment'] }),
  [MaterialProfileId.SKIN_HUMAN]: profile(MaterialProfileId.SKIN_HUMAN, MaterialFamily.ENTITY, 'entityMaterial.skin_weathered_v0', '#a87352', { roughness: 0.72, nightReveal: 0.7, tags: ['skin', 'human'] }),
  [MaterialProfileId.WOOD_WEAPON]: profile(MaterialProfileId.WOOD_WEAPON, MaterialFamily.ENTITY, 'entityMaterial.wood_weapon_v0', '#60442e', { roughness: 0.88, nightReveal: 0.64, tags: ['wood', 'equipment'] }),
  [MaterialProfileId.METAL_IRON]: profile(MaterialProfileId.METAL_IRON, MaterialFamily.ENTITY, 'entityMaterial.metal_iron_v0', '#8a887f', { roughness: 0.58, metalness: 0.62, nightReveal: 0.8, tags: ['metal', 'equipment'] }),
  [MaterialProfileId.FIRE_CARRIED]: profile(MaterialProfileId.FIRE_CARRIED, MaterialFamily.ENTITY, 'entityMaterial.fire_carried_v0', '#ff8a32', { roughness: 0.28, emissive: '#ff6a1d', nightReveal: 1, tags: ['fire', 'emissive', 'equipment'] }),
  [MaterialProfileId.FLESH_HUSK]: profile(MaterialProfileId.FLESH_HUSK, MaterialFamily.ENTITY, 'entityMaterial.flesh_desaturated_v0', '#b8b1a3', { roughness: 0.74, nightReveal: 0.64, tags: ['flesh', 'undead'] }),
  [MaterialProfileId.FUR_WEREWOLF]: profile(MaterialProfileId.FUR_WEREWOLF, MaterialFamily.ENTITY, 'entityMaterial.fur_dark_v0', '#564655', { roughness: 0.91, nightReveal: 0.58, windSway: 0.03, tags: ['fur', 'beast'] }),
  [MaterialProfileId.WOOD_PINE]: profile(MaterialProfileId.WOOD_PINE, MaterialFamily.SCENE_OBJECT, 'sceneObjectMaterial.wood_foliage_v0', '#3f2e1c', { roughness: 0.9, nightReveal: 0.54, windSway: 0.18, density: 0.82, tags: ['wood', 'tree'] }),
  [MaterialProfileId.WOOD_BIRCH]: profile(MaterialProfileId.WOOD_BIRCH, MaterialFamily.SCENE_OBJECT, 'sceneObjectMaterial.wood_birch_foliage_v0', '#d8d0b8', { roughness: 0.88, nightReveal: 0.58, windSway: 0.2, density: 0.72, tags: ['wood', 'tree', 'birch'] }),
  [MaterialProfileId.WOOD_DEAD_SNAG]: profile(MaterialProfileId.WOOD_DEAD_SNAG, MaterialFamily.SCENE_OBJECT, 'sceneObjectMaterial.dead_wood_snag_v0', '#4a3326', { roughness: 0.94, nightReveal: 0.48, windSway: 0.04, density: 0.58, integrity: 0.72, tags: ['wood', 'snag', 'deadfall'] }),
  [MaterialProfileId.STONE_MOSS]: profile(MaterialProfileId.STONE_MOSS, MaterialFamily.SCENE_OBJECT, 'sceneObjectMaterial.stone_moss_v0', '#626a66', { roughness: 0.96, wetness: 0.08, nightReveal: 0.5, tags: ['stone', 'moss'] }),
  [MaterialProfileId.WALL_STONE]: profile(MaterialProfileId.WALL_STONE, MaterialFamily.SCENE_OBJECT, 'sceneObjectMaterial.wall_stone_v0', '#5b5f62', { roughness: 0.94, nightReveal: 0.48, tags: ['stone', 'wall'] }),
  [MaterialProfileId.FOLIAGE_FERN]: profile(MaterialProfileId.FOLIAGE_FERN, MaterialFamily.SCENE_OBJECT, 'sceneObjectMaterial.fern_frond_v0', '#24482f', { roughness: 0.9, wetness: 0.18, nightReveal: 0.48, windSway: 0.32, density: 0.62, tags: ['foliage', 'fern', 'undergrowth'] }),
  [MaterialProfileId.FOLIAGE_SHRUB]: profile(MaterialProfileId.FOLIAGE_SHRUB, MaterialFamily.SCENE_OBJECT, 'sceneObjectMaterial.shrub_leaf_cluster_v0', '#2d4d2d', { roughness: 0.91, wetness: 0.14, nightReveal: 0.46, windSway: 0.24, density: 0.7, tags: ['foliage', 'shrub', 'undergrowth'] }),
  [MaterialProfileId.FOREST_FLOOR_DECAL]: profile(MaterialProfileId.FOREST_FLOOR_DECAL, MaterialFamily.SCENE_OBJECT, 'sceneObjectMaterial.forest_floor_decal_v0', '#4b3826', { roughness: 0.97, wetness: 0.08, alpha: 0.82, nightReveal: 0.42, density: 0.34, tags: ['ground_decal', 'leaf_litter', 'roots'] }),
  [MaterialProfileId.SOIL_GRASS]: profile(MaterialProfileId.SOIL_GRASS, MaterialFamily.TERRAIN, 'terrainMaterial.soil_grass_layered_pbr_v1', '#314d2f', { roughness: 0.88, wetness: 0.12, nightReveal: 0.52, density: 0.44, windSway: 0.08, tags: ['soil', 'grass', 'layered_pbr'] }),
  [MaterialProfileId.SOIL_DIRT]: profile(MaterialProfileId.SOIL_DIRT, MaterialFamily.TERRAIN, 'terrainMaterial.soil_dirt_layered_pbr_v1', '#5b4732', { roughness: 0.92, wetness: 0.05, nightReveal: 0.5, density: 0.36, tags: ['soil', 'dirt', 'layered_pbr'] }),
  [MaterialProfileId.FOREST_UNDERSTORY]: profile(MaterialProfileId.FOREST_UNDERSTORY, MaterialFamily.TERRAIN, 'terrainMaterial.forest_understory_v0', '#162f21', { roughness: 0.93, wetness: 0.16, nightReveal: 0.42, density: 0.86, windSway: 0.14, tags: ['forest', 'foliage'] }),
  [MaterialProfileId.WATER_DARK]: profile(MaterialProfileId.WATER_DARK, MaterialFamily.TERRAIN, 'terrainMaterial.water_dark_v0', '#244c66', { roughness: 0.18, wetness: 1, nightReveal: 0.7, alpha: 0.94, tags: ['water'] }),
  [MaterialProfileId.STONE_ROCK]: profile(MaterialProfileId.STONE_ROCK, MaterialFamily.TERRAIN, 'terrainMaterial.stone_rock_v0', '#565a60', { roughness: 0.97, nightReveal: 0.48, density: 0.72, tags: ['stone', 'terrain'] }),
  [MaterialProfileId.SCORCHED_SOIL]: profile(MaterialProfileId.SCORCHED_SOIL, MaterialFamily.TERRAIN, 'terrainMaterial.scorched_soil_layered_pbr_v1', '#1d1b18', { roughness: 0.98, burnAmount: 0.86, nightReveal: 0.36, density: 0.42, tags: ['ash', 'burnt', 'layered_pbr'] }),
  [MaterialProfileId.LAVA_EMISSIVE]: profile(MaterialProfileId.LAVA_EMISSIVE, MaterialFamily.TERRAIN, 'terrainMaterial.lava_emissive_v0', '#b94a18', { roughness: 0.44, emissive: '#ff7a24', burnAmount: 1, nightReveal: 1, tags: ['lava', 'emissive'] }),
  [MaterialProfileId.SMOKE_SOFT]: profile(MaterialProfileId.SMOKE_SOFT, MaterialFamily.EFFECT, 'effectMaterial.smoke_soft_v0', '#8a8880', { roughness: 1, alpha: 0.46, density: 0.62, nightReveal: 0.78, tags: ['smoke', 'fog'] }),
  [MaterialProfileId.FIRE_GLOW]: profile(MaterialProfileId.FIRE_GLOW, MaterialFamily.EFFECT, 'effectMaterial.fire_glow_v0', '#ff8a2a', { roughness: 0.2, emissive: '#ffb35c', alpha: 0.92, burnAmount: 1, nightReveal: 1, tags: ['fire', 'emissive'] }),
  [MaterialProfileId.DEBUG_HIGHLIGHT]: profile(MaterialProfileId.DEBUG_HIGHLIGHT, MaterialFamily.DEBUG, 'debugMaterial.overlay_highlight_v0', '#78d6ff', { roughness: 0.5, emissive: '#78d6ff', alpha: 0.62, selectionHighlight: 1, tags: ['debug'] })
});

export const TERRAIN_MATERIAL_PROFILE_BY_TYPE = Object.freeze({
  grass: MaterialProfileId.SOIL_GRASS,
  dirt: MaterialProfileId.SOIL_DIRT,
  forest: MaterialProfileId.FOREST_UNDERSTORY,
  water: MaterialProfileId.WATER_DARK,
  rock: MaterialProfileId.STONE_ROCK,
  scorched: MaterialProfileId.SCORCHED_SOIL
});

export function getMaterialProfile(profileId) {
  const profile = MATERIAL_PROFILES[profileId];
  if (!profile) throw new Error(`Unknown material profile: ${profileId}`);
  return profile;
}

export function getTerrainMaterialProfileId(type) {
  return TERRAIN_MATERIAL_PROFILE_BY_TYPE[type] ?? MaterialProfileId.SOIL_GRASS;
}

function profile(id, family, shaderVariant, baseColour, options = {}) {
  const { roughness = 0.8, metalness = 0, emissive = '#000000', alpha = 1, tags = [], ...state } = options;
  return Object.freeze({
    id,
    classification: 'material_profile',
    contract: 'black-sky-bound.material-profile.v0',
    family,
    shaderVariant,
    uniforms: Object.freeze({ baseColour, roughness, metalness, emissive, alpha }),
    stateDefaults: Object.freeze({ ...DEFAULT_STATE, ...state }),
    tags: Object.freeze([...tags])
  });
}
