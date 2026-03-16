import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function writeFile(rootPath, relativePath, content) {
  const target = path.join(rootPath, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

export default async function runAgentRegistryTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-agent-registry-'));
  const registryPath = path.resolve(process.cwd(), 'agentRegistry.js');
  const {
    loadAgentDefinition,
    readAgentDefinition,
    resolveAgentDefinition,
  } = require(registryPath);

  writeFile(rootPath, 'agents/planner/agent.json', JSON.stringify({
    id: 'planner',
    name: 'Planner',
    backend: 'ollama',
    model: 'mixtral',
    timeoutMs: 30000,
  }, null, 2));
  writeFile(rootPath, 'agents/planner/prompt.md', 'Planner prompt');
  writeFile(rootPath, 'agents/context-manager/agent.json', JSON.stringify({
    id: 'context-manager',
    name: 'Context Manager',
    backend: 'ollama',
    model: 'mixtral',
    timeoutMs: 30000,
  }, null, 2));
  writeFile(rootPath, 'agents/context-manager/prompt.md', 'Context prompt');
  writeFile(rootPath, 'agents/executor/agent.json', JSON.stringify({
    id: 'executor',
    name: 'Executor',
    backend: 'ollama',
    model: 'mixtral',
    timeoutMs: 30000,
  }, null, 2));
  writeFile(rootPath, 'agents/executor/prompt.md', 'Executor prompt');
  writeFile(rootPath, 'agents/broken/agent.json', JSON.stringify({
    id: 'wrong-id',
    name: '',
    backend: '',
    model: '',
    timeoutMs: 0,
  }, null, 2));
  writeFile(rootPath, 'agents/broken/prompt.md', '');

  const planner = loadAgentDefinition(rootPath, 'planner');
  assert.equal(planner.valid, true);
  assert.equal(planner.manifest.id, 'planner');
  assert.equal(planner.prompt, 'Planner prompt');

  const contextManager = readAgentDefinition(rootPath, 'context-manager');
  assert.equal(contextManager.valid, true);
  assert.equal(contextManager.prompt, 'Context prompt');

  const executor = readAgentDefinition(rootPath, 'executor');
  assert.equal(executor.valid, true);
  assert.equal(executor.prompt, 'Executor prompt');

  const broken = readAgentDefinition(rootPath, 'broken');
  assert.equal(broken.valid, false);
  assert.ok(broken.errors.some((entry) => entry.includes('id must match')));
  assert.ok(broken.errors.some((entry) => entry.includes('prompt.md is empty')));

  const missingResolved = resolveAgentDefinition(rootPath, 'missing', {
    fallbackManifest: {
      id: 'missing',
      name: 'Missing',
      backend: 'ollama',
      model: 'mixtral',
      timeoutMs: 30000,
    },
    fallbackPrompt: 'Fallback prompt',
  });
  assert.equal(missingResolved.valid, false);
  assert.equal(missingResolved.manifest.model, 'mixtral');
  assert.equal(missingResolved.prompt, 'Fallback prompt');
}
