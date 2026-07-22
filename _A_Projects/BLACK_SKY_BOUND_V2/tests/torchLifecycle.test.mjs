import { assert } from './assert.mjs';
import { createDemoMap } from '../src/world/map.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { getComponent } from '../src/ecs/world.js';
import { query } from '../src/ecs/query.js';
import { applyDamageToEntity } from '../src/systems/healthSystem.js';
import { humanoidProjectionSystem } from '../src/systems/humanoidProjectionSystem.js';
import { torchLifecycleSystem } from '../src/systems/torchLifecycleSystem.js';
import { buildLightViews } from '../src/game/selectors.js';
import { syncGameViews } from '../src/game/selectors.js';
import { buildSmokeSourceViews } from '../src/projection/smokeLayerState.js';
import { SmokeSourceKind } from '../src/data/smokeSources.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { CONFIG } from '../src/config.js';
import { createCamera } from '../src/render/camera.js';

const map = createDemoMap();
const game = createInitialGameState(map);
humanoidProjectionSystem({ game, dt: 1 / 60 });
torchLifecycleSystem({ game, dt: 1 / 60 });
syncGameViews(game);

const raider = query(game.world, [
  ComponentType.Transform,
  ComponentType.Health,
  ComponentType.LightEmitter,
  ComponentType.HumanoidProjection
])[0];
const light = getComponent(game.world, raider, ComponentType.LightEmitter);
const humanoid = getComponent(game.world, raider, ComponentType.HumanoidProjection);
const liveLight = buildLightViews(game, 0).find((item) => item.id === raider);
const liveProjection = buildProjectionSnapshot(game, map, 0);

assert(humanoid.torchState?.mode === 'carried', 'live torch should expose a carried torch state');
assert(liveLight?.enabled, 'live carried torch should project an enabled light');
assert(buildSmokeSourceViews(game).filter((source) => source.sourceKind === SmokeSourceKind.TORCH_WISP && source.sourceId === raider).length >= 2, 'carried torch should project both core and trailing smoke wisps');
assert((liveProjection.droppedTorches ?? []).every((item) => item.sourceEntityId !== raider), 'live raider should not project a dropped torch prop');

const health = getComponent(game.world, raider, ComponentType.Health);
applyDamageToEntity(game.world, raider, health.hp + 1, game.dragonId, 'torch_lifecycle_test');
torchLifecycleSystem({ game, dt: 0.6 });
syncGameViews(game);

const droppedLight = buildLightViews(game, 0.6).find((item) => item.id === raider);
const droppedProjection = buildProjectionSnapshot(game, map, 0.6);
const droppedTorch = droppedProjection.droppedTorches.find((item) => item.sourceEntityId === raider);
assert(light.lifecycleState !== 'carried', 'defeated torch should leave the carried state');
assert(light.defeatedElapsed > 0, 'defeated torch should track elapsed fade time');
assert(humanoid.torchState?.mode !== 'carried', 'defeated torch should move into a dropped state');
assert(droppedLight?.enabled, 'defeated torch should remain lit briefly after the raider dies');
assert(Math.hypot((droppedLight?.x ?? 0) - liveLight.x, (droppedLight?.y ?? 0) - liveLight.y) > 0.12, 'defeated torch light should visibly drop away from the carried socket');
assert((droppedLight?.intensity ?? 0) < liveLight.intensity, 'defeated torch should already start dimming after the drop');
assert(droppedTorch, 'defeated torch should project a dropped torch prop packet');
assert(['falling', 'grounded'].includes(droppedTorch.mode), 'dropped torch prop should mirror the falling or grounded lifecycle');
assert(Math.hypot((droppedTorch.flameWorldX ?? 0) / CONFIG.tileSize - liveLight.x, (droppedTorch.flameWorldY ?? 0) / CONFIG.tileSize - liveLight.y) > 0.12, 'dropped torch prop flame should move away from the carried socket');
assert(droppedProjection.actors.every((actor) => actor.id !== raider), 'defeated raider actor packet should stay absent while the dropped torch prop remains');
assert((droppedTorch.render?.flameAlpha ?? 0) > 0.05, 'defeated dropped torch prop should still render a live flame while the light is fading');

for (let step = 0; step < 110; step += 1) {
  torchLifecycleSystem({ game, dt: 0.1 });
}

const fadedLight = buildLightViews(game, 11.6).find((item) => item.id === raider);
syncGameViews(game);
const fadedProjection = buildProjectionSnapshot(game, map, 11.6);
const fadedTorch = fadedProjection.droppedTorches.find((item) => item.sourceEntityId === raider);
assert(light.enabled === false, 'defeated torch should eventually extinguish');
assert(light.lifecycleState === 'extinguished', 'defeated torch should report an extinguished lifecycle state');
assert(fadedLight?.enabled === false, 'extinguished torch should no longer contribute an active light view');
assert(buildSmokeSourceViews(game).every((source) => !(source.sourceKind === SmokeSourceKind.TORCH_WISP && source.sourceId === raider)), 'extinguished torches should stop contributing smoke wisps');
assert(fadedTorch, 'extinguished torches should leave behind a grounded dropped torch prop');
assert(fadedTorch.mode === 'extinguished', 'dropped torch prop should preserve the extinguished lifecycle state');
assert((fadedTorch.render?.flameAlpha ?? 1) === 0, 'extinguished dropped torch prop should stop rendering an active flame');
assert((fadedTorch.render?.shaftAlpha ?? 1) < (droppedTorch.render?.shaftAlpha ?? 1), 'dropped torch prop should darken as it fades out');

function buildProjectionSnapshot(game, map, time) {
  return buildRenderProjection({
    time,
    map,
    game,
    camera: createCamera({ clientWidth: 1280, clientHeight: 720 }, map)
  }, CONFIG);
}
