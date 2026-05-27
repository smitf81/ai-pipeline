import assert from 'node:assert/strict';

import {
  advanceGameTick,
  createInitialGameState,
  placeStructureBuildOrder,
  placeStructurePathBuildOrder,
  validateStructurePathPlacement
} from '../src/game/gameModel.js';
import { canStructuresJoin, isSketchableStructureType, materialiseStructureSketchPath } from '../src/game/structureJoinery.js';
import { createBlankMap } from '../src/world/mapModel.js';
import { createEditorState, placeSelectedStructurePath, selectStructurePlacement, updateStructurePlacementPreview } from '../src/editor/editorState.js';

export function run() {
  assert.equal(isSketchableStructureType('wall_segment'), true);
  assert.equal(isSketchableStructureType('trench_segment'), true);
  assert.equal(isSketchableStructureType('watchtower'), false);
  assert.equal(canStructuresJoin('wall_segment', 'watchtower'), true);
  assert.equal(canStructuresJoin('wall_segment', 'fort'), true);
  assert.equal(canStructuresJoin('trench_segment', 'fort'), true);

  const path = materialiseStructureSketchPath([{ x: 10, y: 10 }, { x: 13, y: 10 }, { x: 15, y: 12 }]);
  assert.deepEqual(path.map((tile) => `${tile.x},${tile.y}`), ['10,10', '11,10', '12,10', '13,10', '14,11', '15,12']);

  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  for (let index = 0; index < 20; index += 1) {
    advanceGameTick(game, map);
  }
  grantAllResources(game, 'player', 400);

  const tower = placeStructureBuildOrder(game, map, {
    type: 'watchtower',
    factionId: 'player',
    position: { x: 16, y: 12 }
  });
  assert.equal(tower.ok, true);

  const preview = validateStructurePathPlacement(game, map, {
    type: 'wall_segment',
    factionId: 'player',
    path: [{ x: 12, y: 12 }, { x: 16, y: 12 }, { x: 19, y: 15 }]
  });
  assert.equal(preview.valid, true);
  assert.equal(preview.pathPlan.segments.length >= 5, true);
  assert.equal(preview.pathPlan.connectors.some((connector) => connector.id === tower.structure.id), true);
  assert.equal(preview.pathPlan.segments.some((segment) => segment.orientation.degrees !== 0), true);
  assert.equal(preview.pathPlan.segments.some((segment) => segment.joinery.junction.degree > 1), true);
  assert.equal(preview.pathPlan.segments.some((segment) => segment.joinery.connections.some((connection) => connection.socketRole)), true);

  const cornerPreview = validateStructurePathPlacement(game, map, {
    type: 'wall_segment',
    factionId: 'player',
    path: [{ x: 4, y: 4 }, { x: 7, y: 4 }, { x: 7, y: 7 }]
  });
  assert.equal(cornerPreview.valid, true);
  const cornerSegment = cornerPreview.pathPlan.segments.find((segment) => segment.tile.x === 7 && segment.tile.y === 4);
  assert.ok(cornerSegment, 'expected explicit corner segment at the L-bend');
  assert.equal(cornerSegment.orientation.role, 'corner');
  assert.equal(cornerSegment.joinery.junction.kind, 'corner');
  assert.notEqual(cornerSegment.orientation.direction, 'se');


  const beforeStructures = game.structures.length;
  const buildPath = placeStructurePathBuildOrder(game, map, {
    type: 'wall_segment',
    factionId: 'player',
    path: [{ x: 12, y: 12 }, { x: 16, y: 12 }, { x: 19, y: 15 }]
  });
  assert.equal(buildPath.ok, true);
  assert.equal(buildPath.structures.length, preview.pathPlan.segments.length);
  assert.equal(game.structures.length, beforeStructures + buildPath.structures.length);
  assert.equal(game.constructionJobs.length >= buildPath.structures.length, true);
  assert.equal(buildPath.structures.every((structure) => structure.construction.state === 'blueprint'), true);
  assert.equal(buildPath.structures.every((structure) => structure.joinery.pathBlueprint === true), true);
  assert.equal(buildPath.structures.every((structure) => Number.isFinite(structure.orientation.angleRadians)), true);



  const gateWallPath = placeStructurePathBuildOrder(game, map, {
    type: 'wall_segment',
    factionId: 'player',
    path: [{ x: 24, y: 24 }, { x: 28, y: 24 }]
  });
  assert.equal(gateWallPath.ok, true);
  const middleWall = game.structures.find((structure) => structure.type === 'wall_segment' && structure.tile.x === 26 && structure.tile.y === 24);
  assert.ok(middleWall, 'expected a wall segment to replace with a gate');
  const oldWallJobId = `job_construct_${middleWall.id}`;

  const gatePreview = validateStructurePathPlacement(game, map, {
    type: 'trench_segment',
    factionId: 'player',
    path: [{ x: 24, y: 25 }, { x: 28, y: 25 }]
  });
  assert.equal(gatePreview.valid, true);
  assert.equal(gatePreview.pathPlan.connectors.some((connector) => connector.type === 'wall_segment'), true);

  const gateBuild = placeStructureBuildOrder(game, map, {
    type: 'gate',
    factionId: 'player',
    position: { x: 26, y: 24 }
  });
  assert.equal(gateBuild.ok, true);
  assert.equal(gateBuild.replacedStructure.id, middleWall.id);
  assert.equal(game.structures.some((structure) => structure.id === middleWall.id), false);
  assert.equal(game.constructionJobs.some((job) => job.id === oldWallJobId), false);
  const placedGate = game.structures.find((structure) => structure.id === gateBuild.structure.id);
  assert.equal(placedGate.type, 'gate');
  assert.equal(placedGate.tile.x, 26);
  assert.equal(placedGate.tile.y, 24);
  assert.equal(placedGate.orientation.degrees, middleWall.orientation.degrees);
  assert.equal(placedGate.joinery.replacedStructureId, middleWall.id);
  assert.equal(placedGate.joinery.connections.some((connection) => connection.kind === 'replaces' && connection.structureId === middleWall.id), true);
  assert.equal(placedGate.joinery.connections.filter((connection) => connection.structureType === 'wall_segment').length >= 2, true);

  const trenchPreview = validateStructurePathPlacement(game, map, {
    type: 'trench_segment',
    factionId: 'player',
    path: [{ x: 8, y: 18 }, { x: 12, y: 18 }]
  });
  assert.equal(trenchPreview.valid, true);
  assert.equal(trenchPreview.pathPlan.segments.length, 5);


  const parallelA = placeStructurePathBuildOrder(game, map, {
    type: 'wall_segment',
    factionId: 'player',
    path: [{ x: 30, y: 8 }, { x: 33, y: 8 }]
  });
  assert.equal(parallelA.ok, true);
  const parallelB = placeStructurePathBuildOrder(game, map, {
    type: 'wall_segment',
    factionId: 'player',
    path: [{ x: 30, y: 9 }, { x: 33, y: 9 }]
  });
  assert.equal(parallelB.ok, true);
  const pathAIds = new Set(parallelA.structures.map((structure) => structure.id));
  const pathBIds = new Set(parallelB.structures.map((structure) => structure.id));
  const refreshedA = game.structures.filter((structure) => pathAIds.has(structure.id));
  assert.equal(refreshedA.some((structure) => (structure.joinery.connections ?? []).some((connection) => pathBIds.has(connection.structureId))), false);

  const editor = createEditorState(map);
  grantAllResources(editor.game, 'player', 400);
  const selected = selectStructurePlacement(editor, 'wall_segment');
  assert.equal(selected.mode, 'path');
  const editorPreview = updateStructurePlacementPreview(editor, { x: 8, y: 20 }, { path: [{ x: 8, y: 20 }, { x: 10, y: 20 }] });
  assert.equal(editorPreview.pathPlan.segments.length, 3);
  const editorBuild = placeSelectedStructurePath(editor, [{ x: 8, y: 20 }, { x: 10, y: 20 }]);
  assert.equal(editorBuild.ok, true);
  assert.equal(editor.placement.active, false);
  assert.equal(editorBuild.structures.length, 3);
}


function grantAllResources(game, factionId, amount) {
  const rounded = Math.round(Number(amount) * 1000) / 1000;
  for (const resourceId of ['supplies', 'gold', 'food', 'wood', 'population']) {
    const stockpile = game.economy.factions[factionId].stockpiles[resourceId];
    if (!stockpile) continue;
    game.economy.factions[factionId].stockpiles[resourceId] = {
      resourceId,
      amount: rounded,
      components: resourceId === 'supplies'
        ? { provisions: rounded / 3, materiel: rounded / 3, transit: rounded / 3 }
        : { [resourceId]: rounded }
    };
  }
}
