const fs = require('fs');
const path = require('path');
const { writeJsonIfChanged } = require('./changeHygiene');
const {
  normalizeQaInvestigationRecord,
  readOpenQaInvestigations,
} = require('./externalQaProbe');

const DEFAULT_QA_RESEARCH_NOTES_PATH = path.join(__dirname, '..', 'data', 'spatial', 'qa', 'research-notes.json');
const QA_RESEARCH_TRIGGER_CLASSES = Object.freeze([
  'external_mismatch',
  'probe_failure',
  'freshness_unknown',
  'repair_validation_failed',
]);
const QA_RESEARCH_REPEAT_THRESHOLD = 3;
const QA_RESEARCH_RECENCY_MS = 24 * 60 * 60 * 1000;
const QA_RESEARCH_SERVER_URL = 'http://127.0.0.1:5052/research_note';
const QA_RESEARCH_TIMEOUT_MS = 2500;

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value = '') {
  return String(value || '').trim();
}

function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getQaResearchNotesFilePath(rootPath = null) {
  return rootPath
    ? path.join(rootPath, 'data', 'spatial', 'qa', 'research-notes.json')
    : DEFAULT_QA_RESEARCH_NOTES_PATH;
}

function normalizeQaResearchNoteRecord(record = {}) {
  const source = record && typeof record === 'object' ? record : {};
  const sources = Array.isArray(source.sources) ? source.sources.filter((entry) => entry && typeof entry === 'object') : [];
  const createdAt = normalizeText(source.created_at || source.createdAt || source.timestamp) || null;
  const status = normalizeText(source.status) || (source.ok === false ? 'unavailable' : 'available');
  const researchAvailable = Boolean(source.research_available ?? source.ok ?? (status === 'available'));
  return {
    id: normalizeText(source.id || source.research_note_id || source.researchNoteId) || null,
    research_note_id: normalizeText(source.research_note_id || source.researchNoteId || source.id) || null,
    type: normalizeText(source.type) || 'qa_research_note',
    investigation_id: normalizeText(source.investigation_id || source.investigationId) || null,
    trigger: normalizeText(source.trigger) || 'external_mismatch',
    status,
    ok: Boolean(source.ok ?? researchAvailable),
    source: normalizeText(source.source) || 'external_mcp',
    created_at: createdAt,
    updated_at: normalizeText(source.updated_at || source.updatedAt || createdAt) || createdAt,
    query: normalizeText(source.query) || '',
    evidence_hint: normalizeText(source.evidence_hint || source.evidenceHint) || '',
    summary: normalizeText(source.summary) || 'Research unavailable.',
    recommendation: normalizeText(source.recommendation) || '',
    likely_causes: Array.isArray(source.likely_causes)
      ? source.likely_causes.map((entry) => normalizeText(entry)).filter(Boolean)
      : [],
    suggested_extra_checks: Array.isArray(source.suggested_extra_checks)
      ? source.suggested_extra_checks.map((entry) => normalizeText(entry)).filter(Boolean)
      : [],
    suggested_scorecard_additions: Array.isArray(source.suggested_scorecard_additions)
      ? source.suggested_scorecard_additions.map((entry) => normalizeText(entry)).filter(Boolean)
      : [],
    sources,
    error_message: normalizeText(source.error_message || source.errorMessage) || null,
    research_available: researchAvailable,
  };
}

function sortResearchNotesDesc(left = null, right = null) {
  const leftTime = Date.parse(normalizeText(left?.created_at || left?.updated_at || '') || '');
  const rightTime = Date.parse(normalizeText(right?.created_at || right?.updated_at || '') || '');
  const leftKnown = Number.isFinite(leftTime);
  const rightKnown = Number.isFinite(rightTime);
  if (leftKnown && rightKnown && leftTime !== rightTime) {
    return rightTime - leftTime;
  }
  if (leftKnown !== rightKnown) {
    return leftKnown ? -1 : 1;
  }
  return String(normalizeText(right?.id) || '').localeCompare(String(normalizeText(left?.id) || ''));
}

function readQaResearchNotes(rootPath = null) {
  return readJsonArray(getQaResearchNotesFilePath(rootPath))
    .map((record) => normalizeQaResearchNoteRecord(record))
    .filter((record) => record.id || record.investigation_id)
    .sort(sortResearchNotesDesc);
}

function writeQaResearchNotes(rootPath = null, notes = []) {
  const filePath = getQaResearchNotesFilePath(rootPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  writeJsonIfChanged(filePath, Array.isArray(notes) ? notes : [], {});
  return notes;
}

function appendQaResearchNote(rootPath = null, note = null) {
  if (!note || typeof note !== 'object') {
    return null;
  }
  const next = [...readQaResearchNotes(rootPath), normalizeQaResearchNoteRecord(note)];
  writeQaResearchNotes(rootPath, next);
  return normalizeQaResearchNoteRecord(note);
}

function findLatestQaResearchNoteForInvestigation(notes = [], investigationId = '') {
  const normalizedId = normalizeText(investigationId);
  return (Array.isArray(notes) ? notes : []).find((note) => normalizeText(note?.investigation_id) === normalizedId) || null;
}

function isRecentQaResearchNote(note = null, now = nowIso(), cooldownMs = QA_RESEARCH_RECENCY_MS) {
  const noteTime = Date.parse(normalizeText(note?.created_at || note?.updated_at || '') || '');
  const nowTime = Date.parse(normalizeText(now) || '');
  if (!Number.isFinite(noteTime) || !Number.isFinite(nowTime)) {
    return Boolean(note);
  }
  return (nowTime - noteTime) < Math.max(0, Number(cooldownMs) || 0);
}

function buildQaResearchQueryFromInvestigation(investigation = null) {
  const record = normalizeQaInvestigationRecord(investigation || {});
  const internalStatus = normalizeText(record.evidence?.internal?.status || 'unknown') || 'unknown';
  const externalStatus = normalizeText(record.evidence?.external?.status || record.evidence?.external?.result || 'unknown') || 'unknown';
  const probeStatus = normalizeText(record.evidence?.comparison?.probe_status || record.latest_evidence?.probe_status || 'unknown') || 'unknown';
  const testId = normalizeText(record.evidence?.external?.test_id || record.latest_evidence?.test_id || 'unknown') || 'unknown';
  const evidenceHint = `internal=${internalStatus} / external=${externalStatus} / probe=${probeStatus} / test=${testId}`;
  const query = [
    'QA validation issue',
    record.trigger,
    record.summary,
    `internal ${internalStatus}`,
    `external ${externalStatus}`,
    `probe ${probeStatus}`,
    `test ${testId}`,
  ].map((entry) => normalizeText(entry)).filter(Boolean).join(' ');
  return {
    investigation_id: record.id || null,
    trigger: record.trigger,
    summary: record.summary,
    internal_status: internalStatus,
    external_status: externalStatus,
    probe_status: probeStatus,
    test_id: testId,
    evidence_hint: evidenceHint,
    query,
    current_method: evidenceHint,
  };
}

function qualifiesQaResearchInvestigation(investigation = null, notes = [], options = {}) {
  const record = normalizeQaInvestigationRecord(investigation || {});
  const now = normalizeText(options.now) || nowIso();
  const cooldownMs = Number(options.cooldownMs) > 0 ? Number(options.cooldownMs) : QA_RESEARCH_RECENCY_MS;
  const threshold = Math.max(1, Number(options.threshold || QA_RESEARCH_REPEAT_THRESHOLD) || QA_RESEARCH_REPEAT_THRESHOLD);
  const recentNote = findLatestQaResearchNoteForInvestigation(notes, record.id);
  if (record.status !== 'open') {
    return { eligible: false, reason: 'investigation is not open', investigation: record, recentNote: null };
  }
  if (!QA_RESEARCH_TRIGGER_CLASSES.includes(record.trigger)) {
    return { eligible: false, reason: 'trigger is not research-eligible', investigation: record, recentNote: null };
  }
  if (Number(record.repeat_count || 0) < threshold) {
    return { eligible: false, reason: 'repeat count below research threshold', investigation: record, recentNote: null };
  }
  if (recentNote && isRecentQaResearchNote(recentNote, now, cooldownMs)) {
    return { eligible: false, reason: 'recent research note already exists', investigation: record, recentNote };
  }
  return { eligible: true, reason: 'qualifies for QA research', investigation: record, recentNote: null };
}

function buildQaResearchRecord({
  investigation = null,
  query = null,
  sourcePayload = null,
  status = 'available',
  errorMessage = null,
  createdAt = null,
} = {}) {
  const record = normalizeQaInvestigationRecord(investigation || {});
  const noteId = `qa_research_${String(Date.now()).slice(-10)}`;
  const payload = sourcePayload && typeof sourcePayload === 'object' ? sourcePayload : {};
  const now = normalizeText(createdAt) || payload.timestamp || nowIso();
  const available = status === 'available' && Boolean(payload.ok ?? true);
  return normalizeQaResearchNoteRecord({
    id: noteId,
    research_note_id: noteId,
    type: 'qa_research_note',
    investigation_id: record.id,
    trigger: record.trigger,
    status: available ? 'available' : 'unavailable',
    ok: available,
    source: normalizeText(payload.source || 'external_mcp') || 'external_mcp',
    created_at: now,
    updated_at: now,
    query: normalizeText(query || payload.query || '') || '',
    evidence_hint: normalizeText(payload.evidence_hint || payload.current_method || ''),
    summary: normalizeText(payload.summary || (available ? 'Research note available.' : 'Research unavailable.')) || 'Research unavailable.',
    recommendation: normalizeText(payload.recommendation || (available ? '' : 'Retry later with the same bounded query.')) || '',
    likely_causes: Array.isArray(payload.likely_causes) ? payload.likely_causes : [],
    suggested_extra_checks: Array.isArray(payload.suggested_extra_checks) ? payload.suggested_extra_checks : [],
    suggested_scorecard_additions: Array.isArray(payload.suggested_scorecard_additions) ? payload.suggested_scorecard_additions : [],
    sources: Array.isArray(payload.sources) ? payload.sources : [],
    error_message: available ? null : normalizeText(errorMessage || payload.error || 'Research unavailable.') || 'Research unavailable.',
    research_available: available,
  });
}

async function fetchQaResearchNoteFromServer({
  query,
  currentMethod = '',
  serverUrl = QA_RESEARCH_SERVER_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = QA_RESEARCH_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    return {
      ok: false,
      status: 'unavailable',
      error: {
        kind: 'missing_fetch',
        message: 'No fetch implementation is available for the QA research server.',
      },
      payload: null,
    };
  }
  const queryText = normalizeText(query);
  if (!queryText) {
    return {
      ok: false,
      status: 'unavailable',
      error: {
        kind: 'missing_query',
        message: 'query is required',
      },
      payload: null,
    };
  }
  const url = new URL(serverUrl);
  url.searchParams.set('query', queryText);
  if (normalizeText(currentMethod)) {
    url.searchParams.set('current_method', normalizeText(currentMethod));
  }
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), Math.max(250, Number(timeoutMs) || QA_RESEARCH_TIMEOUT_MS)) : null;
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      signal: controller?.signal,
    });
    if (!response.ok) {
      return {
        ok: false,
        status: 'unavailable',
        error: {
          kind: 'http_error',
          message: `QA research server returned HTTP ${response.status}.`,
          statusCode: response.status,
        },
        payload: null,
      };
    }
    const payload = await response.json();
    if (!payload || typeof payload !== 'object') {
      return {
        ok: false,
        status: 'unavailable',
        error: {
          kind: 'malformed_response',
          message: 'QA research server returned a malformed payload.',
        },
        payload: null,
      };
    }
    return {
      ok: Boolean(payload.ok),
      status: payload.ok ? 'available' : 'unavailable',
      payload,
    };
  } catch (error) {
    const message = String(error?.message || error);
    const isTimeout = error?.name === 'AbortError' || /timed out|aborted/i.test(message);
    return {
      ok: false,
      status: isTimeout ? 'timeout' : 'unavailable',
      error: {
        kind: isTimeout ? 'timeout' : 'unavailable',
        message: isTimeout ? `QA research request timed out after ${Math.max(250, Number(timeoutMs) || QA_RESEARCH_TIMEOUT_MS)}ms.` : message,
      },
      payload: null,
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function buildResearchFailurePayload({
  investigation = null,
  queryPayload = null,
  error = null,
  status = 'unavailable',
  createdAt = null,
} = {}) {
  const record = normalizeQaInvestigationRecord(investigation || {});
  const note = buildQaResearchRecord({
    investigation: record,
    query: queryPayload?.query || '',
    sourcePayload: {
      source: 'external_mcp',
      summary: 'QA research server unavailable.',
      recommendation: 'Retry later with the same bounded query.',
      likely_causes: ['QA research server is offline or unreachable.'],
      suggested_extra_checks: ['Verify the local QA research server is running on port 5052.'],
      suggested_scorecard_additions: ['research-server-availability'],
      sources: [],
      ok: false,
      error: error?.message || 'QA research server unavailable.',
    },
    status,
    errorMessage: error?.message || 'QA research server unavailable.',
    createdAt,
  });
  note.status = 'unavailable';
  note.ok = false;
  note.research_available = false;
  note.error_message = error?.message || note.error_message || 'QA research server unavailable.';
  return note;
}

function buildQaResearchState(rootPath = null, investigations = [], notes = null) {
  const researchNotes = Array.isArray(notes) ? notes.map((note) => normalizeQaResearchNoteRecord(note)) : readQaResearchNotes(rootPath);
  const latestByInvestigation = new Map();
  for (const note of researchNotes) {
    const key = normalizeText(note.investigation_id);
    if (!key || latestByInvestigation.has(key)) continue;
    latestByInvestigation.set(key, note);
  }
  const enrichedInvestigations = Array.isArray(investigations) ? investigations.map((investigation) => {
    const record = normalizeQaInvestigationRecord(investigation || {});
    const invNotes = researchNotes.filter((note) => normalizeText(note.investigation_id) === normalizeText(record.id));
    const latestResearch = invNotes[0] || latestByInvestigation.get(normalizeText(record.id)) || null;
    return {
      ...record,
      research_available: Boolean(latestResearch?.research_available),
      latest_research_at: normalizeText(latestResearch?.created_at || latestResearch?.updated_at || '') || null,
      research_note_count: invNotes.length,
      research_status: normalizeText(latestResearch?.status || '') || null,
      research_error_message: latestResearch?.error_message || null,
      research_summary: latestResearch?.summary || null,
      research_recommendation: latestResearch?.recommendation || null,
    };
  }) : [];
  return {
    notes: researchNotes,
    investigations: enrichedInvestigations,
    summary: {
      totalNotes: researchNotes.length,
      availableNotes: researchNotes.filter((note) => note.research_available).length,
      unavailableNotes: researchNotes.filter((note) => !note.research_available).length,
      latestNoteAt: researchNotes[0]?.created_at || null,
    },
  };
}

async function maybeGenerateQaResearchNoteForInvestigation(rootPath = null, investigation = null, options = {}) {
  const researchNotes = Array.isArray(options.notes) ? options.notes : readQaResearchNotes(rootPath);
  const eligibility = qualifiesQaResearchInvestigation(investigation, researchNotes, options);
  if (!eligibility.eligible) {
    return {
      ok: false,
      created: false,
      skipped: true,
      reason: eligibility.reason,
      investigation: eligibility.investigation,
      note: eligibility.recentNote || null,
      advisory_failure: false,
    };
  }

  const queryPayload = buildQaResearchQueryFromInvestigation(eligibility.investigation);
  const researchResult = await fetchQaResearchNoteFromServer({
    query: queryPayload.query,
    currentMethod: queryPayload.current_method,
    serverUrl: options.serverUrl || QA_RESEARCH_SERVER_URL,
    fetchImpl: options.fetchImpl || globalThis.fetch,
    timeoutMs: options.timeoutMs || QA_RESEARCH_TIMEOUT_MS,
  });

  if (!researchResult.ok || !researchResult.payload || researchResult.payload.ok === false) {
    const failureNote = buildResearchFailurePayload({
      investigation: eligibility.investigation,
      queryPayload,
      error: researchResult.error || { message: researchResult.payload?.error || 'QA research server returned an invalid payload.' },
      status: researchResult.status || 'unavailable',
      createdAt: options.createdAt || researchResult.payload?.timestamp || nowIso(),
    });
    appendQaResearchNote(rootPath, failureNote);
    return {
      ok: false,
      created: true,
      skipped: false,
      reason: failureNote.error_message,
      investigation: eligibility.investigation,
      note: failureNote,
      advisory_failure: true,
      research_available: false,
    };
  }

  const note = buildQaResearchRecord({
    investigation: eligibility.investigation,
    query: queryPayload.query,
    sourcePayload: {
      ...researchResult.payload,
      query: queryPayload.query,
      evidence_hint: queryPayload.evidence_hint,
    },
    status: 'available',
    createdAt: options.createdAt || researchResult.payload.timestamp || nowIso(),
  });
  appendQaResearchNote(rootPath, note);
  return {
    ok: true,
    created: true,
    skipped: false,
    reason: 'QA research note created.',
    investigation: eligibility.investigation,
    note,
    advisory_failure: false,
    research_available: true,
  };
}

async function maybeGenerateQaResearchNotesForInvestigations(rootPath = null, investigations = [], options = {}) {
  const records = Array.isArray(investigations) ? investigations : [];
  const results = [];
  for (const investigation of records) {
    const result = await maybeGenerateQaResearchNoteForInvestigation(rootPath, investigation, options);
    results.push(result);
  }
  return results;
}

module.exports = {
  DEFAULT_QA_RESEARCH_NOTES_PATH,
  QA_RESEARCH_RECENCY_MS,
  QA_RESEARCH_REPEAT_THRESHOLD,
  QA_RESEARCH_SERVER_URL,
  QA_RESEARCH_TIMEOUT_MS,
  QA_RESEARCH_TRIGGER_CLASSES,
  appendQaResearchNote,
  buildQaResearchQueryFromInvestigation,
  buildQaResearchRecord,
  buildQaResearchState,
  buildResearchFailurePayload,
  fetchQaResearchNoteFromServer,
  findLatestQaResearchNoteForInvestigation,
  getQaResearchNotesFilePath,
  isRecentQaResearchNote,
  maybeGenerateQaResearchNoteForInvestigation,
  maybeGenerateQaResearchNotesForInvestigations,
  normalizeQaResearchNoteRecord,
  qualifiesQaResearchInvestigation,
  readQaResearchNotes,
  sortResearchNotesDesc,
  writeQaResearchNotes,
};
