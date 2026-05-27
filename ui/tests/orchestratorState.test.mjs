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
    createTeamBoardCard,
    normalizeTeamBoardState,
    normalizeNotebookState,
    deriveExecutorBlocker,
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
      registry: {
        currentIntentId: 'intent_1',
        latestIntentId: 'intent_1',
        byId: {
          intent_1: {
            id: 'intent_1',
            source: { type: 'cto-chat', ref: 'chat-1', requestedBy: 'cto' },
            geometry: { kind: 'unknown', region: null, stroke: null },
            semanticMeaning: {
              summary: 'Clarify desk overlap',
              statement: 'Clarify desk overlap',
              goal: 'Clarify desk overlap',
              requestType: 'planning_request',
              requestedOutcomes: ['Clarify desk overlap', 'Show current desk job'],
              targets: ['planner'],
              constraints: [],
              urgency: 'high',
              labels: ['desk'],
            },
            confidence: 0.42,
            createdAt: '2026-03-16T08:30:00.000Z',
            provenance: {
              sourceType: 'cto-chat',
              sourceRef: 'chat-1',
              requestedBy: 'cto',
              anchorRefs: ['brain/emergence/plan.md'],
            },
            missingFields: ['geometry'],
            status: 'degraded',
            intentId: 'intent_1',
            sourceType: 'cto-chat',
            sourceRef: 'chat-1',
            nodeId: 'node_ctx',
            requestedBy: 'cto',
            timestamp: '2026-03-16T08:30:00.000Z',
            priority: 'high',
            summary: 'Clarify desk overlap',
            statement: 'Clarify desk overlap',
            goal: 'Clarify desk overlap',
            requestType: 'planning_request',
            requestedOutcomes: ['Clarify desk overlap', 'Show current desk job'],
            tasks: ['Clarify desk overlap', 'Show current desk job'],
            targets: ['planner'],
            constraints: [],
            projectContext: { currentFocus: 'chat-1', matchedTerms: ['desk'], blockers: [], anchorRefs: ['brain/emergence/plan.md'] },
            truth: {
              plannerBrief: 'Planner should treat this as: Clarify desk overlap; Show current desk job',
              requestedOutcomes: ['Clarify desk overlap', 'Show current desk job'],
              readiness: {
                intentConfidence: 0.42,
                plannerUsefulness: 0.5,
                executionReadiness: 0.2,
                deployReadiness: 0.1,
              },
            },
          },
        },
        records: [],
      },
      currentIntentId: 'intent_1',
      summary: 'Clarify desk overlap',
      status: 'degraded',
    },
    rsg: {
      ...createDefaultRsgState(),
      activity: [
        {
          id: 'rsg_activity_1',
          type: 'rsg-generate',
          at: '2026-03-16T08:30:00.000Z',
          sourceNodeId: 'node_ctx',
          sourceNodeLabel: 'Clarify desk overlap',
          summary: 'Drafted linked system notes',
          confidence: 0.58,
          generatedCount: 2,
          replacedCount: 0,
          usedFallback: false,
          trigger: 'enter',
          generationId: 'gen_1',
        },
      ],
      lastSourceNodeId: 'node_ctx',
      lastGenerationAt: '2026-03-16T08:30:00.000Z',
      lastStatus: 'rsg-generate',
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
      handoffs: {
        contextToPlanner: {
          id: 'handoff_1',
          summary: 'Planner brief ready.',
          status: 'needs-clarification',
          anchorRefs: ['brain/emergence/plan.md', 'brain/emergence/tasks.md'],
          requestedOutcomes: ['Clarify desk overlap', 'Show current desk job'],
        },
        plannerToContext: {
          id: 'feedback_1',
          sourceHandoffId: 'handoff_1',
          action: 'retry-handoff',
          detail: 'Need clearer acceptance criteria.',
          anchorRefs: ['brain/emergence/plan.md'],
        },
      },
      teamBoard: {
        cards: [
          createTeamBoardCard({
            cards: [],
            pageId: 'page_1',
            handoffId: 'handoff_1',
            sourceNodeId: 'node_ctx',
            sourceAnchorRefs: ['brain/emergence/plan.md', 'brain/emergence/tasks.md'],
            title: 'Clarify desk overlap',
            createdAt: '2026-03-16T08:31:00.000Z',
          }),
        ],
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
  assert.equal(nextWorkspace.rsg.activity[0].id, 'rsg_activity_1');
  assert.equal(nextWorkspace.rsg.lastStatus, 'rsg-generate');
  assert.ok(nextWorkspace.pages[0].handoffs.length >= 1);
  assert.match(nextWorkspace.studio.orchestrator.desks['cto-architect'].thoughtBubble, /approval|reviewing|guardrails/i);
  assert.match(nextWorkspace.studio.orchestrator.desks.planner.thoughtBubble, /retry|waiting|sequencing|tasks/i);
  assert.match(nextWorkspace.studio.orchestrator.desks.executor.thoughtBubble, /blocked|queued|waiting/i);
  assert.ok((nextWorkspace.studio.teamBoard.summary.active || 0) >= 1);
  assert.ok((nextWorkspace.studio.teamBoard.summary.assigned || 0) >= 1);
  assert.ok(nextWorkspace.studio.teamBoard.cards[0].sourceAnchorRefs.includes('brain/emergence/plan.md'));

  const runtime = buildRuntimePayload(nextWorkspace);
  assert.equal(runtime.activePageId, nextWorkspace.activePageId);
  assert.ok(runtime.orchestrator.desks['cto-architect'].thoughtBubble);
  assert.ok(Array.isArray(runtime.pages));
  assert.equal(runtime.agentWorkers['context-manager'].status, 'running');
  assert.equal(runtime.agentWorkers['context-manager'].lastUsedFallback, true);
  assert.equal(runtime.agentWorkers.planner.status, 'idle');
  assert.deepEqual(runtime.agentWorkers.planner.proposalArtifactRefs, []);
  assert.equal(runtime.plannerRuntime.identity.answer, 'Planner');
  assert.equal(runtime.plannerRuntime.runtimeState, 'live');
  assert.equal(runtime.plannerRuntime.staffingState, 'present');
  assert.equal(runtime.plannerRuntime.modelState, 'ready');
  assert.equal(runtime.canonicalIntent.intentId, 'intent_1');
  assert.equal(runtime.canonicalIntent.sourceType, 'cto-chat');
  assert.equal(runtime.selfUpgrade.status, 'ready-to-apply');
  assert.equal(runtime.graphs.system.nodes[0].id, 'node_ctx');
  assert.equal(runtime.graphs.world.nodes[0].id, 'node_world');
  assert.equal(runtime.rsg.summary.worldStructure, 1);
  assert.equal(runtime.rsg.activity[0].id, 'rsg_activity_1');
  assert.equal(runtime.rsg.lastStatus, 'rsg-generate');

  const degradedRuntime = buildRuntimePayload({
    ...workspace,
    studio: {
      ...workspace.studio,
      agentWorkers: {
        ...workspace.studio.agentWorkers,
        planner: {
          ...workspace.studio.agentWorkers.planner,
          status: 'degraded',
          statusReason: 'Model unavailable on local backend.',
          lastBlockedReason: 'Model unavailable on local backend.',
        },
      },
    },
  });
  assert.equal(degradedRuntime.plannerRuntime.runtimeState, 'degraded');
  assert.equal(degradedRuntime.plannerRuntime.modelState, 'degraded');
  assert.equal(degradedRuntime.plannerRuntime.policyState, 'allowed');

  const blockedRuntime = buildRuntimePayload({
    ...workspace,
    studio: {
      ...workspace.studio,
      agentWorkers: {
        ...workspace.studio.agentWorkers,
        planner: {
          ...workspace.studio.agentWorkers.planner,
          status: 'blocked',
          statusReason: 'Policy gate requires approval.',
          lastBlockedReason: 'Policy gate requires approval.',
        },
      },
    },
  });
  assert.equal(blockedRuntime.plannerRuntime.runtimeState, 'blocked');
  assert.equal(blockedRuntime.plannerRuntime.policyState, 'blocked');

  const absentRuntime = buildRuntimePayload({
    ...workspace,
    studio: {
      ...workspace.studio,
      layout: {},
      agentWorkers: {},
    },
  });
  assert.equal(absentRuntime.plannerRuntime.runtimeState, 'absent');
  assert.equal(absentRuntime.plannerRuntime.staffingState, 'absent');

  const board = normalizeTeamBoardState({
    ...workspace,
    pages: notebook.pages,
    activePageId: notebook.activePageId,
  });
  assert.equal(board.cards[0].taskFlow.phase, 'planned');
  assert.equal(board.cards[0].taskFlow.assignmentState, 'unassigned');
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

  const stalePreflightWorkspace = advanceOrchestratorWorkspace({
    ...workspace,
    pages: notebook.pages,
    activePageId: notebook.activePageId,
    studio: {
      ...workspace.studio,
      selfUpgrade: {
        status: 'blocked',
        taskId: '9999',
        preflight: {
          ok: true,
          taskId: '9999',
          summary: 'stale preflight',
        },
      },
      teamBoard: {
        ...board,
        selectedCardId: board.cards[0].id,
        cards: board.cards.map((card, index) => ({
          ...card,
          status: index === 0 ? 'complete' : card.status,
          approvalState: index === 0 ? 'approved' : card.approvalState,
          applyStatus: index === 0 ? 'queued' : card.applyStatus,
          targetProjectKey: 'ace-self',
          builderTaskId: index === 0 ? '0007' : card.builderTaskId,
          executionPackage: {
            ...(card.executionPackage || {}),
            status: 'ready',
            taskId: '0007',
          },
        })),
      },
    },
  }, {
    dashboardState: { blockers: [] },
    runs: [],
  });
  const staleCard = stalePreflightWorkspace.studio.teamBoard.cards[0];
  const blocker = deriveExecutorBlocker(staleCard, stalePreflightWorkspace);
  assert.equal(blocker.code, 'preflight-stale');
  assert.match(stalePreflightWorkspace.studio.orchestrator.desks.executor.blockedReason, /stale/i);
  assert.match(stalePreflightWorkspace.studio.orchestrator.desks['cto-architect'].thoughtBubble, /stale|blocked/i);
}
