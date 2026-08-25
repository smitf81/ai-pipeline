import { buildFacingVectors, offset } from './creatureKinematics.js';
import { buildWyvernSkeletalPose } from './wyvernSkeletalPose.js';
import { interpolateWyvernRigShape, offsetWyvernRigShape, requireWyvernRigShape, WYVERN_RIG_SHAPE_CONTRACT } from './wyvernRigShape.js';

export function buildWyvernCreatureRigPose({ proceduralPose, recipe, projection, transform, radius, motionPhase, move }) {
  const profile = recipe.proportionProfile ?? {};
  const visualScale = profile.visual?.scale ?? 1.45;
  const visualRadius = radius * visualScale;
  const skeleton = buildWyvernSkeletalPose({
    pose: proceduralPose,
    recipe,
    projection,
    transform,
    radius: visualRadius,
    motionPhase,
    move
  });
  const wingForelimbs = buildWingForelimbs(skeleton.axial, proceduralPose, recipe.wingAnatomy, profile, skeleton.frames, visualRadius);
  const headFacing = buildFacingVectors(skeleton.frames.head.rotation + (proceduralPose.look?.headYaw ?? 0));
  const head = buildHeadRig(skeleton.axial.head, proceduralPose, profile, headFacing, visualRadius);
  const body = buildBodyRig(profile, visualRadius);
  const points = collectRigPoints(skeleton, wingForelimbs, head);
  return {
    classification: 'renderer_neutral_creature_rig_pose',
    solverId: profile.skeleton?.solverId ?? 'grounded_wyvern_skeletal_gait_solver_v0',
    profileId: profile.id ?? null,
    bodyPlan: recipe.bodyPlan,
    visualScale,
    shapeSpace: WYVERN_RIG_SHAPE_CONTRACT,
    axialFrames: skeleton.frames,
    axial: skeleton.axial,
    head,
    body,
    wingForelimbs,
    hindLegs: skeleton.hindLegs,
    tail: skeleton.tail,
    gaitContacts: { ...(proceduralPose.contactAnchors ?? {}) },
    sockets: cloneSockets(proceduralPose.sockets),
    visualBounds: buildVisualBounds(points, visualRadius * (profile.visual?.boundsPadding ?? 0.18)),
    constraintState: proceduralPose.constraintState ?? null
  };
}

function buildWingForelimbs(axial, pose, anatomy, profile, frames, r) {
  const chest = axial.chest;
  const hips = axial.hips;
  if (!chest || !anatomy) return {};
  const chestFacing = frames.chest;
  const hipFacing = frames.hips;
  const result = {};
  for (const side of [-1, 1]) {
    const name = sideName(side);
    const limbPose = pose.wingForelimbs?.[name] ?? {};
    const shoulderWidth = profile.forelimb?.shoulderAnchorWidth ?? anatomy.shoulderWidth;
    const shoulder = offset(chest, chestFacing.right, side * r * shoulderWidth + poseAmount(limbPose.shoulder, 'right', r), chestFacing.forward, r * anatomy.shoulderForward + poseAmount(limbPose.shoulder, 'forward', r));
    const elbow = offset(shoulder, chestFacing.right, side * r * anatomy.elbowPreferredOut + poseAmount(limbPose.elbow, 'right', r), chestFacing.forward, r * anatomy.elbowPreferredForward + poseAmount(limbPose.elbow, 'forward', r));
    const wristReach = profile.forelimb?.wristReach ?? anatomy.wristOut;
    const wrist = offset(shoulder, chestFacing.right, side * r * anatomy.wristOut + poseAmount(limbPose.wrist, 'right', r), chestFacing.forward, r * (anatomy.wristForward * wristReach / 1.46) + poseAmount(limbPose.wrist, 'forward', r));
    const membraneRoot = hips
      ? offset(hips, hipFacing.right, side * r * (anatomy.membraneHipOut ?? anatomy.membraneRootOut), hipFacing.forward, -r * (anatomy.membraneHipBack ?? 0))
      : offset(chest, chestFacing.right, side * r * anatomy.membraneRootOut, chestFacing.forward, -r * anatomy.membraneRootBack);
    const shoulderShape = requireWyvernRigShape(profile, 'shoulderHeight', 'shoulderDepth');
    const elbowShape = requireWyvernRigShape(profile, 'elbowHeight', 'elbowDepth');
    const wristShape = requireWyvernRigShape(profile, 'wristHeight', 'wristDepth');
    const membraneShape = requireWyvernRigShape(profile, 'membraneRootHeight', 'torsoDepth');
    result[name] = {
      classification: 'renderer_neutral_wing_forelimb_rig',
      side: name,
      shoulder: rigPoint(`${name}_wing_shoulder`, shoulder, r * anatomy.boneWidth, shoulderShape, limbPose.shoulder?.height),
      elbow: rigPoint(`${name}_wing_elbow`, elbow, r * anatomy.boneWidth, elbowShape, limbPose.elbow?.height),
      wrist: rigPoint(`${name}_wing_wrist`, wrist, r * anatomy.clawRadius, wristShape, limbPose.wrist?.height),
      membraneRoot: rigPoint(`${name}_wing_membrane_root`, membraneRoot, r * anatomy.boneWidth, membraneShape, pose.bodyOffsets.hips?.height),
      digits: buildWingDigits(wrist, chestFacing, side, r, anatomy, limbPose, profile, wristShape)
    };
  }
  return result;
}

function buildWingDigits(wrist, facing, side, r, anatomy, limbPose = {}, profile, wristShape) {
  const spread = Math.max(0, limbPose.digitSpread ?? 0);
  const trailRelax = Math.max(0, limbPose.digitTrailRelax ?? 0);
  const tipShape = requireWyvernRigShape(profile, 'digitTipHeight', 'digitDepth');
  return anatomy.digitLengths.map((lengthScale, index) => {
    const digitOut = (anatomy.digitOut[index] ?? 0) + spread * (anatomy.sweepDigitOutAdd?.[index] ?? 0);
    const digitBack = Math.max(0.1, (anatomy.digitBack[index] ?? 0) - trailRelax * (anatomy.sweepDigitBackRelax?.[index] ?? 0));
    const rawTip = offset(wrist, facing.right, side * r * digitOut, facing.forward, -r * digitBack);
    const tip = capDistance(wrist, rawTip, r * lengthScale);
    const knuckles = anatomy.digitKnuckleFractions.map((fraction, knuckleIndex) => rigPoint(
      `wing_digit_${index}_knuckle_${knuckleIndex}`,
      { x: wrist.x + (tip.x - wrist.x) * fraction, y: wrist.y + (tip.y - wrist.y) * fraction },
      r * anatomy.boneWidth * 0.36,
      interpolateWyvernRigShape(wristShape, tipShape, fraction),
      limbPose.wrist?.height
    ));
    return {
      role: `wing_digit_${index}`,
      tip: rigPoint(`wing_digit_${index}_tip`, tip, r * 0.045, tipShape, limbPose.wrist?.height),
      foldProfile: spread > 0 ? 'attack_sweep_digit_fan' : anatomy.foldedTrailBias ?? 'folded_wing_digit',
      digitSpread: spread,
      digitTrailRelax: trailRelax,
      knuckles
    };
  });
}

function buildHeadRig(headPoint, pose, profile, facing, r) {
  const head = profile.head ?? {};
  const jaw = profile.jaw ?? {};
  const origin = headPoint ?? { x: 0, y: 0 };
  const center = offset(origin, facing.right, 0, facing.forward, (head.snoutLength ?? 0.36) * r * 0.25);
  const muzzle = offset(center, facing.right, 0, facing.forward, (head.length ?? 0.74) * r * 0.42);
  const snoutTip = offset(muzzle, facing.right, 0, facing.forward, (jaw.length ?? 0.42) * r * 0.24);
  const jawTip = offset(center, facing.right, 0, facing.forward, (jaw.length ?? 0.42) * r * 0.7);
  const jawOpen = Math.max(0, Math.min(jaw.maxOpen ?? 0.56, pose.jawOpen ?? 0));
  const headShape = requireWyvernRigShape(profile, 'headHeight', 'headDepth');
  const muzzleShape = requireWyvernRigShape(profile, 'muzzleHeight', 'muzzleDepth');
  const jawShape = offsetWyvernRigShape(
    requireWyvernRigShape(profile, 'muzzleHeight', 'jawDepth'),
    -jawOpen * (jaw.openingSeparation ?? 0.11) * 0.32
  );
  return {
    classification: 'renderer_neutral_head_jaw_rig',
    center: rigPoint('head_center', center, (head.width ?? 0.46) * r, headShape),
    muzzle: rigPoint('head_muzzle', muzzle, (jaw.width ?? 0.23) * r, muzzleShape),
    snoutTip: rigPoint('head_snout_tip', snoutTip, (jaw.width ?? 0.23) * r * 0.72, offsetWyvernRigShape(muzzleShape, -0.01, 0.76)),
    jawHinge: rigPoint('jaw_hinge', center, (jaw.width ?? 0.23) * r * 0.82, jawShape),
    jawTip: rigPoint('jaw_tip', jawTip, (jaw.width ?? 0.23) * r * 0.68, jawShape),
    headLength: (head.length ?? 0.74) * r,
    headWidth: (head.width ?? 0.46) * r,
    jawLength: (jaw.length ?? 0.42) * r,
    jawWidth: (jaw.width ?? 0.23) * r,
    jawOpen,
    openingSeparation: (jaw.openingSeparation ?? 0.11) * r
  };
}

function buildBodyRig(profile, r) {
  return {
    classification: 'renderer_neutral_body_rig',
    neckWidth: (profile.neck?.width ?? 0.3) * r,
    shoulderWidth: (profile.shoulders?.width ?? 1.2) * r,
    chestWidth: (profile.shoulders?.chestWidth ?? 1.04) * r,
    chestLength: (profile.shoulders?.chestLength ?? 0.78) * r,
    torsoWidth: (profile.torso?.width ?? 0.76) * r,
    hipWidth: (profile.hips?.width ?? 0.86) * r,
    hipLength: (profile.hips?.length ?? 0.6) * r,
    haunchWidth: (profile.hips?.haunchWidth ?? 0.48) * r,
    haunchLength: (profile.hips?.haunchLength ?? 0.44) * r,
    hipAnchorBack: (profile.hips?.hipAnchorBack ?? 0.2) * r
  };
}

function collectRigPoints(skeleton, wings, head) {
  const points = [...Object.values(skeleton.axial ?? {}), ...(skeleton.tail ?? [])];
  for (const leg of Object.values(skeleton.hindLegs ?? {})) points.push(leg.hip, leg.knee, leg.ankle, leg.foot);
  for (const wing of Object.values(wings ?? {})) {
    points.push(wing.shoulder, wing.elbow, wing.wrist, wing.membraneRoot);
    for (const digit of wing.digits ?? []) points.push(digit.tip, ...(digit.knuckles ?? []));
  }
  if (head?.center) points.push(head.center, head.muzzle, head.snoutTip, head.jawHinge, head.jawTip);
  return points.filter(Boolean);
}

function buildVisualBounds(points, padding) {
  if (!points.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let minElevation = Infinity;
  let maxElevation = -Infinity;
  for (const point of points) {
    const width = point.width ?? 0;
    minX = Math.min(minX, point.x - width - padding);
    minY = Math.min(minY, point.y - width - padding);
    maxX = Math.max(maxX, point.x + width + padding);
    maxY = Math.max(maxY, point.y + width + padding);
    minElevation = Math.min(minElevation, Number(point.height) - Number(point.verticalRadius));
    maxElevation = Math.max(maxElevation, Number(point.height) + Number(point.verticalRadius));
  }
  return {
    classification: 'creature_visual_bounds',
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    minElevation,
    maxElevation,
    elevation: maxElevation - minElevation
  };
}

function rigPoint(role, point, width, shape, heightOffset = 0) {
  if (!Number.isFinite(shape?.height) || !Number.isFinite(shape?.verticalRadius)) throw new Error(`wyvern_rig_point_shape_required:${role}`);
  return {
    classification: 'renderer_neutral_rig_point',
    role,
    x: point.x,
    y: point.y,
    width,
    height: shape.height + (Number(heightOffset) || 0),
    verticalRadius: shape.verticalRadius
  };
}

function cloneSockets(sockets) {
  return Object.fromEntries(Object.entries(sockets ?? {}).map(([key, value]) => [key, { ...value }]));
}

function poseAmount(pose, key, r) {
  return Number.isFinite(pose?.[key]) ? pose[key] * r : 0;
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

function sideName(side) {
  return side < 0 ? 'left' : 'right';
}
