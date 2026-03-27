import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default async function runSliceRepositoryTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-slices-'));
  const repoPath = path.resolve(process.cwd(), 'sliceRepository.js');
  const {
    buildSliceStoreFromCards,
    projectBoardFromSlices,
    readSliceStore,
    renderSlicesMarkdown,
    writeSliceArtifacts,
  } = require(repoPath);

  const cards = [
    {
      id: '0007',
      title: 'Canonical Slice Authority v0',
      status: 'plan',
      pageId: 'page_1',
      sourceNodeId: 'node_1',
      sourceIntentId: 'node_1',
      sourceHandoffId: 'handoff_1',
      sourceAnchorRefs: ['brain/emergence/slices.md'],
      taskFlow: {
        phase: 'planned',
        assignmentState: 'unassigned',
        ownerDeskId: 'planner',
        assigneeDeskId: 'executor',
        sourceIntentId: 'node_1',
        sourceHandoffId: 'handoff_1',
        lastTransitionAt: '2026-03-26T10:00:00.000Z',
        lastTransitionLabel: 'Moved to planner board',
        history: [],
      },
      targetProjectKey: 'ace-self',
      builderTaskId: null,
      runnerTaskId: null,
      runIds: [],
      artifactRefs: [],
      executionPackage: {
        status: 'idle',
        taskId: null,
        changedFiles: [],
        summary: 'Add repo-backed slice authority.',
      },
      verifyRequired: false,
      verifyStatus: 'idle',
      verifyRunIds: [],
      verifyArtifacts: [],
      lastVerificationSummary: '',
      riskLevel: 'low',
      riskReasons: [],
      approvalState: 'none',
      applyStatus: 'idle',
      deployStatus: 'idle',
      createdAt: '2026-03-26T10:00:00.000Z',
      updatedAt: '2026-03-26T10:00:00.000Z',
    },
  ];

  const store = buildSliceStoreFromCards(cards);
  assert.equal(store.slices.length, 1);
  assert.equal(store.slices[0].id, '0007');
  assert.equal(store.slices[0].taskFlow.phase, 'planned');
  assert.equal(store.slices[0].summary, 'Add repo-backed slice authority.');

  const markdown = renderSlicesMarkdown(store);
  assert.match(markdown, /# Active Slices/);
  assert.match(markdown, /0007: Canonical Slice Authority v0/);

  const written = writeSliceArtifacts(rootPath, store);
  assert.equal(written.slices[0].id, '0007');
  const reloaded = readSliceStore(rootPath);
  assert.equal(reloaded.exists, true);
  assert.equal(reloaded.store.slices[0].id, '0007');
  assert.equal(reloaded.store.slices[0].title, 'Canonical Slice Authority v0');

  const canonicalTasks = fs.readFileSync(path.join(rootPath, 'brain', 'emergence', 'tasks.md'), 'utf8');
  const legacyTasks = fs.readFileSync(path.join(rootPath, 'projects', 'emergence', 'tasks.md'), 'utf8');
  assert.match(canonicalTasks, /Deprecated compatibility view/);
  assert.match(legacyTasks, /slices\.json/);

  const projectedBoard = projectBoardFromSlices(reloaded.store, {
    selectedCardId: null,
    cards: [
      {
        id: '0007',
        desk: 'Planner',
        state: 'Ready',
      },
    ],
  }, 'page_1');
  assert.equal(projectedBoard.cards.length, 1);
  assert.equal(projectedBoard.cards[0].id, '0007');
  assert.equal(projectedBoard.cards[0].pageId, 'page_1');
  assert.equal(projectedBoard.selectedCardId, '0007');
}
