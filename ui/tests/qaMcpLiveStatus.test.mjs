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
      probeStatus: 'http_error',
      lastCheckedAt: '2026-04-06T11:57:00.000Z',
      probeFailureKind: 'http_error',
      probeFailureDetail: 'Field "status" must be "pass" or "fail".',
      probeStatusCode: 404,
      probeTarget: 'http://127.0.0.1:5051/run_test',
    },
  }, { now });
  assert.equal(degradedState.status, 'degraded');
  assert.equal(degradedState.mcp_reachable, false);
  assert.equal(degradedState.last_ping_status, 'http_error');
  assert.equal(degradedState.last_ping_failure_kind, 'http_error');
  assert.equal(degradedState.last_ping_http_status, 404);
  assert.equal(degradedState.last_ping_target, 'http://127.0.0.1:5051/run_test');
  assert.match(degradedState.notes.join(' '), /http_error/i);
  assert.match(degradedState.summary, /degraded/i);

  const offlineState = buildQaMcpLiveStatus({
    externalValidation: {
      source: 'external_mcp',
      probeStatus: 'offline',
      lastCheckedAt: '2026-04-06T11:57:30.000Z',
      probeFailureKind: 'offline',
      probeFailureDetail: 'External QA probe server is offline or not listening on 127.0.0.1:5051.',
      probeTarget: 'http://127.0.0.1:5051/run_test',
    },
  }, { now });
  assert.equal(offlineState.status, 'offline');
  assert.equal(offlineState.current_failure_kind, 'offline');
  assert.equal(offlineState.current_failure_tool, 'external_probe_check');
  assert.match(offlineState.notes.join(' '), /offline/i);

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

  const recoveredState = buildQaMcpLiveStatus({
    externalValidation: {
      source: 'external_mcp',
      probeStatus: 'ok',
      status: 'pass',
      lastCheckedAt: '2026-04-06T11:59:55.000Z',
      probeFailureKind: null,
      probeFailureDetail: null,
      probeStatusCode: null,
    },
    openInvestigations: [
      {
        id: 'qa_inv_2',
        trigger: 'probe_failure',
        status: 'open',
      },
    ],
  }, { now });
  assert.equal(recoveredState.status, 'live');
  assert.equal(recoveredState.mcp_reachable, true);
  assert.equal(recoveredState.last_ping_failure_kind, null);
  assert.equal(recoveredState.last_ping_http_status, null);
  assert.equal(recoveredState.recovery_detected, false);
  assert.equal(recoveredState.recovered_from_kind, null);

  const researchRecoveryState = buildQaMcpLiveStatus({
    externalValidation: {
      source: 'external_mcp',
      probeStatus: 'ok',
      status: 'pass',
      lastCheckedAt: '2026-04-06T11:59:50.000Z',
    },
    researchState: {
      notes: [
        {
          id: 'qa_research_1',
          created_at: '2026-04-06T11:59:55.000Z',
          status: 'available',
          research_available: true,
          source: 'external_mcp',
          server_url: 'http://127.0.0.1:5052/research_note',
          summary: 'Research available again.',
        },
        {
          id: 'qa_research_0',
          created_at: '2026-04-06T11:58:00.000Z',
          status: 'offline',
          research_available: false,
          failure_kind: 'offline',
          error_message: 'QA research server is offline.',
          server_url: 'http://127.0.0.1:5052/research_note',
        },
      ],
    },
  }, { now });
  assert.equal(researchRecoveryState.status, 'live');
  assert.equal(researchRecoveryState.research_last_call_status, 'ok');
  assert.equal(researchRecoveryState.recovery_detected, true);
  assert.equal(researchRecoveryState.recovered_from_kind, 'offline');
}
