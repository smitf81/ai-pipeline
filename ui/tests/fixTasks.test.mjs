import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function makeTaskDir(rootPath, taskId = '0001', folderSuffix = 'fix-task') {
  const taskDir = path.join(rootPath, 'work', 'tasks', `${taskId}-${folderSuffix}`);
  fs.mkdirSync(taskDir, { recursive: true });
  return taskDir;
}

function seedProject(rootPath, projectKey = 'ace-self') {
  const projectPath = path.join(rootPath, projectKey);
  fs.mkdirSync(projectPath, { recursive: true });
  return projectPath;
}

export default async function runFixTaskTests() {
  const {
    AUTONOMY_POLICY_DEFAULT_RETRY_LIMIT,
    AUTONOMY_POLICY_FIX_QUEUE_JSON_NAME,
    createBoundedFixTaskArtifact,
  } = require(path.resolve(process.cwd(), 'autonomyPolicy.js'));
  const {
    buildFixTaskPlannerHandoff,
    consumePendingFixTask,
    finalizeFixTask,
    readPendingFixTasks,
  } = require(path.resolve(process.cwd(), 'fixTasks.js'));

  const preflight = {
    ok: true,
    blockers: [],
    checks: {
      repoClean: { ok: true },
      validationCommand: { ok: true },
    },
  };

  const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-fix-task-task-'));
  const taskProjectPath = seedProject(taskRoot);
  const taskDir = makeTaskDir(taskRoot, '0001', 'fix-task');
  fs.writeFileSync(path.join(taskDir, 'idea.txt'), 'Repair the repeated patch failure.\n', 'utf8');
  fs.writeFileSync(path.join(taskDir, 'context.md'), '# Task 0001\n\n## Context\nRepair the repeated patch failure.\n', 'utf8');
  fs.writeFileSync(path.join(taskDir, 'plan.md'), '# Task 0001\n\n## MVP scope (must-haves)\n- Retry the bounded fix\n\n## Acceptance criteria\n- [ ] The task resolves\n', 'utf8');
  fs.writeFileSync(path.join(taskDir, 'patch.diff'), '', 'utf8');
  fs.writeFileSync(path.join(taskDir, 'apply_result.json'), `${JSON.stringify({
    taskId: '0001',
    stage: 'apply',
    status: 'pending',
    ok: false,
    created_utc: '2026-03-29T00:00:00.000Z',
  }, null, 2)}\n`, 'utf8');
  createBoundedFixTaskArtifact(taskRoot, {
    taskId: '0001',
    taskDir,
    stage: 'apply',
    action: 'apply',
    decision: 'blocked',
    status: 'pending',
    reasons: ['Patch is empty or invalid.'],
    policy_rule_hits: ['patch_invalid'],
    retryCount: 1,
    projectKey: 'ace-self',
    projectPath: taskProjectPath,
    changedFiles: ['brain/emergence/plan.md'],
    failureKey: 'invalid_patch_diff',
  });

  const pendingTaskArtifacts = readPendingFixTasks(taskRoot);
  assert.equal(pendingTaskArtifacts.length, 1);
  assert.equal(pendingTaskArtifacts[0].status, 'pending');
  assert.equal(pendingTaskArtifacts[0].location, 'task');

  const consumedTask = consumePendingFixTask(taskRoot, { preflight });
  assert.equal(consumedTask.accepted, true);
  assert.equal(consumedTask.handoff.status, 'ready');
  assert.equal(consumedTask.fixTask.status, 'consumed');
  assert.equal(consumedTask.fixTask.taskId, '0001');
  assert.ok(consumedTask.handoff.anchorRefs.length > 0);
  assert.ok(consumedTask.handoff.sourceFixTaskId === '0001');

  const consumedQueue = readPendingFixTasks(taskRoot);
  assert.equal(consumedQueue.length, 0);

  const resolvedTask = finalizeFixTask(taskRoot, consumedTask.fixTask, {
    status: 'resolved',
    reason: 'Bounded retry succeeded.',
    followupTaskId: 'followup-0001',
    followupTaskDir: path.join(taskRoot, 'work', 'tasks', 'followup-0001'),
  });
  assert.equal(resolvedTask.status, 'resolved');
  assert.equal(readPendingFixTasks(taskRoot).length, 0);
  const resolvedPayload = JSON.parse(fs.readFileSync(path.join(taskDir, 'fix_task.json'), 'utf8'));
  assert.equal(resolvedPayload.status, 'resolved');
  assert.equal(resolvedPayload.followupTaskId, 'followup-0001');

  const queueRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-fix-task-queue-'));
  const queueProjectPath = seedProject(queueRoot);
  createBoundedFixTaskArtifact(queueRoot, {
    taskId: 'queue-0002',
    stage: 'builder',
    action: 'build',
    decision: 'escalate',
    status: 'pending',
    reasons: ['Unknown failure needs review.'],
    policy_rule_hits: ['retry_threshold_exceeded'],
    retryCount: AUTONOMY_POLICY_DEFAULT_RETRY_LIMIT,
    projectKey: 'ace-self',
    projectPath: queueProjectPath,
    changedFiles: ['ui/server.js'],
    failureKey: 'unknown_failure',
  });

  const queuePending = readPendingFixTasks(queueRoot);
  assert.equal(queuePending.length, 1);
  assert.equal(queuePending[0].location, 'queue');

  const reEscalated = consumePendingFixTask(queueRoot, { preflight });
  assert.equal(reEscalated.accepted, false);
  assert.equal(reEscalated.policy.decision, 'escalate');
  assert.equal(reEscalated.fixTask.status, 're_escalated');
  assert.equal(readPendingFixTasks(queueRoot).length, 0);
  const queuePayload = JSON.parse(fs.readFileSync(path.join(queueRoot, 'brain', 'context', AUTONOMY_POLICY_FIX_QUEUE_JSON_NAME), 'utf8'));
  assert.equal(queuePayload.entries[0].status, 're_escalated');
}
