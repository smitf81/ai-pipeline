import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function writeFile(rootPath, relativePath, content = '') {
  const target = path.join(rootPath, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

export default async function runPreflightGuardsTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-preflight-'));
  const modulePath = path.resolve(process.cwd(), 'preflightGuards.js');
  const {
    checkPatchAlreadyExists,
    checkModelToolUseCapability,
    checkProjectKeyResolves,
    checkRepoClean,
    checkRequiredFiles,
    checkValidationCommandExists,
    evaluatePreLlmGuards,
  } = require(modulePath);

  writeFile(rootPath, 'brain/emergence/project_brain.md', '# Brain\n');
  writeFile(rootPath, 'brain/emergence/plan.md', '# Plan\n');
  writeFile(rootPath, 'brain/emergence/tasks.md', '# Tasks\n');
  writeFile(rootPath, 'targets/ace-self/README.md', '# target\n');
  writeFile(rootPath, 'work/tasks/0001-cache-me/patch.diff', '');
  writeFile(rootPath, 'work/tasks/0002-cache-me/patch.diff', 'diff --git a/a b/a\n');

  const commandRunner = (command, args = [], cwd = null) => {
    if (command === 'git' && args[0] === 'status') {
      return { code: 0, stdout: '', stderr: '' };
    }
    if (command === 'git' && args[0] === '--version') {
      return { code: 0, stdout: 'git version 2.0.0', stderr: '' };
    }
    if (command === 'node' && args[0] === '--version') {
      return { code: 0, stdout: 'v20.0.0', stderr: '' };
    }
    return { code: 127, stdout: '', stderr: `missing: ${command} ${args.join(' ')}` };
  };

  assert.deepEqual(checkRequiredFiles(rootPath, [
    'brain/emergence/project_brain.md',
    'brain/emergence/plan.md',
    'brain/emergence/tasks.md',
  ]), {
    ok: true,
    missing: [],
  });

  assert.equal(checkProjectKeyResolves('ace-self', path.join(rootPath, 'targets', 'ace-self')).ok, true);
  assert.equal(checkProjectKeyResolves('missing-key', path.join(rootPath, 'targets', 'missing')).ok, false);

  assert.equal(checkValidationCommandExists({
    commandRunner,
    command: 'git',
    args: ['--version'],
    cwd: rootPath,
  }).ok, true);
  assert.equal(checkValidationCommandExists({
    commandRunner,
    command: 'missing-tool',
    args: ['--version'],
    cwd: rootPath,
  }).ok, false);

  assert.equal(checkPatchAlreadyExists(path.join(rootPath, 'work', 'tasks', '0001-cache-me', 'patch.diff')).exists, false);
  assert.equal(checkPatchAlreadyExists(path.join(rootPath, 'work', 'tasks', '0002-cache-me', 'patch.diff')).exists, true);
  assert.equal(checkModelToolUseCapability('qwen3.5-9b', { requireToolUse: true }).ok, true);
  assert.equal(checkModelToolUseCapability('mistral:latest', { requireToolUse: true }).ok, false);
  assert.deepEqual(checkRepoClean({
    commandRunner: () => ({
      code: 0,
      stdout: ' M ui/server.js\n M brain/context/failure_history.json',
      stderr: '',
    }),
    rootPath,
  }), {
    ok: false,
    available: true,
    code: 0,
    message: 'Repository has uncommitted tracked changes.\nM ui/server.js\n M brain/context/failure_history.json',
    output: 'M ui/server.js\n M brain/context/failure_history.json',
  });

  const okGuard = evaluatePreLlmGuards({
    rootPath,
    requiredFiles: [
      'brain/emergence/project_brain.md',
      'brain/emergence/plan.md',
      'brain/emergence/tasks.md',
    ],
    projectKey: 'ace-self',
    projectPath: path.join(rootPath, 'targets', 'ace-self'),
    validationCommand: {
      command: 'git',
      args: ['--version'],
    },
    model: 'qwen3.5-9b',
    requireToolUse: true,
    commandRunner,
  });
  assert.equal(okGuard.ok, true);
  assert.equal(okGuard.blockers.length, 0);

  const blockedGuard = evaluatePreLlmGuards({
    rootPath,
    requiredFiles: [
      'brain/emergence/project_brain.md',
      'brain/emergence/missing.md',
    ],
    projectKey: 'ace-self',
    projectPath: path.join(rootPath, 'targets', 'ace-self'),
    validationCommand: {
      command: 'git',
      args: ['--version'],
    },
    patchPath: path.join(rootPath, 'work', 'tasks', '0002-cache-me', 'patch.diff'),
    model: 'mistral:latest',
    requireToolUse: true,
    commandRunner,
  });
  assert.equal(blockedGuard.ok, false);
  assert.ok(blockedGuard.blockers.some((reason) => /Missing required files/i.test(reason)));
  assert.ok(blockedGuard.blockers.some((reason) => /Patch already exists/i.test(reason)));
  assert.ok(blockedGuard.blockers.some((reason) => /tool-use capable/i.test(reason)));
}
