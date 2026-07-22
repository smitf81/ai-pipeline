import { PROCEDURAL_UNDERGROWTH_DEFINITION_CONTRACT } from '../data/proceduralUndergrowth.js';

export const PROCEDURAL_UNDERGROWTH_SKELETON_CONTRACT = 'black-sky-bound.procedural-undergrowth-skeleton.v1';

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
    const stem = buildStem(definition, random, index, activeStemCount);
    stems.push(stem);
    appendStemLeaves(leaves, stem, definition, random, effectiveDensity);
  }
  const groundClusters = buildGroundClusters(definition, random, effectiveDensity);
  const emberNodes = buildEmberNodes(stems, definition, random);
  return Object.freeze({
    contract: PROCEDURAL_UNDERGROWTH_SKELETON_CONTRACT,
    seed: definition.seed,
    species: definition.species,
    form: definition.form,
    stems: Object.freeze(stems),
    leaves: Object.freeze(leaves),
    groundClusters: Object.freeze(groundClusters),
    emberNodes: Object.freeze(emberNodes),
    diagnostics: Object.freeze({
      stemCount: stems.length,
      splinePointCount: stems.reduce((sum, stem) => sum + stem.points.length, 0),
      leafClusterCount: leaves.length,
      groundClusterCount: groundClusters.length,
      emberNodeCount: emberNodes.length,
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
  const side = Math.cos(angle);
  const depth = Math.sin(angle);
  const length = 0.68 + random() * 0.28;
  const reach = side * (0.3 + random() * 0.22) * (0.72 + definition.irregularity * 0.28);
  const baseX = depth * 0.08 + jitter(random, 0.025);
  const points = [];
  for (let step = 0; step < 6; step += 1) {
    const t = step / 5;
    const curl = Math.sin(t * Math.PI) * definition.curl * 0.16 * Math.sign(reach || 1);
    points.push(point(
      baseX + reach * Math.pow(t, 1.18) + curl + jitter(random, 0.008) * t,
      Math.pow(t, 0.86) * length - Math.pow(t, 2.4) * definition.curl * 0.12 + depth * 0.04 * t,
      0.018 * (1 - t * 0.72) + 0.004,
      angle
    ));
  }
  return stem(`frond:${index}`, 'frond', points);
}

function buildShrubStem(definition, random, index, count) {
  const side = index % 2 === 0 ? -1 : 1;
  const lane = (index + 0.5) / count - 0.5;
  const lean = side * (definition.lean * 0.2 + random() * 0.24) + lane * 0.22;
  const height = 0.64 + random() * 0.34;
  const fork = lean * (0.38 + random() * 0.22);
  return stem(`stem:${index}`, 'branching_stem', [
    point(jitter(random, 0.06), 0, 0.026, side),
    point(lean * 0.16, height * 0.32, 0.021, side),
    point(lean * 0.46 + jitter(random, 0.035), height * 0.68, 0.014, side),
    point(lean + fork * definition.irregularity, height, 0.006, side)
  ]);
}

function buildBrambleStem(definition, random, index, count) {
  const side = index % 2 === 0 ? -1 : 1;
  const spread = side * (0.48 + random() * 0.42);
  const startX = jitter(random, 0.14);
  const rise = 0.3 + random() * 0.34;
  return stem(`vine:${index}`, 'bramble_vine', [
    point(startX, 0.02 + random() * 0.08, 0.022, side),
    point(startX + spread * 0.28, rise * 0.74 + jitter(random, 0.08), 0.018, side),
    point(startX + spread * 0.58, rise * (0.56 + random() * 0.28), 0.012, side),
    point(startX + spread * 0.82, rise * (0.78 + random() * 0.18), 0.008, side),
    point(startX + spread, rise * (0.38 + random() * 0.3), 0.004, side)
  ]);
}

function appendStemLeaves(output, sourceStem, definition, random, density) {
  if (density <= 0.03) return;
  const fern = definition.form === 'radial_fronds';
  const bramble = definition.form === 'sprawling_bramble';
  const stations = fern ? 4 : bramble ? 3 : 3;
  for (let station = 0; station < stations; station += 1) {
    const t = 0.3 + station / Math.max(1, stations - 1) * 0.62;
    if (random() > density + 0.18) continue;
    const anchor = pointOnSpline(sourceStem.points, t);
    const tangent = tangentOnSpline(sourceStem.points, t);
    const baseSize = definition.leafSize * (0.78 + random() * 0.34);
    if (fern) {
      for (const side of [-1, 1]) {
        output.push(leaf(output.length, sourceStem.id, anchor, {
          shape: 'leaflet',
          radiusX: baseSize * (0.72 + (1 - t) * 0.45),
          radiusY: baseSize * 0.22,
          rotation: Math.atan2(tangent.y, tangent.x) + side * (0.68 + definition.curl * 0.34),
          offsetX: side * baseSize * 0.42,
          offsetY: -baseSize * 0.08,
          alpha: 0.56 + density * 0.38,
          colourShift: jitter(random, 0.18)
        }));
      }
    } else {
      output.push(leaf(output.length, sourceStem.id, anchor, {
        shape: bramble ? 'thorn_leaf' : 'leaf_cluster',
        radiusX: baseSize * (bramble ? 0.82 : 1.14),
        radiusY: baseSize * (bramble ? 0.42 : 0.86),
        rotation: Math.atan2(tangent.y, tangent.x) + jitter(random, 0.9),
        offsetX: jitter(random, baseSize * 0.4),
        offsetY: jitter(random, baseSize * 0.24),
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
    x: jitter(random, 0.46),
    y: random() * 0.08,
    radiusX: 0.08 + random() * 0.16,
    radiusY: 0.018 + random() * 0.035,
    rotation: jitter(random, 0.45),
    alpha: 0.18 + definition.groundCover * 0.28
  }));
}

function buildEmberNodes(stems, definition, random) {
  const count = definition.burn < 0.12 ? 0 : Math.max(1, Math.round(definition.burn * 6));
  return Array.from({ length: count }, (_, index) => {
    const sourceStem = stems[index % stems.length];
    const anchor = pointOnSpline(sourceStem.points, 0.2 + random() * 0.58);
    return Object.freeze({ id: `ember:${index}`, x: anchor.x, y: anchor.y, radius: 0.012 + random() * 0.018, intensity: 0.38 + definition.burn * 0.58 });
  });
}

function stem(id, kind, points) { return Object.freeze({ id, kind, points: Object.freeze(points) }); }
function point(x, y, radius, twist) { return Object.freeze({ x, y, radius, twist }); }
function leaf(index, parentId, anchor, values) { return Object.freeze({ id: `leaf:${index}`, parentId, x: anchor.x + values.offsetX, y: anchor.y + values.offsetY, ...values }); }
function pointOnSpline(points, t) {
  const scaled = clamp01(t) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const local = scaled - index;
  return { x: lerp(points[index].x, points[index + 1].x, local), y: lerp(points[index].y, points[index + 1].y, local) };
}
function tangentOnSpline(points, t) {
  const index = Math.min(points.length - 2, Math.floor(clamp01(t) * (points.length - 1)));
  return { x: points[index + 1].x - points[index].x, y: points[index + 1].y - points[index].y };
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
