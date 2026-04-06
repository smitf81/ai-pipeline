import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildExternalQaProbeCheckPayload,
} = require('../externalQaProbe.js');

function makeFetchResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

export default async function runExternalQaProbeTests() {
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
