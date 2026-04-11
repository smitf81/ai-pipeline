import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  evaluateSnapshots,
  maybeRunEvaluatorCycle,
  readEvaluatorState,
} = require(path.resolve(process.cwd(), 'evaluatorAgent.js'));

function makeSnapshot(id, score, status = 'pass') {
  return {
    snapshot_id: id,
    captured_at: '2026-04-11T10:00:00.000Z',
    comparison_target: 'qa_scorecards',
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

  const liveResult = await evaluateSnapshots({
    rootPath,
    previousSnapshot,
    currentSnapshot,
    comparisonTarget: 'qa_scorecards',
    contextSummary: 'Compare the latest structured QA state.',
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
            progress_summary: 'Planner contract scorecard improved materially.',
            changed_dimensions: ['scorecards', 'failure_pressure'],
            evaluation_confidence: 0.81,
            score_pressure: 'upward',
            progress_state: 'stable',
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
  assert.equal(requests[0].body.model, 'mistral:latest');
  assert.match(requests[0].body.prompt, /Compare only the supplied previous and current snapshots/i);
  assert.equal(liveResult.evaluation.verdict, 'better');
  assert.equal(liveResult.evaluation.cognition_mode, 'model_live');
  assert.equal(liveResult.evaluation.model_name, 'mistral:latest');
  assert.equal(liveResult.evaluation.source_snapshot_ids.previous, 'snapshot_prev');
  assert.equal(liveResult.evaluation.source_snapshot_ids.current, 'snapshot_curr');
  assert.equal(Array.isArray(liveResult.evaluation.changed_dimensions), true);
  assert.equal(Array.isArray(liveResult.evaluation.scorecard_impacts), true);

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
  assert.equal(['better', 'worse', 'no_change'].includes(fallbackResult.evaluation.verdict), true);
  assert.match(String(fallbackResult.evaluation.fallback_reason || ''), /ollama unavailable/i);
  assert.equal(readEvaluatorState(fallbackRoot).history.length, 1);
}
