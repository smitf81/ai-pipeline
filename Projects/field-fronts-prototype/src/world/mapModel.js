import { TERRAIN_ORDER, getTerrain, isTerrainId } from '../config/terrain.js';

export const DEFAULT_MAP_SIZE = { width: 48, height: 32 };
const ELEVATION_VERSION = 1;

export function createBlankMap({ width = DEFAULT_MAP_SIZE.width, height = DEFAULT_MAP_SIZE.height, fill = 'land' } = {}) {
  const safeFill = isTerrainId(fill) ? fill : 'land';
  const map = {
    version: 1,
    revision: 0,
    width,
    height,
    tiles: Array.from({ length: height }, () => Array.from({ length: width }, () => safeFill)),
    provenance: {
      source: 'field-fronts-mapshop',
      createdAt: new Date().toISOString()
    }
  };
  map.elevation = createElevationMap(map);
  map.elevationVersion = ELEVATION_VERSION;
  return map;
}

export function createDefaultMap() {
  const map = createBlankMap({});

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      if (x < 4 || y < 3 || x > map.width - 5 || y > map.height - 4) {
        setTile(map, x, y, 'sea');
      } else if (Math.abs(y - (12 + Math.sin(x * 0.35) * 3)) < 1.3 && x > 5 && x < map.width - 6) {
        setTile(map, x, y, 'river');
      } else if ((x > 31 && y > 5 && y < 15) || (x > 8 && x < 15 && y > 21)) {
        setTile(map, x, y, 'mountains');
      } else if ((x > 8 && x < 18 && y > 6 && y < 14) || (x > 25 && x < 36 && y > 18 && y < 27)) {
        setTile(map, x, y, 'forest');
      }
    }
  }

  return map;
}

export function cloneMap(map) {
  return {
    ...map,
    tiles: map.tiles.map((row) => [...row]),
    elevation: normaliseElevationMap(map).map((row) => [...row]),
    elevationVersion: map.elevationVersion ?? ELEVATION_VERSION,
    provenance: { ...(map.provenance ?? {}) }
  };
}

export function isInBounds(map, x, y) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < map.width && y < map.height;
}

export function getTile(map, x, y) {
  if (!isInBounds(map, x, y)) {
    return null;
  }
  return map.tiles[y][x];
}

export function setTile(map, x, y, terrainId) {
  if (!isInBounds(map, x, y) || !isTerrainId(terrainId)) {
    return false;
  }
  map.tiles[y][x] = terrainId;
  if (!map.elevation) {
    map.elevation = createElevationMap(map);
  }
  map.elevation[y][x] = estimateTileElevation(map, x, y, terrainId);
  map.revision = (map.revision ?? 0) + 1;
  return true;
}

export function setElevation(map, x, y, value) {
  if (!isInBounds(map, x, y)) {
    return false;
  }
  if (!map.elevation) {
    map.elevation = createElevationMap(map);
  }
  map.elevation[y][x] = clamp01(value);
  map.revision = (map.revision ?? 0) + 1;
  return true;
}

export function getElevation(map, x, y) {
  if (!isInBounds(map, x, y)) {
    return 0;
  }
  const elevation = normaliseElevationMap(map);
  return elevation[y][x];
}

export function serializeMap(map) {
  return JSON.stringify({
    ...cloneMap(map),
    exportedAt: new Date().toISOString(),
    terrain: TERRAIN_ORDER.map((id) => getTerrain(id))
  }, null, 2);
}

export function deserializeMap(json) {
  const parsed = typeof json === 'string' ? JSON.parse(json) : json;
  const width = Number(parsed.width);
  const height = Number(parsed.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 4 || height < 4) {
    throw new Error('Map dimensions are invalid.');
  }
  if (!Array.isArray(parsed.tiles) || parsed.tiles.length !== height) {
    throw new Error('Map tile rows are invalid.');
  }

  const map = createBlankMap({ width, height });
  map.tiles = parsed.tiles.map((row) => {
    if (!Array.isArray(row) || row.length !== width) {
      throw new Error('Map tile columns are invalid.');
    }
    return row.map((terrainId) => {
      if (!isTerrainId(terrainId)) {
        throw new Error(`Unknown terrain id: ${terrainId}`);
      }
      return terrainId;
    });
  });
  map.provenance = {
    ...(parsed.provenance ?? {}),
    importedAt: new Date().toISOString()
  };
  map.elevation = normaliseElevationMap({ ...map, elevation: parsed.elevation });
  map.elevationVersion = Number.isInteger(parsed.elevationVersion) ? parsed.elevationVersion : ELEVATION_VERSION;
  map.revision = Number.isInteger(parsed.revision) ? parsed.revision : 0;
  return map;
}

export function summarizeTerrain(map) {
  const counts = Object.fromEntries(TERRAIN_ORDER.map((id) => [id, 0]));
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      counts[getTile(map, x, y)] += 1;
    }
  }
  return counts;
}

export function summarizeElevation(map) {
  const elevation = normaliseElevationMap(map);
  let min = 1;
  let max = 0;
  let sum = 0;
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const value = elevation[y][x];
      min = Math.min(min, value);
      max = Math.max(max, value);
      sum += value;
    }
  }
  return {
    min: round3(min),
    max: round3(max),
    average: round3(sum / Math.max(1, map.width * map.height))
  };
}

export function normaliseElevationMap(map) {
  if (
    Array.isArray(map.elevation)
    && map.elevation.length === map.height
    && map.elevation.every((row) => Array.isArray(row) && row.length === map.width)
  ) {
    return map.elevation;
  }
  return createElevationMap(map);
}

export function createElevationMap(map) {
  return Array.from({ length: map.height }, (_, y) =>
    Array.from({ length: map.width }, (_, x) => estimateTileElevation(map, x, y, getTile(map, x, y)))
  );
}

function estimateTileElevation(map, x, y, terrainId) {
  const terrain = getTerrain(terrainId);
  const nx = x / Math.max(1, map.width - 1);
  const ny = y / Math.max(1, map.height - 1);
  const continent = (
    Math.sin((nx * 2.4 + ny * 0.72) * Math.PI)
    + Math.sin((nx * -1.5 + ny * 2.1 + 0.34) * Math.PI)
  ) * 0.08;
  const ridge = Math.max(0, Math.sin((nx * 5.2 - ny * 3.8 + 0.22) * Math.PI)) * 0.12;
  const variation = terrainNoise(x, y) * 0.14 - 0.07;
  const base = terrain.field.height;
  if (terrain.id === 'sea') return clamp01(0.02 + variation * 0.18);
  if (terrain.id === 'river') return clamp01(0.08 + variation * 0.18);
  if (terrain.id === 'mountains') return clamp01(base + ridge + variation * 0.45);
  if (terrain.id === 'forest') return clamp01(base + continent * 0.55 + variation * 0.55);
  return clamp01(base + continent + variation);
}

function terrainNoise(x, y) {
  const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}
