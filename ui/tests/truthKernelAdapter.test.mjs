import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildTruthKernelPayload } = require(path.resolve(process.cwd(), 'truthKernelAdapter.js'));

function writeJson(rootPath, relativePath, value) {
  const targetPath = path.join(rootPath, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(value, null, 2), 'utf8');
}

export default async function runTruthKernelAdapterTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'truth-kernel-adapter-'));
  writeJson(rootPath, 'data/spatial/agent-runs/context-manager/context_manager_1.json', {
    id: 'context_manager_1',
    startedAt: '2026-04-01T09:15:00.000Z',
    completedAt: '2026-04-01T09:16:00.000Z',
    status: 'completed',
    sourceNodeId: 'node_input_1',
    handoffId: 'handoff_1',
    report: { confidence: 0.71 },
    handoff: {
      id: 'handoff_1',
      createdAt: '2026-04-01T09:16:05.000Z',
      status: 'needs-clarification',
      confidence: 0.66,
      sourceNodeId: 'node_input_1',
    },
  });
  writeJson(rootPath, 'data/spatial/qa/qa_1/runtime.json', {
    runtime: {
      id: 'qa_run_1',
      finishedAt: '2026-04-01T09:20:00.000Z',
      status: 'pass',
      failures: [],
    },
  });
  writeJson(rootPath, 'data/spatial/qa/investigations.json', [{
    id: 'qa_inv_1',
    created_at: '2026-04-01T09:21:00.000Z',
    last_seen_at: '2026-04-01T09:22:00.000Z',
    status: 'open',
  }, {
    id: 'qa_inv_resolved_1',
    created_at: '2026-04-01T09:24:00.000Z',
    last_seen_at: '2026-04-01T09:25:00.000Z',
    status: 'resolved',
    adjudication_state: 'adjudicated_accepted',
  }]);
  writeJson(rootPath, 'data/spatial/qa/repair-jobs.json', [{
    id: 'qa_repair_1',
    investigation_id: 'qa_inv_1',
    lane: 'validation_seam',
    lane_label: 'Validation Seam',
    target_type: 'external_validation_contract',
    summary: 'External validation seam repair',
    truth_application_status: 'applied_pending_verification',
    consistency_status: 'consistent',
    updated_at: '2026-04-01T09:23:30.000Z',
  }, {
    id: 'qa_repair_2',
    investigation_id: 'qa_inv_resolved_1',
    lane: 'validation_seam',
    lane_label: 'Validation Seam',
    target_type: 'external_validation_contract',
    summary: 'Verified external validation seam repair',
    truth_application_status: 'verified_healthy',
    latest_verdict: 'accepted',
    consistency_status: 'consistent',
    updated_at: '2026-04-01T09:25:30.000Z',
  }, {
    id: 'qa_repair_3',
    investigation_id: 'qa_inv_resolved_1',
    lane: 'validation_seam',
    lane_label: 'Validation Seam',
    target_type: 'external_validation_contract',
    summary: 'Verified repair with drift warning',
    truth_application_status: 'verified_healthy',
    latest_verdict: 'accepted',
    consistency_status: 'inconsistent',
    consistency_issues: ['verified_healthy_missing_apply_receipt'],
    updated_at: '2026-04-01T09:26:30.000Z',
  }]);
  writeJson(rootPath, 'data/spatial/qa/repair-attempts.json', [{
    attempt_id: 'qa_attempt_1',
    repair_job_id: 'qa_repair_1',
    truth_application_status: 'applied_pending_verification',
    validation_verdict: 'inconclusive',
    timestamp: '2026-04-01T09:23:40.000Z',
  }, {
    attempt_id: 'qa_attempt_2',
    repair_job_id: 'qa_repair_2',
    truth_application_status: 'verified_healthy',
    validation_verdict: 'accepted',
    timestamp: '2026-04-01T09:25:45.000Z',
  }]);
  writeJson(rootPath, 'data/spatial/qa/repair-apply-receipts.json', [{
    receipt_id: 'qa_receipt_1',
    repair_job_id: 'qa_repair_2',
    apply_status: 'applied',
    apply_verdict: 'applied',
    apply_timestamp: '2026-04-01T09:25:40.000Z',
  }]);
  writeJson(rootPath, 'data/spatial/qa/repair-events.json', [{
    event_id: 'qa_repair_event_1',
    repair_job_id: 'qa_repair_2',
    stage: 'apply_executed',
    created_at: '2026-04-01T09:25:41.000Z',
  }, {
    event_id: 'qa_repair_event_2',
    repair_job_id: 'qa_repair_2',
    stage: 'qa_revalidation_result',
    created_at: '2026-04-01T09:25:46.000Z',
  }]);
  writeJson(rootPath, 'data/spatial/cto-diagnostics.json', {
    entries: [{
      id: 'cto_diag_1',
      timestamp: '2026-04-01T09:23:00.000Z',
      status: 'degraded',
    }],
  });
  writeJson(rootPath, 'data/spatial/evaluator/history.json', [{
    run_id: 'evaluator_1',
    evaluator_id: 'evaluator',
    compared_at: '2026-04-01T09:27:00.000Z',
    comparison_target: 'qa_scorecards',
    verdict: 'better',
    delta_score: 0.85,
    progress_summary: 'QA posture improved across the latest snapshot.',
    changed_dimensions: ['scorecards', 'failure_pressure'],
    evaluation_confidence: 0.8,
    cognition_mode: 'model_live',
    model_name: 'mistral:latest',
    score_pressure: 'upward',
    progress_state: 'stable',
    source_snapshot_ids: {
      previous: 'eval_prev',
      current: 'eval_curr',
    },
  }]);

  const workspace = {
    studio: {
      intake: {
        records: [{
          id: 'intake_1',
          createdAt: '2026-04-01T09:00:00.000Z',
          status: 'captured',
          intentExtraction: {
            canonicalIntentId: 'intent_1',
            confidence: 0.77,
          },
        }],
      },
      handoffs: {
        contextToPlanner: {
          id: 'handoff_1',
          createdAt: '2026-04-01T09:16:05.000Z',
          sourceNodeId: 'node_input_1',
          status: 'needs-clarification',
          confidence: 0.66,
        },
        history: [],
      },
    },
    intentState: {
      registry: {
        records: [{
          id: 'intent_1',
          canonicalIntentId: 'intent_1',
          sourceNodeId: 'node_input_1',
          createdAt: '2026-04-01T09:05:00.000Z',
          updatedAt: '2026-04-01T09:05:30.000Z',
          status: 'active',
          confidence: 0.82,
        }, {
          id: 'intent_orphan_1',
          canonicalIntentId: 'intent_orphan_1',
          sourceNodeId: 'node_orphan_1',
          createdAt: '2026-04-01T10:00:00.000Z',
          updatedAt: '2026-04-01T10:01:00.000Z',
          status: 'active',
          confidence: 0.61,
        }],
      },
    },
  };

  const payload = buildTruthKernelPayload({ rootPath, workspace });
  assert.ok(payload.nodeCount >= 6);
  const ids = new Set(payload.nodes.map((node) => node.id));
  assert.equal(ids.has('intake_1'), true);
  assert.equal(ids.has('intent_1'), true);
  assert.equal(ids.has('context_manager_1'), true);
  assert.equal(ids.has('handoff_1'), true);
  assert.equal(ids.has('qa_run_1'), true);
  assert.equal(ids.has('cto_diag_1'), true);
  assert.equal(ids.has('evaluator_1'), true);
  const intakeNode = payload.nodes.find((node) => node.id === 'intake_1');
  const intentNode = payload.nodes.find((node) => node.id === 'intent_1');
  const orphanIntentNode = payload.nodes.find((node) => node.id === 'intent_orphan_1');
  const openInvestigationNode = payload.nodes.find((node) => node.id === 'qa_inv_1');
  const resolvedInvestigationNode = payload.nodes.find((node) => node.id === 'qa_inv_resolved_1');
  const pendingRepairNode = payload.nodes.find((node) => node.id === 'qa_repair_1');
  const verifiedRepairNode = payload.nodes.find((node) => node.id === 'qa_repair_2');
  const inconsistentRepairNode = payload.nodes.find((node) => node.id === 'qa_repair_3');
  const applyReceiptNode = payload.nodes.find((node) => node.id === 'qa_receipt_1');
  const handoffNode = payload.nodes.find((node) => node.id === 'handoff_1');
  const evaluatorNode = payload.nodes.find((node) => node.id === 'evaluator_1');
  assert.equal(intakeNode.kind, 'input');
  assert.equal(intentNode.kind, 'input');
  assert.equal(handoffNode.kind, 'artifact');
  assert.equal(intakeNode.children.includes('intent_1'), true);
  assert.equal(intentNode.parents.includes('intake_1'), true);
  assert.equal(intentNode.children.includes('handoff_1') || intentNode.children.includes('context_manager_1'), true);
  assert.equal(orphanIntentNode.status, 'orphaned');
  assert.equal(openInvestigationNode.status, 'degraded');
  assert.equal(resolvedInvestigationNode.status, 'healthy');
  assert.equal(pendingRepairNode.status, 'degraded');
  assert.equal(pendingRepairNode.verdict, 'applied_pending_verification');
  assert.equal(pendingRepairNode.lane, 'validation_seam');
  assert.equal(pendingRepairNode.targetType, 'external_validation_contract');
  assert.equal(pendingRepairNode.truthApplicationStatus, 'applied_pending_verification');
  assert.equal(pendingRepairNode.postApplyVerificationVerdict, 'inconclusive');
  assert.equal(pendingRepairNode.consistencyStatus, 'consistent');
  assert.equal(verifiedRepairNode.status, 'healthy');
  assert.equal(verifiedRepairNode.verdict, 'verified_healthy');
  assert.equal(verifiedRepairNode.postApplyVerificationVerdict, 'accepted');
  assert.equal(verifiedRepairNode.supportingEvidence.lastApplyReceiptId, 'qa_receipt_1');
  assert.deepEqual(verifiedRepairNode.supportingEvidence.eventStages, ['apply_executed', 'qa_revalidation_result']);
  assert.equal(inconsistentRepairNode.status, 'blocked');
  assert.equal(inconsistentRepairNode.truthApplicationStatus, 'verified_healthy');
  assert.equal(inconsistentRepairNode.consistencyStatus, 'inconsistent');
  assert.deepEqual(inconsistentRepairNode.consistencyIssues, ['verified_healthy_missing_apply_receipt']);
  assert.equal(applyReceiptNode.status, 'healthy');
  assert.equal(evaluatorNode.status, 'healthy');
  assert.equal(evaluatorNode.truthState, 'stable');
  assert.equal(evaluatorNode.verdict, 'better');
  assert.equal(evaluatorNode.evaluatorDeltaScore, 0.85);
  assert.equal(evaluatorNode.evaluatorCognitionMode, 'model_live');
  assert.equal(payload.nodes.every((node) => ['input', 'execution', 'artifact'].includes(node.kind)), true);
}
