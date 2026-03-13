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

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function latestIntentReport(workspace) {
  return workspace.intentState?.contextReport || workspace.intentState?.latest || workspace.intentState?.reports?.[0] || null;
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
        sourceNodeId: latestIntent?.nodeId || workspace.graph?.nodes?.[0]?.id || null,
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
    runnerTaskId: null,
    runIds: [],
    artifactRefs: [],
    deployStatus: 'idle',
    auditSessionId: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeTeamBoardState(workspace = {}) {
  const notebook = normalizeNotebookState(workspace);
  const board = workspace?.studio?.teamBoard || createDefaultTeamBoard();
  const existingCards = Array.isArray(board.cards) ? board.cards.filter(Boolean).map((card) => ({
    ...card,
    status: normalizeBoardStatus(card.status),
    sourceKey: card.sourceKey || cardSourceKey(card.pageId || notebook.activePageId, card.title || 'task'),
    desk: card.desk || deskLabelForCard(normalizeBoardStatus(card.status)),
    state: card.state || stateLabelForCard(normalizeBoardStatus(card.status)),
    phaseTicks: Number(card.phaseTicks || 0),
    runnerTaskId: card.runnerTaskId || null,
    runIds: Array.isArray(card.runIds) ? card.runIds.filter(Boolean) : [],
    artifactRefs: Array.isArray(card.artifactRefs) ? card.artifactRefs.filter(Boolean) : [],
    deployStatus: card.deployStatus || 'idle',
    auditSessionId: card.auditSessionId || null,
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

function getSelectedExecutionCard(workspace = {}) {
  const board = Array.isArray(workspace?.cards) ? workspace : normalizeTeamBoardState(workspace);
  return board.cards.find((card) => card.id === board.selectedCardId) || null;
}

function collectConstraints(report, dashboardState) {
  const blockers = Array.isArray(report?.projectContext?.blockers) ? report.projectContext.blockers : [];
  const dashboardBlockers = Array.isArray(dashboardState?.blockers) ? dashboardState.blockers : [];
  const lowCriteria = (report?.criteria || [])
    .filter((criterion) => Number(criterion.score || 0) < 0.55)
    .map((criterion) => `${criterion.label}: ${criterion.reason || 'Needs clarification.'}`);
  return [...new Set([...blockers, ...dashboardBlockers, ...lowCriteria])].slice(0, 8);
}

export function createPlannerHandoff(report, dashboardState = {}, previousHandoff = null) {
  if (!report) return null;
  const tasks = Array.isArray(report.tasks) ? report.tasks.filter(Boolean) : [];
  const constraints = collectConstraints(report, dashboardState);
  const clarifications = [];
  if (Number(report.confidence || 0) < 0.55) clarifications.push('Intent confidence is low and should be checked before execution expands.');
  if (!tasks.length) clarifications.push('No concrete tasks were extracted from the latest context input.');
  if (!report.projectContext?.matchedTerms?.length) clarifications.push('Project alignment is weak, so planner scope may need refinement.');
  const rationale = (report.criteria || [])
    .slice(0, 3)
    .map((criterion) => `${criterion.label} ${Math.round((criterion.score || 0) * 100)}%`)
    .join(', ');
  const problemStatement = [
    `Goal: ${report.summary || 'Clarify the next problem to solve.'}`,
    tasks.length ? `Requested outcomes: ${tasks.join('; ')}.` : 'Requested outcomes: no concrete task list extracted yet.',
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
    tasks,
    constraints,
    confidence: Number(report.confidence || 0),
    criteria: Array.isArray(report.criteria) ? report.criteria : [],
    classification: report.classification || { role: 'context', labels: [] },
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

function matchesScope(agent, text) {
  return agent.scope.some((keyword) => text.includes(keyword));
}

function collectNodeMetrics(agent, graph, workspace) {
  const nodes = (graph?.nodes || []).filter((node) => {
    const content = `${node.type} ${node.content || ''}`.toLowerCase();
    return matchesScope(agent, content);
  });
  const latestIntent = latestIntentReport(workspace);
  if (agent.id === 'planner' && latestIntent?.tasks?.length) {
    return {
      nodes,
      count: Math.max(nodes.length, latestIntent.tasks.length),
      queue: Math.max(0, latestIntent.tasks.length - 1),
    };
  }
  if (agent.id === 'executor' && latestIntent?.tasks?.length) {
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
  const intentTasks = Array.isArray(latestIntent?.tasks) ? latestIntent.tasks.filter(Boolean) : [];
  if (agentId === 'context-manager') {
    return [
      {
        id: makeId('work'),
        pageId: notebook.activePageId,
        deskId: agentId,
        kind: 'context-watch',
        status: latestIntent ? 'running' : 'waiting',
        dependsOn: [],
        conflictTags: ['context'],
        artifactRefs: handoff ? [handoff.id] : [],
        title: latestIntent?.summary || 'Maintain current page context',
      },
    ];
  }
  if (agentId === 'planner') {
    return intentTasks.slice(0, 3).map((task, index) => ({
      id: makeId('work'),
      pageId: notebook.activePageId,
      deskId: agentId,
      kind: 'plan-item',
      status: handoff ? 'running' : 'waiting',
      dependsOn: handoff ? [handoff.id] : [],
      conflictTags: ['plan', `task-${index}`],
      artifactRefs: handoff ? [handoff.id] : [],
      title: task,
    }));
  }
  if (agentId === 'executor') {
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
        title: 'Capture notes, handoffs, and artifact history',
      },
    ];
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
      title: 'Review desk overlap, approval state, and guardrails',
    },
  ];
}

function detectConflicts({ workspace, handoff, deskStates, selectedExecutionCard = null }) {
  const conflicts = [];
  const latestIntent = latestIntentReport(workspace);
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
  return conflicts;
}

export function advanceOrchestratorState({ workspace, dashboardState = {}, runs = [], previousState = null }) {
  const notebook = normalizeNotebookState(workspace);
  const latestIntent = latestIntentReport(workspace);
  const handoff = workspace.studio?.handoffs?.contextToPlanner || null;
  const baseBoard = normalizeTeamBoardState(workspace);
  const initialSelectedExecutionCard = getSelectedExecutionCard(baseBoard);
  const initialDeskStates = Object.fromEntries(STATIONS.map((agent) => {
    const workItems = buildDeskWorkItems(agent.id, workspace, notebook, handoff, initialSelectedExecutionCard);
    const blockedReason = agent.id === 'executor' && handoff?.status === 'needs-clarification' && !initialSelectedExecutionCard
      ? 'Execution is gated until Context Manager clarifies the active page intent.'
      : null;
    const localStatus = blockedReason
      ? 'blocked'
      : workItems.some((item) => item.status === 'running')
        ? 'running'
        : workItems.some((item) => item.status === 'ready')
          ? 'ready'
          : 'waiting';
    return [agent.id, {
      mission: DESK_MISSIONS[agent.id],
      localState: localStatus,
      currentGoal: workItems[0]?.title || agent.role,
      allowedActions: DESK_ALLOWED_ACTIONS[agent.id] || [],
      workItems,
      lastOutput: agent.id === 'context-manager'
        ? handoff?.summary || latestIntent?.summary || null
        : agent.id === 'executor' && initialSelectedExecutionCard
          ? `Queued review card: ${initialSelectedExecutionCard.title}`
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
    board: baseBoard,
    deskStates: initialDeskStates,
    conflicts: initialConflicts,
    runs,
  });
  const selectedExecutionCard = getSelectedExecutionCard(teamBoard);
  const deskStates = Object.fromEntries(STATIONS.map((agent) => {
    const workItems = buildDeskWorkItems(agent.id, workspace, notebook, handoff, selectedExecutionCard);
    const blockedReason = agent.id === 'executor' && handoff?.status === 'needs-clarification' && !selectedExecutionCard
      ? 'Execution is gated until Context Manager clarifies the active page intent.'
      : null;
    const localStatus = blockedReason
      ? 'blocked'
      : workItems.some((item) => item.status === 'running')
        ? 'running'
        : workItems.some((item) => item.status === 'ready')
          ? 'ready'
          : 'waiting';
    return [agent.id, {
      mission: DESK_MISSIONS[agent.id],
      localState: localStatus,
      currentGoal: workItems[0]?.title || agent.role,
      allowedActions: DESK_ALLOWED_ACTIONS[agent.id] || [],
      workItems,
      lastOutput: agent.id === 'context-manager'
        ? handoff?.summary || latestIntent?.summary || null
        : agent.id === 'executor' && selectedExecutionCard
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
    }];
  }));
  const conflicts = detectConflicts({ workspace, handoff, deskStates, selectedExecutionCard });
  if (deskStates.planner && teamBoard.summary.plan) {
    deskStates.planner.thoughtBubble = `🟡 ${teamBoard.summary.plan} tasks in backlog. ${teamBoard.summary.idleWorkers} workers idle. Rebalancing workload...`;
  }
  if (deskStates['context-manager'] && handoff?.status === 'needs-clarification' && teamBoard.summary.plan) {
    deskStates['context-manager'].thoughtBubble = `🔵 clarifying ${teamBoard.summary.plan} planned task${teamBoard.summary.plan === 1 ? '' : 's'}...`;
  }
  if (deskStates['cto-architect'] && teamBoard.summary.review) {
    deskStates['cto-architect'].thoughtBubble = `🟠 ${teamBoard.summary.review} task${teamBoard.summary.review === 1 ? '' : 's'} require approval.`;
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
  const notebook = normalizeNotebookState(workspace);
  const governedDesk = workspace.studio?.orchestrator?.desks?.[agent.id] || null;
  const actionSignals = Number(report?.metrics?.actionSignals || 0);
  const constraintSignals = Number(report?.metrics?.constraintSignals || 0);
  const matchedTerms = report?.projectContext?.matchedTerms || [];
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
  if (!(report?.tasks || []).length) {
    userActions.push('Add a more concrete task or expected output in the context input.');
  }
  if ((dashboardState?.blockers || []).length) {
    userActions.push(`Resolve blocker: ${dashboardState.blockers[0]}`);
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
      extractedTasks: (report?.tasks || []).length,
      matchedProjectTerms: matchedTerms.length,
      actionSignals,
      constraintSignals,
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
        id: 'problem-to-solve',
        label: 'Problem To Solve',
        kind: 'handoff',
        value: handoff,
        emptyState: 'Planner handoff will appear after the next intent scan.',
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
          { label: 'Tasks', value: `${(report?.tasks || []).length}` },
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

function buildGovernedDeskSnapshot({ agent, workspace, metrics, runs, runSignal, status }) {
  const notebook = normalizeNotebookState(workspace);
  const orchestrator = workspace.studio?.orchestrator || null;
  const governedDesk = orchestrator?.desks?.[agent.id] || null;
  const selfUpgrade = workspace.studio?.selfUpgrade || null;
  const selectedExecutionCard = getSelectedExecutionCard(workspace);
  const history = recentRunSummary(runs).map((entry, index) => ({ id: `${agent.id}-history-${index}`, summary: entry }));
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
      outputs: Math.max(history.length, runSignal ? 1 : 0),
    },
    history,
    userActions: governedDesk?.blockedReason ? [governedDesk.blockedReason] : [],
    handoff: null,
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
        detail: governedDesk?.localState ? `Desk state: ${governedDesk.localState}` : 'Desk has no active governed state yet.',
      },
    {
      id: 'active-work',
      label: 'Active Work Items',
        kind: 'history',
        items: (governedDesk?.workItems || []).map((item) => ({
          id: item.id,
          summary: item.title,
          detail: `${item.kind} | ${item.status}`,
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
        label: 'Execution Selection',
        kind: 'summary',
        value: selectedExecutionCard ? selectedExecutionCard.title : 'No review-ready board card is queued for execution.',
        detail: selectedExecutionCard
          ? `Selected from review queue on page ${selectedExecutionCard.pageId} | task ${selectedExecutionCard.runnerTaskId || 'unbound'} | deploy ${selectedExecutionCard.deployStatus || 'idle'}`
          : 'Review-ready tasks get a Send action on the Team Kanban board.',
      }] : []),
      ...selfUpgradeSections,
    ],
  };
}

function defaultRecentActions(agent, workspace, runs) {
  const summaries = recentRunSummary(runs);
  const intent = latestIntentReport(workspace);
  if (agent.id === 'context-manager') {
    return [
      intent?.summary || `Synced ${(workspace.graph?.edges || []).length} workspace links`,
      intent ? `Intent confidence ${Math.round((intent.confidence || 0) * 100)}% across ${(intent.tasks || []).length} tasks` : (summaries[0] || 'Watching current focus and constraints'),
    ];
  }
  if (agent.id === 'planner') {
    return [
      intent?.tasks?.length ? `Received ${(intent.tasks || []).length} intent tasks from Context Manager` : `Tracking ${(workspace.graph?.nodes || []).filter((node) => node.type === 'task').length} task notes`,
      summaries.find((entry) => entry.includes('manage')) || 'Waiting for a new plan decomposition',
    ];
  }
  if (agent.id === 'executor') {
    return [
      summaries.find((entry) => entry.includes('build') || entry.includes('run')) || 'No build execution in recent history',
      intent?.tasks?.length ? `Execution queue seeded from ${(intent.tasks || []).length} intent tasks` : `Modules/files in workspace: ${(workspace.graph?.nodes || []).filter((node) => ['module', 'file'].includes(node.type)).length}`,
    ];
  }
  if (agent.id === 'memory-archivist') {
    return [
      `Saved ${(workspace.annotations || []).length} annotations and ${(workspace.sketches || []).length} sketch strokes`,
      `Architecture versions: ${(workspace.architectureMemory?.versions || []).length}`,
    ];
  }
  return [
    summaries[0] || 'Reviewing ACE governance boundaries',
    `Rules in force: ${(workspace.architectureMemory?.rules || []).length}`,
  ];
}

function deriveStatus(agent, metrics, workspace, dashboardState, runSignal) {
  const blockers = dashboardState?.blockers || [];
  const intent = latestIntentReport(workspace);
  if (runSignal?.status === 'running') return 'processing';
  if (runSignal?.status === 'error') return 'needs review';
  if (agent.id === 'cto-architect' && blockers.length) return 'needs review';
  if (agent.id === 'planner' && blockers.length) return 'blocked';
  if (agent.id === 'executor' && metrics.queue > 2) return 'processing';
  if (agent.id === 'context-manager' && intent && (intent.confidence || 0) < 0.45) return 'needs review';
  if (agent.id === 'context-manager' && metrics.count > 0) return 'thinking';
  if (agent.id === 'memory-archivist' && ((workspace.annotations || []).length || (workspace.sketches || []).length)) return 'processing';
  if (agent.id === 'cto-architect' && (workspace.architectureMemory?.versions || []).length > 0) return 'thinking';
  return metrics.count ? 'processing' : 'idle';
}

function statusDetail(status) {
  const map = {
    idle: 'Station is quiet and ready for new work.',
    thinking: 'Analyzing context and shaping next moves.',
    processing: 'Actively working through queued tasks.',
    blocked: 'Waiting on blockers or missing inputs.',
    'needs review': 'Holding for system-level review before changes continue.',
  };
  return map[status] || map.idle;
}

export function createInitialComments() {
  return Object.fromEntries(STATIONS.map((agent) => [agent.id, []]));
}

export function getStudioAgents() {
  return STATIONS.map((agent) => ({ ...agent }));
}

export function buildAgentSnapshots({ workspace, dashboardState, runs, agentComments, recentHistory = [] }) {
  return STATIONS.map((agent) => {
    const metrics = collectNodeMetrics(agent, workspace.graph || { nodes: [], edges: [] }, workspace);
    const comments = agentComments?.[agent.id] || [];
    const outputs = recentRunSummary(runs).slice(0, 2);
    const intent = latestIntentReport(workspace);
    const runSignal = latestRunSignal(agent.id, runs);
    const reviewReport = agent.id === 'context-manager' ? intent : null;
    const governedDesk = workspace.studio?.orchestrator?.desks?.[agent.id] || null;
    const governedStatusMap = {
      running: 'processing',
      ready: 'thinking',
      blocked: 'blocked',
      waiting: 'idle',
      complete: 'idle',
    };
    const status = governedDesk?.localState ? (governedStatusMap[governedDesk.localState] || 'idle') : deriveStatus(agent, metrics, workspace, dashboardState, runSignal);
    const recentActions = [
      ...(runSignal ? [`${runSignal.action}: ${runSignal.summary}`] : []),
      ...defaultRecentActions(agent, workspace, runs),
      ...outputs,
    ].slice(0, 4);
    return {
      ...agent,
      status,
      statusDetail: statusDetail(status),
      workload: {
        assignedTasks: metrics.count,
        queueSize: metrics.queue,
        outputs: Math.max(outputs.length, runSignal ? 1 : 0),
      },
      recentActions,
      comments,
      focusSummary: agent.id === 'context-manager' && intent
        ? `${intent.summary || 'Intent captured'} (${Math.round((intent.confidence || 0) * 100)}%)`
        : `${metrics.count} related items in workspace`,
      throughputLabel: agent.id === 'context-manager' && intent
        ? `${(intent.tasks || []).length} intent tasks / ${Math.round((intent.confidence || 0) * 100)}% confidence`
        : `${metrics.count} tracked / ${metrics.queue} queued`,
      activityPulse: Boolean(runSignal?.status === 'running' || status === 'processing' || status === 'thinking'),
      unresolved: Boolean(runSignal?.status === 'error' || status === 'blocked' || status === 'needs review'),
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
        : buildGovernedDeskSnapshot({ agent, workspace, metrics, runs, runSignal, status }),
    };
  });
}

