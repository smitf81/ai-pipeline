import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const {
  attachPlannerQaFindingsToRun,
  readPlannerQaQueue,
  upsertPlannerQaQueueEntry,
} = await import('../plannerQaQueue.js');

test('planner QA queue records pending requests and attaches findings back to planner runs', () => {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-planner-qa-'));
  const plannerRunDir = path.join(rootPath, 'data', 'spatial', 'agent-runs', 'planner');
  fs.mkdirSync(plannerRunDir, { recursive: true });

  const plannerRun = {
    id: 'planner_run_1',
    intentId: 'intent_1',
    summary: 'Planner output',
    planBundle: {
      planId: 'plan_bundle_1',
      intentId: 'intent_1',
      qaStatus: 'pending',
      qaCoverageRequired: true,
      qaBlocker: false,
      releaseBlocker: false,
      items: [
        {
          planId: 'plan_1',
          intentId: 'intent_1',
          summary: 'Create planner runtime',
        },
      ],
    },
    taskBundle: {
      taskBundleId: 'task_bundle_1',
      intentId: 'intent_1',
      qaStatus: 'pending',
      qaCoverageRequired: true,
      qaBlocker: false,
      releaseBlocker: false,
      tasks: [
        {
          taskId: 'task_1',
          planId: 'plan_1',
          intentId: 'intent_1',
          summary: 'Create planner runtime',
        },
      ],
    },
  };
  fs.writeFileSync(path.join(plannerRunDir, 'planner_run_1.json'), `${JSON.stringify(plannerRun, null, 2)}\n`, 'utf8');

  const queueResult = upsertPlannerQaQueueEntry(rootPath, {
    queueKey: 'qa_request_1',
    plannerRunId: plannerRun.id,
    planBundleId: plannerRun.planBundle.planId,
    qaRequestId: 'qa_request_1',
    intentId: plannerRun.intentId,
    planIds: ['plan_1'],
    taskIds: ['task_1'],
    summary: 'Planner QA request',
    qaStatus: 'pending',
    qaCoverageRequired: true,
    qaBlocker: false,
    releaseBlocker: false,
    provenance: { sourceHandoffId: 'handoff_1' },
  });

  assert.equal(queueResult.queue.entries.length, 1);
  assert.equal(queueResult.queue.entries[0].qaStatus, 'pending');
  assert.equal(readPlannerQaQueue(rootPath).entries[0].qaRequestId, 'qa_request_1');

  const attachedRun = attachPlannerQaFindingsToRun(rootPath, {
    plannerRunId: plannerRun.id,
    planId: 'plan_1',
    qaRunId: 'qa_run_1',
    qaRequestId: 'qa_request_1',
    findings: [
      { id: 'finding_1', severity: 'warning', summary: 'Planner output is readable.' },
    ],
    reviewedBy: 'qa',
    summary: 'QA review attached without blockers.',
  });

  assert.ok(attachedRun);
  assert.equal(attachedRun.qaStatus, 'reviewed');
  assert.equal(attachedRun.qaCoverageRequired, true);
  assert.equal(attachedRun.qaBlocker, false);
  assert.equal(attachedRun.planBundle.qaReview.qaRunId, 'qa_run_1');
  assert.equal(attachedRun.planBundle.items[0].qaStatus, 'reviewed');
  assert.equal(attachedRun.planBundle.items[0].qaReview.qaRequestId, 'qa_request_1');

  const persistedRun = JSON.parse(fs.readFileSync(path.join(plannerRunDir, 'planner_run_1.json'), 'utf8'));
  assert.equal(persistedRun.qaStatus, 'reviewed');
  assert.equal(persistedRun.planBundle.qaReview.qaRunId, 'qa_run_1');
  assert.equal(persistedRun.planBundle.items[0].qaStatus, 'reviewed');

  const updatedQueue = readPlannerQaQueue(rootPath);
  assert.equal(updatedQueue.entries[0].qaStatus, 'reviewed');
  assert.equal(updatedQueue.entries[0].qaRunId, 'qa_run_1');
  assert.equal(updatedQueue.entries[0].findings[0].summary, 'Planner output is readable.');
});
