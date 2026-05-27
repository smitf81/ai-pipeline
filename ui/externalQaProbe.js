const fs = require('fs');
const net = require('net');
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

function normalizeStatusCode(value = null) {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseTargetUrl(target = '') {
  const normalized = normalizeText(target);
  if (!normalized) return null;
  try {
    return new URL(normalized);
  } catch {
    return null;
  }
}

function isLocalServiceUrl(url = null) {
  const hostname = normalizeText(url?.hostname).toLowerCase();
  return ['127.0.0.1', 'localhost', '::1'].includes(hostname);
}

function resolveTargetPort(targetUrl = null) {
  if (!targetUrl) return null;
  const explicitPort = Number(targetUrl.port);
  if (Number.isInteger(explicitPort) && explicitPort > 0) {
    return explicitPort;
  }
  if (normalizeText(targetUrl.protocol).toLowerCase() === 'https:') {
    return 443;
  }
  if (normalizeText(targetUrl.protocol).toLowerCase() === 'http:') {
    return 80;
  }
  return null;
}

function buildQaMcpTarget(probeUrl = DEFAULT_EXTERNAL_QA_PROBE_URL) {
  const normalized = normalizeText(probeUrl) || DEFAULT_EXTERNAL_QA_PROBE_URL;
  const parsed = parseTargetUrl(normalized);
  if (!parsed) {
    return {
      server_url: normalized,
      host: null,
      port: null,
      path: null,
      protocol: null,
      local: false,
      valid: false,
    };
  }
  const port = resolveTargetPort(parsed);
  return {
    server_url: normalized,
    host: normalizeText(parsed.hostname) || null,
    port,
    path: normalizeText(parsed.pathname) || '/',
    protocol: normalizeText(parsed.protocol) || null,
    local: isLocalServiceUrl(parsed),
    valid: Boolean(port && ['http:', 'https:'].includes(normalizeText(parsed.protocol).toLowerCase())),
  };
}

function classifyProbeTransportFailure(error = null, probeUrl = DEFAULT_EXTERNAL_QA_PROBE_URL, timeoutMs = DEFAULT_EXTERNAL_QA_TIMEOUT_MS) {
  const targetUrl = parseTargetUrl(probeUrl);
  const detail = normalizeText(error?.message || error) || 'External QA probe failed.';
  const causeCode = normalizeText(error?.cause?.code || error?.code).toUpperCase();
  const isTimeout = error?.name === 'AbortError' || /timed out|aborted/i.test(detail);
  if (isTimeout) {
    return {
      kind: 'timeout',
      message: `External QA probe timed out after ${timeoutMs}ms.`,
      detail,
    };
  }
  if (!targetUrl && normalizeText(probeUrl)) {
    return {
      kind: 'bad_config',
      message: 'External QA probe target is misconfigured.',
      detail,
    };
  }
  if (causeCode === 'ECONNREFUSED') {
    return {
      kind: 'offline',
      message: isLocalServiceUrl(targetUrl)
        ? `External QA probe server is offline or not listening on ${normalizeText(targetUrl?.host) || probeUrl}.`
        : 'External QA probe connection was refused.',
      detail,
    };
  }
  if (['ENOTFOUND', 'EAI_AGAIN', 'ERR_INVALID_URL'].includes(causeCode) || /invalid url/i.test(detail)) {
    return {
      kind: 'bad_config',
      message: 'External QA probe target is misconfigured.',
      detail,
    };
  }
  if (['EHOSTUNREACH', 'ENETUNREACH', 'ECONNRESET'].includes(causeCode)) {
    return {
      kind: 'unreachable',
      message: 'External QA probe is unreachable.',
      detail,
    };
  }
  return {
    kind: 'unreachable',
    message: isLocalServiceUrl(targetUrl)
      ? `External QA probe is unreachable at ${normalizeText(targetUrl?.host) || probeUrl}.`
      : detail,
    detail: detail === normalizeText(error?.message || '') ? detail : null,
  };
}

function buildProbeContractIssues(payload = null) {
  const source = payload && typeof payload === 'object' ? payload : null;
  if (!source) {
    return ['Probe response body is not a JSON object.'];
  }
  const issues = [];
  const testId = normalizeText(source.test_id);
  const status = normalizeText(source.status).toLowerCase();
  const timestamp = normalizeText(source.timestamp);
  const sourceName = normalizeText(source.source);
  if (!testId) issues.push('Missing required field "test_id".');
  if (!['pass', 'fail'].includes(status)) issues.push('Field "status" must be "pass" or "fail".');
  if (!timestamp) issues.push('Missing required field "timestamp".');
  if (!sourceName) issues.push('Missing required field "source".');
  return issues;
}

function buildProbeFailureResult({
  kind = 'unreachable',
  message = null,
  statusCode = null,
  probeUrl = DEFAULT_EXTERNAL_QA_PROBE_URL,
  detail = null,
} = {}) {
  return {
    ok: false,
    status: normalizeText(kind) || 'unreachable',
    error: {
      kind: normalizeText(kind) || 'unreachable',
      message: normalizeText(message) || 'External QA probe failed.',
      statusCode: normalizeStatusCode(statusCode),
      probeUrl: normalizeText(probeUrl) || DEFAULT_EXTERNAL_QA_PROBE_URL,
      detail: normalizeText(detail) || null,
    },
    external_probe: null,
    probe_target: normalizeText(probeUrl) || DEFAULT_EXTERNAL_QA_PROBE_URL,
  };
}

function buildExternalValidationEvidenceMeta({
  probeStatus = null,
  probeTarget = null,
  source = null,
  sourceRef = null,
  lastCheckedAt = null,
} = {}) {
  const normalizedProbeStatus = normalizeText(probeStatus).toLowerCase();
  const normalizedProbeTarget = normalizeText(probeTarget);
  const normalizedSource = normalizeText(source).toLowerCase();
  const normalizedSourceRef = normalizeText(sourceRef);
  const normalizedLastCheckedAt = normalizeText(lastCheckedAt);
  const parsedTarget = parseTargetUrl(normalizedProbeTarget);
  const liveProbeConsumed = Boolean(
    normalizedSourceRef === 'ui/externalQaProbe.buildExternalQaProbeCheckPayload'
    || (
      normalizedSource === 'external_mcp'
      && normalizedProbeStatus
      && normalizedProbeStatus !== 'unavailable'
      && (normalizedProbeTarget || normalizedLastCheckedAt)
    )
  );
  const liveHelper = liveProbeConsumed && Boolean(normalizedProbeTarget) && isLocalServiceUrl(parsedTarget);
  return {
    externalProbeLive: liveHelper && normalizedProbeStatus === 'ok',
    usedFallback: !liveProbeConsumed,
    mcpEvidenceSource: !liveProbeConsumed
      ? 'fallback_unavailable'
      : (liveHelper ? 'live_helper' : 'external_probe'),
  };
}

function mapProbeFailureToPreflightVerdict(kind = '', probeUrl = DEFAULT_EXTERNAL_QA_PROBE_URL) {
  const parsed = parseTargetUrl(probeUrl);
  const normalized = normalizeText(kind).toLowerCase();
  if (normalized === 'bad_config') return 'bad_config';
  if (normalized === 'invalid_contract') return 'invalid_contract';
  if (['http_error', 'invalid_json', 'missing_fetch'].includes(normalized)) return 'bad_response';
  if (normalized === 'offline') {
    return isLocalServiceUrl(parsed) ? 'not_running' : 'unreachable';
  }
  if (['timeout', 'unreachable'].includes(normalized)) return 'unreachable';
  return 'bad_response';
}

function buildQaMcpNextAction({
  verdict = 'unreachable',
  target = null,
  detail = null,
} = {}) {
  const host = normalizeText(target?.host) || '<unknown-host>';
  const port = target?.port ?? '<unknown-port>';
  const requestPath = normalizeText(target?.path) || '/run_test';
  if (verdict === 'ok') {
    return {
      kind: 'run_qa_cycle',
      summary: 'QA MCP helper is reachable and valid. Run the normal QA lead cycle to consume it through the existing seam.',
    };
  }
  if (verdict === 'bad_config') {
    return {
      kind: 'fix_probe_config',
      summary: `Fix the QA MCP helper URL configuration so it points to a valid local helper endpoint. Current target: ${normalizeText(target?.server_url) || '<empty>'}.`,
    };
  }
  if (verdict === 'not_running') {
    return {
      kind: 'start_external_helper',
      summary: `Start the external QA MCP helper that should be listening on ${host}:${port}${requestPath}. ACE is wired; the local helper process is missing.`,
    };
  }
  if (verdict === 'invalid_contract') {
    return {
      kind: 'fix_helper_contract',
      summary: `Repair the helper response contract at ${host}:${port}${requestPath} so it returns test_id, status, timestamp, and source.`,
    };
  }
  if (verdict === 'bad_response') {
    return {
      kind: 'fix_helper_response',
      summary: `Repair the helper response at ${host}:${port}${requestPath}. It answered, but the body or HTTP response was not usable.${detail ? ` Detail: ${detail}` : ''}`,
    };
  }
  return {
    kind: 'check_network_path',
    summary: `Verify that the QA MCP helper is reachable at ${host}:${port}${requestPath} and that the local network path is available.${detail ? ` Detail: ${detail}` : ''}`,
  };
}

function summarizeQaMcpPreflight({
  verdict = 'unreachable',
  target = null,
  transport = null,
  payload = null,
} = {}) {
  const host = normalizeText(target?.host) || '<unknown-host>';
  const port = target?.port ?? '<unknown-port>';
  const requestPath = normalizeText(target?.path) || '/run_test';
  if (verdict === 'ok') {
    return `QA MCP helper answered with a valid contract at ${host}:${port}${requestPath}.`;
  }
  if (verdict === 'bad_config') {
    return `QA MCP helper target is misconfigured: ${normalizeText(target?.server_url) || '<empty>'}.`;
  }
  if (verdict === 'not_running') {
    return `No local QA MCP helper is listening on ${host}:${port}${requestPath}; TCP connection was refused before any HTTP response.`;
  }
  if (verdict === 'invalid_contract') {
    return `QA MCP helper answered at ${host}:${port}${requestPath}, but the JSON contract was invalid.`;
  }
  if (verdict === 'bad_response') {
    if (transport?.http_status) {
      return `QA MCP helper answered at ${host}:${port}${requestPath}, but returned HTTP ${transport.http_status} or an unusable body.`;
    }
    if (payload?.has_body === false) {
      return `QA MCP helper answered at ${host}:${port}${requestPath}, but returned no body.`;
    }
    return `QA MCP helper answered at ${host}:${port}${requestPath}, but the response body could not be used.`;
  }
  if (normalizeText(transport?.failure_kind) === 'timeout') {
    return `QA MCP helper at ${host}:${port}${requestPath} did not return an HTTP response before the timeout.`;
  }
  return `QA MCP helper at ${host}:${port}${requestPath} is unreachable from this machine.`;
}

function createPreflightFailureResult({
  target = null,
  transport = {},
  payload = {},
  verdict = 'unreachable',
  detail = null,
} = {}) {
  return {
    source: 'qa_mcp_preflight',
    target,
    transport: {
      reachable: Boolean(transport.reachable),
      http_status: normalizeStatusCode(transport.http_status),
      responded: Boolean(transport.responded),
      failure_kind: normalizeText(transport.failure_kind) || null,
      failure_detail: normalizeText(transport.failure_detail || detail) || null,
    },
    payload: {
      has_body: Boolean(payload.has_body),
      parsed_json: Boolean(payload.parsed_json),
      contract_valid: Boolean(payload.contract_valid),
    },
    verdict,
    summary: summarizeQaMcpPreflight({
      verdict,
      target,
      transport,
      payload,
    }),
    next_action: buildQaMcpNextAction({
      verdict,
      target,
      detail: normalizeText(transport.failure_detail || detail) || null,
    }),
    qa_path: null,
  };
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
  const evidenceId = normalizeText(source.evidence_id || source.investigation_id || source.id || '') || null;
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
    pre_adjudication: Boolean(source.pre_adjudication || latestEvidence?.pre_adjudication),
    adjudication_state: normalizeText(source.adjudication_state || latestEvidence?.adjudication_state) || (source.pre_adjudication || latestEvidence?.pre_adjudication ? 'pending_lead_cycle' : null),
    resolved_at: normalizeText(source.resolved_at || source.resolvedAt || latestEvidence?.resolved_at || latestEvidence?.resolvedAt) || null,
    resolution: source.resolution && typeof source.resolution === 'object'
      ? source.resolution
      : null,
    evidence_id: evidenceId,
    promoted_by_posture_id: normalizeText(source.promoted_by_posture_id || latestEvidence?.promoted_by_posture_id || '') || null,
    promoted_at: normalizeText(source.promoted_at || latestEvidence?.promoted_at || '') || null,
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
  preAdjudication = true,
  evidenceId = null,
} = {}) {
  return {
    seen_at: normalizeText(seenAt) || new Date().toISOString(),
    trigger: normalizeText(trigger) || normalizeText(comparison?.trigger) || 'external_mismatch',
    internal_status: normalizeText(internal?.status) || 'missing',
    external_status: normalizeText(external?.status) || normalizeText(externalProbeResult?.external_probe?.status) || 'unavailable',
    probe_status: normalizeText(externalProbeResult?.status) || normalizeText(externalProbeResult?.probe_status) || (externalProbeResult?.ok ? 'ok' : 'unreachable') || 'unreachable',
    test_id: normalizeText(external?.test_id) || normalizeText(externalProbeResult?.external_probe?.test_id) || 'unknown-test',
    pre_adjudication: Boolean(preAdjudication),
    adjudication_state: 'pending_lead_cycle',
    evidence_id: normalizeText(evidenceId) || null,
    promoted_by_posture_id: null,
    promoted_at: null,
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
  const evidenceId = normalizeText(id) || null;
  const event = latestEvidence && typeof latestEvidence === 'object'
    ? latestEvidence
    : createQaInvestigationEvent({
        seenAt: resolvedLastSeenAt,
        trigger,
        external,
        internal,
        comparison,
        preAdjudication: true,
        evidenceId,
      });
  return {
    id: evidenceId || 'qa_inv_001',
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
    pre_adjudication: true,
    adjudication_state: 'pending_lead_cycle',
    evidence_id: evidenceId || null,
    promoted_by_posture_id: null,
    promoted_at: null,
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
    preAdjudication: true,
    evidenceId: normalizeText(investigation.id) || null,
  });
  let record;
  let next = existing;
  if (matchedIndex >= 0) {
    const current = normalizeQaInvestigationRecord(existing[matchedIndex]);
    const resolvedEvidenceId = normalizeText(current.id || investigation.id) || null;
    record = {
      ...current,
      ...investigation,
      id: resolvedEvidenceId || `qa_inv_${String(matchedIndex + 1).padStart(3, '0')}`,
      signature,
      repeat_count: (Number(current.repeat_count) || 1) + 1,
      first_seen_at: current.first_seen_at || current.created_at || now,
      last_seen_at: now,
      latest_evidence: event,
      evidence_events: [...(Array.isArray(current.evidence_events) ? current.evidence_events : []), event].slice(-10),
      pre_adjudication: true,
      adjudication_state: 'pending_lead_cycle',
      evidence_id: resolvedEvidenceId,
      promoted_by_posture_id: current.promoted_by_posture_id || null,
      promoted_at: current.promoted_at || null,
    };
    record.latest_evidence = {
      ...(record.latest_evidence || {}),
      evidence_id: resolvedEvidenceId,
      pre_adjudication: true,
      adjudication_state: 'pending_lead_cycle',
    };
    next = existing.slice();
    next[matchedIndex] = record;
  } else {
    const nextId = `qa_inv_${String(existing.length + 1).padStart(3, '0')}`;
    const resolvedEvidenceId = normalizeText(investigation.id) || nextId;
    record = {
      ...investigation,
      id: resolvedEvidenceId,
      signature,
      repeat_count: Math.max(1, Number(investigation.repeat_count) || 1),
      first_seen_at: normalizeText(investigation.first_seen_at || investigation.created_at || investigation.createdAt || '') || now,
      last_seen_at: normalizeText(investigation.last_seen_at || investigation.created_at || investigation.createdAt || '') || now,
      latest_evidence: investigation.latest_evidence || event,
      evidence_events: Array.isArray(investigation.evidence_events) && investigation.evidence_events.length
        ? investigation.evidence_events.slice(-10)
        : [event],
      pre_adjudication: true,
      adjudication_state: 'pending_lead_cycle',
      evidence_id: resolvedEvidenceId,
      promoted_by_posture_id: null,
      promoted_at: null,
    };
    record.latest_evidence = {
      ...(record.latest_evidence || {}),
      evidence_id: resolvedEvidenceId,
      pre_adjudication: true,
      adjudication_state: 'pending_lead_cycle',
    };
    next = [...existing, record];
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return { record, created: matchedIndex < 0 };
}

function adjudicateAcceptedQaInvestigation(rootPath = null, publication = {}) {
  const investigationId = normalizeText(publication.investigation_id || publication.investigationId);
  if (!investigationId) return null;
  const validationVerdict = normalizeText(publication.validation_verdict || publication.validationVerdict);
  if (validationVerdict !== 'accepted') return null;
  const filePath = getQaInvestigationsFilePath(rootPath);
  const investigations = readQaInvestigations(rootPath);
  const index = investigations.findIndex((entry) => normalizeQaInvestigationRecord(entry).id === investigationId);
  if (index < 0) return null;

  const current = normalizeQaInvestigationRecord(investigations[index]);
  const resolvedAt = normalizeText(publication.resolved_at || publication.resolvedAt || publication.published_at || publication.publishedAt) || new Date().toISOString();
  const evidenceSummary = normalizeText(publication.validation_evidence_summary || publication.validationEvidenceSummary)
    || normalizeText(publication.latest_validation_evidence?.summary)
    || 'Accepted QA validation published through the repair loop.';
  const latestEvidence = {
    ...(current.latest_evidence && typeof current.latest_evidence === 'object' ? current.latest_evidence : {}),
    seen_at: resolvedAt,
    trigger: 'repair_validation_accepted',
    validation_verdict: 'accepted',
    validation_evidence_summary: evidenceSummary,
    repair_job_id: normalizeText(publication.repair_job_id || publication.repairJobId) || null,
    repair_attempt_id: normalizeText(publication.repair_attempt_id || publication.repairAttemptId) || null,
    pre_adjudication: false,
    adjudication_state: 'adjudicated_accepted',
    resolved_at: resolvedAt,
    evidence_id: current.evidence_id || current.id || null,
    promoted_by_posture_id: normalizeText(publication.promoted_by_posture_id || publication.promotedByPostureId) || current.promoted_by_posture_id || null,
    promoted_at: normalizeText(publication.promoted_at || publication.promotedAt) || current.promoted_at || null,
  };
  const resolution = {
    outcome: 'accepted',
    adjudication_state: 'adjudicated_accepted',
    resolved_at: resolvedAt,
    adjudicated_by: normalizeText(publication.adjudicated_by || publication.adjudicatedBy) || 'qa_repair_loop',
    repair_job_id: latestEvidence.repair_job_id,
    repair_attempt_id: latestEvidence.repair_attempt_id,
    validation_verdict: 'accepted',
    validation_evidence_summary: evidenceSummary,
    latest_validation_evidence: publication.latest_validation_evidence && typeof publication.latest_validation_evidence === 'object'
      ? publication.latest_validation_evidence
      : null,
  };
  const next = {
    ...investigations[index],
    ...current,
    status: 'resolved',
    pre_adjudication: false,
    adjudication_state: 'adjudicated_accepted',
    resolved_at: resolvedAt,
    latest_evidence: latestEvidence,
    evidence_events: [...(Array.isArray(current.evidence_events) ? current.evidence_events : []), latestEvidence].slice(-10),
    resolution,
    last_seen_at: resolvedAt,
    updated_at: resolvedAt,
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  investigations[index] = next;
  fs.writeFileSync(filePath, `${JSON.stringify(investigations, null, 2)}\n`, 'utf8');
  return normalizeQaInvestigationRecord(next);
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
  const isNormalizedSnapshot = Boolean(
    !source.external_probe
    && (
      Object.prototype.hasOwnProperty.call(source, 'probeStatus')
      || Object.prototype.hasOwnProperty.call(source, 'lastCheckedAt')
      || Object.prototype.hasOwnProperty.call(source, 'probeFailureKind')
    )
  );
  if (isNormalizedSnapshot) {
    const comparison = source.comparison && typeof source.comparison === 'object' ? source.comparison : null;
    const normalizedLastCheckedAt = normalizeText(checkedAt || source.lastCheckedAt || source.last_checked_at || '') || null;
    const normalizedProbeTarget = normalizeText(source.probeTarget || source.probe_target || '') || null;
    const evidenceMeta = buildExternalValidationEvidenceMeta({
      probeStatus: source.probeStatus,
      probeTarget: normalizedProbeTarget,
      source: source.source || 'external_mcp',
      sourceRef: source.source_ref,
      lastCheckedAt: normalizedLastCheckedAt,
    });
    return {
      status: normalizeText(source.status) || 'unavailable',
      probeStatus: normalizeText(source.probeStatus) || 'unavailable',
      lastCheckedAt: normalizedLastCheckedAt,
      statusMatch: Boolean(source.statusMatch ?? comparison?.status_match),
      freshnessKnown: Boolean(source.freshnessKnown ?? comparison?.freshness_known),
      notes: Array.isArray(source.notes)
        ? source.notes.filter((note) => normalizeText(note))
        : (Array.isArray(comparison?.notes) ? comparison.notes.filter((note) => normalizeText(note)) : []),
      source: normalizeText(source.source || 'external_mcp') || 'external_mcp',
      errorMessage: normalizeText(source.errorMessage || '') || null,
      probeFailureKind: normalizeText(source.probeFailureKind || '') || null,
      probeFailureDetail: normalizeText(source.probeFailureDetail || '') || null,
      probeStatusCode: normalizeStatusCode(source.probeStatusCode),
      probeTarget: normalizedProbeTarget,
      pre_adjudication: Boolean(source.pre_adjudication),
      adjudication_state: normalizeText(source.adjudication_state) || (source.pre_adjudication ? 'pending_lead_cycle' : null),
      evidence_id: normalizeText(source.evidence_id || source.investigation_id || '') || null,
      investigation_id: normalizeText(source.investigation_id || source.evidence_id || '') || null,
      source_ref: normalizeText(source.source_ref || '') || null,
      externalProbeLive: evidenceMeta.externalProbeLive,
      usedFallback: evidenceMeta.usedFallback,
      mcpEvidenceSource: evidenceMeta.mcpEvidenceSource,
    };
  }
  const externalProbe = source.external_probe && typeof source.external_probe === 'object' ? source.external_probe : null;
  const comparison = source.comparison && typeof source.comparison === 'object' ? source.comparison : null;
  const error = source.error && typeof source.error === 'object' ? source.error : null;
  const probeStatus = normalizeText(source.probe_status || error?.kind || '') || (source.ok ? 'ok' : 'error');
  const externalStatus = normalizeText(externalProbe?.status || '') || 'unavailable';
  const lastCheckedAt = normalizeText(checkedAt || source.checkedAt || source.checked_at || source.generatedAt || '') || null;
  const normalizedProbeTarget = normalizeText(source.probe_target || error?.probeUrl || '') || null;
  const evidenceMeta = buildExternalValidationEvidenceMeta({
    probeStatus: source.ok ? 'ok' : probeStatus,
    probeTarget: normalizedProbeTarget,
    source: externalProbe?.source || source.source || 'external_mcp',
    sourceRef: source.source_ref,
    lastCheckedAt,
  });
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
    probeFailureKind: source.ok ? null : (normalizeText(error?.kind || probeStatus) || null),
    probeFailureDetail: source.ok ? null : (normalizeText(error?.detail || '') || null),
    probeStatusCode: source.ok ? null : normalizeStatusCode(error?.statusCode),
    probeTarget: normalizedProbeTarget,
    pre_adjudication: Boolean(source.pre_adjudication),
    adjudication_state: normalizeText(source.adjudication_state) || (source.pre_adjudication ? 'pending_lead_cycle' : null),
    evidence_id: normalizeText(source.evidence_id || source.investigation_id || '') || null,
    investigation_id: normalizeText(source.investigation_id || source.evidence_id || '') || null,
    source_ref: normalizeText(source.source_ref || '') || null,
    externalProbeLive: evidenceMeta.externalProbeLive,
    usedFallback: evidenceMeta.usedFallback,
    mcpEvidenceSource: evidenceMeta.mcpEvidenceSource,
  };
}

async function fetchExternalQaProbe({
  probeUrl = DEFAULT_EXTERNAL_QA_PROBE_URL,
  timeoutMs = DEFAULT_EXTERNAL_QA_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    return buildProbeFailureResult({
      kind: 'missing_fetch',
      message: 'No fetch implementation is available for the external QA probe.',
      probeUrl,
    });
  }

  if (!parseTargetUrl(probeUrl)) {
    return buildProbeFailureResult({
      kind: 'bad_config',
      message: 'External QA probe target is misconfigured.',
      probeUrl,
      detail: `Invalid probe URL: ${normalizeText(probeUrl) || '<empty>'}.`,
    });
  }

  const { controller, timeout } = createTimeoutController(timeoutMs);
  try {
    const response = await fetchImpl(probeUrl, {
      method: 'GET',
      signal: controller?.signal,
    });
    if (!response.ok) {
      return buildProbeFailureResult({
        kind: 'http_error',
        message: `External QA probe returned HTTP ${response.status}.`,
        statusCode: response.status,
        probeUrl,
      });
    }
    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      return buildProbeFailureResult({
        kind: 'invalid_json',
        message: 'External QA probe returned invalid JSON.',
        probeUrl,
        detail: normalizeText(error?.message || error) || 'Probe response body could not be parsed as JSON.',
      });
    }
    const contractIssues = buildProbeContractIssues(payload);
    if (contractIssues.length) {
      return buildProbeFailureResult({
        kind: 'invalid_contract',
        message: 'External QA probe returned an invalid contract.',
        probeUrl,
        detail: contractIssues.join(' '),
      });
    }
    return {
      ok: true,
      status: 'ok',
      external_probe: payload,
      probe_target: normalizeText(probeUrl) || DEFAULT_EXTERNAL_QA_PROBE_URL,
    };
  } catch (error) {
    const classified = classifyProbeTransportFailure(error, probeUrl, timeoutMs);
    return buildProbeFailureResult({
      kind: classified.kind,
      message: classified.message,
      probeUrl,
      detail: classified.detail,
    });
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function probeQaMcpTcpTransport({
  probeUrl = DEFAULT_EXTERNAL_QA_PROBE_URL,
  timeoutMs = DEFAULT_EXTERNAL_QA_TIMEOUT_MS,
} = {}) {
  const target = buildQaMcpTarget(probeUrl);
  if (!target.valid) {
    return {
      reachable: false,
      responded: false,
      http_status: null,
      failure_kind: 'bad_config',
      failure_detail: `Invalid probe URL: ${normalizeText(probeUrl) || '<empty>'}.`,
    };
  }

  return new Promise((resolve) => {
    let settled = false;
    const socket = net.connect({
      host: target.host,
      port: target.port,
    });

    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      resolve({
        reachable: Boolean(result?.reachable),
        responded: false,
        http_status: null,
        failure_kind: normalizeText(result?.failure_kind) || null,
        failure_detail: normalizeText(result?.failure_detail) || null,
      });
    };

    socket.setTimeout(Math.max(250, Number(timeoutMs) || DEFAULT_EXTERNAL_QA_TIMEOUT_MS));
    socket.once('connect', () => finish({ reachable: true }));
    socket.once('timeout', () => finish({
      reachable: false,
      failure_kind: 'timeout',
      failure_detail: `TCP connection to ${target.host}:${target.port} timed out after ${Math.max(250, Number(timeoutMs) || DEFAULT_EXTERNAL_QA_TIMEOUT_MS)}ms.`,
    }));
    socket.once('error', (error) => {
      const classified = classifyProbeTransportFailure(error, probeUrl, timeoutMs);
      finish({
        reachable: false,
        failure_kind: classified.kind,
        failure_detail: classified.detail || classified.message,
      });
    });
  });
}

async function buildQaMcpPreflightCheck({
  qaState = null,
  probeUrl = DEFAULT_EXTERNAL_QA_PROBE_URL,
  timeoutMs = DEFAULT_EXTERNAL_QA_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
} = {}) {
  const target = buildQaMcpTarget(probeUrl);
  if (!target.valid) {
    return createPreflightFailureResult({
      target,
      transport: {
        reachable: false,
        responded: false,
        failure_kind: 'bad_config',
        failure_detail: `Invalid probe URL: ${normalizeText(probeUrl) || '<empty>'}.`,
      },
      payload: {
        has_body: false,
        parsed_json: false,
        contract_valid: false,
      },
      verdict: 'bad_config',
    });
  }

  const tcpTransport = await probeQaMcpTcpTransport({
    probeUrl: target.server_url,
    timeoutMs,
  });
  if (!tcpTransport.reachable) {
    return createPreflightFailureResult({
      target,
      transport: tcpTransport,
      payload: {
        has_body: false,
        parsed_json: false,
        contract_valid: false,
      },
      verdict: mapProbeFailureToPreflightVerdict(tcpTransport.failure_kind, target.server_url),
    });
  }

  if (typeof fetchImpl !== 'function') {
    return createPreflightFailureResult({
      target,
      transport: {
        reachable: true,
        responded: false,
        failure_kind: 'missing_fetch',
        failure_detail: 'No fetch implementation is available for the QA MCP preflight call.',
      },
      payload: {
        has_body: false,
        parsed_json: false,
        contract_valid: false,
      },
      verdict: 'bad_response',
    });
  }

  const { controller, timeout } = createTimeoutController(timeoutMs);
  try {
    const response = await fetchImpl(target.server_url, {
      method: 'GET',
      signal: controller?.signal,
    });
    const responseText = await response.text();
    const hasBody = Boolean(normalizeText(responseText));
    const baseResult = {
      source: 'qa_mcp_preflight',
      target,
      transport: {
        reachable: true,
        http_status: normalizeStatusCode(response.status),
        responded: true,
        failure_kind: null,
        failure_detail: null,
      },
      payload: {
        has_body: hasBody,
        parsed_json: false,
        contract_valid: false,
      },
      verdict: 'bad_response',
      summary: '',
      next_action: null,
      qa_path: null,
    };

    if (!response.ok) {
      const result = {
        ...baseResult,
        summary: summarizeQaMcpPreflight({
          verdict: 'bad_response',
          target,
          transport: baseResult.transport,
          payload: baseResult.payload,
        }),
        next_action: buildQaMcpNextAction({
          verdict: 'bad_response',
          target,
          detail: `HTTP ${response.status}`,
        }),
      };
      return result;
    }

    if (!hasBody) {
      const result = {
        ...baseResult,
        summary: summarizeQaMcpPreflight({
          verdict: 'bad_response',
          target,
          transport: baseResult.transport,
          payload: baseResult.payload,
        }),
        next_action: buildQaMcpNextAction({
          verdict: 'bad_response',
          target,
        }),
      };
      return result;
    }

    let parsedPayload = null;
    try {
      parsedPayload = JSON.parse(responseText);
    } catch (error) {
      const result = {
        ...baseResult,
        transport: {
          ...baseResult.transport,
          failure_kind: 'invalid_json',
          failure_detail: normalizeText(error?.message || error) || 'Probe response body could not be parsed as JSON.',
        },
        payload: {
          ...baseResult.payload,
          parsed_json: false,
          contract_valid: false,
        },
        summary: summarizeQaMcpPreflight({
          verdict: 'bad_response',
          target,
          transport: {
            ...baseResult.transport,
            failure_kind: 'invalid_json',
            failure_detail: normalizeText(error?.message || error) || 'Probe response body could not be parsed as JSON.',
          },
          payload: {
            ...baseResult.payload,
            parsed_json: false,
            contract_valid: false,
          },
        }),
        next_action: buildQaMcpNextAction({
          verdict: 'bad_response',
          target,
          detail: normalizeText(error?.message || error) || null,
        }),
      };
      return result;
    }

    const contractIssues = buildProbeContractIssues(parsedPayload);
    if (contractIssues.length) {
      const transport = {
        ...baseResult.transport,
        failure_kind: 'invalid_contract',
        failure_detail: contractIssues.join(' '),
      };
      return {
        ...baseResult,
        transport,
        payload: {
          ...baseResult.payload,
          parsed_json: true,
          contract_valid: false,
        },
        verdict: 'invalid_contract',
        summary: summarizeQaMcpPreflight({
          verdict: 'invalid_contract',
          target,
          transport,
          payload: {
            ...baseResult.payload,
            parsed_json: true,
            contract_valid: false,
          },
        }),
        next_action: buildQaMcpNextAction({
          verdict: 'invalid_contract',
          target,
          detail: contractIssues.join(' '),
        }),
      };
    }

    const qaPath = await buildExternalQaProbeCheckPayload({
      qaState,
      probeUrl: target.server_url,
      timeoutMs,
      fetchImpl,
      externalProbeResultOverride: {
        ok: true,
        status: 'ok',
        external_probe: parsedPayload,
        probe_target: target.server_url,
      },
      persistInvestigations: false,
    });

    return {
      source: 'qa_mcp_preflight',
      target,
      transport: {
        ...baseResult.transport,
      },
      payload: {
        ...baseResult.payload,
        parsed_json: true,
        contract_valid: true,
      },
      verdict: 'ok',
      summary: summarizeQaMcpPreflight({
        verdict: 'ok',
        target,
        transport: baseResult.transport,
        payload: {
          ...baseResult.payload,
          parsed_json: true,
          contract_valid: true,
        },
      }),
      next_action: buildQaMcpNextAction({
        verdict: 'ok',
        target,
      }),
      qa_path: {
        consumer: 'runQaLeadCycle -> buildExternalQaProbeCheckPayload',
        consumed: Boolean(qaPath && typeof qaPath === 'object'),
        probe_status: normalizeText(qaPath?.probe_status || qaPath?.externalValidation?.probeStatus || 'unknown') || 'unknown',
        status_match: Boolean(qaPath?.comparison?.status_match),
        investigation_would_trigger: Boolean(qaPath?.investigation_would_trigger),
      },
    };
  } catch (error) {
    const classified = classifyProbeTransportFailure(error, target.server_url, timeoutMs);
    const transport = {
      reachable: true,
      responded: false,
      http_status: null,
      failure_kind: classified.kind,
      failure_detail: classified.detail || classified.message,
    };
    return createPreflightFailureResult({
      target,
      transport,
      payload: {
        has_body: false,
        parsed_json: false,
        contract_valid: false,
      },
      verdict: mapProbeFailureToPreflightVerdict(classified.kind, target.server_url),
      detail: classified.detail || classified.message,
    });
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
  persistInvestigations = true,
  externalProbeResultOverride = null,
} = {}) {
  const resolvedInvestigationRootPath = investigationRootPath || rootPath || null;
  const internal_truth = buildInternalQaTruth(qaState);
  const externalProbeResult = externalProbeResultOverride && typeof externalProbeResultOverride === 'object'
    ? externalProbeResultOverride
    : await fetchExternalQaProbe({
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
  if (shouldInvestigate && persistInvestigations) {
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
      investigation_would_trigger: shouldInvestigate,
      investigation_created: investigationCreated,
      investigation_id: investigation?.id || null,
      pre_adjudication: Boolean(investigation?.id),
      adjudication_state: investigation?.id ? 'pending_lead_cycle' : null,
      evidence_id: investigation?.id || null,
      probe_target: externalProbeResult.probe_target || normalizeText(probeUrl) || DEFAULT_EXTERNAL_QA_PROBE_URL,
      source_ref: 'ui/externalQaProbe.buildExternalQaProbeCheckPayload',
    };
  }

  return {
    ok: true,
    external_probe: externalProbeResult.external_probe,
    internal_truth,
    comparison,
    probe_status: normalizeText(externalProbeResult.status) || (externalProbeResult.ok ? 'ok' : 'error'),
    investigation_would_trigger: shouldInvestigate,
    investigation_created: investigationCreated,
    investigation_id: investigation?.id || null,
    pre_adjudication: Boolean(investigation?.id),
    adjudication_state: investigation?.id ? 'pending_lead_cycle' : null,
    evidence_id: investigation?.id || null,
    probe_target: externalProbeResult.probe_target || normalizeText(probeUrl) || DEFAULT_EXTERNAL_QA_PROBE_URL,
    source_ref: 'ui/externalQaProbe.buildExternalQaProbeCheckPayload',
  };
}

module.exports = {
  DEFAULT_EXTERNAL_QA_PROBE_URL,
  DEFAULT_EXTERNAL_QA_TIMEOUT_MS,
  DEFAULT_QA_INVESTIGATIONS_PATH,
  buildExternalQaProbeCheckPayload,
  buildQaMcpPreflightCheck,
  buildExternalValidationSnapshot,
  appendQaInvestigation,
  adjudicateAcceptedQaInvestigation,
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
