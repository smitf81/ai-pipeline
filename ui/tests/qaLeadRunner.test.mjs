import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  readQaLeadOutput,
  runQaLeadCycle,
} = require('../qaLeadRunner.js');

export default async function runQaLeadRunnerTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-qa-lead-runner-'));
  const now = '2026-04-06T12:00:00.000Z';

  try {
    const run = await runQaLeadCycle(rootPath, {
      runId: 'qa_lead_test_cycle',
      startedAt: now,
      baseUrl: 'http://127.0.0.1:3000',
      probeUrl: 'http://127.0.0.1:5051/run_test',
      bootHealth: {
        checked_at: now,
        safeMode: true,
        status: 'blocked',
        failure_class: 'missing_client_asset',
        failure_stage: 'required_modules_loaded',
        asset: '/intentAnalysis.js',
        reason: 'Studio shell mounted, but boot failed because required client asset "/intentAnalysis.js" was missing.',
        summary: 'UI boot failed because required client asset "/intentAnalysis.js" was missing.',
      },
      bootRepair: {
        repairResult: {
          summary: 'Replaced stale browser asset reference /intentAnalysis.js with /spatial/intentContract.browser.js.',
        },
      },
      externalProbeRunner: async () => ({
        ok: true,
        source: 'external_mcp',
        probeStatus: 'ok',
        lastCheckedAt: now,
        internal_truth: {
          status: 'pass',
          source: 'structured_qa',
          timestamp: now,
          details: 'Structured QA report passed.',
        },
        comparison: {
          status_match: true,
          freshness_known: true,
          notes: [],
        },
      }),
      browserRunner: async () => ({
        id: 'qa_browser_test',
        status: 'completed',
        verdict: 'pass',
        scenario: 'studio-smoke',
        summary: 'Browser QA run completed.',
        createdAt: now,
        finishedAt: now,
      }),
      canaryRunner: async () => ({
        overall_status: 'pass',
        summary: 'All lane canaries passed.',
        last_run_at: now,
        passed_count: 3,
        failed_count: 0,
        results: [
          { canary_id: 'ui_boot_integrity', label: 'UI boot integrity', status: 'pass' },
        ],
      }),
      loopAuditRunner: async () => ({
        overall_status: 'pass',
        summary: 'All injected loop faults behaved as expected.',
        completed_at: now,
        failing_fault_ids: [],
        comparisons: [
          { fault_id: 'missing_required_asset', pass: true },
        ],
      }),
      qaRepairLoopModule: {
        buildQaRepairLoopState: () => ({
          summary: {
            totalJobs: 0,
            blockedLanes: 0,
            activeLanes: 0,
          },
          latestAttempt: null,
          latestJob: null,
          lanes: [],
        }),
      },
    });

    assert.equal(run.status, 'live');
    assert.equal(run.live_status.status, 'live');
    assert.equal(run.live_status.using_mcp_for_qa_decisions, true);
    assert.match(run.current_task, /QA boot recovery:/);
    assert.ok(run.output_feed.some((item) => item.id === 'proof-of-life'));
    assert.ok(run.output_feed.some((item) => item.id === 'boot-preflight'));
    assert.ok(run.output_feed.some((item) => item.id === 'browser-pass'));
    assert.ok(run.output_feed.some((item) => item.id === 'lane-canaries'));
    assert.ok(run.output_feed.some((item) => item.id === 'loop-audit'));
    assert.ok(run.output_feed.some((item) => item.id === 'mcp-live-status'));
    assert.ok(run.active_tools.includes('boot_preflight'));
    assert.ok(run.active_tools.includes('ui_boot_repair'));

    const leadOutput = readQaLeadOutput(rootPath);
    assert.equal(leadOutput.latestRun.id, run.id);
    assert.equal(leadOutput.state.status, 'live');
    assert.ok(Array.isArray(leadOutput.state.output_feed));
    assert.ok(leadOutput.state.output_feed.length >= 4);

    const stateFile = path.join(rootPath, 'data', 'spatial', 'qa', 'lead-state.json');
    const runFile = path.join(rootPath, 'data', 'spatial', 'qa', 'lead-runs', `${run.id}.json`);
    assert.ok(fs.existsSync(stateFile));
    assert.ok(fs.existsSync(runFile));
  } finally {
    fs.rmSync(rootPath, { recursive: true, force: true });
  }
}
