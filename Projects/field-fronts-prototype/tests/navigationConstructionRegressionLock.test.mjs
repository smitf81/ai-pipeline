import assert from 'node:assert/strict';

import {
  advanceGameTick,
  collectCompletedStructureBlockers,
  createInitialGameState,
  createStructureNavigationSignature,
  placeStructureBuildOrder,
  spawnInfantrySquad,
  setPlayerMovementIntent
} from '../src/game/gameModel.js';
import {
  createEditorState,
  placeSelectedStructure,
  selectStructurePlacement,
  updateStructurePlacementPreview
} from '../src/editor/editorState.js';
import { createBlankMap, getTile } from '../src/world/mapModel.js';
import {
  getMovementPathWaypoint,
  resolveMovementStep
} from '../src/game/movementSystem.js';

export function run() {
  assertSeaWallGapRoute();
  assertNoSeaCornerCutting();
  assertCoastSlide();
  assertFractionalTargetArrivesWithoutFinalNodeBlocking();
  assertBuilderReachesConstructionJob();
  assertBuilderBlockedJobReleases();
  assertBuildPlacementSpendsOnce();
  assertCompletedStructureActivatesNavigation();
  assertNavigationRouteQueueDefersAndResolves();
  assertPathLookaheadSkipsSafeMicroCorner();
  assertPathLookaheadDoesNotCutBlockedCorner();
  assertLocalRecoverySidestepsBlockedWaypoint();
}

function assertSeaWallGapRoute() {
  const map = createSeaWallGapMap({ width: 24, height: 16, wallX: 10, gapY: 7 });
  const game = createInitialGameState(map);
  const spawn = spawnInfantrySquad(game, map, { factionId: 'player' });
  assert.equal(spawn.ok, true);

  setSquadPosition(game, spawn.squad.id, { x: 6, y: 7 });
  setPlayerMovementIntent(game, map, spawn.squad.id, [
    { x: 6, y: 7 },
    { x: 15, y: 7 }
  ]);
  advanceGameTick(game, map);

  const squad = game.squads.find((candidate) => candidate.id === spawn.squad.id);
  assert.equal(squad.movementPath.blocked, false);
  assert.equal(squad.movementPath.nodes.some((node) => Math.round(node.y) === 7), true);
  assert.equal(squad.movementPath.nodes.some((node, index) => index > 0 && terrainAt(map, node) === 'sea'), false);

  for (let index = 0; index < 30; index += 1) {
    advanceGameTick(game, map);
  }
  assert.equal(game.squads.find((candidate) => candidate.id === spawn.squad.id).position.x > 10.4, true);
}


function assertNoSeaCornerCutting() {
  const map = createBlankMap({ width: 12, height: 12, fill: 'land' });
  map.tiles[5][6] = 'sea';
  map.tiles[6][5] = 'sea';
  const game = createInitialGameState(map);
  const spawn = spawnInfantrySquad(game, map, { factionId: 'player' });
  assert.equal(spawn.ok, true);

  setSquadPosition(game, spawn.squad.id, { x: 5, y: 5 });
  setPlayerMovementIntent(game, map, spawn.squad.id, [
    { x: 5, y: 5 },
    { x: 7, y: 7 }
  ]);
  advanceGameTick(game, map);

  const squad = game.squads.find((candidate) => candidate.id === spawn.squad.id);
  assert.equal(squad.movementPath.blocked, false);
  assert.equal(squad.movementPath.nodes.some((node) => Math.round(node.x) === 6 && Math.round(node.y) === 6), false);
  assert.equal(squad.movement.status, 'moving');
  assert.equal(getTile(map, squad.tile.x, squad.tile.y), 'land');

  for (let index = 0; index < 24; index += 1) {
    advanceGameTick(game, map);
    const moving = game.squads.find((candidate) => candidate.id === spawn.squad.id);
    assert.notEqual(getTile(map, moving.tile.x, moving.tile.y), 'sea');
  }
}

function assertCoastSlide() {
  const map = createBlankMap({ width: 24, height: 16, fill: 'land' });
  map.tiles[6][7] = 'sea';
  const game = createInitialGameState(map);
  const spawn = spawnInfantrySquad(game, map, { factionId: 'player' });
  assert.equal(spawn.ok, true);

  const position = { x: 6.49, y: 5.49 };
  const waypoint = { x: 7.2, y: 6.2 };
  const target = { x: 8.2, y: 6.2 };
  setSquadPosition(game, spawn.squad.id, position);
  game.squads = game.squads.map((squad) => squad.id === spawn.squad.id
    ? {
      ...squad,
      movementOrder: {
        type: 'path-hold',
        routeMode: 'player-intended',
        path: [position, target],
        target,
        issuedAtTick: game.tick
      },
      movementPath: {
        kind: 'player-intended',
        target,
        sourceSignature: `player:player-intended:${round3(target.x)},${round3(target.y)}`,
        mapSignature: createMapNavigationSignature(map, game),
        routeCacheKey: 'regression-lock-coast-slide',
        routeCacheHit: true,
        nodes: [position, waypoint, target],
        cursor: 1,
        blocked: false
      }
    }
    : squad);

  advanceGameTick(game, map);
  const squad = game.squads.find((candidate) => candidate.id === spawn.squad.id);
  assert.match(squad.movement.status, /^sliding-/);
  assert.notDeepEqual(squad.tile, { x: 7, y: 6 });
  assert.equal(getTile(map, squad.tile.x, squad.tile.y), 'land');
}

function assertFractionalTargetArrivesWithoutFinalNodeBlocking() {
  const map = createBlankMap({ width: 18, height: 14, fill: 'land' });
  const game = createInitialGameState(map);
  const spawn = spawnInfantrySquad(game, map, { factionId: 'player' });
  assert.equal(spawn.ok, true);

  const start = { x: 5, y: 7 };
  const target = { x: 8.35, y: 7.35 };
  setSquadPosition(game, spawn.squad.id, start);
  setPlayerMovementIntent(game, map, spawn.squad.id, [start, target]);

  advanceTicksUntil(game, map, () => {
    const squad = game.squads.find((candidate) => candidate.id === spawn.squad.id);
    return squad?.movement?.status === 'arrived';
  }, 36);

  const squad = game.squads.find((candidate) => candidate.id === spawn.squad.id);
  assert.equal(squad.movement.status, 'arrived');
  assert.equal(squad.movement.distanceToTarget, 0);
  assert.ok(Math.hypot(squad.position.x - target.x, squad.position.y - target.y) <= 0.05);
  assert.notEqual(squad.movement.status, 'blocked');
}

function assertBuilderReachesConstructionJob() {
  const map = createSeaWallGapMap({ width: 24, height: 18, wallX: 10, gapY: 15 });
  const game = createInitialGameState(map);
  advanceTicks(game, map, 7);
  grantWood(game, 'player', 80);

  const build = placeStructureBuildOrder(game, map, {
    type: 'trench_segment',
    factionId: 'player',
    position: { x: 14, y: 15 }
  });
  assert.equal(build.ok, true);

  advanceTicksUntil(game, map, () => game.constructionJobs[0]?.progress > 0, 80);
  assert.equal(game.constructionJobs[0].progress > 0, true);
  assert.equal(game.constructionJobs[0].assignedBuilderIds.length > 0, true);
}

function assertBuilderBlockedJobReleases() {
  const map = createBlankMap({ width: 24, height: 16, fill: 'land' });
  surroundWithSea(map, { x: 14, y: 8 });
  const game = createInitialGameState(map);
  advanceTicks(game, map, 12);
  grantWood(game, 'player', 80);

  const build = placeStructureBuildOrder(game, map, {
    type: 'watchtower',
    factionId: 'player',
    position: { x: 14, y: 8 }
  });
  assert.equal(build.ok, false);
  assert.equal(build.reason, 'no-builder-access');
  assert.equal(game.constructionJobs.some((job) => job.factionId === 'player'), false);
  assert.equal(game.builders.filter((builder) => builder.factionId === 'player').every((builder) => !builder.jobId), true);
}

function assertBuildPlacementSpendsOnce() {
  const map = createBlankMap({ width: 32, height: 24, fill: 'land' });
  const state = createEditorState(map);
  advanceTicks(state.game, map, 12);

  const beforeSelect = state.game.economy.factions.player.stockpiles.gold.amount;
  selectStructurePlacement(state, 'watchtower');
  updateStructurePlacementPreview(state, { x: 10, y: 13 });
  assert.equal(state.game.economy.factions.player.stockpiles.gold.amount, beforeSelect);

  const placed = placeSelectedStructure(state, { x: 10, y: 13 });
  assert.equal(placed.ok, true);
  const afterPlacement = state.game.economy.factions.player.stockpiles.gold.amount;
  assert.equal(afterPlacement, round3(beforeSelect - (placed.resourceCost?.gold ?? 0)));

  const ignoredRepeat = placeSelectedStructure(state, { x: 11, y: 13 });
  assert.equal(ignoredRepeat.ok, false);
  assert.equal(state.game.economy.factions.player.stockpiles.gold.amount, afterPlacement);
}


function assertNavigationRouteQueueDefersAndResolves() {
  const map = createSeaWallGapMap({ width: 24, height: 16, wallX: 10, gapY: 7 });
  const game = createInitialGameState(map);
  game.performanceBudgets = {
    ...(game.performanceBudgets ?? {}),
    navigationFlowBuildsPerTick: 0
  };
  const spawn = spawnInfantrySquad(game, map, { factionId: 'player' });
  assert.equal(spawn.ok, true);

  setSquadPosition(game, spawn.squad.id, { x: 6, y: 6 });
  setPlayerMovementIntent(game, map, spawn.squad.id, [
    { x: 6, y: 6 },
    { x: 15, y: 6 }
  ]);
  advanceGameTick(game, map);

  let squad = game.squads.find((candidate) => candidate.id === spawn.squad.id);
  assert.equal(squad.movementPath.routeState, 'pending');
  assert.equal(squad.movementPath.routeFailureReason, 'route-build-deferred');

  advanceGameTick(game, map);
  squad = game.squads.find((candidate) => candidate.id === spawn.squad.id);
  assert.equal(squad.movementPath.routeState, 'pending');

  game.performanceBudgets.navigationFlowBuildsPerTick = 10;
  advanceGameTick(game, map);
  squad = game.squads.find((candidate) => candidate.id === spawn.squad.id);
  assert.equal(squad.movementPath.routeState, 'ready');
  assert.equal(squad.movementPath.blocked, false);
  assert.equal(squad.movementPath.nodes.some((node, index) => index > 0 && terrainAt(map, node) === 'sea'), false);
  assert.equal(squad.movementPath.nodes.some((node) => node.x > 10), true);
}


function assertPathLookaheadSkipsSafeMicroCorner() {
  const map = createBlankMap({ width: 14, height: 12, fill: 'land' });
  const game = createInitialGameState(map);
  const entity = { factionId: 'player', _runtimeOwner: game };
  const position = { x: 4, y: 5 };
  const path = {
    kind: 'player-intended',
    target: { x: 5.25, y: 5.2 },
    sourceSignature: 'test-lookahead-safe',
    mapSignature: createMapNavigationSignature(map, game),
    routeCacheKey: 'test-lookahead-safe',
    routeState: 'ready',
    nodes: [position, { x: 4.45, y: 5.05 }, { x: 5.25, y: 5.2 }],
    cursor: 1,
    blocked: false
  };

  const waypoint = getMovementPathWaypoint(path, position, { map, game, entity });
  assert.deepEqual(waypoint, { x: 5.25, y: 5.2 });
}

function assertPathLookaheadDoesNotCutBlockedCorner() {
  const map = createBlankMap({ width: 14, height: 12, fill: 'land' });
  map.tiles[5][6] = 'sea';
  const game = createInitialGameState(map);
  const entity = { factionId: 'player', _runtimeOwner: game };
  const position = { x: 5, y: 5 };
  const path = {
    kind: 'player-intended',
    target: { x: 6, y: 6 },
    sourceSignature: 'test-lookahead-blocked-corner',
    mapSignature: createMapNavigationSignature(map, game),
    routeCacheKey: 'test-lookahead-blocked-corner',
    routeState: 'ready',
    nodes: [position, { x: 5, y: 6 }, { x: 6, y: 6 }],
    cursor: 1,
    blocked: false
  };

  const waypoint = getMovementPathWaypoint(path, position, { map, game, entity });
  assert.deepEqual(waypoint, { x: 5, y: 6 });
}

function assertLocalRecoverySidestepsBlockedWaypoint() {
  const map = createBlankMap({ width: 14, height: 12, fill: 'land' });
  map.tiles[5][6] = 'sea';
  const game = createInitialGameState(map);
  const entity = { factionId: 'player', _runtimeOwner: game };

  const step = resolveMovementStep(map, game, entity, { x: 5, y: 5 }, { x: 6, y: 5 }, 0.8);
  assert.equal(step.blocked, false);
  assert.match(step.slidAxis, /^recovery-/);
  assert.equal(getTile(map, step.tile.x, step.tile.y), 'land');
  assert.notDeepEqual(step.tile, { x: 6, y: 5 });
}

function assertCompletedStructureActivatesNavigation() {
  const map = createBlankMap({ width: 32, height: 24, fill: 'land' });
  const game = createInitialGameState(map);
  advanceTicks(game, map, 8);
  grantWood(game, 'player', 80);
  const beforeSignature = createStructureNavigationSignature(game);

  const build = placeStructureBuildOrder(game, map, {
    type: 'wall_segment',
    factionId: 'player',
    position: { x: 10, y: 14 }
  });
  assert.equal(build.ok, true);
  assert.equal(createStructureNavigationSignature(game), beforeSignature);

  advanceTicksUntil(game, map, () => (
    game.structures.find((structure) => structure.id === build.structure.id)?.construction?.state === 'complete'
  ), 140);
  assert.notEqual(createStructureNavigationSignature(game), beforeSignature);
  assert.equal(collectCompletedStructureBlockers(game).some((body) => body.id === build.structure.id), true);
}

function setSquadPosition(game, squadId, position) {
  game.squads = game.squads.map((squad) => squad.id === squadId
    ? {
      ...squad,
      position,
      tile: { x: Math.round(position.x), y: Math.round(position.y) },
      movementPath: null
    }
    : squad);
}

function createSeaWallGapMap({ width, height, wallX, gapY }) {
  const map = createBlankMap({ width, height, fill: 'land' });
  for (let y = 0; y < height; y += 1) {
    if (y !== gapY) {
      map.tiles[y][wallX] = 'sea';
    }
  }
  return map;
}

function surroundWithSea(map, centre) {
  for (let y = centre.y - 1; y <= centre.y + 1; y += 1) {
    for (let x = centre.x - 1; x <= centre.x + 1; x += 1) {
      if (x === centre.x && y === centre.y) {
        continue;
      }
      map.tiles[y][x] = 'sea';
    }
  }
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

function terrainAt(map, point) {
  return getTile(map, Math.round(point.x), Math.round(point.y));
}

function createMapNavigationSignature(map, game) {
  return `${map.width}x${map.height}:${map.tiles.map((row) => row.join(',')).join('|')}::structures:${createStructureNavigationSignature(game)}`;
}

function round3(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function grantWood(game, factionId, amount) {
  const rounded = round3(amount);
  game.economy.factions[factionId].stockpiles.wood = {
    resourceId: 'wood',
    amount: rounded,
    components: { wood: rounded }
  };
}
