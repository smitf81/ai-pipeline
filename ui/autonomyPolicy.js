const fs = require('fs');
const path = require('path');
const {
  normalizeFailureKey,
  readFailureHistory,
} = require('./failureMemory');
const {
  readKnownFixCandidates,
} = require('./knownFixes');
const {
  attachAgentAttribution,
  normalizeAgentIdentity,
  resolveStageAgentIdentity,
  renderAgentAttributionBlock,
} = require('./agentAttribution');

const AUTONOMY_POLICY_VERSION = 'ace/autonomy-policy.v0';
const AUTONOMY_POLICY_DEFAULT_RETRY_LIMIT = 2;
const AUTONOMY_POLICY_RELATIVE_DIR = path.join('brain', 'context');
const AUTONOMY_POLICY_FIX_QUEUE_JSON_NAME = 'autonomy_fix_tasks.json';
const AUTONOMY_POLICY_FIX_QUEUE_MD_NAME = 'autonomy_fix_tasks.md';
const AUTONOMY_POLICY_FIX_TASK_JSON_NAME = 'fix_task.json';
const AUTONOMY_POLICY_FIX_TASK_MD_NAME = 'fix_task.md';
const AUTONOMY_POLICY_FIX_QUEUE_LIMIT = 20;

const AUTONOMY_POLICY_ALLOWLIST = Object.freeze({
  planner: ['brain/emergence/', 'brain/context/', 'work/tasks/'],
  'context-manager': ['brain/emergence/', 'brain/context/', 'work/tasks/'],
  executor: ['brain/emergence/', 'brain/context/', 'ui/', 'work/tasks/'],
  rebuild: ['brain/emergence/', 'brain/context/', 'ui/', 'work/tasks/'],
  apply: ['brain/emergence/', 'brain/context/', 'ui/', 'work/tasks/'],
  builder: ['brain/emergence/', 'brain/context/', 'ui/', 'work/tasks/'],
  'self-upgrade': ['brain/emergence/', 'brain/context/', 'ui/', 'work/tasks/'],
});

function nowIso() {
  return new Date().toISOString();
}

function uniqueStrings(values = []) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function relativeToRoot(rootPath, targetPath) {
  if (!rootPath || !targetPath) return null;
  return path.relative(rootPath, targetPath).replace(/\\/g, '/');
}

function normalizeRelativePath(relativePath = '') {
  return String(relativePath || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/')
    .trim();
}

function normalizePathList(values = []) {
  return uniqueStrings(values).map(normalizeRelativePath).filter(Boolean);
}

function stageAllowlist(stage = '') {
  const normalizedStage = String(stage || '').trim().toLowerCase();
  return AUTONOMY_POLICY_ALLOWLIST[normalizedStage] || AUTONOMY_POLICY_ALLOWLIST.executor;
}

function isPathAllowed(relativePath = '', allowlist = []) {
  const normalizedPath = normalizeRelativePath(relativePath);
  if (!normalizedPath || normalizedPath.startsWith('..') || normalizedPath.includes('/../')) {
    return false;
  }
  const normalizedAllowlist = normalizePathList(allowlist);
  return normalizedAllowlist.some((prefix) => {
    const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
    return normalizedPath === prefix || normalizedPath.startsWith(normalizedPrefix);
  });
}

function collectDisallowedPaths(changedFiles = [], allowlist = []) {
  return normalizePathList(changedFiles).filter((filePath) => !isPathAllowed(filePath, allowlist));
}

function detectPatchDeletes(patchText = '') {
  const text = String(patchText || '');
  return /^(deleted file mode|new file mode 0|rename from .*?\nrename to .*?\/dev\/null|---\s+a\/.+\n\+\+\+\s+\/dev\/null)/mi.test(text)
    || /(^|\n)\+\+\+\s+\/dev\/null(\n|$)/i.test(text)
    || /(^|\n)deleted file mode /i.test(text);
}

function detectPatchAmbiguity({ patchText = '', changedFiles = [] } = {}) {
  const normalizedPatchText = String(patchText || '').trim();
  const normalizedChangedFiles = normalizePathList(changedFiles);
  if (!normalizedPatchText) return true;
  if (!normalizedChangedFiles.length) return true;
  if (!/(^diff --git|^---\s|^\+\+\+\s|^@@)/m.test(normalizedPatchText)) return true;
  return false;
}

function lookupFailureHistoryCount(rootPath, failureKey) {
  const normalizedKey = String(failureKey || '').trim().toLowerCase();
  if (!normalizedKey) return 0;
  const history = readFailureHistory(rootPath).history;
  const entry = (history.entries || []).find((item) => item.failure_key === normalizedKey);
  return Number(entry?.count || 0) || 0;
}

function resolveRetryCount({
  rootPath = null,
  failureKey = null,
  retryCount = null,
} = {}) {
  if (Number.isFinite(Number(retryCount))) {
    return Math.max(Number(retryCount), 0);
  }
  const historyCount = lookupFailureHistoryCount(rootPath, failureKey);
  return historyCount > 0 ? Math.max(historyCount - 1, 0) : 0;
}

function normalizeAutonomyPolicyDecision(policy = {}) {
  const decision = String(policy.decision || 'auto_allowed').trim() || 'auto_allowed';
  const status = String(policy.status || 'pending').trim() || 'pending';
  const agentIdentity = normalizeAgentIdentity({
    agent_id: policy.agent_id || policy.agentId || policy.attribution?.agent_id || policy.attribution?.agentId || null,
    agent_version: policy.agent_version || policy.agentVersion || policy.attribution?.agent_version || policy.attribution?.agentVersion || null,
  }, resolveStageAgentIdentity(policy.stage || policy.action || 'autonomy-policy'));
  return {
    version: String(policy.version || AUTONOMY_POLICY_VERSION).trim() || AUTONOMY_POLICY_VERSION,
    stage: String(policy.stage || '').trim() || null,
    action: String(policy.action || '').trim() || null,
    taskId: String(policy.taskId || '').trim() || null,
    parentTaskId: String(policy.parentTaskId || policy.parent_task_id || '').trim() || null,
    projectKey: String(policy.projectKey || '').trim() || null,
    projectPath: String(policy.projectPath || '').trim() || null,
    decision,
    status,
    reasons: uniqueStrings(policy.reasons || []).slice(0, 12),
    policy_rule_hits: uniqueStrings(policy.policy_rule_hits || []).slice(0, 16),
    retry_count: Number(policy.retry_count || 0) || 0,
    retry_limit: Number(policy.retry_limit || AUTONOMY_POLICY_DEFAULT_RETRY_LIMIT) || AUTONOMY_POLICY_DEFAULT_RETRY_LIMIT,
    agent_id: agentIdentity.agent_id,
    agent_version: agentIdentity.agent_version,
    attribution: agentIdentity,
    cache_status: String(policy.cache_status || '').trim() || null,
    fix_task_created: Boolean(policy.fix_task_created),
    fix_task_path: String(policy.fix_task_path || '').trim() || null,
    failureKey: String(policy.failureKey || policy.failure_key || '').trim().toLowerCase() || null,
    changedFiles: normalizePathList(policy.changedFiles || policy.changed_files || []),
    candidate_fix: policy.candidate_fix || null,
    queueKey: String(policy.queueKey || '').trim() || null,
    source: String(policy.source || '').trim() || null,
    location: String(policy.location || '').trim() || null,
    taskDir: String(policy.taskDir || '').trim() || null,
    jsonPath: String(policy.jsonPath || '').trim() || null,
    markdownPath: String(policy.markdownPath || '').trim() || null,
    followupTaskId: String(policy.followupTaskId || '').trim() || null,
    followupTaskDir: String(policy.followupTaskDir || '').trim() || null,
    attempt_count: Number(policy.attempt_count || 0) || 0,
    example_messages: uniqueStrings(policy.example_messages || policy.exampleMessages || []).slice(0, 6),
    summary: String(policy.summary || '').trim() || null,
    problemStatement: String(policy.problemStatement || '').trim() || null,
    requestedOutcomes: uniqueStrings(policy.requestedOutcomes || policy.tasks || []).slice(0, 6),
    tasks: uniqueStrings(policy.tasks || policy.requestedOutcomes || []).slice(0, 6),
    constraints: uniqueStrings(policy.constraints || []).slice(0, 8),
    anchorRefs: normalizePathList(policy.anchorRefs || []),
    consumedAt: String(policy.consumedAt || '').trim() || null,
    resolvedAt: String(policy.resolvedAt || '').trim() || null,
    reEscalatedAt: String(policy.reEscalatedAt || '').trim() || null,
    blockedAt: String(policy.blockedAt || '').trim() || null,
    updatedAt: String(policy.updatedAt || '').trim() || null,
    queuedAt: String(policy.queuedAt || '').trim() || null,
    createdAt: String(policy.createdAt || policy.updatedAt || nowIso()).trim(),
  };
}

function summarizeAutonomyPolicyDecision(policy = {}) {
  const normalized = normalizeAutonomyPolicyDecision(policy);
  const firstReason = normalized.reasons[0] || (normalized.decision === 'auto_allowed'
    ? 'Policy allows automatic execution.'
    : 'Policy requires review.');
  return `${normalized.decision} | ${firstReason}`;
}

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function renderFixTaskMarkdown(entry = {}) {
  const agentBlock = renderAgentAttributionBlock(entry.attribution || {
    agent_id: entry.agent_id,
    agent_version: entry.agent_version,
  });
  const lines = [
    '# Autonomy Fix Task',
    '',
    agentBlock,
    '',
    `Status: ${entry.status || 'pending'}`,
    `Decision: ${entry.decision || 'blocked'}`,
    `Stage: ${entry.stage || 'unknown'}`,
    `Action: ${entry.action || 'unknown'}`,
    `Retry count: ${Number(entry.retry_count || 0) || 0}`,
    `Retry limit: ${Number(entry.retry_limit || AUTONOMY_POLICY_DEFAULT_RETRY_LIMIT) || AUTONOMY_POLICY_DEFAULT_RETRY_LIMIT}`,
  ];
  if (entry.taskId) lines.push(`Task: ${entry.taskId}`);
  if (entry.parentTaskId) lines.push(`Parent task: ${entry.parentTaskId}`);
  if (entry.projectKey) lines.push(`Project: ${entry.projectKey}`);
  if (entry.cache_status) lines.push(`Cache status: ${entry.cache_status}`);
  if (entry.jsonPath || entry.markdownPath) {
    lines.push(`Artifact: ${entry.jsonPath || entry.markdownPath}`);
  }
  if (entry.followupTaskId) lines.push(`Follow-up task: ${entry.followupTaskId}`);
  if (entry.location) lines.push(`Location: ${entry.location}`);
  if ((entry.reasons || []).length) {
    lines.push('', '## Reasons');
    entry.reasons.forEach((reason) => lines.push(`- ${reason}`));
  }
  if ((entry.policy_rule_hits || []).length) {
    lines.push('', '## Policy Hits');
    entry.policy_rule_hits.forEach((hit) => lines.push(`- ${hit}`));
  }
  if (entry.candidate_fix?.id) {
    lines.push('', '## Candidate Fix');
    lines.push(`- ${entry.candidate_fix.title || entry.candidate_fix.id}`);
    if (entry.candidate_fix.pattern) lines.push(`- Pattern: ${entry.candidate_fix.pattern}`);
  }
  if ((entry.changedFiles || []).length) {
    lines.push('', '## Changed Files');
    entry.changedFiles.forEach((filePath) => lines.push(`- ${filePath}`));
  }
  if ((entry.example_messages || []).length) {
    lines.push('', '## Example Messages');
    entry.example_messages.forEach((message) => lines.push(`- ${message}`));
  }
  return lines.join('\n').trimEnd() + '\n';
}

function renderFixTaskQueueMarkdown(queue = {}) {
  const entries = Array.isArray(queue.entries) ? queue.entries : [];
  const lines = [
    '# Autonomy Fix Task Queue',
    '',
    'Review-only bounded fix proposals queued from deterministic policy checks.',
    '',
    `Version: ${String(queue.version || AUTONOMY_POLICY_VERSION).trim() || AUTONOMY_POLICY_VERSION}`,
    `Updated: ${queue.updatedAt || nowIso()}`,
    '',
  ];
  if (!entries.length) {
    lines.push('- (none yet)');
  } else {
    entries.forEach((entry) => {
      lines.push(`### ${entry.taskId || entry.queueKey || 'policy-fix'}`);
      lines.push(`- Agent: ${entry.agent_id || 'dave'}${entry.agent_version ? ` (${entry.agent_version})` : ''}`);
      lines.push(`- Status: ${entry.status || 'pending'}`);
      lines.push(`- Decision: ${entry.decision || 'blocked'}`);
      lines.push(`- Stage: ${entry.stage || 'unknown'}`);
      lines.push(`- Action: ${entry.action || 'unknown'}`);
      lines.push(`- Retry count: ${Number(entry.retry_count || 0) || 0}`);
      lines.push(`- Retry limit: ${Number(entry.retry_limit || AUTONOMY_POLICY_DEFAULT_RETRY_LIMIT) || AUTONOMY_POLICY_DEFAULT_RETRY_LIMIT}`);
      if ((entry.reasons || []).length) lines.push(`- Reasons: ${entry.reasons.join(' | ')}`);
      if (entry.jsonPath || entry.markdownPath || entry.fix_task_path) lines.push(`- Artifact: ${entry.jsonPath || entry.markdownPath || entry.fix_task_path}`);
      if (entry.followupTaskId) lines.push(`- Follow-up task: ${entry.followupTaskId}`);
      if (entry.candidate_fix?.id) lines.push(`- Candidate fix: ${entry.candidate_fix.title || entry.candidate_fix.id}`);
      lines.push('');
    });
  }
  return lines.join('\n').trimEnd() + '\n';
}

function candidateFixForFailureKey(rootPath, failureKey) {
  const normalizedKey = String(failureKey || '').trim().toLowerCase();
  if (!normalizedKey) return null;
  const candidates = readKnownFixCandidates(rootPath).library.entries || [];
  return candidates.find((entry) => String(entry.failureKey || '').trim().toLowerCase() === normalizedKey) || null;
}

function buildAutonomyPolicyFixTaskEntry({
  taskId = null,
  parentTaskId = null,
  stage = null,
  action = null,
  decision = 'blocked',
  status = 'pending',
  reasons = [],
  policy_rule_hits = [],
  retry_count = 0,
  retry_limit = AUTONOMY_POLICY_DEFAULT_RETRY_LIMIT,
  projectKey = null,
  projectPath = null,
  cache_status = null,
  changedFiles = [],
  failureKey = null,
  candidate_fix = null,
  location = null,
  taskDir = null,
  jsonPath = null,
  markdownPath = null,
  followupTaskId = null,
  followupTaskDir = null,
  attempt_count = 0,
  example_messages = [],
  consumedAt = null,
  resolvedAt = null,
  reEscalatedAt = null,
  blockedAt = null,
  updatedAt = null,
  queuedAt = null,
  source = 'autonomy-policy',
} = {}) {
  return normalizeAutonomyPolicyDecision({
    version: AUTONOMY_POLICY_VERSION,
    taskId,
    parentTaskId: parentTaskId || taskId || null,
    stage,
    action,
    decision,
    status,
    reasons,
    policy_rule_hits,
    retry_count,
    retry_limit,
    projectKey,
    projectPath,
    cache_status,
    changedFiles: normalizePathList(changedFiles),
    failureKey: String(failureKey || '').trim().toLowerCase() || null,
    candidate_fix,
    location,
    taskDir,
    jsonPath,
    markdownPath,
    followupTaskId,
    followupTaskDir,
    attempt_count,
    example_messages,
    consumedAt,
    resolvedAt,
    reEscalatedAt,
    blockedAt,
    updatedAt,
    queuedAt,
    source,
    createdAt: nowIso(),
    ...attachAgentAttribution({}, resolveStageAgentIdentity('autonomy-policy')),
  });
}

function upsertFixTaskQueue(rootPath, entry = {}) {
  const queueDir = path.join(rootPath || process.cwd(), AUTONOMY_POLICY_RELATIVE_DIR);
  const queuePath = path.join(queueDir, AUTONOMY_POLICY_FIX_QUEUE_JSON_NAME);
  const queueMarkdownPath = path.join(queueDir, AUTONOMY_POLICY_FIX_QUEUE_MD_NAME);
  const existing = normalizeFixTaskQueue(readJson(queuePath, {
    version: AUTONOMY_POLICY_VERSION,
    updatedAt: null,
    entries: [],
  }) || {});
  const normalizedEntry = buildAutonomyPolicyFixTaskEntry(entry);
  const queueKey = normalizedEntry.taskId
    ? `${normalizedEntry.taskId}:${normalizedEntry.stage || 'unknown'}:${normalizedEntry.action || 'unknown'}`
    : `${normalizedEntry.stage || 'unknown'}:${normalizedEntry.action || 'unknown'}:${normalizedEntry.retry_count || 0}`;
  const nextEntries = [...existing.entries];
  const existingIndex = nextEntries.findIndex((item) => item.queueKey === queueKey);
  const nextEntry = {
    ...normalizedEntry,
    queueKey,
    updatedAt: nowIso(),
    queuedAt: nextEntries[existingIndex]?.queuedAt || nowIso(),
  };
  if (existingIndex >= 0) nextEntries[existingIndex] = nextEntry;
  else nextEntries.unshift(nextEntry);
  const nextQueue = normalizeFixTaskQueue({
    version: AUTONOMY_POLICY_VERSION,
    updatedAt: nowIso(),
    entries: nextEntries.slice(0, AUTONOMY_POLICY_FIX_QUEUE_LIMIT),
  });
  writeJson(queuePath, nextQueue);
  fs.writeFileSync(queueMarkdownPath, renderFixTaskQueueMarkdown(nextQueue), 'utf8');
  return {
    location: 'queue',
    jsonPath: queuePath,
    markdownPath: queueMarkdownPath,
    entry: nextEntry,
    queue: nextQueue,
  };
}

function normalizeFixTaskQueue(queue = {}) {
  const entries = Array.isArray(queue.entries) ? queue.entries : [];
  return {
    version: String(queue.version || AUTONOMY_POLICY_VERSION).trim() || AUTONOMY_POLICY_VERSION,
    updatedAt: queue.updatedAt || null,
    entries: entries.map((entry) => normalizeAutonomyPolicyDecision(entry)),
  };
}

function writeInlineFixTaskArtifact(taskDir, entry = {}) {
  const normalizedEntry = buildAutonomyPolicyFixTaskEntry(entry);
  const jsonPath = path.join(taskDir, AUTONOMY_POLICY_FIX_TASK_JSON_NAME);
  const markdownPath = path.join(taskDir, AUTONOMY_POLICY_FIX_TASK_MD_NAME);
  const payload = {
    ...normalizedEntry,
    location: 'task',
    updatedAt: nowIso(),
    attribution: normalizeAgentIdentity(normalizedEntry),
  };
  writeJson(jsonPath, payload);
  fs.writeFileSync(markdownPath, renderFixTaskMarkdown(payload), 'utf8');
  return {
    location: 'task',
    jsonPath,
    markdownPath,
    entry: payload,
  };
}

function createBoundedFixTaskArtifact(rootPath, options = {}) {
  const taskDir = String(options.taskDir || '').trim();
  const taskId = String(options.taskId || '').trim() || null;
  const normalizedTaskDir = taskDir ? path.resolve(taskDir) : null;
  const taskDirRelative = normalizedTaskDir ? relativeToRoot(rootPath, normalizedTaskDir) : null;
  const taskJsonPathRelative = taskDirRelative ? path.posix.join(taskDirRelative, AUTONOMY_POLICY_FIX_TASK_JSON_NAME) : null;
  const taskMarkdownPathRelative = taskDirRelative ? path.posix.join(taskDirRelative, AUTONOMY_POLICY_FIX_TASK_MD_NAME) : null;
  const entry = {
    ...options,
    taskId,
    parentTaskId: String(options.parentTaskId || options.parent_task_id || taskId || '').trim() || taskId,
    status: String(options.status || 'pending').trim() || 'pending',
    retry_count: Number(options.retryCount ?? options.retry_count ?? 0) || 0,
    retry_limit: Number(options.retryLimit ?? options.retry_limit ?? AUTONOMY_POLICY_DEFAULT_RETRY_LIMIT) || AUTONOMY_POLICY_DEFAULT_RETRY_LIMIT,
    changedFiles: normalizePathList(options.changedFiles || []),
    candidate_fix: options.candidateFix || options.candidate_fix || candidateFixForFailureKey(rootPath, options.failureKey || options.failure_key),
    location: taskDir ? 'task' : 'queue',
    taskDir: taskDirRelative || null,
    jsonPath: taskJsonPathRelative || null,
    markdownPath: taskMarkdownPathRelative || null,
    followupTaskId: String(options.followupTaskId || '').trim() || null,
    followupTaskDir: String(options.followupTaskDir || '').trim() || null,
    attempt_count: Number(options.attemptCount ?? options.attempt_count ?? 0) || 0,
    example_messages: uniqueStrings(options.exampleMessages || options.example_messages || []),
    consumedAt: String(options.consumedAt || '').trim() || null,
    resolvedAt: String(options.resolvedAt || '').trim() || null,
    reEscalatedAt: String(options.reEscalatedAt || '').trim() || null,
    blockedAt: String(options.blockedAt || '').trim() || null,
    updatedAt: String(options.updatedAt || '').trim() || null,
    queuedAt: String(options.queuedAt || '').trim() || null,
    source: String(options.source || 'fix_task').trim() || 'fix_task',
    agent_id: String(options.agent_id || options.agentId || 'autonomy-policy').trim() || 'autonomy-policy',
    agent_version: String(options.agent_version || options.agentVersion || AUTONOMY_POLICY_VERSION).trim() || AUTONOMY_POLICY_VERSION,
  };
  if (taskDir && fs.existsSync(taskDir)) {
    return writeInlineFixTaskArtifact(taskDir, entry);
  }
  return upsertFixTaskQueue(rootPath, entry);
}

function evaluateAutonomyPolicy({
  rootPath = null,
  stage = 'executor',
  action = null,
  taskId = null,
  projectKey = null,
  projectPath = null,
  preflight = null,
  taskCache = null,
  validation = null,
  changedFiles = [],
  patchText = '',
  patchValid = null,
  patchPath = null,
  retryCount = null,
  retryLimit = AUTONOMY_POLICY_DEFAULT_RETRY_LIMIT,
  failureKey = null,
  failureMessage = '',
  allowlistPaths = null,
  disallowedPaths = [],
  requiredFilesMissing = [],
  repoInvalid = null,
  validationCommandExists = null,
  patchEmpty = null,
  ambiguous = null,
  cacheStatus = null,
  failureRisky = false,
} = {}) {
  const normalizedStage = String(stage || '').trim().toLowerCase() || 'executor';
  const normalizedAction = String(action || normalizedStage).trim() || normalizedStage;
  const normalizedProjectKey = String(projectKey || '').trim();
  const normalizedProjectPath = String(projectPath || '').trim();
  const projectResolved = Boolean(normalizedProjectKey && normalizedProjectPath && fs.existsSync(normalizedProjectPath));
  const reasons = [];
  const policyRuleHits = [];
  const normalizedAllowlist = normalizePathList(allowlistPaths || stageAllowlist(normalizedStage));
  const normalizedChangedFiles = normalizePathList(changedFiles);
  const normalizedDisallowedPaths = normalizePathList(disallowedPaths);
  const normalizedPatchText = String(patchText || '').trim();
  const normalizedFailureKey = String(failureKey || normalizeFailureKey(failureMessage || '', {
    stage: normalizedStage,
    tool: normalizedAction,
  }) || '').trim().toLowerCase() || null;
  const effectiveCacheStatus = String(cacheStatus || taskCache?.source || '').trim().toLowerCase() || null;
  const cacheReused = effectiveCacheStatus === 'reused' || taskCache?.source === 'cache_hit';
  const effectiveRetryCount = resolveRetryCount({
    rootPath,
    failureKey: normalizedFailureKey,
    retryCount,
  });
  const patchRequired = ['executor', 'apply', 'rebuild', 'self-upgrade'].includes(normalizedStage)
    || /apply|rebuild|executor/i.test(normalizedAction);

  let decision = 'auto_allowed';

  if (projectResolved) {
    policyRuleHits.push('project_resolved');
  } else {
    decision = 'blocked';
    reasons.push('Project key could not be resolved to a concrete project path.');
    policyRuleHits.push('missing_project_key');
  }

  if (Array.isArray(requiredFilesMissing) && requiredFilesMissing.length) {
    decision = 'blocked';
    reasons.push(`Required files missing: ${uniqueStrings(requiredFilesMissing).join(', ')}`);
    policyRuleHits.push('missing_required_files');
  }

  const repoCleanOk = repoInvalid === null
    ? Boolean(preflight?.checks?.repoClean?.ok !== false)
    : !repoInvalid;
  if (repoCleanOk) {
    policyRuleHits.push('repo_preflight_ok');
  } else {
    decision = 'blocked';
    reasons.push(String(preflight?.checks?.repoClean?.message || 'Repository state is invalid.'));
    policyRuleHits.push('repo_invalid');
  }

  const validationCommandOk = validationCommandExists === null
    ? Boolean(preflight?.checks?.validationCommand?.ok !== false)
    : Boolean(validationCommandExists);
  if (validationCommandOk) {
    policyRuleHits.push('validation_command_exists');
  } else {
    decision = 'blocked';
    reasons.push(String(preflight?.checks?.validationCommand?.message || 'Validation command is missing.'));
    policyRuleHits.push('validation_command_missing');
  }

  const patchIsValid = patchValid === null
    ? !taskCache || taskCache.source !== 'cache_invalid'
    : Boolean(patchValid);
  const patchIsEmpty = patchEmpty === null
    ? !normalizedPatchText && normalizedChangedFiles.length === 0
    : Boolean(patchEmpty);
  if (!patchRequired) {
    policyRuleHits.push('patch_not_required');
  } else if (cacheReused && !normalizedPatchText && !normalizedChangedFiles.length && patchValid === null && patchEmpty === null) {
    policyRuleHits.push('patch_valid');
    policyRuleHits.push('cache_reused');
  } else if (!normalizedPatchText && !normalizedChangedFiles.length && patchValid === null && patchEmpty === null) {
    policyRuleHits.push('patch_not_required');
  } else if (patchIsValid && !patchIsEmpty) {
    policyRuleHits.push('patch_valid');
  } else {
    decision = 'blocked';
    reasons.push('Patch is empty or invalid.');
    policyRuleHits.push('patch_invalid');
  }

  const preflightBlockers = uniqueStrings(preflight?.blockers || []);
  const cacheReuseBlockers = preflightBlockers.filter((blocker) => /cached patch already exists|reuse the cached task artefact|rebuild skipped/i.test(blocker));
  const preflightPasses = Boolean(preflight?.ok) || (cacheReused && cacheReuseBlockers.length === preflightBlockers.length);
  if (preflightPasses) {
    policyRuleHits.push(cacheReused ? 'cache_reused' : 'preflight_passed');
  } else if (decision !== 'blocked') {
    decision = 'blocked';
    reasons.push(preflight?.summary || preflightBlockers[0] || 'Preflight checks failed.');
    policyRuleHits.push('preflight_failed');
  }

  const notAllowlisted = normalizedChangedFiles.length
    ? normalizedChangedFiles.filter((filePath) => !isPathAllowed(filePath, normalizedAllowlist))
    : [];
  if (!normalizedChangedFiles.length || notAllowlisted.length === 0) {
    if (normalizedChangedFiles.length) {
      policyRuleHits.push('allowlisted_paths');
    }
  } else if (decision !== 'blocked') {
    decision = 'escalate';
    reasons.push(`Disallowed path scope: ${notAllowlisted.join(', ')}`);
    policyRuleHits.push('touches_disallowed_paths');
  }

  const explicitDisallowed = normalizedDisallowedPaths.filter(Boolean);
  if (explicitDisallowed.length && decision !== 'blocked') {
    decision = 'escalate';
    reasons.push(`Disallowed paths were requested: ${explicitDisallowed.join(', ')}`);
    policyRuleHits.push('touches_disallowed_paths');
  }

  const deleteDetected = detectPatchDeletes(normalizedPatchText);
  if (deleteDetected && decision !== 'blocked') {
    decision = 'escalate';
    reasons.push('Patch would delete files.');
    policyRuleHits.push('deletes_detected');
  }

  const ambiguousState = ambiguous === null
    ? (normalizedStage === 'apply' && Boolean(normalizedPatchText) && !normalizedChangedFiles.length)
    : Boolean(ambiguous);
  if (ambiguousState && decision !== 'blocked') {
    decision = 'escalate';
    reasons.push('Patch/apply state is ambiguous.');
    policyRuleHits.push('patch_ambiguous');
  }

  const retryLimitValue = Number.isFinite(Number(retryLimit)) ? Number(retryLimit) : AUTONOMY_POLICY_DEFAULT_RETRY_LIMIT;
  if (effectiveRetryCount >= retryLimitValue && decision !== 'blocked') {
    decision = 'escalate';
    reasons.push(`Retry count ${effectiveRetryCount} reached the limit of ${retryLimitValue}.`);
    policyRuleHits.push('retry_threshold_exceeded');
  } else {
    policyRuleHits.push('retry_limit_ok');
  }

  if (normalizedFailureKey === 'unknown_failure' && decision !== 'blocked' && (failureRisky || effectiveRetryCount > 0 || notAllowlisted.length || ambiguousState)) {
    decision = 'escalate';
    reasons.push('Failure class is unknown and risky.');
    policyRuleHits.push('unknown_failure_risky');
  }

  if (decision === 'auto_allowed' && cacheReused) {
    reasons.push('Cached patch reuse is safe for this bounded action.');
  }

  return normalizeAutonomyPolicyDecision({
    version: AUTONOMY_POLICY_VERSION,
    stage: normalizedStage,
    action: normalizedAction,
    taskId,
    projectKey: normalizedProjectKey || null,
    projectPath: normalizedProjectPath || null,
    decision,
    reasons,
    policy_rule_hits: policyRuleHits,
    retry_count: effectiveRetryCount,
    cache_status: cacheReused ? 'reused' : (effectiveCacheStatus || null),
    patchPath,
    candidate_fix: candidateFixForFailureKey(rootPath, normalizedFailureKey),
    createdAt: nowIso(),
  });
}

module.exports = {
  AUTONOMY_POLICY_ALLOWLIST,
  AUTONOMY_POLICY_DEFAULT_RETRY_LIMIT,
  AUTONOMY_POLICY_FIX_QUEUE_JSON_NAME,
  AUTONOMY_POLICY_FIX_QUEUE_MD_NAME,
  AUTONOMY_POLICY_FIX_TASK_JSON_NAME,
  AUTONOMY_POLICY_FIX_TASK_MD_NAME,
  AUTONOMY_POLICY_RELATIVE_DIR,
  AUTONOMY_POLICY_VERSION,
  buildAutonomyPolicyFixTaskEntry,
  candidateFixForFailureKey,
  collectDisallowedPaths,
  createBoundedFixTaskArtifact,
  detectPatchAmbiguity,
  detectPatchDeletes,
  evaluateAutonomyPolicy,
  isPathAllowed,
  lookupFailureHistoryCount,
  normalizeAutonomyPolicyDecision,
  normalizePathList,
  renderFixTaskMarkdown,
  renderFixTaskQueueMarkdown,
  resolveRetryCount,
  stageAllowlist,
  summarizeAutonomyPolicyDecision,
  upsertFixTaskQueue,
};
