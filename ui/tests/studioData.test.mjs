import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

const require = createRequire(import.meta.url);
const studioDataPath = path.resolve(process.cwd(), 'public', 'spatial', 'studioData.js');
const studioLayoutModelPath = path.resolve(process.cwd(), 'public', 'spatial', 'studioLayoutModel.js');

export default async function runStudioDataTests() {
  const {
    advanceOrchestratorState,
    buildAgentSnapshots,
    buildAgentContext,
    buildPlannerInputContract,
    createDefaultTeamBoard,
    createPlannerHandoff,
    deriveTaskEconomy,
    getStudioAgents,
    normalizeNotebookState,
    normalizeTeamBoardState,
  } = await loadModuleCopy(studioDataPath, { label: 'studioData' });
  const layoutModel = await loadModuleCopy(studioLayoutModelPath, { label: 'studioLayoutModel' });
  const {
    buildPlannerContractCheckQualityCard,
    buildRunnerContractCheckQualityCard,
    buildTaContractCheckQualityCard,
    buildUiContractCheckQualityCard,
  } = require('../../qa/testAttributeCards.js');
  const { TEST_METRIC_DEFINITIONS } = require('../../qa/testMetricDefinitions.js');
  const canonicalIntent = {
    id: 'intent_1',
    nodeId: 'node_1',
    createdAt: '2026-03-13T10:00:00.000Z',
    summary: 'Expose more agent workload in studio.',
    goal: 'Expose more agent workload in studio.',
    confidence: 0.42,
    anchorRefs: ['brain/emergence/roadmap.md'],
    requestedOutcomes: ['Expose task movement', 'Show task ownership'],
    constraints: ['Need clearer user execution path'],
    projectContext: {
      matchedTerms: ['studio'],
      blockers: ['Need clearer user execution path'],
    },
    provenance: {
      createdAt: '2026-03-13T10:00:00.000Z',
      sourceType: 'sanctioned-intent-parser',
      sourceRef: 'node_1',
      requestedBy: 'context-manager',
    },
  };
  const ghostProjection = {
    id: 'ghost_1',
    sourceIntentIds: ['intent_1'],
    proposedChange: { summary: 'Expose task movement', description: 'Ghost projection for planner review.' },
    confidence: 0.71,
    status: 'candidate',
    reasoning: ['sourceIntentId=intent_1', 'status=candidate'],
    provenance: {
      createdAt: '2026-03-13T10:00:01.000Z',
      sourceType: 'sketchpad-stroke',
      sourceRef: 'sketch_1',
      sourceIntentId: 'intent_1',
    },
  };
  const plannerInputContract = buildPlannerInputContract(canonicalIntent, ghostProjection, {
    blockers: ['Studio output is hard to audit'],
  });
  const blockedPlannerInput = buildPlannerInputContract(canonicalIntent, null, {
    blockers: ['Studio output is hard to audit'],
  });
  const handoff = createPlannerHandoff(canonicalIntent, ghostProjection, { blockers: ['Studio output is hard to audit'] });

  assert.equal(plannerInputContract.intentId, 'intent_1');
  assert.equal(plannerInputContract.ghostProjectionId, 'ghost_1');
  assert.equal(plannerInputContract.status, 'ready');
  assert.equal(blockedPlannerInput.status, 'blocked');
  assert.ok(blockedPlannerInput.missingFields.includes('ghost.id'));
  assert.equal(handoff.sourceAgentId, 'context-manager');
  assert.equal(handoff.targetAgentId, 'planner');
  assert.equal(handoff.status, 'needs-clarification');
  assert.equal(handoff.sourceNodeId, 'node_1');
  assert.equal(handoff.sourceIntentId, 'intent_1');
  assert.equal(handoff.ghostProjectionId, 'ghost_1');
  assert.ok(handoff.anchorRefs.includes('brain/emergence/roadmap.md'));
  assert.deepEqual(handoff.requestedOutcomes, ['Expose task movement', 'Show task ownership']);
  assert.deepEqual(handoff.tasks, ['Expose task movement', 'Show task ownership']);
  assert.match(handoff.problemStatement, /Goal: Expose more agent workload in studio\./);
  assert.match(handoff.problemStatement, /Still unclear:/);
  assert.equal(handoff.truth, null);
  assert.equal(handoff.plannerInputContract.intentId, 'intent_1');
  assert.equal(handoff.plannerInputContract.ghostProjectionId, 'ghost_1');
  assert.equal(handoff.plannerInputContract.provenance.intentId, 'intent_1');
  assert.equal(handoff.plannerInputContract.provenance.ghostProjectionId, 'ghost_1');
  assert.deepEqual(handoff.constraints, [
    'Need clearer user execution path',
    'Studio output is hard to audit',
  ]);

  assert.equal(layoutModel.STUDIO_LAYOUT_SCHEMA.version, 'studio-layout.v1');
  assert.deepEqual(layoutModel.STUDIO_LAYOUT_SCHEMA.room, {
    x: 56,
    y: 72,
    width: 1088,
    height: 664,
  });
  assert.deepEqual(
    layoutModel.STUDIO_LAYOUT_SCHEMA.departments.map((department) => ({
      id: department.id,
      label: department.label,
      kind: department.kind,
    })),
    [
      { id: 'dept-intake', label: 'Intake', kind: 'intake' },
      { id: 'dept-delivery', label: 'Delivery', kind: 'delivery' },
      { id: 'dept-quality', label: 'Quality', kind: 'quality' },
      { id: 'dept-archive', label: 'Archive', kind: 'archive' },
      { id: 'dept-research', label: 'R&D / Research & Development', kind: 'research' },
      { id: 'dept-control', label: 'Control Centre', kind: 'control' },
      { id: 'dept-talent-acquisition', label: 'Talent Acquisition', kind: 'talent' },
    ],
  );
  assert.deepEqual(
    layoutModel.STUDIO_LAYOUT_SCHEMA.departments.map((department) => department.deskIds),
    [
      ['context-manager'],
      ['planner', 'executor'],
      ['qa-lead'],
      ['memory-archivist'],
      ['rnd-lead'],
      ['cto-chief-of-staff', 'cto-architect'],
      ['integration_auditor'],
    ],
  );
  assert.equal(layoutModel.getStudioDeskRecord('planner').departmentId, 'dept-delivery');
  assert.equal(layoutModel.getStudioDepartmentForDesk('cto-architect').label, 'Control Centre');
  const defaultLayout = layoutModel.createDefaultStudioLayout();
  assert.deepEqual(defaultLayout.room, {
    x: 56,
    y: 72,
    width: 1088,
    height: 664,
  });
  assert.equal(defaultLayout.departments.length, 7);
  assert.equal(defaultLayout.controlCentreDeskId, 'cto-architect');
  assert.deepEqual(defaultLayout.desks['context-manager'].position, { x: 182, y: 252 });
  assert.deepEqual(defaultLayout.desks.planner.position, { x: 536, y: 252 });
  assert.deepEqual(defaultLayout.desks.executor.position, { x: 682, y: 252 });
  assert.deepEqual(defaultLayout.desks['memory-archivist'].position, { x: 620, y: 640 });
  assert.deepEqual(defaultLayout.desks['cto-chief-of-staff'].position, { x: 876, y: 422 });
  assert.deepEqual(defaultLayout.desks['cto-architect'].position, { x: 990, y: 422 });
  assert.deepEqual(defaultLayout.whiteboards.teamBoard, { x: 284, y: 88, width: 584, height: 208 });
  const renderModel = layoutModel.buildStudioRenderModel(defaultLayout, []);
  assert.equal(renderModel.departments.length, 7);
  assert.equal(renderModel.roomConnections.length, 6);
  assert.equal(renderModel.deskMap['cto-chief-of-staff'].department.label, 'Control Centre');
  assert.equal(renderModel.deskMap['qa-lead'].department.label, 'Quality');
  assert.equal(renderModel.desks.some((desk) => desk.id === 'context-manager'), false);
  assert.equal(getStudioAgents().find((agent) => agent.id === 'planner').departmentId, 'delivery');
  assert.ok(getStudioAgents().find((agent) => agent.id === 'planner').capabilities.includes('break intent into steps'));

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
      registry: {
        currentIntentId: 'intent_1',
        latestIntentId: 'intent_1',
        byId: {
          intent_1: {
            id: 'intent_1',
            source: {
              type: 'sanctioned-intent-parser',
              ref: 'node_ctx',
              requestedBy: 'context-manager',
            },
            geometry: { kind: 'unknown', region: null, stroke: null },
            semanticMeaning: {
              summary: 'Clarify what the planner should solve.',
              statement: 'Clarify what the planner should solve.',
              goal: 'Clarify what the planner should solve.',
              requestType: 'context_request',
              requestedOutcomes: ['Generate problem report', 'Show waiting-on-user state'],
              targets: [],
              constraints: [],
              urgency: 'normal',
              labels: ['plan'],
            },
            confidence: 0.77,
            createdAt: '2026-03-13T10:15:00.000Z',
            provenance: {
              sourceNodeId: 'node_ctx',
              sourceType: 'sanctioned-intent-parser',
              sourceRef: 'node_ctx',
              requestedBy: 'context-manager',
            },
            missingFields: ['geometry'],
            status: 'degraded',
            intentId: 'intent_1',
            sourceType: 'sanctioned-intent-parser',
            sourceRef: 'node_ctx',
            nodeId: 'node_ctx',
            requestedBy: 'context-manager',
            timestamp: '2026-03-13T10:15:00.000Z',
            priority: 'normal',
            summary: 'Clarify what the planner should solve.',
            statement: 'Clarify what the planner should solve.',
            goal: 'Clarify what the planner should solve.',
            requestType: 'context_request',
            requestedOutcomes: ['Generate problem report', 'Show waiting-on-user state'],
            tasks: ['Generate problem report', 'Show waiting-on-user state'],
            targets: [],
            constraints: [],
            projectContext: {
              currentFocus: 'node_ctx',
              matchedTerms: ['plan'],
              blockers: [],
              anchorRefs: [],
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
            criteria: [],
            classification: { role: 'context', labels: ['plan'] },
            metrics: { actionSignals: 3, constraintSignals: 1 },
          },
        },
        records: [],
      },
      currentIntentId: 'intent_1',
      summary: 'Clarify what the planner should solve.',
      status: 'degraded',
    },
    studio: {
      agentWorkers: {
        'context-manager': {
          status: 'running',
          mode: 'manual',
          backend: 'ollama',
          model: 'qwen3.5-9b',
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
          model: 'qwen3.5-9b',
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
          model: 'qwen3.5-9b',
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

  const economyBoard = normalizeTeamBoardState({
    ...workspace,
    pages: notebook.pages,
    activePageId: notebook.activePageId,
    studio: {
      ...workspace.studio,
      teamBoard: {
        ...createDefaultTeamBoard(),
        cards: [
          { id: 'task-plan', title: 'Plan task', status: 'plan', desk: 'Planner', state: 'Ready' },
          { id: 'task-active', title: 'Active task', status: 'active', desk: 'Executor', state: 'Running' },
          { id: 'task-complete', title: 'Complete task', status: 'complete', approvalState: 'approved', desk: 'Executor', state: 'Done' },
          { id: 'task-review', title: 'Review task', status: 'review', desk: 'CTO', state: 'Queued' },
          { id: 'task-binned', title: 'Binned task', status: 'binned', desk: 'Planner', state: 'Parked' },
        ],
      },
    },
  });
  const taskEconomy = deriveTaskEconomy(economyBoard);
  assert.equal(taskEconomy.intakeCount, 1);
  assert.equal(taskEconomy.wipCount, 1);
  assert.equal(taskEconomy.completionCount, 1);
  assert.equal(taskEconomy.rewardCount, 1);
  assert.equal(taskEconomy.bottleneckCount, 1);
  assert.equal(taskEconomy.shelvedCount, 1);
  assert.equal(taskEconomy.total, 5);
  assert.ok(taskEconomy.headline.includes('1 intake'));
  assert.ok(taskEconomy.detail.includes('Momentum'));

  const orchestrator = advanceOrchestratorState({
    workspace: {
      ...workspace,
      pages: notebook.pages,
      activePageId: notebook.activePageId,
      studio: {
        ...workspace.studio,
        layout: defaultLayout,
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
        layout: defaultLayout,
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
      repairLoop: {
        summary: {
          totalLanes: 4,
          activeLanes: 1,
          blockedLanes: 1,
          stalledLanes: 0,
          healthyLanes: 1,
          policyBlocked: 1,
        },
        lanes: [
          {
            lane_id: 'planner_canonical_integrity',
            label: 'Planner Canonical Integrity',
            owner_department: 'QA',
            status: 'blocked',
            open_investigations: 1,
            repair_job_count: 1,
            latest_attempt_verdict: 'policy_blocked',
            latest_job_status: 'policy_blocked',
            policy_blocked_job_count: 1,
            latest_policy_block_reason: 'Auto-apply is not permitted for this lane trust policy.',
            latest_attempt_at: '2026-03-24T10:15:00.000Z',
            trust_level: 'guarded',
            trust_reason: 'Planner integrity is policy-guarded; executor may inspect and validate, but patches require human review.',
            auto_apply_allowed: false,
            human_review_required_on_ambiguity: true,
            allowed_action_types: ['inspect', 'validate'],
            required_validation_gate_ids: ['planner-canonical-contract'],
            allowed_trigger_classes: ['planner_identity_mismatch'],
            scoped_targets: ['ui/server.js', 'ui/public/spatial/staffingRules.js'],
            max_attempts: 1,
            latest_job: {
              attempt_count: 1,
              latest_validation_evidence: {
                summary: 'Auto-apply is not permitted for this lane trust policy.',
              },
            },
          },
          {
            lane_id: 'ui_boot_integrity',
            label: 'UI Boot Integrity',
            owner_department: 'QA',
            status: 'healthy',
            open_investigations: 0,
            repair_job_count: 1,
            latest_attempt_verdict: 'accepted',
            latest_job_status: 'accepted',
            policy_blocked_job_count: 0,
            latest_attempt_at: '2026-03-24T10:20:00.000Z',
            trust_level: 'high',
            trust_reason: 'Blocking boot failures can auto-apply only inside browser boot entry and asset scope.',
            auto_apply_allowed: true,
            human_review_required_on_ambiguity: true,
            allowed_action_types: ['inspect', 'patch', 'validate'],
            required_validation_gate_ids: ['ui-boot-contract'],
            allowed_trigger_classes: ['missing_client_asset'],
            scoped_targets: ['ui/public/index.html', 'ui/public/spatial/spatialBootstrap.js'],
            max_attempts: 2,
            latest_job: {
              attempt_count: 1,
              latest_validation_evidence: {
                summary: 'Boot contract passed after stale reference cleanup.',
              },
            },
          },
        ],
      },
      qaMcpLiveStatus: {
        status: 'live',
        usage_state: 'active_gating',
        freshness: 'fresh',
        summary: 'QA is live and actively gating with MCP-backed evidence.',
        heartbeat_at: '2026-03-24T10:20:00.000Z',
        last_completed_cycle_at: '2026-03-24T10:20:00.000Z',
        mcp_configured: true,
        configured_tools: ['external_probe_check', 'qa_research_note'],
        mcp_reachable: true,
        last_ping_at: '2026-03-24T10:19:00.000Z',
        last_ping_status: 'ok',
        last_ping_source: 'external_mcp',
        last_call_at: '2026-03-24T10:19:00.000Z',
        last_call_tool: 'external_probe_check',
        last_call_status: 'ok',
        last_call_source: 'external_mcp',
        last_qa_gate_source: 'external_mcp',
        using_mcp_for_qa_decisions: true,
        notes: ['Active MCP gating: fresh MCP-backed evidence is influencing QA decisions.'],
      },
      qaCanaries: {
        last_run_at: '2026-03-24T10:21:00.000Z',
        overall_status: 'pass',
        total_canaries: 3,
        passed_count: 3,
        failed_count: 0,
        failing_canary_ids: [],
        summary: 'All 3 QA lane canaries passed.',
        results: [
          {
            canary_id: 'ui_boot_integrity_missing_asset',
            label: 'UI boot missing asset route',
            status: 'pass',
            checked_at: '2026-03-24T10:21:00.000Z',
            target_lane_id: 'ui_boot_integrity',
            target_lane_label: 'UI Boot Integrity',
            owner_department: 'QA',
            trigger: 'missing_client_asset',
            policy_outcome: 'auto_apply_allowed',
            validation_status: 'accepted',
            scoped_targets_summary: '2 targets | ui/public/index.html | spatialBootstrap.js',
            required_validation_gate_ids: ['ui-boot-contract'],
            latest_validation_summary: 'UI Boot Integrity checks passed.',
            notes: ['UI boot missing asset route passed.'],
          },
          {
            canary_id: 'planner_canonical_identity_guard',
            label: 'Planner canonical identity guard',
            status: 'pass',
            checked_at: '2026-03-24T10:21:00.000Z',
            target_lane_id: 'planner_canonical_integrity',
            target_lane_label: 'Planner Canonical Integrity',
            owner_department: 'Delivery',
            trigger: 'planner_identity_mismatch',
            policy_outcome: 'guarded_manual_review',
            validation_status: 'accepted',
            scoped_targets_summary: '2 targets | ui/server.js | staffingRules.js',
            required_validation_gate_ids: ['planner-canonical-contract', 'planner-staffing-rules'],
            latest_validation_summary: 'Planner Canonical Integrity checks passed.',
            notes: ['Planner canonical identity guard passed.'],
          },
        ],
      },
      agentCognitionSummary: {
        generated_at: '2026-03-24T10:22:00.000Z',
        summary: '3 live cognition paths visible | 1 agent observed with fallback history',
        agents: [
          {
            agent_id: 'context-manager',
            intended_cognition_mode: 'model_live',
            actual_last_cognition_mode: 'model_live',
            fallback_count: 0,
            last_live_model_call_at: '2026-03-24T10:13:00.000Z',
          },
          {
            agent_id: 'planner',
            intended_cognition_mode: 'model_live',
            actual_last_cognition_mode: 'model_live',
            fallback_count: 0,
            last_live_model_call_at: '2026-03-24T10:14:00.000Z',
          },
          {
            agent_id: 'executor',
            intended_cognition_mode: 'model_live',
            actual_last_cognition_mode: 'deterministic_fallback',
            fallback_count: 2,
            last_live_model_call_at: '2026-03-24T09:58:00.000Z',
          },
          {
            agent_id: 'evaluator',
            intended_cognition_mode: 'model_live',
            actual_last_cognition_mode: 'model_live',
            fallback_count: 0,
            last_live_model_call_at: '2026-03-24T10:16:00.000Z',
          },
        ],
      },
    },
  });

  const plannerAgentContext = buildAgentContext(snapshots.find((agent) => agent.id === 'planner'), {
    workspace: {
      ...workspace,
      pages: notebook.pages,
      activePageId: notebook.activePageId,
      studio: {
        ...workspace.studio,
        layout: defaultLayout,
        teamBoard: orchestrator.teamBoard,
        orchestrator,
      },
    },
  }, { layout: defaultLayout });
  assert.equal(plannerAgentContext.id, 'planner');
  assert.equal(plannerAgentContext.desk.label, 'Planner');
  assert.equal(plannerAgentContext.department.label, 'Delivery');
  assert.equal(typeof plannerAgentContext.global.orchestratorStatus, 'string');
  assert.ok(plannerAgentContext.task.currentGoal);
  assert.match(plannerAgentContext.summary, /Planner/);

  const contextSnapshot = snapshots.find((agent) => agent.id === 'context-manager');
  const archivistSnapshot = snapshots.find((agent) => agent.id === 'memory-archivist');
  const plannerSnapshot = snapshots.find((agent) => agent.id === 'planner');
  const executorSnapshot = snapshots.find((agent) => agent.id === 'executor');
  const qaLeadSnapshot = snapshots.find((agent) => agent.id === 'qa-lead');
  const evaluatorSnapshot = snapshots.find((agent) => agent.id === 'evaluator');
  const ctoSnapshot = snapshots.find((agent) => agent.id === 'cto-architect');

  assert.equal(snapshots.length, 11);
  assert.ok(contextSnapshot);
  assert.ok(archivistSnapshot);
  assert.ok(plannerSnapshot);
  assert.ok(executorSnapshot);
  assert.ok(qaLeadSnapshot);
  assert.ok(evaluatorSnapshot);
  assert.ok(ctoSnapshot);
  assert.ok(plannerSnapshot.agentContext);
  assert.equal(plannerSnapshot.agentContext.desk.label, 'Planner');
  assert.equal(contextSnapshot.deskSnapshot.handoff.summary, 'Planner brief ready.');
  assert.deepEqual(
    contextSnapshot.deskSnapshot.sections.map((section) => section.label),
    ['Desk Truth', 'Current Job', 'Context Worker', 'Core Truth', 'Problem To Solve', 'Task Creation', 'Intent Extraction', 'KPIs', 'Recent History', 'Waiting On You'],
  );
  assert.equal(contextSnapshot.deskSnapshot.sections.find((section) => section.label === 'Context Worker').value, 'Status: running | backend ollama | model qwen3.5-9b');
  assert.equal(contextSnapshot.deskSnapshot.sections.find((section) => section.label === 'Task Creation').items.length, 2);
  assert.equal(archivistSnapshot.deskSnapshot.sections[0].label, 'Desk Truth');
  assert.match(archivistSnapshot.deskSnapshot.sections[0].truth.department, /Memory Archive/i);
  assert.ok(Array.isArray(archivistSnapshot.deskSnapshot.truth.guardrails));
  assert.equal(plannerSnapshot.deskSnapshot.handoff.id, 'handoff_1');
  assert.equal(plannerSnapshot.deskSnapshot.sections[0].label, 'Desk Truth');
  assert.ok(plannerSnapshot.deskSnapshot.sections.some((section) => section.label === 'Task Economy'));
  assert.ok(plannerSnapshot.deskSnapshot.sections.some((section) => section.label === 'Task Movement'));
  assert.ok(plannerSnapshot.deskSnapshot.sections.find((section) => section.label === 'Task Movement').items.length >= 1);
  assert.ok(plannerSnapshot.deskSnapshot.sections.some((section) => section.label === 'Planner Worker'));
  assert.ok(plannerSnapshot.deskSnapshot.sections.some((section) => section.label === 'Planner Handoff'));
  assert.ok(plannerSnapshot.deskSnapshot.sections.some((section) => section.label === 'Produced Cards'));
  assert.ok(plannerSnapshot.deskSnapshot.sections.some((section) => section.label === 'Proposal Artifacts'));
  assert.ok(plannerSnapshot.deskSnapshot.taskEconomy.backlogPressure >= 0);
  assert.equal(plannerSnapshot.presence.cognitionMode, 'model_live');
  assert.equal(plannerSnapshot.presence.icon, '🧠');
  assert.equal(executorSnapshot.deskSnapshot.sections[0].label, 'Desk Truth');
  assert.equal(executorSnapshot.deskSnapshot.sections.find((section) => section.id === 'execution-selection').label, 'Mutation Queue');
  assert.equal(executorSnapshot.deskSnapshot.sections.find((section) => section.id === 'executor-worker').value, 'Status: idle | backend ollama | model qwen3.5-9b');
  assert.ok(executorSnapshot.deskSnapshot.sections.some((section) => section.label === 'Task Economy'));
  assert.equal(executorSnapshot.deskSnapshot.taskEconomy.rewardState, plannerSnapshot.deskSnapshot.taskEconomy.rewardState);
  assert.equal(executorSnapshot.presence.cognitionMode, 'fallback');
  assert.equal(executorSnapshot.presence.fallbackCount, 2);
  assert.equal(executorSnapshot.presence.health < plannerSnapshot.presence.health, true);
  assert.deepEqual(
    qaLeadSnapshot.deskSnapshot.sections.map((section) => section.label),
    ['QA Health Overview', 'QA MCP Proof of Life', 'Desk Properties', 'QA Live Operator', 'QA Output Feed', 'Lane Canaries', 'Freshness & Hygiene', 'Repair Lanes', 'Evaluator Movement', 'Assigned Agent Liveness', 'Scorecards', 'Investigations', 'Advisory / Research'],
  );
  assert.deepEqual(
    qaLeadSnapshot.deskSnapshot.sections.map((section) => section.kind),
    ['qa-overview', 'qa-mcp-live', 'qa-properties', 'qa-operator', 'qa-output-feed', 'qa-canaries', 'qa-hygiene', 'qa-repair-lanes', 'qa-evaluator', 'qa-agent-cognition', 'qa-scorecards', 'qa-investigations', 'qa-research'],
  );
  assert.equal(qaLeadSnapshot.deskSnapshot.sections.length, 13);
  const qaPropertiesSection = qaLeadSnapshot.deskSnapshot.sections.find((section) => section.id === 'qa-properties');
  assert.ok(qaPropertiesSection);
  assert.equal(Array.isArray(qaPropertiesSection.items), true);
  assert.ok(qaPropertiesSection.items.some((item) => /tool use/i.test(String(item?.value || ''))));
  const qaOverviewSection = qaLeadSnapshot.deskSnapshot.sections.find((section) => section.id === 'qa-overview');
  assert.ok(qaOverviewSection);
  assert.equal(qaOverviewSection.overview.openInvestigationsCount, 0);
  assert.equal(qaOverviewSection.overview.researchAvailableCount, 0);
  const qaMcpLiveSection = qaLeadSnapshot.deskSnapshot.sections.find((section) => section.id === 'qa-mcp-live');
  assert.ok(qaMcpLiveSection);
  assert.equal(qaMcpLiveSection.kind, 'qa-mcp-live');
  assert.equal(qaMcpLiveSection.liveStatus.status, 'live');
  assert.equal(qaMcpLiveSection.liveStatus.using_mcp_for_qa_decisions, true);
  assert.equal(qaMcpLiveSection.liveStatus.last_call_tool, 'external_probe_check');
  const qaOperatorSection = qaLeadSnapshot.deskSnapshot.sections.find((section) => section.id === 'qa-operator');
  assert.ok(qaOperatorSection);
  assert.equal(qaOperatorSection.kind, 'qa-operator');
  assert.match(qaOperatorSection.summary, /QA proof-of-life, browser pass, lane canaries, and loop audit/);
  assert.ok(Array.isArray(qaOperatorSection.liveRun.output_feed));
  const qaOutputFeedSection = qaLeadSnapshot.deskSnapshot.sections.find((section) => section.id === 'qa-output-feed');
  assert.ok(qaOutputFeedSection);
  assert.equal(qaOutputFeedSection.kind, 'qa-output-feed');
  assert.ok(Array.isArray(qaOutputFeedSection.feed));
  assert.equal(qaOutputFeedSection.feed.length, 0);
  const qaCanarySection = qaLeadSnapshot.deskSnapshot.sections.find((section) => section.id === 'qa-canaries');
  assert.ok(qaCanarySection);
  assert.equal(qaCanarySection.kind, 'qa-canaries');
  assert.equal(qaCanarySection.canaries.overall_status, 'pass');
  assert.equal(qaCanarySection.canaries.total_canaries, 3);
  assert.equal(qaCanarySection.canaries.results.length, 2);
  const qaHygieneSection = qaLeadSnapshot.deskSnapshot.sections.find((section) => section.id === 'qa-hygiene');
  assert.ok(qaHygieneSection);
  assert.equal(qaHygieneSection.surfaces.length >= 5, true);
  assert.ok(qaHygieneSection.surfaces.some((surface) => surface.surface_id === 'planner'));
  assert.ok(qaHygieneSection.surfaces.some((surface) => surface.surface_id === 'research'));
  const qaRepairLaneSection = qaLeadSnapshot.deskSnapshot.sections.find((section) => section.id === 'qa-repair-lanes');
  assert.ok(qaRepairLaneSection);
  assert.equal(qaRepairLaneSection.kind, 'qa-repair-lanes');
  assert.equal(qaRepairLaneSection.lanes.length, 2);
  assert.equal(qaRepairLaneSection.defaultOpen, true);
  assert.equal(qaRepairLaneSection.lanes[0].lane_id, 'planner_canonical_integrity');
  assert.equal(qaRepairLaneSection.lanes[0].outcome_status, 'policy_blocked');
  assert.match(qaRepairLaneSection.lanes[0].latest_policy_block_reason, /Auto-apply is not permitted/);
  assert.equal(qaRepairLaneSection.lanes[1].outcome_status, 'success');
  const qaEvaluatorSection = qaLeadSnapshot.deskSnapshot.sections.find((section) => section.id === 'qa-evaluator');
  assert.ok(qaEvaluatorSection);
  assert.equal(qaEvaluatorSection.kind, 'qa-evaluator');
  const qaAgentCognitionSection = qaLeadSnapshot.deskSnapshot.sections.find((section) => section.id === 'qa-agent-cognition');
  assert.ok(qaAgentCognitionSection);
  assert.equal(qaAgentCognitionSection.kind, 'qa-agent-cognition');
  const qaInvestigationsSection = qaLeadSnapshot.deskSnapshot.sections.find((section) => section.id === 'qa-investigations');
  assert.ok(qaInvestigationsSection);
  assert.equal(qaInvestigationsSection.kind, 'qa-investigations');
  assert.equal(qaInvestigationsSection.items.length, 0);
  const qaResearchSection = qaLeadSnapshot.deskSnapshot.sections.find((section) => section.id === 'qa-research');
  assert.ok(qaResearchSection);
  assert.equal(qaResearchSection.kind, 'qa-research');
  assert.equal(qaResearchSection.notes.length, 0);
  const qaScorecardSection = qaLeadSnapshot.deskSnapshot.sections.find((section) => section.id === 'qa-scorecards');
  assert.ok(qaScorecardSection);
  assert.equal(qaScorecardSection.kind, 'qa-scorecards');
  assert.equal(qaScorecardSection.cards.length, 4);
  assert.equal(qaScorecardSection.defaultOpen, false);
  assert.equal(qaScorecardSection.suiteStatus, 'stale');
  assert.match(qaScorecardSection.suiteSummary, /4 scorecards \| 0 pass \| 0 warn \| 4 stale/);
  assert.deepEqual(
    qaScorecardSection.cards.map((card) => card.desk),
    ['planner', 'runner', 'ta', 'ui'],
  );
  assert.deepEqual(
    qaScorecardSection.cards.map((card) => card.id),
    ['planner.contract_check', 'runner.contract_check', 'ta.contract_check', 'ui.contract_check'],
  );
  assert.deepEqual(
    qaScorecardSection.cards.map((card) => card.overallScore.value),
    [3.5, 3.6, 3.2, 3.6],
  );
  assert.deepEqual(
    qaScorecardSection.cards.map((card) => card.rollupStatus),
    ['stale', 'stale', 'stale', 'stale'],
  );
  for (const card of qaScorecardSection.cards) {
    assert.equal(card.testId, 'contract_check');
    assert.equal(card.validation.ok, true);
    assert.deepEqual(card.validation.issues, []);
    assert.match(card.validation.summary, /complete/i);
  }
  assert.equal(qaScorecardSection.cards[2].reportedStatus, 'pass');
  assert.equal(qaScorecardSection.cards[2].thresholds.passMin, 3.5);
  assert.match(qaScorecardSection.cards[2].rollupReasons[0], /stale/i);
  assert.equal(qaScorecardSection.definitions.metrics.integrity.label, 'Integrity');
  assert.equal(qaScorecardSection.meta.deskCount, 4);
  assert.equal(qaScorecardSection.meta.testCount, 4);
  assert.equal(qaLeadSnapshot.workload.outputs, 4);
  assert.equal(ctoSnapshot.deskSnapshot.sections[0].label, 'Desk Truth');
  const qaSummarySection = ctoSnapshot.deskSnapshot.sections.find((section) => section.id === 'qa-summary');
  assert.ok(qaSummarySection);
  assert.equal(qaSummarySection.kind, 'qa-summary');
  assert.equal(qaSummarySection.scorecardCount, 4);
  assert.equal(qaSummarySection.latestBrowserRun.scenario, 'layout-pass');
  assert.equal(qaSummarySection.localGate.unit.status, 'pass');
  assert.equal(qaSummarySection.localGate.studioBoot.verdict, 'pass');
  assert.ok(!ctoSnapshot.deskSnapshot.sections.some((section) => section.id === 'qa-scorecards'));
}
