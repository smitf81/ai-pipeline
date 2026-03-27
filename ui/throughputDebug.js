const fs = require('fs');
const path = require('path');

const THROUGHPUT_RELATIVE_DIR = path.join('data', 'spatial', 'throughput');

function nowIso() {
  return new Date().toISOString();
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || 'task';
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function uniqueStrings(values = []) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function createExecutionProvenance({
  classification = 'unknown',
  orchestration = 'unknown',
  execution = 'unknown',
  engine = null,
  stageIds = [],
  legacyActions = [],
  nativeActions = [],
  evidence = [],
  notes = [],
} = {}) {
  return {
    classification,
    orchestration,
    execution,
    engine: engine || null,
    stageIds: uniqueStrings(stageIds),
    legacyActions: uniqueStrings(legacyActions),
    nativeActions: uniqueStrings(nativeActions),
    evidence: uniqueStrings(evidence),
    notes: uniqueStrings(notes),
  };
}

function classifyExecutionProvenance({
  usesLegacyFallback = false,
  usesStudioNative = false,
  evidence = [],
} = {}) {
  if (usesLegacyFallback && usesStudioNative) return 'mixed';
  if (usesLegacyFallback) return 'legacy-fallback';
  if (usesStudioNative && (evidence || []).length) return 'studio-native';
  return 'unknown';
}

function mergeExecutionProvenance(...items) {
  const provenances = items.filter(Boolean);
  if (!provenances.length) return createExecutionProvenance();
  const classifications = new Set(provenances.map((entry) => String(entry.classification || 'unknown')));
  const usesLegacyFallback = classifications.has('legacy-fallback') || classifications.has('mixed');
  const usesStudioNative = classifications.has('studio-native') || classifications.has('mixed');
  const evidence = uniqueStrings(provenances.flatMap((entry) => entry.evidence || []));
  return createExecutionProvenance({
    classification: classifyExecutionProvenance({ usesLegacyFallback, usesStudioNative, evidence }),
    orchestration: provenances.some((entry) => entry.orchestration === 'studio') ? 'studio' : 'unknown',
    execution: usesLegacyFallback && usesStudioNative
      ? 'hybrid'
      : (usesLegacyFallback ? 'legacy-fallback' : (usesStudioNative ? 'studio-native' : 'unknown')),
    engine: provenances.map((entry) => entry.engine).find(Boolean) || null,
    stageIds: provenances.flatMap((entry) => entry.stageIds || []),
    legacyActions: provenances.flatMap((entry) => entry.legacyActions || []),
    nativeActions: provenances.flatMap((entry) => entry.nativeActions || []),
    evidence,
    notes: provenances.flatMap((entry) => entry.notes || []),
  });
}

function stageProvenance(stageId, overrides = {}) {
  const nativeStage = createExecutionProvenance({
    classification: 'studio-native',
    orchestration: 'studio',
    execution: 'studio-native',
    engine: `ace-${stageId}`,
    stageIds: [stageId],
    nativeActions: [stageId],
    evidence: [`stage:${stageId}`, 'route:studio'],
  });
  return createExecutionProvenance({
    ...nativeStage,
    ...overrides,
    stageIds: [...(nativeStage.stageIds || []), ...((overrides && overrides.stageIds) || [])],
    nativeActions: [...(nativeStage.nativeActions || []), ...((overrides && overrides.nativeActions) || [])],
    evidence: [...(nativeStage.evidence || []), ...((overrides && overrides.evidence) || [])],
  });
}

function aggregateSessionProvenance(session) {
  return mergeExecutionProvenance(...((session?.stages || []).map((stage) => stage.provenance).filter(Boolean)));
}

function ensureThroughputStorage(rootPath) {
  const dir = path.join(rootPath, THROUGHPUT_RELATIVE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sessionFilePath(rootPath, sessionId) {
  return path.join(ensureThroughputStorage(rootPath), `${sessionId}.json`);
}

function writeJson(filePath, payload) {
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

function readThroughputSession(rootPath, sessionId) {
  return readJson(sessionFilePath(rootPath, sessionId), null);
}

function updateThroughputSession(rootPath, sessionId, updater) {
  const current = readThroughputSession(rootPath, sessionId);
  if (!current) return null;
  const next = updater({ ...current }) || current;
  writeJson(sessionFilePath(rootPath, sessionId), next);
  return next;
}

function listThroughputSessions(rootPath) {
  const dir = ensureThroughputStorage(rootPath);
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => readJson(path.join(dir, entry.name), null))
    .filter(Boolean)
    .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
}

function summarizeSession(session) {
  if (!session) return null;
  return {
    id: session.id,
    prompt: session.prompt,
    status: session.status,
    verdict: session.verdict,
    targetProjectKey: session.targetProjectKey,
    mode: session.mode,
    createdAt: session.createdAt,
    finishedAt: session.finishedAt,
    pageId: session.pageId,
    nodeId: session.nodeId,
    runnerTaskId: session.runnerTaskId,
    qaRunId: session.qaRunId || null,
    anchorRefs: Array.isArray(session.anchorRefs) ? session.anchorRefs : [],
    provenance: session.provenance || createExecutionProvenance(),
    stageSummary: (session.stages || []).map((stage) => ({
      id: stage.id,
      label: stage.label,
      verdict: stage.verdict,
      status: stage.status,
      provenance: stage.provenance || createExecutionProvenance(),
    })),
  };
}

function createStage(id, label) {
  return {
    id,
    label,
    status: 'pending',
    verdict: 'pending',
    startedAt: null,
    finishedAt: null,
    input: null,
    output: null,
    artifacts: [],
    failureReason: null,
    provenance: createExecutionProvenance(),
  };
}

function createSession({ prompt, targetProjectKey, mode, executionProfile = 'live-ace-self' }) {
  const createdAt = nowIso();
  return {
    id: makeId('throughput'),
    prompt,
    targetProjectKey,
    mode,
    executionProfile,
    status: 'running',
    verdict: 'pending',
    createdAt,
    finishedAt: null,
    pageId: null,
    nodeId: null,
    handoffId: null,
    runnerTaskId: null,
    qaRunId: null,
    anchorRefs: [],
    runIds: [],
    cardIds: [],
    provenance: createExecutionProvenance(),
    stages: [
      createStage('seed', 'Seed Debug Page'),
      createStage('intent', 'Context Analysis'),
      createStage('handoff', 'Planner Handoff'),
      createStage('team-board', 'Team Board Progression'),
      createStage('runner-task', 'Runner Task Mapping'),
      createStage('scan', 'Runner Scan'),
      createStage('manage', 'Runner Manage'),
      createStage('build', 'Runner Build'),
      createStage('apply', 'Runner Apply'),
      createStage('preflight', 'Self-Upgrade Preflight'),
      createStage('deploy', 'Self-Upgrade Deploy'),
      createStage('archives', 'Archive Verification'),
      createStage('final', 'Final Comparison'),
    ],
    sinks: {},
    snapshots: {
      before: null,
      after: null,
    },
    notes: [],
  };
}

function getStage(session, stageId) {
  return session.stages.find((stage) => stage.id === stageId);
}

function beginStage(session, stageId, input = null) {
  const stage = getStage(session, stageId);
  if (!stage) return;
  stage.status = 'running';
  stage.verdict = 'pending';
  stage.startedAt = nowIso();
  stage.input = input;
}

function finishStage(session, stageId, {
  verdict = 'pass',
  output = null,
  artifacts = [],
  failureReason = null,
  provenance = null,
} = {}) {
  const stage = getStage(session, stageId);
  if (!stage) return;
  stage.status = ['failed', 'blocked'].includes(verdict) ? verdict : 'completed';
  stage.verdict = verdict;
  stage.output = output;
  stage.artifacts = artifacts;
  stage.failureReason = failureReason;
  stage.finishedAt = nowIso();
  stage.provenance = provenance || stage.provenance || createExecutionProvenance();
  session.provenance = aggregateSessionProvenance(session);
}

function markRemainingStagesBlocked(session, fromStageId, reason) {
  let shouldBlock = false;
  for (const stage of session.stages) {
    if (stage.id === fromStageId) shouldBlock = true;
    if (!shouldBlock || stage.status !== 'pending') continue;
    stage.status = 'blocked';
    stage.verdict = 'blocked';
    stage.failureReason = reason;
    stage.finishedAt = nowIso();
    stage.provenance = stage.provenance || createExecutionProvenance();
  }
  session.provenance = aggregateSessionProvenance(session);
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

function createPlannerHandoff(report, dashboardState = {}, previousHandoff = null) {
  if (!report) return null;
  const graphBundle = report?.projectContext?.graphBundle || null;
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
  const plannerUsefulness = Number(report?.scores?.plannerUsefulness || 0);
  const executionReadiness = Number(report?.scores?.executionReadiness || 0);
  if (plannerUsefulness < 0.55) clarifications.push('Planner usefulness is low and needs tighter scope before execution expands.');
  if (executionReadiness < 0.45) clarifications.push('Execution readiness is low, so a worker should not start blindly.');
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
    createdAt: report.createdAt || nowIso(),
    sourceNodeId: report.nodeId || null,
    summary: report.summary || 'Intent ready for planner review.',
    goal: report.goal || report.truth?.goal || report.summary || '',
    problemStatement,
    anchorRefs: Array.isArray(report.anchorRefs) ? report.anchorRefs.filter(Boolean) : [],
    requestedOutcomes,
    tasks: requestedOutcomes,
    constraints,
    confidence: Number(report.confidence || 0),
    legacyConfidence: Number(report.legacyConfidence || 0),
    criteria: Array.isArray(report.criteria) ? report.criteria : [],
    scores: report.scores || null,
    classification: report.classification || { role: 'context', labels: [] },
    requestType: report.requestType || report.truth?.requestType || 'context_request',
    urgency: report.urgency || report.truth?.urgency || 'normal',
    targets: Array.isArray(report.targets) ? report.targets.slice(0, 8) : [],
    signals: report.signals || report.truth?.signals || null,
    graphBundle,
    status: clarifications.length ? 'needs-clarification' : 'ready',
  };
}

function buildRuntimeSnapshot({ workspace, runs = [], health = null }) {
  const latestIntent = workspace?.intentState?.contextReport || workspace?.intentState?.latest || null;
  const handoff = workspace?.studio?.handoffs?.contextToPlanner || null;
  const teamBoard = workspace?.studio?.teamBoard || null;
  const orchestrator = workspace?.studio?.orchestrator || null;
  const selfUpgrade = workspace?.studio?.selfUpgrade || null;
  return {
    capturedAt: nowIso(),
    workspace: {
      activePageId: workspace?.activePageId || null,
      nodeCount: workspace?.graph?.nodes?.length || 0,
      edgeCount: workspace?.graph?.edges?.length || 0,
      latestIntent: latestIntent ? {
        nodeId: latestIntent.nodeId || null,
        summary: latestIntent.summary || null,
        confidence: latestIntent.confidence || 0,
        scores: latestIntent.scores || null,
        anchorRefs: latestIntent.anchorRefs || latestIntent.projectContext?.anchorRefs || [],
      } : null,
      handoff: handoff ? {
        id: handoff.id,
        status: handoff.status,
        taskCount: handoff.tasks?.length || 0,
        anchorRefs: handoff.anchorRefs || [],
      } : null,
      teamBoard: teamBoard ? {
        selectedCardId: teamBoard.selectedCardId || null,
        summary: teamBoard.summary || {},
      } : null,
    },
    orchestrator,
    selfUpgrade,
    health,
    runs: (runs || []).slice(0, 8).map((run) => ({
      runId: run.runId,
      action: run.action,
      status: run.status,
      exitCode: run.exitCode,
      payload: run.payload,
      artifacts: run.artifacts,
    })),
  };
}

function upsertSessionPointer(workspace, session) {
  return {
    ...workspace,
    studio: {
      ...(workspace.studio || {}),
      throughputDebug: {
        currentSessionId: session.id,
        latestSessionId: session.id,
        status: session.status,
        verdict: session.verdict,
        prompt: session.prompt,
        targetProjectKey: session.targetProjectKey,
        pageId: session.pageId,
        nodeId: session.nodeId,
        runnerTaskId: session.runnerTaskId,
        updatedAt: nowIso(),
      },
    },
  };
}

function collectRunnerArtifacts(taskDir) {
  if (!taskDir || !fs.existsSync(taskDir)) return [];
  return [
    'idea.txt',
    'context.md',
    'plan.md',
    'patch.diff',
    ...fs.readdirSync(taskDir).filter((entry) => /^run_.+\.(json|log)$/i.test(entry)),
  ]
    .map((entry) => path.join(taskDir, entry))
    .filter((entry, index, values) => fs.existsSync(entry) && values.indexOf(entry) === index);
}

function summarizeArtifacts(rootPath, artifacts = []) {
  return artifacts.map((artifactPath) => {
    const absolute = path.resolve(artifactPath);
    const relative = absolute.startsWith(path.resolve(rootPath))
      ? path.relative(rootPath, absolute).replace(/\\/g, '/')
      : absolute.replace(/\\/g, '/');
    return relative;
  });
}

function buildSinkVerification({ rootPath, workspace, history = [], session, taskDir, report, handoff, health }) {
  const board = workspace?.studio?.teamBoard || {};
  const orchestrator = workspace?.studio?.orchestrator || {};
  const selfUpgrade = workspace?.studio?.selfUpgrade || {};
  const artifacts = collectRunnerArtifacts(taskDir);
  const managerSummary = report?.projectContext?.managerSummary || report?.provenance?.managerSummary || null;
  return {
    'workspace.intentState': {
      read: true,
      write: Boolean(workspace?.intentState?.latest || workspace?.intentState?.contextReport),
      summary: workspace?.intentState?.latest?.summary || workspace?.intentState?.contextReport?.summary || 'No intent report recorded.',
    },
    'workspace.studio.handoffs.contextToPlanner': {
      read: true,
      write: Boolean(handoff?.id),
      summary: handoff ? `${handoff.status} | ${handoff.tasks?.length || 0} tasks` : 'No planner handoff recorded.',
    },
    'workspace.studio.teamBoard': {
      read: true,
      write: Boolean((board.cards || []).length),
      summary: `plan ${board.summary?.plan || 0} | active ${board.summary?.active || 0} | complete ${board.summary?.complete || 0} | review ${board.summary?.review || 0}`,
    },
    'workspace.studio.orchestrator': {
      read: true,
      write: Boolean(orchestrator?.lastTickAt),
      summary: `${orchestrator?.status || 'idle'} | active desks ${(orchestrator?.activeDeskIds || []).length}`,
    },
    'workspace.studio.selfUpgrade': {
      read: true,
      write: Boolean(selfUpgrade?.status),
      summary: `${selfUpgrade?.status || 'idle'} | deploy ${selfUpgrade?.deploy?.status || 'idle'}`,
    },
    'data/spatial/history.json': {
      read: true,
      write: history.some((entry) => entry?.sessionId === session.id),
      summary: `${history.filter((entry) => entry?.sessionId === session.id).length} session events recorded`,
    },
    'runner.taskArtifacts': {
      read: true,
      write: artifacts.length > 0,
      summary: artifacts.length ? summarizeArtifacts(rootPath, artifacts).join(', ') : 'No runner artifacts found.',
    },
    'brain/emergence/*': {
      read: Boolean(report?.projectContext?.sourcesRead?.length),
      write: false,
      summary: `Canonical anchor refs: ${(report?.anchorRefs || report?.projectContext?.anchorRefs || []).join(', ') || 'none recorded'}`,
    },
    'manager.anchorBundle': {
      read: Boolean(managerSummary),
      write: false,
      summary: managerSummary?.current_focus || 'No manager summary recorded.',
    },
    health: {
      read: Boolean(health),
      write: false,
      summary: health?.selfUpgrade?.deploy?.health?.status || health?.selfUpgrade?.deploy?.status || (health?.ok ? 'healthy' : 'unknown'),
    },
  };
}

function evaluateStageVerdict({ report, handoff, selectedCard, taskDir, executionResults, health }) {
  const taskCount = report?.tasks?.length || 0;
  const confidence = Number(report?.confidence || 0);
  const plannerUsefulness = Number(report?.scores?.plannerUsefulness || 0);
  const applyResult = executionResults?.apply || null;
  const buildResult = executionResults?.build || null;
  const deployStatus = health?.selfUpgrade?.deploy?.health?.status || health?.selfUpgrade?.deploy?.status || null;
  if (applyResult && !applyResult.ok) return 'failed';
  if (buildResult && !buildResult.ok) return 'failed';
  if (!handoff?.id || !selectedCard?.id || !taskDir) return 'blocked';
  if (taskCount === 0 || plannerUsefulness < 0.45 || confidence < 0.35) return 'weak';
  if (deployStatus && !['healthy', 'ready', 'restarting'].includes(String(deployStatus))) return 'weak';
  return 'pass';
}

async function runThroughputSession(options = {}) {
  const {
    rootPath,
    prompt,
    targetProjectKey = 'ace-self',
    mode = 'live',
    confirmDeploy = true,
    simulateDeploy = false,
    loadWorkspace,
    persistWorkspace,
    appendHistory,
    readHistory,
    analyzeIntent,
    getDashboardState,
    createRunnerTask,
    executeActionSync,
    runSelfUpgradePreflight,
    deploySelfUpgrade,
    getRunsSnapshot,
    getHealthSnapshot,
  } = options;

  if (!rootPath) throw new Error('rootPath is required');
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('prompt is required');
  if (typeof loadWorkspace !== 'function') throw new Error('loadWorkspace is required');
  if (typeof persistWorkspace !== 'function') throw new Error('persistWorkspace is required');
  if (typeof analyzeIntent !== 'function') throw new Error('analyzeIntent is required');
  if (typeof createRunnerTask !== 'function') throw new Error('createRunnerTask is required');
  if (typeof executeActionSync !== 'function') throw new Error('executeActionSync is required');
  if (typeof runSelfUpgradePreflight !== 'function') throw new Error('runSelfUpgradePreflight is required');
  if (typeof deploySelfUpgrade !== 'function') throw new Error('deploySelfUpgrade is required');

  const session = createSession({ prompt: prompt.trim(), targetProjectKey, mode });
  const saveSession = () => writeJson(sessionFilePath(rootPath, session.id), session);
  const recordHistory = (type, summary = {}) => {
    if (typeof appendHistory !== 'function') return;
    appendHistory({
      at: nowIso(),
      type,
      sessionId: session.id,
      summary,
    });
  };

  let workspace = await loadWorkspace();
  const dashboardState = typeof getDashboardState === 'function' ? await getDashboardState() : {};
  session.snapshots.before = buildRuntimeSnapshot({
    workspace,
    runs: typeof getRunsSnapshot === 'function' ? await getRunsSnapshot() : [],
    health: typeof getHealthSnapshot === 'function' ? await getHealthSnapshot() : null,
  });
  saveSession();

  let report = null;
  let handoff = null;
  let taskInfo = null;
  let selectedCard = null;
  const executionResults = {};

  try {
    beginStage(session, 'seed', { prompt: session.prompt, targetProjectKey });
    const pageId = makeId('page_debug');
    const nodeId = makeId('node_debug');
    session.pageId = pageId;
    session.nodeId = nodeId;
    workspace = upsertSessionPointer({
      ...workspace,
      graph: {
        ...(workspace.graph || { nodes: [], edges: [] }),
        nodes: [
          ...(workspace.graph?.nodes || []),
          {
            id: nodeId,
            type: 'text',
            content: session.prompt,
            position: { x: 360, y: 160 },
            connections: [],
            metadata: {
              role: 'context',
              agentId: 'context-manager',
              labels: ['context'],
              intentStatus: 'processing',
              debugSessionId: session.id,
            },
          },
        ],
      },
      pages: [
        ...(workspace.pages || []),
        {
          id: pageId,
          title: `Throughput Debug ${new Date().toLocaleTimeString()}`,
          status: 'active',
          sourceNodeId: nodeId,
          summary: session.prompt,
          outputs: [],
          handoffs: [],
          artifactRefs: [],
          createdAt: nowIso(),
          updatedAt: nowIso(),
        },
      ],
      activePageId: pageId,
    }, session);
    workspace = await persistWorkspace(workspace);
    finishStage(session, 'seed', {
      verdict: 'pass',
      output: { pageId, nodeId },
      provenance: stageProvenance('seed'),
    });
    recordHistory('throughput-seed', { pageId, nodeId });
    saveSession();

    beginStage(session, 'intent', { nodeId, prompt: session.prompt });
    report = {
      ...(await analyzeIntent(session.prompt, workspace)),
      nodeId,
      source: 'throughput-debug',
      createdAt: nowIso(),
    };
    session.anchorRefs = Array.isArray(report.anchorRefs) ? report.anchorRefs : [];
    workspace = upsertSessionPointer({
      ...workspace,
      graph: {
        ...(workspace.graph || { nodes: [], edges: [] }),
        nodes: (workspace.graph?.nodes || []).map((node) => (
          node.id === nodeId
            ? {
                ...node,
                type: report.classification?.role === 'thought' ? 'text' : (report.classification?.role || node.type || 'text'),
                metadata: {
                  ...(node.metadata || {}),
                  role: report.classification?.role || 'context',
                  labels: [...new Set([...(node.metadata?.labels || []), ...(report.classification?.labels || [])])],
                  intentAnalysis: report,
                  intentStatus: 'ready',
                  debugSessionId: session.id,
                },
              }
            : node
        )),
      },
      intentState: {
        ...(workspace.intentState || {}),
        latest: report,
        contextReport: report,
        byNode: {
          ...((workspace.intentState || {}).byNode || {}),
          [nodeId]: report,
        },
        reports: [report, ...(((workspace.intentState || {}).reports || []).filter((entry) => entry.nodeId !== nodeId))].slice(0, 24),
      },
    }, session);
    workspace = await persistWorkspace(workspace);
    finishStage(session, 'intent', {
      verdict: report.scores?.plannerUsefulness >= 0.45 ? 'pass' : 'weak',
      output: {
        summary: report.summary,
        confidence: report.confidence,
        legacyConfidence: report.legacyConfidence,
        scores: report.scores,
        classification: report.classification,
        tasks: report.tasks,
        anchorRefs: report.anchorRefs,
      },
      provenance: stageProvenance('intent', {
        evidence: ['source:intent-analysis'],
      }),
    });
    recordHistory('throughput-intent', {
      confidence: report.confidence,
      legacyConfidence: report.legacyConfidence,
      taskCount: report.tasks?.length || 0,
    });
    saveSession();

    beginStage(session, 'handoff', { nodeId, reportSummary: report.summary });
    handoff = createPlannerHandoff(report, dashboardState, workspace?.studio?.handoffs?.contextToPlanner || null);
    session.handoffId = handoff?.id || null;
    workspace = upsertSessionPointer({
      ...workspace,
      studio: {
        ...(workspace.studio || {}),
        handoffs: {
          contextToPlanner: handoff,
          history: [handoff, ...(((workspace.studio || {}).handoffs?.history || []).filter((entry) => entry.id !== handoff.id))].slice(0, 12),
        },
      },
    }, session);
    workspace = await persistWorkspace(workspace);
    finishStage(session, 'handoff', {
      verdict: handoff?.status === 'ready' ? 'pass' : 'weak',
      output: {
        id: handoff?.id,
        status: handoff?.status,
        tasks: handoff?.tasks,
        constraints: handoff?.constraints,
        problemStatement: handoff?.problemStatement,
      },
      provenance: stageProvenance('handoff', {
        evidence: ['source:planner-handoff'],
      }),
    });
    recordHistory('throughput-handoff', {
      handoffId: handoff?.id,
      status: handoff?.status,
      taskCount: handoff?.tasks?.length || 0,
    });
    saveSession();

    beginStage(session, 'team-board', { handoffId: handoff?.id });
    for (let tick = 0; tick < 3; tick += 1) {
      workspace = await persistWorkspace(upsertSessionPointer(workspace, session));
    }
    const cards = workspace?.studio?.teamBoard?.cards || [];
    selectedCard = cards.find((card) => card.status === 'review')
      || cards.find((card) => card.status === 'complete')
      || cards[0]
      || null;
    session.cardIds = cards.map((card) => card.id);
    finishStage(session, 'team-board', {
      verdict: selectedCard ? 'pass' : 'blocked',
      output: {
        selectedCardId: selectedCard?.id || null,
        boardSummary: workspace?.studio?.teamBoard?.summary || {},
      },
      failureReason: selectedCard ? null : 'No board card was seeded from the planner handoff.',
      provenance: stageProvenance('team-board', {
        evidence: ['source:team-board'],
      }),
    });
    recordHistory('throughput-board', {
      cardCount: cards.length,
      selectedCardId: selectedCard?.id || null,
    });
    saveSession();
    if (!selectedCard) {
      markRemainingStagesBlocked(session, 'runner-task', 'Planner handoff did not produce a reviewable task card.');
      session.status = 'blocked';
      session.verdict = 'blocked';
      session.finishedAt = nowIso();
      session.sinks = buildSinkVerification({
        rootPath,
        workspace,
        history: typeof readHistory === 'function' ? await readHistory() : [],
        session,
        taskDir: null,
        report,
        handoff,
        health: typeof getHealthSnapshot === 'function' ? await getHealthSnapshot() : null,
      });
      session.snapshots.after = buildRuntimeSnapshot({
        workspace,
        runs: typeof getRunsSnapshot === 'function' ? await getRunsSnapshot() : [],
        health: typeof getHealthSnapshot === 'function' ? await getHealthSnapshot() : null,
      });
      saveSession();
      return session;
    }

    beginStage(session, 'runner-task', { cardId: selectedCard.id, title: selectedCard.title });
    taskInfo = await createRunnerTask({
      session,
      title: selectedCard.title || session.prompt.slice(0, 48),
      prompt: session.prompt,
      targetProjectKey,
      handoff,
      pageId: session.pageId,
      sourceNodeId: session.nodeId,
    });
    session.runnerTaskId = taskInfo.taskId;
    workspace = upsertSessionPointer({
      ...workspace,
      studio: {
        ...(workspace.studio || {}),
        teamBoard: {
          ...(workspace.studio?.teamBoard || {}),
          selectedCardId: selectedCard.id,
          cards: (workspace.studio?.teamBoard?.cards || []).map((card) => (
            card.id === selectedCard.id
              ? {
                  ...card,
                  status: 'review',
                  desk: 'Worker',
                  state: 'Queued for execution',
                  runnerTaskId: taskInfo.taskId,
                  runIds: [...new Set([...(card.runIds || [])])],
                  artifactRefs: [...new Set([...(card.artifactRefs || []), ...summarizeArtifacts(rootPath, collectRunnerArtifacts(taskInfo.taskDir))])],
                  deployStatus: 'queued',
                  auditSessionId: session.id,
                  updatedAt: nowIso(),
                }
              : card
          )),
        },
      },
    }, session);
    workspace = await persistWorkspace(workspace);
    finishStage(session, 'runner-task', {
      verdict: 'pass',
      output: {
        taskId: taskInfo.taskId,
        taskDir: taskInfo.taskDir,
      },
      artifacts: summarizeArtifacts(rootPath, collectRunnerArtifacts(taskInfo.taskDir)),
      provenance: stageProvenance('runner-task', {
        evidence: ['source:runner-task-folder'],
      }),
    });
    recordHistory('throughput-runner-task', {
      taskId: taskInfo.taskId,
      selectedCardId: selectedCard.id,
    });
    saveSession();

    for (const action of ['scan', 'manage', 'build', 'apply']) {
      beginStage(session, action, {
        action,
        taskId: taskInfo.taskId,
        project: targetProjectKey,
      });
      const result = await executeActionSync(action, {
        project: targetProjectKey,
        taskId: taskInfo.taskId,
        confirmApply: action === 'apply',
        confirmOverride: action === 'apply',
      });
      executionResults[action] = result;
      if (result.runId) session.runIds.push(result.runId);
      const artifactRefs = summarizeArtifacts(rootPath, collectRunnerArtifacts(taskInfo.taskDir));
      workspace = await loadWorkspace();
      workspace = upsertSessionPointer({
        ...workspace,
        studio: {
          ...(workspace.studio || {}),
          teamBoard: {
            ...(workspace.studio?.teamBoard || {}),
            selectedCardId: selectedCard.id,
            cards: (workspace.studio?.teamBoard?.cards || []).map((card) => (
              card.id === selectedCard.id
                ? {
                    ...card,
                    runnerTaskId: taskInfo.taskId,
                    runIds: [...new Set([...(card.runIds || []), ...(result.runId ? [result.runId] : [])])],
                    artifactRefs: [...new Set([...(card.artifactRefs || []), ...artifactRefs])],
                    deployStatus: action === 'apply' && result.ok ? 'ready-to-preflight' : (card.deployStatus || 'queued'),
                    auditSessionId: session.id,
                    updatedAt: nowIso(),
                  }
                : card
            )),
          },
        },
      }, session);
      workspace = await persistWorkspace(workspace);
      finishStage(session, action, {
        verdict: result.ok ? 'pass' : 'failed',
        output: {
          runId: result.runId || null,
          exitCode: result.exitCode,
          status: result.status,
          meta: result.meta || {},
          summary: result.summary || null,
        },
        artifacts: artifactRefs,
        failureReason: result.ok ? null : (result.error || result.summary || `${action} failed.`),
        provenance: result.provenance || createExecutionProvenance({
          classification: 'legacy-fallback',
          orchestration: 'unknown',
          execution: 'legacy-fallback',
          engine: 'legacy-runner',
          stageIds: [action],
          legacyActions: [action],
          evidence: [`stage:${action}`, 'route:legacy-fallback'],
        }),
      });
      recordHistory(`throughput-${action}`, {
        taskId: taskInfo.taskId,
        runId: result.runId || null,
        ok: result.ok,
      });
      saveSession();
      if (!result.ok) {
        markRemainingStagesBlocked(session, 'preflight', `${action} failed, so self-upgrade verification cannot continue.`);
        break;
      }
    }

    if (executionResults.apply?.ok) {
      beginStage(session, 'preflight', { taskId: taskInfo.taskId, project: targetProjectKey });
      const preflight = await runSelfUpgradePreflight({
        taskId: taskInfo.taskId,
        project: targetProjectKey,
      });
      finishStage(session, 'preflight', {
        verdict: preflight.ok ? 'pass' : 'blocked',
        output: preflight,
        failureReason: preflight.ok ? null : (preflight.error || preflight.selfUpgrade?.preflight?.summary || 'Preflight failed.'),
        provenance: stageProvenance('preflight', {
          evidence: ['source:self-upgrade-preflight'],
        }),
      });
      recordHistory('throughput-preflight', {
        taskId: taskInfo.taskId,
        ok: preflight.ok,
      });
      saveSession();
      if (preflight.ok && confirmDeploy) {
        beginStage(session, 'deploy', { taskId: taskInfo.taskId, project: targetProjectKey, simulateDeploy });
        const deploy = await deploySelfUpgrade({
          confirmRestart: true,
          simulate: simulateDeploy,
        });
        finishStage(session, 'deploy', {
          verdict: deploy.ok ? 'pass' : 'failed',
          output: deploy,
          failureReason: deploy.ok ? null : (deploy.error || 'Deploy failed.'),
          provenance: stageProvenance('deploy', {
            evidence: ['source:self-upgrade-deploy'],
          }),
        });
        recordHistory('throughput-deploy', {
          taskId: taskInfo.taskId,
          ok: deploy.ok,
          restarting: deploy.restarting,
        });
        saveSession();
      } else {
        finishStage(session, 'deploy', {
          verdict: 'blocked',
          output: { skipped: true, confirmDeploy, preflightOk: preflight.ok },
          failureReason: preflight.ok ? 'Deploy confirmation is disabled for this session.' : 'Deploy skipped because preflight failed.',
          provenance: stageProvenance('deploy', {
            evidence: ['source:self-upgrade-deploy'],
          }),
        });
      }
    }

    beginStage(session, 'archives', { sessionId: session.id });
    workspace = await loadWorkspace();
    const history = typeof readHistory === 'function' ? await readHistory() : [];
    const health = typeof getHealthSnapshot === 'function' ? await getHealthSnapshot() : null;
    session.sinks = buildSinkVerification({
      rootPath,
      workspace,
      history,
      session,
      taskDir: taskInfo?.taskDir || null,
      report,
      handoff,
      health,
    });
    finishStage(session, 'archives', {
      verdict: session.sinks['data/spatial/history.json']?.write ? 'pass' : 'weak',
      output: session.sinks,
      artifacts: taskInfo?.taskDir ? summarizeArtifacts(rootPath, collectRunnerArtifacts(taskInfo.taskDir)) : [],
      provenance: stageProvenance('archives', {
        evidence: ['source:archive-verification'],
      }),
    });
    saveSession();

    beginStage(session, 'final', { prompt: session.prompt });
    const finalHealth = typeof getHealthSnapshot === 'function' ? await getHealthSnapshot() : null;
    workspace = await loadWorkspace();
    const finalVerdict = evaluateStageVerdict({
      report,
      handoff,
      selectedCard,
      taskDir: taskInfo?.taskDir || null,
      executionResults,
      health: finalHealth,
    });
    finishStage(session, 'final', {
      verdict: finalVerdict,
      output: {
        prompt: session.prompt,
        reportSummary: report?.summary || null,
        taskCount: handoff?.tasks?.length || 0,
        runnerTaskId: taskInfo?.taskId || null,
        runIds: session.runIds,
        finalHealth,
      },
      provenance: stageProvenance('final', {
        evidence: ['source:final-comparison'],
      }),
    });
    session.status = finalVerdict === 'pass' ? 'completed' : (finalVerdict === 'weak' ? 'completed-with-warnings' : 'blocked');
    session.verdict = finalVerdict;
    session.finishedAt = nowIso();
    session.snapshots.after = buildRuntimeSnapshot({
      workspace,
      runs: typeof getRunsSnapshot === 'function' ? await getRunsSnapshot() : [],
      health: finalHealth,
    });
    recordHistory('throughput-final', {
      verdict: session.verdict,
      runnerTaskId: taskInfo?.taskId || null,
    });
    saveSession();
    return session;
  } catch (error) {
    session.status = 'failed';
    session.verdict = 'failed';
    session.finishedAt = nowIso();
    session.notes.push(String(error.message || error));
    markRemainingStagesBlocked(session, 'archives', `Session failed: ${error.message || error}`);
    session.snapshots.after = buildRuntimeSnapshot({
      workspace: await loadWorkspace(),
      runs: typeof getRunsSnapshot === 'function' ? await getRunsSnapshot() : [],
      health: typeof getHealthSnapshot === 'function' ? await getHealthSnapshot() : null,
    });
    saveSession();
    throw error;
  }
}

async function reconcilePendingThroughputSessions({
  rootPath,
  loadWorkspace,
  persistWorkspace,
  getRunsSnapshot,
  getHealthSnapshot,
} = {}) {
  if (!rootPath || typeof loadWorkspace !== 'function') return null;
  const latest = listThroughputSessions(rootPath).find((session) => ['running', 'restarting'].includes(session.status));
  if (!latest) return null;
  const deployStage = (latest.stages || []).find((stage) => stage.id === 'deploy');
  if (!deployStage || deployStage.verdict === 'pass') return null;
  const health = typeof getHealthSnapshot === 'function' ? await getHealthSnapshot() : null;
  const deployHealth = health?.selfUpgrade?.deploy?.health?.status || health?.selfUpgrade?.deploy?.status || null;
  if (!['healthy', 'ready'].includes(String(deployHealth || '').toLowerCase())) return null;
  deployStage.status = 'completed';
  deployStage.verdict = 'pass';
  deployStage.finishedAt = nowIso();
  deployStage.output = {
    ...(deployStage.output || {}),
    reconciledAfterBoot: true,
    health,
  };
  latest.status = 'completed';
  latest.verdict = latest.verdict === 'failed' ? 'failed' : 'pass';
  latest.finishedAt = latest.finishedAt || nowIso();
  latest.provenance = aggregateSessionProvenance(latest);
  const workspace = await loadWorkspace();
  latest.snapshots.after = buildRuntimeSnapshot({
    workspace,
    runs: typeof getRunsSnapshot === 'function' ? await getRunsSnapshot() : [],
    health,
  });
  writeJson(sessionFilePath(rootPath, latest.id), latest);
  if (typeof persistWorkspace === 'function') {
    await persistWorkspace(upsertSessionPointer(workspace, latest));
  }
  return latest;
}

module.exports = {
  THROUGHPUT_RELATIVE_DIR,
  classifyExecutionProvenance,
  createExecutionProvenance,
  createPlannerHandoff,
  createSession,
  ensureThroughputStorage,
  listThroughputSessions,
  mergeExecutionProvenance,
  readThroughputSession,
  summarizeSession,
  stageProvenance,
  updateThroughputSession,
  runThroughputSession,
  reconcilePendingThroughputSessions,
};
