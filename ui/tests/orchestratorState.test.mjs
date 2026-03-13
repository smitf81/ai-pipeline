import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default async function runOrchestratorStateTests() {
  const orchestratorStatePath = path.resolve(process.cwd(), 'orchestratorState.js');
  const {
    advanceOrchestratorWorkspace,
    buildRuntimePayload,
    normalizeTeamBoardState,
    normalizeNotebookState,
  } = require(orchestratorStatePath);

  const workspace = {
    graph: {
      nodes: [{ id: 'node_ctx', type: 'text', content: 'Clarify desk overlap', metadata: { agentId: 'context-manager' } }],
      edges: [],
    },
    annotations: [],
    sketches: [],
    intentState: {
      latest: {
        nodeId: 'node_ctx',
        summary: 'Clarify desk overlap',
        confidence: 0.42,
        tasks: ['Clarify desk overlap', 'Show current desk job'],
        projectContext: { matchedTerms: ['desk'], blockers: [] },
      },
      contextReport: null,
      byNode: {},
      reports: [],
    },
    studio: {
      handoffs: {
        contextToPlanner: {
          id: 'handoff_1',
          summary: 'Planner brief ready.',
          status: 'needs-clarification',
          tasks: ['Clarify desk overlap', 'Show current desk job'],
        },
      },
      selfUpgrade: {
        status: 'ready-to-apply',
        taskId: '0007',
      },
    },
  };

  const notebook = normalizeNotebookState(workspace);
  assert.equal(notebook.pages.length, 1);
  assert.ok(notebook.activePageId);

  const nextWorkspace = advanceOrchestratorWorkspace({
    ...workspace,
    pages: notebook.pages,
    activePageId: notebook.activePageId,
  }, {
    dashboardState: { blockers: ['Need clearer acceptance criteria'] },
    runs: [],
  });

  assert.equal(nextWorkspace.activePageId, notebook.activePageId);
  assert.equal(nextWorkspace.studio.orchestrator.status, 'needs-attention');
  assert.ok(nextWorkspace.studio.orchestrator.activeDeskIds.includes('planner'));
  assert.equal(nextWorkspace.studio.orchestrator.desks.executor.localState, 'blocked');
  assert.ok(nextWorkspace.pages[0].handoffs.length >= 1);
  assert.match(nextWorkspace.studio.orchestrator.desks['cto-architect'].thoughtBubble, /approval|reviewing|guardrails/i);
  assert.match(nextWorkspace.studio.orchestrator.desks.planner.thoughtBubble, /backlog|tasks|waiting|sequencing/i);
  assert.match(nextWorkspace.studio.orchestrator.desks.executor.thoughtBubble, /blocked|queued|waiting/i);
  assert.ok((nextWorkspace.studio.teamBoard.summary.active || 0) >= 1);

  const runtime = buildRuntimePayload(nextWorkspace);
  assert.equal(runtime.activePageId, nextWorkspace.activePageId);
  assert.ok(runtime.orchestrator.desks['cto-architect'].thoughtBubble);
  assert.ok(Array.isArray(runtime.pages));
  assert.equal(runtime.selfUpgrade.status, 'ready-to-apply');

  const board = normalizeTeamBoardState({
    ...workspace,
    pages: notebook.pages,
    activePageId: notebook.activePageId,
  });
  const approvedWorkspace = advanceOrchestratorWorkspace({
    ...workspace,
    pages: notebook.pages,
    activePageId: notebook.activePageId,
    studio: {
      ...workspace.studio,
      teamBoard: {
        ...board,
        selectedCardId: board.cards[0].id,
        cards: board.cards.map((card, index) => ({
          ...card,
          status: index === 0 ? 'review' : card.status,
        })),
      },
    },
  }, {
    dashboardState: { blockers: [] },
    runs: [],
  });
  assert.equal(approvedWorkspace.studio.orchestrator.desks.executor.localState, 'ready');
  assert.equal(approvedWorkspace.studio.teamBoard.selectedCardId, board.cards[0].id);
}
