const {
  DEFAULT_EXTERNAL_QA_PROBE_URL,
} = require('./externalQaProbe');
const {
  QA_RESEARCH_SERVER_URL,
} = require('./qaResearch');

const QA_MCP_RECENT_WINDOW_MS = 15 * 60 * 1000;
const QA_MCP_STALE_WINDOW_MS = 90 * 60 * 1000;
const QA_EXTERNAL_DECISION_TRIGGERS = Object.freeze([
  'external_mismatch',
  'probe_failure',
  'freshness_unknown',
]);

function normalizeText(value = '') {
  return String(value || '').trim();
}

function normalizeIsoTimestamp(...values) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized) continue;
    const parsed = Date.parse(normalized);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  return null;
}

function getTimeMs(value = null) {
  const parsed = Date.parse(normalizeText(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeNumeric(value = null) {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toBool(value = false) {
  return value === true;
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

function isLocalProbeTarget(target = '') {
  const parsed = parseTargetUrl(target);
  const hostname = normalizeText(parsed?.hostname).toLowerCase();
  return ['127.0.0.1', 'localhost', '::1'].includes(hostname);
}

function latestTimestamp(...values) {
  let latestMs = null;
  for (const value of values) {
    const parsed = getTimeMs(value);
    if (parsed == null) continue;
    if (latestMs == null || parsed > latestMs) {
      latestMs = parsed;
    }
  }
  return latestMs == null ? null : new Date(latestMs).toISOString();
}

function isRecent(value = null, nowMs = Date.now(), windowMs = QA_MCP_RECENT_WINDOW_MS) {
  const parsed = getTimeMs(value);
  return parsed != null && (nowMs - parsed) <= windowMs;
}

function isStale(value = null, nowMs = Date.now(), windowMs = QA_MCP_STALE_WINDOW_MS) {
  const parsed = getTimeMs(value);
  return parsed != null && (nowMs - parsed) > windowMs;
}

function normalizeProbeStatus(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return 'unavailable';
  if (['ok', 'pass', 'reachable', 'available', 'success'].includes(normalized)) return 'ok';
  if (['offline', 'bad_config', 'bad_response'].includes(normalized)) return normalized;
  if (['timeout', 'timed_out'].includes(normalized)) return 'timeout';
  if (['http_error', 'invalid_contract', 'invalid_json', 'missing_fetch', 'unreachable'].includes(normalized)) return normalized;
  if (['error', 'fail', 'failed', 'unavailable', 'offline'].includes(normalized)) return normalized === 'failed' ? 'fail' : normalized;
  return normalized;
}

function normalizeCallStatus(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return 'unknown';
  if (['available', 'ok', 'pass', 'success'].includes(normalized)) return 'ok';
  if (['offline', 'bad_config', 'bad_response', 'http_error', 'timeout', 'unreachable'].includes(normalized)) return normalized;
  if (['unavailable', 'error', 'fail', 'failed'].includes(normalized)) return normalized === 'failed' ? 'fail' : normalized;
  return normalized;
}

function lastSuccessStatus(status = '') {
  return normalizeCallStatus(status) === 'ok';
}

function lastFailureStatus(status = '') {
  const normalized = normalizeCallStatus(status);
  return normalized !== 'ok' && normalized !== 'unknown';
}

function normalizeResearchFailureKind(note = null) {
  const source = note && typeof note === 'object' ? note : {};
  return normalizeText(source.failure_kind || source.failureKind || source.status || '') || null;
}

function buildCurrentFailure({
  probeFailureAt = null,
  probeFailureKind = null,
  probeFailureDetail = null,
  probeTarget = null,
  researchFailureAt = null,
  researchFailureKind = null,
  researchFailureDetail = null,
  researchTarget = null,
} = {}) {
  const candidates = [
    probeFailureAt ? {
      at: probeFailureAt,
      kind: normalizeText(probeFailureKind) || 'unreachable',
      detail: normalizeText(probeFailureDetail) || null,
      target: normalizeText(probeTarget) || null,
      tool: 'external_probe_check',
    } : null,
    researchFailureAt ? {
      at: researchFailureAt,
      kind: normalizeText(researchFailureKind) || 'unavailable',
      detail: normalizeText(researchFailureDetail) || null,
      target: normalizeText(researchTarget) || null,
      tool: 'qa_research_note',
    } : null,
  ].filter(Boolean);
  candidates.sort((left, right) => getTimeMs(right.at) - getTimeMs(left.at));
  return candidates[0] || null;
}

function latestResearchNote(researchState = null) {
  const notes = Array.isArray(researchState?.notes) ? researchState.notes : [];
  let latest = null;
  let latestMs = null;
  for (const note of notes) {
    const noteAt = normalizeIsoTimestamp(note?.created_at, note?.updated_at, note?.timestamp);
    const noteMs = getTimeMs(noteAt);
    if (noteMs == null) continue;
    if (latestMs == null || noteMs > latestMs) {
      latestMs = noteMs;
      latest = note;
    }
  }
  return latest;
}

function latestResearchNoteByPredicate(researchState = null, predicate = () => false) {
  const notes = Array.isArray(researchState?.notes) ? researchState.notes : [];
  let latest = null;
  let latestMs = null;
  for (const note of notes) {
    if (!predicate(note)) continue;
    const noteAt = normalizeIsoTimestamp(note?.created_at, note?.updated_at, note?.timestamp);
    const noteMs = getTimeMs(noteAt);
    if (noteMs == null) continue;
    if (latestMs == null || noteMs > latestMs) {
      latestMs = noteMs;
      latest = note;
    }
  }
  return latest;
}

function resolveLastQaGateSource({
  externalValidation = null,
  structuredSummary = null,
  latestBrowserRun = null,
  localGate = null,
  repairLoop = null,
} = {}) {
  const candidates = [
    {
      source: normalizeText(externalValidation?.source) || 'external_mcp',
      at: normalizeIsoTimestamp(externalValidation?.lastCheckedAt),
    },
    {
      source: 'structured_qa',
      at: normalizeIsoTimestamp(structuredSummary?.finishedAt, structuredSummary?.updatedAt, structuredSummary?.createdAt),
    },
    {
      source: 'browser_qa',
      at: normalizeIsoTimestamp(
        latestBrowserRun?.sourceTrace?.observedAt,
        latestBrowserRun?.completedAt,
        latestBrowserRun?.finishedAt,
        latestBrowserRun?.createdAt,
      ),
    },
    {
      source: 'local_gate',
      at: normalizeIsoTimestamp(
        localGate?.studioBoot?.sourceTrace?.observedAt,
        localGate?.studioBoot?.finishedAt,
        localGate?.studioBoot?.createdAt,
        localGate?.unit?.sourceTrace?.observedAt,
        localGate?.unit?.finishedAt,
        localGate?.unit?.createdAt,
      ),
    },
    {
      source: 'repair_validation',
      at: normalizeIsoTimestamp(repairLoop?.latestAttempt?.timestamp, repairLoop?.latestAttempt?.created_at),
    },
  ].filter((entry) => entry.at);
  if (!candidates.length) {
    return { source: 'unknown', at: null };
  }
  candidates.sort((left, right) => getTimeMs(right.at) - getTimeMs(left.at));
  return candidates[0];
}

function buildStatusSummary(status = 'offline', usageState = 'configured_but_unused') {
  if (status === 'live') return 'QA is live and actively gating with MCP-backed evidence.';
  if (status === 'reachable_but_idle') {
    return usageState === 'configured_but_unused'
      ? 'QA MCP is configured but has not been exercised yet.'
      : 'QA MCP is reachable but currently idle.';
  }
  if (status === 'stale') return 'QA MCP was reachable, but the proof-of-life signal is stale.';
  if (status === 'degraded') return 'QA MCP is configured, but recent MCP health or calls are degraded.';
  return 'QA MCP is offline or has not produced a usable proof-of-life signal yet.';
}

function buildStatusNotes({
  status = 'offline',
  usageState = 'configured_but_unused',
  mcpReachable = false,
  usingMcpForQaDecisions = false,
  lastQaGateSource = 'unknown',
  lastPingStatus = 'unavailable',
  lastPingFailureKind = null,
  lastPingFailureDetail = null,
  lastPingHttpStatus = null,
  lastPingTarget = null,
  lastCallTool = null,
  lastCallStatus = 'unknown',
  researchLastCallStatus = 'unknown',
  researchFailureKind = null,
  researchFailureDetail = null,
  researchTarget = null,
  recoveryDetected = false,
  recoveredFromKind = null,
} = {}) {
  const notes = [];
  if (usageState === 'configured_but_unused') {
    notes.push('Configured but unused: no completed MCP ping or research call is recorded yet.');
  } else if (status === 'reachable_but_idle') {
    notes.push('Reachable but idle: MCP is up, but it is not the current QA deciding signal.');
  } else if (status === 'live') {
    notes.push('Active MCP gating: fresh MCP-backed evidence is influencing QA decisions.');
  } else if (status === 'stale') {
    notes.push('Reachable but stale: the most recent MCP proof-of-life signal is outside the freshness window.');
  } else if (status === 'degraded') {
    notes.push('Degraded: the latest MCP ping or call failed, timed out, or returned unavailable.');
  } else {
    notes.push('Offline: no recent usable MCP heartbeat is available.');
  }
  if (lastQaGateSource && lastQaGateSource !== 'unknown') {
    notes.push(`Latest QA gate source: ${lastQaGateSource}.`);
  }
  if (lastPingStatus && lastPingStatus !== 'unavailable') {
    notes.push(`Last MCP ping status: ${lastPingStatus}.`);
  }
  if (lastPingFailureKind) {
    const httpClause = Number.isFinite(Number(lastPingHttpStatus)) ? ` HTTP ${Number(lastPingHttpStatus)}.` : '';
    notes.push(`Latest MCP ping failure: ${lastPingFailureKind}.${httpClause}`.trim());
  }
  if (lastPingFailureDetail) {
    notes.push(`Failure detail: ${lastPingFailureDetail}`);
  }
  if (lastPingTarget) {
    notes.push(`Probe target: ${lastPingTarget}.`);
  }
  if (lastCallTool) {
    notes.push(`Last MCP call: ${lastCallTool} (${lastCallStatus || 'unknown'}).`);
  }
  if (researchLastCallStatus && researchLastCallStatus !== 'unknown') {
    notes.push(`Latest research call status: ${researchLastCallStatus}.`);
  }
  if (researchFailureKind) {
    notes.push(`Latest research failure: ${researchFailureKind}.`);
  }
  if (researchFailureDetail) {
    notes.push(`Research failure detail: ${researchFailureDetail}`);
  }
  if (researchTarget) {
    notes.push(`Research target: ${researchTarget}.`);
  }
  if (recoveryDetected && recoveredFromKind) {
    notes.push(`Recovery detected after ${recoveredFromKind}.`);
  }
  if (mcpReachable && !usingMcpForQaDecisions && status !== 'live') {
    notes.push('MCP is reachable, but QA is currently relying on a non-MCP gate source.');
  }
  return notes;
}

function buildQaMcpLiveStatus(input = {}, options = {}) {
  const nowMs = options.nowMs ?? getTimeMs(options.now) ?? Date.now();
  const externalValidation = input.externalValidation && typeof input.externalValidation === 'object'
    ? input.externalValidation
    : null;
  const researchState = input.researchState && typeof input.researchState === 'object'
    ? input.researchState
    : null;
  const openInvestigations = Array.isArray(input.openInvestigations) ? input.openInvestigations : [];
  const repairLoop = input.repairLoop && typeof input.repairLoop === 'object' ? input.repairLoop : null;
  const structuredSummary = input.structuredSummary && typeof input.structuredSummary === 'object'
    ? input.structuredSummary
    : null;
  const latestBrowserRun = input.latestBrowserRun && typeof input.latestBrowserRun === 'object'
    ? input.latestBrowserRun
    : null;
  const localGate = input.localGate && typeof input.localGate === 'object' ? input.localGate : null;

  const latestNote = latestResearchNote(researchState);
  const latestResearchFailureNote = latestResearchNoteByPredicate(researchState, (note) => !note?.research_available);
  const lastPingAt = normalizeIsoTimestamp(externalValidation?.lastCheckedAt);
  const lastPingStatus = normalizeProbeStatus(externalValidation?.probeStatus);
  const lastPingSource = normalizeText(externalValidation?.source) || 'external_mcp';
  const lastPingFailureKind = normalizeText(externalValidation?.probeFailureKind || externalValidation?.error?.kind || '') || null;
  const lastPingFailureDetail = normalizeText(externalValidation?.probeFailureDetail || externalValidation?.errorMessage || '') || null;
  const lastPingHttpStatus = normalizeNumeric(externalValidation?.probeStatusCode);
  const lastPingTarget = normalizeText(externalValidation?.probeTarget || '') || null;
  const probeLastSuccessAt = lastSuccessStatus(lastPingStatus) ? lastPingAt : null;
  const probeLastFailureAt = lastFailureStatus(lastPingStatus) ? lastPingAt : null;

  const researchLastCallAt = normalizeIsoTimestamp(latestNote?.created_at, latestNote?.updated_at, latestNote?.timestamp);
  const researchLastCallStatus = latestNote
    ? normalizeCallStatus(latestNote.research_available ? 'ok' : normalizeResearchFailureKind(latestNote))
    : 'unknown';
  const researchFailureKind = latestNote && !latestNote.research_available
    ? normalizeResearchFailureKind(latestNote)
    : null;
  const researchFailureDetail = latestNote && !latestNote.research_available
    ? normalizeText(latestNote.failure_detail || latestNote.error_message || '') || null
    : null;
  const researchTarget = normalizeText(latestNote?.server_url || '') || QA_RESEARCH_SERVER_URL;
  const researchLastSuccessAt = latestNote?.research_available ? researchLastCallAt : null;
  const researchLastFailureAt = latestNote && !latestNote.research_available ? researchLastCallAt : null;
  const researchMostRecentFailureAt = normalizeIsoTimestamp(
    latestResearchFailureNote?.created_at,
    latestResearchFailureNote?.updated_at,
    latestResearchFailureNote?.timestamp,
  );
  const researchMostRecentFailureKind = latestResearchFailureNote
    ? normalizeResearchFailureKind(latestResearchFailureNote)
    : null;

  const lastCallCandidates = [
    lastPingAt ? {
      at: lastPingAt,
      tool: 'external_probe_check',
      status: lastPingStatus,
      source: lastPingSource,
    } : null,
    latestNote ? {
      at: normalizeIsoTimestamp(latestNote.created_at, latestNote.updated_at, latestNote.timestamp),
      tool: 'qa_research_note',
      status: researchLastCallStatus,
      source: normalizeText(latestNote.source) || 'external_mcp',
    } : null,
  ].filter(Boolean);
  lastCallCandidates.sort((left, right) => getTimeMs(right.at) - getTimeMs(left.at));
  const lastCall = lastCallCandidates[0] || null;

  const configuredTools = [];
  if (normalizeText(DEFAULT_EXTERNAL_QA_PROBE_URL)) configuredTools.push('external_probe_check');
  if (normalizeText(QA_RESEARCH_SERVER_URL)) configuredTools.push('qa_research_note');
  const mcpConfigured = configuredTools.length > 0;

  const lastQaGate = resolveLastQaGateSource({
    externalValidation,
    structuredSummary,
    latestBrowserRun,
    localGate,
    repairLoop,
  });
  const hasExternalDecisionPressure = openInvestigations.some((entry) => QA_EXTERNAL_DECISION_TRIGGERS.includes(normalizeText(entry?.trigger)));
  const usingMcpForQaDecisions = Boolean(lastPingAt) && (
    lastQaGate.source === lastPingSource
    || hasExternalDecisionPressure
  );
  const lastCallStatus = normalizeCallStatus(lastCall?.status);
  const mcpReachable = lastPingStatus === 'ok' || lastCallStatus === 'ok' || researchLastCallStatus === 'ok';
  const freshSuccessfulPing = Boolean(probeLastSuccessAt) && !isStale(probeLastSuccessAt, nowMs);
  const liveHelperEvidence = toBool(externalValidation?.externalProbeLive)
    || (
      freshSuccessfulPing
      && lastPingSource === 'external_mcp'
      && isLocalProbeTarget(lastPingTarget || DEFAULT_EXTERNAL_QA_PROBE_URL)
    );
  const freshLiveProbe = freshSuccessfulPing && liveHelperEvidence;
  const recentProofAt = lastCall?.at || lastPingAt || null;
  const lastSuccessAt = latestTimestamp(probeLastSuccessAt, researchLastSuccessAt);
  const currentFailure = buildCurrentFailure({
    probeFailureAt: probeLastFailureAt,
    probeFailureKind: lastPingFailureKind,
    probeFailureDetail: lastPingFailureDetail,
    probeTarget: lastPingTarget,
    researchFailureAt: researchLastFailureAt,
    researchFailureKind,
    researchFailureDetail,
    researchTarget,
  });
  const lastFailureAt = currentFailure?.at || latestTimestamp(probeLastFailureAt, researchMostRecentFailureAt, researchLastFailureAt);
  const recoveryDetected = Boolean(lastSuccessAt && lastFailureAt && getTimeMs(lastSuccessAt) > getTimeMs(lastFailureAt));
  const recoveredFromKind = recoveryDetected
    ? (currentFailure?.kind || researchMostRecentFailureKind || lastPingFailureKind || null)
    : null;
  const freshness = !recentProofAt
    ? 'unknown'
    : (isStale(recentProofAt, nowMs) ? 'stale' : 'fresh');
  const qaLoopHeartbeatAt = latestTimestamp(
    recentProofAt,
    structuredSummary?.finishedAt,
    latestBrowserRun?.completedAt,
    latestBrowserRun?.finishedAt,
    localGate?.studioBoot?.finishedAt,
    localGate?.unit?.finishedAt,
    repairLoop?.latestAttempt?.timestamp,
    repairLoop?.latestAttempt?.created_at,
  );
  const lastCompletedCycleAt = latestTimestamp(
    externalValidation?.lastCheckedAt,
    structuredSummary?.finishedAt,
    latestBrowserRun?.completedAt,
    latestBrowserRun?.finishedAt,
    repairLoop?.latestAttempt?.timestamp,
  );

  let status = 'offline';
  let usageState = 'configured_but_unused';
  if (!mcpConfigured) {
    status = 'offline';
    usageState = 'offline';
  } else if (!lastPingAt && !lastCall?.at) {
    status = 'offline';
    usageState = 'configured_but_unused';
  } else if (freshLiveProbe && usingMcpForQaDecisions) {
    status = 'live';
    usageState = 'active_gating';
  } else if (freshSuccessfulPing) {
    status = 'reachable_but_idle';
    usageState = lastCall?.at || lastPingAt ? 'idle' : 'configured_but_unused';
  } else if (recentProofAt && isStale(recentProofAt, nowMs)) {
    status = 'stale';
    usageState = 'stale';
  } else if (currentFailure && (!lastSuccessAt || getTimeMs(currentFailure.at) >= getTimeMs(lastSuccessAt))) {
    status = currentFailure.kind === 'offline' ? 'offline' : 'degraded';
    usageState = currentFailure.kind === 'offline' ? 'offline' : 'degraded';
  } else if (mcpReachable && usingMcpForQaDecisions) {
    status = 'live';
    usageState = 'active_gating';
  } else if (mcpReachable) {
    status = 'reachable_but_idle';
    usageState = lastCall?.at || lastPingAt ? 'idle' : 'configured_but_unused';
  }

  return {
    source: 'qa_mcp_live_status',
    status,
    usage_state: usageState,
    freshness,
    summary: buildStatusSummary(status, usageState),
    heartbeat_at: qaLoopHeartbeatAt,
    last_completed_cycle_at: lastCompletedCycleAt,
    mcp_configured: mcpConfigured,
    configured_tools: configuredTools,
    mcp_reachable: mcpReachable,
    external_probe_live: liveHelperEvidence,
    last_ping_at: lastPingAt,
    last_ping_status: lastPingStatus,
    last_ping_source: lastPingSource,
    last_ping_failure_kind: lastPingFailureKind,
    last_ping_failure_detail: lastPingFailureDetail,
    last_ping_http_status: lastPingHttpStatus,
    last_ping_target: lastPingTarget,
    research_target: researchTarget,
    research_last_call_at: researchLastCallAt,
    research_last_call_status: researchLastCallStatus,
    research_failure_kind: researchFailureKind,
    research_failure_detail: researchFailureDetail,
    last_call_at: lastCall?.at || null,
    last_call_tool: lastCall?.tool || null,
    last_call_status: lastCallStatus || 'unknown',
    last_call_source: lastCall?.source || null,
    last_qa_gate_source: lastQaGate.source || 'unknown',
    using_mcp_for_qa_decisions: usingMcpForQaDecisions,
    last_success_at: lastSuccessAt,
    last_failure_at: lastFailureAt,
    current_failure_kind: currentFailure?.kind || null,
    current_failure_tool: currentFailure?.tool || null,
    recovery_detected: recoveryDetected,
    recovered_at: recoveryDetected ? lastSuccessAt : null,
    recovered_from_kind: recoveredFromKind,
    notes: buildStatusNotes({
      status,
      usageState,
      mcpReachable,
      usingMcpForQaDecisions,
      lastQaGateSource: lastQaGate.source,
      lastPingStatus,
      lastPingFailureKind,
      lastPingFailureDetail,
      lastPingHttpStatus,
      lastPingTarget,
      lastCallTool: lastCall?.tool || null,
      lastCallStatus,
      researchLastCallStatus,
      researchFailureKind,
      researchFailureDetail,
      researchTarget,
      recoveryDetected,
      recoveredFromKind,
    }),
  };
}

module.exports = {
  QA_EXTERNAL_DECISION_TRIGGERS,
  QA_MCP_RECENT_WINDOW_MS,
  QA_MCP_STALE_WINDOW_MS,
  buildQaMcpLiveStatus,
};
