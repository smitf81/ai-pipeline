import { AbilityId } from '../constants/abilityIds.js';

export const AbilityUnlockEventId = Object.freeze({
  INSTINCT_SMOKE_AWAKENED: 'instinct_smoke_awakened',
  INSTINCT_CHARGE_AWAKENED: 'instinct_charge_awakened'
});

export const ABILITY_UNLOCK_EVENTS = Object.freeze({
  [AbilityUnlockEventId.INSTINCT_SMOKE_AWAKENED]: Object.freeze({
    id: AbilityUnlockEventId.INSTINCT_SMOKE_AWAKENED,
    grants: Object.freeze([AbilityId.SMOKE_BURST]),
    trigger: 'level_transition_instinct_scene',
    once: true,
    persistenceScope: 'run',
    presentation: 'smoke_instinct_v1'
  }),
  [AbilityUnlockEventId.INSTINCT_CHARGE_AWAKENED]: Object.freeze({
    id: AbilityUnlockEventId.INSTINCT_CHARGE_AWAKENED,
    grants: Object.freeze([AbilityId.CHARGE_COUNTER]),
    trigger: 'scenario_event',
    once: true,
    persistenceScope: 'player_profile',
    presentation: 'charge_instinct_v0'
  })
});

export function getAbilityUnlockEvent(id) {
  return ABILITY_UNLOCK_EVENTS[id] ?? null;
}
