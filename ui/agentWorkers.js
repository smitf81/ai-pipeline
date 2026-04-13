const fs = require('fs');
const path = require('path');
const {
  DEFAULT_OLLAMA_HOST,
  DEFAULT_OLLAMA_TIMEOUT_MS,
} = require('./localModelClient');
const {
  callOllamaGenerate,
} = require('./llmAdapter');
const { resolveAgentDefinition } = require('./agentRegistry');
const {
  analyzeSpatialIntent,
  buildIntentProjectContext,
  buildIntentTruth,
  buildCanonicalIntentContract,
} = require('./intentAnalysis');
const {
  buildKnownFixesPromptSection,
} = require('./knownFixes');
const {
  TASK_CACHE_SOURCE,
  buildTaskCachePromptSection,
  readTaskCache,
  summarizeTaskCache,
} = require('./taskCache');
const {
  buildFixTaskPromptSection,
} = require('./fixTasks');
const {
  getContextManagerNode,
  normalizeGraphBundle,
} = require('./graphQueries');
const { createPlannerHandoff, buildPlannerContextLanes } = require('./throughputDebug');
const {
  createDefaultCtoOverrideLedger,
  deriveCtoOverrideLayer,
  summarizeCtoOverrideLedger,
} = require('./ctoOverrides');
const {
  upsertPlannerQaQueueEntry,
} = require('./plannerQaQueue');
const {
  upsertPlannerOuttrayEntry,
  summarizePlannerOuttray,
} = require('./plannerOuttray');
const {
  normalizeTaHireRequestEntry,
  summarizeTaHireRequestQueue,
  upsertTaHireRequestQueueEntry,
} = require('./taHireRequests');
const {
  resolveStageAgentIdentity,
} = require('./agentAttribution');
const {
  buildAgentAuditRecord,
  writeAgentAuditArtifacts,
} = require('./agentAudit');

const DEFAULT_PLANNER_BACKEND = 'ollama';
const DEFAULT_PLANNER_MODEL = 'mistral:latest';
const DEFAULT_PLANNER_TIMEOUT_MS = 30000;
const DEFAULT_CONTEXT_MANAGER_BACKEND = 'ollama';
const DEFAULT_CONTEXT_MANAGER_MODEL = 'mistral:latest';
const DEFAULT_CONTEXT_MANAGER_TIMEOUT_MS = 30000;
const DEFAULT_EXECUTOR_BACKEND = 'ollama';
const DEFAULT_EXECUTOR_MODEL = 'mistral:latest';
const DEFAULT_EXECUTOR_TIMEOUT_MS = 30000;
const PLANNER_SCOPED_TASK_CACHE_LIMIT_CHARS = 900;
const PLANNER_BROAD_TASK_CACHE_LIMIT_CHARS = 2200;
const PLANNER_SCOPED_ANCHOR_LIMIT = 2;
const PLANNER_BROAD_ANCHOR_LIMIT = 4;
const PLANNER_SCOPED_ANCHOR_CONTENT_CHARS = 500;
const PLANNER_BROAD_ANCHOR_CONTENT_CHARS = 1000;
const PLANNER_OVERSCOPED_PROMPT_CHARS = 7000;
const MAX_PLANNER_CARDS = 3;
const MAX_CONTEXT_TASKS = 4;
const MAX_EXTRACTED_INTENT_CANDIDATES = 6;
const PLANNER_RUNS_RELATIVE_DIR = path.join('data', 'spatial', 'agent-runs', 'planner');
const CONTEXT_MANAGER_RUNS_RELATIVE_DIR = path.join('data', 'spatial', 'agent-runs', 'context-manager');
const EXECUTOR_RUNS_RELATIVE_DIR = path.join('data', 'spatial', 'agent-runs', 'executor');
const ALLOWED_PROPOSAL_TARGETS = Object.freeze(new Set([
  'brain/emergence/plan.md',
  'brain/emergence/tasks.md',
]));
const PLANNER_OUTPUT_STATUSES = new Set([
  'empty',
  'ready',
  'planned',
  'blocked',
  'deferred',
  'complete',
  'complete-with-warnings',
]);
const PLANNER_HANOFF_STATES = new Set([
  'ready',
  'queued',
  'blocked',
  'needs-clarification',
  'handed-off',
  'delivered',
  'planned',
]);

const FALLBACK_PLANNER_PROMPT = [
  'You are the ACE Planner worker.',
  '',
  'Transform one anchored planner handoff into a bounded JSON planning payload.',
  '',
  'Rules:',
  '- Output JSON only. No markdown fences. No prose outside JSON.',
  `- Create at most ${MAX_PLANNER_CARDS} cards.`,
  '- Never propose direct code execution, apply, or deploy.',
  '- Keep work narrow and desk-safe.',
  '- Cards must stay anchored to the provided handoff refs only.',
  '- Emit a canonical plan bundle, task bundle, dependency map, staffing request, QA request, archival summary, and context update packet.',
  '- Emit a Planner outtray record that deposits finished work for downstream desks to collect asynchronously.',
  '- If staffing coverage is missing or risky, also emit a hireRequest object for TA and keep planning non-blocking.',
  '- Each plan item must include planId, intentId, status, priority, summary, acceptanceCriteria, dependencies, targetDesk, targetRole, handoffState, provenance, createdBy, and createdAt.',
  '- brainProposals may only target brain/emergence/plan.md or brain/emergence/tasks.md.',
  '- If the handoff is not concrete enough, set needsContextRetry=true and explain why.',
  '',
  'Return exactly this shape:',
  '{',
  '  "summary": "short summary",',
  '  "planBundle": {"planId": "plan_1", "intentId": "intent_1", "status": "ready", "summary": "plan summary", "items": [{"planId": "plan_1", "intentId": "intent_1", "status": "ready", "priority": "normal", "summary": "plan item", "acceptanceCriteria": ["criterion"], "dependencies": [], "targetDesk": "planner", "targetRole": "Planner", "handoffState": "ready", "provenance": {"sourceHandoffId": "handoff_1"}, "createdBy": "planner", "createdAt": "2026-03-23T07:05:00.000Z"}]}',
  '  "taskBundle": {"taskBundleId": "task_bundle_1", "intentId": "intent_1", "status": "ready", "tasks": [{"taskId": "task_1", "planId": "plan_1", "intentId": "intent_1", "status": "planned", "priority": "normal", "summary": "task summary", "acceptanceCriteria": ["criterion"], "dependencies": [], "targetDesk": "executor", "targetRole": "Executor", "handoffState": "ready", "provenance": {"sourceHandoffId": "handoff_1"}, "createdBy": "planner", "createdAt": "2026-03-23T07:05:00.000Z"}]}',
  '  "dependencyMap": {"dependencyMapId": "dependency_map_1", "intentId": "intent_1", "status": "ready", "edges": [{"dependencyId": "dependency_1", "sourcePlanId": "plan_1", "targetPlanId": "plan_2", "type": "depends_on", "status": "active", "provenance": {"sourceHandoffId": "handoff_1"}}]}',
  '  "staffingRequest": {"staffingRequestId": "staffing_1", "intentId": "intent_1", "status": "ready", "summary": "staffing summary", "targetDesk": "qa-lead", "targetRole": "QA Lead", "requiredCoverage": ["QA review"], "provenance": {"sourceHandoffId": "handoff_1"}, "createdBy": "planner", "createdAt": "2026-03-23T07:05:00.000Z"}',
  '  "qaRequest": {"qaRequestId": "qa_1", "intentId": "intent_1", "status": "ready", "summary": "qa summary", "acceptanceCriteria": ["criterion"], "targetDesk": "qa-lead", "targetRole": "QA Lead", "provenance": {"sourceHandoffId": "handoff_1"}, "createdBy": "planner", "createdAt": "2026-03-23T07:05:00.000Z"}',
  '  "outtray": {"queueKey": "outtray_1", "plannerRunId": "planner_run_1", "planBundleId": "plan_bundle_1", "taskBundleId": "task_bundle_1", "intentId": "intent_1", "status": "deposited", "summary": "planner outtray summary", "items": [{"laneId": "qa", "laneLabel": "pending QA review", "targetDesk": "qa-lead", "targetRole": "QA Lead", "status": "ready_for_handoff", "required": true, "summary": "QA review pending", "artifactRefs": ["data/spatial/agent-runs/planner/planner_run_1.json"], "provenance": {"sourceHandoffId": "handoff_1", "sourceIntentId": "intent_1"}, "createdAt": "2026-03-23T07:05:00.000Z"}]}',
  '  "hireRequest": {"hireRequestId": "hire_1", "originDepartmentId": "dept-delivery", "originDeskId": "planner", "requestedRoleId": "qa-lead", "reason": "QA coverage is missing, so TA should review staffing while planning continues.", "urgency": "normal", "blockingLevel": "handoff_risk", "linkedPlanIds": ["plan_1"], "createdAt": "2026-03-23T07:05:00.000Z", "status": "queued"}',
  '  "archivalSummary": {"archivalSummaryId": "archive_1", "intentId": "intent_1", "status": "ready", "summary": "archive summary", "provenance": {"sourceHandoffId": "handoff_1"}, "createdBy": "planner", "createdAt": "2026-03-23T07:05:00.000Z"}',
  '  "contextUpdatePacket": {"contextUpdatePacketId": "context_1", "intentId": "intent_1", "status": "ready", "summary": "context summary", "requestedOutcomes": ["outcome"], "constraints": ["constraint"], "provenance": {"sourceHandoffId": "handoff_1"}, "createdBy": "planner", "createdAt": "2026-03-23T07:05:00.000Z"}',
  '  "cards": [{"title": "short actionable card", "summary": "why this card exists", "anchorRefs": ["brain/emergence/plan.md"]}],',
  '  "brainProposals": [{"targetPath": "brain/emergence/plan.md", "summary": "what this proposal changes", "content": "review-only markdown proposal"}],',
  '  "needsContextRetry": false,',
  '  "retryReason": ""',
  '}',
].join('\n');

const FALLBACK_CONTEXT_MANAGER_PROMPT = [
  'You are the ACE Context Manager worker.',
  '',
  'Turn incoming context into a compact structured packet that the deterministic intent layer can score, anchor, and hand off to the Planner.',
  '',
  'Rules:',
  '- Output JSON only. No markdown fences. No prose outside JSON.',
  '- Stay upstream. Do not create execution steps, code patches, or deployment actions.',
  '- Keep the packet concise and specific to the active ACE repo context.',
  '- If planner feedback is present, address it directly in the packet.',
  '- Suggested anchors must come from the provided canonical anchor set.',
  '- Prefer tighter phrasing over exhaustive restatement.',
  '',
  'Return exactly this shape:',
  '{',
  '  "summary": "short focus summary",',
  '  "statement": "plain-language problem statement",',
  '  "goal": "what the requester is trying to achieve",',
  '  "requestedOutcomes": ["short outcome"],',
  '  "targets": ["target or surface"],',
  '  "constraints": ["constraint or guardrail"],',
  '  "urgency": "low|normal|high",',
  '  "requestType": "context_request|planning_request|execution_request|architecture_request|constraint_request",',
  '  "signals": {"actionSignals": 0, "constraintSignals": 0},',
  '  "clarifications": ["what still needs clarification"],',
  '  "focusTerms": ["token", "token"],',
  '  "suggestedAnchorRefs": ["brain/emergence/plan.md"]',
  '}',
].join('\n');

const FALLBACK_EXTRACTED_INTENT_PROMPT = [
  'You are the ACE Extracted Intent generator.',
  '',
  'Turn one upstream context packet into a compact system-graph brief for canvas generation.',
  '',
  'Rules:',
  '- Output JSON only. No markdown fences. No prose outside JSON.',
  '- Stay system-canvas scoped. Do not create execution steps, patches, apply actions, or deployment actions.',
  '- Produce a small inferred leap only. Prefer explicit structure first; add at most 2 inferred claims or candidate nodes.',
  `- Return at most ${MAX_EXTRACTED_INTENT_CANDIDATES} candidateNodes.`,
  '- candidateNodes must use basis "explicit" or "inferred".',
  '- candidateEdges describe hidden relationships only; they will not be auto-rendered yet.',
  '- Prefer concise labels that can become node text directly.',
  '',
  'Return exactly this shape:',
  '{',
  '  "summary": "short summary",',
  '  "explicitClaims": ["explicit claim"],',
  '  "inferredClaims": ["small inferred claim"],',
  '  "candidateNodes": [{"id": "candidate_id", "label": "node label", "kind": "module", "basis": "explicit", "rationale": "why this node exists", "confidence": 0.72}],',
  '  "candidateEdges": [{"sourceCandidateId": "candidate_id", "targetCandidateId": "candidate_2", "kind": "relates_to", "basis": "explicit", "rationale": "why this relationship matters"}],',
  '  "gaps": ["what is still unclear"]',
  '}',
].join('\n');

const FALLBACK_EXECUTOR_PROMPT = [
  'You are the ACE Executor worker.',
  '',
  'Assess one ready execution package and return a bounded execution-readiness payload.',
  '',
  'Rules:',
  '- Output JSON only. No markdown fences. No prose outside JSON.',
  '- Stay in the execution lane. Do not create plans, architecture proposals, or new code patches.',
  '- Use only the provided package, anchor refs, verification inputs, and gate state.',
  '- If required package data, approval, anchor provenance, or self-upgrade preflight is missing, block instead of guessing.',
  '- Keep verification explicit and deterministic: prefer command presets and QA scenarios already named in the inputs.',
  '- Never widen scope beyond the current card.',
  '',
  'Return exactly this shape:',
  '{',
  '  "summary": "short execution summary",',
  '  "decision": "blocked",',
  '  "blockers": ["missing package or gate detail"],',
  '  "verifyRequired": true,',
  '  "verificationPlan": {"commandPresets": ["preset-id"], "qaScenarios": ["scenario-id"]},',
  '  "applyReady": false,',
  '  "deployReady": false,',
  '  "notes": ["short bounded note"]',
  '}',
].join('\n');

function nowIso() {
  return new Date().toISOString();
}

function durationMsFrom(startedAt, completedAt) {
  const start = Date.parse(startedAt || '');
  const end = Date.parse(completedAt || '');
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, end - start);
}

function classifyLlmFailure(reason = '', usedFallback = false) {
  const message = String(reason || '').toLowerCase();
  if (message.includes('timed out')) return 'timed_out';
  if (message.includes('econnrefused') || message.includes('fetch failed') || message.includes('no fetch implementation') || message.includes('ollama unavailable')) {
    return 'model_unavailable';
  }
  return usedFallback ? 'degraded_fallback' : 'model_error';
}

function addTraceStep(trace, stage, payload = {}) {
  if (!trace || !Array.isArray(trace.steps)) return;
  trace.steps.push({
    stage,
    at: nowIso(),
    ...payload,
  });
}

function normalizeRelativePath(relativePath = '') {
  return String(relativePath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^\.\//, '')
    .trim();
}

function relativeToRoot(rootPath, targetPath) {
  return path.relative(rootPath, targetPath).replace(/\\/g, '/');
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48) || 'item';
}

function uniqueStrings(values = []) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function truncateText(value = '', limit = 220) {
  const text = String(value || '').trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}...`;
}

function normalizeIntentPriority(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (['low', 'normal', 'medium', 'high'].includes(normalized)) {
    return normalized === 'medium' ? 'normal' : normalized;
  }
  return 'normal';
}

function buildGraphBundleSection(graphBundle = {}) {
  const contextNode = getContextManagerNode(graphBundle);
  const systemNodes = Array.isArray(graphBundle?.system?.nodes) ? graphBundle.system.nodes.length : 0;
  const systemEdges = Array.isArray(graphBundle?.system?.edges) ? graphBundle.system.edges.length : 0;
  const worldNodes = Array.isArray(graphBundle?.world?.nodes) ? graphBundle.world.nodes.length : 0;
  const worldEdges = Array.isArray(graphBundle?.world?.edges) ? graphBundle.world.edges.length : 0;
  return [
    `System graph: ${systemNodes} nodes / ${systemEdges} edges`,
    `World graph: ${worldNodes} nodes / ${worldEdges} edges`,
    contextNode
      ? `Context node: ${contextNode.id || 'unknown'} (${contextNode.type || 'unknown'})`
      : 'Context node: none',
  ].join('\n');
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function runsDirFor(rootPath, relativeDir) {
  const dir = path.join(rootPath, relativeDir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function runFilePathFor(rootPath, relativeDir, runId) {
  return path.join(runsDirFor(rootPath, relativeDir), `${runId}.json`);
}

function listRuns(rootPath, relativeDir) {
  const dir = runsDirFor(rootPath, relativeDir);
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => readJson(path.join(dir, entry.name), null))
    .filter(Boolean)
    .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
}

function agentFallbackConfigFor(agentId) {
  if (agentId === 'planner') {
    return {
      name: 'Planner',
      deskId: 'planner',
      backend: DEFAULT_PLANNER_BACKEND,
      model: DEFAULT_PLANNER_MODEL,
      host: DEFAULT_OLLAMA_HOST,
      timeoutMs: DEFAULT_PLANNER_TIMEOUT_MS,
      autoRun: true,
      inputs: ['studio.handoffs.contextToPlanner', 'brain/emergence/*', 'studio.teamBoard'],
      outputs: ['studio.teamBoard.cards(plan)', 'proposal-artifacts'],
      writesCanonicalBrain: false,
    };
  }
  if (agentId === 'executor') {
    return {
      name: 'Executor',
      deskId: 'executor',
      backend: DEFAULT_EXECUTOR_BACKEND,
      model: DEFAULT_EXECUTOR_MODEL,
      host: DEFAULT_OLLAMA_HOST,
      timeoutMs: DEFAULT_EXECUTOR_TIMEOUT_MS,
      autoRun: false,
      inputs: ['studio.teamBoard', 'brain/emergence/*', 'ace_commands.json', 'studio.selfUpgrade'],
      outputs: ['studio.teamBoard.cards(execution)', 'executor-artifacts'],
      writesCanonicalBrain: false,
    };
  }
  return {
    name: 'Context Manager',
    deskId: 'context-manager',
    backend: DEFAULT_CONTEXT_MANAGER_BACKEND,
    model: DEFAULT_CONTEXT_MANAGER_MODEL,
    host: DEFAULT_OLLAMA_HOST,
    timeoutMs: DEFAULT_CONTEXT_MANAGER_TIMEOUT_MS,
    autoRun: false,
    inputs: ['raw-context-text', 'brain/emergence/*', 'studio.handoffs.plannerToContext'],
    outputs: ['intent-report', 'studio.handoffs.contextToPlanner'],
    writesCanonicalBrain: false,
  };
}

function agentPromptFallbackFor(agentId) {
  if (agentId === 'planner') return FALLBACK_PLANNER_PROMPT;
  if (agentId === 'executor') return FALLBACK_EXECUTOR_PROMPT;
  return FALLBACK_CONTEXT_MANAGER_PROMPT;
}

function resolveWorkerDefinition(rootPath, agentId) {
  const resolved = resolveAgentDefinition(rootPath, agentId, {
    fallbackManifest: agentFallbackConfigFor(agentId),
    fallbackPrompt: agentPromptFallbackFor(agentId),
  });
  const manifest = resolved.manifest || agentFallbackConfigFor(agentId);
  return {
    ...resolved,
    config: {
      id: manifest.id || agentId,
      name: manifest.name || agentFallbackConfigFor(agentId).name,
      deskId: manifest.deskId || agentId,
      backend: String(manifest.backend || agentFallbackConfigFor(agentId).backend).trim() || agentFallbackConfigFor(agentId).backend,
      model: String(manifest.model || agentFallbackConfigFor(agentId).model).trim() || agentFallbackConfigFor(agentId).model,
      host: String(manifest.host || DEFAULT_OLLAMA_HOST).trim() || DEFAULT_OLLAMA_HOST,
      timeoutMs: Number(manifest.timeoutMs || agentFallbackConfigFor(agentId).timeoutMs || DEFAULT_OLLAMA_TIMEOUT_MS),
      autoRun: Boolean(manifest.autoRun),
      prompt: String(resolved.prompt || agentPromptFallbackFor(agentId)).trim() || agentPromptFallbackFor(agentId),
    },
  };
}

function getAgentWorkerConfig(rootPath, agentId) {
  return resolveWorkerDefinition(rootPath, agentId).config;
}

function makePlannerRunId() {
  return `planner_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeContextManagerRunId() {
  return `context_manager_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeExecutorRunId() {
  return `executor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultPlannerWorkerState() {
  return {
    status: 'idle',
    statusReason: null,
    mode: 'auto',
    backend: DEFAULT_PLANNER_BACKEND,
    model: DEFAULT_PLANNER_MODEL,
    currentRunId: null,
    lastRunId: null,
    lastOutcome: null,
    lastOutcomeAt: null,
    lastSourceHandoffId: null,
    lastBlockedReason: null,
    lastProducedCardIds: [],
    proposalArtifactRefs: [],
    startedAt: null,
    completedAt: null,
  };
}

function defaultContextManagerWorkerState() {
  return {
    status: 'idle',
    statusReason: null,
    mode: 'manual',
    backend: DEFAULT_CONTEXT_MANAGER_BACKEND,
    model: DEFAULT_CONTEXT_MANAGER_MODEL,
    currentRunId: null,
    lastRunId: null,
    lastOutcome: null,
    lastOutcomeAt: null,
    lastSourceNodeId: null,
    lastHandoffId: null,
    lastReportNodeId: null,
    lastBlockedReason: null,
    lastUsedFallback: false,
    lastPlannerFeedbackAction: null,
    startedAt: null,
    completedAt: null,
  };
}

function defaultExecutorWorkerState() {
  return {
    status: 'idle',
    statusReason: null,
    mode: 'manual',
    backend: DEFAULT_EXECUTOR_BACKEND,
    model: DEFAULT_EXECUTOR_MODEL,
    currentRunId: null,
    lastRunId: null,
    lastOutcome: null,
    lastOutcomeAt: null,
    lastBlockedReason: null,
    lastCardId: null,
    lastTaskId: null,
    lastDecision: null,
    lastAssessmentSummary: null,
    lastAssessmentBlockers: [],
    lastVerifiedCardId: null,
    lastAppliedCardId: null,
    lastDeployCardId: null,
    startedAt: null,
    completedAt: null,
  };
}

function defaultEvaluatorWorkerState() {
  return {
    status: 'idle',
    statusReason: null,
    mode: 'manual',
    backend: DEFAULT_CONTEXT_MANAGER_BACKEND,
    model: DEFAULT_CONTEXT_MANAGER_MODEL,
    currentRunId: null,
    lastRunId: null,
    lastOutcome: null,
    lastOutcomeAt: null,
    lastVerdict: null,
    lastDeltaScore: 0,
    lastCognitionMode: null,
    lastLiveModelCallAt: null,
    lastFallbackAt: null,
    fallbackCount: 0,
    startedAt: null,
    completedAt: null,
  };
}

function defaultDaveWorkerState() {
  return {
    name: 'Dave',
    role: 'Practical learning companion',
    status: 'idle',
    statusReason: null,
    mode: 'manual',
    backend: DEFAULT_CONTEXT_MANAGER_BACKEND,
    model: DEFAULT_CONTEXT_MANAGER_MODEL,
    currentRunId: null,
    lastRunId: null,
    tokensUsed: 0,
    durationMs: 0,
    responseStatus: 'idle',
    contextAlignmentScore: null,
    contextAlignmentReason: null,
    startedAt: null,
    completedAt: null,
  };
}

function createDefaultAgentWorkersState() {
  return {
    'context-manager': defaultContextManagerWorkerState(),
    evaluator: defaultEvaluatorWorkerState(),
    executor: defaultExecutorWorkerState(),
    planner: defaultPlannerWorkerState(),
    dave: defaultDaveWorkerState(),
  };
}

function normalizeAgentWorkersState(agentWorkers = {}) {
  const defaults = createDefaultAgentWorkersState();
  return {
    ...defaults,
    ...(agentWorkers || {}),
    'context-manager': {
      ...defaults['context-manager'],
      ...(agentWorkers?.['context-manager'] || {}),
      lastUsedFallback: Boolean(agentWorkers?.['context-manager']?.lastUsedFallback),
    },
    evaluator: {
      ...defaults.evaluator,
      ...(agentWorkers?.evaluator || {}),
      lastDeltaScore: Number(agentWorkers?.evaluator?.lastDeltaScore ?? defaults.evaluator.lastDeltaScore),
      fallbackCount: Math.max(0, Number(agentWorkers?.evaluator?.fallbackCount ?? defaults.evaluator.fallbackCount) || 0),
    },
    executor: {
      ...defaults.executor,
      ...(agentWorkers?.executor || {}),
      lastAssessmentBlockers: Array.isArray(agentWorkers?.executor?.lastAssessmentBlockers)
        ? uniqueStrings(agentWorkers.executor.lastAssessmentBlockers)
        : [],
    },
    planner: {
      ...defaults.planner,
      ...(agentWorkers?.planner || {}),
      lastProducedCardIds: Array.isArray(agentWorkers?.planner?.lastProducedCardIds)
        ? uniqueStrings(agentWorkers.planner.lastProducedCardIds)
        : [],
      proposalArtifactRefs: Array.isArray(agentWorkers?.planner?.proposalArtifactRefs)
        ? uniqueStrings(agentWorkers.planner.proposalArtifactRefs)
        : [],
    },
    dave: {
      ...defaults.dave,
      ...(agentWorkers?.dave || {}),
      tokensUsed: Number(agentWorkers?.dave?.tokensUsed ?? defaults.dave.tokensUsed),
      durationMs: Number(agentWorkers?.dave?.durationMs ?? defaults.dave.durationMs),
      contextAlignmentScore: Number(agentWorkers?.dave?.contextAlignmentScore ?? (defaults.dave.contextAlignmentScore ?? 0)),
      contextAlignmentReason: agentWorkers?.dave?.contextAlignmentReason || defaults.dave.contextAlignmentReason,
      responseStatus: String(agentWorkers?.dave?.responseStatus || defaults.dave.responseStatus),
    },
  };
}

function plannerRunsDir(rootPath) {
  return runsDirFor(rootPath, PLANNER_RUNS_RELATIVE_DIR);
}

function plannerRunFilePath(rootPath, runId) {
  return runFilePathFor(rootPath, PLANNER_RUNS_RELATIVE_DIR, runId);
}

function ensurePlannerRunsStorage(rootPath) {
  return plannerRunsDir(rootPath);
}

function contextManagerRunsDir(rootPath) {
  return runsDirFor(rootPath, CONTEXT_MANAGER_RUNS_RELATIVE_DIR);
}

function contextManagerRunFilePath(rootPath, runId) {
  return runFilePathFor(rootPath, CONTEXT_MANAGER_RUNS_RELATIVE_DIR, runId);
}

function ensureContextManagerRunsStorage(rootPath) {
  return contextManagerRunsDir(rootPath);
}

function executorRunsDir(rootPath) {
  return runsDirFor(rootPath, EXECUTOR_RUNS_RELATIVE_DIR);
}

function executorRunFilePath(rootPath, runId) {
  return runFilePathFor(rootPath, EXECUTOR_RUNS_RELATIVE_DIR, runId);
}

function ensureExecutorRunsStorage(rootPath) {
  return executorRunsDir(rootPath);
}

function readPlannerRun(rootPath, runId) {
  return readJson(plannerRunFilePath(rootPath, runId), null);
}

function listPlannerRuns(rootPath) {
  return listRuns(rootPath, PLANNER_RUNS_RELATIVE_DIR);
}

function summarizePlannerRun(run) {
  if (!run) return null;
  return {
    id: run.id,
    agent_id: run.agent_id || run.attribution?.agent_id || null,
    agent_version: run.agent_version || run.attribution?.agent_version || null,
    outcome: run.outcome,
    status: run.status,
    mode: run.mode,
    handoffId: run.handoffId,
    summary: run.summary,
    reason: run.reason || null,
    planBundle: run.planBundle || null,
    taskBundle: run.taskBundle || null,
    contextLanes: run.contextLanes || run.planBundle?.contextLanes || run.taskBundle?.contextLanes || null,
    overrideLayer: run.overrideLayer || run.planBundle?.overrideLayer || run.taskBundle?.overrideLayer || null,
    planningMode: run.planningMode || run.planBundle?.planningMode || run.taskBundle?.planningMode || 'normal',
    qaStatus: run.qaStatus || run.planBundle?.qaStatus || run.taskBundle?.qaStatus || 'pending',
    qaCoverageRequired: run.qaCoverageRequired ?? run.planBundle?.qaCoverageRequired ?? run.taskBundle?.qaCoverageRequired ?? false,
    qaBlocker: Boolean(run.qaBlocker ?? run.planBundle?.qaBlocker ?? run.taskBundle?.qaBlocker ?? false),
    releaseBlocker: Boolean(run.releaseBlocker ?? run.planBundle?.releaseBlocker ?? run.taskBundle?.releaseBlocker ?? false),
    dependencyMap: run.dependencyMap || null,
    staffingRequest: run.staffingRequest || null,
    qaRequest: run.qaRequest || null,
    hireRequest: run.hireRequest || null,
    hireRequestQueue: run.hireRequestQueue || null,
    outtray: run.outtray || null,
    qaQueue: run.qaQueue || null,
    qaReview: run.qaReview || null,
    qaFindings: Array.isArray(run.qaFindings) ? run.qaFindings : [],
    archivalSummary: run.archivalSummary || null,
    contextUpdatePacket: run.contextUpdatePacket || null,
    planCount: Array.isArray(run.planBundle?.items) ? run.planBundle.items.length : 0,
    taskCount: Array.isArray(run.taskBundle?.tasks) ? run.taskBundle.tasks.length : 0,
    dependencyCount: Array.isArray(run.dependencyMap?.edges) ? run.dependencyMap.edges.length : 0,
    proposalArtifactRefs: Array.isArray(run.proposalArtifactRefs) ? run.proposalArtifactRefs : [],
    llmStatus: run.llmStatus || (run.outcome === 'completed' ? 'live' : 'model_error'),
    cognitionDiagnostics: run.cognitionDiagnostics || null,
    taskCacheSource: run.taskCache?.source || run.taskCacheSource || null,
    taskCacheStage: run.taskCache?.stage || run.taskCacheStage || null,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
  };
}

function readContextManagerRun(rootPath, runId) {
  return readJson(contextManagerRunFilePath(rootPath, runId), null);
}

function listContextManagerRuns(rootPath) {
  return listRuns(rootPath, CONTEXT_MANAGER_RUNS_RELATIVE_DIR);
}

function summarizeContextManagerRun(run) {
  if (!run) return null;
  return {
    id: run.id,
    agent_id: run.agent_id || run.attribution?.agent_id || null,
    agent_version: run.agent_version || run.attribution?.agent_version || null,
    outcome: run.outcome,
    status: run.status,
    mode: run.mode,
    summary: run.summary,
    reason: run.reason || null,
    handoffId: run.handoffId || null,
    sourceNodeId: run.sourceNodeId || null,
    usedFallback: Boolean(run.usedFallback),
    createdAt: run.createdAt,
    completedAt: run.completedAt,
  };
}

function readExecutorRun(rootPath, runId) {
  return readJson(executorRunFilePath(rootPath, runId), null);
}

function listExecutorRuns(rootPath) {
  return listRuns(rootPath, EXECUTOR_RUNS_RELATIVE_DIR);
}

function summarizeExecutorRun(run) {
  if (!run) return null;
  return {
    id: run.id,
    agent_id: run.agent_id || run.attribution?.agent_id || null,
    agent_version: run.agent_version || run.attribution?.agent_version || null,
    outcome: run.outcome,
    status: run.status,
    mode: run.mode,
    cardId: run.cardId || null,
    taskId: run.taskId || null,
    summary: run.summary,
    decision: run.report?.decision || null,
    reason: run.reason || null,
    usedFallback: Boolean(run.usedFallback),
    taskCacheSource: run.taskCache?.source || run.taskCacheSource || null,
    taskCacheStage: run.taskCache?.stage || run.taskCacheStage || null,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
  };
}

function buildAnchorPromptSections(anchorBundle = {}, { anchorRefs = null, limit = null, contentChars = 1600 } = {}) {
  const requestedRefs = Array.isArray(anchorRefs)
    ? new Set(anchorRefs.map(normalizeRelativePath).filter(Boolean))
    : null;
  const anchors = Object.values(anchorBundle.anchors || {})
    .filter((anchor) => anchor?.exists && anchor.authority === 'canonical-anchor')
    .filter((anchor) => !requestedRefs || requestedRefs.has(normalizeRelativePath(anchor.relativePath || '')));
  return anchors
    .slice(0, Number.isFinite(Number(limit)) ? Number(limit) : anchors.length)
    .map((anchor) => {
      const content = String(anchor.content || '').trim().slice(0, Math.max(120, Number(contentChars || 1600)));
      return `## ${anchor.relativePath}\n${content || '(empty)'}`;
    })
    .join('\n\n');
}

function buildBoardPromptSection(board = {}, { mode = 'full' } = {}) {
  const cards = Array.isArray(board.cards) ? board.cards : [];
  if (!cards.length) return 'No current board cards.';
  if (mode === 'scoped') {
    const selectedCard = cards.find((card) => card?.id === board?.selectedCardId) || null;
    const activeCards = cards.filter((card) => card?.status !== 'binned');
    return [
      `Selected card: ${selectedCard?.title || board?.selectedCardId || 'none'}`,
      `Active card count: ${activeCards.length}`,
      ...activeCards
        .slice(0, 3)
        .map((card) => `- ${truncateText(card.title || card.summary || 'Untitled card', 96)} | status=${card.status || 'unknown'}`),
    ].join('\n');
  }
  return cards
    .filter((card) => card.status !== 'binned')
    .slice(0, 12)
    .map((card) => `- ${card.title} | status=${card.status} | handoff=${card.sourceHandoffId || 'none'} | anchors=${(card.sourceAnchorRefs || []).join(', ') || 'none'}`)
    .join('\n');
}

function normalizePlannerPromptScope(promptScope = '') {
  const normalized = String(promptScope || '').trim().toLowerCase();
  return ['scoped', 'broad', 'full'].includes(normalized) ? normalized : 'scoped';
}

function resolvePlannerPromptScope({ promptScope = null, handoff = null } = {}) {
  if (promptScope) return normalizePlannerPromptScope(promptScope);
  if (handoff?.contextScope) return normalizePlannerPromptScope(handoff.contextScope);
  if (handoff?.requireBroadContext === true) return 'broad';
  if (['architecture_request', 'constraint_request'].includes(String(handoff?.requestType || '').trim().toLowerCase())) {
    return 'broad';
  }
  return 'scoped';
}

function buildPlannerOverrideLayerSection(overrideLayer = null, planningMode = 'normal', promptScope = 'scoped') {
  const resolved = overrideLayer && typeof overrideLayer === 'object'
    ? overrideLayer
    : {
      version: '1',
      activeCount: 0,
      flags: {
        forcePlannerRouting: false,
        forcePlanningGeneration: false,
        reopenStalePlan: false,
        supersedeQueuePriority: false,
        requestEmergencyStaffingReview: false,
        handoffMode: null,
        forcePlanning: false,
      },
      activeOverrides: [],
      planningMode,
      canonicalTruthPreserved: true,
    };
  if (promptScope === 'scoped') {
    const activeFlags = Object.entries(resolved.flags || {})
      .filter(([, value]) => value === true || (typeof value === 'string' && value.trim()))
      .map(([key, value]) => `${key}=${value}`)
      .slice(0, 6);
    return [
      '## CTO Override Layer',
      `Planning mode: ${resolved.planningMode || planningMode || 'normal'}`,
      `Active overrides: ${Number(resolved.activeCount || 0)}`,
      `Canonical truth preserved: ${resolved.canonicalTruthPreserved === false ? 'no' : 'yes'}`,
      `Active flags: ${activeFlags.join(', ') || 'none'}`,
    ].join('\n');
  }
  return [
    '## CTO Override Layer',
    'Treat overrides as explicit control signals. Do not rewrite canonical truth to make overrides look normal. Keep provenance intact and describe forced planning separately from ordinary planning.',
    JSON.stringify(resolved, null, 2),
  ].join('\n');
}

function buildPlannerContextLanesSection({ handoff = null, contextLanes = null, promptScope = 'scoped' } = {}) {
  const requestedOutcomes = Array.isArray(handoff?.requestedOutcomes)
    ? handoff.requestedOutcomes
    : (Array.isArray(handoff?.tasks) ? handoff.tasks : []);
  const resolvedContextLanes = contextLanes || handoff?.contextLanes || null;
  if (promptScope === 'scoped') {
    const narrow = resolvedContextLanes?.narrow || {};
    const department = resolvedContextLanes?.department || {};
    const broad = resolvedContextLanes?.broad || {};
    return [
      '## Planner Context Lanes',
      'Stay with immediate task context by default. Pull broader context only when the canonical intent and active anchors are insufficient.',
      `Narrow task: ${truncateText(narrow.currentTask || requestedOutcomes[0] || handoff?.summary || 'Plan the next action.', 180)}`,
      `Department focus: ${truncateText(department.currentFocus || handoff?.summary || 'No department focus supplied.', 180)}`,
      `Department blockers: ${uniqueStrings(department.blockers || handoff?.constraints || []).slice(0, 4).join(' | ') || 'none'}`,
      `Broad context available on demand: ${(Array.isArray(broad.projectBrain) ? broad.projectBrain.length : 0) + (Array.isArray(broad.roadmap) ? broad.roadmap.length : 0) + (Array.isArray(broad.recentDecisions) ? broad.recentDecisions.length : 0)} summary entries`,
    ].join('\n');
  }
  return [
    '## Planner Context Lanes',
    'Use the declared lanes intentionally: local/narrow for the current task and active intent, department/operational for recent handoffs and blockers, and broad/project for project brain, roadmap, and recent decisions.',
    JSON.stringify(resolvedContextLanes || {
      narrow: {
        lane: 'local',
        currentDesk: 'planner',
        currentTask: requestedOutcomes[0] || handoff?.summary || 'Plan the next action.',
      },
      department: {
        lane: 'department',
        departmentId: 'dept-delivery',
        currentFocus: handoff?.summary || '',
        blockers: Array.isArray(handoff?.constraints) ? handoff.constraints : [],
      },
      broad: {
        lane: 'broad',
        projectBrain: [],
        roadmap: [],
        recentDecisions: [],
      },
    }, null, 2),
  ].join('\n');
}

function buildPlannerSecondaryRetrievalSection({ handoff = null, contextLanes = null, anchorBundle = null, board = null, promptScope = 'scoped' } = {}) {
  const resolvedContextLanes = contextLanes || handoff?.contextLanes || null;
  const broad = resolvedContextLanes?.broad || {};
  const anchorRefs = uniqueStrings(handoff?.anchorRefs || []).map(normalizeRelativePath);
  const retrievalLines = [
    `Project brain summaries: ${Array.isArray(broad.projectBrain) ? broad.projectBrain.length : 0}`,
    `Roadmap summaries: ${Array.isArray(broad.roadmap) ? broad.roadmap.length : 0}`,
    `Recent decisions: ${Array.isArray(broad.recentDecisions) ? broad.recentDecisions.length : 0}`,
    `Truth sources: ${Array.isArray(broad.truthSources) ? broad.truthSources.length : 0}`,
    `Anchor refs available: ${anchorRefs.join(', ') || 'none'}`,
    `Board context available: ${Array.isArray(board?.cards) ? board.cards.filter((card) => card?.status !== 'binned').length : 0} active cards`,
  ];
  if (promptScope === 'scoped') {
    return [
      '## Secondary Retrieval Availability',
      'Broader project context remains available through explicit broad planner scope. Do not load it unless the immediate handoff cannot be decomposed from the canonical intent, active anchors, and current blockers.',
      ...retrievalLines,
    ].join('\n');
  }
  const broadSummaries = [
    ...(Array.isArray(broad.projectBrain) ? broad.projectBrain : []).slice(0, 2).map((entry) => `- project_brain: ${truncateText(entry.summary || entry.relativePath || '', 160)}`),
    ...(Array.isArray(broad.roadmap) ? broad.roadmap : []).slice(0, 2).map((entry) => `- roadmap: ${truncateText(entry.summary || entry.relativePath || '', 160)}`),
    ...(Array.isArray(broad.recentDecisions) ? broad.recentDecisions : []).slice(0, 2).map((entry) => `- decision: ${truncateText(entry.summary || entry.relativePath || '', 160)}`),
  ];
  return [
    '## Secondary Retrieval Context',
    'This broader context was explicitly requested. Keep using it as supporting context rather than replacing the canonical intent contract.',
    ...retrievalLines,
    ...broadSummaries,
  ].join('\n');
}

function buildPlannerPromptProfile({ promptTemplate, handoff, anchorBundle, board, rootPath, taskCache = null, contextLanes = null, overrideLayer = null, talentAcquisition = null, promptScope = null }) {
  const requestedOutcomes = Array.isArray(handoff?.requestedOutcomes)
    ? handoff.requestedOutcomes
    : (Array.isArray(handoff?.tasks) ? handoff.tasks : []);
  const selectedCard = Array.isArray(board?.cards)
    ? board.cards.find((card) => card?.id && card.id === board?.selectedCardId) || null
    : null;
  const resolvedTaskCache = taskCache || readTaskCache(rootPath, {
    taskId: String(
      handoff?.taskId
      || handoff?.runnerTaskId
      || selectedCard?.runnerTaskId
      || selectedCard?.builderTaskId
      || selectedCard?.executionPackage?.taskId
      || '',
    ).trim() || null,
    stage: 'planner',
  });
  const fixTaskSection = buildFixTaskPromptSection(handoff?.sourceFixTask || null);
  const intentContract = handoff?.intentContract || buildCanonicalIntentContract({
    report: {
      summary: handoff?.summary || '',
      goal: handoff?.goal || handoff?.summary || '',
      requestedOutcomes,
      tasks: requestedOutcomes,
      targets: Array.isArray(handoff?.targets) ? handoff.targets : [],
      constraints: Array.isArray(handoff?.constraints) ? handoff.constraints : [],
      urgency: handoff?.urgency || 'normal',
      requestType: handoff?.requestType || 'context_request',
      nodeId: handoff?.sourceNodeId || null,
      requestedBy: handoff?.requestedBy || 'context-manager',
      priority: handoff?.priority || handoff?.urgency || 'normal',
      anchorRefs: Array.isArray(handoff?.anchorRefs) ? handoff.anchorRefs : [],
    },
    packet: {
      summary: handoff?.summary || '',
      goal: handoff?.goal || handoff?.summary || '',
      requestedOutcomes,
      tasks: requestedOutcomes,
      targets: Array.isArray(handoff?.targets) ? handoff.targets : [],
      constraints: Array.isArray(handoff?.constraints) ? handoff.constraints : [],
      urgency: handoff?.urgency || 'normal',
      requestType: handoff?.requestType || 'context_request',
      sourceType: handoff?.sourceType || 'context-manager',
      sourceRef: handoff?.sourceRef || handoff?.sourceNodeId || null,
      requestedBy: handoff?.requestedBy || 'context-manager',
      priority: handoff?.priority || handoff?.urgency || 'normal',
      anchorRefs: Array.isArray(handoff?.anchorRefs) ? handoff.anchorRefs : [],
    },
    sourceType: handoff?.sourceType || 'context-manager',
    sourceRef: handoff?.sourceRef || handoff?.sourceNodeId || null,
    requestedBy: handoff?.requestedBy || 'context-manager',
    priority: handoff?.priority || handoff?.urgency || 'normal',
    timestamp: handoff?.timestamp || handoff?.createdAt || nowIso(),
    provenance: handoff?.provenance || {},
    intentId: handoff?.intentId || null,
  });
  const resolvedContextLanes = contextLanes || handoff?.contextLanes || null;
  const resolvedOverrideLayer = overrideLayer || handoff?.overrideLayer || null;
  const resolvedPromptScope = resolvePlannerPromptScope({ promptScope, handoff });
  const scopedMode = resolvedPromptScope === 'scoped';
  const includedSections = [
    'known_fixes',
    'task_cache',
    'canonical_intent_contract',
    'context_lanes',
    'override_layer',
    'required_output_contract',
    'derived_brief',
    'anchor_context',
    'secondary_retrieval',
    'team_board',
  ];
  if (fixTaskSection) includedSections.splice(2, 0, 'fix_task_intake');
  if (talentAcquisition) includedSections.push('ta_coverage');
  const lines = [
    String(promptTemplate || FALLBACK_PLANNER_PROMPT).trim(),
    '',
    buildKnownFixesPromptSection(rootPath, { limit: scopedMode ? 2 : 5 }),
    buildTaskCachePromptSection(resolvedTaskCache, {
      stage: 'planner',
      limitChars: scopedMode ? PLANNER_SCOPED_TASK_CACHE_LIMIT_CHARS : PLANNER_BROAD_TASK_CACHE_LIMIT_CHARS,
    }),
    fixTaskSection,
    '## Canonical Intent Contract',
    'Treat this contract as the source of truth. Do not invent tasks from summary text or UI state when this contract is available.',
    JSON.stringify(intentContract, null, 2),
    '',
    buildPlannerContextLanesSection({
      handoff,
      contextLanes: resolvedContextLanes,
      promptScope: resolvedPromptScope,
    }),
    '',
    buildPlannerOverrideLayerSection(
      resolvedOverrideLayer,
      String(resolvedOverrideLayer?.planningMode || handoff?.planningMode || 'normal').trim() || 'normal',
      resolvedPromptScope,
    ),
    '',
    '## Required Planner Output Contract',
    'Return machine-readable planner artefacts. Use the canonical intent to populate every object.',
    'The planner must emit planBundle, taskBundle, dependencyMap, staffingRequest, qaRequest, outtray, archivalSummary, and contextUpdatePacket.',
    'If staffing coverage is missing or risky, also emit hireRequest so TA can queue the work without blocking planning.',
    'Every plan item must include planId, intentId, status, priority, summary, acceptanceCriteria, dependencies, targetDesk, targetRole, handoffState, provenance, createdBy, and createdAt.',
    talentAcquisition ? [
      '## TA Coverage Context',
      `Department summary: ${talentAcquisition.department?.summary || 'unknown'}`,
      `Planner coverage: ${talentAcquisition.plannerCoverage?.covered === false ? 'missing' : 'covered'}`,
      `QA lead coverage: ${talentAcquisition.qaLeadCoverage?.covered === false ? 'missing' : 'covered'}`,
      'Use staffing gaps as queueable work, not as a reason to stop planning.',
    ].join('\n') : '',
    '',
    '## Derived Planner Brief',
    `Handoff ID: ${handoff?.id || 'unknown'}`,
    `Summary: ${handoff?.summary || ''}`,
    `Problem statement: ${handoff?.problemStatement || ''}`,
    '',
    'Constraints:',
    (handoff?.constraints || []).map((constraint) => `- ${constraint}`).join('\n') || '- None',
    '',
    'Anchor refs:',
    (handoff?.anchorRefs || []).map((anchorRef) => `- ${anchorRef}`).join('\n') || '- None',
    '',
    '## Canonical Anchors',
    buildAnchorPromptSections(anchorBundle, {
      anchorRefs: handoff?.anchorRefs || [],
      limit: scopedMode ? PLANNER_SCOPED_ANCHOR_LIMIT : PLANNER_BROAD_ANCHOR_LIMIT,
      contentChars: scopedMode ? PLANNER_SCOPED_ANCHOR_CONTENT_CHARS : PLANNER_BROAD_ANCHOR_CONTENT_CHARS,
    }),
    '',
    buildPlannerSecondaryRetrievalSection({
      handoff,
      contextLanes: resolvedContextLanes,
      anchorBundle,
      board,
      promptScope: resolvedPromptScope,
    }),
    '',
    '## Existing Team Board',
    buildBoardPromptSection(board, { mode: scopedMode ? 'scoped' : 'full' }),
  ];
  const prompt = lines.filter(Boolean).join('\n').trim();
  return {
    prompt,
    promptChars: prompt.length,
    contextMode: resolvedPromptScope,
    includedSections,
    broaderContextAvailable: true,
    repairApplied: {
      timeout_changed: false,
      prompt_scope_changed: true,
      retrieval_shifted: true,
      notes: 'Planner now defaults to a scoped planning brief and moves broad project context to explicit secondary retrieval.',
    },
  };
}

function executorTaskId(card = {}) {
  return String(card?.runnerTaskId || card?.builderTaskId || card?.executionPackage?.taskId || '').trim() || null;
}

function summarizeExecutorVerificationPlan(card = {}) {
  const verificationPlan = card?.executionPackage?.verificationPlan || {};
  return {
    required: Boolean(card?.verifyRequired || verificationPlan.required),
    commandPresets: uniqueStrings((verificationPlan.commands || []).map((entry) => entry?.preset || entry?.command || '')),
    qaScenarios: uniqueStrings((verificationPlan.qaScenarios || []).map((entry) => entry?.scenario || entry?.id || '')),
    summary: String(verificationPlan.summary || '').trim(),
    signature: String(verificationPlan.signature || '').trim() || null,
  };
}

function deriveExecutorAssessment({ card = {}, workspace = {} } = {}) {
  const taskId = executorTaskId(card);
  const verificationPlan = summarizeExecutorVerificationPlan(card);
  const blockers = [];
  const notes = [];
  const selfUpgrade = workspace?.studio?.selfUpgrade || null;

  if (!Array.isArray(card?.sourceAnchorRefs) || !card.sourceAnchorRefs.length) {
    blockers.push('Card has no anchor provenance.');
  }
  if (card?.executionPackage?.status !== 'ready') {
    blockers.push('Card has no ready build package.');
  }
  if (card?.verifyStatus === 'failed' || card?.verifyStatus === 'blocked') {
    blockers.push(card?.lastVerificationSummary || 'Verification failed and must be rerun.');
  }
  if (card?.status === 'review' && card?.approvalState && card.approvalState !== 'approved') {
    blockers.push('Approval is still required before apply can run.');
  }
  if (card?.executorBlocker?.message) {
    blockers.push(card.executorBlocker.message);
  }
  if (card?.targetProjectKey === 'ace-self') {
    if (!selfUpgrade?.preflight?.ok || selfUpgrade.preflight.taskId !== taskId) {
      blockers.push('Self-upgrade preflight is missing or stale for this task.');
    }
    if (card?.applyStatus === 'applied' && card?.deployStatus === 'queued') {
      if (!selfUpgrade?.apply?.ok || selfUpgrade.apply.taskId !== taskId) {
        blockers.push('Deploy requires a successful apply record for this exact task.');
      }
    }
  }

  if (verificationPlan.summary) notes.push(verificationPlan.summary);
  if (taskId) notes.push(`Task ${taskId} targeting ${card?.targetProjectKey || 'unknown'}.`);
  if (card?.verifyStatus === 'running') notes.push('Verification is currently running.');
  if (card?.applyStatus === 'applying') notes.push('Apply is currently running.');
  if (card?.deployStatus === 'deploying') notes.push('Deploy is currently running.');

  const verifyRequired = Boolean(verificationPlan.required);
  const verificationSatisfied = !verifyRequired || ['passed', 'not-required'].includes(card?.verifyStatus);
  const applyReady = !blockers.length
    && verificationSatisfied
    && ['queued', 'idle', 'failed'].includes(card?.applyStatus || 'idle')
    && (
      card?.status === 'complete'
      || (card?.status === 'review' && card?.approvalState === 'approved')
    );
  const deployReady = !blockers.length
    && card?.targetProjectKey === 'ace-self'
    && card?.applyStatus === 'applied'
    && card?.deployStatus === 'queued'
    && card?.status === 'complete';

  let decision = 'blocked';
  if (blockers.length) {
    decision = 'blocked';
  } else if (verifyRequired && !verificationSatisfied) {
    decision = 'verify';
  } else if (deployReady) {
    decision = 'ready-deploy';
  } else if (applyReady) {
    decision = 'ready-apply';
  } else if (card?.deployStatus === 'deployed' || (card?.applyStatus === 'applied' && card?.deployStatus !== 'queued')) {
    decision = 'done';
  }

  const summaryByDecision = {
    blocked: blockers[0] || 'Executor is blocked on current gate state.',
    verify: 'Verification is the next required executor stage.',
    'ready-apply': 'Package is ready for apply once executor starts.',
    'ready-deploy': 'Package is ready for deploy.',
    done: 'Executor flow is already complete for the selected card.',
  };

  return {
    summary: summaryByDecision[decision] || 'Executor assessment complete.',
    decision,
    blockers: uniqueStrings(blockers),
    verifyRequired,
    verificationPlan: {
      commandPresets: verificationPlan.commandPresets,
      qaScenarios: verificationPlan.qaScenarios,
    },
    applyReady,
    deployReady,
    notes: uniqueStrings(notes).slice(0, 6),
  };
}

function buildExecutorCardSection(card = {}) {
  const verificationPlan = summarizeExecutorVerificationPlan(card);
  return [
    `ID: ${card?.id || 'unknown'}`,
    `Title: ${card?.title || 'Untitled card'}`,
    `Status: ${card?.status || 'unknown'}`,
    `Approval: ${card?.approvalState || 'unknown'}`,
    `Risk: ${card?.riskLevel || 'unknown'}`,
    `Target project: ${card?.targetProjectKey || 'unknown'}`,
    `Task: ${executorTaskId(card) || 'unbound'}`,
    `Verify status: ${card?.verifyStatus || 'unknown'}`,
    `Apply status: ${card?.applyStatus || 'unknown'}`,
    `Deploy status: ${card?.deployStatus || 'unknown'}`,
    `Expected action: ${card?.executionPackage?.expectedAction || 'apply'}`,
    `Patch path: ${card?.executionPackage?.patchPath || 'none'}`,
    `Changed files: ${(card?.executionPackage?.changedFiles || []).join(', ') || 'none'}`,
    `Anchors: ${(card?.sourceAnchorRefs || []).join(', ') || 'none'}`,
    `Verification required: ${verificationPlan.required ? 'yes' : 'no'}`,
    `Verification commands: ${verificationPlan.commandPresets.join(', ') || 'none'}`,
    `Verification QA: ${verificationPlan.qaScenarios.join(', ') || 'none'}`,
    `Executor blocker: ${card?.executorBlocker?.message || 'none'}`,
  ].join('\n');
}

function buildExecutorWorkspaceSection(workspace = {}) {
  const board = workspace?.studio?.teamBoard || {};
  const summary = board?.summary || {};
  const selfUpgrade = workspace?.studio?.selfUpgrade || {};
  return [
    `Selected card id: ${board?.selectedCardId || 'none'}`,
    `Board counts: plan=${summary.plan || 0} active=${summary.active || 0} review=${summary.review || 0} complete=${summary.complete || 0}`,
    `Self-upgrade preflight: ${selfUpgrade?.preflight?.ok ? `pass for task ${selfUpgrade.preflight.taskId || 'unknown'}` : (selfUpgrade?.preflight?.summary || 'none')}`,
    `Self-upgrade apply: ${selfUpgrade?.apply?.ok ? `pass for task ${selfUpgrade.apply.taskId || 'unknown'}` : (selfUpgrade?.apply?.status || 'none')}`,
  ].join('\n');
}

function buildExecutorPrompt({ promptTemplate, card, workspace, rootPath, taskCache = null }) {
  const resolvedTaskCache = taskCache || readTaskCache(rootPath, {
    taskId: executorTaskId(card),
    stage: 'executor',
  });
  const fixTaskSection = buildFixTaskPromptSection(card?.sourceFixTask || card?.executionPackage?.sourceFixTask || null);
  return [
    String(promptTemplate || FALLBACK_EXECUTOR_PROMPT).trim(),
    '',
    buildKnownFixesPromptSection(rootPath),
    buildTaskCachePromptSection(resolvedTaskCache, { stage: 'executor' }),
    fixTaskSection,
    '## Selected Execution Card',
    buildExecutorCardSection(card),
    '',
    '## Current Workspace Slice',
    buildExecutorWorkspaceSection(workspace),
    '',
    '## Existing Team Board',
    buildBoardPromptSection(workspace?.studio?.teamBoard || { cards: [] }),
  ].join('\n').trim();
}

function buildPlannerPrompt(options = {}) {
  return buildPlannerPromptProfile(options).prompt;
}

function normalizePlannerCard(card, handoff) {
  const title = String(card?.title || card?.summary || '').trim();
  if (!title) return null;
  const handoffRefs = uniqueStrings(handoff?.anchorRefs || []).map(normalizeRelativePath);
  const requestedRefs = uniqueStrings(card?.anchorRefs || []).map(normalizeRelativePath);
  const anchorRefs = (requestedRefs.length ? requestedRefs : handoffRefs)
    .filter((anchorRef) => handoffRefs.includes(anchorRef));
  if (!anchorRefs.length) return null;
  return {
    title: title.slice(0, 120),
    summary: String(card?.summary || '').trim(),
    anchorRefs,
    targetProjectKey: String(card?.targetProjectKey || 'ace-self').trim() || 'ace-self',
  };
}

function normalizeBrainProposal(proposal) {
  const targetPath = normalizeRelativePath(proposal?.targetPath || '');
  if (!ALLOWED_PROPOSAL_TARGETS.has(targetPath)) return null;
  const content = String(proposal?.content || '').trim();
  if (!content) return null;
  return {
    targetPath,
    summary: String(proposal?.summary || `Proposal for ${targetPath}`).trim(),
    content,
  };
}

function normalizePlannerOutputStatus(value, fallback = 'ready') {
  const normalized = String(value || '').trim().toLowerCase();
  return PLANNER_OUTPUT_STATUSES.has(normalized) ? normalized : fallback;
}

function normalizePlannerHireRequestBlockingLevel(value = 'advisory') {
  const normalized = String(value || '').trim().toLowerCase();
  return ['advisory', 'capacity_risk', 'handoff_risk', 'hard_block'].includes(normalized)
    ? normalized
    : 'advisory';
}

function normalizePlannerHireRequestStatus(value = 'queued') {
  const normalized = String(value || '').trim().toLowerCase();
  return ['queued', 'reviewing', 'fulfilled', 'rejected', 'cancelled', 'deferred'].includes(normalized)
    ? normalized
    : 'queued';
}

function buildPlannerHireRequest({
  payload = {},
  handoff = null,
  intentId = null,
  planItems = [],
  staffingRequest = null,
  talentAcquisition = null,
  workspace = null,
  baseCreatedBy = 'planner',
  baseCreatedAt = nowIso(),
  overrideLayer = null,
  planningMode = 'normal',
} = {}) {
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  const explicitRequest = safePayload.hireRequest && typeof safePayload.hireRequest === 'object'
    ? safePayload.hireRequest
    : null;
  const qaLeadCoverage = talentAcquisition?.qaLeadCoverage && typeof talentAcquisition.qaLeadCoverage === 'object'
    ? talentAcquisition.qaLeadCoverage
    : null;
  const plannerCoverage = talentAcquisition?.plannerCoverage && typeof talentAcquisition.plannerCoverage === 'object'
    ? talentAcquisition.plannerCoverage
    : null;
  const sourceCoverage = qaLeadCoverage && qaLeadCoverage.covered === false
    ? qaLeadCoverage
    : (plannerCoverage && plannerCoverage.covered === false ? plannerCoverage : null);
  if (!explicitRequest && !sourceCoverage) return null;

  const originDepartmentId = String(
    explicitRequest?.originDepartmentId
    || workspace?.studio?.layout?.organization?.planner?.departmentId
    || 'dept-delivery',
  ).trim() || 'dept-delivery';
  const originDeskId = String(
    explicitRequest?.originDeskId
    || workspace?.studio?.layout?.organization?.planner?.deskId
    || 'planner',
  ).trim() || 'planner';
  const requestedRoleId = String(
    explicitRequest?.requestedRoleId
    || sourceCoverage?.canonical?.roleId
    || sourceCoverage?.entityId
    || staffingRequest?.targetDesk
    || staffingRequest?.targetRole
    || 'qa-lead',
  ).trim() || 'qa-lead';
  const linkedPlanIds = uniqueStrings([
    ...(Array.isArray(explicitRequest?.linkedPlanIds) ? explicitRequest.linkedPlanIds : []),
    ...planItems.map((item) => item.planId),
  ]);
  const blockingLevel = normalizePlannerHireRequestBlockingLevel(
    explicitRequest?.blockingLevel
    || (requestedRoleId === 'planner' ? 'hard_block' : (sourceCoverage?.blocker ? 'handoff_risk' : 'capacity_risk')),
  );
  const reason = String(
    explicitRequest?.reason
    || sourceCoverage?.reason
    || (requestedRoleId === 'qa-lead'
      ? 'QA coverage is missing, so TA should review staffing while planning continues.'
      : `${requestedRoleId} coverage is missing, so TA should review staffing while planning continues.`),
  ).trim();
  const hireRequest = normalizeTaHireRequestEntry({
    ...explicitRequest,
    hireRequestId: explicitRequest?.hireRequestId || `hire_${intentId || handoff?.id || 'planner'}`,
    originDepartmentId,
    originDeskId,
    requestedRoleId,
    reason,
    urgency: String(explicitRequest?.urgency || sourceCoverage?.urgency || talentAcquisition?.department?.urgency || staffingRequest?.urgency || 'normal').trim().toLowerCase() || 'normal',
    blockingLevel,
    linkedPlanIds,
    createdAt: String(explicitRequest?.createdAt || baseCreatedAt).trim() || baseCreatedAt,
    status: normalizePlannerHireRequestStatus(explicitRequest?.status || 'queued'),
    intentId,
    plannerRunId: String(explicitRequest?.plannerRunId || handoff?.plannerRunId || '').trim() || null,
    planBundleId: String(explicitRequest?.planBundleId || safePayload.planBundle?.planId || '').trim() || null,
    taskBundleId: String(explicitRequest?.taskBundleId || safePayload.taskBundle?.taskBundleId || '').trim() || null,
    staffingRequestId: String(explicitRequest?.staffingRequestId || staffingRequest?.staffingRequestId || '').trim() || null,
    qaRequestId: String(explicitRequest?.qaRequestId || safePayload.qaRequest?.qaRequestId || '').trim() || null,
    requestedBy: String(explicitRequest?.requestedBy || explicitRequest?.createdBy || baseCreatedBy).trim() || baseCreatedBy,
    summary: String(explicitRequest?.summary || reason).trim(),
    targetDeskId: String(explicitRequest?.targetDeskId || staffingRequest?.targetDesk || requestedRoleId).trim() || requestedRoleId,
    targetRoleId: String(explicitRequest?.targetRoleId || staffingRequest?.targetRole || requestedRoleId).trim() || requestedRoleId,
    provenance: {
      ...(explicitRequest?.provenance && typeof explicitRequest.provenance === 'object' ? explicitRequest.provenance : {}),
      sourceHandoffId: handoff?.id || explicitRequest?.provenance?.sourceHandoffId || null,
      sourceIntentId: intentId,
      sourceType: handoff?.sourceType || explicitRequest?.provenance?.sourceType || null,
      sourceRef: handoff?.sourceRef || explicitRequest?.provenance?.sourceRef || null,
      overrideIds: uniqueStrings([
        ...((explicitRequest?.provenance && Array.isArray(explicitRequest.provenance.overrideIds)) ? explicitRequest.provenance.overrideIds : []),
        ...((overrideLayer?.activeOverrides || []).map((override) => override.overrideId).filter(Boolean)),
      ]),
      anchorRefs: uniqueStrings([
        ...(Array.isArray(explicitRequest?.provenance?.anchorRefs) ? explicitRequest.provenance.anchorRefs : []),
        ...(Array.isArray(handoff?.anchorRefs) ? handoff.anchorRefs : []),
      ]),
    },
    notes: Array.isArray(explicitRequest?.notes) ? explicitRequest.notes : [],
    resolution: explicitRequest?.resolution || null,
    reviewedAt: explicitRequest?.reviewedAt || null,
    reviewedBy: explicitRequest?.reviewedBy || null,
    fulfilledAt: explicitRequest?.fulfilledAt || null,
    fulfilledBy: explicitRequest?.fulfilledBy || null,
    fulfilledCandidate: explicitRequest?.fulfilledCandidate || null,
    closedAt: explicitRequest?.closedAt || null,
    closedBy: explicitRequest?.closedBy || null,
  });
  return hireRequest.status === 'queued' ? hireRequest : { ...hireRequest, status: 'queued' };
}

function normalizePlannerQaState(payload = {}, fallbackStatus = 'pending') {
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  const qaStatus = normalizePlannerOutputStatus(
    safePayload.qaStatus
    || safePayload.planBundle?.qaStatus
    || safePayload.taskBundle?.qaStatus
    || fallbackStatus,
    fallbackStatus,
  );
  const qaCoverageRequired = safePayload.qaCoverageRequired !== false
    && safePayload.planBundle?.qaCoverageRequired !== false
    && safePayload.taskBundle?.qaCoverageRequired !== false;
  const qaBlocker = Boolean(
    safePayload.qaBlocker
    || safePayload.planBundle?.qaBlocker
    || safePayload.taskBundle?.qaBlocker,
  );
  const releaseBlocker = Boolean(
    safePayload.releaseBlocker
    || safePayload.planBundle?.releaseBlocker
    || safePayload.taskBundle?.releaseBlocker,
  );
  return {
    qaStatus,
    qaCoverageRequired,
    qaBlocker,
    releaseBlocker,
  };
}

function normalizePlannerDependencies(dependencies = []) {
  const source = Array.isArray(dependencies) ? dependencies : (dependencies ? [dependencies] : []);
  return uniqueStrings(source.map((entry) => {
    if (!entry) return '';
    if (typeof entry === 'string') return entry;
    if (typeof entry === 'object') {
      return String(entry.planId || entry.taskId || entry.id || entry.dependencyId || entry.sourcePlanId || entry.targetPlanId || '').trim();
    }
    return String(entry).trim();
  })).slice(0, 12);
}

function normalizePlannerPlanItem(item, handoff, index = 0, fallbackIntentId = null, overrideLayer = null) {
  const intentId = String(item?.intentId || fallbackIntentId || handoff?.intentContract?.intentId || handoff?.intentId || '').trim() || null;
  const summary = String(item?.summary || item?.title || handoff?.requestedOutcomes?.[index] || handoff?.summary || '').trim();
  if (!summary) return null;
  const planId = String(item?.planId || item?.id || `plan_${index + 1}`).trim();
  const createdAt = String(item?.createdAt || handoff?.createdAt || nowIso()).trim() || nowIso();
  const targetDesk = String(item?.targetDesk || item?.deskId || handoff?.targetDesk || 'planner').trim() || 'planner';
  const targetRole = String(item?.targetRole || item?.roleId || handoff?.targetRole || '').trim() || null;
  const dependencies = normalizePlannerDependencies(item?.dependencies);
  const acceptanceCriteria = uniqueStrings([
    ...(Array.isArray(item?.acceptanceCriteria) ? item.acceptanceCriteria : []),
    ...(Array.isArray(item?.criteria) ? item.criteria : []),
    ...(Array.isArray(item?.acceptance_criteria) ? item.acceptance_criteria : []),
  ]);
  const provenance = {
    ...((item?.provenance && typeof item.provenance === 'object') ? item.provenance : {}),
    sourceHandoffId: handoff?.id || item?.provenance?.sourceHandoffId || null,
    sourceIntentId: intentId,
    sourceType: handoff?.sourceType || item?.provenance?.sourceType || null,
    sourceRef: handoff?.sourceRef || item?.provenance?.sourceRef || null,
    anchorRefs: uniqueStrings([
      ...(Array.isArray(item?.provenance?.anchorRefs) ? item.provenance.anchorRefs : []),
      ...(Array.isArray(handoff?.anchorRefs) ? handoff.anchorRefs : []),
    ]),
  };
  const overrideIds = uniqueStrings((overrideLayer?.activeOverrides || []).map((entry) => entry.overrideId));
  if (overrideIds.length) {
    provenance.overrideIds = uniqueStrings([
      ...(Array.isArray(item?.provenance?.overrideIds) ? item.provenance.overrideIds : []),
      ...overrideIds,
    ]);
  }
  return {
    planId,
    intentId,
    status: normalizePlannerOutputStatus(item?.status || handoff?.status || 'ready', 'ready'),
    priority: normalizeIntentPriority(item?.priority || handoff?.priority || 'normal'),
    summary,
    acceptanceCriteria,
    dependencies,
    targetDesk,
    targetRole,
    handoffState: PLANNER_HANOFF_STATES.has(String(item?.handoffState || handoff?.status || 'ready').trim().toLowerCase())
      ? String(item?.handoffState || handoff?.status || 'ready').trim().toLowerCase()
      : 'ready',
    provenance,
    createdBy: String(item?.createdBy || handoff?.requestedBy || 'planner').trim() || 'planner',
    createdAt,
  };
}

function normalizePlannerTaskItem(item, handoff, index = 0, fallbackIntentId = null, overrideLayer = null) {
  const planItem = normalizePlannerPlanItem(item, handoff, index, fallbackIntentId, overrideLayer);
  if (!planItem) return null;
  return {
    taskId: String(item?.taskId || item?.id || `${planItem.planId}_task`).trim(),
    planId: planItem.planId,
    intentId: planItem.intentId,
    status: normalizePlannerOutputStatus(item?.status || 'planned', 'planned'),
    priority: planItem.priority,
    summary: planItem.summary,
    acceptanceCriteria: planItem.acceptanceCriteria,
    dependencies: planItem.dependencies,
    targetDesk: String(item?.targetDesk || 'executor').trim() || 'executor',
    targetRole: String(item?.targetRole || 'Executor').trim() || 'Executor',
    handoffState: planItem.handoffState,
    provenance: planItem.provenance,
    createdBy: String(item?.createdBy || planItem.createdBy || 'planner').trim() || 'planner',
    createdAt: String(item?.createdAt || planItem.createdAt || nowIso()).trim() || nowIso(),
  };
}

function buildPlannerDependencyMap(planItems = [], handoff, intentId = null, createdBy = 'planner', createdAt = nowIso()) {
  const edges = [];
  (Array.isArray(planItems) ? planItems : []).forEach((item) => {
    (Array.isArray(item?.dependencies) ? item.dependencies : []).forEach((dependencyId) => {
      if (!dependencyId) return;
      edges.push({
        dependencyId: `${item.planId || 'plan'}__depends_on__${dependencyId}`,
        sourcePlanId: dependencyId,
        targetPlanId: item.planId,
        type: 'depends_on',
        status: 'active',
        provenance: {
          sourceHandoffId: handoff?.id || null,
          sourceIntentId: intentId,
          sourceType: handoff?.sourceType || null,
          sourceRef: handoff?.sourceRef || null,
        },
        createdBy,
        createdAt,
      });
    });
  });
  return {
    dependencyMapId: `dependency_map_${intentId || handoff?.id || 'planner'}`,
    intentId: intentId || handoff?.intentContract?.intentId || handoff?.intentId || null,
    status: edges.length ? 'ready' : 'empty',
    edges,
  };
}

function buildPlannerOuttrayArtifact(payload = {}, handoff = null, planBundle = null, taskBundle = null, options = {}) {
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  const safeOptions = options && typeof options === 'object' ? options : {};
  const baseCreatedBy = String(safePayload.createdBy || handoff?.requestedBy || 'planner').trim() || 'planner';
  const baseCreatedAt = String(safePayload.createdAt || handoff?.createdAt || nowIso()).trim() || nowIso();
  const intentId = String(
    safePayload.intentId
    || planBundle?.intentId
    || taskBundle?.intentId
    || handoff?.intentContract?.intentId
    || handoff?.intentId
    || '',
  ).trim() || null;
  const runArtifactRef = safeOptions.runId
    ? path.join('data', 'spatial', 'agent-runs', 'planner', `${safeOptions.runId}.json`).replace(/\\/g, '/')
    : null;
  const artifactRefs = uniqueStrings([
    ...(Array.isArray(safePayload.artifactRefs) ? safePayload.artifactRefs : []),
    ...(Array.isArray(safeOptions.proposalArtifactRefs) ? safeOptions.proposalArtifactRefs : []),
    ...(runArtifactRef ? [runArtifactRef] : []),
  ]);
  const lanes = Array.isArray(safePayload.items)
    ? safePayload.items
    : [
        {
          laneId: 'qa',
          laneLabel: 'pending QA review',
          targetDesk: 'qa-lead',
          targetRole: 'QA Lead',
          summary: 'QA review pending',
        },
        {
          laneId: 'archival',
          laneLabel: 'pending archival',
          targetDesk: 'archivist',
          targetRole: 'Archivist',
          summary: 'Archive planner output and provenance',
        },
        {
          laneId: 'execution',
          laneLabel: 'pending execution planning',
          targetDesk: 'executor',
          targetRole: 'Executor',
          summary: 'Execution planning follow-up',
        },
        {
          laneId: 'cto',
          laneLabel: 'pending CTO review',
          targetDesk: 'cto',
          targetRole: 'CTO',
          summary: 'CTO review or override inspection',
        },
        {
          laneId: 'context',
          laneLabel: 'pending context writeback',
          targetDesk: 'context-manager',
          targetRole: 'Context Manager',
          summary: 'Writeback for follow-on desks',
        },
      ];
  const items = lanes.map((item, index) => {
    const laneItem = item && typeof item === 'object' ? item : {};
    return {
      laneId: String(laneItem.laneId || `lane_${index + 1}`).trim() || `lane_${index + 1}`,
      laneLabel: String(laneItem.laneLabel || laneItem.label || laneItem.summary || 'Planner outtray lane').trim() || 'Planner outtray lane',
      targetDesk: String(laneItem.targetDesk || 'planner').trim() || 'planner',
      targetRole: String(laneItem.targetRole || 'Planner').trim() || 'Planner',
      summary: String(laneItem.summary || laneItem.reason || laneItem.laneLabel || 'Planner handoff lane').trim() || 'Planner handoff lane',
      status: laneItem.status && ['drafting', 'ready_for_handoff', 'deposited', 'collected', 'under_review', 'accepted', 'returned_with_findings', 'closed'].includes(String(laneItem.status).trim().toLowerCase())
        ? String(laneItem.status).trim().toLowerCase()
        : 'ready_for_handoff',
      required: Boolean(laneItem.required !== false),
      collectedAt: String(laneItem.collectedAt || '').trim() || null,
      collectedBy: String(laneItem.collectedBy || '').trim() || null,
      reviewedAt: String(laneItem.reviewedAt || '').trim() || null,
      reviewedBy: String(laneItem.reviewedBy || '').trim() || null,
      findings: Array.isArray(laneItem.findings) ? laneItem.findings.map((finding) => String(finding || '').trim()).filter(Boolean) : [],
      notes: uniqueStrings(laneItem.notes || []),
      artifactRefs: uniqueStrings([
        ...(Array.isArray(laneItem.artifactRefs) ? laneItem.artifactRefs : []),
        ...artifactRefs,
      ]),
      provenance: {
        ...(laneItem.provenance && typeof laneItem.provenance === 'object' ? laneItem.provenance : {}),
        sourceHandoffId: handoff?.id || laneItem.provenance?.sourceHandoffId || null,
        sourceIntentId: intentId,
        sourceType: handoff?.sourceType || laneItem.provenance?.sourceType || null,
        sourceRef: handoff?.sourceRef || laneItem.provenance?.sourceRef || null,
        anchorRefs: uniqueStrings([
          ...(Array.isArray(laneItem.provenance?.anchorRefs) ? laneItem.provenance.anchorRefs : []),
          ...(Array.isArray(handoff?.anchorRefs) ? handoff.anchorRefs : []),
        ]),
        overrideIds: uniqueStrings(laneItem.provenance?.overrideIds || []),
      },
      queuedAt: baseCreatedAt,
      updatedAt: String(laneItem.updatedAt || '').trim() || baseCreatedAt,
    };
  });
  const queueKey = String(
    safePayload.queueKey
    || safeOptions.runId
    || planBundle?.planId
    || taskBundle?.taskBundleId
    || handoff?.id
    || `planner_outtray_${intentId || baseCreatedAt}`,
  ).trim();
  return {
    queueKey,
    plannerRunId: String(safePayload.plannerRunId || safeOptions.runId || '').trim() || null,
    planBundleId: String(safePayload.planBundleId || planBundle?.planId || '').trim() || null,
    taskBundleId: String(safePayload.taskBundleId || taskBundle?.taskBundleId || '').trim() || null,
    intentId,
    status: String(safePayload.status || 'deposited').trim().toLowerCase() || 'deposited',
    handoffState: String(safePayload.handoffState || 'deposited').trim().toLowerCase() || 'deposited',
    summary: String(safePayload.summary || planBundle?.summary || taskBundle?.summary || handoff?.summary || 'Planner handoff deposited for downstream collection.').trim(),
    targetDesk: String(safePayload.targetDesk || 'planner-outtray').trim() || 'planner-outtray',
    targetRole: String(safePayload.targetRole || 'Planner Outtray').trim() || 'Planner Outtray',
    requestedBy: baseCreatedBy,
    createdBy: baseCreatedBy,
    createdAt: baseCreatedAt,
    updatedAt: String(safePayload.updatedAt || '').trim() || baseCreatedAt,
    artifactRefs,
    provenance: {
      ...(safePayload.provenance && typeof safePayload.provenance === 'object' ? safePayload.provenance : {}),
      sourceHandoffId: handoff?.id || safePayload.provenance?.sourceHandoffId || null,
      sourceIntentId: intentId,
      sourceType: handoff?.sourceType || safePayload.provenance?.sourceType || null,
      sourceRef: handoff?.sourceRef || safePayload.provenance?.sourceRef || null,
      anchorRefs: uniqueStrings([
        ...(Array.isArray(safePayload.provenance?.anchorRefs) ? safePayload.provenance.anchorRefs : []),
        ...(Array.isArray(handoff?.anchorRefs) ? handoff.anchorRefs : []),
      ]),
      overrideIds: uniqueStrings(safePayload.provenance?.overrideIds || []),
    },
    items,
  };
}

function buildPlannerArtifactContract(payload = {}, handoff = null, overrideLayer = null, options = {}) {
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  const safeOptions = options && typeof options === 'object' ? options : {};
  const qaState = normalizePlannerQaState(safePayload, 'pending');
  const contextLanes = safePayload.contextLanes || handoff?.contextLanes || null;
  const resolvedOverrideLayer = safePayload.overrideLayer || handoff?.overrideLayer || overrideLayer || null;
  const talentAcquisition = safeOptions.talentAcquisition || null;
  const workspace = safeOptions.workspace || null;
  const planningMode = String(
    safePayload.planningMode
    || safePayload.planBundle?.planningMode
    || resolvedOverrideLayer?.planningMode
    || (resolvedOverrideLayer?.flags?.forcePlanning || resolvedOverrideLayer?.flags?.forcePlannerRouting || resolvedOverrideLayer?.flags?.reopenStalePlan
      ? 'forced'
      : (resolvedOverrideLayer?.activeCount ? 'override' : 'normal')),
  ).trim() || 'normal';
  const intentId = String(
    safePayload.intentId
    || safePayload.planBundle?.intentId
    || safePayload.taskBundle?.intentId
    || handoff?.intentContract?.intentId
    || handoff?.intentId
    || '',
  ).trim() || null;
  const baseCreatedBy = String(safePayload.createdBy || handoff?.requestedBy || 'planner').trim() || 'planner';
  const baseCreatedAt = String(safePayload.createdAt || handoff?.createdAt || nowIso()).trim() || nowIso();
  const rawPlanItems = Array.isArray(safePayload.planBundle?.items)
    ? safePayload.planBundle.items
    : (Array.isArray(safePayload.planItems)
      ? safePayload.planItems
      : (Array.isArray(safePayload.cards) ? safePayload.cards : []));
  const planItems = rawPlanItems
    .map((item, index) => normalizePlannerPlanItem(item, handoff, index, intentId, resolvedOverrideLayer))
    .filter(Boolean)
    .slice(0, MAX_PLANNER_CARDS);
  const rawTaskItems = Array.isArray(safePayload.taskBundle?.tasks)
    ? safePayload.taskBundle.tasks
    : (Array.isArray(safePayload.tasks) ? safePayload.tasks : planItems);
  const tasks = rawTaskItems
    .map((item, index) => normalizePlannerTaskItem(item, handoff, index, intentId, resolvedOverrideLayer))
    .filter(Boolean)
    .slice(0, MAX_PLANNER_CARDS);
  const dependencyMap = safePayload.dependencyMap && typeof safePayload.dependencyMap === 'object'
    ? {
        dependencyMapId: String(safePayload.dependencyMap.dependencyMapId || `dependency_map_${intentId || handoff?.id || 'planner'}`).trim(),
        intentId: String(safePayload.dependencyMap.intentId || intentId || '').trim() || null,
        status: normalizePlannerOutputStatus(safePayload.dependencyMap.status || 'ready', 'ready'),
        edges: Array.isArray(safePayload.dependencyMap.edges)
          ? safePayload.dependencyMap.edges.map((edge) => ({
              dependencyId: String(edge?.dependencyId || edge?.id || `${edge?.sourcePlanId || 'plan'}__depends_on__${edge?.targetPlanId || 'plan'}`).trim(),
              sourcePlanId: String(edge?.sourcePlanId || '').trim() || null,
              targetPlanId: String(edge?.targetPlanId || '').trim() || null,
              type: String(edge?.type || 'depends_on').trim() || 'depends_on',
              status: normalizePlannerOutputStatus(edge?.status || 'active', 'active'),
              provenance: {
                ...((edge?.provenance && typeof edge.provenance === 'object') ? edge.provenance : {}),
                sourceHandoffId: handoff?.id || edge?.provenance?.sourceHandoffId || null,
                sourceIntentId: intentId,
                sourceType: handoff?.sourceType || edge?.provenance?.sourceType || null,
                sourceRef: handoff?.sourceRef || edge?.provenance?.sourceRef || null,
              },
              createdBy: String(edge?.createdBy || baseCreatedBy).trim() || baseCreatedBy,
              createdAt: String(edge?.createdAt || baseCreatedAt).trim() || baseCreatedAt,
            }))
          : [],
      }
    : buildPlannerDependencyMap(planItems, handoff, intentId, baseCreatedBy, baseCreatedAt);
  const planBundle = {
    planId: String(safePayload.planBundle?.planId || `plan_bundle_${intentId || handoff?.id || 'planner'}`).trim(),
    intentId,
    status: normalizePlannerOutputStatus(safePayload.planBundle?.status || (planItems.length ? 'ready' : 'empty'), 'ready'),
    summary: String(safePayload.planBundle?.summary || safePayload.summary || handoff?.summary || '').trim(),
    items: planItems,
    qaStatus: qaState.qaStatus,
    qaCoverageRequired: qaState.qaCoverageRequired,
    qaBlocker: qaState.qaBlocker,
    releaseBlocker: qaState.releaseBlocker,
    contextLanes,
    overrideLayer: resolvedOverrideLayer,
    planningMode,
    provenance: {
      ...(safePayload.planBundle?.provenance && typeof safePayload.planBundle.provenance === 'object' ? safePayload.planBundle.provenance : {}),
      sourceHandoffId: handoff?.id || safePayload.planBundle?.provenance?.sourceHandoffId || null,
      sourceIntentId: intentId,
      sourceType: handoff?.sourceType || safePayload.planBundle?.provenance?.sourceType || null,
      sourceRef: handoff?.sourceRef || safePayload.planBundle?.provenance?.sourceRef || null,
      anchorRefs: uniqueStrings([
        ...(Array.isArray(safePayload.planBundle?.provenance?.anchorRefs) ? safePayload.planBundle.provenance.anchorRefs : []),
        ...(Array.isArray(handoff?.anchorRefs) ? handoff.anchorRefs : []),
      ]),
    },
    createdBy: String(safePayload.planBundle?.createdBy || baseCreatedBy).trim() || baseCreatedBy,
    createdAt: String(safePayload.planBundle?.createdAt || baseCreatedAt).trim() || baseCreatedAt,
  };
  const taskBundle = {
    taskBundleId: String(safePayload.taskBundle?.taskBundleId || `task_bundle_${intentId || handoff?.id || 'planner'}`).trim(),
    intentId,
    status: normalizePlannerOutputStatus(safePayload.taskBundle?.status || (tasks.length ? 'ready' : 'empty'), 'ready'),
    tasks,
    qaStatus: qaState.qaStatus,
    qaCoverageRequired: qaState.qaCoverageRequired,
    qaBlocker: qaState.qaBlocker,
    releaseBlocker: qaState.releaseBlocker,
    contextLanes,
    overrideLayer: resolvedOverrideLayer,
    planningMode,
    provenance: {
      ...(safePayload.taskBundle?.provenance && typeof safePayload.taskBundle.provenance === 'object' ? safePayload.taskBundle.provenance : {}),
      sourceHandoffId: handoff?.id || safePayload.taskBundle?.provenance?.sourceHandoffId || null,
      sourceIntentId: intentId,
      sourceType: handoff?.sourceType || safePayload.taskBundle?.provenance?.sourceType || null,
      sourceRef: handoff?.sourceRef || safePayload.taskBundle?.provenance?.sourceRef || null,
    },
    createdBy: String(safePayload.taskBundle?.createdBy || baseCreatedBy).trim() || baseCreatedBy,
    createdAt: String(safePayload.taskBundle?.createdAt || baseCreatedAt).trim() || baseCreatedAt,
  };
  const staffingRequest = {
    staffingRequestId: String(safePayload.staffingRequest?.staffingRequestId || `staffing_${intentId || handoff?.id || 'planner'}`).trim(),
    intentId,
    status: normalizePlannerOutputStatus(safePayload.staffingRequest?.status || 'ready', 'ready'),
    summary: String(safePayload.staffingRequest?.summary || 'Planner staffing request').trim(),
    targetDesk: String(safePayload.staffingRequest?.targetDesk || 'qa-lead').trim() || 'qa-lead',
    targetRole: String(safePayload.staffingRequest?.targetRole || 'QA Lead').trim() || 'QA Lead',
    requiredCoverage: uniqueStrings(safePayload.staffingRequest?.requiredCoverage || safePayload.staffingRequest?.requiredSkills || []),
    provenance: {
      ...(safePayload.staffingRequest?.provenance && typeof safePayload.staffingRequest.provenance === 'object' ? safePayload.staffingRequest.provenance : {}),
      sourceHandoffId: handoff?.id || safePayload.staffingRequest?.provenance?.sourceHandoffId || null,
      sourceIntentId: intentId,
      sourceType: handoff?.sourceType || safePayload.staffingRequest?.provenance?.sourceType || null,
      sourceRef: handoff?.sourceRef || safePayload.staffingRequest?.provenance?.sourceRef || null,
    },
    createdBy: String(safePayload.staffingRequest?.createdBy || baseCreatedBy).trim() || baseCreatedBy,
    createdAt: String(safePayload.staffingRequest?.createdAt || baseCreatedAt).trim() || baseCreatedAt,
    overrideLayer: resolvedOverrideLayer,
    planningMode,
  };
  const qaRequest = {
    qaRequestId: String(safePayload.qaRequest?.qaRequestId || `qa_${intentId || handoff?.id || 'planner'}`).trim(),
    intentId,
    status: normalizePlannerOutputStatus(safePayload.qaRequest?.status || 'ready', 'ready'),
    summary: String(safePayload.qaRequest?.summary || 'Planner QA request').trim(),
    acceptanceCriteria: uniqueStrings(safePayload.qaRequest?.acceptanceCriteria || []),
    targetDesk: String(safePayload.qaRequest?.targetDesk || 'qa-lead').trim() || 'qa-lead',
    targetRole: String(safePayload.qaRequest?.targetRole || 'QA Lead').trim() || 'QA Lead',
    provenance: {
      ...(safePayload.qaRequest?.provenance && typeof safePayload.qaRequest.provenance === 'object' ? safePayload.qaRequest.provenance : {}),
      sourceHandoffId: handoff?.id || safePayload.qaRequest?.provenance?.sourceHandoffId || null,
      sourceIntentId: intentId,
      sourceType: handoff?.sourceType || safePayload.qaRequest?.provenance?.sourceType || null,
      sourceRef: handoff?.sourceRef || safePayload.qaRequest?.provenance?.sourceRef || null,
    },
    createdBy: String(safePayload.qaRequest?.createdBy || baseCreatedBy).trim() || baseCreatedBy,
    createdAt: String(safePayload.qaRequest?.createdAt || baseCreatedAt).trim() || baseCreatedAt,
    overrideLayer: resolvedOverrideLayer,
    planningMode,
  };
  const hireRequest = buildPlannerHireRequest({
    payload: safePayload,
    handoff,
    intentId,
    planItems,
    staffingRequest,
    talentAcquisition,
    workspace,
    baseCreatedBy,
    baseCreatedAt,
    overrideLayer: resolvedOverrideLayer,
    planningMode,
  });
  const outtray = buildPlannerOuttrayArtifact(
    safePayload.outtray || {},
    handoff,
    planBundle,
    taskBundle,
    {
      runId: safeOptions.runId || handoff?.id || null,
      proposalArtifactRefs: safeOptions.proposalArtifactRefs || [],
    },
  );
  const archivalSummary = {
    archivalSummaryId: String(safePayload.archivalSummary?.archivalSummaryId || `archive_${intentId || handoff?.id || 'planner'}`).trim(),
    intentId,
    status: normalizePlannerOutputStatus(safePayload.archivalSummary?.status || 'ready', 'ready'),
    summary: String(safePayload.archivalSummary?.summary || safePayload.summary || handoff?.summary || '').trim(),
    contextLanes,
    overrideLayer: resolvedOverrideLayer,
    planningMode,
    provenance: {
      ...(safePayload.archivalSummary?.provenance && typeof safePayload.archivalSummary.provenance === 'object' ? safePayload.archivalSummary.provenance : {}),
      sourceHandoffId: handoff?.id || safePayload.archivalSummary?.provenance?.sourceHandoffId || null,
      sourceIntentId: intentId,
      sourceType: handoff?.sourceType || safePayload.archivalSummary?.provenance?.sourceType || null,
      sourceRef: handoff?.sourceRef || safePayload.archivalSummary?.provenance?.sourceRef || null,
      planIds: planItems.map((item) => item.planId),
      taskIds: tasks.map((item) => item.taskId),
    },
    createdBy: String(safePayload.archivalSummary?.createdBy || baseCreatedBy).trim() || baseCreatedBy,
    createdAt: String(safePayload.archivalSummary?.createdAt || baseCreatedAt).trim() || baseCreatedAt,
  };
  const contextUpdatePacket = {
    contextUpdatePacketId: String(safePayload.contextUpdatePacket?.contextUpdatePacketId || `context_${intentId || handoff?.id || 'planner'}`).trim(),
    intentId,
    status: normalizePlannerOutputStatus(safePayload.contextUpdatePacket?.status || 'ready', 'ready'),
    summary: String(safePayload.contextUpdatePacket?.summary || safePayload.summary || handoff?.summary || '').trim(),
    requestedOutcomes: uniqueStrings(safePayload.contextUpdatePacket?.requestedOutcomes || handoff?.requestedOutcomes || []),
    constraints: uniqueStrings(safePayload.contextUpdatePacket?.constraints || handoff?.constraints || []),
    contextLanes,
    overrideLayer: resolvedOverrideLayer,
    planningMode,
    provenance: {
      ...(safePayload.contextUpdatePacket?.provenance && typeof safePayload.contextUpdatePacket.provenance === 'object' ? safePayload.contextUpdatePacket.provenance : {}),
      sourceHandoffId: handoff?.id || safePayload.contextUpdatePacket?.provenance?.sourceHandoffId || null,
      sourceIntentId: intentId,
      sourceType: handoff?.sourceType || safePayload.contextUpdatePacket?.provenance?.sourceType || null,
      sourceRef: handoff?.sourceRef || safePayload.contextUpdatePacket?.provenance?.sourceRef || null,
      anchorRefs: uniqueStrings([
        ...(Array.isArray(safePayload.contextUpdatePacket?.provenance?.anchorRefs) ? safePayload.contextUpdatePacket.provenance.anchorRefs : []),
        ...(Array.isArray(handoff?.anchorRefs) ? handoff.anchorRefs : []),
      ]),
    },
    createdBy: String(safePayload.contextUpdatePacket?.createdBy || baseCreatedBy).trim() || baseCreatedBy,
    createdAt: String(safePayload.contextUpdatePacket?.createdAt || baseCreatedAt).trim() || baseCreatedAt,
  };
  const cards = (Array.isArray(safePayload.cards) ? safePayload.cards : [])
    .map((card, index) => normalizePlannerCard(card, handoff, planItems[index] || null))
    .filter(Boolean)
    .slice(0, MAX_PLANNER_CARDS);
  return {
    summary: String(safePayload.summary || handoff?.summary || planBundle.summary || 'Planner review complete.').trim(),
    contextLanes,
    overrideLayer: resolvedOverrideLayer,
    planningMode,
    qaStatus: qaState.qaStatus,
    qaCoverageRequired: qaState.qaCoverageRequired,
    qaBlocker: qaState.qaBlocker,
    releaseBlocker: qaState.releaseBlocker,
    planBundle,
    taskBundle,
    dependencyMap,
    staffingRequest,
    qaRequest,
    hireRequest,
    outtray,
    archivalSummary,
    contextUpdatePacket,
    cards: cards.length ? cards : planItems.map((item) => ({
      title: item.summary,
      summary: item.summary,
      anchorRefs: uniqueStrings(item.provenance?.anchorRefs || handoff?.anchorRefs || []),
      targetProjectKey: 'ace-self',
    })),
    planItems,
    tasks,
    dependencyEdges: dependencyMap.edges,
    brainProposals: (Array.isArray(safePayload.brainProposals) ? safePayload.brainProposals : [])
      .map((proposal) => normalizeBrainProposal(proposal))
      .filter(Boolean)
      .slice(0, 2),
    needsContextRetry: Boolean(safePayload.needsContextRetry),
    retryReason: String(safePayload.retryReason || '').trim(),
  };
}

function normalizePlannerPayload(payload, handoff, overrideLayer = null, options = {}) {
  return buildPlannerArtifactContract(payload, handoff, overrideLayer, options);
}

function classifyAgentCognitionFailureReason(reason = '', { promptChars = 0, contextMode = 'scoped', overscopedThreshold = PLANNER_OVERSCOPED_PROMPT_CHARS } = {}) {
  const message = String(reason || '').trim().toLowerCase();
  if (!message) return null;
  if (message.includes('timed out') || message.includes('timeout')) {
    if (promptChars >= overscopedThreshold || contextMode === 'broad' || contextMode === 'full') {
      return 'overscoped_context';
    }
    return 'timeout';
  }
  if (message.includes('econnrefused') || message.includes('fetch failed') || message.includes('no fetch implementation') || message.includes('ollama unavailable') || message.includes('http 404') || message.includes('http 500') || message.includes('connection refused')) {
    return 'model_unavailable';
  }
  if (message.includes('not valid json') || message.includes('empty response')) {
    return 'bad_prompt_shape';
  }
  return 'unknown';
}

function buildPlannerCognitionDiagnostics({
  model = DEFAULT_PLANNER_MODEL,
  timeoutMs = DEFAULT_PLANNER_TIMEOUT_MS,
  promptProfile = null,
  usedLiveCall = false,
  usedFallback = false,
  reason = '',
}) {
  return {
    agent_id: 'planner',
    intended_model: model || null,
    actual_model: model || null,
    timeout_ms: Number(timeoutMs || DEFAULT_PLANNER_TIMEOUT_MS),
    prompt_chars: Number(promptProfile?.promptChars || 0),
    context_mode: promptProfile?.contextMode || 'scoped',
    used_live_call: Boolean(usedLiveCall),
    used_fallback: Boolean(usedFallback),
    failure_reason: usedFallback
      ? classifyAgentCognitionFailureReason(reason, {
        promptChars: Number(promptProfile?.promptChars || 0),
        contextMode: promptProfile?.contextMode || 'scoped',
      })
      : null,
    included_sections: Array.isArray(promptProfile?.includedSections) ? promptProfile.includedSections : [],
    broader_context_available: Boolean(promptProfile?.broaderContextAvailable),
    repair_applied: promptProfile?.repairApplied || {
      timeout_changed: false,
      prompt_scope_changed: true,
      retrieval_shifted: true,
      notes: 'Planner now defaults to scoped prompt construction.',
    },
  };
}

function runMatchesHandoff(run, handoff = null) {
  if (!run || !handoff) return false;
  if (run.handoffId !== handoff.id) return false;
  if (!run.handoffCreatedAt || !handoff.createdAt) return true;
  return run.handoffCreatedAt === handoff.createdAt;
}

function buildPlannerToContextHandoff({ handoff, action, reason, runId, attemptCount }) {
  const intentContract = handoff?.intentContract || null;
  return {
    id: `handoff_${runId}`,
    sourceAgentId: 'planner',
    targetAgentId: 'context-manager',
    sourceHandoffId: handoff?.id || null,
    sourceNodeId: handoff?.sourceNodeId || null,
    sourceIntentId: intentContract?.intentId || handoff?.intentId || null,
    createdAt: nowIso(),
    status: 'needs-context',
    action,
    summary: action === 'bin-candidate'
      ? 'Planner recommends binning this handoff until the source context changes.'
      : 'Planner needs Context Manager to retry the handoff.',
    detail: reason,
    retryReason: reason,
    attemptCount,
    anchorRefs: uniqueStrings(handoff?.anchorRefs || []).map(normalizeRelativePath),
    intentContract,
  };
}

function writeProposalArtifacts(rootPath, runId, proposals = []) {
  const dir = ensurePlannerRunsStorage(rootPath);
  return proposals.map((proposal, index) => {
    const ext = path.extname(proposal.targetPath) || '.md';
    const fileName = `${runId}.proposal.${String(index + 1).padStart(2, '0')}.${slugify(proposal.targetPath)}${ext}`;
    const fullPath = path.join(dir, fileName);
    fs.writeFileSync(fullPath, `${proposal.content.replace(/\s+$/, '')}\n`, 'utf8');
    return relativeToRoot(rootPath, fullPath);
  });
}

function createPlannerRunRecord({
  runId,
  handoff,
  mode,
  backend,
  model,
  outcome,
  summary,
  reason = '',
  planBundle = null,
  taskBundle = null,
  contextLanes = null,
  dependencyMap = null,
  staffingRequest = null,
  qaRequest = null,
  hireRequest = null,
  hireRequestQueue = null,
  outtray = null,
  archivalSummary = null,
  contextUpdatePacket = null,
  overrideLayer = null,
  planningMode = 'normal',
  qaQueue = null,
  cards = [],
  brainProposals = [],
  proposalArtifactRefs = [],
  plannerToContext = null,
  taskCache = null,
  rawResponse = '',
  cognitionDiagnostics = null,
  llmTrace = null,
  startedAt = nowIso(),
  completedAt = nowIso(),
}) {
  const attribution = resolveStageAgentIdentity('planner');
  return {
    id: runId,
    workerId: 'planner',
    agent_id: attribution.agent_id,
    agent_version: attribution.agent_version,
    attribution,
    createdAt: startedAt,
    startedAt,
    completedAt,
    durationMs: durationMsFrom(startedAt, completedAt),
    mode,
    backend,
    model,
    handoffId: handoff?.id || null,
    handoffCreatedAt: handoff?.createdAt || null,
    sourceNodeId: handoff?.sourceNodeId || null,
    intentId: handoff?.intentContract?.intentId || handoff?.intentId || null,
    intentContract: handoff?.intentContract || null,
    canonicalIntent: handoff?.intentContract?.canonicalIntent || null,
    planBundle,
    taskBundle,
    contextLanes,
    overrideLayer,
    planningMode,
    qaStatus: planBundle?.qaStatus || taskBundle?.qaStatus || 'pending',
    qaCoverageRequired: planBundle?.qaCoverageRequired !== false && taskBundle?.qaCoverageRequired !== false,
    qaBlocker: Boolean(planBundle?.qaBlocker || taskBundle?.qaBlocker),
    releaseBlocker: Boolean(planBundle?.releaseBlocker || taskBundle?.releaseBlocker),
    dependencyMap,
    staffingRequest,
    qaRequest,
    hireRequest,
    hireRequestQueue,
    outtray,
    qaQueue,
    archivalSummary,
    contextUpdatePacket,
    outcome,
    status: outcome,
    summary: String(summary || '').trim() || String(handoff?.summary || 'Planner worker finished.').trim(),
    reason: String(reason || '').trim() || null,
    llmStatus: cognitionDiagnostics?.used_fallback
      ? classifyLlmFailure(reason, true)
      : (cognitionDiagnostics?.used_live_call ? 'live' : (outcome === 'completed' ? 'live' : classifyLlmFailure(reason, false))),
    cards,
    brainProposals,
    proposalArtifactRefs,
    plannerToContext,
    taskCache: taskCache ? summarizeTaskCache(taskCache) : null,
    rawResponse: rawResponse || null,
    cognitionDiagnostics,
    llmTrace: llmTrace && Array.isArray(llmTrace.steps) ? llmTrace : null,
  };
}

function persistPlannerRun(rootPath, runRecord) {
  ensurePlannerRunsStorage(rootPath);
  writeJson(plannerRunFilePath(rootPath, runRecord.id), runRecord);
  try {
    const taskDir = runRecord?.taskCache?.taskDir ? path.resolve(rootPath, runRecord.taskCache.taskDir) : null;
    writeAgentAuditArtifacts(rootPath, buildAgentAuditRecord({
      rootPath,
      stage: 'planner',
      taskId: runRecord?.taskCache?.taskId || null,
      taskDir,
      taskCache: runRecord?.taskCache || null,
      sourceRecord: runRecord,
      outcome: runRecord?.outcome || runRecord?.status || null,
      pass_fail: runRecord?.outcome === 'completed' ? 'pass' : 'fail',
      artifactRefs: [
        path.join('data', 'spatial', 'agent-runs', 'planner', `${runRecord.id}.json`),
        ...(Array.isArray(runRecord?.proposalArtifactRefs) ? runRecord.proposalArtifactRefs : []),
      ],
    }));
  } catch (error) {
    console.warn('[WARN] planner audit write failed:', error?.message || error);
  }
  return runRecord;
}

function evaluatePlannerEligibility({ workspace = {}, handoff = null, mode = 'auto', runs = [], overrideLayer = null } = {}) {
  const workerState = normalizeAgentWorkersState(workspace?.studio?.agentWorkers).planner;
  const resolvedOverrideLayer = overrideLayer || deriveCtoOverrideLayer(workspace?.studio?.ctoOverrides || createDefaultCtoOverrideLedger());
  if (!handoff) {
    return { eligible: false, reason: 'No planner handoff is available.' };
  }
  if (workerState.status === 'running' || workerState.currentRunId) {
    return { eligible: false, reason: 'Planner worker is already running.' };
  }
  if (mode !== 'auto') {
    return { eligible: true, reason: '' };
  }
  const overrideAllowsStale = Boolean(
    resolvedOverrideLayer?.flags?.forcePlanningGeneration
    || resolvedOverrideLayer?.flags?.forcePlannerRouting
    || resolvedOverrideLayer?.flags?.reopenStalePlan,
  );
  if (handoff.status !== 'ready' && !overrideAllowsStale) {
    return { eligible: false, reason: 'Planner handoff is not ready for auto-run.' };
  }
  if ((!Array.isArray(handoff.anchorRefs) || !handoff.anchorRefs.length) && !resolvedOverrideLayer?.flags?.forcePlannerRouting) {
    return { eligible: false, reason: 'Planner handoff has no anchor provenance.' };
  }
  if ((runs || []).some((run) => runMatchesHandoff(run, handoff) && run.outcome === 'completed') && !resolvedOverrideLayer?.flags?.reopenStalePlan) {
    return { eligible: false, reason: 'Planner already processed this handoff successfully.' };
  }
  if ((runs || []).some((run) => runMatchesHandoff(run, handoff) && ['blocked', 'degraded'].includes(run.outcome) && run.plannerToContext?.action === 'bin-candidate')) {
    return { eligible: false, reason: 'Planner retries are binned for this handoff until the source changes.' };
  }
  return { eligible: true, reason: '' };
}

async function runPlannerWorker(options = {}) {
  const {
    rootPath,
    handoff = null,
    workspace = {},
    anchorBundle = null,
    mode = 'auto',
    backend = null,
    model = null,
    host = null,
    timeoutMs = null,
    runId = makePlannerRunId(),
    generator = null,
    fetchImpl = globalThis.fetch,
    talentAcquisition = null,
    promptScope = null,
  } = options;

  if (!rootPath) throw new Error('rootPath is required for planner worker runs.');
  const definition = resolveWorkerDefinition(rootPath, 'planner');
  const config = definition.config;
  const resolvedBackend = backend || config.backend;
  const resolvedModel = model || config.model;
  const resolvedHost = host || config.host || DEFAULT_OLLAMA_HOST;
  const resolvedTimeoutMs = Number(timeoutMs || config.timeoutMs || DEFAULT_PLANNER_TIMEOUT_MS);
  const runs = listPlannerRuns(rootPath);
  const selectedCard = Array.isArray(workspace?.studio?.teamBoard?.cards)
    ? workspace.studio.teamBoard.cards.find((card) => card?.id === workspace?.studio?.teamBoard?.selectedCardId) || null
    : null;
  const taskId = String(
    handoff?.taskId
    || handoff?.runnerTaskId
    || selectedCard?.runnerTaskId
    || selectedCard?.builderTaskId
    || selectedCard?.executionPackage?.taskId
    || '',
  ).trim() || null;
  const taskCache = readTaskCache(rootPath, { taskId, stage: 'planner' });
  const overrideLayer = deriveCtoOverrideLayer(workspace?.studio?.ctoOverrides || createDefaultCtoOverrideLedger());
  const planningMode = String(overrideLayer?.planningMode || (overrideLayer?.flags?.forcePlanning ? 'forced' : (overrideLayer?.activeCount ? 'override' : 'normal'))).trim() || 'normal';
  const eligibility = evaluatePlannerEligibility({ workspace, handoff, mode, runs, overrideLayer });
  if (!eligibility.eligible) {
    return {
      ok: false,
      skipped: true,
      outcome: 'skipped',
      reason: eligibility.reason,
      run: null,
      proposalArtifactRefs: [],
      cards: [],
      plannerToContext: null,
      taskCacheSource: taskCache.source,
      overrideLayer,
      planningMode,
    };
  }

  const blockedAttempt = (runs || []).filter((run) => runMatchesHandoff(run, handoff) && ['blocked', 'degraded'].includes(run.outcome)).length + 1;
  const blockedAction = blockedAttempt >= 2 ? 'bin-candidate' : 'retry-handoff';
  const startedAt = nowIso();
  const llmTrace = {
    runId,
    steps: [],
  };
  let plannerPromptProfile = null;

  const createBlockedResult = (reason, outcome = 'blocked', rawResponse = '', { usedLiveCall = false, usedFallback = false } = {}) => {
    const completedAt = nowIso();
    const plannerToContext = buildPlannerToContextHandoff({
      handoff,
      action: blockedAction,
      reason,
      runId,
      attemptCount: blockedAttempt,
    });
    const cognitionDiagnostics = plannerPromptProfile
      ? buildPlannerCognitionDiagnostics({
        model: resolvedModel,
        timeoutMs: resolvedTimeoutMs,
        promptProfile: plannerPromptProfile,
        usedLiveCall,
        usedFallback,
        reason,
      })
      : null;
    const runRecord = persistPlannerRun(rootPath, createPlannerRunRecord({
      runId,
      handoff,
      mode,
      backend: resolvedBackend,
      model: resolvedModel,
      outcome,
      summary: handoff?.summary || 'Planner worker blocked.',
      reason,
      planBundle: null,
      taskBundle: null,
      contextLanes: handoff?.contextLanes || null,
      overrideLayer,
      planningMode,
      qaStatus: 'pending',
      qaCoverageRequired: true,
      qaBlocker: false,
      releaseBlocker: false,
      dependencyMap: null,
      staffingRequest: null,
      qaRequest: null,
      hireRequest: null,
      hireRequestQueue: null,
      qaQueue: null,
      archivalSummary: null,
      contextUpdatePacket: null,
      cards: [],
      brainProposals: [],
      proposalArtifactRefs: [],
      plannerToContext,
      taskCache,
      rawResponse,
      cognitionDiagnostics,
      llmTrace,
      startedAt,
      completedAt,
    }));
    return {
      ok: false,
      skipped: false,
      outcome,
      reason,
      run: runRecord,
      proposalArtifactRefs: [],
      cards: [],
      planBundle: null,
      taskBundle: null,
      contextLanes: handoff?.contextLanes || null,
      qaStatus: 'pending',
      qaCoverageRequired: true,
      qaBlocker: false,
      releaseBlocker: false,
      dependencyMap: null,
      staffingRequest: null,
      qaRequest: null,
      hireRequest: null,
      hireRequestQueue: null,
      qaQueue: null,
      archivalSummary: null,
      contextUpdatePacket: null,
      plannerToContext,
      taskCacheSource: taskCache.source,
      overrideLayer,
      planningMode,
      cognitionDiagnostics,
    };
  };

  if (!handoff) return createBlockedResult('Planner handoff is missing.');
  if (handoff.status !== 'ready') return createBlockedResult('Planner handoff is not ready and must be clarified before planning.');
  if (!Array.isArray(handoff.anchorRefs) || !handoff.anchorRefs.length) return createBlockedResult('Planner handoff has no anchor provenance.');
  const requestedOutcomes = Array.isArray(handoff.requestedOutcomes)
    ? handoff.requestedOutcomes.filter(Boolean)
    : (Array.isArray(handoff.tasks) ? handoff.tasks.filter(Boolean) : []);
  if (!requestedOutcomes.length) return createBlockedResult('Planner handoff has no concrete requested outcomes to decompose.');

  try {
    plannerPromptProfile = buildPlannerPromptProfile({
      promptTemplate: config.prompt,
      handoff,
      anchorBundle: anchorBundle || {},
      board: workspace?.studio?.teamBoard || { cards: [] },
      rootPath,
      taskCache,
      contextLanes: handoff?.contextLanes || null,
      overrideLayer,
      talentAcquisition,
      promptScope,
    });
    addTraceStep(llmTrace, 'llm_call_start', {
      model: resolvedModel,
      stage: 'planner',
      promptChars: plannerPromptProfile.promptChars,
      contextMode: plannerPromptProfile.contextMode,
      includedSections: plannerPromptProfile.includedSections,
      promptPreview: plannerPromptProfile.prompt.slice(0, 300),
    });
    const generated = generator
      ? await generator({
          handoff,
          workspace,
          anchorBundle,
          mode,
          backend: resolvedBackend,
          model: resolvedModel,
          host: resolvedHost,
          runId,
          definition,
          taskId,
          taskCache,
          overrideLayer,
          planningMode,
          talentAcquisition,
          promptProfile: plannerPromptProfile,
        })
      : await callOllamaGenerate({
          prompt: plannerPromptProfile.prompt,
          model: resolvedModel,
          host: resolvedHost,
          timeoutMs: resolvedTimeoutMs,
          fetchImpl,
        });
    const rawPayload = generated?.json ?? generated;
    const rawResponse = generated?.text || (typeof generated === 'string' ? generated : JSON.stringify(rawPayload));
    addTraceStep(llmTrace, 'llm_call_success', {
      model: resolvedModel,
      stage: 'planner',
      textPreview: String(rawResponse || '').slice(0, 300),
    });
    const payload = normalizePlannerPayload(rawPayload, handoff, overrideLayer, {
      talentAcquisition,
      workspace,
    });
    if (payload.needsContextRetry) {
      return createBlockedResult(
        payload.retryReason || 'Planner requested a tighter context packet before decomposing work.',
        'blocked',
        rawResponse,
        { usedLiveCall: !generator, usedFallback: false },
      );
    }
    if (!payload.planBundle.items.length && !payload.taskBundle.tasks.length && !payload.brainProposals.length) {
      return createBlockedResult(
        'Planner produced no structured plan, tasks, or review proposals for this handoff.',
        'blocked',
        rawResponse,
        { usedLiveCall: !generator, usedFallback: false },
      );
    }
    const proposalArtifactRefs = writeProposalArtifacts(rootPath, runId, payload.brainProposals);
    const completedAt = nowIso();
    const hireRequestQueue = payload.hireRequest
      ? upsertTaHireRequestQueueEntry(rootPath, {
          ...payload.hireRequest,
          plannerRunId: runId,
          intentId: payload.planBundle?.intentId || payload.taskBundle?.intentId || handoff?.intentContract?.intentId || handoff?.intentId || null,
          planBundleId: payload.planBundle?.planId || null,
          taskBundleId: payload.taskBundle?.taskBundleId || null,
          staffingRequestId: payload.staffingRequest?.staffingRequestId || null,
          qaRequestId: payload.qaRequest?.qaRequestId || null,
          provenance: {
            ...(payload.hireRequest.provenance && typeof payload.hireRequest.provenance === 'object' ? payload.hireRequest.provenance : {}),  
            sourceHandoffId: handoff?.id || payload.hireRequest?.provenance?.sourceHandoffId || null,
            sourceIntentId: payload.planBundle?.intentId || payload.taskBundle?.intentId || handoff?.intentContract?.intentId || handoff?.intentId || null,
            sourceType: handoff?.sourceType || payload.hireRequest?.provenance?.sourceType || null,
            sourceRef: handoff?.sourceRef || payload.hireRequest?.provenance?.sourceRef || null,
            anchorRefs: uniqueStrings([
              ...(Array.isArray(payload.hireRequest?.provenance?.anchorRefs) ? payload.hireRequest.provenance.anchorRefs : []),
              ...(Array.isArray(handoff?.anchorRefs) ? handoff.anchorRefs : []),
            ]),
          },
        })
      : null;
    const qaQueue = upsertPlannerQaQueueEntry(rootPath, {
      queueKey: payload.qaRequest?.qaRequestId || payload.planBundle?.planId || runId,
      plannerRunId: runId,
      planBundleId: payload.planBundle?.planId || null,
      qaRequestId: payload.qaRequest?.qaRequestId || null,
      intentId: payload.planBundle?.intentId || payload.taskBundle?.intentId || handoff?.intentContract?.intentId || handoff?.intentId || null,
      planIds: Array.isArray(payload.planBundle?.items) ? payload.planBundle.items.map((item) => item.planId).filter(Boolean) : [],
      taskIds: Array.isArray(payload.taskBundle?.tasks) ? payload.taskBundle.tasks.map((task) => task.taskId).filter(Boolean) : [],
      targetDesk: payload.qaRequest?.targetDesk || payload.staffingRequest?.targetDesk || 'qa-lead',
      targetRole: payload.qaRequest?.targetRole || payload.staffingRequest?.targetRole || 'QA Lead',
      requestedBy: payload.qaRequest?.createdBy || payload.staffingRequest?.createdBy || 'planner',
      summary: payload.qaRequest?.summary || 'Planner QA request',
      qaStatus: payload.qaStatus || 'pending',
      qaCoverageRequired: payload.qaCoverageRequired !== false,
      qaBlocker: false,
      releaseBlocker: false,
      provenance: {
        sourceHandoffId: handoff?.id || null,
        sourceIntentId: handoff?.intentContract?.intentId || handoff?.intentId || null,
        sourceType: handoff?.sourceType || null,
        sourceRef: handoff?.sourceRef || null,
        anchorRefs: uniqueStrings(handoff?.anchorRefs || []),
      },
      findings: [],
      status: 'pending',
    });
    const outtrayQueue = upsertPlannerOuttrayEntry(rootPath, {
      ...(payload.outtray && typeof payload.outtray === 'object' ? payload.outtray : {}),
      queueKey: payload.outtray?.queueKey || payload.planBundle?.planId || runId,
      plannerRunId: runId,
      planBundleId: payload.planBundle?.planId || null,
      taskBundleId: payload.taskBundle?.taskBundleId || null,
      intentId: payload.planBundle?.intentId || payload.taskBundle?.intentId || handoff?.intentContract?.intentId || handoff?.intentId || null,
      summary: payload.outtray?.summary || payload.archivalSummary?.summary || payload.summary || 'Planner handoff deposited for downstream collection.',
      provenance: {
        ...(payload.outtray?.provenance && typeof payload.outtray.provenance === 'object' ? payload.outtray.provenance : {}),
        sourceHandoffId: handoff?.id || payload.outtray?.provenance?.sourceHandoffId || null,
        sourceIntentId: payload.planBundle?.intentId || payload.taskBundle?.intentId || handoff?.intentContract?.intentId || handoff?.intentId || null,
        sourceType: handoff?.sourceType || payload.outtray?.provenance?.sourceType || null,
        sourceRef: handoff?.sourceRef || payload.outtray?.provenance?.sourceRef || null,
        anchorRefs: uniqueStrings([
          ...(Array.isArray(payload.outtray?.provenance?.anchorRefs) ? payload.outtray.provenance.anchorRefs : []),
          ...(Array.isArray(handoff?.anchorRefs) ? handoff.anchorRefs : []),
        ]),
      },
      artifactRefs: [
        ...proposalArtifactRefs,
        path.join('data', 'spatial', 'agent-runs', 'planner', `${runId}.json`).replace(/\\/g, '/'),
      ],
      items: Array.isArray(payload.outtray?.items) ? payload.outtray.items : undefined,
      status: payload.outtray?.status || 'deposited',
      handoffState: payload.outtray?.handoffState || 'deposited',
      createdBy: payload.outtray?.createdBy || 'planner',
      createdAt: payload.outtray?.createdAt || completedAt,
      updatedAt: completedAt,
    });
    const runRecord = persistPlannerRun(rootPath, createPlannerRunRecord({
      runId,
      handoff,
      mode,
      backend: resolvedBackend,
      model: resolvedModel,
      outcome: 'completed',
      summary: payload.summary,
      planBundle: payload.planBundle,
      taskBundle: payload.taskBundle,
      contextLanes: payload.contextLanes,
      overrideLayer: payload.overrideLayer || overrideLayer,
      planningMode: payload.planningMode || planningMode,
      dependencyMap: payload.dependencyMap,
      staffingRequest: payload.staffingRequest,
      qaRequest: payload.qaRequest,
      hireRequest: payload.hireRequest,
      hireRequestQueue: hireRequestQueue ? summarizeTaHireRequestQueue(hireRequestQueue.queue) : null,
      outtray: summarizePlannerOuttray(outtrayQueue.queue),
      qaQueue,
      archivalSummary: payload.archivalSummary,
      contextUpdatePacket: payload.contextUpdatePacket,
      cards: payload.cards,
      brainProposals: payload.brainProposals,
      proposalArtifactRefs,
      plannerToContext: null,
      taskCache,
      rawResponse,
      cognitionDiagnostics: buildPlannerCognitionDiagnostics({
        model: resolvedModel,
        timeoutMs: resolvedTimeoutMs,
        promptProfile: plannerPromptProfile,
        usedLiveCall: !generator,
        usedFallback: false,
      }),
      llmTrace,
      startedAt,
      completedAt,
    }));
    return {
      ok: true,
      skipped: false,
      outcome: 'completed',
      reason: '',
      run: runRecord,
      proposalArtifactRefs,
      cards: payload.cards,
      planBundle: payload.planBundle,
      taskBundle: payload.taskBundle,
      contextLanes: payload.contextLanes,
      overrideLayer: payload.overrideLayer || overrideLayer,
      planningMode: payload.planningMode || planningMode,
      qaStatus: payload.qaStatus,
      qaCoverageRequired: payload.qaCoverageRequired,
      qaBlocker: payload.qaBlocker,
      releaseBlocker: payload.releaseBlocker,
      dependencyMap: payload.dependencyMap,
      staffingRequest: payload.staffingRequest,
      qaRequest: payload.qaRequest,
      hireRequest: payload.hireRequest,
      hireRequestQueue: hireRequestQueue ? summarizeTaHireRequestQueue(hireRequestQueue.queue) : null,
      outtray: summarizePlannerOuttray(outtrayQueue.queue),
      qaQueue,
      archivalSummary: payload.archivalSummary,
      contextUpdatePacket: payload.contextUpdatePacket,
      plannerToContext: null,
      cognitionDiagnostics: runRecord.cognitionDiagnostics || null,
    };
  } catch (error) {
    const reason = String(error.message || error);
    addTraceStep(llmTrace, 'llm_call_failure', {
      model: resolvedModel,
      stage: 'planner',
      error: reason,
    });
    return createBlockedResult(reason, 'degraded', '', {
      usedLiveCall: !generator,
      usedFallback: true,
    });
  }
}

function normalizeExecutorAssessment(payload, fallback) {
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  return {
    summary: String(safePayload.summary || fallback.summary || 'Executor assessment complete.').trim(),
    decision: fallback.decision,
    blockers: fallback.blockers,
    verifyRequired: fallback.verifyRequired,
    verificationPlan: {
      commandPresets: uniqueStrings([
        ...(fallback.verificationPlan?.commandPresets || []),
        ...((Array.isArray(safePayload?.verificationPlan?.commandPresets) ? safePayload.verificationPlan.commandPresets : [])),
      ]),
      qaScenarios: uniqueStrings([
        ...(fallback.verificationPlan?.qaScenarios || []),
        ...((Array.isArray(safePayload?.verificationPlan?.qaScenarios) ? safePayload.verificationPlan.qaScenarios : [])),
      ]),
    },
    applyReady: fallback.applyReady,
    deployReady: fallback.deployReady,
    notes: uniqueStrings([
      ...(fallback.notes || []),
      ...((Array.isArray(safePayload.notes) ? safePayload.notes : [])),
    ]).slice(0, 6),
  };
}

function createExecutorRunRecord({
  runId,
  card,
  mode,
  backend,
  model,
  outcome = 'completed',
  summary,
  report,
  usedFallback = false,
  taskCache = null,
  rawResponse = '',
  reason = null,
  startedAt = nowIso(),
  completedAt = nowIso(),
}) {
  const attribution = resolveStageAgentIdentity('executor');
  return {
    id: runId,
    workerId: 'executor',
    agent_id: attribution.agent_id,
    agent_version: attribution.agent_version,
    attribution,
    createdAt: startedAt,
    startedAt,
    completedAt,
    durationMs: durationMsFrom(startedAt, completedAt),
    mode,
    backend,
    model,
    outcome,
    status: outcome,
    summary: String(summary || '').trim() || String(report?.summary || card?.title || 'Executor assessment complete.').trim(),
    reason: String(reason || (Array.isArray(report?.blockers) && report.blockers.length ? report.blockers[0] : '')).trim() || null,
    cardId: card?.id || null,
    taskId: executorTaskId(card),
    targetProjectKey: card?.targetProjectKey || null,
    report,
    usedFallback: Boolean(usedFallback),
    llmStatus: outcome === 'completed' ? 'live' : classifyLlmFailure(reason, usedFallback),
    taskCache: taskCache ? summarizeTaskCache(taskCache) : null,
    rawResponse: rawResponse || null,
  };
}

function persistExecutorRun(rootPath, runRecord) {
  ensureExecutorRunsStorage(rootPath);
  writeJson(executorRunFilePath(rootPath, runRecord.id), runRecord);
  try {
    const taskDir = runRecord?.taskCache?.taskDir ? path.resolve(rootPath, runRecord.taskCache.taskDir) : null;
    writeAgentAuditArtifacts(rootPath, buildAgentAuditRecord({
      rootPath,
      stage: 'executor',
      taskId: runRecord?.taskId || null,
      taskDir,
      taskCache: runRecord?.taskCache || null,
      sourceRecord: runRecord,
      outcome: runRecord?.outcome || runRecord?.status || null,
      pass_fail: runRecord?.outcome === 'completed' ? 'pass' : 'fail',
      artifactRefs: [
        path.join('data', 'spatial', 'agent-runs', 'executor', `${runRecord.id}.json`),
      ],
    }));
  } catch (error) {
    console.warn('[WARN] executor audit write failed:', error?.message || error);
  }
  return runRecord;
}

async function runExecutorWorker(options = {}) {
  const {
    rootPath,
    card = null,
    workspace = {},
    mode = 'manual',
    backend = null,
    model = null,
    host = null,
    timeoutMs = null,
    runId = makeExecutorRunId(),
    generator = null,
    fetchImpl = globalThis.fetch,
  } = options;

  if (!rootPath) throw new Error('rootPath is required for executor worker runs.');
  if (!card || typeof card !== 'object') {
    return {
      ok: false,
      skipped: true,
      outcome: 'skipped',
      reason: 'Executor requires a selected team board card.',
      run: null,
      report: null,
      usedFallback: false,
      taskCacheSource: TASK_CACHE_SOURCE.BYPASS,
    };
  }

  const definition = resolveWorkerDefinition(rootPath, 'executor');
  const config = definition.config;
  const resolvedBackend = backend || config.backend;
  const resolvedModel = model || config.model;
  const resolvedHost = host || config.host || DEFAULT_OLLAMA_HOST;
  const resolvedTimeoutMs = Number(timeoutMs || config.timeoutMs || DEFAULT_EXECUTOR_TIMEOUT_MS);
  const taskCache = readTaskCache(rootPath, {
    taskId: executorTaskId(card),
    stage: 'executor',
  });
  const fallbackReport = deriveExecutorAssessment({ card, workspace });
  const startedAt = nowIso();

  let usedFallback = false;
  let rawResponse = '';
  let report = fallbackReport;
  let outcome = 'completed';
  let reason = '';

  try {
    const generated = generator
      ? await generator({
          card,
          workspace,
          mode,
          backend: resolvedBackend,
          model: resolvedModel,
          host: resolvedHost,
          runId,
          definition,
          fallbackReport,
          taskCache,
        })
      : await callOllamaGenerate({
          prompt: buildExecutorPrompt({
            promptTemplate: config.prompt,
            card,
            workspace,
            rootPath,
            taskCache,
          }),
      model: resolvedModel,
      host: resolvedHost,
      timeoutMs: resolvedTimeoutMs,
      fetchImpl,
    });
    const rawPayload = generated?.json ?? generated;
    rawResponse = generated?.text || (typeof generated === 'string' ? generated : JSON.stringify(rawPayload));
    report = normalizeExecutorAssessment(rawPayload, fallbackReport);
  } catch (error) {
    usedFallback = true;
    rawResponse = String(error.message || error);
    report = fallbackReport;
    outcome = 'degraded';
    reason = rawResponse;
  }
  const completedAt = nowIso();

  const runRecord = persistExecutorRun(rootPath, createExecutorRunRecord({
    runId,
    card,
    mode,
    backend: resolvedBackend,
    model: resolvedModel,
    outcome,
    summary: report.summary,
    report,
    usedFallback,
    taskCache,
    rawResponse,
    reason,
    startedAt,
    completedAt,
  }));

  return {
    ok: !usedFallback,
    skipped: false,
    outcome,
    reason: reason || report.blockers[0] || '',
    run: runRecord,
    report,
    usedFallback,
    taskCacheSource: taskCache.source,
  };
}

function buildContextWorkspaceSection(workspace = {}) {
  const registry = workspace?.intentState?.registry || null;
  const latestIntent = registry?.currentIntentId
    ? registry.byId?.[registry.currentIntentId] || null
    : null;
  const boardSummary = workspace?.studio?.teamBoard?.summary || {};
  return [
    `Active page id: ${workspace?.activePageId || 'none'}`,
    `Latest intent summary: ${latestIntent?.summary || 'none'}`,
    `Latest intent confidence: ${Math.round(Number(latestIntent?.confidence || 0) * 100)}%`,
    `Board counts: plan=${boardSummary.plan || 0} active=${boardSummary.active || 0} review=${boardSummary.review || 0} complete=${boardSummary.complete || 0}`,
  ].join('\n');
}

function buildContextManagerPrompt({
  promptTemplate,
  text,
  anchorBundle,
  workspace,
  graphBundle = null,
  plannerFeedback = null,
  previousHandoff = null,
  rootPath,
}) {
  return [
    String(promptTemplate || FALLBACK_CONTEXT_MANAGER_PROMPT).trim(),
    '',
    buildKnownFixesPromptSection(rootPath),
    '## Raw Context Input',
    String(text || '').trim() || '(empty)',
    '',
    '## Previous Planner Handoff',
    previousHandoff
      ? [
          `ID: ${previousHandoff.id || 'unknown'}`,
          `Summary: ${previousHandoff.summary || ''}`,
          `Status: ${previousHandoff.status || 'unknown'}`,
          `Requested outcomes: ${(previousHandoff.requestedOutcomes || previousHandoff.tasks || []).join(' | ') || 'none'}`,
        ].join('\n')
      : 'No previous planner handoff.',
    '',
    '## Planner Feedback',
    plannerFeedback
      ? [
          `Action: ${plannerFeedback.action || 'retry-handoff'}`,
          `Detail: ${plannerFeedback.detail || plannerFeedback.summary || ''}`,
          `Anchor refs: ${(plannerFeedback.anchorRefs || []).join(', ') || 'none'}`,
        ].join('\n')
      : 'No planner feedback.',
    '',
    '## Canonical Anchors',
    buildAnchorPromptSections(anchorBundle),
    '',
    '## Current Workspace Slice',
    buildContextWorkspaceSection(workspace),
    '',
    '## Normalized Graph Bundle',
    buildGraphBundleSection(graphBundle || normalizeGraphBundle(workspace)),
  ].join('\n').trim();
}

function normalizeContextPacket(packet, anchorBundle = {}) {
  const safePacket = packet && typeof packet === 'object' ? packet : {};
  const knownAnchorRefs = new Set((anchorBundle?.truthSources || [])
    .filter((source) => source?.exists && source.authority === 'canonical-anchor')
    .map((source) => normalizeRelativePath(source.relativePath)));
  const requestedOutcomes = uniqueStrings(
    Array.isArray(safePacket.requestedOutcomes)
      ? safePacket.requestedOutcomes
      : Array.isArray(safePacket.tasks)
        ? safePacket.tasks
        : [],
  ).slice(0, MAX_CONTEXT_TASKS);
  return {
    summary: String(safePacket.summary || '').trim().slice(0, 180),
    statement: String(safePacket.statement || '').trim(),
    goal: String(safePacket.goal || safePacket.statement || safePacket.summary || '').trim().slice(0, 180),
    requestedOutcomes,
    tasks: requestedOutcomes,
    targets: uniqueStrings(Array.isArray(safePacket.targets) ? safePacket.targets : []).slice(0, 8),
    constraints: uniqueStrings(Array.isArray(safePacket.constraints) ? safePacket.constraints : []).slice(0, 4),
    urgency: ['low', 'normal', 'high'].includes(String(safePacket.urgency || '').trim().toLowerCase())
      ? String(safePacket.urgency).trim().toLowerCase()
      : 'normal',
    requestType: String(safePacket.requestType || 'context_request').trim() || 'context_request',
    signals: safePacket.signals && typeof safePacket.signals === 'object' ? safePacket.signals : {},
    clarifications: uniqueStrings(Array.isArray(safePacket.clarifications) ? safePacket.clarifications : []).slice(0, 4),
    focusTerms: uniqueStrings(Array.isArray(safePacket.focusTerms) ? safePacket.focusTerms : []).slice(0, 8),
    suggestedAnchorRefs: uniqueStrings(Array.isArray(safePacket.suggestedAnchorRefs) ? safePacket.suggestedAnchorRefs : [])
      .map(normalizeRelativePath)
      .filter((anchorRef) => knownAnchorRefs.has(anchorRef))
      .slice(0, 6),
  };
}

function buildContextAnalysisSource(text, packet, plannerFeedback = null) {
  const sections = [String(text || '').trim()];
  if (packet.summary) sections.push(`Focus summary: ${packet.summary}`);
  if (packet.statement) sections.push(`Problem statement: ${packet.statement}`);
  if (packet.goal) sections.push(`Goal: ${packet.goal}`);
  if ((packet.requestedOutcomes || packet.tasks || []).length) {
    sections.push('Requested outcomes:');
    (packet.requestedOutcomes || packet.tasks || []).forEach((task) => sections.push(`- ${task}`));
  }
  if ((packet.targets || []).length) {
    sections.push('Targets:');
    packet.targets.forEach((target) => sections.push(`- ${target}`));
  }
  if ((packet.constraints || []).length) {
    sections.push('Constraints:');
    packet.constraints.forEach((constraint) => sections.push(`- ${constraint}`));
  }
  if (packet.requestType) sections.push(`Request type: ${packet.requestType}`);
  if (packet.urgency) sections.push(`Urgency: ${packet.urgency}`);
  if ((packet.clarifications || []).length) {
    sections.push('Clarifications:');
    packet.clarifications.forEach((clarification) => sections.push(`- ${clarification}`));
  }
  if ((packet.focusTerms || []).length) {
    sections.push(`Focus terms: ${packet.focusTerms.join(', ')}`);
  }
  if (plannerFeedback?.detail || plannerFeedback?.summary) {
    sections.push(`Planner feedback: ${plannerFeedback.detail || plannerFeedback.summary}`);
  }
  return sections.filter(Boolean).join('\n');
}

function buildExtractedIntentPrompt({
  text,
  packet,
  report,
  workspace,
  rootPath,
}) {
  return [
    FALLBACK_EXTRACTED_INTENT_PROMPT,
    '',
    buildKnownFixesPromptSection(rootPath),
    '## Raw Context Input',
    String(text || '').trim() || '(empty)',
    '',
    '## Upstream Context Packet',
    JSON.stringify(packet || {}, null, 2),
    '',
    '## Deterministic Audit',
    JSON.stringify({
      summary: report?.summary || '',
      confidence: report?.confidence || 0,
      classification: report?.classification || { role: 'thought', labels: [] },
      goal: report?.goal || '',
      requestedOutcomes: report?.requestedOutcomes || report?.tasks || [],
      targets: report?.targets || [],
      constraints: report?.constraints || [],
      requestType: report?.requestType || 'context_request',
      urgency: report?.urgency || 'normal',
      signals: report?.signals || {},
      matchedTerms: report?.projectContext?.matchedTerms || [],
      criteria: report?.criteria || [],
    }, null, 2),
    '',
    '## Current Workspace Slice',
    buildContextWorkspaceSection(workspace),
  ].join('\n').trim();
}

function normalizeExtractedIntentNodeKind(kind = '') {
  const value = String(kind || '').trim().toLowerCase();
  if (['module', 'task', 'constraint', 'adapter', 'file', 'ux'].includes(value)) return value;
  return 'thought';
}

function normalizeExtractedIntentBasis(value = '') {
  return String(value || '').trim().toLowerCase() === 'inferred' ? 'inferred' : 'explicit';
}

function literalClaimsFromPacket(packet = {}, report = {}) {
  return uniqueStrings([
    packet.summary,
    packet.statement,
    packet.goal,
    ...(packet.requestedOutcomes || packet.tasks || []),
    ...(packet.targets || []),
    ...(packet.constraints || []),
  ]);
}

function buildFallbackExtractedIntent({
  rawText,
  packet,
  report,
  sourceNodeId,
  backend,
  model,
  runId,
  usedFallback = true,
  inferenceMode = 'small-inference',
}) {
  const explicitClaims = literalClaimsFromPacket(packet, report).slice(0, MAX_CONTEXT_TASKS + 2);
  const literalCandidates = uniqueStrings([
    ...(packet.requestedOutcomes || packet.tasks || []),
    ...(report?.requestedOutcomes || report?.tasks || []),
    packet.summary,
    packet.goal,
  ]).slice(0, MAX_EXTRACTED_INTENT_CANDIDATES);
  const assessment = classifyExtractedIntentAssessment({
    summary: packet?.summary || report?.summary || rawText || '',
    explicitClaims,
    inferredClaims: [],
    candidateNodes: literalCandidates.map((label) => ({ label })),
    candidateEdges: [],
    gaps: uniqueStrings([...(packet?.clarifications || []), ...(report?.truth?.unresolved || [])]).slice(0, 4),
    structureValid: true,
    usedFallback: true,
  });
  return {
    id: `extracted_intent_${runId}`,
    sourceNodeId: sourceNodeId || report?.nodeId || null,
    sourceText: String(rawText || ''),
    summary: String(packet?.summary || report?.summary || rawText || '').trim().slice(0, 180),
    explicitClaims,
    inferredClaims: [],
    status: assessment.status,
    confidence: assessment.confidence,
    reason: assessment.reason,
    completeness: assessment.completeness,
    quality: {
      structure: assessment.structure,
      specificity: assessment.specificity,
      actionability: assessment.actionability,
    },
    candidateNodes: literalCandidates.map((label, index) => ({
      id: `literal_${index + 1}`,
      label,
      kind: report?.classification?.role === 'constraint' ? 'constraint' : (report?.classification?.role || 'thought'),
      basis: 'explicit',
      rationale: packet?.statement
        ? `Literal candidate from context packet: ${packet.statement}`
        : 'Literal candidate derived from the current input and upstream packet.',
      confidence: Number.isFinite(Number(report?.confidence)) ? Number(report.confidence) : null,
    })),
    candidateEdges: [],
    gaps: uniqueStrings([...(packet?.clarifications || []), ...(report?.truth?.unresolved || [])]).slice(0, 4),
    provenance: {
      backend,
      model,
      runId,
      usedFallback: Boolean(usedFallback),
      inferenceMode,
      liveResultPreserved: false,
      liveAssessmentStatus: assessment.status,
      liveAssessmentReason: assessment.reason,
    },
    audit: {
      confidence: Number.isFinite(Number(report?.confidence)) ? Number(report.confidence) : 0,
      criteria: Array.isArray(report?.criteria) ? report.criteria : [],
      classification: report?.classification || { role: 'thought', labels: [] },
      matchedTerms: Array.isArray(report?.projectContext?.matchedTerms) ? report.projectContext.matchedTerms : [],
      extractedIntentAssessment: assessment,
    },
  };
}

function hasExtractedIntentPayloadShape(rawPayload) {
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) return false;
  return [
    'summary',
    'explicitClaims',
    'inferredClaims',
    'candidateNodes',
    'candidateEdges',
    'gaps',
  ].some((key) => Object.prototype.hasOwnProperty.call(rawPayload, key));
}

function classifyExtractedIntentAssessment({
  summary = '',
  explicitClaims = [],
  inferredClaims = [],
  candidateNodes = [],
  candidateEdges = [],
  gaps = [],
  structureValid = false,
  usedFallback = false,
}) {
  if (usedFallback) {
    return {
      status: 'fallback_used',
      confidence: 'failed',
      reason: 'fallback_used',
      completeness: 'fallback',
      structure: 'synthetic',
      specificity: 'derived',
      actionability: candidateNodes.length ? 'usable' : 'none',
    };
  }

  if (!structureValid) {
    return {
      status: 'live_invalid',
      confidence: 'failed',
      reason: 'invalid_structure',
      completeness: 'missing',
      structure: 'invalid',
      specificity: 'missing',
      actionability: 'none',
    };
  }

  const hasSummary = Boolean(String(summary || '').trim());
  const claimCount = explicitClaims.length + inferredClaims.length;
  const hasClaims = claimCount > 0;
  const hasEdges = candidateEdges.length > 0;
  const hasGaps = gaps.length > 0;
  const structureScore = Number(hasSummary) + Number(hasClaims) + Number(Array.isArray(candidateNodes)) + Number(Array.isArray(candidateEdges));
  const specificityScore = Number(hasSummary) + Math.min(claimCount, 2) + Number(hasGaps);
  const actionabilityScore = candidateNodes.length > 0
    ? (candidateNodes.length > 1 || hasEdges ? 3 : 2)
    : (hasClaims || hasSummary ? 1 : 0);

  if (!candidateNodes.length) {
    return {
      status: 'live_valid_no_candidates',
      confidence: 'low',
      reason: 'no_candidates',
      completeness: hasClaims || hasSummary ? 'partial' : 'minimal',
      structure: structureScore >= 3 ? 'coherent' : 'thin',
      specificity: specificityScore >= 2 ? 'weak' : 'minimal',
      actionability: 'none',
    };
  }

  if (structureScore >= 4 && specificityScore >= 2 && actionabilityScore >= 2) {
    return {
      status: 'live_valid',
      confidence: candidateNodes.length > 1 || hasEdges ? 'high' : 'medium',
      reason: hasEdges ? 'usable_candidates' : 'usable_candidate',
      completeness: hasEdges ? 'complete' : 'partial',
      structure: 'coherent',
      specificity: specificityScore >= 3 ? 'specific' : 'adequate',
      actionability: candidateNodes.length > 1 || hasEdges ? 'strong' : 'limited',
    };
  }

  return {
    status: 'live_valid',
    confidence: 'medium',
    reason: hasEdges ? 'missing_specificity' : 'weak_specificity',
    completeness: 'partial',
    structure: structureScore >= 3 ? 'coherent' : 'thin',
    specificity: specificityScore >= 2 ? 'adequate' : 'weak',
    actionability: 'limited',
  };
}

function normalizeExtractedIntent(rawPayload, {
  rawText,
  packet,
  report,
  sourceNodeId,
  backend,
  model,
  runId,
  usedFallback = false,
  inferenceMode = 'small-inference',
}) {
  const structureValid = hasExtractedIntentPayloadShape(rawPayload);
  if (!structureValid) {
    return buildFallbackExtractedIntent({
      rawText,
      packet,
      report,
      sourceNodeId,
      backend,
      model,
      runId,
      usedFallback: true,
      inferenceMode,
    });
  }

  const safePayload = rawPayload;
  const explicitClaims = uniqueStrings(Array.isArray(safePayload.explicitClaims) ? safePayload.explicitClaims : []).slice(0, 6);
  const inferredClaims = uniqueStrings(Array.isArray(safePayload.inferredClaims) ? safePayload.inferredClaims : []).slice(0, 2);
  const candidateNodes = (Array.isArray(safePayload.candidateNodes) ? safePayload.candidateNodes : [])
    .map((node, index) => ({
      id: String(node?.id || `candidate_${index + 1}`).trim() || `candidate_${index + 1}`,
      label: String(node?.label || '').trim(),
      kind: normalizeExtractedIntentNodeKind(node?.kind),
      basis: normalizeExtractedIntentBasis(node?.basis),
      rationale: String(node?.rationale || '').trim(),
      confidence: Number.isFinite(Number(node?.confidence)) ? Number(node.confidence) : null,
    }))
    .filter((node) => node.label)
    .slice(0, MAX_EXTRACTED_INTENT_CANDIDATES);
  const candidateIds = new Set(candidateNodes.map((node) => node.id));
  const candidateEdges = (Array.isArray(safePayload.candidateEdges) ? safePayload.candidateEdges : [])
    .map((edge) => ({
      sourceCandidateId: String(edge?.sourceCandidateId || '').trim(),
      targetCandidateId: String(edge?.targetCandidateId || '').trim(),
      kind: String(edge?.kind || 'relates_to').trim() || 'relates_to',
      basis: normalizeExtractedIntentBasis(edge?.basis),
      rationale: String(edge?.rationale || '').trim(),
    }))
    .filter((edge) => edge.sourceCandidateId && edge.targetCandidateId)
    .filter((edge) => candidateIds.has(edge.sourceCandidateId) && candidateIds.has(edge.targetCandidateId))
    .slice(0, MAX_EXTRACTED_INTENT_CANDIDATES);
  const gaps = uniqueStrings(Array.isArray(safePayload.gaps) ? safePayload.gaps : []).slice(0, 4);
  const assessment = classifyExtractedIntentAssessment({
    summary: safePayload.summary || packet?.summary || report?.summary || rawText || '',
    explicitClaims,
    inferredClaims,
    candidateNodes,
    candidateEdges,
    gaps,
    structureValid,
    usedFallback,
  });

  return {
    id: String(safePayload.id || `extracted_intent_${runId}`).trim() || `extracted_intent_${runId}`,
    sourceNodeId: sourceNodeId || report?.nodeId || null,
    sourceText: String(rawText || ''),
    summary: String(safePayload.summary || packet?.summary || report?.summary || rawText || '').trim().slice(0, 180),
    explicitClaims,
    inferredClaims: usedFallback ? [] : inferredClaims,
    candidateNodes: usedFallback ? candidateNodes.filter((node) => node.basis === 'explicit') : candidateNodes,
    candidateEdges: usedFallback ? candidateEdges.filter((edge) => edge.basis === 'explicit') : candidateEdges,
    gaps,
    status: assessment.status,
    confidence: assessment.confidence,
    reason: assessment.reason,
    completeness: assessment.completeness,
    quality: {
      structure: assessment.structure,
      specificity: assessment.specificity,
      actionability: assessment.actionability,
    },
    provenance: {
      backend,
      model,
      runId,
      usedFallback: Boolean(usedFallback),
      inferenceMode,
      liveResultPreserved: !usedFallback,
      liveAssessmentStatus: assessment.status,
      liveAssessmentReason: assessment.reason,
    },
    audit: {
      confidence: Number.isFinite(Number(report?.confidence)) ? Number(report.confidence) : 0,
      criteria: Array.isArray(report?.criteria) ? report.criteria : [],
      classification: report?.classification || { role: 'thought', labels: [] },
      matchedTerms: Array.isArray(report?.projectContext?.matchedTerms) ? report.projectContext.matchedTerms : [],
      extractedIntentAssessment: assessment,
    },
  };
}

function mergeContextPacketIntoReport(report, {
  rawText,
  packet,
  extractedIntent = null,
  plannerFeedback = null,
  sourceNodeId = null,
  source = 'context-intake',
  sourceType = 'context-intake',
  sourceRef = null,
  requestedBy = 'context-manager',
  priority = null,
  runId = null,
  backend,
  model,
  usedFallback = false,
  graphBundle = null,
}) {
  const summary = packet.summary || report.summary;
  const packetRequestedOutcomes = Array.isArray(packet.requestedOutcomes) && packet.requestedOutcomes.length
    ? packet.requestedOutcomes
    : (Array.isArray(packet.tasks) ? packet.tasks : []);
  const reportRequestedOutcomes = Array.isArray(report.requestedOutcomes) && report.requestedOutcomes.length
    ? report.requestedOutcomes
    : (Array.isArray(report.tasks) ? report.tasks : []);
  const requestedOutcomes = uniqueStrings(packetRequestedOutcomes.length ? packetRequestedOutcomes : reportRequestedOutcomes)
    .slice(0, MAX_CONTEXT_TASKS);
  const goal = String(packet.goal || packet.statement || report.goal || summary || '').trim();
  const packetTargets = Array.isArray(packet.targets) ? packet.targets : [];
  const reportTargets = Array.isArray(report.targets) ? report.targets : [];
  const targets = uniqueStrings(packetTargets.length ? packetTargets : reportTargets).slice(0, 8);
  const packetConstraints = Array.isArray(packet.constraints) ? packet.constraints : [];
  const reportConstraints = Array.isArray(report.constraints) ? report.constraints : [];
  const constraints = uniqueStrings(packetConstraints.length ? packetConstraints : reportConstraints).slice(0, 6);
  const urgency = ['low', 'normal', 'high'].includes(String(packet.urgency || report.urgency || '').trim().toLowerCase())
    ? String(packet.urgency || report.urgency).trim().toLowerCase()
    : 'normal';
  const requestType = String(packet.requestType || report.requestType || report.classification?.role || 'context_request').trim() || 'context_request';
  const signals = packet.signals && typeof packet.signals === 'object'
    ? packet.signals
    : (report.signals && typeof report.signals === 'object' ? report.signals : {});
  const mergedProjectContext = {
    ...(report.projectContext || {}),
    graphBundle: graphBundle || report.projectContext?.graphBundle || null,
    plannerFeedback: plannerFeedback ? {
      id: plannerFeedback.id || null,
      action: plannerFeedback.action || null,
      detail: plannerFeedback.detail || plannerFeedback.summary || null,
      anchorRefs: Array.isArray(plannerFeedback.anchorRefs) ? plannerFeedback.anchorRefs.filter(Boolean) : [],
    } : null,
  };
  const intentContract = buildCanonicalIntentContract({
    report: {
      ...report,
      summary,
      goal,
      requestedOutcomes,
      tasks: requestedOutcomes,
      targets,
      constraints,
      urgency,
      requestType,
      nodeId: sourceNodeId || report.nodeId || null,
      source: sourceType,
      requestedBy,
      priority: priority || urgency || 'normal',
      anchorRefs: Array.isArray(report.anchorRefs) ? report.anchorRefs : [],
    },
    packet: {
      ...packet,
      summary,
      goal,
      requestedOutcomes,
      tasks: requestedOutcomes,
      targets,
      constraints,
      urgency,
      requestType,
      sourceType,
      sourceRef: sourceRef || sourceNodeId || report.nodeId || null,
      requestedBy,
      priority: priority || urgency || 'normal',
      anchorRefs: Array.isArray(report.anchorRefs) ? report.anchorRefs : [],
    },
    sourceType,
    sourceRef: sourceRef || sourceNodeId || report.nodeId || null,
    requestedBy,
    priority: priority || urgency || 'normal',
    timestamp: report.createdAt || nowIso(),
    provenance: {
      anchors: Array.isArray(report.provenance?.anchors) ? report.provenance.anchors : [],
      managerSummary: report.projectContext?.managerSummary || null,
      sourceNodeId: sourceNodeId || report.nodeId || null,
      source: source || sourceType,
      usedFallback,
      runId,
    },
    intentId: report.intentId || packet.intentId || null,
  });
  return {
    ...report,
    summary,
    goal,
    targets,
    constraints,
    urgency,
    requestType,
    requestedOutcomes,
    tasks: requestedOutcomes,
    signals,
    nodeId: sourceNodeId || report.nodeId || null,
    source,
    createdAt: report.createdAt || nowIso(),
    projectContext: mergedProjectContext,
    contextPacket: {
      ...packet,
      graphBundle: graphBundle || packet.graphBundle || null,
      requestedOutcomes,
      tasks: requestedOutcomes,
      plannerFeedbackAction: plannerFeedback?.action || null,
    },
    intentContract,
    canonicalIntent: intentContract.canonicalIntent,
    extractedIntent,
    worker: {
      id: 'context-manager',
      backend,
      model,
      runId,
      usedFallback,
    },
    truth: buildIntentTruth({
      source: rawText,
      summary,
      requestedOutcomes,
      criteria: report.criteria || [],
      classification: report.classification || { role: 'context', labels: [] },
      projectContext: mergedProjectContext,
      scores: report.scores || {},
    }),
  };
}

function resolvePlannerFeedback(workspace = {}, previousHandoff = null) {
  const feedback = workspace?.studio?.handoffs?.plannerToContext || null;
  if (!feedback) return null;
  if (!previousHandoff?.id) return feedback;
  if (!feedback.sourceHandoffId || feedback.sourceHandoffId === previousHandoff.id) return feedback;
  return null;
}

function createContextManagerRunRecord({
  runId,
  mode,
  backend,
  model,
  outcome,
  summary,
  reason = '',
  sourceText,
  sourceNodeId = null,
  plannerFeedback = null,
  packet = null,
  extractedIntent = null,
  report = null,
  handoff = null,
  usedFallback = false,
  rawResponse = '',
  llmTrace = null,
  startedAt = nowIso(),
  completedAt = nowIso(),
}) {
  const attribution = resolveStageAgentIdentity('context-manager');
  return {
    id: runId,
    workerId: 'context-manager',
    agent_id: attribution.agent_id,
    agent_version: attribution.agent_version,
    attribution,
    createdAt: startedAt,
    startedAt,
    completedAt,
    durationMs: durationMsFrom(startedAt, completedAt),
    mode,
    backend,
    model,
    outcome,
    status: outcome,
    summary: String(summary || '').trim() || (report?.summary || 'Context Manager completed.'),
    reason: String(reason || '').trim() || null,
    sourceNodeId,
    sourceText: String(sourceText || ''),
    plannerFeedback,
    packet,
    extractedIntent,
    report,
    handoffId: handoff?.id || null,
    intentId: report?.intentContract?.intentId || handoff?.intentContract?.intentId || report?.intentId || handoff?.intentId || null,
    intentContract: report?.intentContract || handoff?.intentContract || null,
    canonicalIntent: report?.canonicalIntent || handoff?.intentContract?.canonicalIntent || null,
    handoff,
    usedFallback: Boolean(usedFallback),
    llmStatus: outcome === 'completed' ? 'live' : classifyLlmFailure(reason, usedFallback),
    rawResponse: rawResponse || null,
    llmTrace: llmTrace && Array.isArray(llmTrace.steps) ? llmTrace : null,
  };
}

function persistContextManagerRun(rootPath, runRecord) {
  ensureContextManagerRunsStorage(rootPath);
  writeJson(contextManagerRunFilePath(rootPath, runRecord.id), runRecord);
  try {
    writeAgentAuditArtifacts(rootPath, buildAgentAuditRecord({
      rootPath,
      stage: 'context-manager',
      taskId: runRecord?.report?.taskId || runRecord?.handoff?.taskId || null,
      sourceRecord: runRecord,
      outcome: runRecord?.outcome || runRecord?.status || null,
      pass_fail: runRecord?.outcome === 'completed' ? 'pass' : 'fail',
      artifactRefs: [
        path.join('data', 'spatial', 'agent-runs', 'context-manager', `${runRecord.id}.json`),
      ],
    }));
  } catch (error) {
    console.warn('[WARN] context-manager audit write failed:', error?.message || error);
  }
  return runRecord;
}

async function runContextManagerWorker(options = {}) {
  const {
    rootPath,
    text,
    sourceNodeId = null,
    source = 'context-intake',
    workspace = {},
    anchorBundle = null,
    dashboardState = {},
    previousHandoff = null,
    plannerFeedback = null,
    mode = 'manual',
    backend = null,
    model = null,
    host = null,
    timeoutMs = null,
    runId = makeContextManagerRunId(),
    generator = null,
    fallbackAnalyze = null,
    fetchImpl = globalThis.fetch,
  } = options;

  if (!rootPath) throw new Error('rootPath is required for context-manager worker runs.');
  const rawText = String(text || '').trim();
  if (!rawText) throw new Error('Context Manager requires non-empty context text.');

  const definition = resolveWorkerDefinition(rootPath, 'context-manager');
  const config = definition.config;
  const resolvedBackend = backend || config.backend;
  const resolvedModel = model || config.model;
  const resolvedHost = host || config.host || DEFAULT_OLLAMA_HOST;
  const resolvedTimeoutMs = Number(timeoutMs || config.timeoutMs || DEFAULT_CONTEXT_MANAGER_TIMEOUT_MS);
  const activePlannerFeedback = plannerFeedback || resolvePlannerFeedback(workspace, previousHandoff);
  const graphBundle = normalizeGraphBundle(workspace);
  const analyze = typeof fallbackAnalyze === 'function'
    ? fallbackAnalyze
    : ((sourceText, currentWorkspace, analysisMeta = {}) => analyzeSpatialIntent(sourceText, buildIntentProjectContext({
        workspace: currentWorkspace,
        rootPath,
      }), analysisMeta));
  const startedAt = nowIso();
  const intentMeta = {
    sourceType: String(options.sourceType || source || 'context-intake').trim() || 'context-intake',
    sourceRef: String(options.sourceRef || sourceNodeId || '').trim() || null,
    requestedBy: String(options.requestedBy || 'context-manager').trim() || 'context-manager',
    priority: String(options.priority || '').trim() || null,
    intentId: String(options.intentId || '').trim() || null,
    timestamp: options.timestamp || null,
  };

  let usedFallback = false;
  let fallbackReason = '';
  let packet = {
    summary: '',
    statement: '',
    goal: '',
    requestedOutcomes: [],
    tasks: [],
    targets: [],
    constraints: [],
    urgency: 'normal',
    requestType: 'context_request',
    signals: {},
    clarifications: [],
    focusTerms: [],
    suggestedAnchorRefs: [],
  };
  let rawResponse = '';
  let generatedExtractedIntentPayload = null;
  const llmTrace = {
    runId,
    steps: [],
  };

  try {
    const contextPrompt = buildContextManagerPrompt({
      promptTemplate: config.prompt,
      text: rawText,
      anchorBundle: anchorBundle || { anchors: {}, truthSources: [] },
      workspace,
      graphBundle,
      plannerFeedback: activePlannerFeedback,
      previousHandoff,
      rootPath,
    });
    addTraceStep(llmTrace, 'llm_call_start', {
      model: resolvedModel,
      stage: 'context-packet',
      promptPreview: contextPrompt.slice(0, 300),
    });
    const generated = generator
      ? await generator({
          stage: 'context-packet',
          text: rawText,
          sourceNodeId,
          source,
          workspace,
          anchorBundle,
          previousHandoff,
          plannerFeedback: activePlannerFeedback,
          dashboardState,
          mode,
          backend: resolvedBackend,
          model: resolvedModel,
          host: resolvedHost,
          runId,
          definition,
        })
      : await callOllamaGenerate({
          prompt: contextPrompt,
          model: resolvedModel,
          host: resolvedHost,
          timeoutMs: resolvedTimeoutMs,
          fetchImpl,
        });
    const rawPayload = generated?.json ?? generated;
    const packetPayload = rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload) && rawPayload.packet
      ? rawPayload.packet
      : rawPayload;
    generatedExtractedIntentPayload = rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
      ? (rawPayload.extractedIntent || null)
      : null;
    rawResponse = generated?.text || (typeof generated === 'string' ? generated : JSON.stringify(rawPayload));
    packet = normalizeContextPacket(packetPayload, anchorBundle || { truthSources: [] });
    addTraceStep(llmTrace, 'llm_call_success', {
      model: resolvedModel,
      stage: 'context-packet',
      textPreview: rawResponse.slice(0, 300),
    });
  } catch (error) {
    usedFallback = true;
    fallbackReason = String(error.message || error);
    addTraceStep(llmTrace, 'llm_call_failure', {
      model: resolvedModel,
      stage: 'context-packet',
      error: String(error.message || error),
    });
  }

  try {
    const analysisSource = buildContextAnalysisSource(rawText, packet, activePlannerFeedback);
    const baseReport = analyze(analysisSource, workspace, intentMeta);
    let extractedIntent = null;
    let extractedIntentUsedFallback = false;
    let extractedIntentReason = '';
    if (generatedExtractedIntentPayload) {
      extractedIntent = normalizeExtractedIntent(generatedExtractedIntentPayload, {
        rawText,
        packet,
        report: baseReport,
        sourceNodeId,
        backend: resolvedBackend,
        model: resolvedModel,
        runId,
        usedFallback: false,
      });
    } else if (usedFallback) {
      extractedIntentUsedFallback = true;
      extractedIntentReason = fallbackReason;
      extractedIntent = buildFallbackExtractedIntent({
        rawText,
        packet,
        report: baseReport,
        sourceNodeId,
        backend: resolvedBackend,
        model: resolvedModel,
        runId,
        usedFallback: true,
      });
    } else if (generator) {
      extractedIntentUsedFallback = true;
      extractedIntentReason = 'no_response';
      extractedIntent = buildFallbackExtractedIntent({
        rawText,
        packet,
        report: baseReport,
        sourceNodeId,
        backend: resolvedBackend,
        model: resolvedModel,
        runId,
        usedFallback: true,
      });
    } else {
      try {
        const extractedPrompt = buildExtractedIntentPrompt({
          text: rawText,
          packet,
          report: baseReport,
          workspace,
          rootPath,
        });
        addTraceStep(llmTrace, 'llm_call_start', {
          model: resolvedModel,
          stage: 'extracted-intent',
          promptPreview: extractedPrompt.slice(0, 300),
        });
        const extractedResponse = await callOllamaGenerate({
          prompt: extractedPrompt,
          model: resolvedModel,
          host: resolvedHost,
          timeoutMs: resolvedTimeoutMs,
          fetchImpl,
        });
        const rawExtractedPayload = extractedResponse?.json ?? extractedResponse;
        addTraceStep(llmTrace, 'llm_call_success', {
          model: resolvedModel,
          stage: 'extracted-intent',
          textPreview: String(extractedResponse?.text || JSON.stringify(rawExtractedPayload)).slice(0, 300),
        });
        extractedIntent = normalizeExtractedIntent(rawExtractedPayload, {
          rawText,
          packet,
          report: baseReport,
          sourceNodeId,
          backend: resolvedBackend,
          model: resolvedModel,
          runId,
          usedFallback: false,
        });
      } catch (error) {
        extractedIntentUsedFallback = true;
        extractedIntentReason = String(error.message || error);
        addTraceStep(llmTrace, 'llm_call_failure', {
          model: resolvedModel,
          stage: 'extracted-intent',
          error: String(error.message || error),
        });
        extractedIntent = buildFallbackExtractedIntent({
          rawText,
          packet,
          report: baseReport,
          sourceNodeId,
          backend: resolvedBackend,
          model: resolvedModel,
          runId,
          usedFallback: true,
        });
      }
    }
    const combinedFallback = usedFallback || extractedIntentUsedFallback || Boolean(extractedIntent?.provenance?.usedFallback);
    const combinedFallbackReason = [fallbackReason, extractedIntentReason].filter(Boolean).join(' | ');
    const report = mergeContextPacketIntoReport(baseReport, {
      rawText,
      packet,
      extractedIntent,
      plannerFeedback: activePlannerFeedback,
      sourceNodeId,
      source,
      sourceType: intentMeta.sourceType,
      sourceRef: intentMeta.sourceRef,
      requestedBy: intentMeta.requestedBy,
      priority: intentMeta.priority,
      runId,
      backend: resolvedBackend,
      model: resolvedModel,
      usedFallback: combinedFallback,
      graphBundle,
    });
    const handoff = createPlannerHandoff(report, dashboardState, previousHandoff);
    const completedAt = nowIso();
    const runRecord = persistContextManagerRun(rootPath, createContextManagerRunRecord({
      runId,
      mode,
      backend: resolvedBackend,
      model: resolvedModel,
      outcome: combinedFallback ? 'degraded' : 'completed',
      summary: report.summary,
      reason: combinedFallbackReason,
      sourceText: rawText,
      sourceNodeId,
      plannerFeedback: activePlannerFeedback,
      packet,
      extractedIntent,
      report,
      handoff,
      usedFallback: combinedFallback,
      rawResponse,
      llmTrace,
      startedAt,
      completedAt,
    }));
    return {
      ok: !combinedFallback,
      skipped: false,
      outcome: combinedFallback ? 'degraded' : 'completed',
      reason: combinedFallbackReason,
      run: runRecord,
      report,
      extractedIntent,
      handoff,
      plannerFeedback: activePlannerFeedback,
      packet,
      usedFallback: combinedFallback,
    };
  } catch (error) {
    const reason = String(error.message || error);
    addTraceStep(llmTrace, 'llm_call_failure', {
      model: resolvedModel,
      stage: 'context-manager',
      error: reason,
    });
    const completedAt = nowIso();
    const runRecord = persistContextManagerRun(rootPath, createContextManagerRunRecord({
      runId,
      mode,
      backend: resolvedBackend,
      model: resolvedModel,
      outcome: 'degraded',
      summary: rawText.slice(0, 140) || 'Context Manager failed.',
      reason,
      sourceText: rawText,
      sourceNodeId,
      plannerFeedback: activePlannerFeedback,
      packet,
      report: null,
      handoff: null,
      usedFallback,
      rawResponse,
      llmTrace,
      startedAt,
      completedAt,
    }));
    return {
      ok: false,
      skipped: false,
      outcome: 'degraded',
      reason,
      run: runRecord,
      report: null,
      handoff: null,
      plannerFeedback: activePlannerFeedback,
      packet,
      usedFallback,
    };
  }
}

module.exports = {
  ALLOWED_PROPOSAL_TARGETS,
  CONTEXT_MANAGER_RUNS_RELATIVE_DIR,
  DEFAULT_CONTEXT_MANAGER_BACKEND,
  DEFAULT_CONTEXT_MANAGER_MODEL,
  DEFAULT_CONTEXT_MANAGER_TIMEOUT_MS,
  DEFAULT_EXECUTOR_BACKEND,
  DEFAULT_EXECUTOR_MODEL,
  DEFAULT_EXECUTOR_TIMEOUT_MS,
  DEFAULT_PLANNER_BACKEND,
  DEFAULT_PLANNER_MODEL,
  DEFAULT_PLANNER_TIMEOUT_MS,
  EXECUTOR_RUNS_RELATIVE_DIR,
  MAX_PLANNER_CARDS,
  PLANNER_RUNS_RELATIVE_DIR,
  contextManagerRunFilePath,
  contextManagerRunsDir,
  createDefaultAgentWorkersState,
  defaultContextManagerWorkerState,
  defaultExecutorWorkerState,
  defaultPlannerWorkerState,
  ensureContextManagerRunsStorage,
  ensureExecutorRunsStorage,
  ensurePlannerRunsStorage,
  evaluatePlannerEligibility,
  executorRunFilePath,
  executorRunsDir,
  buildExecutorPrompt,
  buildCanonicalIntentContract,
  buildPlannerArtifactContract,
  buildPlannerPrompt,
  buildPlannerPromptProfile,
  getAgentWorkerConfig,
  listContextManagerRuns,
  listExecutorRuns,
  listPlannerRuns,
  makeContextManagerRunId,
  makeExecutorRunId,
  makePlannerRunId,
  normalizeAgentWorkersState,
  plannerRunFilePath,
  plannerRunsDir,
  readContextManagerRun,
  readExecutorRun,
  readPlannerRun,
  runContextManagerWorker,
  runExecutorWorker,
  runPlannerWorker,
  summarizeContextManagerRun,
  summarizeExecutorRun,
  summarizePlannerRun,
};
