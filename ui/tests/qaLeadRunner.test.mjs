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
const {
  readQaOutputFeed,
} = require('../qaOutputFeed.js');
const {
  buildQAStatePayload,
} = require('../server.js');

const QA_CANARY_STUB = {
  overall_status: 'pass',
  summary: 'QA canaries not needed for this persistence proof.',
  results: [],
  failing_canary_ids: [],
  last_run_at: '2026-04-06T12:00:00.000Z',
};

export default async function runQaLeadRunnerTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-qa-lead-runner-'));
  const now = new Date().toISOString();

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
        probeTarget: 'http://127.0.0.1:5051/run_test',
        source_ref: 'ui/externalQaProbe.buildExternalQaProbeCheckPayload',
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
        browser_status: 'pass',
        browser_failure_stage: null,
        browser_failure_code: null,
        browser_runtime_target: {
          attempted: ['chromium'],
          used: 'chromium',
          fallbackUsed: false,
        },
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
    assert.equal(run.external_validation.externalProbeLive, true);
    assert.equal(run.external_validation.usedFallback, false);
    assert.equal(run.external_validation.mcpEvidenceSource, 'live_helper');
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
    const persistedFeed = readQaOutputFeed(rootPath);
    assert.equal(leadOutput.latestRun.id, run.id);
    assert.equal(leadOutput.state.status, 'live');
    assert.ok(Array.isArray(leadOutput.state.output_feed));
    assert.ok(leadOutput.state.output_feed.length >= 4);
    assert.equal(persistedFeed.items.length, 1);
    assert.equal(persistedFeed.items[0].meta.cycleId, run.id);
    assert.equal(persistedFeed.items[0].result, 'fail');
    assert.equal(persistedFeed.items[0].meta.investigationCount, 0);
    assert.equal(persistedFeed.items[0].meta.mcpEvidenceSource, 'live_helper');
    assert.equal(persistedFeed.items[0].meta.externalProbeLive, true);
    assert.equal(persistedFeed.items[0].meta.usedFallback, false);
    assert.match(persistedFeed.items[0].summary, /Live MCP helper evidence captured/i);
    const proofOfLife = run.output_feed.find((item) => item.id === 'proof-of-life');
    assert.equal(proofOfLife.summary, 'External QA probe returned a fresh live QA MCP helper result.');
    assert.ok(proofOfLife.notes.includes('Evidence source: live_helper'));
    assert.ok(proofOfLife.notes.includes('Fallback used: no'));
    assert.ok(proofOfLife.notes.includes('Live helper evidence was consumed through external_probe_check.'));
    const browserPass = run.output_feed.find((item) => item.id === 'browser-pass');
    assert.equal(browserPass.verdict, 'pass');
    assert.equal(browserPass.tool, 'chromium');
    assert.ok(browserPass.notes.includes('Runtime attempted: chromium'));
    assert.ok(browserPass.notes.includes('Runtime used: chromium'));
    assert.ok(browserPass.notes.includes('Runtime fallback used: no'));

    readQaLeadOutput(rootPath);
    readQaLeadOutput(rootPath);
    assert.equal(readQaOutputFeed(rootPath).items.length, 1);

    const stateFile = path.join(rootPath, 'data', 'spatial', 'qa', 'lead-state.json');
    const runFile = path.join(rootPath, 'data', 'spatial', 'qa', 'lead-runs', `${run.id}.json`);
    assert.ok(fs.existsSync(stateFile));
    assert.ok(fs.existsSync(runFile));
  } finally {
    fs.rmSync(rootPath, { recursive: true, force: true });
  }

  const mcpRootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-qa-lead-mcp-proof-'));
  try {
    const failedRun = await runQaLeadCycle(mcpRootPath, {
      runId: 'qa_lead_mcp_fail',
      startedAt: '2026-04-06T12:00:00.000Z',
      baseUrl: 'http://127.0.0.1:3000',
      probeUrl: 'http://127.0.0.1:5051/run_test',
      externalProbeRunner: async () => ({
        ok: false,
        probe_status: 'invalid_contract',
        probe_target: 'http://127.0.0.1:5051/run_test',
        source_ref: 'ui/externalQaProbe.buildExternalQaProbeCheckPayload',
        error: {
          kind: 'invalid_contract',
          message: 'External QA probe returned an invalid contract.',
          detail: 'Field "status" must be "pass" or "fail".',
          probeUrl: 'http://127.0.0.1:5051/run_test',
        },
        internal_truth: {
          status: 'pass',
          source: 'structured_qa',
          timestamp: '2026-04-06T12:00:00.000Z',
          details: 'Structured QA report passed.',
        },
        comparison: {
          status_match: false,
          freshness_known: false,
          notes: ['External probe status is missing.'],
        },
      }),
      browserRunner: async () => ({
        id: 'qa_browser_mcp_fail',
        status: 'completed',
        verdict: 'pass',
        scenario: 'studio-smoke',
        summary: 'Browser QA run completed.',
        createdAt: '2026-04-06T12:00:05.000Z',
        finishedAt: '2026-04-06T12:00:05.000Z',
      }),
      canaryRunner: async () => ({
        overall_status: 'pass',
        summary: 'All lane canaries passed.',
        last_run_at: '2026-04-06T12:00:06.000Z',
        passed_count: 1,
        failed_count: 0,
        results: [],
      }),
      loopAuditRunner: async () => ({
        overall_status: 'pass',
        summary: 'All injected loop faults behaved as expected.',
        completed_at: '2026-04-06T12:00:07.000Z',
        failing_fault_ids: [],
        comparisons: [],
      }),
      qaRepairLoopModule: {
        buildQaRepairLoopState: () => ({
          summary: { totalJobs: 0, blockedLanes: 0, activeLanes: 0 },
          latestAttempt: null,
          latestJob: null,
          lanes: [],
        }),
      },
    });

    assert.equal(failedRun.status, 'degraded');
    assert.equal(failedRun.external_validation.error.kind, 'invalid_contract');

    const persistedFailedState = buildQAStatePayload(mcpRootPath, {
      qaCanaries: QA_CANARY_STUB,
    });
    assert.equal(persistedFailedState.externalValidation.probeStatus, 'invalid_contract');
    assert.equal(persistedFailedState.externalValidation.probeFailureKind, 'invalid_contract');
    assert.match(persistedFailedState.externalValidation.probeFailureDetail || '', /status/i);
    assert.equal(persistedFailedState.externalValidation.probeTarget, 'http://127.0.0.1:5051/run_test');
    assert.equal(persistedFailedState.qaMcpLiveStatus.status, 'degraded');
    assert.equal(persistedFailedState.qaMcpLiveStatus.last_ping_failure_kind, 'invalid_contract');

    const recoveredRun = await runQaLeadCycle(mcpRootPath, {
      runId: 'qa_lead_mcp_recovered',
      startedAt: '2026-04-06T12:05:00.000Z',
      baseUrl: 'http://127.0.0.1:3000',
      probeUrl: 'http://127.0.0.1:5051/run_test',
      externalProbeRunner: async () => ({
        ok: true,
        probe_target: 'http://127.0.0.1:5051/run_test',
        source_ref: 'ui/externalQaProbe.buildExternalQaProbeCheckPayload',
        external_probe: {
          test_id: 'ollama_ping',
          status: 'pass',
          details: 'Ollama reachable',
          timestamp: '2026-04-06T12:05:01.000Z',
          source: 'external_mcp',
        },
        internal_truth: {
          status: 'pass',
          source: 'structured_qa',
          timestamp: '2026-04-06T12:05:00.000Z',
          details: 'Structured QA report passed.',
        },
        comparison: {
          status_match: true,
          freshness_known: true,
          notes: [],
        },
      }),
      browserRunner: async () => ({
        id: 'qa_browser_mcp_recovered',
        status: 'completed',
        verdict: 'pass',
        scenario: 'studio-smoke',
        summary: 'Browser QA run completed.',
        createdAt: '2026-04-06T12:05:05.000Z',
        finishedAt: '2026-04-06T12:05:05.000Z',
      }),
      canaryRunner: async () => ({
        overall_status: 'pass',
        summary: 'All lane canaries passed.',
        last_run_at: '2026-04-06T12:05:06.000Z',
        passed_count: 1,
        failed_count: 0,
        results: [],
      }),
      loopAuditRunner: async () => ({
        overall_status: 'pass',
        summary: 'All injected loop faults behaved as expected.',
        completed_at: '2026-04-06T12:05:07.000Z',
        failing_fault_ids: [],
        comparisons: [],
      }),
      qaRepairLoopModule: {
        buildQaRepairLoopState: () => ({
          summary: { totalJobs: 0, blockedLanes: 0, activeLanes: 0 },
          latestAttempt: null,
          latestJob: null,
          lanes: [],
        }),
      },
    });

    assert.ok(['live', 'processing', 'reachable_but_idle'].includes(recoveredRun.status));
    const persistedRecoveredState = buildQAStatePayload(mcpRootPath, {
      qaCanaries: QA_CANARY_STUB,
    });
    assert.equal(persistedRecoveredState.externalValidation.status, 'pass');
    assert.equal(persistedRecoveredState.externalValidation.probeStatus, 'ok');
    assert.equal(persistedRecoveredState.externalValidation.probeFailureKind, null);
    assert.equal(persistedRecoveredState.externalValidation.externalProbeLive, true);
    assert.equal(persistedRecoveredState.externalValidation.usedFallback, false);
    assert.equal(persistedRecoveredState.externalValidation.mcpEvidenceSource, 'live_helper');
    assert.equal(persistedRecoveredState.qaMcpLiveStatus.mcp_reachable, true);
    assert.ok(['live', 'reachable_but_idle'].includes(persistedRecoveredState.qaMcpLiveStatus.status));
    assert.equal(persistedRecoveredState.qaLiveCycle.latest_completed_cycle_id, 'qa_lead_mcp_recovered');
    assert.equal(persistedRecoveredState.qaLiveCycle.mcp_status, persistedRecoveredState.qaMcpLiveStatus.status);
  } finally {
    fs.rmSync(mcpRootPath, { recursive: true, force: true });
  }
}
