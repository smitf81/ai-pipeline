const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const {
  advanceOrchestratorWorkspace,
  buildRuntimePayload,
  normalizeGraphBundle,
  createDefaultRsgState,
  buildRsgState,
  normalizeTeamBoardState,
} = require('./orchestratorState');
const {
  analyzeSpatialIntent: analyzeSpatialIntentReport,
  buildIntentProjectContext: buildIntentProjectContextData,
} = require('./intentAnalysis');
const {
  SELF_TARGET_KEY,
  createDefaultSelfUpgradeState,
  normalizeSelfUpgradeState,
  ensureSelfProject,
  isSelfTarget,
  reviewSelfUpgradePatch,
  assessAutoMutationRisk,
  summarizeCommandOutput,
  getSelfUpgradePreflightSpecs,
} = require('./selfUpgrade');
const {
  createPlannerHandoff,
  listThroughputSessions,
  readThroughputSession,
  summarizeSession,
  updateThroughputSession,
  runThroughputSession,
  reconcilePendingThroughputSessions,
} = require('./throughputDebug');
const {
  ensureQAStorage,
  listQARuns,
  readQARun,
  runQARun,
  summarizeQARun,
} = require('./qaRunner');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const ROOT = path.join(__dirname, '..');
const COMMANDS_FILE = path.join(ROOT, 'ace_commands.json');
const TASKS_DIR = path.join(ROOT, 'work', 'tasks');
const PROJECTS_FILE = path.join(ROOT, 'projects.json');
const REFRESH_MS_DEFAULT = 10000;
const MAX_RUN_HISTORY = 20;
const SPATIAL_WORKSPACE_FILE = path.join(ROOT, 'data', 'spatial', 'workspace.json');
const SPATIAL_HISTORY_FILE = path.join(ROOT, 'data', 'spatial', 'history.json');
const SERVER_STARTED_AT = nowIso();

const dashboardFiles = [
  'projects/emergence/roadmap.md',
  'projects/emergence/tasks.md',
  'projects/emergence/decisions.md',
  'projects/emergence/state.json',
  'projects/emergence/project_brain.md',
  'projects/emergence/plan.md',
  'projects/emergence/changelog.md',
];

const runStore = new Map();
const runOrder = [];


function ensureSpatialStorage() {
  const dir = path.dirname(SPATIAL_WORKSPACE_FILE);
  fs.mkdirSync(dir, { recursive: true });
  ensureQAStorage(ROOT);
  if (!fs.existsSync(SPATIAL_WORKSPACE_FILE)) {
    writeJson(SPATIAL_WORKSPACE_FILE, defaultSpatialWorkspace());
  }
  if (!fs.existsSync(SPATIAL_HISTORY_FILE)) fs.writeFileSync(SPATIAL_HISTORY_FILE, '[]\n');
}

function writeJson(file, payload) {
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function appendArchitectureHistory(entry) {
  const history = readJsonSafe(SPATIAL_HISTORY_FILE, []) || [];
  history.push(entry);
  writeJson(SPATIAL_HISTORY_FILE, history.slice(-80));
}


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

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function loadProjectsMap() {
  return ensureSelfProject(readJsonSafe(PROJECTS_FILE, {}) || {}, ROOT);
}

function getDashboardStateSnapshot() {
  return readDashboardFile('projects/emergence/state.json').parsed || {};
}

function getRunsSnapshot() {
  return runOrder.slice().reverse().map((id) => {
    const r = runStore.get(id);
    return r ? {
      runId: r.runId,
      action: r.action,
      status: r.status,
      exitCode: r.exitCode,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      durationMs: r.durationMs,
      payload: r.payload,
      logs: r.logs,
      artifacts: r.artifacts,
      meta: r.meta,
    } : null;
  }).filter(Boolean);
}

function defaultSpatialWorkspace() {
  return {
    graph: { nodes: [], edges: [] },
    graphs: {
      system: { nodes: [], edges: [] },
      world: { nodes: [], edges: [] },
    },
    sketches: [],
    annotations: [],
    architectureMemory: {},
    agentComments: {},
    intentState: { latest: null, contextReport: null, byNode: {}, reports: [] },
    pages: [],
    activePageId: null,
    rsg: createDefaultRsgState(),
    studio: {
      selfUpgrade: createDefaultSelfUpgradeState({ serverStartedAt: SERVER_STARTED_AT, pid: process.pid }),
    },
  };
}

function getSelfUpgradeState(workspace) {
  return normalizeSelfUpgradeState(workspace?.studio?.selfUpgrade, {
    serverStartedAt: SERVER_STARTED_AT,
    pid: process.pid,
  });
}

function normalizeSpatialWorkspaceShape(workspace = {}) {
  const baseWorkspace = {
    ...defaultSpatialWorkspace(),
    ...(workspace || {}),
  };
  const graphs = normalizeGraphBundle(baseWorkspace);
  const normalizedWorkspace = {
    ...baseWorkspace,
    graph: graphs.system,
    graphs,
    studio: {
      ...(baseWorkspace.studio || {}),
      selfUpgrade: getSelfUpgradeState(baseWorkspace),
    },
  };
  return {
    ...normalizedWorkspace,
    rsg: normalizedWorkspace.rsg || buildRsgState(normalizedWorkspace),
  };
}

function updateSpatialWorkspace(mutator) {
  ensureSpatialStorage();
  const workspace = normalizeSpatialWorkspaceShape(readJsonSafe(SPATIAL_WORKSPACE_FILE, defaultSpatialWorkspace()) || defaultSpatialWorkspace());
  const nextWorkspace = normalizeSpatialWorkspaceShape(mutator(workspace) || workspace);
  writeJson(SPATIAL_WORKSPACE_FILE, nextWorkspace);
  return nextWorkspace;
}

function updateSelfUpgradeState(mutator) {
  return updateSpatialWorkspace((workspace) => ({
    ...workspace,
    studio: {
      ...(workspace.studio || {}),
      selfUpgrade: mutator(getSelfUpgradeState(workspace), workspace),
    },
  }));
}

function persistSpatialWorkspace(nextWorkspace) {
  ensureSpatialStorage();
  const advancedWorkspace = advanceOrchestratorWorkspace(normalizeSpatialWorkspaceShape(nextWorkspace), {
    dashboardState: getDashboardStateSnapshot(),
    runs: getRunsSnapshot(),
  });
  writeJson(SPATIAL_WORKSPACE_FILE, advancedWorkspace);
  return advancedWorkspace;
}

function createRunnerTaskFolder({ title, prompt, handoff = null, sessionId = null }) {
  fs.mkdirSync(TASKS_DIR, { recursive: true });
  const safeTitle = slugify(title || prompt);
  const lastId = getTaskFolders().reduce((highest, folder) => {
    const value = Number.parseInt(String(folder || '').slice(0, 4), 10);
    return Number.isFinite(value) ? Math.max(highest, value) : highest;
  }, 0);
  const taskId = String(lastId + 1).padStart(4, '0');
  const folderName = `${taskId}-${safeTitle}`;
  const taskDir = path.join(TASKS_DIR, folderName);
  const createdAt = nowIso();
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(path.join(taskDir, 'idea.txt'), `${prompt.trim()}\n`, 'utf8');
  fs.writeFileSync(path.join(taskDir, 'context.md'), [
    `# Task ${taskId}: ${title || prompt.slice(0, 60)}`,
    '',
    '## Context',
    handoff?.problemStatement || handoff?.summary || prompt.trim(),
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(taskDir, 'plan.md'), [
    `# Task ${taskId}: ${title || prompt.slice(0, 60)}`,
    '',
    `Created: ${createdAt}`,
    '',
    '## Goal',
    handoff?.summary ? `- ${handoff.summary}` : '-',
    '',
    '## MVP scope (must-haves)',
    ...((handoff?.tasks || []).length ? handoff.tasks.map((task) => `- ${task}`) : ['-']),
    '',
    '## Out of scope (not now)',
    '-',
    '',
    '## Acceptance criteria',
    '- [ ]',
    '',
    '## Risks / notes',
    sessionId ? `- Throughput debug session: ${sessionId}` : '-',
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(taskDir, 'patch.diff'), '', 'utf8');
  fs.writeFileSync(path.join(taskDir, 'meta.json'), `${JSON.stringify({
    id: taskId,
    title: title || prompt.slice(0, 60),
    created_utc: createdAt,
    source: sessionId ? 'throughput-debug' : 'studio-team-board',
    sessionId,
    handoffId: handoff?.id || null,
  }, null, 2)}\n`, 'utf8');
  return {
    taskId,
    folderName,
    taskDir,
  };
}

function analyzeIntentWithProjectContext(text, workspace) {
  const project = buildIntentProjectContextData({
    workspace,
    readDashboardFile,
  });
  return analyzeSpatialIntentReport(text, project);
}

function resolveProjectTarget(projectKeyOrPath) {
  const projects = loadProjectsMap();
  const projectKey = String(projectKeyOrPath || '').trim();
  return {
    projectKey,
    projectPath: projects[projectKey] || projectKey,
    projects,
  };
}

function runSelfUpgradePreflight({ taskId, projectKey, projectPath, validation, patchReview }) {
  const checks = getSelfUpgradePreflightSpecs(ROOT).map((spec) => {
    const startedAt = Date.now();
    const result = spawnSyncSafe(spec.cmd, spec.args, spec.cwd);
    return {
      id: spec.id,
      label: spec.label,
      command: [spec.cmd, ...spec.args].join(' '),
      ok: result.code === 0,
      exitCode: result.code,
      durationMs: Date.now() - startedAt,
      output: summarizeCommandOutput(result.stdout || result.stderr || ''),
    };
  });
  const ok = Boolean(validation?.ok) && Boolean(patchReview?.ok) && checks.every((check) => check.ok);
  return {
    status: ok ? 'passed' : 'failed',
    ok,
    checkedAt: nowIso(),
    checks,
    summary: ok
      ? 'ACE self-upgrade preflight passed.'
      : 'ACE self-upgrade preflight found issues that block apply.',
    taskId,
    projectKey,
    validation,
    patchReview,
  };
}

function markServerHealthyOnBoot() {
  ensureSpatialStorage();
  const workspace = readJsonSafe(SPATIAL_WORKSPACE_FILE, defaultSpatialWorkspace()) || defaultSpatialWorkspace();
  const selfUpgrade = getSelfUpgradeState(workspace);
  if (!['restarting', 'queued'].includes(selfUpgrade.deploy?.status)) return;
  updateSelfUpgradeState((state) => ({
    ...state,
    status: state.apply?.ok ? 'healthy' : state.status,
    deploy: {
      ...state.deploy,
      status: 'healthy',
      restartedAt: nowIso(),
      health: {
        status: 'healthy',
        pid: process.pid,
        startedAt: SERVER_STARTED_AT,
      },
    },
    requiresPermission: 'none',
  }));
}

function scheduleSelfRestart() {
  const options = {
    cwd: __dirname,
    detached: true,
    windowsHide: true,
    stdio: 'ignore',
  };
  if (process.platform === 'win32') {
    const child = spawn('cmd', ['/c', 'ping 127.0.0.1 -n 2 >nul && node server.js'], options);
    child.unref();
  } else {
    const child = spawn('sh', ['-lc', 'sleep 1; node server.js'], options);
    child.unref();
  }
  setTimeout(() => process.exit(0), 150);
}

function refreshSpatialOrchestrator({ persist = true, workspace = null } = {}) {
  ensureSpatialStorage();
  const currentWorkspace = normalizeSpatialWorkspaceShape(syncTeamBoardWithSelfUpgrade(
    workspace || readJsonSafe(SPATIAL_WORKSPACE_FILE, defaultSpatialWorkspace()) || defaultSpatialWorkspace(),
  ));
  const nextWorkspace = advanceOrchestratorWorkspace(currentWorkspace, {
    dashboardState: getDashboardStateSnapshot(),
    runs: getRunsSnapshot(),
  });
  if (persist) {
    writeJson(SPATIAL_WORKSPACE_FILE, nextWorkspace);
  }
  return nextWorkspace;
}

function buildQADebugPayload() {
  const runs = listQARuns(ROOT);
  return {
    latestRun: summarizeQARun(runs[0] || null),
    runs: runs.slice(0, 8).map((run) => summarizeQARun(run)),
  };
}

function buildSpatialRuntimePayload(workspace) {
  return {
    ...buildRuntimePayload(workspace),
    throughputDebug: {
      latestSession: summarizeSession(listThroughputSessions(ROOT)[0] || null),
      sessions: listThroughputSessions(ROOT).slice(0, 8).map((session) => summarizeSession(session)),
    },
    qaDebug: buildQADebugPayload(),
  };
}

function refreshSpatialRuntime({ persist = true } = {}) {
  const workspace = refreshSpatialOrchestrator({ persist, workspace: pumpAutomatedTeamBoard() });
  return buildSpatialRuntimePayload(workspace);
}

function getLocalBaseUrl(req = null) {
  const host = req?.get?.('host') || req?.headers?.host || `localhost:${port}`;
  const protocol = req?.protocol || 'http';
  return `${protocol}://${host}`;
}

async function startBrowserQARun({
  baseUrl = null,
  scenario = 'layout-pass',
  mode = 'interactive',
  trigger = 'manual',
  prompt = '',
  actions = [],
  linked = {},
} = {}) {
  return runQARun({
    rootPath: ROOT,
    baseUrl: baseUrl || getLocalBaseUrl(),
    scenario,
    mode,
    trigger,
    prompt,
    actions,
    linked,
    getRuntimeSnapshot: () => buildSpatialRuntimePayload(refreshSpatialOrchestrator({ persist: false })),
    getHealthSnapshot: () => getHealthSnapshot(),
  });
}

function queueAutoBrowserQARun(options = {}) {
  setTimeout(() => {
    startBrowserQARun(options).catch(() => {});
  }, 80);
}

function readDashboardFile(relPath) {
  const abs = path.join(ROOT, relPath);
  try {
    const content = fs.readFileSync(abs, 'utf8');
    const stat = fs.statSync(abs);
    const parsed = relPath.endsWith('.json') ? JSON.parse(content) : null;
    return {
      exists: true,
      path: relPath,
      absPath: abs,
      mtime: stat.mtime.toISOString(),
      content,
      parsed,
      error: null,
    };
  } catch (err) {
    return {
      exists: false,
      path: relPath,
      absPath: abs,
      mtime: null,
      content: '',
      parsed: null,
      error: err.code === 'ENOENT' ? 'File not found' : String(err.message || err),
    };
  }
}

function getTaskFolders() {
  if (!fs.existsSync(TASKS_DIR)) return [];
  return fs.readdirSync(TASKS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{4}-.+/.test(d.name))
    .map((d) => d.name)
    .sort();
}

let teamBoardAutomationRunning = false;

function readSpatialWorkspace() {
  ensureSpatialStorage();
  return normalizeSpatialWorkspaceShape(readJsonSafe(SPATIAL_WORKSPACE_FILE, defaultSpatialWorkspace()) || defaultSpatialWorkspace());
}

function relativeToRoot(targetPath) {
  if (!targetPath) return null;
  return path.relative(ROOT, targetPath).replace(/\\/g, '/');
}

function findTaskFolderByTaskId(taskId) {
  return getTaskFolders().find((folder) => folder.startsWith(String(taskId || '').slice(0, 4))) || null;
}

function mutateTeamBoardCard(workspace, cardId, mutator) {
  const board = normalizeTeamBoardState(workspace);
  const cards = board.cards.map((card) => (card.id === cardId ? mutator(card) : card));
  return {
    ...workspace,
    studio: {
      ...(workspace.studio || {}),
      teamBoard: {
        ...board,
        cards,
        updatedAt: nowIso(),
      },
    },
  };
}

function findTeamBoardCard(workspace, cardId) {
  const board = normalizeTeamBoardState(workspace);
  return board.cards.find((card) => card.id === cardId) || null;
}

function persistBoardWorkspace(nextWorkspace, historyType, summary = {}) {
  const persisted = persistSpatialWorkspace(nextWorkspace);
  appendArchitectureHistory({
    at: nowIso(),
    type: historyType,
    summary,
  });
  return persisted;
}

function buildExecutionPackage({
  card,
  taskId,
  taskDir,
  patchPath,
  changedFiles,
  preflight,
  risk,
}) {
  const targetProjectKey = card.targetProjectKey || SELF_TARGET_KEY;
  return {
    status: 'ready',
    taskId,
    taskDir: relativeToRoot(taskDir),
    patchPath: relativeToRoot(patchPath),
    changedFiles,
    targetProjectKey,
    expectedAction: risk.autoDeploy ? 'apply + deploy' : 'apply',
    summary: `${changedFiles.length} changed file${changedFiles.length === 1 ? '' : 's'} ready for ${targetProjectKey}`,
    preflightStatus: preflight?.status || 'idle',
    builtAt: nowIso(),
  };
}

function syncTeamBoardWithSelfUpgrade(workspace) {
  const selfUpgrade = getSelfUpgradeState(workspace);
  const board = normalizeTeamBoardState(workspace);
  const taskId = String(selfUpgrade.taskId || '').trim();
  if (!taskId) return workspace;
  const healthStatus = selfUpgrade.deploy?.health?.status || selfUpgrade.deploy?.status || 'unknown';
  const cards = board.cards.map((card) => {
    if (String(card.builderTaskId || card.runnerTaskId || '') !== taskId) return card;
    if (card.deployStatus === 'deploying' && ['healthy', 'ready'].includes(String(healthStatus))) {
      return {
        ...card,
        status: 'complete',
        desk: 'Executor',
        state: 'Deployed',
        deployStatus: 'deployed',
        lastHealth: selfUpgrade.deploy?.health || null,
        updatedAt: nowIso(),
      };
    }
    if (card.deployStatus === 'deploying' && !['healthy', 'restarting', 'ready'].includes(String(healthStatus))) {
      return {
        ...card,
        status: 'review',
        desk: 'CTO',
        state: 'Flagged',
        deployStatus: 'flagged',
        approvalState: 'pending',
        riskLevel: 'high',
        riskReasons: [...new Set([...(card.riskReasons || []), `Deploy health reported ${healthStatus}.`])],
        lastHealth: selfUpgrade.deploy?.health || null,
        updatedAt: nowIso(),
      };
    }
    return card;
  });
  return {
    ...workspace,
    studio: {
      ...(workspace.studio || {}),
      selfUpgrade,
      teamBoard: {
        ...board,
        cards,
        updatedAt: nowIso(),
      },
    },
  };
}

function mergeUnique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function collectTaskArtifacts(taskDir, existingArtifacts = []) {
  const artifacts = [...existingArtifacts];
  if (!taskDir || !fs.existsSync(taskDir)) return mergeUnique(artifacts);
  for (const name of fs.readdirSync(taskDir)) {
    if (['idea.txt', 'context.md', 'plan.md', 'patch.diff', 'meta.json'].includes(name) || /^run_.+\.(log|json)$/.test(name)) {
      artifacts.push(relativeToRoot(path.join(taskDir, name)));
    }
  }
  return mergeUnique(artifacts);
}

function buildCardPrompt(card, workspace) {
  const handoff = workspace?.studio?.handoffs?.contextToPlanner || null;
  const promptParts = [
    card.title,
    handoff?.problemStatement || handoff?.summary || '',
  ].filter(Boolean);
  return promptParts.join('\n\n');
}

function readTaskPatchReview({ taskId, projectKey, projectPath }) {
  const taskFolder = findTaskFolderByTaskId(taskId);
  const validation = taskFolder ? validateApply(projectPath, taskFolder) : {
    ok: false,
    taskDir: null,
    patchPath: null,
    changedFiles: [],
    refusalReasons: ['Task folder not found.'],
  };
  const patchText = validation.patchPath && fs.existsSync(validation.patchPath)
    ? fs.readFileSync(validation.patchPath, 'utf8')
    : '';
  const patchReview = reviewSelfUpgradePatch({
    patchText,
    taskId,
    projectKey,
    projectPath,
    rootPath: ROOT,
  });
  return {
    taskFolder,
    validation,
    patchReview,
  };
}

function setSelfUpgradeFromBuild({ taskId, patchReview, preflight, validation }) {
  updateSelfUpgradeState((state) => ({
    ...state,
    status: preflight?.ok && patchReview?.ok && validation?.ok ? 'ready-to-apply' : 'blocked',
    taskId,
    targetProjectKey: SELF_TARGET_KEY,
    patchReview,
    preflight,
    deploy: preflight?.ok
      ? state.deploy
      : createDefaultSelfUpgradeState({ serverStartedAt: SERVER_STARTED_AT, pid: process.pid }).deploy,
    requiresPermission: preflight?.ok ? 'none' : 'user-confirmation',
  }));
}

function runCardBuilderPipeline(cardId) {
  let workspace = syncTeamBoardWithSelfUpgrade(readSpatialWorkspace());
  const card = findTeamBoardCard(workspace, cardId);
  if (!card || card.status !== 'active') {
    return { ok: false, error: 'Card is not active for builder work.', workspace };
  }

  const targetProjectKey = card.targetProjectKey || SELF_TARGET_KEY;
  const { projectKey, projectPath } = resolveProjectTarget(targetProjectKey);
  const handoff = workspace?.studio?.handoffs?.contextToPlanner || null;
  let taskId = String(card.builderTaskId || card.runnerTaskId || '').trim();
  let taskDir = null;

  if (!taskId || !findTaskFolderByTaskId(taskId)) {
    const task = createRunnerTaskFolder({
      title: card.title,
      prompt: buildCardPrompt(card, workspace),
      handoff,
    });
    taskId = task.taskId;
    taskDir = task.taskDir;
    workspace = mutateTeamBoardCard(workspace, cardId, (currentCard) => ({
      ...currentCard,
      builderTaskId: task.taskId,
      runnerTaskId: task.taskId,
      targetProjectKey,
      executionPackage: {
        ...(currentCard.executionPackage || {}),
        status: 'building',
        taskId: task.taskId,
        taskDir: relativeToRoot(task.taskDir),
        patchPath: relativeToRoot(path.join(task.taskDir, 'patch.diff')),
        targetProjectKey,
      },
      approvalState: 'none',
      applyStatus: 'idle',
      deployStatus: 'idle',
      riskLevel: 'unknown',
      riskReasons: [],
      updatedAt: nowIso(),
    }));
    workspace = persistBoardWorkspace(workspace, 'team-board-builder-start', { cardId, taskId, title: card.title });
  } else {
    taskDir = path.join(TASKS_DIR, findTaskFolderByTaskId(taskId));
  }

  const results = [];
  let failedResult = null;
  for (const action of ['scan', 'manage', 'build']) {
    const result = executeActionSync(action, {
      taskId,
      project: targetProjectKey,
    });
    results.push(result);
    if (!result.ok) {
      failedResult = result;
      break;
    }
  }
  const runIds = mergeUnique(results.map((result) => result.runId));
  const runArtifacts = mergeUnique(results.flatMap((result) => result.artifacts || []));

  if (failedResult) {
    const failedWorkspace = mutateTeamBoardCard(readSpatialWorkspace(), cardId, (currentCard) => ({
      ...currentCard,
      builderTaskId: taskId,
      runnerTaskId: taskId,
      status: 'active',
      executionPackage: {
        ...(currentCard.executionPackage || {}),
        status: 'failed',
        taskId,
        taskDir: relativeToRoot(taskDir),
        targetProjectKey,
        summary: failedResult.error || failedResult.summary || 'Builder pipeline failed.',
      },
      runIds: mergeUnique([...(currentCard.runIds || []), ...runIds]),
      artifactRefs: collectTaskArtifacts(taskDir, [...(currentCard.artifactRefs || []), ...runArtifacts]),
      updatedAt: nowIso(),
    }));
    return {
      ok: false,
      error: failedResult.error || 'Builder pipeline failed.',
      workspace: persistBoardWorkspace(failedWorkspace, 'team-board-builder-failed', { cardId, taskId, runIds }),
    };
  }

  const { validation, patchReview } = readTaskPatchReview({ taskId, projectKey, projectPath });
  const preflight = isSelfTarget(projectKey, projectPath, ROOT)
    ? runSelfUpgradePreflight({ taskId, projectKey, projectPath, validation, patchReview })
    : { status: 'not-required', ok: true, checks: [], summary: 'Preflight not required for this target.' };
  const conflicts = readSpatialWorkspace()?.studio?.orchestrator?.conflicts || [];
  const risk = assessAutoMutationRisk({
    projectKey,
    projectPath,
    rootPath: ROOT,
    changedFiles: validation.changedFiles || [],
    preflight,
    conflicts,
  });
  const riskReasons = mergeUnique([
    ...(risk.reasons || []),
    ...(!validation.ok ? (validation.refusalReasons || []) : []),
    ...(!patchReview.ok ? (patchReview.refusalReasons || []) : []),
  ]);
  const requiresReview = Boolean(risk.requiresReview || !validation.ok || !patchReview.ok || !preflight.ok);
  const nextRiskLevel = requiresReview && risk.riskLevel === 'low' ? 'high' : risk.riskLevel;
  const nextExecutionPackage = buildExecutionPackage({
    card,
    taskId,
    taskDir: validation.taskDir || taskDir,
    patchPath: validation.patchPath || path.join(taskDir, 'patch.diff'),
    changedFiles: validation.changedFiles || [],
    preflight,
    risk,
  });

  if (isSelfTarget(projectKey, projectPath, ROOT)) {
    setSelfUpgradeFromBuild({
      taskId,
      patchReview,
      preflight,
      validation,
    });
  }

  const completedWorkspace = mutateTeamBoardCard(readSpatialWorkspace(), cardId, (currentCard) => ({
    ...currentCard,
    builderTaskId: taskId,
    runnerTaskId: taskId,
    targetProjectKey,
    status: requiresReview ? 'review' : 'complete',
    executionPackage: nextExecutionPackage,
    runIds: mergeUnique([...(currentCard.runIds || []), ...runIds]),
    artifactRefs: collectTaskArtifacts(validation.taskDir || taskDir, [...(currentCard.artifactRefs || []), ...runArtifacts]),
    riskLevel: nextRiskLevel || 'medium',
    riskReasons,
    approvalState: requiresReview ? 'pending' : 'auto-approved',
    applyStatus: requiresReview ? 'idle' : 'queued',
    deployStatus: 'idle',
    updatedAt: nowIso(),
  }));

  return {
    ok: true,
    taskId,
    risk: {
      ...risk,
      reasons: riskReasons,
    },
    workspace: persistBoardWorkspace(completedWorkspace, 'team-board-build-complete', {
      cardId,
      taskId,
      changedFiles: validation.changedFiles || [],
      riskLevel: nextRiskLevel || 'medium',
    }),
  };
}

function runCardApplyPipeline(cardId, { approvedByUser = false } = {}) {
  const workspace = syncTeamBoardWithSelfUpgrade(readSpatialWorkspace());
  const card = findTeamBoardCard(workspace, cardId);
  if (!card) return { ok: false, error: 'Card not found.', workspace };

  const taskId = String(card.builderTaskId || card.runnerTaskId || card.executionPackage?.taskId || '').trim();
  if (!taskId) return { ok: false, error: 'Card has no build package to apply.', workspace };

  const readyForApply = (card.status === 'complete' && card.applyStatus === 'queued')
    || (card.status === 'review' && card.approvalState === 'approved')
    || (card.status === 'complete' && card.approvalState === 'approved');
  if (!readyForApply) return { ok: false, error: 'Card is not ready for apply.', workspace };

  const targetProjectKey = card.targetProjectKey || SELF_TARGET_KEY;
  const applyingWorkspace = mutateTeamBoardCard(workspace, cardId, (currentCard) => ({
    ...currentCard,
    status: 'complete',
    approvalState: currentCard.approvalState === 'approved' ? 'approved' : (approvedByUser ? 'approved' : currentCard.approvalState),
    applyStatus: 'applying',
    updatedAt: nowIso(),
  }));
  persistBoardWorkspace(applyingWorkspace, 'team-board-apply-start', { cardId, taskId });

  const result = executeActionSync('apply', {
    taskId,
    project: targetProjectKey,
    confirmApply: true,
    confirmOverride: true,
    autoApproved: !approvedByUser,
  });

  if (!result.ok) {
    const failedWorkspace = mutateTeamBoardCard(readSpatialWorkspace(), cardId, (currentCard) => ({
      ...currentCard,
      status: 'review',
      approvalState: 'pending',
      applyStatus: 'failed',
      riskLevel: 'high',
      riskReasons: mergeUnique([...(currentCard.riskReasons || []), result.error || 'Apply failed.']),
      updatedAt: nowIso(),
    }));
    return {
      ok: false,
      error: result.error || 'Apply failed.',
      workspace: persistBoardWorkspace(failedWorkspace, 'team-board-apply-failed', { cardId, taskId, runId: result.runId }),
    };
  }

  const nextDeployStatus = card.targetProjectKey === SELF_TARGET_KEY
    && card.executionPackage?.expectedAction === 'apply + deploy'
    ? 'queued'
    : 'idle';
  const appliedWorkspace = mutateTeamBoardCard(readSpatialWorkspace(), cardId, (currentCard) => ({
    ...currentCard,
    status: 'complete',
    approvalState: currentCard.approvalState === 'approved' ? 'approved' : (approvedByUser ? 'approved' : 'auto-approved'),
    applyStatus: 'applied',
    deployStatus: nextDeployStatus,
    branch: result.meta?.branch || currentCard.branch || null,
    commit: result.meta?.commit || currentCard.commit || null,
    runIds: mergeUnique([...(currentCard.runIds || []), result.runId]),
    artifactRefs: mergeUnique([...(currentCard.artifactRefs || []), ...(result.artifacts || [])]),
    updatedAt: nowIso(),
  }));
  return {
    ok: true,
    result,
    workspace: persistBoardWorkspace(appliedWorkspace, 'team-board-apply-complete', {
      cardId,
      taskId,
      branch: result.meta?.branch || null,
      commit: result.meta?.commit || null,
    }),
  };
}

function listChangedFilesFromPatch(patchText) {
  const files = new Set();
  const lines = patchText.split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      const parts = line.split(' ');
      if (parts.length >= 4) {
        const target = parts[3].replace(/^b\//, '');
        if (target && target !== 'dev/null') files.add(target);
      }
    }
  }
  return [...files];
}

function validateApply(projectPath, taskFolderName) {
  const taskDir = path.join(TASKS_DIR, taskFolderName);
  const patchPath = path.join(taskDir, 'patch.diff');
  const result = {
    ok: true,
    validation: [],
    warnings: [],
    refusalReasons: [],
    changedFiles: [],
    branchName: `ace/task-${taskFolderName.slice(0, 4)}-apply`,
    taskDir,
    patchPath,
  };

  if (!fs.existsSync(taskDir)) {
    result.ok = false;
    result.refusalReasons.push('Task folder not found.');
    return result;
  }

  if (!fs.existsSync(patchPath)) {
    result.ok = false;
    result.refusalReasons.push('patch.diff is missing. Run build first.');
    return result;
  }

  const patchText = fs.readFileSync(patchPath, 'utf8');
  if (!patchText.trim()) {
    result.ok = false;
    result.refusalReasons.push('patch.diff is empty.');
  } else {
    result.changedFiles = listChangedFilesFromPatch(patchText);
    if (result.changedFiles.length === 0) {
      result.ok = false;
      result.refusalReasons.push('Patch has no detectable changed files.');
    }
  }

  if (!projectPath || !fs.existsSync(projectPath)) {
    result.ok = false;
    result.refusalReasons.push('Project path does not exist.');
    return result;
  }

  const gitCheck = spawnSyncSafe('git', ['rev-parse', '--is-inside-work-tree'], projectPath);
  if (gitCheck.code !== 0 || gitCheck.stdout.trim() !== 'true') {
    result.ok = false;
    result.refusalReasons.push('Target project is not a git repository.');
    return result;
  }

  const status = spawnSyncSafe('git', ['status', '--porcelain', '--untracked-files=no'], projectPath);
  if (status.code !== 0) {
    result.ok = false;
    result.refusalReasons.push('Unable to inspect git status.');
  } else if (status.stdout.trim()) {
    result.ok = false;
    result.refusalReasons.push('Repository has uncommitted tracked changes.');
    result.warnings.push(status.stdout.trim());
  }

  const gitignorePath = path.join(projectPath, '.gitignore');
  const required = ['ui/node_modules/', '**/node_modules/', 'npm-debug.log*'];
  const gitignore = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
  const missing = required.filter((rule) => !gitignore.includes(rule));
  if (missing.length) {
    result.ok = false;
    result.refusalReasons.push('Required .gitignore rules are missing.');
    result.warnings.push(...missing.map((r) => `Missing rule: ${r}`));
  }

  result.validation.push(result.ok ? 'Validation passed.' : 'Validation failed.');
  return result;
}

function spawnSyncSafe(cmd, args, cwd) {
  try {
    const out = require('child_process').spawnSync(cmd, args, {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
    });
    return {
      code: out.status ?? 1,
      stdout: out.stdout || '',
      stderr: out.stderr || '',
    };
  } catch (err) {
    return { code: 1, stdout: '', stderr: String(err) };
  }
}

function createRun(action, payload) {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const run = {
    runId,
    action,
    payload,
    status: 'running',
    startedAt: Date.now(),
    finishedAt: null,
    durationMs: null,
    exitCode: null,
    logs: [],
    artifacts: [],
    meta: {},
    listeners: new Set(),
  };
  runStore.set(runId, run);
  runOrder.push(runId);
  while (runOrder.length > MAX_RUN_HISTORY) {
    const oldest = runOrder.shift();
    if (oldest) runStore.delete(oldest);
  }
  return run;
}

function pushRunEvent(run, event) {
  run.logs.push(event);
  for (const res of run.listeners) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }
}

function finishRun(run, exitCode, extra = {}) {
  run.exitCode = exitCode;
  run.status = exitCode === 0 ? 'success' : 'error';
  run.finishedAt = Date.now();
  run.durationMs = run.finishedAt - run.startedAt;
  run.meta = { ...run.meta, ...extra };
  pushRunEvent(run, { type: 'done', status: run.status, exitCode, durationMs: run.durationMs, meta: run.meta, artifacts: run.artifacts });
  for (const res of run.listeners) {
    res.end();
  }
  run.listeners.clear();
}

function runCommandForAction(action, body) {
  const aiPath = path.join(ROOT, 'runner', 'ai.py');
  const taskId = String(body.taskId || '').trim();
  const project = String(body.project || '').trim();
  const args = [aiPath, action, taskId, '--project', project];

  if (action === 'run') {
    if (!body.preset) throw new Error('Preset is required for Run action.');
    args.push('--preset', String(body.preset));
    if (body.timeout_s) args.push('--timeout-s', String(body.timeout_s));
  }

  if (action === 'apply' && body.dryRun) args.push('--dry-run');
  if ((action === 'manage' || action === 'build') && body.model) args.push('--model', String(body.model));

  return { cmd: 'python', args };
}

function extractApplySummary(stdout) {
  const branch = (stdout.match(/Apply complete on branch:\s*(.+)/) || [])[1] || null;
  const commit = (stdout.match(/Commit:\s*(.+)/) || [])[1] || null;
  return { branch: branch ? branch.trim() : null, commit: commit ? commit.trim() : null };
}

function executeActionSync(action, body) {
  const taskId = String(body.taskId || '').trim();
  const project = String(body.project || '').trim();
  const { projectKey, projectPath } = resolveProjectTarget(project);

  if (!['scan', 'manage', 'build', 'run', 'apply'].includes(action)) {
    throw new Error('Invalid action.');
  }
  if (!project || !taskId) {
    throw new Error('project and taskId are required.');
  }

  if (action === 'apply') {
    const taskFolder = getTaskFolders().find((folder) => folder.startsWith(taskId.slice(0, 4)));
    if (!taskFolder) throw new Error('Task folder not found for apply.');
    const review = validateApply(projectPath, taskFolder);
    const patchText = fs.existsSync(review.patchPath) ? fs.readFileSync(review.patchPath, 'utf8') : '';
    const selfPatchReview = reviewSelfUpgradePatch({
      patchText,
      taskId,
      projectKey,
      projectPath,
      rootPath: ROOT,
    });
    if (!body.confirmApply) {
      throw new Error('Apply requires confirmation.');
    }
    if ((!review.ok || !selfPatchReview.ok) && !body.dryRun) {
      throw new Error('Apply validation failed.');
    }
    if (isSelfTarget(projectKey, projectPath, ROOT) && !body.dryRun) {
      const selfUpgrade = getSelfUpgradeState(readJsonSafe(SPATIAL_WORKSPACE_FILE, defaultSpatialWorkspace()) || defaultSpatialWorkspace());
      const preflightMatchesTask = selfUpgrade.preflight?.taskId === taskId;
      if ((!selfUpgrade.preflight?.ok || !preflightMatchesTask) && !body.confirmOverride) {
        throw new Error('Self-upgrade apply requires a passing preflight for this task.');
      }
      updateSelfUpgradeState((state) => ({
        ...state,
        status: 'apply-review',
        taskId,
        targetProjectKey: SELF_TARGET_KEY,
        patchReview: selfPatchReview,
        requiresPermission: body.autoApproved ? 'none' : 'user-confirmation',
      }));
    }
  }

  const command = runCommandForAction(action, body);
  const run = createRun(action, body);
  run.meta.command = [command.cmd, ...command.args].join(' ');
  pushRunEvent(run, { type: 'status', message: `Started ${action}...`, timestamp: nowIso() });
  const result = spawnSyncSafe(command.cmd, command.args, ROOT);
  if (result.stdout) pushRunEvent(run, { type: 'stdout', text: result.stdout, timestamp: nowIso() });
  if (result.stderr) pushRunEvent(run, { type: 'stderr', text: result.stderr, timestamp: nowIso() });
  if (action === 'run') {
    const taskFolder = getTaskFolders().find((folder) => folder.startsWith(taskId.slice(0, 4)));
    if (taskFolder && body.preset) {
      run.artifacts.push(path.join('work', 'tasks', taskFolder, `run_${body.preset}.log`));
      run.artifacts.push(path.join('work', 'tasks', taskFolder, `run_${body.preset}.json`));
    }
  }
  if (action === 'apply' && result.code === 0) {
    const combined = run.logs.map((entry) => entry.text || '').join('');
    const summary = extractApplySummary(combined);
    run.meta = {
      ...run.meta,
      ...summary,
      nextAction: 'Create PR from the generated apply branch.',
    };
    if (isSelfTarget(projectKey, projectPath, ROOT)) {
      updateSelfUpgradeState((state) => ({
        ...state,
        status: 'ready-to-deploy',
        taskId,
        targetProjectKey: SELF_TARGET_KEY,
        apply: {
          status: 'applied',
          ok: true,
          appliedAt: nowIso(),
          branch: summary.branch,
          commit: summary.commit,
          taskId,
        },
        requiresPermission: body.autoApproved ? 'none' : 'user-confirmation',
      }));
    }
  } else if (action === 'apply' && isSelfTarget(projectKey, projectPath, ROOT)) {
    updateSelfUpgradeState((state) => ({
      ...state,
      status: 'blocked',
      taskId,
      apply: {
        ...state.apply,
        status: 'failed',
        ok: false,
        appliedAt: nowIso(),
        taskId,
      },
      requiresPermission: 'none',
    }));
  }
  finishRun(run, result.code || 0);
  const combinedOutput = [result.stdout || '', result.stderr || ''].filter(Boolean).join('\n').trim();
  return {
    ok: (result.code || 0) === 0,
    runId: run.runId,
    exitCode: result.code || 0,
    status: run.status,
    meta: run.meta,
    artifacts: run.artifacts,
    summary: summarizeCommandOutput(combinedOutput || run.logs.map((entry) => entry.message || entry.text || '').join('\n')),
    error: (result.code || 0) === 0 ? null : summarizeCommandOutput(combinedOutput || 'Command failed.'),
  };
}

function getHealthSnapshot() {
  const workspace = readJsonSafe(SPATIAL_WORKSPACE_FILE, defaultSpatialWorkspace()) || defaultSpatialWorkspace();
  const selfUpgrade = getSelfUpgradeState(workspace);
  return {
    ok: true,
    pid: process.pid,
    startedAt: SERVER_STARTED_AT,
    selfUpgrade: {
      status: selfUpgrade.status,
      deploy: selfUpgrade.deploy,
    },
  };
}

function requestSelfUpgradeDeploy({ confirmRestart, simulate = false } = {}) {
  const workspace = readJsonSafe(SPATIAL_WORKSPACE_FILE, defaultSpatialWorkspace()) || defaultSpatialWorkspace();
  const selfUpgrade = getSelfUpgradeState(workspace);

  if (!confirmRestart) {
    return { ok: false, error: 'Deploy requires explicit restart confirmation.', selfUpgrade };
  }
  if (!selfUpgrade.preflight?.ok) {
    return { ok: false, error: 'Deploy requires a passing self-upgrade preflight.', selfUpgrade };
  }
  if (!selfUpgrade.apply?.ok) {
    return { ok: false, error: 'Deploy requires a successful self-upgrade apply.', selfUpgrade };
  }

  const restartingWorkspace = updateSelfUpgradeState((state) => ({
    ...state,
    status: 'deploying',
    deploy: {
      ...state.deploy,
      status: simulate ? 'healthy' : 'restarting',
      requestedAt: nowIso(),
      restartedAt: simulate ? nowIso() : state.deploy?.restartedAt || null,
      health: {
        status: simulate ? 'healthy' : 'restarting',
        pid: process.pid,
        startedAt: SERVER_STARTED_AT,
      },
    },
    requiresPermission: 'none',
  }));

  return {
    ok: true,
    restarting: !simulate,
    deferredRestart: !simulate,
    scheduleRestart: !simulate,
    selfUpgrade: getSelfUpgradeState(restartingWorkspace),
    healthUrl: '/api/health',
  };
}

function runCardDeployPipeline(cardId, { approvedByUser = false } = {}) {
  const workspace = syncTeamBoardWithSelfUpgrade(readSpatialWorkspace());
  const card = findTeamBoardCard(workspace, cardId);
  if (!card) return { ok: false, error: 'Card not found.', workspace };
  if (card.targetProjectKey !== SELF_TARGET_KEY) return { ok: false, error: 'Deploy only runs for ace-self packages.', workspace };
  if (card.deployStatus !== 'queued') return { ok: false, error: 'Card is not queued for deploy.', workspace };

  const deployingWorkspace = mutateTeamBoardCard(workspace, cardId, (currentCard) => ({
    ...currentCard,
    status: 'complete',
    approvalState: currentCard.approvalState === 'approved' ? 'approved' : (approvedByUser ? 'approved' : currentCard.approvalState),
    deployStatus: 'deploying',
    updatedAt: nowIso(),
  }));
  persistBoardWorkspace(deployingWorkspace, 'team-board-deploy-start', { cardId, taskId: card.builderTaskId || card.runnerTaskId || null });

  const result = requestSelfUpgradeDeploy({
    confirmRestart: true,
    simulate: process.env.ACE_DISABLE_SELF_RESTART === '1' || process.env.NODE_ENV === 'test',
  });

  if (!result.ok) {
    const failedWorkspace = mutateTeamBoardCard(readSpatialWorkspace(), cardId, (currentCard) => ({
      ...currentCard,
      status: 'review',
      approvalState: 'pending',
      deployStatus: 'flagged',
      riskLevel: 'high',
      riskReasons: mergeUnique([...(currentCard.riskReasons || []), result.error || 'Deploy failed.']),
      updatedAt: nowIso(),
    }));
    return {
      ok: false,
      error: result.error || 'Deploy failed.',
      workspace: persistBoardWorkspace(failedWorkspace, 'team-board-deploy-failed', { cardId }),
    };
  }

  let nextWorkspace = syncTeamBoardWithSelfUpgrade(readSpatialWorkspace());
  nextWorkspace = mutateTeamBoardCard(nextWorkspace, cardId, (currentCard) => ({
    ...currentCard,
    status: 'complete',
    deployStatus: result.restarting ? 'deploying' : 'deployed',
    lastHealth: result.selfUpgrade?.deploy?.health || currentCard.lastHealth || null,
    updatedAt: nowIso(),
  }));
  const persistedWorkspace = persistBoardWorkspace(nextWorkspace, 'team-board-deploy-complete', {
    cardId,
    restarting: result.restarting,
  });
  if (result.scheduleRestart) {
    setTimeout(scheduleSelfRestart, 120);
  }
  return {
    ok: true,
    result,
    workspace: persistedWorkspace,
  };
}

function pumpAutomatedTeamBoard(workspace = null) {
  if (teamBoardAutomationRunning) {
    return readSpatialWorkspace();
  }
  teamBoardAutomationRunning = true;
  try {
    let nextWorkspace = syncTeamBoardWithSelfUpgrade(workspace || readSpatialWorkspace());
    const board = normalizeTeamBoardState(nextWorkspace);
    const reviewApprovedCard = board.cards.find((card) => card.status === 'review' && card.approvalState === 'approved') || null;
    const activeCard = board.cards.find((card) => card.status === 'active') || null;
    const queuedApplyCard = board.cards.find((card) => card.status === 'complete' && card.applyStatus === 'queued') || null;
    const queuedDeployCard = board.cards.find((card) => card.status === 'complete' && card.deployStatus === 'queued') || null;

    if (reviewApprovedCard) {
      const approvedWorkspace = mutateTeamBoardCard(nextWorkspace, reviewApprovedCard.id, (card) => ({
        ...card,
        status: 'complete',
        applyStatus: 'queued',
        updatedAt: nowIso(),
      }));
      nextWorkspace = persistBoardWorkspace(approvedWorkspace, 'team-board-approval-queued', { cardId: reviewApprovedCard.id });
    } else if (queuedDeployCard) {
      nextWorkspace = runCardDeployPipeline(queuedDeployCard.id).workspace || nextWorkspace;
    } else if (queuedApplyCard) {
      nextWorkspace = runCardApplyPipeline(queuedApplyCard.id).workspace || nextWorkspace;
    } else if (activeCard && activeCard.executionPackage?.status !== 'ready') {
      nextWorkspace = runCardBuilderPipeline(activeCard.id).workspace || nextWorkspace;
    }
    return nextWorkspace;
  } finally {
    teamBoardAutomationRunning = false;
  }
}

app.get('/api/dashboard', (req, res) => {
  const files = {};
  const errors = [];
  for (const file of dashboardFiles) {
    const data = readDashboardFile(file);
    files[file] = data;
    if (data.error) errors.push({ file, error: data.error });
  }
  const state = files['projects/emergence/state.json']?.parsed || {};
  res.json({
    refreshedAt: nowIso(),
    refreshIntervalMs: Number(process.env.DASHBOARD_REFRESH_MS || REFRESH_MS_DEFAULT),
    state,
    files,
    errors,
  });
});

app.get('/api/projects', (req, res) => {
  const projects = loadProjectsMap();
  const rows = Object.entries(projects).map(([key, projectPath]) => ({ key, name: key, path: projectPath }));
  res.json({ projects: rows });
});

app.get('/api/tasks', (req, res) => {
  res.json({ tasks: getTaskFolders() });
});

app.get('/api/presets', (req, res) => {
  const data = readJsonSafe(COMMANDS_FILE, {});
  const descriptions = {
    ui_start: 'Starts the UI with npm start (long-running dev server).',
    ui_node: 'Runs the Node Express UI server directly with node server.js.',
    runner_compile: 'Checks runner Python syntax with py_compile.',
  };
  const presets = Object.entries(data || {}).map(([name, spec]) => ({
    name,
    description: descriptions[name] || 'Runs a configured local command preset.',
    cwd: spec.cwd || '.',
    timeout_s: spec.timeout_s || null,
    cmd: spec.cmd || [],
  }));
  res.json({ presets });
});

app.get('/api/runs', (req, res) => {
  res.json({ runs: getRunsSnapshot() });
});

app.get('/api/health', (req, res) => {
  res.json(getHealthSnapshot());
});

app.post('/api/spatial/self-upgrade/preflight', (req, res) => {
  const body = req.body || {};
  const taskId = String(body.taskId || '').trim();
  const requestedProject = String(body.project || SELF_TARGET_KEY).trim() || SELF_TARGET_KEY;
  if (!taskId) {
    return res.status(400).json({ error: 'taskId is required for self-upgrade preflight.' });
  }

  const { projectKey, projectPath } = resolveProjectTarget(requestedProject);
  if (!isSelfTarget(projectKey, projectPath, ROOT)) {
    return res.status(400).json({ error: 'Self-upgrade preflight only runs against the ACE self target.' });
  }

  const taskFolder = getTaskFolders().find((t) => t.startsWith(taskId.slice(0, 4)));
  if (!taskFolder) {
    return res.status(400).json({ error: 'Task folder not found for self-upgrade preflight.' });
  }

  const validation = validateApply(projectPath, taskFolder);
  const patchText = fs.existsSync(validation.patchPath) ? fs.readFileSync(validation.patchPath, 'utf8') : '';
  const patchReview = reviewSelfUpgradePatch({
    patchText,
    taskId,
    projectKey,
    projectPath,
    rootPath: ROOT,
  });
  const preflight = runSelfUpgradePreflight({
    taskId,
    projectKey,
    projectPath,
    validation,
    patchReview,
  });
  const workspace = updateSelfUpgradeState((state) => ({
    ...state,
    status: preflight.ok ? 'ready-to-apply' : 'blocked',
    taskId,
    targetProjectKey: SELF_TARGET_KEY,
    patchReview,
    preflight,
    deploy: preflight.ok ? state.deploy : createDefaultSelfUpgradeState({ serverStartedAt: SERVER_STARTED_AT, pid: process.pid }).deploy,
    requiresPermission: preflight.ok ? 'user-confirmation' : 'none',
  }));
  res.json({
    ok: preflight.ok,
    selfUpgrade: getSelfUpgradeState(workspace),
  });
});

app.post('/api/spatial/self-upgrade/deploy', (req, res) => {
  const body = req.body || {};
  const result = requestSelfUpgradeDeploy({
    confirmRestart: Boolean(body.confirmRestart),
    simulate: body.simulate === true || process.env.ACE_DISABLE_SELF_RESTART === '1' || process.env.NODE_ENV === 'test',
  });
  if (!result.ok) {
    return res.status(400).json({
      error: result.error,
      selfUpgrade: result.selfUpgrade,
    });
  }
  res.json(result);
  if (result.scheduleRestart) {
    setTimeout(scheduleSelfRestart, 80);
  }
});

app.post('/api/execute', (req, res) => {
  const body = req.body || {};
  const action = String(body.action || '').toLowerCase();
  const project = String(body.project || '').trim();
  const taskId = String(body.taskId || '').trim();

  if (!['scan', 'manage', 'build', 'run', 'apply'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action.' });
  }
  if (!project || !taskId) {
    return res.status(400).json({ error: 'project and taskId are required.' });
  }

  const { projectKey, projectPath } = resolveProjectTarget(project);

  if (action === 'apply') {
    const taskFolder = getTaskFolders().find((t) => t.startsWith(taskId.slice(0, 4)));
    if (!taskFolder) {
      return res.status(400).json({ error: 'Task folder not found for apply.' });
    }
    const review = validateApply(projectPath, taskFolder);
    const patchText = fs.existsSync(review.patchPath) ? fs.readFileSync(review.patchPath, 'utf8') : '';
    const selfPatchReview = reviewSelfUpgradePatch({
      patchText,
      taskId,
      projectKey,
      projectPath,
      rootPath: ROOT,
    });
    if (body.previewOnly) {
      const workspace = readJsonSafe(SPATIAL_WORKSPACE_FILE, defaultSpatialWorkspace()) || defaultSpatialWorkspace();
      return res.json({
        ok: review.ok && selfPatchReview.ok,
        review,
        selfUpgrade: {
          patchReview: selfPatchReview,
          preflight: getSelfUpgradeState(workspace).preflight,
        },
      });
    }
    if (!body.confirmApply) {
      return res.status(400).json({ error: 'Apply requires confirmation.', review, selfPatchReview });
    }
    if ((!review.ok || !selfPatchReview.ok) && !body.dryRun) {
      return res.status(400).json({ error: 'Apply validation failed.', review, selfPatchReview });
    }
    if (isSelfTarget(projectKey, projectPath, ROOT) && !body.dryRun) {
      const selfUpgrade = getSelfUpgradeState(readJsonSafe(SPATIAL_WORKSPACE_FILE, defaultSpatialWorkspace()) || defaultSpatialWorkspace());
      const preflightMatchesTask = selfUpgrade.preflight?.taskId === taskId;
      if ((!selfUpgrade.preflight?.ok || !preflightMatchesTask) && !body.confirmOverride) {
        return res.status(400).json({
          error: 'Self-upgrade apply requires a passing preflight for this task.',
          review,
          selfPatchReview,
          selfUpgrade,
        });
      }
      updateSelfUpgradeState((state) => ({
        ...state,
        status: 'apply-review',
        taskId,
        targetProjectKey: SELF_TARGET_KEY,
        patchReview: selfPatchReview,
        requiresPermission: 'user-confirmation',
      }));
    }
  }

  let command;
  try {
    command = runCommandForAction(action, body);
  } catch (err) {
    return res.status(400).json({ error: String(err.message || err) });
  }

  const run = createRun(action, body);
  const child = spawn(command.cmd, command.args, { cwd: ROOT, windowsHide: true });
  run.meta.command = [command.cmd, ...command.args].join(' ');

  pushRunEvent(run, { type: 'status', message: `Started ${action}...`, timestamp: nowIso() });

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    pushRunEvent(run, { type: 'stdout', text, timestamp: nowIso() });
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    pushRunEvent(run, { type: 'stderr', text, timestamp: nowIso() });
  });

  child.on('close', (code) => {
    if (action === 'run') {
      const taskFolder = getTaskFolders().find((t) => t.startsWith(taskId.slice(0, 4)));
      if (taskFolder && body.preset) {
        run.artifacts.push(path.join('work', 'tasks', taskFolder, `run_${body.preset}.log`));
        run.artifacts.push(path.join('work', 'tasks', taskFolder, `run_${body.preset}.json`));
      }
    }
    if (action === 'apply' && code === 0) {
      const combined = run.logs.map((l) => l.text || '').join('');
      const summary = extractApplySummary(combined);
      run.meta = {
        ...run.meta,
        ...summary,
        nextAction: 'Create PR from the generated apply branch.',
      };
      if (isSelfTarget(projectKey, projectPath, ROOT)) {
        updateSelfUpgradeState((state) => ({
          ...state,
          status: 'ready-to-deploy',
          taskId,
          targetProjectKey: SELF_TARGET_KEY,
          apply: {
            status: 'applied',
            ok: true,
            appliedAt: nowIso(),
            branch: summary.branch,
            commit: summary.commit,
            taskId,
          },
          requiresPermission: 'user-confirmation',
        }));
      }
    } else if (action === 'apply' && isSelfTarget(projectKey, projectPath, ROOT)) {
      updateSelfUpgradeState((state) => ({
        ...state,
        status: 'blocked',
        taskId,
        apply: {
          ...state.apply,
          status: 'failed',
          ok: false,
          appliedAt: nowIso(),
          taskId,
        },
        requiresPermission: 'none',
      }));
    }
    finishRun(run, code || 0);
  });

  child.on('error', (err) => {
    pushRunEvent(run, { type: 'stderr', text: String(err), timestamp: nowIso() });
    finishRun(run, 1);
  });

  res.json({ ok: true, runId: run.runId });
});

app.get('/api/stream/:runId', (req, res) => {
  const run = runStore.get(req.params.runId);
  if (!run) return res.status(404).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  for (const event of run.logs) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  if (run.status === 'running') {
    run.listeners.add(res);
  } else {
    res.write(`data: ${JSON.stringify({ type: 'done', status: run.status, exitCode: run.exitCode, durationMs: run.durationMs, meta: run.meta, artifacts: run.artifacts })}\n\n`);
    res.end();
  }

  req.on('close', () => run.listeners.delete(res));
});

app.post('/api/open-task-folder', (req, res) => {
  const taskId = String((req.body || {}).taskId || '').trim();
  const folder = getTaskFolders().find((t) => t.startsWith(taskId.slice(0, 4)));
  if (!folder) return res.status(404).json({ error: 'Task folder not found.' });
  const full = path.join(TASKS_DIR, folder);

  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', full], { detached: true, windowsHide: true });
    } else if (process.platform === 'darwin') {
      spawn('open', [full], { detached: true });
    } else {
      spawn('xdg-open', [full], { detached: true });
    }
    res.json({ ok: true, path: full });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/add/idea', (req, res) => {
  const text = String((req.body || {}).text || '').trim();
  if (!text) return res.status(400).json({ error: 'Idea text is required.' });
  const target = path.join(ROOT, 'idea.txt');
  fs.appendFileSync(target, `[${nowIso()}] ${text}${os.EOL}`, 'utf8');
  res.json({ ok: true, path: target });
});

app.post('/api/add/task', (req, res) => {
  const title = String((req.body || {}).title || '').trim();
  if (!title) return res.status(400).json({ error: 'Task title is required.' });
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'task';
  const tasks = getTaskFolders();
  const last = tasks.length ? Number(tasks[tasks.length - 1].slice(0, 4)) : 0;
  const id = String(last + 1).padStart(4, '0');
  const folder = `${id}-${slug}`;
  const full = path.join(TASKS_DIR, folder);
  fs.mkdirSync(full, { recursive: true });
  fs.writeFileSync(path.join(full, 'context.md'), `# Task ${id}: ${title}\n\n## Context\n- Describe intent here.\n`, 'utf8');
  fs.writeFileSync(path.join(full, 'patch.diff'), '', 'utf8');
  res.json({ ok: true, taskId: id, folder });
});

app.post('/api/add/project', (req, res) => {
  const name = String((req.body || {}).name || '').trim();
  const projectPath = String((req.body || {}).path || '').trim();
  if (!name || !projectPath) return res.status(400).json({ error: 'name and path are required.' });
  if (!fs.existsSync(projectPath)) return res.status(400).json({ error: 'Project path does not exist.' });

  const projects = loadProjectsMap();
  projects[name] = projectPath;
  fs.writeFileSync(PROJECTS_FILE, `${JSON.stringify(projects, null, 2)}\n`, 'utf8');
  res.json({ ok: true, project: { key: name, path: projectPath } });
});

app.get('/api/spatial/workspace', (req, res) => {
  const workspace = normalizeSpatialWorkspaceShape(refreshSpatialOrchestrator({ workspace: pumpAutomatedTeamBoard() }));
  workspace.graph = workspace.graph || { nodes: [], edges: [] };
  workspace.graphs = workspace.graphs || normalizeGraphBundle(workspace);
  workspace.sketches = Array.isArray(workspace.sketches) ? workspace.sketches : [];
  workspace.annotations = Array.isArray(workspace.annotations) ? workspace.annotations : [];
  workspace.architectureMemory = workspace.architectureMemory || {};
  workspace.agentComments = workspace.agentComments || {};
  workspace.studio = workspace.studio || {};
  workspace.rsg = workspace.rsg || buildRsgState(workspace);
  res.json(workspace);
});

app.get('/api/spatial/runtime', (req, res) => {
  res.json(refreshSpatialRuntime({ persist: true }));
});

app.post('/api/spatial/team-board/action', (req, res) => {
  const body = req.body || {};
  const action = String(body.action || '').trim();
  const cardId = String(body.cardId || '').trim();
  if (!action || !cardId) {
    return res.status(400).json({ error: 'action and cardId are required.' });
  }

  const workspace = readSpatialWorkspace();
  const card = findTeamBoardCard(workspace, cardId);
  if (!card) {
    return res.status(404).json({ error: 'Team board card not found.' });
  }

  let nextWorkspace = workspace;
  if (action === 'approve-apply') {
    nextWorkspace = mutateTeamBoardCard(workspace, cardId, (currentCard) => ({
      ...currentCard,
      status: 'review',
      approvalState: 'approved',
      updatedAt: nowIso(),
    }));
    nextWorkspace = persistBoardWorkspace(nextWorkspace, 'team-board-approved', { cardId, title: card.title });
    nextWorkspace = pumpAutomatedTeamBoard(nextWorkspace);
  } else if (action === 'reject-to-builder') {
    nextWorkspace = mutateTeamBoardCard(workspace, cardId, (currentCard) => ({
      ...currentCard,
      status: 'active',
      approvalState: 'rejected',
      applyStatus: 'idle',
      deployStatus: 'idle',
      executionPackage: {
        ...(currentCard.executionPackage || {}),
        status: 'idle',
        summary: '',
      },
      updatedAt: nowIso(),
    }));
    nextWorkspace = persistBoardWorkspace(nextWorkspace, 'team-board-rejected', { cardId, title: card.title });
  } else if (action === 'bin') {
    nextWorkspace = mutateTeamBoardCard(workspace, cardId, (currentCard) => ({
      ...currentCard,
      status: 'binned',
      approvalState: 'none',
      applyStatus: 'idle',
      deployStatus: 'idle',
      updatedAt: nowIso(),
    }));
    nextWorkspace = persistBoardWorkspace(nextWorkspace, 'team-board-binned', { cardId, title: card.title });
  } else if (action === 'start-builder') {
    nextWorkspace = mutateTeamBoardCard(workspace, cardId, (currentCard) => ({
      ...currentCard,
      status: 'active',
      approvalState: 'none',
      updatedAt: nowIso(),
    }));
    nextWorkspace = persistBoardWorkspace(nextWorkspace, 'team-board-builder-manual', { cardId, title: card.title });
    nextWorkspace = pumpAutomatedTeamBoard(nextWorkspace);
  } else {
    return res.status(400).json({ error: 'Unsupported team board action.' });
  }

  const nextCard = findTeamBoardCard(nextWorkspace, cardId);
  const touchesStudioUi = (nextCard?.executionPackage?.changedFiles || []).some((file) => String(file || '').startsWith('ui/'));
  const shouldAutoRunQA = action === 'approve-apply'
    && nextCard?.targetProjectKey === SELF_TARGET_KEY
    && touchesStudioUi;
  if (shouldAutoRunQA) {
    queueAutoBrowserQARun({
      baseUrl: getLocalBaseUrl(req),
      scenario: 'layout-pass',
      mode: 'interactive',
      trigger: 'team-board-ui-mutation',
      prompt: nextCard.title || card.title,
      linked: { cardId: nextCard.id },
    });
  }

  res.json({
    ok: true,
    runtime: buildSpatialRuntimePayload(nextWorkspace),
  });
});

app.put('/api/spatial/workspace', (req, res) => {
  ensureSpatialStorage();
  const body = req.body || {};
  const nextWorkspace = advanceOrchestratorWorkspace(normalizeSpatialWorkspaceShape(body), {
    dashboardState: getDashboardStateSnapshot(),
    runs: getRunsSnapshot(),
  });
  writeJson(SPATIAL_WORKSPACE_FILE, nextWorkspace);
  const automatedWorkspace = pumpAutomatedTeamBoard(nextWorkspace);
  appendArchitectureHistory({
    at: nowIso(),
    type: 'workspace-save',
    summary: {
      nodes: automatedWorkspace.graph?.nodes?.length || 0,
      edges: automatedWorkspace.graph?.edges?.length || 0,
      versions: automatedWorkspace.architectureMemory?.versions?.slice(-1) || [],
      sketches: automatedWorkspace.sketches?.length || 0,
      annotations: automatedWorkspace.annotations?.length || 0,
    },
  });
  res.json({ ok: true, workspace: automatedWorkspace });
});

app.get('/api/spatial/history', (req, res) => {
  ensureSpatialStorage();
  res.json({ history: readJsonSafe(SPATIAL_HISTORY_FILE, []) || [] });
});

app.get('/api/spatial/debug/throughput', (req, res) => {
  const sessions = listThroughputSessions(ROOT);
  res.json({
    sessions: sessions.slice(0, 12).map((session) => summarizeSession(session)),
    latestSession: sessions[0] || null,
  });
});

app.get('/api/spatial/debug/throughput/:sessionId', (req, res) => {
  const session = readThroughputSession(ROOT, req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Throughput session not found.' });
  res.json({ session });
});

app.get('/api/spatial/qa/runs', (req, res) => {
  const runs = listQARuns(ROOT);
  res.json({
    latestRun: summarizeQARun(runs[0] || null),
    runs: runs.slice(0, 12).map((run) => summarizeQARun(run)),
  });
});

app.get('/api/spatial/qa/runs/:runId', (req, res) => {
  const run = readQARun(ROOT, req.params.runId);
  if (!run) return res.status(404).json({ error: 'QA run not found.' });
  res.json({ run });
});

app.get('/api/spatial/qa/runs/:runId/artifacts/:artifactName', (req, res) => {
  const run = readQARun(ROOT, req.params.runId);
  if (!run) return res.status(404).json({ error: 'QA run not found.' });
  const artifactName = String(req.params.artifactName || '');
  const artifactEntries = [
    ...(run.artifacts?.screenshots || []),
    run.artifacts?.domSnapshot,
    run.artifacts?.consoleLog,
    run.artifacts?.networkSummary,
    run.artifacts?.runtimeSnapshot,
    run.artifacts?.layoutFindings,
  ].filter(Boolean);
  const artifact = artifactEntries.find((entry) => entry.name === artifactName);
  if (!artifact?.path || !fs.existsSync(artifact.path)) {
    return res.status(404).json({ error: 'QA artifact not found.' });
  }
  res.sendFile(artifact.path);
});

app.post('/api/spatial/qa/run', async (req, res) => {
  const body = req.body || {};
  try {
    const run = await startBrowserQARun({
      baseUrl: getLocalBaseUrl(req),
      scenario: String(body.scenario || 'layout-pass').trim() || 'layout-pass',
      mode: String(body.mode || 'interactive').trim() || 'interactive',
      trigger: String(body.trigger || 'manual').trim() || 'manual',
      prompt: String(body.prompt || '').trim(),
      actions: Array.isArray(body.actions) ? body.actions : [],
      linked: typeof body.linked === 'object' && body.linked ? body.linked : {},
    });
    res.json({
      ok: run.verdict !== 'failed',
      run,
      runtime: refreshSpatialRuntime({ persist: true }),
    });
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.post('/api/spatial/debug/throughput', async (req, res) => {
  const body = req.body || {};
  const prompt = String(body.prompt || 'I think we should add a desk to the studio for a QA agent').trim();
  const mode = String(body.mode || 'live').toLowerCase() === 'fixture' ? 'fixture' : 'live';
  const targetProjectKey = String(body.project || SELF_TARGET_KEY).trim() || SELF_TARGET_KEY;
  const shouldRunQA = body.runQa !== false;
  const simulateDeploy = body.simulate === true || mode === 'fixture' || process.env.ACE_DISABLE_SELF_RESTART === '1' || process.env.NODE_ENV === 'test';
  let shouldRestartAfterResponse = false;
  try {
    let session = await runThroughputSession({
      rootPath: ROOT,
      prompt,
      targetProjectKey,
      mode,
      confirmDeploy: body.confirmDeploy !== false,
      simulateDeploy,
      loadWorkspace: () => readJsonSafe(SPATIAL_WORKSPACE_FILE, defaultSpatialWorkspace()) || defaultSpatialWorkspace(),
      persistWorkspace: (workspace) => persistSpatialWorkspace(workspace),
      appendHistory: appendArchitectureHistory,
      readHistory: () => readJsonSafe(SPATIAL_HISTORY_FILE, []) || [],
      analyzeIntent: (text, workspace) => analyzeIntentWithProjectContext(text, workspace),
      getDashboardState: () => getDashboardStateSnapshot(),
      createRunnerTask: ({ title, prompt: nextPrompt, handoff, session }) => createRunnerTaskFolder({
        title,
        prompt: nextPrompt,
        handoff,
        sessionId: session.id,
      }),
      executeActionSync: (action, payload) => executeActionSync(action, payload),
      runSelfUpgradePreflight: ({ taskId, project }) => {
        const requestedProject = String(project || SELF_TARGET_KEY).trim() || SELF_TARGET_KEY;
        const { projectKey, projectPath } = resolveProjectTarget(requestedProject);
        const taskFolder = getTaskFolders().find((folder) => folder.startsWith(taskId.slice(0, 4)));
        if (!taskFolder) {
          return { ok: false, error: 'Task folder not found for self-upgrade preflight.' };
        }
        const validation = validateApply(projectPath, taskFolder);
        const patchText = fs.existsSync(validation.patchPath) ? fs.readFileSync(validation.patchPath, 'utf8') : '';
        const patchReview = reviewSelfUpgradePatch({
          patchText,
          taskId,
          projectKey,
          projectPath,
          rootPath: ROOT,
        });
        const preflight = runSelfUpgradePreflight({
          taskId,
          projectKey,
          projectPath,
          validation,
          patchReview,
        });
        const workspace = updateSelfUpgradeState((state) => ({
          ...state,
          status: preflight.ok ? 'ready-to-apply' : 'blocked',
          taskId,
          targetProjectKey: SELF_TARGET_KEY,
          patchReview,
          preflight,
          deploy: preflight.ok ? state.deploy : createDefaultSelfUpgradeState({ serverStartedAt: SERVER_STARTED_AT, pid: process.pid }).deploy,
          requiresPermission: preflight.ok ? 'user-confirmation' : 'none',
        }));
        return {
          ok: preflight.ok,
          selfUpgrade: getSelfUpgradeState(workspace),
        };
      },
      deploySelfUpgrade: ({ confirmRestart, simulate }) => {
        const workspace = readJsonSafe(SPATIAL_WORKSPACE_FILE, defaultSpatialWorkspace()) || defaultSpatialWorkspace();
        const selfUpgrade = getSelfUpgradeState(workspace);
        if (!confirmRestart) {
          return { ok: false, error: 'Deploy requires explicit restart confirmation.', selfUpgrade };
        }
        if (!selfUpgrade.preflight?.ok) {
          return { ok: false, error: 'Deploy requires a passing self-upgrade preflight.', selfUpgrade };
        }
        if (!selfUpgrade.apply?.ok) {
          return { ok: false, error: 'Deploy requires a successful self-upgrade apply.', selfUpgrade };
        }
        const restartingWorkspace = updateSelfUpgradeState((state) => ({
          ...state,
          status: 'deploying',
          deploy: {
            ...state.deploy,
            status: simulate ? 'healthy' : 'restarting',
            requestedAt: nowIso(),
            restartedAt: simulate ? nowIso() : state.deploy?.restartedAt || null,
            health: {
              status: simulate ? 'healthy' : 'restarting',
              pid: process.pid,
              startedAt: SERVER_STARTED_AT,
            },
          },
          requiresPermission: 'none',
        }));
        shouldRestartAfterResponse = !simulate;
        return {
          ok: true,
          restarting: !simulate,
          deferredRestart: !simulate,
          selfUpgrade: getSelfUpgradeState(restartingWorkspace),
          healthUrl: '/api/health',
        };
      },
      getRunsSnapshot: () => getRunsSnapshot(),
      getHealthSnapshot: () => getHealthSnapshot(),
    });
    let qaRun = null;
    if (shouldRunQA) {
      qaRun = await startBrowserQARun({
        baseUrl: getLocalBaseUrl(req),
        scenario: 'throughput-visual-pass',
        mode: 'interactive',
        trigger: 'throughput-debug',
        prompt,
        linked: { throughputSessionId: session.id },
      });
      if (qaRun?.id) {
        session = updateThroughputSession(ROOT, session.id, (current) => ({
          ...current,
          qaRunId: qaRun.id,
        })) || session;
      }
    }
    res.json({
      ok: true,
      session,
      qaRun: qaRun ? summarizeQARun(qaRun) : null,
      runtime: refreshSpatialRuntime({ persist: true }),
    });
    if (shouldRestartAfterResponse && session?.stages?.find((stage) => stage.id === 'deploy')?.verdict === 'pass') {
      setTimeout(scheduleSelfRestart, 120);
    }
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

const INTENT_STOPWORDS = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'have', 'will', 'about', 'would', 'should', 'could', 'there', 'their', 'them', 'then', 'than', 'when', 'what', 'where', 'while', 'were', 'been', 'being', 'also', 'just', 'over', 'under', 'onto', 'need', 'needs', 'want', 'wants', 'able', 'make', 'lets']);

function tokenizeIntentText(text) {
  return [...new Set((String(text || '').toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) || []).filter((token) => !INTENT_STOPWORDS.has(token)))];
}

function topKeywords(text, limit = 24) {
  const counts = new Map();
  for (const token of tokenizeIntentText(text)) counts.set(token, (counts.get(token) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([token]) => token);
}

function inferIntentLabels(text) {
  const value = String(text || '').toLowerCase();
  const labels = [];
  if (/context|brief|constraint|intent|memory/.test(value)) labels.push('context');
  if (/plan|task|roadmap|sequence|todo|queue/.test(value)) labels.push('plan');
  if (/build|fix|implement|patch|wire|connect|ship|code|module|service/.test(value)) labels.push('execution');
  if (/ui|ux|canvas|studio|node|overlay|panel/.test(value)) labels.push('ux');
  if (/review|guardrail|architect|rule|boundary|ace/.test(value)) labels.push('governance');
  return labels.length ? labels : ['general'];
}

function inferIntentRole(text, labels) {
  const value = String(text || '').toLowerCase();
  if (/rule|constraint|must|never|guardrail/.test(value)) return 'constraint';
  if (/api|service|module|architecture|system/.test(value)) return 'module';
  if (/file|patch|fix|implement|build|wire/.test(value) || labels.includes('execution')) return 'task';
  if (/ui|ux|canvas|studio|overlay/.test(value) || labels.includes('ux')) return 'ux';
  return 'thought';
}

function buildIntentProjectContext() {
  ensureSpatialStorage();
  const workspace = readJsonSafe(SPATIAL_WORKSPACE_FILE, { graph: { nodes: [], edges: [] }, architectureMemory: {} }) || {};
  const state = readDashboardFile('projects/emergence/state.json').parsed || {};
  const plan = readDashboardFile('projects/emergence/plan.md').content || '';
  const brain = readDashboardFile('projects/emergence/project_brain.md').content || '';
  const roadmap = readDashboardFile('projects/emergence/roadmap.md').content || '';
  const contextNode = (workspace.graph?.nodes || []).find((node) => node.metadata?.agentId === 'context-manager');
  const contextText = [state.current_focus || '', ...(state.next_actions || []), ...(state.blockers || []), plan, brain, roadmap, contextNode?.content || ''].join(' ');
  return {
    currentFocus: state.current_focus || '',
    blockers: state.blockers || [],
    keywords: topKeywords(contextText, 28),
  };
}

function buildIntentTasks(text) {
  const fragments = String(text || '')
    .split(/[\n,.!?;:]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const actionFirst = fragments.filter((entry) => /\b(build|fix|create|implement|wire|connect|review|scan|plan|design|update|remove|delete|disable)\b/i.test(entry));
  const chosen = [...actionFirst, ...fragments].slice(0, 4);
  return chosen.length ? chosen : ['analyze requirements', 'decompose tasks', 'prepare implementation plan'];
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function analyzeSpatialIntent(text) {
  const source = String(text || '').trim();
  const project = buildIntentProjectContext();
  const labels = inferIntentLabels(source);
  const role = inferIntentRole(source, labels);
  const tokens = tokenizeIntentText(source);
  const projectTerms = new Set(project.keywords);
  const matchedTerms = tokens.filter((token) => projectTerms.has(token));
  const actionMatches = (source.match(/\b(build|fix|create|implement|wire|connect|review|scan|plan|design|update|remove|delete|disable|support)\b/gi) || []).length;
  const constraintMatches = (source.match(/\b(must|should|avoid|blocker|needs|review|constraint|guardrail|boundary)\b/gi) || []).length;
  const architectureMatches = (source.match(/\b(agent|context|planner|executor|memory|studio|canvas|node|backend|frontend|api|service|module|architecture|overlay)\b/gi) || []).length;
  const sentences = source.split(/[.!?\n]+/).map((entry) => entry.trim()).filter(Boolean);
  const criteria = [
    {
      id: 'project-alignment',
      label: 'Project alignment',
      score: clamp01((matchedTerms.length + ((project.currentFocus && source.toLowerCase().includes(String(project.currentFocus).toLowerCase())) ? 2 : 0)) / 6),
      reason: matchedTerms.length ? `Matched project terms: ${matchedTerms.slice(0, 5).join(', ')}` : 'Few direct overlaps with current project context.',
    },
    {
      id: 'actionability',
      label: 'Actionability',
      score: clamp01((actionMatches + buildIntentTasks(source).length) / 6),
      reason: actionMatches ? `Detected ${actionMatches} implementation/planning verb signals.` : 'Input reads more like a note than a concrete action.',
    },
    {
      id: 'architecture-fit',
      label: 'Architecture fit',
      score: clamp01((architectureMatches + labels.length) / 7),
      reason: architectureMatches ? 'References ACE system structure, agents, or implementation surfaces.' : 'Little direct architecture language found.',
    },
    {
      id: 'constraint-coverage',
      label: 'Constraint coverage',
      score: clamp01((constraintMatches + (project.blockers.length ? 1 : 0)) / 5),
      reason: constraintMatches ? 'Includes guardrails, blockers, or review-oriented language.' : 'No clear constraints or review gates were stated.',
    },
    {
      id: 'clarity',
      label: 'Clarity',
      score: clamp01((Math.min(tokens.length, 14) / 14 + Math.min(sentences.length, 3) / 3) / 2),
      reason: tokens.length >= 6 ? 'Input includes enough detail to classify intent reliably.' : 'Short input limits confidence.',
    },
  ];
  const confidence = Number((criteria.reduce((sum, item) => sum + item.score, 0) / criteria.length).toFixed(2));
  const tasks = buildIntentTasks(source);
  const summary = source.length > 140 ? `${source.slice(0, 137).trim()}...` : (source || 'Intent capture is empty.');
  return {
    agent: {
      id: 'context-manager',
      name: 'Context Manager',
      criteriaVersion: 'ace-intent-v1',
      remit: 'Judge incoming notes against ACE project context and surface confidence-scored intent for the frontend.',
    },
    summary,
    confidence,
    criteria,
    tasks,
    classification: {
      role,
      labels,
    },
    metrics: {
      tokenCount: tokens.length,
      sentenceCount: sentences.length,
      matchedProjectTerms: matchedTerms,
      actionSignals: actionMatches,
      architectureSignals: architectureMatches,
      constraintSignals: constraintMatches,
    },
    projectContext: {
      currentFocus: project.currentFocus,
      blockers: project.blockers.slice(0, 3),
      matchedTerms: matchedTerms.slice(0, 8),
      referenceKeywords: project.keywords.slice(0, 8),
    },
    judgedAt: nowIso(),
  };
}

app.post('/api/spatial/intent', (req, res) => {
  const workspace = readJsonSafe(SPATIAL_WORKSPACE_FILE, defaultSpatialWorkspace()) || defaultSpatialWorkspace();
  const report = analyzeIntentWithProjectContext((req.body || {}).text || '', workspace);
  res.json(report);
});

app.post('/api/spatial/mutations/preview', (req, res) => {
  const mutations = (req.body || {}).mutations || [];
  const summary = mutations.map((m) => {
    if (m.type === 'create_node') return `- new ${m.node.type}: ${m.node.content}`;
    if (m.type === 'modify_node') return `- modify node ${m.id}`;
    if (m.type === 'create_edge') return `- dependency ${m.edge.source} -> ${m.edge.target}`;
    return `- ${m.type}`;
  });
  res.json({ ok: true, summary });
});

app.post('/api/spatial/mutations/apply', (req, res) => {
  const mutations = (req.body || {}).mutations || [];
  appendArchitectureHistory({ at: nowIso(), type: 'mutation-apply', count: mutations.length });
  res.json({ ok: true, applied: mutations.length });
});

setInterval(() => {
  try {
    const workspace = pumpAutomatedTeamBoard();
    refreshSpatialOrchestrator({ persist: true, workspace });
  } catch (error) {
    console.warn(`[${nowIso()}] spatial orchestrator refresh failed: ${error.message}`);
  }
}, 4000);

markServerHealthyOnBoot();
reconcilePendingThroughputSessions({
  rootPath: ROOT,
  loadWorkspace: () => readJsonSafe(SPATIAL_WORKSPACE_FILE, defaultSpatialWorkspace()) || defaultSpatialWorkspace(),
  persistWorkspace: (workspace) => persistSpatialWorkspace(workspace),
  getRunsSnapshot: () => getRunsSnapshot(),
  getHealthSnapshot: () => getHealthSnapshot(),
}).catch((error) => {
  console.warn(`[${nowIso()}] throughput session reconcile failed: ${error.message}`);
});

app.listen(port, () => {
  console.log(`AI Core Engine UI running at http://localhost:${port}`);
});

