import { resolveProceduralTreeDefinition } from '../../../../data/proceduralTrees.js';
import { generateProceduralTreeSkeleton } from '../../../../world/proceduralTreeGenerator.js';
import { parseWebGLColor, withAlpha } from '../WebGLColor.js';
import { adaptMaterialToWebGL } from '../WebGLMaterialAdapter.js';
import { appendLayeredFlame } from '../WebGLFlameGeometry.js';

export const TREE_GEOMETRY_MODE = 'procedural_tree_dna_spline_geometry_v1';

export function proceduralTreeStats(source = {}) {
  return {
    proceduralTreeCount: source.proceduralTreeCount ?? 0,
    proceduralTreeSplineCount: source.proceduralTreeSplineCount ?? 0,
    proceduralTreeFoliageClusterCount: source.proceduralTreeFoliageClusterCount ?? 0
  };
}

export function accumulateProceduralTreeStats(target, treeGeometry) {
  target.proceduralTreeCount += 1;
  target.proceduralTreeSplineCount += treeGeometry.splineCount;
  target.proceduralTreeFoliageClusterCount += treeGeometry.foliageClusterCount;
}

const TREE_FIRE_OUTER = Object.freeze([1, 0.16, 0.018, 0.94]);
const TREE_FIRE_INNER = Object.freeze([1, 0.64, 0.08, 0.98]);

export function buildTreeGeometry(object, alpha, rects, triangles) {
  const definition = object.treeDefinition?.contract
    ? object.treeDefinition
    : resolveProceduralTreeDefinition({}, {
      id: object.id,
      type: object.authoredType ?? object.type,
      x: object.tileX,
      y: object.tileY
    });
  const skeleton = generateProceduralTreeSkeleton(definition);
  const render = object.render ?? {};
  const material = adaptMaterialToWebGL(object.material, parseWebGLColor(definition.barkColour, [0.28, 0.18, 0.1, 1]));
  const geometry = treeGeometryFrame(object);
  const bark = fireTint(definition.barkColour, material, 0.92);
  const barkShade = fireTint(render.trunkShadow ?? material.shadowColor, material, 1.08);
  const barkHighlight = fireTint(material.highlightColor ?? definition.barkColour, material, 0.68);
  const rootColour = mixColour(barkShade, [0.09, 0.055, 0.03, 1], 0.32);
  const beforeTriangles = triangles.length;
  const beforeRects = rects.length;

  appendEllipseFan(triangles, {
    x: geometry.cx,
    y: geometry.baseY + geometry.h * 0.015,
    radiusX: Math.max(12, geometry.w * (0.16 + definition.rootScale * 0.035)),
    radiusY: Math.max(4, geometry.h * 0.026),
    rotation: 0,
    segments: 9,
    color: parseWebGLColor(render.baseShadow, [0, 0, 0, 0.31]),
    alpha: alpha * 0.72
  });

  for (const root of skeleton.roots) appendSplineRibbon(triangles, root, geometry, rootColour, bark, alpha * 0.9, 0.7);
  for (const branch of skeleton.branches) appendSplineRibbon(triangles, branch, geometry, barkShade, bark, alpha * 0.92, 0.46);
  appendSplineRibbon(triangles, skeleton.trunk, geometry, barkShade, bark, alpha, 0.52);
  appendSplineHighlight(triangles, skeleton.trunk, geometry, barkHighlight, alpha * 0.34);

  if (definition.moss > 0.025) {
    appendSplineOverlay(triangles, skeleton.trunk, geometry, {
      fromT: 0.02,
      toT: Math.min(0.55, 0.18 + definition.moss * 0.34),
      side: -0.46,
      widthScale: 0.34,
      color: mixColour([0.12, 0.24, 0.13, 1], parseWebGLColor(definition.leafColour), 0.35),
      alpha: alpha * definition.moss * 0.62
    });
  }

  const leafBase = seasonalLeafColour(definition);
  const leafShade = fireTint(mixColour(leafBase, [0.018, 0.05, 0.032, 1], 0.48), material, 1.05);
  const leafHighlight = fireTint(mixColour(leafBase, [0.56, 0.68, 0.38, 1], 0.2), material, 0.62);
  for (let index = 0; index < skeleton.foliageClusters.length; index += 1) {
    const cluster = skeleton.foliageClusters[index];
    const world = toWorld(cluster, geometry);
    const colour = cluster.colourShift >= 0
      ? mixColour(leafBase, leafHighlight, cluster.colourShift)
      : mixColour(leafBase, leafShade, -cluster.colourShift);
    appendEllipseFan(triangles, {
      x: world.x,
      y: world.y,
      radiusX: Math.max(5, cluster.radiusX * geometry.w),
      radiusY: Math.max(4, cluster.radiusY * geometry.h),
      rotation: cluster.rotation,
      segments: definition.form === 'conifer' ? 7 : 8,
      color: index % 3 === 0 ? mixColour(colour, leafShade, 0.16) : colour,
      centerColor: index % 4 === 0 ? mixColour(colour, leafHighlight, 0.18) : colour,
      alpha: alpha * cluster.alpha
    });
  }

  appendTreeFireGeometry(object, material, geometry, alpha, rects, triangles);
  return Object.freeze({
    contract: TREE_GEOMETRY_MODE,
    definitionContract: definition.contract,
    skeletonContract: skeleton.contract,
    species: definition.species,
    seed: definition.seed,
    splineCount: skeleton.diagnostics.splineCount,
    branchCount: skeleton.diagnostics.branchCount,
    rootCount: skeleton.diagnostics.rootCount,
    foliageClusterCount: skeleton.diagnostics.foliageClusterCount,
    generatedTriangleCount: triangles.length - beforeTriangles,
    generatedRectCount: rects.length - beforeRects
  });
}

function treeGeometryFrame(object) {
  const x = object.worldTileX;
  const y = object.worldTileY;
  const w = object.worldWidth;
  const h = object.worldHeight;
  return {
    x,
    y,
    w,
    h,
    cx: object.anchorWorldX ?? x + w * 0.5,
    baseY: object.anchorWorldY ?? y + h * 0.9
  };
}

function appendSplineRibbon(triangles, spline, geometry, shade, light, alpha, radiusScale = 0.5) {
  for (let index = 0; index < spline.points.length - 1; index += 1) {
    const a = toWorld(spline.points[index], geometry);
    const b = toWorld(spline.points[index + 1], geometry);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.max(0.0001, Math.hypot(dx, dy));
    const px = -dy / length;
    const py = dx / length;
    const ar = Math.max(0.75, spline.points[index].radius * geometry.w * radiusScale);
    const br = Math.max(0.45, spline.points[index + 1].radius * geometry.w * radiusScale);
    const aLeft = { x: a.x + px * ar, y: a.y + py * ar };
    const aRight = { x: a.x - px * ar, y: a.y - py * ar };
    const bLeft = { x: b.x + px * br, y: b.y + py * br };
    const bRight = { x: b.x - px * br, y: b.y - py * br };
    addTriangle(triangles, aLeft, aRight, bRight, shade, alpha);
    addTriangle(triangles, aLeft, bRight, bLeft, index % 2 ? mixColour(light, shade, 0.18) : light, alpha);
  }
}

function appendSplineHighlight(triangles, spline, geometry, color, alpha) {
  for (let index = 0; index < spline.points.length - 1; index += 1) {
    const aPoint = spline.points[index];
    const bPoint = spline.points[index + 1];
    const a = toWorld(aPoint, geometry);
    const b = toWorld(bPoint, geometry);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.max(0.0001, Math.hypot(dx, dy));
    const px = -dy / length;
    const py = dx / length;
    const ar = Math.max(0.55, aPoint.radius * geometry.w * 0.11);
    const br = Math.max(0.35, bPoint.radius * geometry.w * 0.11);
    addTriangle(triangles,
      { x: a.x - px * ar * 0.3, y: a.y - py * ar * 0.3 },
      { x: a.x + px * ar, y: a.y + py * ar },
      { x: b.x + px * br, y: b.y + py * br }, color, alpha);
    addTriangle(triangles,
      { x: a.x - px * ar * 0.3, y: a.y - py * ar * 0.3 },
      { x: b.x + px * br, y: b.y + py * br },
      { x: b.x - px * br * 0.3, y: b.y - py * br * 0.3 }, color, alpha);
  }
}

function appendSplineOverlay(triangles, spline, geometry, options) {
  const start = Math.max(0, Math.floor(options.fromT * (spline.points.length - 1)));
  const end = Math.min(spline.points.length - 1, Math.ceil(options.toT * (spline.points.length - 1)));
  for (let index = start; index < end; index += 1) {
    const aPoint = spline.points[index];
    const bPoint = spline.points[index + 1];
    const a = toWorld(aPoint, geometry);
    const b = toWorld(bPoint, geometry);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.max(0.0001, Math.hypot(dx, dy));
    const px = -dy / length;
    const py = dx / length;
    const ar = aPoint.radius * geometry.w * options.widthScale;
    const br = bPoint.radius * geometry.w * options.widthScale;
    const offsetA = aPoint.radius * geometry.w * options.side;
    const offsetB = bPoint.radius * geometry.w * options.side;
    const ac = { x: a.x + px * offsetA, y: a.y + py * offsetA };
    const bc = { x: b.x + px * offsetB, y: b.y + py * offsetB };
    addTriangle(triangles, { x: ac.x - px * ar, y: ac.y - py * ar }, { x: ac.x + px * ar, y: ac.y + py * ar }, { x: bc.x + px * br, y: bc.y + py * br }, options.color, options.alpha);
    addTriangle(triangles, { x: ac.x - px * ar, y: ac.y - py * ar }, { x: bc.x + px * br, y: bc.y + py * br }, { x: bc.x - px * br, y: bc.y - py * br }, options.color, options.alpha);
  }
}

function appendEllipseFan(triangles, options) {
  const segments = Math.max(5, options.segments ?? 8);
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

function toWorld(point, geometry) {
  return {
    x: geometry.cx + point.x * geometry.w,
    y: geometry.baseY - point.y * geometry.h
  };
}

function appendTreeFireGeometry(object, material, geometry, alpha, rects, triangles) {
  const phase = material.firePhase;
  if (!phase) return;
  const { x, y, w, h, cx, baseY } = geometry;
  const heat = material.heatAmount;
  const embers = material.emberAmount;
  const age = material.fireAge;
  const seed = object.treeDefinition?.seed ?? 1;
  const flameCount = phase === 'engulfed' ? 7 : phase === 'simmer_high' ? 5 : phase === 'simmer_low' ? 3 : 0;
  const sockets = [
    [-0.28, 0.54, 0.9], [0.26, 0.58, 0.82], [-0.12, 0.36, 1.04], [0.12, 0.28, 0.88],
    [-0.38, 0.72, 0.72], [0.38, 0.74, 0.68], [0.02, 0.68, 0.76]
  ];
  for (let index = 0; index < flameCount; index += 1) {
    const socket = sockets[index];
    const pulse = 0.84 + Math.sin(age * 8.2 + seed * 0.03 + index * 1.9) * 0.16;
    appendLayeredFlame(triangles, {
      x: cx + w * socket[0],
      y: y + h * socket[1],
      radius: Math.max(5, Math.min(w, h) * 0.075 * socket[2] * (0.72 + heat * 0.56)),
      outerColor: TREE_FIRE_OUTER,
      innerColor: TREE_FIRE_INNER,
      alpha: alpha * heat * pulse,
      seed: seed * 0.01 + index * 0.83 + age * 2.4,
      lean: Math.sin(seed + index * 1.7 + age * 3.2) * 0.28
    });
  }
  const coalCount = phase === 'burnt_out' ? 5 : 8;
  for (let index = 0; index < coalCount; index += 1) {
    const t = (index + 0.5) / coalCount;
    const side = index % 2 === 0 ? -1 : 1;
    const coalW = Math.max(1.4, w * (0.012 + embers * 0.008));
    rects.push({
      x: cx + side * w * (0.03 + (index % 3) * 0.055) - coalW * 0.5,
      y: baseY - h * (0.06 + t * 0.58),
      w: coalW,
      h: Math.max(2, h * 0.018),
      color: [1, 0.2 + embers * 0.28, 0.025, alpha * embers * (0.38 + (index % 3) * 0.12)]
    });
  }
}

function seasonalLeafColour(definition) {
  const base = parseWebGLColor(definition.leafColour, [0.13, 0.24, 0.18, 1]);
  if (definition.evergreen) return definition.season === 'winter' ? mixColour(base, [0.16, 0.22, 0.2, 1], 0.2) : base;
  if (definition.season === 'autumn') return mixColour(base, [0.72, 0.28, 0.055, 1], 0.64);
  if (definition.season === 'spring') return mixColour(base, [0.48, 0.7, 0.25, 1], 0.26);
  if (definition.season === 'winter') return mixColour(base, [0.32, 0.27, 0.2, 1], 0.72);
  return base;
}

function fireTint(colour, material, charScale) {
  let result = parseWebGLColor(colour, [0.13, 0.24, 0.18, 1]);
  result = mixColour(result, [0.022, 0.018, 0.016, 1], clamp01(material.charAmount * charScale));
  result = mixColour(result, [0.62, 0.075, 0.015, 1], clamp01(material.heatAmount * 0.24));
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
  const left = parseWebGLColor(a, [0.13, 0.24, 0.18, 1]);
  const right = parseWebGLColor(b, [0.13, 0.24, 0.18, 1]);
  const t = clamp01(amount);
  return [left[0] * (1 - t) + right[0] * t, left[1] * (1 - t) + right[1] * t, left[2] * (1 - t) + right[2] * t, left[3] * (1 - t) + right[3] * t];
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
