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
    buildGuardSurfacePayload,
    evaluateStagePreflightSurface,
    evaluateSpatialBootHealth,
    buildSafeModeSnapshot,
    buildConstrainedAutoFixBundle,
    runSafeModeDiagnosis,
    runConstrainedSafeModeFixPass,
    readDashboardFileForRoot,
    getHealthSnapshot,
    resolveLegacyFallbackPayload,
    smokeCheckStaticWebBoot,
    stopProjectRun,
    summarizeExecutionProvenance,
    executeModuleAction,
    detectWorldScaffoldIntent,
    detectPotentialWorldEditPrompt,
    interpretScaffoldIntentWithModel,
    parseWorldEditIntent,
    parseWorldScaffoldIntent,
    resolveWorldEditExecutiveRoute,
    resolveWorldScaffoldExecutiveRoute,
    buildWorldScaffoldMutationPlan,
    buildWorldScaffoldMutations,
    normalizeStoredStudioState,
    normalizeStoredStudioTeamBoard,
    createDefaultStudioLayoutSchema,
    normalizeStudioLayoutSchema,
    addDepartmentToLayout,
    addDeskToLayout,
    buildStudioLayoutCatalog,
    listStudioDeskIds,
    resolveCtoGovernanceConfig,
    classifyFailureContext,
    buildFailureUiResponse,
    recordClassifiedFailure,
    parseCtoStructuredReply,
    classifyCtoDiagnosticCategory,
    recordCtoDiagnostic,
    readCtoDiagnostics,
    probeCtoBackendStatus,
    buildCtoGovernanceContext,
    buildCtoAvailableActions,
    executeCtoConfirmedAction,
    runCtoGovernanceChat,
    normalizeCtoChatHistory,
    isAffirmativeCtoReply,
  } = require(serverPath);
  const {
    createPlannerHandoff,
  } = require(throughputDebugPath);
  const {
    createWorldScaffold,
  } = require(path.resolve(process.cwd(), 'worldScaffold.js'));
  const {
    ensureQAStorage,
    writeLocalGateReport,
    writeStructuredQAReport,
  } = require(path.resolve(process.cwd(), 'qaRunner.js'));
  const {
    writeFailureHistory,
    readFailureHistory,
  } = require(path.resolve(process.cwd(), 'failureMemory.js'));

  assert.equal(detectMaterialGenerationIntent('Generate a material for wet stone'), true);
  assert.equal(detectMaterialGenerationIntent('Need planning updates for team board'), false);
  const bootHealth = evaluateSpatialBootHealth();
  assert.equal(bootHealth.checked, true);
  assert.equal(typeof bootHealth.safeMode, 'boolean');
  assert.equal(classifyFailureContext(new TypeError("Cannot read properties of undefined (reading 'length')"), {
    component: 'SpatialNotebook',
    stage: 'roster',
  }), 'panel_degraded');
  assert.equal(classifyFailureContext(Object.assign(new Error('startup failed'), { statusCode: 503 }), {
    stage: 'boot',
    route: '/api/health',
  }), 'boot_critical');
  assert.equal(classifyFailureContext(Object.assign(new Error('validation failed'), { statusCode: 400 }), {
    stage: 'qa',
    route: '/api/spatial/qa/run',
  }), 'warning');
  const autoFixBundle = buildConstrainedAutoFixBundle({
    reason: 'Cannot read properties of undefined (reading \'length\')',
    criticalErrors: [{
      message: 'Cannot read properties of undefined (reading \'length\')',
      stack: `TypeError: Cannot read properties of undefined (reading 'length')\n    at renderRosterUtility (C:/repo/ui/public/spatial/spatialApp.js:12:3)`,
      failureClass: 'panel_degraded',
    }],
    failingTestNames: ['spatialAppSmoke'],
  }, {
    stage: 'safe-mode',
    changedFiles: ['ui/public/spatial/spatialApp.js'],
  });
  assert.ok(autoFixBundle.changedFiles.some((file) => file.endsWith('ui/public/spatial/spatialApp.js')));
  assert.deepEqual(buildFailureUiResponse('panel_degraded'), {
    failureClass: 'panel_degraded',
    uiMode: 'fallback_panel',
    clientAction: 'showFallbackPanel',
    safeMode: false,
    fallbackPanel: true,
    shell: 'fallback-panel',
    summary: 'Render a fallback panel and keep the rest of the UI alive.',
  });
  assert.equal(isAffirmativeCtoReply('Yes, do it.'), true);
  assert.equal(isAffirmativeCtoReply('not yet'), false);
  assert.equal(normalizeCtoChatHistory([
    { role: 'user', text: 'Need planner coverage.' },
    { role: 'ace', text: 'Planner coverage is thin.', action: { id: 'hire-role', kind: 'hire-role' } },
  ])[1].action.id, 'hire-role');
  const ctoContext = await buildCtoGovernanceContext();
  assert.ok(ctoContext.desks.some((desk) => desk.deskId === 'planner'));
  const ctoActions = buildCtoAvailableActions({
    text: 'We need planner coverage. Should TA hire for the planner desk?',
    context: ctoContext,
  });
  assert.equal(ctoActions.some((action) => action.kind === 'hire-role' && action.targetDeskId === 'planner'), true);
  const originalCtoEnv = {
    backend: process.env.ACE_CTO_BACKEND,
    model: process.env.ACE_CTO_MODEL,
    host: process.env.ACE_CTO_OLLAMA_HOST,
    timeoutMs: process.env.ACE_CTO_TIMEOUT_MS,
  };
  process.env.ACE_CTO_BACKEND = 'ollama';
  process.env.ACE_CTO_MODEL = 'mixtral:latest';
  process.env.ACE_CTO_OLLAMA_HOST = 'http://127.0.0.1:22445';
  process.env.ACE_CTO_TIMEOUT_MS = '34567';
  assert.deepEqual(resolveCtoGovernanceConfig(), {
    backend: 'ollama',
    model: 'mixtral:latest',
    host: 'http://127.0.0.1:22445',
    timeoutMs: 34567,
  });
  assert.equal(parseCtoStructuredReply(JSON.stringify({
    reply_text: 'Planner owns sequencing.',
    response_kind: 'actionable',
    delegation: {
      desk_id: 'planner',
      desk_label: 'Planner',
      why: 'Planner owns sequencing.',
    },
    action: { id: 'hire-role' },
  }), {
    availableActions: [{ id: 'hire-role' }],
    context: { desks: [{ deskId: 'planner' }] },
  }).replyText, 'Planner owns sequencing.');
  assert.equal(parseCtoStructuredReply("```json\n{\n  \"reply_text\": \"Planner owns sequencing.\",\n  \"response_kind\": \"actionable\",\n  \"delegation\": {\n    \"desk_id\": \"planner\",\n    \"desk_label\": \"Planner\",\n    \"why\": \"Planner owns sequencing.\"\n  },\n  \"action\": {\n    \"id\": \"hire-planner\"\n  }\n}\n```").responseKind, 'actionable');
  assert.throws(() => parseCtoStructuredReply('I think the planner should handle this.'), /prose instead of strict JSON/i);
  assert.throws(() => parseCtoStructuredReply('{"reply_text":"Planner","response_kind":"actionable",'), /not valid JSON/i);
  assert.throws(() => parseCtoStructuredReply(JSON.stringify({
    reply_text: 'Planner owns sequencing.',
    response_kind: 'actionable',
    delegation: {
      desk_id: 'planner',
    },
    action: { id: 'hire-role' },
  }), {
    availableActions: [{ id: 'hire-role' }],
    context: { desks: [{ deskId: 'planner' }] },
  }), /delegation did not satisfy the required contract/i);
  assert.throws(() => parseCtoStructuredReply(JSON.stringify({
    reply_text: 'Planner owns sequencing.',
    response_kind: 'unsupported',
    delegation: null,
    action: null,
  })), /invalid response_kind/i);
  assert.throws(() => parseCtoStructuredReply(JSON.stringify({
    reply_text: 'Planner owns sequencing.',
    response_kind: 'actionable',
    delegation: {
      desk_id: 'not-a-real-desk',
      desk_label: 'Unknown',
      why: 'Unknown',
    },
    action: null,
  }), {
    context: { desks: [{ deskId: 'planner' }] },
  }), /unknown desk_id/i);
  assert.throws(() => parseCtoStructuredReply(JSON.stringify({
    reply_text: 'Planner owns sequencing.',
    response_kind: 'actionable',
    delegation: null,
    action: { id: 'not-available' },
  }), {
    availableActions: [{ id: 'hire-planner' }],
  }), /unavailable action id/i);
  assert.equal(classifyCtoDiagnosticCategory({
    status: 'offline',
    reason: 'fetch failed',
  }), 'backend_unreachable');
  assert.equal(classifyCtoDiagnosticCategory({
    status: 'offline',
    reason: 'Ollama status check timed out after 34567ms.',
  }), 'timeout');
  assert.equal(classifyCtoDiagnosticCategory({
    status: 'degraded',
    reason: 'CTO chat returned prose instead of strict JSON.',
    failureKind: 'parse',
  }), 'non_json_output');
  assert.equal(classifyCtoDiagnosticCategory({
    status: 'degraded',
    reason: 'CTO chat response was not valid JSON: Unexpected token',
    failureKind: 'parse',
  }), 'malformed_json');
  assert.equal(classifyCtoDiagnosticCategory({
    status: 'degraded',
    reason: 'CTO chat action referenced an unavailable action id: not-available.',
    failureKind: 'contract',
  }), 'contract_invalid');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('/api/tags')) {
      return {
        ok: true,
        json: async () => ({
          models: [{ name: 'mixtral:latest' }, { name: 'mistral:latest' }],
        }),
      };
    }
    if (String(url).includes('/api/generate')) {
      const body = JSON.parse(options.body || '{}');
      assert.match(body.prompt, /ACE CTO \/ Architect chat utility/);
      assert.equal(body.model, 'mixtral:latest');
      return {
        ok: true,
        json: async () => ({
          response: JSON.stringify({
            reply_text: 'Delivery should route through the planner desk first. Talent Acquisition can hire planner coverage after confirmation.',
            response_kind: 'actionable',
            delegation: {
              desk_id: 'planner',
              desk_label: 'Planner',
              why: 'The planner desk owns sequencing and dependency-aware breakdown.',
            },
            action: {
              id: 'hire-planner',
            },
          }),
        }),
      };
    }
    throw new Error(`unexpected CTO fetch: ${url}`);
  };
  const ctoChatResult = await runCtoGovernanceChat({
    text: 'We need a planner for this. Can you handle it?',
    history: [],
  });
  assert.equal(ctoChatResult.ok, true);
  assert.equal(ctoChatResult.status, 'live');
  assert.equal(ctoChatResult.replyKind, 'actionable');
  assert.equal(ctoChatResult.model, 'mixtral:latest');
  assert.equal(ctoChatResult.delegation.deskId, 'planner');
  assert.equal(ctoChatResult.action.kind, 'hire-role');
  assert.equal(ctoChatResult.action.targetDeskId, 'planner');
  const backendStatus = await probeCtoBackendStatus({
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ models: [{ name: 'mixtral:latest' }, { name: 'mistral:latest' }] }),
    }),
  });
  assert.equal(backendStatus.status, 'live');
  assert.equal(backendStatus.model, 'mixtral:latest');
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('/api/tags')) {
      return {
        ok: true,
        json: async () => ({
          models: [{ name: 'mixtral:latest' }, { name: 'mistral:latest' }],
        }),
      };
    }
    if (String(url).includes('/api/generate')) {
      const body = JSON.parse(options.body || '{}');
      assert.match(body.prompt, /ACE CTO \/ Architect chat utility/);
      return {
        ok: true,
        json: async () => ({
          response: 'I think the planner desk should handle this.',
        }),
      };
    }
    throw new Error(`unexpected malformed CTO fetch: ${url}`);
  };
  const degradedCtoChatResult = await runCtoGovernanceChat({
    text: 'We need planner coverage.',
    history: [],
  });
  assert.equal(degradedCtoChatResult.ok, false);
  assert.equal(degradedCtoChatResult.status, 'degraded');
  assert.equal(degradedCtoChatResult.replyKind, 'blocked');
  assert.match(degradedCtoChatResult.reply_text, /live CTO model is reachable/i);
  assert.match(degradedCtoChatResult.reason, /prose instead of strict JSON/i);
  assert.equal(degradedCtoChatResult.diagnostic.category, 'non_json_output');
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('/api/tags')) {
      return {
        ok: true,
        json: async () => ({
          models: [{ name: 'mixtral:latest' }, { name: 'mistral:latest' }],
        }),
      };
    }
    if (String(url).includes('/api/generate')) {
      const body = JSON.parse(options.body || '{}');
      assert.match(body.prompt, /ACE CTO \/ Architect chat utility/);
      return {
        ok: true,
        json: async () => ({
          response: '{"reply_text":"Planner owns sequencing.","response_kind":"actionable","delegation":{"desk_id":"planner"}}',
        }),
      };
    }
    throw new Error(`unexpected partial CTO fetch: ${url}`);
  };
  const partialContractResult = await runCtoGovernanceChat({
    text: 'We need planner coverage.',
    history: [],
  });
  assert.equal(partialContractResult.ok, false);
  assert.equal(partialContractResult.status, 'degraded');
  assert.match(partialContractResult.reason, /delegation did not satisfy the required contract/i);
  assert.equal(partialContractResult.diagnostic.category, 'contract_invalid');
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('/api/tags')) {
      return {
        ok: true,
        json: async () => ({
          models: [{ name: 'mixtral:latest' }, { name: 'mistral:latest' }],
        }),
      };
    }
    if (String(url).includes('/api/generate')) {
      const body = JSON.parse(options.body || '{}');
      assert.match(body.prompt, /ACE CTO \/ Architect chat utility/);
      return {
        ok: true,
        json: async () => ({
          response: '{"reply_text":"Planner owns sequencing.","response_kind":"actionable","delegation":null,"action":{"id":"not-available"}}',
        }),
      };
    }
    throw new Error(`unexpected invalid-action CTO fetch: ${url}`);
  };
  const parseableInvalidResult = await runCtoGovernanceChat({
    text: 'We need planner coverage.',
    history: [],
  });
  assert.equal(parseableInvalidResult.ok, false);
  assert.equal(parseableInvalidResult.status, 'degraded');
  assert.match(parseableInvalidResult.reason, /unavailable action id/i);
  assert.match(parseableInvalidResult.reply_text, /failed CTO contract validation/i);
  assert.equal(parseableInvalidResult.diagnostic.category, 'contract_invalid');
  globalThis.fetch = originalFetch;
  if (originalCtoEnv.backend === undefined) {
    delete process.env.ACE_CTO_BACKEND;
  } else {
    process.env.ACE_CTO_BACKEND = originalCtoEnv.backend;
  }
  if (originalCtoEnv.model === undefined) {
    delete process.env.ACE_CTO_MODEL;
  } else {
    process.env.ACE_CTO_MODEL = originalCtoEnv.model;
  }
  if (originalCtoEnv.host === undefined) {
    delete process.env.ACE_CTO_OLLAMA_HOST;
  } else {
    process.env.ACE_CTO_OLLAMA_HOST = originalCtoEnv.host;
  }
  if (originalCtoEnv.timeoutMs === undefined) {
    delete process.env.ACE_CTO_TIMEOUT_MS;
  } else {
    process.env.ACE_CTO_TIMEOUT_MS = originalCtoEnv.timeoutMs;
  }
  const ctoDiagnosticRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-cto-diagnostics-'));
  recordCtoDiagnostic({
    route: '/api/spatial/cto/chat',
    source: 'server-test',
    status: 'offline',
    backend: 'ollama',
    model: 'mistral:latest',
    host: 'http://127.0.0.1:11434',
    reason: 'fetch failed',
  }, ctoDiagnosticRoot);
  recordCtoDiagnostic({
    route: '/api/spatial/cto/chat',
    source: 'server-test',
    status: 'degraded',
    backend: 'ollama',
    model: 'mistral:latest',
    host: 'http://127.0.0.1:11434',
    reason: 'CTO chat returned prose instead of strict JSON.',
    failureKind: 'parse',
  }, ctoDiagnosticRoot);
  const ctoDiagnostics = readCtoDiagnostics(ctoDiagnosticRoot);
  assert.equal(ctoDiagnostics.entries.length >= 2, true);
  assert.equal(ctoDiagnostics.entries[0].category, 'non_json_output');
  assert.equal(ctoDiagnostics.entries[1].category, 'backend_unreachable');
  const classifiedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-server-failure-'));
  const classifiedFailure = recordClassifiedFailure(classifiedRoot, new TypeError("Cannot read properties of undefined (reading 'length')"), {
    stage: 'roster',
    component: 'SpatialNotebook',
    route: '/api/spatial/desks/qa-lead/properties',
    source: 'server-test',
  });
  const classifiedHistory = readFailureHistory(classifiedRoot).history;
  assert.equal(classifiedFailure.failureClass, 'panel_degraded');
  assert.equal(classifiedHistory.entries[0].failure_class, 'panel_degraded');
  assert.ok(classifiedHistory.entries[0].last_error.timestamp);
  assert.match(classifiedHistory.entries[0].last_error.stack || '', /TypeError/);
  assert.equal(classifiedHistory.entries[0].last_error.ui_response.clientAction, 'showFallbackPanel');
  const healthSnapshot = getHealthSnapshot();
  assert.equal(healthSnapshot.safeMode, Boolean(bootHealth.safeMode));
  assert.equal(healthSnapshot.bootHealth.checked, true);
  assert.equal(healthSnapshot.bootHealth.safeMode, Boolean(bootHealth.safeMode));
  const oversizedStudioState = {
    handoffs: {
      contextToPlanner: { id: 'handoff_1', title: 'Planner brief' },
      history: [{ id: 'handoff_1' }, null, { id: 'handoff_0' }],
    },
    teamBoard: {
      selectedCardId: 'card_2',
      cards: Array.from({ length: 20 }, (_, index) => ({
        id: `card_${index}`,
        title: `Task ${index}`,
        executionPackage: {
          changedFiles: Array.from({ length: 10 }, (__, fileIndex) => `src/file_${index}_${fileIndex}.js`),
        },
      })),
      summary: { review: 20 },
    },
  };
  const compactStudioState = normalizeStoredStudioState(oversizedStudioState);
  assert.deepEqual(compactStudioState, {
    handoffs: {
      contextToPlanner: { id: 'handoff_1', title: 'Planner brief' },
      history: [{ id: 'handoff_1' }, { id: 'handoff_0' }],
    },
    teamBoard: { selectedCardId: 'card_2' },
  });
  assert.deepEqual(normalizeStoredStudioTeamBoard({
    selectedCardId: null,
    cards: [{ id: 'card_1', title: 'Should be stripped' }],
  }), { selectedCardId: null });
  assert.ok(JSON.stringify(compactStudioState).length < JSON.stringify(oversizedStudioState).length / 4);

  const defaultLayout = createDefaultStudioLayoutSchema();
  assert.equal(defaultLayout.controlCentreDeskId, 'cto-architect');
  assert.equal(defaultLayout.departments.find((entry) => entry.id === 'dept-control').label, 'Control Centre');
  assert.equal(defaultLayout.departments.some((entry) => entry.id === 'dept-talent-acquisition'), true);
  assert.ok(defaultLayout.desks['qa-lead']);
  assert.deepEqual(listStudioDeskIds(defaultLayout).sort(), [
    'context-manager',
    'cto-architect',
    'executor',
    'integration_auditor',
    'memory-archivist',
    'planner',
    'qa-lead',
    'rnd-lead',
  ]);
  assert.equal(defaultLayout.desks['context-manager'].staffing.seatKind, 'lead');
  assert.equal(defaultLayout.desks['integration_auditor'].departmentId, 'dept-talent-acquisition');
  assert.equal(defaultLayout.desks['integration_auditor'].staffing.placeholder, true);
  assert.equal(defaultLayout.desks['integration_auditor'].staffing.seatKind, 'lead');
  const layoutCatalog = buildStudioLayoutCatalog();
  assert.ok(layoutCatalog.departmentTemplates.some((entry) => entry.id === 'research'));
  assert.ok(layoutCatalog.deskTemplates.some((entry) => entry.id === 'report-node'));
  const departmentExpandedLayout = addDepartmentToLayout(defaultLayout, { templateId: 'research' });
  const addedDepartment = departmentExpandedLayout.departments.find((entry) => entry.id.startsWith('dept-research-'));
  assert.ok(addedDepartment);
  assert.equal(addedDepartment.visible, true);
  assert.equal(new Set(departmentExpandedLayout.departments.map((entry) => entry.id)).size, departmentExpandedLayout.departments.length);
  const deskExpandedLayout = addDeskToLayout(departmentExpandedLayout, {
    departmentId: addedDepartment.id,
    templateId: 'analysis-node',
  });
  const addedDeskId = Object.keys(deskExpandedLayout.desks).find((deskId) => deskId.startsWith('analysis-'));
  assert.ok(addedDeskId);
  assert.equal(deskExpandedLayout.desks[addedDeskId].departmentId, addedDepartment.id);
  assert.equal(normalizeStudioLayoutSchema(deskExpandedLayout).departments.some((entry) => entry.id === addedDepartment.id), true);
  assert.equal(new Set(listStudioDeskIds(deskExpandedLayout)).size, listStudioDeskIds(deskExpandedLayout).length);
  const dynamicDeskPayload = buildDeskPropertiesPayload({
    graph: { nodes: [], edges: [] },
    graphs: {
      system: { nodes: [], edges: [] },
      world: { nodes: [], edges: [] },
    },
    studio: {
      layout: deskExpandedLayout,
      orchestrator: { desks: {}, activeDeskIds: [], conflicts: [] },
      deskProperties: {},
      agentWorkers: {},
      teamBoard: { cards: [], selectedCardId: null, summary: {} },
      handoffs: {},
    },
  }, addedDeskId);
  assert.equal(dynamicDeskPayload.layout.desk.id, addedDeskId);
  assert.equal(dynamicDeskPayload.truth.department.label, addedDepartment.label);
  assert.equal(dynamicDeskPayload.truth.workload.assignedTasks, 0);

  assert.equal(detectWorldScaffoldIntent("let's start with a 20x20 grass/ground grid"), true);
  assert.equal(detectWorldScaffoldIntent('make a grass grid'), true);
  assert.equal(detectWorldScaffoldIntent('make a small stone platform to build on'), true);
  assert.equal(detectWorldScaffoldIntent('something to build on'), true);
  assert.equal(detectWorldScaffoldIntent('a small grid'), true);
  assert.equal(detectWorldScaffoldIntent('make it kinda big'), false);
  assert.equal(detectWorldScaffoldIntent('a huge space idk'), false);
  assert.equal(detectWorldScaffoldIntent('infinite grass world'), false);
  assert.equal(detectPotentialWorldEditPrompt('add water tiles to the grass grid'), true);
  assert.equal(detectPotentialWorldEditPrompt('20x20 grass grid'), false);
  const scaffoldIntent = parseWorldScaffoldIntent("let's start with a 20x20 grass/ground grid");
  const stoneScaffoldIntent = parseWorldScaffoldIntent('create a 10x30 stone ground grid');
  const dirtScaffoldIntent = parseWorldScaffoldIntent('make a 15 by 15 dirt grid');
  const oneByOneScaffoldIntent = parseWorldScaffoldIntent('1x1 grass grid');
  const oversizedScaffoldIntent = parseWorldScaffoldIntent("let's start with a 200x200 grass grid");
  const zeroWidthIntent = parseWorldScaffoldIntent('0x10 grid');
  const negativeHeightIntent = parseWorldScaffoldIntent('10x-5 grid');
  const unsupportedMaterialIntent = parseWorldScaffoldIntent('create a 20x20 lava grid');
  const missingDimensionsIntent = parseWorldScaffoldIntent('make a grass grid');
  const missingMaterialIntent = parseWorldScaffoldIntent('make a 20x20 grid');
  const smallGridIntent = parseWorldScaffoldIntent('a small grid');
  assert.equal(scaffoldIntent.type, 'world_scaffold');
  assert.equal(scaffoldIntent.shape, 'grid');
  assert.equal(scaffoldIntent.kind, 'rect-ground-grid');
  assert.equal(scaffoldIntent.width, 20);
  assert.equal(scaffoldIntent.height, 20);
  assert.equal(scaffoldIntent.material, 'grass');
  assert.deepEqual(scaffoldIntent.position, { x: 0, y: 0, z: 0 });
  assert.equal(scaffoldIntent.validation.ok, true);
  assert.equal(scaffoldIntent.confidence.label, 'medium');
  assert.equal(stoneScaffoldIntent.validation.ok, true);
  assert.equal(stoneScaffoldIntent.material, 'stone');
  assert.equal(stoneScaffoldIntent.width, 10);
  assert.equal(stoneScaffoldIntent.height, 30);
  assert.equal(dirtScaffoldIntent.validation.ok, true);
  assert.equal(dirtScaffoldIntent.material, 'dirt');
  assert.equal(dirtScaffoldIntent.parse.dimensionSyntax, 'by');
  assert.equal(dirtScaffoldIntent.confidence.label, 'medium');
  assert.equal(oneByOneScaffoldIntent.validation.ok, true);
  assert.equal(oneByOneScaffoldIntent.width, 1);
  assert.equal(oneByOneScaffoldIntent.height, 1);
  assert.equal(oversizedScaffoldIntent.validation.ok, false);
  assert.match(oversizedScaffoldIntent.validation.reason, /100x100 or smaller/i);
  assert.equal(zeroWidthIntent.validation.ok, false);
  assert.equal(zeroWidthIntent.validation.code, 'non_positive_dimensions');
  assert.equal(negativeHeightIntent.validation.ok, false);
  assert.equal(negativeHeightIntent.validation.code, 'non_positive_dimensions');
  assert.equal(unsupportedMaterialIntent.validation.ok, false);
  assert.match(unsupportedMaterialIntent.validation.reason, /Unsupported scaffold material "lava"/);
  assert.equal(missingDimensionsIntent.validation.ok, false);
  assert.equal(missingDimensionsIntent.validation.reason, 'Could not parse grid dimensions.');
  assert.equal(missingMaterialIntent.validation.ok, false);
  assert.equal(missingMaterialIntent.validation.reason, 'Could not parse scaffold material.');
  assert.equal(smallGridIntent, null);

  const acceptedModelInterpretation = await interpretScaffoldIntentWithModel('make a small stone platform to build on', {
    backend: 'ollama-fixture',
    model: 'scaffold-fixture',
    callModel: async () => ({
      text: JSON.stringify({
        candidate: {
          type: 'world_scaffold',
          shape: 'grid',
          width: 12,
          height: 8,
          material: 'stone',
          position: { x: 0, y: 0, z: 0 },
        },
      }),
      json: {
        candidate: {
          type: 'world_scaffold',
          shape: 'grid',
          width: 12,
          height: 8,
          material: 'stone',
          position: { x: 0, y: 0, z: 0 },
        },
      },
    }),
  });
  assert.equal(acceptedModelInterpretation.source, 'model-assisted');
  assert.equal(acceptedModelInterpretation.attempted, true);
  assert.equal(acceptedModelInterpretation.accepted, true);
  assert.equal(acceptedModelInterpretation.status, 'accepted');
  assert.equal(acceptedModelInterpretation.candidate.material, 'stone');

  const grassyAreaInterpretation = await interpretScaffoldIntentWithModel('make a grassy area', {
    backend: 'ollama-fixture',
    model: 'scaffold-fixture',
    callModel: async () => ({
      text: JSON.stringify({
        candidate: {
          type: 'world_scaffold',
          shape: 'grid',
          width: 6,
          height: 6,
          material: 'grass',
          position: { x: 0, y: 0, z: 0 },
        },
      }),
      json: {
        candidate: {
          type: 'world_scaffold',
          shape: 'grid',
          width: 6,
          height: 6,
          material: 'grass',
          position: { x: 0, y: 0, z: 0 },
        },
      },
    }),
  });
  assert.equal(grassyAreaInterpretation.accepted, true);
  assert.equal(grassyAreaInterpretation.candidate.width, 6);
  assert.equal(grassyAreaInterpretation.candidate.height, 6);

  const undersizedStarterInterpretation = await interpretScaffoldIntentWithModel('give me a decent grassy starter area', {
    backend: 'ollama-fixture',
    model: 'scaffold-fixture',
    callModel: async () => ({
      text: JSON.stringify({
        candidate: {
          type: 'world_scaffold',
          shape: 'grid',
          width: 5,
          height: 5,
          material: 'grass',
          position: { x: 0, y: 0, z: 0 },
        },
      }),
      json: {
        candidate: {
          type: 'world_scaffold',
          shape: 'grid',
          width: 5,
          height: 5,
          material: 'grass',
          position: { x: 0, y: 0, z: 0 },
        },
      },
    }),
  });
  assert.equal(undersizedStarterInterpretation.accepted, true);
  assert.equal(undersizedStarterInterpretation.status, 'accepted');
  assert.equal(undersizedStarterInterpretation.candidate.width, 5);
  assert.equal(undersizedStarterInterpretation.candidate.height, 5);

  const buildOnInterpretation = await interpretScaffoldIntentWithModel('something to build on', {
    backend: 'ollama-fixture',
    model: 'scaffold-fixture',
    callModel: async () => ({
      text: JSON.stringify({
        candidate: {
          type: 'world_scaffold',
          shape: 'grid',
          width: 6,
          height: 6,
          material: 'stone',
          position: { x: 0, y: 0, z: 0 },
        },
      }),
      json: {
        candidate: {
          type: 'world_scaffold',
          shape: 'grid',
          width: 6,
          height: 6,
          material: 'stone',
          position: { x: 0, y: 0, z: 0 },
        },
      },
    }),
  });
  assert.equal(buildOnInterpretation.accepted, true);
  assert.equal(buildOnInterpretation.candidate.material, 'stone');

  const starterVillageInterpretation = await interpretScaffoldIntentWithModel('set up a basic ground grid for a first village', {
    backend: 'ollama-fixture',
    model: 'scaffold-fixture',
    callModel: async () => ({
      text: JSON.stringify({
        candidate: {
          type: 'world_scaffold',
          shape: 'grid',
          width: 5,
          height: 5,
          material: 'grass',
          position: { x: 0, y: 0, z: 0 },
        },
      }),
      json: {
        candidate: {
          type: 'world_scaffold',
          shape: 'grid',
          width: 5,
          height: 5,
          material: 'grass',
          position: { x: 0, y: 0, z: 0 },
        },
      },
    }),
  });
  assert.equal(starterVillageInterpretation.accepted, true);
  assert.equal(starterVillageInterpretation.candidate.width, 5);
  assert.equal(starterVillageInterpretation.candidate.height, 5);

  const smallGridInterpretation = await interpretScaffoldIntentWithModel('a small grid', {
    backend: 'ollama-fixture',
    model: 'scaffold-fixture',
    callModel: async () => ({
      text: JSON.stringify({
        candidate: {
          type: 'world_scaffold',
          shape: 'grid',
          width: 4,
          height: 4,
          material: 'grass',
          position: { x: 0, y: 0, z: 0 },
        },
      }),
      json: {
        candidate: {
          type: 'world_scaffold',
          shape: 'grid',
          width: 4,
          height: 4,
          material: 'grass',
          position: { x: 0, y: 0, z: 0 },
        },
      },
    }),
  });
  assert.equal(smallGridInterpretation.accepted, true);
  assert.equal(smallGridInterpretation.candidate.width, 4);
  assert.equal(smallGridInterpretation.candidate.height, 4);

  const malformedModelInterpretation = await interpretScaffoldIntentWithModel('give me a decent grassy starter area', {
    callModel: async () => {
      throw new Error('Local model response was not valid JSON: Unexpected token } in JSON at position 12');
    },
  });
  assert.equal(malformedModelInterpretation.accepted, false);
  assert.equal(malformedModelInterpretation.status, 'rejected_malformed_output');

  const unsupportedModelInterpretation = await interpretScaffoldIntentWithModel('set up a basic ground grid for a first village', {
    callModel: async () => ({
      text: JSON.stringify({
        candidate: {
          type: 'world_scaffold',
          shape: 'circle',
          width: 16,
          height: 16,
          material: 'lava',
          position: { x: 0, y: 0, z: 0 },
        },
      }),
      json: {
        candidate: {
          type: 'world_scaffold',
          shape: 'circle',
          width: 16,
          height: 16,
          material: 'lava',
          position: { x: 0, y: 0, z: 0 },
        },
      },
    }),
  });
  assert.equal(unsupportedModelInterpretation.accepted, false);
  assert.equal(unsupportedModelInterpretation.status, 'rejected_candidate');
  assert.match(unsupportedModelInterpretation.reason, /Unsupported scaffold shape "circle"/);

  const unavailableModelInterpretation = await interpretScaffoldIntentWithModel('give me a decent grassy starter area', {
    callModel: async () => {
      throw new Error('No fetch implementation is available for callOllamaGenerate.');
    },
  });
  assert.equal(unavailableModelInterpretation.accepted, false);
  assert.equal(unavailableModelInterpretation.status, 'model_unavailable');

  const resolveScaffoldRoute = (promptText, modelInterpreter) => resolveWorldScaffoldExecutiveRoute({
    promptText,
    envelope: normalizeExecutiveEnvelope({
      entries: [{ type: 'prompt', content: promptText }],
    }),
    graphs: {
      system: { nodes: [], edges: [] },
      world: { nodes: [], edges: [] },
    },
    modelInterpreter,
  });

  const createEmptySpatialWorkspace = () => ({
    graph: { nodes: [], edges: [] },
    graphs: {
      system: { nodes: [], edges: [] },
      world: { nodes: [], edges: [] },
    },
    studio: {},
  });

  const deterministicScaffoldRoute = await resolveScaffoldRoute("let's start with a 20x20 grass grid", async () => {
    throw new Error('deterministic scaffold route should not call model interpreter');
  });
  assert.equal(deterministicScaffoldRoute.statusCode, 200);
  assert.equal(deterministicScaffoldRoute.body.interpretation.source, 'deterministic');
  assert.equal(deterministicScaffoldRoute.body.interpretation.attempted, false);
  assert.equal(deterministicScaffoldRoute.body.evaluation.scorecard.validity, 'pass');
  assert.equal(deterministicScaffoldRoute.body.evaluation.scorecard.suitability, 'pass');
  assert.equal(deterministicScaffoldRoute.body.evaluation.scorecard.correctionApplied, false);
  assert.equal(deterministicScaffoldRoute.body.evaluation.scorecard.acceptedForMutationGeneration, true);
  const scaffoldWorkspace = applySpatialMutationsToWorkspace(createEmptySpatialWorkspace(), deterministicScaffoldRoute.body.mutations).workspace;
  const parsedWorldEditIntent = parseWorldEditIntent('add water tiles to the grass grid', scaffoldWorkspace.graphs);
  assert.equal(parsedWorldEditIntent.action, 'paint_tiles');
  assert.equal(parsedWorldEditIntent.requestedMaterial, 'water');
  assert.equal(parsedWorldEditIntent.supported, false);
  assert.equal(parsedWorldEditIntent.targetNodeId, scaffoldWorkspace.graphs.world.nodes[0].id);
  assert.match(parsedWorldEditIntent.validation.reason, /not implemented yet/i);
  const unsupportedWorldEditRoute = resolveWorldEditExecutiveRoute({
    promptText: 'add water tiles to the grass grid',
    envelope: normalizeExecutiveEnvelope({
      entries: [{ type: 'prompt', content: 'add water tiles to the grass grid' }],
    }),
    graphs: scaffoldWorkspace.graphs,
  });
  assert.equal(unsupportedWorldEditRoute.matched, true);
  assert.equal(unsupportedWorldEditRoute.statusCode, 422);
  assert.equal(unsupportedWorldEditRoute.body.route, 'world-edit');
  assert.equal(unsupportedWorldEditRoute.body.supported, false);
  assert.equal(unsupportedWorldEditRoute.body.mutationGeneration.mutationCount, 0);
  assert.match(unsupportedWorldEditRoute.body.error, /Supported today: scaffold creation only/i);
  const missingScaffoldEditIntent = parseWorldEditIntent('add water tiles to the grass grid', createEmptySpatialWorkspace().graphs);
  assert.equal(missingScaffoldEditIntent.validation.code, 'missing_scaffold');
  assert.match(missingScaffoldEditIntent.validation.reason, /Create a scaffold first/i);
  const missingScaffoldEditRoute = resolveWorldEditExecutiveRoute({
    promptText: 'add water tiles to the grass grid',
    envelope: normalizeExecutiveEnvelope({
      entries: [{ type: 'prompt', content: 'add water tiles to the grass grid' }],
    }),
    graphs: createEmptySpatialWorkspace().graphs,
  });
  assert.equal(missingScaffoldEditRoute.statusCode, 422);
  assert.match(missingScaffoldEditRoute.body.error, /Create a scaffold first/i);

  for (const [promptText, width, height, material] of [
    ['20x20 grass grid', 20, 20, 'grass'],
    ['10x30 stone ground grid', 10, 30, 'stone'],
    ['15 by 15 dirt grid', 15, 15, 'dirt'],
  ]) {
    const exactRoute = await resolveScaffoldRoute(promptText, async () => {
      throw new Error('exact deterministic scaffold route should not call model interpreter');
    });
    assert.equal(exactRoute.statusCode, 200, promptText);
    assert.equal(exactRoute.body.interpretation.source, 'deterministic', promptText);
    assert.equal(exactRoute.body.interpretation.attempted, false, promptText);
    assert.equal(exactRoute.body.evaluation.scorecard.correctionApplied, false, promptText);
    assert.equal(exactRoute.body.intent.width, width, promptText);
    assert.equal(exactRoute.body.intent.height, height, promptText);
    assert.equal(exactRoute.body.intent.material, material, promptText);
    const exactApplyResult = applySpatialMutationsToWorkspace(createEmptySpatialWorkspace(), exactRoute.body.mutations);
    assert.equal(exactApplyResult.status, 'applied', promptText);
    assert.equal(exactApplyResult.workspace.graphs.world.nodes[0].metadata.scaffold.dimensions.width, width, promptText);
    assert.equal(exactApplyResult.workspace.graphs.world.nodes[0].metadata.scaffold.dimensions.height, height, promptText);
    assert.equal(exactApplyResult.workspace.graphs.world.nodes[0].metadata.scaffold.material, material, promptText);
    assert.equal(exactApplyResult.workspace.mutationGate.activity[0].classification, 'safe', promptText);
  }

  let fuzzyRouteModelCalls = 0;
  const fuzzyScaffoldRoute = await resolveScaffoldRoute('make a small stone platform to build on', async () => {
    fuzzyRouteModelCalls += 1;
    return acceptedModelInterpretation;
  });
  assert.equal(fuzzyRouteModelCalls, 1);
  assert.equal(fuzzyScaffoldRoute.statusCode, 200);
  assert.equal(fuzzyScaffoldRoute.body.interpretation.source, 'model-assisted');
  assert.equal(fuzzyScaffoldRoute.body.intent.material, 'stone');
  assert.equal(fuzzyScaffoldRoute.body.mutationGeneration.ok, true);
  assert.equal(fuzzyScaffoldRoute.body.evaluation.scorecard.correctionApplied, false);
  assert.equal(fuzzyScaffoldRoute.body.evaluation.finalCandidate.width, 12);
  assert.equal(fuzzyScaffoldRoute.body.evaluation.finalCandidate.height, 8);

  const correctedStarterScaffoldRoute = await resolveScaffoldRoute('give me a decent grassy starter area', async () => undersizedStarterInterpretation);
  assert.equal(correctedStarterScaffoldRoute.statusCode, 200);
  assert.equal(correctedStarterScaffoldRoute.body.interpretation.source, 'model-assisted');
  assert.equal(correctedStarterScaffoldRoute.body.evaluation.scorecard.sizeAdequacy, 'warn');
  assert.equal(correctedStarterScaffoldRoute.body.evaluation.scorecard.suitability, 'warn');
  assert.equal(correctedStarterScaffoldRoute.body.evaluation.scorecard.correctionApplied, true);
  assert.match(correctedStarterScaffoldRoute.body.evaluation.scorecard.correctionReason, /minimum starter grid size of 8x8/i);
  assert.equal(correctedStarterScaffoldRoute.body.evaluation.originalCandidate.width, 5);
  assert.equal(correctedStarterScaffoldRoute.body.evaluation.correctedCandidate.width, 8);
  assert.equal(correctedStarterScaffoldRoute.body.evaluation.correctedCandidate.height, 8);
  assert.equal(correctedStarterScaffoldRoute.body.evaluation.finalCandidate.width, 8);
  assert.equal(correctedStarterScaffoldRoute.body.evaluation.finalCandidate.height, 8);
  assert.equal(correctedStarterScaffoldRoute.body.intent.width, 8);
  assert.equal(correctedStarterScaffoldRoute.body.intent.height, 8);
  assert.equal(correctedStarterScaffoldRoute.body.mutationGeneration.ok, true);

  const starterVillageScaffoldRoute = await resolveScaffoldRoute('set up a basic ground grid for a first village', async () => starterVillageInterpretation);
  assert.equal(starterVillageScaffoldRoute.statusCode, 200);
  assert.equal(starterVillageScaffoldRoute.body.interpretation.source, 'model-assisted');
  assert.equal(starterVillageScaffoldRoute.body.evaluation.scorecard.correctionApplied, true);
  assert.equal(starterVillageScaffoldRoute.body.evaluation.finalCandidate.width, 8);
  assert.equal(starterVillageScaffoldRoute.body.evaluation.finalCandidate.height, 8);

  const grassyAreaScaffoldRoute = await resolveScaffoldRoute('make a grassy area', async () => grassyAreaInterpretation);
  assert.equal(grassyAreaScaffoldRoute.statusCode, 200);
  assert.equal(grassyAreaScaffoldRoute.body.interpretation.source, 'model-assisted');
  assert.equal(grassyAreaScaffoldRoute.body.evaluation.scorecard.correctionApplied, false);
  assert.equal(grassyAreaScaffoldRoute.body.evaluation.finalCandidate.width, 6);
  assert.equal(grassyAreaScaffoldRoute.body.evaluation.finalCandidate.height, 6);

  const buildOnScaffoldRoute = await resolveScaffoldRoute('something to build on', async () => buildOnInterpretation);
  assert.equal(buildOnScaffoldRoute.statusCode, 200);
  assert.equal(buildOnScaffoldRoute.body.interpretation.source, 'model-assisted');
  assert.equal(buildOnScaffoldRoute.body.evaluation.scorecard.correctionApplied, true);
  assert.equal(buildOnScaffoldRoute.body.evaluation.finalCandidate.width, 8);
  assert.equal(buildOnScaffoldRoute.body.evaluation.finalCandidate.height, 8);
  assert.equal(buildOnScaffoldRoute.body.evaluation.finalCandidate.material, 'stone');

  const smallGridScaffoldRoute = await resolveScaffoldRoute('a small grid', async () => smallGridInterpretation);
  assert.equal(smallGridScaffoldRoute.statusCode, 200);
  assert.equal(smallGridScaffoldRoute.body.interpretation.source, 'model-assisted');
  assert.equal(smallGridScaffoldRoute.body.evaluation.scorecard.correctionApplied, false);
  assert.equal(smallGridScaffoldRoute.body.evaluation.finalCandidate.width, 4);
  assert.equal(smallGridScaffoldRoute.body.evaluation.finalCandidate.height, 4);

  for (const [promptText, routeResult, width, height, material] of [
    ['give me a decent grassy starter area', correctedStarterScaffoldRoute, 8, 8, 'grass'],
    ['make a small stone platform to build on', fuzzyScaffoldRoute, 12, 8, 'stone'],
    ['set up a basic ground grid for a first village', starterVillageScaffoldRoute, 8, 8, 'grass'],
    ['make a grassy area', grassyAreaScaffoldRoute, 6, 6, 'grass'],
    ['something to build on', buildOnScaffoldRoute, 8, 8, 'stone'],
    ['a small grid', smallGridScaffoldRoute, 4, 4, 'grass'],
  ]) {
    const applyResultForPrompt = applySpatialMutationsToWorkspace(createEmptySpatialWorkspace(), routeResult.body.mutations);
    assert.equal(applyResultForPrompt.status, 'applied', promptText);
    assert.equal(applyResultForPrompt.workspace.graphs.world.nodes[0].metadata.scaffold.dimensions.width, width, promptText);
    assert.equal(applyResultForPrompt.workspace.graphs.world.nodes[0].metadata.scaffold.dimensions.height, height, promptText);
    assert.equal(applyResultForPrompt.workspace.graphs.world.nodes[0].metadata.scaffold.material, material, promptText);
    assert.equal(applyResultForPrompt.workspace.mutationGate.activity[0].classification, 'safe', promptText);
    assert.match(applyResultForPrompt.recentWorldChange.summary, new RegExp(`${width}x${height} ${material}`, 'i'), promptText);
  }

  const malformedScaffoldRoute = await resolveScaffoldRoute('give me a decent grassy starter area', async () => malformedModelInterpretation);
  assert.equal(malformedScaffoldRoute.statusCode, 422);
  assert.equal(malformedScaffoldRoute.body.interpretation.status, 'rejected_malformed_output');
  assert.equal(malformedScaffoldRoute.body.evaluation.scorecard.acceptedForMutationGeneration, false);
  assert.equal(malformedScaffoldRoute.body.mutations.length, 0);

  const unavailableScaffoldRoute = await resolveScaffoldRoute('give me a decent grassy starter area', async () => unavailableModelInterpretation);
  assert.equal(unavailableScaffoldRoute.statusCode, 503);
  assert.equal(unavailableScaffoldRoute.body.interpretation.attempted, true);
  assert.equal(unavailableScaffoldRoute.body.interpretation.fallbackUsed, false);
  assert.equal(unavailableScaffoldRoute.body.evaluation.scorecard.acceptedForMutationGeneration, false);
  assert.equal(unavailableScaffoldRoute.body.evaluation.reason, 'No scaffold candidate to evaluate.');

  let oversizedModelCalls = 0;
  const oversizedScaffoldRoute = await resolveScaffoldRoute("let's start with a 200x200 grass grid", async () => {
      oversizedModelCalls += 1;
      return acceptedModelInterpretation;
  });
  assert.equal(oversizedModelCalls, 0);
  assert.equal(oversizedScaffoldRoute.statusCode, 422);
  assert.equal(oversizedScaffoldRoute.body.interpretation.source, 'deterministic');
  assert.equal(oversizedScaffoldRoute.body.interpretation.attempted, false);
  assert.equal(oversizedScaffoldRoute.body.evaluation.scorecard.validity, 'fail');
  assert.equal(oversizedScaffoldRoute.body.evaluation.scorecard.acceptedForMutationGeneration, false);

  let invalidDimensionModelCalls = 0;
  const zeroWidthScaffoldRoute = await resolveScaffoldRoute('0x10 grid', async () => {
    invalidDimensionModelCalls += 1;
    return acceptedModelInterpretation;
  });
  assert.equal(zeroWidthScaffoldRoute.statusCode, 422);
  assert.equal(zeroWidthScaffoldRoute.body.error, 'Grid dimensions must be positive integers.');
  assert.equal(zeroWidthScaffoldRoute.body.evaluation.scorecard.sizeAdequacy, 'fail');
  assert.equal(invalidDimensionModelCalls, 0);

  const negativeHeightScaffoldRoute = await resolveScaffoldRoute('10x-5 grid', async () => {
    invalidDimensionModelCalls += 1;
    return acceptedModelInterpretation;
  });
  assert.equal(negativeHeightScaffoldRoute.statusCode, 422);
  assert.equal(negativeHeightScaffoldRoute.body.error, 'Grid dimensions must be positive integers.');
  assert.equal(negativeHeightScaffoldRoute.body.evaluation.scorecard.sizeAdequacy, 'fail');
  assert.equal(invalidDimensionModelCalls, 0);

  const unsupportedMaterialScaffoldRoute = await resolveScaffoldRoute('10x10 lava grid', async () => acceptedModelInterpretation);
  assert.equal(unsupportedMaterialScaffoldRoute.statusCode, 422);
  assert.match(unsupportedMaterialScaffoldRoute.body.error, /Unsupported scaffold material "lava"/);
  assert.equal(unsupportedMaterialScaffoldRoute.body.evaluation.scorecard.materialSupport, 'fail');
  assert.equal(unsupportedMaterialScaffoldRoute.body.mutations.length, 0);

  for (const promptText of ['make it kinda big', 'a huge space idk', 'infinite grass world']) {
    const nonScaffoldRoute = await resolveScaffoldRoute(promptText, async () => acceptedModelInterpretation);
    assert.equal(nonScaffoldRoute, null, promptText);
  }
  assert.ok(app.router.stack.some((layer) => Array.isArray(layer.route?.path) && layer.route.path.includes('/qa')));
  assert.ok(app.router.stack.some((layer) => layer.route?.path === '/api/projects/run'));
  assert.ok(app.router.stack.some((layer) => layer.route?.path === '/api/spatial/archive/writeback'));
  assert.ok(app.router.stack.some((layer) => layer.route?.path === '/api/spatial/layout/catalog'));
  assert.ok(app.router.stack.some((layer) => layer.route?.path === '/api/spatial/layout/actions'));
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
  assert.ok([null, 'static-web'].includes(topdownProject.projectType));
  assert.ok([true, false].includes(topdownProject.launchable));
  assert.ok([null, 'static-web'].includes(detectRunnableProjectType('topdown-slice', topdownProject.path)));
  assert.equal(detectRunnableProjectType('ace-self', path.resolve(process.cwd(), '..')), null);

  const rebuiltProject = buildProjectRecord('topdown-slice', topdownProject.path);
  assert.ok([null, 'static-web'].includes(rebuiltProject.projectType));
  assert.ok([true, false].includes(rebuiltProject.launchable));
  assert.ok([null, 'http://127.0.0.1:4173/'].includes(rebuiltProject.supportedOrigin));

  const smokeBaseUrl = rebuiltProject.supportedOrigin || 'http://127.0.0.1:4173/';
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

  if (rebuiltProject.launchable) {
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
  }

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

  const blockedGuard = buildGuardSurfacePayload({
    stage: 'executor',
    preflight: {
      ok: false,
      blockers: ['Repository has uncommitted tracked changes.'],
      checks: {
        repoClean: { ok: false },
      },
    },
  });
  assert.equal(blockedGuard.ok, false);
  assert.equal(blockedGuard.stage, 'executor');
  assert.equal(blockedGuard.guard_status, 'blocked');
  assert.equal(blockedGuard.guard_reason, 'Repository has uncommitted tracked changes.');
  assert.deepEqual(blockedGuard.guard_reasons, ['Repository has uncommitted tracked changes.']);

  const readyGuard = buildGuardSurfacePayload({
    stage: 'planner',
    preflight: {
      ok: true,
      blockers: [],
      checks: {
        repoClean: { ok: true },
      },
      summary: 'Planner preflight passed.',
    },
  });
  assert.equal(readyGuard.ok, true);
  assert.equal(readyGuard.guard_status, 'ready');
  assert.equal(readyGuard.guard_reason, 'Planner preflight passed.');

  const cacheReusedGuard = buildGuardSurfacePayload({
    stage: 'rebuild',
    preflight: {
      ok: false,
      blockers: ['Patch already exists; reuse the cached task artefact instead of rebuilding.'],
      checks: {},
    },
    cacheStatus: 'reused',
    cacheReason: 'Cached patch already exists; rebuild skipped.',
  });
  assert.equal(cacheReusedGuard.ok, true);
  assert.equal(cacheReusedGuard.guard_status, 'cache_reused');
  assert.equal(cacheReusedGuard.cache_status, 'reused');
  assert.match(cacheReusedGuard.guard_reason, /cached patch already exists/i);

  const genericPreflight = evaluateStagePreflightSurface({
    stage: 'planner',
    projectKey: 'ace-self',
    projectPath: 'C:/workspace/ace-self',
  });
  assert.equal(genericPreflight.stage, 'planner');
  assert.equal(typeof genericPreflight.guard_status, 'string');
  assert.equal(Object.prototype.hasOwnProperty.call(genericPreflight, 'preflight'), true);
  assert.equal(typeof genericPreflight.policy?.decision, 'string');
  assert.equal(Object.prototype.hasOwnProperty.call(genericPreflight.policy || {}, 'fix_task_created'), true);

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

  writeFailureHistory(qaRoot, {
    version: 'ace/failure-memory.v1',
    updated_at: '2026-03-25T09:30:00.000Z',
    entries: [
      {
        failure_key: 'windows_spawn_eperm',
        stage: 'executor',
        agent_id: 'executor',
        agent_version: 'ace/executor.v1',
        count: 4,
        first_seen: '2026-03-25T08:30:00.000Z',
        last_seen: '2026-03-25T09:20:00.000Z',
        related_runs: ['qa_guardrail_1'],
        related_tools: ['spawn'],
        related_stages: ['executor'],
        related_projects: ['ui'],
        example_messages: ['spawn EPERM'],
        source_count: 4,
      },
    ],
  });
  fs.writeFileSync(path.join(qaStorage, 'qa_safe_mode_1.json'), `${JSON.stringify({
    id: 'qa_safe_mode_1',
    scenario: 'layout-pass',
    mode: 'interactive',
    trigger: 'manual',
    status: 'failed',
    verdict: 'failed',
    error: 'Console errors were captured during the browser pass.',
    createdAt: '2026-03-25T09:40:00.000Z',
    finishedAt: '2026-03-25T09:41:00.000Z',
    findings: [
      { id: 'console-errors', severity: 'error', summary: 'Console errors were captured during the browser pass.' },
    ],
    steps: [
      { id: 'open', label: 'Open ACE', status: 'completed', verdict: 'pass' },
      { id: 'analyze', label: 'Analyze layout and runtime', status: 'failed', verdict: 'failed' },
    ],
    artifacts: { screenshots: [] },
    console: [],
    network: [],
  }, null, 2)}\n`, 'utf8');
  const updatedQaState = buildQAStatePayload(qaRoot);
  const safeModeState = buildSafeModeSnapshot(qaRoot, {
    healthSnapshot: {
      ok: false,
      pid: 1234,
      startedAt: '2026-03-25T09:00:00.000Z',
      safeMode: true,
      reason: 'Spatial health payload shape mismatch.',
      bootHealth: {
        checked: true,
        ok: false,
        safeMode: true,
        reason: 'Spatial health payload shape mismatch.',
        checkedAt: '2026-03-25T09:05:00.000Z',
        stateShape: { graphs: 2 },
      },
      selfUpgrade: {
        status: 'idle',
        deploy: {
          status: 'idle',
          health: {
            status: 'ready',
            pid: 1234,
            startedAt: '2026-03-25T09:00:00.000Z',
          },
        },
      },
    },
  });
  assert.equal(safeModeState.safeMode, true);
  assert.equal(safeModeState.criticalErrors[0].source, 'boot-health');
  assert.ok(safeModeState.criticalErrors.some((entry) => entry.failureKey === 'windows_spawn_eperm'));
  assert.ok(safeModeState.failingTestNames.includes('Analyze layout and runtime'));
  assert.ok(safeModeState.failingTestNames.some((entry) => /console errors were captured/i.test(entry)));

  const diagnosis = runSafeModeDiagnosis(qaRoot, {
    healthSnapshot: safeModeState.health,
    qaState: updatedQaState,
  });
  assert.equal(diagnosis.ok, true);
  assert.equal(diagnosis.snapshot.safeMode, true);
  assert.ok(diagnosis.artifactRefs[0].includes('brain/context/safe_mode/diagnosis.json'));
  assert.equal(fs.existsSync(path.join(qaRoot, 'brain', 'context', 'safe_mode', 'diagnosis.json')), true);

  const constrainedFixPass = runConstrainedSafeModeFixPass(qaRoot, {
    healthSnapshot: safeModeState.health,
    qaState: updatedQaState,
  });
  assert.equal(constrainedFixPass.ok, true);
  assert.equal(constrainedFixPass.fixTask.stage, 'safe-mode');
  assert.equal(constrainedFixPass.fixTask.action, 'constrained-fix-pass');
  assert.equal(fs.existsSync(path.join(qaRoot, 'brain', 'context', 'safe_mode', 'constrained-fix-pass.json')), true);
  assert.equal(fs.existsSync(path.join(qaRoot, 'brain', 'context', 'autonomy_fix_tasks.json')), true);
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

  const ctoWorkspace = {
    ...qaWorkspace,
    studio: {
      ...qaWorkspace.studio,
      orchestrator: {
        ...qaWorkspace.studio.orchestrator,
        desks: {
          ...(qaWorkspace.studio.orchestrator.desks || {}),
          'cto-architect': {
            mission: 'Manage department context and guardrails',
            currentGoal: 'Keep desk ownership aligned',
            localState: 'ready',
            workItems: [],
          },
        },
      },
      deskProperties: {
        ...(qaWorkspace.studio.deskProperties || {}),
        'cto-architect': {
          managedAgents: ['planner'],
          moduleIds: [],
          manualTests: [{ id: 'cto-review', verdict: 'pass', notes: 'Check guardrails', createdAt: '2026-03-25T10:00:00.000Z' }],
          departmentContext: 'CTO manages context and ownership',
          guardrails: ['No unreviewed ownership changes'],
          contextSlices: [{ id: 'slice-1', summary: 'Planner brief', detail: 'Preserved for CTO review' }],
        },
      },
    },
  };
  const ctoDeskPayload = buildDeskPropertiesPayload(ctoWorkspace, 'cto-architect', qaState);
  assert.equal(ctoDeskPayload.truth.department.label, 'Control Centre');
  assert.equal(ctoDeskPayload.truth.department.context, 'CTO manages context and ownership');
  assert.equal(ctoDeskPayload.truth.guardrails.length, 1);
  assert.equal(ctoDeskPayload.truth.context.slices.length, 1);
  assert.equal(ctoDeskPayload.truth.scorecards.length, qaDeskPayload.qa.scorecards.length);
  assert.ok(Array.isArray(ctoDeskPayload.agents));

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
  assert.equal(applyResult.queued, 0);
  assert.equal(applyResult.blocked, 0);
  assert.equal(applyResult.workspace.graphs.system.nodes.length, 2);
  assert.equal(applyResult.workspace.graphs.system.edges.length, 1);
  assert.equal(applyResult.workspace.graphs.system.edges[0].relationshipType, 'relates_to');
  assert.equal(applyResult.workspace.graphs.system.edges[0].visualForm, 'string');
  assert.equal(applyResult.workspace.graphs.system.edges[0].strength >= 1, true);
  assert.equal(applyResult.workspace.mutationGate.approvalQueue.length, 0);
  assert.equal(applyResult.workspace.mutationGate.activity.length, 2);
  assert.equal(applyResult.workspace.mutationGate.activity[0].classification, 'safe');
  assert.equal(applyResult.recentWorldChange, null);

  const noOpResult = applySpatialMutationsToWorkspace(applyResult.workspace, [
    {
      type: 'create_edge',
      edge: { source: 'node_1', target: 'node_2', relationship_type: 'relates_to', supports: ['qa-approval'], validatedBy: ['planner'] },
    },
  ]);
  assert.equal(noOpResult.ok, true);
  assert.equal(noOpResult.status, 'applied');
  assert.equal(noOpResult.confirmed, true);
  assert.equal(noOpResult.applied, 1);
  assert.equal(noOpResult.workspace.graphs.system.edges[0].strandCount >= 1, true);
  assert.equal(noOpResult.workspace.graphs.system.edges[0].supports.includes('qa-approval'), true);

  const scaffoldMutationPlan = buildWorldScaffoldMutationPlan(mutationWorkspace.graphs, scaffoldIntent);
  const invalidScaffoldMutationPlan = buildWorldScaffoldMutationPlan(mutationWorkspace.graphs, missingDimensionsIntent);
  assert.equal(scaffoldMutationPlan.ok, true);
  assert.equal(scaffoldMutationPlan.deterministic, true);
  assert.equal(scaffoldMutationPlan.mutationCount, 1);
  assert.equal(scaffoldMutationPlan.mode, 'create_node');
  assert.equal(invalidScaffoldMutationPlan.ok, false);
  assert.equal(invalidScaffoldMutationPlan.mutationCount, 0);
  assert.equal(buildWorldScaffoldMutations(mutationWorkspace.graphs, missingDimensionsIntent).length, 0);
  const scaffoldMutations = buildWorldScaffoldMutations(mutationWorkspace.graphs, scaffoldIntent);
  assert.deepEqual(scaffoldMutationPlan.mutations, scaffoldMutations);
  assert.equal(scaffoldMutations.length, 1);
  assert.equal(scaffoldMutations[0].type, 'create_node');
  assert.equal(scaffoldMutations[0].layer, 'world');
  const scaffoldApplyResult = applySpatialMutationsToWorkspace(mutationWorkspace, scaffoldMutations);
  assert.equal(scaffoldApplyResult.ok, true);
  assert.equal(scaffoldApplyResult.status, 'applied');
  assert.equal(scaffoldApplyResult.confirmed, true);
  assert.equal(scaffoldApplyResult.workspace.graphs.world.nodes.length, 1);
  assert.equal(scaffoldApplyResult.workspace.graphs.world.nodes[0].metadata.scaffold.dimensions.width, 20);
  assert.equal(scaffoldApplyResult.workspace.graphs.world.nodes[0].metadata.scaffold.field.layers['0'].values[0][0], 'grass');
  assert.equal(scaffoldApplyResult.workspace.graphs.world.nodes[0].metadata.scaffold.field.layers['1'].width, 10);
  assert.equal(scaffoldApplyResult.workspace.graphs.world.nodes[0].metadata.scaffold.field.layers['1'].height, 10);
  assert.equal(scaffoldApplyResult.workspace.mutationGate.activity[0].classification, 'safe');
  assert.equal(buildSpatialRuntimePayload(scaffoldApplyResult.workspace).graphs.world.nodes.length, 1);
  assert.ok(scaffoldApplyResult.recentWorldChange);
  assert.equal(scaffoldApplyResult.recentWorldChange.items[0].kind, 'scaffold');
  assert.equal(scaffoldApplyResult.recentWorldChange.items[0].changeType, 'added');
  assert.equal(scaffoldApplyResult.recentWorldChange.counts.addedCells, 400);
  assert.match(scaffoldApplyResult.recentWorldChange.summary, /World scaffold created/i);

  const directScaffold = createWorldScaffold(scaffoldIntent);
  assert.equal(directScaffold.field.kind, 'spatial-field-bundle');
  assert.equal(directScaffold.field.baseLayer.width, 20);
  assert.equal(directScaffold.field.coarseLayer.width, 10);
  assert.equal(directScaffold.field.summary, 'Field base 20x20 @1x | coarse 10x10 @2x');

  const scaffoldResizeIntent = {
    ...scaffoldIntent,
    width: 24,
    totalCells: 480,
    summary: '24x20 grass grid',
  };
  const scaffoldResizeMutations = buildWorldScaffoldMutations(scaffoldApplyResult.workspace.graphs, scaffoldResizeIntent);
  assert.equal(scaffoldResizeMutations[0].type, 'modify_node');
  const scaffoldResizeResult = applySpatialMutationsToWorkspace(scaffoldApplyResult.workspace, scaffoldResizeMutations);
  assert.equal(scaffoldResizeResult.ok, true);
  assert.equal(scaffoldResizeResult.status, 'applied');
  assert.equal(scaffoldResizeResult.recentWorldChange.items[0].changeType, 'modified');
  assert.equal(scaffoldResizeResult.recentWorldChange.counts.addedCells, 80);
  assert.equal(scaffoldResizeResult.recentWorldChange.counts.modifiedCells, 0);

  const scaffoldUpdateMutations = buildWorldScaffoldMutations(scaffoldApplyResult.workspace.graphs, scaffoldIntent);
  assert.equal(scaffoldUpdateMutations[0].type, 'modify_node');
  const scaffoldUpdateResult = applySpatialMutationsToWorkspace(scaffoldApplyResult.workspace, scaffoldUpdateMutations);
  assert.equal(scaffoldUpdateResult.ok, true);
  assert.equal(scaffoldUpdateResult.status, 'no-op');
  assert.equal(scaffoldUpdateResult.blocked, 0);
  assert.equal(scaffoldUpdateResult.queued, 0);
  assert.equal(scaffoldUpdateResult.workspace.graphs.world.nodes.length, 1);
  assert.equal(scaffoldUpdateResult.recentWorldChange, null);

  const queuedResult = applySpatialMutationsToWorkspace({
    graph: {
      nodes: [{ id: 'node_ctx', type: 'text', content: 'Protected', position: { x: 0, y: 0 }, metadata: { graphLayer: 'system', agentId: 'context-manager' } }],
      edges: [],
    },
    graphs: {
      system: {
        nodes: [{ id: 'node_ctx', type: 'text', content: 'Protected', position: { x: 0, y: 0 }, metadata: { graphLayer: 'system', agentId: 'context-manager' } }],
        edges: [],
      },
      world: { nodes: [], edges: [] },
    },
    studio: {},
  }, [
    {
      type: 'modify_node',
      id: 'node_ctx',
      patch: { content: 'Review me first' },
    },
  ]);
  assert.equal(queuedResult.ok, true);
  assert.equal(queuedResult.status, 'queued');
  assert.equal(queuedResult.confirmed, false);
  assert.equal(queuedResult.applied, 0);
  assert.equal(queuedResult.queued, 1);
  assert.equal(queuedResult.blocked, 0);
  assert.equal(queuedResult.workspace.graphs.system.nodes[0].content, 'Protected');
  assert.equal(queuedResult.workspace.mutationGate.approvalQueue.length, 1);
  assert.equal(queuedResult.workspace.mutationGate.approvalQueue[0].classification, 'needs_approval');
  assert.equal(buildSpatialRuntimePayload(queuedResult.workspace).mutationGate.approvalQueue.length, 1);

  const blockedResult = applySpatialMutationsToWorkspace(mutationWorkspace, [
    {
      type: 'modify_node',
      id: 'missing-node',
      patch: { content: 'Broken' },
    },
  ]);
  assert.equal(blockedResult.ok, false);
  assert.equal(blockedResult.status, 'blocked');
  assert.equal(blockedResult.confirmed, false);
  assert.equal(blockedResult.applied, 0);
  assert.equal(blockedResult.queued, 0);
  assert.equal(blockedResult.blocked, 1);
  assert.match(blockedResult.reason, /missing node/i);
  assert.equal(blockedResult.workspace.graphs.system.nodes.length, 1);
  assert.equal(blockedResult.workspace.mutationGate.approvalQueue.length, 0);
  assert.equal(blockedResult.workspace.mutationGate.activity[0].status, 'blocked');
}
