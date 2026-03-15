import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default async function runSelfUpgradeTests() {
  const selfUpgradePath = path.resolve(process.cwd(), 'selfUpgrade.js');
  const {
    SELF_TARGET_KEY,
    createDefaultSelfUpgradeState,
    normalizeSelfUpgradeState,
    ensureSelfProject,
    reviewSelfUpgradePatch,
    assessAutoMutationRisk,
    getSelfUpgradePreflightSpecs,
  } = require(selfUpgradePath);

  const state = createDefaultSelfUpgradeState({
    serverStartedAt: '2026-03-13T12:00:00.000Z',
    pid: 4242,
  });
  assert.equal(state.targetProjectKey, SELF_TARGET_KEY);
  assert.equal(state.deploy.health.pid, 4242);

  const normalized = normalizeSelfUpgradeState({
    status: 'ready-to-apply',
    preflight: { status: 'passed', ok: true },
  }, {
    serverStartedAt: '2026-03-13T12:00:00.000Z',
    pid: 4242,
  });
  assert.equal(normalized.status, 'ready-to-apply');
  assert.equal(normalized.preflight.ok, true);
  assert.equal(normalized.deploy.health.pid, 4242);

  const projects = ensureSelfProject({ ace: 'C:/repo' }, 'C:/repo');
  assert.equal(projects[SELF_TARGET_KEY], 'C:/repo');

  const safePatch = [
    'diff --git a/ui/server.js b/ui/server.js',
    '--- a/ui/server.js',
    '+++ b/ui/server.js',
    '@@ -1,1 +1,1 @@',
    '-const oldValue = true;',
    '+const oldValue = false;',
  ].join('\n');
  const safeReview = reviewSelfUpgradePatch({
    patchText: safePatch,
    taskId: '0001',
    projectKey: SELF_TARGET_KEY,
    projectPath: 'C:/repo',
    rootPath: 'C:/repo',
  });
  assert.equal(safeReview.ok, true);
  assert.deepEqual(safeReview.changedFiles, ['ui/server.js']);

  const blockedPatch = [
    'diff --git a/data/spatial/workspace.json b/data/spatial/workspace.json',
    '--- a/data/spatial/workspace.json',
    '+++ b/data/spatial/workspace.json',
    '@@ -1,1 +1,1 @@',
    '-{}',
    '+{"bad":true}',
  ].join('\n');
  const blockedReview = reviewSelfUpgradePatch({
    patchText: blockedPatch,
    taskId: '0002',
    projectKey: SELF_TARGET_KEY,
    projectPath: 'C:/repo',
    rootPath: 'C:/repo',
  });
  assert.equal(blockedReview.ok, false);
  assert.match(blockedReview.refusalReasons[0], /blocked/i);

  const lowRisk = assessAutoMutationRisk({
    projectKey: SELF_TARGET_KEY,
    projectPath: 'C:/repo',
    rootPath: 'C:/repo',
    changedFiles: ['ui/public/spatial/spatialApp.js', 'runner/ai.py'],
    preflight: { ok: true },
    conflicts: [],
  });
  assert.equal(lowRisk.riskLevel, 'low');
  assert.equal(lowRisk.autoApply, true);
  assert.equal(lowRisk.autoDeploy, true);

  const risky = assessAutoMutationRisk({
    projectKey: SELF_TARGET_KEY,
    projectPath: 'C:/repo',
    rootPath: 'C:/repo',
    changedFiles: ['ui/server.js'],
    preflight: { ok: true },
    conflicts: [],
  });
  assert.equal(risky.riskLevel, 'high');
  assert.equal(risky.requiresReview, true);
  assert.match(risky.reasons[0], /blocked runtime entrypoint|entrypoint/i);

  const preflightSpecs = getSelfUpgradePreflightSpecs('C:/repo');
  assert.deepEqual(preflightSpecs.map((spec) => spec.id), ['ui-tests', 'runner-compile']);
}
