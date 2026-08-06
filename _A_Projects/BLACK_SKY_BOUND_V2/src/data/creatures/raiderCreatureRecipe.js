import { EntityKind } from '../../constants/entityKinds.js';
import { LightEmitterId } from '../../constants/lightEmitterIds.js';
import { ActorLightReadabilityProfileId } from '../actorLightReadabilityProfiles.js';
import { EnemyAttackProfileId } from '../enemyAttackProfiles.js';
import { HumanoidProjectionId } from '../humanoids/raiderHumanoid.js';
import { ImpactReactionProfileId } from '../impactReactionProfiles.js';
import { LocomotionProfileId } from '../locomotionProfiles.js';
import { MaterialProfileId } from '../materialProfiles.js';
import { CreatureAttachmentId } from './creatureAttachments.js';

export const CREATURE_RECIPE_CONTRACT = 'black-sky-bound.creature-recipe.v1';
export const CREATURE_RECIPE_INSTANCE_CONTRACT = 'black-sky-bound.creature-recipe-instance.v1';

export const CreatureRecipeId = Object.freeze({
  RAIDER_SCAVENGER: 'raider_scavenger_family_v1'
});

export const RAIDER_CREATURE_RECIPE = deepFreeze({
  contract: CREATURE_RECIPE_CONTRACT,
  classification: 'canonical_procedural_creature_recipe',
  identity: {
    id: CreatureRecipeId.RAIDER_SCAVENGER,
    species: 'human_raider',
    actorKind: EntityKind.RAIDER,
    label: 'Ashland Raider',
    tags: ['human', 'raider', 'armed', 'torch_bearer']
  },
  physical: {
    health: 42,
    speed: 3.1,
    collider: { radius: 0.28, policy: 'single_collider_circle_body_v0' },
    physics: {
      mass: 1.05,
      separationMass: 1.2,
      impactResistance: 0.25,
      staggerResistance: 0.32,
      reactionProfileId: ImpactReactionProfileId.RAIDER_HUMAN
    }
  },
  bodyPlan: {
    family: 'humanoid',
    profileId: HumanoidProjectionId.RAIDER_TOP_DOWN_STICK,
    poseSolverId: 'raider_contact_intent_solver_v0',
    proportionVariation: {
      torsoScale: [0.92, 1.08],
      shoulderScale: [0.91, 1.1],
      hipScale: [0.94, 1.06],
      armScale: [0.94, 1.06],
      legScale: [0.95, 1.05],
      headScale: [0.94, 1.04]
    },
    meshAssembly: {
      primitiveVocabulary: ['faceted_segment', 'faceted_mass', 'cloth_shell', 'box_detail', 'cone_detail'],
      segments: [
        { id: 'left_upper_arm', from: 'leftShoulder', to: 'leftElbow', radiusField: 'armWidth', materialRole: 'cloth' },
        { id: 'left_forearm', from: 'leftElbow', to: 'leftHand', radiusField: 'armWidth', materialRole: 'skin' },
        { id: 'right_upper_arm', from: 'rightShoulder', to: 'rightElbow', radiusField: 'armWidth', materialRole: 'cloth' },
        { id: 'right_forearm', from: 'rightElbow', to: 'rightHand', radiusField: 'armWidth', materialRole: 'skin' },
        { id: 'left_thigh', from: 'leftHip', to: 'leftKnee', radiusField: 'legWidth', materialRole: 'cloth' },
        { id: 'left_calf', from: 'leftKnee', to: 'leftFoot', radiusField: 'legWidth', materialRole: 'leather' },
        { id: 'right_thigh', from: 'rightHip', to: 'rightKnee', radiusField: 'legWidth', materialRole: 'cloth' },
        { id: 'right_calf', from: 'rightKnee', to: 'rightFoot', radiusField: 'legWidth', materialRole: 'leather' }
      ],
      masses: [
        { id: 'torso', anchor: 'chest', geometryRole: 'torso_mass', materialRole: 'cloth' },
        { id: 'hips', anchor: 'hips', geometryRole: 'hip_mass', materialRole: 'leather' },
        { id: 'head', anchor: 'head', geometryRole: 'head_mass', materialRole: 'skin' },
        { id: 'left_hand', anchor: 'leftHand', geometryRole: 'hand_mass', materialRole: 'skin' },
        { id: 'right_hand', anchor: 'rightHand', geometryRole: 'hand_mass', materialRole: 'skin' },
        { id: 'left_foot', anchor: 'leftFoot', geometryRole: 'foot_mass', materialRole: 'leather' },
        { id: 'right_foot', anchor: 'rightFoot', geometryRole: 'foot_mass', materialRole: 'leather' }
      ]
    },
    declaredSocketIds: [
      'left_hand_socket', 'right_hand_socket', 'left_elbow_socket', 'right_elbow_socket',
      'left_shoulder_socket', 'right_shoulder_socket', 'chest_socket', 'hips_socket',
      'head_socket', 'back_socket', 'left_foot_socket', 'right_foot_socket',
      'spear_grip_socket', 'spear_front_grip_socket', 'spear_rear_grip_socket', 'spear_tip_socket',
      'torch_hand_socket', 'torch_tip_socket', 'torch_flame_socket', 'claw_hand_midpoint_socket'
    ]
  },
  surface: {
    primaryMaterialRole: 'cloth',
    colour: '#765039',
    stroke: '#211713',
    silhouette: 'humanoid',
    lightReadabilityProfileId: ActorLightReadabilityProfileId.RAIDER,
    materialRoles: {
      cloth: { profileId: MaterialProfileId.CLOTH_RAIDER, roughness: 0.88, metalness: 0, nightReveal: 0.3 },
      leather: { profileId: MaterialProfileId.LEATHER_RAIDER, roughness: 0.82, metalness: 0, nightReveal: 0.2 },
      skin: { profileId: MaterialProfileId.SKIN_HUMAN, roughness: 0.74, metalness: 0, nightReveal: 0.34 },
      wood: { profileId: MaterialProfileId.WOOD_WEAPON, roughness: 0.9, metalness: 0, nightReveal: 0.16 },
      metal: { profileId: MaterialProfileId.METAL_IRON, roughness: 0.56, metalness: 0.64, nightReveal: 0.26 },
      fire: { profileId: MaterialProfileId.FIRE_CARRIED, roughness: 0.22, metalness: 0, emissiveIntensity: 2.6 }
    },
    paletteFamilies: [
      palette('earth_umber', { cloth: '#765039', leather: '#34231c', skin: '#a87352', wood: '#5f422d', metal: '#8a887f', fire: '#ff7a2e' }),
      palette('soot_charcoal', { cloth: '#4c4945', leather: '#28231f', skin: '#9b694f', wood: '#54402f', metal: '#777872', fire: '#ff8438' }),
      palette('rust_ochre', { cloth: '#7a4931', leather: '#3a241c', skin: '#ad7a57', wood: '#674a31', metal: '#9a7763', fire: '#ff7026' }),
      palette('moss_ash', { cloth: '#565a43', leather: '#302b22', skin: '#a77658', wood: '#57442f', metal: '#7f8179', fire: '#ff8b3d' })
    ]
  },
  equipment: {
    slots: [
      slot('primaryWeapon', true, [CreatureAttachmentId.SPEAR_LEAF, CreatureAttachmentId.SPEAR_BARBED, CreatureAttachmentId.SPEAR_BROAD]),
      slot('light', true, [CreatureAttachmentId.TORCH_PITCH_WRAP, CreatureAttachmentId.TORCH_BOUND_REEDS, CreatureAttachmentId.TORCH_IRON_BASKET]),
      slot('head', true, [CreatureAttachmentId.HEAD_COWL_MASK, CreatureAttachmentId.HEAD_WRAPPED_MASK, CreatureAttachmentId.HEAD_SPLIT_HOOD]),
      slot('shoulder', true, [CreatureAttachmentId.SHOULDER_LEFT, CreatureAttachmentId.SHOULDER_RIGHT]),
      slot('torso', true, [CreatureAttachmentId.TORSO_CROSS_WRAP, CreatureAttachmentId.TORSO_SPLIT_TUNIC]),
      slot('belt', true, [CreatureAttachmentId.BELT_ROPE, CreatureAttachmentId.BELT_STUDDED]),
      slot('back', false, [CreatureAttachmentId.BACK_BEDROLL, CreatureAttachmentId.BACK_SUPPLY_PACK], 0.66)
    ],
    requiredGameplaySlots: ['primaryWeapon', 'light']
  },
  locomotion: {
    profileId: LocomotionProfileId.RAIDER,
    proceduralMotionSetId: 'raider_humanoid_motion_v1'
  },
  attacks: [
    { profileId: EnemyAttackProfileId.RAIDER_SPEAR_JAB, equipmentSlot: 'primaryWeapon', sourceSocketId: 'spear_rear_grip_socket', endpointSocketId: 'spear_tip_socket' },
    { profileId: EnemyAttackProfileId.RAIDER_TORCH_SWING, equipmentSlot: 'light', sourceSocketId: 'torch_hand_socket', endpointSocketId: 'torch_flame_socket' }
  ],
  behaviour: {
    controllerId: 'EnemyPressureAI',
    parameters: {
      damage: 9,
      attackRange: 1.15,
      attackCooldown: 1.1,
      roamRadius: 6,
      aggroRange: 11,
      leashRange: 18,
      decisionInterval: 0.65,
      guard: {
        enabled: true,
        holdDistance: 1.75,
        holdSeconds: 0.42,
        cooldownSeconds: 1.4,
        protectedArcRadians: Math.PI * 0.72,
        damageMultiplier: 0.62,
        recoverySeconds: 0.28
      }
    }
  },
  audio: {
    profileId: 'raider_audio_v1',
    cues: {
      proximity: 'enemy.raider.near',
      attackWarning: 'enemy.raider.warn',
      receivedHit: 'combat.enemy.hit.flesh'
    }
  },
  lighting: { equipmentSlot: 'light', lightEmitterId: LightEmitterId.TORCH },
  death: { profileId: 'raider_fallen_body' }
});

function slot(id, required, attachmentIds, chance = 1) {
  return { id, required, chance, attachmentIds };
}

function palette(id, roles) {
  return { id, roles };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
