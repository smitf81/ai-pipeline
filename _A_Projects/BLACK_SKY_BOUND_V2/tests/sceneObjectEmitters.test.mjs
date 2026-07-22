import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { AmbientParticleKind } from '../src/data/ambientParticles.js';
import { LightEmitterId } from '../src/constants/lightEmitterIds.js';
import { SmokeSourceKind } from '../src/data/smokeSources.js';
import { SceneObjectType, getSceneObjectDefinition } from '../src/data/sceneObjects.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { buildLightViews, syncGameViews } from '../src/game/selectors.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { createCamera } from '../src/render/camera.js';
import { buildWebGLSceneryDepthItems } from '../src/render/backends/webgl/layers/WebGLSceneryLayer.js';
import { createDemoMap } from '../src/world/map.js';

const emitterTypes = [
  SceneObjectType.FIRE_ARROW_LEFT,
  SceneObjectType.FIRE_ARROW_RIGHT,
  SceneObjectType.FIRE_ARROW_STEEP,
  SceneObjectType.FIRE_ARROW_CLUSTER,
  SceneObjectType.SMOULDERING_FERN,
  SceneObjectType.SMOULDERING_BRAMBLE
];

for (const type of emitterTypes) {
  const def = getSceneObjectDefinition(type);
  assert(def.emitter?.lightEmitterId, `${type} should declare an authored scene-object emitter`);
  assert(def.render?.kind, `${type} should declare a renderer-facing scene-object kind`);
  equal(def.collision.blocksMovement, false, `${type} should stay paintable ambience rather than a movement blocker`);
  if (String(type).startsWith('fire_arrow')) {
    equal(def.emitter.anchorSpace, 'object_anchor', `${type} flame light should anchor to the arrow socket geometry, not the shifted visual footprint`);
  }
}

const map = createDemoMap();
const game = createInitialGameState(map);
game.renderTime = 4.2;
syncGameViews(game);
const lightViews = buildLightViews(game, game.renderTime);
const sceneObjectLights = lightViews.filter((light) => light.sourceAnchor?.type === 'scene_object');
const raidFlameLights = sceneObjectLights.filter((light) => light.sourceKind === LightEmitterId.RAID_FLAME);
const clusterObject = map.sceneObjects.find((object) => object.type === SceneObjectType.FIRE_ARROW_CLUSTER);
const clusterLight = sceneObjectLights.find((light) => light.sourceEntity === clusterObject?.id);

assert(sceneObjectLights.length >= 6, 'current demo scene should seed multiple scene-object light sources');
assert(sceneObjectLights.some((light) => light.sourceKind === LightEmitterId.RAID_FLAME), 'fire-arrow scene objects should project raid flame light views');
assert(sceneObjectLights.some((light) => light.sourceKind === LightEmitterId.SMOULDER_PATCH), 'smouldering plant scene objects should project smoulder light views');
assert(sceneObjectLights.some((light) => light.smokeSourceKind === SmokeSourceKind.RAID_FLAME_WISP), 'fire-arrow light views should carry smoke-source metadata');
assert(sceneObjectLights.some((light) => light.smokeSourceKind === SmokeSourceKind.SMOULDER_PATCH_WISP), 'smouldering plant light views should carry smoke-source metadata');
assert(raidFlameLights.every((light) => light.radius <= 1.9), 'fire-arrow lights should be local socket emitters, not campfire-scale light bubbles');
assert(raidFlameLights.every((light) => light.revealRadius > light.radius), 'fire-arrow lights should still carry a broader scenery reveal radius');
assert(raidFlameLights.every((light) => light.intensity <= 0.45), 'fire-arrow lights should stay subtle enough to read as arrowhead flame');
assert(raidFlameLights.every((light) => light.revealStrength > light.intensity), 'fire-arrow reveal should be decoupled from visible glow strength');
assert(clusterObject && clusterLight, 'fire-arrow cluster should expose a paired scene-object light');
assert(Math.abs(clusterLight.x - (clusterObject.x + clusterObject.emitter.anchorOffsetX)) < 0.001, 'fire-arrow cluster light should use the object anchor x socket');
assert(Math.abs(clusterLight.y - (clusterObject.y + clusterObject.emitter.anchorOffsetY)) < 0.001, 'fire-arrow cluster light should use the object anchor y socket');
assert(Math.hypot(clusterLight.x - clusterObject.visualX, clusterLight.y - clusterObject.visualY) > 0.2, 'fire-arrow cluster light should no longer follow the shifted visual center');

assert(game.smokeSources.some((source) => source.sourceKind === SmokeSourceKind.RAID_FLAME_WISP), 'scene-object fire emitters should contribute unified smoke sources');
assert(game.smokeSources.some((source) => source.sourceKind === SmokeSourceKind.SMOULDER_PATCH_WISP), 'scene-object smoulder emitters should contribute unified smoke sources');

for (const light of raidFlameLights) {
  const core = game.smokeSources.find((source) => source.id === `smoke_source:${SmokeSourceKind.RAID_FLAME_WISP}:${light.id}:core`);
  const trail = game.smokeSources.find((source) => source.id === `smoke_source:${SmokeSourceKind.RAID_FLAME_WISP}:${light.id}:trail`);
  assert(core, `raid flame ${light.id} should own a smoke core at the flame socket`);
  assert(trail, `raid flame ${light.id} should own a smoke trail from the same socket`);
  assert(distance(core, light) < 0.001, `raid flame ${light.id} smoke core should stay synchronized with the flame socket`);
  assert(trail.radius < light.radius * 0.18, `raid flame ${light.id} smoke trail should stay wisp-scale relative to its flame`);
}

const camera = createCamera({ clientWidth: 1280, clientHeight: 720 }, map);
camera.x = 12 * CONFIG.tileSize;
camera.y = 13 * CONFIG.tileSize;
camera.zoom = 1.8;
const projection = buildRenderProjection({ game, map, camera, time: game.renderTime }, CONFIG);

assert(projection.scenery.some((object) => object.type === SceneObjectType.FIRE_ARROW_CLUSTER && object.render?.kind === 'fire_arrow_cluster'), 'projection should preserve grouped fire-arrow scenery kind');
assert(projection.scenery.some((object) => object.type === SceneObjectType.SMOULDERING_FERN && object.render?.kind === 'procedural_undergrowth'), 'smouldering fern should preserve emitter type while using the procedural undergrowth renderer');
assert(projection.particles.some((particle) => particle.kind === AmbientParticleKind.RAID_FLAME_SPARK && particle.sourceKind === LightEmitterId.RAID_FLAME), 'raid flame lights should project their smaller authored spark particles');
assert(projection.particles.some((particle) => particle.kind === AmbientParticleKind.ASH_FLECK && particle.sourceKind === SmokeSourceKind.SMOULDER_PATCH_WISP), 'smouldering plant smoke should project ash fleck particles');

const raidSpark = projection.particles.find((particle) => particle.kind === AmbientParticleKind.RAID_FLAME_SPARK);
const sparkLight = projection.lights.find((light) => light.id === raidSpark?.sourceId);
assert(raidSpark && sparkLight, 'raid flame spark particles should be traceable back to their flame light socket');
assert(Math.abs(raidSpark.worldX - sparkLight.worldX) <= CONFIG.tileSize * 0.18, 'raid flame sparks should emit from the flame socket, not the prop body');
assert(raidSpark.worldY <= sparkLight.worldY, 'raid flame sparks should rise from the flame socket');

const sceneryBuild = buildWebGLSceneryDepthItems(projection, {
  camera: {
    visibleWorldBounds() {
      return { left: 0, top: 0, right: map.width * CONFIG.tileSize, bottom: map.height * CONFIG.tileSize };
    }
  },
  lightSpaceCulling: projection.lightSpaceCulling
});
const clusterItem = sceneryBuild.items.find((item) => item.id === map.sceneObjects.find((object) => object.type === SceneObjectType.FIRE_ARROW_CLUSTER)?.id);
const smoulderingItem = sceneryBuild.items.find((item) => item.id === map.sceneObjects.find((object) => object.type === SceneObjectType.SMOULDERING_FERN)?.id);
const clusterBounds = geometryBounds(clusterItem);
assert(clusterBounds.width <= CONFIG.tileSize * 1.25, 'WebGL fire-arrow cluster geometry should not render as a barrier-width prop');
assert(clusterBounds.height <= CONFIG.tileSize * 1.15, 'WebGL fire-arrow cluster geometry should stay low and subtle in world scale');
assert(smoulderingItem?.proceduralUndergrowth?.emberNodeCount >= 1, 'smouldering emitter props should receive generated ember sockets without moving emitter ownership');

function distance(a, b) {
  return Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0));
}

function geometryBounds(item) {
  assert(item, 'expected a built scenery item for geometry bounds');
  const xs = [];
  const ys = [];
  for (const rect of item.rects ?? []) {
    xs.push(rect.x, rect.x + rect.w);
    ys.push(rect.y, rect.y + rect.h);
  }
  for (const triangle of item.triangles ?? []) {
    xs.push(triangle.ax, triangle.bx, triangle.cx);
    ys.push(triangle.ay, triangle.by, triangle.cy);
  }
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys)
  };
}
