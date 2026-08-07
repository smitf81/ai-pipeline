export const WEBGL_MAMA_WYVERN_AERIAL_MODE = 'dedicated_static_aerial_wing_dominant_mama_silhouette_v1';

export const MAMA_WYVERN_AERIAL_PROFILE = Object.freeze({
  bodyPlan: 'aerial_wyvern_static_spread',
  pose: 'wings_fully_spread_neck_extended_tail_trailing',
  locomotionRead: 'fast_overhead_glide_not_grounded_crawl',
  wingSpanTiles: 15.4,
  bodyLengthTiles: 9.95,
  torsoWidthTiles: 1.02,
  neckLengthTiles: 2.25,
  tailLengthTiles: 4.35,
  wingFingerCount: 8,
  legPrimitiveCount: 0
});

const LOCAL_TRIANGLES = Object.freeze(buildLocalAerialSilhouette().map(Object.freeze));

export function buildWebGLMamaWyvernAerialSilhouette(flyover, options = {}) {
  if (!flyover || !Number.isFinite(flyover.worldX) || !Number.isFinite(flyover.worldY)) return null;
  const heading = Number(flyover.headingRadians) || 0;
  const scale = Math.max(0.01, Number(flyover.worldScale) || 32) * (Number(options.scaleMultiplier) || 1);
  const color = options.color ?? [0.004, 0.006, 0.01, 0.82];
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const triangles = LOCAL_TRIANGLES.map((triangle) => transformTriangle(
    triangle,
    flyover.worldX,
    flyover.worldY,
    scale,
    cos,
    sin,
    color
  ));
  return {
    triangles,
    mode: WEBGL_MAMA_WYVERN_AERIAL_MODE,
    profile: MAMA_WYVERN_AERIAL_PROFILE,
    metrics: {
      triangleCount: triangles.length,
      wingSpanWorld: MAMA_WYVERN_AERIAL_PROFILE.wingSpanTiles * scale,
      bodyLengthWorld: MAMA_WYVERN_AERIAL_PROFILE.bodyLengthTiles * scale,
      torsoWidthWorld: MAMA_WYVERN_AERIAL_PROFILE.torsoWidthTiles * scale,
      wingToBodyRatio: MAMA_WYVERN_AERIAL_PROFILE.wingSpanTiles / MAMA_WYVERN_AERIAL_PROFILE.bodyLengthTiles,
      torsoToBodyRatio: MAMA_WYVERN_AERIAL_PROFILE.torsoWidthTiles / MAMA_WYVERN_AERIAL_PROFILE.bodyLengthTiles,
      wingFingerCount: MAMA_WYVERN_AERIAL_PROFILE.wingFingerCount,
      legPrimitiveCount: 0
    }
  };
}

export function getMamaWyvernAerialLocalTriangleCount() {
  return LOCAL_TRIANGLES.length;
}

function buildLocalAerialSilhouette() {
  const triangles = [];
  addWing(triangles, -1);
  addWing(triangles, 1);
  addTaperedSegment(triangles, { x: -1.25, y: 0 }, { x: -5.7, y: 0 }, 0.42, 0.06);
  addPolygon(triangles, [
    { x: -1.45, y: -0.36 }, { x: 0.8, y: -0.51 }, { x: 1.45, y: -0.38 },
    { x: 1.72, y: 0 }, { x: 1.45, y: 0.38 }, { x: 0.8, y: 0.51 }, { x: -1.45, y: 0.36 }
  ]);
  addTaperedSegment(triangles, { x: 1.15, y: 0 }, { x: 3.28, y: 0 }, 0.31, 0.2);
  addEllipse(triangles, { x: 3.55, y: 0 }, 0.58, 0.31, 12);
  addPolygon(triangles, [
    { x: 3.82, y: -0.22 }, { x: 4.25, y: -0.1 }, { x: 4.25, y: 0.1 }, { x: 3.82, y: 0.22 }
  ]);
  return triangles;
}

function addWing(triangles, side) {
  const y = (value) => value * side;
  addPolygon(triangles, [
    { x: 1.18, y: y(0.34) },
    { x: 0.58, y: y(2.45) },
    { x: -0.22, y: y(5.35) },
    { x: -1.62, y: y(7.7) },
    { x: -2.02, y: y(6.14) },
    { x: -1.9, y: y(4.62) },
    { x: -1.48, y: y(2.62) },
    { x: -1.28, y: y(0.32) }
  ]);
  const roots = [
    { x: -1.12, y: y(5.62) },
    { x: -1.34, y: y(5.06) },
    { x: -1.5, y: y(4.48) },
    { x: -1.58, y: y(3.82) }
  ];
  const tips = [
    { x: -2.9, y: y(7.42) },
    { x: -3.72, y: y(6.46) },
    { x: -4.3, y: y(5.28) },
    { x: -4.58, y: y(3.88) }
  ];
  for (let index = 0; index < roots.length; index += 1) {
    addTaperedSegment(triangles, roots[index], tips[index], 0.16 - index * 0.015, 0.025);
  }
}

function addPolygon(triangles, points) {
  if (points.length < 3) return;
  for (let index = 1; index < points.length - 1; index += 1) {
    triangles.push({ a: points[0], b: points[index], c: points[index + 1] });
  }
}

function addTaperedSegment(triangles, start, end, startWidth, endWidth) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const a = { x: start.x + nx * startWidth, y: start.y + ny * startWidth };
  const b = { x: start.x - nx * startWidth, y: start.y - ny * startWidth };
  const c = { x: end.x - nx * endWidth, y: end.y - ny * endWidth };
  const d = { x: end.x + nx * endWidth, y: end.y + ny * endWidth };
  triangles.push({ a, b, c }, { a, b: c, c: d });
}

function addEllipse(triangles, center, radiusX, radiusY, segments) {
  let previous = ellipsePoint(center, radiusX, radiusY, 0);
  for (let index = 1; index <= segments; index += 1) {
    const next = ellipsePoint(center, radiusX, radiusY, Math.PI * 2 * index / segments);
    triangles.push({ a: center, b: previous, c: next });
    previous = next;
  }
}

function ellipsePoint(center, radiusX, radiusY, angle) {
  return { x: center.x + Math.cos(angle) * radiusX, y: center.y + Math.sin(angle) * radiusY };
}

function transformTriangle(triangle, x, y, scale, cos, sin, color) {
  const a = transformPoint(triangle.a, x, y, scale, cos, sin);
  const b = transformPoint(triangle.b, x, y, scale, cos, sin);
  const c = transformPoint(triangle.c, x, y, scale, cos, sin);
  return { ax: a.x, ay: a.y, bx: b.x, by: b.y, cx: c.x, cy: c.y, color };
}

function transformPoint(point, x, y, scale, cos, sin) {
  return {
    x: x + point.x * scale * cos - point.y * scale * sin,
    y: y + point.x * scale * sin + point.y * scale * cos
  };
}
