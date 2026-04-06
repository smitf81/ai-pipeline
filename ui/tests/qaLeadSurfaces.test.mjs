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
      output_feed: [
        {
          id: 'proof-of-life',
          label: 'MCP proof of life',
          tool: 'external_probe_check',
          status: 'validated',
          verdict: 'pass',
          summary: 'External QA probe returned a fresh result.',
          observed_at: now,
        },
      ],
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
      output_feed: [
        {
          id: 'proof-of-life',
          label: 'MCP proof of life',
          tool: 'external_probe_check',
          status: 'validated',
          verdict: 'pass',
          summary: 'External QA probe returned a fresh result.',
          observed_at: now,
        },
      ],
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
  assert.match(executorContext.qa.summary, /downstream review/i);
  assert.equal(executorContext.qa.lead.id, 'qa_lead_test_cycle');
}
