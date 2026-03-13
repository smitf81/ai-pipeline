function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function latestIntentReport(workspace) {
  return workspace?.intentState?.contextReport || workspace?.intentState?.latest || workspace?.intentState?.reports?.[0] || null;
}

function createDefaultPage({ id = null, title = 'Current Page', sourceNodeId = null, createdAt = null } = {}) {
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

function normalizeNotebookState(workspace = {}) {
  const latestIntent = latestIntentReport(workspace);
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
        sourceNodeId: latestIntent?.nodeId || workspace?.graph?.nodes?.[0]?.id || null,
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

function createDefaultTeamBoard() {
  return {
    cards: [],
    selectedCardId: null,
    updatedAt: null,
    summary: {
      plan: 0,
      active: 0,
      complete: 0,
      review: 0,
      idleWorkers: 0,
    },
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
  if (status === 'binned') return 'plan';
  if (status === 'ready') return 'plan';
  return ['plan', 'active', 'complete', 'review'].includes(status) ? status : 'plan';
}

function cardSourceKey(pageId, title) {
  return `${pageId}:${slugify(title)}`;
}

function deskLabelForCard(status, { selected = false, reviewGate = false } = {}) {
  if (selected) return 'Worker';
  if (status === 'review') return 'CTO';
  if (status === 'complete') return 'Archivist';
  if (status === 'active') return reviewGate ? 'Context' : 'Planner';
  return reviewGate ? 'Context' : 'Planner';
}

function stateLabelForCard(status, { selected = false, reviewGate = false } = {}) {
  if (selected) return 'Queued for execution';
  if (status === 'review') return 'Task requires approval';
  if (status === 'complete') return reviewGate ? 'Pending review' : 'Complete';
  if (status === 'active') return reviewGate ? 'Clarifying' : 'In progress';
  return reviewGate ? 'Waiting on context' : 'Ready';
}

function createTeamBoardCard({ cards = [], pageId, handoffId, sourceNodeId, title, createdAt = null }) {
  const now = createdAt || new Date().toISOString();
  return {
    id: nextTeamBoardTaskId(cards),
    sourceKey: cardSourceKey(pageId, title),
    pageId,
    sourceHandoffId: handoffId || null,
    sourceNodeId: sourceNodeId || null,
    title,
    status: 'plan',
    desk: 'Planner',
    state: 'Ready',
    phaseTicks: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeTeamBoardState(workspace = {}) {
  const notebook = normalizeNotebookState(workspace);
  const board = workspace?.studio?.teamBoard || createDefaultTeamBoard();
  const existingCards = Array.isArray(board.cards) ? board.cards.filter(Boolean).map((card) => ({
    ...card,
    status: normalizeBoardStatus(card.status),
    sourceKey: card.sourceKey || cardSourceKey(card.pageId || notebook.activePageId, card.title || 'task'),
    desk: card.desk || deskLabelForCard(normalizeBoardStatus(card.status)),
    state: card.state || stateLabelForCard(normalizeBoardStatus(card.status)),
    phaseTicks: Number(card.phaseTicks || 0),
  })) : [];
  const handoff = workspace?.studio?.handoffs?.contextToPlanner || null;
  const workingCards = [...existingCards];
  const seededCards = (handoff?.tasks || []).filter(Boolean).map((task) => {
    const sourceKey = cardSourceKey(notebook.activePageId, task);
    const existingCard = workingCards.find((card) => card.sourceKey === sourceKey);
    if (existingCard) return existingCard;
    const nextCard = createTeamBoardCard({
      cards: workingCards,
      pageId: notebook.activePageId,
      handoffId: handoff?.id || null,
      sourceNodeId: handoff?.sourceNodeId || null,
      title: task,
      createdAt: handoff?.createdAt || null,
    });
    workingCards.push(nextCard);
    return nextCard;
  });
  const mergedCards = [...workingCards];
  seededCards.forEach((card) => {
    if (!mergedCards.some((entry) => entry.id === card.id)) mergedCards.push(card);
  });
  const selectedCard = mergedCards.find((card) => card.id === board.selectedCardId) || null;
  return {
    cards: mergedCards,
    selectedCardId: selectedCard?.id || null,
    updatedAt: new Date().toISOString(),
    summary: {
      plan: mergedCards.filter((card) => card.status === 'plan').length,
      active: mergedCards.filter((card) => card.status === 'active').length,
      complete: mergedCards.filter((card) => card.status === 'complete').length,
      review: mergedCards.filter((card) => card.status === 'review').length,
      idleWorkers: Number(board.summary?.idleWorkers || 0),
    },
  };
}

function getSelectedExecutionCard(boardOrWorkspace = {}) {
  const board = Array.isArray(boardOrWorkspace?.cards)
    ? boardOrWorkspace
    : normalizeTeamBoardState(boardOrWorkspace);
  return board.cards.find((card) => card.id === board.selectedCardId) || null;
}

const DESK_MISSIONS = {
  'context-manager': 'Maintain active page focus, context confidence, and desk-specific context slices.',
  planner: 'Translate active context into concrete plans, work items, and dependency-aware handoffs.',
  executor: 'Own tangible delivery outputs when plan items are approved and unblocked.',
  'memory-archivist': 'Persist useful summaries, artifact references, and history for active work.',
  'cto-architect': 'Monitor guardrails, conflicts, and review readiness across the desk network.',
};

const DESK_ALLOWED_ACTIONS = {
  'context-manager': ['set-active-page', 'slice-context', 'publish-handoff', 'flag-ambiguity'],
  planner: ['expand-plan', 'prioritise-work', 'publish-plan'],
  executor: ['prepare-output', 'draft-patch', 'report-blocker'],
  'memory-archivist': ['archive-summary', 'record-artifact', 'snapshot-history'],
  'cto-architect': ['raise-conflict', 'approve-scope', 'request-review'],
};

const DESK_ORDER = ['context-manager', 'planner', 'executor', 'memory-archivist', 'cto-architect'];

function buildDeskWorkItems(deskId, workspace, notebook, handoff, selectedExecutionCard = null) {
  const latestIntent = latestIntentReport(workspace);
  const intentTasks = Array.isArray(latestIntent?.tasks) ? latestIntent.tasks.filter(Boolean) : [];
  if (deskId === 'context-manager') {
    return [{
      id: `${notebook.activePageId}-context-watch`,
      pageId: notebook.activePageId,
      deskId,
      kind: 'context-watch',
      status: latestIntent ? 'running' : 'waiting',
      dependsOn: [],
      conflictTags: ['context'],
      artifactRefs: handoff ? [handoff.id] : [],
      title: latestIntent?.summary || 'Maintain current page context',
    }];
  }
  if (deskId === 'planner') {
    return intentTasks.slice(0, 3).map((task, index) => ({
      id: `${notebook.activePageId}-planner-${index}`,
      pageId: notebook.activePageId,
      deskId,
      kind: 'plan-item',
      status: handoff ? 'running' : 'waiting',
      dependsOn: handoff ? [handoff.id] : [],
      conflictTags: ['plan', `task-${index}`],
      artifactRefs: handoff ? [handoff.id] : [],
      title: task,
    }));
  }
  if (deskId === 'executor') {
    if (selectedExecutionCard) {
      return [{
        id: `${selectedExecutionCard.id}-execution`,
        pageId: selectedExecutionCard.pageId || notebook.activePageId,
        deskId,
        kind: 'approved-execution',
        status: 'ready',
        dependsOn: selectedExecutionCard.sourceHandoffId ? [selectedExecutionCard.sourceHandoffId] : [],
        conflictTags: ['execute', selectedExecutionCard.id],
        artifactRefs: [],
        title: `Execute approved card: ${selectedExecutionCard.title}`,
      }];
    }
    return intentTasks.slice(0, 2).map((task, index) => ({
      id: `${notebook.activePageId}-executor-${index}`,
      pageId: notebook.activePageId,
      deskId,
      kind: 'execution-item',
      status: handoff && Number(latestIntent?.confidence || 0) >= 0.55 ? 'ready' : 'waiting',
      dependsOn: handoff ? [handoff.id] : [],
      conflictTags: ['execute', `task-${index}`],
      artifactRefs: [],
      title: `Prepare output for: ${task}`,
    }));
  }
  if (deskId === 'memory-archivist') {
    return [{
      id: `${notebook.activePageId}-memory-sync`,
      pageId: notebook.activePageId,
      deskId,
      kind: 'memory-sync',
      status: (workspace.annotations || []).length || (workspace.sketches || []).length || handoff ? 'running' : 'waiting',
      dependsOn: [],
      conflictTags: ['memory'],
      artifactRefs: handoff ? [handoff.id] : [],
      title: 'Capture notes, handoffs, and artifact history',
    }];
  }
  return [{
    id: `${notebook.activePageId}-governance-check`,
    pageId: notebook.activePageId,
    deskId,
    kind: 'governance-check',
    status: handoff ? 'running' : 'waiting',
    dependsOn: handoff ? [handoff.id] : [],
    conflictTags: ['review', 'governance'],
    artifactRefs: handoff ? [handoff.id] : [],
    title: 'Review desk overlap, approval state, and guardrails',
  }];
}

function latestDeskRun(deskId, runs = []) {
  return (runs || []).find((run) => {
    const action = String(run?.action || '').toLowerCase();
    if (deskId === 'context-manager') return ['scan', 'manage'].includes(action);
    if (deskId === 'planner') return action === 'manage';
    if (deskId === 'executor') return ['build', 'run', 'apply'].includes(action);
    if (deskId === 'memory-archivist') return Boolean(run?.artifacts?.length);
    if (deskId === 'cto-architect') return ['apply', 'manage', 'run'].includes(action);
    return false;
  }) || null;
}

function countIdleWorkers(deskStates = {}) {
  return ['planner', 'executor']
    .filter((deskId) => ['waiting', 'ready'].includes(deskStates?.[deskId]?.localState))
    .length;
}

function advanceTeamBoardState({ workspace, handoff, board, deskStates = {}, conflicts = [], runs = [] }) {
  const now = new Date().toISOString();
  const latestIntent = latestIntentReport(workspace);
  const selfUpgrade = workspace?.studio?.selfUpgrade || null;
  const latestExecutorRun = latestDeskRun('executor', runs);
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
      if (isSelected) {
        return {
          ...card,
          status: 'review',
          desk: 'Worker',
          state: latestExecutorRun?.status === 'running' ? 'Running patch' : 'Queued for execution',
          updatedAt: now,
        };
      }
      if (status === 'plan' && handoff) {
        if (openActiveSlots > 0) {
          status = 'active';
          phaseTicks = 0;
          openActiveSlots -= 1;
        } else {
          phaseTicks = 0;
        }
      } else if (status === 'active') {
        phaseTicks += 1;
        if (phaseTicks >= 1) {
          status = 'complete';
          phaseTicks = 0;
        }
      } else if (status === 'complete') {
        phaseTicks += 1;
        if (reviewGate && phaseTicks >= 1) {
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
        desk: deskLabelForCard(status, { reviewGate }),
        state: stateLabelForCard(status, { reviewGate }),
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
      idleWorkers: countIdleWorkers(deskStates),
    },
  };
}

function buildDeskStates({ workspace, notebook, handoff, selectedExecutionCard = null }) {
  const latestIntent = latestIntentReport(workspace);
  return Object.fromEntries(DESK_ORDER.map((deskId) => {
    const workItems = buildDeskWorkItems(deskId, workspace, notebook, handoff, selectedExecutionCard);
    const blockedReason = deskId === 'executor' && handoff?.status === 'needs-clarification' && !selectedExecutionCard
      ? 'Execution is gated until Context Manager clarifies the active page intent.'
      : null;
    const localState = blockedReason
      ? 'blocked'
      : workItems.some((item) => item.status === 'running')
        ? 'running'
        : workItems.some((item) => item.status === 'ready')
          ? 'ready'
          : 'waiting';
    return [deskId, {
      mission: DESK_MISSIONS[deskId],
      localState,
      currentGoal: workItems[0]?.title || DESK_MISSIONS[deskId],
      allowedActions: DESK_ALLOWED_ACTIONS[deskId] || [],
      workItems,
      lastOutput: deskId === 'context-manager'
        ? handoff?.summary || latestIntent?.summary || null
        : deskId === 'executor' && selectedExecutionCard
          ? `Queued review card: ${selectedExecutionCard.title}`
          : workItems[0]?.title || null,
      blockedReason,
      contextSlice: {
        activePageId: notebook.activePageId,
        activePageTitle: notebook.activePage.title,
        pageGoal: latestIntent?.summary || notebook.activePage.summary,
        matchedTerms: latestIntent?.projectContext?.matchedTerms || [],
      },
      freshAt: new Date().toISOString(),
      thoughtBubble: '',
    }];
  }));
}

function buildDeskThoughtBubble(deskId, workspace, handoff, conflicts, deskStates, runs = [], teamBoard = null) {
  const latestIntent = latestIntentReport(workspace);
  const selfUpgrade = workspace?.studio?.selfUpgrade || null;
  const selectedExecutionCard = getSelectedExecutionCard(teamBoard || workspace);
  const deskRun = latestDeskRun(deskId, runs);
  const localState = deskStates?.[deskId]?.localState || 'waiting';
  const boardSummary = teamBoard?.summary || { plan: 0, active: 0, complete: 0, review: 0, idleWorkers: 0 };
  if (deskId === 'cto-architect') {
    if (selfUpgrade?.deploy?.status === 'restarting') {
      return '🟠 restarting ACE...';
    }
    if (selfUpgrade?.preflight?.status === 'failed') {
      return '🟠 reviewing preflight failures...';
    }
    if (selfUpgrade?.status === 'ready-to-deploy') {
      return '🟠 holding self-upgrade deploy...';
    }
    if (boardSummary.review) {
      return `🟠 ${boardSummary.review} task${boardSummary.review === 1 ? '' : 's'} require approval.`;
    }
    if (conflicts.length) {
      return '🟠 reviewing governance signals...';
    }
    if (handoff?.status === 'needs-clarification') {
      return '🟠 throttling execution until context is clearer...';
    }
    return deskRun?.status === 'running' || localState === 'running'
      ? '🟠 coordinating desks...'
      : '🟠 monitoring guardrails...';
  }
  if (deskId === 'context-manager') {
    if (deskRun?.status === 'running' && deskRun.action === 'scan') return '🔵 ingesting docs...';
    if (deskRun?.status === 'running' && deskRun.action === 'manage') return '🔵 extracting intent...';
    if (localState === 'running') return '🔵 stabilizing context...';
    return latestIntent?.summary ? '🔵 holding page context...' : '🔵 waiting for source context...';
  }
  if (deskId === 'planner') {
    if (deskRun?.status === 'running' && deskRun.action === 'manage') return '🟡 generating tasks...';
    if ((deskStates.planner?.workItems?.length || 0) > 1) return '🟡 sequencing plan items...';
    if (localState === 'running') return '🟡 shaping the next task...';
    return '🟡 waiting for context handoff...';
  }
  if (deskId === 'executor') {
    if (deskRun?.status === 'running' && deskRun.action === 'apply') return '🟢 applying patch...';
    if (deskRun?.status === 'running' && deskRun.action === 'build') return '🟢 running patch...';
    if (deskRun?.status === 'running' && deskRun.action === 'run') return '🟢 verifying output...';
    if (selectedExecutionCard && (localState === 'ready' || localState === 'running')) return `🟢 queued ${selectedExecutionCard.title.slice(0, 28)}...`;
    if (handoff?.status === 'needs-clarification' || localState === 'blocked') return '🔴 blocked by low-confidence context.';
    if (localState === 'ready' || localState === 'running') return '🟢 preparing output...';
    return '🟢 waiting for approved work...';
  }
  return localState === 'running'
    ? '🟣 logging summaries...'
    : '🟣 waiting to archive changes...';
}

function detectConflicts(workspace, handoff, deskStates, selectedExecutionCard = null) {
  const conflicts = [];
  const latestIntent = latestIntentReport(workspace);
  if (Number(latestIntent?.confidence || 0) < 0.55) {
    conflicts.push({
      id: 'low-confidence-context',
      kind: 'low-confidence-context',
      severity: 'medium',
      desks: ['context-manager', 'planner', 'executor'],
      summary: 'Planner and Executor are sharing work against a low-confidence context packet.',
    });
  }
  if ((deskStates.executor?.workItems || []).length && (deskStates.planner?.workItems || []).length) {
    conflicts.push({
      id: 'parallel-plan-execution',
      kind: 'parallel-plan-execution',
      severity: 'low',
      desks: ['planner', 'executor'],
      summary: 'Planner and Executor are active on the same page and must stay within scoped outputs.',
    });
  }
  if (handoff?.status === 'needs-clarification') {
    if (selectedExecutionCard) return conflicts;
    conflicts.push({
      id: 'clarification-needed',
      kind: 'clarification-needed',
      severity: 'high',
      desks: ['context-manager', 'cto-architect'],
      summary: 'Current handoff requires clarification before execution should advance.',
    });
  }
  return conflicts;
}

function advanceOrchestratorWorkspace(workspace = {}, { dashboardState = {}, runs = [] } = {}) {
  const notebook = normalizeNotebookState(workspace);
  const latestIntent = latestIntentReport(workspace);
  const handoff = workspace?.studio?.handoffs?.contextToPlanner || null;
  const baseBoard = normalizeTeamBoardState(workspace);
  const initialSelectedExecutionCard = getSelectedExecutionCard(baseBoard);
  const initialDeskStates = buildDeskStates({
    workspace,
    notebook,
    handoff,
    selectedExecutionCard: initialSelectedExecutionCard,
  });
  const initialConflicts = detectConflicts(workspace, handoff, initialDeskStates, initialSelectedExecutionCard);
  const teamBoard = advanceTeamBoardState({
    workspace,
    handoff,
    board: baseBoard,
    deskStates: initialDeskStates,
    conflicts: initialConflicts,
    runs,
  });
  const selectedExecutionCard = getSelectedExecutionCard(teamBoard);
  const deskStates = buildDeskStates({
    workspace,
    notebook,
    handoff,
    selectedExecutionCard,
  });
  const conflicts = detectConflicts(workspace, handoff, deskStates, selectedExecutionCard);
  DESK_ORDER.forEach((deskId) => {
    if (deskId === 'planner' && teamBoard.summary.plan) {
      deskStates[deskId].thoughtBubble = `🟡 ${teamBoard.summary.plan} tasks in backlog. ${teamBoard.summary.idleWorkers} workers idle. Rebalancing workload...`;
      return;
    }
    if (deskId === 'context-manager' && handoff?.status === 'needs-clarification' && teamBoard.summary.plan) {
      deskStates[deskId].thoughtBubble = `🔵 clarifying ${teamBoard.summary.plan} planned task${teamBoard.summary.plan === 1 ? '' : 's'}...`;
      return;
    }
    deskStates[deskId].thoughtBubble = buildDeskThoughtBubble(deskId, workspace, handoff, conflicts, deskStates, runs, teamBoard);
  });
  const pendingUserActions = [
    ...(Number(latestIntent?.confidence || 0) < 0.55 ? ['Clarify the active page goal before execution advances further.'] : []),
    ...((dashboardState.blockers || []).slice(0, 2).map((item) => `Resolve blocker: ${item}`)),
  ];
  const orchestrator = {
    status: conflicts.some((conflict) => conflict.severity === 'high') ? 'needs-attention' : 'running',
    lastTickAt: new Date().toISOString(),
    activeDeskIds: Object.entries(deskStates)
      .filter(([, state]) => state.localState === 'running' || state.localState === 'ready')
      .map(([deskId]) => deskId),
    conflicts,
    pendingUserActions,
    desks: deskStates,
    activePageId: notebook.activePageId,
  };
  const pages = notebook.pages.map((page) => page.id === notebook.activePageId
    ? {
        ...page,
        title: latestIntent?.summary ? latestIntent.summary.slice(0, 48) : page.title,
        summary: latestIntent?.summary || page.summary,
        sourceNodeId: latestIntent?.nodeId || page.sourceNodeId,
        updatedAt: new Date().toISOString(),
        handoffs: handoff ? [handoff, ...(page.handoffs || []).filter((entry) => entry.id !== handoff.id)].slice(0, 8) : (page.handoffs || []),
      }
    : page);

  return {
    ...workspace,
    pages,
    activePageId: notebook.activePageId,
    studio: {
      ...(workspace.studio || {}),
      teamBoard,
      orchestrator,
    },
  };
}

function buildRuntimePayload(workspace = {}) {
  const notebook = normalizeNotebookState(workspace);
  return {
    activePageId: notebook.activePageId,
    pages: notebook.pages,
    handoffs: workspace?.studio?.handoffs || {},
    selfUpgrade: workspace?.studio?.selfUpgrade || null,
    teamBoard: normalizeTeamBoardState(workspace),
    orchestrator: workspace?.studio?.orchestrator || {
      status: 'idle',
      lastTickAt: null,
      activeDeskIds: [],
      conflicts: [],
      pendingUserActions: [],
      desks: {},
      activePageId: notebook.activePageId,
    },
  };
}

module.exports = {
  createDefaultPage,
  createDefaultTeamBoard,
  normalizeNotebookState,
  normalizeTeamBoardState,
  advanceOrchestratorWorkspace,
  buildRuntimePayload,
};
