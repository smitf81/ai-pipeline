import { parseWebGLColor, withAlpha } from './WebGLColor.js';
import { adaptMaterialToWebGL } from './WebGLMaterialAdapter.js';

export const WEBGL_PLAYER_WYVERN_MODE = 'player_wyvern_silhouette_v0';
export const WEBGL_WYVERN_ANATOMY_CONTRACT = Object.freeze({
  bodyPlan: 'four_limb_wyvern',
  wingLimbRole: 'wing_forelimb',
  wingDigitOrigin: 'wrist_claw',
  wingMembraneAttachment: 'low_flank_hip',
  locomotion: 'grounded_crawl'
});

export function buildWebGLPlayerWyvernSilhouette(actor) {
  const visual = actor.wyvernProjection;
  if (!visual?.bodyPoints?.length) return null;
  if (visual.bodyPlan !== WEBGL_WYVERN_ANATOMY_CONTRACT.bodyPlan) return null;
  const byRole = Object.fromEntries(visual.bodyPoints.map((point) => [point.role, point]));
  const forward = { x: Math.cos(actor.rotation ?? 0), y: Math.sin(actor.rotation ?? 0) };
  const right = { x: -forward.y, y: forward.x };
  const palette = buildPalette(visual.palette, actor.material);
  const pose = visual.proceduralPose;
  const rigPose = visual.rigPose;
  const profile = visual.proportionProfile ?? {};
  const r = Math.max(10, actor.worldRadius * (rigPose?.visualScale ?? profile.visual?.scale ?? 1.45));
  const posedByRole = rigPose?.axial ?? applyBodyPose(byRole, pose?.bodyOffsets, forward, right, r);
  const triangles = [];
  const rects = buildAttackContactDebugRects(pose?.attackContact, palette);
  let partCount = 0;

  partCount += addWingForelimb(triangles, posedByRole, forward, right, -1, r, visual.wingAnatomy, palette, pose?.wingForelimbs, profile, rigPose?.wingForelimbs);
  partCount += addWingForelimb(triangles, posedByRole, forward, right, 1, r, visual.wingAnatomy, palette, pose?.wingForelimbs, profile, rigPose?.wingForelimbs);
  partCount += addTail(triangles, posedByRole, r, palette, profile, rigPose?.tail);
  partCount += addHindLeg(triangles, posedByRole, forward, right, -1, r, visual.hindLegAnatomy, palette, pose?.hindLegs, profile, rigPose?.hindLegs);
  partCount += addHindLeg(triangles, posedByRole, forward, right, 1, r, visual.hindLegAnatomy, palette, pose?.hindLegs, profile, rigPose?.hindLegs);
  partCount += addBody(triangles, posedByRole, forward, right, r, visual.proportions, palette, profile, rigPose?.body);
  partCount += addHead(triangles, posedByRole.head ? point(posedByRole.head) : { x: actor.worldX, y: actor.worldY }, forward, right, r, visual.proportions, palette, pose, profile, rigPose?.head);

  return { triangles, rects, partCount, mode: WEBGL_PLAYER_WYVERN_MODE };
}

function addBody(triangles, byRole, forward, right, r, proportions, palette, profile, bodyRig) {
  const head = byRole.head;
  const neck = byRole.neck;
  const chest = byRole.chest;
  const hips = byRole.hips;
  if (!neck || !chest || !hips) return 0;
  const neckWidth = bodyRig?.worldNeckWidth ?? r * (profile?.neck?.width ?? proportions.neck ?? 0.34);
  const shoulderWidth = bodyRig?.worldShoulderWidth ?? r * (profile?.shoulders?.width ?? proportions.shoulderWidth ?? 1.0);
  const chestWidth = bodyRig?.worldChestWidth ?? r * (profile?.shoulders?.chestWidth ?? proportions.chest ?? 0.92);
  const chestLength = bodyRig?.worldChestLength ?? r * (profile?.shoulders?.chestLength ?? 0.68);
  const hipWidth = bodyRig?.worldHipWidth ?? r * (profile?.hips?.width ?? proportions.hips ?? 0.72);
  const hipLength = bodyRig?.worldHipLength ?? r * (profile?.hips?.length ?? proportions.hipLength ?? 0.54);
  const torsoWidth = bodyRig?.worldTorsoWidth ?? r * (profile?.torso?.width ?? 0.72);
  if (head) {
    addCapsule(triangles, point(head), point(neck), neckWidth * 0.78, palette.hideDark, 8);
    addCapsule(triangles, point(head), point(neck), neckWidth * 0.48, palette.hide, 8);
  }
  addCapsule(triangles, point(neck), point(chest), neckWidth, palette.hideDark, 8);
  addCapsule(triangles, point(chest), point(hips), torsoWidth * 0.82, palette.hideDark, 8);
  addCapsule(triangles, point(neck), point(hips), torsoWidth * 0.52, palette.hide, 8);
  addShoulderMass(triangles, point(chest), forward, right, r, shoulderWidth / r, palette);
  addEllipse(triangles, point(chest), chestWidth * 1.12, chestLength, angle(forward), palette.hideRimDim, 14);
  addEllipse(triangles, point(chest), chestWidth, chestLength * 0.86, angle(forward), palette.hide, 14);
  addHipMass(triangles, point(hips), forward, right, r, profile, palette, bodyRig);
  addEllipse(triangles, point(hips), hipWidth * 1.08, hipLength, angle(forward), palette.hideRimDim, 14);
  addEllipse(triangles, point(hips), hipWidth, hipLength * 0.86, angle(forward), palette.hide, 14);
  addSpineRidge(triangles, [neck, chest, hips].map(point), forward, right, r, palette);
  return head ? 8 : 6;
}

function addShoulderMass(triangles, chest, forward, right, r, shoulderWidth, palette) {
  const shoulderRadius = r * 0.2;
  for (const side of [-1, 1]) {
    const center = offset(chest, right, side * r * shoulderWidth * 0.45, forward, r * 0.06);
    addEllipse(triangles, center, shoulderRadius * 1.25, shoulderRadius * 0.82, angle(forward) + side * 0.18, palette.hideRimDim, 8);
    addEllipse(triangles, center, shoulderRadius, shoulderRadius * 0.66, angle(forward) + side * 0.18, palette.hideDark, 8);
  }
}

function addTail(triangles, byRole, r, palette, profile, skeletalTail) {
  const points = Array.isArray(skeletalTail) && skeletalTail.length >= 2
    ? skeletalTail.map(skeletalPoint)
    : [byRole.hips, byRole.tailBase, byRole.tailMid, byRole.tailTip].filter(Boolean).map(point);
  if (points.length < 2) return 0;
  const tail = profile?.tail ?? {};
  const widths = tail.taper ?? [0.42, 0.32, 0.22];
  const root = points[1] ?? points[0];
  const rootAngle = angleBetween(points[0], root);
  const rootWidth = points[0].width ?? r * (tail.rootMass ?? widths[0] ?? 0.34);
  addEllipse(triangles, root, rootWidth * 1.1, rootWidth * 0.78, rootAngle, palette.hideDark, 10);
  for (let i = 0; i < points.length - 1; i += 1) {
    const width = Math.max(points[i].width ?? 0, points[i + 1].width ?? 0, r * (widths[i] ?? 0.18));
    addCapsule(triangles, points[i], points[i + 1], width * 1.08, palette.hideDark, 7);
    addCapsule(triangles, points[i], points[i + 1], width * 0.66, palette.hide, 7);
    addCapsule(triangles, points[i], points[i + 1], Math.max(1.6, width * 0.28), palette.tailRim, 5);
  }
  return points.length;
}

function addHipMass(triangles, hips, forward, right, r, profile, palette, bodyRig) {
  const hip = profile?.hips ?? {};
  const hipWidth = (bodyRig?.worldHipWidth ?? r * (hip.width ?? 0.72)) / r;
  const haunchWidth = bodyRig?.worldHaunchWidth ?? r * (hip.haunchWidth ?? 0.36);
  const haunchLength = bodyRig?.worldHaunchLength ?? r * (hip.haunchLength ?? 0.36);
  const back = bodyRig?.worldHipAnchorBack ?? r * (hip.hipAnchorBack ?? 0.16);
  for (const side of [-1, 1]) {
    const center = offset(hips, right, side * r * hipWidth * 0.36, forward, -back);
    addEllipse(triangles, center, haunchWidth * 1.06, haunchLength, angle(forward) - side * 0.14, palette.hideRimDim, 9);
    addEllipse(triangles, center, haunchWidth * 0.86, haunchLength * 0.78, angle(forward) - side * 0.14, palette.hideDark, 9);
  }
}

function addHead(triangles, head, forward, right, r, proportions, palette, pose, profile, headRig) {
  const headLength = headRig?.worldHeadLength ?? r * (profile?.head?.length ?? proportions.headLength ?? (proportions.head ?? 0.56) * 1.3);
  const headWidth = headRig?.worldHeadWidth ?? r * (profile?.head?.width ?? proportions.headWidth ?? (proportions.head ?? 0.56) * 0.78);
  const jaw = profile?.jaw ?? {};
  const snout = r * (profile?.head?.snoutLength ?? proportions.snout ?? 0.42);
  const center = headRig?.center ? point(headRig.center) : offset(head, right, 0, forward, snout * 0.25);
  const jawOpen = headRig?.jawOpen ?? Math.max(0, Math.min(jaw.maxOpen ?? 0.72, pose?.jawOpen ?? 0));
  const muzzle = headRig?.muzzle ? point(headRig.muzzle) : offset(center, right, 0, forward, headLength * 0.42);
  addEllipse(triangles, center, headLength * 0.82, headWidth * 1.04, angle(forward), palette.hideRimDim, 14);
  addEllipse(triangles, center, headLength * 0.72, headWidth * 0.9, angle(forward), palette.hide, 14);
  addEllipse(triangles, muzzle, r * (jaw.length ?? 0.38), r * (jaw.width ?? 0.22), angle(forward), palette.hideDark, 10);
  if (jawOpen > 0.02) {
    const split = (headRig?.worldOpeningSeparation ?? r * (jaw.openingSeparation ?? 0.1)) * jawOpen;
    const jawLength = (headRig?.worldJawLength ?? r * (jaw.length ?? 0.38)) * (0.82 + jawOpen * 0.16);
    const jawWidth = (headRig?.worldJawWidth ?? r * (jaw.width ?? 0.22)) * (0.52 + jawOpen * 0.22);
    addEllipse(triangles, offset(muzzle, right, split, forward, jawLength * 0.22), jawLength, jawWidth, angle(forward), palette.hideRim, 8);
    addEllipse(triangles, offset(muzzle, right, -split, forward, jawLength * 0.18), jawLength * 0.9, jawWidth * 0.82, angle(forward), palette.hideRimDim, 8);
  }
  addEye(triangles, center, forward, right, 1, r, palette);
  addEye(triangles, center, forward, right, -1, r, palette);
  return jawOpen > 0.02 ? 4 : 3;
}

function addEye(triangles, center, forward, right, side, r, palette) {
  addEllipse(
    triangles,
    offset(center, right, side * r * 0.18, forward, r * 0.25),
    Math.max(1.1, r * 0.055),
    Math.max(0.8, r * 0.036),
    angle(forward),
    palette.eye,
    6
  );
}

function addWingForelimb(triangles, byRole, forward, right, side, r, anatomy, palette, wingPose, profile, rigWings) {
  const rigWing = rigWings?.[sideName(side)];
  if (rigWing) {
    const shoulder = point(rigWing.shoulder);
    const elbow = point(rigWing.elbow);
    const wrist = point(rigWing.wrist);
    const membraneRoot = point(rigWing.membraneRoot);
    const digits = rigWing.digits.map((digit) => ({
      tip: point(digit.tip),
      knuckles: digit.knuckles.map(point)
    }));
    addMembrane(triangles, [membraneRoot, shoulder, elbow, wrist, ...digits.map((digit) => digit.tip)], palette.wingMembrane);
    addCapsule(triangles, point(byRole.chest), shoulder, r * anatomy.boneWidth * 0.58, palette.hideRim, 5);
    addCapsule(triangles, shoulder, elbow, r * anatomy.boneWidth, palette.hideRim, 5);
    addCapsule(triangles, elbow, wrist, r * anatomy.boneWidth, palette.hideRim, 5);
    drawWingDigits(triangles, wrist, digits, forward, r, anatomy, palette);
    for (const joint of [shoulder, elbow, wrist]) addEllipse(triangles, joint, r * 0.1, r * 0.075, angle(forward), palette.hideDark, 6);
    addEllipse(triangles, wrist, r * anatomy.clawRadius * 1.2, r * anatomy.clawRadius * 0.68, angle(forward) + side * 0.25, palette.hideDark, 7);
    return 1 + digits.length;
  }

  const chest = byRole.chest ? point(byRole.chest) : null;
  const hips = byRole.hips ? point(byRole.hips) : null;
  if (!chest || !anatomy) return 0;
  const pose = wingPose?.[sideName(side)];
  const shoulderWidth = profile?.forelimb?.shoulderAnchorWidth ?? anatomy.shoulderWidth;
  const shoulder = offset(chest, right, side * r * shoulderWidth + poseAmount(pose?.shoulder, 'right', r), forward, r * anatomy.shoulderForward + poseAmount(pose?.shoulder, 'forward', r));
  const elbow = offset(shoulder, right, side * r * anatomy.elbowPreferredOut + poseAmount(pose?.elbow, 'right', r), forward, r * anatomy.elbowPreferredForward + poseAmount(pose?.elbow, 'forward', r));
  const wrist = offset(shoulder, right, side * r * anatomy.wristOut + poseAmount(pose?.wrist, 'right', r), forward, r * anatomy.wristForward + poseAmount(pose?.wrist, 'forward', r));
  const membraneRoot = hips
    ? offset(hips, right, side * r * (anatomy.membraneHipOut ?? anatomy.membraneRootOut), forward, -r * (anatomy.membraneHipBack ?? 0))
    : offset(chest, right, side * r * anatomy.membraneRootOut, forward, -r * anatomy.membraneRootBack);
  const digits = buildWingDigits(wrist, forward, right, side, r, anatomy);

  addMembrane(triangles, [membraneRoot, shoulder, elbow, wrist, ...digits.map((digit) => digit.tip)], palette.wingMembrane);
  addCapsule(triangles, chest, shoulder, r * anatomy.boneWidth * 0.58, palette.hideRim, 5);
  addCapsule(triangles, shoulder, elbow, r * anatomy.boneWidth, palette.hideRim, 5);
  addCapsule(triangles, elbow, wrist, r * anatomy.boneWidth, palette.hideRim, 5);
  drawWingDigits(triangles, wrist, digits, forward, r, anatomy, palette);
  for (const joint of [shoulder, elbow, wrist]) addEllipse(triangles, joint, r * 0.1, r * 0.075, angle(forward), palette.hideDark, 6);
  addEllipse(triangles, wrist, r * anatomy.clawRadius * 1.2, r * anatomy.clawRadius * 0.68, angle(forward) + side * 0.25, palette.hideDark, 7);
  return 1 + digits.length;
}

function drawWingDigits(triangles, wrist, digits, forward, r, anatomy, palette) {
  for (const digit of digits) {
    addCapsule(triangles, wrist, digit.knuckles[0], r * anatomy.boneWidth * 0.42, palette.digitRim, 4);
    addCapsule(triangles, digit.knuckles[0], digit.knuckles[1], r * anatomy.boneWidth * 0.36, palette.digitRim, 4);
    addCapsule(triangles, digit.knuckles[1], digit.tip, r * anatomy.boneWidth * 0.3, palette.digitRim, 4);
    addEllipse(triangles, digit.tip, r * 0.045, r * 0.034, angle(forward), palette.hideRimDim, 5);
  }
}

function buildWingDigits(wrist, forward, right, side, r, anatomy) {
  return anatomy.digitLengths.map((lengthScale, index) => {
    const rawTip = offset(
      wrist,
      right,
      side * r * anatomy.digitOut[index],
      forward,
      -r * anatomy.digitBack[index]
    );
    const tip = capDistance(wrist, rawTip, r * lengthScale);
    const knuckles = anatomy.digitKnuckleFractions.map((fraction) => ({
      x: wrist.x + (tip.x - wrist.x) * fraction,
      y: wrist.y + (tip.y - wrist.y) * fraction
    }));
    return { tip, knuckles };
  });
}

function addHindLeg(triangles, byRole, forward, right, side, r, anatomy, palette, hindPose, profile, skeletalHindLegs) {
  const skeletalLeg = skeletalHindLegs?.[sideName(side)];
  if (skeletalLeg?.hip && skeletalLeg?.knee && skeletalLeg?.ankle && skeletalLeg?.foot) {
    const hip = skeletalPoint(skeletalLeg.hip);
    const knee = skeletalPoint(skeletalLeg.knee);
    const ankle = skeletalPoint(skeletalLeg.ankle);
    const foot = skeletalPoint(skeletalLeg.foot);
    const plantedBoost = skeletalLeg.planted ? 1.12 : 0.96;
    addEllipse(triangles, hip, (hip.width ?? r * 0.24) * 1.25, (hip.width ?? r * 0.24) * 0.86, angle(forward) - side * 0.16, palette.hideDark, 7);
    addCapsule(triangles, hip, knee, (knee.width ?? r * 0.22) * 0.96, palette.hideDark, 5);
    addCapsule(triangles, knee, ankle, (ankle.width ?? r * 0.16) * 0.92, palette.hideRim, 5);
    addEllipse(triangles, ankle, (foot.width ?? r * 0.2) * 1.85 * plantedBoost, (foot.width ?? r * 0.2) * 0.92, angle(forward) + Math.PI * 0.5 + side * 0.2, palette.hideDark, 7);
    addEllipse(triangles, foot, (foot.width ?? r * 0.18) * 0.96, (foot.width ?? r * 0.18) * 0.42, angle(forward) + side * 0.28, palette.hideRimDim, 5);
    return 3;
  }

  const hips = byRole.hips ? point(byRole.hips) : null;
  if (!hips || !anatomy) return 0;
  const pose = hindPose?.[sideName(side)];
  const hind = profile?.hindLeg ?? {};
  const hip = offset(hips, right, side * r * (hind.hipWidth ?? anatomy.hipWidth), forward, -r * (hind.hipBack ?? anatomy.hipBack));
  const knee = offset(hip, right, side * r * (hind.kneeOut ?? anatomy.kneeOut) + poseAmount(pose?.knee, 'right', r), forward, -r * (hind.kneeBack ?? anatomy.kneeBack) + poseAmount(pose?.knee, 'forward', r));
  const ankle = offset(hip, right, side * r * (hind.ankleOut ?? anatomy.ankleOut) + poseAmount(pose?.ankle, 'right', r), forward, -r * (hind.footBack ?? anatomy.ankleBack) + poseAmount(pose?.ankle, 'forward', r));
  const footLength = hind.footLength ?? anatomy.footLength;
  const footRadius = hind.footRadius ?? anatomy.footRadius;
  const clawSpread = hind.clawSpread ?? anatomy.clawSpread ?? 0.1;
  addEllipse(triangles, hip, r * (hind.thighGirth ?? anatomy.thighGirth) * 1.18, r * (hind.thighGirth ?? anatomy.thighGirth) * 0.82, angle(forward) - side * 0.16, palette.hideDark, 7);
  addCapsule(triangles, hip, knee, r * (hind.thighGirth ?? anatomy.thighGirth) * 0.86, palette.hideDark, 5);
  addCapsule(triangles, knee, ankle, r * (hind.shinGirth ?? anatomy.shinGirth) * 0.82, palette.hideRim, 5);
  addEllipse(triangles, ankle, r * footLength * 0.72, r * footRadius * 0.86, angle(forward) + Math.PI * 0.5 + side * 0.2, palette.hideDark, 7);
  addEllipse(triangles, offset(ankle, right, side * r * clawSpread, forward, -r * footLength * 0.2), r * footLength * 0.34, r * footRadius * 0.34, angle(forward) + side * 0.28, palette.hideRimDim, 5);
  return 3;
}

function addMembrane(triangles, points, color) {
  if (points.length < 3) return;
  for (let i = 1; i < points.length - 1; i += 1) {
    addTriangle(triangles, points[0], points[i], points[i + 1], color);
  }
}

function addSpineRidge(triangles, points, forward, right, r, palette) {
  for (const p of points) {
    const top = offset(p, right, 0, forward, r * 0.18);
    const a = offset(p, right, -r * 0.055, forward, -r * 0.08);
    const b = offset(p, right, r * 0.055, forward, -r * 0.08);
    addTriangle(triangles, top, a, b, palette.hideRimDim);
  }
}

function addCapsule(triangles, a, b, width, color, segments = 6) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const p1 = { x: a.x + nx * width, y: a.y + ny * width };
  const p2 = { x: a.x - nx * width, y: a.y - ny * width };
  const p3 = { x: b.x - nx * width, y: b.y - ny * width };
  const p4 = { x: b.x + nx * width, y: b.y + ny * width };
  addQuad(triangles, p1, p2, p3, p4, color);
  addEllipse(triangles, a, width, width, 0, color, segments);
  addEllipse(triangles, b, width, width, 0, color, segments);
}

function addEllipse(triangles, center, rx, ry, rotation, color, segments = 10) {
  let previous = ellipsePoint(center, rx, ry, rotation, 0);
  for (let i = 1; i <= segments; i += 1) {
    const next = ellipsePoint(center, rx, ry, rotation, (Math.PI * 2 * i) / segments);
    addTriangle(triangles, center, previous, next, color);
    previous = next;
  }
}

function ellipsePoint(center, rx, ry, rotation, theta) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const x = Math.cos(theta) * rx;
  const y = Math.sin(theta) * ry;
  return {
    x: center.x + x * cos - y * sin,
    y: center.y + x * sin + y * cos
  };
}

function addQuad(triangles, a, b, c, d, color) {
  addTriangle(triangles, a, b, c, color);
  addTriangle(triangles, a, c, d, color);
}

function addTriangle(triangles, a, b, c, color) {
  triangles.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, cx: c.x, cy: c.y, color });
}

function buildPalette(palette, material) {
  const adapted = adaptMaterialToWebGL(material, parseWebGLColor(palette?.hide, [0.25, 0.11, 0.08, 1]));
  const hide = adapted.baseColor;
  const hideDark = adapted.shadowColor;
  const hideRim = adaptMaterialToWebGL(material, parseWebGLColor(palette?.hideRim, [0.78, 0.42, 0.22, 1])).highlightColor;
  return {
    hide,
    hideDark,
    hideRim: withAlpha(hideRim, 0.82),
    hideRimDim: withAlpha(hideRim, 0.42),
    tailRim: withAlpha(hideRim, 0.7),
    digitRim: withAlpha(hideRim, 0.58),
    wingMembrane: parseWebGLColor(palette?.wingMembrane, [0.14, 0.07, 0.055, 0.72]),
    eye: parseWebGLColor(palette?.eye, [1, 0.78, 0.32, 0.95])
  };
}

function buildAttackContactDebugRects(contact, palette) {
  if (!contact?.active || !contact.debugOnly || contact.debugVisible !== true) return [];
  const width = Math.max(4, contact.worldWidth ?? 0);
  const length = Math.max(4, contact.worldLength ?? width);
  return [{
    x: (contact.worldX ?? 0) - length / 2,
    y: (contact.worldY ?? 0) - width / 2,
    w: length,
    h: width,
    color: withAlpha(palette.eye, 0.18)
  }];
}

function applyBodyPose(byRole, bodyOffsets, forward, right, r) {
  if (!bodyOffsets) return byRole;
  return Object.fromEntries(Object.entries(byRole).map(([role, value]) => {
    const pose = bodyOffsets[role];
    if (!pose) return [role, value];
    return [role, {
      ...value,
      worldX: value.worldX + poseAmount(pose, 'right', r) * right.x + poseAmount(pose, 'forward', r) * forward.x,
      worldY: value.worldY + poseAmount(pose, 'right', r) * right.y + poseAmount(pose, 'forward', r) * forward.y
    }];
  }));
}

function poseAmount(pose, key, r) {
  return Number.isFinite(pose?.[key]) ? pose[key] * r : 0;
}

function sideName(side) {
  return side < 0 ? 'left' : 'right';
}

function point(value) {
  return { x: value.worldX, y: value.worldY };
}

function skeletalPoint(value) {
  return { x: value.worldX, y: value.worldY, width: value.worldWidth };
}

function offset(origin, right, rightAmount, forward, forwardAmount) {
  return {
    x: origin.x + right.x * rightAmount + forward.x * forwardAmount,
    y: origin.y + right.y * rightAmount + forward.y * forwardAmount
  };
}

function capDistance(origin, target, maxDistance) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const distance = Math.hypot(dx, dy) || 1;
  if (distance <= maxDistance) return target;
  return {
    x: origin.x + (dx / distance) * maxDistance,
    y: origin.y + (dy / distance) * maxDistance
  };
}

function angle(vector) {
  return Math.atan2(vector.y, vector.x);
}

function angleBetween(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}
