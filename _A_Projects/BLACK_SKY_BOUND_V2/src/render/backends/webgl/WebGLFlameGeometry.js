import { withAlpha } from './WebGLColor.js';

export const WEBGL_LAYERED_FLAME_MODE = 'layered_teardrop_flame_v1';

export function appendLayeredFlame(triangles, {
  x,
  y,
  radius,
  outerColor,
  innerColor,
  alpha = 1,
  seed = 0,
  lean = 0
}) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius <= 0) return 0;
  const start = triangles.length;
  const size = Math.max(1.2, radius);
  const sway = clamp(lean + Math.sin(seed * 1.73) * 0.16, -0.42, 0.42);
  const outer = withAlpha(outerColor, (outerColor?.[3] ?? 1) * alpha * 0.88);
  const inner = withAlpha(innerColor, (innerColor?.[3] ?? 1) * alpha * 0.92);
  const hot = withAlpha([1, 0.94, 0.72, 1], alpha * 0.94);

  appendFan(triangles, x, y, [
    [sway * size * 0.9, -size * 1.72],
    [size * 0.42, -size * 0.62],
    [size * 0.72, size * 0.08],
    [size * 0.34, size * 0.66],
    [0, size * 0.82],
    [-size * 0.52, size * 0.48],
    [-size * 0.64, -size * 0.08]
  ], outer);

  appendFan(triangles, x - sway * size * 0.08, y + size * 0.14, [
    [sway * size * 0.38, -size * 1.05],
    [size * 0.3, -size * 0.34],
    [size * 0.42, size * 0.26],
    [0, size * 0.58],
    [-size * 0.34, size * 0.22],
    [-size * 0.28, -size * 0.3]
  ], inner);

  appendFan(triangles, x, y + size * 0.28, [
    [sway * size * 0.12, -size * 0.5],
    [size * 0.18, size * 0.12],
    [0, size * 0.42],
    [-size * 0.18, size * 0.12]
  ], hot);

  const lickSide = sway >= 0 ? -1 : 1;
  triangles.push({
    ax: x + lickSide * size * 0.26,
    ay: y - size * 0.14,
    bx: x + lickSide * size * 0.72,
    by: y - size * 0.72,
    cx: x + lickSide * size * 0.54,
    cy: y + size * 0.22,
    color: withAlpha(outerColor, (outerColor?.[3] ?? 1) * alpha * 0.52)
  });
  return triangles.length - start;
}

function appendFan(triangles, x, y, points, color) {
  const center = points.reduce((sum, point) => ({
    x: sum.x + point[0] / points.length,
    y: sum.y + point[1] / points.length
  }), { x: 0, y: 0 });
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    triangles.push({
      ax: x + center.x,
      ay: y + center.y,
      bx: x + a[0],
      by: y + a[1],
      cx: x + b[0],
      cy: y + b[1],
      color
    });
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));
}
