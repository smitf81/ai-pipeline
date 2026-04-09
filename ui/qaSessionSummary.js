const normalizeText = (value = '') => String(value || '').trim();

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
  const leadState = qaLeadOutput?.state && typeof qaLeadOutput.state === 'object' ? qaLeadOutput.state : {};
  const liveStatus = leadState.live_status && typeof leadState.live_status === 'object'
    ? leadState.live_status
    : (qaState?.qaMcpLiveStatus && typeof qaState.qaMcpLiveStatus === 'object' ? qaState.qaMcpLiveStatus : null);
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
  const posture = summarizeLeadPosture(qaLeadPosture, qaLeadOutput);
  const feedItems = Array.isArray(outputFeed?.items)
    ? outputFeed.items
    : (Array.isArray(leadState.output_feed) ? leadState.output_feed : []);
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
      live_status: normalizeText(leadState.status || latestRun.status) || 'unknown',
      output_feed_count: feedItems.length,
      feed_active: feedItems.length > 0,
      last_completed_cycle_at: normalizeText(
        leadState.last_completed_cycle_at
        || leadState.finished_at
        || leadState.finishedAt
        || latestRun.finished_at
        || latestRun.finishedAt
        || latestRun.last_completed_cycle_at
        || latestRun.lastCompletedCycleAt,
      ) || null,
    },
    evidence: {
      pre_adjudication_pending_count: preAdjudicationPendingCount,
      open_investigation_count: openInvestigations.length,
      latest_browser_run_status: summarizeLatestBrowserRun(qaState, qaLeadOutput),
      mcp_status: mcp.status,
      mcp_reachable: mcp.reachable,
    },
    blocker,
    next_seam: determineNextSeam(blocker),
  };
}

module.exports = {
  buildQaSessionSummary,
  determineBlocker,
  determineNextSeam,
};
