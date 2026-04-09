import { getOperationalRoles } from './roleTaxonomy.mjs';
import {
  getStudioDepartmentForDesk,
  getStudioDeskRecord,
  buildStudioOrgHealthModel,
} from './studioLayoutModel.js';

const STATIONS = [
  ...getOperationalRoles().map((role) => ({
    id: role.id,
    name: role.label,
    shortLabel: role.station.shortLabel,
    role: role.station.role,
    responsibility: role.station.responsibility,
    scope: [...role.station.scope],
    theme: { ...role.station.theme },
    position: { ...role.station.position },
    departmentId: role.departmentIds[0] || null,
    allowedDepartmentIds: [...role.allowedDepartmentIds],
    allowedDeskIds: [...role.allowedDeskIds],
    leadOfDepartmentIds: [...role.leadOfDepartmentIds],
    capabilities: [...role.capabilities],
    starterTemplate: { ...role.starterTemplate },
    mission: role.station.mission,
    isOversight: Boolean(role.station.isOversight),
  })),
];

const DESK_MISSIONS = Object.fromEntries(STATIONS.map((station) => [station.id, station.mission]));

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

const QA_SCORECARD_PASS_MIN = 3.5;
const QA_SCORECARD_WARN_MIN = 2.5;
const QA_SCORECARD_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const CANONICAL_QA_SCORECARD_FEEDBACK_STATUSES = new Set(['pass', 'fail', 'warn', 'stale', 'missing']);

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
  const registry = workspace?.intentState?.registry || null;
  if (!registry?.currentIntentId) return null;
  return registry.byId?.[registry.currentIntentId] || null;
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

function createTeamBoardCard({
  cards = [],
  pageId,
  handoffId,
  sourceNodeId,
  sourceIntentId = null,
  sourceIntakeId = null,
  sourceAnchorRefs = [],
  title,
  createdAt = null,
}) {
  const now = createdAt || new Date().toISOString();
  const canonicalSourceIntentId = sourceIntentId || sourceNodeId || null;
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
    sourceIntentId: canonicalSourceIntentId,
    sourceIntakeId: sourceIntakeId || null,
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
      sourceIntentId: canonicalSourceIntentId,
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
    sourceIntakeId: card.sourceIntakeId || null,
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
  const economy = deriveTaskEconomy({ cards, selectedCardId: selectedCard?.id || null });
  return {
    cards,
    selectedCardId: selectedCard?.id || null,
    updatedAt: new Date().toISOString(),
    summary: {
      plan: economy.intakeCount,
      active: economy.wipCount,
      complete: economy.completionCount,
      review: economy.bottleneckCount,
      assigned: cards.filter((card) => card.taskFlow?.assignmentState === 'assigned').length,
      handedOff: cards.filter((card) => card.taskFlow?.phase === 'handed_off').length,
      binned: economy.shelvedCount,
      idleWorkers: Number(board.summary?.idleWorkers || 0),
      backlogPressure: economy.backlogPressure,
      momentum: economy.momentum,
      rewardYield: economy.rewardYield,
      upgradeReadiness: economy.upgradeReadiness,
    },
  };
}

function clamp01(value = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

export function deriveTaskEconomy(board = {}) {
  const cards = Array.isArray(board.cards) ? board.cards.filter(Boolean) : [];
  const selectedCard = cards.find((card) => card.id === board.selectedCardId) || null;
  const intakeCards = cards.filter((card) => normalizeBoardStatus(card.status) === 'plan');
  const wipCards = cards.filter((card) => normalizeBoardStatus(card.status) === 'active');
  const completionCards = cards.filter((card) => normalizeBoardStatus(card.status) === 'complete');
  const rewardCards = cards.filter((card) => normalizeBoardStatus(card.status) === 'complete' && (
    card.approvalState === 'approved'
    || card.applyStatus === 'applied'
    || card.deployStatus === 'deployed'
  ));
  const bottleneckCards = cards.filter((card) => normalizeBoardStatus(card.status) === 'review'
    || card.approvalState === 'rejected'
    || ['flagged', 'failed'].includes(card.applyStatus)
    || ['flagged', 'failed'].includes(card.deployStatus));
  const shelvedCards = cards.filter((card) => normalizeBoardStatus(card.status) === 'binned');
  const total = Math.max(1, cards.length);
  const intakeCount = intakeCards.length;
  const wipCount = wipCards.length;
  const completionCount = completionCards.length;
  const rewardCount = rewardCards.length || completionCount;
  const bottleneckCount = bottleneckCards.length;
  const shelvedCount = shelvedCards.length;
  const readyLaneCount = intakeCount + wipCount + completionCount;
  const backlogPressure = Math.round(clamp01((intakeCount * 0.22) + (wipCount * 0.34) + (bottleneckCount * 0.44)) * 100);
  const momentum = Math.round(clamp01(((completionCount * 0.45) + (rewardCount * 0.35) + (wipCount * 0.2)) / total) * 100);
  const rewardYield = (rewardCount * 5) + (completionCount * 2) + (bottleneckCount ? 0 : 3);
  const upgradeReadiness = Math.round(clamp01(((rewardCount + completionCount + wipCount) / total) * 0.55 + (momentum / 100) * 0.3 - (backlogPressure / 100) * 0.2) * 100);
  const pressureTone = bottleneckCount > 0
    ? 'bad'
    : (backlogPressure >= 60 ? 'warn' : 'good');
  const rewardState = rewardCount > 0
    ? (bottleneckCount > 0 ? 'reward held at review' : 'reward unlocked')
    : 'reward locked';
  const backlogState = bottleneckCount > 0
    ? `${bottleneckCount} bottleneck${bottleneckCount === 1 ? '' : 's'} in review`
    : (wipCount > 0
      ? `${wipCount} work-in-progress card${wipCount === 1 ? '' : 's'} in flight`
      : `${intakeCount} intake card${intakeCount === 1 ? '' : 's'} waiting to move`);
  const lanes = [
    {
      id: 'intake',
      label: 'Intake',
      value: intakeCount,
      detail: intakeCount
        ? 'Queued for planning and scope shaping.'
        : 'No intake cards are waiting in the queue.',
    },
    {
      id: 'wip',
      label: 'Work-in-Progress',
      value: wipCount,
      detail: wipCount
        ? 'Active production lane with tasks in motion.'
        : 'No active tasks are burning cycles.',
    },
    {
      id: 'completion',
      label: 'Completion',
      value: completionCount,
      detail: completionCount
        ? 'Finished cards are waiting for reward conversion.'
        : 'No cards have reached completion yet.',
    },
    {
      id: 'reward',
      label: 'Reward',
      value: rewardCount,
      detail: rewardCount
        ? 'Validated work has unlocked visible payoff.'
        : 'No reward has been banked yet.',
    },
    {
      id: 'bottleneck',
      label: 'Bottleneck',
      value: bottleneckCount,
      detail: bottleneckCount
        ? 'Review or approval pressure is slowing the line.'
        : 'No bottlenecks are currently slowing throughput.',
    },
  ];

  return {
    cards,
    selectedCard,
    total,
    intakeCount,
    wipCount,
    completionCount,
    rewardCount,
    bottleneckCount,
    shelvedCount,
    readyLaneCount,
    backlogPressure,
    momentum,
    rewardYield,
    upgradeReadiness,
    pressureTone,
    rewardState,
    backlogState,
    lanes,
    headline: `${intakeCount} intake | ${wipCount} WIP | ${completionCount} completion | ${rewardCount} reward | ${bottleneckCount} bottleneck`,
    detail: `${backlogState}. Momentum ${momentum}% | pressure ${backlogPressure}% | upgrade readiness ${upgradeReadiness}%`,
    selectedLane: selectedCard
      ? {
          id: 'selected',
          label: 'Selected Card',
          value: selectedCard.title || selectedCard.id,
          detail: `${taskPhaseLabel(selectedCard.taskFlow?.phase || normalizeBoardStatus(selectedCard.status))} | ${taskAssignmentLabel(selectedCard.taskFlow?.assignmentState || 'unassigned')} | ${deriveCardState(selectedCard)}`,
        }
      : null,
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

export function buildPlannerInputContract(canonicalIntent = null, ghostProjection = null, dashboardState = {}) {
  const intent = canonicalIntent && typeof canonicalIntent === 'object' ? canonicalIntent : null;
  const ghost = ghostProjection && typeof ghostProjection === 'object' ? ghostProjection : null;
  const requestedOutcomes = uniqueStrings(Array.isArray(intent?.requestedOutcomes) ? intent.requestedOutcomes : []).slice(0, 4);
  const constraints = uniqueStrings([
    ...(Array.isArray(intent?.constraints) ? intent.constraints : []),
    ...(Array.isArray(dashboardState?.blockers) ? dashboardState.blockers : []),
  ]).slice(0, 8);
  const missingFields = [];
  if (!intent?.id) missingFields.push('intent.id');
  if (!ghost?.id) missingFields.push('ghost.id');
  if (intent?.id && Array.isArray(ghost?.sourceIntentIds) && !ghost.sourceIntentIds.includes(intent.id)) {
    missingFields.push('ghost.sourceIntentIds');
  }
  if (!requestedOutcomes.length) missingFields.push('intent.requestedOutcomes');
  return {
    id: intent?.id || ghost?.id || makeId('planner-input'),
    intentId: intent?.id || null,
    ghostProjectionId: ghost?.id || null,
    status: missingFields.length ? 'blocked' : 'ready',
    missingFields,
    generatedAt: intent?.provenance?.createdAt || intent?.createdAt || ghost?.provenance?.createdAt || new Date().toISOString(),
    confidence: Number.isFinite(Number(intent?.confidence)) ? Number(intent.confidence) : Number.isFinite(Number(ghost?.confidence)) ? Number(ghost.confidence) : 0,
    provenance: {
      intentId: intent?.id || null,
      ghostProjectionId: ghost?.id || null,
      createdAt: intent?.provenance?.createdAt || intent?.createdAt || ghost?.provenance?.createdAt || new Date().toISOString(),
      intentProvenance: intent?.provenance || null,
      ghostProvenance: ghost?.provenance || null,
    },
    intent,
    ghost,
    requestedOutcomes,
    constraints,
  };
}

export function createPlannerHandoff(canonicalIntent, ghostProjection = null, dashboardState = {}, previousHandoff = null) {
  if (!canonicalIntent) return null;
  const plannerInput = buildPlannerInputContract(canonicalIntent, ghostProjection, dashboardState);
  const requestedOutcomes = plannerInput.requestedOutcomes;
  const constraints = plannerInput.constraints;
  const clarifications = [];
  if (Number(canonicalIntent.confidence || 0) < 0.55) clarifications.push('Intent confidence is low and should be checked before execution expands.');
  if (!requestedOutcomes.length) clarifications.push('No concrete requested outcomes were extracted from the canonical intent.');
  if (!canonicalIntent.projectContext?.matchedTerms?.length) clarifications.push('Project alignment is weak, so planner scope may need refinement.');
  if (!plannerInput.ghostProjectionId) clarifications.push('No ghost projection is attached to the planner input contract.');
  if (plannerInput.status === 'blocked') clarifications.push(`Planner input contract is blocked because: ${plannerInput.missingFields.join(', ')}.`);
  const rationale = [];
  if (canonicalIntent.status) rationale.push(`intent ${canonicalIntent.status}`);
  if (plannerInput.ghost?.status) rationale.push(`ghost ${plannerInput.ghost.status}`);
  if (Number.isFinite(Number(canonicalIntent.confidence))) rationale.push(`${Math.round(Number(canonicalIntent.confidence) * 100)}% confidence`);
  const problemStatement = [
    `Goal: ${canonicalIntent.summary || 'Clarify the next problem to solve.'}`,
    requestedOutcomes.length ? `Requested outcomes: ${requestedOutcomes.join('; ')}.` : 'Requested outcomes: no concrete task list extracted yet.',
    rationale.length ? `Why ACE believes this: ${rationale.join(', ')}.` : null,
    constraints.length ? `Constraints and review signals: ${constraints.join(' | ')}.` : 'Constraints and review signals: none surfaced from the latest report.',
    clarifications.length ? `Still unclear: ${clarifications.join(' ')}` : 'Still unclear: no immediate clarification requested.',
  ].filter(Boolean).join('\n');

  return {
    id: previousHandoff?.sourceIntentId === canonicalIntent.id ? (previousHandoff.id || makeId('handoff')) : makeId('handoff'),
    sourceAgentId: 'context-manager',
    targetAgentId: 'planner',
    createdAt: plannerInput.generatedAt,
    sourceNodeId: canonicalIntent.nodeId || canonicalIntent.sourceRef || canonicalIntent.id || null,
    sourceIntentId: canonicalIntent.id || null,
    ghostProjectionId: plannerInput.ghostProjectionId,
    summary: canonicalIntent.summary || 'Intent ready for planner review.',
    problemStatement,
    anchorRefs: Array.isArray(canonicalIntent.anchorRefs) ? canonicalIntent.anchorRefs.filter(Boolean) : [],
    goal: canonicalIntent.goal || canonicalIntent.summary || '',
    requestedOutcomes,
    tasks: requestedOutcomes,
    constraints,
    confidence: plannerInput.confidence,
    criteria: [],
    truth: null,
    scores: null,
    classification: { role: 'context', labels: [] },
    requestType: canonicalIntent.requestType || 'context_request',
    urgency: canonicalIntent.priority || canonicalIntent.urgency || 'normal',
    targets: Array.isArray(canonicalIntent.targets) ? canonicalIntent.targets.slice(0, 8) : [],
    signals: null,
    plannerInputContract: plannerInput,
    status: plannerInput.status === 'blocked' || clarifications.length ? 'needs-clarification' : 'ready',
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

function buildDeskStatusLabel({ deskId, localState, handoff, plannerToContext = null, contextWorker = {}, plannerWorker = {}, workItems = [], taskEconomy = null }) {
  const plannerFeedbackActive = isPlannerFeedbackActive(plannerToContext, handoff);
  if (deskId === 'context-manager') {
    if (contextWorker.status === 'running') return 'Refreshing context';
    if (plannerFeedbackActive) return plannerToContext?.action === 'bin-candidate' ? 'Reviewing bin candidate' : 'Retrying context';
    if (handoff?.status === 'needs-clarification') return 'Clarification needed';
    if (handoff?.id) return 'Context published';
    return 'Idle';
  }
  if (deskId === 'planner') {
    if (taskEconomy?.bottleneckCount) return 'Task bottleneck';
    if (taskEconomy?.intakeCount) return 'Intake flowing';
    if (taskEconomy?.wipCount) return 'Production line';
    if (taskEconomy?.rewardCount) return 'Reward ready';
    if (plannerWorker.status === 'running') return 'Planning';
    if (plannerFeedbackActive) return plannerToContext?.action === 'bin-candidate' ? 'Bin candidate' : 'Needs context retry';
    if (handoff?.status === 'needs-clarification') return 'Needs clarification';
    if (workItems.some((item) => item.kind === 'planned-card')) return 'Cards ready';
    if (workItems.some((item) => item.kind === 'planner-ready-handoff')) return 'Handoff ready';
    return localState === 'ready' ? 'Queued' : 'Idle';
  }
  if (deskId === 'executor') {
    if (taskEconomy?.bottleneckCount) return 'Production blocked';
    if (taskEconomy?.wipCount) return 'Production running';
    if (taskEconomy?.rewardCount) return 'Reward pending';
    if (taskEconomy?.intakeCount) return 'Queue building';
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

function buildDeskStatusDetail({ deskId, localState, handoff, plannerToContext = null, contextWorker = {}, plannerWorker = {}, workItems = [], taskEconomy = null }) {
  const plannerFeedbackActive = isPlannerFeedbackActive(plannerToContext, handoff);
  if (deskId === 'context-manager') {
    if (contextWorker.status === 'running') return contextWorker.statusReason || 'Drafting a planner-facing context packet.';
    if (plannerFeedbackActive) return plannerToContext?.detail || 'Planner requested a tighter context retry.';
    if (handoff?.status === 'needs-clarification') return 'The current planner handoff still needs clarification before planning can proceed.';
    if (handoff?.id) return 'The latest context packet has been published and is waiting on downstream use.';
    return 'Waiting for the next source context input.';
  }
  if (deskId === 'planner') {
    if (taskEconomy?.bottleneckCount) return `${taskEconomy.bottleneckCount} review bottleneck${taskEconomy.bottleneckCount === 1 ? '' : 's'} are slowing the planning lane.`;
    if (taskEconomy?.rewardCount) return `${taskEconomy.rewardCount} reward-ready card${taskEconomy.rewardCount === 1 ? '' : 's'} are ready to convert into visible payoff.`;
    if (taskEconomy?.wipCount) return `${taskEconomy.wipCount} work-in-progress card${taskEconomy.wipCount === 1 ? '' : 's'} are moving through planning.`;
    if (taskEconomy?.intakeCount) return `${taskEconomy.intakeCount} intake card${taskEconomy.intakeCount === 1 ? '' : 's'} are waiting to be shaped into work.`;
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
    if (taskEconomy?.bottleneckCount) return `${taskEconomy.bottleneckCount} production bottleneck${taskEconomy.bottleneckCount === 1 ? '' : 's'} need review before the line can move again.`;
    if (taskEconomy?.rewardCount) return `${taskEconomy.rewardCount} reward-ready card${taskEconomy.rewardCount === 1 ? '' : 's'} are waiting for executor validation.`;
    if (taskEconomy?.wipCount) return `${taskEconomy.wipCount} work-in-progress card${taskEconomy.wipCount === 1 ? '' : 's'} are actively being processed.`;
    if (taskEconomy?.intakeCount) return `${taskEconomy.intakeCount} intake card${taskEconomy.intakeCount === 1 ? '' : 's'} are waiting to enter production.`;
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
  const taskEconomy = deriveTaskEconomy({ cards, selectedCardId: board.selectedCardId });
  return {
    ...board,
    cards,
    updatedAt: now,
    summary: {
      plan: taskEconomy.intakeCount,
      active: taskEconomy.wipCount,
      complete: taskEconomy.completionCount,
      review: taskEconomy.bottleneckCount,
      assigned: cards.filter((card) => card.taskFlow?.assignmentState === 'assigned').length,
      handedOff: cards.filter((card) => card.taskFlow?.phase === 'handed_off').length,
      binned: taskEconomy.shelvedCount,
      idleWorkers: countIdleWorkers(deskStates),
      backlogPressure: taskEconomy.backlogPressure,
      momentum: taskEconomy.momentum,
      rewardYield: taskEconomy.rewardYield,
      upgradeReadiness: taskEconomy.upgradeReadiness,
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
  const baseTaskEconomy = deriveTaskEconomy(baseBoard);
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
      taskEconomy: baseTaskEconomy,
    });
    const statusDetail = buildDeskStatusDetail({
      deskId: agent.id,
      localState: localStatus,
      handoff,
      plannerToContext,
      contextWorker,
      plannerWorker,
      workItems,
      taskEconomy: baseTaskEconomy,
    });
    return [agent.id, {
      mission: DESK_MISSIONS[agent.id],
      localState: localStatus,
      statusLabel,
      statusDetail,
      taskEconomy: baseTaskEconomy,
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
      taskEconomy: baseTaskEconomy,
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
  const taskEconomy = deriveTaskEconomy(board);
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
  const workload = agent.id === 'qa-lead'
    ? {
          assignedTasks: Number(qaState?.structuredReport?.tests?.length || qaState?.structuredReport?.scorecards?.length || 0),
          queueSize: Number((qaState?.browserRuns?.length || qaState?.structuredBusy) ? 1 : 0),
          outputs: Number((qaState?.structuredReport ? 1 : 0) + (qaState?.browserRuns?.length || 0) + (qaState?.localGate ? 1 : 0)),
      }
    : {
        assignedTasks: metrics.count,
        queueSize: metrics.queue,
        outputs: Math.max(history.length, runSignal ? 1 : 0),
      };

  return {
    identity: {
      id: agent.id,
      name: agent.name,
      role: agent.role,
    },
    status,
    department: {
      id: agent.id,
      label: agent.name,
      owner: 'memory-archivist',
      summary: report?.projectContext?.currentFocus || governedDesk?.mission || 'Context intake lane',
    },
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
    reports: [
      report?.summary || null,
      handoff?.summary || null,
      plannerToContext?.detail || null,
      ...history.slice(0, 2).map((entry) => entry.summary || entry.detail || null),
    ].filter(Boolean),
    scorecards: [],
    assessments: [
      {
        id: 'context-confidence',
        summary: `Confidence ${Math.round((report?.confidence || 0) * 100)}%`,
        verdict: Number(report?.confidence || 0) < 0.55 ? 'review' : 'pass',
      },
      ...(contextWorker?.lastUsedFallback ? [{
        id: 'context-fallback',
        summary: 'Context worker used deterministic fallback',
        verdict: 'review',
      }] : []),
    ],
    context: {
      summary: report?.summary || 'Watching current context intake and workspace signals.',
      detail: report?.truth?.plannerBrief || report?.projectContext?.currentFocus || 'No active project focus reported.',
      slices: taskCards.slice(0, 3).map((record) => ({
        id: record.id,
        summary: record.title,
        detail: taskTrailSummary(record.taskFlow),
      })),
    },
    guardrails: [
      ...(dashboardState?.blockers || []).slice(0, 2),
      ...(contextWorker?.lastBlockedReason ? [contextWorker.lastBlockedReason] : []),
    ],
    history,
    userActions,
    handoff,
    taskEconomy,
    sections: [
      {
        id: 'desk-truth',
        label: 'Desk Truth',
        kind: 'desk-truth',
        truth: {
          department: 'Context Intake',
          workload,
          throughput: taskEconomy.throughputLabel || `${taskEconomy.intakeCount} intake / ${taskEconomy.wipCount} WIP`,
          reports: [
            report?.summary || null,
            handoff?.summary || null,
            plannerToContext?.detail || null,
          ].filter(Boolean),
          scorecards: [],
          assessments: [
            `Confidence ${Math.round((report?.confidence || 0) * 100)}%`,
            ...(contextWorker?.lastUsedFallback ? ['Context worker used deterministic fallback'] : []),
          ],
          context: report?.truth?.plannerBrief || report?.projectContext?.currentFocus || 'No active project focus reported.',
          guardrails: [
            ...(dashboardState?.blockers || []).slice(0, 2),
            ...(contextWorker?.lastBlockedReason ? [contextWorker.lastBlockedReason] : []),
          ],
        },
      },
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
  const taskEconomy = deriveTaskEconomy(board);
  const dashboardState = workspace.dashboardState || workspace.studio?.dashboardState || {};
  const plannerProducedCards = board.cards.filter((card) => (plannerWorker.lastProducedCardIds || []).includes(card.id));
  const selectedExecutionCard = getSelectedExecutionCard(workspace);
  const history = recentRunSummary(runs).map((entry, index) => ({ id: `${agent.id}-history-${index}`, summary: entry }));
  const normalizedQA = normalizeQAState(qaState);
  const qaLeadState = normalizeQALeadRunnerPayload(normalizedQA.qaLead || null);
  const qaLeadLatestRun = normalizeQALeadRunnerPayload(normalizedQA.qaLeadLatestRun || (Array.isArray(normalizedQA.qaLeadRuns) ? normalizedQA.qaLeadRuns[0] : null) || null);
  const qaLeadFeed = selectQALeadFeed({
    qa: normalizedQA,
    qaLeadState,
    qaLeadLatestRun,
  });
  const qaScorecards = agent.id === 'cto-architect' ? resolveQAScorecardBundle(normalizedQA) : null;
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
      id: 'planner-task-economy',
      label: 'Task Economy',
      kind: 'task-economy',
      economy: taskEconomy,
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
    {
      id: 'qa-output-feed',
      label: 'QA Output Feed',
      kind: 'qa-output-feed',
      feed: qaLeadFeed,
      summary: qaLeadFeed.length
        ? `${qaLeadFeed.length} QA output item${qaLeadFeed.length === 1 ? '' : 's'} available for executor review.`
        : 'No QA output feed is available yet.',
      emptyState: 'No QA output feed is available yet.',
    },
    {
      id: 'executor-task-economy',
      label: 'Task Economy',
      kind: 'task-economy',
      economy: taskEconomy,
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
  const intent = latestIntentReport(workspace);
  const archivedContext = workspace.architectureMemory?.latestContext || intent || null;
  const guardrailSummary = [
    governedDesk?.blockedReason,
    selfUpgrade?.requiresPermission ? `Permission: ${selfUpgrade.requiresPermission}` : null,
    hasLocalGateIssue(normalizedQA.localGate) ? summarizeLocalGate(normalizedQA.localGate) : null,
  ].filter(Boolean);
  const workload = agent.id === 'qa-lead'
    ? {
        assignedTasks: Number(qaState?.structuredReport?.tests?.length || qaState?.structuredReport?.scorecards?.length || 0),
        queueSize: Number((qaState?.browserRuns?.length || qaState?.structuredBusy) ? 1 : 0),
        outputs: Number((qaState?.structuredReport ? 1 : 0) + (qaState?.browserRuns?.length || 0) + (qaState?.localGate ? 1 : 0)),
      }
    : {
        assignedTasks: metrics.count,
        queueSize: metrics.queue,
        outputs: Math.max(history.length, runSignal ? 1 : 0),
      };
  const deskTruth = {
    department: agent.id === 'memory-archivist'
      ? 'Memory Archive'
      : (agent.id === 'cto-architect'
        ? 'CTO Control Tower'
        : `${agent.name} Desk`),
    workload,
    throughput: agent.id === 'memory-archivist'
      ? `${(workspace.annotations || []).length} annotations / ${(workspace.sketches || []).length} sketches`
      : (agent.id === 'cto-architect'
        ? `${guardrailSummary.length} guardrails / ${qaScorecards.cards.length} scorecards`
        : taskEconomy.throughputLabel),
    reports: agent.id === 'memory-archivist'
      ? [
          archivedContext?.summary || null,
          ...(workspace.architectureMemory?.versions || []).slice(0, 2).map((entry) => entry.summary || entry.title || entry.label || null),
        ].filter(Boolean)
      : (agent.id === 'cto-architect'
        ? [
            qaScorecards.summary || null,
            latestQARun?.summary || null,
            ...(history.slice(0, 2).map((entry) => entry.summary)),
          ].filter(Boolean)
        : [
            governedDesk?.lastOutput || null,
            runSignal?.summary || null,
            ...(history.slice(0, 2).map((entry) => entry.summary)),
          ].filter(Boolean)),
    scorecards: agent.id === 'qa-lead' || agent.id === 'cto-architect' ? qaScorecards.cards : [],
    assessments: agent.id === 'qa-lead'
      ? mergeBrowserRuns(latestBrowserRun, normalizedQA.browserRuns).slice(0, 3).map((run) => ({
          id: run.id,
          summary: summarizeQABrowserRun(run),
          verdict: latestQAVerdict(run),
        }))
      : (agent.id === 'cto-architect'
        ? [
            {
              id: 'guardrails',
              summary: guardrailSummary[0] || 'CTO guardrails are active.',
              verdict: guardrailSummary.length ? 'review' : 'pass',
            },
            {
              id: 'self-upgrade',
              summary: selfUpgrade?.status ? `Self upgrade ${selfUpgrade.status}` : 'No self upgrade in motion.',
              verdict: selfUpgrade?.status === 'blocked' ? 'review' : 'pass',
            },
          ]
        : (governedDesk?.blockedReason ? [{
            id: `${agent.id}-blocker`,
            summary: governedDesk.blockedReason,
            verdict: 'blocked',
          }] : [])),
    context: agent.id === 'memory-archivist'
      ? (archivedContext?.truth?.plannerBrief || archivedContext?.summary || 'Memory Archivist owns canonical context slices.')
      : (agent.id === 'cto-architect'
        ? (workspace.studio?.selfUpgrade?.patchReview?.summary || workspace.studio?.selfUpgrade?.status || 'Managing department guardrails and desk ownership.')
        : (governedDesk?.mission || `${metrics.count} related items in workspace`)),
    guardrails: agent.id === 'cto-architect'
      ? guardrailSummary
      : (agent.id === 'memory-archivist'
        ? [
            'Archivist owns canonical context and archival history.',
            'CTO oversight controls desk ownership and guardrails.',
          ]
        : (dashboardState?.blockers || []).slice(0, 2)),
  };
  return {
    identity: { id: agent.id, name: agent.name, role: agent.role },
    status,
    department: {
      id: agent.id,
      label: agent.name,
      owner: agent.id === 'memory-archivist' ? 'memory-archivist' : (agent.id === 'cto-architect' ? 'cto-architect' : 'studio'),
      summary: deskTruth.context,
    },
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
    workload,
    throughput: deskTruth.throughput,
    reports: deskTruth.reports,
    scorecards: deskTruth.scorecards,
    assessments: deskTruth.assessments,
    context: deskTruth.context,
    guardrails: deskTruth.guardrails,
    truth: deskTruth,
    history,
    userActions: [
      ...(governedDesk?.blockedReason ? [governedDesk.blockedReason] : []),
      ...(agent.id === 'planner' && plannerToContext?.sourceHandoffId && plannerToContext.sourceHandoffId === handoff?.id ? [plannerToContext.detail || plannerToContext.summary].filter(Boolean) : []),
    ],
    handoff: agent.id === 'planner' ? handoff : null,
    sections: [
      {
        id: 'desk-truth',
        label: 'Desk Truth',
        kind: 'desk-truth',
        truth: deskTruth,
      },
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
    taskEconomy,
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
  const qaScorecards = resolveQAScorecardBundle(normalizedQA);
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
  const qaScorecards = resolveQAScorecardBundle(normalizedQA);
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

function normalizeQAScorecardResultStatus(status = '') {
  const normalized = String(status || '').trim().toLowerCase();
  if (!normalized) return 'missing';
  if (['pass', 'ok', 'ready', 'validated'].includes(normalized)) return 'pass';
  if (['fail', 'failed', 'error', 'blocked'].includes(normalized)) return 'fail';
  if (['warn', 'warning', 'review', 'degraded', 'unavailable'].includes(normalized)) return 'warn';
  if (normalized === 'stale') return 'stale';
  if (['missing', 'unknown'].includes(normalized)) return 'missing';
  return 'warn';
}

function normalizeQAScorecardFeedbackStatus(status = '') {
  const normalized = normalizeQAScorecardResultStatus(status);
  return CANONICAL_QA_SCORECARD_FEEDBACK_STATUSES.has(normalized) ? normalized : null;
}

function normalizeQAScorecardFreshness(trace = null, updatedAt = null) {
  const traceFreshness = String(trace?.freshnessClass || '').trim().toLowerCase();
  if (['fresh', 'derived_current', 'live_canonical'].includes(traceFreshness)) return 'fresh';
  if (traceFreshness === 'missing') return 'missing';
  if (traceFreshness === 'stale') return 'stale';
  if (traceFreshness === 'non_executable') return 'missing';
  const parsed = Date.parse(String(updatedAt || '').trim());
  if (Number.isFinite(parsed) && (Date.now() - parsed) > QA_SCORECARD_STALE_AFTER_MS) {
    return 'stale';
  }
  if (trace || updatedAt) return 'fresh';
  return 'missing';
}

function deriveQAScorecardScoreBand(overallScore = null) {
  const value = Number(overallScore?.value);
  if (!Number.isFinite(value)) {
    return {
      value: null,
      status: 'missing',
    };
  }
  if (value >= QA_SCORECARD_PASS_MIN) {
    return { value, status: 'pass' };
  }
  if (value >= QA_SCORECARD_WARN_MIN) {
    return { value, status: 'warn' };
  }
  return { value, status: 'fail' };
}

function summarizeQAScorecardRollup({
  desk = null,
  testName = null,
  rollupStatus = 'missing',
  rollupReasons = [],
} = {}) {
  const label = [desk || 'desk', testName || 'scorecard'].filter(Boolean).join(' | ');
  const reason = Array.isArray(rollupReasons) && rollupReasons.length
    ? rollupReasons[0]
    : 'Scorecard source details are unavailable.';
  return `${label}: ${rollupStatus}. ${reason}`;
}

function buildQAScorecardCounts(cards = []) {
  return {
    pass: cards.filter((card) => (card.rollupStatus || 'missing') === 'pass').length,
    warn: cards.filter((card) => (card.rollupStatus || 'missing') === 'warn').length,
    stale: cards.filter((card) => (card.rollupStatus || 'missing') === 'stale').length,
    fail: cards.filter((card) => (card.rollupStatus || 'missing') === 'fail').length,
    missing: cards.filter((card) => (card.rollupStatus || 'missing') === 'missing').length,
  };
}

function collectQAScorecards(qaReport = null) {
  const definitions = normalizeQAMetricDefinitions(qaReport?.metricDefinitions || null);
  const reportTrace = qaReport?.sourceTrace || null;
  const cards = [];

  for (const [deskIndex, desk] of (qaReport?.desks || []).entries()) {
    for (const [testIndex, test] of (desk?.tests || []).entries()) {
      if (!test?.qualityCard) continue;
      const qualityCard = test.qualityCard && typeof test.qualityCard === 'object' ? test.qualityCard : {};
      const deskId = qualityCard.desk || desk.desk || null;
      const testId = qualityCard.testId || test.name || null;
      const testName = qualityCard.testName || test.name || 'Unnamed QA test';
      const reportedStatus = normalizeQAScorecardResultStatus(test.status || qualityCard.status || '');
      const qaFeedbackStatus = normalizeQAScorecardFeedbackStatus(test.status || qualityCard.status || '');
      const freshness = normalizeQAScorecardFreshness(
        reportTrace,
        qualityCard.updatedAt || qaReport?.finishedAt || qaReport?.updatedAt || qaReport?.createdAt || null,
      );
      const scoreBand = deriveQAScorecardScoreBand(qualityCard.overallScore || null);
      const validation = qualityCard.validation && typeof qualityCard.validation === 'object'
        ? qualityCard.validation
        : null;
      const validationStatus = validation
        ? (validation.ok ? 'pass' : 'fail')
        : 'missing';
      const rollupReasons = [];
      if (validationStatus === 'fail') {
        rollupReasons.push(validation.summary || 'Scorecard schema validation failed.');
      }
      if (reportedStatus === 'fail') {
        rollupReasons.push(`Structured test result reported fail for ${testName}.`);
      } else if (reportedStatus === 'warn') {
        rollupReasons.push(`Structured test result reported warn for ${testName}.`);
      } else if (reportedStatus === 'missing') {
        rollupReasons.push(`Structured test result status is missing for ${testName}.`);
      }
      if (freshness === 'stale') {
        rollupReasons.push('Structured QA report is stale, so this scorecard cannot be treated as fresh.');
      } else if (freshness === 'missing') {
        rollupReasons.push('Structured QA report source trace is missing for this scorecard.');
      }
      if (scoreBand.status === 'fail') {
        rollupReasons.push(`Overall score ${scoreBand.value ?? 'n/a'} is below the fail threshold ${QA_SCORECARD_WARN_MIN}.`);
      } else if (scoreBand.status === 'warn') {
        rollupReasons.push(`Overall score ${scoreBand.value ?? 'n/a'} is below the pass threshold ${QA_SCORECARD_PASS_MIN}.`);
      } else if (scoreBand.status === 'missing') {
        rollupReasons.push('Overall score is missing.');
      }

      let rollupStatus = 'missing';
      if (freshness === 'missing') {
        rollupStatus = 'missing';
      } else if (validationStatus === 'fail' || reportedStatus === 'fail' || scoreBand.status === 'fail') {
        rollupStatus = 'fail';
      } else if (freshness === 'stale') {
        rollupStatus = 'stale';
      } else if (reportedStatus === 'warn' || reportedStatus === 'stale' || reportedStatus === 'missing' || scoreBand.status === 'warn') {
        rollupStatus = 'warn';
      } else if (validationStatus === 'pass' && freshness === 'fresh' && scoreBand.status === 'pass') {
        rollupStatus = 'pass';
      }

      cards.push({
        ...qualityCard,
        classification: 'derived_projection',
        sourceSeam: 'structured_qa_report',
        sourcePath: reportTrace?.sourcePath || 'data/spatial/qa/structured/latest.json',
        sourceRecordPath: `desks[${deskIndex}].tests[${testIndex}]`,
        desk: deskId,
        status: reportedStatus,
        reportedStatus,
        qaFeedbackStatus,
        rollupStatus,
        scoreBandStatus: scoreBand.status,
        freshness,
        validationStatus,
        failureOwnerDeskId: deskId,
        testId,
        testName,
        thresholds: {
          passMin: QA_SCORECARD_PASS_MIN,
          warnMin: QA_SCORECARD_WARN_MIN,
        },
        rollupReasons,
        summary: summarizeQAScorecardRollup({
          desk: deskId,
          testName,
          rollupStatus,
          rollupReasons,
        }),
        sourceTrace: reportTrace ? {
          ...reportTrace,
          kind: 'scorecard',
          label: testName || 'Structured QA scorecard',
          detail: `${deskId || 'desk'} | ${test.name || testId || 'test'}`,
          freshnessClass: freshness === 'fresh' ? 'derived_current' : freshness,
          derivedFrom: reportTrace.sourcePath || null,
          sourceArtifacts: [
            {
              path: reportTrace.sourcePath || 'data/spatial/qa/structured/latest.json',
              label: 'Structured QA report',
              kind: 'report',
              freshnessClass: freshness === 'fresh' ? 'derived_current' : freshness,
              observedAt: reportTrace.observedAt || qualityCard.updatedAt || null,
            },
            {
              path: `${deskId || 'desk'}:${test.name || testId || 'test'}`,
              label: 'Structured test result',
              kind: 'test-result',
              freshnessClass: freshness === 'fresh' ? 'derived_current' : freshness,
              observedAt: reportTrace.observedAt || qualityCard.updatedAt || null,
              derivedFrom: reportTrace.sourcePath || null,
            },
          ],
        } : null,
      });
    }
  }

  cards.sort((left, right) => {
    const deskCompare = String(left.desk || '').localeCompare(String(right.desk || ''));
    if (deskCompare !== 0) return deskCompare;
    const testCompare = String(left.testName || left.testId || '').localeCompare(String(right.testName || right.testId || ''));
    if (testCompare !== 0) return testCompare;
    return String(left.id || '').localeCompare(String(right.id || ''));
  });

  const counts = buildQAScorecardCounts(cards);
  const status = !qaReport
    ? 'missing'
    : cards.length === 0
      ? 'missing'
      : counts.fail > 0
        ? 'fail'
        : counts.stale > 0
          ? 'stale'
          : counts.warn > 0 || counts.missing > 0
            ? 'warn'
            : 'pass';
  const deskCount = new Set(cards.map((card) => String(card.desk || '').trim()).filter(Boolean)).size;

  return {
    classification: 'derived_projection',
    sourceSeam: 'structured_qa_report',
    status,
    summary: !qaReport
      ? 'Structured QA report is missing, so no scorecards can be derived.'
      : !cards.length
        ? 'Structured QA report did not include any quality cards.'
        : `${cards.length} scorecards | ${counts.pass} pass | ${counts.warn} warn | ${counts.stale} stale | ${counts.fail} fail | ${counts.missing} missing`,
    deskCount,
    testCount: cards.length,
    definitions,
    cards,
    counts,
  };
}

function resolveQAScorecardBundle(qaState = null) {
  const qa = qaState && typeof qaState === 'object' ? qaState : {};
  const cards = Array.isArray(qa.scorecards) ? qa.scorecards.filter(Boolean) : [];
  const hasPayloadBundle = cards.length
    || qa.scorecardStatus
    || qa.scorecardSummary
    || qa.scorecardDefinitions;
  if (!hasPayloadBundle) {
    return collectQAScorecards(qa.structuredReport || null);
  }
  const counts = buildQAScorecardCounts(cards);
  const deskCount = Number.isFinite(Number(qa.scorecardDeskCount))
    ? Number(qa.scorecardDeskCount)
    : new Set(cards.map((card) => String(card?.desk || '').trim()).filter(Boolean)).size;
  const testCount = Number.isFinite(Number(qa.scorecardCount))
    ? Number(qa.scorecardCount)
    : cards.length;
  const status = qa.scorecardStatus || (
    cards.length === 0
      ? 'missing'
      : counts.fail > 0
        ? 'fail'
        : counts.stale > 0
          ? 'stale'
          : counts.warn > 0 || counts.missing > 0
            ? 'warn'
            : 'pass'
  );
  const summary = String(qa.scorecardSummary || '').trim() || (
    cards.length
      ? `${cards.length} scorecards | ${counts.pass} pass | ${counts.warn} warn | ${counts.stale} stale | ${counts.fail} fail | ${counts.missing} missing`
      : 'Structured QA report is missing, so no scorecards can be derived.'
  );
  return {
    classification: 'derived_projection',
    sourceSeam: 'structured_qa_report',
    status,
    summary,
    deskCount,
    testCount,
    definitions: normalizeQAMetricDefinitions(qa.scorecardDefinitions || null),
    cards,
    counts,
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
    scorecards: Array.isArray(qaState?.scorecards) ? qaState.scorecards.filter(Boolean) : [],
    scorecardDefinitions: qaState?.scorecardDefinitions || null,
    scorecardStatus: qaState?.scorecardStatus || null,
    scorecardSummary: qaState?.scorecardSummary || '',
    scorecardCount: Number.isFinite(Number(qaState?.scorecardCount)) ? Number(qaState.scorecardCount) : null,
    scorecardDeskCount: Number.isFinite(Number(qaState?.scorecardDeskCount)) ? Number(qaState.scorecardDeskCount) : null,
    latestBrowserRun: qaState?.latestBrowserRun || null,
    browserRuns: Array.isArray(qaState?.browserRuns) ? qaState.browserRuns.filter(Boolean) : [],
    browserBusy: Boolean(qaState?.browserBusy),
    localGate: normalizeLocalGateState(qaState?.localGate),
    externalValidation: qaState?.externalValidation || null,
    qaLead: qaState?.qaLead || null,
    qaLeadRuns: Array.isArray(qaState?.qaLeadRuns) ? qaState.qaLeadRuns.filter(Boolean) : [],
    qaLeadLatestRun: qaState?.qaLeadLatestRun || null,
    qaLiveCycle: qaState?.qaLiveCycle || qaState?.qa_live_cycle || null,
    outputFeedLoaded: Boolean(qaState?.outputFeedLoaded || qaState?.output_feed_loaded),
    outputFeed: Array.isArray(qaState?.outputFeed)
      ? qaState.outputFeed.filter(Boolean)
      : (Array.isArray(qaState?.output_feed) ? qaState.output_feed.filter(Boolean) : []),
    openInvestigations: Array.isArray(qaState?.openInvestigations)
      ? qaState.openInvestigations.filter(Boolean)
      : (Array.isArray(qaState?.investigations) ? qaState.investigations.filter(Boolean) : []),
    researchNotes: Array.isArray(qaState?.researchNotes)
      ? qaState.researchNotes.filter(Boolean)
      : [],
    researchSummary: qaState?.researchSummary || null,
    researchState: qaState?.researchState || null,
    repairLoop: qaState?.repairLoop || null,
    qaCanaries: qaState?.qaCanaries || null,
    qaMcpLiveStatus: qaState?.qaMcpLiveStatus || null,
    testRegistry: qaState?.testRegistry || null,
    auditTrail: qaState?.auditTrail || null,
  };
}

function normalizeQASurfaceStatus(status = '') {
  const normalized = String(status || '').trim().toLowerCase();
  if (!normalized) return 'unknown';
  if (['pass', 'ok', 'ready', 'active', 'executable'].includes(normalized)) return 'pass';
  if (['warn', 'warning', 'understaffed', 'support-only', 'draft', 'queued', 'review', 'stale_target', 'missing_dependency', 'unavailable'].includes(normalized)) return 'warn';
  if (['fail', 'failed', 'blocked', 'mismatch', 'error', 'missing', 'unknown_owner'].includes(normalized)) return 'fail';
  return 'unknown';
}

function normalizeQAFreshnessState(freshness = '', observedAt = null) {
  const normalized = String(freshness || '').trim().toLowerCase();
  if (['fresh', 'live_canonical', 'derived_current'].includes(normalized)) return 'fresh';
  if (normalized === 'stale') return 'stale';
  if (normalized === 'missing' || normalized === 'non_executable') return 'missing';
  return observedAt ? 'fresh' : 'unknown';
}

function normalizeQAList(values = []) {
  return (Array.isArray(values) ? values : [])
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
}

function parseDateOrNull(...values) {
  for (const value of values) {
    const parsed = Date.parse(String(value || '').trim());
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}

function buildQASurfaceRecord({
  surface_id,
  label,
  status = 'unknown',
  freshness = 'unknown',
  last_updated = null,
  source = 'unknown',
  coverage_hint = '',
  notes = [],
} = {}) {
  const normalizedNotes = normalizeQAList(notes);
  return {
    surface_id: String(surface_id || '').trim() || null,
    label: String(label || '').trim() || 'Surface',
    status: normalizeQASurfaceStatus(status),
    freshness: normalizeQAFreshnessState(freshness, last_updated),
    last_updated: parseDateOrNull(last_updated),
    source: String(source || '').trim() || 'unknown',
    coverage_hint: String(coverage_hint || '').trim() || '',
    notes: normalizedNotes.slice(0, 4),
  };
}

function latestKnownTimestamp(...values) {
  return parseDateOrNull(...values);
}

function countOpenInvestigations(investigations = []) {
  return (Array.isArray(investigations) ? investigations : []).reduce((count, entry) => count + (String(entry?.status || '').trim().toLowerCase() === 'open' ? 1 : 0), 0);
}

function countRecurringInvestigations(investigations = []) {
  return (Array.isArray(investigations) ? investigations : []).reduce((count, entry) => count + (String(entry?.status || '').trim().toLowerCase() === 'open' && Number(entry?.repeat_count || 0) > 1 ? 1 : 0), 0);
}

function countResearchBackedInvestigations(investigations = []) {
  return (Array.isArray(investigations) ? investigations : []).reduce((count, entry) => count + (String(entry?.status || '').trim().toLowerCase() === 'open' && (Boolean(entry?.research_available) || Number(entry?.research_note_count || 0) > 0) ? 1 : 0), 0);
}

function formatRepairLaneScopeTarget(target = '') {
  const normalized = String(target || '').trim();
  if (!normalized) return null;
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length <= 2) return normalized;
  return segments.slice(-2).join('/');
}

function summarizeRepairLaneScope(targets = []) {
  const scopedTargets = (Array.isArray(targets) ? targets : [])
    .map((target) => String(target || '').trim())
    .filter(Boolean);
  if (!scopedTargets.length) return 'No scoped targets surfaced.';
  const preview = scopedTargets
    .slice(0, 2)
    .map((target) => formatRepairLaneScopeTarget(target) || target)
    .filter(Boolean);
  return `${scopedTargets.length} target${scopedTargets.length === 1 ? '' : 's'} | ${preview.join(' | ')}${scopedTargets.length > preview.length ? ` +${scopedTargets.length - preview.length} more` : ''}`;
}

function summarizeRepairLaneTriggers(triggers = []) {
  const items = normalizeQAList(triggers);
  if (!items.length) return 'No trigger classes declared.';
  return items.join(' | ');
}

function resolveRepairLaneOutcomeStatus(lane = {}) {
  const laneStatus = String(lane?.status || '').trim().toLowerCase();
  const latestJobStatus = String(lane?.latest_job_status || lane?.latestJobStatus || '').trim().toLowerCase();
  const latestAttemptVerdict = String(lane?.latest_attempt_verdict || lane?.latestAttemptVerdict || '').trim().toLowerCase();
  if (latestJobStatus === 'policy_blocked' || laneStatus === 'blocked') return 'policy_blocked';
  if (['needs_human_review', 'stalled_after_retries'].includes(latestJobStatus) || laneStatus === 'stalled') return 'safe_stop';
  if (latestAttemptVerdict === 'accepted' || latestJobStatus === 'accepted' || laneStatus === 'healthy') return 'success';
  if (['rejected', 'inconclusive'].includes(latestAttemptVerdict)) return 'validation_failed';
  if (laneStatus === 'active') return 'active';
  if (laneStatus === 'watching') return 'watching';
  return 'idle';
}

function buildQARepairLaneInspectorItem(lane = {}) {
  const latestJob = lane?.latest_job && typeof lane.latest_job === 'object' ? lane.latest_job : {};
  const latestAttempt = lane?.latest_attempt && typeof lane.latest_attempt === 'object' ? lane.latest_attempt : {};
  const latestValidationSummary = String(
    latestAttempt.validation_evidence_summary
    || latestJob.latest_validation_evidence?.summary
    || latestJob.latest_attempt_summary
    || '',
  ).trim() || null;
  const latestStopReason = String(
    lane?.latest_policy_block_reason
    || latestAttempt.policy_block_reason
    || latestValidationSummary
    || '',
  ).trim() || null;
  const attemptCount = Math.max(0, Number(latestJob.attempt_count ?? lane?.attempt_count ?? lane?.attempts?.length ?? 0) || 0);
  const repairJobCount = Math.max(0, Number(lane?.repair_job_count ?? lane?.repairJobCount ?? 0) || 0);
  const blockedCount = Math.max(0, Number(lane?.policy_blocked_job_count ?? lane?.policyBlockedJobCount ?? 0) || 0);
  const openInvestigations = Math.max(0, Number(lane?.open_investigations ?? lane?.openInvestigations ?? 0) || 0);
  const retryBudget = Math.max(0, Number(lane?.max_attempts ?? lane?.maxAttempts ?? 0) || 0);
  return {
    lane_id: String(lane?.lane_id || lane?.laneId || '').trim() || null,
    label: String(lane?.label || lane?.observability_label || '').trim() || 'Repair Lane',
    owner_department: String(lane?.owner_department || lane?.ownerDepartment || 'QA').trim() || 'QA',
    trust_level: String(lane?.trust_level || lane?.trustLevel || 'unknown').trim() || 'unknown',
    trust_reason: String(lane?.trust_reason || lane?.trustReason || '').trim() || '',
    current_status: String(lane?.status || '').trim() || 'idle',
    outcome_status: resolveRepairLaneOutcomeStatus(lane),
    latest_job_status: String(lane?.latest_job_status || lane?.latestJobStatus || '').trim() || null,
    latest_validation_result: String(lane?.latest_attempt_verdict || lane?.latestAttemptVerdict || latestJob.latest_verdict || '').trim() || null,
    latest_attempt_at: latestKnownTimestamp(lane?.latest_attempt_at, lane?.latestAttemptAt, latestAttempt.timestamp, latestAttempt.created_at, latestJob.latest_attempt_at),
    latest_stop_reason: latestStopReason,
    latest_policy_block_reason: String(lane?.latest_policy_block_reason || lane?.latestPolicyBlockReason || '').trim() || null,
    open_investigations: openInvestigations,
    repair_job_count: repairJobCount,
    attempt_count: attemptCount,
    blocked_count: blockedCount,
    auto_apply_allowed: lane?.auto_apply_allowed !== false,
    human_review_required_on_ambiguity: lane?.human_review_required_on_ambiguity !== false,
    retry_budget: retryBudget,
    required_validation_gate_ids: normalizeQAList(lane?.required_validation_gate_ids),
    allowed_trigger_classes: normalizeQAList(lane?.allowed_trigger_classes),
    scoped_targets: normalizeQAList(lane?.scoped_targets),
    scoped_targets_summary: summarizeRepairLaneScope(lane?.scoped_targets),
    trigger_summary: summarizeRepairLaneTriggers(lane?.allowed_trigger_classes),
    trust_summary: String(lane?.trust_summary || '').trim() || '',
    eligibility_summary: String(lane?.eligibility_summary || '').trim() || '',
  };
}

function buildQARepairLaneInspectorModel(repairLoop = null) {
  const loop = repairLoop && typeof repairLoop === 'object' ? repairLoop : {};
  const visibleLanes = (Array.isArray(loop.lanes) ? loop.lanes : [])
    .map((lane) => buildQARepairLaneInspectorItem(lane))
    .filter((lane) => lane.lane_id)
    .filter((lane) => (
      lane.current_status !== 'idle'
      || lane.repair_job_count > 0
      || lane.open_investigations > 0
      || lane.attempt_count > 0
      || lane.blocked_count > 0
      || Boolean(lane.latest_validation_result)
    ))
    .sort((left, right) => {
      const rank = (lane) => {
        if (lane.outcome_status === 'policy_blocked') return 0;
        if (lane.outcome_status === 'safe_stop') return 1;
        if (lane.current_status === 'active') return 2;
        if (lane.current_status === 'watching') return 3;
        if (lane.outcome_status === 'validation_failed') return 4;
        if (lane.outcome_status === 'success') return 5;
        return 6;
      };
      const leftRank = rank(left);
      const rightRank = rank(right);
      if (leftRank !== rightRank) return leftRank - rightRank;
      const leftTime = Date.parse(left.latest_attempt_at || '');
      const rightTime = Date.parse(right.latest_attempt_at || '');
      if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
        return rightTime - leftTime;
      }
      return String(left.label || left.lane_id || '').localeCompare(String(right.label || right.lane_id || ''));
    });
  const summary = loop.summary && typeof loop.summary === 'object' ? loop.summary : {};
  return {
    lanes: visibleLanes,
    summary: {
      totalLanes: Number(summary.totalLanes ?? Array.isArray(loop.lanes) ? loop.lanes.length : visibleLanes.length) || visibleLanes.length,
      visibleLanes: visibleLanes.length,
      activeLanes: Number(summary.activeLanes ?? visibleLanes.filter((lane) => lane.current_status === 'active').length) || 0,
      blockedLanes: Number(summary.blockedLanes ?? visibleLanes.filter((lane) => lane.outcome_status === 'policy_blocked').length) || 0,
      stalledLanes: Number(summary.stalledLanes ?? visibleLanes.filter((lane) => lane.outcome_status === 'safe_stop').length) || 0,
      healthyLanes: Number(summary.healthyLanes ?? visibleLanes.filter((lane) => lane.outcome_status === 'success').length) || 0,
      policyBlocked: Number(summary.policyBlocked ?? visibleLanes.reduce((count, lane) => count + lane.blocked_count, 0)) || 0,
    },
  };
}

function buildQAMcpLiveStatusModel(statusState = null) {
  const source = statusState && typeof statusState === 'object' ? statusState : {};
  return {
    status: String(source.status || '').trim() || 'offline',
    usage_state: String(source.usage_state || source.usageState || '').trim() || 'configured_but_unused',
    freshness: String(source.freshness || '').trim() || 'unknown',
    summary: String(source.summary || '').trim() || 'QA MCP proof-of-life has not been recorded yet.',
    heartbeat_at: parseDateOrNull(source.heartbeat_at, source.heartbeatAt),
    last_completed_cycle_at: parseDateOrNull(source.last_completed_cycle_at, source.lastCompletedCycleAt),
    mcp_configured: Boolean(source.mcp_configured ?? source.mcpConfigured),
    configured_tools: normalizeQAList(source.configured_tools || source.configuredTools),
    mcp_reachable: source.mcp_reachable === true,
    last_ping_at: parseDateOrNull(source.last_ping_at, source.lastPingAt),
    last_ping_status: String(source.last_ping_status || source.lastPingStatus || '').trim() || 'unavailable',
    last_ping_source: String(source.last_ping_source || source.lastPingSource || '').trim() || 'external_mcp',
    last_call_at: parseDateOrNull(source.last_call_at, source.lastCallAt),
    last_call_tool: String(source.last_call_tool || source.lastCallTool || '').trim() || null,
    last_call_status: String(source.last_call_status || source.lastCallStatus || '').trim() || 'unknown',
    last_call_source: String(source.last_call_source || source.lastCallSource || '').trim() || null,
    last_qa_gate_source: String(source.last_qa_gate_source || source.lastQaGateSource || '').trim() || 'unknown',
    using_mcp_for_qa_decisions: Boolean(source.using_mcp_for_qa_decisions ?? source.usingMcpForQaDecisions),
    notes: normalizeQAList(source.notes).slice(0, 5),
  };
}

function normalizeQALiveCycleModel(cycleState = null) {
  const source = cycleState && typeof cycleState === 'object' ? cycleState : {};
  return {
    current_run_id: String(source.current_run_id || source.currentRunId || '').trim() || null,
    current_status: String(source.current_status || source.currentStatus || '').trim() || 'idle',
    latest_completed_cycle_id: String(source.latest_completed_cycle_id || source.latestCompletedCycleId || '').trim() || null,
    latest_completed_cycle_at: parseDateOrNull(source.latest_completed_cycle_at, source.latestCompletedCycleAt),
    latest_completed_status: String(source.latest_completed_status || source.latestCompletedStatus || '').trim() || 'unknown',
    latest_completed_summary: String(source.latest_completed_summary || source.latestCompletedSummary || '').trim() || null,
    ran_once: Boolean(source.ran_once ?? source.ranOnce),
    mcp_status: String(source.mcp_status || source.mcpStatus || '').trim() || 'unknown',
    mcp_reachable: typeof source.mcp_reachable === 'boolean'
      ? source.mcp_reachable
      : (typeof source.mcpReachable === 'boolean' ? source.mcpReachable : null),
    current_gate_source: String(source.current_gate_source || source.currentGateSource || '').trim() || 'unknown',
    external_status: String(source.external_status || source.externalStatus || '').trim() || 'unknown',
    output_feed_loaded: Boolean(source.output_feed_loaded ?? source.outputFeedLoaded),
    output_feed_count: Number.isFinite(Number(source.output_feed_count ?? source.outputFeedCount))
      ? Number(source.output_feed_count ?? source.outputFeedCount)
      : 0,
    output_feed_captured: Boolean(source.output_feed_captured ?? source.outputFeedCaptured),
    latest_feed_entry_id: String(source.latest_feed_entry_id || source.latestFeedEntryId || '').trim() || null,
    latest_feed_result: String(source.latest_feed_result || source.latestFeedResult || '').trim() || null,
    summary: String(source.summary || '').trim() || 'QA has not completed a live cycle yet.',
  };
}

function normalizeQALeadFeedItem(item = {}) {
  const source = item && typeof item === 'object' ? item : {};
  return {
    id: String(source.id || '').trim() || null,
    label: String(source.label || '').trim() || 'QA tool result',
    tool: String(source.tool || '').trim() || 'qa_tool',
    status: String(source.status || '').trim() || 'unknown',
    verdict: String(source.verdict || '').trim() || String(source.status || '').trim() || 'unknown',
    summary: String(source.summary || '').trim() || 'No summary recorded.',
    detail: String(source.detail || '').trim() || '',
    observed_at: parseDateOrNull(source.observed_at, source.observedAt),
    artifact_refs: normalizeQAList(source.artifact_refs || source.artifactRefs),
    notes: normalizeQAList(source.notes),
  };
}

function normalizeQALeadRunnerPayload(state = null) {
  const source = state && typeof state === 'object' ? state : {};
  const outputFeed = Array.isArray(source.output_feed) ? source.output_feed : [];
  return {
    source: String(source.source || 'qa_lead_runner').trim() || 'qa_lead_runner',
    agent_id: String(source.agent_id || source.agentId || 'qa-lead').trim() || 'qa-lead',
    id: String(source.id || source.run_id || '').trim() || null,
    run_type: String(source.run_type || source.runType || 'scheduled_cycle').trim() || 'scheduled_cycle',
    status: String(source.status || 'idle').trim() || 'idle',
    current_task: String(source.current_task || source.currentTask || 'QA proof-of-life, browser pass, lane canaries, and loop audit').trim() || 'QA proof-of-life, browser pass, lane canaries, and loop audit',
    current_batch: String(source.current_batch || source.currentBatch || source.run_id || '').trim() || null,
    base_url: String(source.base_url || source.baseUrl || '').trim() || null,
    probe_url: String(source.probe_url || source.probeUrl || '').trim() || null,
    started_at: parseDateOrNull(source.started_at, source.startedAt),
    finished_at: parseDateOrNull(source.finished_at, source.finishedAt),
    last_completed_cycle_at: parseDateOrNull(source.last_completed_cycle_at, source.lastCompletedCycleAt),
    active_tools: normalizeQAList(source.active_tools || source.activeTools),
    live_status: source.live_status && typeof source.live_status === 'object' ? buildQAMcpLiveStatusModel(source.live_status) : null,
    output_feed: outputFeed.map((item) => normalizeQALeadFeedItem(item)).filter((item) => item.id || item.summary),
    result_paths: source.result_paths && typeof source.result_paths === 'object' ? source.result_paths : {},
    failure_reason: String(source.failure_reason || source.failureReason || '').trim() || null,
    summary: String(source.summary || '').trim() || 'QA lead has not run yet.',
    automation_started: Boolean(source.automation_started ?? source.automationStarted),
    automation_enabled: Boolean(source.automation_enabled ?? source.automationEnabled),
    automation_interval_ms: Number.isFinite(Number(source.automation_interval_ms ?? source.automationIntervalMs))
      ? Number(source.automation_interval_ms ?? source.automationIntervalMs)
      : null,
    automation_last_kick_at: parseDateOrNull(source.automation_last_kick_at, source.automationLastKickAt),
    automation_last_result: source.automation_last_result || source.automationLastResult || null,
  };
}

function selectQALeadFeed({
  qa = null,
  qaLeadState = null,
  qaLeadLatestRun = null,
} = {}) {
  const persistedFeed = qa?.outputFeedLoaded
    ? qa.outputFeed.map((item) => normalizeQALeadFeedItem(item))
    : [];
  if (persistedFeed.length || qa?.outputFeedLoaded) {
    return persistedFeed;
  }
  return (qaLeadLatestRun?.output_feed?.length ? qaLeadLatestRun.output_feed : qaLeadState?.output_feed || [])
    .map((item) => normalizeQALeadFeedItem(item));
}

function buildQALaneCanaryModel(canaryState = null) {
  const source = canaryState && typeof canaryState === 'object' ? canaryState : {};
  const results = (Array.isArray(source.results) ? source.results : [])
    .filter(Boolean)
    .map((result) => ({
      canary_id: String(result.canary_id || result.canaryId || '').trim() || null,
      label: String(result.label || '').trim() || 'Lane Canary',
      status: String(result.status || '').trim() || 'fail',
      checked_at: parseDateOrNull(result.checked_at, result.checkedAt),
      target_lane_id: String(result.target_lane_id || result.targetLaneId || '').trim() || null,
      target_lane_label: String(result.target_lane_label || result.targetLaneLabel || '').trim() || null,
      owner_department: String(result.owner_department || result.ownerDepartment || '').trim() || 'QA',
      trigger: String(result.trigger || '').trim() || null,
      policy_outcome: String(result.policy_outcome || result.policyOutcome || '').trim() || null,
      validation_status: String(result.validation_status || result.validationStatus || '').trim() || null,
      trust_level: String(result.trust_level || result.trustLevel || '').trim() || 'unknown',
      summary: String(result.summary || '').trim() || 'No canary summary recorded.',
      latest_validation_summary: String(result.latest_validation_summary || result.latestValidationSummary || '').trim() || null,
      scoped_targets_summary: String(result.scoped_targets_summary || result.scopedTargetsSummary || '').trim() || '',
      required_validation_gate_ids: normalizeQAList(result.required_validation_gate_ids || result.requiredValidationGateIds),
      notes: normalizeQAList(result.notes),
    }))
    .filter((result) => result.canary_id);
  const failingIds = normalizeQAList(source.failing_canary_ids || source.failingCanaryIds);
  return {
    last_run_at: parseDateOrNull(source.last_run_at, source.lastRunAt),
    overall_status: String(source.overall_status || source.overallStatus || '').trim() || 'idle',
    total_canaries: Math.max(0, Number(source.total_canaries ?? source.totalCanaries ?? results.length) || results.length),
    passed_count: Math.max(0, Number(source.passed_count ?? source.passedCount ?? results.filter((result) => result.status === 'pass').length) || 0),
    failed_count: Math.max(0, Number(source.failed_count ?? source.failedCount ?? failingIds.length) || 0),
    failing_canary_ids: failingIds,
    results,
    summary: String(source.summary || '').trim() || 'No QA lane canary results are recorded yet.',
  };
}

function buildQADeskReadabilityModel({
  workspace = {},
  normalizedQA = null,
  scorecards = null,
  latestBrowserRun = null,
  browserRuns = [],
  localGate = null,
  auditTrail = null,
  researchState = null,
  currentGoal = '',
} = {}) {
  const qa = normalizedQA || normalizeQAState(workspace?.qaState || null);
  const scorecardBundle = scorecards || resolveQAScorecardBundle(qa);
  const currentBrowserRun = latestBrowserRun || qa.latestBrowserRun || qa.browserRuns[0] || null;
  const currentBrowserRuns = Array.isArray(browserRuns) && browserRuns.length
    ? browserRuns
    : mergeBrowserRuns(currentBrowserRun, qa.browserRuns);
  const currentLocalGate = localGate || qa.localGate;
  const currentAuditTrail = auditTrail || qa.auditTrail || null;
  const currentResearchState = researchState || qa.researchState || { notes: qa.researchNotes || [], summary: null, investigations: qa.openInvestigations || [] };
  const qaLeadState = normalizeQALeadRunnerPayload(qa.qaLead || null);
  const qaLeadLatestRun = normalizeQALeadRunnerPayload(qa.qaLeadLatestRun || (Array.isArray(qa.qaLeadRuns) ? qa.qaLeadRuns[0] : null) || null);
  const qaLiveCycle = normalizeQALiveCycleModel(qa.qaLiveCycle || null);
  const qaLeadFeed = selectQALeadFeed({
    qa,
    qaLeadState,
    qaLeadLatestRun,
  });
  const repairInspector = buildQARepairLaneInspectorModel(qa.repairLoop || null);
  const qaCanaries = buildQALaneCanaryModel(qa.qaCanaries || null);
  const qaMcpLiveStatus = buildQAMcpLiveStatusModel(qa.qaMcpLiveStatus || qaLeadState.live_status || null);
  const openInvestigations = Array.isArray(qa.openInvestigations) ? qa.openInvestigations.filter(Boolean) : [];
  const recurringInvestigations = openInvestigations.filter((entry) => Number(entry.repeat_count || 0) > 1);
  const researchBackedInvestigations = openInvestigations.filter((entry) => Boolean(entry.research_available) || Number(entry.research_note_count || 0) > 0);
  const latestResearchNote = Array.isArray(currentResearchState?.notes) ? currentResearchState.notes[0] || null : null;
  const latestIntent = latestIntentReport(workspace);
  const structuredStatus = qa.structuredReport?.status || 'unknown';
  const externalStatus = qa.externalValidation?.status || 'unknown';
  const overviewStatus = normalizeQASurfaceStatus(
    structuredStatus === 'fail' || externalStatus === 'fail'
      ? 'fail'
      : (openInvestigations.length > 0 || externalStatus === 'warn'
          ? 'warn'
          : (structuredStatus === 'pass' || externalStatus === 'pass'
              ? 'pass'
              : 'unknown')),
  );
  const hygieneSurfaces = [
    buildQASurfaceRecord({
      surface_id: 'planner',
      label: 'Planner',
      status: structuredStatus === 'fail' ? 'fail' : (structuredStatus === 'pass' ? 'pass' : 'unknown'),
      freshness: qa.structuredReport?.sourceTrace?.freshnessClass || (qa.structuredReport ? 'fresh' : 'missing'),
      last_updated: latestKnownTimestamp(qa.structuredSummary?.finishedAt, qa.structuredReport?.finishedAt, qa.structuredReport?.updatedAt, qa.structuredReport?.createdAt),
      source: qa.structuredReport?.sourceTrace?.sourcePath || 'data/spatial/qa/structured/latest.json',
      coverage_hint: `${scorecardBundle.cards.length} scorecard${scorecardBundle.cards.length === 1 ? '' : 's'} | ${Number(qa.structuredReport?.tests?.length || qa.structuredReport?.desks?.length || 0)} test surface${Number(qa.structuredReport?.tests?.length || qa.structuredReport?.desks?.length || 0) === 1 ? '' : 's'}`,
      notes: [
        qa.structuredSummary?.summary || qa.structuredReport?.summary || 'Structured QA report available.',
      ],
    }),
    buildQASurfaceRecord({
      surface_id: 'qa',
      label: 'QA',
      status: externalStatus === 'fail'
        ? 'fail'
        : (openInvestigations.length > 0 || externalStatus === 'warn'
            ? 'warn'
            : (externalStatus === 'pass' ? 'pass' : 'unknown')),
      freshness: qa.externalValidation?.lastCheckedAt ? 'fresh' : (qa.externalValidation ? 'unknown' : 'missing'),
      last_updated: latestKnownTimestamp(qa.externalValidation?.lastCheckedAt),
      source: qa.externalValidation?.source || 'external_mcp',
      coverage_hint: `${openInvestigations.length} open investigation${openInvestigations.length === 1 ? '' : 's'} | ${recurringInvestigations.length} recurring`,
      notes: [
        qa.externalValidation?.notes?.[0] || qa.externalValidation?.errorMessage || 'External validation snapshot available.',
      ],
    }),
    buildQASurfaceRecord({
      surface_id: 'executor',
      label: 'Executor',
      status: (currentBrowserRun?.verdict || currentBrowserRun?.status || currentLocalGate?.studioBoot?.verdict || currentLocalGate?.unit?.status || 'unknown'),
      freshness: currentBrowserRun?.sourceTrace?.freshnessClass || currentLocalGate?.studioBoot?.sourceTrace?.freshnessClass || currentLocalGate?.unit?.sourceTrace?.freshnessClass || (qa.repairLoop?.latestAttempt ? 'fresh' : 'missing'),
      last_updated: latestKnownTimestamp(
        currentBrowserRun?.sourceTrace?.observedAt,
        currentBrowserRun?.finishedAt,
        currentBrowserRun?.createdAt,
        currentLocalGate?.studioBoot?.sourceTrace?.observedAt,
        currentLocalGate?.studioBoot?.finishedAt,
        currentLocalGate?.unit?.sourceTrace?.observedAt,
        qa.repairLoop?.latestAttempt?.timestamp,
      ),
      source: currentBrowserRun?.sourceTrace?.sourcePath || currentLocalGate?.studioBoot?.sourceTrace?.sourcePath || currentLocalGate?.unit?.sourceTrace?.sourcePath || 'data/spatial/qa/local-gates/*.json',
      coverage_hint: `${currentBrowserRuns.length} browser run${currentBrowserRuns.length === 1 ? '' : 's'} | ${localGateOutputCount(currentLocalGate)} local gate${localGateOutputCount(currentLocalGate) === 1 ? '' : 's'} | ${Number(qa.repairLoop?.attempts?.length || 0)} repair attempt${Number(qa.repairLoop?.attempts?.length || 0) === 1 ? '' : 's'}`,
      notes: [
        summarizeQABrowserRun(currentBrowserRun),
        summarizeLocalGate(currentLocalGate),
      ].filter(Boolean),
    }),
    buildQASurfaceRecord({
      surface_id: 'cto',
      label: 'CTO',
      status: currentAuditTrail?.summary?.mismatch > 0
        ? 'warn'
        : (currentAuditTrail?.summary?.ok > 0 ? 'pass' : 'unknown'),
      freshness: currentAuditTrail?.generatedAt ? 'fresh' : 'missing',
      last_updated: latestKnownTimestamp(currentAuditTrail?.generatedAt),
      source: 'qa/qaAuditTrail.js',
      coverage_hint: `${Number(currentAuditTrail?.entries?.length || 0)} audit entr${Number(currentAuditTrail?.entries?.length || 0) === 1 ? 'y' : 'ies'} | ${Number(currentAuditTrail?.summary?.mismatch || 0)} mismatch${Number(currentAuditTrail?.summary?.mismatch || 0) === 1 ? '' : 'es'}`,
      notes: [
        currentAuditTrail?.summary ? `Audit summary: ${currentAuditTrail.summary.ok || 0} ok / ${currentAuditTrail.summary.stale || 0} stale / ${currentAuditTrail.summary.missing || 0} missing` : 'QA audit trail available.',
      ],
    }),
    buildQASurfaceRecord({
      surface_id: 'archive',
      label: 'Archive',
      status: scorecardBundle.cards.length ? 'pass' : 'unknown',
      freshness: qa.testRegistry?.generatedAt ? 'fresh' : 'missing',
      last_updated: latestKnownTimestamp(qa.testRegistry?.generatedAt, qa.testRegistrySummary?.generatedAt),
      source: 'qa/testRegistry.js',
      coverage_hint: `${Number(qa.testRegistry?.entries?.length || scorecardBundle.cards.length || 0)} registered test${Number(qa.testRegistry?.entries?.length || scorecardBundle.cards.length || 0) === 1 ? '' : 's'}`,
      notes: [
        qa.testRegistrySummary?.total ? `Executable ${qa.testRegistrySummary.executable || 0} | stale ${qa.testRegistrySummary.staleTarget || 0}` : 'QA test registry available.',
      ],
    }),
    buildQASurfaceRecord({
      surface_id: 'intent',
      label: 'Intent',
      status: latestIntent ? 'pass' : 'unknown',
      freshness: latestKnownTimestamp(latestIntent?.updatedAt, latestIntent?.createdAt) ? 'fresh' : 'missing',
      last_updated: latestKnownTimestamp(latestIntent?.updatedAt, latestIntent?.createdAt),
      source: 'workspace.intentState.registry',
      coverage_hint: latestIntent?.summary ? 'Active intent captured' : 'No active intent',
      notes: [
        latestIntent?.summary || 'No active intent captured.',
      ],
    }),
    buildQASurfaceRecord({
      surface_id: 'research',
      label: 'Research',
      status: Number(currentResearchState?.summary?.availableNotes || 0) > 0
        ? 'pass'
        : (Number(currentResearchState?.summary?.unavailableNotes || 0) > 0 ? 'warn' : 'unknown'),
      freshness: currentResearchState?.summary?.latestNoteAt ? 'fresh' : 'missing',
      last_updated: latestKnownTimestamp(currentResearchState?.summary?.latestNoteAt, latestResearchNote?.created_at, latestResearchNote?.updated_at),
      source: 'data/spatial/qa/research-notes.json',
      coverage_hint: `${Number(currentResearchState?.summary?.availableNotes || 0)} available / ${Number(currentResearchState?.summary?.totalNotes || 0)} total note${Number(currentResearchState?.summary?.totalNotes || 0) === 1 ? '' : 's'}`,
      notes: [
        latestResearchNote?.summary || currentResearchState?.research_summary || 'No research notes yet.',
      ],
    }),
    buildQASurfaceRecord({
      surface_id: 'qa-lead',
      label: 'QA Lead',
      status: qaLeadLatestRun.status === 'live' || qaLeadState.status === 'live'
        ? 'pass'
        : (['degraded', 'offline', 'stale'].includes(qaLeadLatestRun.status || qaLeadState.status) ? 'warn' : 'unknown'),
      freshness: qaLeadLatestRun.finished_at || qaLeadState.finished_at || qaLeadState.last_completed_cycle_at ? 'fresh' : 'missing',
      last_updated: latestKnownTimestamp(qaLeadLatestRun.finished_at, qaLeadState.finished_at, qaLeadState.last_completed_cycle_at, qaLeadState.automation_last_kick_at),
      source: 'data/spatial/qa/lead-state.json',
      coverage_hint: `${qaLeadFeed.length} output feed item${qaLeadFeed.length === 1 ? '' : 's'} | ${qaLeadState.active_tools.length} active tool${qaLeadState.active_tools.length === 1 ? '' : 's'}`,
      notes: [
        qaLeadState.current_task || 'QA lead automation feed available.',
        qaLeadState.failure_reason || null,
      ].filter(Boolean),
    }),
  ];

  return {
    overview: {
      status: overviewStatus,
      structuredStatus: structuredStatus || 'unknown',
      externalStatus: externalStatus || 'unknown',
      openInvestigationsCount: openInvestigations.length,
      recurringInvestigationsCount: recurringInvestigations.length,
      researchBackedInvestigationsCount: researchBackedInvestigations.length,
      researchAvailableCount: Number(currentResearchState?.summary?.availableNotes || 0),
      latestStructuredAt: latestKnownTimestamp(qa.structuredSummary?.finishedAt, qa.structuredReport?.finishedAt, qa.structuredReport?.updatedAt, qa.structuredReport?.createdAt),
      latestExternalAt: latestKnownTimestamp(qa.externalValidation?.lastCheckedAt),
      latestResearchAt: latestKnownTimestamp(currentResearchState?.summary?.latestNoteAt, latestResearchNote?.created_at),
    notes: [
      qa.structuredReport?.summary || 'Structured QA report unavailable.',
      qa.externalValidation?.notes?.[0] || qa.externalValidation?.errorMessage || 'External validation snapshot available.',
      qaCanaries.failed_count ? `${qaCanaries.failed_count} lane canary${qaCanaries.failed_count === 1 ? '' : 'ies'} failing.` : null,
      qaLeadState.current_task ? `QA lead: ${qaLeadState.current_task}` : null,
    ].filter(Boolean),
  },
  qaCanaries,
  qaMcpLiveStatus,
  qaLiveCycle,
  qaLead: qaLeadState,
  qaLeadLatestRun,
  qaLeadFeed,
  hygieneSurfaces,
    openInvestigations,
    recurringInvestigations,
    repairLanes: repairInspector.lanes,
    repairLoopSummary: repairInspector.summary,
    researchNotes: Array.isArray(currentResearchState?.notes) ? currentResearchState.notes : [],
    researchState: currentResearchState,
    scorecards: scorecardBundle,
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
  const readability = buildQADeskReadabilityModel({
    workspace,
    normalizedQA,
  });
  const scorecards = readability.scorecards;
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
        ? 'Review the QA control panel: overview, hygiene, scorecards, investigations, and research.'
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
  const deskTruth = {
    department: 'QA Operations',
    workload: {
      assignedTasks: scorecards.cards.length,
      queueSize: latestBrowserRun && latestQAVerdict(latestBrowserRun) !== 'pass' ? browserFindingCount(latestBrowserRun) : 0,
      outputs: (normalizedQA.structuredReport ? 1 : 0) + browserRuns.length + localGateOutputCount(localGate),
    },
    throughput: normalizedQA.structuredBusy
      ? 'Structured QA running'
      : normalizedQA.browserBusy
        ? 'Browser QA running'
        : `${scorecards.cards.length} scorecards / ${browserRuns.length} browser runs / ${localGateOutputCount(localGate)} local gates`,
    reports: [
      readability.overview.notes?.[0] || scorecards.summary || null,
      latestBrowserRun?.summary || null,
      localGateSummary || null,
    ].filter(Boolean),
    scorecards: scorecards.cards || [],
    assessments: browserRuns.slice(0, 3).map((run) => ({
      id: run.id || `qa-run-${run.scenario || 'latest'}`,
      summary: summarizeQABrowserRun(run),
      verdict: latestQAVerdict(run),
    })),
    context: currentGoal,
    guardrails: waitingOnYou.slice(0, 2),
  };
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
    workload: deskTruth.workload,
    throughput: deskTruth.throughput,
    reports: deskTruth.reports,
    scorecards: deskTruth.scorecards,
    assessments: deskTruth.assessments,
    context: deskTruth.context,
    guardrails: deskTruth.guardrails,
    truth: deskTruth,
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
        id: 'qa-overview',
        label: 'QA Health Overview',
        kind: 'qa-overview',
        overview: readability.overview,
        summary: 'Overall QA health at a glance.',
        collapsible: false,
        defaultOpen: true,
      },
      {
        id: 'qa-mcp-live',
        label: 'QA MCP Proof of Life',
        kind: 'qa-mcp-live',
        liveStatus: readability.qaMcpLiveStatus,
        liveCycle: readability.qaLiveCycle,
        summary: readability.qaMcpLiveStatus.summary,
        collapsible: false,
        defaultOpen: true,
      },
      {
        id: 'qa-operator',
        label: 'QA Live Operator',
        kind: 'qa-operator',
        liveRun: readability.qaLead,
        liveCycle: readability.qaLiveCycle,
        summary: readability.qaLiveCycle.ran_once
          ? readability.qaLiveCycle.summary
          : (readability.qaLead.current_task || readability.qaLead.summary || 'QA lead automation is not running yet.'),
        collapsible: false,
        defaultOpen: true,
      },
      {
        id: 'qa-output-feed',
        label: 'QA Output Feed',
        kind: 'qa-output-feed',
        feed: readability.qaLeadFeed,
        liveCycle: readability.qaLiveCycle,
        summary: readability.qaLiveCycle.ran_once
          ? (readability.qaLiveCycle.output_feed_captured
              ? `Latest cycle ${readability.qaLiveCycle.latest_completed_cycle_id || 'unknown'} is captured in the QA output feed.`
              : `Latest cycle ${readability.qaLiveCycle.latest_completed_cycle_id || 'unknown'} completed but the QA output feed has not captured it yet.`)
          : (readability.qaLeadFeed.length
              ? `${readability.qaLeadFeed.length} QA output item${readability.qaLeadFeed.length === 1 ? '' : 's'} ready for executor review.`
              : 'QA output feed is empty until the lead run completes.'),
        emptyState: 'No QA output feed is available yet.',
        collapsible: true,
        defaultOpen: readability.qaLeadFeed.length > 0,
      },
      {
        id: 'qa-canaries',
        label: 'Lane Canaries',
        kind: 'qa-canaries',
        canaries: readability.qaCanaries,
        summary: readability.qaCanaries.summary,
        emptyState: 'No QA lane canary results are recorded yet.',
        collapsible: true,
        defaultOpen: readability.qaCanaries.failed_count > 0,
      },
      {
        id: 'qa-hygiene',
        label: 'Freshness & Hygiene',
        kind: 'qa-hygiene',
        surfaces: readability.hygieneSurfaces,
        summary: 'Freshness, provenance, and coverage by surface.',
        collapsible: false,
        defaultOpen: true,
      },
      {
        id: 'qa-repair-lanes',
        label: 'Repair Lanes',
        kind: 'qa-repair-lanes',
        lanes: readability.repairLanes,
        repairLoopSummary: readability.repairLoopSummary,
        summary: readability.repairLanes.length
          ? `${readability.repairLanes.length} active or recent lane${readability.repairLanes.length === 1 ? '' : 's'} | ${Number(readability.repairLoopSummary?.blockedLanes || 0)} blocked | ${Number(readability.repairLoopSummary?.activeLanes || 0)} active`
          : 'Repair lanes surface trust policy, blocked actions, and validation status.',
        emptyState: 'No active or recent repair lanes are recorded yet.',
        collapsible: true,
        defaultOpen: readability.repairLanes.length > 0,
      },
      {
        id: 'qa-scorecards',
        label: 'Scorecards',
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
        collapsible: true,
        defaultOpen: false,
      },
      {
        id: 'qa-investigations',
        label: 'Investigations',
        kind: 'qa-investigations',
        items: readability.openInvestigations.map((item) => ({
          ...item,
        })),
        summary: `${readability.openInvestigations.length} open investigation${readability.openInvestigations.length === 1 ? '' : 's'} | ${readability.recurringInvestigations.length} recurring`,
        emptyState: 'No open QA investigations are recorded yet.',
        collapsible: true,
        defaultOpen: readability.openInvestigations.length > 0,
      },
      {
        id: 'qa-research',
        label: 'Advisory / Research',
        kind: 'qa-research',
        notes: readability.researchNotes,
        researchState: readability.researchState,
        summary: readability.researchState?.summary?.latestNoteAt
          ? `Latest research at ${readability.researchState.summary.latestNoteAt}`
          : 'Research notes stay advisory and read-only.',
        emptyState: 'No advisory research notes are recorded yet.',
        collapsible: true,
        defaultOpen: false,
      },
    ],
  };
}

export function createInitialComments() {
  return Object.fromEntries(STATIONS.map((agent) => [agent.id, []]));
}

export {
  STUDIO_LAYOUT_SCHEMA,
  STUDIO_ROOM,
  STUDIO_DESK_SIZE,
  STUDIO_TEAM_BOARD_SIZE,
  STUDIO_ROOM_FIT_PADDING,
  DEFAULT_STUDIO_DESK_LAYOUT,
  DEFAULT_STUDIO_WHITEBOARDS,
  clampDeskPosition,
  clampWhiteboardPosition,
  createDefaultStudioLayout,
  resolveStudioRoomZoom,
  normalizeStudioLayout,
  getStudioDepartmentForDesk,
  getStudioDeskRecord,
} from './studioLayoutModel.js';

export { collectQAScorecards, resolveQAScorecardBundle };

export function getStudioAgents() {
  return STATIONS.map((agent) => ({ ...agent }));
}

function resolveWorkspaceRuntime(runtimeState = {}) {
  if (runtimeState && typeof runtimeState.workspace === 'object') return runtimeState.workspace;
  return runtimeState && typeof runtimeState === 'object' ? runtimeState : {};
}

function summarizeAgentContextHistory(entries = []) {
  const filtered = Array.isArray(entries) ? entries.filter(Boolean).map((entry) => String(entry.summary || entry.detail || entry.label || '').trim()).filter(Boolean) : [];
  if (!filtered.length) return 'No recent context history surfaced.';
  if (filtered.length === 1) return filtered[0];
  return `${filtered[0]} +${filtered.length - 1} more`;
}

export function buildAgentContext(agentSnapshot = {}, runtimeState = {}, options = {}) {
  const workspace = resolveWorkspaceRuntime(runtimeState);
  const layout = options.layout || workspace?.studio?.layout || null;
  const qaState = normalizeQAState(options.qaState || null);
  const qaLead = normalizeQALeadRunnerPayload(qaState.qaLead || null);
  const qaLeadLatestRun = normalizeQALeadRunnerPayload(qaState.qaLeadLatestRun || (Array.isArray(qaState.qaLeadRuns) ? qaState.qaLeadRuns[0] : null) || null);
  const qaLiveCycle = normalizeQALiveCycleModel(qaState.qaLiveCycle || null);
  const qaLeadFeed = selectQALeadFeed({
    qa: qaState,
    qaLeadState: qaLead,
    qaLeadLatestRun,
  });
  const qaMcpLiveStatus = buildQAMcpLiveStatusModel(qaState.qaMcpLiveStatus || qaLead.live_status || null);
  const agentId = String(agentSnapshot?.id || options.agentId || '').trim();
  const desk = agentId ? getStudioDeskRecord(agentId, layout) : null;
  const department = agentId ? getStudioDepartmentForDesk(agentId, layout) : null;
  const workers = normalizeAgentWorkersState(workspace?.studio?.agentWorkers);
  const workerState = workers[agentId] || agentSnapshot?.workerState || {};
  const intent = latestIntentReport(workspace);
  const board = normalizeTeamBoardState(workspace);
  const taskEconomy = deriveTaskEconomy(board);
  const orchestrator = workspace?.studio?.orchestrator || {};
  const deskState = orchestrator.desks?.[agentId] || null;
  const handoff = workspace?.studio?.handoffs?.contextToPlanner || null;
  const plannerToContext = workspace?.studio?.handoffs?.plannerToContext || null;
  const recentHistory = Array.isArray(options.recentHistory)
    ? options.recentHistory.filter(Boolean).slice(0, 3)
    : [];
  const recentActions = Array.isArray(agentSnapshot?.recentActions)
    ? agentSnapshot.recentActions.filter(Boolean).slice(0, 3)
    : [];
  const commentCount = Array.isArray(agentSnapshot?.comments) ? agentSnapshot.comments.filter(Boolean).length : 0;
  const activePageId = workspace.activePageId || null;
  const activePageTitle = Array.isArray(workspace.pages)
    ? (workspace.pages.find((page) => page.id === activePageId)?.title || null)
    : null;
  const visibleDeskCount = Object.values(workspace?.studio?.layout?.desks || {})
    .filter((deskEntry) => deskEntry?.visible !== false && !deskEntry?.hidden).length;
  const activeDeskCount = Array.isArray(orchestrator.activeDeskIds) ? orchestrator.activeDeskIds.length : 0;
  const contextSummary = intent?.summary || agentSnapshot?.focusSummary || deskState?.currentGoal || 'No active context summary.';
  const contextDetail = intent?.projectContext?.currentFocus || handoff?.summary || plannerToContext?.detail || deskState?.currentGoal || 'No active context detail surfaced.';
  const currentGoal = deskState?.currentGoal || agentSnapshot?.latestRunSummary || agentSnapshot?.focusSummary || null;
  const workload = agentSnapshot?.workload || {};
  const status = agentSnapshot?.status || workerState.status || 'idle';

  return {
    id: agentId || null,
    name: agentSnapshot?.name || agentId || 'Agent',
    status,
    summary: `${agentSnapshot?.name || agentId || 'Agent'} | ${contextSummary}`,
    global: {
      activePageId,
      activePageTitle,
      scene: workspace?.studio?.scene || null,
      activeGraphLayer: workspace?.studio?.activeGraphLayer || null,
      worldViewMode: workspace?.studio?.worldViewMode || null,
      orchestratorStatus: orchestrator.status || 'idle',
      activeDeskCount,
      visibleDeskCount,
      contextSummary,
    },
    desk: {
      id: desk?.id || agentId || null,
      label: desk?.label || agentSnapshot?.name || agentId || 'Desk',
      departmentId: desk?.departmentId || null,
      departmentLabel: department?.label || null,
      visible: desk ? desk.visible !== false && !desk.hidden : null,
      hidden: Boolean(desk?.hidden),
      aliasOf: desk?.aliasOf || null,
      capabilities: Array.isArray(desk?.capabilities) ? [...desk.capabilities] : [],
      reportsToDeskId: desk?.reportsToDeskId || null,
    },
    department: department ? {
      id: department.id,
      label: department.label,
      kind: department.kind,
      status: department.status || null,
      statusLabel: department.statusLabel || null,
      dependencyWarnings: Array.isArray(department.dependencyWarnings) ? [...department.dependencyWarnings] : [],
      dependencyWarningSummary: department.dependencyWarningSummary || null,
    } : null,
    role: {
      id: agentSnapshot?.role || workerState.role || null,
      label: agentSnapshot?.role || workerState.role || agentSnapshot?.name || agentId || 'Agent',
      capabilities: Array.isArray(desk?.capabilities) ? [...desk.capabilities] : [],
      mission: agentSnapshot?.mission || deskState?.mission || null,
      oversight: Boolean(agentSnapshot?.isOversight || deskState?.allowedActions?.includes('approve-apply')),
    },
    task: {
      currentGoal,
      status: deskState?.localState || status,
      assignedTasks: Number.isFinite(Number(workload.assignedTasks)) ? Number(workload.assignedTasks) : 0,
      queueSize: Number.isFinite(Number(workload.queueSize)) ? Number(workload.queueSize) : 0,
      outputs: Number.isFinite(Number(workload.outputs)) ? Number(workload.outputs) : 0,
      throughputLabel: agentSnapshot?.throughputLabel || null,
      latestSignal: agentSnapshot?.latestSignal || null,
      latestRunSummary: agentSnapshot?.latestRunSummary || null,
    },
    context: {
      summary: contextSummary,
      detail: contextDetail,
      handoffSummary: handoff?.summary || null,
      plannerFeedback: plannerToContext?.detail || null,
    },
    qa: {
      lead: qaLeadLatestRun.id ? qaLeadLatestRun : qaLead,
      liveStatus: qaMcpLiveStatus,
      feed: qaLeadFeed,
      liveCycle: qaLiveCycle,
      summary: qaLiveCycle.ran_once
        ? qaLiveCycle.summary
        : (qaLeadFeed.length
            ? `${qaLeadFeed.length} QA output item${qaLeadFeed.length === 1 ? '' : 's'} available for downstream review.`
            : (qaLead.summary || 'QA output feed is not available yet.')),
    },
    history: {
      recentActions,
      recentHistory,
      comments: Array.isArray(agentSnapshot?.comments) ? agentSnapshot.comments.slice(0, 3) : [],
      summary: summarizeAgentContextHistory([
        { summary: agentSnapshot?.latestRunSummary || null },
        ...recentActions.map((entry) => ({ summary: entry })),
        ...recentHistory,
      ]),
    },
    signals: {
      latestSignal: agentSnapshot?.latestSignal || null,
      recentCommentCount: commentCount,
      hasContextHandoff: Boolean(handoff?.id),
      hasPlannerFeedback: Boolean(plannerToContext?.detail),
    },
  };
}

export function getAgentContext(agentId, options = {}) {
  const agentSnapshots = Array.isArray(options.agentSnapshots) ? options.agentSnapshots : [];
  const snapshot = typeof agentId === 'string'
    ? agentSnapshots.find((entry) => entry?.id === agentId) || null
    : (agentId && typeof agentId === 'object' ? agentId : null);
  if (!snapshot) {
    return buildAgentContext({ id: typeof agentId === 'string' ? agentId : null }, options.workspace || options.runtimeState || {}, options);
  }
  return buildAgentContext(snapshot, options.workspace || options.runtimeState || {}, options);
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
  const qaScorecards = resolveQAScorecardBundle(normalizedQA);
  const latestBrowserRun = normalizedQA.latestBrowserRun || normalizedQA.browserRuns[0] || null;
  const qaLeadState = normalizeQALeadRunnerPayload(normalizedQA.qaLead || null);
  const qaLeadLatestRun = normalizeQALeadRunnerPayload(normalizedQA.qaLeadLatestRun || (Array.isArray(normalizedQA.qaLeadRuns) ? normalizedQA.qaLeadRuns[0] : null) || null);
  const qaLeadFeed = selectQALeadFeed({
    qa: normalizedQA,
    qaLeadState,
    qaLeadLatestRun,
  });
  const taskEconomy = deriveTaskEconomy(runtimeBoard);
  const guardrailSummary = [
    workspace.studio?.selfUpgrade?.status ? `Self upgrade ${workspace.studio.selfUpgrade.status}` : null,
    normalizedQA.localGate ? summarizeLocalGate(normalizedQA.localGate) : null,
    dashboardState?.blockers?.[0] || null,
  ].filter(Boolean);
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
      taskEconomy,
      recentActions,
      comments,
      focusSummary: agent.id === 'context-manager' && intent
        ? `${intent.summary || 'Intent captured'} (${Math.round((intent.confidence || 0) * 100)}%)`
        : agent.id === 'memory-archivist'
          ? (workspace.architectureMemory?.latestContext?.summary || latestIntentReport(workspace)?.summary || 'Canonical context archive ready')
          : agent.id === 'qa-lead'
          ? (normalizedQA.structuredBusy
            ? 'Structured QA is running'
            : normalizedQA.browserBusy
              ? 'Browser QA is running'
              : (normalizedQA.structuredReport?.summary || summarizeLocalGate(normalizedQA.localGate) || summarizeQABrowserRun(latestBrowserRun)))
        : `${metrics.count} related items in workspace`,
      throughputLabel: agent.id === 'context-manager' && intent
        ? `${(intent.tasks || []).length} intent tasks / ${Math.round((intent.confidence || 0) * 100)}% confidence`
        : agent.id === 'memory-archivist'
          ? `${(workspace.architectureMemory?.versions || []).length} archive versions / ${(workspace.annotations || []).length} annotations`
          : agent.id === 'qa-lead'
          ? `${qaScorecards.cards.length} scorecards / ${mergeBrowserRuns(latestBrowserRun, normalizedQA.browserRuns).length} browser runs / ${localGateOutputCount(normalizedQA.localGate)} local gates`
        : agent.id === 'cto-architect'
          ? `${qaScorecards.cards.length} scorecards / ${guardrailSummary.length} guardrails`
          : agent.id === 'executor'
          ? `${taskEconomy.completionCount} completion / ${taskEconomy.bottleneckCount} bottleneck / ${taskEconomy.upgradeReadiness}% ready`
          : agent.id === 'planner'
            ? `${taskEconomy.intakeCount} intake / ${taskEconomy.wipCount} WIP / ${taskEconomy.rewardCount} reward`
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
      agentContext: buildAgentContext({
        ...agent,
        workerState,
        status,
        workload,
        recentActions,
        latestSignal: runSignal?.summary || governedDesk?.lastOutput || governedDesk?.currentGoal || reviewReport?.summary || null,
        latestRunStatus: runSignal?.status || governedDesk?.localState || null,
        latestRunSummary: runSignal?.summary || governedDesk?.blockedReason || governedDesk?.currentGoal || null,
      }, {
        workspace,
        dashboardState,
        runs,
        recentHistory,
        qaState: normalizedQA,
      }, {
        layout: workspace?.studio?.layout || null,
      }),
    };
  });
}

