import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import {
  MAMA_WYVERN_WORLD_EVENT,
  MamaWyvernEventKind,
  MamaWyvernEventPhase,
  buildMamaWorldEventLightViews,
  buildMamaWorldEventSmokeSourceViews,
  mamaWorldEventKind,
  queueMamaWyvernWorldEvent
} from '../src/data/mamaWyvernWorldEvents.js';
import { buildSceneLightViews, getLightningEventStart } from '../src/data/sceneLights.js';
import { getComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { createWorldEventAudioBridge } from '../src/game/worldEventControls.js';
import { createUnitSpawnerFixtureEntity } from '../src/game/unitSpawners.js';
import { syncGameViews } from '../src/game/selectors.js';
import { createCamera } from '../src/render/camera.js';
import { WebGLWorldEventLayer } from '../src/render/backends/webgl/layers/WebGLWorldEventLayer.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { createAudioDirector } from '../src/audio/audioDirector.js';
import { AudioEventType } from '../src/audio/soundEvents.js';
import { worldEventSystem } from '../src/systems/worldEventSystem.js';
import { wyvernProjectionSystem } from '../src/systems/wyvernProjectionSystem.js';
import { createDemoMap } from '../src/world/map.js';

const map = createDemoMap();
const game = createInitialGameState(map);
game.worldEvents.autoEnabled = false;

equal(mamaWorldEventKind(0), MamaWyvernEventKind.INFERNO, 'the first natural Mama encounter should activate the complete sampled roar, flyover, napalm, and aftermath suite');
equal(mamaWorldEventKind(1), MamaWyvernEventKind.FLYOVER, 'the next natural encounter should retain the lower-impact visual flyover variation');

const lightningIntervals = Array.from({ length: 6 }, (_, index) => (
  getLightningEventStart(game.sceneLights[0], index + 1) - getLightningEventStart(game.sceneLights[0], index)
));
assert(lightningIntervals.every((seconds) => seconds >= 18 && seconds <= 32), 'storm cadence should be slightly more frequent but remain bounded and occasional');

queueMamaWyvernWorldEvent(game.worldEvents, MamaWyvernEventKind.FLYOVER, {
  lightningSync: true,
  angle: 0.36,
  source: 'focused_test'
});
worldEventSystem({ game, map, dt: 0 });
equal(game.worldEvents.activeEvent.phase, MamaWyvernEventPhase.WARNING, 'manual flyover should begin with the distant-roar warning phase');
equal(game.worldEvents.audio.eventType, AudioEventType.MAMA_WYVERN_ROAR, 'warning phase should publish the mama roar audio event');
equal(game.worldEvents.audio.cueId, 'world.mama_wyvern.distant_roar', 'warning receipt should identify the sampled distant cue');

game.renderTime = 2;
worldEventSystem({ game, map, dt: MAMA_WYVERN_WORLD_EVENT.timing.warningSeconds + MAMA_WYVERN_WORLD_EVENT.timing.flyoverSeconds * 0.46 });
equal(game.worldEvents.activeEvent.phase, MamaWyvernEventPhase.FLYOVER, 'warning should hand off to the moving shadow phase');
equal(game.worldEvents.audio.eventType, AudioEventType.MAMA_WYVERN_FLYOVER, 'flyover handoff should publish the close moving roar');
equal(game.worldEvents.diagnostics.lightningSyncCount, 1, 'lightning-sync trigger should queue one manual lightning event');
const manualLightning = buildSceneLightViews(game.sceneLights, game.renderTime + 0.02)
  .find((light) => light.stormEvent?.manual === true);
assert(manualLightning, 'manual lightning relationship control should create an active lightning scene-light view');
equal(manualLightning.stormEvent.sourceEventId, game.worldEvents.activeEvent.id, 'manual lightning should retain mama-event provenance');

wyvernProjectionSystem({ game, dt: 1 / 60 });
syncGameViews(game);
let projection = buildProjection(game, map);
equal(projection.worldEvents.flyovers.length, 1, 'renderer-neutral projection should expose the active mama shadow flyover');
equal(projection.worldEvents.flyovers[0].classification, 'dedicated_aerial_mama_wyvern_shadow_projection', 'Mama should use a dedicated aerial projection rather than the grounded player rig');
assert(projection.worldEvents.flyovers[0].trajectory.distanceTiles > 10, 'camera-bounded trajectory should cross the expanded active view');
const eventLayer = new WebGLWorldEventLayer();
eventLayer.update(projection);
equal(eventLayer.shadowSilhouetteCount, 1, 'WebGL world-event layer should render one dedicated Mama aerial silhouette');
equal(eventLayer.aerialSilhouetteMode, 'dedicated_static_aerial_wing_dominant_mama_silhouette_v1', 'Mama should not reuse the grounded crawl renderer');
assert(eventLayer.aerialSilhouetteMetrics.wingToBodyRatio > 1.5, 'Mama silhouette should be wing-dominant');
equal(eventLayer.aerialSilhouetteMetrics.legPrimitiveCount, 0, 'aerial silhouette should omit grounded legs');
assert(eventLayer.triangles.length > 80, 'large Mama silhouette should retain a readable wing/neck/tail shape');

worldEventSystem({ game, map, dt: 3 });
queueMamaWyvernWorldEvent(game.worldEvents, MamaWyvernEventKind.INFERNO, {
  angle: -0.62,
  centerX: 18,
  centerY: 14,
  source: 'focused_test'
});
worldEventSystem({ game, map, dt: 0 });
worldEventSystem({
  game,
  map,
  dt: MAMA_WYVERN_WORLD_EVENT.timing.warningSeconds
    + MAMA_WYVERN_WORLD_EVENT.timing.flyoverSeconds * 0.7
});
equal(game.worldEvents.fireWalls.length, 1, 'inferno flyover should deposit one non-propagating residual fire wall');
const wall = game.worldEvents.fireWalls[0];
equal(wall.lifetime, 18, 'residual fire wall should persist long enough to shape an encounter');
const infernoAudioTypes = game.worldEvents.audio.events
  .filter((event) => event.sourceEventId === wall.sourceEventId)
  .map((event) => event.eventType);
assert(infernoAudioTypes.includes(AudioEventType.MAMA_WYVERN_NAPALM), 'inferno delivery should publish the pressurised napalm cue');
assert(infernoAudioTypes.includes(AudioEventType.MAMA_WYVERN_AFTERMATH), 'inferno deployment should publish the persistent fire aftermath cue');
const bridgedAudioEvents = [];
const audioBridge = createWorldEventAudioBridge({
  emit(type, payload) {
    bridgedAudioEvents.push({ type, payload });
  }
});
assert(audioBridge.sync(game), 'world-event audio bridge should drain unseen authored receipts');
assert(bridgedAudioEvents.some((event) => event.type === AudioEventType.MAMA_WYVERN_FLYOVER), 'audio bridge should preserve the phase-specific flyover event type');
assert(bridgedAudioEvents.some((event) => event.type === AudioEventType.MAMA_WYVERN_NAPALM), 'audio bridge should preserve the phase-specific napalm event type');
assert(bridgedAudioEvents.some((event) => event.payload.cueId === 'world.mama_wyvern.inferno_aftermath'), 'audio bridge should retain the authored sampled cue ID');

const midpoint = { x: (wall.ax + wall.bx) * 0.5, y: (wall.ay + wall.by) * 0.5 };
const playerTransform = getComponent(game.world, game.dragonId, ComponentType.Transform);
const enemy = game.actors.find((actor) => actor.enemyBehaviour)?.id;
const enemyTransform = getComponent(game.world, enemy, ComponentType.Transform);
const fixture = createUnitSpawnerFixtureEntity(game.world, {
  id: 'inferno_fixture',
  label: 'Inferno fixture',
  type: 'husk',
  team: 'husks',
  x: Math.floor(midpoint.x),
  y: Math.floor(midpoint.y),
  hitPoints: 40,
  fixtureRadiusTiles: 0.48
});
const fixtureTransform = getComponent(game.world, fixture, ComponentType.Transform);
Object.assign(playerTransform, midpoint);
Object.assign(enemyTransform, midpoint);
Object.assign(fixtureTransform, midpoint);
const hpBefore = {
  player: getComponent(game.world, game.dragonId, ComponentType.Health).hp,
  enemy: getComponent(game.world, enemy, ComponentType.Health).hp,
  fixture: getComponent(game.world, fixture, ComponentType.Health).hp
};
worldEventSystem({ game, map, dt: 0.02 });
assert(getComponent(game.world, game.dragonId, ComponentType.Health).hp < hpBefore.player, 'inferno should damage the player');
assert(getComponent(game.world, enemy, ComponentType.Health).hp < hpBefore.enemy, 'inferno should damage enemy actors regardless of faction');
assert(getComponent(game.world, fixture, ComponentType.Health).hp < hpBefore.fixture, 'inferno should damage non-actor damageable fixtures');
const playerStatus = getComponent(game.world, game.dragonId, ComponentType.StatusEffects);
const enemyStatus = getComponent(game.world, enemy, ComponentType.StatusEffects);
assert(playerStatus.movementSlowTimer > 0 && enemyStatus.movementSlowTimer > 0, 'inferno damage should slow every mobile unit it hits');
const enemyAi = getComponent(game.world, enemy, ComponentType.EnemyPressureAI);
assert(enemyAi.retreatTimer > 0 && enemyAi.lastHazardAvoided === wall.id, 'enemy pressure should retreat from the fire barrier instead of walking into it');
assert(game.spatialHazards.some((hazard) => hazard.id === wall.id), 'fire wall should publish spatial avoidance pressure as world state');

const fireLights = buildMamaWorldEventLightViews(game.worldEvents, game.renderTime);
const fireSmoke = buildMamaWorldEventSmokeSourceViews(game.worldEvents);
equal(fireLights.length, MAMA_WYVERN_WORLD_EVENT.fire.lightNodeCount, 'residual wall should feed bounded warm light nodes');
equal(fireSmoke.length, MAMA_WYVERN_WORLD_EVENT.fire.smokeNodeCount, 'residual wall should feed bounded smoke nodes');
assert(fireLights.every((light) => light.sourceAnchor.type === 'world_event'), 'inferno lights should preserve world-event source ownership');

syncGameViews(game);
projection = buildProjection(game, map);
eventLayer.update(projection);
equal(eventLayer.fireWallCount, 1, 'WebGL world-event layer should consume the residual fire projection');
equal(eventLayer.radials.length, eventLayer.deliveryBreathCount * 8, 'only the bounded head-rooted delivery breath may use temporary radials; inferno geometry stays cached');
equal(eventLayer.activeInfernoCompositions.length, 1, 'inferno should retain one active cached composition');
assert(eventLayer.infernoGeometry.clusterCount >= 6, 'inferno should retain substantial rolling SDF clusters rather than flame emblems');
equal(eventLayer.infernoGeometry.cachedStaticInstanceCount, eventLayer.infernoGeometry.clusterCount, 'inferno cluster placement should be retained as static instance data');
equal(eventLayer.infernoGeometry.triangleCount, 0, 'inferno wall geometry should not contain fitted polygon sections or flame emblems');
equal(eventLayer.infernoGeometry.continuousFlameSheetCount, 0, 'inferno diagnostics should confirm the opaque flame sheet is absent');
equal(eventLayer.infernoGeometry.batchCount, 1, 'one active inferno wall should submit one cached cluster batch');

const initialDamageScale = wall.damageScale;
Object.assign(playerTransform, { x: 3, y: 3 });
Object.assign(enemyTransform, { x: 4, y: 3 });
Object.assign(fixtureTransform, { x: 5, y: 3 });
worldEventSystem({ game, map, dt: 9 });
assert(wall.damageScale < initialDamageScale && wall.damageScale >= MAMA_WYVERN_WORLD_EVENT.fire.minimumDamageScale, 'fire damage should fall off gradually without dropping to zero halfway through its life');
assert(wall.lightScale < 1 && wall.smokeScale > 0, 'residual light and smoke should burn down gradually');

const director = createAudioDirector({ context: null });
game.worldEvents.activeEvent = {
  id: 'test_mama_audio_owner', worldX: 8, worldY: 6, forwardX: 1, forwardY: 0,
  audioEmitter: { ...MAMA_WYVERN_WORLD_EVENT.audio.emitter }
};
const mamaSourceRef = { ownerKind: 'worldEvent', ownerId: 'test_mama_audio_owner', emitterId: 'voice' };
director.emit(AudioEventType.MAMA_WYVERN_ROAR, { intensity: 1, sourceRef: mamaSourceRef });
director.emit(AudioEventType.MAMA_WYVERN_FLYOVER, { intensity: 1, sourceRef: mamaSourceRef });
director.emit(AudioEventType.MAMA_WYVERN_NAPALM, { intensity: 1, sourceRef: mamaSourceRef });
director.emit(AudioEventType.MAMA_WYVERN_AFTERMATH, { intensity: 1 });
const audioState = director.update({ game, time: 0, paused: false }, 1 / 60);
assert(audioState.recentCues.some((cue) => cue.cueId === 'world.mama_wyvern.distant_roar'), 'audio director should resolve the distant mama roar cue');
assert(audioState.recentCues.some((cue) => cue.cueId === 'world.mama_wyvern.flyover_roar'), 'audio director should resolve the close flyover roar cue');
assert(audioState.recentCues.some((cue) => cue.cueId === 'world.mama_wyvern.napalm_projection'), 'audio director should resolve the napalm projection cue');
assert(audioState.recentCues.some((cue) => cue.cueId === 'world.mama_wyvern.inferno_aftermath'), 'audio director should resolve the inferno aftermath cue');

function buildProjection(targetGame, targetMap) {
  return buildRenderProjection({
    time: targetGame.renderTime ?? 0,
    map: targetMap,
    game: targetGame,
    camera: createCamera({ clientWidth: 1280, clientHeight: 720 }, targetMap)
  }, CONFIG);
}
