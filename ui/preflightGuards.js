const fs = require('fs');
const path = require('path');
const {
  modelSupportsToolUse,
} = require('./agentRegistry');

function uniqueStrings(values = []) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function normalizeRelativePath(relativePath = '') {
  return String(relativePath || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/')
    .trim();
}

function checkRequiredFiles(rootPath, requiredFiles = []) {
  const missing = uniqueStrings(requiredFiles)
    .map((filePath) => normalizeRelativePath(filePath))
    .filter((filePath) => filePath && !fs.existsSync(path.join(rootPath, ...filePath.split('/'))));
  return {
    ok: missing.length === 0,
    missing,
  };
}

function checkRepoClean({ commandRunner, rootPath }) {
  if (typeof commandRunner !== 'function') {
    return {
      ok: false,
      available: false,
      code: 'command-runner-missing',
      message: 'No command runner was provided for repo-clean validation.',
      output: '',
    };
  }
  const result = commandRunner('git', ['status', '--porcelain', '--untracked-files=no'], rootPath);
  const stdout = String(result?.stdout || '').trim();
  const stderr = String(result?.stderr || '').trim();
  const dirtySummary = 'Repository has uncommitted tracked changes.';
  const dirtyDetails = stdout || stderr;
  return {
    ok: Boolean(result && result.code === 0 && !stdout),
    available: true,
    code: result?.code ?? null,
    message: result?.code === 0 && !stdout
      ? 'Repository is clean.'
      : (dirtyDetails ? `${dirtySummary}\n${dirtyDetails}` : dirtySummary),
    output: stdout || stderr,
  };
}

function checkProjectKeyResolves(projectKey, projectPath) {
  const normalizedKey = String(projectKey || '').trim();
  const normalizedPath = String(projectPath || '').trim();
  const ok = Boolean(normalizedKey && normalizedPath && fs.existsSync(normalizedPath));
  return {
    ok,
    projectKey: normalizedKey || null,
    projectPath: normalizedPath || null,
    message: ok ? 'Project key resolved.' : 'Project key could not be resolved to an existing project path.',
  };
}

function checkValidationCommandExists({ commandRunner, command, args = ['--version'], cwd }) {
  if (!command) {
    return {
      ok: false,
      available: false,
      command: null,
      message: 'No validation command was provided.',
    };
  }
  if (typeof commandRunner !== 'function') {
    return {
      ok: false,
      available: false,
      command: String(command),
      message: 'No command runner was provided for validation command probing.',
    };
  }
  const result = commandRunner(command, args, cwd);
  return {
    ok: Boolean(result && result.code === 0),
    available: Boolean(result && result.code === 0),
    command: String(command),
    args: Array.isArray(args) ? [...args] : [],
    message: result && result.code === 0
      ? `Validation command available: ${command}.`
      : `Validation command is unavailable: ${command}.`,
  };
}

function checkPatchAlreadyExists(patchPath) {
  const normalizedPatchPath = String(patchPath || '').trim();
  const exists = Boolean(normalizedPatchPath && fs.existsSync(normalizedPatchPath) && fs.statSync(normalizedPatchPath).size > 0);
  return {
    ok: !exists,
    exists,
    patchPath: normalizedPatchPath || null,
    message: exists
      ? 'Patch already exists; reuse the cached task artefact instead of rebuilding.'
      : 'No cached patch exists yet.',
  };
}

function checkModelToolUseCapability(model, { requireToolUse = true } = {}) {
  const normalizedModel = String(model || '').trim();
  if (!normalizedModel) {
    return {
      ok: !requireToolUse,
      model: null,
      tool_use_capable: false,
      required: Boolean(requireToolUse),
      message: requireToolUse ? 'No model was provided for a tool-use gate.' : 'No model was provided.',
    };
  }
  const toolUseCapable = modelSupportsToolUse(normalizedModel);
  return {
    ok: !requireToolUse || toolUseCapable,
    model: normalizedModel,
    tool_use_capable: toolUseCapable,
    required: Boolean(requireToolUse),
    message: toolUseCapable
      ? `Model ${normalizedModel} is tool-use capable.`
      : `Model ${normalizedModel} is not tool-use capable.`,
  };
}

function evaluatePreLlmGuards({
  rootPath,
  requiredFiles = [],
  projectKey = null,
  projectPath = null,
  validationCommand = null,
  patchPath = null,
  commandRunner = null,
  requireRepoClean = true,
  blockOnExistingPatch = true,
  model = null,
  requireToolUse = false,
} = {}) {
  const checks = {};
  const blockers = [];

  if (requiredFiles.length) {
    checks.requiredFiles = checkRequiredFiles(rootPath, requiredFiles);
    if (!checks.requiredFiles.ok) blockers.push(`Missing required files: ${checks.requiredFiles.missing.join(', ')}`);
  }

  if (projectKey || projectPath) {
    checks.projectKey = checkProjectKeyResolves(projectKey, projectPath);
    if (!checks.projectKey.ok) blockers.push(checks.projectKey.message);
  }

  if (requireRepoClean) {
    checks.repoClean = checkRepoClean({ commandRunner, rootPath });
    if (!checks.repoClean.ok) blockers.push(checks.repoClean.message);
  }

  if (validationCommand) {
    checks.validationCommand = checkValidationCommandExists({
      commandRunner,
      command: validationCommand.command,
      args: validationCommand.args,
      cwd: validationCommand.cwd || rootPath,
    });
    if (!checks.validationCommand.ok) blockers.push(checks.validationCommand.message);
  }

  if (patchPath && blockOnExistingPatch) {
    checks.patch = checkPatchAlreadyExists(patchPath);
    if (!checks.patch.ok) blockers.push(checks.patch.message);
  }

  if (model || requireToolUse) {
    checks.modelToolUse = checkModelToolUseCapability(model, { requireToolUse });
    if (!checks.modelToolUse.ok) blockers.push(checks.modelToolUse.message);
  }

  return {
    ok: blockers.length === 0,
    blockers,
    checks,
    cacheHit: Boolean(checks.patch?.exists),
  };
}

module.exports = {
  checkPatchAlreadyExists,
  checkModelToolUseCapability,
  checkProjectKeyResolves,
  checkRepoClean,
  checkRequiredFiles,
  checkValidationCommandExists,
  evaluatePreLlmGuards,
};
