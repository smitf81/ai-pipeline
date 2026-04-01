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

function buildCanonicalPlannerCoverageTruth(layout = {}) {
  const organization = layout?.organization && typeof layout.organization === 'object'
    ? layout.organization
    : {};
  const canonical = {
    deskId: 'planner',
    roleId: 'planner',
    agentId: 'planner',
    modelProfileId: 'model-profile.planner-default',
    departmentId: 'dept-delivery',
    requiredLeadSeatId: 'planner',
  };
  const plannerRecord = organization.planner && typeof organization.planner === 'object'
    ? organization.planner
    : null;
  const deliveryDepartment = organization.departments?.[canonical.departmentId] || null;
  const plannerDesk = organization.desks?.[canonical.deskId] || null;
  const plannerAgent = organization.agents?.[canonical.agentId] || null;

  const predicates = [
    {
      key: 'planner-canonical-record',
      label: 'Canonical planner record exists',
      passed: Boolean(
        plannerRecord
        && plannerRecord.deskId === canonical.deskId
        && plannerRecord.roleId === canonical.roleId
        && plannerRecord.agentId === canonical.agentId
        && plannerRecord.modelProfileId === canonical.modelProfileId,
      ),
    },
    {
      key: 'planner-desk-present',
      label: 'Planner desk exists',
      passed: Boolean(plannerDesk),
    },
    {
      key: 'planner-desk-owned-by-delivery',
      label: 'Planner desk is owned by delivery',
      passed: Boolean(plannerDesk && (plannerDesk.departmentId === canonical.departmentId || plannerDesk.ownerDepartmentId === canonical.departmentId)),
    },
    {
      key: 'planner-desk-has-planner-agent',
      label: 'Planner desk has the planner agent assigned',
      passed: Boolean(plannerDesk && Array.isArray(plannerDesk.assignedAgentIds) && plannerDesk.assignedAgentIds.includes(canonical.agentId)),
    },
    {
      key: 'planner-agent-present',
      label: 'Planner agent exists',
      passed: Boolean(plannerAgent),
    },
    {
      key: 'planner-agent-model-profile',
      label: 'Planner agent uses the canonical model profile',
      passed: Boolean(plannerAgent && plannerAgent.modelProfileId === canonical.modelProfileId),
    },
    {
      key: 'delivery-lead-seat-is-planner',
      label: 'Delivery lead seat is planner',
      passed: Boolean(deliveryDepartment && deliveryDepartment.staffing && deliveryDepartment.staffing.requiredLeadSeatId === canonical.requiredLeadSeatId),
    },
    {
      key: 'delivery-department-includes-planner-desk',
      label: 'Delivery department includes the planner desk',
      passed: Boolean(deliveryDepartment && Array.isArray(deliveryDepartment.deskIds) && deliveryDepartment.deskIds.includes(canonical.deskId)),
    },
  ];

  const failedPredicates = predicates.filter((predicate) => !predicate.passed);
  return {
    canonical,
    organization,
    plannerRecord,
    deliveryDepartment,
    plannerDesk,
    plannerAgent,
    predicates,
    failedPredicates,
    covered: failedPredicates.length === 0,
    status: failedPredicates.length === 0 ? 'covered' : 'blocked',
    failedPredicateLabels: failedPredicates.map((predicate) => predicate.label),
  };
}

function buildCanonicalQALeadCoverageTruth(layout = {}) {
  const organization = layout?.organization && typeof layout.organization === 'object'
    ? layout.organization
    : {};
  const canonical = {
    deskId: 'qa-lead',
    roleId: 'qa-lead',
    agentId: 'qa-lead',
    modelProfileId: 'model-profile.default.qa-lead',
    departmentId: 'dept-quality',
    requiredLeadSeatId: 'qa-lead',
  };
  const qaLeadRecord = organization.qaLead && typeof organization.qaLead === 'object'
    ? organization.qaLead
    : null;
  const qualityDepartment = organization.departments?.[canonical.departmentId] || null;
  const qaLeadDesk = organization.desks?.[canonical.deskId] || null;
  const qaLeadAgent = organization.agents?.[canonical.agentId] || null;

  const predicates = [
    {
      key: 'qa-lead-canonical-record',
      label: 'Canonical QA lead record exists',
      passed: Boolean(
        qaLeadRecord
        && qaLeadRecord.deskId === canonical.deskId
        && qaLeadRecord.roleId === canonical.roleId
        && qaLeadRecord.agentId === canonical.agentId
        && qaLeadRecord.modelProfileId === canonical.modelProfileId,
      ),
    },
    {
      key: 'qa-lead-desk-present',
      label: 'QA lead desk exists',
      passed: Boolean(qaLeadDesk),
    },
    {
      key: 'qa-lead-desk-owned-by-quality',
      label: 'QA lead desk is owned by quality',
      passed: Boolean(qaLeadDesk && (qaLeadDesk.departmentId === canonical.departmentId || qaLeadDesk.ownerDepartmentId === canonical.departmentId)),
    },
    {
      key: 'qa-lead-desk-has-agent',
      label: 'QA lead desk has the QA lead agent assigned',
      passed: Boolean(qaLeadDesk && Array.isArray(qaLeadDesk.assignedAgentIds) && qaLeadDesk.assignedAgentIds.includes(canonical.agentId)),
    },
    {
      key: 'qa-lead-agent-present',
      label: 'QA lead agent exists',
      passed: Boolean(qaLeadAgent),
    },
    {
      key: 'qa-lead-agent-model-profile',
      label: 'QA lead agent uses the canonical model profile',
      passed: Boolean(qaLeadAgent && qaLeadAgent.modelProfileId === canonical.modelProfileId),
    },
    {
      key: 'quality-lead-seat-is-qa-lead',
      label: 'Quality lead seat is QA lead',
      passed: Boolean(qualityDepartment && qualityDepartment.staffing && qualityDepartment.staffing.requiredLeadSeatId === canonical.requiredLeadSeatId),
    },
    {
      key: 'quality-department-includes-qa-lead-desk',
      label: 'Quality department includes the QA lead desk',
      passed: Boolean(qualityDepartment && Array.isArray(qualityDepartment.deskIds) && qualityDepartment.deskIds.includes(canonical.deskId)),
    },
  ];

  const failedPredicates = predicates.filter((predicate) => !predicate.passed);
  return {
    canonical,
    organization,
    qaLeadRecord,
    qualityDepartment,
    qaLeadDesk,
    qaLeadAgent,
    predicates,
    failedPredicates,
    covered: failedPredicates.length === 0,
    status: failedPredicates.length === 0 ? 'covered' : 'blocked',
    failedPredicateLabels: failedPredicates.map((predicate) => predicate.label),
  };
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

const CANONICAL_STAFFING_DESK_TO_DEPARTMENT = Object.freeze({
  'context-manager': 'context-intake',
  planner: 'delivery',
  executor: 'delivery',
  'memory-archivist': 'delivery',
  'rnd-lead': 'research',
  'qa-lead': 'governance',
  'cto-architect': 'governance',
  integration_auditor: 'talent-acquisition',
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

function normalizeDepartmentId(value = '') {
  const normalized = normalizeRoleId(value);
  return normalized.startsWith('dept-') ? normalized.slice(5) : normalized;
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

function buildCanonicalDeskToDepartmentMap(layout = {}) {
  const deskToDepartment = new Map();
  const organization = layout?.organization && typeof layout.organization === 'object'
    ? layout.organization
    : null;
  if (organization) {
    Object.values(organization.desks || {}).forEach((desk) => {
      const deskId = normalizeRoleId(desk?.id);
      const departmentId = normalizeDepartmentId(desk?.ownerDepartmentId || desk?.departmentId);
      if (deskId && departmentId) deskToDepartment.set(deskId, departmentId);
    });
  }
  Object.entries(CANONICAL_STAFFING_DESK_TO_DEPARTMENT).forEach(([deskId, departmentId]) => {
    if (!deskToDepartment.has(deskId)) {
      deskToDepartment.set(deskId, departmentId);
    }
  });
  return deskToDepartment;
}

function seedCanonicalLeadAssignments(assignmentsByEntity = {}, canonicalCoverage = null, deskToDepartment = new Map()) {
  if (!canonicalCoverage || canonicalCoverage.covered !== true) return;
  const canonical = canonicalCoverage.canonical || {};
  const deskId = normalizeRoleId(canonical.deskId);
  const roleId = normalizeRoleId(canonical.roleId);
  if (!deskId || !roleId) return;
  const assignment = {
    roleId,
    isLead: true,
    agentId: normalizeRoleId(canonical.agentId || roleId),
    deskId,
    modelProfileId: normalizeText(canonical.modelProfileId || ''),
    canonicalSeatId: normalizeRoleId(canonical.agentId || roleId),
  };
  const deskAssignments = Array.isArray(assignmentsByEntity.desks?.[deskId])
    ? assignmentsByEntity.desks[deskId]
    : (assignmentsByEntity.desks[deskId] = []);
  if (!deskAssignments.some((entry) => normalizeRoleId(entry?.roleId) === roleId)) {
    deskAssignments.push(assignment);
  }
  const departmentId = deskToDepartment.get(deskId) || null;
  if (!departmentId) return;
  const departmentAssignments = Array.isArray(assignmentsByEntity.departments?.[departmentId])
    ? assignmentsByEntity.departments[departmentId]
    : (assignmentsByEntity.departments[departmentId] = []);
  if (!departmentAssignments.some((entry) => normalizeRoleId(entry?.roleId) === roleId)) {
    departmentAssignments.push(assignment);
  }
}

function buildDepartmentLabels(model = STAFFING_RULES) {
  return Object.fromEntries(
    Object.entries(model?.departments || {}).map(([departmentId, rule]) => [departmentId, rule?.label || departmentId]),
  );
}

function deriveCoverageUrgency(openRoles = []) {
  if (!Array.isArray(openRoles) || !openRoles.length) return 'low';
  return openRoles.reduce((current, entry) => (
    (TA_GAP_URGENCY_ORDER[entry?.urgency] || 0) > (TA_GAP_URGENCY_ORDER[current] || 0)
      ? entry.urgency
      : current
  ), 'low');
}

function createCanonicalSeatEntry(entity = {}, {
  kind = 'understaffed',
  sourceKind = 'required-role',
  roleId = null,
  shortfall = 1,
  urgency = 'high',
  blocker = true,
  departmentId = null,
  departmentLabel = null,
} = {}) {
  const normalizedRoleId = roleId ? normalizeRoleId(roleId) : null;
  const normalizedShortfall = Math.max(1, Number(shortfall || 1));
  return {
    kind,
    sourceKind,
    entityType: entity.entityType,
    entityId: entity.entityId,
    entityLabel: entity.label,
    departmentId,
    departmentLabel,
    roleId: normalizedRoleId,
    roleLabel: normalizedRoleId ? buildRoleLabel(normalizedRoleId) : '',
    shortfall: normalizedShortfall,
    urgency,
    blocker,
    covered: false,
    seatId: `${entity.entityType}:${entity.entityId}:${sourceKind}:${normalizedRoleId || 'coverage'}`,
  };
}

function buildCanonicalDeskOpenRoles(entity = {}, { departmentId = null, departmentLabel = null } = {}) {
  if (!entity || !isPlainObject(entity)) return [];
  const roleCounts = isPlainObject(entity.roleCounts) ? entity.roleCounts : {};
  const needs = Array.isArray(entity.hiringNeeds) ? entity.hiringNeeds : [];
  const openRoles = [];
  const leadNeed = needs.find((need) => need?.kind === 'lead') || null;
  const requiredNeed = needs.find((need) => need?.kind === 'required-role' && (!leadNeed || need.roleId !== leadNeed.roleId)) || null;
  const staffingNeed = (!leadNeed && !requiredNeed)
    ? (needs.find((need) => need?.kind === 'minimum-staffing') || needs.find((need) => need?.kind === 'existence-floor') || null)
    : null;

  if (leadNeed) {
    openRoles.push(createCanonicalSeatEntry(entity, {
      kind: 'missing lead',
      sourceKind: 'lead',
      roleId: leadNeed.roleId,
      shortfall: leadNeed.shortfall,
      urgency: 'critical',
      blocker: true,
      departmentId,
      departmentLabel,
    }));
  } else if (requiredNeed) {
    openRoles.push(createCanonicalSeatEntry(entity, {
      kind: 'understaffed',
      sourceKind: 'required-role',
      roleId: requiredNeed.roleId,
      shortfall: requiredNeed.shortfall,
      urgency: 'high',
      blocker: true,
      departmentId,
      departmentLabel,
    }));
  } else if (staffingNeed) {
    openRoles.push(createCanonicalSeatEntry(entity, {
      kind: 'understaffed',
      sourceKind: staffingNeed.kind,
      roleId: null,
      shortfall: staffingNeed.shortfall,
      urgency: 'high',
      blocker: true,
      departmentId,
      departmentLabel,
    }));
  }

  (entity.optionalRoles || []).forEach((roleId) => {
    if (Number(roleCounts[roleId] || 0) > 0) return;
    openRoles.push(createCanonicalSeatEntry(entity, {
      kind: 'optional hire',
      sourceKind: 'optional-role',
      roleId,
      shortfall: 1,
      urgency: 'low',
      blocker: false,
      departmentId,
      departmentLabel,
    }));
  });

  openRoles.sort((left, right) => {
    const urgencyDelta = (TA_GAP_URGENCY_ORDER[right.urgency] || 0) - (TA_GAP_URGENCY_ORDER[left.urgency] || 0);
    if (urgencyDelta !== 0) return urgencyDelta;
    return String(left.roleLabel || left.roleId || '').localeCompare(String(right.roleLabel || right.roleId || ''));
  });
  return openRoles;
}

function buildDepartmentCoverageEntries(staffingModel = {}, deskCoverage = [], model = STAFFING_RULES, options = {}) {
  const deskToDepartment = buildCanonicalDeskToDepartmentMap(options?.layout || {});
  return (staffingModel.departments || []).map((entity) => {
    const departmentId = normalizeDepartmentId(entity.entityId);
    const openRoles = deskCoverage
      .filter((deskEntry) => deskToDepartment.get(deskEntry.entityId) === departmentId)
      .flatMap((deskEntry) => deskEntry.openRoles.map((entry) => ({
        ...entry,
        departmentId,
        departmentLabel: entity.label,
      })));
    const blockers = openRoles.filter((entry) => entry.blocker);
    const urgency = deriveCoverageUrgency(openRoles);
    const statusLabel = openRoles.length
      ? (blockers.some((entry) => entry.kind === 'missing lead') ? 'missing lead' : (blockers.length ? 'understaffed' : 'optional hire'))
      : 'covered';
    return {
      ...entity,
      openRoles,
      blockers,
      urgency,
      blocked: blockers.length > 0,
      health: blockers.length > 0 ? 'blocked' : (openRoles.length ? 'degraded' : 'healthy'),
      statusLabel,
    };
  });
}

export function buildStaffingAssignmentsFromTaHires(hiredCandidates = [], options = {}) {
  const assignmentsByEntity = {
    departments: {},
    desks: {},
  };
  const deskToDepartment = buildCanonicalDeskToDepartmentMap(options?.layout || {});

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

export function computeTaGapModel(model = STAFFING_RULES, hiredCandidates = [], options = {}) {
  const assignmentsByEntity = buildStaffingAssignmentsFromTaHires(hiredCandidates, options);
  const deskToDepartment = buildCanonicalDeskToDepartmentMap(options?.layout || {});
  const plannerCoverage = buildCanonicalPlannerCoverageTruth(options?.layout || {});
  const qaLeadCoverage = buildCanonicalQALeadCoverageTruth(options?.layout || {});
  seedCanonicalLeadAssignments(assignmentsByEntity, plannerCoverage, deskToDepartment);
  seedCanonicalLeadAssignments(assignmentsByEntity, qaLeadCoverage, deskToDepartment);
  const staffingModel = evaluateStaffingModel(model, assignmentsByEntity);
  const departmentLabels = buildDepartmentLabels(model);
  const deskCoverage = (staffingModel.desks || []).map((entity) => {
    const departmentId = deskToDepartment.get(entity.entityId) || null;
    const departmentLabel = departmentId ? (departmentLabels[departmentId] || departmentId) : null;
    const openRoles = buildCanonicalDeskOpenRoles(entity, { departmentId, departmentLabel });
    const blockers = openRoles.filter((entry) => entry.blocker);
    const urgency = deriveCoverageUrgency(openRoles);
    return {
      ...entity,
      departmentId,
      departmentLabel,
      openRoles,
      blockers,
      urgency,
      statusLabel: openRoles.length
        ? (blockers.some((entry) => entry.kind === 'missing lead') ? 'missing lead' : (blockers.length ? 'understaffed' : 'optional hire'))
        : 'covered',
    };
  });
  const departmentCoverage = buildDepartmentCoverageEntries(staffingModel, deskCoverage, model, options);
  const coverage = [...departmentCoverage, ...deskCoverage];
  const canonicalSeats = deskCoverage.flatMap((entity) => entity.openRoles);
  const openRoles = canonicalSeats;
  const blockers = openRoles.filter((entry) => entry.blocker);
  const urgency = deriveCoverageUrgency(openRoles);

  return {
    staffingModel,
    coverage,
    canonicalSeats,
    openRoles,
    blockers,
    urgency,
    plannerCoverage,
    qaLeadCoverage,
    summary: {
      openRoleCount: openRoles.length,
      blockerCount: blockers.length,
      missingLeadCount: openRoles.filter((entry) => entry.kind === 'missing lead').length,
      understaffedCount: openRoles.filter((entry) => entry.kind === 'understaffed').length,
      optionalHireCount: openRoles.filter((entry) => entry.kind === 'optional hire').length,
      plannerCoverageBlockedCount: openRoles.some((entry) => entry.entityId === 'planner' && entry.blocker)
        ? plannerCoverage.failedPredicates.length
        : 0,
      qaLeadCoverageBlockedCount: openRoles.some((entry) => entry.entityId === 'qa-lead' && entry.blocker)
        ? qaLeadCoverage.failedPredicates.length
        : 0,
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
