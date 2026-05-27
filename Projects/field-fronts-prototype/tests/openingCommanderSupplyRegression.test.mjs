import assert from 'node:assert/strict';
import { createDefaultMap } from '../src/world/mapModel.js';
import {
  advanceGameTick,
  createInitialGameState,
  getSelectedGameEntity,
  recomputeGameState
} from '../src/game/gameModel.js';

export function run() {
  const map = createDefaultMap();
  const game = createInitialGameState(map);

  const playerCommander = game.leaders.find((leader) => leader.id === 'leader_player_01');
  assert.ok(playerCommander, 'opening game must seed the player commander');
  assert.equal(playerCommander.factionId, 'player');
  assert.equal(game.selectedEntityId, playerCommander.id, 'opening selection should remain on the player commander');
  assert.equal(getSelectedGameEntity(game)?.id, playerCommander.id);

  const openingOutpost = game.outposts.find((outpost) => outpost.id === 'outpost_player_01');
  assert.ok(openingOutpost, 'opening game must seed the player camp outpost');
  assert.equal(openingOutpost.ownerFactionId, 'player');
  assert.ok(openingOutpost.supply > 0, 'opening camp outpost must produce gold');

  recomputeGameState(game, map);
  assert.equal(game.leaders.some((leader) => leader.id === playerCommander.id), true, 'recompute must not drop the player commander');
  assert.equal(game.selectedEntityId, playerCommander.id, 'recompute must not clear opening commander selection');

  advanceGameTick(game, map);
  const playerGold = game.economy.factions.player.stockpiles.gold.amount;
  const playerIncome = game.economy.factions.player.lastIncome.gold.amount;

  assert.ok(playerGold > 115, 'player gold must increase on the first tick');
  assert.ok(playerIncome > 0, 'player gold income must be reported on the first tick');
  assert.ok(
    game.economy.factions.player.lastIncome.gold.sources.some((source) => source.outpostId === openingOutpost.id),
    'player gold income should include the starting outpost as a source'
  );
  assert.equal(game.leaders.some((leader) => leader.id === playerCommander.id), true, 'advance tick must not drop the player commander');
}
