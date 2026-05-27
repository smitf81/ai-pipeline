const fs = require('fs');
const path = require('path');

const CTO_OVERRIDES_RELATIVE_DIR = path.join('data', 'spatial');
const CTO_OVERRIDES_JSON_NAME = 'cto-overrides.json';
const CTO_OVERRIDES_MD_NAME = 'cto-overrides.md';
const CTO_OVERRIDES_VERSION = 'ace/cto-overrides.v1';

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

function ensureCtoOverrideStorage(rootPath) {
  const dir = path.join(rootPath || process.cwd(), CTO_OVERRIDES_RELATIVE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function ctoOverrideLedgerFilePath(rootPath) {
  return path.join(ensureCtoOverrideStorage(rootPath), CTO_OVERRIDES_JSON_NAME);
}

function ctoOverrideLedgerMarkdownPath(rootPath) {
  return path.join(ensureCtoOverrideStorage(rootPath), CTO_OVERRIDES_MD_NAME);
}

function createDefaultCtoOverrideLedger() {
  return {
    version: CTO_OVERRIDES_VERSION,
    generatedAt: nowIso(),
    updatedAt: null,
    entries: [],
    activeOverrides: [],
    provenance: {
      source: 'createDefaultCtoOverrideLedger',
      fallbackUsed: false,
      reason: 'default empty CTO override ledger',
    },
  };
}

function normalizeCtoOverrideEntry(entry = {}) {
  const source = entry && typeof entry === 'object' ? entry : {};
  const createdAt = String(source.createdAt || nowIso()).trim() || nowIso();
  const status = String(source.status || 'active').trim().toLowerCase() || 'active';
  const kind = String(source.kind || source.type || 'cto-override').trim() || 'cto-override';
  const overrideId = String(
    source.overrideId
    || source.id
    || `override_${Date.parse(createdAt) || Date.now()}_${kind.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`,
  ).trim();
  return {
    overrideId,
    kind,
    requestedBy: String(source.requestedBy || source.requested_by || 'cto').trim() || 'cto',
    reason: String(source.reason || source.summary || kind).trim() || kind,
    summary: String(source.summary || source.reason || kind).trim() || kind,
    target: source.target && typeof source.target === 'object' ? { ...source.target } : {},
    canonicalTruth: source.canonicalTruth && typeof source.canonicalTruth === 'object' ? { ...source.canonicalTruth } : {},
    effect: source.effect && typeof source.effect === 'object' ? { ...source.effect } : {},
    provenance: {
      ...(source.provenance && typeof source.provenance === 'object' ? source.provenance : {}),
      sourceType: String(source.provenance?.sourceType || source.sourceType || '').trim() || null,
      sourceRef: String(source.provenance?.sourceRef || source.sourceRef || '').trim() || null,
      sourceActionId: String(source.provenance?.sourceActionId || source.sourceActionId || source.actionId || '').trim() || null,
      sourceIntentId: String(source.provenance?.sourceIntentId || source.sourceIntentId || source.intentId || '').trim() || null,
      sourceHandoffId: String(source.provenance?.sourceHandoffId || source.sourceHandoffId || source.handoffId || '').trim() || null,
      overrideIds: uniqueStrings(source.provenance?.overrideIds || source.overrideIds || overrideId),
    },
    explicit: source.explicit !== false,
    status,
    createdAt,
    appliedAt: String(source.appliedAt || '').trim() || (status === 'active' ? createdAt : null),
    resolvedAt: String(source.resolvedAt || '').trim() || null,
    updatedAt: String(source.updatedAt || '').trim() || createdAt,
  };
}

function normalizeCtoOverrideLedger(ledger = {}) {
  const source = ledger && typeof ledger === 'object' ? ledger : {};
  const entries = (Array.isArray(source.entries) ? source.entries : [])
    .map((entry) => normalizeCtoOverrideEntry(entry))
    .filter(Boolean);
  const activeOverrides = entries.filter((entry) => entry.status === 'active');
  return {
    version: String(source.version || CTO_OVERRIDES_VERSION).trim() || CTO_OVERRIDES_VERSION,
    generatedAt: String(source.generatedAt || source.createdAt || nowIso()).trim() || nowIso(),
    updatedAt: String(source.updatedAt || '').trim() || null,
    entries,
    activeOverrides,
    provenance: {
      ...(source.provenance && typeof source.provenance === 'object' ? source.provenance : {}),
      source: String(source.provenance?.source || 'ctoOverrides').trim() || 'ctoOverrides',
      fallbackUsed: Boolean(source.provenance?.fallbackUsed),
    },
  };
}

function deriveCtoOverrideLayer(ledger = {}) {
  const normalized = normalizeCtoOverrideLedger(ledger);
  const activeOverrides = normalized.activeOverrides;
  const hasKind = (pattern) => activeOverrides.some((entry) => pattern.test(entry.kind));
  const forcePlanning = hasKind(/force.*plan|plan.*force|force-plan-generation/i);
  const forcePlannerRouting = hasKind(/force.*planner.*routing|planner.*routing.*force/i);
  const reopenStalePlan = hasKind(/reopen.*stale|stale.*plan/i);
  const flags = {
    forcePlanning,
    forcePlanningGeneration: forcePlanning,
    forcePlannerRouting,
    reopenStalePlan,
  };
  return {
    version: 'ace/cto-override-layer.v1',
    generatedAt: nowIso(),
    activeCount: activeOverrides.length,
    activeOverrides,
    flags,
    planningMode: forcePlanning || forcePlannerRouting || reopenStalePlan
      ? 'forced'
      : (activeOverrides.length ? 'override' : 'normal'),
    overrideIds: activeOverrides.map((entry) => entry.overrideId),
    provenance: {
      source: 'deriveCtoOverrideLayer',
      ledgerVersion: normalized.version,
      fallbackUsed: false,
    },
  };
}

function summarizeCtoOverrideLedger(ledger = {}) {
  const normalized = normalizeCtoOverrideLedger(ledger);
  const layer = deriveCtoOverrideLayer(normalized);
  return {
    version: normalized.version,
    generatedAt: nowIso(),
    entryCount: normalized.entries.length,
    activeCount: normalized.activeOverrides.length,
    latestEntry: normalized.entries[normalized.entries.length - 1] || null,
    flags: layer.flags,
    planningMode: layer.planningMode,
    overrideIds: normalized.activeOverrides.map((entry) => entry.overrideId),
  };
}

function renderCtoOverrideLedgerMarkdown(ledger = {}) {
  const normalized = normalizeCtoOverrideLedger(ledger);
  const lines = [
    '# CTO Override Ledger',
    '',
    'Governed CTO override records for planner and runtime routing.',
    '',
    `Updated: ${normalized.updatedAt || nowIso()}`,
    '',
  ];
  normalized.entries.forEach((entry) => {
    lines.push(`## ${entry.overrideId}`);
    lines.push(`- Kind: ${entry.kind}`);
    lines.push(`- Status: ${entry.status}`);
    lines.push(`- Requested by: ${entry.requestedBy}`);
    lines.push(`- Reason: ${entry.reason}`);
    lines.push(`- Target desk: ${entry.target?.deskId || 'n/a'}`);
    lines.push('');
  });
  if (!normalized.entries.length) lines.push('No CTO overrides recorded.');
  return `${lines.join('\n')}\n`;
}

function readCtoOverrideLedger(rootPath) {
  return normalizeCtoOverrideLedger(readJson(ctoOverrideLedgerFilePath(rootPath), createDefaultCtoOverrideLedger()));
}

function writeCtoOverrideLedger(rootPath, ledger) {
  const normalized = normalizeCtoOverrideLedger({
    ...ledger,
    updatedAt: nowIso(),
  });
  const jsonPath = ctoOverrideLedgerFilePath(rootPath);
  const markdownPath = ctoOverrideLedgerMarkdownPath(rootPath);
  writeJson(jsonPath, normalized);
  fs.writeFileSync(markdownPath, renderCtoOverrideLedgerMarkdown(normalized), 'utf8');
  return { ledger: normalized, jsonPath, markdownPath };
}

function appendCtoOverrideLedgerEntry(rootPath, entry = {}) {
  const ledger = readCtoOverrideLedger(rootPath);
  const normalizedEntry = normalizeCtoOverrideEntry(entry);
  const entries = [
    ...ledger.entries.filter((existing) => existing.overrideId !== normalizedEntry.overrideId),
    normalizedEntry,
  ];
  return writeCtoOverrideLedger(rootPath, { ...ledger, entries });
}

module.exports = {
  CTO_OVERRIDES_RELATIVE_DIR,
  CTO_OVERRIDES_JSON_NAME,
  CTO_OVERRIDES_MD_NAME,
  appendCtoOverrideLedgerEntry,
  createDefaultCtoOverrideLedger,
  ctoOverrideLedgerFilePath,
  ctoOverrideLedgerMarkdownPath,
  deriveCtoOverrideLayer,
  normalizeCtoOverrideEntry,
  normalizeCtoOverrideLedger,
  readCtoOverrideLedger,
  summarizeCtoOverrideLedger,
  writeCtoOverrideLedger,
};
