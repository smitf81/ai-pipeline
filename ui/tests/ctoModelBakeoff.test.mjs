import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default async function runCtoModelBakeoffTests() {
  const serverPath = path.resolve(process.cwd(), 'server.js');
  const {
    runCtoGovernanceModelBakeOff,
  } = require(serverPath);

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options = {}) => {
      if (String(url).includes('/api/tags')) {
        return {
          ok: true,
          json: async () => ({
            models: [
              { name: 'model-good' },
              { name: 'model-fenced' },
              { name: 'model-bad' },
            ],
          }),
        };
      }
      if (String(url).includes('/api/generate')) {
        const body = JSON.parse(options.body || '{}');
        if (body.model === 'model-good') {
          return {
            ok: true,
            json: async () => ({
              response: JSON.stringify({
                reply_text: 'Planner desk should own this first.',
                response_kind: 'actionable',
                delegation: {
                  desk_id: 'planner',
                  desk_label: 'Planner',
                  why: 'Planner owns decomposition.',
                },
                action: { id: 'hire-planner' },
              }),
            }),
          };
        }
        if (body.model === 'model-fenced') {
          return {
            ok: true,
            json: async () => ({
              response: "```json\n{\n  \"reply_text\": \"Planner desk should own this first.\",\n  \"response_kind\": \"actionable\",\n  \"delegation\": {\n    \"desk_id\": \"planner\",\n    \"desk_label\": \"Planner\",\n    \"why\": \"Planner owns decomposition.\"\n  },\n  \"action\": { \"id\": \"hire-planner\" }\n}\n```",
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            response: 'I think the planner should handle this.',
          }),
        };
      }
      throw new Error(`unexpected request: ${url}`);
    };

    const result = await runCtoGovernanceModelBakeOff({
      models: ['model-good', 'model-fenced', 'model-bad'],
      text: 'We need a planner for this. Can you handle it?',
    });

    assert.equal(result.summary.recommendedModel, 'model-good');
    assert.equal(result.results.length, 3);
    assert.equal(result.results.find((entry) => entry.model === 'model-good').contractValidation.ok, true);
    assert.equal(result.results.find((entry) => entry.model === 'model-good').rawJsonParse.ok, true);
    assert.equal(result.results.find((entry) => entry.model === 'model-fenced').fencedJsonParse.ok, true);
    assert.equal(result.results.find((entry) => entry.model === 'model-bad').contractValidation.ok, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
}
