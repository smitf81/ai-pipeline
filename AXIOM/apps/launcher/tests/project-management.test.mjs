import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';

const __dirname = dirname(fileURLToPath(import.meta.url));
const launcherRoot = resolve(__dirname, '..');
const workspaceRoot = resolve(launcherRoot, '..', '..', '..');
const v2Selector = '_A_Projects/BLACK_SKY_BOUND_V2';
const v2Root = join(workspaceRoot, '_A_Projects', 'BLACK_SKY_BOUND_V2');
const expectedBridgeVersion = 'axiom-file-manager-bridge.v0.5-project-roots';

function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(() => port ? resolvePort(port) : reject(new Error('free_port_unavailable')));
    });
  });
}

async function waitForHealth(baseUrl, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return await response.json();
      lastError = new Error(`health_http_${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw lastError || new Error('health_timeout');
}

async function mcpCall(baseUrl, tool, params = {}) {
  const response = await fetch(`${baseUrl}/mcp/call`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tool, params })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(`${tool} failed: ${JSON.stringify(payload)}`);
  }
  return payload;
}

function stopProcessTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try { process.kill(pid, 'SIGTERM'); } catch {}
  }
}

async function stopChildProcess(child) {
  if (!child?.pid || child.exitCode != null || child.signalCode != null) return;
  stopProcessTree(child.pid);
  await Promise.race([
    once(child, 'exit').catch(() => null),
    new Promise(resolve => setTimeout(resolve, 3000))
  ]);
}

const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server.js'], {
  cwd: launcherRoot,
  env: { ...process.env, PORT: String(port) },
  stdio: 'ignore'
});

let runtimePid = null;

try {
  const health = await waitForHealth(baseUrl);
  assert.equal(health.ok, true);
  assert.equal(health.bridgeVersion, expectedBridgeVersion);
  assert.ok(Array.isArray(health.projects), 'health projects should be an array');
  const v2Health = health.projects.find(project => project.id === 'black-sky-bound-v2-demo');
  assert.ok(v2Health, 'V2 demo project should be registered/discovered');
  assert.equal(v2Health.selector, v2Selector);
  assert.equal(v2Health.status, 'ready');
  assert.equal(v2Health.manifestExists, true);

  const list = await mcpCall(baseUrl, 'project_list');
  assert.equal(list.result.bridgeVersion, expectedBridgeVersion);
  const v2Listed = list.result.projects.find(project => project.id === 'black-sky-bound-v2-demo');
  assert.ok(v2Listed, 'project_list should include V2 demo');
  assert.equal(v2Listed.selector, v2Selector);
  assert.equal(v2Listed.status, 'ready');
  assert.equal(v2Listed.manifestExists, true);

  const openedRelative = await mcpCall(baseUrl, 'project_open', { projectRoot: v2Selector });
  assert.equal(openedRelative.result.project.id, 'black-sky-bound-v2-demo');
  assert.equal(openedRelative.result.project.manifestExists, true);
  assert.equal(openedRelative.result.status, 'ready');

  const openedAbsolute = await mcpCall(baseUrl, 'project_open', { projectRoot: v2Root });
  assert.equal(openedAbsolute.result.project.selector, v2Selector);
  assert.equal(openedAbsolute.result.manifestExists, true);

  const ls = await mcpCall(baseUrl, 'fs_ls', { projectRoot: v2Selector, path: '.', long: true });
  const entries = JSON.stringify(ls.result.entries);
  assert.match(entries, /index\.html/);
  assert.match(entries, /\.axiom/);

  const manifestRead = await mcpCall(baseUrl, 'safe_read_project_file', { projectRoot: v2Selector, path: '.axiom/project.json', full: true });
  assert.match(manifestRead.result.content, /black-sky-bound-v2-demo/);
  assert.match(manifestRead.result.content, /5177/);
  const projectManifest = JSON.parse(manifestRead.result.content);
  assert.equal(projectManifest.workspace.contract, 'axiom.project-workspace.v0');
  assert.equal(projectManifest.workspace.surfaceId, 'bsb-v2-map-authoring');
  assert.equal(projectManifest.workspace.authoring.projectId, 'axiom');
  assert.equal(projectManifest.workspace.runtimeBake.projectId, 'black-sky-bound-v2-demo');
  assert.equal(projectManifest.workspace.runtimeBake.explicit, true);

  const expandedAuthoringRead = await mcpCall(baseUrl, 'safe_read_project_file', {
    projectId: 'axiom',
    path: 'data/bsb-v2/maps/first_escape.authoring.json',
    full: true
  });
  assert.equal(expandedAuthoringRead.result.truncated, false, 'full authoring reads should not truncate expanded maps');
  const expandedAuthoring = JSON.parse(expandedAuthoringRead.result.content);
  assert.equal(expandedAuthoring.width, 80);
  assert.equal(expandedAuthoring.height, 60);

  const boot = await mcpCall(baseUrl, 'project_runtime_bootstrap', { projectRoot: v2Selector, entrypointId: 'demo-canvas', readinessTimeoutMs: 15000 });
  assert.equal(boot.result.status, 'ready');
  assert.equal(boot.result.entrypoint.id, 'demo-canvas');
  runtimePid = boot.result.pid || null;

  const editor = await readFile(join(launcherRoot, 'public', 'axiom-editor.html'), 'utf8');
  for (const needle of [
    'New Project (.axiom)',
    'Load Project',
    'Recent Projects',
    'fm-project-select',
    'loadProjectFromUI',
    'newProjectFromUI',
    'showRecentProjectsFromUI',
    'ProjectManagementCapability',
    'axiom.workspace-context.v0',
    'getWorkspaceContext',
    'workspace-context-indicator',
    'project_switch_blocked_unsaved_authoring'
  ]) {
    assert.ok(editor.includes(needle), `editor should include ${needle}`);
  }

  console.log('project-management.test.mjs passed');
} catch (error) {
  throw error;
} finally {
  stopProcessTree(runtimePid);
  await stopChildProcess(server);
}

process.exit(0);
