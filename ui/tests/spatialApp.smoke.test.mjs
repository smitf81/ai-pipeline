import assert from 'node:assert/strict';
import path from 'node:path';

import { loadModuleCopy, smokeLoadSpatialApp } from './helpers/browser-module-loader.mjs';

export default async function runSpatialAppSmokeTest() {
  const spatialAppPath = path.resolve(process.cwd(), 'public', 'spatial', 'spatialApp.js');
  const spatialApp = await smokeLoadSpatialApp(spatialAppPath, { locationHref: 'http://localhost/?mode=qa' });
  assert.equal(spatialApp.default.loaded, true);
  assert.ok(spatialApp.default.firstRender);
  assert.equal(typeof spatialApp.buildRsgActivityEntry, 'function');
  assert.equal(typeof spatialApp.pushRsgActivityEntry, 'function');
  assert.equal(typeof spatialApp.shouldRunFocusedRsgLoop, 'function');
  assert.equal(typeof spatialApp.resolveGeneratedNodeInspection, 'function');
  assert.equal(typeof spatialApp.renderDeskSection, 'function');
  assert.equal(typeof spatialApp.renderSimLaunchOverlay, 'function');
  assert.equal(typeof spatialApp.buildDeskHierarchyModel, 'function');
  assert.equal(typeof spatialApp.buildSpatialNotebookErrorFallback, 'function');
  assert.equal(typeof spatialApp.SpatialNotebookErrorBoundary, 'function');
  assert.equal(typeof spatialApp.evaluateSpatialBootHealthSnapshot, 'function');
  assert.equal(typeof spatialApp.buildSpatialSafeModeShell, 'function');
  assert.equal(typeof spatialApp.normalizeDeskSectionPayload, 'function');
  assert.equal(typeof spatialApp.normalizeRosterSurfacePayload, 'function');
  assert.equal(typeof spatialApp.normalizeTruthPayload, 'function');
  assert.equal(typeof spatialApp.normalizeQAReportPayload, 'function');
  assert.equal(typeof spatialApp.normalizeDeskManagementDraft, 'function');
  assert.equal(typeof spatialApp.updateDeskManagementDraft, 'function');
  assert.equal(typeof spatialApp.clearDeskManagementDraft, 'function');
  assert.equal(typeof spatialApp.clearDeskManagementDraftSection, 'function');
  assert.equal(typeof spatialApp.normalizeRecentWorldChange, 'function');
  assert.equal(typeof spatialApp.formatRecentWorldChangeItem, 'function');
  assert.equal(typeof spatialApp.formatScaffoldInterpretationLabel, 'function');
  assert.equal(typeof spatialApp.formatWorldScaffoldEvaluationSummary, 'function');
  assert.equal(typeof spatialApp.buildStudioLinks, 'function');
  assert.equal(typeof spatialApp.buildRelationshipInspectorPayload, 'function');
  assert.equal(typeof spatialApp.resolveSelectedRelationshipInspector, 'function');
  assert.equal(typeof spatialApp.hitTestRelationshipEdgeAtPoint, 'function');
  assert.equal(typeof spatialApp.renderRelationshipInspectorPanel, 'function');
  const fallback = spatialApp.buildSpatialNotebookErrorFallback({
    boundaryId: 'qa-panels',
    title: 'QA panels unavailable',
    error: new Error('boom'),
  });
  assert.equal(fallback.args[1]['data-qa'], 'spatial-error-fallback-qa-panels');
  assert.equal(spatialApp.SpatialNotebookErrorBoundary.getDerivedStateFromError(new Error('boom')).hasError, true);
  const healthyBoot = spatialApp.evaluateSpatialBootHealthSnapshot({
    ok: true,
    pid: 1234,
    startedAt: '2026-03-29T00:00:00.000Z',
    selfUpgrade: {
      status: 'healthy',
      deploy: {
        status: 'healthy',
        health: { status: 'healthy', pid: 1234, startedAt: '2026-03-29T00:00:00.000Z' },
      },
    },
    mutationGate: { activity: [] },
    qaState: {},
    graphs: { system: { nodes: [], edges: [] } },
    graph: { nodes: [], edges: [] },
  });
  assert.equal(healthyBoot.safeMode, false);
  const brokenBoot = spatialApp.evaluateSpatialBootHealthSnapshot({ ok: true });
  assert.equal(brokenBoot.safeMode, true);
  assert.equal(spatialApp.buildSpatialSafeModeShell({ reason: 'boot failed' }).args[0].name, 'SafeShell');
  const normalizedRoster = spatialApp.normalizeRosterSurfacePayload({
    department: null,
    summary: null,
    departments: null,
    desks: [{ id: 'desk_1', label: 'Desk 1', assignedRoster: null, roleCoverage: null, roster: null }],
    openRoles: null,
    blockers: null,
    hiringSignals: null,
  });
  assert.equal(normalizedRoster.department.name, 'People Plan');
  assert.deepEqual(normalizedRoster.desks[0].assignedRoster, []);
  assert.deepEqual(normalizedRoster.desks[0].roleCoverage, []);
  assert.deepEqual(normalizedRoster.desks[0].roster, []);
  const normalizedTruth = spatialApp.normalizeTruthPayload({
    department: null,
    workload: null,
    reports: null,
    scorecards: undefined,
    assessments: undefined,
    guardrails: undefined,
  });
  assert.equal(normalizedTruth.department, 'Desk truth');
  assert.deepEqual(normalizedTruth.reports, []);
  assert.deepEqual(normalizedTruth.scorecards, []);
  const normalizedQaReport = spatialApp.normalizeQAReportPayload({
    status: null,
    summary: null,
    desks: null,
    failures: null,
  });
  assert.equal(normalizedQaReport.status, 'idle');
  assert.deepEqual(normalizedQaReport.failures, []);

  const layoutModelPath = path.resolve(process.cwd(), 'public', 'spatial', 'studioLayoutModel.js');
  const layoutModel = await loadModuleCopy(layoutModelPath, { label: 'studioLayoutModel-smoke' });
  const defaultLayout = layoutModel.createDefaultStudioLayout();
  assert.equal(defaultLayout.controlCentreDeskId, 'cto-architect');
  assert.equal(defaultLayout.departments.length, 7);
  assert.equal(defaultLayout.departments.some((department) => department.id === 'dept-talent-acquisition'), true);
  assert.ok(defaultLayout.desks['integration_auditor']);
  assert.ok(defaultLayout.desks['qa-lead']);
  const layoutRenderModel = layoutModel.buildStudioRenderModel(defaultLayout, []);
  assert.equal(layoutRenderModel.roomConnections.length, 6);
  assert.ok(layoutRenderModel.deskMap['planner']);
  assert.equal(layoutRenderModel.departments.some((department) => department.id === 'dept-talent-acquisition'), true);
  assert.equal(layoutRenderModel.deskMap['integration_auditor'].visible, true);
  assert.equal(layoutRenderModel.departments.find((department) => department.id === 'dept-talent-acquisition').statusLabel, 'blocked');
  assert.equal(layoutRenderModel.deskMap['integration_auditor'].orgStatus, 'missing lead');
  assert.equal(layoutRenderModel.deskMap['integration_auditor'].statusLabel, 'blocked');
  assert.ok(layoutRenderModel.deskMap['integration_auditor'].dependencyWarnings.length >= 1);
  assert.equal(layoutRenderModel.deskMap['integration_auditor'].throughputLabel, '1 assigned agent');

  const recentWorldChange = spatialApp.normalizeRecentWorldChange({
    items: [{
      kind: 'scaffold',
      nodeId: 'world_scaffold_ground_grid',
      changeType: 'added',
      label: 'World scaffold created',
      detail: '20x20 grass/ground grid | 400 cells added',
      counts: { addedCells: 400, modifiedCells: 0 },
      addedCells: [{ x: 0, y: 0, z: 0 }],
      modifiedCells: [],
    }],
  });
  assert.equal(recentWorldChange.items[0].kind, 'scaffold');
  assert.equal(recentWorldChange.counts.addedCells, 400);
  assert.match(spatialApp.formatRecentWorldChangeItem(recentWorldChange.items[0]), /World scaffold created/);
  assert.equal(spatialApp.formatScaffoldInterpretationLabel({
    source: 'model-assisted',
    label: 'model-assisted rejected',
    attempted: true,
    accepted: false,
  }), 'model-assisted rejected');
  assert.equal(spatialApp.formatWorldScaffoldEvaluationSummary({
    scorecard: {
      suitability: 'warn',
      correctionApplied: true,
      acceptedForMutationGeneration: true,
    },
  }), 'warn | corrected | accepted');

  const studioLinks = spatialApp.buildStudioLinks({
    desks: {
      planner: { workItems: [{ id: 'plan_1', title: 'Bridge intent' }] },
      executor: { workItems: [{ id: 'task_1', title: 'Apply change' }] },
    },
    conflicts: [{
      kind: 'low-confidence-context',
      desks: ['context-manager'],
      updatedAt: '2026-03-16T10:00:00.000Z',
    }],
  }, {
    contextToPlanner: {
      id: 'handoff_1',
      anchorRefs: ['brain/emergence/plan.md'],
      requestedOutcomes: ['Bridge intent'],
      status: 'needs-clarification',
      updatedAt: '2026-03-16T10:05:00.000Z',
    },
  });
  assert.equal(studioLinks.length, 4);
  assert.equal(studioLinks[0].relationshipType, 'handoff');
  assert.equal(studioLinks[0].visualForm, 'woven-rope');
  assert.ok(studioLinks[0].strandCount >= 2);
  assert.equal(studioLinks[1].relationshipType, 'workflow');
  assert.equal(studioLinks[1].visualForm, 'bundle');
  assert.equal(studioLinks[2].relationshipType, 'memory');
  assert.equal(studioLinks[2].visualForm, 'bundle');
  assert.equal(studioLinks[3].risk, 'high');

  const selectedRelationshipGraph = {
    nodes: [
      { id: 'source_a', position: { x: 100, y: 120 } },
      { id: 'target_b', position: { x: 320, y: 120 } },
    ],
    edges: [{
      id: 'source_a__target_b__dependency',
      source: 'source_a',
      target: 'target_b',
      relationshipType: 'dependency',
      strength: 3,
      strandCount: 2,
      supports: ['shared module ownership', 'direct dependency'],
      validatedBy: ['qa-lead'],
      health: 'healthy',
      visualForm: 'bundle',
      lastActive: '2026-03-20T12:15:00.000Z',
    }],
  };
  const relationshipInspector = spatialApp.resolveSelectedRelationshipInspector(selectedRelationshipGraph, 'source_a__target_b__dependency');
  assert.deepEqual(relationshipInspector, {
    id: 'source_a__target_b__dependency',
    source: 'source_a',
    target: 'target_b',
    label: 'dependency',
    relationshipType: 'dependency',
    strength: 3,
    strandCount: 2,
    visualForm: 'bundle',
    supports: ['shared module ownership', 'direct dependency'],
    supportsCount: 2,
    validatedBy: ['qa-lead'],
    validatedByCount: 1,
    health: 'healthy',
    lastActive: '2026-03-20T12:15:00.000Z',
  });
  assert.deepEqual(spatialApp.buildRelationshipInspectorPayload({
    source: 'source_a',
    target: 'target_b',
  }), {
    id: null,
    source: 'source_a',
    target: 'target_b',
    label: 'relates to',
    relationshipType: 'relates_to',
    strength: null,
    strandCount: null,
    visualForm: null,
    supports: [],
    supportsCount: 0,
    validatedBy: [],
    validatedByCount: 0,
    health: null,
    lastActive: null,
  });
  assert.equal(spatialApp.hitTestRelationshipEdgeAtPoint(selectedRelationshipGraph, { x: 324, y: 194 }, { zoom: 1 })?.id, 'source_a__target_b__dependency');
  assert.ok(spatialApp.renderRelationshipInspectorPanel(relationshipInspector));
  assert.ok(spatialApp.renderRelationshipInspectorPanel({ source: 'source_a', target: 'target_b' }));

  const helpers = {
    runStructuredQA: () => undefined,
    runBrowserPass: () => undefined,
    openQARun: () => undefined,
  };
  assert.ok(spatialApp.renderDeskSection({
    id: 'qa-summary',
    label: 'QA Summary',
    kind: 'qa-summary',
    structuredStatus: 'running',
    structuredSummary: 'Structured QA suite is running now.',
    scorecardCount: 4,
    scorecardDeskCount: 4,
    latestBrowserRun: { scenario: 'layout-pass', verdict: 'pass', findingCount: 0 },
    localGate: {
      unit: { status: 'pass', failedCount: 0 },
      studioBoot: { verdict: 'pass', findingCount: 0 },
    },
  }, helpers));
  assert.ok(spatialApp.renderDeskSection({
    id: 'structured',
    label: 'Structured QA',
    kind: 'qa-structured',
    busy: false,
    report: {
      status: 'pass',
      summary: 'Structured QA passed.',
      desks: [{ id: 'ui' }],
      failures: [],
    },
    scorecardCount: 1,
  }, helpers));
  assert.ok(spatialApp.renderDeskSection({
    id: 'scorecards',
    label: 'Structured QA Scorecards',
    kind: 'qa-scorecards',
    suiteSummary: '1 scorecard ready.',
    cards: [{
      id: 'ui.contract_check',
      desk: 'ui',
      testId: 'contract_check',
      testName: 'Contract Check',
      status: 'pass',
      overallScore: { value: 4, max: 4 },
      validation: { summary: 'complete' },
    }],
  }, helpers));
  assert.ok(spatialApp.renderDeskSection({
    id: 'browser',
    label: 'Browser Pass',
    kind: 'qa-browser',
    busy: false,
    latestRun: {
      id: 'qa_run_1',
      scenario: 'layout-pass',
      verdict: 'pass',
      trigger: 'manual',
      findingCount: 0,
      stepSummary: [],
    },
  }, helpers));
  assert.ok(spatialApp.renderDeskSection({
    id: 'truth-partial',
    label: 'Partial Truth',
    kind: 'truth',
    value: {
      statement: 'Partial payload should not crash the render path.',
      intentType: 'context',
    },
  }, helpers));
  assert.ok(spatialApp.renderDeskSection({
    id: 'qa-summary-partial',
    label: 'Partial QA Summary',
    kind: 'qa-summary',
    structuredStatus: 'idle',
    latestBrowserRun: {},
    localGate: {},
  }, helpers));
  assert.ok(spatialApp.renderDeskSection({
    id: 'local-gates',
    label: 'Local UI Gate',
    kind: 'qa-local-gates',
    summary: 'Unit gate pass | Studio boot pass',
    gate: {
      unit: {
        status: 'pass',
        passedCount: 22,
        totalChecks: 22,
        failures: [],
      },
      studioBoot: {
        verdict: 'pass',
        findingCount: 0,
        consoleErrorCount: 0,
        networkFailureCount: 0,
        failedSteps: [],
      },
    },
  }, helpers));
  assert.ok(spatialApp.renderDeskSection({
    id: 'run-history',
    label: 'Recent QA Runs',
    kind: 'qa-run-history',
    items: [{
      id: 'qa_run_1',
      summary: 'layout-pass | pass',
      detail: 'Findings 0',
      at: '2026-03-25T09:00:00.000Z',
      runId: 'qa_run_1',
    }],
  }, helpers));
  assert.ok(spatialApp.renderDeskSection({
    id: 'task-economy',
    label: 'Task Economy',
    kind: 'task-economy',
    economy: {
      headline: '1 intake | 1 WIP | 1 completion | 1 reward | 1 bottleneck',
      detail: 'Balanced throughput with visible pressure.',
      pressureTone: 'warn',
      backlogPressure: 42,
      momentum: 68,
      upgradeReadiness: 54,
      rewardYield: 33,
      lanes: [
        { id: 'intake', label: 'Intake', value: 1, detail: 'One task entering the line.' },
        { id: 'wip', label: 'WIP', value: 1, detail: 'One task in flight.' },
        { id: 'completion', label: 'Completion', value: 1, detail: 'One task finished.' },
        { id: 'reward', label: 'Reward', value: 1, detail: 'One task banked payoff.' },
        { id: 'bottleneck', label: 'Bottleneck', value: 1, detail: 'One task waiting on review.' },
      ],
      selectedLane: {
        label: 'Selected Card',
        value: 'Render executor queue',
        detail: 'planned | unassigned | ready',
      },
    },
  }, helpers));
  assert.ok(spatialApp.renderDeskSection({
    id: 'desk-truth',
    label: 'Desk Truth',
    kind: 'desk-truth',
    truth: {
      department: 'Memory Archivist',
      workload: { assignedTasks: 2, queueSize: 1, outputs: 3 },
      throughput: '3 archive versions / 2 annotations',
      reports: ['Archived context slice', 'QA report surfaced'],
      scorecards: [{ id: 'qa-1', status: 'pass' }],
      assessments: ['Context preserved'],
      context: { summary: 'Canonical context archive', slices: [{ id: 'slice-1', summary: 'Planner brief' }] },
      guardrails: ['CTO approval required'],
    },
  }, helpers));

  assert.ok(spatialApp.renderSimLaunchOverlay({
    project: {
      key: 'topdown-slice',
      name: 'topdown-slice',
      launchable: true,
      supportedOrigin: 'http://127.0.0.1:4173/',
    },
    status: 'Ready to launch from the canvas layer.',
    launchedUrl: 'http://127.0.0.1:4173/',
    supportedOrigin: 'http://127.0.0.1:4173/',
    busy: false,
    error: '',
    onLaunch: () => undefined,
  }));

  const hierarchyModel = spatialApp.buildDeskHierarchyModel({
    deskId: 'cto-architect',
    deskLabel: 'CTO / Architect',
    targetDeskId: 'planner',
    targetDeskLabel: 'Planner',
    isCtoEdit: true,
    panelData: {
      desk: {
        localState: 'ready',
        currentGoal: 'Refine desk scope',
        mission: 'Monitor guardrails across the desk network.',
      },
      agents: [{ id: 'planner-agent', status: 'idle', backend: 'ollama', model: 'mistral:latest' }],
      tasks: [{ id: 'task-1', lifecycle: 'planned', progress: { label: 'queued' }, source: 'studio' }],
      modules: [{ id: 'module-1', assigned: true }],
      reports: [{ id: 'report-1', type: 'assessment', source: 'qa', detail: 'desk scope' }],
    },
    draft: {
      departments: [{ id: 'department-1', label: 'Research' }],
      desks: [{ id: 'desk-1', label: 'Desk A' }],
      recruits: [{ id: 'recruit-1', agentId: 'agent-1', traits: 'calm' }],
      assessments: [{ id: 'assessment-1', testId: 'qa-1' }],
    },
  });
  assert.equal(hierarchyModel.departmentLabel, 'CTO Desk');
  assert.equal(hierarchyModel.deskLabel, 'Planner');
  assert.equal(hierarchyModel.managedDeskLabel, 'Planner');
  assert.match(hierarchyModel.managementSummary, /Planner/);
  assert.match(hierarchyModel.focusSummary.summary, /Agents 0\/1/);
  assert.match(hierarchyModel.focusSummary.summary, /Queue 1/);
  assert.match(hierarchyModel.focusSummary.summary, /Reports 1/);
  assert.match(hierarchyModel.focusSummary.summary, /Windows Desk Reports/);
  assert.equal(hierarchyModel.focusSummary.blockerCount, 0);
  assert.equal(hierarchyModel.counts.departments, 1);
  assert.equal(hierarchyModel.counts.recruits, 1);
  assert.equal(hierarchyModel.agents[0].summary.includes('planner-agent'), true);

  const sparseHierarchyModel = spatialApp.buildDeskHierarchyModel({
    targetDeskId: 'qa-lead',
    targetDeskLabel: 'QA / Test Lead',
    panelData: {
      desk: null,
      agents: null,
      tasks: null,
      modules: null,
      reports: null,
      truth: {
        blockers: ['Waiting on test gate'],
      },
    },
  });
  assert.equal(sparseHierarchyModel.focusSummary.liveAgents, 0);
  assert.equal(sparseHierarchyModel.focusSummary.assignedAgents, 0);
  assert.equal(sparseHierarchyModel.focusSummary.queueCount, 0);
  assert.equal(sparseHierarchyModel.focusSummary.blockerCount, 1);
  assert.match(sparseHierarchyModel.focusSummary.summary, /Blockers Waiting on test gate/);
  assert.match(sparseHierarchyModel.focusSummary.summary, /Windows QA Workbench \/ Scorecards \/ Desk Reports/);
  assert.match(sparseHierarchyModel.focusSummary.detail, /QA \/ Test Lead focus/);

  const normalizedDraft = spatialApp.normalizeDeskManagementDraft({
    recruit: { agentId: 'planner-agent', traits: 'calm' },
    assessment: { testId: 'planner-audit', notes: 'desk-only' },
  });
  assert.equal(normalizedDraft.recruit.agentId, 'planner-agent');
  assert.equal(normalizedDraft.assessment.notes, 'desk-only');

  let draftState = {
    planner: normalizedDraft,
    qaLead: spatialApp.normalizeDeskManagementDraft({
      recruit: { agentId: 'qa-agent', traits: 'critical' },
      assessment: { testId: 'qa-audit', notes: 'guardrails' },
    }),
  };
  const setDraftState = (updater) => {
    draftState = typeof updater === 'function' ? updater(draftState) : updater;
  };

  spatialApp.updateDeskManagementDraft(setDraftState, 'planner', (draft) => ({
    ...draft,
    recruit: {
      ...draft.recruit,
      traits: 'steady',
    },
  }));
  assert.equal(draftState.planner.recruit.traits, 'steady');
  assert.equal(draftState.qaLead.recruit.traits, 'critical');

  spatialApp.clearDeskManagementDraftSection(setDraftState, 'planner', 'recruit');
  assert.equal(draftState.planner.recruit.agentId, '');
  assert.equal(draftState.planner.assessment.testId, 'planner-audit');

  spatialApp.clearDeskManagementDraft(setDraftState, 'qaLead');
  assert.equal(draftState.qaLead, undefined);
}
