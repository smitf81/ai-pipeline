import { readFileSync } from 'node:fs';
import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { LightingProfileId, LIGHTING_PROFILES } from '../src/data/lightingProfiles.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { buildLightViews } from '../src/game/selectors.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { createCamera } from '../src/render/camera.js';
import {
  WEBGL_ILLUMINATION_COMPOSITE_MODE,
  WEBGL_ILLUMINATION_FIELD_MODE
} from '../src/render/backends/webgl/WebGLIlluminationPipeline.js';
import { WebGLLightingLayer } from '../src/render/backends/webgl/layers/WebGLLightingLayer.js';
import { createDemoMap } from '../src/world/map.js';

const profile = LIGHTING_PROFILES[LightingProfileId.EARLY_NIGHT];
equal(profile.illuminationModel, 'ambient_plus_world_light_rgb_field_v1', 'lighting data should name illumination as the primary quantity');
equal(profile.illuminationCompositeMode, WEBGL_ILLUMINATION_COMPOSITE_MODE, 'lighting data should name the world-colour multiplication contract');
assert(profile.ambientIllumination > 0 && profile.ambientIllumination < 0.2, 'night ambient should remain present but near zero');
assert(!Object.hasOwn(profile, 'darknessOpacity'), 'lighting data should not retain a global darkness-overlay opacity');
assert(!Object.hasOwn(profile, 'darknessColour'), 'lighting data should not retain a global darkness-overlay colour');

const map = createDemoMap();
const game = createInitialGameState(map);
game.renderTime = 2.4;
game.lights = buildLightViews(game, game.renderTime);
const camera = createCamera({ clientWidth: 1280, clientHeight: 720 }, map);
const projection = buildRenderProjection({ game, map, camera, time: game.renderTime }, CONFIG);
equal(projection.lightingProfile.illuminationModel, profile.illuminationModel, 'renderer-neutral projection should carry the illumination model');
equal(projection.lightingProfile.ambientIllumination, profile.ambientIllumination, 'renderer-neutral projection should carry ambient illumination');
assert(!Object.hasOwn(projection.lightingProfile, 'darknessOpacity'), 'renderer-neutral projection should not recreate darkness-overlay data');

const layer = new WebGLLightingLayer();
layer.update(projection, fakeContext(camera));
const stats = layer.statsFields();
equal(stats.illuminationModel, WEBGL_ILLUMINATION_FIELD_MODE, 'live layer should report its additive RGB field');
equal(stats.illuminationCompositeMode, WEBGL_ILLUMINATION_COMPOSITE_MODE, 'live layer should report world-colour multiplication');
equal(stats.overlayCount, 0, 'live lighting should submit no global darkness rectangle');
assert(!Object.hasOwn(stats, 'darknessMode'), 'live lighting diagnostics should not advertise a darkness mode');
assert(stats.influenceCount > 0, 'world-owned emitters should contribute illumination primitives');

const illuminationSource = readFileSync(new URL('../src/render/backends/webgl/WebGLIlluminationPipeline.js', import.meta.url), 'utf8');
const lightingSource = readFileSync(new URL('../src/render/backends/webgl/layers/WebGLLightingLayer.js', import.meta.url), 'utf8');
const postProcessSource = readFileSync(new URL('../src/render/backends/webgl/WebGLPostProcessPipeline.js', import.meta.url), 'utf8');
const rendererSource = readFileSync(new URL('../src/render/backends/webgl/WebGLGameRenderer.js', import.meta.url), 'utf8');
equal(illuminationSource.includes('scene.rgb * illumination'), true, 'GPU composite should multiply the scene by accumulated illumination');
equal(illuminationSource.includes('gl.clearColor(ambientColour[0], ambientColour[1], ambientColour[2], 1)'), true, 'illumination field should begin from low ambient contribution');
equal(illuminationSource.includes('scene.drawWorldRadialLights(lightInfluences, camera)'), true, 'world lights should add to the illumination field');
equal(illuminationSource.includes('scene.drawTriangles(attenuationTriangles, camera)'), true, 'cloud occlusion should attenuate the light field');
equal(lightingSource.includes('overlayRects'), false, 'lighting layer should contain no global darkness rectangle path');
equal(postProcessSource.includes('getActiveSceneTexture'), true, 'post-process owner should expose the current world target to illumination');
equal(postProcessSource.includes('setActiveSceneTarget'), true, 'post-process owner should accept the lit world target for downstream atmosphere');
equal(rendererSource.includes('new WebGLIlluminationPipeline'), true, 'live renderer should own the illumination pipeline');
equal(rendererSource.indexOf('new WebGLLightingLayer') < rendererSource.indexOf('new WebGLFogSmokeLayer'), true, 'fog/smoke should remain downstream of world illumination');
equal(rendererSource.indexOf('new WebGLLightingLayer') < rendererSource.indexOf('new WebGLAtmosphericOverlayLayer'), true, 'camera atmosphere should remain downstream of world illumination');

function fakeContext(cameraState) {
  return {
    camera: {
      x: cameraState.x,
      y: cameraState.y,
      zoom: cameraState.zoom,
      viewportW: cameraState.viewportW,
      viewportH: cameraState.viewportH,
      visibleWorldBounds() {
        return { left: -10000, top: -10000, right: 10000, bottom: 10000 };
      }
    }
  };
}
