import { assert, equal } from './assert.mjs';
import { ComponentType } from '../src/constants/componentTypes.js';
import { EventType } from '../src/constants/eventTypes.js';
import { WyvernActionId } from '../src/data/creatures/groundedWyvernMotionProfiles.js';
import { getComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { dodgeSystem } from '../src/systems/dodgeSystem.js';
import { queuePounceCounter } from '../src/systems/chargeCounterSystem.js';
import { queueDodgeChain, requestPlayerDodge } from '../src/systems/dodgeState.js';
import { resolvePlayerDodgeGradient, resolveSprintResumeThreshold } from '../src/systems/dodgeStaminaGradient.js';
import { startProceduralAction } from '../src/systems/proceduralActionState.js';
import { staminaSystem } from '../src/systems/staminaSystem.js';
import { wyvernProjectionSystem } from '../src/systems/wyvernProjectionSystem.js';
import { createDemoMap } from '../src/world/map.js';
import { TerrainType } from '../src/world/terrain.js';

const curveHarness = createHarness();
const curveDodge = component(curveHarness, ComponentType.DodgeState);
const matching60 = resolvePlayerDodgeGradient({ current: 12, max: 60 }, curveDodge);
const matching100 = resolvePlayerDodgeGradient({ current: 20, max: 100 }, curveDodge);
near(matching60.effectiveness, matching100.effectiveness, 'matching stamina percentages should produce matching effectiveness');
near(matching60.distanceMeters, matching100.distanceMeters, 'matching stamina percentages should produce matching distance');
near(matching60.apexHeightMeters, matching100.apexHeightMeters, 'matching stamina percentages should produce matching apex');
near(matching60.cooldownSeconds, matching100.cooldownSeconds, 'matching stamina percentages should produce matching cooldown');

const empty = resolvePlayerDodgeGradient({ current: 0, max: 60 }, curveDodge);
const quarter = resolvePlayerDodgeGradient({ current: 6, max: 60 }, curveDodge);
const halfThreshold = resolvePlayerDodgeGradient({ current: 12, max: 60 }, curveDodge);
const full = resolvePlayerDodgeGradient({ current: 24, max: 60 }, curveDodge);
equal(empty.effectiveness, 0.5, 'empty stamina should retain the 50% emergency floor');
equal(empty.distanceMeters, 0.28, 'empty stamina should retain a 0.28m emergency scramble');
equal(empty.apexHeightMeters, 0.06, 'empty stamina should retain a 0.06m visual apex');
equal(empty.cooldownSeconds, 0.75, 'empty stamina should use the longest gradient cooldown');
assert(empty.landingCompressionMeters > full.landingCompressionMeters, 'low energy should land with more visible compression');
assert(empty.effectiveness < quarter.effectiveness && quarter.effectiveness < halfThreshold.effectiveness && halfThreshold.effectiveness < full.effectiveness, 'gradient outputs should rise smoothly and monotonically');
equal(full.effectiveness, 1, '40% stamina should reach full effectiveness');
equal(full.distanceMeters, 0.56, '40% stamina should reach full distance');
for (const value of Object.values(empty)) {
  if (typeof value === 'number') assert(Number.isFinite(value), 'gradient outputs should remain finite');
}
equal(resolveSprintResumeThreshold({ max: 60, sprintResumeEnergy01: 0.3 }), 18, 'production max should preserve the former 18-point sprint resume behaviour');
equal(resolveSprintResumeThreshold({ max: 100, sprintResumeEnergy01: 0.3 }), 30, 'sprint resume should scale with upgraded maximum stamina');

const normalRegen = createHarness();
const upgradedRegen = createHarness();
component(normalRegen, ComponentType.Stamina).current = 0;
component(upgradedRegen, ComponentType.Stamina).current = 0;
component(upgradedRegen, ComponentType.Stamina).regenPerSecond = 22;
staminaSystem({ game: normalRegen.game, dt: 1 });
staminaSystem({ game: upgradedRegen.game, dt: 1 });
const normalRecovered = resolvePlayerDodgeGradient(component(normalRegen, ComponentType.Stamina), component(normalRegen, ComponentType.DodgeState));
const upgradedRecovered = resolvePlayerDodgeGradient(component(upgradedRegen, ComponentType.Stamina), component(upgradedRegen, ComponentType.DodgeState));
assert(upgradedRecovered.effectiveness > normalRecovered.effectiveness, 'a regeneration upgrade should move the player up the same effectiveness curve faster');

const emergencyLevels = [23, 12, 0];
for (const level of emergencyLevels) {
  const harness = createHarness();
  const stamina = component(harness, ComponentType.Stamina);
  const dodge = component(harness, ComponentType.DodgeState);
  stamina.current = level;
  const intent = component(harness, ComponentType.PlayerIntent);
  intent.dodge = true;
  intent.moveX = 1;
  staminaSystem({ game: harness.game, dt: 0 });
  assert(dodge.active, `an emergency dodge should start at ${level} stamina`);
  equal(dodge.mode, 'emergency', `an underfunded dodge should be categorical emergency at ${level}`);
  equal(dodge.staminaSpent, level, `emergency dodge should consume only the ${level}-point remainder`);
  equal(stamina.current, 0, 'emergency dodge should finish its partial spend at zero');
  assert(!dodge.followupsEnabled, 'emergency dodge should not open a pounce or further dodge branch');
  assert(!queuePounceCounter(harness.game.world, harness.game.dragonId, { x: 1, y: 0 }), 'contextual LMB should be denied after an emergency scramble');
  equal(component(harness, ComponentType.PounceCounterState).lastDeniedReason, 'emergency_dodge_no_followup', 'emergency LMB denial should be explicit');
  const startX = component(harness, ComponentType.Transform).x;
  dodgeSystem({ game: harness.game, map: harness.map, dt: dodge.duration });
  const applied = component(harness, ComponentType.Transform).x - startX;
  near(applied, dodge.distance, `emergency travel should apply its captured gradient distance at ${level}`, 0.001);
  wyvernProjectionSystem({ game: harness.game, dt: 1 / 60 });
  assert(Number.isFinite(component(harness, ComponentType.ProceduralPose).elevationMeters), 'emergency pose elevation should stay finite and visual-only');
}

const interrupted = createHarness();
const interruptedPlayer = interrupted.game.dragonId;
assert(startProceduralAction(interrupted.game.world, interruptedPlayer, WyvernActionId.BITE_ATTACK, { aimX: 12, aimY: 10 }), 'bite interruption fixture should start');
const interruptedAction = component(interrupted, ComponentType.ActionState);
interruptedAction.phase = 0.42;
interruptedAction.phaseLabel = 'contact';
interruptedAction.resolvedContacts = ['already_hit'];
interruptedAction.emittedEvents = ['already_emitted'];
interruptedAction.movementImpulseApplied = 0.35;
component(interrupted, ComponentType.PlayerIntent).dodge = true;
component(interrupted, ComponentType.PlayerIntent).melee = true;
staminaSystem({ game: interrupted.game, dt: 0 });
assert(!interruptedAction.active && interruptedAction.recovering, 'Space should remove gameplay authority from an interruptible attack immediately');
equal(interruptedAction.recoveryKind, 'dodge_interruption', 'interrupted pose should retain an 80ms visual-only blend');
equal(interruptedAction.recoveryDuration, 0.08, 'interrupted pose blend should use the profile-owned duration');
equal(interruptedAction.lastInterruptionReceipt.actionId, WyvernActionId.BITE_ATTACK, 'interruption should retain the cancelled action identity');
equal(interruptedAction.lastInterruptionReceipt.resolvedContacts[0], 'already_hit', 'already-resolved contact provenance should be preserved');
equal(interruptedAction.lastInterruptionReceipt.emittedEvents[0], 'already_emitted', 'already-emitted smoke/effect provenance should be preserved');
equal(interruptedAction.movementDistanceLimit, 0.35, 'future lunge-style movement should close at already-applied travel');
assert(!component(interrupted, ComponentType.PlayerIntent).melee, 'same-frame Space should discard conflicting attack intent');

const committed = createHarness();
component(committed, ComponentType.PounceCounterState).queued = true;
const committedRequest = requestPlayerDodge(committed.game.world, committed.game.dragonId, { x: 1, y: 0 });
equal(committedRequest.receipt.reason, 'pounce_counter_committed', 'committed pounce should remain a hard dodge lock');

const buffered = createHarness();
const bufferedDodge = component(buffered, ComponentType.DodgeState);
const bufferedStamina = component(buffered, ComponentType.Stamina);
bufferedDodge.cooldownRemaining = 0.12;
assert(startProceduralAction(buffered.game.world, buffered.game.dragonId, WyvernActionId.SMOKE_SPIT, { aimX: 12, aimY: 10 }), 'buffer interruption fixture should start');
const bufferedIntent = component(buffered, ComponentType.PlayerIntent);
bufferedIntent.dodge = true;
bufferedIntent.moveY = -1;
staminaSystem({ game: buffered.game, dt: 0 });
assert(bufferedDodge.buffered && !bufferedDodge.active, 'exactly 120ms of cooldown should capture a buffered dodge');
equal(bufferedStamina.current, 36, 'buffer acceptance should reserve stamina immediately');
equal(bufferedDodge.bufferedDirectionY, -1, 'buffer should lock press-time direction');
bufferedIntent.moveY = 1;
staminaSystem({ game: buffered.game, dt: 0.12 });
assert(bufferedDodge.active && !bufferedDodge.buffered, 'captured dodge should launch when cooldown reaches zero');
equal(bufferedDodge.directionY, -1, 'buffer launch should ignore later direction changes');
assert(buffered.game.world.events.some((event) => event.type === EventType.PLAYER_ACTION_ACCEPTED && event.payload.buffered === true), 'accepted event should fire at buffered displacement launch');

const aboveBuffer = createHarness();
const aboveDodge = component(aboveBuffer, ComponentType.DodgeState);
aboveDodge.cooldownRemaining = 0.1202;
assert(startProceduralAction(aboveBuffer.game.world, aboveBuffer.game.dragonId, WyvernActionId.LEFT_CLAW_SWIPE, { aimX: 12, aimY: 10 }), 'above-buffer fixture should start an attack');
const aboveRequest = requestPlayerDodge(aboveBuffer.game.world, aboveBuffer.game.dragonId, { x: 1, y: 0 });
equal(aboveRequest.receipt.reason, 'dodge_cooldown', 'cooldowns above 120ms should be denied explicitly');
assert(component(aboveBuffer, ComponentType.ActionState).active, 'denied cooldown request must not interrupt the attack');

const cancelled = createHarness();
const cancelledDodge = component(cancelled, ComponentType.DodgeState);
const cancelledStamina = component(cancelled, ComponentType.Stamina);
cancelledDodge.cooldownRemaining = 0.1;
requestPlayerDodge(cancelled.game.world, cancelled.game.dragonId, { x: 1, y: 0 });
equal(cancelledStamina.current, 36, 'hard-lock fixture should begin with a reservation');
component(cancelled, ComponentType.ImpactResponse).staggerTimer = 0.2;
staminaSystem({ game: cancelled.game, dt: 0.01 });
assert(!cancelledDodge.buffered, 'stagger should cancel a pending cooldown buffer');
equal(cancelledStamina.current, 60, 'hard-lock cancellation should refund the exact reservation');
equal(cancelledDodge.lastDeniedReason, 'staggered', 'hard-lock cancellation should retain a denial reason');

const chain = createHarness();
const chainStamina = component(chain, ComponentType.Stamina);
const chainDodge = component(chain, ComponentType.DodgeState);
chainStamina.current = 30;
requestPlayerDodge(chain.game.world, chain.game.dragonId, { x: 1, y: 0 });
assert(chainDodge.active && chainDodge.followupsEnabled, 'funded first dodge should retain one branch even when it leaves little stamina');
assert(queueDodgeChain(chain.game.world, chain.game.dragonId, { x: 0, y: 1 }), 'funded first dodge should reserve an underfunded final scramble');
equal(chainDodge.queuedMode, 'emergency', 'second branch should capture emergency mode at press time');
equal(chainDodge.reservedChainCost, 6, 'second branch should consume only the press-time remainder');
dodgeSystem({ game: chain.game, map: chain.map, dt: chainDodge.duration });
dodgeSystem({ game: chain.game, map: chain.map, dt: 0.06 });
assert(chainDodge.active && chainDodge.chainIndex === 2, '60ms landing handoff should launch the second and final dodge');
equal(chainDodge.mode, 'emergency', 'launched final scramble should retain captured mode');
assert(!chainDodge.followupsEnabled, 'final emergency scramble should close all follow-up branches');
assert(chain.game.world.events.some((event) => event.type === EventType.PLAYER_ACTION_ACCEPTED && event.payload.chained === true), 'chain acceptance should fire only when second displacement launches');

console.log('reactiveDodgeGradient.test.mjs passed');

function createHarness() {
  const map = createDemoMap();
  map.enemySpawns = [];
  map.unitPlacements = [];
  map.unitSpawners = [];
  map.sceneObjects = [];
  for (let y = 1; y < map.height - 1; y += 1) {
    for (let x = 1; x < map.width - 1; x += 1) map.tiles[y][x] = TerrainType.GRASS;
  }
  return { map, game: createInitialGameState(map) };
}

function component(harness, type) { return getComponent(harness.game.world, harness.game.dragonId, type); }
function near(actual, expected, message, tolerance = 0.000001) { assert(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, got ${actual}`); }
