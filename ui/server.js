const express = require('express');
const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const {
  advanceOrchestratorWorkspace,
  buildRuntimePayload,
  createTeamBoardCard,
  createDefaultTeamBoard,
  createDefaultMutationGateState,
  normalizeGraphBundle,
  createDefaultRsgState,
  buildRsgState,
  getSelectedExecutionCard,
  normalizeNotebookState,
  normalizeMutationGateState,
  normalizeTeamBoardState,
} = require('./orchestratorState');
const {
  SELF_TARGET_KEY,
  createDefaultSelfUpgradeState,
  normalizeSelfUpgradeState,
  ensureSelfProject,
  isSelfTarget,
  reviewSelfUpgradePatch,
  assessAutoMutationRisk,
  summarizeCommandOutput,
  getSelfUpgradePreflightSpecs,
} = require('./selfUpgrade');
const {
  classifyExecutionProvenance,
  createExecutionProvenance,
  createPlannerHandoff,
  listThroughputSessions,
  readThroughputSession,
  mergeExecutionProvenance,
  summarizeSession,
  updateThroughputSession,
  runThroughputSession,
  reconcilePendingThroughputSessions,
} = require('./throughputDebug');
const {
  evaluatePreLlmGuards,
} = require('./preflightGuards');
const {
  recordFailureOccurrence,
  normalizeFailureKey,
  readFailureHistory,
} = require('./failureMemory');
const {
  ensureQAStorage,
  listQARuns,
  readLocalGateReport,
  readQARun,
  readStructuredQAReport,
  runQARun,
  summarizeQARun,
  writeStructuredQAReport,
} = require('./qaRunner');
const {
  CORE_DESK_AGENT_DEFAULTS,
  createDefaultStudioLayoutSchema,
  normalizeStudioLayoutSchema,
  listStudioDeskIds,
  hasStudioDesk,
  addDepartmentToLayout,
  addDeskToLayout,
  buildStudioLayoutCatalog,
} = require('./studioLayoutSchema');
const {
  WORLD_SCAFFOLD_KIND,
  WORLD_SCAFFOLD_METADATA_KEYS,
  buildWorldScaffoldMutationPlan,
  buildWorldScaffoldMutations,
  detectPotentialWorldScaffoldPrompt,
  evaluateWorldScaffoldCandidate,
  findWorldScaffoldNode,
  isWorldScaffold,
  normalizeWorldScaffoldCandidate,
  parseWorldScaffoldIntent,
  shouldAttemptModelScaffoldInterpretation,
} = require('./worldScaffold');
const {
  deriveRecentWorldChange,
} = require('./worldDiff');
const {
  createDefaultAgentWorkersState,
  evaluatePlannerEligibility,
  getAgentWorkerConfig,
  makeExecutorRunId,
  listPlannerRuns,
  makeContextManagerRunId,
  makePlannerRunId,
  normalizeAgentWorkersState,
  runExecutorWorker,
  runContextManagerWorker,
  runPlannerWorker,
  summarizeContextManagerRun,
  summarizeExecutorRun,
  summarizePlannerRun,
} = require('./agentWorkers');
const {
  buildTaskArtifactAttributionMap,
  resolveArtifactAgentIdentity,
  resolveStageAgentIdentity,
  renderAgentAttributionBlock,
} = require('./agentAttribution');
const {
  buildAgentAuditRecord,
  writeAgentAuditArtifacts,
} = require('./agentAudit');
const {
  buildConstrainedAutoFixBundle,
  runConstrainedAutoFixExecutor,
} = require('./constrainedAutoFix');

const ROLE_TAXONOMY_PATH = path.join(__dirname, 'public', 'spatial', 'roleTaxonomy.mjs');
const RND_EXPERIMENTS_FILE = path.join(__dirname, '..', 'data', 'spatial', 'rnd-experiments.json');
let cachedRoleTaxonomy = null;
let cachedRndExperiments = null;

function loadRoleTaxonomy() {
  if (cachedRoleTaxonomy) return cachedRoleTaxonomy;
  const source = fs.readFileSync(ROLE_TAXONOMY_PATH, 'utf8');
  const match = source.match(/export const ROLE_TAXONOMY_JSON = String\.raw`([\s\S]*?)`;/);
  if (!match) {
    throw new Error('roleTaxonomy.mjs is missing the ROLE_TAXONOMY_JSON export.');
  }
  cachedRoleTaxonomy = JSON.parse(match[1]);
  return cachedRoleTaxonomy;
}

function buildDeskPanelMetadata(deskId, deskLayout, departmentLayout) {
  const taxonomy = loadRoleTaxonomy();
  const role = taxonomy.roles.find((entry) => entry.id === deskId || (Array.isArray(entry.allowedDeskIds) && entry.allowedDeskIds.includes(deskId))) || null;
  const station = role?.station || {};
  const panel = station.panel || role?.panel || null;
  if (!panel) {
    return null;
  }
  return {
    mission: String(panel.mission || station.mission || deskLayout?.summary || departmentLayout?.summary || '').trim() || null,
    responsibilities: Array.isArray(panel.responsibilities) ? panel.responsibilities.filter(Boolean) : [],
    hardRules: Array.isArray(panel.hardRules) ? panel.hardRules.filter(Boolean) : [],
    deliveryRelationship: String(panel.deliveryRelationship || '').trim() || null,
    visibility: panel.visibility || 'read-only',
  };
}

function normalizeConfidence(value = 0) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return 0;
  return Math.min(1, Math.max(0, normalized));
}

function normalizeRndExperimentPrimitiveRecord(record = {}) {
  const source = record && typeof record === 'object' && !Array.isArray(record) ? record : {};
  const normalizeText = (value) => String(value ?? '').trim();
  const normalizeTextList = (value) => (Array.isArray(value) ? value.map((entry) => normalizeText(entry)).filter(Boolean) : []);
  return {
    primitive: normalizeText(source.primitive),
    description: normalizeText(source.description),
    data_shape: normalizeText(source.data_shape),
    constraints: normalizeTextList(source.constraints),
    example: normalizeText(source.example),
    confidence: normalizeConfidence(source.confidence),
  };
}

function normalizeRndExperimentRecord(record = {}) {
  const source = record && typeof record === 'object' && !Array.isArray(record) ? record : {};
  const normalizeText = (value) => String(value ?? '').trim();
  const normalizeTextList = (value) => (Array.isArray(value) ? value.map((entry) => normalizeText(entry)).filter(Boolean) : []);
  const lifecycle = normalizeText(source.lifecycle || source.status || 'proposed').toLowerCase();
  return {
    id: normalizeText(source.id),
    hypothesis: normalizeText(source.hypothesis),
    lifecycle: lifecycle || 'proposed',
    scope: normalizeTextList(source.scope),
    inputs: normalizeTextList(source.inputs),
    expected_output: normalizeText(source.expected_output),
    success_criteria: normalizeText(source.success_criteria),
    failure_criteria: normalizeText(source.failure_criteria),
    salvageable_components: normalizeTextList(source.salvageable_components),
    integration_target: normalizeText(source.integration_target),
    what_worked: normalizeTextList(source.what_worked),
    what_failed: normalizeTextList(source.what_failed),
    reusable_components: normalizeTextList(source.reusable_components),
    discard_reason: normalizeText(source.discard_reason),
    extracted_primitives: Array.isArray(source.extracted_primitives)
      ? source.extracted_primitives.map(normalizeRndExperimentPrimitiveRecord).filter((entry) => entry.primitive)
      : [],
  };
}

function validateRndExperimentPrimitiveRecord(record = {}) {
  const normalized = normalizeRndExperimentPrimitiveRecord(record);
  const issues = [];
  ['primitive', 'description', 'data_shape', 'example'].forEach((field) => {
    if (!String(record?.[field] ?? '').trim()) {
      issues.push(field);
    }
  });
  if (!Array.isArray(record?.constraints)) {
    issues.push('constraints');
  } else if (record.constraints.some((entry) => !String(entry ?? '').trim())) {
    issues.push('constraints-item');
  }
  const confidence = Number(record?.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    issues.push('confidence');
  }
  return {
    ok: issues.length === 0,
    issues,
    record: normalized,
  };
}

function evaluateRndExperimentPromotionReadiness(record = {}) {
  const normalized = normalizeRndExperimentRecord(record);
  const lifecycle = String(normalized.lifecycle || '').trim().toLowerCase();
  const requiredScalars = ['id', 'hypothesis', 'expected_output', 'success_criteria', 'failure_criteria', 'integration_target'];
  const scalarValid = requiredScalars.every((field) => String(normalized[field] || '').trim());
  const lifecycleValid = ['proposed', 'approved', 'in_progress', 'failed', 'salvaged', 'promoted', 'archived'].includes(lifecycle);
  const scopeValid = Array.isArray(normalized.scope);
  const inputsValid = Array.isArray(normalized.inputs);
  const salvageableValid = Array.isArray(normalized.salvageable_components);
  const primitiveResults = Array.isArray(normalized.extracted_primitives)
    ? normalized.extracted_primitives.map(validateRndExperimentPrimitiveRecord)
    : [];
  const validPrimitiveCount = primitiveResults.filter((entry) => entry.ok).length;
  const hasValidPrimitive = validPrimitiveCount > 0;
  const explicitQaFlag = ['1', 'true', 'yes', 'y', 'passed', 'pass', 'ok', 'ready'].includes(String(record.basic_qa_passed ?? record.qa_passed ?? record.qa_status ?? record.validation_passed ?? '').trim().toLowerCase())
    ? true
    : ['0', 'false', 'no', 'n', 'failed', 'fail', 'blocked', 'not_ready'].includes(String(record.basic_qa_passed ?? record.qa_passed ?? record.qa_status ?? record.validation_passed ?? '').trim().toLowerCase())
      ? false
      : null;
  const basicQaPassed = explicitQaFlag != null
    ? explicitQaFlag
    : ['approved', 'in_progress', 'salvaged'].includes(lifecycle);
  const terminalLifecycle = lifecycle === 'promoted' || lifecycle === 'archived';
  const contractValid = Boolean(scalarValid && lifecycleValid && scopeValid && inputsValid && salvageableValid);
  const primitivesValid = primitiveResults.every((entry) => entry.ok);
  const eligible = contractValid && primitivesValid && basicQaPassed && hasValidPrimitive && Boolean(normalized.integration_target) && !terminalLifecycle;
  const reasons = [];
  if (!contractValid) reasons.push('Experiment contract validation failed.');
  if (!basicQaPassed) reasons.push('Basic QA has not passed.');
  if (!hasValidPrimitive) reasons.push('At least one extracted primitive is required.');
  if (!normalized.integration_target) reasons.push('A downstream integration target is required.');
  if (!primitivesValid) reasons.push('At least one extracted primitive failed validation.');
  if (lifecycle === 'promoted') reasons.push('Experiment is already promoted.');
  if (lifecycle === 'archived') reasons.push('Experiment is archived.');
  return {
    eligible,
    state: lifecycle === 'promoted' ? 'promoted' : lifecycle === 'archived' ? 'archived' : eligible ? 'eligible' : 'blocked',
    contractValid,
    basicQaPassed,
    hasIntegrationTarget: Boolean(normalized.integration_target),
    hasValidPrimitive,
    primitiveCount: Array.isArray(normalized.extracted_primitives) ? normalized.extracted_primitives.length : 0,
    validPrimitiveCount,
    lifecycle,
    integrationTarget: normalized.integration_target,
    reasons,
    primitives: primitiveResults,
  };
}

function loadRndExperimentRecords() {
  if (cachedRndExperiments) return cachedRndExperiments;
  const seed = readJsonSafe(RND_EXPERIMENTS_FILE, null);
  const experiments = Array.isArray(seed?.experiments) ? seed.experiments : [];
  cachedRndExperiments = {
    contract: String(seed?.contract || 'rnd-experiment.v1'),
    updatedAt: seed?.updatedAt || null,
    experiments: experiments
      .map(normalizeRndExperimentRecord)
      .filter((record) => record.id)
      .map((record) => ({
        ...record,
        promotion_readiness: evaluateRndExperimentPromotionReadiness(record),
      })),
  };
  return cachedRndExperiments;
}
const {
  buildAgentCapabilityProfile,
  readAgentCapabilityProfile,
  rebuildAgentCapabilityLedger,
} = require('./agentCapabilities');
const {
  CANONICAL_TARGETS_FILE,
  DEFAULT_DOMAIN_KEY,
  buildAnchorBundle,
  listCanonicalAnchorPaths,
  readAnchorFile,
  resolveTargetsConfig,
} = require('./anchorResolver');
const {
  buildSliceStoreFromCards,
  projectBoardFromSlices,
  readSliceStore,
  writeSliceArtifacts,
} = require('./sliceRepository');
const {
  applyArchivistWriteback,
} = require('./archivistWriteback');
const {
  TASK_CACHE_SOURCE,
  readTaskCache,
  summarizeTaskCache,
} = require('./taskCache');
const {
  createBoundedFixTaskArtifact,
  evaluateAutonomyPolicy,
  summarizeAutonomyPolicyDecision,
} = require('./autonomyPolicy');
const {
  buildFixTaskPromptSection,
  consumePendingFixTask,
  finalizeFixTask,
} = require('./fixTasks');
const {
  generateCandidates,
  validateGap,
} = require('../ta/generateCandidates');
const {
  executeModuleAction,
} = require('./moduleRunner');
const {
  LEGACY_FALLBACK_ACTIONS,
  buildLegacyRunnerCommand,
  runLegacyFallbackSync,
  runLegacyFallbackStream,
} = require('./legacyRunnerAdapter');
const {
  callOllamaGenerate,
} = require('./llmAdapter');
const {
  DEFAULT_OLLAMA_HOST,
  DEFAULT_OLLAMA_TIMEOUT_MS,
} = require('./localModelClient');
const {
  runAll: runStructuredQA,
} = require('../qa/qaLead');
const {
  AGENTS_ROOT,
  normalizeAgentId,
} = require('./agentRegistry');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '512kb' }));

app.get(['/qa', '/qa/'], (req, res) => {
  res.redirect(302, '/?mode=qa');
});

const ROOT = path.join(__dirname, '..');
const COMMANDS_FILE = path.join(ROOT, 'ace_commands.json');
const TASKS_DIR = path.join(ROOT, 'work', 'tasks');
const REFRESH_MS_DEFAULT = 10000;
const MAX_RUN_HISTORY = 20;
const SPATIAL_WORKSPACE_FILE = path.join(ROOT, 'data', 'spatial', 'workspace.json');
const SPATIAL_HISTORY_FILE = path.join(ROOT, 'data', 'spatial', 'history.json');
const SPATIAL_PAGES_FILE = path.join(ROOT, 'data', 'spatial', 'pages.json');
const SPATIAL_INTENT_STATE_FILE = path.join(ROOT, 'data', 'spatial', 'intent-state.json');
const SPATIAL_STUDIO_STATE_FILE = path.join(ROOT, 'data', 'spatial', 'studio-state.json');
const SPATIAL_ARCHITECTURE_MEMORY_FILE = path.join(ROOT, 'data', 'spatial', 'architecture-memory.json');
const TA_DEPARTMENT_FILE = path.join(ROOT, 'data', 'spatial', 'ta-department.json');
const CTO_DIAGNOSTICS_FILE = path.join(ROOT, 'data', 'spatial', 'cto-diagnostics.json');
const SERVER_STARTED_AT = nowIso();
const DOMAIN_KEY = DEFAULT_DOMAIN_KEY;
const dashboardFiles = listCanonicalAnchorPaths(DOMAIN_KEY);

const runStore = new Map();
const runOrder = [];
const projectRunStore = new Map();
const QA_LEAD_DESK_ID = 'qa-lead';
const STATIC_WEB_PROJECT_KEY = 'topdown-slice';
const STATIC_WEB_HOST = '127.0.0.1';
const STATIC_WEB_DEFAULT_PORT = 4173;
const STATIC_WEB_SUPPORTED_ORIGIN = `http://${STATIC_WEB_HOST}:${STATIC_WEB_DEFAULT_PORT}/`;
const STATIC_WEB_SHELL_MARKER = 'Top-Down Thin Slice';
const STATIC_WEB_BOOT_ENTRY_PATHS = ['/src/main.js', '/src/editor/ui.js'];
const PROJECT_RUN_START_TIMEOUT_MS = 4000;
const TASK_ARTIFACT_NAMES = ['idea.txt', 'context.md', 'plan.md', 'patch.diff', 'apply_result.json', 'agent_attribution.json'];
const DESK_AGENT_DEFAULTS = {
  ...CORE_DESK_AGENT_DEFAULTS,
  [QA_LEAD_DESK_ID]: CORE_DESK_AGENT_DEFAULTS[QA_LEAD_DESK_ID] || [QA_LEAD_DESK_ID],
};
const TEAM_BOARD_DESK_TO_STUDIO_DESK = {
  Planner: 'planner',
  Builder: 'executor',
  CTO: 'cto-architect',
};
const EXECUTIVE_ENVELOPE_VERSION = 'ace/studio-envelope.v1';
const EXECUTIVE_EXPORT_DIR = path.join(ROOT, 'data', 'spatial', 'exports');
const LEARNING_LEDGER_ROOT = path.join(ROOT, 'data', 'spatial', 'learning-ledger');
const AGENTS_DIR = path.join(ROOT, AGENTS_ROOT);
const DEFAULT_CONTEXT_MANAGER_MODEL = 'mistral:latest';
const DEFAULT_CONTEXT_MANAGER_BACKEND = 'ollama';
const DEFAULT_SCAFFOLD_INTERPRETER_MODEL = DEFAULT_CONTEXT_MANAGER_MODEL;
const DEFAULT_SCAFFOLD_INTERPRETER_BACKEND = DEFAULT_CONTEXT_MANAGER_BACKEND;
const DEFAULT_SCAFFOLD_INTERPRETER_TIMEOUT_MS = 12000;
const WORLD_SCAFFOLD_MODEL_CONTRACT = 'world_scaffold_candidate.v0';
const WORLD_EDIT_ACTION_PATTERN = /\b(add|paint|replace|set|turn|update)\b/i;
const WORLD_EDIT_TARGET_PATTERN = /\b(grid|scaffold)\b/i;
const WORLD_EDIT_TILE_NOUN_PATTERN = /\b(tile|tiles|cell|cells)\b/i;
const WORLD_EDIT_MATERIAL_PATTERN = /\b(water|grass|stone|dirt)\b/i;
const CTO_DIAGNOSTICS_VERSION = 'ace/cto-diagnostics.v1';
const CTO_DIAGNOSTIC_HISTORY_LIMIT = 60;
const CTO_BAKEOFF_DEFAULT_TEXT = 'We need a planner for this. Can you handle it?';
const CTO_BAKEOFF_MODEL_PREFERENCE = Object.freeze([
  'mixtral:latest',
  'mistral:latest',
  'qwen2.5-coder:1.5b',
  'llama3:latest',
  'codellama:latest',
  'openchat:latest',
  'gemma3:4b',
]);
const CTO_GOVERNANCE_RESPONSE_KIND_VALUES = Object.freeze(['advisory', 'actionable', 'blocked']);
const CTO_GOVERNANCE_RESPONSE_CONTRACT = Object.freeze({
  type: 'object',
  required: ['reply_text', 'response_kind'],
  optional: ['delegation', 'action'],
  response_kind: CTO_GOVERNANCE_RESPONSE_KIND_VALUES,
  delegation: {
    type: ['object', 'null'],
    required: ['desk_id', 'desk_label', 'why'],
  },
  action: {
    type: ['object', 'null'],
    required: ['id'],
  },
});

function getDefaultCtoGovernanceBackend() {
  return String(process.env.ACE_CTO_BACKEND || DEFAULT_CONTEXT_MANAGER_BACKEND).trim() || DEFAULT_CONTEXT_MANAGER_BACKEND;
}

function getDefaultCtoGovernanceModel() {
  return String(process.env.ACE_CTO_MODEL || DEFAULT_CONTEXT_MANAGER_MODEL).trim() || DEFAULT_CONTEXT_MANAGER_MODEL;
}

function getDefaultCtoGovernanceHost() {
  return String(process.env.ACE_CTO_OLLAMA_HOST || DEFAULT_OLLAMA_HOST).trim() || DEFAULT_OLLAMA_HOST;
}

function getDefaultCtoGovernanceTimeoutMs() {
  const configured = Number(process.env.ACE_CTO_TIMEOUT_MS);
  return configured > 0 ? configured : DEFAULT_OLLAMA_TIMEOUT_MS;
}

function resolveCtoGovernanceConfig(overrides = {}) {
  const defaultBackend = getDefaultCtoGovernanceBackend();
  const defaultModel = getDefaultCtoGovernanceModel();
  const defaultHost = getDefaultCtoGovernanceHost();
  const defaultTimeoutMs = getDefaultCtoGovernanceTimeoutMs();
  return {
    backend: String(overrides.backend || defaultBackend).trim() || defaultBackend,
    model: String(overrides.model || defaultModel).trim() || defaultModel,
    host: String(overrides.host || defaultHost).trim() || defaultHost,
    timeoutMs: Number(overrides.timeoutMs) > 0 ? Number(overrides.timeoutMs) : defaultTimeoutMs,
  };
}
const SPATIAL_MUTATION_ALLOWED_TYPES = new Set(['create_node', 'modify_node', 'create_edge']);
const SPATIAL_MUTATION_SAFE_MODIFY_KEYS = new Set(['content', 'position', 'metadata']);
const SPATIAL_MUTATION_ACTIVITY_LIMIT = 32;
const SPATIAL_MUTATION_APPROVAL_LIMIT = 16;
const TA_COVERAGE_REQUIREMENTS = [
  { deskId: 'context-manager', label: 'Context Manager', minimum: 1, role: 'Feedback Liaison' },
  { deskId: 'planner', label: 'Planner', minimum: 1, role: 'Delivery Analyst' },
  { deskId: 'executor', label: 'Executor', minimum: 1, role: 'Integration Auditor' },
  { deskId: 'memory-archivist', label: 'Memory Archivist', minimum: 1, role: 'Contract Steward' },
  { deskId: 'cto-architect', label: 'CTO Architect', minimum: 1, role: 'Runtime Cartographer' },
];

let staffingRulesModulePromise = null;
let spatialBootHealthSnapshot = null;

function loadStaffingRulesModule() {
  if (!staffingRulesModulePromise) {
    const staffingRulesPath = path.join(ROOT, 'ui', 'public', 'spatial', 'staffingRules.js');
    staffingRulesModulePromise = import(pathToFileURL(staffingRulesPath).href);
  }
  return staffingRulesModulePromise;
}


function ensureSpatialStorage() {
  const dir = path.dirname(SPATIAL_WORKSPACE_FILE);
  fs.mkdirSync(dir, { recursive: true });
  ensureQAStorage(ROOT);
  if (!fs.existsSync(SPATIAL_WORKSPACE_FILE)) {
    writeJson(SPATIAL_WORKSPACE_FILE, defaultSpatialWorkspace());
  }
  if (!fs.existsSync(SPATIAL_PAGES_FILE)) writeJson(SPATIAL_PAGES_FILE, { pages: [], activePageId: null });
  if (!fs.existsSync(SPATIAL_INTENT_STATE_FILE)) writeJson(SPATIAL_INTENT_STATE_FILE, { intentState: { currentIntentId: null, summary: '', status: 'idle' } });
  if (!fs.existsSync(SPATIAL_STUDIO_STATE_FILE)) {
    writeJson(SPATIAL_STUDIO_STATE_FILE, normalizeStoredStudioState({
      handoffs: { contextToPlanner: null, history: [] },
      teamBoard: { selectedCardId: null },
    }));
  }
  if (!fs.existsSync(SPATIAL_ARCHITECTURE_MEMORY_FILE)) writeJson(SPATIAL_ARCHITECTURE_MEMORY_FILE, { architectureMemory: {} });
  if (!fs.existsSync(TA_DEPARTMENT_FILE)) writeJson(TA_DEPARTMENT_FILE, { hiredCandidates: [], updatedAt: null, lastGeneratedGap: null });
  if (!fs.existsSync(SPATIAL_HISTORY_FILE)) fs.writeFileSync(SPATIAL_HISTORY_FILE, '[]\n');
  if (!fs.existsSync(CTO_DIAGNOSTICS_FILE)) writeJson(CTO_DIAGNOSTICS_FILE, { version: CTO_DIAGNOSTICS_VERSION, updated_at: null, entries: [] });
  const workspace = normalizeSpatialWorkspaceShape(readJsonSafe(SPATIAL_WORKSPACE_FILE, defaultSpatialWorkspace()) || defaultSpatialWorkspace());
  const sliceSnapshot = readSliceStore(ROOT, DOMAIN_KEY);
  if (!sliceSnapshot.exists) {
    persistCanonicalSlices(buildSliceStoreFromCards(normalizeTeamBoardState(workspace).cards));
  }
}

function writeJson(file, payload) {
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function appendArchitectureHistory(entry) {
  const history = readJsonSafe(SPATIAL_HISTORY_FILE, []) || [];
  history.push(entry);
  writeJson(SPATIAL_HISTORY_FILE, history.slice(-80));
}

function ctoDiagnosticsFilePath(rootPath = ROOT) {
  return path.join(rootPath || ROOT, 'data', 'spatial', 'cto-diagnostics.json');
}

function normalizeCtoDiagnosticsEntry(entry = {}) {
  return {
    id: String(entry.id || `cto_diag_${Date.now()}`).trim() || `cto_diag_${Date.now()}`,
    timestamp: String(entry.timestamp || nowIso()).trim() || nowIso(),
    route: String(entry.route || '/api/spatial/cto/chat').trim() || '/api/spatial/cto/chat',
    source: String(entry.source || 'cto-chat').trim() || 'cto-chat',
    category: String(entry.category || 'unknown').trim() || 'unknown',
    status: String(entry.status || 'degraded').trim() || 'degraded',
    backend: String(entry.backend || '').trim() || null,
    model: String(entry.model || '').trim() || null,
    host: String(entry.host || '').trim() || null,
    reason: String(entry.reason || '').trim() || null,
    failureKind: String(entry.failureKind || '').trim() || null,
    runId: String(entry.runId || '').trim() || null,
    httpStatus: Number.isFinite(Number(entry.httpStatus)) ? Number(entry.httpStatus) : null,
    actionId: String(entry.actionId || '').trim() || null,
    availableActionIds: Array.isArray(entry.availableActionIds)
      ? entry.availableActionIds.map((value) => String(value || '').trim()).filter(Boolean).slice(0, 12)
      : [],
  };
}

function readCtoDiagnostics(rootPath = ROOT) {
  const filePath = ctoDiagnosticsFilePath(rootPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) {
    writeJson(filePath, { version: CTO_DIAGNOSTICS_VERSION, updated_at: null, entries: [] });
  }
  const payload = readJsonSafe(filePath, null);
  const entries = Array.isArray(payload?.entries)
    ? payload.entries.map((entry) => normalizeCtoDiagnosticsEntry(entry)).filter(Boolean)
    : [];
  return {
    version: String(payload?.version || CTO_DIAGNOSTICS_VERSION).trim() || CTO_DIAGNOSTICS_VERSION,
    updated_at: payload?.updated_at || null,
    entries,
  };
}

function summarizeCtoDiagnostics(entries = []) {
  const counts = {};
  entries.forEach((entry) => {
    const key = String(entry?.category || 'unknown').trim() || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

function classifyCtoDiagnosticCategory({ status = '', reason = '', failureKind = '' } = {}) {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  const normalizedReason = String(reason || '').trim().toLowerCase();
  const normalizedFailureKind = String(failureKind || '').trim().toLowerCase();
  if (normalizedFailureKind === 'contract') return 'contract_invalid';
  if (normalizedFailureKind === 'parse') {
    if (normalizedReason.includes('prose instead of strict json')) return 'non_json_output';
    if (normalizedReason.includes('not valid json')) return 'malformed_json';
  }
  if (normalizedReason.includes('timed out')) return 'timeout';
  if (
    normalizedStatus === 'offline'
    || normalizedReason.includes('fetch failed')
    || normalizedReason.includes('econnrefused')
    || normalizedReason.includes('connection refused')
    || normalizedReason.includes('unavailable')
    || normalizedReason.includes('unsupported cto backend')
    || normalizedReason.includes('no fetch implementation')
  ) {
    return 'backend_unreachable';
  }
  return 'unknown';
}

function recordCtoDiagnostic(entry = {}, rootPath = ROOT) {
  const filePath = ctoDiagnosticsFilePath(rootPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const current = readCtoDiagnostics(rootPath);
  const normalized = normalizeCtoDiagnosticsEntry({
    ...entry,
    category: entry.category || classifyCtoDiagnosticCategory(entry),
  });
  const next = {
    version: CTO_DIAGNOSTICS_VERSION,
    updated_at: nowIso(),
    entries: [normalized, ...current.entries].slice(0, CTO_DIAGNOSTIC_HISTORY_LIMIT),
  };
  writeJson(filePath, next);
  return normalized;
}

async function listLocalOllamaModels({
  host = null,
  timeoutMs = null,
  fetchImpl = globalThis.fetch,
} = {}) {
  const resolvedConfig = resolveCtoGovernanceConfig({ host, timeoutMs });
  if (typeof fetchImpl !== 'function') {
    throw new Error('No fetch implementation is available for Ollama model discovery.');
  }
  const { controller, timeout } = createTimeoutController(resolvedConfig.timeoutMs);
  try {
    const response = await fetchImpl(`${resolvedConfig.host.replace(/\/+$/, '')}/api/tags`, {
      method: 'GET',
      signal: controller?.signal,
    });
    if (!response.ok) {
      throw new Error(`Ollama tags returned HTTP ${response.status}`);
    }
    const payload = await response.json();
    return Array.isArray(payload?.models)
      ? payload.models.map((entry) => String(entry?.name || '').trim()).filter(Boolean)
      : [];
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Ollama model discovery timed out after ${resolvedConfig.timeoutMs}ms.`);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function tryParseCtoRawJson(text = '') {
  const raw = String(text || '').trim();
  if (!raw.startsWith('{')) {
    return { ok: false, reason: 'Output does not start with a raw JSON object.' };
  }
  try {
    return { ok: true, payload: JSON.parse(raw), reason: null };
  } catch (error) {
    return { ok: false, reason: `Raw JSON parse failed: ${error.message}` };
  }
}

function tryParseCtoFencedJson(text = '') {
  const raw = String(text || '').trim();
  const fencedMatch = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (!fencedMatch) {
    return { ok: false, reason: 'Output is not a standalone fenced JSON block.' };
  }
  try {
    return { ok: true, payload: JSON.parse(String(fencedMatch[1] || '').trim()), reason: null };
  } catch (error) {
    return { ok: false, reason: `Fenced JSON parse failed: ${error.message}` };
  }
}

function scoreCtoBakeOffEntry(entry = {}) {
  if (!entry.reachable) return 0;
  let score = 1;
  if (entry.rawJsonParse?.ok) score += 3;
  if (entry.fencedJsonParse?.ok) score += 2;
  if (entry.contractValidation?.ok) score += 5;
  return score;
}

function summarizeCtoBakeOffResult(results = []) {
  const sorted = [...results].sort((left, right) => {
    const scoreDelta = scoreCtoBakeOffEntry(right) - scoreCtoBakeOffEntry(left);
    if (scoreDelta !== 0) return scoreDelta;
    const contractDelta = Number(Boolean(right.contractValidation?.ok)) - Number(Boolean(left.contractValidation?.ok));
    if (contractDelta !== 0) return contractDelta;
    const rawDelta = Number(Boolean(right.rawJsonParse?.ok)) - Number(Boolean(left.rawJsonParse?.ok));
    if (rawDelta !== 0) return rawDelta;
    return String(left.model || '').localeCompare(String(right.model || ''));
  });
  const best = sorted[0] || null;
  return {
    recommendedModel: best?.contractValidation?.ok ? best.model : null,
    recommendationBasis: best
      ? (best.contractValidation?.ok
        ? `Highest CTO structured-output score (${scoreCtoBakeOffEntry(best)}) with contract-valid output.`
        : 'No tested model produced contract-valid CTO output.')
      : 'No models were tested.',
    testedModels: results.length,
    contractValidCount: results.filter((entry) => entry.contractValidation?.ok).length,
  };
}

const SPATIAL_GRAPH_LAYERS = ['system', 'world'];

function cloneJsonValue(value, fallback) {
  if (value === undefined) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const STRONG_RELATIONSHIP_TYPES = new Set([
  'dependency',
  'handoff',
  'ownership',
  'pipeline',
  'data_flow',
  'reporting',
  'workflow',
  'support',
  'validated',
]);

function normalizeRelationshipType(value = 'relates_to') {
  return String(value || 'relates_to').trim().toLowerCase().replace(/\s+/g, '_') || 'relates_to';
}

function normalizeRelationshipList(value = []) {
  const source = Array.isArray(value) ? value : (value == null ? [] : [value]);
  return [...new Set(source.map((entry) => String(entry || '').trim()).filter(Boolean))];
}

function clampRelationshipStrength(value = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 1;
  return Math.max(1, Math.min(4, Math.round(numeric)));
}

function inferRelationshipStrength(edge = {}, supports = [], validatedBy = []) {
  const explicit = Number(edge?.strength);
  if (Number.isFinite(explicit) && explicit > 0) {
    return clampRelationshipStrength(explicit);
  }
  let score = 1;
  if (STRONG_RELATIONSHIP_TYPES.has(normalizeRelationshipType(edge?.relationshipType || edge?.relationship_type || edge?.type))) score += 1;
  score += Math.min(2, supports.length);
  if (validatedBy.length) score += 1;
  if (edge?.lastActive) score += 1;
  return clampRelationshipStrength(score);
}

function inferRelationshipStrandCount(edge = {}, supports = [], validatedBy = []) {
  const explicit = Number(edge?.strandCount);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.max(1, Math.round(explicit));
  }
  return Math.max(1, supports.length, validatedBy.length);
}

function inferRelationshipHealth(edge = {}, strength = 1, strandCount = 1) {
  const risk = String(edge?.risk || '').trim().toLowerCase();
  if (risk === 'high' || risk === 'blocked') return 'blocked';
  if (strength >= 3 && strandCount >= 2) return 'healthy';
  if (strength >= 2) return 'degraded';
  return 'fragile';
}

function inferRelationshipVisualForm(strength = 1, strandCount = 1) {
  if (strandCount >= 3 || strength >= 4) return 'woven-rope';
  if (strandCount === 2 || strength >= 2) return 'bundle';
  return 'string';
}

function normalizeRelationshipEdge(edge = {}, { fallbackRelationshipType = 'relates_to' } = {}) {
  if (!edge || typeof edge !== 'object') return null;
  const source = String(edge.source || '').trim();
  const target = String(edge.target || '').trim();
  if (!source || !target) return null;
  const relationshipType = normalizeRelationshipType(edge.relationshipType || edge.relationship_type || edge.type || fallbackRelationshipType);
  const supports = normalizeRelationshipList(edge.supports);
  const validatedBy = normalizeRelationshipList(edge.validatedBy);
  const strength = inferRelationshipStrength({ ...edge, relationshipType }, supports, validatedBy);
  const strandCount = inferRelationshipStrandCount(edge, supports, validatedBy);
  const health = inferRelationshipHealth(edge, strength, strandCount);
  const visualForm = inferRelationshipVisualForm(strength, strandCount);
  return {
    ...edge,
    id: String(edge.id || '').trim() || `${source}__${target}__${relationshipType}`,
    source,
    target,
    relationshipType,
    relationship_type: relationshipType,
    label: String(edge.label || '').trim() || relationshipType.replace(/_/g, ' '),
    supports,
    validatedBy,
    strength,
    strandCount,
    health,
    visualForm,
    lastActive: edge.lastActive || null,
    risk: edge.risk || null,
  };
}

function mergeRelationshipEdge(existing = {}, incoming = {}) {
  const supports = normalizeRelationshipList([...(existing.supports || []), ...(incoming.supports || [])]);
  const validatedBy = normalizeRelationshipList([...(existing.validatedBy || []), ...(incoming.validatedBy || [])]);
  const relationshipType = existing.relationshipType && existing.relationshipType !== 'relates_to'
    ? existing.relationshipType
    : (incoming.relationshipType || incoming.relationship_type || 'relates_to');
  return normalizeRelationshipEdge({
    ...existing,
    ...incoming,
    relationshipType,
    relationship_type: relationshipType,
    supports,
    validatedBy,
    lastActive: incoming.lastActive || existing.lastActive || null,
    risk: incoming.risk || existing.risk || null,
  });
}

function cloneSpatialGraph(graph = {}) {
  return {
    nodes: cloneJsonValue(graph.nodes, []),
    edges: (Array.isArray(graph.edges) ? graph.edges : []).map((edge) => normalizeRelationshipEdge(edge)).filter(Boolean),
  };
}

function findSpatialNodeLayer(graphs = {}, nodeId = '') {
  const targetId = String(nodeId || '').trim();
  if (!targetId) return null;
  return SPATIAL_GRAPH_LAYERS.find((layer) => Array.isArray(graphs?.[layer]?.nodes) && graphs[layer].nodes.some((node) => node?.id === targetId)) || null;
}

function resolveSpatialMutationLayer(graphs = {}, mutation = {}) {
  const requestedLayer = String(mutation?.layer || mutation?.graphLayer || mutation?.node?.metadata?.graphLayer || mutation?.patch?.metadata?.graphLayer || '').trim().toLowerCase();
  if (SPATIAL_GRAPH_LAYERS.includes(requestedLayer)) return requestedLayer;
  if (mutation?.type === 'modify_node') {
    return findSpatialNodeLayer(graphs, mutation.id) || 'system';
  }
  if (mutation?.type === 'create_edge') {
    return findSpatialNodeLayer(graphs, mutation?.edge?.source) || findSpatialNodeLayer(graphs, mutation?.edge?.target) || 'system';
  }
  return 'system';
}

function findSpatialNodeRecord(graphs = {}, nodeId = '') {
  const layer = findSpatialNodeLayer(graphs, nodeId);
  if (!layer) return null;
  const node = (graphs?.[layer]?.nodes || []).find((entry) => entry?.id === nodeId) || null;
  return node ? { layer, node } : null;
}

function normalizeSpatialNodePayload(node = {}, layer = 'system') {
  const metadata = isPlainObject(node?.metadata) ? cloneJsonValue(node.metadata, {}) : {};
  return {
    ...cloneJsonValue(node, {}),
    metadata: {
      ...metadata,
      graphLayer: layer,
    },
  };
}

function isProtectedSpatialNode(node = {}) {
  const metadata = isPlainObject(node?.metadata) ? node.metadata : {};
  return Boolean(
    String(metadata.agentId || '').trim()
    || metadata.protected
    || metadata.canonical
    || metadata.managerTruth
  );
}

function describeSpatialMutation(mutation = {}) {
  const type = String(mutation?.type || '').trim().toLowerCase();
  if (type === 'create_node') {
    const node = mutation?.node || {};
    return `Create ${(node.type || 'node')} ${String(node.id || node.content || 'pending').trim() || 'pending'}`;
  }
  if (type === 'modify_node') {
    return `Modify node ${String(mutation?.id || 'unknown').trim() || 'unknown'}`;
  }
  if (type === 'create_edge') {
    const edge = mutation?.edge || {};
    return `Create edge ${String(edge.source || '?').trim() || '?'} -> ${String(edge.target || '?').trim() || '?'}`;
  }
  return `Mutation ${type || 'unknown'}`;
}

function buildSpatialMutationDecision({
  classification = 'blocked',
  mutation = null,
  reason = '',
  code = '',
  riskLevel = 'low',
  layer = null,
} = {}) {
  return {
    classification,
    mutation: cloneJsonValue(mutation, null),
    reason: String(reason || '').trim(),
    code: String(code || '').trim() || null,
    riskLevel,
    layer,
    summary: describeSpatialMutation(mutation || {}),
  };
}

function buildMutationGateEntry(decision = {}, status = 'blocked') {
  return {
    id: `mutation_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    at: nowIso(),
    classification: decision.classification || 'blocked',
    status,
    riskLevel: decision.riskLevel || 'medium',
    summary: decision.summary || describeSpatialMutation(decision.mutation || {}),
    reason: decision.reason || '',
    layer: decision.layer || null,
    mutationType: decision.mutation?.type || null,
    mutation: cloneJsonValue(decision.mutation, null),
  };
}

function isSafeWorldScaffoldMetadataPatch(targetNode = {}, metadataPatch = {}) {
  if (!isPlainObject(metadataPatch)) {
    return { ok: false, reason: 'modify_node metadata patch must be an object.', code: 'invalid-metadata' };
  }
  if (!isWorldScaffold(targetNode?.metadata?.scaffold) && !isWorldScaffold(metadataPatch?.scaffold)) {
    return { ok: false, reason: 'Modify patch touches non-local fields and requires approval.', code: 'broad-modify' };
  }
  if (Object.keys(metadataPatch).some((key) => !WORLD_SCAFFOLD_METADATA_KEYS.has(key))) {
    return { ok: false, reason: 'World scaffold metadata patch contains unsupported keys.', code: 'invalid-scaffold-metadata' };
  }
  if (metadataPatch.graphLayer !== undefined && String(metadataPatch.graphLayer || '').trim() !== 'world') {
    return { ok: false, reason: 'World scaffold metadata must stay on the world graph.', code: 'invalid-scaffold-layer' };
  }
  if (metadataPatch.scaffold !== undefined && !isWorldScaffold(metadataPatch.scaffold)) {
    return { ok: false, reason: 'World scaffold metadata patch is malformed.', code: 'invalid-scaffold' };
  }
  const mergedMetadata = {
    ...(isPlainObject(targetNode?.metadata) ? targetNode.metadata : {}),
    ...metadataPatch,
  };
  if (mergedMetadata.agentId || mergedMetadata.protected || mergedMetadata.canonical || mergedMetadata.managerTruth) {
    return { ok: false, reason: 'World scaffold metadata cannot declare protected system markers.', code: 'protected-scaffold' };
  }
  return { ok: true };
}

function classifySpatialMutation(graphs = {}, mutation = {}) {
  const type = String(mutation?.type || '').trim().toLowerCase();
  const block = (reason, code, nextMutation = mutation, layer = null) => buildSpatialMutationDecision({
    classification: 'blocked',
    mutation: nextMutation,
    reason,
    code,
    riskLevel: 'high',
    layer,
  });
  const review = (reason, code, nextMutation = mutation, layer = null, riskLevel = 'medium') => buildSpatialMutationDecision({
    classification: 'needs_approval',
    mutation: nextMutation,
    reason,
    code,
    riskLevel,
    layer,
  });
  const safe = (nextMutation = mutation, layer = null) => buildSpatialMutationDecision({
    classification: 'safe',
    mutation: nextMutation,
    riskLevel: 'low',
    layer,
  });

  if (!type) {
    return block('Mutation type is required.', 'missing-type');
  }
  if (!SPATIAL_MUTATION_ALLOWED_TYPES.has(type)) {
    return block(`Mutation type "${type}" is not supported in Auto Mutation Gate v1.`, 'unsupported-type');
  }

  if (type === 'create_node') {
    const layer = resolveSpatialMutationLayer(graphs, mutation);
    const rawNode = cloneJsonValue(mutation?.node, null);
    if (!isPlainObject(rawNode)) {
      return block('create_node requires a node payload.', 'missing-node', mutation, layer);
    }
    const nodeId = String(rawNode.id || '').trim();
    if (!nodeId) {
      return block('create_node requires node.id.', 'missing-node-id', mutation, layer);
    }
    const normalizedMutation = {
      ...cloneJsonValue(mutation, {}),
      type: 'create_node',
      node: normalizeSpatialNodePayload(rawNode, layer),
      layer,
    };
    const existingRecord = findSpatialNodeRecord(graphs, nodeId);
    if (existingRecord) {
      if (JSON.stringify(existingRecord.node) === JSON.stringify(normalizedMutation.node)) {
        return safe(normalizedMutation, existingRecord.layer);
      }
      return block(`Cannot create node "${nodeId}" because it already exists with different content.`, 'node-conflict', normalizedMutation, existingRecord.layer);
    }
    if (isProtectedSpatialNode(normalizedMutation.node)) {
      return review('New node declares protected or canonical metadata and requires approval.', 'protected-create', normalizedMutation, layer, 'high');
    }
    return safe(normalizedMutation, layer);
  }

  if (type === 'modify_node') {
    const nodeId = String(mutation?.id || '').trim();
    if (!nodeId) {
      return block('modify_node requires id.', 'missing-node-id');
    }
    const targetRecord = findSpatialNodeRecord(graphs, nodeId);
    if (!targetRecord) {
      return block(`Cannot modify missing node "${nodeId}".`, 'node-not-found');
    }
    const patch = cloneJsonValue(mutation?.patch, null);
    if (!isPlainObject(patch) || !Object.keys(patch).length) {
      return block('modify_node requires a non-empty patch.', 'missing-patch', mutation, targetRecord.layer);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'id') || Object.prototype.hasOwnProperty.call(patch, 'connections')) {
      return block('modify_node cannot change node identity or connections in Auto Mutation Gate v1.', 'unsafe-modify', mutation, targetRecord.layer);
    }
    if (patch.content !== undefined && typeof patch.content !== 'string') {
      return block('modify_node content patch must be a string.', 'invalid-content', mutation, targetRecord.layer);
    }
    if (patch.position !== undefined) {
      if (!isPlainObject(patch.position)) {
        return block('modify_node position patch must be an object.', 'invalid-position', mutation, targetRecord.layer);
      }
      if (!Number.isFinite(Number(patch.position.x)) || !Number.isFinite(Number(patch.position.y))) {
        return block('modify_node position patch must include numeric x and y values.', 'invalid-position', mutation, targetRecord.layer);
      }
    }
    if (patch.metadata !== undefined) {
      const scaffoldMetadataCheck = isSafeWorldScaffoldMetadataPatch(targetRecord.node, patch.metadata);
      if (!scaffoldMetadataCheck.ok) {
        const usesScaffoldMetadata = Boolean(isWorldScaffold(targetRecord.node?.metadata?.scaffold) || isWorldScaffold(patch.metadata?.scaffold));
        if (usesScaffoldMetadata && scaffoldMetadataCheck.code !== 'broad-modify') {
          return block(scaffoldMetadataCheck.reason, scaffoldMetadataCheck.code, mutation, targetRecord.layer);
        }
        return review(scaffoldMetadataCheck.reason, scaffoldMetadataCheck.code, mutation, targetRecord.layer, 'high');
      }
    }
    const normalizedMutation = {
      ...cloneJsonValue(mutation, {}),
      type: 'modify_node',
      id: nodeId,
      patch,
      layer: targetRecord.layer,
    };
    if (isProtectedSpatialNode(targetRecord.node)) {
      return review('Target node is protected and requires approval before modification.', 'protected-modify', normalizedMutation, targetRecord.layer, 'high');
    }
    if (Object.keys(patch).some((key) => !SPATIAL_MUTATION_SAFE_MODIFY_KEYS.has(key))) {
      return review('Modify patch touches non-local fields and requires approval.', 'broad-modify', normalizedMutation, targetRecord.layer, 'high');
    }
    return safe(normalizedMutation, targetRecord.layer);
  }

  if (type === 'create_edge') {
    const rawEdge = cloneJsonValue(mutation?.edge, null);
    if (!isPlainObject(rawEdge)) {
      return block('create_edge requires an edge payload.', 'missing-edge');
    }
    const source = String(rawEdge.source || '').trim();
    const target = String(rawEdge.target || '').trim();
    if (!source || !target) {
      return block('create_edge requires source and target.', 'missing-edge-endpoints');
    }
    if (source === target) {
      return block('Self-referential edges are blocked by mutation invariants.', 'self-edge');
    }
    const sourceRecord = findSpatialNodeRecord(graphs, source);
    const targetRecord = findSpatialNodeRecord(graphs, target);
    if (!sourceRecord || !targetRecord) {
      return block(`Cannot create edge "${source}" -> "${target}" without both endpoint nodes.`, 'edge-node-missing');
    }
    if (sourceRecord.layer !== targetRecord.layer) {
      return block('Cross-layer edges are blocked by mutation invariants in Auto Mutation Gate v1.', 'cross-layer-edge', mutation, sourceRecord.layer);
    }
    const normalizedMutation = {
      ...cloneJsonValue(mutation, {}),
      type: 'create_edge',
      edge: {
        ...rawEdge,
        source,
        target,
      },
      layer: sourceRecord.layer,
    };
    if (isProtectedSpatialNode(sourceRecord.node) || isProtectedSpatialNode(targetRecord.node)) {
      return review('Edge touches a protected node and requires approval.', 'protected-edge', normalizedMutation, sourceRecord.layer, 'high');
    }
    return safe(normalizedMutation, sourceRecord.layer);
  }

  return block(`Mutation type "${type}" is not supported in Auto Mutation Gate v1.`, 'unsupported-type');
}

function applySingleSpatialMutation(graph = {}, mutation = {}) {
  const type = String(mutation?.type || '').trim().toLowerCase();
  if (!type) {
    const error = new Error('Mutation type is required.');
    error.code = 'missing-type';
    throw error;
  }

  if (type === 'create_node') {
    const node = cloneJsonValue(mutation.node, null);
    if (!node || typeof node !== 'object') {
      const error = new Error('create_node requires a node payload.');
      error.code = 'missing-node';
      throw error;
    }
    const nodeId = String(node.id || '').trim();
    if (!nodeId) {
      const error = new Error('create_node requires node.id.');
      error.code = 'missing-node-id';
      throw error;
    }
    const existingNode = graph.nodes.find((entry) => entry?.id === nodeId);
    if (existingNode) {
      if (JSON.stringify(existingNode) === JSON.stringify(node)) {
        return { changed: false, appliedCount: 0, reason: 'node-already-exists' };
      }
      const error = new Error(`Cannot create node "${nodeId}" because it already exists with different content.`);
      error.code = 'node-conflict';
      throw error;
    }
    graph.nodes.push(node);
    return { changed: true, appliedCount: 1, reason: '' };
  }

  if (type === 'modify_node') {
    const nodeId = String(mutation.id || '').trim();
    if (!nodeId) {
      const error = new Error('modify_node requires id.');
      error.code = 'missing-node-id';
      throw error;
    }
    const node = graph.nodes.find((entry) => entry?.id === nodeId);
    if (!node) {
      const error = new Error(`Cannot modify missing node "${nodeId}".`);
      error.code = 'node-not-found';
      throw error;
    }
    const patch = cloneJsonValue(mutation.patch, {});
    const normalizedPatch = isPlainObject(patch?.metadata)
      ? {
          ...patch,
          metadata: {
            ...(isPlainObject(node.metadata) ? node.metadata : {}),
            ...patch.metadata,
          },
        }
      : patch;
    const before = JSON.stringify(node);
    Object.assign(node, normalizedPatch);
    return {
      changed: JSON.stringify(node) !== before,
      appliedCount: JSON.stringify(node) !== before ? 1 : 0,
      reason: JSON.stringify(node) !== before ? '' : 'node-unchanged',
    };
  }

  if (type === 'create_edge') {
    const edge = cloneJsonValue(mutation.edge, null);
    if (!edge || typeof edge !== 'object') {
      const error = new Error('create_edge requires an edge payload.');
      error.code = 'missing-edge';
      throw error;
    }
    const source = String(edge.source || '').trim();
    const target = String(edge.target || '').trim();
    if (!source || !target) {
      const error = new Error('create_edge requires source and target.');
      error.code = 'missing-edge-endpoints';
      throw error;
    }
    if (!graph.nodes.some((node) => node?.id === source) || !graph.nodes.some((node) => node?.id === target)) {
      const error = new Error(`Cannot create edge "${source}" -> "${target}" without both endpoint nodes.`);
      error.code = 'edge-node-missing';
      throw error;
    }
    if (source === target) {
      return { changed: false, appliedCount: 0, reason: 'self-edge-skipped' };
    }
    const normalizedEdge = normalizeRelationshipEdge(edge, { fallbackRelationshipType: edge.relationshipType || edge.relationship_type || 'relates_to' });
    const existingIndex = graph.edges.findIndex((entry) => entry?.source === source && entry?.target === target);
    if (existingIndex >= 0) {
      const mergedEdge = mergeRelationshipEdge(graph.edges[existingIndex], normalizedEdge);
      const before = JSON.stringify(graph.edges[existingIndex]);
      graph.edges[existingIndex] = mergedEdge;
      const changed = JSON.stringify(mergedEdge) !== before;
      return { changed, appliedCount: changed ? 1 : 0, reason: changed ? '' : 'edge-unchanged' };
    }
    graph.edges.push(normalizedEdge);
    return { changed: true, appliedCount: 1, reason: '' };
  }

  const error = new Error(`Unsupported mutation type "${type}".`);
  error.code = 'unsupported-type';
  throw error;
}

function applySpatialMutationsToWorkspace(workspace = {}, mutations = []) {
  const normalizedWorkspace = normalizeSpatialWorkspaceShape(workspace);
  const requestedMutations = Array.isArray(mutations) ? mutations : [];
  const graphs = normalizeGraphBundle(normalizedWorkspace);
  const nextGraphs = {
    system: cloneSpatialGraph(graphs.system),
    world: cloneSpatialGraph(graphs.world),
  };
  const requested = requestedMutations.length;

  if (!requested) {
    return {
      ok: true,
      status: 'no-op',
      confirmed: false,
      persisted: false,
      requested: 0,
      applied: 0,
      queued: 0,
      blocked: 0,
      changedLayers: [],
      reason: 'No mutations requested.',
      results: [],
      recentWorldChange: null,
      activity: normalizedWorkspace.mutationGate.activity,
      approvalQueue: normalizedWorkspace.mutationGate.approvalQueue,
      workspace: normalizedWorkspace,
    };
  }

  const mutationGate = normalizeMutationGateState(normalizedWorkspace.mutationGate);
  const nextActivity = [...(mutationGate.activity || [])];
  const nextApprovalQueue = [...(mutationGate.approvalQueue || [])];
  const changedLayers = new Set();
  let applied = 0;
  let queued = 0;
  let blocked = 0;
  const results = [];

  requestedMutations.forEach((mutation) => {
    const decision = classifySpatialMutation(nextGraphs, mutation);
    if (decision.classification === 'safe') {
      const layer = decision.layer || resolveSpatialMutationLayer(nextGraphs, decision.mutation || mutation);
      const targetGraph = nextGraphs[layer] || nextGraphs.system;
      const result = applySingleSpatialMutation(targetGraph, decision.mutation || mutation);
      if (result.changed) changedLayers.add(layer);
      applied += Number(result.appliedCount || 0);
      const status = result.changed ? 'auto-applied' : 'no-op';
      nextActivity.unshift(buildMutationGateEntry({
        ...decision,
        reason: result.reason || decision.reason,
      }, status));
      results.push({
        ...decision,
        status,
        reason: result.reason || decision.reason || '',
      });
      return;
    }

    if (decision.classification === 'needs_approval') {
      queued += 1;
      const queueEntry = buildMutationGateEntry(decision, 'pending-approval');
      nextApprovalQueue.unshift(queueEntry);
      nextActivity.unshift(buildMutationGateEntry(decision, 'queued'));
      results.push({
        ...decision,
        status: 'queued',
      });
      return;
    }

    blocked += 1;
    nextActivity.unshift(buildMutationGateEntry(decision, 'blocked'));
    results.push({
      ...decision,
      status: 'blocked',
    });
  });

  const nextWorkspace = normalizeSpatialWorkspaceShape({
    ...normalizedWorkspace,
    graphs: nextGraphs,
    graph: nextGraphs.system,
    mutationGate: {
      ...mutationGate,
      activity: nextActivity.slice(0, SPATIAL_MUTATION_ACTIVITY_LIMIT),
      approvalQueue: nextApprovalQueue.slice(0, SPATIAL_MUTATION_APPROVAL_LIMIT),
    },
  });
  const changed = changedLayers.size > 0;
  const status = (() => {
    if (blocked && !applied && !queued) return 'blocked';
    if (applied && !queued && !blocked) return changed ? 'applied' : 'no-op';
    if (queued && !applied && !blocked) return 'queued';
    if (applied || queued || blocked) return 'mixed';
    return 'no-op';
  })();
  const reason = (() => {
    if (status === 'blocked') {
      return results.find((entry) => entry.status === 'blocked')?.reason || 'All mutations were blocked.';
    }
    if (status === 'queued') {
      return results.find((entry) => entry.status === 'queued')?.reason || 'All mutations require approval.';
    }
    if (status === 'no-op') {
      return results.find((entry) => entry.status === 'no-op')?.reason || 'No canonical graph change detected.';
    }
    return '';
  })();
  const persisted = changed || queued > 0 || blocked > 0 || results.length > 0;
  const recentWorldChange = deriveRecentWorldChange({
    previousGraphs: graphs,
    nextGraphs,
    results,
    status,
    changedLayers: Array.from(changedLayers),
  });

  return {
    ok: status !== 'blocked',
    status,
    confirmed: changed,
    persisted,
    requested,
    applied,
    queued,
    blocked,
    changedLayers: Array.from(changedLayers),
    reason,
    results,
    recentWorldChange,
    activity: nextWorkspace.mutationGate.activity,
    approvalQueue: nextWorkspace.mutationGate.approvalQueue,
    workspace: nextWorkspace,
  };
}

function ensureLearningLedgerDir(agentId) {
  const normalized = normalizeAgentId(agentId || 'dave');
  const dir = path.join(LEARNING_LEDGER_ROOT, normalized);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function learningLedgerFilePath(agentId, entryId) {
  const id = String(entryId || `entry_${Date.now()}`).trim();
  return path.join(ensureLearningLedgerDir(agentId), `${id}.json`);
}

function normalizeLearningLedgerEntry(rawEntry, filePath = null) {
  if (!rawEntry || typeof rawEntry !== 'object') return null;
  const entryId = String(rawEntry.entryId || rawEntry.id || (filePath ? path.basename(filePath, '.json') : '')).trim() || `entry_${Date.now()}`;
  const timestamp = rawEntry.timestamp || rawEntry.createdAt || nowIso();
  return {
    entryId,
    agentId: normalizeAgentId(rawEntry.agentId || 'dave'),
    timestamp,
    taskPrompt: String(rawEntry.taskPrompt || rawEntry.prompt || '').trim(),
    contextRefs: Array.isArray(rawEntry.contextRefs) ? rawEntry.contextRefs.filter(Boolean) : [],
    generatedOutput: String(rawEntry.generatedOutput || rawEntry.output || '').trim(),
    responseStatus: String(rawEntry.responseStatus || rawEntry.status || 'live').trim(),
    qaOutcome: String(rawEntry.qaOutcome || 'unknown').trim(),
    qaReason: String(rawEntry.qaReason || rawEntry.reason || '').trim(),
    approvedFix: rawEntry.approvedFix || null,
    datasetReady: Boolean(rawEntry.datasetReady),
    runId: rawEntry.runId || rawEntry.lastRunId || null,
    backend: rawEntry.backend || null,
    model: rawEntry.model || null,
    tokensUsed: Number(rawEntry.tokensUsed || 0),
    durationMs: Number(rawEntry.durationMs || 0),
    contextAlignmentScore: Number(rawEntry.contextAlignmentScore || 0),
    contextAlignmentReason: rawEntry.contextAlignmentReason || null,
  };
}

function listLearningLedgerEntries(agentId) {
  const dir = ensureLearningLedgerDir(agentId);
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => normalizeLearningLedgerEntry(readJsonSafe(path.join(dir, entry.name), null), path.join(dir, entry.name)))
    .filter(Boolean)
    .sort((left, right) => String(right.timestamp || '').localeCompare(String(left.timestamp || '')));
}

function writeLearningLedgerEntry(agentId, payload = {}) {
  const entryId = payload.entryId || `entry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const filePath = learningLedgerFilePath(agentId, entryId);
  const nextEntry = {
    entryId,
    timestamp: payload.timestamp || nowIso(),
    agentId: normalizeAgentId(agentId),
    ...payload,
  };
  writeJson(filePath, nextEntry);
  return normalizeLearningLedgerEntry(nextEntry, filePath);
}

function updateLearningLedgerEntry(agentId, entryId, patch = {}) {
  const filePath = learningLedgerFilePath(agentId, entryId);
  const current = readJsonSafe(filePath, null);
  if (!current) return null;
  const nextEntry = {
    ...current,
    ...patch,
    entryId,
    timestamp: nowIso(),
  };
  writeJson(filePath, nextEntry);
  return normalizeLearningLedgerEntry(nextEntry, filePath);
}

function computeLearningLedgerStats(entries = []) {
  const attemptCount = entries.length;
  const failedCount = entries.filter((entry) => entry.responseStatus !== 'live').length;
  const approvedFixCount = entries.filter((entry) => entry.approvedFix).length;
  const datasetReadyCount = entries.filter((entry) => entry.datasetReady).length;
  return {
    attemptCount,
    failedCount,
    approvedFixCount,
    datasetReadyCount,
  };
}

function listAgentModelOptions() {
  if (!fs.existsSync(AGENTS_DIR)) return [DEFAULT_CONTEXT_MANAGER_MODEL];
  const models = new Set();
  fs.readdirSync(AGENTS_DIR, { withFileTypes: true }).forEach((entry) => {
    if (!entry.isDirectory()) return;
    const manifest = readJsonSafe(path.join(AGENTS_DIR, entry.name, 'agent.json'), null);
    if (manifest?.model) models.add(String(manifest.model).trim());
  });
  models.add(DEFAULT_CONTEXT_MANAGER_MODEL);
  return Array.from(models).sort();
}

const CTO_DESK_IDS = Object.freeze([
  'context-manager',
  'planner',
  'executor',
  'qa-lead',
  'memory-archivist',
  'cto-architect',
  'integration_auditor',
]);

const CTO_TEXT_CONFIRM_PATTERN = /^(yes|y|go ahead|do it|confirm|proceed|please do|hire(?: one)?|route it|sounds good|ok(?:ay)?)\b/i;

const CTO_DESK_TARGET_HINTS = Object.freeze([
  { deskId: 'context-manager', keywords: ['context manager', 'context lane', 'intake lane', 'intake', 'context'] },
  { deskId: 'planner', keywords: ['planning lane', 'delivery planning lane', 'planner', 'planning'] },
  { deskId: 'executor', keywords: ['executor', 'execution lane', 'delivery lane', 'builder'] },
  { deskId: 'qa-lead', keywords: ['qa lead', 'qa desk', 'test lead', 'quality lane', 'qa'] },
  { deskId: 'memory-archivist', keywords: ['memory archivist', 'archivist', 'archive lane', 'archive'] },
  { deskId: 'cto-architect', keywords: ['cto', 'architect', 'control centre', 'control center'] },
  { deskId: 'integration_auditor', keywords: ['talent acquisition', 'ta', 'integration auditor', 'hiring'] },
]);

function truncatePromptText(value = '', maxLength = 320) {
  const text = String(value || '').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function normalizeCtoChatHistory(history = []) {
  return (Array.isArray(history) ? history : [])
    .map((entry, index) => {
      const role = String(entry?.role || entry?.speaker || '').trim().toLowerCase();
      const text = String(entry?.text || entry?.content || '').trim();
      if (!text) return null;
      return {
        id: String(entry?.id || `history-${index}`),
        role: role === 'assistant' || role === 'cto' || role === 'ace' ? 'assistant' : 'user',
        text,
        action: normalizeCtoActionRecord(entry?.action || null),
      };
    })
    .filter(Boolean)
    .slice(-12);
}

function normalizeCtoActionRecord(action = null) {
  if (!action || typeof action !== 'object') return null;
  const id = String(action.id || '').trim();
  const kind = String(action.kind || '').trim();
  if (!id || !kind) return null;
  return {
    id,
    kind,
    label: String(action.label || '').trim() || id,
    targetDeskId: String(action.targetDeskId || action.deskId || '').trim() || null,
    targetDeskLabel: String(action.targetDeskLabel || action.deskLabel || '').trim() || null,
    available: action.available !== false,
    requiresConfirmation: action.requiresConfirmation !== false,
    status: String(action.status || 'pending').trim() || 'pending',
    reason: String(action.reason || '').trim() || null,
    route: String(action.route || '').trim() || null,
    routeStatus: String(action.routeStatus || '').trim() || null,
    gapDescription: String(action.gapDescription || '').trim() || null,
  };
}

function isAffirmativeCtoReply(text = '') {
  return CTO_TEXT_CONFIRM_PATTERN.test(String(text || '').trim());
}

function findDeskTargetsInText(text = '') {
  const source = String(text || '').toLowerCase();
  if (!source.trim()) return [];
  return CTO_DESK_TARGET_HINTS.filter((entry) => entry.keywords.some((keyword) => source.includes(keyword)))
    .map((entry) => entry.deskId);
}

function createTimeoutController(timeoutMs) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  return { controller, timeout };
}

async function probeCtoBackendStatus({
  backend = null,
  model = null,
  host = null,
  timeoutMs = null,
  fetchImpl = globalThis.fetch,
} = {}) {
  const checkedAt = nowIso();
  const resolvedConfig = resolveCtoGovernanceConfig({ backend, model, host, timeoutMs });
  const normalizedBackend = resolvedConfig.backend;
  const normalizedModel = resolvedConfig.model;
  const normalizedHost = resolvedConfig.host;
  const normalizedTimeout = resolvedConfig.timeoutMs;
  if (normalizedBackend !== 'ollama') {
    return {
      ok: false,
      status: 'offline',
      backend: normalizedBackend,
      model: normalizedModel,
      host: normalizedHost,
      checkedAt,
      reason: `Unsupported CTO backend: ${normalizedBackend}.`,
      availableModels: [],
    };
  }
  if (typeof fetchImpl !== 'function') {
    return {
      ok: false,
      status: 'offline',
      backend: normalizedBackend,
      model: normalizedModel,
      host: normalizedHost,
      checkedAt,
      reason: 'No fetch implementation is available for local backend checks.',
      availableModels: [],
    };
  }
  const { controller, timeout } = createTimeoutController(normalizedTimeout);
  try {
    const response = await fetchImpl(`${normalizedHost.replace(/\/+$/, '')}/api/tags`, {
      method: 'GET',
      signal: controller?.signal,
    });
    if (!response.ok) {
      throw new Error(`Ollama tags returned HTTP ${response.status}`);
    }
    const payload = await response.json();
    const availableModels = Array.isArray(payload?.models)
      ? payload.models.map((entry) => String(entry?.name || '').trim()).filter(Boolean)
      : [];
    const modelAvailable = availableModels.includes(normalizedModel);
    return {
      ok: modelAvailable,
      status: modelAvailable ? 'live' : 'degraded',
      backend: normalizedBackend,
      model: normalizedModel,
      host: normalizedHost,
      checkedAt,
      reason: modelAvailable ? null : `Model "${normalizedModel}" is not currently available on the local backend.`,
      availableModels,
    };
  } catch (error) {
    const reason = error?.name === 'AbortError'
      ? `Ollama status check timed out after ${normalizedTimeout}ms.`
      : String(error.message || error || 'Ollama status check failed.');
    return {
      ok: false,
      status: 'offline',
      backend: normalizedBackend,
      model: normalizedModel,
      host: normalizedHost,
      checkedAt,
      reason,
      availableModels: [],
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function buildCtoDeskRouteSummary(deskId = '') {
  if (deskId === 'qa-lead') {
    return {
      propertiesWritable: false,
      manualRunRoute: false,
      advisoryOnly: true,
      routeNote: 'QA desk properties are read-only. QA evidence is available, but no CTO chat execution route is wired for this desk.',
    };
  }
  if (deskId === 'planner' || deskId === 'executor' || deskId === 'context-manager') {
    return {
      propertiesWritable: false,
      manualRunRoute: true,
      advisoryOnly: true,
      routeNote: `A manual ${deskId} run route exists on the backend, but this CTO panel does not yet create grounded handoff payloads for it.`,
    };
  }
  if (deskId === 'memory-archivist') {
    return {
      propertiesWritable: true,
      manualRunRoute: false,
      advisoryOnly: false,
      routeNote: 'Archivist writeback actions exist, but they are not exposed as chat confirmations in this slice.',
    };
  }
  if (deskId === 'cto-architect') {
    return {
      propertiesWritable: true,
      manualRunRoute: false,
      advisoryOnly: false,
      routeNote: 'CTO property actions are available through the desk panel. Hiring is routed separately through Talent Acquisition.',
    };
  }
  return {
    propertiesWritable: false,
    manualRunRoute: false,
    advisoryOnly: true,
    routeNote: 'No grounded CTO chat action route is wired for this desk yet.',
  };
}

async function buildCtoGovernanceContext(workspace = null) {
  const runtimeWorkspace = normalizeSpatialWorkspaceShape(refreshSpatialOrchestrator({
    workspace: workspace || readSpatialWorkspace(),
  }));
  const taState = normalizeTaDepartmentState(readJsonSafe(TA_DEPARTMENT_FILE, createDefaultTaDepartmentState()) || createDefaultTaDepartmentState());
  const taPayload = await buildTaDepartmentPayload(taState);
  const desks = CTO_DESK_IDS.map((deskId) => {
    const payload = buildDeskPropertiesPayload(runtimeWorkspace, deskId);
    const taCoverage = Array.isArray(taPayload.coverage)
      ? taPayload.coverage.find((entry) => entry?.entityType === 'desk' && entry?.entityId === deskId) || null
      : null;
    const routeSummary = buildCtoDeskRouteSummary(deskId);
    const liveAgents = payload.agents.filter((agent) => {
      const status = String(agent?.status || '').trim().toLowerCase();
      return status && status !== 'idle';
    });
    return {
      deskId,
      label: payload.desk?.label || deskId,
      departmentId: payload.desk?.departmentId || null,
      departmentLabel: payload.layout?.department?.label || payload.desk?.departmentId || null,
      exists: true,
      assignedAgentIds: Array.isArray(payload.desk?.assignedAgentIds) ? payload.desk.assignedAgentIds : [],
      managedAgents: Array.isArray(payload.agents) ? payload.agents.map((agent) => agent.id).filter(Boolean) : [],
      liveAgentCount: liveAgents.length,
      liveAgentStatuses: liveAgents.map((agent) => `${agent.id}:${agent.status}`),
      taskCount: Array.isArray(payload.tasks) ? payload.tasks.length : 0,
      reportCount: Array.isArray(payload.reports) ? payload.reports.length : 0,
      truthContext: payload.truth?.context?.summary || payload.truth?.department?.context || null,
      guardrailCount: Array.isArray(payload.truth?.guardrails) ? payload.truth.guardrails.length : 0,
      qaScorecardCount: Array.isArray(payload.truth?.scorecards) ? payload.truth.scorecards.length : 0,
      readOnly: !routeSummary.propertiesWritable,
      manualRunRoute: routeSummary.manualRunRoute,
      routeNote: routeSummary.routeNote,
      taCoverage: taCoverage ? {
        health: taCoverage.health,
        blocked: Boolean(taCoverage.blocked),
        statusLabel: taCoverage.statusLabel || taCoverage.health,
        openRoles: Array.isArray(taCoverage.openRoles)
          ? taCoverage.openRoles.map((entry) => ({
              roleId: entry.roleId || null,
              roleLabel: entry.roleLabel || entry.roleId || 'coverage',
              kind: entry.kind || 'understaffed',
              urgency: entry.urgency || 'low',
              blocker: Boolean(entry.blocker),
            }))
          : [],
        blockers: Array.isArray(taCoverage.blockers)
          ? taCoverage.blockers.map((entry) => entry.roleLabel || entry.roleId || entry.kind || 'staffing blocker')
          : [],
      } : null,
    };
  });
  return {
    workspace: {
      orchestratorStatus: runtimeWorkspace?.studio?.orchestrator?.status || null,
      activeDeskIds: Array.isArray(runtimeWorkspace?.studio?.orchestrator?.activeDeskIds) ? runtimeWorkspace.studio.orchestrator.activeDeskIds : [],
      teamBoardCardCount: Array.isArray(runtimeWorkspace?.studio?.teamBoard?.cards) ? runtimeWorkspace.studio.teamBoard.cards.length : 0,
      pageTitle: runtimeWorkspace?.pages?.find?.((page) => page.id === runtimeWorkspace?.notebook?.activePageId)?.title || null,
    },
    desks,
    ta: {
      summary: taPayload.department?.summary || null,
      urgency: taPayload.department?.urgency || 'low',
      rosterCount: Array.isArray(taPayload.roster) ? taPayload.roster.length : 0,
      openRoles: Array.isArray(taPayload.gapModel?.openRoles)
        ? taPayload.gapModel.openRoles.map((entry) => ({
            entityId: entry.entityId || null,
            entityLabel: entry.entityLabel || entry.entityId || null,
            roleId: entry.roleId || null,
            roleLabel: entry.roleLabel || entry.roleId || 'coverage',
            kind: entry.kind || 'understaffed',
            urgency: entry.urgency || 'low',
            blocker: Boolean(entry.blocker),
          }))
        : [],
    },
    generatedAt: nowIso(),
  };
}

function findPendingCtoAction(history = [], confirmActionId = '') {
  const targetId = String(confirmActionId || '').trim();
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const action = normalizeCtoActionRecord(history[index]?.action || null);
    if (!action) continue;
    if (targetId && action.id === targetId) return action;
    if (!targetId && action.available && action.requiresConfirmation && action.status === 'pending') {
      return action;
    }
  }
  return null;
}

function buildCtoAvailableActions({ text = '', history = [], context = null } = {}) {
  const normalizedText = String(text || '').trim().toLowerCase();
  const deskId = findDeskTargetsInText(normalizedText)[0] || null;
  const targetDesk = context?.desks?.find((entry) => entry.deskId === deskId) || null;
  const asksForHiring = /\b(hire|recruit|staff|coverage|understaffed|missing lead|missing planner|headcount)\b/.test(normalizedText);
  const asksForRouting = /\b(delegate|delegation|route|assign|send|hand off|handoff|have .* handle|ask .* handle)\b/.test(normalizedText);
  const mentionsNeed = /\b(need|needs|missing|lack|without)\b/.test(normalizedText);
  const actions = [];

  if (targetDesk && (asksForHiring || mentionsNeed || (targetDesk.taCoverage?.openRoles || []).length)) {
    const gapDescription = `${targetDesk.label} coverage is needed. Request: ${truncatePromptText(text, 180)}`;
    actions.push({
      id: `hire-${targetDesk.deskId}`,
      kind: 'hire_candidate',
      label: `Ask Talent Acquisition to hire ${targetDesk.label} coverage`,
      targetDeskId: targetDesk.deskId,
      targetDeskLabel: targetDesk.label,
      available: true,
      requiresConfirmation: true,
      status: 'pending',
      reason: targetDesk.taCoverage?.openRoles?.length
        ? `${targetDesk.label} staffing is ${targetDesk.taCoverage.health}; open roles: ${targetDesk.taCoverage.openRoles.map((entry) => entry.roleLabel).join(', ')}.`
        : `A real TA candidate + hire route exists for ${targetDesk.label}.`,
      route: 'POST /api/ta/hire',
      routeStatus: 'wired',
      gapDescription,
    });
  }

  if (targetDesk && asksForRouting) {
    actions.push({
      id: `route-${targetDesk.deskId}`,
      kind: 'route_to_desk',
      label: `Delegate this request to ${targetDesk.label}`,
      targetDeskId: targetDesk.deskId,
      targetDeskLabel: targetDesk.label,
      available: false,
      requiresConfirmation: false,
      status: 'unavailable',
      reason: targetDesk.routeNote,
      route: null,
      routeStatus: 'advisory-only',
      gapDescription: null,
    });
  }

  if (!actions.length) {
    const pending = findPendingCtoAction(history);
    if (pending) actions.push(pending);
  }

  return actions;
}

function selectTaCandidateForDesk(action = null) {
  const targetDeskId = String(action?.targetDeskId || '').trim();
  if (!targetDeskId) {
    return { ok: false, reason: 'targetDeskId is required for a TA hire.' };
  }
  const gapDescription = String(action?.gapDescription || `${targetDeskId} coverage is needed.`).trim();
  const candidates = generateCandidates({
    description: gapDescription,
    system_context: 'ACE Studio runtime',
    affected_components: [targetDeskId, 'staffing', 'talent acquisition'],
  });
  const match = candidates.find((candidate) => {
    const allowedDeskIds = Array.isArray(candidate.allowedDeskIds)
      ? candidate.allowedDeskIds
      : (Array.isArray(candidate.allowed_desk_ids) ? candidate.allowed_desk_ids : []);
    const primaryDeskTarget = String(candidate.primaryDeskTarget || candidate.primary_desk_target || '').trim();
    return allowedDeskIds.includes(targetDeskId) || primaryDeskTarget === targetDeskId;
  }) || null;
  if (!match) {
    return {
      ok: false,
      reason: `Talent Acquisition could not produce a grounded candidate for ${targetDeskId}.`,
    };
  }
  return {
    ok: true,
    candidate: normalizeTaCandidateCard(match),
  };
}

async function executeCtoConfirmedAction(action = null) {
  const normalizedAction = normalizeCtoActionRecord(action);
  if (!normalizedAction) {
    return {
      ok: false,
      status: 'blocked',
      reason: 'No pending CTO action could be confirmed.',
    };
  }
  if (normalizedAction.kind !== 'hire_candidate') {
    return {
      ok: false,
      status: 'blocked',
      actionId: normalizedAction.id,
      reason: `${normalizedAction.label} is not wired in this slice.`,
    };
  }
  const candidateResult = selectTaCandidateForDesk(normalizedAction);
  if (!candidateResult.ok) {
    return {
      ok: false,
      status: 'blocked',
      actionId: normalizedAction.id,
      reason: candidateResult.reason,
    };
  }
  try {
    const currentState = normalizeTaDepartmentState(readJsonSafe(TA_DEPARTMENT_FILE, createDefaultTaDepartmentState()) || createDefaultTaDepartmentState());
    if (currentState.hiredCandidates.some((entry) => entry.id === candidateResult.candidate.id)) {
      throw new Error(`Candidate "${candidateResult.candidate.id}" is already hired.`);
    }
    const hiredCandidate = {
      ...candidateResult.candidate,
      hiredAt: nowIso(),
      hiredDeskId: normalizedAction.targetDeskId,
      contractLocked: true,
    };
    const nextState = {
      ...currentState,
      hiredCandidates: [...currentState.hiredCandidates, hiredCandidate],
      updatedAt: nowIso(),
      lastGeneratedGap: normalizedAction.gapDescription || currentState.lastGeneratedGap || null,
    };
    writeJson(TA_DEPARTMENT_FILE, nextState);
    const department = await buildTaDepartmentPayload(nextState);
    return {
      ok: true,
      status: 'executed',
      actionId: normalizedAction.id,
      kind: normalizedAction.kind,
      deskId: normalizedAction.targetDeskId,
      deskLabel: normalizedAction.targetDeskLabel,
      summary: `Talent Acquisition hired ${hiredCandidate.name} for ${normalizedAction.targetDeskLabel || normalizedAction.targetDeskId}.`,
      hiredCandidate: {
        id: hiredCandidate.id,
        name: hiredCandidate.name,
        role: hiredCandidate.role,
        deskId: hiredCandidate.hiredDeskId,
      },
      departmentSummary: department.department?.summary || null,
    };
  } catch (error) {
    return {
      ok: false,
      status: 'blocked',
      actionId: normalizedAction.id,
      kind: normalizedAction.kind,
      deskId: normalizedAction.targetDeskId,
      deskLabel: normalizedAction.targetDeskLabel,
      reason: String(error.message || error),
    };
  }
}

function normalizeCtoDelegation(rawDelegation = null, context = null) {
  if (!rawDelegation || typeof rawDelegation !== 'object') return null;
  const deskId = String(rawDelegation.desk_id || rawDelegation.deskId || '').trim();
  const matchingDesk = context?.desks?.find((entry) => entry.deskId === deskId) || null;
  if (!deskId && !matchingDesk) return null;
  return {
    deskId: matchingDesk?.deskId || deskId || null,
    deskLabel: matchingDesk?.label || String(rawDelegation.desk_label || rawDelegation.deskLabel || deskId || '').trim() || null,
    why: String(rawDelegation.why || rawDelegation.reason || '').trim() || null,
  };
}

function normalizeCtoResponseAction(rawAction = null, availableActions = [], execution = null) {
  let matched = null;
  const requestedId = String(rawAction?.id || '').trim();
  if (requestedId) {
    matched = availableActions.find((entry) => entry.id === requestedId) || null;
  }
  if (!matched && execution?.actionId) {
    matched = availableActions.find((entry) => entry.id === execution.actionId) || null;
  }
  if (!matched && availableActions.length === 1) {
    matched = availableActions[0];
  }
  if (!matched) return null;
  if (execution && execution.actionId === matched.id) {
    return {
      ...matched,
      status: execution.ok ? 'executed' : 'blocked',
      requiresConfirmation: execution.ok ? false : matched.requiresConfirmation,
      reason: execution.ok ? execution.summary : execution.reason,
      execution,
    };
  }
  return matched;
}

function createCtoStructuredReplyError(kind = 'parse', message = 'CTO structured reply failed.') {
  const error = new Error(String(message || 'CTO structured reply failed.'));
  error.name = 'CtoStructuredReplyError';
  error.ctoFailureKind = kind === 'contract' ? 'contract' : 'parse';
  error.code = error.ctoFailureKind === 'contract' ? 'cto-contract-failed' : 'cto-parse-failed';
  return error;
}

function extractStrictCtoStructuredJson(text = '') {
  const raw = String(text || '').trim();
  if (!raw) {
    throw createCtoStructuredReplyError('parse', 'CTO chat returned an empty response.');
  }
  const fencedMatch = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch) {
    return String(fencedMatch[1] || '').trim();
  }
  if (raw.startsWith('{')) {
    return raw;
  }
  throw createCtoStructuredReplyError('parse', 'CTO chat returned prose instead of strict JSON.');
}

function validateCtoStructuredReplyShape(payload = null, options = {}) {
  const availableActionIds = Array.isArray(options.availableActions)
    ? options.availableActions.map((entry) => String(entry?.id || '').trim()).filter(Boolean)
    : [];
  const executionActionId = String(options.execution?.actionId || '').trim();
  if (executionActionId && !availableActionIds.includes(executionActionId)) {
    availableActionIds.push(executionActionId);
  }
  const knownDeskIds = Array.isArray(options.context?.desks)
    ? options.context.desks.map((entry) => String(entry?.deskId || '').trim()).filter(Boolean)
    : [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw createCtoStructuredReplyError('contract', 'CTO chat response must be a JSON object.');
  }
  const replyText = String(payload.reply_text || payload.replyText || '').trim();
  if (!replyText) {
    throw createCtoStructuredReplyError('contract', 'CTO chat response was missing reply_text.');
  }
  const responseKind = String(payload.response_kind || payload.responseKind || '').trim();
  if (!CTO_GOVERNANCE_RESPONSE_KIND_VALUES.includes(responseKind)) {
    throw createCtoStructuredReplyError(
      'contract',
      `CTO chat response had an invalid response_kind. Allowed values: ${CTO_GOVERNANCE_RESPONSE_KIND_VALUES.join(', ')}.`,
    );
  }
  const delegation = payload.delegation;
  if (delegation !== null && delegation !== undefined) {
    if (!delegation || typeof delegation !== 'object' || Array.isArray(delegation)) {
      throw createCtoStructuredReplyError('contract', 'CTO chat response had an invalid delegation object.');
    }
    const delegationDeskId = String(delegation.desk_id || delegation.deskId || '').trim();
    const delegationDeskLabel = String(delegation.desk_label || delegation.deskLabel || '').trim();
    const delegationWhy = String(delegation.why || delegation.reason || '').trim();
    if (!delegationDeskId || !delegationDeskLabel || !delegationWhy) {
      throw createCtoStructuredReplyError('contract', 'CTO chat delegation did not satisfy the required contract.');
    }
    if (knownDeskIds.length && !knownDeskIds.includes(delegationDeskId)) {
      throw createCtoStructuredReplyError('contract', `CTO chat delegation referenced an unknown desk_id: ${delegationDeskId}.`);
    }
  }
  const action = payload.action;
  if (action !== null && action !== undefined) {
    if (!action || typeof action !== 'object' || Array.isArray(action)) {
      throw createCtoStructuredReplyError('contract', 'CTO chat response had an invalid action object.');
    }
    const actionId = String(action.id || '').trim();
    if (!actionId) {
      throw createCtoStructuredReplyError('contract', 'CTO chat action did not satisfy the required contract.');
    }
    if (availableActionIds.length && !availableActionIds.includes(actionId)) {
      throw createCtoStructuredReplyError('contract', `CTO chat action referenced an unavailable action id: ${actionId}.`);
    }
  }
  return {
    replyText,
    responseKind,
  };
}

function parseCtoStructuredReply(text = '', options = {}) {
  const candidate = extractStrictCtoStructuredJson(text);
  let payload = null;
  try {
    payload = JSON.parse(candidate);
  } catch (error) {
    throw createCtoStructuredReplyError('parse', `CTO chat response was not valid JSON: ${error.message}`);
  }
  const validated = validateCtoStructuredReplyShape(payload, options);
  return {
    payload,
    replyText: validated.replyText,
    responseKind: validated.responseKind,
  };
}

function buildCtoPromptContext(context = null) {
  return {
    workspace: context?.workspace || {},
    desks: (context?.desks || []).map((desk) => ({
      deskId: desk.deskId,
      label: desk.label,
      departmentLabel: desk.departmentLabel,
      assignedAgentIds: desk.assignedAgentIds,
      liveAgentCount: desk.liveAgentCount,
      liveAgentStatuses: desk.liveAgentStatuses,
      taskCount: desk.taskCount,
      reportCount: desk.reportCount,
      readOnly: desk.readOnly,
      manualRunRoute: desk.manualRunRoute,
      routeNote: desk.routeNote,
      truthContext: truncatePromptText(desk.truthContext || '', 160),
      taCoverage: desk.taCoverage,
    })),
    ta: {
      summary: context?.ta?.summary || null,
      urgency: context?.ta?.urgency || 'low',
      rosterCount: context?.ta?.rosterCount || 0,
      openRoles: (context?.ta?.openRoles || []).slice(0, 12),
    },
  };
}

function buildCtoChatPrompt({
  text = '',
  history = [],
  context = null,
  availableActions = [],
  execution = null,
} = {}) {
  const promptPayload = {
    latest_user_message: text,
    history: history.map((entry) => ({
      role: entry.role,
      text: truncatePromptText(entry.text, 220),
      action: entry.action ? {
        id: entry.action.id,
        kind: entry.action.kind,
        label: entry.action.label,
        available: entry.action.available,
        requiresConfirmation: entry.action.requiresConfirmation,
        status: entry.action.status,
        reason: entry.action.reason,
      } : null,
    })),
    context: buildCtoPromptContext(context),
    available_actions: availableActions,
    execution_result: execution || null,
  };
  return [
    'You are the ACE CTO / Architect chat utility.',
    'Use only grounded facts from the supplied ACE context.',
    'Do not invent departments, desks, routes, or completed actions.',
    'Prefer governance and delegation language over pretending to do all work directly.',
    'When a desk is weak, missing, read-only, or advisory-only, say so explicitly.',
    'If an action is listed as available, mention it only as a confirmation-gated option unless execution_result already shows it was executed.',
    'If an action is unavailable, explain why in system terms.',
    'Return JSON only with this exact shape:',
    '{',
    '  "reply_text": "string",',
    '  "response_kind": "advisory|actionable|blocked",',
    '  "delegation": { "desk_id": "string", "desk_label": "string", "why": "string" } | null,',
    '  "action": { "id": "string" } | null',
    '}',
    'response_kind must be one of advisory, actionable, blocked.',
    'If action is not null, action.id must be one of the ids listed in available_actions.',
    'If delegation is not null, delegation.desk_id must match a real desk_id from the supplied context.',
    'Do not emit route status fields. Route status is owned by the server, not the model.',
    '',
    'ACE context:',
    JSON.stringify(promptPayload, null, 2),
  ].join('\n');
}

async function runCtoGovernanceChat({
  text = '',
  history = [],
  source = 'cto-chat',
  backend = null,
  model = null,
  host = null,
  timeoutMs = null,
  confirmActionId = null,
  workspace = null,
} = {}) {
  const promptText = String(text || '').trim();
  if (!promptText) {
    throw new Error('text is required.');
  }
  const requestedConfig = resolveCtoGovernanceConfig({ backend, model, host, timeoutMs });
  const requestedBackend = requestedConfig.backend;
  const requestedModel = requestedConfig.model;
  const requestedHost = requestedConfig.host;
  const requestedTimeout = requestedConfig.timeoutMs;
  const normalizedHistory = normalizeCtoChatHistory(history);
  const backendStatus = await probeCtoBackendStatus({
    backend: requestedBackend,
    model: requestedModel,
    host: requestedHost,
    timeoutMs: requestedTimeout,
  });
  if (!backendStatus.ok) {
    const diagnostic = recordCtoDiagnostic({
      route: '/api/spatial/cto/chat',
      source,
      status: backendStatus.status,
      backend: requestedBackend,
      model: requestedModel,
      host: requestedHost,
      reason: backendStatus.reason,
    });
    return {
      ok: false,
      status: backendStatus.status,
      reason: backendStatus.reason,
      backend: requestedBackend,
      model: requestedModel,
      backendStatus,
      source,
      diagnostic,
    };
  }
  const context = await buildCtoGovernanceContext(workspace);
  const availableActions = buildCtoAvailableActions({
    text: promptText,
    history: normalizedHistory,
    context,
  });
  const pendingAction = findPendingCtoAction(normalizedHistory, confirmActionId);
  const shouldExecuteAction = Boolean(pendingAction)
    && (Boolean(String(confirmActionId || '').trim()) || isAffirmativeCtoReply(promptText));
  const execution = shouldExecuteAction
    ? await executeCtoConfirmedAction(pendingAction)
    : null;
  const runId = `cto-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const prompt = buildCtoChatPrompt({
    text: promptText,
    history: normalizedHistory,
    context,
    availableActions,
    execution,
  });
  try {
    const modelResult = await callOllamaGenerate({
      prompt,
      model: requestedModel,
      host: requestedHost,
      timeoutMs: requestedTimeout,
      expectJson: false,
    });
    const parsedReply = parseCtoStructuredReply(modelResult?.text || '', {
      availableActions,
      context,
      execution,
    });
    const raw = parsedReply.payload;
    const replyText = parsedReply.replyText;
    const responseKind = parsedReply.responseKind;
    return {
      ok: true,
      status: 'live',
      backend: requestedBackend,
      model: requestedModel,
      runId,
      source,
      reply_text: replyText,
      replyKind: responseKind,
      delegation: normalizeCtoDelegation(raw.delegation, context),
      action: normalizeCtoResponseAction(raw.action, availableActions, execution),
      execution,
      backendStatus,
    };
  } catch (error) {
    const reason = String(error.message || error);
    const failureDetail = error?.ctoFailureKind === 'contract'
      ? `returned parseable JSON that failed CTO contract validation`
      : 'returned an unreadable structured reply';
    const diagnostic = recordCtoDiagnostic({
      route: '/api/spatial/cto/chat',
      source,
      status: 'degraded',
      backend: requestedBackend,
      model: requestedModel,
      host: requestedHost,
      reason,
      failureKind: error?.ctoFailureKind || 'parse',
      runId,
      actionId: execution?.actionId || null,
      availableActionIds: availableActions.map((entry) => entry.id),
    });
    return {
      ok: false,
      status: 'degraded',
      backend: requestedBackend,
      model: requestedModel,
      runId,
      source,
      reason,
      reply_text: execution?.ok
        ? `${execution.summary} The live CTO model is reachable, but ${requestedModel} ${failureDetail}, so no additional governance response is available.`
        : `The live CTO model is reachable, but ${requestedModel} ${failureDetail}. No delegation or internal action was applied.`,
      replyKind: 'blocked',
      delegation: null,
      action: normalizeCtoResponseAction(null, availableActions, execution),
      execution,
      backendStatus: {
        ...backendStatus,
        ok: false,
        status: 'degraded',
        reason,
      },
      diagnostic,
    };
  }
}

async function runCtoGovernanceModelBakeOff({
  models = null,
  text = CTO_BAKEOFF_DEFAULT_TEXT,
  history = [],
  backend = null,
  host = null,
  timeoutMs = null,
  workspace = null,
  fetchImpl = globalThis.fetch,
} = {}) {
  const config = resolveCtoGovernanceConfig({ backend, host, timeoutMs });
  const localModels = await listLocalOllamaModels({
    host: config.host,
    timeoutMs: config.timeoutMs,
    fetchImpl,
  });
  const requestedModels = Array.isArray(models)
    ? models.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  const shortlist = requestedModels.length
    ? requestedModels
    : [
        ...CTO_BAKEOFF_MODEL_PREFERENCE.filter((modelName) => localModels.includes(modelName)),
        ...localModels.filter((modelName) => !CTO_BAKEOFF_MODEL_PREFERENCE.includes(modelName)),
      ].slice(0, 6);
  const normalizedHistory = normalizeCtoChatHistory(history);
  const context = await buildCtoGovernanceContext(workspace);
  const availableActions = buildCtoAvailableActions({
    text,
    history: normalizedHistory,
    context,
  });
  const prompt = buildCtoChatPrompt({
    text,
    history: normalizedHistory,
    context,
    availableActions,
    execution: null,
  });
  const results = [];

  for (const modelName of shortlist) {
    const status = await probeCtoBackendStatus({
      backend: config.backend,
      model: modelName,
      host: config.host,
      timeoutMs: config.timeoutMs,
      fetchImpl,
    });
    if (!status.ok) {
      results.push({
        model: modelName,
        reachable: false,
        backendStatus: status,
        rawOutput: null,
        rawJsonParse: { ok: false, reason: 'Model was not reachable for bake-off.' },
        fencedJsonParse: { ok: false, reason: 'Model was not reachable for bake-off.' },
        contractValidation: { ok: false, reason: status.reason || 'Model was not reachable for bake-off.', parsePath: null },
        score: 0,
      });
      continue;
    }

    let rawOutput = '';
    let rawJsonParse = { ok: false, reason: 'No output returned.', payload: null };
    let fencedJsonParse = { ok: false, reason: 'No output returned.', payload: null };
    let contractValidation = { ok: false, reason: 'No output returned.', parsePath: null };

    try {
      const generation = await callOllamaGenerate({
        prompt,
        model: modelName,
        host: config.host,
        timeoutMs: config.timeoutMs,
        expectJson: false,
        fetchImpl,
      });
      rawOutput = String(generation?.text || '').trim();
      rawJsonParse = tryParseCtoRawJson(rawOutput);
      fencedJsonParse = tryParseCtoFencedJson(rawOutput);
      try {
        parseCtoStructuredReply(rawOutput, {
          availableActions,
          context,
          execution: null,
        });
        contractValidation = {
          ok: true,
          reason: null,
          parsePath: rawJsonParse.ok ? 'raw_json' : (fencedJsonParse.ok ? 'fenced_json' : 'strict_parser'),
        };
      } catch (error) {
        contractValidation = {
          ok: false,
          reason: String(error.message || error),
          parsePath: rawJsonParse.ok ? 'raw_json' : (fencedJsonParse.ok ? 'fenced_json' : null),
        };
      }
    } catch (error) {
      rawOutput = '';
      const reason = String(error.message || error);
      rawJsonParse = { ok: false, reason, payload: null };
      fencedJsonParse = { ok: false, reason, payload: null };
      contractValidation = { ok: false, reason, parsePath: null };
    }

    const entry = {
      model: modelName,
      reachable: true,
      backendStatus: status,
      rawOutput,
      rawJsonParse: {
        ok: rawJsonParse.ok,
        reason: rawJsonParse.reason || null,
      },
      fencedJsonParse: {
        ok: fencedJsonParse.ok,
        reason: fencedJsonParse.reason || null,
      },
      contractValidation,
    };
    entry.score = scoreCtoBakeOffEntry(entry);
    results.push(entry);
  }

  return {
    generatedAt: nowIso(),
    backend: config.backend,
    host: config.host,
    promptText: text,
    availableModels: localModels,
    shortlistedModels: shortlist,
    summary: summarizeCtoBakeOffResult(results),
    results,
  };
}

function detectMaterialGenerationIntent(text) {
  const value = String(text || '').toLowerCase();
  if (!value.trim()) return false;
  const mentionsMaterial = /\bmaterial(s)?\b/.test(value);
  const generationVerb = /\b(generate|create|make|build)\b/.test(value);
  return mentionsMaterial && generationVerb;
}

function detectWorldScaffoldIntent(text) {
  return detectPotentialWorldScaffoldPrompt(text);
}

function inferMaterialSurface(text) {
  const value = String(text || '').trim();
  const quoted = value.match(/"([^"]{2,80})"/);
  if (quoted && quoted[1]) return quoted[1].toLowerCase();
  const knownSurfaces = ['wet stone', 'stone', 'metal', 'wood', 'concrete', 'mud', 'sand'];
  const hit = knownSurfaces.find((surface) => value.toLowerCase().includes(surface));
  return hit || 'generic';
}

function buildMaterialIntentModuleEnvelope({ text = '', nodeId = null, source = 'context-intake' } = {}) {
  return {
    action: 'run_module',
    module_id: 'material_gen',
    input: {
      intent: {
        type: 'material',
        surface: inferMaterialSurface(text),
        request_text: String(text || ''),
      },
      constraints: {
        engine_target: 'unreal',
        require_tileable: true,
      },
      context: {
        source,
        source_node_id: nodeId,
      },
    },
  };
}

function appendNewRsgHistoryEntries(previousWorkspace = {}, nextWorkspace = {}) {
  const previousIds = new Set(((previousWorkspace?.rsg?.activity || [])).map((entry) => entry?.id).filter(Boolean));
  (nextWorkspace?.rsg?.activity || [])
    .filter((entry) => entry?.id && /^rsg-/.test(String(entry.type || '')) && !previousIds.has(entry.id))
    .reverse()
    .forEach((entry) => {
      appendArchitectureHistory({
        at: entry.at || nowIso(),
        type: entry.type,
        summary: {
          sourceNodeId: entry.sourceNodeId || null,
          sourceNodeLabel: entry.sourceNodeLabel || '',
          generatedCount: Number(entry.generatedCount || 0),
          replacedCount: Number(entry.replacedCount || 0),
          summary: entry.summary || '',
          confidence: entry.confidence,
          usedFallback: Boolean(entry.usedFallback),
          reason: entry.reason || '',
          trigger: entry.trigger || 'manual',
          generationId: entry.generationId || null,
        },
      });
    });
}


function nowIso() {
  return new Date().toISOString();
}

function classifyLlmFailureStatus(reason = '', usedFallback = false) {
  const message = String(reason || '').toLowerCase();
  if (message.includes('timed out')) return 'timed_out';
  if (message.includes('econnrefused') || message.includes('fetch failed') || message.includes('no fetch implementation') || message.includes('ollama unavailable')) {
    return 'model_unavailable';
  }
  return usedFallback ? 'degraded_fallback' : 'model_error';
}

const FAILURE_CLASSES = new Set(['warning', 'panel_degraded', 'runtime_critical', 'boot_critical']);

function normalizeFailureClass(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (FAILURE_CLASSES.has(normalized)) return normalized;
  return 'runtime_critical';
}

function extractFailureStack(error = null) {
  if (!error || typeof error === 'string') return null;
  const stack = String(error.stack || '').trim();
  return stack || null;
}

function classifyFailureContext(error = null, context = {}) {
  const message = String(error?.message || context.message || error || '').toLowerCase();
  const code = String(error?.code || context.code || '').trim().toUpperCase();
  const statusCode = Number(context.statusCode || context.status || error?.statusCode || error?.status || 0) || 0;
  const route = String(context.route || context.path || '').toLowerCase();
  const stage = String(context.stage || context.related_stage || context.relatedStage || '').toLowerCase();
  const component = String(context.component || context.surface || context.panel || '').toLowerCase();
  const surface = String(context.surface || context.view || context.panel || '').toLowerCase();
  const source = String(context.source || '').toLowerCase();
  const scope = `${message} ${code} ${route} ${stage} ${component} ${surface} ${source}`.trim();
  const isBootContext = /(^|[^a-z])(boot|startup|start-up|health|init|initialize|initialization|server-start)([^a-z]|$)/.test(scope);
  const isPanelContext = /(^|[^a-z])(panel|utility|roster|truth|qa|notebook|desk|workspace|spatial|render|view)([^a-z]|$)/.test(scope);
  const warningCodes = new Set(['BAD_REQUEST', 'INVALID_ARGUMENT', 'INVALID_INPUT', 'MISSING_INPUT', 'NOT_FOUND', 'UNSUPPORTED', 'CONFLICT', 'VALIDATION_FAILED']);
  const warningSignals = [
    statusCode > 0 && statusCode < 500,
    warningCodes.has(code),
    /(^|[^a-z])(expected|recoverable|warning|noncritical|non-critical|skip)([^a-z]|$)/.test(scope),
  ];
  if (warningSignals.some(Boolean)) {
    return 'warning';
  }
  if (isBootContext) {
    return 'boot_critical';
  }
  if (isPanelContext) {
    return 'panel_degraded';
  }
  if (['EPERM', 'EACCES', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE', 'ECONNRESET'].includes(code)) {
    return isBootContext ? 'boot_critical' : 'runtime_critical';
  }
  if (error instanceof SyntaxError) {
    return isBootContext ? 'boot_critical' : 'runtime_critical';
  }
  if (error instanceof TypeError || error instanceof ReferenceError || error instanceof RangeError || error instanceof URIError || error instanceof EvalError) {
    return isPanelContext ? 'panel_degraded' : (isBootContext ? 'boot_critical' : 'runtime_critical');
  }
  if (/cannot read (properties|property)|reading 'length'|reading "length"|map is not a function|filter is not a function|forEach is not a function|join is not a function/.test(message)) {
    return isPanelContext ? 'panel_degraded' : 'runtime_critical';
  }
  return isBootContext ? 'boot_critical' : 'runtime_critical';
}

function buildFailureUiResponse(failureClass = 'runtime_critical') {
  const normalized = normalizeFailureClass(failureClass);
  switch (normalized) {
    case 'warning':
      return {
        failureClass: normalized,
        uiMode: 'banner',
        clientAction: 'continue',
        safeMode: false,
        fallbackPanel: false,
        shell: 'current',
        summary: 'Show a warning banner and keep the current UI mounted.',
      };
    case 'panel_degraded':
      return {
        failureClass: normalized,
        uiMode: 'fallback_panel',
        clientAction: 'showFallbackPanel',
        safeMode: false,
        fallbackPanel: true,
        shell: 'fallback-panel',
        summary: 'Render a fallback panel and keep the rest of the UI alive.',
      };
    case 'boot_critical':
      return {
        failureClass: normalized,
        uiMode: 'safe_mode',
        clientAction: 'enterSafeMode',
        safeMode: true,
        fallbackPanel: false,
        shell: 'safe-shell',
        summary: 'Trigger safe mode and mount the simplified shell.',
      };
    case 'runtime_critical':
    default:
      return {
        failureClass: normalized,
        uiMode: 'safe_mode',
        clientAction: 'enterSafeMode',
        safeMode: true,
        fallbackPanel: false,
        shell: 'safe-shell',
        summary: 'Escalate to safe mode for a runtime-critical failure.',
      };
  }
}

function recordClassifiedFailure(rootPath, error = null, context = {}) {
  const failureClass = classifyFailureContext(error, context);
  const uiResponse = buildFailureUiResponse(failureClass);
  const message = String(context.message || error?.message || error || 'Unexpected failure.').trim();
  const stack = extractFailureStack(error) || String(context.stack || '').trim() || null;
  const observation = {
    message,
    stack,
    timestamp: String(context.timestamp || '').trim() || nowIso(),
    failure_class: failureClass,
    ui_response: uiResponse,
    related_tool: context.tool || context.related_tool || error?.code || null,
    related_stage: context.stage || context.related_stage || context.relatedStage || null,
    stage: context.stage || context.related_stage || context.relatedStage || null,
    agent_id: context.agentId || context.agent_id || null,
    agent_version: context.agentVersion || context.agent_version || null,
    related_run: context.runId || context.related_run || context.run || null,
    related_project: context.projectKey || context.project || context.related_project || null,
    route: context.route || context.path || null,
    method: context.method || null,
    source: context.source || null,
    component: context.component || context.surface || context.panel || null,
  };
  const failureResult = recordFailureOccurrence(rootPath, observation);
  return {
    ...failureResult,
    failureClass,
    uiResponse,
    observation,
  };
}

function buildWorldScaffoldInterpretationLabel({
  source = 'none',
  attempted = false,
  accepted = false,
  fallbackUsed = false,
} = {}) {
  if (accepted && fallbackUsed) return 'model unavailable -> deterministic fallback';
  if (accepted && source === 'deterministic') return 'deterministic';
  if (accepted && source === 'model-assisted') return 'model-assisted';
  if (attempted && source === 'model-assisted') return 'model-assisted rejected';
  return 'no accepted interpretation';
}

function buildWorldScaffoldInterpretation({
  source = 'none',
  attempted = false,
  accepted = false,
  fallbackUsed = false,
  status = 'not_attempted',
  reason = '',
  backend = null,
  model = null,
  candidate = null,
  rawCandidate = null,
  rawText = '',
} = {}) {
  return {
    source,
    label: buildWorldScaffoldInterpretationLabel({ source, attempted, accepted, fallbackUsed }),
    attempted: Boolean(attempted),
    accepted: Boolean(accepted),
    fallbackUsed: Boolean(fallbackUsed),
    status: String(status || 'not_attempted').trim() || 'not_attempted',
    reason: String(reason || '').trim() || '',
    backend: backend || null,
    model: model || null,
    contract: WORLD_SCAFFOLD_MODEL_CONTRACT,
    candidate: candidate || null,
    rawCandidate: rawCandidate ?? null,
    rawText: String(rawText || '').trim() || '',
  };
}

function buildScaffoldInterpretationPrompt(text = '') {
  return [
    'You are the ACE scaffold interpreter.',
    '',
    'Return JSON only. No markdown fences. No prose outside JSON.',
    'Interpret only bounded world scaffold requests.',
    'If the request is not asking for a starter ground/platform/grid scaffold, return {"candidate": null, "notes": "not a scaffold request"}.',
    'Use only this contract:',
    '{',
    '  "candidate": {',
    '    "type": "world_scaffold",',
    '    "shape": "grid",',
    '    "width": 12,',
    '    "height": 12,',
    '    "material": "grass",',
    '    "position": { "x": 0, "y": 0, "z": 0 }',
    '  },',
    '  "notes": "optional short note"',
    '}',
    'Rules:',
    '- Only shape "grid" is allowed.',
    '- Only materials "grass", "stone", or "dirt" are allowed.',
    '- Width and height must be integers between 1 and 100.',
    '- Default position to {0,0,0} when not specified.',
    '- Prefer small starter scaffolds for vague requests.',
    '',
    `Request: ${String(text || '').trim()}`,
  ].join('\n');
}

async function interpretScaffoldIntentWithModel(text, options = {}) {
  const requestedModel = String(options.model || DEFAULT_SCAFFOLD_INTERPRETER_MODEL).trim() || DEFAULT_SCAFFOLD_INTERPRETER_MODEL;
  const requestedBackend = String(options.backend || DEFAULT_SCAFFOLD_INTERPRETER_BACKEND).trim() || DEFAULT_SCAFFOLD_INTERPRETER_BACKEND;
  const requestedTimeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_SCAFFOLD_INTERPRETER_TIMEOUT_MS;
  const callModel = typeof options.callModel === 'function' ? options.callModel : callOllamaGenerate;
  try {
    const result = await callModel({
      prompt: buildScaffoldInterpretationPrompt(text),
      model: requestedModel,
      host: String(options.host || '').trim() || undefined,
      timeoutMs: requestedTimeoutMs,
      expectJson: true,
      fetchImpl: options.fetchImpl,
    });
    const rawJson = result?.json;
    const rawCandidate = rawJson && typeof rawJson === 'object' && !Array.isArray(rawJson) && Object.prototype.hasOwnProperty.call(rawJson, 'candidate')
      ? rawJson.candidate
      : rawJson;
    const candidate = normalizeWorldScaffoldCandidate(rawCandidate, {
      requestText: text,
      source: 'model-assisted',
    });
    if (!candidate.validation?.ok) {
      return buildWorldScaffoldInterpretation({
        source: 'model-assisted',
        attempted: true,
        accepted: false,
        status: candidate.validation?.code === 'malformed_candidate' ? 'rejected_malformed_output' : 'rejected_candidate',
        reason: candidate.validation?.reason || 'Model scaffold candidate was rejected.',
        backend: requestedBackend,
        model: requestedModel,
        candidate,
        rawCandidate,
        rawText: result?.text || '',
      });
    }
    return buildWorldScaffoldInterpretation({
      source: 'model-assisted',
      attempted: true,
      accepted: true,
      status: 'accepted',
      backend: requestedBackend,
      model: requestedModel,
      candidate,
      rawCandidate,
      rawText: result?.text || '',
    });
  } catch (error) {
    const reason = String(error?.message || error).trim();
    const message = reason.toLowerCase();
    const status = message.includes('not valid json') || message.includes('empty response')
      ? 'rejected_malformed_output'
      : classifyLlmFailureStatus(reason, false);
    return buildWorldScaffoldInterpretation({
      source: 'model-assisted',
      attempted: true,
      accepted: false,
      status,
      reason,
      backend: requestedBackend,
      model: requestedModel,
    });
  }
}

function buildWorldScaffoldRoutePayload({
  envelope,
  graphs,
  intent = null,
  interpretation = null,
  evaluation = null,
  ok = false,
  error = '',
} = {}) {
  const resolvedIntent = evaluation?.finalCandidate || intent || null;
  const mutationGeneration = buildWorldScaffoldMutationPlan(graphs, resolvedIntent || {});
  const existingNodeId = mutationGeneration.targetNodeId || findWorldScaffoldNode(graphs)?.node?.id || null;
  return {
    ok: Boolean(ok),
    route: 'world-scaffold',
    envelope,
    intent: resolvedIntent,
    validation: resolvedIntent?.validation || null,
    evaluation,
    mutationGeneration,
    mutations: ok ? mutationGeneration.mutations : [],
    existingNodeId,
    interpretation,
    ...(ok ? {} : {
      error: String(error || interpretation?.reason || mutationGeneration.reason || 'No accepted scaffold interpretation.').trim() || 'No accepted scaffold interpretation.',
    }),
  };
}

function detectPotentialWorldEditPrompt(text = '') {
  const normalizedText = String(text || '').trim().toLowerCase();
  if (!normalizedText) return false;
  return Boolean(
    WORLD_EDIT_ACTION_PATTERN.test(normalizedText)
    && WORLD_EDIT_TARGET_PATTERN.test(normalizedText)
    && (WORLD_EDIT_TILE_NOUN_PATTERN.test(normalizedText) || /\bto the\b/i.test(normalizedText))
    && WORLD_EDIT_MATERIAL_PATTERN.test(normalizedText)
  );
}

function parseWorldEditIntent(text = '', graphs = {}) {
  const normalizedText = String(text || '').trim();
  if (!detectPotentialWorldEditPrompt(normalizedText)) {
    return null;
  }
  const existing = findWorldScaffoldNode(graphs);
  const requestedMaterial = normalizedText.toLowerCase().match(WORLD_EDIT_MATERIAL_PATTERN)?.[1] || null;
  const targetSummary = existing?.node?.metadata?.scaffold?.summary || null;
  const missingScaffold = !existing?.node;
  const reason = missingScaffold
    ? 'Create a scaffold first. Existing-world tile edits are not implemented yet.'
    : 'Existing-world tile edits are not implemented yet. Supported today: scaffold creation only.';
  return {
    type: 'world_edit',
    action: 'paint_tiles',
    target: 'world_scaffold',
    requestText: normalizedText,
    summary: requestedMaterial
      ? `Request ${requestedMaterial} tile edits on the current scaffold`
      : 'Existing-world tile edit request',
    requestedMaterial,
    targetNodeId: existing?.node?.id || null,
    targetSummary,
    supported: false,
    parameters: {
      requestedMaterial,
      targetNodeId: existing?.node?.id || null,
      targetSummary,
    },
    validation: {
      ok: false,
      code: missingScaffold ? 'missing_scaffold' : 'world_edit_not_implemented',
      reason,
    },
  };
}

function buildWorldEditRoutePayload({
  envelope,
  graphs,
  intent = null,
} = {}) {
  const targetNodeId = intent?.targetNodeId || findWorldScaffoldNode(graphs)?.node?.id || null;
  const reason = String(intent?.validation?.reason || 'Existing-world tile edits are not implemented yet.').trim()
    || 'Existing-world tile edits are not implemented yet.';
  return {
    ok: false,
    route: 'world-edit',
    envelope,
    intent,
    validation: intent?.validation || null,
    mutationGeneration: {
      ok: false,
      deterministic: true,
      mutationCount: 0,
      reason,
      mutations: [],
      mode: 'unsupported',
      targetNodeId,
    },
    mutations: [],
    existingNodeId: targetNodeId,
    supported: false,
    error: reason,
  };
}

function resolveWorldEditExecutiveRoute({
  promptText = '',
  envelope = null,
  graphs = {},
} = {}) {
  const intent = parseWorldEditIntent(promptText, graphs);
  if (!intent) {
    return null;
  }
  return {
    matched: true,
    statusCode: 422,
    body: buildWorldEditRoutePayload({
      envelope,
      graphs,
      intent,
    }),
  };
}

async function resolveWorldScaffoldExecutiveRoute({
  promptText = '',
  envelope = null,
  graphs = {},
  modelInterpreter = interpretScaffoldIntentWithModel,
  modelOptions = {},
} = {}) {
  const text = String(promptText || '').trim();
  if (!detectPotentialWorldScaffoldPrompt(text)) {
    return null;
  }

  function finalizeWorldScaffoldRoute({
    candidate = null,
    interpretation = null,
    intendedOk = false,
    failureStatusCode = 422,
    error = '',
  } = {}) {
    const evaluation = evaluateWorldScaffoldCandidate(candidate, {
      requestText: text,
      interpretationSource: interpretation?.source || candidate?.source || 'unknown',
    });
    const accepted = Boolean(intendedOk && evaluation.accepted);
    const reason = String(
      error
      || evaluation.reason
      || interpretation?.reason
      || evaluation?.finalCandidate?.validation?.reason
      || candidate?.validation?.reason
      || 'No accepted scaffold interpretation.'
    ).trim() || 'No accepted scaffold interpretation.';
    return {
      matched: true,
      statusCode: accepted ? 200 : failureStatusCode,
      body: buildWorldScaffoldRoutePayload({
        envelope,
        graphs,
        intent: evaluation.finalCandidate || candidate || null,
        interpretation,
        evaluation,
        ok: accepted,
        error: reason,
      }),
    };
  }

  const deterministicIntent = parseWorldScaffoldIntent(text);
  if (deterministicIntent?.validation?.ok) {
    const interpretation = buildWorldScaffoldInterpretation({
      source: 'deterministic',
      attempted: false,
      accepted: true,
      status: 'accepted',
      candidate: deterministicIntent,
    });
    return finalizeWorldScaffoldRoute({
      candidate: deterministicIntent,
      interpretation,
      intendedOk: true,
    });
  }

  if (shouldAttemptModelScaffoldInterpretation(text, deterministicIntent)) {
    let interpretation = null;
    try {
      interpretation = await modelInterpreter(text, modelOptions);
    } catch (error) {
      const reason = String(error?.message || error).trim();
      interpretation = buildWorldScaffoldInterpretation({
        source: 'model-assisted',
        attempted: true,
        accepted: false,
        status: classifyLlmFailureStatus(reason, false),
        reason,
        backend: String(modelOptions.backend || DEFAULT_SCAFFOLD_INTERPRETER_BACKEND).trim() || DEFAULT_SCAFFOLD_INTERPRETER_BACKEND,
        model: String(modelOptions.model || DEFAULT_SCAFFOLD_INTERPRETER_MODEL).trim() || DEFAULT_SCAFFOLD_INTERPRETER_MODEL,
      });
    }
    return finalizeWorldScaffoldRoute({
      candidate: interpretation?.candidate || null,
      interpretation,
      intendedOk: Boolean(interpretation?.accepted),
      failureStatusCode: interpretation?.status === 'model_unavailable' ? 503 : 422,
      error: interpretation?.reason || interpretation?.candidate?.validation?.reason || 'No accepted scaffold interpretation.',
    });
  }

  if (deterministicIntent) {
    const interpretation = buildWorldScaffoldInterpretation({
      source: 'deterministic',
      attempted: false,
      accepted: false,
      status: 'rejected_validation',
      reason: deterministicIntent.validation?.reason || 'No accepted scaffold interpretation.',
      candidate: deterministicIntent,
    });
    return finalizeWorldScaffoldRoute({
      candidate: deterministicIntent,
      interpretation,
      intendedOk: false,
      failureStatusCode: 422,
      error: deterministicIntent.validation?.reason || 'No accepted scaffold interpretation.',
    });
  }

  const interpretation = buildWorldScaffoldInterpretation({
    source: 'none',
    attempted: false,
    accepted: false,
    status: 'no_candidate',
    reason: 'No accepted scaffold interpretation.',
  });
  return finalizeWorldScaffoldRoute({
    candidate: null,
    interpretation,
    intendedOk: false,
    failureStatusCode: 422,
    error: 'No accepted scaffold interpretation.',
  });
}

function buildAgentFailurePayload(result, extras = {}) {
  const run = extras.run || result?.run || result?.worker || null;
  const reason = String(result?.reason || run?.reason || extras.error || 'Agent model call failed.').trim();
  try {
    const failureError = result?.error instanceof Error
      ? result.error
      : run?.error instanceof Error
        ? run.error
        : new Error(reason);
    const classifiedFailure = recordClassifiedFailure(ROOT, failureError, {
      message: reason,
      tool: extras.tool || run?.backend || run?.model || null,
      related_stage: extras.stage || run?.stage || run?.outcome || null,
      stage: extras.stage || run?.stage || run?.outcome || null,
      agentId: extras.agentId || run?.agent_id || run?.workerId || null,
      agentVersion: extras.agentVersion || run?.agent_version || null,
      runId: extras.runId || run?.id || run?.runId || null,
      projectKey: extras.projectKey || extras.project || null,
      route: extras.route || null,
      component: extras.component || null,
      source: extras.source || 'agent-run',
      timestamp: extras.timestamp || null,
    });
    extras = {
      ...extras,
      failureClass: classifiedFailure.failureClass,
      uiResponse: classifiedFailure.uiResponse,
    };
  } catch (error) {
    console.warn('[WARN] failure history update failed:', error?.message || error);
  }
  return {
    ok: false,
    status: classifyLlmFailureStatus(reason, Boolean(result?.usedFallback || run?.usedFallback)),
    error: reason,
    reason,
    failureClass: extras.failureClass || null,
    uiResponse: extras.uiResponse || null,
    usedFallback: Boolean(result?.usedFallback || run?.usedFallback),
    backend: run?.backend || extras.backend || null,
    model: run?.model || extras.model || null,
    runId: run?.id || run?.runId || extras.runId || null,
    worker: run || null,
    ...extras,
  };
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || 'task';
}

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function normalizeStoredIntentState(rawIntentState = {}) {
  const intentState = rawIntentState?.intentState && typeof rawIntentState.intentState === 'object'
    ? rawIntentState.intentState
    : rawIntentState || {};
  const currentIntentId = intentState.currentIntentId || intentState.latest?.id || intentState.contextReport?.id || null;
  const summary = String(intentState.summary || intentState.latest?.summary || intentState.contextReport?.summary || '').trim();
  const status = String(intentState.status || intentState.latest?.status || intentState.contextReport?.status || 'idle').trim() || 'idle';
  const derived = currentIntentId || summary || status ? {
    id: currentIntentId || 'intent-current',
    currentIntentId,
    summary,
    status,
    createdAt: intentState.createdAt || rawIntentState?.createdAt || null,
  } : null;
  return {
    latest: intentState.latest || derived,
    contextReport: intentState.contextReport || derived,
    byNode: intentState.byNode || {},
    reports: Array.isArray(intentState.reports) ? intentState.reports : [],
    currentIntentId,
    summary,
    status,
  };
}

function normalizeStoredStudioHandoffs(rawHandoffs = null) {
  if (!rawHandoffs || typeof rawHandoffs !== 'object') return null;
  const next = {};
  if (Object.prototype.hasOwnProperty.call(rawHandoffs, 'contextToPlanner')) {
    next.contextToPlanner = rawHandoffs.contextToPlanner || null;
  }
  if (Object.prototype.hasOwnProperty.call(rawHandoffs, 'history')) {
    next.history = Array.isArray(rawHandoffs.history) ? rawHandoffs.history.filter(Boolean).slice(0, 12) : [];
  }
  return Object.keys(next).length ? next : null;
}

function normalizeStoredStudioTeamBoard(rawTeamBoard = null) {
  if (!rawTeamBoard || typeof rawTeamBoard !== 'object') return null;
  if (!Object.prototype.hasOwnProperty.call(rawTeamBoard, 'selectedCardId')) return null;
  return {
    selectedCardId: rawTeamBoard.selectedCardId || null,
  };
}

function normalizeStoredStudioState(rawStudioState = {}) {
  const studioState = rawStudioState && typeof rawStudioState === 'object' ? rawStudioState : {};
  const next = {};
  const handoffs = normalizeStoredStudioHandoffs(studioState.handoffs);
  const teamBoard = normalizeStoredStudioTeamBoard(studioState.teamBoard);
  if (handoffs) next.handoffs = handoffs;
  if (teamBoard) next.teamBoard = teamBoard;
  return next;
}

function mergeWorkspacePatch(workspace, patch = {}) {
  const nextStudio = {
    ...(workspace?.studio || {}),
  };
  if (patch.scene !== undefined) nextStudio.scene = patch.scene;
  if (patch.selectedDeskId !== undefined) nextStudio.selectedAgentId = patch.selectedDeskId;
  if (patch.selectedTab !== undefined) nextStudio.selectedTab = patch.selectedTab;
  if (patch.camera !== undefined) {
    nextStudio.canvasViewport = {
      ...(workspace?.studio?.canvasViewport || {}),
      ...patch.camera,
      ...(patch.zoom !== undefined ? { zoom: patch.zoom } : {}),
    };
    nextStudio.studioViewport = {
      ...(workspace?.studio?.studioViewport || {}),
      ...patch.camera,
    };
  } else if (patch.zoom !== undefined) {
    nextStudio.canvasViewport = {
      ...(workspace?.studio?.canvasViewport || {}),
      zoom: patch.zoom,
    };
  }
  if (patch.activeGraphLayer !== undefined) nextStudio.activeGraphLayer = patch.activeGraphLayer;
  if (patch.worldViewMode !== undefined) nextStudio.worldViewMode = patch.worldViewMode;
  if (patch.handoffs) {
    nextStudio.handoffs = {
      ...(workspace?.studio?.handoffs || {}),
      ...patch.handoffs,
    };
  }
  if (patch.teamBoard) {
    nextStudio.teamBoard = {
      ...(workspace?.studio?.teamBoard || {}),
      ...patch.teamBoard,
    };
  }
  if (patch.studio && typeof patch.studio === 'object') {
    nextStudio.activeGraphLayer = patch.studio.activeGraphLayer !== undefined ? patch.studio.activeGraphLayer : nextStudio.activeGraphLayer;
    nextStudio.worldViewMode = patch.studio.worldViewMode !== undefined ? patch.studio.worldViewMode : nextStudio.worldViewMode;
    nextStudio.layout = patch.studio.layout !== undefined ? patch.studio.layout : nextStudio.layout;
    nextStudio.sidebar = patch.studio.sidebar !== undefined ? patch.studio.sidebar : nextStudio.sidebar;
    nextStudio.orchestrator = patch.studio.orchestrator !== undefined ? patch.studio.orchestrator : nextStudio.orchestrator;
    nextStudio.selfUpgrade = patch.studio.selfUpgrade !== undefined ? patch.studio.selfUpgrade : nextStudio.selfUpgrade;
    if (patch.studio.handoffs) {
      nextStudio.handoffs = {
        ...(nextStudio.handoffs || {}),
        ...patch.studio.handoffs,
      };
    }
    if (patch.studio.teamBoard) {
      nextStudio.teamBoard = {
        ...(nextStudio.teamBoard || {}),
        ...patch.studio.teamBoard,
      };
    }
  }

  return {
    ...workspace,
    ...patch,
    pages: Array.isArray(patch.pages) ? patch.pages : workspace?.pages,
    activePageId: patch.activePageId !== undefined ? patch.activePageId : workspace?.activePageId,
    architectureMemory: patch.architectureMemory
      ? {
          ...(workspace?.architectureMemory || {}),
          ...patch.architectureMemory,
        }
      : workspace?.architectureMemory,
    intentState: patch.intentState
      ? {
          ...(workspace?.intentState || {}),
          ...patch.intentState,
        }
      : workspace?.intentState,
    studio: nextStudio,
  };
}

function normalizeDeskPropertiesState(workspace = {}) {
  const current = workspace?.studio?.deskProperties || {};
  const layoutDeskIds = listStudioDeskIds(workspace?.studio?.layout || {});
  return Object.fromEntries(
    layoutDeskIds.map((deskId) => {
      const deskState = current?.[deskId] || {};
      return [deskId, {
        managedAgents: Array.isArray(deskState.managedAgents) ? [...new Set(deskState.managedAgents.filter(Boolean))] : [],
        moduleIds: Array.isArray(deskState.moduleIds) ? [...new Set(deskState.moduleIds.filter(Boolean))] : [],
        manualTests: Array.isArray(deskState.manualTests)
          ? deskState.manualTests.filter((entry) => entry && entry.id).map((entry) => ({
              id: String(entry.id),
              verdict: String(entry.verdict || 'unknown'),
              createdAt: entry.createdAt || nowIso(),
              notes: entry.notes || '',
            }))
          : [],
        departmentContext: String(deskState.departmentContext || '').trim(),
        guardrails: Array.isArray(deskState.guardrails)
          ? [...new Set(deskState.guardrails.map((entry) => String(entry || '').trim()).filter(Boolean))]
          : [],
        contextSlices: Array.isArray(deskState.contextSlices)
          ? deskState.contextSlices.filter((entry) => entry && String(entry.summary || entry.title || entry.label || '').trim()).map((entry, index) => ({
              id: String(entry.id || `${deskId}-context-${index}`),
              summary: String(entry.summary || entry.title || entry.label || '').trim(),
              detail: String(entry.detail || entry.notes || '').trim(),
            }))
          : [],
      }];
    }),
  );
}

function normalizeTaCandidateCard(candidate = {}) {
  const source = candidate && typeof candidate === 'object' ? candidate : {};
  const deskTargets = Array.isArray(source.desk_targets)
    ? source.desk_targets.map((value) => String(value || '').trim()).filter(Boolean)
    : Array.isArray(source.deskTargets)
      ? source.deskTargets.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  const primaryDeskTarget = String(source.primary_desk_target || source.primaryDeskTarget || deskTargets[0] || '').trim();
  const assignedModel = String(source.assigned_model || source.assignedModel || '').trim();
  const cvCard = source.cv_card && typeof source.cv_card === 'object'
    ? source.cv_card
    : (source.cvCard && typeof source.cvCard === 'object' ? source.cvCard : null);
  const contract = source.contract && typeof source.contract === 'object' ? source.contract : null;
  if (!String(source.id || '').trim()) throw new Error('candidate.id is required.');
  if (!String(source.name || '').trim()) throw new Error('candidate.name is required.');
  if (!String(source.role || '').trim()) throw new Error('candidate.role is required.');
  if (!String(source.department || '').trim()) throw new Error('candidate.department is required.');
  if (!deskTargets.length) throw new Error('candidate.desk_targets is required.');
  if (!primaryDeskTarget) throw new Error('candidate.primary_desk_target is required.');
  if (!assignedModel) throw new Error('candidate.assigned_model is required.');
  if (source.model_locked !== true && source.modelLocked !== true) throw new Error('candidate.model_locked must be true.');
  if (!cvCard || !String(cvCard.title || '').trim() || !String(cvCard.summary || '').trim()) {
    throw new Error('candidate.cv_card must include title and summary.');
  }
  if (!contract || !Array.isArray(contract.input) || !Array.isArray(contract.output)) {
    throw new Error('candidate.contract must include input and output arrays.');
  }
  const availableModels = listAgentModelOptions();
  if (!availableModels.includes(assignedModel)) {
    throw new Error(`candidate.assigned_model must be one of the available models: ${availableModels.join(', ')}.`);
  }
  return {
    id: String(source.id).trim(),
    name: String(source.name).trim(),
    roleId: String(source.role_id || source.roleId || '').trim() || null,
    role: String(source.role).trim(),
    department: String(source.department).trim(),
    departmentId: String(source.department_id || source.departmentId || '').trim() || null,
    deskTargets,
    primaryDeskTarget,
    assignedModel,
    modelLocked: true,
    model_locked: true,
    summary: String(source.summary || '').trim(),
    strengths: Array.isArray(source.strengths) ? source.strengths.filter(Boolean).map((entry) => String(entry)) : [],
    weaknesses: Array.isArray(source.weaknesses) ? source.weaknesses.filter(Boolean).map((entry) => String(entry)) : [],
    recommendedTools: Array.isArray(source.recommended_tools) ? source.recommended_tools.filter(Boolean).map((entry) => String(entry)) : [],
    recommendedSkills: Array.isArray(source.recommended_skills) ? source.recommended_skills.filter(Boolean).map((entry) => String(entry)) : [],
    modelPolicy: source.model_policy && typeof source.model_policy === 'object'
      ? {
          preferred: String(source.model_policy.preferred || '').trim(),
          reason: String(source.model_policy.reason || '').trim(),
        }
      : null,
    whyThisRole: String(source.why_this_role || '').trim(),
    riskNotes: Array.isArray(source.risk_notes) ? source.risk_notes.filter(Boolean).map((entry) => String(entry)) : [],
    confidence: Number(source.confidence || 0),
    allowedDepartmentIds: Array.isArray(source.allowed_department_ids)
      ? source.allowed_department_ids.filter(Boolean).map((entry) => String(entry))
      : Array.isArray(source.allowedDepartmentIds)
        ? source.allowedDepartmentIds.filter(Boolean).map((entry) => String(entry))
        : [],
    allowedDeskIds: Array.isArray(source.allowed_desk_ids)
      ? source.allowed_desk_ids.filter(Boolean).map((entry) => String(entry))
      : Array.isArray(source.allowedDeskIds)
        ? source.allowedDeskIds.filter(Boolean).map((entry) => String(entry))
        : [],
    leadRoleIds: Array.isArray(source.lead_role_ids)
      ? source.lead_role_ids.filter(Boolean).map((entry) => String(entry))
      : Array.isArray(source.leadRoleIds)
        ? source.leadRoleIds.filter(Boolean).map((entry) => String(entry))
        : [],
    capabilities: Array.isArray(source.capabilities) ? source.capabilities.filter(Boolean).map((entry) => String(entry)) : [],
    cvCard: {
      title: String(cvCard.title || '').trim(),
      headline: String(cvCard.headline || '').trim(),
      summary: String(cvCard.summary || '').trim(),
      evidence: Array.isArray(cvCard.evidence) ? cvCard.evidence.filter(Boolean).map((entry) => String(entry)) : [],
      controls: Array.isArray(cvCard.controls) ? cvCard.controls.filter(Boolean).map((entry) => String(entry)) : [],
      contract: {
        input: Array.isArray(cvCard.contract?.input) ? cvCard.contract.input.filter(Boolean).map((entry) => String(entry)) : [],
        output: Array.isArray(cvCard.contract?.output) ? cvCard.contract.output.filter(Boolean).map((entry) => String(entry)) : [],
      },
    },
    contract: {
      input: Array.isArray(contract.input) ? contract.input.filter(Boolean).map((entry) => String(entry)) : [],
      output: Array.isArray(contract.output) ? contract.output.filter(Boolean).map((entry) => String(entry)) : [],
    },
    hiredAt: source.hiredAt || null,
    hiredDeskId: source.hiredDeskId || null,
    contractLocked: source.contractLocked === true,
  };
}

function createDefaultTaDepartmentState() {
  return {
    hiredCandidates: [],
    updatedAt: null,
    lastGeneratedGap: null,
  };
}

function normalizeTaDepartmentState(state = {}) {
  const source = state && typeof state === 'object' ? state : {};
  return {
    hiredCandidates: Array.isArray(source.hiredCandidates)
      ? source.hiredCandidates.filter(Boolean).map((candidate) => normalizeTaCandidateCard(candidate))
      : [],
    updatedAt: source.updatedAt || null,
    lastGeneratedGap: source.lastGeneratedGap || null,
  };
}

function computeTaCoverage(hiredCandidates = []) {
  return TA_COVERAGE_REQUIREMENTS.map((requirement) => {
    const matches = hiredCandidates.filter((candidate) => candidate.hiredDeskId === requirement.deskId
      || candidate.deskTargets.includes(requirement.deskId));
    const hiredCount = matches.length;
    const covered = hiredCount >= requirement.minimum;
    return {
      ...requirement,
      hiredCount,
      covered,
      status: covered ? 'covered' : 'open',
      remaining: Math.max(0, requirement.minimum - hiredCount),
      roledIn: matches.map((candidate) => candidate.name),
    };
  });
}

async function buildTaDepartmentPayload(state = createDefaultTaDepartmentState()) {
  const normalizedState = normalizeTaDepartmentState(state);
  const staffingRules = await loadStaffingRulesModule();
  const canonicalLayout = normalizeStudioLayoutSchema(createDefaultStudioLayoutSchema());
  const canonicalOrganization = canonicalLayout.organization || {};
  const canonicalDeskToDepartment = Object.fromEntries(
    Object.values(canonicalOrganization.desks || {}).map((desk) => [desk.id, desk.ownerDepartmentId || desk.departmentId || null]),
  );
  const canonicalDepartmentLabels = Object.fromEntries(
    Object.values(canonicalOrganization.departments || {}).map((department) => [department.id, department.label || department.id]),
  );
  const gapModel = staffingRules.computeTaGapModel(staffingRules.STAFFING_RULES, normalizedState.hiredCandidates);
  const coverage = gapModel.coverage || [];
  const healthyCount = coverage.filter((entry) => entry.health === 'healthy').length;
  const openEntityCount = coverage.length - healthyCount;
  const summary = gapModel.summary || {
    openRoleCount: 0,
    blockerCount: 0,
    missingLeadCount: 0,
    understaffedCount: 0,
    optionalHireCount: 0,
    urgency: 'low',
  };
  const urgencyText = summary.urgency === 'critical'
    ? 'Critical'
    : summary.urgency === 'high'
      ? 'High'
      : summary.urgency === 'medium'
        ? 'Medium'
        : 'Low';
  return {
    department: {
      name: 'Talent Acquisition',
      summary: summary.openRoleCount
        ? `${summary.openRoleCount} open role${summary.openRoleCount === 1 ? '' : 's'} across ${coverage.length} staffing rules. ${summary.blockerCount} blocker${summary.blockerCount === 1 ? '' : 's'}; urgency ${urgencyText.toLowerCase()}.`
        : `All ${coverage.length} staffing rules are covered.`,
      urgency: summary.urgency,
      controls: [
        'Model binding is immutable after hire.',
        'No fallback model path is permitted.',
        'Each hire must include a CV card and contract.',
      ],
      updatedAt: normalizedState.updatedAt,
      lastGeneratedGap: normalizedState.lastGeneratedGap,
    },
    coverage,
    gapModel,
    hiredCandidates: normalizedState.hiredCandidates,
    roster: normalizedState.hiredCandidates.map((candidate) => ({
      deskId: candidate.hiredDeskId || candidate.primaryDeskTarget,
      departmentId: candidate.departmentId || canonicalDeskToDepartment[candidate.hiredDeskId || candidate.primaryDeskTarget] || null,
      id: candidate.id,
      name: candidate.name,
      role: candidate.role,
      roleId: candidate.roleId || null,
      department: candidate.department
        || canonicalDepartmentLabels[candidate.departmentId || canonicalDeskToDepartment[candidate.hiredDeskId || candidate.primaryDeskTarget]]
        || null,
      assignedModel: candidate.assignedModel,
      hiredAt: candidate.hiredAt,
      summary: candidate.cvCard?.summary || candidate.summary,
    })),
    coverageSummary: {
      healthyCount,
      openEntityCount,
      total: coverage.length,
      openRoleCount: summary.openRoleCount,
      blockerCount: summary.blockerCount,
      missingLeadCount: summary.missingLeadCount,
      understaffedCount: summary.understaffedCount,
      optionalHireCount: summary.optionalHireCount,
      urgency: summary.urgency,
    },
    organization: canonicalOrganization,
  };
}

function listModuleManifests() {
  const root = path.join(ROOT, 'modules');
  if (!fs.existsSync(root)) return [];
  const manifests = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    entries.forEach((entry) => {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        return;
      }
      if (!entry.isFile() || !entry.name.endsWith('.module.json')) return;
      const payload = readJsonSafe(fullPath, null);
      if (!payload || !payload.module_id) return;
      manifests.push({
        id: String(payload.module_id),
        version: String(payload.version || 'unknown'),
        summary: payload.description || payload.summary || payload.name || payload.module_id,
        manifestPath: path.relative(ROOT, fullPath),
      });
    });
  }
  return manifests.sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeLifecycleStatus(rawStatus = '') {
  const value = String(rawStatus || '').toLowerCase();
  if (!value) return 'queued';
  if (value === 'done' || value === 'complete' || value === 'completed' || value === 'success') return 'done';
  if (value === 'failed' || value === 'error' || value.includes('fail')) return 'failed';
  if (value === 'blocked') return 'blocked';
  if (['running', 'active', 'in_progress', 'in-progress', 'building', 'applying', 'deploying', 'verifying'].includes(value)) return 'in_progress';
  return 'queued';
}

function deriveTaskProgress(task = {}) {
  const status = normalizeLifecycleStatus(task.status);
  if (status === 'done') return { label: '100%', value: 100 };
  if (status === 'queued') return { label: '0%', value: 0 };
  if (status === 'failed') return { label: 'failed', value: null };
  if (status === 'blocked') return { label: 'blocked', value: null };
  if (Number.isFinite(Number(task.stageProgress))) {
    const pct = Math.max(1, Math.min(99, Math.round(Number(task.stageProgress))));
    return { label: `${pct}%`, value: pct };
  }
  if (task.stageName) return { label: String(task.stageName), value: null };
  return { label: 'in progress', value: null };
}

function collectDeskTasks(workspace, deskId) {
  const orchestratorDesk = workspace?.studio?.orchestrator?.desks?.[deskId];
  const deskWorkItems = (orchestratorDesk?.workItems || []).map((item) => ({
    id: item.id,
    title: item.title || item.kind || item.id,
    status: item.status || orchestratorDesk?.localState || 'queued',
    stageName: item.kind || null,
    source: 'orchestrator',
    artifactRefs: item.artifactRefs || [],
  }));

  const boardCards = normalizeTeamBoardState(workspace).cards
    .filter((card) => TEAM_BOARD_DESK_TO_STUDIO_DESK[card.desk] === deskId)
    .map((card) => ({
      id: card.id,
      title: card.title || card.id,
      status: card.status || card.state || 'queued',
      stageName: card.state || null,
      stageProgress: Number.isFinite(Number(card.phaseTicks)) ? Number(card.phaseTicks) : null,
      source: 'team-board',
      artifactRefs: card.artifactRefs || [],
    }));

  const deduped = new Map();
  [...deskWorkItems, ...boardCards].forEach((task) => {
    if (!task?.id) return;
    deduped.set(task.id, task);
  });
  return Array.from(deduped.values()).map((task) => {
    const lifecycle = normalizeLifecycleStatus(task.status);
    return {
      ...task,
      lifecycle,
      progress: deriveTaskProgress({ ...task, status: lifecycle }),
    };
  });
}

function collectDeskReports(workspace, deskId) {
  const taskReports = collectDeskTasks(workspace, deskId)
    .filter((task) => task.source === 'team-board')
    .map((task) => ({
      id: `task-${task.id}`,
      type: 'task-verification',
      name: task.title,
      verdict: task.lifecycle === 'done' ? 'pass' : (task.lifecycle === 'failed' || task.lifecycle === 'blocked' ? 'fail' : 'pending'),
      source: 'team-board',
      detail: task.progress?.label || task.lifecycle,
    }));
  const qaReports = listQARuns(ROOT)
    .map((run) => summarizeQARun(run))
    .filter((run) => !run.linked || !run.linked.deskId || run.linked.deskId === deskId)
    .map((run) => ({
      id: run.id,
      type: 'qa-run',
      name: run.scenario || run.id,
      verdict: run.verdict || run.status || 'unknown',
      source: 'qa-runner',
      detail: run.summary || run.trigger || '',
    }));
  const manual = normalizeDeskPropertiesState(workspace)?.[deskId]?.manualTests || [];
  const manualReports = manual.map((entry) => ({
    id: `manual-${entry.id}`,
    type: 'manual-test',
    name: entry.id,
    verdict: entry.verdict,
    source: 'desk-properties',
    detail: entry.notes || '',
    createdAt: entry.createdAt,
  }));
  return [...taskReports, ...qaReports, ...manualReports];
}

const QA_SUITE_ORDER = ['planner', 'runner', 'ui', 'ta'];

function formatQASuiteLabel(suiteId) {
  const normalized = String(suiteId || '').trim();
  if (!normalized) return 'QA Suite';
  const title = normalized.length <= 3
    ? normalized.toUpperCase()
    : normalized.charAt(0).toUpperCase() + normalized.slice(1);
  return `${title} QA`;
}

function listRunnableQASuites() {
  const dir = path.join(ROOT, 'qa', 'desks');
  if (!fs.existsSync(dir)) return [];
  const suiteOrder = new Map(QA_SUITE_ORDER.map((suiteId, index) => [suiteId, index]));
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /QA\.js$/i.test(entry.name))
    .map((entry) => {
      const id = String(entry.name).replace(/QA\.js$/i, '').toLowerCase();
      return {
        id,
        name: formatQASuiteLabel(id),
        file: path.relative(ROOT, path.join(dir, entry.name)).replace(/\\/g, '/'),
      };
    })
    .sort((left, right) => {
      const leftIndex = suiteOrder.has(left.id) ? suiteOrder.get(left.id) : Number.MAX_SAFE_INTEGER;
      const rightIndex = suiteOrder.has(right.id) ? suiteOrder.get(right.id) : Number.MAX_SAFE_INTEGER;
      if (leftIndex !== rightIndex) return leftIndex - rightIndex;
      return left.name.localeCompare(right.name);
    });
}

function collectStructuredQAScorecards(qaReport = null) {
  const cards = [];
  for (const desk of qaReport?.desks || []) {
    for (const test of desk?.tests || []) {
      if (!test?.qualityCard) continue;
      cards.push({
        ...test.qualityCard,
        desk: test.qualityCard.desk || desk.desk || null,
        status: test.status || test.qualityCard.status || 'pass',
        testId: test.qualityCard.testId || test.name || null,
        testName: test.qualityCard.testName || test.name || 'Unnamed QA test',
      });
    }
  }
  return cards;
}

function buildStructuredQASummary(qaReport = null) {
  const desks = Array.isArray(qaReport?.desks) ? qaReport.desks : [];
  return {
    status: qaReport?.status || 'idle',
    summary: qaReport?.summary || '',
    deskCount: desks.length,
    testCount: desks.reduce((total, desk) => total + (Array.isArray(desk?.tests) ? desk.tests.length : 0), 0),
    startedAt: qaReport?.startedAt || null,
    finishedAt: qaReport?.finishedAt || null,
    durationMs: Number.isFinite(Number(qaReport?.durationMs)) ? Number(qaReport.durationMs) : null,
  };
}

function listInteractiveBrowserRuns(rootPath = ROOT) {
  return listQARuns(rootPath).filter((run) => String(run?.trigger || '').toLowerCase() !== 'guardrail');
}

function findLatestStudioBootGuardrailRun(rootPath = ROOT) {
  return listQARuns(rootPath).find((run) => (
    String(run?.trigger || '').toLowerCase() === 'guardrail'
    && String(run?.scenario || '').toLowerCase() === 'studio-smoke'
  )) || null;
}

function summarizeGuardrailRun(run = null) {
  const summary = summarizeQARun(run);
  if (!summary) return null;
  const consoleErrors = Array.isArray(run?.console)
    ? run.console.filter((entry) => entry.type === 'error' || entry.type === 'pageerror')
    : [];
  const networkFailures = Array.isArray(run?.network) ? run.network : [];
  return {
    ...summary,
    source: 'studio-boot-guardrail',
    consoleErrorCount: consoleErrors.length,
    networkFailureCount: networkFailures.length,
    failedSteps: (run?.steps || [])
      .filter((step) => !['pass', 'pending'].includes(String(step?.verdict || 'pending')))
      .map((step) => ({
        id: step.id,
        label: step.label,
        verdict: step.verdict || step.status || 'unknown',
      })),
  };
}

function buildLocalGatePayload(rootPath = ROOT) {
  return {
    unit: readLocalGateReport(rootPath, 'test-unit-latest'),
    studioBoot: summarizeGuardrailRun(findLatestStudioBootGuardrailRun(rootPath)),
  };
}

function buildQAStatePayload(rootPath = ROOT) {
  const structuredReport = readStructuredQAReport(rootPath, 'latest');
  const interactiveRuns = listInteractiveBrowserRuns(rootPath);
  return {
    structuredReport,
    structuredBusy: false,
    latestBrowserRun: summarizeQARun(interactiveRuns[0] || null),
    browserRuns: interactiveRuns.slice(0, 8).map((run) => summarizeQARun(run)),
    browserBusy: false,
    localGate: buildLocalGatePayload(rootPath),
  };
}

function safeModeArtifactDir(rootPath = ROOT) {
  return path.join(rootPath || ROOT, 'brain', 'context', 'safe_mode');
}

function writeSafeModeArtifact(rootPath = ROOT, fileName = 'status.json', payload = {}) {
  const dir = safeModeArtifactDir(rootPath);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  writeJson(filePath, payload);
  return {
    path: relativeToRoot(rootPath || ROOT, filePath),
    absolutePath: filePath,
  };
}

function normalizeSafeModeErrorEntry(entry = {}, fallback = {}) {
  const message = String(entry.message || entry.summary || entry.error || fallback.message || '').trim();
  return {
    source: String(entry.source || fallback.source || 'unknown').trim() || 'unknown',
    severity: String(entry.severity || fallback.severity || 'warning').trim() || 'warning',
    message: message || 'Unknown safe-mode issue.',
    failureKey: String(entry.failureKey || fallback.failureKey || '').trim() || null,
    stage: String(entry.stage || fallback.stage || '').trim() || null,
    agent_id: String(entry.agent_id || fallback.agent_id || '').trim() || null,
    agent_version: String(entry.agent_version || fallback.agent_version || '').trim() || null,
    failureClass: String(entry.failureClass || entry.failure_class || fallback.failureClass || fallback.failure_class || '').trim() || null,
    uiResponse: entry.uiResponse || entry.ui_response || fallback.uiResponse || fallback.ui_response || null,
    stack: String(entry.stack || fallback.stack || '').trim() || null,
    count: Number(entry.count ?? fallback.count ?? 0) || 0,
    lastSeen: String(entry.lastSeen || fallback.lastSeen || '').trim() || null,
    findingCount: Number(entry.findingCount ?? fallback.findingCount ?? 0) || 0,
    runId: String(entry.runId || fallback.runId || '').trim() || null,
    scenario: String(entry.scenario || fallback.scenario || '').trim() || null,
  };
}

function uniqueSafeModeStrings(values = []) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function collectSafeModeFailingTestNames({
  localGate = null,
  latestRun = null,
  qaState = null,
} = {}) {
  const names = [];
  const unitFailures = Array.isArray(localGate?.unit?.failures) ? localGate.unit.failures : [];
  unitFailures.forEach((failure) => {
    const name = String(failure?.name || failure?.testName || failure?.id || failure?.label || failure?.error || '').trim();
    if (name) names.push(name);
  });
  if (Number(localGate?.unit?.failedCount || 0) > 0 && String(localGate?.unit?.summary || '').trim()) {
    names.push(String(localGate.unit.summary).trim());
  }
  const studioBootFailures = Array.isArray(localGate?.studioBoot?.failedSteps) ? localGate.studioBoot.failedSteps : [];
  studioBootFailures.forEach((step) => {
    const label = String(step?.label || step?.id || '').trim();
    if (label) names.push(label);
  });
  const latestBrowserRun = latestRun || qaState?.latestBrowserRun || null;
  if (latestBrowserRun) {
    (latestBrowserRun.failedSteps || []).forEach((step) => {
      const label = String(step?.label || step?.id || '').trim();
      if (label) names.push(label);
    });
    (Array.isArray(latestBrowserRun.steps) ? latestBrowserRun.steps : [])
      .filter((step) => ['failed', 'blocked'].includes(String(step?.verdict || step?.status || '').toLowerCase()))
      .forEach((step) => {
        const label = String(step?.label || step?.id || '').trim();
        if (label) names.push(label);
      });
    if (latestBrowserRun.error) {
      names.push(String(latestBrowserRun.error).trim());
    }
    (Array.isArray(latestBrowserRun.findings) ? latestBrowserRun.findings : [])
      .filter((finding) => String(finding?.severity || '').toLowerCase() === 'error')
      .forEach((finding) => {
        const label = String(finding?.summary || finding?.id || '').trim();
        if (label) names.push(label);
      });
  }
  return uniqueSafeModeStrings(names).slice(0, 12);
}

function collectSafeModeCriticalErrors({
  healthSnapshot = null,
  failureHistory = null,
  latestRun = null,
  localGate = null,
} = {}) {
  const errors = [];
  const bootReason = String(healthSnapshot?.bootHealth?.reason || healthSnapshot?.reason || '').trim();
  if (bootReason) {
    errors.push(normalizeSafeModeErrorEntry({
      source: 'boot-health',
      severity: 'critical',
      message: bootReason,
      failureKey: 'boot_health_gate_failed',
      stage: 'boot',
      agent_id: 'system',
      agent_version: 'boot-health.v0',
      failureClass: 'boot_critical',
      uiResponse: buildFailureUiResponse('boot_critical'),
    }));
  }

  const failureEntries = Array.isArray(failureHistory?.history?.entries) ? [...failureHistory.history.entries] : [];
  failureEntries
    .sort((left, right) => Number(right.count || 0) - Number(left.count || 0)
      || String(right.last_seen || '').localeCompare(String(left.last_seen || '')))
    .slice(0, 4)
    .forEach((entry) => {
      errors.push(normalizeSafeModeErrorEntry({
        source: 'failure-memory',
        severity: Number(entry.count || 0) >= 3 ? 'critical' : 'warning',
        message: entry.failure_key,
      failureKey: entry.failure_key,
      stage: entry.stage || null,
      agent_id: entry.agent_id || null,
      agent_version: entry.agent_version || null,
      stack: entry.last_error?.stack || null,
      failureClass: entry.failure_class || null,
      uiResponse: entry.last_error?.ui_response || buildFailureUiResponse(entry.failure_class || 'warning'),
      count: entry.count || 0,
      lastSeen: entry.last_seen || null,
    }));
    });

  if (latestRun?.verdict === 'failed') {
    errors.push(normalizeSafeModeErrorEntry({
      source: 'qa-run',
      severity: 'critical',
      message: latestRun.error || `Latest QA run failed: ${latestRun.scenario || latestRun.id || 'unknown run'}`,
      runId: latestRun.id || null,
      scenario: latestRun.scenario || null,
      findingCount: latestRun.findingCount || 0,
      failureKey: 'latest_qa_run_failed',
      failureClass: 'runtime_critical',
      uiResponse: buildFailureUiResponse('runtime_critical'),
    }));
  } else if (latestRun?.highestSeverity === 'error') {
    errors.push(normalizeSafeModeErrorEntry({
      source: 'qa-run',
      severity: 'critical',
      message: `Latest QA run surfaced ${latestRun.findingCount || 0} findings.`,
      runId: latestRun.id || null,
      scenario: latestRun.scenario || null,
      findingCount: latestRun.findingCount || 0,
      failureKey: 'latest_qa_run_error_findings',
      failureClass: 'runtime_critical',
      uiResponse: buildFailureUiResponse('runtime_critical'),
    }));
  }

  const failedCount = Number(localGate?.unit?.failedCount || 0);
  if (failedCount > 0) {
    const unitFailures = Array.isArray(localGate?.unit?.failures) ? localGate.unit.failures : [];
    errors.push(normalizeSafeModeErrorEntry({
      source: 'unit-qa',
      severity: 'critical',
      message: String(localGate?.unit?.summary || `${failedCount} unit checks failed.`).trim(),
      failureKey: 'unit_qa_failed',
      count: failedCount,
      stage: 'qa',
      findingCount: failedCount,
      failureClass: 'panel_degraded',
      uiResponse: buildFailureUiResponse('panel_degraded'),
    }));
    unitFailures.slice(0, 4).forEach((failure) => {
      const name = String(failure?.name || failure?.testName || failure?.id || failure?.label || '').trim();
      if (!name) return;
      errors.push(normalizeSafeModeErrorEntry({
        source: 'unit-qa',
        severity: 'warning',
        message: name,
        failureKey: normalizeFailureKey(name, { stage: 'qa', tool: 'unit-test' }),
        stage: 'qa',
        findingCount: 1,
        failureClass: 'warning',
        uiResponse: buildFailureUiResponse('warning'),
      }));
    });
  }

  const deduped = new Map();
  errors.forEach((entry) => {
    const signature = `${entry.source}:${entry.message}`;
    if (!deduped.has(signature)) deduped.set(signature, entry);
  });
  return Array.from(deduped.values()).slice(0, 8);
}

function buildSafeModeSnapshot(rootPath = ROOT, overrides = {}) {
  const healthSnapshot = overrides.healthSnapshot || getHealthSnapshot();
  const qaState = overrides.qaState || buildQAStatePayload(rootPath);
  const failureHistory = overrides.failureHistory || readFailureHistory(rootPath);
  const latestBrowserRun = overrides.latestRun || qaState.latestBrowserRun || null;
  const latestRunDetails = overrides.latestRunDetails || (latestBrowserRun?.id ? readQARun(rootPath, latestBrowserRun.id) : null);
  const localGate = overrides.localGate || qaState.localGate || buildLocalGatePayload(rootPath);
  const criticalErrors = collectSafeModeCriticalErrors({
    healthSnapshot,
    failureHistory,
    latestRun: latestRunDetails || latestBrowserRun,
    localGate,
  });
  return {
    safeMode: Boolean(healthSnapshot.safeMode || healthSnapshot.bootHealth?.safeMode),
    reason: String(healthSnapshot.bootHealth?.reason || healthSnapshot.reason || '').trim(),
    checkedAt: healthSnapshot.bootHealth?.checkedAt || null,
    bootHealth: healthSnapshot.bootHealth || null,
    health: healthSnapshot,
    criticalErrors,
    recentQaResults: Array.isArray(qaState.browserRuns) ? qaState.browserRuns.slice(0, 5) : [],
    latestQARun: latestBrowserRun,
    latestQARunDetails: latestRunDetails,
    localGate,
    failingTestNames: collectSafeModeFailingTestNames({
      localGate,
      latestRun: latestRunDetails || latestBrowserRun,
      qaState,
    }),
    failureHistory: {
      updated_at: failureHistory?.history?.updated_at || null,
      entries: Array.isArray(failureHistory?.history?.entries) ? failureHistory.history.entries.slice(0, 5) : [],
    },
  };
}

function runSafeModeDiagnosis(rootPath = ROOT, overrides = {}) {
  const snapshot = buildSafeModeSnapshot(rootPath, overrides);
  const artifact = writeSafeModeArtifact(rootPath, 'diagnosis.json', {
    version: 'ace/safe-mode.v0',
    createdAt: nowIso(),
    type: 'diagnosis',
    snapshot,
  });
  return {
    ok: true,
    message: 'Safe-mode diagnosis recorded.',
    snapshot,
    artifactRefs: [artifact.path].filter(Boolean),
  };
}

function buildSafeModeFixTaskPayload(snapshot = {}) {
  const primaryError = Array.isArray(snapshot.criticalErrors) ? snapshot.criticalErrors[0] : null;
  const primaryLabel = String(primaryError?.message || snapshot.reason || 'safe mode').trim();
  const failureKey = String(primaryError?.failureKey || normalizeFailureKey(primaryLabel, {
    stage: 'safe-mode',
    tool: 'safe-shell',
  }) || 'safe_mode_failure').trim() || 'safe_mode_failure';
  const bundle = buildConstrainedAutoFixBundle(snapshot, {
    rootPath: ROOT,
    stage: 'safe-mode',
    failureClass: primaryError?.failureClass || primaryError?.failure_class || null,
  });
  return {
    taskId: 'safe-mode',
    stage: 'safe-mode',
    action: 'constrained-fix-pass',
    status: 'pending',
    decision: 'blocked',
    source: 'safe_mode_shell',
    summary: `Constrained fix pass for ${primaryLabel}`,
    problemStatement: `Investigate the safe-mode failure: ${primaryLabel}.`,
    requestedOutcomes: [
      'Reproduce the smallest failing path',
      'Patch only the narrow broken path',
      'Keep the rest of SpatialNotebook unchanged',
    ],
    constraints: [
      'Do not redesign the UI.',
      'Do not widen scope beyond the failing path.',
      'Use existing artifacts and attribution only.',
    ],
    reasons: uniqueSafeModeStrings([
      snapshot.reason || null,
      primaryLabel,
    ]),
    failureKey,
    changedFiles: bundle.changedFiles || [],
    exampleMessages: uniqueSafeModeStrings([
      primaryLabel,
    ]),
    retryCount: 0,
    retryLimit: 1,
  };
}

function runConstrainedSafeModeFixPass(rootPath = ROOT, overrides = {}) {
  const diagnosis = buildSafeModeSnapshot(rootPath, overrides);
  const fixTask = createBoundedFixTaskArtifact(rootPath, buildSafeModeFixTaskPayload(diagnosis));
  const bundle = buildConstrainedAutoFixBundle(diagnosis, {
    rootPath,
    taskId: fixTask.entry?.taskId || 'safe-mode',
    stage: 'safe-mode',
    changedFiles: fixTask.entry?.changedFiles || [],
    artifactRefs: [fixTask.jsonPath, fixTask.markdownPath].filter(Boolean),
  });
  const autoFix = runConstrainedAutoFixExecutor(rootPath, bundle, {
    implicatedFiles: bundle.changedFiles,
    maxFiles: 2,
  });
  const artifactRefs = uniqueSafeModeStrings([
    fixTask.jsonPath || null,
    fixTask.markdownPath || null,
  ]);
  const report = writeSafeModeArtifact(rootPath, 'constrained-fix-pass.json', {
    version: 'ace/safe-mode.v0',
    createdAt: nowIso(),
    type: 'constrained-fix-pass',
    snapshot: diagnosis,
    fixTask: fixTask.entry || null,
    bundle,
    autoFix,
    artifactRefs,
  });
  return {
    ok: autoFix.ok,
    message: autoFix.reason || 'Constrained fix pass queued.',
    snapshot: diagnosis,
    fixTask: fixTask.entry || null,
    bundle,
    autoFix,
    artifactRefs: uniqueSafeModeStrings([
      ...artifactRefs,
      report.path,
    ]),
  };
}

function buildDeskPropertiesPayload(workspace, deskId, qaState = null) {
  const layout = normalizeStudioLayoutSchema(workspace?.studio?.layout || {});
  const organization = layout.organization || {};
  const deskLayout = layout.desks?.[deskId] || null;
  if (!deskLayout) {
    throw new Error(`Unknown desk id: ${deskId}`);
  }
  const departmentLayout = layout.departments.find((entry) => entry.id === deskLayout.departmentId) || null;
  const panel = buildDeskPanelMetadata(deskId, deskLayout, departmentLayout);
  const desk = workspace?.studio?.orchestrator?.desks?.[deskId] || {};
  const deskProperties = normalizeDeskPropertiesState(workspace)?.[deskId] || {
    managedAgents: [],
    moduleIds: [],
    manualTests: [],
    departmentContext: '',
    guardrails: [],
    contextSlices: [],
  };
  const modules = listModuleManifests();
  const tasks = collectDeskTasks(workspace, deskId);
  const resolvedQAState = deskId === QA_LEAD_DESK_ID ? (qaState || buildQAStatePayload()) : null;
  const structuredReport = resolvedQAState?.structuredReport || null;
  const qaScorecards = collectStructuredQAScorecards(structuredReport);
  const primaryAgentIds = mergeUnique([...(deskLayout.assignedAgentIds || []), ...(DESK_AGENT_DEFAULTS[deskId] || [])]);
  const agents = [...new Set([...primaryAgentIds, ...deskProperties.managedAgents])]
    .map((agentId) => {
      const worker = workspace?.studio?.agentWorkers?.[agentId] || null;
      const currentTask = tasks.find((task) => task.lifecycle === 'in_progress') || tasks[0] || null;
      return {
        id: agentId,
        model: worker?.model || null,
        backend: worker?.backend || null,
        status: worker?.status || desk.localState || 'idle',
        currentTask: currentTask ? {
          id: currentTask.id,
          title: currentTask.title,
          lifecycle: currentTask.lifecycle,
          progress: currentTask.progress,
        } : null,
      };
    });
  const truth = {
    department: {
      id: departmentLayout?.id || deskLayout.departmentId,
      label: departmentLayout?.label || deskLayout.departmentId,
      owner: departmentLayout?.controlCentreDeskId || layout.controlCentreDeskId,
      context: deskProperties.departmentContext || desk.currentGoal || desk.mission || departmentLayout?.summary || null,
      kind: departmentLayout?.kind || null,
    },
    workload: {
      assignedTasks: tasks.length,
      queueSize: tasks.filter((task) => task.lifecycle !== 'complete').length,
      outputs: collectDeskReports(workspace, deskId).length,
    },
    throughput: deskId === 'cto-architect'
      ? `${qaScorecards.length} scorecards / ${deskProperties.guardrails.length} guardrails`
      : (deskId === 'memory-archivist'
        ? `${deskProperties.contextSlices.length} context slices / ${collectDeskReports(workspace, deskId).length} reports`
        : `${tasks.filter((task) => task.lifecycle === 'complete').length} complete / ${tasks.filter((task) => task.lifecycle === 'in_progress').length} in progress`),
    reports: collectDeskReports(workspace, deskId).slice(0, 6),
    scorecards: deskId === QA_LEAD_DESK_ID || deskId === 'cto-architect' ? qaScorecards : [],
    assessments: deskProperties.manualTests,
    context: {
      summary: deskProperties.departmentContext || desk.currentGoal || desk.mission || null,
      slices: deskProperties.contextSlices,
    },
    guardrails: deskProperties.guardrails,
  };
  const rndExperiments = deskId === 'rnd-lead' ? loadRndExperimentRecords() : null;
  return {
    deskId,
    desk: {
      label: deskLayout.label,
      type: deskLayout.type,
      mission: desk.mission || null,
      currentGoal: desk.currentGoal || null,
      localState: desk.localState || null,
      capabilities: [...(deskLayout.capabilities || [])],
      editable: Boolean(deskLayout.editable),
      assignedAgentIds: [...(deskLayout.assignedAgentIds || [])],
      departmentId: deskLayout.departmentId,
      panel,
    },
    layout: {
      controlCentreDeskId: layout.controlCentreDeskId,
      department: departmentLayout,
      desk: deskLayout,
      relationships: {
        desk: organization.desks?.[deskId] || null,
        department: organization.departments?.[deskLayout.departmentId] || null,
        planner: organization.planner || null,
      },
    },
    truth,
    agents,
    tasks,
    modules: modules.map((module) => ({
      ...module,
      assigned: deskProperties.moduleIds.includes(module.id),
    })),
    reports: collectDeskReports(workspace, deskId),
    experiments: rndExperiments?.experiments || [],
    experimentContract: rndExperiments?.contract || null,
    qa: deskId === QA_LEAD_DESK_ID
      ? {
          availableTests: listRunnableQASuites(),
          structuredReport,
          structuredSummary: buildStructuredQASummary(structuredReport),
          scorecards: qaScorecards,
          latestBrowserRun: resolvedQAState?.latestBrowserRun || null,
          browserRuns: Array.isArray(resolvedQAState?.browserRuns) ? resolvedQAState.browserRuns : [],
          localGate: resolvedQAState?.localGate || { unit: null, studioBoot: null },
        }
      : undefined,
    sources: {
      tasks: ['studio.orchestrator.desks.*.workItems', 'studio.teamBoard.cards'],
      modules: ['modules/**/*.module.json'],
      reports: ['studio.teamBoard.cards.verifyStatus/applyStatus/deployStatus', 'data/spatial/qa/runs/*.json', 'studio.deskProperties.manualTests'],
      agents: ['studio.agentWorkers', 'studio.deskProperties.managedAgents'],
      ...(deskId === QA_LEAD_DESK_ID ? { qa: ['qa/desks/*.js', 'data/spatial/qa/structured/*.json', 'data/spatial/qa/local-gates/*.json', 'data/spatial/qa/*.json'] } : {}),
    },
  };
}

function getAnchorBundle() {
  return buildAnchorBundle({
    rootPath: ROOT,
    domainKey: DOMAIN_KEY,
  });
}

function getCanonicalSliceStore() {
  return readSliceStore(ROOT, DOMAIN_KEY).store;
}

function persistCanonicalSlices(store) {
  return writeSliceArtifacts(ROOT, store, DOMAIN_KEY);
}

function persistCanonicalSlicesForWorkspace(workspace) {
  const board = normalizeTeamBoardState(workspace || {});
  return persistCanonicalSlices(buildSliceStoreFromCards(board.cards));
}

function runArchivistWriteback(options = {}) {
  return applyArchivistWriteback(ROOT, {
    domainKey: DOMAIN_KEY,
    workspace: options.workspace || readSpatialWorkspace(),
    dryRun: Boolean(options.dryRun),
    includeTasks: options.includeTasks !== false,
    now: options.now,
  });
}

function projectCanonicalSlicesIntoWorkspace(workspace) {
  const sliceStore = getCanonicalSliceStore();
  if (!sliceStore.slices.length) return workspace;
  const currentStudio = workspace?.studio || {};
  const currentBoard = currentStudio.teamBoard || createDefaultTeamBoard();
  return {
    ...workspace,
    studio: {
      ...currentStudio,
      teamBoard: projectBoardFromSlices(sliceStore, currentBoard, workspace?.activePageId || null),
    },
  };
}

function loadProjectsMap() {
  const config = resolveTargetsConfig(ROOT);
  return ensureSelfProject(config.targets || {}, ROOT);
}

function normalizeProjectPath(projectPath = '') {
  const trimmed = String(projectPath || '').trim();
  if (!trimmed) return '';
  return path.isAbsolute(trimmed) ? trimmed : path.resolve(ROOT, trimmed);
}

function detectRunnableProjectType(projectKey, projectPath) {
  const resolvedPath = normalizeProjectPath(projectPath);
  if (!resolvedPath || !fs.existsSync(path.join(resolvedPath, 'index.html'))) {
    return null;
  }
  const normalizedKey = String(projectKey || '').trim().toLowerCase();
  const baseName = path.basename(resolvedPath).toLowerCase();
  if (normalizedKey === STATIC_WEB_PROJECT_KEY || baseName === STATIC_WEB_PROJECT_KEY) {
    return 'static-web';
  }
  return null;
}

function buildProjectRecord(projectKey, projectPath) {
  const resolvedPath = normalizeProjectPath(projectPath);
  const projectType = detectRunnableProjectType(projectKey, resolvedPath);
  return {
    key: projectKey,
    name: projectKey,
    path: resolvedPath,
    projectType,
    launchable: Boolean(projectType),
    supportedOrigin: projectType === 'static-web' ? STATIC_WEB_SUPPORTED_ORIGIN : null,
  };
}

function listProjectsForUi() {
  const projects = loadProjectsMap();
  return Object.entries(projects).map(([key, projectPath]) => buildProjectRecord(key, projectPath));
}

function resolveProjectRecord(projectKey) {
  const projects = loadProjectsMap();
  const normalizedKey = String(projectKey || '').trim();
  if (!normalizedKey || !projects[normalizedKey]) return null;
  return buildProjectRecord(normalizedKey, projects[normalizedKey]);
}

function commandAvailable(command, probeArgs = ['--version']) {
  return spawnSyncSafe(command, probeArgs, ROOT).code === 0;
}

function resolveStaticWebLaunchCommand(port) {
  const portValue = String(port);
  const candidates = process.platform === 'win32'
    ? [
        { command: 'py', probeArgs: ['-3', '--version'], args: ['-3', '-m', 'http.server', portValue] },
        { command: 'python', probeArgs: ['--version'], args: ['-m', 'http.server', portValue] },
        { command: 'python3', probeArgs: ['--version'], args: ['-m', 'http.server', portValue] },
      ]
    : [
        { command: 'python3', probeArgs: ['--version'], args: ['-m', 'http.server', portValue] },
        { command: 'python', probeArgs: ['--version'], args: ['-m', 'http.server', portValue] },
      ];
  const selected = candidates.find((candidate) => commandAvailable(candidate.command, candidate.probeArgs));
  if (!selected) {
    throw new Error('No Python runtime is available to launch static web projects.');
  }
  return {
    command: selected.command,
    args: selected.args,
    commandLine: [selected.command, ...selected.args].join(' '),
  };
}

function checkPortAvailable(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref?.();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

function waitForPortOpen(port, { host = STATIC_WEB_HOST, timeoutMs = PROJECT_RUN_START_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const attempt = () => {
      const socket = net.connect({ host, port });
      socket.once('connect', () => {
        socket.end();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() >= deadline) {
          reject(new Error(`Project server did not start on port ${port}.`));
          return;
        }
        const timer = setTimeout(attempt, 120);
        timer.unref?.();
      });
    };
    attempt();
  });
}

function normalizeStaticWebOrigin(origin = STATIC_WEB_SUPPORTED_ORIGIN) {
  const value = String(origin || '').trim() || STATIC_WEB_SUPPORTED_ORIGIN;
  return value.endsWith('/') ? value : `${value}/`;
}

function displayProjectUrlPath(targetUrl = '') {
  try {
    return new URL(targetUrl).pathname || '/';
  } catch (error) {
    return String(targetUrl || '');
  }
}

function normalizeTextResponse(targetUrl, response) {
  if (typeof response === 'string') {
    return {
      url: targetUrl,
      status: 200,
      body: response,
    };
  }
  return {
    url: String(response?.url || targetUrl),
    status: Number(response?.status ?? response?.statusCode ?? 0),
    body: String(response?.body ?? response?.text ?? ''),
  };
}

function requestTextFromUrl(targetUrl, { timeoutMs = PROJECT_RUN_START_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(targetUrl);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    const request = client.get(parsedUrl, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => {
        resolve({
          url: targetUrl,
          status: Number(response.statusCode || 0),
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    request.once('error', (error) => reject(error));
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Timed out fetching ${targetUrl}.`));
    });
  });
}

function parseDirectNamedImports(source = '') {
  const imports = [];
  const importPattern = /import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]/g;
  let match = importPattern.exec(source);
  while (match) {
    const specifier = String(match[2] || '').trim();
    if (specifier.startsWith('.')) {
      const symbols = String(match[1] || '')
        .split(',')
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .map((item) => item.split(/\s+as\s+/i)[0]?.trim())
        .filter(Boolean);
      if (symbols.length) {
        imports.push({ specifier, symbols });
      }
    }
    match = importPattern.exec(source);
  }
  return imports;
}

function parseNamedExports(source = '') {
  const exportedNames = new Set();
  const functionPattern = /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g;
  const classPattern = /export\s+class\s+([A-Za-z_$][\w$]*)/g;
  const valuePattern = /export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g;
  const exportListPattern = /export\s*\{([\s\S]*?)\}(?:\s*from\s*['"][^'"]+['"])?/g;

  [functionPattern, classPattern, valuePattern].forEach((pattern) => {
    let match = pattern.exec(source);
    while (match) {
      exportedNames.add(String(match[1] || '').trim());
      match = pattern.exec(source);
    }
  });

  let exportListMatch = exportListPattern.exec(source);
  while (exportListMatch) {
    String(exportListMatch[1] || '')
      .split(',')
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .forEach((item) => {
        const aliasParts = item.split(/\s+as\s+/i).map((part) => part.trim()).filter(Boolean);
        const exportedName = aliasParts[1] || aliasParts[0];
        if (exportedName) exportedNames.add(exportedName);
      });
    exportListMatch = exportListPattern.exec(source);
  }

  return exportedNames;
}

async function smokeCheckStaticWebBoot({
  baseUrl = STATIC_WEB_SUPPORTED_ORIGIN,
  requestText = requestTextFromUrl,
  entryPaths = STATIC_WEB_BOOT_ENTRY_PATHS,
} = {}) {
  const supportedOrigin = normalizeStaticWebOrigin(baseUrl);
  const responseCache = new Map();
  const loadText = async (targetUrl) => {
    if (responseCache.has(targetUrl)) return responseCache.get(targetUrl);
    let response;
    try {
      response = normalizeTextResponse(targetUrl, await requestText(targetUrl));
    } catch (error) {
      throw new Error(`Failed to fetch ${displayProjectUrlPath(targetUrl)}: ${String(error.message || error)}`);
    }
    responseCache.set(targetUrl, response);
    return response;
  };

  const shellCandidates = [
    new URL('/', supportedOrigin).toString(),
    new URL('/index.html', supportedOrigin).toString(),
  ];
  const shellErrors = [];
  let shellResponse = null;
  for (const candidateUrl of shellCandidates) {
    const response = await loadText(candidateUrl);
    if (response.status === 200 && response.body.includes(STATIC_WEB_SHELL_MARKER)) {
      shellResponse = response;
      break;
    }
    shellErrors.push(`${displayProjectUrlPath(candidateUrl)} returned ${response.status || 'no status'} without the ${STATIC_WEB_SHELL_MARKER} shell marker.`);
  }
  if (!shellResponse) {
    throw new Error(shellErrors.join(' '));
  }

  for (const entryPath of entryPaths) {
    const entryUrl = new URL(entryPath, supportedOrigin).toString();
    const entryResponse = await loadText(entryUrl);
    if (entryResponse.status !== 200) {
      throw new Error(`${displayProjectUrlPath(entryUrl)} returned ${entryResponse.status || 'no status'}.`);
    }
    const directImports = parseDirectNamedImports(entryResponse.body);
    for (const directImport of directImports) {
      const dependencyUrl = new URL(directImport.specifier, entryUrl).toString();
      const dependencyResponse = await loadText(dependencyUrl);
      if (dependencyResponse.status !== 200) {
        throw new Error(`${displayProjectUrlPath(entryUrl)} depends on ${displayProjectUrlPath(dependencyUrl)}, which returned ${dependencyResponse.status || 'no status'}.`);
      }
      const exportedNames = parseNamedExports(dependencyResponse.body);
      for (const symbol of directImport.symbols) {
        if (!exportedNames.has(symbol)) {
          throw new Error(`${displayProjectUrlPath(entryUrl)} imports "${symbol}" from ${displayProjectUrlPath(dependencyUrl)}, but that export was not found.`);
        }
      }
    }
  }

  return {
    ok: true,
    baseUrl: supportedOrigin,
    shellUrl: shellResponse.url,
    checkedEntries: entryPaths.length,
  };
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function getActiveProjectRun(projectKey) {
  const normalizedKey = String(projectKey || '').trim();
  const launch = projectRunStore.get(normalizedKey);
  if (!launch) return null;
  if (!isProcessAlive(launch.pid)) {
    projectRunStore.delete(normalizedKey);
    return null;
  }
  return {
    ...launch,
    reused: true,
  };
}

async function launchProject(projectKey, options = {}) {
  const project = resolveProjectRecord(projectKey);
  if (!project) {
    throw new Error(`Unknown project: ${String(projectKey || '').trim() || '(missing)'}`);
  }
  if (project.projectType !== 'static-web') {
    throw new Error('Only the topdown-slice static web prototype is launchable in this slice.');
  }

  const supportedOrigin = normalizeStaticWebOrigin(project.supportedOrigin || STATIC_WEB_SUPPORTED_ORIGIN);
  const smokeCheck = options.smokeCheck || smokeCheckStaticWebBoot;
  const checkPort = options.checkPortAvailable || checkPortAvailable;
  const spawnChild = options.spawnChild || ((command, args, spawnOptions) => spawn(command, args, spawnOptions));
  const waitForPort = options.waitForPortOpen || waitForPortOpen;
  const killProcess = options.killProcess || ((pid) => process.kill(pid));
  const resolveLaunchCommand = options.resolveLaunchCommand || resolveStaticWebLaunchCommand;

  const existing = getActiveProjectRun(project.key);
  if (existing) {
    if (existing.port !== STATIC_WEB_DEFAULT_PORT) {
      projectRunStore.delete(project.key);
    } else {
      try {
        await smokeCheck({
          baseUrl: supportedOrigin,
          requestText: options.requestText,
        });
      } catch (error) {
        projectRunStore.delete(project.key);
        throw new Error(`Tracked ACE launch for ${project.key} on ${supportedOrigin} failed the boot smoke check: ${String(error.message || error)}`);
      }
      return {
        ...existing,
        url: supportedOrigin,
        supportedOrigin,
        project,
      };
    }
  }

  const portIsAvailable = await checkPort(STATIC_WEB_DEFAULT_PORT, STATIC_WEB_HOST);
  if (!portIsAvailable) {
    try {
      await smokeCheck({
        baseUrl: supportedOrigin,
        requestText: options.requestText,
      });
    } catch (error) {
      throw new Error(`${project.key} requires ${supportedOrigin}, but the service currently bound there did not pass the boot smoke check: ${String(error.message || error)}`);
    }
    return {
      projectKey: project.key,
      projectPath: project.path,
      projectType: project.projectType,
      pid: null,
      port: STATIC_WEB_DEFAULT_PORT,
      url: supportedOrigin,
      supportedOrigin,
      command: 'external static web server',
      launchedAt: null,
      project,
      reused: true,
    };
  }

  const launchCommand = resolveLaunchCommand(STATIC_WEB_DEFAULT_PORT);
  const child = spawnChild(launchCommand.command, launchCommand.args, {
    cwd: project.path,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });

  try {
    await waitForPort(STATIC_WEB_DEFAULT_PORT, { host: STATIC_WEB_HOST });
    await smokeCheck({
      baseUrl: supportedOrigin,
      requestText: options.requestText,
    });
  } catch (error) {
    try {
      killProcess(child.pid);
    } catch (killError) {
      // Child may have already exited; nothing else to do here.
    }
    throw error;
  }

  child.unref();

  const launch = {
    projectKey: project.key,
    projectPath: project.path,
    projectType: project.projectType,
    pid: child.pid,
    port: STATIC_WEB_DEFAULT_PORT,
    url: supportedOrigin,
    supportedOrigin,
    command: launchCommand.commandLine,
    launchedAt: nowIso(),
  };
  projectRunStore.set(project.key, launch);
  return { ...launch, project, reused: false };
}

function stopProjectRun(projectKey, options = {}) {
  const normalizedKey = String(projectKey || '').trim();
  const launch = projectRunStore.get(normalizedKey);
  if (!launch) return false;
  projectRunStore.delete(normalizedKey);
  if (!Number.isInteger(launch.pid) || launch.pid <= 0) return false;
  try {
    const killProcess = options.killProcess || ((pid) => process.kill(pid));
    killProcess(launch.pid);
    return true;
  } catch (error) {
    return error.code === 'ESRCH';
  }
}

function getDashboardStateSnapshot() {
  return getAnchorBundle().managerSummary || {};
}

function getRunsSnapshot() {
  return runOrder.slice().reverse().map((id) => {
    const r = runStore.get(id);
    return r ? {
      runId: r.runId,
      action: r.action,
      status: r.status,
      exitCode: r.exitCode,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      durationMs: r.durationMs,
      payload: r.payload,
      logs: r.logs,
      artifacts: r.artifacts,
      meta: r.meta,
    } : null;
  }).filter(Boolean);
}

function defaultSpatialWorkspace() {
  return {
    graph: { nodes: [], edges: [] },
    graphs: {
      system: { nodes: [], edges: [] },
      world: { nodes: [], edges: [] },
    },
    sketches: [],
    annotations: [],
    architectureMemory: {},
    agentComments: {},
    intentState: { latest: null, contextReport: null, byNode: {}, reports: [] },
    pages: [],
    activePageId: null,
    rsg: createDefaultRsgState(),
    mutationGate: createDefaultMutationGateState(),
    studio: {
      handoffs: {},
      agentWorkers: createDefaultAgentWorkersState(),
      layout: createDefaultStudioLayoutSchema(),
      deskProperties: normalizeDeskPropertiesState({}),
      selfUpgrade: createDefaultSelfUpgradeState({ serverStartedAt: SERVER_STARTED_AT, pid: process.pid }),
    },
  };
}

function getSelfUpgradeState(workspace) {
  return normalizeSelfUpgradeState(workspace?.studio?.selfUpgrade, {
    serverStartedAt: SERVER_STARTED_AT,
    pid: process.pid,
  });
}

function normalizeSpatialWorkspaceShape(workspace = {}) {
  const baseWorkspace = {
    ...defaultSpatialWorkspace(),
    ...(workspace || {}),
  };
  const graphs = normalizeGraphBundle(baseWorkspace);
  const normalizedWorkspace = {
    ...baseWorkspace,
    graph: graphs.system,
    graphs,
    studio: {
      ...(baseWorkspace.studio || {}),
      handoffs: { ...((baseWorkspace.studio || {}).handoffs || {}) },
      agentWorkers: normalizeAgentWorkersState(baseWorkspace?.studio?.agentWorkers),
      layout: normalizeStudioLayoutSchema(baseWorkspace?.studio?.layout || {}),
      deskProperties: normalizeDeskPropertiesState(baseWorkspace),
      selfUpgrade: getSelfUpgradeState(baseWorkspace),
    },
  };
  return {
    ...normalizedWorkspace,
    rsg: buildRsgState(normalizedWorkspace),
    mutationGate: normalizeMutationGateState(normalizedWorkspace.mutationGate),
  };
}

function updateSpatialWorkspace(mutator) {
  ensureSpatialStorage();
  const workspace = normalizeSpatialWorkspaceShape(readJsonSafe(SPATIAL_WORKSPACE_FILE, defaultSpatialWorkspace()) || defaultSpatialWorkspace());
  const nextWorkspace = normalizeSpatialWorkspaceShape(mutator(workspace) || workspace);
  return persistSpatialWorkspace(nextWorkspace);
}

function persistWorkspacePatch(patcher) {
  ensureSpatialStorage();
  const workspace = normalizeSpatialWorkspaceShape(readJsonSafe(SPATIAL_WORKSPACE_FILE, defaultSpatialWorkspace()) || defaultSpatialWorkspace());
  const nextWorkspace = normalizeSpatialWorkspaceShape(patcher(workspace) || workspace);
  return persistSpatialWorkspace(nextWorkspace);
}

function updateSelfUpgradeState(mutator) {
  return updateSpatialWorkspace((workspace) => ({
    ...workspace,
    studio: {
      ...(workspace.studio || {}),
      selfUpgrade: mutator(getSelfUpgradeState(workspace), workspace),
    },
  }));
}

function persistSpatialWorkspace(nextWorkspace) {
  ensureSpatialStorage();
  const advancedWorkspace = advanceOrchestratorWorkspace(normalizeSpatialWorkspaceShape(nextWorkspace), {
    dashboardState: getDashboardStateSnapshot(),
    runs: getRunsSnapshot(),
  });
  persistCanonicalSlicesForWorkspace(advancedWorkspace);
  writeJson(SPATIAL_WORKSPACE_FILE, advancedWorkspace);
  return advancedWorkspace;
}

function createRunnerTaskFolder({ title, prompt, handoff = null, sessionId = null, anchorRefs = [], tasksDir = TASKS_DIR, rootPath = ROOT }) {
  fs.mkdirSync(tasksDir, { recursive: true });
  const safeTitle = slugify(title || prompt);
  const lastId = (tasksDir === TASKS_DIR ? getTaskFolders() : getTaskFoldersFromRoot(tasksDir)).reduce((highest, folder) => {
    const value = Number.parseInt(String(folder || '').slice(0, 4), 10);
    return Number.isFinite(value) ? Math.max(highest, value) : highest;
  }, 0);
  const taskId = String(lastId + 1).padStart(4, '0');
  const folderName = `${taskId}-${safeTitle}`;
  const taskDir = path.join(tasksDir, folderName);
  const createdAt = nowIso();
  const artifactAttribution = buildTaskArtifactAttributionMap({
    taskId,
    taskDir: relativeToRoot(rootPath, taskDir),
    createdAt,
    updatedAt: createdAt,
    artifactNames: TASK_ARTIFACT_NAMES,
  });
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(path.join(taskDir, 'idea.txt'), `${prompt.trim()}\n`, 'utf8');
  fs.writeFileSync(path.join(taskDir, 'context.md'), [
    `# Task ${taskId}: ${title || prompt.slice(0, 60)}`,
    '',
    '## Context',
    handoff?.problemStatement || handoff?.summary || prompt.trim(),
    '',
    '## Anchor refs',
    ...((anchorRefs || []).length ? anchorRefs.map((anchorRef) => `- ${anchorRef}`) : ['- None attached']),
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(taskDir, 'plan.md'), [
    `# Task ${taskId}: ${title || prompt.slice(0, 60)}`,
    '',
    `Created: ${createdAt}`,
    '',
    renderAgentAttributionBlock(resolveArtifactAgentIdentity('plan.md'), { title: 'Plan Attribution' }),
    '',
    '## Goal',
    handoff?.summary ? `- ${handoff.summary}` : '-',
    '',
    '## MVP scope (must-haves)',
    ...(((handoff?.requestedOutcomes || handoff?.tasks) || []).length ? (handoff.requestedOutcomes || handoff.tasks).map((task) => `- ${task}`) : ['-']),
    '',
    '## Out of scope (not now)',
    '-',
    '',
    '## Acceptance criteria',
    '- [ ]',
    '',
    '## Risks / notes',
    sessionId ? `- Throughput debug session: ${sessionId}` : '-',
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(taskDir, 'patch.diff'), '', 'utf8');
  fs.writeFileSync(path.join(taskDir, 'agent_attribution.json'), `${JSON.stringify(artifactAttribution, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(taskDir, 'apply_result.json'), `${JSON.stringify({
    taskId,
    stage: 'apply',
    status: 'pending',
    ok: false,
    created_utc: createdAt,
    updated_utc: createdAt,
    taskDir: relativeToRoot(rootPath, taskDir),
    patchPath: relativeToRoot(rootPath, path.join(taskDir, 'patch.diff')),
    reuseHint: 'Keep idea.txt, context.md, plan.md, and patch.diff stable; only rerun the smallest broken stage.',
    inputs: {
      idea: 'idea.txt',
      context: 'context.md',
      plan: 'plan.md',
      patch: 'patch.diff',
    },
    outputs: {
      result: 'apply_result.json',
    },
    result: null,
    error: null,
    branch: null,
    commit: null,
    agent_id: resolveStageAgentIdentity('apply').agent_id,
    agent_version: resolveStageAgentIdentity('apply').agent_version,
    attribution: resolveStageAgentIdentity('apply'),
    artifactAttributionPath: relativeToRoot(rootPath, path.join(taskDir, 'agent_attribution.json')),
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(taskDir, 'meta.json'), `${JSON.stringify({
    id: taskId,
    title: title || prompt.slice(0, 60),
    created_utc: createdAt,
    source: sessionId ? 'throughput-debug' : 'studio-team-board',
    sessionId,
    handoffId: handoff?.id || null,
    parentTaskId: handoff?.sourceFixTaskParentTaskId || handoff?.sourceFixTaskId || null,
    sourceFixTaskId: handoff?.sourceFixTaskId || null,
    sourceFixTaskParentTaskId: handoff?.sourceFixTaskParentTaskId || null,
    sourceFixTaskQueueKey: handoff?.sourceFixTaskQueueKey || null,
    sourceFixTaskLocation: handoff?.sourceFixTaskLocation || null,
    sourceFixTaskStatus: handoff?.sourceFixTaskStatus || null,
    artifactAttributionPath: relativeToRoot(rootPath, path.join(taskDir, 'agent_attribution.json')),
    artifactAttribution,
    anchorRefs: Array.isArray(anchorRefs) ? anchorRefs.filter(Boolean) : [],
  }, null, 2)}\n`, 'utf8');
  return {
    taskId,
    folderName,
    taskDir,
  };
}

function buildTaskApplyResultRecord({
  taskId,
  taskDir,
  projectKey = null,
  patchPath,
  ok,
  status,
  result = null,
  error = null,
  branch = null,
  commit = null,
  stage = 'apply',
  policy = null,
  fixTask = null,
  sourceFixTask = null,
  rootPath = ROOT,
}) {
  const updatedUtc = nowIso();
  const attribution = resolveStageAgentIdentity(stage || 'apply');
  return {
    taskId: String(taskId || '').trim() || null,
    projectKey: String(projectKey || '').trim() || null,
    stage,
    status: status || (ok ? 'passed' : 'failed'),
    ok: Boolean(ok),
    created_utc: null,
    updated_utc: updatedUtc,
    agent_id: attribution.agent_id,
    agent_version: attribution.agent_version,
    attribution,
    taskDir: taskDir ? relativeToRoot(rootPath, taskDir) : null,
    patchPath: patchPath ? relativeToRoot(rootPath, patchPath) : null,
    reuseHint: ok
      ? 'Cache hit available. Reuse the existing plan and patch before rerunning apply.'
      : 'Cache preserved. Rerun only the smallest broken stage and keep previous plan/context intact.',
    inputs: {
      idea: 'idea.txt',
      context: 'context.md',
      plan: 'plan.md',
      patch: 'patch.diff',
    },
    outputs: {
      result: 'apply_result.json',
    },
    result,
    error: error ? String(error) : null,
    branch: branch || null,
    commit: commit || null,
    policy: policy ? {
      decision: policy.decision || null,
      reasons: policy.reasons || [],
      policy_rule_hits: policy.policy_rule_hits || [],
      retry_count: policy.retry_count ?? null,
      cache_status: policy.cache_status || null,
      fix_task_created: Boolean(policy.fix_task_created),
      fix_task_path: policy.fix_task_path || null,
    } : null,
    fixTask: fixTask ? {
      location: fixTask.location || null,
      jsonPath: relativeToRoot(rootPath, fixTask.jsonPath),
      markdownPath: relativeToRoot(rootPath, fixTask.markdownPath),
    } : null,
    sourceFixTask: sourceFixTask ? {
      taskId: sourceFixTask.taskId || null,
      parentTaskId: sourceFixTask.parentTaskId || null,
      location: sourceFixTask.location || null,
      status: sourceFixTask.status || null,
      retry_count: Number(sourceFixTask.retry_count || 0) || 0,
      retry_limit: Number(sourceFixTask.retry_limit || 0) || 0,
      queueKey: sourceFixTask.queueKey || null,
      jsonPath: sourceFixTask.jsonPath || null,
      markdownPath: sourceFixTask.markdownPath || null,
    } : null,
    artifactAttributionPath: taskDir ? relativeToRoot(rootPath, path.join(taskDir, 'agent_attribution.json')) : null,
  };
}

function writeTaskApplyResult(taskDir, payload, { recordFailure = true } = {}) {
  if (!taskDir) return null;
  const filePath = path.join(taskDir, 'apply_result.json');
  const existing = fs.existsSync(filePath) ? readJsonSafe(filePath, {}) || {} : {};
  const nextPayload = {
    ...existing,
    ...payload,
    created_utc: payload?.created_utc ?? existing.created_utc ?? nowIso(),
    updated_utc: nowIso(),
  };
  fs.writeFileSync(filePath, `${JSON.stringify(nextPayload, null, 2)}\n`, 'utf8');
  try {
    writeAgentAuditArtifacts(ROOT, buildAgentAuditRecord({
      rootPath: ROOT,
      stage: 'builder',
      taskId: nextPayload.taskId || existing.taskId || null,
      taskDir,
      sourceRecord: nextPayload,
      outcome: nextPayload.status || (nextPayload.ok ? 'passed' : 'failed'),
      pass_fail: nextPayload.ok === false || String(nextPayload.status || '').toLowerCase() === 'blocked' ? 'fail' : 'pass',
      artifactRefs: [
        path.relative(ROOT, filePath).replace(/\\/g, '/'),
        path.relative(ROOT, path.join(taskDir, 'patch.diff')).replace(/\\/g, '/'),
        path.relative(ROOT, path.join(taskDir, 'agent_attribution.json')).replace(/\\/g, '/'),
      ],
    }));
  } catch (error) {
    console.warn('[WARN] builder audit write failed:', error?.message || error);
  }
  if (recordFailure && (String(nextPayload.status || '').toLowerCase() === 'failed' || nextPayload.ok === false)) {
    try {
      recordClassifiedFailure(ROOT, new Error(nextPayload.error || nextPayload.summary || 'Apply failed.'), {
        message: nextPayload.error || nextPayload.summary || 'Apply failed.',
        tool: 'git',
        related_stage: 'apply',
        stage: 'apply',
        agentId: nextPayload.agent_id || 'executor',
        agentVersion: nextPayload.agent_version || null,
        projectKey: nextPayload.projectKey || payload?.projectKey || null,
        runId: nextPayload.runId || nextPayload.taskId || null,
        component: 'builder',
        source: 'task-apply',
      });
    } catch (error) {
      console.warn('[WARN] failure history update failed:', error?.message || error);
    }
  }
  return nextPayload;
}

async function analyzeIntentWithContextWorker(text, workspace, options = {}) {
  const currentWorkspace = normalizeSpatialWorkspaceShape(workspace || readSpatialWorkspace());
  const previousHandoff = currentWorkspace?.studio?.handoffs?.contextToPlanner || null;
  const result = await runContextManagerWorker({
    rootPath: ROOT,
    text,
    sourceNodeId: options.sourceNodeId || null,
    source: options.source || 'context-intake',
    workspace: currentWorkspace,
    anchorBundle: getAnchorBundle(),
    dashboardState: getDashboardStateSnapshot(),
    previousHandoff,
    plannerFeedback: options.plannerFeedback,
    mode: options.mode || 'manual',
    backend: options.backend || null,
    model: options.model || null,
    host: options.host || null,
    timeoutMs: Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : null,
  });
  if (!result.report) {
    throw new Error(result.reason || 'Context Manager could not produce an intent report.');
  }
  return result;
}

function resolveProjectTarget(projectKeyOrPath) {
  const projects = loadProjectsMap();
  const projectKey = String(projectKeyOrPath || '').trim();
  return {
    projectKey,
    projectPath: projects[projectKey] || projectKey,
    projects,
  };
}

function runSelfUpgradePreflight({ taskId, projectKey, projectPath, validation, patchReview }) {
  const checks = getSelfUpgradePreflightSpecs(ROOT).map((spec) => {
    const startedAt = Date.now();
    const result = spawnSyncSafe(spec.cmd, spec.args, spec.cwd);
    return {
      id: spec.id,
      label: spec.label,
      command: [spec.cmd, ...spec.args].join(' '),
      ok: result.code === 0,
      exitCode: result.code,
      durationMs: Date.now() - startedAt,
      output: summarizeCommandOutput(result.stdout || result.stderr || ''),
    };
  });
  const ok = Boolean(validation?.ok) && Boolean(patchReview?.ok) && checks.every((check) => check.ok);
  return {
    status: ok ? 'passed' : 'failed',
    ok,
    checkedAt: nowIso(),
    checks,
    summary: ok
      ? 'ACE self-upgrade preflight passed.'
      : 'ACE self-upgrade preflight found issues that block apply.',
    taskId,
    projectKey,
    validation,
    patchReview,
  };
}

function markServerHealthyOnBoot() {
  ensureSpatialStorage();
  const workspace = readJsonSafe(SPATIAL_WORKSPACE_FILE, defaultSpatialWorkspace()) || defaultSpatialWorkspace();
  const selfUpgrade = getSelfUpgradeState(workspace);
  if (!['restarting', 'queued'].includes(selfUpgrade.deploy?.status)) return;
  updateSelfUpgradeState((state) => ({
    ...state,
    status: state.apply?.ok ? 'healthy' : state.status,
    deploy: {
      ...state.deploy,
      status: 'healthy',
      restartedAt: nowIso(),
      health: {
        status: 'healthy',
        pid: process.pid,
        startedAt: SERVER_STARTED_AT,
      },
    },
    requiresPermission: 'none',
  }));
}

function scheduleSelfRestart() {
  const options = {
    cwd: __dirname,
    detached: true,
    windowsHide: true,
    stdio: 'ignore',
  };
  if (process.platform === 'win32') {
    const child = spawn('cmd', ['/c', 'ping 127.0.0.1 -n 2 >nul && node server.js'], options);
    child.unref();
  } else {
    const child = spawn('sh', ['-lc', 'sleep 1; node server.js'], options);
    child.unref();
  }
  setTimeout(() => process.exit(0), 150);
}

function refreshSpatialOrchestrator({ persist = true, workspace = null } = {}) {
  ensureSpatialStorage();
  const currentWorkspace = normalizeSpatialWorkspaceShape(syncTeamBoardWithSelfUpgrade(
    workspace || readJsonSafe(SPATIAL_WORKSPACE_FILE, defaultSpatialWorkspace()) || defaultSpatialWorkspace(),
  ));
  const nextWorkspace = advanceOrchestratorWorkspace(currentWorkspace, {
    dashboardState: getDashboardStateSnapshot(),
    runs: getRunsSnapshot(),
  });
  if (persist) {
    writeJson(SPATIAL_WORKSPACE_FILE, nextWorkspace);
  }
  return nextWorkspace;
}

function buildQADebugPayload(qaState = null) {
  const resolvedQAState = qaState || buildQAStatePayload();
  return {
    latestRun: resolvedQAState.latestBrowserRun || null,
    runs: Array.isArray(resolvedQAState.browserRuns) ? resolvedQAState.browserRuns : [],
    localGate: resolvedQAState.localGate || { unit: null, studioBoot: null },
  };
}

function buildRuntimeDrift(anchorBundle, workspace) {
  const drift = [...(anchorBundle?.drift || [])];
  const board = normalizeTeamBoardState(workspace || {});
  board.cards
    .filter((card) => ['active', 'review', 'complete'].includes(card.status) && !(card.sourceAnchorRefs || []).length)
    .forEach((card) => {
      drift.push({
        id: `unanchored-card-${card.id}`,
        severity: 'high',
        summary: `${card.title || `Card ${card.id}`} has no anchor provenance and should not advance silently.`,
        cardId: card.id,
      });
    });
  return drift;
}

function buildSpatialRuntimePayload(workspace, options = {}) {
  const anchorBundle = options.anchorBundle || getAnchorBundle();
  const drift = buildRuntimeDrift(anchorBundle, workspace);
  const qaState = options.qaState || buildQAStatePayload();
  const canonicalSlices = getCanonicalSliceStore();
  return {
    ...buildRuntimePayload(workspace),
    manager: {
      ...anchorBundle.managerSummary,
      drift_flags: drift.map((flag) => flag.id),
    },
    canonicalSlices,
    truthSources: anchorBundle.truthSources,
    drift,
    anchorRefs: anchorBundle.anchorRefs,
    throughputDebug: {
      latestSession: summarizeSession(listThroughputSessions(ROOT)[0] || null),
      sessions: listThroughputSessions(ROOT).slice(0, 8).map((session) => summarizeSession(session)),
    },
    qaState,
    qaDebug: buildQADebugPayload(qaState),
  };
}

async function refreshSpatialRuntime({ persist = true } = {}) {
  const workspace = refreshSpatialOrchestrator({ persist, workspace: await pumpAutomatedTeamBoardAsync() });
  return buildSpatialRuntimePayload(workspace);
}

function getLocalBaseUrl(req = null) {
  const host = req?.get?.('host') || req?.headers?.host || `localhost:${port}`;
  const protocol = req?.protocol || 'http';
  return `${protocol}://${host}`;
}

async function startBrowserQARun({
  baseUrl = null,
  scenario = 'layout-pass',
  mode = 'interactive',
  trigger = 'manual',
  prompt = '',
  actions = [],
  linked = {},
} = {}) {
  return runQARun({
    rootPath: ROOT,
    baseUrl: baseUrl || getLocalBaseUrl(),
    scenario,
    mode,
    trigger,
    prompt,
    actions,
    linked,
    getRuntimeSnapshot: async () => buildSpatialRuntimePayload(refreshSpatialOrchestrator({
      persist: false,
      workspace: await pumpAutomatedTeamBoardAsync(),
    })),
    getHealthSnapshot: () => getHealthSnapshot(),
  });
}

function queueAutoBrowserQARun(options = {}) {
  setTimeout(() => {
    startBrowserQARun(options).catch(() => {});
  }, 80);
}

function readDashboardFileForRoot(rootPath, relPath, domainKey = DOMAIN_KEY) {
  return readAnchorFile(rootPath, relPath, domainKey);
}

function readDashboardFile(relPath) {
  return readDashboardFileForRoot(ROOT, relPath, DOMAIN_KEY);
}

function getTaskFolders() {
  if (!fs.existsSync(TASKS_DIR)) return [];
  return fs.readdirSync(TASKS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{4}-.+/.test(d.name))
    .map((d) => d.name)
    .sort();
}

function getTaskFoldersFromRoot(tasksDir) {
  if (!tasksDir || !fs.existsSync(tasksDir)) return [];
  return fs.readdirSync(tasksDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{4}-.+/.test(d.name))
    .map((d) => d.name)
    .sort();
}

let teamBoardAutomationRunning = false;
let contextManagerWorkerAutomationRunning = false;
let plannerWorkerAutomationRunning = false;
let executorWorkerAutomationRunning = false;

function readSpatialWorkspace() {
  ensureSpatialStorage();
  const workspace = normalizeSpatialWorkspaceShape(readJsonSafe(SPATIAL_WORKSPACE_FILE, defaultSpatialWorkspace()) || defaultSpatialWorkspace());
  const pagesState = readJsonSafe(SPATIAL_PAGES_FILE, null);
  const intentState = readJsonSafe(SPATIAL_INTENT_STATE_FILE, null);
  const studioState = normalizeStoredStudioState(readJsonSafe(SPATIAL_STUDIO_STATE_FILE, null));
  const architectureState = readJsonSafe(SPATIAL_ARCHITECTURE_MEMORY_FILE, null);
  return normalizeSpatialWorkspaceShape(projectCanonicalSlicesIntoWorkspace({
    ...workspace,
    pages: Array.isArray(pagesState?.pages) ? pagesState.pages : workspace.pages,
    activePageId: pagesState && Object.prototype.hasOwnProperty.call(pagesState, 'activePageId')
      ? pagesState.activePageId
      : workspace.activePageId,
    intentState: normalizeStoredIntentState(intentState || workspace.intentState),
    architectureMemory: architectureState?.architectureMemory || architectureState || workspace.architectureMemory,
    studio: {
      ...(workspace.studio || {}),
      ...(studioState.handoffs ? { handoffs: { ...(workspace.studio?.handoffs || {}), ...studioState.handoffs } } : {}),
      ...(studioState.teamBoard ? { teamBoard: { ...(workspace.studio?.teamBoard || {}), ...studioState.teamBoard } } : {}),
    },
  }));
}

function relativeToRoot(rootPathOrTargetPath, maybeTargetPath = null) {
  const rootPath = maybeTargetPath ? rootPathOrTargetPath : ROOT;
  const targetPath = maybeTargetPath || rootPathOrTargetPath;
  if (!rootPath || !targetPath) return null;
  return path.relative(rootPath, targetPath).replace(/\\/g, '/');
}

function plannerCardSourceKey(pageId, title) {
  return `${pageId}:${slugify(title)}`;
}

function writeTargetsConfig(targets = {}) {
  fs.writeFileSync(path.join(ROOT, CANONICAL_TARGETS_FILE), `${JSON.stringify(targets, null, 2)}\n`, 'utf8');
}

function getPlannerHandoff(workspace, handoffId = null) {
  const handoff = workspace?.studio?.handoffs?.contextToPlanner || null;
  if (!handoff) return null;
  if (handoffId && handoff.id !== handoffId) return null;
  return handoff;
}

function applyAgentRuntimeState(workspace, agentId, { worker = null, handoffsPatch = {} } = {}) {
  const studio = workspace?.studio || {};
  const workers = normalizeAgentWorkersState(studio.agentWorkers);
  return normalizeSpatialWorkspaceShape({
    ...workspace,
    studio: {
      ...studio,
      handoffs: {
        ...(studio.handoffs || {}),
        ...(handoffsPatch || {}),
      },
      agentWorkers: {
        ...workers,
        [agentId]: worker ? { ...workers[agentId], ...worker } : workers[agentId],
      },
    },
  });
}

function applyPlannerRuntimeState(workspace, { worker = null, handoff = null, plannerToContext } = {}) {
  const handoffsPatch = {};
  if (handoff) handoffsPatch.contextToPlanner = handoff;
  if (plannerToContext !== undefined) handoffsPatch.plannerToContext = plannerToContext;
  return applyAgentRuntimeState(workspace, 'planner', { worker, handoffsPatch });
}

function applyExecutorRuntimeState(workspace, { worker = null } = {}) {
  return applyAgentRuntimeState(workspace, 'executor', { worker });
}

function applyContextManagerRuntimeState(workspace, { worker = null, handoff = null, plannerToContext, report = null } = {}) {
  const intentState = workspace?.intentState || { latest: null, contextReport: null, byNode: {}, reports: [] };
  const nextIntentState = report ? {
    ...intentState,
    latest: report,
    contextReport: report,
    byNode: report.nodeId
      ? {
          ...(intentState.byNode || {}),
          [report.nodeId]: report,
        }
      : { ...(intentState.byNode || {}) },
    reports: [report, ...((intentState.reports || []).filter((entry) => entry.createdAt !== report.createdAt || entry.nodeId !== report.nodeId))].slice(0, 24),
  } : intentState;
  const handoffsPatch = {};
  if (handoff !== undefined) handoffsPatch.contextToPlanner = handoff;
  if (plannerToContext !== undefined) handoffsPatch.plannerToContext = plannerToContext;
  const nextWorkspace = applyAgentRuntimeState({
    ...workspace,
    intentState: nextIntentState,
  }, 'context-manager', { worker, handoffsPatch });
  return nextWorkspace;
}

function executorTaskIdFromCard(card = {}) {
  return String(card?.runnerTaskId || card?.builderTaskId || card?.executionPackage?.taskId || '').trim() || null;
}

function markPlannerRunStarted(workspace, handoff, runId, mode) {
  const startedAt = nowIso();
  const plannerConfig = getAgentWorkerConfig(ROOT, 'planner');
  return applyPlannerRuntimeState(workspace, {
    worker: {
      status: 'running',
      statusReason: handoff?.summary
        ? `Planning anchored work for: ${handoff.summary}`
        : 'Planning anchored work from the current handoff.',
      mode,
      backend: plannerConfig.backend,
      model: plannerConfig.model,
      currentRunId: runId,
      lastSourceHandoffId: handoff?.id || null,
      lastBlockedReason: null,
      lastProducedCardIds: [],
      proposalArtifactRefs: [],
      startedAt,
      completedAt: null,
    },
    handoff: handoff ? {
      ...handoff,
      plannerStatus: 'running',
      plannerRunId: runId,
      plannerStartedAt: startedAt,
      plannerCompletedAt: null,
      plannerLastBlockedReason: null,
      plannerProducedCardIds: [],
    } : handoff,
      plannerToContext: null,
  });
}

function markContextManagerRunStarted(workspace, text, sourceNodeId, runId, mode, plannerFeedback = null) {
  const startedAt = nowIso();
  const contextConfig = getAgentWorkerConfig(ROOT, 'context-manager');
  return applyContextManagerRuntimeState(workspace, {
    worker: {
      status: 'running',
      statusReason: plannerFeedback?.detail
        ? `Refreshing context after planner feedback: ${plannerFeedback.detail}`
        : 'Refreshing context packet for planner intake.',
      mode,
      backend: contextConfig.backend,
      model: contextConfig.model,
      currentRunId: runId,
      lastSourceNodeId: sourceNodeId || null,
      lastBlockedReason: null,
      lastUsedFallback: false,
      lastPlannerFeedbackAction: plannerFeedback?.action || null,
      startedAt,
      completedAt: null,
    },
    plannerToContext: plannerFeedback || workspace?.studio?.handoffs?.plannerToContext || null,
  });
}

function applyPlannerCardsToWorkspace(workspace, handoff, plannerCards = []) {
  const notebook = normalizeNotebookState(workspace);
  const board = normalizeTeamBoardState(workspace);
  const cards = [...board.cards];
  const producedCardIds = [];
  const sourceFixTask = handoff?.sourceFixTask || null;
  const sourceFixTaskTaskId = sourceFixTask?.taskDirPath ? sourceFixTask.taskId || null : null;
  for (const plannerCard of plannerCards) {
    const sourceKey = plannerCardSourceKey(notebook.activePageId, plannerCard.title);
    const existingIndex = cards.findIndex((card) => card.sourceKey === sourceKey && card.sourceHandoffId === handoff?.id);
    if (existingIndex >= 0) {
      const existingCard = cards[existingIndex];
      cards[existingIndex] = {
        ...existingCard,
        summary: plannerCard.summary || existingCard.summary || '',
        targetProjectKey: plannerCard.targetProjectKey || existingCard.targetProjectKey || SELF_TARGET_KEY,
        sourceAnchorRefs: mergeUnique([...(existingCard.sourceAnchorRefs || []), ...(plannerCard.anchorRefs || [])]),
        sourceFixTaskId: existingCard.sourceFixTaskId || handoff?.sourceFixTaskId || null,
        sourceFixTaskParentTaskId: existingCard.sourceFixTaskParentTaskId || handoff?.sourceFixTaskParentTaskId || null,
        sourceFixTaskQueueKey: existingCard.sourceFixTaskQueueKey || handoff?.sourceFixTaskQueueKey || null,
        sourceFixTaskLocation: existingCard.sourceFixTaskLocation || handoff?.sourceFixTaskLocation || null,
        sourceFixTaskStatus: existingCard.sourceFixTaskStatus || handoff?.sourceFixTaskStatus || null,
        sourceFixTaskRetryCount: Number(existingCard.sourceFixTaskRetryCount || handoff?.sourceFixTaskRetryCount || 0) || 0,
        sourceFixTaskRetryLimit: Number(existingCard.sourceFixTaskRetryLimit || handoff?.sourceFixTaskRetryLimit || 0) || 0,
        sourceFixTask: existingCard.sourceFixTask || handoff?.sourceFixTask || null,
        builderTaskId: existingCard.builderTaskId || sourceFixTaskTaskId || null,
        runnerTaskId: existingCard.runnerTaskId || sourceFixTaskTaskId || null,
        taskFlow: existingCard.taskFlow || {
          phase: 'planned',
          assignmentState: 'unassigned',
          ownerDeskId: 'planner',
          assigneeDeskId: 'executor',
          sourceIntentId: handoff?.sourceNodeId || null,
          sourceHandoffId: handoff?.id || null,
          lastTransitionAt: handoff?.createdAt || nowIso(),
          lastTransitionLabel: 'Moved to planner board',
          history: [],
        },
        updatedAt: nowIso(),
      };
      producedCardIds.push(existingCard.id);
      continue;
    }
    const nextCard = {
      ...createTeamBoardCard({
        cards,
        pageId: notebook.activePageId,
        handoffId: handoff?.id || null,
        sourceNodeId: handoff?.sourceNodeId || null,
        sourceAnchorRefs: plannerCard.anchorRefs || handoff?.anchorRefs || [],
        title: plannerCard.title,
        createdAt: handoff?.createdAt || null,
      }),
      summary: plannerCard.summary || '',
      targetProjectKey: plannerCard.targetProjectKey || SELF_TARGET_KEY,
      sourceFixTaskId: handoff?.sourceFixTaskId || null,
      sourceFixTaskParentTaskId: handoff?.sourceFixTaskParentTaskId || null,
      sourceFixTaskQueueKey: handoff?.sourceFixTaskQueueKey || null,
      sourceFixTaskLocation: handoff?.sourceFixTaskLocation || null,
      sourceFixTaskStatus: handoff?.sourceFixTaskStatus || null,
      sourceFixTaskRetryCount: Number(handoff?.sourceFixTaskRetryCount || 0) || 0,
      sourceFixTaskRetryLimit: Number(handoff?.sourceFixTaskRetryLimit || 0) || 0,
      sourceFixTask: handoff?.sourceFixTask || null,
      builderTaskId: sourceFixTaskTaskId || null,
      runnerTaskId: sourceFixTaskTaskId || null,
    };
    cards.push(nextCard);
    producedCardIds.push(nextCard.id);
  }
  return {
    workspace: normalizeSpatialWorkspaceShape({
      ...workspace,
      studio: {
        ...(workspace.studio || {}),
        teamBoard: {
          ...board,
          cards,
          selectedCardId: board.selectedCardId || producedCardIds[0] || null,
          updatedAt: nowIso(),
        },
      },
    }),
    producedCardIds,
  };
}

function applyPlannerRunResult(workspace, handoff, result, { runId, mode }) {
  const runRecord = result?.run || null;
  const completedAt = runRecord?.completedAt || nowIso();
  const baseWorkspace = normalizeSpatialWorkspaceShape(workspace);
  const plannerConfig = getAgentWorkerConfig(ROOT, 'planner');
  if (!runRecord) {
    return applyPlannerRuntimeState(baseWorkspace, {
      worker: {
        status: 'idle',
        statusReason: 'Planner is idle.',
        currentRunId: null,
        lastOutcome: null,
        lastOutcomeAt: completedAt,
        completedAt,
      },
      handoff: handoff ? {
        ...handoff,
        plannerStatus: 'idle',
        plannerCompletedAt: completedAt,
      } : handoff,
    });
  }

  if (result.ok) {
    const plannerCards = applyPlannerCardsToWorkspace(baseWorkspace, handoff, result.cards || []);
    if (handoff?.sourceFixTaskId) {
      finalizeFixTask(ROOT, handoff.sourceFixTask, {
        status: 'consumed',
        reason: plannerCards.producedCardIds.length
          ? 'Planner produced bounded follow-up cards.'
          : 'Planner completed the intake.',
        followupTaskId: plannerCards.producedCardIds[0] || null,
        followupTaskDir: null,
      });
    }
    return applyPlannerRuntimeState(plannerCards.workspace, {
      worker: {
        status: 'idle',
        statusReason: plannerCards.producedCardIds.length
          ? `Completed planner run and produced ${plannerCards.producedCardIds.length} anchored card${plannerCards.producedCardIds.length === 1 ? '' : 's'}.`
          : 'Completed planner run.',
        mode,
        backend: plannerConfig.backend,
        model: plannerConfig.model,
        currentRunId: null,
        lastRunId: runRecord.id,
        lastOutcome: 'completed',
        lastOutcomeAt: completedAt,
        lastSourceHandoffId: handoff?.id || null,
        lastBlockedReason: null,
        lastProducedCardIds: plannerCards.producedCardIds,
        proposalArtifactRefs: result.proposalArtifactRefs || [],
        completedAt,
      },
      handoff: handoff ? {
        ...handoff,
        plannerStatus: 'completed',
        plannerRunId: runId,
        plannerCompletedAt: completedAt,
        plannerLastBlockedReason: null,
        plannerProducedCardIds: plannerCards.producedCardIds,
        plannerProposalArtifactRefs: result.proposalArtifactRefs || [],
      } : handoff,
      plannerToContext: null,
    });
  }

  if (handoff?.sourceFixTaskId) {
    finalizeFixTask(ROOT, handoff.sourceFixTask, {
      status: result.outcome === 'degraded' ? 're_escalated' : 'blocked',
      reason: result.reason || runRecord.reason || 'Planner is blocked on the current handoff.',
    });
  }
  return applyPlannerRuntimeState(baseWorkspace, {
    worker: {
      status: result.outcome === 'degraded' ? 'degraded' : 'blocked',
      statusReason: result.reason || runRecord.reason || 'Planner is blocked on the current handoff.',
      mode,
      backend: plannerConfig.backend,
      model: plannerConfig.model,
      currentRunId: null,
      lastRunId: runRecord.id,
      lastOutcome: result.outcome === 'degraded' ? 'degraded' : 'blocked',
      lastOutcomeAt: completedAt,
      lastSourceHandoffId: handoff?.id || null,
      lastBlockedReason: result.reason || runRecord.reason || null,
      lastProducedCardIds: [],
      proposalArtifactRefs: [],
      completedAt,
    },
    handoff: handoff ? {
      ...handoff,
      plannerStatus: result.outcome === 'degraded' ? 'degraded' : 'blocked',
      plannerRunId: runId,
      plannerCompletedAt: completedAt,
      plannerLastBlockedReason: result.reason || runRecord.reason || null,
      plannerProducedCardIds: [],
      plannerProposalArtifactRefs: [],
    } : handoff,
    plannerToContext: result.plannerToContext || null,
  });
}

function applyContextManagerRunResult(workspace, result, { runId, mode, previousHandoff = null, plannerFeedback = null }) {
  const runRecord = result?.run || null;
  const completedAt = runRecord?.completedAt || nowIso();
  const baseWorkspace = normalizeSpatialWorkspaceShape(workspace);
  const contextConfig = getAgentWorkerConfig(ROOT, 'context-manager');
  if (!runRecord) {
    return applyContextManagerRuntimeState(baseWorkspace, {
      worker: {
        status: 'idle',
        statusReason: 'Context Manager is idle.',
        currentRunId: null,
        lastOutcome: null,
        lastOutcomeAt: completedAt,
        completedAt,
      },
    });
  }

  if (result.ok && result.report && result.handoff) {
    const shouldClearPlannerFeedback = Boolean(
      plannerFeedback?.sourceHandoffId
      && previousHandoff?.id
      && plannerFeedback.sourceHandoffId === previousHandoff.id,
    );
    return applyContextManagerRuntimeState(baseWorkspace, {
      worker: {
        status: 'idle',
        statusReason: result.handoff?.status === 'needs-clarification'
          ? 'Published a planner handoff that still needs clarification.'
          : 'Published a planner-ready context handoff.',
        mode,
        backend: contextConfig.backend,
        model: contextConfig.model,
        currentRunId: null,
        lastRunId: runRecord.id,
        lastOutcome: 'completed',
        lastOutcomeAt: completedAt,
        lastSourceNodeId: result.report.nodeId || previousHandoff?.sourceNodeId || null,
        lastHandoffId: result.handoff.id || null,
        lastReportNodeId: result.report.nodeId || null,
        lastBlockedReason: null,
        lastUsedFallback: Boolean(result.usedFallback),
        lastPlannerFeedbackAction: plannerFeedback?.action || null,
        completedAt,
      },
      handoff: result.handoff,
      plannerToContext: shouldClearPlannerFeedback ? null : plannerFeedback,
      report: result.report,
    });
  }

  return applyContextManagerRuntimeState(baseWorkspace, {
    worker: {
      status: 'degraded',
      statusReason: result.reason || runRecord.reason || 'Context Manager degraded while drafting a handoff.',
      mode,
      backend: contextConfig.backend,
      model: contextConfig.model,
      currentRunId: null,
      lastRunId: runRecord.id,
      lastOutcome: 'degraded',
      lastOutcomeAt: completedAt,
      lastSourceNodeId: previousHandoff?.sourceNodeId || null,
      lastHandoffId: previousHandoff?.id || null,
      lastReportNodeId: null,
      lastBlockedReason: result.reason || runRecord.reason || null,
      lastUsedFallback: Boolean(result.usedFallback),
      lastPlannerFeedbackAction: plannerFeedback?.action || null,
      completedAt,
    },
    plannerToContext: plannerFeedback,
  });
}

function markExecutorRunStarted(workspace, card, runId, mode) {
  const startedAt = nowIso();
  const executorConfig = getAgentWorkerConfig(ROOT, 'executor');
  const taskId = executorTaskIdFromCard(card);
  return applyExecutorRuntimeState(workspace, {
    worker: {
      status: 'running',
      statusReason: card?.title
        ? `Assessing execution readiness for: ${card.title}`
        : 'Assessing executor queue readiness.',
      mode,
      backend: executorConfig.backend,
      model: executorConfig.model,
      currentRunId: runId,
      lastCardId: card?.id || null,
      lastTaskId: taskId,
      lastDecision: null,
      lastAssessmentSummary: null,
      lastAssessmentBlockers: [],
      lastBlockedReason: null,
      startedAt,
      completedAt: null,
    },
  });
}

function applyExecutorRunResult(workspace, card, result, { mode }) {
  const runRecord = result?.run || null;
  const completedAt = runRecord?.completedAt || nowIso();
  const baseWorkspace = normalizeSpatialWorkspaceShape(workspace);
  const executorConfig = getAgentWorkerConfig(ROOT, 'executor');
  if (!runRecord || !result?.report) {
    return applyExecutorRuntimeState(baseWorkspace, {
      worker: {
        status: 'idle',
        statusReason: 'Executor is idle.',
        currentRunId: null,
        lastOutcome: null,
        lastOutcomeAt: completedAt,
        completedAt,
      },
    });
  }

  if (!result.ok) {
    return applyExecutorRuntimeState(baseWorkspace, {
      worker: {
        status: 'degraded',
        statusReason: result.reason || runRecord.reason || 'Executor degraded while assessing readiness.',
        mode,
        backend: executorConfig.backend,
        model: executorConfig.model,
        currentRunId: null,
        lastRunId: runRecord.id,
        lastOutcome: runRecord.outcome || 'degraded',
        lastOutcomeAt: completedAt,
        lastCardId: card?.id || null,
        lastTaskId: executorTaskIdFromCard(card),
        lastDecision: result.report?.decision || null,
        lastAssessmentSummary: result.report?.summary || null,
        lastAssessmentBlockers: Array.isArray(result.report?.blockers) ? result.report.blockers : [],
        lastBlockedReason: result.reason || runRecord.reason || null,
        completedAt,
      },
    });
  }

  return applyExecutorRuntimeState(baseWorkspace, {
    worker: {
      status: 'idle',
      statusReason: result.report.summary || 'Executor assessment complete.',
      mode,
      backend: executorConfig.backend,
      model: executorConfig.model,
      currentRunId: null,
      lastRunId: runRecord.id,
      lastOutcome: 'completed',
      lastOutcomeAt: completedAt,
      lastCardId: card?.id || null,
      lastTaskId: executorTaskIdFromCard(card),
      lastDecision: result.report.decision || null,
      lastAssessmentSummary: result.report.summary || null,
      lastAssessmentBlockers: Array.isArray(result.report.blockers) ? result.report.blockers : [],
      lastBlockedReason: Array.isArray(result.report.blockers) && result.report.blockers.length ? result.report.blockers[0] : null,
      completedAt,
    },
  });
}

async function maybeRunPlannerWorker(workspace = null, { mode = 'auto', handoffId = null } = {}) {
  const currentWorkspace = normalizeSpatialWorkspaceShape(workspace || readSpatialWorkspace());
  const preflight = buildPreLlmGuardInput({
     requiredFiles: [
       'brain/emergence/project_brain.md',
       'brain/emergence/roadmap.md',
       'brain/emergence/plan.md',
      'brain/emergence/tasks.md',
    ],
    validationCommand: {
       command: 'node',
       args: ['--version'],
    },
  });
  let intakeWorkspace = currentWorkspace;
  let intakeResult = null;
  const currentPlannerHandoff = currentWorkspace?.studio?.handoffs?.contextToPlanner || null;
  if (mode === 'auto' && !handoffId && currentPlannerHandoff?.status !== 'ready') {
    intakeResult = consumePendingFixTask(ROOT, {
      preflight,
      previousHandoff: currentPlannerHandoff || null,
    });
    if (intakeResult?.accepted && intakeResult.handoff) {
      intakeWorkspace = persistSpatialWorkspace(applyPlannerRuntimeState(currentWorkspace, {
        handoff: intakeResult.handoff,
      }));
    } else if (intakeResult?.fixTask) {
      return createPreLlmBlockedResult(intakeResult.reason || 'Fix task intake is blocked.', currentWorkspace, {
        cards: [],
        proposalArtifactRefs: [],
        plannerToContext: null,
        guardChecks: preflight.checks,
        guardBlockers: preflight.blockers,
        preflight: buildGuardSurfacePayload({ stage: 'planner', preflight }),
        failureObservation: {
          related_stage: 'planner',
          related_tool: 'autonomy-policy',
        },
        policy: intakeResult.policy || null,
        fixTask: intakeResult.fixTask || null,
      });
    }
  }
  const handoff = getPlannerHandoff(intakeWorkspace, handoffId);
  if (!preflight.ok) {
    return createPreLlmBlockedResult(preflight.blockers[0], currentWorkspace, {
      cards: [],
      proposalArtifactRefs: [],
      plannerToContext: null,
      guardChecks: preflight.checks,
      guardBlockers: preflight.blockers,
      preflight: buildGuardSurfacePayload({ stage: 'planner', preflight }),
      failureObservation: {
        related_stage: 'planner',
        related_tool: 'node',
      },
    });
  }
  const runs = listPlannerRuns(ROOT);
  const eligibility = evaluatePlannerEligibility({
    workspace: intakeWorkspace,
    handoff,
    mode,
    runs,
  });
  if (!eligibility.eligible) {
    return {
      ok: false,
      skipped: true,
      reason: eligibility.reason,
      workspace: intakeWorkspace,
      preflight: buildGuardSurfacePayload({ stage: 'planner', preflight }),
      result: {
        ok: false,
        skipped: true,
        outcome: 'skipped',
        reason: eligibility.reason,
        run: null,
        cards: [],
        proposalArtifactRefs: [],
        plannerToContext: null,
      },
    };
  }
  if (plannerWorkerAutomationRunning) {
    return {
      ok: false,
      skipped: true,
      reason: 'Planner worker is already processing another handoff.',
      workspace: readSpatialWorkspace(),
      preflight: buildGuardSurfacePayload({ stage: 'planner', preflight }),
      result: {
        ok: false,
        skipped: true,
        outcome: 'skipped',
        reason: 'Planner worker is already processing another handoff.',
        run: null,
        cards: [],
        proposalArtifactRefs: [],
        plannerToContext: null,
      },
    };
  }

  plannerWorkerAutomationRunning = true;
  const runId = makePlannerRunId();
  try {
    let runningWorkspace = markPlannerRunStarted(intakeWorkspace, handoff, runId, mode);
    runningWorkspace = persistSpatialWorkspace(runningWorkspace);
    appendArchitectureHistory({
      at: nowIso(),
      type: 'planner-worker-start',
      summary: { handoffId: handoff?.id || null, runId, mode },
    });

    const result = await runPlannerWorker({
      rootPath: ROOT,
      handoff,
      workspace: runningWorkspace,
      anchorBundle: getAnchorBundle(),
      mode,
      runId,
    });
    const nextWorkspace = persistSpatialWorkspace(applyPlannerRunResult(readSpatialWorkspace(), handoff, result, { runId, mode }));
    appendArchitectureHistory({
      at: nowIso(),
      type: `planner-worker-${result.outcome || 'completed'}`,
      summary: {
        handoffId: handoff?.id || null,
        runId,
        reason: result.reason || '',
        producedCardIds: nextWorkspace?.studio?.agentWorkers?.planner?.lastProducedCardIds || [],
        proposalArtifactRefs: nextWorkspace?.studio?.agentWorkers?.planner?.proposalArtifactRefs || [],
      },
    });
    return {
      ok: result.ok,
      skipped: false,
      reason: result.reason || '',
      workspace: nextWorkspace,
      preflight: buildGuardSurfacePayload({ stage: 'planner', preflight }),
      result,
    };
  } finally {
    plannerWorkerAutomationRunning = false;
  }
}

async function maybeRunContextManagerWorker(workspace = null, {
  text,
  sourceNodeId = null,
  source = 'context-intake',
  mode = 'manual',
  plannerFeedback = null,
  backend = null,
  model = null,
  host = null,
  timeoutMs = null,
} = {}) {
  const currentWorkspace = normalizeSpatialWorkspaceShape(workspace || readSpatialWorkspace());
  const rawText = String(text || '').trim();
  if (!rawText) {
    return {
      ok: false,
      skipped: true,
      reason: 'Context Manager requires non-empty context text.',
      workspace: currentWorkspace,
      result: {
        ok: false,
        skipped: true,
        outcome: 'skipped',
        reason: 'Context Manager requires non-empty context text.',
        run: null,
        report: null,
        handoff: null,
      },
    };
  }
  const preflight = buildPreLlmGuardInput({
    requiredFiles: [
      'brain/emergence/project_brain.md',
      'brain/emergence/plan.md',
      'brain/emergence/tasks.md',
      'brain/context/known_fixes.md',
    ],
    validationCommand: {
      command: 'node',
      args: ['--version'],
    },
  });
  if (!preflight.ok) {
    return createPreLlmBlockedResult(preflight.blockers[0], currentWorkspace, {
      report: null,
      handoff: null,
      guardChecks: preflight.checks,
      guardBlockers: preflight.blockers,
      preflight: buildGuardSurfacePayload({ stage: 'context-manager', preflight }),
      failureObservation: {
        related_stage: 'context-manager',
        related_tool: 'node',
      },
    });
  }
  if (contextManagerWorkerAutomationRunning) {
    return {
      ok: false,
      skipped: true,
      reason: 'Context Manager is already processing another intake.',
      workspace: readSpatialWorkspace(),
      preflight: buildGuardSurfacePayload({ stage: 'context-manager', preflight }),
      result: {
        ok: false,
        skipped: true,
        outcome: 'skipped',
        reason: 'Context Manager is already processing another intake.',
        run: null,
        report: null,
        handoff: null,
      },
    };
  }

  const previousHandoff = currentWorkspace?.studio?.handoffs?.contextToPlanner || null;
  const activePlannerFeedback = plannerFeedback || currentWorkspace?.studio?.handoffs?.plannerToContext || null;
  contextManagerWorkerAutomationRunning = true;
  const runId = makeContextManagerRunId();
  try {
    let runningWorkspace = markContextManagerRunStarted(currentWorkspace, rawText, sourceNodeId, runId, mode, activePlannerFeedback);
    runningWorkspace = persistSpatialWorkspace(runningWorkspace);
    appendArchitectureHistory({
      at: nowIso(),
      type: 'context-manager-worker-start',
      summary: { sourceNodeId, runId, mode, source },
    });

    const result = await runContextManagerWorker({
      rootPath: ROOT,
      text: rawText,
      sourceNodeId,
      source,
      workspace: runningWorkspace,
      anchorBundle: getAnchorBundle(),
      dashboardState: getDashboardStateSnapshot(),
      previousHandoff,
      plannerFeedback: activePlannerFeedback,
      mode,
      backend,
      model,
      host,
      timeoutMs: Number(timeoutMs) > 0 ? Number(timeoutMs) : null,
      runId,
    });
    const nextWorkspace = persistSpatialWorkspace(applyContextManagerRunResult(
      readSpatialWorkspace(),
      result,
      { runId, mode, previousHandoff, plannerFeedback: activePlannerFeedback },
    ));
    appendArchitectureHistory({
      at: nowIso(),
      type: `context-manager-worker-${result.outcome || 'completed'}`,
      summary: {
        sourceNodeId,
        runId,
        reason: result.reason || '',
        handoffId: nextWorkspace?.studio?.handoffs?.contextToPlanner?.id || null,
        usedFallback: Boolean(result.usedFallback),
      },
    });
    return {
      ok: result.ok,
      skipped: false,
      reason: result.reason || '',
      workspace: nextWorkspace,
      preflight: buildGuardSurfacePayload({ stage: 'context-manager', preflight }),
      result,
    };
  } finally {
    contextManagerWorkerAutomationRunning = false;
  }
}

async function maybeRunExecutorWorker(workspace = null, { mode = 'manual', cardId = null } = {}) {
  const currentWorkspace = normalizeSpatialWorkspaceShape(workspace || readSpatialWorkspace());
  const card = cardId
    ? findTeamBoardCard(currentWorkspace, cardId)
    : getSelectedExecutionCard(currentWorkspace);
  if (!card) {
    return {
      ok: false,
      skipped: true,
      reason: 'Executor requires a selected execution card.',
      workspace: currentWorkspace,
      result: {
        ok: false,
        skipped: true,
        outcome: 'skipped',
        reason: 'Executor requires a selected execution card.',
        run: null,
        report: null,
      },
    };
  }
  const targetProject = resolveProjectTarget(card.targetProjectKey || SELF_TARGET_KEY);
  const preflight = buildPreLlmGuardInput({
    requiredFiles: [
      'brain/emergence/project_brain.md',
      'brain/emergence/plan.md',
      'brain/emergence/tasks.md',
    ],
    projectKey: targetProject.projectKey,
    projectPath: targetProject.projectPath,
    validationCommand: {
      command: 'git',
      args: ['--version'],
    },
  });
  if (!preflight.ok) {
    return createPreLlmBlockedResult(preflight.blockers[0], currentWorkspace, {
      report: null,
      guardChecks: preflight.checks,
      guardBlockers: preflight.blockers,
      preflight: buildGuardSurfacePayload({ stage: 'executor', preflight }),
      failureObservation: {
        related_stage: 'executor',
        related_tool: 'git',
        related_project: targetProject.projectKey,
      },
    });
  }
  if (executorWorkerAutomationRunning) {
    return {
      ok: false,
      skipped: true,
      reason: 'Executor worker is already processing another card.',
      workspace: readSpatialWorkspace(),
      preflight: buildGuardSurfacePayload({ stage: 'executor', preflight }),
      result: {
        ok: false,
        skipped: true,
        outcome: 'skipped',
        reason: 'Executor worker is already processing another card.',
        run: null,
        report: null,
      },
    };
  }

  executorWorkerAutomationRunning = true;
  const runId = makeExecutorRunId();
  try {
    let runningWorkspace = markExecutorRunStarted(currentWorkspace, card, runId, mode);
    runningWorkspace = persistSpatialWorkspace(runningWorkspace);
    appendArchitectureHistory({
      at: nowIso(),
      type: 'executor-worker-start',
      summary: { cardId: card.id || null, taskId: executorTaskIdFromCard(card), runId, mode },
    });

    const result = await runExecutorWorker({
      rootPath: ROOT,
      card,
      workspace: runningWorkspace,
      mode,
      runId,
    });
    const nextWorkspace = persistSpatialWorkspace(applyExecutorRunResult(readSpatialWorkspace(), card, result, { mode }));
    appendArchitectureHistory({
      at: nowIso(),
      type: 'executor-worker-completed',
      summary: {
        cardId: card.id || null,
        taskId: executorTaskIdFromCard(card),
        runId,
        decision: result.report?.decision || null,
        blockers: result.report?.blockers || [],
        usedFallback: Boolean(result.usedFallback),
      },
    });
    return {
      ok: result.ok,
      skipped: false,
      reason: result.reason || '',
      workspace: nextWorkspace,
      preflight: buildGuardSurfacePayload({ stage: 'executor', preflight }),
      result,
    };
  } finally {
    executorWorkerAutomationRunning = false;
  }
}

function findTaskFolderByTaskId(taskId) {
  return getTaskFolders().find((folder) => folder.startsWith(String(taskId || '').slice(0, 4))) || null;
}

function readTaskArtifactStatus(taskId = '') {
  const normalizedTaskId = String(taskId || '').trim();
  const folder = normalizedTaskId ? findTaskFolderByTaskId(normalizedTaskId) : null;
  const taskDir = folder ? path.join(TASKS_DIR, folder) : null;
  const artifacts = TASK_ARTIFACT_NAMES.map((name) => {
    const fullPath = taskDir ? path.join(taskDir, name) : null;
    return {
      name,
      exists: Boolean(fullPath && fs.existsSync(fullPath)),
      path: fullPath ? relativeToRoot(fullPath) : null,
    };
  });
  return {
    taskId: normalizedTaskId || null,
    folder,
    taskDir: taskDir ? relativeToRoot(taskDir) : null,
    artifacts,
    presentCount: artifacts.filter((artifact) => artifact.exists).length,
    totalCount: artifacts.length,
    taskCache: {
      planner: summarizeTaskCache(readTaskCache(ROOT, { taskId: normalizedTaskId || null, taskDir, stage: 'planner' })),
      executor: summarizeTaskCache(readTaskCache(ROOT, { taskId: normalizedTaskId || null, taskDir, stage: 'executor' })),
    },
  };
}

function buildPreLlmGuardInput({
  rootPath = ROOT,
  requiredFiles = [],
  projectKey = null,
  projectPath = null,
  validationCommand = null,
  patchPath = null,
} = {}) {
  return evaluatePreLlmGuards({
    rootPath,
    requiredFiles,
    projectKey,
    projectPath,
    validationCommand,
    patchPath,
    commandRunner: spawnSyncSafe,
  });
}

function normalizePreflightStage(stage = '') {
  const normalized = String(stage || '').trim().toLowerCase().replace(/\s+/g, '-');
  return ['planner', 'context-manager', 'executor', 'rebuild', 'self-upgrade'].includes(normalized)
    ? normalized
    : null;
}

function buildGuardSurfacePayload({
  stage = null,
  preflight = null,
  cacheStatus = null,
  cacheReason = null,
  warningReasons = [],
} = {}) {
  const normalizedStage = normalizePreflightStage(stage) || String(stage || '').trim() || null;
  const guardReasons = mergeUnique([
    ...(Array.isArray(preflight?.blockers) ? preflight.blockers : []),
    ...(Array.isArray(preflight?.warnings) ? preflight.warnings : []),
    ...(Array.isArray(warningReasons) ? warningReasons : []),
    cacheReason,
  ]);
  const guardStatus = cacheStatus === 'reused'
    ? 'cache_reused'
    : (preflight?.ok ? (guardReasons.length ? 'warning' : 'ready') : 'blocked');
  const guardReason = cacheStatus === 'reused'
    ? (cacheReason || guardReasons[0] || String(preflight?.summary || '').trim() || 'Cached task artefact reused.')
    : (guardReasons[0]
      || String(preflight?.summary || '').trim()
      || (guardStatus === 'ready' ? 'Preflight checks passed.' : 'Preflight blocked.'));
  return {
    ok: guardStatus !== 'blocked',
    stage: normalizedStage,
    guard_status: guardStatus,
    guard_reason: guardReason,
    guard_reasons: guardReasons,
    cache_status: cacheStatus || null,
    checks: preflight?.checks || null,
  };
}

function buildAutonomyPolicyResponse({
  rootPath = ROOT,
  taskId = null,
  taskDir = null,
  stage = 'executor',
  action = null,
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
  retryLimit = null,
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
  const policy = evaluateAutonomyPolicy({
    rootPath,
    stage,
    action,
    taskId,
    projectKey,
    projectPath,
    preflight,
    taskCache,
    validation,
    changedFiles,
    patchText,
    patchValid,
    patchPath,
    retryCount,
    retryLimit,
    failureKey,
    failureMessage,
    allowlistPaths,
    disallowedPaths,
    requiredFilesMissing,
    repoInvalid,
    validationCommandExists,
    patchEmpty,
    ambiguous,
    cacheStatus,
    failureRisky,
  });
  let fixTask = null;
  if (policy.decision !== 'auto_allowed') {
    fixTask = createBoundedFixTaskArtifact(rootPath, {
      taskId: taskId || null,
      taskDir: taskDir || null,
      stage: policy.stage,
      action: policy.action,
      decision: policy.decision,
      reasons: policy.reasons,
      policy_rule_hits: policy.policy_rule_hits,
      retryCount: policy.retry_count,
      projectKey: policy.projectKey,
      projectPath: policy.projectPath,
      cache_status: policy.cache_status,
      changedFiles: changedFiles || [],
      failureKey: policy.failureKey || failureKey || null,
      candidateFix: policy.candidate_fix || null,
      source: 'autonomy-policy',
    });
  }
  return {
    policy: {
      ...policy,
      fix_task_created: Boolean(fixTask),
      fix_task_path: fixTask?.jsonPath || null,
    },
    fixTask,
  };
}

function evaluateStagePreflightSurface({
  stage,
  taskId = null,
  projectKey = null,
  projectPath = null,
  rootPath = ROOT,
} = {}) {
  const normalizedStage = normalizePreflightStage(stage);
  if (!normalizedStage) {
    const preflight = {
      ok: false,
      blockers: ['Unsupported preflight stage.'],
      checks: {},
      cacheHit: false,
      summary: 'Unsupported preflight stage.',
    };
    return {
      ...buildGuardSurfacePayload({ stage, preflight }),
      preflight,
    };
  }

  if (normalizedStage === 'planner') {
    const preflight = buildPreLlmGuardInput({
      rootPath,
      requiredFiles: [
        'brain/emergence/project_brain.md',
        'brain/emergence/roadmap.md',
        'brain/emergence/plan.md',
        'brain/emergence/tasks.md',
      ],
      validationCommand: {
        command: 'node',
        args: ['--version'],
      },
    });
    const projectTarget = resolveProjectTarget(projectKey || SELF_TARGET_KEY);
    const policy = buildAutonomyPolicyResponse({
      rootPath,
      taskId,
      stage: normalizedStage,
      action: 'planner',
      projectKey: projectTarget.projectKey || SELF_TARGET_KEY,
      projectPath: projectPath || projectTarget.projectPath || resolveProjectTarget(SELF_TARGET_KEY).projectPath,
      preflight,
      validationCommandExists: Boolean(preflight?.checks?.validationCommand?.ok !== false),
      requiredFilesMissing: preflight?.checks?.requiredFiles?.missing || [],
      repoInvalid: Boolean(preflight?.checks?.repoClean?.ok === false),
      cacheStatus: null,
    }).policy;
    return {
      ...buildGuardSurfacePayload({ stage: normalizedStage, preflight }),
      policy,
      preflight,
    };
  }

  if (normalizedStage === 'context-manager') {
    const preflight = buildPreLlmGuardInput({
      rootPath,
      requiredFiles: [
        'brain/emergence/project_brain.md',
        'brain/emergence/plan.md',
        'brain/emergence/tasks.md',
        'brain/context/known_fixes.md',
      ],
      validationCommand: {
        command: 'node',
        args: ['--version'],
      },
    });
    const projectTarget = resolveProjectTarget(projectKey || SELF_TARGET_KEY);
    const policy = buildAutonomyPolicyResponse({
      rootPath,
      taskId,
      stage: normalizedStage,
      action: 'context-manager',
      projectKey: projectTarget.projectKey || SELF_TARGET_KEY,
      projectPath: projectPath || projectTarget.projectPath || resolveProjectTarget(SELF_TARGET_KEY).projectPath,
      preflight,
      validationCommandExists: Boolean(preflight?.checks?.validationCommand?.ok !== false),
      requiredFilesMissing: preflight?.checks?.requiredFiles?.missing || [],
      repoInvalid: Boolean(preflight?.checks?.repoClean?.ok === false),
      cacheStatus: null,
    }).policy;
    return {
      ...buildGuardSurfacePayload({ stage: normalizedStage, preflight }),
      policy,
      preflight,
    };
  }

  if (normalizedStage === 'executor') {
    const targetProject = resolveProjectTarget(projectKey || SELF_TARGET_KEY);
    const preflight = buildPreLlmGuardInput({
      rootPath,
      requiredFiles: [
        'brain/emergence/project_brain.md',
        'brain/emergence/plan.md',
        'brain/emergence/tasks.md',
      ],
      projectKey: targetProject.projectKey,
      projectPath: projectPath || targetProject.projectPath,
      validationCommand: {
        command: 'git',
        args: ['--version'],
      },
    });
    const policy = buildAutonomyPolicyResponse({
      rootPath,
      taskId,
      stage: normalizedStage,
      action: 'executor',
      projectKey: targetProject.projectKey,
      projectPath: projectPath || targetProject.projectPath,
      preflight,
      validationCommandExists: Boolean(preflight?.checks?.validationCommand?.ok !== false),
      requiredFilesMissing: preflight?.checks?.requiredFiles?.missing || [],
      repoInvalid: Boolean(preflight?.checks?.repoClean?.ok === false),
      cacheStatus: null,
    }).policy;
    return {
      ...buildGuardSurfacePayload({ stage: normalizedStage, preflight }),
      policy,
      preflight,
    };
  }

  const normalizedTaskId = String(taskId || '').trim();
  const taskFolder = normalizedTaskId ? findTaskFolderByTaskId(normalizedTaskId) : null;
  const taskDir = taskFolder ? path.join(TASKS_DIR, taskFolder) : null;
  const taskCache = readTaskCache(rootPath, {
    taskId: normalizedTaskId || null,
    taskDir,
    stage: 'executor',
  });
  const targetProject = resolveProjectTarget(projectKey || SELF_TARGET_KEY);
  const patchPath = taskCache.taskDirPath
    ? path.join(taskCache.taskDirPath, 'patch.diff')
    : (taskDir ? path.join(taskDir, 'patch.diff') : null);
  const preflight = buildPreLlmGuardInput({
    rootPath,
    requiredFiles: [
      'brain/emergence/project_brain.md',
      'brain/emergence/plan.md',
      'brain/emergence/tasks.md',
    ],
    projectKey: targetProject.projectKey,
    projectPath: projectPath || targetProject.projectPath,
    validationCommand: {
      command: 'git',
      args: ['--version'],
    },
    patchPath,
  });
  const cacheStatus = taskCache.source === TASK_CACHE_SOURCE.HIT ? 'reused' : null;
  const cacheReason = cacheStatus === 'reused'
    ? 'Cached patch already exists; rebuild skipped.'
    : null;
  const policy = buildAutonomyPolicyResponse({
    rootPath,
    taskId: normalizedTaskId || null,
    stage: normalizedStage,
    action: 'rebuild',
    projectKey: targetProject.projectKey,
    projectPath: projectPath || targetProject.projectPath,
    preflight,
    taskCache,
    validationCommandExists: Boolean(preflight?.checks?.validationCommand?.ok !== false),
    requiredFilesMissing: preflight?.checks?.requiredFiles?.missing || [],
    repoInvalid: Boolean(preflight?.checks?.repoClean?.ok === false),
    cacheStatus,
  }).policy;
  return {
    ...buildGuardSurfacePayload({
      stage: normalizedStage,
      preflight,
      cacheStatus,
      cacheReason,
    }),
    policy,
    preflight,
    taskCache: summarizeTaskCache(taskCache),
  };
}

function createPreLlmBlockedResult(reason, workspace, resultShape = {}) {
  const blockedReason = String(reason || 'Pre-LLM guard blocked this generation.').trim();
  if (resultShape.failureObservation) {
    try {
      recordClassifiedFailure(ROOT, new Error(blockedReason), {
        message: blockedReason,
        stage: resultShape.stage || null,
        agentId: resultShape.agentId || null,
        agentVersion: resultShape.agentVersion || null,
        ...resultShape.failureObservation,
      });
    } catch (error) {
      console.warn('[WARN] failure history update failed:', error?.message || error);
    }
  }
  return {
    ok: false,
    skipped: true,
    reason: blockedReason,
    workspace,
    result: {
      ok: false,
      skipped: true,
      outcome: 'blocked',
      reason: blockedReason,
      blockers: [blockedReason],
      run: null,
      ...resultShape,
    },
  };
}

function mutateTeamBoardCard(workspace, cardId, mutator) {
  const board = normalizeTeamBoardState(workspace);
  const cards = board.cards.map((card) => (card.id === cardId ? mutator(card) : card));
  return {
    ...workspace,
    studio: {
      ...(workspace.studio || {}),
      teamBoard: {
        ...board,
        cards,
        updatedAt: nowIso(),
      },
    },
  };
}

function findTeamBoardCard(workspace, cardId) {
  const board = normalizeTeamBoardState(workspace);
  return board.cards.find((card) => card.id === cardId) || null;
}

function createExecutorBlocker(code, message) {
  return {
    code: String(code || 'executor-blocked').trim() || 'executor-blocked',
    message: String(message || 'Execution is blocked.').trim() || 'Execution is blocked.',
    updatedAt: nowIso(),
  };
}

function clearExecutorBlocker() {
  return null;
}

function getCardTaskId(card = {}) {
  return String(card.builderTaskId || card.runnerTaskId || card.executionPackage?.taskId || '').trim();
}

function summarizeGateMessage(messages = [], fallback = 'Execution is blocked.') {
  const first = (messages || []).map((message) => String(message || '').trim()).find(Boolean);
  return first || fallback;
}

function loadCommandPresets() {
  return readJsonSafe(COMMANDS_FILE, {}) || {};
}

function buildVerificationSignature({ taskId, patchPath, changedFiles = [], targetProjectKey, expectedAction }) {
  const files = [...new Set((changedFiles || []).map((file) => String(file || '').trim()).filter(Boolean))].sort();
  return [String(taskId || '').trim(), String(targetProjectKey || '').trim(), String(expectedAction || '').trim(), String(patchPath || '').trim(), ...files].join('|');
}

function buildVerificationPlan({ taskId, patchPath, changedFiles = [], targetProjectKey, expectedAction = 'apply' }) {
  const presets = loadCommandPresets();
  const files = [...new Set((changedFiles || []).map((file) => String(file || '').trim()).filter(Boolean))];
  const commands = [];
  const qaScenarios = [];

  if (targetProjectKey === SELF_TARGET_KEY && presets.runner_compile) {
    commands.push({
      preset: 'runner_compile',
      label: 'Runner compile',
    });
  }

  if (targetProjectKey === SELF_TARGET_KEY && files.some((file) => file.startsWith('ui/'))) {
    qaScenarios.push({
      scenario: 'layout-pass',
      mode: 'observation',
      label: 'UI layout pass',
    });
  }

  const required = commands.length > 0 || qaScenarios.length > 0;
  return {
    required,
    commands,
    qaScenarios,
    signature: required ? buildVerificationSignature({ taskId, patchPath, changedFiles: files, targetProjectKey, expectedAction }) : null,
    summary: required
      ? `${commands.length} command check${commands.length === 1 ? '' : 's'} and ${qaScenarios.length} QA scenario${qaScenarios.length === 1 ? '' : 's'} required before apply.`
      : 'No verification required.',
    generatedAt: nowIso(),
  };
}

function collectVerificationArtifacts({ commandArtifacts = [], qaRuns = [] } = {}) {
  const artifacts = [...(commandArtifacts || [])];
  (qaRuns || []).forEach((run) => {
    if (!run?.id) return;
    artifacts.push(`/api/spatial/qa/runs/${run.id}`);
  });
  return mergeUnique(artifacts);
}

function evaluateVerifyGate({ card, workspace }) {
  if (!card) return { ok: false, code: 'missing-card', message: 'Card not found.' };
  if (!(card.sourceAnchorRefs || []).length) {
    return { ok: false, code: 'missing-anchor', message: 'Card has no anchor provenance and cannot be verified.', nextStatus: 'review' };
  }
  const taskId = getCardTaskId(card);
  if (!taskId || card.executionPackage?.status !== 'ready') {
    return { ok: false, code: 'missing-package', message: 'Card has no ready build package to verify.' };
  }
  const verificationPlan = card.executionPackage?.verificationPlan || buildVerificationPlan({
    taskId,
    patchPath: card.executionPackage?.patchPath,
    changedFiles: card.executionPackage?.changedFiles || [],
    targetProjectKey: card.targetProjectKey || SELF_TARGET_KEY,
    expectedAction: card.executionPackage?.expectedAction || 'apply',
  });
  if (!verificationPlan.required) {
    return { ok: false, noop: true, code: 'verification-not-required', message: 'No verification required.', taskId, verificationPlan };
  }
  if (card.verifyStatus === 'running') {
    return { ok: false, noop: true, code: 'verification-running', message: 'Verification is already running.', taskId, verificationPlan };
  }
  if (card.verifyStatus === 'passed' && card.verifiedSignature === verificationPlan.signature) {
    return { ok: false, noop: true, code: 'verification-complete', message: 'Verification already passed for this package.', taskId, verificationPlan };
  }
  return { ok: true, taskId, verificationPlan };
}

function evaluateApplyGate({ card, workspace }) {
  if (!card) return { ok: false, code: 'missing-card', message: 'Card not found.' };
  if (!(card.sourceAnchorRefs || []).length) {
    return { ok: false, code: 'missing-anchor', message: 'Card has no anchor provenance and cannot be applied.', nextStatus: 'review', nextApprovalState: 'pending' };
  }
  const taskId = getCardTaskId(card);
  if (!taskId || card.executionPackage?.status !== 'ready') {
    return { ok: false, code: 'missing-package', message: 'Card has no ready build package to apply.' };
  }
  const verificationPlan = card.executionPackage?.verificationPlan || buildVerificationPlan({
    taskId,
    patchPath: card.executionPackage?.patchPath,
    changedFiles: card.executionPackage?.changedFiles || [],
    targetProjectKey: card.targetProjectKey || SELF_TARGET_KEY,
    expectedAction: card.executionPackage?.expectedAction || 'apply',
  });
  if (Boolean(card.verifyRequired || verificationPlan.required)) {
    if (card.verifyStatus === 'running') {
      return { ok: false, code: 'verification-running', message: 'Verification is already running for this package.' };
    }
    if (['failed', 'blocked'].includes(card.verifyStatus)) {
      return { ok: false, code: 'verification-failed', message: card.lastVerificationSummary || 'Verification failed and must be rerun.' };
    }
    if (card.verifyStatus !== 'passed') {
      return { ok: false, code: 'verification-required', message: card.lastVerificationSummary || 'Verification must pass before apply can run.' };
    }
    if (verificationPlan.signature && card.verifiedSignature !== verificationPlan.signature) {
      return { ok: false, code: 'verification-stale', message: 'Verification is stale for this package and must be rerun.' };
    }
  }
  if (card.applyStatus === 'applying') {
    return { ok: false, code: 'apply-running', message: 'Card is already applying.' };
  }
  if (card.applyStatus === 'applied') {
    return { ok: false, code: 'apply-complete', message: 'Card has already been applied.' };
  }
  const validReadyState = (card.status === 'complete' && card.applyStatus === 'queued')
    || (card.status === 'review' && card.approvalState === 'approved' && ['idle', 'failed', 'queued'].includes(card.applyStatus || 'idle'))
    || (card.status === 'complete' && card.approvalState === 'approved' && ['idle', 'failed', 'queued'].includes(card.applyStatus || 'idle'));
  if (!validReadyState) {
    if (card.status === 'review' && card.approvalState !== 'approved') {
      return { ok: false, code: 'approval-required', message: `Waiting for approval on ${card.title}.`, nextStatus: 'review', nextApprovalState: 'pending' };
    }
    return { ok: false, code: 'invalid-apply-state', message: 'Card is not in a valid state for apply.' };
  }
  if ((card.targetProjectKey || SELF_TARGET_KEY) === SELF_TARGET_KEY) {
    const selfUpgrade = getSelfUpgradeState(workspace);
    if (!selfUpgrade.preflight?.ok) {
      return {
        ok: false,
        code: 'preflight-failed',
        message: selfUpgrade.preflight?.summary || 'Self-upgrade preflight must pass before apply can run.',
        nextStatus: 'review',
        nextApprovalState: 'pending',
      };
    }
    if (selfUpgrade.preflight?.taskId !== taskId) {
      return {
        ok: false,
        code: 'preflight-stale',
        message: 'Self-upgrade preflight is stale for this task and must be rerun.',
        nextStatus: 'review',
        nextApprovalState: 'pending',
      };
    }
  }
  return { ok: true, taskId };
}

function evaluateDeployGate({ card, workspace }) {
  if (!card) return { ok: false, code: 'missing-card', message: 'Card not found.' };
  if (!(card.sourceAnchorRefs || []).length) {
    return { ok: false, code: 'missing-anchor', message: 'Card has no anchor provenance and cannot be deployed.', nextStatus: 'review', nextApprovalState: 'pending' };
  }
  if ((card.targetProjectKey || SELF_TARGET_KEY) !== SELF_TARGET_KEY) {
    return { ok: false, code: 'deploy-target-invalid', message: 'Deploy only runs for ace-self packages.' };
  }
  const taskId = getCardTaskId(card);
  if (!taskId) {
    return { ok: false, code: 'missing-package', message: 'Card has no build package to deploy.' };
  }
  if (card.deployStatus === 'deploying') {
    return { ok: false, code: 'deploy-running', message: 'Card is already deploying.' };
  }
  if (card.deployStatus === 'deployed') {
    return { ok: false, code: 'deploy-complete', message: 'Card has already been deployed.' };
  }
  if (card.applyStatus !== 'applied' || card.deployStatus !== 'queued' || card.status !== 'complete') {
    return { ok: false, code: 'invalid-deploy-state', message: 'Card is not in a valid state for deploy.' };
  }
  const selfUpgrade = getSelfUpgradeState(workspace);
  if (!selfUpgrade.preflight?.ok) {
    return {
      ok: false,
      code: 'preflight-failed',
      message: selfUpgrade.preflight?.summary || 'Deploy requires a passing self-upgrade preflight.',
      nextStatus: 'review',
      nextApprovalState: 'pending',
    };
  }
  if (selfUpgrade.preflight?.taskId !== taskId) {
    return {
      ok: false,
      code: 'preflight-stale',
      message: 'Self-upgrade preflight is stale for this task and must be rerun.',
      nextStatus: 'review',
      nextApprovalState: 'pending',
    };
  }
  if (!selfUpgrade.apply?.ok || selfUpgrade.apply?.taskId !== taskId) {
    return {
      ok: false,
      code: 'apply-stale',
      message: 'Deploy requires a successful apply for this exact task.',
      nextStatus: 'review',
      nextApprovalState: 'pending',
    };
  }
  return { ok: true, taskId };
}

function applyExecutorGateBlock(card = {}, gate = {}) {
  return {
    ...card,
    status: gate.nextStatus || card.status,
    approvalState: gate.nextApprovalState || card.approvalState,
    executorBlocker: createExecutorBlocker(gate.code, gate.message),
    riskLevel: gate.nextStatus === 'review' ? 'high' : card.riskLevel,
    riskReasons: mergeUnique([...(card.riskReasons || []), gate.message]),
    updatedAt: nowIso(),
  };
}

function persistBoardWorkspace(nextWorkspace, historyType, summary = {}) {
  const persisted = persistSpatialWorkspace(nextWorkspace);
  appendArchitectureHistory({
    at: nowIso(),
    type: historyType,
    summary,
  });
  return persisted;
}

function buildExecutionPackage({
  card,
  taskId,
  taskDir,
  patchPath,
  changedFiles,
  preflight,
  risk,
  provenance = null,
  taskCache = null,
  policy = null,
  fixTask = null,
  sourceFixTask = null,
}) {
  const targetProjectKey = card.targetProjectKey || SELF_TARGET_KEY;
  const relativePatchPath = relativeToRoot(patchPath);
  const verificationPlan = buildVerificationPlan({
    taskId,
    patchPath: relativePatchPath,
    changedFiles,
    targetProjectKey,
    expectedAction: risk.autoDeploy ? 'apply + deploy' : 'apply',
  });
  const summarizedTaskCache = taskCache ? summarizeTaskCache(taskCache) : null;
  return {
    status: 'ready',
    taskId,
    taskDir: relativeToRoot(taskDir),
    patchPath: relativePatchPath,
    changedFiles,
    targetProjectKey,
    expectedAction: risk.autoDeploy ? 'apply + deploy' : 'apply',
    summary: `${changedFiles.length} changed file${changedFiles.length === 1 ? '' : 's'} ready for ${targetProjectKey}`,
    preflightStatus: preflight?.status || 'idle',
    verificationPlan,
    provenance: provenance || createExecutionProvenance(),
    provenanceSummary: summarizeExecutionProvenance(provenance),
    taskCache: summarizedTaskCache,
    taskCacheSource: summarizedTaskCache?.source || null,
    policy: policy ? {
      decision: policy.decision || null,
      reasons: policy.reasons || [],
      policy_rule_hits: policy.policy_rule_hits || [],
      retry_count: policy.retry_count ?? null,
      cache_status: policy.cache_status || null,
      fix_task_created: Boolean(policy.fix_task_created),
      fix_task_path: policy.fix_task_path || null,
      summary: summarizeAutonomyPolicyDecision(policy),
    } : null,
    fixTask: fixTask ? {
      location: fixTask.location || null,
      jsonPath: relativeToRoot(fixTask.jsonPath),
      markdownPath: relativeToRoot(fixTask.markdownPath),
    } : null,
    sourceFixTask: sourceFixTask ? {
      taskId: sourceFixTask.taskId || null,
      parentTaskId: sourceFixTask.parentTaskId || null,
      location: sourceFixTask.location || null,
      status: sourceFixTask.status || null,
      retry_count: Number(sourceFixTask.retry_count || 0) || 0,
      retry_limit: Number(sourceFixTask.retry_limit || 0) || 0,
      queueKey: sourceFixTask.queueKey || null,
      jsonPath: sourceFixTask.jsonPath || null,
      markdownPath: sourceFixTask.markdownPath || null,
    } : null,
    builtAt: nowIso(),
  };
}

function syncTeamBoardWithSelfUpgrade(workspace) {
  const selfUpgrade = getSelfUpgradeState(workspace);
  const board = normalizeTeamBoardState(workspace);
  const taskId = String(selfUpgrade.taskId || '').trim();
  if (!taskId) return workspace;
  const healthStatus = selfUpgrade.deploy?.health?.status || selfUpgrade.deploy?.status || 'unknown';
  const cards = board.cards.map((card) => {
    if (String(card.builderTaskId || card.runnerTaskId || '') !== taskId) return card;
    if (card.deployStatus === 'deploying' && ['healthy', 'ready'].includes(String(healthStatus))) {
      return {
        ...card,
        status: 'complete',
        desk: 'Executor',
        state: 'Deployed',
        deployStatus: 'deployed',
        executorBlocker: clearExecutorBlocker(),
        lastHealth: selfUpgrade.deploy?.health || null,
        updatedAt: nowIso(),
      };
    }
    if (card.deployStatus === 'deploying' && !['healthy', 'restarting', 'ready'].includes(String(healthStatus))) {
      return {
        ...card,
        status: 'review',
        desk: 'CTO',
        state: 'Flagged',
        deployStatus: 'flagged',
        approvalState: 'pending',
        executorBlocker: createExecutorBlocker('deploy-health-flagged', `Deploy health reported ${healthStatus}.`),
        riskLevel: 'high',
        riskReasons: [...new Set([...(card.riskReasons || []), `Deploy health reported ${healthStatus}.`])],
        lastHealth: selfUpgrade.deploy?.health || null,
        updatedAt: nowIso(),
      };
    }
    return card;
  });
  return {
    ...workspace,
    studio: {
      ...(workspace.studio || {}),
      selfUpgrade,
      teamBoard: {
        ...board,
        cards,
        updatedAt: nowIso(),
      },
    },
  };
}

function mergeUnique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function buildLegacyFallbackProvenance({ action, commandLine = null, stageId = null } = {}) {
  const normalizedAction = String(action || stageId || '').trim();
  return createExecutionProvenance({
    classification: 'legacy-fallback',
    orchestration: 'unknown',
    execution: 'legacy-fallback',
    engine: 'legacy-runner',
    stageIds: stageId ? [stageId] : [],
    legacyActions: normalizedAction ? [normalizedAction] : [],
    evidence: ['route:legacy-fallback', normalizedAction ? `action:${normalizedAction}` : null, commandLine ? `command:${commandLine}` : null].filter(Boolean),
  });
}

function buildMixedStudioProvenance({
  engine,
  stageIds = [],
  legacyActions = [],
  evidence = [],
  notes = [],
} = {}) {
  const mergedEvidence = ['route:studio', 'route:legacy-fallback', ...evidence];
  return createExecutionProvenance({
    classification: classifyExecutionProvenance({
      usesLegacyFallback: legacyActions.length > 0,
      usesStudioNative: true,
      evidence: mergedEvidence,
    }),
    orchestration: 'studio',
    execution: legacyActions.length > 0 ? 'hybrid' : 'studio-native',
    engine: engine || 'ace-studio',
    stageIds,
    legacyActions,
    nativeActions: ['studio-orchestration'],
    evidence: mergedEvidence,
    notes,
  });
}

function summarizeExecutionProvenance(provenance) {
  const normalized = provenance || createExecutionProvenance();
  const actions = (normalized.legacyActions || []).join(', ');
  const route = normalized.classification || 'unknown';
  if (route === 'mixed') return `mixed | Studio orchestrates, legacy runs ${actions || 'legacy stages'}`;
  if (route === 'legacy-fallback') return `legacy-fallback | ${actions || 'legacy runner'}`;
  if (route === 'studio-native') return 'studio-native | no legacy fallback observed';
  return 'unknown | provenance evidence incomplete';
}

function collectTaskArtifacts(taskDir, existingArtifacts = []) {
  const artifacts = [...existingArtifacts];
  if (!taskDir || !fs.existsSync(taskDir)) return mergeUnique(artifacts);
  for (const name of fs.readdirSync(taskDir)) {
    if (['idea.txt', 'context.md', 'plan.md', 'patch.diff', 'apply_result.json', 'agent_attribution.json', 'meta.json'].includes(name) || /^run_.+\.(log|json)$/.test(name)) {
      artifacts.push(relativeToRoot(path.join(taskDir, name)));
    }
  }
  return mergeUnique(artifacts);
}

function buildCardPrompt(card, workspace) {
  const handoff = workspace?.studio?.handoffs?.contextToPlanner || null;
  const fixTaskSection = buildFixTaskPromptSection(card?.sourceFixTask || card?.executionPackage?.sourceFixTask || null);
  const promptParts = [
    card.title,
    handoff?.problemStatement || handoff?.summary || '',
    fixTaskSection,
    (card.sourceAnchorRefs || []).length ? `Anchor refs:\n${card.sourceAnchorRefs.map((anchorRef) => `- ${anchorRef}`).join('\n')}` : '',
  ].filter(Boolean);
  return promptParts.join('\n\n');
}

function readTaskPatchReview({ taskId, projectKey, projectPath }) {
  const taskFolder = findTaskFolderByTaskId(taskId);
  const taskCache = readTaskCache(ROOT, {
    taskId,
    taskDir: taskFolder ? path.join(TASKS_DIR, taskFolder) : null,
    stage: 'executor',
  });
  const validation = taskFolder ? validateApply(projectPath, taskFolder) : {
    ok: false,
    taskDir: null,
    patchPath: null,
    changedFiles: [],
    refusalReasons: ['Task folder not found.'],
  };
  let patchText = '';
  if (taskCache.source === TASK_CACHE_SOURCE.HIT && taskCache.files?.patch?.valid) {
    patchText = taskCache.files.patch.content;
  } else if (validation.patchPath && fs.existsSync(validation.patchPath)) {
    patchText = fs.readFileSync(validation.patchPath, 'utf8');
  }
  const patchReview = reviewSelfUpgradePatch({
    patchText,
    taskId,
    projectKey,
    projectPath,
    rootPath: ROOT,
  });
  return {
    taskFolder,
    validation,
    patchReview,
    taskCache,
    patchText,
  };
}

function setSelfUpgradeFromBuild({ taskId, patchReview, preflight, validation }) {
  updateSelfUpgradeState((state) => ({
    ...state,
    status: preflight?.ok && patchReview?.ok && validation?.ok ? 'ready-to-apply' : 'blocked',
    taskId,
    targetProjectKey: SELF_TARGET_KEY,
    patchReview,
    preflight,
    deploy: preflight?.ok
      ? state.deploy
      : createDefaultSelfUpgradeState({ serverStartedAt: SERVER_STARTED_AT, pid: process.pid }).deploy,
    requiresPermission: preflight?.ok ? 'none' : 'user-confirmation',
  }));
}

function runCardBuilderPipeline(cardId) {
  let workspace = syncTeamBoardWithSelfUpgrade(readSpatialWorkspace());
  const card = findTeamBoardCard(workspace, cardId);
  if (!card || card.status !== 'active') {
    return { ok: false, error: 'Card is not active for builder work.', workspace };
  }
  if (!(card.sourceAnchorRefs || []).length) {
    const failedWorkspace = mutateTeamBoardCard(workspace, cardId, (currentCard) => ({
      ...currentCard,
      status: 'review',
      executionPackage: {
        ...(currentCard.executionPackage || {}),
        status: 'failed',
        summary: 'Card has no anchor provenance and cannot enter the builder pipeline.',
      },
      executorBlocker: createExecutorBlocker('missing-anchor', 'Card has no anchor provenance and cannot enter the builder pipeline.'),
      riskLevel: 'high',
      riskReasons: mergeUnique([...(currentCard.riskReasons || []), 'Missing anchor provenance.']),
      updatedAt: nowIso(),
    }));
    return {
      ok: false,
      error: 'Card has no anchor provenance and cannot enter the builder pipeline.',
      workspace: persistBoardWorkspace(failedWorkspace, 'team-board-builder-unanchored', { cardId }),
    };
  }

  const targetProjectKey = card.targetProjectKey || SELF_TARGET_KEY;
  const { projectKey, projectPath } = resolveProjectTarget(targetProjectKey);
  const existingTaskId = String(card.builderTaskId || card.runnerTaskId || '').trim() || null;
  const builderPreflight = buildPreLlmGuardInput({
    requiredFiles: [
      'brain/emergence/project_brain.md',
      'brain/emergence/roadmap.md',
      'brain/emergence/plan.md',
      'brain/emergence/tasks.md',
    ],
    projectKey,
    projectPath,
    validationCommand: {
      command: 'git',
      args: ['--version'],
    },
  });
  if (!builderPreflight.ok) {
    try {
      recordClassifiedFailure(ROOT, new Error(builderPreflight.blockers[0] || 'Builder preflight blocked.'), {
        message: builderPreflight.blockers[0] || 'Builder preflight blocked.',
        related_stage: 'builder-preflight',
        stage: 'builder-preflight',
        agentId: 'builder',
        tool: 'git',
        projectKey,
        component: 'builder',
        source: 'builder-preflight',
      });
    } catch (error) {
      console.warn('[WARN] failure history update failed:', error?.message || error);
    }
    const builderPolicy = buildAutonomyPolicyResponse({
      rootPath: ROOT,
      taskId: existingTaskId || cardId,
      taskDir: null,
      stage: 'builder',
      action: 'build',
      projectKey,
      projectPath,
      preflight: builderPreflight,
      validationCommandExists: Boolean(builderPreflight.checks?.validationCommand?.ok !== false),
      requiredFilesMissing: builderPreflight.checks?.requiredFiles?.missing || [],
      repoInvalid: Boolean(builderPreflight.checks?.repoClean?.ok === false),
      cacheStatus: null,
      failureMessage: builderPreflight.blockers[0] || 'Builder preflight blocked.',
    });
    if (card.sourceFixTaskId || card.executionPackage?.sourceFixTaskId) {
      finalizeFixTask(ROOT, card.sourceFixTask || card.executionPackage?.sourceFixTask || {
        taskId: card.sourceFixTaskId || card.executionPackage?.sourceFixTaskId,
        location: card.sourceFixTaskLocation || card.executionPackage?.sourceFixTask?.location || 'queue',
      }, {
        status: builderPolicy.policy?.decision === 'blocked' ? 'blocked' : 're_escalated',
        reason: builderPreflight.blockers[0] || 'Builder preflight blocked.',
        policy: builderPolicy.policy,
      });
    }
    const failedWorkspace = mutateTeamBoardCard(workspace, cardId, (currentCard) => ({
      ...currentCard,
      builderTaskId: existingTaskId,
      runnerTaskId: existingTaskId,
      status: 'review',
      executionPackage: {
        ...(currentCard.executionPackage || {}),
        status: 'blocked',
        taskId: existingTaskId,
        taskDir: null,
        patchPath: null,
        targetProjectKey,
        summary: builderPreflight.blockers[0] || 'Builder preflight blocked.',
      },
      executorBlocker: createExecutorBlocker('preflight-blocked', builderPreflight.blockers[0] || 'Builder preflight blocked.'),
      riskLevel: 'high',
      riskReasons: mergeUnique([...(currentCard.riskReasons || []), ...builderPreflight.blockers]),
      updatedAt: nowIso(),
    }));
    return {
      ok: false,
      error: builderPreflight.blockers[0] || 'Builder preflight blocked.',
      policy: builderPolicy.policy,
      workspace: persistBoardWorkspace(failedWorkspace, 'team-board-builder-preflight-blocked', { cardId, taskId: existingTaskId }),
    };
  }
  const builderProvenance = buildMixedStudioProvenance({
    engine: 'ace-studio-builder-pipeline',
    stageIds: ['builder', 'scan', 'manage', 'build'],
    legacyActions: ['scan', 'manage', 'build'],
    evidence: ['source:team-board-builder'],
  });
  const handoff = workspace?.studio?.handoffs?.contextToPlanner || null;
  let taskId = existingTaskId || '';
  let taskDir = null;

  if (!taskId || !findTaskFolderByTaskId(taskId)) {
    const task = createRunnerTaskFolder({
      title: card.title,
      prompt: buildCardPrompt(card, workspace),
      handoff,
      anchorRefs: card.sourceAnchorRefs || [],
    });
    taskId = task.taskId;
    taskDir = task.taskDir;
    workspace = mutateTeamBoardCard(workspace, cardId, (currentCard) => ({
      ...currentCard,
      builderTaskId: task.taskId,
      runnerTaskId: task.taskId,
      targetProjectKey,
      executionPackage: {
        ...(currentCard.executionPackage || {}),
        status: 'building',
        taskId: task.taskId,
        taskDir: relativeToRoot(task.taskDir),
        patchPath: relativeToRoot(path.join(task.taskDir, 'patch.diff')),
        targetProjectKey,
        provenance: builderProvenance,
        provenanceSummary: summarizeExecutionProvenance(builderProvenance),
      },
      executionProvenance: builderProvenance,
      verifyRequired: false,
      verifyStatus: 'idle',
      verifyRunIds: [],
      verifyArtifacts: [],
      lastVerificationSummary: '',
      verifiedSignature: null,
      approvalState: 'none',
      applyStatus: 'idle',
      deployStatus: 'idle',
      executorBlocker: clearExecutorBlocker(),
      riskLevel: 'unknown',
      riskReasons: [],
      updatedAt: nowIso(),
    }));
    workspace = persistBoardWorkspace(workspace, 'team-board-builder-start', { cardId, taskId, title: card.title });
  } else {
    taskDir = path.join(TASKS_DIR, findTaskFolderByTaskId(taskId));
  }

  const patchPath = taskDir ? path.join(taskDir, 'patch.diff') : null;
  const cachedPatchExists = Boolean(patchPath && fs.existsSync(patchPath) && fs.statSync(patchPath).size > 0);

  workspace = mutateTeamBoardCard(workspace, cardId, (currentCard) => {
    const currentTaskFlow = currentCard.taskFlow || {
      phase: 'active',
      assignmentState: 'assigned',
      ownerDeskId: 'planner',
      assigneeDeskId: 'executor',
      sourceIntentId: currentCard.sourceIntentId || currentCard.sourceNodeId || null,
      sourceHandoffId: currentCard.sourceHandoffId || handoff?.id || null,
      lastTransitionAt: nowIso(),
      lastTransitionLabel: 'Placed into active',
      history: [],
    };
    return {
      ...currentCard,
      taskFlow: {
        ...currentTaskFlow,
        phase: 'handed_off',
        assignmentState: 'claimed',
        ownerDeskId: 'executor',
        assigneeDeskId: 'executor',
        lastTransitionAt: nowIso(),
        lastTransitionLabel: 'Executor claimed task',
        history: [
          {
            phase: 'handed_off',
            assignmentState: 'claimed',
            ownerDeskId: 'executor',
            assigneeDeskId: 'executor',
            label: 'Executor claimed task',
            note: currentCard.title,
            at: nowIso(),
          },
          ...(Array.isArray(currentTaskFlow.history) ? currentTaskFlow.history : []),
        ].slice(0, 8),
      },
      updatedAt: nowIso(),
    };
  });
  workspace = persistBoardWorkspace(workspace, 'team-board-builder-hand-off', { cardId, taskId, title: card.title });

  const results = [];
  let failedResult = null;
  if (cachedPatchExists) {
    appendArchitectureHistory({
      at: nowIso(),
      type: 'team-board-builder-cache-hit',
      summary: {
        cardId,
        taskId,
        patchPath: relativeToRoot(patchPath),
        projectKey,
      },
    });
  } else {
    for (const action of ['scan', 'manage', 'build']) {
      const result = executeActionSync(action, {
        taskId,
        project: targetProjectKey,
      });
      results.push(result);
      if (!result.ok) {
        failedResult = result;
        break;
      }
    }
  }
  const runIds = mergeUnique(results.map((result) => result.runId));
  const runArtifacts = mergeUnique(results.flatMap((result) => result.artifacts || []));

  if (failedResult) {
    if (card.sourceFixTaskId || card.executionPackage?.sourceFixTaskId) {
      finalizeFixTask(ROOT, card.sourceFixTask || card.executionPackage?.sourceFixTask || {
        taskId: card.sourceFixTaskId || card.executionPackage?.sourceFixTaskId,
        location: card.sourceFixTaskLocation || card.executionPackage?.sourceFixTask?.location || 'queue',
      }, {
        status: 're_escalated',
        reason: failedResult.error || failedResult.summary || 'Builder pipeline failed.',
      });
    }
    const failedWorkspace = mutateTeamBoardCard(readSpatialWorkspace(), cardId, (currentCard) => ({
      ...currentCard,
      builderTaskId: taskId,
      runnerTaskId: taskId,
      status: 'active',
      executionPackage: {
        ...(currentCard.executionPackage || {}),
        status: 'failed',
        taskId,
        taskDir: relativeToRoot(taskDir),
        targetProjectKey,
        summary: failedResult.error || failedResult.summary || 'Builder pipeline failed.',
        provenance: builderProvenance,
        provenanceSummary: summarizeExecutionProvenance(builderProvenance),
      },
      executionProvenance: builderProvenance,
      verifyRequired: false,
      verifyStatus: 'idle',
      verifyRunIds: [],
      verifyArtifacts: [],
      lastVerificationSummary: '',
      verifiedSignature: null,
      executorBlocker: createExecutorBlocker('builder-failed', failedResult.error || failedResult.summary || 'Builder pipeline failed.'),
      runIds: mergeUnique([...(currentCard.runIds || []), ...runIds]),
      artifactRefs: collectTaskArtifacts(taskDir, [...(currentCard.artifactRefs || []), ...runArtifacts]),
      updatedAt: nowIso(),
    }));
    return {
      ok: false,
      error: failedResult.error || 'Builder pipeline failed.',
      workspace: persistBoardWorkspace(failedWorkspace, 'team-board-builder-failed', { cardId, taskId, runIds }),
    };
  }

  const { validation, patchReview, taskCache, patchText } = readTaskPatchReview({ taskId, projectKey, projectPath });
  const preflight = isSelfTarget(projectKey, projectPath, ROOT)
    ? runSelfUpgradePreflight({ taskId, projectKey, projectPath, validation, patchReview })
    : { status: 'not-required', ok: true, checks: [], summary: 'Preflight not required for this target.' };
  const conflicts = readSpatialWorkspace()?.studio?.orchestrator?.conflicts || [];
  const risk = assessAutoMutationRisk({
    projectKey,
    projectPath,
    rootPath: ROOT,
    changedFiles: validation.changedFiles || [],
    preflight,
    conflicts,
  });
  const riskReasons = mergeUnique([
    ...(risk.reasons || []),
    ...(!validation.ok ? (validation.refusalReasons || []) : []),
    ...(!patchReview.ok ? (patchReview.refusalReasons || []) : []),
  ]);
  const autonomyPolicy = buildAutonomyPolicyResponse({
    rootPath: ROOT,
    taskId,
    taskDir: validation.taskDir || taskDir,
    stage: 'executor',
    action: 'review',
    projectKey,
    projectPath,
    preflight,
    taskCache,
    validation,
    changedFiles: validation.changedFiles || [],
    patchText,
    patchValid: Boolean(validation.ok && patchReview.ok && patchText.trim()),
    patchPath: validation.patchPath,
    retryCount: null,
    failureMessage: !validation.ok
      ? (validation.refusalReasons[0] || 'Patch validation failed.')
      : (!patchReview.ok
        ? (patchReview.refusalReasons[0] || 'Patch review failed.')
        : ''),
    cacheStatus: taskCache.source === TASK_CACHE_SOURCE.HIT ? 'reused' : null,
    failureRisky: Boolean(risk.requiresReview || risk.riskLevel === 'high'),
  });
  const requiresReview = Boolean(
    risk.requiresReview
    || !validation.ok
    || !patchReview.ok
    || !preflight.ok
    || autonomyPolicy.policy.decision !== 'auto_allowed',
  );
  const nextRiskLevel = requiresReview && risk.riskLevel === 'low' ? 'high' : risk.riskLevel;
  const fixTaskArtifact = autonomyPolicy.fixTask;
  const nextPolicy = {
    ...autonomyPolicy.policy,
    fix_task_created: Boolean(fixTaskArtifact),
    fix_task_path: autonomyPolicy.policy.fix_task_path || fixTaskArtifact?.jsonPath || null,
  };
  const nextExecutionPackage = buildExecutionPackage({
    card,
    taskId,
    taskDir: validation.taskDir || taskDir,
    patchPath: validation.patchPath || path.join(taskDir, 'patch.diff'),
    changedFiles: validation.changedFiles || [],
    preflight,
    risk,
    provenance: builderProvenance,
    taskCache,
    policy: nextPolicy,
    fixTask: fixTaskArtifact,
    sourceFixTask: card.sourceFixTask || card.executionPackage?.sourceFixTask || null,
  });

  if (isSelfTarget(projectKey, projectPath, ROOT)) {
    setSelfUpgradeFromBuild({
      taskId,
      patchReview,
      preflight,
      validation,
    });
  }

  const completedWorkspace = mutateTeamBoardCard(readSpatialWorkspace(), cardId, (currentCard) => ({
    ...currentCard,
    builderTaskId: taskId,
    runnerTaskId: taskId,
    targetProjectKey,
    status: requiresReview ? 'review' : 'complete',
    executionPackage: nextExecutionPackage,
    executionProvenance: builderProvenance,
    runIds: mergeUnique([...(currentCard.runIds || []), ...runIds]),
    artifactRefs: collectTaskArtifacts(validation.taskDir || taskDir, [...(currentCard.artifactRefs || []), ...runArtifacts]),
    riskLevel: nextRiskLevel || 'medium',
    riskReasons,
    approvalState: requiresReview ? 'pending' : 'auto-approved',
    verifyRequired: Boolean(nextExecutionPackage.verificationPlan?.required),
    verifyStatus: nextExecutionPackage.verificationPlan?.required ? 'queued' : 'not-required',
    verifyRunIds: [],
    verifyArtifacts: [],
    lastVerificationSummary: nextExecutionPackage.verificationPlan?.required
      ? `Verification queued. ${nextExecutionPackage.verificationPlan.summary}`
      : 'No verification required.',
    verifiedSignature: null,
    applyStatus: requiresReview ? 'idle' : (nextExecutionPackage.verificationPlan?.required ? 'idle' : 'queued'),
    deployStatus: 'idle',
    executorBlocker: requiresReview
      ? createExecutorBlocker(
          !preflight.ok ? 'preflight-failed' : (autonomyPolicy.policy.decision === 'escalate' ? 'policy-escalate' : (autonomyPolicy.policy.decision === 'blocked' ? 'policy-blocked' : 'approval-required')),
          !preflight.ok
            ? (preflight.summary || 'Self-upgrade preflight must pass before apply can run.')
            : summarizeGateMessage([
                ...riskReasons,
                ...(autonomyPolicy.policy.reasons || []),
              ], `Waiting for approval on ${currentCard.title}.`),
        )
      : clearExecutorBlocker(),
    updatedAt: nowIso(),
  }));

  return {
    ok: true,
    taskId,
    risk: {
      ...risk,
      reasons: riskReasons,
    },
    policy: nextPolicy,
    workspace: persistBoardWorkspace(completedWorkspace, 'team-board-build-complete', {
      cardId,
      taskId,
      changedFiles: validation.changedFiles || [],
      riskLevel: nextRiskLevel || 'medium',
    }),
  };
}

async function runCardVerifyPipeline(cardId, { baseUrl = null } = {}) {
  const workspace = syncTeamBoardWithSelfUpgrade(readSpatialWorkspace());
  const card = findTeamBoardCard(workspace, cardId);
  if (!card) return { ok: false, error: 'Card not found.', workspace };

  const gate = evaluateVerifyGate({ card, workspace });
  if (gate.noop) {
    return { ok: true, skipped: true, workspace };
  }
  if (!gate.ok) {
    const blockedWorkspace = persistBoardWorkspace(mutateTeamBoardCard(workspace, cardId, (currentCard) => applyExecutorGateBlock(currentCard, gate)), 'team-board-verify-blocked', {
      cardId,
      code: gate.code,
    });
    return { ok: false, error: gate.message, workspace: blockedWorkspace };
  }

  const { taskId, verificationPlan } = gate;
  const targetProjectKey = card.targetProjectKey || SELF_TARGET_KEY;
  const startedWorkspace = persistBoardWorkspace(mutateTeamBoardCard(workspace, cardId, (currentCard) => ({
    ...currentCard,
    verifyRequired: true,
    verifyStatus: 'running',
    verifyRunIds: [],
    verifyArtifacts: [],
    lastVerificationSummary: `Running verification. ${verificationPlan.summary}`,
    verifiedSignature: null,
    executionPackage: {
      ...(currentCard.executionPackage || {}),
      verificationPlan,
    },
    executorBlocker: clearExecutorBlocker(),
    updatedAt: nowIso(),
  })), 'team-board-verify-start', { cardId, taskId });

  const verifyRunIds = [];
  const commandArtifacts = [];
  const qaRuns = [];
  const failures = [];

  for (const command of verificationPlan.commands || []) {
    const result = executeActionSync('run', {
      taskId,
      project: targetProjectKey,
      preset: command.preset,
    });
    verifyRunIds.push(result.runId);
    commandArtifacts.push(...(result.artifacts || []));
    if (!result.ok) {
      failures.push(result.error || result.summary || `${command.label || command.preset} failed.`);
      break;
    }
  }

  if (!failures.length) {
    for (const scenario of verificationPlan.qaScenarios || []) {
      const qaRun = await startBrowserQARun({
        baseUrl,
        scenario: scenario.scenario,
        mode: scenario.mode || 'observation',
        trigger: 'executor-verification',
        prompt: card.title,
        linked: { cardId },
      });
      qaRuns.push(qaRun);
      verifyRunIds.push(`qa:${qaRun.id}`);
      if (qaRun?.verdict === 'failed') {
        failures.push(`QA scenario ${scenario.scenario} failed.`);
        break;
      }
    }
  }

  const verifyArtifacts = collectVerificationArtifacts({
    commandArtifacts,
    qaRuns,
  });

  if (failures.length) {
    const failedWorkspace = persistBoardWorkspace(mutateTeamBoardCard(readSpatialWorkspace(), cardId, (currentCard) => ({
      ...currentCard,
      verifyRequired: true,
      verifyStatus: 'failed',
      verifyRunIds: mergeUnique([...(currentCard.verifyRunIds || []), ...verifyRunIds]),
      verifyArtifacts: mergeUnique([...(currentCard.verifyArtifacts || []), ...verifyArtifacts]),
      lastVerificationSummary: summarizeGateMessage(failures, 'Verification failed.'),
      verifiedSignature: null,
      executorBlocker: createExecutorBlocker('verification-failed', summarizeGateMessage(failures, 'Verification failed.')),
      riskLevel: 'high',
      riskReasons: mergeUnique([...(currentCard.riskReasons || []), summarizeGateMessage(failures, 'Verification failed.')]),
      updatedAt: nowIso(),
    })), 'team-board-verify-failed', { cardId, taskId });
    return {
      ok: false,
      error: summarizeGateMessage(failures, 'Verification failed.'),
      workspace: failedWorkspace,
    };
  }

  const verifiedWorkspace = persistBoardWorkspace(mutateTeamBoardCard(readSpatialWorkspace(), cardId, (currentCard) => {
    const approvalState = currentCard.approvalState || 'none';
    const canQueueApply = currentCard.status === 'complete'
      || (currentCard.status === 'review' && approvalState === 'approved');
    return {
      ...currentCard,
      verifyRequired: true,
      verifyStatus: 'passed',
      verifyRunIds: mergeUnique([...(currentCard.verifyRunIds || []), ...verifyRunIds]),
      verifyArtifacts: mergeUnique([...(currentCard.verifyArtifacts || []), ...verifyArtifacts]),
      lastVerificationSummary: `Verification passed. ${verificationPlan.summary}`,
      verifiedSignature: verificationPlan.signature,
      applyStatus: canQueueApply ? 'queued' : currentCard.applyStatus,
      executionPackage: {
        ...(currentCard.executionPackage || {}),
        verificationPlan,
      },
      executorBlocker: clearExecutorBlocker(),
      updatedAt: nowIso(),
    };
  }), 'team-board-verify-complete', { cardId, taskId });

  return {
    ok: true,
    workspace: verifiedWorkspace,
  };
}

function runCardApplyPipeline(cardId, { approvedByUser = false } = {}) {
  const workspace = syncTeamBoardWithSelfUpgrade(readSpatialWorkspace());
  const card = findTeamBoardCard(workspace, cardId);
  if (!card) return { ok: false, error: 'Card not found.', workspace };
  const gate = evaluateApplyGate({ card, workspace });
  const taskId = gate.taskId || getCardTaskId(card);
  const taskFolder = taskId ? findTaskFolderByTaskId(taskId) : null;
  const taskDir = taskFolder ? path.join(TASKS_DIR, taskFolder) : null;
  const targetProjectKey = card.targetProjectKey || SELF_TARGET_KEY;
  const { projectKey, projectPath } = resolveProjectTarget(targetProjectKey);
  const taskReview = taskId ? readTaskPatchReview({ taskId, projectKey, projectPath }) : {
    taskFolder: null,
    validation: {
      ok: false,
      taskDir: null,
      patchPath: null,
      changedFiles: [],
      refusalReasons: ['Task folder not found.'],
    },
    patchReview: {
      ok: false,
      refusalReasons: ['Task folder not found.'],
    },
    taskCache: readTaskCache(ROOT, { taskId: taskId || null, taskDir: null, stage: 'executor' }),
    patchText: '',
  };
  const { validation, patchReview, taskCache, patchText } = taskReview;
  const applyProvenance = mergeExecutionProvenance(
    card.executionPackage?.provenance || card.executionProvenance || null,
    buildMixedStudioProvenance({
      engine: 'ace-studio-apply-pipeline',
      stageIds: ['apply'],
      legacyActions: ['apply'],
      evidence: ['source:team-board-apply'],
    }),
  );
  const selfUpgrade = getSelfUpgradeState(workspace);
  const policySurface = buildAutonomyPolicyResponse({
    rootPath: ROOT,
    taskId,
    taskDir,
    stage: 'apply',
    action: 'apply',
    projectKey,
    projectPath,
    preflight: isSelfTarget(projectKey, projectPath, ROOT) ? selfUpgrade.preflight : null,
    taskCache,
    validation,
    changedFiles: validation.changedFiles || [],
    patchText,
    patchValid: Boolean(validation.ok && patchReview.ok && patchText.trim()),
    patchPath: validation.patchPath,
    failureMessage: !validation.ok
      ? (validation.refusalReasons[0] || 'Patch validation failed.')
      : (!patchReview.ok
        ? (patchReview.refusalReasons[0] || 'Patch review failed.')
        : gate.message || ''),
    cacheStatus: taskCache.source === TASK_CACHE_SOURCE.HIT ? 'reused' : null,
    failureRisky: gate.code !== 'approval-required',
  });
  const policy = policySurface.policy;
  const fixTaskArtifact = policySurface.fixTask;
  const approvalBypassAllowed = policy.decision === 'auto_allowed';

  if (!gate.ok && !(gate.code === 'approval-required' && approvalBypassAllowed)) {
    const blockedReason = policy.decision === 'auto_allowed' ? gate.message : summarizeAutonomyPolicyDecision(policy);
    const blockerCode = policy.decision === 'auto_allowed'
      ? gate.code
      : (policy.decision === 'escalate' ? 'policy-escalate' : 'policy-blocked');
    if (taskDir) {
      writeTaskApplyResult(taskDir, buildTaskApplyResultRecord({
        taskId,
        taskDir,
        projectKey: targetProjectKey,
        patchPath: taskDir ? path.join(taskDir, 'patch.diff') : null,
        ok: false,
        status: 'blocked',
        result: null,
        error: blockedReason,
        branch: null,
        commit: null,
        policy,
        fixTask: fixTaskArtifact,
        sourceFixTask: card.sourceFixTask || card.executionPackage?.sourceFixTask || null,
      }), { recordFailure: false });
    }
    if (card.sourceFixTaskId || card.executionPackage?.sourceFixTaskId) {
      finalizeFixTask(ROOT, card.sourceFixTask || card.executionPackage?.sourceFixTask || {
        taskId: card.sourceFixTaskId || card.executionPackage?.sourceFixTaskId,
        location: card.sourceFixTaskLocation || card.executionPackage?.sourceFixTask?.location || 'queue',
      }, {
        status: policy.decision === 'blocked' ? 'blocked' : 're_escalated',
        reason: blockedReason,
        policy,
      });
    }
    const blockedWorkspace = persistBoardWorkspace(mutateTeamBoardCard(workspace, cardId, (currentCard) => ({
      ...currentCard,
      status: 'review',
      approvalState: 'pending',
      applyStatus: 'blocked',
      executionProvenance: applyProvenance,
      executionPackage: currentCard.executionPackage
        ? {
            ...currentCard.executionPackage,
            policy: {
              ...policy,
              fix_task_created: Boolean(fixTaskArtifact),
              fix_task_path: policy.fix_task_path || fixTaskArtifact?.jsonPath || null,
            },
            fixTask: fixTaskArtifact
              ? {
                  location: fixTaskArtifact.location || null,
                  jsonPath: relativeToRoot(fixTaskArtifact.jsonPath),
                  markdownPath: relativeToRoot(fixTaskArtifact.markdownPath),
                }
              : currentCard.executionPackage.fixTask,
          }
        : currentCard.executionPackage,
      executorBlocker: createExecutorBlocker(blockerCode, blockedReason),
      riskLevel: 'high',
      riskReasons: mergeUnique([...(currentCard.riskReasons || []), blockedReason, ...(policy.reasons || [])]),
      updatedAt: nowIso(),
    })), 'team-board-apply-blocked', {
      cardId,
      code: blockerCode,
      taskId,
    });
    return {
      ok: false,
      error: blockedReason,
      policy,
      workspace: blockedWorkspace,
    };
  }
  const applyingWorkspace = mutateTeamBoardCard(workspace, cardId, (currentCard) => ({
    ...currentCard,
    status: 'complete',
    approvalState: currentCard.approvalState === 'approved'
      ? 'approved'
      : (approvedByUser || approvalBypassAllowed ? 'auto-approved' : currentCard.approvalState),
    applyStatus: 'applying',
    executorBlocker: clearExecutorBlocker(),
    executionPackage: currentCard.executionPackage
      ? {
          ...currentCard.executionPackage,
          policy: {
            ...policy,
            fix_task_created: Boolean(fixTaskArtifact),
            fix_task_path: policy.fix_task_path || fixTaskArtifact?.jsonPath || null,
          },
          fixTask: fixTaskArtifact
            ? {
                location: fixTaskArtifact.location || null,
                jsonPath: relativeToRoot(fixTaskArtifact.jsonPath),
                markdownPath: relativeToRoot(fixTaskArtifact.markdownPath),
              }
            : currentCard.executionPackage.fixTask,
        }
      : currentCard.executionPackage,
    updatedAt: nowIso(),
  }));
  persistBoardWorkspace(applyingWorkspace, 'team-board-apply-start', { cardId, taskId });

  const result = executeActionSync('apply', {
    taskId,
    project: targetProjectKey,
    confirmApply: true,
    confirmOverride: true,
    autoApproved: !approvedByUser || approvalBypassAllowed,
  });
  writeTaskApplyResult(taskDir, buildTaskApplyResultRecord({
    taskId,
    taskDir,
    projectKey: targetProjectKey,
    patchPath: taskDir ? path.join(taskDir, 'patch.diff') : null,
    ok: Boolean(result.ok),
    status: result.ok ? 'passed' : 'failed',
    result: result.ok ? {
      runId: result.runId || null,
      artifacts: result.artifacts || [],
      meta: result.meta || null,
    } : null,
    error: result.ok ? null : (result.error || 'Apply failed.'),
    branch: result.meta?.branch || null,
    commit: result.meta?.commit || null,
    policy,
    fixTask: fixTaskArtifact,
    sourceFixTask: card.sourceFixTask || card.executionPackage?.sourceFixTask || null,
  }));

  if (!result.ok) {
    if (card.sourceFixTaskId || card.executionPackage?.sourceFixTaskId) {
      finalizeFixTask(ROOT, card.sourceFixTask || card.executionPackage?.sourceFixTask || {
        taskId: card.sourceFixTaskId || card.executionPackage?.sourceFixTaskId,
        location: card.sourceFixTaskLocation || card.executionPackage?.sourceFixTask?.location || 'queue',
      }, {
        status: 're_escalated',
        reason: result.error || 'Apply failed.',
        policy,
      });
    }
    const failedWorkspace = mutateTeamBoardCard(readSpatialWorkspace(), cardId, (currentCard) => ({
      ...currentCard,
      status: 'review',
      approvalState: 'pending',
      applyStatus: 'failed',
      executionProvenance: applyProvenance,
      executorBlocker: createExecutorBlocker('apply-failed', result.error || 'Apply failed.'),
      riskLevel: 'high',
      riskReasons: mergeUnique([...(currentCard.riskReasons || []), result.error || 'Apply failed.']),
      executionPackage: currentCard.executionPackage
        ? {
            ...currentCard.executionPackage,
            policy: {
              ...policy,
              fix_task_created: Boolean(fixTaskArtifact),
              fix_task_path: policy.fix_task_path || fixTaskArtifact?.jsonPath || null,
            },
            fixTask: fixTaskArtifact
              ? {
                  location: fixTaskArtifact.location || null,
                  jsonPath: relativeToRoot(fixTaskArtifact.jsonPath),
                  markdownPath: relativeToRoot(fixTaskArtifact.markdownPath),
                }
              : currentCard.executionPackage.fixTask,
          }
        : currentCard.executionPackage,
      updatedAt: nowIso(),
    }));
    return {
      ok: false,
      error: result.error || 'Apply failed.',
      policy,
      workspace: persistBoardWorkspace(failedWorkspace, 'team-board-apply-failed', { cardId, taskId, runId: result.runId }),
    };
  }

  const nextDeployStatus = card.targetProjectKey === SELF_TARGET_KEY
    && card.executionPackage?.expectedAction === 'apply + deploy'
    ? 'queued'
    : 'idle';
  const appliedWorkspace = mutateTeamBoardCard(readSpatialWorkspace(), cardId, (currentCard) => ({
    ...currentCard,
    status: 'complete',
    approvalState: currentCard.approvalState === 'approved' ? 'approved' : (approvedByUser ? 'approved' : 'auto-approved'),
    applyStatus: 'applied',
    deployStatus: nextDeployStatus,
    executionProvenance: applyProvenance,
    executionPackage: currentCard.executionPackage
      ? {
          ...currentCard.executionPackage,
          provenance: applyProvenance,
          provenanceSummary: summarizeExecutionProvenance(applyProvenance),
          policy: {
            ...policy,
            fix_task_created: Boolean(fixTaskArtifact),
            fix_task_path: policy.fix_task_path || fixTaskArtifact?.jsonPath || null,
          },
          fixTask: fixTaskArtifact
            ? {
                location: fixTaskArtifact.location || null,
                jsonPath: relativeToRoot(fixTaskArtifact.jsonPath),
                markdownPath: relativeToRoot(fixTaskArtifact.markdownPath),
              }
            : currentCard.executionPackage.fixTask,
        }
      : currentCard.executionPackage,
    executorBlocker: clearExecutorBlocker(),
    branch: result.meta?.branch || currentCard.branch || null,
    commit: result.meta?.commit || currentCard.commit || null,
    runIds: mergeUnique([...(currentCard.runIds || []), result.runId]),
    artifactRefs: mergeUnique([...(currentCard.artifactRefs || []), ...(result.artifacts || [])]),
    updatedAt: nowIso(),
  }));
  if (card.sourceFixTaskId || card.executionPackage?.sourceFixTaskId) {
    finalizeFixTask(ROOT, card.sourceFixTask || card.executionPackage?.sourceFixTask || {
      taskId: card.sourceFixTaskId || card.executionPackage?.sourceFixTaskId,
      location: card.sourceFixTaskLocation || card.executionPackage?.sourceFixTask?.location || 'queue',
    }, {
      status: 'resolved',
      reason: 'Apply completed successfully.',
      policy,
      followupTaskId: taskId,
      followupTaskDir: taskDir,
    });
  }
  return {
    ok: true,
    result,
    policy,
    workspace: persistBoardWorkspace(appliedWorkspace, 'team-board-apply-complete', {
      cardId,
      taskId,
      branch: result.meta?.branch || null,
      commit: result.meta?.commit || null,
    }),
  };
}

function listChangedFilesFromPatch(patchText) {
  const files = new Set();
  const lines = patchText.split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      const parts = line.split(' ');
      if (parts.length >= 4) {
        const target = parts[3].replace(/^b\//, '');
        if (target && target !== 'dev/null') files.add(target);
      }
    }
  }
  return [...files];
}

function validateApply(projectPath, taskFolderName) {
  const taskDir = path.join(TASKS_DIR, taskFolderName);
  const patchPath = path.join(taskDir, 'patch.diff');
  const result = {
    ok: true,
    validation: [],
    warnings: [],
    refusalReasons: [],
    changedFiles: [],
    branchName: `ace/task-${taskFolderName.slice(0, 4)}-apply`,
    taskDir,
    patchPath,
  };

  if (!fs.existsSync(taskDir)) {
    result.ok = false;
    result.refusalReasons.push('Task folder not found.');
    return result;
  }

  if (!fs.existsSync(patchPath)) {
    result.ok = false;
    result.refusalReasons.push('patch.diff is missing. Run build first.');
    return result;
  }

  const patchText = fs.readFileSync(patchPath, 'utf8');
  if (!patchText.trim()) {
    result.ok = false;
    result.refusalReasons.push('patch.diff is empty.');
  } else {
    result.changedFiles = listChangedFilesFromPatch(patchText);
    if (result.changedFiles.length === 0) {
      result.ok = false;
      result.refusalReasons.push('Patch has no detectable changed files.');
    }
  }

  if (!projectPath || !fs.existsSync(projectPath)) {
    result.ok = false;
    result.refusalReasons.push('Project path does not exist.');
    return result;
  }

  const gitCheck = spawnSyncSafe('git', ['rev-parse', '--is-inside-work-tree'], projectPath);
  if (gitCheck.code !== 0 || gitCheck.stdout.trim() !== 'true') {
    result.ok = false;
    result.refusalReasons.push('Target project is not a git repository.');
    return result;
  }

  const status = spawnSyncSafe('git', ['status', '--porcelain', '--untracked-files=no'], projectPath);
  if (status.code !== 0) {
    result.ok = false;
    result.refusalReasons.push('Unable to inspect git status.');
  } else if (status.stdout.trim()) {
    result.ok = false;
    result.refusalReasons.push('Repository has uncommitted tracked changes.');
    result.warnings.push(status.stdout.trim());
  }

  const gitignorePath = path.join(projectPath, '.gitignore');
  const required = ['ui/node_modules/', '**/node_modules/', 'npm-debug.log*'];
  const gitignore = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
  const missing = required.filter((rule) => !gitignore.includes(rule));
  if (missing.length) {
    result.ok = false;
    result.refusalReasons.push('Required .gitignore rules are missing.');
    result.warnings.push(...missing.map((r) => `Missing rule: ${r}`));
  }

  result.validation.push(result.ok ? 'Validation passed.' : 'Validation failed.');
  return result;
}

function spawnSyncSafe(cmd, args, cwd) {
  try {
    const out = require('child_process').spawnSync(cmd, args, {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
    });
    return {
      code: out.status ?? 1,
      stdout: out.stdout || '',
      stderr: out.stderr || '',
    };
  } catch (err) {
    return { code: 1, stdout: '', stderr: String(err) };
  }
}

function createRun(action, payload) {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const run = {
    runId,
    action,
    payload,
    status: 'running',
    startedAt: Date.now(),
    finishedAt: null,
    durationMs: null,
    exitCode: null,
    logs: [],
    artifacts: [],
    meta: {},
    listeners: new Set(),
  };
  runStore.set(runId, run);
  runOrder.push(runId);
  while (runOrder.length > MAX_RUN_HISTORY) {
    const oldest = runOrder.shift();
    if (oldest) runStore.delete(oldest);
  }
  return run;
}

function pushRunEvent(run, event) {
  run.logs.push(event);
  for (const res of run.listeners) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }
}

function finishRun(run, exitCode, extra = {}) {
  run.exitCode = exitCode;
  run.status = exitCode === 0 ? 'success' : 'error';
  run.finishedAt = Date.now();
  run.durationMs = run.finishedAt - run.startedAt;
  run.meta = { ...run.meta, ...extra };
  pushRunEvent(run, { type: 'done', status: run.status, exitCode, durationMs: run.durationMs, meta: run.meta, artifacts: run.artifacts });
  for (const res of run.listeners) {
    res.end();
  }
  run.listeners.clear();
}

function runCommandForAction(action, body) {
  return buildLegacyRunnerCommand({
    rootPath: ROOT,
    action,
    taskId: body.taskId,
    project: body.project,
    model: body.model,
  });
}

function extractApplySummary(stdout) {
  const branch = (stdout.match(/Apply complete on branch:\s*(.+)/) || [])[1] || null;
  const commit = (stdout.match(/Commit:\s*(.+)/) || [])[1] || null;
  return { branch: branch ? branch.trim() : null, commit: commit ? commit.trim() : null };
}

function executeActionSync(action, body) {
  const taskId = String(body.taskId || '').trim();
  const project = String(body.project || '').trim();
  if (!LEGACY_FALLBACK_ACTIONS.includes(action)) {
    throw new Error('Invalid legacy fallback action.');
  }
  if (!project || !taskId) {
    throw new Error('project and taskId are required.');
  }

  const command = runCommandForAction(action, body);
  const run = createRun(action, body);
  run.meta.command = command.commandLine;
  pushRunEvent(run, { type: 'status', message: `Started ${action}...`, timestamp: nowIso() });
  const result = runLegacyFallbackSync({
    action,
    taskId,
    project,
    model: body.model,
  }, {
    rootPath: ROOT,
  });
  if (result.stdout) pushRunEvent(run, { type: 'stdout', text: result.stdout, timestamp: nowIso() });
  if (result.stderr) pushRunEvent(run, { type: 'stderr', text: result.stderr, timestamp: nowIso() });
  finishRun(run, result.code || 0);
  const combinedOutput = [result.stdout || '', result.stderr || ''].filter(Boolean).join('\n').trim();
  return {
    ok: (result.code || 0) === 0,
    runId: run.runId,
    exitCode: result.code || 0,
    status: run.status,
    meta: run.meta,
    artifacts: run.artifacts,
    provenance: buildLegacyFallbackProvenance({
      action,
      stageId: action,
      commandLine: command.commandLine,
    }),
    summary: summarizeCommandOutput(combinedOutput || run.logs.map((entry) => entry.message || entry.text || '').join('\n')),
    error: (result.code || 0) === 0 ? null : summarizeCommandOutput(combinedOutput || 'Command failed.'),
  };
}

function evaluateSpatialBootHealth() {
  if (spatialBootHealthSnapshot) {
    return spatialBootHealthSnapshot;
  }
  try {
    const workspace = readSpatialWorkspace();
    const runtime = buildSpatialRuntimePayload(workspace);
    const systemGraph = runtime?.graphs?.system || null;
    const worldGraph = runtime?.graphs?.world || null;
    const hasGraphShape = Boolean(
      runtime
      && runtime.graphs
      && systemGraph
      && worldGraph
      && Array.isArray(systemGraph.nodes)
      && Array.isArray(systemGraph.edges)
      && Array.isArray(worldGraph.nodes)
      && Array.isArray(worldGraph.edges)
      && runtime.qaState
      && runtime.mutationGate
      && runtime.orchestrator
      && runtime.teamBoard
      && runtime.rsg,
    );
    spatialBootHealthSnapshot = {
      checked: true,
      ok: hasGraphShape,
      safeMode: !hasGraphShape,
      reason: hasGraphShape ? '' : 'Spatial runtime shape check failed.',
      checkedAt: nowIso(),
      stateShape: hasGraphShape
        ? {
            systemNodes: systemGraph.nodes.length,
            systemEdges: systemGraph.edges.length,
            worldNodes: worldGraph.nodes.length,
            worldEdges: worldGraph.edges.length,
            graphLayers: Object.keys(runtime.graphs || {}).length,
          }
        : null,
    };
  } catch (error) {
    spatialBootHealthSnapshot = {
      checked: true,
      ok: false,
      safeMode: true,
      reason: String(error.message || error),
      checkedAt: nowIso(),
      stateShape: null,
    };
  }
  return spatialBootHealthSnapshot;
}

function getHealthSnapshot() {
  const workspace = readJsonSafe(SPATIAL_WORKSPACE_FILE, defaultSpatialWorkspace()) || defaultSpatialWorkspace();
  const selfUpgrade = getSelfUpgradeState(workspace);
  const bootHealth = evaluateSpatialBootHealth();
  return {
    ok: true,
    pid: process.pid,
    startedAt: SERVER_STARTED_AT,
    safeMode: Boolean(bootHealth.safeMode),
    bootHealth,
    selfUpgrade: {
      status: selfUpgrade.status,
      deploy: selfUpgrade.deploy,
    },
  };
}

function requestSelfUpgradeDeploy({ confirmRestart, simulate = false } = {}) {
  const workspace = readJsonSafe(SPATIAL_WORKSPACE_FILE, defaultSpatialWorkspace()) || defaultSpatialWorkspace();
  const selfUpgrade = getSelfUpgradeState(workspace);

  if (!confirmRestart) {
    return { ok: false, error: 'Deploy requires explicit restart confirmation.', selfUpgrade };
  }
  if (!selfUpgrade.preflight?.ok) {
    return { ok: false, error: 'Deploy requires a passing self-upgrade preflight.', selfUpgrade };
  }
  if (!selfUpgrade.apply?.ok) {
    return { ok: false, error: 'Deploy requires a successful self-upgrade apply.', selfUpgrade };
  }

  const restartingWorkspace = updateSelfUpgradeState((state) => ({
    ...state,
    status: 'deploying',
    deploy: {
      ...state.deploy,
      status: simulate ? 'healthy' : 'restarting',
      requestedAt: nowIso(),
      restartedAt: simulate ? nowIso() : state.deploy?.restartedAt || null,
      health: {
        status: simulate ? 'healthy' : 'restarting',
        pid: process.pid,
        startedAt: SERVER_STARTED_AT,
      },
    },
    requiresPermission: 'none',
  }));

  return {
    ok: true,
    restarting: !simulate,
    deferredRestart: !simulate,
    scheduleRestart: !simulate,
    selfUpgrade: getSelfUpgradeState(restartingWorkspace),
    healthUrl: '/api/health',
  };
}

function runCardDeployPipeline(cardId, { approvedByUser = false } = {}) {
  const workspace = syncTeamBoardWithSelfUpgrade(readSpatialWorkspace());
  const card = findTeamBoardCard(workspace, cardId);
  if (!card) return { ok: false, error: 'Card not found.', workspace };
  const gate = evaluateDeployGate({ card, workspace });
  if (!gate.ok) {
    const blockedWorkspace = persistBoardWorkspace(mutateTeamBoardCard(workspace, cardId, (currentCard) => applyExecutorGateBlock(currentCard, gate)), 'team-board-deploy-blocked', {
      cardId,
      code: gate.code,
    });
    return { ok: false, error: gate.message, workspace: blockedWorkspace };
  }

  const deployingWorkspace = mutateTeamBoardCard(workspace, cardId, (currentCard) => ({
    ...currentCard,
    status: 'complete',
    approvalState: currentCard.approvalState === 'approved' ? 'approved' : (approvedByUser ? 'approved' : currentCard.approvalState),
    deployStatus: 'deploying',
    executorBlocker: clearExecutorBlocker(),
    updatedAt: nowIso(),
  }));
  persistBoardWorkspace(deployingWorkspace, 'team-board-deploy-start', { cardId, taskId: card.builderTaskId || card.runnerTaskId || null });

  const result = requestSelfUpgradeDeploy({
    confirmRestart: true,
    simulate: process.env.ACE_DISABLE_SELF_RESTART === '1' || process.env.NODE_ENV === 'test',
  });

  if (!result.ok) {
    const failedWorkspace = mutateTeamBoardCard(readSpatialWorkspace(), cardId, (currentCard) => ({
      ...currentCard,
      status: 'review',
      approvalState: 'pending',
      deployStatus: 'flagged',
      executorBlocker: createExecutorBlocker('deploy-failed', result.error || 'Deploy failed.'),
      riskLevel: 'high',
      riskReasons: mergeUnique([...(currentCard.riskReasons || []), result.error || 'Deploy failed.']),
      updatedAt: nowIso(),
    }));
    return {
      ok: false,
      error: result.error || 'Deploy failed.',
      workspace: persistBoardWorkspace(failedWorkspace, 'team-board-deploy-failed', { cardId }),
    };
  }

  let nextWorkspace = syncTeamBoardWithSelfUpgrade(readSpatialWorkspace());
  nextWorkspace = mutateTeamBoardCard(nextWorkspace, cardId, (currentCard) => ({
    ...currentCard,
    status: 'complete',
    deployStatus: result.restarting ? 'deploying' : 'deployed',
    executorBlocker: clearExecutorBlocker(),
    lastHealth: result.selfUpgrade?.deploy?.health || currentCard.lastHealth || null,
    updatedAt: nowIso(),
  }));
  const persistedWorkspace = persistBoardWorkspace(nextWorkspace, 'team-board-deploy-complete', {
    cardId,
    restarting: result.restarting,
  });
  if (result.scheduleRestart) {
    setTimeout(scheduleSelfRestart, 120);
  }
  return {
    ok: true,
    result,
    workspace: persistedWorkspace,
  };
}

async function pumpAutomatedTeamBoard(workspace = null) {
  if (teamBoardAutomationRunning) {
    return readSpatialWorkspace();
  }
  teamBoardAutomationRunning = true;
  try {
    let nextWorkspace = syncTeamBoardWithSelfUpgrade(workspace || readSpatialWorkspace());
    const board = normalizeTeamBoardState(nextWorkspace);
    const reviewApprovedCard = board.cards.find((card) => card.status === 'review' && card.approvalState === 'approved') || null;
    const activeCard = board.cards.find((card) => card.status === 'active') || null;
    const queuedVerifyCard = board.cards.find((card) => (
      card.executionPackage?.status === 'ready'
      && card.verifyRequired
      && ['queued', 'failed', 'blocked'].includes(card.verifyStatus)
      && !['missing-anchor', 'preflight-failed', 'preflight-stale', 'builder-failed'].includes(card.executorBlocker?.code)
    )) || null;
    const queuedApplyCard = board.cards.find((card) => (
      card.status === 'complete'
      && card.applyStatus === 'queued'
      && (!card.verifyRequired || (card.verifyStatus === 'passed' && (!card.executionPackage?.verificationPlan?.signature || card.verifiedSignature === card.executionPackage.verificationPlan.signature)))
    )) || null;
    const queuedDeployCard = board.cards.find((card) => card.status === 'complete' && card.deployStatus === 'queued') || null;

    if (queuedDeployCard) {
      nextWorkspace = runCardDeployPipeline(queuedDeployCard.id).workspace || nextWorkspace;
    } else if (queuedApplyCard) {
      nextWorkspace = runCardApplyPipeline(queuedApplyCard.id).workspace || nextWorkspace;
    } else if (queuedVerifyCard) {
      nextWorkspace = (await runCardVerifyPipeline(queuedVerifyCard.id)).workspace || nextWorkspace;
    } else if (reviewApprovedCard) {
      const approvedWorkspace = mutateTeamBoardCard(nextWorkspace, reviewApprovedCard.id, (card) => ({
        ...card,
        status: 'complete',
        applyStatus: card.verifyRequired && card.verifyStatus !== 'passed' ? 'idle' : 'queued',
        updatedAt: nowIso(),
      }));
      nextWorkspace = persistBoardWorkspace(approvedWorkspace, 'team-board-approval-queued', { cardId: reviewApprovedCard.id });
    } else if (activeCard && activeCard.executionPackage?.status !== 'ready') {
      nextWorkspace = runCardBuilderPipeline(activeCard.id).workspace || nextWorkspace;
    }
    return nextWorkspace;
  } finally {
    teamBoardAutomationRunning = false;
  }
}

async function pumpAutomatedTeamBoardAsync(workspace = null) {
  let nextWorkspace = normalizeSpatialWorkspaceShape(syncTeamBoardWithSelfUpgrade(workspace || readSpatialWorkspace()));
  const plannerCycle = await maybeRunPlannerWorker(nextWorkspace, { mode: 'auto' });
  nextWorkspace = plannerCycle.workspace || nextWorkspace;
  return await pumpAutomatedTeamBoard(nextWorkspace);
}

app.get('/api/dashboard', (req, res) => {
  const anchorBundle = getAnchorBundle();
  const files = {};
  const errors = [];
  for (const file of dashboardFiles) {
    const data = readDashboardFile(file);
    files[file] = data;
    if (data.error) errors.push({ file, error: data.error });
  }
  const drift = buildRuntimeDrift(anchorBundle, readSpatialWorkspace());
  res.json({
    refreshedAt: nowIso(),
    refreshIntervalMs: Number(process.env.DASHBOARD_REFRESH_MS || REFRESH_MS_DEFAULT),
    state: {
      ...anchorBundle.managerSummary,
      drift_flags: drift.map((flag) => flag.id),
    },
    manager: anchorBundle.managerSummary,
    truthSources: anchorBundle.truthSources,
    drift,
    anchorRefs: anchorBundle.anchorRefs,
    files,
    errors,
  });
});

app.get('/api/task-artifacts', (req, res) => {
  const taskId = String(req.query?.taskId || '').trim();
  res.json({
    ok: true,
    ...readTaskArtifactStatus(taskId),
  });
});

app.get('/api/projects', (req, res) => {
  res.json({
    projects: listProjectsForUi(),
    config: resolveTargetsConfig(ROOT),
  });
});

app.post('/api/projects/run', async (req, res) => {
  const body = req.body || {};
  const projectKey = String(body.project || body.name || '').trim();
  if (!projectKey) {
    return res.status(400).json({ error: 'project is required.' });
  }
  try {
    const launch = await launchProject(projectKey);
    return res.json({
      ok: true,
      project: launch.project,
      projectType: launch.projectType,
      url: launch.url,
      supportedOrigin: launch.supportedOrigin || launch.project?.supportedOrigin || null,
      reused: Boolean(launch.reused),
      runtime: {
        pid: launch.pid,
        port: launch.port,
        command: launch.command,
        launchedAt: launch.launchedAt,
      },
    });
  } catch (error) {
    const message = String(error.message || error);
    const status = /Unknown project/i.test(message)
      ? 404
      : /Only the topdown-slice static web prototype/i.test(message)
        ? 400
        : 500;
    return res.status(status).json({ error: message });
  }
});

app.get('/api/tasks', (req, res) => {
  res.json({ tasks: getTaskFolders() });
});

app.get('/api/presets', (req, res) => {
  const data = readJsonSafe(COMMANDS_FILE, {});
  const descriptions = {
    ui_start: 'Starts the UI with npm start (long-running dev server).',
    ui_node: 'Runs the Node Express UI server directly with node server.js.',
    runner_compile: 'Checks runner Python syntax with py_compile.',
  };
  const presets = Object.entries(data || {}).map(([name, spec]) => ({
    name,
    description: descriptions[name] || 'Runs a configured local command preset.',
    cwd: spec.cwd || '.',
    timeout_s: spec.timeout_s || null,
    cmd: spec.cmd || [],
  }));
  res.json({ presets });
});

app.get('/api/runs', (req, res) => {
  res.json({ runs: getRunsSnapshot() });
});

  app.get('/api/health', (req, res) => {
    res.json(getHealthSnapshot());
  });

  app.get('/api/spatial/safe-mode/status', (req, res) => {
    res.json({
      ok: true,
      snapshot: buildSafeModeSnapshot(ROOT),
    });
  });

  app.post('/api/spatial/safe-mode/diagnosis', (req, res) => {
    try {
      res.json(runSafeModeDiagnosis(ROOT));
    } catch (error) {
      res.status(500).json({ error: String(error.message || error) });
    }
  });

  app.post('/api/spatial/safe-mode/constrained-fix-pass', (req, res) => {
    try {
      res.json(runConstrainedSafeModeFixPass(ROOT));
    } catch (error) {
      res.status(500).json({ error: String(error.message || error) });
    }
  });

  app.post('/api/qa/run', async (req, res) => {
    try {
      const body = req.body || {};
    const report = await runStructuredQA({
      rootPath: ROOT,
      existingApp: app,
      allowedPaths: body.allowedPaths,
      fixture: body.fixture,
    });
    writeStructuredQAReport(ROOT, report, 'latest');
    res.json({
      ...report,
      runtime: await refreshSpatialRuntime({ persist: true }),
    });
  } catch (error) {
    res.status(500).json({
      status: 'fail',
      summary: 'qa lead crashed',
      failures: [
        {
          desk: 'qa',
          test: 'suite_boot',
          reason: String(error.message || error),
        },
      ],
    });
  }
});

app.post('/api/llm/test', async (req, res) => {
  const body = req.body || {};
  const prompt = String(body.prompt || '').trim();
  if (!prompt) {
    return res.status(400).json({ error: 'prompt is required.' });
  }
  const requestedModel = String(body.model || 'mistral:latest').trim() || 'mistral:latest';
  try {
    const result = await callOllamaGenerate({
      prompt,
      model: requestedModel,
      host: String(body.host || '').trim() || undefined,
      timeoutMs: Number(body.timeoutMs) > 0 ? Number(body.timeoutMs) : undefined,
      expectJson: false,
    });
    return res.json({
      ok: true,
      status: 'live',
      backend: 'ollama',
      model: requestedModel,
      prompt,
      text: result.text,
    });
  } catch (error) {
    const reason = String(error.message || error);
    return res.status(500).json({
      ok: false,
      status: classifyLlmFailureStatus(reason, false),
      backend: 'ollama',
      model: requestedModel,
      error: reason,
    });
  }
});

app.post('/api/spatial/preflight', (req, res) => {
  const body = req.body || {};
  const stage = String(body.stage || body.action || '').trim() || 'rebuild';
  const taskId = String(body.taskId || '').trim();
  const project = String(body.project || '').trim();
  const projectTarget = project ? resolveProjectTarget(project) : { projectKey: null, projectPath: null };
  const surface = evaluateStagePreflightSurface({
    stage,
    taskId,
    projectKey: projectTarget.projectKey || null,
    projectPath: projectTarget.projectPath || null,
  });
  res.json(surface);
});

app.post('/api/spatial/self-upgrade/preflight', (req, res) => {
  const body = req.body || {};
  const taskId = String(body.taskId || '').trim();
  const requestedProject = String(body.project || SELF_TARGET_KEY).trim() || SELF_TARGET_KEY;
  if (!taskId) {
    return res.status(400).json({ error: 'taskId is required for self-upgrade preflight.' });
  }

  const { projectKey, projectPath } = resolveProjectTarget(requestedProject);
  if (!isSelfTarget(projectKey, projectPath, ROOT)) {
    return res.status(400).json({ error: 'Self-upgrade preflight only runs against the ACE self target.' });
  }

  const taskFolder = getTaskFolders().find((t) => t.startsWith(taskId.slice(0, 4)));
  if (!taskFolder) {
    return res.status(400).json({ error: 'Task folder not found for self-upgrade preflight.' });
  }

  const validation = validateApply(projectPath, taskFolder);
  const patchText = fs.existsSync(validation.patchPath) ? fs.readFileSync(validation.patchPath, 'utf8') : '';
  const patchReview = reviewSelfUpgradePatch({
    patchText,
    taskId,
    projectKey,
    projectPath,
    rootPath: ROOT,
  });
  const preflight = runSelfUpgradePreflight({
    taskId,
    projectKey,
    projectPath,
    validation,
    patchReview,
  });
  const policySurface = buildAutonomyPolicyResponse({
    rootPath: ROOT,
    taskId,
    taskDir: validation.taskDir,
    stage: 'self-upgrade',
    action: 'apply',
    projectKey,
    projectPath,
    preflight,
    taskCache: readTaskCache(ROOT, {
      taskId,
      taskDir: validation.taskDir,
      stage: 'executor',
    }),
    validation,
    changedFiles: validation.changedFiles || [],
    patchText,
    patchValid: Boolean(validation.ok && patchReview.ok && patchText.trim()),
    patchPath: validation.patchPath,
    failureMessage: !validation.ok
      ? (validation.refusalReasons[0] || 'Self-upgrade validation failed.')
      : (!patchReview.ok
        ? (patchReview.refusalReasons[0] || 'Self-upgrade patch review failed.')
        : preflight.summary || ''),
    cacheStatus: null,
    failureRisky: !preflight.ok || !patchReview.ok || !validation.ok,
  });
  const workspace = updateSelfUpgradeState((state) => ({
    ...state,
    status: preflight.ok ? 'ready-to-apply' : 'blocked',
    taskId,
    targetProjectKey: SELF_TARGET_KEY,
    patchReview,
    preflight,
    deploy: preflight.ok ? state.deploy : createDefaultSelfUpgradeState({ serverStartedAt: SERVER_STARTED_AT, pid: process.pid }).deploy,
    requiresPermission: preflight.ok ? 'user-confirmation' : 'none',
  }));
  const guard = buildGuardSurfacePayload({ stage: 'self-upgrade', preflight });
  res.json({
    ok: preflight.ok,
    stage: guard.stage,
    guard_status: guard.guard_status,
    guard_reason: guard.guard_reason,
    guard_reasons: guard.guard_reasons,
    cache_status: guard.cache_status,
    checks: guard.checks,
    policy: policySurface.policy,
    selfUpgrade: getSelfUpgradeState(workspace),
  });
});

app.post('/api/spatial/self-upgrade/deploy', (req, res) => {
  const body = req.body || {};
  const result = requestSelfUpgradeDeploy({
    confirmRestart: Boolean(body.confirmRestart),
    simulate: body.simulate === true || process.env.ACE_DISABLE_SELF_RESTART === '1' || process.env.NODE_ENV === 'test',
  });
  if (!result.ok) {
    return res.status(400).json({
      error: result.error,
      selfUpgrade: result.selfUpgrade,
    });
  }
  res.json(result);
  if (result.scheduleRestart) {
    setTimeout(scheduleSelfRestart, 80);
  }
});

app.post('/api/execute', (req, res) => {
  const body = req.body || {};
  const action = String(body.action || '').toLowerCase();
  const project = String(body.project || '').trim();
  const taskId = String(body.taskId || '').trim();

  if (!LEGACY_FALLBACK_ACTIONS.includes(action)) {
    return res.status(400).json({ error: `Invalid legacy fallback action. Supported actions: ${LEGACY_FALLBACK_ACTIONS.join(', ')}.` });
  }
  if (!project || !taskId) {
    return res.status(400).json({ error: 'project and taskId are required.' });
  }

  const run = createRun(action, body);
  let stream;
  try {
    stream = runLegacyFallbackStream({
      action,
      taskId,
      project,
      model: body.model,
    }, {
      rootPath: ROOT,
      onStdout: (text) => pushRunEvent(run, { type: 'stdout', text, timestamp: nowIso() }),
      onStderr: (text) => pushRunEvent(run, { type: 'stderr', text, timestamp: nowIso() }),
    });
  } catch (err) {
    return res.status(400).json({ error: String(err.message || err) });
  }
  const child = stream.child;
  run.meta.command = stream.command.commandLine;

  pushRunEvent(run, { type: 'status', message: `Started legacy fallback ${action}...`, timestamp: nowIso() });

  child.on('close', (code) => {
    finishRun(run, code || 0);
  });

  child.on('error', (err) => {
    pushRunEvent(run, { type: 'stderr', text: String(err), timestamp: nowIso() });
    finishRun(run, 1);
  });

  res.json({ ok: true, runId: run.runId });
});

app.get('/api/stream/:runId', (req, res) => {
  const run = runStore.get(req.params.runId);
  if (!run) return res.status(404).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  for (const event of run.logs) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  if (run.status === 'running') {
    run.listeners.add(res);
  } else {
    res.write(`data: ${JSON.stringify({ type: 'done', status: run.status, exitCode: run.exitCode, durationMs: run.durationMs, meta: run.meta, artifacts: run.artifacts })}\n\n`);
    res.end();
  }

  req.on('close', () => run.listeners.delete(res));
});

app.post('/api/open-task-folder', (req, res) => {
  const taskId = String((req.body || {}).taskId || '').trim();
  const folder = getTaskFolders().find((t) => t.startsWith(taskId.slice(0, 4)));
  if (!folder) return res.status(404).json({ error: 'Task folder not found.' });
  const full = path.join(TASKS_DIR, folder);

  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', full], { detached: true, windowsHide: true });
    } else if (process.platform === 'darwin') {
      spawn('open', [full], { detached: true });
    } else {
      spawn('xdg-open', [full], { detached: true });
    }
    res.json({ ok: true, path: full });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/add/idea', (req, res) => {
  const text = String((req.body || {}).text || '').trim();
  if (!text) return res.status(400).json({ error: 'Idea text is required.' });
  const target = path.join(ROOT, 'idea.txt');
  fs.appendFileSync(target, `[${nowIso()}] ${text}${os.EOL}`, 'utf8');
  res.json({ ok: true, path: target });
});

app.post('/api/add/task', (req, res) => {
  const title = String((req.body || {}).title || '').trim();
  if (!title) return res.status(400).json({ error: 'Task title is required.' });
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'task';
  const tasks = getTaskFolders();
  const last = tasks.length ? Number(tasks[tasks.length - 1].slice(0, 4)) : 0;
  const id = String(last + 1).padStart(4, '0');
  const folder = `${id}-${slug}`;
  const full = path.join(TASKS_DIR, folder);
  fs.mkdirSync(full, { recursive: true });
  fs.writeFileSync(path.join(full, 'context.md'), `# Task ${id}: ${title}\n\n## Context\n- Describe intent here.\n`, 'utf8');
  fs.writeFileSync(path.join(full, 'patch.diff'), '', 'utf8');
  res.json({ ok: true, taskId: id, folder });
});

app.post('/api/add/project', (req, res) => {
  const name = String((req.body || {}).name || '').trim();
  const projectPath = String((req.body || {}).path || '').trim();
  if (!name || !projectPath) return res.status(400).json({ error: 'name and path are required.' });
  if (!fs.existsSync(projectPath)) return res.status(400).json({ error: 'Project path does not exist.' });

  const projects = loadProjectsMap();
  projects[name] = projectPath;
  writeTargetsConfig(projects);
  res.json({ ok: true, project: { key: name, path: projectPath } });
});

app.post('/api/ta/candidates', (req, res) => {
  const body = req.body || {};

  try {
    validateGap(body.gap);
  } catch (error) {
    return res.status(400).json({ error: String(error.message || error) });
  }

  return res.json({
    candidates: generateCandidates(body.gap),
  });
});

app.get('/api/ta/department', async (req, res) => {
  try {
    const state = normalizeTaDepartmentState(readJsonSafe(TA_DEPARTMENT_FILE, createDefaultTaDepartmentState()) || createDefaultTaDepartmentState());
    res.json(await buildTaDepartmentPayload(state));
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.post('/api/ta/hire', async (req, res) => {
  const body = req.body || {};
  try {
    const candidate = normalizeTaCandidateCard(body.candidate || body.profile || body);
    const deskId = String(body.deskId || candidate.hiredDeskId || candidate.primaryDeskTarget || '').trim();
    if (!deskId) throw new Error('deskId is required.');
    if (!candidate.deskTargets.includes(deskId)) {
      throw new Error(`deskId "${deskId}" is not one of the candidate desk targets.`);
    }
    const currentState = normalizeTaDepartmentState(readJsonSafe(TA_DEPARTMENT_FILE, createDefaultTaDepartmentState()) || createDefaultTaDepartmentState());
    if (currentState.hiredCandidates.some((entry) => entry.id === candidate.id)) {
      throw new Error(`Candidate "${candidate.id}" is already hired.`);
    }
    const hiredCandidate = {
      ...candidate,
      hiredAt: nowIso(),
      hiredDeskId: deskId,
      contractLocked: true,
    };
    const nextState = {
      ...currentState,
      hiredCandidates: [...currentState.hiredCandidates, hiredCandidate],
      updatedAt: nowIso(),
      lastGeneratedGap: body.gapDescription || currentState.lastGeneratedGap || null,
    };
    writeJson(TA_DEPARTMENT_FILE, nextState);
    res.status(201).json({
      ok: true,
      hiredCandidate,
      department: await buildTaDepartmentPayload(nextState),
    });
  } catch (error) {
    res.status(400).json({ error: String(error.message || error) });
  }
});

app.get('/api/spatial/workspace', async (req, res) => {
  const workspace = normalizeSpatialWorkspaceShape(refreshSpatialOrchestrator({
    workspace: await pumpAutomatedTeamBoardAsync(),
  }));
  workspace.graph = workspace.graph || { nodes: [], edges: [] };
  workspace.graphs = workspace.graphs || normalizeGraphBundle(workspace);
  workspace.sketches = Array.isArray(workspace.sketches) ? workspace.sketches : [];
  workspace.annotations = Array.isArray(workspace.annotations) ? workspace.annotations : [];
  workspace.architectureMemory = workspace.architectureMemory || {};
  workspace.agentComments = workspace.agentComments || {};
  workspace.studio = workspace.studio || {};
  workspace.rsg = workspace.rsg || buildRsgState(workspace);
  res.json(workspace);
});

app.get('/api/spatial/layout/catalog', (req, res) => {
  res.json(buildStudioLayoutCatalog());
});

app.post('/api/spatial/layout/actions', (req, res) => {
  const action = String(req.body?.action || '').trim();
  if (!action) {
    res.status(400).json({ error: 'action is required' });
    return;
  }
  try {
    const currentWorkspace = readSpatialWorkspace();
    const currentLayout = normalizeStudioLayoutSchema(currentWorkspace?.studio?.layout || {});
    let mutationResult = null;
    const updatedWorkspace = updateSpatialWorkspace((workspace) => {
      const workspaceLayout = normalizeStudioLayoutSchema(workspace?.studio?.layout || {});
      if (action === 'add_department') {
        mutationResult = addDepartmentToLayout(workspaceLayout, {
          templateId: req.body?.templateId,
          returnResult: true,
        });
      } else if (action === 'add_desk') {
        mutationResult = addDeskToLayout(workspaceLayout, {
          departmentId: req.body?.departmentId,
          templateId: req.body?.templateId,
          returnResult: true,
        });
      } else {
        throw new Error(`Unsupported layout action: ${action}`);
      }
      if (mutationResult?.ok === false && mutationResult?.validation?.status === 'block') {
        return workspace;
      }
      return {
        ...workspace,
        studio: {
          ...(workspace.studio || {}),
          layout: mutationResult?.layout || workspaceLayout,
        },
      };
    });
    const nextLayout = updatedWorkspace?.studio?.layout || currentLayout || createDefaultStudioLayoutSchema();
    const validation = mutationResult?.validation || null;
    const createdDepartmentId = action === 'add_department' && mutationResult?.ok
      ? nextLayout.departments.find((entry) => !currentLayout.departments.some((previous) => previous.id === entry.id))?.id || null
      : null;
    const createdDeskId = action === 'add_desk' && mutationResult?.ok
      ? listStudioDeskIds(nextLayout).find((deskId) => !listStudioDeskIds(currentLayout).includes(deskId)) || null
      : null;
    res.json({
      ok: mutationResult?.ok !== false,
      action,
      layout: nextLayout,
      createdDepartmentId,
      createdDeskId,
      focusDeskId: createdDeskId,
      validation,
      reason: mutationResult?.ok === false ? mutationResult?.validation?.blockers?.[0]?.reason || mutationResult?.validation?.issues?.[0]?.reason || 'Dependency validation blocked.' : null,
      catalog: buildStudioLayoutCatalog(),
    });
  } catch (error) {
    res.status(400).json({ error: String(error.message || error) });
  }
});

app.get('/api/spatial/desks/:deskId/properties', async (req, res) => {
  const deskId = String(req.params.deskId || '').trim();
  const workspace = normalizeSpatialWorkspaceShape(refreshSpatialOrchestrator({
    workspace: await pumpAutomatedTeamBoardAsync(),
  }));
  if (!hasStudioDesk(workspace?.studio?.layout || {}, deskId)) {
    res.status(404).json({ error: 'Unknown desk id' });
    return;
  }
  const payload = buildDeskPropertiesPayload(workspace, deskId);
  console.debug(`[desk-properties] loaded desk=${deskId} tasks=${payload.tasks.length} modules=${payload.modules.length} reports=${payload.reports.length}`);
  res.json(payload);
});

app.post('/api/spatial/desks/:deskId/actions', (req, res) => {
  const deskId = String(req.params.deskId || '').trim();
  const currentWorkspace = readSpatialWorkspace();
  if (!hasStudioDesk(currentWorkspace?.studio?.layout || {}, deskId)) {
    res.status(404).json({ error: 'Unknown desk id' });
    return;
  }
  if (deskId === QA_LEAD_DESK_ID) {
    res.status(403).json({ error: 'QA desk properties are read-only.' });
    return;
  }
  const action = String(req.body?.action || '').trim();
  if (!action) {
    res.status(400).json({ error: 'action is required' });
    return;
  }
  const isCtoDesk = deskId === 'cto-architect';
  const isArchivistDesk = deskId === 'memory-archivist';
  const allowedActions = new Set([
    ...(isCtoDesk ? ['add_agent', 'assign_module', 'add_test', 'set_context', 'set_guardrails'] : []),
    ...(isArchivistDesk ? ['archive-summary', 'snapshot-history'] : []),
  ]);
  if (!allowedActions.has(action)) {
    res.status(403).json({ error: 'This desk is read-only for that action.' });
    return;
  }
  if (deskId === 'memory-archivist' && (action === 'archive-summary' || action === 'snapshot-history')) {
    try {
      const writeback = runArchivistWriteback({
        workspace: readSpatialWorkspace(),
        dryRun: Boolean(req.body?.dryRun),
        includeTasks: action !== 'snapshot-history',
      });
      const payload = buildDeskPropertiesPayload(readSpatialWorkspace(), deskId);
      res.json({ ok: true, action, deskId, payload, writeback });
    } catch (error) {
      res.status(500).json({ error: String(error.message || error) });
    }
    return;
  }
  try {
    const updatedWorkspace = updateSpatialWorkspace((workspace) => {
      const current = normalizeDeskPropertiesState(workspace);
      const nextDesk = { ...(current[deskId] || { managedAgents: [], moduleIds: [], manualTests: [], departmentContext: '', guardrails: [], contextSlices: [] }) };
      if (action === 'add_agent') {
        const agentId = String(req.body?.agentId || '').trim();
        if (!agentId) throw new Error('agentId is required');
        nextDesk.managedAgents = [...new Set([...(nextDesk.managedAgents || []), agentId])];
      } else if (action === 'assign_module') {
        const moduleId = String(req.body?.moduleId || '').trim();
        if (!moduleId) throw new Error('moduleId is required');
        const moduleExists = listModuleManifests().some((entry) => entry.id === moduleId);
        if (!moduleExists) throw new Error(`Unknown moduleId: ${moduleId}`);
        nextDesk.moduleIds = [...new Set([...(nextDesk.moduleIds || []), moduleId])];
      } else if (action === 'add_test') {
        const testId = String(req.body?.testId || '').trim();
        if (!testId) throw new Error('testId is required');
        nextDesk.manualTests = [
          ...(nextDesk.manualTests || []),
          {
            id: testId,
            verdict: String(req.body?.verdict || 'unknown'),
            notes: String(req.body?.notes || ''),
            createdAt: nowIso(),
          },
        ];
      } else if (action === 'set_context') {
        nextDesk.departmentContext = String(req.body?.context || req.body?.summary || '').trim();
        const slices = Array.isArray(req.body?.slices) ? req.body.slices : [];
        nextDesk.contextSlices = slices
          .filter((entry) => entry && String(entry.summary || entry.title || entry.label || '').trim())
          .map((entry, index) => ({
            id: String(entry.id || `${deskId}-context-${index}`),
            summary: String(entry.summary || entry.title || entry.label || '').trim(),
            detail: String(entry.detail || entry.notes || '').trim(),
          }));
      } else if (action === 'set_guardrails') {
        const guardrails = Array.isArray(req.body?.guardrails) ? req.body.guardrails : String(req.body?.guardrails || '').split('\n');
        nextDesk.guardrails = guardrails.map((entry) => String(entry || '').trim()).filter(Boolean);
      } else {
        throw new Error(`Unsupported action: ${action}`);
      }
      return {
        ...workspace,
        studio: {
          ...(workspace.studio || {}),
          deskProperties: {
            ...current,
            [deskId]: nextDesk,
          },
        },
      };
    });
    const payload = buildDeskPropertiesPayload(updatedWorkspace, deskId);
    res.json({ ok: true, action, deskId, payload });
  } catch (error) {
    res.status(400).json({ error: String(error.message || error) });
  }
});

app.get('/api/spatial/models', (req, res) => {
  res.json({ models: listAgentModelOptions() });
});

app.post('/api/spatial/archive/writeback', (req, res) => {
  try {
    res.json(runArchivistWriteback({
      workspace: readSpatialWorkspace(),
      dryRun: Boolean(req.body?.dryRun),
      includeTasks: req.body?.includeTasks !== false,
    }));
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.get('/api/spatial/agents/:agentId/capabilities', (req, res) => {
  const agentId = normalizeAgentId(req.params.agentId);
  const snapshot = readAgentCapabilityProfile(ROOT, agentId);
  if (!snapshot.exists) {
    res.json({
      agentId,
      profile: null,
      exists: false,
      jsonPath: snapshot.filePath ? relativeToRoot(snapshot.filePath) : null,
      markdownPath: snapshot.markdownPath ? relativeToRoot(snapshot.markdownPath) : null,
    });
    return;
  }
  res.json({
    agentId,
    profile: snapshot.profile,
    exists: true,
    jsonPath: snapshot.filePath ? relativeToRoot(snapshot.filePath) : null,
    markdownPath: snapshot.markdownPath ? relativeToRoot(snapshot.markdownPath) : null,
  });
});

app.post('/api/spatial/agents/:agentId/capabilities/rebuild', (req, res) => {
  const agentId = normalizeAgentId(req.params.agentId);
  try {
    const rebuilt = rebuildAgentCapabilityLedger(ROOT, { agentId });
    const snapshot = readAgentCapabilityProfile(ROOT, agentId);
    res.json({
      agentId,
      profile: snapshot.profile,
      exists: snapshot.exists,
      rebuilt,
      jsonPath: snapshot.filePath ? relativeToRoot(snapshot.filePath) : null,
      markdownPath: snapshot.markdownPath ? relativeToRoot(snapshot.markdownPath) : null,
    });
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.get('/api/spatial/agents/:agentId/ledger', (req, res) => {
  const agentId = normalizeAgentId(req.params.agentId);
  if (agentId !== 'dave') {
    res.status(404).json({ error: 'Learning ledger is available for Dave only.' });
    return;
  }
  const entries = listLearningLedgerEntries(agentId);
  res.json({
    agentId,
    entries,
    stats: computeLearningLedgerStats(entries),
  });
});

app.post('/api/spatial/agents/:agentId/ledger', (req, res) => {
  const agentId = normalizeAgentId(req.params.agentId);
  if (agentId !== 'dave') {
    res.status(404).json({ error: 'Learning ledger is available for Dave only.' });
    return;
  }
  const body = req.body || {};
  try {
    const entry = writeLearningLedgerEntry(agentId, {
      taskPrompt: String(body.taskPrompt || body.prompt || '').trim(),
      contextRefs: Array.isArray(body.contextRefs) ? body.contextRefs.filter(Boolean) : [],
      generatedOutput: String(body.generatedOutput || body.output || '').trim(),
      responseStatus: String(body.responseStatus || 'live').trim(),
      qaOutcome: String(body.qaOutcome || 'unknown').trim(),
      qaReason: String(body.qaReason || '').trim(),
      datasetReady: Boolean(body.datasetReady),
      runId: String(body.runId || '').trim() || null,
      backend: String(body.backend || DEFAULT_CONTEXT_MANAGER_BACKEND).trim() || DEFAULT_CONTEXT_MANAGER_BACKEND,
      model: String(body.model || DEFAULT_CONTEXT_MANAGER_MODEL).trim() || DEFAULT_CONTEXT_MANAGER_MODEL,
      tokensUsed: Number.isFinite(Number(body.tokensUsed || 0)) ? Number(body.tokensUsed) : 0,
      durationMs: Number.isFinite(Number(body.durationMs || 0)) ? Number(body.durationMs) : 0,
      contextAlignmentScore: Number.isFinite(Number(body.contextAlignmentScore || 0)) ? Number(body.contextAlignmentScore) : 0,
      contextAlignmentReason: String(body.contextAlignmentReason || '').trim() || null,
    });
    res.status(201).json({ entry, stats: computeLearningLedgerStats(listLearningLedgerEntries(agentId)) });
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.patch('/api/spatial/agents/:agentId/ledger/:entryId', (req, res) => {
  const agentId = normalizeAgentId(req.params.agentId);
  const entryId = String(req.params.entryId || '').trim();
  if (agentId !== 'dave') {
    res.status(404).json({ error: 'Learning ledger is available for Dave only.' });
    return;
  }
  if (!entryId) {
    res.status(400).json({ error: 'entryId is required.' });
    return;
  }
  const body = req.body || {};
  const patch = {
    approvedFix: body.approvedFix ?? body.fix ?? null,
    datasetReady: body.datasetReady ?? Boolean(body.datasetReady),
    qaOutcome: body.qaOutcome ? String(body.qaOutcome).trim() : undefined,
    qaReason: body.qaReason ? String(body.qaReason).trim() : undefined,
    responseStatus: body.responseStatus ? String(body.responseStatus).trim() : undefined,
  };
  Object.keys(patch).forEach((key) => {
    if (patch[key] === undefined) delete patch[key];
  });
  try {
    const updated = updateLearningLedgerEntry(agentId, entryId, patch);
    if (!updated) {
      res.status(404).json({ error: 'Ledger entry not found.' });
      return;
    }
    res.json({ entry: updated, stats: computeLearningLedgerStats(listLearningLedgerEntries(agentId)) });
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.post('/api/spatial/agents/dave/properties', (req, res) => {
  const body = req.body || {};
  const agentId = 'dave';
  try {
    const nextWorkspace = updateSpatialWorkspace((workspace) => {
      const currentAgents = workspace?.studio?.agentWorkers || {};
      const currentDave = normalizeAgentWorkersState(currentAgents).dave || {};
      const allowed = {
        name: String(body.name || currentDave.name || 'Dave').trim() || 'Dave',
        role: String(body.role || currentDave.role || 'Practical learning companion').trim(),
        model: String(body.model || currentDave.model || DEFAULT_CONTEXT_MANAGER_MODEL).trim() || DEFAULT_CONTEXT_MANAGER_MODEL,
        status: String(body.status || currentDave.status || 'idle').trim() || 'idle',
        backend: String(body.backend || currentDave.backend || DEFAULT_CONTEXT_MANAGER_BACKEND).trim() || DEFAULT_CONTEXT_MANAGER_BACKEND,
        responseStatus: String(body.responseStatus || currentDave.responseStatus || 'idle').trim(),
        lastRunId: body.lastRunId ? String(body.lastRunId).trim() : null,
        tokensUsed: Number.isFinite(Number(body.tokensUsed ?? currentDave.tokensUsed ?? 0)) ? Number(body.tokensUsed ?? currentDave.tokensUsed ?? 0) : 0,
        durationMs: Number.isFinite(Number(body.durationMs ?? currentDave.durationMs ?? 0)) ? Number(body.durationMs ?? currentDave.durationMs ?? 0) : 0,
        contextAlignmentScore: Number.isFinite(Number(body.contextAlignmentScore ?? currentDave.contextAlignmentScore ?? 0)) ? Number(body.contextAlignmentScore ?? currentDave.contextAlignmentScore ?? 0) : 0,
        contextAlignmentReason: String(body.contextAlignmentReason || currentDave.contextAlignmentReason || '').trim() || null,
      };
      return {
        ...workspace,
        studio: {
          ...(workspace.studio || {}),
          agentWorkers: {
            ...(workspace.studio?.agentWorkers || {}),
            dave: {
              ...currentDave,
              ...allowed,
            },
          },
        },
      };
    });
    res.json({ ok: true, agent: nextWorkspace.studio.agentWorkers.dave });
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.get('/api/spatial/runtime', async (req, res) => {
  res.json(await refreshSpatialRuntime({ persist: true }));
});

app.post('/api/spatial/agents/context-manager/run', async (req, res) => {
  const body = req.body || {};
  const text = String(body.text || '').trim();
  if (!text) {
    return res.status(400).json({ error: 'text is required.' });
  }
  const mode = String(body.mode || 'manual').toLowerCase() === 'auto' ? 'auto' : 'manual';
  const cycle = await maybeRunContextManagerWorker(readSpatialWorkspace(), {
    text,
    sourceNodeId: String(body.nodeId || '').trim() || null,
    source: String(body.source || 'manual').trim() || 'manual',
    mode,
  });
  if (!cycle.skipped && cycle.result?.run) {
    if (!cycle.ok) {
      return res.status(503).json({
        ...buildAgentFailurePayload(cycle.result, {
          report: cycle.result.report || null,
          handoff: cycle.result.handoff || null,
          runtime: buildSpatialRuntimePayload(refreshSpatialOrchestrator({
            persist: true,
            workspace: cycle.workspace,
          })),
        }),
      });
    }
    return res.json({
      ok: cycle.ok,
      worker: summarizeContextManagerRun(cycle.result.run),
      report: cycle.result.report,
      handoff: cycle.result.handoff,
      runtime: buildSpatialRuntimePayload(refreshSpatialOrchestrator({
        persist: true,
        workspace: cycle.workspace,
      })),
    });
  }
  return res.status(mode === 'manual' ? 400 : 200).json({
    ok: false,
    skipped: Boolean(cycle.skipped),
    reason: cycle.reason,
    runtime: buildSpatialRuntimePayload(refreshSpatialOrchestrator({
      persist: true,
      workspace: cycle.workspace,
    })),
  });
});

app.post('/api/spatial/agents/planner/run', async (req, res) => {
  const body = req.body || {};
  const mode = String(body.mode || 'manual').toLowerCase() === 'auto' ? 'auto' : 'manual';
  const handoffId = String(body.handoffId || '').trim() || null;
  const cycle = await maybeRunPlannerWorker(readSpatialWorkspace(), { mode, handoffId });
  if (!cycle.skipped && cycle.result?.run) {
    if (!cycle.ok) {
      return res.status(503).json({
        ...buildAgentFailurePayload(cycle.result, {
          run: summarizePlannerRun(cycle.result.run),
          runtime: buildSpatialRuntimePayload(refreshSpatialOrchestrator({
            persist: true,
            workspace: cycle.workspace,
          })),
        }),
        preflight: cycle.preflight || cycle.result?.preflight || null,
      });
    }
    return res.json({
      ok: cycle.ok,
      run: summarizePlannerRun(cycle.result.run),
      runtime: buildSpatialRuntimePayload(refreshSpatialOrchestrator({
        persist: true,
        workspace: cycle.workspace,
      })),
      preflight: cycle.preflight || cycle.result?.preflight || null,
    });
  }
  return res.status(mode === 'manual' ? 400 : 200).json({
    ok: false,
    skipped: Boolean(cycle.skipped),
    reason: cycle.reason,
    runtime: buildSpatialRuntimePayload(refreshSpatialOrchestrator({
      persist: true,
      workspace: cycle.workspace,
    })),
    preflight: cycle.preflight || cycle.result?.preflight || null,
  });
});

app.post('/api/spatial/agents/executor/run', async (req, res) => {
  const body = req.body || {};
  const mode = String(body.mode || 'manual').toLowerCase() === 'auto' ? 'auto' : 'manual';
  const cardId = String(body.cardId || '').trim() || null;
  const cycle = await maybeRunExecutorWorker(readSpatialWorkspace(), { mode, cardId });
  if (!cycle.skipped && cycle.result?.run) {
    if (!cycle.ok) {
      return res.status(503).json({
        ...buildAgentFailurePayload(cycle.result, {
          run: summarizeExecutorRun(cycle.result.run),
          report: cycle.result.report || null,
          runtime: buildSpatialRuntimePayload(refreshSpatialOrchestrator({
            persist: true,
            workspace: cycle.workspace,
          })),
        }),
        preflight: cycle.preflight || cycle.result?.preflight || null,
      });
    }
    return res.json({
      ok: cycle.ok,
      run: summarizeExecutorRun(cycle.result.run),
      report: cycle.result.report,
      runtime: buildSpatialRuntimePayload(refreshSpatialOrchestrator({
        persist: true,
        workspace: cycle.workspace,
      })),
      preflight: cycle.preflight || cycle.result?.preflight || null,
    });
  }
  return res.status(mode === 'manual' ? 400 : 200).json({
    ok: false,
    skipped: Boolean(cycle.skipped),
    reason: cycle.reason,
    runtime: buildSpatialRuntimePayload(refreshSpatialOrchestrator({
      persist: true,
      workspace: cycle.workspace,
    })),
    preflight: cycle.preflight || cycle.result?.preflight || null,
  });
});

app.post('/api/spatial/team-board/action', async (req, res) => {
  const body = req.body || {};
  const action = String(body.action || '').trim();
  const cardId = String(body.cardId || '').trim();
  if (!action || !cardId) {
    return res.status(400).json({ error: 'action and cardId are required.' });
  }

  const workspace = readSpatialWorkspace();
  const card = findTeamBoardCard(workspace, cardId);
  if (!card) {
    return res.status(404).json({ error: 'Team board card not found.' });
  }

  let nextWorkspace = workspace;
    if (action === 'approve-apply') {
      nextWorkspace = mutateTeamBoardCard(workspace, cardId, (currentCard) => ({
        ...currentCard,
        status: 'review',
        approvalState: 'approved',
        executorBlocker: clearExecutorBlocker(),
        updatedAt: nowIso(),
      }));
    nextWorkspace = persistBoardWorkspace(nextWorkspace, 'team-board-approved', { cardId, title: card.title });
    nextWorkspace = await pumpAutomatedTeamBoardAsync(nextWorkspace);
  } else if (action === 'reject-to-builder') {
    nextWorkspace = mutateTeamBoardCard(workspace, cardId, (currentCard) => ({
        ...currentCard,
          status: 'active',
          approvalState: 'rejected',
          applyStatus: 'idle',
          deployStatus: 'idle',
          verifyRequired: false,
          verifyStatus: 'idle',
          verifyRunIds: [],
          verifyArtifacts: [],
          lastVerificationSummary: '',
          verifiedSignature: null,
          executorBlocker: clearExecutorBlocker(),
          executionPackage: {
            ...(currentCard.executionPackage || {}),
            status: 'idle',
            summary: '',
            verificationPlan: {
              required: false,
              commands: [],
              qaScenarios: [],
              signature: null,
              summary: 'No verification required.',
              generatedAt: null,
            },
          },
        updatedAt: nowIso(),
      }));
    nextWorkspace = persistBoardWorkspace(nextWorkspace, 'team-board-rejected', { cardId, title: card.title });
  } else if (action === 'bin') {
    nextWorkspace = mutateTeamBoardCard(workspace, cardId, (currentCard) => ({
        ...currentCard,
          status: 'binned',
          approvalState: 'none',
          applyStatus: 'idle',
          deployStatus: 'idle',
          verifyRequired: false,
          verifyStatus: 'idle',
          verifyRunIds: [],
          verifyArtifacts: [],
          lastVerificationSummary: '',
          verifiedSignature: null,
          executorBlocker: clearExecutorBlocker(),
          updatedAt: nowIso(),
        }));
    nextWorkspace = persistBoardWorkspace(nextWorkspace, 'team-board-binned', { cardId, title: card.title });
  } else if (action === 'start-builder') {
        nextWorkspace = mutateTeamBoardCard(workspace, cardId, (currentCard) => ({
          ...currentCard,
          status: 'active',
          approvalState: 'none',
          verifyRequired: false,
          verifyStatus: 'idle',
          verifyRunIds: [],
          verifyArtifacts: [],
          lastVerificationSummary: '',
          verifiedSignature: null,
          executorBlocker: clearExecutorBlocker(),
          updatedAt: nowIso(),
        }));
    nextWorkspace = persistBoardWorkspace(nextWorkspace, 'team-board-builder-manual', { cardId, title: card.title });
    nextWorkspace = await pumpAutomatedTeamBoardAsync(nextWorkspace);
  } else {
    return res.status(400).json({ error: 'Unsupported team board action.' });
  }

    res.json({
      ok: true,
      runtime: buildSpatialRuntimePayload(nextWorkspace),
  });
});

app.put('/api/spatial/workspace', async (req, res) => {
  ensureSpatialStorage();
  const body = req.body || {};
  const previousWorkspace = readSpatialWorkspace();
  const nextWorkspace = persistSpatialWorkspace(mergeWorkspacePatch(previousWorkspace, body));
  const automatedWorkspace = await pumpAutomatedTeamBoardAsync(nextWorkspace);
  appendNewRsgHistoryEntries(previousWorkspace, automatedWorkspace);
  appendArchitectureHistory({
    at: nowIso(),
    type: 'workspace-save',
    summary: {
      nodes: automatedWorkspace.graph?.nodes?.length || 0,
      edges: automatedWorkspace.graph?.edges?.length || 0,
      versions: automatedWorkspace.architectureMemory?.versions?.slice(-1) || [],
      sketches: automatedWorkspace.sketches?.length || 0,
      annotations: automatedWorkspace.annotations?.length || 0,
    },
  });
  res.json({ ok: true, workspace: automatedWorkspace });
});

app.put('/api/spatial/pages', (req, res) => {
  const body = req.body || {};
  (async () => {
    await fs.promises.mkdir(path.dirname(SPATIAL_PAGES_FILE), { recursive: true });
    await fs.promises.writeFile(SPATIAL_PAGES_FILE, JSON.stringify(body, null, 2));
    const nextWorkspace = persistWorkspacePatch((workspace) => ({
      ...workspace,
      pages: Array.isArray(body.pages) ? body.pages : workspace.pages,
      activePageId: body.activePageId !== undefined ? body.activePageId : workspace.activePageId,
    }));
    return res.json({ ok: true, pages: nextWorkspace.pages, activePageId: nextWorkspace.activePageId });
  })().catch((error) => res.status(500).json({ error: String(error.message || error) }));
});

app.put('/api/spatial/intent-state', (req, res) => {
  const body = req.body || {};
  (async () => {
    await fs.promises.mkdir(path.dirname(SPATIAL_INTENT_STATE_FILE), { recursive: true });
    const nextIntentState = normalizeStoredIntentState(body);
    await fs.promises.writeFile(SPATIAL_INTENT_STATE_FILE, JSON.stringify({ intentState: {
      currentIntentId: nextIntentState.currentIntentId || null,
      summary: nextIntentState.summary || '',
      status: nextIntentState.status || 'idle',
    } }, null, 2));
    const nextWorkspace = persistWorkspacePatch((workspace) => ({
      ...workspace,
      intentState: nextIntentState,
    }));
    res.json({ ok: true, intentState: nextWorkspace.intentState });
  })().catch((error) => res.status(500).json({ error: String(error.message || error) }));
});

app.put('/api/spatial/studio-state', (req, res) => {
  const body = req.body || {};
  const nextStudioState = normalizeStoredStudioState(body);
  (async () => {
    await fs.promises.mkdir(path.dirname(SPATIAL_STUDIO_STATE_FILE), { recursive: true });
    await fs.promises.writeFile(SPATIAL_STUDIO_STATE_FILE, JSON.stringify(nextStudioState, null, 2));
    persistWorkspacePatch((workspace) => ({
      ...workspace,
      studio: {
        ...(workspace.studio || {}),
        handoffs: nextStudioState.handoffs ? { ...(workspace.studio?.handoffs || {}), ...nextStudioState.handoffs } : workspace.studio?.handoffs,
        teamBoard: nextStudioState.teamBoard ? { ...(workspace.studio?.teamBoard || {}), ...nextStudioState.teamBoard } : workspace.studio?.teamBoard,
      },
    }));
    res.json({ ok: true, studioState: nextStudioState });
  })().catch((error) => res.status(500).json({ error: String(error.message || error) }));
});

app.put('/api/spatial/architecture-memory', (req, res) => {
  const body = req.body || {};
  (async () => {
    await fs.promises.mkdir(path.dirname(SPATIAL_ARCHITECTURE_MEMORY_FILE), { recursive: true });
    await fs.promises.writeFile(SPATIAL_ARCHITECTURE_MEMORY_FILE, JSON.stringify(body, null, 2));
    persistWorkspacePatch((workspace) => ({
      ...workspace,
      architectureMemory: {
        ...(workspace.architectureMemory || {}),
        ...body.architectureMemory,
      },
    }));
    res.json({ ok: true });
  })().catch((error) => res.status(500).json({ error: String(error.message || error) }));
});

app.get('/api/spatial/history', (req, res) => {
  ensureSpatialStorage();
  res.json({ history: readJsonSafe(SPATIAL_HISTORY_FILE, []) || [] });
});

app.get('/api/spatial/debug/throughput', (req, res) => {
  const sessions = listThroughputSessions(ROOT);
  res.json({
    sessions: sessions.slice(0, 12).map((session) => summarizeSession(session)),
    latestSession: sessions[0] || null,
  });
});

app.get('/api/spatial/debug/throughput/:sessionId', (req, res) => {
  const session = readThroughputSession(ROOT, req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Throughput session not found.' });
  res.json({ session });
});

app.get('/api/spatial/qa/runs', (req, res) => {
  const runs = listQARuns(ROOT);
  res.json({
    latestRun: summarizeQARun(runs[0] || null),
    runs: runs.slice(0, 12).map((run) => summarizeQARun(run)),
  });
});

app.get('/api/spatial/qa/runs/:runId', (req, res) => {
  const run = readQARun(ROOT, req.params.runId);
  if (!run) return res.status(404).json({ error: 'QA run not found.' });
  res.json({ run });
});

app.get('/api/spatial/qa/runs/:runId/artifacts/:artifactName', (req, res) => {
  const run = readQARun(ROOT, req.params.runId);
  if (!run) return res.status(404).json({ error: 'QA run not found.' });
  const artifactName = String(req.params.artifactName || '');
  const artifactEntries = [
    ...(run.artifacts?.screenshots || []),
    run.artifacts?.domSnapshot,
    run.artifacts?.consoleLog,
    run.artifacts?.networkSummary,
    run.artifacts?.runtimeSnapshot,
    run.artifacts?.layoutFindings,
  ].filter(Boolean);
  const artifact = artifactEntries.find((entry) => entry.name === artifactName);
  if (!artifact?.path || !fs.existsSync(artifact.path)) {
    return res.status(404).json({ error: 'QA artifact not found.' });
  }
  res.sendFile(artifact.path);
});

app.post('/api/spatial/qa/run', async (req, res) => {
  const body = req.body || {};
  try {
    const run = await startBrowserQARun({
      baseUrl: getLocalBaseUrl(req),
      scenario: String(body.scenario || 'layout-pass').trim() || 'layout-pass',
      mode: String(body.mode || 'interactive').trim() || 'interactive',
      trigger: String(body.trigger || 'manual').trim() || 'manual',
      prompt: String(body.prompt || '').trim(),
      actions: Array.isArray(body.actions) ? body.actions : [],
      linked: typeof body.linked === 'object' && body.linked ? body.linked : {},
    });
    res.json({
      ok: run.verdict !== 'failed',
      run,
      runtime: await refreshSpatialRuntime({ persist: true }),
    });
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.post('/api/spatial/debug/throughput', async (req, res) => {
  const body = req.body || {};
  const prompt = String(body.prompt || 'I think we should add a desk to the studio for a QA agent').trim();
  const mode = String(body.mode || 'live').toLowerCase() === 'fixture' ? 'fixture' : 'live';
  const targetProjectKey = String(body.project || SELF_TARGET_KEY).trim() || SELF_TARGET_KEY;
  const shouldRunQA = body.runQa !== false;
  const simulateDeploy = body.simulate === true || mode === 'fixture' || process.env.ACE_DISABLE_SELF_RESTART === '1' || process.env.NODE_ENV === 'test';
  let shouldRestartAfterResponse = false;
  try {
    let session = await runThroughputSession({
      rootPath: ROOT,
      prompt,
      targetProjectKey,
      mode,
      confirmDeploy: body.confirmDeploy !== false,
      simulateDeploy,
      loadWorkspace: () => readJsonSafe(SPATIAL_WORKSPACE_FILE, defaultSpatialWorkspace()) || defaultSpatialWorkspace(),
      persistWorkspace: (workspace) => persistSpatialWorkspace(workspace),
      appendHistory: appendArchitectureHistory,
      readHistory: () => readJsonSafe(SPATIAL_HISTORY_FILE, []) || [],
      analyzeIntent: async (text, workspace) => {
        const result = await analyzeIntentWithContextWorker(text, workspace, {
          source: 'throughput-debug',
          mode: 'manual',
        });
        return result.report;
      },
      getDashboardState: () => getDashboardStateSnapshot(),
      createRunnerTask: ({ title, prompt: nextPrompt, handoff, session }) => createRunnerTaskFolder({
        title,
        prompt: nextPrompt,
        handoff,
        sessionId: session.id,
        anchorRefs: handoff?.anchorRefs || [],
      }),
      executeActionSync: (action, payload) => executeActionSync(action, payload),
      runSelfUpgradePreflight: ({ taskId, project }) => {
        const requestedProject = String(project || SELF_TARGET_KEY).trim() || SELF_TARGET_KEY;
        const { projectKey, projectPath } = resolveProjectTarget(requestedProject);
        const taskFolder = getTaskFolders().find((folder) => folder.startsWith(taskId.slice(0, 4)));
        if (!taskFolder) {
          return { ok: false, error: 'Task folder not found for self-upgrade preflight.' };
        }
        const validation = validateApply(projectPath, taskFolder);
        const patchText = fs.existsSync(validation.patchPath) ? fs.readFileSync(validation.patchPath, 'utf8') : '';
        const patchReview = reviewSelfUpgradePatch({
          patchText,
          taskId,
          projectKey,
          projectPath,
          rootPath: ROOT,
        });
        const preflight = runSelfUpgradePreflight({
          taskId,
          projectKey,
          projectPath,
          validation,
          patchReview,
        });
        const workspace = updateSelfUpgradeState((state) => ({
          ...state,
          status: preflight.ok ? 'ready-to-apply' : 'blocked',
          taskId,
          targetProjectKey: SELF_TARGET_KEY,
          patchReview,
          preflight,
          deploy: preflight.ok ? state.deploy : createDefaultSelfUpgradeState({ serverStartedAt: SERVER_STARTED_AT, pid: process.pid }).deploy,
          requiresPermission: preflight.ok ? 'user-confirmation' : 'none',
        }));
        return {
          ok: preflight.ok,
          selfUpgrade: getSelfUpgradeState(workspace),
        };
      },
      deploySelfUpgrade: ({ confirmRestart, simulate }) => {
        const workspace = readJsonSafe(SPATIAL_WORKSPACE_FILE, defaultSpatialWorkspace()) || defaultSpatialWorkspace();
        const selfUpgrade = getSelfUpgradeState(workspace);
        if (!confirmRestart) {
          return { ok: false, error: 'Deploy requires explicit restart confirmation.', selfUpgrade };
        }
        if (!selfUpgrade.preflight?.ok) {
          return { ok: false, error: 'Deploy requires a passing self-upgrade preflight.', selfUpgrade };
        }
        if (!selfUpgrade.apply?.ok) {
          return { ok: false, error: 'Deploy requires a successful self-upgrade apply.', selfUpgrade };
        }
        const restartingWorkspace = updateSelfUpgradeState((state) => ({
          ...state,
          status: 'deploying',
          deploy: {
            ...state.deploy,
            status: simulate ? 'healthy' : 'restarting',
            requestedAt: nowIso(),
            restartedAt: simulate ? nowIso() : state.deploy?.restartedAt || null,
            health: {
              status: simulate ? 'healthy' : 'restarting',
              pid: process.pid,
              startedAt: SERVER_STARTED_AT,
            },
          },
          requiresPermission: 'none',
        }));
        shouldRestartAfterResponse = !simulate;
        return {
          ok: true,
          restarting: !simulate,
          deferredRestart: !simulate,
          selfUpgrade: getSelfUpgradeState(restartingWorkspace),
          healthUrl: '/api/health',
        };
      },
      getRunsSnapshot: () => getRunsSnapshot(),
      getHealthSnapshot: () => getHealthSnapshot(),
    });
    let qaRun = null;
    if (shouldRunQA) {
      qaRun = await startBrowserQARun({
        baseUrl: getLocalBaseUrl(req),
        scenario: 'throughput-visual-pass',
        mode: 'interactive',
        trigger: 'throughput-debug',
        prompt,
        linked: { throughputSessionId: session.id },
      });
      if (qaRun?.id) {
        session = updateThroughputSession(ROOT, session.id, (current) => ({
          ...current,
          qaRunId: qaRun.id,
        })) || session;
      }
    }
    res.json({
      ok: true,
      session,
      qaRun: qaRun ? summarizeQARun(qaRun) : null,
      runtime: await refreshSpatialRuntime({ persist: true }),
    });
    if (shouldRestartAfterResponse && session?.stages?.find((stage) => stage.id === 'deploy')?.verdict === 'pass') {
      setTimeout(scheduleSelfRestart, 120);
    }
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

function normalizeExecutiveEnvelope(payload = {}) {
  const envelope = payload?.envelope && typeof payload.envelope === 'object' ? payload.envelope : payload;
  const entries = Array.isArray(envelope.entries)
    ? envelope.entries
    : [
        envelope.promptNode ? { type: 'prompt', ...(envelope.promptNode || {}) } : null,
        envelope.constraintsNode ? { type: 'constraints', ...(envelope.constraintsNode || {}) } : null,
        envelope.targetNode ? { type: 'target', ...(envelope.targetNode || {}) } : null,
      ].filter(Boolean);
  const typedEntries = entries
    .map((entry, index) => {
      const type = String(entry?.type || entry?.node_type || '').trim().toLowerCase();
      if (!['prompt', 'constraints', 'target'].includes(type)) return null;
      return {
        type,
        node_id: String(entry?.node_id || entry?.nodeId || `${type}-${index + 1}`).trim(),
        content: String(entry?.content || entry?.text || '').trim(),
        data: entry?.data && typeof entry.data === 'object' ? entry.data : {},
      };
    })
    .filter(Boolean);

  const promptNode = typedEntries.find((entry) => entry.type === 'prompt') || {
    type: 'prompt',
    node_id: 'prompt-1',
    content: '',
    data: {},
  };
  const constraintsNode = typedEntries.find((entry) => entry.type === 'constraints') || {
    type: 'constraints',
    node_id: 'constraints-1',
    content: '',
    data: {},
  };
  const targetNode = typedEntries.find((entry) => entry.type === 'target') || {
    type: 'target',
    node_id: 'target-1',
    content: '',
    data: {},
  };

  return {
    version: String(envelope.version || EXECUTIVE_ENVELOPE_VERSION),
    entries: [promptNode, constraintsNode, targetNode],
    nodes: {
      prompt: promptNode,
      constraints: constraintsNode,
      target: targetNode,
    },
  };
}

function mapEnvelopeToMaterialModule(envelope) {
  const prompt = envelope.nodes.prompt;
  const constraints = envelope.nodes.constraints;
  const target = envelope.nodes.target;

  return {
    action: 'run_module',
    module_id: 'material_gen',
    input: {
      intent: {
        type: 'material',
        surface: inferMaterialSurface(prompt.content),
        request_text: prompt.content,
      },
      constraints: {
        engine_target: constraints.data.engine_target || constraints.data.engineTarget || 'unreal',
        require_tileable: constraints.data.require_tileable !== false,
        ...(constraints.data || {}),
      },
      context: {
        source: 'studio-canvas-executive',
        source_node_id: prompt.node_id,
        target: {
          export_format: target.data.export_format || target.data.format || 'manifest',
          destination: target.data.destination || target.content || null,
        },
      },
    },
  };
}

function buildModulePreview(moduleRun = {}) {
  const artifact = moduleRun?.output?.artifact || {};
  const mapPaths = artifact?.data?.maps && typeof artifact.data.maps === 'object'
    ? artifact.data.maps
    : {};
  const outputPaths = Object.values(mapPaths).filter(Boolean);

  return {
    artifact_type: artifact.artifact_type || null,
    output_paths: outputPaths,
    output_map_paths: mapPaths,
    validation_status: moduleRun?.output?.validation?.status || 'unknown',
    confidence: Number.isFinite(Number(moduleRun?.confidence)) ? Number(moduleRun.confidence) : null,
    requires_human_review: Boolean(moduleRun?.requires_human_review),
  };
}

function resolveLegacyFallbackPayload(envelope, body = {}) {
  const targetData = envelope.nodes.target.data || {};
  const action = String(targetData.legacy_action || targetData.fallback_action || body.legacy_action || '').trim().toLowerCase();
  const taskId = String(targetData.task_id || body.task_id || '').trim();
  const project = String(targetData.project || body.project || '').trim();
  if (!action || !taskId || !project) return null;
  return { action, taskId, project };
}

function buildExecutiveMetadataFromResult(result = {}) {
  return {
    route: result.route || null,
    preview: result.preview || null,
    module_id: result.moduleRun?.module_id || null,
    confidence: result.moduleRun?.confidence ?? null,
    requires_human_review: result.moduleRun?.requires_human_review ?? null,
    exported_at: nowIso(),
  };
}

app.post('/api/spatial/executive/route', async (req, res) => {
  const body = req.body || {};
  const envelope = normalizeExecutiveEnvelope(body);
  const promptText = envelope.nodes.prompt.content;

  if (!promptText) {
    return res.status(400).json({ error: 'prompt node content is required.', envelope });
  }

  const forceIntentScan = Boolean(body.override?.force_intent_scan);
  if (!forceIntentScan) {
    const workspace = readSpatialWorkspace();
    const graphs = normalizeGraphBundle(workspace);
    const scaffoldRoute = await resolveWorldScaffoldExecutiveRoute({
      promptText,
      envelope,
      graphs,
    });
    if (scaffoldRoute?.matched) {
      return res.status(scaffoldRoute.statusCode).json(scaffoldRoute.body);
    }
    const worldEditRoute = resolveWorldEditExecutiveRoute({
      promptText,
      envelope,
      graphs,
    });
    if (worldEditRoute?.matched) {
      return res.status(worldEditRoute.statusCode).json(worldEditRoute.body);
    }
  }
  const looksLikeMaterial = detectMaterialGenerationIntent(promptText)
    || String(envelope.nodes.target.data.module_id || '').trim() === 'material_gen';

  if (!forceIntentScan && looksLikeMaterial) {
    const moduleEnvelope = mapEnvelopeToMaterialModule(envelope);
    const moduleRun = executeModuleAction(moduleEnvelope, {
      logger: (line) => console.log(line),
    });
    if (!moduleRun.ok) {
      const status = moduleRun.error?.code === 'validation-failed' ? 422 : 400;
      return res.status(status).json({
        ok: false,
        route: 'module',
        envelope,
        moduleEnvelope,
        moduleRun,
      });
    }
    return res.json({
      ok: true,
      route: 'module',
      envelope,
      moduleEnvelope,
      moduleRun,
      preview: buildModulePreview(moduleRun),
    });
  }

  const fallbackPayload = resolveLegacyFallbackPayload(envelope, body);
  if (fallbackPayload) {
    try {
      const result = runLegacyFallbackSync(fallbackPayload, { rootPath: ROOT });
      return res.status(result.code === 0 ? 200 : 400).json({
        ok: result.code === 0,
        route: 'legacy-fallback',
        envelope,
        legacy: {
          action: fallbackPayload.action,
          task_id: fallbackPayload.taskId,
          project: fallbackPayload.project,
          command: result.command.commandLine,
          exit_code: result.code,
          stdout: result.stdout,
          stderr: result.stderr,
        },
      });
    } catch (error) {
      return res.status(400).json({
        ok: false,
        route: 'legacy-fallback',
        envelope,
        error: String(error.message || error),
      });
    }
  }

  try {
    const cycle = await maybeRunContextManagerWorker(readSpatialWorkspace(), {
      text: promptText,
      sourceNodeId: envelope.nodes.prompt.node_id,
      source: 'executive-scan-override',
      mode: 'manual',
    });
    if (!cycle.result?.report) {
      return res.status(500).json({ error: cycle.reason || 'Context Manager could not produce an intent report.', envelope });
    }
    const runtime = buildSpatialRuntimePayload(refreshSpatialOrchestrator({
      persist: true,
      workspace: cycle.workspace,
    }));
    return res.json({
      ok: true,
      route: 'intent-scan',
      envelope,
      report: cycle.result.report,
      extractedIntent: cycle.result.extractedIntent || cycle.result.report?.extractedIntent || null,
      worker: cycle.result.run ? summarizeContextManagerRun(cycle.result.run) : null,
      handoff: cycle.result.handoff,
      runtime,
    });
  } catch (error) {
    return res.status(500).json({ error: String(error.message || error), envelope });
  }
});

app.post('/api/spatial/executive/export/manifest', (req, res) => {
  const body = req.body || {};
  const result = body.result && typeof body.result === 'object' ? body.result : null;
  if (!result) {
    return res.status(400).json({ error: 'result is required.' });
  }
  fs.mkdirSync(EXECUTIVE_EXPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const filePath = path.join(EXECUTIVE_EXPORT_DIR, `executive-result-${stamp}.json`);
  writeJson(filePath, {
    createdAt: nowIso(),
    metadata: buildExecutiveMetadataFromResult(result),
    result,
  });
  return res.json({
    ok: true,
    manifest_path: path.relative(ROOT, filePath),
  });
});


app.post('/api/modules/run', (req, res) => {
  const result = executeModuleAction(req.body || {}, {
    logger: (line) => console.log(line),
  });
  if (!result.ok) {
    const status = result.error?.code === 'validation-failed' ? 422 : 400;
    return res.status(status).json(result);
  }
  return res.json(result);
});

app.get('/api/spatial/cto/status', async (req, res) => {
  try {
    const { backend, model, host, timeoutMs } = resolveCtoGovernanceConfig(req.query || {});
    const status = await probeCtoBackendStatus({
      backend,
      model,
      host,
      timeoutMs,
    });
    const httpStatus = status.status === 'offline' ? 503 : (status.status === 'degraded' ? 200 : 200);
    return res.status(httpStatus).json({
      ok: status.ok,
      ...status,
    });
  } catch (error) {
    const reason = String(error.message || error);
    const ctoConfig = resolveCtoGovernanceConfig(req.query || {});
    return res.status(500).json({
      ok: false,
      status: 'offline',
      error: reason,
      reason,
      backend: ctoConfig.backend,
      model: ctoConfig.model,
      host: ctoConfig.host,
    });
  }
});

app.get('/api/spatial/cto/diagnostics', (req, res) => {
  try {
    const diagnostics = readCtoDiagnostics();
    return res.json({
      ok: true,
      version: diagnostics.version,
      updated_at: diagnostics.updated_at,
      summary: summarizeCtoDiagnostics(diagnostics.entries),
      entries: diagnostics.entries,
    });
  } catch (error) {
    const reason = String(error.message || error);
    return res.status(500).json({
      ok: false,
      error: reason,
      reason,
    });
  }
});

app.post('/api/spatial/cto/chat', async (req, res) => {
  try {
    const body = req.body || {};
    const text = String(body.text || '').trim();
    const source = String(body.source || 'cto-chat').trim() || 'cto-chat';
    if (!text) {
      return res.status(400).json({
        ok: false,
        status: 'blocked',
        error: 'text is required.',
        reason: 'text is required.',
        reply_text: null,
      });
    }
    const result = await runCtoGovernanceChat({
      text,
      history: body.history,
      source,
      backend: body.backend,
      model: body.model,
      host: body.host,
      timeoutMs: body.timeoutMs,
      confirmActionId: body.confirmActionId,
      workspace: readSpatialWorkspace(),
    });
    if (!result.ok) {
      const httpStatus = result.status === 'offline' ? 503 : 422;
      return res.status(httpStatus).json({
        ok: false,
        status: result.status,
        error: result.reason,
        reason: result.reason,
        reply_text: result.reply_text || null,
        backend: result.backend || null,
        model: result.model || null,
        action: result.action || null,
        execution: result.execution || null,
        replyKind: result.replyKind || 'blocked',
        backendStatus: result.backendStatus || null,
        diagnostic: result.diagnostic || null,
      });
    }
    return res.json({
      ok: true,
      status: result.status,
      reply_text: result.reply_text,
      replyKind: result.replyKind,
      backend: result.backend,
      model: result.model,
      runId: result.runId,
      delegation: result.delegation,
      action: result.action,
      execution: result.execution,
      backendStatus: result.backendStatus,
      diagnostic: result.diagnostic || null,
    });
  } catch (error) {
    console.error('[ERROR] /api/spatial/cto/chat failed:', error);
    const reason = String(error.message || error);
    const ctoConfig = resolveCtoGovernanceConfig();
    const diagnostic = recordCtoDiagnostic({
      route: '/api/spatial/cto/chat',
      source: 'cto-chat',
      status: 'offline',
      backend: ctoConfig.backend,
      model: ctoConfig.model,
      host: ctoConfig.host,
      reason,
    });
    return res.status(500).json({
      ok: false,
      status: classifyLlmFailureStatus(reason, false),
      error: reason,
      reason,
      reply_text: null,
      replyKind: 'blocked',
      diagnostic,
      backendStatus: {
        ok: false,
        status: 'offline',
        backend: ctoConfig.backend,
        model: ctoConfig.model,
        host: ctoConfig.host,
        checkedAt: nowIso(),
        reason,
        availableModels: [],
      },
    });
  }
});

app.post('/api/spatial/intent', async (req, res) => {
  const body = req.body || {};
  const text = String(body.text || '').trim();
  if (!text) {
    return res.status(400).json({ error: 'text is required.' });
  }
  const sourceNodeId = String(body.nodeId || '').trim() || 'prompt-1';
  const executiveEnvelope = normalizeExecutiveEnvelope({
    envelope: {
      version: EXECUTIVE_ENVELOPE_VERSION,
      entries: [
        { type: 'prompt', node_id: sourceNodeId, content: text, data: {} },
        { type: 'constraints', node_id: 'constraints-1', content: '', data: {} },
        { type: 'target', node_id: 'target-1', content: '', data: {} },
      ],
    },
  });
  const looksLikeMaterial = detectMaterialGenerationIntent(text);
  if (looksLikeMaterial) {
    const moduleEnvelope = mapEnvelopeToMaterialModule(executiveEnvelope);
    const moduleRun = executeModuleAction(moduleEnvelope, {
      logger: (line) => console.log(line),
    });
    const status = moduleRun.ok ? 200 : (moduleRun.error?.code === 'validation-failed' ? 422 : 400);
    return res.status(status).json({
      routedToModule: true,
      route: 'module',
      envelope: executiveEnvelope,
      moduleEnvelope,
      moduleRun,
      preview: moduleRun.ok ? buildModulePreview(moduleRun) : null,
    });
  }
  try {
    const cycle = await maybeRunContextManagerWorker(readSpatialWorkspace(), {
      text,
      sourceNodeId,
      source: String(body.source || 'context-intake').trim() || 'context-intake',
      mode: 'manual',
      backend: String(body.backend || '').trim() || null,
      model: String(body.model || '').trim() || null,
      host: String(body.host || '').trim() || null,
      timeoutMs: Number(body.timeoutMs) > 0 ? Number(body.timeoutMs) : null,
    });
    if (!cycle.result?.report) {
      return res.status(500).json({ error: cycle.reason || 'Context Manager could not produce an intent report.' });
    }
    if (!cycle.ok || cycle.result?.usedFallback) {
      return res.status(503).json(buildAgentFailurePayload(cycle.result, {
        report: cycle.result.report,
        handoff: cycle.result.handoff,
      }));
    }
    const runtime = buildSpatialRuntimePayload(refreshSpatialOrchestrator({
      persist: true,
      workspace: cycle.workspace,
    }));
    return res.json({
      ...cycle.result.report,
      extractedIntent: cycle.result.extractedIntent || cycle.result.report?.extractedIntent || null,
      worker: cycle.result.run ? summarizeContextManagerRun(cycle.result.run) : null,
      report: cycle.result.report,
      handoff: cycle.result.handoff,
      runtime,
    });
  } catch (error) {
    return res.status(500).json({ error: String(error.message || error) });
  }
});

app.post('/api/spatial/mutations/preview', (req, res) => {
  const mutations = (req.body || {}).mutations || [];
  const summary = mutations.map((m) => {
    if (m.type === 'create_node') return `- new ${m.node.type}: ${m.node.content}`;
    if (m.type === 'modify_node') return `- modify node ${m.id}`;
    if (m.type === 'create_edge') return `- dependency ${m.edge.source} -> ${m.edge.target}`;
    return `- ${m.type}`;
  });
  res.json({ ok: true, summary });
});

app.post('/api/spatial/mutations/apply', (req, res) => {
  const mutations = (req.body || {}).mutations || [];
  try {
    const previousWorkspace = readSpatialWorkspace();
    const result = applySpatialMutationsToWorkspace(previousWorkspace, mutations);
    const mutationSummary = {
      status: result.status,
      confirmed: result.confirmed,
      requested: result.requested,
      applied: result.applied,
      queued: result.queued,
      blocked: result.blocked,
      changedLayers: result.changedLayers,
      reason: result.reason || '',
      results: result.results,
      approvalQueueSize: result.approvalQueue.length,
    };
    const nextWorkspace = result.persisted ? persistSpatialWorkspace(result.workspace) : previousWorkspace;
    appendArchitectureHistory({
      at: nowIso(),
      type: 'mutation-apply',
      summary: mutationSummary,
    });
    const payload = {
      ok: result.ok,
      status: result.status,
      confirmed: result.confirmed,
      mutationResult: mutationSummary,
      recentWorldChange: result.recentWorldChange || null,
      runtime: buildSpatialRuntimePayload(nextWorkspace),
    };
    if (!result.ok) {
      return res.status(422).json({
        ...payload,
        error: mutationSummary.reason,
      });
    }
    res.json(payload);
  } catch (error) {
    const requested = Array.isArray(mutations) ? mutations.length : 0;
    const mutationSummary = {
      status: 'failed',
      confirmed: false,
      requested,
      applied: 0,
      queued: 0,
      blocked: requested,
      changedLayers: [],
      reason: String(error.message || error),
    };
    appendArchitectureHistory({
      at: nowIso(),
      type: 'mutation-apply',
      summary: mutationSummary,
    });
    res.status(422).json({
      ok: false,
      status: 'failed',
      confirmed: false,
      error: mutationSummary.reason,
      mutationResult: mutationSummary,
      recentWorldChange: null,
    });
  }
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }
  const requestPath = String(req?.path || req?.originalUrl || req?.url || '').trim();
  const failure = recordClassifiedFailure(ROOT, error, {
    route: requestPath || null,
    method: req?.method || null,
    stage: /\/api\/health/.test(requestPath) || /boot/i.test(requestPath)
      ? 'boot'
      : (/\/api\/spatial\//.test(requestPath) ? 'runtime' : 'server'),
    component: /\/api\/spatial\/(desks|layout|qa|agents|runtime|team-board|mutations|archive)/.test(requestPath)
      ? 'panel'
      : 'server',
    source: 'express-error-handler',
    message: String(error?.message || error || 'Unhandled server error.'),
  });
  const status = failure.failureClass === 'warning'
    ? 400
    : failure.failureClass === 'panel_degraded'
      ? 500
      : failure.failureClass === 'boot_critical'
        ? 503
        : 500;
  return res.status(status).json({
    ok: false,
    error: String(error?.message || error || 'Unhandled server error.'),
    failureClass: failure.failureClass,
    uiResponse: failure.uiResponse,
    safeMode: Boolean(failure.uiResponse?.safeMode),
    route: requestPath || null,
  });
});

function startServer() {
  setInterval(() => {
    Promise.resolve()
      .then(async () => {
        const workspace = await pumpAutomatedTeamBoardAsync();
        refreshSpatialOrchestrator({ persist: true, workspace });
      })
      .catch((error) => {
        console.warn(`[${nowIso()}] spatial orchestrator refresh failed: ${error.message}`);
      });
  }, 4000);

  const bootHealth = evaluateSpatialBootHealth();
  if (bootHealth.safeMode) {
    console.warn(`[${nowIso()}] spatial boot health failed; safe mode enabled: ${bootHealth.reason}`);
  }
  markServerHealthyOnBoot();
  reconcilePendingThroughputSessions({
    rootPath: ROOT,
    loadWorkspace: () => readJsonSafe(SPATIAL_WORKSPACE_FILE, defaultSpatialWorkspace()) || defaultSpatialWorkspace(),
    persistWorkspace: (workspace) => persistSpatialWorkspace(workspace),
    getRunsSnapshot: () => getRunsSnapshot(),
    getHealthSnapshot: () => getHealthSnapshot(),
  }).catch((error) => {
    console.warn(`[${nowIso()}] throughput session reconcile failed: ${error.message}`);
  });

  return app.listen(port, () => {
    console.log(`AI Core Engine UI running at http://localhost:${port}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  startServer,
  dashboardFiles,
  buildDeskPropertiesPayload,
  buildQAStatePayload,
  buildProjectRecord,
  buildSpatialRuntimePayload,
  detectRunnableProjectType,
  evaluateApplyGate,
  evaluateVerifyGate,
  evaluateDeployGate,
  buildVerificationPlan,
  buildLegacyFallbackProvenance,
  buildMixedStudioProvenance,
  buildGuardSurfacePayload,
  applySpatialMutationsToWorkspace,
  createExecutorBlocker,
  generateCandidates,
  executeModuleAction,
  launchProject,
  listProjectsForUi,
  smokeCheckStaticWebBoot,
  detectMaterialGenerationIntent,
  detectWorldScaffoldIntent,
  detectPotentialWorldEditPrompt,
  deriveRecentWorldChange,
  buildMaterialIntentModuleEnvelope,
  interpretScaffoldIntentWithModel,
  parseWorldEditIntent,
  parseWorldScaffoldIntent,
  resolveWorldEditExecutiveRoute,
  resolveWorldScaffoldExecutiveRoute,
  buildWorldScaffoldMutationPlan,
  buildWorldScaffoldMutations,
  normalizeStoredStudioState,
  normalizeStoredStudioTeamBoard,
  normalizeStoredStudioHandoffs,
  normalizeExecutiveEnvelope,
  mapEnvelopeToMaterialModule,
  buildModulePreview,
  buildFailureUiResponse,
  buildConstrainedAutoFixBundle,
  buildTaskApplyResultRecord,
  buildAgentCapabilityProfile,
  classifyFailureContext,
  evaluateStagePreflightSurface,
  evaluateSpatialBootHealth,
  buildSafeModeSnapshot,
  runSafeModeDiagnosis,
  runConstrainedSafeModeFixPass,
  collectTaskArtifacts,
  createRunnerTaskFolder,
  readDashboardFileForRoot,
  readAgentCapabilityProfile,
  getHealthSnapshot,
  recordClassifiedFailure,
  readTaskArtifactStatus,
  resolveLegacyFallbackPayload,
  stopProjectRun,
  runArchivistWriteback,
  rebuildAgentCapabilityLedger,
  writeTaskApplyResult,
  summarizeExecutionProvenance,
  normalizePreflightStage,
  createDefaultStudioLayoutSchema,
  normalizeStudioLayoutSchema,
  addDepartmentToLayout,
  addDeskToLayout,
  buildStudioLayoutCatalog,
  listStudioDeskIds,
  resolveCtoGovernanceConfig,
  parseCtoStructuredReply,
  classifyCtoDiagnosticCategory,
  recordCtoDiagnostic,
  readCtoDiagnostics,
  probeCtoBackendStatus,
  buildCtoGovernanceContext,
  buildCtoAvailableActions,
  executeCtoConfirmedAction,
  runCtoGovernanceModelBakeOff,
  runCtoGovernanceChat,
  normalizeCtoChatHistory,
  isAffirmativeCtoReply,
};
