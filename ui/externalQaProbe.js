const DEFAULT_EXTERNAL_QA_PROBE_URL = 'http://127.0.0.1:5051/run_test';
const DEFAULT_EXTERNAL_QA_TIMEOUT_MS = 1500;

function createTimeoutController(timeoutMs) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  return { controller, timeout };
}

function normalizeText(value = '') {
  return String(value || '').trim();
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
} = {}) {
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

  if (!externalProbeResult.ok) {
    return {
      ok: false,
      external_probe: null,
      internal_truth,
      comparison,
      error: externalProbeResult.error,
      probe_status: externalProbeResult.status,
    };
  }

  return {
    ok: true,
    external_probe: externalProbeResult.external_probe,
    internal_truth,
    comparison,
  };
}

module.exports = {
  DEFAULT_EXTERNAL_QA_PROBE_URL,
  DEFAULT_EXTERNAL_QA_TIMEOUT_MS,
  buildExternalQaProbeCheckPayload,
  buildInternalQaTruth,
  compareQaTruth,
  fetchExternalQaProbe,
};
