import { AGENT_MODULE_VOCABULARY, listAgentsByModule } from './agentOwnershipModel.js';

function normalizeText(value = '') {
  return String(value || '').trim();
}

function normalizeId(value = '') {
  return normalizeText(value).toLowerCase();
}

function titleCaseId(value = '') {
  return normalizeText(value)
    .replace(/[-_]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function collectReasons({ strandCount = 0, hasBlockers = false, hasLeadCandidate = false, isModule = false, ownerCount = 0 }) {
  const reasons = [];
  if (hasBlockers) reasons.push('low validation');
  if (strandCount <= 1) reasons.push('low strandCount');
  if (!hasLeadCandidate && !isModule) reasons.push('weak relationship detected');
  if (strandCount === 0 || (isModule && ownerCount <= 1)) reasons.push('isolated component');
  if (isModule && ownerCount === 0) reasons.push('unowned module');
  return [...new Set(reasons)];
}

function buildRelationshipSignal(entity = {}) {
  const blockers = Array.isArray(entity.blockers) ? entity.blockers.filter(Boolean) : [];
  const openRoles = Array.isArray(entity.openRoles) ? entity.openRoles.filter(Boolean) : [];
  const assignedRoster = Array.isArray(entity.assignedRoster) ? entity.assignedRoster : [];
  const strandCount = Number(entity.assignedStaffCount ?? assignedRoster.length ?? 0);
  const leadLabel = normalizeText(entity.leadLabel) || titleCaseId(entity.leadRoleId) || titleCaseId(entity.label) || 'Lead';
  const targetRole = blockers[0] || openRoles[0] || null;
  const targetRoleLabel = normalizeText(targetRole?.roleLabel) || titleCaseId(targetRole?.roleId) || titleCaseId(entity.label) || 'Role';
  const reasons = collectReasons({
    strandCount,
    hasBlockers: blockers.length > 0,
    hasLeadCandidate: Boolean(entity.leadCandidate),
    isModule: false,
  });
  if (!reasons.length) return null;
  return {
    id: `relationship:${normalizeId(entity.entityType)}:${normalizeId(entity.entityId)}`,
    kind: 'relationship',
    scope: normalizeId(entity.entityType) || 'department',
    subjectType: normalizeId(entity.entityType) || 'department',
    subjectId: normalizeId(entity.entityId),
    label: `${leadLabel} -> ${targetRoleLabel} link weak`,
    suggestedHire: `Suggested hire: ${targetRoleLabel} Lead or Integration role`,
    reasons,
    strandCount,
    validation: 'low',
    validationScore: Math.max(0, 100 - (blockers.length * 30) - (strandCount <= 1 ? 20 : 0)),
    blockers: blockers.map((entry) => ({
      kind: normalizeText(entry.kind),
      roleId: normalizeId(entry.roleId),
      roleLabel: normalizeText(entry.roleLabel) || titleCaseId(entry.roleId),
      shortfall: Number(entry.shortfall || 0),
      urgency: normalizeText(entry.urgency),
    })),
    openRoles: openRoles.map((entry) => ({
      kind: normalizeText(entry.kind),
      roleId: normalizeId(entry.roleId),
      roleLabel: normalizeText(entry.roleLabel) || titleCaseId(entry.roleId),
      shortfall: Number(entry.shortfall || 0),
      urgency: normalizeText(entry.urgency),
      blocker: Boolean(entry.blocker),
    })),
    status: 'signal',
  };
}

function buildModuleSignal(moduleId = '') {
  const normalizedModuleId = normalizeId(moduleId);
  if (!normalizedModuleId || !AGENT_MODULE_VOCABULARY.includes(normalizedModuleId)) return null;
  const owners = listAgentsByModule(normalizedModuleId);
  const ownerCount = owners.length;
  if (ownerCount > 1) return null;
  const moduleLabel = titleCaseId(normalizedModuleId);
  const reasons = collectReasons({
    strandCount: ownerCount,
    hasBlockers: true,
    hasLeadCandidate: ownerCount > 0,
    isModule: true,
    ownerCount,
  });
  return {
    id: `module:${normalizedModuleId}`,
    kind: 'module',
    scope: 'module',
    subjectType: 'module',
    subjectId: normalizedModuleId,
    label: ownerCount === 0
      ? `${moduleLabel} module unowned`
      : `${moduleLabel} module isolated`,
    suggestedHire: ownerCount === 0
      ? `Suggested hire: ${moduleLabel} owner or Integration role`
      : `Suggested hire: shared ${moduleLabel} coverage or Integration role`,
    reasons,
    strandCount: ownerCount,
    validation: 'low',
    validationScore: ownerCount === 0 ? 10 : 30,
    owners: [...owners],
    ownerCount,
    status: 'signal',
  };
}

export function buildRelationshipHiringSignals(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const departments = Array.isArray(source.departments) ? source.departments : [];
  const desks = Array.isArray(source.desks) ? source.desks : [];
  const entitySignals = [...departments, ...desks]
    .map((entity) => buildRelationshipSignal(entity))
    .filter(Boolean);
  const moduleSignals = AGENT_MODULE_VOCABULARY
    .map((moduleId) => buildModuleSignal(moduleId))
    .filter(Boolean);
  return [...entitySignals, ...moduleSignals];
}
