const {
  appendQaInvestigation,
  createQaInvestigationEvent,
  readOpenQaInvestigations,
} = require('./externalQaProbe');
const {
  buildPlannerArtifactContract,
  listPlannerRuns,
  readPlannerRun,
  summarizePlannerRun,
} = require('./agentWorkers');
const {
  createDefaultStudioLayoutSchema,
  buildPlannerIdentitySnapshot,
  buildCanonicalPlannerCoverageTruth,
  buildCanonicalQALeadCoverageTruth,
  normalizeStudioLayoutSchema,
} = require('./studioLayoutSchema');

function normalizeText(value = '') {
  return String(value || '').trim();
}

function readLatestPlannerRun(rootPath = null, options = {}) {
  if (options.plannerRun && typeof options.plannerRun === 'object') {
    return options.plannerRun;
  }
  if (options.plannerArtifact && typeof options.plannerArtifact === 'object') {
    return options.plannerArtifact;
  }
  const runs = Array.isArray(options.plannerRuns) ? options.plannerRuns : listPlannerRuns(rootPath);
  const latest = runs[0] || null;
  if (!latest || !latest.id) {
    return null;
  }
  return readPlannerRun(rootPath, latest.id) || latest;
}

function normalizePlannerTargetClass(value = '') {
  return normalizeText(value).toLowerCase();
}

function evaluatePlannerPackagingTruth(plannerRun = null, layout = null) {
  if (!plannerRun || typeof plannerRun !== 'object') {
    return {
      known: false,
      covered: true,
      status: 'unknown',
      predicates: [],
      failedPredicates: [],
      targetClassSummary: {
        plan: null,
        task: null,
        qa: null,
        hire: null,
      },
      contract: null,
    };
  }

  const normalizedLayout = normalizeStudioLayoutSchema(layout || createDefaultStudioLayoutSchema());
  const plannerCoverage = buildCanonicalPlannerCoverageTruth(normalizedLayout);
  const qaLeadCoverage = buildCanonicalQALeadCoverageTruth(normalizedLayout);
  const contract = buildPlannerArtifactContract(plannerRun, plannerRun.handoff || null, plannerRun.overrideLayer || null, {
    workspace: {
      studio: {
        layout: normalizedLayout,
      },
    },
    talentAcquisition: {
      plannerCoverage,
      qaLeadCoverage,
    },
  });

  const planTargetClasses = (Array.isArray(contract.planBundle?.items) ? contract.planBundle.items : []).map((item) => ({
    targetDesk: normalizeText(item?.targetDesk).toLowerCase(),
    targetRole: normalizeText(item?.targetRole).toLowerCase(),
  }));
  const taskTargetClasses = (Array.isArray(contract.taskBundle?.tasks) ? contract.taskBundle.tasks : []).map((item) => ({
    targetDesk: normalizeText(item?.targetDesk).toLowerCase(),
    targetRole: normalizeText(item?.targetRole).toLowerCase(),
  }));
  const qaTargetClass = {
    targetDesk: normalizeText(contract.qaRequest?.targetDesk).toLowerCase(),
    targetRole: normalizeText(contract.qaRequest?.targetRole).toLowerCase(),
  };
  const hireTargetClass = {
    targetDesk: normalizeText(contract.hireRequest?.targetDesk).toLowerCase(),
    targetRole: normalizeText(contract.hireRequest?.targetRole).toLowerCase(),
  };

  const planTargetsOk = planTargetClasses.length > 0
    && planTargetClasses.every((entry) => entry.targetDesk === 'planner' && entry.targetRole === 'planner');
  const taskTargetsOk = taskTargetClasses.length > 0
    && taskTargetClasses.every((entry) => entry.targetDesk === 'executor' && entry.targetRole === 'executor');
  const qaTargetsOk = !contract.qaRequest
    || (qaTargetClass.targetDesk === 'qa-lead' && qaTargetClass.targetRole === 'qa lead');
  const hireTargetsOk = !contract.hireRequest
    || (hireTargetClass.targetDesk === 'qa-lead' || hireTargetClass.targetDesk === 'planner');
  const predicates = [
    {
      key: 'planner-plan-target-class',
      label: 'Planner plan bundle targets the planner desk',
      passed: planTargetsOk,
      expected: { targetDesk: 'planner', targetRole: 'planner' },
      actual: planTargetClasses,
      source: 'planBundle.items',
    },
    {
      key: 'planner-task-target-class',
      label: 'Planner task bundle targets the executor desk',
      passed: taskTargetsOk,
      expected: { targetDesk: 'executor', targetRole: 'executor' },
      actual: taskTargetClasses,
      source: 'taskBundle.tasks',
    },
    {
      key: 'planner-qa-target-class',
      label: 'Planner QA request resolves to QA lead',
      passed: qaTargetsOk,
      expected: { targetDesk: 'qa-lead', targetRole: 'qa lead' },
      actual: contract.qaRequest ? qaTargetClass : null,
      source: 'qaRequest',
    },
    {
      key: 'planner-hire-target-class',
      label: 'Planner hire request resolves to a bounded target class',
      passed: hireTargetsOk,
      expected: { targetDesk: ['qa-lead', 'planner'] },
      actual: contract.hireRequest ? hireTargetClass : null,
      source: 'hireRequest',
    },
  ];
  const failedPredicates = predicates.filter((predicate) => !predicate.passed);
  return {
    known: true,
    covered: failedPredicates.length === 0,
    status: failedPredicates.length === 0 ? 'covered' : 'blocked',
    predicates,
    failedPredicates,
    targetClassSummary: {
      plan: planTargetClasses,
      task: taskTargetClasses,
      qa: qaTargetClass,
      hire: hireTargetClass,
    },
    contract,
  };
}

function classifyPlannerIntegrityTrigger({
  plannerCoverage = null,
  packagingTruth = null,
} = {}) {
  const failedCoverage = Array.isArray(plannerCoverage?.failedPredicates) ? plannerCoverage.failedPredicates : [];
  const failedCoverageLabels = failedCoverage.map((entry) => normalizeText(entry?.label || entry?.key));
  if (failedCoverageLabels.includes('Planner record is live and grounded')) {
    return 'planner_truth_stale';
  }
  if (failedCoverageLabels.some((label) => [
    'Canonical planner record exists',
    'Planner desk exists',
    'Planner agent exists',
    'Planner agent uses the canonical model profile',
  ].includes(label))) {
    return 'planner_identity_mismatch';
  }
  if (failedCoverageLabels.some((label) => [
    'Planner desk is owned by delivery',
    'Planner desk has the planner agent assigned',
    'Delivery lead seat is planner',
    'Delivery department includes the planner desk',
  ].includes(label))) {
    return 'planner_staffing_mismatch';
  }
  if (Array.isArray(packagingTruth?.failedPredicates) && packagingTruth.failedPredicates.length) {
    if (packagingTruth.failedPredicates.some((predicate) => [
      'planner-plan-target-class',
      'planner-task-target-class',
    ].includes(predicate.key))) {
      return 'planner_target_mismatch';
    }
    return 'planner_packaging_mismatch';
  }
  return null;
}

function buildPlannerCanonicalIntegrityState(rootPath = null, options = {}) {
  const layout = normalizeStudioLayoutSchema(options.layout || createDefaultStudioLayoutSchema());
  const plannerIdentity = buildPlannerIdentitySnapshot(layout.organization || {});
  const plannerCoverage = buildCanonicalPlannerCoverageTruth(layout);
  const latestPlannerRun = readLatestPlannerRun(rootPath, options);
  const plannerRunSummary = latestPlannerRun ? summarizePlannerRun(latestPlannerRun) : null;
  const packagingTruth = evaluatePlannerPackagingTruth(latestPlannerRun, layout);
  const trigger = classifyPlannerIntegrityTrigger({
    plannerCoverage,
    packagingTruth,
  });
  const covered = Boolean(plannerCoverage.covered && packagingTruth.covered);
  return {
    source: 'planner_canonical_integrity',
    layout,
    plannerIdentity,
    plannerCoverage,
    plannerRun: plannerRunSummary,
    plannerArtifact: packagingTruth.contract,
    packagingTruth,
    trigger,
    freshnessKnown: Boolean(latestPlannerRun),
    covered,
    status: covered ? 'healthy' : 'blocked',
    summary: covered
      ? 'Planner canonical integrity is healthy.'
      : 'Planner canonical integrity drift detected.',
  };
}

function buildPlannerCanonicalIntegrityInvestigation(rootPath = null, options = {}) {
  const checkedAt = normalizeText(options.checkedAt) || new Date().toISOString();
  const state = buildPlannerCanonicalIntegrityState(rootPath, options);
  if (state.covered) {
    return {
      ok: true,
      created: false,
      investigation: null,
      state,
    };
  }
  const investigationResult = appendQaInvestigation(rootPath, {
    type: 'qa_investigation',
    trigger: state.trigger || 'planner_identity_mismatch',
    severity: 'medium',
    createdAt: checkedAt,
    summary: 'Planner canonical integrity drift detected',
    evidence: {
      internal: {
        status: state.plannerCoverage.covered ? 'pass' : 'fail',
        test_id: 'planner_canonical_integrity',
        details: state.plannerCoverage.failedPredicateLabels.join('; ') || 'Planner coverage drift.',
      },
      external: {
        status: state.packagingTruth.covered ? 'pass' : 'fail',
        test_id: 'planner_canonical_integrity',
        details: state.packagingTruth.failedPredicates.map((predicate) => predicate.label).join('; ') || 'Planner packaging drift.',
      },
      comparison: {
        status_match: Boolean(state.covered),
        freshness_known: Boolean(state.freshnessKnown),
        trigger: state.trigger || 'planner_identity_mismatch',
        failed_predicates: [
          ...state.plannerCoverage.failedPredicateLabels,
          ...state.packagingTruth.failedPredicates.map((predicate) => predicate.label),
        ],
      },
    },
    latest_evidence: createQaInvestigationEvent({
      seenAt: checkedAt,
      trigger: state.trigger || 'planner_identity_mismatch',
      internal: {
        status: state.plannerCoverage.covered ? 'pass' : 'fail',
      },
      external: {
        status: state.packagingTruth.covered ? 'pass' : 'fail',
        test_id: 'planner_canonical_integrity',
      },
      comparison: {
        status_match: Boolean(state.covered),
        freshness_known: Boolean(state.freshnessKnown),
        trigger: state.trigger || 'planner_identity_mismatch',
      },
    }),
  });
  return {
    ok: true,
    created: Boolean(investigationResult?.created),
    investigation: investigationResult?.record || null,
    state,
  };
}

function maybeBridgePlannerCanonicalIntegrityInvestigations(rootPath = null, options = {}) {
  const result = buildPlannerCanonicalIntegrityInvestigation(rootPath, options);
  return {
    ...result,
    investigations: readOpenQaInvestigations(rootPath, options.limit || 10),
  };
}

module.exports = {
  buildPlannerCanonicalIntegrityInvestigation,
  buildPlannerCanonicalIntegrityState,
  buildPlannerArtifactPackagingTruth: evaluatePlannerPackagingTruth,
  classifyPlannerIntegrityTrigger,
  maybeBridgePlannerCanonicalIntegrityInvestigations,
  readLatestPlannerRun,
};
