const fs = require('fs');
const path = require('path');
const { normalizeAgentId } = require('./agentRegistry');
const { AGENT_AUDIT_RELATIVE_DIR } = require('./agentAudit');
const { readFailureHistory } = require('./failureMemory');

const AGENT_CAPABILITY_VERSION = 'ace/agent-capabilities.v0';
const AGENT_CAPABILITY_RELATIVE_DIR = path.join('brain', 'context', 'agent_capabilities');
const STAGE_ORDER = ['planner', 'context-manager', 'executor', 'builder'];

const STAGE_TASK_TYPES = Object.freeze({
  planner: {
    recommended: ['task decomposition and planning', 'handoff shaping'],
    avoid: ['high-entropy execution work', 'broad patch application'],
  },
  'context-manager': {
    recommended: ['context synthesis and intent shaping', 'upstream intake review'],
    avoid: ['direct patching', 'open-ended implementation'],
  },
  executor: {
    recommended: ['execution-readiness assessment', 'verification gating'],
    avoid: ['speculative architecture changes', 'unbounded implementation'],
  },
  builder: {
    recommended: ['bounded patch application and integration', 'apply-path repair'],
    avoid: ['open-ended analysis loops', 'non-local refactors'],
  },
});

function nowIso() {
  return new Date().toISOString();
}

function uniqueStrings(values = []) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function clampScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function normalizeRelativePath(relativePath = '') {
  return String(relativePath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^\.\//, '')
    .replace(/\/{2,}/g, '/')
    .trim();
}

function readJson(filePath, fallback = null) {
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

function capabilityRoot(rootPath) {
  return path.join(rootPath || process.cwd(), AGENT_CAPABILITY_RELATIVE_DIR);
}

function capabilityDir(rootPath, agentId) {
  return path.join(capabilityRoot(rootPath), normalizeAgentId(agentId || 'dave'));
}

function capabilityJsonPath(rootPath, agentId) {
  return path.join(capabilityDir(rootPath, agentId), `${normalizeAgentId(agentId || 'dave')}.json`);
}

function capabilityMarkdownPath(rootPath, agentId) {
  return path.join(capabilityDir(rootPath, agentId), `${normalizeAgentId(agentId || 'dave')}.md`);
}

function walkFiles(startDir) {
  if (!startDir || !fs.existsSync(startDir)) return [];
  const stack = [startDir];
  const files = [];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (entry.isFile()) files.push(fullPath);
    }
  }
  return files;
}

function normalizeAuditStage(stage = '') {
  const normalized = String(stage || '').trim().toLowerCase();
  if (normalized === 'apply') return 'builder';
  if (STAGE_ORDER.includes(normalized)) return normalized;
  return normalized || null;
}

function normalizeAuditRecord(raw = {}, filePath = null) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const agentId = normalizeAgentId(raw.agent_id || raw.agentId || raw.attribution?.agent_id || raw.attribution?.agentId || 'dave');
  const agentVersion = String(
    raw.agent_version
    || raw.agentVersion
    || raw.attribution?.agent_version
    || raw.attribution?.agentVersion
    || '',
  ).trim() || null;
  const scores = {
    scope_discipline_score: clampScore(raw.scope_discipline_score),
    architecture_respect_score: clampScore(raw.architecture_respect_score),
    output_clarity_score: clampScore(raw.output_clarity_score),
    recovery_burden_score: clampScore(raw.recovery_burden_score),
    validation_rigour_score: clampScore(raw.validation_rigour_score),
  };
  const scoreValues = Object.values(scores);
  const scoreAverage = scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length;
  return {
    agent_id: agentId,
    agent_version: agentVersion,
    task_id: String(raw.task_id || raw.taskId || '').trim() || null,
    stage: normalizeAuditStage(raw.stage) || 'planner',
    pass_fail: String(raw.pass_fail || '').trim().toLowerCase() === 'pass' ? 'pass' : 'fail',
    outcome: String(raw.outcome || '').trim() || null,
    artifact_refs: Array.isArray(raw.artifact_refs) ? uniqueStrings(raw.artifact_refs).map(normalizeRelativePath) : [],
    review_summary: String(raw.review_summary || '').trim() || null,
    recommended_followup: String(raw.recommended_followup || '').trim() || null,
    created_at: String(raw.created_at || raw.createdAt || '').trim() || null,
    updated_at: String(raw.updated_at || raw.updatedAt || '').trim() || null,
    scores,
    scoreAverage,
    sourcePath: filePath ? normalizeRelativePath(filePath) : null,
  };
}

function listAuditFiles(rootPath) {
  const baseDir = path.join(rootPath || process.cwd(), AGENT_AUDIT_RELATIVE_DIR);
  return walkFiles(baseDir)
    .filter((filePath) => filePath.endsWith('.json'))
    .sort((left, right) => normalizeRelativePath(left).localeCompare(normalizeRelativePath(right)));
}

function listAuditRecords(rootPath) {
  return listAuditFiles(rootPath)
    .map((filePath) => normalizeAuditRecord(readJson(filePath, null), filePath))
    .filter(Boolean)
    .sort((left, right) => {
      const timeDelta = String(left.created_at || left.updated_at || '').localeCompare(String(right.created_at || right.updated_at || ''));
      if (timeDelta !== 0) return timeDelta;
      return String(left.sourcePath || '').localeCompare(String(right.sourcePath || ''));
    });
}

function stageFromFailureHistory(entry = {}, agentId = '') {
  const normalizedAgentId = normalizeAgentId(agentId || '');
  const relatedAgents = uniqueStrings(entry.related_agents || []).map(normalizeAgentId);
  if (normalizeAgentId(entry.agent_id || '') === normalizedAgentId) return String(entry.stage || '').trim().toLowerCase() || null;
  if (relatedAgents.includes(normalizedAgentId)) return String(entry.stage || '').trim().toLowerCase() || null;
  return null;
}

function stageRecommendations(stage = '') {
  return STAGE_TASK_TYPES[normalizeAuditStage(stage)] || { recommended: [], avoid: [] };
}

function average(values = []) {
  const numbers = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  if (!numbers.length) return 0;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function summarizeStages(stageStats = {}) {
  return Object.entries(stageStats)
    .map(([stage, stats]) => ({
      stage,
      runs: stats.runs,
      passRate: stats.runs ? stats.passCount / stats.runs : 0,
      scoreAverage: average(stats.scoreAverages),
      recoveryAverage: average(stats.recoveryScores),
      validationAverage: average(stats.validationScores),
      consistency: stats.runs
        ? clamp01(1 - (average(stats.scoreAverages.map((value) => Math.abs(value - average(stats.scoreAverages)))) / 25))
        : 0,
      failureHits: stats.failureHits,
    }))
    .sort((left, right) => {
      const leftIndex = STAGE_ORDER.indexOf(left.stage);
      const rightIndex = STAGE_ORDER.indexOf(right.stage);
      if (leftIndex !== rightIndex) {
        return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
      }
      return left.stage.localeCompare(right.stage);
    });
}

function buildAgentCapabilityProfile(rootPath, agentId, { auditRecords = null, failureHistory = null } = {}) {
  const normalizedAgentId = normalizeAgentId(agentId || 'dave');
  const records = (Array.isArray(auditRecords) ? auditRecords : listAuditRecords(rootPath))
    .filter((record) => record.agent_id === normalizedAgentId);
  const history = failureHistory || readFailureHistory(rootPath).history || { entries: [] };
  const failureEntries = Array.isArray(history.entries) ? history.entries : [];
  const agentFailureEntries = failureEntries.filter((entry) => stageFromFailureHistory(entry, normalizedAgentId) || normalizeAgentId(entry.agent_id || '') === normalizedAgentId || uniqueStrings(entry.related_agents || []).map(normalizeAgentId).includes(normalizedAgentId));

  const stageStats = {};
  const runMeans = [];
  let passCount = 0;
  const versions = [];

  for (const record of records) {
    const stage = normalizeAuditStage(record.stage) || 'planner';
    const stageBucket = stageStats[stage] || (stageStats[stage] = {
      runs: 0,
      passCount: 0,
      scoreAverages: [],
      recoveryScores: [],
      validationScores: [],
      failureHits: 0,
    });
    stageBucket.runs += 1;
    if (record.pass_fail === 'pass') {
      stageBucket.passCount += 1;
      passCount += 1;
    }
    const scoreAverage = record.scoreAverage;
    stageBucket.scoreAverages.push(scoreAverage);
    stageBucket.recoveryScores.push(record.scores.recovery_burden_score);
    stageBucket.validationScores.push(record.scores.validation_rigour_score);
    runMeans.push(scoreAverage);
    versions.push(record.agent_version || '');
  }

  const stageSummaries = summarizeStages(stageStats).map((summary) => {
    const matchingFailures = agentFailureEntries.filter((entry) => stageFromFailureHistory(entry, normalizedAgentId) === summary.stage);
    const failureCount = matchingFailures.reduce((sum, entry) => sum + Number(entry.count || 0), 0);
    const repeatedFailure = matchingFailures.some((entry) => Number(entry.count || 0) >= 2);
    const consistentHigh = summary.runs >= 2
      && summary.passRate >= 0.75
      && summary.scoreAverage >= 80
      && summary.recoveryAverage >= 75
      && summary.validationAverage >= 75
      && summary.consistency >= 0.7
      && !repeatedFailure;
    const repeatedLow = summary.runs >= 1
      && (
        summary.passRate <= 0.5
        || summary.scoreAverage <= 60
        || summary.recoveryAverage <= 60
        || summary.validationAverage <= 60
        || repeatedFailure
        || failureCount >= 2
      );
    return {
      ...summary,
      strong: consistentHigh,
      weak: repeatedLow,
    };
  });

  const strongStages = stageSummaries.filter((entry) => entry.strong).map((entry) => entry.stage);
  const weakStages = stageSummaries.filter((entry) => entry.weak).map((entry) => entry.stage);
  const recommendedTaskTypes = uniqueStrings(strongStages.flatMap((stage) => stageRecommendations(stage).recommended));
  const avoidTaskTypes = uniqueStrings(weakStages.flatMap((stage) => stageRecommendations(stage).avoid));
  const commonFailureKeys = failureEntries
    .filter((entry) => normalizeAgentId(entry.agent_id || '') === normalizedAgentId || uniqueStrings(entry.related_agents || []).map(normalizeAgentId).includes(normalizedAgentId))
    .map((entry) => ({
      failure_key: String(entry.failure_key || '').trim() || 'unknown_failure',
      count: Number(entry.count || 0) || 0,
    }))
    .filter((entry) => entry.failure_key !== 'unknown_failure')
    .sort((left, right) => {
      const countDelta = right.count - left.count;
      if (countDelta !== 0) return countDelta;
      return left.failure_key.localeCompare(right.failure_key);
    })
    .map((entry) => entry.failure_key);

  const versionCounts = {};
  for (const version of versions.filter(Boolean)) {
    versionCounts[version] = (versionCounts[version] || 0) + 1;
  }
  const dominantVersion = Object.entries(versionCounts)
    .sort((left, right) => {
      const countDelta = right[1] - left[1];
      if (countDelta !== 0) return countDelta;
      return left[0].localeCompare(right[0]);
    })[0]?.[0]
    || AGENT_CAPABILITY_VERSION;

  const stageCoverage = stageSummaries.length ? stageSummaries.filter((entry) => entry.runs > 0).length / STAGE_ORDER.length : 0;
  const consistencyAverage = stageSummaries.length ? average(stageSummaries.map((entry) => entry.consistency)) : 0;
  const passRate = records.length ? passCount / records.length : 0;
  const runCoverage = clamp01(records.length / 12);
  const confidence = Number(
    clamp01(
      (runCoverage * 0.35)
      + (passRate * 0.25)
      + (consistencyAverage * 0.25)
      + (stageCoverage * 0.15)
      - Math.min(0.2, commonFailureKeys.length * 0.03)
    ).toFixed(3),
  );

  return {
    version: AGENT_CAPABILITY_VERSION,
    agent_id: normalizedAgentId,
    agent_version: dominantVersion,
    runs_total: records.length,
    pass_rate: Number(passRate.toFixed(3)),
    avg_scope_discipline_score: Number(average(records.map((record) => record.scores.scope_discipline_score)).toFixed(2)),
    avg_architecture_respect_score: Number(average(records.map((record) => record.scores.architecture_respect_score)).toFixed(2)),
    avg_output_clarity_score: Number(average(records.map((record) => record.scores.output_clarity_score)).toFixed(2)),
    avg_recovery_burden_score: Number(average(records.map((record) => record.scores.recovery_burden_score)).toFixed(2)),
    avg_validation_rigour_score: Number(average(records.map((record) => record.scores.validation_rigour_score)).toFixed(2)),
    common_failure_keys: commonFailureKeys.slice(0, 8),
    strong_stages: uniqueStrings(strongStages),
    weak_stages: uniqueStrings(weakStages),
    recommended_task_types: recommendedTaskTypes.length ? recommendedTaskTypes : ['review only'],
    avoid_task_types: avoidTaskTypes,
    confidence,
    updated_at: nowIso(),
    source_audit_count: records.length,
    source_failure_count: agentFailureEntries.length,
  };
}

function renderCapabilityMarkdown(profile = {}) {
  const lines = [
    '# Agent Capability Ledger',
    '',
    `- agent_id: ${profile.agent_id || 'dave'}`,
    `- agent_version: ${profile.agent_version || AGENT_CAPABILITY_VERSION}`,
    `- runs_total: ${profile.runs_total || 0}`,
    `- pass_rate: ${profile.pass_rate ?? 0}`,
    `- confidence: ${profile.confidence ?? 0}`,
    '',
    '## Average Scores',
    `- scope_discipline_score: ${profile.avg_scope_discipline_score ?? 0}`,
    `- architecture_respect_score: ${profile.avg_architecture_respect_score ?? 0}`,
    `- output_clarity_score: ${profile.avg_output_clarity_score ?? 0}`,
    `- recovery_burden_score: ${profile.avg_recovery_burden_score ?? 0}`,
    `- validation_rigour_score: ${profile.avg_validation_rigour_score ?? 0}`,
    '',
    '## Stage Signals',
    `- strong_stages: ${(profile.strong_stages || []).join(', ') || 'none'}`,
    `- weak_stages: ${(profile.weak_stages || []).join(', ') || 'none'}`,
    '',
    '## Task Types',
    `- recommended_task_types: ${(profile.recommended_task_types || []).join(', ') || 'none'}`,
    `- avoid_task_types: ${(profile.avoid_task_types || []).join(', ') || 'none'}`,
    '',
    '## Common Failures',
    ...(Array.isArray(profile.common_failure_keys) && profile.common_failure_keys.length
      ? profile.common_failure_keys.map((key) => `- ${key}`)
      : ['- none']),
  ];
  return lines.join('\n').trimEnd() + '\n';
}

function readAgentCapabilityProfile(rootPath, agentId) {
  const filePath = capabilityJsonPath(rootPath, agentId);
  const raw = readJson(filePath, null);
  if (!raw) {
    return {
      exists: false,
      filePath,
      markdownPath: capabilityMarkdownPath(rootPath, agentId),
      profile: null,
    };
  }
  return {
    exists: true,
    filePath,
    markdownPath: capabilityMarkdownPath(rootPath, agentId),
    profile: {
      ...raw,
      agent_id: normalizeAgentId(raw.agent_id || agentId || 'dave'),
      agent_version: String(raw.agent_version || AGENT_CAPABILITY_VERSION).trim() || AGENT_CAPABILITY_VERSION,
    },
  };
}

function writeAgentCapabilityProfile(rootPath, profile = {}) {
  const agentId = normalizeAgentId(profile.agent_id || 'dave');
  const jsonPath = capabilityJsonPath(rootPath, agentId);
  const markdownPath = capabilityMarkdownPath(rootPath, agentId);
  const nextProfile = {
    ...profile,
    agent_id: agentId,
    agent_version: String(profile.agent_version || AGENT_CAPABILITY_VERSION).trim() || AGENT_CAPABILITY_VERSION,
    updated_at: profile.updated_at || nowIso(),
  };
  writeJson(jsonPath, nextProfile);
  fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
  fs.writeFileSync(markdownPath, renderCapabilityMarkdown(nextProfile), 'utf8');
  return {
    profile: nextProfile,
    jsonPath: normalizeRelativePath(path.relative(rootPath || process.cwd(), jsonPath)),
    markdownPath: normalizeRelativePath(path.relative(rootPath || process.cwd(), markdownPath)),
  };
}

function rebuildAgentCapabilityLedger(rootPath, { agentId = null } = {}) {
  const records = listAuditRecords(rootPath);
  const agentIds = agentId
    ? [normalizeAgentId(agentId)]
    : uniqueStrings(records.map((record) => record.agent_id));
  const rebuilt = agentIds.map((normalizedAgentId) => {
    const profile = buildAgentCapabilityProfile(rootPath, normalizedAgentId, { auditRecords: records });
    const written = writeAgentCapabilityProfile(rootPath, profile);
    return {
      ...written,
      auditRecords: records.filter((record) => record.agent_id === normalizedAgentId).length,
    };
  });
  return {
    rebuilt,
    updated_at: nowIso(),
  };
}

module.exports = {
  AGENT_CAPABILITY_RELATIVE_DIR,
  AGENT_CAPABILITY_VERSION,
  buildAgentCapabilityProfile,
  listAuditFiles,
  listAuditRecords,
  readAgentCapabilityProfile,
  rebuildAgentCapabilityLedger,
  renderCapabilityMarkdown,
  writeAgentCapabilityProfile,
};
