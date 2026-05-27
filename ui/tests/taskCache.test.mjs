import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function makeTaskDir(rootPath, taskId = '0001', folderSuffix = 'cache-slice') {
  const tasksDir = path.join(rootPath, 'work', 'tasks');
  const taskDir = path.join(tasksDir, `${taskId}-${folderSuffix}`);
  fs.mkdirSync(taskDir, { recursive: true });
  return taskDir;
}

export default async function runTaskCacheTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-task-cache-surface-'));
  const {
    buildExecutorPrompt,
    buildPlannerPrompt,
    runExecutorWorker,
    runPlannerWorker,
    summarizeExecutorRun,
    summarizePlannerRun,
  } = require(path.resolve(process.cwd(), 'agentWorkers.js'));
  const { readTaskCache } = require(path.resolve(process.cwd(), 'taskCache.js'));

  const taskDir = makeTaskDir(rootPath, '0001', 'cache-slice');
  fs.writeFileSync(path.join(taskDir, 'idea.txt'), 'Keep the cached task bundle local.\n', 'utf8');
  fs.writeFileSync(path.join(taskDir, 'context.md'), [
    '# Task 0001: Cache slice',
    '',
    '## Context',
    'Use the seeded task bundle.',
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(taskDir, 'plan.md'), [
    '# Task 0001: Cache slice',
    '',
    '## MVP scope (must-haves)',
    '- Prefer cached task files',
    '',
    '## Acceptance criteria',
    '- [x] Cached plan is reused',
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(taskDir, 'patch.diff'), [
    'diff --git a/example.txt b/example.txt',
    '--- a/example.txt',
    '+++ b/example.txt',
    '@@ -1 +1 @@',
    '-old',
    '+new',
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(taskDir, 'apply_result.json'), `${JSON.stringify({
    taskId: '0001',
    stage: 'apply',
    status: 'pending',
    ok: false,
    updated_utc: '2026-03-29T00:00:00.000Z',
  }, null, 2)}\n`, 'utf8');

  const plannerCache = readTaskCache(rootPath, { taskId: '0001', stage: 'planner' });
  assert.equal(plannerCache.source, 'cache_hit');
  assert.equal(plannerCache.files.plan.valid, true);

  const plannerPrompt = buildPlannerPrompt({
    promptTemplate: 'planner-template',
    handoff: {
      id: 'handoff-1',
      taskId: '0001',
      summary: 'Keep the task cache working.',
      problemStatement: 'The planner should prefer cached task files.',
      requestedOutcomes: ['Prefer cached inputs'],
      anchorRefs: ['brain/emergence/plan.md'],
      constraints: [],
    },
    anchorBundle: { anchors: {} },
    board: { selectedCardId: null, cards: [] },
    rootPath,
    taskCache: plannerCache,
  });
  assert.match(plannerPrompt, /## Cached Task Files/);
  assert.match(plannerPrompt, /idea\.txt/);
  assert.match(plannerPrompt, /Keep the cached task bundle local/);
  assert.match(plannerPrompt, /plan\.md/);
  assert.match(plannerPrompt, /Cached plan is reused/);

  const executorCache = readTaskCache(rootPath, { taskId: '0001', stage: 'executor' });
  assert.equal(executorCache.source, 'cache_hit');
  assert.equal(executorCache.files.applyResult.valid, true);
  assert.equal(executorCache.files.applyResult.data.status, 'pending');

  const executorPrompt = buildExecutorPrompt({
    promptTemplate: 'executor-template',
    card: {
      id: 'card-1',
      title: 'Executor cache test',
      status: 'review',
      approvalState: 'approved',
      targetProjectKey: 'ace-self',
      runnerTaskId: '0001',
      sourceAnchorRefs: ['brain/emergence/plan.md'],
      executionPackage: {
        status: 'ready',
        taskId: '0001',
      },
    },
    workspace: { studio: { teamBoard: { cards: [] } } },
    rootPath,
    taskCache: executorCache,
  });
  assert.match(executorPrompt, /## Cached Task Files/);
  assert.match(executorPrompt, /patch\.diff/);
  assert.match(executorPrompt, /example\.txt/);
  assert.match(executorPrompt, /apply_result\.json/);
  assert.match(executorPrompt, /"status": "pending"/);

  const missingCache = readTaskCache(rootPath, { taskId: '9999', stage: 'planner' });
  assert.equal(missingCache.source, 'cache_miss');
  const missingPrompt = buildPlannerPrompt({
    promptTemplate: 'planner-template',
    handoff: {
      id: 'handoff-2',
      taskId: '9999',
      summary: 'Missing cache should fall back.',
      problemStatement: 'No cache exists for this task.',
      requestedOutcomes: ['Fallback cleanly'],
      anchorRefs: ['brain/emergence/plan.md'],
      constraints: [],
    },
    anchorBundle: { anchors: {} },
    board: { selectedCardId: null, cards: [] },
    rootPath,
    taskCache: missingCache,
  });
  assert.doesNotMatch(missingPrompt, /## Cached Task Files/);

  const malformedDir = makeTaskDir(rootPath, '0002', 'broken-cache');
  fs.writeFileSync(path.join(malformedDir, 'idea.txt'), 'Valid idea text.\n', 'utf8');
  fs.writeFileSync(path.join(malformedDir, 'context.md'), '# Task 0002: Broken cache\n\n## Context\nStill fine.\n', 'utf8');
  fs.writeFileSync(path.join(malformedDir, 'plan.md'), '# Task 0002: Broken cache\n\n## MVP scope (must-haves)\n- keep it simple\n', 'utf8');
  fs.writeFileSync(path.join(malformedDir, 'patch.diff'), '', 'utf8');
  fs.writeFileSync(path.join(malformedDir, 'apply_result.json'), '{not json', 'utf8');
  const malformedCache = readTaskCache(rootPath, { taskId: '0002', stage: 'executor' });
  assert.equal(malformedCache.source, 'cache_invalid');
  const malformedPrompt = buildExecutorPrompt({
    promptTemplate: 'executor-template',
    card: {
      id: 'card-2',
      title: 'Malformed cache test',
      status: 'review',
      approvalState: 'approved',
      targetProjectKey: 'ace-self',
      runnerTaskId: '0002',
      sourceAnchorRefs: ['brain/emergence/plan.md'],
      executionPackage: {
        status: 'ready',
        taskId: '0002',
      },
    },
    workspace: { studio: { teamBoard: { cards: [] } } },
    rootPath,
    taskCache: malformedCache,
  });
  assert.doesNotMatch(malformedPrompt, /## Cached Task Files/);

  let plannerTaskCacheSeen = null;
  const plannerRun = await runPlannerWorker({
    rootPath,
    handoff: {
      id: 'handoff-3',
      taskId: '0001',
      summary: 'Planner should reuse cache.',
      problemStatement: 'Prefer cached task files.',
      requestedOutcomes: ['Prefer cached task files'],
      anchorRefs: ['brain/emergence/plan.md'],
      constraints: [],
      status: 'ready',
    },
    workspace: {
      studio: {
        teamBoard: {
          selectedCardId: 'card-3',
          cards: [{
            id: 'card-3',
            runnerTaskId: '0001',
            builderTaskId: '0001',
            executionPackage: { taskId: '0001' },
          }],
        },
      },
    },
    anchorBundle: { anchors: {} },
    mode: 'manual',
    generator: async ({ taskCache }) => {
      plannerTaskCacheSeen = taskCache;
      return {
        json: {
          summary: 'planner ok',
          cards: [{
            title: 'Cache-aware card',
            summary: 'Keep cached task files in play.',
            anchorRefs: ['brain/emergence/plan.md'],
          }],
          brainProposals: [],
          needsContextRetry: false,
          retryReason: '',
        },
        text: '{"summary":"planner ok"}',
      };
    },
  });
  assert.equal(plannerRun.ok, true);
  assert.equal(plannerTaskCacheSeen.source, 'cache_hit');
  assert.equal(plannerRun.run.taskCache.source, 'cache_hit');
  assert.equal(summarizePlannerRun(plannerRun.run).taskCacheSource, 'cache_hit');

  let executorTaskCacheSeen = null;
  const executorRun = await runExecutorWorker({
    rootPath,
    card: {
      id: 'card-4',
      title: 'Executor cache worker',
      status: 'review',
      approvalState: 'approved',
      targetProjectKey: 'ace-self',
      runnerTaskId: '0001',
      sourceAnchorRefs: ['brain/emergence/plan.md'],
      executionPackage: {
        status: 'ready',
        taskId: '0001',
        expectedAction: 'apply',
      },
    },
    workspace: { studio: { teamBoard: { cards: [] } } },
    mode: 'manual',
    generator: async ({ taskCache }) => {
      executorTaskCacheSeen = taskCache;
      return {
        json: {
          summary: 'executor ok',
          decision: 'blocked',
          blockers: ['still review-only'],
          verifyRequired: false,
          verificationPlan: { commandPresets: [], qaScenarios: [] },
          applyReady: false,
          deployReady: false,
          notes: ['cache seen'],
        },
        text: '{"summary":"executor ok"}',
      };
    },
  });
  assert.equal(executorRun.ok, true);
  assert.equal(executorTaskCacheSeen.source, 'cache_hit');
  assert.equal(executorRun.run.taskCache.source, 'cache_hit');
  assert.equal(summarizeExecutorRun(executorRun.run).taskCacheSource, 'cache_hit');
}
