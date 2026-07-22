const fs = require('fs');
const path = require('path');

const TA_HIRE_REQUESTS_RELATIVE_DIR = path.join('data', 'spatial', 'ta');
const TA_HIRE_REQUESTS_JSON_NAME = 'hire-requests.json';
const TA_HIRE_REQUESTS_MD_NAME = 'hire-requests.md';
const TA_HIRE_REQUESTS_VERSION = 'ace/ta-hire-requests.v1';

const ALLOWED_STATUSES = new Set(['queued', 'in_review', 'fulfilled', 'cancelled', 'blocked']);
const ALLOWED_BLOCKING_LEVELS = new Set(['capacity_risk', 'handoff_risk', 'hard_block', 'advisory']);

function nowIso() {
  return new Date().toISOString();
}

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
}

function normalizeStatus(value = 'queued') {
  const normalized = String(value || '').trim().toLowerCase();
  return ALLOWED_STATUSES.has(normalized) ? normalized : 'queued';
}

function normalizeBlockingLevel(value = 'capacity_risk') {
  const normalized = String(value || '').trim().toLowerCase();
  return ALLOWED_BLOCKING_LEVELS.has(normalized) ? normalized : 'capacity_risk';
}

function ensureTaHireRequestStorage(rootPath) {
  const dir = path.join(rootPath || process.cwd(), TA_HIRE_REQUESTS_RELATIVE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function taHireRequestQueueFilePath(rootPath) {
  return path.join(ensureTaHireRequestStorage(rootPath), TA_HIRE_REQUESTS_JSON_NAME);
}

function taHireRequestQueueMarkdownPath(rootPath) {
  return path.join(ensureTaHireRequestStorage(rootPath), TA_HIRE_REQUESTS_MD_NAME);
}

function createDefaultTaHireRequestQueue() {
  return {
    version: TA_HIRE_REQUESTS_VERSION,
    updatedAt: null,
    entries: [],
  };
}

function normalizeTaHireRequestEntry(entry = {}) {
  const source = entry && typeof entry === 'object' ? entry : {};
  const createdAt = String(source.createdAt || source.queuedAt || nowIso()).trim() || nowIso();
  const requestedRoleId = String(source.requestedRoleId || source.roleId || source.targetRoleId || 'unknown-role').trim() || 'unknown-role';
  const originDeskId = String(source.originDeskId || source.sourceDeskId || source.requestedByDeskId || 'planner').trim() || 'planner';
  const hireRequestId = String(
    source.hireRequestId
    || source.requestId
    || source.id
    || `hire_${originDeskId}_${requestedRoleId}_${Date.parse(createdAt) || Date.now()}`,
  ).trim();
  return {
    hireRequestId,
    originDepartmentId: String(source.originDepartmentId || source.departmentId || 'dept-delivery').trim() || 'dept-delivery',
    originDeskId,
    requestedRoleId,
    reason: String(source.reason || source.summary || `${requestedRoleId} coverage requested.`).trim() || `${requestedRoleId} coverage requested.`,
    urgency: String(source.urgency || 'normal').trim().toLowerCase() || 'normal',
    blockingLevel: normalizeBlockingLevel(source.blockingLevel || source.blocking_level || 'capacity_risk'),
    linkedPlanIds: uniqueStrings(source.linkedPlanIds || source.planIds || source.planId || []),
    linkedTaskIds: uniqueStrings(source.linkedTaskIds || source.taskIds || source.taskId || []),
    status: normalizeStatus(source.status || 'queued'),
    intentId: String(source.intentId || '').trim() || null,
    plannerRunId: String(source.plannerRunId || '').trim() || null,
    planBundleId: String(source.planBundleId || '').trim() || null,
    taskBundleId: String(source.taskBundleId || '').trim() || null,
    staffingRequestId: String(source.staffingRequestId || '').trim() || null,
    qaRequestId: String(source.qaRequestId || '').trim() || null,
    provenance: {
      ...(source.provenance && typeof source.provenance === 'object' ? source.provenance : {}),
      sourceHandoffId: String(source.provenance?.sourceHandoffId || source.sourceHandoffId || '').trim() || null,
      sourceIntentId: String(source.provenance?.sourceIntentId || source.sourceIntentId || source.intentId || '').trim() || null,
      sourceType: String(source.provenance?.sourceType || source.sourceType || '').trim() || null,
      sourceRef: String(source.provenance?.sourceRef || source.sourceRef || '').trim() || null,
      overrideIds: uniqueStrings(source.provenance?.overrideIds || source.overrideIds || []),
    },
    fulfilledCandidate: source.fulfilledCandidate && typeof source.fulfilledCandidate === 'object'
      ? { ...source.fulfilledCandidate }
      : null,
    resolution: source.resolution && typeof source.resolution === 'object' ? { ...source.resolution } : null,
    notes: uniqueStrings(source.notes || []),
    createdAt,
    updatedAt: String(source.updatedAt || '').trim() || createdAt,
    fulfilledAt: String(source.fulfilledAt || '').trim() || null,
    resolvedBy: String(source.resolvedBy || '').trim() || null,
  };
}

function normalizeTaHireRequestQueue(queue = {}) {
  const source = queue && typeof queue === 'object' ? queue : {};
  return {
    version: String(source.version || TA_HIRE_REQUESTS_VERSION).trim() || TA_HIRE_REQUESTS_VERSION,
    updatedAt: String(source.updatedAt || '').trim() || null,
    entries: (Array.isArray(source.entries) ? source.entries : [])
      .map((entry) => normalizeTaHireRequestEntry(entry))
      .filter(Boolean),
  };
}

function summarizeTaHireRequestQueue(queue = {}) {
  const normalized = normalizeTaHireRequestQueue(queue);
  const queued = normalized.entries.filter((entry) => entry.status === 'queued');
  const fulfilled = normalized.entries.filter((entry) => entry.status === 'fulfilled');
  return {
    version: normalized.version,
    generatedAt: nowIso(),
    entryCount: normalized.entries.length,
    queuedCount: queued.length,
    fulfilledCount: fulfilled.length,
    activeCount: normalized.entries.filter((entry) => !['fulfilled', 'cancelled'].includes(entry.status)).length,
    hardBlockCount: normalized.entries.filter((entry) => entry.blockingLevel === 'hard_block').length,
    handoffRiskCount: normalized.entries.filter((entry) => entry.blockingLevel === 'handoff_risk').length,
    latestEntry: normalized.entries[normalized.entries.length - 1] || null,
  };
}

function renderTaHireRequestQueueMarkdown(queue = {}) {
  const normalized = normalizeTaHireRequestQueue(queue);
  const lines = [
    '# TA Hire Requests',
    '',
    'Planner and runtime staffing requests routed to Talent Acquisition.',
    '',
    `Updated: ${normalized.updatedAt || nowIso()}`,
    '',
  ];
  normalized.entries.forEach((entry) => {
    lines.push(`## ${entry.hireRequestId}`);
    lines.push(`- Role: ${entry.requestedRoleId}`);
    lines.push(`- Origin: ${entry.originDepartmentId} / ${entry.originDeskId}`);
    lines.push(`- Status: ${entry.status}`);
    lines.push(`- Blocking: ${entry.blockingLevel}`);
    lines.push(`- Reason: ${entry.reason}`);
    if (entry.fulfilledCandidate) lines.push(`- Fulfilled candidate: ${entry.fulfilledCandidate.name || entry.fulfilledCandidate.id || 'unknown'}`);
    lines.push('');
  });
  if (!normalized.entries.length) lines.push('No TA hire requests recorded.');
  return `${lines.join('\n')}\n`;
}

function readTaHireRequestQueue(rootPath) {
  return normalizeTaHireRequestQueue(readJson(taHireRequestQueueFilePath(rootPath), createDefaultTaHireRequestQueue()));
}

function writeTaHireRequestQueue(rootPath, queue) {
  const normalized = normalizeTaHireRequestQueue({
    ...queue,
    updatedAt: nowIso(),
  });
  const jsonPath = taHireRequestQueueFilePath(rootPath);
  const markdownPath = taHireRequestQueueMarkdownPath(rootPath);
  writeJson(jsonPath, normalized);
  fs.writeFileSync(markdownPath, renderTaHireRequestQueueMarkdown(normalized), 'utf8');
  return { queue: normalized, jsonPath, markdownPath };
}

function upsertTaHireRequestQueueEntry(rootPath, entry = {}) {
  const queue = readTaHireRequestQueue(rootPath);
  const normalizedEntry = normalizeTaHireRequestEntry(entry);
  const entries = [
    ...queue.entries.filter((existing) => existing.hireRequestId !== normalizedEntry.hireRequestId),
    normalizedEntry,
  ];
  return writeTaHireRequestQueue(rootPath, { ...queue, entries });
}

function markTaHireRequestFulfilled(rootPath, update = {}) {
  const hireRequestId = String(update.hireRequestId || update.requestId || '').trim();
  if (!hireRequestId) return null;
  const queue = readTaHireRequestQueue(rootPath);
  const index = queue.entries.findIndex((entry) => entry.hireRequestId === hireRequestId);
  if (index < 0) return null;
  const existing = queue.entries[index];
  const fulfilledAt = nowIso();
  const nextEntry = normalizeTaHireRequestEntry({
    ...existing,
    status: 'fulfilled',
    fulfilledAt,
    updatedAt: fulfilledAt,
    resolvedBy: update.resolvedBy || existing.resolvedBy || 'ta',
    fulfilledCandidate: update.fulfilledCandidate || existing.fulfilledCandidate || null,
    resolution: update.resolution || existing.resolution || { status: 'fulfilled' },
    notes: uniqueStrings([...(existing.notes || []), ...(Array.isArray(update.notes) ? update.notes : [update.notes]).filter(Boolean)]),
  });
  const entries = [...queue.entries];
  entries[index] = nextEntry;
  return writeTaHireRequestQueue(rootPath, { ...queue, entries });
}

module.exports = {
  TA_HIRE_REQUESTS_RELATIVE_DIR,
  TA_HIRE_REQUESTS_JSON_NAME,
  TA_HIRE_REQUESTS_MD_NAME,
  createDefaultTaHireRequestQueue,
  ensureTaHireRequestStorage,
  markTaHireRequestFulfilled,
  normalizeTaHireRequestEntry,
  normalizeTaHireRequestQueue,
  readTaHireRequestQueue,
  summarizeTaHireRequestQueue,
  taHireRequestQueueFilePath,
  taHireRequestQueueMarkdownPath,
  upsertTaHireRequestQueueEntry,
  writeTaHireRequestQueue,
};
