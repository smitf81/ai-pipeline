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

function seedTask(rootPath, folderName, { patchText = '', applyStatus = 'pending' } = {}) {
  const taskDir = path.join(rootPath, 'work', 'tasks', folderName);
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(path.join(taskDir, 'idea.txt'), 'Seed task\n', 'utf8');
  fs.writeFileSync(path.join(taskDir, 'context.md'), '# Context\n', 'utf8');
  fs.writeFileSync(path.join(taskDir, 'plan.md'), '# Plan\n', 'utf8');
  fs.writeFileSync(path.join(taskDir, 'patch.diff'), patchText, 'utf8');
  fs.writeFileSync(path.join(taskDir, 'apply_result.json'), `${JSON.stringify({
    taskId: folderName.slice(0, 4),
    status: applyStatus,
    ok: applyStatus === 'applied',
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(taskDir, 'agent_attribution.json'), `${JSON.stringify({ agent_id: 'executor' }, null, 2)}\n`, 'utf8');
  return taskDir;
}

export default async function runExecutionHandoffStateTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-execution-handoff-'));
  const {
    collectDeskTasks,
    buildGovernedLoopContract,
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
    pages: [{ id: 'page_1', title: 'Execution page' }],
    activePageId: 'page_1',
    studio: {},
  });
  writeJson(rootPath, 'data/spatial/pages.json', {
    activePageId: 'page_1',
    pages: [{ id: 'page_1', title: 'Execution page' }],
  });
  writeJson(rootPath, 'data/spatial/intent-state.json', {
    registry: {
      currentIntentId: 'intent_exec_1',
      latestIntentId: 'intent_exec_1',
      byId: {
        intent_exec_1: {
          id: 'intent_exec_1',
          source: { type: 'canvas-text', ref: 'prompt-exec-1', requestedBy: 'canvas-intent' },
          geometry: { kind: 'unknown', region: null, stroke: null },
          semanticMeaning: {
            summary: 'Surface execution truth.',
            statement: 'Surface execution truth.',
            goal: 'Surface execution truth.',
            requestType: 'context_request',
            requestedOutcomes: ['Show execution state'],
            targets: ['planner-desk'],
            constraints: ['No fake completion'],
            urgency: 'normal',
            labels: ['execution'],
          },
          confidence: 0.82,
          provenance: { sourceType: 'canvas-text', sourceRef: 'prompt-exec-1', requestedBy: 'canvas-intent' },
          missingFields: [],
          status: 'canonical',
        },
      },
      records: [],
    },
    currentIntentId: 'intent_exec_1',
    summary: 'Surface execution truth.',
    status: 'ready',
  });
  writeJson(rootPath, 'data/spatial/studio-state.json', {
    handoffs: { contextToPlanner: null, history: [] },
    teamBoard: { cards: [], selectedCardId: null },
  });

  seedTask(rootPath, '0001-requested', { patchText: '' });
  seedTask(rootPath, '0002-deferred', { patchText: 'diff --git a/a.txt b/a.txt\n+patched\n' });
  seedTask(rootPath, '0003-blocked', { patchText: '' });
  seedTask(rootPath, '0004-diff-created', { patchText: 'diff --git a/b.txt b/b.txt\n+diff evidence\n' });

  const makeCard = (id, title) => createTeamBoardCard({
    cards: [],
    pageId: 'page_1',
    handoffId: 'handoff_exec_1',
    sourceNodeId: 'prompt-exec-1',
    sourceIntentId: 'intent_exec_1',
    sourceIntakeId: 'intake_exec_1',
    sourceAnchorRefs: ['brain/emergence/tasks.md'],
    title,
    createdAt: '2026-04-06T12:00:00.000Z',
  });

  const requestedCard = {
    ...makeCard('0001', 'Requested executor work'),
    id: 'card_requested',
    desk: 'Executor',
    status: 'active',
    state: 'Building package',
    builderTaskId: '0001',
    runnerTaskId: '0001',
    executionPackage: {
      status: 'building',
      taskId: '0001',
      taskDir: 'work/tasks/0001-requested',
      patchPath: 'work/tasks/0001-requested/patch.diff',
      changedFiles: [],
      targetProjectKey: 'ace-self',
      expectedAction: 'apply',
      summary: 'Builder started.',
      verificationPlan: { required: false, commands: [], qaScenarios: [], signature: null, summary: 'No verification required.', generatedAt: null },
    },
  };

  const deferredCard = {
    ...makeCard('0002', 'Deferred apply after diff'),
    id: 'card_deferred',
    desk: 'CTO',
    status: 'review',
    state: 'Approval required',
    builderTaskId: '0002',
    runnerTaskId: '0002',
    approvalState: 'pending',
    executionPackage: {
      status: 'ready',
      taskId: '0002',
      taskDir: 'work/tasks/0002-deferred',
      patchPath: 'work/tasks/0002-deferred/patch.diff',
      changedFiles: ['src/a.txt'],
      targetProjectKey: 'ace-self',
      expectedAction: 'apply',
      summary: 'Patch ready for review.',
      verificationPlan: { required: false, commands: [], qaScenarios: [], signature: null, summary: 'No verification required.', generatedAt: null },
    },
  };

  const blockedCard = {
    ...makeCard('0003', 'Blocked executor work'),
    id: 'card_blocked',
    desk: 'Executor',
    status: 'review',
    state: 'Flagged',
    builderTaskId: '0003',
    runnerTaskId: '0003',
    executionPackage: {
      status: 'blocked',
      taskId: '0003',
      taskDir: 'work/tasks/0003-blocked',
      patchPath: 'work/tasks/0003-blocked/patch.diff',
      changedFiles: [],
      targetProjectKey: 'ace-self',
      expectedAction: 'apply',
      summary: 'Blocked before diff creation.',
      verificationPlan: { required: false, commands: [], qaScenarios: [], signature: null, summary: 'No verification required.', generatedAt: null },
    },
    executorBlocker: {
      code: 'blocked_needs_external_patch',
      message: 'Execution is waiting on an external patch.',
    },
  };

  const diffCreatedCard = {
    ...makeCard('0004', 'Diff created with evidence'),
    id: 'card_diff',
    desk: 'Executor',
    status: 'complete',
    state: 'Package ready',
    builderTaskId: '0004',
    runnerTaskId: '0004',
    applyStatus: 'queued',
    executionPackage: {
      status: 'ready',
      taskId: '0004',
      taskDir: 'work/tasks/0004-diff-created',
      patchPath: 'work/tasks/0004-diff-created/patch.diff',
      changedFiles: ['src/b.txt'],
      targetProjectKey: 'ace-self',
      expectedAction: 'apply',
      summary: 'Patch recorded.',
      verificationPlan: { required: false, commands: [], qaScenarios: [], signature: null, summary: 'No verification required.', generatedAt: null },
    },
  };

  const workspace = {
    graph: { nodes: [], edges: [] },
    graphs: {
      system: { nodes: [], edges: [] },
      world: { nodes: [], edges: [] },
    },
    pages: [{ id: 'page_1', title: 'Execution page' }],
    activePageId: 'page_1',
    intentState: {
      currentIntentId: 'intent_exec_1',
      registry: {
        currentIntentId: 'intent_exec_1',
        latestIntentId: 'intent_exec_1',
        byId: {},
        records: [],
      },
    },
    studio: {
      handoffs: {
        contextToPlanner: {
          id: 'handoff_exec_1',
          sourceIntentId: 'intent_exec_1',
          sourceIntakeId: 'intake_exec_1',
          intentId: 'intent_exec_1',
          summary: 'Execution handoff.',
          status: 'ready',
        },
      },
      teamBoard: {
        cards: [requestedCard, deferredCard, blockedCard, diffCreatedCard],
        selectedCardId: 'card_requested',
      },
      orchestrator: { desks: {}, activeDeskIds: [], conflicts: [] },
      layout: {},
      deskProperties: {},
      agentWorkers: {},
    },
  };

  const plannerTasks = collectDeskTasks(workspace, 'planner', { rootPath });
  const requested = plannerTasks.find((task) => task.id === 'card_requested');
  const deferred = plannerTasks.find((task) => task.id === 'card_deferred');
  const blocked = plannerTasks.find((task) => task.id === 'card_blocked');
  const diffCreated = plannerTasks.find((task) => task.id === 'card_diff');

  assert.equal(requested.executionState.status, 'requested');
  assert.equal(requested.executionState.diff.status, 'missing');
  assert.equal(requested.executionState.diff.path, null);

  assert.equal(deferred.executionState.status, 'deferred');
  assert.equal(deferred.executionState.diff.status, 'created');
  assert.equal(deferred.executionState.diff.path, 'work/tasks/0002-deferred/patch.diff');

  assert.equal(blocked.executionState.status, 'blocked');
  assert.equal(blocked.executionState.blocker.code, 'blocked_needs_external_patch');
  assert.equal(blocked.executionState.diff.status, 'missing');

  assert.equal(diffCreated.executionState.status, 'deferred');
  assert.equal(diffCreated.executionState.diff.status, 'created');
  assert.equal(diffCreated.executionState.diff.path, 'work/tasks/0004-diff-created/patch.diff');
  assert.deepEqual(diffCreated.executionState.diff.changedFiles, ['src/b.txt']);

  const contract = buildGovernedLoopContract(workspace, { rootPath });
  const contractTask = contract.domains.planner.visibleWork.find((task) => task.id === 'card_diff');
  assert.equal(contractTask.executionState.diff.status, 'created');
  assert.ok(contract.domains.planner.sources.some((source) => source.route === '/api/task-artifacts'));
}
