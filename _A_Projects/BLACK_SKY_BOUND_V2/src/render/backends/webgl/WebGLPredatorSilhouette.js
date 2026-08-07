import { parseWebGLColor, withAlpha } from './WebGLColor.js';
import { adaptMaterialToWebGL } from './WebGLMaterialAdapter.js';
import { buildWebGLCombatDebugTriangles } from './WebGLCombatDebugGeometry.js';

export const WEBGL_PREDATOR_MODE = 'werewolf_top_down_heavy_predator_v1';

export function buildWebGLPredatorSilhouette(actor, alpha = 1) {
  const projection = actor.predatorProjection;
  if (!projection?.profileId) return null;
  const points = projection.points ?? {};
  const profile = projection.profile ?? {};
  const palette = profile.palette ?? {};
  const readability = profile.readability ?? {};
  const material = adaptMaterialToWebGL(actor.material, parseWebGLColor(palette.fur, [0.3, 0.25, 0.31, 1]));
  const outline = withAlpha(parseWebGLColor(palette.outline, [0.07, 0.05, 0.08, 1]), alpha);
  const fur = withAlpha(material.baseColor, alpha);
  const highlight = withAlpha(parseWebGLColor(palette.furHighlight, [0.46, 0.39, 0.47, 1]), alpha * 0.78);
  const mane = withAlpha(parseWebGLColor(palette.mane, [0.17, 0.14, 0.18, 1]), alpha * 0.96);
  const muzzle = withAlpha(parseWebGLColor(palette.muzzle, [0.16, 0.13, 0.17, 1]), alpha);
  const mouth = withAlpha(parseWebGLColor(palette.mouth, [0.08, 0.05, 0.08, 1]), alpha * 0.94);
  const claw = withAlpha(parseWebGLColor(palette.claw, [0.75, 0.71, 0.77, 1]), alpha * (readability.baseClawAlpha ?? 0.68));
  const tooth = withAlpha(parseWebGLColor(palette.tooth, [0.84, 0.8, 0.82, 1]), alpha * (readability.baseToothAlpha ?? 0.62));
  const eye = withAlpha(parseWebGLColor(palette.eye, [0.84, 0.7, 0.87, 1]), alpha * (readability.baseEyeAlpha ?? 0.34));
  const triangles = [];
  const rects = [];
  const bodyAxis = axisBetween(points.hips, points.chest);
  const headAxis = axisBetween(points.head, points.muzzle, bodyAxis);

  addTail(triangles, points, profile, outline, fur);
  addHindlimb(triangles, points.leftHip, points.leftKnee, points.leftHock, points.leftHindPaw, profile, outline, fur, claw);
  addHindlimb(triangles, points.rightHip, points.rightKnee, points.rightHock, points.rightHindPaw, profile, outline, fur, claw);
  addUpperForelimb(triangles, points.leftShoulder, points.leftElbow, profile, outline, fur);
  addUpperForelimb(triangles, points.rightShoulder, points.rightElbow, profile, outline, fur);
  addFurSilhouette(triangles, points, profile, bodyAxis, outline, mane, highlight);
  addBody(triangles, points, profile, bodyAxis, outline, fur, mane);
  addLowerForelimb(triangles, points.leftElbow, points.leftWrist, points.leftClaw, profile, outline, fur, claw);
  addLowerForelimb(triangles, points.rightElbow, points.rightWrist, points.rightClaw, profile, outline, fur, claw);
  addHead(triangles, points, profile, headAxis, projection.animationState?.jawOpen01 ?? 0, outline, fur, highlight, muzzle, mouth, eye, tooth);
  const attackDebug = buildWebGLCombatDebugTriangles(actor, projection);
  triangles.push(...attackDebug);

  return {
    mode: WEBGL_PREDATOR_MODE,
    triangles,
    rects,
    partCount: projection.partCount ?? 31,
    detailTier: profile.visual?.detailTier ?? 1,
    attackDebugPrimitiveCount: attackDebug.length
  };
}

function addBody(triangles, points, profile, axis, outline, fur, mane) {
  const px = (value) => worldPixels(profile, value);
  addTaperedSegment(triangles, points.hips, points.waist, px(profile.body.hipRadius * 1.72), px(profile.body.waistRadius * 1.62), outline);
  addTaperedSegment(triangles, points.hips, points.waist, px(profile.body.hipRadius * 1.4), px(profile.body.waistRadius * 1.25), fur);
  addTaperedSegment(triangles, points.waist, points.chest, px(profile.body.waistRadius * 1.62), px(profile.body.chestRadius * 1.82), outline);
  addTaperedSegment(triangles, points.waist, points.chest, px(profile.body.waistRadius * 1.25), px(profile.body.chestRadius * 1.5), fur);
  addOrientedEllipse(triangles, points.hips, axis, px(profile.body.hipRadius * 0.94), px(profile.body.hipRadius * 1.05), outline, 12);
  addOrientedEllipse(triangles, points.chest, axis, px(profile.body.chestDepth * 1.08), px(profile.body.chestRadius * 1.08), outline, 14);
  addOrientedEllipse(triangles, points.neck, axis, px(profile.body.neckRadius * 1.03), px(profile.body.neckRadius * 0.94), outline, 10);
  addOrientedEllipse(triangles, points.hips, axis, px(profile.body.hipRadius * 0.76), px(profile.body.hipRadius * 0.86), fur, 12);
  addOrientedEllipse(triangles, points.chest, axis, px(profile.body.chestDepth * 0.9), px(profile.body.chestRadius * 0.88), fur, 14);
  addOrientedEllipse(triangles, points.neck, axis, px(profile.body.neckRadius * 0.82), px(profile.body.neckRadius * 0.72), mane, 10);
}

function addUpperForelimb(triangles, shoulder, elbow, profile, outline, fur) {
  const upper = worldPixels(profile, profile.limbs.upperArmWidth);
  const lower = worldPixels(profile, profile.limbs.forearmWidth);
  addTaperedPair(triangles, shoulder, elbow, upper * 1.22, lower * 1.16, outline, fur);
}

function addLowerForelimb(triangles, elbow, wrist, clawTip, profile, outline, fur, claw) {
  const lower = worldPixels(profile, profile.limbs.forearmWidth);
  addTaperedPair(triangles, elbow, wrist, lower * 1.2, lower * 0.76, outline, fur);
  addEllipse(triangles, elbow, Math.max(4.2, lower * 0.56), Math.max(3.7, lower * 0.48), outline, 7);
  addOrientedEllipse(triangles, wrist, axisBetween(elbow, wrist), worldPixels(profile, profile.limbs.forePawRadius) * 1.05, worldPixels(profile, profile.limbs.forePawRadius) * 0.82, outline, 8);
  addClawFan(triangles, wrist, clawTip, worldPixels(profile, profile.limbs.clawSpread), claw, 3);
}

function addHindlimb(triangles, hip, knee, hock, paw, profile, outline, fur, claw) {
  const thigh = worldPixels(profile, profile.limbs.thighWidth);
  const shin = worldPixels(profile, profile.limbs.shinWidth);
  addTaperedPair(triangles, hip, knee, thigh * 1.2, shin * 1.14, outline, fur);
  addTaperedPair(triangles, knee, hock, shin * 1.16, shin * 0.74, outline, fur);
  addTaperedPair(triangles, hock, paw, shin * 0.72, shin * 0.48, outline, fur);
  addEllipse(triangles, knee, Math.max(4.6, shin * 0.58), Math.max(4, shin * 0.48), outline, 7);
  addEllipse(triangles, hock, Math.max(3.4, shin * 0.4), Math.max(3.1, shin * 0.34), outline, 6);
  addOrientedEllipse(triangles, paw, axisBetween(hock, paw), worldPixels(profile, profile.limbs.hindPawRadius), worldPixels(profile, profile.limbs.hindPawRadius) * 0.78, outline, 8);
  addClawFan(triangles, hock, paw, worldPixels(profile, profile.limbs.clawSpread) * 0.62, claw, 2);
}

function addTail(triangles, points, profile, outline, fur) {
  const width = worldPixels(profile, profile.tail.width);
  addTaperedPair(triangles, points.tailBase, points.tailMid, width * 1.35, width * 0.82, outline, fur);
  addTaperedPair(triangles, points.tailMid, points.tailTip, width * 0.86, Math.max(2.2, width * 0.24), outline, fur);
}

function addHead(triangles, points, profile, axis, jawOpen, outline, fur, highlight, muzzle, mouth, eye, tooth) {
  const px = (value) => worldPixels(profile, value);
  addEar(triangles, points.leftEarBase, points.leftEarTip, px(profile.head.earWidth), outline, fur);
  addEar(triangles, points.rightEarBase, points.rightEarTip, px(profile.head.earWidth * profile.head.brokenEarScale), outline, fur);
  addOrientedEllipse(triangles, points.head, axis, px(profile.head.radius * 1.28), px(profile.head.width * 0.66), outline, 12);
  addOrientedEllipse(triangles, points.head, axis, px(profile.head.radius * 1.04), px(profile.head.width * 0.5), highlight, 12);
  addTaperedSegment(triangles, points.head, points.muzzle, px(profile.head.width * 0.72), px(profile.head.muzzleRadius * 1.65), outline);
  addTaperedSegment(triangles, points.head, points.muzzle, px(profile.head.width * 0.5), px(profile.head.muzzleRadius * 1.24), muzzle);
  addSegment(triangles, points.leftJaw, points.rightJaw, Math.max(3.2, px(profile.head.muzzleRadius * 0.5)), mouth);
  addOrientedEllipse(triangles, points.leftJaw, axis, px(profile.head.muzzleRadius * 0.7), px(profile.head.jawWidth * 0.38), muzzle, 7);
  addOrientedEllipse(triangles, points.rightJaw, axis, px(profile.head.muzzleRadius * 0.7), px(profile.head.jawWidth * 0.38), muzzle, 7);
  addEllipse(triangles, points.leftEye, 1.65, 1.35, eye, 6);
  addEllipse(triangles, points.rightEye, 1.65, 1.35, eye, 6);
  if (jawOpen > 0.26) addTeeth(triangles, points, axis, tooth, jawOpen);
}

function addFurSilhouette(triangles, points, profile, axis, outline, mane, highlight) {
  if ((profile.visual?.detailTier ?? 1) < 2) return;
  const right = { x: -axis.y, y: axis.x };
  const shoulderLength = worldPixels(profile, profile.fur.shoulderTuftLength * profile.fur.maneIntensity);
  const spineLength = worldPixels(profile, profile.fur.spineTuftLength * profile.fur.maneIntensity);
  addTuft(triangles, points.leftMane, combine(axis, right, -0.25, -1), shoulderLength * 1.08, outline, mane);
  addTuft(triangles, points.rightMane, combine(axis, right, -0.12, 1), shoulderLength * 0.86, outline, mane);
  addTuft(triangles, points.spineMane, combine(axis, right, -0.95, -0.28), spineLength, outline, highlight);
  addTuft(triangles, points.neck, combine(axis, right, -0.5, 0.62), spineLength * 0.82, outline, mane);
  addTuft(triangles, points.hips, combine(axis, right, -0.58, -0.72), spineLength * 0.72, outline, mane);
}

function addTaperedPair(triangles, a, b, startWidth, endWidth, outline, fill) {
  addTaperedSegment(triangles, a, b, startWidth * 1.34, endWidth * 1.38, outline);
  addTaperedSegment(triangles, a, b, startWidth, endWidth, fill);
}

function addTaperedSegment(triangles, a, b, startWidth, endWidth, color) {
  if (!isPoint(a) || !isPoint(b)) return;
  const axis = axisBetween(a, b);
  const right = { x: -axis.y, y: axis.x };
  const aHalf = startWidth * 0.5;
  const bHalf = endWidth * 0.5;
  pushTri(triangles, a.worldX + right.x * aHalf, a.worldY + right.y * aHalf, b.worldX + right.x * bHalf, b.worldY + right.y * bHalf, b.worldX - right.x * bHalf, b.worldY - right.y * bHalf, color);
  pushTri(triangles, a.worldX + right.x * aHalf, a.worldY + right.y * aHalf, b.worldX - right.x * bHalf, b.worldY - right.y * bHalf, a.worldX - right.x * aHalf, a.worldY - right.y * aHalf, color);
}

function addClawFan(triangles, root, tip, spread, color, count) {
  if (!isPoint(root) || !isPoint(tip)) return;
  const axis = axisBetween(root, tip);
  const right = { x: -axis.y, y: axis.x };
  for (let index = 0; index < count; index += 1) {
    const offset = (index - (count - 1) * 0.5) * spread * 0.44;
    const baseX = root.worldX + right.x * offset;
    const baseY = root.worldY + right.y * offset;
    const tipX = tip.worldX + right.x * offset * 1.28;
    const tipY = tip.worldY + right.y * offset * 1.28;
    pushTri(triangles, baseX + right.x * 1.35, baseY + right.y * 1.35, baseX - right.x * 1.35, baseY - right.y * 1.35, tipX, tipY, color);
  }
}

function addEar(triangles, base, tip, width, outline, fill) {
  if (!isPoint(base) || !isPoint(tip)) return;
  const axis = axisBetween(base, tip);
  const right = { x: -axis.y, y: axis.x };
  pushTri(triangles, base.worldX + right.x * width, base.worldY + right.y * width, base.worldX - right.x * width, base.worldY - right.y * width, tip.worldX, tip.worldY, outline);
  pushTri(triangles, base.worldX + right.x * width * 0.62, base.worldY + right.y * width * 0.62, base.worldX - right.x * width * 0.62, base.worldY - right.y * width * 0.62, tip.worldX * 0.92 + base.worldX * 0.08, tip.worldY * 0.92 + base.worldY * 0.08, fill);
}

function addTuft(triangles, root, direction, length, outline, fill) {
  if (!isPoint(root)) return;
  const axis = normalise(direction.x, direction.y);
  const right = { x: -axis.y, y: axis.x };
  const half = Math.max(2.4, length * 0.32);
  const tipX = root.worldX + axis.x * length;
  const tipY = root.worldY + axis.y * length;
  pushTri(triangles, root.worldX + right.x * half, root.worldY + right.y * half, root.worldX - right.x * half, root.worldY - right.y * half, tipX, tipY, outline);
  pushTri(triangles, root.worldX + right.x * half * 0.58, root.worldY + right.y * half * 0.58, root.worldX - right.x * half * 0.58, root.worldY - right.y * half * 0.58, root.worldX + axis.x * length * 0.82, root.worldY + axis.y * length * 0.82, fill);
}

function addTeeth(triangles, points, axis, color, jawOpen) {
  const right = { x: -axis.y, y: axis.x };
  for (const side of [-1, 1]) {
    const rootX = points.mouth.worldX + right.x * side * 2.8;
    const rootY = points.mouth.worldY + right.y * side * 2.8;
    pushTri(triangles, rootX + right.x * side * 1.2, rootY + right.y * side * 1.2, rootX - right.x * side * 1.2, rootY - right.y * side * 1.2, rootX + axis.x * (3.5 + jawOpen * 1.5), rootY + axis.y * (3.5 + jawOpen * 1.5), color);
  }
}

function addSegment(triangles, a, b, width, color) { addTaperedSegment(triangles, a, b, width, width, color); }

function addOrientedEllipse(triangles, center, axis, forwardRadius, sideRadius, color, segments) {
  if (!isPoint(center)) return;
  const forward = normalise(axis.x, axis.y);
  const right = { x: -forward.y, y: forward.x };
  for (let index = 0; index < segments; index += 1) {
    const a0 = index / segments * Math.PI * 2;
    const a1 = (index + 1) / segments * Math.PI * 2;
    const p0 = ellipsePoint(center, forward, right, forwardRadius, sideRadius, a0);
    const p1 = ellipsePoint(center, forward, right, forwardRadius, sideRadius, a1);
    pushTri(triangles, center.worldX, center.worldY, p0.x, p0.y, p1.x, p1.y, color);
  }
}

function addEllipse(triangles, center, rx, ry, color, segments) {
  addOrientedEllipse(triangles, center, { x: 1, y: 0 }, rx, ry, color, segments);
}

function ellipsePoint(center, forward, right, forwardRadius, sideRadius, angle) {
  return {
    x: center.worldX + forward.x * Math.cos(angle) * forwardRadius + right.x * Math.sin(angle) * sideRadius,
    y: center.worldY + forward.y * Math.cos(angle) * forwardRadius + right.y * Math.sin(angle) * sideRadius
  };
}

function axisBetween(a, b, fallback = { x: 1, y: 0 }) {
  if (!isPoint(a) || !isPoint(b)) return fallback;
  return normalise(b.worldX - a.worldX, b.worldY - a.worldY, fallback);
}

function normalise(x, y, fallback = { x: 1, y: 0 }) {
  const length = Math.hypot(x, y);
  return length > 0.0001 ? { x: x / length, y: y / length } : fallback;
}

function combine(forward, right, forwardAmount, rightAmount) {
  return normalise(forward.x * forwardAmount + right.x * rightAmount, forward.y * forwardAmount + right.y * rightAmount);
}

function worldPixels(profile, value) {
  return value * 64 * (profile.visual?.scale ?? 1);
}

function pushTri(triangles, ax, ay, bx, by, cx, cy, color) {
  triangles.push({ ax, ay, bx, by, cx, cy, color });
}

function isPoint(point) {
  return Number.isFinite(point?.worldX) && Number.isFinite(point?.worldY);
}
