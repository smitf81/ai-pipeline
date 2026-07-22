import { assert, equal } from './assert.mjs';
import { ComponentType } from '../src/constants/componentTypes.js';
import { EnemyPressureState } from '../src/constants/enemyPressureStates.js';
import { EntityKind } from '../src/constants/entityKinds.js';
import { Faction } from '../src/constants/factions.js';
import { getComponent, removeComponent, setComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { spawnActor } from '../src/game/spawn.js';
import { unitSpawnerSystem } from '../src/systems/unitSpawnerSystem.js';
import { enemyPressureSystem } from '../src/systems/enemyPressureSystem.js';
import { enemyAttackSystem } from '../src/systems/enemyAttackSystem.js';
import { createDemoMap } from '../src/world/map.js';

const harness = createEmptyHarness();
const dragon = harness.game.dragonId;
const dragonTransform = component(harness, dragon, ComponentType.Transform);
const dragonHealth = component(harness, dragon, ComponentType.Health);
dragonTransform.x = 35;
dragonTransform.y = 25;

const raider = spawnActor(harness.game.world, EntityKind.RAIDER, 5, 5);
const raiderTransform = component(harness, raider, ComponentType.Transform);
const ai = component(harness, raider, ComponentType.EnemyPressureAI);
equal(ai.state, EnemyPressureState.ROAM, 'new enemies should begin in roam');
equal(ai.anchorX, 5, 'spawn x should become the default anchor');
equal(ai.anchorY, 5, 'spawn y should become the default anchor');
equal(ai.roamRadius, 6, 'raider should inherit actor roam radius');
equal(ai.aggroRange, 11, 'raider should inherit actor aggro range');
equal(ai.leashRange, 18, 'raider should inherit actor leash range');
equal(ai.decisionInterval, 0.65, 'raider should inherit actor decision cadence');

const roamStart = { x: raiderTransform.x, y: raiderTransform.y };
enemyPressureSystem({ game: harness.game, map: harness.map, dt: 0.2 });
equal(ai.state, EnemyPressureState.ROAM, 'enemy with no nearby hostile should remain in roam');
equal(ai.targetId, null, 'roaming enemy should not retain a target');
assert(Math.hypot(ai.roamTargetX - ai.anchorX, ai.roamTargetY - ai.anchorY) <= ai.roamRadius + 0.001, 'roam target should remain inside the anchor radius');
assert(Math.hypot(raiderTransform.x - roamStart.x, raiderTransform.y - roamStart.y) > 0, 'roaming enemy should move toward a local target');

dragonTransform.x = raiderTransform.x + 5;
dragonTransform.y = raiderTransform.y;
ai.decisionCooldown = 0;
enemyPressureSystem({ game: harness.game, map: harness.map, dt: 0.1 });
equal(ai.state, EnemyPressureState.ALERT, 'enemy should become alert when a hostile enters aggro range');
equal(ai.targetId, dragon, 'alert enemy should assign the hostile target');

dragonTransform.x = raiderTransform.x + ai.aggroRange + 1;
ai.decisionCooldown = 0.4;
enemyPressureSystem({ game: harness.game, map: harness.map, dt: 0 });
equal(ai.targetId, null, 'enemy should clear a target that leaves aggro range without waiting for a full scan');
equal(ai.state, EnemyPressureState.ROAM, 'enemy should resume roam when its target leaves aggro logic');
dragonTransform.x = raiderTransform.x + 5;
ai.decisionCooldown = 0;
enemyPressureSystem({ game: harness.game, map: harness.map, dt: 0 });
equal(ai.state, EnemyPressureState.ALERT, 'enemy should reacquire a hostile that re-enters aggro range');

const closerHusk = spawnPassive(harness, EntityKind.HUSK, raiderTransform.x + 1.6, raiderTransform.y, Faction.HUSKS);
ai.decisionCooldown = 0.4;
enemyPressureSystem({ game: harness.game, map: harness.map, dt: 0.1 });
equal(ai.targetId, dragon, 'enemy should retain a valid target between decision scans');
ai.decisionCooldown = 0;
enemyPressureSystem({ game: harness.game, map: harness.map, dt: 0 });
equal(ai.targetId, closerHusk, 'decision scan should switch to the nearest hostile using the Slice 1 selector');

component(harness, closerHusk, ComponentType.Team).id = Faction.NEUTRAL;
enemyPressureSystem({ game: harness.game, map: harness.map, dt: 0 });
equal(ai.targetId, null, 'enemy should immediately clear a target that becomes neutral');
equal(ai.state, EnemyPressureState.ROAM, 'enemy should resume roam after losing an invalid target');

dragonTransform.x = raiderTransform.x + 0.55;
dragonTransform.y = raiderTransform.y;
ai.decisionCooldown = 0;
component(harness, raider, ComponentType.Cooldowns).attack = 0;
ai.guardHoldTimer = 0;
ai.guardRecoveryTimer = 0;
const hpBeforeAttack = dragonHealth.hp;
enemyPressureSystem({ game: harness.game, map: harness.map, dt: 0 });
equal(ai.state, EnemyPressureState.ATTACK, 'enemy should enter attack inside contact range');
equal(ai.targetId, dragon, 'attacking enemy should retain its target');
equal(dragonHealth.hp, hpBeforeAttack, 'attack state should begin with a non-damaging windup');
enemyAttackSystem({ game: harness.game, dt: 0.35 });
equal(dragonHealth.hp, hpBeforeAttack - 9, 'attack state should apply raider damage after windup');

dragonHealth.hp = 0;
dragonHealth.alive = false;
enemyAttackSystem({ game: harness.game, dt: 0.5 });
enemyPressureSystem({ game: harness.game, map: harness.map, dt: 0.1 });
equal(ai.targetId, null, 'enemy should clear a dead target');
equal(ai.state, EnemyPressureState.ROAM, 'enemy should return to roam after a target dies');

dragonHealth.hp = dragonHealth.maxHp;
dragonHealth.alive = true;
raiderTransform.x = ai.anchorX + ai.leashRange + 1;
raiderTransform.y = ai.anchorY;
dragonTransform.x = raiderTransform.x + 0.5;
dragonTransform.y = raiderTransform.y;
ai.targetId = dragon;
ai.state = EnemyPressureState.ALERT;
const leashStartX = raiderTransform.x;
enemyPressureSystem({ game: harness.game, map: harness.map, dt: 0.2 });
equal(ai.state, EnemyPressureState.RETURN, 'enemy beyond its leash should enter return');
equal(ai.targetId, null, 'returning enemy should suspend its hostile target');
assert(raiderTransform.x < leashStartX, 'returning enemy should move toward its anchor');

raiderTransform.x = ai.anchorX + 0.1;
raiderTransform.y = ai.anchorY;
enemyPressureSystem({ game: harness.game, map: harness.map, dt: 0.1 });
equal(ai.state, EnemyPressureState.ROAM, 'enemy reaching its anchor should resume roam');
equal(ai.targetId, null, 'enemy should remain targetless after completing return');

const legacyHarness = createEmptyHarness();
const legacyDragonTransform = component(legacyHarness, legacyHarness.game.dragonId, ComponentType.Transform);
legacyDragonTransform.x = 30;
legacyDragonTransform.y = 20;
const legacyEnemy = spawnActor(legacyHarness.game.world, EntityKind.RAIDER, 8, 8, Faction.ENEMY);
setComponent(legacyHarness.game.world, legacyEnemy, ComponentType.EnemyPressureAI, {
  damage: 9,
  attackRange: 0.82,
  attackCooldown: 0.95,
  aggroRange: 14
});
enemyPressureSystem({ game: legacyHarness.game, map: legacyHarness.map, dt: 0 });
const legacyAI = component(legacyHarness, legacyEnemy, ComponentType.EnemyPressureAI);
equal(legacyAI.state, EnemyPressureState.ROAM, 'legacy EnemyPressureAI payload should hydrate into the state model');
equal(legacyAI.anchorX, 8, 'legacy EnemyPressureAI should anchor at its current position');
equal(component(legacyHarness, legacyEnemy, ComponentType.Team).id, Faction.ENEMY, 'legacy enemy faction should remain intact');

const spawnerMap = createDemoMap();
spawnerMap.enemySpawns = [];
spawnerMap.unitPlacements = [];
spawnerMap.unitSpawners = [{
  id: 'wolf_roamer',
  type: EntityKind.WEREWOLF,
  x: 20,
  y: 10,
  initialDelaySeconds: 0,
  intervalSeconds: 10,
  burstCount: 1,
  maxAlive: 1,
  limit: 1,
  spawnRadiusTiles: 0
}];
const spawnerGame = createInitialGameState(spawnerMap);
unitSpawnerSystem({ game: spawnerGame, dt: 0 });
const wolf = spawnerGame.unitSpawners[0].spawnedEntityIds[0];
const wolfTransform = getComponent(spawnerGame.world, wolf, ComponentType.Transform);
const wolfAI = getComponent(spawnerGame.world, wolf, ComponentType.EnemyPressureAI);
equal(getComponent(spawnerGame.world, wolf, ComponentType.Team).id, Faction.WOLVES, 'spawner should preserve actor faction defaults');
equal(wolfAI.anchorX, wolfTransform.x, 'spawner-created enemy should anchor at its actual spawn x');
equal(wolfAI.anchorY, wolfTransform.y, 'spawner-created enemy should anchor at its actual spawn y');
equal(wolfAI.roamRadius, 8.5, 'spawner-created werewolf should inherit actor roam defaults');
equal(wolfAI.leashRange, 22, 'spawner-created werewolf should inherit actor leash defaults');

function createEmptyHarness() {
  const map = createDemoMap();
  map.enemySpawns = [];
  map.unitPlacements = [];
  map.unitSpawners = [];
  const game = createInitialGameState(map);
  return { game, map };
}

function spawnPassive(targetHarness, type, x, y, team) {
  const entity = spawnActor(targetHarness.game.world, type, x, y, team);
  removeComponent(targetHarness.game.world, entity, ComponentType.EnemyPressureAI);
  return entity;
}

function component(targetHarness, entity, type) {
  return getComponent(targetHarness.game.world, entity, type);
}
