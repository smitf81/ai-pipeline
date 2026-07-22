import { PROCEDURAL_GEOLOGY_DEFINITION_CONTRACT } from '../data/proceduralGeology.js';

export const PROCEDURAL_GEOLOGY_FORMATION_CONTRACT = 'black-sky-bound.procedural-geology-formation.v1';

export function generateProceduralGeologyFormation(definition) {
  if (definition?.contract !== PROCEDURAL_GEOLOGY_DEFINITION_CONTRACT) {
    throw new Error(`procedural_geology_definition_contract_invalid:${definition?.contract ?? 'missing'}`);
  }
  const random = seededRandom(definition.seed);
  const hull = buildHull(definition, random);
  const center = polygonCenter(hull);
  const facets = buildFacets(hull, center, definition, random);
  const strata = buildStrata(definition, random);
  const cracks = buildCracks(definition, random);
  const mossPatches = buildMossPatches(definition, random);
  const wetEdges = buildWetEdges(hull, definition, random);
  return Object.freeze({
    contract: PROCEDURAL_GEOLOGY_FORMATION_CONTRACT,
    seed: definition.seed,
    formation: definition.formation,
    form: definition.form,
    hull: Object.freeze(hull),
    center: Object.freeze(center),
    facets: Object.freeze(facets),
    strata: Object.freeze(strata),
    cracks: Object.freeze(cracks),
    mossPatches: Object.freeze(mossPatches),
    wetEdges: Object.freeze(wetEdges),
    diagnostics: Object.freeze({
      hullPointCount: hull.length,
      facetCount: facets.length,
      strataSegmentCount: strata.reduce((sum, line) => sum + line.points.length - 1, 0),
      crackSegmentCount: cracks.reduce((sum, line) => sum + line.points.length - 1, 0),
      mossPatchCount: mossPatches.length,
      wetEdgeCount: wetEdges.length,
      generatedFrom: PROCEDURAL_GEOLOGY_DEFINITION_CONTRACT
    })
  });
}

function buildHull(definition, random) {
  const count = clamp(Math.round(9 + definition.angularity * 6 - definition.erosion * 2), 8, 15);
  const profile = formProfile(definition.form);
  const roughness = 0.025 + definition.angularity * 0.115 * (1 - definition.erosion * 0.62);
  const points = [];
  for (let index = 0; index < count; index += 1) {
    const angle = index / count * Math.PI * 2;
    const vertical = Math.sin(angle);
    const horizontal = Math.cos(angle);
    const topFracture = vertical > 0.38 ? definition.fracture * (0.025 + random() * 0.07) : 0;
    const radial = 1 + jitter(random, roughness) - topFracture;
    const baseFlatten = vertical < -0.58 ? 0.055 * (1 - Math.abs(horizontal)) : 0;
    points.push(Object.freeze({
      x: Number((horizontal * profile.radiusX * radial + jitter(random, roughness * 0.12)).toFixed(4)),
      y: Number(clamp(profile.centerY + vertical * profile.radiusY * radial + baseFlatten, 0.025, 0.965).toFixed(4))
    }));
  }
  return points;
}

function buildFacets(hull, center, definition, random) {
  return hull.map((_, index) => Object.freeze({
    id: `facet:${index}`,
    aIndex: index,
    bIndex: (index + 1) % hull.length,
    shade: Number(clamp(0.2 + index / hull.length * 0.48 + jitter(random, 0.18) + definition.wetness * 0.08, 0, 1).toFixed(3)),
    bevel: Number((0.12 + definition.angularity * 0.42 + random() * 0.12).toFixed(3)),
    center
  }));
}

function buildStrata(definition, random) {
  const count = Math.round(definition.strataDensity * (definition.form === 'layered_outcrop' ? 9 : 6));
  const angle = definition.strataAngleDegrees / 180 * Math.PI;
  const slope = Math.tan(clamp(angle, -1.35, 1.35)) * 0.14;
  return Array.from({ length: count }, (_, index) => {
    const lane = (index + 1) / (count + 1);
    const y = 0.13 + lane * 0.68 + jitter(random, 0.025);
    const span = (definition.form === 'layered_outcrop' ? 0.47 : 0.4) * Math.sin(clamp(lane, 0.08, 0.92) * Math.PI) ** 0.38;
    const points = [
      point(-span, clamp(y - slope * span + jitter(random, 0.012), 0.08, 0.9)),
      point(jitter(random, 0.055), clamp(y + jitter(random, 0.018), 0.08, 0.9)),
      point(span, clamp(y + slope * span + jitter(random, 0.012), 0.08, 0.9))
    ];
    return Object.freeze({ id: `strata:${index}`, points: Object.freeze(points), width: Number((0.006 + definition.strataDensity * 0.006).toFixed(4)), alpha: Number((0.2 + definition.strataDensity * 0.42).toFixed(3)) });
  });
}

function buildCracks(definition, random) {
  const count = Math.round(definition.crackDensity * 3 + definition.fracture * 3);
  return Array.from({ length: count }, (_, index) => {
    const pointCount = 3 + Math.round(random() * 2 + definition.fracture);
    const startX = jitter(random, 0.32);
    const startY = 0.76 + random() * 0.15;
    const drift = jitter(random, 0.22) + (index % 2 ? 0.06 : -0.06);
    const length = 0.18 + definition.fracture * 0.4 + random() * 0.16;
    const points = [];
    for (let step = 0; step < pointCount; step += 1) {
      const t = step / (pointCount - 1);
      points.push(point(
        clamp(startX + drift * t + jitter(random, 0.045) * t, -0.43, 0.43),
        clamp(startY - length * t + jitter(random, 0.025) * t, 0.1, 0.92)
      ));
    }
    return Object.freeze({ id: `crack:${index}`, points: Object.freeze(points), width: Number((0.007 + definition.fracture * 0.006).toFixed(4)), alpha: Number((0.34 + definition.crackDensity * 0.32).toFixed(3)) });
  });
}

function buildMossPatches(definition, random) {
  const count = Math.round(definition.moss * 8);
  return Array.from({ length: count }, (_, index) => Object.freeze({
    id: `moss:${index}`,
    x: Number(jitter(random, 0.37).toFixed(4)),
    y: Number((0.5 + random() * 0.36).toFixed(4)),
    radiusX: Number((0.035 + random() * 0.105 + definition.moss * 0.04).toFixed(4)),
    radiusY: Number((0.018 + random() * 0.055).toFixed(4)),
    rotation: Number(jitter(random, 0.8).toFixed(4)),
    alpha: Number((0.28 + definition.moss * 0.52).toFixed(3))
  }));
}

function buildWetEdges(hull, definition, random) {
  const count = Math.round(definition.wetness * 5);
  const eligible = hull.map((_, index) => index).filter((index) => hull[index].y > 0.46);
  return Array.from({ length: count }, (_, index) => {
    const edgeIndex = eligible[Math.floor(random() * eligible.length) % eligible.length] ?? index % hull.length;
    return Object.freeze({ id: `wet:${index}`, aIndex: edgeIndex, bIndex: (edgeIndex + 1) % hull.length, alpha: Number((0.18 + definition.wetness * 0.42).toFixed(3)) });
  });
}

function formProfile(form) {
  if (form === 'columnar_shard') return { radiusX: 0.42, radiusY: 0.49, centerY: 0.48 };
  if (form === 'layered_outcrop') return { radiusX: 0.54, radiusY: 0.36, centerY: 0.38 };
  return { radiusX: 0.49, radiusY: 0.42, centerY: 0.43 };
}
function polygonCenter(points) {
  return { x: Number((points.reduce((sum, pointValue) => sum + pointValue.x, 0) / points.length).toFixed(4)), y: Number((points.reduce((sum, pointValue) => sum + pointValue.y, 0) / points.length).toFixed(4)) };
}
function point(x, y) { return Object.freeze({ x: Number(x.toFixed(4)), y: Number(y.toFixed(4)) }); }
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
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
