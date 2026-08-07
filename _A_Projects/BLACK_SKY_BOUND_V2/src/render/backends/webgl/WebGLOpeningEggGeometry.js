import { parseWebGLColor, withAlpha } from './WebGLColor.js';

export const WEBGL_OPENING_EGG_MODE = 'world_depth_split_shell_container_v2';

const SHELL_PALETTE = ['#c8c1a2', '#a59d82', '#ded6b4'];
const SHELL_EDGE = parseWebGLColor('#f0e7c5', [0.94, 0.91, 0.77, 1]);
const INTERIOR = parseWebGLColor('#182128', [0.09, 0.13, 0.16, 1]);
const MEMBRANE = parseWebGLColor('#4f5960', [0.31, 0.35, 0.38, 1]);
const SHADOW = parseWebGLColor('#000000', [0, 0, 0, 1]);

export function buildWebGLOpeningEggDepthItems(projection, context) {
  const egg = projection.opening?.egg;
  if (!egg?.visible || egg.revealOpacity <= 0.005) {
    return { items: [], sourceCount: 0, primitiveCount: 0, shellPieceCount: 0 };
  }
  const radius = Math.max(egg.radiusX ?? 0, egg.radiusY ?? 0);
  const bounds = context.camera.visibleWorldBounds(96);
  if (egg.worldX + radius < bounds.left || egg.worldY + radius < bounds.top
    || egg.worldX - radius > bounds.right || egg.worldY - radius > bounds.bottom) {
    return { items: [], sourceCount: 1, primitiveCount: 0, shellPieceCount: egg.shellPieceCount ?? 0 };
  }
  const back = item('opening_egg_back', 'opening_egg_back', egg.worldY - (egg.radiusY ?? 0) * 0.72, -2);
  const front = item('opening_egg_front', 'opening_egg_front', egg.worldY + (egg.radiusY ?? 0) * 0.72, 3);
  appendEggShadow(back.rects, egg);
  appendInterior(back.triangles, egg);
  for (const piece of egg.shellPieces ?? []) {
    appendShellPiece(piece.layer === 'front' ? front.triangles : back.triangles, egg, piece);
  }
  const items = [back, front].filter((entry) => entry.rects.length || entry.triangles.length);
  return {
    items,
    sourceCount: 1,
    primitiveCount: items.reduce((sum, entry) => sum + entry.rects.length + entry.triangles.length, 0),
    shellPieceCount: egg.shellPieceCount ?? 0
  };
}

function appendEggShadow(rects, egg) {
  const alpha = clamp01(egg.revealOpacity);
  rects.push({
    x: egg.worldX - egg.radiusX * 1.05,
    y: egg.worldY + egg.radiusY * 0.5,
    w: egg.radiusX * 2.1,
    h: Math.max(4, egg.radiusY * 0.36),
    color: withAlpha(SHADOW, 0.28 * alpha)
  });
}

function appendInterior(triangles, egg) {
  const alpha = clamp01(egg.revealOpacity);
  appendEllipseFan(triangles, egg.worldX, egg.worldY, egg.radiusX * 0.76, egg.radiusY * 0.7, withAlpha(INTERIOR, 0.96 * alpha), 24);
  appendEllipseFan(triangles, egg.worldX - egg.radiusX * 0.12, egg.worldY - egg.radiusY * 0.08, egg.radiusX * 0.54, egg.radiusY * 0.42, withAlpha(MEMBRANE, 0.14 * alpha), 20);
}

function appendShellPiece(triangles, egg, piece) {
  const progress = smooth01(piece.progress);
  const localOffsetX = piece.travelX * egg.radiusX * (1 + piece.travel) * progress;
  const localOffsetY = piece.travelY * egg.radiusY * (1 + piece.travel) * progress;
  const localRotation = piece.rotation * progress;
  const points = (piece.points ?? []).map((point) => transformEggPoint(
    egg,
    point.x * egg.radiusX + localOffsetX,
    point.y * egg.radiusY + localOffsetY,
    localRotation
  ));
  if (points.length < 3) return;
  const alpha = clamp01(egg.revealOpacity);
  const fill = withAlpha(parseWebGLColor(SHELL_PALETTE[piece.paletteIndex % SHELL_PALETTE.length], [0.6, 0.57, 0.48, 1]), 0.98 * alpha);
  const center = centroid(points);
  for (let i = 0; i < points.length; i += 1) {
    const next = points[(i + 1) % points.length];
    pushTri(triangles, center, points[i], next, fill);
    addSegment(triangles, points[i], next, 0.9 + (i % 2) * 0.45, withAlpha(SHELL_EDGE, (i < 2 ? 0.5 : 0.24) * alpha));
  }
}

function transformEggPoint(egg, x, y, localRotation) {
  const localCos = Math.cos(localRotation);
  const localSin = Math.sin(localRotation);
  const rotatedX = x * localCos - y * localSin;
  const rotatedY = x * localSin + y * localCos;
  const cos = Math.cos(egg.rotation ?? 0);
  const sin = Math.sin(egg.rotation ?? 0);
  return {
    x: egg.worldX + rotatedX * cos - rotatedY * sin,
    y: egg.worldY + rotatedX * sin + rotatedY * cos
  };
}

function appendEllipseFan(triangles, cx, cy, rx, ry, color, segments) {
  for (let i = 0; i < segments; i += 1) {
    const a = i / segments * Math.PI * 2;
    const b = (i + 1) / segments * Math.PI * 2;
    pushTri(
      triangles,
      { x: cx, y: cy },
      { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry },
      { x: cx + Math.cos(b) * rx, y: cy + Math.sin(b) * ry },
      color
    );
  }
}

function addSegment(triangles, a, b, width, color) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length * width * 0.5;
  const ny = dx / length * width * 0.5;
  pushTri(triangles, { x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny }, { x: b.x - nx, y: b.y - ny }, color);
  pushTri(triangles, { x: a.x + nx, y: a.y + ny }, { x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny }, color);
}

function pushTri(triangles, a, b, c, color) {
  triangles.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, cx: c.x, cy: c.y, color });
}

function centroid(points) {
  return points.reduce((result, point) => ({
    x: result.x + point.x / points.length,
    y: result.y + point.y / points.length
  }), { x: 0, y: 0 });
}

function item(id, source, depthY, sortBias) {
  return { id, source, depthY, sortBias, rects: [], triangles: [] };
}

function smooth01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}
