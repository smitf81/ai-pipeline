function normalizeText(value = '') {
  return String(value || '').trim();
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => normalizeText(value)).filter(Boolean))];
}

function normalizeRepairLaneTrustPolicy(record = {}) {
  const source = record && typeof record === 'object' ? record : {};
  const laneId = normalizeText(source.lane_id || source.laneId) || 'validation_seam';
  const retryBudget = Math.max(1, Number(source.retry_budget ?? source.retryBudget ?? source.max_attempts ?? 1) || 1);
  return {
    lane_id: laneId,
    allowed_failure_classes: uniqueStrings(source.allowed_failure_classes || source.allowedFailureClasses || []),
    allowed_file_scope: uniqueStrings(source.allowed_file_scope || source.allowedFileScope || []),
    allowed_action_types: uniqueStrings(source.allowed_action_types || source.allowedActionTypes || ['inspect', 'patch', 'validate']),
    auto_apply_allowed: source.auto_apply_allowed !== false,
    human_review_required_on_ambiguity: source.human_review_required_on_ambiguity !== false,
    retry_budget: retryBudget,
    required_validation_gate_ids: uniqueStrings(source.required_validation_gate_ids || source.requiredValidationGateIds || []),
    trust_level: normalizeText(source.trust_level || source.trustLevel) || 'medium',
    trust_reason: normalizeText(source.trust_reason || source.trustReason) || 'Bounded repair policy is active.',
    policy_block_status: normalizeText(source.policy_block_status || source.policyBlockStatus) || 'policy_blocked',
  };
}

const REPAIR_LANE_TRUST_POLICIES = Object.freeze({
  ui_boot_integrity: normalizeRepairLaneTrustPolicy({
    lane_id: 'ui_boot_integrity',
    allowed_failure_classes: ['missing_client_asset'],
    allowed_file_scope: [
      'ui/public/index.html',
      'ui/public/spatial/boot-manifest.json',
      'ui/public/spatial/spatialBootstrap.js',
      'ui/public/spatial/spatialApp.js',
      'ui/public/spatial/intentContract.browser.js',
      'ui/server.js',
      'ui/tests/bootIntegrity.test.mjs',
      'ui/tests/uiBootIntegrityLane.test.mjs',
      'ui/tests/helpers/browser-module-loader.mjs',
      'ui/tests/spatialApp.smoke.test.mjs',
    ],
    allowed_action_types: ['inspect', 'patch', 'validate'],
    auto_apply_allowed: true,
    human_review_required_on_ambiguity: true,
    retry_budget: 2,
    required_validation_gate_ids: ['ui-boot-syntax', 'ui-boot-lane', 'ui-boot-contract'],
    trust_level: 'high',
    trust_reason: 'Blocking boot failures can auto-apply only inside browser boot entry and asset scope.',
  }),
  validation_seam: normalizeRepairLaneTrustPolicy({
    lane_id: 'validation_seam',
    allowed_failure_classes: ['external_mismatch', 'probe_failure', 'freshness_unknown'],
    allowed_file_scope: [
      'ui/externalQaProbe.js',
      'ui/server.js',
      'ui/tests/externalValidation.test.mjs',
    ],
    allowed_action_types: ['inspect', 'patch', 'validate'],
    auto_apply_allowed: true,
    human_review_required_on_ambiguity: true,
    retry_budget: 2,
    required_validation_gate_ids: ['validation-seam-syntax', 'validation-seam-contract'],
    trust_level: 'high',
    trust_reason: 'External validation seam is trusted for bounded backend contract repair only.',
  }),
  route_contract_health: normalizeRepairLaneTrustPolicy({
    lane_id: 'route_contract_health',
    allowed_failure_classes: [
      'route_contract_mismatch',
      'payload_contract_mismatch',
      'response_shape_regression',
      'required_field_omission',
      'contract_field_omission',
      'undefined_drift',
      'null_drift',
    ],
    allowed_file_scope: [
      'ui/server.js',
      'ui/public/spatial/spatialApp.js',
      'ui/public/spatial/studioData.js',
      'ui/public/spatial/aceConnector.js',
      'ui/tests/qaRepairLaneContracts.test.mjs',
    ],
    allowed_action_types: ['inspect', 'patch', 'validate'],
    auto_apply_allowed: true,
    human_review_required_on_ambiguity: true,
    retry_budget: 2,
    required_validation_gate_ids: ['route-contract-syntax', 'route-contract-check'],
    trust_level: 'medium',
    trust_reason: 'Route and payload contract repairs may auto-apply only inside explicit backend and desk contract files.',
  }),
  planner_canonical_integrity: normalizeRepairLaneTrustPolicy({
    lane_id: 'planner_canonical_integrity',
    allowed_failure_classes: [
      'planner_identity_mismatch',
      'planner_staffing_mismatch',
      'planner_target_mismatch',
      'planner_packaging_mismatch',
      'planner_truth_stale',
    ],
    allowed_file_scope: [
      'ui/server.js',
      'ui/studioLayoutSchema.js',
      'ui/agentWorkers.js',
      'ui/public/spatial/staffingRules.js',
      'ui/public/spatial/roleTaxonomy.mjs',
      'ui/tests/plannerCanonicalIntegrity.test.mjs',
    ],
    allowed_action_types: ['inspect', 'validate'],
    auto_apply_allowed: false,
    human_review_required_on_ambiguity: true,
    retry_budget: 1,
    required_validation_gate_ids: ['planner-canonical-syntax', 'planner-canonical-contract', 'planner-regression-pack', 'planner-staffing-rules'],
    trust_level: 'guarded',
    trust_reason: 'Planner integrity is policy-guarded; executor may inspect and validate, but patches require human review.',
  }),
});

function getRepairLaneTrustPolicy(laneId = '') {
  const normalizedLaneId = normalizeText(laneId);
  return normalizedLaneId && REPAIR_LANE_TRUST_POLICIES[normalizedLaneId]
    ? normalizeRepairLaneTrustPolicy(REPAIR_LANE_TRUST_POLICIES[normalizedLaneId])
    : null;
}

function getRepairLaneTrustPolicyRegistry() {
  return Object.values(REPAIR_LANE_TRUST_POLICIES).map((policy) => normalizeRepairLaneTrustPolicy(policy));
}

function buildRepairLaneTrustPolicySummary(policy = null) {
  const normalized = normalizeRepairLaneTrustPolicy(policy || {});
  const applySummary = normalized.auto_apply_allowed ? 'auto-apply allowed' : 'human-review apply only';
  return `${normalized.trust_level} trust | ${applySummary} | ${normalized.retry_budget} attempt${normalized.retry_budget === 1 ? '' : 's'}`;
}

function toPosix(value = '') {
  return normalizeText(value).replace(/\\/g, '/');
}

function isWithinAllowedFileScope(candidate = '', allowedScope = []) {
  const normalizedCandidate = toPosix(candidate);
  if (!normalizedCandidate) return false;
  return uniqueStrings(allowedScope).some((allowed) => {
    const normalizedAllowed = toPosix(allowed);
    return normalizedAllowed === normalizedCandidate || normalizedCandidate.startsWith(`${normalizedAllowed}/`);
  });
}

function evaluateRepairLaneTrustPolicyCompliance({
  policy = null,
  lane = null,
  job = null,
  brief = null,
} = {}) {
  const normalizedPolicy = normalizeRepairLaneTrustPolicy(policy || {});
  const sourceJob = job && typeof job === 'object' ? job : {};
  const sourceLane = lane && typeof lane === 'object' ? lane : {};
  const sourceBrief = brief && typeof brief === 'object' ? brief : {};
  const reasons = [];

  const trigger = normalizeText(sourceJob.trigger || sourceLane.failure_class || '');
  if (normalizedPolicy.allowed_failure_classes.length && !normalizedPolicy.allowed_failure_classes.includes(trigger)) {
    reasons.push(`Trigger "${trigger || 'unknown'}" is outside trust policy.`);
  }

  const scopedTargets = uniqueStrings(sourceJob.scoped_targets || sourceLane.scoped_targets || sourceBrief.allowed_files || []);
  const scopeViolations = scopedTargets.filter((target) => !isWithinAllowedFileScope(target, normalizedPolicy.allowed_file_scope));
  if (scopeViolations.length) {
    reasons.push(`Scoped targets exceed trust policy: ${scopeViolations.join(', ')}.`);
  }

  const actionTypes = uniqueStrings(sourceJob.allowed_actions || sourceBrief.allowed_action_types || []);
  const disallowedActions = actionTypes.filter((action) => !normalizedPolicy.allowed_action_types.includes(action));
  if (disallowedActions.length) {
    reasons.push(`Action types exceed trust policy: ${disallowedActions.join(', ')}.`);
  }

  const validationChecks = Array.isArray(sourceJob.validation_checks)
    ? sourceJob.validation_checks
    : (Array.isArray(sourceLane.validation_checks) ? sourceLane.validation_checks : []);
  const validationIds = uniqueStrings(validationChecks.map((check) => check?.id));
  const missingValidationGates = normalizedPolicy.required_validation_gate_ids.filter((id) => !validationIds.includes(id));
  if (missingValidationGates.length) {
    reasons.push(`Required validation gates missing: ${missingValidationGates.join(', ')}.`);
  }

  const maxAttempts = Math.max(1, Number(sourceJob.max_attempts ?? sourceLane.retry_policy?.max_attempts ?? normalizedPolicy.retry_budget) || normalizedPolicy.retry_budget);
  if (maxAttempts > normalizedPolicy.retry_budget) {
    reasons.push(`Retry budget ${maxAttempts} exceeds trust policy limit ${normalizedPolicy.retry_budget}.`);
  }

  return {
    ok: reasons.length === 0,
    blocked: reasons.length > 0,
    policy_block_status: normalizedPolicy.policy_block_status,
    reasons,
    trust_level: normalizedPolicy.trust_level,
    trust_reason: normalizedPolicy.trust_reason,
    auto_apply_allowed: normalizedPolicy.auto_apply_allowed,
    human_review_required_on_ambiguity: normalizedPolicy.human_review_required_on_ambiguity,
    retry_budget: normalizedPolicy.retry_budget,
    required_validation_gate_ids: [...normalizedPolicy.required_validation_gate_ids],
    allowed_action_types: [...normalizedPolicy.allowed_action_types],
    allowed_file_scope: [...normalizedPolicy.allowed_file_scope],
  };
}

module.exports = {
  REPAIR_LANE_TRUST_POLICIES,
  buildRepairLaneTrustPolicySummary,
  evaluateRepairLaneTrustPolicyCompliance,
  getRepairLaneTrustPolicy,
  getRepairLaneTrustPolicyRegistry,
  isWithinAllowedFileScope,
  normalizeRepairLaneTrustPolicy,
};
