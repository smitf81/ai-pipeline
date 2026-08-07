import { SceneObjectType } from './sceneObjects.js';

export const TreeFirePhase = Object.freeze({
  ENGULFED: 'engulfed',
  SIMMER_HIGH: 'simmer_high',
  SIMMER_LOW: 'simmer_low',
  BURNT_OUT: 'burnt_out'
});

export const TREE_FIRE_STATE = Object.freeze({
  contract: 'black-sky-bound.scene-object.tree-fire-lifecycle.v0',
  policy: 'runtime_scene_object_state_derived_from_world_fire_contact',
  ignitionPaddingTiles: 0.86,
  maxIgnitionsPerWall: 6,
  timing: Object.freeze({
    engulfedEndSeconds: 4.2,
    simmerHighEndSeconds: 8.4,
    simmerLowEndSeconds: 14.8,
    smokeEndSeconds: 26
  })
});

const IGNITABLE_TREE_TYPES = new Set([
  SceneObjectType.TREE,
  SceneObjectType.BIRCH_TREE,
  SceneObjectType.DEAD_SNAG
]);

export function updateTreeFireStates(sceneObjects = [], fireWalls = [], dt = 0) {
  const delta = Math.max(0, Number(dt) || 0);
  let ignitedCount = 0;
  for (const object of sceneObjects) {
    if (!isIgnitableTree(object)) continue;
    const materialState = ensureMaterialState(object);
    if (!materialState.treeFire) {
      const sourceWall = fireWalls.find((wall) => treeTouchesFireWall(object, wall));
      if (sourceWall && wallIgnitionCount(sceneObjects, sourceWall.id) < TREE_FIRE_STATE.maxIgnitionsPerWall) {
        materialState.treeFire = createTreeFireState(object, sourceWall);
        ignitedCount += 1;
      }
    } else {
      materialState.treeFire.age += delta;
    }
    if (materialState.treeFire) applyTreeFireEnvelope(materialState, materialState.treeFire);
  }
  return { ignitedCount, burningCount: countBurningTrees(sceneObjects) };
}

export function buildTreeFireLightViews(sceneObjects = [], renderTime = 0) {
  return sceneObjects.flatMap((object) => {
    const fire = object?.materialState?.treeFire;
    if (!fire || fire.heatAmount <= 0.015 && fire.emberAmount <= 0.015) return [];
    const nodeCount = fire.phase === TreeFirePhase.ENGULFED || fire.phase === TreeFirePhase.SIMMER_HIGH ? 2 : 1;
    const strength = clamp01(Math.max(fire.heatAmount, fire.emberAmount * 0.62));
    return Array.from({ length: nodeCount }, (_, index) => {
      const side = nodeCount === 1 ? 0 : index === 0 ? -0.36 : 0.36;
      const pulse = 0.9 + Math.sin(renderTime * 7.2 + fire.seed * 0.03 + index * 2.1) * 0.1;
      const active = clamp01(strength * pulse);
      return {
        id: `${object.id}:tree_fire_light:${index}`,
        x: object.visualX + side,
        y: object.visualY + 0.28 + (index % 2) * 0.18,
        radius: 2.3 + active * 1.7,
        intensity: 0.18 + active * 0.62,
        revealRadius: 3.1 + active * 2.1,
        revealStrength: 0.2 + active * 0.72,
        glowRadius: 1.4 + active * 1.45,
        glowStrength: 0.18 + active * 0.68,
        coreRadius: 0.22 + active * 0.22,
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
        sourceKind: 'burning_tree_fire',
        sourcePolicy: 'runtime_tree_fire_material_state_light_projection',
        sourceAnchor: { type: 'scene_object', id: object.id, objectType: object.type },
        ambientParticleKind: 'tree_fire_ember',
        shadowPriority: 170,
        shadow: { sourceHeight: 'tree_canopy_fire', lengthScale: 1.08, opacityScale: 0.94, heightScale: 0.72 }
      };
    });
  });
}

export function buildTreeFireSmokeSourceViews(sceneObjects = []) {
  return sceneObjects.flatMap((object) => {
    const fire = object?.materialState?.treeFire;
    if (!fire || fire.smokeAmount <= 0.015) return [];
    const nodeCount = fire.phase === TreeFirePhase.BURNT_OUT ? 1 : 2;
    return Array.from({ length: nodeCount }, (_, index) => ({
      id: `${object.id}:tree_fire_smoke:${index}`,
      sourceKind: 'burning_tree_smoke',
      sourceId: object.id,
      x: object.visualX + (index === 0 ? -0.34 : 0.38),
      y: object.visualY - 0.38 - index * 0.24,
      radius: (0.74 + index * 0.18) * (0.72 + fire.smokeAmount * 0.72),
      density: 0.48 + fire.smokeAmount * 0.46,
      opacity: 0.42 + fire.smokeAmount * 0.42,
      age: fire.age,
      lifetime: TREE_FIRE_STATE.timing.smokeEndSeconds,
      driftScale: 0.58,
      renderPriority: 116,
      classification: 'derived_smoke_source_view',
      shape: 'rising_burning_tree_plume',
      forwardX: 0.16,
      forwardY: -1
    }));
  });
}

export function countBurningTrees(sceneObjects = []) {
  return sceneObjects.filter((object) => object?.materialState?.treeFire).length;
}

function createTreeFireState(object, wall) {
  return {
    contract: TREE_FIRE_STATE.contract,
    sourceWallId: wall.id,
    phase: TreeFirePhase.ENGULFED,
    age: 0,
    phaseProgress: 0,
    heatAmount: 1,
    emberAmount: 0.82,
    smokeAmount: 0.62,
    charAmount: 0.18,
    seed: stableSeed(`${object.id}:${wall.id}`)
  };
}

function applyTreeFireEnvelope(materialState, fire) {
  const timing = TREE_FIRE_STATE.timing;
  const age = Math.max(0, fire.age);
  if (age < timing.engulfedEndSeconds) {
    const t = age / timing.engulfedEndSeconds;
    assignEnvelope(fire, TreeFirePhase.ENGULFED, t, lerp(1, 0.88, t), lerp(0.82, 0.94, t), lerp(0.62, 0.88, t), lerp(0.18, 0.4, t));
  } else if (age < timing.simmerHighEndSeconds) {
    const t = inverseLerp(timing.engulfedEndSeconds, timing.simmerHighEndSeconds, age);
    assignEnvelope(fire, TreeFirePhase.SIMMER_HIGH, t, lerp(0.88, 0.56, t), lerp(0.94, 0.68, t), lerp(0.88, 0.94, t), lerp(0.4, 0.7, t));
  } else if (age < timing.simmerLowEndSeconds) {
    const t = inverseLerp(timing.simmerHighEndSeconds, timing.simmerLowEndSeconds, age);
    assignEnvelope(fire, TreeFirePhase.SIMMER_LOW, t, lerp(0.56, 0.14, t), lerp(0.68, 0.28, t), lerp(0.94, 0.5, t), lerp(0.7, 0.96, t));
  } else {
    const t = clamp01(inverseLerp(timing.simmerLowEndSeconds, timing.smokeEndSeconds, age));
    assignEnvelope(fire, TreeFirePhase.BURNT_OUT, t, lerp(0.11, 0, t), lerp(0.24, 0.03, t), lerp(0.48, 0, t), 1);
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

function treeTouchesFireWall(object, wall) {
  if (!wall || wall.age >= wall.lifetime) return false;
  const radius = Math.min(1.35, Math.max(0.35, Number(object.occlusion?.radius) || 0.7));
  return distanceToSegment(object.x, object.y, wall) <= wall.width * 0.5 + radius + TREE_FIRE_STATE.ignitionPaddingTiles;
}

function distanceToSegment(x, y, wall) {
  const dx = wall.bx - wall.ax;
  const dy = wall.by - wall.ay;
  const lengthSquared = dx * dx + dy * dy || 1;
  const t = clamp01(((x - wall.ax) * dx + (y - wall.ay) * dy) / lengthSquared);
  return Math.hypot(x - (wall.ax + dx * t), y - (wall.ay + dy * t));
}

function wallIgnitionCount(sceneObjects, wallId) {
  return sceneObjects.filter((object) => object?.materialState?.treeFire?.sourceWallId === wallId).length;
}

function isIgnitableTree(object) {
  return IGNITABLE_TREE_TYPES.has(object?.type);
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

function inverseLerp(a, b, value) {
  return b === a ? 0 : (value - a) / (b - a);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}
