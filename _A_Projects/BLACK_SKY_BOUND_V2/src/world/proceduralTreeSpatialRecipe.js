import { PROCEDURAL_TREE_DEFINITION_CONTRACT } from '../data/proceduralTrees.js';
import { createCapsuleCollision, createCircleCollision } from '../physics/collisionShapes.js';
import { createTraversalModifier } from '../physics/traversalModifiers.js';
import { WORLD_SCALE } from '../data/worldScale.js';

export const PROCEDURAL_TREE_SPATIAL_RECIPE_CONTRACT = 'black-sky-bound.procedural-tree-spatial-recipe.v1';
export const PROCEDURAL_TREE_SKELETON_3D_CONTRACT = 'black-sky-bound.procedural-tree-skeleton-3d.v1';
export const TREE_ROOT_TRAVERSAL_MULTIPLIER = 0.88;

export function generateProceduralTreeSpatialRecipe(definition) {
  if (definition?.contract !== PROCEDURAL_TREE_DEFINITION_CONTRACT) {
    throw new Error(`procedural_tree_definition_contract_invalid:${definition?.contract ?? 'missing'}`);
  }
  const random = seededRandom(definition.seed);
  const trunk = buildTrunk(definition, random);
  const roots = buildRoots(definition, random);
  const branches = buildBranches(definition, trunk, random);
  const foliageClusters = buildFoliage(definition, trunk, branches, random);
  const collision = buildTrunkCollision(definition);
  const traversalModifiers = buildRootTraversal(definition, roots);
  return Object.freeze({
    contract: PROCEDURAL_TREE_SPATIAL_RECIPE_CONTRACT,
    definitionContract: definition.contract,
    seed: definition.seed,
    species: definition.species,
    form: definition.form,
    skeleton: Object.freeze({
      contract: PROCEDURAL_TREE_SKELETON_3D_CONTRACT,
      trunk,
      roots: Object.freeze(roots),
      branches: Object.freeze(branches),
      foliageClusters: Object.freeze(foliageClusters)
    }),
    collision,
    traversalModifiers: Object.freeze(traversalModifiers),
    material: Object.freeze({
      barkColour: definition.barkColour,
      barkMaterial: definition.barkMaterial,
      leafColour: seasonalLeafColour(definition),
      leafMaterial: seasonalLeafMaterial(definition),
      roughness: definition.form === 'conifer' ? 0.92 : 0.84,
      moss: definition.moss
    }),
    diagnostics: Object.freeze({
      trunkPointCount: trunk.points.length,
      rootCount: roots.length,
      branchCount: branches.length,
      foliageClusterCount: foliageClusters.length,
      radialSegments: Object.freeze({ trunk: 8, branch: 5, root: 6 }),
      hardColliderPrimitiveCount: 1,
      rootTraversalShapeCount: traversalModifiers.length
    })
  });
}

function buildTrunk(definition, random) {
  const count = 9 + Math.min(3, Math.floor(definition.branchLevels / 3));
  const direction = random() * Math.PI * 2;
  const points = [];
  for (let index = 0; index < count; index += 1) {
    const t = index / (count - 1);
    const bend = Math.pow(t, 1.55) * definition.bend * definition.heightMeters * 0.12;
    const curl = Math.sin(t * Math.PI * (1.25 + definition.twist) + definition.seed * 0.011)
      * definition.twist * definition.heightMeters * 0.025 * t;
    const buttress = 1 + definition.rootScale * 0.16 * Math.pow(1 - t, 4);
    points.push(point(
      Math.cos(direction) * bend + Math.cos(direction + Math.PI * 0.5) * curl,
      definition.heightMeters * t,
      Math.sin(direction) * bend + Math.sin(direction + Math.PI * 0.5) * curl,
      Math.max(definition.trunkRadiusMeters * 0.055, definition.trunkRadiusMeters * Math.pow(1 - t * 0.95, definition.taper) * buttress)
    ));
  }
  return Object.freeze({ id: 'trunk', kind: 'trunk', parentId: null, points: Object.freeze(points) });
}

function buildRoots(definition, random) {
  const count = 4 + Math.round(definition.rootScale * 1.3);
  return Array.from({ length: count }, (_, index) => {
    const angle = index / count * Math.PI * 2 + jitter(random, 0.28);
    const length = definition.trunkRadiusMeters * (1.55 + definition.rootScale * (0.55 + random() * 0.45));
    const bend = jitter(random, 0.34);
    const wiggle = jitter(random, 0.1);
    const phase = random() * Math.PI * 2;
    const shoulderScale = 0.92 + random() * 0.16;
    const burialScale = 0.86 + random() * 0.28;
    const samples = [0, 0.18, 0.42, 0.7, 1];
    return Object.freeze({
      id: `root:${index}`,
      kind: 'root',
      parentId: 'trunk',
      points: Object.freeze(samples.map((t) => {
        const run = Math.pow(t, 0.76);
        const rootAngle = angle
          + Math.sin(t * Math.PI) * bend
          + Math.sin(t * Math.PI * 2 + phase) * wiggle * t;
        const height = definition.trunkRadiusMeters * lerp(0.78, -0.075 * burialScale, Math.pow(t, 0.62));
        const radiusProfile = lerp(0.43 * shoulderScale, 0.075, Math.pow(t, 0.78));
        const shoulderWidth = Math.sin(t * Math.PI) * 0.035;
        const radius = definition.trunkRadiusMeters * (radiusProfile + shoulderWidth);
        return point(Math.cos(rootAngle) * length * run, height, Math.sin(rootAngle) * length * run, radius);
      }))
    });
  });
}

function buildBranches(definition, trunk, random) {
  const branches = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const levels = definition.branchLevels;
  for (let level = 0; level < levels; level += 1) {
    const levelT = levels === 1 ? 0.6 : level / (levels - 1);
    const trunkT = definition.crownStart + (1 - definition.crownStart) * (0.1 + levelT * 0.78);
    const branchCount = 2 + (random() < definition.branchDensity ? 1 : 0);
    for (let fork = 0; fork < branchCount; fork += 1) {
      if (random() > definition.branchDensity + 0.16) continue;
      const start = pointOnPolyline(trunk.points, trunkT + jitter(random, 0.025));
      const angle = (level * 2 + fork) * goldenAngle + definition.seed * 0.017 + jitter(random, 0.24);
      const conifer = definition.form === 'conifer';
      const length = definition.heightMeters * definition.canopySpread
        * (conifer ? 0.17 : 0.22) * (0.95 - levelT * (conifer ? 0.58 : 0.22)) * (0.78 + random() * 0.34);
      const rise = length * (conifer ? 0.16 + levelT * 0.32 : 0.28 + levelT * 0.2);
      const points = [
        point(start.x, start.y, start.z, start.radius * 0.42),
        point(start.x + Math.cos(angle) * length * 0.3, start.y + rise * 0.24, start.z + Math.sin(angle) * length * 0.3, start.radius * 0.32),
        point(start.x + Math.cos(angle + definition.twist * 0.3) * length * 0.68, start.y + rise * 0.62, start.z + Math.sin(angle + definition.twist * 0.3) * length * 0.68, start.radius * 0.16),
        point(start.x + Math.cos(angle + definition.twist * 0.5) * length, Math.min(definition.heightMeters * 1.02, start.y + rise), start.z + Math.sin(angle + definition.twist * 0.5) * length, Math.max(0.018, start.radius * 0.06))
      ];
      branches.push(Object.freeze({
        id: `branch:${branches.length}`,
        kind: 'branch',
        parentId: 'trunk',
        level: round(levelT),
        points: Object.freeze(points)
      }));
    }
  }
  return branches;
}

function buildFoliage(definition, trunk, branches, random) {
  const seasonal = definition.evergreen ? (definition.season === 'winter' ? 0.82 : 1)
    : definition.season === 'winter' ? 0.13 : definition.season === 'autumn' ? 0.66 : definition.season === 'spring' ? 0.78 : 1;
  const density = clamp01(definition.leafDensity * definition.health * seasonal);
  if (density < 0.03) return [];
  const output = [];
  for (const branch of branches) {
    const count = Math.max(1, Math.round((definition.form === 'conifer' ? 3.2 : 2.2) * density));
    for (let index = 0; index < count; index += 1) {
      if (random() > density + 0.18) continue;
      const t = 0.5 + index / Math.max(1, count) * 0.48;
      const source = pointOnPolyline(branch.points, t);
      const scale = definition.heightMeters * (definition.form === 'conifer' ? 0.055 : 0.072) * definition.canopySpread;
      output.push(cluster(output.length, branch.id, source, scale, definition, random));
    }
  }
  const crownCount = definition.form === 'conifer' ? 5 : 4;
  for (let index = 0; index < crownCount; index += 1) {
    const source = pointOnPolyline(trunk.points, 0.68 + index / Math.max(1, crownCount - 1) * 0.3);
    output.push(cluster(output.length, 'trunk', source, definition.heightMeters * 0.072 * definition.canopySpread, definition, random));
  }
  return output;
}

function cluster(index, parentId, source, scale, definition, random) {
  const conifer = definition.form === 'conifer';
  return Object.freeze({
    id: `foliage:${index}`,
    parentId,
    x: round(source.x + jitter(random, scale * 0.35)),
    y: round(source.y + jitter(random, scale * 0.22)),
    z: round(source.z + jitter(random, scale * 0.35)),
    radiusX: round(scale * (conifer ? 0.85 : 1.15) * (0.8 + random() * 0.38)),
    radiusY: round(scale * (conifer ? 1.15 : 0.78) * (0.78 + random() * 0.34)),
    radiusZ: round(scale * (0.82 + random() * 0.4)),
    rotationY: round(random() * Math.PI * 2),
    alpha: round(0.58 + definition.leafDensity * 0.4)
  });
}

function buildTrunkCollision(definition) {
  const trunkRadiusTiles = definition.trunkRadiusMeters / WORLD_SCALE.tileMeters;
  return createCircleCollision(0, 0, trunkRadiusTiles, {
    sourceKind: 'procedural_tree', species: definition.species, seed: definition.seed,
    policy: 'visible_trunk_circle_roots_traversable_canopy_excluded'
  });
}

function buildRootTraversal(definition, roots) {
  const scale = WORLD_SCALE.tileMeters;
  const modifiers = [];
  for (const root of roots) {
    for (let index = 0; index < root.points.length - 1; index += 1) {
      const a = root.points[index];
      const b = root.points[index + 1];
      const radius = Math.max(0.035, Math.min(a.radius, b.radius) / scale * 0.58);
      const source = {
        sourceKind: 'procedural_tree_root', species: definition.species, seed: definition.seed,
        rootId: root.id, segmentIndex: index, policy: 'visible_root_traversal_slowdown'
      };
      modifiers.push(createTraversalModifier(createCapsuleCollision(
        a.x / scale, a.z / scale, b.x / scale, b.z / scale, radius, source
      ), TREE_ROOT_TRAVERSAL_MULTIPLIER, source));
    }
  }
  return modifiers;
}

function pointOnPolyline(points, t) {
  const scaled = clamp01(t) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const a = points[index];
  const b = points[index + 1];
  return point(lerp(a.x, b.x, local), lerp(a.y, b.y, local), lerp(a.z, b.z, local), lerp(a.radius, b.radius, local));
}

function point(x, y, z, radius) {
  return Object.freeze({ x: round(x), y: round(y), z: round(z), radius: round(radius) });
}

function seasonalLeafColour(definition) {
  if (definition.evergreen) return definition.leafColour;
  if (definition.season === 'autumn') return '#9a4f20';
  if (definition.season === 'winter') return '#493f31';
  if (definition.season === 'spring') return '#7da34b';
  return definition.leafColour;
}

function seasonalLeafMaterial(definition) {
  const seasonalTint = definition.evergreen || definition.season === 'summer'
    ? definition.leafMaterial.tint
    : seasonalLeafColour(definition);
  return Object.freeze({ ...definition.leafMaterial, tint: seasonalTint });
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

function jitter(random, amount) { return (random() - 0.5) * amount * 2; }
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(value) { return Math.max(0, Math.min(1, value)); }
function round(value) { return Number(Number(value).toFixed(4)); }
