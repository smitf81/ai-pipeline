import { getDepartmentById, getRoleById } from './roleTaxonomy.mjs';

const MODULE_OWNERSHIP_VOCABULARY = Object.freeze(['layout', 'org', 'ta', 'qa', 'simulation', 'ui', 'core']);

const STUDIO_TO_TAXONOMY_DEPARTMENT_IDS = Object.freeze({
  'dept-intake': 'intake',
  'dept-delivery': 'delivery',
  'dept-quality': 'quality',
  'dept-archive': 'archive',
  'dept-control': 'control',
  'dept-talent-acquisition': 'talent-acquisition',
});

const ASSIGNMENT_DEFINITIONS = Object.freeze([
  Object.freeze({
    agentId: 'context-manager',
    roleId: 'context-manager',
    departmentId: 'dept-intake',
    deskId: 'context-manager',
    ownedModules: ['org', 'layout'],
    activeTasks: ['triage-intent', 'route-context'],
    notes: 'Intake lead assignment for routing incoming context.',
  }),
  Object.freeze({
    agentId: 'planner',
    roleId: 'planner',
    departmentId: 'dept-delivery',
    deskId: 'planner',
    ownedModules: ['layout', 'org'],
    activeTasks: ['plan-breakdown', 'dependency-sequencing'],
    notes: 'Delivery planning assignment for structure and sequencing.',
  }),
  Object.freeze({
    agentId: 'executor',
    roleId: 'executor',
    departmentId: 'dept-delivery',
    deskId: 'executor',
    ownedModules: ['ui'],
    activeTasks: ['apply-package', 'execution-followthrough'],
    notes: 'Delivery execution assignment for applied build work.',
  }),
  Object.freeze({
    agentId: 'memory-archivist',
    roleId: 'memory-archivist',
    departmentId: 'dept-archive',
    deskId: 'memory-archivist',
    ownedModules: ['org', 'layout'],
    activeTasks: ['archive-context', 'decision-log'],
    notes: 'Archive lead assignment for canonical memory and decisions.',
  }),
  Object.freeze({
    agentId: 'qa-lead',
    roleId: 'qa-lead',
    departmentId: 'dept-quality',
    deskId: 'qa-lead',
    ownedModules: ['qa', 'ui'],
    activeTasks: ['run-structured-qa', 'browser-pass'],
    notes: 'Quality lead assignment for validation and evidence review.',
  }),
  Object.freeze({
    agentId: 'cto-architect',
    roleId: 'cto-architect',
    departmentId: 'dept-control',
    deskId: 'cto-architect',
    ownedModules: ['core', 'layout', 'org'],
    activeTasks: ['guardrails', 'risk-review'],
    notes: 'Control lead assignment for ownership and risk boundaries.',
  }),
  Object.freeze({
    agentId: 'integration_auditor',
    roleId: 'integration_auditor',
    departmentId: 'dept-talent-acquisition',
    deskId: 'integration_auditor',
    ownedModules: ['ta', 'org'],
    activeTasks: ['coverage-review', 'hiring-demand'],
    notes: 'Talent acquisition lead assignment for coverage and role readiness.',
  }),
]);

function normalizeText(value = '') {
  return String(value || '').trim();
}

function normalizeId(value = '') {
  return normalizeText(value).toLowerCase();
}

function normalizeModuleList(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((entry) => normalizeId(entry))
    .filter((entry) => MODULE_OWNERSHIP_VOCABULARY.includes(entry)))];
}

function buildContextScope(definition = {}, leadAgentId = null) {
  const ownedModules = normalizeModuleList(definition.ownedModules);
  const activeTasks = (Array.isArray(definition.activeTasks) ? definition.activeTasks : [])
    .map((entry) => normalizeText(entry))
    .filter(Boolean);
  return Object.freeze({
    scopeId: `${normalizeId(definition.departmentId)}:${normalizeId(definition.deskId) || 'department'}`,
    domain: ownedModules[0] || 'core',
    domains: [...ownedModules],
    departmentId: normalizeText(definition.departmentId),
    deskId: normalizeText(definition.deskId),
    leadAgentId: normalizeText(leadAgentId || definition.agentId || ''),
    visibility: definition.deskId ? 'desk' : 'department',
    taskRefs: [...activeTasks],
  });
}

function buildAssignmentRecord(definition = {}) {
  const agentId = normalizeText(definition.agentId);
  const roleId = normalizeText(definition.roleId || agentId);
  const departmentId = normalizeText(definition.departmentId);
  const taxonomyDepartmentId = STUDIO_TO_TAXONOMY_DEPARTMENT_IDS[departmentId] || '';
  const department = taxonomyDepartmentId ? getDepartmentById(taxonomyDepartmentId) : null;
  const role = getRoleById(roleId);
  const leadAgentId = normalizeText(role?.leadOfDepartmentIds?.includes(taxonomyDepartmentId) ? agentId : (department?.leadRoleId || roleId));
  const reportsTo = role?.leadOfDepartmentIds?.includes(taxonomyDepartmentId)
    ? null
    : leadAgentId;
  const ownedModules = normalizeModuleList(definition.ownedModules);
  return Object.freeze({
    id: `assignment-${agentId}`,
    agentId,
    roleId,
    departmentId,
    taxonomyDepartmentId,
    deskId: normalizeText(definition.deskId),
    ownedModules: [...ownedModules],
    activeTasks: (Array.isArray(definition.activeTasks) ? definition.activeTasks : [])
      .map((entry) => normalizeText(entry))
      .filter(Boolean),
    leadAgentId: leadAgentId || null,
    reportsTo: reportsTo || null,
    contextScope: buildContextScope({
      ...definition,
      departmentId,
      ownedModules,
    }, leadAgentId || null),
    notes: normalizeText(definition.notes),
  });
}

function validateAssignmentRecord(record = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('Assignment records must be objects.');
  }
  if (!normalizeText(record.id)) {
    throw new Error('Assignment records must include an id.');
  }
  if (!normalizeText(record.agentId)) {
    throw new Error(`Assignment record ${record.id} must include an agentId.`);
  }
  if (!normalizeText(record.roleId)) {
    throw new Error(`Assignment record ${record.id} must include a roleId.`);
  }
  if (!normalizeText(record.departmentId)) {
    throw new Error(`Assignment record ${record.id} must include a departmentId.`);
  }
  if (!normalizeText(record.deskId)) {
    throw new Error(`Assignment record ${record.id} must include a deskId.`);
  }
  const ownedModules = normalizeModuleList(record.ownedModules);
  if (ownedModules.length !== (Array.isArray(record.ownedModules) ? record.ownedModules.length : 0)) {
    throw new Error(`Assignment record ${record.id} contains invalid module identifiers.`);
  }
  if (!record.contextScope || typeof record.contextScope !== 'object' || Array.isArray(record.contextScope)) {
    throw new Error(`Assignment record ${record.id} must include a contextScope object.`);
  }
  return true;
}

export const AGENT_MODULE_VOCABULARY = MODULE_OWNERSHIP_VOCABULARY;

export const AGENT_ASSIGNMENT_REGISTRY = Object.freeze(
  ASSIGNMENT_DEFINITIONS.map((definition) => buildAssignmentRecord(definition)),
);

function validateAssignmentRegistry(registry = AGENT_ASSIGNMENT_REGISTRY) {
  const seenIds = new Set();
  for (const entry of registry) {
    validateAssignmentRecord(entry);
    if (seenIds.has(entry.id)) {
      throw new Error(`Duplicate assignment id: ${entry.id}`);
    }
    seenIds.add(entry.id);
  }
  return true;
}

validateAssignmentRegistry(AGENT_ASSIGNMENT_REGISTRY);

export function getAgentAssignments(agentId) {
  const targetId = normalizeText(agentId);
  if (!targetId) return [];
  return AGENT_ASSIGNMENT_REGISTRY.filter((entry) => entry.agentId === targetId);
}

export function listAgentsByModule(moduleId) {
  const targetModule = normalizeId(moduleId);
  if (!targetModule || !MODULE_OWNERSHIP_VOCABULARY.includes(targetModule)) return [];
  return AGENT_ASSIGNMENT_REGISTRY
    .filter((entry) => entry.ownedModules.includes(targetModule))
    .map((entry) => entry.agentId);
}

export function listModulesOwnedByAgent(agentId) {
  const assignments = getAgentAssignments(agentId);
  return [...new Set(assignments.flatMap((entry) => entry.ownedModules))];
}

export function listUnownedModules() {
  const ownedModules = new Set(AGENT_ASSIGNMENT_REGISTRY.flatMap((entry) => entry.ownedModules));
  return MODULE_OWNERSHIP_VOCABULARY.filter((moduleId) => !ownedModules.has(moduleId));
}

export function getLeadForDepartment(departmentId) {
  const normalizedDepartmentId = normalizeText(departmentId);
  if (!normalizedDepartmentId) return null;
  const taxonomyDepartmentId = STUDIO_TO_TAXONOMY_DEPARTMENT_IDS[normalizedDepartmentId];
  if (!taxonomyDepartmentId) return null;
  const department = getDepartmentById(taxonomyDepartmentId);
  if (!department?.leadRoleId) return null;
  return AGENT_ASSIGNMENT_REGISTRY.find((entry) => entry.roleId === department.leadRoleId && entry.departmentId === normalizedDepartmentId) || null;
}

export function validateAgentOwnershipModel(registry = AGENT_ASSIGNMENT_REGISTRY) {
  return validateAssignmentRegistry(registry);
}
