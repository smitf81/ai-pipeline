const fs = require('fs');
const path = require('path');

const BEHAVIORAL_PREFIXES = [
  'ui/',
  'qa/',
  'ta/',
  'modules/',
  'connectors/',
  'runtime/',
  'agents/',
  'legacy/',
  'brain/emergence/',
];

const VOLATILE_KEYS = new Set([
  'updatedAt',
  'updated_at',
  'lastEvaluatedAt',
  'lastTickAt',
  'freshAt',
  'generatedAt',
  'createdAt',
  'timestamp',
  'observedAt',
]);

function normalizeWorkspacePath(value = '') {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/')
    .trim();
}

function classifyWorkspacePath(value = '') {
  const normalized = normalizeWorkspacePath(value);
  if (!normalized) {
    return { bucket: 'unknown', label: 'unknown', reason: 'empty path' };
  }
  if (normalized.startsWith('work/tasks/')) {
    return { bucket: 'task-artifact', label: 'task artifact', reason: 'generated task folder output' };
  }
  if (normalized.startsWith('brain/context/')) {
    return { bucket: 'operational', label: 'operational memory', reason: 'planner and automation context' };
  }
  if (normalized.startsWith('data/spatial/')) {
    return { bucket: 'generated', label: 'generated snapshot', reason: 'runtime or state snapshot output' };
  }
  if (BEHAVIORAL_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return { bucket: 'behavioral', label: 'behavioral code', reason: 'source or canonical architecture input' };
  }
  if (normalized === 'README.md' || normalized === 'README_CORE.md' || normalized === 'AGENTS.md' || normalized === 'targets.json' || normalized === 'projects.json') {
    return { bucket: 'behavioral', label: 'behavioral docs', reason: 'canonical repo guidance or config' };
  }
  return { bucket: 'support', label: 'support file', reason: 'adjacent supporting file' };
}

function collectPathBuckets(values = []) {
  return (Array.isArray(values) ? values : []).reduce((accumulator, value) => {
    const normalized = normalizeWorkspacePath(value);
    if (!normalized) return accumulator;
    const classification = classifyWorkspacePath(normalized);
    accumulator.total += 1;
    if (!accumulator[classification.bucket]) {
      accumulator[classification.bucket] = [];
    }
    accumulator[classification.bucket].push(normalized);
    return accumulator;
  }, {
    total: 0,
    behavioral: [],
    operational: [],
    generated: [],
    'task-artifact': [],
    support: [],
    unknown: [],
  });
}

function pruneVolatileKeys(value, ignoredKeys = VOLATILE_KEYS) {
  const ignored = ignoredKeys instanceof Set ? ignoredKeys : new Set(Array.isArray(ignoredKeys) ? ignoredKeys : []);
  if (Array.isArray(value)) {
    return value.map((entry) => pruneVolatileKeys(entry, ignored));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.keys(value)
    .sort()
    .reduce((accumulator, key) => {
      if (ignored.has(key)) return accumulator;
      accumulator[key] = pruneVolatileKeys(value[key], ignored);
      return accumulator;
    }, {});
}

function stableJsonStringify(value, ignoredKeys = VOLATILE_KEYS) {
  return `${JSON.stringify(pruneVolatileKeys(value, ignoredKeys), null, 2)}\n`;
}

function writeTextIfChanged(filePath, nextText = '') {
  const normalized = String(nextText ?? '');
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  if (current === normalized) {
    return false;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, normalized, 'utf8');
  return true;
}

function writeJsonIfChanged(filePath, payload = {}, options = {}) {
  const ignoredKeys = options.ignoreKeys ? new Set(options.ignoreKeys) : null;
  const nextText = ignoredKeys ? stableJsonStringify(payload, ignoredKeys) : `${JSON.stringify(payload, null, 2)}\n`;
  if (fs.existsSync(filePath)) {
    try {
      const current = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const currentText = ignoredKeys ? stableJsonStringify(current, ignoredKeys) : `${JSON.stringify(current, null, 2)}\n`;
      if (currentText === nextText) {
        return false;
      }
    } catch {
      // Fall through and rewrite if the existing file cannot be parsed.
    }
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, nextText, 'utf8');
  return true;
}

function formatPathBucketSummary(values = []) {
  const buckets = collectPathBuckets(values);
  return {
    total: buckets.total,
    behavioral: buckets.behavioral.length,
    operational: buckets.operational.length,
    generated: buckets.generated.length,
    taskArtifacts: buckets['task-artifact'].length,
    support: buckets.support.length,
    unknown: buckets.unknown.length,
    buckets,
  };
}

module.exports = {
  collectPathBuckets,
  classifyWorkspacePath,
  formatPathBucketSummary,
  normalizeWorkspacePath,
  pruneVolatileKeys,
  stableJsonStringify,
  writeJsonIfChanged,
  writeTextIfChanged,
};
