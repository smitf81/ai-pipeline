const fs = require('fs');
const path = require('path');

const TEST_NAME_PATTERN = /makeTest\(\s*['"]([^'"]+)['"]/g;
const DEFAULT_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const QA_MODULE_OWNERS = {
  plannerQA: { deskId: 'planner', deskLabel: 'Planner' },
  runnerQA: { deskId: 'runner', deskLabel: 'Runner' },
  taQA: { deskId: 'ta', deskLabel: 'TA' },
  uiQA: { deskId: 'ui', deskLabel: 'UI' },
};
const DEPRECATED_HINT_PATTERN = /@deprecated\b|deprecated\s*[:=]\s*true\b|deprecated test/i;
const MISSING_DEPENDENCY_PATTERNS = [
  /missing endpoint/i,
  /missing route/i,
  /missing file/i,
  /file not found/i,
  /module not found/i,
  /command missing/i,
  /unknown module/i,
  /not installed/i,
  /not found/i,
  /dependency/i,
];

function normalizeSlashes(value) {
  return String(value || '').replace(/\\/g, '/');
}

function relativeToRoot(rootPath, targetPath) {
  return normalizeSlashes(path.relative(rootPath, targetPath)).replace(/^\.\/+/, '');
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(readText(filePath));
  } catch {
    return fallback;
  }
}

function parseTestNames(sourceText) {
  const names = [];
  TEST_NAME_PATTERN.lastIndex = 0;
  let match = TEST_NAME_PATTERN.exec(sourceText);
  while (match) {
    names.push(String(match[1] || '').trim());
    match = TEST_NAME_PATTERN.exec(sourceText);
  }
  return names.filter(Boolean);
}

function normalizeDeskLabel(deskId) {
  const value = String(deskId || '').trim();
  if (!value) return 'Unknown desk';
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function resolveOwnerForModule(moduleName) {
  return QA_MODULE_OWNERS[moduleName] || null;
}

function findDeclarationIndex(lines, testName) {
  const needleVariants = [
    `makeTest('${testName}'`,
    `makeTest("${testName}"`,
  ];
  return lines.findIndex((line) => needleVariants.some((needle) => line.includes(needle)));
}

function detectDeprecatedTest(sourceText, testName) {
  if (String(testName || '').toLowerCase().includes('deprecated')) return true;
  const lines = String(sourceText || '').split(/\r?\n/);
  const declarationIndex = findDeclarationIndex(lines, testName);
  if (declarationIndex === -1) {
    return DEPRECATED_HINT_PATTERN.test(sourceText);
  }
  const start = Math.max(0, declarationIndex - 4);
  const block = lines.slice(start, declarationIndex + 1).join('\n');
  return DEPRECATED_HINT_PATTERN.test(block);
}

function parseFinishedAt(report = null) {
  const values = [
    report?.finishedAt,
    report?.updatedAt,
    report?.createdAt,
  ];
  for (const value of values) {
    const parsed = Date.parse(String(value || '').trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeRuntimeTestName(entry = {}) {
  return String(entry.name || entry.test || entry.id || '').trim();
}

function buildRuntimeLookup(structuredReport = null) {
  const lookup = new Map();
  for (const deskReport of Array.isArray(structuredReport?.desks) ? structuredReport.desks : []) {
    const deskId = String(deskReport?.desk || '').trim();
    if (!deskId) continue;
    for (const test of Array.isArray(deskReport?.tests) ? deskReport.tests : []) {
      const testName = normalizeRuntimeTestName(test);
      if (!testName) continue;
      lookup.set(`${deskId}:${testName}`, {
        deskId,
        testName,
        status: String(test.status || '').trim() || 'missing',
        reason: String(test.reason || '').trim() || null,
        qualityCard: test.qualityCard || null,
      });
    }
  }
  return lookup;
}

function buildRuntimeNameLookup(structuredReport = null) {
  const lookup = new Map();
  for (const deskReport of Array.isArray(structuredReport?.desks) ? structuredReport.desks : []) {
    const deskId = String(deskReport?.desk || '').trim();
    if (!deskId) continue;
    for (const test of Array.isArray(deskReport?.tests) ? deskReport.tests : []) {
      const testName = normalizeRuntimeTestName(test);
      if (!testName) continue;
      if (!lookup.has(testName)) {
        lookup.set(testName, []);
      }
      lookup.get(testName).push({
        deskId,
        testName,
        status: String(test.status || '').trim() || 'missing',
        reason: String(test.reason || '').trim() || null,
        qualityCard: test.qualityCard || null,
      });
    }
  }
  return lookup;
}

function pickUniqueRuntimeTest(testCandidates = []) {
  return Array.isArray(testCandidates) && testCandidates.length === 1 ? testCandidates[0] : null;
}

function classifyValidity({
  ownerKnown,
  deprecated,
  runtimeTest,
  reportAgeMs,
  staleAfterMs,
}) {
  if (!ownerKnown) {
    return {
      validityClass: 'unknown_owner',
      validityReason: 'Owner is not mapped to a canonical QA desk.',
    };
  }
  if (deprecated) {
    return {
      validityClass: 'deprecated',
      validityReason: 'Test source is marked deprecated.',
    };
  }

  const runtimeStatus = String(runtimeTest?.status || '').trim().toLowerCase();
  const runtimeReason = String(runtimeTest?.reason || runtimeTest?.qualityCard?.validation?.summary || '').trim();

  if (MISSING_DEPENDENCY_PATTERNS.some((pattern) => pattern.test(runtimeReason))) {
    return {
      validityClass: 'missing_dependency',
      validityReason: runtimeReason || 'Missing dependency reported by the latest runtime evidence.',
    };
  }

  if (reportAgeMs == null || reportAgeMs > staleAfterMs || !runtimeTest) {
    return {
      validityClass: 'stale_target',
      validityReason: runtimeTest
        ? 'Latest runtime evidence is stale.'
        : 'No runtime execution is recorded in the latest canonical report.',
    };
  }

  if (runtimeStatus === 'pass') {
    return {
      validityClass: 'executable',
      validityReason: 'Current runtime evidence is fresh and passing.',
    };
  }

  if (runtimeStatus === 'fail') {
    return {
      validityClass: 'stale_target',
      validityReason: runtimeReason || 'Latest runtime evidence failed.',
    };
  }

  return {
    validityClass: 'stale_target',
    validityReason: runtimeReason || 'Runtime evidence is incomplete.',
  };
}

function summarizeQATestRegistry(testRegistry = null) {
  const entries = Array.isArray(testRegistry)
    ? testRegistry
    : Array.isArray(testRegistry?.entries)
      ? testRegistry.entries
      : [];
  return entries.reduce((summary, entry) => {
    summary.total += 1;
    const validityClass = String(entry?.validityClass || 'stale_target').trim();
    if (validityClass === 'executable') summary.executable += 1;
    else if (validityClass === 'missing_dependency') summary.missingDependency += 1;
    else if (validityClass === 'stale_target') summary.staleTarget += 1;
    else if (validityClass === 'deprecated') summary.deprecated += 1;
    else if (validityClass === 'unknown_owner') summary.unknownOwner += 1;
    else summary.staleTarget += 1;
    return summary;
  }, {
    total: 0,
    executable: 0,
    missingDependency: 0,
    staleTarget: 0,
    deprecated: 0,
    unknownOwner: 0,
  });
}

function buildQATestRegistry({
  rootPath = path.join(__dirname, '..'),
  structuredReport = null,
  staleAfterMs = DEFAULT_STALE_AFTER_MS,
  now = Date.now(),
} = {}) {
  const resolvedRoot = path.resolve(rootPath || path.join(__dirname, '..'));
  const desksDir = path.join(resolvedRoot, 'qa', 'desks');
  const report = structuredReport || readJsonSafe(path.join(resolvedRoot, 'data', 'spatial', 'qa', 'structured', 'latest.json'), null);
  const reportFinishedAtMs = parseFinishedAt(report);
  const runtimeLookup = buildRuntimeLookup(report);
  const runtimeNameLookup = buildRuntimeNameLookup(report);
  const entries = [];

  if (fs.existsSync(desksDir)) {
    for (const entry of fs.readdirSync(desksDir, { withFileTypes: true })) {
      if (!entry.isFile() || !/QA\.js$/i.test(entry.name)) continue;
      const modulePath = path.join(desksDir, entry.name);
      const sourceText = readText(modulePath);
      const testNames = parseTestNames(sourceText);
      const moduleName = path.basename(entry.name, path.extname(entry.name));
      const owner = resolveOwnerForModule(moduleName);
      const moduleRelativePath = relativeToRoot(resolvedRoot, modulePath);
      const reportRelativePath = 'data/spatial/qa/structured/latest.json';
      const ownerKnown = Boolean(owner);
      const reportAgeMs = reportFinishedAtMs == null ? null : Math.max(0, now - reportFinishedAtMs);

      for (const testName of testNames) {
        const runtimeTest = ownerKnown
          ? runtimeLookup.get(`${owner.deskId}:${testName}`) || null
          : pickUniqueRuntimeTest(runtimeNameLookup.get(testName));
        const deprecated = detectDeprecatedTest(sourceText, testName);
        const validity = classifyValidity({
          ownerKnown,
          deprecated,
          runtimeTest,
          reportAgeMs,
          staleAfterMs,
        });
        const lastExecutionAt = runtimeTest
          ? (runtimeTest.qualityCard?.updatedAt
            || report?.finishedAt
            || runtimeTest?.updatedAt
            || report?.updatedAt
            || report?.createdAt
            || null)
          : null;
        entries.push({
          id: `${owner?.deskId || moduleName}.${testName}`,
          deskId: owner?.deskId || null,
          deskLabel: owner?.deskLabel || normalizeDeskLabel(owner?.deskId || moduleName),
          testId: testName,
          testName,
          owner: owner ? {
            kind: 'desk',
            id: owner.deskId,
            label: owner.deskLabel,
            module: moduleRelativePath,
          } : {
            kind: 'unknown',
            id: null,
            label: 'Unknown owner',
            module: moduleRelativePath,
          },
          source: {
            kind: 'module',
            modulePath: moduleRelativePath,
            runtimePath: reportRelativePath,
            runtimeTestPath: runtimeTest ? `${runtimeTest.deskId}:${runtimeTest.testName}` : null,
          },
          currentStatus: runtimeTest?.status || 'missing',
          lastExecutionAt,
          runtimeReason: runtimeTest?.reason || null,
          validityClass: validity.validityClass,
          validityReason: validity.validityReason,
          deprecated,
          runtimeTest: runtimeTest ? {
            status: runtimeTest.status,
            reason: runtimeTest.reason,
            qualityCard: runtimeTest.qualityCard || null,
          } : null,
          reportFinishedAt: report?.finishedAt || null,
        });
      }
    }
  }

  entries.sort((left, right) => {
    const ownerLeft = String(left.owner?.id || left.deskId || '').localeCompare(String(right.owner?.id || right.deskId || ''));
    if (ownerLeft !== 0) return ownerLeft;
    return String(left.testId || left.testName || '').localeCompare(String(right.testId || right.testName || ''));
  });

  return {
    schema: 'qa.test-registry.v1',
    generatedAt: new Date(now).toISOString(),
    reportFinishedAt: report?.finishedAt || null,
    entries,
    summary: summarizeQATestRegistry(entries),
  };
}

module.exports = {
  buildQATestRegistry,
  summarizeQATestRegistry,
};
