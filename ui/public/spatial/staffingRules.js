import { STUDIO_DEPARTMENT_TEMPLATES, STUDIO_DESK_TEMPLATES } from './studioTemplates.js';
import { getRoleById } from './roleTaxonomy.mjs';

const ENTITY_TYPES = Object.freeze(['department', 'desk']);
const STAFFING_HEALTH = Object.freeze(['healthy', 'degraded', 'blocked']);
const DEFAULT_EXISTENCE_MINIMUM = 0;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeText(value = '') {
  return String(value || '').trim();
}

function normalizeRoleId(value = '') {
  return normalizeText(value).toLowerCase();
}

function normalizeRoleList(value = []) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((entry) => normalizeRoleId(entry))
    .filter(Boolean))];
}

function normalizeLeadRequirement(value = null) {
  if (!isPlainObject(value)) return null;
  const roleId = normalizeRoleId(value.roleId || value.role || value.id);
  if (!roleId) return null;
  return {
    roleId,
    minimumCount: Math.max(1, Number(value.minimumCount || value.minimum || 1)),
  };
}

function normalizeCanState(value = {}, fallbackMinimum = 0) {
  const source = isPlainObject(value) ? value : {};
  return {
    minimumStaffing: Math.max(0, Number.isFinite(Number(source.minimumStaffing)) ? Number(source.minimumStaffing) : fallbackMinimum),
    requiredRoles: normalizeRoleList(source.requiredRoles),
    optionalRoles: normalizeRoleList(source.optionalRoles),
    allowMissingLead: source.allowMissingLead === undefined ? true : Boolean(source.allowMissingLead),
  };
}

export function createStaffingRule({
  entityType = 'desk',
  entityId = '',
  label = '',
  requiredRoles = [],
  optionalRoles = [],
  minimumStaffing = 1,
  leadRequirement = null,
  canExist = null,
  canOperate = null,
} = {}) {
  if (!ENTITY_TYPES.includes(entityType)) {
    throw new Error(`Unsupported staffing entity type: ${entityType}`);
  }

  const normalizedRequiredRoles = normalizeRoleList(requiredRoles);
  const normalizedOptionalRoles = normalizeRoleList(optionalRoles);
  const normalizedLeadRequirement = normalizeLeadRequirement(leadRequirement);
  const operateState = normalizeCanState(canOperate, minimumStaffing);
  const existenceState = normalizeCanState(canExist, DEFAULT_EXISTENCE_MINIMUM);

  return {
    entityType,
    entityId: normalizeText(entityId),
    label: normalizeText(label),
    requiredRoles: normalizedRequiredRoles,
    optionalRoles: normalizedOptionalRoles,
    minimumStaffing: Math.max(0, Number(minimumStaffing || 0)),
    leadRequirement: normalizedLeadRequirement,
    canExist: {
      ...existenceState,
      optionalRoles: [...new Set([...existenceState.optionalRoles, ...normalizedOptionalRoles])],
    },
    canOperate: {
      ...operateState,
      requiredRoles: [...new Set([...operateState.requiredRoles, ...normalizedRequiredRoles])],
      optionalRoles: [...new Set([...operateState.optionalRoles, ...normalizedOptionalRoles])],
      requireLead: normalizedLeadRequirement ? (operateState.requireLead === undefined ? true : Boolean(operateState.requireLead)) : false,
    },
  };
}

function buildStudioLabel(entityType, entityId) {
  if (entityType === 'department') {
    return STUDIO_DEPARTMENT_TEMPLATES[entityId]?.label || entityId;
  }
  return STUDIO_DESK_TEMPLATES[entityId]?.label || entityId;
}

const DEPARTMENT_STAFFING_RULES = Object.freeze({
  'context-intake': createStaffingRule({
    entityType: 'department',
    entityId: 'context-intake',
    label: buildStudioLabel('department', 'context-intake'),
    requiredRoles: ['context-manager', 'planner'],
    optionalRoles: ['qa-lead'],
    minimumStaffing: 2,
    leadRequirement: { roleId: 'planner', minimumCount: 1 },
    canExist: { minimumStaffing: 1, requiredRoles: ['context-manager'], optionalRoles: ['planner'] },
    canOperate: { minimumStaffing: 2, requiredRoles: ['context-manager', 'planner'], optionalRoles: ['qa-lead'], allowMissingLead: false },
  }),
  delivery: createStaffingRule({
    entityType: 'department',
    entityId: 'delivery',
    label: buildStudioLabel('department', 'delivery'),
    requiredRoles: ['executor', 'memory-archivist'],
    optionalRoles: ['planner'],
    minimumStaffing: 2,
    leadRequirement: { roleId: 'executor', minimumCount: 1 },
    canExist: { minimumStaffing: 1, requiredRoles: ['executor'], optionalRoles: ['memory-archivist'] },
    canOperate: { minimumStaffing: 2, requiredRoles: ['executor'], optionalRoles: ['memory-archivist', 'planner'], allowMissingLead: false },
  }),
  research: createStaffingRule({
    entityType: 'department',
    entityId: 'research',
    label: buildStudioLabel('department', 'research'),
    requiredRoles: ['prototype-engineer', 'systems-synthesiser', 'validation-analyst'],
    optionalRoles: [],
    minimumStaffing: 1,
    leadRequirement: { roleId: 'rnd-lead', minimumCount: 1 },
    canExist: { minimumStaffing: 1, requiredRoles: [], optionalRoles: [] },
    canOperate: { minimumStaffing: 4, requiredRoles: ['prototype-engineer', 'systems-synthesiser', 'validation-analyst'], optionalRoles: [], allowMissingLead: false },
  }),
  'talent-acquisition': createStaffingRule({
    entityType: 'department',
    entityId: 'talent-acquisition',
    label: buildStudioLabel('department', 'talent-acquisition'),
    requiredRoles: ['integration_auditor'],
    optionalRoles: [],
    minimumStaffing: 1,
    leadRequirement: { roleId: 'integration_auditor', minimumCount: 1 },
    canExist: { minimumStaffing: 1, requiredRoles: ['integration_auditor'], optionalRoles: [] },
    canOperate: { minimumStaffing: 1, requiredRoles: ['integration_auditor'], optionalRoles: [], allowMissingLead: false },
  }),
  governance: createStaffingRule({
    entityType: 'department',
    entityId: 'governance',
    label: buildStudioLabel('department', 'governance'),
    requiredRoles: ['qa-lead', 'cto-architect'],
    optionalRoles: ['memory-archivist'],
    minimumStaffing: 2,
    leadRequirement: { roleId: 'cto-architect', minimumCount: 1 },
    canExist: { minimumStaffing: 1, requiredRoles: ['cto-architect'], optionalRoles: ['qa-lead'] },
    canOperate: { minimumStaffing: 2, requiredRoles: ['qa-lead', 'cto-architect'], optionalRoles: ['memory-archivist'], allowMissingLead: false },
  }),
});

const DESK_STAFFING_RULES = Object.freeze({
  'context-manager': createStaffingRule({
    entityType: 'desk',
    entityId: 'context-manager',
    label: buildStudioLabel('desk', 'context-manager'),
    requiredRoles: ['context-manager'],
    optionalRoles: ['planner'],
    minimumStaffing: 1,
    leadRequirement: { roleId: 'context-manager', minimumCount: 1 },
    canExist: { minimumStaffing: 0, requiredRoles: [], optionalRoles: ['context-manager'] },
    canOperate: { minimumStaffing: 1, requiredRoles: ['context-manager'], optionalRoles: ['planner'], allowMissingLead: false },
  }),
  planner: createStaffingRule({
    entityType: 'desk',
    entityId: 'planner',
    label: buildStudioLabel('desk', 'planner'),
    requiredRoles: ['planner'],
    optionalRoles: ['context-manager'],
    minimumStaffing: 1,
    leadRequirement: { roleId: 'planner', minimumCount: 1 },
    canExist: { minimumStaffing: 0, requiredRoles: [], optionalRoles: ['planner'] },
    canOperate: { minimumStaffing: 1, requiredRoles: ['planner'], optionalRoles: ['context-manager'], allowMissingLead: false },
  }),
  executor: createStaffingRule({
    entityType: 'desk',
    entityId: 'executor',
    label: buildStudioLabel('desk', 'executor'),
    requiredRoles: ['executor'],
    optionalRoles: ['planner'],
    minimumStaffing: 1,
    leadRequirement: { roleId: 'executor', minimumCount: 1 },
    canExist: { minimumStaffing: 0, requiredRoles: [], optionalRoles: ['executor'] },
    canOperate: { minimumStaffing: 1, requiredRoles: ['executor'], optionalRoles: ['planner'], allowMissingLead: false },
  }),
  'rnd-lead': createStaffingRule({
    entityType: 'desk',
    entityId: 'rnd-lead',
    label: buildStudioLabel('desk', 'rnd-lead'),
    requiredRoles: ['rnd-lead'],
    optionalRoles: [],
    minimumStaffing: 1,
    leadRequirement: { roleId: 'rnd-lead', minimumCount: 1 },
    canExist: { minimumStaffing: 0, requiredRoles: [], optionalRoles: ['rnd-lead'] },
    canOperate: { minimumStaffing: 1, requiredRoles: ['rnd-lead'], optionalRoles: [], allowMissingLead: false },
  }),
  'memory-archivist': createStaffingRule({
    entityType: 'desk',
    entityId: 'memory-archivist',
    label: buildStudioLabel('desk', 'memory-archivist'),
    requiredRoles: ['memory-archivist'],
    optionalRoles: ['context-manager'],
    minimumStaffing: 1,
    leadRequirement: { roleId: 'memory-archivist', minimumCount: 1 },
    canExist: { minimumStaffing: 0, requiredRoles: [], optionalRoles: ['memory-archivist'] },
    canOperate: { minimumStaffing: 1, requiredRoles: ['memory-archivist'], optionalRoles: ['context-manager'], allowMissingLead: false },
  }),
  'qa-lead': createStaffingRule({
    entityType: 'desk',
    entityId: 'qa-lead',
    label: buildStudioLabel('desk', 'qa-lead'),
    requiredRoles: ['qa-lead'],
    optionalRoles: ['memory-archivist'],
    minimumStaffing: 1,
    leadRequirement: { roleId: 'qa-lead', minimumCount: 1 },
    canExist: { minimumStaffing: 0, requiredRoles: [], optionalRoles: ['qa-lead'] },
    canOperate: { minimumStaffing: 1, requiredRoles: ['qa-lead'], optionalRoles: ['memory-archivist'], allowMissingLead: false },
  }),
  'cto-architect': createStaffingRule({
    entityType: 'desk',
    entityId: 'cto-architect',
    label: buildStudioLabel('desk', 'cto-architect'),
    requiredRoles: ['cto-architect'],
    optionalRoles: ['qa-lead'],
    minimumStaffing: 1,
    leadRequirement: { roleId: 'cto-architect', minimumCount: 1 },
    canExist: { minimumStaffing: 0, requiredRoles: [], optionalRoles: ['cto-architect'] },
    canOperate: { minimumStaffing: 1, requiredRoles: ['cto-architect'], optionalRoles: ['qa-lead'], allowMissingLead: false },
  }),
  integration_auditor: createStaffingRule({
    entityType: 'desk',
    entityId: 'integration_auditor',
    label: buildStudioLabel('desk', 'integration_auditor'),
    requiredRoles: ['integration_auditor'],
    optionalRoles: [],
    minimumStaffing: 1,
    leadRequirement: { roleId: 'integration_auditor', minimumCount: 1 },
    canExist: { minimumStaffing: 0, requiredRoles: [], optionalRoles: ['integration_auditor'] },
    canOperate: { minimumStaffing: 1, requiredRoles: ['integration_auditor'], optionalRoles: [], allowMissingLead: false },
  }),
});

export const STAFFING_RULES = Object.freeze({
  departments: DEPARTMENT_STAFFING_RULES,
  desks: DESK_STAFFING_RULES,
});

const TA_GAP_URGENCY_ORDER = Object.freeze({
  critical: 3,
  high: 2,
  medium: 1,
  low: 0,
});

function normalizeAssignment(value = {}) {
  if (typeof value === 'string') {
    return { roleId: normalizeRoleId(value), isLead: false };
  }
  if (!isPlainObject(value)) {
    return { roleId: '', isLead: false };
  }
  return {
    roleId: normalizeRoleId(value.roleId || value.role || value.id || value.templateId),
    isLead: Boolean(value.isLead || value.lead || value.leadRole),
  };
}

function normalizeAssignments(assignments = []) {
  return (Array.isArray(assignments) ? assignments : [])
    .map((assignment) => normalizeAssignment(assignment))
    .filter((assignment) => assignment.roleId);
}

function buildRoleLabel(roleId = '') {
  return getRoleById(roleId)?.label || buildStudioLabel('desk', roleId) || normalizeText(roleId);
}

function countAssignments(assignments = []) {
  return normalizeAssignments(assignments).reduce((counts, assignment) => {
    counts.set(assignment.roleId, (counts.get(assignment.roleId) || 0) + 1);
    return counts;
  }, new Map());
}

function requiredRolesSatisfied(requiredRoles = [], counts = new Map()) {
  return requiredRoles.every((roleId) => (counts.get(roleId) || 0) > 0);
}

function buildHiringNeeds(rule, counts, canOperateMet) {
  const needs = [];
  const missingRequiredRoles = rule.requiredRoles.filter((roleId) => (counts.get(roleId) || 0) === 0);
  for (const roleId of missingRequiredRoles) {
    needs.push({
      kind: 'required-role',
      roleId,
      shortfall: 1,
    });
  }

  if (rule.leadRequirement) {
    const leadCount = counts.get(rule.leadRequirement.roleId) || 0;
    if (leadCount < rule.leadRequirement.minimumCount) {
      needs.push({
        kind: 'lead',
        roleId: rule.leadRequirement.roleId,
        shortfall: rule.leadRequirement.minimumCount - leadCount,
      });
    }
  }

  const staffedCount = [...counts.values()].reduce((sum, value) => sum + value, 0);
  if (staffedCount < rule.minimumStaffing) {
    needs.push({
      kind: 'minimum-staffing',
      roleId: null,
      shortfall: rule.minimumStaffing - staffedCount,
    });
  }

  if (!canOperateMet && rule.canExist.requiredRoles.length === 0 && rule.canExist.minimumStaffing > 0) {
    needs.push({
      kind: 'existence-floor',
      roleId: null,
      shortfall: rule.canExist.minimumStaffing - staffedCount,
    });
  }

  return needs;
}

export function evaluateStaffingRule(rule = null, assignments = []) {
  if (!rule || !isPlainObject(rule)) {
    return null;
  }
  const counts = countAssignments(assignments);
  const staffCount = [...counts.values()].reduce((sum, value) => sum + value, 0);
  const canExistMet = staffCount >= rule.canExist.minimumStaffing
    && requiredRolesSatisfied(rule.canExist.requiredRoles, counts);
  const leadSatisfied = rule.leadRequirement
    ? (counts.get(rule.leadRequirement.roleId) || 0) >= rule.leadRequirement.minimumCount
    : true;
  const canOperateMet = staffCount >= rule.minimumStaffing
    && requiredRolesSatisfied(rule.canOperate.requiredRoles, counts)
    && (!rule.canOperate.requireLead || leadSatisfied);
  const health = canOperateMet ? 'healthy' : (canExistMet ? 'degraded' : 'blocked');
  const blocked = !canOperateMet;
  const optionalCoverage = rule.optionalRoles.filter((roleId) => (counts.get(roleId) || 0) > 0);

  return {
    entityType: rule.entityType,
    entityId: rule.entityId,
    label: rule.label,
    assignedStaffCount: staffCount,
    assignedRoles: [...counts.keys()],
    roleCounts: Object.fromEntries(counts.entries()),
    requiredRoles: [...rule.requiredRoles],
    optionalRoles: [...rule.optionalRoles],
    leadRequirement: rule.leadRequirement,
    canExist: {
      ...rule.canExist,
      met: canExistMet,
    },
    canOperate: {
      ...rule.canOperate,
      met: canOperateMet,
    },
    health,
    blocked,
    blockedReason: canOperateMet
      ? ''
      : (canExistMet ? 'staffing-insufficient-for-operation' : 'staffing-insufficient-for-existence'),
    optionalCoverage,
    hiringNeeds: buildHiringNeeds(rule, counts, canOperateMet),
  };
}

export function evaluateStaffingModel(model = STAFFING_RULES, assignmentsByEntity = {}) {
  const departments = Object.entries(model?.departments || {}).map(([entityId, rule]) => ({
    entityId,
    ...evaluateStaffingRule(rule, assignmentsByEntity?.departments?.[entityId] || []),
  }));
  const desks = Object.entries(model?.desks || {}).map(([entityId, rule]) => ({
    entityId,
    ...evaluateStaffingRule(rule, assignmentsByEntity?.desks?.[entityId] || []),
  }));
  const entities = [...departments, ...desks];
  const hiringNeeds = entities.flatMap((entity) => entity.hiringNeeds.map((need) => ({
    ...need,
    entityType: entity.entityType,
    entityId: entity.entityId,
    entityLabel: entity.label,
  })));

  return {
    entities,
    departments,
    desks,
    summary: {
      healthyCount: entities.filter((entity) => entity.health === 'healthy').length,
      degradedCount: entities.filter((entity) => entity.health === 'degraded').length,
      blockedCount: entities.filter((entity) => entity.health === 'blocked').length,
      hiringNeedCount: hiringNeeds.length,
    },
    hiringNeeds,
  };
}

export function buildStaffingAssignmentsFromTaHires(hiredCandidates = []) {
  const assignmentsByEntity = {
    departments: {},
    desks: {},
  };
  const deskToDepartment = new Map();

  Object.entries(STUDIO_DEPARTMENT_TEMPLATES).forEach(([departmentId, template]) => {
    (template.deskTemplateIds || []).forEach((deskId) => {
      deskToDepartment.set(deskId, departmentId);
    });
  });

  (Array.isArray(hiredCandidates) ? hiredCandidates : []).forEach((candidate) => {
    const deskId = normalizeRoleId(candidate?.hiredDeskId || candidate?.primaryDeskTarget || candidate?.primary_desk_target || candidate?.deskId);
    if (!deskId) return;
    const assignment = { roleId: deskId, isLead: candidate?.contractLocked === true || candidate?.isLead === true };
    if (!assignmentsByEntity.desks[deskId]) {
      assignmentsByEntity.desks[deskId] = [];
    }
    assignmentsByEntity.desks[deskId].push(assignment);
    const departmentId = deskToDepartment.get(deskId);
    if (departmentId) {
      if (!assignmentsByEntity.departments[departmentId]) {
        assignmentsByEntity.departments[departmentId] = [];
      }
      assignmentsByEntity.departments[departmentId].push(assignment);
    }
  });

  return assignmentsByEntity;
}

function deriveTaGapKind(needKind = '') {
  if (needKind === 'lead') return 'missing lead';
  if (needKind === 'optional-role') return 'optional hire';
  return 'understaffed';
}

function deriveTaGapUrgency(needKind = '') {
  if (needKind === 'lead') return 'critical';
  if (needKind === 'required-role' || needKind === 'minimum-staffing' || needKind === 'existence-floor') return 'high';
  if (needKind === 'optional-role') return 'low';
  return 'medium';
}

function deriveOpenRolesForEntity(entity) {
  if (!entity || !isPlainObject(entity)) return [];
  const roleCounts = isPlainObject(entity.roleCounts) ? entity.roleCounts : {};
  const openRoles = [];
  const roleIds = new Set([
    ...((entity.requiredRoles || []).filter(Boolean)),
    ...((entity.optionalRoles || []).filter(Boolean)),
    ...(entity.leadRequirement?.roleId ? [entity.leadRequirement.roleId] : []),
  ]);

  (entity.hiringNeeds || []).forEach((need) => {
    if (!need || !need.kind) return;
    const kind = deriveTaGapKind(need.kind);
    const urgency = deriveTaGapUrgency(need.kind);
    const roleId = need.roleId || null;
    openRoles.push({
      kind,
      sourceKind: need.kind,
      entityType: entity.entityType,
      entityId: entity.entityId,
      entityLabel: entity.label,
      roleId,
      roleLabel: roleId ? buildRoleLabel(roleId) : '',
      shortfall: Number(need.shortfall || 0),
      urgency,
      blocker: kind !== 'optional hire',
      covered: roleId ? (Number(roleCounts[roleId] || 0) > 0) : false,
    });
  });

  for (const roleId of roleIds) {
    const hasCoverage = Number(roleCounts[roleId] || 0) > 0;
    if (hasCoverage) continue;
    const isLeadRole = entity.leadRequirement?.roleId === roleId;
    const optional = (entity.optionalRoles || []).includes(roleId);
    const kind = isLeadRole ? 'missing lead' : (optional ? 'optional hire' : 'understaffed');
    const urgency = isLeadRole ? 'critical' : (optional ? 'low' : 'high');
    if (openRoles.some((entry) => entry.roleId === roleId && entry.kind === kind)) continue;
    openRoles.push({
      kind,
      sourceKind: isLeadRole ? 'lead' : (optional ? 'optional-role' : 'required-role'),
      entityType: entity.entityType,
      entityId: entity.entityId,
      entityLabel: entity.label,
      roleId,
      roleLabel: buildRoleLabel(roleId),
      shortfall: 1,
      urgency,
      blocker: kind !== 'optional hire',
      covered: false,
    });
  }

  openRoles.sort((left, right) => {
    const urgencyDelta = (TA_GAP_URGENCY_ORDER[right.urgency] || 0) - (TA_GAP_URGENCY_ORDER[left.urgency] || 0);
    if (urgencyDelta !== 0) return urgencyDelta;
    return String(left.roleLabel || left.roleId || '').localeCompare(String(right.roleLabel || right.roleId || ''));
  });

  return openRoles;
}

export function computeTaGapModel(model = STAFFING_RULES, hiredCandidates = []) {
  const assignmentsByEntity = buildStaffingAssignmentsFromTaHires(hiredCandidates);
  const staffingModel = evaluateStaffingModel(model, assignmentsByEntity);
  const coverage = staffingModel.entities.map((entity) => {
    const openRoles = deriveOpenRolesForEntity(entity);
    const blockers = openRoles.filter((entry) => entry.blocker);
    const urgency = openRoles.length
      ? openRoles.reduce((current, entry) => (
        (TA_GAP_URGENCY_ORDER[entry.urgency] || 0) > (TA_GAP_URGENCY_ORDER[current] || 0)
          ? entry.urgency
          : current
      ), 'low')
      : 'low';
    return {
      ...entity,
      openRoles,
      blockers,
      urgency,
      statusLabel: openRoles.length
        ? (blockers.some((entry) => entry.kind === 'missing lead') ? 'missing lead' : (blockers.length ? 'understaffed' : 'optional hire'))
        : 'covered',
    };
  });
  const openRoles = coverage.flatMap((entity) => entity.openRoles);
  const blockers = openRoles.filter((entry) => entry.blocker);
  const urgency = openRoles.length
    ? openRoles.reduce((current, entry) => (
      (TA_GAP_URGENCY_ORDER[entry.urgency] || 0) > (TA_GAP_URGENCY_ORDER[current] || 0)
        ? entry.urgency
        : current
    ), 'low')
    : 'low';

  return {
    staffingModel,
    coverage,
    openRoles,
    blockers,
    urgency,
    summary: {
      openRoleCount: openRoles.length,
      blockerCount: blockers.length,
      missingLeadCount: openRoles.filter((entry) => entry.kind === 'missing lead').length,
      understaffedCount: openRoles.filter((entry) => entry.kind === 'understaffed').length,
      optionalHireCount: openRoles.filter((entry) => entry.kind === 'optional hire').length,
      urgency,
    },
  };
}

export function getStaffingRule(entityType, entityId) {
  if (entityType === 'department') {
    return STAFFING_RULES.departments[entityId] || null;
  }
  if (entityType === 'desk') {
    return STAFFING_RULES.desks[entityId] || null;
  }
  return null;
}

export { ENTITY_TYPES, STAFFING_HEALTH };
