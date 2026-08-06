import { AbilityId } from '../constants/abilityIds.js';
import { ComponentType } from '../constants/componentTypes.js';
import { getComponent } from '../ecs/world.js';

export const DEMO_ARENA_CONTRACT = 'black-sky-bound.demo-arena.v1';
export const DEMO_ARENA_STATE_CONTRACT = 'black-sky-bound.demo-arena-state.v1';

const KNOWN_ABILITIES = new Set(Object.values(AbilityId));

export function normalizeDemoArenaDefinition(source, spawners = []) {
  if (source == null) return null;
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('runtime_map_arena_invalid');
  if (source.contract !== DEMO_ARENA_CONTRACT) throw new Error(`runtime_map_arena_contract_invalid:${source.contract ?? 'missing'}`);
  const initialUnlockedAbilityIds = abilityIds(source.initialUnlockedAbilityIds, 'initialUnlockedAbilityIds');
  if (!initialUnlockedAbilityIds.includes(AbilityId.MOVE) || !initialUnlockedAbilityIds.includes(AbilityId.BITE_CLAW)) {
    throw new Error('runtime_map_arena_starting_actions_missing');
  }
  if (!Array.isArray(source.waves) || source.waves.length < 1 || source.waves.length > 12) {
    throw new Error('runtime_map_arena_waves_invalid');
  }
  const spawnerById = new Map(spawners.map((entry) => [entry.id, entry]));
  const usedSpawners = new Set();
  const usedRewards = new Set(initialUnlockedAbilityIds);
  const usedWaves = new Set();
  const waves = source.waves.map((wave, index) => {
    const id = identifier(wave?.id, `waves:${index}.id`);
    if (usedWaves.has(id)) throw new Error(`runtime_map_arena_wave_duplicate:${id}`);
    usedWaves.add(id);
    if (!Array.isArray(wave?.spawnerIds) || wave.spawnerIds.length === 0) throw new Error(`runtime_map_arena_wave_spawners_missing:${id}`);
    const spawnerIds = [...new Set(wave.spawnerIds.map((value, spawnerIndex) => identifier(value, `waves:${index}.spawnerIds:${spawnerIndex}`)))];
    for (const spawnerId of spawnerIds) {
      const spawner = spawnerById.get(spawnerId);
      if (!spawner) throw new Error(`runtime_map_arena_spawner_missing:${id}:${spawnerId}`);
      if (usedSpawners.has(spawnerId)) throw new Error(`runtime_map_arena_spawner_reused:${spawnerId}`);
      if (!(spawner.limit > 0)) throw new Error(`runtime_map_arena_spawner_limit_required:${spawnerId}`);
      usedSpawners.add(spawnerId);
    }
    const rewardAbilityId = wave.rewardAbilityId == null ? null : identifier(wave.rewardAbilityId, `waves:${index}.rewardAbilityId`);
    if (rewardAbilityId && !KNOWN_ABILITIES.has(rewardAbilityId)) throw new Error(`runtime_map_arena_ability_unknown:${rewardAbilityId}`);
    if (rewardAbilityId && usedRewards.has(rewardAbilityId)) throw new Error(`runtime_map_arena_reward_repeated:${rewardAbilityId}`);
    if (rewardAbilityId) usedRewards.add(rewardAbilityId);
    return {
      id,
      label: text(wave.label, `WAVE ${index + 1}`),
      spawnerIds,
      rewardAbilityId,
      rewardLabel: rewardAbilityId ? text(wave.rewardLabel, `INSTINCT AWAKENED · ${rewardAbilityId.replaceAll('_', ' ').toUpperCase()}`) : null
    };
  });
  if (usedSpawners.size !== spawners.length) {
    const unassigned = spawners.find((entry) => !usedSpawners.has(entry.id));
    throw new Error(`runtime_map_arena_spawner_unassigned:${unassigned?.id ?? 'unknown'}`);
  }
  return {
    contract: DEMO_ARENA_CONTRACT,
    initialUnlockedAbilityIds,
    startDelaySeconds: boundedNumber(source.startDelaySeconds, 2.5, 0, 30),
    intermissionSeconds: boundedNumber(source.intermissionSeconds, 4, 0.5, 30),
    recoveryPerWave: boundedNumber(source.recoveryPerWave, 20, 0, 999),
    waves,
    victoryMessage: text(source.victoryMessage, 'DEMO COMPLETE')
  };
}

export function createArenaEncounter(definition, spawnerBlueprints = []) {
  if (!definition) return null;
  const byId = Object.fromEntries(spawnerBlueprints.map((entry) => [entry.id, { ...entry }]));
  return {
    contract: DEMO_ARENA_STATE_CONTRACT,
    definition,
    spawnerBlueprints: byId,
    phase: 'countdown',
    waveIndex: -1,
    activeWaveId: null,
    completedWaveIds: [],
    timeRemaining: definition.startDelaySeconds,
    banner: 'THE CROWN OF CINDERS',
    bannerDetail: 'SURVIVE FIVE WAVES · AWAKEN YOUR INSTINCTS',
    bannerSeconds: Math.max(2.5, definition.startDelaySeconds),
    remainingThreats: 0,
    lastRewardAbilityId: null
  };
}

export function applyArenaStartingLoadout(world, dragonId, arena) {
  if (!arena) return false;
  const progression = getComponent(world, dragonId, ComponentType.AbilityProgression);
  if (!progression) return false;
  progression.unlockedAbilities = [...arena.definition.initialUnlockedAbilityIds];
  progression.consumedUnlockEvents = [];
  progression.lastUnlockReceipt = {
    source: 'demo_arena_starting_loadout',
    abilityIds: [...progression.unlockedAbilities]
  };
  return true;
}

function abilityIds(values, label) {
  if (!Array.isArray(values)) throw new Error(`runtime_map_arena_abilities_invalid:${label}`);
  const normalized = [...new Set(values.map((value, index) => identifier(value, `${label}:${index}`)))];
  const unknown = normalized.find((value) => !KNOWN_ABILITIES.has(value));
  if (unknown) throw new Error(`runtime_map_arena_ability_unknown:${unknown}`);
  return normalized;
}

function identifier(value, label) {
  const normalized = String(value ?? '').trim();
  if (!/^[a-z0-9][a-z0-9._:-]*$/i.test(normalized)) throw new Error(`runtime_map_arena_id_invalid:${label}`);
  return normalized;
}

function boundedNumber(value, fallback, min, max) {
  const numeric = value == null ? fallback : Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) throw new Error('runtime_map_arena_number_invalid');
  return Math.round(numeric * 1000) / 1000;
}

function text(value, fallback) {
  return String(value ?? '').trim() || fallback;
}
