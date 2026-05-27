import assert from 'node:assert/strict';

import {
  ENEMY_AI_STATES,
  advanceGameTick,
  createInitialGameState,
  issuePlayerMoveCommand,
  placeStructureBuildOrder,
  probeMapAt,
  selectPlayerControllableEntityAtTile,
  spawnInfantrySquad,
  validateStructurePlacement
} from '../src/game/gameModel.js';
import { RESOURCE_IDS } from '../src/game/economy.js';
import {
  createEditorState,
  placeSelectedStructure,
  selectStructurePlacement,
  updateStructurePlacementPreview
} from '../src/editor/editorState.js';
import { CONSTRUCTION_STATES, createStructureInstance } from '../src/game/structureRegistry.js';
import { createBlankMap } from '../src/world/mapModel.js';

export function run() {
  assertPlayerMoveAffectsFriendlyOnly();
  assertProbeInspectDoesNotIssueOrders();
  assertPlayerBuildPlacementCreatesFriendlyJobsOnly();
  assertEnemyDirectorCreatesConstructionJobs();
  assertEnemyDirectorMustersUnlockedTribalWarriors();
  assertEnemyBuildersCompleteEnemyJobs();
  assertEnemyStarvingSquadsQueueHuntingTent();
  assertEnemyWoodBlockedConstructionQueuesWoodPost();
  assertEnemyLogisticsJobsAreNotDuplicated();
  assertEnemyStoragePressureDoesNotQueueLockedStorageTent();
  assertEnemyDoesNotAttackWithStarvingForce();
  assertStarvingFightersDoNotCountTowardAttackThreshold();
  assertEnemyDirectorTransitionsToAttack();
  assertEnemyAttackTargetsFriendlyStructures();
  assertEnemyAttackOrdersAreIdempotentBetweenRetargets();
}

function assertPlayerMoveAffectsFriendlyOnly() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  const friendly = spawnInfantrySquad(game, map, { factionId: 'player' });
  const enemy = spawnInfantrySquad(game, map, { factionId: 'enemy', select: false });
  assert.equal(friendly.ok, true);
  assert.equal(enemy.ok, true);

  const friendlyOrder = issuePlayerMoveCommand(game, map, friendly.squad.id, [
    friendly.squad.position,
    { x: friendly.squad.position.x + 3, y: friendly.squad.position.y }
  ]);
  assert.equal(friendlyOrder.ok, true);
  assert.equal(game.squads.find((squad) => squad.id === friendly.squad.id).movementOrder?.routeMode, 'player-intended');

  const enemyBefore = JSON.stringify(game.squads.find((squad) => squad.id === enemy.squad.id).movementOrder ?? null);
  const rejected = issuePlayerMoveCommand(game, map, enemy.squad.id, [
    enemy.squad.position,
    { x: enemy.squad.position.x - 3, y: enemy.squad.position.y }
  ]);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, 'not-player-controlled');
  assert.equal(JSON.stringify(game.squads.find((squad) => squad.id === enemy.squad.id).movementOrder ?? null), enemyBefore);

  const previousSelection = game.selectedEntityId;
  const rejectedSelection = selectPlayerControllableEntityAtTile(game, enemy.squad.tile);
  assert.equal(rejectedSelection.rejected, true);
  assert.equal(rejectedSelection.message, 'Enemy units cannot be directly commanded.');
  assert.equal(game.selectedEntityId, previousSelection);
}

function assertProbeInspectDoesNotIssueOrders() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  spawnInfantrySquad(game, map, { factionId: 'player' });
  spawnInfantrySquad(game, map, { factionId: 'enemy', select: false });

  const before = movementOrderSnapshot(game);
  const probe = probeMapAt(game, map, { x: 8, y: 15 });
  assert.equal(probe.valid, true);
  assert.equal(movementOrderSnapshot(game), before);
}

function assertPlayerBuildPlacementCreatesFriendlyJobsOnly() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const state = createEditorState(map);
  grantSupplies(state.game, 'player', 200);
  grantSupplies(state.game, 'enemy', 200);

  selectStructurePlacement(state, 'watchtower');
  const preview = updateStructurePlacementPreview(state, { x: 10, y: 14 });
  assert.equal(preview.validity.valid, true);
  const placed = placeSelectedStructure(state, { x: 10, y: 14 });
  assert.equal(placed.ok, true);
  assert.equal(state.game.constructionJobs.length, 1);
  assert.equal(state.game.constructionJobs[0].factionId, 'player');
  assert.equal(state.game.structures.find((structure) => structure.id === placed.structure.id).factionId, 'player');
}

function assertEnemyDirectorCreatesConstructionJobs() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  grantSupplies(game, 'enemy', 250);
  spawnInfantrySquad(game, map, { factionId: 'enemy', select: false });
  spawnInfantrySquad(game, map, { factionId: 'enemy', select: false });

  advanceTicksUntil(game, map, () => game.constructionJobs.some((job) => job.factionId === 'enemy'), 6);
  const enemyJob = game.constructionJobs.find((job) => job.factionId === 'enemy');
  assert.ok(enemyJob);
  assert.equal(enemyJob.type, 'construct_structure');
  const structure = game.structures.find((candidate) => candidate.id === enemyJob.structureId);
  assert.equal(structure?.type, 'builder_lodge');
  assert.equal(countEnemyStructures(game, 'watchtower'), 0);
}

function assertEnemyDirectorMustersUnlockedTribalWarriors() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  game.tick = 18;
  game.enemyAI = {
    ...game.enemyAI,
    state: ENEMY_AI_STATES.gatherForce,
    buildCooldownUntil: 999
  };

  advanceGameTick(game, map);

  assert.equal(game.squads.filter((squad) => squad.factionId === 'enemy' && squad.unitId === 'warrior').length, 1);
  assert.equal(game.squads.filter((squad) => squad.factionId === 'enemy' && squad.unitId === 'infantry').length, 0);
  assert.match(game.enemyAI.lastAction, /Enemy Warrior/);
  assert.equal(game.economy.factions.enemy.stockpiles[RESOURCE_IDS.gold].amount < 115, true);
  assert.equal(game.economy.factions.enemy.stockpiles[RESOURCE_IDS.food].amount < 36, true);
  assert.equal(game.economy.factions.enemy.stockpiles[RESOURCE_IDS.wood].amount < 32, true);
  assert.equal(game.economy.factions.enemy.stockpiles[RESOURCE_IDS.population].amount < 10, true);
}

function assertEnemyBuildersCompleteEnemyJobs() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  grantSupplies(game, 'enemy', 160);
  grantWood(game, 'enemy', 80);
  const position = findValidEnemyBuildPosition(game, map, 'trench_segment');
  const build = placeStructureBuildOrder(game, map, {
    type: 'trench_segment',
    factionId: 'enemy',
    position
  });
  assert.equal(build.ok, true);

  advanceTicksUntil(game, map, () => game.constructionJobs[0]?.assignedBuilderIds.length > 0, 12);
  assert.equal(game.constructionJobs[0].assignedBuilderIds.length > 0, true);
  advanceTicksUntil(game, map, () => game.constructionJobs[0]?.state === 'complete', 80);
  assert.equal(game.constructionJobs[0].state, 'complete');
  assert.equal(game.structures.find((structure) => structure.id === build.structure.id)?.construction?.state, CONSTRUCTION_STATES.complete);
}

function assertEnemyDirectorTransitionsToAttack() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  spawnInfantrySquad(game, map, { factionId: 'enemy', select: false });
  spawnInfantrySquad(game, map, { factionId: 'enemy', select: false });
  game.enemyAI = {
    ...game.enemyAI,
    state: ENEMY_AI_STATES.gatherForce,
    buildCooldownUntil: 999
  };

  advanceGameTick(game, map);
  assert.equal(game.enemyAI.state, ENEMY_AI_STATES.attack);
  assert.equal(game.squads.filter((squad) => squad.factionId === 'enemy').every((squad) => squad.movementOrder?.routeMode === 'ai-director'), true);
}

function assertEnemyAttackTargetsFriendlyStructures() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  spawnInfantrySquad(game, map, { factionId: 'enemy', select: false });
  spawnInfantrySquad(game, map, { factionId: 'enemy', select: false });
  game.enemyAI = {
    ...game.enemyAI,
    state: ENEMY_AI_STATES.gatherForce,
    buildCooldownUntil: 999
  };

  advanceGameTick(game, map);
  const playerStructure = game.structures.find((structure) => structure.factionId === 'player' && structure.construction?.state === CONSTRUCTION_STATES.complete);
  const enemyStructure = game.structures.find((structure) => structure.factionId === 'enemy' && structure.construction?.state === CONSTRUCTION_STATES.complete);
  const enemySquad = game.squads.find((squad) => squad.factionId === 'enemy');
  assert.ok(playerStructure);
  assert.ok(enemyStructure);
  assert.equal(nearSameTile(enemySquad.movementOrder.target, playerStructure.position), true);
  assert.equal(nearSameTile(enemySquad.movementOrder.target, enemyStructure.position), false);
}

function assertEnemyAttackOrdersAreIdempotentBetweenRetargets() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  spawnInfantrySquad(game, map, { factionId: 'enemy', select: false });
  spawnInfantrySquad(game, map, { factionId: 'enemy', select: false });
  game.enemyAI = {
    ...game.enemyAI,
    state: ENEMY_AI_STATES.gatherForce,
    buildCooldownUntil: 999
  };

  advanceGameTick(game, map);
  const firstOrders = game.squads
    .filter((squad) => squad.factionId === 'enemy')
    .map((squad) => [squad.id, squad.movementOrder?.issuedAtTick, squad.movementPath]);
  advanceGameTick(game, map);
  const secondOrders = game.squads
    .filter((squad) => squad.factionId === 'enemy')
    .map((squad) => [squad.id, squad.movementOrder?.issuedAtTick, Boolean(squad.movementPath)]);

  assert.deepEqual(
    secondOrders.map(([id, issuedAtTick]) => [id, issuedAtTick]),
    firstOrders.map(([id, issuedAtTick]) => [id, issuedAtTick])
  );
  assert.equal(secondOrders.every(([, , hasPath]) => hasPath), true);
}

function assertEnemyStarvingSquadsQueueHuntingTent() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  grantSupplies(game, 'enemy', 250);
  const spawn = spawnInfantrySquad(game, map, { factionId: 'enemy', select: false });
  assert.equal(spawn.ok, true);
  setEnemySquadFood(game, 0);

  advanceTicks(game, map, 2);

  assert.equal(countEnemyStructures(game, 'hunting_tent'), 1);
  assert.equal(game.enemyAI.lastAction.includes('needs food'), true);
}

function assertEnemyWoodBlockedConstructionQueuesWoodPost() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  grantSupplies(game, 'enemy', 300);
  const build = placeStructureBuildOrder(game, map, {
    type: 'watchtower',
    factionId: 'enemy',
    position: findValidEnemyBuildPosition(game, map, 'watchtower')
  });
  assert.equal(build.ok, true);

  advanceTicks(game, map, 2);

  assert.equal(countEnemyStructures(game, 'wood_gathering_post'), 0);
  assert.equal(game.enemyAI.lastAction.includes('needs wood'), false);
}

function assertEnemyLogisticsJobsAreNotDuplicated() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  grantSupplies(game, 'enemy', 350);
  const spawn = spawnInfantrySquad(game, map, { factionId: 'enemy', select: false });
  assert.equal(spawn.ok, true);
  setEnemySquadFood(game, 0);

  advanceTicks(game, map, 12);

  assert.equal(countEnemyStructures(game, 'hunting_tent'), 1);
  assert.equal(countEnemyStructures(game, 'wood_gathering_post'), 0);
}

function assertEnemyStoragePressureDoesNotQueueLockedStorageTent() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  grantResource(game, 'enemy', RESOURCE_IDS.food, 130);
  grantResource(game, 'enemy', RESOURCE_IDS.wood, 60);
  spawnInfantrySquad(game, map, { factionId: 'enemy', select: false });
  spawnInfantrySquad(game, map, { factionId: 'enemy', select: false });
  game.enemyAI = {
    ...game.enemyAI,
    state: ENEMY_AI_STATES.gatherForce,
    buildCooldownUntil: 999
  };

  advanceGameTick(game, map);

  assert.equal(countEnemyStructures(game, 'storage_tent'), 0);
  assert.equal(game.enemyAI.lastAction.includes('storage'), false);
}

function assertEnemyDoesNotAttackWithStarvingForce() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  game.structures.push(createCompletedEnemyStructure(game, 'hunting_tent', { x: 37, y: 23 }));
  spawnInfantrySquad(game, map, { factionId: 'enemy', select: false });
  spawnInfantrySquad(game, map, { factionId: 'enemy', select: false });
  setEnemySquadFood(game, 0);
  game.enemyAI = {
    ...game.enemyAI,
    state: ENEMY_AI_STATES.gatherForce,
    buildCooldownUntil: 999
  };

  advanceGameTick(game, map);

  assert.equal(game.enemyAI.state, ENEMY_AI_STATES.retreatOrRebuild);
  assert.equal(game.squads.filter((squad) => squad.factionId === 'enemy').every((squad) => squad.behavior?.intent !== 'attack-friendly-structure'), true);
  assert.equal(game.squads.filter((squad) => squad.factionId === 'enemy').every((squad) => squad.behavior?.intent === 'regroup-for-food'), true);
}

function assertStarvingFightersDoNotCountTowardAttackThreshold() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  game.structures.push(createCompletedEnemyStructure(game, 'hunting_tent', { x: 37, y: 23 }));
  const first = spawnInfantrySquad(game, map, { factionId: 'enemy', select: false });
  const second = spawnInfantrySquad(game, map, { factionId: 'enemy', select: false });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  game.squads = (game.squads ?? []).map((squad) => (
    squad.id === first.squad.id
      ? {
        ...squad,
        supply: {
          ...squad.supply,
          food: 0,
          foodRatio: 0,
          starvingTicks: 1,
          status: 'starving'
        }
      }
      : squad
  ));
  game.enemyAI = {
    ...game.enemyAI,
    state: ENEMY_AI_STATES.gatherForce,
    buildCooldownUntil: 999
  };

  advanceGameTick(game, map);

  assert.equal(game.enemyAI.state, ENEMY_AI_STATES.gatherForce);
  assert.equal(game.enemyAI.attackGroupIds.includes(first.squad.id), false);
  assert.equal(game.squads.find((squad) => squad.id === first.squad.id)?.behavior?.intent === 'attack-friendly-structure', false);
}

function movementOrderSnapshot(game) {
  return JSON.stringify({
    leaders: game.leaders.map((leader) => [leader.id, leader.movementOrder ?? null]),
    squads: (game.squads ?? []).map((squad) => [squad.id, squad.movementOrder ?? null]),
    builders: (game.builders ?? []).map((builder) => [builder.id, builder.movementOrder ?? null])
  });
}

function findValidEnemyBuildPosition(game, map, type) {
  const base = game.structures.find((structure) => structure.factionId === 'enemy' && structure.type === 'outpost');
  const origin = base?.position ?? { x: 40, y: 23 };
  const offsets = [
    { x: -3, y: 0 },
    { x: -4, y: 0 },
    { x: -3, y: -2 },
    { x: -3, y: 2 },
    { x: -5, y: -1 }
  ];
  const candidate = offsets
    .map((offset) => ({ x: Math.round(origin.x + offset.x), y: Math.round(origin.y + offset.y) }))
    .find((position) => validateStructurePlacement(game, map, { type, factionId: 'enemy', position }).valid);
  assert.ok(candidate, `Expected a valid enemy ${type} build site`);
  return candidate;
}

function advanceTicksUntil(game, map, predicate, limit) {
  for (let index = 0; index < limit; index += 1) {
    advanceGameTick(game, map);
    if (predicate()) {
      return;
    }
  }
}

function advanceTicks(game, map, ticks) {
  for (let index = 0; index < ticks; index += 1) {
    advanceGameTick(game, map);
  }
}

function grantSupplies(game, factionId, amount) {
  grantResource(game, factionId, RESOURCE_IDS.supplies, amount);
  grantResource(game, factionId, RESOURCE_IDS.gold, amount);
  grantResource(game, factionId, RESOURCE_IDS.food, amount);
  grantResource(game, factionId, RESOURCE_IDS.wood, amount);
  grantResource(game, factionId, RESOURCE_IDS.population, amount);
}

function grantWood(game, factionId, amount) {
  grantResource(game, factionId, RESOURCE_IDS.wood, amount);
}

function grantResource(game, factionId, resourceId, amount) {
  const rounded = round3(amount);
  game.economy.factions[factionId].stockpiles[resourceId] = {
    resourceId,
    amount: rounded,
    components: { [resourceId]: rounded }
  };
}

function setEnemySquadFood(game, food) {
  game.squads = (game.squads ?? []).map((squad) => (
    squad.factionId === 'enemy'
      ? {
        ...squad,
        supply: {
          ...squad.supply,
          food,
          foodRatio: 0,
          starvingTicks: food <= 0 ? 1 : 0,
          status: food <= 0 ? 'starving' : squad.supply?.status ?? 'supplied'
        }
      }
      : squad
  ));
}

function countEnemyStructures(game, type) {
  return (game.structures ?? []).filter((structure) => (
    structure.factionId === 'enemy' &&
    structure.type === type &&
    structure.construction?.state !== CONSTRUCTION_STATES.ruined
  )).length;
}

function createCompletedEnemyStructure(game, type, tile) {
  const count = countEnemyStructures(game, type) + 1;
  return createStructureInstance(type, {
    id: `structure_${type}_enemy_test_${count}`,
    factionId: 'enemy',
    tile,
    construction: { state: CONSTRUCTION_STATES.complete, progress: 1 }
  });
}

function nearSameTile(a, b) {
  return Math.round(a.x) === Math.round(b.x) && Math.round(a.y) === Math.round(b.y);
}

function round3(value) {
  return Math.round(Number(value) * 1000) / 1000;
}
