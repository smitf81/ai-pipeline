import { readFileSync } from 'node:fs';
import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { LightEmitterId } from '../src/constants/lightEmitterIds.js';
import { LIGHT_EMITTERS } from '../src/data/lightEmitters.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { buildLightViews, syncGameViews } from '../src/game/selectors.js';
import { buildLightProjection } from '../src/projection/lightProjection.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { createCamera } from '../src/render/camera.js';
import { EMITTER_LIGHT_COMPOSITE_MODE } from '../src/render/backends/webgl/WebGLEmitterLightComposite.js';
import { WebGLLightingLayer } from '../src/render/backends/webgl/layers/WebGLLightingLayer.js';
import { createDemoMap } from '../src/world/map.js';

const torchRecipe = LIGHT_EMITTERS[LightEmitterId.TORCH];
assert(torchRecipe.revealRadius > torchRecipe.glowRadius * 2, 'torch profile should separate broad reveal from local glow');
assert(torchRecipe.glowRadius > torchRecipe.coreRadius * 4, 'torch core should stay a tiny flame point');
assert(torchRecipe.revealStrength > torchRecipe.glowStrength, 'torch reveal should lift scenery without requiring large orange glow strength');

const [legacyProjection] = buildLightProjection([{
  id: 'legacy-torch',
  enabled: true,
  x: 4,
  y: 5,
  radius: 8,
  intensity: 0.8,
  colour: 'rgba(255,154,72,1)',
  innerColour: 'rgba(255,223,156,1)',
  sourceKind: LightEmitterId.TORCH
}], CONFIG.tileSize);
equal(legacyProjection.radius, legacyProjection.glowRadius, 'projected legacy radius should now be the visible glow radius');
assert(legacyProjection.revealRadius > legacyProjection.glowRadius * 1.9, 'legacy lights should map old radius to broader reveal by default');
assert(legacyProjection.coreRadius < legacyProjection.glowRadius * 0.4, 'legacy lights should derive a small non-nuclear core');
assert(legacyProjection.revealStrength > legacyProjection.glowStrength, 'legacy lights should map intensity into stronger reveal than visible glow');

const map = createDemoMap();
const game = createInitialGameState(map);
game.renderTime = 1.2;
syncGameViews(game);
const torchView = buildLightViews(game, game.renderTime).find((light) => light.sourceKind === LightEmitterId.TORCH);
assert(torchView, 'demo should expose a torch light view');
assert(torchView.revealRadius > torchView.radius * 2, 'live torch view should keep broad reveal separate from local radius');
assert(torchView.coreRadius < torchView.radius * 0.3, 'live torch view should keep the flame core local');

const camera = createCamera({ clientWidth: 1280, clientHeight: 720 }, map);
const projection = buildRenderProjection({ game, map, camera, time: game.renderTime }, CONFIG);
const localProjectionLight = projection.lights.find((light) => light.sourceKind === LightEmitterId.TORCH);
assert(localProjectionLight.revealRadius > localProjectionLight.glowRadius * 2, 'render projection should preserve split reveal/glow radii');
assert(localProjectionLight.revealStrength > localProjectionLight.glowStrength, 'render projection should preserve split reveal/glow strengths');

const lightingLayer = new WebGLLightingLayer();
lightingLayer.update(projection, fakeLightingContext(camera));
equal(lightingLayer.emitterCompositeMode, EMITTER_LIGHT_COMPOSITE_MODE, 'WebGL lighting should use the split emitter composite mode');
equal(lightingLayer.localRevealInfluences.length, lightingLayer.localGlowInfluences.length, 'local reveal/glow buckets should stay paired');
equal(lightingLayer.localGlowInfluences.length, lightingLayer.localCoreInfluences.length, 'local glow/core buckets should stay paired');
assert(lightingLayer.localRevealInfluences.every((influence, index) => influence.radius > lightingLayer.localGlowInfluences[index].radius), 'reveal primitives should be broader than visible glow primitives');
assert(lightingLayer.localCoreInfluences.every((influence, index) => influence.radius < lightingLayer.localGlowInfluences[index].radius * 0.45), 'core primitives should stay tiny relative to glow');
assert(lightingLayer.localGlowInfluences.every((influence) => influence.color[3] <= 0.42), 'additive glow illumination should stay capped for overlap');

const lightingSource = readFileSync(new URL('../src/render/backends/webgl/layers/WebGLLightingLayer.js', import.meta.url), 'utf8');
const sceneRootSource = readFileSync(new URL('../src/render/backends/webgl/WebGLSceneRoot.js', import.meta.url), 'utf8');
assert(lightingSource.includes('context.illumination.compositeWorld'), 'local emitters should feed the shared illumination field');
assert(sceneRootSource.includes('drawWorldRadialLights'), 'WebGL scene root should expose the additive radial illumination draw path');

function fakeLightingContext(camera) {
  return {
    camera: {
      x: camera.x,
      y: camera.y,
      zoom: camera.zoom,
      viewportW: camera.viewportW,
      viewportH: camera.viewportH,
      visibleWorldBounds() {
        return { left: -10000, top: -10000, right: 10000, bottom: 10000 };
      }
    },
    lightSpaceCulling: projection.lightSpaceCulling
  };
}
