import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createLevelDesignSessionService, LEVEL_DESIGN_SESSION_CONTRACT } from '../server/level-design-session.js';

const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-level-session-'));
let current = new Date('2026-08-17T10:00:00.000Z');
const service = createLevelDesignSessionService({ dataRoot, now: () => current, staleAfterMs: 4000 });

function preflightFor(map, id = 'preflight_server_test') {
  return {
    contract: 'axiom.map-intent-preflight.v1', id, status: 'ready', prompt: 'Use the resolved target map.',
    action: 'use_existing', summary: 'Use Ash Road Threshold.', rationale: 'The user named the existing map.',
    previousMap: {
      catalogueMapId: 'first_flightless_night', mapId: 'axiom_first_escape', title: 'First Flightless Night',
      authoringPath: 'data/bsb-v2/maps/first_escape.authoring.json', revision: 39
    },
    target: {
      status: 'resolved_existing', exists: true, catalogueMapId: map.catalogueMapId, title: 'Ash Road Threshold',
      mapId: map.mapId, scenarioId: 'ash_road_threshold', authoringPath: map.authoringPath,
      runtimePath: '/data/maps/axiom-second-approach.runtime-map.json', changedFromActive: true
    },
    playableSpace: {
      contract: 'axiom.playable-space-brief.v1', classification: 'planning_estimate', requestedMinutes: null,
      biome: 'forest', route: { from: 'arrival', to: 'destination', targetLengthTiles: null, widthTiles: 3, rowSpacingTiles: 7 },
      pacingBeats: [], dimensions: { before: { width: 56, height: 34 }, target: { width: 56, height: 34 }, source: 'unchanged' },
      estimate: { traversalSeconds: null, movementSpeedTilesPerSecond: 4.65, traversalShare: 0.32, movementSource: null, assumptions: [] },
      requiresPreparation: false, automaticSave: false, automaticBake: false
    },
    modelInvocation: { id: `${id}_model`, model: 'qwen3.5:9b', ok: true, responseSummary: 'Resolved the named map.' },
    binding: { catalogueValidated: true, targetExists: true, targetMustMatchBeforeBrush: true, noActiveMapFallback: true },
    createdAt: current.toISOString()
  };
}

function recordPreflight(session, revision) {
  return service.record(session.id, {
    type: 'preflight',
    receipt: {
      contract: 'axiom.map-forge-playable-space-preparation.v1', sessionId: session.id,
      preflightId: session.preflight.id, action: session.preflight.action, applied: false,
      mapId: session.map.mapId, catalogueMapId: session.map.catalogueMapId, authoringPath: session.map.authoringPath,
      beforeRevision: revision, afterRevision: revision, dimensions: { before: { width: 56, height: 34 }, after: { width: 56, height: 34 } },
      route: null, pacingBeats: [], preparedDocument: { mapId: session.map.mapId, revision }, undoDocument: { mapId: session.map.mapId, revision },
      at: current.toISOString()
    }
  });
}

function evaluationFor(revision, options = {}) {
  const routeBlocked = options.nextAction === 'route_revision_required';
  const completed = options.nextAction === 'complete';
  return {
    contract: 'axiom.map-forge-spatial-scorecard.v1',
    revision,
    criteriaMet: completed,
    improvement: options.improvement ?? 3,
    signature: completed ? 'integrity_and_design_pass' : routeBlocked ? 'route_lawnmower_repetition' : 'missing_families',
    summary: completed ? 'Both gates pass.' : routeBlocked ? 'Route revision required.' : 'Tree layer read back; more design work remains.',
    integrityGate: {
      pass: completed,
      reasons: completed ? [] : [{ code: 'missing_families', label: 'Still needs undergrowth and geology.', severity: 'needs_work', zoneId: null, actual: 1, target: 3 }],
      createdCount: completed ? 12 : 3,
      familyCoverage: completed ? ['tree', 'undergrowth', 'geology'] : ['tree'],
      missingFamilies: completed ? [] : ['undergrowth', 'geology'],
      missingReadbackIds: [],
      pathClearanceViolations: []
    },
    designGate: {
      pass: completed,
      score: completed ? 88 : routeBlocked ? 12 : 34,
      reasons: completed ? [] : [{ code: routeBlocked ? 'route_lawnmower_repetition' : 'zone_coverage', label: routeBlocked ? 'Route repeats long parallel runs.' : 'Encounter treatment is sparse.', severity: routeBlocked ? 'blocking' : 'needs_work', zoneId: routeBlocked ? null : 'beat_encounter', actual: .1, target: .32 }],
      routeQuality: { pass: !routeBlocked, blocking: routeBlocked, score: routeBlocked ? 5 : 80, reasons: [] },
      coverage: { binCount: 8, coveredBins: [0], coveredCount: 1, ratio: .125, longestUntreatedBins: 7, longestUntreatedRatio: .875 },
      zones: [{ id: 'beat_encounter', kind: 'encounter', label: 'Encounter', startFraction: .2, endFraction: .5, familyCoverage: ['tree'], familyCounts: { tree: 3, undergrowth: 0, geology: 0 }, landmarkCount: 0, requiresLandmark: true, coverageRatio: .1, score: 20, pass: false }]
    },
    nextAction: completed
      ? { kind: 'complete', family: null, zoneId: null, zoneKind: null, startFraction: null, endFraction: null, summary: 'Both gates pass.' }
      : routeBlocked
        ? { kind: 'route_revision_required', family: null, zoneId: null, zoneKind: null, startFraction: null, endFraction: null, summary: 'Replace the repetitive route.' }
        : { kind: 'add_family', family: 'undergrowth', zoneId: 'beat_encounter', zoneKind: 'encounter', startFraction: .2, endFraction: .5, summary: 'Add undergrowth to the encounter.' },
    metrics: { createdCount: completed ? 12 : 3, familyCoverage: completed ? ['tree', 'undergrowth', 'geology'] : ['tree'], missingFamilies: completed ? [] : ['undergrowth', 'geology'], missingReadbackIds: [], pathTileCount: 40, pathClearanceViolations: [], spatialQuality: { score: completed ? 88 : routeBlocked ? 12 : 34, routeBlocking: routeBlocked } }
  };
}

try {
  const created = service.create({
    prompt: 'Build out a forest biome around the Ash Road path.',
    source: { surface: 'chat', activityAttemptId: 'attempt_test' },
    project: { id: 'black-sky-bound-v2-demo', name: 'Black Sky Bound v2', root: 'C:/repo/BLACK_SKY_BOUND_V2' },
    map: { mapId: 'axiom_second_approach', catalogueMapId: 'ash_road_threshold', authoringPath: 'data/bsb-v2/maps/second_approach.authoring.json', revision: 40 },
    preflight: preflightFor({ mapId: 'axiom_second_approach', catalogueMapId: 'ash_road_threshold', authoringPath: 'data/bsb-v2/maps/second_approach.authoring.json' })
  });
  assert.equal(created.contract, LEVEL_DESIGN_SESSION_CONTRACT);
  assert.equal(created.state, 'awaiting_user');
  assert.equal(created.authority.approved, false);

  const approved = service.control(created.id, { action: 'approve', clientId: 'browser_1' });
  assert.equal(approved.state, 'planning');
  assert.equal(approved.authority.approved, true);
  assert.equal(approved.authority.automaticSave, false);
  recordPreflight(created, 40);

  const planning = service.record(created.id, { type: 'phase', phase: 'planning', summary: 'Plan trees from canonical evidence.' });
  assert.equal(planning.iteration, 1);
  service.record(created.id, {
    type: 'model_invocation',
    invocation: { id: 'model_test_1', model: 'qwen3.5:9b', requestedFamily: 'tree', ok: true, responseSummary: 'Frame the path with pine.', plan: { family: 'tree' } }
  });
  service.record(created.id, { type: 'phase', phase: 'previewing', summary: 'Show tree candidates.' });
  service.record(created.id, {
    type: 'projection',
    projection: { id: 'scene-preview:101', family: 'tree', sourceRevision: 40, candidateCount: 3, blockedCount: 2, strokeCenters: [{ x: 4, y: 4 }] }
  });
  service.record(created.id, { type: 'phase', phase: 'applying', summary: 'Apply tree batch.' });
  const applied = service.record(created.id, {
    type: 'batch',
    batch: {
      id: 'batch_1_tree_41',
      family: 'tree',
      projectionId: 'scene-preview:101',
      receipt: {
        contract: 'axiom.scene-brush-receipt.v1',
        receiptId: 'tree-receipt-41',
        operation: 'paint',
        family: 'tree',
        previewId: 'scene-preview:101',
        mapId: 'axiom_second_approach',
        beforeRevision: 40,
        afterRevision: 41,
        createdIds: ['tree:a', 'tree:b', 'tree:c'],
        createdCount: 3
      },
      readback: { ok: true, revision: 41, foundIds: ['tree:a', 'tree:b', 'tree:c'] }
    }
  });
  assert.equal(applied.map.currentRevision, 41);
  assert.equal(applied.batches[0].receipt.createdCount, 3);
  assert.throws(() => service.record(created.id, {
    type: 'batch',
    batch: {
      id: 'batch_stale',
      family: 'tree',
      projectionId: 'scene-preview:stale',
      receipt: { contract: 'axiom.scene-brush-receipt.v1', operation: 'paint', mapId: 'axiom_second_approach', beforeRevision: 40, afterRevision: 41, createdIds: ['tree:z'], createdCount: 1 }
    }
  }), /batch_revision_stale/);

  service.record(created.id, { type: 'phase', phase: 'evaluating', summary: 'Evaluate tree layer.' });
  const evaluated = service.record(created.id, {
    type: 'evaluation',
    evaluation: evaluationFor(41)
  });
  assert.equal(evaluated.state, 'evaluating');
  assert.equal(evaluated.noProgress.consecutive, 0);
  assert.equal(evaluated.latestEvaluation.designGate.score, 34);
  assert.equal(evaluated.latestEvaluation.nextAction.family, 'undergrowth');
  assert.throws(() => service.record(created.id, {
    type: 'evaluation',
    evaluation: { ...evaluationFor(41), criteriaMet: true }
  }), /gate_mismatch/);

  const directed = service.control(created.id, { action: 'intervene', direction: 'Keep the western side sparser.', source: 'journal' });
  assert.equal(directed.interventions.at(-1).status, 'queued');
  const nextPlan = service.record(created.id, { type: 'phase', phase: 'planning', summary: 'Consume new direction.' });
  assert.equal(nextPlan.interventions.at(-1).status, 'consumed');
  service.record(created.id, { type: 'phase', phase: 'previewing', summary: 'Show natural ridge candidates.' });
  service.record(created.id, {
    type: 'projection',
    projection: { id: 'boundary_preview_41', family: 'boundary', sourceRevision: 41, candidateCount: 220, blockedCount: 0, strokeCenters: [{ x: 8, y: 8 }] }
  });
  service.record(created.id, { type: 'phase', phase: 'applying', summary: 'Apply runtime-verified boundary.' });
  const boundaryApplied = service.record(created.id, {
    type: 'batch',
    batch: {
      id: 'batch_2_boundary_42', family: 'boundary', projectionId: 'boundary_preview_41',
      receipt: {
        contract: 'axiom.playable-boundary-receipt.v1', receiptId: 'boundary_receipt_42', operation: 'boundary_enforcement',
        mapId: 'axiom_second_approach', beforeRevision: 41, afterRevision: 42, createdIds: [], createdCount: 0, changedTileCount: 220,
        runtimeAudit: { contract: 'axiom.runtime-traversal-audit.v1', pass: true, reachable: true, shortcutRatio: .74 }
      },
      readback: { ok: true, revision: 42, enforcementStatus: 'runtime_verified' }
    }
  });
  assert.equal(boundaryApplied.map.currentRevision, 42);
  assert.equal(boundaryApplied.batches.at(-1).receipt.changedTileCount, 220);

  const persisted = createLevelDesignSessionService({ dataRoot, now: () => current, staleAfterMs: 4000 }).get(created.id);
  assert.equal(persisted.map.currentRevision, 42);
  assert.equal(persisted.modelInvocations[0].model, 'qwen3.5:9b');
  assert.equal(persisted.events.some(event => event.type === 'batch_applied'), true);

  current = new Date('2026-08-17T10:00:10.000Z');
  const stale = service.get(created.id);
  assert.equal(stale.state, 'paused');
  assert.equal(stale.controls.pausedReason, 'witness_client_heartbeat_expired');

  const stoppable = service.create({
    prompt: 'Dress a second test corridor.',
    project: { id: 'black-sky-bound-v2-demo', name: 'Black Sky Bound v2', root: 'C:/repo/BLACK_SKY_BOUND_V2' },
    map: { mapId: 'axiom_second_approach', catalogueMapId: 'ash_road_threshold', authoringPath: 'data/bsb-v2/maps/second_approach.authoring.json', revision: 50 },
    preflight: preflightFor({ mapId: 'axiom_second_approach', catalogueMapId: 'ash_road_threshold', authoringPath: 'data/bsb-v2/maps/second_approach.authoring.json' }, 'preflight_stop_test')
  });
  service.control(stoppable.id, { action: 'approve', clientId: 'browser_2' });
  recordPreflight(stoppable, 50);
  const stopped = service.control(stoppable.id, { action: 'stop', reason: 'test_stop', clientId: 'browser_2' });
  assert.equal(stopped.state, 'stopped');
  assert.match(stopped.currentAction, /retained and remains undoable/);

  const routeBlocked = service.create({
    prompt: 'Build a ten-minute forest route.',
    project: { id: 'black-sky-bound-v2-demo', name: 'Black Sky Bound v2', root: 'C:/repo/BLACK_SKY_BOUND_V2' },
    map: { mapId: 'axiom_second_approach', catalogueMapId: 'ash_road_threshold', authoringPath: 'data/bsb-v2/maps/second_approach.authoring.json', revision: 60 },
    preflight: preflightFor({ mapId: 'axiom_second_approach', catalogueMapId: 'ash_road_threshold', authoringPath: 'data/bsb-v2/maps/second_approach.authoring.json' }, 'preflight_route_block_test')
  });
  service.control(routeBlocked.id, { action: 'approve', clientId: 'browser_3' });
  recordPreflight(routeBlocked, 60);
  service.record(routeBlocked.id, { type: 'phase', phase: 'evaluating', summary: 'Run spatial precheck.' });
  const rejectedRoute = service.record(routeBlocked.id, { type: 'evaluation', evaluation: evaluationFor(60, { nextAction: 'route_revision_required', improvement: 0 }) });
  assert.equal(rejectedRoute.state, 'awaiting_user');
  assert.equal(rejectedRoute.phase, 'goal_review');
  assert.equal(rejectedRoute.controls.pausedReason, 'route_revision_required');
  assert.equal(rejectedRoute.events.some(event => event.type === 'route_revision_required'), true);

  console.log('level-design-session.test.mjs: ok');
} finally {
  fs.rmSync(dataRoot, { recursive: true, force: true });
}
