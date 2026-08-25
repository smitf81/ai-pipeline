import { WyvernMotionId } from '../../data/creatures/groundedWyvernMotionProfiles.js';

const TAU = Math.PI * 2;

export function applyWyvernDirectionalGaitPose(pose, profile, proportionProfile, phase, move, motionState = null, actionCommitted = false) {
  const idle = profile.id === WyvernMotionId.IDLE;
  const dodge = profile.id === WyvernMotionId.DODGE;
  const dodgeEffectiveness = dodge ? clamp(motionState?.dodgeEffectiveness ?? 1, 0.5, 1) : 1;
  const articulatedMove = move * dodgeEffectiveness;
  const sway = Math.sin(phase);
  const counter = Math.cos(phase);
  const breath = Math.sin(phase * 0.5);
  const hips = proportionProfile?.hips ?? {};
  const tail = proportionProfile?.tail ?? {};
  const rearSettle = (hips.supportOffset ?? 0.18) * (idle ? 0.035 * Math.max(0, breath) : 0.16 * articulatedMove);
  const tailReach = tail.counterReach ?? 0.18;
  const speed = Math.max(0.001, Math.hypot(motionState?.localTravelForward ?? 0, motionState?.localTravelRight ?? 0));
  const localForward = clamp((motionState?.localTravelForward ?? 0) / speed, -1, 1);
  const localRight = clamp((motionState?.localTravelRight ?? 0) / speed, -1, 1);
  const strideDirection = idle || speed <= 0.001 ? 1 : (Math.abs(localForward) > 0.12 ? Math.sign(localForward) : 1);
  const turnEffort = actionCommitted ? 0 : clamp01(motionState?.turnEffort ?? 0);
  const speedBlend = clamp01(speed / 1.2);
  const pivotWeight = turnEffort * (1 - speedBlend * 0.72);
  const turnDirection = Math.sign(motionState?.turnDirection || motionState?.turnVelocity || motionState?.turnError || 0);
  const turnLean = turnDirection * turnEffort;
  pose.look.headYaw = motionState?.headLookYaw ?? 0;
  pose.look.neckYaw = motionState?.neckLookYaw ?? 0;
  pose.bodyOffsets.head.right += Math.sin(pose.look.headYaw) * 0.1;
  pose.bodyOffsets.neck.right += Math.sin(pose.look.neckYaw) * 0.065;
  pose.bodyOffsets.chest.right -= turnLean * (0.035 * articulatedMove + 0.055 * pivotWeight);
  pose.bodyOffsets.hips.right += turnLean * (0.055 * articulatedMove + 0.085 * pivotWeight) - localRight * 0.03 * articulatedMove;
  pose.bodyOffsets.head.forward += profile.poseOffsets.headForward ?? 0;
  pose.bodyOffsets.chest.right += idle ? profile.bodyWeightShift.sway * breath : profile.poseOffsets.shoulderRock * sway * articulatedMove;
  pose.bodyOffsets.chest.forward += idle ? profile.bodyWeightShift.forward * breath : 0.018 * counter * articulatedMove;
  pose.bodyOffsets.hips.right -= idle ? profile.poseOffsets.tailCounterSway * breath : profile.poseOffsets.hipCounter * sway * articulatedMove;
  pose.bodyOffsets.hips.forward -= rearSettle;
  pose.bodyOffsets.tailBase.right -= pose.bodyOffsets.hips.right * 0.45;
  pose.bodyOffsets.tailMid.right -= pose.bodyOffsets.hips.right * 0.72;
  pose.bodyOffsets.tailTip.right -= pose.bodyOffsets.hips.right;
  pose.bodyOffsets.tailBase.forward -= tailReach * (idle ? 0.025 * Math.max(0, breath) : 0.08 * articulatedMove);
  pose.bodyOffsets.tailMid.forward -= tailReach * (idle ? 0.045 * Math.max(0, breath) : 0.14 * articulatedMove);
  pose.bodyOffsets.tailTip.forward -= tailReach * (idle ? 0.065 * Math.max(0, breath) : 0.2 * articulatedMove);

  for (const side of [-1, 1]) {
    const name = side < 0 ? 'left' : 'right';
    const forePhase = phase + (side > 0 ? Math.PI : 0);
    const hindPhase = forePhase + Math.PI;
    const foreReach = Math.sin(forePhase) * articulatedMove * strideDirection;
    const hindReach = Math.sin(hindPhase) * articulatedMove * strideDirection;
    pose.wingForelimbs[name].shoulder.right += side * 0.018 * Math.cos(forePhase) * articulatedMove;
    pose.wingForelimbs[name].elbow.forward += foreReach * 0.08;
    pose.wingForelimbs[name].wrist.forward += foreReach * (profile.poseOffsets.wristStride ?? 0);
    pose.wingForelimbs[name].wrist.right += side * Math.cos(forePhase) * 0.028 * articulatedMove - localRight * 0.052 * articulatedMove;
    pose.hindLegs[name].knee.forward += hindReach * 0.05;
    pose.hindLegs[name].ankle.forward += hindReach * (profile.poseOffsets.hindStride ?? 0);
    pose.hindLegs[name].ankle.right += side * Math.cos(hindPhase) * 0.025 * articulatedMove - localRight * 0.036 * articulatedMove;
    pose.contactAnchors[`${name}Wrist`] = contactAnchor('wrist_claw_contact', `${name}_wing_forelimb`, foreReach);
    pose.contactAnchors[`${name}HindFoot`] = contactAnchor('hind_foot_contact', `${name}_hind_leg`, hindReach);
  }
  applyTurnPlanting(pose, proportionProfile?.turning ?? {}, motionState, pivotWeight, turnDirection);
  if (dodge) applyDodgeGradientPose(pose, profile, motionState, wrap01(phase / TAU), dodgeEffectiveness);
}

function applyTurnPlanting(pose, turning, motionState, weight, direction) {
  pose.turnState = {
    classification: 'renderer_neutral_feral_turn_pose_v1',
    effort: weight,
    phase: motionState?.turnPhase ?? 0,
    plantSide: motionState?.turnPlantSide ?? 1,
    direction,
    turningInPlace: motionState?.turningInPlace === true
  };
  if (weight <= 0.001 || direction === 0) return;
  const phase = motionState?.turnPhase ?? 0;
  const swingA = Math.max(0, Math.sin(phase));
  const swingB = Math.max(0, -Math.sin(phase));
  const lift = Math.max(0, turning.pivotLiftMeters ?? 0.035) * weight;
  const reach = Math.max(0, turning.pivotReach ?? 0.1) * weight;
  const outerSide = -direction;

  pose.bodyOffsets.chest.forward += 0.022 * weight;
  pose.bodyOffsets.hips.forward -= 0.032 * weight;
  pose.bodyOffsets.tailBase.right -= direction * 0.055 * weight;
  pose.bodyOffsets.tailMid.right -= direction * 0.09 * weight;
  pose.bodyOffsets.tailTip.right -= direction * 0.14 * weight;

  for (const side of [-1, 1]) {
    const name = side < 0 ? 'left' : 'right';
    const wristSwing = side < 0 ? swingA : swingB;
    const hindSwing = side < 0 ? swingB : swingA;
    const wrist = pose.wingForelimbs[name].wrist;
    const ankle = pose.hindLegs[name].ankle;
    wrist.height += lift * wristSwing;
    wrist.forward += direction * side * reach * (wristSwing - 0.22);
    wrist.right -= direction * reach * 0.42 * wristSwing;
    ankle.height += lift * 0.82 * hindSwing;
    ankle.forward -= direction * side * reach * 0.72 * (hindSwing - 0.2);
    ankle.right += direction * reach * 0.3 * hindSwing;
    pose.wingForelimbs[name].digitSpread += side === outerSide ? 0.12 * weight : 0.035 * weight;
    pose.contactAnchors[`${name}Wrist`] = turnContact('wrist_claw_contact', `${name}_wing_forelimb`, wristSwing, weight);
    pose.contactAnchors[`${name}HindFoot`] = turnContact('hind_foot_contact', `${name}_hind_leg`, hindSwing, weight);
  }
}

function turnContact(role, limb, swing, weight) {
  const amount = clamp01(swing * weight);
  return { role, limb, phase: amount > 0.14 ? 'turn_replant' : 'turn_plant', weight: 1 - amount * 0.82 };
}

function applyDodgeGradientPose(pose, profile, motionState, phase, effectiveness) {
  const apex = Math.max(0, motionState?.dodgeApexHeightMeters ?? profile.poseOffsets.apexHeightMeters ?? 0);
  const compression = Math.max(0, motionState?.dodgeLandingCompressionMeters ?? profile.poseOffsets.landingCompressionMeters ?? 0);
  pose.dodgeState = {
    classification: 'renderer_neutral_dodge_stamina_gradient_v1',
    mode: motionState?.dodgeMode ?? 'full',
    energy01: clamp01(motionState?.dodgeEnergy01 ?? 1),
    effectiveness,
    apexHeightMeters: apex,
    landingCompressionMeters: compression,
    buffered: motionState?.dodgeBuffered === true
  };
  if (motionState?.dodgeBuffered) {
    const coil = 0.018 + (1 - effectiveness) * 0.022;
    pose.bodyOffsets.chest.height -= coil;
    pose.bodyOffsets.hips.height -= coil * 1.35;
    pose.bodyOffsets.tailBase.height -= coil * 0.55;
    for (const name of ['left', 'right']) {
      pose.wingForelimbs[name].wrist.forward -= coil * 0.9;
      pose.hindLegs[name].ankle.forward -= coil * 0.65;
    }
    pose.elevationMeters = 0;
    return;
  }
  const height = apex * Math.sin(Math.PI * clamp01(phase))
    - compression * smoothstep(0.68, 0.86, phase) * (1 - smoothstep(0.88, 1, phase));
  pose.elevationMeters = height;
  for (const role of ['head', 'neck', 'chest', 'hips', 'tailBase', 'tailMid', 'tailTip']) pose.bodyOffsets[role].height += height;
  for (const name of ['left', 'right']) {
    pose.wingForelimbs[name].shoulder.height += height;
    pose.wingForelimbs[name].elbow.height += height;
    pose.wingForelimbs[name].wrist.height += Math.max(0, height) * 0.62;
    pose.hindLegs[name].knee.height += height;
    pose.hindLegs[name].ankle.height += Math.max(0, height) * 0.48;
  }
}

function contactAnchor(role, limb, reach) {
  return { role, limb, phase: reach >= 0 ? 'reach' : 'plant', weight: clamp01(0.45 + Math.abs(reach) * 0.55) };
}
function smoothstep(edge0, edge1, value) { return smooth01((value - edge0) / Math.max(0.001, edge1 - edge0)); }
function smooth01(value) { const t = clamp01(value); return t * t * (3 - 2 * t); }
function wrap01(value) { return ((value % 1) + 1) % 1; }
function clamp01(value) { return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0; }
function clamp(value, min, max) { return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min; }
