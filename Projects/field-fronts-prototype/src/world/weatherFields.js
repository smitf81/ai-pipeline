import { getTerrain } from '../config/terrain.js';
import { createField, getElevationSlope, getTerrainField } from './fields.js';
import { getTile } from './mapModel.js';

export const WEATHER_FIELD_IDS = Object.freeze({
  heat: 'heat',
  humidity: 'humidity',
  uplift: 'uplift',
  stormPotential: 'stormPotential',
  cloudCover: 'cloudCover',
  rainfall: 'rainfall'
});

export const WEATHER_FIELD_CADENCE_TICKS = 16;

const DEFAULT_CLIMATE = Object.freeze({
  baseHeat: 0.5,
  baseHumidity: 0.46,
  stormBias: 0.2,
  windX: 0.72,
  windY: -0.28,
  engineeredStormCells: true
});

export function createWeatherFieldSet(width, height, defaultValue = 0) {
  return Object.fromEntries(Object.values(WEATHER_FIELD_IDS).map((id) => [id, createField(width, height, defaultValue)]));
}

export function deriveWeatherFields(map, game = null, options = {}) {
  const climate = normaliseClimate(map?.scenario?.weather ?? map?.weather ?? options.climate);
  const tick = Math.max(0, Math.floor(Number(options.tick ?? game?.tick) || 0));
  const weatherPhase = Math.floor(tick / WEATHER_FIELD_CADENCE_TICKS);
  const seed = createWeatherSeed(map, options.seed ?? map?.scenario?.generator?.seed ?? map?.seed ?? 'black-sky-bound');
  const fields = createWeatherFieldSet(map.width, map.height, 0);

  const waterInfluence = deriveWaterInfluence(map);
  const stormAnchor = climate.engineeredStormCells
    ? createStormAnchor(map, seed, weatherPhase, climate)
    : null;

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const terrainId = getTile(map, x, y);
      const terrain = getTerrain(terrainId);
      const terrainField = getTerrainField(map, x, y);
      const elevation = terrainField.height;
      const slope = getElevationSlope(map, x, y);
      const latitude = map.height <= 1 ? 0.5 : y / (map.height - 1);
      const waterNear = waterInfluence.values[y][x];
      const lee = windShadow(map, x, y, climate);
      const noise = smoothNoise(seed, x * 0.115 + weatherPhase * 0.31, y * 0.115 - weatherPhase * 0.17);
      const localPulse = smoothNoise(seed + 97, x * 0.052 + weatherPhase * 0.21, y * 0.052 + weatherPhase * 0.14);
      const anchor = stormAnchor ? radialFalloff(x, y, stormAnchor.x, stormAnchor.y, stormAnchor.radius) : 0;

      const waterCooling = waterNear * 0.26 + terrainField.water * 0.18;
      const forestCooling = terrainId === 'forest' ? 0.1 : 0;
      const highCooling = elevation * 0.18;
      const inlandWarming = terrainId === 'land' ? 0.08 : 0;
      const mountainCold = terrainId === 'mountains' ? 0.12 : 0;
      const dayHeat = diurnalHeat(game?.time?.dayProgress ?? null);
      const heat = clamp01(
        climate.baseHeat
        + dayHeat
        + inlandWarming
        - waterCooling
        - forestCooling
        - highCooling
        - mountainCold
        + (noise - 0.5) * 0.12
      );

      const humidity = clamp01(
        climate.baseHumidity
        + waterNear * 0.5
        + terrainField.water * 0.24
        + terrain.field.cover * 0.16
        + (1 - heat) * 0.08
        + anchor * 0.24
        + (localPulse - 0.5) * 0.12
      );

      const uplift = clamp01(
        slope * 1.45
        + Math.max(0, elevation - 0.35) * 0.4
        + terrainField.cover * 0.08
        + lee * 0.18
        + heat * humidity * 0.22
      );

      const convergence = clamp01(
        anchor * 0.42
        + smoothNoise(seed + 311, x * 0.075 - weatherPhase * 0.18, y * 0.075 + weatherPhase * 0.09) * 0.34
        + waterNear * 0.12
        + climate.stormBias
      );

      const stormPotential = clamp01(
        humidity * 0.46
        + uplift * 0.32
        + convergence * 0.36
        - heat * 0.08
      );
      const cloudCover = clamp01(
        smoothstep(0.42, 0.88, stormPotential)
        + humidity * 0.18
        + anchor * 0.22
        - heat * 0.08
      );
      const rainfall = clamp01(
        smoothstep(0.58, 0.96, stormPotential)
        * (0.45 + humidity * 0.55)
        + Math.max(0, cloudCover - 0.68) * 0.25
      );

      fields.heat.values[y][x] = round3(heat);
      fields.humidity.values[y][x] = round3(humidity);
      fields.uplift.values[y][x] = round3(uplift);
      fields.stormPotential.values[y][x] = round3(stormPotential);
      fields.cloudCover.values[y][x] = round3(cloudCover);
      fields.rainfall.values[y][x] = round3(rainfall);
    }
  }

  return {
    fields,
    summary: summarizeWeatherFields(fields, { tick, weatherPhase, stormAnchor, climate })
  };
}

export function summarizeWeatherFields(fields, meta = {}) {
  const ids = Object.values(WEATHER_FIELD_IDS);
  const metrics = Object.fromEntries(ids.map((id) => [id, summarizeField(fields?.[id])]));
  const stormCells = countAbove(fields?.stormPotential, 0.68);
  const rainCells = countAbove(fields?.rainfall, 0.45);
  return {
    source: 'weather_spatial_fields',
    tick: Math.max(0, Math.floor(Number(meta.tick) || 0)),
    weatherPhase: Math.max(0, Math.floor(Number(meta.weatherPhase) || 0)),
    stormAnchor: meta.stormAnchor ? {
      x: round3(meta.stormAnchor.x),
      y: round3(meta.stormAnchor.y),
      radius: round3(meta.stormAnchor.radius)
    } : null,
    stormCells,
    rainCells,
    dominant: stormCells > 0 ? 'storm-forming' : rainCells > 0 ? 'rain' : 'clear',
    fields: metrics
  };
}

export function sampleWeatherFields(fields, x, y) {
  const ix = Math.max(0, Math.min((fields?.heat?.width ?? 1) - 1, Math.floor(Number(x) || 0)));
  const iy = Math.max(0, Math.min((fields?.heat?.height ?? 1) - 1, Math.floor(Number(y) || 0)));
  return Object.fromEntries(Object.values(WEATHER_FIELD_IDS).map((id) => [id, fields?.[id]?.values?.[iy]?.[ix] ?? 0]));
}

function normaliseClimate(input = {}) {
  return {
    baseHeat: clamp01(Number.isFinite(Number(input?.baseHeat)) ? Number(input.baseHeat) : DEFAULT_CLIMATE.baseHeat),
    baseHumidity: clamp01(Number.isFinite(Number(input?.baseHumidity)) ? Number(input.baseHumidity) : DEFAULT_CLIMATE.baseHumidity),
    stormBias: clamp01(Number.isFinite(Number(input?.stormBias)) ? Number(input.stormBias) : DEFAULT_CLIMATE.stormBias),
    windX: Number.isFinite(Number(input?.windX)) ? Number(input.windX) : DEFAULT_CLIMATE.windX,
    windY: Number.isFinite(Number(input?.windY)) ? Number(input.windY) : DEFAULT_CLIMATE.windY,
    engineeredStormCells: input?.engineeredStormCells === false ? false : DEFAULT_CLIMATE.engineeredStormCells
  };
}

function deriveWaterInfluence(map) {
  const field = createField(map.width, map.height, 0);
  const waterTiles = [];
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const water = getTerrainField(map, x, y).water;
      if (water > 0.35) {
        waterTiles.push({ x, y, water });
      }
    }
  }
  const radius = Math.max(5, Math.round(Math.min(map.width, map.height) * 0.18));
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      let best = getTerrainField(map, x, y).water;
      for (const waterTile of waterTiles) {
        const d = Math.hypot(waterTile.x - x, waterTile.y - y);
        if (d > radius) continue;
        best = Math.max(best, waterTile.water * (1 - d / radius));
      }
      field.values[y][x] = round3(clamp01(best));
    }
  }
  return field;
}

function createStormAnchor(map, seed, weatherPhase, climate) {
  const width = Math.max(1, map.width);
  const height = Math.max(1, map.height);
  const windLen = Math.max(0.001, Math.hypot(climate.windX, climate.windY));
  const wx = climate.windX / windLen;
  const wy = climate.windY / windLen;
  const drift = (weatherPhase % 24) / 24;
  const baseX = width * (0.18 + 0.64 * hash01(seed + 41));
  const baseY = height * (0.18 + 0.64 * hash01(seed + 71));
  return {
    x: clamp(baseX + (drift - 0.5) * wx * width * 0.42, 2, width - 3),
    y: clamp(baseY + (drift - 0.5) * wy * height * 0.42, 2, height - 3),
    radius: Math.max(6, Math.min(width, height) * (0.22 + hash01(seed + 103) * 0.14))
  };
}

function windShadow(map, x, y, climate) {
  const backX = Math.round(x - Math.sign(climate.windX || 1));
  const backY = Math.round(y - Math.sign(climate.windY || 1));
  const here = getTerrainField(map, x, y).height;
  const upwind = getTerrainField(map, clamp(backX, 0, map.width - 1), clamp(backY, 0, map.height - 1)).height;
  return clamp01(Math.max(0, here - upwind) * 1.8);
}

function diurnalHeat(dayProgress) {
  if (!Number.isFinite(Number(dayProgress))) {
    return 0.04;
  }
  const phase = Number(dayProgress);
  return Math.sin((phase - 0.22) * Math.PI * 2) * 0.08;
}

function radialFalloff(x, y, ax, ay, radius) {
  const d = Math.hypot(x - ax, y - ay);
  return clamp01(1 - d / Math.max(0.001, radius));
}

function smoothNoise(seed, x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const a = hash01(seed + ix * 374761393 + iy * 668265263);
  const b = hash01(seed + (ix + 1) * 374761393 + iy * 668265263);
  const c = hash01(seed + ix * 374761393 + (iy + 1) * 668265263);
  const d = hash01(seed + (ix + 1) * 374761393 + (iy + 1) * 668265263);
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
}

function createWeatherSeed(map, value) {
  const str = `${value ?? ''}:${map?.width ?? 0}:${map?.height ?? 0}:${map?.revision ?? 0}`;
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function summarizeField(field) {
  if (!field?.values) {
    return { min: 0, max: 0, average: 0 };
  }
  let min = 1;
  let max = 0;
  let sum = 0;
  let count = 0;
  for (const row of field.values) {
    for (const value of row) {
      const safe = clamp01(value);
      min = Math.min(min, safe);
      max = Math.max(max, safe);
      sum += safe;
      count += 1;
    }
  }
  return { min: round3(min), max: round3(max), average: round3(sum / Math.max(1, count)) };
}

function countAbove(field, threshold) {
  if (!field?.values) return 0;
  let count = 0;
  for (const row of field.values) {
    for (const value of row) {
      if ((Number(value) || 0) >= threshold) count += 1;
    }
  }
  return count;
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hash01(value) {
  let x = Math.imul(Number(value) | 0, 0x45d9f3b);
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x45d9f3b);
  x = (x ^ (x >>> 16)) >>> 0;
  return (x & 0xffffff) / 0xffffff;
}

function round3(value) {
  return Math.round(clamp01(value) * 1000) / 1000;
}

function clamp01(value) {
  return clamp(Number.isFinite(Number(value)) ? Number(value) : 0, 0, 1);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
