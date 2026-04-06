import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  appendQaInvestigation,
  buildQaInvestigationRecord,
} = require('../externalQaProbe.js');
const {
  buildQAStatePayload,
} = require('../server.js');
const {
  VALIDATION_SEAM_TARGETS,
  buildQaRepairJobFromInvestigation,
  buildQaRepairLoopState,
  getQaRepairLaneConfig,
  maybeBridgeOpenInvestigationsToRepairJobs,
  runQaRepairAttempt,
  upsertQaRepairJob,
} = require('../qaRepairLoop.js');
const {
  getRepairLaneTrustPolicy,
  getRepairLaneTrustPolicyRegistry,
} = require('../repairLaneTrustPolicy.js');

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'repair-trust-policy-'));
}

function makeInvestigation({
  id = 'qa_inv_001',
  trigger = 'external_mismatch',
  repeatCount = 2,
  createdAt = '2026-04-06T00:00:00.000Z',
  summary = 'Lane contradiction detected.',
} = {}) {
  return buildQaInvestigationRecord({
    id,
    trigger,
    repeatCount,
    createdAt,
    summary,
    external: {
      status: 'fail',
      test_id: trigger,
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
      notes: ['Trust policy test mismatch.'],
    },
  });
}

export default async function runRepairLaneTrustPolicyTests() {
  const policies = getRepairLaneTrustPolicyRegistry();
  assert.equal(policies.length, 4);
  assert.deepEqual(policies.map((policy) => policy.lane_id), [
    'ui_boot_integrity',
    'validation_seam',
    'route_contract_health',
    'planner_canonical_integrity',
  ]);
  assert.equal(getRepairLaneTrustPolicy('planner_canonical_integrity').auto_apply_allowed, false);
  assert.equal(getRepairLaneTrustPolicy('planner_canonical_integrity').trust_level, 'guarded');
  assert.equal(getQaRepairLaneConfig('planner_canonical_integrity').trust_reason.includes('Planner integrity is policy-guarded'), true);

  const outOfScopeRoot = makeTempRoot();
  try {
    const investigation = makeInvestigation();
    appendQaInvestigation(outOfScopeRoot, investigation);
    const invalidJob = buildQaRepairJobFromInvestigation(outOfScopeRoot, investigation, {
      scopedTargets: [...VALIDATION_SEAM_TARGETS, 'ui/public/spatial/spatialApp.js'],
    });
    upsertQaRepairJob(outOfScopeRoot, invalidJob);
    const result = runQaRepairAttempt(outOfScopeRoot, {
      repairJobId: invalidJob.id,
      executorRunner: () => {
        throw new Error('Policy should block before executor runs.');
      },
    });
    assert.equal(result.verdict, 'policy_blocked');
    assert.equal(result.job.status, 'policy_blocked');
    assert.match(result.reason, /Scoped targets exceed trust policy/);
    assert.equal(result.executor, null);
    assert.equal(result.retry_allowed, false);
  } finally {
    fs.rmSync(outOfScopeRoot, { recursive: true, force: true });
  }

  const plannerRoot = makeTempRoot();
  try {
    const plannerInvestigation = makeInvestigation({
      id: 'qa_inv_planner_001',
      trigger: 'planner_identity_mismatch',
      summary: 'Planner canonical integrity drift detected.',
    });
    appendQaInvestigation(plannerRoot, plannerInvestigation);
    const plannerJob = maybeBridgeOpenInvestigationsToRepairJobs(plannerRoot, {
      investigations: [plannerInvestigation],
    })[0];
    assert.ok(plannerJob);
    assert.equal(plannerJob.lane, 'planner_canonical_integrity');

    const blocked = runQaRepairAttempt(plannerRoot, {
      repairJobId: plannerJob.id,
      executorRunner: () => {
        throw new Error('Planner lane should be blocked before executor runs.');
      },
    });
    assert.equal(blocked.verdict, 'policy_blocked');
    assert.equal(blocked.job.status, 'policy_blocked');
    assert.match(blocked.reason, /Auto-apply is not permitted/);
    assert.equal(blocked.retry_allowed, false);
    assert.equal(blocked.safe_stop, true);

    const repairLoop = buildQaRepairLoopState(plannerRoot);
    const plannerLane = repairLoop.lanes.find((lane) => lane.lane_id === 'planner_canonical_integrity');
    assert.equal(plannerLane.status, 'blocked');
    assert.equal(plannerLane.trust_level, 'guarded');
    assert.match(plannerLane.trust_reason, /policy-guarded/i);
    assert.match(plannerLane.latest_policy_block_reason, /Auto-apply is not permitted/);
    assert.equal(repairLoop.summary.policyBlocked, 1);
    assert.equal(repairLoop.summary.blockedLanes, 1);

    const qaState = buildQAStatePayload(plannerRoot);
    assert.equal(qaState.repairLoop.trustPolicyRegistry.length, 4);
    assert.equal(qaState.repairLoop.lanes.find((lane) => lane.lane_id === 'planner_canonical_integrity')?.latest_job_status, 'policy_blocked');
  } finally {
    fs.rmSync(plannerRoot, { recursive: true, force: true });
  }
}
