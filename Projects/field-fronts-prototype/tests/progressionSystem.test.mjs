import assert from 'node:assert/strict';

import { UNIT_OPTIONS, BUILDING_OPTIONS, getBuildOption } from '../src/game/buildCatalog.js';
import {
  PROGRESSION_STAGE_IDS,
  createInitialProgressionState,
  getBuildOptionLockReason,
  isBuildOptionUnlocked,
  listUnlockedBuildOptions,
  normaliseProgressionState
} from '../src/game/progressionSystem.js';
import { createInitialGameState, serializeGameState, deserializeGameState } from '../src/game/gameModel.js';
import { createBlankMap } from '../src/world/mapModel.js';

export function run() {
  const progression = createInitialProgressionState();
  assert.equal(progression.stage, PROGRESSION_STAGE_IDS.tribalCamp);

  const unlockedUnits = listUnlockedBuildOptions(progression, UNIT_OPTIONS).map((option) => option.id);
  assert.deepEqual(unlockedUnits, ['builder', 'warrior']);

  const unlockedBuildings = listUnlockedBuildOptions(progression, BUILDING_OPTIONS).map((option) => option.id);
  assert.equal(unlockedBuildings.includes('hunting_tent'), true);
  assert.equal(unlockedBuildings.includes('wood_gathering_post'), true);
  assert.equal(unlockedBuildings.includes('builder_lodge'), true);
  assert.equal(unlockedBuildings.includes('watchtower'), false);
  assert.equal(unlockedBuildings.includes('fort'), false);

  const infantry = getBuildOption('unit', 'infantry');
  assert.equal(isBuildOptionUnlocked(progression, infantry), false);
  assert.equal(getBuildOptionLockReason(progression, infantry).unlockStage, PROGRESSION_STAGE_IDS.village);

  const village = normaliseProgressionState({ stage: PROGRESSION_STAGE_IDS.village });
  assert.equal(isBuildOptionUnlocked(village, infantry), true);
  assert.equal(isBuildOptionUnlocked(village, getBuildOption('building', 'watchtower')), true);
  assert.equal(isBuildOptionUnlocked(village, getBuildOption('building', 'fort')), false);

  const city = normaliseProgressionState({ stage: PROGRESSION_STAGE_IDS.city });
  assert.equal(isBuildOptionUnlocked(city, getBuildOption('building', 'fort')), true);
  assert.equal(isBuildOptionUnlocked(city, getBuildOption('unit', 'command')), true);

  const map = createBlankMap({ width: 30, height: 20, fill: 'land' });
  const game = createInitialGameState(map);
  assert.equal(game.progression.stage, PROGRESSION_STAGE_IDS.tribalCamp);
  const restored = deserializeGameState(serializeGameState(game, map), map);
  assert.equal(restored.progression.stage, PROGRESSION_STAGE_IDS.tribalCamp);
}
