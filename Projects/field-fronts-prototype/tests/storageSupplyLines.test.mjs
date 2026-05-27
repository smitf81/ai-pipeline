import assert from 'node:assert/strict';

import {
  FIELD_FOOD_SUPPLY,
  GAME_TIME,
  advanceGameTick,
  createInitialGameState,
  placeStructureBuildOrder,
  recomputeGameState,
  validateStructurePlacement,
  spawnInfantrySquad
} from '../src/game/gameModel.js';
import { RESOURCE_IDS } from '../src/game/economy.js';
import { createStructureInstance } from '../src/game/structureRegistry.js';
import { createBlankMap } from '../src/world/mapModel.js';

export function run() {
  assertInitialOutpostsProvideStorageTransportsAndStarterStocks();
  assertNativeOutpostsProvideFoundationTrickle();
  assertWoodGatheringPostDoesNotNeedWoodToBuild();
  assertStorageTentAddsSharedCapacity();
  assertGameTimeUsesOneHourDays();
  assertSpawnedSquadStartsFullySuppliedAndDrainsSlowly();
  assertBlueprintReservesPaidWoodForBuilderWork();
  assertEnemyBlueprintReservesPaidWoodForBuilderWork();
  assertFoodTransportFeedsHungrySquad();
  assertEnemyTransportFeedsHungrySquad();
  assertStarvingSquadReturnsToOutpost();
}

function assertGameTimeUsesOneHourDays() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  assert.equal(game.time.dayLengthMs, GAME_TIME.dayLengthMs);
  assert.equal(game.time.ticksPerDay, GAME_TIME.dayLengthMs / GAME_TIME.tickDurationMs);
  assert.equal(game.time.clockLabel, '06:00');

  game.tick = game.time.ticksPerDay;
  recomputeGameState(game, map);
  assert.equal(game.time.day, 2);
  assert.equal(game.time.clockLabel, '06:00');
}

function assertSpawnedSquadStartsFullySuppliedAndDrainsSlowly() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  const spawn = spawnInfantrySquad(game, map, { factionId: 'player', select: false });
  assert.equal(spawn.ok, true);

  const fresh = game.squads.find((candidate) => candidate.id === spawn.squad.id);
  assert.equal(fresh.supply.food, FIELD_FOOD_SUPPLY.capacity);
  assert.equal(fresh.supply.status, 'ready');

  advanceTicks(game, map, 60);
  const later = game.squads.find((candidate) => candidate.id === spawn.squad.id);
  assert.equal(later.supply.status, 'supplied');
  assert.ok(later.supply.food > FIELD_FOOD_SUPPLY.capacity - 0.1);
}

function assertInitialOutpostsProvideStorageTransportsAndStarterStocks() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);

  assert.equal(game.economy.factions.player.storage.capacity, 180);
  assert.equal(game.economy.factions.enemy.storage.capacity, 180);
  assert.equal(game.economy.factions.player.stockpiles.supplies.amount, 0);
  assert.equal(game.economy.factions.player.stockpiles.gold.amount, 115);
  assert.equal(game.economy.factions.player.stockpiles.food.amount, 36);
  assert.equal(game.economy.factions.player.stockpiles.wood.amount, 32);
  assert.equal(game.economy.factions.player.stockpiles.population.amount, 10);
  assert.equal(game.economy.factions.enemy.stockpiles.supplies.amount, 0);
  assert.equal(game.economy.factions.enemy.stockpiles.gold.amount, 115);
  assert.equal(game.economy.factions.enemy.stockpiles.food.amount, 36);
  assert.equal(game.economy.factions.enemy.stockpiles.wood.amount, 32);
  assert.equal(game.economy.factions.enemy.stockpiles.population.amount, 10);
  assert.equal(game.transports.filter((transport) => transport.factionId === 'player').length, 2);
  assert.equal(game.transports.filter((transport) => transport.factionId === 'enemy').length, 2);
  assert.equal(game.resourceWorkers.filter((worker) => worker.homeStructureId?.startsWith('structure_outpost_')).length, 2);
}

function assertNativeOutpostsProvideFoundationTrickle() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  const playerFoodBefore = game.economy.factions.player.stockpiles[RESOURCE_IDS.food].amount;
  const playerWoodBefore = game.economy.factions.player.stockpiles[RESOURCE_IDS.wood].amount;
  const enemyFoodBefore = game.economy.factions.enemy.stockpiles[RESOURCE_IDS.food].amount;
  const enemyWoodBefore = game.economy.factions.enemy.stockpiles[RESOURCE_IDS.wood].amount;

  advanceGameTick(game, map);

  assert.ok(game.economy.factions.player.stockpiles[RESOURCE_IDS.food].amount > playerFoodBefore);
  assert.ok(game.economy.factions.player.stockpiles[RESOURCE_IDS.wood].amount > playerWoodBefore);
  assert.ok(game.economy.factions.enemy.stockpiles[RESOURCE_IDS.food].amount > enemyFoodBefore);
  assert.ok(game.economy.factions.enemy.stockpiles[RESOURCE_IDS.wood].amount > enemyWoodBefore);
  assert.ok(game.economy.factions.player.lastIncome[RESOURCE_IDS.food].sources.some((source) => source.kind === 'outpost-native-trickle'));
  assert.ok(game.economy.factions.player.lastIncome[RESOURCE_IDS.wood].sources.some((source) => source.kind === 'outpost-native-trickle'));
}

function assertWoodGatheringPostDoesNotNeedWoodToBuild() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  grantResource(game, 'player', RESOURCE_IDS.wood, 0);
  grantSupplies(game, 'player', 120);

  const build = placeStructureBuildOrder(game, map, {
    type: 'wood_gathering_post',
    factionId: 'player',
    position: { x: 9, y: 15 }
  });
  assert.equal(build.ok, true);

  advanceTicksUntil(game, map, () => game.constructionJobs[0]?.progress > 0, 30);
  assert.equal(game.constructionJobs[0].progress > 0, true);
  assert.notEqual(game.constructionJobs[0].resourceBlocker, RESOURCE_IDS.wood);
  assert.equal(game.constructionJobs[0].deliveredResources[RESOURCE_IDS.wood], 0);
}

function assertStorageTentAddsSharedCapacity() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);

  game.structures.push(createStructureInstance('storage_tent', {
    id: 'structure_storage_player_test',
    factionId: 'player',
    tile: { x: 8, y: 15 },
    construction: { state: 'complete', progress: 1 }
  }));
  recomputeGameState(game, map);

  assert.equal(game.economy.factions.player.storage.capacity, 320);
  assert.equal(game.transports.filter((transport) => transport.factionId === 'player').length, 3);
}

function assertBlueprintReservesPaidWoodForBuilderWork() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  grantSupplies(game, 'player', 100);

  const build = placeStructureBuildOrder(game, map, {
    type: 'wall_segment',
    factionId: 'player',
    position: { x: 9, y: 15 }
  });
  assert.equal(build.ok, true);

  advanceTicksUntil(game, map, () => game.constructionJobs[0]?.progress > 0, 20);
  assert.equal(game.constructionJobs[0].progress > 0, true);
  assert.equal(game.constructionJobs[0].resourceBlocker, null);
  assert.equal(game.constructionJobs[0].deliveredResources[RESOURCE_IDS.wood] >= 0, true);
}

function assertEnemyBlueprintReservesPaidWoodForBuilderWork() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  game.enemyAI = { ...game.enemyAI, buildCooldownUntil: 9999, attackThreshold: 99 };
  grantSupplies(game, 'enemy', 100);

  const position = findValidBuildPosition(game, map, 'wall_segment', 'enemy');
  const build = placeStructureBuildOrder(game, map, {
    type: 'wall_segment',
    factionId: 'enemy',
    position
  });
  assert.equal(build.ok, true);
  const jobId = build.job.id;

  advanceTicksUntil(game, map, () => game.constructionJobs.find((job) => job.id === jobId)?.progress > 0, 30);
  const progressedJob = game.constructionJobs.find((job) => job.id === jobId);
  assert.equal(progressedJob.progress > 0, true);
  assert.equal(progressedJob.resourceBlocker, null);
}

function assertFoodTransportFeedsHungrySquad() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  const spawn = spawnInfantrySquad(game, map, { factionId: 'player', select: false });
  assert.equal(spawn.ok, true);
  grantResource(game, 'player', RESOURCE_IDS.food, 30);

  game.squads = game.squads.map((squad) => (
    squad.id === spawn.squad.id
      ? { ...squad, supply: { ...squad.supply, food: 3, starvingTicks: 0 } }
      : squad
  ));

  advanceTicksUntil(game, map, () => {
    const squad = game.squads.find((candidate) => candidate.id === spawn.squad.id);
    return (squad?.supply?.food ?? 0) > 3;
  }, 40);

  const fedSquad = game.squads.find((candidate) => candidate.id === spawn.squad.id);
  assert.equal(fedSquad.supply.food > 3, true);
  assert.equal(game.transports.some((transport) => transport.lastDeliveryAmount > 0), true);
}

function assertEnemyTransportFeedsHungrySquad() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  game.enemyAI = { ...game.enemyAI, buildCooldownUntil: 9999, attackThreshold: 99 };
  const spawn = spawnInfantrySquad(game, map, { factionId: 'enemy', select: false });
  assert.equal(spawn.ok, true);
  grantResource(game, 'enemy', RESOURCE_IDS.food, 30);

  game.squads = game.squads.map((squad) => (
    squad.id === spawn.squad.id
      ? { ...squad, supply: { ...squad.supply, food: 3, starvingTicks: 0 } }
      : squad
  ));

  advanceTicksUntil(game, map, () => {
    const squad = game.squads.find((candidate) => candidate.id === spawn.squad.id);
    return (squad?.supply?.food ?? 0) > 3;
  }, 40);

  const fedSquad = game.squads.find((candidate) => candidate.id === spawn.squad.id);
  assert.equal(fedSquad.supply.food > 3, true);
  assert.equal(game.transports.some((transport) => transport.factionId === 'enemy' && transport.lastDeliveryAmount > 0), true);
}

function assertStarvingSquadReturnsToOutpost() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  const spawn = spawnInfantrySquad(game, map, { factionId: 'player', select: false });
  assert.equal(spawn.ok, true);

  game.squads = game.squads.map((squad) => (
    squad.id === spawn.squad.id
      ? { ...squad, supply: { ...squad.supply, food: 0, starvingTicks: FIELD_FOOD_SUPPLY.starvationRetreatTicks - 1 } }
      : squad
  ));

  advanceGameTick(game, map);
  const squad = game.squads.find((candidate) => candidate.id === spawn.squad.id);
  assert.equal(squad.behavior.intent, 'return-for-food');
  assert.equal(squad.movementOrder?.routeMode, 'ai-director');
}

function advanceTicks(game, map, ticks) {
  for (let index = 0; index < ticks; index += 1) {
    advanceGameTick(game, map);
  }
}

function advanceTicksUntil(game, map, predicate, limit) {
  for (let index = 0; index < limit; index += 1) {
    advanceGameTick(game, map);
    if (predicate()) {
      return;
    }
  }
}

function grantSupplies(game, factionId, amount) {
  grantResource(game, factionId, RESOURCE_IDS.supplies, amount);
  grantResource(game, factionId, RESOURCE_IDS.gold, amount);
  grantResource(game, factionId, RESOURCE_IDS.food, amount);
  grantResource(game, factionId, RESOURCE_IDS.wood, amount);
  grantResource(game, factionId, RESOURCE_IDS.population, amount);
}

function grantResource(game, factionId, resourceId, amount) {
  const rounded = round3(amount);
  game.economy.factions[factionId].stockpiles[resourceId] = {
    resourceId,
    amount: rounded,
    components: { [resourceId]: rounded }
  };
}

function findValidBuildPosition(game, map, type, factionId) {
  const base = game.structures.find((structure) => structure.factionId === factionId && structure.type === 'outpost');
  const origin = base?.position ?? base?.tile ?? { x: 8, y: 8 };
  for (let radius = 2; radius <= 8; radius += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const position = { x: Math.round(origin.x + dx), y: Math.round(origin.y + dy) };
        if (validateStructurePlacement(game, map, { type, factionId, position }).valid) {
          return position;
        }
      }
    }
  }
  assert.fail(`Expected valid ${factionId} ${type} build position`);
}

function round3(value) {
  return Math.round(Number(value) * 1000) / 1000;
}
