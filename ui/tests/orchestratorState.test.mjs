import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default async function runOrchestratorStateTests() {
  const orchestratorStatePath = path.resolve(process.cwd(), 'orchestratorState.js');
  const {
    advanceOrchestratorWorkspace,
    buildRuntimePayload,
    normalizeGraphBundle,
    createDefaultRsgState,
    buildRsgState,
    normalizeTeamBoardState,
    normalizeNotebookState,
  } = require(orchestratorStatePath);

  const workspace = {
    graphs: {
      system: {
        nodes: [{ id: 'node_ctx', type: 'text', content: 'Clarify desk overlap', metadata: { agentId: 'context-manager' } }],
        edges: [],
      },
      world: {
        nodes: [{ id: 'node_world', type: 'gameplay-system', content: 'Combat loop', metadata: { proposalTarget: 'world-structure' } }],
        edges: [],
      },
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
          anchorRefs: ['brain/emergence/plan.md', 'brain/emergence/tasks.md'],
          tasks: ['Clarify desk overlap', 'Show current desk job'],
        },
        plannerToContext: {
          id: 'feedback_1',
          sourceHandoffId: 'handoff_1',
          action: 'retry-handoff',
          detail: 'Need clearer acceptance criteria.',
          anchorRefs: ['brain/emergence/plan.md'],
        },
      },
      agentWorkers: {
        'context-manager': {
          status: 'running',
          currentRunId: 'context_1',
          lastRunId: 'context_prev',
          lastUsedFallback: true,
        },
      },
      selfUpgrade: {
        status: 'ready-to-apply',
        taskId: '0007',
      },
    },
  };

  const graphs = normalizeGraphBundle(workspace);
  assert.equal(graphs.system.nodes[0].id, 'node_ctx');
  assert.equal(graphs.world.nodes[0].id, 'node_world');
  assert.equal(createDefaultRsgState().mode, 'dual-layer');
  const seededRsg = buildRsgState({
    ...workspace,
    graph: graphs.system,
    graphs,
  });
  assert.equal(seededRsg.summary.worldStructure, 1);

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
  assert.equal(nextWorkspace.graph.nodes[0].id, 'node_ctx');
  assert.equal(nextWorkspace.graphs.world.nodes[0].id, 'node_world');
  assert.equal(nextWorkspace.studio.orchestrator.status, 'needs-attention');
  assert.ok(nextWorkspace.studio.orchestrator.activeDeskIds.includes('context-manager'));
  assert.equal(nextWorkspace.studio.orchestrator.desks.executor.localState, 'blocked');
  assert.equal(nextWorkspace.rsg.summary.worldStructure, 1);
  assert.ok(nextWorkspace.pages[0].handoffs.length >= 1);
  assert.match(nextWorkspace.studio.orchestrator.desks['cto-architect'].thoughtBubble, /approval|reviewing|guardrails/i);
  assert.match(nextWorkspace.studio.orchestrator.desks.planner.thoughtBubble, /retry|waiting|sequencing|tasks/i);
  assert.match(nextWorkspace.studio.orchestrator.desks.executor.thoughtBubble, /blocked|queued|waiting/i);
  assert.ok((nextWorkspace.studio.teamBoard.summary.active || 0) >= 1);
  assert.ok(nextWorkspace.studio.teamBoard.cards[0].sourceAnchorRefs.includes('brain/emergence/plan.md'));

  const runtime = buildRuntimePayload(nextWorkspace);
  assert.equal(runtime.activePageId, nextWorkspace.activePageId);
  assert.ok(runtime.orchestrator.desks['cto-architect'].thoughtBubble);
  assert.ok(Array.isArray(runtime.pages));
  assert.equal(runtime.agentWorkers['context-manager'].status, 'running');
  assert.equal(runtime.agentWorkers['context-manager'].lastUsedFallback, true);
  assert.equal(runtime.agentWorkers.planner.status, 'idle');
  assert.deepEqual(runtime.agentWorkers.planner.proposalArtifactRefs, []);
  assert.equal(runtime.selfUpgrade.status, 'ready-to-apply');
  assert.equal(runtime.graphs.system.nodes[0].id, 'node_ctx');
  assert.equal(runtime.graphs.world.nodes[0].id, 'node_world');
  assert.equal(runtime.rsg.summary.worldStructure, 1);

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
          approvalState: index === 0 ? 'approved' : card.approvalState,
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
