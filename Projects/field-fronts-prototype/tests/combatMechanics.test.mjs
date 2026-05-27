import assert from 'node:assert/strict';

import {
  COMBAT_MODEL,
  advanceGameTick,
  createInitialGameState,
  createStructureNavigationSignature,
  recomputeGameState,
  spawnInfantrySquad,
  spawnWarriorSquad,
  summarizeCombat,
  summarizeGame
} from '../src/game/gameModel.js';
import { createBlankMap, setTile } from '../src/world/mapModel.js';
import { createStructureInstance } from '../src/game/structureRegistry.js';

export function run() {
  assertVolleyRequiresAimingBeforeFire();
  assertVolleySpawnsAndDamagesVisibleTargets();
  assertProjectileTravelDelaysDamageAndShowsImpactState();
  assertProjectileLocksAimPointAndCanMissMovingTarget();
  assertIncomingVolleyMarksTargetUnderFire();
  assertUnderFireSuppressesAimingAndAccuracy();
  assertProjectileBlockersPreventLineOfSight();
  assertHiddenTargetsDoNotAttractVolleyUntilDetected();
  assertProjectileCollidesWithNewBlockerInFlight();
  assertDestroyedProjectileBlockerEmitsNavigationChange();
  assertOutOfRangeTargetsDoNotFire();
  assertMeleeContactSuppressesVolleyAndDealsDamage();
  assertMeleeKillingBlowPublishesDeathEvent();
  assertDeathEventsUseOnDeathHookRecord();
  assertGarrisonedSquadsFireFromStructure();
  assertWallTopGarrisonFiresFromWallSegment();
  assertProjectileCapBoundsMassVolleys();
}

function assertVolleyRequiresAimingBeforeFire() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  const player = spawnInfantrySquad(game, map, { factionId: 'player' }).squad;
  const enemy = spawnInfantrySquad(game, map, { factionId: 'enemy', select: false }).squad;
  placeSquad(game, player.id, { x: 10, y: 12 });
  placeSquad(game, enemy.id, { x: 14, y: 12 }, {
    combat: { ...enemy.combat, enabled: false }
  });
  game.leaders = game.leaders.map((leader) => ({ ...leader, combat: { ...leader.combat, enabled: false } }));
  recomputeGameState(game, map);

  advanceGameTick(game, map);
  const aimingPlayer = game.squads.find((squad) => squad.id === player.id);
  assert.equal(game.projectiles.length, 0);
  assert.equal(aimingPlayer.combat.state, 'aiming');
  assert.equal(aimingPlayer.combat.aimTargetId, enemy.id);
  assert.equal(aimingPlayer.combat.lastVolleyOutcome, 'aiming');

  const arrow = advanceUntilProjectileFired(game, map, { sourceId: player.id, targetId: enemy.id });
  assert.ok(arrow);
}

function assertVolleySpawnsAndDamagesVisibleTargets() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  const player = spawnInfantrySquad(game, map, { factionId: 'player' }).squad;
  const enemy = spawnInfantrySquad(game, map, { factionId: 'enemy', select: false }).squad;
  placeSquad(game, player.id, { x: 10, y: 12 });
  placeSquad(game, enemy.id, { x: 14, y: 12 }, {
    combat: { ...enemy.combat, enabled: false }
  });
  game.leaders = game.leaders.map((leader) => ({ ...leader, combat: { ...leader.combat, enabled: false } }));
  recomputeGameState(game, map);

  advanceUntilProjectileFired(game, map, { sourceId: player.id, targetId: enemy.id });
  assert.equal(game.projectiles.some((projectile) => projectile.sourceId === player.id && projectile.targetId === enemy.id), true);
  assert.equal(game.projectiles.length <= COMBAT_MODEL.maxActiveProjectiles, true);
  const projectileSummary = summarizeGame(game).projectiles.find((projectile) => projectile.sourceId === player.id && projectile.targetId === enemy.id);
  assert.ok(projectileSummary.previousPosition);
  assert.ok(projectileSummary.origin);
  assert.equal(projectileSummary.state, 'flying');

  const before = game.squads.find((squad) => squad.id === enemy.id).health.health;
  advanceUntilProjectileHit(game, map);
  const after = game.squads.find((squad) => squad.id === enemy.id).health.health;
  assert.equal(after < before, true);
  assert.equal(summarizeCombat(game).projectileHits > 0, true);
  assert.equal(game.impactEvents.some((impact) => impact.entityId === enemy.id && impact.cause === 'arrow'), true);
  assert.equal(game.battlefieldTrace.bloodMarks.some((mark) => mark.kind === 'spatter'), true);
}

function assertProjectileTravelDelaysDamageAndShowsImpactState() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  const player = spawnInfantrySquad(game, map, { factionId: 'player' }).squad;
  const enemy = spawnInfantrySquad(game, map, { factionId: 'enemy', select: false }).squad;
  placeSquad(game, player.id, { x: 10, y: 12 }, {
    combat: { ...player.combat, rateOfFireTicks: 99, lastFiredTick: -99 }
  });
  placeSquad(game, enemy.id, { x: 14, y: 12 }, {
    combat: { ...enemy.combat, enabled: false }
  });
  game.leaders = game.leaders.map((leader) => ({ ...leader, combat: { ...leader.combat, enabled: false } }));
  recomputeGameState(game, map);

  advanceGameTick(game, map);
  assert.equal(game.projectiles.length, 0);
  assert.equal(game.squads.find((squad) => squad.id === player.id).combat.state, 'aiming');
  const before = game.squads.find((squad) => squad.id === enemy.id).health.health;
  advanceUntilProjectileFired(game, map, { sourceId: player.id, targetId: enemy.id });
  assert.equal(game.projectiles.every((projectile) => projectile.state === 'flying'), true);

  advanceGameTick(game, map);
  const during = game.squads.find((squad) => squad.id === enemy.id).health.health;
  assert.equal(during, before);
  assert.equal(game.projectiles.some((projectile) => projectile.position.x > projectile.origin.x), true);

  advanceUntilProjectileHit(game, map);
  const after = game.squads.find((squad) => squad.id === enemy.id).health.health;
  assert.equal(after < before, true);
  assert.equal(game.projectiles.some((projectile) => projectile.state === 'impacting'), true);
}


function assertProjectileLocksAimPointAndCanMissMovingTarget() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  const player = spawnInfantrySquad(game, map, { factionId: 'player' }).squad;
  const enemy = spawnInfantrySquad(game, map, { factionId: 'enemy', select: false }).squad;
  placeSquad(game, player.id, { x: 10, y: 12 }, {
    combat: { ...player.combat, rateOfFireTicks: 99, lastFiredTick: -99 }
  });
  placeSquad(game, enemy.id, { x: 14, y: 12 }, {
    combat: { ...enemy.combat, enabled: false }
  });
  game.leaders = game.leaders.map((leader) => ({ ...leader, combat: { ...leader.combat, enabled: false } }));
  recomputeGameState(game, map);

  const arrow = advanceUntilProjectileFired(game, map, { sourceId: player.id, targetId: enemy.id });
  assert.ok(arrow);
  const lockedAimPoint = { ...arrow.targetPosition };
  const beforeHealth = game.squads.find((squad) => squad.id === enemy.id).health.health;

  placeSquad(game, enemy.id, { x: 20, y: 12 }, {
    combat: { ...enemy.combat, enabled: false }
  });
  recomputeGameState(game, map);

  for (let tick = 0; tick < 10; tick += 1) {
    advanceGameTick(game, map);
    const inFlight = game.projectiles.find((projectile) => projectile.id === arrow.id);
    if (!inFlight) break;
    assert.deepEqual(inFlight.targetPosition, lockedAimPoint);
    if (inFlight.state === 'impacting') break;
  }

  const afterHealth = game.squads.find((squad) => squad.id === enemy.id).health.health;
  assert.equal(afterHealth, beforeHealth);
  assert.equal(summarizeCombat(game).projectileMisses > 0, true);
}

function assertIncomingVolleyMarksTargetUnderFire() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  const player = spawnInfantrySquad(game, map, { factionId: 'player' }).squad;
  const enemy = spawnInfantrySquad(game, map, { factionId: 'enemy', select: false }).squad;
  placeSquad(game, player.id, { x: 10, y: 12 });
  placeSquad(game, enemy.id, { x: 14, y: 12 }, {
    combat: { ...enemy.combat, enabled: false }
  });
  game.leaders = game.leaders.map((leader) => ({ ...leader, combat: { ...leader.combat, enabled: false } }));
  recomputeGameState(game, map);

  advanceUntilProjectileFired(game, map, { sourceId: player.id, targetId: enemy.id });

  const updatedEnemy = game.squads.find((squad) => squad.id === enemy.id);
  assert.equal(updatedEnemy.combat.incomingFireCount > 0, true);
  assert.equal(updatedEnemy.combat.underFireUntilTick > game.tick, true);
  assert.equal(updatedEnemy.combat.lastUnderFireFromId, player.id);
}

function assertUnderFireSuppressesAimingAndAccuracy() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  const player = spawnInfantrySquad(game, map, { factionId: 'player' }).squad;
  const enemy = spawnInfantrySquad(game, map, { factionId: 'enemy', select: false }).squad;
  placeSquad(game, player.id, { x: 10, y: 12 }, {
    combat: {
      ...player.combat,
      accuracy: 1,
      underFireUntilTick: 99,
      incomingFireCount: 4,
      lastUnderFireFromId: enemy.id
    }
  });
  placeSquad(game, enemy.id, { x: 13, y: 12 }, {
    combat: { ...enemy.combat, enabled: false }
  });
  game.leaders = game.leaders.map((leader) => ({ ...leader, combat: { ...leader.combat, enabled: false } }));
  recomputeGameState(game, map);

  advanceGameTick(game, map);
  const suppressedPlayer = game.squads.find((squad) => squad.id === player.id);
  assert.equal(suppressedPlayer.combat.state, 'suppressed');
  assert.equal(game.projectiles.length, 0);

  const arrow = advanceUntilProjectileFired(game, map, { sourceId: player.id, targetId: enemy.id });
  assert.equal(arrow.accuracy < 1, true);
}

function assertProjectileBlockersPreventLineOfSight() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  const player = spawnInfantrySquad(game, map, { factionId: 'player' }).squad;
  const enemy = spawnInfantrySquad(game, map, { factionId: 'enemy', select: false }).squad;
  placeSquad(game, player.id, { x: 10, y: 12 });
  placeSquad(game, enemy.id, { x: 15, y: 12 }, {
    combat: { ...enemy.combat, enabled: false }
  });
  game.leaders = game.leaders.map((leader) => ({ ...leader, combat: { ...leader.combat, enabled: false } }));
  game.structures.push(createStructureInstance('wall_segment', {
    id: 'los_wall_player_12_12',
    factionId: 'player',
    position: { x: 12, y: 12 },
    tile: { x: 12, y: 12 }
  }));
  recomputeGameState(game, map);

  advanceGameTick(game, map);
  assert.equal(game.projectiles.some((projectile) => projectile.sourceId === player.id && projectile.targetId === enemy.id), false);
  assert.equal(game.squads.find((squad) => squad.id === player.id).combat.lastBlockedReason, 'no-visible-target');
}


function assertHiddenTargetsDoNotAttractVolleyUntilDetected() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  setTile(map, 14, 12, 'forest');
  const game = createInitialGameState(map);
  const player = spawnInfantrySquad(game, map, { factionId: 'player' }).squad;
  const enemy = spawnInfantrySquad(game, map, { factionId: 'enemy', select: false }).squad;
  placeSquad(game, player.id, { x: 10, y: 12 }, {
    combat: { ...player.combat, lastFiredTick: -99, rateOfFireTicks: 1 }
  });
  placeSquad(game, enemy.id, { x: 14, y: 12 }, {
    combat: { ...enemy.combat, enabled: false }
  });
  game.leaders = game.leaders.map((leader) => ({ ...leader, combat: { ...leader.combat, enabled: false } }));
  recomputeGameState(game, map);

  assert.equal(game.squads.find((squad) => squad.id === enemy.id).stealth.visibleToPlayer, false);
  advanceGameTick(game, map);
  assert.equal(game.projectiles.some((projectile) => projectile.sourceId === player.id && projectile.targetId === enemy.id), false);

  placeSquad(game, player.id, { x: 13, y: 12 }, {
    combat: { ...player.combat, lastFiredTick: -99, rateOfFireTicks: 1 }
  });
  recomputeGameState(game, map);
  assert.equal(game.squads.find((squad) => squad.id === enemy.id).stealth.visibleToPlayer, true);
  const arrow = advanceUntilProjectileFired(game, map, { sourceId: player.id, targetId: enemy.id, maxTicks: 4 });
  assert.ok(arrow);
}

function assertProjectileCollidesWithNewBlockerInFlight() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  const player = spawnInfantrySquad(game, map, { factionId: 'player' }).squad;
  const enemy = spawnInfantrySquad(game, map, { factionId: 'enemy', select: false }).squad;
  placeSquad(game, player.id, { x: 10, y: 12 }, {
    combat: { ...player.combat, rateOfFireTicks: 99, lastFiredTick: -99 }
  });
  placeSquad(game, enemy.id, { x: 15, y: 12 }, {
    combat: { ...enemy.combat, enabled: false }
  });
  game.leaders = game.leaders.map((leader) => ({ ...leader, combat: { ...leader.combat, enabled: false } }));
  recomputeGameState(game, map);

  advanceUntilProjectileFired(game, map, { sourceId: player.id, targetId: enemy.id });
  assert.equal(game.projectiles.some((projectile) => projectile.targetId === enemy.id), true);
  const wall = createStructureInstance('wall_segment', {
    id: 'flight_wall_player_115_12',
    factionId: 'player',
    position: { x: 11.5, y: 12 },
    tile: { x: 12, y: 12 }
  });
  game.structures.push(wall);
  const wallBefore = wall.integrity.health;
  const enemyBefore = game.squads.find((squad) => squad.id === enemy.id).health.health;

  advanceUntilProjectileImpactsStructure(game, map, wall.id);

  const updatedWall = game.structures.find((structure) => structure.id === wall.id);
  const enemyAfter = game.squads.find((squad) => squad.id === enemy.id).health.health;
  assert.equal(updatedWall.integrity.health < wallBefore, true);
  assert.equal(enemyAfter, enemyBefore);
  assert.equal(game.projectiles.some((projectile) => projectile.state === 'impacting' && projectile.impactTargetId === wall.id), true);
}

function assertDestroyedProjectileBlockerEmitsNavigationChange() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  const player = spawnInfantrySquad(game, map, { factionId: 'player' }).squad;
  const enemy = spawnInfantrySquad(game, map, { factionId: 'enemy', select: false }).squad;
  placeSquad(game, player.id, { x: 10, y: 12 }, {
    combat: { ...player.combat, rateOfFireTicks: 99, lastFiredTick: -99 }
  });
  placeSquad(game, enemy.id, { x: 15, y: 12 }, {
    combat: { ...enemy.combat, enabled: false }
  });
  game.leaders = game.leaders.map((leader) => ({ ...leader, combat: { ...leader.combat, enabled: false } }));
  recomputeGameState(game, map);

  advanceUntilProjectileFired(game, map, { sourceId: player.id, targetId: enemy.id });
  assert.equal(game.projectiles.some((projectile) => projectile.targetId === enemy.id), true);
  const wall = createStructureInstance('wall_segment', {
    id: 'fragile_flight_wall_player_115_12',
    factionId: 'player',
    position: { x: 11.5, y: 12 },
    tile: { x: 12, y: 12 },
    integrity: { maxHealth: 1, health: 1 }
  });
  game.structures.push(wall);
  const beforeSignature = createStructureNavigationSignature(game);

  advanceUntilProjectileImpactsStructure(game, map, wall.id);

  const updatedWall = game.structures.find((structure) => structure.id === wall.id);
  const navEvent = game.events.find((event) => (
    event.type === 'structure:nav_changed' &&
    event.payload.reason === 'combat-structure-state'
  ));
  assert.equal(updatedWall.construction.state, 'ruined');
  assert.notEqual(createStructureNavigationSignature(game), beforeSignature);
  assert.ok(navEvent);
  assert.equal(navEvent.payload.beforeSignature, beforeSignature);
  assert.equal(game.dirty.nav, true);
  assert.equal(game.versions.nav > 0, true);
}

function assertOutOfRangeTargetsDoNotFire() {
  const map = createBlankMap({ width: 64, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  const player = spawnInfantrySquad(game, map, { factionId: 'player' }).squad;
  const enemy = spawnInfantrySquad(game, map, { factionId: 'enemy', select: false }).squad;
  placeSquad(game, player.id, { x: 4, y: 4 });
  placeSquad(game, enemy.id, { x: 58, y: 26 });
  game.leaders = game.leaders.map((leader) => ({ ...leader, combat: { ...leader.combat, enabled: false } }));
  recomputeGameState(game, map);

  advanceGameTick(game, map);
  assert.equal(game.projectiles.length, 0);
  assert.equal(game.squads.every((squad) => squad.combat.state !== 'firing'), true);
}


function assertMeleeContactSuppressesVolleyAndDealsDamage() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  const player = spawnWarriorSquad(game, map, { factionId: 'player' }).squad;
  const enemy = spawnWarriorSquad(game, map, { factionId: 'enemy', select: false }).squad;
  placeSquad(game, player.id, { x: 12, y: 12 }, {
    combat: { ...player.combat, lastMeleeTick: -99, lastFiredTick: -99 }
  });
  placeSquad(game, enemy.id, { x: 12.9, y: 12 }, {
    combat: { ...enemy.combat, enabled: false }
  });
  game.leaders = game.leaders.map((leader) => ({ ...leader, combat: { ...leader.combat, enabled: false } }));
  recomputeGameState(game, map);

  const before = game.squads.find((squad) => squad.id === enemy.id).health.health;
  advanceGameTick(game, map);
  const after = game.squads.find((squad) => squad.id === enemy.id).health.health;
  const updatedPlayer = game.squads.find((squad) => squad.id === player.id);

  assert.equal(game.projectiles.length, 0);
  assert.equal(after < before, true);
  assert.equal(updatedPlayer.combat.state, 'melee-strike');
  assert.equal(updatedPlayer.combat.engagedTargetId, enemy.id);
  assert.equal(summarizeCombat(game).meleeStrikes > 0, true);
}

function assertMeleeKillingBlowPublishesDeathEvent() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  const player = spawnWarriorSquad(game, map, { factionId: 'player' }).squad;
  const enemy = spawnWarriorSquad(game, map, { factionId: 'enemy', select: false }).squad;
  placeSquad(game, player.id, { x: 12, y: 12 }, {
    combat: { ...player.combat, meleeDamage: 40, lastMeleeTick: -99 }
  });
  placeSquad(game, enemy.id, { x: 12.8, y: 12 }, {
    health: { ...enemy.health, health: 10 },
    combat: { ...enemy.combat, enabled: false }
  });
  game.leaders = game.leaders.map((leader) => ({ ...leader, combat: { ...leader.combat, enabled: false } }));
  recomputeGameState(game, map);

  advanceGameTick(game, map);

  assert.equal(game.squads.some((squad) => squad.id === enemy.id), false);
  const death = game.deathEvents.find((event) => event.entityId === enemy.id);
  assert.ok(death);
  assert.equal(death.cause, 'melee');
  assert.equal(death.onDeath, 'leave-corpse-obstacle');
  assert.equal(death.deathState, 'fallen');
  assert.equal(near(death.position, { x: 12.8, y: 12 }, 0.35), true);
  assert.ok(game.corpses.some((corpse) => corpse.sourceEntityId === enemy.id && corpse.blocksMovement));
  assert.equal(death.sourceId, player.id);
  assert.equal(summarizeCombat(game).meleeKills > 0, true);
  assert.equal(game.events.some((event) => event.type === 'entity:died' && event.payload.entityId === enemy.id), true);
  assert.equal(game.battlefieldTrace.bloodMarks.some((mark) => mark.kind === 'pool'), true);
}

function assertDeathEventsUseOnDeathHookRecord() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  const player = spawnInfantrySquad(game, map, { factionId: 'player' }).squad;
  const enemy = spawnInfantrySquad(game, map, { factionId: 'enemy', select: false }).squad;
  placeSquad(game, player.id, { x: 10, y: 12 }, {
    combat: { ...player.combat, baseDamage: 80, accuracy: 1, rateOfFireTicks: 1, lastFiredTick: -99 }
  });
  placeSquad(game, enemy.id, { x: 13, y: 12 }, {
    health: { ...enemy.health, health: 24 },
    combat: { ...enemy.combat, enabled: false }
  });
  recomputeGameState(game, map);

  advanceUntilProjectileFired(game, map, { sourceId: player.id, targetId: enemy.id });
  advanceUntilProjectileHit(game, map);

  assert.equal(game.squads.some((squad) => squad.id === enemy.id), false);
  const death = game.deathEvents.find((event) => event.entityId === enemy.id);
  assert.ok(death);
  assert.equal(death.entityType, 'squad');
  assert.equal(death.onDeath, 'leave-corpse-obstacle');
  assert.equal(death.sourceId, player.id);
}

function assertGarrisonedSquadsFireFromStructure() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  const player = spawnInfantrySquad(game, map, { factionId: 'player' }).squad;
  const enemy = spawnInfantrySquad(game, map, { factionId: 'enemy', select: false }).squad;
  const outpost = game.structures.find((structure) => structure.factionId === 'player' && structure.type === 'outpost');

  game.structures = game.structures.map((structure) => structure.id === outpost.id
    ? { ...structure, occupancy: { ...structure.occupancy, occupants: [player.id] } }
    : structure);
  placeSquad(game, player.id, outpost.position, {
    occupancy: {
      state: 'occupied',
      structureId: outpost.id,
      assignedAtTick: 0,
      enteredAtTick: 0
    }
  });
  placeSquad(game, enemy.id, { x: outpost.position.x + 4, y: outpost.position.y }, {
    combat: { ...enemy.combat, enabled: false }
  });
  recomputeGameState(game, map);

  const arrow = advanceUntilProjectileFired(game, map, { sourceId: player.id });
  assert.ok(arrow);
  assert.equal(arrow.sourceStructureId, outpost.id);
  assert.equal(near(arrow.origin, outpost.position), true);
}

function assertWallTopGarrisonFiresFromWallSegment() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  const player = spawnInfantrySquad(game, map, { factionId: 'player' }).squad;
  const enemy = spawnInfantrySquad(game, map, { factionId: 'enemy', select: false }).squad;
  const wall = createStructureInstance('wall_segment', {
    id: 'occupied_wall_player_12_12',
    factionId: 'player',
    position: { x: 12, y: 12 },
    tile: { x: 12, y: 12 },
    occupancy: { occupants: [player.id] }
  });
  game.structures.push(wall);
  placeSquad(game, player.id, wall.position, {
    occupancy: {
      state: 'occupied',
      structureId: wall.id,
      assignedAtTick: 0,
      enteredAtTick: 0
    }
  });
  placeSquad(game, enemy.id, { x: 16, y: 12 }, {
    combat: { ...enemy.combat, enabled: false }
  });
  game.leaders = game.leaders.map((leader) => ({ ...leader, combat: { ...leader.combat, enabled: false } }));
  recomputeGameState(game, map);

  const arrow = advanceUntilProjectileFired(game, map, { sourceId: player.id, targetId: enemy.id });
  assert.equal(arrow.sourceStructureId, wall.id);
  assert.equal(near(arrow.origin, wall.position), true);
}

function assertProjectileCapBoundsMassVolleys() {
  const map = createBlankMap({ width: 64, height: 40, fill: 'land' });
  const game = createInitialGameState(map);
  game.leaders = game.leaders.map((leader) => ({ ...leader, combat: { ...leader.combat, enabled: false } }));

  for (let index = 0; index < 90; index += 1) {
    const player = spawnInfantrySquad(game, map, { factionId: 'player', select: false }).squad;
    const enemy = spawnInfantrySquad(game, map, { factionId: 'enemy', select: false }).squad;
    const row = index % 15;
    const col = Math.floor(index / 15);
    placeSquad(game, player.id, { x: 12 + col * 0.12, y: 8 + row * 1.4 });
    placeSquad(game, enemy.id, { x: 16 + col * 0.12, y: 8 + row * 1.4 }, {
      combat: { ...enemy.combat, enabled: false }
    });
  }
  recomputeGameState(game, map);
  advanceGameTick(game, map);
  advanceGameTick(game, map);

  assert.equal(game.projectiles.length > 0, true);
  assert.equal(game.projectiles.length <= COMBAT_MODEL.maxActiveProjectiles, true);
  assert.equal(summarizeCombat(game).activeProjectiles <= COMBAT_MODEL.maxActiveProjectiles, true);
}



function advanceUntilProjectileFired(game, map, { sourceId = null, targetId = null, maxTicks = 8 } = {}) {
  const existingIds = new Set((game.projectiles ?? []).map((projectile) => projectile.id));
  for (let tick = 0; tick < maxTicks; tick += 1) {
    advanceGameTick(game, map);
    const arrow = (game.projectiles ?? []).find((projectile) => (
      !existingIds.has(projectile.id) &&
      (!sourceId || projectile.sourceId === sourceId) &&
      (!targetId || projectile.targetId === targetId)
    ));
    if (arrow) return arrow;
  }
  assert.fail('Expected projectile to fire after bounded aiming window');
}


function advanceUntilProjectileImpactsStructure(game, map, structureId, maxTicks = 8) {
  for (let tick = 0; tick < maxTicks; tick += 1) {
    advanceGameTick(game, map);
    const impacted = (game.projectiles ?? []).some((projectile) => (
      projectile.state === 'impacting' && projectile.impactTargetId === structureId
    ));
    if (impacted) return tick + 1;
  }
  assert.fail(`Expected projectile to impact structure ${structureId}`);
}

function advanceUntilProjectileHit(game, map, maxTicks = 12) {
  const beforeHits = summarizeCombat(game).projectileHits;
  for (let tick = 0; tick < maxTicks; tick += 1) {
    advanceGameTick(game, map);
    if (summarizeCombat(game).projectileHits > beforeHits) {
      return tick + 1;
    }
  }
  assert.fail('Expected projectile hit within bounded combat travel window');
}

function placeSquad(game, id, position, overrides = {}) {
  game.squads = game.squads.map((squad) => squad.id === id
    ? {
      ...squad,
      ...overrides,
      position: { x: position.x, y: position.y },
      tile: { x: Math.round(position.x), y: Math.round(position.y) },
      movement: {
        ...squad.movement,
        status: 'idle',
        target: { x: position.x, y: position.y },
        speedTilesPerTick: 0,
        speedKph: 0,
        distanceToTarget: 0,
        lastStepTiles: 0
      },
      movementOrder: null,
      movementPath: null
    }
    : squad);
}

function near(a, b, epsilon = 0.001) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= epsilon;
}
