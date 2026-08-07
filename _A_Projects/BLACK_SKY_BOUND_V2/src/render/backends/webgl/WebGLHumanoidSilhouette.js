import { parseWebGLColor, withAlpha } from './WebGLColor.js';
import { appendLayeredFlame } from './WebGLFlameGeometry.js';
import { adaptMaterialToWebGL } from './WebGLMaterialAdapter.js';
import { buildWebGLCombatDebugTriangles } from './WebGLCombatDebugGeometry.js';

export const WEBGL_RAIDER_HUMANOID_MODE = 'raider_top_down_articulated_humanoid_v1';

export function buildWebGLRaiderHumanoidSilhouette(actor, alpha = 1) {
  const projection = actor.humanoidProjection;
  if (!projection?.profileId) return null;
  const points = projection.points ?? {};
  const profile = projection.profile ?? {};
  const palette = profile.palette ?? {};
  const material = adaptMaterialToWebGL(actor.material, parseWebGLColor(palette.torso, [0.48, 0.32, 0.2, 1]));
  const triangles = [];
  const rects = [];
  const outline = withAlpha(parseWebGLColor(palette.outline, [0.08, 0.05, 0.04, 1]), alpha);
  const torso = withAlpha(material.baseColor, alpha);
  const limb = withAlpha(parseWebGLColor(palette.limb, [0.22, 0.14, 0.1, 1]), alpha);
  const skin = withAlpha(parseWebGLColor(palette.skin, [0.72, 0.52, 0.36, 1]), alpha);
  const torch = withAlpha(parseWebGLColor(palette.torch, [0.42, 0.24, 0.12, 1]), alpha);
  const spearShaft = withAlpha(parseWebGLColor(palette.spearShaft, [0.46, 0.32, 0.2, 1]), alpha);
  const spearTip = withAlpha(parseWebGLColor(palette.spearTip, [0.78, 0.76, 0.68, 1]), alpha);
  const flame = parseWebGLColor(palette.flame, [1, 0.48, 0.12, 0.92]);
  const flameCore = parseWebGLColor(palette.flameCore, [1, 0.86, 0.48, 0.96]);

  addMotionTrails(triangles, projection.motionTrails, alpha);
  addSegment(triangles, points.chest, points.hips, Math.max(3, (profile.body?.spineWidth ?? 0.08) * 64), outline, 1.7);
  addSegment(triangles, points.chest, points.hips, Math.max(2, (profile.body?.spineWidth ?? 0.08) * 64), torso, 1.1);
  addSegment(triangles, points.leftShoulder, points.rightShoulder, 4.5, outline, 1.4);
  addSegment(triangles, points.leftHip, points.rightHip, 3.8, outline, 1.2);
  addLimbChain(triangles, points.leftShoulder, points.leftElbow, points.leftHand, profile.limbs?.armWidth, outline, limb);
  addLimbChain(triangles, points.rightShoulder, points.rightElbow, points.rightHand, profile.limbs?.armWidth, outline, limb);
  addLimbChain(triangles, points.leftHip, points.leftKnee, points.leftFoot, profile.limbs?.legWidth, outline, limb);
  addLimbChain(triangles, points.rightHip, points.rightKnee, points.rightFoot, profile.limbs?.legWidth, outline, limb);
  for (const key of ['leftElbow', 'rightElbow', 'leftKnee', 'rightKnee']) addEllipse(triangles, points[key], 2.35, 2.35, outline, 7);
  addEllipse(triangles, points.head, Math.max(4, points.head?.worldRadius ?? 5), Math.max(4, points.head?.worldRadius ?? 5), outline, 10);
  addEllipse(triangles, points.head, Math.max(3, (points.head?.worldRadius ?? 5) * 0.78), Math.max(3, (points.head?.worldRadius ?? 5) * 0.78), skin, 10);
  for (const key of ['leftHand', 'rightHand']) addEllipse(triangles, points[key], Math.max(2.4, points[key]?.worldRadius ?? 3), Math.max(2.4, points[key]?.worldRadius ?? 3), skin, 8);
  for (const key of ['leftFoot', 'rightFoot']) addEllipse(triangles, points[key], Math.max(2.6, points[key]?.worldRadius ?? 3), Math.max(2.2, (points[key]?.worldRadius ?? 3) * 0.72), outline, 8);
  const spearAttached = !!projection.sockets?.spearGrip && isPoint(points.spearButt) && isPoint(points.spearTip);
  if (spearAttached) {
    addSegment(triangles, points.spearButt, points.spearTip, Math.max(2.2, (profile.spear?.width ?? 0.038) * 64), outline, 1.75);
    addSegment(triangles, points.spearButt, points.spearTip, Math.max(1.5, (profile.spear?.width ?? 0.038) * 64), spearShaft, 1);
    addSpearHead(triangles, points.spearButt, points.spearTip, Math.max(7, (profile.spear?.tipLength ?? 0.15) * 64), Math.max(3.5, (profile.spear?.tipWidth ?? 0.085) * 64), outline, spearTip);
  }
  const torchAttached = !!projection.sockets?.torchHand && isPoint(points.torchTip) && isPoint(points.torchFlame);
  if (torchAttached) {
    const torchStowed = !!projection.guardState || projection.attackState?.profileId === 'raider_spear_jab';
    addSegment(triangles, points.torchGrip, points.torchTip, Math.max(2.2, (profile.torch?.width ?? 0.04) * 64), outline, 1.8);
    addSegment(triangles, points.torchGrip, points.torchTip, Math.max(1.6, (profile.torch?.width ?? 0.04) * 64), torch, 1);
    appendLayeredFlame(triangles, {
      x: points.torchFlame.worldX,
      y: points.torchFlame.worldY,
      radius: Math.max(2.2, (points.torchFlame?.worldRadius ?? 5) * (torchStowed ? 0.34 : 0.62)),
      outerColor: flame,
      innerColor: flameCore,
      alpha,
      seed: projection.gaitPhase ?? points.torchFlame.worldX * 0.01,
      lean: (projection.motion01 ?? 0) * -0.12
    });
  }

  const attackDebug = buildWebGLCombatDebugTriangles(actor, projection);
  triangles.push(...attackDebug);
  const attackDebugPrimitiveCount = attackDebug.length;
  return {
    mode: WEBGL_RAIDER_HUMANOID_MODE,
    triangles,
    rects,
    partCount: projection.partCount ?? 12,
    spearAttached,
    spearSocketCount: ['spearGrip', 'spearTip'].filter((key) => projection.sockets?.[key]).length,
    spearGripSocketCount: ['spearFrontGrip', 'spearRearGrip'].filter((key) => projection.sockets?.[key]).length,
    torchAttached,
    torchSocketCount: ['torchHand', 'torchTip', 'torchFlame'].filter((key) => projection.sockets?.[key]).length,
    attackDebugPrimitiveCount
  };
}

function addMotionTrails(triangles, samples = [], alpha = 1) {
  const roles = [...new Set(samples.map((sample) => sample.role))];
  for (const role of roles) {
    const trail = samples.filter((sample) => sample.role === role && isPoint(sample));
    for (let index = 1; index < trail.length; index += 1) {
      const from = trail[index - 1];
      const to = trail[index];
      const life01 = Math.max(0, Math.min(1, 1 - (to.age ?? 0) / Math.max(0.001, to.lifetime ?? 0.2)));
      const style = trailStyle(role, life01 * alpha);
      addSegment(triangles, from, to, style.width, style.color, 1);
    }
  }
}

function trailStyle(role, alpha) {
  if (role === 'flame_motion') {
    return { width: 3.2, color: withAlpha(parseWebGLColor('rgba(255,112,28,0.54)', [1, 0.44, 0.1, 0.54]), alpha * 0.24) };
  }
  if (role === 'spear_jab') {
    return { width: 3.2, color: withAlpha(parseWebGLColor('rgba(232,226,204,0.5)', [0.9, 0.88, 0.8, 0.5]), alpha * 0.48) };
  }
  return { width: 3.8, color: withAlpha(parseWebGLColor('rgba(205,194,175,0.42)', [0.8, 0.76, 0.68, 0.42]), alpha * 0.4) };
}

function addSpearHead(triangles, butt, tip, length, width, outline, fill) {
  const dx = tip.worldX - butt.worldX;
  const dy = tip.worldY - butt.worldY;
  const distance = Math.hypot(dx, dy) || 1;
  const fx = dx / distance;
  const fy = dy / distance;
  const rx = -fy;
  const ry = fx;
  const baseX = tip.worldX - fx * length;
  const baseY = tip.worldY - fy * length;
  pushTri(triangles, tip.worldX + fx * 1.8, tip.worldY + fy * 1.8, baseX + rx * width * 0.72, baseY + ry * width * 0.72, baseX - rx * width * 0.72, baseY - ry * width * 0.72, outline);
  pushTri(triangles, tip.worldX, tip.worldY, baseX + rx * width * 0.48, baseY + ry * width * 0.48, baseX - rx * width * 0.48, baseY - ry * width * 0.48, fill);
}

function addLimbChain(triangles, root, joint, end, width, outline, fill) {
  addLimbSegment(triangles, root, joint, width, outline, fill);
  addLimbSegment(triangles, joint, end, width, outline, fill);
}

function addLimbSegment(triangles, a, b, width, outline, fill) {
  addSegment(triangles, a, b, Math.max(3, (width ?? 0.04) * 64) * 1.65, outline, 1);
  addSegment(triangles, a, b, Math.max(2, (width ?? 0.04) * 64), fill, 1);
}


function addSegment(triangles, a, b, width, color, widthScale = 1) {
  if (!isPoint(a) || !isPoint(b)) return;
  const dx = b.worldX - a.worldX;
  const dy = b.worldY - a.worldY;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len * width * widthScale * 0.5;
  const ny = dx / len * width * widthScale * 0.5;
  pushTri(triangles, a.worldX + nx, a.worldY + ny, b.worldX + nx, b.worldY + ny, b.worldX - nx, b.worldY - ny, color);
  pushTri(triangles, a.worldX + nx, a.worldY + ny, b.worldX - nx, b.worldY - ny, a.worldX - nx, a.worldY - ny, color);
}

function addEllipse(triangles, center, rx, ry, color, segments) {
  if (!isPoint(center)) return;
  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    pushTri(
      triangles,
      center.worldX,
      center.worldY,
      center.worldX + Math.cos(a0) * rx,
      center.worldY + Math.sin(a0) * ry,
      center.worldX + Math.cos(a1) * rx,
      center.worldY + Math.sin(a1) * ry,
      color
    );
  }
}

function pushTri(triangles, x1, y1, x2, y2, x3, y3, color) {
  triangles.push({ ax: x1, ay: y1, bx: x2, by: y2, cx: x3, cy: y3, color });
}

function isPoint(point) {
  return Number.isFinite(point?.worldX) && Number.isFinite(point?.worldY);
}
