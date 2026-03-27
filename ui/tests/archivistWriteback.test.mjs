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
    slices: [],
  });
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

  assert.match(result.summary, /0 active slices/i);
  assert.match(result.summary, /spawn EPERM/i);

  const canonicalChangelog = fs.readFileSync(path.join(rootPath, 'brain', 'emergence', 'changelog.md'), 'utf8');
  const legacyChangelog = fs.readFileSync(path.join(rootPath, 'projects', 'emergence', 'changelog.md'), 'utf8');
  const canonicalTasks = fs.readFileSync(path.join(rootPath, 'brain', 'emergence', 'tasks.md'), 'utf8');
  const legacyTasks = fs.readFileSync(path.join(rootPath, 'projects', 'emergence', 'tasks.md'), 'utf8');

  assert.match(canonicalChangelog, /## 2026-03-26/);
  assert.match(canonicalChangelog, /qa_latest/);
  assert.match(canonicalChangelog, /spawn EPERM/);
  assert.equal(canonicalChangelog, legacyChangelog);

  assert.match(canonicalTasks, /## Latest Session Snapshot/);
  assert.match(canonicalTasks, /## Suggested Slice Seeds/);
  assert.match(canonicalTasks, /Capture the latest QA failure as a bounded slice/);
  assert.equal(canonicalTasks, legacyTasks);

  writeSliceArtifacts(rootPath, {
    version: 'ace/slices.v1',
    updatedAt: '2026-03-26T11:30:00.000Z',
    slices: [],
  });
  const preservedTasks = fs.readFileSync(path.join(rootPath, 'brain', 'emergence', 'tasks.md'), 'utf8');
  assert.match(preservedTasks, /## Latest Session Snapshot/);
  assert.match(preservedTasks, /spawn EPERM/);
}
