function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function latestIntentReport(workspace) {
  return workspace?.intentState?.contextReport || workspace?.intentState?.latest || workspace?.intentState?.reports?.[0] || null;
}

function buildEmptyGraph() {
  return { nodes: [], edges: [] };
}

function normalizeGraphBundle(workspace = {}) {
  const graphs = workspace?.graphs || {};
  const legacyGraph = workspace?.graph || buildEmptyGraph();
  return {
    system: {
      nodes: graphs.system?.nodes || legacyGraph.nodes || [],
      edges: graphs.system?.edges || legacyGraph.edges || [],
    },
    world: {
      nodes: graphs.world?.nodes || [],
      edges: graphs.world?.edges || [],
    },
  };
}

function createDefaultRsgState() {
  return {
    mode: 'dual-layer',
    worldDomain: 'gameplay-systems',
    approvalPolicy: {
      'system-structure': 'auto-record',
      'world-structure': 'auto-record',
      'adapter-translation': 'auto-record',
      'code-runtime-mutation': 'risk-gated-review',
    },
    proposals: [],
    summary: {
      systemStructure: 0,
      worldStructure: 0,
      adapterTranslation: 0,
      codeRuntimeMutation: 0,
    },
    lastEvaluatedAt: null,
  };
}

function inferProposalTarget(node = {}, layer = 'system') {
  if (node?.metadata?.proposalTarget) return node.metadata.proposalTarget;
  if (node?.type === 'adapter') return 'adapter-translation';
  if (layer === 'world') return 'world-structure';
  return 'system-structure';
}

function buildRsgState(workspace = {}) {
  const graphs = normalizeGraphBundle(workspace);
  const base = createDefaultRsgState();
  const graphProposals = ['system', 'world'].flatMap((layer) => (graphs[layer]?.nodes || [])
    .filter((node) => node?.metadata?.proposalTarget || node?.metadata?.labels?.includes('proposal') || node?.type === 'adapter')
    .map((node) => {
      const target = inferProposalTarget(node, layer);
      return {
        id: node.id,
        title: node.content || `${target} proposal`,
        target,
        sourceLayer: layer,
        sourceNodeId: node.id,
        approval: target === 'code-runtime-mutation' ? 'required' : 'auto-record',
        status: 'proposed',
      };
    }));
  const mutationProposals = (workspace?.studio?.teamBoard?.cards || [])
    .filter((card) => card?.executionPackage?.status === 'ready' || card?.status === 'review' || card?.applyStatus === 'queued' || card?.deployStatus === 'queued')
    .map((card) => ({
      id: `mutation_${card.id}`,
      title: card.title || 'Mutation package',
      target: 'code-runtime-mutation',
      sourceLayer: 'system',
      sourceNodeId: card.sourceNodeId || null,
      approval: 'required',
      status: card.status === 'review' ? 'awaiting-approval' : 'queued',
    }));
  const proposals = [...graphProposals, ...mutationProposals];
  return {
    ...base,
    proposals,
    summary: {
      systemStructure: proposals.filter((proposal) => proposal.target === 'system-structure').length,
      worldStructure: proposals.filter((proposal) => proposal.target === 'world-structure').length,
      adapterTranslation: proposals.filter((proposal) => proposal.target === 'adapter-translation').length,
      codeRuntimeMutation: proposals.filter((proposal) => proposal.target === 'code-runtime-mutation').length,
    },
    lastEvaluatedAt: new Date().toISOString(),
  };
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
  const graphs = normalizeGraphBundle(workspace);
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
        sourceNodeId: latestIntent?.nodeId || graphs.system?.nodes?.[0]?.id || null,
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
      binned: 0,
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

function normalizeTeamBoardState(workspace = {}) {
  const notebook = normalizeNotebookState(workspace);
  const board = workspace?.studio?.teamBoard || createDefaultTeamBoard();
  const existingCards = Array.isArray(board.cards) ? board.cards.filter(Boolean).map((card) => ({
    ...card,
    status: normalizeBoardStatus(card.status),
    sourceKey: card.sourceKey || cardSourceKey(card.pageId || notebook.activePageId, card.title || 'task'),
    phaseTicks: Number(card.phaseTicks || 0),
    targetProjectKey: card.targetProjectKey || 'ace-self',
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
      binned: mergedCards.filter((card) => card.status === 'binned').length,
      idleWorkers: Number(board.summary?.idleWorkers || 0),
    },
  };
}

function getActiveMutationCard(boardOrWorkspace = {}) {
  const board = Array.isArray(boardOrWorkspace?.cards)
    ? boardOrWorkspace
    : normalizeTeamBoardState(boardOrWorkspace);
  return board.cards.find((card) => (
    ['queued', 'applying', 'applied'].includes(card.applyStatus)
    || ['queued', 'deploying', 'deployed', 'flagged', 'failed'].includes(card.deployStatus)
    || card.approvalState === 'approved'
  )) || null;
}

function getSelectedExecutionCard(boardOrWorkspace = {}) {
  const board = Array.isArray(boardOrWorkspace?.cards)
    ? boardOrWorkspace
    : normalizeTeamBoardState(boardOrWorkspace);
  return board.cards.find((card) => card.id === board.selectedCardId) || getActiveMutationCard(board) || null;
}

const DESK_MISSIONS = {
  'context-manager': 'Maintain active page focus, context confidence, and desk-specific context slices.',
  planner: 'Translate active context into concrete plans, work items, and dependency-aware handoffs.',
  executor: 'Apply validated packages, run preflight, and deploy low-risk changes without stalling the flow.',
  'memory-archivist': 'Persist useful summaries, artifact references, and history for active work.',
  'cto-architect': 'Monitor guardrails, conflicts, and risk-gated mutation approvals across the desk network.',
};

const DESK_ALLOWED_ACTIONS = {
  'context-manager': ['set-active-page', 'slice-context', 'publish-handoff', 'flag-ambiguity'],
  planner: ['expand-plan', 'prioritise-work', 'publish-plan'],
  executor: ['apply-package', 'run-preflight', 'deploy-runtime', 'report-blocker'],
  'memory-archivist': ['archive-summary', 'record-artifact', 'snapshot-history'],
  'cto-architect': ['raise-conflict', 'approve-apply', 'reject-risky-change'],
};

const DESK_ORDER = ['context-manager', 'planner', 'executor', 'memory-archivist', 'cto-architect'];

function buildDeskWorkItems(deskId, workspace, notebook, handoff, selectedExecutionCard = null) {
  const latestIntent = latestIntentReport(workspace);
  const intentTasks = Array.isArray(latestIntent?.tasks) ? latestIntent.tasks.filter(Boolean) : [];
  const board = normalizeTeamBoardState(workspace);
  const activeMutationCard = getActiveMutationCard(board);
  const pendingReviewCard = board.cards.find((card) => card.status === 'review' && card.approvalState !== 'approved') || null;
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
    if (activeMutationCard) {
      return [{
        id: `${activeMutationCard.id}-execution`,
        pageId: activeMutationCard.pageId || notebook.activePageId,
        deskId,
        kind: activeMutationCard.deployStatus === 'deploying' ? 'deploy' : 'apply',
        status: ['applying', 'deploying'].includes(activeMutationCard.applyStatus) || activeMutationCard.deployStatus === 'deploying' ? 'running' : 'ready',
        dependsOn: activeMutationCard.sourceHandoffId ? [activeMutationCard.sourceHandoffId] : [],
        conflictTags: ['execute', activeMutationCard.id],
        artifactRefs: activeMutationCard.artifactRefs || [],
        title: activeMutationCard.deployStatus === 'deploying'
          ? `Deploy approved card: ${activeMutationCard.title}`
          : `Apply approved card: ${activeMutationCard.title}`,
      }];
    }
    if (pendingReviewCard) {
      return [{
        id: `${pendingReviewCard.id}-approval`,
        pageId: pendingReviewCard.pageId || notebook.activePageId,
        deskId,
        kind: 'approval-gated',
        status: 'waiting',
        dependsOn: pendingReviewCard.sourceHandoffId ? [pendingReviewCard.sourceHandoffId] : [],
        conflictTags: ['execute', pendingReviewCard.id],
        artifactRefs: pendingReviewCard.artifactRefs || [],
        title: `Awaiting approval: ${pendingReviewCard.title}`,
      }];
    }
    return intentTasks.slice(0, 2).map((task, index) => ({
      id: `${notebook.activePageId}-executor-${index}`,
      pageId: notebook.activePageId,
      deskId,
      kind: 'build-ready',
      status: 'waiting',
      dependsOn: handoff ? [handoff.id] : [],
      conflictTags: ['execute', `task-${index}`],
      artifactRefs: [],
      title: `Await builder package for: ${task}`,
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
  let openActiveSlots = Math.max(0, 2 - board.cards.filter((card) => normalizeBoardStatus(card.status) === 'active').length);
  const cards = [...board.cards]
    .sort((left, right) => String(left.createdAt || '').localeCompare(String(right.createdAt || '')))
    .map((card) => {
      let status = normalizeBoardStatus(card.status);
      if (status === 'plan' && handoff) {
        if (openActiveSlots > 0) {
          status = 'active';
          openActiveSlots -= 1;
        }
      }
      const nextCard = {
        ...card,
        status,
        phaseTicks: status === 'plan' ? Number(card.phaseTicks || 0) : 0,
        updatedAt: now,
      };
      return {
        ...nextCard,
        desk: deriveCardDesk(nextCard),
        state: deriveCardState(nextCard),
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
      binned: cards.filter((card) => card.status === 'binned').length,
      idleWorkers: countIdleWorkers(deskStates),
    },
  };
}

function buildDeskStates({ workspace, notebook, handoff, selectedExecutionCard = null }) {
  const latestIntent = latestIntentReport(workspace);
  const board = normalizeTeamBoardState(workspace);
  const activeMutationCard = getActiveMutationCard(board);
  const pendingReviewCard = board.cards.find((card) => card.status === 'review' && card.approvalState !== 'approved') || null;
  return Object.fromEntries(DESK_ORDER.map((deskId) => {
    const workItems = buildDeskWorkItems(deskId, workspace, notebook, handoff, selectedExecutionCard);
    const blockedReason = deskId === 'executor'
      ? (
          pendingReviewCard
            ? `Waiting for approval on ${pendingReviewCard.title}.`
            : (handoff?.status === 'needs-clarification' && !activeMutationCard
              ? 'Execution is gated until Context Manager clarifies the active page intent.'
              : null)
        )
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
        : deskId === 'executor' && activeMutationCard
          ? `${activeMutationCard.state}: ${activeMutationCard.title}`
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
  const boardState = normalizeTeamBoardState(teamBoard || workspace);
  const selectedExecutionCard = getActiveMutationCard(boardState);
  const pendingReviewCard = boardState.cards.find((card) => card.status === 'review' && card.approvalState !== 'approved') || null;
  const deskRun = latestDeskRun(deskId, runs);
  const localState = deskStates?.[deskId]?.localState || 'waiting';
  const boardSummary = boardState.summary || { plan: 0, active: 0, complete: 0, review: 0, idleWorkers: 0 };
  if (deskId === 'cto-architect') {
    if (selfUpgrade?.deploy?.status === 'restarting') {
      return '🟠 restarting ACE...';
    }
    if (pendingReviewCard?.deployStatus === 'flagged' || pendingReviewCard?.applyStatus === 'failed' || selfUpgrade?.preflight?.status === 'failed') {
      return '🟠 reviewing preflight failures...';
    }
    if (boardSummary.review) {
      return `🟠 ${boardSummary.review} task${boardSummary.review === 1 ? '' : 's'} ready to apply.`;
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
    if (selectedExecutionCard?.deployStatus === 'deploying') return '🟢 deploying ACE...';
    if (selectedExecutionCard?.deployStatus === 'deployed') return '🟢 deploy complete.';
    if (selectedExecutionCard?.deployStatus === 'flagged') return '🔴 deploy flagged for review.';
    if (selectedExecutionCard?.applyStatus === 'applying' || (deskRun?.status === 'running' && deskRun.action === 'apply')) return '🟢 applying patch...';
    if (selectedExecutionCard?.applyStatus === 'queued') return `🟢 queued ${selectedExecutionCard.title.slice(0, 28)}...`;
    if (selectedExecutionCard?.applyStatus === 'applied' && selectedExecutionCard.targetProjectKey !== 'ace-self') return '🟢 patch applied.';
    if (deskRun?.status === 'running' && deskRun.action === 'run') return '🟢 verifying output...';
    if (pendingReviewCard) return '🔴 waiting for risky apply approval.';
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
  const board = normalizeTeamBoardState(workspace);
  const pendingReviewCard = board.cards.find((card) => card.status === 'review' && card.approvalState !== 'approved') || null;
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
  if (pendingReviewCard) {
    conflicts.push({
      id: `ready-to-apply-${pendingReviewCard.id}`,
      kind: 'ready-to-apply',
      severity: 'high',
      desks: ['executor', 'cto-architect'],
      summary: `${pendingReviewCard.title} is waiting at the apply gate because ${pendingReviewCard.riskReasons?.[0] || 'risk heuristics require approval'}.`,
    });
  }
  if (selectedExecutionCard?.deployStatus === 'flagged' || selectedExecutionCard?.applyStatus === 'failed') {
    conflicts.push({
      id: `mutation-flagged-${selectedExecutionCard.id}`,
      kind: 'mutation-flagged',
      severity: 'high',
      desks: ['executor', 'cto-architect'],
      summary: `${selectedExecutionCard.title} was flagged during ${selectedExecutionCard.deployStatus === 'flagged' ? 'deploy' : 'apply'} and needs intervention.`,
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
  const graphs = normalizeGraphBundle(workspace);
  const normalizedWorkspace = {
    ...workspace,
    graph: graphs.system,
    graphs,
  };
  const notebook = normalizeNotebookState(normalizedWorkspace);
  const latestIntent = latestIntentReport(normalizedWorkspace);
  const handoff = normalizedWorkspace?.studio?.handoffs?.contextToPlanner || null;
  const baseBoard = normalizeTeamBoardState(normalizedWorkspace);
  const initialSelectedExecutionCard = getSelectedExecutionCard(baseBoard);
  const initialDeskStates = buildDeskStates({
    workspace: normalizedWorkspace,
    notebook,
    handoff,
    selectedExecutionCard: initialSelectedExecutionCard,
  });
  const initialConflicts = detectConflicts(normalizedWorkspace, handoff, initialDeskStates, initialSelectedExecutionCard);
  const teamBoard = advanceTeamBoardState({
    workspace: normalizedWorkspace,
    handoff,
    board: baseBoard,
    deskStates: initialDeskStates,
    conflicts: initialConflicts,
    runs,
  });
  const selectedExecutionCard = getSelectedExecutionCard(teamBoard);
  const deskStates = buildDeskStates({
    workspace: normalizedWorkspace,
    notebook,
    handoff,
    selectedExecutionCard,
  });
  const conflicts = detectConflicts(normalizedWorkspace, handoff, deskStates, selectedExecutionCard);
  DESK_ORDER.forEach((deskId) => {
    if (deskId === 'planner' && teamBoard.summary.plan) {
      deskStates[deskId].thoughtBubble = `🟡 ${teamBoard.summary.plan} tasks in backlog. ${teamBoard.summary.idleWorkers} workers idle. Rebalancing workload...`;
      return;
    }
    if (deskId === 'context-manager' && handoff?.status === 'needs-clarification' && teamBoard.summary.plan) {
      deskStates[deskId].thoughtBubble = `🔵 clarifying ${teamBoard.summary.plan} planned task${teamBoard.summary.plan === 1 ? '' : 's'}...`;
      return;
    }
    deskStates[deskId].thoughtBubble = buildDeskThoughtBubble(deskId, normalizedWorkspace, handoff, conflicts, deskStates, runs, teamBoard);
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

  const nextWorkspace = {
    ...normalizedWorkspace,
    pages,
    activePageId: notebook.activePageId,
    studio: {
      ...(normalizedWorkspace.studio || {}),
      teamBoard,
      orchestrator,
    },
  };
  return {
    ...nextWorkspace,
    graph: graphs.system,
    graphs,
    rsg: buildRsgState(nextWorkspace),
  };
}

function buildRuntimePayload(workspace = {}) {
  const graphs = normalizeGraphBundle(workspace);
  const normalizedWorkspace = {
    ...workspace,
    graph: graphs.system,
    graphs,
  };
  const notebook = normalizeNotebookState(normalizedWorkspace);
  return {
    activePageId: notebook.activePageId,
    pages: notebook.pages,
    handoffs: normalizedWorkspace?.studio?.handoffs || {},
    selfUpgrade: normalizedWorkspace?.studio?.selfUpgrade || null,
    teamBoard: normalizeTeamBoardState(normalizedWorkspace),
    orchestrator: normalizedWorkspace?.studio?.orchestrator || {
      status: 'idle',
      lastTickAt: null,
      activeDeskIds: [],
      conflicts: [],
      pendingUserActions: [],
      desks: {},
      activePageId: notebook.activePageId,
    },
    graphs,
    rsg: workspace?.rsg || buildRsgState(normalizedWorkspace),
  };
}

module.exports = {
  createDefaultPage,
  createDefaultTeamBoard,
  normalizeGraphBundle,
  createDefaultRsgState,
  buildRsgState,
  normalizeNotebookState,
  normalizeTeamBoardState,
  advanceOrchestratorWorkspace,
  buildRuntimePayload,
};
