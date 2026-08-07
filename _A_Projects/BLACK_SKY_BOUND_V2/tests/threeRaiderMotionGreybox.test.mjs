import * as THREE from 'three';
import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { EntityKind } from '../src/constants/entityKinds.js';
import { Faction } from '../src/constants/factions.js';
import { CreatureRecipeId } from '../src/data/creatures/creatureRecipes.js';
import { EnemyAttackProfileId } from '../src/data/enemyAttackProfiles.js';
import { getComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { syncGameViews } from '../src/game/selectors.js';
import { spawnActor } from '../src/game/spawn.js';
import { createRenderProjection3DCompiler } from '../src/projection/renderProjection3D.js';
import { createCamera } from '../src/render/camera.js';
import { ThreeActorLayer } from '../src/render/backends/three/ThreeActorLayer.js';
import { THREE_RAIDER_MOTION_GREYBOX_CONTRACT } from '../src/render/backends/three/ThreeRaiderMotionGreyboxLayer.js';
import { beginEnemyAttack, enemyAttackSystem } from '../src/systems/enemyAttackSystem.js';
import { humanoidProjectionSystem } from '../src/systems/humanoidProjectionSystem.js';
import { raiderPhysicalMotionSystem } from '../src/systems/raiderPhysicalMotionSystem.js';
import { createDemoMap } from '../src/world/map.js';

const map = createDemoMap();
map.enemySpawns = [];
map.unitPlacements = [];
map.unitSpawners = [];
const game = createInitialGameState(map);
const raider = spawnActor(game.world, EntityKind.RAIDER, 7, 7, Faction.RAIDERS, {
  creature: { recipeId: CreatureRecipeId.RAIDER_SCAVENGER, seed: 1 }, sourceId: 'greybox-renderer:seed-1'
});
const target = getComponent(game.world, game.dragonId, ComponentType.Transform);
Object.assign(target, { x: 7.9, y: 7 });
const ai = getComponent(game.world, raider, ComponentType.EnemyPressureAI);
const physicalMotion = getComponent(game.world, raider, ComponentType.RaiderPhysicalMotion);
physicalMotion.poseEnabled = true;
physicalMotion.poseActivation = 'renderer_proof';
ai.attackProfileIds = [EnemyAttackProfileId.RAIDER_SPEAR_JAB];
ai.targetId = game.dragonId;
beginEnemyAttack(game.world, raider, ai, game.dragonId);
raiderPhysicalMotionSystem({ game, dt: 1 / 60 });
humanoidProjectionSystem({ game, dt: 1 / 60 });
syncGameViews(game);

const compiler = createRenderProjection3DCompiler(CONFIG);
const camera = createCamera({ clientWidth: 1280, clientHeight: 720 }, map);
const root = new THREE.Group();
const layer = new ThreeActorLayer(root, { search: '?raiderMotionGreybox=1' });
let projection = compiler.compile({ time: 0, map, game, camera });
layer.update(projection.dynamicWorld.actors);
const first = layer.diagnostics();
const greybox = first.raiderMotionGreybox;
equal(greybox.contract, THREE_RAIDER_MOTION_GREYBOX_CONTRACT, 'greybox renderer should publish its v0 contract');
equal(greybox.enabled, true, 'query-gated greybox lane should be active');
equal(greybox.actorCount, 1, 'greybox lane should show the one physical raider');
equal(greybox.segmentCount, 13, 'greybox should display a compact body hierarchy plus one spear');
equal(greybox.massCount, 7, 'greybox should expose pelvis, chest, head, hands, and feet without finished armour masses');
equal(greybox.contactMarkerCount, 2, 'greybox should expose both physical foot contacts');
equal(greybox.plantedContactCount, 2, 'wind-up stance should brace both foot contacts');
equal(first.proceduralHumanoids.actorCount, 0, 'finished recipe body and attachments should be suppressed in greybox mode');
assert(!layer.entries.has(raider), 'greybox raider should bypass legacy and finished-body actor entries');
assert(layer.raiderMotionGreybox.root.visible, 'greybox root should be visible');

let meshCount = 0;
layer.raiderMotionGreybox.root.traverse((object) => {
  if (!object.isMesh && !object.isLine) return;
  meshCount += 1;
  assert(object.position.toArray().every(Number.isFinite), `${object.type} should have a finite position`);
  assert(object.scale.toArray().every(Number.isFinite), `${object.type} should have a finite scale`);
});
assert(meshCount >= 27, 'greybox should include body, contact, CoM, attention, and attack-path geometry');
assert(layer.raiderMotionGreybox.entries.get(raider).impactMarker.visible, 'wind-up prediction should expose an impact marker');
assert(layer.raiderMotionGreybox.entries.get(raider).path.visible, 'wind-up prediction should expose its attack line');
assert(Math.abs(layer.raiderMotionGreybox.entries.get(raider).segments[12].scale.y - 1.55) < 0.0001, 'one gameplay-linked spear should remain legible at the gameplay camera');
assert(Math.abs(layer.raiderMotionGreybox.entries.get(raider).path.position.y - 0.105) < 0.0001, 'prediction line should read on the flat proof stage');
const topologyBuilds = greybox.topologyBuilds;

const source = getComponent(game.world, raider, ComponentType.Transform);
source.x += 0.04;
raiderPhysicalMotionSystem({ game, dt: 1 / 60 });
humanoidProjectionSystem({ game, dt: 1 / 60 });
syncGameViews(game);
projection = compiler.compile({ time: 1 / 60, map, game, camera });
layer.update(projection.dynamicWorld.actors);
equal(layer.diagnostics().raiderMotionGreybox.topologyBuilds, topologyBuilds, 'motion frames should update transforms without rebuilding greybox topology');

raiderPhysicalMotionSystem({ game, dt: 1 / 60 });
enemyAttackSystem({ game, dt: ai.attackTimer });
raiderPhysicalMotionSystem({ game, dt: 1 / 60 });
humanoidProjectionSystem({ game, dt: 1 / 60 });
syncGameViews(game);
projection = compiler.compile({ time: 2 / 60, map, game, camera });
layer.update(projection.dynamicWorld.actors);
const committed = layer.diagnostics().raiderMotionGreybox;
assert(committed.impactFrozen, 'committed jab should publish a frozen impact marker');
equal(committed.topologyBuilds, topologyBuilds, 'commit state should not rebuild greybox topology');

const greyboxRoot = layer.raiderMotionGreybox.root;
layer.dispose();
compiler.dispose();
equal(greyboxRoot.parent, null, 'greybox layer should detach cleanly on disposal');
