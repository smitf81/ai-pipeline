import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function writeJson(rootPath, relativePath, payload) {
  const targetPath = path.join(rootPath, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export default async function runCtoGovernedRepairTruthTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-cto-governed-repair-'));
  const {
    createDefaultStudioLayoutSchema,
    buildCtoDiagnosticsPayload,
    buildCtoGovernedRepairReference,
    buildCtoPromptContext,
  } = require('../server.js');

  const layout = createDefaultStudioLayoutSchema();
  const workspace = {
    graph: { nodes: [], edges: [] },
    graphs: { system: { nodes: [], edges: [] }, world: { nodes: [], edges: [] } },
    pages: [{ id: 'page_1', title: 'CTO repair truth' }],
    activePageId: 'page_1',
    studio: {
      layout,
      handoffs: { contextToPlanner: null, history: [] },
      teamBoard: { cards: [], selectedCardId: null },
      orchestrator: { desks: {}, activeDeskIds: [], conflicts: [] },
      ctoOverrides: { version: 'ace/cto-overrides.v1', entries: [] },
    },
  };

  writeJson(rootPath, 'data/spatial/workspace.json', workspace);
  writeJson(rootPath, 'data/spatial/pages.json', {
    activePageId: 'page_1',
    pages: workspace.pages,
  });
  writeJson(rootPath, 'data/spatial/studio-state.json', {
    handoffs: { contextToPlanner: null, history: [] },
    teamBoard: { cards: [], selectedCardId: null },
  });
  writeJson(rootPath, 'data/spatial/intent-state.json', {
    registry: {
      currentIntentId: null,
      latestIntentId: null,
      byId: {},
      records: [],
    },
    currentIntentId: null,
    summary: null,
    status: 'idle',
  });
  writeJson(rootPath, 'data/spatial/ta-department.json', {
    hiredCandidates: [],
    updatedAt: null,
    lastGeneratedGap: null,
  });
  writeJson(rootPath, 'data/spatial/qa/repair-jobs.json', [{
    id: 'qa_repair_job_truth_1',
    investigation_id: 'qa_investigation_truth_1',
    lane: 'validation_seam',
    target_type: 'external_validation_contract',
    summary: 'Repair applied and verified.',
    status: 'accepted',
    created_at: '2026-04-09T09:00:00.000Z',
    updated_at: '2026-04-09T09:03:00.000Z',
    truth_application_status: 'verified_healthy',
    latest_apply_receipt_id: 'qa_apply_receipt_truth_1',
    latest_verdict: 'accepted',
    consistency_status: 'consistent',
  }]);
  writeJson(rootPath, 'data/spatial/qa/repair-attempts.json', [{
    attempt_id: 'qa_repair_attempt_truth_1',
    repair_job_id: 'qa_repair_job_truth_1',
    investigation_id: 'qa_investigation_truth_1',
    lane: 'validation_seam',
    timestamp: '2026-04-09T09:03:00.000Z',
    validation_verdict: 'accepted',
    status: 'accepted',
    truth_application_status: 'verified_healthy',
    apply_receipt_id: 'qa_apply_receipt_truth_1',
    created_at: '2026-04-09T09:03:00.000Z',
  }]);
  writeJson(rootPath, 'data/spatial/qa/repair-apply-receipts.json', [{
    receipt_id: 'qa_apply_receipt_truth_1',
    repair_job_id: 'qa_repair_job_truth_1',
    attempt_id: 'qa_repair_attempt_truth_1',
    investigation_id: 'qa_investigation_truth_1',
    lane: 'validation_seam',
    target_type: 'external_validation_contract',
    patch_artifact_id: 'patch_truth_1',
    target_identifiers: ['ui/externalQaProbe.js'],
    files_touched: ['ui/externalQaProbe.js'],
    pre_snapshot: [{ path: 'ui/externalQaProbe.js', hash: 'before' }],
    post_snapshot: [{ path: 'ui/externalQaProbe.js', hash: 'after' }],
    apply_timestamp: '2026-04-09T09:02:00.000Z',
    apply_verdict: 'applied',
    apply_status: 'applied',
    summary: 'Applied deterministic validation contract repair.',
    created_at: '2026-04-09T09:02:00.000Z',
  }]);
  writeJson(rootPath, 'data/spatial/qa/repair-events.json', [
    {
      event_id: 'qa_repair_event_truth_1',
      stage: 'apply_accepted',
      repair_job_id: 'qa_repair_job_truth_1',
      lane: 'validation_seam',
      truth_application_status: 'accepted_pending_apply',
      created_at: '2026-04-09T09:01:00.000Z',
    },
    {
      event_id: 'qa_repair_event_truth_2',
      stage: 'apply_executed',
      repair_job_id: 'qa_repair_job_truth_1',
      lane: 'validation_seam',
      truth_application_status: 'applied_pending_verification',
      receipt_ref: 'qa_apply_receipt_truth_1',
      created_at: '2026-04-09T09:02:00.000Z',
    },
    {
      event_id: 'qa_repair_event_truth_3',
      stage: 'qa_revalidation_result',
      repair_job_id: 'qa_repair_job_truth_1',
      lane: 'validation_seam',
      truth_application_status: 'verified_healthy',
      receipt_ref: 'qa_apply_receipt_truth_1',
      created_at: '2026-04-09T09:03:00.000Z',
    },
  ]);
  const diagnosticsPayload = await buildCtoDiagnosticsPayload({
    rootPath,
    workspace,
    diagnostics: {
      version: 'ace/cto-diagnostics.v1',
      updated_at: '2026-04-09T09:05:00.000Z',
      entries: [],
    },
    qaEvidence: {
      canonicalTruth: {
        projectionId: 'qa_evidence',
      },
      qaLeadPosture: {
        posture_id: 'qa_posture_truth_1',
        verdict: 'healthy',
        status: 'adjudicated',
        adjudicated_at: '2026-04-09T09:04:00.000Z',
        summary: 'QA lead posture available.',
      },
    },
  });
  assert.equal(diagnosticsPayload.governedRepair.classification, 'canonical_source');
  assert.equal(diagnosticsPayload.governedRepair.canonical_source, 'data/spatial/qa/repair-jobs.json');
  assert.equal(diagnosticsPayload.governedRepair.repair_job_id, 'qa_repair_job_truth_1');
  assert.equal(diagnosticsPayload.governedRepair.lane, 'validation_seam');
  assert.equal(diagnosticsPayload.governedRepair.target_type, 'external_validation_contract');
  assert.equal(diagnosticsPayload.governedRepair.truth_application_status, 'verified_healthy');
  assert.equal(diagnosticsPayload.governedRepair.latest_verification_verdict, 'accepted');
  assert.equal(diagnosticsPayload.governedRepair.supporting_evidence.classification, 'evidence_artefact');
  assert.equal(diagnosticsPayload.governedRepair.supporting_evidence.last_apply_receipt_id, 'qa_apply_receipt_truth_1');
  assert.equal(
    diagnosticsPayload.governedRepair.repair_job_id,
    diagnosticsPayload.repairLoop.provingCase.repair_job_id,
  );
  assert.equal(
    diagnosticsPayload.governedRepair.latest_verification_verdict,
    diagnosticsPayload.repairLoop.provingCase.post_apply_verification_verdict,
  );

  const promptContext = buildCtoPromptContext({
    workspace: {},
    pipeline: null,
    desks: [],
    ta: null,
    cto: {
      overrides: { entryCount: 0, activeCount: 0 },
      overrideLayer: { planningMode: 'normal' },
      governedRepair: diagnosticsPayload.governedRepair,
    },
  });
  assert.equal(promptContext.cto.governedRepair.repair_job_id, 'qa_repair_job_truth_1');
  assert.equal(promptContext.cto.governedRepair.truth_application_status, 'verified_healthy');

  const blockedReference = buildCtoGovernedRepairReference({
    provingCase: {
      repair_job_id: 'qa_repair_job_blocked_1',
      lane: 'validation_seam',
      target_type: 'external_validation_contract',
      truth_application_status: 'blocked_degraded',
      consistency_status: 'warning',
      consistency_issues: ['verification_missing'],
      last_apply_receipt_id: null,
      post_apply_verification_verdict: 'blocked',
      event_stages: ['apply_accepted'],
      status_line: 'blocked',
    },
    jobs: [{
      id: 'qa_repair_job_blocked_1',
      consistency_status: 'warning',
      policy_block_reason: 'Preflight blocked apply.',
    }],
  });
  assert.equal(blockedReference.blocked_reason, 'Preflight blocked apply.');
  assert.equal(blockedReference.latest_verification_verdict, 'blocked');
}
