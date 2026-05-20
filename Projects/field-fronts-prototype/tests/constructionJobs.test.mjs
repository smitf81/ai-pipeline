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
  validateStructurePlacement
} from '../src/game/gameModel.js';
import { canAffordSupplies } from '../src/game/economy.js';
import { createBlankMap } from '../src/world/mapModel.js';

export function run() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const editor = createEditorState(map);
  const startingSupplies = editor.game.economy.factions.player.stockpiles.supplies.amount;

  const placement = selectStructurePlacement(editor, 'outpost');
  assert.equal(placement.active, true);
  assert.equal(placement.selectedStructureType, 'outpost');
  assert.equal(editor.game.economy.factions.player.stockpiles.supplies.amount, startingSupplies);

  const invalid = placeSelectedStructure(editor, { x: 9, y: 15 });
  assert.equal(invalid.ok, false);
  assert.equal(editor.game.economy.factions.player.stockpiles.supplies.amount, startingSupplies);
  cancelStructurePlacement(editor);

  const game = createInitialGameState(map);
  for (let index = 0; index < 8; index += 1) {
    advanceGameTick(game, map);
  }
  assert.equal(canAffordSupplies(game.economy, 'player', 30), true);

  const preview = validateStructurePlacement(game, map, {
    type: 'wall_segment',
    factionId: 'player',
    position: { x: 9, y: 15 }
  });
  assert.equal(preview.valid, true);
  assert.equal(preview.sourceBaseId?.startsWith('structure_outpost_player'), true);

  const beforeSupplies = game.economy.factions.player.stockpiles.supplies.amount;
  const beforeSignature = createStructureNavigationSignature(game);
  const build = placeStructureBuildOrder(game, map, {
    type: 'wall_segment',
    factionId: 'player',
    position: { x: 9, y: 15 }
  });
  assert.equal(build.ok, true);
  assert.equal(
    game.economy.factions.player.stockpiles.supplies.amount,
    Math.round((beforeSupplies - build.cost) * 1000) / 1000
  );
  assert.equal(build.structure.construction.state, 'blueprint');
  assert.equal(game.constructionJobs.length, 1);
  assert.equal(game.constructionJobs[0].structureId, build.structure.id);
  assert.equal(game.constructionJobs[0].state, 'pending');
  assert.equal(createStructureNavigationSignature(game), beforeSignature);

  advanceGameTick(game, map);
  assert.equal(game.constructionJobs[0].assignedBuilderIds.length > 0, true);

  let completed = false;
  for (let index = 0; index < 60; index += 1) {
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

  const trenchGame = createInitialGameState(map);
  for (let index = 0; index < 4; index += 1) {
    advanceGameTick(trenchGame, map);
  }
  const trench = placeStructureBuildOrder(trenchGame, map, {
    type: 'trench_segment',
    factionId: 'player',
    position: { x: 10, y: 15 }
  });
  assert.equal(trench.ok, true);
  for (let index = 0; index < 45; index += 1) {
    advanceGameTick(trenchGame, map);
    if (trenchGame.constructionJobs[0].state === 'complete') {
      break;
    }
  }
  assert.equal(trenchGame.constructionJobs[0].state, 'complete');
  assert.equal(collectCompletedStructureBlockers(trenchGame).some((body) => body.id === trench.structure.id), false);
  assert.equal(collectStructureMovementModifiers(trenchGame).some((modifier) => modifier.id === trench.structure.id), true);

  const editorWithSupplies = createEditorState(map);
  for (let index = 0; index < 8; index += 1) {
    advanceGameTick(editorWithSupplies.game, map);
  }
  selectStructurePlacement(editorWithSupplies, 'watchtower');
  const placementPreview = updateStructurePlacementPreview(editorWithSupplies, { x: 10, y: 14 });
  assert.equal(placementPreview.validity.valid, true);
  const placed = placeSelectedStructure(editorWithSupplies, { x: 10, y: 14 });
  assert.equal(placed.ok, true);
  assert.equal(editorWithSupplies.placement.active, false);
  assert.equal(editorWithSupplies.game.constructionJobs.length, 1);

  const coastJobMap = createSeaWallGapMap({ gapY: 15 });
  const coastJobGame = createInitialGameState(coastJobMap);
  for (let index = 0; index < 5; index += 1) {
    advanceGameTick(coastJobGame, coastJobMap);
  }
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
  const isolatedGame = createInitialGameState(isolatedMap);
  for (let index = 0; index < 5; index += 1) {
    advanceGameTick(isolatedGame, isolatedMap);
  }
  const isolatedBuild = placeStructureBuildOrder(isolatedGame, isolatedMap, {
    type: 'watchtower',
    factionId: 'player',
    position: { x: 14, y: 8 }
  });
  assert.equal(isolatedBuild.ok, true);
  for (let index = 0; index < 16; index += 1) {
    advanceGameTick(isolatedGame, isolatedMap);
  }
  const isolatedJob = isolatedGame.constructionJobs[0];
  assert.equal(['blocked', 'pending'].includes(isolatedJob.state), true);
  assert.equal(isolatedJob.assignedBuilderIds.length, 0);
  assert.equal(isolatedGame.builders.every((builder) => builder.jobId !== isolatedJob.id), true);
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
