const fs = require('fs');
const path = require('path');

const PLANNER_QA_RELATIVE_DIR = path.join('data', 'spatial', 'qa');
const PLANNER_QA_QUEUE_JSON_NAME = 'planner-qa-queue.json';
const PLANNER_QA_QUEUE_MD_NAME = 'planner-qa-queue.md';
const PLANNER_RUNS_RELATIVE_DIR = path.join('data', 'spatial', 'agent-runs', 'planner');

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

function ensurePlannerQaStorage(rootPath) {
  const dir = path.join(rootPath || process.cwd(), PLANNER_QA_RELATIVE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function plannerQaQueueFilePath(rootPath) {
  return path.join(ensurePlannerQaStorage(rootPath), PLANNER_QA_QUEUE_JSON_NAME);
}

function plannerQaQueueMarkdownPath(rootPath) {
  return path.join(ensurePlannerQaStorage(rootPath), PLANNER_QA_QUEUE_MD_NAME);
}

function plannerRunFilePath(rootPath, runId) {
  const normalizedRunId = String(runId || '').trim();
  if (!normalizedRunId) return null;
  return path.join(rootPath || process.cwd(), PLANNER_RUNS_RELATIVE_DIR, `${normalizedRunId}.json`);
}

function normalizePlannerQaFinding(finding = {}, index = 0) {
  if (!finding || typeof finding !== 'object') return null;
  const summary = String(finding.summary || finding.title || '').trim();
  if (!summary) return null;
  return {
    id: String(finding.id || finding.findingId || '').trim() || `qa_finding_${index + 1}`,
    severity: String(finding.severity || 'info').trim().toLowerCase() || 'info',
    kind: String(finding.kind || finding.type || 'qa-review').trim() || 'qa-review',
    summary,
    details: String(finding.details || '').trim() || null,
    relatedPlanIds: uniqueStrings(finding.relatedPlanIds || finding.planIds || finding.planId || []),
    relatedTaskIds: uniqueStrings(finding.relatedTaskIds || finding.taskIds || finding.taskId || []),
    sourceQaRunId: String(finding.sourceQaRunId || finding.qaRunId || '').trim() || null,
    attachedAt: String(finding.attachedAt || '').trim() || nowIso(),
  };
}

function normalizePlannerQaQueueEntry(entry = {}) {
  const planIds = uniqueStrings(entry.planIds || entry.planId || []);
  const taskIds = uniqueStrings(entry.taskIds || entry.taskId || []);
  const queueKey = String(
    entry.queueKey
    || entry.qaRequestId
    || entry.plannerRunId
    || entry.planBundleId
    || planIds[0]
    || '',
  ).trim();
  const createdAt = String(entry.createdAt || entry.queuedAt || nowIso()).trim() || nowIso();
  const updatedAt = String(entry.updatedAt || entry.reviewedAt || createdAt).trim() || createdAt;
  return {
    queueKey: queueKey || `planner_qa_${createdAt}`,
    plannerRunId: String(entry.plannerRunId || '').trim() || null,
    planBundleId: String(entry.planBundleId || '').trim() || null,
    qaRequestId: String(entry.qaRequestId || '').trim() || null,
    intentId: String(entry.intentId || '').trim() || null,
    planIds,
    taskIds,
    targetDesk: String(entry.targetDesk || 'qa-lead').trim() || 'qa-lead',
    targetRole: String(entry.targetRole || 'QA Lead').trim() || 'QA Lead',
    requestedBy: String(entry.requestedBy || entry.createdBy || 'planner').trim() || 'planner',
    summary: String(entry.summary || 'Planner QA review request').trim(),
    qaStatus: String(entry.qaStatus || 'pending').trim().toLowerCase() || 'pending',
    qaCoverageRequired: Boolean(entry.qaCoverageRequired !== false),
    qaBlocker: Boolean(entry.qaBlocker),
    releaseBlocker: Boolean(entry.releaseBlocker),
    status: String(entry.status || 'pending').trim().toLowerCase() || 'pending',
    provenance: {
      ...(entry.provenance && typeof entry.provenance === 'object' ? entry.provenance : {}),
      sourceHandoffId: entry.provenance?.sourceHandoffId || null,
      sourceIntentId: entry.provenance?.sourceIntentId || entry.intentId || null,
      sourceType: entry.provenance?.sourceType || null,
      sourceRef: entry.provenance?.sourceRef || null,
      anchorRefs: uniqueStrings(entry.provenance?.anchorRefs || []),
    },
    findings: (Array.isArray(entry.findings) ? entry.findings : [])
      .map((finding, index) => normalizePlannerQaFinding(finding, index))
      .filter(Boolean),
    createdAt,
    updatedAt,
    reviewedAt: String(entry.reviewedAt || '').trim() || null,
    reviewedBy: String(entry.reviewedBy || '').trim() || null,
    qaRunId: String(entry.qaRunId || '').trim() || null,
    reviewSummary: String(entry.reviewSummary || '').trim() || null,
  };
}

function normalizePlannerQaQueue(queue = {}) {
  const entries = Array.isArray(queue.entries) ? queue.entries : [];
  return {
    version: String(queue.version || '1').trim() || '1',
    updatedAt: String(queue.updatedAt || '').trim() || null,
    entries: entries.map((entry) => normalizePlannerQaQueueEntry(entry)).filter(Boolean),
  };
}

function renderPlannerQaQueueMarkdown(queue = {}) {
  const entries = Array.isArray(queue.entries) ? queue.entries : [];
  const lines = [
    '# Planner QA Queue',
    '',
    'Pending QA review requests emitted by Planner.',
    '',
    `Updated: ${queue.updatedAt || nowIso()}`,
    '',
  ];
  entries.forEach((entry) => {
    lines.push(`## ${entry.queueKey}`);
    lines.push(`- Planner run: ${entry.plannerRunId || 'unknown'}`);
    lines.push(`- Plan bundle: ${entry.planBundleId || 'unknown'}`);
    lines.push(`- QA request: ${entry.qaRequestId || 'unknown'}`);
    lines.push(`- Plan IDs: ${entry.planIds.join(', ') || 'none'}`);
    lines.push(`- QA status: ${entry.qaStatus}`);
    lines.push(`- QA blocker: ${entry.qaBlocker ? 'true' : 'false'}`);
    lines.push(`- Release blocker: ${entry.releaseBlocker ? 'true' : 'false'}`);
    lines.push(`- Summary: ${entry.summary}`);
    lines.push('');
  });
  return `${lines.join('\n').trim()}\n`;
}

function readPlannerQaQueue(rootPath) {
  const queuePath = plannerQaQueueFilePath(rootPath);
  return normalizePlannerQaQueue(readJson(queuePath, {
    version: '1',
    updatedAt: null,
    entries: [],
  }));
}

function summarizePlannerQaQueue(queue = {}) {
  const entries = Array.isArray(queue.entries) ? queue.entries : [];
  return {
    updatedAt: queue.updatedAt || null,
    entryCount: entries.length,
    pendingCount: entries.filter((entry) => entry.qaStatus === 'pending').length,
    reviewedCount: entries.filter((entry) => entry.qaStatus === 'reviewed' || entry.qaStatus === 'attached').length,
    blockedCount: entries.filter((entry) => entry.qaBlocker || entry.releaseBlocker).length,
    latestEntry: entries[0] || null,
  };
}

function writePlannerQaQueue(rootPath, queue = {}) {
  const normalizedQueue = normalizePlannerQaQueue(queue);
  const queuePath = plannerQaQueueFilePath(rootPath);
  const markdownPath = plannerQaQueueMarkdownPath(rootPath);
  writeJson(queuePath, normalizedQueue);
  fs.writeFileSync(markdownPath, renderPlannerQaQueueMarkdown(normalizedQueue), 'utf8');
  return {
    location: 'queue',
    jsonPath: queuePath,
    markdownPath,
    queue: normalizedQueue,
  };
}

function upsertPlannerQaQueueEntry(rootPath, entry = {}) {
  const existing = readPlannerQaQueue(rootPath);
  const normalizedEntry = normalizePlannerQaQueueEntry(entry);
  const queueKey = normalizedEntry.queueKey;
  const nextEntries = [...existing.entries];
  const existingIndex = nextEntries.findIndex((item) => (
    item.queueKey === queueKey
    || (normalizedEntry.plannerRunId && item.plannerRunId === normalizedEntry.plannerRunId)
    || (normalizedEntry.qaRequestId && item.qaRequestId === normalizedEntry.qaRequestId)
    || (normalizedEntry.planBundleId && item.planBundleId === normalizedEntry.planBundleId)
    || (normalizedEntry.planIds.length && item.planIds.some((planId) => normalizedEntry.planIds.includes(planId)))
  ));
  if (existingIndex >= 0) {
    nextEntries[existingIndex] = {
      ...nextEntries[existingIndex],
      ...normalizedEntry,
      queueKey: nextEntries[existingIndex].queueKey || normalizedEntry.queueKey,
      createdAt: nextEntries[existingIndex].createdAt || normalizedEntry.createdAt,
      updatedAt: normalizedEntry.updatedAt || nowIso(),
    };
  } else {
    nextEntries.unshift(normalizedEntry);
  }
  const nextQueue = normalizePlannerQaQueue({
    version: existing.version || '1',
    updatedAt: nowIso(),
    entries: nextEntries.slice(0, 24),
  });
  return writePlannerQaQueue(rootPath, nextQueue);
}

function findPlannerRunByPlanId(rootPath, planId) {
  const normalizedPlanId = String(planId || '').trim();
  if (!normalizedPlanId) return null;
  const runsDir = path.join(rootPath || process.cwd(), PLANNER_RUNS_RELATIVE_DIR);
  if (!fs.existsSync(runsDir)) return null;
  const entries = fs.readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'));
  for (const entry of entries) {
    try {
      const run = readJson(path.join(runsDir, entry.name), null);
      if (!run) continue;
      if (run.planBundle?.planId === normalizedPlanId) return run;
      if (Array.isArray(run.planBundle?.items) && run.planBundle.items.some((item) => item.planId === normalizedPlanId)) return run;
    } catch {
      // Ignore malformed planner run artifacts.
    }
  }
  return null;
}

function attachPlannerQaFindingsToRun(rootPath, {
  plannerRunId = null,
  planId = null,
  qaRunId = null,
  qaRequestId = null,
  findings = [],
  reviewedAt = null,
  reviewedBy = 'qa',
  summary = '',
  status = 'reviewed',
} = {}) {
  const normalizedFindings = (Array.isArray(findings) ? findings : [])
    .map((finding, index) => normalizePlannerQaFinding(finding, index))
    .filter(Boolean);
  const resolvedRun = plannerRunId
    ? readJson(plannerRunFilePath(rootPath, plannerRunId), null)
    : null;
  const run = resolvedRun || findPlannerRunByPlanId(rootPath, planId);
  if (!run) return null;
  const targetPlanId = String(planId || run.planBundle?.planId || '').trim() || null;
  const planIds = uniqueStrings([
    ...(Array.isArray(run.planBundle?.items) ? run.planBundle.items.map((item) => item.planId) : []),
    ...(targetPlanId ? [targetPlanId] : []),
    ...normalizedFindings.flatMap((finding) => finding.relatedPlanIds || []),
  ]);
  const finalStatus = String(status || 'reviewed').trim().toLowerCase() || 'reviewed';
  const reviewedAtValue = String(reviewedAt || nowIso()).trim() || nowIso();
  const releaseBlocker = normalizedFindings.some((finding) => ['error', 'critical', 'blocked'].includes(String(finding.severity || '').trim().toLowerCase()));
  const qaReview = {
    qaRunId: String(qaRunId || '').trim() || null,
    qaRequestId: String(qaRequestId || '').trim() || null,
    planId: targetPlanId,
    planIds,
    reviewedAt: reviewedAtValue,
    reviewedBy: String(reviewedBy || 'qa').trim() || 'qa',
    status: finalStatus,
    summary: String(summary || '').trim() || null,
    findings: normalizedFindings,
    releaseBlocker,
  };
  const annotateItem = (item = {}) => {
    if (!item || typeof item !== 'object') return item;
    if (planIds.length && !planIds.includes(item.planId)) return item;
    return {
      ...item,
      qaStatus: finalStatus,
      qaCoverageRequired: true,
      qaBlocker: false,
      releaseBlocker,
      qaReview,
    };
  };
  const nextRun = {
    ...run,
    qaStatus: finalStatus,
    qaCoverageRequired: true,
    qaBlocker: false,
    releaseBlocker,
    qaQueue: run.qaQueue ? {
      ...run.qaQueue,
      qaStatus: finalStatus,
      status: finalStatus,
      qaRunId: String(qaRunId || '').trim() || run.qaQueue.qaRunId || null,
      reviewedAt: reviewedAtValue,
      reviewedBy: String(reviewedBy || 'qa').trim() || 'qa',
      findings: normalizedFindings,
      releaseBlocker,
    } : run.qaQueue,
    qaReview,
    qaFindings: normalizedFindings,
    planBundle: run.planBundle ? {
      ...run.planBundle,
      qaStatus: finalStatus,
      qaCoverageRequired: true,
      qaBlocker: false,
      releaseBlocker,
      qaReview,
      qaFindings: normalizedFindings,
      items: Array.isArray(run.planBundle.items) ? run.planBundle.items.map(annotateItem) : [],
    } : run.planBundle,
    taskBundle: run.taskBundle ? {
      ...run.taskBundle,
      qaStatus: finalStatus,
      qaCoverageRequired: true,
      qaBlocker: false,
      releaseBlocker,
      qaReview,
      qaFindings: normalizedFindings,
    } : run.taskBundle,
  };
  writeJson(plannerRunFilePath(rootPath, nextRun.id), nextRun);
  upsertPlannerQaQueueEntry(rootPath, {
    queueKey: qaRequestId || nextRun.planBundle?.planId || nextRun.id,
    plannerRunId: nextRun.id,
    planBundleId: nextRun.planBundle?.planId || null,
    qaRequestId,
    intentId: nextRun.intentId || null,
    planIds,
    taskIds: Array.isArray(nextRun.taskBundle?.tasks) ? nextRun.taskBundle.tasks.map((task) => task.taskId).filter(Boolean) : [],
    targetDesk: 'qa-lead',
    targetRole: 'QA Lead',
    requestedBy: reviewedBy,
    summary: qaReview.summary || nextRun.summary || 'Planner QA review request',
    qaStatus: finalStatus,
    qaCoverageRequired: true,
    qaBlocker: false,
    releaseBlocker,
    provenance: {
      sourceHandoffId: nextRun.handoffId || null,
      sourceIntentId: nextRun.intentId || null,
      sourceType: nextRun.intentContract?.sourceType || null,
      sourceRef: nextRun.intentContract?.sourceRef || null,
      anchorRefs: Array.isArray(nextRun.intentContract?.anchorRefs) ? nextRun.intentContract.anchorRefs : [],
    },
    findings: normalizedFindings,
    reviewedAt: reviewedAtValue,
    reviewedBy,
    qaRunId,
    status: finalStatus,
  });
  return nextRun;
}

module.exports = {
  PLANNER_QA_RELATIVE_DIR,
  PLANNER_QA_QUEUE_JSON_NAME,
  PLANNER_QA_QUEUE_MD_NAME,
  attachPlannerQaFindingsToRun,
  ensurePlannerQaStorage,
  findPlannerRunByPlanId,
  normalizePlannerQaQueue,
  normalizePlannerQaQueueEntry,
  readPlannerQaQueue,
  renderPlannerQaQueueMarkdown,
  summarizePlannerQaQueue,
  upsertPlannerQaQueueEntry,
  writePlannerQaQueue,
};
