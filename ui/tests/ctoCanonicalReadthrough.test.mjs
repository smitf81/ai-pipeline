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

export default async function runCtoCanonicalReadthroughTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-cto-readthrough-'));
  const {
    buildDeskPropertiesPayload,
    createDefaultStudioLayoutSchema,
  } = require('../server.js');
  const { applyArchivistWriteback } = require('../archivistWriteback.js');
  const { createTeamBoardCard } = require('../orchestratorState.js');

  writeJson(rootPath, 'data/spatial/workspace.json', {
    graph: { nodes: [], edges: [] },
    graphs: { system: { nodes: [], edges: [] }, world: { nodes: [], edges: [] } },
    pages: [{ id: 'page_1', title: 'CTO oversight page' }],
    activePageId: 'page_1',
    studio: {},
  });
  writeJson(rootPath, 'data/spatial/pages.json', {
    activePageId: 'page_1',
    pages: [{ id: 'page_1', title: 'CTO oversight page' }],
  });
  writeJson(rootPath, 'data/spatial/intent-state.json', {
    registry: {
      currentIntentId: 'intent_cto_readthrough_1',
      latestIntentId: 'intent_cto_readthrough_1',
      byId: {
        intent_cto_readthrough_1: {
          id: 'intent_cto_readthrough_1',
          semanticMeaning: {
            summary: 'Route approval-needed governed work to CTO canonically.',
          },
          status: 'canonical',
        },
        intent_cto_readthrough_2: {
          id: 'intent_cto_readthrough_2',
          semanticMeaning: {
            summary: 'Archive completed governed work canonically.',
          },
          status: 'canonical',
        },
      },
      records: [],
    },
    currentIntentId: 'intent_cto_readthrough_1',
    summary: 'Route approval-needed governed work to CTO canonically.',
    status: 'canonical',
  });
  writeJson(rootPath, 'data/spatial/studio-state.json', {
    handoffs: { contextToPlanner: null, history: [] },
    teamBoard: { cards: [], selectedCardId: null },
  });
  writeJson(rootPath, 'data/spatial/qa/structured/latest.json', {
    status: 'needs_cto_approval',
    summary: 'CTO review is required for one governed item.',
    desks: [{
      desk: 'qa-lead',
      status: 'needs_cto_approval',
      tests: [
        {
          name: 'cto_gate',
          status: 'needs_cto_approval',
          qualityCard: {
            schema: 'qa.test-attribute-card.v1',
            id: 'qa.cto_gate',
            desk: 'qa-lead',
            testId: 'cto_gate',
            testName: 'CTO gate',
            status: 'needs_cto_approval',
            sourceCardId: 'card_cto_approval',
            sourceIntentId: 'intent_cto_readthrough_1',
            sourceHandoffId: 'handoff_cto_readthrough_1',
            updatedAt: '2026-04-06T18:04:00.000Z',
            summary: 'CTO approval is required before apply.',
          },
        },
        {
          name: 'completed_archive',
          status: 'pass',
          qualityCard: {
            schema: 'qa.test-attribute-card.v1',
            id: 'qa.completed_archive',
            desk: 'qa-lead',
            testId: 'completed_archive',
            testName: 'Completed archive',
            status: 'pass',
            sourceCardId: 'card_cto_completed',
            sourceIntentId: 'intent_cto_readthrough_2',
            sourceHandoffId: 'handoff_cto_readthrough_2',
            updatedAt: '2026-04-06T18:02:00.000Z',
            summary: 'Completed patch is ready for archival review.',
          },
        },
      ],
    }],
  });
  writeJson(rootPath, 'brain/emergence/slices.json', {
    version: 'ace/slices.v1',
    updatedAt: '2026-04-06T18:00:00.000Z',
    slices: [],
  });
  fs.mkdirSync(path.join(rootPath, 'brain', 'emergence'), { recursive: true });
  fs.mkdirSync(path.join(rootPath, 'projects', 'emergence'), { recursive: true });
  fs.writeFileSync(path.join(rootPath, 'brain', 'emergence', 'changelog.md'), '# Changelog\n', 'utf8');
  fs.writeFileSync(path.join(rootPath, 'projects', 'emergence', 'changelog.md'), '# Changelog\n', 'utf8');
  fs.writeFileSync(path.join(rootPath, 'brain', 'emergence', 'tasks.md'), '# Tasks\n', 'utf8');
  fs.writeFileSync(path.join(rootPath, 'projects', 'emergence', 'tasks.md'), '# Tasks\n', 'utf8');
  fs.mkdirSync(path.join(rootPath, 'work', 'tasks', '0011-cto-completed'), { recursive: true });
  fs.writeFileSync(path.join(rootPath, 'work', 'tasks', '0011-cto-completed', 'patch.diff'), 'diff --git a/src/app.js b/src/app.js\n+patched\n', 'utf8');
  fs.writeFileSync(path.join(rootPath, 'work', 'tasks', '0011-cto-completed', 'apply_result.json'), `${JSON.stringify({ taskId: '0011', status: 'pending', ok: false }, null, 2)}\n`, 'utf8');
  writeJson(rootPath, 'work/tasks/0011-cto-completed/meta.json', { id: '0011', title: 'Completed CTO artifact' });
  fs.writeFileSync(path.join(rootPath, 'work', 'tasks', '0011-cto-completed', 'plan.md'), '# Plan\n', 'utf8');

  const makeCard = ({ id, title, intentId, intakeId, handoffId }) => createTeamBoardCard({
    cards: [],
    pageId: 'page_1',
    handoffId,
    sourceNodeId: `${id}-prompt`,
    sourceIntentId: intentId,
    sourceIntakeId: intakeId,
    sourceAnchorRefs: ['brain/emergence/tasks.md'],
    title,
    createdAt: '2026-04-06T18:00:00.000Z',
  });

  const approvalCard = {
    ...makeCard({
      id: 'card_cto_approval',
      title: 'Approval-needed governed item',
      intentId: 'intent_cto_readthrough_1',
      intakeId: 'intake_cto_readthrough_1',
      handoffId: 'handoff_cto_readthrough_1',
    }),
    id: 'card_cto_approval',
    desk: 'Executor',
    status: 'review',
    state: 'Awaiting CTO approval',
    updatedAt: '2026-04-06T18:04:00.000Z',
    taskFlow: {
      phase: 'qa-review',
      assignmentState: 'assigned',
      ownerDeskId: 'executor',
      assigneeDeskId: 'cto-architect',
      sourceIntentId: 'intent_cto_readthrough_1',
      sourceHandoffId: 'handoff_cto_readthrough_1',
      lastTransitionAt: '2026-04-06T18:04:00.000Z',
      lastTransitionLabel: 'Waiting for CTO approval',
      history: [],
    },
  };

  const completedCard = {
    ...makeCard({
      id: 'card_cto_completed',
      title: 'Completed governed artifact',
      intentId: 'intent_cto_readthrough_2',
      intakeId: 'intake_cto_readthrough_2',
      handoffId: 'handoff_cto_readthrough_2',
    }),
    id: 'card_cto_completed',
    desk: 'CTO',
    status: 'complete',
    state: 'Completed',
    updatedAt: '2026-04-06T18:03:00.000Z',
    builderTaskId: '0011',
    runnerTaskId: '0011',
    taskFlow: {
      phase: 'complete',
      assignmentState: 'assigned',
      ownerDeskId: 'cto-architect',
      assigneeDeskId: 'memory-archivist',
      sourceIntentId: 'intent_cto_readthrough_2',
      sourceHandoffId: 'handoff_cto_readthrough_2',
      lastTransitionAt: '2026-04-06T18:03:00.000Z',
      lastTransitionLabel: 'Completed and awaiting archive',
      history: [],
    },
    executionPackage: {
      status: 'ready',
      taskId: '0011',
      taskDir: 'work/tasks/0011-cto-completed',
      patchPath: 'work/tasks/0011-cto-completed/patch.diff',
      changedFiles: ['src/app.js'],
      summary: 'Patch recorded.',
    },
  };

  const workspace = {
    graph: { nodes: [], edges: [] },
    graphs: { system: { nodes: [], edges: [] }, world: { nodes: [], edges: [] } },
    pages: [{ id: 'page_1', title: 'CTO oversight page' }],
    activePageId: 'page_1',
    intentState: JSON.parse(fs.readFileSync(path.join(rootPath, 'data', 'spatial', 'intent-state.json'), 'utf8')),
    studio: {
      handoffs: {
        contextToPlanner: {
          id: 'handoff_cto_readthrough_1',
          sourceIntentId: 'intent_cto_readthrough_1',
          sourceIntakeId: 'intake_cto_readthrough_1',
          summary: 'Approval-needed governed item.',
          status: 'ready',
        },
      },
      teamBoard: {
        cards: [approvalCard, completedCard],
        selectedCardId: 'card_cto_approval',
      },
      orchestrator: { desks: {}, activeDeskIds: [], conflicts: [] },
      layout: createDefaultStudioLayoutSchema(),
      deskProperties: {},
      agentWorkers: {},
      ctoPipeline: {
        id: 'shadow_pipeline_should_not_drive_oversight',
        roleIndex: 5,
        step: 'stale-shadow',
        updatedAt: '2026-04-06T17:00:00.000Z',
      },
    },
  };

  applyArchivistWriteback(rootPath, {
    workspace,
    domainKey: 'emergence',
    now: '2026-04-06T18:05:00.000Z',
  });

  const payload = buildDeskPropertiesPayload(workspace, 'cto-architect', null, { rootPath });
  assert.equal(payload.truth.ctoOversight.approvalNeededCount, 1);
  assert.equal(payload.truth.ctoOversight.approvalNeededItems[0].id, 'card_cto_approval');
  assert.equal(payload.truth.ctoOversight.approvalNeededItems[0].qaStatus, 'needs_cto_approval');
  assert.equal(payload.truth.ctoOversight.approvalNeededItems[0].scorecardId, 'qa.cto_gate');
  assert.equal(payload.truth.ctoOversight.approvalNeededItems[0].requestedAt, '2026-04-06T18:04:00.000Z');
  assert.equal(payload.truth.ctoOversight.completedArtifactCount, 1);
  assert.equal(payload.truth.ctoOversight.completedArtifacts[0].id, 'card_cto_completed');
  assert.equal(payload.truth.ctoOversight.completedArtifacts[0].diffStatus, 'created');
  assert.equal(payload.truth.ctoOversight.completedArtifacts[0].archivedStatus, 'archived');
  assert.equal(payload.truth.ctoOversight.completedArtifacts[0].archivedAt, '2026-04-06T18:05:00.000Z');
  assert.equal(payload.truth.ctoOversight.scorecardCount, 2);
  assert.equal(payload.truth.ctoOversight.latestActivityAt, '2026-04-06T18:05:00.000Z');
  assert.match(payload.truth.throughput, /1 approvals \/ 1 completed artefacts \/ 2 scorecards/);
  assert.equal(payload.tasks.find((task) => task.id === 'card_cto_completed').archivistState.status, 'archived');
  assert.equal(payload.tasks.find((task) => task.id === 'card_cto_approval').qaState.status, 'needs_cto_approval');

  const server = http.createServer((req, res) => {
    if (req.url !== '/api/spatial/desks/cto-architect/properties') {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(buildDeskPropertiesPayload(workspace, 'cto-architect', null, { rootPath })));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    const response = await getJson(`http://127.0.0.1:${address.port}/api/spatial/desks/cto-architect/properties`);
    assert.equal(response.statusCode, 200);
    assert.equal(response.json.truth.ctoOversight.approvalNeededItems[0].sourceIntentId, 'intent_cto_readthrough_1');
    assert.equal(response.json.truth.ctoOversight.completedArtifacts[0].sourceIntentId, 'intent_cto_readthrough_2');
    assert.equal(response.json.truth.ctoOversight.completedArtifacts[0].archivedStatus, 'archived');
    assert.equal(response.json.truth.ctoOversight.latestActivityAt, '2026-04-06T18:05:00.000Z');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}
