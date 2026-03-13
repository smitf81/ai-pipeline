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
    tasks: [],
    criteria: [
      { id: 'actionability', label: 'Actionability', score: 0.2, reason: 'Input reads like a note.' },
      { id: 'clarity', label: 'Clarity', score: 0.8, reason: 'Intent is understandable.' },
    ],
    classification: { role: 'context', labels: ['ux'] },
    projectContext: {
      matchedTerms: [],
      blockers: ['Need clearer user execution path'],
    },
  }, { blockers: ['Studio output is hard to audit'] });

  assert.equal(handoff.sourceAgentId, 'context-manager');
  assert.equal(handoff.targetAgentId, 'planner');
  assert.equal(handoff.status, 'needs-clarification');
  assert.equal(handoff.sourceNodeId, 'node_1');
  assert.match(handoff.problemStatement, /Goal: Expose more agent workload in studio\./);
  assert.match(handoff.problemStatement, /Still unclear:/);
  assert.deepEqual(handoff.constraints, [
    'Need clearer user execution path',
    'Studio output is hard to audit',
    'Actionability: Input reads like a note.',
  ]);

  const workspace = {
    graph: {
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
      },
      byNode: {},
      reports: [],
    },
    studio: {
      handoffs: {
        contextToPlanner: {
          id: 'handoff_1',
          createdAt: '2026-03-13T10:15:00.000Z',
          sourceNodeId: 'node_ctx',
          summary: 'Planner brief ready.',
          problemStatement: 'Goal: Clarify what the planner should solve.',
          tasks: ['Generate problem report', 'Show waiting-on-user state'],
          constraints: [],
          confidence: 0.77,
          status: 'ready',
        },
      },
    },
  };

  const notebook = normalizeNotebookState(workspace);
  assert.equal(notebook.pages.length, 1);
  assert.equal(notebook.activePage.id, notebook.activePageId);
  const seededBoard = normalizeTeamBoardState({
    ...workspace,
    pages: notebook.pages,
    activePageId: notebook.activePageId,
    studio: {
      ...workspace.studio,
      teamBoard: createDefaultTeamBoard(),
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
    ['Current Job', 'Problem To Solve', 'Intent Extraction', 'KPIs', 'Recent History', 'Waiting On You'],
  );
  assert.equal(plannerSnapshot.deskSnapshot.handoff, null);
  assert.equal(plannerSnapshot.deskSnapshot.sections[0].label, 'Mission');
  assert.equal(executorSnapshot.deskSnapshot.sections.find((section) => section.id === 'execution-selection').label, 'Execution Selection');
}
