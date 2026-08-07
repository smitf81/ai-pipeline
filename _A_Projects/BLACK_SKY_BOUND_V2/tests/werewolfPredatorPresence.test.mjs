import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { EntityKind } from '../src/constants/entityKinds.js';
import { Faction } from '../src/constants/factions.js';
import { ACTORS } from '../src/data/actors.js';
import { getActorLightReadabilityProfile } from '../src/data/actorLightReadabilityProfiles.js';
import { EnemyAttackPhase, EnemyAttackProfileId, getEnemyAttackProfile } from '../src/data/enemyAttackProfiles.js';
import { RAIDER_HUMANOID_PROFILE, HUSK_HUMANOID_PROFILE } from '../src/data/humanoids/raiderHumanoid.js';
import { createWerewolfPredatorProfile, WEREWOLF_PREDATOR_PROFILE } from '../src/data/creatures/werewolfPredator.js';
import { getComponent, removeComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { spawnActor } from '../src/game/spawn.js';
import { syncGameViews } from '../src/game/selectors.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { createCamera } from '../src/render/camera.js';
import { buildWebGLPredatorSilhouette, WEBGL_PREDATOR_MODE } from '../src/render/backends/webgl/WebGLPredatorSilhouette.js';
import { enemyAttackSystem } from '../src/systems/enemyAttackSystem.js';
import { enemyPressureSystem } from '../src/systems/enemyPressureSystem.js';
import { humanoidProjectionSystem } from '../src/systems/humanoidProjectionSystem.js';
import { predatorProjectionSystem } from '../src/systems/predatorProjectionSystem.js';
import { createDemoMap } from '../src/world/map.js';

const bite = getEnemyAttackProfile(EnemyAttackProfileId.WEREWOLF_LUNGE_BITE);
equal(ACTORS[EntityKind.WEREWOLF].radius, 0.38, 'visual presence should not silently enlarge the werewolf collider');
equal(bite.weaponReach, 1.28, 'visual presence should not silently alter canonical bite reach');
equal(WEREWOLF_PREDATOR_PROFILE.collision.colliderRadius, ACTORS[EntityKind.WEREWOLF].radius, 'visual profile should disclose the unchanged collider expectation');
equal(WEREWOLF_PREDATOR_PROFILE.collision.attackEndpointPolicy, 'canonical_muzzle_socket_at_profile_weapon_reach', 'visual profile should declare canonical reach consumption');
assert(Object.isFrozen(WEREWOLF_PREDATOR_PROFILE.body) && Object.isFrozen(WEREWOLF_PREDATOR_PROFILE.limbs), 'canonical predator profile sections should stay immutable');

const bossReadyVariant = createWerewolfPredatorProfile({
  id: 'test_future_werewolf_variant',
  visual: { scale: 1.35, detailTier: 3 },
  body: { shoulderWidth: 1.12 },
  fur: { maneIntensity: 1.08 },
  attack: { poseExaggeration: 1.16 }
});
equal(bossReadyVariant.body.chestRadius, WEREWOLF_PREDATOR_PROFILE.body.chestRadius, 'bounded profile extension should inherit unspecified base anatomy');
equal(bossReadyVariant.body.shoulderWidth, 1.12, 'bounded profile extension should override explicit anatomy');
equal(bossReadyVariant.visual.scale, 1.35, 'bounded profile extension should support future overall scale without boss behavior');
equal(WEREWOLF_PREDATOR_PROFILE.visual.scale, 1, 'creating a variant must not mutate the normal werewolf profile');

const comparison = createHarness();
const raider = spawnPassive(comparison, EntityKind.RAIDER, 5, 5, Faction.RAIDERS);
const husk = spawnPassive(comparison, EntityKind.HUSK, 8, 5, Faction.HUSKS);
const wolf = spawnPassive(comparison, EntityKind.WEREWOLF, 11, 5, Faction.WOLVES);
humanoidProjectionSystem({ game: comparison.game, dt: 0 });
predatorProjectionSystem({ game: comparison.game, dt: 0 });
const raiderProjection = component(comparison, raider, ComponentType.HumanoidProjection);
const huskProjection = component(comparison, husk, ComponentType.HumanoidProjection);
const wolfProjection = component(comparison, wolf, ComponentType.PredatorProjection);
const wolfShoulders = distance(wolfProjection.points.leftShoulder, wolfProjection.points.rightShoulder);
assert(wolfShoulders > distance(raiderProjection.points.leftShoulder, raiderProjection.points.rightShoulder) * 1.42, 'werewolf shoulders should be substantially broader than a raider body');
assert(wolfShoulders > distance(huskProjection.points.leftShoulder, huskProjection.points.rightShoulder) * 1.9, 'werewolf shoulders should dominate the husk body');
assert(wolfProjection.visualBounds.width > 2.5 && wolfProjection.visualBounds.height > 2.1, 'werewolf should occupy a deliberately broad and long visual footprint');
assert(WEREWOLF_PREDATOR_PROFILE.body.chestRadius > WEREWOLF_PREDATOR_PROFILE.body.waistRadius * 1.9, 'profile should preserve a powerful chest-to-waist taper rather than uniform scaling');
equal(RAIDER_HUMANOID_PROFILE.body.shoulderWidth, 0.62, 'werewolf work must not change raider proportions');
equal(HUSK_HUMANOID_PROFILE.body.shoulderWidth, 0.54, 'werewolf work must not change husk proportions');
assertPredatorArticulation(wolfProjection, 'idle werewolf');
assertAllFinite(wolfProjection.points, 'idle werewolf');
assert(Math.abs(localForward(wolfProjection, wolfProjection.points.leftWrist) - localForward(wolfProjection, wolfProjection.points.rightWrist)) > 0.08, 'idle forelimbs should retain authored predatory asymmetry');

const wolfTransform = component(comparison, wolf, ComponentType.Transform);
const idleLeftHind = relativePoint(wolfProjection.points.leftHindPaw, wolfTransform);
wolfTransform.x += 0.12;
predatorProjectionSystem({ game: comparison.game, dt: 1 / 30 });
assert(wolfProjection.movement01 > 0.9, 'pursuit movement should enter the heavy prowl pose');
assert(distance(idleLeftHind, relativePoint(wolfProjection.points.leftHindPaw, wolfTransform)) > 0.08, 'heavy prowl should drive visible grounded hind-leg motion');
equal(wolfProjection.animationState.locomotionId, 'heavy_prowl', 'movement should expose the predator-specific locomotion identity');

const attackHarness = createHarness();
const attackWolf = spawnActor(attackHarness.game.world, EntityKind.WEREWOLF, 10, 10, Faction.WOLVES);
const attackTransform = component(attackHarness, attackWolf, ComponentType.Transform);
const target = component(attackHarness, attackHarness.game.dragonId, ComponentType.Transform);
Object.assign(target, { x: 11, y: 10 });
predatorProjectionSystem({ game: attackHarness.game, dt: 0 });
const attackProjection = component(attackHarness, attackWolf, ComponentType.PredatorProjection);
const idleMuzzleReach = distance(attackTransform, attackProjection.points.muzzle);
const idleHindWidth = distance(attackProjection.points.leftHindPaw, attackProjection.points.rightHindPaw);
enemyPressureSystem({ game: attackHarness.game, map: attackHarness.map, dt: 0 });
enemyAttackSystem({ game: attackHarness.game, dt: bite.windup * 0.84 });
predatorProjectionSystem({ game: attackHarness.game, dt: 0 });
equal(attackProjection.attackState.phase, EnemyAttackPhase.WINDUP, 'lunge should retain a distinct load phase');
assert(distance(attackTransform, attackProjection.points.muzzle) < idleMuzzleReach - 0.18, 'windup should visibly pull the head and muzzle back');
assert(distance(attackProjection.points.leftHindPaw, attackProjection.points.rightHindPaw) > idleHindWidth + 0.12, 'windup should load the haunches through a wider stance');
assert(attackProjection.animationState.jawOpen01 < 0.08, 'windup should close the jaw before release');
assertPredatorArticulation(attackProjection, 'windup werewolf');

enemyAttackSystem({ game: attackHarness.game, dt: bite.windup * 0.16 + bite.active * bite.damageTime01 });
predatorProjectionSystem({ game: attackHarness.game, dt: 0 });
equal(attackProjection.attackState.phase, EnemyAttackPhase.ACTIVE, 'lunge should expose its release phase');
assert(Math.abs(distance(attackTransform, attackProjection.points.muzzle) - bite.weaponReach) < 0.001, 'muzzle socket should land exactly at canonical bite reach at damage time');
assert(attackProjection.animationState.jawOpen01 > 0.9, 'bite release should open the jaw strongly');
assert(Math.max(distance(attackTransform, attackProjection.points.leftClaw), distance(attackTransform, attackProjection.points.rightClaw)) < bite.weaponReach + 0.035, 'visual claws should not materially over-promise canonical attack reach');
assertPredatorArticulation(attackProjection, 'active werewolf');

for (const facing of [0, Math.PI / 4, Math.PI / 2, -Math.PI * 0.72]) {
  stageActiveAttack(attackHarness, attackWolf, facing);
  predatorProjectionSystem({ game: attackHarness.game, dt: 0 });
  const direction = normalised(attackProjection.points.muzzle.x - attackTransform.x, attackProjection.points.muzzle.y - attackTransform.y);
  assert(direction.x * Math.cos(facing) + direction.y * Math.sin(facing) > 0.9999, 'canonical bite endpoint should remain aligned from every staged angle');
  assert(Math.abs(distance(attackTransform, attackProjection.points.muzzle) - bite.weaponReach) < 0.001, 'canonical bite reach should remain stable from every staged angle');
}

stageRecovery(attackHarness, attackWolf, 0.68);
predatorProjectionSystem({ game: attackHarness.game, dt: 0 });
equal(attackProjection.attackState.phase, EnemyAttackPhase.RECOVER, 'lunge should expose the heavy landing recovery');
assert(distance(attackTransform, attackProjection.points.muzzle) < bite.weaponReach - 0.18, 'recovery should pull the bite silhouette back from canonical reach');
assert(attackProjection.animationState.jawOpen01 < 0.75, 'recovery should begin closing the jaw');
assertAllFinite(attackProjection.points, 'recovering werewolf');

syncGameViews(comparison.game);
const packet = renderProjection(comparison).actors.find((actor) => actor.id === wolf);
const mesh = buildWebGLPredatorSilhouette(packet);
equal(mesh.mode, WEBGL_PREDATOR_MODE, 'existing predator renderer should expose the heavy-predator mode');
assert(mesh.triangles.length >= 270 && mesh.triangles.length <= 320, `werewolf detail should remain bounded (observed ${mesh.triangles.length} triangles)`);
equal(mesh.rects.length, 0, 'werewolf should remain one procedural triangle silhouette without a fallback rectangle pass');
assert(mesh.partCount >= 30, 'renderer should consume the expanded articulated anatomy');
const rendererSource = readFileSync(new URL('../src/render/backends/webgl/WebGLPredatorSilhouette.js', import.meta.url), 'utf8');
assert(!rendererSource.includes('getEnemyAttackProfile') && !rendererSource.includes('applyDamageToEntity'), 'visual renderer must not duplicate combat truth or damage authority');
const actorLayerSource = readFileSync(new URL('../src/render/backends/webgl/layers/WebGLActorLayer.js', import.meta.url), 'utf8');
equal((actorLayerSource.match(/buildWebGLPredatorSilhouette\(actor/g) ?? []).length, 1, 'actor layer should retain one predator silhouette build path');

const lightProfile = getActorLightReadabilityProfile(ACTORS[EntityKind.WEREWOLF].lightReadabilityProfileId);
equal(lightProfile.rimWidthPx, WEREWOLF_PREDATOR_PROFILE.readability.rimWidthPx, 'werewolf light readability should consume the canonical visual profile');
assert(lightProfile.catchlightRoles.includes('mouth'), 'nearby emitters should support selective mouth/tooth catchlight without brightening the whole body');

const crowdHarness = createHarness();
const crowd = [];
for (let index = 0; index < 16; index += 1) crowd.push(spawnPassive(crowdHarness, EntityKind.WEREWOLF, 4 + index % 4, 4 + Math.floor(index / 4), Faction.WOLVES));
const startedAt = performance.now();
for (let frame = 0; frame < 120; frame += 1) {
  for (const entity of crowd) component(crowdHarness, entity, ComponentType.Transform).x += 0.0025;
  predatorProjectionSystem({ game: crowdHarness.game, dt: 1 / 60 });
}
const elapsedMs = performance.now() - startedAt;
for (const entity of crowd) assertAllFinite(component(crowdHarness, entity, ComponentType.PredatorProjection).points, 'multi-werewolf projection');
assert(elapsedMs < 1000, `16 articulated werewolves should remain within the loose CPU pose budget (observed ${elapsedMs.toFixed(2)}ms for 120 frames)`);

function createHarness() {
  const map = createDemoMap();
  map.enemySpawns = []; map.unitPlacements = []; map.unitSpawners = [];
  const game = createInitialGameState(map);
  Object.assign(getComponent(game.world, game.dragonId, ComponentType.Transform), { x: 30, y: 20 });
  return { game, map };
}

function spawnPassive(harness, type, x, y, team) {
  const entity = spawnActor(harness.game.world, type, x, y, team);
  removeComponent(harness.game.world, entity, ComponentType.EnemyPressureAI);
  return entity;
}

function stageActiveAttack(harness, entity, facing) {
  const ai = component(harness, entity, ComponentType.EnemyPressureAI);
  const transform = component(harness, entity, ComponentType.Transform);
  Object.assign(transform, { rotation: facing });
  Object.assign(ai, {
    targetId: harness.game.dragonId,
    activeAttackProfileId: bite.id,
    pendingAttackTargetId: harness.game.dragonId,
    attackPhase: EnemyAttackPhase.ACTIVE,
    attackTimer: bite.active * (1 - bite.damageTime01),
    attackDamageApplied: false
  });
}

function stageRecovery(harness, entity, progress01) {
  const ai = component(harness, entity, ComponentType.EnemyPressureAI);
  Object.assign(ai, {
    activeAttackProfileId: bite.id,
    attackPhase: EnemyAttackPhase.RECOVER,
    attackTimer: bite.recovery * (1 - progress01),
    attackDamageApplied: true
  });
}

function component(harness, entity, type) { return getComponent(harness.game.world, entity, type); }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function relativePoint(point, origin) { return { x: point.x - origin.x, y: point.y - origin.y }; }
function normalised(x, y) { const length = Math.hypot(x, y) || 1; return { x: x / length, y: y / length }; }
function localForward(projection, point) { return (point.x - projection.points.center.x) * Math.cos(projection.facing) + (point.y - projection.points.center.y) * Math.sin(projection.facing); }

function assertPredatorArticulation(projection, label) {
  for (const [root, joint, end] of [
    ['leftShoulder', 'leftElbow', 'leftWrist'], ['rightShoulder', 'rightElbow', 'rightWrist'],
    ['leftHip', 'leftKnee', 'leftHock'], ['rightHip', 'rightKnee', 'rightHock']
  ]) {
    assert(pointLineDistance(projection.points[joint], projection.points[root], projection.points[end]) > 0.045, `${label} ${joint} should retain visible bend and negative space`);
  }
  assert(distance(projection.points.leftHock, projection.points.leftHindPaw) > 0.12, `${label} should retain a visible hock-to-paw chain`);
}

function assertAllFinite(points, label) {
  for (const [role, point] of Object.entries(points)) assert(Number.isFinite(point.x) && Number.isFinite(point.y), `${label} ${role} should remain finite`);
}

function pointLineDistance(point, start, end) {
  const dx = end.x - start.x; const dy = end.y - start.y;
  return Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x) / Math.max(0.0001, Math.hypot(dx, dy));
}

function renderProjection(harness) {
  return buildRenderProjection({
    time: 0,
    map: harness.map,
    game: harness.game,
    camera: createCamera({ clientWidth: 1280, clientHeight: 720 }, harness.map)
  }, CONFIG);
}
