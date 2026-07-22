import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  advisoryPaths,
  createDaemonServer,
  DEFAULT_CONFIG,
  initializeStore,
  readStatus,
  runCycle,
  writeControl,
} = require(path.resolve(process.cwd(), 'subconsciousDaemon.js'));
const {
  MEMORY_STORE_CONTRACT,
  openMemoryStore,
} = require(path.resolve(process.cwd(), 'subconsciousMemoryStore.js'));
const {
  requestOllamaText,
} = require(path.resolve(process.cwd(), 'localModelClient.js'));

function writeFile(rootPath, relativePath, content) {
  const targetPath = path.join(rootPath, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf8');
}

function readJsonLines(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function readStore(rootPath) {
  const paths = advisoryPaths(rootPath);
  const store = openMemoryStore({
    databasePath: paths.database,
    rootPath,
  });
  try {
    return {
      current: store.getCurrentSnapshot(),
      summary: store.getSummary(),
    };
  } finally {
    store.close();
  }
}

export default async function runSubconsciousDaemonTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'subconscious-daemon-'));
  writeFile(rootPath, 'brain/emergence/project_brain.md', '# Canonical Brain\nTruth remains here.\n');
  writeFile(rootPath, 'brain/emergence/decisions.md', '# Decisions\nKeep evidence visible.\n');
  writeFile(rootPath, 'brain/context/next_slice.md', '# Next Slice\nObserve bounded activity.\n');
  writeFile(rootPath, 'src/example.js', 'export function example() { return true; }\n');

  const modelCalls = [];
  let modelText = [
    'MEMORY UPDATE',
    'A source observation was generated from bounded local evidence.',
    '',
    'OBSERVATION',
    'A bounded source file is present for inspection.',
    '',
    'COHERENCE',
    'The activity remains advisory and points back to canonical anchors.',
    '',
    'ATTENTION',
    'Inspect the active slice before acting.',
  ].join('\n');
  const modelRequest = async (request) => {
    modelCalls.push(request);
    return {
      model: DEFAULT_CONFIG.model,
      text: modelText,
    };
  };
  const tagsProbe = async () => ({
    ok: true,
    availableModels: [DEFAULT_CONFIG.model],
  });
  const freeResources = async () => ({
    checkedAt: new Date().toISOString(),
    cpuPercent: 7,
    heavyProcesses: [],
    paused: false,
    reasons: [],
  });
  const live = await runCycle({
    rootPath,
    modelRequest,
    tagsProbe,
    resourceProbe: freeResources,
  });
  assert.equal(live.state, 'live');
  assert.equal(live.canonical, false);
  assert.equal(live.classification, 'derived_advisory');
  assert.equal(live.model, DEFAULT_CONFIG.model);
  assert.equal(modelCalls.length, 1);
  assert.equal(modelCalls[0].keepAlive, '0');
  assert.equal(modelCalls[0].think, false);
  assert.equal(modelCalls[0].options.num_thread, 2);
  assert.equal(modelCalls[0].options.num_predict, DEFAULT_CONFIG.numPredict);
  assert.match(modelCalls[0].prompt, /brain\/emergence\/project_brain\.md/);
  assert.match(modelCalls[0].prompt, /low-frequency continuity check/);
  const paths = advisoryPaths(rootPath);
  assert.match(fs.readFileSync(paths.latestThought, 'utf8'), /Subconscious Observation/);
  assert.match(fs.readFileSync(paths.memory, 'utf8'), /A source observation was generated/);
  assert.equal(live.memoryUpdateApplied, true);
  assert.equal(live.memoryUpdateStatus, 'updated');
  assert.match(live.memoryEvents, /memory-events\.jsonl$/);
  assert.match(live.memoryStore, /subconscious-memory\.sqlite$/);
  assert.equal(live.memoryStoreContract, MEMORY_STORE_CONTRACT);
  assert.match(live.memorySnapshot, /memory-snapshots\/.*-accepted\.md$/);
  assert.equal(readJsonLines(paths.memoryEvents)[0].event, 'memory_summary_updated');
  assert.equal(fs.readdirSync(paths.memorySnapshots).length, 1);
  const firstStore = readStore(rootPath);
  assert.equal(firstStore.summary.observations, 1);
  assert.equal(firstStore.summary.memoryEvents, 1);
  assert.equal(firstStore.summary.memorySnapshots, 1);
  assert.equal(firstStore.summary.compressionRuns, 1);
  assert.equal(firstStore.summary.currentMemoryAvailable, true);
  assert.match(firstStore.current.content, /A source observation was generated/);

  let wakeRequests = 0;
  const statusServer = createDaemonServer({
    rootPath,
    config: DEFAULT_CONFIG,
    requestCycle: () => {
      wakeRequests += 1;
    },
  });
  await new Promise((resolve) => statusServer.listen(0, '127.0.0.1', resolve));
  const address = statusServer.address();
  const daemonBaseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const statusResponse = await fetch(`${daemonBaseUrl}/api/subconscious/status`);
    const statusPayload = await statusResponse.json();
    assert.equal(statusPayload.status.state, 'live');
    assert.equal(statusPayload.status.canonical, false);
    const memoryPayload = await (await fetch(`${daemonBaseUrl}/api/subconscious/memory`)).json();
    assert.equal(memoryPayload.available, true);
    assert.equal(memoryPayload.store.contract, MEMORY_STORE_CONTRACT);
    assert.equal(memoryPayload.store.currentMemoryAvailable, true);
    assert.match(memoryPayload.memory, /A source observation was generated/);
    const wakeResponse = await fetch(`${daemonBaseUrl}/api/subconscious/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'wake' }),
    });
    assert.equal(wakeResponse.status, 202);
    assert.equal(wakeRequests, 1);
  } finally {
    await new Promise((resolve) => statusServer.close(resolve));
  }

  writeFile(rootPath, 'src/example.js', 'export function example() { return false; }\n');
  const changed = await runCycle({
    rootPath,
    modelRequest,
    tagsProbe,
    resourceProbe: freeResources,
  });
  assert.equal(changed.state, 'live');
  assert.equal(modelCalls.length, 2);
  assert.match(modelCalls[1].prompt, /modified: src\/example\.js/);

  const protectedMemory = fs.readFileSync(paths.memory, 'utf8');
  modelText = [
    'OBSERVATION',
    'The observation completed, but its memory tail was truncated.',
    '',
    'COHERENCE',
    'Existing advisory memory must remain intact.',
    '',
    'ATTENTION',
    'Record degradation explicitly.',
    '',
    'MEMORY UPDATE',
    '# Subconscious Advisory Memory',
  ].join('\n');
  writeFile(rootPath, 'src/example.js', 'export function example() { return null; }\n');
  const preserved = await runCycle({
    rootPath,
    modelRequest,
    tagsProbe,
    resourceProbe: freeResources,
  });
  assert.equal(preserved.state, 'live_memory_preserved');
  assert.equal(preserved.memoryUpdateApplied, false);
  assert.equal(preserved.memoryUpdateStatus, 'preserved_previous');
  assert.equal(preserved.memoryUpdateReason, 'empty_or_heading_only_memory_update');
  assert.equal(modelCalls.length, 3);
  assert.equal(fs.readFileSync(paths.memory, 'utf8'), protectedMemory);
  const memoryEvents = readJsonLines(paths.memoryEvents);
  assert.equal(memoryEvents.length, 3);
  assert.equal(memoryEvents[2].event, 'memory_summary_rejected');
  assert.equal(memoryEvents[2].previousSummarySubstantive, true);
  assert.match(preserved.memorySnapshot, /memory-snapshots\/.*-preserved\.md$/);
  const preservedStore = readStore(rootPath);
  assert.equal(preservedStore.summary.observations, 3);
  assert.equal(preservedStore.summary.memoryEvents, 3);
  assert.equal(preservedStore.summary.memorySnapshots, 4);
  assert.equal(preservedStore.summary.fileMentions, 2);
  assert.equal(preservedStore.summary.agentActivity, 3);
  assert.equal(preservedStore.summary.compressionRuns, 3);
  assert.equal(preservedStore.current.content, protectedMemory);

  writeFile(rootPath, 'src/example.js', 'export function example() { return undefined; }\n');
  const pressured = await runCycle({
    rootPath,
    modelRequest,
    tagsProbe,
    resourceProbe: async () => ({
      checkedAt: new Date().toISOString(),
      cpuPercent: 89,
      heavyProcesses: ['UnrealEditor'],
      paused: true,
      reasons: ['System CPU is high.', 'Heavy interactive process detected: UnrealEditor.'],
    }),
  });
  assert.equal(pressured.state, 'paused_by_load');
  assert.equal(modelCalls.length, 3);

  writeControl(paths, {
    paused: true,
    reason: 'Operator is gaming.',
    updatedBy: 'test',
  });
  const manualPause = await runCycle({
    rootPath,
    modelRequest,
    tagsProbe,
    resourceProbe: freeResources,
  });
  assert.equal(manualPause.state, 'paused_manual');
  assert.match(manualPause.pauseReasons[0], /Operator is gaming/);
  assert.equal(modelCalls.length, 3);
  assert.equal(readStatus(rootPath).state, 'paused_manual');

  const missingRootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'subconscious-daemon-empty-memory-'));
  writeFile(missingRootPath, 'brain/emergence/project_brain.md', '# Canonical Brain\n');
  writeFile(missingRootPath, 'brain/emergence/decisions.md', '# Decisions\n');
  writeFile(missingRootPath, 'brain/context/next_slice.md', '# Next Slice\n');
  const unavailable = await runCycle({
    rootPath: missingRootPath,
    modelRequest: async () => ({ model: DEFAULT_CONFIG.model, text: modelText }),
    tagsProbe,
    resourceProbe: freeResources,
  });
  const missingPaths = advisoryPaths(missingRootPath);
  assert.equal(unavailable.state, 'live_memory_unavailable');
  assert.equal(unavailable.latestMemory, null);
  assert.equal(unavailable.memoryUpdateApplied, false);
  assert.equal(fs.existsSync(missingPaths.memory), false);
  assert.equal(readJsonLines(missingPaths.memoryEvents)[0].event, 'memory_summary_rejected');
  const unavailableStore = readStore(missingRootPath);
  assert.equal(unavailableStore.summary.observations, 1);
  assert.equal(unavailableStore.summary.memoryEvents, 1);
  assert.equal(unavailableStore.summary.currentMemoryAvailable, false);

  const bootstrapRootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'subconscious-daemon-bootstrap-memory-'));
  writeFile(bootstrapRootPath, 'brain/context/subconscious/subconscious-memory.md', [
    '# Subconscious Advisory Memory',
    '',
    'Updated: 2026-05-27T00:00:00.000Z',
    '',
    'This is model-generated compressed context. It is not canonical truth.',
    '',
    'Imported existing memory remains available after SQLite store initialization.',
    '',
  ].join('\n'));
  initializeStore(bootstrapRootPath);
  const bootstrapStore = readStore(bootstrapRootPath);
  assert.equal(bootstrapStore.summary.memoryEvents, 1);
  assert.equal(bootstrapStore.summary.currentMemoryAvailable, true);
  assert.match(bootstrapStore.current.content, /Imported existing memory/);

  const outbound = [];
  const clientResult = await requestOllamaText({
    model: 'qwen-test',
    prompt: 'bounded prompt',
    keepAlive: '0',
    think: false,
    options: { num_thread: 2, num_predict: 100 },
    fetchImpl: async (url, options) => {
      outbound.push({ url, body: JSON.parse(options.body) });
      return {
        ok: true,
        json: async () => ({ model: 'qwen-test', response: 'text output', done: true }),
      };
    },
  });
  assert.equal(clientResult.text, 'text output');
  assert.equal(outbound[0].body.keep_alive, '0');
  assert.equal(outbound[0].body.think, false);
  assert.equal(outbound[0].body.options.num_thread, 2);
  assert.equal(outbound[0].body.options.num_predict, 100);
}
