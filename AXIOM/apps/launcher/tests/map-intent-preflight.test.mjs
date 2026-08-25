import assert from 'node:assert/strict';
import {
  MAP_INTENT_PREFLIGHT_CONTRACT,
  createMapIntentPreflight,
  estimateDimensionsForDuration,
  normalizePlayableSpaceProfile
} from '../public/map-intent-preflight.js';
import {
  applyBsbV2PlayableSpacePreflight,
  createBsbV2PlayableSpaceDraft,
  createDefaultBsbV2AuthoringDocument,
  createSecondApproachBsbV2AuthoringDocument
} from '../public/bsb-v2-map-authoring.js';
import { evaluateMapForgeSpatialQuality } from '../public/level-design-spatial-critic.js';
import { applyPlayableBoundaryPreview, createPlayableBoundaryPreview } from '../public/level-design-boundary-enforcer.js';
import { auditRuntimeTraversal } from '../server/runtime-traversal-audit.js';

const catalogue = {
  defaultMapId: 'first_flightless_night',
  maps: [
    {
      id: 'first_flightless_night', title: 'First Flightless Night', runtimeMapId: 'axiom_first_escape',
      scenarioId: 'first_flightless_night', authoringPath: 'data/bsb-v2/maps/first_escape.authoring.json',
      runtimePath: '/data/maps/axiom-first-escape.runtime-map.json', width: 48, height: 32
    },
    {
      id: 'ash_road_threshold', title: 'Ash Road Threshold', runtimeMapId: 'axiom_second_approach',
      scenarioId: 'ash_road_threshold', authoringPath: 'data/bsb-v2/maps/second_approach.authoring.json',
      runtimePath: '/data/maps/axiom-second-approach.runtime-map.json', width: 56, height: 34
    }
  ]
};
const currentMap = {
  catalogueMapId: 'first_flightless_night', mapId: 'axiom_first_escape', title: 'First Flightless Night',
  scenarioId: 'first_flightless_night', authoringPath: 'data/bsb-v2/maps/first_escape.authoring.json',
  revision: 2599, width: 48, height: 32
};
const profile = normalizePlayableSpaceProfile({
  contract: 'axiom.playable-space-profile.v1',
  player: { movementSpeedTilesPerSecond: 4.65, sourcePath: 'src/data/actors.js', sourceSymbol: 'ACTORS.young_dragon.speed' },
  pacing: { traversalShare: 0.32 },
  route: { widthTiles: 3, rowSpacingTiles: 7, areaShare: 0.18 },
  mapLimits: { minDimension: 32, maxDimension: 256, defaultWidth: 64, defaultHeight: 48 },
  assumptions: ['Duration is a planning estimate until a runtime playtest measures it.']
});
const invocation = { id: 'model_preflight_test', model: 'qwen3.5:9b', responseSummary: 'Resolved Ash Road.' };
const modelOutput = {
  action: 'use_existing', targetCatalogueMapId: 'ash_road_threshold', newMapTitle: null,
  playableMinutes: 10, biome: 'forest', route: {
    from: 'southern arrival', to: 'northern gate', direction: 'northbound', topology: 'meander',
    shortcutPolicy: 'prevent', boundaryStyle: 'mixed_natural'
  },
  pacingBeats: [
    { kind: 'arrival', label: 'read the route', atFraction: 0.05, lateralOffset: -.22, openness: .68, boundaryPressure: .5, landmarkIntent: 'broken waystone' },
    { kind: 'pressure', label: 'first pressure', atFraction: 0.38, lateralOffset: .48, openness: .42, boundaryPressure: .82, landmarkIntent: 'burned watch tree' },
    { kind: 'recovery', label: 'quiet landmark', atFraction: 0.62, lateralOffset: .1, openness: .75, boundaryPressure: .4, landmarkIntent: 'mossy spring' },
    { kind: 'climax', label: 'gate confrontation', atFraction: 0.86, lateralOffset: -.4, openness: .9, boundaryPressure: .9, landmarkIntent: 'ash gate ridge' }
  ],
  requestedDimensions: { width: null, height: null },
  summary: 'Use Ash Road Threshold for a ten-minute forest route.', rationale: 'The user named that existing map.'
};

const estimate = estimateDimensionsForDuration(10, profile);
assert.deepEqual(estimate, { width: 146, height: 104, targetRouteTiles: 893, traversalSeconds: 192 });

const existing = createMapIntentPreflight({
  id: 'preflight_existing', prompt: 'Make Ash Road Threshold a ten-minute forest route.',
  catalogue, currentMap, profile, modelOutput, modelInvocation: invocation, createdAt: '2026-08-17T10:00:00.000Z'
});
assert.equal(existing.contract, MAP_INTENT_PREFLIGHT_CONTRACT);
assert.equal(existing.previousMap.catalogueMapId, 'first_flightless_night');
assert.equal(existing.target.catalogueMapId, 'ash_road_threshold');
assert.equal(existing.target.mapId, 'axiom_second_approach');
assert.equal(existing.target.changedFromActive, true);
assert.deepEqual(existing.playableSpace.dimensions.target, { width: 146, height: 104 });
assert.equal(existing.playableSpace.classification, 'planning_estimate');
assert.equal(existing.playableSpace.requiresPreparation, true);
assert.equal(existing.playableSpace.route.topology, 'meander');
assert.equal(existing.playableSpace.route.shortcutPolicy, 'prevent');
assert.equal(existing.playableSpace.boundaryIntent.enforcementStatus, 'pending_runtime_validation');

const preparedExisting = applyBsbV2PlayableSpacePreflight(createSecondApproachBsbV2AuthoringDocument(), existing);
assert.equal(preparedExisting.applied, true);
assert.equal(preparedExisting.mapId, 'axiom_second_approach');
assert.equal(preparedExisting.afterRevision, preparedExisting.beforeRevision + 1);
assert.deepEqual(preparedExisting.dimensions.after, { width: 146, height: 104 });
assert.ok(preparedExisting.route.authoredLengthTiles > 90 && preparedExisting.route.authoredLengthTiles < 300);
assert.equal(preparedExisting.route.topology, 'meander');
assert.equal(preparedExisting.preparedDocument.playableSpace.pacingBeats.length, 4);
assert.equal(preparedExisting.preparedDocument.playableSpace.boundaries.shortcutPolicy, 'prevent');
assert.equal(preparedExisting.preparedDocument.playableSpace.boundaries.enforcementStatus, 'pending_runtime_validation');
const semanticRouteScore = evaluateMapForgeSpatialQuality({ successCriteria: { minimumCreated: 12, minimumPathClearanceTiles: 1.5 }, batches: [] }, preparedExisting.preparedDocument);
assert.equal(semanticRouteScore.designGate.routeQuality.blocking, false);
assert.equal(semanticRouteScore.nextAction.kind, 'add_family');
assert.equal(preparedExisting.preparedDocument.tiles[preparedExisting.preparedDocument.spawn.y][preparedExisting.preparedDocument.spawn.x], 'dirt');
const boundaryPreview = createPlayableBoundaryPreview(preparedExisting.preparedDocument);
assert.equal(boundaryPreview.sourceRevision, preparedExisting.afterRevision);
assert.ok(boundaryPreview.candidateCount > 100);
const traversalAudit = auditRuntimeTraversal(boundaryPreview.preparedDocument, { sessionId: 'level_boundary_test' });
assert.equal(traversalAudit.reachable, true);
assert.equal(traversalAudit.pass, true);
assert.ok(traversalAudit.shortcutRatio >= traversalAudit.minimumShortcutRatio);
const enforced = applyPlayableBoundaryPreview(preparedExisting.preparedDocument, boundaryPreview, traversalAudit, { sessionId: 'level_boundary_test' });
assert.equal(enforced.document.playableSpace.boundaries.enforcementStatus, 'runtime_verified');
assert.equal(enforced.receipt.changedTileCount, boundaryPreview.candidateCount);
assert.throws(
  () => applyBsbV2PlayableSpacePreflight(createDefaultBsbV2AuthoringDocument(), existing),
  /bsb_playable_space_target_map_mismatch/
);

const created = createMapIntentPreflight({
  id: 'preflight_new', prompt: 'Create a new ten-minute wetland approach.', catalogue, currentMap, profile,
  modelOutput: {
    ...modelOutput, action: 'create_new', targetCatalogueMapId: null, newMapTitle: 'Drowned Bell Approach',
    biome: 'wetland', summary: 'Create a new wetland approach.', rationale: 'The user explicitly requested a new map.'
  },
  modelInvocation: invocation, createdAt: '2026-08-17T10:00:00.000Z'
});
assert.equal(created.target.status, 'planned_new');
assert.equal(created.target.catalogueMapId, 'drowned_bell_approach');
assert.equal(created.target.authoringPath, 'data/bsb-v2/maps/drowned_bell_approach.authoring.json');
const draft = createBsbV2PlayableSpaceDraft(created);
assert.equal(draft.mapId, 'axiom_drowned_bell_approach');
assert.equal(draft.revision, 0);
const preparedNew = applyBsbV2PlayableSpacePreflight(draft, created);
assert.equal(preparedNew.afterRevision, 1);
assert.equal(preparedNew.preparedDocument.playableSpace.biome, 'wetland');

assert.throws(() => createMapIntentPreflight({
  prompt: 'Use a missing map.', catalogue, currentMap, profile,
  modelOutput: { ...modelOutput, targetCatalogueMapId: 'not_in_catalogue' }, modelInvocation: invocation
}), /map_intent_catalogue_target_missing/);

console.log('map-intent-preflight.test.mjs: ok');
