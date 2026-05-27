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
  readStatus,
  runCycle,
  writeControl,
} = require(path.resolve(process.cwd(), 'subconsciousDaemon.js'));
const {
  requestOllamaText,
} = require(path.resolve(process.cwd(), 'localModelClient.js'));

function writeFile(rootPath, relativePath, content) {
  const targetPath = path.join(rootPath, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf8');
}

export default async function runSubconsciousDaemonTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'subconscious-daemon-'));
  writeFile(rootPath, 'brain/emergence/project_brain.md', '# Canonical Brain\nTruth remains here.\n');
  writeFile(rootPath, 'brain/emergence/decisions.md', '# Decisions\nKeep evidence visible.\n');
  writeFile(rootPath, 'brain/context/next_slice.md', '# Next Slice\nObserve bounded activity.\n');
  writeFile(rootPath, 'src/example.js', 'export function example() { return true; }\n');

  const modelCalls = [];
  const modelRequest = async (request) => {
    modelCalls.push(request);
    return {
      model: DEFAULT_CONFIG.model,
      text: [
        'OBSERVATION',
        'A bounded source file is present for inspection.',
        '',
        'COHERENCE',
        'The activity remains advisory and points back to canonical anchors.',
        '',
        'ATTENTION',
        'Inspect the active slice before acting.',
        '',
        'MEMORY UPDATE',
        'A source observation was generated from bounded local evidence.',
      ].join('\n'),
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
  assert.equal(modelCalls[0].options.num_thread, 2);
  assert.equal(modelCalls[0].options.num_predict, DEFAULT_CONFIG.numPredict);
  assert.match(modelCalls[0].prompt, /brain\/emergence\/project_brain\.md/);
  assert.match(modelCalls[0].prompt, /src\/example\.js/);
  const paths = advisoryPaths(rootPath);
  assert.match(fs.readFileSync(paths.latestThought, 'utf8'), /Subconscious Observation/);
  assert.match(fs.readFileSync(paths.memory, 'utf8'), /A source observation was generated/);

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
  assert.equal(modelCalls.length, 1);

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
  assert.equal(modelCalls.length, 1);
  assert.equal(readStatus(rootPath).state, 'paused_manual');

  const outbound = [];
  const clientResult = await requestOllamaText({
    model: 'qwen-test',
    prompt: 'bounded prompt',
    keepAlive: '0',
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
  assert.equal(outbound[0].body.options.num_thread, 2);
  assert.equal(outbound[0].body.options.num_predict, 100);
}
