import { assert, equal } from './assert.mjs';
import {
  buildFoliageFireLightViews,
  buildFoliageFireSmokeSourceViews,
  FOLIAGE_FIRE_STATE,
  FoliageFirePhase,
  updateFoliageFireStates
} from '../src/data/foliageFireStates.js';
import { SceneObjectType } from '../src/data/sceneObjects.js';

const authored = [
  ...Array.from({ length: 8 }, (_, index) => foliage(`tree:${index}`, SceneObjectType.TREE, 2 + index, 0.08 + index * 0.01)),
  foliage('a:fern', SceneObjectType.FERN_PATCH, 4, 0.04),
  foliage('b:shrub', SceneObjectType.FOREST_SHRUB, 5, 0.05),
  foliage('c:bramble', SceneObjectType.SMOULDERING_BRAMBLE, 6, 0.06),
  ...Array.from({ length: 12 }, (_, index) => foliage(`fern:${index}`, SceneObjectType.FERN_PATCH, 7 + index * 0.4, 0.12 + index * 0.01))
];
const runtime = structuredClone(authored);
const wall = fireWall('inferno:one');
const initial = updateFoliageFireStates(runtime, [wall], 0);
equal(initial.ignitedByFamily.tree, FOLIAGE_FIRE_STATE.maxIgnitionsPerWall.tree, 'one wall should cap tree ignition at six nearest intersections');
equal(initial.ignitedByFamily.fern + initial.ignitedByFamily.shrub + initial.ignitedByFamily.bramble, FOLIAGE_FIRE_STATE.maxIgnitionsPerWall.undergrowth, 'one wall should cap undergrowth ignition at twelve nearest intersections');
assert(initial.ignitedByFamily.fern > 0 && initial.ignitedByFamily.shrub > 0 && initial.ignitedByFamily.bramble > 0, 'one inferno should ignite fern, shrub, and bramble families through the shared lifecycle');
assert(authored.every((object) => !object.materialState?.foliageFire), 'runtime foliage ignition must not mutate authored truth');

const tree = runtime.find((object) => object.materialState?.foliageFire?.family === 'tree');
const fern = runtime.find((object) => object.materialState?.foliageFire?.family === 'fern');
equal(tree.materialState.foliageFire.phase, FoliageFirePhase.ABLAZE, 'tree should begin ablaze');
equal(fern.materialState.foliageFire.phase, FoliageFirePhase.ABLAZE, 'undergrowth should begin ablaze');

updateFoliageFireStates(runtime, [wall], 2.1);
equal(tree.materialState.foliageFire.phase, FoliageFirePhase.ABLAZE, 'tree should retain its three-second ablaze envelope');
equal(fern.materialState.foliageFire.phase, FoliageFirePhase.SMOULDER_HIGH, 'undergrowth should enter high smoulder after two seconds');
updateFoliageFireStates(runtime, [wall], 4);
equal(tree.materialState.foliageFire.phase, FoliageFirePhase.SMOULDER_HIGH, 'tree should enter high smoulder before eight seconds');
equal(fern.materialState.foliageFire.phase, FoliageFirePhase.SMOULDER_LOW, 'undergrowth should enter low smoulder after six seconds');
updateFoliageFireStates(runtime, [wall], 6.1);
equal(fern.materialState.foliageFire.phase, FoliageFirePhase.BURNT_OUT, 'undergrowth should retain a burnt-out silhouette after twelve seconds');
equal(fern.materialState.foliageFire.charAmount, 1, 'burnt-out undergrowth should remain fully charred');
assert(!buildFoliageFireLightViews([fern]).length && !buildFoliageFireSmokeSourceViews([fern]).length, 'burnt-out undergrowth fire and smoke nodes should extinguish');

updateFoliageFireStates(runtime, [wall], 4);
equal(tree.materialState.foliageFire.phase, FoliageFirePhase.BURNT_OUT, 'tree should enter burnt-out at sixteen seconds');
equal(buildFoliageFireLightViews([tree]).length, 1, 'burnt-out tree should retain one residual ember node');
const sourceWallId = fern.materialState.foliageFire.sourceWallId;
updateFoliageFireStates(runtime, [fireWall('inferno:two')], 10);
equal(fern.materialState.foliageFire.sourceWallId, sourceWallId, 'burnt-out foliage should not reignite from later walls');
equal(fern.materialState.foliageFire.phase, FoliageFirePhase.BURNT_OUT, 'burnt-out foliage should persist for the map session');

function foliage(id, type, x, y) {
  return {
    id, type, x, y, visualX: x, visualY: y,
    occlusion: { radius: type === SceneObjectType.TREE ? 0.7 : 0.34 },
    materialState: {}
  };
}

function fireWall(id) {
  return { id, ax: 0, ay: 0, bx: 20, by: 0, width: 1.15, age: 0, lifetime: 18 };
}
