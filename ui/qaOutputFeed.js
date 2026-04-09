const fs = require('fs');
const path = require('path');
const { writeJsonIfChanged } = require('./changeHygiene');

const QA_OUTPUT_FEED_RELATIVE_FILE = path.join('data', 'spatial', 'qa', 'output-feed.json');

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value = '') {
  return String(value || '').trim();
}

function getQaOutputFeedFilePath(rootPath = null) {
  return path.join(rootPath || process.cwd(), QA_OUTPUT_FEED_RELATIVE_FILE);
}

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  writeJsonIfChanged(filePath, payload);
}

function normalizeQaOutputFeedItem(item = {}) {
  const source = item && typeof item === 'object' ? item : {};
  const meta = source.meta && typeof source.meta === 'object' ? source.meta : {};
  return {
    id: normalizeText(source.id) || `qa_output_${Date.now()}`,
    createdAt: normalizeText(source.createdAt || source.created_at || source.observedAt || source.observed_at) || nowIso(),
    type: normalizeText(source.type) || 'qa_cycle',
    summary: normalizeText(source.summary) || 'QA cycle completed',
    result: normalizeText(source.result) || 'unknown',
    source: normalizeText(source.source) || 'qa_lead_runner',
    meta: {
      investigationCount: Number.isFinite(Number(meta.investigationCount)) ? Number(meta.investigationCount) : 0,
      failedChecks: Number.isFinite(Number(meta.failedChecks)) ? Number(meta.failedChecks) : 0,
      activeLanes: Number.isFinite(Number(meta.activeLanes)) ? Number(meta.activeLanes) : 0,
      externalStatus: normalizeText(meta.externalStatus) || 'unknown',
      cycleId: normalizeText(meta.cycleId || meta.runId) || null,
      mcpEvidenceSource: normalizeText(meta.mcpEvidenceSource) || null,
      externalProbeLive: typeof meta.externalProbeLive === 'boolean' ? meta.externalProbeLive : null,
      usedFallback: typeof meta.usedFallback === 'boolean' ? meta.usedFallback : null,
      probeTarget: normalizeText(meta.probeTarget) || null,
    },
  };
}

function classifyQaOutputFeedResult({ failedChecks = 0, externalStatus = 'unknown' } = {}) {
  const failed = Number(failedChecks) || 0;
  const normalizedExternalStatus = normalizeText(externalStatus) || 'unknown';
  if (failed > 0) return 'fail';
  if (normalizedExternalStatus !== 'ok') return 'degraded';
  return 'pass';
}

function buildQaOutputFeedEntryFromCycle({
  cycleId = null,
  createdAt = nowIso(),
  investigationCount = 0,
  failedChecks = 0,
  activeLanes = 0,
  externalStatus = 'unknown',
  mcpEvidenceSource = null,
  externalProbeLive = false,
  usedFallback = false,
  probeTarget = null,
} = {}) {
  return normalizeQaOutputFeedItem({
    id: `qa_output_${String(createdAt).replace(/[^0-9TZ]/g, '') || Date.now()}`,
    createdAt,
    type: 'qa_cycle',
    summary: 'QA cycle completed',
    result: classifyQaOutputFeedResult({ failedChecks, externalStatus }),
    source: 'qa_lead_runner',
    meta: {
      investigationCount,
      failedChecks,
      activeLanes,
      externalStatus,
      cycleId,
      mcpEvidenceSource,
      externalProbeLive,
      usedFallback,
      probeTarget,
    },
  });
}

function appendLiveMcpEvidenceSummary(summary = '', externalValidation = null) {
  const baseSummary = normalizeText(summary) || 'QA cycle completed';
  if (!externalValidation || externalValidation.externalProbeLive !== true || externalValidation.usedFallback === true) {
    return baseSummary;
  }
  if (/live MCP helper evidence captured/i.test(baseSummary)) {
    return baseSummary;
  }
  return `${baseSummary} Live MCP helper evidence captured.`;
}

function countQaLeadFailedChecks(run = {}) {
  const source = run && typeof run === 'object' ? run : {};
  return [
    source.boot_health && (source.boot_health.safeMode || source.boot_health.status === 'blocked' || source.boot_health.failure_class),
    source.browser_run && ['fail', 'failed', 'error'].includes(String(source.browser_run.verdict || source.browser_run.status || '').toLowerCase()),
    source.canaries && source.canaries.overall_status === 'fail',
    source.loop_audit && source.loop_audit.overall_status === 'fail',
  ].filter(Boolean).length;
}

function deriveQaLeadActiveLaneCount(run = {}) {
  const repairLoop = run?.repair_loop;
  const summaryCount = Number(repairLoop?.summary?.activeLanes || repairLoop?.summary?.active_lanes || 0);
  if (Number.isFinite(summaryCount) && summaryCount > 0) {
    return summaryCount;
  }
  if (!Array.isArray(repairLoop?.lanes)) {
    return 0;
  }
  return repairLoop.lanes.filter((lane) => !['idle', 'inactive'].includes(String(lane?.current_status || lane?.status || '').toLowerCase())).length;
}

function deriveQaLeadExternalStatus(run = {}) {
  const externalValidation = run?.external_validation;
  if (externalValidation?.ok) {
    return 'ok';
  }
  const probeStatus = String(externalValidation?.probeStatus || externalValidation?.error?.kind || '').toLowerCase();
  if (['unreachable', 'offline'].includes(probeStatus)) {
    return 'unreachable';
  }
  return externalValidation ? 'degraded' : 'unknown';
}

function buildQaOutputFeedEntryFromQaLeadRun(run = {}) {
  const source = run && typeof run === 'object' ? run : {};
  const externalValidation = source.external_validation && typeof source.external_validation === 'object'
    ? source.external_validation
    : (source.externalValidation && typeof source.externalValidation === 'object' ? source.externalValidation : null);
  const failedChecks = countQaLeadFailedChecks(source);
  const externalStatus = deriveQaLeadExternalStatus(source);
  const createdAt = normalizeText(source.finished_at || source.finishedAt || source.last_completed_cycle_at || source.lastCompletedCycleAt) || nowIso();
  return normalizeQaOutputFeedItem({
    id: `qa_output_${String(createdAt).replace(/[^0-9TZ]/g, '') || Date.now()}`,
    createdAt,
    type: 'qa_cycle',
    summary: appendLiveMcpEvidenceSummary(source.summary, externalValidation),
    result: classifyQaOutputFeedResult({ failedChecks, externalStatus }),
    source: normalizeText(source.source) || 'qa_lead_runner',
    meta: {
      investigationCount: Number.isFinite(Number(source.open_investigation_count || source.openInvestigationCount))
        ? Number(source.open_investigation_count || source.openInvestigationCount)
        : 0,
      failedChecks,
      activeLanes: deriveQaLeadActiveLaneCount(source),
      externalStatus,
      cycleId: normalizeText(source.id || source.run_id || source.runId) || null,
      mcpEvidenceSource: normalizeText(externalValidation?.mcpEvidenceSource) || null,
      externalProbeLive: externalValidation?.externalProbeLive === true,
      usedFallback: externalValidation?.usedFallback === true,
      probeTarget: normalizeText(externalValidation?.probeTarget || externalValidation?.probe_target || '') || null,
    },
  });
}

function readQaOutputFeed(rootPath = null) {
  const filePath = getQaOutputFeedFilePath(rootPath);
  const payload = readJsonSafe(filePath, { items: [] }) || { items: [] };
  const items = Array.isArray(payload.items) ? payload.items.map((item) => normalizeQaOutputFeedItem(item)) : [];
  items.sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
  return { items };
}

function appendQaOutputFeedEntry(rootPath = null, entry = {}) {
  const filePath = getQaOutputFeedFilePath(rootPath);
  const current = readQaOutputFeed(rootPath);
  const next = normalizeQaOutputFeedItem(entry);
  const cycleId = next.meta?.cycleId || null;
  const duplicate = current.items.find((item) => (
    item.id === next.id
    || (cycleId && (item.meta?.cycleId || null) === cycleId)
  ));
  if (duplicate) {
    return duplicate;
  }
  const nextItems = [...current.items, next];
  writeJson(filePath, { items: nextItems });
  return next;
}

module.exports = {
  QA_OUTPUT_FEED_RELATIVE_FILE,
  appendQaOutputFeedEntry,
  buildQaOutputFeedEntryFromCycle,
  buildQaOutputFeedEntryFromQaLeadRun,
  classifyQaOutputFeedResult,
  countQaLeadFailedChecks,
  deriveQaLeadActiveLaneCount,
  deriveQaLeadExternalStatus,
  getQaOutputFeedFilePath,
  normalizeQaOutputFeedItem,
  readQaOutputFeed,
};
