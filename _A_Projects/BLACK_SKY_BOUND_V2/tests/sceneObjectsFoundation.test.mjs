import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { SceneObjectType } from '../src/data/sceneObjects.js';
import { WORLD_SCALE } from '../src/data/worldScale.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { createCamera } from '../src/render/camera.js';
import { getComponent } from '../src/ecs/world.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { createDemoMap } from '../src/world/map.js';
import { buildSceneObjectOcclusionBlockers, isSceneObjectBlocked } from '../src/world/sceneObjects.js';
import { moveEntityRaw } from '../src/systems/movementSystem.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { WebGLSceneryLayer, WEBGL_SCENERY_MODE } from '../src/render/backends/webgl/layers/WebGLSceneryLayer.js';
import {
  WebGLLightingLayer,
  WEBGL_SHADOW_COMPOSITE_MODE,
  WEBGL_SHADOW_MODE
} from '../src/render/backends/webgl/layers/WebGLLightingLayer.js';

const map = createDemoMap();
const trees = map.sceneObjects.filter((object) => object.treeDefinition?.species === 'old_pine');
const treeVariants = map.sceneObjects.filter((object) => object.treeDefinition?.species === 'silver_birch');
const snags = map.sceneObjects.filter((object) => object.type === SceneObjectType.DEAD_SNAG);
const boulders = map.sceneObjects.filter((object) => object.type === SceneObjectType.BOULDER);
const ferns = map.sceneObjects.filter((object) => object.type === SceneObjectType.FERN_PATCH);
const shrubs = map.sceneObjects.filter((object) => object.type === SceneObjectType.FOREST_SHRUB);
const groundDecals = map.sceneObjects.filter((object) => object.type === SceneObjectType.LEAF_LITTER || object.type === SceneObjectType.ROOT_DECAL);
const emitterProps = map.sceneObjects.filter((object) => object.emitter?.lightEmitterId);
const fireArrowProps = map.sceneObjects.filter((object) => String(object.type).startsWith('fire_arrow'));
const blockingObjects = map.sceneObjects.filter((object) => object.blocksMovement);
const visualDetails = map.sceneObjects.filter((object) => !object.blocksMovement);
const shadowCasters = map.sceneObjects.filter((object) => object.occlusion?.castsShadow !== false);

equal(WORLD_SCALE.tileMeters, 0.5, 'world scale should read one movement tile as roughly half a meter');
equal(WORLD_SCALE.referenceCreature.noseToTailTiles, 4, '1m body plus 1m tail hatchling should read as about four tiles nose-to-tail');
assert(trees.length >= 1, 'scenario should seed explicit tree scene objects');
assert(treeVariants.length >= 1, 'scenario should seed explicit tree variant scene objects');
assert(snags.length >= 1, 'scenario should seed explicit dead snag scene objects');
assert(boulders.length >= 1, 'scenario should seed explicit boulder scene objects');
assert(ferns.length >= 1, 'scenario should seed explicit fern undergrowth scene objects');
assert(shrubs.length >= 1, 'scenario should seed explicit shrub undergrowth scene objects');
assert(groundDecals.length >= 2, 'scenario should seed multiple forest floor ground decal scene objects');
assert(emitterProps.length >= 6, 'scenario should seed multiple scene-object emitter props for raid ambience');
assert(emitterProps.some((object) => object.type === SceneObjectType.FIRE_ARROW_CLUSTER), 'scenario should seed at least one grouped fire-arrow emitter prop');
assert(emitterProps.some((object) => object.type === SceneObjectType.SMOULDERING_BRAMBLE), 'scenario should seed at least one smouldering plant emitter prop');
assert(fireArrowProps.length >= 1, 'scale audit should include fire-arrow emitter props');
assert(trees.every((object) => object.widthTiles === 2 && object.heightTiles === 2), 'trees should use a coarse 2x2 trunk/root collision footprint');
assert(trees.every((object) => object.collisionFootprint.w === WORLD_SCALE.sceneObjectTargets.dwarfingTree.collisionTiles.w), 'tree collision data should match the shared physical scale target, not the visual crown');
assert(trees.every((object) => object.visualWidthTiles >= 6 && object.visualHeightTiles >= 7), 'tree crowns should visually dwarf the hatchling');
assert(boulders.every((object) => object.widthTiles === 2 && object.heightTiles === 2), 'boulders should now occupy a readable 2x2 collision footprint');
assert(fireArrowProps.every((object) => object.visualWidthTiles <= 1 && object.visualHeightTiles <= 0.8), 'fire arrows should stay tiny emitter sockets rather than barrier-scale props');
assert(fireArrowProps.every((object) => object.physical.heightMeters <= 0.2), 'fire arrows should remain low embedded arrowheads in the half-meter tile scale');
assert(blockingObjects.every((object) => ['recipe_derived_spatial_shape_v1', 'recipe_derived_trunk_circle_root_traversal_v2'].includes(object.collisionPolicy)), 'blocking scene objects should use geometry-recipe-derived collision');
assert(trees.every((object) => object.collisionPolicy === 'recipe_derived_trunk_circle_root_traversal_v2' && object.traversalModifiers.length > 0), 'trees should separate trunk hard collision from visible root traversal slowdown');
assert(blockingObjects.every((object) => object.collisionShape?.contract === 'black-sky-bound.collision-shape-2d.v1'), 'blocking scene objects should expose the shared spatial collision contract');
assert(visualDetails.every((object) => !object.blocksMovement), 'undergrowth and ground decals should stay nonblocking scene detail');
assert(visualDetails.every((object) => object.collisionPolicy.startsWith('non_blocking_')), 'visual-only scene objects should declare nonblocking collision policy');
assert(groundDecals.every((object) => !object.blocksMovement && object.physical.heightMeters <= 0.03), 'leaf/root ground decals should not create hard movement stops');
assert(map.sceneObjects.every((object) => object.scaleProfileId === WORLD_SCALE.id), 'scene objects should carry the active grounded scale profile');

const boulder = boulders[0];
equal(isSceneObjectBlocked(map, boulder.x, boulder.y), true, 'boulder center tile should be blocked');
equal(isSceneObjectBlocked(map, boulder.tileX + 1.2, boulder.tileY + 1.2), true, 'full boulder footprint should block movement');
equal(isSceneObjectBlocked(map, boulder.tileX - 0.1, boulder.y), false, 'adjacent tile should remain walkable');

const blockers = buildSceneObjectOcclusionBlockers(map.sceneObjects);
equal(blockers.length, shadowCasters.length, 'only shadow-capable scene objects should become explicit occlusion blockers');
assert(blockers.length < map.sceneObjects.length, 'nonblocking undergrowth and ground decals should not become shadow blockers');
assert(blockers.every((blocker) => blocker.height > 0 && blocker.radius > 0), 'scene object blockers should carry radius and height');

const game = createInitialGameState(map);
equal(game.sceneObjects.length, map.sceneObjects.length, 'game state should expose map-owned scene objects');
equal(game.occlusionBlockers.length, shadowCasters.length, 'game state should expose only scene object shadow blockers');
assert(game.occlusionBlockers.some((blocker) => blocker.shadowShape?.primitives?.length > 1), 'scene object blockers should carry compound declarative shadow-shape profiles');
assert(game.actors.every((actor) => !isSceneObjectBlocked(map, actor.x, actor.y)), 'scaled scene objects should not overlap actor spawn tiles');

const transform = getComponent(game.world, game.dragonId, ComponentType.Transform);
transform.x = boulder.tileX - 0.08;
transform.y = boulder.y;
moveEntityRaw(game.world, game.dragonId, 0.2, 0, map);
assert(Math.floor(transform.x) !== boulder.tileX, 'movement should not enter a blocked scene object tile');

const camera = createCamera({ clientWidth: 1280, clientHeight: 720 }, map);
camera.x = 16 * CONFIG.tileSize;
camera.y = 14 * CONFIG.tileSize;
camera.zoom = 1.5;
const projection = buildRenderProjection({ game, map, camera, time: 0 }, CONFIG);
equal(projection.scenery.length, map.sceneObjects.length, 'render projection should include scene object scenery packets');
assert(projection.scenery.every((object) => object.classification === 'renderer_neutral_scene_object_projection'), 'scenery packets should stay renderer-neutral');
assert(projection.scenery.some((object) => object.type === SceneObjectType.TREE), 'projection should include tree scenery');
assert(projection.scenery.some((object) => object.treeDefinition?.species === 'silver_birch'), 'projection should include tree species recipe variants');
assert(projection.scenery.some((object) => object.type === SceneObjectType.DEAD_SNAG), 'projection should include dead snag scenery');
assert(projection.scenery.some((object) => object.type === SceneObjectType.BOULDER), 'projection should include boulder scenery');
assert(projection.scenery.some((object) => object.type === SceneObjectType.FERN_PATCH), 'projection should include fern undergrowth scenery');
assert(projection.scenery.some((object) => object.type === SceneObjectType.FOREST_SHRUB), 'projection should include shrub undergrowth scenery');
assert(projection.scenery.some((object) => object.type === SceneObjectType.LEAF_LITTER), 'projection should include ground decal scenery');
const treePacket = projection.scenery.find((object) => object.type === SceneObjectType.TREE);
assert(treePacket.treeDefinition?.contract === 'black-sky-bound.procedural-tree-definition.v1', 'tree projection should carry resolved renderer-neutral Tree DNA');
assert(treePacket.worldWidth >= 6 * CONFIG.tileSize, 'tree projection should carry large visual world width');
assert(treePacket.collisionWorldWidth < treePacket.worldWidth, 'tree projection should keep collision footprint separate from visual crown');
const fernPacket = projection.scenery.find((object) => object.type === SceneObjectType.FERN_PATCH);
assert(!fernPacket.blocksMovement && fernPacket.collisionPolicy === 'non_blocking_scene_detail_v0', 'fern projection should preserve nonblocking visual detail contract');
assert(fernPacket.undergrowthDefinition?.contract === 'black-sky-bound.procedural-undergrowth-definition.v1', 'fern projection should carry resolved renderer-neutral Undergrowth DNA');
assert(fernPacket.render.kind === 'procedural_undergrowth', 'legacy fern records should select the shared procedural undergrowth renderer');
assert(projection.occlusionShadows.activeBlockers >= 1, 'scene object blockers should feed occlusion projection');
assert(projection.occlusionShadows.approximateShadowRegions >= 1, 'torch-adjacent scene objects should project visible shadow regions');
assert(projection.occlusionShadows.shadowFieldPacketCount >= 1, 'torch-adjacent scene objects should project SDF-ready shadow field packets');
assert(projection.occlusionShadows.shadowFieldPacketCount > projection.occlusionShadows.approximateShadowRegions, 'compound silhouettes should emit multiple SDF field packets per visible shadow region');
assert(projection.occlusionShadows.shadowSilhouettePrimitiveCount === projection.occlusionShadows.shadowFieldPacketCount, 'projection should count active SDF silhouette primitives');
assert(projection.occlusionShadows.shadowFieldSampleCount >= projection.occlusionShadows.shadowFieldPacketCount * 3, 'shadow field packets should expose sampled field data');

const context = {
  camera: {
    visibleWorldBounds() {
      return { left: 0, top: 0, right: map.width * CONFIG.tileSize, bottom: map.height * CONFIG.tileSize };
    }
  },
  lightSpaceCulling: projection.lightSpaceCulling
};
const sceneryLayer = new WebGLSceneryLayer();
sceneryLayer.update(projection, context);
equal(sceneryLayer.mode, WEBGL_SCENERY_MODE, 'WebGL scenery layer should declare the scene-object mode');
equal(sceneryLayer.sourceCount, map.sceneObjects.length, 'WebGL scenery layer should see all scene object packets');
assert(sceneryLayer.primitiveCount > sceneryLayer.sourceCount, 'WebGL scenery layer should build visible primitives for scene objects');
assert(sceneryLayer.proceduralUndergrowthCount >= ferns.length + shrubs.length, 'WebGL scenery diagnostics should expose generated undergrowth objects');
assert(sceneryLayer.proceduralUndergrowthSplineCount > sceneryLayer.proceduralUndergrowthCount, 'procedural undergrowth should expose multiple generated splines per object');
assert(sceneryLayer.status === 'active', 'WebGL scenery layer should be active when scene objects are visible');

const lightingLayer = new WebGLLightingLayer();
lightingLayer.update(projection, context);
equal(lightingLayer.occlusionShadowMode, WEBGL_SHADOW_MODE, 'lighting layer should use the SDF-ready WebGL shadow field mode');
equal(lightingLayer.shadowCompositeMode, WEBGL_SHADOW_COMPOSITE_MODE, 'lighting layer should use the profiled light/shadow composite mode');
assert(lightingLayer.occlusionShadowRenderable, 'lighting layer should mark projected shadows renderable');
assert(lightingLayer.shadowContactTriangleCount > 0, 'shadow casters should render authored contact footprints');
equal(lightingLayer.shadowContactFootprintCount, projection.occlusionShadows.contactFootprintCount, 'contact footprints should be rendered once per visible caster');
equal(lightingLayer.shadowPenumbraTriangleCount + lightingLayer.shadowCoreTriangleCount, 0, 'the renderer should not duplicate SDF streaks with coarse projected wedges');
equal(lightingLayer.shadowSegmentCount, 0, 'distance falloff should be owned by the projected SDF streak');
equal(lightingLayer.shadowShaderPacketCount, projection.occlusionShadows.shadowFieldPacketCount, 'shadow shader should consume SDF-ready field packets');
equal(lightingLayer.shadowShaderPrimitiveCount, projection.occlusionShadows.shadowFieldPacketCount, 'shadow shader should render one bounded primitive per SDF field packet');
equal(lightingLayer.shadowFieldPrimitiveCount, lightingLayer.shadowShaderPrimitiveCount, 'field primitive diagnostics should report the active shader primitive count');
equal(lightingLayer.shadowSilhouettePrimitiveCount, projection.occlusionShadows.shadowSilhouettePrimitiveCount, 'lighting layer should report active silhouette SDF primitive count');
