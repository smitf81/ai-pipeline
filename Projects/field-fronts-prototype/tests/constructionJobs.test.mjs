import assert from 'node:assert/strict';

import {
  cancelStructurePlacement,
  createEditorState,
  placeSelectedStructure,
  selectStructurePlacement,
  updateStructurePlacementPreview
} from '../src/editor/editorState.js';
import {
  advanceGameTick,
  collectCompletedStructureBlockers,
  collectStructureMovementModifiers,
  createInitialGameState,
  createStructureNavigationSignature,
  placeStructureBuildOrder,
  summarizeGame,
  validateStructurePlacement
} from '../src/game/gameModel.js';
import { RESOURCE_IDS, canAffordCost } from '../src/game/economy.js';
import { createBlankMap } from '../src/world/mapModel.js';

export function run() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const editor = createEditorState(map);
  const startingGold = editor.game.economy.factions.player.stockpiles.gold.amount;

  const placement = selectStructurePlacement(editor, 'outpost');
  assert.equal(placement.active, true);
  assert.equal(placement.selectedStructureType, 'outpost');
  assert.equal(editor.game.economy.factions.player.stockpiles.gold.amount, startingGold);

  editor.map.tiles[15][9] = 'sea';
  const invalid = placeSelectedStructure(editor, { x: 9, y: 15 });
  assert.equal(invalid.ok, false);
  assert.equal(editor.game.economy.factions.player.stockpiles.gold.amount, startingGold);
  editor.map.tiles[15][9] = 'land';
  cancelStructurePlacement(editor);

  const game = createInitialGameState(map);
  grantWood(game, 'player', 80);
  assert.equal(canAffordCost(game.economy, 'player', { [RESOURCE_IDS.gold]: 30 }).ok, true);

  const preview = validateStructurePlacement(game, map, {
    type: 'wall_segment',
    factionId: 'player',
    position: { x: 9, y: 15 }
  });
  assert.equal(preview.valid, true);
  assert.equal(preview.sourceBaseId?.startsWith('structure_outpost_player'), true);

  const beforeGold = game.economy.factions.player.stockpiles.gold.amount;
  const beforeSignature = createStructureNavigationSignature(game);
  const beforeVersions = { ...game.versions };
  const build = placeStructureBuildOrder(game, map, {
    type: 'wall_segment',
    factionId: 'player',
    position: { x: 9, y: 15 }
  });
  assert.equal(build.ok, true);
  assert.equal(
    game.economy.factions.player.stockpiles.gold.amount,
    Math.round((beforeGold - (build.resourceCost?.gold ?? 0)) * 1000) / 1000
  );
  assert.equal(build.structure.construction.state, 'blueprint');
  assert.equal(game.constructionJobs.length, 1);
  assert.equal(game.constructionJobs[0].structureId, build.structure.id);
  assert.equal(game.constructionJobs[0].state, 'pending');
  assert.equal(createStructureNavigationSignature(game), beforeSignature);
  assert.equal(game.events.some((event) => event.type === 'economy:spent' && event.payload.reason === 'build-order'), true);
  assert.equal(game.events.some((event) => event.type === 'construction:job_created' && event.payload.jobId === build.job.id), true);
  assert.equal(game.dirty.logistics, true);
  assert.equal(game.dirty.nav, true);
  assert.equal(game.versions.construction > beforeVersions.construction, true);
  assert.equal(game.versions.logistics > beforeVersions.logistics, true);
  assert.equal(game.scheduler.logistics.dirtyKeys.includes('logistics'), true);
  assert.equal(summarizeGame(game).runtime.recentEvents.some((event) => event.type === 'construction:job_created'), true);

  advanceGameTick(game, map);
  assert.equal(game.constructionJobs[0].assignedBuilderIds.length > 0, true);

  let completed = false;
  for (let index = 0; index < 120; index += 1) {
    advanceGameTick(game, map);
    completed = game.structures.find((structure) => structure.id === build.structure.id)?.construction?.state === 'complete';
    if (completed) {
      break;
    }
  }
  assert.equal(completed, true);
  assert.equal(game.constructionJobs[0].state, 'complete');
  assert.equal(collectCompletedStructureBlockers(game).some((body) => body.id === build.structure.id), true);
  assert.notEqual(createStructureNavigationSignature(game), beforeSignature);
  assert.equal(game.events.some((event) => event.type === 'construction:job_completed' && event.payload.jobId === build.job.id), true);
  assert.equal(game.events.some((event) => event.type === 'structure:nav_changed'), true);
  assert.equal(game.versions.nav > beforeVersions.nav, true);

  const trenchGame = createInitialGameState(map);
  grantWood(trenchGame, 'player', 80);
  const trench = placeStructureBuildOrder(trenchGame, map, {
    type: 'trench_segment',
    factionId: 'player',
    position: { x: 10, y: 15 }
  });
  assert.equal(trench.ok, true);
  for (let index = 0; index < 130; index += 1) {
    advanceGameTick(trenchGame, map);
    if (trenchGame.constructionJobs[0].state === 'complete') {
      break;
    }
  }
  assert.equal(trenchGame.constructionJobs[0].state, 'complete');
  assert.equal(collectCompletedStructureBlockers(trenchGame).some((body) => body.id === trench.structure.id), false);
  assert.equal(collectStructureMovementModifiers(trenchGame).some((modifier) => modifier.id === trench.structure.id), true);

  const editorWithSupplies = createEditorState(map);
  selectStructurePlacement(editorWithSupplies, 'watchtower');
  const placementPreview = updateStructurePlacementPreview(editorWithSupplies, { x: 10, y: 14 });
  assert.equal(placementPreview.validity.valid, true);
  const placed = placeSelectedStructure(editorWithSupplies, { x: 10, y: 14 });
  assert.equal(placed.ok, true);
  assert.equal(editorWithSupplies.placement.active, false);
  assert.equal(editorWithSupplies.game.constructionJobs.length, 1);

  const coastJobMap = createSeaWallGapMap({ gapY: 15 });
  const coastJobGame = createInitialGameState(coastJobMap);
  grantWood(coastJobGame, 'player', 80);
  const coastJob = placeStructureBuildOrder(coastJobGame, coastJobMap, {
    type: 'trench_segment',
    factionId: 'player',
    position: { x: 14, y: 15 }
  });
  assert.equal(coastJob.ok, true);
  let progressed = false;
  for (let index = 0; index < 80; index += 1) {
    advanceGameTick(coastJobGame, coastJobMap);
    progressed = coastJobGame.constructionJobs[0].progress > 0;
    if (progressed) {
      break;
    }
  }
  assert.equal(progressed, true);
  assert.equal(coastJobGame.constructionJobs[0].assignedBuilderIds.length > 0, true);

  const isolatedMap = createBlankMap({ width: 24, height: 16, fill: 'land' });
  surroundWithSea(isolatedMap, { x: 14, y: 8 });
  const footprintMap = createBlankMap({ width: 24, height: 16, fill: 'land' });
  footprintMap.tiles[8][15] = 'sea';
  const footprintGame = createInitialGameState(footprintMap);
  grantSupplies(footprintGame, 'player', 300);
  const unsupportedFootprint = validateStructurePlacement(footprintGame, footprintMap, {
    type: 'fort',
    factionId: 'player',
    position: { x: 14, y: 8 }
  });
  assert.equal(unsupportedFootprint.valid, false);
  assert.equal(unsupportedFootprint.reason, 'unbuildable-footprint');

  const isolatedGame = createInitialGameState(isolatedMap);
  for (let index = 0; index < 12; index += 1) {
    advanceGameTick(isolatedGame, isolatedMap);
  }
  grantWood(isolatedGame, 'player', 80);
  const isolatedBuild = placeStructureBuildOrder(isolatedGame, isolatedMap, {
    type: 'watchtower',
    factionId: 'player',
    position: { x: 14, y: 8 }
  });
  assert.equal(isolatedBuild.ok, false);
  assert.equal(isolatedBuild.reason, 'no-builder-access');
  assert.equal(isolatedGame.constructionJobs.some((job) => job.factionId === 'player'), false);
  assert.equal(isolatedGame.builders.filter((builder) => builder.factionId === 'player').every((builder) => !builder.jobId), true);

  const stableWorkPointMap = createBlankMap({ width: 32, height: 24, fill: 'land' });
  const stableWorkPointGame = createInitialGameState(stableWorkPointMap);
  grantSupplies(stableWorkPointGame, 'enemy', 0);
  grantWood(stableWorkPointGame, 'enemy', 0);
  grantResource(stableWorkPointGame, 'enemy', 'food', 0);
  stableWorkPointGame.enemyAI = { ...stableWorkPointGame.enemyAI, buildCooldownUntil: 9999 };
  grantWood(stableWorkPointGame, 'player', 80);
  const stableBuild = placeStructureBuildOrder(stableWorkPointGame, stableWorkPointMap, {
    type: 'wall_segment',
    factionId: 'player',
    position: { x: 14, y: 15 }
  });
  assert.equal(stableBuild.ok, true);
  for (let index = 0; index < 4; index += 1) {
    advanceGameTick(stableWorkPointGame, stableWorkPointMap);
    if (stableWorkPointGame.builders.some((builder) => builder.jobId && builder.workPoint)) {
      break;
    }
  }
  const stableJob = stableWorkPointGame.constructionJobs.find((job) => job.structureId === stableBuild.structure.id);
  const travellingBuilder = stableWorkPointGame.builders.find((builder) => builder.jobId === stableJob.id);
  assert.ok(travellingBuilder?.workPoint);
  advanceGameTick(stableWorkPointGame, stableWorkPointMap);
  const warmedBuilder = stableWorkPointGame.builders.find((builder) => builder.id === travellingBuilder.id);
  const workPoint = { ...warmedBuilder.workPoint };
  const previewsAfterChoice = stableWorkPointGame._runtimeCache?.constructionWorkPointPreviews ?? 0;
  for (let index = 0; index < 3; index += 1) {
    advanceGameTick(stableWorkPointGame, stableWorkPointMap);
    const currentBuilder = stableWorkPointGame.builders.find((builder) => builder.id === travellingBuilder.id);
    assert.deepEqual(currentBuilder.workPoint, workPoint);
  }
  const previewsAfterTravel = stableWorkPointGame._runtimeCache?.constructionWorkPointPreviews ?? 0;
  assert.equal(previewsAfterTravel, previewsAfterChoice);
}

function createSeaWallGapMap({ width = 24, height = 18, wallX = 10, gapY = 15 } = {}) {
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

function grantSupplies(game, factionId, amount) {
  grantResource(game, factionId, RESOURCE_IDS.supplies, amount);
  grantResource(game, factionId, RESOURCE_IDS.gold, amount);
  grantResource(game, factionId, RESOURCE_IDS.food, amount);
  grantResource(game, factionId, RESOURCE_IDS.wood, amount);
  grantResource(game, factionId, RESOURCE_IDS.population, amount);
}

function grantResource(game, factionId, resourceId, amount) {
  const rounded = Math.round(Number(amount) * 1000) / 1000;
  game.economy.factions[factionId].stockpiles[resourceId] = {
    resourceId,
    amount: rounded,
    components: { [resourceId]: rounded }
  };
}

function grantWood(game, factionId, amount) {
  const rounded = Math.round(Number(amount) * 1000) / 1000;
  game.economy.factions[factionId].stockpiles.wood = {
    resourceId: 'wood',
    amount: rounded,
    components: { wood: rounded }
  };
}
