const normalizeText = (value = '') => String(value || '').trim();

function normalizeFeedItems(outputFeed = null) {
  return Array.isArray(outputFeed?.items) ? outputFeed.items.filter(Boolean) : [];
}

function hasCompletedCycle(run = null) {
  return Boolean(normalizeText(
    run?.finished_at
    || run?.finishedAt
    || run?.last_completed_cycle_at
    || run?.lastCompletedCycleAt,
  ));
}

function resolveOperatorState(qaLeadOutput = null) {
  const leadState = qaLeadOutput?.state && typeof qaLeadOutput.state === 'object' ? qaLeadOutput.state : null;
  const latestRun = qaLeadOutput?.latestRun && typeof qaLeadOutput.latestRun === 'object' ? qaLeadOutput.latestRun : null;
  return leadState || latestRun || null;
}

function resolveLatestCompletedCycle(qaLeadOutput = null) {
  const leadState = qaLeadOutput?.state && typeof qaLeadOutput.state === 'object' ? qaLeadOutput.state : null;
  const latestRun = qaLeadOutput?.latestRun && typeof qaLeadOutput.latestRun === 'object' ? qaLeadOutput.latestRun : null;
  if (hasCompletedCycle(latestRun)) return latestRun;
  if (hasCompletedCycle(leadState)) return leadState;
  return null;
}

function resolveLiveStatus(qaState = {}, qaLeadOutput = null) {
  const operatorState = resolveOperatorState(qaLeadOutput);
  return operatorState?.live_status && typeof operatorState.live_status === 'object'
    ? operatorState.live_status
    : (qaState?.qaMcpLiveStatus && typeof qaState.qaMcpLiveStatus === 'object' ? qaState.qaMcpLiveStatus : null);
}

function resolveExternalValidation(qaState = {}, qaLeadOutput = null) {
  const completedCycle = resolveLatestCompletedCycle(qaLeadOutput);
  const operatorState = resolveOperatorState(qaLeadOutput);
  if (completedCycle?.external_validation && typeof completedCycle.external_validation === 'object') {
    return completedCycle.external_validation;
  }
  if (operatorState?.external_validation && typeof operatorState.external_validation === 'object') {
    return operatorState.external_validation;
  }
  return qaState?.externalValidation && typeof qaState.externalValidation === 'object'
    ? qaState.externalValidation
    : null;
}

function summarizeQaLiveCycle({
  completedCycle = null,
  operatorState = null,
  liveStatus = null,
  externalValidation = null,
  latestFeedEntry = null,
} = {}) {
  const cycleId = normalizeText(completedCycle?.id || operatorState?.id) || null;
  if (!cycleId) {
    return 'QA has not completed a live cycle yet.';
  }
  const cycleStatus = normalizeText(completedCycle?.status || operatorState?.status) || 'unknown';
  const gateSource = normalizeText(liveStatus?.last_qa_gate_source || liveStatus?.lastQaGateSource) || 'unknown';
  const externalStatus = normalizeText(externalValidation?.status || externalValidation?.probeStatus) || 'unknown';
  const mcpStatus = normalizeText(liveStatus?.status) || 'unknown';
  const feedStatus = latestFeedEntry ? 'captured' : 'missing';
  return `${cycleId} ${cycleStatus} | MCP ${mcpStatus} | gate ${gateSource} | external ${externalStatus} | feed ${feedStatus}`;
}

function buildQaLiveCycleState({
  qaState = {},
  qaLeadOutput = null,
  outputFeed = null,
} = {}) {
  const operatorState = resolveOperatorState(qaLeadOutput);
  const completedCycle = resolveLatestCompletedCycle(qaLeadOutput);
  const liveStatus = resolveLiveStatus(qaState, qaLeadOutput);
  const externalValidation = resolveExternalValidation(qaState, qaLeadOutput);
  const outputFeedItems = normalizeFeedItems(outputFeed);
  const latestCycleId = normalizeText(completedCycle?.id || operatorState?.id) || null;
  const latestFeedEntry = latestCycleId
    ? outputFeedItems.find((entry) => normalizeText(entry?.meta?.cycleId) === latestCycleId) || null
    : null;
  const latestCompletedAt = normalizeText(
    completedCycle?.finished_at
    || completedCycle?.finishedAt
    || completedCycle?.last_completed_cycle_at
    || completedCycle?.lastCompletedCycleAt
    || liveStatus?.last_completed_cycle_at
    || liveStatus?.lastCompletedCycleAt,
  ) || null;
  const currentStatus = normalizeText(operatorState?.status || completedCycle?.status) || 'idle';
  const latestCompletedStatus = normalizeText(completedCycle?.status || operatorState?.status) || 'unknown';

  return {
    source: 'qa_live_cycle',
    classification: 'derived_projection',
    current_run_id: normalizeText(operatorState?.id) || null,
    current_status: currentStatus,
    latest_completed_cycle_id: latestCycleId,
    latest_completed_cycle_at: latestCompletedAt,
    latest_completed_status: latestCompletedStatus,
    latest_completed_summary: normalizeText(completedCycle?.summary || operatorState?.summary) || null,
    ran_once: Boolean(latestCycleId),
    mcp_status: normalizeText(liveStatus?.status) || 'unknown',
    mcp_reachable: typeof liveStatus?.mcp_reachable === 'boolean'
      ? liveStatus.mcp_reachable
      : null,
    current_gate_source: normalizeText(liveStatus?.last_qa_gate_source || liveStatus?.lastQaGateSource) || 'unknown',
    external_status: normalizeText(externalValidation?.status || externalValidation?.probeStatus) || 'unknown',
    output_feed_loaded: Array.isArray(outputFeed?.items),
    output_feed_count: outputFeedItems.length,
    output_feed_captured: Boolean(latestFeedEntry),
    latest_feed_entry_id: normalizeText(latestFeedEntry?.id) || null,
    latest_feed_result: normalizeText(latestFeedEntry?.result || latestFeedEntry?.status) || null,
    summary: summarizeQaLiveCycle({
      completedCycle,
      operatorState,
      liveStatus,
      externalValidation,
      latestFeedEntry,
    }),
  };
}

function summarizeLeadPosture(qaLeadPosture = null, qaLeadOutput = null) {
  const leadState = qaLeadOutput?.state && typeof qaLeadOutput.state === 'object' ? qaLeadOutput.state : {};
  const latestRun = qaLeadOutput?.latestRun && typeof qaLeadOutput.latestRun === 'object' ? qaLeadOutput.latestRun : {};
  if (qaLeadPosture && typeof qaLeadPosture === 'object') {
    return {
      posture_id: normalizeText(qaLeadPosture.posture_id) || null,
      status: normalizeText(qaLeadPosture.status) || 'unknown',
      verdict: normalizeText(qaLeadPosture.verdict) || 'unknown',
      adjudicated_at: normalizeText(qaLeadPosture.adjudicated_at) || null,
      summary: normalizeText(qaLeadPosture.summary) || null,
    };
  }
  return {
    posture_id: null,
    status: normalizeText(leadState.status || latestRun.status) || 'unknown',
    verdict: normalizeText(leadState.status || latestRun.status) || 'unknown',
    adjudicated_at: normalizeText(
      leadState.last_completed_cycle_at
      || leadState.finished_at
      || leadState.finishedAt
      || latestRun.finished_at
      || latestRun.finishedAt
      || latestRun.last_completed_cycle_at
      || latestRun.lastCompletedCycleAt,
    ) || null,
    summary: normalizeText(leadState.summary || latestRun.summary || 'QA posture is not adjudicated yet.')
      || 'QA posture is not adjudicated yet.',
  };
}

function summarizeLatestBrowserRun(qaState = {}, qaLeadOutput = null) {
  const stateLatest = qaState?.latestBrowserRun && typeof qaState.latestBrowserRun === 'object'
    ? qaState.latestBrowserRun
    : null;
  const latestRun = qaLeadOutput?.latestRun && typeof qaLeadOutput.latestRun === 'object'
    ? qaLeadOutput.latestRun
    : null;
  return normalizeText(
    stateLatest?.verdict
    || stateLatest?.status
    || latestRun?.browserRun?.verdict
    || latestRun?.browserRun?.status
    || latestRun?.browser_run?.verdict
    || latestRun?.browser_run?.status
    || qaState?.browserRuns?.[0]?.verdict
    || qaState?.browserRuns?.[0]?.status
    || 'unknown',
  ) || 'unknown';
}

function summarizeMcpStatus(qaState = {}, qaLeadOutput = null) {
  const liveStatus = resolveLiveStatus(qaState, qaLeadOutput);
  const status = normalizeText(liveStatus?.status) || 'unknown';
  const reachable = typeof liveStatus?.mcp_reachable === 'boolean'
    ? liveStatus.mcp_reachable
    : null;
  return {
    status,
    reachable,
    liveStatus,
  };
}

function determineBlocker({
  posture = null,
  qaState = {},
  qaLeadOutput = null,
  openInvestigations = [],
  outputFeed = [],
} = {}) {
  const investigationCount = Array.isArray(openInvestigations) ? openInvestigations.length : 0;
  const preAdjudicationPendingCount = Array.isArray(openInvestigations)
    ? openInvestigations.filter((investigation) => investigation && investigation.pre_adjudication).length
    : 0;
  const feedCount = Array.isArray(outputFeed) ? outputFeed.length : 0;
  const { status: mcpStatus, reachable: mcpReachable, liveStatus } = summarizeMcpStatus(qaState, qaLeadOutput);

  if (mcpReachable === false || ['degraded', 'offline', 'stale'].includes(mcpStatus)) {
    return {
      key: 'external_mcp_unreachable',
      summary: normalizeText(
        liveStatus?.summary
        || 'External MCP proof-of-life is unreachable or degraded.',
      ) || 'External MCP proof-of-life is unreachable or degraded.',
    };
  }

  if (preAdjudicationPendingCount > 0) {
    return {
      key: 'pre_adjudication_pending',
      summary: `${preAdjudicationPendingCount} pre-adjudication evidence item${preAdjudicationPendingCount === 1 ? '' : 's'} await QA lead promotion.`,
    };
  }

  if (feedCount === 0) {
    return {
      key: 'output_feed_empty',
      summary: 'QA output feed has not recorded a completed cycle yet.',
    };
  }

  const postureStatus = normalizeText(posture?.status) || 'unknown';
  if (postureStatus === 'running') {
    return {
      key: 'lead_cycle_running',
      summary: 'The QA lead cycle is still running and has not published its final posture yet.',
    };
  }

  if (investigationCount > 0) {
    return {
      key: 'evidence_needs_review',
      summary: 'QA evidence is still open, but no higher-priority blocker is currently exposed.',
    };
  }

  return {
    key: 'unknown',
    summary: normalizeText(posture?.summary) || 'QA state is not yet clearly adjudicated.',
  };
}

function determineNextSeam(blocker = {}) {
  const key = normalizeText(blocker?.key) || 'unknown';
  if (key === 'external_mcp_unreachable') {
    return {
      id: 'external_probe_reachability',
      summary: 'Restore external MCP proof-of-life so QA can move off degraded evidence.',
    };
  }
  if (key === 'pre_adjudication_pending') {
    return {
      id: 'qa_lead_cycle_promotion',
      summary: 'Run the QA lead cycle to promote pending evidence into adjudicated posture.',
    };
  }
  if (key === 'output_feed_empty') {
    return {
      id: 'qa_cycle_publication',
      summary: 'Trigger one QA lead cycle so the output feed records a completed execution.',
    };
  }
  if (key === 'lead_cycle_running') {
    return {
      id: 'wait_for_cycle_completion',
      summary: 'Wait for the current QA lead cycle to finish and publish its final state.',
    };
  }
  return {
    id: 'inspect_qa_state_projection',
    summary: 'Inspect the current QA lead projection and evidence history for the next seam.',
  };
}

function buildQaSessionSummary({
  qaState = {},
  qaLeadOutput = null,
  qaLeadPosture = null,
  outputFeed = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const leadState = qaLeadOutput?.state && typeof qaLeadOutput.state === 'object'
    ? qaLeadOutput.state
    : {};
  const latestRun = qaLeadOutput?.latestRun && typeof qaLeadOutput.latestRun === 'object'
    ? qaLeadOutput.latestRun
    : {};
  const qaLiveCycle = qaState?.qaLiveCycle && typeof qaState.qaLiveCycle === 'object'
    ? qaState.qaLiveCycle
    : buildQaLiveCycleState({
      qaState,
      qaLeadOutput,
      outputFeed,
    });
  const posture = summarizeLeadPosture(qaLeadPosture, qaLeadOutput);
  const feedItems = normalizeFeedItems(outputFeed);
  const openInvestigations = Array.isArray(qaState?.openInvestigations)
    ? qaState.openInvestigations
    : [];
  const preAdjudicationPendingCount = openInvestigations.filter((investigation) => investigation && investigation.pre_adjudication).length;
  const mcp = summarizeMcpStatus(qaState, qaLeadOutput);
  const blocker = determineBlocker({
    posture,
    qaState,
    qaLeadOutput,
    openInvestigations,
    outputFeed: feedItems,
  });

  return {
    source: 'qa_session_summary',
    classification: 'derived',
    generatedAt,
    derived_from_posture_id: posture.posture_id || null,
    posture,
    cycle: {
      live_status: qaLiveCycle.current_status || normalizeText(leadState.status || latestRun.status) || 'unknown',
      latest_completed_cycle_id: qaLiveCycle.latest_completed_cycle_id || null,
      output_feed_count: qaLiveCycle.output_feed_count ?? feedItems.length,
      feed_active: Boolean(qaLiveCycle.output_feed_count ?? feedItems.length),
      output_feed_captured: qaLiveCycle.output_feed_captured === true,
      last_completed_cycle_at: qaLiveCycle.latest_completed_cycle_at || null,
      current_gate_source: qaLiveCycle.current_gate_source || 'unknown',
      external_status: qaLiveCycle.external_status || 'unknown',
    },
    evidence: {
      pre_adjudication_pending_count: preAdjudicationPendingCount,
      open_investigation_count: openInvestigations.length,
      latest_browser_run_status: summarizeLatestBrowserRun(qaState, qaLeadOutput),
      mcp_status: qaLiveCycle.mcp_status || mcp.status,
      mcp_reachable: qaLiveCycle.mcp_reachable ?? mcp.reachable,
    },
    qaLiveCycle,
    blocker,
    next_seam: determineNextSeam(blocker),
  };
}

module.exports = {
  buildQaLiveCycleState,
  buildQaSessionSummary,
  determineBlocker,
  determineNextSeam,
};
