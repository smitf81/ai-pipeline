import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function createClassList() {
  const classes = new Set();
  return {
    add: (...items) => items.forEach((item) => classes.add(item)),
    remove: (...items) => items.forEach((item) => classes.delete(item)),
    toggle: (item, force) => {
      if (force === undefined) {
        if (classes.has(item)) classes.delete(item);
        else classes.add(item);
        return classes.has(item);
      }
      if (force) classes.add(item);
      else classes.delete(item);
      return force;
    },
    contains: (item) => classes.has(item),
    toString: () => Array.from(classes).join(' '),
  };
}

function createElement(tagName = 'div') {
  return {
    tagName: tagName.toUpperCase(),
    id: '',
    style: {},
    dataset: {},
    classList: createClassList(),
    children: [],
    textContent: '',
    innerHTML: '',
    value: '',
    disabled: false,
    scrollTop: 0,
    appendChild(child) {
      this.children.push(child);
      return child;
    },
  };
}

function createSandbox(url, fetchMap) {
  const elements = new Map();
  const listeners = {};
  const requests = [];
  const body = createElement('body');
  const documentElement = createElement('html');
  const document = {
    body,
    documentElement,
    activeElement: null,
    addEventListener(type, callback) {
      listeners[type] = callback;
    },
    createElement,
    getElementById(id) {
      if (!elements.has(id)) {
        const element = createElement('div');
        element.id = id;
        elements.set(id, element);
      }
      return elements.get(id);
    },
  };
  const fetch = async (requestUrl, options = {}) => {
    const key = String(requestUrl);
    requests.push({ url: key, options });
    const payload = fetchMap[key];
    if (!payload) {
      throw new Error(`unexpected fetch: ${key}`);
    }
    const resolved = typeof payload === 'function' ? await payload({ url: key, options }) : payload;
    const status = Number.isFinite(Number(resolved?.status)) ? Number(resolved.status) : 200;
    const responseBody = resolved && Object.prototype.hasOwnProperty.call(resolved, 'body') ? resolved.body : resolved;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => responseBody,
    };
  };
  const sandbox = {
    window: {
      location: { href: url },
      prompt: () => '',
      navigator: { clipboard: { writeText: async () => {} } },
      addEventListener: () => {},
      removeEventListener: () => {},
      devicePixelRatio: 1,
    },
    document,
    fetch,
    EventSource: class {
      close() {}
    },
    navigator: { clipboard: { writeText: async () => {} } },
    React: null,
    ReactDOM: null,
    setInterval: () => 1,
    clearInterval: () => {},
    console,
    URL,
    Blob,
    setTimeout,
    clearTimeout,
  };
  sandbox.window.document = document;
  sandbox.window.fetch = fetch;
  sandbox.window.EventSource = sandbox.EventSource;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox.window;
  sandbox.listeners = listeners;
  sandbox.elements = elements;
  sandbox.requests = requests;
  return sandbox;
}

async function loadApp(url, fetchMap) {
  const rootPath = path.resolve(process.cwd(), 'public', 'app.js');
  const source = fs.readFileSync(rootPath, 'utf8');
  const sandbox = createSandbox(url, fetchMap);
  vm.runInNewContext(source, sandbox, { filename: 'app.js' });
  await sandbox.listeners.DOMContentLoaded();
  return sandbox;
}

export default async function runAppViewerModeTest() {
  const fetchMap = {
    '/api/dashboard': {
      state: {
        current_focus: 'QA viewer focus',
        next_actions: ['Observe state'],
        blockers: ['None'],
      },
      files: {
        'brain/emergence/decisions.md': { content: 'Decision text' },
        'brain/emergence/tasks.md': { content: 'Task text' },
        'brain/emergence/roadmap.md': { content: 'Roadmap text' },
        'brain/emergence/plan.md': { content: 'Plan text' },
        'brain/emergence/project_brain.md': { content: 'Brain text' },
        'brain/emergence/changelog.md': { content: 'Changelog text' },
      },
      refreshedAt: '2026-03-23T07:00:00.000Z',
      refreshIntervalMs: 4000,
      errors: [],
    },
    '/api/runs': {
      runs: [{
        runId: 'run-1',
        action: 'scan',
        status: 'success',
        exitCode: 0,
        startedAt: '2026-03-23T07:01:00.000Z',
        finishedAt: '2026-03-23T07:01:05.000Z',
        logs: [
          { type: 'stdout', text: 'stdout line\n' },
          { type: 'stderr', text: 'stderr line one\nstderr line two\n' },
        ],
        meta: { command: 'scan task-1' },
        artifacts: ['artifact.txt'],
      }],
    },
    '/api/health': { ok: true },
    '/api/projects': {
      projects: [{ key: 'demo', name: 'Demo Project', path: 'C:/demo' }],
    },
    '/api/tasks': {
      tasks: ['task-1'],
    },
    '/api/task-artifacts?taskId=task-1': {
      ok: true,
      taskId: 'task-1',
      folder: 'task-0001-legacy',
      taskDir: 'tasks/task-0001-legacy',
      presentCount: 2,
      totalCount: 3,
      artifacts: [
        { name: 'context.md', exists: true, path: 'tasks/task-0001-legacy/context.md' },
        { name: 'plan.md', exists: false, path: 'tasks/task-0001-legacy/plan.md' },
        { name: 'patch.diff', exists: true, path: 'tasks/task-0001-legacy/patch.diff' },
      ],
    },
    '/api/task-artifacts?taskId=task-2': {
      ok: true,
      taskId: 'task-2',
      folder: null,
      taskDir: null,
      presentCount: 0,
      totalCount: 3,
      artifacts: [
        { name: 'context.md', exists: false, path: null },
        { name: 'plan.md', exists: false, path: null },
        { name: 'patch.diff', exists: false, path: null },
      ],
    },
  };

  const qaSandbox = await loadApp('http://localhost/?mode=qa', fetchMap);
  assert.equal(qaSandbox.window.__ACE_APP_TEST__.detectQaMode(), true);
  assert.equal(qaSandbox.document.body.classList.contains('qa-mode'), true);
  assert.equal(qaSandbox.document.getElementById('mode_badge').textContent, 'QA VIEWER');
  assert.equal(qaSandbox.document.getElementById('readonly_badge').textContent, 'READ ONLY');
  assert.equal(qaSandbox.document.getElementById('uiConnectionState').textContent, 'connected');
  assert.equal(qaSandbox.document.getElementById('uiLastRefreshError').textContent, 'none');
  assert.match(qaSandbox.document.getElementById('uiLastCommandSummary').textContent, /scan task-1/);
  assert.equal(qaSandbox.document.getElementById('pipelineCommandState').textContent, 'success');
  assert.match(qaSandbox.document.getElementById('pipelineCommandError').textContent, /stderr line one/);

  qaSandbox.window.__ACE_APP_TEST__.renderCommandSummary({
    name: 'custom command',
    state: 'failure',
    exitCode: 7,
    timestamp: 'now',
    error: 'short error',
  });
  assert.equal(qaSandbox.document.getElementById('pipelineCommandName').textContent, 'custom command');
  assert.equal(qaSandbox.document.getElementById('pipelineCommandState').textContent, 'failure');
  assert.equal(qaSandbox.document.getElementById('pipelineCommandExit').textContent, '7');
  assert.equal(qaSandbox.document.getElementById('pipelineCommandError').textContent, 'short error');

  qaSandbox.window.__ACE_APP_TEST__.updateRefreshStatus({
    connected: false,
    error: 'network error',
    refreshedAt: '2026-03-23T07:03:00.000Z',
    runs: [],
  });
  assert.equal(qaSandbox.document.getElementById('uiConnectionState').textContent, 'retrying');
  assert.match(qaSandbox.document.getElementById('uiLastRefreshError').textContent, /network error/);
  assert.match(qaSandbox.document.getElementById('uiLastCommandSummary').textContent, /scan task-1/);

  const operatorSandbox = await loadApp('http://localhost/', fetchMap);
  assert.equal(operatorSandbox.window.__ACE_APP_TEST__.detectQaMode(), false);
  assert.equal(operatorSandbox.document.body.classList.contains('qa-mode'), false);
  assert.equal(operatorSandbox.document.getElementById('mode_badge').textContent, 'OPERATOR');
  assert.equal(operatorSandbox.document.getElementById('readonly_badge').textContent, 'READ WRITE');
  assert.equal(operatorSandbox.document.getElementById('runProjectBtn').disabled, true);
  assert.match(operatorSandbox.document.getElementById('projectRunStatus').textContent, /topdown-slice static web prototype only/i);
  assert.equal(operatorSandbox.document.getElementById('artifactTaskLabel').textContent, 'Selected task: task-1');
  assert.equal(operatorSandbox.document.getElementById('artifactTaskFolder').textContent, 'Task folder: task-0001-legacy');
  assert.equal(operatorSandbox.document.getElementById('artifactStatusMeta').textContent, '2/3 artifacts present');
  assert.equal(operatorSandbox.document.getElementById('artifact_context_status').textContent, 'present');
  assert.equal(operatorSandbox.document.getElementById('artifact_plan_status').textContent, 'missing');
  assert.equal(operatorSandbox.document.getElementById('artifact_patch_status').textContent, 'present');
  assert.equal(operatorSandbox.document.getElementById('artifact_context_status').classList.contains('present'), true);
  assert.equal(operatorSandbox.document.getElementById('artifact_plan_status').classList.contains('missing'), true);
  assert.equal(operatorSandbox.document.getElementById('artifact_patch_status').classList.contains('present'), true);

  operatorSandbox.document.getElementById('taskSelect').onchange({ target: { value: 'task-2' } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(operatorSandbox.document.getElementById('artifactTaskLabel').textContent, 'Selected task: task-2');
  assert.equal(operatorSandbox.document.getElementById('artifactTaskFolder').textContent, 'Task folder: not found');
  assert.equal(operatorSandbox.document.getElementById('artifactStatusMeta').textContent, '0/3 artifacts present');
  assert.equal(operatorSandbox.document.getElementById('artifact_context_status').textContent, 'missing');
  assert.equal(operatorSandbox.document.getElementById('artifact_plan_status').textContent, 'missing');
  assert.equal(operatorSandbox.document.getElementById('artifact_patch_status').textContent, 'missing');

  const launchSandbox = await loadApp('http://localhost/', {
    ...fetchMap,
    '/api/projects': {
      projects: [{
        key: 'topdown-slice',
        name: 'Topdown Slice',
        path: 'C:/repo/projects/topdown-slice',
        projectType: 'static-web',
        launchable: true,
        supportedOrigin: 'http://127.0.0.1:4173/',
      }],
    },
    '/api/projects/run': ({ options }) => {
      const body = JSON.parse(String(options.body || '{}'));
      assert.equal(body.project, 'topdown-slice');
      return {
        body: {
          ok: true,
          project: {
            key: 'topdown-slice',
            name: 'Topdown Slice',
            path: 'C:/repo/projects/topdown-slice',
            projectType: 'static-web',
            launchable: true,
            supportedOrigin: 'http://127.0.0.1:4173/',
          },
          projectType: 'static-web',
          supportedOrigin: 'http://127.0.0.1:4173/',
          url: 'http://127.0.0.1:4173/',
          reused: false,
        },
      };
    },
  });

  assert.equal(launchSandbox.document.getElementById('projectSelect').value, 'topdown-slice');
  assert.equal(launchSandbox.document.getElementById('runProjectBtn').disabled, false);
  assert.equal(launchSandbox.document.getElementById('projectRunLink').textContent, 'Supported URL: http://127.0.0.1:4173/');
  assert.equal(launchSandbox.document.getElementById('projectRunLink').href, 'http://127.0.0.1:4173/');
  await launchSandbox.window.__ACE_APP_TEST__.runSelectedProject();
  assert.equal(launchSandbox.document.getElementById('projectRunStatus').textContent, 'Topdown Slice launched successfully.');
  assert.equal(launchSandbox.document.getElementById('projectRunLink').textContent, 'Launched URL: http://127.0.0.1:4173/');
  assert.equal(launchSandbox.document.getElementById('projectRunLink').href, 'http://127.0.0.1:4173/');
  assert.equal(launchSandbox.requests.filter((request) => request.url === '/api/projects/run').length, 1);
}
