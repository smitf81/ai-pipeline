import { getTerrainMaterialProfileId } from '../data/materialProfiles.js';

export const TerrainType = Object.freeze({
  GRASS: 'grass',
  DIRT: 'dirt',
  FOREST: 'forest',
  WATER: 'water',
  ROCK: 'rock',
  SCORCHED: 'scorched'
});

export const TERRAIN = Object.freeze({
  [TerrainType.GRASS]: terrainDef(TerrainType.GRASS, 'Grass', '#314d2f', 1, false),
  [TerrainType.DIRT]: terrainDef(TerrainType.DIRT, 'Dirt', '#5b4732', 1, false),
  [TerrainType.FOREST]: terrainDef(TerrainType.FOREST, 'Forest', '#162f21', 1.25, false, { obscures: true }),
  [TerrainType.WATER]: terrainDef(TerrainType.WATER, 'Water', '#244c66', 2.6, false),
  [TerrainType.ROCK]: terrainDef(TerrainType.ROCK, 'Rock', '#565a60', 1, true),
  [TerrainType.SCORCHED]: terrainDef(TerrainType.SCORCHED, 'Scorched', '#1d1b18', 1.05, false)
});

export function getTerrainDef(type) {
  return TERRAIN[type] ?? TERRAIN[TerrainType.GRASS];
}

export function isTileBlocked(type) {
  return getTerrainDef(type).blocks;
}

function terrainDef(type, label, colour, moveCost, blocks, extra = {}) {
  return { label, colour, moveCost, blocks, materialProfileId: getTerrainMaterialProfileId(type), ...extra };
}
