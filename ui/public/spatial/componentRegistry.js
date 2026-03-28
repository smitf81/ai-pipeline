const COMPONENT_STATUSES = Object.freeze(['active', 'experimental', 'deprecated']);

const COMPONENT_REGISTRY = Object.freeze([
  Object.freeze({
    id: 'studio_layout_schema',
    name: 'Studio Layout Schema',
    type: 'ui_model',
    status: 'active',
    domain: 'layout',
    inputs: ['department templates', 'desk templates', 'room bounds'],
    outputs: ['canonical layout schema', 'layout defaults'],
    consumers: ['studio_layout_model', 'studio_mutations'],
    notes: 'Defines the canonical room, department, and desk layout shape.',
  }),
  Object.freeze({
    id: 'studio_layout_model',
    name: 'Studio Layout Model',
    type: 'ui_model',
    status: 'active',
    domain: 'layout',
    inputs: ['studio_layout_schema', 'staffing_rules'],
    outputs: ['normalized layout', 'render model', 'desk map'],
    consumers: ['spatialApp', 'studio_mutations', 'roster_surface'],
    notes: 'Builds the derived studio render model from canonical layout data.',
  }),
  Object.freeze({
    id: 'studio_mutations',
    name: 'Studio Mutations',
    type: 'planner_helper',
    status: 'active',
    domain: 'layout',
    inputs: ['studio_layout_model', 'studio_templates', 'dependency_validator'],
    outputs: ['addDepartmentFromTemplate', 'addDeskToDepartment', 'moveDeskToDepartment'],
    consumers: ['uiActionRegistry', 'spatialApp'],
    notes: 'Pure mutation helper layer for controlled structure growth.',
  }),
  Object.freeze({
    id: 'staffing_rules',
    name: 'Staffing Rules',
    type: 'validator',
    status: 'active',
    domain: 'org',
    inputs: ['role_taxonomy', 'studio_layout_schema'],
    outputs: ['staffing rules', 'coverage summaries'],
    consumers: ['studio_layout_model', 'roster_surface', 'dependency_validator'],
    notes: 'Encodes staffing constraints and coverage expectations.',
  }),
  Object.freeze({
    id: 'role_taxonomy',
    name: 'Role Taxonomy',
    type: 'core_system',
    status: 'active',
    domain: 'org',
    inputs: [],
    outputs: ['role taxonomy', 'lead role ids'],
    consumers: ['staffing_rules', 'roster_surface', 'action_request_parser'],
    notes: 'Canonical role vocabulary for departments, desks, and staffing.',
  }),
  Object.freeze({
    id: 'ta_hiring_demand',
    name: 'TA Hiring Demand',
    type: 'talent_helper',
    status: 'active',
    domain: 'ta',
    inputs: ['staffing_rules', 'role_taxonomy'],
    outputs: ['ta gap model', 'open roles', 'hiring demand summaries'],
    consumers: ['roster_surface', 'studio_layout_model'],
    notes: 'Derived talent-acquisition demand and seat coverage view.',
  }),
  Object.freeze({
    id: 'dependency_validator',
    name: 'Dependency Validator',
    type: 'validator',
    status: 'active',
    domain: 'layout',
    inputs: ['studio_templates', 'studio_layout_schema'],
    outputs: ['validation status', 'blockers', 'warnings'],
    consumers: ['studio_mutations', 'uiActionRegistry'],
    notes: 'Dependency checks for add/update mutations; read-only contract only.',
  }),
  Object.freeze({
    id: 'action_request_parser',
    name: 'Action Request Parser',
    type: 'planner_helper',
    status: 'active',
    domain: 'core',
    inputs: ['freeform action text', 'studio templates'],
    outputs: ['structured action requests', 'mutations'],
    consumers: ['aceConnector', 'mutationEngine'],
    notes: 'Parses user action text into structured action requests.',
  }),
  Object.freeze({
    id: 'agent_context',
    name: 'Agent Context',
    type: 'core_system',
    status: 'experimental',
    domain: 'core',
    inputs: ['intent state', 'workspace context', 'trace log'],
    outputs: ['context report', 'routing context', 'active context summary'],
    consumers: ['action_request_parser', 'spatialApp', 'aceConnector'],
    notes: 'Experimental context bundle around intent routing and desk awareness.',
  }),
  Object.freeze({
    id: 'agent_assignment_model',
    name: 'Agent Assignment Model',
    type: 'core_system',
    status: 'experimental',
    domain: 'org',
    inputs: ['role taxonomy', 'studio layout', 'module ownership vocabulary'],
    outputs: ['agent assignments', 'module ownership truth', 'context scope'],
    consumers: ['spatialApp', 'rosterSurface'],
    notes: 'Canonical schema for agent ownership and scoped module delegation.',
  }),
  Object.freeze({
    id: 'roster_surface',
    name: 'Roster Surface',
    type: 'ui_model',
    status: 'active',
    domain: 'ta',
    inputs: ['ta department payload', 'staffing rules', 'role taxonomy'],
    outputs: ['roster surface model', 'coverage rows', 'open role rows'],
    consumers: ['spatialApp'],
    notes: 'Canonical People Plan surface for staffing and roster visibility.',
  }),
]);

function normalizeText(value = '') {
  return String(value || '').trim();
}

function normalizeStatus(value = '') {
  return normalizeText(value).toLowerCase();
}

function validateRegistryEntry(entry = {}) {
  const status = normalizeStatus(entry.status);
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error('Component registry entries must be objects.');
  }
  if (!normalizeText(entry.id)) {
    throw new Error('Component registry entries must include an id.');
  }
  if (!normalizeText(entry.name)) {
    throw new Error(`Component registry entry ${entry.id} must include a name.`);
  }
  if (!COMPONENT_STATUSES.includes(status)) {
    throw new Error(`Component registry entry ${entry.id} has invalid status: ${entry.status}`);
  }
  return true;
}

function validateRegistryUniqueness(entries = COMPONENT_REGISTRY) {
  const ids = new Set();
  for (const entry of entries) {
    validateRegistryEntry(entry);
    if (ids.has(entry.id)) {
      throw new Error(`Duplicate component registry id: ${entry.id}`);
    }
    ids.add(entry.id);
  }
  return true;
}

validateRegistryUniqueness(COMPONENT_REGISTRY);

export { COMPONENT_STATUSES, COMPONENT_REGISTRY };

export function getComponentById(id) {
  const targetId = normalizeText(id);
  if (!targetId) return null;
  return COMPONENT_REGISTRY.find((entry) => entry.id === targetId) || null;
}

export function listComponentsByStatus(status) {
  const targetStatus = normalizeStatus(status);
  if (!targetStatus) return [];
  return COMPONENT_REGISTRY.filter((entry) => normalizeStatus(entry.status) === targetStatus);
}

export function listComponentsByDomain(domain) {
  const targetDomain = normalizeText(domain).toLowerCase();
  if (!targetDomain) return [];
  return COMPONENT_REGISTRY.filter((entry) => normalizeText(entry.domain).toLowerCase() === targetDomain);
}

export function listActiveComponents() {
  return listComponentsByStatus('active');
}

export function validateComponentRegistry(entries = COMPONENT_REGISTRY) {
  return validateRegistryUniqueness(entries);
}
