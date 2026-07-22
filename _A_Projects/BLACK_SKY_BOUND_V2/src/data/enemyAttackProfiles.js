import { DamageType } from '../constants/damageTypes.js';

export const EnemyAttackProfileId = Object.freeze({
  RAIDER_SPEAR_JAB: 'raider_spear_jab',
  RAIDER_TORCH_SWING: 'raider_torch_swing',
  HUSK_CLAW_MAUL: 'husk_claw_maul',
  WEREWOLF_LUNGE_BITE: 'werewolf_lunge_bite',
  LEGACY_CONTACT: 'legacy_enemy_contact'
});

export const EnemyAttackPhase = Object.freeze({
  IDLE: 'idle',
  WINDUP: 'windup',
  ACTIVE: 'active',
  RECOVER: 'recover'
});

export const EnemyCollateralMode = Object.freeze({
  TARGET_ONLY: 'target_only',
  HOSTILE_ONLY: 'hostile_only',
  HOSTILE_AND_FRIENDLY: 'hostile_and_friendly',
  ALL_DAMAGEABLE: 'all_damageable'
});

export const EnemyHitShape = Object.freeze({
  CIRCLE: 'circle',
  FORWARD_ARC: 'forward_arc',
  FORWARD_CAPSULE: 'forward_capsule'
});

export const ENEMY_ATTACK_PROFILES = Object.freeze({
  [EnemyAttackProfileId.RAIDER_SPEAR_JAB]: freezeProfile({
    id: EnemyAttackProfileId.RAIDER_SPEAR_JAB,
    label: 'Raider spear jab',
    range: 1.15,
    damage: 9,
    damageType: DamageType.SPEAR,
    cooldown: 1.1,
    windup: 0.28,
    active: 0.12,
    recovery: 0.34,
    damageTime01: 0.52,
    hitShape: { type: EnemyHitShape.FORWARD_CAPSULE, length: 1.15, halfWidth: 0.2 },
    attackMotion: 'linear_thrust',
    poseProfile: 'two_hand_spear_jab',
    strikeOriginSocket: 'spear_rear_grip_socket',
    strikeEndpointSocket: 'spear_tip_socket',
    weaponReach: 1.15,
    forwardCommitDistance: 0.1,
    recoveryExposure: 1,
    movement: { windup: false, active: false, recovery: true },
    debugVisual: { shape: EnemyHitShape.FORWARD_CAPSULE, colour: 'rgba(214,224,206,0.2)' },
    collateralMode: EnemyCollateralMode.HOSTILE_AND_FRIENDLY,
    knockback: 0.35,
    stagger: 0.34,
    movementLockDuringWindup: true,
    telegraphVisual: 'left_hand_spear_jab_pose',
    strikeVisual: {
      kind: 'enemy_spear_strike',
      visualRole: 'enemy_attack_streak',
      colour: 'rgba(236,220,184,0.72)',
      lineWidth: 2.2,
      lifetime: 0.14
    }
  }),
  [EnemyAttackProfileId.RAIDER_TORCH_SWING]: freezeProfile({
    id: EnemyAttackProfileId.RAIDER_TORCH_SWING,
    label: 'Raider carried-torch swing',
    range: 0.98,
    damage: 8,
    damageType: DamageType.FIRE,
    cooldown: 1.25,
    windup: 0.36,
    active: 0.18,
    recovery: 0.42,
    damageTime01: 0.48,
    hitShape: { type: EnemyHitShape.FORWARD_ARC, radius: 0.98, arcRadians: Math.PI * 0.72 },
    attackMotion: 'sweeping_arc',
    poseProfile: 'one_hand_torch_swing',
    strikeOriginSocket: 'torch_hand_socket',
    strikeEndpointSocket: 'torch_flame_socket',
    weaponReach: 0.88,
    forwardCommitDistance: 0.06,
    recoveryExposure: 1,
    movement: { windup: false, active: false, recovery: true },
    debugVisual: { shape: EnemyHitShape.FORWARD_ARC, colour: 'rgba(238,137,63,0.18)' },
    collateralMode: EnemyCollateralMode.HOSTILE_AND_FRIENDLY,
    knockback: 0.45,
    stagger: 0.42,
    movementLockDuringWindup: true,
    telegraphVisual: 'carried_torch_swing_pose',
    weaponSocket: 'torch_flame_socket',
    strikeVisual: {
      kind: 'enemy_torch_swing',
      visualRole: 'enemy_fire_swing_arc',
      colour: 'rgba(255,142,52,0.76)',
      fillColour: 'rgba(255,208,112,0.42)',
      lineWidth: 3.1,
      lifetime: 0.2
    }
  }),
  [EnemyAttackProfileId.HUSK_CLAW_MAUL]: freezeProfile({
    id: EnemyAttackProfileId.HUSK_CLAW_MAUL,
    label: 'Husk claw maul',
    range: 0.78,
    damage: 6,
    damageType: DamageType.CLAW,
    cooldown: 1.3,
    windup: 0.34,
    active: 0.16,
    recovery: 0.36,
    damageTime01: 0.54,
    hitShape: { type: EnemyHitShape.FORWARD_ARC, radius: 0.78, arcRadians: Math.PI * 0.84 },
    attackMotion: 'body_driven_maul',
    poseProfile: 'two_hand_claw_maul',
    strikeOriginSocket: 'chest_socket',
    strikeEndpointSocket: 'claw_hand_midpoint_socket',
    weaponReach: 0.78,
    forwardCommitDistance: 0.08,
    recoveryExposure: 0.78,
    movement: { windup: false, active: false, recovery: true },
    debugVisual: { shape: EnemyHitShape.FORWARD_ARC, colour: 'rgba(192,185,171,0.16)' },
    collateralMode: EnemyCollateralMode.ALL_DAMAGEABLE,
    knockback: 0.2,
    stagger: 0.28,
    movementLockDuringWindup: true,
    telegraphVisual: 'two_hand_claw_maul_pose',
    strikeVisual: {
      kind: 'enemy_claw_maul',
      visualRole: 'enemy_attack_streak',
      colour: 'rgba(204,194,176,0.6)',
      lineWidth: 2.4,
      lifetime: 0.16
    }
  }),
  [EnemyAttackProfileId.WEREWOLF_LUNGE_BITE]: freezeProfile({
    id: EnemyAttackProfileId.WEREWOLF_LUNGE_BITE,
    label: 'Werewolf lunge bite',
    range: 1.28,
    damage: 14,
    damageType: DamageType.BITE,
    cooldown: 1.55,
    windup: 0.2,
    active: 0.14,
    recovery: 0.62,
    damageTime01: 0.46,
    hitShape: { type: EnemyHitShape.FORWARD_CAPSULE, length: 1.28, halfWidth: 0.24 },
    attackMotion: 'low_lunge',
    poseProfile: 'werewolf_lunge_bite',
    strikeOriginSocket: 'chest_socket',
    strikeEndpointSocket: 'muzzle_socket',
    weaponReach: 1.28,
    forwardCommitDistance: 0.28,
    recoveryExposure: 1,
    movement: { windup: false, active: false, recovery: false },
    debugVisual: { shape: EnemyHitShape.FORWARD_CAPSULE, colour: 'rgba(190,170,210,0.18)' },
    collateralMode: EnemyCollateralMode.TARGET_ONLY,
    knockback: 0.8,
    stagger: 0.7,
    movementLockDuringWindup: true,
    telegraphVisual: 'forward_lunge_intent',
    strikeVisual: {
      kind: 'enemy_lunge_bite',
      visualRole: 'enemy_attack_streak',
      colour: 'rgba(210,190,222,0.7)',
      lineWidth: 3,
      lifetime: 0.18
    }
  }),
  [EnemyAttackProfileId.LEGACY_CONTACT]: freezeProfile({
    id: EnemyAttackProfileId.LEGACY_CONTACT,
    label: 'Legacy enemy contact',
    range: 0.82,
    damage: 1,
    damageType: DamageType.CONTACT,
    cooldown: 0.95,
    windup: 0.18,
    active: 0.08,
    recovery: 0.24,
    damageTime01: 0.5,
    hitShape: { type: EnemyHitShape.CIRCLE, radius: 0.82 },
    attackMotion: 'contact',
    poseProfile: 'legacy_contact_intent',
    strikeOriginSocket: 'body_center_socket',
    strikeEndpointSocket: 'body_front_socket',
    weaponReach: 0.82,
    forwardCommitDistance: 0,
    recoveryExposure: 0.5,
    movement: { windup: false, active: false, recovery: true },
    debugVisual: { shape: EnemyHitShape.CIRCLE, colour: 'rgba(200,200,200,0.14)' },
    collateralMode: EnemyCollateralMode.TARGET_ONLY,
    stagger: 0.18,
    movementLockDuringWindup: true,
    telegraphVisual: 'legacy_contact_intent'
  })
});

export function getEnemyAttackProfile(profileId) {
  const profile = ENEMY_ATTACK_PROFILES[profileId];
  if (!profile) throw new Error(`Unknown enemy attack profile: ${profileId}`);
  return profile;
}

export function isEnemyAttackProfileId(profileId) {
  return typeof profileId === 'string' && !!ENEMY_ATTACK_PROFILES[profileId];
}

export function getEnemyAttackRange(profileIds, fallback = 0.82) {
  const ranges = (profileIds ?? [])
    .map((id) => ENEMY_ATTACK_PROFILES[id]?.range)
    .filter(Number.isFinite);
  return ranges.length > 0 ? Math.max(...ranges) : fallback;
}

function freezeProfile(profile) {
  return Object.freeze({
    ...profile,
    hitShape: Object.freeze({ ...profile.hitShape }),
    movement: profile.movement ? Object.freeze({ ...profile.movement }) : null,
    debugVisual: profile.debugVisual ? Object.freeze({ ...profile.debugVisual }) : null,
    strikeVisual: profile.strikeVisual ? Object.freeze({ ...profile.strikeVisual }) : null
  });
}
