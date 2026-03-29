const fs = require('fs');
const path = require('path');
const {
  buildKnownFixCandidateEntryFromFailureRecord,
  readKnownFixCandidates,
  upsertKnownFixCandidate,
  writeKnownFixCandidates,
} = require('./knownFixes');
const {
  normalizeAgentIdentity,
  resolveStageAgentIdentity,
} = require('./agentAttribution');

const FAILURE_MEMORY_RELATIVE_DIR = path.join('brain', 'context');
const FAILURE_HISTORY_JSON_NAME = 'failure_history.json';
const FAILURE_HISTORY_MD_NAME = 'failure_history.md';
const FAILURE_MEMORY_VERSION = 'ace/failure-memory.v1';
const FAILURE_CANDIDATE_THRESHOLD = 3;
const FAILURE_EXAMPLE_LIMIT = 5;

function nowIso() {
  return new Date().toISOString();
}

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

function stripAnsi(text = '') {
  return String(text || '').replace(/\u001b\[[0-9;]*m/g, '');
}

function normalizeFailureText(text = '') {
  return stripAnsi(text)
    .toLowerCase()
    .replace(/[`"'’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function failureHistoryDir(rootPath) {
  return path.join(rootPath || process.cwd(), FAILURE_MEMORY_RELATIVE_DIR);
}

function failureHistoryJsonPath(rootPath) {
  return path.join(failureHistoryDir(rootPath), FAILURE_HISTORY_JSON_NAME);
}

function failureHistoryMarkdownPath(rootPath) {
  return path.join(failureHistoryDir(rootPath), FAILURE_HISTORY_MD_NAME);
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

function normalizeFailureKey(rawText = '', context = {}) {
  const text = normalizeFailureText(rawText);
  const stage = normalizeFailureText(context.stage || context.related_stage || context.relatedStage || '');
  const tool = normalizeFailureText(context.tool || context.related_tool || context.relatedTool || '');
  const scope = `${text} ${stage} ${tool}`.trim();

  if (/spawn eperm|eperm|access is denied|permission denied/.test(scope) && /windows|node|python|subprocess|spawn/.test(scope)) {
    return 'windows_spawn_eperm';
  }
  if (/ollama/.test(scope) && /(unreachable|unavailable|connection refused|econnrefused|etimedout|timeout|failed to connect|cannot connect|network error|fetch failed)/.test(scope)) {
    return 'ollama_unreachable';
  }
  if (/(git apply|apply patch|patch apply|apply failed|check failed|rejected hunk|patch does not apply)/.test(scope)) {
    return 'git_apply_check_failed';
  }
  if (/(dirty repo|repository is dirty|working tree.*dirty|uncommitted changes|cannot apply.*dirty|repo clean.*failed)/.test(scope)) {
    return 'dirty_repo_blocked';
  }
  if (/(invalid patch|malformed patch|unexpected end of file|patch diff|patch parse|corrupt diff|broken diff)/.test(scope)) {
    return 'invalid_patch_diff';
  }
  if (/(missing project key|project key.*missing|could not resolve project key|unknown project key|project target.*missing)/.test(scope)) {
    return 'missing_project_key';
  }
  return 'unknown_failure';
}

function normalizeFailureRecord(record = {}, fallback = {}) {
  const agentIdentity = normalizeAgentIdentity({
    agent_id: record.agent_id || record.agentId || fallback.agent_id || fallback.agentId || null,
    agent_version: record.agent_version || record.agentVersion || fallback.agent_version || fallback.agentVersion || null,
  }, resolveStageAgentIdentity(record.stage || fallback.stage || record.related_stage || fallback.related_stage || 'dave'));
  return {
    failure_key: String(record.failure_key || fallback.failure_key || 'unknown_failure').trim() || 'unknown_failure',
    stage: String(record.stage || fallback.stage || record.related_stage || fallback.related_stage || '').trim() || null,
    agent_id: agentIdentity.agent_id,
    agent_version: agentIdentity.agent_version,
    count: Number(record.count ?? fallback.count ?? 0) || 0,
    first_seen: String(record.first_seen || fallback.first_seen || '').trim() || null,
    last_seen: String(record.last_seen || fallback.last_seen || '').trim() || null,
    example_messages: uniqueStrings(Array.isArray(record.example_messages) ? record.example_messages : fallback.example_messages || []).slice(0, FAILURE_EXAMPLE_LIMIT),
    related_tools: uniqueStrings(Array.isArray(record.related_tools) ? record.related_tools : fallback.related_tools || []).slice(0, 5),
    related_stages: uniqueStrings(Array.isArray(record.related_stages) ? record.related_stages : fallback.related_stages || []).slice(0, 5),
    related_runs: uniqueStrings(Array.isArray(record.related_runs) ? record.related_runs : fallback.related_runs || []).slice(0, 5),
    related_projects: uniqueStrings(Array.isArray(record.related_projects) ? record.related_projects : fallback.related_projects || []).slice(0, 5),
    related_agents: uniqueStrings(Array.isArray(record.related_agents) ? record.related_agents : fallback.related_agents || []).slice(0, 5),
    source_count: Number(record.source_count ?? fallback.source_count ?? 0) || 0,
  };
}

function normalizeFailureHistory(history = {}) {
  const entries = Array.isArray(history.entries) ? history.entries : [];
  return {
    version: String(history.version || FAILURE_MEMORY_VERSION).trim() || FAILURE_MEMORY_VERSION,
    updated_at: history.updated_at || null,
    entries: entries.map((entry, index) => normalizeFailureRecord(entry, { index: index + 1 })),
  };
}

function readFailureHistory(rootPath) {
  const jsonPath = failureHistoryJsonPath(rootPath);
  const markdownPath = failureHistoryMarkdownPath(rootPath);
  if (!fs.existsSync(jsonPath) && !fs.existsSync(markdownPath)) {
    return {
      exists: false,
      jsonPath,
      markdownPath,
      history: normalizeFailureHistory({
        version: FAILURE_MEMORY_VERSION,
        updated_at: null,
        entries: [],
      }),
    };
  }
  return {
    exists: true,
    jsonPath,
    markdownPath,
    history: normalizeFailureHistory(readJson(jsonPath, {
      version: FAILURE_MEMORY_VERSION,
      updated_at: null,
      entries: [],
    }) || {}),
  };
}

function renderFailureHistoryEntry(entry = {}) {
  const lines = [
    `### ${entry.failure_key}`,
    `- Count: ${entry.count || 0}`,
  ];
  if (entry.stage) lines.push(`- Stage: ${entry.stage}`);
  if (entry.agent_id) lines.push(`- Agent: ${entry.agent_id}${entry.agent_version ? ` (${entry.agent_version})` : ''}`);
  if (entry.first_seen) lines.push(`- First seen: ${entry.first_seen}`);
  if (entry.last_seen) lines.push(`- Last seen: ${entry.last_seen}`);
  if ((entry.related_tools || []).length) lines.push(`- Related tools: ${entry.related_tools.join(', ')}`);
  if ((entry.related_stages || []).length) lines.push(`- Related stages: ${entry.related_stages.join(', ')}`);
  if ((entry.related_runs || []).length) lines.push(`- Related runs: ${entry.related_runs.join(', ')}`);
  if ((entry.related_projects || []).length) lines.push(`- Related projects: ${entry.related_projects.join(', ')}`);
  if ((entry.related_agents || []).length) lines.push(`- Related agents: ${entry.related_agents.join(', ')}`);
  if ((entry.example_messages || []).length) {
    lines.push('- Example messages:');
    entry.example_messages.forEach((item) => lines.push(`  - ${item}`));
  }
  return lines.join('\n');
}

function renderFailureHistoryMarkdown(history = {}) {
  const normalized = normalizeFailureHistory(history);
  const lines = [
    '# Failure History',
    '',
    'Deterministic failure tracking for repeated recognisable failures. Candidate fixes are review-only.',
    '',
    `Version: ${normalized.version}`,
    `Updated: ${normalized.updated_at || nowIso()}`,
    '',
  ];
  if (!normalized.entries.length) {
    lines.push('- (none yet)');
  } else {
    normalized.entries.forEach((entry) => {
      lines.push(renderFailureHistoryEntry(entry));
      lines.push('');
    });
  }
  return lines.join('\n').trimEnd() + '\n';
}

function writeFailureHistory(rootPath, history = {}) {
  const normalized = normalizeFailureHistory({
    ...history,
    updated_at: nowIso(),
  });
  writeJson(failureHistoryJsonPath(rootPath), normalized);
  fs.writeFileSync(failureHistoryMarkdownPath(rootPath), renderFailureHistoryMarkdown(normalized), 'utf8');
  return normalized;
}

function upsertFailureRecord(history, observation = {}) {
  const now = observation.now || nowIso();
  const failureKey = String(observation.failure_key || 'unknown_failure').trim() || 'unknown_failure';
  const stage = String(observation.stage || observation.related_stage || observation.relatedStage || '').trim() || null;
  const agentIdentity = normalizeAgentIdentity({
    agent_id: observation.agent_id || observation.agentId || null,
    agent_version: observation.agent_version || observation.agentVersion || null,
  }, resolveStageAgentIdentity(stage || 'dave'));
  const entries = Array.isArray(history.entries) ? [...history.entries] : [];
  const existingIndex = entries.findIndex((entry) => entry.failure_key === failureKey);
  const normalizedMessage = String(observation.message || observation.rawMessage || observation.error || '').trim();
  const relatedTool = String(observation.related_tool || observation.relatedTool || '').trim();
  const relatedStage = String(observation.related_stage || observation.relatedStage || '').trim();
  const relatedRun = String(observation.related_run || observation.relatedRun || observation.runId || '').trim();
  const relatedProject = String(observation.related_project || observation.relatedProject || observation.projectKey || '').trim();
  const nextEntry = existingIndex >= 0 ? { ...entries[existingIndex] } : normalizeFailureRecord({
    failure_key: failureKey,
    count: 0,
    first_seen: now,
    last_seen: now,
    example_messages: [],
    related_tools: [],
    related_stages: [],
    related_runs: [],
    related_projects: [],
    related_agents: [],
    source_count: 0,
  });

  nextEntry.failure_key = failureKey;
  nextEntry.stage = stage || nextEntry.stage || null;
  nextEntry.agent_id = agentIdentity.agent_id;
  nextEntry.agent_version = agentIdentity.agent_version;
  nextEntry.count = Number(nextEntry.count || 0) + 1;
  nextEntry.first_seen = nextEntry.first_seen || now;
  nextEntry.last_seen = now;
  nextEntry.source_count = Number(nextEntry.source_count || 0) + 1;
  if (normalizedMessage) {
    nextEntry.example_messages = uniqueStrings([normalizedMessage, ...(nextEntry.example_messages || [])]).slice(0, FAILURE_EXAMPLE_LIMIT);
  }
  if (relatedTool) nextEntry.related_tools = uniqueStrings([relatedTool, ...(nextEntry.related_tools || [])]).slice(0, 5);
  if (relatedStage) nextEntry.related_stages = uniqueStrings([relatedStage, ...(nextEntry.related_stages || [])]).slice(0, 5);
  if (relatedRun) nextEntry.related_runs = uniqueStrings([relatedRun, ...(nextEntry.related_runs || [])]).slice(0, 5);
  if (relatedProject) nextEntry.related_projects = uniqueStrings([relatedProject, ...(nextEntry.related_projects || [])]).slice(0, 5);
  nextEntry.related_agents = uniqueStrings([agentIdentity.agent_id, ...(nextEntry.related_agents || [])]).slice(0, 5);

  if (existingIndex >= 0) {
    entries[existingIndex] = nextEntry;
  } else {
    entries.unshift(nextEntry);
  }

  return normalizeFailureHistory({
    version: history.version || FAILURE_MEMORY_VERSION,
    updated_at: now,
    entries,
  });
}

function refreshCandidateKnownFixesFromFailureHistory(rootPath, { threshold = FAILURE_CANDIDATE_THRESHOLD } = {}) {
  const history = readFailureHistory(rootPath).history;
  const candidates = history.entries
    .filter((entry) => entry.count >= threshold && entry.failure_key !== 'unknown_failure')
    .map((entry) => buildKnownFixCandidateEntryFromFailureRecord(entry))
    .sort((left, right) => {
      const countDelta = Number(right.count || 0) - Number(left.count || 0);
      if (countDelta !== 0) return countDelta;
      return String(right.lastSeen || '').localeCompare(String(left.lastSeen || ''));
    });
  const candidateLibrary = writeKnownFixCandidates(rootPath, {
    version: 'ace/known-fix-candidates.v1',
    entries: candidates,
  });
  return {
    threshold,
    history,
    candidateLibrary,
    historyPath: failureHistoryJsonPath(rootPath),
    historyMarkdownPath: failureHistoryMarkdownPath(rootPath),
    candidateJsonPath: readKnownFixCandidates(rootPath).jsonPath,
    candidateMarkdownPath: readKnownFixCandidates(rootPath).markdownPath,
  };
}

function recordFailureOccurrence(rootPath, observation = {}) {
  const failureKey = normalizeFailureKey(observation.message || observation.rawMessage || observation.error || '', observation);
  const stage = String(observation.stage || observation.related_stage || observation.relatedStage || '').trim() || null;
  const agentIdentity = normalizeAgentIdentity({
    agent_id: observation.agent_id || observation.agentId || null,
    agent_version: observation.agent_version || observation.agentVersion || null,
  }, resolveStageAgentIdentity(stage || 'dave'));
  const historySnapshot = readFailureHistory(rootPath);
  const nextHistory = upsertFailureRecord(historySnapshot.history, {
    ...observation,
    stage,
    agent_id: agentIdentity.agent_id,
    agent_version: agentIdentity.agent_version,
    failure_key: failureKey,
  });
  const storedHistory = writeFailureHistory(rootPath, nextHistory);
  const candidateReview = refreshCandidateKnownFixesFromFailureHistory(rootPath);
  console.warn('[WARN] failure recorded', JSON.stringify({
    failureKey,
    stage,
    agent_id: agentIdentity.agent_id,
  }));
  return {
    failureKey,
    record: storedHistory.entries.find((entry) => entry.failure_key === failureKey) || null,
    history: storedHistory,
    candidateReview,
  };
}

function summarizeFailureHistory(rootPath) {
  const history = readFailureHistory(rootPath).history;
  return {
    version: history.version,
    updated_at: history.updated_at,
    totalKeys: history.entries.length,
    repeatedKeys: history.entries.filter((entry) => entry.count >= FAILURE_CANDIDATE_THRESHOLD).length,
    topFailures: history.entries.slice(0, 5).map((entry) => ({
      failure_key: entry.failure_key,
      count: entry.count,
      last_seen: entry.last_seen,
    })),
  };
}

module.exports = {
  FAILURE_CANDIDATE_THRESHOLD,
  FAILURE_EXAMPLE_LIMIT,
  FAILURE_HISTORY_JSON_NAME,
  FAILURE_HISTORY_MD_NAME,
  FAILURE_MEMORY_RELATIVE_DIR,
  FAILURE_MEMORY_VERSION,
  failureHistoryDir,
  failureHistoryJsonPath,
  failureHistoryMarkdownPath,
  normalizeFailureKey,
  normalizeFailureHistory,
  normalizeFailureRecord,
  normalizeFailureText,
  recordFailureOccurrence,
  refreshCandidateKnownFixesFromFailureHistory,
  readFailureHistory,
  renderFailureHistoryMarkdown,
  summarizeFailureHistory,
  upsertFailureRecord,
  writeFailureHistory,
};
