import { assert, deepEqual, equal } from './assert.mjs';
import { ComponentType } from '../src/constants/componentTypes.js';
import { EntityKind } from '../src/constants/entityKinds.js';
import { Faction } from '../src/constants/factions.js';
import { ACTORS } from '../src/data/actors.js';
import { COMBAT_BALANCE } from '../src/data/combatBalance.js';
import {
  EnemyAttackPhase,
  EnemyAttackProfileId,
  EnemyCollateralMode,
  getEnemyAttackProfile
} from '../src/data/enemyAttackProfiles.js';
import { getComponent, removeComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { spawnActor } from '../src/game/spawn.js';
import {
  canEnemyAttackDamageCandidate,
  enemyAttackSystem
} from '../src/systems/enemyAttackSystem.js';
import { enemyPressureSystem } from '../src/systems/enemyPressureSystem.js';
import { humanoidProjectionSystem } from '../src/systems/humanoidProjectionSystem.js';
import { createDemoMap } from '../src/world/map.js';

deepEqual(ACTORS[EntityKind.RAIDER].attackProfileIds, [
  EnemyAttackProfileId.RAIDER_SPEAR_JAB,
  EnemyAttackProfileId.RAIDER_TORCH_SWING
], 'raiders should own both spear jab and carried-torch swing profiles');
deepEqual(ACTORS[EntityKind.HUSK].attackProfileIds, [EnemyAttackProfileId.HUSK_CLAW_MAUL], 'husks should own the claw maul profile');
deepEqual(ACTORS[EntityKind.WEREWOLF].attackProfileIds, [EnemyAttackProfileId.WEREWOLF_LUNGE_BITE], 'werewolves should own the lunge bite profile');

const spear = getEnemyAttackProfile(EnemyAttackProfileId.RAIDER_SPEAR_JAB);
const torch = getEnemyAttackProfile(EnemyAttackProfileId.RAIDER_TORCH_SWING);
const maul = getEnemyAttackProfile(EnemyAttackProfileId.HUSK_CLAW_MAUL);
const bite = getEnemyAttackProfile(EnemyAttackProfileId.WEREWOLF_LUNGE_BITE);
equal(spear.collateralMode, EnemyCollateralMode.HOSTILE_AND_FRIENDLY, 'spear should permit packed-raider friendly fire');
equal(torch.collateralMode, EnemyCollateralMode.HOSTILE_AND_FRIENDLY, 'torch swing should permit packed-raider friendly fire');
equal(torch.weaponSocket, 'torch_flame_socket', 'torch attack should bind to the existing carried torch socket');
equal(maul.collateralMode, EnemyCollateralMode.ALL_DAMAGEABLE, 'husk maul should be unsafe to every damageable body');
equal(bite.collateralMode, EnemyCollateralMode.TARGET_ONLY, 'werewolf bite should stay target-only for readability');
assert(spear.range > maul.range, 'raider spear should reach farther than the husk maul');
assert(bite.damage > spear.damage && bite.recovery > spear.recovery, 'werewolf bite should hit harder and recover longer than the spear');
for (const profile of [spear, torch, maul, bite]) {
  assert(profile.windup > 0 && profile.active > 0 && profile.recovery > 0, `${profile.id} should expose stable three-phase timing`);
  assert(profile.damageTime01 > 0 && profile.damageTime01 < 1, `${profile.id} should resolve damage inside its active phase`);
  assert(profile.weaponReach > 0 && profile.strikeOriginSocket && profile.strikeEndpointSocket, `${profile.id} should expose canonical reach and strike sockets`);
}

const raiderHarness = createHarness();
const raider = spawnActor(raiderHarness.game.world, EntityKind.RAIDER, 5, 5);
const hostileHusk = spawnPassive(raiderHarness, EntityKind.HUSK, 5.75, 5, Faction.HUSKS);
const friendlyRaider = spawnPassive(raiderHarness, EntityKind.RAIDER, 5.72, 5.24, Faction.RAIDERS);
const neutralHusk = spawnPassive(raiderHarness, EntityKind.HUSK, 5.68, 4.92, Faction.NEUTRAL);
const deadHusk = spawnPassive(raiderHarness, EntityKind.HUSK, 5.65, 5.08, Faction.HUSKS);
const deadHealth = component(raiderHarness, deadHusk, ComponentType.Health);
deadHealth.hp = 0;
deadHealth.alive = false;
const raiderAI = component(raiderHarness, raider, ComponentType.EnemyPressureAI);
const raiderHealth = component(raiderHarness, raider, ComponentType.Health);
const hostileHealth = component(raiderHarness, hostileHusk, ComponentType.Health);
const friendlyHealth = component(raiderHarness, friendlyRaider, ComponentType.Health);
const neutralHealth = component(raiderHarness, neutralHusk, ComponentType.Health);

enemyPressureSystem({ game: raiderHarness.game, map: raiderHarness.map, dt: 0 });
equal(raiderAI.targetId, hostileHusk, 'raider should intentionally choose the hostile body');
equal(raiderAI.activeAttackProfileId, spear.id, 'raider should open its deterministic sequence with spear jab');
equal(raiderAI.attackPhase, EnemyAttackPhase.WINDUP, 'raider attack should begin in windup');
equal(hostileHealth.hp, hostileHealth.maxHp, 'windup should not apply immediate damage');
enemyAttackSystem({ game: raiderHarness.game, dt: spear.windup });
equal(raiderAI.attackPhase, EnemyAttackPhase.ACTIVE, 'completed spear windup should enter a distinct active phase');
equal(hostileHealth.hp, hostileHealth.maxHp, 'entering the active phase should not damage before profile-owned timing');
enemyAttackSystem({ game: raiderHarness.game, dt: spear.active * spear.damageTime01 });
equal(hostileHealth.hp, hostileHealth.maxHp - scaledEnemyDamage(spear.damage), 'spear should scale damage against the intended non-player hostile after windup');
equal(friendlyHealth.hp, friendlyHealth.maxHp - scaledEnemyDamage(spear.damage), 'spear should scale collateral damage against a friendly non-player packed into its capsule');
equal(neutralHealth.hp, neutralHealth.maxHp, 'hostile-and-friendly spear mode should ignore neutral bodies');
equal(deadHealth.hp, 0, 'spear should ignore dead bodies');
equal(raiderHealth.hp, raiderHealth.maxHp, 'attacker should never damage itself');
equal(raiderAI.attackPhase, EnemyAttackPhase.ACTIVE, 'resolved spear damage should remain inside the bounded active window');
assert(component(raiderHarness, raider, ComponentType.Cooldowns).attack >= spear.cooldown, 'resolved spear should arm its cooldown');

enemyAttackSystem({ game: raiderHarness.game, dt: spear.active + spear.recovery });
component(raiderHarness, raider, ComponentType.Cooldowns).attack = 0;
humanoidProjectionSystem({ game: raiderHarness.game, dt: 0 });
const raiderProjection = component(raiderHarness, raider, ComponentType.HumanoidProjection);
const idleTorchX = raiderProjection.sockets.torchFlame.x;
const idleTorchY = raiderProjection.sockets.torchFlame.y;
enemyPressureSystem({ game: raiderHarness.game, map: raiderHarness.map, dt: 0 });
equal(raiderAI.activeAttackProfileId, torch.id, 'raider should alternate to the carried-torch swing');
humanoidProjectionSystem({ game: raiderHarness.game, dt: 0 });
equal(raiderProjection.attackState.profileId, torch.id, 'humanoid projection should expose the torch attack pose');
equal(raiderProjection.sockets.torchFlame.role, torch.weaponSocket, 'torch attack pose should keep the canonical flame socket');
enemyAttackSystem({ game: raiderHarness.game, dt: torch.windup * 0.5 });
humanoidProjectionSystem({ game: raiderHarness.game, dt: 0 });
assert(Math.hypot(raiderProjection.sockets.torchFlame.x - idleTorchX, raiderProjection.sockets.torchFlame.y - idleTorchY) > 0.05, 'torch windup should visibly move the carried torch socket');
const friendlyBeforeTorch = friendlyHealth.hp;
enemyAttackSystem({ game: raiderHarness.game, dt: torch.windup * 0.5 });
equal(friendlyHealth.hp, friendlyBeforeTorch, 'torch windup should remain non-damaging');
enemyAttackSystem({ game: raiderHarness.game, dt: torch.active * torch.damageTime01 });
equal(friendlyHealth.hp, friendlyBeforeTorch - scaledEnemyDamage(torch.damage), 'torch swing should resolve scaled non-player collateral damage');
equal(raiderAI.lastAttackProfileId, torch.id, 'attack history should record the torch profile');

const huskHarness = createHarness();
const husk = spawnActor(huskHarness.game.world, EntityKind.HUSK, 5, 5);
const hostileRaider = spawnPassive(huskHarness, EntityKind.RAIDER, 5.58, 5, Faction.RAIDERS);
const friendlyHusk = spawnPassive(huskHarness, EntityKind.HUSK, 5.55, 5.18, Faction.HUSKS);
const neutralRaider = spawnPassive(huskHarness, EntityKind.RAIDER, 5.52, 4.84, Faction.NEUTRAL);
const huskHealth = component(huskHarness, husk, ComponentType.Health);
enemyPressureSystem({ game: huskHarness.game, map: huskHarness.map, dt: 0 });
equal(component(huskHarness, husk, ComponentType.EnemyPressureAI).activeAttackProfileId, maul.id, 'husk should use claw maul');
enemyAttackSystem({ game: huskHarness.game, dt: maul.windup });
enemyAttackSystem({ game: huskHarness.game, dt: maul.active * maul.damageTime01 });
for (const target of [hostileRaider, friendlyHusk, neutralRaider]) {
  const health = component(huskHarness, target, ComponentType.Health);
  const expectedDamage = component(huskHarness, target, ComponentType.Team).id === Faction.NEUTRAL
    ? maul.damage
    : scaledEnemyDamage(maul.damage);
  equal(health.hp, health.maxHp - expectedDamage, 'all-damageable maul should scale non-player faction hits while still hitting every living body in its arc');
}
equal(huskHealth.hp, huskHealth.maxHp, 'all-damageable mode should still exclude the attacker');

const wolfHarness = createHarness();
const wolf = spawnActor(wolfHarness.game.world, EntityKind.WEREWOLF, 5, 5);
const dragonTransform = component(wolfHarness, wolfHarness.game.dragonId, ComponentType.Transform);
dragonTransform.x = 5.8;
dragonTransform.y = 5;
const dragonHealth = component(wolfHarness, wolfHarness.game.dragonId, ComponentType.Health);
const friendlyWolf = spawnPassive(wolfHarness, EntityKind.WEREWOLF, 5.65, 5.08, Faction.WOLVES);
const friendlyWolfHealth = component(wolfHarness, friendlyWolf, ComponentType.Health);
enemyPressureSystem({ game: wolfHarness.game, map: wolfHarness.map, dt: 0 });
equal(component(wolfHarness, wolf, ComponentType.EnemyPressureAI).activeAttackProfileId, bite.id, 'werewolf should use lunge bite');
enemyAttackSystem({ game: wolfHarness.game, dt: bite.windup });
enemyAttackSystem({ game: wolfHarness.game, dt: bite.active * bite.damageTime01 });
equal(dragonHealth.hp, dragonHealth.maxHp - bite.damage, 'werewolf bite should damage its intended target');
equal(friendlyWolfHealth.hp, friendlyWolfHealth.maxHp, 'target-only bite should not damage a nearby friendly');

const invalidHarness = createHarness();
const invalidWolf = spawnActor(invalidHarness.game.world, EntityKind.WEREWOLF, 5, 5);
const invalidDragonTransform = component(invalidHarness, invalidHarness.game.dragonId, ComponentType.Transform);
invalidDragonTransform.x = 5.8;
invalidDragonTransform.y = 5;
const invalidDragonHealth = component(invalidHarness, invalidHarness.game.dragonId, ComponentType.Health);
enemyPressureSystem({ game: invalidHarness.game, map: invalidHarness.map, dt: 0 });
invalidDragonHealth.hp = 0;
invalidDragonHealth.alive = false;
enemyAttackSystem({ game: invalidHarness.game, dt: bite.windup });
enemyAttackSystem({ game: invalidHarness.game, dt: bite.active * bite.damageTime01 });
equal(component(invalidHarness, invalidWolf, ComponentType.EnemyPressureAI).lastAttackHitIds.length, 0, 'target dying during windup should cancel hit resolution');

const missHarness = createHarness();
const missWolf = spawnActor(missHarness.game.world, EntityKind.WEREWOLF, 5, 5);
const missDragonTransform = component(missHarness, missHarness.game.dragonId, ComponentType.Transform);
missDragonTransform.x = 5.8;
missDragonTransform.y = 5;
const missDragonHealth = component(missHarness, missHarness.game.dragonId, ComponentType.Health);
enemyPressureSystem({ game: missHarness.game, map: missHarness.map, dt: 0 });
missDragonTransform.x = 9;
enemyAttackSystem({ game: missHarness.game, dt: bite.windup });
enemyAttackSystem({ game: missHarness.game, dt: bite.active * bite.damageTime01 });
equal(missDragonHealth.hp, missDragonHealth.maxHp, 'target leaving the hit shape during windup should be missed safely');

equal(canEnemyAttackDamageCandidate(raiderHarness.game.world, raider, friendlyRaider, hostileHusk, EnemyCollateralMode.HOSTILE_ONLY), false, 'hostile-only mode should exclude a friendly');
equal(canEnemyAttackDamageCandidate(raiderHarness.game.world, raider, friendlyRaider, hostileHusk, EnemyCollateralMode.TARGET_ONLY), false, 'target-only mode should exclude collateral friendlies');
equal(canEnemyAttackDamageCandidate(raiderHarness.game.world, raider, neutralHusk, hostileHusk, EnemyCollateralMode.ALL_DAMAGEABLE), true, 'all-damageable mode should include a living neutral');

function createHarness() {
  const map = createDemoMap();
  map.enemySpawns = [];
  map.unitPlacements = [];
  map.unitSpawners = [];
  const game = createInitialGameState(map);
  const dragonTransform = getComponent(game.world, game.dragonId, ComponentType.Transform);
  dragonTransform.x = 30;
  dragonTransform.y = 20;
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

function scaledEnemyDamage(damage) {
  return Math.max(COMBAT_BALANCE.enemyVsEnemyDamage.minimumDamage, damage * COMBAT_BALANCE.enemyVsEnemyDamage.multiplier);
}
