import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildExternalQaProbeCheckPayload,
  readOpenQaInvestigations,
} = require('../externalQaProbe.js');
const {
  buildQaLeadPosture,
} = require('../server.js');

function makeFetchResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

export default async function runExternalQaProbeTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-qa-evidence-stamp-'));
  try {
    const degradedPayload = await buildExternalQaProbeCheckPayload({
      rootPath,
      investigationRootPath: rootPath,
      qaState: {
        structuredReport: {
          status: 'pass',
          summary: 'Structured QA report passed.',
          finishedAt: '2026-04-06T00:00:00.000Z',
        },
      },
      fetchImpl: async () => ({
        ok: false,
        status: 503,
        json: async () => ({
          status: 'fail',
          details: 'External probe unreachable',
          source: 'external_mcp',
        }),
      }),
    });

    assert.equal(degradedPayload.ok, false);
    assert.equal(degradedPayload.pre_adjudication, true);
    assert.equal(degradedPayload.adjudication_state, 'pending_lead_cycle');
    assert.ok(degradedPayload.investigation_id);
    assert.equal(degradedPayload.evidence_id, degradedPayload.investigation_id);

    const investigations = readOpenQaInvestigations(rootPath, 10);
    assert.equal(investigations.length, 1);
    assert.equal(investigations[0].pre_adjudication, true);
    assert.equal(investigations[0].adjudication_state, 'pending_lead_cycle');
    assert.equal(investigations[0].evidence_id, degradedPayload.investigation_id);

    const posture = buildQaLeadPosture({
      qaLead: {
        status: 'degraded',
        summary: 'QA lead cycle degraded.',
        run_id: 'qa_lead_test_cycle',
        current_batch: 'qa_lead_test_cycle',
        finished_at: '2026-04-06T01:00:00.000Z',
        output_feed: [],
      },
      qaLeadLatestRun: {
        id: 'qa_lead_test_cycle',
        status: 'degraded',
        summary: 'QA lead cycle degraded.',
        finished_at: '2026-04-06T01:00:00.000Z',
      },
      externalValidation: {
        status: 'unavailable',
        probeStatus: 'unreachable',
        lastCheckedAt: '2026-04-06T01:00:00.000Z',
      },
      repairLoop: {
        summary: {
          activeLanes: 1,
        },
      },
      openInvestigations: investigations,
      browserRuns: [],
      generatedAt: '2026-04-06T01:00:00.000Z',
    });

    assert.equal(posture.provenance.promoted_from_pre_adjudication, true);
    assert.equal(posture.provenance.pre_adjudication_evidence_ids[0], degradedPayload.investigation_id);
    assert.equal(posture.inputs.some((input) => input.type === 'pre_adjudication_evidence'), true);
    const evidenceInput = posture.inputs.find((input) => input.type === 'pre_adjudication_evidence');
    assert.equal(evidenceInput.pre_adjudication, true);
    assert.equal(evidenceInput.adjudication_state, 'pending_lead_cycle');
    assert.equal(evidenceInput.evidence_id, degradedPayload.investigation_id);
  } finally {
    fs.rmSync(rootPath, { recursive: true, force: true });
  }

  const successPayload = await buildExternalQaProbeCheckPayload({
    qaState: {
      structuredReport: {
        status: 'pass',
        summary: 'Structured QA report passed.',
        finishedAt: '2026-04-06T00:00:00.000Z',
      },
    },
    fetchImpl: async () => makeFetchResponse({
      test_id: 'ollama_ping',
      status: 'pass',
      details: 'Ollama reachable',
      timestamp: '2026-04-06T00:00:01.000Z',
      source: 'external_mcp',
    }),
  });

  assert.equal(successPayload.ok, true);
  assert.deepEqual(successPayload.external_probe, {
    test_id: 'ollama_ping',
    status: 'pass',
    details: 'Ollama reachable',
    timestamp: '2026-04-06T00:00:01.000Z',
    source: 'external_mcp',
  });
  assert.equal(successPayload.internal_truth.status, 'pass');
  assert.equal(successPayload.internal_truth.source, 'data/spatial/qa/structured/latest.json');
  assert.equal(successPayload.comparison.status_match, true);
  assert.equal(successPayload.comparison.freshness_known, true);
  assert.deepEqual(successPayload.comparison.notes, []);
  assert.equal(successPayload.probe_target, 'http://127.0.0.1:5051/run_test');

  const timeoutPayload = await buildExternalQaProbeCheckPayload({
    qaState: {
      structuredReport: {
        status: 'pass',
        summary: 'Structured QA report passed.',
        finishedAt: '2026-04-06T00:00:00.000Z',
      },
    },
    timeoutMs: 5,
    fetchImpl: async (_url, options = {}) => new Promise((resolve, reject) => {
      const signal = options.signal;
      if (signal) {
        signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }));
        }, { once: true });
      }
    }),
  });

  assert.equal(timeoutPayload.ok, false);
  assert.equal(timeoutPayload.probe_status, 'timeout');
  assert.equal(timeoutPayload.error.kind, 'timeout');
  assert.equal(timeoutPayload.comparison.freshness_known, false);
  assert.ok(timeoutPayload.comparison.notes.some((note) => /External probe timestamp is missing/i.test(note)));

  const offlinePayload = await buildExternalQaProbeCheckPayload({
    qaState: {
      structuredReport: {
        status: 'pass',
        summary: 'Structured QA report passed.',
        finishedAt: '2026-04-06T00:00:00.000Z',
      },
    },
    fetchImpl: async () => {
      const error = new Error('fetch failed');
      error.cause = { code: 'ECONNREFUSED' };
      throw error;
    },
  });

  assert.equal(offlinePayload.ok, false);
  assert.equal(offlinePayload.probe_status, 'offline');
  assert.equal(offlinePayload.error.kind, 'offline');
  assert.equal(offlinePayload.probe_target, 'http://127.0.0.1:5051/run_test');
  assert.match(offlinePayload.error.message || '', /offline|not listening/i);

  const invalidContractPayload = await buildExternalQaProbeCheckPayload({
    qaState: {
      structuredReport: {
        status: 'pass',
        summary: 'Structured QA report passed.',
        finishedAt: '2026-04-06T00:00:00.000Z',
      },
    },
    fetchImpl: async () => makeFetchResponse({
      test_id: 'ollama_ping',
      details: 'Ollama reachable',
      timestamp: '2026-04-06T00:00:03.000Z',
      source: 'external_mcp',
    }),
  });

  assert.equal(invalidContractPayload.ok, false);
  assert.equal(invalidContractPayload.probe_status, 'invalid_contract');
  assert.equal(invalidContractPayload.error.kind, 'invalid_contract');
  assert.match(invalidContractPayload.error.detail || '', /status/i);

  const invalidJsonPayload = await buildExternalQaProbeCheckPayload({
    qaState: {
      structuredReport: {
        status: 'pass',
        summary: 'Structured QA report passed.',
        finishedAt: '2026-04-06T00:00:00.000Z',
      },
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('Unexpected token < in JSON');
      },
    }),
  });

  assert.equal(invalidJsonPayload.ok, false);
  assert.equal(invalidJsonPayload.probe_status, 'invalid_json');
  assert.equal(invalidJsonPayload.error.kind, 'invalid_json');
  assert.match(invalidJsonPayload.error.detail || '', /unexpected token/i);

  const mismatchPayload = await buildExternalQaProbeCheckPayload({
    qaState: {
      structuredReport: {
        status: 'pass',
        summary: 'Structured QA report passed.',
        finishedAt: '2026-04-06T00:00:00.000Z',
      },
    },
    fetchImpl: async () => makeFetchResponse({
      test_id: 'ollama_ping',
      status: 'fail',
      details: 'Ollama unreachable',
      timestamp: '2026-04-06T00:00:02.000Z',
      source: 'external_mcp',
    }),
  });

  assert.equal(mismatchPayload.ok, true);
  assert.equal(mismatchPayload.comparison.status_match, false);
  assert.equal(mismatchPayload.comparison.freshness_known, true);
  assert.ok(mismatchPayload.comparison.notes.some((note) => /Status mismatch/i.test(note)));
}
