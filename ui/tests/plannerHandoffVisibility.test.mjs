import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function writeJson(rootPath, relativePath, payload) {
  const targetPath = path.join(rootPath, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export default async function runPlannerHandoffVisibilityTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-planner-visibility-'));
  const {
    collectDeskTasks,
    persistCanonicalIntakeRecord,
  } = require('../server.js');
  const {
    createTeamBoardCard,
  } = require('../orchestratorState.js');

  writeJson(rootPath, 'data/spatial/workspace.json', {
    graph: { nodes: [], edges: [] },
    graphs: {
      system: { nodes: [], edges: [] },
      world: { nodes: [], edges: [] },
    },
    pages: [{ id: 'page_1', title: 'Planner page' }],
    activePageId: 'page_1',
    studio: {},
  });
  writeJson(rootPath, 'data/spatial/pages.json', {
    activePageId: 'page_1',
    pages: [{ id: 'page_1', title: 'Planner page' }],
  });
  writeJson(rootPath, 'data/spatial/intent-state.json', {
    registry: {
      currentIntentId: 'intent_planner_1',
      latestIntentId: 'intent_planner_1',
      byId: {
        intent_planner_1: {
          id: 'intent_planner_1',
          source: { type: 'canvas-text', ref: 'prompt-planner-1', requestedBy: 'canvas-intent' },
          geometry: { kind: 'unknown', region: null, stroke: null },
          semanticMeaning: {
            summary: 'Surface canonical planner work items.',
            statement: 'Surface canonical planner work items.',
            goal: 'Surface canonical planner work items.',
            requestType: 'context_request',
            requestedOutcomes: ['Show planner-visible work'],
            targets: ['planner-desk'],
            constraints: ['No duplicate state'],
            urgency: 'normal',
            labels: ['planner'],
          },
          confidence: 0.83,
          provenance: {
            sourceType: 'canvas-text',
            sourceRef: 'prompt-planner-1',
            requestedBy: 'canvas-intent',
          },
          missingFields: [],
          status: 'canonical',
        },
      },
      records: [],
    },
    currentIntentId: 'intent_planner_1',
    summary: 'Surface canonical planner work items.',
    status: 'ready',
  });
  writeJson(rootPath, 'data/spatial/studio-state.json', {
    handoffs: {
      contextToPlanner: null,
      history: [],
    },
    teamBoard: {
      cards: [],
      selectedCardId: null,
    },
  });

  const intakeWrite = persistCanonicalIntakeRecord({
    id: 'intake_planner_1',
    channel: 'canvas_text',
    text: 'Show planner-visible work from governed intent.',
    requestedBy: 'canvas-intent',
    sourceType: 'canvas-text',
    sourceRef: 'prompt-planner-1',
    originRoute: '/api/spatial/executive/route',
    processingStatus: 'routed',
    route: 'intent-scan',
    canonicalIntentId: 'intent_planner_1',
    handoffId: 'handoff_planner_1',
    resultSummary: 'Planner intake was recorded canonically.',
  }, { rootPath });

  const blockedPlannerCard = {
    ...createTeamBoardCard({
      cards: [],
      pageId: 'page_1',
      handoffId: 'handoff_planner_1',
      sourceNodeId: 'prompt-planner-1',
      sourceIntentId: 'intent_planner_1',
      sourceIntakeId: 'intake_planner_1',
      sourceAnchorRefs: ['brain/emergence/tasks.md'],
      title: 'Planner-visible downstream blocker',
      createdAt: '2026-04-06T11:00:00.000Z',
    }),
    desk: 'Executor',
    status: 'active',
    state: 'Blocked',
    executorBlocker: {
      code: 'blocked_needs_external_patch',
      message: 'Executor is waiting on an external patch.',
    },
    taskFlow: {
      phase: 'active',
      assignmentState: 'assigned',
      ownerDeskId: 'executor',
      assigneeDeskId: 'executor',
      sourceIntentId: 'intent_planner_1',
      sourceHandoffId: 'handoff_planner_1',
      lastTransitionAt: '2026-04-06T11:05:00.000Z',
      lastTransitionLabel: 'Execution blocked',
      history: [],
    },
    updatedAt: '2026-04-06T11:05:00.000Z',
  };

  const workspace = {
    ...intakeWrite.workspace,
    pages: [{ id: 'page_1', title: 'Planner page' }],
    activePageId: 'page_1',
    studio: {
      ...(intakeWrite.workspace.studio || {}),
      handoffs: {
        contextToPlanner: {
          id: 'handoff_planner_1',
          sourceAgentId: 'context-manager',
          targetAgentId: 'planner',
          createdAt: '2026-04-06T11:00:00.000Z',
          sourceNodeId: 'prompt-planner-1',
          sourceIntentId: 'intent_planner_1',
          sourceIntakeId: 'intake_planner_1',
          intentId: 'intent_planner_1',
          sourceType: 'canvas-text',
          sourceRef: 'prompt-planner-1',
          requestedBy: 'canvas-intent',
          summary: 'Planner-ready governed intent.',
          requestedOutcomes: ['Show planner-visible work'],
          tasks: ['Show planner-visible work'],
          constraints: ['No duplicate state'],
          anchorRefs: ['brain/emergence/tasks.md'],
          confidence: 0.83,
          status: 'ready',
          plannerStatus: 'blocked',
          plannerLastBlockedReason: 'Executor is waiting on an external patch.',
          plannerProducedCardIds: [blockedPlannerCard.id],
        },
        history: [],
      },
      teamBoard: {
        cards: [blockedPlannerCard],
        selectedCardId: blockedPlannerCard.id,
      },
    },
  };

  const plannerTasks = collectDeskTasks(workspace, 'planner');
  const plannerTask = plannerTasks.find((task) => task.id === blockedPlannerCard.id);
  assert.ok(plannerTask);
  assert.equal(plannerTask.source, 'team-board');
  assert.equal(plannerTask.sourceIntakeId, 'intake_planner_1');
  assert.equal(plannerTask.sourceIntentId, 'intent_planner_1');
  assert.equal(plannerTask.sourceHandoffId, 'handoff_planner_1');
  assert.equal(plannerTask.ownerDeskId, 'executor');
  assert.equal(plannerTask.nextOwnerDeskId, 'executor');
  assert.equal(plannerTask.taskPhase, 'active');
  assert.equal(plannerTask.assignmentState, 'assigned');
  assert.equal(plannerTask.blockedReason, 'Executor is waiting on an external patch.');
  assert.equal(workspace.studio.handoffs.contextToPlanner.sourceIntakeId, 'intake_planner_1');
  assert.equal(workspace.studio.handoffs.contextToPlanner.sourceIntentId, 'intent_planner_1');
  assert.deepEqual(workspace.studio.handoffs.contextToPlanner.plannerProducedCardIds, [blockedPlannerCard.id]);
}
