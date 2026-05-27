import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default async function runPlannerOuttrayTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-planner-outtray-'));
  const {
    collectPlannerOuttrayItem,
    readPlannerOuttray,
    summarizePlannerOuttray,
    upsertPlannerOuttrayEntry,
  } = require(path.resolve(process.cwd(), 'plannerOuttray.js'));

  const writeResult = upsertPlannerOuttrayEntry(rootPath, {
    queueKey: 'outtray_1',
    plannerRunId: 'planner_run_1',
    planBundleId: 'plan_bundle_1',
    taskBundleId: 'task_bundle_1',
    intentId: 'intent_1',
    status: 'deposited',
    summary: 'Planner finished and deposited the handoff.',
    provenance: {
      sourceHandoffId: 'handoff_1',
      sourceIntentId: 'intent_1',
      sourceType: 'cto-chat',
      sourceRef: 'chat-1',
    },
  });

  assert.equal(fs.existsSync(writeResult.jsonPath), true);
  assert.equal(fs.existsSync(writeResult.markdownPath), true);

  const queue = readPlannerOuttray(rootPath);
  assert.equal(queue.entries.length, 1);
  assert.equal(queue.entries[0].status, 'deposited');
  assert.equal(queue.entries[0].items.length, 5);
  assert.equal(queue.entries[0].items[0].status, 'ready_for_handoff');

  const summary = summarizePlannerOuttray(queue);
  assert.equal(summary.entryCount, 1);
  assert.equal(summary.depositedCount, 1);
  assert.equal(summary.pendingLaneCount, 5);

  const collected = collectPlannerOuttrayItem(rootPath, {
    queueKey: 'outtray_1',
    laneId: 'qa',
    collectedBy: 'qa',
    reviewedBy: 'qa',
    status: 'under_review',
    summary: 'QA has collected the planner handoff.',
    findings: ['Planner output is structured and ready.'],
  });

  assert.ok(collected);
  assert.equal(collected.queue.entries[0].items.find((item) => item.laneId === 'qa').status, 'under_review');

  const updatedQueue = readPlannerOuttray(rootPath);
  assert.equal(updatedQueue.entries[0].items.find((item) => item.laneId === 'qa').status, 'under_review');
  assert.equal(updatedQueue.entries[0].status, 'under_review');
  assert.equal(summarizePlannerOuttray(updatedQueue).underReviewCount, 1);
}
