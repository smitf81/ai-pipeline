const path = require('path');

const SELF_TARGET_KEY = 'ace-self';
const SELF_TARGET_LABEL = 'ACE Self';
const SELF_ALLOWED_PREFIXES = [
  'ui/',
  'runner/',
  'README.md',
  'ace_commands.json',
  'projects.json',
  'AGENTS.md',
];
const SELF_AUTO_APPLY_ALLOWED_PREFIXES = [
  'ui/',
  'runner/',
];
const SELF_AUTO_APPLY_BLOCKED_FILES = [
  'ui/server.js',
  'projects.json',
  'ace_commands.json',
  'AGENTS.md',
];
const SELF_BLOCKED_PREFIXES = [
  '.git/',
  'node_modules/',
  'data/',
  'work/',
  'transcripts/',
];
const SELF_BLOCKED_PATTERNS = [
  /\.env/i,
  /secret/i,
  /token/i,
  /credential/i,
  /^projects\/emergence\//i,
];

function createDefaultSelfUpgradeState({ serverStartedAt = null, pid = null } = {}) {
  return {
    status: 'idle',
    targetProjectKey: SELF_TARGET_KEY,
    taskId: '',
    patchReview: null,
    preflight: {
      status: 'idle',
      ok: null,
      checkedAt: null,
      checks: [],
      summary: 'Run preflight before applying a self patch.',
    },
    apply: {
      status: 'idle',
      ok: null,
      appliedAt: null,
      branch: null,
      commit: null,
      taskId: '',
    },
    deploy: {
      status: 'idle',
      requestedAt: null,
      restartedAt: null,
      health: {
        status: 'ready',
        pid,
        startedAt: serverStartedAt,
      },
    },
    requiresPermission: 'none',
  };
}

function normalizeSelfUpgradeState(state = null, { serverStartedAt = null, pid = null } = {}) {
  const base = createDefaultSelfUpgradeState({ serverStartedAt, pid });
  return {
    ...base,
    ...(state || {}),
    preflight: {
      ...base.preflight,
      ...((state || {}).preflight || {}),
    },
    apply: {
      ...base.apply,
      ...((state || {}).apply || {}),
    },
    deploy: {
      ...base.deploy,
      ...((state || {}).deploy || {}),
      health: {
        ...base.deploy.health,
        ...(((state || {}).deploy || {}).health || {}),
      },
    },
  };
}

function ensureSelfProject(projects = {}, rootPath) {
  return {
    ...projects,
    [SELF_TARGET_KEY]: rootPath,
  };
}

function isSelfTarget(projectKey, projectPath, rootPath) {
  if (String(projectKey || '').trim() === SELF_TARGET_KEY) return true;
  if (!projectPath || !rootPath) return false;
  return path.resolve(projectPath) === path.resolve(rootPath);
}

function buildSelfUpgradePolicy({ projectKey, projectPath, rootPath }) {
  const enabled = isSelfTarget(projectKey, projectPath, rootPath);
  return {
    enabled,
    mode: enabled ? 'self-upgrade' : 'standard',
    targetProjectKey: enabled ? SELF_TARGET_KEY : String(projectKey || ''),
    allowedPrefixes: [...SELF_ALLOWED_PREFIXES],
    blockedPrefixes: [...SELF_BLOCKED_PREFIXES],
    blockedPatterns: SELF_BLOCKED_PATTERNS.map((pattern) => pattern.toString()),
  };
}

function listPatchChangedFiles(patchText = '') {
  const files = new Set();
  for (const line of String(patchText || '').split(/\r?\n/)) {
    if (!line.startsWith('diff --git ')) continue;
    const parts = line.split(' ');
    if (parts.length < 4) continue;
    const target = parts[3].replace(/^b\//, '');
    if (target && target !== 'dev/null') files.add(target);
  }
  return [...files];
}

function matchesAllowedPath(file) {
  return SELF_ALLOWED_PREFIXES.some((prefix) => file === prefix.replace(/\/$/, '') || file.startsWith(prefix));
}

function matchesBlockedPath(file) {
  return SELF_BLOCKED_PREFIXES.some((prefix) => file === prefix.replace(/\/$/, '') || file.startsWith(prefix))
    || SELF_BLOCKED_PATTERNS.some((pattern) => pattern.test(file));
}

function reviewSelfUpgradePatch({ patchText = '', taskId = '', projectKey = '', projectPath = '', rootPath = '' }) {
  const policy = buildSelfUpgradePolicy({ projectKey, projectPath, rootPath });
  if (!policy.enabled) {
    return {
      enabled: false,
      ok: true,
      mode: 'standard',
      changedFiles: [],
      blockedFiles: [],
      refusalReasons: [],
      warnings: [],
    };
  }

  const changedFiles = listPatchChangedFiles(patchText);
  const blockedFiles = changedFiles.filter((file) => matchesBlockedPath(file) || !matchesAllowedPath(file));
  const refusalReasons = [];

  if (!changedFiles.length) refusalReasons.push('Self-upgrade patch contains no detectable file changes.');
  if (blockedFiles.length) {
    refusalReasons.push(`Self-upgrade policy blocked ${blockedFiles.length} file path${blockedFiles.length === 1 ? '' : 's'}.`);
  }

  return {
    enabled: true,
    ok: refusalReasons.length === 0,
    mode: 'self-upgrade',
    taskId: String(taskId || ''),
    targetProjectKey: SELF_TARGET_KEY,
    allowedPrefixes: [...SELF_ALLOWED_PREFIXES],
    blockedPrefixes: [...SELF_BLOCKED_PREFIXES],
    changedFiles,
    blockedFiles,
    refusalReasons,
    warnings: blockedFiles.length ? blockedFiles.map((file) => `Blocked path: ${file}`) : [],
    summary: refusalReasons.length
      ? 'Self-upgrade patch failed ACE self-edit guardrails.'
      : 'Patch is inside ACE self-edit guardrails.',
  };
}

function matchesPrefix(file, prefixes = []) {
  return prefixes.some((prefix) => file === prefix.replace(/\/$/, '') || file.startsWith(prefix));
}

function assessAutoMutationRisk({
  projectKey = '',
  projectPath = '',
  rootPath = '',
  changedFiles = [],
  preflight = null,
  conflicts = [],
} = {}) {
  const files = Array.isArray(changedFiles) ? changedFiles.filter(Boolean) : [];
  const reasons = [];
  const highSeverityConflict = (conflicts || []).find((conflict) => String(conflict?.severity || '').toLowerCase() === 'high');

  if (highSeverityConflict) {
    reasons.push(highSeverityConflict.summary || 'High-severity orchestrator conflict is active.');
  }
  if (!files.length) {
    reasons.push('Patch has no detectable changed files.');
  }

  if (isSelfTarget(projectKey, projectPath, rootPath)) {
    if (files.length > 2) reasons.push('Self-upgrade patch touches more than 2 files.');
    if (files.some((file) => !matchesPrefix(file, SELF_AUTO_APPLY_ALLOWED_PREFIXES))) {
      reasons.push('Self-upgrade auto-apply is limited to ui/** and runner/** paths.');
    }
    if (files.some((file) => SELF_AUTO_APPLY_BLOCKED_FILES.includes(file))) {
      reasons.push('Self-upgrade patch touches a blocked runtime entrypoint.');
    }
    if (!preflight?.ok) reasons.push('Self-upgrade preflight did not pass.');
    return {
      riskLevel: reasons.length ? 'high' : 'low',
      requiresReview: reasons.length > 0,
      autoApply: reasons.length === 0,
      autoDeploy: reasons.length === 0,
      targetProjectKey: SELF_TARGET_KEY,
      changedFiles: files,
      reasons,
      scope: 'ui-plus-runtime',
    };
  }

  return {
    riskLevel: reasons.length ? 'high' : 'low',
    requiresReview: reasons.length > 0,
    autoApply: reasons.length === 0,
    autoDeploy: false,
    targetProjectKey: String(projectKey || ''),
    changedFiles: files,
    reasons,
    scope: 'standard',
  };
}

function summarizeCommandOutput(text = '', limit = 420) {
  const cleaned = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 10)
    .join('\n');
  return cleaned.length > limit ? `${cleaned.slice(0, limit)}...` : cleaned;
}

function getSelfUpgradePreflightSpecs(rootPath) {
  return [
    {
      id: 'ui-tests',
      label: 'UI test harness',
      cmd: 'node',
      args: [path.join('ui', 'tests', 'run-ui-tests.mjs')],
      cwd: rootPath,
    },
    {
      id: 'runner-compile',
      label: 'Runner syntax check',
      cmd: 'python',
      args: ['-m', 'py_compile', path.join('runner', 'ai.py')],
      cwd: rootPath,
    },
  ];
}

module.exports = {
  SELF_TARGET_KEY,
  SELF_TARGET_LABEL,
  createDefaultSelfUpgradeState,
  normalizeSelfUpgradeState,
  ensureSelfProject,
  isSelfTarget,
  buildSelfUpgradePolicy,
  listPatchChangedFiles,
  reviewSelfUpgradePatch,
  assessAutoMutationRisk,
  summarizeCommandOutput,
  getSelfUpgradePreflightSpecs,
};
