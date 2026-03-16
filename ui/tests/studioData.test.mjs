import assert from 'node:assert/strict';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

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
  const handoff = createPlannerHandoff({
    nodeId: 'node_1',
    createdAt: '2026-03-13T10:00:00.000Z',
    summary: 'Expose more agent workload in studio.',
    confidence: 0.42,
    anchorRefs: ['brain/emergence/roadmap.md'],
    tasks: [],
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
          model: 'mixtral',
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
          model: 'mixtral',
          currentRunId: null,
          lastRunId: 'planner_1',
          lastSourceHandoffId: 'handoff_1',
          lastBlockedReason: null,
          lastProducedCardIds: ['0001'],
          proposalArtifactRefs: ['data/spatial/agent-runs/planner/planner_1.proposal.01.brain-emergence-plan-md.md'],
          startedAt: '2026-03-13T10:16:00.000Z',
          completedAt: '2026-03-13T10:17:00.000Z',
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
          tasks: ['Generate problem report', 'Show waiting-on-user state'],
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
  const seededBoard = normalizeTeamBoardState({
    ...workspace,
    pages: notebook.pages,
    activePageId: notebook.activePageId,
    studio: {
      ...workspace.studio,
      teamBoard: {
        ...createDefaultTeamBoard(),
        cards: [
          {
            id: '0001',
            title: 'Expose planner payload',
            pageId: notebook.activePageId,
            status: 'plan',
            desk: 'Planner',
            state: 'Ready',
          },
          {
            id: '0002',
            title: 'Render executor queue',
            pageId: notebook.activePageId,
            status: 'plan',
            desk: 'Planner',
            state: 'Ready',
          },
        ],
      },
    },
  });
  assert.equal(seededBoard.cards.length, 2);
  assert.equal(seededBoard.cards[0].status, 'plan');
  assert.equal(seededBoard.cards[0].desk, 'Planner');
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
  });

  const contextSnapshot = snapshots.find((agent) => agent.id === 'context-manager');
  const plannerSnapshot = snapshots.find((agent) => agent.id === 'planner');
  const executorSnapshot = snapshots.find((agent) => agent.id === 'executor');

  assert.ok(contextSnapshot);
  assert.ok(plannerSnapshot);
  assert.ok(executorSnapshot);
  assert.equal(contextSnapshot.deskSnapshot.handoff.summary, 'Planner brief ready.');
  assert.deepEqual(
    contextSnapshot.deskSnapshot.sections.map((section) => section.label),
    ['Current Job', 'Context Worker', 'Core Truth', 'Problem To Solve', 'Intent Extraction', 'KPIs', 'Recent History', 'Waiting On You'],
  );
  assert.equal(contextSnapshot.deskSnapshot.sections.find((section) => section.label === 'Context Worker').value, 'Status: running | backend ollama | model mixtral');
  assert.equal(plannerSnapshot.deskSnapshot.handoff.id, 'handoff_1');
  assert.equal(plannerSnapshot.deskSnapshot.sections[0].label, 'Mission');
  assert.ok(plannerSnapshot.deskSnapshot.sections.some((section) => section.label === 'Planner Worker'));
  assert.ok(plannerSnapshot.deskSnapshot.sections.some((section) => section.label === 'Planner Handoff'));
  assert.ok(plannerSnapshot.deskSnapshot.sections.some((section) => section.label === 'Produced Cards'));
  assert.ok(plannerSnapshot.deskSnapshot.sections.some((section) => section.label === 'Proposal Artifacts'));
  assert.equal(executorSnapshot.deskSnapshot.sections.find((section) => section.id === 'execution-selection').label, 'Mutation Queue');
}
