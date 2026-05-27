import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildEvaluatorPromptProfile,
  classifyEvaluatorFailureReason,
  evaluateSnapshots,
  maybeRunEvaluatorCycle,
  readEvaluatorState,
} = require(path.resolve(process.cwd(), 'evaluatorAgent.js'));

function makeSnapshot(id, score, status = 'pass') {
  return {
    snapshot_id: id,
    captured_at: '2026-04-11T10:00:00.000Z',
    comparison_target: 'system_runtime',
    fingerprint: `${id}-fingerprint`,
    scorecard_count: 1,
    counts: {
      pass: status === 'pass' ? 1 : 0,
      warn: status === 'warn' ? 1 : 0,
      stale: status === 'stale' ? 1 : 0,
      fail: status === 'fail' ? 1 : 0,
      missing: status === 'missing' ? 1 : 0,
    },
    aggregate_score: score,
    summary: `${id} summary`,
    agent_runtime: {
      agent_count: 4,
      contract_complete_count: 4,
      runtime_configured_count: status === 'pass' ? 4 : 3,
      degraded_count: status === 'pass' ? 0 : 1,
      summary: status === 'pass'
        ? 'Agent runtime contracts are fully configured.'
        : 'One agent runtime contract is degraded.',
    },
    agent_cognition: {
      agents: [{
        agent_id: 'planner',
        intended_cognition_mode: 'model_live',
        actual_last_cognition_mode: status === 'pass' ? 'model_live' : 'deterministic_fallback',
        fallback_count: status === 'pass' ? 0 : 2,
      }],
      live_count: status === 'pass' ? 1 : 0,
      total_fallback_count: status === 'pass' ? 0 : 2,
    },
    fallback_pressure: {
      total_count: status === 'pass' ? 0 : 2,
      observed_agent_count: status === 'pass' ? 0 : 1,
    },
    task_progress: {
      complete_count: status === 'pass' ? 3 : 1,
      stalled_count: status === 'pass' ? 0 : 2,
      total_count: 4,
    },
    truth_kernel: {
      node_count: 4,
      healthy_count: status === 'pass' ? 3 : 1,
      degraded_count: status === 'pass' ? 1 : 3,
      active_count: status === 'pass' ? 2 : 1,
      stale_count: status === 'pass' ? 0 : 2,
    },
    qa_posture: {
      verdict: status === 'pass' ? 'pass' : 'warn',
      status: status === 'pass' ? 'completed' : 'degraded',
      freshness: 'fresh',
      adjudicated_at: '2026-04-11T10:00:00.000Z',
      summary: status === 'pass'
        ? 'QA is fresh and adjudicated.'
        : 'QA remains degraded but fresh.',
    },
    failure_memory: {
      exists: true,
      repeated_keys: status === 'pass' ? 0 : 2,
      total_keys: status === 'pass' ? 1 : 3,
      summary: status === 'pass'
        ? 'Failure memory pressure is low.'
        : 'Failure memory shows repeated regressions.',
    },
    qa_support: {
      aggregate_score: score,
      pass_count: status === 'pass' ? 1 : 0,
      fail_count: status === 'pass' ? 0 : 1,
    },
    scorecards: [{
      id: 'planner.contract',
      desk: 'planner',
      test_id: 'contract',
      test_name: 'planner contract',
      rollup_status: status,
      reported_status: status,
      overall_score: score,
      summary: `${id} card`,
    }],
  };
}

export default async function runEvaluatorAgentTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluator-agent-'));
  const requests = [];
  const previousSnapshot = makeSnapshot('snapshot_prev', 2.4, 'warn');
  const currentSnapshot = makeSnapshot('snapshot_curr', 3.7, 'pass');
  previousSnapshot.scorecards[0].summary = 'x'.repeat(480);
  currentSnapshot.scorecards[0].summary = 'y'.repeat(480);

  const promptProfile = buildEvaluatorPromptProfile({
    previousSnapshot,
    currentSnapshot,
    comparisonTarget: 'system_runtime',
    contextSummary: 'Compare the latest runtime system state.',
  });
  const fullSnapshotPromptChars = [
    'Compare only the supplied previous and current snapshots.',
    'Treat runtime/system-state deltas as primary evidence.',
    'Treat QA scorecards as supporting evidence only.',
    'Do not invent context, missing history, or remediation steps.',
    `Previous snapshot: ${JSON.stringify(previousSnapshot || null)}`,
    `Current snapshot: ${JSON.stringify(currentSnapshot || null)}`,
  ].join('\n').length;
  assert.equal(promptProfile.contextMode, 'scoped');
  assert.equal(promptProfile.promptChars > 0, true);
  assert.match(promptProfile.prompt, /Previous snapshot summary:/);
  assert.match(promptProfile.prompt, /top_scorecards/);
  assert.doesNotMatch(promptProfile.prompt, /x{220,}|y{220,}/);
  assert.equal(classifyEvaluatorFailureReason('Local model request timed out after 30000ms.', {
    promptChars: promptProfile.promptChars,
    contextMode: promptProfile.contextMode,
  }), 'overscoped_context');

  const liveResult = await evaluateSnapshots({
    rootPath,
    previousSnapshot,
    currentSnapshot,
    comparisonTarget: 'system_runtime',
    contextSummary: 'Compare the latest runtime system state.',
    fetchImpl: async (url, options = {}) => {
      requests.push({
        url: String(url),
        body: JSON.parse(String(options.body || '{}')),
      });
      return {
        ok: true,
        json: async () => ({
          response: JSON.stringify({
            verdict: 'better',
            delta_score: 1.3,
            progress_summary: 'Runtime posture improved with more live cognition and lower fallback pressure.',
            changed_dimensions: ['agent_cognition', 'fallback_pressure', 'task_progress', 'truth_kernel'],
            evaluation_confidence: 0.81,
            score_pressure: 'upward',
            progress_state: 'stable',
            dimension_impacts: [{
              id: 'agent_cognition',
              label: 'Agent cognition',
              verdict: 'better',
              delta: 0.7,
              summary: 'Live cognition coverage improved.',
              weight: 0.32,
            }],
            scorecard_impacts: [{
              card_id: 'planner.contract',
              desk: 'planner',
              test_id: 'contract',
              verdict: 'better',
              delta_score: 1.3,
              progress_summary: 'Planner contract scorecard recovered to pass.',
              score_pressure: 'upward',
            }],
          }),
        }),
      };
    },
  });

  assert.equal(liveResult.ok, true);
  assert.equal(requests.length, 1);
  assert.ok(requests[0].url.endsWith('/api/generate'));
  assert.equal(requests[0].body.model, 'qwen3.5-9b');
  assert.match(requests[0].body.prompt, /Compare only the supplied previous and current snapshots/i);
  assert.match(requests[0].body.prompt, /runtime\/system-state deltas as primary evidence/i);
  assert.equal(liveResult.evaluation.verdict, 'better');
  assert.equal(liveResult.evaluation.comparison_target, 'system_runtime');
  assert.equal(liveResult.evaluation.cognition_mode, 'model_live');
  assert.equal(liveResult.evaluation.model_name, 'qwen3.5-9b');
  assert.equal(liveResult.evaluation.source_snapshot_ids.previous, 'snapshot_prev');
  assert.equal(liveResult.evaluation.source_snapshot_ids.current, 'snapshot_curr');
  assert.equal(Array.isArray(liveResult.evaluation.changed_dimensions), true);
  assert.equal(liveResult.evaluation.changed_dimensions.includes('agent_cognition'), true);
  assert.equal(Array.isArray(liveResult.evaluation.dimension_impacts), true);
  assert.equal(Array.isArray(liveResult.evaluation.scorecard_impacts), true);
  assert.equal(liveResult.evaluation.cognition_diagnostics.context_mode, 'scoped');
  assert.equal(liveResult.evaluation.cognition_diagnostics.used_live_call, true);
  assert.equal(liveResult.evaluation.cognition_diagnostics.used_fallback, false);
  assert.equal(liveResult.evaluation.cognition_diagnostics.failure_reason, null);
  assert.equal(liveResult.evaluation.cognition_diagnostics.prompt_chars > 0, true);
  assert.equal(liveResult.evaluation.cognition_diagnostics.timeout_ms, 30000);
  assert.equal(liveResult.evaluation.analysis_classification, 'derived_analysis');
  assert.equal(liveResult.evaluation.authority_scope, 'comparative_projection');
  assert.equal(liveResult.evaluation.qa_authority.owner, 'qa');
  assert.equal(liveResult.evaluation.provenance.classification, 'derived_analysis');
  assert.equal(liveResult.evaluation.provenance.scorecards_role, 'supporting_evidence');
  assert.equal(Array.isArray(liveResult.evaluation.consulted_seams), true);
  assert.equal(liveResult.evaluation.consulted_seams.some((entry) => entry.id === 'truth_kernel' && entry.classification === 'derived_projection'), true);
  assert.equal(liveResult.evaluation.grounding.status, 'grounded');

  const persistedState = readEvaluatorState(rootPath);
  assert.equal(persistedState.state.latest_evaluation.verdict, 'better');
  assert.equal(persistedState.history.length, 1);

  const fallbackRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluator-agent-fallback-'));
  const fallbackResult = await maybeRunEvaluatorCycle({
    rootPath: fallbackRoot,
    scorecards: [{
      id: 'executor.layout',
      desk: 'executor',
      testId: 'layout',
      testName: 'executor layout',
      rollupStatus: 'warn',
      reportedStatus: 'warn',
      overallScore: { value: 2.1, max: 4 },
      summary: 'Layout warnings remain.',
    }],
    contextSummary: 'Fallback coverage check.',
    fetchImpl: async () => {
      throw new Error('ollama unavailable');
    },
  });

  assert.equal(fallbackResult.evaluation.cognition_mode, 'deterministic_fallback');
  assert.equal(fallbackResult.evaluation.verdict, 'no_change');
  assert.match(String(fallbackResult.evaluation.fallback_reason || ''), /ollama unavailable/i);
  assert.equal(fallbackResult.evaluation.cognition_diagnostics.used_fallback, true);
  assert.equal(fallbackResult.evaluation.cognition_diagnostics.failure_reason, 'model_unavailable');
  assert.equal(fallbackResult.evaluation.cognition_diagnostics.prompt_chars > 0, true);
  assert.equal(fallbackResult.evaluation.analysis_classification, 'derived_analysis');
  assert.equal(fallbackResult.evaluation.grounding.status, 'insufficient_inputs');
  assert.equal(fallbackResult.evaluation.grounding.missing_input_ids.includes('task_progress'), true);
  assert.equal(fallbackResult.evaluation.grounding.missing_input_ids.includes('qa_posture'), true);
  assert.match(String(fallbackResult.evaluation.progress_summary || ''), /first grounded system snapshot/i);
  assert.equal(readEvaluatorState(fallbackRoot).history.length, 1);
}
