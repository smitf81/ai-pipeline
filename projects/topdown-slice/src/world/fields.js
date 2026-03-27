import { createCellAddress, GROUND_Z } from './coordinates.js';
import { getTileType } from './tilemap.js';

const TILE_FIELD_BASELINES = {
  grass: { cover: 0.12, traversal: 0.08 },
  stone: { cover: 0.68, traversal: 0.35 },
  water: { cover: 0.92, traversal: 1 }
};
export const REINFORCEMENT_INCREMENT = 0.18;
export const REINFORCEMENT_DECAY_PER_FRAME = 0.0004;
export const REINFORCEMENT_COVER_WEIGHT = 0.18;
export const WEATHER_DIFFUSION_RATE = 0.18;
export const WEATHER_HEAT_DECAY_PER_FRAME = 0.008;
export const WEATHER_MOISTURE_DECAY_PER_FRAME = 0.003;
export const WEATHER_CLOUD_DECAY_PER_FRAME = 0.004;
export const WEATHER_CONDENSATION_THRESHOLD = 0.16;
export const WEATHER_CONDENSATION_GAIN = 0.38;
export const WEATHER_WATER_MOISTURE_SOURCE = 0.018;
export const WEATHER_STONE_HEAT_SOURCE = 0.002;
export const WEATHER_ACTOR_HEAT_SOURCE = 0.012;
export const WEATHER_CONFLICT_HEAT_BONUS = 0.006;
export const WEATHER_ACTOR_MOISTURE_SOURCE = 0.004;
export const WEATHER_ATTACK_HEAT_BURST = 0.08;
export const WEATHER_HISTORY_LIMIT = 8;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function isInBounds(field, x, y) {
  return x >= 0 && y >= 0 && x < field.width && y < field.height;
}

export function createField(width, height, defaultValue = 0) {
  return {
    width,
    height,
    values: Array.from({ length: height }, () => Array.from({ length: width }, () => defaultValue))
  };
}

export function createLayeredField(width, height, layers = [GROUND_Z], defaultValue = 0) {
  const zLayers = [...new Set((layers ?? [GROUND_Z]).map((layer) => Math.round(Number(layer ?? GROUND_Z))))];

  return {
    width,
    height,
    layers: Object.fromEntries(zLayers.map((layer) => [String(layer), createField(width, height, defaultValue)])),
    layerOrder: zLayers
  };
}

export function createFieldSet(width, height, defaultValue = 0) {
  return {
    cover: createField(width, height, defaultValue),
    visibility: createField(width, height, defaultValue),
    traversal: createField(width, height, defaultValue),
    defensibility: createField(width, height, defaultValue),
    reinforcement: createField(width, height, defaultValue),
    heat: createField(width, height, defaultValue),
    moisture: createField(width, height, defaultValue),
    condensation: createField(width, height, defaultValue),
    clouds: createField(width, height, defaultValue)
  };
}

export function createProtoWeatherState(width, height) {
  return {
    heat: createField(width, height, 0),
    moisture: createField(width, height, 0),
    condensation: createField(width, height, 0),
    clouds: createField(width, height, 0),
    lastSummary: {
      cloudTiles: 0,
      hottestTile: null,
      wettestTile: null,
      cloudiestTile: null
    },
    recentCloudEvents: []
  };
}

export function getFieldLayer(layeredField, z = GROUND_Z) {
  if (!layeredField?.layers) {
    return null;
  }

  return layeredField.layers[String(Math.round(Number(z ?? GROUND_Z)))] ?? null;
}

export function ensureFieldLayer(layeredField, z = GROUND_Z, defaultValue = 0) {
  if (!layeredField?.layers) {
    return null;
  }

  const layerKey = String(Math.round(Number(z ?? GROUND_Z)));
  if (!layeredField.layers[layerKey]) {
    layeredField.layers[layerKey] = createField(layeredField.width, layeredField.height, defaultValue);
    layeredField.layerOrder = [...new Set([...(layeredField.layerOrder ?? []), Number(layerKey)])].sort((left, right) => left - right);
  }

  return layeredField.layers[layerKey];
}

export function getFieldValue(field, x, y) {
  if (!field || !isInBounds(field, x, y)) {
    return null;
  }
  return field.values[y][x];
}

export function getLayeredFieldValue(layeredField, input, y, z = GROUND_Z) {
  const cell = createCellAddress(input, y, z);
  const layer = getFieldLayer(layeredField, cell.z);
  return getFieldValue(layer, cell.x, cell.y);
}

export function setFieldValue(field, x, y, value) {
  if (!isInBounds(field, x, y)) {
    return null;
  }
  field.values[y][x] = value;
  return value;
}

export function setLayeredFieldValue(layeredField, input, y, zOrValue, value) {
  const usesCellArgument = typeof input === 'object' && input !== null;
  const cell = usesCellArgument
    ? createCellAddress(input)
    : createCellAddress(input, y, zOrValue);
  const nextValue = usesCellArgument ? y : value;
  const layer = ensureFieldLayer(layeredField, cell.z);

  return setFieldValue(layer, cell.x, cell.y, nextValue);
}

export function addFieldValue(field, x, y, delta) {
  const current = getFieldValue(field, x, y);
  if (current == null) {
    return null;
  }
  const next = current + delta;
  setFieldValue(field, x, y, next);
  return next;
}

export function reinforceFieldValue(field, x, y, delta = REINFORCEMENT_INCREMENT) {
  const current = getFieldValue(field, x, y);
  if (current == null) {
    return null;
  }

  const next = clamp01(current + delta);
  setFieldValue(field, x, y, next);
  return next;
}

export function decayFieldValues(field, delta) {
  if (!field || delta <= 0) {
    return field;
  }

  for (let y = 0; y < field.height; y += 1) {
    for (let x = 0; x < field.width; x += 1) {
      const current = getFieldValue(field, x, y) ?? 0;
      if (current <= 0) {
        continue;
      }

      setFieldValue(field, x, y, clamp01(current - delta));
    }
  }

  return field;
}

export function diffuseFieldValues(field, rate = WEATHER_DIFFUSION_RATE) {
  if (!field || rate <= 0) {
    return field;
  }

  const clampedRate = clamp01(rate);
  const nextValues = Array.from({ length: field.height }, () => Array.from({ length: field.width }, () => 0));

  for (let y = 0; y < field.height; y += 1) {
    for (let x = 0; x < field.width; x += 1) {
      const current = getFieldValue(field, x, y) ?? 0;
      const neighbours = [
        getFieldValue(field, x - 1, y),
        getFieldValue(field, x + 1, y),
        getFieldValue(field, x, y - 1),
        getFieldValue(field, x, y + 1)
      ].filter((sample) => sample != null);
      const neighbourAverage = neighbours.length === 0
        ? current
        : neighbours.reduce((sum, sample) => sum + sample, 0) / neighbours.length;

      nextValues[y][x] = clamp01(current * (1 - clampedRate) + neighbourAverage * clampedRate);
    }
  }

  field.values = nextValues;
  return field;
}

export function estimateTileFieldValues(tileType, { hasBuilding = false, reinforcement = 0 } = {}) {
  const baseline = TILE_FIELD_BASELINES[tileType] ?? TILE_FIELD_BASELINES.grass;

  let cover = baseline.cover + clamp01(reinforcement) * REINFORCEMENT_COVER_WEIGHT;
  let traversal = baseline.traversal;

  if (hasBuilding) {
    cover = Math.max(cover, 0.96);
    traversal = Math.max(traversal, 0.78);
  }

  return {
    cover: clamp01(cover),
    traversal: clamp01(traversal)
  };
}

export function computeVisibilityAt(coverField, x, y, coverOverride = null) {
  const samples = [];

  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const sample = dx === 0 && dy === 0 && coverOverride != null
        ? coverOverride
        : getFieldValue(coverField, x + dx, y + dy);

      if (sample != null) {
        samples.push(sample);
      }
    }
  }

  if (samples.length === 0) {
    return 0;
  }

  const averageCover = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
  const selfCover = clamp01(coverOverride ?? getFieldValue(coverField, x, y) ?? 0);
  const openness = clamp01(1 - averageCover);

  return clamp01(0.15 + openness * 0.7 + (1 - selfCover) * 0.15);
}

export function sampleFieldAverage(field, positions) {
  const values = positions
    .map(({ x, y }) => getFieldValue(field, x, y))
    .filter((value) => value != null);

  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function computeDefensibilityValue({ cover = 0, visibility = 1, traversal = 1 }) {
  return clamp01(
    cover * 0.5
      + (1 - visibility) * 0.35
      + (1 - traversal) * 0.15
  );
}

export function computeDefensibilityField(fields) {
  const field = createField(fields.cover.width, fields.cover.height, 0);

  for (let y = 0; y < field.height; y += 1) {
    for (let x = 0; x < field.width; x += 1) {
      setFieldValue(field, x, y, computeDefensibilityValue({
        cover: getFieldValue(fields.cover, x, y) ?? 0,
        visibility: getFieldValue(fields.visibility, x, y) ?? 1,
        traversal: getFieldValue(fields.traversal, x, y) ?? 1
      }));
    }
  }

  return field;
}

export function createRegionalAverageField(field, columns = 5, rows = 5) {
  if (!field) {
    return null;
  }

  const regionalField = createField(field.width, field.height, 0);
  const sums = Array.from({ length: rows }, () => Array.from({ length: columns }, () => 0));
  const counts = Array.from({ length: rows }, () => Array.from({ length: columns }, () => 0));

  for (let y = 0; y < field.height; y += 1) {
    for (let x = 0; x < field.width; x += 1) {
      const regionX = getRegionalIndex(x, field.width, columns);
      const regionY = getRegionalIndex(y, field.height, rows);
      sums[regionY][regionX] += getFieldValue(field, x, y) ?? 0;
      counts[regionY][regionX] += 1;
    }
  }

  const averages = sums.map((row, regionY) =>
    row.map((sum, regionX) => counts[regionY][regionX] === 0 ? 0 : sum / counts[regionY][regionX])
  );

  for (let y = 0; y < field.height; y += 1) {
    for (let x = 0; x < field.width; x += 1) {
      const regionX = getRegionalIndex(x, field.width, columns);
      const regionY = getRegionalIndex(y, field.height, rows);
      setFieldValue(regionalField, x, y, averages[regionY][regionX]);
    }
  }

  return regionalField;
}

function getRegionalIndex(position, size, regions) {
  if (size <= 1 || regions <= 1) {
    return 0;
  }

  return Math.min(regions - 1, Math.floor((position / size) * regions));
}

export function recomputeFieldsFromWorld(world) {
  const fields = createFieldSet(world.map.width, world.map.height);
  const occupiedBuildingTiles = new Set(world.store.buildings.map((building) => `${building.x},${building.y}`));
  const reinforcementField = world.emergence?.reinforcement;
  const weather = ensureProtoWeatherState(world);

  for (let y = 0; y < world.map.height; y += 1) {
    for (let x = 0; x < world.map.width; x += 1) {
      const tileType = getTileType(world.map, x, y);
      const reinforcement = getFieldValue(reinforcementField, x, y) ?? 0;
      const metrics = estimateTileFieldValues(tileType, {
        hasBuilding: occupiedBuildingTiles.has(`${x},${y}`),
        reinforcement
      });

      setFieldValue(fields.cover, x, y, metrics.cover);
      setFieldValue(fields.traversal, x, y, metrics.traversal);
      setFieldValue(fields.reinforcement, x, y, reinforcement);
    }
  }

  for (let y = 0; y < world.map.height; y += 1) {
    for (let x = 0; x < world.map.width; x += 1) {
      setFieldValue(fields.visibility, x, y, computeVisibilityAt(fields.cover, x, y));
    }
  }

  fields.defensibility = computeDefensibilityField(fields);
  fields.heat = weather.heat;
  fields.moisture = weather.moisture;
  fields.condensation = weather.condensation;
  fields.clouds = weather.clouds;

  return fields;
}

export function tickProtoWeather(world) {
  const weather = ensureProtoWeatherState(world);

  diffuseFieldValues(weather.heat);
  diffuseFieldValues(weather.moisture);
  diffuseFieldValues(weather.clouds, WEATHER_DIFFUSION_RATE * 0.8);
  decayFieldValues(weather.heat, WEATHER_HEAT_DECAY_PER_FRAME);
  decayFieldValues(weather.moisture, WEATHER_MOISTURE_DECAY_PER_FRAME);
  decayFieldValues(weather.clouds, WEATHER_CLOUD_DECAY_PER_FRAME);
  fillField(weather.condensation, 0);

  injectTileWeatherSources(world, weather);
  injectActorWeatherSources(world, weather);
  injectAttackWeatherBursts(world, weather);
  applyCondensation(weather);
  weather.lastSummary = summarizeProtoWeather(world);

  return weather;
}

export function summarizeProtoWeather(world) {
  const weather = ensureProtoWeatherState(world);
  const hottestTile = getFieldPeak(weather.heat);
  const wettestTile = getFieldPeak(weather.moisture);
  const cloudiestTile = getFieldPeak(weather.clouds);
  const condensationPeak = getFieldPeak(weather.condensation);

  return {
    cloudTiles: countTilesAtOrAbove(weather.clouds, 0.05),
    condensationTiles: countTilesAtOrAbove(weather.condensation, 0.05),
    hottestTile,
    wettestTile,
    cloudiestTile,
    condensationPeak,
    recentCloudEvents: [...(weather.recentCloudEvents ?? [])]
  };
}

function ensureProtoWeatherState(world) {
  world.emergence ??= {};
  if (!world.emergence.weather) {
    world.emergence.weather = createProtoWeatherState(world.map.width, world.map.height);
  }

  return world.emergence.weather;
}

function fillField(field, value) {
  for (let y = 0; y < field.height; y += 1) {
    for (let x = 0; x < field.width; x += 1) {
      setFieldValue(field, x, y, value);
    }
  }
}

function injectTileWeatherSources(world, weather) {
  for (let y = 0; y < world.map.height; y += 1) {
    for (let x = 0; x < world.map.width; x += 1) {
      const tileType = getTileType(world.map, x, y);
      if (tileType === 'water') {
        reinforceFieldValue(weather.moisture, x, y, WEATHER_WATER_MOISTURE_SOURCE);
      } else if (tileType === 'stone') {
        reinforceFieldValue(weather.heat, x, y, WEATHER_STONE_HEAT_SOURCE);
      }
    }
  }
}

function injectActorWeatherSources(world, weather) {
  getWeatherActors(world).forEach((actor) => {
    reinforceFieldValue(weather.heat, actor.x, actor.y, getActorHeatSource(actor));
    reinforceFieldValue(weather.moisture, actor.x, actor.y, WEATHER_ACTOR_MOISTURE_SOURCE);
  });
}

function injectAttackWeatherBursts(world, weather) {
  const frame = Number(world?.emergence?.frame ?? 0);
  const recentAttacks = (world?.conflict?.recentAttacks ?? []).filter((attack) => Number(attack?.frame ?? -1) === frame);
  if (recentAttacks.length === 0) {
    return;
  }

  recentAttacks.forEach((attack) => {
    const attacker = findWeatherActorById(world, attack.attackerId);
    const target = findWeatherActorById(world, attack.targetId);

    if (attacker) {
      reinforceFieldValue(weather.heat, attacker.x, attacker.y, WEATHER_ATTACK_HEAT_BURST);
    }
    if (target) {
      reinforceFieldValue(weather.heat, target.x, target.y, WEATHER_ATTACK_HEAT_BURST * 0.65);
      reinforceFieldValue(weather.moisture, target.x, target.y, WEATHER_ACTOR_MOISTURE_SOURCE * 0.5);
    }
  });
}

function applyCondensation(weather) {
  for (let y = 0; y < weather.heat.height; y += 1) {
    for (let x = 0; x < weather.heat.width; x += 1) {
      const heat = getFieldValue(weather.heat, x, y) ?? 0;
      const moisture = getFieldValue(weather.moisture, x, y) ?? 0;
      const trigger = clamp01(heat + moisture - WEATHER_CONDENSATION_THRESHOLD);
      if (trigger <= 0) {
        continue;
      }

      setFieldValue(weather.condensation, x, y, trigger);
      reinforceFieldValue(weather.clouds, x, y, trigger * WEATHER_CONDENSATION_GAIN);

      if (trigger >= 0.12) {
        pushRecentCloudEvent(weather, { x, y, trigger });
      }
    }
  }
}

function getWeatherActors(world) {
  const actors = [
    world?.store?.agent,
    ...(world?.store?.units ?? [])
  ];

  return actors.filter((actor) =>
    actor
    && Number.isFinite(actor.x)
    && Number.isFinite(actor.y)
    && getTileType(world.map, actor.x, actor.y)
  );
}

function getActorHeatSource(actor) {
  return WEATHER_ACTOR_HEAT_SOURCE + (actor?.faction ? WEATHER_CONFLICT_HEAT_BONUS : 0);
}

function findWeatherActorById(world, actorId) {
  return getWeatherActors(world).find((actor) => actor.id === actorId) ?? null;
}

function countTilesAtOrAbove(field, threshold) {
  let count = 0;

  for (let y = 0; y < field.height; y += 1) {
    for (let x = 0; x < field.width; x += 1) {
      if ((getFieldValue(field, x, y) ?? 0) >= threshold) {
        count += 1;
      }
    }
  }

  return count;
}

function getFieldPeak(field) {
  let peak = null;

  for (let y = 0; y < field.height; y += 1) {
    for (let x = 0; x < field.width; x += 1) {
      const value = Number((getFieldValue(field, x, y) ?? 0).toFixed(3));
      if (!peak || value > peak.value) {
        peak = { x, y, value };
      }
    }
  }

  return peak;
}

function pushRecentCloudEvent(weather, event) {
  if (!Array.isArray(weather.recentCloudEvents)) {
    return;
  }

  const previous = weather.recentCloudEvents[0];
  if (previous?.x === event.x && previous?.y === event.y) {
    weather.recentCloudEvents[0] = {
      ...event,
      trigger: Number(event.trigger.toFixed(3))
    };
    return;
  }

  weather.recentCloudEvents.unshift({
    ...event,
    trigger: Number(event.trigger.toFixed(3))
  });
  if (weather.recentCloudEvents.length > WEATHER_HISTORY_LIMIT) {
    weather.recentCloudEvents.pop();
  }
}
