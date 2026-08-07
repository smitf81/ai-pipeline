import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { syncGameViews } from '../src/game/selectors.js';
import { getComponent } from '../src/ecs/world.js';
import { createCamera } from '../src/render/camera.js';
import { inputSystem } from '../src/systems/inputSystem.js';
import { wyvernProjectionSystem } from '../src/systems/wyvernProjectionSystem.js';
import { applyTuningInput, applyTuningSelectionInput, createTuningState } from '../src/tuning/tuningRuntime.js';
import { createDemoMap } from '../src/world/map.js';

const map = createDemoMap();
const game = createInitialGameState(map);
wyvernProjectionSystem({ game, dt: 1 / 60 });
syncGameViews(game);
const camera = createCamera({ clientWidth: 1280, clientHeight: 720 }, map);
const state = { game, map, camera, paused: false, tuning: createTuningState() };
const toggleInput = fakeInput({ pressed: ['`'] });
equal(applyTuningInput(state, toggleInput), true, 'backtick should toggle tuning mode');
assert(state.tuning.active && state.paused && game.paused, 'tuning mode should pause gameplay simulation');
equal(state.tuning.selectedEntityId, game.dragonId, 'tuning mode should default-select the player wyvern');

const dragon = game.actors.find((actor) => actor.id === game.dragonId);
const bounds = dragon.wyvernProjection.rigPose.visualBounds;
const click = fakeInput({
  clicks: [0],
  pointer: {
    x: ((bounds.minX + bounds.maxX) * 0.5) * CONFIG.tileSize - camera.x,
    y: ((bounds.minY + bounds.maxY) * 0.5) * CONFIG.tileSize - camera.y
  }
});
equal(applyTuningSelectionInput(state, click), true, 'tuning click should be consumed for entity selection');
equal(state.tuning.selectedEntityId, game.dragonId, 'visual bounds selection should select the wyvern');

const intent = getComponent(game.world, game.dragonId, ComponentType.PlayerIntent);
intent.melee = true;
intent.smoke = true;
inputSystem({ state, input: fakeInput({ clicks: [0, 2], pressed: [' '] }) });
assert(!intent.melee && !intent.bite && !intent.smoke && !intent.lunge, 'tuning mode should zero player combat intent and consume clicks');

function fakeInput({ pressed = [], clicks = [], pointer = { x: 0, y: 0 } } = {}) {
  const pressedSet = new Set(pressed);
  const clickSet = new Set(clicks);
  return {
    pointer,
    wasPressed(key) { return pressedSet.has(key); },
    isDown() { return false; },
    consumePointerClick(button) {
      const hit = clickSet.has(button);
      clickSet.delete(button);
      return hit;
    }
  };
}
