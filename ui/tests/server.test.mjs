import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function buildTextRequestMap(responses = {}) {
  return async (url) => {
    if (!Object.prototype.hasOwnProperty.call(responses, url)) {
      throw new Error(`unexpected request: ${url}`);
    }
    return responses[url];
  };
}

function writeFile(rootPath, relativePath, content) {
  const targetPath = path.join(rootPath, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf8');
}

export default async function runServerTests() {
  const serverPath = path.resolve(process.cwd(), 'server.js');
  const throughputDebugPath = path.resolve(process.cwd(), 'throughputDebug.js');
  const {
    app,
    dashboardFiles,
    buildDeskPropertiesPayload,
    buildProjectRecord,
    buildQAStatePayload,
    buildSpatialRuntimePayload,
    applySpatialMutationsToWorkspace,
    evaluateApplyGate,
    evaluateVerifyGate,
    evaluateDeployGate,
    buildVerificationPlan,
    buildLegacyFallbackProvenance,
    buildMixedStudioProvenance,
    detectRunnableProjectType,
    detectMaterialGenerationIntent,
    buildMaterialIntentModuleEnvelope,
    listProjectsForUi,
    launchProject,
    normalizeExecutiveEnvelope,
    mapEnvelopeToMaterialModule,
    buildModulePreview,
    readDashboardFileForRoot,
    resolveLegacyFallbackPayload,
    smokeCheckStaticWebBoot,
    stopProjectRun,
    summarizeExecutionProvenance,
    executeModuleAction,
  } = require(serverPath);
  const {
    createPlannerHandoff,
  } = require(throughputDebugPath);
  const {
    ensureQAStorage,
    writeLocalGateReport,
    writeStructuredQAReport,
  } = require(path.resolve(process.cwd(), 'qaRunner.js'));

  assert.equal(detectMaterialGenerationIntent('Generate a material for wet stone'), true);
  assert.equal(detectMaterialGenerationIntent('Need planning updates for team board'), false);
  assert.ok(app.router.stack.some((layer) => Array.isArray(layer.route?.path) && layer.route.path.includes('/qa')));
  assert.ok(app.router.stack.some((layer) => layer.route?.path === '/api/projects/run'));
  assert.ok(app.router.stack.some((layer) => layer.route?.path === '/api/spatial/archive/writeback'));
  assert.ok(dashboardFiles.includes('brain/emergence/state.json'));
  assert.ok(dashboardFiles.includes('brain/emergence/tasks.md'));
  assert.ok(dashboardFiles.includes('brain/emergence/decisions.md'));
  assert.ok(dashboardFiles.includes('brain/emergence/roadmap.md'));
  assert.ok(dashboardFiles.includes('brain/emergence/changelog.md'));
  assert.ok(!dashboardFiles.includes('projects/emergence/state.json'));
  assert.ok(!dashboardFiles.includes('projects/emergence/tasks.md'));
  assert.ok(!dashboardFiles.includes('projects/emergence/decisions.md'));
  assert.ok(!dashboardFiles.includes('projects/emergence/roadmap.md'));
  assert.ok(!dashboardFiles.includes('projects/emergence/changelog.md'));

  const canonicalDashboardRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-dashboard-canonical-'));
  writeFile(canonicalDashboardRoot, 'brain/emergence/state.json', JSON.stringify({ current_focus: 'brain state' }, null, 2));
  writeFile(canonicalDashboardRoot, 'projects/emergence/state.json', JSON.stringify({ current_focus: 'legacy state' }, null, 2));
  const canonicalState = readDashboardFileForRoot(canonicalDashboardRoot, 'brain/emergence/state.json');
  assert.equal(canonicalState.path, 'brain/emergence/state.json');
  assert.equal(canonicalState.sourcePath, 'brain/emergence/state.json');
  assert.equal(canonicalState.parsed.current_focus, 'brain state');

  const fallbackDashboardRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-dashboard-fallback-'));
  writeFile(fallbackDashboardRoot, 'projects/emergence/roadmap.md', '# Roadmap\n\nLegacy fallback roadmap\n');
  const fallbackRoadmap = readDashboardFileForRoot(fallbackDashboardRoot, 'brain/emergence/roadmap.md');
  assert.equal(fallbackRoadmap.path, 'brain/emergence/roadmap.md');
  assert.equal(fallbackRoadmap.sourcePath, 'projects/emergence/roadmap.md');
  assert.equal(fallbackRoadmap.content.includes('Legacy fallback roadmap'), true);

  const missingDashboardRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-dashboard-missing-'));
  const missingChangelog = readDashboardFileForRoot(missingDashboardRoot, 'brain/emergence/changelog.md');
  assert.equal(missingChangelog.path, 'brain/emergence/changelog.md');
  assert.equal(missingChangelog.exists, false);
  assert.equal(missingChangelog.sourcePath, 'brain/emergence/changelog.md');
  assert.equal(missingChangelog.error, 'File not found');

  const topdownProject = listProjectsForUi().find((project) => project.key === 'topdown-slice');
  assert.ok(topdownProject);
  assert.equal(topdownProject.projectType, 'static-web');
  assert.equal(topdownProject.launchable, true);
  assert.equal(detectRunnableProjectType('topdown-slice', topdownProject.path), 'static-web');
  assert.equal(detectRunnableProjectType('ace-self', path.resolve(process.cwd(), '..')), null);

  const rebuiltProject = buildProjectRecord('topdown-slice', topdownProject.path);
  assert.equal(rebuiltProject.projectType, 'static-web');
  assert.equal(rebuiltProject.launchable, true);
  assert.equal(rebuiltProject.supportedOrigin, 'http://127.0.0.1:4173/');

  const smokeBaseUrl = rebuiltProject.supportedOrigin;
  const smokePass = await smokeCheckStaticWebBoot({
    baseUrl: smokeBaseUrl,
    requestText: buildTextRequestMap({
      [smokeBaseUrl]: {
        status: 200,
        body: '<!doctype html><title>Top-Down Thin Slice</title>',
      },
      [`${smokeBaseUrl}src/main.js`]: {
        status: 200,
        body: "import { createTilemap, TILE_SIZE } from './world/tilemap.js';\n",
      },
      [`${smokeBaseUrl}src/world/tilemap.js`]: {
        status: 200,
        body: 'export function createTilemap() {}\nexport const TILE_SIZE = 32;\n',
      },
      [`${smokeBaseUrl}src/editor/ui.js`]: {
        status: 200,
        body: "import { formatTaskTraceLabel } from '../ai/agentStub.js';\n",
      },
      [`${smokeBaseUrl}src/ai/agentStub.js`]: {
        status: 200,
        body: 'export function formatTaskTraceLabel() {}\n',
      },
    }),
  });
  assert.equal(smokePass.ok, true);
  assert.equal(smokePass.baseUrl, smokeBaseUrl);

  await assert.rejects(
    () => smokeCheckStaticWebBoot({
      baseUrl: smokeBaseUrl,
      requestText: buildTextRequestMap({
        [smokeBaseUrl]: {
          status: 200,
          body: '<!doctype html><title>Top-Down Thin Slice</title>',
        },
        [`${smokeBaseUrl}src/main.js`]: {
          status: 200,
          body: "import { createTilemap } from './world/tilemap.js';\n",
        },
        [`${smokeBaseUrl}src/world/tilemap.js`]: {
          status: 200,
          body: 'export function createTilemap() {}\n',
        },
        [`${smokeBaseUrl}src/editor/ui.js`]: {
          status: 200,
          body: "import { formatTaskTraceLabel } from '../ai/agentStub.js';\n",
        },
        [`${smokeBaseUrl}src/ai/agentStub.js`]: {
          status: 200,
          body: 'export const taskToLabel = () => {};\n',
        },
      }),
    }),
    /\/src\/editor\/ui\.js imports "formatTaskTraceLabel" from \/src\/ai\/agentStub\.js, but that export was not found\./,
  );

  const launchedProject = await launchProject('topdown-slice', {
    checkPortAvailable: async () => true,
    resolveLaunchCommand: () => ({
      command: 'python',
      args: ['-m', 'http.server', '4173'],
      commandLine: 'python -m http.server 4173',
    }),
    spawnChild: () => ({
      pid: 424242,
      unref() {},
    }),
    waitForPortOpen: async () => {},
    smokeCheck: async ({ baseUrl }) => {
      assert.equal(baseUrl, smokeBaseUrl);
      return { ok: true };
    },
  });
  assert.equal(launchedProject.url, smokeBaseUrl);
  assert.equal(launchedProject.supportedOrigin, smokeBaseUrl);
  assert.equal(launchedProject.port, 4173);
  assert.equal(launchedProject.reused, false);
  stopProjectRun('topdown-slice', { killProcess: () => {} });

  await assert.rejects(
    () => launchProject('topdown-slice', {
      checkPortAvailable: async () => false,
      smokeCheck: async () => {
        throw new Error('/ returned 200 without the Top-Down Thin Slice shell marker.');
      },
    }),
    /topdown-slice requires http:\/\/127\.0\.0\.1:4173\/, but the service currently bound there did not pass the boot smoke check/i,
  );

  const moduleEnvelope = buildMaterialIntentModuleEnvelope({
    text: 'Generate a material for "wet stone" for Unreal',
    nodeId: 'n-1',
    source: 'context-intake',
  });
  assert.equal(moduleEnvelope.action, 'run_module');
  assert.equal(moduleEnvelope.module_id, 'material_gen');
  assert.equal(moduleEnvelope.input.intent.surface, 'wet stone');
  assert.equal(moduleEnvelope.input.context.source_node_id, 'n-1');

  const moduleResult = executeModuleAction(moduleEnvelope, { logger: null });
  assert.equal(moduleResult.ok, true);
  assert.equal(moduleResult.output.validation.status, 'pass');
  assert.equal(moduleResult.confidence, 0.82);

  const executiveEnvelope = normalizeExecutiveEnvelope({
    envelope: {
      entries: [
        { type: 'prompt', node_id: 'prompt-1', content: 'Generate a material for wet stone', data: {} },
        { type: 'constraints', node_id: 'constraints-1', content: '', data: { engine_target: 'unreal' } },
        { type: 'target', node_id: 'target-1', content: '', data: { module_id: 'material_gen' } },
      ],
    },
  });
  assert.equal(executiveEnvelope.version, 'ace/studio-envelope.v1');
  assert.equal(executiveEnvelope.nodes.prompt.node_id, 'prompt-1');

  const mappedModuleEnvelope = mapEnvelopeToMaterialModule(executiveEnvelope);
  assert.equal(mappedModuleEnvelope.action, 'run_module');
  assert.equal(mappedModuleEnvelope.module_id, 'material_gen');
  assert.equal(mappedModuleEnvelope.input.context.source_node_id, 'prompt-1');

  const mappedModuleResult = executeModuleAction(mappedModuleEnvelope, { logger: null });
  assert.equal(mappedModuleResult.ok, true);
  const modulePreview = buildModulePreview(mappedModuleResult);
  assert.equal(modulePreview.artifact_type, 'material');
  assert.equal(modulePreview.validation_status, 'pass');
  assert.equal(modulePreview.requires_human_review, false);
  assert.ok(Array.isArray(modulePreview.output_paths));
  assert.ok(modulePreview.output_paths.length >= 3);

  const fallbackPayload = resolveLegacyFallbackPayload({
    nodes: {
      target: {
        data: {
          legacy_action: 'scan',
          task_id: '0007',
          project: 'ace-self',
        },
      },
    },
  });
  assert.deepEqual(fallbackPayload, { action: 'scan', taskId: '0007', project: 'ace-self' });

  const legacyPath = buildLegacyFallbackProvenance({
    action: 'scan',
    stageId: 'scan',
    commandLine: 'python runner/ai.py scan 0007 --project ace-self',
  });
  assert.equal(legacyPath.classification, 'legacy-fallback');
  assert.ok(legacyPath.evidence.includes('route:legacy-fallback'));

  const mixedPath = buildMixedStudioProvenance({
    engine: 'ace-studio-builder-pipeline',
    stageIds: ['builder', 'scan', 'manage', 'build'],
    legacyActions: ['scan', 'manage', 'build'],
    evidence: ['source:team-board-builder'],
  });
  assert.equal(mixedPath.classification, 'mixed');
  assert.match(summarizeExecutionProvenance(mixedPath), /Studio orchestrates, legacy runs scan, manage, build/i);

  const handoff = createPlannerHandoff({
    nodeId: 'node_1',
    summary: 'Plan the next anchored ACE slice',
    confidence: 0.72,
    tasks: ['Plan the next anchored ACE slice'],
    anchorRefs: ['brain/emergence/plan.md'],
    criteria: [],
    projectContext: { matchedTerms: ['ace'], blockers: [] },
    contextPacket: { constraints: [], clarifications: [] },
    scores: { plannerUsefulness: 0.88, executionReadiness: 0.6 },
  }, {});
  assert.equal(Object.prototype.hasOwnProperty.call(handoff, 'provenance'), false);

  const baseWorkspace = {
    studio: {
      selfUpgrade: {
        preflight: {
          ok: true,
          taskId: '0007',
          summary: 'ACE self-upgrade preflight passed.',
        },
        apply: {
          ok: true,
          taskId: '0007',
        },
      },
    },
  };

  const baseCard = {
    id: '0001',
    title: 'Tighten executor gating',
    status: 'review',
    approvalState: 'approved',
    applyStatus: 'idle',
    deployStatus: 'idle',
    targetProjectKey: 'ace-self',
    builderTaskId: '0007',
    sourceAnchorRefs: ['brain/emergence/plan.md'],
    executionPackage: {
      status: 'ready',
      taskId: '0007',
      patchPath: 'work/tasks/0007-tighten-executor/patch.diff',
      changedFiles: ['ui/server.js'],
      expectedAction: 'apply + deploy',
      provenance: mixedPath,
      provenanceSummary: summarizeExecutionProvenance(mixedPath),
    },
    executionProvenance: mixedPath,
    verifyRequired: true,
    verifyStatus: 'passed',
    verifiedSignature: 'sig',
    lastVerificationSummary: 'Verification passed.',
    riskReasons: [],
  };

  const verificationPlan = buildVerificationPlan({
    taskId: '0007',
    patchPath: baseCard.executionPackage.patchPath,
    changedFiles: baseCard.executionPackage.changedFiles,
    targetProjectKey: 'ace-self',
    expectedAction: baseCard.executionPackage.expectedAction,
  });
  assert.equal(verificationPlan.required, true);
  assert.equal(verificationPlan.commands[0].preset, 'runner_compile');
  assert.equal(verificationPlan.qaScenarios[0].scenario, 'layout-pass');

  const applyReady = evaluateApplyGate({
    card: {
      ...baseCard,
      verifiedSignature: verificationPlan.signature,
      executionPackage: {
        ...baseCard.executionPackage,
        verificationPlan,
      },
    },
    workspace: baseWorkspace,
  });
  assert.equal(applyReady.ok, true);

  const verifyReady = evaluateVerifyGate({
    card: {
      ...baseCard,
      verifyStatus: 'queued',
      verifiedSignature: null,
      executionPackage: {
        ...baseCard.executionPackage,
        verificationPlan,
      },
    },
    workspace: baseWorkspace,
  });
  assert.equal(verifyReady.ok, true);

  const noAnchor = evaluateApplyGate({
    card: { ...baseCard, sourceAnchorRefs: [], executionPackage: { ...baseCard.executionPackage, verificationPlan } },
    workspace: baseWorkspace,
  });
  assert.equal(noAnchor.ok, false);
  assert.equal(noAnchor.code, 'missing-anchor');

  const noPackage = evaluateApplyGate({
    card: {
      ...baseCard,
      executionPackage: { ...baseCard.executionPackage, status: 'idle' },
    },
    workspace: baseWorkspace,
  });
  assert.equal(noPackage.ok, false);
  assert.equal(noPackage.code, 'missing-package');

  const stalePreflight = evaluateApplyGate({
    card: {
      ...baseCard,
      verifiedSignature: verificationPlan.signature,
      executionPackage: {
        ...baseCard.executionPackage,
        verificationPlan,
      },
    },
    workspace: {
      studio: {
        selfUpgrade: {
          ...baseWorkspace.studio.selfUpgrade,
          preflight: {
            ok: true,
            taskId: '9999',
            summary: 'stale',
          },
        },
      },
    },
  });
  assert.equal(stalePreflight.ok, false);
  assert.equal(stalePreflight.code, 'preflight-stale');

  const verificationRequired = evaluateApplyGate({
    card: {
      ...baseCard,
      verifyStatus: 'queued',
      verifiedSignature: null,
      executionPackage: {
        ...baseCard.executionPackage,
        verificationPlan,
      },
    },
    workspace: baseWorkspace,
  });
  assert.equal(verificationRequired.ok, false);
  assert.equal(verificationRequired.code, 'verification-required');

  const verificationStale = evaluateApplyGate({
    card: {
      ...baseCard,
      verifiedSignature: 'old-signature',
      executionPackage: {
        ...baseCard.executionPackage,
        verificationPlan,
      },
    },
    workspace: baseWorkspace,
  });
  assert.equal(verificationStale.ok, false);
  assert.equal(verificationStale.code, 'verification-stale');

  const deployReady = evaluateDeployGate({
    card: {
      ...baseCard,
      status: 'complete',
      applyStatus: 'applied',
      deployStatus: 'queued',
      verifiedSignature: verificationPlan.signature,
      executionPackage: {
        ...baseCard.executionPackage,
        verificationPlan,
      },
    },
    workspace: baseWorkspace,
  });
  assert.equal(deployReady.ok, true);

  const deployNeedsApply = evaluateDeployGate({
    card: {
      ...baseCard,
      status: 'complete',
      applyStatus: 'queued',
      deployStatus: 'queued',
      executionPackage: {
        ...baseCard.executionPackage,
        verificationPlan,
      },
    },
    workspace: baseWorkspace,
  });
  assert.equal(deployNeedsApply.ok, false);
  assert.equal(deployNeedsApply.code, 'invalid-deploy-state');

  const deployStaleApply = evaluateDeployGate({
    card: {
      ...baseCard,
      status: 'complete',
      applyStatus: 'applied',
      deployStatus: 'queued',
      verifiedSignature: verificationPlan.signature,
      executionPackage: {
        ...baseCard.executionPackage,
        verificationPlan,
      },
    },
    workspace: {
      studio: {
        selfUpgrade: {
          ...baseWorkspace.studio.selfUpgrade,
          apply: {
            ok: true,
            taskId: '9999',
          },
        },
      },
    },
  });
  assert.equal(deployStaleApply.ok, false);
  assert.equal(deployStaleApply.code, 'apply-stale');

  const qaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-server-qa-'));
  const qaStorage = ensureQAStorage(qaRoot);
  writeStructuredQAReport(qaRoot, {
    status: 'pass',
    summary: 'All QA suites passed after stabilising the UI gate.',
    desks: [
      {
        desk: 'ui',
        status: 'pass',
        tests: [{ name: 'contract_check', status: 'pass' }],
      },
    ],
  }, 'latest');
  writeLocalGateReport(qaRoot, 'test-unit-latest', {
    id: 'test-unit-latest',
    source: 'ui-test-runner',
    command: 'npm run test:unit',
    status: 'pass',
    summary: 'All 22 UI checks passed.',
    totalChecks: 22,
    passedCount: 22,
    failedCount: 0,
    failures: [],
  });
  fs.writeFileSync(path.join(qaStorage, 'qa_manual_1.json'), `${JSON.stringify({
    id: 'qa_manual_1',
    scenario: 'layout-pass',
    mode: 'interactive',
    trigger: 'manual',
    status: 'completed',
    verdict: 'pass',
    createdAt: '2026-03-25T09:15:00.000Z',
    finishedAt: '2026-03-25T09:16:00.000Z',
    findings: [],
    steps: [{ id: 'scenario', label: 'Run QA scenario actions', status: 'completed', verdict: 'pass' }],
    artifacts: { screenshots: [] },
    console: [],
    network: [],
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(qaStorage, 'qa_guardrail_1.json'), `${JSON.stringify({
    id: 'qa_guardrail_1',
    scenario: 'studio-smoke',
    mode: 'interactive',
    trigger: 'guardrail',
    status: 'completed',
    verdict: 'pass',
    createdAt: '2026-03-25T09:10:00.000Z',
    finishedAt: '2026-03-25T09:11:00.000Z',
    findings: [],
    steps: [
      { id: 'open', label: 'Open ACE', status: 'completed', verdict: 'pass' },
      { id: 'studio', label: 'Enter ACE Studio', status: 'completed', verdict: 'pass' },
    ],
    artifacts: { screenshots: [] },
    console: [],
    network: [],
  }, null, 2)}\n`, 'utf8');

  const qaState = buildQAStatePayload(qaRoot);
  assert.equal(qaState.structuredReport.summary, 'All QA suites passed after stabilising the UI gate.');
  assert.equal(qaState.latestBrowserRun.id, 'qa_manual_1');
  assert.equal(qaState.browserRuns.length, 1);
  assert.equal(qaState.browserRuns[0].id, 'qa_manual_1');
  assert.equal(qaState.localGate.unit.status, 'pass');
  assert.equal(qaState.localGate.studioBoot.id, 'qa_guardrail_1');
  assert.equal(qaState.localGate.studioBoot.source, 'studio-boot-guardrail');

  const qaWorkspace = {
    graph: { nodes: [], edges: [] },
    graphs: {
      system: { nodes: [], edges: [] },
      world: { nodes: [], edges: [] },
    },
    sketches: [],
    annotations: [],
    pages: [],
    activePageId: null,
    intentState: {
      latest: null,
      contextReport: null,
      byNode: {},
      reports: [],
    },
    studio: {
      handoffs: {},
      teamBoard: {
        cards: [],
        selectedCardId: null,
        summary: { plan: 0, active: 0, complete: 0, review: 0, assigned: 0, idleWorkers: 0 },
      },
      orchestrator: {
        status: 'idle',
        activeDeskIds: [],
        conflicts: [],
        pendingUserActions: [],
        desks: {
          'qa-lead': {
            mission: 'Restore QA desk truth',
            currentGoal: 'Surface QA evidence in one place',
            localState: 'review',
            workItems: [],
          },
        },
      },
      deskProperties: {},
      agentWorkers: {},
      selfUpgrade: {},
    },
  };
  const qaDeskPayload = buildDeskPropertiesPayload(qaWorkspace, 'qa-lead', qaState);
  assert.equal(qaDeskPayload.qa.structuredSummary.status, 'pass');
  assert.equal(qaDeskPayload.qa.structuredSummary.testCount, 1);
  assert.equal(qaDeskPayload.qa.latestBrowserRun.id, 'qa_manual_1');
  assert.equal(qaDeskPayload.qa.browserRuns.length, 1);
  assert.equal(qaDeskPayload.qa.localGate.studioBoot.id, 'qa_guardrail_1');
  assert.ok(Array.isArray(qaDeskPayload.qa.availableTests));

  const runtimePayload = buildSpatialRuntimePayload(qaWorkspace, {
    qaState,
    anchorBundle: {
      managerSummary: { status: 'ready' },
      truthSources: [],
      anchorRefs: [],
    },
  });
  assert.equal(runtimePayload.qaState.latestBrowserRun.id, 'qa_manual_1');
  assert.equal(runtimePayload.qaState.localGate.unit.status, 'pass');
  assert.ok(runtimePayload.canonicalSlices);
  assert.ok(Array.isArray(runtimePayload.canonicalSlices.slices));

  const mutationWorkspace = {
    graph: {
      nodes: [{ id: 'node_1', type: 'text', content: 'Original', position: { x: 0, y: 0 }, metadata: { graphLayer: 'system' } }],
      edges: [],
    },
    graphs: {
      system: {
        nodes: [{ id: 'node_1', type: 'text', content: 'Original', position: { x: 0, y: 0 }, metadata: { graphLayer: 'system' } }],
        edges: [],
      },
      world: { nodes: [], edges: [] },
    },
    studio: {},
  };
  const applyResult = applySpatialMutationsToWorkspace(mutationWorkspace, [
    {
      type: 'create_node',
      node: { id: 'node_2', type: 'task', content: 'Confirmed', position: { x: 120, y: 60 }, metadata: { graphLayer: 'system' } },
    },
    {
      type: 'create_edge',
      edge: { source: 'node_1', target: 'node_2', relationship_type: 'relates_to' },
    },
  ]);
  assert.equal(applyResult.ok, true);
  assert.equal(applyResult.status, 'applied');
  assert.equal(applyResult.confirmed, true);
  assert.equal(applyResult.applied, 2);
  assert.equal(applyResult.workspace.graphs.system.nodes.length, 2);
  assert.equal(applyResult.workspace.graphs.system.edges.length, 1);

  const noOpResult = applySpatialMutationsToWorkspace(applyResult.workspace, [
    {
      type: 'create_edge',
      edge: { source: 'node_1', target: 'node_2', relationship_type: 'relates_to' },
    },
  ]);
  assert.equal(noOpResult.ok, true);
  assert.equal(noOpResult.status, 'no-op');
  assert.equal(noOpResult.confirmed, false);
  assert.equal(noOpResult.applied, 0);

  assert.throws(
    () => applySpatialMutationsToWorkspace(mutationWorkspace, [
      {
        type: 'modify_node',
        id: 'missing-node',
        patch: { content: 'Broken' },
      },
    ]),
    /Cannot modify missing node "missing-node"\./,
  );
}
