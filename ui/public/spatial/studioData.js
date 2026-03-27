const STATIONS = [
  {
    id: 'context-manager',
    name: 'Context Manager',
    shortLabel: 'Context',
    role: 'Curates project context, live constraints, and working memory for the rest of ACE.',
    responsibility: 'books / archive / memory terminal',
    scope: ['context', 'constraint', 'memory', 'intent', 'brief'],
    theme: { accent: '#66c7ff', shadow: 'rgba(64, 133, 184, 0.38)' },
    position: { x: 16, y: 18 },
  },
  {
    id: 'planner',
    name: 'Planner',
    shortLabel: 'Planner',
    role: 'Breaks intent into sequences, milestones, and queued execution steps.',
    responsibility: 'whiteboard / sticky notes / task desk',
    scope: ['task', 'plan', 'todo', 'roadmap', 'flow'],
    theme: { accent: '#ffd36e', shadow: 'rgba(180, 132, 54, 0.38)' },
    position: { x: 54, y: 18 },
  },
  {
    id: 'executor',
    name: 'Executor',
    shortLabel: 'Exec',
    role: 'Owns build-facing delivery, implementation throughput, and task completion.',
    responsibility: 'terminal / build station',
    scope: ['build', 'implement', 'file', 'module', 'code', 'service'],
    theme: { accent: '#5ce29f', shadow: 'rgba(49, 132, 94, 0.38)' },
    position: { x: 16, y: 56 },
  },
  {
    id: 'memory-archivist',
    name: 'Memory Archivist',
    shortLabel: 'Archivist',
    role: 'Tracks saved notes, sketches, architecture snapshots, and historical decisions.',
    responsibility: 'filing system / repository shelves',
    scope: ['annotation', 'history', 'decision', 'archive', 'snapshot'],
    theme: { accent: '#d2a3ff', shadow: 'rgba(126, 87, 160, 0.38)' },
    position: { x: 54, y: 56 },
  },
  {
    id: 'qa-lead',
    name: 'QA / Test Lead',
    shortLabel: 'QA',
    role: 'Runs suites, surfaces evidence, and rates test quality across desks.',
    responsibility: 'report wall / evidence bench',
    scope: ['qa', 'test', 'scorecard', 'browser', 'evidence'],
    theme: { accent: '#7dd6c8', shadow: 'rgba(78, 157, 145, 0.38)' },
    position: { x: 50, y: 35 },
  },
  {
    id: 'cto-architect',
    name: 'CTO / Architect',
    shortLabel: 'CTO',
    role: 'Supervises ACE self-updates, guardrails, architecture boundaries, and review gates.',
    responsibility: 'control desk / oversight station',
    scope: ['architecture', 'rule', 'governance', 'review', 'ace'],
    theme: { accent: '#ff8f7a', shadow: 'rgba(166, 86, 72, 0.42)' },
    position: { x: 74, y: 35 },
    isOversight: true,
  },
];

const DESK_MISSIONS = {
  'context-manager': 'Maintain active page focus, context confidence, and desk-specific context slices.',
  planner: 'Translate active context into concrete plans, work items, and dependency-aware handoffs.',
  executor: 'Apply validated packages, run preflight, and deploy low-risk changes without stalling the flow.',
  'memory-archivist': 'Persist useful summaries, artifact references, and history for active work.',
  'qa-lead': 'Run QA suites, expose evidence, and score test quality for current ACE surfaces.',
  'cto-architect': 'Monitor guardrails, conflicts, and risk-gated mutation approvals across the desk network.',
};

function uniqueStrings(values = []) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

const DESK_ALLOWED_ACTIONS = {
  'context-manager': ['set-active-page', 'slice-context', 'publish-handoff', 'flag-ambiguity'],
  planner: ['expand-plan', 'prioritise-work', 'publish-plan'],
  executor: ['apply-package', 'run-preflight', 'deploy-runtime', 'report-blocker'],
  'memory-archivist': ['archive-summary', 'record-artifact', 'snapshot-history'],
  'qa-lead': ['run-structured-qa', 'run-browser-pass', 'inspect-scorecards', 'inspect-artifacts'],
  'cto-architect': ['raise-conflict', 'approve-apply', 'reject-risky-change'],
};

function defaultPlannerWorkerState() {
  return {
    status: 'idle',
    statusReason: null,
    mode: 'auto',
    backend: 'ollama',
    model: 'mistral:latest',
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
    backend: 'ollama',
    model: 'mistral:latest',
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
    backend: 'ollama',
    model: 'mistral:latest',
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

function normalizeAgentWorkersState(agentWorkers = {}) {
  const defaults = {
    'context-manager': defaultContextManagerWorkerState(),
    executor: defaultExecutorWorkerState(),
    planner: defaultPlannerWorkerState(),
  };
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
        ? [...new Set(agentWorkers.executor.lastAssessmentBlockers.filter(Boolean))]
        : [],
    },
    planner: {
      ...defaults.planner,
      ...(agentWorkers?.planner || {}),
      lastProducedCardIds: Array.isArray(agentWorkers?.planner?.lastProducedCardIds)
        ? [...new Set(agentWorkers.planner.lastProducedCardIds.filter(Boolean))]
        : [],
      proposalArtifactRefs: Array.isArray(agentWorkers?.planner?.proposalArtifactRefs)
        ? [...new Set(agentWorkers.planner.proposalArtifactRefs.filter(Boolean))]
        : [],
    },
  };
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function latestIntentReport(workspace) {
  return workspace.intentState?.contextReport || workspace.intentState?.latest || workspace.intentState?.reports?.[0] || null;
}

function systemGraphOf(workspace = {}) {
  return workspace.graphs?.system || workspace.graph || { nodes: [], edges: [] };
}

export function createDefaultPage({ id = null, title = 'Current Page', sourceNodeId = null, createdAt = null } = {}) {
  const now = createdAt || new Date().toISOString();
  return {
    id: id || makeId('page'),
    title,
    status: 'active',
    sourceNodeId,
    summary: 'Notebook page for current studio work.',
    outputs: [],
    handoffs: [],
    artifactRefs: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeNotebookState(workspace = {}) {
  const latestIntent = latestIntentReport(workspace);
  const systemGraph = systemGraphOf(workspace);
  const savedPages = Array.isArray(workspace.pages) ? workspace.pages.filter(Boolean) : [];
  const fallbackTitle = latestIntent?.summary ? latestIntent.summary.slice(0, 48) : 'Current Page';
  const pages = savedPages.length
    ? savedPages.map((page) => ({
        outputs: [],
        handoffs: [],
        artifactRefs: [],
        ...page,
      }))
    : [createDefaultPage({
        title: fallbackTitle,
        sourceNodeId: latestIntent?.nodeId || systemGraph.nodes?.[0]?.id || null,
      })];
  const activePageId = pages.some((page) => page.id === workspace.activePageId)
    ? workspace.activePageId
    : pages[0].id;
  return {
    pages,
    activePageId,
    activePage: pages.find((page) => page.id === activePageId) || pages[0],
  };
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || 'task';
}

export function createDefaultTeamBoard() {
  return {
    cards: [],
    selectedCardId: null,
    updatedAt: null,
    summary: {
      plan: 0,
      active: 0,
      complete: 0,
      review: 0,
      assigned: 0,
      handedOff: 0,
      binned: 0,
      idleWorkers: 0,
    },
  };
}

const TASK_PHASES = new Set(['captured', 'planned', 'active', 'handed_off']);
const TASK_ASSIGNMENT_STATES = new Set(['unassigned', 'assigned', 'claimed']);

function taskPhaseLabel(phase) {
  const labels = {
    captured: 'Captured',
    planned: 'Planned',
    active: 'Active',
    handed_off: 'Handed off',
  };
  return labels[phase] || 'Planned';
}

function taskAssignmentLabel(state) {
  const labels = {
    unassigned: 'Unassigned',
    assigned: 'Assigned',
    claimed: 'Claimed',
  };
  return labels[state] || 'Unassigned';
}

function createTaskFlowEntry({
  phase = 'planned',
  assignmentState = 'unassigned',
  ownerDeskId = null,
  assigneeDeskId = null,
  label = '',
  note = '',
  at = null,
} = {}) {
  return {
    phase: TASK_PHASES.has(phase) ? phase : 'planned',
    assignmentState: TASK_ASSIGNMENT_STATES.has(assignmentState) ? assignmentState : 'unassigned',
    ownerDeskId: ownerDeskId || null,
    assigneeDeskId: assigneeDeskId || null,
    label: label || taskPhaseLabel(phase),
    note: note || '',
    at: at || null,
  };
}

function normalizeTaskFlow(taskFlow = {}, fallback = {}) {
  const history = Array.isArray(taskFlow.history)
    ? taskFlow.history.filter(Boolean).map((entry) => createTaskFlowEntry(entry))
    : [];
  const phase = TASK_PHASES.has(taskFlow.phase)
    ? taskFlow.phase
    : (TASK_PHASES.has(fallback.phase) ? fallback.phase : 'planned');
  const assignmentState = TASK_ASSIGNMENT_STATES.has(taskFlow.assignmentState)
    ? taskFlow.assignmentState
    : (TASK_ASSIGNMENT_STATES.has(fallback.assignmentState) ? fallback.assignmentState : 'unassigned');
  return {
    phase,
    assignmentState,
    ownerDeskId: taskFlow.ownerDeskId || fallback.ownerDeskId || null,
    assigneeDeskId: taskFlow.assigneeDeskId || fallback.assigneeDeskId || null,
    sourceIntentId: taskFlow.sourceIntentId || fallback.sourceIntentId || null,
    sourceHandoffId: taskFlow.sourceHandoffId || fallback.sourceHandoffId || null,
    lastTransitionAt: taskFlow.lastTransitionAt || fallback.lastTransitionAt || history[0]?.at || null,
    lastTransitionLabel: taskFlow.lastTransitionLabel || fallback.lastTransitionLabel || taskPhaseLabel(phase),
    history,
  };
}

function transitionTaskFlow(taskFlow = {}, next = {}, fallback = {}) {
  const current = normalizeTaskFlow(taskFlow, fallback);
  const nextPhase = TASK_PHASES.has(next.phase) ? next.phase : current.phase;
  const nextAssignmentState = TASK_ASSIGNMENT_STATES.has(next.assignmentState) ? next.assignmentState : current.assignmentState;
  const nextOwnerDeskId = next.ownerDeskId !== undefined ? (next.ownerDeskId || null) : current.ownerDeskId;
  const nextAssigneeDeskId = next.assigneeDeskId !== undefined ? (next.assigneeDeskId || null) : current.assigneeDeskId;
  const nextAt = next.at || current.lastTransitionAt || null;
  const nextLabel = next.label || taskPhaseLabel(nextPhase);
  const nextEntry = createTaskFlowEntry({
    phase: nextPhase,
    assignmentState: nextAssignmentState,
    ownerDeskId: nextOwnerDeskId,
    assigneeDeskId: nextAssigneeDeskId,
    label: nextLabel,
    note: next.note || '',
    at: nextAt,
  });
  const head = current.history[0] || null;
  const shouldAppend = !head
    || head.phase !== nextEntry.phase
    || head.assignmentState !== nextEntry.assignmentState
    || head.ownerDeskId !== nextEntry.ownerDeskId
    || head.assigneeDeskId !== nextEntry.assigneeDeskId
    || head.label !== nextEntry.label
    || head.note !== nextEntry.note;
  return {
    ...current,
    phase: nextPhase,
    assignmentState: nextAssignmentState,
    ownerDeskId: nextOwnerDeskId,
    assigneeDeskId: nextAssigneeDeskId,
    lastTransitionAt: nextEntry.at,
    lastTransitionLabel: nextEntry.label,
    history: shouldAppend ? [nextEntry, ...current.history].slice(0, 8) : current.history,
  };
}

function nextTeamBoardTaskId(cards = []) {
  const maxId = (cards || []).reduce((highest, card) => {
    const value = Number.parseInt(String(card?.id || ''), 10);
    return Number.isFinite(value) ? Math.max(highest, value) : highest;
  }, 0);
  return String(maxId + 1).padStart(4, '0');
}

function normalizeBoardStatus(status) {
  if (status === 'planned') return 'plan';
  if (status === 'ready') return 'plan';
  return ['plan', 'active', 'complete', 'review', 'binned'].includes(status) ? status : 'plan';
}

function cardSourceKey(pageId, title) {
  return `${pageId}:${slugify(title)}`;
}

function defaultExecutionPackage(card = {}) {
  return {
    status: 'idle',
    taskId: card.builderTaskId || card.runnerTaskId || null,
    taskDir: null,
    patchPath: null,
    changedFiles: [],
    targetProjectKey: card.targetProjectKey || 'ace-self',
    expectedAction: 'apply',
    summary: '',
  };
}

function deriveCardDesk(card = {}) {
  if (card.status === 'binned') return 'Bin';
  if (card.status === 'plan') return 'Planner';
  if (card.status === 'active') return 'Builder';
  if (card.status === 'review') return 'CTO';
  if (['queued', 'applying', 'applied', 'failed'].includes(card.applyStatus) || ['queued', 'deploying', 'deployed', 'flagged', 'failed'].includes(card.deployStatus)) {
    return 'Executor';
  }
  if (card.executionPackage?.status === 'ready') return 'Builder';
  return 'Archivist';
}

function deriveCardState(card = {}) {
  if (card.status === 'binned') return 'Binned';
  if (card.status === 'plan') return 'Ready';
  if (card.status === 'active') {
    if (card.approvalState === 'rejected') return 'Needs builder revision';
    if (card.executionPackage?.status === 'failed') return 'Builder failed';
    return 'Building package';
  }
  if (card.status === 'review') {
    if (card.deployStatus === 'flagged' || card.deployStatus === 'failed' || card.applyStatus === 'failed') return 'Flagged';
    return 'Approval required';
  }
  if (card.status === 'complete') {
    if (card.deployStatus === 'deploying') return 'Deploying';
    if (card.deployStatus === 'deployed') return 'Deployed';
    if (card.deployStatus === 'flagged' || card.deployStatus === 'failed') return 'Flagged';
    if (card.applyStatus === 'applying') return 'Applying';
    if (card.applyStatus === 'applied') return card.targetProjectKey === 'ace-self' ? 'Applied, awaiting deploy' : 'Applied';
    if (card.applyStatus === 'queued') return 'Queued for apply';
    if (card.executionPackage?.status === 'ready') return 'Package ready';
    return 'Complete';
  }
  return 'Ready';
}

function createTeamBoardCard({ cards = [], pageId, handoffId, sourceNodeId, sourceAnchorRefs = [], title, createdAt = null }) {
  const now = createdAt || new Date().toISOString();
  const capturedFlow = createTaskFlowEntry({
    phase: 'captured',
    assignmentState: 'unassigned',
    ownerDeskId: 'context-manager',
    assigneeDeskId: 'planner',
    label: 'Captured from intent',
    note: title,
    at: now,
  });
  return {
    id: nextTeamBoardTaskId(cards),
    sourceKey: cardSourceKey(pageId, title),
    pageId,
    sourceHandoffId: handoffId || null,
    sourceNodeId: sourceNodeId || null,
    sourceIntentId: sourceNodeId || null,
    sourceAnchorRefs: Array.isArray(sourceAnchorRefs) ? sourceAnchorRefs.filter(Boolean) : [],
    title,
    status: 'plan',
    desk: 'Planner',
    state: 'Ready',
    phaseTicks: 0,
    taskFlow: transitionTaskFlow({
      phase: 'captured',
      assignmentState: 'unassigned',
      ownerDeskId: 'context-manager',
      assigneeDeskId: 'planner',
      sourceIntentId: sourceNodeId || null,
      sourceHandoffId: handoffId || null,
      lastTransitionAt: now,
      lastTransitionLabel: 'Captured from intent',
      history: [capturedFlow],
    }, {
      phase: 'planned',
      assignmentState: 'unassigned',
      ownerDeskId: 'planner',
      assigneeDeskId: 'executor',
      label: 'Moved to planner board',
      at: now,
      note: title,
    }),
    targetProjectKey: 'ace-self',
    builderTaskId: null,
    runnerTaskId: null,
    runIds: [],
    artifactRefs: [],
    executionPackage: defaultExecutionPackage(),
    riskLevel: 'unknown',
    riskReasons: [],
    approvalState: 'none',
    applyStatus: 'idle',
    deployStatus: 'idle',
    branch: null,
    commit: null,
    lastHealth: null,
    auditSessionId: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeTeamBoardState(workspace = {}) {
  const board = workspace?.studio?.teamBoard || createDefaultTeamBoard();
  const handoff = workspace?.studio?.handoffs?.contextToPlanner || null;
  const plannerWorker = normalizeAgentWorkersState(workspace?.studio?.agentWorkers).planner;
  const cards = Array.isArray(board.cards) ? board.cards.filter(Boolean).map((card) => {
    const fallbackTaskFlow = {
      phase: card.status === 'active' ? 'active' : (card.status === 'complete' || card.status === 'review' ? 'handed_off' : 'planned'),
      assignmentState: card.status === 'active' ? 'assigned' : (card.status === 'complete' || card.status === 'review' ? 'claimed' : 'unassigned'),
      ownerDeskId: card.status === 'active' || card.status === 'complete' || card.status === 'review' ? 'executor' : 'planner',
      assigneeDeskId: 'executor',
      sourceIntentId: card.sourceIntentId || card.sourceNodeId || null,
      sourceHandoffId: card.sourceHandoffId || null,
      lastTransitionAt: card.updatedAt || card.createdAt || null,
    };
    const normalizedCard = {
    ...card,
    status: normalizeBoardStatus(card.status),
    sourceKey: card.sourceKey || cardSourceKey(card.pageId || 'page', card.title || 'task'),
    phaseTicks: Number(card.phaseTicks || 0),
    targetProjectKey: card.targetProjectKey || 'ace-self',
    sourceAnchorRefs: Array.isArray(card.sourceAnchorRefs) ? card.sourceAnchorRefs.filter(Boolean) : [],
    sourceIntentId: card.sourceIntentId || card.sourceNodeId || null,
    builderTaskId: card.builderTaskId || card.runnerTaskId || null,
    runnerTaskId: card.runnerTaskId || null,
    runIds: Array.isArray(card.runIds) ? card.runIds.filter(Boolean) : [],
    artifactRefs: Array.isArray(card.artifactRefs) ? card.artifactRefs.filter(Boolean) : [],
    executionPackage: {
      ...defaultExecutionPackage(card),
      ...(card.executionPackage || {}),
      changedFiles: Array.isArray(card.executionPackage?.changedFiles) ? card.executionPackage.changedFiles.filter(Boolean) : [],
      targetProjectKey: card.executionPackage?.targetProjectKey || card.targetProjectKey || 'ace-self',
    },
    riskLevel: card.riskLevel || 'unknown',
    riskReasons: Array.isArray(card.riskReasons) ? card.riskReasons.filter(Boolean) : [],
    approvalState: card.approvalState || 'none',
    applyStatus: card.applyStatus || 'idle',
    deployStatus: card.deployStatus || 'idle',
    branch: card.branch || null,
    commit: card.commit || null,
    lastHealth: card.lastHealth || null,
    auditSessionId: card.auditSessionId || null,
    desk: card.desk || deriveCardDesk(card),
    state: card.state || deriveCardState(card),
    taskFlow: normalizeTaskFlow(card.taskFlow, fallbackTaskFlow),
    };
    return normalizedCard;
  }) : [];
  const selectedCard = cards.find((card) => card.id === board.selectedCardId) || null;
  return {
    cards,
    selectedCardId: selectedCard?.id || null,
    updatedAt: new Date().toISOString(),
    summary: {
      plan: cards.filter((card) => card.status === 'plan').length,
      active: cards.filter((card) => card.status === 'active').length,
      complete: cards.filter((card) => card.status === 'complete').length,
      review: cards.filter((card) => card.status === 'review').length,
      assigned: cards.filter((card) => card.taskFlow?.assignmentState === 'assigned').length,
      handedOff: cards.filter((card) => card.taskFlow?.phase === 'handed_off').length,
      binned: cards.filter((card) => card.status === 'binned').length,
      idleWorkers: Number(board.summary?.idleWorkers || 0),
    },
  };
}

function getActiveMutationCard(boardOrWorkspace = {}) {
  const board = Array.isArray(boardOrWorkspace?.cards) ? boardOrWorkspace : normalizeTeamBoardState(boardOrWorkspace);
  return board.cards.find((card) => (
    ['queued', 'applying', 'applied'].includes(card.applyStatus)
    || ['queued', 'deploying', 'deployed', 'flagged', 'failed'].includes(card.deployStatus)
    || card.approvalState === 'approved'
  )) || null;
}

function getSelectedExecutionCard(workspace = {}) {
  const board = Array.isArray(workspace?.cards) ? workspace : normalizeTeamBoardState(workspace);
  return board.cards.find((card) => card.id === board.selectedCardId) || getActiveMutationCard(board) || null;
}

function collectConstraints(report, dashboardState) {
  const blockers = Array.isArray(report?.projectContext?.blockers) ? report.projectContext.blockers : [];
  const dashboardBlockers = Array.isArray(dashboardState?.blockers) ? dashboardState.blockers : [];
  const packetConstraints = Array.isArray(report?.contextPacket?.constraints) ? report.contextPacket.constraints : [];
  const lowCriteria = (report?.criteria || [])
    .filter((criterion) => Number(criterion.score || 0) < 0.55)
    .map((criterion) => `${criterion.label}: ${criterion.reason || 'Needs clarification.'}`);
  return [...new Set([...blockers, ...dashboardBlockers, ...packetConstraints, ...lowCriteria])].slice(0, 8);
}

export function createPlannerHandoff(report, dashboardState = {}, previousHandoff = null) {
  if (!report) return null;
  const requestedOutcomes = uniqueStrings(
    Array.isArray(report.requestedOutcomes) && report.requestedOutcomes.length
      ? report.requestedOutcomes
      : (Array.isArray(report.tasks) && report.tasks.length
        ? report.tasks
        : (Array.isArray(report.truth?.requestedOutcomes) && report.truth.requestedOutcomes.length
          ? report.truth.requestedOutcomes
          : (Array.isArray(report.truth?.tasks) ? report.truth.tasks : []))),
  ).slice(0, 4);
  const constraints = collectConstraints(report, dashboardState);
  const clarifications = Array.isArray(report?.contextPacket?.clarifications)
    ? report.contextPacket.clarifications.filter(Boolean)
    : [];
  if (Number(report.confidence || 0) < 0.55) clarifications.push('Intent confidence is low and should be checked before execution expands.');
  if (!requestedOutcomes.length) clarifications.push('No concrete requested outcomes were extracted from the latest context input.');
  if (!report.projectContext?.matchedTerms?.length) clarifications.push('Project alignment is weak, so planner scope may need refinement.');
  const rationale = (report.criteria || [])
    .slice(0, 3)
    .map((criterion) => `${criterion.label} ${Math.round((criterion.score || 0) * 100)}%`)
    .join(', ');
  const problemStatement = [
    `Goal: ${report.summary || 'Clarify the next problem to solve.'}`,
    requestedOutcomes.length ? `Requested outcomes: ${requestedOutcomes.join('; ')}.` : 'Requested outcomes: no concrete task list extracted yet.',
    rationale ? `Why ACE believes this: ${rationale}.` : null,
    constraints.length ? `Constraints and review signals: ${constraints.join(' | ')}.` : 'Constraints and review signals: none surfaced from the latest report.',
    clarifications.length ? `Still unclear: ${clarifications.join(' ')}` : 'Still unclear: no immediate clarification requested.',
  ].filter(Boolean).join('\n');

  return {
    id: previousHandoff?.sourceNodeId === report.nodeId ? (previousHandoff.id || makeId('handoff')) : makeId('handoff'),
    sourceAgentId: 'context-manager',
    targetAgentId: 'planner',
    createdAt: report.createdAt || new Date().toISOString(),
    sourceNodeId: report.nodeId || null,
    summary: report.summary || 'Intent ready for planner review.',
    problemStatement,
    anchorRefs: Array.isArray(report.anchorRefs) ? report.anchorRefs.filter(Boolean) : [],
    goal: report.goal || report.truth?.goal || report.summary || '',
    requestedOutcomes,
    tasks: requestedOutcomes,
    constraints,
    confidence: Number(report.confidence || 0),
    criteria: Array.isArray(report.criteria) ? report.criteria : [],
    truth: report.truth || null,
    scores: report.scores || null,
    classification: report.classification || { role: 'context', labels: [] },
    requestType: report.requestType || report.truth?.requestType || 'context_request',
    urgency: report.urgency || report.truth?.urgency || 'normal',
    targets: Array.isArray(report.targets) ? report.targets.slice(0, 8) : [],
    signals: report.signals || report.truth?.signals || null,
    status: clarifications.length ? 'needs-clarification' : 'ready',
  };
}

function recentRunSummary(runs) {
  return (runs || []).slice(0, 3).map((run) => {
    const target = [run.action, run.payload?.taskId].filter(Boolean).join(' ');
    return `${run.status}: ${target || 'pipeline event'}`;
  });
}

function summarizeRunLog(run) {
  const events = run?.logs || [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const raw = `${event?.message || ''} ${event?.text || ''}`.trim();
    if (!raw) continue;
    const line = raw.split(/\\r?\\n/).map((entry) => entry.trim()).filter(Boolean)[0];
    if (line) return line.slice(0, 140);
  }
  return null;
}

function runMatchesAgent(agentId, run) {
  const action = String(run?.action || '').toLowerCase();
  if (agentId === 'context-manager') return ['scan', 'manage'].includes(action);
  if (agentId === 'planner') return action === 'manage';
  if (agentId === 'executor') return ['build', 'run', 'apply'].includes(action);
  if (agentId === 'cto-architect') return ['apply', 'manage'].includes(action);
  if (agentId === 'memory-archivist') return Boolean(run?.artifacts?.length);
  return false;
}

function latestRunSignal(agentId, runs) {
  const run = (runs || []).find((entry) => runMatchesAgent(agentId, entry)) || null;
  if (!run) return null;
  return {
    runId: run.runId,
    status: run.status,
    action: run.action,
    summary: summarizeRunLog(run) || `${run.status}: ${run.action}`,
  };
}

function countIdleWorkers(deskStates = {}) {
  return ['planner', 'executor']
    .filter((deskId) => ['waiting', 'ready'].includes(deskStates?.[deskId]?.localState))
    .length;
}

function isPlannerFeedbackActive(plannerToContext = null, handoff = null) {
  if (!plannerToContext) return false;
  if (!handoff?.id) return true;
  return !plannerToContext.sourceHandoffId || plannerToContext.sourceHandoffId === handoff.id;
}

function deriveDeskLocalState(workItems = [], blockedReason = null) {
  if (blockedReason || workItems.some((item) => item.status === 'blocked')) return 'blocked';
  if (workItems.some((item) => item.status === 'running')) return 'running';
  if (workItems.some((item) => item.status === 'ready')) return 'ready';
  return 'waiting';
}

function buildDeskStatusLabel({ deskId, localState, handoff, plannerToContext = null, contextWorker = {}, plannerWorker = {}, workItems = [] }) {
  const plannerFeedbackActive = isPlannerFeedbackActive(plannerToContext, handoff);
  if (deskId === 'context-manager') {
    if (contextWorker.status === 'running') return 'Refreshing context';
    if (plannerFeedbackActive) return plannerToContext?.action === 'bin-candidate' ? 'Reviewing bin candidate' : 'Retrying context';
    if (handoff?.status === 'needs-clarification') return 'Clarification needed';
    if (handoff?.id) return 'Context published';
    return 'Idle';
  }
  if (deskId === 'planner') {
    if (plannerWorker.status === 'running') return 'Planning';
    if (plannerFeedbackActive) return plannerToContext?.action === 'bin-candidate' ? 'Bin candidate' : 'Needs context retry';
    if (handoff?.status === 'needs-clarification') return 'Needs clarification';
    if (workItems.some((item) => item.kind === 'planned-card')) return 'Cards ready';
    if (workItems.some((item) => item.kind === 'planner-ready-handoff')) return 'Handoff ready';
    return localState === 'ready' ? 'Queued' : 'Idle';
  }
  if (deskId === 'executor') {
    if (localState === 'blocked') return 'Execution gated';
    if (localState === 'running') return 'Executing';
    if (localState === 'ready') return 'Ready to execute';
    return 'Idle';
  }
  if (deskId === 'qa-lead') {
    return 'QA wall';
  }
  if (deskId === 'cto-architect') {
    if (localState === 'blocked') return 'Reviewing blockers';
    if (localState === 'running') return 'Governing';
    if (localState === 'ready') return 'Approval queued';
    return 'Idle';
  }
  return localState === 'running' ? 'Processing' : (localState === 'ready' ? 'Queued' : 'Idle');
}

function buildDeskStatusDetail({ deskId, localState, handoff, plannerToContext = null, contextWorker = {}, plannerWorker = {}, workItems = [] }) {
  const plannerFeedbackActive = isPlannerFeedbackActive(plannerToContext, handoff);
  if (deskId === 'context-manager') {
    if (contextWorker.status === 'running') return contextWorker.statusReason || 'Drafting a planner-facing context packet.';
    if (plannerFeedbackActive) return plannerToContext?.detail || 'Planner requested a tighter context retry.';
    if (handoff?.status === 'needs-clarification') return 'The current planner handoff still needs clarification before planning can proceed.';
    if (handoff?.id) return 'The latest context packet has been published and is waiting on downstream use.';
    return 'Waiting for the next source context input.';
  }
  if (deskId === 'planner') {
    if (plannerWorker.status === 'running') return plannerWorker.statusReason || 'Sequencing anchored plan cards from the current handoff.';
    if (plannerFeedbackActive) return plannerToContext?.detail || 'Planner is blocked on context follow-up.';
    if (handoff?.status === 'needs-clarification') return 'Planner cannot decompose work until the current handoff is clarified.';
    if (workItems.some((item) => item.kind === 'planned-card')) {
      const producedCount = workItems.filter((item) => item.kind === 'planned-card').length;
      return `${producedCount} anchored plan card${producedCount === 1 ? '' : 's'} are ready for downstream review.`;
    }
    if (workItems.some((item) => item.kind === 'planner-ready-handoff')) return 'A planner-ready handoff is queued for decomposition.';
    return 'Planner is waiting for the next context handoff.';
  }
  if (deskId === 'executor') {
    return localState === 'blocked'
      ? 'Execution cannot advance until review gates or context blockers clear.'
      : (localState === 'ready' ? 'A reviewed package is waiting for executor work.' : 'Executor is idle.');
  }
  if (deskId === 'qa-lead') {
    return 'QA remains read-only in v1 and surfaces suite evidence, browser runs, and scorecards without joining orchestrator task ownership.';
  }
  if (deskId === 'cto-architect') {
    return localState === 'ready'
      ? 'A review or approval gate is waiting on governance.'
      : 'Governance is monitoring active desks and mutation risk.';
  }
  return localState === 'running'
    ? 'Desk is actively processing work.'
    : 'Desk is waiting for the next assignment.';
}

function advanceTeamBoardState({ workspace, handoff, board, deskStates = {}, conflicts = [], runs = [] }) {
  const now = new Date().toISOString();
  const latestIntent = latestIntentReport(workspace);
  const selfUpgrade = workspace?.studio?.selfUpgrade || null;
  const latestExecutorRun = (runs || []).find((run) => ['build', 'run', 'apply'].includes(String(run?.action || '').toLowerCase())) || null;
  const reviewGate = handoff?.status === 'needs-clarification'
    || conflicts.some((conflict) => conflict.severity === 'high')
    || selfUpgrade?.status === 'ready-to-apply'
    || Number(latestIntent?.confidence || 0) < 0.55;
  let openActiveSlots = Math.max(0, 2 - board.cards.filter((card) => normalizeBoardStatus(card.status) === 'active').length);
  const cards = [...board.cards]
    .sort((left, right) => String(left.createdAt || '').localeCompare(String(right.createdAt || '')))
    .map((card) => {
      const isSelected = card.id === board.selectedCardId;
      let status = normalizeBoardStatus(card.status);
      let phaseTicks = Number(card.phaseTicks || 0);
      let taskFlow = normalizeTaskFlow(card.taskFlow, {
        phase: status === 'active' ? 'active' : (status === 'complete' || status === 'review' ? 'handed_off' : 'planned'),
        assignmentState: status === 'active' ? 'assigned' : (status === 'complete' || status === 'review' ? 'claimed' : 'unassigned'),
        ownerDeskId: status === 'active' || status === 'complete' || status === 'review' ? 'executor' : 'planner',
        assigneeDeskId: 'executor',
        sourceIntentId: card.sourceIntentId || card.sourceNodeId || null,
        sourceHandoffId: card.sourceHandoffId || null,
        lastTransitionAt: card.updatedAt || card.createdAt || null,
      });
      if (isSelected) {
        return {
          ...card,
          status: 'review',
          desk: 'Worker',
          state: latestExecutorRun?.status === 'running' ? 'Running patch' : 'Queued for execution',
          taskFlow: transitionTaskFlow(taskFlow, {
            phase: 'handed_off',
            assignmentState: 'claimed',
            ownerDeskId: 'executor',
            assigneeDeskId: 'executor',
            label: 'Executor claimed task',
            at: now,
            note: card.title,
          }),
          updatedAt: now,
        };
      }
      if (status === 'plan' && handoff) {
        if ((card.sourceAnchorRefs || []).length === 0) {
          status = 'plan';
          phaseTicks = 0;
        } else if (openActiveSlots > 0) {
          status = 'active';
          phaseTicks = 0;
          openActiveSlots -= 1;
          taskFlow = transitionTaskFlow(taskFlow, {
            phase: 'active',
            assignmentState: 'assigned',
            ownerDeskId: 'planner',
            assigneeDeskId: 'executor',
            label: 'Placed into active',
            at: now,
            note: card.title,
          });
        } else {
          phaseTicks = 0;
        }
      } else if (status === 'active') {
        phaseTicks += 1;
        taskFlow = transitionTaskFlow(taskFlow, {
          phase: 'active',
          assignmentState: 'assigned',
          ownerDeskId: 'planner',
          assigneeDeskId: 'executor',
          label: 'Active on planner slab',
          at: now,
          note: card.title,
        });
        if (phaseTicks >= 1) {
          status = 'complete';
          phaseTicks = 0;
        }
      } else if (status === 'complete') {
        phaseTicks += 1;
        if (phaseTicks >= 1) {
          status = 'review';
          phaseTicks = 0;
        }
      } else {
        phaseTicks = 0;
      }
      return {
        ...card,
        status,
        phaseTicks,
        desk: deriveCardDesk({ ...card, status }),
        state: reviewGate && status === 'active'
          ? 'Clarifying'
          : deriveCardState({ ...card, status }),
        taskFlow,
        updatedAt: now,
      };
    });
  return {
    ...board,
    cards,
    updatedAt: now,
    summary: {
      plan: cards.filter((card) => card.status === 'plan').length,
      active: cards.filter((card) => card.status === 'active').length,
      complete: cards.filter((card) => card.status === 'complete').length,
      review: cards.filter((card) => card.status === 'review').length,
      assigned: cards.filter((card) => card.taskFlow?.assignmentState === 'assigned').length,
      handedOff: cards.filter((card) => card.taskFlow?.phase === 'handed_off').length,
      idleWorkers: countIdleWorkers(deskStates),
    },
  };
}

function matchesScope(agent, text) {
  return agent.scope.some((keyword) => text.includes(keyword));
}

function collectNodeMetrics(agent, graph, workspace) {
  const nodes = (graph?.nodes || []).filter((node) => {
    const content = `${node.type} ${node.content || ''}`.toLowerCase();
    return matchesScope(agent, content);
  });
  const latestIntent = latestIntentReport(workspace);
  if (agent.id === 'planner' && (latestIntent?.requestedOutcomes || latestIntent?.tasks || []).length) {
    return {
      nodes,
      count: Math.max(nodes.length, latestIntent.tasks.length),
      queue: Math.max(0, latestIntent.tasks.length - 1),
    };
  }
  if (agent.id === 'executor' && (latestIntent?.requestedOutcomes || latestIntent?.tasks || []).length) {
    return {
      nodes,
      count: Math.max(nodes.length, Math.min(2, latestIntent.tasks.length)),
      queue: Math.max(0, latestIntent.tasks.length - 2),
    };
  }
  return {
    nodes,
    count: nodes.length,
    queue: Math.max(0, nodes.length - 1),
  };
}

function buildDeskWorkItems(agentId, workspace, notebook, handoff, selectedExecutionCard = null) {
  const latestIntent = latestIntentReport(workspace);
  const board = normalizeTeamBoardState(workspace);
  const workers = normalizeAgentWorkersState(workspace?.studio?.agentWorkers);
  const contextWorker = workers['context-manager'];
  const plannerWorker = workers.planner;
  const plannerToContext = workspace?.studio?.handoffs?.plannerToContext || null;
  if (agentId === 'context-manager') {
    if (contextWorker.status === 'running') {
      return [{
        id: makeId('work'),
        pageId: notebook.activePageId,
        deskId: agentId,
        kind: 'context-run',
        status: 'running',
        dependsOn: [],
        conflictTags: ['context', 'worker'],
        artifactRefs: contextWorker.currentRunId ? [contextWorker.currentRunId] : [],
        anchorRefs: handoff?.anchorRefs || plannerToContext?.anchorRefs || [],
        title: latestIntent?.summary || 'Refreshing context packet for Planner.',
      }];
    }
    if (isPlannerFeedbackActive(plannerToContext, handoff)) {
      return [{
        id: makeId('work'),
        pageId: notebook.activePageId,
        deskId: agentId,
        kind: 'context-retry',
        status: 'ready',
        dependsOn: handoff?.id ? [handoff.id] : [],
        conflictTags: ['context', 'context-retry'],
        artifactRefs: [],
        anchorRefs: plannerToContext.anchorRefs || handoff?.anchorRefs || [],
        title: plannerToContext.summary || 'Planner requested a tighter context packet.',
      }];
    }
    if (handoff?.status === 'needs-clarification') {
      return [{
        id: makeId('work'),
        pageId: notebook.activePageId,
        deskId: agentId,
        kind: 'context-clarification',
        status: 'ready',
        dependsOn: [],
        conflictTags: ['context', 'clarification'],
        artifactRefs: handoff ? [handoff.id] : [],
        anchorRefs: handoff?.anchorRefs || [],
        title: handoff.summary || latestIntent?.summary || 'Clarify the planner handoff before planning resumes.',
      }];
    }
    return [{
      id: makeId('work'),
      pageId: notebook.activePageId,
      deskId: agentId,
      kind: handoff ? 'context-published' : 'context-watch',
      status: 'waiting',
      dependsOn: [],
      conflictTags: ['context'],
      artifactRefs: handoff ? [handoff.id] : [],
      anchorRefs: handoff?.anchorRefs || [],
      title: handoff?.summary || latestIntent?.summary || 'Waiting for source context',
    }];
  }
  if (agentId === 'planner') {
    if (!handoff) {
      return [{
        id: makeId('work'),
        pageId: notebook.activePageId,
        deskId: agentId,
        kind: 'planner-awaiting-handoff',
        status: 'waiting',
        dependsOn: [],
        conflictTags: ['plan', 'handoff'],
        artifactRefs: [],
        anchorRefs: [],
        title: 'Planner is waiting for a context handoff.',
      }];
    }
    const plannerCards = board.cards.filter((card) => (
      card.sourceHandoffId === handoff?.id
      && (plannerWorker?.lastProducedCardIds || []).includes(card.id)
    ));
    if (plannerWorker.status === 'running') {
      return [{
        id: makeId('work'),
        pageId: notebook.activePageId,
        deskId: agentId,
        kind: 'planner-run',
        status: 'running',
        dependsOn: [handoff.id],
        conflictTags: ['plan', 'worker'],
        artifactRefs: [],
        anchorRefs: handoff.anchorRefs || [],
        title: handoff.summary || 'Planner worker is sequencing anchored work.',
      }];
    }
    if (isPlannerFeedbackActive(plannerToContext, handoff)) {
      return [{
        id: makeId('work'),
        pageId: notebook.activePageId,
        deskId: agentId,
        kind: 'planner-feedback',
        status: 'blocked',
        dependsOn: [handoff.id],
        conflictTags: ['plan', 'context-retry'],
        artifactRefs: [],
        anchorRefs: plannerToContext.anchorRefs || handoff?.anchorRefs || [],
        title: plannerToContext.summary || 'Planner is waiting for a stronger context packet.',
      }];
    }
    if (handoff.status !== 'ready') {
      return [{
        id: makeId('work'),
        pageId: notebook.activePageId,
        deskId: agentId,
        kind: 'planner-awaiting-clarification',
        status: 'blocked',
        dependsOn: [handoff.id],
        conflictTags: ['plan', 'clarification'],
        artifactRefs: [handoff.id],
        anchorRefs: handoff.anchorRefs || [],
        title: handoff.summary || 'Planner is waiting for a clarified handoff.',
      }];
    }
    if (plannerCards.length) {
      return plannerCards.slice(0, 3).map((card) => ({
        id: makeId('work'),
        pageId: card.pageId || notebook.activePageId,
        deskId: agentId,
        kind: 'planned-card',
        status: card.taskFlow?.phase === 'planned' ? 'ready' : 'running',
        dependsOn: card.sourceHandoffId ? [card.sourceHandoffId] : [],
        conflictTags: ['plan', card.id],
        artifactRefs: card.artifactRefs || [],
        anchorRefs: card.sourceAnchorRefs || [],
        title: card.title,
        detail: `${taskPhaseLabel(card.taskFlow?.phase || 'planned')} | ${taskAssignmentLabel(card.taskFlow?.assignmentState || 'unassigned')} | owner ${card.taskFlow?.ownerDeskId || 'planner'} → ${card.taskFlow?.assigneeDeskId || 'executor'} | trail ${taskTrailSummary(card.taskFlow)}`,
      }));
    }
    return [{
      id: makeId('work'),
      pageId: notebook.activePageId,
      deskId: agentId,
      kind: 'planner-ready-handoff',
      status: 'ready',
      dependsOn: [handoff.id],
      conflictTags: ['plan', 'handoff-ready'],
      artifactRefs: [handoff.id],
      anchorRefs: handoff.anchorRefs || [],
      title: handoff.summary || 'Planner handoff is ready for decomposition.',
    }];
  }
  if (agentId === 'executor') {
    const intentTasks = Array.isArray(latestIntent?.requestedOutcomes)
      ? latestIntent.requestedOutcomes.filter(Boolean)
      : (Array.isArray(latestIntent?.tasks) ? latestIntent.tasks.filter(Boolean) : []);
    if (selectedExecutionCard) {
      return [{
        id: makeId('work'),
        pageId: selectedExecutionCard.pageId || notebook.activePageId,
        deskId: agentId,
        kind: 'approved-execution',
        status: 'ready',
        dependsOn: selectedExecutionCard.sourceHandoffId ? [selectedExecutionCard.sourceHandoffId] : [],
        conflictTags: ['execute', selectedExecutionCard.id],
        artifactRefs: selectedExecutionCard.artifactRefs || [],
        anchorRefs: selectedExecutionCard.sourceAnchorRefs || [],
        title: `Execute approved card: ${selectedExecutionCard.title}`,
      }];
    }
    return intentTasks.slice(0, 2).map((task, index) => ({
      id: makeId('work'),
      pageId: notebook.activePageId,
      deskId: agentId,
      kind: 'execution-item',
      status: handoff && Number(latestIntent?.confidence || 0) >= 0.55 ? 'ready' : 'waiting',
      dependsOn: handoff ? [handoff.id] : [],
      conflictTags: ['execute', `task-${index}`],
      artifactRefs: [],
      anchorRefs: handoff?.anchorRefs || [],
      title: `Prepare output for: ${task}`,
    }));
  }
  if (agentId === 'memory-archivist') {
    return [
      {
        id: makeId('work'),
        pageId: notebook.activePageId,
        deskId: agentId,
        kind: 'memory-sync',
        status: (workspace.annotations || []).length || (workspace.sketches || []).length || handoff ? 'running' : 'waiting',
        dependsOn: [],
        conflictTags: ['memory'],
        artifactRefs: handoff ? [handoff.id] : [],
        anchorRefs: handoff?.anchorRefs || [],
        title: 'Capture notes, handoffs, and artifact history',
      },
    ];
  }
  if (agentId === 'qa-lead') {
    return [];
  }
  return [
    {
      id: makeId('work'),
      pageId: notebook.activePageId,
      deskId: agentId,
      kind: 'governance-check',
      status: handoff ? 'running' : 'waiting',
      dependsOn: handoff ? [handoff.id] : [],
      conflictTags: ['review', 'governance'],
      artifactRefs: handoff ? [handoff.id] : [],
      anchorRefs: handoff?.anchorRefs || [],
      title: 'Review desk overlap, approval state, and guardrails',
    },
  ];
}

function detectConflicts({ workspace, handoff, deskStates, selectedExecutionCard = null }) {
  const conflicts = [];
  const latestIntent = latestIntentReport(workspace);
  const plannerWorker = normalizeAgentWorkersState(workspace?.studio?.agentWorkers).planner;
  const plannerToContext = workspace?.studio?.handoffs?.plannerToContext || null;
  if (Number(latestIntent?.confidence || 0) < 0.55) {
    conflicts.push({
      id: makeId('conflict'),
      kind: 'low-confidence-context',
      severity: 'medium',
      desks: ['context-manager', 'planner', 'executor'],
      summary: 'Planner and Executor are sharing work against a low-confidence context packet.',
    });
  }
  if ((deskStates.executor?.workItems || []).length && (deskStates.planner?.workItems || []).length) {
    conflicts.push({
      id: makeId('conflict'),
      kind: 'parallel-plan-execution',
      severity: 'low',
      desks: ['planner', 'executor'],
      summary: 'Planner and Executor are active on the same page and must stay within scoped outputs.',
    });
  }
  if (selectedExecutionCard && !(selectedExecutionCard.sourceAnchorRefs || []).length) {
    conflicts.push({
      id: makeId('conflict'),
      kind: 'unanchored-execution',
      severity: 'high',
      desks: ['executor', 'cto-architect'],
      summary: `${selectedExecutionCard.title} lacks anchor provenance and should not advance until it is re-anchored.`,
    });
  }
  if (handoff?.status === 'needs-clarification') {
    if (selectedExecutionCard) return conflicts;
    conflicts.push({
      id: makeId('conflict'),
      kind: 'clarification-needed',
      severity: 'high',
      desks: ['context-manager', 'cto-architect'],
      summary: 'Current handoff requires clarification before execution should advance.',
    });
  }
  if (isPlannerFeedbackActive(plannerToContext, handoff) || ['blocked', 'degraded'].includes(plannerWorker.status)) {
    conflicts.push({
      id: makeId('conflict'),
      severity: 'high',
      desks: ['planner', 'context-manager'],
      summary: plannerToContext?.detail || plannerWorker.statusReason || plannerWorker.lastBlockedReason || 'Planner worker is blocked on the current handoff.',
    });
  }
  return conflicts;
}

export function advanceOrchestratorState({ workspace, dashboardState = {}, runs = [], previousState = null }) {
  const notebook = normalizeNotebookState(workspace);
  const latestIntent = latestIntentReport(workspace);
  const handoff = workspace.studio?.handoffs?.contextToPlanner || null;
  const workers = normalizeAgentWorkersState(workspace?.studio?.agentWorkers);
  const contextWorker = workers['context-manager'];
  const plannerWorker = workers.planner;
  const plannerToContext = workspace.studio?.handoffs?.plannerToContext || null;
  const baseBoard = normalizeTeamBoardState(workspace);
  const seededBoard = !baseBoard.cards.length && handoff
    ? {
        ...baseBoard,
        cards: [createTeamBoardCard({
          cards: baseBoard.cards,
          pageId: notebook.activePageId || workspace.activePageId || 'page-1',
          handoffId: handoff.id || null,
          sourceNodeId: latestIntent?.nodeId || handoff.sourceNodeId || null,
          sourceAnchorRefs: Array.isArray(handoff.anchorRefs) ? handoff.anchorRefs : [],
          title: (Array.isArray(handoff.requestedOutcomes) && handoff.requestedOutcomes[0])
            || (Array.isArray(handoff.tasks) && handoff.tasks[0])
            || handoff.summary
            || latestIntent?.summary
            || 'Planned task',
          createdAt: handoff.createdAt || latestIntent?.createdAt || null,
        })],
      }
    : baseBoard;
  const initialSelectedExecutionCard = getSelectedExecutionCard(seededBoard);
  const initialDeskStates = Object.fromEntries(STATIONS.map((agent) => {
    const workItems = buildDeskWorkItems(agent.id, workspace, notebook, handoff, initialSelectedExecutionCard);
    const plannerFeedbackActive = isPlannerFeedbackActive(plannerToContext, handoff);
    const blockedReason = agent.id === 'planner'
      ? (
          ['blocked', 'degraded'].includes(plannerWorker.status)
            ? (plannerToContext?.detail || plannerWorker.statusReason || plannerWorker.lastBlockedReason || 'Planner worker is blocked.')
            : (plannerFeedbackActive
              ? (plannerToContext?.detail || 'Planner is waiting for a tighter context retry.')
              : (handoff?.status === 'needs-clarification'
                ? 'Planner is waiting for Context Manager to clarify the current handoff.'
                : null))
        )
      : agent.id === 'executor' && handoff?.status === 'needs-clarification' && !initialSelectedExecutionCard
        ? 'Execution is gated until Context Manager clarifies the active page intent.'
        : null;
    const localStatus = deriveDeskLocalState(workItems, blockedReason);
    const statusLabel = buildDeskStatusLabel({
      deskId: agent.id,
      localState: localStatus,
      handoff,
      plannerToContext,
      contextWorker,
      plannerWorker,
      workItems,
    });
    const statusDetail = buildDeskStatusDetail({
      deskId: agent.id,
      localState: localStatus,
      handoff,
      plannerToContext,
      contextWorker,
      plannerWorker,
      workItems,
    });
    return [agent.id, {
      mission: DESK_MISSIONS[agent.id],
      localState: localStatus,
      statusLabel,
      statusDetail,
      currentGoal: workItems[0]?.title || agent.role,
      allowedActions: DESK_ALLOWED_ACTIONS[agent.id] || [],
      workItems,
      lastOutput: agent.id === 'context-manager'
        ? handoff?.summary || latestIntent?.summary || null
        : agent.id === 'planner' && plannerToContext?.sourceHandoffId && plannerToContext.sourceHandoffId === handoff?.id
          ? plannerToContext.summary || plannerToContext.detail || null
          : agent.id === 'planner' && plannerWorker.lastProducedCardIds?.length
            ? `Produced ${plannerWorker.lastProducedCardIds.length} planned card${plannerWorker.lastProducedCardIds.length === 1 ? '' : 's'}.`
            : agent.id === 'executor' && initialSelectedExecutionCard
              ? `Queued mutation package: ${initialSelectedExecutionCard.title}`
              : workItems[0]?.title || null,
      blockedReason,
      contextSlice: {
        activePageId: notebook.activePageId,
        activePageTitle: notebook.activePage.title,
        pageGoal: latestIntent?.summary || notebook.activePage.summary,
        matchedTerms: latestIntent?.projectContext?.matchedTerms || [],
      },
      freshAt: new Date().toISOString(),
    }];
  }));
  const initialConflicts = detectConflicts({ workspace, handoff, deskStates: initialDeskStates, selectedExecutionCard: initialSelectedExecutionCard });
  const teamBoard = advanceTeamBoardState({
    workspace,
    handoff,
    board: seededBoard,
    deskStates: initialDeskStates,
    conflicts: initialConflicts,
    runs,
  });
  const selectedExecutionCard = getSelectedExecutionCard(teamBoard);
  const deskStates = Object.fromEntries(STATIONS.map((agent) => {
    const workItems = buildDeskWorkItems(agent.id, workspace, notebook, handoff, selectedExecutionCard);
    const plannerFeedbackActive = isPlannerFeedbackActive(plannerToContext, handoff);
    const blockedReason = agent.id === 'planner'
      ? (
          ['blocked', 'degraded'].includes(plannerWorker.status)
            ? (plannerToContext?.detail || plannerWorker.statusReason || plannerWorker.lastBlockedReason || 'Planner worker is blocked.')
            : (plannerFeedbackActive
              ? (plannerToContext?.detail || 'Planner is waiting for a tighter context retry.')
              : (handoff?.status === 'needs-clarification'
                ? 'Planner is waiting for Context Manager to clarify the current handoff.'
                : null))
        )
      : agent.id === 'executor' && handoff?.status === 'needs-clarification' && !selectedExecutionCard
        ? 'Execution is gated until Context Manager clarifies the active page intent.'
        : null;
    const localStatus = deriveDeskLocalState(workItems, blockedReason);
    const statusLabel = buildDeskStatusLabel({
      deskId: agent.id,
      localState: localStatus,
      handoff,
      plannerToContext,
      contextWorker,
      plannerWorker,
      workItems,
    });
    const statusDetail = buildDeskStatusDetail({
      deskId: agent.id,
      localState: localStatus,
      handoff,
      plannerToContext,
      contextWorker,
      plannerWorker,
      workItems,
    });
    return [agent.id, {
      mission: DESK_MISSIONS[agent.id],
      localState: localStatus,
      statusLabel,
      statusDetail,
      currentGoal: workItems[0]?.title || agent.role,
      allowedActions: DESK_ALLOWED_ACTIONS[agent.id] || [],
      workItems,
      lastOutput: agent.id === 'context-manager'
        ? handoff?.summary || latestIntent?.summary || null
        : agent.id === 'planner' && plannerToContext?.sourceHandoffId && plannerToContext.sourceHandoffId === handoff?.id
          ? plannerToContext.summary || plannerToContext.detail || null
          : agent.id === 'planner' && plannerWorker.lastProducedCardIds?.length
            ? `Produced ${plannerWorker.lastProducedCardIds.length} planned card${plannerWorker.lastProducedCardIds.length === 1 ? '' : 's'}.`
            : agent.id === 'executor' && selectedExecutionCard
              ? `Queued mutation package: ${selectedExecutionCard.title}`
              : workItems[0]?.title || null,
      blockedReason,
      contextSlice: {
        activePageId: notebook.activePageId,
        activePageTitle: notebook.activePage.title,
        pageGoal: latestIntent?.summary || notebook.activePage.summary,
        matchedTerms: latestIntent?.projectContext?.matchedTerms || [],
      },
      freshAt: new Date().toISOString(),
    }];
  }));
  const conflicts = detectConflicts({ workspace, handoff, deskStates, selectedExecutionCard });
  if (deskStates.planner) {
    if (plannerWorker.status === 'running') {
      deskStates.planner.thoughtBubble = 'Planner status: running. Sequencing anchored cards.';
    } else if (isPlannerFeedbackActive(plannerToContext, handoff)) {
      deskStates.planner.thoughtBubble = plannerToContext.action === 'bin-candidate'
        ? 'Planner status: blocked. Recommending this handoff be binned.'
        : 'Planner status: blocked. Waiting for a tighter context retry.';
    } else if (teamBoard.summary.plan) {
      deskStates.planner.thoughtBubble = `Planner status: queued. ${teamBoard.summary.plan} plan card${teamBoard.summary.plan === 1 ? '' : 's'} are ready.`;
    } else if (handoff?.status === 'ready') {
      deskStates.planner.thoughtBubble = 'Planner status: queued. Ready to decompose the latest handoff.';
    } else {
      deskStates.planner.thoughtBubble = 'Planner status: idle. Waiting for context handoff.';
    }
  }
  if (deskStates['context-manager']) {
    if (contextWorker.status === 'running') {
      deskStates['context-manager'].thoughtBubble = 'Context status: running. Drafting a tighter planner packet.';
    } else if (isPlannerFeedbackActive(plannerToContext, handoff)) {
      deskStates['context-manager'].thoughtBubble = plannerToContext.action === 'bin-candidate'
        ? 'Context status: queued. Reviewing whether the handoff should be binned.'
        : 'Context status: queued. Planner requested a tighter retry.';
    } else if (handoff?.status === 'needs-clarification') {
      deskStates['context-manager'].thoughtBubble = 'Context status: queued. Clarification is needed before planner can continue.';
    } else if (contextWorker.lastUsedFallback) {
      deskStates['context-manager'].thoughtBubble = 'Context status: idle. Deterministic fallback kept intake alive.';
    } else {
      deskStates['context-manager'].thoughtBubble = handoff?.summary
        ? 'Context status: idle. Published packet is available to Planner.'
        : 'Context status: idle. Waiting for source context.';
    }
  }
  if (deskStates['cto-architect'] && teamBoard.summary.review) {
    deskStates['cto-architect'].thoughtBubble = `Governance status: queued. ${teamBoard.summary.review} task${teamBoard.summary.review === 1 ? '' : 's'} require approval.`;
  }
  const pendingUserActions = [
    ...(Number(latestIntent?.confidence || 0) < 0.55 ? ['Clarify the active page goal before execution advances further.'] : []),
    ...((dashboardState.blockers || []).slice(0, 2).map((item) => `Resolve blocker: ${item}`)),
  ];
  return {
    status: conflicts.some((conflict) => conflict.severity === 'high') ? 'needs-attention' : 'running',
    lastTickAt: new Date().toISOString(),
    activeDeskIds: Object.entries(deskStates)
      .filter(([, state]) => state.localState === 'running' || state.localState === 'ready')
      .map(([deskId]) => deskId),
    conflicts,
    pendingUserActions,
    desks: deskStates,
    activePageId: notebook.activePageId,
    teamBoard,
  };
}

function buildContextHistory({ report, handoff, runSignal, runs, workspaceHistory }) {
  const entries = [];
  if (handoff) {
    entries.push({
      id: `handoff-${handoff.id}`,
      summary: `Planner handoff ${handoff.status === 'ready' ? 'updated' : 'flagged for clarification'}`,
      detail: handoff.summary,
      at: handoff.createdAt,
    });
  }
  if (runSignal) {
    entries.push({
      id: `run-${runSignal.runId}`,
      summary: `${runSignal.action} ${runSignal.status}`,
      detail: runSignal.summary,
      at: runs.find((entry) => entry.runId === runSignal.runId)?.startedAt || runs.find((entry) => entry.runId === runSignal.runId)?.createdAt || null,
    });
  }
  if (report) {
    entries.push({
      id: `intent-${report.nodeId || report.createdAt}`,
      summary: 'Intent report refreshed',
      detail: `${Math.round((report.confidence || 0) * 100)}% confidence across ${(report.tasks || []).length} extracted tasks`,
      at: report.createdAt || report.judgedAt || null,
    });
  }
  (workspaceHistory || []).slice(0, 3).forEach((entry, index) => {
    entries.push({
      id: `history-${index}-${entry.at || index}`,
      summary: entry.type || 'workspace event',
      detail: `${entry.summary?.nodes || 0} nodes / ${entry.summary?.edges || 0} edges`,
      at: entry.at || null,
    });
  });
  return entries.filter((entry) => entry.summary).slice(0, 6);
}

function buildContextDeskSnapshot({ agent, workspace, dashboardState, runs, runSignal, status, metrics }) {
  const report = latestIntentReport(workspace);
  const handoff = workspace.studio?.handoffs?.contextToPlanner || null;
  const plannerToContext = workspace.studio?.handoffs?.plannerToContext || null;
  const notebook = normalizeNotebookState(workspace);
  const board = normalizeTeamBoardState(workspace);
  const governedDesk = workspace.studio?.orchestrator?.desks?.[agent.id] || null;
  const contextWorker = normalizeAgentWorkersState(workspace?.studio?.agentWorkers)['context-manager'];
  const actionSignals = Number(report?.metrics?.actionSignals || 0);
  const constraintSignals = Number(report?.metrics?.constraintSignals || 0);
  const matchedTerms = report?.projectContext?.matchedTerms || [];
  const taskCards = canonicalTaskRecords(board);
  const history = buildContextHistory({
    report,
    handoff,
    runSignal,
    runs,
    workspaceHistory: workspace.history || [],
  });
  const userActions = [];
  if (Number(report?.confidence || 0) < 0.55) {
    userActions.push('Clarify the desired outcome so the planner handoff is less ambiguous.');
  }
  if (!(report?.requestedOutcomes || report?.tasks || []).length) {
    userActions.push('Add a more concrete task or expected output in the context input.');
  }
  if ((dashboardState?.blockers || []).length) {
    userActions.push(`Resolve blocker: ${dashboardState.blockers[0]}`);
  }
  if (plannerToContext?.detail) {
    userActions.push(plannerToContext.detail);
  }
  if (contextWorker?.lastBlockedReason) {
    userActions.push(contextWorker.lastBlockedReason);
  }

  return {
    identity: {
      id: agent.id,
      name: agent.name,
      role: agent.role,
    },
    status,
    focus: {
      summary: report?.summary || 'Watching current context intake and workspace signals.',
      detail: report?.projectContext?.currentFocus || 'No active project focus reported.',
    },
    metrics: {
      confidence: Number(report?.confidence || 0),
      extractedTasks: (report?.requestedOutcomes || report?.tasks || []).length,
      matchedProjectTerms: matchedTerms.length,
      actionSignals,
      constraintSignals,
      usedFallback: Boolean(contextWorker?.lastUsedFallback),
    },
    history,
    userActions,
    handoff,
    sections: [
      {
        id: 'current-job',
        label: 'Current Job',
        kind: 'summary',
        value: governedDesk?.currentGoal || report?.summary || 'No current context report.',
        detail: `Page: ${notebook.activePage.title} | ${governedDesk?.mission || report?.projectContext?.currentFocus || 'Waiting for context input.'}`,
      },
      {
        id: 'context-worker',
        label: 'Context Worker',
        kind: 'summary',
      value: `Status: ${contextWorker?.status || 'idle'} | backend ${contextWorker?.backend || 'ollama'} | model ${contextWorker?.model || 'mistral:latest'}`,
        detail: contextWorker?.currentRunId
          ? `Running ${contextWorker.currentRunId}`
          : (contextWorker?.lastRunId
            ? `Last run ${contextWorker.lastRunId} | outcome ${contextWorker.lastOutcome || 'unknown'}${contextWorker.lastUsedFallback ? ' | used deterministic fallback' : ''}${contextWorker.statusReason ? ` | ${contextWorker.statusReason}` : ''}`
            : 'No context-manager run has completed yet.'),
      },
      {
        id: 'core-truth',
        label: 'Core Truth',
        kind: 'truth',
        value: report?.truth || null,
        emptyState: 'Run context intake to expose ACE’s extracted intent truth.',
      },
      {
        id: 'problem-to-solve',
        label: 'Problem To Solve',
        kind: 'handoff',
        value: handoff,
        emptyState: 'Planner handoff will appear after the next intent scan.',
      },
      {
        id: 'task-creation',
        label: 'Task Creation',
        kind: 'history',
        items: taskCards.map((record) => ({
          id: record.id,
          summary: record.title,
          detail: `${taskPhaseLabel(record.phase || 'captured')} | ${taskAssignmentLabel(record.assignmentState || 'unassigned')} | owner ${record.ownerDeskId || 'context-manager'} → ${record.assigneeDeskId || 'planner'} | trail ${taskTrailSummary(record.taskFlow)}`,
        })),
        emptyState: 'No canonical task cards have been created yet.',
      },
      {
        id: 'intent-pipeline',
        label: 'Intent Extraction',
        kind: 'intent',
        value: report,
        emptyState: 'Run context intake to generate an intent report.',
      },
      {
        id: 'kpis',
        label: 'KPIs',
        kind: 'metrics',
        items: [
          { label: 'Confidence', value: `${Math.round((report?.confidence || 0) * 100)}%` },
          { label: 'Planner usefulness', value: `${Math.round((report?.scores?.plannerUsefulness || 0) * 100)}%` },
          { label: 'Execution readiness', value: `${Math.round((report?.scores?.executionReadiness || 0) * 100)}%` },
          { label: 'Deploy readiness', value: `${Math.round((report?.scores?.deployReadiness || 0) * 100)}%` },
          { label: 'Requested outcomes', value: `${(report?.requestedOutcomes || report?.tasks || []).length}` },
          { label: 'Project matches', value: `${matchedTerms.length}` },
          { label: 'Action signals', value: `${actionSignals}` },
          { label: 'Constraint signals', value: `${constraintSignals}` },
        ],
      },
      {
        id: 'recent-history',
        label: 'Recent History',
        kind: 'history',
        items: history,
        emptyState: 'No recent context history yet.',
      },
      {
        id: 'waiting-on-you',
        label: 'Waiting On You',
        kind: 'actions',
        items: [...userActions, ...((workspace.studio?.orchestrator?.pendingUserActions || []).slice(0, 3))],
        emptyState: 'No manual clarification needed right now.',
      },
    ],
  };
}

function buildGovernedDeskSnapshot({ agent, workspace, metrics, runs, runSignal, status, qaState = null }) {
  if (agent.id === 'qa-lead') {
    return buildQADeskSnapshot({ agent, workspace, status, qaState });
  }
  const notebook = normalizeNotebookState(workspace);
  const orchestrator = workspace.studio?.orchestrator || null;
  const governedDesk = orchestrator?.desks?.[agent.id] || null;
  const selfUpgrade = workspace.studio?.selfUpgrade || null;
  const handoff = workspace.studio?.handoffs?.contextToPlanner || null;
  const plannerToContext = workspace.studio?.handoffs?.plannerToContext || null;
  const executorWorker = normalizeAgentWorkersState(workspace?.studio?.agentWorkers).executor;
  const plannerWorker = normalizeAgentWorkersState(workspace?.studio?.agentWorkers).planner;
  const board = normalizeTeamBoardState(workspace);
  const plannerProducedCards = board.cards.filter((card) => (plannerWorker.lastProducedCardIds || []).includes(card.id));
  const selectedExecutionCard = getSelectedExecutionCard(workspace);
  const history = recentRunSummary(runs).map((entry, index) => ({ id: `${agent.id}-history-${index}`, summary: entry }));
  const normalizedQA = normalizeQAState(qaState);
  const qaScorecards = agent.id === 'cto-architect' ? collectQAScorecards(normalizedQA.structuredReport) : null;
  const latestQARun = normalizedQA.latestBrowserRun || normalizedQA.browserRuns[0] || null;
  const plannerSections = agent.id === 'planner' ? [
    {
      id: 'planner-worker',
      label: 'Planner Worker',
      kind: 'summary',
      value: `Status: ${plannerWorker.status || 'idle'} | backend ${plannerWorker.backend || 'ollama'} | model ${plannerWorker.model || 'mistral:latest'}`,
      detail: plannerWorker.currentRunId
        ? `Running ${plannerWorker.currentRunId}`
        : (plannerWorker.lastRunId
          ? `Last run ${plannerWorker.lastRunId} | outcome ${plannerWorker.lastOutcome || 'unknown'}${plannerWorker.statusReason ? ` | ${plannerWorker.statusReason}` : ''}`
          : 'No planner run has completed yet.'),
    },
    {
      id: 'planner-handoff',
      label: 'Planner Handoff',
      kind: 'handoff',
      value: handoff,
      emptyState: 'Planner is waiting for a context handoff.',
    },
    {
      id: 'planner-produced-cards',
      label: 'Produced Cards',
      kind: 'history',
      items: plannerProducedCards.map((card) => ({
        id: card.id,
        summary: card.title,
        detail: `${taskPhaseLabel(card.taskFlow?.phase || 'planned')} | ${taskAssignmentLabel(card.taskFlow?.assignmentState || 'unassigned')} | anchors ${(card.sourceAnchorRefs || []).join(', ') || 'none'} | trail ${taskTrailSummary(card.taskFlow)}`,
      })),
      emptyState: 'Planner has not produced anchored plan cards yet.',
    },
    {
      id: 'task-movement',
      label: 'Task Movement',
      kind: 'history',
      items: plannerProducedCards.map((card) => ({
        id: `${card.id}-movement`,
        summary: card.taskFlow?.lastTransitionLabel || taskPhaseLabel(card.taskFlow?.phase || 'planned'),
        detail: `${card.title} | owner ${card.taskFlow?.ownerDeskId || 'planner'} → ${card.taskFlow?.assigneeDeskId || 'executor'} | ${taskAssignmentLabel(card.taskFlow?.assignmentState || 'unassigned')} | ${card.taskFlow?.lastTransitionAt ? new Date(card.taskFlow.lastTransitionAt).toLocaleString() : 'unknown time'} | trail ${taskTrailSummary(card.taskFlow)}`,
      })),
      emptyState: 'Planner has not moved any tasks yet.',
    },
    {
      id: 'planner-artifacts',
      label: 'Proposal Artifacts',
      kind: 'history',
      items: (plannerWorker.proposalArtifactRefs || []).map((artifactRef, index) => ({
        id: `proposal-${index}`,
        summary: artifactRef.split('/').slice(-1)[0] || artifactRef,
        detail: artifactRef,
      })),
      emptyState: 'No planner proposal artifacts have been captured yet.',
    },
    {
      id: 'planner-feedback',
      label: 'Context Retry Loop',
      kind: 'summary',
      value: plannerToContext?.sourceHandoffId && plannerToContext.sourceHandoffId === handoff?.id
        ? (plannerToContext.summary || plannerToContext.detail || 'Planner requested context follow-up.')
        : 'No active planner feedback request.',
      detail: plannerToContext?.sourceHandoffId && plannerToContext.sourceHandoffId === handoff?.id
        ? `Action: ${plannerToContext.action || 'retry-handoff'}`
        : 'Planner has not asked Context Manager to retry or bin the current handoff.',
    },
  ] : [];
  const executorSections = agent.id === 'executor' ? [
    {
      id: 'executor-worker',
      label: 'Executor Worker',
      kind: 'summary',
      value: `Status: ${executorWorker.status || 'idle'} | backend ${executorWorker.backend || 'ollama'} | model ${executorWorker.model || 'mistral:latest'}`,
      detail: executorWorker.currentRunId
        ? `Running ${executorWorker.currentRunId}`
        : (executorWorker.lastRunId
          ? `Last run ${executorWorker.lastRunId} | outcome ${executorWorker.lastOutcome || 'unknown'}${executorWorker.lastDecision ? ` | decision ${executorWorker.lastDecision}` : ''}${executorWorker.lastBlockedReason ? ` | blocker ${executorWorker.lastBlockedReason}` : ''}${executorWorker.statusReason ? ` | ${executorWorker.statusReason}` : ''}`
          : 'No executor run metadata has been recorded yet.'),
    },
  ] : [];
  const selfUpgradeSections = agent.id === 'cto-architect' ? [
    {
      id: 'self-upgrade-status',
      label: 'ACE Self Upgrade',
      kind: 'summary',
      value: selfUpgrade?.status ? `Status: ${selfUpgrade.status}` : 'Status: idle',
      detail: selfUpgrade?.taskId ? `Task ${selfUpgrade.taskId} targeting ${selfUpgrade.targetProjectKey || 'ace-self'}` : 'No active self-upgrade task selected.',
    },
    {
      id: 'self-upgrade-preflight',
      label: 'Preflight Checks',
      kind: 'history',
      items: (selfUpgrade?.preflight?.checks || []).map((check) => ({
        id: check.id,
        summary: `${check.ok ? 'PASS' : 'FAIL'} ${check.label}`,
        detail: check.output || check.command,
      })),
      emptyState: 'No self-upgrade preflight has run yet.',
    },
    {
      id: 'self-upgrade-permission',
      label: 'Permission State',
      kind: 'actions',
      items: [
        `Permission: ${selfUpgrade?.requiresPermission || 'none'}`,
        ...(selfUpgrade?.patchReview?.refusalReasons || []),
      ],
      emptyState: 'No permission gate is active right now.',
    },
  ] : [];
  const qaSummarySections = agent.id === 'cto-architect' ? [
    {
      id: 'qa-summary',
      label: 'QA Summary',
      kind: 'qa-summary',
      structuredStatus: normalizedQA.structuredBusy ? 'running' : (qaScorecards?.status || null),
      structuredSummary: normalizedQA.structuredBusy
        ? 'Structured QA suite is running now.'
        : (qaScorecards?.summary || ''),
      scorecardCount: qaScorecards?.cards?.length || 0,
      scorecardDeskCount: qaScorecards?.deskCount || 0,
      latestBrowserRun: latestQARun,
      browserBusy: normalizedQA.browserBusy,
      localGate: normalizedQA.localGate,
      emptyState: normalizedQA.structuredReport || latestQARun || normalizedQA.structuredBusy || normalizedQA.browserBusy || localGateOutputCount(normalizedQA.localGate)
        ? ''
        : 'Focus QA desk to run structured QA or browser evidence passes.',
    },
  ] : [];
  return {
    identity: { id: agent.id, name: agent.name, role: agent.role },
    status,
    focus: {
      summary: governedDesk?.currentGoal || `${metrics.count} related items in workspace`,
      detail: governedDesk?.mission || statusDetail(status),
    },
    metrics: {
      assignedTasks: metrics.count,
      queueSize: metrics.queue,
      outputs: agent.id === 'planner'
        ? Math.max(plannerProducedCards.length, (plannerWorker.proposalArtifactRefs || []).length, history.length, runSignal ? 1 : 0)
        : Math.max(history.length, runSignal ? 1 : 0),
    },
    history,
    userActions: [
      ...(governedDesk?.blockedReason ? [governedDesk.blockedReason] : []),
      ...(agent.id === 'planner' && plannerToContext?.sourceHandoffId && plannerToContext.sourceHandoffId === handoff?.id ? [plannerToContext.detail || plannerToContext.summary].filter(Boolean) : []),
    ],
    handoff: agent.id === 'planner' ? handoff : null,
    sections: [
      {
        id: 'mission',
        label: 'Mission',
        kind: 'summary',
        value: governedDesk?.mission || agent.role,
        detail: `Active page: ${notebook.activePage.title}`,
      },
      {
        id: 'current-goal',
        label: 'Current Goal',
        kind: 'summary',
        value: governedDesk?.currentGoal || 'Waiting for orchestrator assignment.',
        detail: governedDesk?.localState
          ? `Desk state: ${governedDesk.localState}${governedDesk.statusLabel ? ` | ${governedDesk.statusLabel}` : ''}${governedDesk.statusDetail ? ` | ${governedDesk.statusDetail}` : ''}`
          : 'Desk has no active governed state yet.',
      },
      {
      id: 'active-work',
      label: 'Active Work Items',
        kind: 'history',
        items: (governedDesk?.workItems || []).map((item) => ({
          id: item.id,
          summary: item.title,
          detail: item.detail || `${item.kind} | ${item.status}`,
        })),
        emptyState: 'No governed work items assigned.',
      },
    {
      id: 'allowed-actions',
      label: 'Allowed Actions',
      kind: 'actions',
      items: governedDesk?.allowedActions || [],
      emptyState: 'No allowed actions published.',
    },
      ...(agent.id === 'executor' ? [{
        id: 'execution-selection',
        label: 'Mutation Queue',
        kind: 'summary',
        value: selectedExecutionCard ? selectedExecutionCard.title : 'No mutation package is currently queued for executor apply/deploy.',
        detail: selectedExecutionCard
          ? `Page ${selectedExecutionCard.pageId} | task ${selectedExecutionCard.runnerTaskId || selectedExecutionCard.builderTaskId || 'unbound'} | risk ${selectedExecutionCard.riskLevel || 'unknown'} | apply ${selectedExecutionCard.applyStatus || 'idle'} | deploy ${selectedExecutionCard.deployStatus || 'idle'}`
          : 'Low-risk packages auto-apply. Risky packages stop in Ready to Apply on the Team Board.',
      }] : []),
      ...executorSections,
      ...plannerSections,
      ...qaSummarySections,
      ...selfUpgradeSections,
    ],
  };
}

function defaultRecentActions(agent, workspace, runs, qaState = null) {
  const summaries = recentRunSummary(runs);
  const intent = latestIntentReport(workspace);
  const contextWorker = normalizeAgentWorkersState(workspace?.studio?.agentWorkers)['context-manager'];
  const executorWorker = normalizeAgentWorkersState(workspace?.studio?.agentWorkers).executor;
  const plannerWorker = normalizeAgentWorkersState(workspace?.studio?.agentWorkers).planner;
  const plannerToContext = workspace?.studio?.handoffs?.plannerToContext || null;
  const normalizedQA = normalizeQAState(qaState);
  const qaScorecards = collectQAScorecards(normalizedQA.structuredReport);
  const latestBrowserRun = normalizedQA.latestBrowserRun || normalizedQA.browserRuns[0] || null;
  if (agent.id === 'context-manager') {
    return [
      contextWorker?.status === 'running'
        ? `Context worker is running ${contextWorker.currentRunId || 'the current intake'}`
        : (contextWorker?.statusReason || plannerToContext?.summary || intent?.summary || `Synced ${(workspace.graph?.edges || []).length} workspace links`),
      contextWorker?.lastUsedFallback
        ? 'Latest context run used deterministic fallback after local-model failure'
        : (intent ? `Intent confidence ${Math.round((intent.confidence || 0) * 100)}% across ${(intent.requestedOutcomes || intent.tasks || []).length} requested outcomes` : (summaries[0] || 'Watching current focus and constraints')),
    ];
  }
  if (agent.id === 'planner') {
    return [
      plannerWorker.status === 'running'
        ? `Planner worker is running ${plannerWorker.currentRunId || 'current handoff'}`
        : (plannerWorker?.statusReason || plannerToContext?.summary || (intent?.requestedOutcomes?.length || intent?.tasks?.length ? `Received ${(intent.requestedOutcomes || intent.tasks || []).length} requested outcomes from Context Manager` : `Tracking ${(workspace.graph?.nodes || []).filter((node) => node.type === 'task').length} task notes`)),
      plannerWorker.lastProducedCardIds?.length
        ? `Produced ${plannerWorker.lastProducedCardIds.length} anchored plan card${plannerWorker.lastProducedCardIds.length === 1 ? '' : 's'}`
        : (summaries.find((entry) => entry.includes('manage')) || 'Waiting for a new plan decomposition'),
    ];
  }
  if (agent.id === 'executor') {
    return [
      executorWorker.status === 'running'
        ? `Executor worker is running ${executorWorker.currentRunId || 'the active verification/apply cycle'}`
        : (executorWorker.lastAssessmentSummary || executorWorker.statusReason || summaries.find((entry) => entry.includes('build') || entry.includes('run')) || 'No build execution in recent history'),
      intent?.requestedOutcomes?.length || intent?.tasks?.length ? `Execution queue seeded from ${(intent.requestedOutcomes || intent.tasks || []).length} requested outcomes` : `Modules/files in workspace: ${(workspace.graph?.nodes || []).filter((node) => ['module', 'file'].includes(node.type)).length}`,
    ];
  }
  if (agent.id === 'memory-archivist') {
    return [
      `Saved ${(workspace.annotations || []).length} annotations and ${(workspace.sketches || []).length} sketch strokes`,
      `Architecture versions: ${(workspace.architectureMemory?.versions || []).length}`,
    ];
  }
  if (agent.id === 'qa-lead') {
    return [
      normalizedQA.structuredBusy
        ? 'Structured QA suite is running.'
        : (normalizedQA.structuredReport?.summary || 'Structured QA has not been run in this session.'),
      normalizedQA.browserBusy
        ? 'Browser QA is running.'
        : summarizeQABrowserRun(latestBrowserRun),
      summarizeLocalGate(normalizedQA.localGate),
      qaScorecards.cards.length
        ? `Scorecards live: ${qaScorecards.cards.length} across ${qaScorecards.deskCount} desk${qaScorecards.deskCount === 1 ? '' : 's'}.`
        : 'No scored QA cards are loaded yet.',
    ];
  }
  return [
    summaries[0] || 'Reviewing ACE governance boundaries',
    `Rules in force: ${(workspace.architectureMemory?.rules || []).length}`,
  ];
}

function deriveStatus(agent, metrics, workspace, dashboardState, runSignal, qaState = null) {
  const blockers = dashboardState?.blockers || [];
  const intent = latestIntentReport(workspace);
  const contextWorker = normalizeAgentWorkersState(workspace?.studio?.agentWorkers)['context-manager'];
  const plannerWorker = normalizeAgentWorkersState(workspace?.studio?.agentWorkers).planner;
  const plannerToContext = workspace?.studio?.handoffs?.plannerToContext || null;
  const normalizedQA = normalizeQAState(qaState);
  const qaScorecards = collectQAScorecards(normalizedQA.structuredReport);
  const latestBrowserRun = normalizedQA.latestBrowserRun || normalizedQA.browserRuns[0] || null;
  if (runSignal?.status === 'running') return 'processing';
  if (runSignal?.status === 'error') return 'review';
  if (agent.id === 'qa-lead') {
    if (normalizedQA.structuredBusy || normalizedQA.browserBusy) return 'processing';
    if (normalizedQA.structuredReport?.status && ['fail', 'failed', 'error'].includes(String(normalizedQA.structuredReport.status).toLowerCase())) return 'review';
    if (latestBrowserRun && ['fail', 'failed', 'error'].includes(String(latestQAVerdict(latestBrowserRun)).toLowerCase())) return 'review';
    if (hasLocalGateIssue(normalizedQA.localGate)) return 'review';
    if (qaScorecards.cards.length || latestBrowserRun || normalizedQA.structuredReport || localGateOutputCount(normalizedQA.localGate)) return 'queued';
    return 'idle';
  }
  if (agent.id === 'cto-architect' && blockers.length) return 'review';
  if (agent.id === 'context-manager' && contextWorker.status === 'running') return 'processing';
  if (agent.id === 'context-manager' && contextWorker.status === 'blocked') return 'blocked';
  if (agent.id === 'context-manager' && contextWorker.status === 'degraded') return 'degraded';
  if (agent.id === 'planner' && plannerWorker.status === 'running') return 'processing';
  if (agent.id === 'planner' && plannerWorker.status === 'degraded') return 'degraded';
  if (agent.id === 'planner' && (plannerWorker.status === 'blocked' || isPlannerFeedbackActive(plannerToContext, workspace?.studio?.handoffs?.contextToPlanner || null))) return 'blocked';
  if (agent.id === 'planner' && blockers.length) return 'blocked';
  if (agent.id === 'executor' && metrics.queue > 2) return 'processing';
  if (agent.id === 'context-manager' && intent && (intent.confidence || 0) < 0.45) return 'review';
  if (agent.id === 'context-manager' && metrics.count > 0) return 'queued';
  if (agent.id === 'memory-archivist' && ((workspace.annotations || []).length || (workspace.sketches || []).length)) return 'processing';
  if (agent.id === 'cto-architect' && (workspace.architectureMemory?.versions || []).length > 0) return 'queued';
  return metrics.count ? 'queued' : 'idle';
}

function statusDetail(status) {
  const map = {
    idle: 'Station is quiet and ready for new work.',
    queued: 'Work is queued and ready for the next guarded step.',
    processing: 'Actively working through queued tasks.',
    blocked: 'Waiting on blockers or missing inputs.',
    degraded: 'The worker degraded and needs attention before it can be trusted again.',
    review: 'Holding for system-level review before changes continue.',
  };
  return map[status] || map.idle;
}

function taskTrailSummary(taskFlow = {}) {
  const history = Array.isArray(taskFlow.history) ? [...taskFlow.history].reverse() : [];
  if (!history.length) return taskPhaseLabel(taskFlow.phase || 'planned');
  return history
    .map((entry) => entry.label || taskPhaseLabel(entry.phase))
    .filter(Boolean)
    .join(' -> ');
}

function canonicalTaskRecords(board = {}) {
  return Array.isArray(board.cards)
    ? board.cards.filter((card) => card && card.taskFlow).map((card) => ({
      id: card.id,
      title: card.title,
      phase: card.taskFlow?.phase || 'planned',
      assignmentState: card.taskFlow?.assignmentState || 'unassigned',
      ownerDeskId: card.taskFlow?.ownerDeskId || 'planner',
      assigneeDeskId: card.taskFlow?.assigneeDeskId || 'executor',
      sourceIntentId: card.taskFlow?.sourceIntentId || card.sourceIntentId || null,
      sourceHandoffId: card.taskFlow?.sourceHandoffId || card.sourceHandoffId || null,
      createdAt: card.createdAt || null,
      lastTransitionAt: card.taskFlow?.lastTransitionAt || card.updatedAt || card.createdAt || null,
      lastTransitionLabel: card.taskFlow?.lastTransitionLabel || '',
      taskFlow: card.taskFlow,
    }))
    : [];
}

function normalizeQAMetricDefinitions(definitions = null) {
  const metrics = definitions?.metrics && typeof definitions.metrics === 'object'
    ? definitions.metrics
    : {};
  return {
    schema: definitions?.schema || 'qa.test-metric-definitions.v1',
    version: Number.isFinite(Number(definitions?.version)) ? Number(definitions.version) : 1,
    metrics,
  };
}

function collectQAScorecards(qaReport = null) {
  const definitions = normalizeQAMetricDefinitions(qaReport?.metricDefinitions || null);
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

  return {
    status: qaReport?.status || null,
    summary: qaReport?.summary || '',
    deskCount: Array.isArray(qaReport?.desks) ? qaReport.desks.length : 0,
    testCount: Array.isArray(qaReport?.desks)
      ? qaReport.desks.reduce((total, desk) => total + (Array.isArray(desk?.tests) ? desk.tests.length : 0), 0)
      : 0,
    definitions,
    cards,
  };
}

function normalizeLocalGateState(localGate = null) {
  return {
    unit: localGate?.unit || null,
    studioBoot: localGate?.studioBoot || null,
  };
}

function normalizeQAState(qaState = null) {
  return {
    structuredReport: qaState?.structuredReport || null,
    structuredBusy: Boolean(qaState?.structuredBusy),
    latestBrowserRun: qaState?.latestBrowserRun || null,
    browserRuns: Array.isArray(qaState?.browserRuns) ? qaState.browserRuns.filter(Boolean) : [],
    browserBusy: Boolean(qaState?.browserBusy),
    localGate: normalizeLocalGateState(qaState?.localGate),
  };
}

function localGateVerdict(entry = null) {
  return String(entry?.verdict || entry?.status || 'pending').toLowerCase();
}

function localGateOutputCount(localGate = null) {
  return (localGate?.unit ? 1 : 0) + (localGate?.studioBoot ? 1 : 0);
}

function hasLocalGateIssue(localGate = null) {
  const unitStatus = localGateVerdict(localGate?.unit);
  const studioBootStatus = localGateVerdict(localGate?.studioBoot);
  return ['fail', 'failed', 'error'].includes(unitStatus)
    || ['weak', 'fail', 'failed', 'error'].includes(studioBootStatus);
}

function summarizeLocalGate(localGate = null) {
  if (!localGate?.unit && !localGate?.studioBoot) {
    return 'No local UI gate results recorded yet.';
  }
  const parts = [];
  if (localGate?.unit) {
    const failedCount = Number(localGate.unit.failedCount || localGate.unit.failures?.length || 0);
    parts.push(`Unit gate ${localGate.unit.status || 'pending'}${failedCount ? ` | ${failedCount} failing check${failedCount === 1 ? '' : 's'}` : ''}`);
  }
  if (localGate?.studioBoot) {
    parts.push(`Studio boot ${localGate.studioBoot.verdict || localGate.studioBoot.status || 'pending'} | findings ${browserFindingCount(localGate.studioBoot)}`);
  }
  return parts.join(' | ');
}

function browserFindingCount(run = null) {
  if (!run) return 0;
  const numericCount = Number(run.findingCount);
  if (Number.isFinite(numericCount)) return numericCount;
  return Array.isArray(run.findings) ? run.findings.length : 0;
}

function latestQAVerdict(run = null) {
  return run?.verdict || run?.status || 'pending';
}

function summarizeQABrowserRun(run = null) {
  if (!run) return 'No browser pass has been recorded yet.';
  return `${run.scenario || 'layout-pass'} | ${latestQAVerdict(run)} | findings ${browserFindingCount(run)}`;
}

function mergeBrowserRuns(latestRun = null, runs = []) {
  const merged = [];
  const seen = new Set();
  for (const run of [latestRun, ...(runs || [])]) {
    if (!run) continue;
    const key = run.id || `${run.scenario || 'browser-pass'}:${run.startedAt || run.completedAt || run.createdAt || 'latest'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(run);
  }
  return merged;
}

function buildQADeskSnapshot({ agent, workspace, status, qaState = null }) {
  const notebook = normalizeNotebookState(workspace);
  const normalizedQA = normalizeQAState(qaState);
  const scorecards = collectQAScorecards(normalizedQA.structuredReport);
  const latestBrowserRun = normalizedQA.latestBrowserRun || normalizedQA.browserRuns[0] || null;
  const browserRuns = mergeBrowserRuns(latestBrowserRun, normalizedQA.browserRuns).slice(0, 6);
  const localGate = normalizedQA.localGate;
  const localGateSummary = summarizeLocalGate(localGate);
  const currentGoal = normalizedQA.structuredBusy
    ? 'Running structured QA suite for the current ACE session.'
    : normalizedQA.browserBusy
      ? 'Running browser evidence capture for the current Studio view.'
      : hasLocalGateIssue(localGate)
        ? 'Review the latest local UI gate failures and browser guardrail evidence.'
      : scorecards.cards.length
        ? `Review ${scorecards.cards.length} scored QA card${scorecards.cards.length === 1 ? '' : 's'} and latest evidence.`
        : latestBrowserRun
          ? `Inspect browser QA evidence from ${latestBrowserRun.scenario || 'latest run'}.`
          : localGateOutputCount(localGate)
            ? 'Review the latest local UI gate before running additional QA.'
            : 'Run structured QA or a browser pass to populate the QA desk.';
  const waitingOnYou = [];
  if (!normalizedQA.structuredReport && !normalizedQA.structuredBusy) {
    waitingOnYou.push('Run Structured QA to publish scorecards in this session.');
  }
  if (!latestBrowserRun && !normalizedQA.browserBusy) {
    waitingOnYou.push('Run Browser Pass to capture visual QA evidence.');
  }
  if (latestBrowserRun && browserFindingCount(latestBrowserRun)) {
    waitingOnYou.push(`Review ${browserFindingCount(latestBrowserRun)} browser finding${browserFindingCount(latestBrowserRun) === 1 ? '' : 's'} from the latest run.`);
  }
  if (localGate?.unit && ['fail', 'failed', 'error'].includes(localGateVerdict(localGate.unit))) {
    const failedCount = Number(localGate.unit.failedCount || localGate.unit.failures?.length || 0);
    waitingOnYou.push(`Inspect ${failedCount} failing fast UI check${failedCount === 1 ? '' : 's'} from the latest local gate.`);
  }
  if (localGate?.studioBoot && ['weak', 'fail', 'failed', 'error'].includes(localGateVerdict(localGate.studioBoot))) {
    waitingOnYou.push(`Review the latest Studio boot guardrail run (${localGate.studioBoot.verdict || localGate.studioBoot.status || 'pending'}).`);
  }
  return {
    identity: { id: agent.id, name: agent.name, role: agent.role },
    status,
    focus: {
      summary: currentGoal,
      detail: agent.role,
    },
    metrics: {
      assignedTasks: scorecards.cards.length,
      queueSize: latestBrowserRun && latestQAVerdict(latestBrowserRun) !== 'pass' ? browserFindingCount(latestBrowserRun) : 0,
      outputs: (normalizedQA.structuredReport ? 1 : 0) + browserRuns.length + localGateOutputCount(localGate),
    },
    history: browserRuns.map((run) => ({
      id: run.id || `qa-run-${run.scenario || 'latest'}`,
      summary: summarizeQABrowserRun(run),
      detail: run.summary || run.notes || null,
      at: run.completedAt || run.startedAt || run.createdAt || null,
    })),
    userActions: waitingOnYou,
    handoff: null,
    sections: [
      {
        id: 'mission',
        label: 'Mission',
        kind: 'summary',
        value: DESK_MISSIONS['qa-lead'] || agent.role,
        detail: `Active page: ${notebook.activePage.title}`,
      },
      {
        id: 'current-goal',
        label: 'Current Goal',
        kind: 'summary',
        value: currentGoal,
        detail: normalizedQA.structuredBusy || normalizedQA.browserBusy
          ? 'QA desk is actively refreshing suite evidence.'
          : 'QA desk is read-only in v1 and does not own orchestrator tasks.',
      },
      {
        id: 'structured-qa',
        label: 'Structured QA',
        kind: 'qa-structured',
        report: normalizedQA.structuredReport,
        busy: normalizedQA.structuredBusy,
        scorecardCount: scorecards.cards.length,
        emptyState: 'No structured QA report loaded yet.',
      },
      {
        id: 'qa-scorecards',
        label: 'Structured QA Scorecards',
        kind: 'qa-scorecards',
        cards: scorecards.cards || [],
        definitions: scorecards.definitions || normalizeQAMetricDefinitions(),
        suiteStatus: scorecards.status || null,
        suiteSummary: scorecards.summary || '',
        meta: {
          deskCount: scorecards.deskCount || 0,
          testCount: scorecards.testCount || 0,
        },
        emptyState: normalizedQA.structuredReport
          ? 'Latest structured QA report does not include any scored test cards yet.'
          : 'Run structured QA to load test quality scorecards.',
      },
      {
        id: 'browser-pass',
        label: 'Browser Pass',
        kind: 'qa-browser',
        latestRun: latestBrowserRun,
        busy: normalizedQA.browserBusy,
        emptyState: 'No browser pass has been recorded yet.',
      },
      {
        id: 'local-ui-gates',
        label: 'Local UI Gate',
        kind: 'qa-local-gates',
        gate: localGate,
        summary: localGateSummary,
        emptyState: 'No local UI gate results recorded yet.',
      },
      {
        id: 'recent-qa-runs',
        label: 'Recent QA Runs',
        kind: 'qa-run-history',
        items: browserRuns.map((run) => ({
          id: run.id || `qa-run-${run.scenario || 'latest'}`,
          summary: `${run.scenario || 'layout-pass'} | ${latestQAVerdict(run)}`,
          detail: `Findings ${browserFindingCount(run)}${run.summary ? ` | ${run.summary}` : ''}`,
          at: run.completedAt || run.startedAt || run.createdAt || null,
          runId: run.id || null,
        })),
        emptyState: 'No browser QA runs recorded yet.',
      },
      {
        id: 'waiting-on-you',
        label: 'Waiting On You',
        kind: 'actions',
        items: waitingOnYou,
        emptyState: 'No manual QA follow-up needed right now.',
      },
    ],
  };
}

export function createInitialComments() {
  return Object.fromEntries(STATIONS.map((agent) => [agent.id, []]));
}

export function getStudioAgents() {
  return STATIONS.map((agent) => ({ ...agent }));
}

export function buildAgentSnapshots({ workspace, dashboardState, runs, agentComments, recentHistory = [], qaState = null }) {
  const systemGraph = systemGraphOf(workspace);
  const runtimeBoard = normalizeTeamBoardState({
    activePageId: workspace.activePageId,
    studio: {
      teamBoard: workspace.studio?.orchestrator?.teamBoard || workspace.studio?.teamBoard || createDefaultTeamBoard(),
      handoffs: workspace.studio?.handoffs || {},
      agentWorkers: workspace.studio?.agentWorkers || {},
    },
  });
  const workers = normalizeAgentWorkersState(workspace?.studio?.agentWorkers);
  const normalizedQA = normalizeQAState(qaState);
  const qaScorecards = collectQAScorecards(normalizedQA.structuredReport);
  const latestBrowserRun = normalizedQA.latestBrowserRun || normalizedQA.browserRuns[0] || null;
  return STATIONS.map((agent) => {
    const workerState = workers[agent.id] || {};
    const metrics = collectNodeMetrics(agent, systemGraph, workspace);
    const comments = agentComments?.[agent.id] || [];
    const outputs = recentRunSummary(runs).slice(0, 2);
    const intent = latestIntentReport(workspace);
    const runSignal = latestRunSignal(agent.id, runs);
    const reviewReport = agent.id === 'context-manager' ? intent : null;
    const governedDesk = workspace.studio?.orchestrator?.desks?.[agent.id] || null;
    const governedStatusMap = {
      running: 'processing',
      ready: 'queued',
      blocked: 'blocked',
      waiting: 'idle',
      complete: 'idle',
    };
    const status = agent.id === 'qa-lead'
      ? deriveStatus(agent, metrics, workspace, dashboardState, runSignal, normalizedQA)
      : (governedDesk?.localState ? (governedStatusMap[governedDesk.localState] || 'idle') : deriveStatus(agent, metrics, workspace, dashboardState, runSignal, normalizedQA));
    const recentActions = [
      ...(runSignal ? [`${runSignal.action}: ${runSignal.summary}`] : []),
      ...defaultRecentActions(agent, workspace, runs, normalizedQA),
      ...outputs,
    ].slice(0, 4);
    const profileName = workerState.displayName || workerState.name || agent.name;
    const profileRole = workerState.role || agent.role;
    const workload = agent.id === 'qa-lead'
      ? {
          assignedTasks: qaScorecards.cards.length,
          queueSize: latestBrowserRun && latestQAVerdict(latestBrowserRun) !== 'pass' ? browserFindingCount(latestBrowserRun) : 0,
          outputs: (normalizedQA.structuredReport ? 1 : 0) + mergeBrowserRuns(latestBrowserRun, normalizedQA.browserRuns).length + localGateOutputCount(normalizedQA.localGate),
        }
      : {
          assignedTasks: metrics.count,
          queueSize: metrics.queue,
          outputs: Math.max(outputs.length, runSignal ? 1 : 0),
        };
    return {
      ...agent,
      name: profileName,
      role: profileRole,
      workerState,
      status,
      statusDetail: statusDetail(status),
      workload,
      recentActions,
      comments,
      focusSummary: agent.id === 'context-manager' && intent
        ? `${intent.summary || 'Intent captured'} (${Math.round((intent.confidence || 0) * 100)}%)`
        : agent.id === 'qa-lead'
          ? (normalizedQA.structuredBusy
            ? 'Structured QA is running'
            : normalizedQA.browserBusy
              ? 'Browser QA is running'
              : (normalizedQA.structuredReport?.summary || summarizeLocalGate(normalizedQA.localGate) || summarizeQABrowserRun(latestBrowserRun)))
        : `${metrics.count} related items in workspace`,
      throughputLabel: agent.id === 'context-manager' && intent
        ? `${(intent.tasks || []).length} intent tasks / ${Math.round((intent.confidence || 0) * 100)}% confidence`
        : agent.id === 'qa-lead'
          ? `${qaScorecards.cards.length} scorecards / ${mergeBrowserRuns(latestBrowserRun, normalizedQA.browserRuns).length} browser runs / ${localGateOutputCount(normalizedQA.localGate)} local gates`
        : agent.id === 'executor'
          ? `${runtimeBoard.summary.review} ready to apply / ${runtimeBoard.summary.active} active`
          : `${metrics.count} tracked / ${metrics.queue} queued`,
      activityPulse: Boolean(runSignal?.status === 'running' || status === 'processing' || status === 'queued'),
      unresolved: Boolean(runSignal?.status === 'error' || status === 'blocked' || status === 'degraded' || status === 'review'),
      latestSignal: runSignal?.summary || governedDesk?.lastOutput || governedDesk?.currentGoal || reviewReport?.summary || null,
      latestRunStatus: runSignal?.status || governedDesk?.localState || null,
      latestRunSummary: runSignal?.summary || governedDesk?.blockedReason || governedDesk?.currentGoal || null,
      reviewReport,
      deskSnapshot: agent.id === 'context-manager'
        ? buildContextDeskSnapshot({
            agent,
            workspace: { ...workspace, history: recentHistory },
            dashboardState,
            runs,
            runSignal,
            status,
            metrics,
          })
        : buildGovernedDeskSnapshot({ agent, workspace, metrics, runs, runSignal, status, qaState: normalizedQA }),
    };
  });
}

