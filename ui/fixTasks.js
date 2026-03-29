const fs = require('fs');
const path = require('path');
const {
  AUTONOMY_POLICY_DEFAULT_RETRY_LIMIT,
  AUTONOMY_POLICY_FIX_QUEUE_JSON_NAME,
  AUTONOMY_POLICY_FIX_QUEUE_MD_NAME,
  AUTONOMY_POLICY_FIX_TASK_JSON_NAME,
  AUTONOMY_POLICY_FIX_TASK_MD_NAME,
  AUTONOMY_POLICY_RELATIVE_DIR,
  AUTONOMY_POLICY_VERSION,
  createBoundedFixTaskArtifact,
  evaluateAutonomyPolicy,
  normalizeAutonomyPolicyDecision,
  normalizePathList,
  summarizeAutonomyPolicyDecision,
} = require('./autonomyPolicy');
const {
  normalizeAgentIdentity,
  resolveStageAgentIdentity,
} = require('./agentAttribution');

const FIX_TASK_LIFECYCLE_STATES = Object.freeze({
  PENDING: 'pending',
  CONSUMED: 'consumed',
  RESOLVED: 'resolved',
  RE_ESCALATED: 're_escalated',
  BLOCKED: 'blocked',
});

function nowIso() {
  return new Date().toISOString();
}

function readJson(filePath, fallback = null) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function uniqueStrings(values = []) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function relativeToRoot(rootPath, targetPath) {
  if (!rootPath || !targetPath) return null;
  return path.relative(rootPath, targetPath).replace(/\\/g, '/');
}

function fixTasksDir(rootPath) {
  return path.join(rootPath || process.cwd(), 'work', 'tasks');
}

function fixTaskQueuePaths(rootPath) {
  const queueDir = path.join(rootPath || process.cwd(), AUTONOMY_POLICY_RELATIVE_DIR);
  return {
    jsonPathAbs: path.join(queueDir, AUTONOMY_POLICY_FIX_QUEUE_JSON_NAME),
    markdownPathAbs: path.join(queueDir, AUTONOMY_POLICY_FIX_QUEUE_MD_NAME),
  };
}

function normalizeLifecycleStatus(value = '') {
  const status = String(value || '').trim().toLowerCase();
  if (Object.values(FIX_TASK_LIFECYCLE_STATES).includes(status)) return status;
  return FIX_TASK_LIFECYCLE_STATES.PENDING;
}

function normalizeFixTaskRecord(raw = {}, meta = {}) {
  const location = String(raw.location || meta.location || '').trim().toLowerCase() || (meta.taskDirAbs ? 'task' : 'queue');
  const status = normalizeLifecycleStatus(raw.status);
  const agentIdentity = normalizeAgentIdentity({
    agent_id: raw.agent_id || raw.agentId || raw.attribution?.agent_id || raw.attribution?.agentId || null,
    agent_version: raw.agent_version || raw.agentVersion || raw.attribution?.agent_version || raw.attribution?.agentVersion || null,
  }, resolveStageAgentIdentity(raw.stage || raw.action || 'autonomy-policy'));
  const taskId = String(raw.taskId || meta.taskId || '').trim() || null;
  const parentTaskId = String(raw.parentTaskId || raw.parent_task_id || taskId || '').trim() || null;
  const retryCount = Number(raw.retry_count ?? raw.retryCount ?? 0) || 0;
  const retryLimit = Number(raw.retry_limit ?? raw.retryLimit ?? AUTONOMY_POLICY_DEFAULT_RETRY_LIMIT) || AUTONOMY_POLICY_DEFAULT_RETRY_LIMIT;
  const reasons = uniqueStrings(raw.reasons || (raw.reason ? [raw.reason] : []));
  const policyRuleHits = uniqueStrings(raw.policy_rule_hits || raw.policyRuleHits || []);
  const changedFiles = normalizePathList(raw.changedFiles || raw.changed_files || []);
  const exampleMessages = uniqueStrings(raw.example_messages || raw.exampleMessages || []);
  const candidateFix = raw.candidate_fix || raw.candidateFix || null;
  const taskDirAbs = meta.taskDirAbs || null;
  const jsonPathAbs = meta.jsonPathAbs || null;
  const markdownPathAbs = meta.markdownPathAbs || null;
  const queueKey = String(raw.queueKey || meta.queueKey || '').trim() || null;
  const createdAt = String(raw.createdAt || raw.queuedAt || meta.createdAt || nowIso()).trim();
  const updatedAt = String(raw.updatedAt || raw.queuedAt || raw.createdAt || meta.updatedAt || createdAt).trim();
  const consumedAt = String(raw.consumedAt || '').trim() || null;
  const resolvedAt = String(raw.resolvedAt || '').trim() || null;
  const reEscalatedAt = String(raw.reEscalatedAt || '').trim() || null;
  const blockedAt = String(raw.blockedAt || '').trim() || null;
  const sourcePaths = uniqueStrings([
    raw.jsonPath || null,
    raw.markdownPath || null,
    relativeToRoot(meta.rootPath, jsonPathAbs),
    relativeToRoot(meta.rootPath, markdownPathAbs),
  ]);
  const anchorRefs = uniqueStrings([
    ...changedFiles,
    ...sourcePaths,
  ]);
  const summary = String(raw.summary || raw.problemStatement || candidateFix?.title || reasons[0] || `Fix task ${taskId || queueKey || 'pending'}`).trim();
  const problemStatement = String(raw.problemStatement || raw.summary || summary).trim();
  const requestedOutcomes = uniqueStrings(raw.requestedOutcomes || raw.tasks || [summary]).slice(0, 4);
  const constraints = uniqueStrings(raw.constraints || reasons).slice(0, 8);
  const followupTaskId = String(raw.followupTaskId || '').trim() || null;
  const followupTaskDir = String(raw.followupTaskDir || '').trim() || null;

  const normalized = normalizeAutonomyPolicyDecision({
    ...raw,
    version: String(raw.version || AUTONOMY_POLICY_VERSION).trim() || AUTONOMY_POLICY_VERSION,
    source: String(raw.source || 'fix_task').trim() || 'fix_task',
    location,
    agent_id: agentIdentity.agent_id,
    agent_version: agentIdentity.agent_version,
    attribution: agentIdentity,
    status,
    taskId,
    parentTaskId,
    retry_count: retryCount,
    retry_limit: retryLimit,
    reasons,
    policy_rule_hits: policyRuleHits,
    changedFiles,
    example_messages: exampleMessages,
    candidate_fix: candidateFix,
    queueKey,
    taskDir: relativeToRoot(meta.rootPath, taskDirAbs) || String(raw.taskDir || '').trim() || null,
    jsonPath: relativeToRoot(meta.rootPath, jsonPathAbs) || String(raw.jsonPath || '').trim() || null,
    markdownPath: relativeToRoot(meta.rootPath, markdownPathAbs) || String(raw.markdownPath || '').trim() || null,
    followupTaskId,
    followupTaskDir,
    consumedAt,
    resolvedAt,
    reEscalatedAt,
    blockedAt,
    updatedAt,
    queuedAt: String(raw.queuedAt || raw.createdAt || '').trim() || null,
    attempt_count: Number(raw.attempt_count || raw.attemptCount || 0) || 0,
    projectKey: String(raw.projectKey || '').trim() || null,
    projectPath: String(raw.projectPath || '').trim() || null,
    failureKey: String(raw.failureKey || raw.failure_key || '').trim().toLowerCase() || null,
    failureMessage: String(raw.failureMessage || raw.error || '').trim() || null,
    summary,
    problemStatement,
    requestedOutcomes,
    tasks: requestedOutcomes,
    constraints,
    anchorRefs,
  });
  return {
    ...normalized,
    rootPath: meta.rootPath || null,
    taskDirPath: taskDirAbs,
    jsonPathAbs,
    markdownPathAbs,
  };
}

function readFixTaskQueue(rootPath) {
  const { jsonPathAbs, markdownPathAbs } = fixTaskQueuePaths(rootPath);
  const raw = readJson(jsonPathAbs, {
    version: AUTONOMY_POLICY_VERSION,
    updatedAt: null,
    entries: [],
  }) || {};
  const entries = Array.isArray(raw.entries) ? raw.entries : [];
  return {
    jsonPathAbs,
    markdownPathAbs,
    jsonPath: relativeToRoot(rootPath, jsonPathAbs),
    markdownPath: relativeToRoot(rootPath, markdownPathAbs),
    queue: {
      version: String(raw.version || AUTONOMY_POLICY_VERSION).trim() || AUTONOMY_POLICY_VERSION,
      updatedAt: raw.updatedAt || null,
      entries: entries
        .map((entry) => normalizeFixTaskRecord(entry, {
          rootPath,
          location: 'queue',
          queueKey: entry?.queueKey || null,
          jsonPathAbs,
          markdownPathAbs,
        }))
        .filter((entry) => entry.status),
    },
  };
}

function readTaskFixTask(rootPath, taskDirAbs) {
  const jsonPathAbs = path.join(taskDirAbs, AUTONOMY_POLICY_FIX_TASK_JSON_NAME);
  if (!fs.existsSync(jsonPathAbs)) return null;
  const raw = readJson(jsonPathAbs, null);
  if (!raw) return null;
  const markdownPathAbs = path.join(taskDirAbs, AUTONOMY_POLICY_FIX_TASK_MD_NAME);
  return normalizeFixTaskRecord(raw, {
    rootPath,
    location: 'task',
    taskDirAbs,
    jsonPathAbs,
    markdownPathAbs,
    taskId: raw.taskId || path.basename(taskDirAbs).slice(0, 4) || null,
  });
}

function readFixTaskArtifacts(rootPath) {
  const discovered = [];
  const taskDir = fixTasksDir(rootPath);
  const byTaskId = new Map();
  if (fs.existsSync(taskDir)) {
    for (const entry of fs.readdirSync(taskDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^\d{4}-.+/.test(entry.name)) continue;
      const taskDirAbs = path.join(taskDir, entry.name);
      const fixTask = readTaskFixTask(rootPath, taskDirAbs);
      if (!fixTask) continue;
      if (fixTask.taskId) byTaskId.set(fixTask.taskId, fixTask);
      discovered.push(fixTask);
    }
  }

  const queue = readFixTaskQueue(rootPath);
  for (const entry of queue.queue.entries) {
    if (entry.status !== FIX_TASK_LIFECYCLE_STATES.PENDING) continue;
    if (entry.taskId && byTaskId.has(entry.taskId)) continue;
    discovered.push(entry);
  }

  return discovered
    .filter((entry) => entry.status === FIX_TASK_LIFECYCLE_STATES.PENDING)
    .sort((left, right) => String(left.createdAt || left.updatedAt || '').localeCompare(String(right.createdAt || right.updatedAt || '')));
}

function readPendingFixTasks(rootPath) {
  return readFixTaskArtifacts(rootPath);
}

function fixTaskUpdateOptions(fixTask, patch = {}) {
  return {
    taskId: fixTask.taskId || patch.taskId || null,
    parentTaskId: patch.parentTaskId || fixTask.parentTaskId || fixTask.taskId || null,
    stage: patch.stage || fixTask.stage || null,
    action: patch.action || fixTask.action || null,
    decision: patch.decision || fixTask.decision || 'blocked',
    status: patch.status || fixTask.status || FIX_TASK_LIFECYCLE_STATES.PENDING,
    reasons: patch.reasons || fixTask.reasons || [],
    policy_rule_hits: patch.policy_rule_hits || fixTask.policy_rule_hits || [],
    retry_count: patch.retry_count ?? fixTask.retry_count ?? 0,
    retry_limit: patch.retry_limit ?? fixTask.retry_limit ?? AUTONOMY_POLICY_DEFAULT_RETRY_LIMIT,
    projectKey: patch.projectKey || fixTask.projectKey || null,
    projectPath: patch.projectPath || fixTask.projectPath || null,
    cache_status: patch.cache_status || fixTask.cache_status || null,
    changedFiles: patch.changedFiles || fixTask.changedFiles || [],
    failureKey: patch.failureKey || fixTask.failureKey || null,
    candidateFix: patch.candidateFix || patch.candidate_fix || fixTask.candidate_fix || null,
    agent_id: patch.agent_id || fixTask.agent_id || fixTask.attribution?.agent_id || null,
    agent_version: patch.agent_version || fixTask.agent_version || fixTask.attribution?.agent_version || null,
    location: fixTask.location || null,
    taskDir: fixTask.location === 'task' ? (fixTask.taskDirPath || null) : null,
    jsonPath: fixTask.jsonPath || null,
    markdownPath: fixTask.markdownPath || null,
    followupTaskId: patch.followupTaskId ?? fixTask.followupTaskId ?? null,
    followupTaskDir: patch.followupTaskDir ?? fixTask.followupTaskDir ?? null,
    attemptCount: Number(patch.attemptCount ?? patch.attempt_count ?? fixTask.attempt_count ?? 0) || 0,
    exampleMessages: patch.exampleMessages || patch.example_messages || fixTask.example_messages || [],
    consumedAt: patch.consumedAt ?? fixTask.consumedAt ?? null,
    resolvedAt: patch.resolvedAt ?? fixTask.resolvedAt ?? null,
    reEscalatedAt: patch.reEscalatedAt ?? fixTask.reEscalatedAt ?? null,
    blockedAt: patch.blockedAt ?? fixTask.blockedAt ?? null,
    updatedAt: patch.updatedAt || nowIso(),
    queuedAt: fixTask.queuedAt || fixTask.createdAt || null,
    source: 'fix_task',
  };
}

function persistFixTaskState(rootPath, fixTask, patch = {}) {
  const nextOptions = fixTaskUpdateOptions(fixTask, patch);
  const artifact = createBoundedFixTaskArtifact(rootPath, nextOptions);
  return normalizeFixTaskRecord(artifact.entry || nextOptions, {
    rootPath,
    location: artifact.location || fixTask.location || null,
    taskDirAbs: artifact.location === 'task' ? (fixTask.taskDirPath || path.dirname(artifact.jsonPath)) : null,
    jsonPathAbs: artifact.jsonPath || null,
    markdownPathAbs: artifact.markdownPath || null,
    taskId: nextOptions.taskId || fixTask.taskId || null,
    queueKey: artifact.entry?.queueKey || fixTask.queueKey || null,
  });
}

function buildFixTaskPromptSection(fixTask = {}) {
  const normalized = fixTask && typeof fixTask === 'object' ? fixTask : null;
  if (!normalized) return '';
  const status = String(normalized.status || '').trim();
  const title = String(normalized.title || normalized.summary || '').trim();
  const lines = [
    '## Fix Task Intake',
    `Agent: ${normalized.agent_id || 'dave'}${normalized.agent_version ? ` (${normalized.agent_version})` : ''}`,
    `Status: ${status || FIX_TASK_LIFECYCLE_STATES.PENDING}`,
    `Location: ${normalized.location || 'unknown'}`,
    `Task: ${normalized.taskId || normalized.queueKey || 'unknown'}`,
    `Parent task: ${normalized.parentTaskId || 'none'}`,
    `Stage: ${normalized.stage || 'unknown'}`,
    `Action: ${normalized.action || 'unknown'}`,
    `Retry count: ${Number(normalized.retry_count || 0) || 0}`,
    `Retry limit: ${Number(normalized.retry_limit || AUTONOMY_POLICY_DEFAULT_RETRY_LIMIT) || AUTONOMY_POLICY_DEFAULT_RETRY_LIMIT}`,
  ];
  if (normalized.failureKey) lines.push(`Failure key: ${normalized.failureKey}`);
  if (normalized.projectKey) lines.push(`Project: ${normalized.projectKey}`);
  if (title) lines.push(`Title: ${title}`);
  if (normalized.problemStatement) {
    lines.push('', 'Problem statement:', normalized.problemStatement);
  } else if (normalized.summary) {
    lines.push('', 'Summary:', normalized.summary);
  }
  if ((normalized.reasons || []).length) {
    lines.push('', 'Reasons:');
    normalized.reasons.forEach((reason) => lines.push(`- ${reason}`));
  }
  if ((normalized.changedFiles || []).length) {
    lines.push('', 'Changed files:');
    normalized.changedFiles.forEach((filePath) => lines.push(`- ${filePath}`));
  }
  if (normalized.candidate_fix?.id) {
    lines.push('', 'Candidate fix:');
    lines.push(`- ${normalized.candidate_fix.title || normalized.candidate_fix.id}`);
  }
  if (normalized.followupTaskId) lines.push('', `Follow-up task: ${normalized.followupTaskId}`);
  return lines.join('\n').trim();
}

function buildFixTaskPlannerHandoff(rootPath, fixTask = {}, { previousHandoff = null } = {}) {
  const normalized = normalizeFixTaskRecord(fixTask, {
    rootPath,
    location: fixTask.location || null,
    taskDirAbs: fixTask.taskDirPath || null,
    jsonPathAbs: fixTask.jsonPathAbs || null,
    markdownPathAbs: fixTask.markdownPathAbs || null,
    taskId: fixTask.taskId || null,
    queueKey: fixTask.queueKey || null,
  });
  const anchorRefs = uniqueStrings([
    ...normalized.anchorRefs,
    normalized.jsonPath,
    normalized.markdownPath,
  ]).filter(Boolean);
  const requestedOutcomes = normalized.requestedOutcomes.length
    ? normalized.requestedOutcomes
    : [normalized.summary || 'Resolve bounded fix task.'];
  const problemStatement = [
    normalized.problemStatement || normalized.summary,
    normalized.reasons.length ? `Reasons: ${normalized.reasons.join(' | ')}` : null,
    normalized.failureKey ? `Failure key: ${normalized.failureKey}` : null,
    normalized.retry_count > 0 ? `Retry count: ${normalized.retry_count} of ${normalized.retry_limit}.` : null,
  ].filter(Boolean).join('\n');
  return {
    id: previousHandoff?.id && previousHandoff?.sourceFixTaskId === normalized.taskId
      ? previousHandoff.id
      : `fix-${normalized.taskId || normalized.queueKey || Date.now()}`,
    sourceAgentId: 'autonomy-policy',
    targetAgentId: 'planner',
    createdAt: nowIso(),
    sourceFixTaskId: normalized.taskId || null,
    sourceFixTaskParentTaskId: normalized.parentTaskId || normalized.taskId || null,
    sourceFixTaskQueueKey: normalized.queueKey || null,
    sourceFixTaskLocation: normalized.location || null,
    sourceFixTaskStatus: normalized.status,
    sourceFixTaskRetryCount: normalized.retry_count,
    sourceFixTaskRetryLimit: normalized.retry_limit,
    sourceFixTaskAgentId: normalized.agent_id || null,
    sourceFixTaskAgentVersion: normalized.agent_version || null,
    sourceFixTask: normalized,
    status: 'ready',
    summary: normalized.summary || 'Bounded fix task ready for planner review.',
    goal: normalized.summary || 'Resolve bounded fix task.',
    problemStatement,
    anchorRefs: anchorRefs.length ? anchorRefs : uniqueStrings([normalized.jsonPath, normalized.markdownPath]).filter(Boolean),
    requestedOutcomes,
    tasks: requestedOutcomes,
    constraints: uniqueStrings([
      ...normalized.constraints,
      'Keep scope bounded.',
      'Do not widen the retry beyond the current failure.',
    ]).slice(0, 8),
    urgency: 'high',
    requestType: 'execution_request',
    targets: normalized.projectKey ? [normalized.projectKey] : [],
    signals: {
      actionSignals: 1,
      constraintSignals: normalized.constraints.length ? 1 : 0,
    },
    parentHandoffId: previousHandoff?.id || null,
  };
}

function consumePendingFixTask(rootPath, { preflight = null, previousHandoff = null } = {}) {
  const pendingTasks = readPendingFixTasks(rootPath);
  if (!pendingTasks.length) {
    return {
      ok: false,
      skipped: true,
      reason: 'No pending fix tasks.',
      policy: null,
      fixTask: null,
      handoff: null,
    };
  }

  const fixTask = pendingTasks[0];
  const policy = evaluateAutonomyPolicy({
    rootPath,
    stage: 'planner',
    action: 'fix-task-intake',
    taskId: fixTask.taskId,
    projectKey: fixTask.projectKey,
    projectPath: fixTask.projectPath,
    preflight,
    retryCount: fixTask.retry_count,
    retryLimit: fixTask.retry_limit,
    failureKey: fixTask.failureKey,
    failureMessage: fixTask.failureMessage || fixTask.summary || '',
    disallowedPaths: [],
    requiredFilesMissing: [],
    repoInvalid: null,
    validationCommandExists: null,
    patchValid: null,
    patchEmpty: null,
    ambiguous: null,
    cacheStatus: fixTask.cache_status || null,
    failureRisky: Boolean(fixTask.failureRisky || fixTask.retry_count > 0 || String(fixTask.failureKey || '').includes('unknown')),
  });

  if (policy.decision !== 'auto_allowed') {
    const nextStatus = policy.decision === 'blocked'
      ? FIX_TASK_LIFECYCLE_STATES.BLOCKED
      : FIX_TASK_LIFECYCLE_STATES.RE_ESCALATED;
    const updatedFixTask = persistFixTaskState(rootPath, fixTask, {
      status: nextStatus,
      decision: policy.decision,
      reasons: policy.reasons,
      policy_rule_hits: policy.policy_rule_hits,
      retry_count: fixTask.retry_count,
      retry_limit: fixTask.retry_limit,
      consumedAt: fixTask.consumedAt,
      resolvedAt: fixTask.resolvedAt,
      reEscalatedAt: nextStatus === FIX_TASK_LIFECYCLE_STATES.RE_ESCALATED ? nowIso() : fixTask.reEscalatedAt,
      blockedAt: nextStatus === FIX_TASK_LIFECYCLE_STATES.BLOCKED ? nowIso() : fixTask.blockedAt,
      updatedAt: nowIso(),
      source: 'fix_task',
    });
    return {
      ok: false,
      skipped: false,
      accepted: false,
      status: nextStatus,
      reason: summarizeAutonomyPolicyDecision(policy),
      policy,
      fixTask: updatedFixTask,
      handoff: null,
    };
  }

  const consumedFixTask = persistFixTaskState(rootPath, fixTask, {
    status: FIX_TASK_LIFECYCLE_STATES.CONSUMED,
    decision: policy.decision,
    reasons: policy.reasons,
    policy_rule_hits: policy.policy_rule_hits,
    retry_count: fixTask.retry_count,
    retry_limit: fixTask.retry_limit,
    attemptCount: Number(fixTask.attempt_count || 0) + 1,
    consumedAt: nowIso(),
    updatedAt: nowIso(),
    source: 'fix_task',
  });
  const handoff = buildFixTaskPlannerHandoff(rootPath, consumedFixTask, { previousHandoff });
  return {
    ok: true,
    skipped: false,
    accepted: true,
    status: FIX_TASK_LIFECYCLE_STATES.CONSUMED,
    reason: '',
    policy,
    fixTask: consumedFixTask,
    handoff,
  };
}

function finalizeFixTask(rootPath, fixTask, {
  status = FIX_TASK_LIFECYCLE_STATES.RESOLVED,
  reason = null,
  policy = null,
  followupTaskId = null,
  followupTaskDir = null,
} = {}) {
  if (!fixTask) return null;
  const nextStatus = normalizeLifecycleStatus(status);
  const patch = {
    status: nextStatus,
    decision: policy?.decision || fixTask.decision || null,
    reasons: uniqueStrings([
      ...(fixTask.reasons || []),
      ...(policy?.reasons || []),
      reason || null,
    ]),
    policy_rule_hits: uniqueStrings([
      ...(fixTask.policy_rule_hits || []),
      ...(policy?.policy_rule_hits || []),
    ]),
    retry_count: fixTask.retry_count,
    retry_limit: fixTask.retry_limit,
    projectKey: fixTask.projectKey,
    projectPath: fixTask.projectPath,
    changedFiles: fixTask.changedFiles,
    candidateFix: fixTask.candidate_fix,
    failureKey: fixTask.failureKey,
    failureMessage: reason || fixTask.failureMessage || null,
    followupTaskId: followupTaskId ?? fixTask.followupTaskId ?? null,
    followupTaskDir: followupTaskDir ?? fixTask.followupTaskDir ?? null,
    consumedAt: fixTask.consumedAt || (nextStatus === FIX_TASK_LIFECYCLE_STATES.CONSUMED ? nowIso() : null),
    resolvedAt: nextStatus === FIX_TASK_LIFECYCLE_STATES.RESOLVED ? nowIso() : (fixTask.resolvedAt || null),
    reEscalatedAt: nextStatus === FIX_TASK_LIFECYCLE_STATES.RE_ESCALATED ? nowIso() : (fixTask.reEscalatedAt || null),
    blockedAt: nextStatus === FIX_TASK_LIFECYCLE_STATES.BLOCKED ? nowIso() : (fixTask.blockedAt || null),
    updatedAt: nowIso(),
    attemptCount: Number(fixTask.attempt_count || 0) + (nextStatus === fixTask.status ? 0 : 1),
    source: 'fix_task',
  };
  return persistFixTaskState(rootPath, fixTask, patch);
}

module.exports = {
  FIX_TASK_LIFECYCLE_STATES,
  buildFixTaskPlannerHandoff,
  buildFixTaskPromptSection,
  consumePendingFixTask,
  finalizeFixTask,
  readFixTaskArtifacts,
  readFixTaskQueue,
  readPendingFixTasks,
  normalizeFixTaskRecord,
};
