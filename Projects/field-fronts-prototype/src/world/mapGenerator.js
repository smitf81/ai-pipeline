import { getTerrain } from '../config/terrain.js';
import { createBlankMap, getElevation, getTile, setElevation, setTile } from './mapModel.js';
import { createScenarioLayerForMap } from './scenarioLayer.js';
import { ensureScenarioCatalogueForMap } from './scenarioCatalogue.js';
import { createFirstNightSceneEntity, SHELTER_NODE_TYPES } from './sceneEntity.js';

export const MAP_GENERATION_PRESETS = Object.freeze({
  first_night_blockout: Object.freeze({
    id: 'first_night_blockout',
    label: 'The First Night Blockout',
    width: 64,
    height: 40,
    targetTextureSize: 2048,
    neutralOutpostCount: 0,
    riverCount: 1,
    mountainBias: 0.52,
    forestBias: 0.62
  }),
  frontier_2k: Object.freeze({
    id: 'frontier_2k',
    label: 'Frontier 2K',
    width: 96,
    height: 64,
    targetTextureSize: 2048,
    neutralOutpostCount: 4,
    riverCount: 2,
    mountainBias: 0.52,
    forestBias: 0.56
  }),
  frontier_4k: Object.freeze({
    id: 'frontier_4k',
    label: 'Frontier 4K',
    width: 128,
    height: 80,
    targetTextureSize: 4096,
    neutralOutpostCount: 6,
    riverCount: 3,
    mountainBias: 0.5,
    forestBias: 0.54
  })
});

const GENERATOR_ID = 'field-fronts.seeded-map-generator.v1';
const FIRST_NIGHT_GENERATOR_ID = 'black-sky-bound.first-night-blockout.v0';
const OUTPOST_NAMES = Object.freeze([
  'Signal Knoll',
  'Ashford Watch',
  'Hearthstone Rise',
  'Mist Ford',
  'Crow Ridge',
  'Old Quarry',
  'Blueglass Hollow',
  'Warden Tor'
]);

export function createRandomMapSeed(prefix = 'front') {
  const entropy = `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(36)}`;
  return `${prefix}-${entropy}`;
}

export function createFirstNightMap({ seed = 'first-night-opening' } = {}) {
  const map = createBlankMap({ width: 64, height: 40, fill: 'forest' });
  paintEllipse(map, { x: 8, y: 21, rx: 8, ry: 7 }, 'land', 0.2);
  paintTrail(map, [
    { x: 12, y: 21 },
    { x: 21, y: 18 },
    { x: 29, y: 16 },
    { x: 37, y: 19 },
    { x: 45, y: 23 },
    { x: 54, y: 19 }
  ], 2, 'land', 0.22);
  paintEllipse(map, { x: 31, y: 16, rx: 7, ry: 5 }, 'forest', 0.25);
  paintEllipse(map, { x: 38, y: 19, rx: 5, ry: 5 }, 'land', 0.3);
  paintTrail(map, [{ x: 44, y: 5 }, { x: 44, y: 35 }], 1, 'river', 0.09);
  paintEllipse(map, { x: 44, y: 23, rx: 2, ry: 2 }, 'land', 0.12);
  paintEllipse(map, { x: 52, y: 21, rx: 4, ry: 4 }, 'forest', 0.23);
  paintEllipse(map, { x: 59, y: 18, rx: 4, ry: 6 }, 'mountains', 0.84);
  paintEllipse(map, { x: 56, y: 19, rx: 3, ry: 3 }, 'forest', 0.3);

  const shelterNodes = createFirstNightShelterNodes();
  const start = { x: 7, y: 21 };
  const generatedAt = new Date().toISOString();
  map.scenario = {
    generator: {
      id: FIRST_NIGHT_GENERATOR_ID,
      seed,
      preset: 'first_night_blockout',
      targetTextureSize: 2048,
      scenarioPreset: 'first_night',
      generatedAt
    },
    metadata: {
      type: 'opening_survival_tutorial',
      biomeTheme: 'naturalistic_nomadic_wilderness',
      techLevel: 'tribal_nomadic',
      allowedHumanTech: ['bows', 'arrows', 'torches', 'rudimentary tents', 'hand-carried supplies']
    },
    sections: [
      { id: 'exposed_start', label: 'Exposed grassland start', tile: { x: 7, y: 21 } },
      { id: 'animal_trail', label: 'Sparse tree animal trail', tile: { x: 18, y: 19 } },
      { id: 'canopy_chain', label: 'Dense canopy shelter chain', tile: { x: 28, y: 16 } },
      { id: 'boulder_cluster', label: 'Boulder cluster', tile: { x: 37, y: 19 } },
      { id: 'muddy_crossing', label: 'Muddy stream and reed crossing', tile: { x: 44, y: 23 } },
      { id: 'thorn_choke', label: 'Thorn scrub and fallen tree choke', tile: { x: 50, y: 21 } },
      { id: 'final_shelter', label: 'Shallow cave beneath a cliff overhang', tile: { x: 56, y: 19 } }
    ],
    starts: { player: start },
    neutralOutposts: [],
    sceneEntity: createFirstNightSceneEntity({ start, shelterNodes })
  };
  map.scenario.scenarioLayer = createScenarioLayerForMap(map, { seed: `${seed}:scenario`, preset: 'first_night' });
  ensureScenarioCatalogueForMap(map, { seed: `${seed}:scenario`, preset: 'first_night' });
  map.provenance = {
    source: 'black-sky-bound-first-night-blockout',
    seed,
    preset: 'first_night_blockout',
    generatedAt
  };
  map.revision = (map.revision ?? 0) + 1;
  return map;
}

export function normaliseMapPreset(preset = 'frontier_2k') {
  if (typeof preset === 'string' && MAP_GENERATION_PRESETS[preset]) {
    return MAP_GENERATION_PRESETS[preset];
  }
  if (preset && typeof preset === 'object') {
    const base = MAP_GENERATION_PRESETS[preset.id] ?? MAP_GENERATION_PRESETS.frontier_2k;
    return Object.freeze({
      ...base,
      ...preset,
      width: clampInteger(preset.width, 32, 160, base.width),
      height: clampInteger(preset.height, 24, 120, base.height),
      targetTextureSize: clampInteger(preset.targetTextureSize, 1024, 4096, base.targetTextureSize),
      neutralOutpostCount: clampInteger(preset.neutralOutpostCount, 0, 8, base.neutralOutpostCount)
    });
  }
  return MAP_GENERATION_PRESETS.frontier_2k;
}

export function createSeededMap({ seed = createRandomMapSeed(), preset = 'frontier_2k', scenarioPreset = 'black_sky_arrival' } = {}) {
  const mapPreset = normaliseMapPreset(preset);
  const rng = createSeededRng(`${seed}:${mapPreset.id}`);
  const map = createBlankMap({ width: mapPreset.width, height: mapPreset.height, fill: 'sea' });
  const riverPaths = createRiverPaths(map, mapPreset, rng);
  const seaLevel = 0.37 + (rng() - 0.5) * 0.04;

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const nx = x / Math.max(1, map.width - 1);
      const ny = y / Math.max(1, map.height - 1);
      const edge = edgeFalloff(nx, ny);
      const continent = fbm2(seed, nx, ny, [
        [1.35, 1.0, 0.56],
        [2.8, 2.2, 0.28],
        [6.2, 5.5, 0.16],
        [13.0, 11.0, 0.08]
      ]);
      const ridge = Math.abs(fbm2(`${seed}:ridge`, nx + 0.21, ny - 0.13, [
        [3.2, 4.8, 0.62],
        [7.5, 9.2, 0.28],
        [14.0, 15.0, 0.1]
      ]) - 0.5) * 2;
      const moisture = fbm2(`${seed}:moisture`, nx - 0.15, ny + 0.27, [
        [1.8, 1.4, 0.52],
        [4.8, 4.2, 0.31],
        [10.5, 9.8, 0.17]
      ]);
      const coastLift = edge * 0.68;
      const altitude = clamp01(continent * 0.78 + ridge * ridge * 0.28 + coastLift - 0.18);
      const river = nearestRiverDistance(x, y, riverPaths);
      const riverWidth = 1.0 + Math.floor(rngFromTile(seed, x, y, 'river-width') * 2);

      let terrainId = 'land';
      if (altitude < seaLevel || edge < 0.08) {
        terrainId = 'sea';
      } else if (river.distance <= riverWidth && altitude < 0.72 && edge > 0.18) {
        terrainId = 'river';
      } else if (altitude > 0.69 + mapPreset.mountainBias * 0.05 && ridge > 0.58) {
        terrainId = 'mountains';
      } else if (moisture > mapPreset.forestBias && altitude < 0.72) {
        terrainId = 'forest';
      }

      setTile(map, x, y, terrainId);
      const terrainBase = getTerrain(terrainId).field.height;
      const finalElevation = terrainId === 'sea'
        ? Math.min(0.08, altitude * 0.16)
        : terrainId === 'river'
          ? Math.max(0.07, Math.min(0.18, altitude * 0.3))
          : clamp01(terrainBase * 0.42 + altitude * 0.58);
      setElevation(map, x, y, finalElevation);
    }
  }

  const starts = chooseScenarioStarts(map, seed);
  const neutralOutposts = chooseNeutralOutposts(map, seed, starts, mapPreset.neutralOutpostCount);
  map.scenario = {
    generator: {
      id: GENERATOR_ID,
      seed,
      preset: mapPreset.id,
      targetTextureSize: mapPreset.targetTextureSize,
      scenarioPreset,
      generatedAt: new Date().toISOString()
    },
    starts,
    neutralOutposts
  };
  map.scenario.scenarioLayer = createScenarioLayerForMap(map, { seed: `${seed}:scenario`, preset: scenarioPreset });
  ensureScenarioCatalogueForMap(map, { seed: `${seed}:scenario`, preset: scenarioPreset });
  map.provenance = {
    source: 'field-fronts-seeded-map-generator',
    seed,
    preset: mapPreset.id,
    generatedAt: map.scenario.generator.generatedAt
  };
  map.revision = (map.revision ?? 0) + 1;
  return map;
}

function createFirstNightShelterNodes() {
  const definitions = [
    { id: 'shelter_start_exposed', type: 'EXPOSED_CLEARING', position: { x: 7, y: 21 }, region: 'exposed_start' },
    { id: 'shelter_first_trees', type: 'LIGHT_TREE_COVER', position: { x: 18, y: 19 }, region: 'animal_trail' },
    { id: 'shelter_canopy_01', type: 'DENSE_CANOPY', position: { x: 26, y: 16 }, region: 'canopy_chain' },
    { id: 'shelter_canopy_02', type: 'ROOT_HOLLOW', position: { x: 31, y: 16 }, region: 'canopy_chain' },
    { id: 'shelter_boulders', type: 'BOULDER_COVER', position: { x: 37, y: 19 }, region: 'boulder_cluster' },
    { id: 'shelter_reeds', type: 'REED_BED', position: { x: 43, y: 23 }, region: 'muddy_crossing' },
    { id: 'shelter_bank_hollow', type: 'RIVERBANK_HOLLOW', position: { x: 46, y: 23 }, region: 'muddy_crossing' },
    { id: 'shelter_thorns', type: 'THORN_SCRUB', position: { x: 50, y: 21 }, region: 'thorn_choke' },
    { id: 'shelter_fallen_tree', type: 'FALLEN_LOG', position: { x: 52, y: 20 }, region: 'thorn_choke' },
    { id: 'shelter_overhang', type: 'CLIFF_OVERHANG', position: { x: 55, y: 19 }, region: 'final_shelter' },
    { id: 'shelter_final_cave', type: 'SHALLOW_CAVE', position: { x: 56, y: 19 }, region: 'final_shelter' },
    { id: 'shelter_mist', type: 'MIST_PATCH', position: { x: 41, y: 21 }, region: 'muddy_crossing' }
  ];
  return definitions.map((node) => ({
    ...node,
    label: SHELTER_NODE_TYPES[node.type].label,
    shelterRating: SHELTER_NODE_TYPES[node.type].shelterRating,
    visibilityModifier: SHELTER_NODE_TYPES[node.type].visibilityModifier,
    movementModifier: SHELTER_NODE_TYPES[node.type].movementModifier,
    tags: [...SHELTER_NODE_TYPES[node.type].tags]
  }));
}

function paintEllipse(map, { x: centreX, y: centreY, rx, ry }, terrainId, elevation) {
  for (let y = Math.max(0, centreY - ry); y <= Math.min(map.height - 1, centreY + ry); y += 1) {
    for (let x = Math.max(0, centreX - rx); x <= Math.min(map.width - 1, centreX + rx); x += 1) {
      if (((x - centreX) / Math.max(1, rx)) ** 2 + ((y - centreY) / Math.max(1, ry)) ** 2 <= 1) {
        setTile(map, x, y, terrainId);
        setElevation(map, x, y, elevation);
      }
    }
  }
}

function paintTrail(map, points, radius, terrainId, elevation) {
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const steps = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) * 2));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      paintEllipse(map, {
        x: Math.round(start.x + (end.x - start.x) * t),
        y: Math.round(start.y + (end.y - start.y) * t),
        rx: radius,
        ry: radius
      }, terrainId, elevation);
    }
  }
}

function createRiverPaths(map, preset, rng) {
  return Array.from({ length: preset.riverCount }, (_, index) => {
    const vertical = index % 2 === 0;
    const startBand = 0.2 + rng() * 0.6;
    const amplitude = 0.08 + rng() * 0.08;
    const phase = rng() * Math.PI * 2;
    const frequency = 1.4 + rng() * 1.8;
    const points = [];
    const steps = vertical ? map.height : map.width;
    for (let i = 0; i < steps; i += 1) {
      const t = i / Math.max(1, steps - 1);
      const bend = Math.sin(t * Math.PI * frequency + phase) * amplitude
        + Math.sin(t * Math.PI * (frequency * 0.47 + 0.8) + phase * 0.31) * amplitude * 0.54;
      const cross = clamp01(startBand + bend);
      points.push(vertical
        ? { x: Math.round(cross * (map.width - 1)), y: i }
        : { x: i, y: Math.round(cross * (map.height - 1)) });
    }
    return points;
  });
}

function nearestRiverDistance(x, y, riverPaths) {
  let best = Infinity;
  for (const path of riverPaths) {
    for (const point of path) {
      const distance = Math.hypot(point.x - x, point.y - y);
      if (distance < best) best = distance;
      if (best <= 0.5) return { distance: best };
    }
  }
  return { distance: best };
}

function chooseScenarioStarts(map, seed) {
  const playerTarget = { x: Math.round(map.width * 0.13), y: Math.round(map.height * (0.42 + rngFromTile(seed, 2, 4, 'pstart') * 0.18)) };
  const enemyTarget = { x: Math.round(map.width * 0.87), y: Math.round(map.height * (0.42 + rngFromTile(seed, 5, 7, 'estart') * 0.18)) };
  const player = chooseViableTile(map, playerTarget, { minLogistics: 0.28 });
  const enemy = chooseViableTile(map, enemyTarget, { avoid: [player], minDistance: Math.min(map.width, map.height) * 0.42, minLogistics: 0.28 });
  return { player, enemy };
}

function chooseNeutralOutposts(map, seed, starts, count) {
  const anchors = createNeutralOutpostAnchors(map, count, seed);
  const chosen = [starts.player, starts.enemy];
  const outposts = [];
  anchors.forEach((target, index) => {
    const tile = chooseViableTile(map, target, {
      avoid: chosen,
      minDistance: Math.max(7, Math.min(map.width, map.height) * 0.13),
      minLogistics: 0.24,
      preferHighGround: true
    });
    chosen.push(tile);
    outposts.push({
      id: `outpost_neutral_${String(index + 1).padStart(2, '0')}`,
      name: OUTPOST_NAMES[index % OUTPOST_NAMES.length],
      tile,
      supply: round3(0.48 + rngFromTile(seed, tile.x, tile.y, 'supply') * 0.34)
    });
  });
  return outposts;
}

function createNeutralOutpostAnchors(map, count, seed) {
  if (count <= 1) {
    return [{ x: Math.round(map.width * 0.5), y: Math.round(map.height * 0.5) }];
  }
  return Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 0.5 : index / (count - 1);
    const sideBias = index % 2 === 0 ? -0.18 : 0.18;
    const jitterX = (rngFromTile(seed, index, 0, 'outpost-x') - 0.5) * 0.16;
    const jitterY = (rngFromTile(seed, index, 1, 'outpost-y') - 0.5) * 0.18;
    return {
      x: Math.round(map.width * clamp01(0.36 + t * 0.28 + jitterX)),
      y: Math.round(map.height * clamp01(0.26 + t * 0.48 + sideBias + jitterY))
    };
  });
}

function chooseViableTile(map, target, { avoid = [], minDistance = 0, minLogistics = 0.22, preferHighGround = false } = {}) {
  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let y = 1; y < map.height - 1; y += 1) {
    for (let x = 1; x < map.width - 1; x += 1) {
      const terrain = getTerrain(getTile(map, x, y));
      if (terrain.field.passability < 0.45 || terrain.field.logistics < minLogistics || terrain.id === 'river' || terrain.id === 'sea') {
        continue;
      }
      if (avoid.some((tile) => tile && Math.hypot(tile.x - x, tile.y - y) < minDistance)) {
        continue;
      }
      const elevation = getElevation(map, x, y);
      const score = Math.hypot(target.x - x, target.y - y)
        - terrain.field.logistics * 1.8
        - (preferHighGround ? elevation * 2.8 : elevation * 0.8)
        + (terrain.id === 'forest' ? 0.5 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }
  return best ?? {
    x: clampInteger(target.x, 1, map.width - 2, Math.floor(map.width / 2)),
    y: clampInteger(target.y, 1, map.height - 2, Math.floor(map.height / 2))
  };
}

function edgeFalloff(nx, ny) {
  const edge = Math.min(nx, ny, 1 - nx, 1 - ny) * 2;
  return smoothstep(0.0, 0.55, edge);
}

function fbm2(seed, nx, ny, octaves) {
  let total = 0;
  let weight = 0;
  octaves.forEach(([fx, fy, amplitude]) => {
    total += valueNoise(seed, nx * fx, ny * fy) * amplitude;
    weight += amplitude;
  });
  return weight > 0 ? total / weight : 0;
}

function valueNoise(seed, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const sx = smootherstep(x - x0);
  const sy = smootherstep(y - y0);
  const n00 = hashUnit(`${seed}:${x0}:${y0}`);
  const n10 = hashUnit(`${seed}:${x1}:${y0}`);
  const n01 = hashUnit(`${seed}:${x0}:${y1}`);
  const n11 = hashUnit(`${seed}:${x1}:${y1}`);
  return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sy);
}

function createSeededRng(seed) {
  let state = hash32(seed) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngFromTile(seed, x, y, salt) {
  return hashUnit(`${seed}:${salt}:${x}:${y}`);
}

function hashUnit(value) {
  return hash32(value) / 4294967295;
}

function hash32(value) {
  const input = String(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / Math.max(0.000001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function smootherstep(value) {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function clampInteger(value, min, max, fallback) {
  const numeric = Math.round(Number(value));
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function round3(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}
