const fs = require('fs');
const path = require('path');
const {
  AGENT_ATTRIBUTION_DEFAULT_ID,
  AGENT_ATTRIBUTION_VERSION,
  normalizeAgentIdentity,
} = require('./agentAttribution');
const {
  readFailureHistory,
} = require('./failureMemory');

const AGENT_AUDIT_VERSION = 'ace/agent-audit.v0';
const AGENT_AUDIT_RELATIVE_DIR = path.join('brain', 'context', 'agent_audits');
const PASS_OUTCOMES = new Set(['completed', 'passed', 'done', 'ready-apply', 'ready-deploy', 'approved', 'pass']);

function nowIso() {
  return new Date().toISOString();
}

function uniqueStrings(values = []) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function normalizeRelativePath(relativePath = '') {
  return String(relativePath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^\.\//, '')
    .replace(/\/{2,}/g, '/')
    .trim();
}

function relativeToRoot(rootPath, targetPath) {
  if (!rootPath || !targetPath) return normalizeRelativePath(targetPath);
  return normalizeRelativePath(path.relative(rootPath, targetPath));
}

function loadJson(filePath, fallback = null) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function clampScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function normalizeAuditStage(stage = '') {
  const normalized = String(stage || '').trim().toLowerCase();
  if (normalized === 'apply') return 'builder';
  if (['planner', 'context-manager', 'executor', 'builder'].includes(normalized)) return normalized;
  return normalized || null;
}

function normalizePassFail(outcome = '', passFail = '') {
  const explicit = String(passFail || '').trim().toLowerCase();
  if (explicit === 'pass' || explicit === 'fail') return explicit;
  return PASS_OUTCOMES.has(String(outcome || '').trim().toLowerCase()) ? 'pass' : 'fail';
}

function resolveTaskDir(rootPath, { taskDir = null, taskCache = null, artifactAttributionPath = null } = {}) {
  if (taskDir) {
    return path.isAbsolute(taskDir) ? taskDir : path.resolve(rootPath || process.cwd(), taskDir);
  }
  if (taskCache?.taskDir) {
    return path.resolve(rootPath || process.cwd(), taskCache.taskDir);
  }
  if (artifactAttributionPath) {
    return path.dirname(path.resolve(rootPath || process.cwd(), artifactAttributionPath));
  }
  return null;
}

function readAgentAttributionSidecar(rootPath, context = {}) {
  const taskDir = resolveTaskDir(rootPath, context);
  if (!taskDir) return null;
  const filePath = path.join(taskDir, 'agent_attribution.json');
  const raw = loadJson(filePath, null);
  if (!raw || typeof raw !== 'object') return null;
  const attribution = raw.attribution && typeof raw.attribution === 'object' ? raw.attribution : raw;
  return {
    filePath,
    taskDir,
    taskId: String(raw.taskId || raw.task_id || '').trim() || null,
    agent_id: attribution.agent_id || raw.agent_id || null,
    agent_version: attribution.agent_version || raw.agent_version || null,
    attribution: normalizeAgentIdentity(attribution, {
      agent_id: AGENT_ATTRIBUTION_DEFAULT_ID,
      agent_version: AGENT_ATTRIBUTION_VERSION,
    }),
    raw,
  };
}

function resolveFailureSignal(rootPath, { stage = null, agentId = null } = {}) {
  const history = readFailureHistory(rootPath).history || { entries: [] };
  const entries = Array.isArray(history.entries) ? history.entries : [];
  const normalizedStage = String(stage || '').trim().toLowerCase();
  const normalizedAgentId = String(agentId || '').trim().toLowerCase();
  const choose = (predicate) => entries.find((entry) => predicate(entry)) || null;

  return choose((entry) => (
    String(entry.stage || '').trim().toLowerCase() === normalizedStage
    && (
      String(entry.agent_id || '').trim().toLowerCase() === normalizedAgentId
      || uniqueStrings(entry.related_agents).includes(normalizedAgentId)
    )
  )) || choose((entry) => String(entry.stage || '').trim().toLowerCase() === normalizedStage) || choose((entry) => (
    String(entry.agent_id || '').trim().toLowerCase() === normalizedAgentId
    || uniqueStrings(entry.related_agents).includes(normalizedAgentId)
  )) || choose((entry) => String(entry.failure_key || '').trim().toLowerCase() !== 'unknown_failure') || entries[0] || null;
}

function resolveAuditAttribution({
  rootPath,
  stage = null,
  sourceRecord = {},
  taskDir = null,
  taskCache = null,
  artifactAttributionPath = null,
}) {
  const sidecar = readAgentAttributionSidecar(rootPath, { taskDir, taskCache, artifactAttributionPath });
  const normalizedStage = normalizeAuditStage(stage) || 'planner';
  const failureSignal = resolveFailureSignal(rootPath, {
    stage: normalizedStage,
    agentId: sourceRecord.agent_id || sourceRecord.agentId || sourceRecord.attribution?.agent_id || sidecar?.agent_id || null,
  });
  return normalizeAgentIdentity({
    agent_id: sourceRecord.agent_id
      || sourceRecord.agentId
      || sourceRecord.attribution?.agent_id
      || sourceRecord.attribution?.agentId
      || sidecar?.agent_id
      || sidecar?.attribution?.agent_id
      || failureSignal?.agent_id
      || AGENT_ATTRIBUTION_DEFAULT_ID,
    agent_version: sourceRecord.agent_version
      || sourceRecord.agentVersion
      || sourceRecord.attribution?.agent_version
      || sourceRecord.attribution?.agentVersion
      || sidecar?.agent_version
      || sidecar?.attribution?.agent_version
      || failureSignal?.agent_version
      || AGENT_ATTRIBUTION_VERSION,
  }, {
    agent_id: AGENT_ATTRIBUTION_DEFAULT_ID,
    agent_version: AGENT_ATTRIBUTION_VERSION,
  });
}

function readRetryCount(sourceRecord = {}) {
  return Number(
    sourceRecord.retry_count
    ?? sourceRecord.retryCount
    ?? sourceRecord.attempt_count
    ?? sourceRecord.attemptCount
    ?? sourceRecord.sourceFixTask?.retry_count
    ?? sourceRecord.sourceFixTask?.retryCount
    ?? 0,
  ) || 0;
}

function hasDisallowedPathEscalation(sourceRecord = {}) {
  const text = [
    sourceRecord.reason,
    sourceRecord.summary,
    sourceRecord.statusReason,
    sourceRecord.error,
    ...(Array.isArray(sourceRecord.reasons) ? sourceRecord.reasons : []),
    ...(Array.isArray(sourceRecord.policy?.reasons) ? sourceRecord.policy.reasons : []),
    ...(Array.isArray(sourceRecord.policy?.policy_rule_hits) ? sourceRecord.policy.policy_rule_hits : []),
    sourceRecord.policy?.decision,
  ].map((value) => String(value || '').toLowerCase()).join(' ');
  return /disallowed|not allowed|escalat|policy-blocked|policy-escalate/.test(text);
}

function hasFixTaskPressure(sourceRecord = {}) {
  return Boolean(
    sourceRecord.fixTask
    || sourceRecord.sourceFixTask
    || sourceRecord.policy?.fix_task_created
    || sourceRecord.policy?.decision === 'blocked'
    || sourceRecord.policy?.decision === 'escalate'
    || sourceRecord.status === 'blocked'
    || sourceRecord.status === 'failed'
    || sourceRecord.outcome === 'blocked'
    || sourceRecord.outcome === 'degraded'
  );
}

function resolveFailureMatch(rootPath, { stage = null, agentId = null, outcome = '' } = {}) {
  const failureSignal = resolveFailureSignal(rootPath, { stage, agentId });
  if (!failureSignal) return null;
  if (String(failureSignal.failure_key || '').trim().toLowerCase() === 'unknown_failure') return null;
  if (String(outcome || '').trim().toLowerCase() === 'completed') return null;
  return failureSignal;
}

function collectArtifactRefs(rootPath, {
  stage = null,
  sourceRecord = {},
  taskDir = null,
  taskCache = null,
  artifactAttributionPath = null,
  explicitRefs = [],
} = {}) {
  const refs = [];
  const normalizedStage = normalizeAuditStage(stage);
  const resolvedTaskDir = resolveTaskDir(rootPath, { taskDir, taskCache, artifactAttributionPath });

  if (Array.isArray(explicitRefs)) refs.push(...explicitRefs);
  if (sourceRecord?.artifactRefs) refs.push(...sourceRecord.artifactRefs);
  if (sourceRecord?.proposalArtifactRefs) refs.push(...sourceRecord.proposalArtifactRefs);
  if (sourceRecord?.rawResponsePath) refs.push(sourceRecord.rawResponsePath);

  if (taskCache?.taskDir && Array.isArray(taskCache.selectedFiles)) {
    const taskDirRel = normalizeRelativePath(taskCache.taskDir);
    for (const entry of taskCache.selectedFiles) {
      if (!entry?.name) continue;
      refs.push(path.posix.join(taskDirRel, entry.name));
    }
  }

  if (resolvedTaskDir) {
    if (normalizedStage === 'builder') {
      refs.push(relativeToRoot(rootPath, path.join(resolvedTaskDir, 'apply_result.json')));
      refs.push(relativeToRoot(rootPath, path.join(resolvedTaskDir, 'patch.diff')));
      refs.push(relativeToRoot(rootPath, path.join(resolvedTaskDir, 'agent_attribution.json')));
      refs.push(relativeToRoot(rootPath, path.join(resolvedTaskDir, 'meta.json')));
    } else {
      const runId = sourceRecord.id || sourceRecord.runId || sourceRecord.taskId || null;
      const stageDir = normalizedStage ? path.join('data', 'spatial', 'agent-runs', normalizedStage) : null;
      if (stageDir && runId) refs.push(relativeToRoot(rootPath, path.join(rootPath, stageDir, `${runId}.json`)));
      refs.push(relativeToRoot(rootPath, path.join(resolvedTaskDir, 'agent_attribution.json')));
      refs.push(relativeToRoot(rootPath, path.join(resolvedTaskDir, 'apply_result.json')));
    }
  }

  if (artifactAttributionPath) {
    refs.push(relativeToRoot(rootPath, path.isAbsolute(artifactAttributionPath)
      ? artifactAttributionPath
      : path.join(rootPath || process.cwd(), artifactAttributionPath)));
  }

  if (sourceRecord?.taskCache?.taskDir) {
    refs.push(relativeToRoot(rootPath, path.join(rootPath || process.cwd(), sourceRecord.taskCache.taskDir, 'agent_attribution.json')));
  }

  return uniqueStrings(refs.map(normalizeRelativePath)).sort((left, right) => left.localeCompare(right));
}

function buildAuditScores({
  stage = null,
  sourceRecord = {},
  passFail = 'fail',
  retryCount = 0,
  fixTaskPressure = false,
  disallowedPathEscalation = false,
  failureMatch = null,
  taskCache = null,
}) {
  const normalizedStage = normalizeAuditStage(stage);
  const outcome = String(sourceRecord.outcome || sourceRecord.status || '').trim().toLowerCase();
  const cleanPass = passFail === 'pass';
  const noRework = retryCount === 0 && !fixTaskPressure && !disallowedPathEscalation;
  const knownAvoidableFailure = Boolean(failureMatch);
  const validationHints = [
    sourceRecord.report?.blockers,
    sourceRecord.report?.verificationPlan?.commandPresets,
    sourceRecord.report?.verificationPlan?.qaScenarios,
    sourceRecord.taskCache?.selectedFiles,
  ];
  const hasValidationArtifacts = validationHints.some((value) => Array.isArray(value) ? value.length > 0 : Boolean(value));
  const summaryText = String(sourceRecord.summary || sourceRecord.reason || '').trim();
  const hasClearSummary = summaryText.length >= 16;

  let scope = 88;
  let architecture = 86;
  let clarity = 84;
  let recovery = 90;
  let validation = 82;

  if (fixTaskPressure) {
    scope -= 18;
    architecture -= 14;
    recovery -= 20;
    validation -= 10;
  }
  if (retryCount > 0) {
    scope -= Math.min(24, retryCount * 8);
    recovery -= Math.min(30, retryCount * 12);
    validation -= Math.min(12, retryCount * 4);
  }
  if (disallowedPathEscalation) {
    scope -= 16;
    architecture -= 24;
    recovery -= 12;
  }
  if (knownAvoidableFailure) {
    scope -= 10;
    architecture -= 18;
    recovery -= 18;
    validation -= 10;
  }
  if (cleanPass) {
    scope += 6;
    architecture += 6;
    clarity += 6;
    recovery += 8;
    validation += 10;
  }
  if (noRework) {
    scope += 6;
    architecture += 4;
    recovery += 10;
    validation += 8;
  }
  if (summaryText) clarity += hasClearSummary ? 5 : -6;
  if (sourceRecord.taskId || sourceRecord.handoffId || sourceRecord.sourceNodeId) clarity += 4;
  if (Array.isArray(sourceRecord.artifactRefs) && sourceRecord.artifactRefs.length) clarity += 4;
  if (hasValidationArtifacts) validation += 8;

  if (normalizedStage === 'builder') {
    validation += cleanPass ? 8 : -8;
    recovery += cleanPass ? 4 : -4;
  }
  if (normalizedStage === 'planner' && taskCache?.source === 'HIT') {
    validation += 8;
    clarity += 2;
  }
  if (normalizedStage === 'context-manager' && Number(sourceRecord.report?.confidence) >= 0.7) {
    validation += 10;
    clarity += 4;
  }
  if (normalizedStage === 'executor') {
    if (Array.isArray(sourceRecord.report?.blockers) && sourceRecord.report.blockers.length === 0) {
      validation += 10;
    }
    if (sourceRecord.report?.decision && ['ready-apply', 'ready-deploy', 'done'].includes(sourceRecord.report.decision)) {
      validation += 6;
    }
  }

  return {
    scope_discipline_score: clampScore(scope),
    architecture_respect_score: clampScore(architecture),
    output_clarity_score: clampScore(clarity),
    recovery_burden_score: clampScore(recovery),
    validation_rigour_score: clampScore(validation),
  };
}

function buildReviewSummary({
  passFail = 'fail',
  stage = null,
  scores = {},
  retryCount = 0,
  fixTaskPressure = false,
  disallowedPathEscalation = false,
  failureMatch = null,
  sourceRecord = {},
}) {
  const notes = [];
  if (passFail === 'pass') notes.push('clean pass');
  if (retryCount > 0) notes.push(`${retryCount} retry${retryCount === 1 ? '' : 'ies'}`);
  if (fixTaskPressure) notes.push('fix task pressure');
  if (disallowedPathEscalation) notes.push('disallowed-path escalation');
  if (failureMatch) notes.push(`known failure: ${failureMatch.failure_key}`);
  if (normalizedOutcomeHint(sourceRecord)) notes.push(normalizedOutcomeHint(sourceRecord));
  if (notes.length === 0) notes.push('narrow, deterministic output');

  const averageScore = Math.round(
    (scores.scope_discipline_score
    + scores.architecture_respect_score
    + scores.output_clarity_score
    + scores.recovery_burden_score
    + scores.validation_rigour_score) / 5,
  );

  if (passFail === 'pass' && averageScore >= 85) {
    return `Strong ${stage || 'agent'} run: ${notes.join(', ')}.`;
  }
  if (passFail === 'pass') {
    return `Acceptable ${stage || 'agent'} run with some friction: ${notes.join(', ')}.`;
  }
  return `Review needed for ${stage || 'agent'}: ${notes.join(', ')}.`;
}

function normalizedOutcomeHint(sourceRecord = {}) {
  const outcome = String(sourceRecord.outcome || sourceRecord.status || '').trim().toLowerCase();
  if (outcome === 'completed') return 'completed cleanly';
  if (outcome === 'degraded') return 'degraded output';
  if (outcome === 'blocked') return 'blocked output';
  if (outcome === 'failed') return 'failed output';
  return '';
}

function buildFollowupRecommendation({
  passFail = 'fail',
  retryCount = 0,
  fixTaskPressure = false,
  disallowedPathEscalation = false,
  failureMatch = null,
}) {
  if (passFail === 'pass' && retryCount === 0 && !fixTaskPressure && !disallowedPathEscalation && !failureMatch) {
    return 'No immediate follow-up required.';
  }
  if (failureMatch) {
    return `Address the known avoidable failure (${failureMatch.failure_key}) before retrying this path.`;
  }
  if (fixTaskPressure || disallowedPathEscalation) {
    return 'Tighten scope and remove the blocked or escalated path before another run.';
  }
  if (retryCount > 0) {
    return 'Reduce rework by tightening preflight checks and rerun the smallest failing slice.';
  }
  return 'Re-run with a narrower scope and a clearer validation step.';
}

function buildAgentAuditRecord({
  rootPath = process.cwd(),
  stage = null,
  taskId = null,
  taskDir = null,
  sourceRecord = {},
  artifactRefs = [],
  outcome = null,
  pass_fail = null,
  taskCache = null,
  artifactAttributionPath = null,
  createdAt = null,
} = {}) {
  const normalizedStage = normalizeAuditStage(stage) || 'planner';
  const normalizedTaskId = String(
    taskId
    || sourceRecord.taskId
    || sourceRecord.sourceFixTask?.taskId
    || sourceRecord.handoff?.taskId
    || sourceRecord.report?.taskId
    || '',
  ).trim() || null;
  const resolvedTaskDir = resolveTaskDir(rootPath, { taskDir, taskCache, artifactAttributionPath });
  const retryCount = readRetryCount(sourceRecord);
  const passFail = normalizePassFail(outcome || sourceRecord.outcome || sourceRecord.status, pass_fail);
  const attribution = resolveAuditAttribution({
    rootPath,
    stage: normalizedStage,
    sourceRecord,
    taskDir: resolvedTaskDir,
    taskCache,
    artifactAttributionPath,
  });
  const failureMatch = resolveFailureMatch(rootPath, {
    stage: normalizedStage,
    agentId: attribution.agent_id,
    outcome: outcome || sourceRecord.outcome || sourceRecord.status,
  });
  const fixTaskPressure = hasFixTaskPressure(sourceRecord);
  const disallowedPathEscalation = hasDisallowedPathEscalation(sourceRecord);
  const resolvedArtifactRefs = collectArtifactRefs(rootPath, {
    stage: normalizedStage,
    sourceRecord,
    taskDir: resolvedTaskDir,
    taskCache: taskCache || sourceRecord.taskCache || null,
    artifactAttributionPath,
    explicitRefs: artifactRefs,
  });
  const scores = buildAuditScores({
    stage: normalizedStage,
    sourceRecord,
    passFail,
    retryCount,
    fixTaskPressure,
    disallowedPathEscalation,
    failureMatch,
    taskCache: taskCache || sourceRecord.taskCache || null,
  });
  const reviewSummary = buildReviewSummary({
    passFail,
    stage: normalizedStage,
    scores,
    retryCount,
    fixTaskPressure,
    disallowedPathEscalation,
    failureMatch,
    sourceRecord,
  });
  const recommendedFollowup = buildFollowupRecommendation({
    passFail,
    retryCount,
    fixTaskPressure,
    disallowedPathEscalation,
    failureMatch,
  });

  return {
    version: AGENT_AUDIT_VERSION,
    audit_id: `${normalizedStage}_${normalizedTaskId || sourceRecord.id || sourceRecord.runId || 'unlinked'}`,
    created_at: createdAt || nowIso(),
    updated_at: nowIso(),
    agent_id: attribution.agent_id,
    agent_version: attribution.agent_version,
    task_id: normalizedTaskId,
    stage: normalizedStage,
    artifact_refs: resolvedArtifactRefs,
    outcome: String(outcome || sourceRecord.outcome || sourceRecord.status || '').trim() || null,
    pass_fail: passFail,
    scope_discipline_score: scores.scope_discipline_score,
    architecture_respect_score: scores.architecture_respect_score,
    output_clarity_score: scores.output_clarity_score,
    recovery_burden_score: scores.recovery_burden_score,
    validation_rigour_score: scores.validation_rigour_score,
    review_summary: reviewSummary,
    recommended_followup: recommendedFollowup,
  };
}

function auditFileStem(record = {}) {
  return String(record.audit_id || record.task_id || record.stage || 'agent_audit').trim().replace(/[^a-zA-Z0-9_\-]+/g, '_') || 'agent_audit';
}

function buildAgentAuditPaths(rootPath, record = {}) {
  const stage = normalizeAuditStage(record.stage) || 'planner';
  const dir = path.join(rootPath || process.cwd(), AGENT_AUDIT_RELATIVE_DIR, stage);
  const stem = auditFileStem(record);
  return {
    jsonPath: path.join(dir, `${stem}.json`),
    markdownPath: path.join(dir, `${stem}.md`),
  };
}

function renderAgentAuditMarkdown(record = {}) {
  const scores = [
    ['scope_discipline_score', record.scope_discipline_score],
    ['architecture_respect_score', record.architecture_respect_score],
    ['output_clarity_score', record.output_clarity_score],
    ['recovery_burden_score', record.recovery_burden_score],
    ['validation_rigour_score', record.validation_rigour_score],
  ];
  const lines = [
    '# Agent Audit',
    '',
    `- audit_id: ${record.audit_id || 'unknown'}`,
    `- agent_id: ${record.agent_id || AGENT_ATTRIBUTION_DEFAULT_ID}`,
    `- agent_version: ${record.agent_version || AGENT_ATTRIBUTION_VERSION}`,
    `- task_id: ${record.task_id || 'unlinked'}`,
    `- stage: ${record.stage || 'unknown'}`,
    `- outcome: ${record.outcome || 'unknown'}`,
    `- pass_fail: ${record.pass_fail || 'fail'}`,
    '',
    '## Scores',
    ...scores.map(([label, value]) => `- ${label}: ${value}`),
    '',
    '## Review Summary',
    record.review_summary || 'No summary available.',
    '',
    '## Recommended Follow-up',
    record.recommended_followup || 'No follow-up recommended.',
  ];
  if (Array.isArray(record.artifact_refs) && record.artifact_refs.length) {
    lines.push('', '## Artifact Refs', ...record.artifact_refs.map((ref) => `- ${ref}`));
  }
  return lines.join('\n').trimEnd() + '\n';
}

function writeAgentAuditArtifacts(rootPath, record = {}, { writeMarkdown = true } = {}) {
  const normalized = {
    ...record,
    version: record.version || AGENT_AUDIT_VERSION,
    created_at: record.created_at || nowIso(),
    updated_at: nowIso(),
  };
  const paths = buildAgentAuditPaths(rootPath, normalized);
  writeJson(paths.jsonPath, normalized);
  if (writeMarkdown) {
    fs.mkdirSync(path.dirname(paths.markdownPath), { recursive: true });
    fs.writeFileSync(paths.markdownPath, renderAgentAuditMarkdown(normalized), 'utf8');
  }
  return {
    ...normalized,
    jsonPath: path.relative(rootPath || process.cwd(), paths.jsonPath).replace(/\\/g, '/'),
    markdownPath: writeMarkdown ? path.relative(rootPath || process.cwd(), paths.markdownPath).replace(/\\/g, '/') : null,
  };
}

module.exports = {
  AGENT_AUDIT_RELATIVE_DIR,
  AGENT_AUDIT_VERSION,
  buildAgentAuditRecord,
  buildAgentAuditPaths,
  collectArtifactRefs,
  readAgentAttributionSidecar,
  resolveAuditAttribution,
  renderAgentAuditMarkdown,
  writeAgentAuditArtifacts,
};
