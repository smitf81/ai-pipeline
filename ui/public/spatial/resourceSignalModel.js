function normalizeText(value = '') {
  return String(value || '').trim();
}

function normalizeId(value = '') {
  return normalizeText(value).toLowerCase();
}

function clampScore(value = 0) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function deriveResourcePressure(priorityScore = 0) {
  if (priorityScore >= 60) return 'high';
  if (priorityScore >= 25) return 'medium';
  return 'low';
}

function getCanonicalLeadCoverageTruth(health = {}) {
  const canonicalCoverage = health?.plannerCoverage && typeof health.plannerCoverage === 'object'
    ? health.plannerCoverage
    : (health?.qaLeadCoverage && typeof health.qaLeadCoverage === 'object'
      ? health.qaLeadCoverage
      : null);
  if (!canonicalCoverage || !Array.isArray(canonicalCoverage.failedPredicates)) return null;
  return canonicalCoverage;
}

function countBlockingRequirements(health = {}) {
  const canonicalCoverage = getCanonicalLeadCoverageTruth(health);
  if (canonicalCoverage) {
    return canonicalCoverage.failedPredicates.length;
  }
  const missingRequirements = Array.isArray(health.missingRequirements) ? health.missingRequirements : [];
  const blockerCount = missingRequirements.filter((entry) => normalizeText(entry?.severity) === 'block').length;
  if (blockerCount > 0) return blockerCount;
  return health?.dependency?.dependencyBlocked ? 1 : 0;
}

function countStaffingGaps(health = {}) {
  const canonicalCoverage = getCanonicalLeadCoverageTruth(health);
  if (canonicalCoverage) {
    return canonicalCoverage.failedPredicates.length;
  }
  const staffing = health?.staffing && typeof health.staffing === 'object' ? health.staffing : {};
  const openRoleCount = Number(staffing.openRoleCount || 0);
  const optionalRoleCount = Number(staffing.optionalRoleCount || 0);
  const missingRequirements = Array.isArray(health.missingRequirements) ? health.missingRequirements : [];
  const staffingRequirementCount = missingRequirements.filter((entry) => normalizeText(entry?.kind) === 'staffing' && normalizeText(entry?.severity) !== 'block').length;
  return openRoleCount + optionalRoleCount + staffingRequirementCount;
}

function countWeakRelationships(departmentId = '', relationshipSignals = []) {
  const targetDepartmentId = normalizeId(departmentId);
  if (!targetDepartmentId) return 0;
  return (Array.isArray(relationshipSignals) ? relationshipSignals : []).filter((signal) => {
    if (!signal || typeof signal !== 'object') return false;
    const subjectType = normalizeId(signal.subjectType || signal.scope);
    const subjectId = normalizeId(signal.subjectId);
    return subjectType === 'department' && subjectId === targetDepartmentId;
  }).length;
}

function hasMissingLead(health = {}) {
  const canonicalCoverage = getCanonicalLeadCoverageTruth(health);
  if (canonicalCoverage) {
    return canonicalCoverage.failedPredicates.some((entry) => /lead/i.test(normalizeText(entry?.label)) || /lead/i.test(normalizeText(entry?.key)));
  }
  if (normalizeId(health.status) === 'missing lead') return true;
  const missingRequirements = Array.isArray(health.missingRequirements) ? health.missingRequirements : [];
  return missingRequirements.some((entry) => normalizeId(entry?.code) === 'missing-lead' || (normalizeId(entry?.kind) === 'staffing' && /lead/i.test(normalizeText(entry?.reason))));
}

function buildReasonSummary({
  status = 'draft',
  blockerCount = 0,
  staffingGapCount = 0,
  weakRelationshipCount = 0,
  missingLead = false,
  leadCoverage = null,
} = {}) {
  const reasons = [];
  if (leadCoverage && leadCoverage.status === 'blocked') reasons.push('Lead coverage blocked');
  if (missingLead) reasons.push('Missing lead');
  if (blockerCount > 0) reasons.push(`${blockerCount} blocker${blockerCount === 1 ? '' : 's'}`);
  if (staffingGapCount > 0) reasons.push(`${staffingGapCount} staffing gap${staffingGapCount === 1 ? '' : 's'}`);
  if (weakRelationshipCount > 0) reasons.push(`${weakRelationshipCount} weak relationship${weakRelationshipCount === 1 ? '' : 's'}`);
  if (status === 'draft') reasons.push('Draft department');
  if (status === 'support-only') reasons.push('Support-only department');
  return reasons;
}

function compareSignals(left, right) {
  const scoreDelta = Number(right.priorityScore || 0) - Number(left.priorityScore || 0);
  if (scoreDelta !== 0) return scoreDelta;
  const blockerDelta = Number(right.blockerCount || 0) - Number(left.blockerCount || 0);
  if (blockerDelta !== 0) return blockerDelta;
  const staffingDelta = Number(right.staffingGapCount || 0) - Number(left.staffingGapCount || 0);
  if (staffingDelta !== 0) return staffingDelta;
  return String(left.departmentId || '').localeCompare(String(right.departmentId || ''));
}

function buildDepartmentResourceSignal(department = {}, relationshipSignals = []) {
  const health = department?.health && typeof department.health === 'object' ? department.health : {};
  const status = normalizeId(health.status || department.status || 'draft');
  const leadCoverage = getCanonicalLeadCoverageTruth(health);
  const blockerCount = countBlockingRequirements(health);
  const staffingGapCount = countStaffingGaps(health);
  const weakRelationshipCount = countWeakRelationships(department.id, relationshipSignals);
  const missingLead = hasMissingLead(health);
  const effectiveStatus = status === 'missing lead' && !missingLead ? 'active' : status;
  const statusBase = {
    blocked: 35,
    'missing lead': 35,
    understaffed: 20,
    draft: 12,
    'support-only': 8,
    active: 0,
  }[effectiveStatus] ?? 0;
  const priorityScore = clampScore(
    statusBase
      + (blockerCount * 12)
      + (staffingGapCount * 8)
      + (weakRelationshipCount * 5)
      + (missingLead ? 10 : 0),
  );

  return {
    departmentId: normalizeId(department.id),
    departmentLabel: normalizeText(department.label) || normalizeText(department.name) || normalizeId(department.id),
    status: effectiveStatus,
    priorityScore,
    resourcePressure: deriveResourcePressure(priorityScore),
    blockerCount,
    staffingGapCount,
    weakRelationshipCount,
    missingLead,
    leadCoverage,
    reasonSummary: buildReasonSummary({
      status: effectiveStatus,
      blockerCount,
      staffingGapCount,
      weakRelationshipCount,
      missingLead,
      leadCoverage,
    }),
  };
}

export function buildResourceSignalModel(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const orgHealthModel = source.orgHealthModel && typeof source.orgHealthModel === 'object'
    ? source.orgHealthModel
    : (source.orgHealth && typeof source.orgHealth === 'object' ? source.orgHealth : {});
  const relationshipSignals = Array.isArray(source.relationshipSignals) ? source.relationshipSignals : [];
  const departments = Array.isArray(orgHealthModel.departments) ? orgHealthModel.departments : [];
  const resourceSignals = departments
    .map((department) => buildDepartmentResourceSignal(department, relationshipSignals))
    .sort(compareSignals);
  return {
    departments: resourceSignals,
    summary: {
      totalDepartments: resourceSignals.length,
      highPressureCount: resourceSignals.filter((entry) => entry.resourcePressure === 'high').length,
      mediumPressureCount: resourceSignals.filter((entry) => entry.resourcePressure === 'medium').length,
      lowPressureCount: resourceSignals.filter((entry) => entry.resourcePressure === 'low').length,
      topDepartmentId: resourceSignals[0]?.departmentId || null,
    },
  };
}

export function getDepartmentResourceSignal(departmentId, model = {}) {
  const targetId = normalizeId(departmentId);
  if (!targetId) return null;
  const departments = Array.isArray(model.departments) ? model.departments : [];
  return departments.find((entry) => normalizeId(entry.departmentId) === targetId) || null;
}

export function listDepartmentsByPriority(model = {}) {
  const departments = Array.isArray(model.departments) ? model.departments : [];
  return [...departments].sort(compareSignals);
}
