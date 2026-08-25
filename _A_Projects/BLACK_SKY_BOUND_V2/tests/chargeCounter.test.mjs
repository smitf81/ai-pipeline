import { assert, equal } from './assert.mjs';
import { AbilityId } from '../src/constants/abilityIds.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { EntityKind } from '../src/constants/entityKinds.js';
import { Faction } from '../src/constants/factions.js';
import { ABILITIES } from '../src/data/abilities.js';
import { InputActionId } from '../src/data/inputActions.js';
import { AbilityUnlockEventId } from '../src/data/abilityUnlockEvents.js';
import { getWyvernActionProfile, WyvernActionId } from '../src/data/creatures/groundedWyvernMotionProfiles.js';
import { getComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { applyAbilityUnlockEvent, canUseAbility } from '../src/game/playerAbilities.js';
import { spawnActor } from '../src/game/spawn.js';
import { ACTION_SYSTEM_NAMES } from '../src/game/systemOrder.js';
import { createCamera, worldToScreen } from '../src/render/camera.js';
import { pounceCounterSystem, resolvePounceCounterDirection } from '../src/systems/chargeCounterSystem.js';
import { dodgeSystem } from '../src/systems/dodgeSystem.js';
import { resolvePlayerDodgeDirection } from '../src/systems/dodgeState.js';
import { inputSystem } from '../src/systems/inputSystem.js';
import { canEntityOccupy } from '../src/systems/movementSystem.js';
import { proceduralActionSystem, startProceduralAction } from '../src/systems/proceduralActionState.js';
import { staminaSystem } from '../src/systems/staminaSystem.js';
import { wyvernActionImpulseSystem } from '../src/systems/wyvernActionImpulseSystem.js';
import { resolveWyvernImpact } from '../src/systems/wyvernAttackContactSystem.js';
import { wyvernProjectionSystem } from '../src/systems/wyvernProjectionSystem.js';
import { createDemoMap } from '../src/world/map.js';
import { TerrainType } from '../src/world/terrain.js';

const ability = ABILITIES[AbilityId.POUNCE_COUNTER];
equal(AbilityId.POUNCE_COUNTER, AbilityId.CHARGE_COUNTER, 'the persisted charge_counter value should remain a compatibility alias');
equal(ability.inputAction, InputActionId.POUNCE_COUNTER, 'LMB pounce should be the canonical follow-up input');
equal(ability.displayName, 'POUNCE COUNTER', 'live ability language should name the pounce');
equal(ability.staminaCost, 36, 'pounce should reserve its full stamina cost when accepted');
equal(ability.bufferWindowMs, 450, 'pounce should expose the expanded counter window');
equal(ability.recoveryMs, 420, 'a missed pounce should retain its authored recovery');
equal(ability.action.movementDistanceMeters, 1.75, 'pounce travel should be authored in metres');
equal(ability.action.movementDistance, 3.5, 'shared 0.5m world scale should derive 3.5 gameplay units');
equal(ability.damage, 12, 'directional work should not inflate pounce damage');
equal(ability.unlockEventId, AbilityUnlockEventId.INSTINCT_CHARGE_AWAKENED, 'persisted progression receipt should remain compatible');

const directional = resolvePlayerDodgeDirection({ moveX: 0, moveY: -1, aimActive: true, aimX: 20, aimY: 10 }, { x: 10, y: 10, rotation: 0 });
equal(directional.y, -1, 'held WASD should override cursor retreat for a normal dodge');
const retreat = resolvePlayerDodgeDirection({ moveX: 0, moveY: 0, aimActive: true, aimX: 20, aimY: 10 }, { x: 10, y: 10, rotation: 0 });
equal(retreat.x, -1, 'neutral dodge should retreat directly away from the cursor');
const noPointer = resolvePlayerDodgeDirection({ moveX: 0, moveY: 0, aimActive: false }, { x: 10, y: 10, rotation: Math.PI / 2 });
assert(Math.abs(noPointer.y + 1) < 0.0001, 'pointer-inactive dodge should fall back behind the last body facing');

const pounceHarness = createHarness();
const player = pounceHarness.game.dragonId;
pressKey(pounceHarness, ' ', ['d']);
let intent = component(pounceHarness, player, ComponentType.PlayerIntent);
assert(intent.dodge && !intent.dodgeChain && !intent.pounceCounter, 'first Space should remain an immediate normal dodge');
staminaSystem({ game: pounceHarness.game, dt: 0 });
const dodge = component(pounceHarness, player, ComponentType.DodgeState);
const pounce = component(pounceHarness, player, ComponentType.PounceCounterState);
const stamina = component(pounceHarness, player, ComponentType.Stamina);
assert(dodge.active, 'first Space should start the dodge in the same update');
equal(stamina.current, 36, 'normal dodge should retain its 24-point cost');
equal(Number(pounce.followupWindowRemaining.toFixed(2)), 0.45, 'dodge start should open the 450ms pounce window');

pressPointer(pounceHarness, 0);
intent = component(pounceHarness, player, ComponentType.PlayerIntent);
assert(intent.pounceCounter && !intent.melee, 'LMB inside the dodge window should belong to pounce, not ordinary melee');
const transform = component(pounceHarness, player, ComponentType.Transform);
const exactDirection = resolvePounceCounterDirection(intent, transform);
staminaSystem({ game: pounceHarness.game, dt: 0 });
assert(pounce.queued && !pounce.active, 'accepted pounce should queue until dodge displacement ends');
equal(stamina.current, 0, 'accepted pounce should reserve 36 stamina immediately');
assert(Math.abs(pounce.queuedDirectionX - exactDirection.x) < 0.0001 && Math.abs(pounce.queuedDirectionY - exactDirection.y) < 0.0001, 'pounce should capture the exact cursor direction at press time');

pressKey(pounceHarness, ' ');
equal(dodge.lastDeniedReason, 'followup_committed', 'a later conflicting Space should fail with an explicit first-branch-wins receipt');
dodgeSystem({ game: pounceHarness.game, map: pounceHarness.map, dt: dodge.duration });
pounceCounterSystem({ game: pounceHarness.game, dt: 0 });
const action = component(pounceHarness, player, ComponentType.ActionState);
assert(pounce.active && !pounce.queued, 'queued pounce should begin after dodge displacement');
equal(action.actionId, WyvernActionId.POUNCE_COUNTER, 'pounce should run through canonical procedural action state');
equal(action.phaseLabel, 'coil', 'pounce should begin with a readable coil');
equal(action.movementDistanceMeters, 1.75, 'action state should retain metre-authored travel diagnostics');
equal(action.movementDistanceTiles, 3.5, 'action state should retain derived gameplay travel');

const plantX = transform.x;
proceduralActionSystem({ game: pounceHarness.game, dt: 0.08 });
wyvernActionImpulseSystem({ game: pounceHarness.game, map: pounceHarness.map, dt: 0.08 });
equal(transform.x, plantX, 'the pounce coil should not slide before takeoff');
action.phase = 0.44;
action.elapsed = action.duration * action.phase;
wyvernProjectionSystem({ game: pounceHarness.game, dt: 1 / 60 });
const airbornePose = component(pounceHarness, player, ComponentType.ProceduralPose);
assert(airbornePose.elevationMeters > 0.25 && airbornePose.elevationMeters <= 0.28, 'mid-flight pose should expose the exaggerated 0.28m visual apex');
assert(Number.isFinite(component(pounceHarness, player, ComponentType.CreatureRigPose).head.center.height), 'dynamic elevation should remain finite through the renderer-neutral rig');
action.phase = 0.74;
action.elapsed = action.duration * action.phase;
wyvernProjectionSystem({ game: pounceHarness.game, dt: 1 / 60 });
assert(component(pounceHarness, player, ComponentType.ProceduralPose).elevationMeters < 0, 'impact phase should visibly compress into the landing');
equal(transform.x, plantX, 'visual elevation must not leak into planar gameplay transform ownership');

const dodgePoseHarness = createHarness();
const dodgePoseState = component(dodgePoseHarness, dodgePoseHarness.game.dragonId, ComponentType.DodgeState);
dodgePoseState.active = true;
dodgePoseState.phase = 0.5;
wyvernProjectionSystem({ game: dodgePoseHarness.game, dt: 1 / 60 });
assert(component(dodgePoseHarness, dodgePoseHarness.game.dragonId, ComponentType.ProceduralPose).elevationMeters > 0.11, 'normal dodge should expose its 0.12m visual apex');
dodgePoseState.active = false;
dodgePoseState.recovering = false;
dodgePoseState.phase = 1;
wyvernProjectionSystem({ game: dodgePoseHarness.game, dt: 1 / 60 });
equal(component(dodgePoseHarness, dodgePoseHarness.game.dragonId, ComponentType.ProceduralPose).elevationMeters, 0, 'settled dodge should return every contact to grounded elevation');

const ordinary = createHarness();
pressPointer(ordinary, 0);
intent = component(ordinary, ordinary.game.dragonId, ComponentType.PlayerIntent);
assert(intent.melee && !intent.pounceCounter, 'LMB outside a dodge context should remain ordinary melee');
pressKey(ordinary, 'j');
assert(component(ordinary, ordinary.game.dragonId, ComponentType.PlayerIntent).melee, 'J should remain the ordinary melee alternative');

const chainHarness = createHarness();
const chainPlayer = chainHarness.game.dragonId;
pressKey(chainHarness, ' ', ['d']);
staminaSystem({ game: chainHarness.game, dt: 0 });
const chainDodge = component(chainHarness, chainPlayer, ComponentType.DodgeState);
pressKey(chainHarness, ' ', ['a']);
assert(component(chainHarness, chainPlayer, ComponentType.PlayerIntent).dodgeChain, 'Space during dodge should request the separate distance-making branch');
staminaSystem({ game: chainHarness.game, dt: 0 });
assert(chainDodge.queuedChain && chainDodge.committedBranch === 'dodge_chain', 'second dodge direction should be captured and reserved');
equal(component(chainHarness, chainPlayer, ComponentType.Stamina).current, 12, 'second dodge should reserve another 24 stamina');
const queuedX = chainDodge.queuedDirectionX;
const queuedY = chainDodge.queuedDirectionY;
dodgeSystem({ game: chainHarness.game, map: chainHarness.map, dt: chainDodge.duration });
assert(!chainDodge.active && chainDodge.recovering, 'first dodge should expose its landing handoff');
dodgeSystem({ game: chainHarness.game, map: chainHarness.map, dt: chainDodge.chainLandingHoldSeconds });
assert(chainDodge.active && chainDodge.chainIndex === 2, '60ms landing beat should hand off through the scoped cooldown bypass');
assert(Math.abs(chainDodge.directionX - queuedX) < 0.0001 && Math.abs(chainDodge.directionY - queuedY) < 0.0001, 'second dodge should use its press-time direction');
pressKey(chainHarness, ' ', ['d']);
staminaSystem({ game: chainHarness.game, dt: 0 });
equal(chainDodge.lastDeniedReason, 'dodge_chain_limit', 'one continuous chain should reject a third dodge explicitly');

const light = createHarness();
startPounceAtImpact(light);
const lightAction = component(light, light.game.dragonId, ComponentType.ActionState);
lightAction.movementImpulseApplied = 0.8;
const husk = spawnActor(light.game.world, EntityKind.HUSK, 11, 10, Faction.HUSKS);
const profile = getWyvernActionProfile(WyvernActionId.POUNCE_COUNTER);
const contact = impactContact(profile);
const firstImpact = resolveWyvernImpact(light.game, light.game.dragonId, husk, contact, profile, ability);
assert(firstImpact.receipt.ratio < 1.5 && !firstImpact.receipt.stopped, 'light humanoid should brake but not stop the hatchling');
assert(firstImpact.receipt.retainedTravel >= 0.2 && firstImpact.receipt.retainedTravel <= 0.65, 'light target retention should remain inside the authored clamp');
const firstCap = lightAction.movementDistanceLimit;
const raider = spawnActor(light.game.world, EntityKind.RAIDER, 12, 10, Faction.RAIDERS);
resolveWyvernImpact(light.game, light.game.dragonId, raider, contact, profile, ability);
assert(lightAction.movementDistanceLimit < firstCap, 'repeated light contacts should compound remaining-travel braking');

const heavy = createHarness();
startPounceAtImpact(heavy);
const werewolf = spawnActor(heavy.game.world, EntityKind.WEREWOLF, 11, 10, Faction.WOLVES);
const heavyImpact = resolveWyvernImpact(heavy.game, heavy.game.dragonId, werewolf, contact, profile, ability);
const heavyAction = component(heavy, heavy.game.dragonId, ComponentType.ActionState);
assert(heavyImpact.receipt.ratio >= 1.5 && heavyImpact.receipt.stopped, 'heavy target should cross the immediate-stop threshold');
assert(heavyAction.contactClosed && heavyAction.impactLanding, 'heavy contact should close the attack volume and enter impact landing');
assert(heavyImpact.receipt.recoil > 0, 'heavy target should return a modest opposite recoil to the hatchling');
equal(component(heavy, werewolf, ComponentType.Health).maxHp - component(heavy, werewolf, ComponentType.Health).hp, 12, 'heavy interruption should preserve the current 12 damage');

const wall = createHarness();
const wallPlayer = wall.game.dragonId;
const wallTransform = component(wall, wallPlayer, ComponentType.Transform);
wallTransform.x = 1.34;
wallTransform.y = 10;
wallTransform.rotation = Math.PI;
assert(startProceduralAction(wall.game.world, wallPlayer, WyvernActionId.POUNCE_COUNTER, { force: true, sourceAbilityId: AbilityId.POUNCE_COUNTER, aimX: 0, aimY: 10 }), 'wall fixture should start pounce');
proceduralActionSystem({ game: wall.game, dt: 0.3 });
wyvernActionImpulseSystem({ game: wall.game, map: wall.map, dt: 0.3 });
const wallAction = component(wall, wallPlayer, ComponentType.ActionState);
assert(wallAction.movementBlocked && wallAction.impactLanding && wallAction.contactClosed, 'terrain should stop travel, close contact, and force impact landing');
equal(wallAction.lastImpactReceipt.interruptionKind, 'terrain', 'wall stop should leave an explicit terrain receipt');
assert(wallTransform.x >= 1.34 && canEntityOccupy(wall.game.world, wallPlayer, wallTransform.x, wallTransform.y, wall.map), 'blocked pounce should remain collision-safe');

const unlock = createHarness();
const progression = component(unlock, unlock.game.dragonId, ComponentType.AbilityProgression);
progression.unlockedAbilities = progression.unlockedAbilities.filter((id) => id !== AbilityId.POUNCE_COUNTER);
assert(!canUseAbility(unlock.game.world, unlock.game.dragonId, AbilityId.POUNCE_COUNTER), 'input authority should honour locked progression');
const unlockReceipt = applyAbilityUnlockEvent(unlock.game.world, unlock.game.dragonId, AbilityUnlockEventId.INSTINCT_CHARGE_AWAKENED);
assert(unlockReceipt.ok && canUseAbility(unlock.game.world, unlock.game.dragonId, AbilityId.POUNCE_COUNTER), 'legacy unlock receipt should grant the canonical pounce alias');

assert(ACTION_SYSTEM_NAMES.indexOf('dodgeSystem') < ACTION_SYSTEM_NAMES.indexOf('pounceCounterSystem'), 'pounce transition should observe post-dodge state');
assert(ACTION_SYSTEM_NAMES.indexOf('pounceCounterSystem') < ACTION_SYSTEM_NAMES.indexOf('proceduralActionSystem'), 'queued pounce should start before action advancement');

function startPounceAtImpact(harness) {
  const playerId = harness.game.dragonId;
  assert(startProceduralAction(harness.game.world, playerId, WyvernActionId.POUNCE_COUNTER, {
    force: true,
    sourceAbilityId: AbilityId.POUNCE_COUNTER,
    aimX: 20,
    aimY: 10
  }), 'impact fixture should start pounce');
  const actionState = component(harness, playerId, ComponentType.ActionState);
  actionState.phase = 0.52;
  actionState.elapsed = actionState.duration * actionState.phase;
}

function impactContact(profile) {
  return {
    ...profile.contact,
    phase: 0.52,
    impactDirectionVector: { x: 1, y: 0 },
    forward: { x: 1, y: 0 },
    right: { x: 0, y: 1 }
  };
}

function createHarness() {
  const map = createDemoMap();
  map.enemySpawns = [];
  map.unitPlacements = [];
  map.unitSpawners = [];
  map.sceneObjects = [];
  for (let y = 1; y < map.height - 1; y += 1) for (let x = 1; x < map.width - 1; x += 1) map.tiles[y][x] = TerrainType.GRASS;
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

function pressKey(harness, key, down = []) { inputSystem({ state: harness.state, input: fakeInput(harness, key, down, null) }); }
function pressPointer(harness, button) { inputSystem({ state: harness.state, input: fakeInput(harness, null, [], button) }); }

function fakeInput(harness, pressedKey, downKeys, clickedButton) {
  const transform = component(harness, harness.game.dragonId, ComponentType.Transform);
  const pointer = { ...worldToScreen(harness.camera, (transform.x + 5) * 24, transform.y * 24), hasPosition: true, inside: true };
  const down = new Set(downKeys);
  let click = clickedButton;
  return {
    pointer,
    isDown(key) { return down.has(key); },
    wasPressed(key) { return key === pressedKey; },
    consumePointerClick(button) {
      if (click !== button) return false;
      click = null;
      return true;
    }
  };
}

function component(harness, entity, type) { return getComponent(harness.game.world, entity, type); }
