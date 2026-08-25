import { assert, equal } from './assert.mjs';
import { AbilityId } from '../src/constants/abilityIds.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { InstinctId } from '../src/constants/instinctIds.js';
import { getComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import {
  captureAbilityProgressionInProfile,
  createDefaultPlayerProfile,
  createPlayerProfileStore
} from '../src/game/playerProfile.js';
import {
  applyFirstPlaythroughInstinctAvailability,
  canUseAbility
} from '../src/game/playerAbilities.js';
import { createPauseMenuState } from '../src/game/pause.js';
import { buildPauseMenuProjection } from '../src/projection/tutorialProjection.js';
import { buildThreePauseView } from '../src/render/backends/three/ThreePauseScreenLayer.js';
import { createDemoMap } from '../src/world/map.js';

const map = createDemoMap();
const freshProfile = createDefaultPlayerProfile();
const deferredGame = createInitialGameState(map, { playerProfile: freshProfile });
const deferred = applyFirstPlaythroughInstinctAvailability(
  deferredGame.world,
  deferredGame.dragonId,
  [InstinctId.SMOKE_VEIL],
  { deferredInstinctIds: [InstinctId.SMOKE_VEIL] }
);
equal(deferred.applied, false, 'an authored arrival awakening must retain authority over its deferred instinct');
assert(deferred.deferredInstinctIds.includes(InstinctId.SMOKE_VEIL));
assert(!canUseAbility(deferredGame.world, deferredGame.dragonId, AbilityId.SMOKE_BURST));

const directGame = createInitialGameState(map, { playerProfile: freshProfile });
const direct = applyFirstPlaythroughInstinctAvailability(
  directGame.world,
  directGame.dragonId,
  [InstinctId.SMOKE_VEIL],
  { source: 'test:direct_ash_entry' }
);
equal(direct.applied, true, 'direct first-playthrough Ash entry should apply its authored instinct baseline');
assert(canUseAbility(directGame.world, directGame.dragonId, AbilityId.SMOKE_BURST));
const progression = getComponent(directGame.world, directGame.dragonId, ComponentType.AbilityProgression);
assert(progression.discoveredInstincts.includes(InstinctId.SMOKE_VEIL));
assert(progression.consumedUnlockEvents.includes('instinct_smoke_awakened'));

const storage = memoryStorage();
const store = createPlayerProfileStore(storage);
store.save(captureAbilityProgressionInProfile(directGame.world, directGame.dragonId, freshProfile));
const reloadedProfile = store.load();
assert(reloadedProfile.progression.discoveredInstinctIds.includes(InstinctId.SMOKE_VEIL), 'discovered instinct identity must survive profile reload');
assert(reloadedProfile.progression.unlockedAbilityIds.includes(AbilityId.SMOKE_BURST), 'Smoke gameplay grant must survive profile reload');
const reloadedGame = createInitialGameState(map, { playerProfile: reloadedProfile });
assert(canUseAbility(reloadedGame.world, reloadedGame.dragonId, AbilityId.SMOKE_BURST), 'Smoke must remain usable after reload');

const menu = buildPauseMenuProjection({
  game: reloadedGame,
  playerProfile: reloadedProfile,
  pauseMenu: createPauseMenuState(),
  camera: { viewportW: 1365, viewportH: 768 }
});
equal(menu.instincts.length, 5);
const smokeVeil = menu.instincts.find((entry) => entry.instinctId === InstinctId.SMOKE_VEIL);
assert(smokeVeil.discovered && smokeVeil.displayName === 'SMOKE VEIL' && smokeVeil.inputSummary === 'TAP RMB');
assert(smokeVeil.stoneAssetUrl.endsWith('smoke-veil-stone.png'));
const locked = menu.instincts.filter((entry) => !entry.discovered);
equal(locked.length, 4);
assert(locked.every((entry) => entry.displayName === 'UNDISCOVERED' && entry.nature == null));
const view = buildThreePauseView(menu);
equal(view.instincts.length, 5, 'the real Three.js pause layer must consume the shared instinct projection');
assert(view.layout.instinctsPanel.x > view.controls[0].x, 'the instinct stones should own the middle pause-menu panel');

const ngPlusGame = createInitialGameState(map, { playerProfile: freshProfile });
const excluded = applyFirstPlaythroughInstinctAvailability(
  ngPlusGame.world,
  ngPlusGame.dragonId,
  [InstinctId.SMOKE_VEIL],
  { enabled: false }
);
equal(excluded.applied, false, 'first-playthrough region defaults must not silently define NG+ policy');
assert(!canUseAbility(ngPlusGame.world, ngPlusGame.dragonId, AbilityId.SMOKE_BURST));

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); }
  };
}
