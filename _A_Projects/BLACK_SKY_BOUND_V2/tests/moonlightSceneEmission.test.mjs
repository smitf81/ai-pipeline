import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { query } from '../src/ecs/query.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { buildLightViews } from '../src/game/selectors.js';
import { DEFAULT_SCENE_LIGHT_IDS, SceneLightId, SceneLightSourceKind, createSceneLights } from '../src/data/sceneLights.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { createCamera } from '../src/render/camera.js';
import { WebGLLightingLayer } from '../src/render/backends/webgl/layers/WebGLLightingLayer.js';
import { buildWebGLStatsSummary, createWebGLRenderStats } from '../src/render/backends/webgl/WebGLRenderStats.js';
import { buildMoonlightCloudOcclusion } from '../src/render/backends/webgl/WebGLMoonlightOcclusion.js';
import { createDemoMap } from '../src/world/map.js';

const map = createDemoMap();
const game = createInitialGameState(map);

equal(DEFAULT_SCENE_LIGHT_IDS.includes(SceneLightId.MOONLIGHT), false, 'default scene lights should keep moonlight disabled for now');
equal(game.sceneLights.some((light) => light.id === SceneLightId.MOONLIGHT), false, 'game state should not create the moonlight source by default');

const torchEmitterEntities = query(game.world, [ComponentType.LightEmitter]);
game.renderTime = 0;
game.lights = buildLightViews(game, 0);
const moonView = game.lights.find((light) => light.sourceKind === SceneLightSourceKind.MOONLIGHT);
const sceneObjectLightViews = game.lights.filter((light) => light.sourceAnchor?.type === 'scene_object');
equal(moonView, undefined, 'default shared light views should not include moonlight while the cloud layer is disabled');
equal(game.lights.length, torchEmitterEntities.length + sceneObjectLightViews.length, 'default light views should include local emitters and scene-object lights without a moonlight addend');
assert(game.lights.every((light) => ['scene_object', 'world_entity', 'world_effect_object'].includes(light.sourceAnchor?.type)), 'every default live light view should identify a world/entity source anchor');

const projection = buildProjectionAt(0);
equal(projection.lights.some((light) => light.sourceKind === SceneLightSourceKind.MOONLIGHT), false, 'default renderer projection should not emit moonlight');
equal(projection.occlusionShadows.shadowFieldPackets.some((packet) => packet.lightId === SceneLightId.MOONLIGHT), false, 'default shadow projection should not carry moonlight packets');

const lightingLayer = new WebGLLightingLayer();
lightingLayer.update(projection, fakeLightingContext(projection));
const stats = lightingLayer.statsFields();
equal(stats.moonlightSceneLightCount, 0, 'WebGL lighting should count no default moonlight source');
equal(stats.moonlightCloudPrimitiveCount, 0, 'WebGL lighting should build no moonlight cloud primitives by default');
equal(stats.moonlightCloudOcclusionMode, null, 'WebGL lighting should expose no cloud-attenuation mode when moonlight is absent');
equal(Object.hasOwn(lightingLayer, 'moonlightBounceInfluences'), false, 'WebGL lighting must not own camera-centered bounce light primitives');
equal(Object.hasOwn(stats, 'moonlightBounceRegisterCount'), false, 'lighting diagnostics must not advertise removed camera-centered light registers');
const rendererStats = createWebGLRenderStats(['lighting']);
Object.assign(rendererStats.layers.lighting, stats);
equal(Object.hasOwn(buildWebGLStatsSummary(rendererStats).layers.lighting, 'moonlightBounceRegisterCount'), false, 'renderer stats summaries must not restore removed camera-centered light fields');

const explicitMoonlight = createSceneLights([SceneLightId.MOONLIGHT])[0];
assert(explicitMoonlight, 'moonlight definition should remain available for a future explicit opt-in');
equal(explicitMoonlight.classification, 'world_owned_scene_emission_light', 'moonlight should remain authored as world scene light data');
equal(explicitMoonlight.sourceKind, SceneLightSourceKind.MOONLIGHT, 'moonlight should expose a stable scene source kind when explicitly requested');
assert(explicitMoonlight.sourcePolicy.includes('not_player_or_camera_following'), 'moonlight source policy should reject player/camera following');
assert(explicitMoonlight.intensity < 0.3, 'moonlight authoring should stay subtle enough to avoid a washed-out scene when restored');
assert(explicitMoonlight.cloudOcclusion?.enabled, 'the opt-in moonlight definition may still carry the existing cloud occlusion authoring');
equal(explicitMoonlight.bounce, undefined, 'moonlight must not declare camera-bounded indirect-light registers');

const disabledCloudProjection = {
  cloudOcclusion: { ...explicitMoonlight.cloudOcclusion, enabled: false },
  direction: explicitMoonlight.direction ?? { x: 0.58, y: 0.82 }
};
const emptyCloud = buildMoonlightCloudOcclusion(disabledCloudProjection, { camera: createCamera({ clientWidth: 1280, clientHeight: 720 }, map) }, projection.lightingProfile);
equal(emptyCloud.primitiveCount, 0, 'disabled moonlight cloud occlusion should produce no screen/world streak primitives');

function buildProjectionAt(time) {
  game.renderTime = time;
  game.lights = buildLightViews(game, time);
  return buildRenderProjection({ time, map, game, camera: createCamera({ clientWidth: 1280, clientHeight: 720 }, map) }, CONFIG);
}

function fakeLightingContext(projection) {
  return {
    camera: {
      x: 0,
      y: 0,
      zoom: 1,
      viewportW: 1280,
      viewportH: 720,
      visibleWorldBounds(paddingPx = 0) {
        const pad = paddingPx;
        return { left: -pad, top: -pad, right: 1280 + pad, bottom: 720 + pad };
      }
    },
    lightSpaceCulling: projection.lightSpaceCulling
  };
}
