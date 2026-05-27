import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ensureQAStorage, writeStructuredQAReport } = require('../qaRunner.js');
const {
  buildDeskPropertiesPayload,
  buildQAStatePayload,
} = require('../server.js');

function writeJson(rootPath, relativePath, value) {
  const targetPath = path.join(rootPath, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export default async function runEvaluatorServerIntegrationTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluator-server-'));
  ensureQAStorage(rootPath);
  const staleTimestamp = '2026-04-10T09:00:00.000Z';
  const freshTimestamp = '2026-04-11T09:30:00.000Z';

  writeStructuredQAReport(rootPath, {
    status: 'pass',
    summary: 'Structured QA is available for evaluator projection.',
    createdAt: freshTimestamp,
    finishedAt: freshTimestamp,
    metricDefinitions: {
      schema: 'qa.test-metric-definitions.v1',
      version: 1,
      metrics: {
        integrity: { label: 'Integrity' },
      },
    },
    desks: [{
      desk: 'planner',
      status: 'pass',
      tests: [{
        name: 'contract_check',
        status: 'pass',
        qualityCard: {
          id: 'planner.contract_check',
          desk: 'planner',
          testId: 'contract_check',
          testName: 'Planner contract check',
          status: 'pass',
          updatedAt: freshTimestamp,
          overallScore: { value: 3.8, max: 4 },
          validation: {
            ok: true,
            issues: [],
            summary: 'Quality card validation complete.',
          },
        },
      }],
    }],
  }, 'latest');

  writeJson(rootPath, 'data/spatial/evaluator/history.json', [{
    run_id: 'evaluator_1',
    evaluator_id: 'evaluator',
    compared_at: freshTimestamp,
    comparison_target: 'system_runtime',
    analysis_classification: 'derived_analysis',
    authority_scope: 'comparative_projection',
    verdict: 'better',
    delta_score: 0.9,
    progress_summary: 'Planner runtime posture improved compared with the prior snapshot.',
    changed_dimensions: ['agent_cognition', 'fallback_pressure', 'task_progress', 'truth_kernel', 'qa_support'],
    evaluation_confidence: 0.83,
    cognition_mode: 'model_live',
    model_name: 'qwen3.5-9b',
    score_pressure: 'upward',
    progress_state: 'stable',
    source_snapshot_ids: {
      previous: 'eval_prev',
      current: 'eval_curr',
    },
    scorecard_impacts: [{
      card_id: 'planner.contract_check',
      desk: 'planner',
      test_id: 'contract_check',
      verdict: 'better',
      delta_score: 0.9,
        progress_summary: 'Planner contract check recovered to a passing posture.',
        score_pressure: 'upward',
      }],
    dimension_impacts: [{
      id: 'agent_cognition',
      label: 'Agent cognition',
      verdict: 'better',
      delta: 0.7,
      summary: 'Planner stayed live instead of falling back.',
      weight: 0.32,
    }],
    consulted_seams: [
      { id: 'agent_runtime', label: 'Agent runtime', classification: 'canonical_source', available: true, freshness: 'fresh', source_paths: ['data/spatial/workspace.json'] },
      { id: 'task_progress', label: 'Task progress', classification: 'canonical_source', available: true, freshness: 'fresh', source_paths: ['data/spatial/workspace.json'] },
      { id: 'truth_kernel', label: 'Truth kernel', classification: 'derived_projection', available: true, freshness: 'fresh', source_paths: ['ui/truthKernelAdapter.buildTruthKernelPayload'] },
      { id: 'qa_posture', label: 'QA posture', classification: 'canonical_source', available: true, freshness: 'fresh', source_paths: ['data/spatial/qa/lead-state.json', 'data/spatial/qa/structured/latest.json'] },
      { id: 'qa_support', label: 'QA scorecards', classification: 'derived_projection', available: true, freshness: 'fresh', source_paths: ['data/spatial/qa/structured/latest.json'] },
    ],
    grounding: {
      status: 'grounded',
      completeness: 1,
      isGrounded: true,
      missing_input_ids: [],
      caveats: [],
    },
    qa_authority: {
      owner: 'qa',
      role: 'adjudicated_reference',
      evaluator_role: 'derived_analysis_only',
    },
    provenance: {
      comparison_basis: 'system_runtime',
      qa_role: 'adjudicated_reference_only',
      scorecard_role: 'supporting_signal_only',
      consulted_seam_ids: ['agent_runtime', 'task_progress', 'truth_kernel', 'qa_posture', 'qa_support'],
      compared_at: freshTimestamp,
    },
  }]);
  writeJson(rootPath, 'data/spatial/evaluator/state.json', {
    updated_at: freshTimestamp,
    latest_evaluation: {
      run_id: 'evaluator_1',
      evaluator_id: 'evaluator',
      compared_at: freshTimestamp,
      comparison_target: 'system_runtime',
      analysis_classification: 'derived_analysis',
      authority_scope: 'comparative_projection',
      verdict: 'better',
      delta_score: 0.9,
      progress_summary: 'Planner runtime posture improved compared with the prior snapshot.',
      changed_dimensions: ['agent_cognition', 'fallback_pressure', 'task_progress', 'truth_kernel', 'qa_support'],
      evaluation_confidence: 0.83,
      cognition_mode: 'model_live',
      model_name: 'qwen3.5-9b',
      score_pressure: 'upward',
      progress_state: 'stable',
      source_snapshot_ids: {
        previous: 'eval_prev',
        current: 'eval_curr',
      },
      scorecard_impacts: [{
        card_id: 'planner.contract_check',
        desk: 'planner',
        test_id: 'contract_check',
        verdict: 'better',
        delta_score: 0.9,
          progress_summary: 'Planner contract check recovered to a passing posture.',
          score_pressure: 'upward',
        }],
      dimension_impacts: [{
        id: 'agent_cognition',
        label: 'Agent cognition',
        verdict: 'better',
        delta: 0.7,
        summary: 'Planner stayed live instead of falling back.',
        weight: 0.32,
      }],
      consulted_seams: [
        { id: 'agent_runtime', label: 'Agent runtime', classification: 'canonical_source', available: true, freshness: 'fresh', source_paths: ['data/spatial/workspace.json'] },
        { id: 'task_progress', label: 'Task progress', classification: 'canonical_source', available: true, freshness: 'fresh', source_paths: ['data/spatial/workspace.json'] },
        { id: 'truth_kernel', label: 'Truth kernel', classification: 'derived_projection', available: true, freshness: 'fresh', source_paths: ['ui/truthKernelAdapter.buildTruthKernelPayload'] },
        { id: 'qa_posture', label: 'QA posture', classification: 'canonical_source', available: true, freshness: 'fresh', source_paths: ['data/spatial/qa/lead-state.json', 'data/spatial/qa/structured/latest.json'] },
        { id: 'qa_support', label: 'QA scorecards', classification: 'derived_projection', available: true, freshness: 'fresh', source_paths: ['data/spatial/qa/structured/latest.json'] },
      ],
      grounding: {
        status: 'grounded',
        completeness: 1,
        isGrounded: true,
        missing_input_ids: [],
        caveats: [],
      },
      qa_authority: {
        owner: 'qa',
        role: 'adjudicated_reference',
        evaluator_role: 'derived_analysis_only',
      },
      provenance: {
        comparison_basis: 'system_runtime',
        qa_role: 'adjudicated_reference_only',
        scorecard_role: 'supporting_signal_only',
        consulted_seam_ids: ['agent_runtime', 'task_progress', 'truth_kernel', 'qa_posture', 'qa_support'],
        compared_at: freshTimestamp,
      },
    },
    latest_snapshot: {
      snapshot_id: 'eval_curr',
      captured_at: freshTimestamp,
      comparison_target: 'system_runtime',
      fingerprint: 'eval-curr',
      scorecard_count: 1,
      counts: { pass: 1, warn: 0, stale: 0, fail: 0, missing: 0 },
      aggregate_score: 3.8,
      summary: 'Current evaluator snapshot',
      agent_runtime: {
        agent_count: 4,
        contract_complete_count: 4,
        runtime_configured_count: 4,
        degraded_count: 0,
      },
      agent_cognition: {
        agents: [],
        live_count: 2,
        total_fallback_count: 0,
      },
      fallback_pressure: { total_count: 0, observed_agent_count: 0 },
      task_progress: { complete_count: 3, stalled_count: 0, total_count: 4 },
      truth_kernel: { node_count: 8, healthy_count: 6, degraded_count: 1, active_count: 3, stale_count: 1 },
      qa_posture: { verdict: 'pass', status: 'completed', freshness: 'fresh', adjudicated_at: freshTimestamp },
      failure_memory: { exists: true, repeated_keys: 0, total_keys: 1 },
      qa_support: { aggregate_score: 3.8, pass_count: 1, fail_count: 0 },
      scorecards: [],
    },
    previous_snapshot: {
      snapshot_id: 'eval_prev',
      captured_at: staleTimestamp,
      comparison_target: 'system_runtime',
      fingerprint: 'eval-prev',
      scorecard_count: 1,
      counts: { pass: 0, warn: 1, stale: 0, fail: 0, missing: 0 },
      aggregate_score: 2.9,
      summary: 'Previous evaluator snapshot',
      agent_runtime: {
        agent_count: 4,
        contract_complete_count: 4,
        runtime_configured_count: 3,
        degraded_count: 1,
      },
      agent_cognition: {
        agents: [],
        live_count: 1,
        total_fallback_count: 2,
      },
      fallback_pressure: { total_count: 2, observed_agent_count: 1 },
      task_progress: { complete_count: 1, stalled_count: 2, total_count: 4 },
      truth_kernel: { node_count: 8, healthy_count: 3, degraded_count: 3, active_count: 1, stale_count: 2 },
      qa_posture: { verdict: 'warn', status: 'degraded', freshness: 'fresh', adjudicated_at: staleTimestamp },
      failure_memory: { exists: true, repeated_keys: 2, total_keys: 3 },
      qa_support: { aggregate_score: 2.9, pass_count: 0, fail_count: 1 },
      scorecards: [],
    },
    history_count: 1,
  });
  writeJson(rootPath, 'data/spatial/agent-runs/context-manager/context_manager_1.json', {
    id: 'context_manager_1',
    createdAt: staleTimestamp,
    completedAt: staleTimestamp,
    status: 'completed',
    usedFallback: false,
  });
  writeJson(rootPath, 'data/spatial/agent-runs/planner/planner_1.json', {
    id: 'planner_1',
    createdAt: staleTimestamp,
    completedAt: staleTimestamp,
    status: 'completed',
    outcome: 'completed',
    llmStatus: 'live',
  });
  writeJson(rootPath, 'data/spatial/agent-runs/executor/executor_1.json', {
    id: 'executor_1',
    createdAt: staleTimestamp,
    completedAt: staleTimestamp,
    status: 'completed',
    usedFallback: true,
  });

  const workspace = {
    studio: {
      layout: {},
      agentWorkers: {
        'context-manager': { backend: 'ollama', model: 'qwen3.5-9b' },
        planner: { backend: 'ollama', model: 'qwen3.5-9b' },
        executor: { backend: 'ollama', model: 'qwen3.5-9b' },
        evaluator: { backend: 'ollama', model: 'qwen3.5-9b' },
      },
      orchestrator: {
        desks: {
          'qa-lead': {
            mission: 'Review QA movement',
            currentGoal: 'Expose evaluator movement and agent liveness',
            localState: 'review',
            workItems: [],
          },
        },
      },
      deskProperties: {},
      teamBoard: { cards: [] },
      handoffs: {},
      selfUpgrade: {},
    },
    graph: { nodes: [], edges: [] },
    graphs: {
      system: { nodes: [], edges: [] },
      world: { nodes: [], edges: [] },
    },
    intentState: {
      registry: {
        currentIntentId: null,
        latestIntentId: null,
        byId: {},
        records: [],
      },
      currentIntentId: null,
      summary: '',
      status: 'idle',
    },
  };

  writeJson(rootPath, 'data/spatial/workspace.json', workspace);

  const qaState = buildQAStatePayload(rootPath, {
    workspace,
    qaCanaries: {
      summary: 'Canary suite bypassed for focused evaluator integration coverage.',
      overall_status: 'pass',
      total_canaries: 0,
      passed_count: 0,
      failed_count: 0,
      failing_canary_ids: [],
      results: [],
    },
  });
  assert.equal(qaState.evaluator.latestEvaluation.verdict, 'better');
  assert.equal(qaState.evaluator.latestEvaluation.comparison_target, 'system_runtime');
  assert.equal(qaState.evaluator.latestEvaluation.analysis_classification, 'derived_analysis');
  assert.equal(qaState.evaluator.movement.analysisClassification, 'derived_analysis');
  assert.equal(qaState.evaluator.movement.grounding.status, 'grounded');
  assert.equal(qaState.evaluator.movement.consultedSeams.some((entry) => entry.id === 'truth_kernel' && entry.classification === 'derived_projection'), true);
  assert.equal(Array.isArray(qaState.evaluator.latestEvaluation.dimension_impacts), true);
  assert.equal(Object.prototype.hasOwnProperty.call(qaState.scorecards[0], 'evaluatorMovement'), false);
  assert.equal(qaState.agentCognitionSummary.agents.find((entry) => entry.agent_id === 'evaluator').actual_last_cognition_mode, 'model_live');
  assert.equal(qaState.agentCognitionSummary.agents.find((entry) => entry.agent_id === 'executor').actual_last_cognition_mode, 'deterministic_fallback');

  const deskPayload = buildDeskPropertiesPayload(workspace, 'qa-lead', qaState, { rootPath });
  assert.equal(deskPayload.qa.evaluator.latestEvaluation.verdict, 'better');
  assert.equal(deskPayload.qa.evaluator.movement.qaAuthority.owner, 'qa');
  assert.equal(Array.isArray(deskPayload.qa.agentCognitionSummary.agents), true);
  assert.equal(deskPayload.truth.evaluator.latestEvaluation.verdict, 'better');
  assert.equal(deskPayload.truth.agentCognitionSummary.agents.find((entry) => entry.agent_id === 'planner').actual_last_cognition_mode, 'model_live');
}
