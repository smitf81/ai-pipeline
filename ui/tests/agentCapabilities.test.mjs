import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function stripMutableFields(profile = {}) {
  const clone = { ...profile };
  delete clone.updated_at;
  return clone;
}

function seedExecutorAudit(rootPath, buildAgentAuditRecord, writeAgentAuditArtifacts, {
  entryId,
  taskId = '0001',
  createdAt,
  summary,
  passFail = 'pass',
  scoreMode = 'clean',
  retryCount = 0,
  includeFixTask = false,
} = {}) {
  const isClean = scoreMode === 'clean';
  const record = buildAgentAuditRecord({
    rootPath,
    stage: scoreMode === 'builder' ? 'builder' : 'executor',
    taskId,
    sourceRecord: {
      id: entryId,
      agent_id: 'executor',
      agent_version: 'ace/agent-attribution.v0',
      outcome: passFail === 'pass' ? 'completed' : 'failed',
      status: passFail === 'pass' ? 'completed' : 'failed',
      summary,
      retry_count: retryCount,
      taskCache: {
        source: isClean ? 'HIT' : 'INVALID',
        taskId: '0001',
        taskDir: 'work/tasks/0001-capability-slice',
        selectedFiles: [
          { name: 'idea.txt', exists: true, valid: true },
          { name: 'plan.md', exists: true, valid: true },
          { name: 'patch.diff', exists: isClean, valid: isClean },
          { name: 'apply_result.json', exists: true, valid: true },
        ],
      },
      report: scoreMode === 'builder'
        ? null
        : {
            decision: 'ready-apply',
            blockers: [],
            verificationPlan: {
              commandPresets: ['node-version-check'],
              qaScenarios: ['ui-smoke'],
            },
          },
      policy: scoreMode === 'builder'
        ? {
            decision: 'escalate',
            reasons: ['disallowed-path escalation'],
            policy_rule_hits: ['disallowed-path escalation'],
            fix_task_created: includeFixTask,
          }
        : null,
      fixTask: includeFixTask
        ? { jsonPath: 'work/tasks/0001-capability-slice/fix_task.json' }
        : null,
    },
    pass_fail: passFail,
    createdAt,
  });
  return writeAgentAuditArtifacts(rootPath, record);
}

export default async function runAgentCapabilitiesTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-agent-capabilities-'));
  const auditPath = path.resolve(process.cwd(), 'agentAudit.js');
  const capabilitiesPath = path.resolve(process.cwd(), 'agentCapabilities.js');
  const failureMemoryPath = path.resolve(process.cwd(), 'failureMemory.js');
  const {
    buildAgentAuditRecord,
    writeAgentAuditArtifacts,
  } = require(auditPath);
  const {
    readAgentCapabilityProfile,
    rebuildAgentCapabilityLedger,
  } = require(capabilitiesPath);
  const {
    recordFailureOccurrence,
  } = require(failureMemoryPath);

  const first = seedExecutorAudit(rootPath, buildAgentAuditRecord, writeAgentAuditArtifacts, {
    entryId: 'executor_run_1',
    taskId: '0001',
    createdAt: '2026-03-29T00:00:00.000Z',
    summary: 'Executor completed clean readiness assessment.',
    passFail: 'pass',
    scoreMode: 'clean',
  });
  assert.ok(fs.existsSync(path.join(rootPath, first.jsonPath)));

  const second = seedExecutorAudit(rootPath, buildAgentAuditRecord, writeAgentAuditArtifacts, {
    entryId: 'executor_run_2',
    taskId: '0002',
    createdAt: '2026-03-29T00:05:00.000Z',
    summary: 'Executor completed a second clean readiness assessment.',
    passFail: 'pass',
    scoreMode: 'clean',
  });

  const rebuiltOnce = rebuildAgentCapabilityLedger(rootPath, { agentId: 'executor' });
  assert.equal(rebuiltOnce.rebuilt.length, 1);
  const profileOne = readAgentCapabilityProfile(rootPath, 'executor').profile;
  assert.equal(profileOne.agent_id, 'executor');
  assert.equal(profileOne.runs_total, 2);
  assert.equal(profileOne.pass_rate, 1);
  assert.ok(profileOne.strong_stages.includes('executor'));
  assert.match(profileOne.recommended_task_types.join(' | '), /execution-readiness assessment/i);

  const third = seedExecutorAudit(rootPath, buildAgentAuditRecord, writeAgentAuditArtifacts, {
    entryId: 'executor_run_3',
    taskId: '0003',
    createdAt: '2026-03-29T00:10:00.000Z',
    summary: 'Executor completed a third clean readiness assessment.',
    passFail: 'pass',
    scoreMode: 'clean',
  });
  assert.ok(fs.existsSync(path.join(rootPath, third.jsonPath)));

  const profileBeforeFailure = readAgentCapabilityProfile(rootPath, 'executor').profile;
  const rebuiltTwice = rebuildAgentCapabilityLedger(rootPath, { agentId: 'executor' });
  assert.equal(rebuiltTwice.rebuilt.length, 1);
  const profileTwo = readAgentCapabilityProfile(rootPath, 'executor').profile;
  assert.ok(profileTwo.confidence > profileBeforeFailure.confidence);

  recordFailureOccurrence(rootPath, {
    message: 'Apply failed after patch drift.',
    related_tool: 'git',
    related_stage: 'builder',
    stage: 'builder',
    agent_id: 'executor',
    agent_version: 'ace/agent-attribution.v0',
    related_run: 'builder_run_1',
  });
  recordFailureOccurrence(rootPath, {
    message: 'Apply failed after patch drift.',
    related_tool: 'git',
    related_stage: 'builder',
    stage: 'builder',
    agent_id: 'executor',
    agent_version: 'ace/agent-attribution.v0',
    related_run: 'builder_run_2',
  });

  seedExecutorAudit(rootPath, buildAgentAuditRecord, writeAgentAuditArtifacts, {
    entryId: 'builder_run_4',
    taskId: '0004',
    createdAt: '2026-03-29T00:15:00.000Z',
    summary: 'Builder needed escalation after repeated retry pressure.',
    passFail: 'fail',
    scoreMode: 'builder',
    retryCount: 2,
    includeFixTask: true,
  });

  const rebuiltFinal = rebuildAgentCapabilityLedger(rootPath, { agentId: 'executor' });
  assert.equal(rebuiltFinal.rebuilt.length, 1);
  const profileFinal = readAgentCapabilityProfile(rootPath, 'executor').profile;
  assert.equal(profileFinal.runs_total, 4);
  assert.ok(profileFinal.weak_stages.includes('builder'));
  assert.ok(profileFinal.common_failure_keys.some((key) => /git_apply_check_failed/.test(key)));
  assert.ok(profileFinal.avoid_task_types.length >= 1);
  assert.equal(profileFinal.recommended_task_types.includes('execution-readiness assessment'), true);
  assert.equal(profileFinal.agent_version, 'ace/agent-attribution.v0');

  const rebuiltAgain = rebuildAgentCapabilityLedger(rootPath, { agentId: 'executor' });
  const profileAgain = readAgentCapabilityProfile(rootPath, 'executor').profile;
  assert.deepEqual(stripMutableFields(profileFinal), stripMutableFields(profileAgain));
  assert.deepEqual(rebuiltFinal.rebuilt[0].profile.agent_id, rebuiltAgain.rebuilt[0].profile.agent_id);

  const jsonPath = path.join(rootPath, rebuiltAgain.rebuilt[0].jsonPath);
  const markdownPath = path.join(rootPath, rebuiltAgain.rebuilt[0].markdownPath);
  assert.ok(fs.existsSync(jsonPath));
  assert.ok(fs.existsSync(markdownPath));
  assert.match(fs.readFileSync(markdownPath, 'utf8'), /# Agent Capability Ledger/);
  assert.ok(profileTwo.confidence > profileOne.confidence);
}
