import { buildFacingVectors, indexByRole, offset } from './creatureKinematics.js';

export function buildWyvernSkeletalPose({ pose, recipe, projection, transform, radius, motionPhase, move }) {
  const profile = recipe.proportionProfile ?? {};
  const facing = buildFacingVectors(transform.rotation ?? 0);
  const points = indexByRole(projection.bodyPoints ?? []);
  const axial = {};
  for (const role of ['head', 'neck', 'chest', 'hips']) {
    const source = points[role] ?? { x: transform.x, y: transform.y };
    axial[role] = makeSkeletalPoint(role, applyBodyOffset(source, pose.bodyOffsets[role], facing, radius), radius * axialWidth(role, profile));
  }

  const tail = buildTailSkeleton(axial.hips, pose, profile, facing, radius, motionPhase, move);
  const hindLegs = buildHindLegSkeleton(axial.hips, pose, profile, facing, radius);
  return {
    classification: 'renderer_neutral_wyvern_skeletal_pose',
    solverId: profile.skeleton?.solverId ?? 'grounded_wyvern_skeletal_gait_solver_v0',
    profileId: profile.id ?? null,
    gaitContactPolicy: profile.skeleton?.gaitContactPolicy ?? 'diagonal_wrist_hind_foot_contacts_v0',
    axial,
    tail,
    hindLegs
  };
}

function buildTailSkeleton(hips, pose, profile, facing, radius, motionPhase, move) {
  const tail = profile.tail ?? {};
  const roles = tailRoles(profile);
  const rawLengths = tail.boneLengths ?? [0.42, 0.62, 0.72, 0.66, 0.54, 0.42];
  const lengthScale = (tail.length ?? sum(rawLengths)) / Math.max(0.001, sum(rawLengths));
  const lengths = rawLengths.map((value) => value * lengthScale);
  const rawWidths = tail.taper ?? [0.72, 0.62, 0.5, 0.36, 0.24, 0.14];
  const widthScale = (tail.baseWidth ?? rawWidths[0] ?? 0.72) / Math.max(0.001, rawWidths[0] ?? 0.72);
  const widths = rawWidths.map((value) => value * widthScale);
  const wave = tail.gaitFollowThrough ?? profile.gait?.tailWave ?? 0.18;
  const firstOffset = pose.bodyOffsets.tailBase ?? zeroOffset();
  const root = offset(
    hips,
    facing.right,
    firstOffset.right * radius,
    facing.forward,
    (-(tail.baseAnchorBack ?? 0.26) + firstOffset.forward * 0.45) * radius
  );
  const points = [makeSkeletalPoint(roles[0], root, widths[0] * radius * (tail.renderWidthScale ?? 1), 'tail_root')];
  let anchor = root;
  for (let i = 1; i < roles.length; i += 1) {
    const local = pose.bodyOffsets[tailOffsetRole(i)] ?? zeroOffset();
    const followThrough = Math.sin(motionPhase - i * 0.62) * wave * move * (i / Math.max(1, roles.length - 1));
    const next = offset(
      anchor,
      facing.right,
      (local.right * 0.55 + followThrough) * radius,
      facing.forward,
      (-(lengths[i] ?? lengths.at(-1) ?? 0.44) + local.forward * 0.62) * radius
    );
    points.push(makeSkeletalPoint(roles[i], next, (widths[i] ?? widths.at(-1) ?? 0.16) * radius * (tail.renderWidthScale ?? 1), 'tail_bone'));
    anchor = next;
  }
  return points;
}

function buildHindLegSkeleton(hips, pose, profile, facing, radius) {
  const hind = profile.hindLeg ?? {};
  const result = {};
  for (const side of [-1, 1]) {
    const name = sideName(side);
    const legPose = pose.hindLegs[name] ?? limbOffsets();
    const anchor = pose.contactAnchors[`${name}HindFoot`];
    const planted = anchor?.phase === 'plant' || (anchor?.weight ?? 0) > 0.72;
    const hip = offset(hips, facing.right, side * (hind.hipWidth ?? 0.48) * radius, facing.forward, -(hind.hipBack ?? 0.16) * radius);
    const knee = offset(
      hip,
      facing.right,
      side * (hind.kneeOut ?? 0.38) * radius + legPose.knee.right * radius,
      facing.forward,
      (-(hind.kneeBack ?? 0.3) + legPose.knee.forward) * radius
    );
    const ankle = offset(
      hip,
      facing.right,
      side * (hind.ankleOut ?? 0.7) * radius + legPose.ankle.right * radius,
      facing.forward,
      (-(hind.footBack ?? 0.72) + legPose.ankle.forward - (planted ? 0.04 : 0)) * radius
    );
    const foot = offset(
      ankle,
      facing.right,
      side * (hind.clawSpread ?? 0.12) * radius * (planted ? 1 : 0.55),
      facing.forward,
      -(hind.footLength ?? 0.38) * radius * 0.32
    );
    result[name] = {
      classification: 'renderer_neutral_hind_leg_skeleton',
      side: name,
      contactPhase: anchor?.phase ?? 'unknown',
      contactWeight: anchor?.weight ?? 0,
      planted,
      hip: makeSkeletalPoint(`${name}_hind_hip`, hip, (hind.thighGirth ?? 0.24) * radius),
      knee: makeSkeletalPoint(`${name}_hind_knee`, knee, (hind.thighGirth ?? 0.24) * radius * 0.82),
      ankle: makeSkeletalPoint(`${name}_hind_ankle`, ankle, (hind.shinGirth ?? 0.18) * radius),
      foot: makeSkeletalPoint(`${name}_hind_foot`, foot, (hind.footRadius ?? 0.18) * radius)
    };
  }
  return result;
}

function applyBodyOffset(source, local, facing, radius) {
  const pose = local ?? zeroOffset();
  return offset(source, facing.right, pose.right * radius, facing.forward, pose.forward * radius);
}

function makeSkeletalPoint(role, point, width, phase = null) {
  return {
    classification: 'renderer_neutral_skeletal_point',
    role,
    x: point.x,
    y: point.y,
    width,
    phase
  };
}

function axialWidth(role, profile) {
  if (role === 'head') return profile.head?.width ?? 0.44;
  if (role === 'neck') return profile.neck?.width ?? 0.3;
  if (role === 'chest') return profile.shoulders?.chestWidth ?? 0.92;
  if (role === 'hips') return profile.hips?.width ?? 0.8;
  return 0.3;
}

function tailRoles(profile) {
  return profile.skeleton?.tailBoneRoles ?? ['tailRoot', 'tailBase', 'tailProximal', 'tailMid', 'tailDistal', 'tailTip'];
}

function tailOffsetRole(index) {
  if (index <= 1) return 'tailBase';
  if (index <= 3) return 'tailMid';
  return 'tailTip';
}

function limbOffsets() {
  return { knee: zeroOffset(), ankle: zeroOffset() };
}

function zeroOffset() {
  return { forward: 0, right: 0 };
}

function sideName(side) {
  return side < 0 ? 'left' : 'right';
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}
