import * as THREE from 'three';
import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { EntityKind } from '../src/constants/entityKinds.js';
import { Faction } from '../src/constants/factions.js';
import { CreatureRecipeId } from '../src/data/creatures/creatureRecipes.js';
import { HumanoidProjectionId } from '../src/data/humanoids/raiderHumanoid.js';
import { getComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { syncGameViews } from '../src/game/selectors.js';
import { spawnActor } from '../src/game/spawn.js';
import { createRenderProjection3DCompiler } from '../src/projection/renderProjection3D.js';
import { createCamera } from '../src/render/camera.js';
import { ThreeActorLayer } from '../src/render/backends/three/ThreeActorLayer.js';
import { THREE_INK_HUMANOID_CONTRACT } from '../src/render/backends/three/ThreeInkHumanoidLayer.js';
import { humanoidProjectionSystem } from '../src/systems/humanoidProjectionSystem.js';
import { raiderPhysicalMotionSystem } from '../src/systems/raiderPhysicalMotionSystem.js';
import { wyvernProjectionSystem } from '../src/systems/wyvernProjectionSystem.js';
import { createDemoMap } from '../src/world/map.js';

const map = createDemoMap();
map.enemySpawns = [];
map.unitPlacements = [];
map.unitSpawners = [];
const game = createInitialGameState(map);
const raiderIds = [];
for (let index = 0; index < 100; index += 1) {
  raiderIds.push(spawnActor(game.world, EntityKind.RAIDER, 5 + (index % 10) * 0.72, 5 + Math.floor(index / 10) * 0.72, Faction.RAIDERS, {
    creature: { recipeId: CreatureRecipeId.RAIDER_SCAVENGER, seed: index + 1 },
    sourceId: `renderer-family:${index + 1}`
  }));
}
raiderPhysicalMotionSystem({ game, dt: 1 / 60 });
humanoidProjectionSystem({ game, dt: 1 / 60 });
wyvernProjectionSystem({ game, dt: 1 / 60 });
syncGameViews(game);
const compiler = createRenderProjection3DCompiler(CONFIG);
const camera = createCamera({ clientWidth: 1280, clientHeight: 720 }, map);
const projection = compiler.compile({ time: 0, map, game, camera });
const root = new THREE.Group();
const layer = new ThreeActorLayer(root);
layer.update(projection.dynamicWorld.actors);
const first = layer.diagnostics();
const humanoids = first.inkHumanoids;

equal(humanoids.contract, THREE_INK_HUMANOID_CONTRACT, 'renderer should publish the production ink-humanoid contract');
equal(humanoids.actorCount, 100, 'population proof should render all 100 recipe-backed raiders');
equal(humanoids.readyActorCount, 100, 'all recipe-backed raiders should receive solved poses');
equal(humanoids.bodySegmentCount, 1400, 'stick bodies should use one coherent articulated line graph per raider');
equal(humanoids.headRingSegmentCount, 2500, 'every head should remain a hollow camera-facing ring connected at the neck');
equal(humanoids.propSegmentCount, 200, 'each raider should expose one spear shaft and one torch shaft');
equal(humanoids.spearCount, 100, 'each right-hand spear should receive one simple spearhead');
equal(humanoids.torchCount, 100, 'each left-hand torch should receive one simple flame');
assert(humanoids.drawFamilyCount <= 5, 'the production ink population should remain inside five shared draw families');
assert(humanoids.recipeIds.length === 1 && humanoids.recipeIds[0] === CreatureRecipeId.RAIDER_SCAVENGER, 'renderer should identify the canonical recipe family');
equal(humanoids.equipmentPolicy, 'profile_owned_props_v1', 'renderer should render only the props enabled by each humanoid profile');
equal(humanoids.colourPolicy, 'absolute_black_unlit_v1', 'body and hollow-head strokes should remain absolute black under every light state');
equal(humanoids.lightReactiveActorCount, 0, 'lighting must never tint or wash out black stick figures');
assert(humanoids.profileIds.length === 1 && humanoids.profileIds[0] === HumanoidProjectionId.RAIDER_TOP_DOWN_STICK, 'renderer should identify the raider pose profile');
assert(humanoids.actorKinds.length === 1 && humanoids.actorKinds[0] === EntityKind.RAIDER, 'renderer should identify the raider actor family');
equal(humanoids.bodyLineWidthPx, 7, 'body and hollow-head ink should use the bolder production stroke');
equal(humanoids.propLineWidthPx, 4, 'prop shafts should remain distinct but visibly weighted');
equal(humanoids.missingPointErrors.length, 0, 'all ink lines and props should bind to authoritative pose points');
equal(humanoids.nonFiniteSegmentCount, 0, 'all ink line endpoints should remain finite');
equal(first.proceduralHumanoids.actorCount, 0, 'ink raiders must not also render through the faceted humanoid layer');
assert(raiderIds.every((id) => !layer.entries.has(id)), 'recipe humanoids must bypass the legacy skeleton/joint entry path');

let instancedMeshCount = 0;
let wideLineCount = 0;
const matrix = new THREE.Matrix4();
layer.inkHumanoids.root.traverse((object) => {
  if (object.isLineSegments2) {
    wideLineCount += 1;
    assert([...object.geometry.attributes.instanceStart.data.array].every(Number.isFinite), `${object.name} positions should remain finite`);
  }
  if (object.isInstancedMesh) {
    instancedMeshCount += 1;
    for (let index = 0; index < object.count; index += 1) {
      object.getMatrixAt(index, matrix);
      assert(matrix.elements.every(Number.isFinite), `instance matrix ${object.name}:${index} should remain finite`);
    }
  }
});
equal(wideLineCount, 2, 'body/head ink and prop shafts should use two shared wide-line batches');
equal(instancedMeshCount, 3, 'spearheads and two-colour flames should use three shared instanced batches');
assertUsedLineColoursAreBlack(layer.inkHumanoids.bodyLines, 'raider body and hollow-head lines');

const topologyBuilds = humanoids.topologyBuilds;
const topologyRebuilds = humanoids.topologyRebuilds;
const allocations = humanoids.allocations;
const firstTransform = getComponent(game.world, raiderIds[0], ComponentType.Transform);
firstTransform.x += 0.12;
raiderPhysicalMotionSystem({ game, dt: 1 / 60 });
humanoidProjectionSystem({ game, dt: 1 / 60 });
syncGameViews(game);
const movedProjection = compiler.compile({ time: 1 / 60, map, game, camera });
layer.update(movedProjection.dynamicWorld.actors);
const moved = layer.diagnostics().inkHumanoids;
equal(moved.topologyBuilds, topologyBuilds, 'pose updates must not rebuild ink humanoid topology');
equal(moved.topologyRebuilds, topologyRebuilds, 'stable populations must not resize ink pools');
equal(moved.allocations, allocations, 'pose updates should only rewrite line and instance buffers');

const huskIds = [];
for (let index = 0; index < 12; index += 1) {
  huskIds.push(spawnActor(game.world, EntityKind.HUSK, 14 + (index % 4) * 0.8, 8 + Math.floor(index / 4) * 0.8));
}
humanoidProjectionSystem({ game, dt: 1 / 60 });
syncGameViews(game);
const mixedProjection = compiler.compile({ time: 2 / 60, map, game, camera });
layer.update(mixedProjection.dynamicWorld.actors);
const mixed = layer.diagnostics();
const mixedHumanoids = mixed.inkHumanoids;
equal(mixedHumanoids.actorCount, 112, 'shared stick renderer should accept recipe-backed raiders and recipe-free husks together');
equal(mixedHumanoids.readyActorCount, 112, 'all husks should resolve through the generic shamble/claw pose without renderer gaps');
equal(mixedHumanoids.bodySegmentCount, 1532, 'husks should add an eleven-segment articulated stick body while preserving the detailed raider graph');
equal(mixedHumanoids.headRingSegmentCount, 2800, 'raiders and husks should share the bold hollow-head treatment');
equal(mixedHumanoids.propSegmentCount, 200, 'torchless and spearless husks should not invent prop shafts');
equal(mixedHumanoids.spearCount, 100, 'husk routing should preserve raider spear ownership without equipping husks');
equal(mixedHumanoids.torchCount, 100, 'husk routing should preserve raider torch ownership without lighting husks');
assert(mixedHumanoids.profileIds.includes(HumanoidProjectionId.RAIDER_TOP_DOWN_STICK), 'mixed population should retain the raider pose profile');
assert(mixedHumanoids.profileIds.includes(HumanoidProjectionId.HUSK_TOP_DOWN_SHAMBLER), 'mixed population should expose the husk shambler profile');
assert(mixedHumanoids.actorKinds.includes(EntityKind.RAIDER) && mixedHumanoids.actorKinds.includes(EntityKind.HUSK), 'mixed diagnostics should expose both stick-unit actor families');
equal(mixedHumanoids.missingPointErrors.length, 0, 'unarmed husks should not report missing torch, spear, neck, or toe points');
equal(mixedHumanoids.nonFiniteSegmentCount, 0, 'husk shamble and claw-ready lines should stay finite');
equal(mixed.proceduralHumanoids.actorCount, 0, 'husks must not duplicate through the faceted humanoid renderer');
assert(huskIds.every((id) => !layer.entries.has(id)), 'husks must bypass the legacy grey skeleton/joint entry path');
assertUsedLineColoursAreBlack(layer.inkHumanoids.bodyLines, 'mixed raider and husk body lines');

const humanoidRoot = layer.inkHumanoids.root;
layer.dispose();
compiler.dispose();
equal(humanoidRoot.parent, null, 'ink humanoid layer should detach cleanly on disposal');

function assertUsedLineColoursAreBlack(batch, label) {
  const colours = batch.geometry.attributes.instanceColorStart.data.array;
  const used = colours.subarray(0, batch.geometry.instanceCount * 6);
  assert(used.length > 0, `${label} should write a colour buffer`);
  assert([...used].every((channel) => channel === 0), `${label} should use exact RGB 0/0/0 rather than grey or a light-reactive tint`);
}
