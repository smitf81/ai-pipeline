import { assert, equal } from './assert.mjs';
import { ComponentType } from '../src/constants/componentTypes.js';
import { EntityKind } from '../src/constants/entityKinds.js';
import { Faction } from '../src/constants/factions.js';
import { WyvernActionId } from '../src/data/creatures/groundedWyvernMotionProfiles.js';
import { getComponent } from '../src/ecs/world.js';
import { query } from '../src/ecs/query.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { spawnActor } from '../src/game/spawn.js';
import { syncGameViews } from '../src/game/selectors.js';
import { ACTION_SYSTEM_NAMES } from '../src/game/systemOrder.js';
import { buildHudProjection } from '../src/projection/hudProjection.js';
import { canStartDodge, startDodge } from '../src/systems/dodgeState.js';
import { dodgeSystem } from '../src/systems/dodgeSystem.js';
import { enemyPressureSystem } from '../src/systems/enemyPressureSystem.js';
import { canEntityOccupy, movementSystem } from '../src/systems/movementSystem.js';
import { startProceduralAction } from '../src/systems/proceduralActionState.js';
import { staminaSystem } from '../src/systems/staminaSystem.js';
import { wyvernProjectionSystem } from '../src/systems/wyvernProjectionSystem.js';
import { createDemoMap } from '../src/world/map.js';
import { TerrainType } from '../src/world/terrain.js';

const roster = createHarness();
const raider = spawnActor(roster.game.world, EntityKind.RAIDER, 12, 10, Faction.RAIDERS);
const husk = spawnActor(roster.game.world, EntityKind.HUSK, 14, 10, Faction.HUSKS);
const werewolf = spawnActor(roster.game.world, EntityKind.WEREWOLF, 16, 10, Faction.WOLVES);
equal(query(roster.game.world, [ComponentType.Stamina]).length, 4, 'every spawned living actor should own stamina');
assert(component(roster, roster.game.dragonId, ComponentType.DodgeState).enabled, 'baby wyvern should own dodge capability');
assert(component(roster, raider, ComponentType.DodgeState).enabled, 'raider should own dodge capability');
assert(!component(roster, husk, ComponentType.DodgeState).enabled, 'husk should carry stamina without gaining dodge capability');
assert(component(roster, werewolf, ComponentType.DodgeState).enabled, 'werewolf should own dodge capability');

const walking = createHarness();
placePlayer(walking, 10, 10);
const walkingIntent = component(walking, walking.game.dragonId, ComponentType.PlayerIntent);
walkingIntent.moveX = 1;
staminaSystem({ game: walking.game, dt: 0.25 });
const walkingStart = component(walking, walking.game.dragonId, ComponentType.Transform).x;
movementSystem({ game: walking.game, map: walking.map, dt: 0.25 });
const walkingDistance = component(walking, walking.game.dragonId, ComponentType.Transform).x - walkingStart;

const sprinting = createHarness();
placePlayer(sprinting, 10, 10);
const sprintIntent = component(sprinting, sprinting.game.dragonId, ComponentType.PlayerIntent);
sprintIntent.moveX = 1;
sprintIntent.sprint = true;
staminaSystem({ game: sprinting.game, dt: 0.25 });
const sprintStart = component(sprinting, sprinting.game.dragonId, ComponentType.Transform).x;
movementSystem({ game: sprinting.game, map: sprinting.map, dt: 0.25 });
const sprintDistance = component(sprinting, sprinting.game.dragonId, ComponentType.Transform).x - sprintStart;
assert(sprintDistance > walkingDistance * 1.4, 'sprint should be a sharp movement multiplier rather than a cosmetic flag');
equal(component(sprinting, sprinting.game.dragonId, ComponentType.Stamina).current, 52.5, 'sprint should quickly consume the bounded hatchling escape pool');

const exhausted = createHarness();
const exhaustedIntent = component(exhausted, exhausted.game.dragonId, ComponentType.PlayerIntent);
exhaustedIntent.moveX = 1;
exhaustedIntent.sprint = true;
staminaSystem({ game: exhausted.game, dt: 4 });
const exhaustedStamina = component(exhausted, exhausted.game.dragonId, ComponentType.Stamina);
equal(exhaustedStamina.current, 0, 'a sustained sprint should exhaust the bounded hatchling pool');
assert(exhaustedStamina.exhausted && !exhaustedStamina.sprinting, 'exhaustion should stop sprint immediately');
equal(component(exhausted, exhausted.game.dragonId, ComponentType.Motion).speedMultiplier, 1, 'exhaustion should clear the effective sprint multiplier');
exhaustedIntent.sprint = false;
staminaSystem({ game: exhausted.game, dt: 0.5 });
equal(exhaustedStamina.current, 0, 'stamina should respect its recovery delay');
staminaSystem({ game: exhausted.game, dt: 1.4 });
assert(exhaustedStamina.current > 0 && exhaustedStamina.current < exhaustedStamina.max, 'stamina should recover after the delay without jumping straight to full');
staminaSystem({ game: exhausted.game, dt: 10 });
equal(exhaustedStamina.current, exhaustedStamina.max, 'stamina recovery should cap at max');

const playerDodge = createHarness();
placePlayer(playerDodge, 10, 10);
const playerIntent = component(playerDodge, playerDodge.game.dragonId, ComponentType.PlayerIntent);
playerIntent.moveY = -1;
playerIntent.dodge = true;
playerIntent.melee = true;
playerIntent.bite = true;
staminaSystem({ game: playerDodge.game, dt: 0 });
const playerDodgeState = component(playerDodge, playerDodge.game.dragonId, ComponentType.DodgeState);
equal(component(playerDodge, playerDodge.game.dragonId, ComponentType.Stamina).current, 36, 'player dodge should spend 24 points from the shared stamina resource');
assert(playerDodgeState.active, 'player dodge input should start the shared dodge state');
assert(!playerIntent.melee && !playerIntent.bite, 'dodge should win same-frame arbitration over attacks');
const dodgeStartY = component(playerDodge, playerDodge.game.dragonId, ComponentType.Transform).y;
dodgeSystem({ game: playerDodge.game, map: playerDodge.map, dt: 0.08 });
wyvernProjectionSystem({ game: playerDodge.game, dt: 0.01 });
assert(component(playerDodge, playerDodge.game.dragonId, ComponentType.Transform).y < dodgeStartY - 0.4, 'dodge should apply a short collision-safe jump');
equal(component(playerDodge, playerDodge.game.dragonId, ComponentType.MotionState).locomotionId, 'dodge', 'wyvern projection should embody the active dodge');
dodgeSystem({ game: playerDodge.game, map: playerDodge.map, dt: 0.08 });
staminaSystem({ game: playerDodge.game, dt: 0.6 });
assert(startDodge(playerDodge.game.world, playerDodge.game.dragonId, { x: 1, y: 0 }, 'test_second_dodge'), 'a second dodge should fit in the restrained full pool');
dodgeSystem({ game: playerDodge.game, map: playerDodge.map, dt: 0.2 });
staminaSystem({ game: playerDodge.game, dt: 0.6 });
component(playerDodge, playerDodge.game.dragonId, ComponentType.Stamina).current = 23;
assert(!startDodge(playerDodge.game.world, playerDodge.game.dragonId, { x: 1, y: 0 }, 'test_low_stamina_dodge'), 'a dodge should be denied below its 24-point cost');
equal(canStartDodge(playerDodge.game.world, playerDodge.game.dragonId).reason, 'insufficient_stamina', 'dodge denial should fail loudly with a resource reason');

const wallDodge = createHarness();
placePlayer(wallDodge, 1.34, 10);
assert(startDodge(wallDodge.game.world, wallDodge.game.dragonId, { x: -1, y: 0 }, 'wall_safety_test'), 'wall dodge fixture should start');
dodgeSystem({ game: wallDodge.game, map: wallDodge.map, dt: 0.2 });
const wallTransform = component(wallDodge, wallDodge.game.dragonId, ComponentType.Transform);
assert(wallTransform.x >= 1.34, 'dodge should not jump beyond the playable map boundary');
assert(canEntityOccupy(wallDodge.game.world, wallDodge.game.dragonId, wallTransform.x, wallTransform.y, wallDodge.map), 'blocked dodge should finish in a collision-safe position');

for (const type of [EntityKind.RAIDER, EntityKind.WEREWOLF]) {
  const evasion = createHarness();
  placePlayer(evasion, 10, 10);
  const defender = spawnActor(evasion.game.world, type, 11.4, 10, type === EntityKind.RAIDER ? Faction.RAIDERS : Faction.WOLVES);
  const playerTransform = component(evasion, evasion.game.dragonId, ComponentType.Transform);
  assert(startProceduralAction(evasion.game.world, evasion.game.dragonId, WyvernActionId.BITE_ATTACK, {
    aimX: 12,
    aimY: 10
  }), 'AI dodge fixture should start a visible incoming player attack');
  playerTransform.rotation = 0;
  enemyPressureSystem({ game: evasion.game, map: evasion.map, dt: 0.01 });
  const dodge = component(evasion, defender, ComponentType.DodgeState);
  assert(dodge.active, `${type} should call the shared dodge path against an incoming attack`);
  assert(dodge.lastReason.startsWith('incoming_attack:'), `${type} dodge should retain threat provenance`);
  assert(component(evasion, defender, ComponentType.Stamina).current < component(evasion, defender, ComponentType.Stamina).max, `${type} dodge should spend stamina`);
}

const huskEvasion = createHarness();
placePlayer(huskEvasion, 10, 10);
const passiveHusk = spawnActor(huskEvasion.game.world, EntityKind.HUSK, 11.4, 10, Faction.HUSKS);
startProceduralAction(huskEvasion.game.world, huskEvasion.game.dragonId, WyvernActionId.BITE_ATTACK, { aimX: 12, aimY: 10 });
enemyPressureSystem({ game: huskEvasion.game, map: huskEvasion.map, dt: 0.01 });
assert(!component(huskEvasion, passiveHusk, ComponentType.DodgeState).active, 'husk should not inherit raider/werewolf evasion accidentally');

syncGameViews(sprinting.game);
const hud = buildHudProjection(sprinting.game);
equal(hud.playerStamina, 52.5, 'HUD projection should read canonical player stamina');
assert(hud.sprinting, 'HUD projection should expose sprint state');
assert(ACTION_SYSTEM_NAMES.indexOf('staminaSystem') < ACTION_SYSTEM_NAMES.indexOf('movementSystem'), 'stamina should resolve before movement speed');
assert(ACTION_SYSTEM_NAMES.indexOf('enemyPressureSystem') < ACTION_SYSTEM_NAMES.indexOf('dodgeSystem'), 'enemy AI should be able to request dodge before displacement');
assert(ACTION_SYSTEM_NAMES.indexOf('dodgeSystem') < ACTION_SYSTEM_NAMES.indexOf('actorSeparationSystem'), 'dodge displacement should resolve before actor separation');

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

function placePlayer(harness, x, y) {
  const transform = component(harness, harness.game.dragonId, ComponentType.Transform);
  transform.x = x;
  transform.y = y;
  transform.rotation = 0;
  const projection = component(harness, harness.game.dragonId, ComponentType.WyvernProjection);
  projection.lastX = x;
  projection.lastY = y;
}

function component(harness, entity, type) {
  return getComponent(harness.game.world, entity, type);
}
