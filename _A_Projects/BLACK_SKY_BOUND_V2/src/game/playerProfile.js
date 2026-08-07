import { ComponentType } from '../constants/componentTypes.js';
import { getAbilityDefinition, getDefaultUnlockedAbilityIds } from '../data/abilities.js';
import { getAbilityUnlockEvent } from '../data/abilityUnlockEvents.js';
import { normalizeAudioMix } from '../data/audio/audioTuning.js';
import { getComponent } from '../ecs/world.js';

export const PLAYER_PROFILE_SCHEMA = 'black-sky-bound.player-profile.v1';
export const PLAYER_PROFILE_STORAGE_KEY = 'black-sky-bound.player-profile.v1';
export const TutorialTimeSlowMode = Object.freeze({ ON: 'on', REDUCED: 'reduced', OFF: 'off' });

export function createDefaultPlayerProfile(options = {}) {
  return {
    schema: PLAYER_PROFILE_SCHEMA,
    profileId: options.profileId ?? 'local-player',
    progression: {
      unlockedAbilityIds: getDefaultUnlockedAbilityIds(),
      consumedUnlockEventIds: []
    },
    tutorial: {
      shownCueIds: [],
      completedCueIds: [],
      reviewableCueIds: []
    },
    settings: {
      tutorialPrompts: options.tutorialPrompts !== false,
      tutorialTimeSlow: normaliseTimeSlowMode(options.tutorialTimeSlow),
      reducedMotion: options.reducedMotion === true,
      audio: normalizeAudioMix(options.audio)
    },
    runs: {
      completedRuns: 0,
      newGamePlusCount: 0
    }
  };
}

export function normalizePlayerProfile(source = null, options = {}) {
  const base = createDefaultPlayerProfile(options);
  if (!source || typeof source !== 'object') return base;
  const consumedUnlockEventIds = uniqueStrings(source.progression?.consumedUnlockEventIds)
    .filter(isProfilePersistentUnlockEventId);
  const unlockedAbilityIds = uniqueStrings(source.progression?.unlockedAbilityIds, base.progression.unlockedAbilityIds)
    .filter(isProfilePersistentAbility)
    .filter((abilityId) => abilityHasRequiredReceipt(abilityId, consumedUnlockEventIds));
  return {
    schema: PLAYER_PROFILE_SCHEMA,
    profileId: typeof source.profileId === 'string' ? source.profileId : base.profileId,
    progression: {
      unlockedAbilityIds,
      consumedUnlockEventIds
    },
    tutorial: {
      shownCueIds: uniqueStrings(source.tutorial?.shownCueIds),
      completedCueIds: uniqueStrings(source.tutorial?.completedCueIds),
      reviewableCueIds: uniqueStrings(source.tutorial?.reviewableCueIds)
    },
    settings: {
      tutorialPrompts: source.settings?.tutorialPrompts !== false,
      tutorialTimeSlow: normaliseTimeSlowMode(source.settings?.tutorialTimeSlow),
      reducedMotion: source.settings?.reducedMotion === true || base.settings.reducedMotion,
      audio: normalizeAudioMix(source.settings?.audio)
    },
    runs: {
      completedRuns: boundedCount(source.runs?.completedRuns),
      newGamePlusCount: boundedCount(source.runs?.newGamePlusCount)
    }
  };
}

function abilityHasRequiredReceipt(abilityId, consumedUnlockEventIds) {
  const ability = getAbilityDefinition(abilityId);
  return ability?.requiresUnlockReceipt !== true || consumedUnlockEventIds.includes(ability.unlockEventId);
}

function isProfilePersistentAbility(abilityId) {
  const ability = getAbilityDefinition(abilityId);
  return ability?.unlockEventId == null || isProfilePersistentUnlockEventId(ability.unlockEventId);
}

function isProfilePersistentUnlockEventId(eventId) {
  return getAbilityUnlockEvent(eventId)?.persistenceScope !== 'run';
}

export function createPlayerProfileStore(storage = null, key = PLAYER_PROFILE_STORAGE_KEY) {
  let memory = null;
  return {
    key,
    load(options = {}) {
      try {
        const raw = storage?.getItem?.(key);
        if (raw) return normalizePlayerProfile(JSON.parse(raw), options);
      } catch {
        // Unavailable or corrupt browser storage falls back to an explicit in-memory profile.
      }
      return normalizePlayerProfile(memory, options);
    },
    save(profile) {
      const normalized = normalizePlayerProfile(profile);
      memory = normalized;
      try {
        storage?.setItem?.(key, JSON.stringify(normalized));
      } catch {
        // The in-memory copy remains authoritative for this app lifetime.
      }
      return normalized;
    }
  };
}

export function hydrateAbilityProgressionFromProfile(world, entity, profile) {
  const progression = getComponent(world, entity, ComponentType.AbilityProgression);
  if (!progression) return false;
  const normalized = normalizePlayerProfile(profile);
  progression.unlockedAbilities = [...normalized.progression.unlockedAbilityIds];
  progression.consumedUnlockEvents = [...normalized.progression.consumedUnlockEventIds];
  return true;
}

export function captureAbilityProgressionInProfile(world, entity, profile) {
  const progression = getComponent(world, entity, ComponentType.AbilityProgression);
  if (!progression) return normalizePlayerProfile(profile);
  const normalized = normalizePlayerProfile(profile);
  normalized.progression.unlockedAbilityIds = uniqueStrings(progression.unlockedAbilities)
    .filter(isProfilePersistentAbility);
  normalized.progression.consumedUnlockEventIds = uniqueStrings(progression.consumedUnlockEvents)
    .filter(isProfilePersistentUnlockEventId);
  return normalized;
}

export function markTutorialCueShown(profile, cueId) {
  const normalized = normalizePlayerProfile(profile);
  addUnique(normalized.tutorial.shownCueIds, cueId);
  addUnique(normalized.tutorial.reviewableCueIds, cueId);
  return normalized;
}

export function markTutorialCueCompleted(profile, cueId) {
  const normalized = markTutorialCueShown(profile, cueId);
  addUnique(normalized.tutorial.completedCueIds, cueId);
  return normalized;
}

export function markTutorialCueReviewable(profile, cueId) {
  const normalized = normalizePlayerProfile(profile);
  addUnique(normalized.tutorial.reviewableCueIds, cueId);
  return normalized;
}

export function updateTutorialSettings(profile, changes = {}) {
  const normalized = normalizePlayerProfile(profile);
  if (Object.hasOwn(changes, 'tutorialPrompts')) normalized.settings.tutorialPrompts = changes.tutorialPrompts !== false;
  if (Object.hasOwn(changes, 'tutorialTimeSlow')) normalized.settings.tutorialTimeSlow = normaliseTimeSlowMode(changes.tutorialTimeSlow);
  if (Object.hasOwn(changes, 'reducedMotion')) normalized.settings.reducedMotion = changes.reducedMotion === true;
  return normalized;
}

export function updateAudioSettings(profile, changes = {}) {
  const normalized = normalizePlayerProfile(profile);
  normalized.settings.audio = normalizeAudioMix({
    ...normalized.settings.audio,
    ...changes
  });
  return normalized;
}

export function startNewGamePlusProfile(profile) {
  const normalized = normalizePlayerProfile(profile);
  normalized.runs.completedRuns += 1;
  normalized.runs.newGamePlusCount += 1;
  return normalized;
}

function normaliseTimeSlowMode(value) {
  return Object.values(TutorialTimeSlowMode).includes(value) ? value : TutorialTimeSlowMode.ON;
}

function uniqueStrings(values, fallback = []) {
  const source = Array.isArray(values) ? values : fallback;
  return [...new Set(source.filter((value) => typeof value === 'string' && value.length > 0))];
}

function addUnique(target, value) {
  if (typeof value === 'string' && !target.includes(value)) target.push(value);
}

function boundedCount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}
