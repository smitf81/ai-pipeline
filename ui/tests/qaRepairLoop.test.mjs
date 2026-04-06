import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  appendQaInvestigation,
  buildQaInvestigationRecord,
  readQaInvestigations,
} = require('../externalQaProbe.js');
const {
  buildQAStatePayload,
  buildDeskPropertiesPayload,
  createDefaultStudioLayoutSchema,
} = require('../server.js');
const {
  QA_REPAIR_LANES,
  VALIDATION_SEAM_TARGETS,
  buildQaRepairExecutorBrief,
  buildQaRepairJobFromInvestigation,
  buildQaRepairLoopState,
  getQaRepairLaneConfig,
  maybeBridgeOpenInvestigationsToRepairJobs,
  readQaRepairAttempts,
  readQaRepairJobs,
  runQaRepairLaneValidationChecks,
  runQaRepairAttempt,
  selectQaRepairLaneForInvestigation,
} = require('../qaRepairLoop.js');

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'qa-repair-loop-'));
}

function makeInvestigation({
  id = 'qa_inv_001',
  trigger = 'external_mismatch',
  repeatCount = 2,
  createdAt = '2026-04-06T00:00:00.000Z',
  status = 'open',
  summary = 'External probe disagrees with internal QA status',
  signature = null,
} = {}) {
  return buildQaInvestigationRecord({
    id,
    trigger,
    repeatCount,
    createdAt,
    status,
    summary,
    signature,
    external: {
      test_id: 'ollama_ping',
      status: trigger === 'probe_failure' ? 'unavailable' : 'fail',
    },
    internal: {
      status: 'pass',
      source: 'data/spatial/qa/structured/latest.json',
      timestamp: createdAt,
      details: 'Structured QA report passed.',
    },
    comparison: {
      status_match: false,
      freshness_known: trigger !== 'probe_failure',
      notes: ['Validation seam mismatch.'],
    },
  });
}

function makeRouteContractInvestigation({
  id = 'qa_inv_route_001',
  repeatCount = 3,
  createdAt = '2026-04-06T00:00:30.000Z',
  status = 'open',
  summary = 'Route payload contract drift detected.',
  trigger = 'route_contract_mismatch',
} = {}) {
  return buildQaInvestigationRecord({
    id,
    trigger,
    repeatCount,
    createdAt,
    status,
    summary,
    external: {
      test_id: 'qaRepairLaneContracts',
      status: 'fail',
    },
    internal: {
      status: 'pass',
      source: 'data/spatial/qa/structured/latest.json',
      timestamp: createdAt,
      details: 'Structured QA report passed.',
    },
    comparison: {
      status_match: false,
      freshness_known: true,
      notes: ['Route contract field dropped from a consumer payload.'],
    },
  });
}

export default async function runQaRepairLoopTests() {
  const repoRoot = path.resolve(process.cwd(), '..');

  assert.equal(QA_REPAIR_LANES.length, 4);
  assert.deepEqual(QA_REPAIR_LANES.map((lane) => lane.lane_id), ['ui_boot_integrity', 'validation_seam', 'route_contract_health', 'planner_canonical_integrity']);
  assert.ok(getQaRepairLaneConfig('validation_seam'));
  assert.ok(getQaRepairLaneConfig('route_contract_health'));
  assert.equal(selectQaRepairLaneForInvestigation(makeInvestigation())?.lane_id, 'validation_seam');
  assert.equal(selectQaRepairLaneForInvestigation(makeRouteContractInvestigation())?.lane_id, 'route_contract_health');
  assert.equal(selectQaRepairLaneForInvestigation(buildQaInvestigationRecord({
    id: 'qa_inv_999',
    trigger: 'planner_mismatch',
    repeatCount: 4,
    createdAt: '2026-04-06T00:01:00.000Z',
    status: 'open',
    summary: 'Unrelated investigation should not enter the repair lanes.',
  })), null);

  const bridgeRoot = makeTempRoot();
  try {
    const validationInvestigationResult = appendQaInvestigation(bridgeRoot, makeInvestigation());
    const routeInvestigationResult = appendQaInvestigation(bridgeRoot, makeRouteContractInvestigation());
    assert.equal(validationInvestigationResult.created, true);
    assert.equal(routeInvestigationResult.created, true);

    const unrelatedInvestigation = buildQaInvestigationRecord({
      id: 'qa_inv_999',
      trigger: 'planner_mismatch',
      repeatCount: 4,
      createdAt: '2026-04-06T00:01:00.000Z',
      status: 'open',
      summary: 'Unrelated investigation should not enter the repair lanes.',
    });

    const bridgedJobs = maybeBridgeOpenInvestigationsToRepairJobs(bridgeRoot, {
      investigations: [validationInvestigationResult.record, routeInvestigationResult.record, unrelatedInvestigation],
    });
    assert.equal(bridgedJobs.length, 2);
    assert.equal(readQaRepairJobs(bridgeRoot).length, 2);

    const validationJob = bridgedJobs.find((job) => job.lane === 'validation_seam');
    const routeJob = bridgedJobs.find((job) => job.lane === 'route_contract_health');
    assert.ok(validationJob);
    assert.ok(routeJob);
    assert.equal(validationJob.investigation_id, 'qa_inv_001');
    assert.equal(routeJob.investigation_id, 'qa_inv_route_001');
    assert.deepEqual(validationJob.scoped_targets, VALIDATION_SEAM_TARGETS);
    assert.ok(!routeJob.scoped_targets.includes('ui/tests/externalValidation.test.mjs'));
    assert.ok(routeJob.scoped_targets.includes('ui/tests/qaRepairLaneContracts.test.mjs'));

    const validationBrief = buildQaRepairExecutorBrief(validationJob, validationInvestigationResult.record);
    const routeBrief = buildQaRepairExecutorBrief(routeJob, routeInvestigationResult.record);
    assert.deepEqual(validationBrief.allowed_files, VALIDATION_SEAM_TARGETS);
    assert.ok(validationBrief.allowed_directories.includes('ui'));
    assert.ok(validationBrief.prohibited_actions.includes('no unrestricted self-modification'));
    assert.ok(validationBrief.acceptance_criteria.includes('Focused QA validation passes'));
    assert.equal(validationBrief.max_attempts, 2);
    assert.equal(validationBrief.lane_label, 'Validation Seam');
    assert.equal(routeBrief.lane_label, 'Route + Contract Health');
    assert.ok(routeBrief.allowed_files.includes('ui/server.js'));
    assert.ok(routeBrief.allowed_files.includes('ui/tests/qaRepairLaneContracts.test.mjs'));
    assert.ok(routeBrief.validation_checks.some((check) => check.test_file === 'tests/qaRepairLaneContracts.test.mjs'));
    assert.ok(routeBrief.prohibited_actions.includes('no cross-lane repo edits unless explicitly scoped'));
  } finally {
    fs.rmSync(bridgeRoot, { recursive: true, force: true });
  }

  const laneValidationJob = buildQaRepairJobFromInvestigation(repoRoot, makeRouteContractInvestigation());
  assert.ok(laneValidationJob);
  const laneValidationResult = runQaRepairLaneValidationChecks(repoRoot, laneValidationJob, {
    changedFiles: laneValidationJob.scoped_targets,
  });
  assert.equal(laneValidationResult.ok, true);
  assert.equal(laneValidationResult.lane, 'route_contract_health');
  assert.ok(laneValidationResult.checks.some((check) => check.id === 'route-contract-check'));

  const acceptRoot = makeTempRoot();
  try {
    const investigationResult = appendQaInvestigation(acceptRoot, makeInvestigation());
    const job = maybeBridgeOpenInvestigationsToRepairJobs(acceptRoot, {
      investigations: [investigationResult.record],
    })[0];

    const repairResult = runQaRepairAttempt(acceptRoot, {
      repairJobId: job.id,
      executorRunner: () => ({
        ok: true,
        applied: true,
        appliedFiles: ['ui/externalQaProbe.js'],
        reason: 'Applied a narrow validation seam fix.',
      }),
      validationRunner: () => ({
        ok: true,
        verdict: 'accepted',
        summary: 'Validation seam checks passed.',
        checks: [{ id: 'externalValidation', ok: true }],
      }),
    });

    assert.equal(repairResult.verdict, 'accepted');
    assert.equal(repairResult.job.status, 'accepted');
    assert.equal(repairResult.retry_allowed, false);
    assert.equal(repairResult.safe_stop, false);
    assert.equal(readQaRepairAttempts(acceptRoot).length, 1);
    assert.equal(readQaRepairAttempts(acceptRoot)[0].validation_verdict, 'accepted');
    assert.equal(readQaInvestigations(acceptRoot)[0].repeat_count, 2);

    const qaState = buildQAStatePayload(acceptRoot);
    assert.ok(qaState.repairLoop);
      assert.equal(qaState.repairLoop.lanes.length, 4);
      assert.equal(qaState.repairLoop.summary.totalLanes, 4);
    assert.equal(qaState.repairLoop.jobs[0].status, 'accepted');
    const deskPayload = buildDeskPropertiesPayload({
      studio: {
        layout: createDefaultStudioLayoutSchema(),
      },
    }, 'qa-lead', qaState);
    assert.ok(deskPayload.qa.repairLoop);
    assert.equal(deskPayload.qa.repairLoop.latestJob.status, 'accepted');
  } finally {
    fs.rmSync(acceptRoot, { recursive: true, force: true });
  }

  const routeRejectRoot = makeTempRoot();
  try {
    const investigationResult = appendQaInvestigation(routeRejectRoot, makeRouteContractInvestigation({
      id: 'qa_inv_route_002',
      createdAt: '2026-04-06T00:03:00.000Z',
    }));
    const job = maybeBridgeOpenInvestigationsToRepairJobs(routeRejectRoot, {
      investigations: [investigationResult.record],
    })[0];

    const firstFailure = runQaRepairAttempt(routeRejectRoot, {
      repairJobId: job.id,
      executorRunner: () => ({
        ok: true,
        applied: true,
        appliedFiles: ['ui/server.js'],
        reason: 'Narrowed the route contract payload.',
      }),
      validationRunner: () => ({
        ok: false,
        verdict: 'rejected',
        summary: 'Route + contract checks failed.',
        checks: [{ id: 'route-contract-check', ok: false }],
      }),
    });

    assert.equal(firstFailure.verdict, 'rejected');
    assert.equal(firstFailure.job.lane, 'route_contract_health');
    assert.equal(firstFailure.job.status, 'retry_queued');
    assert.equal(firstFailure.retry_allowed, true);
    assert.equal(readQaRepairAttempts(routeRejectRoot).length, 1);
    assert.equal(readQaInvestigations(routeRejectRoot)[0].repeat_count, 4);

    const secondFailure = runQaRepairAttempt(routeRejectRoot, {
      repairJobId: job.id,
      executorRunner: () => ({
        ok: true,
        applied: true,
        appliedFiles: ['ui/public/spatial/spatialApp.js'],
        reason: 'Retried the route contract payload.',
      }),
      validationRunner: () => ({
        ok: false,
        verdict: 'rejected',
        summary: 'Route + contract checks failed again.',
        checks: [{ id: 'route-contract-check', ok: false }],
      }),
    });

    assert.equal(secondFailure.verdict, 'rejected');
    assert.equal(secondFailure.job.status, 'stalled_after_retries');
    assert.equal(secondFailure.retry_allowed, false);
    assert.equal(secondFailure.safe_stop, true);
    assert.equal(readQaRepairAttempts(routeRejectRoot).length, 2);
    assert.equal(readQaRepairJobs(routeRejectRoot)[0].lane, 'route_contract_health');
  } finally {
    fs.rmSync(routeRejectRoot, { recursive: true, force: true });
  }

  const rejectRoot = makeTempRoot();
  try {
    const investigationResult = appendQaInvestigation(rejectRoot, makeInvestigation({
      id: 'qa_inv_002',
      createdAt: '2026-04-06T00:02:00.000Z',
    }));
    const job = maybeBridgeOpenInvestigationsToRepairJobs(rejectRoot, {
      investigations: [investigationResult.record],
    })[0];

    const firstFailure = runQaRepairAttempt(rejectRoot, {
      repairJobId: job.id,
      executorRunner: () => ({
        ok: true,
        applied: true,
        appliedFiles: ['ui/externalQaProbe.js'],
        reason: 'Tightened the validation seam.',
      }),
      validationRunner: () => ({
        ok: false,
        verdict: 'rejected',
        summary: 'Validation seam checks failed.',
        checks: [{ id: 'externalValidation', ok: false }],
      }),
    });

    assert.equal(firstFailure.verdict, 'rejected');
    assert.equal(firstFailure.job.status, 'retry_queued');
    assert.equal(firstFailure.retry_allowed, true);
    assert.equal(firstFailure.safe_stop, false);
    assert.equal(readQaRepairAttempts(rejectRoot).length, 1);
    assert.equal(readQaInvestigations(rejectRoot)[0].repeat_count, 3);
    assert.equal(readQaInvestigations(rejectRoot)[0].latest_evidence.trigger, 'repair_validation_failed');

    const secondFailure = runQaRepairAttempt(rejectRoot, {
      repairJobId: job.id,
      executorRunner: () => ({
        ok: true,
        applied: true,
        appliedFiles: ['ui/server.js'],
        reason: 'Retried the same narrow fix.',
      }),
      validationRunner: () => ({
        ok: false,
        verdict: 'rejected',
        summary: 'Validation seam checks failed again.',
        checks: [{ id: 'externalValidation', ok: false }],
      }),
    });

    assert.equal(secondFailure.verdict, 'rejected');
    assert.equal(secondFailure.job.status, 'stalled_after_retries');
    assert.equal(secondFailure.retry_allowed, false);
    assert.equal(secondFailure.safe_stop, true);
    assert.equal(readQaRepairAttempts(rejectRoot).length, 2);
    assert.equal(readQaRepairJobs(rejectRoot)[0].status, 'stalled_after_retries');
  } finally {
    fs.rmSync(rejectRoot, { recursive: true, force: true });
  }

  const stateRoot = makeTempRoot();
  try {
    const qaState = buildQAStatePayload(stateRoot);
    const repairLoop = buildQaRepairLoopState(stateRoot);
    assert.deepEqual(qaState.repairLoop, repairLoop);
    assert.equal(repairLoop.lanes.length, 4);
    assert.equal(repairLoop.summary.totalLanes, 4);
    assert.deepEqual(repairLoop.jobs, []);
    assert.deepEqual(repairLoop.attempts, []);
    assert.equal(repairLoop.summary.totalJobs, 0);
    assert.equal(repairLoop.summary.totalAttempts, 0);
    assert.equal(repairLoop.lanes.find((lane) => lane.lane_id === 'route_contract_health')?.status, 'idle');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
}
