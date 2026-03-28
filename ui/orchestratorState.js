const { normalizeAgentWorkersState } = require('./agentWorkers');
const RSG_ACTIVITY_LIMIT = 24;
const MUTATION_ACTIVITY_LIMIT = 32;
const MUTATION_APPROVAL_LIMIT = 16;

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function latestIntentReport(workspace) {
  return workspace?.intentState?.contextReport || workspace?.intentState?.latest || workspace?.intentState?.reports?.[0] || null;
}

function buildEmptyGraph() {
  return { nodes: [], edges: [] };
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
    visualForm: inferRelationshipVisualForm(strength, strandCount),
    lastActive: edge.lastActive || null,
    risk: edge.risk || null,
  };
}

function normalizeGraphBundle(workspace = {}) {
  const graphs = workspace?.graphs || {};
  const legacyGraph = workspace?.graph || buildEmptyGraph();
  return {
    system: {
      nodes: graphs.system?.nodes || legacyGraph.nodes || [],
      edges: (graphs.system?.edges || legacyGraph.edges || []).map((edge) => normalizeRelationshipEdge(edge)).filter(Boolean),
    },
    world: {
      nodes: graphs.world?.nodes || [],
      edges: (graphs.world?.edges || []).map((edge) => normalizeRelationshipEdge(edge)).filter(Boolean),
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
    activity: [],
    lastSourceNodeId: null,
    lastGenerationAt: null,
    lastStatus: 'idle',
    lastEvaluatedAt: null,
  };
}

function createDefaultMutationGateState() {
  return {
    activity: [],
    approvalQueue: [],
  };
}

function normalizeMutationGateEntries(entries = [], limit = MUTATION_ACTIVITY_LIMIT) {
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      id: entry.id || null,
      at: entry.at || null,
      classification: entry.classification || 'blocked',
      status: entry.status || 'blocked',
      riskLevel: entry.riskLevel || 'medium',
      summary: entry.summary || '',
      reason: entry.reason || '',
      layer: entry.layer || null,
      mutationType: entry.mutationType || entry.type || null,
      mutation: entry.mutation || null,
    }))
    .filter((entry) => entry.id && entry.summary)
    .slice(0, limit);
}

function normalizeMutationGateState(state = {}) {
  const base = createDefaultMutationGateState();
  return {
    ...base,
    ...(state || {}),
    activity: normalizeMutationGateEntries((state || {}).activity, MUTATION_ACTIVITY_LIMIT),
    approvalQueue: normalizeMutationGateEntries((state || {}).approvalQueue, MUTATION_APPROVAL_LIMIT),
  };
}

function normalizeRsgActivityEntries(activity = []) {
  return (Array.isArray(activity) ? activity : [])
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      id: entry.id || null,
      type: entry.type || 'rsg-skip',
      at: entry.at || null,
      sourceNodeId: entry.sourceNodeId || null,
      sourceNodeLabel: entry.sourceNodeLabel || '',
      summary: entry.summary || '',
      confidence: Number.isFinite(Number(entry.confidence)) ? Number(entry.confidence) : null,
      generatedCount: Number(entry.generatedCount || 0),
      replacedCount: Number(entry.replacedCount || 0),
      usedFallback: Boolean(entry.usedFallback),
      reason: entry.reason || '',
      trigger: entry.trigger || 'manual',
      generationId: entry.generationId || null,
    }))
    .slice(0, RSG_ACTIVITY_LIMIT);
}

function inferProposalTarget(node = {}, layer = 'system') {
  if (node?.metadata?.proposalTarget) return node.metadata.proposalTarget;
  if (node?.type === 'adapter') return 'adapter-translation';
  if (layer === 'world') return 'world-structure';
  return 'system-structure';
}

function buildRsgState(workspace = {}) {
  const graphs = normalizeGraphBundle(workspace);
  const persisted = workspace?.rsg || {};
  const base = {
    ...createDefaultRsgState(),
    ...persisted,
    approvalPolicy: {
      'system-structure': 'auto-record',
      'world-structure': 'auto-record',
      'adapter-translation': 'auto-record',
      'code-runtime-mutation': 'risk-gated-review',
      ...(persisted.approvalPolicy || {}),
    },
    activity: normalizeRsgActivityEntries(persisted.activity),
    lastSourceNodeId: persisted.lastSourceNodeId || null,
    lastGenerationAt: persisted.lastGenerationAt || null,
    lastStatus: persisted.lastStatus || 'idle',
  };
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
    .filter((card) => card?.executionPackage?.status === 'ready' || card?.status === 'review' || card?.verifyStatus === 'queued' || card?.verifyStatus === 'running' || card?.applyStatus === 'queued' || card?.deployStatus === 'queued')
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
      assigned: 0,
      handedOff: 0,
      binned: 0,
      idleWorkers: 0,
    },
  };
}

const TASK_PHASES = new Set(['captured', 'planned', 'active', 'handed_off']);
const TASK_ASSIGNMENT_STATES = new Set(['unassigned', 'assigned', 'claimed']);

function normalizeTaskFlow(taskFlow = {}, fallback = {}) {
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
    lastTransitionAt: taskFlow.lastTransitionAt || fallback.lastTransitionAt || null,
    lastTransitionLabel: taskFlow.lastTransitionLabel || fallback.lastTransitionLabel || null,
    history: Array.isArray(taskFlow.history) ? taskFlow.history.filter(Boolean) : [],
  };
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
    label: label || 'Planned',
    note: note || '',
    at: at || null,
  };
}

function transitionTaskFlow(taskFlow = {}, next = {}, fallback = {}) {
  const current = normalizeTaskFlow(taskFlow, fallback);
  const nextPhase = TASK_PHASES.has(next.phase) ? next.phase : current.phase;
  const nextAssignmentState = TASK_ASSIGNMENT_STATES.has(next.assignmentState) ? next.assignmentState : current.assignmentState;
  const nextOwnerDeskId = next.ownerDeskId !== undefined ? (next.ownerDeskId || null) : current.ownerDeskId;
  const nextAssigneeDeskId = next.assigneeDeskId !== undefined ? (next.assigneeDeskId || null) : current.assigneeDeskId;
  const nextAt = next.at || current.lastTransitionAt || null;
  const nextLabel = next.label || (nextPhase === 'captured' ? 'Captured from intent' : nextPhase === 'active' ? 'Placed into active' : nextPhase === 'handed_off' ? 'Handed off to executor' : 'Moved to planner board');
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
    verificationPlan: {
      required: false,
      commands: [],
      qaScenarios: [],
      signature: null,
      summary: 'No verification required.',
      generatedAt: null,
    },
  };
}

function normalizeExecutorBlocker(blocker = null) {
  if (!blocker || typeof blocker !== 'object') return null;
  const code = String(blocker.code || '').trim();
  const message = String(blocker.message || '').trim();
  if (!code && !message) return null;
  return {
    code: code || 'executor-blocked',
    message: message || 'Execution is blocked.',
    updatedAt: blocker.updatedAt || null,
  };
}

function getCardTaskId(card = {}) {
  return String(card.builderTaskId || card.runnerTaskId || card.executionPackage?.taskId || '').trim();
}

function deriveExecutorBlocker(card = {}, workspace = {}) {
  const explicit = normalizeExecutorBlocker(card.executorBlocker);
  if (explicit) return explicit;
  if (card.verifyRequired) {
    if (['failed', 'blocked'].includes(card.verifyStatus)) {
      return {
        code: 'verification-failed',
        message: card.lastVerificationSummary || 'Verification failed and must be rerun.',
        updatedAt: null,
      };
    }
    if (card.verifyStatus === 'passed') {
      const planSignature = card.executionPackage?.verificationPlan?.signature || null;
      if (planSignature && card.verifiedSignature && card.verifiedSignature !== planSignature) {
        return {
          code: 'verification-stale',
          message: 'Verification is stale for the current package and must be rerun.',
          updatedAt: null,
        };
      }
    }
  }
  if (!(card.sourceAnchorRefs || []).length) {
    return {
      code: 'missing-anchor',
      message: `${card.title || 'Card'} lacks anchor provenance and cannot advance.`,
      updatedAt: null,
    };
  }
  if (card.applyStatus === 'failed') {
    return {
      code: 'apply-failed',
      message: card.riskReasons?.[0] || 'Apply failed and needs review.',
      updatedAt: null,
    };
  }
  if (['flagged', 'failed'].includes(card.deployStatus)) {
    return {
      code: 'deploy-flagged',
      message: card.riskReasons?.[0] || 'Deploy was flagged and needs review.',
      updatedAt: null,
    };
  }
  const taskId = getCardTaskId(card);
  const selfUpgrade = workspace?.studio?.selfUpgrade || null;
  if (card.targetProjectKey === 'ace-self' && taskId && ['review', 'complete'].includes(card.status) && card.applyStatus !== 'applied') {
    if (!selfUpgrade?.preflight?.ok) {
      return {
        code: 'preflight-failed',
        message: selfUpgrade?.preflight?.summary || 'Self-upgrade preflight must pass before apply can run.',
        updatedAt: null,
      };
    }
    if (selfUpgrade.preflight?.taskId && selfUpgrade.preflight.taskId !== taskId) {
      return {
        code: 'preflight-stale',
        message: 'Self-upgrade preflight is stale for this task and must be rerun.',
        updatedAt: null,
      };
    }
  }
  if (card.status === 'review' && card.approvalState !== 'approved') {
    return {
      code: 'approval-required',
      message: card.riskReasons?.[0] || `Waiting for approval on ${card.title || 'this card'}.`,
      updatedAt: null,
    };
  }
  return null;
}

function deriveCardDesk(card = {}) {
  if (card.status === 'binned') return 'Bin';
  if (card.status === 'plan') return 'Planner';
  if (card.status === 'active') return 'Builder';
  if (card.status === 'review') return 'CTO';
  if (['queued', 'running', 'failed', 'blocked'].includes(card.verifyStatus)) return 'Executor';
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
    if (normalizeExecutorBlocker(card.executorBlocker)?.code && normalizeExecutorBlocker(card.executorBlocker)?.code !== 'approval-required') return 'Flagged';
    return 'Approval required';
  }
  if (card.status === 'complete') {
    if (card.verifyStatus === 'running') return 'Verifying';
    if (['failed', 'blocked'].includes(card.verifyStatus)) return 'Verification blocked';
    if (card.verifyStatus === 'queued') return 'Queued for verify';
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
    executorBlocker: null,
    verifyRequired: false,
    verifyStatus: 'idle',
    verifyRunIds: [],
    verifyArtifacts: [],
    lastVerificationSummary: '',
    verifiedSignature: null,
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
  const plannerWorker = normalizeAgentWorkersState(workspace?.studio?.agentWorkers).planner;
  const existingCards = Array.isArray(board.cards) ? board.cards.filter(Boolean).map((card) => ({
    ...card,
    status: normalizeBoardStatus(card.status),
    sourceKey: card.sourceKey || cardSourceKey(card.pageId || notebook.activePageId, card.title || 'task'),
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
      verificationPlan: {
        ...defaultExecutionPackage(card).verificationPlan,
        ...(card.executionPackage?.verificationPlan || {}),
        commands: Array.isArray(card.executionPackage?.verificationPlan?.commands) ? card.executionPackage.verificationPlan.commands.filter(Boolean) : [],
        qaScenarios: Array.isArray(card.executionPackage?.verificationPlan?.qaScenarios) ? card.executionPackage.verificationPlan.qaScenarios.filter(Boolean) : [],
      },
    },
    executorBlocker: normalizeExecutorBlocker(card.executorBlocker),
    verifyRequired: Boolean(card.verifyRequired || card.executionPackage?.verificationPlan?.required),
    verifyStatus: card.verifyStatus || 'idle',
    verifyRunIds: Array.isArray(card.verifyRunIds) ? card.verifyRunIds.filter(Boolean) : [],
    verifyArtifacts: Array.isArray(card.verifyArtifacts) ? card.verifyArtifacts.filter(Boolean) : [],
    lastVerificationSummary: String(card.lastVerificationSummary || '').trim(),
    verifiedSignature: card.verifiedSignature || null,
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
    taskFlow: normalizeTaskFlow(card.taskFlow, {
      phase: card.status === 'active' ? 'active' : (card.status === 'complete' || card.status === 'review' ? 'handed_off' : 'planned'),
      assignmentState: card.status === 'active' ? 'assigned' : (card.status === 'complete' || card.status === 'review' ? 'claimed' : 'unassigned'),
      ownerDeskId: card.status === 'active' || card.status === 'complete' || card.status === 'review' ? 'executor' : 'planner',
      assigneeDeskId: 'executor',
      sourceIntentId: card.sourceIntentId || card.sourceNodeId || null,
      sourceHandoffId: card.sourceHandoffId || null,
      lastTransitionAt: card.updatedAt || card.createdAt || null,
    }),
  })) : [];
  const handoff = workspace?.studio?.handoffs?.contextToPlanner || null;
  const selectedCard = existingCards.find((card) => card.id === board.selectedCardId) || null;
  return {
    cards: existingCards,
    selectedCardId: selectedCard?.id || null,
    updatedAt: new Date().toISOString(),
    summary: {
      plan: existingCards.filter((card) => card.status === 'plan').length,
      active: existingCards.filter((card) => card.status === 'active').length,
      complete: existingCards.filter((card) => card.status === 'complete').length,
      review: existingCards.filter((card) => card.status === 'review').length,
      assigned: existingCards.filter((card) => card.taskFlow?.assignmentState === 'assigned').length,
      handedOff: existingCards.filter((card) => card.taskFlow?.phase === 'handed_off').length,
      binned: existingCards.filter((card) => card.status === 'binned').length,
      idleWorkers: Number(board.summary?.idleWorkers || 0),
    },
  };
}

function getActiveMutationCard(boardOrWorkspace = {}) {
  const board = Array.isArray(boardOrWorkspace?.cards)
    ? boardOrWorkspace
    : normalizeTeamBoardState(boardOrWorkspace);
  return board.cards.find((card) => (
    ['queued', 'running', 'failed', 'blocked'].includes(card.verifyStatus)
    || ['queued', 'applying', 'applied'].includes(card.applyStatus)
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
  const board = normalizeTeamBoardState(workspace);
  const workers = normalizeAgentWorkersState(workspace?.studio?.agentWorkers);
  const contextWorker = workers['context-manager'];
  const plannerWorker = workers.planner;
  const plannerToContext = workspace?.studio?.handoffs?.plannerToContext || null;
  const activeMutationCard = getActiveMutationCard(board);
  const pendingReviewCard = board.cards.find((card) => card.status === 'review' && card.approvalState !== 'approved') || null;
  if (deskId === 'context-manager') {
    if (contextWorker.status === 'running') {
      return [{
        id: `${contextWorker.currentRunId || notebook.activePageId}-context-run`,
        pageId: notebook.activePageId,
        deskId,
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
        id: `${plannerToContext.id}-context-retry`,
        pageId: notebook.activePageId,
        deskId,
        kind: 'context-retry',
        status: 'ready',
        dependsOn: [handoff.id],
        conflictTags: ['context', 'context-retry'],
        artifactRefs: [],
        anchorRefs: plannerToContext.anchorRefs || handoff?.anchorRefs || [],
        title: plannerToContext.summary || 'Planner requested a tighter context packet.',
      }];
    }
    if (handoff?.status === 'needs-clarification') {
      return [{
        id: `${handoff.id}-context-clarification`,
        pageId: notebook.activePageId,
        deskId,
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
      id: `${notebook.activePageId}-${handoff ? 'context-published' : 'context-watch'}`,
      pageId: notebook.activePageId,
      deskId,
      kind: handoff ? 'context-published' : 'context-watch',
      status: 'waiting',
      dependsOn: [],
      conflictTags: ['context'],
      artifactRefs: handoff ? [handoff.id] : [],
      anchorRefs: handoff?.anchorRefs || [],
      title: handoff?.summary || latestIntent?.summary || 'Waiting for source context',
    }];
  }
  if (deskId === 'planner') {
    if (!handoff) {
      return [{
        id: `${notebook.activePageId}-planner-awaiting-handoff`,
        pageId: notebook.activePageId,
        deskId,
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
    if (plannerWorker.status === 'running' && handoff) {
      return [{
        id: `${handoff.id}-planner-run`,
        pageId: notebook.activePageId,
        deskId,
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
        id: `${plannerToContext.id}-planner-feedback`,
        pageId: notebook.activePageId,
        deskId,
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
        id: `${handoff.id}-planner-awaiting-clarification`,
        pageId: notebook.activePageId,
        deskId,
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
        id: `${card.id}-planner-card`,
        pageId: card.pageId || notebook.activePageId,
        deskId,
        kind: 'planned-card',
        status: card.status === 'plan' ? 'ready' : 'running',
        dependsOn: card.sourceHandoffId ? [card.sourceHandoffId] : [],
        conflictTags: ['plan', card.id],
        artifactRefs: card.artifactRefs || [],
        anchorRefs: card.sourceAnchorRefs || [],
        title: card.title,
      }));
    }
    return [{
      id: `${handoff.id}-planner-ready-handoff`,
      pageId: notebook.activePageId,
      deskId,
      kind: 'planner-ready-handoff',
      status: 'ready',
      dependsOn: [handoff.id],
      conflictTags: ['plan', 'handoff-ready'],
      artifactRefs: [handoff.id],
      anchorRefs: handoff.anchorRefs || [],
      title: handoff.summary || 'Planner handoff is ready for decomposition.',
    }];
  }
  if (deskId === 'executor') {
    const activeMutationBlocker = activeMutationCard ? deriveExecutorBlocker(activeMutationCard, workspace) : null;
    const pendingReviewBlocker = pendingReviewCard ? deriveExecutorBlocker(pendingReviewCard, workspace) : null;
    if (activeMutationCard) {
      const isVerificationStage = activeMutationCard.verifyRequired
        && ['queued', 'running', 'failed', 'blocked'].includes(activeMutationCard.verifyStatus)
        && !['applying', 'applied'].includes(activeMutationCard.applyStatus)
        && !['deploying', 'deployed'].includes(activeMutationCard.deployStatus);
      return [{
        id: `${activeMutationCard.id}-execution`,
        pageId: activeMutationCard.pageId || notebook.activePageId,
        deskId,
        kind: isVerificationStage ? 'verify' : (activeMutationCard.deployStatus === 'deploying' ? 'deploy' : 'apply'),
        status: isVerificationStage
          ? (activeMutationCard.verifyStatus === 'running' ? 'running' : (['failed', 'blocked'].includes(activeMutationCard.verifyStatus) ? 'blocked' : 'ready'))
          : ((['applying', 'deploying'].includes(activeMutationCard.applyStatus) || activeMutationCard.deployStatus === 'deploying') ? 'running' : 'ready'),
        dependsOn: activeMutationCard.sourceHandoffId ? [activeMutationCard.sourceHandoffId] : [],
        conflictTags: ['execute', activeMutationCard.id],
        artifactRefs: [...(activeMutationCard.artifactRefs || []), ...(activeMutationCard.verifyArtifacts || [])],
        anchorRefs: activeMutationCard.sourceAnchorRefs || [],
        blockerMessage: activeMutationBlocker?.message || null,
        title: isVerificationStage
          ? `Verify package: ${activeMutationCard.title}`
          : (activeMutationCard.deployStatus === 'deploying'
            ? `Deploy approved card: ${activeMutationCard.title}`
            : `Apply approved card: ${activeMutationCard.title}`),
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
        anchorRefs: pendingReviewCard.sourceAnchorRefs || [],
        blockerMessage: pendingReviewBlocker?.message || null,
        title: `Awaiting approval: ${pendingReviewCard.title}`,
      }];
    }
    const intentTasks = Array.isArray(latestIntent?.tasks) ? latestIntent.tasks.filter(Boolean) : [];
    return intentTasks.slice(0, 2).map((task, index) => ({
      id: `${notebook.activePageId}-executor-${index}`,
      pageId: notebook.activePageId,
      deskId,
      kind: 'build-ready',
      status: 'waiting',
      dependsOn: handoff ? [handoff.id] : [],
      conflictTags: ['execute', `task-${index}`],
      artifactRefs: [],
      anchorRefs: handoff?.anchorRefs || [],
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
      anchorRefs: handoff?.anchorRefs || [],
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
    anchorRefs: handoff?.anchorRefs || [],
    title: 'Review desk overlap, approval state, and guardrails',
  }];
}

function latestDeskRun(deskId, runs = []) {
  return (runs || []).find((run) => {
    const action = String(run?.action || '').toLowerCase();
    if (deskId === 'context-manager') return ['scan', 'manage'].includes(action);
    if (deskId === 'planner') return action === 'manage';
    if (deskId === 'executor') return ['build', 'run', 'apply', 'verify'].includes(action);
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
      ? (workItems[0]?.blockerMessage || 'Execution cannot advance until review gates or context blockers clear.')
      : (localState === 'ready' ? 'A reviewed package is waiting for executor work.' : 'Executor is idle.');
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
  let openActiveSlots = Math.max(0, 2 - board.cards.filter((card) => normalizeBoardStatus(card.status) === 'active').length);
  const cards = [...board.cards]
    .sort((left, right) => String(left.createdAt || '').localeCompare(String(right.createdAt || '')))
    .map((card) => {
      let status = normalizeBoardStatus(card.status);
      let taskFlow = normalizeTaskFlow(card.taskFlow, {
        phase: status === 'active' ? 'active' : (status === 'complete' || status === 'review' ? 'handed_off' : 'planned'),
        assignmentState: status === 'active' ? 'assigned' : (status === 'complete' || status === 'review' ? 'claimed' : 'unassigned'),
        ownerDeskId: status === 'active' || status === 'complete' || status === 'review' ? 'executor' : 'planner',
        assigneeDeskId: 'executor',
        sourceIntentId: card.sourceIntentId || card.sourceNodeId || null,
        sourceHandoffId: card.sourceHandoffId || null,
        lastTransitionAt: card.updatedAt || card.createdAt || null,
      });
      if (status === 'plan' && handoff) {
        if ((card.sourceAnchorRefs || []).length === 0) {
          status = 'plan';
        } else if (openActiveSlots > 0) {
          status = 'active';
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
        }
      }
      const nextCard = {
        ...card,
        status,
        phaseTicks: status === 'plan' ? Number(card.phaseTicks || 0) : 0,
        taskFlow: status === 'active'
          ? transitionTaskFlow(taskFlow, {
              phase: 'active',
              assignmentState: 'assigned',
              ownerDeskId: 'planner',
              assigneeDeskId: 'executor',
              label: 'Active on planner slab',
              at: now,
              note: card.title,
            })
          : taskFlow,
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
      assigned: cards.filter((card) => card.taskFlow?.assignmentState === 'assigned').length,
      handedOff: cards.filter((card) => card.taskFlow?.phase === 'handed_off').length,
      binned: cards.filter((card) => card.status === 'binned').length,
      idleWorkers: countIdleWorkers(deskStates),
    },
  };
}

function buildDeskStates({ workspace, notebook, handoff, selectedExecutionCard = null }) {
  const latestIntent = latestIntentReport(workspace);
  const board = normalizeTeamBoardState(workspace);
  const workers = normalizeAgentWorkersState(workspace?.studio?.agentWorkers);
  const contextWorker = workers['context-manager'];
  const plannerWorker = workers.planner;
  const plannerToContext = workspace?.studio?.handoffs?.plannerToContext || null;
  const activeMutationCard = getActiveMutationCard(board);
  const pendingReviewCard = board.cards.find((card) => card.status === 'review' && card.approvalState !== 'approved') || null;
  return Object.fromEntries(DESK_ORDER.map((deskId) => {
    const workItems = buildDeskWorkItems(deskId, workspace, notebook, handoff, selectedExecutionCard);
    const plannerFeedbackActive = isPlannerFeedbackActive(plannerToContext, handoff);
    const selectedCardBlocker = selectedExecutionCard ? deriveExecutorBlocker(selectedExecutionCard, workspace) : null;
    const pendingReviewBlocker = pendingReviewCard ? deriveExecutorBlocker(pendingReviewCard, workspace) : null;
    const blockedReason = deskId === 'planner'
      ? (
          ['blocked', 'degraded'].includes(plannerWorker.status)
            ? (plannerToContext?.detail || plannerWorker.statusReason || plannerWorker.lastBlockedReason || 'Planner worker is blocked.')
            : (plannerFeedbackActive
              ? (plannerToContext?.detail || 'Planner is waiting for a tighter context retry.')
              : (handoff?.status === 'needs-clarification'
                ? 'Planner is waiting for Context Manager to clarify the current handoff.'
                : null))
        )
      : deskId === 'executor'
        ? (
            selectedCardBlocker?.message
              ? selectedCardBlocker.message
              : (pendingReviewBlocker?.message
                ? pendingReviewBlocker.message
                : (pendingReviewCard
                  ? `Waiting for approval on ${pendingReviewCard.title}.`
                  : (handoff?.status === 'needs-clarification' && !activeMutationCard
                    ? 'Execution is gated until Context Manager clarifies the active page intent.'
                    : null)))
          )
        : deskId === 'context-manager'
          ? (
              contextWorker.status === 'degraded'
                ? (contextWorker.statusReason || contextWorker.lastBlockedReason || 'Context Manager is degraded.')
                : null
            )
        : null;
    const localState = deriveDeskLocalState(workItems, blockedReason);
    const statusLabel = buildDeskStatusLabel({
      deskId,
      localState,
      handoff,
      plannerToContext,
      contextWorker,
      plannerWorker,
      workItems,
    });
    const statusDetail = buildDeskStatusDetail({
      deskId,
      localState,
      handoff,
      plannerToContext,
      contextWorker,
      plannerWorker,
      workItems,
    });
    return [deskId, {
      mission: DESK_MISSIONS[deskId],
      localState,
      statusLabel,
      statusDetail,
      currentGoal: workItems[0]?.title || DESK_MISSIONS[deskId],
      allowedActions: DESK_ALLOWED_ACTIONS[deskId] || [],
      workItems,
      lastOutput: deskId === 'context-manager'
        ? (
            plannerToContext?.sourceHandoffId && plannerToContext.sourceHandoffId === handoff?.id
              ? plannerToContext.detail || plannerToContext.summary || handoff?.summary || latestIntent?.summary || null
              : handoff?.summary || latestIntent?.summary || null
          )
        : deskId === 'planner' && plannerToContext?.sourceHandoffId && plannerToContext.sourceHandoffId === handoff?.id
          ? plannerToContext.summary || plannerToContext.detail || null
          : deskId === 'planner' && plannerWorker.lastProducedCardIds?.length
            ? `Produced ${plannerWorker.lastProducedCardIds.length} planned card${plannerWorker.lastProducedCardIds.length === 1 ? '' : 's'}.`
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
  const workers = normalizeAgentWorkersState(workspace?.studio?.agentWorkers);
  const contextWorker = workers['context-manager'];
  const plannerWorker = workers.planner;
  const plannerToContext = workspace?.studio?.handoffs?.plannerToContext || null;
  const boardState = normalizeTeamBoardState(teamBoard || workspace);
  const selectedExecutionCard = getActiveMutationCard(boardState);
  const pendingReviewCard = boardState.cards.find((card) => card.status === 'review' && card.approvalState !== 'approved') || null;
  const selectedCardBlocker = selectedExecutionCard ? deriveExecutorBlocker(selectedExecutionCard, workspace) : null;
  const pendingReviewBlocker = pendingReviewCard ? deriveExecutorBlocker(pendingReviewCard, workspace) : null;
  const deskRun = latestDeskRun(deskId, runs);
  const localState = deskStates?.[deskId]?.localState || 'waiting';
  const boardSummary = boardState.summary || { plan: 0, active: 0, complete: 0, review: 0, idleWorkers: 0 };
  if (deskId === 'cto-architect') {
    if (selfUpgrade?.deploy?.status === 'restarting') return 'Governance status: running. Restarting ACE.';
    const governanceBlocker = deskStates?.executor?.blockedReason || selectedCardBlocker?.message || pendingReviewBlocker?.message || null;
    if (governanceBlocker || pendingReviewCard?.deployStatus === 'flagged' || pendingReviewCard?.applyStatus === 'failed' || selfUpgrade?.preflight?.status === 'failed') {
      return `Governance status: blocked. Reviewing blocker: ${governanceBlocker || 'executor blockers.'}`;
    }
    if (boardSummary.review) return `Governance status: queued. ${boardSummary.review} task${boardSummary.review === 1 ? '' : 's'} ready to apply.`;
    if (conflicts.length) return 'Governance status: queued. Reviewing governance signals.';
    if (handoff?.status === 'needs-clarification') return 'Governance status: blocked. Throttling execution until context is clearer.';
    return deskRun?.status === 'running' || localState === 'running'
      ? 'Governance status: running. Coordinating desks.'
      : 'Governance status: idle. Monitoring guardrails.';
  }
  if (deskId === 'context-manager') {
    if (contextWorker.status === 'running') return 'Context status: running. Drafting a tighter planner packet.';
    if (isPlannerFeedbackActive(plannerToContext, handoff)) {
      return plannerToContext.action === 'bin-candidate'
        ? 'Context status: queued. Reviewing whether the handoff should be binned.'
        : 'Context status: queued. Planner requested a tighter retry.';
    }
    if (handoff?.status === 'needs-clarification') return 'Context status: queued. Clarification is needed before planner can continue.';
    if (contextWorker.lastUsedFallback) return 'Context status: idle. Deterministic fallback kept intake alive.';
    if (deskRun?.status === 'running' && deskRun.action === 'scan') return 'Context status: running. Ingesting docs.';
    if (deskRun?.status === 'running' && deskRun.action === 'manage') return 'Context status: running. Extracting intent.';
    return latestIntent?.summary ? 'Context status: idle. Published packet is available to Planner.' : 'Context status: idle. Waiting for source context.';
  }
  if (deskId === 'planner') {
    if (plannerWorker.status === 'running') return 'Planner status: running. Sequencing anchored cards.';
    if (isPlannerFeedbackActive(plannerToContext, handoff)) {
      return plannerToContext.action === 'bin-candidate'
        ? 'Planner status: blocked. Recommending this handoff be binned.'
        : 'Planner status: blocked. Waiting for a tighter context retry.';
    }
    if (handoff?.status === 'needs-clarification') return 'Planner status: blocked. Waiting for a clarified handoff.';
    if (deskRun?.status === 'running' && deskRun.action === 'manage') return 'Planner status: running. Generating tasks.';
    if (boardSummary.plan) return `Planner status: queued. ${boardSummary.plan} plan card${boardSummary.plan === 1 ? '' : 's'} are ready.`;
    if (localState === 'ready') return 'Planner status: queued. Ready to decompose the latest handoff.';
    return 'Planner status: idle. Waiting for context handoff.';
  }
  if (deskId === 'executor') {
    if (selectedCardBlocker?.message && !['applying', 'deploying'].includes(selectedExecutionCard?.applyStatus) && selectedExecutionCard?.deployStatus !== 'deploying') {
      return `Executor status: blocked. ${selectedCardBlocker.message}`;
    }
    if (selectedExecutionCard?.verifyStatus === 'running') return 'Executor status: running. Verifying package.';
    if (selectedExecutionCard?.verifyStatus === 'queued') return `Executor status: queued. ${selectedExecutionCard.title.slice(0, 28)} is queued for verification.`;
    if (['failed', 'blocked'].includes(selectedExecutionCard?.verifyStatus)) return `Executor status: blocked. ${selectedExecutionCard.lastVerificationSummary || 'Verification failed.'}`;
    if (selectedExecutionCard?.deployStatus === 'deploying') return 'Executor status: running. Deploying ACE.';
    if (selectedExecutionCard?.deployStatus === 'deployed') return 'Executor status: idle. Deploy complete.';
    if (selectedExecutionCard?.deployStatus === 'flagged') return 'Executor status: blocked. Deploy flagged for review.';
    if (selectedExecutionCard?.applyStatus === 'applying' || (deskRun?.status === 'running' && deskRun.action === 'apply')) return 'Executor status: running. Applying patch.';
    if (selectedExecutionCard?.applyStatus === 'queued') return `Executor status: queued. ${selectedExecutionCard.title.slice(0, 28)} is queued for apply.`;
    if (selectedExecutionCard?.applyStatus === 'applied' && selectedExecutionCard.targetProjectKey !== 'ace-self') return 'Executor status: idle. Patch applied.';
    if (deskRun?.status === 'running' && deskRun.action === 'run') return 'Executor status: running. Verifying output.';
    if (pendingReviewCard) return 'Executor status: blocked. Waiting for risky apply approval.';
    if (handoff?.status === 'needs-clarification' || localState === 'blocked') return 'Executor status: blocked. Waiting for clearer context.';
    if (localState === 'ready' || localState === 'running') return 'Executor status: queued. Preparing output.';
    return 'Executor status: idle. Waiting for approved work.';
  }
  return localState === 'running'
    ? 'Archivist status: running. Logging summaries.'
    : 'Archivist status: idle. Waiting to archive changes.';
}

function detectConflicts(workspace, handoff, deskStates, selectedExecutionCard = null) {
  const conflicts = [];
  const latestIntent = latestIntentReport(workspace);
  const plannerWorker = normalizeAgentWorkersState(workspace?.studio?.agentWorkers).planner;
  const plannerToContext = workspace?.studio?.handoffs?.plannerToContext || null;
  const board = normalizeTeamBoardState(workspace);
  const pendingReviewCard = board.cards.find((card) => card.status === 'review' && card.approvalState !== 'approved') || null;
  const pendingReviewBlocker = pendingReviewCard ? deriveExecutorBlocker(pendingReviewCard, workspace) : null;
  const selectedCardBlocker = selectedExecutionCard ? deriveExecutorBlocker(selectedExecutionCard, workspace) : null;
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
      summary: `${pendingReviewCard.title} is waiting at the apply gate because ${pendingReviewBlocker?.message || pendingReviewCard.riskReasons?.[0] || 'risk heuristics require approval'}.`,
    });
  }
  if (selectedExecutionCard && ['failed', 'blocked'].includes(selectedExecutionCard.verifyStatus)) {
    conflicts.push({
      id: `verification-failed-${selectedExecutionCard.id}`,
      kind: 'verification-failed',
      severity: 'high',
      desks: ['executor', 'cto-architect'],
      summary: `${selectedExecutionCard.title} failed verification: ${selectedCardBlocker?.message || selectedExecutionCard.lastVerificationSummary || 'verification must be rerun'}.`,
    });
  }
  if (selectedExecutionCard?.deployStatus === 'flagged' || selectedExecutionCard?.applyStatus === 'failed') {
    conflicts.push({
      id: `mutation-flagged-${selectedExecutionCard.id}`,
      kind: 'mutation-flagged',
      severity: 'high',
      desks: ['executor', 'cto-architect'],
      summary: `${selectedExecutionCard.title} was flagged during ${selectedExecutionCard.deployStatus === 'flagged' ? 'deploy' : 'apply'} and needs intervention: ${selectedCardBlocker?.message || 'review required'}.`,
    });
  }
  if (selectedExecutionCard && !(selectedExecutionCard.sourceAnchorRefs || []).length) {
    conflicts.push({
      id: `unanchored-execution-${selectedExecutionCard.id}`,
      kind: 'unanchored-execution',
      severity: 'high',
      desks: ['executor', 'cto-architect'],
      summary: `${selectedExecutionCard.title} lacks anchor provenance and should not advance until it is re-anchored.`,
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
  if ((plannerToContext?.sourceHandoffId && plannerToContext.sourceHandoffId === handoff?.id) || ['blocked', 'degraded'].includes(plannerWorker.status)) {
    conflicts.push({
      id: `planner-feedback-${handoff?.id || 'unknown'}`,
      kind: 'planner-feedback',
      severity: 'high',
      desks: ['planner', 'context-manager'],
      summary: plannerToContext?.detail || plannerWorker.lastBlockedReason || 'Planner worker is blocked on the current handoff.',
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
  const seededBoard = !baseBoard.cards.length && handoff
    ? {
        ...baseBoard,
        cards: [createTeamBoardCard({
          cards: baseBoard.cards,
          pageId: notebook.activePageId || normalizedWorkspace.activePageId || 'page-1',
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
    board: seededBoard,
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
    agentWorkers: normalizeAgentWorkersState(normalizedWorkspace?.studio?.agentWorkers),
    selfUpgrade: normalizedWorkspace?.studio?.selfUpgrade || null,
    teamBoard: normalizeTeamBoardState(normalizedWorkspace),
    mutationGate: normalizeMutationGateState(normalizedWorkspace?.mutationGate),
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
    rsg: buildRsgState(normalizedWorkspace),
  };
}

module.exports = {
  createDefaultPage,
  createTeamBoardCard,
  createDefaultTeamBoard,
  normalizeGraphBundle,
  createDefaultRsgState,
  createDefaultMutationGateState,
  buildRsgState,
  normalizeMutationGateState,
  getSelectedExecutionCard,
  normalizeNotebookState,
  normalizeTeamBoardState,
  advanceOrchestratorWorkspace,
  buildRuntimePayload,
  deriveExecutorBlocker,
};
