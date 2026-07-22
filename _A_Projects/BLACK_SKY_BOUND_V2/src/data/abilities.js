import { AbilityId } from '../constants/abilityIds.js';
import { DamageType } from '../constants/damageTypes.js';
import { InputActionId } from './inputActions.js';

export const ABILITIES = Object.freeze({
  [AbilityId.MOVE]: Object.freeze({
    id: AbilityId.MOVE,
    inputAction: InputActionId.MOVE,
    displayName: 'MOVE',
    reviewOrder: 10,
    unlockedByDefault: true
  }),
  [AbilityId.BITE_CLAW]: {
    id: AbilityId.BITE_CLAW,
    inputAction: InputActionId.MELEE,
    displayName: 'ATTACK COMBO',
    reviewOrder: 20,
    unlockedByDefault: true,
    damageType: DamageType.BITE,
    damage: 22,
    cooldown: 0.42,
    reach: 1.15,
    radius: 0.85,
    panicDuration: 0.45
  },
  [AbilityId.BODY_LUNGE]: {
    id: AbilityId.BODY_LUNGE,
    inputAction: InputActionId.LUNGE,
    displayName: 'LUNGE',
    reviewOrder: 30,
    unlockedByDefault: true,
    damageType: DamageType.BODY,
    damage: 16,
    cooldown: 1.1,
    distance: 1.25,
    radius: 0.9,
    panicDuration: 0.55
  },
  [AbilityId.SMOKE_BURST]: {
    id: AbilityId.SMOKE_BURST,
    inputAction: InputActionId.SMOKE,
    displayName: 'SMOKE BURST',
    reviewOrder: 40,
    unlockedByDefault: false,
    requiresUnlockReceipt: true,
    unlockEventId: 'instinct_smoke_awakened',
    cooldown: 3.5,
    radius: 2.5,
    duration: 3.35,
    slowMultiplier: 0.34
  },
  [AbilityId.SMOKE_SPIT]: {
    id: AbilityId.SMOKE_SPIT,
    inputAction: InputActionId.SMOKE,
    displayName: 'DIRECTED SMOKE',
    reviewOrder: 45,
    unlockedByDefault: false,
    lockedForFirstPlayable: true,
    cooldown: 3.5,
    radius: 2.25,
    duration: 3.2,
    slowMultiplier: 0.35
  },
  [AbilityId.DODGE]: Object.freeze({
    id: AbilityId.DODGE,
    inputAction: InputActionId.DODGE,
    displayName: 'DODGE',
    reviewOrder: 50,
    unlockedByDefault: true,
    staminaCost: 20,
    requiredState: 'grounded'
  }),
  [AbilityId.CHARGE_COUNTER]: Object.freeze({
    id: AbilityId.CHARGE_COUNTER,
    inputAction: InputActionId.DODGE_FOLLOWUP,
    displayName: 'DODGE CHARGE',
    reviewOrder: 60,
    unlockedByDefault: true,
    staminaCost: 36,
    requiredState: 'dodging',
    bufferWindowMs: 320,
    maxRedirectDegrees: 40,
    recoveryMs: 480,
    unlockEventId: 'instinct_charge_awakened',
    damageType: DamageType.BODY,
    damage: 12,
    panicDuration: 0.62,
    action: Object.freeze({
      duration: 0.68,
      activeEndPhase: 0.76,
      movementDistance: 2.55,
      movementStartPhase: 0.18,
      movementEndPhase: 0.62,
      accelerationExponent: 1.72,
      stopOnBlocked: true
    }),
    contact: Object.freeze({
      contactBodyPart: 'chest_body_front',
      activePhaseStart: 0.24,
      activePhaseEnd: 0.66,
      contactShape: 'capsule',
      contactOffset: Object.freeze({ forward: 0.52, right: 0 }),
      contactSize: Object.freeze({ length: 1.18, width: 1.08 }),
      impactDirection: 'forward',
      impactStrength: 7.4,
      staggerStrength: 0.82
    })
  }),
  [AbilityId.DRAGONFIRE]: {
    id: AbilityId.DRAGONFIRE,
    inputAction: 'dragonfire',
    displayName: 'DRAGONFIRE',
    reviewOrder: 70,
    unlockedByDefault: false,
    lockedForFirstPlayable: true
  }
});

export function getAbilityDefinition(id) {
  return ABILITIES[id] ?? null;
}

export function getDefaultUnlockedAbilityIds() {
  return Object.values(ABILITIES)
    .filter((ability) => ability.unlockedByDefault === true)
    .map((ability) => ability.id);
}
