import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildQAStatePayload,
  buildQaLeadPosture,
} = require('../server.js');
const {
  readQaLeadOutput,
  readQaLeadRuns,
  runQaLeadCycle,
} = require('../qaLeadRunner.js');
const {
  readQaOutputFeed,
} = require('../qaOutputFeed.js');

function createIdleQaCanaries(now) {
  return {
    overall_status: 'idle',
    summary: 'QA lane canaries were not part of this targeted test harness.',
    last_run_at: now,
    passed_count: 0,
    failed_count: 0,
    results: [],
  };
}

export default async function runQaLeadCyclePublicationTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-qa-lead-publication-'));
  const now = new Date().toISOString();

  try {
    const run = await runQaLeadCycle(rootPath, {
      runId: 'qa_manual_cycle_publication',
      startedAt: now,
      baseUrl: 'http://127.0.0.1:3000',
      probeUrl: 'http://127.0.0.1:5051/run_test',
      bootHealth: {
        checked_at: now,
        safeMode: true,
        status: 'blocked',
        failure_class: 'external_probe_unreachable',
        failure_stage: 'external_probe',
        reason: 'External MCP probe is unreachable.',
        summary: 'External MCP probe is unreachable.',
      },
      externalProbeRunner: async () => ({
        ok: false,
        source: 'external_mcp',
        probeStatus: 'unreachable',
        lastCheckedAt: now,
        internal_truth: {
          status: 'pass',
          source: 'structured_qa',
          timestamp: now,
          details: 'Structured QA report is available.',
        },
        comparison: {
          status_match: false,
          freshness_known: true,
          notes: ['External MCP probe is unreachable.'],
        },
        errorMessage: 'External MCP probe is unreachable.',
      }),
      browserRunner: async () => ({
        id: 'qa_browser_publication',
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
        passed_count: 1,
        failed_count: 0,
        results: [],
      }),
      loopAuditRunner: async () => ({
        overall_status: 'pass',
        summary: 'All injected loop faults behaved as expected.',
        completed_at: now,
        failing_fault_ids: [],
        comparisons: [],
      }),
      qaRepairLoopModule: {
        buildQaRepairLoopState: () => ({
          summary: {
            totalJobs: 0,
            blockedLanes: 0,
            activeLanes: 1,
          },
          latestAttempt: {
            timestamp: now,
            validation_verdict: 'pass',
          },
          latestJob: null,
          lanes: [
            {
              lane_id: 'qa-lead',
              label: 'QA Lead',
              current_status: 'active',
            },
          ],
        }),
      },
    });

    const leadOutput = readQaLeadOutput(rootPath);
    const feed = readQaOutputFeed(rootPath);
    const rebuiltQaState = buildQAStatePayload(rootPath, {
      externalValidation: leadOutput.state.external_validation || null,
      qaCanaries: createIdleQaCanaries(now),
    });
    const rebuiltQaStateAgain = buildQAStatePayload(rootPath, {
      externalValidation: leadOutput.state.external_validation || null,
      qaCanaries: createIdleQaCanaries(now),
    });
    const qaState = {
      qaLeadPosture: buildQaLeadPosture({
        qaLead: leadOutput.state,
        qaLeadLatestRun: leadOutput.latestRun,
        externalValidation: leadOutput.state.external_validation || null,
        repairLoop: leadOutput.state.repair_loop || null,
        openInvestigations: [],
        browserRuns: [],
        generatedAt: run.finished_at,
      }),
    };

    assert.equal(run.status, 'degraded');
    assert.equal(leadOutput.state.status, 'degraded');
    assert.equal(leadOutput.state.last_completed_cycle_at, run.finished_at);
    assert.ok(Array.isArray(leadOutput.state.output_feed));
    assert.equal(leadOutput.state.output_feed.length >= 1, true);
    assert.equal(feed.items.length, 1);
    assert.equal(feed.items[0].meta.cycleId, run.id);
    assert.equal(feed.items[0].result, 'fail');
    assert.equal(feed.items[0].meta.investigationCount, 0);
    assert.equal(rebuiltQaState.qaLeadLatestRun.id, run.id);
    assert.equal(rebuiltQaStateAgain.qaLeadLatestRun.id, run.id);
    assert.equal(rebuiltQaState.outputFeedLoaded, true);
    assert.equal(Array.isArray(rebuiltQaState.outputFeed), true);
    assert.equal(rebuiltQaState.outputFeed.length, 1);
    assert.equal(rebuiltQaState.qaLiveCycle.latest_completed_cycle_id, run.id);
    assert.equal(rebuiltQaState.qaLiveCycle.output_feed_captured, true);
    assert.equal(typeof rebuiltQaState.qaLiveCycle.current_gate_source, 'string');
    assert.equal(typeof rebuiltQaState.qaLiveCycle.external_status, 'string');
    assert.equal(readQaOutputFeed(rootPath).items.length, 1);
    assert.equal(qaState.qaLeadPosture.posture_id.startsWith('qa_posture_'), true);
    assert.equal(qaState.qaLeadPosture.provenance.run_id, run.id);
    assert.equal(qaState.qaLeadPosture.provenance.cycle_id, run.id);
    assert.equal(qaState.qaLeadPosture.adjudicated_at, run.finished_at);
    assert.equal(qaState.qaLeadPosture.evidence_counts.failed_checks >= 1, true);
    assert.ok(Array.isArray(qaState.qaLeadPosture.inputs));
    assert.equal(qaState.qaLeadPosture.inputs.some((input) => input.type === 'adjudication_cycle'), true);

    const runHistory = readQaLeadRuns(rootPath, 4);
    assert.equal(runHistory[0].id, run.id);
  } finally {
    fs.rmSync(rootPath, { recursive: true, force: true });
  }
}
