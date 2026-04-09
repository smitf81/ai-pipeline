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
  buildDeskPropertiesPayload,
  createDefaultStudioLayoutSchema,
} = require('../server.js');
const {
  buildTruthKernelPayload,
} = require('../truthKernelAdapter.js');
const {
  buildQaRepairLoopState,
  maybeBridgeOpenInvestigationsToRepairJobs,
  readQaRepairApplyReceipts,
  readQaRepairEvents,
  runQaRepairAttempt,
} = require('../qaRepairLoop.js');

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'qa-repair-proof-'));
}

function makeValidationSeamInvestigation() {
  return buildQaInvestigationRecord({
    id: 'qa_inv_proof_001',
    trigger: 'external_mismatch',
    repeatCount: 3,
    createdAt: '2026-04-06T00:10:00.000Z',
    status: 'open',
    summary: 'Seeded deterministic validation seam proving case.',
    external: {
      test_id: 'external_validation_contract',
      status: 'fail',
    },
    internal: {
      status: 'pass',
      source: 'data/spatial/qa/structured/latest.json',
      timestamp: '2026-04-06T00:10:00.000Z',
      details: 'Structured QA report passed.',
    },
    comparison: {
      status_match: false,
      freshness_known: true,
      notes: ['Seeded validation seam contradiction for proving.'],
    },
  });
}

export default async function runQaRepairLoopProvingCaseTests() {
  const root = makeTempRoot();
  try {
    const seeded = appendQaInvestigation(root, makeValidationSeamInvestigation());
    const job = maybeBridgeOpenInvestigationsToRepairJobs(root, {
      investigations: [seeded.record],
    })[0];

    const result = runQaRepairAttempt(root, {
      repairJobId: job.id,
      executorRunner: () => ({
        ok: true,
        applied: true,
        appliedFiles: ['ui/externalQaProbe.js'],
        reason: 'Applied deterministic proving fix.',
      }),
      validationRunner: () => ({
        ok: true,
        verdict: 'accepted',
        summary: 'Post-apply validation passed.',
        checks: [{ id: 'externalValidation', ok: true }],
      }),
    });

    assert.equal(result.verdict, 'accepted');
    assert.equal(result.job.truth_application_status, 'verified_healthy');
    assert.equal(readQaRepairApplyReceipts(root).length, 1);
    assert.ok(readQaRepairEvents(root).some((entry) => entry.stage === 'apply_executed'));
    assert.ok(readQaRepairEvents(root).some((entry) => entry.stage === 'truth_kernel_projection_refreshed'));

    const repairLoop = buildQaRepairLoopState(root);
    assert.ok(repairLoop.provingCase);
    assert.equal(repairLoop.provingCase.repair_job_id, job.id);
    assert.equal(repairLoop.provingCase.lane, 'validation_seam');
    assert.equal(repairLoop.provingCase.target_type, 'external_validation_contract');
    assert.equal(repairLoop.provingCase.truth_application_status, 'verified_healthy');
    assert.equal(repairLoop.provingCase.last_apply_receipt_id, result.apply_receipt.receipt_id);
    assert.equal(repairLoop.provingCase.post_apply_verification_verdict, 'accepted');
    assert.equal(repairLoop.provingCase.status_line, `${job.id} | validation_seam | external_validation_contract | verified_healthy | ${result.apply_receipt.receipt_id} | accepted`);
    assert.equal(repairLoop.provingCase.receipt_count, 1);
    assert.ok(repairLoop.provingCase.event_stages.includes('proposal_stored'));
    assert.ok(repairLoop.provingCase.event_stages.includes('apply_executed'));
    assert.ok(repairLoop.provingCase.event_stages.includes('canonical_truth_updated'));
    assert.ok(repairLoop.provingCase.event_stages.includes('truth_kernel_projection_refreshed'));

    const qaState = buildQAStatePayload(root);
    assert.equal(qaState.repairLoop.provingCase.repair_job_id, job.id);

    const deskPayload = buildDeskPropertiesPayload({
      studio: {
        layout: createDefaultStudioLayoutSchema(),
      },
    }, 'qa-lead', qaState);
    assert.equal(deskPayload.qa.repairLoop.provingCase.truth_application_status, 'verified_healthy');

    const truthKernel = buildTruthKernelPayload({ rootPath: root, workspace: {} });
    const repairNode = truthKernel.nodes.find((node) => node.id === job.id);
    assert.ok(repairNode);
    assert.equal(repairNode.verdict, 'verified_healthy');
    assert.equal(repairNode.status, 'healthy');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
