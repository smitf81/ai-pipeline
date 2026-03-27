import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

const require = createRequire(import.meta.url);
const studioDataPath = path.resolve(process.cwd(), 'public', 'spatial', 'studioData.js');

export default async function runStudioDataTests() {
  const {
    advanceOrchestratorState,
    buildAgentSnapshots,
    createDefaultTeamBoard,
    createPlannerHandoff,
    normalizeNotebookState,
    normalizeTeamBoardState,
  } = await loadModuleCopy(studioDataPath, { label: 'studioData' });
  const {
    buildPlannerContractCheckQualityCard,
    buildRunnerContractCheckQualityCard,
    buildTaContractCheckQualityCard,
    buildUiContractCheckQualityCard,
  } = require('../../qa/testAttributeCards.js');
  const { TEST_METRIC_DEFINITIONS } = require('../../qa/testMetricDefinitions.js');
  const handoff = createPlannerHandoff({
    nodeId: 'node_1',
    createdAt: '2026-03-13T10:00:00.000Z',
    summary: 'Expose more agent workload in studio.',
    confidence: 0.42,
    anchorRefs: ['brain/emergence/roadmap.md'],
    requestedOutcomes: ['Expose task movement', 'Show task ownership'],
    criteria: [
      { id: 'actionability', label: 'Actionability', score: 0.2, reason: 'Input reads like a note.' },
      { id: 'clarity', label: 'Clarity', score: 0.8, reason: 'Intent is understandable.' },
    ],
    classification: { role: 'context', labels: ['ux'] },
    truth: {
      rawInput: 'Expose more agent workload in studio.',
      statement: 'Expose more agent workload in studio.',
      intentType: 'General context signal',
      requestedOutcomes: [],
      unresolved: ['No concrete requested outcomes were extracted yet.'],
      evidence: ['Clarity: Intent is understandable.'],
      plannerBrief: 'Planner should clarify the request before expanding execution.',
      readiness: {
        intentConfidence: 0.42,
        plannerUsefulness: 0.38,
        executionReadiness: 0.21,
        deployReadiness: 0.16,
      },
    },
    projectContext: {
      matchedTerms: [],
      blockers: ['Need clearer user execution path'],
    },
  }, { blockers: ['Studio output is hard to audit'] });

  assert.equal(handoff.sourceAgentId, 'context-manager');
  assert.equal(handoff.targetAgentId, 'planner');
  assert.equal(handoff.status, 'needs-clarification');
  assert.equal(handoff.sourceNodeId, 'node_1');
  assert.ok(handoff.anchorRefs.includes('brain/emergence/roadmap.md'));
  assert.deepEqual(handoff.requestedOutcomes, ['Expose task movement', 'Show task ownership']);
  assert.deepEqual(handoff.tasks, ['Expose task movement', 'Show task ownership']);
  assert.match(handoff.problemStatement, /Goal: Expose more agent workload in studio\./);
  assert.match(handoff.problemStatement, /Still unclear:/);
  assert.equal(handoff.truth.plannerBrief, 'Planner should clarify the request before expanding execution.');
  assert.deepEqual(handoff.constraints, [
    'Need clearer user execution path',
    'Studio output is hard to audit',
    'Actionability: Input reads like a note.',
  ]);

  const workspace = {
    graphs: {
      system: {
        nodes: [
          {
            id: 'node_ctx',
            type: 'text',
            content: 'Improve context handoff',
            metadata: { agentId: 'context-manager' },
          },
        ],
        edges: [],
      },
      world: {
        nodes: [
          {
            id: 'node_world',
            type: 'gameplay-system',
            content: 'Quest progression loop',
            metadata: { proposalTarget: 'world-structure' },
          },
        ],
        edges: [],
      },
    },
    sketches: [],
    annotations: [],
    architectureMemory: { versions: [], rules: [] },
    intentState: {
      latest: null,
      contextReport: {
        nodeId: 'node_ctx',
        createdAt: '2026-03-13T10:15:00.000Z',
        summary: 'Clarify what the planner should solve.',
        confidence: 0.77,
        tasks: ['Generate problem report', 'Show waiting-on-user state'],
        criteria: [],
        classification: { role: 'context', labels: ['plan'] },
        metrics: { actionSignals: 3, constraintSignals: 1 },
        projectContext: {
          currentFocus: 'Studio desk output',
          matchedTerms: ['studio', 'planner'],
          blockers: [],
        },
        truth: {
          rawInput: 'Clarify what the planner should solve.',
          statement: 'Clarify what the planner should solve.',
          intentType: 'General context signal',
          requestedOutcomes: ['Generate problem report', 'Show waiting-on-user state'],
          unresolved: [],
          evidence: ['Actionability: Context is already structured.'],
          plannerBrief: 'Planner should treat this as: Generate problem report; Show waiting-on-user state',
          readiness: {
            intentConfidence: 0.77,
            plannerUsefulness: 0.81,
            executionReadiness: 0.52,
            deployReadiness: 0.21,
          },
        },
      },
      byNode: {},
      reports: [],
    },
    studio: {
      agentWorkers: {
        'context-manager': {
          status: 'running',
          mode: 'manual',
          backend: 'ollama',
          model: 'mistral:latest',
          currentRunId: 'context_1',
          lastRunId: 'context_prev',
          lastSourceNodeId: 'node_ctx',
          lastHandoffId: 'handoff_1',
          lastReportNodeId: 'node_ctx',
          lastBlockedReason: null,
          lastUsedFallback: true,
          lastPlannerFeedbackAction: 'retry-handoff',
          startedAt: '2026-03-13T10:14:00.000Z',
          completedAt: '2026-03-13T10:15:00.000Z',
        },
        planner: {
          status: 'idle',
          mode: 'auto',
          backend: 'ollama',
          model: 'mistral:latest',
          currentRunId: null,
          lastRunId: 'planner_1',
          lastSourceHandoffId: 'handoff_1',
          lastBlockedReason: null,
          lastProducedCardIds: ['0001'],
          proposalArtifactRefs: ['data/spatial/agent-runs/planner/planner_1.proposal.01.brain-emergence-plan-md.md'],
          startedAt: '2026-03-13T10:16:00.000Z',
          completedAt: '2026-03-13T10:17:00.000Z',
        },
        executor: {
          status: 'idle',
          mode: 'manual',
          backend: 'ollama',
          model: 'mistral:latest',
          currentRunId: null,
          lastRunId: 'executor_1',
          lastOutcome: 'blocked',
          lastBlockedReason: 'Awaiting approval for risky package.',
          lastVerifiedCardId: '0002',
          lastAppliedCardId: null,
          lastDeployCardId: null,
          startedAt: '2026-03-13T10:18:00.000Z',
          completedAt: '2026-03-13T10:19:00.000Z',
        },
      },
      handoffs: {
        contextToPlanner: {
          id: 'handoff_1',
          createdAt: '2026-03-13T10:15:00.000Z',
          sourceNodeId: 'node_ctx',
          summary: 'Planner brief ready.',
          problemStatement: 'Goal: Clarify what the planner should solve.',
          anchorRefs: ['brain/emergence/plan.md', 'brain/emergence/tasks.md'],
          requestedOutcomes: ['Generate problem report', 'Show waiting-on-user state'],
          constraints: [],
          confidence: 0.77,
          status: 'ready',
        },
        plannerToContext: {
          id: 'feedback_1',
          sourceHandoffId: 'handoff_1',
          action: 'retry-handoff',
          summary: 'Planner requested a tighter context packet.',
          detail: 'Need explicit acceptance criteria before planning expands.',
          anchorRefs: ['brain/emergence/plan.md'],
        },
      },
    },
  };

  const notebook = normalizeNotebookState(workspace);
  assert.equal(notebook.pages.length, 1);
  assert.equal(notebook.activePage.id, notebook.activePageId);
  assert.equal(notebook.activePage.sourceNodeId, 'node_ctx');
  const firstTaskCard = {
    id: '0001',
    title: 'Expose planner payload',
    pageId: notebook.activePageId,
    status: 'plan',
    desk: 'Planner',
    state: 'Ready',
    sourceHandoffId: handoff.id,
    sourceNodeId: handoff.sourceNodeId,
    sourceAnchorRefs: handoff.anchorRefs,
    createdAt: '2026-03-13T10:20:00.000Z',
    updatedAt: '2026-03-13T10:20:00.000Z',
    taskFlow: {
      phase: 'planned',
      assignmentState: 'unassigned',
      ownerDeskId: 'planner',
      assigneeDeskId: 'executor',
      sourceIntentId: handoff.sourceNodeId,
      sourceHandoffId: handoff.id,
      lastTransitionAt: '2026-03-13T10:20:00.000Z',
      lastTransitionLabel: 'Moved to planner board',
      history: [
        {
          phase: 'captured',
          assignmentState: 'unassigned',
          ownerDeskId: 'context-manager',
          assigneeDeskId: 'planner',
          label: 'Captured from intent',
          note: 'Expose planner payload',
          at: '2026-03-13T10:20:00.000Z',
        },
        {
          phase: 'planned',
          assignmentState: 'unassigned',
          ownerDeskId: 'planner',
          assigneeDeskId: 'executor',
          label: 'Moved to planner board',
          note: 'Expose planner payload',
          at: '2026-03-13T10:20:00.000Z',
        },
      ],
    },
  };
  const secondTaskCard = {
    id: '0002',
    title: 'Render executor queue',
    pageId: notebook.activePageId,
    status: 'plan',
    desk: 'Planner',
    state: 'Ready',
    sourceHandoffId: handoff.id,
    sourceNodeId: handoff.sourceNodeId,
    sourceAnchorRefs: handoff.anchorRefs,
    createdAt: '2026-03-13T10:21:00.000Z',
    updatedAt: '2026-03-13T10:21:00.000Z',
    taskFlow: {
      phase: 'planned',
      assignmentState: 'unassigned',
      ownerDeskId: 'planner',
      assigneeDeskId: 'executor',
      sourceIntentId: handoff.sourceNodeId,
      sourceHandoffId: handoff.id,
      lastTransitionAt: '2026-03-13T10:21:00.000Z',
      lastTransitionLabel: 'Moved to planner board',
      history: [
        {
          phase: 'captured',
          assignmentState: 'unassigned',
          ownerDeskId: 'context-manager',
          assigneeDeskId: 'planner',
          label: 'Captured from intent',
          note: 'Render executor queue',
          at: '2026-03-13T10:21:00.000Z',
        },
        {
          phase: 'planned',
          assignmentState: 'unassigned',
          ownerDeskId: 'planner',
          assigneeDeskId: 'executor',
          label: 'Moved to planner board',
          note: 'Render executor queue',
          at: '2026-03-13T10:21:00.000Z',
        },
      ],
    },
  };
  const seededBoard = normalizeTeamBoardState({
    ...workspace,
    pages: notebook.pages,
    activePageId: notebook.activePageId,
    studio: {
      ...workspace.studio,
      teamBoard: {
        ...createDefaultTeamBoard(),
        cards: [firstTaskCard, secondTaskCard],
      },
    },
  });
  assert.equal(seededBoard.cards.length, 2);
  assert.equal(seededBoard.cards[0].status, 'plan');
  assert.equal(seededBoard.cards[0].desk, 'Planner');
  assert.equal(seededBoard.cards[0].taskFlow.phase, 'planned');
  assert.equal(seededBoard.cards[0].taskFlow.assignmentState, 'unassigned');
  assert.equal(seededBoard.cards[0].id, '0001');

  const orchestrator = advanceOrchestratorState({
    workspace: {
      ...workspace,
      pages: notebook.pages,
      activePageId: notebook.activePageId,
      studio: {
        ...workspace.studio,
        teamBoard: {
          ...seededBoard,
          selectedCardId: seededBoard.cards[0].id,
          cards: seededBoard.cards.map((card, index) => ({
            ...card,
            status: index === 0 ? 'review' : card.status,
          })),
        },
      },
    },
    dashboardState: { blockers: [] },
    runs: [],
  });
  assert.ok(orchestrator.lastTickAt);
  assert.ok(orchestrator.activeDeskIds.includes('context-manager'));
  assert.ok(orchestrator.activeDeskIds.includes('executor'));
  assert.ok(!orchestrator.activeDeskIds.includes('qa-lead'));
  assert.equal(orchestrator.teamBoard.summary.review, 1);
  assert.equal(orchestrator.teamBoard.selectedCardId, seededBoard.cards[0].id);

  const snapshots = buildAgentSnapshots({
    workspace: {
      ...workspace,
      pages: notebook.pages,
      activePageId: notebook.activePageId,
      studio: {
        ...workspace.studio,
        teamBoard: orchestrator.teamBoard,
        orchestrator,
      },
    },
    dashboardState: { blockers: [] },
    runs: [],
    agentComments: {},
    recentHistory: [{ at: '2026-03-13T10:20:00.000Z', type: 'autosave', summary: { nodes: 1, edges: 0 } }],
    qaState: {
      structuredReport: {
        status: 'pass',
        summary: 'all 4 desks passed 11 checks',
        metricDefinitions: TEST_METRIC_DEFINITIONS,
        desks: [
          {
            desk: 'planner',
            status: 'pass',
            tests: [
              {
                name: 'contract_check',
                status: 'pass',
                qualityCard: buildPlannerContractCheckQualityCard('2026-03-24T08:00:00.000Z'),
              },
            ],
          },
          {
            desk: 'runner',
            status: 'pass',
            tests: [
              {
                name: 'contract_check',
                status: 'pass',
                qualityCard: buildRunnerContractCheckQualityCard('2026-03-24T09:00:00.000Z'),
              },
            ],
          },
          {
            desk: 'ui',
            status: 'pass',
            tests: [
              {
                name: 'contract_check',
                status: 'pass',
                qualityCard: buildUiContractCheckQualityCard('2026-03-24T10:00:00.000Z'),
              },
            ],
          },
          {
            desk: 'ta',
            status: 'pass',
            tests: [
              {
                name: 'contract_check',
                status: 'pass',
                qualityCard: buildTaContractCheckQualityCard('2026-03-24T11:00:00.000Z'),
              },
            ],
          },
        ],
      },
      structuredBusy: false,
      latestBrowserRun: {
        id: 'qa_run_1',
        scenario: 'layout-pass',
        verdict: 'pass',
        findingCount: 0,
        completedAt: '2026-03-24T10:02:00.000Z',
      },
      browserRuns: [
        {
          id: 'qa_run_1',
          scenario: 'layout-pass',
          verdict: 'pass',
          findingCount: 0,
          completedAt: '2026-03-24T10:02:00.000Z',
        },
      ],
      browserBusy: false,
      localGate: {
        unit: {
          id: 'test-unit-latest',
          status: 'pass',
          summary: 'All 22 UI checks passed.',
          totalChecks: 22,
          passedCount: 22,
          failedCount: 0,
          failures: [],
        },
        studioBoot: {
          id: 'qa_guardrail_1',
          verdict: 'pass',
          status: 'completed',
          findingCount: 0,
          consoleErrorCount: 0,
          networkFailureCount: 0,
          failedSteps: [],
        },
      },
    },
  });

  const contextSnapshot = snapshots.find((agent) => agent.id === 'context-manager');
  const plannerSnapshot = snapshots.find((agent) => agent.id === 'planner');
  const executorSnapshot = snapshots.find((agent) => agent.id === 'executor');
  const qaLeadSnapshot = snapshots.find((agent) => agent.id === 'qa-lead');
  const ctoSnapshot = snapshots.find((agent) => agent.id === 'cto-architect');

  assert.equal(snapshots.length, 6);
  assert.ok(contextSnapshot);
  assert.ok(plannerSnapshot);
  assert.ok(executorSnapshot);
  assert.ok(qaLeadSnapshot);
  assert.ok(ctoSnapshot);
  assert.equal(contextSnapshot.deskSnapshot.handoff.summary, 'Planner brief ready.');
  assert.deepEqual(
    contextSnapshot.deskSnapshot.sections.map((section) => section.label),
    ['Current Job', 'Context Worker', 'Core Truth', 'Problem To Solve', 'Task Creation', 'Intent Extraction', 'KPIs', 'Recent History', 'Waiting On You'],
  );
  assert.equal(contextSnapshot.deskSnapshot.sections.find((section) => section.label === 'Context Worker').value, 'Status: running | backend ollama | model mistral:latest');
  assert.equal(contextSnapshot.deskSnapshot.sections.find((section) => section.label === 'Task Creation').items.length, 2);
  assert.equal(plannerSnapshot.deskSnapshot.handoff.id, 'handoff_1');
  assert.equal(plannerSnapshot.deskSnapshot.sections[0].label, 'Mission');
  assert.ok(plannerSnapshot.deskSnapshot.sections.some((section) => section.label === 'Task Movement'));
  assert.ok(plannerSnapshot.deskSnapshot.sections.find((section) => section.label === 'Task Movement').items.length >= 1);
  assert.ok(plannerSnapshot.deskSnapshot.sections.some((section) => section.label === 'Planner Worker'));
  assert.ok(plannerSnapshot.deskSnapshot.sections.some((section) => section.label === 'Planner Handoff'));
  assert.ok(plannerSnapshot.deskSnapshot.sections.some((section) => section.label === 'Produced Cards'));
  assert.ok(plannerSnapshot.deskSnapshot.sections.some((section) => section.label === 'Proposal Artifacts'));
  assert.equal(executorSnapshot.deskSnapshot.sections.find((section) => section.id === 'execution-selection').label, 'Mutation Queue');
  assert.equal(executorSnapshot.deskSnapshot.sections.find((section) => section.id === 'executor-worker').value, 'Status: idle | backend ollama | model mistral:latest');
  assert.deepEqual(
    qaLeadSnapshot.deskSnapshot.sections.map((section) => section.label),
    ['Mission', 'Current Goal', 'Structured QA', 'Structured QA Scorecards', 'Browser Pass', 'Local UI Gate', 'Recent QA Runs', 'Waiting On You'],
  );
  const qaScorecardSection = qaLeadSnapshot.deskSnapshot.sections.find((section) => section.id === 'qa-scorecards');
  assert.ok(qaScorecardSection);
  assert.equal(qaScorecardSection.kind, 'qa-scorecards');
  assert.equal(qaScorecardSection.cards.length, 4);
  assert.deepEqual(
    qaScorecardSection.cards.map((card) => card.desk),
    ['planner', 'runner', 'ui', 'ta'],
  );
  assert.deepEqual(
    qaScorecardSection.cards.map((card) => card.id),
    ['planner.contract_check', 'runner.contract_check', 'ui.contract_check', 'ta.contract_check'],
  );
  assert.deepEqual(
    qaScorecardSection.cards.map((card) => card.overallScore.value),
    [3.5, 3.6, 3.6, 3.2],
  );
  for (const card of qaScorecardSection.cards) {
    assert.equal(card.testId, 'contract_check');
    assert.equal(card.validation.ok, true);
    assert.deepEqual(card.validation.issues, []);
    assert.match(card.validation.summary, /complete/i);
  }
  assert.equal(qaScorecardSection.definitions.metrics.integrity.label, 'Integrity');
  assert.equal(qaScorecardSection.meta.deskCount, 4);
  assert.equal(qaScorecardSection.meta.testCount, 4);
  const qaLocalGateSection = qaLeadSnapshot.deskSnapshot.sections.find((section) => section.id === 'local-ui-gates');
  assert.ok(qaLocalGateSection);
  assert.equal(qaLocalGateSection.kind, 'qa-local-gates');
  assert.match(qaLocalGateSection.summary, /unit gate pass/i);
  assert.equal(qaLocalGateSection.gate.unit.totalChecks, 22);
  assert.equal(qaLeadSnapshot.workload.outputs, 4);
  const qaSummarySection = ctoSnapshot.deskSnapshot.sections.find((section) => section.id === 'qa-summary');
  assert.ok(qaSummarySection);
  assert.equal(qaSummarySection.kind, 'qa-summary');
  assert.equal(qaSummarySection.scorecardCount, 4);
  assert.equal(qaSummarySection.latestBrowserRun.scenario, 'layout-pass');
  assert.equal(qaSummarySection.localGate.unit.status, 'pass');
  assert.equal(qaSummarySection.localGate.studioBoot.verdict, 'pass');
  assert.ok(!ctoSnapshot.deskSnapshot.sections.some((section) => section.id === 'qa-scorecards'));
}
