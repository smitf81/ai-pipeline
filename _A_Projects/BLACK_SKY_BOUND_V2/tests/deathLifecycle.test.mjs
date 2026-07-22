import { assert, equal } from './assert.mjs';
import { ComponentType } from '../src/constants/componentTypes.js';
import { EntityKind } from '../src/constants/entityKinds.js';
import { EventType } from '../src/constants/eventTypes.js';
import { Faction } from '../src/constants/factions.js';
import { CONFIG } from '../src/config.js';
import { ScenarioPhase } from '../src/constants/scenarioPhases.js';
import { DEATH_AFTERMATH_CAP } from '../src/data/deathAftermath.js';
import { PlayerLifecycleState, PLAYER_LIFECYCLE_PROFILE } from '../src/data/playerLifecycle.js';
import { getComponent, hasComponent } from '../src/ecs/world.js';
import { query } from '../src/ecs/query.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { buildCorpseViews, syncGameViews } from '../src/game/selectors.js';
import { spawnActor } from '../src/game/spawn.js';
import { buildCorpseDecalProjection } from '../src/projection/corpseAftermathProjection.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { WebGLDecalLayer } from '../src/render/backends/webgl/layers/WebGLDecalLayer.js';
import { beginEnemyAttack } from '../src/systems/enemyAttackSystem.js';
import { findNearestHostileEntity } from '../src/systems/enemyPressureSystem.js';
import { deathLifecycleSystem } from '../src/systems/deathLifecycleSystem.js';
import { applyDamageToEntity } from '../src/systems/healthSystem.js';
import { getCorpseSlowdownMultiplier, moveEntityOnMap } from '../src/systems/movementSystem.js';
import { scenarioSystem } from '../src/systems/scenarioSystem.js';
import { createDemoMap } from '../src/world/map.js';

const map = createDemoMap();
map.enemySpawns = [];
map.unitPlacements = [];
const game = createInitialGameState(map);
const raider = spawnActor(game.world, EntityKind.RAIDER, 8, 8, Faction.RAIDERS);
const attacker = spawnActor(game.world, EntityKind.HUSK, 8.4, 8, Faction.HUSKS);
const raiderTransform = getComponent(game.world, raider, ComponentType.Transform);
raiderTransform.rotation = 0.63;
const attackerAI = getComponent(game.world, attacker, ComponentType.EnemyPressureAI);
attackerAI.targetId = raider;
assert(beginEnemyAttack(game.world, attacker, attackerAI, raider), 'hostile attacker should begin a windup against the live target');

const raiderHealth = getComponent(game.world, raider, ComponentType.Health);
assert(applyDamageToEntity(game.world, raider, raiderHealth.hp + 1, game.dragonId, 'death_lifecycle_test'), 'lethal damage should report a kill');
assert(!applyDamageToEntity(game.world, raider, 1, game.dragonId, 'duplicate_damage'), 'damage against an already dead entity should not emit another kill');
equal(game.world.events.filter((event) => event.type === EventType.ENTITY_DIED && event.payload.entity === raider).length, 1, 'alive-to-dead transition should emit exactly one death event');

deathLifecycleSystem({ game });
deathLifecycleSystem({ game });
const deathState = getComponent(game.world, raider, ComponentType.DeathState);
assert(deathState?.handled, 'dead actor should retain a one-shot lifecycle receipt');
assert(!hasComponent(game.world, raider, ComponentType.EnemyPressureAI), 'dead actor should lose enemy thinking authority');
assert(!hasComponent(game.world, raider, ComponentType.Motion), 'dead actor should lose live movement authority');
assert(!hasComponent(game.world, raider, ComponentType.Cooldowns), 'dead actor should lose live attack cooldown state');
equal(attackerAI.targetId, null, 'other enemies should clear a dead target immediately');
equal(attackerAI.pendingAttackTargetId, null, 'windups should clear their dead pending target');
equal(attackerAI.attackPhase, 'idle', 'windup against a dead target should safely cancel');

let corpses = query(game.world, [ComponentType.Corpse, ComponentType.Transform]);
equal(corpses.length, 1, 'one death should create exactly one aftermath entity');
const corpseEntity = corpses[0];
const corpse = getComponent(game.world, corpseEntity, ComponentType.Corpse);
const corpseTransform = getComponent(game.world, corpseEntity, ComponentType.Transform);
equal(corpse.sourceEntityId, raider, 'aftermath should preserve source provenance');
equal(corpse.profileId, 'raider_fallen_body', 'raider should use the raider corpse silhouette');
equal(corpseTransform.rotation, 0.63, 'corpse should preserve final actor orientation');
assert(!hasComponent(game.world, corpseEntity, ComponentType.Health), 'corpse should not be damageable');
assert(!hasComponent(game.world, corpseEntity, ComponentType.Team), 'corpse should not join faction targeting');
assert(!hasComponent(game.world, corpseEntity, ComponentType.EnemyPressureAI), 'corpse should never retain live AI');

syncGameViews(game);
const projected = buildCorpseDecalProjection(buildCorpseViews(game), 32);
equal(projected.length, 2, 'each aftermath entity should project one blood pool and one body');
assert(projected.some((packet) => packet.visualRole === 'corpse_body' && packet.corpseProfileId === 'raider_fallen_body'), 'projection should expose the raider body silhouette packet');
assert(projected.some((packet) => packet.visualMaterial === 'residual_blood_spatter_stain_v0'), 'projection should expose a blood-pool decal packet');

const decalLayer = new WebGLDecalLayer();
decalLayer.update({ decals: projected, groundHazards: [] }, {
  camera: { visibleWorldBounds: () => ({ left: 0, top: 0, right: 640, bottom: 640 }) },
  lightSpaceCulling: { enabled: false }
});
equal(decalLayer.statsFields().corpseCount, 1, 'WebGL decal layer should recognize one corpse body');
assert(decalLayer.triangles.length >= 20, 'corpse body should render as a readable multi-part silhouette, not a generic radial blob');
assert(decalLayer.statsFields().bloodStainCount === 1, 'corpse blood should use the existing bounded stain renderer');

const profileIds = new Set([corpse.profileId]);
for (const [kind, team, x] of [
  [EntityKind.HUSK, Faction.HUSKS, 10],
  [EntityKind.WEREWOLF, Faction.WOLVES, 12]
]) {
  const entity = spawnActor(game.world, kind, x, 8, team);
  const health = getComponent(game.world, entity, ComponentType.Health);
  applyDamageToEntity(game.world, entity, health.hp, game.dragonId, 'profile_test');
  deathLifecycleSystem({ game });
  const death = getComponent(game.world, entity, ComponentType.DeathState);
  profileIds.add(getComponent(game.world, death.aftermathEntityId, ComponentType.Corpse).profileId);
}
equal(profileIds.size, 3, 'raider, husk, and werewolf deaths should use distinct corpse profiles');

const huskMover = spawnActor(game.world, EntityKind.HUSK, corpseTransform.x, corpseTransform.y, Faction.HUSKS);
const dragonTransform = getComponent(game.world, game.dragonId, ComponentType.Transform);
dragonTransform.x = corpseTransform.x;
dragonTransform.y = corpseTransform.y;
const huskSlowdown = getCorpseSlowdownMultiplier(game.world, huskMover, corpseTransform.x, corpseTransform.y);
const dragonSlowdown = getCorpseSlowdownMultiplier(game.world, game.dragonId, corpseTransform.x, corpseTransform.y);
assert(huskSlowdown >= 0.75 && huskSlowdown < 1, 'light unit should receive a mild corpse-area slowdown');
assert(dragonSlowdown > huskSlowdown && dragonSlowdown < 1, 'heavier player should be slowed less but still feel the corpse area');
const moverTransform = getComponent(game.world, huskMover, ComponentType.Transform);
const beforeMove = moverTransform.x;
assert(moveEntityOnMap(game.world, huskMover, 1, 0, 0.1, map), 'corpse slowdown should not hard-block movement');
assert(moverTransform.x > beforeMove, 'slowed unit should continue moving through the corpse');
equal(getComponent(game.world, huskMover, ComponentType.Motion).corpseSlowdownMultiplier, huskSlowdown, 'movement should publish its applied corpse multiplier');

for (let index = 0; index < DEATH_AFTERMATH_CAP + 3; index += 1) {
  const entity = spawnActor(game.world, EntityKind.HUSK, 14 + (index % 3) * 0.2, 9, Faction.HUSKS);
  const health = getComponent(game.world, entity, ComponentType.Health);
  applyDamageToEntity(game.world, entity, health.hp, game.dragonId, 'cap_test');
  deathLifecycleSystem({ game });
}
corpses = query(game.world, [ComponentType.Corpse]);
equal(corpses.length, DEATH_AFTERMATH_CAP, 'corpse aftermath should remain bounded');
assert(!game.world.entities.has(corpseEntity), 'oldest corpse should be culled first at the cap');

const respawnMap = createDemoMap();
respawnMap.enemySpawns = [];
respawnMap.unitPlacements = [];
const respawnGame = createInitialGameState(respawnMap);
const player = respawnGame.dragonId;
const playerTransform = getComponent(respawnGame.world, player, ComponentType.Transform);
const playerHealth = getComponent(respawnGame.world, player, ComponentType.Health);
const playerStamina = getComponent(respawnGame.world, player, ComponentType.Stamina);
const playerCooldowns = getComponent(respawnGame.world, player, ComponentType.Cooldowns);
const playerIntent = getComponent(respawnGame.world, player, ComponentType.PlayerIntent);
const playerImpact = getComponent(respawnGame.world, player, ComponentType.ImpactResponse);
const lifecycle = getComponent(respawnGame.world, player, ComponentType.PlayerLifecycle);
const wakingAttacker = spawnActor(respawnGame.world, EntityKind.RAIDER, respawnMap.spawn.x + 1.2, respawnMap.spawn.y + 0.5, Faction.RAIDERS);
playerTransform.x = 18;
playerTransform.y = 18;
playerStamina.current = 3;
playerStamina.sprinting = true;
playerStamina.exhausted = true;
playerStamina.state = 'exhausted';
playerCooldowns.bite = 4;
playerCooldowns.lunge = 4;
playerCooldowns.smoke = 4;
playerIntent.moveX = 1;
playerIntent.lunge = true;
playerImpact.knockbackVelocityX = 2;
playerImpact.staggerTimer = 0.8;

assert(applyDamageToEntity(respawnGame.world, player, playerHealth.hp + 1, wakingAttacker, 'player_respawn_test'), 'lethal player damage should still emit a death event');
deathLifecycleSystem({ game: respawnGame, map: respawnMap, dt: 0 });
scenarioSystem({ game: respawnGame, map: respawnMap });
equal(respawnGame.status, ScenarioPhase.PLAYING, 'player lifecycle death should keep the scenario update loop alive for respawn');
equal(lifecycle.state, PlayerLifecycleState.DEATH_FADE, 'player death should enter the canonical death fade state');
assert(hasComponent(respawnGame.world, player, ComponentType.PlayerControlled), 'player death should not strip player control authority permanently');
assert(hasComponent(respawnGame.world, player, ComponentType.Motion), 'player death should preserve movement authority for respawn reset');
assert(!getComponent(respawnGame.world, player, ComponentType.DeathState), 'player death should not use enemy corpse death receipt as its lifecycle owner');
equal(query(respawnGame.world, [ComponentType.Corpse]).length, 0, 'player death should not create a corpse aftermath entity');
equal(playerIntent.moveX, 0, 'death fade should immediately zero movement intent');
equal(playerIntent.lunge, false, 'death fade should immediately zero action intent');

const deathProjection = buildRenderProjection({
  game: syncGameViews(respawnGame),
  map: respawnMap,
  camera: fallbackCamera(),
  time: 0
}, CONFIG);
equal(deathProjection.playerLifecycle.overlay.state, PlayerLifecycleState.DEATH_FADE, 'render projection should expose death-fade overlay ownership');
assert(deathProjection.playerLifecycle.overlay.opacityPolicy.includes('not_health_pressure'), 'death/wake overlay should not borrow health-pressure opacity ownership');

deathLifecycleSystem({ game: respawnGame, map: respawnMap, dt: PLAYER_LIFECYCLE_PROFILE.deathFadeSeconds + 0.01 });
equal(lifecycle.state, PlayerLifecycleState.RESPAWN_PENDING, 'death fade completion should advance to respawn pending');
deathLifecycleSystem({ game: respawnGame, map: respawnMap, dt: PLAYER_LIFECYCLE_PROFILE.respawnPendingSeconds + 0.01 });
equal(lifecycle.state, PlayerLifecycleState.WAKING, 'respawn should advance into waking after the pending hold');
equal(playerHealth.alive, true, 'canonical respawn should restore player health alive state');
equal(playerHealth.hp, playerHealth.maxHp, 'canonical respawn should restore configured health');
equal(playerHealth.pressure, 0, 'canonical respawn should clear health pressure');
equal(playerStamina.current, playerStamina.max, 'canonical respawn should restore configured stamina');
equal(playerStamina.state, 'ready', 'canonical respawn should reset stamina state');
equal(playerCooldowns.bite, 0, 'canonical respawn should clear bite cooldown');
equal(playerCooldowns.lunge, 0, 'canonical respawn should clear lunge cooldown');
equal(playerCooldowns.smoke, 0, 'canonical respawn should clear smoke cooldown');
equal(playerImpact.knockbackVelocityX, 0, 'canonical respawn should clear knockback velocity');
equal(playerImpact.staggerTimer, 0, 'canonical respawn should clear stagger state');
equal(Number(playerTransform.x.toFixed(2)), respawnMap.spawn.x + 0.5, 'canonical respawn should move player to scenario spawn x');
equal(Number(playerTransform.y.toFixed(2)), respawnMap.spawn.y + 0.5, 'canonical respawn should move player to scenario spawn y');
equal(lifecycle.respawnCount, 1, 'canonical respawn should count completed respawns');
equal(findNearestHostileEntity(respawnGame.world, wakingAttacker, 8), null, 'enemies should ignore a waking non-interactive player');

const wakingStartProjection = buildRenderProjection({
  game: syncGameViews(respawnGame),
  map: respawnMap,
  camera: fallbackCamera(),
  time: 0
}, CONFIG);
assert(wakingStartProjection.playerLifecycle.overlay.opacity > 0.75, 'wake overlay should start mostly dark');
deathLifecycleSystem({ game: respawnGame, map: respawnMap, dt: PLAYER_LIFECYCLE_PROFILE.wakeSeconds * PLAYER_LIFECYCLE_PROFILE.controlReturnAt + 0.02 });
assert(lifecycle.controlSuppressed === false, 'controls should return after the configured wake point');
assert(findNearestHostileEntity(respawnGame.world, wakingAttacker, 8) === player, 'enemies may retarget once the player is interactive again');
deathLifecycleSystem({ game: respawnGame, map: respawnMap, dt: PLAYER_LIFECYCLE_PROFILE.wakeSeconds });
equal(lifecycle.state, PlayerLifecycleState.ALIVE, 'wake completion should return to alive state');
const awakeProjection = buildRenderProjection({
  game: syncGameViews(respawnGame),
  map: respawnMap,
  camera: fallbackCamera(),
  time: 2
}, CONFIG);
equal(awakeProjection.playerLifecycle.overlay.opacity, 0, 'wake overlay should clear completely');

function fallbackCamera() {
  return {
    x: 0,
    y: 0,
    zoom: 1,
    viewportW: 1280,
    viewportH: 720,
    visibleWorldBounds() {
      return { left: 0, top: 0, right: 1280, bottom: 720 };
    }
  };
}
