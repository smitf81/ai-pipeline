import assert from 'node:assert/strict';

import {
  advanceGameTick,
  createInitialGameState,
  evacuateStructureOccupants,
  issueSquadOccupyStructureCommand,
  issueSquadOccupyStructureAtTile,
  spawnInfantrySquad,
  summarizeStructureOccupancy
} from '../src/game/gameModel.js';
import { createBlankMap } from '../src/world/mapModel.js';

export function run() {
  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  const deploy = spawnInfantrySquad(game, map, { factionId: 'player' });
  assert.equal(deploy.ok, true);

  const squad = deploy.squad;
  const outpost = game.structures.find((structure) => structure.type === 'outpost' && structure.factionId === 'player');
  assert.ok(outpost);
  assert.equal(outpost.occupancy.enabled, true);
  assert.equal(outpost.occupancy.capacitySquads, 2);

  const orderByTile = issueSquadOccupyStructureAtTile(game, map, squad.id, outpost.tile);
  assert.equal(orderByTile.ok, true);
  assert.equal(['moving', 'entered'].includes(orderByTile.mode), true);

  for (let index = 0; index < 30; index += 1) {
    advanceGameTick(game, map);
    const current = game.squads.find((candidate) => candidate.id === squad.id);
    if (current?.occupancy?.state === 'occupied') {
      break;
    }
  }

  const occupiedSquad = game.squads.find((candidate) => candidate.id === squad.id);
  const occupiedOutpost = game.structures.find((structure) => structure.id === outpost.id);
  assert.equal(occupiedSquad.occupancy.state, 'occupied');
  assert.equal(occupiedSquad.occupancy.structureId, outpost.id);
  assert.equal(occupiedSquad.movement.status, 'garrisoned');
  assert.equal(occupiedOutpost.occupancy.occupants.includes(squad.id), true);

  const summary = summarizeStructureOccupancy(game);
  assert.equal(summary.occupiedSquads, 1);
  assert.equal(summary.openSlots >= 1, true);

  const secondDeploy = spawnInfantrySquad(game, map, { factionId: 'player' });
  assert.equal(secondDeploy.ok, true);
  const enemyOutpost = game.structures.find((structure) => structure.type === 'outpost' && structure.factionId === 'enemy');
  const rejected = issueSquadOccupyStructureCommand(game, map, secondDeploy.squad.id, enemyOutpost.id);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, 'wrong-faction');

  const evac = evacuateStructureOccupants(game, map, outpost.id);
  assert.equal(evac.ok, true);
  assert.deepEqual(evac.evacuatedSquadIds, [squad.id]);
  const evacuatedSquad = game.squads.find((candidate) => candidate.id === squad.id);
  const evacuatedOutpost = game.structures.find((structure) => structure.id === outpost.id);
  assert.equal(evacuatedSquad.occupancy.state, 'field');
  assert.equal(evacuatedOutpost.occupancy.occupants.length, 0);
}
