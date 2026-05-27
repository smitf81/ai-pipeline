import assert from 'node:assert/strict';
import { createBlankMap, setTile } from '../src/world/mapModel.js';
import { placeSceneEntity } from '../src/world/sceneEntity.js';
import { createInitialGameState, advanceGameTick, recomputeGameState, setPlayerPressureStance } from '../src/game/gameModel.js';
import { canObserverDetectEntity, deriveUnitStealthState, getMobilityProfile } from '../src/game/coverSystem.js';
import { collectCorpseStacks, createCorpseFromDeathEvent, normaliseCorpses, summarizeCorpses } from '../src/game/corpseSystem.js';

export function run() {
  assertForestCoverCanHideAnUndetectedEnemy();
  assertAuthoredCoverAndCorpseStacksFeedCanonicalCoverState();
  assertQuietMoveUsesCrouchedMobilityAndSlowerMovement();
}

function assertForestCoverCanHideAnUndetectedEnemy() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  setTile(map, 14, 10, 'forest');
  const game = createInitialGameState(map);

  game.leaders = game.leaders.map((leader) => {
    if (leader.factionId === 'player') {
      return { ...leader, tile: { x: 5, y: 10 }, position: { x: 5, y: 10 }, sightRadius: 6 };
    }
    return { ...leader, tile: { x: 14, y: 10 }, position: { x: 14, y: 10 }, sightRadius: 6 };
  });

  recomputeGameState(game, map);
  const player = game.leaders.find((leader) => leader.factionId === 'player');
  const enemy = game.leaders.find((leader) => leader.factionId === 'enemy');

  assert.equal(enemy.stealth.coverState, 'hidden');
  assert.equal(enemy.stealth.coverKind, 'vegetation');
  assert.equal(enemy.stealth.visibleToPlayer, false, 'hidden enemies should not render/target as player-visible when no observer detects them');
  assert.equal(canObserverDetectEntity(player, enemy), false);

  const nearbyPlayer = { ...player, position: { x: 13, y: 10 }, tile: { x: 13, y: 10 } };
  assert.equal(canObserverDetectEntity(nearbyPlayer, enemy), true, 'close observers should reveal nearby hidden targets');

  const direct = deriveUnitStealthState(game, map, enemy);
  assert.ok(direct.concealment >= 0.62);
}


function assertAuthoredCoverAndCorpseStacksFeedCanonicalCoverState() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  placeSceneEntity(map, 'cover', { x: 11, y: 10 });
  const game = createInitialGameState(map);

  const enemyId = game.leaders.find((leader) => leader.factionId === 'enemy').id;
  game.leaders = game.leaders.map((leader) => leader.id === enemyId
    ? { ...leader, tile: { x: 11, y: 10 }, position: { x: 11, y: 10 } }
    : { ...leader, tile: { x: 3, y: 10 }, position: { x: 3, y: 10 } });

  recomputeGameState(game, map);
  const authoredEnemy = game.leaders.find((leader) => leader.id === enemyId);
  assert.equal(authoredEnemy.stealth.coverKind, 'barricade');
  assert.equal(authoredEnemy.stealth.coverState, 'hidden');

  game.corpses = Array.from({ length: 4 }, (_, index) => createCorpseFromDeathEvent({
    entityId: `fallen_cover_source_${index + 1}`,
    entityType: 'squad',
    factionId: 'enemy',
    position: { x: 19, y: 11 },
    tile: { x: 19, y: 11 },
    tick: index,
    sourceId: 'test',
    cause: 'melee',
    onDeath: 'leave-corpse-obstacle'
  }));
  game.leaders = game.leaders.map((leader) => leader.id === enemyId
    ? { ...leader, tile: { x: 19, y: 11 }, position: { x: 19, y: 11 } }
    : leader);

  recomputeGameState(game, map);
  const corpseCoveredEnemy = game.leaders.find((leader) => leader.id === enemyId);
  assert.equal(corpseCoveredEnemy.stealth.coverKind, 'body_pile');
  assert.ok(['in_cover', 'hidden'].includes(corpseCoveredEnemy.stealth.coverState));

  const persistentPile = Array.from({ length: 140 }, (_, index) => createCorpseFromDeathEvent({
    entityId: `fallen_persistent_source_${index + 1}`,
    entityType: 'squad',
    factionId: 'enemy',
    position: { x: 20, y: 11 },
    tile: { x: 20, y: 11 },
    tick: index
  }));
  game.corpses = normaliseCorpses(persistentPile);
  assert.equal(game.corpses.length, 1, 'bodies at one site should compact into a single persistent environment record');
  assert.equal(collectCorpseStacks(game)[0].count, 140, 'compaction should retain the full body-wall count');
  assert.equal(summarizeCorpses(game).total, 140, 'summary should report casualties rather than occupied corpse tiles');
}

function assertQuietMoveUsesCrouchedMobilityAndSlowerMovement() {
  const normalMap = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const normalGame = createInitialGameState(normalMap);
  setPlayerPressureStance(normalGame, normalMap, 'commit');
  advanceGameTick(normalGame, normalMap);
  const normalLeader = normalGame.leaders.find((leader) => leader.factionId === 'player');

  const quietMap = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const quietGame = createInitialGameState(quietMap);
  quietGame.leaders = quietGame.leaders.map((leader) => leader.factionId === 'player'
    ? {
      ...leader,
      behavior: {
        ...(leader.behavior ?? {}),
        stance: 'commit',
        intent: 'quiet_move',
        lastDecision: 'Testing cautious crouched movement'
      }
    }
    : leader);
  advanceGameTick(quietGame, quietMap);
  const quietLeader = quietGame.leaders.find((leader) => leader.factionId === 'player');

  assert.equal(getMobilityProfile(quietLeader).id, 'crouched');
  assert.equal(quietLeader.stealth.posture, 'crouched');
  assert.ok(quietLeader.movement.speedTilesPerTick < normalLeader.movement.speedTilesPerTick * 0.75,
    `quiet movement should slow the unit (${quietLeader.movement.speedTilesPerTick} vs ${normalLeader.movement.speedTilesPerTick})`);
}
