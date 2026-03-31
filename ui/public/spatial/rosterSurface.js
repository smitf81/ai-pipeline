import { STUDIO_DEPARTMENT_TEMPLATES } from './studioTemplates.js';
import { buildRelationshipHiringSignals } from './relationshipHiringSignals.js';

function normalizeText(value = '') {
  return String(value || '').trim();
}

function normalizeId(value = '') {
  return normalizeText(value).toLowerCase();
}

function titleCaseRoleId(roleId = '') {
  return normalizeText(roleId)
    .replace(/[-_]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeRosterEntry(entry = {}) {
  const source = entry && typeof entry === 'object' ? entry : {};
  return {
    id: normalizeText(source.id),
    name: normalizeText(source.name),
    role: normalizeText(source.role),
    roleId: normalizeId(source.roleId || source.role_id),
    department: normalizeText(source.department),
    departmentId: normalizeId(source.departmentId || source.department_id),
    deskId: normalizeId(source.deskId || source.hiredDeskId || source.primaryDeskTarget),
    assignedModel: normalizeText(source.assignedModel),
    hiredAt: source.hiredAt || null,
    summary: normalizeText(source.summary),
  };
}

function buildDeskToDepartmentMap() {
  const deskToDepartment = new Map();
  Object.entries(STUDIO_DEPARTMENT_TEMPLATES).forEach(([departmentId, template]) => {
    (template.deskTemplateIds || []).forEach((deskId) => {
      deskToDepartment.set(normalizeId(deskId), departmentId);
    });
  });
  return deskToDepartment;
}

function buildDeskToDepartmentMapFromOrganization(organization = null) {
  const deskToDepartment = new Map();
  if (!organization || typeof organization !== 'object') return deskToDepartment;
  Object.values(organization.desks || {}).forEach((desk) => {
    const deskId = normalizeId(desk?.id);
    const departmentId = normalizeId(desk?.ownerDepartmentId || desk?.departmentId);
    if (deskId && departmentId) deskToDepartment.set(deskId, departmentId);
  });
  return deskToDepartment;
}

function buildCoverageRecord(entity = {}, roster = [], deskToDepartment = new Map()) {
  const source = entity && typeof entity === 'object' ? entity : {};
  const entityId = normalizeId(source.entityId);
  const assignedRoster = roster.filter((candidate) => {
    if (!candidate?.deskId) return false;
    if (source.entityType === 'desk') {
      return candidate.deskId === entityId;
    }
    return deskToDepartment.get(candidate.deskId) === entityId;
  });
  const leadRoleId = normalizeId(source?.leadRequirement?.roleId);
  const leadCandidate = leadRoleId
    ? assignedRoster.find((candidate) => candidate.roleId === leadRoleId) || null
    : null;
  const roleIds = [...new Set([
    ...((Array.isArray(source.requiredRoles) ? source.requiredRoles : [])),
    ...((Array.isArray(source.optionalRoles) ? source.optionalRoles : [])),
    ...(leadRoleId ? [leadRoleId] : []),
  ].map((roleId) => normalizeId(roleId)).filter(Boolean))];
  const roleCoverage = roleIds.map((roleId) => {
    const count = Number(source?.roleCounts?.[roleId] || 0);
    const isRequired = (Array.isArray(source.requiredRoles) ? source.requiredRoles : []).map(normalizeId).includes(roleId);
    const isOptional = (Array.isArray(source.optionalRoles) ? source.optionalRoles : []).map(normalizeId).includes(roleId);
    return {
      roleId,
      roleLabel: titleCaseRoleId(roleId),
      count,
      covered: count > 0,
      required: isRequired,
      optional: isOptional,
      isLeadRole: leadRoleId === roleId,
    };
  });
  const missingRoles = (Array.isArray(source.openRoles) ? source.openRoles : [])
    .filter((entry) => entry && entry.blocker)
    .map((entry) => ({
      roleId: normalizeId(entry.roleId),
      roleLabel: normalizeText(entry.roleLabel) || titleCaseRoleId(entry.roleId),
      shortfall: Number(entry.shortfall || 0),
      kind: normalizeText(entry.kind),
    }));
  const optionalOpenRoles = (Array.isArray(source.openRoles) ? source.openRoles : [])
    .filter((entry) => entry && !entry.blocker)
    .map((entry) => ({
      roleId: normalizeId(entry.roleId),
      roleLabel: normalizeText(entry.roleLabel) || titleCaseRoleId(entry.roleId),
      shortfall: Number(entry.shortfall || 0),
      kind: normalizeText(entry.kind),
    }));
  const leadLabel = leadCandidate
    ? `${leadCandidate.name} | ${leadCandidate.role}`
    : (leadRoleId ? titleCaseRoleId(leadRoleId) : 'n/a');
  return {
    ...source,
    entityId,
    label: normalizeText(source.label) || titleCaseRoleId(entityId),
    openRoles: Array.isArray(source.openRoles) ? source.openRoles : [],
    blockers: Array.isArray(source.blockers) ? source.blockers : [],
    assignedRoster,
    leadRoleId: leadRoleId || null,
    leadCandidate,
    leadLabel,
    roleCoverage,
    missingRoles,
    optionalOpenRoles,
    openSeatCount: missingRoles.reduce((sum, entry) => sum + Number(entry.shortfall || 0), 0),
    optionalSeatCount: optionalOpenRoles.reduce((sum, entry) => sum + Number(entry.shortfall || 0), 0),
  };
}

export function buildRosterSurfaceModel(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const coverage = Array.isArray(source.coverage) ? source.coverage : [];
  const roster = Array.isArray(source.roster) ? source.roster.map((entry) => normalizeRosterEntry(entry)) : [];
  const deskToDepartment = (() => {
    const fromOrganization = buildDeskToDepartmentMapFromOrganization(source.organization);
    return fromOrganization.size ? fromOrganization : buildDeskToDepartmentMap();
  })();
  const departmentCards = coverage
    .filter((entity) => entity?.entityType === 'department')
    .map((entity) => buildCoverageRecord(entity, roster, deskToDepartment))
    .sort((left, right) => normalizeText(left.label).localeCompare(normalizeText(right.label)));
  const deskCards = coverage
    .filter((entity) => entity?.entityType === 'desk')
    .map((entity) => buildCoverageRecord(entity, roster, deskToDepartment))
    .sort((left, right) => normalizeText(left.label).localeCompare(normalizeText(right.label)));
  const summary = source.coverageSummary && typeof source.coverageSummary === 'object'
    ? source.coverageSummary
    : {};
  const openRoles = Array.isArray(source.gapModel?.openRoles) ? source.gapModel.openRoles : [];
  const blockers = Array.isArray(source.gapModel?.blockers) ? source.gapModel.blockers : [];
  const hiringSignals = buildRelationshipHiringSignals({
    departments: departmentCards,
    desks: deskCards,
  });
  return {
    department: source.department && typeof source.department === 'object' ? source.department : null,
    roster,
    coverage,
    departments: departmentCards,
    desks: deskCards,
    openRoles,
    blockers,
    hiringSignals,
    summary: {
      totalCoverage: Number(summary.total || coverage.length),
      healthyCount: Number(summary.healthyCount || 0),
      openEntityCount: Number(summary.openEntityCount || 0),
      openRoleCount: Number(summary.openRoleCount || openRoles.length),
      blockerCount: Number(summary.blockerCount || blockers.length),
      missingLeadCount: Number(summary.missingLeadCount || 0),
      understaffedCount: Number(summary.understaffedCount || 0),
      optionalHireCount: Number(summary.optionalHireCount || 0),
      urgency: normalizeText(summary.urgency) || 'low',
      rosterCount: roster.length,
    },
  };
}
