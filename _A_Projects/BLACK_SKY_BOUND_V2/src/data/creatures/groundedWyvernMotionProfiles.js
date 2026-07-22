import { AbilityId } from '../../constants/abilityIds.js';
import { ABILITIES } from '../abilities.js';

const CHARGE_COUNTER_ABILITY = ABILITIES[AbilityId.CHARGE_COUNTER];

export const WyvernMotionId = Object.freeze({
  IDLE: 'idle',
  CRAWL: 'crawl',
  DODGE: 'dodge'
});

export const WyvernActionId = Object.freeze({
  LEFT_CLAW_SWIPE: 'left_claw_swipe',
  RIGHT_CLAW_SWIPE: 'right_claw_swipe',
  BITE_ATTACK: 'bite_attack',
  SMOKE_BURST: 'smoke_burst',
  SMOKE_SPIT: 'smoke_spit',
  LUNGE_ATTACK: 'lunge_attack',
  CHARGE_COUNTER: 'charge_counter',
  CLAW_SWIPE_ATTACK: 'claw_swipe_attack'
});

export const WYVERN_MOTION_PROFILES = Object.freeze({
  [WyvernMotionId.IDLE]: Object.freeze({
    id: WyvernMotionId.IDLE,
    duration: 1.4,
    phaseLabels: Object.freeze(['settle', 'breathe', 'recover']),
    bodyWeightShift: Object.freeze({ sway: 0.014, forward: 0.012 }),
    contactAnchors: Object.freeze({ wrists: 'soft_planted', hindFeet: 'soft_planted' }),
    affectedJoints: Object.freeze(['head', 'neck', 'chest', 'hips', 'wrist_claw', 'hind_foot']),
    poseOffsets: Object.freeze({ headForward: 0.012, chestSway: 0.014, tailCounterSway: 0.018 })
  }),
  [WyvernMotionId.CRAWL]: Object.freeze({
    id: WyvernMotionId.CRAWL,
    duration: 0.82,
    phaseLabels: Object.freeze(['reach', 'plant', 'push', 'recover']),
    bodyWeightShift: Object.freeze({ sway: 0.052, forward: 0.032 }),
    contactAnchors: Object.freeze({ wrists: 'alternating_wrist_claw', hindFeet: 'diagonal_hind_foot' }),
    affectedJoints: Object.freeze(['chest', 'hips', 'left_wrist', 'right_wrist', 'left_hind_foot', 'right_hind_foot']),
    poseOffsets: Object.freeze({ wristStride: 0.18, hindStride: 0.13, shoulderRock: 0.044, hipCounter: 0.038 })
  }),
  [WyvernMotionId.DODGE]: Object.freeze({
    id: WyvernMotionId.DODGE,
    duration: 0.16,
    phaseLabels: Object.freeze(['coil', 'spring', 'land', 'settle']),
    bodyWeightShift: Object.freeze({ sway: 0.09, forward: 0.04 }),
    contactAnchors: Object.freeze({ wrists: 'quick_brace', hindFeet: 'spring_and_land' }),
    affectedJoints: Object.freeze(['chest', 'hips', 'left_wrist', 'right_wrist', 'left_hind_foot', 'right_hind_foot', 'tail']),
    poseOffsets: Object.freeze({ wristStride: 0.12, hindStride: 0.2, shoulderRock: 0.085, hipCounter: 0.11 })
  })
});

const CLAW_PHASE_LABELS = Object.freeze([
  Object.freeze({ until: 0.25, label: 'windup' }),
  Object.freeze({ until: 0.62, label: 'sweep' }),
  Object.freeze({ until: 0.82, label: 'follow_through' }),
  Object.freeze({ until: 1, label: 'recover' })
]);

const CLAW_CONTACT = Object.freeze({
  contactBodyPart: 'primary_wrist_claw',
  activePhaseStart: 0.3,
  activePhaseEnd: 0.76,
  contactShape: 'front_arc_band',
  contactOffset: Object.freeze({ forward: 0.84, right: 0 }),
  contactSize: Object.freeze({ length: 1.08, width: 1.42, arcDegrees: 116 }),
  impactDirection: 'side_diagonal',
  impactStrength: 5.6,
  staggerStrength: 0.68
});

function clawSwipeProfile(id, fixedSide = null, abilitySlot = 'bite') {
  return Object.freeze({
    id,
    displayName: fixedSide === -1 ? 'LEFT CLAW' : fixedSide === 1 ? 'RIGHT CLAW' : 'CLAW',
    actionFamily: 'claw_swipe',
    abilitySlot,
    interruptible: false,
    fixedSide,
    duration: 0.52,
    visualRecovery: Object.freeze({ duration: 0.14, startPhase: 0.82 }),
    phaseLabels: CLAW_PHASE_LABELS,
    hitTiming: 0.56,
    bodyWeightShift: Object.freeze({ counterSway: 0.13, neckCounter: 0.105 }),
    contactAnchors: Object.freeze({ primaryWrist: 'sweep_contact', oppositeWrist: 'brace' }),
    affectedJoints: Object.freeze(['primary_wrist', 'primary_elbow', 'opposite_wrist', 'neck', 'chest']),
    poseOffsets: Object.freeze({ wristForward: 0.62, wristAcross: 0.92, elbowForward: 0.32, counterSway: 0.12, oppositeBrace: 0.15, digitSpread: 1.14, digitTrailRelax: 0.72 }),
    contact: CLAW_CONTACT
  });
}

export const WYVERN_ACTION_PROFILES = Object.freeze({
  [WyvernActionId.LEFT_CLAW_SWIPE]: clawSwipeProfile(WyvernActionId.LEFT_CLAW_SWIPE, -1),
  [WyvernActionId.RIGHT_CLAW_SWIPE]: clawSwipeProfile(WyvernActionId.RIGHT_CLAW_SWIPE, 1),
  [WyvernActionId.CLAW_SWIPE_ATTACK]: clawSwipeProfile(WyvernActionId.CLAW_SWIPE_ATTACK, null),
  [WyvernActionId.BITE_ATTACK]: Object.freeze({
    id: WyvernActionId.BITE_ATTACK,
    displayName: 'BITE',
    abilitySlot: 'bite',
    actionFamily: 'bite',
    interruptible: false,
    duration: 0.34,
    visualRecovery: Object.freeze({ duration: 0.11, startPhase: 0.82 }),
    phaseLabels: Object.freeze([
      Object.freeze({ until: 0.22, label: 'coil' }),
      Object.freeze({ until: 0.58, label: 'strike' }),
      Object.freeze({ until: 0.82, label: 'hold' }),
      Object.freeze({ until: 1, label: 'recover' })
    ]),
    hitTiming: 0.58,
    bodyWeightShift: Object.freeze({ coilBack: 0.05, shoulderDrive: 0.17 }),
    contactAnchors: Object.freeze({ wrists: 'brace', hindFeet: 'wide_stabilise' }),
    affectedJoints: Object.freeze(['head', 'jaw', 'neck', 'chest', 'left_wrist', 'right_wrist']),
    poseOffsets: Object.freeze({ headForward: 0.66, neckForward: 0.39, jawOpen: 0.86, chestForward: 0.17, chestCoilBack: 0.045, wristBraceOut: 0.11, wristBraceBack: 0.075 }),
    contact: Object.freeze({
      contactBodyPart: 'jaw_head_front',
      activePhaseStart: 0.38,
      activePhaseEnd: 0.72,
      contactShape: 'capsule',
      contactOffset: Object.freeze({ forward: 0.9, right: 0 }),
      contactSize: Object.freeze({ length: 0.92, width: 0.5 }),
      impactDirection: 'forward',
      impactStrength: 4.8,
      staggerStrength: 0.52
    })
  }),
  [WyvernActionId.SMOKE_BURST]: Object.freeze({
    id: WyvernActionId.SMOKE_BURST,
    displayName: 'SMOKE BURST',
    abilitySlot: 'smokeBurst',
    actionFamily: 'smoke_burst',
    interruptible: false,
    duration: 0.78,
    visualRecovery: Object.freeze({ duration: 0.2, startPhase: 0.82 }),
    phaseLabels: Object.freeze([
      Object.freeze({ until: 0.28, label: 'cough' }),
      Object.freeze({ until: 0.6, label: 'exhale' }),
      Object.freeze({ until: 0.82, label: 'billow' }),
      Object.freeze({ until: 1, label: 'recover' })
    ]),
    bodyWeightShift: Object.freeze({ throatBrace: 0.1, chestCompression: 0.16 }),
    contactAnchors: Object.freeze({ wrists: 'wide_brace', hindFeet: 'wide_stabilise' }),
    affectedJoints: Object.freeze(['head', 'jaw', 'neck', 'chest', 'left_wrist', 'right_wrist', 'tail']),
    poseOffsets: Object.freeze({ headBack: 0.12, neckBack: 0.08, jawOpen: 0.58, chestCompression: 0.17, wristBraceOut: 0.13 }),
    smokeEmission: Object.freeze({
      emissionKey: 'body_radial_smoke_burst',
      activePhaseStart: 0.36,
      activePhaseEnd: 0.62,
      emitterSocket: 'body',
      puffCount: 8,
      lifetime: 3.35,
      startRadius: 0.34,
      endRadius: 1.06,
      ringRadius: 0.72,
      radialSpeed: 0.82,
      expandRate: 0.34,
      fadeExponent: 1.12,
      density: 1.18,
      opacity: 1,
      slowMultiplier: 0.34,
      sourceKind: 'dragon_smoke_cloud',
      shape: 'radial_soft_disc_burst'
    })
  }),
  [WyvernActionId.SMOKE_SPIT]: Object.freeze({
    id: WyvernActionId.SMOKE_SPIT,
    displayName: 'SMOKE',
    abilitySlot: 'smoke',
    actionFamily: 'smoke_spit',
    interruptible: false,
    duration: 0.62,
    visualRecovery: Object.freeze({ duration: 0.16, startPhase: 0.82 }),
    phaseLabels: Object.freeze([
      Object.freeze({ until: 0.26, label: 'windup' }),
      Object.freeze({ until: 0.58, label: 'emit' }),
      Object.freeze({ until: 0.82, label: 'fade' }),
      Object.freeze({ until: 1, label: 'recover' })
    ]),
    bodyWeightShift: Object.freeze({ throatBrace: 0.08, chestCompression: 0.12 }),
    contactAnchors: Object.freeze({ wrists: 'brace', hindFeet: 'wide_stabilise' }),
    affectedJoints: Object.freeze(['head', 'jaw', 'neck', 'chest', 'left_wrist', 'right_wrist']),
    poseOffsets: Object.freeze({ headForward: 0.22, neckForward: 0.12, jawOpen: 0.42, chestBack: 0.11, wristBraceOut: 0.07 }),
    smokeEmission: Object.freeze({
      emissionKey: 'mouth_forward_smoke_plume',
      activePhaseStart: 0.34,
      activePhaseEnd: 0.58,
      emitterSocket: 'mouth',
      plumeSpeed: 1.18,
      plumeSpread: 0.36,
      puffCount: 7,
      lifetime: 2.35,
      startRadius: 0.2,
      endRadius: 0.92,
      segmentSpacing: 0.35,
      forwardOffset: 0.22,
      jitterAmplitude: 0.15,
      expandRate: 0.22,
      fadeExponent: 1.35,
      density: 1.12,
      opacity: 0.95,
      slowMultiplier: 0.42,
      sourceKind: 'dragon_smoke_plume',
      shape: 'forward_soft_disc_chain'
    })
  }),
  [WyvernActionId.LUNGE_ATTACK]: Object.freeze({
    id: WyvernActionId.LUNGE_ATTACK,
    displayName: 'LUNGE',
    abilitySlot: 'lunge',
    actionFamily: 'lunge_attack',
    interruptible: false,
    duration: 0.46,
    visualRecovery: Object.freeze({ duration: 0.15, startPhase: 0.78 }),
    phaseLabels: Object.freeze([
      Object.freeze({ until: 0.18, label: 'coil' }),
      Object.freeze({ until: 0.58, label: 'drive' }),
      Object.freeze({ until: 0.78, label: 'brake' }),
      Object.freeze({ until: 1, label: 'recover' })
    ]),
    hitTiming: 0.46,
    bodyWeightShift: Object.freeze({ forwardDrive: 0.16, braceBack: 0.08 }),
    contactAnchors: Object.freeze({ wrists: 'brace', hindFeet: 'push' }),
    affectedJoints: Object.freeze(['head', 'neck', 'chest', 'left_wrist', 'right_wrist', 'hind_foot']),
    poseOffsets: Object.freeze({ headForward: 0.28, neckForward: 0.16, chestForward: 0.18, wristBraceBack: 0.12, hindPush: 0.14 }),
    movementImpulse: Object.freeze({
      activePhaseStart: 0.16,
      activePhaseEnd: 0.58,
      distance: 1.24
    }),
    contact: Object.freeze({
      contactBodyPart: 'chest_body_front',
      activePhaseStart: 0.28,
      activePhaseEnd: 0.62,
      contactShape: 'capsule',
      contactOffset: Object.freeze({ forward: 0.58, right: 0 }),
      contactSize: Object.freeze({ length: 0.98, width: 0.72 }),
      impactDirection: 'forward',
      impactStrength: 4.2,
      staggerStrength: 0.44
    })
  }),
  [WyvernActionId.CHARGE_COUNTER]: Object.freeze({
    id: WyvernActionId.CHARGE_COUNTER,
    displayName: 'CHARGE',
    abilitySlot: 'charge',
    actionFamily: 'charge_counter',
    interruptible: false,
    duration: CHARGE_COUNTER_ABILITY.action.duration,
    visualRecovery: Object.freeze({
      duration: CHARGE_COUNTER_ABILITY.recoveryMs / 1000,
      startPhase: CHARGE_COUNTER_ABILITY.action.activeEndPhase
    }),
    phaseLabels: Object.freeze([
      Object.freeze({ until: 0.18, label: 'plant' }),
      Object.freeze({ until: 0.58, label: 'drive' }),
      Object.freeze({ until: 0.76, label: 'brake' }),
      Object.freeze({ until: 1, label: 'recover' })
    ]),
    hitTiming: 0.44,
    bodyWeightShift: Object.freeze({ compression: 0.16, forwardDrive: 0.28, braceBack: 0.13 }),
    contactAnchors: Object.freeze({ wrists: 'wide_plant_then_brace', hindFeet: 'compress_then_launch' }),
    affectedJoints: Object.freeze(['head', 'neck', 'chest', 'hips', 'left_wrist', 'right_wrist', 'hind_foot', 'tail']),
    poseOffsets: Object.freeze({
      plantCompression: 0.16,
      headForward: 0.36,
      neckForward: 0.22,
      chestForward: 0.31,
      wristBraceBack: 0.15,
      wristPlantOut: 0.1,
      hindCompression: 0.18,
      hindPush: 0.22
    }),
    movementImpulse: Object.freeze({
      activePhaseStart: CHARGE_COUNTER_ABILITY.action.movementStartPhase,
      activePhaseEnd: CHARGE_COUNTER_ABILITY.action.movementEndPhase,
      distance: CHARGE_COUNTER_ABILITY.action.movementDistance,
      accelerationExponent: CHARGE_COUNTER_ABILITY.action.accelerationExponent,
      stopOnBlocked: CHARGE_COUNTER_ABILITY.action.stopOnBlocked
    }),
    contact: CHARGE_COUNTER_ABILITY.contact
  })
});

export function getWyvernMotionProfile(id) {
  return WYVERN_MOTION_PROFILES[id] ?? WYVERN_MOTION_PROFILES[WyvernMotionId.IDLE];
}

export function getWyvernActionProfile(id) {
  return WYVERN_ACTION_PROFILES[id] ?? null;
}

export function getWyvernActionPhaseLabel(profile, phase) {
  const p = Math.max(0, Math.min(1, phase));
  return profile?.phaseLabels?.find((entry) => p <= entry.until)?.label ?? 'none';
}
