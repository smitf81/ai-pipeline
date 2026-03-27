const fs = require('fs');
const path = require('path');
const { extractArchivistWritebackBlock } = require('./archivistWritebackMarkers');

const DEFAULT_DOMAIN_KEY = 'emergence';
const SLICE_STORE_VERSION = 'ace/slices.v1';
const BOARD_STATUS = new Set(['plan', 'active', 'complete', 'review', 'binned']);
const TASK_PHASES = new Set(['captured', 'planned', 'active', 'handed_off']);
const TASK_ASSIGNMENT_STATES = new Set(['unassigned', 'assigned', 'claimed']);

function nowIso() {
  return new Date().toISOString();
}

function uniqueStrings(values = []) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function normalizeBoardStatus(status) {
  if (status === 'planned' || status === 'ready') return 'plan';
  return BOARD_STATUS.has(status) ? status : 'plan';
}

function normalizeTaskFlow(taskFlow = {}, fallback = {}) {
  const phase = TASK_PHASES.has(taskFlow.phase)
    ? taskFlow.phase
    : (TASK_PHASES.has(fallback.phase) ? fallback.phase : 'planned');
  const assignmentState = TASK_ASSIGNMENT_STATES.has(taskFlow.assignmentState)
    ? taskFlow.assignmentState
    : (TASK_ASSIGNMENT_STATES.has(fallback.assignmentState) ? fallback.assignmentState : 'unassigned');
  const history = Array.isArray(taskFlow.history) ? taskFlow.history.filter(Boolean).map((entry) => ({
    phase: TASK_PHASES.has(entry?.phase) ? entry.phase : phase,
    assignmentState: TASK_ASSIGNMENT_STATES.has(entry?.assignmentState) ? entry.assignmentState : assignmentState,
    ownerDeskId: entry?.ownerDeskId || null,
    assigneeDeskId: entry?.assigneeDeskId || null,
    label: entry?.label || '',
    note: entry?.note || '',
    at: entry?.at || null,
  })) : [];
  return {
    phase,
    assignmentState,
    ownerDeskId: taskFlow.ownerDeskId || fallback.ownerDeskId || null,
    assigneeDeskId: taskFlow.assigneeDeskId || fallback.assigneeDeskId || null,
    sourceIntentId: taskFlow.sourceIntentId || fallback.sourceIntentId || null,
    sourceHandoffId: taskFlow.sourceHandoffId || fallback.sourceHandoffId || null,
    lastTransitionAt: taskFlow.lastTransitionAt || fallback.lastTransitionAt || history[0]?.at || null,
    lastTransitionLabel: taskFlow.lastTransitionLabel || fallback.lastTransitionLabel || history[0]?.label || null,
    history,
  };
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || 'slice';
}

function defaultSliceStore() {
  return {
    version: SLICE_STORE_VERSION,
    updatedAt: null,
    slices: [],
  };
}

function sliceRoot(rootPath, domainKey = DEFAULT_DOMAIN_KEY) {
  return path.join(rootPath, 'brain', domainKey);
}

function sliceStorePath(rootPath, domainKey = DEFAULT_DOMAIN_KEY) {
  return path.join(sliceRoot(rootPath, domainKey), 'slices.json');
}

function sliceMarkdownPath(rootPath, domainKey = DEFAULT_DOMAIN_KEY) {
  return path.join(sliceRoot(rootPath, domainKey), 'slices.md');
}

function tasksCompatibilityPath(rootPath, domainKey = DEFAULT_DOMAIN_KEY) {
  return path.join(sliceRoot(rootPath, domainKey), 'tasks.md');
}

function legacyTasksCompatibilityPath(rootPath, domainKey = DEFAULT_DOMAIN_KEY) {
  return path.join(rootPath, 'projects', domainKey, 'tasks.md');
}

function normalizeSliceRecord(slice = {}, fallback = {}) {
  const id = String(slice.id || fallback.id || '').trim() || String(fallback.index || 1).padStart(4, '0');
  const title = String(slice.title || fallback.title || '').trim() || `Slice ${id}`;
  const taskFlow = normalizeTaskFlow(slice.taskFlow, {
    phase: slice.phase,
    assignmentState: slice.assignmentState,
    ownerDeskId: slice.ownerDeskId,
    assigneeDeskId: slice.assigneeDeskId,
    sourceIntentId: slice.sourceIntentId,
    sourceHandoffId: slice.sourceHandoffId,
    lastTransitionAt: slice.updatedAt || slice.createdAt || null,
    lastTransitionLabel: slice.status === 'active' ? 'Moved to active work' : 'Moved to planner board',
  });
  const summary = String(slice.summary || '').trim()
    || String(slice.executionPackage?.summary || '').trim()
    || String(slice.lastVerificationSummary || '').trim()
    || title;
  return {
    id,
    title,
    summary,
    status: normalizeBoardStatus(slice.status),
    sourceKey: String(slice.sourceKey || fallback.sourceKey || `${slice.pageId || fallback.pageId || 'page'}:${slugify(title)}`),
    pageId: slice.pageId || fallback.pageId || null,
    sourceNodeId: slice.sourceNodeId || null,
    sourceIntentId: slice.sourceIntentId || taskFlow.sourceIntentId || slice.sourceNodeId || null,
    sourceHandoffId: slice.sourceHandoffId || taskFlow.sourceHandoffId || null,
    sourceAnchorRefs: uniqueStrings(slice.sourceAnchorRefs || []),
    taskFlow,
    phaseTicks: Number(slice.phaseTicks || 0),
    targetProjectKey: String(slice.targetProjectKey || fallback.targetProjectKey || 'ace-self'),
    builderTaskId: slice.builderTaskId || slice.runnerTaskId || null,
    runnerTaskId: slice.runnerTaskId || null,
    runIds: uniqueStrings(slice.runIds || []),
    artifactRefs: uniqueStrings(slice.artifactRefs || []),
    executionPackage: slice.executionPackage && typeof slice.executionPackage === 'object'
      ? {
          ...slice.executionPackage,
          changedFiles: uniqueStrings(slice.executionPackage.changedFiles || []),
        }
      : {
          status: 'idle',
          taskId: slice.builderTaskId || slice.runnerTaskId || null,
          taskDir: null,
          patchPath: null,
          changedFiles: [],
          targetProjectKey: String(slice.targetProjectKey || fallback.targetProjectKey || 'ace-self'),
          expectedAction: 'apply',
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
    executorBlocker: slice.executorBlocker && typeof slice.executorBlocker === 'object'
      ? {
          code: slice.executorBlocker.code || 'executor-blocked',
          message: slice.executorBlocker.message || 'Execution is blocked.',
          updatedAt: slice.executorBlocker.updatedAt || null,
        }
      : null,
    verifyRequired: Boolean(slice.verifyRequired),
    verifyStatus: String(slice.verifyStatus || 'idle'),
    verifyRunIds: uniqueStrings(slice.verifyRunIds || []),
    verifyArtifacts: uniqueStrings(slice.verifyArtifacts || []),
    lastVerificationSummary: String(slice.lastVerificationSummary || '').trim(),
    verifiedSignature: slice.verifiedSignature || null,
    riskLevel: String(slice.riskLevel || 'unknown'),
    riskReasons: uniqueStrings(slice.riskReasons || []),
    approvalState: String(slice.approvalState || 'none'),
    applyStatus: String(slice.applyStatus || 'idle'),
    deployStatus: String(slice.deployStatus || 'idle'),
    branch: slice.branch || null,
    commit: slice.commit || null,
    auditSessionId: slice.auditSessionId || null,
    provenance: slice.provenance && typeof slice.provenance === 'object' ? slice.provenance : null,
    createdAt: slice.createdAt || fallback.createdAt || nowIso(),
    updatedAt: slice.updatedAt || fallback.updatedAt || slice.createdAt || nowIso(),
  };
}

function cardToSliceRecord(card = {}) {
  return normalizeSliceRecord({
    id: card.id,
    title: card.title,
    summary: card.summary || card.executionPackage?.summary || card.lastVerificationSummary || card.title,
    status: card.status,
    sourceKey: card.sourceKey,
    pageId: card.pageId,
    sourceNodeId: card.sourceNodeId,
    sourceIntentId: card.sourceIntentId,
    sourceHandoffId: card.sourceHandoffId,
    sourceAnchorRefs: card.sourceAnchorRefs,
    taskFlow: card.taskFlow,
    phaseTicks: card.phaseTicks,
    targetProjectKey: card.targetProjectKey,
    builderTaskId: card.builderTaskId,
    runnerTaskId: card.runnerTaskId,
    runIds: card.runIds,
    artifactRefs: card.artifactRefs,
    executionPackage: card.executionPackage,
    executorBlocker: card.executorBlocker,
    verifyRequired: card.verifyRequired,
    verifyStatus: card.verifyStatus,
    verifyRunIds: card.verifyRunIds,
    verifyArtifacts: card.verifyArtifacts,
    lastVerificationSummary: card.lastVerificationSummary,
    verifiedSignature: card.verifiedSignature,
    riskLevel: card.riskLevel,
    riskReasons: card.riskReasons,
    approvalState: card.approvalState,
    applyStatus: card.applyStatus,
    deployStatus: card.deployStatus,
    branch: card.branch,
    commit: card.commit,
    auditSessionId: card.auditSessionId,
    provenance: card.executionProvenance || card.provenance || null,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  });
}

function buildSliceStoreFromCards(cards = []) {
  const slices = (Array.isArray(cards) ? cards : [])
    .filter(Boolean)
    .map((card) => cardToSliceRecord(card))
    .sort((left, right) => {
      const leftCreated = left.createdAt || '';
      const rightCreated = right.createdAt || '';
      return leftCreated.localeCompare(rightCreated) || left.id.localeCompare(right.id);
    });
  return {
    version: SLICE_STORE_VERSION,
    updatedAt: nowIso(),
    slices,
  };
}

function readSliceStore(rootPath, domainKey = DEFAULT_DOMAIN_KEY) {
  const file = sliceStorePath(rootPath, domainKey);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const normalized = {
      ...defaultSliceStore(),
      ...(parsed && typeof parsed === 'object' ? parsed : {}),
    };
    return {
      exists: true,
      file,
      store: {
        version: SLICE_STORE_VERSION,
        updatedAt: normalized.updatedAt || null,
        slices: (Array.isArray(normalized.slices) ? normalized.slices : []).map((slice, index) => normalizeSliceRecord(slice, { index: index + 1 })),
      },
    };
  } catch (error) {
    return {
      exists: false,
      file,
      error,
      store: defaultSliceStore(),
    };
  }
}

function summarizeSliceState(slice = {}) {
  if (slice.status === 'binned') return 'Binned';
  if (slice.deployStatus === 'deploying') return 'Deploying';
  if (slice.deployStatus === 'deployed') return 'Deployed';
  if (slice.deployStatus === 'flagged' || slice.deployStatus === 'failed') return 'Flagged';
  if (slice.applyStatus === 'applying') return 'Applying';
  if (slice.applyStatus === 'applied') return 'Applied';
  if (slice.applyStatus === 'queued') return 'Queued for apply';
  if (slice.verifyStatus === 'running') return 'Verifying';
  if (slice.verifyStatus === 'queued') return 'Queued for verify';
  if (slice.verifyStatus === 'failed' || slice.verifyStatus === 'blocked') return 'Verification blocked';
  if (slice.status === 'review') return 'Approval required';
  if (slice.status === 'active') return 'Building package';
  if (slice.status === 'complete') return 'Complete';
  return 'Ready';
}

function renderSlicesMarkdown(store = defaultSliceStore()) {
  const slices = Array.isArray(store.slices) ? store.slices : [];
  const active = slices.filter((slice) => slice.status !== 'binned');
  const archived = slices.filter((slice) => slice.status === 'binned');
  const lines = [
    '# Active Slices',
    '',
    'Canonical source: `brain/emergence/slices.json`',
    `Generated: ${store.updatedAt || nowIso()}`,
    '',
    `Active slice count: ${active.length}`,
  ];
  if (!active.length) {
    lines.push('', 'No active slices recorded yet.');
  } else {
    active.forEach((slice) => {
      lines.push(
        '',
        `## ${slice.id}: ${slice.title}`,
        `- Summary: ${slice.summary || slice.title}`,
        `- Status: ${slice.status}`,
        `- State: ${summarizeSliceState(slice)}`,
        `- Phase: ${slice.taskFlow?.phase || 'planned'}`,
        `- Owner: ${slice.taskFlow?.ownerDeskId || 'planner'}`,
        `- Assignee: ${slice.taskFlow?.assigneeDeskId || 'executor'}`,
        `- Anchor refs: ${slice.sourceAnchorRefs.length ? slice.sourceAnchorRefs.join(', ') : 'None attached'}`,
        `- Source handoff: ${slice.sourceHandoffId || 'none'}`,
        `- Updated: ${slice.updatedAt || slice.createdAt || 'unknown'}`,
      );
    });
  }
  if (archived.length) {
    lines.push('', '## Archived / Binned', '');
    archived.forEach((slice) => {
      lines.push(`- ${slice.id}: ${slice.title} (${slice.updatedAt || slice.createdAt || 'unknown'})`);
    });
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function buildTasksCompatibilityStub(domainKey = DEFAULT_DOMAIN_KEY, options = {}) {
  const lines = [
    '# Tasks',
    '',
    'Deprecated compatibility view.',
    '',
    `Active slice authority has moved to \`brain/${domainKey}/slices.json\` and \`brain/${domainKey}/slices.md\`.`,
    'Use `slices.md` for the human-readable active backlog.',
  ];
  const generatedBlock = String(options.generatedBlock || '').trim();
  if (generatedBlock) {
    lines.push('', generatedBlock);
  }
  lines.push('');
  return lines.join('\n');
}

function writeSliceArtifacts(rootPath, store, domainKey = DEFAULT_DOMAIN_KEY) {
  const normalizedStore = {
    version: SLICE_STORE_VERSION,
    updatedAt: store.updatedAt || nowIso(),
    slices: (Array.isArray(store.slices) ? store.slices : []).map((slice, index) => normalizeSliceRecord(slice, { index: index + 1 })),
  };
  const canonicalRoot = sliceRoot(rootPath, domainKey);
  fs.mkdirSync(canonicalRoot, { recursive: true });
  const legacyRoot = path.dirname(legacyTasksCompatibilityPath(rootPath, domainKey));
  fs.mkdirSync(legacyRoot, { recursive: true });
  fs.writeFileSync(sliceStorePath(rootPath, domainKey), `${JSON.stringify(normalizedStore, null, 2)}\n`, 'utf8');
  fs.writeFileSync(sliceMarkdownPath(rootPath, domainKey), renderSlicesMarkdown(normalizedStore), 'utf8');
  const preservedTasksBlock = extractArchivistWritebackBlock(fs.existsSync(tasksCompatibilityPath(rootPath, domainKey))
    ? fs.readFileSync(tasksCompatibilityPath(rootPath, domainKey), 'utf8')
    : '')
    || extractArchivistWritebackBlock(fs.existsSync(legacyTasksCompatibilityPath(rootPath, domainKey))
      ? fs.readFileSync(legacyTasksCompatibilityPath(rootPath, domainKey), 'utf8')
      : '');
  const tasksStub = buildTasksCompatibilityStub(domainKey, { generatedBlock: preservedTasksBlock });
  fs.writeFileSync(tasksCompatibilityPath(rootPath, domainKey), tasksStub, 'utf8');
  fs.writeFileSync(legacyTasksCompatibilityPath(rootPath, domainKey), tasksStub, 'utf8');
  return normalizedStore;
}

function buildCardFromSlice(slice = {}, existingCard = {}) {
  const normalized = normalizeSliceRecord(slice, existingCard);
  return {
    ...existingCard,
    ...normalized,
    desk: existingCard.desk || null,
    state: existingCard.state || null,
  };
}

function projectBoardFromSlices(store = defaultSliceStore(), board = {}, activePageId = null) {
  const existingCards = Array.isArray(board.cards) ? board.cards.filter(Boolean) : [];
  const byId = new Map(existingCards.map((card) => [String(card.id), card]));
  const cards = (Array.isArray(store.slices) ? store.slices : []).map((slice) => buildCardFromSlice(slice, byId.get(String(slice.id)) || {
    pageId: slice.pageId || activePageId || null,
  }));
  const selectedCardId = cards.some((card) => card.id === board.selectedCardId)
    ? board.selectedCardId
    : (cards[0]?.id || null);
  return {
    ...board,
    cards,
    selectedCardId,
    updatedAt: store.updatedAt || board.updatedAt || null,
    sliceAuthority: 'repo',
  };
}

module.exports = {
  DEFAULT_DOMAIN_KEY,
  SLICE_STORE_VERSION,
  buildSliceStoreFromCards,
  buildTasksCompatibilityStub,
  cardToSliceRecord,
  defaultSliceStore,
  normalizeSliceRecord,
  projectBoardFromSlices,
  readSliceStore,
  renderSlicesMarkdown,
  sliceMarkdownPath,
  sliceStorePath,
  tasksCompatibilityPath,
  writeSliceArtifacts,
};
