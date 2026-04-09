import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildResearchFailurePayload,
  fetchQaResearchNoteFromServer,
} = require('../qaResearch.js');

export default async function runQaResearchOperationalStatusTests() {
  const offline = await fetchQaResearchNoteFromServer({
    query: 'qa validation issue probe_failure',
    fetchImpl: async () => {
      const error = new Error('fetch failed');
      error.cause = { code: 'ECONNREFUSED' };
      throw error;
    },
  });

  assert.equal(offline.ok, false);
  assert.equal(offline.status, 'offline');
  assert.equal(offline.error.kind, 'offline');
  assert.match(offline.error.message || '', /offline|not listening/i);

  const badConfig = await fetchQaResearchNoteFromServer({
    query: 'qa validation issue probe_failure',
    serverUrl: '::bad-url::',
  });
  assert.equal(badConfig.ok, false);
  assert.equal(badConfig.status, 'bad_config');
  assert.equal(badConfig.error.kind, 'bad_config');

  const failurePayload = buildResearchFailurePayload({
    investigation: {
      id: 'qa_inv_operational',
      trigger: 'probe_failure',
      repeat_count: 4,
      status: 'open',
    },
    queryPayload: {
      query: 'qa validation issue probe_failure',
    },
    error: offline.error,
    status: offline.status,
    createdAt: '2026-04-09T12:00:00.000Z',
  });
  assert.equal(failurePayload.status, 'offline');
  assert.equal(failurePayload.failure_kind, 'offline');
  assert.match(failurePayload.server_url || '', /127\.0\.0\.1:5052\/research_note/);
}
