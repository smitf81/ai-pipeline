import { PROCEDURAL_UNDERGROWTH_DEFINITION_CONTRACT } from '../data/proceduralUndergrowth.js';

export const PROCEDURAL_UNDERGROWTH_SKELETON_CONTRACT = 'black-sky-bound.procedural-undergrowth-skeleton.v2';

export function generateProceduralUndergrowthSkeleton(definition) {
  if (definition?.contract !== PROCEDURAL_UNDERGROWTH_DEFINITION_CONTRACT) {
    throw new Error(`procedural_undergrowth_definition_contract_invalid:${definition?.contract ?? 'missing'}`);
  }
  const random = seededRandom(definition.seed);
  const health = clamp01(definition.health);
  const maturity = clamp(definition.ageYears / definition.matureYears, 0.28, 1.25);
  const seasonal = seasonalLeafAmount(definition);
  const effectiveDensity = clamp01(definition.density * health * seasonal * (1 - definition.burn * 0.62));
  const activeStemCount = Math.max(2, Math.round(definition.stemCount * (0.58 + Math.min(1, maturity) * 0.42) * (0.72 + health * 0.28)));
  const stems = [];
  const leaves = [];

  for (let index = 0; index < activeStemCount; index += 1) {
    const sourceStem = buildStem(definition, random, index, activeStemCount);
    stems.push(sourceStem);
    appendStemLeaves(leaves, sourceStem, definition, random, effectiveDensity);
  }
  const groundClusters = buildGroundClusters(definition, random, effectiveDensity);
  const emberSockets = buildEmberSockets(stems, definition, random);
  return Object.freeze({
    contract: PROCEDURAL_UNDERGROWTH_SKELETON_CONTRACT,
    units: 'metres_y_up',
    seed: definition.seed,
    species: definition.species,
    form: definition.form,
    stems: Object.freeze(stems),
    leaves: Object.freeze(leaves),
    groundClusters: Object.freeze(groundClusters),
    emberSockets: Object.freeze(emberSockets),
    emberNodes: Object.freeze(emberSockets),
    diagnostics: Object.freeze({
      stemCount: stems.length,
      splinePointCount: stems.reduce((sum, sourceStem) => sum + sourceStem.points.length, 0),
      leafClusterCount: leaves.length,
      groundClusterCount: groundClusters.length,
      emberSocketCount: emberSockets.length,
      emberNodeCount: emberSockets.length,
      effectiveDensity: Number(effectiveDensity.toFixed(3)),
      generatedFrom: PROCEDURAL_UNDERGROWTH_DEFINITION_CONTRACT
    })
  });
}

function buildStem(definition, random, index, count) {
  if (definition.form === 'sprawling_bramble') return buildBrambleStem(definition, random, index, count);
  if (definition.form === 'branching_shrub') return buildShrubStem(definition, random, index, count);
  return buildFernFrond(definition, random, index, count);
}

function buildFernFrond(definition, random, index, count) {
  const angle = index / count * Math.PI * 2 + jitter(random, 0.28);
  const reach = definition.spreadMeters * (0.34 + random() * 0.14);
  const height = definition.heightMeters * (0.76 + random() * 0.24);
  const radialX = Math.cos(angle);
  const radialZ = Math.sin(angle);
  const baseX = jitter(random, definition.spreadMeters * 0.025);
  const baseZ = jitter(random, definition.spreadMeters * 0.025);
  const points = [];
  for (let step = 0; step < 6; step += 1) {
    const t = step / 5;
    const curl = Math.sin(t * Math.PI) * definition.curl * definition.heightMeters * 0.12;
    const horizontal = reach * Math.pow(t, 1.12);
    points.push(point(
      baseX + radialX * horizontal + jitter(random, 0.01) * t,
      Math.pow(t, 0.78) * height - Math.pow(t, 2.45) * curl,
      baseZ + radialZ * horizontal + jitter(random, 0.01) * t,
      definition.heightMeters * (0.026 * (1 - t * 0.72) + 0.006),
      angle
    ));
  }
  return stem(`frond:${index}`, 'frond', points);
}

function buildShrubStem(definition, random, index, count) {
  const angle = index / count * Math.PI * 2 + jitter(random, 0.42);
  const radialX = Math.cos(angle);
  const radialZ = Math.sin(angle);
  const lean = definition.spreadMeters * (definition.lean * 0.12 + 0.12 + random() * 0.12);
  const height = definition.heightMeters * (0.68 + random() * 0.32);
  const fork = 0.72 + definition.irregularity * random() * 0.34;
  return stem(`stem:${index}`, 'branching_stem', [
    point(jitter(random, 0.035), 0, jitter(random, 0.035), 0.026, angle),
    point(radialX * lean * 0.18, height * 0.32, radialZ * lean * 0.18, 0.021, angle),
    point(radialX * lean * 0.52 + jitter(random, 0.025), height * 0.68, radialZ * lean * 0.52 + jitter(random, 0.025), 0.014, angle),
    point(radialX * lean * fork, height, radialZ * lean * fork, 0.007, angle)
  ]);
}

function buildBrambleStem(definition, random, index, count) {
  const angle = index / count * Math.PI * 2 + jitter(random, 0.56);
  const radialX = Math.cos(angle);
  const radialZ = Math.sin(angle);
  const spread = definition.spreadMeters * (0.3 + random() * 0.18);
  const rise = definition.heightMeters * (0.38 + random() * 0.42);
  const startX = jitter(random, definition.spreadMeters * 0.04);
  const startZ = jitter(random, definition.spreadMeters * 0.04);
  return stem(`vine:${index}`, 'bramble_vine', [
    point(startX, 0.02 + random() * 0.04, startZ, 0.022, angle),
    point(startX + radialX * spread * 0.28, rise * 0.74 + jitter(random, 0.035), startZ + radialZ * spread * 0.28, 0.018, angle),
    point(startX + radialX * spread * 0.58, rise * (0.56 + random() * 0.28), startZ + radialZ * spread * 0.58, 0.012, angle),
    point(startX + radialX * spread * 0.82, rise * (0.78 + random() * 0.18), startZ + radialZ * spread * 0.82, 0.008, angle),
    point(startX + radialX * spread, rise * (0.38 + random() * 0.3), startZ + radialZ * spread, 0.004, angle)
  ]);
}

function appendStemLeaves(output, sourceStem, definition, random, density) {
  if (density <= 0.03) return;
  const fern = definition.form === 'radial_fronds';
  const bramble = definition.form === 'sprawling_bramble';
  const stations = fern ? 4 : 3;
  for (let station = 0; station < stations; station += 1) {
    const t = 0.3 + station / Math.max(1, stations - 1) * 0.62;
    if (random() > density + 0.18) continue;
    const anchor = pointOnSpline(sourceStem.points, t);
    const tangent = tangentOnSpline(sourceStem.points, t);
    const horizontalLength = Math.hypot(tangent.x, tangent.z) || 1;
    const sideX = -tangent.z / horizontalLength;
    const sideZ = tangent.x / horizontalLength;
    const baseSize = definition.leafSize * (0.78 + random() * 0.34);
    const rotationY = Math.atan2(tangent.z, tangent.x);
    const rotationZ = Math.atan2(tangent.y, horizontalLength);
    if (fern) {
      for (const side of [-1, 1]) {
        output.push(leaf(output.length, sourceStem.id, anchor, {
          shape: 'leaflet',
          radiusX: baseSize * (0.72 + (1 - t) * 0.45),
          radiusY: baseSize * 0.22,
          radiusZ: baseSize * 0.38,
          rotationY: rotationY + side * (0.38 + definition.curl * 0.24),
          rotationZ,
          offsetX: sideX * side * baseSize * 0.42,
          offsetY: -baseSize * 0.08,
          offsetZ: sideZ * side * baseSize * 0.42,
          alpha: 0.56 + density * 0.38,
          colourShift: jitter(random, 0.18)
        }));
      }
    } else {
      output.push(leaf(output.length, sourceStem.id, anchor, {
        shape: bramble ? 'thorn_leaf' : 'leaf_cluster',
        radiusX: baseSize * (bramble ? 0.82 : 1.14),
        radiusY: baseSize * (bramble ? 0.42 : 0.86),
        radiusZ: baseSize * (bramble ? 0.44 : 0.78),
        rotationY: rotationY + jitter(random, 0.9),
        rotationZ: rotationZ + jitter(random, 0.4),
        offsetX: jitter(random, baseSize * 0.4),
        offsetY: jitter(random, baseSize * 0.24),
        offsetZ: jitter(random, baseSize * 0.4),
        alpha: 0.58 + density * 0.36,
        colourShift: jitter(random, 0.2)
      }));
    }
  }
}

function buildGroundClusters(definition, random, density) {
  const count = Math.max(1, Math.round(1 + definition.groundCover * 5 * density));
  return Array.from({ length: count }, (_, index) => Object.freeze({
    id: `ground:${index}`,
    x: jitter(random, definition.spreadMeters * 0.3),
    y: 0.006 + random() * 0.012,
    z: jitter(random, definition.spreadMeters * 0.3),
    radiusX: definition.spreadMeters * (0.06 + random() * 0.09),
    radiusY: 0.008 + random() * 0.012,
    radiusZ: definition.spreadMeters * (0.045 + random() * 0.075),
    rotationY: jitter(random, Math.PI),
    alpha: 0.18 + definition.groundCover * 0.28
  }));
}

function buildEmberSockets(stems, definition, random) {
  const count = definition.burn < 0.12 ? 0 : Math.max(1, Math.round(definition.burn * 6));
  return Array.from({ length: count }, (_, index) => {
    const sourceStem = stems[index % stems.length];
    const anchor = pointOnSpline(sourceStem.points, 0.2 + random() * 0.58);
    return Object.freeze({ id: `ember:${index}`, x: anchor.x, y: anchor.y, z: anchor.z, radius: 0.012 + random() * 0.018, intensity: 0.38 + definition.burn * 0.58 });
  });
}

function stem(id, kind, points) { return Object.freeze({ id, kind, points: Object.freeze(points) }); }
function point(x, y, z, radius, twist) { return Object.freeze({ x, y, z, radius, twist }); }
function leaf(index, parentId, anchor, values) {
  return Object.freeze({
    id: `leaf:${index}`,
    parentId,
    x: anchor.x + values.offsetX,
    y: anchor.y + values.offsetY,
    z: anchor.z + values.offsetZ,
    ...values
  });
}
function pointOnSpline(points, t) {
  const scaled = clamp01(t) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const local = scaled - index;
  return {
    x: lerp(points[index].x, points[index + 1].x, local),
    y: lerp(points[index].y, points[index + 1].y, local),
    z: lerp(points[index].z, points[index + 1].z, local)
  };
}
function tangentOnSpline(points, t) {
  const index = Math.min(points.length - 2, Math.floor(clamp01(t) * (points.length - 1)));
  return {
    x: points[index + 1].x - points[index].x,
    y: points[index + 1].y - points[index].y,
    z: points[index + 1].z - points[index].z
  };
}
function seasonalLeafAmount(definition) {
  if (definition.season === 'winter') return definition.species === 'wood_fern' ? 0.34 : 0.48;
  if (definition.season === 'autumn') return 0.72;
  if (definition.season === 'spring') return 0.86;
  return 1;
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
function clamp01(value) { return clamp(value, 0, 1); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
