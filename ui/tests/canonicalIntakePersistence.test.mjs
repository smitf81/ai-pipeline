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

export default async function runCanonicalIntakePersistenceTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-canonical-intake-'));
  const {
    buildGovernedLoopContract,
    persistCanonicalIntakeRecord,
    readSpatialWorkspace,
  } = require('../server.js');

  writeJson(rootPath, 'data/spatial/workspace.json', {
    graph: { nodes: [], edges: [] },
    graphs: {
      system: { nodes: [], edges: [] },
      world: { nodes: [], edges: [] },
    },
    pages: [],
    activePageId: 'page_1',
    studio: {},
  });
  writeJson(rootPath, 'data/spatial/pages.json', {
    activePageId: 'page_1',
    pages: [{ id: 'page_1', title: 'Primary canvas' }],
  });
  writeJson(rootPath, 'data/spatial/intent-state.json', {
    registry: {
      currentIntentId: null,
      latestIntentId: null,
      byId: {},
      records: [],
    },
    currentIntentId: null,
    summary: '',
    status: 'idle',
  });
  writeJson(rootPath, 'data/spatial/studio-state.json', {
    handoffs: {
      contextToPlanner: {
        id: 'handoff_1',
        intentId: 'intent_canvas_1',
        summary: 'Planner intake ready.',
      },
    },
    teamBoard: {
      cards: [],
      selectedCardId: null,
    },
  });

  const ctoWrite = persistCanonicalIntakeRecord({
    id: 'intake_cto_1',
    channel: 'cto_prompt',
    text: 'Patch the planner seam.',
    requestedBy: 'cto',
    sourceType: 'cto-chat',
    sourceRef: 'cto-chat-window',
    originRoute: '/api/spatial/cto/chat',
    createdAt: '2026-04-06T10:00:00.000Z',
    updatedAt: '2026-04-06T10:00:00.000Z',
    processingStatus: 'live',
    replyKind: 'advisory',
    route: 'cto-chat',
    resultSummary: 'CTO governance intake recorded.',
  }, { rootPath });
  const canvasWrite = persistCanonicalIntakeRecord({
    id: 'intake_canvas_1',
    channel: 'canvas_text',
    text: 'Lay out the recovery shell state.',
    requestedBy: 'canvas-intent',
    sourceType: 'canvas-text',
    sourceRef: 'prompt-1',
    originRoute: '/api/spatial/executive/route',
    createdAt: '2026-04-06T10:01:00.000Z',
    updatedAt: '2026-04-06T10:02:00.000Z',
    processingStatus: 'routed',
    route: 'intent-scan',
    canonicalIntentId: 'intent_canvas_1',
    handoffId: 'handoff_1',
    resultSummary: 'Canvas intake routed into the governed loop.',
  }, { rootPath, workspace: ctoWrite.workspace });

  const rereadWorkspace = readSpatialWorkspace(rootPath);
  const intakeState = rereadWorkspace?.studio?.intake;
  assert.equal(intakeState.version, 'ace/canonical-intake.v1');
  assert.equal(intakeState.records.length, 2);
  assert.equal(intakeState.latestByChannel.cto_prompt, 'intake_cto_1');
  assert.equal(intakeState.latestByChannel.canvas_text, 'intake_canvas_1');
  assert.equal(intakeState.records[0].id, 'intake_canvas_1');
  assert.equal(intakeState.records[0].canonicalIntentId, 'intent_canvas_1');
  assert.equal(intakeState.records[0].handoffId, 'handoff_1');
  assert.equal(intakeState.records[0].governedLoop.route, '/api/spatial/governed-loop/contract');
  assert.equal(intakeState.records[1].replyKind, 'advisory');

  const contract = buildGovernedLoopContract(null, { rootPath });
  assert.equal(contract.domains.input.intake.latestByChannel.cto_prompt, 'intake_cto_1');
  assert.equal(contract.domains.input.intake.latestByChannel.canvas_text, 'intake_canvas_1');
  assert.equal(contract.domains.input.intake.records[0].id, 'intake_canvas_1');
  assert.equal(contract.domains.input.intake.records[1].id, 'intake_cto_1');
  assert.ok(contract.domains.input.sources.some((source) => source.path === 'data/spatial/workspace.json' && source.recordPath === 'studio.intake'));
  assert.ok(contract.domains.input.sources.some((source) => source.route === '/api/spatial/governed-loop/contract' && source.recordPath === 'domains.input.intake'));

  assert.equal(canvasWrite.intakeRecord.acknowledgement.status, 'recorded');
  assert.equal(canvasWrite.intakeRecord.acknowledgement.summary, 'Canonical canvas intake recorded from prompt-1.');
  assert.equal(ctoWrite.intakeRecord.acknowledgement.summary, 'Canonical CTO intake recorded from cto-chat-window.');
}
