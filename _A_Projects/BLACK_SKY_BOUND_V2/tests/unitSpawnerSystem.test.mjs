import { assert, equal } from './assert.mjs';
import { EntityKind } from '../src/constants/entityKinds.js';
import { Faction } from '../src/constants/factions.js';
import { CONFIG } from '../src/config.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { syncGameViews } from '../src/game/selectors.js';
import { unitSpawnerSystem } from '../src/systems/unitSpawnerSystem.js';
import { applyDamageToEntity } from '../src/systems/healthSystem.js';
import { deathLifecycleSystem } from '../src/systems/deathLifecycleSystem.js';
import { aliveEnemyEntities } from '../src/systems/combatSystem.js';
import { entityIntersectsAttackContact } from '../src/systems/wyvernAttackContactSystem.js';
import { getComponent } from '../src/ecs/world.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { createDemoMap } from '../src/world/map.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { createCamera } from '../src/render/camera.js';
import { WebGLWorldDepthLayer } from '../src/render/backends/webgl/layers/WebGLWorldDepthLayer.js';

const map = createDemoMap();
map.enemySpawns = [];
map.unitPlacements = [];
map.unitSpawners = [{
  id: 'husk_wave_01',
  type: EntityKind.HUSK,
  team: Faction.ENEMY,
  x: 18,
  y: 9,
  enabled: true,
  intervalSeconds: 1,
  initialDelaySeconds: 0,
  burstCount: 1,
  maxAlive: 1,
  limit: 2,
  spawnRadiusTiles: 0,
  hitPoints: 24,
  fixtureRadiusTiles: 0.55
}];

const game = createInitialGameState(map);
equal(game.unitSpawners.length, 1, 'game state should expose runtime spawners');
equal(game.actors.filter((actor) => actor.team === Faction.ENEMY).length, 0, 'spawner-only scenes should start without direct enemy placements');
equal(game.unitSpawnerFixtures.length, 1, 'spawner-only scenes should expose a rendered fixture view');
const fixtureEntity = game.unitSpawners[0].fixtureEntityId;
assert(fixtureEntity, 'runtime spawner should own a fixture ECS entity');
equal(getComponent(game.world, fixtureEntity, ComponentType.Kind)?.type, EntityKind.UNIT_SPAWNER, 'fixture entity should use the unit spawner kind');
equal(getComponent(game.world, fixtureEntity, ComponentType.Health)?.maxHp, 24, 'fixture entity should receive authored health');
equal(getComponent(game.world, fixtureEntity, ComponentType.Collider)?.radius, 0.55, 'fixture entity should receive authored attack radius');
assert(aliveEnemyEntities(game).includes(fixtureEntity), 'player attack target queries should include live hostile spawner fixtures');
assert(entityIntersectsAttackContact(game.world, fixtureEntity, {
  active: true,
  contactShape: 'capsule',
  x: 18.5,
  y: 9.5,
  forward: { x: 1, y: 0 },
  right: { x: 0, y: 1 },
  contactSize: { length: 0.2, width: 0.2 }
}), 'wyvern attack contact tests should overlap the spawner fixture collider');
const projection = buildRenderProjection({ time: 0, map, game, camera: createCamera({ clientWidth: 1280, clientHeight: 720 }, map) }, CONFIG);
equal(projection.unitSpawnerFixtures.length, 1, 'render projection should expose spawner fixtures separately from actors');
const depthLayer = new WebGLWorldDepthLayer();
depthLayer.update(projection, {
  camera: createLayerCamera(map),
  lightSpaceCulling: projection.lightSpaceCulling,
  sceneObjectVisibilityStates: new Map(),
  renderTimeMs: 0
});
const depthStats = depthLayer.statsFields();
equal(depthStats.unitSpawnerFixtureSourceCount, 1, 'WebGL depth stats should count spawner fixture sources');
assert(depthStats.unitSpawnerFixturePrimitiveCount > 0, 'WebGL depth layer should emit placeholder fixture primitives');

unitSpawnerSystem({ game, dt: 0 });
syncGameViews(game);
equal(game.unitSpawners[0].spawnedCount, 1, 'spawner should emit immediately when the initial delay is zero');
equal(game.actors.filter((actor) => actor.team === Faction.ENEMY && actor.type === EntityKind.HUSK).length, 1, 'spawned enemies should appear in the synced actor views');

unitSpawnerSystem({ game, dt: 0.25 });
syncGameViews(game);
equal(game.unitSpawners[0].spawnedCount, 1, 'spawner should not emit again before its interval elapses');

unitSpawnerSystem({ game, dt: 1 });
syncGameViews(game);
equal(game.unitSpawners[0].spawnedCount, 1, 'maxAlive should prevent a replacement while the first spawn is alive');

const firstSpawn = game.unitSpawners[0].spawnedEntityIds[0];
const firstHealth = getComponent(game.world, firstSpawn, ComponentType.Health);
applyDamageToEntity(game.world, firstSpawn, firstHealth.hp, game.dragonId, 'spawner_recovery_test');
deathLifecycleSystem({ game });
unitSpawnerSystem({ game, dt: 1 });
syncGameViews(game);
equal(game.unitSpawners[0].spawnedCount, 2, 'spawner should recover its maxAlive slot after a spawned enemy dies');
equal(game.unitSpawners[0].spawnedEntityIds.length, 1, 'spawner tracking should discard the stale dead id');
assert(game.unitSpawners[0].spawnedEntityIds[0] !== firstSpawn, 'replacement should be a new live entity');

unitSpawnerSystem({ game, dt: 1 });
syncGameViews(game);
equal(game.unitSpawners[0].spawnedCount, 2, 'spawn limits should stop further emissions');
assert(game.unitSpawners[0].spawnedEntityIds.length <= 1, 'runtime spawners should track only their live spawned entities');

const fixtureHealth = getComponent(game.world, fixtureEntity, ComponentType.Health);
applyDamageToEntity(game.world, fixtureEntity, fixtureHealth.hp, game.dragonId, 'player_attack_destroyed_spawner_fixture');
deathLifecycleSystem({ game });
unitSpawnerSystem({ game, dt: 10 });
syncGameViews(game);
equal(game.unitSpawners[0].destroyed, true, 'destroyed fixture should mark the spawner destroyed');
equal(game.unitSpawners[0].enabled, false, 'destroyed fixture should disable further emissions');
equal(game.unitSpawnerFixtures[0].alive, false, 'fixture view should expose destroyed health state');
equal(aliveEnemyEntities(game).includes(fixtureEntity), false, 'destroyed spawner fixtures should leave player attack target queries');

function createLayerCamera(map) {
  const camera = createCamera({ clientWidth: 1280, clientHeight: 720 }, map);
  return {
    ...camera,
    visibleWorldBounds(paddingPx = 0) {
      const halfW = this.viewportW / (2 * this.zoom);
      const halfH = this.viewportH / (2 * this.zoom);
      return {
        left: this.x - halfW - paddingPx,
        top: this.y - halfH - paddingPx,
        right: this.x + halfW + paddingPx,
        bottom: this.y + halfH + paddingPx
      };
    }
  };
}
