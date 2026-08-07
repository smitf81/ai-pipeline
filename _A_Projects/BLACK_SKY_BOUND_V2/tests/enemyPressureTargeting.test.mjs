import { equal } from './assert.mjs';
import { ComponentType } from '../src/constants/componentTypes.js';
import { EntityKind } from '../src/constants/entityKinds.js';
import { Faction } from '../src/constants/factions.js';
import { COMBAT_BALANCE } from '../src/data/combatBalance.js';
import { EnemyAttackProfileId, getEnemyAttackProfile } from '../src/data/enemyAttackProfiles.js';
import { getComponent, removeComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { spawnActor } from '../src/game/spawn.js';
import {
  enemyPressureSystem,
  findNearestHostileEntity
} from '../src/systems/enemyPressureSystem.js';
import { enemyAttackSystem } from '../src/systems/enemyAttackSystem.js';
import { createDemoMap } from '../src/world/map.js';

const nonPlayerHarness = createEmptyHarness();
const spearDamage = getEnemyAttackProfile(EnemyAttackProfileId.RAIDER_SPEAR_JAB).damage;
const dragonTransform = component(nonPlayerHarness, nonPlayerHarness.game.dragonId, ComponentType.Transform);
dragonTransform.x = 10;
dragonTransform.y = 10;
const dragonHealth = component(nonPlayerHarness, nonPlayerHarness.game.dragonId, ComponentType.Health);

const raider = spawnActor(nonPlayerHarness.game.world, EntityKind.RAIDER, 5, 5);
const friendlyRaider = spawnPassive(nonPlayerHarness, EntityKind.RAIDER, 5.2, 5.7, Faction.RAIDERS);
const neutralHusk = spawnPassive(nonPlayerHarness, EntityKind.HUSK, 5.3, 5, Faction.NEUTRAL);
const deadHusk = spawnPassive(nonPlayerHarness, EntityKind.HUSK, 5.4, 5, Faction.HUSKS);
const hostileHusk = spawnPassive(nonPlayerHarness, EntityKind.HUSK, 5.6, 5, Faction.HUSKS);
const deadHealth = component(nonPlayerHarness, deadHusk, ComponentType.Health);
deadHealth.hp = 0;
deadHealth.alive = false;

equal(findNearestHostileEntity(nonPlayerHarness.game.world, raider, 14), hostileHusk, 'raider should select the nearest alive hostile non-player entity');
equal(findNearestHostileEntity(nonPlayerHarness.game.world, raider, 0.4), null, 'hostiles outside aggro range should not be selected');

const hostileHealth = component(nonPlayerHarness, hostileHusk, ComponentType.Health);
const friendlyHealth = component(nonPlayerHarness, friendlyRaider, ComponentType.Health);
const neutralHealth = component(nonPlayerHarness, neutralHusk, ComponentType.Health);
enemyPressureSystem({ game: nonPlayerHarness.game, map: nonPlayerHarness.map, dt: 0 });
equal(hostileHealth.hp, hostileHealth.maxHp, 'target selection should begin windup without immediate damage');
enemyAttackSystem({ game: nonPlayerHarness.game, dt: 0.35 });
equal(hostileHealth.hp, hostileHealth.maxHp - scaledEnemyDamage(spearDamage), 'raider spear jab should damage the selected hostile with enemy-vs-enemy scaling after windup');
equal(dragonHealth.hp, dragonHealth.maxHp, 'farther dragon should not be targeted when a hostile non-player unit is closer');
equal(friendlyHealth.hp, friendlyHealth.maxHp, 'friendly entities should be ignored');
equal(neutralHealth.hp, neutralHealth.maxHp, 'neutral entities should be ignored');
equal(deadHealth.hp, 0, 'dead entities should be ignored');

const compatibilityHarness = createEmptyHarness();
const compatibilityDragonTransform = component(compatibilityHarness, compatibilityHarness.game.dragonId, ComponentType.Transform);
compatibilityDragonTransform.x = 7.5;
compatibilityDragonTransform.y = 7;
const compatibilityDragonHealth = component(compatibilityHarness, compatibilityHarness.game.dragonId, ComponentType.Health);
spawnActor(compatibilityHarness.game.world, EntityKind.RAIDER, 7, 7, Faction.ENEMY);
enemyPressureSystem({ game: compatibilityHarness.game, map: compatibilityHarness.map, dt: 0 });
enemyAttackSystem({ game: compatibilityHarness.game, dt: 0.35 });
equal(compatibilityDragonHealth.hp, compatibilityDragonHealth.maxHp - spearDamage, 'generic enemy faction should retain profiled pressure against player');

function createEmptyHarness() {
  const map = createDemoMap();
  map.enemySpawns = [];
  map.unitPlacements = [];
  const game = createInitialGameState(map);
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
