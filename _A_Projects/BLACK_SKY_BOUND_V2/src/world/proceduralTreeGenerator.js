import { PROCEDURAL_TREE_DEFINITION_CONTRACT } from '../data/proceduralTrees.js';

export const PROCEDURAL_TREE_SKELETON_CONTRACT = 'black-sky-bound.procedural-tree-skeleton.v1';

export function generateProceduralTreeSkeleton(definition) {
  if (definition?.contract !== PROCEDURAL_TREE_DEFINITION_CONTRACT) {
    throw new Error(`procedural_tree_definition_contract_invalid:${definition?.contract ?? 'missing'}`);
  }
  const random = seededRandom(definition.seed);
  const ageRatio = definition.ageYears / definition.matureYears;
  const health = clamp01(definition.health);
  const baseRadius = clamp(definition.trunkRadiusMeters / Math.max(1.5, definition.projected.widthTiles * 0.5), 0.035, 0.18);
  const trunk = buildTrunkSpline(definition, random, baseRadius);
  const roots = buildRootSplines(definition, random, baseRadius);
  const branches = [];
  const foliageClusters = [];
  let brokenBranchCount = 0;

  const levelCount = definition.branchLevels;
  const removeLowerBranches = ageRatio > 1.7 ? 1 : 0;
  for (let level = removeLowerBranches; level < levelCount; level += 1) {
    const levelT = levelCount === 1 ? 0.6 : level / (levelCount - 1);
    const trunkT = definition.crownStart + (1 - definition.crownStart) * (0.12 + levelT * 0.79);
    const branchesAtLevel = 1 + (random() < definition.branchDensity ? 1 : 0);
    for (let fork = 0; fork < branchesAtLevel; fork += 1) {
      const branchIndex = branches.length;
      const side = (level + fork) % 2 === 0 ? -1 : 1;
      const damageThreshold = 0.12 + (1 - health) * 0.46;
      if (random() < damageThreshold && branchIndex > 1) {
        brokenBranchCount += 1;
        continue;
      }
      const branch = buildBranchSpline(definition, trunk, trunkT, levelT, side, fork, random, baseRadius, branchIndex);
      branches.push(branch);
      if (definition.form !== 'conifer' && definition.branchDensity > 0.56 && random() < definition.branchDensity) {
        branches.push(buildTwigSpline(branch, definition, random, branches.length));
      }
      appendBranchFoliage(foliageClusters, branch, definition, random, health);
    }
  }

  appendCrownFoliage(foliageClusters, trunk, definition, random, health);
  return Object.freeze({
    contract: PROCEDURAL_TREE_SKELETON_CONTRACT,
    seed: definition.seed,
    species: definition.species,
    form: definition.form,
    trunk,
    branches: Object.freeze(branches),
    roots: Object.freeze(roots),
    foliageClusters: Object.freeze(foliageClusters),
    diagnostics: Object.freeze({
      splineCount: 1 + branches.length + roots.length,
      trunkPointCount: trunk.points.length,
      branchCount: branches.length,
      rootCount: roots.length,
      foliageClusterCount: foliageClusters.length,
      brokenBranchCount,
      lowerBranchesRemoved: removeLowerBranches,
      generatedFrom: PROCEDURAL_TREE_DEFINITION_CONTRACT
    })
  });
}

function buildTrunkSpline(definition, random, baseRadius) {
  const pointCount = 8 + Math.min(3, Math.round(definition.branchLevels / 3));
  const leanDirection = random() < 0.5 ? -1 : 1;
  const points = [];
  for (let index = 0; index < pointCount; index += 1) {
    const t = index / (pointCount - 1);
    const bendCurve = Math.pow(t, 1.55) * definition.bend * 0.34 * leanDirection;
    const twistCurve = Math.sin(t * Math.PI * (1.1 + definition.twist * 1.8) + definition.seed * 0.013) * definition.twist * 0.055 * t;
    const growthNoise = (random() - 0.5) * 0.018 * t;
    points.push(Object.freeze({
      x: bendCurve + twistCurve + growthNoise,
      y: t,
      radius: Math.max(baseRadius * 0.07, baseRadius * Math.pow(1 - t * 0.94, definition.taper)),
      twist: definition.twist * t
    }));
  }
  return Object.freeze({ id: 'trunk', parentId: null, kind: 'trunk', points: Object.freeze(points) });
}

function buildRootSplines(definition, random, baseRadius) {
  const count = 4 + Math.round(definition.rootScale * 1.6);
  const roots = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + jitter(random, 0.24);
    const perspective = 0.42 + Math.abs(Math.cos(angle)) * 0.58;
    const length = (0.12 + random() * 0.1) * definition.rootScale;
    const dx = Math.cos(angle) * length;
    const down = Math.sin(angle) * 0.045 * perspective;
    roots.push(Object.freeze({
      id: `root:${index}`,
      parentId: 'trunk',
      kind: 'root',
      points: Object.freeze([
        Object.freeze({ x: 0, y: 0.018, radius: baseRadius * 0.82, twist: angle }),
        Object.freeze({ x: dx * 0.48, y: down * 0.44, radius: baseRadius * 0.34, twist: angle }),
        Object.freeze({ x: dx, y: down - 0.012 - random() * 0.018, radius: baseRadius * 0.045, twist: angle })
      ])
    }));
  }
  return roots;
}

function buildBranchSpline(definition, trunk, trunkT, levelT, side, fork, random, baseRadius, index) {
  const start = pointOnSpline(trunk.points, trunkT);
  const conifer = definition.form === 'conifer';
  const broadleaf = definition.form === 'broadleaf';
  const spread = definition.canopySpread * (conifer ? 0.36 : broadleaf ? 0.46 : 0.38);
  const levelLength = spread * (0.92 - levelT * (conifer ? 0.58 : 0.28));
  const length = levelLength * (0.82 + random() * 0.28) * (fork ? 0.82 : 1);
  const rise = conifer
    ? 0.035 + levelT * 0.13
    : 0.08 + levelT * 0.09 + random() * 0.06;
  const sweep = side * length;
  const points = [
    { x: start.x, y: start.y, radius: Math.max(baseRadius * 0.18, start.radius * 0.48), twist: side },
    { x: start.x + sweep * 0.28, y: start.y + rise * 0.28 + jitter(random, 0.018), radius: Math.max(baseRadius * 0.1, start.radius * 0.29), twist: side },
    { x: start.x + sweep * 0.66, y: start.y + rise * 0.64 + jitter(random, 0.024), radius: Math.max(baseRadius * 0.055, start.radius * 0.14), twist: side },
    { x: start.x + sweep, y: Math.min(0.98, start.y + rise), radius: Math.max(baseRadius * 0.024, start.radius * 0.055), twist: side }
  ].map((point) => Object.freeze(point));
  return Object.freeze({ id: `branch:${index}`, parentId: 'trunk', kind: 'branch', level: levelT, points: Object.freeze(points) });
}

function buildTwigSpline(parent, definition, random, index) {
  const start = pointOnSpline(parent.points, 0.55 + random() * 0.16);
  const side = parent.points.at(-1).x >= parent.points[0].x ? 1 : -1;
  const outward = (0.07 + random() * 0.08) * definition.canopySpread;
  return Object.freeze({
    id: `twig:${index}`,
    parentId: parent.id,
    kind: 'twig',
    level: parent.level,
    points: Object.freeze([
      Object.freeze({ ...start, radius: start.radius * 0.7 }),
      Object.freeze({ x: start.x + outward * side * 0.38, y: start.y + 0.045, radius: start.radius * 0.32, twist: side }),
      Object.freeze({ x: start.x + outward * side, y: Math.min(0.99, start.y + 0.11 + random() * 0.04), radius: start.radius * 0.08, twist: side })
    ])
  });
}

function appendBranchFoliage(output, branch, definition, random, health) {
  const seasonal = seasonalLeafAmount(definition);
  const density = clamp01(definition.leafDensity * health * seasonal);
  if (density <= 0.025) return;
  const conifer = definition.form === 'conifer';
  const count = Math.max(1, Math.round((conifer ? 3.5 : 2.2) * density));
  for (let index = 0; index < count; index += 1) {
    if (random() > density + 0.16) continue;
    const t = conifer ? 0.3 + index / Math.max(1, count - 1) * 0.68 : 0.68 + index / Math.max(1, count) * 0.28;
    const point = pointOnSpline(branch.points, t);
    const baseRadius = conifer ? 0.085 : definition.form === 'broadleaf' ? 0.13 : 0.105;
    output.push(foliageCluster(output.length, branch.id, point, {
      radiusX: baseRadius * (0.82 + random() * 0.4) * definition.canopySpread,
      radiusY: baseRadius * (conifer ? 0.62 : 0.78) * (0.82 + random() * 0.32),
      rotation: jitter(random, 0.7),
      alpha: 0.62 + density * 0.34,
      colourShift: jitter(random, 0.18)
    }));
  }
}

function appendCrownFoliage(output, trunk, definition, random, health) {
  const density = clamp01(definition.leafDensity * health * seasonalLeafAmount(definition));
  if (density <= 0.025) return;
  const crownCount = definition.form === 'conifer' ? 4 : 3;
  for (let index = 0; index < crownCount; index += 1) {
    const t = 0.72 + index / Math.max(1, crownCount - 1) * 0.25;
    const point = pointOnSpline(trunk.points, t);
    const radius = (definition.form === 'broadleaf' ? 0.14 : 0.095) * definition.canopySpread * (1 - index * 0.08);
    output.push(foliageCluster(output.length, 'trunk', point, {
      radiusX: radius * (0.9 + random() * 0.22),
      radiusY: radius * (definition.form === 'conifer' ? 0.8 : 0.94),
      rotation: jitter(random, 0.45),
      alpha: 0.68 + density * 0.3,
      colourShift: jitter(random, 0.12)
    }));
  }
}

function foliageCluster(index, parentId, point, values) {
  return Object.freeze({
    id: `foliage:${index}`,
    parentId,
    x: point.x,
    y: point.y,
    ...values
  });
}

function seasonalLeafAmount(definition) {
  if (definition.evergreen) return definition.season === 'winter' ? 0.82 : 1;
  if (definition.season === 'winter') return 0.16;
  if (definition.season === 'autumn') return 0.68;
  if (definition.season === 'spring') return 0.78;
  return 1;
}

function pointOnSpline(points, t) {
  const scaled = clamp01(t) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const a = points[index];
  const b = points[index + 1];
  return {
    x: lerp(a.x, b.x, local),
    y: lerp(a.y, b.y, local),
    radius: lerp(a.radius, b.radius, local),
    twist: lerp(a.twist, b.twist, local)
  };
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

function jitter(random, amount) {
  return (random() - 0.5) * amount * 2;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
