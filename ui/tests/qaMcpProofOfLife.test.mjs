import assert from 'node:assert/strict';
import path from 'node:path';

import { smokeLoadSpatialApp } from './helpers/browser-module-loader.mjs';

function collectRenderText(node, bucket = []) {
  if (node == null) return bucket;
  if (typeof node === 'string' || typeof node === 'number') {
    bucket.push(String(node));
    return bucket;
  }
  if (Array.isArray(node)) {
    for (const entry of node) collectRenderText(entry, bucket);
    return bucket;
  }
  if (node && Array.isArray(node.args)) {
    for (const entry of node.args) collectRenderText(entry, bucket);
    return bucket;
  }
  if (node && typeof node === 'object') {
    for (const value of Object.values(node)) collectRenderText(value, bucket);
  }
  return bucket;
}

export default async function runQaMcpProofOfLifeTests() {
  const spatialAppPath = path.resolve(process.cwd(), 'public', 'spatial', 'spatialApp.js');
  const spatialApp = await smokeLoadSpatialApp(spatialAppPath, { locationHref: 'http://localhost/?mode=qa' });
  const helpers = {
    runStructuredQA: () => undefined,
    runBrowserPass: () => undefined,
    openQARun: () => undefined,
  };

  const liveSection = {
    id: 'qa-mcp-live',
    label: 'QA MCP Proof of Life',
    kind: 'qa-mcp-live',
    summary: 'QA is live and actively gating with MCP-backed evidence.',
    liveStatus: {
      status: 'live',
      usage_state: 'active_gating',
      freshness: 'fresh',
      heartbeat_at: '2026-04-06T12:00:00.000Z',
      last_completed_cycle_at: '2026-04-06T11:59:30.000Z',
      mcp_configured: true,
      configured_tools: ['external_probe_check', 'qa_research_note'],
      mcp_reachable: true,
      last_ping_at: '2026-04-06T11:59:30.000Z',
      last_ping_status: 'ok',
      last_call_at: '2026-04-06T11:59:30.000Z',
      last_call_tool: 'external_probe_check',
      last_call_status: 'ok',
      last_qa_gate_source: 'external_mcp',
      using_mcp_for_qa_decisions: true,
      notes: ['Active MCP gating: fresh MCP-backed evidence is influencing QA decisions.'],
    },
  };
  const normalizedLiveSection = spatialApp.normalizeDeskSectionPayload(liveSection);
  assert.equal(normalizedLiveSection.kind, 'qa-mcp-live');
  assert.equal(normalizedLiveSection.liveStatus.status, 'live');

  const liveRendered = spatialApp.renderDeskSection(liveSection, helpers);
  assert.ok(liveRendered);
  assert.equal(liveRendered.args[1]['data-qa'], 'qa-mcp-live');
  const liveText = collectRenderText(liveRendered).join(' ');
  assert.match(liveText, /QA MCP Proof of Life/);
  assert.match(liveText, /active MCP gating/i);
  assert.match(liveText, /external_probe_check/);
  assert.match(liveText, /external_mcp/);

  const idleRendered = spatialApp.renderDeskSection({
    id: 'qa-mcp-live-idle',
    label: 'QA MCP Proof of Life',
    kind: 'qa-mcp-live',
    summary: 'QA MCP is reachable but currently idle.',
    liveStatus: {
      status: 'reachable_but_idle',
      usage_state: 'configured_but_unused',
      freshness: 'fresh',
      mcp_configured: true,
      mcp_reachable: true,
      configured_tools: ['external_probe_check'],
      last_ping_status: 'ok',
      last_ping_at: '2026-04-06T11:58:00.000Z',
      last_qa_gate_source: 'structured_qa',
      notes: ['Configured but unused: no completed MCP ping or research call is recorded yet.'],
    },
  }, helpers);
  const idleText = collectRenderText(idleRendered).join(' ');
  assert.match(idleText, /configured but unused/i);
  assert.match(idleText, /reachable/i);

  const staleRendered = spatialApp.renderDeskSection({
    id: 'qa-mcp-live-stale',
    label: 'QA MCP Proof of Life',
    kind: 'qa-mcp-live',
    summary: 'QA MCP was reachable, but the proof-of-life signal is stale.',
    liveStatus: {
      status: 'stale',
      usage_state: 'stale',
      freshness: 'stale',
      mcp_configured: true,
      mcp_reachable: true,
      last_ping_status: 'ok',
      last_ping_at: '2026-04-06T08:00:00.000Z',
      notes: ['Reachable but stale: the most recent MCP proof-of-life signal is outside the freshness window.'],
    },
  }, helpers);
  assert.match(collectRenderText(staleRendered).join(' '), /stale/i);

  const degradedRendered = spatialApp.renderDeskSection({
    id: 'qa-mcp-live-degraded',
    label: 'QA MCP Proof of Life',
    kind: 'qa-mcp-live',
    summary: 'QA MCP is configured, but recent MCP health or calls are degraded.',
    liveStatus: {
      status: 'degraded',
      usage_state: 'degraded',
      freshness: 'fresh',
      mcp_configured: true,
      mcp_reachable: false,
      last_ping_status: 'timeout',
      last_ping_at: '2026-04-06T11:57:00.000Z',
      notes: ['Degraded: the latest MCP ping or call failed, timed out, or returned unavailable.'],
    },
  }, helpers);
  assert.match(collectRenderText(degradedRendered).join(' '), /degraded/i);
  assert.match(collectRenderText(degradedRendered).join(' '), /timeout/i);

  const emptyRendered = spatialApp.renderDeskSection({
    id: 'qa-mcp-live-empty',
    label: 'QA MCP Proof of Life',
    kind: 'qa-mcp-live',
    liveStatus: null,
  }, helpers);
  const emptyText = collectRenderText(emptyRendered).join(' ');
  assert.match(emptyText, /proof-of-life has not been recorded yet/i);
}
