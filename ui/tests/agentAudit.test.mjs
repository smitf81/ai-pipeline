import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function stripTimes(record = {}) {
  const clone = { ...record };
  delete clone.created_at;
  delete clone.updated_at;
  return clone;
}

export default async function runAgentAuditTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-agent-audit-'));
  const auditPath = path.resolve(process.cwd(), 'agentAudit.js');
  const failureMemoryPath = path.resolve(process.cwd(), 'failureMemory.js');
  const {
    AGENT_AUDIT_VERSION,
    buildAgentAuditRecord,
    writeAgentAuditArtifacts,
  } = require(auditPath);
  const {
    recordFailureOccurrence,
  } = require(failureMemoryPath);

  const taskDir = path.join(rootPath, 'work', 'tasks', '0001-audit-slice');
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(path.join(taskDir, 'agent_attribution.json'), `${JSON.stringify({
    version: 'ace/agent-attribution.v0',
    taskId: '0001',
    taskDir: 'work/tasks/0001-audit-slice',
    created_utc: '2026-03-29T00:00:00.000Z',
    updated_utc: '2026-03-29T00:00:00.000Z',
    agent_id: 'planner',
    agent_version: 'ace/agent-attribution.v0',
    attribution: {
      agent_id: 'planner',
      agent_version: 'ace/agent-attribution.v0',
    },
    artifacts: {
      'apply_result.json': {
        agent_id: 'executor',
        agent_version: 'ace/agent-attribution.v0',
      },
    },
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(taskDir, 'apply_result.json'), `${JSON.stringify({ taskId: '0001', stage: 'apply', status: 'pending', ok: false }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(taskDir, 'patch.diff'), 'diff --git a/a b/a\n', 'utf8');
  fs.writeFileSync(path.join(taskDir, 'meta.json'), `${JSON.stringify({ id: '0001', title: 'Audit slice' }, null, 2)}\n`, 'utf8');

  const cleanRecord = buildAgentAuditRecord({
    rootPath,
    stage: 'planner',
    taskId: '0001',
    taskDir,
    sourceRecord: {
      id: 'planner_run_1',
      outcome: 'completed',
      status: 'completed',
      summary: 'Delivered a bounded plan.',
      taskCache: {
        source: 'HIT',
        taskId: '0001',
        taskDir: 'work/tasks/0001-audit-slice',
        selectedFiles: [
          { name: 'idea.txt', exists: true, valid: true },
          { name: 'plan.md', exists: true, valid: true },
        ],
      },
      proposalArtifactRefs: ['data/spatial/agent-runs/planner/planner_run_1.proposal.01.brain_emergence_plan.md'],
    },
    artifactRefs: ['brain/emergence/plan.md'],
    pass_fail: 'pass',
    createdAt: '2026-03-29T00:00:00.000Z',
  });

  assert.equal(cleanRecord.version, AGENT_AUDIT_VERSION);
  assert.equal(cleanRecord.agent_id, 'planner');
  assert.equal(cleanRecord.agent_version, 'ace/agent-attribution.v0');
  assert.equal(cleanRecord.task_id, '0001');
  assert.equal(cleanRecord.stage, 'planner');
  assert.equal(cleanRecord.pass_fail, 'pass');
  assert.ok(cleanRecord.scope_discipline_score >= 80);
  assert.ok(cleanRecord.architecture_respect_score >= 80);
  assert.ok(cleanRecord.output_clarity_score >= 80);
  assert.ok(cleanRecord.recovery_burden_score >= 80);
  assert.ok(cleanRecord.validation_rigour_score >= 80);
  assert.match(cleanRecord.review_summary, /clean pass|Strong planner run/i);
  assert.equal(cleanRecord.recommended_followup, 'No immediate follow-up required.');
  assert.ok(cleanRecord.artifact_refs.includes('work/tasks/0001-audit-slice/agent_attribution.json'));
  assert.ok(cleanRecord.artifact_refs.includes('data/spatial/agent-runs/planner/planner_run_1.json'));

  const fallbackRecord = buildAgentAuditRecord({
    rootPath,
    stage: 'executor',
    sourceRecord: {
      id: 'executor_run_2',
      outcome: 'failed',
      status: 'failed',
      summary: 'Executor failed before validation.',
    },
    createdAt: '2026-03-29T00:00:00.000Z',
  });
  assert.equal(fallbackRecord.agent_id, 'dave');
  assert.equal(fallbackRecord.agent_version, 'ace/agent-attribution.v0');
  assert.equal(fallbackRecord.pass_fail, 'fail');

  recordFailureOccurrence(rootPath, {
    message: 'Apply failed after patch drift.',
    related_tool: 'git',
    related_stage: 'builder',
    stage: 'builder',
    agent_id: 'executor',
    agent_version: 'ace/agent-attribution.v0',
    related_run: 'builder_run_9',
  });

  const avoidableFailureRecord = buildAgentAuditRecord({
    rootPath,
    stage: 'builder',
    taskId: '0009',
    taskDir,
    sourceRecord: {
      id: 'builder_run_9',
      agent_id: 'executor',
      agent_version: 'ace/agent-attribution.v0',
      outcome: 'failed',
      status: 'failed',
      summary: 'Blocked apply after retry.',
      retry_count: 2,
      policy: {
        decision: 'escalate',
        reasons: ['disallowed path escalation'],
        policy_rule_hits: ['disallowed-path escalation'],
        fix_task_created: true,
      },
      fixTask: { jsonPath: 'work/tasks/0009-slice/fix_task.json' },
    },
    pass_fail: 'fail',
    createdAt: '2026-03-29T00:00:00.000Z',
  });

  assert.equal(avoidableFailureRecord.agent_id, 'executor');
  assert.equal(avoidableFailureRecord.stage, 'builder');
  assert.equal(avoidableFailureRecord.pass_fail, 'fail');
  assert.ok(avoidableFailureRecord.scope_discipline_score < cleanRecord.scope_discipline_score);
  assert.ok(avoidableFailureRecord.architecture_respect_score < cleanRecord.architecture_respect_score);
  assert.ok(avoidableFailureRecord.recovery_burden_score < cleanRecord.recovery_burden_score);
  assert.ok(avoidableFailureRecord.validation_rigour_score < cleanRecord.validation_rigour_score);
  assert.match(avoidableFailureRecord.review_summary, /known failure|retry|escalation/i);
  assert.match(avoidableFailureRecord.recommended_followup, /known avoidable failure|tighten scope|rerun/i);

  const repeatRecord = buildAgentAuditRecord({
    rootPath,
    stage: 'planner',
    taskId: '0001',
    taskDir,
    sourceRecord: {
      id: 'planner_run_1',
      outcome: 'completed',
      status: 'completed',
      summary: 'Delivered a bounded plan.',
      taskCache: {
        source: 'HIT',
        taskId: '0001',
        taskDir: 'work/tasks/0001-audit-slice',
        selectedFiles: [
          { name: 'idea.txt', exists: true, valid: true },
          { name: 'plan.md', exists: true, valid: true },
        ],
      },
      proposalArtifactRefs: ['data/spatial/agent-runs/planner/planner_run_1.proposal.01.brain_emergence_plan.md'],
    },
    artifactRefs: ['brain/emergence/plan.md'],
    pass_fail: 'pass',
    createdAt: '2026-03-29T00:00:00.000Z',
  });
  assert.deepEqual(stripTimes(cleanRecord), stripTimes(repeatRecord));

  const written = writeAgentAuditArtifacts(rootPath, cleanRecord);
  assert.ok(fs.existsSync(path.join(rootPath, written.jsonPath)));
  assert.ok(fs.existsSync(path.join(rootPath, written.markdownPath)));
  assert.equal(readJson(path.join(rootPath, written.jsonPath)).agent_id, 'planner');
  assert.match(fs.readFileSync(path.join(rootPath, written.markdownPath), 'utf8'), /# Agent Audit/);
}
