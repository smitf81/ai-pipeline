import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { EntityKind } from '../src/constants/entityKinds.js';
import { Faction } from '../src/constants/factions.js';
import { ACTORS } from '../src/data/actors.js';
import { RENDER_BUDGETS } from '../src/data/renderBudgets.js';
import { getComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { spawnActor } from '../src/game/spawn.js';
import { syncGameViews } from '../src/game/selectors.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { buildWebGLActorLightReadabilityGeometry } from '../src/render/backends/webgl/WebGLActorLightReadability.js';
import { WebGLActorLayer } from '../src/render/backends/webgl/layers/WebGLActorLayer.js';
import { humanoidProjectionSystem } from '../src/systems/humanoidProjectionSystem.js';
import { wyvernProjectionSystem } from '../src/systems/wyvernProjectionSystem.js';
import { createDemoMap } from '../src/world/map.js';

const playerHarness = createHarness();
wyvernProjectionSystem({ game: playerHarness.game, dt: 1 / 60 });
syncGameViews(playerHarness.game);
const playerView = playerHarness.game.actors.find((actor) => actor.team === Faction.PLAYER);
playerHarness.game.lights = [localLight('player-side-fire', playerView.x + 1.2, playerView.y, 5.5)];
const rightProjection = project(playerHarness);
const rightPlayer = rightProjection.actors.find((actor) => actor.team === Faction.PLAYER);
const rightReadability = rightPlayer.lightReadability;

assert(rightReadability.active, 'nearby local fire should activate player light readability');
equal(rightReadability.contract, 'black-sky-bound.actor-light-silhouette-readability.v0', 'projection should expose the actor light readability contract');
equal(rightReadability.fillPolicy, 'preserve_dark_actor_material', 'readability must preserve the dark actor fill');
equal(rightReadability.outlinePolicy, 'emitter_facing_partial_edges_only_no_global_outline', 'readability must reject global outlines');
equal(rightReadability.emitter.id, 'player-side-fire', 'projection should retain the selected emitter provenance');
assert(rightReadability.direction.x > 0.99, 'right-side emitter should produce a right-facing light direction');
assert(rightReadability.parts.some((part) => part.role === 'head') && rightReadability.parts.some((part) => part.role === 'chest'), 'wyvern readability should use major projected body parts');
assert(rightReadability.catchlights.some((socket) => socket.role === 'mouth'), 'wyvern readability should reuse the projected mouth socket');
assert(rightReadability.contactShadow?.radiusY < rightReadability.contactShadow?.radiusX, 'contact shadow should remain a small grounded ellipse');

playerHarness.game.lights = [
  localLight('nearer-relevant-ember', playerView.x + 0.9, playerView.y, 3.5),
  { ...localLight('farther-stronger-fire', playerView.x + 1.6, playerView.y, 8), intensity: 1.8 }
];
const nearestPlayer = project(playerHarness).actors.find((actor) => actor.team === Faction.PLAYER);
equal(nearestPlayer.lightReadability.emitter.id, 'nearer-relevant-ember', 'readability should select the nearest emitter that still clears the relevance threshold');
playerHarness.game.lights = [localLight('player-side-fire', playerView.x + 1.2, playerView.y, 5.5)];

const geometry = buildWebGLActorLightReadabilityGeometry(rightPlayer);
assert(geometry.rimPrimitiveCount > 0, 'active readability should create emitter-facing rim geometry');
assert(geometry.catchlightPrimitiveCount > 0, 'active readability should create tiny socket catchlights');
assert(geometry.contactShadowPrimitiveCount > 0, 'active readability should create a local contact-shadow underlay');
assert(geometry.coreOcclusionPrimitiveCount > 0, 'active readability should preserve a dark central silhouette');
assert(geometry.rimPrimitiveCount <= rightReadability.parts.length * 10, 'rim geometry should stay bounded to partial arcs rather than global outlines');

const headOnlyActor = structuredClone(rightPlayer);
const headPart = rightReadability.parts.find((part) => part.role === 'head');
headOnlyActor.lightReadability.parts = [headPart];
headOnlyActor.lightReadability.catchlights = [];
headOnlyActor.lightReadability.core = null;
headOnlyActor.lightReadability.contactShadow = null;
const headRim = buildWebGLActorLightReadabilityGeometry(headOnlyActor).rimTriangles;
const rimCentroid = triangleCentroid(headRim);
assert((rimCentroid.x - headPart.centerX) * rightReadability.direction.x + (rimCentroid.y - headPart.centerY) * rightReadability.direction.y > 0, 'partial rim should sit on the emitter-facing edge');

playerHarness.game.lights = [localLight('player-left-fire', playerView.x - 1.2, playerView.y, 5.5)];
const leftPlayer = project(playerHarness).actors.find((actor) => actor.team === Faction.PLAYER);
assert(leftPlayer.lightReadability.direction.x < -0.99, 'moving the emitter should flip the projected rim direction');

playerHarness.game.lights = [{ ...localLight('moon-only', playerView.x + 1, playerView.y, 96), sceneLight: true, sourceAnchor: { type: 'scene_light', id: 'moon' }, sourceKind: 'moonlight_scene_emission' }];
const moonOnlyPlayer = project(playerHarness).actors.find((actor) => actor.team === Faction.PLAYER);
assert(!moonOnlyPlayer.lightReadability.active, 'broad scene moonlight should not become a fake local actor outline');

const raiderHarness = createHarness();
const raiderId = spawnActor(raiderHarness.game.world, EntityKind.RAIDER, 10, 10, Faction.RAIDERS);
humanoidProjectionSystem({ game: raiderHarness.game, dt: 1 / 60 });
syncGameViews(raiderHarness.game);
const raiderView = raiderHarness.game.actors.find((actor) => actor.id === raiderId);
raiderHarness.game.lights = [localLight('raider-torch', raiderView.x + 0.35, raiderView.y - 0.1, 4.8, raiderId)];
const raiderPacket = project(raiderHarness).actors.find((actor) => actor.id === raiderId);
assert(raiderPacket.lightReadability.active, 'raider torch should activate local silhouette readability');
assert(raiderPacket.lightReadability.catchlights.some((socket) => socket.role === 'torch_flame'), 'raider should reuse its torch flame socket');
assert(raiderPacket.lightReadability.catchlights.some((socket) => socket.role === 'spear_tip'), 'raider should reuse its spear-tip socket');

const actorLayer = new WebGLActorLayer();
actorLayer.update(rightProjection, fakeContext());
assert(actorLayer.actorLightReadabilityCount > 0, 'WebGL actor depth path should consume readability packets');
assert(actorLayer.actorRimPrimitiveCount === geometry.rimPrimitiveCount, 'actor layer diagnostics should count bounded rim geometry');
assert(actorLayer.actorLightInfluenceCount === 1, 'one local emitter should contribute to the one projected player actor');
equal(RENDER_BUDGETS.actorLightReadability.geometryPolicy, 'batched_with_actor_depth_item_no_extra_draw_call', 'readability should stay inside the actor depth batch');
equal(ACTORS[EntityKind.YOUNG_DRAGON].lightReadabilityProfileId, rightReadability.profileId, 'actor data should own its readability profile');

function createHarness() {
  const map = createDemoMap();
  map.enemySpawns = [];
  map.unitPlacements = [];
  map.unitSpawners = [];
  return { map, game: createInitialGameState(map) };
}

function project(harness) {
  return buildRenderProjection({ game: harness.game, map: harness.map, time: 0, camera: fakeCamera() }, CONFIG);
}

function localLight(id, x, y, radius, sourceEntity = null) {
  return {
    id,
    x,
    y,
    radius,
    intensity: 1,
    enabled: true,
    softness: 0.75,
    colour: 'rgba(255,138,54,0.92)',
    innerColour: 'rgba(255,226,164,1)',
    sourceKind: 'validation_local_fire',
    sourceEntity,
    sourceAnchor: { type: 'world_entity', id: sourceEntity ?? id }
  };
}

function fakeCamera() {
  return { x: 0, y: 0, zoom: 1, viewportW: 1280, viewportH: 720, visibleWorldBounds: () => ({ left: -10000, top: -10000, right: 10000, bottom: 10000 }) };
}

function fakeContext() {
  return { camera: fakeCamera(), lightSpaceCulling: { enabled: false, regions: [] } };
}

function triangleCentroid(triangles) {
  const points = triangles.flatMap((triangle) => [
    { x: triangle.ax, y: triangle.ay },
    { x: triangle.bx, y: triangle.by },
    { x: triangle.cx, y: triangle.cy }
  ]);
  return points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
}
