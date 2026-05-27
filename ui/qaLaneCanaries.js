const path = require('path');

const {
  buildQaRepairExecutorBrief,
  buildQaRepairJobFromInvestigation,
  getQaRepairLaneConfig,
  getQaRepairLaneRegistry,
  runQaRepairLaneValidationChecks,
  selectQaRepairLaneForInvestigation,
} = require('./qaRepairLoop');
const {
  evaluateRepairLaneTrustPolicyCompliance,
} = require('./repairLaneTrustPolicy');

const QA_LANE_CANARY_CACHE_TTL_MS = 60 * 1000;
const qaLaneCanaryCache = new Map();
const qaLaneCanaryInProgress = new Set();

function nowIso() {
  return new Date().toISOString();
}

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

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => normalizeText(value)).filter(Boolean))];
}

function toPosixPath(value = '') {
  return normalizeText(value).replace(/\\/g, '/');
}

function summarizeScopedTargets(scopedTargets = []) {
  const targets = uniqueStrings(scopedTargets);
  if (!targets.length) return 'No scoped targets surfaced.';
  const preview = targets.slice(0, 2).map((target) => {
    const normalized = toPosixPath(target);
    const segments = normalized.split('/').filter(Boolean);
    return segments.length > 2 ? segments.slice(-2).join('/') : normalized;
  });
  return `${targets.length} target${targets.length === 1 ? '' : 's'} | ${preview.join(' | ')}${targets.length > preview.length ? ` +${targets.length - preview.length} more` : ''}`;
}

function resolvePolicyOutcome(policyCheck = null) {
  const check = policyCheck && typeof policyCheck === 'object' ? policyCheck : {};
  if (check.ok === false) return 'policy_blocked';
  if (check.auto_apply_allowed === false) return 'guarded_manual_review';
  return 'auto_apply_allowed';
}

function normalizeValidationStatus(validation = null) {
  const record = validation && typeof validation === 'object' ? validation : {};
  if (record.ok === true) return 'accepted';
  return normalizeText(record.verdict) || 'rejected';
}

function buildQaLaneCanaryRecord(record = {}) {
  const source = record && typeof record === 'object' ? record : {};
  const syntheticInvestigation = source.synthetic_investigation && typeof source.synthetic_investigation === 'object'
    ? source.synthetic_investigation
    : {};
  return {
    canary_id: normalizeText(source.canary_id || source.canaryId) || null,
    label: normalizeText(source.label) || 'QA Lane Canary',
    target_lane_id: normalizeText(source.target_lane_id || source.targetLaneId) || null,
    synthetic_investigation: {
      id: normalizeText(syntheticInvestigation.id) || null,
      type: normalizeText(syntheticInvestigation.type) || 'qa_investigation',
      trigger: normalizeText(syntheticInvestigation.trigger) || null,
      severity: normalizeText(syntheticInvestigation.severity) || 'medium',
      status: normalizeText(syntheticInvestigation.status) || 'open',
      summary: normalizeText(syntheticInvestigation.summary) || 'Synthetic lane canary.',
      repeat_count: Math.max(1, Number(syntheticInvestigation.repeat_count ?? syntheticInvestigation.repeatCount ?? 1) || 1),
      created_at: normalizeIsoTimestamp(syntheticInvestigation.created_at, syntheticInvestigation.createdAt) || '2026-04-06T00:00:00.000Z',
      evidence: syntheticInvestigation.evidence && typeof syntheticInvestigation.evidence === 'object'
        ? syntheticInvestigation.evidence
        : {},
      signature: normalizeText(syntheticInvestigation.signature) || null,
    },
    expected_lane_selection: normalizeText(source.expected_lane_selection || source.expectedLaneSelection) || null,
    expected_policy_outcome: normalizeText(source.expected_policy_outcome || source.expectedPolicyOutcome) || 'auto_apply_allowed',
    expected_validation_status: normalizeText(source.expected_validation_status || source.expectedValidationStatus) || 'accepted',
    validation_check_ids: uniqueStrings(source.validation_check_ids || source.validationCheckIds),
    notes: uniqueStrings(source.notes),
  };
}

const QA_LANE_CANARIES = Object.freeze([
  buildQaLaneCanaryRecord({
    canary_id: 'ui_boot_integrity_missing_asset',
    label: 'UI boot missing asset route',
    target_lane_id: 'ui_boot_integrity',
    synthetic_investigation: {
      id: 'qa_canary_inv_ui_boot',
      trigger: 'missing_client_asset',
      status: 'open',
      repeat_count: 1,
      summary: 'Synthetic canary: blocking client asset is missing during boot.',
      evidence: {
        comparison: {
          asset: '/intentAnalysis.js',
          failure_class: 'missing_client_asset',
          failure_stage: 'required_modules_loaded',
          http_status: 404,
        },
      },
    },
    expected_lane_selection: 'ui_boot_integrity',
    expected_policy_outcome: 'auto_apply_allowed',
    expected_validation_status: 'accepted',
    validation_check_ids: ['ui-boot-syntax', 'ui-boot-canary'],
  }),
  buildQaLaneCanaryRecord({
    canary_id: 'route_contract_health_payload',
    label: 'Route contract payload drift',
    target_lane_id: 'route_contract_health',
    synthetic_investigation: {
      id: 'qa_canary_inv_route_contract',
      trigger: 'route_contract_mismatch',
      status: 'open',
      repeat_count: 2,
      summary: 'Synthetic canary: route contract payload drift is detected.',
      evidence: {
        comparison: {
          route: '/api/qa/external-probe-check',
          failure_class: 'route_contract_mismatch',
        },
      },
    },
    expected_lane_selection: 'route_contract_health',
    expected_policy_outcome: 'auto_apply_allowed',
    expected_validation_status: 'accepted',
    validation_check_ids: ['route-contract-syntax', 'route-contract-canary'],
  }),
  buildQaLaneCanaryRecord({
    canary_id: 'planner_canonical_identity_guard',
    label: 'Planner canonical identity guard',
    target_lane_id: 'planner_canonical_integrity',
    synthetic_investigation: {
      id: 'qa_canary_inv_planner_identity',
      trigger: 'planner_identity_mismatch',
      status: 'open',
      repeat_count: 2,
      summary: 'Synthetic canary: planner canonical identity is inconsistent.',
      evidence: {
        comparison: {
          failure_class: 'planner_identity_mismatch',
          planner_id: 'planner',
        },
      },
    },
    expected_lane_selection: 'planner_canonical_integrity',
    expected_policy_outcome: 'guarded_manual_review',
    expected_validation_status: 'accepted',
    validation_check_ids: ['planner-canonical-syntax', 'planner-canonical-canary'],
  }),
]);

function getQaLaneCanaryRegistry() {
  return QA_LANE_CANARIES.map((canary) => buildQaLaneCanaryRecord(canary));
}

function emptyQaLaneCanaryState() {
  return {
    source: 'qa_lane_canaries',
    started_at: null,
    last_run_at: null,
    overall_status: 'idle',
    total_canaries: 0,
    passed_count: 0,
    failed_count: 0,
    failing_canary_ids: [],
    results: [],
    summary: 'No QA lane canary results are recorded yet.',
  };
}

function buildQaLaneCanaryState(results = [], meta = {}) {
  const normalizedResults = (Array.isArray(results) ? results : [])
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      ...entry,
      canary_id: normalizeText(entry.canary_id) || null,
      label: normalizeText(entry.label) || 'QA Lane Canary',
      status: normalizeText(entry.status) || 'fail',
      checked_at: normalizeIsoTimestamp(entry.checked_at, entry.checkedAt) || meta.last_run_at || null,
      notes: uniqueStrings(entry.notes),
    }))
    .filter((entry) => entry.canary_id);
  if (!normalizedResults.length) {
    return {
      ...emptyQaLaneCanaryState(),
      started_at: normalizeIsoTimestamp(meta.started_at, meta.startedAt) || null,
      last_run_at: normalizeIsoTimestamp(meta.last_run_at, meta.lastRunAt) || null,
    };
  }
  const passedCount = normalizedResults.filter((entry) => entry.status === 'pass').length;
  const failed = normalizedResults.filter((entry) => entry.status !== 'pass');
  const lastRunAt = normalizeIsoTimestamp(
    meta.last_run_at,
    meta.lastRunAt,
    ...normalizedResults.map((entry) => entry.checked_at),
  );
  return {
    source: 'qa_lane_canaries',
    started_at: normalizeIsoTimestamp(meta.started_at, meta.startedAt) || lastRunAt,
    last_run_at: lastRunAt,
    overall_status: failed.length ? 'fail' : 'pass',
    total_canaries: normalizedResults.length,
    passed_count: passedCount,
    failed_count: failed.length,
    failing_canary_ids: failed.map((entry) => entry.canary_id),
    results: normalizedResults,
    summary: failed.length
      ? `${failed.length} QA lane canary${failed.length === 1 ? '' : 'ies'} failing.`
      : `All ${normalizedResults.length} QA lane canaries passed.`,
  };
}

function runQaLaneCanary(rootPath = null, canary = null, options = {}) {
  const normalizedCanary = buildQaLaneCanaryRecord(canary || {});
  const checkedAt = options.checkedAt || nowIso();
  const laneRegistry = Array.isArray(options.laneRegistry) ? options.laneRegistry : getQaRepairLaneRegistry();
  const selectedLane = selectQaRepairLaneForInvestigation(normalizedCanary.synthetic_investigation, laneRegistry);
  const targetLane = getQaRepairLaneConfig(normalizedCanary.target_lane_id) || selectedLane;
  const job = targetLane
    ? buildQaRepairJobFromInvestigation(rootPath, normalizedCanary.synthetic_investigation, {
        laneId: targetLane.lane_id,
        id: `qa_canary_job_${normalizedCanary.canary_id}`,
        createdAt: checkedAt,
      })
    : null;
  const brief = job ? buildQaRepairExecutorBrief(job, normalizedCanary.synthetic_investigation) : null;
  const policyCheck = targetLane && job
    ? evaluateRepairLaneTrustPolicyCompliance({
        policy: targetLane.trust_policy || targetLane,
        lane: targetLane,
        job,
        brief,
      })
    : {
        ok: false,
        auto_apply_allowed: false,
        reasons: ['Repair job could not be built for the synthetic canary.'],
        trust_level: targetLane?.trust_level || 'unknown',
        trust_reason: targetLane?.trust_reason || '',
      };
  const validation = targetLane && job
    ? (() => {
        const selectedValidationChecks = normalizedCanary.validation_check_ids.length
          ? targetLane.validation_checks.filter((check) => normalizedCanary.validation_check_ids.includes(check.id))
          : targetLane.validation_checks;
        const narrowedJob = {
          ...job,
          validation_checks: selectedValidationChecks,
          required_validation_gate_ids: selectedValidationChecks.map((check) => check.id).filter(Boolean),
        };
        return typeof options.validationRunner === 'function'
          ? options.validationRunner({
              canary: normalizedCanary,
              lane: targetLane,
              job: narrowedJob,
            })
          : runQaRepairLaneValidationChecks(rootPath, narrowedJob, {
              laneId: targetLane.lane_id,
              changedFiles: targetLane.scoped_targets,
            });
      })()
    : {
        ok: false,
        verdict: 'rejected',
        summary: 'Validation did not run because the synthetic repair job could not be built.',
        checks: [],
      };
  const selectedLaneId = selectedLane?.lane_id || null;
  const policyOutcome = resolvePolicyOutcome(policyCheck);
  const validationStatus = normalizeValidationStatus(validation);
  const laneMatch = selectedLaneId === normalizedCanary.expected_lane_selection;
  const policyMatch = policyOutcome === normalizedCanary.expected_policy_outcome;
  const validationMatch = validationStatus === normalizedCanary.expected_validation_status;
  const status = laneMatch && policyMatch && validationMatch ? 'pass' : 'fail';
  const notes = [
    laneMatch ? null : `Expected lane ${normalizedCanary.expected_lane_selection || 'none'}, got ${selectedLaneId || 'none'}.`,
    policyMatch ? null : `Expected policy outcome ${normalizedCanary.expected_policy_outcome}, got ${policyOutcome}.`,
    validationMatch ? null : `Expected validation ${normalizedCanary.expected_validation_status}, got ${validationStatus}.`,
    ...(Array.isArray(policyCheck.reasons) ? policyCheck.reasons : []),
    normalizeText(validation.summary) || null,
  ].filter(Boolean);
  return {
    canary_id: normalizedCanary.canary_id,
    label: normalizedCanary.label,
    target_lane_id: normalizedCanary.target_lane_id,
    target_lane_label: targetLane?.label || null,
    owner_department: targetLane?.owner_department || 'QA',
    trigger: normalizedCanary.synthetic_investigation.trigger,
    checked_at: checkedAt,
    expected_lane_selection: normalizedCanary.expected_lane_selection,
    selected_lane_id: selectedLaneId,
    lane_match: laneMatch,
    expected_policy_outcome: normalizedCanary.expected_policy_outcome,
    policy_outcome: policyOutcome,
    policy_match: policyMatch,
    expected_validation_status: normalizedCanary.expected_validation_status,
    validation_status: validationStatus,
    validation_match: validationMatch,
    status,
    trust_level: policyCheck.trust_level || targetLane?.trust_level || 'unknown',
    trust_reason: policyCheck.trust_reason || targetLane?.trust_reason || '',
    auto_apply_allowed: policyCheck.auto_apply_allowed === true,
    scoped_targets_summary: summarizeScopedTargets(targetLane?.scoped_targets || []),
    required_validation_gate_ids: normalizedCanary.validation_check_ids.length
      ? [...normalizedCanary.validation_check_ids]
      : uniqueStrings(targetLane?.required_validation_gate_ids || []),
    latest_validation_summary: normalizeText(validation.summary) || null,
    summary: status === 'pass'
      ? `${normalizedCanary.label} passed.`
      : `${normalizedCanary.label} failed its expected lane, policy, or validation contract.`,
    notes,
  };
}

function runQaLaneCanarySuite(rootPath = null, options = {}) {
  const normalizedRoot = normalizeText(rootPath) || process.cwd();
  const ttlMs = Number(options.ttlMs ?? QA_LANE_CANARY_CACHE_TTL_MS) || QA_LANE_CANARY_CACHE_TTL_MS;
  const cached = qaLaneCanaryCache.get(normalizedRoot);
  const nowMs = Date.now();
  if (qaLaneCanaryInProgress.has(normalizedRoot)) {
    return cached?.state || emptyQaLaneCanaryState();
  }
  if (!options.force && cached?.recordedAt && (nowMs - cached.recordedAt) < ttlMs && cached.state) {
    return cached.state;
  }
  const startedAt = options.startedAt || nowIso();
  const registry = Array.isArray(options.registry) ? options.registry : getQaLaneCanaryRegistry();
  qaLaneCanaryInProgress.add(normalizedRoot);
  try {
    const results = registry.map((canary) => runQaLaneCanary(normalizedRoot, canary, {
      checkedAt: options.checkedAt || startedAt,
      laneRegistry: options.laneRegistry,
      validationRunner: options.validationRunner,
    }));
    const state = buildQaLaneCanaryState(results, {
      started_at: startedAt,
      last_run_at: options.checkedAt || nowIso(),
    });
    qaLaneCanaryCache.set(normalizedRoot, {
      recordedAt: nowMs,
      state,
    });
    return state;
  } finally {
    qaLaneCanaryInProgress.delete(normalizedRoot);
  }
}

module.exports = {
  QA_LANE_CANARIES,
  QA_LANE_CANARY_CACHE_TTL_MS,
  buildQaLaneCanaryRecord,
  buildQaLaneCanaryState,
  emptyQaLaneCanaryState,
  getQaLaneCanaryRegistry,
  runQaLaneCanary,
  runQaLaneCanarySuite,
};
