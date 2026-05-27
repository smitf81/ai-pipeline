export const WEATHER_VISUAL_THRESHOLDS = Object.freeze({
  // V1.1 deliberately raises the visible-cloud floor: the field can be broad,
  // but the renderer should only draw authored-looking storm masses.
  cloudMinimum: 0.38,
  heavyCloud: 0.64,
  stormCore: 0.7,
  rainMinimum: 0.46,
  lightningCharge: 0.82
});

export const WEATHER_VISUAL_RENDER_PROFILE = Object.freeze({
  defaultMaxCells: 72,
  distantMaxCells: 44,
  minimumStride: 2,
  targetColumns: 42
});

export function sampleWeatherVisualCell(fields, x, y) {
  const cloud = sampleField(fields?.cloudCover, x, y);
  const rain = sampleField(fields?.rainfall, x, y);
  const storm = sampleField(fields?.stormPotential, x, y);
  const humidity = sampleField(fields?.humidity, x, y);
  const uplift = sampleField(fields?.uplift, x, y);
  const heat = sampleField(fields?.heat, x, y);
  const cloudDensity = clamp01(cloud * 0.72 + humidity * 0.16 + uplift * 0.12 - heat * 0.08);
  const darkCore = clamp01(smoothstep(0.52, 0.94, storm) * 0.72 + smoothstep(0.58, 0.9, cloudDensity) * 0.28);
  const rainfall = clamp01(rain * 0.76 + Math.max(0, cloudDensity - 0.68) * 0.34);
  const electric = clamp01(smoothstep(0.64, 0.98, storm) * (0.45 + humidity * 0.35 + uplift * 0.2));
  const terrainDim = clamp01(cloudDensity * 0.3 + darkCore * 0.22 + rainfall * 0.12);
  const charge = clamp01(storm * 0.62 + cloudDensity * 0.18 + rainfall * 0.12 + uplift * 0.08);
  return {
    cloud,
    rain,
    storm,
    humidity,
    uplift,
    heat,
    cloudDensity: round3(cloudDensity),
    darkCore: round3(darkCore),
    rainfall: round3(rainfall),
    electric: round3(electric),
    terrainDim: round3(terrainDim),
    charge: round3(charge)
  };
}

export function getStormCloudCells(map, fields, options = {}) {
  const minCloud = Number.isFinite(Number(options.minCloud)) ? Number(options.minCloud) : WEATHER_VISUAL_THRESHOLDS.cloudMinimum;
  const cells = [];
  for (let y = 0; y < (map?.height ?? 0); y += 1) {
    for (let x = 0; x < (map?.width ?? 0); x += 1) {
      const sample = sampleWeatherVisualCell(fields, x, y);
      if (sample.cloudDensity < minCloud) continue;
      cells.push({ x, y, ...sample });
    }
  }
  return cells;
}


export function selectStormRenderCells(map, fields, options = {}) {
  const width = Math.max(0, map?.width ?? 0);
  const height = Math.max(0, map?.height ?? 0);
  if (width === 0 || height === 0) return [];

  const stride = Math.max(
    WEATHER_VISUAL_RENDER_PROFILE.minimumStride,
    Math.floor(Number(options.stride) || Math.ceil(Math.max(width, height) / WEATHER_VISUAL_RENDER_PROFILE.targetColumns))
  );
  const maxCells = Math.max(1, Math.floor(Number(options.maxCells) || WEATHER_VISUAL_RENDER_PROFILE.defaultMaxCells));
  const minCloud = Number.isFinite(Number(options.minCloud)) ? Number(options.minCloud) : WEATHER_VISUAL_THRESHOLDS.cloudMinimum;
  const candidates = [];

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const sample = sampleWeatherVisualArea(fields, x, y, stride, width, height);
      if (sample.cloudDensity < minCloud) continue;
      const cellCentreX = Math.min(width - 1, x + (stride - 1) * 0.5);
      const cellCentreY = Math.min(height - 1, y + (stride - 1) * 0.5);
      const importance = sample.cloudDensity * 0.52 + sample.darkCore * 0.26 + sample.rainfall * 0.12 + sample.electric * 0.1;
      candidates.push({
        id: `storm_render_${x}_${y}_${stride}`,
        x: round3(cellCentreX),
        y: round3(cellCentreY),
        originX: x,
        originY: y,
        stride,
        importance: round3(importance),
        ...sample
      });
    }
  }

  return candidates
    .sort((a, b) => b.importance - a.importance)
    .slice(0, maxCells)
    .sort((a, b) => (a.originY - b.originY) || (a.originX - b.originX));
}

export function sampleWeatherVisualArea(fields, x, y, stride = 1, width = Infinity, height = Infinity) {
  const size = Math.max(1, Math.floor(Number(stride) || 1));
  const samples = [];
  const points = [
    [x, y],
    [x + size - 1, y],
    [x, y + size - 1],
    [x + size - 1, y + size - 1],
    [x + (size - 1) * 0.5, y + (size - 1) * 0.5]
  ];
  for (const [px, py] of points) {
    samples.push(sampleWeatherVisualCell(
      fields,
      clamp(Math.round(px), 0, Math.max(0, width - 1)),
      clamp(Math.round(py), 0, Math.max(0, height - 1))
    ));
  }
  const keys = ['cloud','rain','storm','humidity','uplift','heat','cloudDensity','darkCore','rainfall','electric','terrainDim','charge'];
  const out = {};
  for (const key of keys) {
    out[key] = round3(samples.reduce((sum, sample) => sum + Number(sample[key] || 0), 0) / samples.length);
  }
  return out;
}

export function selectLightningEvents(map, fields, options = {}) {
  const nowMs = Math.max(0, Number(options.nowMs) || 0);
  const weatherPhase = Math.max(0, Math.floor(Number(options.weatherPhase) || 0));
  const bucketMs = Math.max(420, Number(options.bucketMs) || 1300);
  const bucket = Math.floor(nowMs / bucketMs);
  const bucketAge = nowMs - bucket * bucketMs;
  const ttlMs = Math.max(120, Number(options.ttlMs) || 360);
  const maxEvents = Math.max(1, Math.floor(Number(options.maxEvents) || 2));
  const threshold = Number.isFinite(Number(options.threshold)) ? Number(options.threshold) : WEATHER_VISUAL_THRESHOLDS.lightningCharge;
  const seed = numberSeed(options.seed ?? 'black-sky-weather-visuals');
  const candidates = [];

  for (let y = 1; y < Math.max(1, (map?.height ?? 0) - 1); y += 3) {
    for (let x = 1; x < Math.max(1, (map?.width ?? 0) - 1); x += 3) {
      const sample = sampleWeatherVisualCell(fields, x, y);
      if (sample.charge < threshold || sample.cloudDensity < 0.5) continue;
      const strikeNoise = hash01(seed + x * 928371 + y * 192817 + bucket * 9187 + weatherPhase * 433);
      const readiness = sample.charge * 0.78 + sample.electric * 0.22;
      if (readiness * 0.94 + strikeNoise * 0.18 < threshold) continue;
      const ageOffset = Math.floor(hash01(seed + x * 37 + y * 109 + bucket * 17) * Math.min(180, ttlMs * 0.45));
      candidates.push({
        id: `storm_${weatherPhase}_${bucket}_${x}_${y}`,
        x,
        y,
        seed: seed + x * 1117 + y * 7919 + bucket * 313 + weatherPhase * 101,
        strength: round3(readiness),
        createdAtMs: bucket * bucketMs + ageOffset,
        ttlMs,
        sample
      });
    }
  }

  return candidates
    .filter((event) => nowMs >= event.createdAtMs && nowMs <= event.createdAtMs + event.ttlMs)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, maxEvents);
}

export function generateForkBoltGeometry(start, end, options = {}) {
  const seed = numberSeed(options.seed ?? 1);
  const segments = Math.max(4, Math.min(14, Math.floor(Number(options.segments) || 9)));
  const jitter = Math.max(0, Number(options.jitter) || 0.42);
  const forkCount = Math.max(0, Math.min(5, Math.floor(Number(options.forks) || 3)));
  const main = [];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.max(0.001, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const envelope = Math.sin(t * Math.PI);
    const noise = (hash01(seed + i * 97) - 0.5) * jitter * len * envelope;
    main.push({
      x: round3(start.x + dx * t + nx * noise),
      y: round3(start.y + dy * t + ny * noise)
    });
  }

  const forks = [];
  for (let i = 0; i < forkCount; i += 1) {
    const anchorIndex = 1 + Math.floor(hash01(seed + i * 173) * Math.max(1, segments - 2));
    const anchor = main[anchorIndex];
    const side = hash01(seed + i * 331) > 0.5 ? 1 : -1;
    const length = len * (0.16 + hash01(seed + i * 491) * 0.22);
    const angle = Math.atan2(dy, dx) + side * (0.65 + hash01(seed + i * 557) * 0.65);
    const endPoint = {
      x: anchor.x + Math.cos(angle) * length,
      y: anchor.y + Math.sin(angle) * length
    };
    const mid = {
      x: anchor.x + (endPoint.x - anchor.x) * 0.52 + nx * side * length * 0.18 * (hash01(seed + i * 659) - 0.5),
      y: anchor.y + (endPoint.y - anchor.y) * 0.52 + ny * side * length * 0.18 * (hash01(seed + i * 719) - 0.5)
    };
    forks.push({
      points: [
        { x: round3(anchor.x), y: round3(anchor.y) },
        { x: round3(mid.x), y: round3(mid.y) },
        { x: round3(endPoint.x), y: round3(endPoint.y) }
      ]
    });
  }

  return { main, forks };
}

function sampleField(field, x, y) {
  const ix = clamp(Math.floor(Number(x) || 0), 0, Math.max(0, (field?.width ?? 1) - 1));
  const iy = clamp(Math.floor(Number(y) || 0), 0, Math.max(0, (field?.height ?? 1) - 1));
  return clamp01(field?.values?.[iy]?.[ix] ?? 0);
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function numberSeed(value) {
  if (Number.isFinite(Number(value))) return Number(value) | 0;
  const str = String(value ?? '');
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hash01(value) {
  let x = Math.imul(Number(value) | 0, 0x45d9f3b);
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x45d9f3b);
  x = (x ^ (x >>> 16)) >>> 0;
  return (x & 0xffffff) / 0xffffff;
}

function round3(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function clamp01(value) {
  return clamp(Number.isFinite(Number(value)) ? Number(value) : 0, 0, 1);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
