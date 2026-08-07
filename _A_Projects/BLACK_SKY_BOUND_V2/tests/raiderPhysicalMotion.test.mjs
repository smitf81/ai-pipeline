import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { EntityKind } from '../src/constants/entityKinds.js';
import { Faction } from '../src/constants/factions.js';
import { CreatureRecipeId } from '../src/data/creatures/creatureRecipes.js';
import { EnemyAttackPhase, EnemyAttackProfileId, getEnemyAttackProfile } from '../src/data/enemyAttackProfiles.js';
import { getComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { syncGameViews } from '../src/game/selectors.js';
import { spawnActor } from '../src/game/spawn.js';
import { ACTION_SYSTEM_NAMES } from '../src/game/systemOrder.js';
import { createRenderProjection3DCompiler } from '../src/projection/renderProjection3D.js';
import { createCamera } from '../src/render/camera.js';
import { RAIDER_PHYSICAL_MOTION_INTENT_CONTRACT } from '../src/components/raiderPhysicalMotionComponents.js';
import { bodyContactRigSystem } from '../src/systems/bodyContactRigSystem.js';
import { beginEnemyAttack, enemyAttackSystem } from '../src/systems/enemyAttackSystem.js';
import { humanoidProjectionSystem } from '../src/systems/humanoidProjectionSystem.js';
import { raiderPhysicalMotionSystem, solveClampedImpactPoint } from '../src/systems/raiderPhysicalMotionSystem.js';
import { createDemoMap } from '../src/world/map.js';

const physicalIndex = ACTION_SYSTEM_NAMES.indexOf('raiderPhysicalMotionSystem');
assert(physicalIndex > ACTION_SYSTEM_NAMES.indexOf('enemyPressureSystem'), 'physical intent should consume movement and AI decisions');
assert(physicalIndex < ACTION_SYSTEM_NAMES.indexOf('humanoidProjectionSystem'), 'physical intent should constrain the displayed humanoid pose');
assert(ACTION_SYSTEM_NAMES.indexOf('humanoidProjectionSystem') < ACTION_SYSTEM_NAMES.indexOf('bodyContactRigSystem'), 'solved body should feed contact volumes');
assert(ACTION_SYSTEM_NAMES.indexOf('bodyContactRigSystem') < ACTION_SYSTEM_NAMES.indexOf('enemyAttackSystem'), 'contact volumes should exist before attack damage resolves');

const locomotionHarness = createHarness();
const raider = spawnActor(locomotionHarness.game.world, EntityKind.RAIDER, 8, 8, Faction.RAIDERS, {
  creature: { recipeId: CreatureRecipeId.RAIDER_SCAVENGER, seed: 1 }, sourceId: 'physical-motion:test-raider'
});
const husk = spawnActor(locomotionHarness.game.world, EntityKind.HUSK, 12, 12, Faction.HUSKS);
const intent = component(locomotionHarness, raider, ComponentType.RaiderPhysicalMotion);
equal(intent.contract, RAIDER_PHYSICAL_MOTION_INTENT_CONTRACT, 'recipe raider should own the physical-motion intent contract');
equal(intent.poseEnabled, false, 'finished recipe body should remain on the compatibility pose until greybox acceptance');
intent.poseEnabled = true;
intent.poseActivation = 'unit_proof';
equal(component(locomotionHarness, husk, ComponentType.RaiderPhysicalMotion), null, 'non-recipe humanoids should remain on their compatibility pose path');

raiderPhysicalMotionSystem({ game: locomotionHarness.game, dt: 1 / 60 });
humanoidProjectionSystem({ game: locomotionHarness.game, dt: 1 / 60 });
const transform = component(locomotionHarness, raider, ComponentType.Transform);
const initialSupport = intent.locomotion.supportFoot;
const support = intent.contacts[initialSupport];
const plantId = support.plantId;
const plantedX = support.x;
const plantedY = support.y;
for (let frame = 0; frame < 3; frame += 1) {
  transform.x += 0.045;
  raiderPhysicalMotionSystem({ game: locomotionHarness.game, dt: 1 / 60 });
  humanoidProjectionSystem({ game: locomotionHarness.game, dt: 1 / 60 });
  equal(intent.contacts[initialSupport].plantId, plantId, 'support foot should retain its plant id before transfer');
  equal(intent.contacts[initialSupport].x, plantedX, 'support foot x should not skate while planted');
  equal(intent.contacts[initialSupport].y, plantedY, 'support foot y should not skate while planted');
}
assert(intent.locomotion.starting01 > 0, 'movement onset should preserve a visible starting-inertia state');
assert(intent.pelvis.velocityX > 0, 'physical intent should retain filtered forward velocity');
for (let frame = 0; frame < 12; frame += 1) {
  transform.x += 0.045;
  raiderPhysicalMotionSystem({ game: locomotionHarness.game, dt: 1 / 60 });
  humanoidProjectionSystem({ game: locomotionHarness.game, dt: 1 / 60 });
}
assert(intent.continuity.plantSwitchCount > 0, 'locomotion should transfer support between persistent foot contacts');
const humanoid = component(locomotionHarness, raider, ComponentType.HumanoidProjection);
for (const key of ['leftFoot', 'rightFoot', 'leftKnee', 'rightKnee', 'leftElbow', 'rightElbow']) {
  assert(Number.isFinite(humanoid.points[key].x) && Number.isFinite(humanoid.points[key].y) && Number.isFinite(humanoid.points[key].height), `${key} should be solved by finite two-bone/contact geometry`);
}
const velocityBeforeStop = intent.pelvis.velocityX;
raiderPhysicalMotionSystem({ game: locomotionHarness.game, dt: 1 / 60 });
humanoidProjectionSystem({ game: locomotionHarness.game, dt: 1 / 60 });
assert(intent.pelvis.velocityX > 0 && intent.pelvis.velocityX < velocityBeforeStop, 'stopping should decay retained velocity instead of zeroing it');
assert(intent.locomotion.stopping01 > 0, 'stopping should expose a bounded inertia state');

const dragonTransform = component(locomotionHarness, locomotionHarness.game.dragonId, ComponentType.Transform);
dragonTransform.x = transform.x;
dragonTransform.y = transform.y - 1;
const ai = component(locomotionHarness, raider, ComponentType.EnemyPressureAI);
ai.targetId = locomotionHarness.game.dragonId;
transform.x += 0.03;
raiderPhysicalMotionSystem({ game: locomotionHarness.game, dt: 0.05 });
humanoidProjectionSystem({ game: locomotionHarness.game, dt: 0.05 });
assert(Math.abs(intent.attention.chestTravelDelta) > 0.2, 'chest attention should be able to turn away from travel direction');
assert(Math.abs(intent.attention.headChestDelta) > 0.08, 'head attention should lead the slower chest turn');

syncGameViews(locomotionHarness.game);
const compiler = createRenderProjection3DCompiler(CONFIG);
const projection = compiler.compile({
  time: 0,
  map: locomotionHarness.map,
  game: locomotionHarness.game,
  camera: createCamera({ clientWidth: 1280, clientHeight: 720 }, locomotionHarness.map)
});
const packet = projection.dynamicWorld.actors.find((actor) => actor.id === raider);
equal(packet.raiderPhysicalMotion.contract, RAIDER_PHYSICAL_MOTION_INTENT_CONTRACT, '3D actor projection should carry the physical-motion contract');
assert(Number.isFinite(packet.raiderPhysicalMotion.contacts.left.worldX), '3D projection should map planted contacts into world space');
equal(packet.humanoidProjection.physicalMotion.contract, RAIDER_PHYSICAL_MOTION_INTENT_CONTRACT, 'humanoid projection should identify the same physical authority');
compiler.dispose();

const bounded = solveClampedImpactPoint({ x: 0, y: 0 }, { x: 0.8, y: 0 }, { x: 0, y: 80 }, 0.24, 1.28);
assert(bounded.clamped, 'absurd lateral prediction should report clamping');
assert(bounded.offset <= 0.420001, 'prediction lead should remain inside the bounded offset');
assert(Math.abs(bounded.turnRadians) <= Math.PI * 0.180001, 'prediction should remain inside the bounded turn cone');

const miss = createAttackHarness();
const missBefore = component(miss, miss.game.dragonId, ComponentType.Health).hp;
const commit = advanceToCommit(miss, true);
assert(commit.intent.weapon.committed, 'wind-up completion should freeze the spear impact point');
const frozen = { ...commit.intent.weapon.frozenImpact };
commit.target.y += 1.2;
advanceActiveUntilResolved(miss);
equal(component(miss, miss.game.dragonId, ComponentType.Health).hp, missBefore, 'a dodge after commit should escape the frozen spear line');
equal(commit.intent.weapon.frozenImpact.x, frozen.x, 'committed impact x should not home after the target dodges');
equal(commit.intent.weapon.frozenImpact.y, frozen.y, 'committed impact y should not home after the target dodges');
assert(Math.hypot(commit.humanoid.points.spearTip.x - frozen.x, commit.humanoid.points.spearTip.y - frozen.y) < 0.16, 'the active spear tip should arrive at the frozen impact point');

const hit = createAttackHarness();
const hitBefore = component(hit, hit.game.dragonId, ComponentType.Health).hp;
const hitCommit = advanceToCommit(hit, false);
advanceActiveUntilResolved(hit);
assert(component(hit, hit.game.dragonId, ComponentType.Health).hp < hitBefore, 'a target remaining on the frozen line should be hit through body-contact volumes');
assert(hitCommit.intent.weapon.recoil01 > 0, 'real spear contact should trigger the hand-to-body recoil state');
assert(hitCommit.intent.weapon.contactCount === 1, 'physical intent should count actual spear contacts');

function createAttackHarness() {
  const harness = createHarness();
  const source = spawnActor(harness.game.world, EntityKind.RAIDER, 5, 5, Faction.RAIDERS, {
    creature: { recipeId: CreatureRecipeId.RAIDER_SCAVENGER, seed: 1 }, sourceId: 'physical-motion:attack-raider'
  });
  const sourceAI = component(harness, source, ComponentType.EnemyPressureAI);
  const sourceIntent = component(harness, source, ComponentType.RaiderPhysicalMotion);
  sourceIntent.poseEnabled = true;
  sourceIntent.poseActivation = 'unit_proof';
  sourceAI.attackProfileIds = [EnemyAttackProfileId.RAIDER_SPEAR_JAB];
  sourceAI.targetId = harness.game.dragonId;
  const target = component(harness, harness.game.dragonId, ComponentType.Transform);
  Object.assign(target, { x: 5.9, y: 5 });
  beginEnemyAttack(harness.game.world, source, sourceAI, harness.game.dragonId);
  harness.source = source;
  return harness;
}

function advanceToCommit(harness, movingTarget) {
  const ai = component(harness, harness.source, ComponentType.EnemyPressureAI);
  const target = component(harness, harness.game.dragonId, ComponentType.Transform);
  const intent = component(harness, harness.source, ComponentType.RaiderPhysicalMotion);
  const humanoid = component(harness, harness.source, ComponentType.HumanoidProjection);
  for (let frame = 0; frame < 30 && ai.attackPhase === EnemyAttackPhase.WINDUP; frame += 1) {
    if (movingTarget) target.y += 0.012;
    stepAttack(harness, 1 / 60);
  }
  equal(ai.attackPhase, EnemyAttackPhase.ACTIVE, 'spear wind-up should enter its committed active phase');
  return { ai, target, intent, humanoid };
}

function advanceActiveUntilResolved(harness) {
  const ai = component(harness, harness.source, ComponentType.EnemyPressureAI);
  for (let frame = 0; frame < 20 && !ai.attackDamageApplied; frame += 1) stepAttack(harness, 1 / 60);
  assert(ai.attackDamageApplied, 'active spear should resolve inside its authored damage window');
}

function stepAttack(harness, dt) {
  raiderPhysicalMotionSystem({ game: harness.game, dt });
  humanoidProjectionSystem({ game: harness.game, dt });
  bodyContactRigSystem({ game: harness.game });
  enemyAttackSystem({ game: harness.game, dt });
}

function createHarness() {
  const map = createDemoMap();
  map.enemySpawns = [];
  map.unitPlacements = [];
  map.unitSpawners = [];
  const game = createInitialGameState(map);
  return { map, game };
}

function component(harness, entity, type) {
  return getComponent(harness.game.world, entity, type);
}
