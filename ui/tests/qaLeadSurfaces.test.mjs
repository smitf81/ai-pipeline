import assert from 'node:assert/strict';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

export default async function runQaLeadSurfacesTests() {
  const studioDataPath = path.resolve(process.cwd(), 'public', 'spatial', 'studioData.js');
  const { buildAgentContext } = await loadModuleCopy(studioDataPath, { label: 'studioData' });

  const now = '2026-04-06T12:00:00.000Z';
  const qaState = {
    qaLead: {
      source: 'qa_lead_runner',
      agent_id: 'qa-lead',
      id: 'qa_lead_test_cycle',
      run_type: 'scheduled_cycle',
      status: 'live',
      current_task: 'QA lead is running live scans.',
      current_batch: 'qa_lead_test_cycle',
      started_at: now,
      finished_at: now,
      last_completed_cycle_at: now,
      active_tools: ['external_probe_check', 'browser_qa_run', 'lane_canary_suite'],
      output_feed: [],
      live_status: {
        source: 'qa_mcp_live_status',
        status: 'live',
        summary: 'QA is live and actively gating with MCP-backed evidence.',
        mcp_configured: true,
        mcp_reachable: true,
        using_mcp_for_qa_decisions: true,
        last_qa_gate_source: 'external_mcp',
      },
      summary: 'QA lead cycle live.',
      result_paths: {
        browserRun: 'data/spatial/qa/qa_lead_test_cycle.json',
      },
    },
    qaLeadLatestRun: {
      source: 'qa_lead_runner',
      agent_id: 'qa-lead',
      id: 'qa_lead_test_cycle',
      status: 'live',
      current_task: 'QA lead is running live scans.',
      current_batch: 'qa_lead_test_cycle',
      active_tools: ['external_probe_check', 'browser_qa_run', 'lane_canary_suite'],
      output_feed: [],
      live_status: {
        source: 'qa_mcp_live_status',
        status: 'live',
        summary: 'QA is live and actively gating with MCP-backed evidence.',
        mcp_configured: true,
        mcp_reachable: true,
        using_mcp_for_qa_decisions: true,
        last_qa_gate_source: 'external_mcp',
      },
      summary: 'QA lead cycle live.',
      started_at: now,
      finished_at: now,
      last_completed_cycle_at: now,
      result_paths: {
        browserRun: 'data/spatial/qa/qa_lead_test_cycle.json',
      },
    },
    qaLeadRuns: [],
    qaMcpLiveStatus: {
      source: 'qa_mcp_live_status',
      status: 'live',
      summary: 'QA is live and actively gating with MCP-backed evidence.',
      heartbeat_at: now,
      last_completed_cycle_at: now,
      mcp_configured: true,
      configured_tools: ['external_probe_check', 'qa_research_note'],
      mcp_reachable: true,
      last_ping_at: now,
      last_ping_status: 'ok',
      last_call_at: now,
      last_call_tool: 'external_probe_check',
      last_call_status: 'ok',
      last_qa_gate_source: 'external_mcp',
      using_mcp_for_qa_decisions: true,
      freshness: 'fresh',
      notes: ['Active MCP gating: fresh MCP-backed evidence is influencing QA decisions.'],
    },
    qaLiveCycle: {
      source: 'qa_live_cycle',
      current_run_id: 'qa_lead_test_cycle',
      current_status: 'live',
      latest_completed_cycle_id: 'qa_lead_test_cycle',
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
      latest_feed_entry_id: 'qa_output_20260406T120000000Z',
      latest_feed_result: 'pass',
      summary: 'qa_lead_test_cycle live | MCP live | gate external_mcp | external pass | feed captured',
    },
    outputFeedLoaded: true,
    outputFeed: [
      {
        id: 'qa_output_20260406T120000000Z',
        createdAt: now,
        type: 'qa_cycle',
        summary: 'QA cycle completed',
        result: 'pass',
        source: 'qa_lead_runner',
        meta: {
          cycleId: 'qa_lead_test_cycle',
          investigationCount: 0,
          failedChecks: 0,
          activeLanes: 1,
          externalStatus: 'pass',
        },
      },
    ],
  };

  const executorContext = buildAgentContext({
    id: 'executor',
    name: 'Executor',
    role: 'executor',
    status: 'idle',
  }, {
    workspace: {},
  }, {
    qaState,
  });

  assert.equal(executorContext.qa.liveStatus.status, 'live');
  assert.equal(executorContext.qa.feed.length, 1);
  assert.equal(executorContext.qa.summary, qaState.qaLiveCycle.summary);
  assert.equal(executorContext.qa.lead.id, 'qa_lead_test_cycle');
  assert.equal(executorContext.qa.liveCycle.output_feed_captured, true);
}
