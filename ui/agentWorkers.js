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
} = require('./intentAnalysis');
const {
  getContextManagerNode,
  normalizeGraphBundle,
} = require('./graphQueries');
const { createPlannerHandoff } = require('./throughputDebug');

const DEFAULT_PLANNER_BACKEND = 'ollama';
const DEFAULT_PLANNER_MODEL = 'mistral:latest';
const DEFAULT_PLANNER_TIMEOUT_MS = 30000;
const DEFAULT_CONTEXT_MANAGER_BACKEND = 'ollama';
const DEFAULT_CONTEXT_MANAGER_MODEL = 'mistral:latest';
const DEFAULT_CONTEXT_MANAGER_TIMEOUT_MS = 30000;
const DEFAULT_EXECUTOR_BACKEND = 'ollama';
const DEFAULT_EXECUTOR_MODEL = 'mistral:latest';
const DEFAULT_EXECUTOR_TIMEOUT_MS = 30000;
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
  '- brainProposals may only target brain/emergence/plan.md or brain/emergence/tasks.md.',
  '- If the handoff is not concrete enough, set needsContextRetry=true and explain why.',
  '',
  'Return exactly this shape:',
  '{',
  '  "summary": "short summary",',
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
    outcome: run.outcome,
    status: run.status,
    mode: run.mode,
    handoffId: run.handoffId,
    summary: run.summary,
    reason: run.reason || null,
    proposalArtifactRefs: Array.isArray(run.proposalArtifactRefs) ? run.proposalArtifactRefs : [],
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
    outcome: run.outcome,
    status: run.status,
    mode: run.mode,
    cardId: run.cardId || null,
    taskId: run.taskId || null,
    summary: run.summary,
    decision: run.report?.decision || null,
    reason: run.reason || null,
    usedFallback: Boolean(run.usedFallback),
    createdAt: run.createdAt,
    completedAt: run.completedAt,
  };
}

function buildAnchorPromptSections(anchorBundle = {}) {
  return Object.values(anchorBundle.anchors || {})
    .filter((anchor) => anchor?.exists && anchor.authority === 'canonical-anchor')
    .map((anchor) => {
      const content = String(anchor.content || '').trim().slice(0, 1600);
      return `## ${anchor.relativePath}\n${content || '(empty)'}`;
    })
    .join('\n\n');
}

function buildBoardPromptSection(board = {}) {
  const cards = Array.isArray(board.cards) ? board.cards : [];
  if (!cards.length) return 'No current board cards.';
  return cards
    .filter((card) => card.status !== 'binned')
    .slice(0, 12)
    .map((card) => `- ${card.title} | status=${card.status} | handoff=${card.sourceHandoffId || 'none'} | anchors=${(card.sourceAnchorRefs || []).join(', ') || 'none'}`)
    .join('\n');
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

function buildExecutorPrompt({ promptTemplate, card, workspace }) {
  return [
    String(promptTemplate || FALLBACK_EXECUTOR_PROMPT).trim(),
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

function buildPlannerPrompt({ promptTemplate, handoff, anchorBundle, board }) {
  const requestedOutcomes = Array.isArray(handoff?.requestedOutcomes)
    ? handoff.requestedOutcomes
    : (Array.isArray(handoff?.tasks) ? handoff.tasks : []);
  return [
    String(promptTemplate || FALLBACK_PLANNER_PROMPT).trim(),
    '## Structured Intent Packet',
    `ID: ${handoff?.id || 'unknown'}`,
    `Summary: ${handoff?.summary || ''}`,
    '',
    JSON.stringify({
      goal: handoff?.goal || handoff?.summary || '',
      requestType: handoff?.requestType || 'context_request',
      urgency: handoff?.urgency || 'normal',
      requestedOutcomes,
      targets: Array.isArray(handoff?.targets) ? handoff.targets : [],
      constraints: Array.isArray(handoff?.constraints) ? handoff.constraints : [],
      signals: handoff?.signals || {},
      problemStatement: handoff?.problemStatement || '',
    }, null, 2),
    '',
    '## Handoff Problem Statement',
    handoff?.problemStatement || '',
    '',
    'Constraints:',
    (handoff?.constraints || []).map((constraint) => `- ${constraint}`).join('\n') || '- None',
    '',
    'Anchor refs:',
    (handoff?.anchorRefs || []).map((anchorRef) => `- ${anchorRef}`).join('\n') || '- None',
    '',
    '## Canonical Anchors',
    buildAnchorPromptSections(anchorBundle),
    '',
    '## Existing Team Board',
    buildBoardPromptSection(board),
  ].join('\n').trim();
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

function normalizePlannerPayload(payload, handoff) {
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  return {
    summary: String(safePayload.summary || handoff?.summary || 'Planner review complete.').trim(),
    cards: (Array.isArray(safePayload.cards) ? safePayload.cards : [])
      .map((card) => normalizePlannerCard(card, handoff))
      .filter(Boolean)
      .slice(0, MAX_PLANNER_CARDS),
    brainProposals: (Array.isArray(safePayload.brainProposals) ? safePayload.brainProposals : [])
      .map((proposal) => normalizeBrainProposal(proposal))
      .filter(Boolean)
      .slice(0, 2),
    needsContextRetry: Boolean(safePayload.needsContextRetry),
    retryReason: String(safePayload.retryReason || '').trim(),
  };
}

function runMatchesHandoff(run, handoff = null) {
  if (!run || !handoff) return false;
  if (run.handoffId !== handoff.id) return false;
  if (!run.handoffCreatedAt || !handoff.createdAt) return true;
  return run.handoffCreatedAt === handoff.createdAt;
}

function buildPlannerToContextHandoff({ handoff, action, reason, runId, attemptCount }) {
  return {
    id: `handoff_${runId}`,
    sourceAgentId: 'planner',
    targetAgentId: 'context-manager',
    sourceHandoffId: handoff?.id || null,
    sourceNodeId: handoff?.sourceNodeId || null,
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
  cards = [],
  brainProposals = [],
  proposalArtifactRefs = [],
  plannerToContext = null,
  rawResponse = '',
  startedAt = nowIso(),
  completedAt = nowIso(),
}) {
  return {
    id: runId,
    workerId: 'planner',
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
    outcome,
    status: outcome,
    summary: String(summary || '').trim() || String(handoff?.summary || 'Planner worker finished.').trim(),
    reason: String(reason || '').trim() || null,
    cards,
    brainProposals,
    proposalArtifactRefs,
    plannerToContext,
    rawResponse: rawResponse || null,
  };
}

function persistPlannerRun(rootPath, runRecord) {
  ensurePlannerRunsStorage(rootPath);
  writeJson(plannerRunFilePath(rootPath, runRecord.id), runRecord);
  return runRecord;
}

function evaluatePlannerEligibility({ workspace = {}, handoff = null, mode = 'auto', runs = [] } = {}) {
  const workerState = normalizeAgentWorkersState(workspace?.studio?.agentWorkers).planner;
  if (!handoff) {
    return { eligible: false, reason: 'No planner handoff is available.' };
  }
  if (workerState.status === 'running' || workerState.currentRunId) {
    return { eligible: false, reason: 'Planner worker is already running.' };
  }
  if (mode !== 'auto') {
    return { eligible: true, reason: '' };
  }
  if (handoff.status !== 'ready') {
    return { eligible: false, reason: 'Planner handoff is not ready for auto-run.' };
  }
  if (!Array.isArray(handoff.anchorRefs) || !handoff.anchorRefs.length) {
    return { eligible: false, reason: 'Planner handoff has no anchor provenance.' };
  }
  if ((runs || []).some((run) => runMatchesHandoff(run, handoff) && run.outcome === 'completed')) {
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
  } = options;

  if (!rootPath) throw new Error('rootPath is required for planner worker runs.');
  const definition = resolveWorkerDefinition(rootPath, 'planner');
  const config = definition.config;
  const resolvedBackend = backend || config.backend;
  const resolvedModel = model || config.model;
  const resolvedHost = host || config.host || DEFAULT_OLLAMA_HOST;
  const resolvedTimeoutMs = Number(timeoutMs || config.timeoutMs || DEFAULT_PLANNER_TIMEOUT_MS);
  const runs = listPlannerRuns(rootPath);
  const eligibility = evaluatePlannerEligibility({ workspace, handoff, mode, runs });
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
    };
  }

  const blockedAttempt = (runs || []).filter((run) => runMatchesHandoff(run, handoff) && ['blocked', 'degraded'].includes(run.outcome)).length + 1;
  const blockedAction = blockedAttempt >= 2 ? 'bin-candidate' : 'retry-handoff';
  const startedAt = nowIso();

  const createBlockedResult = (reason, outcome = 'blocked', rawResponse = '') => {
    const completedAt = nowIso();
    const plannerToContext = buildPlannerToContextHandoff({
      handoff,
      action: blockedAction,
      reason,
      runId,
      attemptCount: blockedAttempt,
    });
    const runRecord = persistPlannerRun(rootPath, createPlannerRunRecord({
      runId,
      handoff,
      mode,
      backend: resolvedBackend,
      model: resolvedModel,
      outcome,
      summary: handoff?.summary || 'Planner worker blocked.',
      reason,
      cards: [],
      brainProposals: [],
      proposalArtifactRefs: [],
      plannerToContext,
      rawResponse,
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
      plannerToContext,
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
        })
      : await callOllamaGenerate({
          prompt: buildPlannerPrompt({
            promptTemplate: config.prompt,
            handoff,
            anchorBundle: anchorBundle || {},
            board: workspace?.studio?.teamBoard || { cards: [] },
          }),
          model: resolvedModel,
          host: resolvedHost,
          timeoutMs: resolvedTimeoutMs,
          fetchImpl,
        });
    const rawPayload = generated?.json ?? generated;
    const rawResponse = generated?.text || (typeof generated === 'string' ? generated : JSON.stringify(rawPayload));
    const payload = normalizePlannerPayload(rawPayload, handoff);
    if (payload.needsContextRetry) {
      return createBlockedResult(payload.retryReason || 'Planner requested a tighter context packet before decomposing work.', 'blocked', rawResponse);
    }
    if (!payload.cards.length && !payload.brainProposals.length) {
      return createBlockedResult('Planner produced no cards or review proposals for this handoff.', 'blocked', rawResponse);
    }
    const proposalArtifactRefs = writeProposalArtifacts(rootPath, runId, payload.brainProposals);
    const completedAt = nowIso();
    const runRecord = persistPlannerRun(rootPath, createPlannerRunRecord({
      runId,
      handoff,
      mode,
      backend: resolvedBackend,
      model: resolvedModel,
      outcome: 'completed',
      summary: payload.summary,
      cards: payload.cards,
      brainProposals: payload.brainProposals,
      proposalArtifactRefs,
      plannerToContext: null,
      rawResponse,
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
      plannerToContext: null,
    };
  } catch (error) {
    return createBlockedResult(String(error.message || error), 'degraded');
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
  rawResponse = '',
  reason = null,
  startedAt = nowIso(),
  completedAt = nowIso(),
}) {
  return {
    id: runId,
    workerId: 'executor',
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
    rawResponse: rawResponse || null,
  };
}

function persistExecutorRun(rootPath, runRecord) {
  ensureExecutorRunsStorage(rootPath);
  writeJson(executorRunFilePath(rootPath, runRecord.id), runRecord);
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
    };
  }

  const definition = resolveWorkerDefinition(rootPath, 'executor');
  const config = definition.config;
  const resolvedBackend = backend || config.backend;
  const resolvedModel = model || config.model;
  const resolvedHost = host || config.host || DEFAULT_OLLAMA_HOST;
  const resolvedTimeoutMs = Number(timeoutMs || config.timeoutMs || DEFAULT_EXECUTOR_TIMEOUT_MS);
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
        })
      : await callOllamaGenerate({
          prompt: buildExecutorPrompt({
            promptTemplate: config.prompt,
            card,
            workspace,
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
  };
}

function buildContextWorkspaceSection(workspace = {}) {
  const latestIntent = workspace?.intentState?.contextReport || workspace?.intentState?.latest || null;
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
}) {
  return [
    String(promptTemplate || FALLBACK_CONTEXT_MANAGER_PROMPT).trim(),
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
}) {
  return [
    FALLBACK_EXTRACTED_INTENT_PROMPT,
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
  return {
    id: `extracted_intent_${runId}`,
    sourceNodeId: sourceNodeId || report?.nodeId || null,
    sourceText: String(rawText || ''),
    summary: String(packet?.summary || report?.summary || rawText || '').trim().slice(0, 180),
    explicitClaims,
    inferredClaims: [],
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
    },
    audit: {
      confidence: Number.isFinite(Number(report?.confidence)) ? Number(report.confidence) : 0,
      criteria: Array.isArray(report?.criteria) ? report.criteria : [],
      classification: report?.classification || { role: 'thought', labels: [] },
      matchedTerms: Array.isArray(report?.projectContext?.matchedTerms) ? report.projectContext.matchedTerms : [],
    },
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
  const safePayload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
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

  if (!candidateNodes.length) {
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

  return {
    id: String(safePayload.id || `extracted_intent_${runId}`).trim() || `extracted_intent_${runId}`,
    sourceNodeId: sourceNodeId || report?.nodeId || null,
    sourceText: String(rawText || ''),
    summary: String(safePayload.summary || packet?.summary || report?.summary || rawText || '').trim().slice(0, 180),
    explicitClaims,
    inferredClaims: usedFallback ? [] : inferredClaims,
    candidateNodes: usedFallback ? candidateNodes.filter((node) => node.basis === 'explicit') : candidateNodes,
    candidateEdges: usedFallback ? candidateEdges.filter((edge) => edge.basis === 'explicit') : candidateEdges,
    gaps: uniqueStrings(Array.isArray(safePayload.gaps) ? safePayload.gaps : []).slice(0, 4),
    provenance: {
      backend,
      model,
      runId,
      usedFallback: Boolean(usedFallback),
      inferenceMode,
    },
    audit: {
      confidence: Number.isFinite(Number(report?.confidence)) ? Number(report.confidence) : 0,
      criteria: Array.isArray(report?.criteria) ? report.criteria : [],
      classification: report?.classification || { role: 'thought', labels: [] },
      matchedTerms: Array.isArray(report?.projectContext?.matchedTerms) ? report.projectContext.matchedTerms : [],
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
  return {
    id: runId,
    workerId: 'context-manager',
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
    : ((sourceText, currentWorkspace) => analyzeSpatialIntent(sourceText, buildIntentProjectContext({
        workspace: currentWorkspace,
        rootPath,
      })));
  const startedAt = nowIso();

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
    const baseReport = analyze(analysisSource, workspace);
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
      extractedIntent = buildFallbackExtractedIntent({
        rawText,
        packet,
        report: baseReport,
        sourceNodeId,
        backend: resolvedBackend,
        model: resolvedModel,
        runId,
        usedFallback: false,
      });
    } else {
      try {
        const extractedPrompt = buildExtractedIntentPrompt({
          text: rawText,
          packet,
          report: baseReport,
          workspace,
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
