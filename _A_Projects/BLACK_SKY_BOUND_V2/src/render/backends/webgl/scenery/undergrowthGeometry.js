import { resolveProceduralUndergrowthDefinition } from '../../../../data/proceduralUndergrowth.js';
import { generateProceduralUndergrowthSkeleton } from '../../../../world/proceduralUndergrowthGenerator.js';
import { parseWebGLColor, withAlpha } from '../WebGLColor.js';
import { adaptMaterialToWebGL } from '../WebGLMaterialAdapter.js';

export const UNDERGROWTH_GEOMETRY_MODE = 'procedural_undergrowth_dna_spline_geometry_v1';

export function proceduralUndergrowthStats(source = {}) {
  return {
    proceduralUndergrowthCount: source.proceduralUndergrowthCount ?? 0,
    proceduralUndergrowthSplineCount: source.proceduralUndergrowthSplineCount ?? 0,
    proceduralUndergrowthLeafClusterCount: source.proceduralUndergrowthLeafClusterCount ?? 0,
    proceduralUndergrowthEmberNodeCount: source.proceduralUndergrowthEmberNodeCount ?? 0
  };
}

export function accumulateProceduralUndergrowthStats(target, geometry) {
  target.proceduralUndergrowthCount += 1;
  target.proceduralUndergrowthSplineCount += geometry.stemCount;
  target.proceduralUndergrowthLeafClusterCount += geometry.leafClusterCount;
  target.proceduralUndergrowthEmberNodeCount += geometry.emberNodeCount;
}

export function buildUndergrowthGeometry(object, alpha, rects, triangles) {
  const definition = object.undergrowthDefinition?.contract
    ? object.undergrowthDefinition
    : resolveProceduralUndergrowthDefinition({}, {
      id: object.id,
      type: object.authoredType ?? object.type,
      x: object.tileX,
      y: object.tileY,
      materialState: object.material?.state
    });
  const skeleton = generateProceduralUndergrowthSkeleton(definition);
  const frame = undergrowthGeometryFrame(object);
  const render = object.render ?? {};
  const material = adaptMaterialToWebGL(object.material, parseWebGLColor(definition.leafColour, [0.16, 0.32, 0.18, 1]));
  const leafBase = fireTint(seasonalLeafColour(definition), material, 0.94);
  const leafShade = fireTint(mixColour(leafBase, [0.025, 0.065, 0.03, 1], 0.5), material, 1.12);
  const leafHighlight = fireTint(mixColour(leafBase, [0.56, 0.72, 0.31, 1], 0.22), material, 0.62);
  const stem = fireTint(definition.stemColour, material, 0.92);
  const stemShade = fireTint(mixColour(stem, [0.04, 0.032, 0.02, 1], 0.46), material, 1.12);
  const beforeTriangles = triangles.length;
  const beforeRects = rects.length;

  appendEllipseFan(triangles, {
    x: frame.cx,
    y: frame.baseY + frame.h * 0.018,
    radiusX: Math.max(7, frame.w * 0.34),
    radiusY: Math.max(2.5, frame.h * 0.055),
    color: parseWebGLColor(render.baseShadow, [0, 0, 0, 0.22]),
    alpha: alpha * 0.7,
    segments: 9
  });

  for (const cluster of skeleton.groundClusters) {
    const center = toWorld(cluster, frame);
    appendEllipseFan(triangles, {
      ...center,
      radiusX: Math.max(2, cluster.radiusX * frame.w),
      radiusY: Math.max(0.9, cluster.radiusY * frame.h),
      rotation: cluster.rotation,
      color: mixColour(leafShade, stemShade, 0.34),
      alpha: alpha * cluster.alpha,
      segments: 7
    });
  }

  for (const sourceStem of skeleton.stems) {
    appendSplineRibbon(triangles, sourceStem, frame, stemShade, stem, alpha * 0.92, definition.form === 'radial_fronds' ? 0.72 : 0.9);
  }

  for (let index = 0; index < skeleton.leaves.length; index += 1) {
    const leaf = skeleton.leaves[index];
    const center = toWorld(leaf, frame);
    const colour = leaf.colourShift >= 0
      ? mixColour(leafBase, leafHighlight, leaf.colourShift)
      : mixColour(leafBase, leafShade, -leaf.colourShift);
    appendEllipseFan(triangles, {
      ...center,
      radiusX: Math.max(1.5, leaf.radiusX * frame.w),
      radiusY: Math.max(0.8, leaf.radiusY * frame.h),
      rotation: -leaf.rotation,
      color: index % 3 === 0 ? mixColour(colour, leafHighlight, 0.15) : colour,
      centerColor: mixColour(colour, leafShade, 0.12),
      alpha: alpha * leaf.alpha,
      segments: leaf.shape === 'thorn_leaf' ? 5 : 7
    });
  }

  for (const ember of skeleton.emberNodes) {
    const center = toWorld(ember, frame);
    const radius = Math.max(0.9, ember.radius * frame.w);
    appendEllipseFan(triangles, {
      ...center,
      radiusX: radius * 1.55,
      radiusY: radius * 0.72,
      color: [1, 0.18, 0.018, 1],
      alpha: alpha * ember.intensity * 0.72,
      segments: 6
    });
    appendEllipseFan(triangles, {
      ...center,
      radiusX: radius * 0.62,
      radiusY: radius * 0.36,
      color: [1, 0.72, 0.18, 1],
      alpha: alpha * ember.intensity,
      segments: 5
    });
  }

  return Object.freeze({
    contract: UNDERGROWTH_GEOMETRY_MODE,
    definitionContract: definition.contract,
    skeletonContract: skeleton.contract,
    species: definition.species,
    seed: definition.seed,
    stemCount: skeleton.diagnostics.stemCount,
    splinePointCount: skeleton.diagnostics.splinePointCount,
    leafClusterCount: skeleton.diagnostics.leafClusterCount,
    groundClusterCount: skeleton.diagnostics.groundClusterCount,
    emberNodeCount: skeleton.diagnostics.emberNodeCount,
    generatedTriangleCount: triangles.length - beforeTriangles,
    generatedRectCount: rects.length - beforeRects
  });
}

function undergrowthGeometryFrame(object) {
  const x = object.worldTileX;
  const y = object.worldTileY;
  const w = object.worldWidth;
  const h = object.worldHeight;
  return { x, y, w, h, cx: object.anchorWorldX ?? x + w * 0.5, baseY: object.anchorWorldY ?? y + h * 0.88 };
}

function appendSplineRibbon(triangles, spline, frame, shade, light, alpha, radiusScale) {
  for (let index = 0; index < spline.points.length - 1; index += 1) {
    const a = toWorld(spline.points[index], frame);
    const b = toWorld(spline.points[index + 1], frame);
    const length = Math.max(0.0001, Math.hypot(b.x - a.x, b.y - a.y));
    const px = -(b.y - a.y) / length;
    const py = (b.x - a.x) / length;
    const ar = Math.max(0.5, spline.points[index].radius * frame.w * radiusScale);
    const br = Math.max(0.28, spline.points[index + 1].radius * frame.w * radiusScale);
    const aLeft = { x: a.x + px * ar, y: a.y + py * ar };
    const aRight = { x: a.x - px * ar, y: a.y - py * ar };
    const bLeft = { x: b.x + px * br, y: b.y + py * br };
    const bRight = { x: b.x - px * br, y: b.y - py * br };
    addTriangle(triangles, aLeft, aRight, bRight, shade, alpha);
    addTriangle(triangles, aLeft, bRight, bLeft, index % 2 ? mixColour(light, shade, 0.18) : light, alpha);
  }
}

function appendEllipseFan(triangles, options) {
  const segments = Math.max(5, options.segments ?? 7);
  const center = { x: options.x, y: options.y };
  const cos = Math.cos(options.rotation ?? 0);
  const sin = Math.sin(options.rotation ?? 0);
  const points = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = index / segments * Math.PI * 2;
    const localX = Math.cos(angle) * options.radiusX;
    const localY = Math.sin(angle) * options.radiusY;
    points.push({ x: center.x + localX * cos - localY * sin, y: center.y + localX * sin + localY * cos });
  }
  for (let index = 0; index < points.length; index += 1) {
    addTriangle(triangles, center, points[index], points[(index + 1) % points.length], options.centerColor ?? options.color, options.alpha);
  }
}

function toWorld(point, frame) {
  return { x: frame.cx + point.x * frame.w, y: frame.baseY - point.y * frame.h };
}

function seasonalLeafColour(definition) {
  const base = parseWebGLColor(definition.leafColour, [0.16, 0.32, 0.18, 1]);
  if (definition.season === 'autumn') return mixColour(base, [0.63, 0.3, 0.055, 1], 0.58);
  if (definition.season === 'spring') return mixColour(base, [0.48, 0.72, 0.24, 1], 0.28);
  if (definition.season === 'winter') return mixColour(base, [0.27, 0.25, 0.18, 1], 0.66);
  return base;
}

function fireTint(colour, material, charScale) {
  let result = parseWebGLColor(colour, [0.16, 0.32, 0.18, 1]);
  result = mixColour(result, [0.022, 0.018, 0.016, 1], clamp01(material.charAmount * charScale));
  result = mixColour(result, [0.62, 0.075, 0.015, 1], clamp01(material.heatAmount * 0.22));
  return result;
}

function addTriangle(triangles, a, b, c, colour, alpha) {
  triangles.push({
    ax: a.x, ay: a.y,
    bx: b.x, by: b.y,
    cx: c.x, cy: c.y,
    color: withAlpha(parseWebGLColor(colour, [0.25, 0.35, 0.24, 1]), clamp01(alpha))
  });
}

function mixColour(a, b, amount) {
  const left = parseWebGLColor(a, [0.16, 0.32, 0.18, 1]);
  const right = parseWebGLColor(b, [0.16, 0.32, 0.18, 1]);
  const t = clamp01(amount);
  return [left[0] * (1 - t) + right[0] * t, left[1] * (1 - t) + right[1] * t, left[2] * (1 - t) + right[2] * t, left[3] * (1 - t) + right[3] * t];
}

function clamp01(value) { return Math.max(0, Math.min(1, value)); }
