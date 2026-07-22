import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import {
  ATMOSPHERIC_CAMERA_OVERLAY_MODE,
  ATMOSPHERIC_CAMERA_OVERLAY_TUNING,
  resolveAtmosphericOverlayTuning
} from '../src/data/atmosphericOverlay.js';
import { RENDER_BUDGETS } from '../src/data/renderBudgets.js';
import { createInitialGameState } from '../src/game/state.js';
import {
  ATMOSPHERIC_EMITTER_PROJECTION_MODE,
  buildAtmosphericEmitterProjection
} from '../src/projection/atmosphericEmitterProjection.js';
import { buildAtmosphericOverlayProjection } from '../src/projection/atmosphericOverlayProjection.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { createCamera } from '../src/render/camera.js';
import { WebGLAtmosphericOverlayLayer } from '../src/render/backends/webgl/layers/WebGLAtmosphericOverlayLayer.js';
import { createDemoMap } from '../src/world/map.js';

equal(ATMOSPHERIC_CAMERA_OVERLAY_TUNING.rainEnabled, true, 'rain should be enabled by default');
equal(ATMOSPHERIC_CAMERA_OVERLAY_TUNING.sparkEnabled, true, 'sparks should be enabled by default');
assert(ATMOSPHERIC_CAMERA_OVERLAY_TUNING.rainDensity >= 0.85 && ATMOSPHERIC_CAMERA_OVERLAY_TUNING.rainDensity <= 1, 'rain density should stay visibly present by default');
assert(ATMOSPHERIC_CAMERA_OVERLAY_TUNING.sparkRate > 2 && ATMOSPHERIC_CAMERA_OVERLAY_TUNING.sparkRate <= 4, 'default sparks should be present enough to read in-scene');
assert(ATMOSPHERIC_CAMERA_OVERLAY_TUNING.overlayOpacity >= 0.8 && ATMOSPHERIC_CAMERA_OVERLAY_TUNING.overlayOpacity <= 0.95, 'overlay opacity should preserve user-authored visible weather tuning');
equal(ATMOSPHERIC_CAMERA_OVERLAY_TUNING.emitterReactiveOverlayEnabled, true, 'emitter reaction should be enabled by default');
assert(ATMOSPHERIC_CAMERA_OVERLAY_TUNING.maxAtmosphereEmitters > 0 && ATMOSPHERIC_CAMERA_OVERLAY_TUNING.maxAtmosphereEmitters <= 16, 'emitter reaction should stay capped');
equal(RENDER_BUDGETS.atmosphericCameraOverlay.policy, 'screen_space_camera_overlay_visual_only_v0', 'render budget should name the visual-only overlay owner');
equal(RENDER_BUDGETS.atmosphericCameraOverlay.maxEmitterInfluences, 16, 'overlay emitter budget should cap projected warm emitters without hiding authored clusters');

const clamped = resolveAtmosphericOverlayTuning({
  rainDensity: 12,
  rainSpeed: -20,
  rainAngle: 90,
  sparkRate: 99,
  sparkDrift: { x: -999, y: 999 },
  overlayOpacity: 3,
  maxAtmosphereEmitters: 99,
  rainLightCatchStrength: 3,
  rainWarmTintStrength: 3,
  sparkLightCatchStrength: 3,
  emitterInfluenceFalloff: 99
});
equal(clamped.rainDensity, 1, 'rain density should clamp to the safe upper bound');
equal(clamped.rainSpeed, 120, 'rain speed should clamp to the safe lower bound');
equal(clamped.rainAngle, 42, 'rain angle should clamp to the safe upper bound');
equal(clamped.sparkRate, 8, 'spark rate should clamp to the budgeted upper bound');
equal(clamped.sparkDrift.x, -180, 'spark drift x should clamp');
equal(clamped.sparkDrift.y, 60, 'spark drift y should clamp');
equal(clamped.overlayOpacity, 1, 'overlay opacity should clamp');
equal(clamped.maxAtmosphereEmitters, 16, 'emitter cap tuning should clamp');
equal(clamped.rainLightCatchStrength, 1, 'rain light catch should clamp');
equal(clamped.rainWarmTintStrength, 1, 'rain warm tint should clamp');
equal(clamped.sparkLightCatchStrength, 1, 'spark light catch should clamp');
equal(clamped.emitterInfluenceFalloff, 4, 'emitter falloff should clamp');

const projectionCamera = { x: 100, y: 100, zoom: 2, viewportW: 1280, viewportH: 720 };
const warmEmitters = buildAtmosphericEmitterProjection({
  camera: projectionCamera,
  maxEmitters: 2,
  lights: [
    warmProjectionLight('torch-a', 100, 100, 96, 0.68, 'torch'),
    warmProjectionLight('napalm-a', 132, 104, 74, 0.82, 'napalm_pool_light'),
    warmProjectionLight('offscreen-fire', 900, 900, 96, 1, 'raid_flame'),
    { ...warmProjectionLight('moon', 100, 100, 2000, 1, 'moonlight_scene_emission'), sourceAnchor: { type: 'scene_light', id: 'moon' } }
  ]
});
equal(warmEmitters.length, 2, 'emitter projection should cap to nearest/strongest visible warm sources');
equal(warmEmitters[0].mode, ATMOSPHERIC_EMITTER_PROJECTION_MODE, 'emitter projection should name its cheap screen-space mode');
const centeredEmitter = warmEmitters.find((emitter) => emitter.id === 'torch-a');
assert(centeredEmitter, 'centered torch should survive projection filtering');
equal(centeredEmitter.screenX, 640, 'world light x should project into screen space');
equal(centeredEmitter.screenY, 360, 'world light y should project into screen space');
assert(warmEmitters.every((emitter) => emitter.screenRadius <= 190), 'screen emitter radius should remain local and bounded');
assert(warmEmitters.every((emitter) => !String(emitter.sourceKind).includes('moonlight')), 'cold broad scene lights should not tint the atmosphere overlay');

const fallbackEmitters = buildAtmosphericEmitterProjection({
  camera: projectionCamera,
  lights: [{ enabled: true, get sourceKind() { throw new Error('bad emitter packet'); } }]
});
equal(fallbackEmitters.length, 0, 'emitter projection should fail closed to a normal overlay');

const map = createDemoMap();
const game = createInitialGameState(map);
const state = {
  time: 2.25,
  map,
  game,
  camera: createCamera({ clientWidth: 1280, clientHeight: 720 }, map)
};
const projection = buildRenderProjection(state, CONFIG);
equal(projection.atmosphericOverlay.classification, 'renderer_neutral_camera_atmospheric_overlay_projection', 'render projection should carry the camera-space overlay packet');
equal(projection.atmosphericOverlay.mode, ATMOSPHERIC_CAMERA_OVERLAY_MODE, 'overlay projection should name the v0 mode');
equal(projection.atmosphericOverlay.tuning.rainAngle, ATMOSPHERIC_CAMERA_OVERLAY_TUNING.rainAngle, 'projection should carry rain angle tuning');
assert(Array.isArray(projection.atmosphericOverlay.emitters), 'overlay projection should carry a capped emitter influence list');
assert(projection.atmosphericOverlay.emitters.length <= projection.atmosphericOverlay.tuning.maxAtmosphereEmitters, 'overlay projection should enforce the emitter cap');

const overlayEmitterDisabled = buildAtmosphericOverlayProjection({
  renderTime: 1.1,
  camera: projectionCamera,
  lights: [warmProjectionLight('torch-disabled', 100, 100, 96, 0.8, 'torch')],
  overrides: { emitterReactiveOverlayEnabled: false }
});
equal(overlayEmitterDisabled.emitters.length, 0, 'config flag should disable emitter projection without disabling the base overlay');

const layer = new WebGLAtmosphericOverlayLayer();
const originalLocation = globalThis.location;
globalThis.location = { search: '' };
layer.update({
  atmosphericOverlay: buildAtmosphericOverlayProjection({
    renderTime: 1.1,
    overrides: { rainDensity: 0.66, sparkRate: 8, overlayOpacity: 0.7 }
  })
}, fakeContext());

equal(layer.mode, ATMOSPHERIC_CAMERA_OVERLAY_MODE, 'WebGL layer should expose the camera overlay mode');
equal(layer.status, 'active', 'default overlay should produce active screen-space primitives');
assert(layer.rainStreakCount > 40, 'rain should produce a restrained field of streaks');
assert(layer.sparkActiveCount > 0, 'high proof spark rate should produce sporadic warm sparks');
equal(layer.rainPrimitiveCount, layer.rainStreakCount, 'rain should batch one tapered triangle per streak');
equal(layer.sparkPrimitiveCount, layer.sparkActiveCount * 2, 'sparks should batch one glow and one small streak');
assert(layer.triangles.every((triangle) => triangle.color[3] <= 0.16), 'screen-space overlay alpha should stay low for readability');
const rainTriangle = layer.triangles[0];
assert(rainTriangle.cy > (rainTriangle.ay + rainTriangle.by) * 0.5, 'rain streaks should travel from top/north toward lower screen space');

const reactivePacket = buildAtmosphericOverlayProjection({
  renderTime: 1.1,
  overrides: { rainDensity: 0.66, sparkRate: 8, overlayOpacity: 0.7, rainWarmTintStrength: 1, rainLightCatchStrength: 1, sparkLightCatchStrength: 1 }
});
reactivePacket.emitters = [{
  classification: 'renderer_neutral_atmosphere_emitter_influence_projection',
  mode: ATMOSPHERIC_EMITTER_PROJECTION_MODE,
  id: 'test-screen-fire',
  sourceId: 'test-screen-fire',
  sourceKind: 'torch',
  screenX: 640,
  screenY: 360,
  screenRadius: 1600,
  intensity: 1,
  warmth: 1,
  colour: 'rgba(255,154,72,1)'
}];
layer.update({ atmosphericOverlay: reactivePacket }, fakeContext());
assert(layer.rainEmitterHitCount > 0, 'rain streaks should cheaply sample projected warm emitters');
assert(layer.emitterInfluenceMax > 0.2, 'overlay should expose measured local emitter influence');
assert(layer.triangles.some((triangle) => triangle.color[0] > 0.5 && triangle.color[2] < 0.64), 'reactive rain should gain subtle warm tint near emitters');

globalThis.location = { search: '?atmosphereEmitters=0' };
layer.update({ atmosphericOverlay: reactivePacket }, fakeContext());
equal(layer.atmosphereEmitterCount, 0, 'emitter query toggle should disable only emitter reaction');
equal(layer.rainEmitterHitCount, 0, 'disabled emitter reaction should render normal cold rain');

globalThis.location = { search: '?rain=0' };
layer.update({
  atmosphericOverlay: buildAtmosphericOverlayProjection({
    renderTime: 1.1,
    overrides: { rainDensity: 0.66, sparkRate: 8, overlayOpacity: 0.7 }
  })
}, fakeContext());
equal(layer.rainStreakCount, 0, 'rain query toggle should disable rain immediately');
assert(layer.sparkActiveCount > 0, 'spark rendering should remain independently toggleable');

globalThis.location = { search: '?sparks=0' };
layer.update({
  atmosphericOverlay: buildAtmosphericOverlayProjection({
    renderTime: 1.1,
    overrides: { rainDensity: 0.66, sparkRate: 8, overlayOpacity: 0.7 }
  })
}, fakeContext());
assert(layer.rainStreakCount > 0, 'rain should remain active when only sparks are toggled off');
equal(layer.sparkActiveCount, 0, 'spark query toggle should disable sparks immediately');

globalThis.location = { search: '?atmosphere=0' };
layer.update({ atmosphericOverlay: buildAtmosphericOverlayProjection({ renderTime: 1.1 }) }, fakeContext());
equal(layer.status, 'inactive', 'master atmosphere query toggle should disable the full overlay');
equal(layer.primitiveCount, 0, 'disabled atmosphere should submit no primitives');
globalThis.location = originalLocation;

function fakeContext() {
  return {
    renderTargetWidth: 1280,
    renderTargetHeight: 720,
    camera: {
      x: 0,
      y: 0,
      zoom: 1,
      viewportW: 1280,
      viewportH: 720
    }
  };
}

function warmProjectionLight(id, worldX, worldY, radius, intensity, sourceKind) {
  return {
    id,
    enabled: true,
    worldX,
    worldY,
    radius,
    intensity,
    effectiveIntensity: intensity,
    sourceKind,
    sourceAnchor: { type: 'world_effect_object', id },
    colour: 'rgba(255, 154, 72, 1)',
    innerColour: 'rgba(255, 223, 156, 1)'
  };
}
