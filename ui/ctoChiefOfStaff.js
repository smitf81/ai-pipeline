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
  runOllamaTagsProbe,
} = require('./localModelClient');
const {
  resolveAgentDefinition,
} = require('./agentRegistry');

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
const CHIEF_OF_STAFF_READINESS_STALE_MS = 45000;
const CHIEF_OF_STAFF_WARM_TIMEOUT_MS = 7000;
const CHIEF_OF_STAFF_WARM_PROMPT = 'Reply with READY.';

let latestChiefOfStaffAdvisory = null;
let latestChiefOfStaffReadiness = null;
let chiefOfStaffWarmPromise = null;

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

function normalizeText(value = '') {
  return String(value || '').trim();
}

function clampPositiveInteger(value, fallback) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) return fallback;
  return Math.round(normalized);
}

function buildChiefOfStaffFallbackManifest() {
  return {
    id: CHIEF_OF_STAFF_REGISTRATION.id,
    name: CHIEF_OF_STAFF_REGISTRATION.name,
    deskId: 'cto-architect',
    runtime: 'ollama-shell',
    backend: 'ollama',
    model: DEFAULT_CHIEF_OF_STAFF_MODEL,
    host: DEFAULT_OLLAMA_HOST,
    timeoutMs: DEFAULT_CHIEF_OF_STAFF_TIMEOUT_MS,
    autoRun: false,
    type: CHIEF_OF_STAFF_REGISTRATION.type,
    authority: CHIEF_OF_STAFF_REGISTRATION.authority,
    reports_to: CHIEF_OF_STAFF_REGISTRATION.reports_to,
    inputs: [
      'brain/context/failure_history.json',
      'brain/context/canonical_truth.json',
      'brain/emergence/canonical_truth_domains.json',
      'brain/emergence/canonical_truth_projections.json',
      'data/spatial/qa/structured/latest.json',
      'data/spatial/workspace.json',
    ],
    outputs: ['advisory-response'],
    writesCanonicalBrain: false,
  };
}

function resolveChiefOfStaffRuntime(rootPath, options = {}) {
  const definition = rootPath
    ? resolveAgentDefinition(rootPath, CHIEF_OF_STAFF_REGISTRATION.id, {
      fallbackManifest: buildChiefOfStaffFallbackManifest(),
      fallbackPrompt: '',
    })
    : {
      valid: false,
      manifestPath: null,
      manifest: buildChiefOfStaffFallbackManifest(),
      errors: ['rootPath missing; using fallback Chief of Staff manifest.'],
    };
  const manifest = definition?.manifest || buildChiefOfStaffFallbackManifest();
  return {
    definition,
    manifest,
    model: normalizeText(options.model) || normalizeText(manifest.model) || DEFAULT_CHIEF_OF_STAFF_MODEL,
    host: normalizeText(options.host) || normalizeText(manifest.host) || DEFAULT_OLLAMA_HOST,
    timeoutMs: clampPositiveInteger(options.timeoutMs, clampPositiveInteger(manifest.timeoutMs, DEFAULT_CHIEF_OF_STAFF_TIMEOUT_MS)),
    configuredBackend: normalizeText(manifest.backend) || 'ollama',
    manifestPath: definition?.manifestPath || null,
    manifestValid: definition?.valid !== false,
    manifestErrors: Array.isArray(definition?.errors) ? definition.errors.slice() : [],
  };
}

function normalizeChiefOfStaffPromptScope(promptScope = '') {
  const normalized = normalizeText(promptScope).toLowerCase();
  if (normalized === 'targeted') return 'scoped';
  return ['scoped', 'broad', 'full'].includes(normalized) ? normalized : 'scoped';
}

function classifyChiefOfStaffPromptScope(userQuery = '') {
  const mode = classifyChiefOfStaffQuery(userQuery);
  if (mode === 'structured_report' || mode === 'action_request') return 'broad';
  return 'scoped';
}

function resolveChiefOfStaffPromptScope({ userQuery = '', promptScope = null } = {}) {
  if (promptScope) return normalizeChiefOfStaffPromptScope(promptScope);
  return classifyChiefOfStaffPromptScope(userQuery);
}

function toChiefOfStaffScopeTier(contextMode = 'scoped') {
  return contextMode === 'scoped' ? 'targeted' : contextMode;
}

function buildChiefOfStaffReadinessSnapshot({
  rootPath = null,
  runtime = null,
  status = 'unavailable',
  reason = null,
  source = 'chief_of_staff',
  stage = 'probe',
  checkedAt = null,
  warmed = false,
  warmAttempted = false,
  availableModels = [],
} = {}) {
  const resolvedRuntime = runtime || resolveChiefOfStaffRuntime(rootPath);
  return {
    agent_id: CHIEF_OF_STAFF_REGISTRATION.id,
    status: normalizeText(status) || 'unavailable',
    reason: normalizeText(reason) || null,
    source: normalizeText(source) || 'chief_of_staff',
    stage: normalizeText(stage) || 'probe',
    checked_at: normalizeText(checkedAt) || new Date().toISOString(),
    warm_attempted: Boolean(warmAttempted),
    warmed: Boolean(warmed),
    model: resolvedRuntime.model,
    host: resolvedRuntime.host,
    timeout_ms: resolvedRuntime.timeoutMs,
    configured_backend: resolvedRuntime.configuredBackend,
    manifest_path: resolvedRuntime.manifestPath,
    manifest_valid: Boolean(resolvedRuntime.manifestValid),
    manifest_errors: resolvedRuntime.manifestErrors,
    available_models: Array.isArray(availableModels)
      ? availableModels.map((entry) => normalizeText(entry)).filter(Boolean)
      : [],
  };
}

function cloneChiefOfStaffReadiness(payload = null) {
  if (!payload || typeof payload !== 'object') return null;
  return JSON.parse(JSON.stringify(payload));
}

function recordChiefOfStaffReadiness(payload = null) {
  latestChiefOfStaffReadiness = buildChiefOfStaffReadinessSnapshot(payload || {});
  return cloneChiefOfStaffReadiness(latestChiefOfStaffReadiness);
}

function readChiefOfStaffReadiness() {
  return cloneChiefOfStaffReadiness(latestChiefOfStaffReadiness);
}

function isChiefOfStaffReadinessFresh(snapshot = null, maxAgeMs = CHIEF_OF_STAFF_READINESS_STALE_MS) {
  const checkedAt = Date.parse(snapshot?.checked_at || 0) || 0;
  if (!checkedAt) return false;
  return (Date.now() - checkedAt) <= Math.max(1000, Number(maxAgeMs) || CHIEF_OF_STAFF_READINESS_STALE_MS);
}

async function probeChiefOfStaffReadiness({ rootPath, fetchImpl = globalThis.fetch, runtime = null } = {}) {
  const resolvedRuntime = runtime || resolveChiefOfStaffRuntime(rootPath);
  const probe = await runOllamaTagsProbe({
    host: resolvedRuntime.host,
    timeoutMs: Math.min(1800, resolvedRuntime.timeoutMs),
    fetchImpl,
  });
  if (!probe?.ok) {
    return recordChiefOfStaffReadiness({
      rootPath,
      runtime: resolvedRuntime,
      status: 'unavailable',
      reason: probe?.reason || 'Chief of Staff model host is unreachable.',
      stage: 'reachability_probe',
      checkedAt: probe?.checkedAt,
      availableModels: probe?.availableModels,
    });
  }
  const availableModels = Array.isArray(probe.availableModels) ? probe.availableModels : [];
  const modelAdvertised = !availableModels.length || availableModels.includes(resolvedRuntime.model);
  if (!modelAdvertised) {
    return recordChiefOfStaffReadiness({
      rootPath,
      runtime: resolvedRuntime,
      status: 'unavailable',
      reason: `Assigned Chief of Staff model "${resolvedRuntime.model}" is not advertised by Ollama.`,
      stage: 'reachability_probe',
      checkedAt: probe.checkedAt,
      availableModels,
    });
  }
  return recordChiefOfStaffReadiness({
    rootPath,
    runtime: resolvedRuntime,
    status: 'warming',
    reason: 'Assigned Chief of Staff model is reachable and warming.',
    stage: 'reachability_probe',
    checkedAt: probe.checkedAt,
    availableModels,
  });
}

async function warmChiefOfStaffModel({ rootPath, fetchImpl = globalThis.fetch, callModel = callOllamaGenerate, force = false } = {}) {
  if (chiefOfStaffWarmPromise && !force) {
    return chiefOfStaffWarmPromise;
  }
  chiefOfStaffWarmPromise = (async () => {
    const runtime = resolveChiefOfStaffRuntime(rootPath);
    const readiness = await probeChiefOfStaffReadiness({ rootPath, fetchImpl, runtime });
    if (readiness.status === 'unavailable') {
      return readiness;
    }
    recordChiefOfStaffReadiness({
      rootPath,
      runtime,
      status: 'warming',
      reason: 'Assigned Chief of Staff model warmup is in progress.',
      stage: 'warm_probe',
      checkedAt: new Date().toISOString(),
      warmAttempted: true,
      availableModels: readiness.available_models,
    });
    try {
      const reply = await requestChiefOfStaffModelReply({
        prompt: CHIEF_OF_STAFF_WARM_PROMPT,
        model: runtime.model,
        host: runtime.host,
        timeoutMs: Math.min(runtime.timeoutMs, CHIEF_OF_STAFF_WARM_TIMEOUT_MS),
        callModel,
        fetchImpl,
      });
      return recordChiefOfStaffReadiness({
        rootPath,
        runtime,
        status: 'live',
        reason: normalizeText(reply) ? 'Assigned Chief of Staff model warmed successfully.' : 'Assigned Chief of Staff model responded to warmup.',
        stage: 'warm_probe',
        checkedAt: new Date().toISOString(),
        warmAttempted: true,
        warmed: true,
        availableModels: readiness.available_models,
      });
    } catch (error) {
      const failureReason = classifyChiefOfStaffFailureReason(error, {
        promptChars: CHIEF_OF_STAFF_WARM_PROMPT.length,
        contextMode: 'scoped',
      });
      if (failureReason === 'timeout') {
        return recordChiefOfStaffReadiness({
          rootPath,
          runtime,
          status: 'warming',
          reason: 'Assigned Chief of Staff model is reachable but still warming.',
          stage: 'warm_probe',
          checkedAt: new Date().toISOString(),
          warmAttempted: true,
          availableModels: readiness.available_models,
        });
      }
      if (failureReason === 'model_unavailable') {
        return recordChiefOfStaffReadiness({
          rootPath,
          runtime,
          status: 'unavailable',
          reason: normalizeText(error?.message || error) || 'Assigned Chief of Staff model became unavailable during warmup.',
          stage: 'warm_probe',
          checkedAt: new Date().toISOString(),
          warmAttempted: true,
          availableModels: readiness.available_models,
        });
      }
      return recordChiefOfStaffReadiness({
        rootPath,
        runtime,
        status: 'degraded',
        reason: normalizeText(error?.message || error) || 'Chief of Staff warmup failed.',
        stage: 'warm_probe',
        checkedAt: new Date().toISOString(),
        warmAttempted: true,
        availableModels: readiness.available_models,
      });
    } finally {
      chiefOfStaffWarmPromise = null;
    }
  })();
  return chiefOfStaffWarmPromise;
}

async function ensureChiefOfStaffReadiness({
  rootPath,
  fetchImpl = globalThis.fetch,
  callModel = callOllamaGenerate,
  warmIfNeeded = true,
  force = false,
} = {}) {
  const snapshot = readChiefOfStaffReadiness();
  if (!force && isChiefOfStaffReadinessFresh(snapshot) && snapshot?.status === 'live') {
    return snapshot;
  }
  if (!force && isChiefOfStaffReadinessFresh(snapshot) && !warmIfNeeded) {
    return snapshot;
  }
  if (warmIfNeeded) {
    return warmChiefOfStaffModel({ rootPath, fetchImpl, callModel, force });
  }
  return probeChiefOfStaffReadiness({ rootPath, fetchImpl });
}

function classifyChiefOfStaffLiveStatus({ usedFallback = false, failureReason = null, readiness = null } = {}) {
  if (!usedFallback) return 'live';
  if ((failureReason === 'timeout') && readiness?.status === 'warming') return 'warming';
  if (failureReason === 'model_unavailable') return 'unavailable';
  return 'degraded';
}

function classifyChiefOfStaffResponseModelStatus({ error = null, promptProfile = null, readiness = null } = {}) {
  const failureReason = classifyChiefOfStaffFailureReason(error, {
    promptChars: Number(promptProfile?.promptChars || 0),
    contextMode: promptProfile?.contextMode || 'scoped',
  });
  if (failureReason === 'timeout' && readiness?.status === 'warming' && promptProfile?.contextMode === 'scoped') {
    return 'warming';
  }
  return classifyChiefOfStaffModelFailure(error, {
    promptChars: Number(promptProfile?.promptChars || 0),
    contextMode: promptProfile?.contextMode || 'scoped',
  });
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

function buildChiefOfStaffPromptProfile(posture, recommendation, userQuery, options = {}) {
  const mode = classifyChiefOfStaffQuery(userQuery);
  const contextMode = resolveChiefOfStaffPromptScope({
    userQuery,
    promptScope: options?.promptScope || null,
  });
  const scopeTier = toChiefOfStaffScopeTier(contextMode);
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

    if (contextMode === 'broad' || contextMode === 'full') {
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
    scopeTier,
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
  runtime = null,
  readiness = null,
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
    configured_model: runtime?.model || model || null,
    manifest_backed_model: runtime?.model || null,
    timeout_ms: Number(timeoutMs || DEFAULT_CHIEF_OF_STAFF_TIMEOUT_MS),
    prompt_chars: Number(promptProfile?.promptChars || 0),
    context_mode: promptProfile?.contextMode || 'scoped',
    context_scope_tier: promptProfile?.scopeTier || toChiefOfStaffScopeTier(promptProfile?.contextMode || 'scoped'),
    used_live_call: Boolean(usedLiveCall),
    used_fallback: Boolean(usedFallback),
    failure_reason: failureReason,
    included_sections: Array.isArray(promptProfile?.includedSections) ? promptProfile.includedSections : [],
    broader_context_available: Boolean(promptProfile?.broaderContextAvailable),
    readiness_status: readiness?.status || null,
    readiness_reason: readiness?.reason || null,
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
  const readiness = readChiefOfStaffReadiness();
  if (!payload || typeof payload !== 'object') {
    return {
      advisory_available: false,
      reply_text: null,
      reply_source: null,
      model_backend: null,
      model_name: null,
      model_status: null,
      live_status: readiness?.status || 'unavailable',
      advisory_generated_at: null,
      execution_ready: false,
      fallback_used: false,
      recommendation: null,
      posture: null,
      agent_readiness: readiness,
    };
  }

  return {
    advisory_available: true,
    reply_text: String(payload.reply_text || '').trim() || null,
    reply_source: payload.reply_source || null,
    model_backend: payload.model_backend || DEFAULT_CHIEF_OF_STAFF_MODEL_BACKEND,
    model_name: payload.model_name || DEFAULT_CHIEF_OF_STAFF_MODEL,
    model_status: payload.model_status || null,
    live_status: payload.live_status || readiness?.status || null,
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
    agent_readiness: payload.agent_readiness || readiness || null,
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
  latestChiefOfStaffReadiness = null;
  chiefOfStaffWarmPromise = null;
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
  const runtime = resolveChiefOfStaffRuntime(options.rootPath || null, options);
  const readiness = options.readiness || null;
  const promptProfile = buildChiefOfStaffPromptProfile(posture, recommendation, userQuery, {
    promptScope: options.promptScope || null,
  });
  const prompt = promptProfile.prompt;
  const advisory_generated_at = new Date().toISOString();
  const model = runtime.model;
  const host = runtime.host;
  const timeoutMs = runtime.timeoutMs;
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
      live_status: 'live',
      advisory_generated_at,
      execution_ready: Boolean(recommendation?.execution_ready),
      agent_readiness: recordChiefOfStaffReadiness({
        rootPath: options.rootPath || null,
        runtime,
        status: 'live',
        reason: 'Chief of Staff live model reply completed successfully.',
        stage: 'direct_query',
        checkedAt: advisory_generated_at,
        warmAttempted: Boolean(readiness?.warm_attempted),
        warmed: true,
        availableModels: readiness?.available_models,
      }),
      cognition_diagnostics: buildChiefOfStaffCognitionDiagnostics({
        model,
        timeoutMs,
        promptProfile,
        runtime,
        readiness: {
          ...(readiness || {}),
          status: 'live',
          reason: 'Chief of Staff live model reply completed successfully.',
        },
        usedLiveCall: true,
        usedFallback: false,
      }),
    };
  } catch (error) {
    const failureReason = classifyChiefOfStaffFailureReason(error, {
      promptChars: Number(promptProfile?.promptChars || 0),
      contextMode: promptProfile?.contextMode || 'scoped',
    });
    const liveStatus = classifyChiefOfStaffLiveStatus({
      usedFallback: true,
      failureReason,
      readiness,
    });
    const recordedReadiness = recordChiefOfStaffReadiness({
      rootPath: options.rootPath || null,
      runtime,
      status: liveStatus,
      reason: normalizeText(error?.message || error) || null,
      stage: 'direct_query',
      checkedAt: advisory_generated_at,
      warmAttempted: Boolean(readiness?.warm_attempted),
      warmed: Boolean(readiness?.warmed),
      availableModels: readiness?.available_models,
    });
    const cognitionDiagnostics = buildChiefOfStaffCognitionDiagnostics({
      model,
      timeoutMs,
      promptProfile,
      runtime,
      readiness: recordedReadiness,
      usedLiveCall: true,
      usedFallback: true,
      error,
    });
    return {
      reply_text: buildFallbackReply(posture, recommendation),
      reply_source: 'deterministic_fallback',
      model_backend: DEFAULT_CHIEF_OF_STAFF_MODEL_BACKEND,
      model_name: model,
      model_status: classifyChiefOfStaffResponseModelStatus({
        error,
        promptProfile,
        readiness: recordedReadiness,
      }),
      live_status: liveStatus,
      advisory_generated_at,
      execution_ready: Boolean(recommendation?.execution_ready),
      agent_readiness: recordedReadiness,
      cognition_diagnostics: cognitionDiagnostics,
    };
  }
}

async function queryChiefOfStaff(rootPath, userQuery, options = {}) {
  const posture = buildChiefOfStaffPosture(rootPath);
  const recommendation = buildRecommendation(posture);
  const readiness = await ensureChiefOfStaffReadiness({
    rootPath,
    fetchImpl: options.fetchImpl || globalThis.fetch,
    callModel: typeof options.callModel === 'function' ? options.callModel : callOllamaGenerate,
    warmIfNeeded: true,
  });
  const reply = await runChiefOfStaffAgent(posture, recommendation, userQuery, {
    ...options,
    rootPath,
    readiness,
  });
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
  buildChiefOfStaffReadinessSnapshot,
  buildRecommendation,
  buildChiefOfStaffPrompt,
  buildChiefOfStaffLatestSnapshot,
  clearLatestChiefOfStaffAdvisory,
  ensureChiefOfStaffReadiness,
  classifyChiefOfStaffFailureReason,
  classifyChiefOfStaffModelFailure,
  probeChiefOfStaffReadiness,
  queryChiefOfStaff,
  readLatestChiefOfStaffAdvisory,
  readChiefOfStaffReadiness,
  recordLatestChiefOfStaffAdvisory,
  requestChiefOfStaffModelReply,
  resolveChiefOfStaffRuntime,
  runChiefOfStaffAgent,
  warmChiefOfStaffModel,
};
