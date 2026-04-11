const fs = require('fs');
const path = require('path');

const {
  readFailureHistory,
  summarizeFailureHistory,
} = require('./failureMemory');
const {
  callOllamaGenerate,
} = require('./llmAdapter');
const {
  DEFAULT_OLLAMA_HOST,
} = require('./localModelClient');

const CHIEF_OF_STAFF_REGISTRATION = Object.freeze({
  id: 'cto-chief-of-staff',
  name: 'Chief of Staff',
  type: 'advisory',
  authority: 'read-only',
  reports_to: 'cto',
});

const DEFAULT_CHIEF_OF_STAFF_MODEL = 'qwen2.5-coder:1.5b';
const DEFAULT_CHIEF_OF_STAFF_TIMEOUT_MS = 25000;
const DEFAULT_CHIEF_OF_STAFF_MODEL_BACKEND = 'ollama_http';
const DEFAULT_CHIEF_OF_STAFF_MAX_REPLY_CHARS = 1200;
const CHIEF_OF_STAFF_OVERSCOPED_PROMPT_CHARS = 3200;

let latestChiefOfStaffAdvisory = null;

function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
}

function truncateText(value = '', limit = 220) {
  const text = String(value || '').trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}...`;
}

function normalizeStatusFlags(flags = {}) {
  if (!flags || typeof flags !== 'object' || Array.isArray(flags)) return {};
  return Object.fromEntries(
    Object.entries(flags)
      .filter(([key, value]) => String(key || '').trim() && value !== undefined && value !== null && value !== '')
      .map(([key, value]) => [key, value]),
  );
}

function readRegisteredAgentIds(rootPath) {
  const agentsDir = path.join(rootPath, 'agents');
  if (!fs.existsSync(agentsDir)) return [];
  try {
    return fs.readdirSync(agentsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function extractKnownIds(value, fallbackObjectKey = null) {
  if (Array.isArray(value)) return uniqueStrings(value);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (fallbackObjectKey && value[fallbackObjectKey] && typeof value[fallbackObjectKey] === 'object') {
      return uniqueStrings(Object.keys(value[fallbackObjectKey]));
    }
    return uniqueStrings(Object.keys(value));
  }
  return [];
}

function extractCanonicalSummaryFromSnapshot(snapshot = {}) {
  const knownAgents = uniqueStrings([
    ...extractKnownIds(snapshot.known_agents),
    ...extractKnownIds(snapshot.knownAgents),
    ...extractKnownIds(snapshot.agents),
  ]);
  const knownDesks = uniqueStrings([
    ...extractKnownIds(snapshot.known_desks),
    ...extractKnownIds(snapshot.knownDesks),
    ...extractKnownIds(snapshot.desks),
  ]);
  const statusFlags = normalizeStatusFlags(
    snapshot.system_status_flags
    || snapshot.systemStatusFlags
    || snapshot.status_flags
    || snapshot.status
    || {},
  );
  return {
    known_agents: knownAgents,
    known_desks: knownDesks,
    system_status_flags: statusFlags,
  };
}

function extractCanonicalSummaryFromRegistry(rootPath) {
  const domainsPath = path.join(rootPath, 'brain', 'emergence', 'canonical_truth_domains.json');
  const projectionsPath = path.join(rootPath, 'brain', 'emergence', 'canonical_truth_projections.json');
  const domainsPayload = safeReadJson(domainsPath);
  const projectionsPayload = safeReadJson(projectionsPath);
  const domains = Array.isArray(domainsPayload?.domains) ? domainsPayload.domains : null;
  const projections = Array.isArray(projectionsPayload?.projections) ? projectionsPayload.projections : null;

  if (!domains || !projections) return null;

  const workspace = safeReadJson(path.join(rootPath, 'data', 'spatial', 'workspace.json')) || {};
  const qaSummary = safeReadJson(path.join(rootPath, 'data', 'spatial', 'qa', 'structured', 'latest.json')) || null;
  const knownAgents = uniqueStrings([
    ...readRegisteredAgentIds(rootPath),
    ...Object.keys(workspace?.studio?.agentWorkers || {}),
  ]);
  const knownDesks = uniqueStrings(Object.keys(workspace?.studio?.layout?.desks || {}));
  const systemStatusFlags = normalizeStatusFlags({
    registry_valid: true,
    workspace_present: Boolean(workspace && Object.keys(workspace).length),
    qa_summary_available: Boolean(qaSummary),
    qa_status: qaSummary?.status || null,
    domain_count: domains.length,
    projection_count: projections.length,
  });

  return {
    known_agents: knownAgents,
    known_desks: knownDesks,
    system_status_flags: systemStatusFlags,
  };
}

function loadCanonicalTruth(rootPath) {
  const snapshotPath = path.join(rootPath, 'brain', 'context', 'canonical_truth.json');
  const snapshot = safeReadJson(snapshotPath);
  if (snapshot) {
    return {
      canonical_available: true,
      canonical_summary: extractCanonicalSummaryFromSnapshot(snapshot),
    };
  }

  const registrySummary = extractCanonicalSummaryFromRegistry(rootPath);
  if (registrySummary) {
    return {
      canonical_available: true,
      canonical_summary: registrySummary,
    };
  }

  return {
    canonical_available: false,
    canonical_summary: null,
  };
}

function sortFailuresByPriority(entries = []) {
  return [...entries].sort((left, right) => {
    const countDelta = Number(right?.count || 0) - Number(left?.count || 0);
    if (countDelta !== 0) return countDelta;
    const leftSeen = Date.parse(left?.last_seen || left?.updated_at || 0) || 0;
    const rightSeen = Date.parse(right?.last_seen || right?.updated_at || 0) || 0;
    return rightSeen - leftSeen;
  });
}

function resolvePrimaryFailure(rootPath) {
  const summary = summarizeFailureHistory(rootPath);
  const history = readFailureHistory(rootPath).history;
  const sortedEntries = sortFailuresByPriority(history?.entries || []);
  if (!sortedEntries.length) return null;

  const summaryKey = String(summary?.topFailures?.[0]?.failure_key || '').trim();
  const summaryCount = Number(summary?.topFailures?.[0]?.count || 0);
  const matchedEntry = sortedEntries.find((entry) => (
    entry.failure_key === summaryKey
    && Number(entry.count || 0) === summaryCount
  ));
  const topEntry = matchedEntry || sortedEntries[0];

  return {
    failure_key: topEntry.failure_key,
    stage: topEntry.stage || null,
    count: Number(topEntry.count || 0),
  };
}

function buildChiefOfStaffPosture(rootPath) {
  const blocker = resolvePrimaryFailure(rootPath);
  const canonical = loadCanonicalTruth(rootPath);

  return {
    blocked: Boolean(blocker),
    blocker: blocker || null,
    canonical_available: canonical.canonical_available,
    canonical_summary: canonical.canonical_summary,
    system_confidence: blocker
      ? 0.9
      : (canonical.canonical_available ? 0.6 : 0.3),
  };
}

function buildRecommendation(posture = {}) {
  if (posture.blocked === true && posture.blocker) {
    return {
      id: 'resolve_blocker',
      priority: 'high',
      title: 'Resolve system blocker',
      category: 'unblock',
      blocker: posture.blocker.failure_key,
      stage: posture.blocker.stage,
      why_now: 'System execution is currently blocked',
      recommendation_text: 'Resolve the underlying issue before attempting further execution',
      execution_ready: false,
      confidence: 0.9,
    };
  }

  return {
    id: 'no_blocker',
    priority: 'normal',
    title: 'No critical blockers detected',
    category: 'info',
    execution_ready: false,
    confidence: 0.5,
  };
}

function classifyChiefOfStaffQuery(userQuery = '') {
  const text = String(userQuery || '').trim().toLowerCase();

  if (!text) return 'chat';

  if (
    text.includes('next slice')
    || text.includes('next step')
    || text.includes('what should we do next')
    || text.includes('write a slice')
    || text.includes('report')
    || text.includes('summary')
    || text.includes('handover')
  ) {
    return 'structured_report';
  }

  if (
    text.includes('execute')
    || text.includes('run this')
    || text.includes('do it')
    || text.includes('trigger')
    || text.includes('confirm action')
  ) {
    return 'action_request';
  }

  if (
    text.includes('blocker')
    || text.includes('status')
    || text.includes('diagnose')
    || text.includes('what is wrong')
    || text.includes('why')
  ) {
    return 'advice';
  }

  return 'chat';
}

function buildChiefOfStaffPrompt(posture, recommendation, userQuery) {
  return buildChiefOfStaffPromptProfile(posture, recommendation, userQuery).prompt;
}

function buildChiefOfStaffCanonicalSummaryLines(canonicalSummary = {}) {
  if (!canonicalSummary || typeof canonicalSummary !== 'object') {
    return ['- Canonical registry summary unavailable'];
  }
  const knownAgents = Array.isArray(canonicalSummary.known_agents)
    ? canonicalSummary.known_agents.slice(0, 6)
    : [];
  const knownDesks = Array.isArray(canonicalSummary.known_desks)
    ? canonicalSummary.known_desks.slice(0, 6)
    : [];
  const statusFlags = canonicalSummary.system_status_flags && typeof canonicalSummary.system_status_flags === 'object'
    ? Object.entries(canonicalSummary.system_status_flags)
      .slice(0, 6)
      .map(([key, value]) => `${key}=${value}`)
    : [];
  return [
    `- Known agents: ${knownAgents.join(', ') || 'none'}`,
    `- Known desks: ${knownDesks.join(', ') || 'none'}`,
    `- Status flags: ${statusFlags.join(', ') || 'none'}`,
  ];
}

function buildChiefOfStaffPostureLines(posture = {}) {
  const lines = [
    `- Blocked: ${posture?.blocked === true ? 'yes' : 'no'}`,
    `- Canonical visibility: ${posture?.canonical_available === true ? 'available' : 'limited'}`,
    `- System confidence: ${Number.isFinite(Number(posture?.system_confidence))
      ? Number(posture.system_confidence).toFixed(2)
      : 'unknown'}`,
  ];
  if (posture?.blocker?.failure_key) {
    lines.push(`- Primary blocker: ${posture.blocker.failure_key}`);
    if (posture.blocker.stage) lines.push(`- Blocker stage: ${posture.blocker.stage}`);
    if (Number.isFinite(Number(posture.blocker.count))) lines.push(`- Blocker count: ${Number(posture.blocker.count)}`);
  }
  return lines;
}

function buildChiefOfStaffRecommendationLines(recommendation = {}) {
  return [
    `- Recommendation id: ${recommendation?.id || 'none'}`,
    `- Priority: ${recommendation?.priority || 'normal'}`,
    `- Category: ${recommendation?.category || 'info'}`,
    `- Title: ${truncateText(recommendation?.title || 'No recommendation title', 160)}`,
    `- Next step: ${truncateText(recommendation?.recommendation_text || recommendation?.why_now || 'Continue gathering grounded evidence.', 220)}`,
  ];
}

function buildChiefOfStaffPromptProfile(posture, recommendation, userQuery) {
  const mode = classifyChiefOfStaffQuery(userQuery);
  const contextMode = mode === 'chat'
    ? 'scoped'
    : (mode === 'structured_report' || mode === 'action_request' ? 'broad' : 'scoped');
  const broaderContextAvailable = posture?.canonical_available === true;
  const includedSections = ['identity', 'user_question'];
  const lines = [
    'You are CTO Chief of Staff for an AI system.',
    'Use only the supplied grounded state.',
    'Do not invent systems, authority, or missing evidence.',
  ];

  if (mode === 'chat') {
    lines.push(
      'Be brief, direct, and conversational.',
      '',
      'USER QUESTION:',
      String(userQuery || '').trim(),
    );
  } else {
    includedSections.push('posture_summary', 'recommendation_summary');
    lines.push(
      'Answer as an internal technical advisor.',
      'Prefer immediate task context over broad background.',
      '',
      '## Posture Summary',
      ...buildChiefOfStaffPostureLines(posture),
      '',
      '## Recommendation Summary',
      ...buildChiefOfStaffRecommendationLines(recommendation),
      '',
      'USER QUESTION:',
      String(userQuery || '').trim(),
    );

    if (contextMode === 'broad') {
      includedSections.push('secondary_retrieval_summary');
      lines.push(
        '',
        '## Secondary Retrieval Summary',
        broaderContextAvailable
          ? 'Broader canonical context is available and has been reduced to a compact retrieval summary for this request.'
          : 'Broader canonical context is unavailable; do not assume missing registry data exists.',
        ...buildChiefOfStaffCanonicalSummaryLines(posture?.canonical_summary || null),
      );
    } else {
      includedSections.push('retrieval_policy');
      lines.push(
        '',
        '## Retrieval Policy',
        broaderContextAvailable
          ? 'Broader canonical context is available on demand but is intentionally not injected into this scoped advisory.'
          : 'Canonical registry context is unavailable, so stay within the immediate evidence.',
      );
    }

    lines.push(
      '',
      'RULES:',
      '- Prioritize blockers over all other concerns.',
      '- If visibility is limited, say so plainly.',
      '- Explain what should happen next without pretending to execute it.',
      '',
      'OUTPUT:',
      '- short advisory response',
      '- grounded state',
      '- next step',
    );
  }

  const prompt = lines.join('\n').trim();
  return {
    mode,
    contextMode,
    prompt,
    promptChars: prompt.length,
    broaderContextAvailable,
    includedSections,
    repairApplied: {
      timeout_changed: true,
      prompt_scope_changed: true,
      retrieval_shifted: true,
      notes: 'Chief of Staff now defaults to scoped summaries and only adds compact retrieval summaries for structured or action-oriented requests.',
    },
  };
}

function buildFallbackReply(posture = {}, recommendation = {}) {
  const lines = [];

  if (posture.blocked && posture.blocker) {
    lines.push(`Current system state: blocked by ${posture.blocker.failure_key}${posture.blocker.stage ? ` at ${posture.blocker.stage}` : ''} with ${posture.blocker.count} recorded occurrences.`);
  } else {
    lines.push('Current system state: no critical blockers detected.');
  }

  if (posture.canonical_available === false) {
    lines.push('Canonical truth is unavailable, so visibility is limited.');
  }

  if (recommendation?.id === 'resolve_blocker') {
    lines.push('Next step: resolve the blocker before attempting further execution.');
  } else {
    lines.push('Next step: continue monitoring and gather more canonical evidence before execution.');
  }

  return lines.join(' ');
}

function classifyChiefOfStaffFailureReason(error, { promptChars = 0, contextMode = 'scoped' } = {}) {
  const reason = String(error?.message || error || '').trim().toLowerCase();
  if (!reason) return 'unknown';
  if (reason.includes('timed out') || reason.includes('timeout')) {
    if (promptChars >= CHIEF_OF_STAFF_OVERSCOPED_PROMPT_CHARS || contextMode === 'broad') {
      return 'overscoped_context';
    }
    return 'timeout';
  }
  if (
    reason.includes('http')
    || reason.includes('fetch')
    || reason.includes('connection refused')
    || reason.includes('econnrefused')
    || reason.includes('unavailable')
    || reason.includes('offline')
    || reason.includes('no fetch implementation')
  ) {
    return 'model_unavailable';
  }
  if (reason.includes('empty response') || reason.includes('returned an empty response')) {
    return 'bad_prompt_shape';
  }
  return 'unknown';
}

function classifyChiefOfStaffModelFailure(error, options = {}) {
  const failureReason = classifyChiefOfStaffFailureReason(error, options);
  if (failureReason === 'timeout' || failureReason === 'overscoped_context') return 'timeout';
  if (failureReason === 'model_unavailable') return 'unavailable';
  return 'fallback';
}

function buildChiefOfStaffCognitionDiagnostics({
  model = DEFAULT_CHIEF_OF_STAFF_MODEL,
  timeoutMs = DEFAULT_CHIEF_OF_STAFF_TIMEOUT_MS,
  promptProfile = null,
  usedLiveCall = false,
  usedFallback = false,
  error = null,
}) {
  const failureReason = usedFallback
    ? classifyChiefOfStaffFailureReason(error, {
      promptChars: Number(promptProfile?.promptChars || 0),
      contextMode: promptProfile?.contextMode || 'scoped',
    })
    : null;
  return {
    agent_id: CHIEF_OF_STAFF_REGISTRATION.id,
    intended_model: model || null,
    actual_model: model || null,
    timeout_ms: Number(timeoutMs || DEFAULT_CHIEF_OF_STAFF_TIMEOUT_MS),
    prompt_chars: Number(promptProfile?.promptChars || 0),
    context_mode: promptProfile?.contextMode || 'scoped',
    used_live_call: Boolean(usedLiveCall),
    used_fallback: Boolean(usedFallback),
    failure_reason: failureReason,
    included_sections: Array.isArray(promptProfile?.includedSections) ? promptProfile.includedSections : [],
    broader_context_available: Boolean(promptProfile?.broaderContextAvailable),
    repair_applied: promptProfile?.repairApplied || {
      timeout_changed: true,
      prompt_scope_changed: true,
      retrieval_shifted: true,
      notes: 'Chief of Staff cognitive path now uses scoped prompt construction by default.',
    },
  };
}

function cloneChiefOfStaffPayload(payload = null) {
  if (!payload || typeof payload !== 'object') return null;
  return JSON.parse(JSON.stringify(payload));
}

function buildChiefOfStaffLatestSnapshot(payload = null) {
  if (!payload || typeof payload !== 'object') {
    return {
      advisory_available: false,
      reply_text: null,
      reply_source: null,
      model_backend: null,
      model_name: null,
      model_status: null,
      advisory_generated_at: null,
      execution_ready: false,
      fallback_used: false,
      recommendation: null,
      posture: null,
    };
  }

  return {
    advisory_available: true,
    reply_text: String(payload.reply_text || '').trim() || null,
    reply_source: payload.reply_source || null,
    model_backend: payload.model_backend || DEFAULT_CHIEF_OF_STAFF_MODEL_BACKEND,
    model_name: payload.model_name || DEFAULT_CHIEF_OF_STAFF_MODEL,
    model_status: payload.model_status || null,
    advisory_generated_at: payload.advisory_generated_at || null,
    execution_ready: Boolean(payload.execution_ready),
    fallback_used: payload.reply_source === 'deterministic_fallback',
    recommendation: payload.recommendation ? {
      id: payload.recommendation.id || null,
      title: payload.recommendation.title || null,
      category: payload.recommendation.category || null,
      blocker: payload.recommendation.blocker || null,
      stage: payload.recommendation.stage || null,
      why_now: payload.recommendation.why_now || null,
      recommendation_text: payload.recommendation.recommendation_text || null,
      execution_ready: Boolean(payload.recommendation.execution_ready),
      confidence: Number.isFinite(Number(payload.recommendation.confidence))
        ? Number(payload.recommendation.confidence)
        : null,
      canonical_action_id: String(
        payload.recommendation.canonical_action_id
        || payload.recommendation.action_id
        || '',
      ).trim() || null,
    } : null,
    posture: payload.posture ? {
      blocked: Boolean(payload.posture.blocked),
      blocker: payload.posture.blocker ? {
        failure_key: payload.posture.blocker.failure_key || null,
        stage: payload.posture.blocker.stage || null,
        count: Number.isFinite(Number(payload.posture.blocker.count))
          ? Number(payload.posture.blocker.count)
          : null,
      } : null,
      canonical_available: Boolean(payload.posture.canonical_available),
      canonical_summary: payload.posture.canonical_summary || null,
      system_confidence: Number.isFinite(Number(payload.posture.system_confidence))
        ? Number(payload.posture.system_confidence)
        : null,
    } : null,
    cognition_diagnostics: payload.cognition_diagnostics || null,
  };
}

function recordLatestChiefOfStaffAdvisory(payload = null) {
  latestChiefOfStaffAdvisory = buildChiefOfStaffLatestSnapshot(payload);
  return cloneChiefOfStaffPayload(latestChiefOfStaffAdvisory);
}

function readLatestChiefOfStaffAdvisory() {
  return cloneChiefOfStaffPayload(
    latestChiefOfStaffAdvisory || buildChiefOfStaffLatestSnapshot(null),
  );
}

function clearLatestChiefOfStaffAdvisory() {
  latestChiefOfStaffAdvisory = null;
}

async function requestChiefOfStaffModelReply({
  prompt,
  model = DEFAULT_CHIEF_OF_STAFF_MODEL,
  host = DEFAULT_OLLAMA_HOST,
  timeoutMs = DEFAULT_CHIEF_OF_STAFF_TIMEOUT_MS,
  callModel = callOllamaGenerate,
  fetchImpl = globalThis.fetch,
}) {
  const result = await callModel({
    prompt,
    model,
    host,
    timeoutMs,
    expectJson: false,
    fetchImpl,
  });
  return String(result?.text || '').trim().slice(0, DEFAULT_CHIEF_OF_STAFF_MAX_REPLY_CHARS);
}

async function runChiefOfStaffAgent(posture, recommendation, userQuery, options = {}) {
  const promptProfile = buildChiefOfStaffPromptProfile(posture, recommendation, userQuery);
  const prompt = promptProfile.prompt;
  const advisory_generated_at = new Date().toISOString();
  const model = options.model || DEFAULT_CHIEF_OF_STAFF_MODEL;
  const host = options.host || DEFAULT_OLLAMA_HOST;
  const timeoutMs = Number(options.timeoutMs || DEFAULT_CHIEF_OF_STAFF_TIMEOUT_MS);
  const callModel = typeof options.callModel === 'function'
    ? options.callModel
    : callOllamaGenerate;
  const runner = typeof options.runner === 'function'
    ? options.runner
    : ((runnerOptions) => requestChiefOfStaffModelReply(runnerOptions));

  try {
    const reply = await runner({
      prompt,
      model,
      host,
      timeoutMs,
      callModel,
      fetchImpl: options.fetchImpl || globalThis.fetch,
      posture,
      recommendation,
      userQuery,
      promptProfile,
    });
    const replyText = String(reply || '').trim();
    if (!replyText) {
      throw new Error('Chief of Staff model returned an empty response.');
    }
    return {
      reply_text: replyText,
      reply_source: 'model_live',
      model_backend: DEFAULT_CHIEF_OF_STAFF_MODEL_BACKEND,
      model_name: model,
      model_status: 'ok',
      advisory_generated_at,
      execution_ready: Boolean(recommendation?.execution_ready),
      cognition_diagnostics: buildChiefOfStaffCognitionDiagnostics({
        model,
        timeoutMs,
        promptProfile,
        usedLiveCall: true,
        usedFallback: false,
      }),
    };
  } catch (error) {
    const cognitionDiagnostics = buildChiefOfStaffCognitionDiagnostics({
      model,
      timeoutMs,
      promptProfile,
      usedLiveCall: true,
      usedFallback: true,
      error,
    });
    return {
      reply_text: buildFallbackReply(posture, recommendation),
      reply_source: 'deterministic_fallback',
      model_backend: DEFAULT_CHIEF_OF_STAFF_MODEL_BACKEND,
      model_name: model,
      model_status: classifyChiefOfStaffModelFailure(error, {
        promptChars: cognitionDiagnostics.prompt_chars,
        contextMode: cognitionDiagnostics.context_mode,
      }),
      advisory_generated_at,
      execution_ready: Boolean(recommendation?.execution_ready),
      cognition_diagnostics: cognitionDiagnostics,
    };
  }
}

async function queryChiefOfStaff(rootPath, userQuery, options = {}) {
  const posture = buildChiefOfStaffPosture(rootPath);
  const recommendation = buildRecommendation(posture);
  const reply = await runChiefOfStaffAgent(posture, recommendation, userQuery, options);
  const response = {
    ...reply,
    recommendation,
    posture,
    execution_ready: Boolean(recommendation?.execution_ready),
  };
  recordLatestChiefOfStaffAdvisory(response);
  return response;
}

module.exports = {
  CHIEF_OF_STAFF_REGISTRATION,
  DEFAULT_CHIEF_OF_STAFF_MODEL,
  DEFAULT_CHIEF_OF_STAFF_MODEL_BACKEND,
  DEFAULT_CHIEF_OF_STAFF_MAX_REPLY_CHARS,
  DEFAULT_CHIEF_OF_STAFF_TIMEOUT_MS,
  buildChiefOfStaffPosture,
  buildChiefOfStaffPromptProfile,
  buildChiefOfStaffCognitionDiagnostics,
  buildRecommendation,
  buildChiefOfStaffPrompt,
  buildChiefOfStaffLatestSnapshot,
  clearLatestChiefOfStaffAdvisory,
  classifyChiefOfStaffFailureReason,
  classifyChiefOfStaffModelFailure,
  queryChiefOfStaff,
  readLatestChiefOfStaffAdvisory,
  recordLatestChiefOfStaffAdvisory,
  requestChiefOfStaffModelReply,
  runChiefOfStaffAgent,
};
