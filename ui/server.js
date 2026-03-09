const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const ROOT = path.join(__dirname, '..');
const COMMANDS_FILE = path.join(ROOT, 'ace_commands.json');
const TASKS_DIR = path.join(ROOT, 'work', 'tasks');
const PROJECTS_FILE = path.join(ROOT, 'projects.json');
const REFRESH_MS_DEFAULT = 10000;
const MAX_RUN_HISTORY = 20;
const SPATIAL_WORKSPACE_FILE = path.join(ROOT, 'data', 'spatial', 'workspace.json');
const SPATIAL_HISTORY_FILE = path.join(ROOT, 'data', 'spatial', 'history.json');

const dashboardFiles = [
  'projects/emergence/roadmap.md',
  'projects/emergence/tasks.md',
  'projects/emergence/decisions.md',
  'projects/emergence/state.json',
  'projects/emergence/project_brain.md',
  'projects/emergence/plan.md',
  'projects/emergence/changelog.md',
];

const runStore = new Map();
const runOrder = [];


function ensureSpatialStorage() {
  const dir = path.dirname(SPATIAL_WORKSPACE_FILE);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(SPATIAL_WORKSPACE_FILE)) {
    fs.writeFileSync(SPATIAL_WORKSPACE_FILE, JSON.stringify({ graph: { nodes: [], edges: [] }, architectureMemory: {} }, null, 2));
  }
  if (!fs.existsSync(SPATIAL_HISTORY_FILE)) fs.writeFileSync(SPATIAL_HISTORY_FILE, '[]\n');
}

function writeJson(file, payload) {
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function appendArchitectureHistory(entry) {
  const history = readJsonSafe(SPATIAL_HISTORY_FILE, []) || [];
  history.push(entry);
  writeJson(SPATIAL_HISTORY_FILE, history.slice(-80));
}


function nowIso() {
  return new Date().toISOString();
}

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function loadProjectsMap() {
  return readJsonSafe(PROJECTS_FILE, {}) || {};
}

function readDashboardFile(relPath) {
  const abs = path.join(ROOT, relPath);
  try {
    const content = fs.readFileSync(abs, 'utf8');
    const stat = fs.statSync(abs);
    const parsed = relPath.endsWith('.json') ? JSON.parse(content) : null;
    return {
      exists: true,
      path: relPath,
      absPath: abs,
      mtime: stat.mtime.toISOString(),
      content,
      parsed,
      error: null,
    };
  } catch (err) {
    return {
      exists: false,
      path: relPath,
      absPath: abs,
      mtime: null,
      content: '',
      parsed: null,
      error: err.code === 'ENOENT' ? 'File not found' : String(err.message || err),
    };
  }
}

function getTaskFolders() {
  if (!fs.existsSync(TASKS_DIR)) return [];
  return fs.readdirSync(TASKS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{4}-.+/.test(d.name))
    .map((d) => d.name)
    .sort();
}

function listChangedFilesFromPatch(patchText) {
  const files = new Set();
  const lines = patchText.split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      const parts = line.split(' ');
      if (parts.length >= 4) {
        const target = parts[3].replace(/^b\//, '');
        if (target && target !== 'dev/null') files.add(target);
      }
    }
  }
  return [...files];
}

function validateApply(projectPath, taskFolderName) {
  const taskDir = path.join(TASKS_DIR, taskFolderName);
  const patchPath = path.join(taskDir, 'patch.diff');
  const result = {
    ok: true,
    validation: [],
    warnings: [],
    refusalReasons: [],
    changedFiles: [],
    branchName: `ace/task-${taskFolderName.slice(0, 4)}-apply`,
    taskDir,
    patchPath,
  };

  if (!fs.existsSync(taskDir)) {
    result.ok = false;
    result.refusalReasons.push('Task folder not found.');
    return result;
  }

  if (!fs.existsSync(patchPath)) {
    result.ok = false;
    result.refusalReasons.push('patch.diff is missing. Run build first.');
    return result;
  }

  const patchText = fs.readFileSync(patchPath, 'utf8');
  if (!patchText.trim()) {
    result.ok = false;
    result.refusalReasons.push('patch.diff is empty.');
  } else {
    result.changedFiles = listChangedFilesFromPatch(patchText);
    if (result.changedFiles.length === 0) {
      result.ok = false;
      result.refusalReasons.push('Patch has no detectable changed files.');
    }
  }

  if (!projectPath || !fs.existsSync(projectPath)) {
    result.ok = false;
    result.refusalReasons.push('Project path does not exist.');
    return result;
  }

  const gitCheck = spawnSyncSafe('git', ['rev-parse', '--is-inside-work-tree'], projectPath);
  if (gitCheck.code !== 0 || gitCheck.stdout.trim() !== 'true') {
    result.ok = false;
    result.refusalReasons.push('Target project is not a git repository.');
    return result;
  }

  const status = spawnSyncSafe('git', ['status', '--porcelain', '--untracked-files=no'], projectPath);
  if (status.code !== 0) {
    result.ok = false;
    result.refusalReasons.push('Unable to inspect git status.');
  } else if (status.stdout.trim()) {
    result.ok = false;
    result.refusalReasons.push('Repository has uncommitted tracked changes.');
    result.warnings.push(status.stdout.trim());
  }

  const gitignorePath = path.join(projectPath, '.gitignore');
  const required = ['ui/node_modules/', '**/node_modules/', 'npm-debug.log*'];
  const gitignore = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
  const missing = required.filter((rule) => !gitignore.includes(rule));
  if (missing.length) {
    result.ok = false;
    result.refusalReasons.push('Required .gitignore rules are missing.');
    result.warnings.push(...missing.map((r) => `Missing rule: ${r}`));
  }

  result.validation.push(result.ok ? 'Validation passed.' : 'Validation failed.');
  return result;
}

function spawnSyncSafe(cmd, args, cwd) {
  try {
    const out = require('child_process').spawnSync(cmd, args, {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
    });
    return {
      code: out.status ?? 1,
      stdout: out.stdout || '',
      stderr: out.stderr || '',
    };
  } catch (err) {
    return { code: 1, stdout: '', stderr: String(err) };
  }
}

function createRun(action, payload) {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const run = {
    runId,
    action,
    payload,
    status: 'running',
    startedAt: Date.now(),
    finishedAt: null,
    durationMs: null,
    exitCode: null,
    logs: [],
    artifacts: [],
    meta: {},
    listeners: new Set(),
  };
  runStore.set(runId, run);
  runOrder.push(runId);
  while (runOrder.length > MAX_RUN_HISTORY) {
    const oldest = runOrder.shift();
    if (oldest) runStore.delete(oldest);
  }
  return run;
}

function pushRunEvent(run, event) {
  run.logs.push(event);
  for (const res of run.listeners) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }
}

function finishRun(run, exitCode, extra = {}) {
  run.exitCode = exitCode;
  run.status = exitCode === 0 ? 'success' : 'error';
  run.finishedAt = Date.now();
  run.durationMs = run.finishedAt - run.startedAt;
  run.meta = { ...run.meta, ...extra };
  pushRunEvent(run, { type: 'done', status: run.status, exitCode, durationMs: run.durationMs, meta: run.meta, artifacts: run.artifacts });
  for (const res of run.listeners) {
    res.end();
  }
  run.listeners.clear();
}

function runCommandForAction(action, body) {
  const aiPath = path.join(ROOT, 'runner', 'ai.py');
  const taskId = String(body.taskId || '').trim();
  const project = String(body.project || '').trim();
  const args = [aiPath, action, taskId, '--project', project];

  if (action === 'run') {
    if (!body.preset) throw new Error('Preset is required for Run action.');
    args.push('--preset', String(body.preset));
    if (body.timeout_s) args.push('--timeout-s', String(body.timeout_s));
  }

  if (action === 'apply' && body.dryRun) args.push('--dry-run');
  if ((action === 'manage' || action === 'build') && body.model) args.push('--model', String(body.model));

  return { cmd: 'python', args };
}

function extractApplySummary(stdout) {
  const branch = (stdout.match(/Apply complete on branch:\s*(.+)/) || [])[1] || null;
  const commit = (stdout.match(/Commit:\s*(.+)/) || [])[1] || null;
  return { branch: branch ? branch.trim() : null, commit: commit ? commit.trim() : null };
}

app.get('/api/dashboard', (req, res) => {
  const files = {};
  const errors = [];
  for (const file of dashboardFiles) {
    const data = readDashboardFile(file);
    files[file] = data;
    if (data.error) errors.push({ file, error: data.error });
  }
  const state = files['projects/emergence/state.json']?.parsed || {};
  res.json({
    refreshedAt: nowIso(),
    refreshIntervalMs: Number(process.env.DASHBOARD_REFRESH_MS || REFRESH_MS_DEFAULT),
    state,
    files,
    errors,
  });
});

app.get('/api/projects', (req, res) => {
  const projects = loadProjectsMap();
  const rows = Object.entries(projects).map(([key, projectPath]) => ({ key, name: key, path: projectPath }));
  res.json({ projects: rows });
});

app.get('/api/tasks', (req, res) => {
  res.json({ tasks: getTaskFolders() });
});

app.get('/api/presets', (req, res) => {
  const data = readJsonSafe(COMMANDS_FILE, {});
  const descriptions = {
    ui_start: 'Starts the UI with npm start (long-running dev server).',
    ui_node: 'Runs the Node Express UI server directly with node server.js.',
    runner_compile: 'Checks runner Python syntax with py_compile.',
  };
  const presets = Object.entries(data || {}).map(([name, spec]) => ({
    name,
    description: descriptions[name] || 'Runs a configured local command preset.',
    cwd: spec.cwd || '.',
    timeout_s: spec.timeout_s || null,
    cmd: spec.cmd || [],
  }));
  res.json({ presets });
});

app.get('/api/runs', (req, res) => {
  const runs = runOrder.slice().reverse().map((id) => {
    const r = runStore.get(id);
    return r ? {
      runId: r.runId,
      action: r.action,
      status: r.status,
      exitCode: r.exitCode,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      durationMs: r.durationMs,
      payload: r.payload,
      logs: r.logs,
      artifacts: r.artifacts,
      meta: r.meta,
    } : null;
  }).filter(Boolean);
  res.json({ runs });
});

app.post('/api/execute', (req, res) => {
  const body = req.body || {};
  const action = String(body.action || '').toLowerCase();
  const project = String(body.project || '').trim();
  const taskId = String(body.taskId || '').trim();

  if (!['scan', 'manage', 'build', 'run', 'apply'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action.' });
  }
  if (!project || !taskId) {
    return res.status(400).json({ error: 'project and taskId are required.' });
  }

  const projects = loadProjectsMap();
  const projectPath = projects[project] || project;

  if (action === 'apply') {
    const taskFolder = getTaskFolders().find((t) => t.startsWith(taskId.slice(0, 4)));
    if (!taskFolder) {
      return res.status(400).json({ error: 'Task folder not found for apply.' });
    }
    const review = validateApply(projectPath, taskFolder);
    if (body.previewOnly) {
      return res.json({ ok: review.ok, review });
    }
    if (!body.confirmApply) {
      return res.status(400).json({ error: 'Apply requires confirmation.', review });
    }
    if (!review.ok && !body.dryRun) {
      return res.status(400).json({ error: 'Apply validation failed.', review });
    }
  }

  let command;
  try {
    command = runCommandForAction(action, body);
  } catch (err) {
    return res.status(400).json({ error: String(err.message || err) });
  }

  const run = createRun(action, body);
  const child = spawn(command.cmd, command.args, { cwd: ROOT, windowsHide: true });
  run.meta.command = [command.cmd, ...command.args].join(' ');

  pushRunEvent(run, { type: 'status', message: `Started ${action}...`, timestamp: nowIso() });

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    pushRunEvent(run, { type: 'stdout', text, timestamp: nowIso() });
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    pushRunEvent(run, { type: 'stderr', text, timestamp: nowIso() });
  });

  child.on('close', (code) => {
    if (action === 'run') {
      const taskFolder = getTaskFolders().find((t) => t.startsWith(taskId.slice(0, 4)));
      if (taskFolder && body.preset) {
        run.artifacts.push(path.join('work', 'tasks', taskFolder, `run_${body.preset}.log`));
        run.artifacts.push(path.join('work', 'tasks', taskFolder, `run_${body.preset}.json`));
      }
    }
    if (action === 'apply' && code === 0) {
      const combined = run.logs.map((l) => l.text || '').join('');
      const summary = extractApplySummary(combined);
      run.meta = {
        ...run.meta,
        ...summary,
        nextAction: 'Create PR from the generated apply branch.',
      };
    }
    finishRun(run, code || 0);
  });

  child.on('error', (err) => {
    pushRunEvent(run, { type: 'stderr', text: String(err), timestamp: nowIso() });
    finishRun(run, 1);
  });

  res.json({ ok: true, runId: run.runId });
});

app.get('/api/stream/:runId', (req, res) => {
  const run = runStore.get(req.params.runId);
  if (!run) return res.status(404).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  for (const event of run.logs) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  if (run.status === 'running') {
    run.listeners.add(res);
  } else {
    res.write(`data: ${JSON.stringify({ type: 'done', status: run.status, exitCode: run.exitCode, durationMs: run.durationMs, meta: run.meta, artifacts: run.artifacts })}\n\n`);
    res.end();
  }

  req.on('close', () => run.listeners.delete(res));
});

app.post('/api/open-task-folder', (req, res) => {
  const taskId = String((req.body || {}).taskId || '').trim();
  const folder = getTaskFolders().find((t) => t.startsWith(taskId.slice(0, 4)));
  if (!folder) return res.status(404).json({ error: 'Task folder not found.' });
  const full = path.join(TASKS_DIR, folder);

  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', full], { detached: true, windowsHide: true });
    } else if (process.platform === 'darwin') {
      spawn('open', [full], { detached: true });
    } else {
      spawn('xdg-open', [full], { detached: true });
    }
    res.json({ ok: true, path: full });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/add/idea', (req, res) => {
  const text = String((req.body || {}).text || '').trim();
  if (!text) return res.status(400).json({ error: 'Idea text is required.' });
  const target = path.join(ROOT, 'idea.txt');
  fs.appendFileSync(target, `[${nowIso()}] ${text}${os.EOL}`, 'utf8');
  res.json({ ok: true, path: target });
});

app.post('/api/add/task', (req, res) => {
  const title = String((req.body || {}).title || '').trim();
  if (!title) return res.status(400).json({ error: 'Task title is required.' });
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'task';
  const tasks = getTaskFolders();
  const last = tasks.length ? Number(tasks[tasks.length - 1].slice(0, 4)) : 0;
  const id = String(last + 1).padStart(4, '0');
  const folder = `${id}-${slug}`;
  const full = path.join(TASKS_DIR, folder);
  fs.mkdirSync(full, { recursive: true });
  fs.writeFileSync(path.join(full, 'context.md'), `# Task ${id}: ${title}\n\n## Context\n- Describe intent here.\n`, 'utf8');
  fs.writeFileSync(path.join(full, 'patch.diff'), '', 'utf8');
  res.json({ ok: true, taskId: id, folder });
});

app.post('/api/add/project', (req, res) => {
  const name = String((req.body || {}).name || '').trim();
  const projectPath = String((req.body || {}).path || '').trim();
  if (!name || !projectPath) return res.status(400).json({ error: 'name and path are required.' });
  if (!fs.existsSync(projectPath)) return res.status(400).json({ error: 'Project path does not exist.' });

  const projects = loadProjectsMap();
  projects[name] = projectPath;
  fs.writeFileSync(PROJECTS_FILE, `${JSON.stringify(projects, null, 2)}\n`, 'utf8');
  res.json({ ok: true, project: { key: name, path: projectPath } });
});

app.get('/api/spatial/workspace', (req, res) => {
  ensureSpatialStorage();
  res.json(readJsonSafe(SPATIAL_WORKSPACE_FILE, { graph: { nodes: [], edges: [] } }));
});

app.put('/api/spatial/workspace', (req, res) => {
  ensureSpatialStorage();
  const body = req.body || {};
  writeJson(SPATIAL_WORKSPACE_FILE, body);
  appendArchitectureHistory({
    at: nowIso(),
    type: 'workspace-save',
    summary: {
      nodes: body.graph?.nodes?.length || 0,
      edges: body.graph?.edges?.length || 0,
      versions: body.architectureMemory?.versions?.slice(-1) || [],
    },
  });
  res.json({ ok: true });
});

app.get('/api/spatial/history', (req, res) => {
  ensureSpatialStorage();
  res.json({ history: readJsonSafe(SPATIAL_HISTORY_FILE, []) || [] });
});

app.post('/api/spatial/intent', (req, res) => {
  const text = String((req.body || {}).text || '').toLowerCase();
  const map = [
    ['backend intent extractor', ['input parser', 'intent classifier', 'entity extraction', 'task router']],
    ['logging', ['logging subsystem', 'telemetry module', 'audit events']],
    ['spatial ide', ['canvas renderer', 'graph engine', 'ace connector', 'mutation preview panel']],
  ];
  const found = map.find(([k]) => text.includes(k));
  const tasks = found ? found[1] : text.split(/[,.]/).map((s) => s.trim()).filter(Boolean).slice(0, 4);
  res.json({ tasks: tasks.length ? tasks : ['analyze requirements', 'decompose tasks', 'build modules'] });
});

app.post('/api/spatial/mutations/preview', (req, res) => {
  const mutations = (req.body || {}).mutations || [];
  const summary = mutations.map((m) => {
    if (m.type === 'create_node') return `- new ${m.node.type}: ${m.node.content}`;
    if (m.type === 'modify_node') return `- modify node ${m.id}`;
    if (m.type === 'create_edge') return `- dependency ${m.edge.source} -> ${m.edge.target}`;
    return `- ${m.type}`;
  });
  res.json({ ok: true, summary });
});

app.post('/api/spatial/mutations/apply', (req, res) => {
  const mutations = (req.body || {}).mutations || [];
  appendArchitectureHistory({ at: nowIso(), type: 'mutation-apply', count: mutations.length });
  res.json({ ok: true, applied: mutations.length });
});

app.listen(port, () => {
  console.log(`AI Core Engine UI running at http://localhost:${port}`);
});
