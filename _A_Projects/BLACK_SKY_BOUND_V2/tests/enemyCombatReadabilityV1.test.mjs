import { performance } from 'node:perf_hooks';
import { assert, equal } from './assert.mjs';
import { ComponentType } from '../src/constants/componentTypes.js';
import { DamageType } from '../src/constants/damageTypes.js';
import { EntityKind } from '../src/constants/entityKinds.js';
import { Faction } from '../src/constants/factions.js';
import { EnemyAttackPhase, EnemyAttackProfileId, getEnemyAttackProfile } from '../src/data/enemyAttackProfiles.js';
import { getComponent, removeComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { spawnActor } from '../src/game/spawn.js';
import { buildWebGLCombatDebugTriangles } from '../src/render/backends/webgl/WebGLCombatDebugGeometry.js';
import { beginEnemyAttack, enemyAttackSystem } from '../src/systems/enemyAttackSystem.js';
import { enemyPressureSystem } from '../src/systems/enemyPressureSystem.js';
import { applyDamageToEntity } from '../src/systems/healthSystem.js';
import { humanoidProjectionSystem } from '../src/systems/humanoidProjectionSystem.js';
import { predatorProjectionSystem } from '../src/systems/predatorProjectionSystem.js';
import { createDemoMap } from '../src/world/map.js';

const spear = getEnemyAttackProfile(EnemyAttackProfileId.RAIDER_SPEAR_JAB);
const torch = getEnemyAttackProfile(EnemyAttackProfileId.RAIDER_TORCH_SWING);
const maul = getEnemyAttackProfile(EnemyAttackProfileId.HUSK_CLAW_MAUL);
const bite = getEnemyAttackProfile(EnemyAttackProfileId.WEREWOLF_LUNGE_BITE);

const spearHarness = createHarness();
const spearRaider = spawnActor(spearHarness.game.world, EntityKind.RAIDER, 5, 5, Faction.RAIDERS);
const spearTarget = spawnPassive(spearHarness, EntityKind.HUSK, 5.86, 5, Faction.HUSKS);
enemyPressureSystem({ game: spearHarness.game, map: spearHarness.map, dt: 0 });
const spearAI = component(spearHarness, spearRaider, ComponentType.EnemyPressureAI);
const spearTransform = component(spearHarness, spearRaider, ComponentType.Transform);
const spearProjection = component(spearHarness, spearRaider, ComponentType.HumanoidProjection);
equal(spearAI.attackPhase, EnemyAttackPhase.WINDUP, 'spear harness should begin in windup');
humanoidProjectionSystem({ game: spearHarness.game, dt: 0 });
assertArticulated(spearProjection, 'spear windup');
const readyThreat = distance(spearTransform, spearProjection.points.spearTip);
enemyAttackSystem({ game: spearHarness.game, dt: spear.windup });
humanoidProjectionSystem({ game: spearHarness.game, dt: 0 });
const retractedThreat = distance(spearTransform, spearProjection.points.spearTip);
assert(retractedThreat < readyThreat - 0.18, 'spear windup should visibly retract its tip before commitment');
enemyAttackSystem({ game: spearHarness.game, dt: spear.active * spear.damageTime01 });
humanoidProjectionSystem({ game: spearHarness.game, dt: 0 });
equal(spearProjection.attackState.phase, EnemyAttackPhase.ACTIVE, 'spear pose should expose the active phase at damage time');
assert(Math.abs(distance(spearTransform, spearProjection.points.spearTip) - spear.weaponReach) < 0.025, 'spear tip should occupy canonical weapon reach at damage time');
assert(distance(spearProjection.points.leftHand, spearProjection.points.spearFrontGrip) < 0.0001, 'front hand should remain attached to the spear guide grip');
assert(distance(spearProjection.points.rightHand, spearProjection.points.spearRearGrip) < 0.0001, 'rear hand should remain attached to the spear anchor grip');
assertArticulated(spearProjection, 'spear active');
enemyAttackSystem({ game: spearHarness.game, dt: spear.active + spear.recovery * 0.5 });
humanoidProjectionSystem({ game: spearHarness.game, dt: 0 });
equal(spearProjection.attackState.phase, EnemyAttackPhase.RECOVER, 'spear should retain a readable recovery pose');
assert(distance(spearTransform, spearProjection.points.spearTip) < spear.weaponReach, 'spear recovery should visibly pull the weapon back');
globalThis.location = { search: '' };
equal(buildWebGLCombatDebugTriangles({ worldX: 160, worldY: 160, worldRadius: 9, radius: 0.28, rotation: 0 }, spearProjection).length, 0, 'combat debug geometry should be disabled by default');
globalThis.location.search = '?attackDebug=1';
assert(buildWebGLCombatDebugTriangles({ worldX: 160, worldY: 160, worldRadius: 9, radius: 0.28, rotation: 0 }, spearProjection).length > 0, 'attackDebug query should expose canonical hit geometry on demand');
delete globalThis.location;

const diagonalHarness = createHarness();
const diagonalRaider = spawnActor(diagonalHarness.game.world, EntityKind.RAIDER, 8, 8, Faction.RAIDERS);
const diagonalTarget = spawnPassive(diagonalHarness, EntityKind.HUSK, 8.7, 8.7, Faction.HUSKS);
enemyPressureSystem({ game: diagonalHarness.game, map: diagonalHarness.map, dt: 0 });
enemyAttackSystem({ game: diagonalHarness.game, dt: spear.windup + spear.active * spear.damageTime01 });
humanoidProjectionSystem({ game: diagonalHarness.game, dt: 0 });
const diagonalTransform = component(diagonalHarness, diagonalRaider, ComponentType.Transform);
const diagonalProjection = component(diagonalHarness, diagonalRaider, ComponentType.HumanoidProjection);
const diagonalTip = normalized(diagonalProjection.points.spearTip.x - diagonalTransform.x, diagonalProjection.points.spearTip.y - diagonalTransform.y);
assert(diagonalTip.x * Math.cos(diagonalTransform.rotation) + diagonalTip.y * Math.sin(diagonalTransform.rotation) > 0.999, 'diagonal spear tip should remain aligned to committed facing');
assertAllFinite(diagonalProjection.points, 'diagonal spear projection');

const torchHarness = createHarness();
const torchRaider = spawnActor(torchHarness.game.world, EntityKind.RAIDER, 7, 7, Faction.RAIDERS);
spawnPassive(torchHarness, EntityKind.HUSK, 7.78, 7, Faction.HUSKS);
const torchAI = component(torchHarness, torchRaider, ComponentType.EnemyPressureAI);
torchAI.nextAttackProfileIndex = 1;
enemyPressureSystem({ game: torchHarness.game, map: torchHarness.map, dt: 0 });
enemyAttackSystem({ game: torchHarness.game, dt: torch.windup * 0.7 });
humanoidProjectionSystem({ game: torchHarness.game, dt: 0 });
const torchProjection = component(torchHarness, torchRaider, ComponentType.HumanoidProjection);
const torchTransform = component(torchHarness, torchRaider, ComponentType.Transform);
const windupFlame = localVector(torchTransform, torchProjection.points.torchFlame);
assert(windupFlame.right > 0.55, 'torch windup should pull clearly to the authored swing side');
enemyAttackSystem({ game: torchHarness.game, dt: torch.windup * 0.3 + torch.active * torch.damageTime01 });
humanoidProjectionSystem({ game: torchHarness.game, dt: 0 });
const activeFlame = localVector(torchTransform, torchProjection.points.torchFlame);
assert(activeFlame.forward > 0.82 && Math.abs(activeFlame.right) < 0.32, 'torch damage timing should place the flame through the forward close-range arc');
assert(Math.abs(Math.hypot(activeFlame.forward, activeFlame.right) - torch.weaponReach) < 0.035, 'torch flame should use profile-owned weapon reach');
assertArticulated(torchProjection, 'torch active');

const guardHarness = createHarness();
const guardRaider = spawnActor(guardHarness.game.world, EntityKind.RAIDER, 10, 10, Faction.RAIDERS);
const guardTransform = component(guardHarness, guardRaider, ComponentType.Transform);
const guardAI = component(guardHarness, guardRaider, ComponentType.EnemyPressureAI);
const dragonTransform = component(guardHarness, guardHarness.game.dragonId, ComponentType.Transform);
Object.assign(dragonTransform, { x: 11.5, y: 10 });
enemyPressureSystem({ game: guardHarness.game, map: guardHarness.map, dt: 0 });
assert(guardAI.guardHoldTimer > 0, 'raider should enter its bounded guard band');
humanoidProjectionSystem({ game: guardHarness.game, dt: 0 });
const guardProjection = component(guardHarness, guardRaider, ComponentType.HumanoidProjection);
equal(guardProjection.motionState, 'guard', 'guard should own an unmistakable defensive motion state');
const guardShaft = normalized(guardProjection.points.spearTip.x - guardProjection.points.spearButt.x, guardProjection.points.spearTip.y - guardProjection.points.spearButt.y);
assert(Math.abs(guardShaft.x * Math.cos(guardTransform.rotation) + guardShaft.y * Math.sin(guardTransform.rotation)) < 0.15, 'guard should brace the spear across the incoming direction instead of resembling a thrust');
assertArticulated(guardProjection, 'guard');
Object.assign(dragonTransform, { x: 10.82, y: 10 });
equal(beginEnemyAttack(guardHarness.game.world, guardRaider, guardAI, guardHarness.game.dragonId), null, 'guard commitment should block attack overlap');
const guardHealth = component(guardHarness, guardRaider, ComponentType.Health);
const guardedBefore = guardHealth.hp;
applyDamageToEntity(guardHarness.game.world, guardRaider, 10, guardHarness.game.dragonId, DamageType.BITE);
equal(Number((guardedBefore - guardHealth.hp).toFixed(3)), 6.2, 'front-sector guard should apply its explicit modest damage multiplier');
equal(guardAI.guardBlockedCount, 1, 'successful guard should record one mitigation receipt');
assert(guardAI.guardRecoveryTimer > 0 && guardAI.guardHoldTimer === 0, 'a successful block should enter a short vulnerable recovery');
humanoidProjectionSystem({ game: guardHarness.game, dt: 0 });
equal(guardProjection.motionState, 'guard_recover', 'guard recovery should remain visibly distinct from attack windup');

const rearGuardHarness = createHarness();
const rearRaider = spawnActor(rearGuardHarness.game.world, EntityKind.RAIDER, 10, 10, Faction.RAIDERS);
const rearDragon = component(rearGuardHarness, rearGuardHarness.game.dragonId, ComponentType.Transform);
Object.assign(rearDragon, { x: 11.5, y: 10 });
enemyPressureSystem({ game: rearGuardHarness.game, map: rearGuardHarness.map, dt: 0 });
const rearAI = component(rearGuardHarness, rearRaider, ComponentType.EnemyPressureAI);
const rearHealth = component(rearGuardHarness, rearRaider, ComponentType.Health);
Object.assign(rearDragon, { x: 8.5, y: 10 });
const rearBefore = rearHealth.hp;
applyDamageToEntity(rearGuardHarness.game.world, rearRaider, 10, rearGuardHarness.game.dragonId, DamageType.BITE);
equal(rearBefore - rearHealth.hp, 10, 'rear attack should bypass the forward protected sector');
equal(rearAI.guardBlockedCount, 0, 'rear attack should not produce a false guard receipt');

const huskHarness = createHarness();
const husk = spawnActor(huskHarness.game.world, EntityKind.HUSK, 12, 12, Faction.HUSKS);
spawnPassive(huskHarness, EntityKind.RAIDER, 12.66, 12, Faction.RAIDERS);
enemyPressureSystem({ game: huskHarness.game, map: huskHarness.map, dt: 0 });
enemyAttackSystem({ game: huskHarness.game, dt: maul.windup * 0.82 });
humanoidProjectionSystem({ game: huskHarness.game, dt: 0 });
const huskProjection = component(huskHarness, husk, ComponentType.HumanoidProjection);
const compressedHands = handForward(huskProjection);
enemyAttackSystem({ game: huskHarness.game, dt: maul.windup * 0.18 + maul.active * maul.damageTime01 });
humanoidProjectionSystem({ game: huskHarness.game, dt: 0 });
assert(handForward(huskProjection) > compressedHands + 0.42, 'husk maul should release compressed shoulders and hands into a heavy body-driven rake');
assertArticulated(huskProjection, 'husk maul');

const wolfHarness = createHarness();
const wolf = spawnActor(wolfHarness.game.world, EntityKind.WEREWOLF, 14, 14, Faction.WOLVES);
const wolfDragon = component(wolfHarness, wolfHarness.game.dragonId, ComponentType.Transform);
Object.assign(wolfDragon, { x: 15, y: 14 });
enemyPressureSystem({ game: wolfHarness.game, map: wolfHarness.map, dt: 0 });
predatorProjectionSystem({ game: wolfHarness.game, dt: 0 });
const wolfProjection = component(wolfHarness, wolf, ComponentType.PredatorProjection);
const readyWolfReach = distance(wolfProjection.points.chest, wolfProjection.points.muzzle);
enemyAttackSystem({ game: wolfHarness.game, dt: bite.windup + bite.active * bite.damageTime01 });
predatorProjectionSystem({ game: wolfHarness.game, dt: 0 });
assert(distance(wolfProjection.points.chest, wolfProjection.points.muzzle) > readyWolfReach + 0.12, 'werewolf should extend low and forward only during committed lunge');
enemyAttackSystem({ game: wolfHarness.game, dt: bite.active + bite.recovery * 0.45 });
predatorProjectionSystem({ game: wolfHarness.game, dt: 0 });
equal(wolfProjection.attackState.phase, EnemyAttackPhase.RECOVER, 'werewolf should expose its long vulnerable landing recovery');
assertAllFinite(wolfProjection.points, 'werewolf recovery');

const deathHarness = createHarness();
const dyingRaider = spawnActor(deathHarness.game.world, EntityKind.RAIDER, 6, 6, Faction.RAIDERS);
spawnPassive(deathHarness, EntityKind.HUSK, 6.8, 6, Faction.HUSKS);
enemyPressureSystem({ game: deathHarness.game, map: deathHarness.map, dt: 0 });
component(deathHarness, dyingRaider, ComponentType.Health).alive = false;
enemyAttackSystem({ game: deathHarness.game, dt: 0 });
humanoidProjectionSystem({ game: deathHarness.game, dt: 0 });
const deathProjection = component(deathHarness, dyingRaider, ComponentType.HumanoidProjection);
equal(deathProjection.attackState, null, 'death should clear procedural attack pose state immediately');
equal(deathProjection.guardState, null, 'death should clear procedural guard pose state immediately');
equal(deathProjection.motionState, 'defeated', 'dead raider should not retain a live combat motion state');
equal(deathProjection.motionTrails.length, 0, 'death should clear live combat motion trails');

const crowdHarness = createHarness();
const crowd = [];
for (let index = 0; index < 50; index += 1) crowd.push(spawnActor(crowdHarness.game.world, EntityKind.RAIDER, 4 + index % 10, 4 + Math.floor(index / 10), Faction.RAIDERS));
const startedAt = performance.now();
for (let frame = 0; frame < 120; frame += 1) humanoidProjectionSystem({ game: crowdHarness.game, dt: 1 / 30 });
const elapsedMs = performance.now() - startedAt;
for (const entity of crowd) assertAllFinite(component(crowdHarness, entity, ComponentType.HumanoidProjection).points, '50-raider projection');
assert(elapsedMs < 1000, `50 articulated raiders should remain within a loose CPU projection budget (observed ${elapsedMs.toFixed(2)}ms for 120 frames)`);

function createHarness() {
  const map = createDemoMap();
  map.enemySpawns = []; map.unitPlacements = []; map.unitSpawners = [];
  const game = createInitialGameState(map);
  const dragon = getComponent(game.world, game.dragonId, ComponentType.Transform);
  Object.assign(dragon, { x: 30, y: 20 });
  return { game, map };
}

function spawnPassive(harness, type, x, y, team) {
  const entity = spawnActor(harness.game.world, type, x, y, team);
  removeComponent(harness.game.world, entity, ComponentType.EnemyPressureAI);
  return entity;
}

function component(harness, entity, type) { return getComponent(harness.game.world, entity, type); }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function normalized(x, y) { const length = Math.hypot(x, y) || 1; return { x: x / length, y: y / length }; }

function localVector(transform, point) {
  const dx = point.x - transform.x; const dy = point.y - transform.y;
  const forward = { x: Math.cos(transform.rotation), y: Math.sin(transform.rotation) };
  const right = { x: -forward.y, y: forward.x };
  return { forward: dx * forward.x + dy * forward.y, right: dx * right.x + dy * right.y };
}

function handForward(projection) {
  const midpointX = (projection.points.leftHand.x + projection.points.rightHand.x) * 0.5 - projection.points.center.x;
  const midpointY = (projection.points.leftHand.y + projection.points.rightHand.y) * 0.5 - projection.points.center.y;
  return midpointX * Math.cos(projection.facing) + midpointY * Math.sin(projection.facing);
}

function assertArticulated(projection, label) {
  assertAllFinite(projection.points, label);
  for (const [root, joint, end] of [['leftShoulder', 'leftElbow', 'leftHand'], ['rightShoulder', 'rightElbow', 'rightHand']]) {
    const bend = pointLineDistance(projection.points[joint], projection.points[root], projection.points[end]);
    assert(bend > 0.025, `${label} ${joint} should retain visible stable bend and negative space`);
  }
}

function assertAllFinite(points, label) {
  for (const [role, point] of Object.entries(points)) assert(Number.isFinite(point.x) && Number.isFinite(point.y), `${label} ${role} should remain finite`);
}

function pointLineDistance(point, start, end) {
  const dx = end.x - start.x; const dy = end.y - start.y;
  return Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x) / Math.max(0.0001, Math.hypot(dx, dy));
}
