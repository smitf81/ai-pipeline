import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { buildLightViews } from '../src/game/selectors.js';
import {
  buildSceneLightViews,
  createSceneLights,
  getLightningEventStart,
  SceneLightId,
  SceneLightSourceKind
} from '../src/data/sceneLights.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { buildVisibleLightProjection } from '../src/projection/lightProjection.js';
import { createCamera } from '../src/render/camera.js';
import { createDemoMap } from '../src/world/map.js';

const map = createDemoMap();
const game = createInitialGameState(map);
const stormLight = game.sceneLights.find((light) => light.id === SceneLightId.STORM_LIGHTNING);

assert(stormLight, 'game state should own the storm lightning scene light scheduler');
equal(stormLight.classification, 'world_owned_scene_emission_light', 'lightning should be authored as world scene light data');
equal(stormLight.sourceKind, SceneLightSourceKind.LIGHTNING, 'lightning should expose a stable scene source kind');
assert(stormLight.sourcePolicy.includes('not_player_or_camera_following'), 'lightning scheduler should reject player/camera following');
equal(stormLight.storm?.contract, 'black-sky-bound.scene-lightning-flash-scheduler.v0', 'lightning should expose its scheduler contract');
equal(stormLight.storm?.clusterCount?.max, 4, 'storm clusters should allow a stronger irregular four-flash stutter');
assert(stormLight.storm?.clusterSpacingSeconds?.min < 0.075, 'storm clusters should permit tighter secondary stutters');
assert(stormLight.luminousPowerLumens >= 40000, 'lightning should author an explicitly bright physical flash');

const intervals = Array.from({ length: 8 }, (_, index) => getLightningEventStart(stormLight, index + 1) - getLightningEventStart(stormLight, index));
assert(intervals.every((interval) => interval >= 18 && interval <= 32), 'lightning event intervals should stay slightly more frequent but clamped to 18-32 seconds');
assert(new Set(intervals.map((interval) => interval.toFixed(2))).size > 1, 'lightning intervals should vary deterministically instead of ticking at one fixed cadence');

const firstStrike = getLightningEventStart(stormLight, 0);
game.renderTime = firstStrike + 0.03;
game.lights = buildLightViews(game, game.renderTime);
const flashView = game.lights.find((light) => light.sourceKind === SceneLightSourceKind.LIGHTNING);

assert(flashView, 'first lightning flash should become an active scene light view');
assert(flashView.sceneLight, 'lightning flash view should stay marked as a scene light');
equal(flashView.sourceEntity, null, 'lightning flash should not attach to an ECS source entity');
equal(flashView.flashStage, 'initial_flash', 'fresh lightning should expose its initial flash stage');
assert(flashView.intensity > 0.75, 'initial lightning flash should be bright');
assert(flashView.radius > Math.hypot(map.width, map.height), 'lightning flash should cover the authored scene in tile space');
assert(Number.isFinite(flashView.x) && Number.isFinite(flashView.y), 'lightning flash should have a scene position originator');
assert(flashView.stormEvent?.origin, 'lightning flash should expose its storm-origin metadata');
equal(flashView.visualAnchorPolicy, 'fixed_world_storm_event_origin_v1', 'lightning views should declare their fixed world anchoring policy');

const viewportStorm = createSceneLights([SceneLightId.STORM_LIGHTNING])[0];
const viewportCamera = { x: CONFIG.tileSize * 34, y: CONFIG.tileSize * 24, zoom: 2.75, viewportW: 1280, viewportH: 720 };
const viewportContext = { camera: viewportCamera, map, tileSize: CONFIG.tileSize };
const acquiredFlash = buildSceneLightViews([viewportStorm], firstStrike + 0.03, viewportContext)
  .find((light) => light.sourceKind === SceneLightSourceKind.LIGHTNING);
assert(acquiredFlash, 'storm should acquire an active strike inside the supplied gameplay viewport');
equal(acquiredFlash.stormEvent.originAcquisition.policy, 'viewport_acquired_then_world_frozen_v1', 'storm scheduler should own viewport acquisition before projection');
equal(acquiredFlash.stormEvent.originAcquisition.intendedScreenBand, 'upper_middle', 'new strikes should enter through the upper part of the rendered view');
assert(acquiredFlash.stormEvent.originAcquisition.intendedViewportY <= 0.42, 'acquired lightning should be biased above the viewport midpoint');
const halfViewportWidthTiles = viewportCamera.viewportW / (2 * viewportCamera.zoom * CONFIG.tileSize);
const halfViewportHeightTiles = viewportCamera.viewportH / (2 * viewportCamera.zoom * CONFIG.tileSize);
assert(Math.abs(acquiredFlash.x - viewportCamera.x / CONFIG.tileSize) < halfViewportWidthTiles * 0.85, 'acquired strike X should remain safely inside the current view');
assert(Math.abs(acquiredFlash.y - viewportCamera.y / CONFIG.tileSize) < halfViewportHeightTiles * 0.85, 'acquired strike Y should remain safely inside the current view');
const movedCameraContext = {
  ...viewportContext,
  camera: { ...viewportCamera, x: CONFIG.tileSize * 10, y: CONFIG.tileSize * 8 }
};
const frozenFlash = buildSceneLightViews([viewportStorm], firstStrike + 0.04, movedCameraContext)
  .find((light) => light.id === acquiredFlash.id);
equal(frozenFlash.x, acquiredFlash.x, 'once acquired, a lightning event must not follow later camera X movement');
equal(frozenFlash.y, acquiredFlash.y, 'once acquired, a lightning event must not follow later camera Y movement');

const cameraA = { x: 0, y: 0, zoom: 1, viewportW: 1280, viewportH: 720 };
const cameraB = { x: CONFIG.tileSize * 14, y: CONFIG.tileSize * 9, zoom: 1, viewportW: 1280, viewportH: 720 };
const worldAnchorA = buildVisibleLightProjection([flashView], cameraA, CONFIG.tileSize).lights[0];
const worldAnchorB = buildVisibleLightProjection([flashView], cameraB, CONFIG.tileSize).lights[0];
assert(worldAnchorA && worldAnchorB, 'broad storm flash should remain visible from both proof cameras');
equal(worldAnchorA.worldX, flashView.x * CONFIG.tileSize, 'lightning projection should preserve the scheduled world X coordinate');
equal(worldAnchorA.worldY, flashView.y * CONFIG.tileSize, 'lightning projection should preserve the scheduled world Y coordinate');
equal(worldAnchorB.worldX, worldAnchorA.worldX, 'moving the camera must not move a lightning bolt in world X');
equal(worldAnchorB.worldY, worldAnchorA.worldY, 'moving the camera must not move a lightning bolt in world Y');
equal(worldAnchorB.visualAnchorPolicy, 'fixed_world_storm_event_origin_v1', 'renderer projection should retain fixed world anchoring evidence');

const tailTime = firstStrike + 0.45;
const tailViews = buildSceneLightViews([stormLight], tailTime);
const burnoffView = tailViews.find((light) => light.flashStage === 'afterimage_burnoff');
assert(burnoffView, 'lightning should leave a short afterimage burnoff light register');
assert(burnoffView.intensity > 0 && burnoffView.intensity < flashView.intensity, 'afterimage burnoff should taper below the main flash');
assert(burnoffView.afterimageIntensity > 0 && burnoffView.afterimageIntensity < 1, 'afterimage intensity should be explicitly exposed');

const clusteredEvent = Array.from({ length: 10 }, (_, index) => {
  const time = getLightningEventStart(stormLight, index) + 0.03;
  return buildSceneLightViews([stormLight], time).find((light) => light.sourceKind === SceneLightSourceKind.LIGHTNING);
}).find((light) => (light?.stormEvent?.clusterCount ?? 0) > 1);
assert(clusteredEvent, 'storm scheduler should produce clustered lightning events within the sampled event set');

const projection = buildProjectionAt(firstStrike + 0.03);
const projectedLightning = projection.lights.find((light) => light.sourceKind === SceneLightSourceKind.LIGHTNING);
assert(projectedLightning, 'lightning should enter renderer-neutral light projection while active');
assert(projectedLightning.effectiveIntensity > 0.7, 'projected lightning should carry bright flash intensity');
assert(projectedLightning.luminousPowerLumens >= 40000, 'projected lightning should carry its authored high-output physical light power');
assert(projectedLightning.overheadIlluminationIntensity >= 1.5, 'projected lightning should carry broad overhead flash intensity');
assert(projectedLightning.shadow.lengthScale <= 0.3, 'projected lightning should carry high-source shadow tuning');
assert(projectedLightning.afterimageIntensity > 0.9, 'projected lightning should carry afterimage state during initial flash');
assert(projectedLightning.stormEvent?.origin, 'projected lightning should retain origin metadata');
assert(projection.occlusionShadows.shadowFieldPackets.some((packet) => packet.lightId === projectedLightning.id), 'lightning should feed the existing shadow-field projection');

function buildProjectionAt(time) {
  game.renderTime = time;
  game.lights = buildLightViews(game, time);
  return buildRenderProjection({ time, map, game, camera: createCamera({ clientWidth: 1280, clientHeight: 720 }, map) }, CONFIG);
}
