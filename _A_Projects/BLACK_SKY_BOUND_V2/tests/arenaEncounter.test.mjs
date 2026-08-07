import { readFile } from 'node:fs/promises';
import { assert, equal } from './assert.mjs';
import { AbilityId } from '../src/constants/abilityIds.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { ScenarioPhase } from '../src/constants/scenarioPhases.js';
import { getComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { arenaWaveSystem } from '../src/systems/arenaWaveSystem.js';
import { normalizeRuntimeMap } from '../src/world/runtimeMapLoader.js';

const payload = JSON.parse(await readFile(new URL('../data/maps/axiom-crown-of-cinders.runtime-map.json', import.meta.url), 'utf8'));
const map = normalizeRuntimeMap(payload);
const game = createInitialGameState(map);
const progression = getComponent(game.world, game.dragonId, ComponentType.AbilityProgression);

equal(map.arena.waves.length, 5, 'Axiom demo arena bake should expose five waves');
equal(game.unitSpawners.length, 0, 'future-wave spawner fixtures should not materialize before their wave');
assert(game.arena && game.arena.phase === 'countdown', 'arena runtime should begin with a fair countdown');
assertAbilities([AbilityId.MOVE, AbilityId.BITE_CLAW], 'arena should override saved progression with its authored starting loadout');

arenaWaveSystem({ game, dt: map.arena.startDelaySeconds });
equal(game.arena.activeWaveId, 'first_blood', 'countdown should activate the first authored wave');
equal(game.unitSpawners.length, 2, 'only the first wave spawners should materialize');
assert(game.unitSpawners.every((entry) => entry.fixtureEntityId), 'active spawners should have destroyable fixture entities');

const expectedRewards = [AbilityId.DODGE, AbilityId.BODY_LUNGE, AbilityId.SMOKE_BURST, AbilityId.CHARGE_COUNTER];
for (let waveIndex = 0; waveIndex < map.arena.waves.length; waveIndex += 1) {
  const activeWave = map.arena.waves[waveIndex];
  equal(game.arena.activeWaveId, activeWave.id, `wave ${waveIndex + 1} should activate in authored order`);
  const health = getComponent(game.world, game.dragonId, ComponentType.Health);
  health.hp = Math.max(1, health.maxHp - 30);
  for (const spawner of game.unitSpawners) {
    spawner.spawnedCount = spawner.limit;
    spawner.spawnedEntityIds = [];
  }
  arenaWaveSystem({ game, dt: 0 });
  if (waveIndex < expectedRewards.length) {
    equal(game.arena.phase, 'intermission', 'cleared non-final waves should provide a recovery intermission');
    assert(progression.unlockedAbilities.includes(expectedRewards[waveIndex]), `wave ${waveIndex + 1} should unlock ${expectedRewards[waveIndex]}`);
    equal(health.hp, health.maxHp - 6, 'wave recovery should restore the authored bounded health amount');
    assert(game.unitSpawners.every((entry) => entry.fixtureEntityId === null), 'cleared spawner fixtures should retire before the next wave');
    arenaWaveSystem({ game, dt: map.arena.intermissionSeconds });
  }
}

equal(game.arena.phase, 'complete', 'final wave should complete the arena encounter');
equal(game.status, ScenarioPhase.WON, 'final wave should complete the demo scenario');
equal(game.objectives[0].complete, true, 'demo objective should be marked complete');
assertAbilities([
  AbilityId.MOVE,
  AbilityId.BITE_CLAW,
  AbilityId.DODGE,
  AbilityId.BODY_LUNGE,
  AbilityId.SMOKE_BURST,
  AbilityId.CHARGE_COUNTER
], 'wave ladder should preserve all earned instincts while keeping fire locked');
assert(!progression.unlockedAbilities.includes(AbilityId.DRAGONFIRE), 'the demo should not leak later-game dragonfire progression');

function assertAbilities(expected, message) {
  equal([...progression.unlockedAbilities].sort().join('|'), [...expected].sort().join('|'), message);
}
