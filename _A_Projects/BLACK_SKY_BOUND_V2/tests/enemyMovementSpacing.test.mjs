import { assert, equal } from './assert.mjs';
import { ComponentType } from '../src/constants/componentTypes.js';
import { EntityKind } from '../src/constants/entityKinds.js';
import { Faction } from '../src/constants/factions.js';
import { COMBAT_BALANCE } from '../src/data/combatBalance.js';
import { EnemyAttackProfileId, getEnemyAttackProfile } from '../src/data/enemyAttackProfiles.js';
import { getComponent, removeComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { spawnActor } from '../src/game/spawn.js';
import {
  ACTOR_SEPARATION_BUCKET_SIZE,
  actorSeparationSystem
} from '../src/systems/actorSeparationSystem.js';
import {
  ENEMY_STEERING_ANGLES_DEGREES,
  isPositionBlocked,
  moveEntityWithSteering
} from '../src/systems/movementSystem.js';
import { enemyPressureSystem, getEngagementPoint } from '../src/systems/enemyPressureSystem.js';
import { enemyAttackSystem } from '../src/systems/enemyAttackSystem.js';
import { humanoidProjectionSystem } from '../src/systems/humanoidProjectionSystem.js';
import { createDemoMap } from '../src/world/map.js';
import { createSceneObjects } from '../src/world/sceneObjects.js';
import { SceneObjectType } from '../src/data/sceneObjects.js';

const steeringHarness = createHarness();
const boulder = steeringHarness.map.sceneObjects.find((object) => object.type === 'boulder');
const steeringRaider = spawnPassive(steeringHarness, EntityKind.RAIDER, boulder.tileX - 0.33, boulder.y, Faction.RAIDERS);
const steeringTransform = component(steeringHarness, steeringRaider, ComponentType.Transform);
const steeringRadius = component(steeringHarness, steeringRaider, ComponentType.Collider).radius;
assert(!isPositionBlocked(steeringHarness.map, steeringTransform.x, steeringTransform.y, steeringRadius), 'steering fixture should begin outside the blocker');
assert(isPositionBlocked(steeringHarness.map, boulder.tileX - 0.1, boulder.y, steeringRadius), 'radius-aware movement should reject a body whose edge overlaps a blocker');
assert(!isPositionBlocked(steeringHarness.map, boulder.tileX - 0.1, boulder.y, 0), 'the same center point would pass the old point-sample collision check');
const steeringStart = { x: steeringTransform.x, y: steeringTransform.y };
const steeringResult = moveEntityWithSteering(steeringHarness.game.world, steeringRaider, 1, 0, 0.1, steeringHarness.map);
assert(steeringResult.moved, 'blocked enemy movement should find a valid steering candidate');
assert(steeringResult.steeringAngleDegrees !== 0, 'obstacle avoidance should use a non-zero steering sample when intent is blocked');
assert(ENEMY_STEERING_ANGLES_DEGREES.includes(Math.abs(steeringResult.steeringAngleDegrees)), 'steering should use the fixed bounded angle set');
assert(Math.abs(steeringTransform.y - steeringStart.y) > 0.05, 'alternate steering should move around the obstacle edge');
assert(!isPositionBlocked(steeringHarness.map, steeringTransform.x, steeringTransform.y, steeringRadius), 'steered movement should remain collision-safe');

const pinchHarness = createTreeRockPinchHarness();
const pinchDragonTransform = component(pinchHarness, pinchHarness.game.dragonId, ComponentType.Transform);
pinchDragonTransform.x = 8;
pinchDragonTransform.y = 9;
const pinchedRaider = spawnActor(pinchHarness.game.world, EntityKind.RAIDER, 12.75, 9, Faction.RAIDERS);
const pinchedTransform = component(pinchHarness, pinchedRaider, ComponentType.Transform);
const pinchedRadius = component(pinchHarness, pinchedRaider, ComponentType.Collider).radius;
const pinchedAI = component(pinchHarness, pinchedRaider, ComponentType.EnemyPressureAI);
pinchedAI.targetId = pinchHarness.game.dragonId;
pinchedAI.decisionCooldown = 0.4;
pinchedAI.timeSinceMeaningfulProgress = 0.24;
pinchedAI.failedMoveCount = 2;
const pinchedStart = { x: pinchedTransform.x, y: pinchedTransform.y };
assert(!isPositionBlocked(pinchHarness.map, pinchedTransform.x, pinchedTransform.y, pinchedRadius), 'tree-rock pinch fixture should begin just outside visible recipe blockers');
for (let frame = 0; frame < 8; frame += 1) {
  enemyPressureSystem({ game: pinchHarness.game, map: pinchHarness.map, dt: 0.1 });
  assert(!isPositionBlocked(pinchHarness.map, pinchedTransform.x, pinchedTransform.y, pinchedRadius), 'stuck recovery should respect tree and boulder blockers');
}
assert(pinchedAI.stuckRecoveryCount > 0, 'stuck enemy pursuit should sample a bounded local recovery direction');
assert(pinchedAI.stuckRecoveryCount > pinchedAI.stuckRetreatCount, 'EnemyPressureAI should expose quiet stuck-recovery diagnostics without requiring noisy logs');
assert(distance(pinchedStart, pinchedTransform) > 0.08, 'pinched raider should slide, sidestep, or back off instead of vibrating in place');
assert(pinchedAI.blockedMoveCount < 8, 'held unstick direction should avoid hammering the same failed move every frame');

const retreatHarness = createTreeRockPinchHarness();
const retreatDragonTransform = component(retreatHarness, retreatHarness.game.dragonId, ComponentType.Transform);
retreatDragonTransform.x = 8;
retreatDragonTransform.y = 9;
const retreatRaider = spawnActor(retreatHarness.game.world, EntityKind.RAIDER, 12.75, 9, Faction.RAIDERS);
const retreatAI = component(retreatHarness, retreatRaider, ComponentType.EnemyPressureAI);
retreatAI.targetId = retreatHarness.game.dragonId;
retreatAI.decisionCooldown = 0.4;
retreatAI.timeSinceMeaningfulProgress = 0.9;
retreatAI.failedMoveCount = 7;
enemyPressureSystem({ game: retreatHarness.game, map: retreatHarness.map, dt: 0.1 });
assert(retreatAI.stuckRetreatCount > 0, 'long stuck pressure should force a short retreat/reacquire pause');
equal(retreatAI.targetId, null, 'long stuck pressure should drop the unreachable target briefly instead of teleporting');
assert(retreatAI.retreatTimer > 0 && retreatAI.repathPauseTimer > 0, 'retreat should be bounded by short timers');

const separationHarness = createHarness();
const dragon = separationHarness.game.dragonId;
const dragonTransform = component(separationHarness, dragon, ComponentType.Transform);
dragonTransform.x = 5;
dragonTransform.y = 5;
const lightHusk = spawnPassive(separationHarness, EntityKind.HUSK, 5.04, 5, Faction.HUSKS);
const huskTransform = component(separationHarness, lightHusk, ComponentType.Transform);
const startDistance = distance(dragonTransform, huskTransform);
const dragonStart = { ...dragonTransform };
const huskStart = { ...huskTransform };
for (let frame = 0; frame < 24; frame += 1) {
  actorSeparationSystem({ game: separationHarness.game, map: separationHarness.map, dt: 1 / 60 });
}
assert(distance(dragonTransform, huskTransform) > startDistance + 0.3, 'overlapping live actors should separate over time');
const dragonDisplacement = distance(dragonTransform, dragonStart);
const huskDisplacement = distance(huskTransform, huskStart);
assert(huskDisplacement > dragonDisplacement * 2, 'light husk should move materially more than the heavy dragon');
equal(separationHarness.game.movementSpacing.bucketSize, ACTOR_SEPARATION_BUCKET_SIZE, 'runtime diagnostics should report the canonical bucket size');
assert(separationHarness.game.movementSpacing.overlapsResolved >= 0, 'separation diagnostics should expose overlap work');

const deadHarness = createHarness();
const deadDragonTransform = component(deadHarness, deadHarness.game.dragonId, ComponentType.Transform);
deadDragonTransform.x = 5;
deadDragonTransform.y = 5;
const deadHusk = spawnPassive(deadHarness, EntityKind.HUSK, 5.04, 5, Faction.HUSKS);
const deadHuskHealth = component(deadHarness, deadHusk, ComponentType.Health);
deadHuskHealth.hp = 0;
deadHuskHealth.alive = false;
const beforeDeadSeparation = { ...deadDragonTransform };
actorSeparationSystem({ game: deadHarness.game, map: deadHarness.map, dt: 0.2 });
equal(deadDragonTransform.x, beforeDeadSeparation.x, 'dead actors should not push live actors on x');
equal(deadDragonTransform.y, beforeDeadSeparation.y, 'dead actors should not push live actors on y');

const broadphaseHarness = createHarness();
for (let index = 0; index < 10; index += 1) {
  spawnPassive(broadphaseHarness, EntityKind.HUSK, 3 + index * 3, index % 2 === 0 ? 4 : 8, Faction.HUSKS);
}
actorSeparationSystem({ game: broadphaseHarness.game, map: broadphaseHarness.map, dt: 1 / 60 });
const activeCount = broadphaseHarness.game.movementSpacing.actorCount;
const allPairs = activeCount * (activeCount - 1) / 2;
assert(broadphaseHarness.game.movementSpacing.pairChecks < allPairs, 'spatial buckets should avoid the all-actor pair count');
assert(broadphaseHarness.game.movementSpacing.bucketCount > 1, 'spread actors should occupy multiple broadphase buckets');

const engagementHarness = createHarness();
const engagementDragonTransform = component(engagementHarness, engagementHarness.game.dragonId, ComponentType.Transform);
engagementDragonTransform.x = 12;
engagementDragonTransform.y = 10;
const firstRaider = spawnActor(engagementHarness.game.world, EntityKind.RAIDER, 5, 8, Faction.RAIDERS);
const secondRaider = spawnActor(engagementHarness.game.world, EntityKind.RAIDER, 5, 12, Faction.RAIDERS);
const firstAI = component(engagementHarness, firstRaider, ComponentType.EnemyPressureAI);
const secondAI = component(engagementHarness, secondRaider, ComponentType.EnemyPressureAI);
const firstSlot = getEngagementPoint(engagementHarness.game.world, firstRaider, engagementHarness.game.dragonId, firstAI.attackRange);
const secondSlot = getEngagementPoint(engagementHarness.game.world, secondRaider, engagementHarness.game.dragonId, secondAI.attackRange);
assert(Math.abs(firstSlot.angle - secondSlot.angle) > 0.01, 'multiple enemies should receive different deterministic engagement angles');
assert(distance(firstSlot, secondSlot) > 0.1, 'engagement points should not collapse onto the same target-center path');
const bodyClearance = component(engagementHarness, firstRaider, ComponentType.Collider).radius
  + component(engagementHarness, engagementHarness.game.dragonId, ComponentType.Collider).radius;
assert(firstSlot.distance > bodyClearance, 'preferred engagement distance should account for both body radii and padding');
assert(firstSlot.distance < firstAI.attackRange, 'engagement point should remain inside the attack profile reach');
enemyPressureSystem({ game: engagementHarness.game, map: engagementHarness.map, dt: 0.1 });
equal(firstAI.targetId, engagementHarness.game.dragonId, 'engagement spacing should preserve hostile target selection');
equal(secondAI.targetId, engagementHarness.game.dragonId, 'multiple enemies should pursue the same hostile through separate offsets');
assert(firstAI.engagementSlotAngle !== secondAI.engagementSlotAngle, 'EnemyPressureAI should expose distinct live engagement slots');

const facingHarness = createHarness();
const facingRaider = spawnActor(facingHarness.game.world, EntityKind.RAIDER, 5, 5, Faction.RAIDERS);
const facingTarget = spawnPassive(facingHarness, EntityKind.HUSK, 5.75, 5, Faction.HUSKS);
const facingAI = component(facingHarness, facingRaider, ComponentType.EnemyPressureAI);
enemyPressureSystem({ game: facingHarness.game, map: facingHarness.map, dt: 0 });
actorSeparationSystem({ game: facingHarness.game, map: facingHarness.map, dt: 0.1 });
humanoidProjectionSystem({ game: facingHarness.game, dt: 0.1 });
assert(Math.abs(component(facingHarness, facingRaider, ComponentType.Transform).rotation) < 0.001, 'separation movement should not overwrite committed attack facing');
enemyAttackSystem({ game: facingHarness.game, dt: 0.35 });
equal(component(facingHarness, facingTarget, ComponentType.Health).hp, 28 - scaledEnemyDamage(getEnemyAttackProfile(EnemyAttackProfileId.RAIDER_SPEAR_JAB).damage), 'separated attacker should still resolve its committed scaled spear hit');

function createHarness() {
  const map = createDemoMap();
  map.enemySpawns = [];
  map.unitPlacements = [];
  map.unitSpawners = [];
  const game = createInitialGameState(map);
  return { game, map };
}

function createTreeRockPinchHarness() {
  const map = createDemoMap();
  map.enemySpawns = [];
  map.unitPlacements = [];
  map.unitSpawners = [];
  map.sceneObjects = createSceneObjects([
    { id: 'tree:pinch-left', type: SceneObjectType.TREE, x: 10, y: 10 },
    { id: 'boulder:pinch-right', type: SceneObjectType.BOULDER, x: 13, y: 10 },
    { id: 'root:visual-only', type: SceneObjectType.ROOT_DECAL, x: 12, y: 11 }
  ]);
  const game = createInitialGameState(map);
  return { game, map };
}

function spawnPassive(harness, type, x, y, team) {
  const entity = spawnActor(harness.game.world, type, x, y, team);
  removeComponent(harness.game.world, entity, ComponentType.EnemyPressureAI);
  return entity;
}

function component(harness, entity, type) {
  return getComponent(harness.game.world, entity, type);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function scaledEnemyDamage(damage) {
  return Math.max(COMBAT_BALANCE.enemyVsEnemyDamage.minimumDamage, damage * COMBAT_BALANCE.enemyVsEnemyDamage.multiplier);
}
