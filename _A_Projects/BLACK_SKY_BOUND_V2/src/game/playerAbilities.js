import { ComponentType } from '../constants/componentTypes.js';
import { getAbilityDefinition } from '../data/abilities.js';
import { getAbilityUnlockEvent } from '../data/abilityUnlockEvents.js';
import { getComponent } from '../ecs/world.js';

export function canUseAbility(world, entity, abilityId) {
  if (!getAbilityDefinition(abilityId)) return false;
  const progression = getComponent(world, entity, ComponentType.AbilityProgression);
  return progression?.unlockedAbilities?.includes(abilityId) === true;
}

export function grantAbility(world, entity, abilityId, source = 'direct_grant') {
  const progression = getComponent(world, entity, ComponentType.AbilityProgression);
  if (!progression || !getAbilityDefinition(abilityId)) return false;
  if (!progression.unlockedAbilities.includes(abilityId)) progression.unlockedAbilities.push(abilityId);
  progression.lastUnlockReceipt = { abilityId, source };
  return true;
}

export function applyAbilityUnlockEvent(world, entity, eventId) {
  const progression = getComponent(world, entity, ComponentType.AbilityProgression);
  const event = getAbilityUnlockEvent(eventId);
  if (!progression || !event) return { ok: false, reason: 'unknown_unlock_event', grants: [] };
  if (event.once && progression.consumedUnlockEvents.includes(eventId)) {
    return { ok: false, reason: 'unlock_event_already_consumed', grants: [] };
  }
  const grants = event.grants.filter((abilityId) => grantAbility(world, entity, abilityId, `unlock_event:${eventId}`));
  if (event.once) progression.consumedUnlockEvents.push(eventId);
  const receipt = { ok: true, eventId, grants, presentation: event.presentation };
  progression.lastUnlockReceipt = receipt;
  return receipt;
}
