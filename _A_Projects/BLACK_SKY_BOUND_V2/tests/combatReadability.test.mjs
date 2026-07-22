import { assert, equal } from './assert.mjs';
import { AbilityId } from '../src/constants/abilityIds.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { EntityKind } from '../src/constants/entityKinds.js';
import { Faction } from '../src/constants/factions.js';
import { CONFIG } from '../src/config.js';
import { ACTORS } from '../src/data/actors.js';
import { EnemyAttackProfileId, getEnemyAttackProfile } from '../src/data/enemyAttackProfiles.js';
import { ImpactReactionProfileId } from '../src/data/impactReactionProfiles.js';
import { WyvernActionId } from '../src/data/creatures/groundedWyvernMotionProfiles.js';
import { getComponent, removeComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { spawnActor } from '../src/game/spawn.js';
import { syncGameViews } from '../src/game/selectors.js';
import { createCamera } from '../src/render/camera.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { buildWebGLRaiderHumanoidSilhouette } from '../src/render/backends/webgl/WebGLHumanoidSilhouette.js';
import { buildWebGLPredatorSilhouette } from '../src/render/backends/webgl/WebGLPredatorSilhouette.js';
import { enemyAttackSystem } from '../src/systems/enemyAttackSystem.js';
import { enemyPressureSystem } from '../src/systems/enemyPressureSystem.js';
import { humanoidProjectionSystem } from '../src/systems/humanoidProjectionSystem.js';
import { predatorProjectionSystem } from '../src/systems/predatorProjectionSystem.js';
import { torchLifecycleSystem } from '../src/systems/torchLifecycleSystem.js';
import { proceduralActionSystem, startProceduralAction } from '../src/systems/proceduralActionState.js';
import { wyvernProjectionSystem } from '../src/systems/wyvernProjectionSystem.js';
import { createDemoMap } from '../src/world/map.js';

equal(ACTORS[EntityKind.YOUNG_DRAGON].physics.reactionProfileId, ImpactReactionProfileId.WYVERN_WEIGHTED, 'wyvern should own its weighted receive profile');
equal(ACTORS[EntityKind.RAIDER].physics.reactionProfileId, ImpactReactionProfileId.RAIDER_HUMAN, 'raider should own its human receive profile');
equal(ACTORS[EntityKind.HUSK].physics.reactionProfileId, ImpactReactionProfileId.HUSK_LOOSE, 'husk should own its loose receive profile');
equal(ACTORS[EntityKind.WEREWOLF].physics.reactionProfileId, ImpactReactionProfileId.WEREWOLF_BRACED, 'werewolf should own its braced receive profile');

const raiderHarness = createHarness();
const raider = spawnActor(raiderHarness.game.world, EntityKind.RAIDER, 8, 8, Faction.RAIDERS);
const target = spawnActor(raiderHarness.game.world, EntityKind.HUSK, 8.75, 8, Faction.HUSKS);
removeComponent(raiderHarness.game.world, target, ComponentType.EnemyPressureAI);
humanoidProjectionSystem({ game: raiderHarness.game, dt: 1 / 60 });
const humanoid = component(raiderHarness, raider, ComponentType.HumanoidProjection);
assert(humanoid.points.spearButt && humanoid.points.spearTip, 'raider pose should embody the authored spear');
assert(humanoid.sockets.spearGrip && humanoid.sockets.spearTip, 'raider spear should expose renderer-neutral grip and tip sockets');
assert(Math.hypot(humanoid.points.spearTip.x - humanoid.points.spearButt.x, humanoid.points.spearTip.y - humanoid.points.spearButt.y) > 0.95, 'rendered spear should advertise longer reach than a bare hand');

const raiderAI = component(raiderHarness, raider, ComponentType.EnemyPressureAI);
raiderAI.nextAttackProfileIndex = 1;
enemyPressureSystem({ game: raiderHarness.game, map: raiderHarness.map, dt: 0 });
equal(raiderAI.activeAttackProfileId, EnemyAttackProfileId.RAIDER_TORCH_SWING, 'readability harness should enter the torch swing');
for (let index = 0; index < 5; index += 1) {
  enemyAttackSystem({ game: raiderHarness.game, dt: 0.05 });
  humanoidProjectionSystem({ game: raiderHarness.game, dt: 0.05 });
}
assert(humanoid.motionTrails.filter((sample) => sample.role === 'flame_motion').length >= 3, 'moving carried flame should retain a short bounded motion trail');
enemyAttackSystem({ game: raiderHarness.game, dt: 0.2 });
syncGameViews(raiderHarness.game);
assert(raiderHarness.game.effects.some((effect) => effect.style.visualRole === 'enemy_fire_swing_arc'), 'torch strike should publish a visible fire-swing accent even outside hit rendering');
const targetImpact = component(raiderHarness, target, ComponentType.ImpactResponse);
assert(targetImpact.lastImpact?.reactionProfileId === ImpactReactionProfileId.HUSK_LOOSE, 'enemy strike should write the target receive profile into the impact receipt');
assert(targetImpact.staggerTimer > 0 && Math.hypot(targetImpact.knockbackVelocityX, targetImpact.knockbackVelocityY) > 0, 'enemy strike should front readable recoil and push state together');
humanoidProjectionSystem({ game: raiderHarness.game, dt: 0 });
equal(component(raiderHarness, target, ComponentType.HumanoidProjection).motionState, 'hit_react', 'struck humanoid should enter procedural receive motion');

syncGameViews(raiderHarness.game);
const projection = renderProjection(raiderHarness);
const raiderPacket = projection.actors.find((actor) => actor.id === raider);
const raiderMesh = buildWebGLRaiderHumanoidSilhouette(raiderPacket);
assert(raiderMesh.spearAttached && raiderMesh.spearSocketCount === 2, 'WebGL humanoid should render the authored spear sockets');
assert(raiderMesh.triangles.length > 30, 'weapon and motion-trail pass should produce visible humanoid geometry');

const fallingTorchHarness = createHarness();
const fallingRaider = spawnActor(fallingTorchHarness.game.world, EntityKind.RAIDER, 8, 8, Faction.RAIDERS);
humanoidProjectionSystem({ game: fallingTorchHarness.game, dt: 1 / 60 });
component(fallingTorchHarness, fallingRaider, ComponentType.Health).alive = false;
torchLifecycleSystem({ game: fallingTorchHarness.game, dt: 0.08 });
torchLifecycleSystem({ game: fallingTorchHarness.game, dt: 0.08 });
syncGameViews(fallingTorchHarness.game);
const fallingTorch = renderProjection(fallingTorchHarness).droppedTorches.find((packet) => packet.sourceEntityId === fallingRaider);
assert(fallingTorch?.flameTrailActive, 'a defeated torch should retain a flame trail only while its drop is moving');

const wolfHarness = createHarness();
const wolf = spawnActor(wolfHarness.game.world, EntityKind.WEREWOLF, 8, 8, Faction.WOLVES);
const wolfTargetTransform = component(wolfHarness, wolfHarness.game.dragonId, ComponentType.Transform);
Object.assign(wolfTargetTransform, { x: 8.82, y: 8 });
predatorProjectionSystem({ game: wolfHarness.game, dt: 1 / 60 });
const predator = component(wolfHarness, wolf, ComponentType.PredatorProjection);
const idleMuzzleReach = distance(predator.points.chest, predator.points.muzzle);
enemyPressureSystem({ game: wolfHarness.game, map: wolfHarness.map, dt: 0 });
enemyAttackSystem({ game: wolfHarness.game, dt: 0.15 });
predatorProjectionSystem({ game: wolfHarness.game, dt: 0.15 });
assert(distance(predator.points.chest, predator.points.muzzle) <= idleMuzzleReach + 0.03, 'werewolf windup should visibly compress rather than spending its reach early');
equal(predator.motionState, 'attack_windup', 'werewolf projection should expose its authored attack phase');
enemyAttackSystem({ game: wolfHarness.game, dt: 0.05 + getEnemyAttackProfile(EnemyAttackProfileId.WEREWOLF_LUNGE_BITE).active * 0.5 });
predatorProjectionSystem({ game: wolfHarness.game, dt: 0.05 });
assert(distance(predator.points.chest, predator.points.muzzle) > idleMuzzleReach + 0.12, 'werewolf active lunge should extend head and muzzle into the committed bite');
equal(predator.motionState, 'attack_active', 'werewolf projection should expose the distinct active phase');
syncGameViews(wolfHarness.game);
const wolfPacket = renderProjection(wolfHarness).actors.find((actor) => actor.id === wolf);
const wolfMesh = buildWebGLPredatorSilhouette(wolfPacket);
assert(wolfMesh?.triangles.length > 40, 'werewolf should render as a procedural predator silhouette rather than fallback box geometry');

const wyvernHarness = createHarness();
const wyvernTransform = component(wyvernHarness, wyvernHarness.game.dragonId, ComponentType.Transform);
startProceduralAction(wyvernHarness.game.world, wyvernHarness.game.dragonId, WyvernActionId.BITE_ATTACK, {
  sourceAbilityId: AbilityId.BITE_CLAW,
  aimX: wyvernTransform.x,
  aimY: wyvernTransform.y + 4
});
wyvernTransform.rotation = 0;
proceduralActionSystem({ game: wyvernHarness.game, dt: 0.14 });
wyvernProjectionSystem({ game: wyvernHarness.game, dt: 0.14 });
const wyvernAction = component(wyvernHarness, wyvernHarness.game.dragonId, ComponentType.ActionState);
const wyvernPose = component(wyvernHarness, wyvernHarness.game.dragonId, ComponentType.ProceduralPose);
const rigPose = component(wyvernHarness, wyvernHarness.game.dragonId, ComponentType.CreatureRigPose);
assert(Math.abs(wyvernTransform.rotation - Math.PI / 2) < 0.001, 'active bite should restore the committed aim after movement attempts to rotate the body');
assert(Math.abs(wyvernAction.committedFacing - wyvernTransform.rotation) < 0.001, 'body facing and action facing should remain one truth during the bite');
assert(dot(wyvernPose.attackContact.forward, { x: wyvernAction.directionX, y: wyvernAction.directionY }) > 0.999, 'bite contact should face the committed body direction');
assert(distance(rigPose.axial.head, rigPose.head.center) < rigPose.head.headLength * 0.72, 'bite head rig should remain attached to the axial head mass');

const biteProfile = getEnemyAttackProfile(EnemyAttackProfileId.WEREWOLF_LUNGE_BITE);
enemyAttackSystem({ game: wolfHarness.game, dt: biteProfile.windup });
wyvernProjectionSystem({ game: wolfHarness.game, dt: 0 });
const dragonPose = component(wolfHarness, wolfHarness.game.dragonId, ComponentType.ProceduralPose);
assert(dragonPose.impactState?.profileId === ImpactReactionProfileId.WYVERN_WEIGHTED, 'wyvern pose should consume enemy impact through its receive profile');

function createHarness() {
  const map = createDemoMap();
  map.enemySpawns = [];
  map.unitPlacements = [];
  map.unitSpawners = [];
  return { map, game: createInitialGameState(map) };
}

function component(harness, entity, type) {
  return getComponent(harness.game.world, entity, type);
}

function renderProjection(harness) {
  return buildRenderProjection({
    time: 0,
    map: harness.map,
    game: harness.game,
    camera: createCamera({ clientWidth: 1280, clientHeight: 720 }, harness.map)
  }, CONFIG);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}
