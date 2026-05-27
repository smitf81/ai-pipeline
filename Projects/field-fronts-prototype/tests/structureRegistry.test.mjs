import assert from 'node:assert/strict';

import { createBlankMap } from '../src/world/mapModel.js';
import { createGameStateSnapshot, createInitialGameState, deserializeGameState, serializeGameState } from '../src/game/gameModel.js';
import { assertGameStateContract, assertStructureEntityContract } from '../src/game/contracts.js';
import {
  CONSTRUCTION_STATES,
  GATE_STATES,
  STRUCTURE_ENTITY_KIND,
  STRUCTURE_TYPE_IDS,
  createStructureInstance,
  getStructureDefinition,
  isStructureEntity,
  listStructureDefinitions
} from '../src/game/structureRegistry.js';

const REQUIRED_LAYER_KEYS = [
  'construction',
  'footprint',
  'collision',
  'nav',
  'occupancy',
  'combat',
  'influence',
  'integrity'
];

export function run() {
  assert.deepEqual(STRUCTURE_TYPE_IDS, [
    'outpost',
    'watchtower',
    'hunting_tent',
    'wood_gathering_post',
    'builder_lodge',
    'storage_tent',
    'wall_segment',
    'gate',
    'trench_segment',
    'fort'
  ]);
  assert.equal(listStructureDefinitions().length, 10);

  const outpostDefinition = getStructureDefinition('outpost');
  const watchtowerDefinition = getStructureDefinition('watchtower');
  const huntingTentDefinition = getStructureDefinition('hunting_tent');
  const woodPostDefinition = getStructureDefinition('wood_gathering_post');
  const builderLodgeDefinition = getStructureDefinition('builder_lodge');
  const storageTentDefinition = getStructureDefinition('storage_tent');
  const wallDefinition = getStructureDefinition('wall_segment');
  const gateDefinition = getStructureDefinition('gate');
  const trenchDefinition = getStructureDefinition('trench_segment');
  const fortDefinition = getStructureDefinition('fort');

  for (const definition of listStructureDefinitions()) {
    for (const key of REQUIRED_LAYER_KEYS) {
      assert.equal(typeof definition[key], 'object', `${definition.id} missing ${key}`);
    }
  }

  assert.equal(outpostDefinition.occupancy.enabled, true);
  assert.equal(outpostDefinition.occupancy.capacitySquads, 2);
  assert.equal(outpostDefinition.footprint.blocksGroundMovement, true);
  assert.equal(outpostDefinition.influence.controlRadius > 0, true);
  assert.equal(outpostDefinition.gathering.enabled, true);
  assert.equal(outpostDefinition.gathering.mode, 'outpost-native');
  assert.equal(outpostDefinition.gathering.assignedWorkers, 1);

  assert.equal(watchtowerDefinition.occupancy.capacitySquads, 1);
  assert.equal(watchtowerDefinition.influence.visionRadius > outpostDefinition.influence.visionRadius, true);
  assert.equal(watchtowerDefinition.combat.heightAdvantage > outpostDefinition.combat.heightAdvantage, true);
  assert.equal(watchtowerDefinition.integrity.maxHealth < outpostDefinition.integrity.maxHealth, true);

  assert.equal(huntingTentDefinition.gathering.enabled, true);
  assert.equal(huntingTentDefinition.gathering.resourceId, 'food');
  assert.equal(huntingTentDefinition.gathering.assignedWorkers, 2);
  assert.equal(huntingTentDefinition.gathering.requiresReturn, false);

  assert.equal(woodPostDefinition.gathering.enabled, true);
  assert.equal(woodPostDefinition.gathering.resourceId, 'wood');
  assert.equal(woodPostDefinition.gathering.assignedWorkers, 2);
  assert.equal(woodPostDefinition.gathering.requiresReturn, true);
  assert.deepEqual(woodPostDefinition.gathering.sourceTerrain, ['forest']);
  assert.equal(woodPostDefinition.construction.materials.timber ?? 0, 0);

  assert.equal(outpostDefinition.workforce.enabled, true);
  assert.equal(outpostDefinition.workforce.canTrainBuilders, true);
  assert.equal(outpostDefinition.workforce.builderCapacityBonus, 2);
  assert.equal(outpostDefinition.workforce.initialBuilderCrews, 1);

  assert.equal(builderLodgeDefinition.workforce.enabled, true);
  assert.equal(builderLodgeDefinition.workforce.canTrainBuilders, true);
  assert.equal(builderLodgeDefinition.workforce.builderCapacityBonus, 2);
  assert.equal(builderLodgeDefinition.workforce.initialBuilderCrews, 0);
  assert.equal(builderLodgeDefinition.occupancy.capacitySquads, 0);

  assert.equal(storageTentDefinition.storage.enabled, true);
  assert.equal(storageTentDefinition.storage.capacityBonus > 0, true);
  assert.equal(storageTentDefinition.storage.transportSlots, 1);

  assert.equal(wallDefinition.footprint.blocksGroundMovement, true);
  assert.equal(wallDefinition.occupancy.mode, 'wall_top');
  assert.equal(wallDefinition.occupancy.enabled, true);
  assert.equal(wallDefinition.occupancy.capacitySquads, 1);

  assert.equal(gateDefinition.nav.allowsFriendlyPassage, true);
  assert.equal(gateDefinition.nav.allowsEnemyPassage, false);
  assert.equal(gateDefinition.nav.gateState, GATE_STATES.closed);

  assert.equal(trenchDefinition.footprint.blocksGroundMovement, false);
  assert.equal(trenchDefinition.collision.blocksMovement, false);
  assert.equal(trenchDefinition.nav.blocksFlowField, false);
  assert.equal(trenchDefinition.nav.movementCostModifier > 1, true);
  assert.equal(trenchDefinition.occupancy.capacitySquads, 1);
  assert.equal(trenchDefinition.combat.grantsCover, true);

  assert.equal(fortDefinition.occupancy.capacitySquads, 4);
  assert.equal(fortDefinition.integrity.maxHealth > outpostDefinition.integrity.maxHealth, true);
  assert.equal(fortDefinition.influence.defenceRadius > outpostDefinition.influence.defenceRadius, true);

  const watchtower = createStructureInstance('watchtower', {
    id: 'structure_watchtower_test',
    factionId: 'player',
    tile: { x: 10, y: 12 }
  });
  assert.equal(watchtower.entityType, STRUCTURE_ENTITY_KIND);
  assert.equal(watchtower.type, 'watchtower');
  assert.equal(watchtower.construction.state, CONSTRUCTION_STATES.complete);
  assert.equal(watchtower.construction.progress, 1);
  assert.equal(watchtower.position.x, 10);
  assert.equal(watchtower.occupancy.occupants.length, 0);
  assert.equal(watchtower.occupancy.entryPoints.length > 0, true);
  assert.equal(watchtower.occupancy.exitPoints.length > 0, true);
  assertStructureEntityContract(watchtower);
  assert.equal(isStructureEntity(watchtower), true);

  const blueprintWall = createStructureInstance('wall_segment', {
    id: 'structure_wall_blueprint',
    factionId: 'player',
    position: { x: 14.25, y: 7.5 },
    construction: {
      state: CONSTRUCTION_STATES.blueprint,
      progress: 0
    }
  });
  assert.equal(blueprintWall.construction.state, CONSTRUCTION_STATES.blueprint);
  assert.equal(blueprintWall.construction.progress, 0);
  assert.equal(blueprintWall.tile.x, 14);
  assert.equal(blueprintWall.tile.y, 8);
  assert.equal(blueprintWall.footprint.shape, 'line');

  watchtower.occupancy.occupants.push('squad_test_01');
  const freshWatchtower = createStructureInstance('watchtower', {
    id: 'structure_watchtower_fresh',
    factionId: 'player',
    tile: { x: 11, y: 12 }
  });
  assert.deepEqual(freshWatchtower.occupancy.occupants, []);

  const crowdedTrench = createStructureInstance('trench_segment', {
    id: 'structure_trench_crowded',
    factionId: 'player',
    tile: { x: 12, y: 12 },
    occupancy: {
      occupants: ['squad_a', 'squad_b']
    }
  });
  assert.equal(crowdedTrench.occupancy.capacitySquads, 1);
  assert.deepEqual(crowdedTrench.occupancy.occupants, ['squad_a']);

  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  assertGameStateContract(game);
  assert.equal(game.structures.length, 3);
  assert.ok(game.structures.every((structure) => structure.type === 'outpost'));
  assert.ok(game.structures.every((structure) => structure.construction.state === CONSTRUCTION_STATES.complete));
  assert.ok(game.structures.every((structure) => structure.occupancy.capacitySquads === 2));

  const snapshot = createGameStateSnapshot(game, map);
  assert.equal(snapshot.structures.length, 3);
  assert.equal(snapshot.structures[0].combat.grantsCover, true);

  const restored = deserializeGameState(serializeGameState(game, map), map);
  assert.equal(restored.structures.length, game.structures.length);
  assert.deepEqual(restored.structures.map((structure) => structure.id), game.structures.map((structure) => structure.id));

  const legacyRestored = deserializeGameState({
    ...snapshot,
    structures: undefined
  }, map);
  assert.equal(legacyRestored.structures.length, legacyRestored.outposts.length);
  assert.ok(legacyRestored.structures.every((structure) => isStructureEntity(structure)));
}
