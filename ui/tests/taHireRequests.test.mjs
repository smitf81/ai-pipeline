import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default async function runTaHireRequestsTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-ta-hire-requests-'));
  const {
    readTaHireRequestQueue,
    summarizeTaHireRequestQueue,
    upsertTaHireRequestQueueEntry,
    markTaHireRequestFulfilled,
  } = require(path.resolve(process.cwd(), 'taHireRequests.js'));

  const upsertResult = upsertTaHireRequestQueueEntry(rootPath, {
    hireRequestId: 'hire_request_1',
    originDepartmentId: 'dept-delivery',
    originDeskId: 'planner',
    requestedRoleId: 'qa-lead',
    reason: 'QA lead coverage is missing.',
    urgency: 'high',
    blockingLevel: 'handoff_risk',
    linkedPlanIds: ['plan_1'],
    createdAt: '2026-03-23T07:05:00.000Z',
    status: 'queued',
  });

  assert.equal(fs.existsSync(upsertResult.jsonPath), true);
  assert.equal(fs.existsSync(upsertResult.markdownPath), true);

  const queue = readTaHireRequestQueue(rootPath);
  assert.equal(queue.entries.length, 1);
  assert.equal(queue.entries[0].hireRequestId, 'hire_request_1');
  assert.equal(queue.entries[0].status, 'queued');
  assert.equal(queue.entries[0].blockingLevel, 'handoff_risk');

  const summary = summarizeTaHireRequestQueue(queue);
  assert.equal(summary.entryCount, 1);
  assert.equal(summary.queuedCount, 1);
  assert.equal(summary.fulfilledCount, 0);

  const fulfilled = markTaHireRequestFulfilled(rootPath, {
    hireRequestId: 'hire_request_1',
    resolvedBy: 'ta',
    fulfilledCandidate: {
      id: 'candidate_1',
      name: 'Candidate One',
      deskId: 'qa-lead',
    },
    notes: ['TA matched a qualified candidate.'],
    resolution: {
      status: 'fulfilled',
      summary: 'TA fulfilled the request.',
    },
  });

  assert.ok(fulfilled);
  assert.equal(fulfilled.queue.entries[0].status, 'fulfilled');
  assert.equal(fulfilled.queue.entries[0].fulfilledCandidate.name, 'Candidate One');

  const resolvedQueue = readTaHireRequestQueue(rootPath);
  const resolvedSummary = summarizeTaHireRequestQueue(resolvedQueue);
  assert.equal(resolvedSummary.fulfilledCount, 1);
  assert.equal(resolvedSummary.queuedCount, 0);
}
