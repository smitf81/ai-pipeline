import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildExternalValidationSnapshot,
  buildExternalQaProbeCheckPayload,
  readQaInvestigations,
} = require('../externalQaProbe.js');
const {
  buildQAStatePayload,
  buildDeskPropertiesPayload,
  createDefaultStudioLayoutSchema,
} = require('../server.js');

const QA_CANARY_STUB = {
  overall_status: 'pass',
  summary: 'QA canaries not needed for this validation test.',
  results: [],
  failing_canary_ids: [],
  last_run_at: '2026-04-06T00:00:00.000Z',
};

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'qa-investigation-'));
}

export default async function runExternalValidationTests() {
  const successSnapshot = buildExternalValidationSnapshot({
    probeCheck: {
      ok: true,
      external_probe: {
        test_id: 'ollama_ping',
        status: 'pass',
        details: 'Ollama reachable',
        timestamp: '2026-04-06T00:00:01.000Z',
        source: 'external_mcp',
      },
      internal_truth: {
        status: 'pass',
        source: 'data/spatial/qa/structured/latest.json',
        timestamp: '2026-04-06T00:00:00.000Z',
        details: 'Structured QA report passed.',
      },
      comparison: {
        status_match: true,
        freshness_known: true,
        notes: [],
      },
    },
    checkedAt: '2026-04-06T00:00:10.000Z',
  });
  assert.equal(successSnapshot.status, 'pass');
  assert.equal(successSnapshot.probeStatus, 'ok');
  assert.equal(successSnapshot.lastCheckedAt, '2026-04-06T00:00:10.000Z');
  assert.equal(successSnapshot.statusMatch, true);
  assert.equal(successSnapshot.freshnessKnown, true);
  assert.deepEqual(successSnapshot.notes, []);
  assert.equal(successSnapshot.source, 'external_mcp');
  assert.equal(successSnapshot.errorMessage, null);

  const timeoutSnapshot = buildExternalValidationSnapshot({
    probeCheck: {
      ok: false,
      probe_status: 'timeout',
      error: {
        kind: 'timeout',
        message: 'External QA probe timed out after 1500ms.',
      },
      comparison: {
        status_match: false,
        freshness_known: false,
        notes: ['External probe timestamp is missing.'],
      },
    },
    checkedAt: '2026-04-06T00:01:10.000Z',
  });
  assert.equal(timeoutSnapshot.status, 'unavailable');
  assert.equal(timeoutSnapshot.probeStatus, 'timeout');
  assert.equal(timeoutSnapshot.errorMessage, 'External QA probe timed out after 1500ms.');
  assert.equal(timeoutSnapshot.lastCheckedAt, '2026-04-06T00:01:10.000Z');
  assert.equal(timeoutSnapshot.statusMatch, false);

  const successRoot = makeTempRoot();
  try {
    const successPayload = await buildExternalQaProbeCheckPayload({
      rootPath: successRoot,
      qaState: {
        structuredReport: {
          status: 'pass',
          finishedAt: '2026-04-06T00:00:00.000Z',
          summary: 'Structured QA report passed.',
        },
      },
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          test_id: 'ollama_ping',
          status: 'pass',
          details: 'Ollama reachable',
          timestamp: '2026-04-06T00:00:01.000Z',
          source: 'external_mcp',
        }),
      }),
    });
    assert.equal(successPayload.investigation_created, false);
    assert.equal(successPayload.investigation_id, null);
    assert.equal(readQaInvestigations(successRoot).length, 0);
  } finally {
    fs.rmSync(successRoot, { recursive: true, force: true });
  }

  const mismatchRoot = makeTempRoot();
  try {
    const mismatchPayload = await buildExternalQaProbeCheckPayload({
      rootPath: mismatchRoot,
      qaState: {
        structuredReport: {
          status: 'pass',
          finishedAt: '2026-04-06T00:00:00.000Z',
          summary: 'Structured QA report passed.',
        },
      },
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          test_id: 'ollama_ping',
          status: 'fail',
          details: 'Ollama unreachable',
          timestamp: '2026-04-06T00:02:01.000Z',
          source: 'external_mcp',
        }),
      }),
      investigationCreatedAt: '2026-04-06T00:02:10.000Z',
    });
    assert.equal(mismatchPayload.investigation_created, true);
    assert.equal(mismatchPayload.investigation_id, 'qa_inv_001');
    const investigations = readQaInvestigations(mismatchRoot);
    assert.equal(investigations.length, 1);
    assert.equal(investigations[0].trigger, 'external_mismatch');
    assert.equal(investigations[0].status, 'open');
    assert.equal(investigations[0].evidence.external.status, 'fail');
    assert.equal(investigations[0].evidence.internal.status, 'pass');
  } finally {
    fs.rmSync(mismatchRoot, { recursive: true, force: true });
  }

  const failureRoot = makeTempRoot();
  try {
    const failurePayload = await buildExternalQaProbeCheckPayload({
      rootPath: failureRoot,
      qaState: {
        structuredReport: {
          status: 'pass',
          finishedAt: '2026-04-06T00:00:00.000Z',
          summary: 'Structured QA report passed.',
        },
      },
      fetchImpl: async () => {
        throw new Error('probe unavailable');
      },
      investigationCreatedAt: '2026-04-06T00:03:10.000Z',
    });
    assert.equal(failurePayload.ok, false);
    assert.equal(failurePayload.investigation_created, true);
    assert.equal(failurePayload.investigation_id, 'qa_inv_001');
    const investigations = readQaInvestigations(failureRoot);
    assert.equal(investigations.length, 1);
    assert.equal(investigations[0].trigger, 'probe_failure');
    assert.equal(investigations[0].evidence.comparison.freshness_known, false);
  } finally {
    fs.rmSync(failureRoot, { recursive: true, force: true });
  }

  const repeatRoot = makeTempRoot();
  try {
    const firstRepeat = await buildExternalQaProbeCheckPayload({
      rootPath: repeatRoot,
      qaState: {
        structuredReport: {
          status: 'pass',
          finishedAt: '2026-04-06T00:00:00.000Z',
          summary: 'Structured QA report passed.',
        },
      },
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          test_id: 'ollama_ping',
          status: 'fail',
          details: 'Ollama unreachable',
          timestamp: '2026-04-06T00:06:01.000Z',
          source: 'external_mcp',
        }),
      }),
      investigationCreatedAt: '2026-04-06T00:06:10.000Z',
    });
    assert.equal(firstRepeat.investigation_created, true);
    const secondRepeat = await buildExternalQaProbeCheckPayload({
      rootPath: repeatRoot,
      qaState: {
        structuredReport: {
          status: 'pass',
          finishedAt: '2026-04-06T00:00:00.000Z',
          summary: 'Structured QA report passed.',
        },
      },
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          test_id: 'ollama_ping',
          status: 'fail',
          details: 'Ollama unreachable',
          timestamp: '2026-04-06T00:06:21.000Z',
          source: 'external_mcp',
        }),
      }),
      investigationCreatedAt: '2026-04-06T00:06:30.000Z',
    });
    assert.equal(secondRepeat.investigation_created, false);
    const repeatInvestigations = readQaInvestigations(repeatRoot);
    assert.equal(repeatInvestigations.length, 1);
    assert.equal(repeatInvestigations[0].repeat_count, 2);
    assert.equal(repeatInvestigations[0].latest_evidence.internal_status, 'pass');
    assert.equal(repeatInvestigations[0].latest_evidence.external_status, 'fail');
    assert.equal(repeatInvestigations[0].evidence_events.length, 2);
  } finally {
    fs.rmSync(repeatRoot, { recursive: true, force: true });
  }

  const inboxRoot = makeTempRoot();
  try {
    await buildExternalQaProbeCheckPayload({
      rootPath: inboxRoot,
      qaState: {
        structuredReport: {
          status: 'pass',
          finishedAt: '2026-04-06T00:00:00.000Z',
          summary: 'Structured QA report passed.',
        },
      },
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          test_id: 'ollama_ping',
          status: 'fail',
          details: 'Ollama unreachable',
          timestamp: '2026-04-06T00:04:01.000Z',
          source: 'external_mcp',
        }),
      }),
      investigationCreatedAt: '2026-04-06T00:04:10.000Z',
    });
    await buildExternalQaProbeCheckPayload({
      rootPath: inboxRoot,
      qaState: {
        structuredReport: {
          status: 'pass',
          finishedAt: '2026-04-06T00:00:00.000Z',
          summary: 'Structured QA report passed.',
        },
      },
      fetchImpl: async () => {
        throw new Error('probe unavailable');
      },
      investigationCreatedAt: '2026-04-06T00:05:10.000Z',
    });

    const qaState = buildQAStatePayload(inboxRoot, {
      qaCanaries: QA_CANARY_STUB,
    });
    assert.equal(qaState.openInvestigations.length, 2);
    assert.equal(qaState.openInvestigations[0].trigger, 'probe_failure');
    assert.equal(qaState.openInvestigations[1].trigger, 'external_mismatch');

    const deskPayload = buildDeskPropertiesPayload({
      studio: {
        layout: createDefaultStudioLayoutSchema(),
      },
    }, 'qa-lead', qaState);
    assert.equal(deskPayload.qa.openInvestigations.length, 2);
    assert.equal(deskPayload.qa.openInvestigations[0].trigger, 'probe_failure');
    assert.equal(readQaInvestigations(inboxRoot).length, 2);
  } finally {
    fs.rmSync(inboxRoot, { recursive: true, force: true });
  }

  const { AceConnector } = await import('../public/spatial/aceConnector.js');
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      const target = String(url);
      if (target.endsWith('/api/qa/external-probe-check')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            external_probe: {
              test_id: 'ollama_ping',
              status: 'pass',
              details: 'Ollama reachable',
              timestamp: '2026-04-06T00:00:01.000Z',
              source: 'external_mcp',
            },
            internal_truth: {
              status: 'pass',
              source: 'data/spatial/qa/structured/latest.json',
              timestamp: '2026-04-06T00:00:00.000Z',
              details: 'Structured QA report passed.',
            },
            comparison: {
              status_match: true,
              freshness_known: true,
              notes: [],
            },
            externalValidation: successSnapshot,
          }),
        };
      }
      if (target.includes('/api/spatial/desks/qa-lead/properties')) {
        return {
          ok: true,
          json: async () => ({
            deskId: 'qa-lead',
            qa: {
              structuredSummary: {
                status: 'pass',
                summary: 'Structured QA report passed.',
                deskCount: 1,
                testCount: 1,
              },
              auditTrail: {
                summary: {
                  total: 1,
                  ok: 1,
                  stale: 0,
                  missing: 0,
                  mismatch: 0,
                },
                entries: [],
              },
              externalValidation: null,
            },
          }),
        };
      }
      throw new Error(`unexpected request: ${target}`);
    };

    const connector = new AceConnector();
    const mergedPayload = await connector.getDeskProperties('qa-lead');
    assert.equal(mergedPayload.qa.externalValidation.status, 'pass');
    assert.equal(mergedPayload.qa.externalValidation.probeStatus, 'ok');
    assert.equal(mergedPayload.qa.externalValidation.statusMatch, true);

    globalThis.fetch = async (url) => {
      const target = String(url);
      if (target.endsWith('/api/qa/external-probe-check')) {
        return {
          ok: false,
          status: 503,
          json: async () => ({
            ok: false,
            external_probe: null,
            internal_truth: {
              status: 'pass',
              source: 'data/spatial/qa/structured/latest.json',
              timestamp: '2026-04-06T00:00:00.000Z',
              details: 'Structured QA report passed.',
            },
            comparison: {
              status_match: false,
              freshness_known: false,
              notes: ['External QA probe timestamp is missing.'],
            },
            error: {
              kind: 'timeout',
              message: 'External QA probe timed out after 1500ms.',
            },
            externalValidation: timeoutSnapshot,
          }),
        };
      }
      if (target.includes('/api/spatial/desks/qa-lead/properties')) {
        return {
          ok: true,
          json: async () => ({
            deskId: 'qa-lead',
            qa: {
              structuredSummary: {
                status: 'pass',
                summary: 'Structured QA report passed.',
                deskCount: 1,
                testCount: 1,
              },
              externalValidation: null,
            },
          }),
        };
      }
      throw new Error(`unexpected request: ${target}`);
    };

    const failingPayload = await connector.getDeskProperties('qa-lead');
    assert.equal(failingPayload.qa.externalValidation.status, 'unavailable');
    assert.equal(failingPayload.qa.externalValidation.probeStatus, 'timeout');

    globalThis.fetch = async (url) => {
      const target = String(url);
      if (target.endsWith('/api/qa/external-probe-check')) {
        throw new Error('probe route unavailable');
      }
      if (target.includes('/api/spatial/desks/qa-lead/properties')) {
        return {
          ok: true,
          json: async () => ({
            deskId: 'qa-lead',
            qa: {
              structuredSummary: {
                status: 'pass',
                summary: 'Structured QA report passed.',
                deskCount: 1,
                testCount: 1,
              },
            },
          }),
        };
      }
      throw new Error(`unexpected request: ${target}`);
    };

    const unavailablePayload = await connector.getDeskProperties('qa-lead');
    assert.ok(unavailablePayload.qa);
    assert.equal(unavailablePayload.qa.externalValidation, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
}
