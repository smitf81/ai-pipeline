import assert from 'node:assert/strict';

import { createBlankMap } from '../src/world/mapModel.js';
import {
  advanceGameTick,
  collectCompletedStructureBlockers,
  collectStructureMovementModifiers,
  createInitialGameState,
  createStructureBlockerSignature,
  createStructureNavigationSignature,
  isTileBlockedByStructure,
  selectGameEntityAtTile,
  setPlayerMovementIntent,
  spawnInfantrySquad
} from '../src/game/gameModel.js';
import { summarizeStructureTopology } from '../src/game/structureTopology.js';
import { createStructureInstance } from '../src/game/structureRegistry.js';

export function run() {
  const map = createBlankMap({ width: 24, height: 18, fill: 'land' });
  const game = createInitialGameState(map);

  game.structures = [
    createStructureInstance('wall_segment', {
      id: 'structure_wall_test',
      factionId: 'player',
      tile: { x: 8, y: 8 }
    }),
    createStructureInstance('outpost', {
      id: 'structure_outpost_test',
      factionId: 'enemy',
      tile: { x: 12, y: 8 }
    }),
    createStructureInstance('trench_segment', {
      id: 'structure_trench_test',
      factionId: 'player',
      tile: { x: 10, y: 8 }
    }),
    createStructureInstance('watchtower', {
      id: 'structure_watchtower_blueprint',
      factionId: 'enemy',
      tile: { x: 14, y: 8 },
      construction: {
        state: 'blueprint',
        progress: 0
      }
    })
  ];

  const blockers = collectCompletedStructureBlockers(game);
  assert.deepEqual(blockers.map((blocker) => blocker.id).sort(), [
    'structure_outpost_test',
    'structure_wall_test'
  ]);
  assert.equal(isTileBlockedByStructure(game, map, { x: 8, y: 8 }, 'player'), true);
  assert.equal(isTileBlockedByStructure(game, map, { x: 12, y: 8 }, 'player'), true);
  assert.equal(isTileBlockedByStructure(game, map, { x: 10, y: 8 }, 'player'), false);
  assert.equal(isTileBlockedByStructure(game, map, { x: 14, y: 8 }, 'player'), false);

  const modifiers = collectStructureMovementModifiers(game);
  assert.equal(modifiers.length, 1);
  assert.equal(modifiers[0].id, 'structure_trench_test');
  assert.equal(modifiers[0].movementCostModifier > 1, true);

  const summary = summarizeStructureTopology(game);
  assert.equal(summary.totalStructures, 4);
  assert.equal(summary.completeStructures, 3);
  assert.equal(summary.occupiableStructures, 4);
  assert.equal(summary.blockerStructures, 2);
  assert.equal(summary.trenchModifiers, 1);
  assert.equal(summary.navSignature.includes('structure_wall_test'), true);

  const selectedTrench = selectGameEntityAtTile(game, { x: 10, y: 8 });
  assert.equal(selectedTrench.id, 'structure_trench_test');
  assert.equal(selectedTrench.entityType, 'structure');

  const legacyOutpostGame = createInitialGameState(map);
  const selectedOutpost = selectGameEntityAtTile(legacyOutpostGame, legacyOutpostGame.outposts.find((outpost) => outpost.contestable).tile);
  assert.equal(selectedOutpost.type, 'outpost');
  assert.notEqual(selectedOutpost.entityType, 'structure');

  const emptyGame = { ...game, structures: [] };
  assert.equal(createStructureBlockerSignature(emptyGame), '');
  assert.notEqual(createStructureBlockerSignature(game), '');
  assert.notEqual(createStructureNavigationSignature(emptyGame), createStructureNavigationSignature(game));

  const gateGame = createInitialGameState(map);
  gateGame.structures = [
    createStructureInstance('gate', {
      id: 'structure_gate_open',
      factionId: 'player',
      tile: { x: 6, y: 6 },
      nav: {
        gateState: 'open'
      }
    })
  ];
  assert.equal(isTileBlockedByStructure(gateGame, map, { x: 6, y: 6 }, 'player'), false);
  assert.equal(isTileBlockedByStructure(gateGame, map, { x: 6, y: 6 }, 'enemy'), true);


  const orientedGame = createInitialGameState(map);
  orientedGame.structures = [
    createStructureInstance('wall_segment', {
      id: 'structure_vertical_wall',
      factionId: 'enemy',
      tile: { x: 8, y: 8 },
      orientation: {
        angleRadians: Math.PI / 2,
        degrees: 90,
        direction: 's',
        tangent: { x: 0, y: 1 },
        role: 'straight'
      }
    })
  ];
  assert.equal(isTileBlockedByStructure(orientedGame, map, { x: 8, y: 9 }, 'player'), true);
  assert.equal(isTileBlockedByStructure(orientedGame, map, { x: 9, y: 8 }, 'player'), false);
  assert.equal(collectCompletedStructureBlockers(orientedGame)[0].orientation.degrees, undefined);
  assert.equal(collectCompletedStructureBlockers(orientedGame)[0].orientation.angleRadians > 1.5, true);

  const routeGame = createInitialGameState(map);
  const spawn = spawnInfantrySquad(routeGame, map, { factionId: 'player' });
  assert.equal(spawn.ok, true);
  routeGame.structures = [
    createStructureInstance('wall_segment', {
      id: 'structure_route_wall',
      factionId: 'enemy',
      tile: { x: Math.round(spawn.squad.position.x) + 2, y: Math.round(spawn.squad.position.y) }
    })
  ];
  const wallTile = routeGame.structures[0].tile;
  setPlayerMovementIntent(routeGame, map, spawn.squad.id, [
    spawn.squad.position,
    { x: spawn.squad.position.x + 5, y: spawn.squad.position.y }
  ]);
  advanceGameTick(routeGame, map);
  const movedSquad = routeGame.squads.find((squad) => squad.id === spawn.squad.id);
  assert.equal(movedSquad.movementPath.blocked, false);
  assert.equal(movedSquad.movementPath.mapSignature.includes('structure_route_wall'), true);
  assert.equal(movedSquad.movementPath.nodes.some((node) => Math.round(node.x) === wallTile.x && Math.round(node.y) === wallTile.y), false);
}
