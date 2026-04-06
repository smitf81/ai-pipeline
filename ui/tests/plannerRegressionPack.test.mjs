import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function writeFile(rootPath, relativePath, content) {
  const targetPath = path.join(rootPath, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf8');
}

function seedBrain(rootPath) {
  writeFile(rootPath, 'brain/emergence/project_brain.md', '# Brain\n\n## Current Focus\n- Planner regression pack\n');
  writeFile(rootPath, 'brain/emergence/roadmap.md', '# Roadmap\n\n## Now\n- Freeze planner desk contracts\n');
  writeFile(rootPath, 'brain/emergence/plan.md', '# Plan\n\n## Goal\n- Make planner behavior testable\n');
  writeFile(rootPath, 'brain/emergence/tasks.md', '# Tasks\n- Protect planner identity\n- Protect planner output contract\n');
  writeFile(rootPath, 'brain/emergence/decisions.md', '# Decisions\n- Planner emits queued handoffs, not loose prose\n');
  writeFile(rootPath, 'brain/emergence/changelog.md', '# Changelog\n- Planner regression pack added\n');
}

function seedAgents(rootPath) {
  writeFile(rootPath, 'agents/planner/agent.json', JSON.stringify({
    id: 'planner',
    name: 'Planner',
    deskId: 'planner',
    runtime: 'ollama-json',
    backend: 'ollama',
    model: 'mistral:latest',
    host: 'http://127.0.0.1:11434',
    timeoutMs: 30000,
    autoRun: true,
  }, null, 2));
  writeFile(rootPath, 'agents/planner/prompt.md', 'Planner prompt');
}

function createWorkspace() {
  return {
    graph: { nodes: [], edges: [] },
    graphs: { system: { nodes: [], edges: [] }, world: { nodes: [], edges: [] } },
    intentState: {
      registry: {
        currentIntentId: null,
        latestIntentId: null,
        byId: {},
        records: [],
      },
      currentIntentId: null,
      summary: '',
      status: 'idle',
    },
    studio: {
      layout: {
        organization: {
          planner: {
            deskId: 'planner',
            roleId: 'planner',
            agentId: 'planner',
            departmentId: 'dept-delivery',
            modelProfileId: 'model-profile.planner-default',
            assignedAgentIds: ['planner'],
            live: true,
          },
          desks: {
            planner: {
              id: 'planner',
              label: 'Planner',
              departmentId: 'dept-delivery',
              assignedAgentIds: ['planner'],
              localState: 'ready',
            },
          },
          agents: {
            planner: {
              id: 'planner',
              deskId: 'planner',
              departmentId: 'dept-delivery',
              modelProfileId: 'model-profile.planner-default',
            },
          },
        },
      },
      handoffs: {},
      teamBoard: { cards: [], summary: {} },
      agentWorkers: {
        planner: {
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
        },
      },
      ctoOverrides: {
        version: '1',
        updatedAt: '2026-03-23T07:05:00.000Z',
        entries: [
          {
            overrideId: 'override_force_plan_1',
            kind: 'force-plan-generation',
            requestedBy: 'cto',
            reason: 'Force planner generation for the smoke pack.',
            target: { deskId: 'planner', handoffId: 'handoff_regression_1' },
            canonicalTruth: { staffing: { state: 'absent' } },
            provenance: {
              sourceType: 'cto-chat',
              sourceRef: 'chat-regression',
            },
          },
        ],
      },
    },
  };
}

function createClassList() {
  const classes = new Set();
  return {
    add: (...items) => items.forEach((item) => classes.add(item)),
    remove: (...items) => items.forEach((item) => classes.delete(item)),
    contains: (item) => classes.has(item),
  };
}

function createElement(tagName = 'div') {
  return {
    tagName: tagName.toUpperCase(),
    id: '',
    style: {},
    dataset: {},
    classList: createClassList(),
    children: [],
    textContent: '',
    innerHTML: '',
    value: '',
    disabled: false,
    scrollTop: 0,
    appendChild(child) {
      this.children.push(child);
      return child;
    },
  };
}

function createSandbox(url, fetchMap) {
  const elements = new Map();
  const listeners = {};
  const body = createElement('body');
  const documentElement = createElement('html');
  const document = {
    body,
    documentElement,
    activeElement: null,
    addEventListener(type, callback) {
      listeners[type] = callback;
    },
    createElement,
    getElementById(id) {
      if (!elements.has(id)) {
        const element = createElement('div');
        element.id = id;
        elements.set(id, element);
      }
      return elements.get(id);
    },
  };
  const fetch = async (requestUrl, options = {}) => {
    const key = String(requestUrl);
    const payload = fetchMap[key];
    if (!payload) {
      throw new Error(`unexpected fetch: ${key}`);
    }
    const resolved = typeof payload === 'function' ? await payload({ url: key, options }) : payload;
    const status = Number.isFinite(Number(resolved?.status)) ? Number(resolved.status) : 200;
    const responseBody = resolved && Object.prototype.hasOwnProperty.call(resolved, 'body') ? resolved.body : resolved;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => responseBody,
    };
  };
  const sandbox = {
    window: {
      location: { href: url },
      prompt: () => '',
      navigator: { clipboard: { writeText: async () => {} } },
      addEventListener: () => {},
      removeEventListener: () => {},
      devicePixelRatio: 1,
    },
    document,
    fetch,
    EventSource: class {
      close() {}
    },
    navigator: { clipboard: { writeText: async () => {} } },
    React: null,
    ReactDOM: null,
    setInterval: () => 1,
    clearInterval: () => {},
    console,
    URL,
    Blob,
    setTimeout,
    clearTimeout,
  };
  sandbox.window.document = document;
  sandbox.window.fetch = fetch;
  sandbox.window.EventSource = sandbox.EventSource;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox.window;
  sandbox.listeners = listeners;
  sandbox.elements = elements;
  return sandbox;
}

async function loadApp(url, fetchMap) {
  const rootPath = path.resolve(process.cwd(), 'public', 'app.js');
  const source = fs.readFileSync(rootPath, 'utf8');
  const sandbox = createSandbox(url, fetchMap);
  vm.runInNewContext(source, sandbox, { filename: 'app.js' });
  await sandbox.listeners.DOMContentLoaded();
  return sandbox;
}

export default async function runPlannerRegressionPackTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-planner-regression-'));
  seedBrain(rootPath);
  seedAgents(rootPath);

  const serverPath = path.resolve(process.cwd(), 'server.js');
  const agentWorkersPath = path.resolve(process.cwd(), 'agentWorkers.js');
  const anchorResolverPath = path.resolve(process.cwd(), 'anchorResolver.js');
  const plannerOuttrayPath = path.resolve(process.cwd(), 'plannerOuttray.js');
  const plannerQaQueuePath = path.resolve(process.cwd(), 'plannerQaQueue.js');
  const taHireRequestsPath = path.resolve(process.cwd(), 'taHireRequests.js');
  const ctoOverridesPath = path.resolve(process.cwd(), 'ctoOverrides.js');
  const {
    createDefaultStudioLayoutSchema,
    buildPlannerIdentitySnapshot,
    buildSpatialRuntimePayload,
    buildCtoGovernanceContext,
  } = require(serverPath);
  const {
    buildCanonicalIntentContract,
    buildPlannerArtifactContract,
    runPlannerWorker,
  } = require(agentWorkersPath);
  const { buildAnchorBundle } = require(anchorResolverPath);
  const { readPlannerOuttray, summarizePlannerOuttray } = require(plannerOuttrayPath);
  const { readPlannerQaQueue, summarizePlannerQaQueue } = require(plannerQaQueuePath);
  const { readTaHireRequestQueue, summarizeTaHireRequestQueue } = require(taHireRequestsPath);
  const {
    createDefaultCtoOverrideLedger,
    normalizeCtoOverrideLedger,
  } = require(ctoOverridesPath);

  const layout = createDefaultStudioLayoutSchema();
  const plannerIdentity = buildPlannerIdentitySnapshot(layout.organization || {});
  assert.equal(plannerIdentity.deskId, 'planner');
  assert.equal(plannerIdentity.roleId, 'planner');
  assert.equal(plannerIdentity.agentId, 'planner');
  assert.equal(plannerIdentity.departmentId, 'dept-delivery');
  assert.equal(plannerIdentity.modelProfileId, 'model-profile.planner-default');
  assert.deepEqual(plannerIdentity.assignedAgentIds, ['planner']);
  assert.equal(plannerIdentity.live, true);

  const overrideLedger = normalizeCtoOverrideLedger({
    ...createDefaultCtoOverrideLedger(),
    entries: [
      {
        overrideId: 'override_force_plan_1',
        kind: 'force-plan-generation',
        requestedBy: 'cto',
        reason: 'Force planner generation for the smoke pack.',
        target: { deskId: 'planner', handoffId: 'handoff_regression_1' },
        canonicalTruth: { staffing: { state: 'absent' } },
        provenance: { sourceType: 'cto-chat', sourceRef: 'chat-regression' },
      },
    ],
  });
  const workspace = createWorkspace();
  workspace.studio.ctoOverrides = overrideLedger;

  const intentContract = buildCanonicalIntentContract({
    report: {
      summary: 'Freeze the planner desk into a regression pack.',
      goal: 'Freeze the planner desk into a regression pack.',
      requestedOutcomes: ['Protect planner identity', 'Protect planner output contract'],
      tasks: ['Protect planner identity', 'Protect planner output contract'],
      targets: ['planner'],
      constraints: ['Keep planner truth canonical'],
      urgency: 'normal',
      requestType: 'planning_request',
      nodeId: 'node_regression_1',
      requestedBy: 'cto',
      priority: 'high',
      anchorRefs: ['brain/emergence/plan.md', 'brain/emergence/tasks.md'],
    },
    packet: {
      summary: 'Freeze the planner desk into a regression pack.',
      goal: 'Freeze the planner desk into a regression pack.',
      requestedOutcomes: ['Protect planner identity', 'Protect planner output contract'],
      tasks: ['Protect planner identity', 'Protect planner output contract'],
      targets: ['planner'],
      constraints: ['Keep planner truth canonical'],
      urgency: 'normal',
      requestType: 'planning_request',
      sourceType: 'cto-chat',
      sourceRef: 'chat-regression',
      requestedBy: 'cto',
      priority: 'high',
      anchorRefs: ['brain/emergence/plan.md', 'brain/emergence/tasks.md'],
    },
    sourceType: 'cto-chat',
    sourceRef: 'chat-regression',
    requestedBy: 'cto',
    priority: 'high',
    timestamp: '2026-03-23T07:05:00.000Z',
    provenance: { channel: 'cto-chat' },
    intentId: 'intent_regression_1',
  });
  assert.equal(intentContract.intentId, 'intent_regression_1');
  assert.equal(intentContract.sourceType, 'cto-chat');
  assert.equal(intentContract.sourceRef, 'chat-regression');
  assert.equal(intentContract.canonicalIntent.statement, 'Freeze the planner desk into a regression pack.');
  assert.deepEqual(intentContract.canonicalIntent.targets, ['planner']);

  const handoff = {
    id: 'handoff_regression_1',
    sourceNodeId: 'node_regression_1',
    summary: intentContract.canonicalIntent.statement,
    requestedOutcomes: intentContract.canonicalIntent.requestedOutcomes,
    constraints: intentContract.constraints,
    anchorRefs: ['brain/emergence/plan.md', 'brain/emergence/tasks.md'],
    status: 'ready',
    intentId: intentContract.intentId,
    sourceType: intentContract.sourceType,
    sourceRef: intentContract.sourceRef,
    requestedBy: intentContract.requestedBy,
    priority: intentContract.priority,
    timestamp: intentContract.timestamp,
    intentContract,
    contextLanes: {
      narrow: {
        lane: 'local',
        currentDesk: 'planner',
        currentTask: 'Freeze planner regression pack',
        activeIntent: {
          intentId: intentContract.intentId,
          sourceType: intentContract.sourceType,
          sourceRef: intentContract.sourceRef,
          requestedBy: intentContract.requestedBy,
          priority: intentContract.priority,
          statement: intentContract.canonicalIntent.statement,
          goal: intentContract.canonicalIntent.goal,
        },
      },
      department: {
        lane: 'department',
        departmentId: 'dept-delivery',
        currentFocus: 'Planner regression pack',
        blockers: ['QA coverage is pending'],
        recentHandoff: { id: 'handoff_previous', status: 'ready' },
      },
      broad: {
        lane: 'broad',
        brainRoot: 'brain/emergence',
        currentFocus: 'Planner regression pack',
        projectBrain: [{ relativePath: 'brain/emergence/project_brain.md', summary: 'Planner regression pack' }],
        roadmap: [{ relativePath: 'brain/emergence/roadmap.md', summary: 'Freeze planner desk contracts' }],
        recentDecisions: [{ relativePath: 'brain/emergence/decisions.md', summary: 'Planner emits queued handoffs' }],
        truthSources: [{ relativePath: 'brain/emergence/project_brain.md', summary: 'Planner regression pack' }],
      },
    },
  };

  const artifactPayload = {
    summary: 'Planner regression pack output.',
    planBundle: {
      planBundleId: 'plan_bundle_1',
      planId: 'plan_bundle_1',
      intentId: intentContract.intentId,
      status: 'ready',
      summary: 'Planner regression pack output.',
      items: [
        {
          planId: 'plan_1',
          intentId: intentContract.intentId,
          status: 'ready',
          priority: 'high',
          summary: 'Protect planner identity',
          acceptanceCriteria: ['Planner identity stays canonical'],
          dependencies: [],
          targetDesk: 'planner',
          targetRole: 'Planner',
          handoffState: 'ready',
          provenance: { sourceHandoffId: handoff.id },
          createdBy: 'planner',
          createdAt: '2026-03-23T07:06:00.000Z',
        },
      ],
      provenance: { sourceHandoffId: handoff.id },
      createdBy: 'planner',
      createdAt: '2026-03-23T07:06:00.000Z',
    },
    taskBundle: {
      taskBundleId: 'task_bundle_1',
      intentId: intentContract.intentId,
      status: 'ready',
      tasks: [
        {
          taskId: 'task_1',
          planId: 'plan_1',
          intentId: intentContract.intentId,
          status: 'planned',
          priority: 'high',
          summary: 'Protect planner identity',
          acceptanceCriteria: ['Planner identity stays canonical'],
          dependencies: [],
          targetDesk: 'executor',
          targetRole: 'Executor',
          handoffState: 'ready',
          provenance: { sourceHandoffId: handoff.id },
          createdBy: 'planner',
          createdAt: '2026-03-23T07:06:00.000Z',
        },
      ],
      provenance: { sourceHandoffId: handoff.id },
      createdBy: 'planner',
      createdAt: '2026-03-23T07:06:00.000Z',
    },
    dependencyMap: {
      dependencyMapId: 'dependency_map_1',
      intentId: intentContract.intentId,
      status: 'ready',
      edges: [],
    },
    staffingRequest: {
      staffingRequestId: 'staffing_1',
      intentId: intentContract.intentId,
      status: 'ready',
      summary: 'QA coverage request for planner output.',
      targetDesk: 'qa-lead',
      targetRole: 'QA Lead',
      requiredCoverage: ['QA review'],
      provenance: { sourceHandoffId: handoff.id },
      createdBy: 'planner',
      createdAt: '2026-03-23T07:06:00.000Z',
    },
    qaRequest: {
      qaRequestId: 'qa_1',
      intentId: intentContract.intentId,
      status: 'ready',
      summary: 'QA should validate the planner output contract.',
      acceptanceCriteria: ['QA can inspect structured planner output'],
      targetDesk: 'qa-lead',
      targetRole: 'QA Lead',
      provenance: { sourceHandoffId: handoff.id },
      createdBy: 'planner',
      createdAt: '2026-03-23T07:06:00.000Z',
    },
    hireRequest: {
      hireRequestId: 'hire_1',
      originDepartmentId: 'dept-delivery',
      originDeskId: 'planner',
      requestedRoleId: 'qa-lead',
      reason: 'QA coverage is missing, so TA should review staffing while planning continues.',
      urgency: 'normal',
      blockingLevel: 'handoff_risk',
      linkedPlanIds: ['plan_1'],
      createdAt: '2026-03-23T07:06:00.000Z',
      status: 'queued',
      provenance: {
        sourceHandoffId: handoff.id,
        sourceIntentId: intentContract.intentId,
        sourceType: intentContract.sourceType,
        sourceRef: intentContract.sourceRef,
        overrideIds: ['override_force_plan_1'],
      },
    },
    outtray: {
      queueKey: 'outtray_1',
      plannerRunId: 'planner_run_1',
      planBundleId: 'plan_bundle_1',
      taskBundleId: 'task_bundle_1',
      intentId: intentContract.intentId,
      status: 'deposited',
      summary: 'planner outtray summary',
      items: [
        {
          laneId: 'qa',
          laneLabel: 'pending QA review',
          targetDesk: 'qa-lead',
          targetRole: 'QA Lead',
          status: 'ready_for_handoff',
          required: true,
          summary: 'QA review pending',
          artifactRefs: ['data/spatial/agent-runs/planner/planner_run_1.json'],
          provenance: { sourceHandoffId: handoff.id, sourceIntentId: intentContract.intentId },
          createdAt: '2026-03-23T07:06:00.000Z',
        },
      ],
      provenance: {
        sourceHandoffId: handoff.id,
        sourceIntentId: intentContract.intentId,
        sourceType: intentContract.sourceType,
        sourceRef: intentContract.sourceRef,
        overrideIds: ['override_force_plan_1'],
      },
      createdBy: 'planner',
      createdAt: '2026-03-23T07:06:00.000Z',
    },
    archivalSummary: {
      archivalSummaryId: 'archive_1',
      intentId: intentContract.intentId,
      status: 'ready',
      summary: 'Archive planner output and provenance',
      provenance: { sourceHandoffId: handoff.id },
      createdBy: 'planner',
      createdAt: '2026-03-23T07:06:00.000Z',
    },
    contextUpdatePacket: {
      contextUpdatePacketId: 'context_1',
      intentId: intentContract.intentId,
      status: 'ready',
      summary: 'Context update for follow-on desks.',
      requestedOutcomes: ['Protect planner identity'],
      constraints: ['Keep planner truth canonical'],
      provenance: { sourceHandoffId: handoff.id },
      createdBy: 'planner',
      createdAt: '2026-03-23T07:06:00.000Z',
    },
    contextLanes: handoff.contextLanes,
    overrideLayer: buildCtoGovernanceContext(workspace).cto.overrideLayer,
    planningMode: 'forced',
    qaCoverageRequired: true,
    qaBlocker: false,
    releaseBlocker: false,
    cards: [
      { title: 'Protect planner identity', summary: 'Keep the identity canonical.', anchorRefs: ['brain/emergence/plan.md'] },
    ],
    brainProposals: [
      { targetPath: 'brain/emergence/plan.md', summary: 'Planner regression note', content: '# Proposal\n- Freeze planner desk contracts\n' },
    ],
    needsContextRetry: false,
    retryReason: '',
  };

  const normalizedContract = buildPlannerArtifactContract(artifactPayload, handoff, artifactPayload.overrideLayer, {
    workspace,
    talentAcquisition: {
      department: { summary: 'QA coverage is missing but planning must continue.' },
      plannerCoverage: { covered: true, blocker: false },
      qaLeadCoverage: { covered: false, blocker: true, reason: 'QA lead coverage is missing.' },
    },
  });
  assert.equal(normalizedContract.planBundle.planId, 'plan_bundle_1');
  assert.equal(normalizedContract.taskBundle.taskBundleId, 'task_bundle_1');
  assert.equal(normalizedContract.qaStatus, 'pending');
  assert.equal(normalizedContract.qaCoverageRequired, true);
  assert.equal(normalizedContract.qaBlocker, false);
  assert.equal(normalizedContract.releaseBlocker, false);
  assert.equal(normalizedContract.hireRequest.blockingLevel, 'handoff_risk');
  assert.equal(normalizedContract.planBundle.items[0].provenance.overrideIds.includes('override_force_plan_1'), true);
  assert.equal(normalizedContract.taskBundle.tasks[0].provenance.overrideIds.includes('override_force_plan_1'), true);

  const anchorBundle = buildAnchorBundle({ rootPath });
  const plannerRun = await runPlannerWorker({
    rootPath,
    handoff,
    workspace,
    anchorBundle,
    runId: 'planner_run_1',
    talentAcquisition: {
      department: { summary: 'QA coverage is missing but planning must continue.' },
      plannerCoverage: { covered: true, blocker: false },
      qaLeadCoverage: { covered: false, blocker: true, reason: 'QA lead coverage is missing.' },
    },
    generator: async () => artifactPayload,
  });

  assert.equal(plannerRun.ok, true);
  assert.equal(plannerRun.outcome, 'completed');
  assert.equal(plannerRun.planBundle.planId, 'plan_bundle_1');
  assert.equal(plannerRun.qaStatus, 'pending');
  assert.equal(plannerRun.qaBlocker, false);
  assert.equal(plannerRun.releaseBlocker, false);
  assert.equal(plannerRun.hireRequest.requestedRoleId, 'qa-lead');
  assert.equal(plannerRun.hireRequest.provenance.overrideIds.includes('override_force_plan_1'), true);
  assert.equal(plannerRun.outtray.status, 'deposited');
  assert.equal(plannerRun.planBundle.items[0].provenance.overrideIds.includes('override_force_plan_1'), true);

  const outtrayQueue = readPlannerOuttray(rootPath);
  const qaQueue = readPlannerQaQueue(rootPath);
  const taHireQueue = readTaHireRequestQueue(rootPath);
  assert.equal(outtrayQueue.entries.length, 1);
  assert.equal(outtrayQueue.entries[0].status, 'deposited');
  assert.equal(outtrayQueue.entries[0].items[0].laneId, 'qa');
  assert.equal(summarizePlannerOuttray(outtrayQueue).depositedCount, 1);
  assert.equal(qaQueue.entries.length, 1);
  assert.equal(qaQueue.entries[0].qaStatus, 'pending');
  assert.equal(summarizePlannerQaQueue(qaQueue).pendingCount, 1);
  assert.equal(taHireQueue.entries.length, 1);
  assert.equal(taHireQueue.entries[0].blockingLevel, 'handoff_risk');
  assert.equal(summarizeTaHireRequestQueue(taHireQueue).queuedCount, 1);

  const runtimePayload = buildSpatialRuntimePayload(workspace, {
    anchorBundle,
  });
  assert.equal(runtimePayload.plannerRuntime.runtimeState, 'live');
  assert.equal(runtimePayload.plannerRuntime.staffingState, 'present');
  assert.equal(runtimePayload.plannerRuntime.modelState, 'ready');
  assert.equal(runtimePayload.canonicalIntent, null);

  const fetchMap = {
    '/api/spatial/cto/diagnostics': {
      ok: true,
      source: '/api/spatial/cto/diagnostics',
      freshness: 'derived',
      generatedAt: '2026-03-23T07:07:00.000Z',
      plannerIdentity,
      ctoOverrides: buildCtoGovernanceContext(workspace).cto.overrides,
    },
    '/api/spatial/runtime': {
      ok: true,
      source: '/api/spatial/runtime',
      freshness: 'live',
      generatedAt: '2026-03-23T07:07:00.000Z',
      ...runtimePayload,
      canonicalIntent: intentContract,
    },
    '/api/spatial/planner/qa-queue': {
      ok: true,
      source: '/api/spatial/planner/qa-queue',
      freshness: 'derived',
      generatedAt: '2026-03-23T07:07:00.000Z',
      queue: qaQueue,
      summary: summarizePlannerQaQueue(qaQueue),
    },
    '/api/spatial/planner/outtray': {
      ok: true,
      source: '/api/spatial/planner/outtray',
      freshness: 'derived',
      generatedAt: '2026-03-23T07:07:00.000Z',
      queue: outtrayQueue,
      summary: summarizePlannerOuttray(outtrayQueue),
    },
    '/api/ta/hire-requests': {
      ok: true,
      source: '/api/ta/hire-requests',
      freshness: 'derived',
      generatedAt: '2026-03-23T07:07:00.000Z',
      queue: taHireQueue,
      summary: summarizeTaHireRequestQueue(taHireQueue),
    },
    '/api/dashboard': {
      state: { current_focus: 'Planner regression pack', next_actions: ['Smoke planner desk'], blockers: [] },
      files: {},
      refreshedAt: '2026-03-23T07:07:00.000Z',
      refreshIntervalMs: 4000,
      errors: [],
    },
    '/api/runs': { runs: [] },
    '/api/health': { ok: true },
    '/api/projects': { projects: [] },
    '/api/tasks': { tasks: [] },
  };

  const sandbox = await loadApp('http://localhost/?mode=qa', fetchMap);
  await sandbox.window.__ACE_APP_TEST__.refreshPlannerIdentityDiagnostics();
  await sandbox.window.__ACE_APP_TEST__.refreshPlannerRuntimeDiagnostics();
  await sandbox.window.__ACE_APP_TEST__.refreshPlannerQaQueueDiagnostics();
  await sandbox.window.__ACE_APP_TEST__.refreshPlannerOuttrayDiagnostics();
  await sandbox.window.__ACE_APP_TEST__.refreshTaHireRequestQueueDiagnostics();

  assert.equal(sandbox.document.getElementById('plannerIdentityFreshness').textContent, 'derived');
  assert.equal(sandbox.document.getElementById('plannerIdentitySource').textContent, '/api/spatial/cto/diagnostics');
  assert.equal(sandbox.document.getElementById('plannerRuntimeFreshness').textContent, 'live');
  assert.equal(sandbox.document.getElementById('plannerRuntimeSource').textContent, '/api/spatial/runtime');
  assert.equal(sandbox.document.getElementById('plannerRuntimeState').textContent, 'live');
  assert.equal(sandbox.document.getElementById('plannerQaFreshness').textContent, 'derived');
  assert.equal(sandbox.document.getElementById('plannerQaQueueCount').textContent, '1 total');
  assert.equal(sandbox.document.getElementById('plannerOuttrayFreshness').textContent, 'derived');
  assert.equal(sandbox.document.getElementById('plannerOuttrayLatestStatus').textContent, 'deposited');
  assert.equal(sandbox.document.getElementById('taHireFreshness').textContent, 'derived');
  assert.equal(sandbox.document.getElementById('taHireQueueCount').textContent, '1 total');
  assert.equal(sandbox.document.getElementById('canonicalIntentFreshness').textContent, 'live');
  assert.equal(sandbox.document.getElementById('canonicalIntentSource').textContent, '/api/spatial/runtime');
  assert.equal(sandbox.document.getElementById('canonicalIntentId').textContent, 'intent_regression_1');
  assert.match(sandbox.document.getElementById('ctoOverrideLatestEffect').textContent, /force-generation/);
  assert.match(sandbox.document.getElementById('ctoOverrideLatestTruth').textContent, /absent/);
}
