import { ComponentType } from '../constants/componentTypes.js';
import { getAbilityDefinition } from '../data/abilities.js';
import { getAbilityUnlockEvent } from '../data/abilityUnlockEvents.js';
import { getInstinctDefinition } from '../data/instincts.js';
import { getComponent } from '../ecs/world.js';

export function canUseAbility(world, entity, abilityId) {
  if (!getAbilityDefinition(abilityId)) return false;
  const progression = getComponent(world, entity, ComponentType.AbilityProgression);
  return progression?.unlockedAbilities?.includes(abilityId) === true;
}

export function captureRunAbilityProgression(world, entity) {
  const progression = getComponent(world, entity, ComponentType.AbilityProgression);
  return progression ? {
    unlockedAbilities: [...progression.unlockedAbilities],
    consumedUnlockEvents: [...progression.consumedUnlockEvents],
    discoveredInstincts: [...(progression.discoveredInstincts ?? [])]
  } : null;
}

export function hydrateRunAbilityProgression(world, entity, snapshot) {
  const progression = getComponent(world, entity, ComponentType.AbilityProgression);
  if (!progression || !snapshot) return false;
  progression.unlockedAbilities = uniqueKnown(snapshot.unlockedAbilities, getAbilityDefinition);
  progression.consumedUnlockEvents = uniqueKnown(snapshot.consumedUnlockEvents, getAbilityUnlockEvent);
  progression.discoveredInstincts = uniqueKnown(snapshot.discoveredInstincts, getInstinctDefinition);
  return true;
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
    if (event.instinctId) discoverInstinct(progression, event.instinctId);
    return { ok: false, reason: 'unlock_event_already_consumed', grants: [] };
  }
  const grants = event.grants.filter((abilityId) => grantAbility(world, entity, abilityId, `unlock_event:${eventId}`));
  if (event.once) progression.consumedUnlockEvents.push(eventId);
  if (event.instinctId) discoverInstinct(progression, event.instinctId);
  const receipt = { ok: true, eventId, grants, presentation: event.presentation };
  progression.lastUnlockReceipt = receipt;
  return receipt;
}

export function applyFirstPlaythroughInstinctAvailability(world, entity, instinctIds, options = {}) {
  const progression = getComponent(world, entity, ComponentType.AbilityProgression);
  if (!progression || options.enabled === false) {
    return { ok: !!progression, applied: false, discoveredInstinctIds: [], grantedAbilityIds: [], deferredInstinctIds: [] };
  }
  const deferred = new Set(uniqueKnown(options.deferredInstinctIds, getInstinctDefinition));
  const discoveredInstinctIds = [];
  const grantedAbilityIds = [];
  const deferredInstinctIds = [];
  for (const instinctId of uniqueKnown(instinctIds, getInstinctDefinition)) {
    if (deferred.has(instinctId)) {
      deferredInstinctIds.push(instinctId);
      continue;
    }
    const definition = getInstinctDefinition(instinctId);
    const wasDiscovered = progression.discoveredInstincts?.includes(instinctId) === true;
    if (definition.unlockEventId) {
      const receipt = applyAbilityUnlockEvent(world, entity, definition.unlockEventId);
      if (receipt.ok) grantedAbilityIds.push(...receipt.grants);
    } else {
      discoverInstinct(progression, instinctId);
      for (const abilityId of definition.abilityIds) {
        const alreadyUnlocked = progression.unlockedAbilities.includes(abilityId);
        if (grantAbility(world, entity, abilityId, `first_playthrough_region:${instinctId}`) && !alreadyUnlocked) {
          grantedAbilityIds.push(abilityId);
        }
      }
    }
    if (!wasDiscovered && progression.discoveredInstincts.includes(instinctId)) discoveredInstinctIds.push(instinctId);
  }
  const applied = discoveredInstinctIds.length > 0 || grantedAbilityIds.length > 0;
  if (applied) progression.lastUnlockReceipt = {
    ok: true,
    source: options.source ?? 'first_playthrough_region',
    discoveredInstinctIds: [...discoveredInstinctIds],
    grants: [...new Set(grantedAbilityIds)]
  };
  return {
    ok: true,
    applied,
    discoveredInstinctIds,
    grantedAbilityIds: [...new Set(grantedAbilityIds)],
    deferredInstinctIds
  };
}

function discoverInstinct(progression, instinctId) {
  if (!getInstinctDefinition(instinctId)) return false;
  if (!Array.isArray(progression.discoveredInstincts)) progression.discoveredInstincts = [];
  if (progression.discoveredInstincts.includes(instinctId)) return false;
  progression.discoveredInstincts.push(instinctId);
  return true;
}

function uniqueKnown(values, resolver) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => resolver(value)))];
}
