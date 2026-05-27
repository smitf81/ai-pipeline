import assert from 'node:assert/strict';
import { createBlankMap, createDefaultMap, getTile } from '../src/world/mapModel.js';
import {
  advanceGameTick,
  createGameStateSnapshot,
  createInitialGameState,
  createStructureNavigationSignature,
  deserializeGameState,
  getGameFieldValue,
  MOVEMENT_MODEL,
  serializeGameState,
  spawnInfantrySquad,
  setPlayerEntityPressureStance,
  setPlayerMovementIntent,
  setPlayerPressureStance
} from '../src/game/gameModel.js';
import { RESOURCE_DEFINITIONS, RESOURCE_IDS, SUPPLIES_COMPONENT_IDS } from '../src/game/economy.js';
import { calculateSupplyIncomeTick, canAffordCost, spendCost, OUTPOST_GOLD_INCOME_PER_TICK } from '../src/game/economy.js';
import { GAME_STATE_CONTRACT_ID, createMapRef } from '../src/game/contracts.js';

export function run() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);

  assert.equal(game.contract, GAME_STATE_CONTRACT_ID);
  assert.deepEqual(game.mapRef, createMapRef(map));
  assert.equal(game.leaders.length, 2);
  assert.equal(game.squads.length, 0);
  assert.equal(game.outposts.length, 3);
  assert.equal(game.structures.length, 3);
  assert.equal(RESOURCE_DEFINITIONS[0].id, RESOURCE_IDS.supplies);
  assert.deepEqual(Object.keys(game.economy.resources), [RESOURCE_IDS.supplies, RESOURCE_IDS.gold, RESOURCE_IDS.food, RESOURCE_IDS.wood, RESOURCE_IDS.population]);
  assert.deepEqual(Object.keys(game.economy.resources.supplies.components), [...SUPPLIES_COMPONENT_IDS]);
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
  assert.equal(game.economy.factions.player.storage.used, 68);
  assert.equal(game.leaders[0].type, 'leader');
  assert.equal(game.leaders[0].collision.layer, 'unit');
  assert.equal(game.leaders[0].collision.softSeparation, true);
  assert.equal(game.outposts[0].type, 'outpost');
  assert.equal(game.structures[0].entityType, 'structure');
  assert.equal(game.structures[0].type, 'outpost');
  assert.equal(game.structures[0].occupancy.capacitySquads, 2);
  assert.ok(game.leaders.every((leader) => leader.commandScore >= 50 && leader.commandScore <= 100));
  assert.ok(game.leaders[0].influenceRadius >= 5);
  assert.ok(game.leaders[0].command.graph.length >= 4);
  assert.ok(game.leaders[0].command.graph.some((node) => node.id === 'defensible-ground'));
  assert.ok(game.leaders[0].objectiveProjection.value > 0);
  assert.ok(game.leaders[1].objectiveProjection.value > 0);
  assert.ok(game.frontline.segmentCount > 0);
  assert.ok(game.frontline.averagePressure > 0);
  assert.ok(game.frontline.segments.every((segment) => Number.isFinite(segment.start.x) && Number.isFinite(segment.end.y)));
  assert.equal(game.leaders.find((leader) => leader.factionId === 'player').behavior.controller, 'player');
  assert.equal(game.leaders.find((leader) => leader.factionId === 'enemy').behavior.controller, 'ai');

  const playerLeader = game.leaders.find((leader) => leader.factionId === 'player');
  const enemyLeader = game.leaders.find((leader) => leader.factionId === 'enemy');
  const contestedOutpost = game.outposts.find((outpost) => outpost.contestable);
  const openingIncome = calculateSupplyIncomeTick(game.outposts);
  assert.equal(openingIncome.player.amount, Math.round((OUTPOST_GOLD_INCOME_PER_TICK + (OUTPOST_GOLD_INCOME_PER_TICK * contestedOutpost.supply * 0.5)) * 1000) / 1000);
  assert.equal(openingIncome.enemy.amount, openingIncome.player.amount);
  const gradientIncome = calculateSupplyIncomeTick([{
    id: 'outpost_gradient_test',
    contestable: true,
    supply: 1,
    control: { player: 0.7, enemy: 0.3 }
  }]);
  assert.equal(gradientIncome.player.amount, Math.round(OUTPOST_GOLD_INCOME_PER_TICK * 0.7 * 1000) / 1000);
  assert.equal(gradientIncome.enemy.amount, Math.round(OUTPOST_GOLD_INCOME_PER_TICK * 0.3 * 1000) / 1000);
  assert.equal(contestedOutpost.factionId, 'neutral');
  assert.equal(contestedOutpost.ownerFactionId, null);
  assert.equal(contestedOutpost.control.player, 0.5);
  assert.ok(contestedOutpost.projectedPressure.player > 0);
  assert.ok(contestedOutpost.projectedPressure.enemy > 0);
  assert.ok(getGameFieldValue(game, 'playerCommand', playerLeader.tile.x, playerLeader.tile.y) > 0.45);
  assert.ok(getGameFieldValue(game, 'enemyCommand', enemyLeader.tile.x, enemyLeader.tile.y) > 0.45);
  assert.ok(getGameFieldValue(game, 'playerCommandRaw', contestedOutpost.tile.x, contestedOutpost.tile.y) >= getGameFieldValue(game, 'playerCommand', contestedOutpost.tile.x, contestedOutpost.tile.y));
  assert.ok(getGameFieldValue(game, 'enemyCommandRaw', contestedOutpost.tile.x, contestedOutpost.tile.y) >= getGameFieldValue(game, 'enemyCommand', contestedOutpost.tile.x, contestedOutpost.tile.y));
  assert.ok(getGameFieldValue(game, 'objectivePressure', contestedOutpost.tile.x, contestedOutpost.tile.y) > 0);

  const probePressure = contestedOutpost.projectedPressure.player;
  setPlayerPressureStance(game, map, 'commit');
  const committedOutpost = game.outposts.find((outpost) => outpost.contestable);
  const committedLeader = game.leaders.find((leader) => leader.factionId === 'player');
  const playerStartPosition = { ...committedLeader.position };
  const enemyStartPosition = { ...game.leaders.find((leader) => leader.factionId === 'enemy').position };
  assert.equal(committedLeader.behavior.stance, 'commit');
  assert.ok(committedOutpost.projectedPressure.player > probePressure);
  assert.equal(committedOutpost.status, 'player-pressuring');

  advanceGameTick(game, map);
  assert.equal(game.tick, 1);
  assert.ok(game.economy.factions.player.stockpiles.gold.amount > 95 + OUTPOST_GOLD_INCOME_PER_TICK - 0.001);
  assert.ok(game.economy.factions.enemy.stockpiles.gold.amount > 95 + OUTPOST_GOLD_INCOME_PER_TICK - 0.001);
  assert.ok(game.economy.factions.player.lastIncome.gold.sources.some((source) => source.kind === 'base-outpost'));
  assert.ok(game.economy.factions.player.lastIncome.gold.sources.some((source) => source.kind === 'contest-gradient'));
  assert.ok(game.economy.factions.player.lastIncome.population.sources.some((source) => source.kind === 'base-outpost'));
  assert.ok(game.economy.factions.player.lastIncome.population.sources.some((source) => source.kind === 'contest-gradient'));
  assert.ok(game.economy.factions.player.lastIncome.food.sources.some((source) => source.kind === 'outpost-native-trickle'));
  assert.ok(game.economy.factions.player.lastIncome.wood.sources.some((source) => source.kind === 'outpost-native-trickle'));
  assert.ok(Math.abs(
    Object.values(game.economy.factions.player.stockpiles.gold.components).reduce((sum, value) => sum + value, 0)
    - game.economy.factions.player.stockpiles.gold.amount
  ) < 0.001);
  assert.equal(canAffordCost(game.economy, 'player', { [RESOURCE_IDS.gold]: 80 }).ok, true);
  const affordableOpeningSpend = spendCost(game.economy, 'player', { [RESOURCE_IDS.gold]: 80 });
  assert.equal(affordableOpeningSpend.ok, true);
  assert.equal(affordableOpeningSpend.economy.factions.player.stockpiles.gold.amount, Math.round((game.economy.factions.player.stockpiles.gold.amount - 80) * 1000) / 1000);
  assert.equal(game.fields.control.width, map.width);
  const movedPlayerLeader = game.leaders.find((leader) => leader.factionId === 'player');
  const tickedEnemyLeader = game.leaders.find((leader) => leader.factionId === 'enemy');
  assert.ok(movedPlayerLeader.position.x > playerStartPosition.x);
  assert.ok(tickedEnemyLeader.position.x < enemyStartPosition.x);
  assert.ok(movedPlayerLeader.movement.lastStepTiles > 0);
  assert.ok(movedPlayerLeader.movement.lastStepTiles <= MOVEMENT_MODEL.baseFootSpeedTilesPerTick);
  assert.ok(movedPlayerLeader.movement.speedKph > 0);
  assert.ok(movedPlayerLeader.movement.speedKph < 4);
  assert.ok(Math.hypot(movedPlayerLeader.position.x - committedOutpost.tile.x, movedPlayerLeader.position.y - committedOutpost.tile.y) > 1);
  assert.equal(tickedEnemyLeader.behavior.controller, 'ai');
  assert.equal(tickedEnemyLeader.behavior.stance, 'commit');
  assert.match(tickedEnemyLeader.behavior.lastDecision, /Enemy/);
  const tickedOutpost = game.outposts.find((outpost) => outpost.contestable);
  assert.ok(tickedOutpost.projectedPressure.enemy > 0);
  assert.ok(Math.abs(tickedOutpost.projectedPressure.enemy - tickedOutpost.projectedPressure.player) < 0.04);

  const snapshot = createGameStateSnapshot(game, map);
  assert.equal(snapshot.contract, GAME_STATE_CONTRACT_ID);
  assert.equal(snapshot.tick, 1);
  assert.equal(snapshot.economy.resources.gold.role, 'currency');
  assert.equal(snapshot.progression.stage, 'tribal_camp');
  assert.equal(snapshot.fields, undefined);
  assert.equal(snapshot.frontline, undefined);
  assert.equal(snapshot.leaders[0].command, undefined);
  assert.equal(snapshot.structures.length, 3);
  assert.equal(snapshot.battlefieldTrace.footprints.length > 0, true);

  const json = serializeGameState(game, map);
  const restored = deserializeGameState(json, map);
  assert.equal(restored.tick, 1);
  assert.deepEqual(Object.keys(restored.economy.factions.player.stockpiles.supplies.components), [...SUPPLIES_COMPONENT_IDS]);
  assert.deepEqual(Object.keys(restored.economy.factions.player.stockpiles.gold.components), [RESOURCE_IDS.gold]);
  assert.deepEqual(Object.keys(restored.economy.factions.player.stockpiles.food.components), [RESOURCE_IDS.food]);
  assert.deepEqual(Object.keys(restored.economy.factions.player.stockpiles.wood.components), [RESOURCE_IDS.wood]);
  assert.deepEqual(Object.keys(restored.economy.factions.player.stockpiles.population.components), [RESOURCE_IDS.population]);
  assert.equal(restored.progression.stage, 'tribal_camp');
  assert.equal(restored.leaders.length, 2);
  assert.equal(restored.structures.length, 3);
  assert.equal(restored.battlefieldTrace.footprints.length, snapshot.battlefieldTrace.footprints.length);
  assert.equal(restored.fields.control.height, map.height);
  assert.ok(restored.frontline.segmentCount > 0);
  assert.equal(restored.leaders[0].command.graph.length, game.leaders[0].command.graph.length);
  assert.equal(restored.leaders.find((leader) => leader.factionId === 'player').behavior.stance, 'commit');
  assert.equal(restored.outposts.find((outpost) => outpost.contestable).control.player, game.outposts.find((outpost) => outpost.contestable).control.player);

  const purchaseGame = createInitialGameState(map);
  setPlayerPressureStance(purchaseGame, map, 'commit');
  for (let index = 0; index < 21; index += 1) {
    advanceGameTick(purchaseGame, map);
  }
  const beforeSpend = purchaseGame.economy.factions.player.stockpiles.gold.amount;
  assert.equal(canAffordCost(purchaseGame.economy, 'player', { [RESOURCE_IDS.gold]: 80 }).ok, true);
  const spend = spendCost(purchaseGame.economy, 'player', { [RESOURCE_IDS.gold]: 80 });
  assert.equal(spend.ok, true);
  assert.equal(spend.economy.factions.player.stockpiles.gold.amount, Math.round((beforeSpend - 80) * 1000) / 1000);
  assert.equal(
    Object.values(spend.economy.factions.player.stockpiles.gold.components).reduce((sum, value) => Math.round((sum + value) * 1000) / 1000, 0),
    spend.economy.factions.player.stockpiles.gold.amount
  );

  const squadGame = createInitialGameState(map);
  setPlayerPressureStance(squadGame, map, 'commit');
  const spawn = spawnInfantrySquad(squadGame, map, { factionId: 'player' });
  assert.equal(spawn.ok, true);
  assert.equal(squadGame.squads.length, 1);
  const squad = squadGame.squads[0];
  assert.equal(squad.type, 'squad');
  assert.equal(squad.collision.layer, 'unit');
  assert.equal(squad.collision.blocksMovement, false);
  assert.equal(squad.unitId, 'infantry');
  assert.equal(squad.members.length, 4);
  assert.ok(squad.influenceRadius > 0);
  assert.ok(squad.sightRadius > squad.influenceRadius);
  assert.ok(getGameFieldValue(squadGame, 'playerCommand', squad.tile.x, squad.tile.y) > 0);
  assert.ok(getGameFieldValue(squadGame, 'playerLoS', squad.tile.x, squad.tile.y) > 0.5);
  const squadObjective = squadGame.outposts.find((outpost) => outpost.contestable);
  assert.ok(squadObjective.projectedPressure.player > 0);
  const squadOverride = setPlayerEntityPressureStance(squadGame, map, squad.id, 'hold');
  assert.equal(squadOverride.ok, true);
  assert.equal(squadGame.squads[0].behavior.stance, 'hold');
  assert.equal(squadGame.leaders.find((leader) => leader.factionId === 'player').behavior.stance, 'commit');
  const enemyOverride = setPlayerEntityPressureStance(squadGame, map, squadGame.leaders.find((leader) => leader.factionId === 'enemy').id, 'hold');
  assert.equal(enemyOverride.ok, false);
  assert.equal(enemyOverride.reason, 'invalid-player-command-target');
  setPlayerMovementIntent(squadGame, map, squad.id, [
    squad.position,
    { x: squad.position.x + 2, y: squad.position.y },
    { x: squad.position.x + 4, y: squad.position.y + 1 }
  ]);
  assert.equal(squadGame.squads[0].movementOrder.type, 'path-hold');
  advanceGameTick(squadGame, map);
  assert.ok(squadGame.squads[0].position.x > squad.position.x);
  assert.equal(squadGame.squads[0].movementPath.kind, 'player-intended');
  assert.deepEqual(squadGame.squads[0].movementPath.target, squadGame.squads[0].movementOrder.target);
  assert.ok(squadGame.squads[0].movementPath.nodes.length >= 2);
  assert.equal(createGameStateSnapshot(squadGame, map).squads.length, 1);

  const intentGame = createInitialGameState(map);
  const intentLeader = intentGame.leaders.find((leader) => leader.factionId === 'player');
  setPlayerMovementIntent(intentGame, map, intentLeader.id, [
    intentLeader.position,
    { x: intentLeader.position.x + 2, y: intentLeader.position.y },
    { x: intentLeader.position.x + 4, y: intentLeader.position.y + 1 },
    { x: intentLeader.position.x + 6, y: intentLeader.position.y + 1 }
  ]);
  const orderedLeader = intentGame.leaders.find((leader) => leader.factionId === 'player');
  assert.equal(orderedLeader.behavior.intent, 'path-hold-objective');
  assert.equal(orderedLeader.movementOrder.type, 'path-hold');
  advanceGameTick(intentGame, map);
  const movedIntentLeader = intentGame.leaders.find((leader) => leader.factionId === 'player');
  assert.deepEqual(movedIntentLeader.movement.target, movedIntentLeader.movementOrder.target);
  assert.ok(movedIntentLeader.position.x > intentLeader.position.x);
  assert.ok(movedIntentLeader.movementOrder.path.length >= 2);
  assert.equal(movedIntentLeader.movementPath.kind, 'player-intended');
  assert.deepEqual(movedIntentLeader.movementPath.target, movedIntentLeader.movementOrder.target);
  assert.ok(movedIntentLeader.movementPath.nodes.length >= 2);

  const terrainMap = createDefaultMap();
  const routedGame = createInitialGameState(terrainMap);
  setPlayerPressureStance(routedGame, terrainMap, 'commit');
  const routedStart = { ...routedGame.leaders.find((leader) => leader.factionId === 'player').position };
  for (let index = 0; index < 8; index += 1) {
    advanceGameTick(routedGame, terrainMap);
  }
  const routedPlayer = routedGame.leaders.find((leader) => leader.factionId === 'player');
  assert.ok(routedPlayer.position.x > routedStart.x);
  assert.equal(routedPlayer.movement.status, 'moving');
  assert.ok(routedPlayer.movement.waypoint);
  assert.equal(routedPlayer.movementPath.kind, 'auto');
  assert.ok(routedPlayer.movementPath.nodes.length >= 2);

  const coastMap = createSeaWallGapMap();
  const coastGame = createInitialGameState(coastMap);
  const coastSpawn = spawnInfantrySquad(coastGame, coastMap, { factionId: 'player' });
  assert.equal(coastSpawn.ok, true);
  coastGame.squads = coastGame.squads.map((candidate) => candidate.id === coastSpawn.squad.id
    ? {
      ...candidate,
      position: { x: 6, y: 7 },
      tile: { x: 6, y: 7 },
      movementPath: null
    }
    : candidate);
  setPlayerMovementIntent(coastGame, coastMap, coastSpawn.squad.id, [
    { x: 6, y: 7 },
    { x: 15, y: 7 }
  ]);
  advanceGameTick(coastGame, coastMap);
  const coastPath = coastGame.squads[0].movementPath;
  assert.equal(coastPath.blocked, false);
  assert.equal(coastPath.nodes.some((node) => Math.round(node.y) === 7), true);
  assert.equal(coastPath.nodes.some((node, index) => index > 0 && getTile(coastMap, Math.round(node.x), Math.round(node.y)) === 'sea'), false);
  for (let index = 0; index < 30; index += 1) {
    advanceGameTick(coastGame, coastMap);
  }
  assert.ok(coastGame.squads[0].position.x > 10.4);
  assert.notEqual(coastGame.squads[0].movement.status, 'blocked');

  const slideMap = createBlankMap({ width: 24, height: 16, fill: 'land' });
  slideMap.tiles[6][7] = 'sea';
  const slideGame = createInitialGameState(slideMap);
  const slideSpawn = spawnInfantrySquad(slideGame, slideMap, { factionId: 'player' });
  assert.equal(slideSpawn.ok, true);
  const slidePosition = { x: 6.49, y: 5.49 };
  const slideWaypoint = { x: 7.2, y: 6.2 };
  const slideTarget = { x: 8.2, y: 6.2 };
  const slideOrder = {
    type: 'path-hold',
    routeMode: 'player-intended',
    path: [slidePosition, slideTarget],
    target: slideTarget,
    issuedAtTick: slideGame.tick
  };
  const slideSourceSignature = `player:player-intended:${round3(slideTarget.x)},${round3(slideTarget.y)}`;
  const slideMapSignature = `${slideMap.width}x${slideMap.height}:${slideMap.tiles.map((row) => row.join(',')).join('|')}::structures:${createStructureNavigationSignature(slideGame)}`;
  slideGame.squads = slideGame.squads.map((candidate) => candidate.id === slideSpawn.squad.id
    ? {
      ...candidate,
      position: slidePosition,
      tile: { x: 6, y: 5 },
      movementOrder: slideOrder,
      movementPath: {
        kind: 'player-intended',
        target: slideTarget,
        sourceSignature: slideSourceSignature,
        mapSignature: slideMapSignature,
        routeCacheKey: 'test-slide-route',
        routeCacheHit: true,
        nodes: [slidePosition, slideWaypoint, slideTarget],
        cursor: 1,
        blocked: false
      }
    }
    : candidate);
  advanceGameTick(slideGame, slideMap);
  const slidSquad = slideGame.squads[0];
  assert.match(slidSquad.movement.status, /^sliding-/);
  assert.notDeepEqual(slidSquad.tile, { x: 7, y: 6 });
  assert.equal(getTile(slideMap, slidSquad.tile.x, slidSquad.tile.y), 'land');
}

function createSeaWallGapMap({ width = 24, height = 16, wallX = 10, gapY = 7 } = {}) {
  const map = createBlankMap({ width, height, fill: 'land' });
  for (let y = 0; y < height; y += 1) {
    if (y !== gapY) {
      map.tiles[y][wallX] = 'sea';
    }
  }
  return map;
}

function round3(value) {
  return Math.round(Number(value) * 1000) / 1000;
}
