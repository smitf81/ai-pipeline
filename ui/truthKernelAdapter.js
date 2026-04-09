const fs = require('fs');
const path = require('path');

const KINDS = new Set(['input', 'execution', 'artifact']);
const STATUSES = new Set(['healthy', 'degraded', 'blocked', 'orphaned', 'informational']);

function clamp01(value, fallback = 0.5) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function toTimestamp(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeReadJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

function listJsonFiles(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => path.join(dirPath, entry.name))
      .sort((left, right) => left.localeCompare(right));
  } catch (_error) {
    return [];
  }
}

function listDirectories(dirPath, prefix = '') {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && (!prefix || entry.name.startsWith(prefix)))
      .map((entry) => path.join(dirPath, entry.name))
      .sort((left, right) => left.localeCompare(right));
  } catch (_error) {
    return [];
  }
}

function normalizeStatus(value, fallback = 'informational') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'completed' || normalized === 'pass' || normalized === 'ok' || normalized === 'active') return 'healthy';
  if (normalized === 'degraded' || normalized === 'warn' || normalized === 'warning' || normalized === 'offline') return 'degraded';
  if (normalized === 'blocked' || normalized === 'fail' || normalized === 'failed' || normalized === 'error' || normalized === 'timeout') return 'blocked';
  if (STATUSES.has(normalized)) return normalized;
  return fallback;
}

function makeNode(partial = {}) {
  const kind = KINDS.has(partial.kind) ? partial.kind : 'artifact';
  return {
    id: String(partial.id || '').trim(),
    kind,
    timestamp: toTimestamp(partial.timestamp, 0),
    parents: Array.isArray(partial.parents) ? [...new Set(partial.parents.filter(Boolean).map((value) => String(value)))] : [],
    children: Array.isArray(partial.children) ? [...new Set(partial.children.filter(Boolean).map((value) => String(value)))] : [],
    status: normalizeStatus(partial.status, partial.status === 'orphaned' ? 'orphaned' : 'informational'),
    confidence: clamp01(partial.confidence, 0.5),
    weight: clamp01(partial.weight, 0.5),
  };
}

function addNode(registry, partial) {
  const node = makeNode(partial);
  if (!node.id) return null;
  registry.set(node.id, node);
  return node;
}

function linkNodes(registry, parentId, childId) {
  const parent = registry.get(parentId);
  const child = registry.get(childId);
  if (!parent || !child || parent.id === child.id) return;
  parent.children = [...new Set([...parent.children, child.id])];
  child.parents = [...new Set([...child.parents, parent.id])];
}

function finalizeNodes(registry) {
  return [...registry.values()]
    .map((node) => {
      const relationshipCount = node.parents.length + node.children.length;
      return {
        ...node,
        status: relationshipCount === 0 && node.status !== 'blocked' ? 'orphaned' : node.status,
      };
    })
    .sort((left, right) => {
      if (left.timestamp !== right.timestamp) return left.timestamp - right.timestamp;
      return left.id.localeCompare(right.id);
    });
}

function collectIntakeNodes(registry, workspace = {}, intentByCanonicalId = new Map()) {
  const records = Array.isArray(workspace?.studio?.intake?.records) ? workspace.studio.intake.records : [];
  records.forEach((record, index) => {
    const intakeId = String(record?.id || '').trim();
    if (!intakeId) return;
    addNode(registry, {
      id: intakeId,
      kind: 'input',
      timestamp: record?.createdAt || record?.updatedAt || Date.now() + index,
      status: record?.status || 'informational',
      confidence: record?.intentExtraction?.confidence ?? 0.6,
      weight: 0.45,
    });
    const canonicalIntentId = String(record?.intentExtraction?.canonicalIntentId || '').trim();
    if (canonicalIntentId && intentByCanonicalId.has(canonicalIntentId)) {
      linkNodes(registry, intakeId, intentByCanonicalId.get(canonicalIntentId));
    }
  });
}

function collectIntentNodes(registry, workspace = {}) {
  const records = Array.isArray(workspace?.intentState?.registry?.records) ? workspace.intentState.registry.records : [];
  const intentByCanonicalId = new Map();
  const intentBySourceNodeId = new Map();
  records.forEach((record, index) => {
    const intentId = String(record?.id || '').trim();
    if (!intentId) return;
    addNode(registry, {
      id: intentId,
      kind: 'input',
      timestamp: record?.updatedAt || record?.createdAt || Date.now() + index,
      status: record?.status || 'informational',
      confidence: record?.confidence ?? record?.audit?.confidence ?? 0.6,
      weight: 0.5,
    });
    const canonicalIntentId = String(record?.canonicalIntentId || '').trim();
    const sourceNodeId = String(record?.sourceNodeId || '').trim();
    if (canonicalIntentId) intentByCanonicalId.set(canonicalIntentId, intentId);
    if (sourceNodeId) intentBySourceNodeId.set(sourceNodeId, intentId);
  });
  return { intentByCanonicalId, intentBySourceNodeId };
}

function collectHandoffNodes(registry, workspace = {}, intentBySourceNodeId = new Map()) {
  const handoffs = [];
  const current = workspace?.studio?.handoffs?.contextToPlanner;
  if (current) handoffs.push(current);
  if (Array.isArray(workspace?.studio?.handoffs?.history)) {
    handoffs.push(...workspace.studio.handoffs.history);
  }
  handoffs.forEach((handoff, index) => {
    const handoffId = String(handoff?.id || '').trim();
    if (!handoffId) return;
    addNode(registry, {
      id: handoffId,
      kind: 'artifact',
      timestamp: handoff?.updatedAt || handoff?.createdAt || Date.now() + index,
      status: handoff?.status || 'informational',
      confidence: handoff?.confidence ?? 0.6,
      weight: 0.6,
    });
    const sourceNodeId = String(handoff?.sourceNodeId || '').trim();
    if (sourceNodeId && intentBySourceNodeId.has(sourceNodeId)) {
      linkNodes(registry, intentBySourceNodeId.get(sourceNodeId), handoffId);
    }
  });
}

function collectContextManagerRuns(registry, rootPath, intentBySourceNodeId = new Map()) {
  const runsDir = path.join(rootPath, 'data', 'spatial', 'agent-runs', 'context-manager');
  listJsonFiles(runsDir).forEach((filePath) => {
    const run = safeReadJson(filePath, null);
    const runId = String(run?.id || '').trim();
    if (!runId) return;
    addNode(registry, {
      id: runId,
      kind: 'execution',
      timestamp: run?.completedAt || run?.startedAt || run?.createdAt,
      status: run?.status || run?.outcome || 'informational',
      confidence: run?.report?.confidence ?? run?.extractedIntent?.audit?.confidence ?? 0.6,
      weight: 0.65,
    });
    const sourceNodeId = String(run?.sourceNodeId || run?.handoff?.sourceNodeId || '').trim();
    if (sourceNodeId && intentBySourceNodeId.has(sourceNodeId)) {
      linkNodes(registry, intentBySourceNodeId.get(sourceNodeId), runId);
    }
    const handoffId = String(run?.handoffId || run?.handoff?.id || '').trim();
    if (handoffId) {
      if (!registry.has(handoffId) && run?.handoff) {
        addNode(registry, {
          id: handoffId,
          kind: 'artifact',
          timestamp: run?.handoff?.updatedAt || run?.handoff?.createdAt || run?.completedAt || run?.startedAt,
          status: run?.handoff?.status || 'informational',
          confidence: run?.handoff?.confidence ?? run?.report?.confidence ?? 0.6,
          weight: 0.6,
        });
      }
      linkNodes(registry, runId, handoffId);
    }
  });
}

function collectQaRuns(registry, rootPath) {
  const qaDir = path.join(rootPath, 'data', 'spatial', 'qa');
  listDirectories(qaDir, 'qa_').forEach((runDir) => {
    const runtimeFile = path.join(runDir, 'runtime.json');
    const payload = safeReadJson(runtimeFile, null);
    const runtime = payload?.runtime || payload;
    const runId = String(runtime?.id || path.basename(runDir)).trim();
    if (!runId) return;
    const failures = Array.isArray(runtime?.failures) ? runtime.failures.length : 0;
    const findings = Array.isArray(runtime?.desks) ? runtime.desks.reduce((count, desk) => count + (Array.isArray(desk?.failures) ? desk.failures.length : 0), 0) : 0;
    addNode(registry, {
      id: runId,
      kind: 'execution',
      timestamp: runtime?.finishedAt || runtime?.completedAt || payload?.capturedAt || runtime?.startedAt,
      status: failures > 0 || findings > 0 ? 'blocked' : (runtime?.status || 'healthy'),
      confidence: 0.7,
      weight: 0.55,
    });
  });
}

function collectInvestigations(registry, rootPath) {
  const investigations = safeReadJson(path.join(rootPath, 'data', 'spatial', 'qa', 'investigations.json'), []);
  (Array.isArray(investigations) ? investigations : []).forEach((entry) => {
    const investigationId = String(entry?.id || '').trim();
    if (!investigationId || registry.has(investigationId)) return;
    addNode(registry, {
      id: investigationId,
      kind: 'artifact',
      timestamp: entry?.last_seen_at || entry?.created_at,
      status: entry?.status === 'open' ? 'degraded' : 'healthy',
      confidence: 0.65,
      weight: 0.5,
    });
  });
}

function collectCtoDiagnostics(registry, rootPath) {
  const diagnostics = safeReadJson(path.join(rootPath, 'data', 'spatial', 'cto-diagnostics.json'), {});
  const entries = Array.isArray(diagnostics?.entries) ? diagnostics.entries : [];
  entries.forEach((entry) => {
    const entryId = String(entry?.id || '').trim();
    if (!entryId) return;
    addNode(registry, {
      id: entryId,
      kind: 'artifact',
      timestamp: entry?.timestamp,
      status: normalizeStatus(entry?.status, 'degraded'),
      confidence: 0.55,
      weight: 0.4,
    });
  });
}

function buildTruthKernelPayload({ rootPath, workspace } = {}) {
  const resolvedRoot = rootPath || process.cwd();
  const registry = new Map();
  const normalizedWorkspace = workspace || {};
  const { intentByCanonicalId, intentBySourceNodeId } = collectIntentNodes(registry, normalizedWorkspace);
  collectIntakeNodes(registry, normalizedWorkspace, intentByCanonicalId);
  collectHandoffNodes(registry, normalizedWorkspace, intentBySourceNodeId);
  collectContextManagerRuns(registry, resolvedRoot, intentBySourceNodeId);
  collectQaRuns(registry, resolvedRoot);
  collectInvestigations(registry, resolvedRoot);
  collectCtoDiagnostics(registry, resolvedRoot);
  const nodes = finalizeNodes(registry);
  return {
    generatedAt: new Date().toISOString(),
    nodeCount: nodes.length,
    nodes,
  };
}

module.exports = {
  buildTruthKernelPayload,
};
