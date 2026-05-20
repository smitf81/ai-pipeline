import assert from 'node:assert/strict';

import {
  collectMovableCollisionBodies,
  createCollisionSpatialIndex,
  getMovableCollisionBody,
  resolveSoftUnitSeparation,
  summarizeCollisionAuthority
} from '../src/game/collisionAuthority.js';
import { advanceGameTick, createInitialGameState, spawnInfantrySquad } from '../src/game/gameModel.js';
import { createBlankMap } from '../src/world/mapModel.js';

export function run() {
  const map = createBlankMap({ width: 32, height: 24, fill: 'land' });
  const game = createInitialGameState(map);

  assert.equal(game.leaders[0].collision.layer, 'unit');
  assert.equal(game.leaders[0].collision.softSeparation, true);
  assert.equal(game.leaders[0].collision.blocksMovement, false);
  assert.equal(game.leaders[0].collision.priority > 1, true);

  const spawn = spawnInfantrySquad(game, map, { factionId: 'player' });
  assert.equal(spawn.ok, true);
  const squadBody = getMovableCollisionBody(spawn.squad);
  assert.equal(squadBody.layer, 'unit');
  assert.equal(squadBody.solid, false);
  assert.equal(squadBody.blocksMovement, false);

  const commander = game.leaders.find((leader) => leader.factionId === 'player');
  const overlapPosition = { x: commander.position.x + 1.4, y: commander.position.y };
  game.leaders = game.leaders.map((leader) => leader.id === commander.id
    ? { ...leader, position: overlapPosition, tile: { x: Math.round(overlapPosition.x), y: Math.round(overlapPosition.y) } }
    : leader);
  game.squads = [
    {
      ...game.squads[0],
      position: overlapPosition,
      tile: { x: Math.round(overlapPosition.x), y: Math.round(overlapPosition.y) }
    }
  ];

  resolveSoftUnitSeparation(game, map, {
    isHardBlocked: () => false
  });
  const separatedCommander = game.leaders.find((leader) => leader.id === commander.id);
  const separatedSquad = game.squads[0];
  assert.ok(distance(separatedCommander.position, separatedSquad.position) > 0.01);
  assert.ok(distance(separatedCommander.position, overlapPosition) < distance(separatedSquad.position, overlapPosition));
  assert.equal(summarizeCollisionAuthority(game).softSeparationCorrections > 0, true);

  const bodies = collectMovableCollisionBodies({
    leaders: [],
    squads: Array.from({ length: 80 }, (_, index) => {
      const column = index % 16;
      const row = Math.floor(index / 16);
      return {
        ...game.squads[0],
        id: `collision_squad_${index}`,
        position: {
          x: 5 + column * 0.28,
          y: 5 + row * 0.28
        },
        tile: {
          x: Math.round(5 + column * 0.28),
          y: Math.round(5 + row * 0.28)
        }
      };
    })
  });
  const index = createCollisionSpatialIndex(bodies);
  assert.equal(index.buckets.size > 1, true);

  const hordeGame = createInitialGameState(map);
  hordeGame.squads = bodies.map((body) => ({
    ...game.squads[0],
    id: body.id,
    position: body.position,
    tile: body.tile
  }));
  resolveSoftUnitSeparation(hordeGame, map, {
    isHardBlocked: () => false
  });
  const hordeStats = summarizeCollisionAuthority(hordeGame);
  assert.equal(hordeStats.collisionBuckets >= index.buckets.size, true);
  assert.equal(hordeStats.softSeparationChecks < bodies.length * 24, true);

  const tickGame = createInitialGameState(map);
  advanceGameTick(tickGame, map);
  const tickStats = summarizeCollisionAuthority(tickGame);
  assert.equal(tickStats.collisionBodies >= tickGame.leaders.length + tickGame.structures.length, true);
  assert.equal(tickStats.hardBlockerChecks > 0, true);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
