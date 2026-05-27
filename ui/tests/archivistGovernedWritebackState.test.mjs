import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function writeJson(rootPath, relativePath, payload) {
  const targetPath = path.join(rootPath, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode || 0,
          json: body ? JSON.parse(body) : null,
        });
      });
    }).on('error', reject);
  });
}

export default async function runArchivistGovernedWritebackStateTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-archivist-loop-'));
  const {
    collectDeskTasks,
    buildGovernedLoopContract,
  } = require('../server.js');
  const { applyArchivistWriteback } = require('../archivistWriteback.js');
  const { createTeamBoardCard } = require('../orchestratorState.js');

  writeJson(rootPath, 'data/spatial/workspace.json', {
    graph: { nodes: [], edges: [] },
    graphs: {
      system: { nodes: [], edges: [] },
      world: { nodes: [], edges: [] },
    },
    pages: [{ id: 'page_1', title: 'Archivist page' }],
    activePageId: 'page_1',
    studio: {},
  });
  writeJson(rootPath, 'data/spatial/pages.json', {
    activePageId: 'page_1',
    pages: [{ id: 'page_1', title: 'Archivist page' }],
  });
  writeJson(rootPath, 'data/spatial/intent-state.json', {
    registry: {
      currentIntentId: 'intent_arch_1',
      latestIntentId: 'intent_arch_1',
      byId: {
        intent_arch_1: {
          id: 'intent_arch_1',
          source: { type: 'canvas-text', ref: 'prompt-arch-1', requestedBy: 'canvas-intent' },
          semanticMeaning: {
            summary: 'Preserve the blocked governed loop outcome canonically.',
            statement: 'Preserve the blocked governed loop outcome canonically.',
            goal: 'Preserve the blocked governed loop outcome canonically.',
            requestType: 'planning_request',
            requestedOutcomes: ['Archive the stable blocked outcome'],
            targets: ['planner', 'memory-archivist'],
            constraints: ['No retrospective UI synthesis'],
            urgency: 'normal',
            labels: ['archivist'],
          },
          confidence: 0.88,
          provenance: { sourceType: 'canvas-text', sourceRef: 'prompt-arch-1' },
          missingFields: [],
          status: 'canonical',
        },
        intent_arch_2: {
          id: 'intent_arch_2',
          source: { type: 'cto-chat', ref: 'chat-arch-2', requestedBy: 'cto' },
          semanticMeaning: {
            summary: 'Approve the stable governed loop outcome.',
            statement: 'Approve the stable governed loop outcome.',
            goal: 'Approve the stable governed loop outcome.',
            requestType: 'approval_request',
            requestedOutcomes: ['Archive the approved outcome'],
            targets: ['cto-architect', 'memory-archivist'],
            constraints: ['Stay canonical'],
            urgency: 'normal',
            labels: ['archivist', 'cto'],
          },
          confidence: 0.91,
          provenance: { sourceType: 'cto-chat', sourceRef: 'chat-arch-2' },
          missingFields: [],
          status: 'canonical',
        },
      },
      records: [],
    },
    currentIntentId: 'intent_arch_1',
    summary: 'Preserve the blocked governed loop outcome canonically.',
    status: 'canonical',
  });
  writeJson(rootPath, 'data/spatial/studio-state.json', {
    handoffs: { contextToPlanner: null, history: [] },
    teamBoard: { cards: [], selectedCardId: null },
  });
  writeJson(rootPath, 'brain/emergence/slices.json', {
    version: 'ace/slices.v1',
    updatedAt: '2026-04-06T16:00:00.000Z',
    slices: [
      {
        id: '0008',
        title: 'Archive blocked outcome',
        status: 'active',
        phase: 'review',
        runnerTaskId: '0008',
        builderTaskId: '0008',
        taskFlow: {
          phase: 'review',
          assignmentState: 'assigned',
          ownerDeskId: 'planner',
          assigneeDeskId: 'memory-archivist',
          sourceIntentId: 'intent_arch_1',
          sourceHandoffId: 'handoff_arch_1',
        },
      },
    ],
  });
  writeJson(rootPath, 'work/tasks/0008-archive-blocked/meta.json', {
    id: '0008',
    title: 'Archive blocked outcome',
  });
  fs.mkdirSync(path.join(rootPath, 'work', 'tasks', '0008-archive-blocked'), { recursive: true });
  fs.mkdirSync(path.join(rootPath, 'brain', 'emergence'), { recursive: true });
  fs.mkdirSync(path.join(rootPath, 'projects', 'emergence'), { recursive: true });
  fs.writeFileSync(path.join(rootPath, 'work', 'tasks', '0008-archive-blocked', 'plan.md'), '# Plan\n', 'utf8');
  fs.writeFileSync(path.join(rootPath, 'brain', 'emergence', 'changelog.md'), '# Changelog\n', 'utf8');
  fs.writeFileSync(path.join(rootPath, 'projects', 'emergence', 'changelog.md'), '# Changelog\n', 'utf8');
  fs.writeFileSync(path.join(rootPath, 'brain', 'emergence', 'tasks.md'), '# Tasks\n', 'utf8');
  fs.writeFileSync(path.join(rootPath, 'projects', 'emergence', 'tasks.md'), '# Tasks\n', 'utf8');

  const makeCard = (title, sourceIntentId, sourceIntakeId, sourceHandoffId) => createTeamBoardCard({
    cards: [],
    pageId: 'page_1',
    handoffId: sourceHandoffId,
    sourceNodeId: sourceIntentId,
    sourceIntentId,
    sourceIntakeId,
    sourceAnchorRefs: ['brain/emergence/slices.md'],
    title,
    createdAt: '2026-04-06T16:00:00.000Z',
  });

  const blockedPlannerCard = {
    ...makeCard('Blocked outcome ready for archive', 'intent_arch_1', 'intake_arch_1', 'handoff_arch_1'),
    id: 'card_arch_blocked',
    desk: 'Executor',
    status: 'blocked',
    state: 'Blocked',
    builderTaskId: '0008',
    runnerTaskId: '0008',
    taskFlow: {
      phase: 'review',
      assignmentState: 'assigned',
      ownerDeskId: 'planner',
      assigneeDeskId: 'memory-archivist',
      sourceIntentId: 'intent_arch_1',
      sourceHandoffId: 'handoff_arch_1',
      lastTransitionAt: '2026-04-06T16:05:00.000Z',
      lastTransitionLabel: 'Blocked and stable',
      history: [],
    },
    executionPackage: {
      status: 'blocked',
      taskId: '0008',
      taskDir: 'work/tasks/0008-archive-blocked',
      summary: 'Blocked on external patch.',
    },
    executorBlocker: {
      code: 'blocked_needs_external_patch',
      message: 'Blocked on external patch.',
    },
  };

  const archivedCtoCard = {
    ...makeCard('Approved outcome ready for archive', 'intent_arch_2', 'intake_arch_2', 'handoff_arch_2'),
    id: 'card_arch_cto',
    desk: 'CTO',
    status: 'complete',
    state: 'Completed',
    builderTaskId: '0009',
    runnerTaskId: '0009',
    taskFlow: {
      phase: 'complete',
      assignmentState: 'assigned',
      ownerDeskId: 'cto-architect',
      assigneeDeskId: 'memory-archivist',
      sourceIntentId: 'intent_arch_2',
      sourceHandoffId: 'handoff_arch_2',
      lastTransitionAt: '2026-04-06T16:06:00.000Z',
      lastTransitionLabel: 'Completed and stable',
      history: [],
    },
    executionPackage: {
      status: 'ready',
      taskId: '0009',
      taskDir: 'work/tasks/0009-archive-complete',
      summary: 'Outcome accepted.',
    },
    qaState: {
      status: 'needs_cto_approval',
      followup: { deskId: 'cto-architect', reason: 'Approval is complete.' },
    },
  };

  const workspace = {
    graph: { nodes: [], edges: [] },
    graphs: {
      system: { nodes: [], edges: [] },
      world: { nodes: [], edges: [] },
    },
    pages: [{ id: 'page_1', title: 'Archivist page' }],
    activePageId: 'page_1',
    intentState: JSON.parse(fs.readFileSync(path.join(rootPath, 'data', 'spatial', 'intent-state.json'), 'utf8')),
    studio: {
      handoffs: {
        contextToPlanner: {
          id: 'handoff_arch_1',
          sourceIntentId: 'intent_arch_1',
          sourceIntakeId: 'intake_arch_1',
          summary: 'Archive the blocked outcome.',
          status: 'ready',
        },
      },
      teamBoard: {
        cards: [blockedPlannerCard, archivedCtoCard],
        selectedCardId: 'card_arch_blocked',
      },
      orchestrator: { desks: {}, activeDeskIds: [], conflicts: [] },
      layout: {},
      deskProperties: {},
      agentWorkers: {},
      ctoPipeline: {
        id: 'cto_pipeline_archive',
        updatedAt: '2026-04-06T16:07:00.000Z',
      },
    },
  };

  const plannerTasksBefore = collectDeskTasks(workspace, 'planner', { rootPath });
  const blockedBefore = plannerTasksBefore.find((task) => task.id === 'card_arch_blocked');
  assert.equal(blockedBefore.archivistState.status, 'pending_writeback');
  assert.equal(blockedBefore.archivistState.outcomeStatus, 'blocked');

  const ctoTasksBefore = collectDeskTasks(workspace, 'cto-architect', { rootPath });
  const ctoBefore = ctoTasksBefore.find((task) => task.id === 'card_arch_cto');
  assert.equal(ctoBefore.archivistState.status, 'pending_writeback');
  assert.equal(ctoBefore.archivistState.outcomeStatus, 'completed');

  const writeback = applyArchivistWriteback(rootPath, {
    workspace,
    domainKey: 'emergence',
    now: '2026-04-06T16:10:00.000Z',
  });
  assert.equal(writeback.contextBundle.governedRecords.length, 2);
  assert.equal(writeback.contextBundle.governedRecords[0].archivedAt, '2026-04-06T16:10:00.000Z');

  const plannerTasksAfter = collectDeskTasks(workspace, 'planner', { rootPath });
  const blockedAfter = plannerTasksAfter.find((task) => task.id === 'card_arch_blocked');
  assert.equal(blockedAfter.archivistState.status, 'archived');
  assert.equal(blockedAfter.archivistState.outcomeStatus, 'blocked');
  assert.match(blockedAfter.archivistState.summary, /Preserve the blocked governed loop outcome canonically\./);
  assert.ok(blockedAfter.archivistState.sources.some((source) => source.path === 'brain/context/archivist_context_bundle.json'));

  const ctoTasksAfter = collectDeskTasks(workspace, 'cto-architect', { rootPath });
  const ctoAfter = ctoTasksAfter.find((task) => task.id === 'card_arch_cto');
  assert.equal(ctoAfter.archivistState.status, 'archived');
  assert.equal(ctoAfter.archivistState.outcomeStatus, 'completed');

  const contract = buildGovernedLoopContract(workspace, { rootPath });
  assert.equal(contract.domains.archivist.latestBundle.governedRecords.length, 2);
  assert.equal(contract.domains.planner.visibleWork.find((task) => task.id === 'card_arch_blocked').archivistState.status, 'archived');

  const server = http.createServer((req, res) => {
    if (req.url !== '/api/spatial/governed-loop/contract') {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(buildGovernedLoopContract(workspace, { rootPath })));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    const response = await getJson(`http://127.0.0.1:${address.port}/api/spatial/governed-loop/contract`);
    assert.equal(response.statusCode, 200);
    const plannerTask = response.json.domains.planner.visibleWork.find((task) => task.id === 'card_arch_blocked');
    assert.equal(plannerTask.archivistState.status, 'archived');
    assert.equal(plannerTask.archivistState.outcomeStatus, 'blocked');
    assert.equal(response.json.domains.archivist.latestBundle.governedRecords[0].sourceIntentId, 'intent_arch_1');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}
