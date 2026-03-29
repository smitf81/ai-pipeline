import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default async function runTaskArtifactsTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-task-cache-'));
  const serverPath = path.resolve(process.cwd(), 'server.js');
  const {
    buildTaskApplyResultRecord,
    collectTaskArtifacts,
    createRunnerTaskFolder,
    writeTaskApplyResult,
  } = require(serverPath);

  const tasksDir = path.join(rootPath, 'work', 'tasks');
  const task = createRunnerTaskFolder({
    title: 'Cache apply result',
    prompt: 'Cache task artefacts aggressively.',
    handoff: {
      id: 'handoff-1',
      summary: 'Keep task artefacts cached.',
      problemStatement: 'Avoid rebuilding the whole plan after apply fails.',
      requestedOutcomes: ['Keep idea/context/plan stable', 'Persist apply results'],
    },
    sessionId: 'session-1',
    anchorRefs: ['brain/emergence/plan.md'],
    tasksDir,
    rootPath,
  });

  const taskDir = task.taskDir;
  assert.ok(fs.existsSync(path.join(taskDir, 'idea.txt')));
  assert.ok(fs.existsSync(path.join(taskDir, 'context.md')));
  assert.ok(fs.existsSync(path.join(taskDir, 'plan.md')));
  assert.ok(fs.existsSync(path.join(taskDir, 'patch.diff')));
  assert.ok(fs.existsSync(path.join(taskDir, 'apply_result.json')));
  assert.ok(fs.existsSync(path.join(taskDir, 'agent_attribution.json')));

  const seededResult = JSON.parse(fs.readFileSync(path.join(taskDir, 'apply_result.json'), 'utf8'));
  assert.equal(seededResult.status, 'pending');
  assert.equal(seededResult.inputs.plan, 'plan.md');
  assert.match(seededResult.reuseHint, /smallest broken stage/i);
  assert.equal(seededResult.agent_id, 'executor');
  assert.equal(seededResult.attribution.agent_id, 'executor');
  assert.match(fs.readFileSync(path.join(taskDir, 'plan.md'), 'utf8'), /Plan Attribution/);

  const attribution = JSON.parse(fs.readFileSync(path.join(taskDir, 'agent_attribution.json'), 'utf8'));
  assert.equal(attribution.artifacts['plan.md'].agent_id, 'planner');
  assert.equal(attribution.artifacts['patch.diff'].agent_id, 'builder');
  assert.equal(attribution.artifacts['apply_result.json'].agent_id, 'executor');
  assert.equal(attribution.artifacts['agent_attribution.json'].agent_id, 'dave');

  writeTaskApplyResult(taskDir, buildTaskApplyResultRecord({
    taskId: task.taskId,
    taskDir,
    patchPath: path.join(taskDir, 'patch.diff'),
    ok: false,
    status: 'failed',
    error: 'Apply failed after patch drift.',
    result: {
      runId: 'run-1',
      artifacts: ['work/tasks/example/apply_result.json'],
    },
    branch: 'codex/task-cache',
    commit: null,
    rootPath,
  }));

  const updatedResult = JSON.parse(fs.readFileSync(path.join(taskDir, 'apply_result.json'), 'utf8'));
  assert.equal(updatedResult.ok, false);
  assert.equal(updatedResult.status, 'failed');
  assert.equal(updatedResult.error, 'Apply failed after patch drift.');
  assert.equal(updatedResult.result.runId, 'run-1');
  assert.equal(updatedResult.agent_id, 'executor');
  assert.equal(updatedResult.attribution.agent_id, 'executor');
  assert.match(updatedResult.reuseHint, /Cache preserved/i);

  const artifacts = collectTaskArtifacts(taskDir, []);
  assert.ok(artifacts.some((artifact) => artifact.endsWith('/idea.txt')));
  assert.ok(artifacts.some((artifact) => artifact.endsWith('/context.md')));
  assert.ok(artifacts.some((artifact) => artifact.endsWith('/plan.md')));
  assert.ok(artifacts.some((artifact) => artifact.endsWith('/patch.diff')));
  assert.ok(artifacts.some((artifact) => artifact.endsWith('/apply_result.json')));
  assert.ok(artifacts.some((artifact) => artifact.endsWith('/agent_attribution.json')));
}
