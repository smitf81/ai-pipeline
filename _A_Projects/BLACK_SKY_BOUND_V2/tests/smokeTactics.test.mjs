import { assert, equal } from './assert.mjs';
import { ComponentType } from '../src/constants/componentTypes.js';
import { EnemyPressureState } from '../src/constants/enemyPressureStates.js';
import { EntityKind } from '../src/constants/entityKinds.js';
import { EventType } from '../src/constants/eventTypes.js';
import { EnemyAttackPhase } from '../src/data/enemyAttackProfiles.js';
import { SMOKE_TACTICS } from '../src/data/smokeTactics.js';
import { SmokeSourceKind } from '../src/data/smokeSources.js';
import { getComponent, removeEntity } from '../src/ecs/world.js';
import { query } from '../src/ecs/query.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { spawnActor, spawnSmokeCloud } from '../src/game/spawn.js';
import { enemyAttackSystem } from '../src/systems/enemyAttackSystem.js';
import { enemyPressureSystem } from '../src/systems/enemyPressureSystem.js';
import { findDragonSmokeConcealment } from '../src/systems/smokeSystem.js';
import { createDemoMap } from '../src/world/map.js';
import { TerrainType } from '../src/world/terrain.js';

const pursuit = createHarness(0.96);
enemyPressureSystem({ game: pursuit.game, map: pursuit.map, dt: 0 });
equal(pursuit.ai.targetId, pursuit.player, 'enemy should acquire the visible player before smoke is deployed');
equal(pursuit.ai.attackPhase, EnemyAttackPhase.WINDUP, 'enemy should commit its normal profiled attack before the smoke break');
const hpBeforeBreak = pursuit.playerHealth.hp;
spawnTacticalSmoke(pursuit.game, pursuit.playerTransform.x, pursuit.playerTransform.y);
const concealment = findDragonSmokeConcealment(
  pursuit.game,
  pursuit.playerTransform.x,
  pursuit.playerTransform.y,
  { minimumDensity: SMOKE_TACTICS.concealmentDensityThreshold }
);
equal(concealment?.sourceKind, SmokeSourceKind.DRAGON_SMOKE_PLUME, 'dense dragon smoke should expose the canonical concealment query');
const positionBeforeSearch = { x: pursuit.enemyTransform.x, y: pursuit.enemyTransform.y };
enemyPressureSystem({ game: pursuit.game, map: pursuit.map, dt: 0.08 });
equal(pursuit.ai.state, EnemyPressureState.SEARCH, 'dragon smoke should move a pursuing enemy into explicit search');
equal(pursuit.ai.targetId, null, 'smoke search should clear the hostile target lock');
equal(pursuit.ai.attackPhase, EnemyAttackPhase.IDLE, 'smoke should cancel a committed enemy attack before it resolves');
equal(pursuit.ai.smokeBreakCount, 1, 'the canonical AI should count the pursuit break once');
equal(pursuit.ai.smokeSearchCenterX, pursuit.playerTransform.x, 'search should preserve the last-known player x');
equal(pursuit.ai.smokeSearchCenterY, pursuit.playerTransform.y, 'search should preserve the last-known player y');
assert(pursuit.ai.smokeSearchTimer > 2, 'search should provide a meaningful reposition window');
assert(
  Math.hypot(pursuit.enemyTransform.x - positionBeforeSearch.x, pursuit.enemyTransform.y - positionBeforeSearch.y) > 0,
  'searching enemy should actively sweep around the last-known position'
);
enemyAttackSystem({ game: pursuit.game, dt: 1 });
equal(pursuit.playerHealth.hp, hpBeforeBreak, 'a smoke-cancelled windup must not leak delayed damage');
equal(
  pursuit.game.world.events.filter((event) => event.type === EventType.SMOKE_PURSUIT_BROKEN).length,
  1,
  'one semantic smoke pursuit-break event should be emitted'
);
assert(
  query(pursuit.game.world, [ComponentType.Effect])
    .some((entity) => getComponent(pursuit.game.world, entity, ComponentType.Effect)?.kind === 'smoke_pursuit_break'),
  'pursuit break should create bounded player-facing visual feedback'
);

enemyPressureSystem({ game: pursuit.game, map: pursuit.map, dt: 0.9 });
equal(pursuit.ai.targetId, null, 'enemy should not immediately reacquire during the smoke reposition window');
removeSmoke(pursuit.game);
enemyPressureSystem({ game: pursuit.game, map: pursuit.map, dt: 2.5 });
equal(pursuit.ai.targetId, pursuit.player, 'enemy should recover and reacquire after the bounded search expires');

const closeContact = createHarness(SMOKE_TACTICS.closeRevealDistanceTiles - 0.08);
spawnTacticalSmoke(closeContact.game, closeContact.playerTransform.x, closeContact.playerTransform.y);
enemyPressureSystem({ game: closeContact.game, map: closeContact.map, dt: 0 });
equal(closeContact.ai.targetId, closeContact.player, 'close-contact reveal should prevent smoke invulnerability');
equal(closeContact.ai.smokeBreakCount, 0, 'close-contact reveal should not register a pursuit break');

const environmental = createHarness(0.96);
enemyPressureSystem({ game: environmental.game, map: environmental.map, dt: 0 });
spawnSmokeCloud(environmental.game.world, environmental.playerTransform.x, environmental.playerTransform.y, {
  radius: 1.3,
  duration: 3,
  slowMultiplier: 0.8,
  density: 1,
  sourceKind: SmokeSourceKind.TORCH_WISP
});
enemyPressureSystem({ game: environmental.game, map: environmental.map, dt: 0.08 });
equal(environmental.ai.state, EnemyPressureState.ATTACK, 'environmental smoke must not become a competing stealth source');
equal(environmental.ai.smokeBreakCount, 0, 'environmental smoke should not register player smoke tactics');

const thinSmoke = createHarness(0.96);
enemyPressureSystem({ game: thinSmoke.game, map: thinSmoke.map, dt: 0 });
spawnSmokeCloud(thinSmoke.game.world, thinSmoke.playerTransform.x, thinSmoke.playerTransform.y, {
  radius: 1.3,
  duration: 3,
  slowMultiplier: 0.42,
  density: SMOKE_TACTICS.concealmentDensityThreshold * 0.5,
  sourceKind: SmokeSourceKind.DRAGON_SMOKE_PLUME
});
enemyPressureSystem({ game: thinSmoke.game, map: thinSmoke.map, dt: 0.08 });
equal(thinSmoke.ai.smokeBreakCount, 0, 'faded or thin dragon smoke should not break pursuit');

function createHarness(distance) {
  const map = createDemoMap(30, 30);
  map.enemySpawns = [];
  map.unitPlacements = [];
  map.unitSpawners = [];
  map.sceneObjects = [];
  map.tiles = Array.from({ length: map.height }, () => Array.from({ length: map.width }, () => TerrainType.GRASS));
  const game = createInitialGameState(map);
  const player = game.dragonId;
  const playerTransform = getComponent(game.world, player, ComponentType.Transform);
  const playerHealth = getComponent(game.world, player, ComponentType.Health);
  playerTransform.x = 10;
  playerTransform.y = 10;
  const enemy = spawnActor(game.world, EntityKind.RAIDER, 10 + distance, 10);
  const enemyTransform = getComponent(game.world, enemy, ComponentType.Transform);
  const ai = getComponent(game.world, enemy, ComponentType.EnemyPressureAI);
  ai.decisionCooldown = 0;
  return { game, map, player, playerTransform, playerHealth, enemy, enemyTransform, ai };
}

function spawnTacticalSmoke(game, x, y) {
  return spawnSmokeCloud(game.world, x, y, {
    radius: 0.72,
    duration: 3,
    slowMultiplier: 0.42,
    density: 1,
    opacity: 1,
    sourceKind: SmokeSourceKind.DRAGON_SMOKE_PLUME
  });
}

function removeSmoke(game) {
  for (const entity of query(game.world, [ComponentType.SmokeCloud])) removeEntity(game.world, entity);
}
