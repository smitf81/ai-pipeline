import { ScenarioId, getScenario } from '../data/scenarios.js';
import { TerrainType } from './terrain.js';
import { createSceneObjects } from './sceneObjects.js';
import { paintTerrainBlob, buildTerrainBlobMasks } from '../terrain/blobRules.js';
import { RUNTIME_MAP_CONTRACT } from './runtimeMapContract.js';

export function createDemoMap(width = null, height = null, scenarioId = ScenarioId.FIRST_ESCAPE) {
  const scenario = getScenario(scenarioId);
  const mapWidth = width ?? scenario.map.width;
  const mapHeight = height ?? scenario.map.height;
  const tiles = Array.from({ length: mapHeight }, () => Array.from({ length: mapWidth }, () => TerrainType.GRASS));
  const map = {
    contract: RUNTIME_MAP_CONTRACT,
    id: scenario.id,
    scenarioId: scenario.id,
    width: mapWidth,
    height: mapHeight,
    tiles,
    revision: 0,
    spawn: { ...scenario.spawn },
    escapeZone: { ...scenario.escapeZone },
    enemySpawns: scenario.enemySpawns.map((spawn) => ({ ...spawn })),
    sceneObjects: createSceneObjects(scenario.sceneObjects ?? [])
  };

  applyRockBorder(map);
  for (const blob of scenario.terrainBlobs) paintTerrainBlob(map, blob);
  for (const run of scenario.waterRuns) paintLine(map, run.from, run.to, TerrainType.WATER);
  map.blobMasks = buildAllBlobMasks(map);
  return map;
}

function applyRockBorder(map) {
  for (let x = 0; x < map.width; x += 1) {
    map.tiles[0][x] = TerrainType.ROCK;
    map.tiles[map.height - 1][x] = TerrainType.ROCK;
  }
  for (let y = 0; y < map.height; y += 1) {
    map.tiles[y][0] = TerrainType.ROCK;
    map.tiles[y][map.width - 1] = TerrainType.ROCK;
  }
}

function paintLine(map, from, to, type) {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  let x = from.x;
  let y = from.y;
  while (true) {
    if (x >= 0 && y >= 0 && x < map.width && y < map.height) map.tiles[y][x] = type;
    if (x === to.x && y === to.y) break;
    if (x !== to.x) x += dx;
    if (y !== to.y) y += dy;
  }
}

export function buildAllBlobMasks(map) {
  return {
    grass: buildTerrainBlobMasks(map, TerrainType.GRASS),
    forest: buildTerrainBlobMasks(map, TerrainType.FOREST),
    dirt: buildTerrainBlobMasks(map, TerrainType.DIRT),
    scorched: buildTerrainBlobMasks(map, TerrainType.SCORCHED),
    water: buildTerrainBlobMasks(map, TerrainType.WATER)
  };
}

export function getTile(map, x, y) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  return map.tiles[y][x];
}

export function isInsideRect(point, rect) {
  return point.x >= rect.x && point.y >= rect.y && point.x < rect.x + rect.w && point.y < rect.y + rect.h;
}
