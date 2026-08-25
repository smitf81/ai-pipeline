import { WORLD_SCALE } from '../worldScale.js';
import { resolveCreatureProfile } from '../creatures/creatureTuning.js';
import { HUMANOID_TUNING_FIELDS, getHumanoidTuningFields } from './humanoidTuningFields.js';
import { DEFAULT_CAMERA_VISIBILITY_FOCUS_PROFILE } from '../cameraVisibilityFocusProfile.js';

export const HumanoidProjectionId = Object.freeze({
  RAIDER_TOP_DOWN_STICK: 'raider_top_down_stick_v0',
  HUSK_TOP_DOWN_SHAMBLER: 'husk_top_down_shambler_v0'
});

export const HumanoidEmbodimentId = Object.freeze({
  INK_STICK: 'ink_stick_humanoid_v1'
});

export { HUMANOID_TUNING_FIELDS, getHumanoidTuningFields };

export const RAIDER_HUMANOID_PROFILE = Object.freeze({
  id: HumanoidProjectionId.RAIDER_TOP_DOWN_STICK,
  classification: 'humanoid_projection_profile',
  embodimentId: HumanoidEmbodimentId.INK_STICK,
  label: 'Raider articulated procedural humanoid',
  scaleProfileId: WORLD_SCALE.id,
  physical: {
    heightMeters: 1.72,
    shoulderWidthMeters: 0.48,
    topDownFootprintMeters: { width: 0.74, length: 0.86 }
  },
  visual: {
    scale: 1,
    boundsPadding: 0.16
  },
  visibilityFocus: DEFAULT_CAMERA_VISIBILITY_FOCUS_PROFILE,
  body: {
    torsoLength: 0.46,
    shoulderWidth: 0.62,
    hipWidth: 0.38,
    spineWidth: 0.08
  },
  head: {
    radius: 0.18,
    forward: 0.28
  },
  limbs: {
    armLength: 0.54,
    upperArmLength: 0.37,
    forearmLength: 0.37,
    legLength: 0.48,
    thighLength: 0.3,
    calfLength: 0.3,
    armWidth: 0.052,
    legWidth: 0.055,
    handRadius: 0.075,
    footRadius: 0.085
  },
  gait: {
    phasePerWorldUnit: 4.7,
    idlePhaseSpeed: 0.8,
    maxMovementForFullGait: 2.35,
    stride: 0.22,
    armSwing: 0.17,
    legSpread: 0.17,
    motionId: 'walk',
    asymmetry: 0.02,
    bodySway: 0.012,
    forwardLurch: 0.01
  },
  posture: {
    chestLead: 0,
    chestSway: 0.008,
    hipDrag: 0,
    hipSway: 0.008,
    shoulderCurl: 0,
    shoulderForward: 0,
    headDrop: 0,
    headSway: 0.01,
    handForwardBias: 0,
    handInwardBias: 0,
    handDragBias: 0,
    footRearBias: 0
  },
  torch: {
    hand: 'left',
    length: 0.42,
    width: 0.055,
    handOffsetForward: 0.08,
    handOffsetRight: 0.04,
    flameRadius: 0.13
  },
  spear: {
    enabled: true,
    hand: 'right',
    length: 0.92,
    buttLength: 0.2,
    width: 0.038,
    tipLength: 0.15,
    tipWidth: 0.085
  },
  collision: {
    policy: 'single_collider_circle_body_v0',
    notes: 'Limbs and torch are visual sockets; gameplay collision remains the actor collider.'
  },
  shadow: {
    policy: 'visual_actor_sdf_shadow_projection_v1',
    castsShadow: true
  },
  palette: {
    torso: '#7e5637',
    limb: '#3a2519',
    skin: '#b8875f',
    outline: '#1c130f',
    torch: '#6d3f1e',
    spearShaft: '#755235',
    spearTip: '#c9c2ae',
    flame: 'rgba(255, 160, 72, 0.92)',
    flameCore: 'rgba(255, 229, 164, 0.96)'
  }
});

export const HUSK_HUMANOID_PROFILE = Object.freeze({
  id: HumanoidProjectionId.HUSK_TOP_DOWN_SHAMBLER,
  classification: 'humanoid_projection_profile',
  embodimentId: HumanoidEmbodimentId.INK_STICK,
  label: 'Husk top-down shambler',
  scaleProfileId: WORLD_SCALE.id,
  physical: {
    heightMeters: 1.78,
    shoulderWidthMeters: 0.44,
    topDownFootprintMeters: { width: 0.68, length: 0.88 }
  },
  visual: {
    scale: 0.97,
    boundsPadding: 0.17
  },
  visibilityFocus: DEFAULT_CAMERA_VISIBILITY_FOCUS_PROFILE,
  body: {
    torsoLength: 0.5,
    shoulderWidth: 0.54,
    hipWidth: 0.36,
    spineWidth: 0.07
  },
  head: {
    radius: 0.16,
    forward: 0.21
  },
  limbs: {
    armLength: 0.62,
    upperArmLength: 0.36,
    forearmLength: 0.36,
    legLength: 0.44,
    thighLength: 0.29,
    calfLength: 0.29,
    armWidth: 0.048,
    legWidth: 0.058,
    handRadius: 0.068,
    footRadius: 0.09
  },
  gait: {
    phasePerWorldUnit: 4.05,
    idlePhaseSpeed: 0.52,
    maxMovementForFullGait: 1.9,
    stride: 0.15,
    armSwing: 0.11,
    legSpread: 0.13,
    motionId: 'shamble',
    asymmetry: 0.22,
    bodySway: 0.052,
    forwardLurch: 0.036
  },
  posture: {
    chestLead: 0.054,
    chestSway: 0.022,
    hipDrag: 0.028,
    hipSway: 0.032,
    shoulderCurl: 0.048,
    shoulderForward: 0.022,
    headDrop: 0.034,
    headSway: 0.018,
    handForwardBias: 0.128,
    handInwardBias: 0.044,
    handDragBias: 0.038,
    footRearBias: 0.084
  },
  torch: {
    enabled: false,
    hand: 'right',
    length: 0.42,
    width: 0.055,
    handOffsetForward: 0.08,
    handOffsetRight: 0.04,
    flameRadius: 0.13
  },
  spear: {
    enabled: false
  },
  collision: {
    policy: 'single_collider_circle_body_v0',
    notes: 'Undead limbs remain projection-only; gameplay collision stays on the actor collider.'
  },
  shadow: {
    policy: 'visual_actor_sdf_shadow_projection_v1',
    castsShadow: true
  },
  palette: {
    torso: '#8c8579',
    limb: '#5f5952',
    skin: '#aaa394',
    outline: '#27241f',
    torch: '#6d3f1e',
    flame: 'rgba(255, 160, 72, 0.92)',
    flameCore: 'rgba(255, 229, 164, 0.96)'
  }
});

const HUMANOID_PROFILES = Object.freeze({
  [HumanoidProjectionId.RAIDER_TOP_DOWN_STICK]: RAIDER_HUMANOID_PROFILE,
  [HumanoidProjectionId.HUSK_TOP_DOWN_SHAMBLER]: HUSK_HUMANOID_PROFILE
});

export function getHumanoidProjectionProfile(profileId, tuning = null) {
  const profile = HUMANOID_PROFILES[profileId];
  if (!profile) throw new Error(`Unknown humanoid projection profile: ${profileId}`);
  return resolveCreatureProfile(profile, tuning);
}
