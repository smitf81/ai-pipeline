console.log("LOADED: qaLoopAudit");
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildDeskPropertiesPayload,
  buildQAStatePayload,
  createDefaultStudioLayoutSchema,
  evaluateStudioClientBootContract,
} = require('./server');
const {
  buildQaMcpLiveStatus,
} = require('./qaMcpLiveStatus');
const {
  buildPlannerCanonicalIntegrityInvestigation,
} = require('./plannerCanonicalIntegrity');
const {
  emptyQaLaneCanaryState,
} = require('./qaLaneCanaries');
const {
  buildQaRepairJobFromInvestigation,
  buildQaRepairLoopState,
  runQaRepairAttempt,
  upsertQaRepairJob,
  updateInvestigationPressure,
} = require('./qaRepairLoop');
const {
  buildUiBootIntegrityInvestigation,
} = require('./uiBootIntegrity');

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value = '') {
  return String(value || '').trim();
}

function readJsonSafe(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function createAuditTempRoot(rootPath = process.cwd()) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-loop-audit-'));
  fs.cpSync(path.join(rootPath, 'ui'), path.join(tempRoot, 'ui'), {
    recursive: true,
    filter: (source) => {
      const normalized = String(source || '').replace(/\\/g, '/');
      return !normalized.includes('/node_modules/') && !normalized.endsWith('/node_modules');
    },
  });
  return tempRoot;
}

function getAuditPublicRoot(rootPath = process.cwd()) {
  return path.join(rootPath, 'ui', 'public');
}

function getAuditBootManifestPath(rootPath = process.cwd()) {
  return path.join(getAuditPublicRoot(rootPath), 'spatial', 'boot-manifest.json');
}

function getAuditSpatialAppPath(rootPath = process.cwd()) {
  return path.join(getAuditPublicRoot(rootPath), 'spatial', 'spatialApp.js');
}

function readAuditBootManifest(rootPath = process.cwd()) {
  return readJsonSafe(getAuditBootManifestPath(rootPath), { assets: [] }) || { assets: [] };
}

function injectMissingRequiredAsset(rootPath = process.cwd()) {
  const manifestPath = getAuditBootManifestPath(rootPath);
  const spatialAppPath = getAuditSpatialAppPath(rootPath);
  const manifest = readAuditBootManifest(rootPath);
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  const nextAssets = assets
    .filter((asset) => normalizeText(asset?.path) !== '/spatial/intentContract.browser.js')
    .filter((asset) => normalizeText(asset?.path) !== '/intentAnalysis.js');
  nextAssets.push({
    path: '/intentAnalysis.js',
    label: 'Intent analysis',
    kind: 'required_module',
    stage: 'required_modules_loaded',
    blocking: true,
  });
  writeJson(manifestPath, {
    ...manifest,
    assets: nextAssets,
  });

  const spatialSource = fs.readFileSync(spatialAppPath, 'utf8');
  const staleSource = spatialSource.replace(/\.\/intentContract\.browser\.js/g, '../../intentAnalysis.js');
  fs.writeFileSync(spatialAppPath, staleSource, 'utf8');

  return {
    manifestPath,
    spatialAppPath,
    asset: '/intentAnalysis.js',
  };
}

function evaluateAuditBootContract(rootPath = process.cwd()) {
  return evaluateStudioClientBootContract(rootPath, {
    publicRoot: getAuditPublicRoot(rootPath),
    manifest: readAuditBootManifest(rootPath),
  });
}

function summarizeLaneState(loopState = null, laneId = '') {
  const lanes = Array.isArray(loopState?.lanes) ? loopState.lanes : [];
  const lane = lanes.find((entry) => normalizeText(entry?.lane_id) === normalizeText(laneId)) || null;
  if (!lane) return null;
  return {
    lane_id: lane.lane_id,
    label: lane.label,
    status: lane.status,
    open_investigations: Number(lane.open_investigations || 0),
    repair_job_count: Number(lane.repair_job_count || 0),
    blocked_count: Number(lane.blocked_count || 0),
    latest_attempt_verdict: lane.latest_attempt_verdict || null,
    latest_policy_block_reason: lane.latest_policy_block_reason || null,
    trust_level: lane.trust_level || null,
    trust_reason: lane.trust_reason || null,
  };
}

function buildQaDeskSurface(rootPath = process.cwd(), qaState = null) {
  const state = qaState || buildQAStatePayload(rootPath, {
    qaCanaries: emptyQaLaneCanaryState(),
  });
  const payload = buildDeskPropertiesPayload({
    studio: {
      layout: createDefaultStudioLayoutSchema(),
    },
  }, 'qa-lead', state);
  return payload?.qa || {};
}

function runUiBootIntegrityFault(rootPath = process.cwd()) {
  const auditRoot = createAuditTempRoot(rootPath);
  const injected = injectMissingRequiredAsset(auditRoot);
  const beforeContract = evaluateAuditBootContract(auditRoot);
  const investigationResult = buildUiBootIntegrityInvestigation(auditRoot, {
    bootHealth: {
      checkedAt: nowIso(),
      clientBootContract: beforeContract,
      failureClass: beforeContract.failure_class,
      failureStage: beforeContract.failure_stage,
      asset: beforeContract.asset,
      httpStatus: beforeContract.http_status,
      reason: beforeContract.reason,
    },
  });
  const investigation = investigationResult.investigation;
  const initialJob = buildQaRepairJobFromInvestigation(auditRoot, investigation);
  const job = initialJob ? upsertQaRepairJob(auditRoot, initialJob) : null;
  const attempt = job
    ? runQaRepairAttempt(auditRoot, {
        repairJobId: job.id,
        investigation,
        validationRunner: () => {
          const contract = evaluateAuditBootContract(auditRoot);
          const mountMarkerSource = fs.readFileSync(getAuditSpatialAppPath(auditRoot), 'utf8');
          const mountMarkerWired = mountMarkerSource.includes('studio-mounted');
          const ok = contract.ok === true && contract.failure_class == null && mountMarkerWired;
          return {
            ok,
            verdict: ok ? 'accepted' : 'rejected',
            summary: ok
              ? 'Boot contract recovered and mount marker wiring remains present.'
              : `Boot contract still failing: ${contract.failure_class || 'unknown'}.`,
            checks: [
              {
                id: 'boot-contract-audit',
                ok,
                summary: contract.failure_class
                  ? `blocking failure ${contract.failure_class} on ${contract.asset || 'unknown asset'}`
                  : 'required boot assets resolved',
              },
            ],
          };
        },
      })
    : null;
  const loopState = buildQaRepairLoopState(auditRoot);
  const afterContract = evaluateAuditBootContract(auditRoot);
  return {
    fault_id: 'missing_required_asset',
    injected_fault: `Missing required asset reference ${injected.asset}`,
    expected_lane: 'ui_boot_integrity',
    detected: Boolean(beforeContract.failure_class === 'missing_client_asset' && investigation),
    expected_status: 'accepted_or_safe_stop',
    actual_lane: job?.lane || null,
    actual_status: attempt?.job?.status || null,
    investigation_id: investigation?.id || null,
    repair_attempted: Boolean(attempt?.attempt),
    policy_decision: attempt?.validation?.trust_policy?.ok === false
      ? 'policy_blocked'
      : (job?.auto_apply_allowed === false ? 'policy_blocked' : 'auto_apply_allowed'),
    repair_decision: attempt?.executor?.proposed_action || attempt?.executor?.plan?.proposed_action || null,
    validation_result: attempt?.validation?.verdict || null,
    final_state: afterContract.ok ? 'boot_restored' : (attempt?.safe_stop ? 'safe_stop' : 'boot_still_failed'),
    qa_surface_result: summarizeLaneState(loopState, 'ui_boot_integrity'),
    expected_vs_actual_pass: Boolean(
      beforeContract.failure_class === 'missing_client_asset'
      && job?.lane === 'ui_boot_integrity'
      && attempt?.validation?.verdict === 'accepted'
      && afterContract.ok === true
    ),
    details: {
      before_contract: {
        failure_class: beforeContract.failure_class,
        failure_stage: beforeContract.failure_stage,
        asset: beforeContract.asset,
        http_status: beforeContract.http_status,
      },
      after_contract: {
        failure_class: afterContract.failure_class,
        failure_stage: afterContract.failure_stage,
        asset: afterContract.asset,
        http_status: afterContract.http_status,
      },
    },
  };
}

function buildPlannerMismatchLayout() {
  const layout = createDefaultStudioLayoutSchema();
  if (layout.desks?.planner) {
    layout.desks.planner.assignedAgentIds = [];
    layout.desks.planner.departmentId = 'dept-quality';
  }
  if (layout.organization?.agents?.planner) {
    layout.organization.agents.planner.departmentId = 'dept-quality';
    layout.organization.agents.planner.deskId = 'qa-lead';
  }
  return layout;
}

function runPlannerCanonicalMismatchFault(rootPath = process.cwd()) {
  const auditRoot = createAuditTempRoot(rootPath);
  const checkedAt = nowIso();
  const layout = buildPlannerMismatchLayout();
  const investigationResult = buildPlannerCanonicalIntegrityInvestigation(auditRoot, {
    layout,
    checkedAt,
  });
  let investigation = investigationResult.investigation;
  if (investigation?.id) {
    updateInvestigationPressure(auditRoot, investigation.id, {
      seen_at: checkedAt,
      trigger: investigation.trigger,
      internal_status: 'fail',
      external_status: 'fail',
      probe_status: 'repeat',
      test_id: 'planner_canonical_integrity',
    });
  }
  investigation = {
    ...investigation,
    repeat_count: Math.max(2, Number(investigation?.repeat_count || 0)),
  };
  const initialJob = buildQaRepairJobFromInvestigation(auditRoot, investigation);
  const job = initialJob ? upsertQaRepairJob(auditRoot, initialJob) : null;
  const attempt = job ? runQaRepairAttempt(auditRoot, { repairJobId: job.id, investigation }) : null;
  const loopState = buildQaRepairLoopState(auditRoot);
  return {
    fault_id: 'planner_canonical_mismatch',
    injected_fault: 'Planner canonical identity and staffing mismatch',
    expected_lane: 'planner_canonical_integrity',
    detected: Boolean(investigationResult.state?.status === 'blocked' && investigation),
    expected_status: 'policy_blocked',
    actual_lane: job?.lane || null,
    actual_status: attempt?.job?.status || null,
    investigation_id: investigation?.id || null,
    repair_attempted: false,
    policy_decision: attempt?.validation?.verdict || null,
    repair_decision: 'guarded_no_auto_apply',
    validation_result: attempt?.validation?.verdict || null,
    final_state: attempt?.safe_stop ? 'safe_stop' : (attempt?.job?.status || null),
    qa_surface_result: summarizeLaneState(loopState, 'planner_canonical_integrity'),
    expected_vs_actual_pass: Boolean(
      investigationResult.state?.status === 'blocked'
      && job?.lane === 'planner_canonical_integrity'
      && attempt?.validation?.verdict === 'policy_blocked'
    ),
    details: {
      trigger: investigationResult.state?.trigger || null,
      failed_predicates: [
        ...(investigationResult.state?.plannerCoverage?.failedPredicateLabels || []),
        ...((investigationResult.state?.packagingTruth?.failedPredicates || []).map((entry) => entry.label).filter(Boolean)),
      ],
    },
  };
}

function runQaMcpStaleFault(rootPath = process.cwd()) {
  const staleAt = new Date(Date.now() - (3 * 60 * 60 * 1000)).toISOString();
  const baseQaState = buildQAStatePayload(rootPath, {
    qaCanaries: emptyQaLaneCanaryState(),
    externalValidation: {
      status: 'pass',
      probeStatus: 'ok',
      lastCheckedAt: staleAt,
      statusMatch: true,
      freshnessKnown: true,
      notes: ['Synthetic audit: MCP proof-of-life is stale.'],
      source: 'external_mcp',
      errorMessage: null,
    },
  });
  const liveStatus = buildQaMcpLiveStatus({
    externalValidation: {
      status: 'pass',
      probeStatus: 'ok',
      lastCheckedAt: staleAt,
      statusMatch: true,
      freshnessKnown: true,
      notes: ['Synthetic audit: MCP proof-of-life is stale.'],
      source: 'external_mcp',
      errorMessage: null,
    },
    researchState: { notes: [] },
    openInvestigations: [],
    repairLoop: baseQaState.repairLoop,
    structuredSummary: baseQaState.structuredSummary,
    latestBrowserRun: baseQaState.latestBrowserRun,
    localGate: baseQaState.localGate,
  });
  const qaState = {
    ...baseQaState,
    qaMcpLiveStatus: liveStatus,
  };
  const qaDesk = buildQaDeskSurface(rootPath, qaState);
  return {
    fault_id: 'qa_mcp_stale',
    injected_fault: 'Stale QA MCP heartbeat with no recent call',
    expected_lane: null,
    detected: liveStatus.status === 'stale',
    expected_status: 'stale',
    actual_lane: null,
    actual_status: liveStatus.status || null,
    investigation_id: null,
    repair_attempted: false,
    policy_decision: 'not_applicable',
    repair_decision: 'none',
    validation_result: liveStatus.status || null,
    final_state: liveStatus.status || null,
    qa_surface_result: {
      status: liveStatus.status || null,
      summary: liveStatus.summary || null,
      last_ping_at: liveStatus.last_ping_at || null,
      last_call_tool: liveStatus.last_call_tool || null,
      last_qa_gate_source: liveStatus.last_qa_gate_source || null,
      using_mcp_for_qa_decisions: Boolean(liveStatus.using_mcp_for_qa_decisions),
      desk_status: qaDesk?.qaMcpLiveStatus?.status || null,
    },
    expected_vs_actual_pass: Boolean(
      liveStatus.status === 'stale'
      && qaDesk?.qaMcpLiveStatus?.status === 'stale'
    ),
    details: {
      freshness: liveStatus.freshness || null,
      notes: Array.isArray(liveStatus.notes) ? liveStatus.notes : [],
    },
  };
}

function compareExpectedVsActual(report = {}) {
  return {
    fault_id: report.fault_id || null,
    detected: Boolean(report.detected),
    expected_lane: report.expected_lane || null,
    actual_lane: report.actual_lane || null,
    policy_decision: report.policy_decision || null,
    repair_attempted: Boolean(report.repair_attempted),
    validation_result: report.validation_result || null,
    final_state: report.final_state || null,
    pass: Boolean(report.expected_vs_actual_pass),
  };
}

function runQaLoopAudit(rootPath = process.cwd()) {
  const startedAt = nowIso();
  const faults = [
    runUiBootIntegrityFault(rootPath),
    runPlannerCanonicalMismatchFault(rootPath),
    runQaMcpStaleFault(rootPath),
  ];
  const comparisons = faults.map((fault) => compareExpectedVsActual(fault));
  const passedCount = comparisons.filter((entry) => entry.pass).length;
  return {
    source: 'qa_loop_audit',
    started_at: startedAt,
    completed_at: nowIso(),
    overall_status: passedCount === comparisons.length ? 'pass' : 'fail',
    total_faults: comparisons.length,
    passed_faults: passedCount,
    failed_faults: comparisons.length - passedCount,
    failing_fault_ids: comparisons.filter((entry) => !entry.pass).map((entry) => entry.fault_id),
    faults,
    comparisons,
    summary: passedCount === comparisons.length
      ? `All ${comparisons.length} injected loop faults behaved as expected.`
      : `${comparisons.length - passedCount} injected loop fault${comparisons.length - passedCount === 1 ? '' : 's'} diverged from the expected loop behavior.`,
  };
}

module.exports = {
  compareExpectedVsActual,
  createAuditTempRoot,
  injectMissingRequiredAsset,
  runPlannerCanonicalMismatchFault,
  runQaLoopAudit,
  runQaMcpStaleFault,
  runUiBootIntegrityFault,
};
