import { buildFacingVectors, offset } from './creatureKinematics.js';
import { buildWyvernSkeletalPose } from './wyvernSkeletalPose.js';

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
  const facing = buildFacingVectors(transform.rotation ?? 0);
  const wingForelimbs = buildWingForelimbs(skeleton.axial, proceduralPose, recipe.wingAnatomy, profile, facing, visualRadius);
  const head = buildHeadRig(skeleton.axial.head, proceduralPose, profile, facing, visualRadius);
  const body = buildBodyRig(profile, visualRadius);
  const points = collectRigPoints(skeleton, wingForelimbs, head);
  return {
    classification: 'renderer_neutral_creature_rig_pose',
    solverId: profile.skeleton?.solverId ?? 'grounded_wyvern_skeletal_gait_solver_v0',
    profileId: profile.id ?? null,
    bodyPlan: recipe.bodyPlan,
    visualScale,
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

function buildWingForelimbs(axial, pose, anatomy, profile, facing, r) {
  const chest = axial.chest;
  const hips = axial.hips;
  if (!chest || !anatomy) return {};
  const result = {};
  for (const side of [-1, 1]) {
    const name = sideName(side);
    const limbPose = pose.wingForelimbs?.[name] ?? {};
    const shoulderWidth = profile.forelimb?.shoulderAnchorWidth ?? anatomy.shoulderWidth;
    const shoulder = offset(chest, facing.right, side * r * shoulderWidth + poseAmount(limbPose.shoulder, 'right', r), facing.forward, r * anatomy.shoulderForward + poseAmount(limbPose.shoulder, 'forward', r));
    const elbow = offset(shoulder, facing.right, side * r * anatomy.elbowPreferredOut + poseAmount(limbPose.elbow, 'right', r), facing.forward, r * anatomy.elbowPreferredForward + poseAmount(limbPose.elbow, 'forward', r));
    const wristReach = profile.forelimb?.wristReach ?? anatomy.wristOut;
    const wrist = offset(shoulder, facing.right, side * r * anatomy.wristOut + poseAmount(limbPose.wrist, 'right', r), facing.forward, r * (anatomy.wristForward * wristReach / 1.46) + poseAmount(limbPose.wrist, 'forward', r));
    const membraneRoot = hips
      ? offset(hips, facing.right, side * r * (anatomy.membraneHipOut ?? anatomy.membraneRootOut), facing.forward, -r * (anatomy.membraneHipBack ?? 0))
      : offset(chest, facing.right, side * r * anatomy.membraneRootOut, facing.forward, -r * anatomy.membraneRootBack);
    result[name] = {
      classification: 'renderer_neutral_wing_forelimb_rig',
      side: name,
      shoulder: rigPoint(`${name}_wing_shoulder`, shoulder, r * anatomy.boneWidth),
      elbow: rigPoint(`${name}_wing_elbow`, elbow, r * anatomy.boneWidth),
      wrist: rigPoint(`${name}_wing_wrist`, wrist, r * anatomy.clawRadius),
      membraneRoot: rigPoint(`${name}_wing_membrane_root`, membraneRoot, r * anatomy.boneWidth),
      digits: buildWingDigits(wrist, facing, side, r, anatomy, limbPose)
    };
  }
  return result;
}

function buildWingDigits(wrist, facing, side, r, anatomy, limbPose = {}) {
  const spread = Math.max(0, limbPose.digitSpread ?? 0);
  const trailRelax = Math.max(0, limbPose.digitTrailRelax ?? 0);
  return anatomy.digitLengths.map((lengthScale, index) => {
    const digitOut = (anatomy.digitOut[index] ?? 0) + spread * (anatomy.sweepDigitOutAdd?.[index] ?? 0);
    const digitBack = Math.max(0.1, (anatomy.digitBack[index] ?? 0) - trailRelax * (anatomy.sweepDigitBackRelax?.[index] ?? 0));
    const rawTip = offset(wrist, facing.right, side * r * digitOut, facing.forward, -r * digitBack);
    const tip = capDistance(wrist, rawTip, r * lengthScale);
    const knuckles = anatomy.digitKnuckleFractions.map((fraction, knuckleIndex) => rigPoint(
      `wing_digit_${index}_knuckle_${knuckleIndex}`,
      { x: wrist.x + (tip.x - wrist.x) * fraction, y: wrist.y + (tip.y - wrist.y) * fraction },
      r * anatomy.boneWidth * 0.36
    ));
    return {
      role: `wing_digit_${index}`,
      tip: rigPoint(`wing_digit_${index}_tip`, tip, r * 0.045),
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
  const jawOpen = Math.max(0, Math.min(jaw.maxOpen ?? 0.56, pose.jawOpen ?? 0));
  return {
    classification: 'renderer_neutral_head_jaw_rig',
    center: rigPoint('head_center', center, (head.width ?? 0.46) * r),
    muzzle: rigPoint('head_muzzle', muzzle, (jaw.width ?? 0.23) * r),
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
  if (head?.center) points.push(head.center, head.muzzle);
  return points.filter(Boolean);
}

function buildVisualBounds(points, padding) {
  if (!points.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    const width = point.width ?? 0;
    minX = Math.min(minX, point.x - width - padding);
    minY = Math.min(minY, point.y - width - padding);
    maxX = Math.max(maxX, point.x + width + padding);
    maxY = Math.max(maxY, point.y + width + padding);
  }
  return {
    classification: 'creature_visual_bounds',
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

function rigPoint(role, point, width) {
  return { classification: 'renderer_neutral_rig_point', role, x: point.x, y: point.y, width };
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
