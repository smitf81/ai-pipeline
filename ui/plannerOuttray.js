const fs = require('fs');
const path = require('path');

const PLANNER_OUTTRAY_RELATIVE_DIR = path.join('data', 'spatial', 'planner');
const PLANNER_OUTTRAY_QUEUE_JSON_NAME = 'planner-outtray.json';
const PLANNER_OUTTRAY_QUEUE_MD_NAME = 'planner-outtray.md';

const ALLOWED_OUTTRAY_STATUSES = new Set([
  'drafting',
  'ready_for_handoff',
  'deposited',
  'collected',
  'under_review',
  'accepted',
  'returned_with_findings',
  'closed',
]);

const DEFAULT_OUTTRAY_LANES = [
  {
    laneId: 'qa',
    laneLabel: 'pending QA review',
    targetDesk: 'qa-lead',
    targetRole: 'QA Lead',
  },
  {
    laneId: 'archival',
    laneLabel: 'pending archival',
    targetDesk: 'archivist',
    targetRole: 'Archivist',
  },
  {
    laneId: 'execution',
    laneLabel: 'pending execution planning',
    targetDesk: 'executor',
    targetRole: 'Executor',
  },
  {
    laneId: 'cto',
    laneLabel: 'pending CTO review',
    targetDesk: 'cto',
    targetRole: 'CTO',
  },
  {
    laneId: 'context',
    laneLabel: 'pending context writeback',
    targetDesk: 'context-manager',
    targetRole: 'Context Manager',
  },
];

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

function normalizeOuttrayStatus(value = 'deposited') {
  const normalized = String(value || '').trim().toLowerCase();
  return ALLOWED_OUTTRAY_STATUSES.has(normalized) ? normalized : 'deposited';
}

function ensurePlannerOuttrayStorage(rootPath) {
  const dir = path.join(rootPath || process.cwd(), PLANNER_OUTTRAY_RELATIVE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function plannerOuttrayQueueFilePath(rootPath) {
  return path.join(ensurePlannerOuttrayStorage(rootPath), PLANNER_OUTTRAY_QUEUE_JSON_NAME);
}

function plannerOuttrayQueueMarkdownPath(rootPath) {
  return path.join(ensurePlannerOuttrayStorage(rootPath), PLANNER_OUTTRAY_QUEUE_MD_NAME);
}

function createDefaultPlannerOuttrayQueue() {
  return {
    version: '1',
    updatedAt: null,
    entries: [],
  };
}

function normalizePlannerOuttrayItem(item = {}, index = 0) {
  const source = item && typeof item === 'object' ? item : {};
  const createdAt = String(source.createdAt || nowIso()).trim() || nowIso();
  return {
    laneId: String(source.laneId || source.handoffLaneId || `lane_${index + 1}`).trim() || `lane_${index + 1}`,
    laneLabel: String(source.laneLabel || source.label || source.summary || 'Planner outtray lane').trim() || 'Planner outtray lane',
    targetDesk: String(source.targetDesk || 'planner').trim() || 'planner',
    targetRole: String(source.targetRole || 'Planner').trim() || 'Planner',
    summary: String(source.summary || source.reason || source.laneLabel || 'Planner handoff lane').trim() || 'Planner handoff lane',
    status: normalizeOuttrayStatus(source.status || 'ready_for_handoff'),
    required: Boolean(source.required !== false),
    collectedAt: String(source.collectedAt || '').trim() || null,
    collectedBy: String(source.collectedBy || '').trim() || null,
    reviewedAt: String(source.reviewedAt || '').trim() || null,
    reviewedBy: String(source.reviewedBy || '').trim() || null,
    findings: Array.isArray(source.findings) ? source.findings.map((finding) => String(finding || '').trim()).filter(Boolean) : [],
    notes: uniqueStrings(source.notes || []),
    artifactRefs: uniqueStrings(source.artifactRefs || source.artifactRef || []),
    provenance: {
      ...(source.provenance && typeof source.provenance === 'object' ? source.provenance : {}),
      sourceHandoffId: source.provenance?.sourceHandoffId || null,
      sourceIntentId: source.provenance?.sourceIntentId || null,
      sourceType: source.provenance?.sourceType || null,
      sourceRef: source.provenance?.sourceRef || null,
      anchorRefs: uniqueStrings(source.provenance?.anchorRefs || []),
      overrideIds: uniqueStrings(source.provenance?.overrideIds || []),
    },
    queuedAt: createdAt,
    updatedAt: String(source.updatedAt || '').trim() || createdAt,
  };
}

function derivePlannerOuttrayStatus(items = [], fallback = 'deposited') {
  const statuses = (Array.isArray(items) ? items : []).map((item) => normalizeOuttrayStatus(item.status));
  if (!statuses.length) return normalizeOuttrayStatus(fallback);
  if (statuses.every((status) => status === 'closed')) return 'closed';
  if (statuses.some((status) => status === 'returned_with_findings')) return 'returned_with_findings';
  if (statuses.some((status) => status === 'under_review')) return 'under_review';
  if (statuses.some((status) => status === 'accepted')) return 'accepted';
  if (statuses.some((status) => status === 'collected')) return 'collected';
  if (statuses.some((status) => status === 'ready_for_handoff')) return 'ready_for_handoff';
  return normalizeOuttrayStatus(fallback);
}

function normalizePlannerOuttrayEntry(entry = {}) {
  const source = entry && typeof entry === 'object' ? entry : {};
  const createdAt = String(source.createdAt || nowIso()).trim() || nowIso();
  const items = Array.isArray(source.items)
    ? source.items
    : (Array.isArray(source.handoffItems) ? source.handoffItems : DEFAULT_OUTTRAY_LANES);
  const normalizedItems = items.map((item, index) => normalizePlannerOuttrayItem(item, index)).filter(Boolean);
  const queueKey = String(
    source.queueKey
    || source.plannerRunId
    || source.planBundleId
    || source.intentId
    || normalizedItems[0]?.provenance?.sourceHandoffId
    || `planner_outtray_${createdAt}`,
  ).trim() || `planner_outtray_${createdAt}`;
  const explicitStatus = String(source.status || '').trim().toLowerCase();
  const explicitHandoffState = String(source.handoffState || '').trim().toLowerCase();
  return {
    queueKey,
    plannerRunId: String(source.plannerRunId || '').trim() || null,
    planBundleId: String(source.planBundleId || '').trim() || null,
    taskBundleId: String(source.taskBundleId || '').trim() || null,
    intentId: String(source.intentId || '').trim() || null,
    status: ALLOWED_OUTTRAY_STATUSES.has(explicitStatus)
      ? explicitStatus
      : derivePlannerOuttrayStatus(normalizedItems, 'deposited'),
    handoffState: ALLOWED_OUTTRAY_STATUSES.has(explicitHandoffState)
      ? explicitHandoffState
      : (ALLOWED_OUTTRAY_STATUSES.has(explicitStatus) ? explicitStatus : derivePlannerOuttrayStatus(normalizedItems, 'deposited')),
    summary: String(source.summary || 'Planner handoff deposited for downstream collection.').trim(),
    targetDesk: String(source.targetDesk || 'planner-outtray').trim() || 'planner-outtray',
    targetRole: String(source.targetRole || 'Planner Outtray').trim() || 'Planner Outtray',
    requestedBy: String(source.requestedBy || source.createdBy || 'planner').trim() || 'planner',
    createdBy: String(source.createdBy || 'planner').trim() || 'planner',
    createdAt,
    updatedAt: String(source.updatedAt || '').trim() || createdAt,
    artifactRefs: uniqueStrings(source.artifactRefs || []),
    provenance: {
      ...(source.provenance && typeof source.provenance === 'object' ? source.provenance : {}),
      sourceHandoffId: source.provenance?.sourceHandoffId || null,
      sourceIntentId: source.provenance?.sourceIntentId || source.intentId || null,
      sourceType: source.provenance?.sourceType || null,
      sourceRef: source.provenance?.sourceRef || null,
      anchorRefs: uniqueStrings(source.provenance?.anchorRefs || []),
      overrideIds: uniqueStrings(source.provenance?.overrideIds || []),
    },
    items: normalizedItems,
  };
}

function normalizePlannerOuttrayQueue(queue = {}) {
  const source = queue && typeof queue === 'object' ? queue : {};
  const entries = Array.isArray(source.entries) ? source.entries : [];
  return {
    version: String(source.version || '1').trim() || '1',
    updatedAt: String(source.updatedAt || '').trim() || null,
    entries: entries.map((entry) => normalizePlannerOuttrayEntry(entry)).filter(Boolean),
  };
}

function renderPlannerOuttrayMarkdown(queue = {}) {
  const entries = Array.isArray(queue.entries) ? queue.entries : [];
  const lines = [
    '# Planner Outtray',
    '',
    'Planner handoffs deposited for downstream desks to collect asynchronously.',
    '',
    `Updated: ${queue.updatedAt || nowIso()}`,
    '',
  ];
  entries.forEach((entry) => {
    lines.push(`## ${entry.queueKey}`);
    lines.push(`- Planner run: ${entry.plannerRunId || 'unknown'}`);
    lines.push(`- Plan bundle: ${entry.planBundleId || 'unknown'}`);
    lines.push(`- Task bundle: ${entry.taskBundleId || 'unknown'}`);
    lines.push(`- Intent: ${entry.intentId || 'unknown'}`);
    lines.push(`- Status: ${entry.status}`);
    lines.push(`- Handoff state: ${entry.handoffState}`);
    lines.push(`- Summary: ${entry.summary}`);
    (Array.isArray(entry.items) ? entry.items : []).forEach((item) => {
      lines.push(`  - ${item.laneId}: ${item.status} -> ${item.targetDesk} / ${item.targetRole}`);
    });
    lines.push('');
  });
  return `${lines.join('\n').trim()}\n`;
}

function readPlannerOuttray(rootPath) {
  const queuePath = plannerOuttrayQueueFilePath(rootPath);
  return normalizePlannerOuttrayQueue(readJson(queuePath, createDefaultPlannerOuttrayQueue()));
}

function summarizePlannerOuttray(queue = {}) {
  const entries = Array.isArray(queue.entries) ? queue.entries : [];
  const flattenedItems = entries.flatMap((entry) => Array.isArray(entry.items) ? entry.items : []);
  return {
    updatedAt: queue.updatedAt || null,
    entryCount: entries.length,
    readyCount: entries.filter((entry) => entry.status === 'ready_for_handoff').length,
    depositedCount: entries.filter((entry) => entry.status === 'deposited').length,
    collectedCount: entries.filter((entry) => entry.status === 'collected').length,
    underReviewCount: entries.filter((entry) => entry.status === 'under_review').length,
    acceptedCount: entries.filter((entry) => entry.status === 'accepted').length,
    returnedWithFindingsCount: entries.filter((entry) => entry.status === 'returned_with_findings').length,
    closedCount: entries.filter((entry) => entry.status === 'closed').length,
    laneCount: flattenedItems.length,
    pendingLaneCount: flattenedItems.filter((item) => ['ready_for_handoff', 'deposited'].includes(item.status)).length,
    latestEntry: entries[0] || null,
    status: entries[0]?.status || (entries.length ? 'mixed' : 'empty'),
  };
}

function writePlannerOuttray(rootPath, queue = {}) {
  const normalizedQueue = normalizePlannerOuttrayQueue(queue);
  const queuePath = plannerOuttrayQueueFilePath(rootPath);
  const markdownPath = plannerOuttrayQueueMarkdownPath(rootPath);
  writeJson(queuePath, normalizedQueue);
  fs.writeFileSync(markdownPath, renderPlannerOuttrayMarkdown(normalizedQueue), 'utf8');
  return {
    location: 'queue',
    jsonPath: queuePath,
    markdownPath,
    queue: normalizedQueue,
  };
}

function upsertPlannerOuttrayEntry(rootPath, entry = {}) {
  const existing = readPlannerOuttray(rootPath);
  const normalizedEntry = normalizePlannerOuttrayEntry(entry);
  const queueKey = normalizedEntry.queueKey;
  const nextEntries = [...existing.entries];
  const existingIndex = nextEntries.findIndex((item) => (
    item.queueKey === queueKey
    || (normalizedEntry.plannerRunId && item.plannerRunId === normalizedEntry.plannerRunId)
    || (normalizedEntry.planBundleId && item.planBundleId === normalizedEntry.planBundleId)
    || (normalizedEntry.intentId && item.intentId === normalizedEntry.intentId)
  ));
  if (existingIndex >= 0) {
    nextEntries[existingIndex] = {
      ...nextEntries[existingIndex],
      ...normalizedEntry,
      queueKey: nextEntries[existingIndex].queueKey || normalizedEntry.queueKey,
      createdAt: nextEntries[existingIndex].createdAt || normalizedEntry.createdAt,
      updatedAt: nowIso(),
    };
  } else {
    nextEntries.unshift(normalizedEntry);
  }
  const nextQueue = normalizePlannerOuttrayQueue({
    version: existing.version || '1',
    updatedAt: nowIso(),
    entries: nextEntries.slice(0, 24),
  });
  return writePlannerOuttray(rootPath, nextQueue);
}

function updatePlannerOuttrayEntry(rootPath, {
  queueKey = null,
  plannerRunId = null,
  planBundleId = null,
  laneId = null,
  status = null,
  collectedBy = null,
  reviewedBy = null,
  summary = null,
  findings = [],
  notes = [],
  artifactRefs = [],
} = {}) {
  const queue = readPlannerOuttray(rootPath);
  const normalizedQueueKey = String(queueKey || '').trim();
  const normalizedRunId = String(plannerRunId || '').trim();
  const normalizedPlanBundleId = String(planBundleId || '').trim();
  const index = queue.entries.findIndex((entry) => (
    (normalizedQueueKey && entry.queueKey === normalizedQueueKey)
    || (normalizedRunId && entry.plannerRunId === normalizedRunId)
    || (normalizedPlanBundleId && entry.planBundleId === normalizedPlanBundleId)
  ));
  if (index < 0) return null;
  const current = queue.entries[index];
  const nextStatus = normalizeOuttrayStatus(status || current.status || 'deposited');
  const nextItems = (Array.isArray(current.items) ? current.items : []).map((item) => {
    if (laneId && item.laneId !== laneId) return item;
    return {
      ...item,
      status: nextStatus,
      collectedAt: nextStatus === 'collected' || nextStatus === 'accepted' || nextStatus === 'returned_with_findings' || nextStatus === 'closed'
        ? item.collectedAt || nowIso()
        : item.collectedAt || null,
      collectedBy: collectedBy || item.collectedBy || null,
      reviewedAt: reviewedBy ? (item.reviewedAt || nowIso()) : item.reviewedAt || null,
      reviewedBy: reviewedBy || item.reviewedBy || null,
      summary: summary ? String(summary).trim() || item.summary : item.summary,
      findings: Array.isArray(findings) ? findings.map((finding) => String(finding || '').trim()).filter(Boolean) : item.findings,
      notes: uniqueStrings([...(item.notes || []), ...notes]),
      artifactRefs: uniqueStrings([...(item.artifactRefs || []), ...artifactRefs]),
      updatedAt: nowIso(),
    };
  });
  const updatedEntry = normalizePlannerOuttrayEntry({
    ...current,
    status: derivePlannerOuttrayStatus(nextItems, nextStatus),
    handoffState: nextStatus,
    items: nextItems,
    summary: summary ? String(summary).trim() : current.summary,
    updatedAt: nowIso(),
  });
  const nextEntries = [...queue.entries];
  nextEntries[index] = updatedEntry;
  const nextQueue = normalizePlannerOuttrayQueue({
    version: queue.version || '1',
    updatedAt: nowIso(),
    entries: nextEntries,
  });
  return writePlannerOuttray(rootPath, nextQueue);
}

function collectPlannerOuttrayItem(rootPath, {
  queueKey = null,
  plannerRunId = null,
  planBundleId = null,
  laneId = null,
  collectedBy = 'qa',
  reviewedBy = null,
  summary = null,
  findings = [],
  notes = [],
  artifactRefs = [],
  status = 'collected',
} = {}) {
  return updatePlannerOuttrayEntry(rootPath, {
    queueKey,
    plannerRunId,
    planBundleId,
    laneId,
    status,
    collectedBy,
    reviewedBy,
    summary,
    findings,
    notes,
    artifactRefs,
  });
}

module.exports = {
  ALLOWED_OUTTRAY_STATUSES,
  DEFAULT_OUTTRAY_LANES,
  PLANNER_OUTTRAY_RELATIVE_DIR,
  PLANNER_OUTTRAY_QUEUE_JSON_NAME,
  PLANNER_OUTTRAY_QUEUE_MD_NAME,
  collectPlannerOuttrayItem,
  createDefaultPlannerOuttrayQueue,
  ensurePlannerOuttrayStorage,
  normalizeOuttrayStatus,
  normalizePlannerOuttrayEntry,
  normalizePlannerOuttrayQueue,
  normalizePlannerOuttrayItem,
  plannerOuttrayQueueFilePath,
  plannerOuttrayQueueMarkdownPath,
  readPlannerOuttray,
  renderPlannerOuttrayMarkdown,
  summarizePlannerOuttray,
  updatePlannerOuttrayEntry,
  upsertPlannerOuttrayEntry,
  writePlannerOuttray,
};
