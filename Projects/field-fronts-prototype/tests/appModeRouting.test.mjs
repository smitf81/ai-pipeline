import assert from 'node:assert/strict';
import {
  EXPERIENCE_MODES,
  shouldShowDeveloperPanel,
  shouldShowGameDebugVisuals,
  shouldShowMapAuthoringVisuals
} from '../src/core/appModes.js';

export function run() {
  assert.equal(shouldShowDeveloperPanel({ uiScreen: 'game', experienceMode: EXPERIENCE_MODES.GAME }), false);
  assert.equal(shouldShowDeveloperPanel({ uiScreen: 'game', experienceMode: EXPERIENCE_MODES.SIM_DEBUG }), true);
  assert.equal(shouldShowDeveloperPanel({ uiScreen: 'game', experienceMode: EXPERIENCE_MODES.MAP_MAKER }), true);
  assert.equal(shouldShowDeveloperPanel({ uiScreen: 'pause', experienceMode: EXPERIENCE_MODES.SIM_DEBUG }), false);

  assert.equal(shouldShowGameDebugVisuals({ experienceMode: EXPERIENCE_MODES.GAME }), false);
  assert.equal(shouldShowGameDebugVisuals({ experienceMode: EXPERIENCE_MODES.SIM_DEBUG }), true);
  assert.equal(shouldShowGameDebugVisuals({ experienceMode: EXPERIENCE_MODES.MAP_MAKER }), false);

  assert.equal(shouldShowMapAuthoringVisuals({ experienceMode: EXPERIENCE_MODES.GAME }), false);
  assert.equal(shouldShowMapAuthoringVisuals({ experienceMode: EXPERIENCE_MODES.SIM_DEBUG }), false);
  assert.equal(shouldShowMapAuthoringVisuals({ experienceMode: EXPERIENCE_MODES.MAP_MAKER }), true);
}
