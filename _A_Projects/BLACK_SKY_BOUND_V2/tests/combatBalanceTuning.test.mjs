import { assert, equal } from './assert.mjs';
import { ComponentType } from '../src/constants/componentTypes.js';
import { EntityKind } from '../src/constants/entityKinds.js';
import { Faction } from '../src/constants/factions.js';
import { ACTORS } from '../src/data/actors.js';
import { BodyStateProfileId, getBodyStateProfile } from '../src/data/bodyStateFeedback.js';
import { COMBAT_BALANCE } from '../src/data/combatBalance.js';
import { getEnemyAttackProfile, EnemyAttackProfileId } from '../src/data/enemyAttackProfiles.js';
import { getComponent, removeComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { spawnActor } from '../src/game/spawn.js';
import { applyDamageToEntity, healthSystem } from '../src/systems/healthSystem.js';
import { enemyPressureSystem } from '../src/systems/enemyPressureSystem.js';
import { moveEntityOnMap } from '../src/systems/movementSystem.js';
import { timerSystem } from '../src/systems/timerSystem.js';
import { createDemoMap } from '../src/world/map.js';

const profile = getBodyStateProfile(BodyStateProfileId.YOUNG_DRAGON_SURVIVAL);
equal(profile.health.maxHealth, 80, 'first-pass balance should reduce player max health by 20%');
assert(profile.health.regenDelayMs >= 3500, 'player recovery delay should be noticeably longer after damage');
assert(profile.health.regenRampMs > 0 && profile.health.regenStartMultiplier < 0.5, 'player health regen should ramp from a weak start');
assert(profile.health.regenSprintingMultiplier < 1 && profile.health.regenActionMultiplier < 1, 'recovery should be slower during sprinting or attacks');
equal(ACTORS[EntityKind.YOUNG_DRAGON].hp, profile.health.maxHealth, 'actor roster should read player HP from body-state tuning');

const recoveryHarness = createHarness();
const dragonHealth = component(recoveryHarness, recoveryHarness.game.dragonId, ComponentType.Health);
applyDamageToEntity(recoveryHarness.game.world, recoveryHarness.game.dragonId, 24, 'test', 'regen_ramp');
healthSystem({ game: recoveryHarness.game, dt: profile.health.regenDelayMs / 1000 + 0.5 });
const firstRecoveryHp = dragonHealth.hp;
healthSystem({ game: recoveryHarness.game, dt: 2.5 });
assert(dragonHealth.hp > firstRecoveryHp, 'regen should continue after sustained safety');
assert(dragonHealth.regenRampMultiplier > profile.health.regenStartMultiplier, 'regen ramp multiplier should rise after sustained safety');

const slowHarness = createHarness();
placePlayer(slowHarness, 10, 10);
const raider = spawnActor(slowHarness.game.world, EntityKind.RAIDER, 10.8, 10, Faction.RAIDERS);
applyDamageToEntity(slowHarness.game.world, slowHarness.game.dragonId, 4, raider, 'test_hit_slow');
const playerStatus = component(slowHarness, slowHarness.game.dragonId, ComponentType.StatusEffects);
equal(playerStatus.movementSlowMultiplier, COMBAT_BALANCE.playerHitSlow.movementMultiplier, 'enemy hits should afflict a temporary player slow');
const slowTransform = component(slowHarness, slowHarness.game.dragonId, ComponentType.Transform);
const slowStartX = slowTransform.x;
moveEntityOnMap(slowHarness.game.world, slowHarness.game.dragonId, 1, 0, 0.25, slowHarness.map);
const slowedDistance = slowTransform.x - slowStartX;
timerSystem({ game: slowHarness.game, dt: COMBAT_BALANCE.playerHitSlow.durationSeconds + 0.01 });
const clearStartX = slowTransform.x;
moveEntityOnMap(slowHarness.game.world, slowHarness.game.dragonId, 1, 0, 0.25, slowHarness.map);
const clearDistance = slowTransform.x - clearStartX;
assert(slowedDistance < clearDistance * 0.8, 'hit slow should reduce movement without immobilising the player');

const scaleHarness = createHarness();
const scalingRaider = spawnPassive(scaleHarness, EntityKind.RAIDER, 6, 5, Faction.RAIDERS);
const scalingHusk = spawnPassive(scaleHarness, EntityKind.HUSK, 6.7, 5, Faction.HUSKS);
const huskHealth = component(scaleHarness, scalingHusk, ComponentType.Health);
const spear = getEnemyAttackProfile(EnemyAttackProfileId.RAIDER_SPEAR_JAB);
applyDamageToEntity(scaleHarness.game.world, scalingHusk, spear.damage, scalingRaider, spear.damageType);
equal(huskHealth.hp, huskHealth.maxHp - scaledEnemyDamage(spear.damage), 'enemy-vs-enemy hits should scale down without changing profile damage');

assert(ACTORS[EntityKind.HUSK].speed > 2, 'husk tuning should increase approach pressure');
assert(ACTORS[EntityKind.HUSK].ai.aggroRange > 9, 'husk tuning should make swarms notice the player from a little farther away');
assert(ACTORS[EntityKind.HUSK].ai.damage === 6, 'husk swarm pressure should not come from higher single-hit damage');
assert(ACTORS[EntityKind.RAIDER].ai.guard.enabled, 'raider tuning should prepare an organised guard/hold behaviour');

const guardHarness = createHarness();
placePlayer(guardHarness, 10, 10);
const guardRaider = spawnActor(guardHarness.game.world, EntityKind.RAIDER, 8.5, 10, Faction.RAIDERS);
const guardTransform = component(guardHarness, guardRaider, ComponentType.Transform);
const guardAI = component(guardHarness, guardRaider, ComponentType.EnemyPressureAI);
enemyPressureSystem({ game: guardHarness.game, map: guardHarness.map, dt: 0.1 });
const guardX = guardTransform.x;
enemyPressureSystem({ game: guardHarness.game, map: guardHarness.map, dt: 0.1 });
equal(guardAI.guardHoldCount, 1, 'raider should start a brief guard hold inside its obstruction band');
equal(guardTransform.x, guardX, 'guarding raider should hold ground briefly instead of perfectly chasing');

function createHarness() {
  const map = createDemoMap();
  map.enemySpawns = [];
  map.unitPlacements = [];
  map.unitSpawners = [];
  map.sceneObjects = [];
  const game = createInitialGameState(map);
  return { map, game };
}

function placePlayer(harness, x, y) {
  const transform = component(harness, harness.game.dragonId, ComponentType.Transform);
  transform.x = x;
  transform.y = y;
  const projection = component(harness, harness.game.dragonId, ComponentType.WyvernProjection);
  projection.lastX = x;
  projection.lastY = y;
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
