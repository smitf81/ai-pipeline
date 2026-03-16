const fs = require('fs');
const path = require('path');
const {
  requestOllamaJson,
  DEFAULT_OLLAMA_HOST,
  DEFAULT_OLLAMA_TIMEOUT_MS,
} = require('./localModelClient');
const { resolveAgentDefinition } = require('./agentRegistry');
const {
  analyzeSpatialIntent,
  buildIntentProjectContext,
  buildIntentTruth,
} = require('./intentAnalysis');
const { createPlannerHandoff } = require('./throughputDebug');

const DEFAULT_PLANNER_BACKEND = 'ollama';
const DEFAULT_PLANNER_MODEL = 'mixtral';
const DEFAULT_PLANNER_TIMEOUT_MS = 30000;
const DEFAULT_CONTEXT_MANAGER_BACKEND = 'ollama';
const DEFAULT_CONTEXT_MANAGER_MODEL = 'mixtral';
const DEFAULT_CONTEXT_MANAGER_TIMEOUT_MS = 30000;
const MAX_PLANNER_CARDS = 3;
const MAX_CONTEXT_TASKS = 4;
const PLANNER_RUNS_RELATIVE_DIR = path.join('data', 'spatial', 'agent-runs', 'planner');
const CONTEXT_MANAGER_RUNS_RELATIVE_DIR = path.join('data', 'spatial', 'agent-runs', 'context-manager');
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
  '  "tasks": ["short task"],',
  '  "constraints": ["constraint or guardrail"],',
  '  "clarifications": ["what still needs clarification"],',
  '  "focusTerms": ["token", "token"],',
  '  "suggestedAnchorRefs": ["brain/emergence/plan.md"]',
  '}',
].join('\n');

function nowIso() {
  return new Date().toISOString();
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
  return agentId === 'planner' ? FALLBACK_PLANNER_PROMPT : FALLBACK_CONTEXT_MANAGER_PROMPT;
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

function createDefaultAgentWorkersState() {
  return {
    'context-manager': defaultContextManagerWorkerState(),
    planner: defaultPlannerWorkerState(),
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

function buildPlannerPrompt({ promptTemplate, handoff, anchorBundle, board }) {
  return [
    String(promptTemplate || FALLBACK_PLANNER_PROMPT).trim(),
    '## Handoff',
    `ID: ${handoff?.id || 'unknown'}`,
    `Summary: ${handoff?.summary || ''}`,
    'Problem:',
    handoff?.problemStatement || '',
    '',
    'Tasks:',
    (handoff?.tasks || []).map((task) => `- ${task}`).join('\n') || '- None',
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
}) {
  return {
    id: runId,
    workerId: 'planner',
    createdAt: nowIso(),
    completedAt: nowIso(),
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

  const createBlockedResult = (reason, outcome = 'blocked', rawResponse = '') => {
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
  if (!Array.isArray(handoff.tasks) || !handoff.tasks.length) return createBlockedResult('Planner handoff has no concrete tasks to decompose.');

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
      : await requestOllamaJson({
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
          `Tasks: ${(previousHandoff.tasks || []).join(' | ') || 'none'}`,
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
  ].join('\n').trim();
}

function normalizeContextPacket(packet, anchorBundle = {}) {
  const safePacket = packet && typeof packet === 'object' ? packet : {};
  const knownAnchorRefs = new Set((anchorBundle?.truthSources || [])
    .filter((source) => source?.exists && source.authority === 'canonical-anchor')
    .map((source) => normalizeRelativePath(source.relativePath)));
  return {
    summary: String(safePacket.summary || '').trim().slice(0, 180),
    statement: String(safePacket.statement || '').trim(),
    tasks: uniqueStrings(Array.isArray(safePacket.tasks) ? safePacket.tasks : []).slice(0, MAX_CONTEXT_TASKS),
    constraints: uniqueStrings(Array.isArray(safePacket.constraints) ? safePacket.constraints : []).slice(0, 4),
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
  if ((packet.tasks || []).length) {
    sections.push('Requested outcomes:');
    packet.tasks.forEach((task) => sections.push(`- ${task}`));
  }
  if ((packet.constraints || []).length) {
    sections.push('Constraints:');
    packet.constraints.forEach((constraint) => sections.push(`- ${constraint}`));
  }
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

function mergeContextPacketIntoReport(report, {
  rawText,
  packet,
  plannerFeedback = null,
  sourceNodeId = null,
  source = 'context-intake',
  runId = null,
  backend,
  model,
  usedFallback = false,
}) {
  const summary = packet.summary || report.summary;
  const tasks = (packet.tasks || []).length ? packet.tasks : report.tasks;
  const mergedProjectContext = {
    ...(report.projectContext || {}),
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
    tasks,
    nodeId: sourceNodeId || report.nodeId || null,
    source,
    createdAt: report.createdAt || nowIso(),
    projectContext: mergedProjectContext,
    contextPacket: {
      ...packet,
      plannerFeedbackAction: plannerFeedback?.action || null,
    },
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
      tasks,
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
  report = null,
  handoff = null,
  usedFallback = false,
  rawResponse = '',
}) {
  return {
    id: runId,
    workerId: 'context-manager',
    createdAt: nowIso(),
    completedAt: nowIso(),
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
    report,
    handoffId: handoff?.id || null,
    handoff,
    usedFallback: Boolean(usedFallback),
    rawResponse: rawResponse || null,
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
  const analyze = typeof fallbackAnalyze === 'function'
    ? fallbackAnalyze
    : ((sourceText, currentWorkspace) => analyzeSpatialIntent(sourceText, buildIntentProjectContext({
        workspace: currentWorkspace,
        rootPath,
      })));

  let usedFallback = false;
  let fallbackReason = '';
  let packet = {
    summary: '',
    statement: '',
    tasks: [],
    constraints: [],
    clarifications: [],
    focusTerms: [],
    suggestedAnchorRefs: [],
  };
  let rawResponse = '';

  try {
    const generated = generator
      ? await generator({
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
      : await requestOllamaJson({
          prompt: buildContextManagerPrompt({
            promptTemplate: config.prompt,
            text: rawText,
            anchorBundle: anchorBundle || { anchors: {}, truthSources: [] },
            workspace,
            plannerFeedback: activePlannerFeedback,
            previousHandoff,
          }),
          model: resolvedModel,
          host: resolvedHost,
          timeoutMs: resolvedTimeoutMs,
          fetchImpl,
        });
    const rawPayload = generated?.json ?? generated;
    rawResponse = generated?.text || (typeof generated === 'string' ? generated : JSON.stringify(rawPayload));
    packet = normalizeContextPacket(rawPayload, anchorBundle || { truthSources: [] });
  } catch (error) {
    usedFallback = true;
    fallbackReason = String(error.message || error);
  }

  try {
    const analysisSource = buildContextAnalysisSource(rawText, packet, activePlannerFeedback);
    const baseReport = analyze(analysisSource, workspace);
    const report = mergeContextPacketIntoReport(baseReport, {
      rawText,
      packet,
      plannerFeedback: activePlannerFeedback,
      sourceNodeId,
      source,
      runId,
      backend: resolvedBackend,
      model: resolvedModel,
      usedFallback,
    });
    const handoff = createPlannerHandoff(report, dashboardState, previousHandoff);
    const runRecord = persistContextManagerRun(rootPath, createContextManagerRunRecord({
      runId,
      mode,
      backend: resolvedBackend,
      model: resolvedModel,
      outcome: 'completed',
      summary: report.summary,
      reason: fallbackReason,
      sourceText: rawText,
      sourceNodeId,
      plannerFeedback: activePlannerFeedback,
      packet,
      report,
      handoff,
      usedFallback,
      rawResponse,
    }));
    return {
      ok: true,
      skipped: false,
      outcome: 'completed',
      reason: fallbackReason,
      run: runRecord,
      report,
      handoff,
      plannerFeedback: activePlannerFeedback,
      packet,
      usedFallback,
    };
  } catch (error) {
    const reason = String(error.message || error);
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
  DEFAULT_PLANNER_BACKEND,
  DEFAULT_PLANNER_MODEL,
  DEFAULT_PLANNER_TIMEOUT_MS,
  MAX_PLANNER_CARDS,
  PLANNER_RUNS_RELATIVE_DIR,
  contextManagerRunFilePath,
  contextManagerRunsDir,
  createDefaultAgentWorkersState,
  defaultContextManagerWorkerState,
  defaultPlannerWorkerState,
  ensureContextManagerRunsStorage,
  ensurePlannerRunsStorage,
  evaluatePlannerEligibility,
  getAgentWorkerConfig,
  listContextManagerRuns,
  listPlannerRuns,
  makeContextManagerRunId,
  makePlannerRunId,
  normalizeAgentWorkersState,
  plannerRunFilePath,
  plannerRunsDir,
  readContextManagerRun,
  readPlannerRun,
  runContextManagerWorker,
  runPlannerWorker,
  summarizeContextManagerRun,
  summarizePlannerRun,
};
