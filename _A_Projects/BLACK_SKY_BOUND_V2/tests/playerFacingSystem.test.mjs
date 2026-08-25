import { assert, equal } from './assert.mjs';
import { AbilityId } from '../src/constants/abilityIds.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { getComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { WyvernActionId } from '../src/data/creatures/groundedWyvernMotionProfiles.js';
import { startProceduralAction } from '../src/systems/proceduralActionState.js';
import { PLAYER_FACING_PROFILE, playerFacingSystem } from '../src/systems/playerFacingSystem.js';
import { wyvernProjectionSystem } from '../src/systems/wyvernProjectionSystem.js';
import { createDemoMap } from '../src/world/map.js';

const acceleration = createHarness();
aimAt(acceleration, Math.PI / 2);
stepFacing(acceleration, 1 / 60);
const expectedFirstVelocity = PLAYER_FACING_PROFILE.bodyTurnAccelerationRadiansPerSecond2 / 60;
near(acceleration.motion.turnVelocity, expectedFirstVelocity, 0.0001, 'turn velocity should ramp through the authored acceleration');
near(acceleration.transform.rotation, expectedFirstVelocity / 60, 0.0001, 'body rotation should integrate the ramped velocity instead of jumping to a constant-speed step');
assert(acceleration.motion.headLookYaw > acceleration.motion.neckLookYaw, 'head should react ahead of the slower neck');
assert(acceleration.motion.headLookYaw <= PLAYER_FACING_PROFILE.headLeadMaxRadians, 'head lead should remain bounded');
assert(acceleration.motion.neckLookYaw <= PLAYER_FACING_PROFILE.neckLeadMaxRadians, 'neck lead should remain bounded');

let previousError = Math.abs(shortest(Math.PI / 2 - acceleration.transform.rotation));
for (let index = 0; index < 120; index += 1) {
  stepFacing(acceleration, 1 / 60);
  const error = Math.abs(shortest(Math.PI / 2 - acceleration.transform.rotation));
  assert(error <= previousError + 0.000001, 'acceleration-limited turn should brake without overshooting its aim');
  previousError = error;
}
near(shortest(acceleration.transform.rotation - Math.PI / 2), 0, 0.0001, 'turn should settle exactly on the requested facing');
near(acceleration.motion.turnVelocity, 0, 0.0001, 'settled turn should clear residual angular velocity');

const reversal = createHarness();
aimAt(reversal, Math.PI / 2);
for (let index = 0; index < 5; index += 1) stepFacing(reversal, 1 / 60);
const forwardVelocity = reversal.motion.turnVelocity;
aimAt(reversal, -Math.PI / 2);
stepFacing(reversal, 1 / 60);
assert(reversal.motion.turnVelocity > 0 && reversal.motion.turnVelocity < forwardVelocity, 'rapid reversal should brake existing rotation before accelerating the other way');

const seam = createHarness();
seam.transform.rotation = radians(170);
aimAt(seam, radians(-170));
stepFacing(seam, 1 / 60);
assert(seam.motion.turnVelocity > 0, 'turn should choose the positive twenty-degree shortest arc across the angle seam');
for (let index = 0; index < 90; index += 1) stepFacing(seam, 1 / 60);
near(shortest(seam.transform.rotation - radians(-170)), 0, 0.001, 'seam turn should settle at the wrapped target');

const fallback = createHarness();
fallback.transform.rotation = 0.72;
fallback.intent.aimActive = false;
fallback.motion.turnVelocity = 1.2;
stepFacing(fallback, 0.2);
equal(fallback.transform.rotation, 0.72, 'pointer-inactive state should preserve the last body facing');
equal(fallback.motion.turnVelocity, 0, 'pointer-inactive state should cancel angular drift');

const planted = createHarness();
wyvernProjectionSystem({ game: planted.game, dt: 1 / 60 });
const startX = planted.transform.x;
const startY = planted.transform.y;
const startColliderRadius = component(planted, ComponentType.Collider).radius;
aimAt(planted, Math.PI);
for (let index = 0; index < 12; index += 1) {
  stepFacing(planted, 1 / 60);
  wyvernProjectionSystem({ game: planted.game, dt: 1 / 60 });
}
equal(planted.transform.x, startX, 'idle pivot should not leak visual planting into gameplay X');
equal(planted.transform.y, startY, 'idle pivot should not leak visual planting into gameplay Y');
equal(component(planted, ComponentType.Collider).radius, startColliderRadius, 'idle pivot should not mutate gameplay collision');
assert(planted.motion.turningInPlace, 'low-speed aim rotation should publish an explicit in-place pivot state');
const pose = component(planted, ComponentType.ProceduralPose);
const contacts = Object.values(pose.contactAnchors);
assert(contacts.some((contact) => contact.phase === 'turn_replant'), 'turning pose should lift one diagonal contact pair');
assert(contacts.some((contact) => contact.phase === 'turn_plant'), 'turning pose should retain a planted diagonal support pair');
assert(pose.turnState?.effort > 0, 'renderer-neutral pose should expose turn effort');
const pivotLifts = [
  pose.wingForelimbs.left.wrist.height,
  pose.wingForelimbs.right.wrist.height,
  pose.hindLegs.left.ankle.height,
  pose.hindLegs.right.ankle.height
];
assert(Math.max(...pivotLifts) > 0, 'turning pose should visibly lift the repositioning diagonal');
assert(Math.max(...pivotLifts) <= 0.035001, 'turning pose should retain the authored 0.035 metre visual lift bound');

const axial = component(planted, ComponentType.WyvernProjection).axialTurn;
assert(Math.abs(axial.neckLag) < Math.abs(axial.chestLag), 'neck should follow the turn before the chest');
assert(Math.abs(axial.chestLag) < Math.abs(axial.hipLag), 'chest should follow before the hips');
assert(Math.abs(axial.hipLag) < Math.abs(axial.tailLag), 'hips should follow before the tail');
assert(axial.malformedFrameCount === 0, 'turn chain should remain finite');
const rig = component(planted, ComponentType.CreatureRigPose);
assert(Object.values(rig.axialFrames).every((frame) => finiteFrame(frame)), 'shoulder and hip consumers should receive finite tangent frames');

for (let index = 0; index < 240; index += 1) {
  stepFacing(planted, 1 / 60);
  wyvernProjectionSystem({ game: planted.game, dt: 1 / 60 });
}
const settledAxial = component(planted, ComponentType.WyvernProjection).axialTurn;
assert(Math.abs(settledAxial.chestLag) < 0.01 && Math.abs(settledAxial.hipLag) < 0.01, 'axial body should settle behind the completed turn');
assert(Math.abs(settledAxial.tailLag) < 0.12, 'tail should finish its bounded follow-through while retaining restrained idle sway');

const actionLock = createHarness();
wyvernProjectionSystem({ game: actionLock.game, dt: 1 / 60 });
aimAt(actionLock, Math.PI / 2);
for (let index = 0; index < 6; index += 1) stepFacing(actionLock, 1 / 60);
const committedFacing = -Math.PI / 2;
assert(startProceduralAction(actionLock.game.world, actionLock.game.dragonId, WyvernActionId.BITE_ATTACK, {
  sourceAbilityId: AbilityId.BITE_CLAW,
  aimX: actionLock.transform.x + Math.cos(committedFacing) * 4,
  aimY: actionLock.transform.y + Math.sin(committedFacing) * 4
}), 'action fixture should start a committed bite');
stepFacing(actionLock, 1 / 60);
wyvernProjectionSystem({ game: actionLock.game, dt: 1 / 60 });
near(actionLock.transform.rotation, committedFacing, 0.0001, 'committed action should retain exact gameplay facing');
near(actionLock.motion.turnVelocity, 0, 0.0001, 'committed action should suppress pivot velocity');
near(actionLock.motion.headLookYaw, 0, 0.0001, 'committed action should immediately recenter the head socket');
near(actionLock.motion.neckLookYaw, 0, 0.0001, 'committed action should immediately recenter the neck');
const actionProjection = component(actionLock, ComponentType.WyvernProjection);
assert(actionProjection.sockets.mouth.forward.y < -0.999, 'committed mouth socket should align to the attack direction before contact');
assert(Math.abs(actionProjection.axialTurn.hipLag) > 0.01, 'rear body should visually catch up after an action-facing commitment');
assert(Math.abs(actionProjection.axialTurn.hipLag) <= radians(52.1), 'action-facing catch-up should not fold the hips beyond the readable anatomical limit');
assert(Object.values(component(actionLock, ComponentType.ProceduralPose).contactAnchors).every((contact) => !contact.phase.startsWith('turn_')), 'committed actions should suppress pivot contacts in favour of authored action braces');

function createHarness() {
  const map = createDemoMap();
  map.enemySpawns = [];
  map.unitPlacements = [];
  map.unitSpawners = [];
  const game = createInitialGameState(map);
  const dragonId = game.dragonId;
  const result = { map, game, dragonId };
  result.transform = component(result, ComponentType.Transform);
  result.intent = component(result, ComponentType.PlayerIntent);
  result.motion = component(result, ComponentType.MotionState);
  result.transform.x = 10;
  result.transform.y = 10;
  result.transform.rotation = 0;
  return result;
}

function aimAt(harness, angle) {
  harness.intent.aimActive = true;
  harness.intent.aimX = harness.transform.x + Math.cos(angle) * 10;
  harness.intent.aimY = harness.transform.y + Math.sin(angle) * 10;
}

function stepFacing(harness, dt) { playerFacingSystem({ game: harness.game, dt }); }
function component(harness, type) { return getComponent(harness.game.world, harness.dragonId ?? harness.game.dragonId, type); }
function finiteFrame(frame) { return Number.isFinite(frame.rotation) && Number.isFinite(frame.forward.x) && Number.isFinite(frame.right.y); }
function shortest(value) { return Math.atan2(Math.sin(value), Math.cos(value)); }
function radians(value) { return value * Math.PI / 180; }
function near(actual, expected, tolerance, message) { assert(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, received ${actual}`); }
