import { SceneObjectType } from './sceneObjects.js';

export const FoliageFirePhase = Object.freeze({
  ABLAZE: 'ablaze',
  SMOULDER_HIGH: 'smoulder_high',
  SMOULDER_LOW: 'smoulder_low',
  BURNT_OUT: 'burnt_out'
});

export const FOLIAGE_FIRE_STATE = Object.freeze({
  contract: 'black-sky-bound.foliage-fire-state.v1',
  policy: 'runtime_foliage_state_derived_from_direct_inferno_contact',
  ignitionPaddingTiles: 0.86,
  maxIgnitionsPerWall: Object.freeze({ tree: 6, undergrowth: 12 }),
  timing: Object.freeze({
    tree: Object.freeze({ ablazeEndSeconds: 3, smoulderHighEndSeconds: 8, smoulderLowEndSeconds: 16, residualEndSeconds: 26 }),
    undergrowth: Object.freeze({ ablazeEndSeconds: 2, smoulderHighEndSeconds: 6, smoulderLowEndSeconds: 12, residualEndSeconds: 18 })
  })
});

const FOLIAGE_FAMILY_BY_TYPE = new Map([
  [SceneObjectType.TREE, 'tree'],
  [SceneObjectType.BIRCH_TREE, 'tree'],
  [SceneObjectType.DEAD_SNAG, 'tree'],
  [SceneObjectType.FERN_PATCH, 'fern'],
  [SceneObjectType.SMOULDERING_FERN, 'fern'],
  [SceneObjectType.FOREST_SHRUB, 'shrub'],
  [SceneObjectType.SMOULDERING_BRAMBLE, 'bramble']
]);

export function updateFoliageFireStates(sceneObjects = [], fireWalls = [], dt = 0) {
  const delta = Math.max(0, Number(dt) || 0);
  const ignitedByFamily = { tree: 0, fern: 0, shrub: 0, bramble: 0 };
  const newlyIgnited = new Set();
  const activeWalls = fireWalls.filter((wall) => wall && wall.age < wall.lifetime).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  for (const wall of activeWalls) igniteNearestFoliageForWall(sceneObjects, wall, ignitedByFamily, newlyIgnited);
  for (const object of sceneObjects) {
    const fire = object?.materialState?.foliageFire;
    if (!fire) continue;
    if (!newlyIgnited.has(object.id) && (fire.phase !== FoliageFirePhase.BURNT_OUT || fire.age < fire.timing.residualEndSeconds)) fire.age += delta;
    applyFoliageFireEnvelope(object.materialState, fire);
  }
  const totals = countFoliageFireStates(sceneObjects);
  return {
    ignitedCount: Object.values(ignitedByFamily).reduce((sum, count) => sum + count, 0),
    ignitedByFamily,
    activeCount: totals.active,
    burntCount: totals.burnt,
    totalCount: totals.total,
    activeByFamily: totals.activeByFamily,
    burntByFamily: totals.burntByFamily
  };
}

export function buildFoliageFireLightViews(sceneObjects = [], renderTime = 0) {
  return sceneObjects.flatMap((object) => {
    const fire = object?.materialState?.foliageFire;
    if (!fire || fire.heatAmount <= 0.015 && fire.emberAmount <= 0.015) return [];
    const isTree = fire.family === 'tree';
    if (!isTree && fire.phase === FoliageFirePhase.BURNT_OUT) return [];
    const nodeCount = isTree && fire.phase !== FoliageFirePhase.BURNT_OUT ? 2 : 1;
    const strength = clamp01(Math.max(fire.heatAmount, fire.emberAmount * 0.62));
    return Array.from({ length: nodeCount }, (_, index) => {
      const side = nodeCount === 1 ? 0 : index === 0 ? -0.36 : 0.36;
      const pulse = 0.9 + Math.sin(renderTime * 7.2 + fire.seed * 0.03 + index * 2.1) * 0.1;
      const active = clamp01(strength * pulse);
      const heightOffset = isTree ? 0.28 + (index % 2) * 0.18 : 0.04;
      return {
        id: `${object.id}:foliage_fire_light:${index}`,
        x: object.visualX + side,
        y: object.visualY + heightOffset,
        radius: (isTree ? 2.3 : 1.05) + active * (isTree ? 1.7 : 0.85),
        intensity: 0.16 + active * (isTree ? 0.62 : 0.46),
        revealRadius: (isTree ? 3.1 : 1.5) + active * (isTree ? 2.1 : 1.1),
        revealStrength: 0.2 + active * 0.72,
        glowRadius: (isTree ? 1.4 : 0.7) + active * (isTree ? 1.45 : 0.72),
        glowStrength: 0.18 + active * 0.68,
        coreRadius: (isTree ? 0.22 : 0.12) + active * (isTree ? 0.22 : 0.12),
        coreStrength: 0.34 + active * 0.62,
        softness: 0.82,
        colour: 'rgba(255, 82, 18, 1)',
        innerColour: 'rgba(255, 214, 96, 1)',
        flickerAmount: 0.22,
        flickerSpeed: 8.2,
        flickerPhase: fire.seed * 0.07 + index,
        renderTime,
        enabled: true,
        sourceEntity: object.id,
        sourceKind: 'burning_foliage_fire',
        physicalShadowLod: 'non_shadowing_distributed_fire_light',
        sourcePolicy: 'runtime_foliage_fire_material_state_light_projection',
        sourceAnchor: { type: 'scene_object', id: object.id, objectType: object.type },
        ambientParticleKind: 'foliage_fire_ember',
        shadowPriority: isTree ? 170 : 154,
        shadow: { sourceHeight: isTree ? 'tree_canopy_fire' : 'undergrowth_fire', lengthScale: 1.08, opacityScale: 0.94, heightScale: isTree ? 0.72 : 0.28 }
      };
    });
  });
}

export function buildFoliageFireSmokeSourceViews(sceneObjects = []) {
  return sceneObjects.flatMap((object) => {
    const fire = object?.materialState?.foliageFire;
    if (!fire || fire.smokeAmount <= 0.015) return [];
    const isTree = fire.family === 'tree';
    if (!isTree && fire.phase === FoliageFirePhase.BURNT_OUT) return [];
    const nodeCount = isTree && fire.phase !== FoliageFirePhase.BURNT_OUT ? 2 : 1;
    return Array.from({ length: nodeCount }, (_, index) => ({
      id: `${object.id}:foliage_fire_smoke:${index}`,
      sourceKind: 'burning_foliage_smoke',
      sourceId: object.id,
      x: object.visualX + (nodeCount === 1 ? 0 : index === 0 ? -0.34 : 0.38),
      y: object.visualY - (isTree ? 0.38 + index * 0.24 : 0.08),
      radius: (isTree ? 0.74 + index * 0.18 : 0.42) * (0.72 + fire.smokeAmount * 0.72),
      density: 0.48 + fire.smokeAmount * 0.46,
      opacity: 0.42 + fire.smokeAmount * 0.42,
      age: fire.age,
      lifetime: fire.timing.residualEndSeconds,
      driftScale: isTree ? 0.58 : 0.42,
      renderPriority: isTree ? 116 : 114,
      classification: 'derived_smoke_source_view',
      shape: isTree ? 'rising_burning_tree_plume' : 'rising_burning_undergrowth_plume',
      forwardX: 0.16,
      forwardY: -1
    }));
  });
}

export function countFoliageFireStates(sceneObjects = []) {
  const result = {
    active: 0,
    burnt: 0,
    total: 0,
    activeByFamily: { tree: 0, fern: 0, shrub: 0, bramble: 0 },
    burntByFamily: { tree: 0, fern: 0, shrub: 0, bramble: 0 }
  };
  for (const object of sceneObjects) {
    const fire = object?.materialState?.foliageFire;
    if (!fire) continue;
    result.total += 1;
    if (fire.phase === FoliageFirePhase.BURNT_OUT) {
      result.burnt += 1;
      result.burntByFamily[fire.family] = (result.burntByFamily[fire.family] ?? 0) + 1;
    } else {
      result.active += 1;
      result.activeByFamily[fire.family] = (result.activeByFamily[fire.family] ?? 0) + 1;
    }
  }
  return result;
}

function igniteNearestFoliageForWall(sceneObjects, wall, ignitedByFamily, newlyIgnited) {
  const existing = { tree: 0, undergrowth: 0 };
  for (const object of sceneObjects) {
    const fire = object?.materialState?.foliageFire;
    if (fire?.sourceWallId !== wall.id) continue;
    existing[fire.family === 'tree' ? 'tree' : 'undergrowth'] += 1;
  }
  const candidates = sceneObjects
    .map((object) => ({ object, family: foliageFamily(object), distance: foliageDistanceToWall(object, wall) }))
    .filter((entry) => entry.family && !entry.object?.materialState?.foliageFire && entry.distance <= ignitionRadius(entry.object, wall))
    .sort((first, second) => first.distance - second.distance || String(first.object.id).localeCompare(String(second.object.id)));
  for (const entry of candidates) {
    const capFamily = entry.family === 'tree' ? 'tree' : 'undergrowth';
    if (existing[capFamily] >= FOLIAGE_FIRE_STATE.maxIgnitionsPerWall[capFamily]) continue;
    const materialState = ensureMaterialState(entry.object);
    materialState.foliageFire = createFoliageFireState(entry.object, wall, entry.family);
    newlyIgnited.add(entry.object.id);
    existing[capFamily] += 1;
    ignitedByFamily[entry.family] = (ignitedByFamily[entry.family] ?? 0) + 1;
  }
}

function createFoliageFireState(object, wall, family) {
  const timing = family === 'tree' ? FOLIAGE_FIRE_STATE.timing.tree : FOLIAGE_FIRE_STATE.timing.undergrowth;
  return {
    contract: FOLIAGE_FIRE_STATE.contract,
    sourceWallId: wall.id,
    family,
    phase: FoliageFirePhase.ABLAZE,
    age: 0,
    phaseProgress: 0,
    heatAmount: 1,
    emberAmount: 0.82,
    smokeAmount: 0.62,
    charAmount: 0.18,
    seed: stableSeed(`${object.id}:${wall.id}`),
    timing
  };
}

function applyFoliageFireEnvelope(materialState, fire) {
  const timing = fire.timing;
  const age = Math.max(0, fire.age);
  if (age < timing.ablazeEndSeconds) {
    const t = age / timing.ablazeEndSeconds;
    assignEnvelope(fire, FoliageFirePhase.ABLAZE, t, lerp(1, 0.88, t), lerp(0.82, 0.94, t), lerp(0.62, 0.88, t), lerp(0.18, 0.4, t));
  } else if (age < timing.smoulderHighEndSeconds) {
    const t = inverseLerp(timing.ablazeEndSeconds, timing.smoulderHighEndSeconds, age);
    assignEnvelope(fire, FoliageFirePhase.SMOULDER_HIGH, t, lerp(0.88, 0.56, t), lerp(0.94, 0.68, t), lerp(0.88, 0.94, t), lerp(0.4, 0.7, t));
  } else if (age < timing.smoulderLowEndSeconds) {
    const t = inverseLerp(timing.smoulderHighEndSeconds, timing.smoulderLowEndSeconds, age);
    assignEnvelope(fire, FoliageFirePhase.SMOULDER_LOW, t, lerp(0.56, 0.14, t), lerp(0.68, 0.28, t), lerp(0.94, 0.5, t), lerp(0.7, 0.96, t));
  } else {
    const t = clamp01(inverseLerp(timing.smoulderLowEndSeconds, timing.residualEndSeconds, age));
    assignEnvelope(fire, FoliageFirePhase.BURNT_OUT, t, fire.family === 'tree' ? lerp(0.11, 0, t) : 0, fire.family === 'tree' ? lerp(0.24, 0.03, t) : 0, fire.family === 'tree' ? lerp(0.48, 0, t) : 0, 1);
  }
  materialState.burnAmount = fire.charAmount;
  materialState.damageAmount = Math.max(Number(materialState.damageAmount) || 0, fire.charAmount * 0.44);
  materialState.integrity = Math.min(Number(materialState.integrity) || 1, 1 - fire.charAmount * 0.18);
  materialState.nightReveal = Math.max(Number(materialState.nightReveal) || 0, 0.5 + fire.heatAmount * 0.5);
}

function assignEnvelope(fire, phase, progress, heatAmount, emberAmount, smokeAmount, charAmount) {
  fire.phase = phase;
  fire.phaseProgress = clamp01(progress);
  fire.heatAmount = clamp01(heatAmount);
  fire.emberAmount = clamp01(emberAmount);
  fire.smokeAmount = clamp01(smokeAmount);
  fire.charAmount = clamp01(charAmount);
}

function foliageFamily(object) { return FOLIAGE_FAMILY_BY_TYPE.get(object?.type) ?? null; }
function foliageDistanceToWall(object, wall) { return distanceToSegment(object.x, object.y, wall); }
function ignitionRadius(object, wall) {
  const family = foliageFamily(object);
  const fallback = family === 'tree' ? 0.7 : 0.34;
  const radius = Math.min(family === 'tree' ? 1.35 : 0.78, Math.max(0.22, Number(object.occlusion?.radius) || fallback));
  return wall.width * 0.5 + radius + FOLIAGE_FIRE_STATE.ignitionPaddingTiles;
}
function distanceToSegment(x, y, wall) {
  const dx = wall.bx - wall.ax;
  const dy = wall.by - wall.ay;
  const lengthSquared = dx * dx + dy * dy || 1;
  const t = clamp01(((x - wall.ax) * dx + (y - wall.ay) * dy) / lengthSquared);
  return Math.hypot(x - (wall.ax + dx * t), y - (wall.ay + dy * t));
}
function ensureMaterialState(object) {
  if (!object.materialState || typeof object.materialState !== 'object') object.materialState = {};
  return object.materialState;
}
function stableSeed(value) {
  let hash = 2166136261;
  for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}
function inverseLerp(a, b, value) { return b === a ? 0 : (value - a) / (b - a); }
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
