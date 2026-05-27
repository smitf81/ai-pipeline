import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildQaRepairLoopState,
} = require('../qaRepairLoop.js');

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'qa-repair-hardening-'));
}

function writeJson(rootPath, relativePath, value) {
  const targetPath = path.join(rootPath, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function makeBaseJob(overrides = {}) {
  return {
    id: 'qa_repair_hardening_001',
    lane: 'validation_seam',
    lane_label: 'Validation Seam',
    target_type: 'external_validation_contract',
    truth_application_status: 'proposal_pending',
    status: 'open',
    scoped_targets: ['ui/externalQaProbe.js'],
    validation_checks: [],
    acceptance_criteria: [],
    prohibited_actions: [],
    allowed_action_types: ['inspect', 'patch', 'validate'],
    required_validation_gate_ids: [],
    created_at: '2026-04-06T00:00:00.000Z',
    updated_at: '2026-04-06T00:00:00.000Z',
    ...overrides,
  };
}

function makeReceipt(overrides = {}) {
  return {
    receipt_id: 'qa_receipt_hardening_001',
    repair_job_id: 'qa_repair_hardening_001',
    lane: 'validation_seam',
    target_type: 'external_validation_contract',
    apply_status: 'applied',
    apply_verdict: 'applied',
    apply_timestamp: '2026-04-06T00:02:00.000Z',
    ...overrides,
  };
}

function makeAttempt(overrides = {}) {
  return {
    attempt_id: 'qa_attempt_hardening_001',
    repair_job_id: 'qa_repair_hardening_001',
    lane: 'validation_seam',
    validation_verdict: 'accepted',
    truth_application_status: 'verified_healthy',
    timestamp: '2026-04-06T00:03:00.000Z',
    ...overrides,
  };
}

function makeEvents(stages = []) {
  return stages.map((stage, index) => ({
    event_id: `qa_event_${index + 1}`,
    stage,
    lane: 'validation_seam',
    repair_job_id: 'qa_repair_hardening_001',
    recorded_at: new Date(Date.parse('2026-04-06T00:01:00.000Z') + (index * 1000)).toISOString(),
  }));
}

export default async function runQaRepairLoopHardeningTests() {
  const missingReceiptRoot = makeTempRoot();
  try {
    writeJson(missingReceiptRoot, 'data/spatial/qa/repair-jobs.json', [
      makeBaseJob({
        truth_application_status: 'verified_healthy',
        status: 'accepted',
        updated_at: '2026-04-06T00:04:00.000Z',
      }),
    ]);
    writeJson(missingReceiptRoot, 'data/spatial/qa/repair-attempts.json', [makeAttempt()]);
    writeJson(missingReceiptRoot, 'data/spatial/qa/repair-events.json', makeEvents(['proposal_stored', 'apply_accepted', 'canonical_truth_updated']));

    const state = buildQaRepairLoopState(missingReceiptRoot);
    assert.equal(state.jobs[0].truth_application_status, 'accepted_pending_apply');
    assert.equal(state.jobs[0].consistency_status, 'inconsistent');
    assert.ok(state.jobs[0].consistency_hard_failures.includes('verified_healthy_missing_apply_receipt'));
    assert.equal(state.provingCase.truth_application_status, 'accepted_pending_apply');
    assert.equal(state.provingCase.last_apply_receipt_id, null);
  } finally {
    fs.rmSync(missingReceiptRoot, { recursive: true, force: true });
  }

  const missingVerificationRoot = makeTempRoot();
  try {
    writeJson(missingVerificationRoot, 'data/spatial/qa/repair-jobs.json', [
      makeBaseJob({
        truth_application_status: 'verified_healthy',
        status: 'accepted',
        latest_apply_receipt_id: 'qa_receipt_hardening_001',
        updated_at: '2026-04-06T00:04:00.000Z',
      }),
    ]);
    writeJson(missingVerificationRoot, 'data/spatial/qa/repair-apply-receipts.json', [makeReceipt()]);
    writeJson(missingVerificationRoot, 'data/spatial/qa/repair-events.json', makeEvents(['proposal_stored', 'apply_accepted', 'apply_executed']));

    const state = buildQaRepairLoopState(missingVerificationRoot);
    assert.equal(state.jobs[0].truth_application_status, 'applied_pending_verification');
    assert.equal(state.jobs[0].consistency_status, 'inconsistent');
    assert.ok(state.jobs[0].consistency_hard_failures.includes('verified_healthy_missing_verification'));
    assert.equal(state.provingCase.post_apply_verification_verdict, null);
  } finally {
    fs.rmSync(missingVerificationRoot, { recursive: true, force: true });
  }

  const duplicateEventsRoot = makeTempRoot();
  try {
    writeJson(duplicateEventsRoot, 'data/spatial/qa/repair-jobs.json', [
      makeBaseJob({
        truth_application_status: 'accepted_pending_apply',
        status: 'open',
        updated_at: '2026-04-06T00:02:30.000Z',
      }),
    ]);
    writeJson(duplicateEventsRoot, 'data/spatial/qa/repair-events.json', makeEvents([
      'proposal_stored',
      'apply_accepted',
      'apply_accepted',
      'apply_accepted',
    ]));

    const state = buildQaRepairLoopState(duplicateEventsRoot);
    assert.equal(state.jobs[0].consistency_status, 'warning');
    assert.ok(state.jobs[0].consistency_warnings.includes('duplicate_event_stages:apply_accepted'));
    assert.equal(state.provingCase.event_stages.includes('apply_accepted'), true);
    assert.equal(state.provingCase.event_stages.includes('proposal_stored'), true);
    assert.equal(state.provingCase.event_stages.length, 2);
  } finally {
    fs.rmSync(duplicateEventsRoot, { recursive: true, force: true });
  }

  const reloadAfterApplyRoot = makeTempRoot();
  try {
    writeJson(reloadAfterApplyRoot, 'data/spatial/qa/repair-jobs.json', [
      makeBaseJob({
        truth_application_status: 'applied_pending_verification',
        status: 'open',
        latest_apply_receipt_id: 'qa_receipt_hardening_001',
        updated_at: '2026-04-06T00:02:30.000Z',
      }),
    ]);
    writeJson(reloadAfterApplyRoot, 'data/spatial/qa/repair-apply-receipts.json', [makeReceipt()]);
    writeJson(reloadAfterApplyRoot, 'data/spatial/qa/repair-events.json', makeEvents([
      'proposal_stored',
      'apply_accepted',
      'apply_executed',
    ]));

    const state = buildQaRepairLoopState(reloadAfterApplyRoot);
    assert.equal(state.jobs[0].truth_application_status, 'applied_pending_verification');
    assert.equal(state.jobs[0].consistency_status, 'consistent');
    assert.equal(state.provingCase.truth_application_status, 'applied_pending_verification');
    assert.equal(state.provingCase.last_apply_receipt_id, 'qa_receipt_hardening_001');
    assert.equal(state.provingCase.post_apply_verification_verdict, null);
  } finally {
    fs.rmSync(reloadAfterApplyRoot, { recursive: true, force: true });
  }

  const reloadVerifiedRoot = makeTempRoot();
  try {
    writeJson(reloadVerifiedRoot, 'data/spatial/qa/repair-jobs.json', [
      makeBaseJob({
        truth_application_status: 'verified_healthy',
        status: 'accepted',
        latest_apply_receipt_id: 'qa_receipt_hardening_001',
        updated_at: '2026-04-06T00:04:00.000Z',
      }),
    ]);
    writeJson(reloadVerifiedRoot, 'data/spatial/qa/repair-attempts.json', [makeAttempt()]);
    writeJson(reloadVerifiedRoot, 'data/spatial/qa/repair-apply-receipts.json', [makeReceipt()]);
    writeJson(reloadVerifiedRoot, 'data/spatial/qa/repair-events.json', makeEvents([
      'proposal_stored',
      'apply_accepted',
      'apply_executed',
      'validation_stored',
      'canonical_truth_updated',
      'truth_kernel_projection_refreshed',
    ]));

    const state = buildQaRepairLoopState(reloadVerifiedRoot);
    assert.equal(state.jobs[0].truth_application_status, 'verified_healthy');
    assert.equal(state.jobs[0].consistency_status, 'consistent');
    assert.equal(state.provingCase.truth_application_status, 'verified_healthy');
    assert.equal(state.provingCase.post_apply_verification_verdict, 'accepted');
    assert.equal(state.summary.accepted, 1);
  } finally {
    fs.rmSync(reloadVerifiedRoot, { recursive: true, force: true });
  }
}
