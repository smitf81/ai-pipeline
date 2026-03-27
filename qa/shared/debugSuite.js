const fs = require('fs');
const http = require('http');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROUTE_PATTERN = /app\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/g;
const RELATIVE_IMPORT_PATTERNS = [
  /\bimport\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
  /\bexport\s+[^'"]*?\s+from\s+['"]([^'"]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];
const JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const PY_EXTENSIONS = new Set(['.py']);
const SOURCE_IGNORE_PREFIXES = ['.git/', 'data/', 'legacy/', 'ui/node_modules/', 'work/'];
const JS_WALK_IGNORE = new Set(['.git', 'data', 'legacy', 'node_modules', 'work']);
const PY_WALK_IGNORE = new Set(['.git', '__pycache__', 'data', 'legacy', 'node_modules', 'work']);
const DESK_OWNERSHIP = {
  planner: ['agents/planner/', 'brain/'],
  runner: ['ACE.cmd', 'ace_commands.json', 'init_ai_pipeline.py', 'requirements.txt', 'runner/', 'targets.json'],
  ta: ['ta/'],
  ui: ['ui/'],
};

function normalizeSlashes(value) {
  return String(value || '').replace(/\\/g, '/');
}

function toRelativePosix(rootPath, targetPath) {
  return normalizeSlashes(path.relative(rootPath, targetPath)).replace(/^\.\/+/, '');
}

function normalizeCandidatePath(rootPath, value) {
  if (!value) return '';
  if (path.isAbsolute(value)) return toRelativePosix(rootPath, value);
  return normalizeSlashes(String(value).trim()).replace(/^\.\/+/, '');
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readJsonSafe(filePath, fallback = null) {
  try {
    return JSON.parse(readText(filePath));
  } catch {
    return fallback;
  }
}

function makeTest(name, ok, reason = null, severity = 'critical', extras = null) {
  const metadata = extras && typeof extras === 'object' ? extras : null;
  return ok
    ? { name, status: 'pass', ...(metadata || {}) }
    : {
        name,
        status: 'fail',
        severity,
        reason: String(reason || 'validation failed'),
        ...(metadata || {}),
      };
}

function finalizeDeskResult(desk, tests) {
  return {
    desk,
    status: tests.every((test) => test.status === 'pass') ? 'pass' : 'fail',
    tests,
  };
}

function normalizeAllowedPaths(rootPath, allowedPaths = []) {
  if (!Array.isArray(allowedPaths)) return [];
  return allowedPaths
    .map((entry) => normalizeCandidatePath(rootPath, entry))
    .filter(Boolean);
}

function resolveFixture(rootPath, fixtureInput) {
  if (!fixtureInput) return null;
  if (typeof fixtureInput === 'object') return fixtureInput;

  const candidate = String(fixtureInput).trim();
  if (!candidate) return null;

  const absolutePath = path.isAbsolute(candidate)
    ? candidate
    : path.join(rootPath, candidate);
  const fixturePath = fs.existsSync(absolutePath)
    ? absolutePath
    : path.join(rootPath, 'qa', 'fixtures', candidate.endsWith('.json') ? candidate : `${candidate}.json`);

  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Fixture not found: ${candidate}`);
  }
  return readJsonSafe(fixturePath, null);
}

function createContext(options = {}) {
  const rootPath = path.resolve(options.rootPath || path.join(__dirname, '..', '..'));
  return {
    rootPath,
    existingApp: options.existingApp || null,
    allowedPaths: normalizeAllowedPaths(rootPath, options.allowedPaths || []),
    fixture: resolveFixture(rootPath, options.fixture),
    startedAt: new Date().toISOString(),
    startedMs: Date.now(),
    routeCache: null,
    gitChanges: null,
    serverHarness: null,
  };
}

async function ensureServer(context) {
  if (context.serverHarness) return context.serverHarness;

  process.env.ACE_DISABLE_SELF_RESTART = '1';
  const app = context.existingApp || require(path.join(context.rootPath, 'ui', 'server.js')).app;
  const server = http.createServer(app);

  await new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once('error', onError);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError);
      resolve();
    });
  });

  const address = server.address();
  context.serverHarness = {
    app,
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
  return context.serverHarness;
}

async function closeContext(context) {
  if (!context?.serverHarness?.server) return;
  await new Promise((resolve) => {
    context.serverHarness.server.close(() => resolve());
  });
  context.serverHarness = null;
}

function getServerRoutes(context) {
  if (context.routeCache) return context.routeCache;
  const serverPath = path.join(context.rootPath, 'ui', 'server.js');
  const source = readText(serverPath);
  const routes = [];
  let match = ROUTE_PATTERN.exec(source);
  while (match) {
    routes.push({
      method: match[1].toLowerCase(),
      path: normalizeRoute(match[2]),
    });
    match = ROUTE_PATTERN.exec(source);
  }
  context.routeCache = routes;
  return routes;
}

function normalizeRoute(route) {
  return String(route || '')
    .trim()
    .replace(/\$\{[^}]+\}/g, ':param')
    .replace(/\/+/g, '/');
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function routeTemplateToRegex(route) {
  const pattern = normalizeRoute(route)
    .split('/')
    .map((segment) => (segment.startsWith(':') ? '[^/]+' : escapeRegex(segment)))
    .join('/');
  return new RegExp(`^${pattern}$`);
}

function routeExists(context, method, route) {
  const normalizedMethod = String(method || 'get').toLowerCase();
  const targetRoute = normalizeRoute(route);
  return getServerRoutes(context)
    .filter((entry) => entry.method === normalizedMethod)
    .some((entry) => (
      entry.path === targetRoute
      || routeTemplateToRegex(entry.path).test(targetRoute)
      || routeTemplateToRegex(targetRoute).test(entry.path)
    ));
}

async function requestJson(context, method, route, body = null, timeoutMs = 2000) {
  const { baseUrl } = await ensureServer(context);
  const endpoint = new URL(route, baseUrl);
  const payload = body == null ? null : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: endpoint.hostname,
      port: endpoint.port,
      path: `${endpoint.pathname}${endpoint.search}`,
      method: String(method || 'GET').toUpperCase(),
      headers: payload ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      } : {},
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let parsed = null;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch {
          parsed = null;
        }
        resolve({
          statusCode: response.statusCode || 0,
          body: parsed,
          raw,
        });
      });
    });

    request.on('error', reject);
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`request timeout after ${timeoutMs}ms`));
    });

    if (payload) request.write(payload);
    request.end();
  });
}

function objectMissingKeys(payload, keys) {
  return keys.filter((key) => !(payload && Object.prototype.hasOwnProperty.call(payload, key)));
}

function commandExists(command) {
  const value = String(command || '').trim();
  if (!value) return false;

  if (value.includes('/') || value.includes('\\')) {
    return fs.existsSync(value);
  }

  const pathValue = process.env.Path || process.env.PATH || '';
  const pathEntries = pathValue.split(path.delimiter).filter(Boolean);
  const pathExts = process.platform === 'win32'
    ? (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
    : [''];
  const hasExtension = Boolean(path.extname(value));
  const candidates = hasExtension ? [value] : [value, ...pathExts.map((extension) => `${value}${extension.toLowerCase()}`)];

  return pathEntries.some((entry) => candidates.some((candidate) => (
    fs.existsSync(path.join(entry, candidate))
    || fs.existsSync(path.join(entry, candidate.toUpperCase()))
    || fs.existsSync(path.join(entry, candidate.toLowerCase()))
  )));
}

function loadCommonJsModule(filePath) {
  try {
    require(filePath);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: String(error.message || error) };
  }
}

function validateJsonFile(filePath) {
  try {
    JSON.parse(readText(filePath));
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: String(error.message || error) };
  }
}

function listFilesRecursive(rootPath, prefixes, extensions, ignoreDirs) {
  const files = [];
  for (const prefix of prefixes) {
    const absolute = path.join(rootPath, prefix);
    if (!fs.existsSync(absolute)) continue;
    const stack = [absolute];
    while (stack.length) {
      const current = stack.pop();
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (ignoreDirs.has(entry.name)) continue;
          stack.push(fullPath);
          continue;
        }
        if (!entry.isFile()) continue;
        if (extensions.has(path.extname(entry.name).toLowerCase())) {
          files.push(fullPath);
        }
      }
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function looksLikeModule(source) {
  return /^\s*(import|export)\b/m.test(source);
}

function resolveRelativeImport(filePath, specifier) {
  const base = path.resolve(path.dirname(filePath), specifier);
  const candidates = [
    base,
    `${base}.js`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}.json`,
    path.join(base, 'index.js'),
    path.join(base, 'index.mjs'),
    path.join(base, 'index.cjs'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function validateRelativeImports(filePath, source) {
  const failures = [];
  for (const pattern of RELATIVE_IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(source);
    while (match) {
      const specifier = match[1];
      if (specifier && specifier.startsWith('.') && !resolveRelativeImport(filePath, specifier)) {
        failures.push(`missing import ${specifier}`);
      }
      match = pattern.exec(source);
    }
  }
  return failures;
}

function parseJavaScriptFile(filePath) {
  const source = readText(filePath);
  const treatAsModule = looksLikeModule(source) || path.extname(filePath).toLowerCase() === '.mjs';
  const transformedSource = treatAsModule
    ? source
      .replace(/^\s*import\s+[^;]+;?\s*$/gm, '')
      .replace(/^\s*export\s+default\s+/gm, '')
      .replace(/^\s*export\s+(?=(async\s+function|class|function|const|let|var)\b)/gm, '')
      .replace(/^\s*export\s*\{[^}]+\};?\s*$/gm, '')
      .replace(/\bimport\.meta\b/g, '({})')
    : source;
  try {
    const parseTarget = treatAsModule
      ? `async function __ace_module__wrapper__() {\n${transformedSource}\n}\n`
      : transformedSource;
    new vm.Script(parseTarget, { filename: filePath });
  } catch (error) {
    return { ok: false, reason: String(error.message || error) };
  }

  const importFailures = validateRelativeImports(filePath, source);
  if (importFailures.length) {
    return { ok: false, reason: importFailures.join('; ') };
  }

  return { ok: true };
}

function validateJavaScriptFiles(rootPath, prefixes) {
  const files = listFilesRecursive(rootPath, prefixes, JS_EXTENSIONS, JS_WALK_IGNORE);
  for (const filePath of files) {
    const result = parseJavaScriptFile(filePath);
    if (!result.ok) {
      return {
        ok: false,
        reason: `${toRelativePosix(rootPath, filePath)}: ${result.reason}`,
      };
    }
  }
  return {
    ok: true,
    filesChecked: files.length,
  };
}

function validatePythonFiles(rootPath, prefixes) {
  const files = listFilesRecursive(rootPath, prefixes, PY_EXTENSIONS, PY_WALK_IGNORE)
    .map((filePath) => toRelativePosix(rootPath, filePath));

  if (!files.length) {
    return { ok: true, filesChecked: 0 };
  }

  try {
    execFileSync('python', ['-m', 'py_compile', ...files], {
      cwd: rootPath,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { ok: true, filesChecked: files.length };
  } catch (error) {
    if (/EPERM/i.test(String(error.message || ''))) {
      return {
        ok: true,
        filesChecked: files.length,
        skipped: true,
      };
    }
    const output = [
      error.stdout || '',
      error.stderr || '',
      error.message || '',
    ].filter(Boolean).join('\n').trim();
    return { ok: false, reason: output || 'python compilation failed' };
  }
}

function parseGitStatus(output, rootPath) {
  return String(output || '')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const status = line.slice(0, 2);
      const rawPath = line.slice(3).trim();
      if (!rawPath) return null;
      const renameParts = rawPath.includes(' -> ') ? rawPath.split(' -> ') : null;
      const originalPath = renameParts ? normalizeCandidatePath(rootPath, renameParts[0]) : null;
      const filePath = normalizeCandidatePath(rootPath, renameParts ? renameParts[1] : rawPath);
      let kind = 'modified';
      if (status === '??') kind = 'untracked';
      else if (status.includes('D')) kind = 'deleted';
      else if (status.includes('R')) kind = 'renamed';
      else if (status.includes('A')) kind = 'added';
      return {
        status,
        kind,
        path: filePath,
        originalPath,
      };
    })
    .filter(Boolean);
}

function getGitChanges(context) {
  if (context.gitChanges) return context.gitChanges;

  const safeDirectory = normalizeSlashes(context.rootPath);
  try {
    const output = execFileSync('git', [
      '-c',
      `safe.directory=${safeDirectory}`,
      'status',
      '--porcelain',
      '--untracked-files=all',
    ], {
      cwd: context.rootPath,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    context.gitChanges = parseGitStatus(output, context.rootPath);
  } catch {
    context.gitChanges = [];
  }
  return context.gitChanges;
}

function isIgnoredSourcePath(relativePath) {
  return SOURCE_IGNORE_PREFIXES.some((prefix) => relativePath === prefix.slice(0, -1) || relativePath.startsWith(prefix));
}

function fileBelongsToDesk(deskId, relativePath) {
  const ownership = DESK_OWNERSHIP[deskId] || [];
  return ownership.some((prefix) => relativePath === prefix || relativePath.startsWith(prefix));
}

function fileAllowedByPolicy(context, relativePath) {
  if (!context.allowedPaths.length) return true;
  return context.allowedPaths.some((prefix) => relativePath === prefix || relativePath.startsWith(prefix));
}

function evaluateDeskFileScope(context, deskId) {
  const relevantChanges = getGitChanges(context)
    .filter((change) => {
      const candidates = [change.path, change.originalPath].filter(Boolean);
      return candidates.some((candidate) => fileBelongsToDesk(deskId, candidate));
    })
    .filter((change) => !isIgnoredSourcePath(change.path || change.originalPath || ''));

  const failures = [];

  for (const change of relevantChanges) {
    const targetPath = change.path || change.originalPath || '';
    if (change.kind === 'deleted') {
      failures.push(`deleted file ${targetPath}`);
      continue;
    }
    if (change.kind === 'renamed') {
      failures.push(`renamed file ${change.originalPath} -> ${change.path}`);
      continue;
    }
    if ((change.kind === 'untracked' || change.kind === 'added') && !fileAllowedByPolicy(context, targetPath)) {
      failures.push(`unexpected file created ${targetPath}`);
      continue;
    }
    if (context.allowedPaths.length && !fileAllowedByPolicy(context, targetPath)) {
      failures.push(`modified outside allowed scope ${targetPath}`);
    }
  }

  return failures.length
    ? { ok: false, reason: failures.join('; ') }
    : { ok: true, reason: `checked ${relevantChanges.length} owned change(s)` };
}

function applyFixtureFailures(context, deskId, tests) {
  const forced = Array.isArray(context.fixture?.forceFailures)
    ? context.fixture.forceFailures.filter((entry) => String(entry?.desk || '').trim() === deskId)
    : [];

  if (!forced.length) return tests;

  const nextTests = tests.map((test) => ({ ...test }));
  for (const entry of forced) {
    const testName = String(entry.test || '').trim();
    const reason = String(entry.reason || 'fixture forced failure');
    const target = nextTests.find((test) => test.name === testName);
    if (target) {
      target.status = 'fail';
      target.reason = reason;
      continue;
    }
    nextTests.push({ name: testName || 'fixture_failure', status: 'fail', reason });
  }
  return nextTests;
}

function extractHtmlSelectOptions(filePath, selectId) {
  const source = readText(filePath);
  const pattern = new RegExp(`<select[^>]*id=["']${escapeRegex(selectId)}["'][^>]*>([\\s\\S]*?)</select>`, 'i');
  const selectMatch = source.match(pattern);
  if (!selectMatch) return [];
  return Array.from(selectMatch[1].matchAll(/<option[^>]*value=["']([^"']+)["']/g))
    .map((match) => match[1])
    .filter(Boolean);
}

function extractRunnerSubcommands(filePath) {
  return Array.from(readText(filePath).matchAll(/add_parser\(\s*["']([^"']+)["']/g))
    .map((match) => match[1])
    .filter(Boolean);
}

function verifyLlmInvocation(rootPath, minTimestamp, expectedAgent = null) {
  const freshRuns = readAgentRunArtifacts(rootPath)
    .filter((run) => run.observedAtMs >= minTimestamp);

  if (expectedAgent) {
    const targetAgent = String(expectedAgent || '').trim();
    const matching = freshRuns.filter((run) => run.agent === targetAgent);
    if (!matching.length) {
      return { ok: false, reason: `agent ${targetAgent} ran but no fresh agent-run artifact was recorded` };
    }
    const latest = matching.sort((left, right) => right.observedAtMs - left.observedAtMs)[0];
    if (latest.usedFallback || latest.outcome !== 'completed') {
      return { ok: false, reason: `${targetAgent} produced ${latest.outcome || 'unknown'} (${latest.reason || latest.llmStatus || 'no reason'})` };
    }
    return { ok: true, reason: `fresh live ${targetAgent} run verified` };
  }

  if (!freshRuns.length) {
    return { ok: false, reason: 'no fresh agent-run artifacts recorded' };
  }

  const latest = freshRuns.sort((left, right) => right.observedAtMs - left.observedAtMs)[0];
  if (latest.usedFallback || latest.outcome !== 'completed') {
    return { ok: false, reason: `${latest.agent || 'agent'} produced ${latest.outcome || 'unknown'} (${latest.reason || latest.llmStatus || 'no reason'})` };
  }

  return { ok: true, reason: 'fresh live agent run verified' };
}

function readAgentRunArtifacts(rootPath) {
  const runsRoot = path.join(rootPath, 'data', 'spatial', 'agent-runs');
  if (!fs.existsSync(runsRoot)) {
    return [];
  }

  const runFiles = [];
  const stack = [runsRoot];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.json')) {
        runFiles.push(fullPath);
      }
    }
  }

  return runFiles
    .map((filePath) => normalizeAgentRunArtifact(readJsonSafe(filePath, null), filePath))
    .filter(Boolean);
}

function normalizeAgentRunArtifact(run, filePath = null) {
  if (!run || typeof run !== 'object') return null;

  const startedAt = run.startedAt || run.createdAt || null;
  const completedAt = run.completedAt || run.createdAt || null;
  const durationMs = Number.isFinite(run.durationMs)
    ? Number(run.durationMs)
    : Math.max(0, (Date.parse(completedAt || '') || 0) - (Date.parse(startedAt || '') || 0));
  const reason = String(run.reason || run.error || run.rawResponse || run.llmStatus || '').trim() || null;
  const outcome = String(run.outcome || (run.usedFallback ? 'degraded' : 'completed') || '').trim() || 'unknown';
  const llmStatus = String(run.llmStatus || (run.usedFallback ? 'degraded_fallback' : (outcome === 'completed' ? 'live' : outcome)) || '').trim() || 'unknown';

  return {
    ...run,
    filePath: filePath ? normalizeSlashes(filePath) : null,
    agent: run.workerId || null,
    startedAt,
    completedAt,
    observedAtMs: Date.parse(completedAt || startedAt || '') || 0,
    durationMs,
    outcome,
    llmStatus,
    reason,
    usedFallback: Boolean(run.usedFallback),
    backend: run.backend || null,
    model: run.model || null,
    runId: run.id || run.runId || null,
  };
}

function extractUiNetworkContracts(rootPath) {
  const uiFiles = listFilesRecursive(rootPath, ['ui/public'], JS_EXTENSIONS, JS_WALK_IGNORE);
  const endpoints = new Set();
  const pattern = /fetch\(\s*[`'"](\/api\/[^`'"?]+)/g;
  for (const file of uiFiles) {
    const source = readText(file);
    let match;
    while ((match = pattern.exec(source)) !== null) {
      endpoints.add(normalizeRoute(match[1]));
    }
  }
  return Array.from(endpoints).sort();
}

module.exports = {
  applyFixtureFailures,
  closeContext,
  commandExists,
  createContext,
  ensureServer,
  evaluateDeskFileScope,
  extractHtmlSelectOptions,
  extractRunnerSubcommands,
  extractUiNetworkContracts,
  finalizeDeskResult,
  loadCommonJsModule,
  makeTest,
  objectMissingKeys,
  readJsonSafe,
  requestJson,
  routeExists,
  toRelativePosix,
  validateJavaScriptFiles,
  validateJsonFile,
  validatePythonFiles,
  normalizeAgentRunArtifact,
  readAgentRunArtifacts,
  verifyLlmInvocation,
};
