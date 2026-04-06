import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  classifyWorkspacePath,
  formatPathBucketSummary,
  writeJsonIfChanged,
} = require('../changeHygiene.js');

export default async function runChangeHygieneTests() {
  const behavioral = classifyWorkspacePath('ui/server.js');
  assert.equal(behavioral.bucket, 'behavioral');

  const operational = classifyWorkspacePath('brain/context/recent_change_digest.md');
  assert.equal(operational.bucket, 'operational');

  const generated = classifyWorkspacePath('data/spatial/workspace.json');
  assert.equal(generated.bucket, 'generated');

  const taskArtifact = classifyWorkspacePath('work/tasks/0001-example/patch.diff');
  assert.equal(taskArtifact.bucket, 'task-artifact');

  const summary = formatPathBucketSummary([
    'ui/server.js',
    'brain/context/failure_history.md',
    'data/spatial/workspace.json',
    'work/tasks/0001-example/plan.md',
  ]);
  assert.equal(summary.behavioral, 1);
  assert.equal(summary.operational, 1);
  assert.equal(summary.generated, 1);
  assert.equal(summary.taskArtifacts, 1);

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-change-hygiene-'));
  const target = path.join(tmpRoot, 'workspace.json');
  const first = writeJsonIfChanged(target, {
    version: 1,
    updatedAt: '2026-04-02T00:00:00.000Z',
    nested: {
      lastTickAt: '2026-04-02T00:00:00.000Z',
      value: 42,
    },
  }, {
    ignoreKeys: ['updatedAt', 'lastTickAt'],
  });
  const before = fs.readFileSync(target, 'utf8');
  const second = writeJsonIfChanged(target, {
    version: 1,
    updatedAt: '2026-04-02T09:00:00.000Z',
    nested: {
      lastTickAt: '2026-04-02T09:00:00.000Z',
      value: 42,
    },
  }, {
    ignoreKeys: ['updatedAt', 'lastTickAt'],
  });
  const after = fs.readFileSync(target, 'utf8');

  assert.equal(first, true);
  assert.equal(second, false);
  assert.equal(after, before);
}
