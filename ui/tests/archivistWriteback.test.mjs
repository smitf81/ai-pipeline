import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, 'utf8');
}

export default async function runArchivistWritebackTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-archivist-'));
  const modulePath = path.resolve(process.cwd(), 'archivistWriteback.js');
  const sliceRepositoryPath = path.resolve(process.cwd(), 'sliceRepository.js');
  const { applyArchivistWriteback } = require(modulePath);
  const { writeSliceArtifacts } = require(sliceRepositoryPath);

  writeJson(path.join(rootPath, 'data', 'spatial', 'workspace.json'), {
    activePageId: 'page_live',
    graph: {
      nodes: [{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }],
      edges: [{ id: 'e1' }],
    },
    annotations: [],
    sketches: [],
    studio: {
      teamBoard: {
        cards: [],
        summary: {
          plan: 0,
          active: 0,
          complete: 0,
          review: 0,
          assigned: 0,
          handedOff: 0,
          binned: 0,
          idleWorkers: 2,
        },
        updatedAt: '2026-03-26T11:03:19.374Z',
      },
    },
  });
  writeJson(path.join(rootPath, 'brain', 'emergence', 'slices.json'), {
    version: 'ace/slices.v1',
    updatedAt: '2026-03-26T11:02:05.622Z',
    slices: [
      {
        id: '0007',
        title: 'Archivist bundle seed',
        summary: 'Seed the local boring context bundle.',
        status: 'active',
        phase: 'active',
        targetProjectKey: 'ace-self',
        builderTaskId: '0007',
        runnerTaskId: '0007',
        sourceAnchorRefs: ['brain/emergence/project_brain.md', 'brain/emergence/roadmap.md'],
        taskFlow: {
          phase: 'active',
          assignmentState: 'assigned',
          ownerDeskId: 'planner',
          assigneeDeskId: 'memory-archivist',
          sourceIntentId: 'node_seed',
          sourceHandoffId: 'handoff_seed',
          lastTransitionAt: '2026-03-26T11:00:00.000Z',
          lastTransitionLabel: 'Active on planner slab',
          history: [],
        },
      },
    ],
  });
  writeJson(path.join(rootPath, 'work', 'tasks', '0007-context-bundle', 'meta.json'), {
    id: '0007',
    title: 'Archivist bundle seed',
    created_utc: '2026-03-26T11:00:00.000Z',
    source: 'test-harness',
  });
  writeText(path.join(rootPath, 'work', 'tasks', '0007-context-bundle', 'plan.md'), [
    '# Task 0007: Archivist bundle seed',
    '',
    'Created: 2026-03-26T11:00:00.000Z',
    '',
    '## Goal',
    '- Generate the local boring context bundle.',
    '',
    '## MVP scope (must-haves)',
    '- Write repo tree, target files, task metadata, and acceptance criteria locally.',
    '',
    '## Acceptance criteria',
    '- [ ] Bundle includes a repo tree section.',
    '- [ ] Bundle lists target files.',
    '- [ ] Bundle captures task metadata.',
    '- [ ] Bundle extracts acceptance criteria.',
    '',
    '## Risks / notes',
    '- Keep it read-mostly and validate before writeback.',
  ].join('\n'));
  writeJson(path.join(rootPath, 'data', 'spatial', 'qa', 'qa_latest.json'), {
    id: 'qa_latest',
    scenario: 'studio-smoke',
    status: 'failed',
    verdict: 'failed',
    createdAt: '2026-03-26T09:36:09.727Z',
    finishedAt: '2026-03-26T09:36:10.147Z',
    findings: [],
    artifacts: { screenshots: [] },
    error: 'browserType.launch: spawn EPERM\nCall log:\n  - launching Edge',
  });
  writeText(path.join(rootPath, 'brain', 'emergence', 'changelog.md'), '# Changelog\n');
  writeText(path.join(rootPath, 'projects', 'emergence', 'changelog.md'), '# Changelog\n');
  writeText(path.join(rootPath, 'brain', 'emergence', 'tasks.md'), '# Tasks\n\nDeprecated compatibility view.\n');
  writeText(path.join(rootPath, 'projects', 'emergence', 'tasks.md'), '# Tasks\n\nDeprecated compatibility view.\n');

  const result = applyArchivistWriteback(rootPath, {
    domainKey: 'emergence',
    now: '2026-03-26T11:15:00.000Z',
  });

  assert.match(result.summary, /1 active slices/i);
  assert.match(result.summary, /spawn EPERM/i);

  const canonicalChangelog = fs.readFileSync(path.join(rootPath, 'brain', 'emergence', 'changelog.md'), 'utf8');
  const legacyChangelog = fs.readFileSync(path.join(rootPath, 'projects', 'emergence', 'changelog.md'), 'utf8');
  const canonicalTasks = fs.readFileSync(path.join(rootPath, 'brain', 'emergence', 'tasks.md'), 'utf8');
  const legacyTasks = fs.readFileSync(path.join(rootPath, 'projects', 'emergence', 'tasks.md'), 'utf8');
  const contextBundleMd = fs.readFileSync(path.join(rootPath, 'brain', 'context', 'archivist_context_bundle.md'), 'utf8');
  const contextBundleJson = JSON.parse(fs.readFileSync(path.join(rootPath, 'brain', 'context', 'archivist_context_bundle.json'), 'utf8'));

  assert.match(canonicalChangelog, /## 2026-03-26/);
  assert.match(canonicalChangelog, /qa_latest/);
  assert.match(canonicalChangelog, /spawn EPERM/);
  assert.equal(canonicalChangelog, legacyChangelog);

  assert.match(canonicalTasks, /## Latest Session Snapshot/);
  assert.match(canonicalTasks, /## Suggested Slice Seeds/);
  assert.match(canonicalTasks, /Record the next failed or approved Dave run into the learning ledger/);
  assert.equal(canonicalTasks, legacyTasks);

  assert.match(contextBundleMd, /# Archivist Context Bundle/);
  assert.match(contextBundleMd, /## Repo Tree/);
  assert.match(contextBundleMd, /## Target Files/);
  assert.match(contextBundleMd, /## Task Metadata/);
  assert.match(contextBundleMd, /## Acceptance Criteria/);
  assert.match(contextBundleMd, /## Context Windows/);
  assert.equal(contextBundleJson.taskMetadata.activeSlice.id, '0007');
  assert.equal(contextBundleJson.taskMetadata.taskMeta.title, 'Archivist bundle seed');
  assert.ok(Array.isArray(contextBundleJson.acceptanceCriteria));
  assert.equal(contextBundleJson.acceptanceCriteria.length, 4);
  assert.ok(contextBundleJson.contextWindows.tier1.includes('brain/emergence/plan.md'));
  assert.ok(contextBundleJson.targetFiles.includes('brain/context/next_slice.md'));

  writeSliceArtifacts(rootPath, {
    version: 'ace/slices.v1',
    updatedAt: '2026-03-26T11:30:00.000Z',
    slices: [
      {
        id: '0007',
        title: 'Archivist bundle seed',
        summary: 'Seed the local boring context bundle.',
        status: 'active',
        phase: 'active',
        targetProjectKey: 'ace-self',
        builderTaskId: '0007',
        runnerTaskId: '0007',
        sourceAnchorRefs: ['brain/emergence/project_brain.md', 'brain/emergence/roadmap.md'],
        taskFlow: {
          phase: 'active',
          assignmentState: 'assigned',
          ownerDeskId: 'planner',
          assigneeDeskId: 'memory-archivist',
          sourceIntentId: 'node_seed',
          sourceHandoffId: 'handoff_seed',
          lastTransitionAt: '2026-03-26T11:00:00.000Z',
          lastTransitionLabel: 'Active on planner slab',
          history: [],
        },
      },
    ],
  });
  const preservedTasks = fs.readFileSync(path.join(rootPath, 'brain', 'emergence', 'tasks.md'), 'utf8');
  assert.match(preservedTasks, /## Latest Session Snapshot/);
  assert.match(preservedTasks, /spawn EPERM/);
}
