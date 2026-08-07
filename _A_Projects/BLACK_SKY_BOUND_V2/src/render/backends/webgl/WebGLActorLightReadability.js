import { parseWebGLColor, withAlpha } from './WebGLColor.js';

export const WEBGL_ACTOR_LIGHT_READABILITY_MODE = 'emitter_facing_actor_light_silhouette_v0';

export function buildWebGLActorLightReadabilityGeometry(actor, camera = null) {
  const readability = actor?.lightReadability;
  const geometry = {
    active: false,
    contactTriangles: [],
    coreTriangles: [],
    rimTriangles: [],
    catchlightTriangles: [],
    contributingLightCount: 0,
    rimPrimitiveCount: 0,
    catchlightPrimitiveCount: 0,
    contactShadowPrimitiveCount: 0,
    coreOcclusionPrimitiveCount: 0
  };
  if (!readability?.active || !readability.direction) return geometry;
  const worldPerScreenPixel = 1 / Math.max(0.1, Number(camera?.zoom) || 1);
  const rimWidth = readability.rimWidthPx * worldPerScreenPixel;
  const catchlightRadius = readability.catchlightRadiusPx * worldPerScreenPixel;
  const influence = clamp01(readability.influence);
  const outer = parseWebGLColor(readability.rimColour, [1, 0.47, 0.18, 1]);
  const inner = parseWebGLColor(readability.catchlightColour, [1, 0.84, 0.52, 1]);
  const rimColour = withAlpha(mixColor(outer, inner, readability.rimColourMix ?? 0.38), readability.rimAlpha * (0.38 + influence * 0.62));
  const catchlightColour = withAlpha(inner, readability.catchlightAlpha * (0.42 + influence * 0.58));
  const darkness = [0.006, 0.008, 0.009, 1];
  const contactColour = withAlpha(darkness, readability.contactShadowAlpha * (0.5 + influence * 0.5));
  const coreColour = withAlpha(darkness, readability.coreOcclusionAlpha * (0.4 + influence * 0.6));

  if (readability.contactShadow) {
    addEllipse(geometry.contactTriangles, readability.contactShadow, contactColour, 8, 1);
    geometry.contactShadowPrimitiveCount = 8;
  }
  if (readability.core) {
    addCoreOcclusion(geometry.coreTriangles, readability.core, readability.coreOcclusionScale, coreColour);
    geometry.coreOcclusionPrimitiveCount = geometry.coreTriangles.length;
  }
  for (const part of readability.parts ?? []) {
    if (part.shape === 'ellipse') {
      addEmitterFacingEllipseRim(
        geometry.rimTriangles,
        part,
        readability.direction,
        rimWidth,
        readability.rimArcHalfAngle,
        rimColour
      );
    } else if (part.shape === 'segment') {
      addEmitterFacingSegmentRim(geometry.rimTriangles, part, readability.direction, rimWidth, rimColour);
    }
  }
  geometry.rimPrimitiveCount = geometry.rimTriangles.length;
  for (const socket of readability.catchlights ?? []) {
    addDisc(geometry.catchlightTriangles, socket.worldX, socket.worldY, catchlightRadius, catchlightColour, 6);
  }
  geometry.catchlightPrimitiveCount = geometry.catchlightTriangles.length;
  geometry.active = geometry.rimPrimitiveCount > 0 || geometry.catchlightPrimitiveCount > 0;
  geometry.contributingLightCount = geometry.active ? 1 : 0;
  return geometry;
}

function addEmitterFacingEllipseRim(triangles, part, direction, width, halfAngle, colour) {
  const segments = 5;
  const worldAngle = Math.atan2(direction.y, direction.x);
  const localAngle = worldAngle - (part.rotation ?? 0);
  const innerX = Math.max(0.5, part.radiusX - width);
  const innerY = Math.max(0.5, part.radiusY - width);
  for (let index = 0; index < segments; index += 1) {
    const a0 = localAngle - halfAngle + (index / segments) * halfAngle * 2;
    const a1 = localAngle - halfAngle + ((index + 1) / segments) * halfAngle * 2;
    const outer0 = ellipsePoint(part, part.radiusX, part.radiusY, a0);
    const outer1 = ellipsePoint(part, part.radiusX, part.radiusY, a1);
    const inner0 = ellipsePoint(part, innerX, innerY, a0);
    const inner1 = ellipsePoint(part, innerX, innerY, a1);
    pushTri(triangles, outer0, outer1, inner1, colour);
    pushTri(triangles, outer0, inner1, inner0, colour);
  }
}

function addEmitterFacingSegmentRim(triangles, part, direction, width, colour) {
  const dx = part.endX - part.startX;
  const dy = part.endY - part.startY;
  const length = Math.hypot(dx, dy);
  if (length <= 0.001) return;
  let nx = -dy / length;
  let ny = dx / length;
  if (nx * direction.x + ny * direction.y < 0) {
    nx *= -1;
    ny *= -1;
  }
  const startX = part.startX + dx * 0.08;
  const startY = part.startY + dy * 0.08;
  const endX = part.endX - dx * 0.08;
  const endY = part.endY - dy * 0.08;
  const outer = part.width * 0.5;
  const inner = Math.max(0, outer - width);
  pushTriPoints(
    triangles,
    startX + nx * outer, startY + ny * outer,
    endX + nx * outer, endY + ny * outer,
    endX + nx * inner, endY + ny * inner,
    colour
  );
  pushTriPoints(
    triangles,
    startX + nx * outer, startY + ny * outer,
    endX + nx * inner, endY + ny * inner,
    startX + nx * inner, startY + ny * inner,
    colour
  );
}

function addCoreOcclusion(triangles, part, scale, colour) {
  if (part.shape === 'ellipse') {
    addEllipse(triangles, part, colour, 8, scale);
    return;
  }
  if (part.shape !== 'segment') return;
  addSegment(triangles, part, part.width * scale, colour);
}

function addEllipse(triangles, part, colour, segments, scale) {
  const center = { x: part.centerX, y: part.centerY };
  for (let index = 0; index < segments; index += 1) {
    const a0 = index / segments * Math.PI * 2;
    const a1 = (index + 1) / segments * Math.PI * 2;
    pushTri(triangles, center, ellipsePoint(part, part.radiusX * scale, part.radiusY * scale, a0), ellipsePoint(part, part.radiusX * scale, part.radiusY * scale, a1), colour);
  }
}

function addSegment(triangles, part, width, colour) {
  const dx = part.endX - part.startX;
  const dy = part.endY - part.startY;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length * width * 0.5;
  const ny = dx / length * width * 0.5;
  pushTriPoints(triangles, part.startX + nx, part.startY + ny, part.endX + nx, part.endY + ny, part.endX - nx, part.endY - ny, colour);
  pushTriPoints(triangles, part.startX + nx, part.startY + ny, part.endX - nx, part.endY - ny, part.startX - nx, part.startY - ny, colour);
}

function addDisc(triangles, x, y, radius, colour, segments) {
  const center = { x, y };
  for (let index = 0; index < segments; index += 1) {
    const a0 = index / segments * Math.PI * 2;
    const a1 = (index + 1) / segments * Math.PI * 2;
    pushTri(triangles, center, { x: x + Math.cos(a0) * radius, y: y + Math.sin(a0) * radius }, { x: x + Math.cos(a1) * radius, y: y + Math.sin(a1) * radius }, colour);
  }
}

function ellipsePoint(part, radiusX, radiusY, radians) {
  const rotation = part.rotation ?? 0;
  const localX = Math.cos(radians) * radiusX;
  const localY = Math.sin(radians) * radiusY;
  return {
    x: part.centerX + localX * Math.cos(rotation) - localY * Math.sin(rotation),
    y: part.centerY + localX * Math.sin(rotation) + localY * Math.cos(rotation)
  };
}

function pushTri(triangles, a, b, c, color) {
  pushTriPoints(triangles, a.x, a.y, b.x, b.y, c.x, c.y, color);
}

function pushTriPoints(triangles, ax, ay, bx, by, cx, cy, color) {
  triangles.push({ ax, ay, bx, by, cx, cy, color });
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function mixColor(a, b, bWeight) {
  const t = clamp01(bWeight);
  return [
    a[0] * (1 - t) + b[0] * t,
    a[1] * (1 - t) + b[1] * t,
    a[2] * (1 - t) + b[2] * t,
    a[3] * (1 - t) + b[3] * t
  ];
}
