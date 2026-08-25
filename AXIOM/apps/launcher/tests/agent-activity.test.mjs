import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import {
  AGENT_ACTIVITY_CONTRACT,
  AGENT_ACTIVITY_STORAGE_KEY,
  appendAgentActivityStage,
  createAgentActivityAttempt,
  createAgentActivityRuntime,
  summarizeActivityReceipt
} from '../public/agent-activity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const launcherRoot = resolve(__dirname, '..');

const attempt = createAgentActivityAttempt({
  id: 'attempt_test',
  sourceSurface: 'journal',
  displayText: 'Review this marked area',
  workspace: { projectId: 'black-sky-bound-v2-demo', revision: 2528 }
});
assert.equal(attempt.contract, AGENT_ACTIVITY_CONTRACT);
assert.equal(attempt.sourceSurface, 'journal');

const observed = appendAgentActivityStage(attempt, {
  phase: 'observe',
  label: 'Workspace observed',
  status: 'completed',
  attemptStatus: 'running',
  summary: 'Map Forge revision 2528',
  detail: { content: 'x'.repeat(400) }
});
assert.equal(observed.status, 'running', 'a completed stage must not prematurely complete the attempt');
assert.equal(observed.stages.length, 1);
assert.match(observed.stages[0].detail.content, /omitted 400 chars/);

assert.equal(
  summarizeActivityReceipt({ tool: 'axiom_tree_apply', ok: true, result: { applied: true, clientApplyReceipt: { applied: true, afterRevision: 2529 } } }),
  'axiom_tree_apply applied · revision 2529'
);

const values = new Map();
const storage = {
  getItem(key) { return values.get(key) ?? null; },
  setItem(key, value) { values.set(key, value); }
};
const runtime = createAgentActivityRuntime({ storage });
runtime.init();
const runtimeAttemptId = runtime.begin({ sourceSurface: 'chat', displayText: 'Read README.md' });
runtime.stage(runtimeAttemptId, 'route', { label: 'File request routed', status: 'running', summary: 'Using FileManager.' });
runtime.receipt(runtimeAttemptId, { ok: true, tool: 'safe_read_project_file', receiptId: 'receipt_1' }, { attemptStatus: 'running' });
runtime.complete(runtimeAttemptId, { status: 'completed', summary: 'README.md read.' });
assert.equal(runtime.status().latest.status, 'completed');
assert.equal(runtime.status().latest.stages.at(-1).label, 'Request complete');
assert.ok(values.get(AGENT_ACTIVITY_STORAGE_KEY)?.includes(runtimeAttemptId), 'attempt history should persist locally');

const blockedAttemptId = runtime.begin({ sourceSurface: 'chat', displayText: 'Read missing.file' });
runtime.complete(blockedAttemptId, { status: 'blocked', summary: 'File not found.' });
assert.equal(runtime.status().latest.status, 'blocked');
assert.equal(runtime.status().expanded, true, 'blocked attempts should promote their details visibly');

const staleAttemptId = runtime.begin({ sourceSurface: 'chat', displayText: 'Interrupted map request' });
assert.equal(runtime.status().latest.status, 'running');
const reloadedRuntime = createAgentActivityRuntime({ storage });
reloadedRuntime.init();
assert.equal(reloadedRuntime.status().latest.id, staleAttemptId);
assert.equal(reloadedRuntime.status().latest.status, 'blocked', 'a persisted running label must not survive a browser reload');
assert.equal(reloadedRuntime.status().latest.stages.at(-1).phase, 'recovery');
assert.match(reloadedRuntime.status().latest.summary, /Nothing is still running/);

const editor = await readFile(join(launcherRoot, 'public', 'axiom-editor.html'), 'utf8');
const server = await readFile(join(launcherRoot, 'server.js'), 'utf8');
const diary = await readFile(join(launcherRoot, 'public', 'project-diary.js'), 'utf8');

for (const marker of [
  'agent-activity-surface',
  'AgentActivityRuntime',
  'sourceSurface: fromJournal ? \'journal\' : \'chat\'',
  'axiom.mapforge-agent-proposal.v1',
  'buildMapForgeProposal',
  'Apply to Map Forge',
  'axiom.mapforge-apply-verification.v1',
  'body: JSON.stringify({ tool, params, meta: requestMeta })',
  "type: 'correlated_client_apply_receipt'"
]) assert.ok(editor.includes(marker), `editor should include correlated activity marker: ${marker}`);

assert.match(server, /function normalizeMcpCallMeta/);
assert.match(server, /proposalId: id\(input\.proposalId, 'proposal'\)/);
assert.match(server, /broadcast\("mcp_result",\s*{\s*meta,/);
assert.match(server, /json\(\{ \.\.\.result, meta \}\)/);
assert.match(diary, /function prepareChatPrompt/);

console.log('agent-activity.test.mjs passed');
