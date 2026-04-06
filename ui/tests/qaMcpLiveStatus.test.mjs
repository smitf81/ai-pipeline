import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildQaMcpLiveStatus,
} = require('../qaMcpLiveStatus.js');

export default async function runQaMcpLiveStatusTests() {
  const now = '2026-04-06T12:00:00.000Z';

  const emptyState = buildQaMcpLiveStatus({}, { now });
  assert.equal(emptyState.status, 'offline');
  assert.equal(emptyState.usage_state, 'configured_but_unused');
  assert.equal(emptyState.mcp_configured, true);
  assert.equal(emptyState.mcp_reachable, false);
  assert.match(emptyState.summary, /configured but has not been exercised yet|offline/i);

  const reachableButIdle = buildQaMcpLiveStatus({
    externalValidation: {
      source: 'external_mcp',
      probeStatus: 'ok',
      lastCheckedAt: '2026-04-06T11:58:00.000Z',
    },
    structuredSummary: {
      finishedAt: '2026-04-06T11:59:00.000Z',
    },
  }, { now });
  assert.equal(reachableButIdle.status, 'reachable_but_idle');
  assert.equal(reachableButIdle.usage_state, 'idle');
  assert.equal(reachableButIdle.mcp_reachable, true);
  assert.equal(reachableButIdle.using_mcp_for_qa_decisions, false);
  assert.equal(reachableButIdle.last_qa_gate_source, 'structured_qa');

  const staleState = buildQaMcpLiveStatus({
    externalValidation: {
      source: 'external_mcp',
      probeStatus: 'ok',
      lastCheckedAt: '2026-04-06T09:00:00.000Z',
    },
  }, { now });
  assert.equal(staleState.status, 'stale');
  assert.equal(staleState.freshness, 'stale');

  const degradedState = buildQaMcpLiveStatus({
    externalValidation: {
      source: 'external_mcp',
      probeStatus: 'timeout',
      lastCheckedAt: '2026-04-06T11:57:00.000Z',
    },
  }, { now });
  assert.equal(degradedState.status, 'degraded');
  assert.equal(degradedState.mcp_reachable, false);
  assert.match(degradedState.summary, /degraded/i);

  const liveState = buildQaMcpLiveStatus({
    externalValidation: {
      source: 'external_mcp',
      probeStatus: 'ok',
      lastCheckedAt: '2026-04-06T11:59:30.000Z',
    },
    openInvestigations: [
      {
        id: 'qa_inv_1',
        trigger: 'external_mismatch',
        status: 'open',
      },
    ],
  }, { now });
  assert.equal(liveState.status, 'live');
  assert.equal(liveState.usage_state, 'active_gating');
  assert.equal(liveState.using_mcp_for_qa_decisions, true);
  assert.equal(liveState.last_qa_gate_source, 'external_mcp');
  assert.match(liveState.summary, /actively gating/i);
}
