import { GROUNDED_WYVERN_HATCHLING_PROPORTIONS } from './groundedWyvernProportions.js';

const GROUNDED_WYVERN_HATCHLING_ID = 'grounded_wyvern_hatchling';

export const GROUNDED_WYVERN_HATCHLING_PROJECTION = Object.freeze({
  id: GROUNDED_WYVERN_HATCHLING_ID,
  label: 'Grounded wyvern hatchling',
  classification: 'projection_recipe',
  bodyPlan: 'four_limb_wyvern',
  locomotion: 'grounded_crawl',
  notes: 'Two hind legs plus two batlike wing-forelimbs. Basic movement crawls/lopes; wings do not flap during normal locomotion. Wing-forelimbs use shoulder/elbow/wrist anatomy with wrist/claw as the grounded contact point. Wing digits originate at the wrist/claw hub; membrane attaches back to the low flank/hip.',
  chain: Object.freeze({
    // Distances are multiplied by the actor collider radius so the gameplay body can stay simple.
    segmentLengthScales: Object.freeze([0.58, 0.7, 0.5, 0.66, 0.58, 0.42]),
    pointRoles: Object.freeze(['head', 'neck', 'chest', 'hips', 'tailBase', 'tailMid', 'tailTip']),
    followSharpness: 22,
    idleTailSway: 0.038
  }),
  proportionProfile: GROUNDED_WYVERN_HATCHLING_PROPORTIONS,
  proportions: buildGroundedWyvernProportions(GROUNDED_WYVERN_HATCHLING_PROPORTIONS),
  gait: Object.freeze({
    phasePerWorldUnit: 4.55,
    idleBreathSpeed: 2.1,
    maxMovementForFullGait: 3.8,
    crawlReach: 0.24,
    shoulderRock: 0.026
  }),

  hindLegAnatomy: buildGroundedWyvernHindLegAnatomy(GROUNDED_WYVERN_HATCHLING_PROPORTIONS),
  wingAnatomy: buildGroundedWyvernWingAnatomy(GROUNDED_WYVERN_HATCHLING_PROPORTIONS),
  palette: Object.freeze({
    hide: '#5c2f25',
    hideDark: '#2d1714',
    hideRim: '#d18355',
    wingMembrane: 'rgba(45,23,20,0.76)',
    eye: 'rgba(255,214,132,0.95)',
    eyeDim: 'rgba(255,214,132,0.38)',
    shadow: 'rgba(0,0,0,0.32)'
  })
});

export function buildGroundedWyvernProportions(profile) {
  return Object.freeze({
    head: 0.62,
    headLength: profile.head.length,
    headWidth: profile.head.width,
    jawLength: profile.jaw.length,
    jawWidth: profile.jaw.width,
    snout: profile.head.snoutLength,
    neck: profile.neck.width,
    neckLength: profile.neck.chainLength,
    shoulderWidth: profile.shoulders.width,
    chest: profile.shoulders.chestWidth,
    torsoLength: profile.torso.length,
    hips: profile.hips.width,
    hipLength: profile.hips.length,
    tailBase: profile.tail.baseWidth ?? profile.tail.taper[0],
    tailMid: profile.tail.taper[1],
    tailTip: profile.tail.taper.at(-1),
    wingForelimb: profile.forelimb.wristReach,
    wingMembrane: 0.72,
    hindLeg: profile.hindLeg.shinLength,
    eye: 0.105
  });
}

export function buildGroundedWyvernHindLegAnatomy(profile) {
  return Object.freeze({
    classification: 'projection_anatomy',
    limbRole: 'hind_leg',
    jointChain: Object.freeze(['hip', 'knee', 'ankle_foot']),
    ik: 'two_bone_projection',
    gaitRelationship: 'diagonal_with_opposite_wing_forelimb',
    hipWidth: profile.hindLeg.hipWidth,
    hipBack: profile.hindLeg.hipBack,
    thighLength: profile.hindLeg.thighLength,
    shinLength: profile.hindLeg.shinLength,
    kneeOut: profile.hindLeg.kneeOut,
    kneeBack: profile.hindLeg.kneeBack,
    ankleOut: profile.hindLeg.ankleOut,
    ankleBack: profile.hindLeg.footBack,
    footStride: profile.gait.hindStride * 2,
    footBraceOut: profile.gait.hindPlantSpread,
    footRadius: profile.hindLeg.footRadius,
    footLength: profile.hindLeg.footLength,
    thighGirth: profile.hindLeg.thighGirth,
    shinGirth: profile.hindLeg.shinGirth,
    clawSpread: profile.hindLeg.clawSpread
  });
}

export function buildGroundedWyvernWingAnatomy(profile) {
  return Object.freeze({
    classification: 'projection_anatomy',
    limbRole: 'wing_forelimb',
    groundedContact: 'wrist_claw',
    digitOrigin: 'wrist_claw',
    membraneFoldOrigin: 'wrist_claw',
    bodyAttachmentRole: 'low_flank_hip',
    shoulderWidth: profile.forelimb.shoulderAnchorWidth,
    shoulderForward: -0.06,
    upperArmLength: 0.72,
    forearmLength: 0.9,
    elbowPreferredOut: 0.62,
    elbowPreferredForward: 0.12,
    wristOut: 0.98,
    wristForward: 0.7,
    wristStride: 0.52,
    wristBraceOut: 0.12,
    clawRadius: 0.14,
    // Long spars are essential: these are wing digits folded back along the body, not extra crawling legs.
    digitLengths: Object.freeze([2.92, 2.82, 2.64, 2.46]),
    digitOut: Object.freeze([1.02, 0.78, 0.56, 0.38]),
    digitBack: Object.freeze([1.36, 1.88, 2.38, 2.78]),
    foldedTrailBias: 'folded_back_along_body_near_tail',
    sweepDigitOutAdd: Object.freeze([1.58, 1.38, 1.12, 0.84]),
    sweepDigitBackRelax: Object.freeze([0.58, 0.78, 0.96, 1.12]),
    digitTipNotch: 0.11,
    digitKnuckleFractions: Object.freeze([0.34, 0.66]),
    membraneRootOut: 0.36,
    membraneRootBack: 0.36,
    membraneHipOut: 0.36,
    membraneHipBack: 0.08,
    membraneScallop: 0.18,
    membraneOpacity: 0.72,
    boneWidth: 0.084
  });
}

export function buildGroundedWyvernHatchlingProjection(profile = GROUNDED_WYVERN_HATCHLING_PROPORTIONS) {
  return Object.freeze({
    ...GROUNDED_WYVERN_HATCHLING_PROJECTION,
    proportionProfile: profile,
    proportions: buildGroundedWyvernProportions(profile),
    hindLegAnatomy: buildGroundedWyvernHindLegAnatomy(profile),
    wingAnatomy: buildGroundedWyvernWingAnatomy(profile)
  });
}
