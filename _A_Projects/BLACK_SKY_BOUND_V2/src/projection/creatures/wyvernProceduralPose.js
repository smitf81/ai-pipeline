import { buildFacingVectors, indexByRole, offset } from './creatureKinematics.js';
import {
  getWyvernActionPhaseLabel,
  getWyvernActionProfile,
  getWyvernMotionProfile,
  WyvernMotionId
} from '../../data/creatures/groundedWyvernMotionProfiles.js';
import { getImpactReactionProfile } from '../../data/impactReactionProfiles.js';
import { buildImpactPoseState } from '../../systems/impactResponseState.js';
import { applyWyvernOpeningPose } from './wyvernOpeningPose.js';
import { applyWyvernSmokeAwakeningPose } from './wyvernSmokeAwakeningPose.js';
import { applyWyvernDirectionalGaitPose } from './wyvernDirectionalGaitPose.js';

const TAU = Math.PI * 2;
const POSE_BUCKETS = 16;

export function buildWyvernProceduralPose({ recipe, projection, transform, radius, motionState, actionState, impactResponse, limbRig, opening = null, smokeAwakening = null }) {
  const motionId = motionState?.locomotionId ?? (projection.movement01 > 0.08 ? WyvernMotionId.CRAWL : WyvernMotionId.IDLE);
  const motionProfile = getWyvernMotionProfile(motionId);
  const visualActionState = resolveVisualActionState(actionState);
  const actionProfile = visualActionState ? getWyvernActionProfile(visualActionState.actionId) : null;
  const motionPhase = motionState?.phase ?? (motionId === WyvernMotionId.CRAWL ? projection.gaitPhase : projection.idlePhase);
  const motionPhase01 = wrap01(motionPhase / TAU);
  const actionPhase = actionProfile ? clamp01(visualActionState.phase) : 0;
  const move = clamp01(motionState?.movement01 ?? projection.movement01 ?? 0);
  const pose = createBasePose({
    solverId: 'wyvern_procedural_pose_v0',
    rigId: limbRig?.rigId ?? `${projection.recipeId}:grounded_wyvern_limb_rig_v0`,
    proportionProfileId: recipe.proportionProfile?.id ?? null,
    motionId,
    actionId: actionProfile?.id ?? null,
    motionPhase: motionPhase01,
    motionPhaseLabel: motionLabel(motionProfile, motionPhase01),
    actionPhase,
    actionPhaseLabel: actionProfile ? getWyvernActionPhaseLabel(actionProfile, actionPhase) : 'none',
    phaseBucket: phaseBucket(motionPhase01),
    actionPhaseBucket: actionProfile ? phaseBucket(actionPhase) : 0,
    movement01: move
  });
  pose.actionStateKind = actionState?.active
    ? 'active'
    : (actionState?.recovering
        ? (actionState.recoveryKind === 'dodge_interruption' ? 'interrupted_recovery' : 'visual_recovery')
        : 'none');
  pose.actionRecovery01 = actionState?.recovering ? clamp01(actionState.recoveryProgress) : 0;

  applyWyvernDirectionalGaitPose(pose, motionProfile, recipe.proportionProfile, motionPhase, move, motionState, !!actionProfile);
  if (actionProfile) applyActionPose(pose, actionProfile, visualActionState);
  const impactState = buildImpactPoseState(impactResponse, transform.rotation ?? 0);
  if (impactState) applyImpactPose(pose, impactState);
  pose.impactState = impactState;
  applyRearCounterbalance(pose, recipe.proportionProfile, move);
  applyWyvernOpeningPose(pose, opening);
  applyWyvernSmokeAwakeningPose(pose, smokeAwakening);
  applyPoseConstraints(pose, recipe.proportionProfile);
  pose.sockets = buildPoseSockets(pose, recipe, projection, transform, radius);
  pose.attackContact = actionProfile && actionState?.active
    ? buildAttackContact(pose, actionProfile, actionState, projection, transform, radius)
    : null;
  pose.cacheKey = [
    pose.rigId,
    pose.motionId,
    pose.phaseBucket,
    pose.actionId ?? 'no_action',
    pose.actionPhaseBucket,
    visualActionState?.side ?? 1,
    pose.actionStateKind,
    pose.openingState?.phase ?? 'no_opening',
    pose.openingState?.progressBucket ?? 0,
    pose.smokeAwakeningState?.phase ?? 'no_smoke_instinct',
    pose.smokeAwakeningState?.progressBucket ?? 0
  ].join(':');
  return pose;
}

function resolveVisualActionState(actionState) {
  if (actionState?.active && actionState.actionId) return actionState;
  if (!actionState?.recovering || !actionState.recoveryActionId) return null;
  return {
    ...actionState,
    active: false,
    actionId: actionState.recoveryActionId,
    phase: actionState.recoveryPhase,
    phaseLabel: 'visual_recovery',
    visualOnly: true
  };
}

function applyImpactPose(pose, impactState) {
  const profile = getImpactReactionProfile(impactState.profileId);
  const amplitude = impactState.recoil01 * Math.min(1.35, 0.5 + impactState.impulse * 0.72 + impactState.stagger * 0.28);
  const forward = impactState.localForward * amplitude;
  const right = impactState.localRight * amplitude;
  pose.bodyOffsets.head.forward += forward * profile.headPush;
  pose.bodyOffsets.head.right += right * (profile.headPush + profile.lateralRoll * 0.45);
  pose.bodyOffsets.neck.forward += forward * profile.chestPush;
  pose.bodyOffsets.neck.right += right * (profile.chestPush + profile.lateralRoll * 0.3);
  pose.bodyOffsets.chest.forward += forward * profile.chestPush;
  pose.bodyOffsets.chest.right += right * (profile.chestPush + profile.lateralRoll);
  pose.bodyOffsets.hips.forward += forward * profile.hipPush;
  pose.bodyOffsets.hips.right += right * profile.hipPush;
  pose.bodyOffsets.tailBase.right -= right * profile.tailCounter * 0.35;
  pose.bodyOffsets.tailMid.right -= right * profile.tailCounter * 0.68;
  pose.bodyOffsets.tailTip.right -= right * profile.tailCounter;
  for (const name of ['left', 'right']) {
    pose.wingForelimbs[name].wrist.forward -= forward * profile.centerPush * 0.35;
    pose.hindLegs[name].ankle.forward -= forward * profile.centerPush * 0.22;
  }
}

export function phaseBucket(phase01, buckets = POSE_BUCKETS) {
  return Math.max(0, Math.min(buckets - 1, Math.floor(wrap01(phase01) * buckets)));
}

function createBasePose(seed) {
  return {
    classification: 'procedural_pose_output',
    solverId: seed.solverId,
    rigId: seed.rigId,
    cachePolicy: 'v0_live_solve_v1_phase_bucket_cache',
    cacheKey: null,
    motionId: seed.motionId,
    actionId: seed.actionId,
    motionPhase: seed.motionPhase,
    motionPhaseLabel: seed.motionPhaseLabel,
    actionPhase: seed.actionPhase,
    actionPhaseLabel: seed.actionPhaseLabel,
    phaseBucket: seed.phaseBucket,
    actionPhaseBucket: seed.actionPhaseBucket,
    movement01: seed.movement01,
    proportionProfileId: seed.proportionProfileId,
    constraintState: null,
    bodyOffsets: {
      head: zeroOffset(),
      neck: zeroOffset(),
      chest: zeroOffset(),
      hips: zeroOffset(),
      tailBase: zeroOffset(),
      tailMid: zeroOffset(),
      tailTip: zeroOffset()
    },
    wingForelimbs: {
      left: limbOffsets(),
      right: limbOffsets()
    },
    hindLegs: {
      left: limbOffsets(),
      right: limbOffsets()
    },
    contactAnchors: {},
    sockets: {},
    attackContact: null,
    impactState: null,
    elevationMeters: 0,
    look: { headYaw: 0, neckYaw: 0 },
    jawOpen: 0
  };
}

function applyRearCounterbalance(pose, profile, move) {
  const tail = profile?.tail;
  const hips = profile?.hips;
  if (!tail && !hips) return;
  const tailReach = tail?.counterReach ?? 0.2;
  const lag = tail?.counterbalanceLag ?? 0.38;
  const frontDrive = Math.max(0, pose.bodyOffsets.head.forward)
    + Math.max(0, pose.bodyOffsets.neck.forward) * 0.72
    + Math.max(0, pose.bodyOffsets.chest.forward) * 0.48;
  const lateralDrive = pose.bodyOffsets.chest.right
    + pose.bodyOffsets.neck.right * 0.44
    + pose.bodyOffsets.head.right * 0.28;
  pose.bodyOffsets.hips.forward -= (hips?.supportOffset ?? 0.18) * (0.08 + move * 0.12 + frontDrive * 0.16);
  pose.bodyOffsets.tailBase.forward -= tailReach * (frontDrive * 0.24 + move * 0.08);
  pose.bodyOffsets.tailMid.forward -= tailReach * (frontDrive * 0.44 + move * 0.14);
  pose.bodyOffsets.tailTip.forward -= tailReach * (frontDrive * 0.68 + move * 0.22);
  pose.bodyOffsets.tailBase.right -= lateralDrive * lag * 0.35;
  pose.bodyOffsets.tailMid.right -= lateralDrive * lag * 0.62;
  pose.bodyOffsets.tailTip.right -= lateralDrive * lag * 0.86;
}

function applyActionPose(pose, profile, actionState) {
  if (profile.actionFamily === 'bite') {
    const strike = strikeCurve(actionState.phase, profile.hitTiming);
    const brace = smooth01(Math.min(1, actionState.phase / 0.32));
    const drive = smoothstep(0.16, 0.58, actionState.phase) * (1 - smoothstep(0.78, 1, actionState.phase));
    const coil = smoothstep(0.02, 0.2, actionState.phase) * (1 - smoothstep(0.24, 0.46, actionState.phase));
    pose.bodyOffsets.head.forward += profile.poseOffsets.headForward * strike;
    pose.bodyOffsets.neck.forward += profile.poseOffsets.neckForward * strike;
    pose.bodyOffsets.chest.forward += (profile.poseOffsets.chestForward ?? 0) * drive;
    pose.bodyOffsets.chest.forward -= (profile.poseOffsets.chestCoilBack ?? profile.poseOffsets.chestBack ?? 0) * coil;
    pose.jawOpen += profile.poseOffsets.jawOpen * strike;
    for (const name of ['left', 'right']) {
      const side = name === 'left' ? -1 : 1;
      pose.wingForelimbs[name].wrist.right += side * profile.poseOffsets.wristBraceOut * brace;
      pose.wingForelimbs[name].wrist.forward -= (profile.poseOffsets.wristBraceBack ?? 0.045) * brace;
      pose.contactAnchors[`${name}Wrist`].phase = 'brace';
      pose.contactAnchors[`${name}Wrist`].weight = 1;
    }
    return;
  }

  if (profile.actionFamily === 'claw_swipe') {
    const side = actionState.side < 0 ? -1 : 1;
    const primary = sideName(side);
    const opposite = sideName(-side);
    const sweep = Math.sin(Math.PI * clamp01(actionState.phase));
    const cross = smoothstep(0.14, 0.72, actionState.phase) * (1 - smoothstep(0.9, 1, actionState.phase));
    const followThrough = smoothstep(0.58, 0.86, actionState.phase) * (1 - smoothstep(0.96, 1, actionState.phase));
    const digitFan = cross * (1 - smoothstep(0.84, 1, actionState.phase));
    pose.wingForelimbs[primary].wrist.forward += profile.poseOffsets.wristForward * sweep;
    pose.wingForelimbs[primary].wrist.right -= side * profile.poseOffsets.wristAcross * (cross + followThrough * 0.18);
    pose.wingForelimbs[primary].elbow.forward += profile.poseOffsets.elbowForward * sweep;
    pose.wingForelimbs[primary].elbow.right -= side * profile.poseOffsets.wristAcross * 0.42 * cross;
    pose.wingForelimbs[primary].digitSpread += (profile.poseOffsets.digitSpread ?? 0) * digitFan;
    pose.wingForelimbs[primary].digitTrailRelax += (profile.poseOffsets.digitTrailRelax ?? 0) * digitFan;
    pose.wingForelimbs[opposite].wrist.forward -= profile.poseOffsets.oppositeBrace * sweep;
    pose.wingForelimbs[opposite].wrist.right += side * profile.poseOffsets.oppositeBrace * 0.5 * sweep;
    pose.bodyOffsets.chest.right += side * profile.poseOffsets.counterSway * sweep;
    pose.bodyOffsets.neck.right += side * profile.poseOffsets.counterSway * 0.52 * sweep;
    pose.bodyOffsets.head.right += side * profile.poseOffsets.counterSway * 0.36 * sweep;
    pose.contactAnchors[`${primary}Wrist`].phase = 'sweep';
    pose.contactAnchors[`${primary}Wrist`].weight = 0.35;
    pose.contactAnchors[`${opposite}Wrist`].phase = 'brace';
    pose.contactAnchors[`${opposite}Wrist`].weight = 1;
    return;
  }

  if (profile.actionFamily === 'smoke_spit') {
    const emit = smoothstep(0.18, 0.56, actionState.phase) * (1 - smoothstep(0.78, 1, actionState.phase));
    const brace = smooth01(Math.min(1, actionState.phase / 0.32));
    pose.bodyOffsets.head.forward += profile.poseOffsets.headForward * emit;
    pose.bodyOffsets.neck.forward += profile.poseOffsets.neckForward * emit;
    pose.bodyOffsets.chest.forward -= profile.poseOffsets.chestBack * brace;
    pose.jawOpen += profile.poseOffsets.jawOpen * emit;
    for (const name of ['left', 'right']) {
      const side = name === 'left' ? -1 : 1;
      pose.wingForelimbs[name].wrist.right += side * profile.poseOffsets.wristBraceOut * brace;
      pose.wingForelimbs[name].wrist.forward -= 0.035 * brace;
      pose.contactAnchors[`${name}Wrist`].phase = 'brace';
      pose.contactAnchors[`${name}Wrist`].weight = 1;
    }
    return;
  }

  if (profile.actionFamily === 'smoke_burst') {
    const compress = smoothstep(0.02, 0.3, actionState.phase) * (1 - smoothstep(0.42, 0.72, actionState.phase));
    const exhale = smoothstep(0.28, 0.52, actionState.phase) * (1 - smoothstep(0.78, 1, actionState.phase));
    pose.bodyOffsets.head.forward -= profile.poseOffsets.headBack * compress;
    pose.bodyOffsets.neck.forward -= profile.poseOffsets.neckBack * compress;
    pose.bodyOffsets.chest.forward -= profile.poseOffsets.chestCompression * compress;
    pose.jawOpen += profile.poseOffsets.jawOpen * exhale;
    for (const name of ['left', 'right']) {
      const side = name === 'left' ? -1 : 1;
      pose.wingForelimbs[name].wrist.right += side * profile.poseOffsets.wristBraceOut * (compress + exhale * 0.45);
      pose.wingForelimbs[name].wrist.forward -= 0.06 * compress;
      pose.contactAnchors[`${name}Wrist`].phase = 'wide_brace';
      pose.contactAnchors[`${name}Wrist`].weight = 1;
    }
    pose.bodyOffsets.tailTip.right += Math.sin(actionState.phase * Math.PI * 3) * 0.045 * exhale;
    return;
  }

  if (profile.actionFamily === 'lunge_attack') {
    const drive = smoothstep(0.08, 0.54, actionState.phase) * (1 - smoothstep(0.74, 1, actionState.phase));
    pose.bodyOffsets.head.forward += profile.poseOffsets.headForward * drive;
    pose.bodyOffsets.neck.forward += profile.poseOffsets.neckForward * drive;
    pose.bodyOffsets.chest.forward += profile.poseOffsets.chestForward * drive;
    for (const name of ['left', 'right']) {
      pose.wingForelimbs[name].wrist.forward -= profile.poseOffsets.wristBraceBack * drive;
      pose.hindLegs[name].ankle.forward -= profile.poseOffsets.hindPush * drive;
      pose.contactAnchors[`${name}Wrist`].phase = 'brace';
      pose.contactAnchors[`${name}Wrist`].weight = 1;
    }
    return;
  }

  if (profile.actionFamily === 'pounce_counter') {
    const plant = smoothstep(0, 0.14, actionState.phase) * (1 - smoothstep(0.2, 0.3, actionState.phase));
    const flight = smoothstep(0.16, 0.32, actionState.phase) * (1 - smoothstep(0.66, 0.78, actionState.phase));
    const landing = smoothstep(0.66, 0.72, actionState.phase) * (1 - smoothstep(0.84, 1, actionState.phase));
    const flightPhase = clamp01((actionState.phase - 0.2) / 0.48);
    const elevation = profile.poseOffsets.apexHeightMeters * Math.sin(Math.PI * flightPhase) - profile.poseOffsets.landingCompressionMeters * landing;
    pose.elevationMeters = elevation;
    for (const role of ['head', 'neck', 'chest', 'hips', 'tailBase', 'tailMid', 'tailTip']) pose.bodyOffsets[role].height += elevation;
    pose.bodyOffsets.head.forward -= profile.poseOffsets.plantCompression * 0.38 * plant;
    pose.bodyOffsets.neck.forward -= profile.poseOffsets.plantCompression * 0.62 * plant;
    pose.bodyOffsets.chest.forward -= profile.poseOffsets.plantCompression * plant;
    pose.bodyOffsets.hips.forward += profile.poseOffsets.plantCompression * 0.46 * plant;
    pose.bodyOffsets.head.forward += profile.poseOffsets.headForward * flight;
    pose.bodyOffsets.neck.forward += profile.poseOffsets.neckForward * flight;
    pose.bodyOffsets.chest.forward += profile.poseOffsets.chestForward * flight;
    pose.bodyOffsets.tailBase.forward -= profile.poseOffsets.tailCounter * flight * 0.35;
    pose.bodyOffsets.tailMid.forward -= profile.poseOffsets.tailCounter * flight * 0.68;
    pose.bodyOffsets.tailTip.forward -= profile.poseOffsets.tailCounter * flight;
    for (const name of ['left', 'right']) {
      const side = name === 'left' ? -1 : 1;
      pose.wingForelimbs[name].shoulder.height += elevation;
      pose.wingForelimbs[name].elbow.height += elevation * 0.9;
      pose.wingForelimbs[name].wrist.height += Math.max(0, elevation) * 0.68;
      pose.hindLegs[name].knee.height += elevation;
      pose.hindLegs[name].ankle.height += Math.max(0, elevation) * 0.42;
      pose.wingForelimbs[name].wrist.right += side * profile.poseOffsets.wristPlantOut * (plant + landing);
      pose.wingForelimbs[name].wrist.forward -= profile.poseOffsets.wristBraceBack * (plant + flight * 0.72);
      pose.wingForelimbs[name].digitSpread += profile.poseOffsets.digitFlare * flight;
      pose.hindLegs[name].ankle.forward += profile.poseOffsets.hindCompression * plant;
      pose.hindLegs[name].ankle.forward -= profile.poseOffsets.hindPush * flight;
      pose.contactAnchors[`${name}Wrist`].phase = landing > flight ? 'wide_land' : (plant > flight ? 'plant' : 'tucked');
      pose.contactAnchors[`${name}Wrist`].weight = landing > 0.2 ? 1 : (flight > 0.2 ? 0.12 : 1);
      pose.contactAnchors[`${name}HindFoot`].phase = landing > flight ? 'wide_land' : (plant > flight ? 'coil' : 'launch');
      pose.contactAnchors[`${name}HindFoot`].weight = landing > 0.2 ? 1 : (flight > 0.2 ? 0.08 : 1);
    }
  }
}

function buildPoseSockets(pose, recipe, projection, transform, radius) {
  const points = indexByRole(projection.bodyPoints ?? []);
  const facing = buildFacingVectors((transform.rotation ?? 0) + (pose.look?.headYaw ?? 0));
  const head = points.head ?? { x: transform.x, y: transform.y };
  const headOffset = pose.bodyOffsets.head ?? zeroOffset();
  const profile = recipe.proportionProfile;
  const headLength = profile?.head?.length ?? recipe.proportions.head ?? 0.56;
  const snout = profile?.head?.snoutLength ?? recipe.proportions.snout ?? 0.4;
  const socketForward = profile?.head?.socketForward ?? 0.58;
  const jawOpen = Math.min(pose.jawOpen ?? 0, profile?.jaw?.maxOpen ?? 0.72);
  const mouthForward = headLength * socketForward + snout * 0.42 + headOffset.forward + jawOpen * 0.045;
  const mouth = offset(head, facing.right, headOffset.right * radius, facing.forward, mouthForward * radius);
  return {
    mouth: {
      x: mouth.x,
      y: mouth.y,
      forward: facing.forward,
      right: facing.right,
      role: 'mouth_socket',
      classification: 'projection_socket'
    }
  };
}

function applyPoseConstraints(pose, profile) {
  const limits = profile?.constraints ?? {};
  const openingScale = pose.openingState ? 2.45 - (pose.openingState.settle01 ?? 0) * 1.2 : 1;
  const neckHeadScale = pose.openingState ? 1.18 : 1;
  const before = {
    headForward: pose.bodyOffsets.head.forward,
    neckForward: pose.bodyOffsets.neck.forward,
    jawOpen: pose.jawOpen,
    hipsForward: pose.bodyOffsets.hips.forward,
    tailTipForward: pose.bodyOffsets.tailTip.forward,
    tailTipRight: pose.bodyOffsets.tailTip.right,
    leftWristForward: pose.wingForelimbs.left.wrist.forward,
    rightWristForward: pose.wingForelimbs.right.wrist.forward,
    leftAnkleForward: pose.hindLegs.left.ankle.forward,
    rightAnkleForward: pose.hindLegs.right.ankle.forward
  };

  clampOffset(pose.bodyOffsets.head, (limits.maxHeadForward ?? 0.48) * openingScale, (limits.maxHeadLateral ?? 0.16) * openingScale);
  clampOffset(pose.bodyOffsets.neck, (limits.maxNeckForward ?? 0.3) * openingScale, (limits.maxNeckLateral ?? 0.16) * openingScale);
  clampOffset(pose.bodyOffsets.chest, (limits.maxChestForward ?? 0.22) * openingScale, (limits.maxChestLateral ?? 0.12) * openingScale);
  clampOffset(pose.bodyOffsets.hips, (limits.maxHipForward ?? 0.12) * openingScale, (limits.maxHipLateral ?? 0.1) * openingScale);
  clampOffset(pose.bodyOffsets.tailBase, (limits.maxTailForward ?? 0.24) * 0.55 * openingScale, (limits.maxTailBend ?? 0.24) * openingScale);
  clampOffset(pose.bodyOffsets.tailMid, (limits.maxTailForward ?? 0.24) * 0.78 * openingScale, (limits.maxTailBend ?? 0.24) * 1.45 * openingScale);
  clampOffset(pose.bodyOffsets.tailTip, (limits.maxTailForward ?? 0.24) * openingScale, (limits.maxTailBend ?? 0.24) * 1.9 * openingScale);

  pose.jawOpen = clamp(pose.jawOpen, 0, limits.maxJawOpen ?? profile?.jaw?.maxOpen ?? 0.68);
  preserveNeckHeadMass(pose, (limits.maxNeckHeadSeparation ?? 0.22) * neckHeadScale);

  for (const name of ['left', 'right']) {
    const forelimb = pose.wingForelimbs[name];
    clampOffset(forelimb.elbow, (limits.maxElbowForward ?? 0.28) * openingScale, (limits.maxElbowLateral ?? 0.34) * openingScale);
    clampOffset(forelimb.wrist, (limits.maxWristForward ?? 0.56) * openingScale, (limits.maxWristLateral ?? 0.66) * openingScale);
    const hind = pose.hindLegs[name];
    clampOffset(hind.knee, (limits.maxHindKneeForward ?? limits.maxAnkleForward ?? 0.24) * openingScale, (limits.maxHindKneeLateral ?? 0.2) * openingScale);
    clampOffset(hind.ankle, (limits.maxHindAnkleForward ?? limits.maxAnkleForward ?? 0.24) * openingScale, (limits.maxHindAnkleLateral ?? 0.22) * openingScale);
  }

  pose.constraintState = {
    classification: 'procedural_pose_constraint_state',
    profileId: profile?.id ?? null,
    maxBodyChainStretch: limits.maxBodyChainStretch ?? null,
    maxJawOpen: limits.maxJawOpen ?? profile?.jaw?.maxOpen ?? null,
    maxNeckHeadSeparation: limits.maxNeckHeadSeparation ?? null,
    effectiveNeckHeadSeparation: roundedDistance(pose.bodyOffsets.head, pose.bodyOffsets.neck),
    maxTailForward: limits.maxTailForward ?? null,
    maxTailBend: limits.maxTailBend ?? profile?.tail?.maxBend ?? null,
    clamped: before.headForward !== pose.bodyOffsets.head.forward
      || before.neckForward !== pose.bodyOffsets.neck.forward
      || before.jawOpen !== pose.jawOpen
      || before.hipsForward !== pose.bodyOffsets.hips.forward
      || before.tailTipForward !== pose.bodyOffsets.tailTip.forward
      || before.tailTipRight !== pose.bodyOffsets.tailTip.right
      || before.leftWristForward !== pose.wingForelimbs.left.wrist.forward
      || before.rightWristForward !== pose.wingForelimbs.right.wrist.forward
      || before.leftAnkleForward !== pose.hindLegs.left.ankle.forward
      || before.rightAnkleForward !== pose.hindLegs.right.ankle.forward
  };
}

function preserveNeckHeadMass(pose, maxSeparation) {
  const head = pose.bodyOffsets.head;
  const neck = pose.bodyOffsets.neck;
  const forwardGap = head.forward - neck.forward;
  const rightGap = head.right - neck.right;
  const distance = Math.hypot(forwardGap, rightGap);
  if (distance <= maxSeparation || distance <= 0.000001) return;
  const scale = maxSeparation / distance;
  neck.forward = head.forward - forwardGap * scale;
  neck.right = head.right - rightGap * scale;
}

function roundedDistance(a, b) {
  return Number(Math.hypot((a?.forward ?? 0) - (b?.forward ?? 0), (a?.right ?? 0) - (b?.right ?? 0)).toFixed(3));
}

function clampOffset(value, maxForward, maxRight) {
  value.forward = clamp(value.forward, -maxForward, maxForward);
  value.right = clamp(value.right, -maxRight, maxRight);
  value.height = clamp(value.height, -0.16, 0.38);
}

function buildAttackContact(pose, profile, actionState, projection, transform, radius) {
  const contact = profile.contact;
  if (!contact) return null;
  const facing = buildFacingVectors(transform.rotation ?? 0);
  const points = indexByRole(projection.bodyPoints ?? []);
  const head = points.head ?? { x: transform.x, y: transform.y };
  const chest = points.chest ?? { x: transform.x, y: transform.y };
  const side = actionState.side < 0 ? -1 : 1;
  const anchor = contact.contactBodyPart === 'jaw_head_front' ? head : chest;
  const poseForward = contact.contactBodyPart === 'jaw_head_front'
    ? pose.bodyOffsets.head?.forward ?? 0
    : pose.bodyOffsets.chest?.forward ?? 0;
  const forwardOffset = (contact.contactOffset.forward + poseForward * 0.35) * radius;
  const rightOffset = (contact.contactOffset.right + (contact.impactDirection === 'side_diagonal' ? side * 0.18 : 0)) * radius;
  const center = offset(anchor, facing.right, rightOffset, facing.forward, forwardOffset);
  const direction = contact.impactDirection === 'side_diagonal'
    ? normaliseVector(facing.forward.x * 0.42 - facing.right.x * side * 0.82, facing.forward.y * 0.42 - facing.right.y * side * 0.82)
    : facing.forward;
  const active = actionState.contactClosed !== true
    && actionState.phase >= contact.activePhaseStart
    && actionState.phase <= contact.activePhaseEnd;
  return {
    classification: 'procedural_attack_contact_volume',
    debugOnly: true,
    active,
    actionId: profile.id,
    phase: actionState.phase,
    phaseLabel: pose.actionPhaseLabel,
    side,
    contactBodyPart: contact.contactBodyPart,
    activePhaseStart: contact.activePhaseStart,
    activePhaseEnd: contact.activePhaseEnd,
    contactShape: contact.contactShape,
    contactOffset: { ...contact.contactOffset },
    contactSize: { ...contact.contactSize },
    x: center.x,
    y: center.y,
    forward: facing.forward,
    right: facing.right,
    impactDirection: contact.impactDirection,
    impactDirectionVector: direction,
    impactStrength: contact.impactStrength,
    staggerStrength: contact.staggerStrength
  };
}

function motionLabel(profile, phase01) {
  const labels = profile.phaseLabels ?? ['none'];
  return labels[Math.min(labels.length - 1, Math.floor(phase01 * labels.length))] ?? 'none';
}

function contactAnchor(role, limb, reach) {
  return {
    role,
    limb,
    phase: reach >= 0 ? 'reach' : 'plant',
    weight: clamp01(0.45 + Math.abs(reach) * 0.55)
  };
}

function limbOffsets() {
  return { shoulder: zeroOffset(), elbow: zeroOffset(), wrist: zeroOffset(), knee: zeroOffset(), ankle: zeroOffset(), digitSpread: 0, digitTrailRelax: 0 };
}

function zeroOffset() {
  return { forward: 0, right: 0, height: 0 };
}

function sideName(side) {
  return side < 0 ? 'left' : 'right';
}

function strikeCurve(phase, peak = 0.5) {
  const p = clamp01(phase);
  if (p <= peak) return smooth01(p / Math.max(0.001, peak));
  return 1 - smooth01((p - peak) / Math.max(0.001, 1 - peak));
}

function smoothstep(edge0, edge1, value) {
  return smooth01((value - edge0) / Math.max(0.001, edge1 - edge0));
}

function smooth01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function wrap01(value) {
  return ((value % 1) + 1) % 1;
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function normaliseVector(x, y) {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}
