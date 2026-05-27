const path = require('path');
const { spawn, spawnSync } = require('child_process');

const LEGACY_FALLBACK_ACTIONS = ['scan', 'manage', 'build'];

function normalizeLegacyAction(action) {
  return String(action || '').trim().toLowerCase();
}

function assertSupportedLegacyAction(action) {
  const normalized = normalizeLegacyAction(action);
  if (!LEGACY_FALLBACK_ACTIONS.includes(normalized)) {
    throw new Error(`Unsupported legacy fallback action: ${action || 'undefined'}.`);
  }
  return normalized;
}

function buildLegacyRunnerCommand({ rootPath, action, taskId, project, model } = {}) {
  const normalizedAction = assertSupportedLegacyAction(action);
  const normalizedTaskId = String(taskId || '').trim();
  const normalizedProject = String(project || '').trim();
  if (!normalizedTaskId || !normalizedProject) {
    throw new Error('Legacy fallback requires taskId and project.');
  }

  const aiPath = path.join(rootPath, 'runner', 'ai.py');
  const args = [aiPath, normalizedAction, normalizedTaskId, '--project', normalizedProject];
  if ((normalizedAction === 'manage' || normalizedAction === 'build') && model) {
    args.push('--model', String(model));
  }

  return {
    action: normalizedAction,
    cmd: 'python',
    args,
    commandLine: ['python', ...args].join(' '),
  };
}

function runLegacyFallbackSync(payload, { rootPath } = {}) {
  const command = buildLegacyRunnerCommand({ rootPath, ...payload });
  const result = spawnSync(command.cmd, command.args, {
    cwd: rootPath,
    encoding: 'utf8',
    windowsHide: true,
  });
  return {
    command,
    code: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function runLegacyFallbackStream(payload, { rootPath, onStdout = null, onStderr = null } = {}) {
  const command = buildLegacyRunnerCommand({ rootPath, ...payload });
  const child = spawn(command.cmd, command.args, {
    cwd: rootPath,
    windowsHide: true,
  });

  if (typeof onStdout === 'function') {
    child.stdout.on('data', (chunk) => onStdout(chunk.toString()));
  }
  if (typeof onStderr === 'function') {
    child.stderr.on('data', (chunk) => onStderr(chunk.toString()));
  }

  return {
    command,
    child,
  };
}

module.exports = {
  LEGACY_FALLBACK_ACTIONS,
  buildLegacyRunnerCommand,
  runLegacyFallbackSync,
  runLegacyFallbackStream,
};
