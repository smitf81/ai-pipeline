import assert from 'node:assert/strict';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

const aceConnectorPath = path.resolve(process.cwd(), 'public', 'spatial', 'aceConnector.js');

export default async function runAceConnectorTests() {
  const { AceConnector } = await loadModuleCopy(aceConnectorPath, { label: 'aceConnector' });
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    requests.push({
      url,
      options,
    });
    return {
      ok: true,
      json: async () => ({
        ok: true,
        report: {
          summary: 'Executor assessment complete.',
          decision: 'ready-apply',
        },
      }),
    };
  };

  try {
    const ace = new AceConnector();
    const payload = await ace.runAgentWorker('executor', {
      cardId: '0007',
      mode: 'manual',
    });
    assert.equal(payload.ok, true);
    assert.equal(payload.report.decision, 'ready-apply');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, '/api/spatial/agents/executor/run');
    assert.equal(requests[0].options.method, 'POST');
    assert.deepEqual(JSON.parse(requests[0].options.body), {
      cardId: '0007',
      mode: 'manual',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
}
