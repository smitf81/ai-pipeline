import assert from 'node:assert/strict';

import {
  advanceGameTick,
  createGameStateSnapshot,
  createInitialGameState,
  deriveResourceFields
} from '../src/game/gameModel.js';
import { RESOURCE_IDS } from '../src/game/economy.js';
import { CONSTRUCTION_STATES, createStructureInstance } from '../src/game/structureRegistry.js';
import { assertGameStateContract } from '../src/game/contracts.js';
import { createBlankMap } from '../src/world/mapModel.js';

export function run() {
  const map = createBlankMap({ width: 24, height: 18, fill: 'land' });
  for (let y = 10; y <= 14; y += 1) {
    for (let x = 12; x <= 16; x += 1) {
      map.tiles[y][x] = 'forest';
    }
  }

  const fields = deriveResourceFields(map);
  assert.ok(fields.foodResource.values[12][13] > fields.foodResource.values[4][4]);
  assert.ok(fields.woodResource.values[12][13] > 0.9);
  assert.equal(fields.woodResource.values[4][4] < fields.woodResource.values[12][13], true);

  const game = createInitialGameState(map);
  game.structures = [
    ...game.structures,
    createStructureInstance('hunting_tent', {
      id: 'structure_hunting_tent_player_test',
      factionId: 'player',
      tile: { x: 8, y: 12 },
      position: { x: 8, y: 12 },
      construction: { state: CONSTRUCTION_STATES.complete, progress: 1 }
    }),
    createStructureInstance('wood_gathering_post', {
      id: 'structure_wood_post_player_test',
      factionId: 'player',
      tile: { x: 10, y: 12 },
      position: { x: 10, y: 12 },
      construction: { state: CONSTRUCTION_STATES.complete, progress: 1 }
    })
  ];

  advanceGameTick(game, map);
  assertGameStateContract(game);
  assert.equal(game.resourceWorkers.filter((worker) => worker.homeStructureId === 'structure_hunting_tent_player_test').length, 2);
  assert.equal(game.resourceWorkers.filter((worker) => worker.homeStructureId === 'structure_wood_post_player_test').length, 2);
  assert.equal(game.resourceWorkers.filter((worker) => worker.homeStructureId?.startsWith('structure_outpost_')).length, 2);
  assert.ok(game.resourceWorkers.length >= 6);
  assert.ok(game.economy.factions.player.stockpiles[RESOURCE_IDS.food].amount > 0);
  assert.ok(game.economy.factions.player.lastIncome[RESOURCE_IDS.food].sources.some((source) => source.kind === 'hunting-field'));
  assert.ok(game.economy.factions.player.lastIncome[RESOURCE_IDS.food].sources.some((source) => source.kind === 'outpost-native-trickle'));

  let woodDeposited = false;
  for (let index = 0; index < 90; index += 1) {
    advanceGameTick(game, map);
    if (game.economy.factions.player.lastIncome[RESOURCE_IDS.wood].sources.some((source) => source.kind === 'wood-delivery')) {
      woodDeposited = true;
      break;
    }
  }

  assert.equal(woodDeposited, true);
  assert.ok(game.economy.factions.player.lastIncome[RESOURCE_IDS.wood].sources.some((source) => source.kind === 'wood-delivery'));
  assert.ok(game.resourceWorkers.some((worker) => worker.resourceId === RESOURCE_IDS.wood && worker.targetTile?.x >= 12));

  const snapshot = createGameStateSnapshot(game, map);
  assert.ok(snapshot.resourceWorkers.length >= 6);
  assert.ok(snapshot.economy.factions.player.stockpiles[RESOURCE_IDS.food].amount > 0);
  assert.ok(snapshot.economy.factions.player.stockpiles[RESOURCE_IDS.wood].amount > 0);
  assert.equal(snapshot.fields, undefined);
}
