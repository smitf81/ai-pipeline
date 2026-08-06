import { getTerrainDef } from '../world/terrain.js';
import { TerrainType } from '../world/terrain.js';
import { MaterialFamily } from '../data/materialProfiles.js';
import { buildTerrainBlobMasks } from '../terrain/blobRules.js';
import { CONNECTED_RULE_MODEL } from '../terrain/connectedRules.js';
import { createTerrainTileSplineSegment } from '../terrain/spline.js';
import { buildMaterialProjection, buildTerrainMaterialState } from './materialProjection.js';

const CONNECTED_TERRAIN_TYPES = Object.freeze([TerrainType.GRASS, TerrainType.DIRT]);

export function buildTerrainProjection(map, tileSize) {
  if (!map) {
    return {
      tileSize,
      mapWidth: 0,
      mapHeight: 0,
      worldWidth: 0,
      worldHeight: 0,
      mapId: null,
      revision: 0,
      detailExclusionZones: [],
      connectedRuleModel: CONNECTED_RULE_MODEL,
      connectedRuleTypes: [...CONNECTED_TERRAIN_TYPES],
      connectedRuleTileCount: 0,
      tiles: []
    };
  }
  const tiles = [];
  const connectedRules = buildConnectedRuleLookup(map);
  let connectedRuleTileCount = 0;
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const type = map.tiles[y][x];
      const terrain = getTerrainDef(type);
      const connectedRule = connectedRules.get(tileRuleKey(type, x, y)) ?? null;
      const terrainSpline = connectedRule
        ? createTerrainTileSplineSegment({ tile: { x, y }, type, rule: connectedRule })
        : null;
      if (connectedRule) connectedRuleTileCount += 1;
      tiles.push({
        classification: 'renderer_neutral_terrain_tile_projection',
        x,
        y,
        worldX: x * tileSize,
        worldY: y * tileSize,
        width: tileSize,
        height: tileSize,
        type,
        colour: terrain.colour,
        materialProfileId: terrain.materialProfileId,
        material: buildMaterialProjection(terrain.materialProfileId, {
          family: MaterialFamily.TERRAIN,
          state: buildTerrainMaterialState(type, terrain),
          source: { kind: 'terrainTile', type, x, y }
        }),
        obscures: !!terrain.obscures,
        blocks: !!terrain.blocks,
        connectedRule,
        terrainSpline
      });
    }
  }
  return {
    classification: 'renderer_neutral_terrain_projection',
    tileSize,
    mapWidth: map.width,
    mapHeight: map.height,
    worldWidth: map.width * tileSize,
    worldHeight: map.height * tileSize,
    mapId: map.id ?? null,
    revision: map.revision ?? 0,
    detailExclusionZones: buildDetailExclusionZones(map),
    connectedRuleModel: CONNECTED_RULE_MODEL,
    connectedRuleTypes: [...CONNECTED_TERRAIN_TYPES],
    connectedRuleTileCount,
    tiles
  };
}

function buildDetailExclusionZones(map) {
  const zones = [];
  if (Number.isFinite(Number(map.spawn?.x)) && Number.isFinite(Number(map.spawn?.y))) {
    zones.push({
      kind: 'circle',
      source: 'map_spawn',
      x: Number(map.spawn.x) + 0.5,
      y: Number(map.spawn.y) + 0.5,
      radiusTiles: 1.55
    });
  }
  if (map.escapeZone) {
    zones.push({
      kind: 'rect',
      source: 'map_escape_zone',
      x: Number(map.escapeZone.x),
      y: Number(map.escapeZone.y),
      w: Number(map.escapeZone.w),
      h: Number(map.escapeZone.h),
      paddingTiles: 0.8
    });
  }
  return zones;
}

function buildConnectedRuleLookup(map) {
  const lookup = new Map();
  for (const type of CONNECTED_TERRAIN_TYPES) {
    const records = Array.isArray(map.blobMasks?.[type])
      ? map.blobMasks[type]
      : buildTerrainBlobMasks(map, type);
    for (const record of records) lookup.set(tileRuleKey(type, record.x, record.y), record.rule);
  }
  return lookup;
}

function tileRuleKey(type, x, y) {
  return `${type}:${x},${y}`;
}
