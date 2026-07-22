import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import {
  MATERIAL_PROFILES,
  MaterialFamily,
  MaterialProfileId,
  getMaterialProfile
} from '../src/data/materialProfiles.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { createDemoMap } from '../src/world/map.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { createCamera } from '../src/render/camera.js';
import { SceneObjectType } from '../src/data/sceneObjects.js';
import { adaptMaterialToWebGL, WEBGL_MATERIAL_ADAPTER_MODE } from '../src/render/backends/webgl/WebGLMaterialAdapter.js';

const profileIds = Object.values(MaterialProfileId);
for (const id of profileIds) {
  const profile = getMaterialProfile(id);
  equal(profile.id, id, `material profile ${id} should preserve its stable registry id`);
  equal(profile.contract, 'black-sky-bound.material-profile.v0', `material profile ${id} should expose the registry contract`);
  assert(Object.values(MaterialFamily).includes(profile.family), `material profile ${id} should use a known material family`);
  assert(profile.shaderVariant.includes('Material.'), `material profile ${id} should name a shader family variant`);
  for (const key of ['baseColour', 'roughness', 'metalness', 'emissive', 'alpha']) {
    assert(Object.hasOwn(profile.uniforms, key), `material profile ${id} should expose uniform ${key}`);
  }
  for (const key of ['damageAmount', 'burnAmount', 'wetness', 'factionTint', 'nightReveal', 'windSway', 'density', 'integrity', 'selectionHighlight']) {
    assert(Object.hasOwn(profile.stateDefaults, key), `material profile ${id} should expose visual state ${key}`);
  }
}

assert(profileIds.includes(MaterialProfileId.WALL_STONE), 'registry should reserve wall stone material before wall objects exist');
assert(profileIds.includes(MaterialProfileId.LAVA_EMISSIVE), 'registry should include a future lava material without needing terrain gameplay');
assert(profileIds.includes(MaterialProfileId.WOOD_BIRCH), 'registry should include tree variant wood material');
assert(profileIds.includes(MaterialProfileId.FOLIAGE_FERN), 'registry should include fern/undergrowth material');
assert(profileIds.includes(MaterialProfileId.FOREST_FLOOR_DECAL), 'registry should include forest floor decal material');
equal(Object.values(MATERIAL_PROFILES).filter((profile) => profile.family === MaterialFamily.DEBUG).length, 1, 'debug material family should be explicit and separate');

const map = createDemoMap();
const game = createInitialGameState(map);
const camera = createCamera({ clientWidth: 1280, clientHeight: 720 }, map);
const projection = buildRenderProjection({ game, map, camera, time: 0 }, CONFIG);

const player = projection.actors.find((actor) => actor.team === 'player');
const raider = projection.actors.find((actor) => actor.type === 'raider');
const husk = projection.actors.find((actor) => actor.type === 'husk');
const tree = projection.scenery.find((object) => object.type === 'tree');
const boulder = projection.scenery.find((object) => object.type === 'boulder');
const birch = projection.scenery.find((object) => object.treeDefinition?.species === 'silver_birch');
const snag = projection.scenery.find((object) => object.type === SceneObjectType.DEAD_SNAG);
const fern = projection.scenery.find((object) => object.type === SceneObjectType.FERN_PATCH);
const shrub = projection.scenery.find((object) => object.type === SceneObjectType.FOREST_SHRUB);
const leafLitter = projection.scenery.find((object) => object.type === SceneObjectType.LEAF_LITTER);
const grass = projection.terrain.tiles.find((tile) => tile.type === 'grass');
const dirt = projection.terrain.tiles.find((tile) => tile.type === 'dirt');

equal(player.material.profileId, MaterialProfileId.SCALE_WYVERN_COPPER, 'wyvern should project a scale material profile');
equal(raider.material.profileId, MaterialProfileId.CLOTH_RAIDER, 'human raider should project a cloth material profile');
equal(husk.material.profileId, MaterialProfileId.FLESH_HUSK, 'husk should project an undead flesh material profile');
equal(tree.material.profileId, MaterialProfileId.WOOD_PINE, 'tree should project a wood material profile');
equal(boulder.material.profileId, MaterialProfileId.STONE_MOSS, 'boulder should project a stone material profile');
equal(birch.material.profileId, MaterialProfileId.WOOD_BIRCH, 'birch tree variant should project its own wood material profile');
equal(snag.material.profileId, MaterialProfileId.WOOD_DEAD_SNAG, 'dead snag should project its own dry wood material profile');
equal(fern.material.profileId, MaterialProfileId.FOLIAGE_FERN, 'fern patch should project fern material profile');
equal(shrub.material.profileId, MaterialProfileId.FOLIAGE_SHRUB, 'forest shrub should project shrub material profile');
equal(leafLitter.material.profileId, MaterialProfileId.FOREST_FLOOR_DECAL, 'leaf litter should project forest floor decal material profile');
equal(grass.material.profileId, MaterialProfileId.SOIL_GRASS, 'grass terrain should project a soil/grass material profile');
equal(dirt.material.profileId, MaterialProfileId.SOIL_DIRT, 'dirt terrain should project a soil/dirt material profile');

assert(player.material.state.integrity > 0.99, 'undamaged player material should preserve full integrity');
equal(player.material.provenance.truthSource, 'material profile registry plus projected object state', 'material packets should preserve projection/truth provenance');
assert(projection.materials.profileCount >= 6, 'projection should summarize active material profiles across families');
assert(projection.materials.profiles.some((entry) => entry.family === MaterialFamily.TERRAIN), 'material summary should include terrain family');
assert(projection.materials.profiles.some((entry) => entry.family === MaterialFamily.SCENE_OBJECT), 'material summary should include scene object family');
assert(projection.materials.profiles.some((entry) => entry.family === MaterialFamily.ENTITY), 'material summary should include entity family');

const adapter = adaptMaterialToWebGL(player.material, [1, 1, 1, 1]);
equal(adapter.mode, WEBGL_MATERIAL_ADAPTER_MODE, 'WebGL adapter should expose the material adapter mode');
equal(adapter.profileId, MaterialProfileId.SCALE_WYVERN_COPPER, 'WebGL adapter should preserve profile id');
assert(adapter.baseColor.length === 4 && adapter.baseColor.every(Number.isFinite), 'WebGL adapter should emit a finite RGBA base color');
