import { assert, equal } from './assert.mjs';
import { AbilityId } from '../src/constants/abilityIds.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { EntityKind } from '../src/constants/entityKinds.js';
import { Faction } from '../src/constants/factions.js';
import { ABILITIES } from '../src/data/abilities.js';
import { AbilityUnlockEventId } from '../src/data/abilityUnlockEvents.js';
import { WyvernActionId } from '../src/data/creatures/groundedWyvernMotionProfiles.js';
import { getComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { applyAbilityUnlockEvent, canUseAbility } from '../src/game/playerAbilities.js';
import { spawnActor } from '../src/game/spawn.js';
import { ACTION_SYSTEM_NAMES } from '../src/game/systemOrder.js';
import { createCamera, worldToScreen } from '../src/render/camera.js';
import {
  chargeCounterSystem,
  resolveChargeCounterDirection
} from '../src/systems/chargeCounterSystem.js';
import { dodgeSystem } from '../src/systems/dodgeSystem.js';
import { inputSystem } from '../src/systems/inputSystem.js';
import { canEntityOccupy } from '../src/systems/movementSystem.js';
import { proceduralActionSystem, startProceduralAction } from '../src/systems/proceduralActionState.js';
import { staminaSystem } from '../src/systems/staminaSystem.js';
import { wyvernActionImpulseSystem } from '../src/systems/wyvernActionImpulseSystem.js';
import { wyvernAttackContactSystem } from '../src/systems/wyvernAttackContactSystem.js';
import { wyvernProjectionSystem } from '../src/systems/wyvernProjectionSystem.js';
import { createDemoMap } from '../src/world/map.js';
import { TerrainType } from '../src/world/terrain.js';

const ability = ABILITIES[AbilityId.CHARGE_COUNTER];
equal(ability.inputAction, 'dodge_followup', 'charge should remain a distinct follow-up input action');
equal(ability.staminaCost, 36, 'charge should own its additional stamina cost');
equal(ability.bufferWindowMs, 320, 'charge should expose its forgiving buffer window');
equal(ability.recoveryMs, 480, 'charge should retain a meaningful miss recovery');
equal(ability.unlockEventId, AbilityUnlockEventId.INSTINCT_CHARGE_AWAKENED, 'charge should point at the separate instinct unlock event');

const harness = createHarness();
const player = harness.game.dragonId;
const progression = component(harness, player, ComponentType.AbilityProgression);
assert(progression.unlockedAbilities.includes(AbilityId.DODGE), 'progression should own default dodge availability');
assert(progression.unlockedAbilities.includes(AbilityId.CHARGE_COUNTER), 'development progression should temporarily grant charge');

press(harness, ' ', ['d']);
let intent = component(harness, player, ComponentType.PlayerIntent);
assert(intent.dodge && !intent.dodgeFollowup, 'first Space press should request dodge without waiting for another press');
staminaSystem({ game: harness.game, dt: 0 });
const dodge = component(harness, player, ComponentType.DodgeState);
const charge = component(harness, player, ComponentType.ChargeCounterState);
const stamina = component(harness, player, ComponentType.Stamina);
assert(dodge.active, 'first Space press should begin dodge in the same update');
equal(stamina.current, 36, 'immediate dodge should spend 24 stamina from the bounded 60-point pool');
equal(Number(charge.followupWindowRemaining.toFixed(2)), 0.32, 'dodge start should open the charge follow-up buffer');

press(harness, ' ', ['d']);
intent = component(harness, player, ComponentType.PlayerIntent);
assert(!intent.dodge && intent.dodgeFollowup, 'second Space during dodge should become the distinct follow-up intent');
staminaSystem({ game: harness.game, dt: 0 });
assert(charge.queued && !charge.active, 'follow-up should queue while the immediate dodge is still active');
equal(stamina.current, 0, 'accepted follow-up should commit the rest of a fresh escape pool immediately');

const dodgeStartX = component(harness, player, ComponentType.Transform).x;
dodgeSystem({ game: harness.game, map: harness.map, dt: dodge.duration });
assert(component(harness, player, ComponentType.Transform).x > dodgeStartX + 1, 'dodge displacement should finish before the charge begins');
chargeCounterSystem({ game: harness.game, dt: 0 });
const action = component(harness, player, ComponentType.ActionState);
assert(charge.active && !charge.queued, 'queued follow-up should begin as soon as dodge displacement ends');
equal(action.actionId, WyvernActionId.CHARGE_COUNTER, 'charge should run through the canonical procedural action state');
equal(action.phaseLabel, 'plant', 'charge should begin with the compression/plant phase');

const plantX = component(harness, player, ComponentType.Transform).x;
proceduralActionSystem({ game: harness.game, dt: 0.08 });
wyvernActionImpulseSystem({ game: harness.game, map: harness.map, dt: 0.08 });
equal(component(harness, player, ComponentType.Transform).x, plantX, 'the plant phase should not slide forward before launch');

const husk = spawnActor(harness.game.world, EntityKind.HUSK, plantX + 0.95, 10, Faction.HUSKS);
const raider = spawnActor(harness.game.world, EntityKind.RAIDER, plantX + 1.18, 10.28, Faction.RAIDERS);
const werewolf = spawnActor(harness.game.world, EntityKind.WEREWOLF, plantX + 1.18, 9.72, Faction.WOLVES);
const huskHealth = component(harness, husk, ComponentType.Health);
const raiderHealth = component(harness, raider, ComponentType.Health);
const werewolfHealth = component(harness, werewolf, ComponentType.Health);
for (let index = 0; index < 12; index += 1) advanceCharge(harness, 0.05);
assert(component(harness, player, ComponentType.Transform).x > plantX + 1.8, 'charge should accelerate into a committed forward drive');
assert(huskHealth.hp < huskHealth.maxHp && raiderHealth.hp < raiderHealth.maxHp, 'broad body contact should hit clustered light enemies');
assert(werewolfHealth.hp < werewolfHealth.maxHp && werewolfHealth.alive, 'charge should punish a werewolf without flattening the healthy predator');
assert(component(harness, husk, ComponentType.ImpactResponse).staggerTimer > 0, 'charge should apply meaningful stagger through the existing impact path');
assert(
  component(harness, werewolf, ComponentType.ImpactResponse).lastImpact.impulse
    < component(harness, husk, ComponentType.ImpactResponse).lastImpact.impulse,
  'werewolf mass/resistance should preserve more presence than a loose husk under the same charge'
);

for (let index = 0; index < 12; index += 1) {
  chargeCounterSystem({ game: harness.game, dt: 0.05 });
  proceduralActionSystem({ game: harness.game, dt: 0.05 });
}
chargeCounterSystem({ game: harness.game, dt: 0 });
assert(!charge.active && charge.state === 'idle', 'charge should leave a bounded recovery and return to idle');
assert(charge.lastReceipt?.hitCount >= 3, 'charge receipt should retain its resolved clustered contacts');

const redirected = resolveChargeCounterDirection(
  { moveX: -1, moveY: 0, aimX: 0, aimY: 10 },
  { x: 10, y: 10, rotation: 0 },
  { directionX: 1, directionY: 0 }
);
const redirectAngle = Math.acos(Math.max(-1, Math.min(1, redirected.x)));
assert(redirectAngle <= 40 * Math.PI / 180 + 0.0001, 'charge redirect should clamp a requested reversal to forty degrees');
assert(redirected.x > 0, 'charge redirect should never turn a forward dodge into a backwards teleport');

const lowStamina = createHarness();
component(lowStamina, lowStamina.game.dragonId, ComponentType.Stamina).current = 55;
press(lowStamina, ' ', ['d']);
staminaSystem({ game: lowStamina.game, dt: 0 });
press(lowStamina, ' ', ['d']);
staminaSystem({ game: lowStamina.game, dt: 0 });
equal(component(lowStamina, lowStamina.game.dragonId, ComponentType.ChargeCounterState).lastDeniedReason, 'insufficient_stamina', 'second press should fail loudly before accepting an unaffordable charge');
equal(component(lowStamina, lowStamina.game.dragonId, ComponentType.Stamina).current, 31, 'denied charge should not create negative stamina or spend its cost');

const unlock = createHarness();
const unlockProgression = component(unlock, unlock.game.dragonId, ComponentType.AbilityProgression);
unlockProgression.unlockedAbilities = unlockProgression.unlockedAbilities.filter((id) => id !== AbilityId.CHARGE_COUNTER);
assert(!canUseAbility(unlock.game.world, unlock.game.dragonId, AbilityId.CHARGE_COUNTER), 'input authority should read locked progression state');
const unlockReceipt = applyAbilityUnlockEvent(unlock.game.world, unlock.game.dragonId, AbilityUnlockEventId.INSTINCT_CHARGE_AWAKENED);
assert(unlockReceipt.ok && canUseAbility(unlock.game.world, unlock.game.dragonId, AbilityId.CHARGE_COUNTER), 'scenario unlock event should grant charge through progression');
equal(applyAbilityUnlockEvent(unlock.game.world, unlock.game.dragonId, AbilityUnlockEventId.INSTINCT_CHARGE_AWAKENED).reason, 'unlock_event_already_consumed', 'one-shot unlock event should not grant repeatedly');

const wall = createHarness();
const wallPlayer = wall.game.dragonId;
const wallTransform = component(wall, wallPlayer, ComponentType.Transform);
wallTransform.x = 1.34;
wallTransform.y = 10;
wallTransform.rotation = Math.PI;
assert(startProceduralAction(wall.game.world, wallPlayer, WyvernActionId.CHARGE_COUNTER, {
  force: true,
  sourceAbilityId: AbilityId.CHARGE_COUNTER,
  aimX: 0,
  aimY: 10
}), 'wall collision fixture should start the canonical charge action');
proceduralActionSystem({ game: wall.game, dt: 0.3 });
wyvernActionImpulseSystem({ game: wall.game, map: wall.map, dt: 0.3 });
const wallAction = component(wall, wallPlayer, ComponentType.ActionState);
assert(wallAction.movementBlocked, 'charge should record collision when its committed drive meets a wall');
assert(wallTransform.x >= 1.34 && canEntityOccupy(wall.game.world, wallPlayer, wallTransform.x, wallTransform.y, wall.map), 'blocked charge should remain in a valid collision-safe position');

assert(ACTION_SYSTEM_NAMES.indexOf('dodgeSystem') < ACTION_SYSTEM_NAMES.indexOf('chargeCounterSystem'), 'charge transition should observe post-dodge state');
assert(ACTION_SYSTEM_NAMES.indexOf('chargeCounterSystem') < ACTION_SYSTEM_NAMES.indexOf('proceduralActionSystem'), 'queued charge should start before procedural action advancement');

function advanceCharge(harness, dt) {
  chargeCounterSystem({ game: harness.game, dt });
  proceduralActionSystem({ game: harness.game, dt });
  wyvernActionImpulseSystem({ game: harness.game, map: harness.map, dt });
  wyvernProjectionSystem({ game: harness.game, dt });
  wyvernAttackContactSystem({ game: harness.game });
}

function createHarness() {
  const map = createDemoMap();
  map.enemySpawns = [];
  map.unitPlacements = [];
  map.unitSpawners = [];
  map.sceneObjects = [];
  for (let y = 1; y < map.height - 1; y += 1) {
    for (let x = 1; x < map.width - 1; x += 1) map.tiles[y][x] = TerrainType.GRASS;
  }
  const game = createInitialGameState(map);
  const transform = getComponent(game.world, game.dragonId, ComponentType.Transform);
  transform.x = 10;
  transform.y = 10;
  transform.rotation = 0;
  const projection = getComponent(game.world, game.dragonId, ComponentType.WyvernProjection);
  projection.lastX = 10;
  projection.lastY = 10;
  const camera = createCamera({ clientWidth: 1280, clientHeight: 720 }, map);
  return { map, game, camera, state: { map, game, camera } };
}

function press(harness, key, down = []) {
  inputSystem({ state: harness.state, input: fakeInput(harness, key, down) });
}

function fakeInput(harness, pressedKey, downKeys) {
  const transform = component(harness, harness.game.dragonId, ComponentType.Transform);
  const pointer = worldToScreen(harness.camera, (transform.x + 5) * 24, transform.y * 24);
  const down = new Set(downKeys);
  return {
    pointer,
    isDown(key) { return down.has(key); },
    wasPressed(key) { return key === pressedKey; },
    consumePointerClick() { return false; }
  };
}

function component(harness, entity, type) {
  return getComponent(harness.game.world, entity, type);
}
