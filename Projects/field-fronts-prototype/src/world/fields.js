import { FIELD_OVERLAYS, getTerrain } from '../config/terrain.js';
import { getElevation, getTile } from './mapModel.js';

export function createField(width, height, defaultValue = 0) {
  return {
    width,
    height,
    values: Array.from({ length: height }, () => Array.from({ length: width }, () => defaultValue))
  };
}

export function deriveTerrainFields(map) {
  const fields = Object.fromEntries(
    Object.keys(FIELD_OVERLAYS)
      .filter((id) => id !== 'none')
      .map((id) => [id, createField(map.width, map.height, 0)])
  );

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const terrainField = getTerrainField(map, x, y);
      Object.entries(terrainField).forEach(([fieldId, value]) => {
        fields[fieldId].values[y][x] = value;
      });
    }
  }

  return fields;
}

export function getTerrainField(map, x, y) {
  const terrain = getTerrain(getTile(map, x, y));
  const elevation = readElevation(map, x, y);
  const slope = getElevationSlope(map, x, y);
  const highGround = Math.max(0, elevation - 0.38);
  return {
    passability: clamp01(terrain.field.passability - slope * 0.58 - highGround * 0.08),
    cover: clamp01(terrain.field.cover + highGround * 0.2 + slope * 0.08),
    water: terrain.field.water,
    height: elevation,
    logistics: clamp01(terrain.field.logistics - slope * 0.38 - highGround * 0.12)
  };
}

export function getElevationSlope(map, x, y) {
  const centre = readElevation(map, x, y);
  const samples = [
    readElevation(map, Math.max(0, x - 1), y),
    readElevation(map, Math.min(map.width - 1, x + 1), y),
    readElevation(map, x, Math.max(0, y - 1)),
    readElevation(map, x, Math.min(map.height - 1, y + 1))
  ];
  return samples.reduce((max, value) => Math.max(max, Math.abs(value - centre)), 0);
}

export function getFieldValue(fields, fieldId, x, y) {
  const field = fields?.[fieldId];
  if (!field || x < 0 || y < 0 || x >= field.width || y >= field.height) {
    return null;
  }
  return field.values[y][x];
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function readElevation(map, x, y) {
  if (
    x < 0 ||
    y < 0 ||
    x >= map.width ||
    y >= map.height ||
    !Array.isArray(map.elevation) ||
    !Array.isArray(map.elevation[y])
  ) {
    return getElevation(map, x, y);
  }
  return clamp01(Number(map.elevation[y][x]));
}

export function updateTerrainFieldsLocally(map, fields, centerX, centerY, radius) {
  const minX = Math.max(0, centerX - radius - 1);
  const maxX = Math.min(map.width - 1, centerX + radius + 1);
  const minY = Math.max(0, centerY - radius - 1);
  const maxY = Math.min(map.height - 1, centerY + radius + 1);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const terrainField = getTerrainField(map, x, y);
      Object.entries(terrainField).forEach(([fieldId, value]) => {
        if (fields[fieldId]) {
          fields[fieldId].values[y][x] = value;
        }
      });
    }
  }
}

