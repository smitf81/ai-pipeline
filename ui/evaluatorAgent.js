const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
  requestOllamaJson,
  DEFAULT_OLLAMA_HOST,
  DEFAULT_OLLAMA_TIMEOUT_MS,
} = require('./localModelClient');
const {
  listContextManagerRuns,
  listExecutorRuns,
  listPlannerRuns,
  summarizeContextManagerRun,
  summarizeExecutorRun,
  summarizePlannerRun,
} = require('./agentWorkers');
const {
  resolveAgentDefinition,
  readAgentDefinition,
} = require('./agentRegistry');
const {
  buildTruthKernelPayload,
} = require('./truthKernelAdapter');
const {
  readStructuredQAReport,
} = require('./qaRunner');
const {
  readQaLeadOutput,
} = require('./qaLeadRunner');
const {
  readFailureHistory,
  summarizeFailureHistory,
} = require('./failureMemory');

const EVALUATOR_DIR = path.join('data', 'spatial', 'evaluator');
const EVALUATOR_RUNS_DIR = path.join(EVALUATOR_DIR, 'runs');
const EVALUATOR_HISTORY_LIMIT = 60;
const WORKSPACE_RELATIVE_PATH = path.join('data', 'spatial', 'workspace.json');
const CORE_AGENT_IDS = ['context-manager', 'planner', 'executor'];
const TASK_STALE_AFTER_MS = 36 * 60 * 60 * 1000;
const TRUTH_ACTIVE_WINDOW_MS = 60 * 60 * 1000;
const TRUTH_STALE_WINDOW_MS = 48 * 60 * 60 * 1000;
const QA_STALE_WINDOW_MS = 24 * 60 * 60 * 1000;
const SNAPSHOT_COMPARISON_TARGET = 'system_runtime';
const EVALUATOR_CONTEXT_MODE = 'scoped';
const EVALUATOR_OVERSCOPED_PROMPT_CHARS = 5200;
const EVALUATOR_AGENT_PROMPT_LIMIT = 6;
const EVALUATOR_SCORECARD_PROMPT_LIMIT = 4;
const EVALUATOR_ANALYSIS_CLASSIFICATION = 'derived_analysis';
const EVALUATOR_AUTHORITY_SCOPE = 'comparative_projection';
const EVALUATOR_REQUIRED_PRIMARY_SEAMS = ['agent_runtime', 'task_progress', 'truth_kernel', 'qa_posture'];
const EVALUATOR_RUNTIME_AGENT_IDS = [...CORE_AGENT_IDS, 'evaluator'];

const ALLOWED_VERDICTS = new Set(['better', 'worse', 'no_change']);
const MODEL_COGNITION_MODE = 'model_live';
const FALLBACK_COGNITION_MODE = 'deterministic_fallback';

function nowIso() {
  return new Date().toISOString();
}

function clamp01(value, fallback = 0.5) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function asFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeText(value = '') {
  return String(value || '').trim();
}

function normalizeStringArray(values = []) {
  return Array.isArray(values)
    ? [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))]
    : [];
}

function truncateText(value = '', maxLength = 220) {
  const text = String(value || '').trim();
  if (!text) return '';
  const resolvedMax = Math.max(24, Number(maxLength) || 220);
  return text.length > resolvedMax ? `${text.slice(0, resolvedMax - 1)}…` : text;
}

function readJsonSafe(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function sha1(value = '') {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex');
}

function statusWeight(status = '') {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'pass') return 4;
  if (normalized === 'warn') return 2;
  if (normalized === 'stale') return 1;
  if (normalized === 'fail') return 0;
  return 0;
}

function normalizeScoreValue(value = null) {
  if (Number.isFinite(Number(value))) return Number(value);
  if (value && typeof value === 'object') {
    if (Number.isFinite(Number(value.value))) return Number(value.value);
    if (Number.isFinite(Number(value.score))) return Number(value.score);
  }
  return null;
}

function buildMinimalScorecard(card = {}) {
  const id = normalizeText(card.id || `${card.desk || 'desk'}.${card.testId || card.testName || 'scorecard'}`) || null;
  const overallScore = normalizeScoreValue(card.overallScore || card.score || null);
  return {
    id,
    desk: normalizeText(card.desk) || null,
    test_id: normalizeText(card.testId || card.test_id) || null,
    test_name: normalizeText(card.testName || card.test_name) || null,
    rollup_status: normalizeText(card.rollupStatus || card.rollup_status || card.status) || 'missing',
    reported_status: normalizeText(card.reportedStatus || card.reported_status || card.status) || 'missing',
    overall_score: overallScore,
    summary: normalizeText(card.summary) || null,
  };
}

function buildSnapshotScorecards(cards = []) {
  return (Array.isArray(cards) ? cards : [])
    .map((card) => buildMinimalScorecard(card))
    .filter((card) => card.id)
    .sort((left, right) => String(left.id || '').localeCompare(String(right.id || '')));
}

function buildScorecardCounts(scorecards = []) {
  return {
    pass: scorecards.filter((card) => card.rollup_status === 'pass').length,
    warn: scorecards.filter((card) => card.rollup_status === 'warn').length,
    stale: scorecards.filter((card) => card.rollup_status === 'stale').length,
    fail: scorecards.filter((card) => card.rollup_status === 'fail').length,
    missing: scorecards.filter((card) => card.rollup_status === 'missing').length,
  };
}

function snapshotAggregateScore(snapshot = null) {
  const cards = Array.isArray(snapshot?.scorecards) ? snapshot.scorecards : [];
  if (!cards.length) return 0;
  const total = cards.reduce((sum, card) => {
    const score = normalizeScoreValue(card.overall_score);
    if (Number.isFinite(score)) return sum + score;
    return sum + statusWeight(card.rollup_status);
  }, 0);
  return Number((total / cards.length).toFixed(2));
}

function readWorkspace(rootPath) {
  return readJsonSafe(path.join(rootPath, WORKSPACE_RELATIVE_PATH), {});
}

function parseTimestamp(...values) {
  for (const value of values) {
    const timestamp = Date.parse(String(value || '').trim());
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return null;
}

function resolveFreshness(timestamp, staleAfterMs = QA_STALE_WINDOW_MS) {
  const resolvedTimestamp = Number.isFinite(Number(timestamp)) ? Number(timestamp) : parseTimestamp(timestamp);
  if (!Number.isFinite(resolvedTimestamp)) return 'missing';
  return (Date.now() - resolvedTimestamp) > staleAfterMs ? 'stale' : 'fresh';
}

function hasWorkspaceRuntimeState(workspace = {}) {
  return Boolean(
    Array.isArray(workspace?.studio?.teamBoard?.cards) && workspace.studio.teamBoard.cards.length
    || Object.keys(workspace?.studio?.orchestrator?.desks || {}).length
    || Object.keys(workspace?.studio?.agentWorkers || {}).length
    || Array.isArray(workspace?.graph?.nodes) && workspace.graph.nodes.length
    || Array.isArray(workspace?.graphs?.system?.nodes) && workspace.graphs.system.nodes.length
  );
}

function uniqueSourcePaths(paths = []) {
  return [...new Set((Array.isArray(paths) ? paths : []).map((value) => normalizeText(value)).filter(Boolean))];
}

function buildAgentRuntimeSnapshot(rootPath, workspace = {}) {
  const workerState = workspace?.studio?.agentWorkers && typeof workspace.studio.agentWorkers === 'object'
    ? workspace.studio.agentWorkers
    : {};
  const agents = EVALUATOR_RUNTIME_AGENT_IDS.map((agentId) => {
    const definition = readAgentDefinition(rootPath, agentId);
    const manifest = definition?.manifest && typeof definition.manifest === 'object' ? definition.manifest : {};
    const worker = workerState?.[agentId] && typeof workerState[agentId] === 'object' ? workerState[agentId] : null;
    const contractComplete = Boolean(
      definition?.valid
      && normalizeText(manifest.id)
      && normalizeText(manifest.backend)
      && normalizeText(manifest.runtime)
      && normalizeText(manifest.model)
    );
    const runtimeConfigured = Boolean(worker && normalizeText(worker.backend) && normalizeText(worker.model));
    const status = normalizeText(worker?.status) || (runtimeConfigured ? 'configured' : 'missing');
    return {
      agent_id: agentId,
      contract_present: Boolean(definition?.exists),
      contract_complete: contractComplete,
      runtime_configured: runtimeConfigured,
      status,
      backend: normalizeText(worker?.backend || manifest.backend) || null,
      runtime: normalizeText(manifest.runtime) || null,
      model_name: normalizeText(worker?.model || manifest.model) || null,
      manifest_path: definition?.manifestPath || null,
      prompt_path: definition?.promptPath || null,
    };
  });
  const agentCount = agents.length;
  const contractCompleteCount = agents.filter((entry) => entry.contract_complete).length;
  const runtimeConfiguredCount = agents.filter((entry) => entry.runtime_configured).length;
  const degradedCount = agents.filter((entry) => ['blocked', 'degraded', 'offline', 'error', 'missing'].includes(String(entry.status || '').toLowerCase())).length;
  return {
    agent_count: agentCount,
    contract_complete_count: contractCompleteCount,
    runtime_configured_count: runtimeConfiguredCount,
    degraded_count: degradedCount,
    agents,
    summary: `${runtimeConfiguredCount}/${agentCount} runtime seats configured | ${contractCompleteCount}/${agentCount} contract-complete | ${degradedCount} degraded or missing`,
  };
}

function buildQaPostureSnapshot(rootPath) {
  const qaLeadOutput = readQaLeadOutput(rootPath);
  const state = qaLeadOutput?.state && typeof qaLeadOutput.state === 'object' ? qaLeadOutput.state : {};
  const latestRun = qaLeadOutput?.latestRun && typeof qaLeadOutput.latestRun === 'object' ? qaLeadOutput.latestRun : {};
  const structuredReport = readStructuredQAReport(rootPath, 'latest');
  const structuredStatus = normalizeText(structuredReport?.status) || 'missing';
  const adjudicatedAt = parseTimestamp(
    latestRun.finished_at,
    latestRun.finishedAt,
    latestRun.last_completed_cycle_at,
    latestRun.lastCompletedCycleAt,
    state.finished_at,
    state.finishedAt,
    state.last_completed_cycle_at,
    state.lastCompletedCycleAt,
    structuredReport?.finishedAt,
    structuredReport?.updatedAt,
    structuredReport?.createdAt,
  );
  const status = normalizeText(latestRun.status || state.status || structuredStatus) || 'unknown';
  const normalizedStatus = status.toLowerCase();
  let verdict = 'unknown';
  if (structuredStatus === 'fail' || ['failed', 'fail', 'error', 'blocked'].includes(normalizedStatus)) {
    verdict = 'fail';
  } else if (['degraded', 'offline', 'stale', 'warn', 'warning'].includes(normalizedStatus)) {
    verdict = 'degraded';
  } else if (structuredStatus === 'pass' || ['pass', 'live', 'healthy', 'completed'].includes(normalizedStatus)) {
    verdict = 'pass';
  }
  return {
    run_id: normalizeText(latestRun.id || state.run_id || state.id) || null,
    cycle_id: normalizeText(state.current_batch || state.run_id || latestRun.id) || null,
    status,
    verdict,
    structured_status: structuredStatus,
    adjudicated_at: adjudicatedAt == null ? null : new Date(adjudicatedAt).toISOString(),
    freshness: resolveFreshness(adjudicatedAt, QA_STALE_WINDOW_MS),
    output_feed_count: Array.isArray(latestRun.output_feed) ? latestRun.output_feed.length : (Array.isArray(state.output_feed) ? state.output_feed.length : 0),
    summary: normalizeText(latestRun.summary || state.summary || structuredReport?.summary) || 'QA posture is not adjudicated yet.',
  };
}

function buildFailureMemorySnapshot(rootPath) {
  const failureStore = readFailureHistory(rootPath);
  const history = failureStore?.history && typeof failureStore.history === 'object' ? failureStore.history : { entries: [] };
  const summary = summarizeFailureHistory(rootPath);
  return {
    exists: Boolean(failureStore?.exists),
    updated_at: history.updated_at || null,
    total_keys: Number(summary?.totalKeys || 0),
    repeated_keys: Number(summary?.repeatedKeys || 0),
    top_failures: Array.isArray(summary?.topFailures) ? summary.topFailures.slice(0, 3) : [],
    summary: failureStore?.exists
      ? `${Number(summary?.repeatedKeys || 0)} repeated failure key${Number(summary?.repeatedKeys || 0) === 1 ? '' : 's'} across ${Number(summary?.totalKeys || 0)} tracked key${Number(summary?.totalKeys || 0) === 1 ? '' : 's'}`
      : 'Failure memory has not recorded canonical entries yet.',
  };
}

function buildEvaluatorInputContract({
  rootPath,
  workspace,
  agentRuntime,
  agentCognition,
  taskProgress,
  truthKernel,
  qaPosture,
  qaSupport,
  failureMemory,
} = {}) {
  const seams = [
    {
      id: 'agent_runtime',
      label: 'Agent runtime state',
      role: 'primary',
      owner: 'runtime',
      classification: 'canonical_source',
      source_paths: uniqueSourcePaths([WORKSPACE_RELATIVE_PATH, ...agentRuntime.agents.map((entry) => entry.manifest_path).filter(Boolean)]),
      available: hasWorkspaceRuntimeState(workspace),
      freshness: hasWorkspaceRuntimeState(workspace) ? 'fresh' : 'missing',
      summary: agentRuntime.summary,
    },
    {
      id: 'agent_cognition',
      label: 'Agent cognition evidence',
      role: 'primary',
      owner: 'runtime',
      classification: 'evidence_artefact',
      source_paths: uniqueSourcePaths([
        'data/spatial/agent-runs/context-manager/*.json',
        'data/spatial/agent-runs/planner/*.json',
        'data/spatial/agent-runs/executor/*.json',
      ]),
      available: Number(agentCognition?.observed_agent_count || 0) > 0,
      freshness: Number(agentCognition?.observed_agent_count || 0) > 0 ? 'fresh' : 'missing',
      summary: agentCognition.summary,
    },
    {
      id: 'task_progress',
      label: 'Task progress',
      role: 'primary',
      owner: 'workspace',
      classification: 'canonical_source',
      source_paths: uniqueSourcePaths([WORKSPACE_RELATIVE_PATH]),
      available: hasWorkspaceRuntimeState(workspace),
      freshness: hasWorkspaceRuntimeState(workspace) ? 'fresh' : 'missing',
      summary: taskProgress.summary,
    },
    {
      id: 'truth_kernel',
      label: 'Truth-kernel projection',
      role: 'primary',
      owner: 'truth-kernel',
      classification: 'derived_projection',
      source_paths: uniqueSourcePaths(['/api/spatial/truth-kernel']),
      available: Number(truthKernel?.node_count || 0) > 0,
      freshness: Number(truthKernel?.node_count || 0) > 0 ? 'fresh' : 'missing',
      summary: truthKernel.summary,
    },
    {
      id: 'qa_posture',
      label: 'QA adjudicated posture',
      role: 'adjudicated_reference',
      owner: 'qa',
      classification: 'canonical_source',
      source_paths: uniqueSourcePaths(['data/spatial/qa/lead-state.json', 'data/spatial/qa/lead-runs/*.json', 'data/spatial/qa/structured/latest.json']),
      available: Boolean(qaPosture?.run_id || qaPosture?.cycle_id || qaPosture?.adjudicated_at),
      freshness: qaPosture?.freshness || 'missing',
      summary: qaPosture.summary,
    },
    {
      id: 'failure_memory',
      label: 'Failure memory',
      role: 'primary',
      owner: 'runtime',
      classification: 'canonical_source',
      source_paths: uniqueSourcePaths([failureStorePath(rootPath, failureMemory)]),
      available: Boolean(failureMemory?.exists),
      freshness: resolveFreshness(failureMemory?.updated_at, QA_STALE_WINDOW_MS),
      summary: failureMemory.summary,
    },
    {
      id: 'qa_support',
      label: 'QA scorecards',
      role: 'supporting',
      owner: 'qa',
      classification: 'derived_projection',
      source_paths: uniqueSourcePaths(['data/spatial/qa/structured/latest.json']),
      available: Number(qaSupport?.scorecard_count || 0) > 0,
      freshness: Number(qaSupport?.scorecard_count || 0) > 0 ? 'fresh' : 'missing',
      summary: qaSupport.summary,
    },
  ];
  const availablePrimary = seams.filter((entry) => entry.role !== 'supporting' && entry.available);
  const availableRequired = availablePrimary.filter((entry) => EVALUATOR_REQUIRED_PRIMARY_SEAMS.includes(entry.id));
  const canonicalAvailable = availablePrimary.filter((entry) => entry.classification === 'canonical_source');
  const completeness = Number(((
    (availableRequired.length / Math.max(1, EVALUATOR_REQUIRED_PRIMARY_SEAMS.length)) * 0.7
  ) + (
    (canonicalAvailable.length / Math.max(1, availablePrimary.length || 1)) * 0.2
  ) + (
    (availablePrimary.length / Math.max(1, seams.filter((entry) => entry.role !== 'supporting').length)) * 0.1
  )).toFixed(2));
  const supportingOnly = seams.some((entry) => entry.id === 'qa_support' && entry.available) && availablePrimary.length === 0;
  const groundingStatus = supportingOnly || availableRequired.length < 2 ? 'insufficient_inputs' : 'grounded';
  return {
    classification: 'derived_projection',
    authority_scope: EVALUATOR_AUTHORITY_SCOPE,
    required_primary_seams: [...EVALUATOR_REQUIRED_PRIMARY_SEAMS],
    consulted_seams: seams,
    completeness,
    grounding_status: groundingStatus,
    supporting_only: supportingOnly,
    available_primary_count: availablePrimary.length,
    missing_input_ids: seams.filter((entry) => entry.role !== 'supporting' && !entry.available).map((entry) => entry.id),
    caveats: [
      supportingOnly ? 'QA scorecards are present, but grounded runtime seams are missing.' : null,
      availableRequired.length < 2 ? 'At least two non-scorecard primary seams are required before evaluator posture is trustworthy.' : null,
      qaPosture?.freshness === 'stale' ? 'QA adjudication is stale and should not be treated as current posture.' : null,
    ].filter(Boolean),
  };
}

function failureStorePath(rootPath, failureMemory = {}) {
  if (!failureMemory?.exists) return 'brain/context/failure_history.json';
  const store = readFailureHistory(rootPath);
  return store?.jsonPath
    ? path.relative(rootPath, store.jsonPath).replace(/\\/g, '/')
    : 'brain/context/failure_history.json';
}

function resolveSyntheticSeamAvailability(snapshot = {}) {
  return {
    agent_runtime: Boolean(snapshot?.agent_runtime?.agent_count || snapshot?.agent_runtime?.runtime_configured_count),
    agent_cognition: Number(snapshot?.agent_cognition?.observed_agent_count || 0) > 0,
    task_progress: Boolean(snapshot?.task_progress && (Number(snapshot?.task_progress?.total_count || 0) > 0 || normalizeText(snapshot?.task_progress?.summary))),
    truth_kernel: Number(snapshot?.truth_kernel?.node_count || 0) > 0,
    qa_posture: Boolean(snapshot?.qa_posture?.run_id || snapshot?.qa_posture?.cycle_id || snapshot?.qa_posture?.adjudicated_at),
    failure_memory: Boolean(snapshot?.failure_memory?.exists || snapshot?.failure_memory?.updated_at),
    qa_support: Number(snapshot?.qa_support?.scorecard_count || snapshot?.scorecard_count || 0) > 0,
  };
}

function resolveSnapshotInputContract(snapshot = null) {
  if (snapshot?.input_contract && typeof snapshot.input_contract === 'object') return snapshot.input_contract;
  const availability = resolveSyntheticSeamAvailability(snapshot || {});
  const consultedSeams = [
    { id: 'agent_runtime', role: 'primary', classification: 'canonical_source', available: availability.agent_runtime, summary: snapshot?.agent_runtime?.summary || null },
    { id: 'agent_cognition', role: 'primary', classification: 'evidence_artefact', available: availability.agent_cognition, summary: snapshot?.agent_cognition?.summary || null },
    { id: 'task_progress', role: 'primary', classification: 'canonical_source', available: availability.task_progress, summary: snapshot?.task_progress?.summary || null },
    { id: 'truth_kernel', role: 'primary', classification: 'derived_projection', available: availability.truth_kernel, summary: snapshot?.truth_kernel?.summary || null },
    { id: 'qa_posture', role: 'adjudicated_reference', classification: 'canonical_source', available: availability.qa_posture, summary: snapshot?.qa_posture?.summary || null },
    { id: 'failure_memory', role: 'primary', classification: 'canonical_source', available: availability.failure_memory, summary: snapshot?.failure_memory?.summary || null },
    { id: 'qa_support', role: 'supporting', classification: 'derived_projection', available: availability.qa_support, summary: snapshot?.qa_support?.summary || null },
  ];
  const availablePrimary = consultedSeams.filter((entry) => entry.role !== 'supporting' && entry.available);
  const availableRequired = availablePrimary.filter((entry) => EVALUATOR_REQUIRED_PRIMARY_SEAMS.includes(entry.id));
  const supportingOnly = consultedSeams.find((entry) => entry.id === 'qa_support')?.available && availablePrimary.length === 0;
  return {
    classification: 'derived_projection',
    authority_scope: EVALUATOR_AUTHORITY_SCOPE,
    required_primary_seams: [...EVALUATOR_REQUIRED_PRIMARY_SEAMS],
    consulted_seams: consultedSeams,
    completeness: Number((availableRequired.length / Math.max(1, EVALUATOR_REQUIRED_PRIMARY_SEAMS.length)).toFixed(2)),
    grounding_status: supportingOnly || availableRequired.length < 2 ? 'insufficient_inputs' : 'grounded',
    supporting_only: supportingOnly,
    available_primary_count: availablePrimary.length,
    missing_input_ids: consultedSeams.filter((entry) => entry.role !== 'supporting' && !entry.available).map((entry) => entry.id),
    caveats: supportingOnly ? ['QA scorecards are present, but grounded runtime seams are missing.'] : [],
  };
}

function fallbackManifestForAgent(agentId) {
  return {
    id: agentId,
    backend: 'ollama',
    runtime: 'ollama-json',
    model: 'mistral:latest',
    host: DEFAULT_OLLAMA_HOST,
    timeoutMs: DEFAULT_OLLAMA_TIMEOUT_MS,
  };
}

function resolveIntendedCognition(rootPath, workspace = {}, agentId) {
  const worker = workspace?.studio?.agentWorkers?.[agentId] || null;
  const definition = resolveAgentDefinition(rootPath, agentId, {
    fallbackManifest: fallbackManifestForAgent(agentId),
    fallbackPrompt: '',
  });
  const backend = normalizeText(worker?.backend || definition?.manifest?.backend) || null;
  const runtime = normalizeText(definition?.manifest?.runtime) || null;
  const modelName = normalizeText(worker?.model || definition?.manifest?.model) || null;
  return {
    backend,
    runtime,
    model_name: modelName,
    intended_cognition_mode: backend === 'ollama' || String(runtime || '').toLowerCase().includes('ollama')
      ? MODEL_COGNITION_MODE
      : 'deterministic_tool',
  };
}

function deriveRunCognitionMode(runSummary = null) {
  if (!runSummary || typeof runSummary !== 'object') return null;
  if (runSummary.cognition_mode === MODEL_COGNITION_MODE || runSummary.cognitionMode === MODEL_COGNITION_MODE) {
    return MODEL_COGNITION_MODE;
  }
  if (runSummary.cognition_mode === FALLBACK_COGNITION_MODE || runSummary.cognitionMode === FALLBACK_COGNITION_MODE) {
    return FALLBACK_COGNITION_MODE;
  }
  if (Object.prototype.hasOwnProperty.call(runSummary, 'usedFallback')) {
    return runSummary.usedFallback ? FALLBACK_COGNITION_MODE : MODEL_COGNITION_MODE;
  }
  if (String(runSummary.llmStatus || '').trim().toLowerCase() === 'live') return MODEL_COGNITION_MODE;
  if (runSummary.llmStatus) return FALLBACK_COGNITION_MODE;
  return null;
}

function listAgentRuns(rootPath, agentId) {
  if (agentId === 'context-manager') {
    return listContextManagerRuns(rootPath).map((run) => summarizeContextManagerRun(run)).filter(Boolean);
  }
  if (agentId === 'planner') {
    return listPlannerRuns(rootPath).map((run) => summarizePlannerRun(run)).filter(Boolean);
  }
  if (agentId === 'executor') {
    return listExecutorRuns(rootPath).map((run) => summarizeExecutorRun(run)).filter(Boolean);
  }
  return [];
}

function buildAgentCognitionSnapshot(rootPath, workspace = {}) {
  const agents = CORE_AGENT_IDS.map((agentId) => {
    const intended = resolveIntendedCognition(rootPath, workspace, agentId);
    const runs = listAgentRuns(rootPath, agentId);
    const latestRun = runs[0] || null;
    const actualLastCognitionMode = deriveRunCognitionMode(latestRun) || intended.intended_cognition_mode;
    const fallbackCount = runs.filter((run) => deriveRunCognitionMode(run) === FALLBACK_COGNITION_MODE).length;
    const liveRun = runs.find((run) => deriveRunCognitionMode(run) === MODEL_COGNITION_MODE) || null;
    const fallbackRun = runs.find((run) => deriveRunCognitionMode(run) === FALLBACK_COGNITION_MODE) || null;
    return {
      agent_id: agentId,
      intended_cognition_mode: intended.intended_cognition_mode,
      actual_last_cognition_mode: actualLastCognitionMode,
      last_live_model_call_at: liveRun
        ? (liveRun.completedAt || liveRun.createdAt || liveRun.compared_at || liveRun.comparedAt || null)
        : null,
      last_fallback_at: fallbackRun
        ? (fallbackRun.completedAt || fallbackRun.createdAt || fallbackRun.compared_at || fallbackRun.comparedAt || null)
        : null,
      fallback_count: fallbackCount,
      matches_intended: actualLastCognitionMode === intended.intended_cognition_mode,
      model_name: intended.model_name,
      backend: intended.backend,
      runtime: intended.runtime,
    };
  });
  const observedAgentCount = agents.length;
  const liveCount = agents.filter((entry) => entry.actual_last_cognition_mode === MODEL_COGNITION_MODE).length;
  const matchesIntendedCount = agents.filter((entry) => entry.matches_intended).length;
  const totalFallbackCount = agents.reduce((sum, entry) => sum + Number(entry.fallback_count || 0), 0);
  return {
    agents,
    observed_agent_count: observedAgentCount,
    live_count: liveCount,
    matches_intended_count: matchesIntendedCount,
    total_fallback_count: totalFallbackCount,
    fallback_observed_agent_count: agents.filter((entry) => Number(entry.fallback_count || 0) > 0).length,
    summary: `${liveCount}/${observedAgentCount} live | ${matchesIntendedCount}/${observedAgentCount} matched intent | ${totalFallbackCount} fallbacks observed`,
  };
}

function normalizeTaskLifecycle(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (['complete', 'completed', 'done', 'review', 'accepted', 'handed_off'].includes(normalized)) return 'complete';
  if (['blocked', 'stalled', 'error', 'failed', 'rejected'].includes(normalized)) return 'stalled';
  if (['running', 'active', 'in_progress', 'claimed', 'processing'].includes(normalized)) return 'in_progress';
  if (['ready', 'planned', 'pending', 'captured', 'queued', 'unassigned', 'assigned'].includes(normalized)) return 'ready';
  return 'ready';
}

function buildTaskSnapshot(workspace = {}) {
  const boardCards = Array.isArray(workspace?.studio?.teamBoard?.cards) ? workspace.studio.teamBoard.cards : [];
  const deskItems = Object.values(workspace?.studio?.orchestrator?.desks || {})
    .flatMap((desk) => (Array.isArray(desk?.workItems) ? desk.workItems : []));
  const dedupe = new Map();
  [...boardCards, ...deskItems].forEach((item, index) => {
    const id = normalizeText(item?.id || item?.taskId || item?.title || `task_${index}`) || `task_${index}`;
    if (dedupe.has(id)) return;
    const lifecycle = normalizeTaskLifecycle(item?.lifecycle || item?.status || item?.state);
    const updatedAt = normalizeText(item?.updatedAt || item?.completedAt || item?.createdAt) || null;
    const updatedNumeric = Date.parse(updatedAt || '');
    dedupe.set(id, {
      id,
      lifecycle,
      updated_at: updatedAt,
      stale: Number.isFinite(updatedNumeric) ? (Date.now() - updatedNumeric) > TASK_STALE_AFTER_MS : false,
    });
  });
  const tasks = [...dedupe.values()];
  const totalCount = tasks.length;
  const completeCount = tasks.filter((task) => task.lifecycle === 'complete').length;
  const inProgressCount = tasks.filter((task) => task.lifecycle === 'in_progress').length;
  const readyCount = tasks.filter((task) => task.lifecycle === 'ready').length;
  const stalledCount = tasks.filter((task) => task.lifecycle === 'stalled').length
    + tasks.filter((task) => task.stale && task.lifecycle !== 'complete').length;
  return {
    total_count: totalCount,
    complete_count: completeCount,
    in_progress_count: inProgressCount,
    ready_count: readyCount,
    stalled_count: stalledCount,
    completion_ratio: totalCount ? Number((completeCount / totalCount).toFixed(2)) : 0,
    summary: totalCount
      ? `${completeCount} complete | ${inProgressCount} in progress | ${readyCount} ready | ${stalledCount} stalled`
      : 'No governed tasks were available for comparison.',
  };
}

function normalizeTruthHealth(node = {}) {
  if (Number.isFinite(Number(node.healthScore))) {
    const numeric = Number(node.healthScore);
    return numeric > 1 ? clamp01(numeric / 100, 0.5) : clamp01(numeric, 0.5);
  }
  if (node.status === 'healthy') return 0.92;
  if (node.status === 'degraded') return 0.48;
  if (node.status === 'blocked') return 0.14;
  if (node.status === 'orphaned') return 0.28;
  return 0.62;
}

function buildTruthKernelSummary(rootPath, workspace = {}) {
  const truthKernel = buildTruthKernelPayload({ rootPath, workspace });
  const nodes = (Array.isArray(truthKernel?.nodes) ? truthKernel.nodes : []).filter((node) => node?.sourceType !== 'ace-evaluator');
  const statusCounts = {
    healthy: nodes.filter((node) => node.status === 'healthy').length,
    degraded: nodes.filter((node) => node.status === 'degraded').length,
    blocked: nodes.filter((node) => node.status === 'blocked').length,
    orphaned: nodes.filter((node) => node.status === 'orphaned').length,
    informational: nodes.filter((node) => node.status === 'informational').length,
  };
  const now = Date.now();
  const activeCount = nodes.filter((node) => {
    const timestamp = Date.parse(node?.timestamp || '');
    return Number.isFinite(timestamp) && (now - timestamp) <= TRUTH_ACTIVE_WINDOW_MS;
  }).length;
  const staleCount = nodes.filter((node) => {
    const timestamp = Date.parse(node?.timestamp || '');
    return Number.isFinite(timestamp) && (now - timestamp) > TRUTH_STALE_WINDOW_MS;
  }).length;
  const avgConfidence = nodes.length
    ? Number((nodes.reduce((sum, node) => sum + clamp01(node?.confidence, 0.5), 0) / nodes.length).toFixed(2))
    : 0;
  const avgHealth = nodes.length
    ? Number((nodes.reduce((sum, node) => sum + normalizeTruthHealth(node), 0) / nodes.length).toFixed(2))
    : 0;
  return {
    node_count: nodes.length,
    status_counts: statusCounts,
    active_count: activeCount,
    stale_count: staleCount,
    avg_confidence: avgConfidence,
    avg_health: avgHealth,
    summary: nodes.length
      ? `${statusCounts.healthy} healthy | ${statusCounts.degraded} degraded | ${statusCounts.blocked} blocked | ${activeCount} active | ${staleCount} stale`
      : 'Truth kernel did not expose comparable runtime nodes.',
  };
}

function buildEvaluatorSnapshot({
  rootPath = process.cwd(),
  workspace = null,
  scorecards = [],
  comparisonTarget = SNAPSHOT_COMPARISON_TARGET,
  capturedAt = null,
  snapshotId = null,
} = {}) {
  const resolvedWorkspace = workspace && typeof workspace === 'object'
    ? workspace
    : readWorkspace(rootPath);
  const normalizedScorecards = buildSnapshotScorecards(scorecards);
  const counts = buildScorecardCounts(normalizedScorecards);
  const agentRuntime = buildAgentRuntimeSnapshot(rootPath, resolvedWorkspace);
  const agentCognition = buildAgentCognitionSnapshot(rootPath, resolvedWorkspace);
  const taskProgress = buildTaskSnapshot(resolvedWorkspace);
  const truthKernel = buildTruthKernelSummary(rootPath, resolvedWorkspace);
  const qaPosture = buildQaPostureSnapshot(rootPath);
  const failureMemory = buildFailureMemorySnapshot(rootPath);
  const qaSupport = {
    scorecard_count: normalizedScorecards.length,
    counts,
    aggregate_score: snapshotAggregateScore({ scorecards: normalizedScorecards }),
    summary: normalizedScorecards.length
      ? `${normalizedScorecards.length} scorecards | ${counts.pass} pass | ${counts.warn} warn | ${counts.stale} stale | ${counts.fail} fail`
      : 'No comparable QA scorecards were available as supporting evidence.',
  };
  const inputContract = buildEvaluatorInputContract({
    rootPath,
    workspace: resolvedWorkspace,
    agentRuntime,
    agentCognition,
    taskProgress,
    truthKernel,
    qaPosture,
    qaSupport,
    failureMemory,
  });
  const fingerprint = sha1(JSON.stringify({
    comparisonTarget,
    agent_runtime: agentRuntime,
    agent_cognition: agentCognition,
    task_progress: taskProgress,
    truth_kernel: truthKernel,
    qa_posture: qaPosture,
    failure_memory: failureMemory,
    qa_support: {
      scorecard_count: qaSupport.scorecard_count,
      counts: qaSupport.counts,
      aggregate_score: qaSupport.aggregate_score,
    },
    input_contract: {
      completeness: inputContract.completeness,
      grounding_status: inputContract.grounding_status,
      missing_input_ids: inputContract.missing_input_ids,
    },
  }));
  const resolvedCapturedAt = normalizeText(capturedAt) || nowIso();
  return {
    snapshot_id: normalizeText(snapshotId) || `eval_snapshot_${fingerprint.slice(0, 12)}`,
    captured_at: resolvedCapturedAt,
    comparison_target: normalizeText(comparisonTarget) || SNAPSHOT_COMPARISON_TARGET,
    fingerprint,
    scorecard_count: normalizedScorecards.length,
    counts,
    aggregate_score: qaSupport.aggregate_score,
    summary: [
      agentRuntime.summary,
      agentCognition.summary,
      taskProgress.summary,
      truthKernel.summary,
      qaPosture.summary,
      failureMemory.summary,
      qaSupport.summary,
    ].filter(Boolean).join(' | '),
    analysis_classification: EVALUATOR_ANALYSIS_CLASSIFICATION,
    authority_scope: EVALUATOR_AUTHORITY_SCOPE,
    input_contract: inputContract,
    agent_runtime: agentRuntime,
    agent_cognition: agentCognition,
    fallback_pressure: {
      total_count: agentCognition.total_fallback_count,
      observed_agent_count: agentCognition.fallback_observed_agent_count,
      summary: `${agentCognition.total_fallback_count} total fallback${agentCognition.total_fallback_count === 1 ? '' : 's'} across ${agentCognition.fallback_observed_agent_count} agent${agentCognition.fallback_observed_agent_count === 1 ? '' : 's'}`,
    },
    task_progress: taskProgress,
    truth_kernel: truthKernel,
    qa_posture: qaPosture,
    failure_memory: failureMemory,
    qa_support: qaSupport,
    scorecards: normalizedScorecards,
  };
}

function ensureEvaluatorStorage(rootPath) {
  const stateDir = path.join(rootPath, EVALUATOR_DIR);
  fs.mkdirSync(path.join(rootPath, EVALUATOR_RUNS_DIR), { recursive: true });
  return stateDir;
}

function evaluatorStatePath(rootPath) {
  return path.join(rootPath, EVALUATOR_DIR, 'state.json');
}

function evaluatorHistoryPath(rootPath) {
  return path.join(rootPath, EVALUATOR_DIR, 'history.json');
}

function evaluatorRunFilePath(rootPath, runId) {
  return path.join(rootPath, EVALUATOR_RUNS_DIR, `${runId}.json`);
}

function normalizeScorecardImpact(entry = {}) {
  if (!entry || typeof entry !== 'object') return null;
  const cardId = normalizeText(entry.card_id || entry.cardId || entry.id);
  if (!cardId) return null;
  const verdict = normalizeVerdict(entry.verdict);
  return {
    card_id: cardId,
    desk: normalizeText(entry.desk) || null,
    test_id: normalizeText(entry.test_id || entry.testId) || null,
    verdict,
    delta_score: Number(asFiniteNumber(entry.delta_score ?? entry.deltaScore ?? 0, 0).toFixed(2)),
    progress_summary: normalizeText(entry.progress_summary || entry.progressSummary || entry.summary) || 'No evaluator change summary recorded.',
    score_pressure: normalizeText(entry.score_pressure || entry.scorePressure) || inferScorePressure(asFiniteNumber(entry.delta_score ?? entry.deltaScore ?? 0, 0)),
  };
}

function normalizeVerdict(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (ALLOWED_VERDICTS.has(normalized)) return normalized;
  return 'no_change';
}

function inferVerdict(deltaScore = 0) {
  if (deltaScore > 0.1) return 'better';
  if (deltaScore < -0.1) return 'worse';
  return 'no_change';
}

function inferScorePressure(deltaScore = 0) {
  if (deltaScore > 0.1) return 'upward';
  if (deltaScore < -0.1) return 'downward';
  return 'flat';
}

function makeEvaluatorRunId(comparedAt = nowIso()) {
  return `evaluator_${comparedAt.replace(/[^0-9]/g, '').slice(0, 14)}`;
}

function summarizeEvaluatorAgentForPrompt(agent = {}) {
  return {
    agent_id: normalizeText(agent.agent_id) || null,
    intended_cognition_mode: normalizeText(agent.intended_cognition_mode) || null,
    actual_last_cognition_mode: normalizeText(agent.actual_last_cognition_mode) || null,
    fallback_count: Number(agent.fallback_count || 0),
    matches_intended: agent.matches_intended === true,
    model_name: normalizeText(agent.model_name) || null,
  };
}

function summarizeEvaluatorScorecardForPrompt(card = {}) {
  return {
    id: normalizeText(card.id) || null,
    desk: normalizeText(card.desk) || null,
    test_id: normalizeText(card.test_id || card.testId) || null,
    status: normalizeText(card.rollup_status || card.rollupStatus || card.status) || 'missing',
    overall_score: normalizeScoreValue(card.overall_score ?? card.overallScore ?? null),
    summary: truncateText(card.summary || '', 120) || null,
  };
}

function compactSnapshotForEvaluatorPrompt(snapshot = null) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const inputContract = snapshot.input_contract && typeof snapshot.input_contract === 'object'
    ? snapshot.input_contract
    : resolveSnapshotInputContract(snapshot);
  const agentRuntime = snapshot.agent_runtime && typeof snapshot.agent_runtime === 'object'
    ? snapshot.agent_runtime
    : {};
  const agentCognition = snapshot.agent_cognition && typeof snapshot.agent_cognition === 'object'
    ? snapshot.agent_cognition
    : {};
  const taskProgress = snapshot.task_progress && typeof snapshot.task_progress === 'object'
    ? snapshot.task_progress
    : {};
  const truthKernel = snapshot.truth_kernel && typeof snapshot.truth_kernel === 'object'
    ? snapshot.truth_kernel
    : {};
  const qaPosture = snapshot.qa_posture && typeof snapshot.qa_posture === 'object'
    ? snapshot.qa_posture
    : {};
  const failureMemory = snapshot.failure_memory && typeof snapshot.failure_memory === 'object'
    ? snapshot.failure_memory
    : {};
  const qaSupport = snapshot.qa_support && typeof snapshot.qa_support === 'object'
    ? snapshot.qa_support
    : {};
  return {
    snapshot_id: normalizeText(snapshot.snapshot_id) || null,
    captured_at: snapshot.captured_at || null,
    comparison_target: normalizeText(snapshot.comparison_target) || SNAPSHOT_COMPARISON_TARGET,
    summary: truncateText(snapshot.summary || '', 180) || null,
    input_contract: {
      grounding_status: normalizeText(inputContract.grounding_status) || 'insufficient_inputs',
      completeness: Number(inputContract.completeness || 0),
      missing_input_ids: normalizeStringArray(inputContract.missing_input_ids),
      caveats: normalizeStringArray(inputContract.caveats),
      consulted_seams: (Array.isArray(inputContract.consulted_seams) ? inputContract.consulted_seams : [])
        .map((entry) => ({
          id: normalizeText(entry?.id) || null,
          role: normalizeText(entry?.role) || null,
          classification: normalizeText(entry?.classification) || null,
          available: entry?.available === true,
        }))
        .filter((entry) => entry.id),
    },
    agent_runtime: {
      agent_count: Number(agentRuntime.agent_count || 0),
      contract_complete_count: Number(agentRuntime.contract_complete_count || 0),
      runtime_configured_count: Number(agentRuntime.runtime_configured_count || 0),
      degraded_count: Number(agentRuntime.degraded_count || 0),
      summary: normalizeText(agentRuntime.summary) || null,
    },
    agent_cognition: {
      summary: normalizeText(agentCognition.summary) || null,
      observed_agent_count: Number(agentCognition.observed_agent_count || 0),
      live_count: Number(agentCognition.live_count || 0),
      matches_intended_count: Number(agentCognition.matches_intended_count || 0),
      total_fallback_count: Number(agentCognition.total_fallback_count || 0),
      agents: (Array.isArray(agentCognition.agents) ? agentCognition.agents : [])
        .slice(0, EVALUATOR_AGENT_PROMPT_LIMIT)
        .map((agent) => summarizeEvaluatorAgentForPrompt(agent)),
    },
    task_progress: {
      total_count: Number(taskProgress.total_count || 0),
      complete_count: Number(taskProgress.complete_count || 0),
      in_progress_count: Number(taskProgress.in_progress_count || 0),
      ready_count: Number(taskProgress.ready_count || 0),
      stalled_count: Number(taskProgress.stalled_count || 0),
      completion_ratio: Number(taskProgress.completion_ratio || 0),
      summary: normalizeText(taskProgress.summary) || null,
    },
    truth_kernel: {
      node_count: Number(truthKernel.node_count || 0),
      active_count: Number(truthKernel.active_count || 0),
      stale_count: Number(truthKernel.stale_count || 0),
      avg_confidence: Number(truthKernel.avg_confidence || 0),
      avg_health: Number(truthKernel.avg_health || 0),
      status_counts: truthKernel.status_counts && typeof truthKernel.status_counts === 'object'
        ? truthKernel.status_counts
        : {},
      summary: normalizeText(truthKernel.summary) || null,
    },
    qa_posture: {
      verdict: normalizeText(qaPosture.verdict) || null,
      status: normalizeText(qaPosture.status) || null,
      freshness: normalizeText(qaPosture.freshness) || null,
      adjudicated_at: qaPosture.adjudicated_at || null,
      summary: normalizeText(qaPosture.summary) || null,
    },
    failure_memory: {
      exists: failureMemory.exists === true,
      total_keys: Number(failureMemory.total_keys || 0),
      repeated_keys: Number(failureMemory.repeated_keys || 0),
      updated_at: failureMemory.updated_at || null,
      summary: normalizeText(failureMemory.summary) || null,
    },
    qa_support: {
      scorecard_count: Number(qaSupport.scorecard_count || 0),
      aggregate_score: Number(qaSupport.aggregate_score || 0),
      counts: qaSupport.counts && typeof qaSupport.counts === 'object'
        ? qaSupport.counts
        : {},
      summary: normalizeText(qaSupport.summary) || null,
      top_scorecards: (Array.isArray(snapshot.scorecards) ? snapshot.scorecards : [])
        .slice(0, EVALUATOR_SCORECARD_PROMPT_LIMIT)
        .map((card) => summarizeEvaluatorScorecardForPrompt(card)),
    },
  };
}

function buildEvaluatorPromptProfile({
  promptTemplate = '',
  previousSnapshot = null,
  currentSnapshot = null,
  comparisonTarget = SNAPSHOT_COMPARISON_TARGET,
  contextSummary = '',
} = {}) {
  const compactPreviousSnapshot = compactSnapshotForEvaluatorPrompt(previousSnapshot);
  const compactCurrentSnapshot = compactSnapshotForEvaluatorPrompt(currentSnapshot);
  const includedSections = [
    'contract',
    'comparison_target',
    'context_summary',
    'previous_snapshot_summary',
    'current_snapshot_summary',
  ];
  const contract = [
    normalizeText(promptTemplate),
    'Compare only the supplied previous and current snapshots.',
    'Treat runtime/system-state deltas as primary evidence.',
    'If grounded non-scorecard seams are missing, keep the verdict at no_change and say why.',
    'Treat QA scorecards as supporting evidence only.',
    'Treat QA posture as adjudicated reference, not something to re-adjudicate.',
    'Do not invent context, missing history, or remediation steps.',
    'Return JSON only with these fields:',
    '{',
    '  "verdict": "better" | "worse" | "no_change",',
    '  "delta_score": number,',
    '  "progress_summary": "string",',
    '  "changed_dimensions": ["string"],',
    '  "evaluation_confidence": number,',
    '  "score_pressure": "string",',
    '  "progress_state": "stable" | "regressive" | "stalled",',
    '  "dimension_impacts": [',
    '    {',
    '      "id": "agent_runtime" | "agent_cognition" | "fallback_pressure" | "task_progress" | "truth_kernel" | "qa_posture" | "failure_memory" | "qa_support",',
    '      "label": "string",',
    '      "verdict": "better" | "worse" | "no_change",',
    '      "delta": number,',
    '      "summary": "string",',
    '      "weight": number',
    '    }',
    '  ],',
    '  "scorecard_impacts": [',
    '    {',
    '      "card_id": "string",',
    '      "desk": "string",',
    '      "test_id": "string",',
    '      "verdict": "better" | "worse" | "no_change",',
    '      "delta_score": number,',
    '      "progress_summary": "string",',
    '      "score_pressure": "string"',
    '    }',
    '  ]',
    '}',
    `Comparison target: ${comparisonTarget}`,
    `Context summary: ${truncateText(contextSummary || '', 260) || 'No extra context supplied.'}`,
    `Previous snapshot summary: ${JSON.stringify(compactPreviousSnapshot || null, null, 2)}`,
    `Current snapshot summary: ${JSON.stringify(compactCurrentSnapshot || null, null, 2)}`,
  ].filter(Boolean);
  const prompt = contract.join('\n');
  return {
    contextMode: EVALUATOR_CONTEXT_MODE,
    prompt,
    promptChars: prompt.length,
    includedSections,
    broaderContextAvailable: Boolean(previousSnapshot || currentSnapshot),
    repairApplied: {
      timeout_changed: false,
      prompt_scope_changed: true,
      retrieval_shifted: true,
      notes: 'Evaluator now compares compact runtime digests and top scorecard evidence instead of injecting full snapshot JSON into every live model call.',
    },
  };
}

function buildPrompt(options = {}) {
  return buildEvaluatorPromptProfile(options).prompt;
}

function classifyEvaluatorFailureReason(error, { promptChars = 0, contextMode = EVALUATOR_CONTEXT_MODE } = {}) {
  const reason = String(error?.message || error || '').trim().toLowerCase();
  if (!reason) return 'unknown';
  if (reason.includes('timed out') || reason.includes('timeout')) {
    if (promptChars >= EVALUATOR_OVERSCOPED_PROMPT_CHARS || contextMode !== EVALUATOR_CONTEXT_MODE) {
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
  if (reason.includes('not valid json') || reason.includes('empty response')) {
    return 'bad_prompt_shape';
  }
  return 'unknown';
}

function buildEvaluatorCognitionDiagnostics({
  model = 'mistral:latest',
  timeoutMs = DEFAULT_OLLAMA_TIMEOUT_MS,
  promptProfile = null,
  usedLiveCall = false,
  usedFallback = false,
  error = null,
} = {}) {
  return {
    agent_id: 'evaluator',
    intended_model: model || null,
    actual_model: model || null,
    timeout_ms: Number(timeoutMs || DEFAULT_OLLAMA_TIMEOUT_MS),
    prompt_chars: Number(promptProfile?.promptChars || 0),
    context_mode: promptProfile?.contextMode || EVALUATOR_CONTEXT_MODE,
    used_live_call: Boolean(usedLiveCall),
    used_fallback: Boolean(usedFallback),
    failure_reason: usedFallback
      ? classifyEvaluatorFailureReason(error, {
        promptChars: Number(promptProfile?.promptChars || 0),
        contextMode: promptProfile?.contextMode || EVALUATOR_CONTEXT_MODE,
      })
      : null,
    included_sections: Array.isArray(promptProfile?.includedSections) ? promptProfile.includedSections : [],
    broader_context_available: Boolean(promptProfile?.broaderContextAvailable),
    repair_applied: promptProfile?.repairApplied || {
      timeout_changed: false,
      prompt_scope_changed: true,
      retrieval_shifted: true,
      notes: 'Evaluator now compares compact runtime digests by default.',
    },
  };
}

function normalizeDimensionImpact(entry = {}) {
  if (!entry || typeof entry !== 'object') return null;
  const id = normalizeText(entry.id || entry.dimension || entry.key);
  if (!id) return null;
  const delta = Number(asFiniteNumber(entry.delta ?? entry.delta_score ?? entry.deltaScore, 0).toFixed(2));
  return {
    id,
    label: normalizeText(entry.label) || id.replace(/_/g, ' '),
    verdict: normalizeVerdict(entry.verdict || inferVerdict(delta)),
    delta,
    summary: normalizeText(entry.summary || entry.progress_summary) || 'No evaluator dimension summary recorded.',
    weight: clamp01(entry.weight, 0.2),
  };
}

function safeRatio(numerator = 0, denominator = 1) {
  const resolvedDenominator = Math.max(1, Number(denominator) || 1);
  return Number((Number(numerator || 0) / resolvedDenominator).toFixed(2));
}

function inferDimensionVerdict(delta = 0) {
  if (delta > 0.05) return 'better';
  if (delta < -0.05) return 'worse';
  return 'no_change';
}

function buildScorecardImpactsFromSnapshots(previousSnapshot = null, currentSnapshot = null) {
  const previousCards = new Map((Array.isArray(previousSnapshot?.scorecards) ? previousSnapshot.scorecards : []).map((card) => [card.id, card]));
  const currentCards = Array.isArray(currentSnapshot?.scorecards) ? currentSnapshot.scorecards : [];
  const impacts = [];
  currentCards.forEach((card) => {
    const previous = previousCards.get(card.id) || null;
    const previousScore = normalizeScoreValue(previous?.overall_score);
    const currentScore = normalizeScoreValue(card.overall_score);
    const deltaScore = Number((
      (Number.isFinite(currentScore) ? currentScore : statusWeight(card.rollup_status))
      - (Number.isFinite(previousScore) ? previousScore : statusWeight(previous?.rollup_status))
    ).toFixed(2));
    const changed = !previous
      || previous.rollup_status !== card.rollup_status
      || deltaScore !== 0;
    if (!changed) return;
    impacts.push({
      card_id: card.id,
      desk: card.desk || previous?.desk || null,
      test_id: card.test_id || previous?.test_id || null,
      verdict: inferVerdict(deltaScore),
      delta_score: deltaScore,
      progress_summary: !previous
        ? `New scorecard observed for ${card.test_name || card.test_id || card.id}.`
        : `${card.test_name || card.test_id || card.id} moved from ${previous.rollup_status || 'missing'} to ${card.rollup_status || 'missing'}.`,
      score_pressure: inferScorePressure(deltaScore),
    });
  });
  return impacts;
}

function deriveComparisonEvidence(previousSnapshot = null, currentSnapshot = null) {
  const currentContract = resolveSnapshotInputContract(currentSnapshot);
  const previousContract = resolveSnapshotInputContract(previousSnapshot);
  const currentQaPosture = currentSnapshot?.qa_posture || {};
  const previousQaPosture = previousSnapshot?.qa_posture || {};
  if (!previousSnapshot) {
    return {
      verdict: 'no_change',
      delta_score: 0,
      progress_summary: 'Evaluator baseline established from the first grounded system snapshot.',
      changed_dimensions: [],
      evaluation_confidence: 0.42,
      score_pressure: 'flat',
      progress_state: 'stalled',
      dimension_impacts: [],
      scorecard_impacts: buildScorecardImpactsFromSnapshots(previousSnapshot, currentSnapshot),
      analysis_classification: EVALUATOR_ANALYSIS_CLASSIFICATION,
      authority_scope: EVALUATOR_AUTHORITY_SCOPE,
      consulted_seams: Array.isArray(currentContract?.consulted_seams) ? currentContract.consulted_seams : [],
      grounding: {
        status: currentContract?.grounding_status || 'insufficient_inputs',
        completeness: Number(currentContract?.completeness || 0),
        missing_input_ids: normalizeStringArray(currentContract?.missing_input_ids),
        caveats: normalizeStringArray(currentContract?.caveats),
        required_primary_seams: normalizeStringArray(currentContract?.required_primary_seams),
      },
      qa_authority: {
        owner: 'qa',
        verdict: normalizeText(currentQaPosture?.verdict) || null,
        freshness: normalizeText(currentQaPosture?.freshness) || null,
        adjudicated_at: currentQaPosture?.adjudicated_at || null,
        summary: normalizeText(currentQaPosture?.summary) || null,
        source_paths: ['data/spatial/qa/lead-state.json', 'data/spatial/qa/lead-runs/*.json', 'data/spatial/qa/structured/latest.json'],
      },
      provenance: {
        classification: EVALUATOR_ANALYSIS_CLASSIFICATION,
        consulted_source_paths: uniqueSourcePaths(
          (Array.isArray(currentContract?.consulted_seams) ? currentContract.consulted_seams : [])
            .flatMap((entry) => Array.isArray(entry?.source_paths) ? entry.source_paths : [])
        ),
        truth_kernel_source: '/api/spatial/truth-kernel',
        qa_posture_source: 'data/spatial/qa/lead-state.json',
        scorecards_role: 'supporting_evidence',
      },
    };
  }
  const previousRuntime = previousSnapshot?.agent_runtime || {};
  const currentRuntime = currentSnapshot?.agent_runtime || {};
  const previousAgents = previousSnapshot?.agent_cognition || {};
  const currentAgents = currentSnapshot?.agent_cognition || {};
  const previousTasks = previousSnapshot?.task_progress || {};
  const currentTasks = currentSnapshot?.task_progress || {};
  const previousTruth = previousSnapshot?.truth_kernel || {};
  const currentTruth = currentSnapshot?.truth_kernel || {};
  const previousFailures = previousSnapshot?.failure_memory || {};
  const currentFailures = currentSnapshot?.failure_memory || {};
  const previousQa = previousSnapshot?.qa_support || {};
  const currentQa = currentSnapshot?.qa_support || {};
  const runtimeDenominator = Math.max(
    1,
    Number(previousRuntime.agent_count || 0),
    Number(currentRuntime.agent_count || 0),
  );
  const agentDenominator = Math.max(
    1,
    Number(previousAgents.observed_agent_count || 0),
    Number(currentAgents.observed_agent_count || 0),
  );
  const taskDenominator = Math.max(
    1,
    Number(previousTasks.total_count || 0),
    Number(currentTasks.total_count || 0),
  );
  const truthDenominator = Math.max(
    1,
    Number(previousTruth.node_count || 0),
    Number(currentTruth.node_count || 0),
  );
  const failureDenominator = Math.max(
    1,
    Number(previousFailures.total_keys || 0),
    Number(currentFailures.total_keys || 0),
    Number(previousFailures.repeated_keys || 0),
    Number(currentFailures.repeated_keys || 0),
  );
  const qaStatusWeight = (value = '') => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'pass') return 1;
    if (normalized === 'degraded') return -0.5;
    if (normalized === 'fail') return -1;
    return 0;
  };
  const runtimeDelta = Number(((
    ((Number(currentRuntime.runtime_configured_count || 0) - Number(previousRuntime.runtime_configured_count || 0)) / runtimeDenominator) * 0.6
  ) + (
    ((Number(previousRuntime.degraded_count || 0) - Number(currentRuntime.degraded_count || 0)) / runtimeDenominator) * 0.4
  )).toFixed(2));
  const cognitionDelta = Number((
    (((Number(currentAgents.live_count || 0) - Number(previousAgents.live_count || 0)) / agentDenominator) * 0.7)
    + (((Number(currentAgents.matches_intended_count || 0) - Number(previousAgents.matches_intended_count || 0)) / agentDenominator) * 0.3)
  ).toFixed(2));
  const fallbackDelta = Number((
    (Number(previousAgents.total_fallback_count || 0) - Number(currentAgents.total_fallback_count || 0))
    / agentDenominator
  ).toFixed(2));
  const taskDelta = Number((
    (((Number(currentTasks.complete_count || 0) - Number(previousTasks.complete_count || 0)) / taskDenominator) * 0.7)
    + (((Number(previousTasks.stalled_count || 0) - Number(currentTasks.stalled_count || 0)) / taskDenominator) * 0.3)
  ).toFixed(2));
  const truthDelta = Number((
    (((Number(currentTruth.status_counts?.healthy || 0) - Number(previousTruth.status_counts?.healthy || 0)) / truthDenominator) * 0.5)
    + (((Number(previousTruth.status_counts?.blocked || 0) - Number(currentTruth.status_counts?.blocked || 0)) / truthDenominator) * 0.25)
    + ((Number(currentTruth.avg_confidence || 0) - Number(previousTruth.avg_confidence || 0)) * 0.25)
  ).toFixed(2));
  const failureDelta = Number(((
    ((Number(previousFailures.repeated_keys || 0) - Number(currentFailures.repeated_keys || 0)) / failureDenominator) * 0.7
  ) + (
    ((Number(previousFailures.total_keys || 0) - Number(currentFailures.total_keys || 0)) / failureDenominator) * 0.3
  )).toFixed(2));
  const qaPostureDelta = Number(((qaStatusWeight(currentQaPosture.verdict) - qaStatusWeight(previousQaPosture.verdict)) * 0.5).toFixed(2));
  const qaDelta = Number((
    (Number(currentQa.aggregate_score || 0) - Number(previousQa.aggregate_score || 0))
    / 4
  ).toFixed(2));
  const dimensionImpacts = [
    {
      id: 'agent_runtime',
      label: 'Agent runtime state',
      verdict: inferDimensionVerdict(runtimeDelta),
      delta: runtimeDelta,
      summary: `Runtime-configured agents ${Number(currentRuntime.runtime_configured_count || 0)}/${runtimeDenominator} vs ${Number(previousRuntime.runtime_configured_count || 0)}/${runtimeDenominator}; degraded or missing ${Number(currentRuntime.degraded_count || 0)} vs ${Number(previousRuntime.degraded_count || 0)}.`,
      weight: 0.18,
    },
    {
      id: 'agent_cognition',
      label: 'Agent cognition',
      verdict: inferDimensionVerdict(cognitionDelta),
      delta: cognitionDelta,
      summary: `Live cognition ${Number(currentAgents.live_count || 0)}/${agentDenominator} vs ${Number(previousAgents.live_count || 0)}/${agentDenominator}; intended-path matches ${Number(currentAgents.matches_intended_count || 0)}/${agentDenominator} vs ${Number(previousAgents.matches_intended_count || 0)}/${agentDenominator}.`,
      weight: 0.22,
    },
    {
      id: 'fallback_pressure',
      label: 'Fallback pressure',
      verdict: inferDimensionVerdict(fallbackDelta),
      delta: fallbackDelta,
      summary: `Fallbacks ${Number(currentAgents.total_fallback_count || 0)} vs ${Number(previousAgents.total_fallback_count || 0)} across observed agents.`,
      weight: 0.17,
    },
    {
      id: 'task_progress',
      label: 'Task progress',
      verdict: inferDimensionVerdict(taskDelta),
      delta: taskDelta,
      summary: `Tasks ${Number(currentTasks.complete_count || 0)} complete / ${Number(currentTasks.in_progress_count || 0)} in progress / ${Number(currentTasks.stalled_count || 0)} stalled versus ${Number(previousTasks.complete_count || 0)} / ${Number(previousTasks.in_progress_count || 0)} / ${Number(previousTasks.stalled_count || 0)}.`,
      weight: 0.14,
    },
    {
      id: 'truth_kernel',
      label: 'Truth kernel',
      verdict: inferDimensionVerdict(truthDelta),
      delta: truthDelta,
      summary: `Truth nodes ${Number(currentTruth.status_counts?.healthy || 0)} healthy / ${Number(currentTruth.status_counts?.blocked || 0)} blocked / ${Number(currentTruth.active_count || 0)} active versus ${Number(previousTruth.status_counts?.healthy || 0)} / ${Number(previousTruth.status_counts?.blocked || 0)} / ${Number(previousTruth.active_count || 0)}.`,
      weight: 0.17,
    },
    {
      id: 'failure_memory',
      label: 'Failure memory',
      verdict: inferDimensionVerdict(failureDelta),
      delta: failureDelta,
      summary: `Repeated failures ${Number(currentFailures.repeated_keys || 0)} vs ${Number(previousFailures.repeated_keys || 0)}; tracked failure keys ${Number(currentFailures.total_keys || 0)} vs ${Number(previousFailures.total_keys || 0)}.`,
      weight: 0.12,
    },
    {
      id: 'qa_posture',
      label: 'QA adjudicated posture',
      verdict: inferDimensionVerdict(qaPostureDelta),
      delta: qaPostureDelta,
      summary: `QA adjudication ${normalizeText(currentQaPosture.verdict) || 'unknown'} (${normalizeText(currentQaPosture.freshness) || 'missing'}) vs ${normalizeText(previousQaPosture.verdict) || 'unknown'} (${normalizeText(previousQaPosture.freshness) || 'missing'}).`,
      weight: 0,
    },
    {
      id: 'qa_support',
      label: 'QA support',
      verdict: inferDimensionVerdict(qaDelta),
      delta: qaDelta,
      summary: `Supporting QA aggregate ${Number(currentQa.aggregate_score || 0).toFixed(2)} vs ${Number(previousQa.aggregate_score || 0).toFixed(2)} across ${Number(currentQa.scorecard_count || 0)} scorecards.`,
      weight: 0,
    },
  ];
  const scorecardImpacts = buildScorecardImpactsFromSnapshots(previousSnapshot, currentSnapshot);
  const primaryDimensionImpacts = dimensionImpacts.filter((entry) => !['qa_support', 'qa_posture'].includes(entry.id));
  const primaryWeight = Math.max(0.01, primaryDimensionImpacts.reduce((sum, entry) => sum + Number(entry.weight || 0), 0));
  const rawOverallDelta = Number(((primaryDimensionImpacts.reduce((sum, entry) => sum + (entry.delta * entry.weight), 0) / primaryWeight) * 4).toFixed(2));
  const groundedComparison = currentContract?.grounding_status === 'grounded' && previousContract?.grounding_status === 'grounded';
  const overallDelta = groundedComparison ? rawOverallDelta : 0;
  const verdict = groundedComparison ? inferVerdict(rawOverallDelta) : 'no_change';
  const improved = primaryDimensionImpacts.filter((entry) => entry.verdict === 'better').map((entry) => entry.label);
  const regressed = primaryDimensionImpacts.filter((entry) => entry.verdict === 'worse').map((entry) => entry.label);
  const changedDimensions = normalizeStringArray((groundedComparison ? dimensionImpacts : [])
    .filter((entry) => entry.verdict !== 'no_change')
    .map((entry) => entry.id));
  const missingInputIds = normalizeStringArray([
    ...(Array.isArray(currentContract?.missing_input_ids) ? currentContract.missing_input_ids : []),
    ...(Array.isArray(previousContract?.missing_input_ids) ? previousContract.missing_input_ids : []),
  ]);
  const progressSummary = !groundedComparison
    ? `Evaluator comparison is incomplete because grounded seams are missing: ${missingInputIds.join(', ') || 'required runtime inputs'}. QA scorecards remain supporting evidence only.`
    : regressed.length
      ? `Grounded regression detected in ${regressed.join(', ')}.${improved.length ? ` Offsetting improvement in ${improved.join(', ')}.` : ''}`
      : improved.length
        ? `Grounded improvement detected in ${improved.join(', ')}.${scorecardImpacts.length ? ` QA support observed ${scorecardImpacts.length} scorecard movement signal${scorecardImpacts.length === 1 ? '' : 's'}.` : ''}`
        : (dimensionImpacts.find((entry) => entry.id === 'qa_support' && entry.verdict !== 'no_change')
            ? 'Grounded system state remained materially stable across runtime, cognition, task progress, truth-kernel, and failure-memory movement. QA moved only as supporting evidence.'
            : 'Grounded system state remained materially stable across runtime, cognition, task progress, truth-kernel, and failure-memory movement.');
  const availableDimensionCount = dimensionImpacts.filter((entry) => entry.summary).length;
  const consultedSeams = [
    ...(Array.isArray(previousContract?.consulted_seams) ? previousContract.consulted_seams : []),
    ...(Array.isArray(currentContract?.consulted_seams) ? currentContract.consulted_seams : []),
  ].filter((entry, index, items) => items.findIndex((candidate) => candidate?.id === entry?.id) === index);
  return {
    verdict,
    delta_score: overallDelta,
    progress_summary: progressSummary,
    changed_dimensions: changedDimensions,
    evaluation_confidence: groundedComparison
      ? clamp01(previousSnapshot ? (0.48 + (Number(currentContract?.completeness || 0) * 0.4) + (availableDimensionCount * 0.02)) : 0.42, 0.64)
      : clamp01(0.2 + (Number(currentContract?.completeness || 0) * 0.3), 0.34),
    score_pressure: groundedComparison ? inferScorePressure(overallDelta) : 'flat',
    progress_state: groundedComparison
      ? (verdict === 'better' ? 'stable' : (verdict === 'worse' ? 'regressive' : 'stalled'))
      : 'stalled',
    dimension_impacts: dimensionImpacts,
    scorecard_impacts: scorecardImpacts,
    analysis_classification: EVALUATOR_ANALYSIS_CLASSIFICATION,
    authority_scope: EVALUATOR_AUTHORITY_SCOPE,
    consulted_seams: consultedSeams,
    grounding: {
      status: groundedComparison ? 'grounded' : 'insufficient_inputs',
      completeness: Number(Math.min(
        Number(previousContract?.completeness || 0),
        Number(currentContract?.completeness || 0),
      ).toFixed(2)),
      missing_input_ids: missingInputIds,
      caveats: normalizeStringArray([
        ...(Array.isArray(previousContract?.caveats) ? previousContract.caveats : []),
        ...(Array.isArray(currentContract?.caveats) ? currentContract.caveats : []),
      ]),
      required_primary_seams: normalizeStringArray(currentContract?.required_primary_seams),
    },
    qa_authority: {
      owner: 'qa',
      verdict: normalizeText(currentQaPosture?.verdict) || null,
      freshness: normalizeText(currentQaPosture?.freshness) || null,
      adjudicated_at: currentQaPosture?.adjudicated_at || null,
      summary: normalizeText(currentQaPosture?.summary) || null,
      source_paths: ['data/spatial/qa/lead-state.json', 'data/spatial/qa/lead-runs/*.json', 'data/spatial/qa/structured/latest.json'],
    },
    provenance: {
      classification: EVALUATOR_ANALYSIS_CLASSIFICATION,
      consulted_source_paths: uniqueSourcePaths(consultedSeams.flatMap((entry) => Array.isArray(entry?.source_paths) ? entry.source_paths : [])),
      truth_kernel_source: '/api/spatial/truth-kernel',
      qa_posture_source: 'data/spatial/qa/lead-state.json',
      scorecards_role: 'supporting_evidence',
    },
  };
}

function buildDeterministicFallback({
  definition,
  comparedAt,
  comparisonTarget,
  previousSnapshot = null,
  currentSnapshot = null,
  fallbackReason = '',
  baselineComparison = null,
  cognitionDiagnostics = null,
} = {}) {
  const baseline = baselineComparison || deriveComparisonEvidence(previousSnapshot, currentSnapshot);
  const previousAggregate = snapshotAggregateScore(previousSnapshot);
  const currentAggregate = snapshotAggregateScore(currentSnapshot);
  return {
    run_id: makeEvaluatorRunId(comparedAt),
    evaluator_id: definition.manifest.id || 'evaluator',
    compared_at: comparedAt,
    comparison_target: comparisonTarget,
    analysis_classification: baseline.analysis_classification || EVALUATOR_ANALYSIS_CLASSIFICATION,
    authority_scope: baseline.authority_scope || EVALUATOR_AUTHORITY_SCOPE,
    verdict: baseline.verdict,
    delta_score: baseline.delta_score,
    progress_summary: baseline.progress_summary,
    changed_dimensions: baseline.changed_dimensions,
    evaluation_confidence: previousSnapshot ? 0.52 : 0.36,
    cognition_mode: FALLBACK_COGNITION_MODE,
    model_name: null,
    source_snapshot_ids: {
      previous: previousSnapshot?.snapshot_id || null,
      current: currentSnapshot?.snapshot_id || null,
    },
    score_pressure: baseline.score_pressure,
    progress_state: baseline.progress_state,
    dimension_impacts: baseline.dimension_impacts,
    scorecard_impacts: baseline.scorecard_impacts.map((entry) => ({
      ...entry,
      progress_summary: entry.progress_summary || `QA support changed from aggregate ${previousAggregate.toFixed(2)} to ${currentAggregate.toFixed(2)}.`,
    })),
    consulted_seams: Array.isArray(baseline.consulted_seams) ? baseline.consulted_seams : [],
    grounding: baseline.grounding || null,
    qa_authority: baseline.qa_authority || {
      owner: 'qa',
      role: 'adjudicated_reference',
      evaluator_role: 'derived_analysis_only',
    },
    provenance: baseline.provenance || null,
    fallback_reason: normalizeText(fallbackReason) || 'Evaluator fell back to deterministic comparison.',
    cognition_diagnostics: cognitionDiagnostics,
  };
}

function normalizeEvaluationPayload(rawPayload = {}, {
  definition,
  comparedAt,
  comparisonTarget,
  previousSnapshot = null,
  currentSnapshot = null,
  cognitionMode,
  modelName = null,
  baselineComparison = null,
  cognitionDiagnostics = null,
} = {}) {
  const baseline = baselineComparison || deriveComparisonEvidence(previousSnapshot, currentSnapshot);
  const grounded = baseline?.grounding?.isGrounded !== false;
  const deltaScore = grounded
    ? Number(asFiniteNumber(rawPayload.delta_score ?? rawPayload.deltaScore, baseline.delta_score).toFixed(2))
    : Number(asFiniteNumber(baseline.delta_score, 0).toFixed(2));
  const verdict = grounded
    ? normalizeVerdict(rawPayload.verdict || inferVerdict(deltaScore))
    : normalizeVerdict(baseline.verdict || 'no_change');
  const changedDimensions = normalizeStringArray(
    (Array.isArray(rawPayload.changed_dimensions) ? rawPayload.changed_dimensions : []).map((entry) => normalizeText(entry))
  );
  const normalizedDimensionImpacts = (Array.isArray(rawPayload.dimension_impacts) ? rawPayload.dimension_impacts : [])
    .map((entry) => normalizeDimensionImpact(entry))
    .filter(Boolean);
  const normalizedImpacts = (Array.isArray(rawPayload.scorecard_impacts) ? rawPayload.scorecard_impacts : [])
    .map((entry) => normalizeScorecardImpact(entry))
    .filter(Boolean);
  return {
    run_id: makeEvaluatorRunId(comparedAt),
    evaluator_id: definition.manifest.id || 'evaluator',
    compared_at: comparedAt,
    comparison_target: normalizeText(rawPayload.comparison_target || comparisonTarget) || comparisonTarget,
    analysis_classification: normalizeText(rawPayload.analysis_classification || rawPayload.analysisClassification)
      || baseline.analysis_classification
      || EVALUATOR_ANALYSIS_CLASSIFICATION,
    authority_scope: normalizeText(rawPayload.authority_scope || rawPayload.authorityScope)
      || baseline.authority_scope
      || EVALUATOR_AUTHORITY_SCOPE,
    verdict,
    delta_score: deltaScore,
    progress_summary: grounded
      ? (normalizeText(rawPayload.progress_summary || rawPayload.delta_summary || rawPayload.summary) || baseline.progress_summary || 'Evaluator completed comparison.')
      : (baseline.progress_summary || 'Evaluator completed comparison.'),
    changed_dimensions: changedDimensions.length
      ? changedDimensions
      : baseline.changed_dimensions,
    evaluation_confidence: clamp01(rawPayload.evaluation_confidence ?? rawPayload.confidence, baseline.evaluation_confidence || 0.61),
    cognition_mode: cognitionMode,
    model_name: cognitionMode === MODEL_COGNITION_MODE ? (modelName || null) : null,
    source_snapshot_ids: {
      previous: previousSnapshot?.snapshot_id || null,
      current: currentSnapshot?.snapshot_id || null,
    },
    score_pressure: grounded
      ? (normalizeText(rawPayload.score_pressure || rawPayload.scorePressure) || baseline.score_pressure || inferScorePressure(deltaScore))
      : (baseline.score_pressure || 'flat'),
    progress_state: grounded
      ? (normalizeText(rawPayload.progress_state || rawPayload.progressState) || baseline.progress_state || (verdict === 'better' ? 'stable' : (verdict === 'worse' ? 'regressive' : 'stalled')))
      : (baseline.progress_state || 'stalled'),
    dimension_impacts: grounded && normalizedDimensionImpacts.length ? normalizedDimensionImpacts : baseline.dimension_impacts,
    scorecard_impacts: normalizedImpacts.length ? normalizedImpacts : baseline.scorecard_impacts,
    consulted_seams: Array.isArray(baseline.consulted_seams) ? baseline.consulted_seams : [],
    grounding: baseline.grounding || null,
    qa_authority: baseline.qa_authority || {
      owner: 'qa',
      role: 'adjudicated_reference',
      evaluator_role: 'derived_analysis_only',
    },
    provenance: baseline.provenance || null,
    cognition_diagnostics: cognitionDiagnostics,
  };
}

function persistEvaluation(rootPath, evaluation, {
  previousSnapshot = null,
  currentSnapshot = null,
} = {}) {
  ensureEvaluatorStorage(rootPath);
  const runRecord = {
    run_id: evaluation.run_id,
    stored_at: nowIso(),
    evaluation,
    previous_snapshot: previousSnapshot,
    current_snapshot: currentSnapshot,
  };
  writeJson(evaluatorRunFilePath(rootPath, evaluation.run_id), runRecord);
  const historyPath = evaluatorHistoryPath(rootPath);
  const nextHistory = [
    evaluation,
    ...(Array.isArray(readJsonSafe(historyPath, [])) ? readJsonSafe(historyPath, []) : []),
  ]
    .filter(Boolean)
    .filter((entry, index, items) => items.findIndex((candidate) => candidate?.run_id === entry?.run_id) === index)
    .slice(0, EVALUATOR_HISTORY_LIMIT);
  writeJson(historyPath, nextHistory);
  writeJson(evaluatorStatePath(rootPath), {
    updated_at: nowIso(),
    latest_evaluation: evaluation,
    latest_snapshot: currentSnapshot,
    previous_snapshot: previousSnapshot,
    history_count: nextHistory.length,
  });
  return {
    run: evaluatorRunFilePath(rootPath, evaluation.run_id),
    history: historyPath,
    state: evaluatorStatePath(rootPath),
  };
}

function readEvaluatorState(rootPath) {
  return {
    state: readJsonSafe(evaluatorStatePath(rootPath), {}),
    history: Array.isArray(readJsonSafe(evaluatorHistoryPath(rootPath), []))
      ? readJsonSafe(evaluatorHistoryPath(rootPath), [])
      : [],
  };
}

function readLatestEvaluation(rootPath) {
  return readEvaluatorState(rootPath).state?.latest_evaluation || null;
}

function readEvaluatorHistory(rootPath, limit = 10) {
  return readEvaluatorState(rootPath).history.slice(0, Math.max(0, Number(limit) || 0));
}

async function evaluateSnapshots({
  rootPath,
  previousSnapshot = null,
  currentSnapshot = null,
  comparisonTarget = SNAPSHOT_COMPARISON_TARGET,
  contextSummary = '',
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!rootPath) throw new Error('rootPath is required for evaluator runs.');
  const definition = resolveAgentDefinition(rootPath, 'evaluator', {
    fallbackManifest: {
      id: 'evaluator',
      name: 'Evaluator',
      deskId: 'qa-lead',
      runtime: 'ollama-json',
      backend: 'ollama',
      model: 'mistral:latest',
      host: DEFAULT_OLLAMA_HOST,
      timeoutMs: DEFAULT_OLLAMA_TIMEOUT_MS,
      autoRun: false,
    },
    fallbackPrompt: 'Return strict evaluator JSON only.',
  });
  const comparedAt = nowIso();
  const baselineComparison = deriveComparisonEvidence(previousSnapshot, currentSnapshot);
  const promptProfile = buildEvaluatorPromptProfile({
    promptTemplate: definition.prompt,
    previousSnapshot,
    currentSnapshot,
    comparisonTarget,
    contextSummary,
  });
  const prompt = promptProfile.prompt;
  const timeoutMs = Number(definition.manifest.timeoutMs || DEFAULT_OLLAMA_TIMEOUT_MS);
  let evaluation;
  try {
    const response = await requestOllamaJson({
      prompt,
      model: definition.manifest.model,
      host: definition.manifest.host,
      timeoutMs,
      fetchImpl,
    });
    const cognitionDiagnostics = buildEvaluatorCognitionDiagnostics({
      model: definition.manifest.model,
      timeoutMs,
      promptProfile,
      usedLiveCall: true,
      usedFallback: false,
    });
    evaluation = normalizeEvaluationPayload(response?.json || {}, {
      definition,
      comparedAt,
      comparisonTarget,
      previousSnapshot,
      currentSnapshot,
      cognitionMode: MODEL_COGNITION_MODE,
      modelName: definition.manifest.model,
      baselineComparison,
      cognitionDiagnostics,
    });
  } catch (error) {
    const cognitionDiagnostics = buildEvaluatorCognitionDiagnostics({
      model: definition.manifest.model,
      timeoutMs,
      promptProfile,
      usedLiveCall: true,
      usedFallback: true,
      error,
    });
    evaluation = buildDeterministicFallback({
      definition,
      comparedAt,
      comparisonTarget,
      previousSnapshot,
      currentSnapshot,
      fallbackReason: String(error?.message || error),
      baselineComparison,
      cognitionDiagnostics,
    });
  }
  const persistedPaths = persistEvaluation(rootPath, evaluation, { previousSnapshot, currentSnapshot });
  return {
    ok: evaluation.cognition_mode === MODEL_COGNITION_MODE,
    evaluation,
    previousSnapshot,
    currentSnapshot,
    persistedPaths,
  };
}

async function maybeRunEvaluatorCycle({
  rootPath,
  workspace = null,
  scorecards = [],
  comparisonTarget = SNAPSHOT_COMPARISON_TARGET,
  contextSummary = '',
  capturedAt = null,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!rootPath) throw new Error('rootPath is required for evaluator cycles.');
  const currentSnapshot = buildEvaluatorSnapshot({
    rootPath,
    workspace,
    scorecards,
    comparisonTarget,
    capturedAt,
  });
  const state = readEvaluatorState(rootPath);
  const previousSnapshot = state.state?.latest_snapshot || null;
  const previousFingerprint = normalizeText(previousSnapshot?.fingerprint);
  const currentFingerprint = normalizeText(currentSnapshot?.fingerprint);
  const latestEvaluation = state.state?.latest_evaluation || null;
  if (previousFingerprint && currentFingerprint && previousFingerprint === currentFingerprint && latestEvaluation) {
    return {
      ok: latestEvaluation.cognition_mode === MODEL_COGNITION_MODE,
      skipped: true,
      reason: 'Evaluator snapshot fingerprint is unchanged.',
      evaluation: latestEvaluation,
      previousSnapshot,
      currentSnapshot,
      persistedPaths: {
        state: evaluatorStatePath(rootPath),
        history: evaluatorHistoryPath(rootPath),
        run: latestEvaluation.run_id ? evaluatorRunFilePath(rootPath, latestEvaluation.run_id) : null,
      },
    };
  }
  return evaluateSnapshots({
    rootPath,
    previousSnapshot,
    currentSnapshot,
    comparisonTarget,
    contextSummary,
    fetchImpl,
  });
}

module.exports = {
  EVALUATOR_DIR,
  EVALUATOR_RUNS_DIR,
  FALLBACK_COGNITION_MODE,
  MODEL_COGNITION_MODE,
  buildAgentCognitionSnapshot,
  buildEvaluatorCognitionDiagnostics,
  buildEvaluatorPromptProfile,
  buildEvaluatorSnapshot,
  buildTaskSnapshot,
  buildTruthKernelSummary,
  classifyEvaluatorFailureReason,
  deriveComparisonEvidence,
  evaluateSnapshots,
  evaluatorHistoryPath,
  evaluatorRunFilePath,
  evaluatorStatePath,
  maybeRunEvaluatorCycle,
  readEvaluatorHistory,
  readEvaluatorState,
  readLatestEvaluation,
};
