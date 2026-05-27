const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function nowIso() {
  return new Date().toISOString();
}

function uniqueStrings(values = []) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function normalizeRelativePath(relativePath = '') {
  return String(relativePath || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/')
    .trim();
}

function resolveRootPath(rootPath = process.cwd(), targetPath = '') {
  if (!targetPath) return null;
  const absolute = path.isAbsolute(targetPath)
    ? path.resolve(targetPath)
    : path.resolve(rootPath || process.cwd(), targetPath);
  return absolute;
}

function existsUnderRoot(rootPath, targetPath) {
  if (!targetPath) return false;
  const resolved = resolveRootPath(rootPath, targetPath);
  return Boolean(resolved && fs.existsSync(resolved));
}

function normalizeFailureBundle(bundle = {}) {
  const criticalErrors = Array.isArray(bundle.criticalErrors) ? bundle.criticalErrors : [];
  const failingTestNames = uniqueStrings(bundle.failingTestNames || bundle.failingTests || []);
  const changedFiles = uniqueStrings(bundle.changedFiles || []);
  const message = String(bundle.message || bundle.reason || bundle.summary || criticalErrors[0]?.message || '').trim();
  const stack = String(bundle.stack || criticalErrors[0]?.stack || '').trim();
  const failureClass = String(bundle.failureClass || bundle.failure_class || criticalErrors[0]?.failureClass || criticalErrors[0]?.failure_class || '').trim() || null;
  const artifactRefs = uniqueStrings(bundle.artifactRefs || bundle.artifacts || []);
  return {
    ...bundle,
    message,
    stack,
    failureClass,
    criticalErrors,
    failingTestNames,
    changedFiles,
    artifactRefs,
  };
}

function extractStackPaths(stack = '') {
  const paths = [];
  const text = String(stack || '');
  const windowsPathPattern = /([A-Za-z]:\\[^:\n]+?\.(?:m?js|cjs|ts|tsx|jsx|json)):\d+:\d+/g;
  const unixPathPattern = /(?:\(|\s)(\/[^:\n]+?\.(?:m?js|cjs|ts|tsx|jsx|json)):\d+:\d+/g;
  for (const match of text.matchAll(windowsPathPattern)) {
    paths.push(match[1]);
  }
  for (const match of text.matchAll(unixPathPattern)) {
    paths.push(match[1]);
  }
  return uniqueStrings(paths);
}

function enumerateFiles(rootPath, dirPath) {
  const results = [];
  if (!fs.existsSync(dirPath)) return results;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...enumerateFiles(rootPath, fullPath));
    } else {
      results.push(normalizeRelativePath(path.relative(rootPath, fullPath)));
    }
  }
  return results;
}

function inferTestFileCandidates(rootPath, failingTestNames = []) {
  const testDir = path.join(rootPath, 'ui', 'tests');
  if (!fs.existsSync(testDir)) return [];
  const testFiles = enumerateFiles(rootPath, testDir);
  const normalizedNames = failingTestNames.map((name) => normalizeRelativePath(name).toLowerCase().replace(/[^a-z0-9]+/g, ''));
  return testFiles.filter((file) => {
    const normalizedFile = file.toLowerCase().replace(/[^a-z0-9]+/g, '');
    return normalizedNames.some((name) => name && normalizedFile.includes(name.slice(0, Math.max(6, Math.min(name.length, 24)))));
  });
}

function inferImplicatedFiles(rootPath, bundle = {}) {
  const normalized = normalizeFailureBundle(bundle);
  const changedFiles = normalized.changedFiles
    .map((file) => normalizeRelativePath(file))
    .filter((file) => existsUnderRoot(rootPath, file));
  const stackFiles = extractStackPaths(normalized.stack)
    .map((file) => normalizeRelativePath(path.isAbsolute(file) ? path.relative(rootPath, file) : file))
    .filter((file) => existsUnderRoot(rootPath, file));
  const testFiles = inferTestFileCandidates(rootPath, normalized.failingTestNames)
    .filter((file) => existsUnderRoot(rootPath, file));

  const inferred = uniqueStrings([...stackFiles, ...testFiles]).filter(Boolean);
  if (changedFiles.length) {
    const intersection = changedFiles.filter((file) => inferred.includes(file));
    return intersection.length ? intersection : changedFiles;
  }
  return inferred;
}

function buildLengthGuardReplacement(line) {
  return line.replace(/\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\.length\b/g, '($1?.length ?? 0)');
}

function buildArrayGuardReplacement(line, methods = ['map', 'filter', 'forEach', 'join']) {
  let nextLine = line;
  for (const method of methods) {
    const pattern = new RegExp(`\\b([A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*)\\.${method}\\(`, 'g');
    nextLine = nextLine.replace(pattern, '($1 ?? []).' + method + '(');
  }
  return nextLine;
}

function buildPatchProposalForFile(rootPath, relativePath, bundle = {}) {
  const absolutePath = resolveRootPath(rootPath, relativePath);
  if (!absolutePath || !fs.existsSync(absolutePath)) return null;
  const original = fs.readFileSync(absolutePath, 'utf8');
  const signalText = [
    String(bundle.message || '').toLowerCase(),
    String(bundle.stack || '').toLowerCase(),
    String(bundle.failureClass || '').toLowerCase(),
    ...((bundle.failingTestNames || []).map((value) => String(value || '').toLowerCase())),
  ].join(' ');
  const wantsLengthGuard = /reading 'length'|reading "length"|cannot read properties of undefined/.test(signalText);
  const wantsArrayGuard = /(map|filter|foreach|join) is not a function|cannot read properties of undefined/.test(signalText);
  const originalLines = original.split(/\r?\n/);
  const updatedLines = [];
  let changed = false;

  for (const line of originalLines) {
    let nextLine = line;
    if (wantsLengthGuard && !nextLine.includes('?.length')) {
      nextLine = buildLengthGuardReplacement(nextLine);
    }
    if (wantsArrayGuard && !nextLine.includes('?? []')) {
      nextLine = buildArrayGuardReplacement(nextLine);
    }
    if (nextLine !== line) changed = true;
    updatedLines.push(nextLine);
  }

  if (!changed) return null;

  return {
    file: normalizeRelativePath(relativePath),
    absolutePath,
    reason: wantsLengthGuard
      ? 'Normalize optional length access on the implicated file.'
      : 'Normalize optional collection access on the implicated file.',
    before: original,
    after: `${updatedLines.join('\n')}\n`,
  };
}

function proposeConstrainedAutoFixes(rootPath, bundle = {}, options = {}) {
  const normalized = normalizeFailureBundle(bundle);
  const implicatedFiles = uniqueStrings(options.implicatedFiles || inferImplicatedFiles(rootPath, normalized));
  const proposals = [];
  for (const file of implicatedFiles.slice(0, Number(options.maxFiles || 2) || 2)) {
    const proposal = buildPatchProposalForFile(rootPath, file, normalized);
    if (proposal) proposals.push(proposal);
  }
  return {
    ok: proposals.length > 0,
    rootPath,
    implicatedFiles,
    proposals,
    bundle: normalized,
    generatedAt: nowIso(),
  };
}

function runCommand(command, args, cwd) {
  try {
    const result = spawnSync(command, args, {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
    });
    return {
      ok: result.status === 0,
      code: result.status ?? 1,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      command,
      args,
      cwd,
    };
  } catch (error) {
    return {
      ok: false,
      code: 1,
      stdout: '',
      stderr: String(error?.message || error),
      command,
      args,
      cwd,
    };
  }
}

function validateConstrainedAutoFix(rootPath, options = {}) {
  const uiRoot = path.join(rootPath || process.cwd(), 'ui');
  const npmTest = options.npmTest || (() => runCommand('npm', ['test'], uiRoot));
  const qaSmoke = options.qaSmoke || (() => runCommand('node', ['tests/run-studio-boot-check.mjs'], uiRoot));
  const checks = [
    { id: 'npm-test', label: 'npm test', ...npmTest() },
    { id: 'qa-smoke', label: 'QA smoke', ...qaSmoke() },
  ];
  const ok = checks.every((check) => check.ok);
  return {
    ok,
    checks,
    summary: ok
      ? 'Validation passed before auto-fix application.'
      : 'Validation failed before auto-fix application.',
  };
}

function applyProposal(proposal) {
  if (!proposal || !proposal.absolutePath) return false;
  fs.writeFileSync(proposal.absolutePath, proposal.after, 'utf8');
  return true;
}

function runConstrainedAutoFixExecutor(rootPath, bundle = {}, options = {}) {
  const proposalSet = proposeConstrainedAutoFixes(rootPath, bundle, {
    implicatedFiles: options.implicatedFiles,
    maxFiles: options.maxFiles,
  });
  if (!proposalSet.proposals.length) {
    return {
      ok: true,
      applied: false,
      skipped: true,
      reason: 'No constrained patch proposals were generated.',
      proposals: [],
      validation: null,
      appliedFiles: [],
      generatedAt: nowIso(),
    };
  }

  const validation = typeof options.validate === 'function'
    ? options.validate(proposalSet)
    : (options.validate === false
      ? { ok: true, checks: [], summary: 'Validation skipped by caller.' }
      : validateConstrainedAutoFix(rootPath, options.validation || {}));

  if (!validation.ok) {
    return {
      ok: false,
      applied: false,
      skipped: false,
      reason: validation.summary,
      proposals: proposalSet.proposals,
      validation,
      appliedFiles: [],
      generatedAt: proposalSet.generatedAt,
    };
  }

  const appliedFiles = [];
  for (const proposal of proposalSet.proposals) {
    if (applyProposal(proposal)) {
      appliedFiles.push(proposal.file);
    }
  }

  return {
    ok: true,
    applied: appliedFiles.length > 0,
    skipped: false,
    reason: appliedFiles.length ? 'Constrained auto-fix applied.' : 'No proposed patch was applied.',
    proposals: proposalSet.proposals,
    validation,
    appliedFiles,
    generatedAt: proposalSet.generatedAt,
  };
}

function buildConstrainedAutoFixBundle(snapshot = {}, extras = {}) {
  const criticalErrors = Array.isArray(snapshot.criticalErrors) ? snapshot.criticalErrors : [];
  const failingTestNames = Array.isArray(snapshot.failingTestNames) ? snapshot.failingTestNames : [];
  const rootPath = extras.rootPath || null;
  const changedFiles = uniqueStrings([
    ...(extras.changedFiles || []),
    ...criticalErrors.flatMap((entry) => extractStackPaths(entry.stack || ''))
      .map((file) => {
        if (!rootPath || !file) return file;
        const resolved = resolveRootPath(rootPath, file);
        return normalizeRelativePath(path.relative(rootPath, resolved));
      }),
    ...criticalErrors.map((entry) => String(entry.route || entry.component || entry.stage || '').trim()).filter(Boolean),
  ]);
  return normalizeFailureBundle({
    version: 'ace/constrained-auto-fix.v0',
    createdAt: nowIso(),
    taskId: extras.taskId || snapshot.fixTask?.taskId || null,
    stage: extras.stage || snapshot.fixTask?.stage || 'safe-mode',
    failureClass: extras.failureClass || snapshot.bootHealth?.failureClass || null,
    message: snapshot.reason || criticalErrors[0]?.message || extras.message || 'safe mode failure',
    stack: criticalErrors[0]?.stack || extras.stack || null,
    failingTestNames,
    changedFiles,
    criticalErrors,
    artifactRefs: uniqueStrings([
      ...(extras.artifactRefs || []),
      ...(snapshot.failureHistory?.entries || []).flatMap((entry) => [entry.last_error?.stack || null, entry.failure_key || null]),
    ]),
  });
}

module.exports = {
  buildConstrainedAutoFixBundle,
  buildPatchProposalForFile,
  inferImplicatedFiles,
  normalizeFailureBundle,
  proposeConstrainedAutoFixes,
  runConstrainedAutoFixExecutor,
  validateConstrainedAutoFix,
};
