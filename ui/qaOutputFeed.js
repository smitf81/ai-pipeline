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
  classifyQaOutputFeedResult,
  getQaOutputFeedFilePath,
  normalizeQaOutputFeedItem,
  readQaOutputFeed,
};
