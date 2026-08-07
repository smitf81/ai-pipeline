import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BSB_V2_AUTHORING_CONTRACT,
  BSB_V2_DEMO_ARENA_CONTRACT,
  BSB_V2_MAP_MANIFEST_CONTRACT,
  BSB_V2_MAP_MANIFEST_PATH,
  BSB_V2_PROJECT_WORKSPACE_CONTRACT,
  BSB_V2_RUNTIME_MAP_CONTRACT,
  AXIOM_WORKSPACE_CONTEXT_CONTRACT,
  applyBsbV2AuthoringTool,
  applyBsbV2TreeOperation,
  applyBsbV2UndergrowthOperation,
  buildBsbV2RuntimeMap,
  createDefaultBsbV2AuthoringDocument,
  createCrownOfCindersBsbV2AuthoringDocument,
  createSecondApproachBsbV2AuthoringDocument,
  describeBsbV2AuthoringRecord,
  filterBsbV2AuthoringRecords,
  inspectBsbV2RuntimeBake,
  patchBsbV2AuthoringRecord,
  classifyBsbV2RuntimeFreshness,
  resolveBsbV2MapLibrary,
  resolveBsbV2MapPublication,
  resolveBsbV2WorkspaceBinding,
  validateBsbV2AuthoringDocument
} from '../public/bsb-v2-map-authoring.js';
import {
  BSB_V2_TREE_DNA_CONTRACT,
  BSB_V2_TREE_OPERATION_CONTRACT,
  createBsbV2TreeDefinition
} from '../public/bsb-v2-tree-authoring.js';
import {
  BSB_V2_UNDERGROWTH_DNA_CONTRACT,
  BSB_V2_UNDERGROWTH_OPERATION_CONTRACT,
  createBsbV2UndergrowthDefinition
} from '../public/bsb-v2-undergrowth-authoring.js';
import {
  BSB_V2_MAP_RESIZE_CONTRACT,
  resizeBsbV2AuthoringDocument
} from '../public/bsb-v2-map-resize.js';
import {
  createBsbV2MapViewport,
  panBsbV2MapViewport,
  resolveBsbV2MapCanvasLayout,
  zoomBsbV2MapViewport
} from '../public/bsb-v2-map-viewport.js';
import {
  BSB_V2_TRANSITION_SEQUENCE_CONTRACT,
  BSB_V2_TRANSITION_SEQUENCE_INTENT_PROPOSAL_CONTRACT,
  applyBsbV2TransitionSequenceOperation,
  normalizeBsbV2TransitionSequenceIntentProposal,
  parseBsbV2TransitionSequenceCommand
} from '../public/bsb-v2-scene-sequence-authoring.js';

const base = createDefaultBsbV2AuthoringDocument();
assert.equal(base.contract, BSB_V2_AUTHORING_CONTRACT);
assert.equal(base.tiles.length, 30);
assert.equal(base.tiles[0].length, 42);
assert.equal(base.unitPlacements.find((entry) => entry.type === 'raider')?.team, 'raiders');
assert.equal(base.unitPlacements.find((entry) => entry.type === 'husk')?.team, 'husks');
assert.equal(base.unitPlacements.find((entry) => entry.type === 'werewolf')?.team, 'wolves');
assert.equal(base.transitions.escapeZone.nextMapPath, '/data/maps/axiom-second-approach.runtime-map.json', 'opening authoring map should own its escape transition target');
assert.equal(base.transitions.escapeZone.arrivalSequenceId, 'smoke_instinct_awakening', 'opening authoring map should explicitly own its arrival sequence');
assert.equal(describeBsbV2AuthoringRecord('sceneObject', { type: 'tree' }).shape, 'tree', 'trees should have a representative procedural marker instead of a triangle asset');
assert.equal(describeBsbV2AuthoringRecord('unit', { type: 'werewolf' }).glyph, 'W', 'unit markers should identify their actor type');
assert.equal(describeBsbV2AuthoringRecord('spawner', { type: 'husk' }).glyph, 'H+', 'spawners should retain actor identity');
const outlinerFixture = [
  { kind: 'sceneObject', id: 'tree-1', type: 'tree', label: 'Nest rim', x: 4, y: 5 },
  { kind: 'unit', id: 'wolf-1', type: 'werewolf', label: 'Eastern bypass hunter', x: 18, y: 12 },
  { kind: 'spawner', id: 'husk-spawner-1', type: 'husk', x: 2, y: 3 }
];
assert.equal(filterBsbV2AuthoringRecords(outlinerFixture, { query: 'bypass' }).length, 1, 'outliner search should include labels');
assert.equal(filterBsbV2AuthoringRecords(outlinerFixture, { query: '18,12' })[0]?.id, 'wolf-1', 'outliner search should include tile coordinates');
assert.equal(filterBsbV2AuthoringRecords(outlinerFixture, { kind: 'spawner' })[0]?.id, 'husk-spawner-1', 'outliner kind filters should expose every matching record');

const workspaceContext = {
  schema: AXIOM_WORKSPACE_CONTEXT_CONTRACT,
  status: 'ready',
  project: {
    id: 'black-sky-bound-v2-demo',
    name: 'Black Sky Bound v2 Demo',
    root: '_A_Projects/BLACK_SKY_BOUND_V2',
    workspace: {
      contract: BSB_V2_PROJECT_WORKSPACE_CONTRACT,
      surfaceId: 'bsb-v2-map-authoring',
      scene: { kind: 'map', manifestPath: BSB_V2_MAP_MANIFEST_PATH },
      authoring: { owner: 'AXIOM', projectId: 'axiom', root: '.', pathSource: 'map_manifest.authoringPath' },
      runtimeBake: { owner: 'Black Sky Bound V2', projectId: 'black-sky-bound-v2-demo', root: '_A_Projects/BLACK_SKY_BOUND_V2', pathSource: 'map_manifest.runtimePath', explicit: true }
    }
  }
};
const workspaceBinding = resolveBsbV2WorkspaceBinding(workspaceContext);
assert.equal(workspaceBinding.project.id, 'black-sky-bound-v2-demo');
assert.equal(workspaceBinding.authoring.projectId, 'axiom');
assert.equal(workspaceBinding.runtimeBake.projectId, 'black-sky-bound-v2-demo');
assert.equal(workspaceBinding.scene.manifestPath, BSB_V2_MAP_MANIFEST_PATH);
assert.equal(classifyBsbV2RuntimeFreshness({ dirty: true, bakeReceipt: { afterHash: 'old' } }), 'stale', 'dirty authoring must invalidate an older bake receipt');
assert.equal(classifyBsbV2RuntimeFreshness({ dirty: false, saveReceipt: { afterHash: 'new' } }), 'stale', 'a newly saved source without a bake receipt is runtime-stale');
assert.equal(classifyBsbV2RuntimeFreshness({ dirty: false, bakeReceipt: { afterHash: 'current' } }), 'current');
assert.equal(classifyBsbV2RuntimeFreshness({ dirty: false }), 'unverified');
assert.throws(
  () => resolveBsbV2WorkspaceBinding({ ...workspaceContext, project: { ...workspaceContext.project, id: 'another-project' } }),
  /bsb_workspace_runtime_owner_mismatch/
);

const secondBase = createSecondApproachBsbV2AuthoringDocument();
assert.equal(secondBase.mapId, 'axiom_second_approach');
assert.deepEqual(secondBase.spawn, { x: 24, y: 31, rotation: -Math.PI / 2 }, 'second region should begin at the south edge facing north');
assert.equal(secondBase.transitions.escapeZone, null, 'second placeholder region should currently terminate rather than chaining forever');
const arenaBase = validateBsbV2AuthoringDocument(createCrownOfCindersBsbV2AuthoringDocument());
assert.equal(arenaBase.arena.contract, BSB_V2_DEMO_ARENA_CONTRACT, 'demo arena should be canonical Axiom-authored intent');
assert.equal(arenaBase.arena.waves.length, 5, 'demo arena should own a finite five-wave progression');
assert.deepEqual(arenaBase.arena.initialUnlockedAbilityIds, ['move', 'bite_claw'], 'playtesters should begin with only movement and close combat');
assert.deepEqual(arenaBase.arena.waves.slice(0, 4).map((wave) => wave.rewardAbilityId), ['dodge', 'body_lunge', 'smoke_burst', 'charge_counter'], 'each cleared wave should awaken one new instinct');

const painted = applyBsbV2AuthoringTool(base, 'terrain:water', 10, 10, { brushRadius: 2 });
assert.equal(painted.tiles[10][10], 'water');
assert.equal(painted.revision, 1);
assert.equal(base.tiles[10][10] === 'water', false, 'authoring operations should not mutate the previous canonical snapshot');

const objectPlaced = applyBsbV2AuthoringTool(painted, 'object:tree', 12, 11);
const unitPlaced = applyBsbV2AuthoringTool(objectPlaced, 'unit:husk', 13, 11);
const spawnerPlaced = applyBsbV2AuthoringTool(unitPlaced, 'spawner:raider', 14, 11);
assert.equal(spawnerPlaced.sceneObjects.at(-1).type, 'tree');
assert.equal(spawnerPlaced.sceneObjects.at(-1).tree.contract, BSB_V2_TREE_DNA_CONTRACT, 'placed trees should author compact Tree DNA');
assert.equal(spawnerPlaced.sceneObjects.at(-1).tree.species, 'old_pine', 'tree palette should resolve through a species recipe');
assert.equal(spawnerPlaced.unitPlacements.at(-1).type, 'husk');
assert.equal(spawnerPlaced.unitPlacements.at(-1).team, 'husks', 'placed husks should author onto the husk faction by default');
assert.equal(spawnerPlaced.unitSpawners.at(-1).type, 'raider');
assert.equal(spawnerPlaced.unitSpawners.at(-1).team, 'raiders', 'placed raider spawners should author onto the raider faction by default');

const shrubPlaced = applyBsbV2AuthoringTool(spawnerPlaced, 'object:forest_shrub', 15, 11);
assert.equal(shrubPlaced.sceneObjects.at(-1).undergrowth.contract, BSB_V2_UNDERGROWTH_DNA_CONTRACT, 'placed undergrowth should author compact DNA rather than geometry');
assert.equal(shrubPlaced.sceneObjects.at(-1).undergrowth.species, 'forest_shrub', 'legacy scene-object type should resolve through an undergrowth species recipe');

const createdOak = applyBsbV2TreeOperation(spawnerPlaced, {
  op: 'create', id: 'tree:oak-proof', x: 18, y: 12, species: 'ancient_oak', seed: 18273, ageYears: 210
});
assert.equal(createdOak.contract, BSB_V2_TREE_OPERATION_CONTRACT);
assert.equal(createdOak.applied, true);
assert.deepEqual(createdOak.affectedIds, ['tree:oak-proof']);
assert.equal(createdOak.document.sceneObjects.find((entry) => entry.id === 'tree:oak-proof')?.tree.species, 'ancient_oak');
const agedOak = applyBsbV2TreeOperation(createdOak.document, { op: 'age', treeId: 'tree:oak-proof', years: 40 });
assert.equal(agedOak.document.sceneObjects.find((entry) => entry.id === 'tree:oak-proof')?.tree.ageYears, 250, 'Tree.age should change intent rather than geometry');
const damagedOak = applyBsbV2TreeOperation(agedOak.document, { op: 'damage', treeId: 'tree:oak-proof', amount: 0.25 });
assert.ok(damagedOak.document.sceneObjects.find((entry) => entry.id === 'tree:oak-proof').tree.health < 0.8, 'Tree.damage should alter health DNA');
const ancientForest = applyBsbV2TreeOperation(createdOak.document, { op: 'make_forest_ancient', scope: 'all', years: 120 });
assert.ok(ancientForest.affectedIds.length >= 2, 'high-level forest intent should apply one bounded operation across authored trees');
assert.ok(ancientForest.document.sceneObjects.filter((entry) => entry.tree).every((entry) => entry.tree.moss >= 0.28), 'ancient forest intent should increase age-derived traits');

const createdBramble = applyBsbV2UndergrowthOperation(shrubPlaced, {
  op: 'create', id: 'bramble:proof', x: 19, y: 12, species: 'ember_bramble', seed: 78231, density: .82
});
assert.equal(createdBramble.contract, BSB_V2_UNDERGROWTH_OPERATION_CONTRACT);
assert.deepEqual(createdBramble.affectedIds, ['bramble:proof']);
assert.equal(createdBramble.document.sceneObjects.find((entry) => entry.id === 'bramble:proof')?.type, 'smouldering_bramble', 'species recipe should choose the emitter-preserving authored type');
const damagedBramble = applyBsbV2UndergrowthOperation(createdBramble.document, { op: 'damage', undergrowthId: 'bramble:proof', amount: .3 });
assert.ok(damagedBramble.document.sceneObjects.find((entry) => entry.id === 'bramble:proof').undergrowth.health < .7, 'Undergrowth.damage should alter intent rather than mesh geometry');
const agedBramble = applyBsbV2UndergrowthOperation(createdBramble.document, { op: 'age', undergrowthId: 'bramble:proof', years: 5 });
assert.equal(agedBramble.document.sceneObjects.find((entry) => entry.id === 'bramble:proof').undergrowth.density, .82, 'age should preserve explicitly authored shape parameters');
const wildUndergrowth = applyBsbV2UndergrowthOperation(shrubPlaced, { op: 'make_undergrowth_wild', scope: 'all', years: 6 });
assert.ok(wildUndergrowth.affectedIds.length >= 2, 'one high-level operation should transform the authored undergrowth family');
assert.ok(wildUndergrowth.document.sceneObjects.filter((entry) => entry.undergrowth).every((entry) => entry.undergrowth.groundCover >= .4), 'wild intent should increase generated ground-cover parameters');

const legacyBirch = validateBsbV2AuthoringDocument({
  ...base,
  sceneObjects: [{ id: 'legacy-birch', type: 'birch_tree', x: 3, y: 4 }]
}).sceneObjects[0];
assert.equal(legacyBirch.type, 'tree', 'legacy species-as-type authoring should migrate to the canonical tree type');
assert.equal(legacyBirch.tree.species, 'silver_birch');
assert.equal(createBsbV2TreeDefinition({ seed: 99, species: 'old_pine' }, { id: 'seed-proof' }).seed, 99);
const legacyFern = validateBsbV2AuthoringDocument({
  ...base,
  sceneObjects: [{ id: 'legacy-fern', type: 'fern_patch', x: 3, y: 4 }]
}).sceneObjects[0];
assert.equal(legacyFern.undergrowth.contract, BSB_V2_UNDERGROWTH_DNA_CONTRACT, 'legacy fern records should normalize at the authoring boundary');
assert.equal(createBsbV2UndergrowthDefinition({ seed: 101, species: 'wood_fern' }, { id: 'fern-seed-proof', type: 'fern_patch' }).seed, 101);

const editedObject = patchBsbV2AuthoringRecord(spawnerPlaced, 'sceneObject', spawnerPlaced.sceneObjects.at(-1).id, {
  label: 'Canopy read test',
  visualWidthTiles: 2.4,
  visualHeightTiles: 3.1,
  visualOffsetY: -0.2
});
assert.equal(editedObject.sceneObjects.at(-1).label, 'Canopy read test');
assert.equal(editedObject.sceneObjects.at(-1).visualWidthTiles, 2.4);
assert.equal(editedObject.sceneObjects.at(-1).visualHeightTiles, 3.1);
assert.equal(editedObject.sceneObjects.at(-1).visualOffsetY, -0.2);

const editedSpawner = patchBsbV2AuthoringRecord(editedObject, 'spawner', editedObject.unitSpawners.at(-1).id, {
  type: 'werewolf',
  team: 'wolves',
  intervalSeconds: 2.5,
  initialDelaySeconds: 1.25,
  burstCount: 2,
  maxAlive: 5,
  limit: 11,
  spawnRadiusTiles: 1.75,
  hitPoints: 64,
  fixtureRadiusTiles: 0.7,
  audioEmitter: {
    emitterId: 'voice', profileId: 'creature_voice_spatial_v1', anchor: 'mouth', enabled: true,
    anchorHeightMeters: 0.82, referenceDistanceMeters: 2.4, maxDistanceMeters: 52,
    rolloffFactor: 1.05, coneInnerAngle: 210, coneOuterAngle: 300,
    coneOuterGain: 0.38, dopplerScale: 0.7, priority: 74
  }
});
assert.equal(editedSpawner.unitSpawners.at(-1).type, 'werewolf');
assert.equal(editedSpawner.unitSpawners.at(-1).team, 'wolves');
assert.equal(editedSpawner.unitSpawners.at(-1).intervalSeconds, 2.5);
assert.equal(editedSpawner.unitSpawners.at(-1).burstCount, 2);
assert.equal(editedSpawner.unitSpawners.at(-1).maxAlive, 5);
assert.equal(editedSpawner.unitSpawners.at(-1).limit, 11);
assert.equal(editedSpawner.unitSpawners.at(-1).spawnRadiusTiles, 1.75);
assert.equal(editedSpawner.unitSpawners.at(-1).hitPoints, 64);
assert.equal(editedSpawner.unitSpawners.at(-1).fixtureRadiusTiles, 0.7);
assert.equal(editedSpawner.unitSpawners.at(-1).audioEmitter.anchor, 'mouth', 'spawner instances should persist nested emitter overrides');
const editedRuntime = buildBsbV2RuntimeMap(editedSpawner);
assert.equal(editedRuntime.sceneObjects.at(-1).visualWidthTiles, 2.4, 'object inspector edits should bake into runtime scene object records');
assert.equal(editedRuntime.sceneObjects.at(-1).tree.contract, BSB_V2_TREE_DNA_CONTRACT, 'runtime bake should preserve Tree DNA and omit generated mesh data');
assert.equal(editedRuntime.unitSpawners.at(-1).type, 'werewolf', 'spawner payload type should bake into runtime spawner records');
assert.equal(editedRuntime.unitSpawners.at(-1).team, 'wolves', 'spawner payload team should bake into runtime spawner records');
assert.equal(editedRuntime.unitSpawners.at(-1).hitPoints, 64, 'spawner fixture health should bake into runtime spawner records');
assert.equal(editedRuntime.unitSpawners.at(-1).fixtureRadiusTiles, 0.7, 'spawner fixture radius should bake into runtime spawner records');
assert.deepEqual(editedRuntime.unitSpawners.at(-1).audioEmitter, editedSpawner.unitSpawners.at(-1).audioEmitter, 'audio emitter overrides should survive AXIOM edit to runtime bake without copied coordinates');
assert.throws(() => patchBsbV2AuthoringRecord(editedSpawner, 'spawner', editedSpawner.unitSpawners.at(-1).id, {
  audioEmitter: { profileId: 'creature_voice_spatial_v1', position: { x: 4, y: 2 } }
}), /audio_emitter_duplicate_position/, 'AXIOM should reject audio coordinates that duplicate owner Transform truth');

const migratedLegacyTeams = validateBsbV2AuthoringDocument({
  ...base,
  unitPlacements: [{ id: 'legacy-husk', type: 'husk', team: 'enemy', x: 12, y: 12 }],
  unitSpawners: [{ id: 'legacy-raider-spawner', type: 'raider', team: 'enemy', x: 13, y: 12 }]
});
assert.equal(migratedLegacyTeams.unitPlacements[0].team, 'husks', 'old AXIOM-authored generic enemy husks should migrate to actor faction defaults');
assert.equal(migratedLegacyTeams.unitSpawners[0].team, 'raiders', 'old AXIOM-authored generic enemy spawners should migrate to actor faction defaults');

const runtimeMap = buildBsbV2RuntimeMap(spawnerPlaced);
assert.equal(runtimeMap.contract, BSB_V2_RUNTIME_MAP_CONTRACT);
assert.equal(runtimeMap.revision, 4);
assert.equal(runtimeMap.sceneObjects.some((entry) => entry.type === 'tree'), true);
assert.equal(runtimeMap.sceneObjects.find((entry) => entry.type === 'fern_patch')?.undergrowth.contract, BSB_V2_UNDERGROWTH_DNA_CONTRACT, 'runtime bake should preserve compact undergrowth DNA and omit generated mesh data');
assert.equal(runtimeMap.unitPlacements.some((entry) => entry.type === 'husk'), true);
assert.equal(runtimeMap.unitPlacements.find((entry) => entry.type === 'husk')?.team, 'husks');
assert.equal(runtimeMap.unitSpawners.some((entry) => entry.type === 'raider'), true);
assert.equal(runtimeMap.unitSpawners.find((entry) => entry.type === 'raider')?.team, 'raiders');
assert.equal(runtimeMap.transitions.escapeZone.nextMapPath, '/data/maps/axiom-second-approach.runtime-map.json', 'runtime bake should preserve escape-zone next-map metadata');
assert.equal(runtimeMap.transitions.escapeZone.arrivalSequenceId, 'smoke_instinct_awakening', 'runtime bake should preserve arrival sequence metadata');
assert.equal(runtimeMap.enemySpawns.length, 0, 'runtime bake should not duplicate faction-owned unit placements into the legacy generic enemy list');
assert.equal(Object.hasOwn(runtimeMap, 'blobMasks'), false, 'runtime interchange should omit derived blob-mask caches');
for (const forbidden of ['editorState', 'sceneDocument', 'savedScenes', 'selection', 'brush', 'lastResize']) {
  assert.equal(Object.hasOwn(runtimeMap, forbidden), false, `runtime bake should exclude ${forbidden}`);
}

const resizeSource = applyBsbV2AuthoringTool(spawnerPlaced, 'terrain:scorched', 2, 3, { brushRadius: 0 });
const resized = resizeBsbV2AuthoringDocument(resizeSource, 80, 60, { resizedAt: '2026-07-02T12:00:00.000Z' });
assert.equal(resized.width, 80);
assert.equal(resized.height, 60);
assert.equal(resized.revision, resizeSource.revision + 1);
assert.equal(resized.lastResize.contract, BSB_V2_MAP_RESIZE_CONTRACT);
assert.deepEqual(resized.lastResize.offset, { x: 19, y: 15 });
assert.equal(resized.lastResize.anchor, 'center');
assert.equal(resized.lastResize.fillTerrain, 'grass');
assert.equal(resized.lastResize.preserved.tiles, 42 * 30);
for (let y = 0; y < resizeSource.height; y += 1) {
  for (let x = 0; x < resizeSource.width; x += 1) {
    assert.equal(resized.tiles[y + 15][x + 19], resizeSource.tiles[y][x], `resize should preserve terrain ${x},${y}`);
  }
}
assert.equal(resized.tiles[0][0], 'grass', 'new top-left cells should use default terrain');
assert.equal(resized.tiles[59][79], 'grass', 'new bottom-right cells should use default terrain');
assert.deepEqual(resized.spawn, { x: resizeSource.spawn.x + 19, y: resizeSource.spawn.y + 15 });
assert.deepEqual(resized.escapeZone, { ...resizeSource.escapeZone, x: resizeSource.escapeZone.x + 19, y: resizeSource.escapeZone.y + 15 });
assert.equal(resized.sceneObjects.at(-1).id, resizeSource.sceneObjects.at(-1).id, 'resize should preserve object identity');
assert.equal(resized.sceneObjects.at(-1).x, resizeSource.sceneObjects.at(-1).x + 19, 'resize should shift objects with terrain');
assert.equal(resized.unitPlacements.at(-1).y, resizeSource.unitPlacements.at(-1).y + 15, 'resize should shift units with terrain');
assert.equal(resized.unitSpawners.at(-1).x, resizeSource.unitSpawners.at(-1).x + 19, 'resize should shift spawners with terrain');
assert.throws(() => resizeBsbV2AuthoringDocument(resizeSource, 40, 60), /bsb_map_resize_shrink_not_supported/);

const normalizedResize = validateBsbV2AuthoringDocument(resized);
const expandedPaint = applyBsbV2AuthoringTool(normalizedResize, 'terrain:water', 75, 55, { brushRadius: 2 });
const expandedRuntime = buildBsbV2RuntimeMap(expandedPaint);
assert.equal(expandedRuntime.width, 80);
assert.equal(expandedRuntime.height, 60);
assert.equal(expandedRuntime.tiles[55][75], 'water');
assert.equal(Object.hasOwn(expandedRuntime, 'blobMasks'), false, 'expanded bake should keep terrain as the only interchange truth');
assert.equal(Object.hasOwn(expandedRuntime, 'lastResize'), false, 'runtime bake should exclude authoring resize provenance');

const fitLayout = resolveBsbV2MapCanvasLayout(resized, createBsbV2MapViewport(resized), 1000, 700);
assert.deepEqual(fitLayout.visibleTiles, { minX: 0, minY: 0, maxX: 79, maxY: 59 });
const zoomedViewport = zoomBsbV2MapViewport(resized, fitLayout.viewport, fitLayout, 4, 500, 350, 1000, 700);
const zoomedLayout = resolveBsbV2MapCanvasLayout(resized, zoomedViewport, 1000, 700);
assert.equal(zoomedLayout.viewport.zoom, 4);
assert.ok(zoomedLayout.visibleTiles.maxX - zoomedLayout.visibleTiles.minX < 79, 'zoom should expose a bounded edit window');
const bottomRightViewport = panBsbV2MapViewport(resized, zoomedViewport, zoomedLayout, -100000, -100000, 1000, 700);
const bottomRightLayout = resolveBsbV2MapCanvasLayout(resized, bottomRightViewport, 1000, 700);
assert.equal(bottomRightLayout.visibleTiles.maxX, 79, 'pan clamp should reach the expanded right edge');
assert.equal(bottomRightLayout.visibleTiles.maxY, 59, 'pan clamp should reach the expanded bottom edge');

const manifestSource = JSON.parse(await readFile(
  new URL('../../../../_A_Projects/BLACK_SKY_BOUND_V2/data/maps/manifest.json', import.meta.url),
  'utf8'
));
const library = resolveBsbV2MapLibrary(manifestSource);
assert.equal(library.maps.length, 3, 'AXIOM map forge should read campaign regions plus the bounded demo arena');
assert.equal(library.maps[0].authoringPath, 'data/bsb-v2/maps/first_escape.authoring.json');
assert.equal(library.maps[0].nextMapId, 'ash_road_threshold');
assert.equal(library.maps[1].authoringPath, 'data/bsb-v2/maps/second_approach.authoring.json');
assert.equal(library.maps[2].authoringPath, 'data/bsb-v2/maps/crown_of_cinders.authoring.json');
const publication = resolveBsbV2MapPublication(manifestSource, spawnerPlaced);
assert.equal(manifestSource.contract, BSB_V2_MAP_MANIFEST_CONTRACT);
assert.equal(BSB_V2_MAP_MANIFEST_PATH, 'data/maps/manifest.json');
assert.equal(publication.catalogueMapId, 'first_flightless_night');
assert.equal(publication.runtimeMapId, runtimeMap.id);
assert.equal(publication.scenarioId, runtimeMap.scenarioId);
assert.equal(publication.runtimePath, '/data/maps/axiom-first-escape.runtime-map.json');
assert.equal(publication.writePath, 'data/maps/axiom-first-escape.runtime-map.json');
assert.equal(publication.authoringPath, 'data/bsb-v2/maps/first_escape.authoring.json');
const verifiedRuntime = inspectBsbV2RuntimeBake(spawnerPlaced, runtimeMap, publication);
assert.equal(verifiedRuntime.status, 'current');
assert.equal(verifiedRuntime.spawnMatches, true);
assert.equal(inspectBsbV2RuntimeBake(spawnerPlaced, { ...runtimeMap, revision: runtimeMap.revision - 1 }, publication).status, 'stale');
assert.match(inspectBsbV2RuntimeBake(spawnerPlaced, { ...runtimeMap, spawn: { x: 0, y: 0 } }, publication).mismatches.join(','), /player_spawn_mismatch/);
assert.equal(inspectBsbV2RuntimeBake(spawnerPlaced, null, publication).status, 'failed');

const secondPublication = resolveBsbV2MapPublication(manifestSource, secondBase);
assert.equal(secondPublication.catalogueMapId, 'ash_road_threshold');
assert.equal(secondPublication.runtimeMapId, 'axiom_second_approach');
assert.equal(secondPublication.runtimePath, '/data/maps/axiom-second-approach.runtime-map.json');
assert.equal(secondPublication.authoringPath, 'data/bsb-v2/maps/second_approach.authoring.json');
const arenaPublication = resolveBsbV2MapPublication(manifestSource, arenaBase);
assert.equal(arenaPublication.catalogueMapId, 'crown_of_cinders_demo');
assert.equal(arenaPublication.runtimePath, '/data/maps/axiom-crown-of-cinders.runtime-map.json');

assert.throws(() => validateBsbV2AuthoringDocument({ ...base, contract: 'wrong' }), /bsb_authoring_contract_invalid/);
assert.throws(() => applyBsbV2AuthoringTool(base, 'unknown', 1, 1), /bsb_authoring_tool_unknown/);
assert.throws(
  () => resolveBsbV2MapPublication({ ...manifestSource, maps: [] }, base),
  /bsb_map_manifest_maps_missing/
);
assert.throws(
  () => resolveBsbV2MapPublication({
    ...manifestSource,
    maps: [{ ...manifestSource.maps[0], runtimePath: '../../outside.json' }]
  }, base),
  /bsb_map_manifest_runtime_path_invalid/
);
assert.throws(
  () => resolveBsbV2MapLibrary({
    ...manifestSource,
    maps: [{ ...manifestSource.maps[0], authoringPath: '../outside.authoring.json' }, manifestSource.maps[1]]
  }),
  /bsb_map_manifest_authoring_path_invalid/
);
assert.throws(
  () => resolveBsbV2MapLibrary({
    ...manifestSource,
    maps: [{ ...manifestSource.maps[0], nextMapId: 'missing' }, manifestSource.maps[1]]
  }),
  /bsb_map_manifest_next_missing:first_flightless_night:missing/
);

const authoredFirstMap = validateBsbV2AuthoringDocument(JSON.parse(await readFile(
  new URL('../data/bsb-v2/maps/first_escape.authoring.json', import.meta.url),
  'utf8'
)));
assert.equal(authoredFirstMap.transitions.escapeZone.departureSequenceId, 'smoke_instinct_departure', 'source transition should identify its departure scene');
assert.equal(authoredFirstMap.sceneSequences[0].contract, BSB_V2_TRANSITION_SEQUENCE_CONTRACT, 'scene sequence should retain its dedicated authoring contract');
assert.deepEqual(
  authoredFirstMap.sceneSequences[0].actorTracks.map((track) => track.actorId),
  ['raider:34:8:2200', 'raider:39:11:2201'],
  'scene must bind stable authored raiders rather than inferred runtime neighbours'
);
assert.equal(authoredFirstMap.sceneSequences[0].camera.zoom, 3.25, 'landing impact should tighten the authored camera without breaking northward orientation');
assert.equal(authoredFirstMap.sceneSequences[0].actorTracks[0].path[0].y, 9.75, 'the first scene raider should begin behind the player and emerge into the tightened frame');
assert.equal(authoredFirstMap.sceneSequences[0].smoke.coverageThreshold, 0.995, 'outgoing smoke should reach an effectively opaque handoff');
const bakedFirstMap = JSON.parse(await readFile(
  new URL('../../../../_A_Projects/BLACK_SKY_BOUND_V2/data/maps/axiom-first-escape.runtime-map.json', import.meta.url),
  'utf8'
));
assert.deepEqual(buildBsbV2RuntimeMap(authoredFirstMap), bakedFirstMap, 'opening runtime map must be an exact bake of AXIOM source');
const authoredSecondMap = validateBsbV2AuthoringDocument(JSON.parse(await readFile(
  new URL('../data/bsb-v2/maps/second_approach.authoring.json', import.meta.url),
  'utf8'
)));
const bakedSecondMap = JSON.parse(await readFile(
  new URL('../../../../_A_Projects/BLACK_SKY_BOUND_V2/data/maps/axiom-second-approach.runtime-map.json', import.meta.url),
  'utf8'
));
assert.deepEqual(buildBsbV2RuntimeMap(authoredSecondMap), bakedSecondMap, 'second-region runtime map must be an exact bake of AXIOM source');
const authoredArenaMap = validateBsbV2AuthoringDocument(JSON.parse(await readFile(
  new URL('../data/bsb-v2/maps/crown_of_cinders.authoring.json', import.meta.url),
  'utf8'
)));
const bakedArenaMap = JSON.parse(await readFile(
  new URL('../../../../_A_Projects/BLACK_SKY_BOUND_V2/data/maps/axiom-crown-of-cinders.runtime-map.json', import.meta.url),
  'utf8'
));
assert.deepEqual(buildBsbV2RuntimeMap(authoredArenaMap), bakedArenaMap, 'public demo runtime map must be an exact bake of AXIOM arena source');
assert.equal(authoredArenaMap.unitSpawners.length, 15, 'arena authors should see every wave spawner in Map Forge');
assert.deepEqual(authoredSecondMap.spawn, { x: 24, y: 31, rotation: -Math.PI / 2 }, 'arrival authoring should preserve south-edge position and north facing');
assert.deepEqual(
  authoredSecondMap.unitPlacements.slice(0, 5).map(({ x, y }) => ({ x, y })),
  [{ x: 20, y: 24 }, { x: 22, y: 23 }, { x: 24, y: 22 }, { x: 26, y: 23 }, { x: 28, y: 24 }],
  'authored smoke-screen raiders should form a northward pursuit line ahead of the arrival'
);
const tunedSequence = applyBsbV2TransitionSequenceOperation(authoredFirstMap, {
  op: 'set_phase_duration',
  sequenceId: 'smoke_instinct_departure',
  phaseId: 'smoke_cover',
  durationSeconds: 1.55
});
assert.equal(tunedSequence.afterRevision, authoredFirstMap.revision + 1, 'semantic sequence tuning should be one authoring revision');
assert.equal(tunedSequence.document.sceneSequences[0].phases[2].durationSeconds, 1.55, 'semantic operation should update only the selected phase timing');
const tunedRuntime = buildBsbV2RuntimeMap(tunedSequence.document);
assert.equal(tunedRuntime.sceneSequences[0].phases[2].durationSeconds, 1.55, 'runtime bake should carry authored sequence timing exactly');
assert.equal(
  parseBsbV2TransitionSequenceCommand('can you change the smoke variable in the scene transition - mama lands to 1.55 seconds please'),
  null,
  'indirect natural language should cross the model inference seam instead of depending on a magic parser phrase'
);
const inferredSmokeProposal = normalizeBsbV2TransitionSequenceIntentProposal({
  operation: {
    op: 'set_phase_duration',
    sequenceId: 'smoke_instinct_departure',
    phaseId: 'smoke_cover',
    durationSeconds: 1.55
  },
  confidence: 0.94,
  reason: 'The user refers to the smoke timing in the Mama lands transition.'
});
assert.equal(inferredSmokeProposal.contract, BSB_V2_TRANSITION_SEQUENCE_INTENT_PROPOSAL_CONTRACT);
assert.equal(inferredSmokeProposal.classification, 'projection', 'model interpretation must remain a proposal until canonical apply');
assert.deepEqual(inferredSmokeProposal.operation, {
  op: 'set_phase_duration',
  sequenceId: 'smoke_instinct_departure',
  phaseId: 'smoke_cover',
  durationSeconds: 1.55
});
assert.equal(
  parseBsbV2TransitionSequenceCommand('set the landing impact duration to 0.8 seconds')?.parameters?.phaseId,
  'impact',
  'impact wording should remain distinct from smoke timing'
);
assert.equal(
  parseBsbV2TransitionSequenceCommand('change the raiders charging time to 1.8 seconds')?.parameters?.phaseId,
  'raider_charge',
  'charging aliases should resolve to the authored raider-charge phase'
);
assert.throws(
  () => validateBsbV2AuthoringDocument({
    ...authoredFirstMap,
    unitPlacements: authoredFirstMap.unitPlacements.filter((entry) => entry.id !== 'raider:34:8:2200')
  }),
  /bsb_transition_sequence_actor_missing/,
  'authoring validation should fail loudly if an authored scene actor disappears'
);

console.log('bsb-v2-map-authoring.test.mjs passed');
