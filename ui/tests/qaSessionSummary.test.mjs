import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildQAStatePayload,
  buildQaLeadPosture,
} = require('../server.js');
const {
  buildQaSessionSummary,
} = require('../qaSessionSummary.js');
const {
  readQaLeadOutput,
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

function resolveUiRoot() {
  if (fs.existsSync(path.join(process.cwd(), 'server.js'))) {
    return process.cwd();
  }
  if (fs.existsSync(path.join(process.cwd(), 'ui', 'server.js'))) {
    return path.join(process.cwd(), 'ui');
  }
  return path.resolve(process.cwd(), 'ui');
}

export default async function runQaSessionSummaryTests() {
  const uiRoot = resolveUiRoot();
  const repoRoot = path.resolve(uiRoot, '..');
  const now = new Date().toISOString();
  const qaState = buildQAStatePayload(repoRoot, {
    qaCanaries: createIdleQaCanaries(now),
  });
  const qaLeadOutput = readQaLeadOutput(repoRoot);
  const outputFeed = readQaOutputFeed(repoRoot);
  const qaLeadPosture = buildQaLeadPosture({
    qaLead: qaLeadOutput.state,
    qaLeadLatestRun: qaLeadOutput.latestRun,
    structuredReport: qaState.structuredReport || null,
    structuredSummary: qaState.structuredSummary || null,
    externalValidation: qaState.externalValidation || null,
    repairLoop: qaState.repairLoop || null,
    openInvestigations: qaState.openInvestigations || [],
    browserRuns: qaState.browserRuns || [],
    generatedAt: qaLeadOutput.latestRun?.finished_at || now,
  });
  const summary = buildQaSessionSummary({
    qaState,
    qaLeadOutput,
    qaLeadPosture,
    outputFeed,
    generatedAt: qaLeadOutput.latestRun?.finished_at || new Date().toISOString(),
  });

  const leadStatus = String(qaLeadOutput.state?.live_status?.status || qaState.qaMcpLiveStatus?.status || 'unknown');
  const leadReachable = typeof qaLeadOutput.state?.live_status?.mcp_reachable === 'boolean'
    ? qaLeadOutput.state.live_status.mcp_reachable
    : (typeof qaState.qaMcpLiveStatus?.mcp_reachable === 'boolean' ? qaState.qaMcpLiveStatus.mcp_reachable : null);
  const expectedBlocker = (leadReachable === false || ['degraded', 'offline', 'stale'].includes(leadStatus))
    ? 'external_mcp_unreachable'
    : (summary.evidence.pre_adjudication_pending_count > 0
      ? 'pre_adjudication_pending'
      : (summary.cycle.output_feed_count === 0
        ? 'output_feed_empty'
        : 'unknown'));

  assert.equal(summary.source, 'qa_session_summary');
  assert.equal(summary.classification, 'derived');
  assert.equal(summary.derived_from_posture_id, qaLeadPosture.posture_id);
  assert.equal(summary.posture.posture_id, qaLeadPosture.posture_id);
  assert.equal(summary.posture.status, qaLeadPosture.status);
  assert.equal(summary.posture.verdict, qaLeadPosture.verdict);
  assert.equal(summary.cycle.output_feed_count, outputFeed.items.length);
  assert.equal(summary.cycle.feed_active, outputFeed.items.length > 0);
  assert.equal(summary.cycle.latest_completed_cycle_id, qaState.qaLiveCycle?.latest_completed_cycle_id || qaLeadOutput.latestRun?.id || null);
  assert.equal(summary.cycle.output_feed_captured, qaState.qaLiveCycle?.output_feed_captured ?? false);
  assert.equal(summary.cycle.current_gate_source, qaState.qaLiveCycle?.current_gate_source || 'unknown');
  assert.equal(summary.cycle.external_status, qaState.qaLiveCycle?.external_status || 'unknown');
  assert.equal(summary.evidence.open_investigation_count, qaState.openInvestigations.length);
  assert.equal(summary.evidence.mcp_status, leadStatus);
  assert.equal(summary.evidence.mcp_reachable, leadReachable);
  assert.equal(typeof summary.evidence.latest_browser_run_status, 'string');
  assert.equal(summary.qaLiveCycle.latest_completed_cycle_id, qaState.qaLiveCycle?.latest_completed_cycle_id || qaLeadOutput.latestRun?.id || null);
  assert.equal(summary.blocker.key, expectedBlocker);
  if (expectedBlocker === 'external_mcp_unreachable') {
    assert.equal(summary.next_seam.id, 'external_probe_reachability');
  } else if (expectedBlocker === 'pre_adjudication_pending') {
    assert.equal(summary.next_seam.id, 'qa_lead_cycle_promotion');
  } else if (expectedBlocker === 'output_feed_empty') {
    assert.equal(summary.next_seam.id, 'qa_cycle_publication');
  }
}
