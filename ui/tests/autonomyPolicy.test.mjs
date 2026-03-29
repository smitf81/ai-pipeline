import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function makeTaskDir(rootPath, taskId = '0001', folderSuffix = 'policy-slice') {
  const taskDir = path.join(rootPath, 'work', 'tasks', `${taskId}-${folderSuffix}`);
  fs.mkdirSync(taskDir, { recursive: true });
  return taskDir;
}

export default async function runAutonomyPolicyTests() {
  const {
    AUTONOMY_POLICY_DEFAULT_RETRY_LIMIT,
    AUTONOMY_POLICY_FIX_QUEUE_JSON_NAME,
    AUTONOMY_POLICY_FIX_QUEUE_MD_NAME,
    createBoundedFixTaskArtifact,
    evaluateAutonomyPolicy,
  } = require(path.resolve(process.cwd(), 'autonomyPolicy.js'));

  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-autonomy-policy-'));
  const allowedProjectPath = path.join(rootPath, 'ace-self');
  fs.mkdirSync(allowedProjectPath, { recursive: true });

  const safePolicy = evaluateAutonomyPolicy({
    rootPath,
    stage: 'apply',
    action: 'apply',
    taskId: '0001',
    projectKey: 'ace-self',
    projectPath: allowedProjectPath,
    preflight: {
      ok: true,
      blockers: [],
      checks: {
        repoClean: { ok: true },
        validationCommand: { ok: true },
      },
    },
    changedFiles: ['brain/emergence/plan.md', 'ui/server.js'],
    patchText: [
      'diff --git a/brain/emergence/plan.md b/brain/emergence/plan.md',
      '--- a/brain/emergence/plan.md',
      '+++ b/brain/emergence/plan.md',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n'),
    retryCount: 0,
  });
  assert.equal(safePolicy.decision, 'auto_allowed');
  assert.ok(safePolicy.policy_rule_hits.includes('allowlisted_paths'));
  assert.ok(safePolicy.policy_rule_hits.includes('validation_command_exists'));

  const disallowedPolicy = evaluateAutonomyPolicy({
    rootPath,
    stage: 'apply',
    action: 'apply',
    taskId: '0002',
    projectKey: 'ace-self',
    projectPath: allowedProjectPath,
    preflight: {
      ok: true,
      blockers: [],
      checks: {
        repoClean: { ok: true },
        validationCommand: { ok: true },
      },
    },
    changedFiles: ['src/rogue.js'],
    patchText: [
      'diff --git a/src/rogue.js b/src/rogue.js',
      '--- a/src/rogue.js',
      '+++ b/src/rogue.js',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n'),
  });
  assert.equal(disallowedPolicy.decision, 'escalate');
  assert.ok(disallowedPolicy.reasons.some((reason) => /disallowed path/i.test(reason)));
  assert.ok(disallowedPolicy.policy_rule_hits.includes('touches_disallowed_paths'));

  const invalidPatchPolicy = evaluateAutonomyPolicy({
    rootPath,
    stage: 'apply',
    action: 'apply',
    taskId: '0003',
    projectKey: 'ace-self',
    projectPath: allowedProjectPath,
    preflight: {
      ok: true,
      blockers: [],
      checks: {
        repoClean: { ok: true },
        validationCommand: { ok: true },
      },
    },
    changedFiles: ['brain/emergence/plan.md'],
    patchText: '',
    patchValid: false,
  });
  assert.equal(invalidPatchPolicy.decision, 'blocked');
  assert.ok(invalidPatchPolicy.policy_rule_hits.includes('patch_invalid'));

  const retryEscalationPolicy = evaluateAutonomyPolicy({
    rootPath,
    stage: 'apply',
    action: 'apply',
    taskId: '0004',
    projectKey: 'ace-self',
    projectPath: allowedProjectPath,
    preflight: {
      ok: true,
      blockers: [],
      checks: {
        repoClean: { ok: true },
        validationCommand: { ok: true },
      },
    },
    changedFiles: ['brain/emergence/plan.md'],
    patchText: [
      'diff --git a/brain/emergence/plan.md b/brain/emergence/plan.md',
      '--- a/brain/emergence/plan.md',
      '+++ b/brain/emergence/plan.md',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n'),
    retryCount: AUTONOMY_POLICY_DEFAULT_RETRY_LIMIT,
  });
  assert.equal(retryEscalationPolicy.decision, 'escalate');
  assert.ok(retryEscalationPolicy.policy_rule_hits.includes('retry_threshold_exceeded'));

  const cacheReusePolicy = evaluateAutonomyPolicy({
    rootPath,
    stage: 'rebuild',
    action: 'rebuild',
    taskId: '0005',
    projectKey: 'ace-self',
    projectPath: allowedProjectPath,
    preflight: {
      ok: false,
      blockers: ['Cached patch already exists; rebuild skipped.'],
      checks: {
        repoClean: { ok: true },
        validationCommand: { ok: true },
      },
    },
    cacheStatus: 'reused',
    taskCache: {
      source: 'cache_hit',
      files: {
        patch: { valid: true },
      },
    },
  });
  assert.equal(cacheReusePolicy.decision, 'auto_allowed');
  assert.equal(cacheReusePolicy.cache_status, 'reused');
  assert.ok(cacheReusePolicy.policy_rule_hits.includes('cache_reused'));

  const taskDir = makeTaskDir(rootPath, '0006', 'fix-task');
  const fixTask = createBoundedFixTaskArtifact(rootPath, {
    taskId: '0006',
    taskDir,
    stage: 'apply',
    action: 'apply',
    decision: 'blocked',
    reasons: ['Patch is empty or invalid.'],
    policy_rule_hits: ['patch_invalid'],
    retryCount: 1,
    projectKey: 'ace-self',
    changedFiles: ['brain/emergence/plan.md'],
    failureKey: 'invalid_patch_diff',
  });
  assert.equal(fixTask.location, 'task');
  assert.ok(fs.existsSync(path.join(taskDir, 'fix_task.json')));
  assert.ok(fs.existsSync(path.join(taskDir, 'fix_task.md')));
  const fixTaskPayload = JSON.parse(fs.readFileSync(path.join(taskDir, 'fix_task.json'), 'utf8'));
  assert.equal(fixTaskPayload.decision, 'blocked');
  assert.equal(fixTaskPayload.retry_count, 1);
  assert.equal(fixTaskPayload.failureKey, 'invalid_patch_diff');
  assert.ok(Array.isArray(fixTaskPayload.changedFiles));

  const queuedFixTask = createBoundedFixTaskArtifact(rootPath, {
    taskId: 'pending-builder',
    stage: 'builder',
    action: 'build',
    decision: 'escalate',
    reasons: ['Disallowed path scope: src/rogue.js'],
    policy_rule_hits: ['touches_disallowed_paths'],
    retryCount: 2,
    projectKey: 'ace-self',
    changedFiles: ['src/rogue.js'],
    failureKey: 'unknown_failure',
  });
  assert.equal(queuedFixTask.location, 'queue');
  assert.ok(fs.existsSync(path.join(rootPath, 'brain', 'context', AUTONOMY_POLICY_FIX_QUEUE_JSON_NAME)));
  assert.ok(fs.existsSync(path.join(rootPath, 'brain', 'context', AUTONOMY_POLICY_FIX_QUEUE_MD_NAME)));
  const queuePayload = JSON.parse(fs.readFileSync(path.join(rootPath, 'brain', 'context', AUTONOMY_POLICY_FIX_QUEUE_JSON_NAME), 'utf8'));
  assert.equal(queuePayload.entries.length, 1);

  createBoundedFixTaskArtifact(rootPath, {
    taskId: 'pending-builder',
    stage: 'builder',
    action: 'build',
    decision: 'escalate',
    reasons: ['Disallowed path scope: src/rogue.js'],
    policy_rule_hits: ['touches_disallowed_paths'],
    retryCount: 2,
    projectKey: 'ace-self',
    changedFiles: ['src/rogue.js'],
    failureKey: 'unknown_failure',
  });
  const queuePayloadAgain = JSON.parse(fs.readFileSync(path.join(rootPath, 'brain', 'context', AUTONOMY_POLICY_FIX_QUEUE_JSON_NAME), 'utf8'));
  assert.equal(queuePayloadAgain.entries.length, 1);
}
