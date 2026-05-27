const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const {
  DEFAULT_OLLAMA_HOST,
  requestOllamaText,
  runOllamaTagsProbe,
} = require('./localModelClient');

const CONTRACT = 'subconscious.advisory.v1';
const ADVISORY_DIR_RELATIVE = path.join('brain', 'context', 'subconscious');
const DEFAULT_CONFIG = Object.freeze({
  model: 'qwen2.5-coder:1.5b',
  host: DEFAULT_OLLAMA_HOST,
  port: 43171,
  intervalMs: 15 * 60 * 1000,
  maxQuietMs: 2 * 60 * 60 * 1000,
  timeoutMs: 90 * 1000,
  cpuPauseThreshold: 55,
  maxVisitedFiles: 12000,
  maxChanges: 80,
  maxExcerptFiles: 8,
  maxExcerptChars: 900,
  maxMemoryChars: 10000,
  maxThoughtFiles: 120,
  numThread: 2,
  numPredict: 420,
  numCtx: 4096,
  keepAlive: '0',
  temperature: 0.35,
  pauseProcessPatterns: [
    'UnrealEditor',
    'UE4Editor',
    'UE5Editor',
    'Unity',
    'Blender',
    'Shipping',
    'Win64-Shipping',
  ],
  excludedDirectoryNames: [
    '.git',
    '.npm-cache',
    '.playwright-browsers',
    '.recovery',
    '.tmp.drivedownload',
    '.tmp.driveupload',
    'node_modules',
  ],
  excludedRelativePrefixes: [
    'brain/context/subconscious/',
    'AXIOM/apps/launcher/logs/',
    'Projects/field-fronts-prototype/output/',
  ],
});
const EXCERPT_EXTENSIONS = new Set([
  '.cjs', '.css', '.html', '.js', '.json', '.md', '.mjs', '.ps1', '.txt', '.yaml', '.yml',
]);

function nowIso() {
  return new Date().toISOString();
}

function normalizePath(value = '') {
  return String(value || '').replace(/\\/g, '/');
}

function safeReadJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, String(content || ''), 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function writeJson(filePath, payload) {
  writeText(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function advisoryPaths(rootPath) {
  const dir = path.join(rootPath, ADVISORY_DIR_RELATIVE);
  return {
    dir,
    control: path.join(dir, 'control.json'),
    settings: path.join(dir, 'settings.json'),
    snapshot: path.join(dir, 'scan-snapshot.json'),
    status: path.join(dir, 'status.json'),
    memory: path.join(dir, 'memory.md'),
    latestThought: path.join(dir, 'latest-thought.md'),
    activity: path.join(dir, 'activity.ndjson'),
    thoughts: path.join(dir, 'thoughts'),
  };
}

function mergeConfig(base = {}, overrides = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...(base && typeof base === 'object' ? base : {}),
    ...(overrides && typeof overrides === 'object' ? overrides : {}),
  };
}

function initializeStore(rootPath, configOverrides = {}) {
  const paths = advisoryPaths(rootPath);
  ensureDir(paths.dir);
  ensureDir(paths.thoughts);
  const storedSettings = safeReadJson(paths.settings, null);
  const config = mergeConfig(storedSettings, configOverrides);
  if (!storedSettings) {
    writeJson(paths.settings, {
      ...DEFAULT_CONFIG,
      note: 'Advisory observer only. Generated output must not be promoted to canonical truth without explicit review.',
    });
  }
  if (!fs.existsSync(paths.control)) {
    writeJson(paths.control, {
      paused: false,
      reason: null,
      updatedAt: nowIso(),
      updatedBy: 'daemon-bootstrap',
    });
  }
  return { paths, config };
}

function readControl(paths) {
  return {
    paused: false,
    reason: null,
    ...safeReadJson(paths.control, {}),
  };
}

function writeControl(paths, patch = {}) {
  const next = {
    ...readControl(paths),
    ...patch,
    updatedAt: nowIso(),
  };
  writeJson(paths.control, next);
  return next;
}

function readStatus(rootPath) {
  const paths = advisoryPaths(rootPath);
  return safeReadJson(paths.status, {
    contract: CONTRACT,
    classification: 'derived_advisory',
    canonical: false,
    state: 'not_started',
    rootBoundary: normalizePath(rootPath),
    outputDirectory: normalizePath(path.relative(rootPath, paths.dir)),
    latestThought: null,
    latestMemory: null,
    updatedAt: null,
  });
}

function writeStatus(paths, rootPath, payload = {}) {
  const next = {
    contract: CONTRACT,
    classification: 'derived_advisory',
    canonical: false,
    outputType: 'text',
    rootBoundary: normalizePath(rootPath),
    outputDirectory: normalizePath(path.relative(rootPath, paths.dir)),
    ...payload,
    updatedAt: nowIso(),
  };
  writeJson(paths.status, next);
  return next;
}

function isInsideRoot(rootPath, targetPath) {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`);
}

function isExcludedPath(relativePath, config) {
  const normalized = `${normalizePath(relativePath).replace(/^\/+/, '')}`;
  return config.excludedRelativePrefixes.some((prefix) => normalized.startsWith(normalizePath(prefix)));
}

function scanWorkspace(rootPath, config = DEFAULT_CONFIG) {
  const files = {};
  const excludedDirectoryNames = new Set(config.excludedDirectoryNames || []);
  let visited = 0;
  let clipped = false;

  function walk(dirPath) {
    if (clipped) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch (_error) {
      return;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (clipped) break;
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = normalizePath(path.relative(rootPath, fullPath));
      if (!relativePath || isExcludedPath(relativePath, config)) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!excludedDirectoryNames.has(entry.name)) walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      visited += 1;
      if (visited > config.maxVisitedFiles) {
        clipped = true;
        break;
      }
      try {
        const stat = fs.statSync(fullPath);
        files[relativePath] = {
          mtimeMs: Math.floor(stat.mtimeMs),
          size: stat.size,
        };
      } catch (_error) {
        // A transient removal will be observed on the next scan.
      }
    }
  }

  walk(rootPath);
  return {
    capturedAt: nowIso(),
    rootBoundary: normalizePath(rootPath),
    visitedFiles: visited,
    clipped,
    files,
  };
}

function diffScans(previous = null, current = null, maxChanges = DEFAULT_CONFIG.maxChanges) {
  const before = previous?.files || {};
  const after = current?.files || {};
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const changes = [];
  paths.forEach((relativePath) => {
    const oldEntry = before[relativePath];
    const newEntry = after[relativePath];
    if (!oldEntry && newEntry) {
      changes.push({ path: relativePath, kind: 'added', size: newEntry.size });
      return;
    }
    if (oldEntry && !newEntry) {
      changes.push({ path: relativePath, kind: 'removed', size: oldEntry.size });
      return;
    }
    if (oldEntry.mtimeMs !== newEntry.mtimeMs || oldEntry.size !== newEntry.size) {
      changes.push({ path: relativePath, kind: 'modified', size: newEntry.size });
    }
  });
  return {
    total: changes.length,
    clipped: changes.length > maxChanges,
    changes: changes.slice(0, maxChanges),
  };
}

function readExcerpt(rootPath, relativePath, config) {
  const fullPath = path.resolve(rootPath, relativePath);
  if (!isInsideRoot(rootPath, fullPath) || !EXCERPT_EXTENSIONS.has(path.extname(fullPath).toLowerCase())) {
    return null;
  }
  try {
    const stat = fs.statSync(fullPath);
    if (!stat.isFile() || stat.size > 1024 * 1024) return null;
    return fs.readFileSync(fullPath, 'utf8').slice(0, config.maxExcerptChars);
  } catch (_error) {
    return null;
  }
}

function readBoundedText(filePath, maxChars) {
  try {
    return fs.readFileSync(filePath, 'utf8').slice(0, maxChars);
  } catch (_error) {
    return '';
  }
}

function buildObservationPrompt(rootPath, paths, scanDelta, config) {
  const memory = readBoundedText(paths.memory, Math.min(config.maxMemoryChars, 5000));
  const anchors = [
    'brain/emergence/project_brain.md',
    'brain/emergence/decisions.md',
    'brain/context/next_slice.md',
  ].map((relativePath) => {
    const text = readBoundedText(path.join(rootPath, relativePath), 1200);
    return text ? `FILE ${relativePath}\n${text}` : '';
  }).filter(Boolean).join('\n\n');
  const changedLines = scanDelta.changes.map((change) => `- ${change.kind}: ${change.path} (${change.size || 0} bytes)`);
  const excerpts = scanDelta.changes
    .filter((change) => change.kind !== 'removed')
    .slice(0, config.maxExcerptFiles)
    .map((change) => {
      const excerpt = readExcerpt(rootPath, change.path, config);
      return excerpt ? `FILE ${change.path}\n${excerpt}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
  return [
    'You are the AI Pipeline subconscious observer. Produce calm, concise text commentary on bounded activity inside this workspace.',
    'You are advisory only: do not claim canonical truth, task completion, successful builds, or code changes not shown in the evidence.',
    'Canonical authority is brain/emergence/. Your memory is derived operational context under brain/context/subconscious/.',
    'Comment on coherence, likely relevance, and what a working agent may want to inspect next. Never instruct autonomous mutation.',
    'Use exactly these headings: OBSERVATION, COHERENCE, ATTENTION, MEMORY UPDATE.',
    'Under MEMORY UPDATE, return a compact replacement memory that incorporates useful earlier memory and current evidence.',
    '',
    `SCAN TIME: ${nowIso()}`,
    `CHANGED PATHS (${scanDelta.total}${scanDelta.clipped ? ', list clipped' : ''}):`,
    changedLines.join('\n') || '- no material file changes; this is a low-frequency continuity check',
    '',
    'PRIOR ADVISORY MEMORY:',
    memory || '(none yet)',
    '',
    'CANONICAL AND PLANNER ANCHORS:',
    anchors || '(not available)',
    '',
    'BOUNDED EXCERPTS:',
    excerpts || '(no small text excerpts available)',
  ].join('\n');
}

function extractMemoryUpdate(text, maxChars) {
  const raw = String(text || '').trim();
  const match = raw.match(/(?:^|\n)MEMORY UPDATE\s*:?\s*\n([\s\S]*)$/i);
  const memory = match ? match[1].trim() : raw;
  return memory.slice(0, maxChars).trim();
}

function appendActivity(paths, payload) {
  ensureDir(paths.dir);
  fs.appendFileSync(paths.activity, `${JSON.stringify(payload)}\n`, 'utf8');
}

function thoughtFileName(timestamp = new Date()) {
  return `${timestamp.toISOString().replace(/[:.]/g, '-')}.md`;
}

function pruneThoughtFiles(paths, maxThoughtFiles) {
  const files = fs.readdirSync(paths.thoughts)
    .filter((fileName) => fileName.endsWith('.md'))
    .sort();
  files.slice(0, Math.max(0, files.length - maxThoughtFiles)).forEach((fileName) => {
    fs.unlinkSync(path.join(paths.thoughts, fileName));
  });
}

function writeThought(paths, rootPath, text, details = {}, config = DEFAULT_CONFIG) {
  const createdAt = details.createdAt || nowIso();
  const output = [
    '# Subconscious Observation',
    '',
    `- Generated: ${createdAt}`,
    `- Model: ${details.model || config.model}`,
    '- Classification: derived advisory context (not canonical truth)',
    `- Scan changes: ${details.changeCount || 0}`,
    `- Duration ms: ${details.durationMs || 0}`,
    '',
    '## Model Commentary',
    '',
    String(text || '').trim(),
    '',
  ].join('\n');
  const thoughtPath = path.join(paths.thoughts, thoughtFileName(new Date(createdAt)));
  writeText(thoughtPath, output);
  writeText(paths.latestThought, output);
  const memoryText = extractMemoryUpdate(text, config.maxMemoryChars);
  writeText(paths.memory, [
    '# Subconscious Advisory Memory',
    '',
    `Updated: ${createdAt}`,
    '',
    'This is model-generated compressed context. It is not canonical truth.',
    '',
    memoryText || '(The model returned no memory update.)',
    '',
  ].join('\n'));
  pruneThoughtFiles(paths, config.maxThoughtFiles);
  return {
    thoughtRef: normalizePath(path.relative(rootPath, thoughtPath)),
    latestThoughtRef: normalizePath(path.relative(rootPath, paths.latestThought)),
    memoryRef: normalizePath(path.relative(rootPath, paths.memory)),
    preview: String(text || '').trim().slice(0, 260),
  };
}

function execFileText(command, args, timeoutMs = 5000) {
  return new Promise((resolve) => {
    execFile(command, args, { windowsHide: true, timeout: timeoutMs }, (error, stdout) => {
      resolve(error ? null : String(stdout || '').trim());
    });
  });
}

async function probeResourcePressure(config, probeOverrides = {}) {
  if (typeof probeOverrides.probe === 'function') {
    return probeOverrides.probe(config);
  }
  let cpuPercent = null;
  let heavyProcesses = [];
  if (process.platform === 'win32') {
    const cpuOutput = await execFileText('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "(Get-Counter '\\Processor(_Total)\\% Processor Time' -SampleInterval 1 -MaxSamples 1).CounterSamples.CookedValue",
    ], 7000);
    cpuPercent = Number.parseFloat(cpuOutput);
    if (!Number.isFinite(cpuPercent)) cpuPercent = null;
    const processOutput = await execFileText('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '$p = Get-Process -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessName -Unique; @($p) | ConvertTo-Json -Compress',
    ], 5000);
    try {
      const parsed = JSON.parse(processOutput || '[]');
      const allProcesses = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
      const patterns = (config.pauseProcessPatterns || []).map((pattern) => String(pattern).toLowerCase()).filter(Boolean);
      heavyProcesses = allProcesses.filter((processName) => (
        patterns.some((pattern) => String(processName).toLowerCase().includes(pattern))
      ));
    } catch (_error) {
      heavyProcesses = [];
    }
  } else {
    cpuPercent = (os.loadavg()[0] / Math.max(1, os.cpus().length)) * 100;
  }
  const reasons = [];
  if (Number.isFinite(cpuPercent) && cpuPercent >= config.cpuPauseThreshold) {
    reasons.push(`System CPU ${cpuPercent.toFixed(1)}% is above ${config.cpuPauseThreshold}%.`);
  }
  if (heavyProcesses.length) {
    reasons.push(`Heavy interactive process detected: ${heavyProcesses.join(', ')}.`);
  }
  return {
    checkedAt: nowIso(),
    cpuPercent: Number.isFinite(cpuPercent) ? Number(cpuPercent.toFixed(1)) : null,
    heavyProcesses,
    paused: reasons.length > 0,
    reasons,
  };
}

function shouldRunContinuityThought(status, config) {
  const lastGeneratedAt = Date.parse(status?.lastGeneratedAt || '');
  return !Number.isFinite(lastGeneratedAt) || (Date.now() - lastGeneratedAt) >= config.maxQuietMs;
}

async function runCycle({
  rootPath = path.join(__dirname, '..'),
  configOverrides = {},
  force = false,
  modelRequest = requestOllamaText,
  tagsProbe = runOllamaTagsProbe,
  resourceProbe = null,
} = {}) {
  const resolvedRoot = path.resolve(rootPath);
  const { paths, config } = initializeStore(resolvedRoot, configOverrides);
  const priorStatus = readStatus(resolvedRoot);
  const control = readControl(paths);
  if (control.paused && !force) {
    return writeStatus(paths, resolvedRoot, {
      ...priorStatus,
      state: 'paused_manual',
      pauseReasons: [control.reason || 'Paused by operator.'],
      control,
      nextEligibleAt: null,
    });
  }
  const pressure = await probeResourcePressure(config, { probe: resourceProbe });
  if (pressure.paused && !force) {
    return writeStatus(paths, resolvedRoot, {
      ...priorStatus,
      state: 'paused_by_load',
      pauseReasons: pressure.reasons,
      resourcePressure: pressure,
      control,
      nextEligibleAt: new Date(Date.now() + config.intervalMs).toISOString(),
    });
  }
  const currentScan = scanWorkspace(resolvedRoot, config);
  const previousScan = safeReadJson(paths.snapshot, null);
  const delta = diffScans(previousScan, currentScan, config.maxChanges);
  const continuityDue = shouldRunContinuityThought(priorStatus, config);
  if (!force && delta.total === 0 && !continuityDue) {
    writeJson(paths.snapshot, currentScan);
    return writeStatus(paths, resolvedRoot, {
      ...priorStatus,
      state: 'idle_no_change',
      lastScanAt: currentScan.capturedAt,
      scannedFileCount: currentScan.visitedFiles,
      scanClipped: currentScan.clipped,
      resourcePressure: pressure,
      control,
      nextEligibleAt: new Date(Date.now() + config.intervalMs).toISOString(),
    });
  }
  const probe = await tagsProbe({
    host: config.host,
    timeoutMs: Math.min(4000, config.timeoutMs),
  });
  if (!probe?.ok || !probe.availableModels.includes(config.model)) {
    const reason = !probe?.ok
      ? (probe?.reason || 'Ollama is unavailable.')
      : `Configured model "${config.model}" is not installed.`;
    return writeStatus(paths, resolvedRoot, {
      ...priorStatus,
      state: 'model_unavailable',
      failureReason: reason,
      lastScanAt: currentScan.capturedAt,
      resourcePressure: pressure,
      model: config.model,
      availableModels: probe?.availableModels || [],
      control,
    });
  }
  const generationStartedAt = Date.now();
  writeStatus(paths, resolvedRoot, {
    ...priorStatus,
    state: 'generating',
    model: config.model,
    lastScanAt: currentScan.capturedAt,
    scannedFileCount: currentScan.visitedFiles,
    resourcePressure: pressure,
    control,
  });
  try {
    const response = await modelRequest({
      host: config.host,
      model: config.model,
      prompt: buildObservationPrompt(resolvedRoot, paths, delta, config),
      timeoutMs: config.timeoutMs,
      keepAlive: config.keepAlive,
      options: {
        num_ctx: config.numCtx,
        num_predict: config.numPredict,
        num_thread: config.numThread,
        temperature: config.temperature,
      },
    });
    if (!String(response?.text || '').trim()) {
      throw new Error('The local model returned empty text.');
    }
    const completedAt = nowIso();
    const durationMs = Date.now() - generationStartedAt;
    const output = writeThought(paths, resolvedRoot, response.text, {
      createdAt: completedAt,
      model: response.model || config.model,
      changeCount: delta.total,
      durationMs,
    }, config);
    writeJson(paths.snapshot, currentScan);
    appendActivity(paths, {
      contract: CONTRACT,
      generatedAt: completedAt,
      model: response.model || config.model,
      classification: 'derived_advisory',
      changeCount: delta.total,
      changedPaths: delta.changes.map((change) => change.path),
      thoughtRef: output.thoughtRef,
      durationMs,
    });
    return writeStatus(paths, resolvedRoot, {
      state: 'live',
      model: response.model || config.model,
      modelHost: config.host,
      modelStatus: 'fresh_generation',
      resourcePolicy: {
        intervalMs: config.intervalMs,
        maxQuietMs: config.maxQuietMs,
        numThread: config.numThread,
        numPredict: config.numPredict,
        numCtx: config.numCtx,
        keepAlive: config.keepAlive,
        cpuPauseThreshold: config.cpuPauseThreshold,
      },
      resourcePressure: pressure,
      control,
      lastScanAt: currentScan.capturedAt,
      scannedFileCount: currentScan.visitedFiles,
      scanClipped: currentScan.clipped,
      lastGeneratedAt: completedAt,
      generationDurationMs: durationMs,
      changeCount: delta.total,
      changedPaths: delta.changes.map((change) => change.path),
      latestThought: output.latestThoughtRef,
      latestMemory: output.memoryRef,
      latestPreview: output.preview,
      nextEligibleAt: new Date(Date.now() + config.intervalMs).toISOString(),
    });
  } catch (error) {
    return writeStatus(paths, resolvedRoot, {
      ...priorStatus,
      state: 'generation_failed',
      model: config.model,
      modelStatus: 'error',
      failureReason: String(error?.message || error),
      lastScanAt: currentScan.capturedAt,
      resourcePressure: pressure,
      control,
    });
  }
}

function listThoughts(rootPath, limit = 8) {
  const paths = advisoryPaths(rootPath);
  try {
    return fs.readdirSync(paths.thoughts)
      .filter((name) => name.endsWith('.md'))
      .sort()
      .reverse()
      .slice(0, Math.max(1, Math.min(Number(limit) || 8, 40)))
      .map((name) => normalizePath(path.join(ADVISORY_DIR_RELATIVE, 'thoughts', name)));
  } catch (_error) {
    return [];
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 32 * 1024) {
        reject(new Error('Request body is too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function createDaemonServer({ rootPath, config, requestCycle }) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/api/subconscious/status')) {
      return sendJson(res, 200, {
        ok: true,
        status: readStatus(rootPath),
        recentThoughts: listThoughts(rootPath, url.searchParams.get('limit') || 8),
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/subconscious/memory') {
      const paths = advisoryPaths(rootPath);
      return sendJson(res, 200, {
        ok: true,
        classification: 'derived_advisory',
        canonical: false,
        memory: readBoundedText(paths.memory, config.maxMemoryChars + 256),
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/subconscious/control') {
      try {
        const body = await readJsonBody(req);
        const paths = advisoryPaths(rootPath);
        const action = String(body.action || '').trim().toLowerCase();
        if (action === 'pause') {
          const control = writeControl(paths, {
            paused: true,
            reason: String(body.reason || 'Paused by operator.').trim(),
            updatedBy: 'localhost-api',
          });
          return sendJson(res, 200, { ok: true, action, control });
        }
        if (action === 'resume') {
          const control = writeControl(paths, {
            paused: false,
            reason: null,
            updatedBy: 'localhost-api',
          });
          return sendJson(res, 200, { ok: true, action, control });
        }
        if (action === 'wake') {
          requestCycle({ force: Boolean(body.force) });
          return sendJson(res, 202, { ok: true, action, acceptedAt: nowIso() });
        }
        return sendJson(res, 400, { ok: false, error: 'action must be pause, resume, or wake.' });
      } catch (error) {
        return sendJson(res, 400, { ok: false, error: String(error.message || error) });
      }
    }
    return sendJson(res, 404, { ok: false, error: 'Not found.' });
  });
}

function startDaemon({
  rootPath = path.join(__dirname, '..'),
  configOverrides = {},
  runImmediately = true,
} = {}) {
  const resolvedRoot = path.resolve(rootPath);
  const { config } = initializeStore(resolvedRoot, configOverrides);
  let cycleRunning = false;
  let timer = null;
  const requestCycle = async ({ force = false } = {}) => {
    if (cycleRunning) return readStatus(resolvedRoot);
    cycleRunning = true;
    try {
      return await runCycle({ rootPath: resolvedRoot, configOverrides: config, force });
    } finally {
      cycleRunning = false;
      clearTimeout(timer);
      timer = setTimeout(() => requestCycle(), config.intervalMs);
      if (typeof timer.unref === 'function') timer.unref();
    }
  };
  const server = createDaemonServer({ rootPath: resolvedRoot, config, requestCycle });
  server.listen(config.port, '127.0.0.1', () => {
    if (runImmediately) requestCycle();
  });
  return {
    server,
    config,
    requestCycle,
    close() {
      clearTimeout(timer);
      server.close();
    },
  };
}

function parseArguments(argv) {
  const flags = new Set(argv.filter((entry) => entry.startsWith('--')));
  const valueFor = (name) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : null;
  };
  const overrides = {};
  if (valueFor('--model')) overrides.model = valueFor('--model');
  if (valueFor('--port')) overrides.port = Number(valueFor('--port'));
  if (valueFor('--interval-minutes')) overrides.intervalMs = Number(valueFor('--interval-minutes')) * 60 * 1000;
  return { flags, overrides };
}

async function main(argv = process.argv.slice(2)) {
  const rootPath = path.resolve(path.join(__dirname, '..'));
  const { flags, overrides } = parseArguments(argv);
  const { paths } = initializeStore(rootPath, overrides);
  if (flags.has('--status')) {
    process.stdout.write(`${JSON.stringify(readStatus(rootPath), null, 2)}\n`);
    return;
  }
  if (flags.has('--pause')) {
    process.stdout.write(`${JSON.stringify(writeControl(paths, {
      paused: true,
      reason: 'Paused from CLI.',
      updatedBy: 'cli',
    }), null, 2)}\n`);
    return;
  }
  if (flags.has('--resume')) {
    process.stdout.write(`${JSON.stringify(writeControl(paths, {
      paused: false,
      reason: null,
      updatedBy: 'cli',
    }), null, 2)}\n`);
    return;
  }
  if (flags.has('--once') || flags.has('--wake')) {
    const result = await runCycle({
      rootPath,
      configOverrides: overrides,
      force: flags.has('--force'),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  startDaemon({ rootPath, configOverrides: overrides });
}

module.exports = {
  CONTRACT,
  DEFAULT_CONFIG,
  ADVISORY_DIR_RELATIVE,
  advisoryPaths,
  buildObservationPrompt,
  createDaemonServer,
  diffScans,
  extractMemoryUpdate,
  initializeStore,
  listThoughts,
  probeResourcePressure,
  readStatus,
  runCycle,
  scanWorkspace,
  startDaemon,
  writeControl,
};

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Subconscious daemon failed: ${String(error?.message || error)}\n`);
    process.exitCode = 1;
  });
}
