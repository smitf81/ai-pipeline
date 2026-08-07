import { ComponentType } from '../constants/componentTypes.js';
import { EventType } from '../constants/eventTypes.js';
import { ScenarioPhase } from '../constants/scenarioPhases.js';
import { emitEvent } from '../ecs/events.js';
import { getComponent, removeEntity } from '../ecs/world.js';
import { grantAbility } from '../game/playerAbilities.js';
import { createRuntimeUnitSpawners } from '../game/unitSpawners.js';

export function arenaWaveSystem({ game, dt }) {
  const arena = game?.arena;
  if (!arena || arena.phase === 'complete') return;
  arena.bannerSeconds = Math.max(0, arena.bannerSeconds - dt);
  if (arena.phase === 'countdown' || arena.phase === 'intermission') {
    arena.timeRemaining = Math.max(0, arena.timeRemaining - dt);
    if (arena.timeRemaining <= 0) activateWave(game, arena.waveIndex + 1);
    return;
  }
  if (arena.phase !== 'active') return;
  arena.remainingThreats = countRemainingThreats(game.unitSpawners);
  if (!game.unitSpawners.every(spawnerComplete)) return;
  completeWave(game);
}

export function activateWave(game, waveIndex) {
  const arena = game.arena;
  const wave = arena?.definition.waves[waveIndex];
  if (!wave) return false;
  const blueprints = wave.spawnerIds.map((id) => arena.spawnerBlueprints[id]);
  if (blueprints.some((entry) => !entry)) throw new Error(`demo_arena_wave_blueprint_missing:${wave.id}`);
  game.unitSpawners = createRuntimeUnitSpawners(blueprints, game.world);
  arena.phase = 'active';
  arena.waveIndex = waveIndex;
  arena.activeWaveId = wave.id;
  arena.timeRemaining = 0;
  arena.banner = wave.label;
  arena.bannerDetail = `${waveIndex + 1} OF ${arena.definition.waves.length} · BREAK THE SPAWNERS`;
  arena.bannerSeconds = 3.2;
  arena.remainingThreats = countRemainingThreats(game.unitSpawners);
  game.message = wave.label;
  if (game.objectives?.[0]) game.objectives[0].text = `${wave.label} · destroy the spawners and survive`;
  return true;
}

function completeWave(game) {
  const arena = game.arena;
  const wave = arena.definition.waves[arena.waveIndex];
  retireSpawnerFixtures(game);
  arena.completedWaveIds.push(wave.id);
  arena.activeWaveId = null;
  arena.remainingThreats = 0;
  recoverPlayer(game, arena.definition.recoveryPerWave);
  if (wave.rewardAbilityId) {
    grantAbility(game.world, game.dragonId, wave.rewardAbilityId, `demo_arena_wave:${wave.id}`);
    arena.lastRewardAbilityId = wave.rewardAbilityId;
  }
  const finalWave = arena.waveIndex >= arena.definition.waves.length - 1;
  if (finalWave) {
    arena.phase = 'complete';
    arena.banner = arena.definition.victoryMessage;
    arena.bannerDetail = 'THANK YOU FOR PLAYTESTING BLACK SKY BOUND';
    arena.bannerSeconds = 12;
    game.status = ScenarioPhase.WON;
    game.message = arena.definition.victoryMessage;
    if (game.objectives?.[0]) game.objectives[0].complete = true;
    emitEvent(game.world, EventType.SCENARIO_COMPLETED, { objective: 'hold_the_crown', waveId: wave.id });
    return;
  }
  arena.phase = 'intermission';
  arena.timeRemaining = arena.definition.intermissionSeconds;
  arena.banner = wave.rewardLabel ?? `${wave.label} CLEARED`;
  arena.bannerDetail = `RECOVER · NEXT WAVE IN ${Math.ceil(arena.timeRemaining)}`;
  arena.bannerSeconds = arena.definition.intermissionSeconds;
  game.message = wave.rewardLabel ?? `${wave.label} cleared`;
  if (game.objectives?.[0]) game.objectives[0].text = `Recover · wave ${arena.waveIndex + 2} approaches`;
}

function retireSpawnerFixtures(game) {
  for (const spawner of game.unitSpawners ?? []) {
    spawner.enabled = false;
    if (spawner.fixtureEntityId && game.world.entities.has(spawner.fixtureEntityId)) {
      removeEntity(game.world, spawner.fixtureEntityId);
    }
    spawner.fixtureEntityId = null;
  }
}

function recoverPlayer(game, amount) {
  const health = getComponent(game.world, game.dragonId, ComponentType.Health);
  if (health?.alive) health.hp = Math.min(health.maxHp, health.hp + amount);
  const stamina = getComponent(game.world, game.dragonId, ComponentType.Stamina);
  if (stamina) {
    stamina.current = stamina.max;
    stamina.exhausted = false;
    stamina.state = 'ready';
    stamina.recoveryTimer = 0;
  }
}

function spawnerComplete(spawner) {
  const liveCount = spawner.spawnedEntityIds?.length ?? 0;
  return liveCount === 0 && (spawner.destroyed === true || (spawner.limit > 0 && spawner.spawnedCount >= spawner.limit));
}

function countRemainingThreats(spawners = []) {
  return spawners.reduce((total, spawner) => {
    const alive = spawner.spawnedEntityIds?.length ?? 0;
    const queued = spawner.destroyed === true ? 0 : Math.max(0, (spawner.limit ?? 0) - (spawner.spawnedCount ?? 0));
    return total + alive + queued;
  }, 0);
}
