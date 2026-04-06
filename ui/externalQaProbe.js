const fs = require('fs');
const path = require('path');

const DEFAULT_EXTERNAL_QA_PROBE_URL = 'http://127.0.0.1:5051/run_test';
const DEFAULT_EXTERNAL_QA_TIMEOUT_MS = 1500;
const DEFAULT_QA_INVESTIGATIONS_PATH = path.join(__dirname, '..', 'data', 'spatial', 'qa', 'investigations.json');

function createTimeoutController(timeoutMs) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  return { controller, timeout };
}

function normalizeText(value = '') {
  return String(value || '').trim();
}

function getQaInvestigationsFilePath(rootPath = null) {
  return rootPath ? path.join(rootPath, 'data', 'spatial', 'qa', 'investigations.json') : DEFAULT_QA_INVESTIGATIONS_PATH;
}

function readQaInvestigations(rootPath = null) {
  const filePath = getQaInvestigationsFilePath(rootPath);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeQaInvestigationRecord(record = {}) {
  const source = record && typeof record === 'object' ? record : {};
  const evidence = source.evidence && typeof source.evidence === 'object' ? source.evidence : {};
  const repeatCount = Number(source.repeat_count ?? source.repeatCount ?? 1) || 1;
  const firstSeenAt = normalizeText(source.first_seen_at || source.firstSeenAt || source.created_at || source.createdAt) || null;
  const lastSeenAt = normalizeText(source.last_seen_at || source.lastSeenAt || source.created_at || source.createdAt) || firstSeenAt;
  const latestEvidence = source.latest_evidence && typeof source.latest_evidence === 'object'
    ? source.latest_evidence
    : (Array.isArray(source.evidence_events) && source.evidence_events.length ? source.evidence_events[source.evidence_events.length - 1] : null);
  return {
    id: normalizeText(source.id) || null,
    type: normalizeText(source.type) || 'qa_investigation',
    trigger: normalizeText(source.trigger) || 'external_mismatch',
    severity: normalizeText(source.severity) || 'medium',
    created_at: firstSeenAt || null,
    first_seen_at: firstSeenAt,
    last_seen_at: lastSeenAt,
    repeat_count: repeatCount,
    status: normalizeText(source.status) || 'open',
    summary: normalizeText(source.summary) || 'External probe disagrees with internal QA status',
    evidence: {
      external: evidence.external || null,
      internal: evidence.internal || null,
      comparison: evidence.comparison || null,
    },
    latest_evidence: latestEvidence || null,
    evidence_events: Array.isArray(source.evidence_events) ? source.evidence_events.slice(-10) : [],
  };
}

function compareInvestigationTimestamps(left = null, right = null) {
  const leftTime = Date.parse(normalizeText(left?.last_seen_at || left?.lastSeenAt || left?.created_at || left?.createdAt) || '');
  const rightTime = Date.parse(normalizeText(right?.last_seen_at || right?.lastSeenAt || right?.created_at || right?.createdAt) || '');
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

function readOpenQaInvestigations(rootPath = null, limit = 5) {
  return readQaInvestigations(rootPath)
    .map((record) => normalizeQaInvestigationRecord(record))
    .filter((record) => record.status === 'open')
    .sort(compareInvestigationTimestamps)
    .slice(0, Math.max(0, Number(limit) || 0));
}

function buildQaInvestigationSignature({
  trigger = null,
  internal = null,
  external = null,
  externalProbeResult = null,
  comparison = null,
} = {}) {
  const resolvedTrigger = normalizeText(trigger) || normalizeText(comparison?.trigger) || 'external_mismatch';
  const internalStatus = normalizeText(internal?.status) || 'missing';
  const externalStatus = normalizeText(external?.status) || normalizeText(externalProbeResult?.external_probe?.status) || normalizeText(externalProbeResult?.status) || 'unavailable';
  const probeStatus = normalizeText(externalProbeResult?.status) || normalizeText(externalProbeResult?.probe_status) || (externalProbeResult?.ok ? 'ok' : 'unreachable') || 'unreachable';
  const testId = normalizeText(external?.test_id) || normalizeText(externalProbeResult?.external_probe?.test_id) || 'unknown-test';
  return [resolvedTrigger, internalStatus, externalStatus, probeStatus, testId].join('|');
}

function createQaInvestigationEvent({
  seenAt = null,
  trigger = null,
  external = null,
  internal = null,
  comparison = null,
  externalProbeResult = null,
} = {}) {
  return {
    seen_at: normalizeText(seenAt) || new Date().toISOString(),
    trigger: normalizeText(trigger) || normalizeText(comparison?.trigger) || 'external_mismatch',
    internal_status: normalizeText(internal?.status) || 'missing',
    external_status: normalizeText(external?.status) || normalizeText(externalProbeResult?.external_probe?.status) || 'unavailable',
    probe_status: normalizeText(externalProbeResult?.status) || normalizeText(externalProbeResult?.probe_status) || (externalProbeResult?.ok ? 'ok' : 'unreachable') || 'unreachable',
    test_id: normalizeText(external?.test_id) || normalizeText(externalProbeResult?.external_probe?.test_id) || 'unknown-test',
  };
}

function findMatchingOpenQaInvestigation(investigations = [], signature = '') {
  return (Array.isArray(investigations) ? investigations : []).find((record) => {
    if (!record || record.status !== 'open') return false;
    return normalizeText(record.signature || '') === normalizeText(signature);
  }) || null;
}

function buildQaInvestigationRecord({
  id,
  trigger = 'external_mismatch',
  severity = 'medium',
  createdAt = null,
  external = null,
  internal = null,
  comparison = null,
  signature = null,
  repeatCount = 1,
  firstSeenAt = null,
  lastSeenAt = null,
  latestEvidence = null,
  evidenceEvents = null,
} = {}) {
  const created_at = normalizeText(createdAt) || new Date().toISOString();
  const resolvedFirstSeenAt = normalizeText(firstSeenAt) || created_at;
  const resolvedLastSeenAt = normalizeText(lastSeenAt) || resolvedFirstSeenAt;
  const event = latestEvidence && typeof latestEvidence === 'object'
    ? latestEvidence
    : createQaInvestigationEvent({
        seenAt: resolvedLastSeenAt,
        trigger,
        external,
        internal,
        comparison,
      });
  return {
    id: normalizeText(id) || 'qa_inv_001',
    type: 'qa_investigation',
    trigger: normalizeText(trigger) || 'external_mismatch',
    severity: normalizeText(severity) || 'medium',
    created_at,
    first_seen_at: resolvedFirstSeenAt,
    last_seen_at: resolvedLastSeenAt,
    repeat_count: Math.max(1, Number(repeatCount) || 1),
    status: 'open',
    summary: 'External probe disagrees with internal QA status',
    signature: normalizeText(signature) || buildQaInvestigationSignature({
      trigger,
      internal,
      external,
      comparison,
    }),
    evidence: {
      external,
      internal,
      comparison,
    },
    latest_evidence: event,
    evidence_events: Array.isArray(evidenceEvents) && evidenceEvents.length
      ? evidenceEvents.slice(-10)
      : [event],
  };
}

function appendQaInvestigation(rootPath = null, investigation = null) {
  if (!investigation || typeof investigation !== 'object') {
    return null;
  }
  const filePath = getQaInvestigationsFilePath(rootPath);
  const existing = readQaInvestigations(rootPath);
  const signature = normalizeText(investigation.signature) || buildQaInvestigationSignature({
    trigger: investigation.trigger,
    internal: investigation.evidence?.internal || null,
    external: investigation.evidence?.external || null,
    comparison: investigation.evidence?.comparison || null,
  });
  const matchedIndex = existing.findIndex((record) => {
    const normalized = normalizeQaInvestigationRecord(record);
    return normalized.status === 'open' && normalizeText(record.signature || normalized.signature || '') === signature;
  });
  const now = normalizeText(investigation.last_seen_at || investigation.created_at || investigation.createdAt || '') || new Date().toISOString();
  const event = createQaInvestigationEvent({
    seenAt: now,
    trigger: investigation.trigger,
    external: investigation.evidence?.external || null,
    internal: investigation.evidence?.internal || null,
    comparison: investigation.evidence?.comparison || null,
  });
  let record;
  let next = existing;
  if (matchedIndex >= 0) {
    const current = normalizeQaInvestigationRecord(existing[matchedIndex]);
    record = {
      ...current,
      ...investigation,
      id: current.id || normalizeText(investigation.id) || `qa_inv_${String(matchedIndex + 1).padStart(3, '0')}`,
      signature,
      repeat_count: (Number(current.repeat_count) || 1) + 1,
      first_seen_at: current.first_seen_at || current.created_at || now,
      last_seen_at: now,
      latest_evidence: event,
      evidence_events: [...(Array.isArray(current.evidence_events) ? current.evidence_events : []), event].slice(-10),
    };
    next = existing.slice();
    next[matchedIndex] = record;
  } else {
    const nextId = `qa_inv_${String(existing.length + 1).padStart(3, '0')}`;
    record = {
      ...investigation,
      id: normalizeText(investigation.id) || nextId,
      signature,
      repeat_count: Math.max(1, Number(investigation.repeat_count) || 1),
      first_seen_at: normalizeText(investigation.first_seen_at || investigation.created_at || investigation.createdAt || '') || now,
      last_seen_at: normalizeText(investigation.last_seen_at || investigation.created_at || investigation.createdAt || '') || now,
      latest_evidence: investigation.latest_evidence || event,
      evidence_events: Array.isArray(investigation.evidence_events) && investigation.evidence_events.length
        ? investigation.evidence_events.slice(-10)
        : [event],
    };
    next = [...existing, record];
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return { record, created: matchedIndex < 0 };
}

function shouldCreateQaInvestigation({ comparison = null } = {}) {
  return Boolean(comparison && (!comparison.status_match || !comparison.freshness_known));
}

function buildQaInvestigationTrigger({
  externalProbeResult = null,
  comparison = null,
} = {}) {
  if (externalProbeResult && externalProbeResult.ok === false) {
    return 'probe_failure';
  }
  if (comparison && comparison.status_match === false) {
    return 'external_mismatch';
  }
  if (comparison && comparison.freshness_known === false) {
    return 'freshness_unknown';
  }
  return 'external_mismatch';
}

function buildInternalQaTruth(qaState = null) {
  const structuredReport = qaState?.structuredReport || null;
  const structuredAudit = Array.isArray(qaState?.auditTrail?.entries)
    ? qaState.auditTrail.entries.find((entry) => entry?.kind === 'structured-report')
    : null;
  const timestamp = normalizeText(
    structuredReport?.finishedAt
    || structuredReport?.updatedAt
    || structuredReport?.createdAt
    || structuredAudit?.generatedAt
    || null,
  ) || null;

  return {
    status: normalizeText(structuredReport?.status || structuredAudit?.status || 'missing') || 'missing',
    source: normalizeText(
      structuredAudit?.sourceArtifacts?.[0]?.path
      || structuredAudit?.sourceTrace?.sourcePath
      || 'data/spatial/qa/structured/latest.json',
    ) || 'data/spatial/qa/structured/latest.json',
    timestamp,
    details: normalizeText(structuredReport?.summary || structuredAudit?.detail || 'Structured QA report unavailable.') || 'Structured QA report unavailable.',
  };
}

function compareQaTruth({ externalProbe = null, internalTruth = null } = {}) {
  const notes = [];
  const externalStatus = normalizeText(externalProbe?.status) || null;
  const internalStatus = normalizeText(internalTruth?.status) || null;
  const externalTimestamp = normalizeText(externalProbe?.timestamp) || null;
  const internalTimestamp = normalizeText(internalTruth?.timestamp) || null;

  if (!externalStatus) {
    notes.push('External probe status is missing.');
  }
  if (!internalStatus) {
    notes.push('Internal QA status is missing.');
  }
  if (externalStatus && internalStatus && externalStatus !== internalStatus) {
    notes.push(`Status mismatch: external ${externalStatus} vs internal ${internalStatus}.`);
  }
  if (!externalTimestamp) {
    notes.push('External probe timestamp is missing.');
  }
  if (!internalTimestamp) {
    notes.push('Internal QA timestamp is missing.');
  }

  return {
    status_match: Boolean(externalStatus && internalStatus && externalStatus === internalStatus),
    freshness_known: Boolean(externalTimestamp && internalTimestamp),
    notes,
  };
}

function buildExternalValidationSnapshot({
  probeCheck = null,
  checkedAt = null,
} = {}) {
  const source = probeCheck && typeof probeCheck === 'object' ? probeCheck : {};
  const externalProbe = source.external_probe && typeof source.external_probe === 'object' ? source.external_probe : null;
  const comparison = source.comparison && typeof source.comparison === 'object' ? source.comparison : null;
  const error = source.error && typeof source.error === 'object' ? source.error : null;
  const probeStatus = normalizeText(source.probe_status || error?.kind || '') || (source.ok ? 'ok' : 'error');
  const externalStatus = normalizeText(externalProbe?.status || '') || 'unavailable';
  const lastCheckedAt = normalizeText(checkedAt || source.checkedAt || source.checked_at || source.generatedAt || '') || null;
  return {
    status: source.ok
      ? (externalStatus === 'pass' || externalStatus === 'fail' ? externalStatus : 'unavailable')
      : 'unavailable',
    probeStatus: source.ok ? 'ok' : probeStatus,
    lastCheckedAt,
    statusMatch: Boolean(comparison?.status_match),
    freshnessKnown: Boolean(comparison?.freshness_known),
    notes: Array.isArray(comparison?.notes) ? comparison.notes.filter((note) => normalizeText(note)) : [],
    source: normalizeText(externalProbe?.source || source.source || 'external_mcp') || 'external_mcp',
    errorMessage: source.ok ? null : (normalizeText(error?.message || source.error_message || '') || null),
  };
}

async function fetchExternalQaProbe({
  probeUrl = DEFAULT_EXTERNAL_QA_PROBE_URL,
  timeoutMs = DEFAULT_EXTERNAL_QA_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    return {
      ok: false,
      status: 'unreachable',
      error: {
        kind: 'missing_fetch',
        message: 'No fetch implementation is available for the external QA probe.',
      },
      external_probe: null,
    };
  }

  const { controller, timeout } = createTimeoutController(timeoutMs);
  try {
    const response = await fetchImpl(probeUrl, {
      method: 'GET',
      signal: controller?.signal,
    });
    if (!response.ok) {
      return {
        ok: false,
        status: 'unreachable',
        error: {
          kind: 'http_error',
          message: `External QA probe returned HTTP ${response.status}.`,
          statusCode: response.status,
        },
        external_probe: null,
      };
    }
    return {
      ok: true,
      status: 'ok',
      external_probe: await response.json(),
    };
  } catch (error) {
    const message = String(error?.message || error);
    const isTimeout = error?.name === 'AbortError' || /timed out|aborted/i.test(message);
    return {
      ok: false,
      status: isTimeout ? 'timeout' : 'unreachable',
      error: {
        kind: isTimeout ? 'timeout' : 'unreachable',
        message: isTimeout ? `External QA probe timed out after ${timeoutMs}ms.` : message,
      },
      external_probe: null,
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function buildExternalQaProbeCheckPayload({
  qaState = null,
  probeUrl = DEFAULT_EXTERNAL_QA_PROBE_URL,
  timeoutMs = DEFAULT_EXTERNAL_QA_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
  rootPath = null,
  investigationRootPath = null,
  investigationCreatedAt = null,
} = {}) {
  const resolvedInvestigationRootPath = investigationRootPath || rootPath || null;
  const internal_truth = buildInternalQaTruth(qaState);
  const externalProbeResult = await fetchExternalQaProbe({
    probeUrl,
    timeoutMs,
    fetchImpl,
  });
  const comparison = compareQaTruth({
    externalProbe: externalProbeResult.external_probe,
    internalTruth: internal_truth,
  });
  const shouldInvestigate = shouldCreateQaInvestigation({ comparison });
  let investigation = null;
  let investigationCreated = false;
  if (shouldInvestigate) {
    const investigationResult = appendQaInvestigation(resolvedInvestigationRootPath, buildQaInvestigationRecord({
      trigger: buildQaInvestigationTrigger({
        externalProbeResult,
        comparison,
      }),
      createdAt: investigationCreatedAt,
      external: externalProbeResult.external_probe,
      internal: internal_truth,
      comparison,
      latestEvidence: createQaInvestigationEvent({
        seenAt: investigationCreatedAt,
        trigger: buildQaInvestigationTrigger({
          externalProbeResult,
          comparison,
        }),
        external: externalProbeResult.external_probe,
        internal: internal_truth,
        comparison,
        externalProbeResult,
      }),
    }));
    investigation = investigationResult?.record || null;
    investigationCreated = Boolean(investigationResult?.created);
  }

  if (!externalProbeResult.ok) {
    return {
      ok: false,
      external_probe: null,
      internal_truth,
      comparison,
      error: externalProbeResult.error,
      probe_status: externalProbeResult.status,
      investigation_created: investigationCreated,
      investigation_id: investigation?.id || null,
    };
  }

  return {
    ok: true,
    external_probe: externalProbeResult.external_probe,
    internal_truth,
    comparison,
    investigation_created: investigationCreated,
    investigation_id: investigation?.id || null,
  };
}

module.exports = {
  DEFAULT_EXTERNAL_QA_PROBE_URL,
  DEFAULT_EXTERNAL_QA_TIMEOUT_MS,
  DEFAULT_QA_INVESTIGATIONS_PATH,
  buildExternalQaProbeCheckPayload,
  buildExternalValidationSnapshot,
  appendQaInvestigation,
  buildQaInvestigationRecord,
  buildQaInvestigationSignature,
  createQaInvestigationEvent,
  buildQaInvestigationTrigger,
  buildInternalQaTruth,
  compareQaTruth,
  compareInvestigationTimestamps,
  findMatchingOpenQaInvestigation,
  getQaInvestigationsFilePath,
  fetchExternalQaProbe,
  readQaInvestigations,
  normalizeQaInvestigationRecord,
  readOpenQaInvestigations,
  shouldCreateQaInvestigation,
};
