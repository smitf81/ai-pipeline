import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildLegacyRunnerCommand,
  resolveLegacyRunnerPath,
} = require('../legacyRunnerAdapter.js');

function touch(rootPath, relativePath) {
  const targetPath = path.join(rootPath, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, '# test runner\n', 'utf8');
  return targetPath;
}

export default async function runLegacyRunnerAdapterTests() {
  const canonicalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-legacy-runner-'));
  const canonicalPath = touch(canonicalRoot, 'legacy/runner/ai.py');
  touch(canonicalRoot, 'runner/ai.py');

  assert.equal(resolveLegacyRunnerPath(canonicalRoot), canonicalPath);
  const command = buildLegacyRunnerCommand({
    rootPath: canonicalRoot,
    action: 'build',
    taskId: '0007',
    project: 'ace-self',
    model: 'qwen-test',
  });
  assert.deepEqual(command.args, [canonicalPath, 'build', '0007', '--project', 'ace-self', '--model', 'qwen-test']);

  const compatibilityRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-root-runner-'));
  const compatibilityPath = touch(compatibilityRoot, 'runner/ai.py');
  assert.equal(resolveLegacyRunnerPath(compatibilityRoot), compatibilityPath);

  const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-missing-runner-'));
  assert.equal(resolveLegacyRunnerPath(emptyRoot), path.join(emptyRoot, 'legacy', 'runner', 'ai.py'));
}
