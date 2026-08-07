import { assert, equal } from './assert.mjs';
import { ComponentType } from '../src/constants/componentTypes.js';
import { EntityKind } from '../src/constants/entityKinds.js';
import { LightEmitterId } from '../src/constants/lightEmitterIds.js';
import { createDemoMap } from '../src/world/map.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { getComponent } from '../src/ecs/world.js';
import { query } from '../src/ecs/query.js';
import { buildLightViews } from '../src/game/selectors.js';
import { LIGHT_EMITTERS } from '../src/data/lightEmitters.js';
import { LIGHTING_PROFILES, LightingProfileId } from '../src/data/lightingProfiles.js';
import { SceneLightSourceKind } from '../src/data/sceneLights.js';
import { RENDER_BUDGETS } from '../src/data/renderBudgets.js';
import { createRenderLayerState, getRenderLayerStats } from '../src/projection/renderLayerState.js';

assert(LIGHTING_PROFILES[LightingProfileId.EARLY_NIGHT], 'early-night lighting profile should exist');
assert(LIGHT_EMITTERS[LightEmitterId.TORCH], 'torch light emitter recipe should exist');
assert(RENDER_BUDGETS.lightEmitters.maxActive > 0, 'light emitter render budget should exist');

const game = createInitialGameState(createDemoMap());
const lightEntities = query(game.world, [ComponentType.LightEmitter]);
equal(lightEntities.length, 2, 'only raider-type entities should have torch light emitters in the first test');

for (const entity of lightEntities) {
  const kind = getComponent(game.world, entity, ComponentType.Kind);
  const light = getComponent(game.world, entity, ComponentType.LightEmitter);
  equal(kind.type, EntityKind.RAIDER, 'first light emitters should be owned by raiders');
  equal(light.id, LightEmitterId.TORCH, 'raider light emitter should use the torch recipe');
  assert(light.radius > 0, 'torch light should declare a radius');
  assert(light.intensity > 0 && light.intensity <= 1, 'torch light should declare bounded intensity');
  assert(light.revealRadius > light.glowRadius, 'torch component should preserve split reveal/glow profile radii');
  assert(light.glowRadius > light.coreRadius, 'torch component should preserve a small core radius');
}

const dragonLight = getComponent(game.world, game.dragonId, ComponentType.LightEmitter);
equal(dragonLight, null, 'player dragon should not emit light in this slice');

game.renderTime = 12.5;
const lightViews = buildLightViews(game, game.renderTime);
const componentLightViews = lightViews.filter((light) => !light.sceneLight);
const moonlightView = lightViews.find((light) => light.sourceKind === SceneLightSourceKind.MOONLIGHT);
equal(componentLightViews.length, lightEntities.length, 'component light views should be derived from LightEmitter components');
equal(moonlightView, undefined, 'moonlight should be disabled by default while the cloud pass is under review');
assert(lightViews.every((light) => light.renderTime === game.renderTime), 'light views should receive render time for bounded flicker');
const torchView = componentLightViews[0];
assert(torchView.revealRadius > torchView.radius && torchView.radius === torchView.glowRadius, 'light view radius should represent controlled glow while revealRadius stays broader');
assert(torchView.revealStrength > torchView.intensity && torchView.intensity === torchView.glowStrength, 'light view intensity should represent controlled glow while revealStrength stays broader');

const renderLayers = createRenderLayerState();
renderLayers.lighting.activeLights = lightViews.length;
renderLayers.lighting.droppedLights = Math.max(0, lightViews.length - RENDER_BUDGETS.lightEmitters.maxActive);
const stats = getRenderLayerStats(renderLayers);
equal(stats.activeLights, lightViews.length, 'render stats should expose active light count');
equal(stats.lightBudgetMax, RENDER_BUDGETS.lightEmitters.maxActive, 'render stats should expose light budget');
