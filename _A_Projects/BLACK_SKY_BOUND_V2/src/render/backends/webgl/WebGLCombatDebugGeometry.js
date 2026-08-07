import { parseWebGLColor } from './WebGLColor.js';

export function buildWebGLCombatDebugTriangles(actor, projection) {
  if (!isAttackDebugVisible()) return [];
  const triangles = [];
  const scale = actor.radius > 0 ? actor.worldRadius / actor.radius : 32;
  const facing = actor.rotation ?? projection.facing ?? 0;
  const forward = { x: Math.cos(facing), y: Math.sin(facing) };
  const right = { x: -forward.y, y: forward.x };
  const state = projection.attackState;
  if (state?.hitShape) {
    const color = parseWebGLColor(state.debugVisual?.colour, [0.7, 0.82, 0.72, 0.18]);
    if (state.hitShape.type === 'forward_capsule') {
      addDebugQuad(triangles, actor.worldX, actor.worldY, forward, right, state.hitShape.length * scale, state.hitShape.halfWidth * 2 * scale, color);
    } else if (state.hitShape.type === 'forward_arc') {
      addDebugArc(triangles, actor.worldX, actor.worldY, forward, state.hitShape.radius * scale, state.hitShape.arcRadians, color);
    } else if (state.hitShape.type === 'circle') {
      addDebugArc(triangles, actor.worldX, actor.worldY, forward, state.hitShape.radius * scale, Math.PI * 2, color);
    }
  }
  if (projection.guardState?.phase === 'guard') {
    addDebugArc(triangles, actor.worldX, actor.worldY, forward, actor.worldRadius * 2.8, projection.guardState.protectedArcRadians, parseWebGLColor('rgba(132,154,160,0.16)', [0.52, 0.6, 0.62, 0.16]));
  }
  return triangles;
}

function addDebugQuad(triangles, x, y, forward, right, length, width, color) {
  const half = width * 0.5;
  const endX = x + forward.x * length;
  const endY = y + forward.y * length;
  pushTri(triangles, x + right.x * half, y + right.y * half, endX + right.x * half, endY + right.y * half, endX - right.x * half, endY - right.y * half, color);
  pushTri(triangles, x + right.x * half, y + right.y * half, endX - right.x * half, endY - right.y * half, x - right.x * half, y - right.y * half, color);
}

function addDebugArc(triangles, x, y, forward, radius, arc, color) {
  const centerAngle = Math.atan2(forward.y, forward.x);
  const steps = 14;
  for (let index = 0; index < steps; index += 1) {
    const a0 = centerAngle - arc * 0.5 + arc * index / steps;
    const a1 = centerAngle - arc * 0.5 + arc * (index + 1) / steps;
    pushTri(triangles, x, y, x + Math.cos(a0) * radius, y + Math.sin(a0) * radius, x + Math.cos(a1) * radius, y + Math.sin(a1) * radius, color);
  }
}

function pushTri(triangles, ax, ay, bx, by, cx, cy, color) { triangles.push({ ax, ay, bx, by, cx, cy, color }); }
function isAttackDebugVisible() {
  try { return new URLSearchParams(globalThis.location?.search ?? '').get('attackDebug') === '1'; }
  catch { return false; }
}
