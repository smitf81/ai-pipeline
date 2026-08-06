import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import {
  MAMA_WYVERN_WORLD_EVENT,
  MamaWyvernEventKind,
  queueMamaWyvernWorldEvent
} from '../src/data/mamaWyvernWorldEvents.js';
import { AmbientParticleKind } from '../src/data/ambientParticles.js';
import { TreeFirePhase, TREE_FIRE_STATE } from '../src/data/treeFireStates.js';
import { getComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { syncGameViews } from '../src/game/selectors.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { createCamera } from '../src/render/camera.js';
import { WebGLWorldEventLayer } from '../src/render/backends/webgl/layers/WebGLWorldEventLayer.js';
import { buildTreeGeometry } from '../src/render/backends/webgl/scenery/treeGeometry.js';
import { worldEventSystem } from '../src/systems/worldEventSystem.js';
import { wyvernProjectionSystem } from '../src/systems/wyvernProjectionSystem.js';
import { createDemoMap } from '../src/world/map.js';

const map = createDemoMap();
const game = createInitialGameState(map);
game.worldEvents.autoEnabled = false;
assert(game.sceneObjects !== map.sceneObjects, 'runtime scene-object state should not alias authored map truth');
assert(game.sceneObjects[0] !== map.sceneObjects[0], 'runtime scene objects should be mutable copies of authored objects');

queueMamaWyvernWorldEvent(game.worldEvents, MamaWyvernEventKind.FLYOVER, { angle: 0.2, source: 'camera_scope_test' });
worldEventSystem({ game, map, dt: 0 });
const playerTransform = getComponent(game.world, game.dragonId, ComponentType.Transform);
playerTransform.x = 19;
playerTransform.y = 14;
worldEventSystem({
  game,
  map,
  dt: MAMA_WYVERN_WORLD_EVENT.timing.warningSeconds + MAMA_WYVERN_WORLD_EVENT.timing.flyoverSeconds * 0.48
});
const activeFlyover = game.worldEvents.activeEvent;
equal(activeFlyover.crossingAnchorPolicy, MAMA_WYVERN_WORLD_EVENT.shadow.crossingPolicy, 'ordinary flyovers should use the live-player crossing policy');
const crossingDistance = Math.hypot(activeFlyover.centerX - playerTransform.x, activeFlyover.centerY - playerTransform.y);
assert(Math.abs(crossingDistance - MAMA_WYVERN_WORLD_EVENT.shadow.cameraPeripheryOffsetTiles) < 0.05, 'flyover should re-anchor beside the live player when the warning ends');

wyvernProjectionSystem({ game, dt: 1 / 60 });
syncGameViews(game);
let projection = buildProjection(game, map, playerTransform);
const playerPacket = projection.actors.find((actor) => actor.id === game.dragonId);
const eventLayer = new WebGLWorldEventLayer();
eventLayer.update(projection, {
  camera: {
    visibleWorldBounds: () => ({
      left: playerPacket.worldX - 260,
      top: playerPacket.worldY - 180,
      right: playerPacket.worldX + 260,
      bottom: playerPacket.worldY + 180
    })
  }
});
assert(eventLayer.flyoverViewportIntersecting, 'flyover mesh should intersect the player camera scope');
assert(eventLayer.flyoverViewportTriangleCount > 0, 'flyover proof should count triangles that actually land in the viewport');
assert(eventLayer.flyoverViewportCoverage > 0.02, 'flyover should occupy a materially visible portion of the camera scope');

worldEventSystem({ game, map, dt: 3 });
queueMamaWyvernWorldEvent(game.worldEvents, MamaWyvernEventKind.INFERNO, {
  angle: 0,
  centerX: 12.2,
  centerY: 12,
  source: 'tree_fire_test'
});
worldEventSystem({ game, map, dt: 0 });
worldEventSystem({
  game,
  map,
  dt: MAMA_WYVERN_WORLD_EVENT.timing.warningSeconds + MAMA_WYVERN_WORLD_EVENT.timing.flyoverSeconds * 0.7
});
const burningTree = game.sceneObjects.find((object) => object.id === 'tree:torch-edge');
assert(burningTree?.materialState?.treeFire, 'an inferno crossing a tree should ignite runtime tree material state');
equal(burningTree.materialState.treeFire.phase, TreeFirePhase.ENGULFED, 'new tree fire should begin engulfed');
assert(!map.sceneObjects.find((object) => object.id === burningTree.id).materialState?.treeFire, 'tree ignition must not mutate authored map truth');

syncGameViews(game);
projection = buildProjection(game, map, burningTree);
const burningTreePacket = projection.scenery.find((object) => object.id === burningTree.id);
assert(burningTreePacket.material.shaderVariant.endsWith('+tree_fire_lifecycle_v0'), 'burning tree should select the fire lifecycle shader variant');
equal(burningTreePacket.material.state.firePhase, TreeFirePhase.ENGULFED, 'renderer-neutral material state should expose the active tree fire phase');
assert(burningTreePacket.material.state.heatAmount > 0.9 && burningTreePacket.material.state.charAmount > 0, 'tree shader state should expose heat and char uniforms');
assert(projection.worldEvents.treeFires.some((treeFire) => treeFire.id === burningTree.id), 'burning tree state should reach the post-light emissive world-event projection');
eventLayer.update(projection);
assert(eventLayer.treeFireOverlayCount > 0, 'burning trees should render an emissive overlay after world lighting');
const rects = [];
const triangles = [];
buildTreeGeometry(burningTreePacket, 1, rects, triangles);
assert(triangles.length > 100, 'engulfed tree geometry should add layered flame detail to the tree silhouette');

const infernoLights = game.lights.filter((light) => light.sourceKind === 'mama_wyvern_inferno_wall');
const treeLights = game.lights.filter((light) => light.sourceKind === 'burning_tree_fire' && light.sourceAnchor?.id === burningTree.id);
equal(infernoLights.length, MAMA_WYVERN_WORLD_EVENT.fire.lightNodeCount, 'inferno should publish its full bounded strong-light chain');
assert(infernoLights.every((light) => light.revealStrength > 0.8 && light.shadowPriority >= 200), 'inferno light nodes should be strong and prioritized for shadow projection');
equal(treeLights.length, 2, 'engulfed tree should publish two canopy light nodes');
assert(game.smokeSources.some((source) => source.sourceKind === 'burning_tree_smoke'), 'engulfed tree should feed the shared smoke field');
assert(projection.particles.some((particle) => particle.kind === AmbientParticleKind.MAMA_INFERNO_EMBER), 'inferno light chain should feed hot ember particles');
assert(projection.particles.some((particle) => particle.kind === AmbientParticleKind.TREE_FIRE_EMBER), 'tree fire lights should feed tree ember particles');
assert(projection.occlusionShadows.shadowFieldPackets.some((packet) => packet.lightId.includes(':inferno:')), 'inferno lights should produce real scene-object shadow packets');

worldEventSystem({ game, map, dt: TREE_FIRE_STATE.timing.engulfedEndSeconds + 0.2 });
equal(burningTree.materialState.treeFire.phase, TreeFirePhase.SIMMER_HIGH, 'tree should transition from engulfed into the first simmer');
worldEventSystem({ game, map, dt: TREE_FIRE_STATE.timing.simmerHighEndSeconds - TREE_FIRE_STATE.timing.engulfedEndSeconds + 0.2 });
equal(burningTree.materialState.treeFire.phase, TreeFirePhase.SIMMER_LOW, 'tree should transition into the lower simmer');
worldEventSystem({ game, map, dt: TREE_FIRE_STATE.timing.simmerLowEndSeconds - TREE_FIRE_STATE.timing.simmerHighEndSeconds + 0.4 });
equal(burningTree.materialState.treeFire.phase, TreeFirePhase.BURNT_OUT, 'tree should finish in a persistent burnt-out material state');
assert(burningTree.materialState.treeFire.charAmount === 1, 'burnt-out tree should retain full char state');
syncGameViews(game);
assert(game.lights.filter((light) => light.sourceKind === 'burning_tree_fire' && light.sourceAnchor?.id === burningTree.id).length === 1, 'burnt-out tree should retain one low residual ember light');
assert(game.smokeSources.some((source) => source.sourceKind === 'burning_tree_smoke'), 'freshly burnt-out tree should keep a fading smoke source');

function buildProjection(targetGame, targetMap, focus) {
  const camera = createCamera({ clientWidth: 1440, clientHeight: 900 }, targetMap);
  camera.x = (focus.x ?? focus.visualX) * CONFIG.tileSize;
  camera.y = (focus.y ?? focus.visualY) * CONFIG.tileSize;
  return buildRenderProjection({ time: targetGame.renderTime ?? 0, map: targetMap, game: targetGame, camera }, CONFIG);
}
