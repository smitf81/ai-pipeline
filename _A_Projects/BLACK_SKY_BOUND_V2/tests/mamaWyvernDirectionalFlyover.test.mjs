import { readFile } from 'node:fs/promises';
import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import {
  MAMA_WYVERN_HEADING_POLICY,
  MAMA_WYVERN_WORLD_EVENT,
  MamaWyvernEventKind,
  mamaWorldEventAngle,
  queueMamaWyvernWorldEvent
} from '../src/data/mamaWyvernWorldEvents.js';
import { angularDistanceRadians } from '../src/data/mamaWyvernTrajectory.js';
import { getComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { syncGameViews } from '../src/game/selectors.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { createCamera } from '../src/render/camera.js';
import {
  MAMA_WYVERN_AERIAL_PROFILE,
  WEBGL_MAMA_WYVERN_AERIAL_MODE,
  buildWebGLMamaWyvernAerialSilhouette
} from '../src/render/backends/webgl/WebGLMamaWyvernSilhouette.js';
import { WebGLWorldEventLayer } from '../src/render/backends/webgl/layers/WebGLWorldEventLayer.js';
import { worldEventSystem } from '../src/systems/worldEventSystem.js';
import { createDemoMap } from '../src/world/map.js';

assert(MAMA_WYVERN_WORLD_EVENT.timing.flyoverSeconds >= 0.9 && MAMA_WYVERN_WORLD_EVENT.timing.flyoverSeconds <= 1.4, 'the meaningful Mama crossing should remain brief and forceful');
assert(MAMA_WYVERN_AERIAL_PROFILE.wingSpanTiles / MAMA_WYVERN_AERIAL_PROFILE.bodyLengthTiles > 1.5, 'aerial profile should be wing-dominant');
assert(MAMA_WYVERN_AERIAL_PROFILE.torsoWidthTiles / MAMA_WYVERN_AERIAL_PROFILE.bodyLengthTiles < 0.12, 'aerial profile should keep a narrow torso');
equal(MAMA_WYVERN_AERIAL_PROFILE.legPrimitiveCount, 0, 'aerial profile should not carry grounded legs');
assert(MAMA_WYVERN_AERIAL_PROFILE.wingFingerCount >= 8, 'aerial profile should retain long tapered wing fingers');

let previous = null;
const generatedHeadings = [];
for (let index = 0; index < 16; index += 1) {
  const heading = mamaWorldEventAngle(index, previous);
  if (previous != null) {
    assert(angularDistanceRadians(heading, previous) >= MAMA_WYVERN_HEADING_POLICY.minimumRepeatSeparationRadians - 1e-6, 'seeded scheduled headings should avoid near repeats');
  }
  generatedHeadings.push(heading);
  previous = heading;
}
equal(new Set(generatedHeadings.map((heading) => Math.floor(heading / (Math.PI * 0.5)))).size, 4, 'seeded headings should cover the full 360-degree circle');

const proofHeadings = [0, Math.PI * 0.5, Math.PI * 0.25, Math.PI * 1.25];
for (const heading of proofHeadings) {
  const harness = createHarness();
  queueMamaWyvernWorldEvent(harness.game.worldEvents, MamaWyvernEventKind.INFERNO, {
    angle: heading,
    source: 'directional_flyover_test'
  });
  worldEventSystem({ state: harness.state, game: harness.game, map: harness.map, dt: 0 });
  worldEventSystem({
    state: harness.state,
    game: harness.game,
    map: harness.map,
    dt: MAMA_WYVERN_WORLD_EVENT.timing.warningSeconds + MAMA_WYVERN_WORLD_EVENT.timing.flyoverSeconds * 0.52
  });

  const event = harness.game.worldEvents.activeEvent;
  const pathAngle = Math.atan2(event.endY - event.startY, event.endX - event.startX);
  assert(angularDistanceRadians(pathAngle, event.headingRadians) < 1e-6, 'trajectory should consume the canonical event heading exactly');
  assert(Math.abs(event.forwardX * event.rightX + event.forwardY * event.rightY) < 1e-6, 'event forward/right basis should remain orthogonal');
  assert(onBounds(event.startX, event.startY, event.expandedCameraBoundsAtFlyoverStart), 'entry should land on the expanded active-camera boundary');
  assert(onBounds(event.endX, event.endY, event.expandedCameraBoundsAtFlyoverStart), 'exit should land on the expanded active-camera boundary');
  assert(event.breath.active, 'breath should be active during the intended inferno strafe');
  const breathForward = dotFrom(event.breath.originX, event.breath.originY, event.breath.targetX, event.breath.targetY, event.forwardX, event.forwardY);
  assert(breathForward > 1.6, 'breath should project forward from Mama head/front');

  const wall = harness.game.worldEvents.fireWalls[0];
  assert(wall, 'inferno strafe should deposit one wall');
  const wallAngle = Math.atan2(wall.by - wall.ay, wall.bx - wall.ax);
  assert(angularDistanceRadians(wallAngle, event.headingRadians) < 1e-6, 'inferno deposit should align with the exact flight heading instead of its normal');
  assert(Math.hypot(wall.deliveryX - event.breath.targetX, wall.deliveryY - event.breath.targetY) < 1e-6, 'inferno delivery point should retain breath-target provenance');

  syncGameViews(harness.game);
  const projection = buildRenderProjection({ ...harness.state, time: 2 }, CONFIG);
  const flyover = projection.worldEvents.flyovers[0];
  equal(flyover.classification, 'dedicated_aerial_mama_wyvern_shadow_projection', 'projection should identify the dedicated aerial Mama path');
  const silhouette = buildWebGLMamaWyvernAerialSilhouette(flyover);
  equal(silhouette.mode, WEBGL_MAMA_WYVERN_AERIAL_MODE, 'all headings should use the dedicated static aerial silhouette');
  equal(silhouette.metrics.legPrimitiveCount, 0, 'rotated aerial silhouette should remain leg-free');
  const layer = new WebGLWorldEventLayer();
  layer.update(projection, { camera: visibleCamera(harness.camera) });
  assert(layer.flyoverViewportIntersecting && layer.flyoverViewportTriangleCount > 0, 'each cardinal/diagonal path should materially intersect the active player camera');
  assert(layer.deliveryBreathCount === 1 && layer.deliveryBreathPrimitiveCount <= 8, 'delivery breath should stay head-rooted and tightly bounded');
}

const layerSource = await readFile(new URL('../src/render/backends/webgl/layers/WebGLWorldEventLayer.js', import.meta.url), 'utf8');
assert(!layerSource.includes('WebGLWyvernSilhouette.js'), 'world-event rendering must not import the grounded player/baby silhouette');
assert(!layerSource.includes('buildWebGLPlayerWyvernSilhouette'), 'world-event rendering must not rebuild Mama from the grounded crawl pose');

function createHarness() {
  const map = createDemoMap();
  const game = createInitialGameState(map);
  game.worldEvents.autoEnabled = false;
  const player = getComponent(game.world, game.dragonId, ComponentType.Transform);
  const camera = createCamera({ clientWidth: 1440, clientHeight: 900 }, map);
  camera.x = player.x * CONFIG.tileSize;
  camera.y = player.y * CONFIG.tileSize;
  camera.zoom = 2.75;
  return { map, game, camera, state: { game, map, camera } };
}

function visibleCamera(camera) {
  return {
    visibleWorldBounds(paddingPx = 0) {
      const halfW = camera.viewportW / (2 * camera.zoom);
      const halfH = camera.viewportH / (2 * camera.zoom);
      const padding = paddingPx / camera.zoom;
      return { left: camera.x - halfW - padding, top: camera.y - halfH - padding, right: camera.x + halfW + padding, bottom: camera.y + halfH + padding };
    }
  };
}

function onBounds(x, y, bounds) {
  const epsilon = 1e-5;
  return Math.abs(x - bounds.left) < epsilon || Math.abs(x - bounds.right) < epsilon
    || Math.abs(y - bounds.top) < epsilon || Math.abs(y - bounds.bottom) < epsilon;
}

function dotFrom(ax, ay, bx, by, dx, dy) {
  return (bx - ax) * dx + (by - ay) * dy;
}
