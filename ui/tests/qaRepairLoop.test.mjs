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
  buildQaLeadPosture,
  buildDeskPropertiesPayload,
  createDefaultStudioLayoutSchema,
} = require('../server.js');
const {
  readPlannerQaQueue,
} = require('../plannerQaQueue.js');
const {
  buildTruthKernelPayload,
} = require('../truthKernelAdapter.js');
const {
  QA_REPAIR_LANES,
  VALIDATION_SEAM_TARGETS,
  buildQaRepairExecutorBrief,
  buildQaRepairJobFromInvestigation,
  buildQaRepairLoopState,
  getQaRepairLaneConfig,
  maybeBridgeOpenInvestigationsToRepairJobs,
  readQaRepairAttempts,
  readQaRepairApplyReceipts,
  readQaRepairEvents,
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
    assert.equal(validationJob.planner_intake_queue_key, 'qa_self_fix_qa_repair_qa_inv_001');
    assert.equal(validationJob.planner_intake_status, 'pending');
    assert.deepEqual(validationJob.scoped_targets, VALIDATION_SEAM_TARGETS);
    assert.ok(!routeJob.scoped_targets.includes('ui/tests/externalValidation.test.mjs'));
    assert.ok(routeJob.scoped_targets.includes('ui/tests/qaRepairLaneContracts.test.mjs'));
    const plannerQueue = readPlannerQaQueue(bridgeRoot);
    assert.equal(plannerQueue.entries.length, 2);
    assert.equal(plannerQueue.entries[0].targetDesk, 'planner');
    assert.equal(plannerQueue.entries[0].requestedBy, 'qa');
    assert.equal(plannerQueue.entries[0].provenance.sourceType, 'qa_repair_job');
    assert.ok(plannerQueue.entries[0].findings[0].details.includes('Scoped targets:'));

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
    assert.equal(repairResult.published_investigation?.status, 'resolved');
    assert.equal(repairResult.published_investigation?.adjudication_state, 'adjudicated_accepted');
    assert.equal(repairResult.preflight.ok, true);
    assert.equal(repairResult.apply_receipt.apply_status, 'applied');
    assert.equal(repairResult.apply_receipt.target_type, 'external_validation_contract');
    assert.equal(repairResult.retry_allowed, false);
    assert.equal(repairResult.safe_stop, false);
    assert.equal(readQaRepairAttempts(acceptRoot).length, 1);
    assert.equal(readQaRepairApplyReceipts(acceptRoot).length, 1);
    assert.ok(readQaRepairEvents(acceptRoot).length >= 6);
    assert.equal(readQaRepairAttempts(acceptRoot)[0].validation_verdict, 'accepted');
    assert.equal(readQaRepairAttempts(acceptRoot)[0].executor_output_kind, 'live_apply');
    assert.equal(readQaRepairAttempts(acceptRoot)[0].truth_application_status, 'verified_healthy');
    assert.equal(readQaRepairAttempts(acceptRoot)[0].qa_revalidation_required, false);
    assert.equal(readQaInvestigations(acceptRoot)[0].repeat_count, 2);
    assert.equal(readQaInvestigations(acceptRoot)[0].status, 'resolved');
    assert.equal(readQaInvestigations(acceptRoot)[0].pre_adjudication, false);
    assert.equal(readQaInvestigations(acceptRoot)[0].resolution.validation_verdict, 'accepted');
    assert.equal(readQaInvestigations(acceptRoot)[0].resolution.repair_attempt_id, readQaRepairAttempts(acceptRoot)[0].attempt_id);
    const plannerQueue = readPlannerQaQueue(acceptRoot);
    assert.equal(plannerQueue.entries[0].queueKey, job.planner_intake_queue_key);
    assert.equal(plannerQueue.entries[0].targetRole, 'Planner');
    assert.equal(plannerQueue.entries[0].qaStatus, 'pending');

    const qaState = buildQAStatePayload(acceptRoot);
    assert.equal(qaState.openInvestigations.length, 0);
    assert.ok(qaState.repairLoop);
      assert.equal(qaState.repairLoop.lanes.length, 4);
      assert.equal(qaState.repairLoop.summary.totalLanes, 4);
    assert.equal(qaState.repairLoop.summary.acceptedPendingApply, 0);
    assert.equal(qaState.repairLoop.summary.appliedPendingVerification, 0);
    assert.equal(qaState.repairLoop.jobs[0].status, 'accepted');
    assert.equal(qaState.repairLoop.jobs[0].truth_application_status, 'verified_healthy');
    assert.equal(qaState.repairLoop.provingCase.repair_job_id, job.id);
    assert.equal(qaState.repairLoop.provingCase.lane, 'validation_seam');
    assert.equal(qaState.repairLoop.provingCase.target_type, 'external_validation_contract');
    assert.equal(qaState.repairLoop.provingCase.truth_application_status, 'verified_healthy');
    assert.equal(qaState.repairLoop.provingCase.last_apply_receipt_id, repairResult.apply_receipt.receipt_id);
    assert.equal(qaState.repairLoop.provingCase.post_apply_verification_verdict, 'accepted');
    assert.match(qaState.repairLoop.provingCase.status_line, /validation_seam/);
    const posture = buildQaLeadPosture({
      qaLead: {
        status: 'live',
        summary: 'QA lead cycle passed.',
        run_id: 'qa_lead_accept_1',
        current_batch: 'qa_lead_accept_1',
        finished_at: '2026-04-06T01:00:00.000Z',
        output_feed: [],
      },
      qaLeadLatestRun: {
        id: 'qa_lead_accept_1',
        status: 'live',
        summary: 'QA lead cycle passed.',
        finished_at: '2026-04-06T01:00:00.000Z',
      },
      structuredReport: {
        status: 'pass',
        summary: 'Structured QA report passed.',
        finishedAt: '2026-04-06T01:00:00.000Z',
      },
      structuredSummary: {
        status: 'pass',
        summary: 'Structured QA report passed.',
        finishedAt: '2026-04-06T01:00:00.000Z',
      },
      externalValidation: {
        status: 'pass',
        probeStatus: 'ok',
        lastCheckedAt: '2026-04-06T01:00:00.000Z',
      },
      repairLoop: qaState.repairLoop,
      openInvestigations: qaState.openInvestigations,
      browserRuns: [],
      generatedAt: '2026-04-06T01:00:00.000Z',
    });
    assert.equal(posture.verdict, 'pass');
    assert.equal(posture.inputs.some((input) => input.type === 'pre_adjudication_evidence'), false);
    const truthKernel = buildTruthKernelPayload({ rootPath: acceptRoot, workspace: {} });
    const investigationNode = truthKernel.nodes.find((node) => node.id === 'qa_inv_001');
    const repairJobNode = truthKernel.nodes.find((node) => node.id === job.id);
    const applyReceiptNode = truthKernel.nodes.find((node) => node.id === repairResult.apply_receipt.receipt_id);
    assert.ok(investigationNode);
    assert.ok(!['degraded', 'blocked'].includes(investigationNode.status));
    assert.equal(investigationNode.blocker, null);
    assert.equal(repairJobNode.status, 'healthy');
    assert.equal(repairJobNode.verdict, 'verified_healthy');
    assert.equal(applyReceiptNode.status, 'healthy');
    const deskPayload = buildDeskPropertiesPayload({
      studio: {
        layout: createDefaultStudioLayoutSchema(),
      },
    }, 'qa-lead', qaState);
    assert.ok(deskPayload.qa.repairLoop);
    assert.equal(deskPayload.qa.repairLoop.latestJob.status, 'accepted');
    assert.equal(deskPayload.qa.repairLoop.provingCase.repair_job_id, job.id);
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
    });

    assert.equal(firstFailure.verdict, 'policy_blocked');
    assert.equal(firstFailure.job.lane, 'route_contract_health');
    assert.equal(firstFailure.job.status, 'policy_blocked');
    assert.equal(firstFailure.job.truth_application_status, 'blocked_degraded');
    assert.equal(firstFailure.retry_allowed, false);
    assert.equal(readQaRepairAttempts(routeRejectRoot).length, 1);
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
