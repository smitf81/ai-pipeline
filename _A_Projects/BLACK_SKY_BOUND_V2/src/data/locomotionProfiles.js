import { EntityKind } from '../constants/entityKinds.js';
import { metersToTiles } from './worldScale.js';

export const LocomotionProfileId = Object.freeze({
  BABY_WYVERN: 'baby_wyvern_restrained_stamina_v0',
  RAIDER: 'raider_evasive_stamina_v0',
  HUSK: 'husk_limited_stamina_v0',
  WEREWOLF: 'werewolf_evasive_stamina_v0'
});

export const LOCOMOTION_PROFILES = Object.freeze({
  [LocomotionProfileId.BABY_WYVERN]: profile({
    id: LocomotionProfileId.BABY_WYVERN,
    max: 60,
    regenPerSecond: 11,
    recoveryDelay: 1.4,
    sprint: { enabled: true, multiplier: 1.42, drainPerSecond: 30, resumeEnergy01: 0.3 },
    dodge: {
      enabled: true,
      cost: 24,
      distance: metersToTiles(0.56),
      duration: 0.16,
      cooldown: 0.55,
      visualRecoveryDuration: 0.12,
      visualRecoveryStartPhase: 0.5,
      inputBufferSeconds: 0.12,
      interruptionBlendSeconds: 0.08,
      gradient: {
        enabled: true,
        curve: 'smoothstep',
        fullEffectEnergy01: 0.4,
        minEffectiveness: 0.5,
        distanceMinMeters: 0.28,
        distanceMaxMeters: 0.56,
        apexMinMeters: 0.06,
        apexMaxMeters: 0.12,
        landingCompressionLowEnergyMeters: 0.09,
        landingCompressionFullEnergyMeters: 0.06,
        cooldownLowEnergySeconds: 0.75,
        cooldownFullEnergySeconds: 0.55
      },
      aiStyle: null,
      aiTriggerRange: 0
    }
  }),
  [LocomotionProfileId.RAIDER]: profile({
    id: LocomotionProfileId.RAIDER,
    max: 42,
    regenPerSecond: 9,
    recoveryDelay: 1.2,
    sprint: { enabled: false, multiplier: 1, drainPerSecond: 0, resumeThreshold: 0 },
    dodge: { enabled: true, cost: 24, distance: 0.82, duration: 0.17, cooldown: 0.95, visualRecoveryDuration: 0.11, visualRecoveryStartPhase: 0.55, aiStyle: 'side', aiTriggerRange: 2.15 }
  }),
  [LocomotionProfileId.HUSK]: profile({
    id: LocomotionProfileId.HUSK,
    max: 30,
    regenPerSecond: 7,
    recoveryDelay: 1.35,
    sprint: { enabled: false, multiplier: 1, drainPerSecond: 0, resumeThreshold: 0 },
    dodge: { enabled: false, cost: 0, distance: 0, duration: 0, cooldown: 0, visualRecoveryDuration: 0, visualRecoveryStartPhase: 1, aiStyle: null, aiTriggerRange: 0 }
  }),
  [LocomotionProfileId.WEREWOLF]: profile({
    id: LocomotionProfileId.WEREWOLF,
    max: 58,
    regenPerSecond: 12,
    recoveryDelay: 0.9,
    sprint: { enabled: false, multiplier: 1, drainPerSecond: 0, resumeThreshold: 0 },
    dodge: { enabled: true, cost: 24, distance: 1.16, duration: 0.14, cooldown: 0.72, visualRecoveryDuration: 0.1, visualRecoveryStartPhase: 0.52, aiStyle: 'back_diagonal', aiTriggerRange: 2.45 }
  })
});

export const ACTOR_LOCOMOTION_PROFILE_IDS = Object.freeze({
  [EntityKind.YOUNG_DRAGON]: LocomotionProfileId.BABY_WYVERN,
  [EntityKind.RAIDER]: LocomotionProfileId.RAIDER,
  [EntityKind.HUSK]: LocomotionProfileId.HUSK,
  [EntityKind.WEREWOLF]: LocomotionProfileId.WEREWOLF
});

export function getLocomotionProfile(id) {
  const value = LOCOMOTION_PROFILES[id];
  if (!value) throw new Error(`Unknown locomotion profile: ${id}`);
  return value;
}

function profile(data) {
  return Object.freeze({
    id: data.id,
    stamina: Object.freeze({
      max: data.max,
      regenPerSecond: data.regenPerSecond,
      recoveryDelay: data.recoveryDelay
    }),
    sprint: Object.freeze({ ...data.sprint }),
    dodge: Object.freeze({
      ...data.dodge,
      gradient: data.dodge?.gradient ? Object.freeze({ ...data.dodge.gradient }) : null
    })
  });
}
