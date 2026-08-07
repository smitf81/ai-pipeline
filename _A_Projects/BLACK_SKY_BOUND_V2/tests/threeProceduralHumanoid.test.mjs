import * as THREE from 'three';
import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { EntityKind } from '../src/constants/entityKinds.js';
import { Faction } from '../src/constants/factions.js';
import { CreatureRecipeId } from '../src/data/creatures/creatureRecipes.js';
import { getComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { syncGameViews } from '../src/game/selectors.js';
import { spawnActor } from '../src/game/spawn.js';
import { createRenderProjection3DCompiler } from '../src/projection/renderProjection3D.js';
import { createCamera } from '../src/render/camera.js';
import { ThreeActorLayer } from '../src/render/backends/three/ThreeActorLayer.js';
import { THREE_PROCEDURAL_HUMANOID_CONTRACT } from '../src/render/backends/three/ThreeProceduralHumanoidLayer.js';
import { humanoidProjectionSystem } from '../src/systems/humanoidProjectionSystem.js';
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
humanoidProjectionSystem({ game, dt: 1 / 60 });
syncGameViews(game);
const compiler = createRenderProjection3DCompiler(CONFIG);
const camera = createCamera({ clientWidth: 1280, clientHeight: 720 }, map);
const projection = compiler.compile({ time: 0, map, game, camera });
const root = new THREE.Group();
const layer = new ThreeActorLayer(root);
layer.update(projection.dynamicWorld.actors);
const first = layer.diagnostics();
const humanoids = first.proceduralHumanoids;

equal(humanoids.contract, THREE_PROCEDURAL_HUMANOID_CONTRACT, 'renderer should publish the procedural humanoid contract');
equal(humanoids.actorCount, 100, 'population proof should render all 100 recipe-backed raiders');
equal(humanoids.readyActorCount, 100, 'all recipe-backed raiders should receive solved poses');
assert(humanoids.primitiveCount >= 2500, 'solid raider assembly should include body, clothing, and equipment primitives rather than sticks');
assert(humanoids.drawFamilyCount <= 96, 'draw families should stay bounded as population grows');
assert(humanoids.variantSignatures.length === 100, 'renderer diagnostics should preserve every population variant signature');
assert(humanoids.recipeIds.length === 1 && humanoids.recipeIds[0] === CreatureRecipeId.RAIDER_SCAVENGER, 'renderer should identify the canonical recipe family');
equal(humanoids.missingSocketErrors.length, 0, 'all recipe attachments should bind to authoritative pose sockets');
for (const fragment of ['spear', 'torch', 'head', 'shoulder', 'torso', 'belt']) {
  assert(humanoids.attachmentIds.some((id) => id.includes(fragment)), `population should expose ${fragment} attachment ids`);
}
assert(raiderIds.every((id) => !layer.entries.has(id)), 'recipe humanoids must bypass the legacy skeleton/joint entry path');

let instancedMeshCount = 0;
let visibleInstanceCount = 0;
let shadowFamilyCount = 0;
const matrix = new THREE.Matrix4();
layer.proceduralHumanoids.root.traverse((object) => {
  if (!object.isInstancedMesh) return;
  instancedMeshCount += 1;
  visibleInstanceCount += object.count;
  if (object.castShadow) shadowFamilyCount += 1;
  for (let index = 0; index < object.count; index += 1) {
    object.getMatrixAt(index, matrix);
    assert(matrix.elements.every(Number.isFinite), `instance matrix ${object.name}:${index} should remain finite`);
  }
});
equal(instancedMeshCount, humanoids.pooledDrawFamilyCount, 'each diagnostic draw family should map to one shared InstancedMesh');
equal(visibleInstanceCount, humanoids.primitiveCount, 'visible instances should match renderer diagnostics');
assert(shadowFamilyCount > 0, 'nearby raider families should cast real Three.js shadows');

const topologyBuilds = humanoids.topologyBuilds;
const topologyRebuilds = humanoids.topologyRebuilds;
const allocations = humanoids.allocations;
const firstTransform = getComponent(game.world, raiderIds[0], ComponentType.Transform);
firstTransform.x += 0.12;
humanoidProjectionSystem({ game, dt: 1 / 60 });
syncGameViews(game);
const movedProjection = compiler.compile({ time: 1 / 60, map, game, camera });
layer.update(movedProjection.dynamicWorld.actors);
const moved = layer.diagnostics().proceduralHumanoids;
equal(moved.topologyBuilds, topologyBuilds, 'pose updates must not rebuild instanced humanoid topology');
equal(moved.topologyRebuilds, topologyRebuilds, 'stable populations must not resize instance pools');
equal(moved.allocations, allocations, 'pose updates should only rewrite instance matrices');

const humanoidRoot = layer.proceduralHumanoids.root;
layer.dispose();
compiler.dispose();
equal(humanoidRoot.parent, null, 'procedural humanoid layer should detach cleanly on disposal');
