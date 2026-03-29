import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

export default async function runFailureMemoryTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-failure-memory-'));
  const modulePath = path.resolve(process.cwd(), 'failureMemory.js');
  const knownFixesPath = path.resolve(process.cwd(), 'knownFixes.js');
  const {
    FAILURE_CANDIDATE_THRESHOLD,
    normalizeFailureKey,
    readFailureHistory,
    recordFailureOccurrence,
    refreshCandidateKnownFixesFromFailureHistory,
    summarizeFailureHistory,
  } = require(modulePath);
  const {
    readKnownFixCandidates,
    buildKnownFixesPromptSection,
  } = require(knownFixesPath);
  const {
    normalizeAgentIdentity,
  } = require(path.resolve(process.cwd(), 'agentAttribution.js'));

  assert.equal(normalizeAgentIdentity({}).agent_id, 'dave');
  assert.ok(normalizeAgentIdentity({}).agent_version.length > 0);

  assert.equal(normalizeFailureKey('spawn EPERM: access denied on Windows', { tool: 'node' }), 'windows_spawn_eperm');
  assert.equal(normalizeFailureKey('ollama connection refused while generating context', { stage: 'context-manager' }), 'ollama_unreachable');
  assert.equal(normalizeFailureKey('git apply check failed after patch drift', { stage: 'apply' }), 'git_apply_check_failed');
  assert.equal(normalizeFailureKey('repository is dirty and cannot apply', { stage: 'apply' }), 'dirty_repo_blocked');
  assert.equal(normalizeFailureKey('patch diff malformed or invalid', { stage: 'apply' }), 'invalid_patch_diff');
  assert.equal(normalizeFailureKey('missing project key for self target', { stage: 'preflight' }), 'missing_project_key');

  const first = recordFailureOccurrence(rootPath, {
    message: 'spawn EPERM: access denied',
    related_tool: 'node',
    related_stage: 'apply',
    related_run: 'run-1',
    agent_id: 'executor',
  });
  const second = recordFailureOccurrence(rootPath, {
    message: 'spawn eperm while starting subprocess',
    related_tool: 'node',
    related_stage: 'apply',
    related_run: 'run-2',
    agent_id: 'executor',
  });

  assert.equal(first.failureKey, 'windows_spawn_eperm');
  assert.equal(second.failureKey, 'windows_spawn_eperm');
  assert.equal(second.record.count, 2);
  assert.equal(second.record.agent_id, 'executor');
  assert.equal(second.record.stage, 'apply');
  assert.deepEqual(second.record.related_tools, ['node']);
  assert.deepEqual(second.record.related_stages, ['apply']);
  assert.deepEqual(second.record.example_messages, [
    'spawn eperm while starting subprocess',
    'spawn EPERM: access denied',
  ]);

  const beforeThreshold = readKnownFixCandidates(rootPath).library.entries;
  assert.equal(beforeThreshold.length, 0);

  const third = recordFailureOccurrence(rootPath, {
    message: 'spawn EPERM again on Windows',
    related_tool: 'node',
    related_stage: 'apply',
    related_run: 'run-3',
  });
  assert.equal(third.record.count, 3);
  assert.equal(FAILURE_CANDIDATE_THRESHOLD, 3);

  const refreshed = refreshCandidateKnownFixesFromFailureHistory(rootPath);
  assert.ok(refreshed.candidateLibrary.entries.length >= 1);
  assert.equal(refreshed.candidateLibrary.entries[0].failureKey, 'windows_spawn_eperm');
  assert.equal(refreshed.candidateLibrary.entries[0].status, 'candidate');
  assert.equal(refreshed.candidateLibrary.entries[0].count, 3);

  const history = readFailureHistory(rootPath).history;
  assert.equal(history.entries[0].count, 3);
  assert.equal(history.entries[0].failure_key, 'windows_spawn_eperm');
  assert.equal(history.entries[0].agent_id, 'executor');

  const promptSection = buildKnownFixesPromptSection(rootPath);
  assert.doesNotMatch(promptSection, /Candidate Fixes/);
  const reviewPromptSection = buildKnownFixesPromptSection(rootPath, { includeCandidates: true });
  assert.match(reviewPromptSection, /Candidate Fixes/);
  assert.match(reviewPromptSection, /Quote Windows subprocess arguments cleanly/);

  const historyJson = path.join(rootPath, 'brain', 'context', 'failure_history.json');
  const historyMarkdown = path.join(rootPath, 'brain', 'context', 'failure_history.md');
  const candidateJson = path.join(rootPath, 'brain', 'context', 'known_fixes_candidates.json');
  const candidateMarkdown = path.join(rootPath, 'brain', 'context', 'known_fixes_candidates.md');
  assert.ok(fs.existsSync(historyJson));
  assert.ok(fs.existsSync(historyMarkdown));
  assert.ok(fs.existsSync(candidateJson));
  assert.ok(fs.existsSync(candidateMarkdown));
  assert.match(readFile(candidateMarkdown), /Review-only proposals/);
  assert.match(readFile(historyMarkdown), /windows_spawn_eperm/);

  const summary = summarizeFailureHistory(rootPath);
  assert.equal(summary.totalKeys, 1);
  assert.equal(summary.repeatedKeys, 1);
}
