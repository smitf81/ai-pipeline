import assert from 'node:assert/strict';

import { UNIT_OPTIONS, getBuildOption } from '../src/game/buildCatalog.js';
import {
  createInitialGameState,
  recomputeGameState,
  spawnBuilderCrew,
  summarizeBuilderCapacity,
  validateBuilderCrewTraining
} from '../src/game/gameModel.js';
import { createStructureInstance } from '../src/game/structureRegistry.js';
import { createBlankMap } from '../src/world/mapModel.js';

export function run() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);

  const builderOption = getBuildOption('unit', 'builder');
  assert.equal(UNIT_OPTIONS.some((option) => option.id === 'builder'), true);
  assert.equal(builderOption.label, 'Builder');
  assert.equal(builderOption.cost, 18);

  let capacity = summarizeBuilderCapacity(game).player;
  assert.equal(capacity.used, 1);
  assert.equal(capacity.capacity, 2);
  assert.equal(capacity.free, 1);
  assert.equal(validateBuilderCrewTraining(game, map, { factionId: 'player' }).ok, true);

  const secondBuilder = spawnBuilderCrew(game, map, { factionId: 'player', select: false });
  assert.equal(secondBuilder.ok, true);
  assert.equal(game.builders.filter((builder) => builder.factionId === 'player').length, 2);

  const capped = spawnBuilderCrew(game, map, { factionId: 'player', select: false });
  assert.equal(capped.ok, false);
  assert.equal(capped.reason, 'builder-capacity-reached');

  game.structures.push(createStructureInstance('builder_lodge', {
    id: 'structure_builder_lodge_player_test',
    factionId: 'player',
    tile: { x: 9, y: 15 },
    construction: { state: 'complete', progress: 1 }
  }));
  recomputeGameState(game, map);

  capacity = summarizeBuilderCapacity(game).player;
  assert.equal(capacity.used, 2);
  assert.equal(capacity.capacity, 4);
  assert.equal(capacity.free, 2);
  assert.equal(capacity.trainingStructureIds.includes('structure_builder_lodge_player_test'), true);

  const thirdBuilder = spawnBuilderCrew(game, map, { factionId: 'player', select: false });
  assert.equal(thirdBuilder.ok, true);
  assert.equal(game.builders.filter((builder) => builder.factionId === 'player').length, 3);
  assert.equal(summarizeBuilderCapacity(game).player.free, 1);
}
