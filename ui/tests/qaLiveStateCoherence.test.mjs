import assert from 'node:assert/strict';
import path from 'node:path';

import { smokeLoadSpatialApp } from './helpers/browser-module-loader.mjs';

export default async function runQaLiveStateCoherenceTests() {
  const spatialAppPath = path.resolve(process.cwd(), 'public', 'spatial', 'spatialApp.js');
  const spatialApp = await smokeLoadSpatialApp(spatialAppPath, { locationHref: 'http://localhost/?mode=qa' });

  const now = '2026-04-09T10:30:00.000Z';
  const sections = spatialApp.buildQAReadableSectionsFromState({
    qaLead: {
      source: 'qa_lead_runner',
      id: 'qa_live_cycle_1',
      status: 'live',
      current_task: 'QA lead cycle finished.',
      finished_at: now,
      last_completed_cycle_at: now,
      output_feed: [],
      active_tools: ['external_probe_check'],
      live_status: {
        status: 'live',
        summary: 'QA is live and actively gating with MCP-backed evidence.',
        heartbeat_at: now,
        last_completed_cycle_at: now,
        mcp_configured: true,
        mcp_reachable: true,
        last_qa_gate_source: 'external_mcp',
        using_mcp_for_qa_decisions: true,
      },
      summary: 'QA lead cycle live.',
    },
    qaLeadLatestRun: {
      source: 'qa_lead_runner',
      id: 'qa_live_cycle_1',
      status: 'live',
      finished_at: now,
      last_completed_cycle_at: now,
      output_feed: [],
      active_tools: ['external_probe_check'],
      summary: 'QA lead cycle live.',
    },
    qaMcpLiveStatus: {
      status: 'live',
      summary: 'QA is live and actively gating with MCP-backed evidence.',
      heartbeat_at: now,
      last_completed_cycle_at: now,
      mcp_configured: true,
      mcp_reachable: true,
      last_qa_gate_source: 'external_mcp',
      using_mcp_for_qa_decisions: true,
      freshness: 'fresh',
    },
    qaLiveCycle: {
      current_run_id: 'qa_live_cycle_1',
      current_status: 'live',
      latest_completed_cycle_id: 'qa_live_cycle_1',
      latest_completed_cycle_at: now,
      latest_completed_status: 'live',
      ran_once: true,
      mcp_status: 'live',
      mcp_reachable: true,
      current_gate_source: 'external_mcp',
      external_status: 'pass',
      output_feed_loaded: true,
      output_feed_count: 1,
      output_feed_captured: true,
      latest_feed_entry_id: 'qa_output_20260409T103000000Z',
      latest_feed_result: 'pass',
      summary: 'qa_live_cycle_1 live | MCP live | gate external_mcp | external pass | feed captured',
    },
    outputFeedLoaded: true,
    outputFeed: [
      {
        id: 'qa_output_20260409T103000000Z',
        createdAt: now,
        type: 'qa_cycle',
        summary: 'QA cycle completed',
        result: 'pass',
        source: 'qa_lead_runner',
        meta: {
          cycleId: 'qa_live_cycle_1',
          failedChecks: 0,
          activeLanes: 1,
          externalStatus: 'pass',
        },
      },
    ],
    externalValidation: {
      status: 'pass',
      lastCheckedAt: now,
      source: 'external_mcp',
      notes: ['External validation passed.'],
    },
    openInvestigations: [],
    researchState: { summary: {} },
    structuredSummary: {},
  });

  const operatorSection = sections.find((section) => section.id === 'qa-operator');
  const outputFeedSection = sections.find((section) => section.id === 'qa-output-feed');
  const mcpSection = sections.find((section) => section.id === 'qa-mcp-live');

  assert.ok(operatorSection);
  assert.ok(outputFeedSection);
  assert.ok(mcpSection);
  assert.match(operatorSection.summary, /qa_live_cycle_1 live \| MCP live \| gate external_mcp \| external pass \| feed captured/i);
  assert.equal(outputFeedSection.feed.length, 1);
  assert.match(outputFeedSection.summary, /captured in the QA output feed/i);
  assert.equal(mcpSection.liveCycle.latest_completed_cycle_id, 'qa_live_cycle_1');
  assert.equal(mcpSection.liveCycle.output_feed_captured, true);
}
