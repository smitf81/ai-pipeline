const STUDIO_WORLD_SIZE = { width: 1200, height: 800 };
const STUDIO_ROOM_BOUNDS = { x: 56, y: 72, width: 1088, height: 664 };
const STUDIO_DESK_SIZE = { width: 172, height: 140 };
const STUDIO_TEAM_BOARD_FRAME = { x: 284, y: 88, width: 584, height: 208 };
const CONTROL_CENTRE_DESK_ID = 'cto-architect';

const CORE_DESK_AGENT_DEFAULTS = {
  'context-manager': ['context-manager'],
  planner: ['planner'],
  executor: ['executor'],
  'memory-archivist': ['memory-archivist', 'dave'],
  'rnd-lead': ['rnd-lead'],
  'cto-architect': ['cto-architect'],
  'qa-lead': ['qa-lead'],
};

const DEPARTMENT_ROOM_SLOTS = [
  { id: 'intake-bay', x: 92, y: 108, width: 220, height: 238 },
  { id: 'delivery-bay', x: 334, y: 86, width: 514, height: 470 },
  { id: 'quality-bay', x: 92, y: 394, width: 220, height: 232 },
  { id: 'archive-bay', x: 454, y: 580, width: 312, height: 120 },
  { id: 'control-bay', x: 884, y: 286, width: 214, height: 254 },
  { id: 'talent-bay', x: 850, y: 86, width: 250, height: 176 },
  { id: 'expansion-a', x: 850, y: 86, width: 250, height: 176 },
  { id: 'expansion-b', x: 808, y: 564, width: 292, height: 136 },
];

const DEPARTMENT_TEMPLATE_DEFS = {
  control: {
    id: 'control',
    label: 'Control Centre',
    kind: 'control',
    summary: 'Canonical oversight room for department relationships and environment controls.',
    editable: true,
    allowedDeskTemplateIds: ['control-node', 'report-node', 'review-node'],
  },
  intake: {
    id: 'intake',
    label: 'Intake',
    kind: 'intake',
    summary: 'Frontline intake and interpretation room for incoming work.',
    editable: false,
    allowedDeskTemplateIds: ['intake-node', 'support-node', 'report-node'],
  },
  delivery: {
    id: 'delivery',
    label: 'Delivery',
    kind: 'delivery',
    summary: 'Planning and execution room for active build throughput.',
    editable: true,
    allowedDeskTemplateIds: ['delivery-node', 'builder-node', 'report-node', 'review-node'],
  },
  quality: {
    id: 'quality',
    label: 'Quality',
    kind: 'quality',
    summary: 'Assessment room for QA reports, scorecards, and readiness evidence.',
    editable: true,
    allowedDeskTemplateIds: ['qa-node', 'review-node', 'report-node'],
  },
  archive: {
    id: 'archive',
    label: 'Archive',
    kind: 'archive',
    summary: 'Context preservation room owned by the Memory Archivist.',
    editable: true,
    allowedDeskTemplateIds: ['archive-node', 'report-node', 'support-node'],
  },
  talent: {
    id: 'talent',
    label: 'Talent Acquisition',
    kind: 'talent',
    summary: 'Hiring-demand room for seat coverage, role fit, and open-role planning.',
    editable: false,
    allowedDeskTemplateIds: ['talent-node', 'report-node'],
  },
  research: {
    id: 'research',
    label: 'R&D / Research & Development',
    kind: 'research',
    summary: 'Sandbox room for non-delivery research, prototypes, and experiments.',
    editable: true,
    allowedDeskTemplateIds: ['rnd-lead'],
  },
  support: {
    id: 'support',
    label: 'Support Cell',
    kind: 'support',
    summary: 'Expansion room for supporting ops, reporting, and coordination.',
    editable: true,
    allowedDeskTemplateIds: ['support-node', 'report-node', 'review-node'],
  },
  integration: {
    id: 'integration',
    label: 'Integration Cell',
    kind: 'integration',
    summary: 'Expansion room for integration handoffs and applied build follow-through.',
    editable: true,
    allowedDeskTemplateIds: ['builder-node', 'review-node', 'report-node'],
  },
};

const DEPARTMENT_TEMPLATE_ORDER = ['research', 'support', 'integration', 'quality', 'archive', 'talent'];

const DESK_TEMPLATE_DEFS = {
  'control-node': {
    id: 'control-node',
    label: 'Control Node',
    type: 'control',
    capabilities: ['oversight', 'guardrails', 'assignment'],
    editable: true,
    allowedDepartmentKinds: ['control'],
    summary: 'Cross-department control desk for approvals and constraints.',
  },
  'intake-node': {
    id: 'intake-node',
    label: 'Intake Desk',
    type: 'intake',
    capabilities: ['context', 'triage', 'routing'],
    editable: false,
    allowedDepartmentKinds: ['intake', 'research'],
    summary: 'Desk for intake interpretation and problem framing.',
  },
  'delivery-node': {
    id: 'delivery-node',
    label: 'Delivery Desk',
    type: 'delivery',
    capabilities: ['planning', 'queue', 'throughput'],
    editable: true,
    allowedDepartmentKinds: ['delivery', 'integration'],
    summary: 'Desk for planning active delivery work and queue health.',
  },
  'builder-node': {
    id: 'builder-node',
    label: 'Builder Desk',
    type: 'builder',
    capabilities: ['execution', 'integration', 'output'],
    editable: true,
    allowedDepartmentKinds: ['delivery', 'integration', 'support'],
    summary: 'Desk for active implementation and integration throughput.',
  },
  'archive-node': {
    id: 'archive-node',
    label: 'Archive Desk',
    type: 'archive',
    capabilities: ['context', 'history', 'traceability'],
    editable: true,
    allowedDepartmentKinds: ['archive', 'research'],
    summary: 'Desk for preserving canonical context and history.',
  },
  'qa-node': {
    id: 'qa-node',
    label: 'QA Desk',
    type: 'quality',
    capabilities: ['testing', 'scorecards', 'verification'],
    editable: true,
    allowedDepartmentKinds: ['quality', 'support'],
    summary: 'Desk for QA tracking and structured assessment.',
  },
  'talent-node': {
    id: 'talent-node',
    label: 'Talent Desk',
    type: 'talent',
    capabilities: ['coverage', 'hiring-demand', 'role-readiness'],
    editable: false,
    allowedDepartmentKinds: ['talent'],
    summary: 'Desk for seat planning and role coverage checks.',
  },
  'analysis-node': {
    id: 'analysis-node',
    label: 'Analysis Desk',
    type: 'analysis',
    capabilities: ['research', 'reports', 'discovery'],
    editable: true,
    allowedDepartmentKinds: ['research', 'support'],
    summary: 'Desk for discovery and analytical reporting.',
  },
  'review-node': {
    id: 'review-node',
    label: 'Review Desk',
    type: 'review',
    capabilities: ['review', 'approvals', 'evidence'],
    editable: true,
    allowedDepartmentKinds: ['control', 'delivery', 'quality', 'support', 'integration'],
    summary: 'Desk for review evidence, approvals, and scorecard interpretation.',
  },
  'report-node': {
    id: 'report-node',
    label: 'Report Desk',
    type: 'reporting',
    capabilities: ['reports', 'telemetry', 'handoffs'],
    editable: true,
    allowedDepartmentKinds: ['control', 'quality', 'archive', 'research', 'support', 'integration', 'delivery'],
    summary: 'Desk for operational reporting and desk-level telemetry.',
  },
  'support-node': {
    id: 'support-node',
    label: 'Support Desk',
    type: 'support',
    capabilities: ['ops', 'coordination', 'handoffs'],
    editable: true,
    allowedDepartmentKinds: ['support', 'research', 'archive', 'quality', 'delivery'],
    summary: 'Desk for local support and coordination work.',
  },
};

const CORE_DEPARTMENTS = [
  {
    id: 'dept-intake',
    templateId: 'intake',
    label: 'Intake',
    slotId: 'intake-bay',
    deskIds: ['context-manager'],
    staffing: {
      requiredLeadSeatId: 'context-manager',
      minimumActiveSeats: 1,
      baselineRoleIds: ['context-manager'],
    },
  },
  {
    id: 'dept-delivery',
    templateId: 'delivery',
    label: 'Delivery',
    slotId: 'delivery-bay',
    deskIds: ['planner', 'executor'],
    staffing: {
      requiredLeadSeatId: 'planner',
      minimumActiveSeats: 2,
      baselineRoleIds: ['planner', 'executor'],
    },
  },
  {
    id: 'dept-quality',
    templateId: 'quality',
    label: 'Quality',
    slotId: 'quality-bay',
    deskIds: ['qa-lead'],
    staffing: {
      requiredLeadSeatId: 'qa-lead',
      minimumActiveSeats: 1,
      baselineRoleIds: ['qa-lead'],
    },
  },
  {
    id: 'dept-archive',
    templateId: 'archive',
    label: 'Archive',
    slotId: 'archive-bay',
    deskIds: ['memory-archivist'],
    staffing: {
      requiredLeadSeatId: 'memory-archivist',
      minimumActiveSeats: 1,
      baselineRoleIds: ['memory-archivist'],
    },
  },
  {
    id: 'dept-research',
    templateId: 'research',
    label: 'R&D / Research & Development',
    slotId: 'expansion-b',
    summary: 'Sandbox department for non-delivery research, experiments, and prototypes.',
    deskIds: ['rnd-lead'],
    staffing: {
      requiredLeadSeatId: 'rnd-lead',
      minimumActiveSeats: 1,
      baselineRoleIds: ['rnd-lead'],
    },
  },
  {
    id: 'dept-control',
    templateId: 'control',
    label: 'Control Centre',
    slotId: 'control-bay',
    deskIds: ['cto-architect'],
    staffing: {
      requiredLeadSeatId: 'cto-architect',
      minimumActiveSeats: 1,
      baselineRoleIds: ['cto-architect'],
    },
  },
  {
    id: 'dept-talent-acquisition',
    templateId: 'talent',
    label: 'Talent Acquisition',
    slotId: 'talent-bay',
    deskIds: ['integration_auditor'],
    staffing: {
      requiredLeadSeatId: 'integration_auditor',
      minimumActiveSeats: 1,
      baselineRoleIds: ['integration_auditor'],
    },
  },
];

const CORE_DESKS = {
  'context-manager': {
    id: 'context-manager',
    label: 'Context Manager',
    templateId: 'intake-node',
    departmentId: 'dept-intake',
    position: { x: 182, y: 252 },
    assignedAgentIds: ['context-manager'],
    editable: false,
    staffing: {
      seatKind: 'lead',
    },
  },
  planner: {
    id: 'planner',
    label: 'Planner',
    templateId: 'delivery-node',
    departmentId: 'dept-delivery',
    position: { x: 536, y: 252 },
    assignedAgentIds: ['planner'],
    editable: false,
    staffing: {
      seatKind: 'lead',
    },
  },
  executor: {
    id: 'executor',
    label: 'Executor',
    templateId: 'builder-node',
    departmentId: 'dept-delivery',
    position: { x: 682, y: 252 },
    assignedAgentIds: ['executor'],
    editable: false,
    staffing: {
      seatKind: 'core',
    },
  },
  'qa-lead': {
    id: 'qa-lead',
    label: 'QA Lead',
    templateId: 'qa-node',
    departmentId: 'dept-quality',
    position: { x: 182, y: 510 },
    assignedAgentIds: ['qa-lead'],
    editable: false,
    staffing: {
      seatKind: 'lead',
    },
  },
  'memory-archivist': {
    id: 'memory-archivist',
    label: 'Memory Archivist',
    templateId: 'archive-node',
    departmentId: 'dept-archive',
    position: { x: 620, y: 640 },
    assignedAgentIds: ['memory-archivist', 'dave'],
    editable: false,
    staffing: {
      seatKind: 'lead',
    },
  },
  'rnd-lead': {
    id: 'rnd-lead',
    label: 'R&D Lead',
    templateId: 'rnd-lead',
    departmentId: 'dept-research',
    position: { x: 954, y: 640 },
    assignedAgentIds: ['rnd-lead'],
    editable: false,
    summary: 'Sandbox desk for non-delivery research and prototype work.',
    staffing: {
      seatKind: 'lead',
    },
  },
  'cto-architect': {
    id: 'cto-architect',
    label: 'CTO / Architect',
    templateId: 'control-node',
    departmentId: 'dept-control',
    position: { x: 990, y: 422 },
    assignedAgentIds: ['cto-architect'],
    editable: true,
    staffing: {
      seatKind: 'lead',
    },
  },
  integration_auditor: {
    id: 'integration_auditor',
    label: 'Integration Auditor',
    templateId: 'talent-node',
    departmentId: 'dept-talent-acquisition',
    position: { x: 986, y: 174 },
    assignedAgentIds: ['integration_auditor'],
    editable: false,
    staffing: {
      seatKind: 'lead',
    },
  },
};

const DEPARTMENT_RELATIONSHIP_TYPES = Object.freeze({
  parent: 'parent',
  peer: 'peer',
  support: 'support',
  dependency: 'dependency',
});

const DEPARTMENT_RELATIONSHIP_PRESETS = Object.freeze({
  control: {
    parentDepartmentId: null,
    supportKinds: ['intake', 'delivery', 'quality', 'archive', 'research', 'support', 'integration'],
    dependencyKinds: [],
  },
  intake: {
    parentDepartmentId: 'dept-control',
    supportKinds: ['delivery', 'quality', 'archive', 'research', 'support', 'integration'],
    dependencyKinds: ['control'],
  },
  delivery: {
    parentDepartmentId: 'dept-control',
    supportKinds: ['quality', 'integration'],
    dependencyKinds: ['control', 'intake'],
  },
  quality: {
    parentDepartmentId: 'dept-control',
    supportKinds: ['archive', 'control'],
    dependencyKinds: ['control', 'intake', 'delivery'],
  },
  archive: {
    parentDepartmentId: 'dept-control',
    supportKinds: ['support', 'research'],
    dependencyKinds: ['control', 'intake', 'quality'],
  },
  talent: {
    parentDepartmentId: 'dept-control',
    supportKinds: ['delivery', 'quality', 'archive', 'research', 'support', 'integration'],
    dependencyKinds: ['control', 'delivery', 'quality'],
  },
  research: {
    parentDepartmentId: 'dept-control',
    supportKinds: ['delivery', 'support', 'integration'],
    dependencyKinds: ['control', 'intake'],
  },
  support: {
    parentDepartmentId: 'dept-control',
    supportKinds: ['delivery', 'quality', 'integration'],
    dependencyKinds: ['control', 'intake'],
  },
  integration: {
    parentDepartmentId: 'dept-control',
    supportKinds: ['delivery', 'quality'],
    dependencyKinds: ['control', 'intake'],
  },
});

function cloneJson(value, fallback) {
  if (value === undefined) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function slugify(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((entry) => String(entry || '').trim()).filter(Boolean))];
}

function getDepartmentTemplate(templateId = '') {
  return DEPARTMENT_TEMPLATE_DEFS[String(templateId || '').trim()] || null;
}

function getDeskTemplate(templateId = '') {
  return DESK_TEMPLATE_DEFS[String(templateId || '').trim()] || null;
}

function buildDefaultDepartmentStaffingRecord(definition = {}) {
  const deskIds = uniqueStrings(definition.deskIds);
  const staffing = definition.staffing || {};
  const requiredLeadSeatId = String(
    staffing.requiredLeadSeatId
    || definition.requiredLeadSeatId
    || definition.leadDeskId
    || deskIds[0]
    || '',
  ).trim() || null;
  const minimumActiveSeats = Math.max(1, Number(
    staffing.minimumActiveSeats
    || definition.minimumActiveSeats
    || deskIds.length
    || 1,
  ));
  const baselineRoleIds = uniqueStrings(staffing.baselineRoleIds || definition.baselineRoleIds || deskIds);
  const placeholderSeatIds = uniqueStrings(
    staffing.openSeatPlaceholderIds
    || definition.openSeatPlaceholderIds
    || baselineRoleIds,
  );
  return {
    requiredLeadSeatId,
    minimumActiveSeats,
    baselineRoleIds,
    openSeatPlaceholders: placeholderSeatIds.map((roleId) => ({
      roleId,
      deskId: roleId,
      label: roleId.replace(/[-_]/g, ' '),
      seatKind: roleId === requiredLeadSeatId ? 'lead' : 'core',
      open: true,
    })),
  };
}

function getRoomSlot(slotId = '') {
  return DEPARTMENT_ROOM_SLOTS.find((entry) => entry.id === slotId) || null;
}

function normalizeRoomBounds(bounds = {}, fallback = STUDIO_ROOM_BOUNDS) {
  const source = bounds && typeof bounds === 'object' ? bounds : {};
  return {
    x: clamp(Number(source.x), STUDIO_ROOM_BOUNDS.x, STUDIO_ROOM_BOUNDS.x + STUDIO_ROOM_BOUNDS.width),
    y: clamp(Number(source.y), STUDIO_ROOM_BOUNDS.y, STUDIO_ROOM_BOUNDS.y + STUDIO_ROOM_BOUNDS.height),
    width: clamp(Number(source.width), 180, STUDIO_ROOM_BOUNDS.width),
    height: clamp(Number(source.height), 110, STUDIO_ROOM_BOUNDS.height),
    slotId: String(source.slotId || fallback.slotId || '').trim() || null,
  };
}

function buildDepartmentDeskSlots(bounds = {}) {
  const left = bounds.x + 90;
  const right = bounds.x + bounds.width - 90;
  const center = bounds.x + (bounds.width / 2);
  const top = bounds.y + 96;
  const mid = bounds.y + Math.max(96, Math.min(bounds.height - 72, 170));
  const bottom = bounds.y + Math.max(96, bounds.height - 70);
  return [
    { x: center, y: Math.min(bottom, top) },
    { x: left, y: Math.min(bottom, mid) },
    { x: right, y: Math.min(bottom, mid) },
    { x: center, y: bottom },
  ].map((entry) => ({
    x: clamp(entry.x, bounds.x + 46, bounds.x + bounds.width - 46),
    y: clamp(entry.y, bounds.y + 62, bounds.y + bounds.height - 34),
  }));
}

function normalizeDeskPosition(position = {}, bounds = STUDIO_ROOM_BOUNDS, fallback = null) {
  const base = fallback || buildDepartmentDeskSlots(bounds)[0];
  return {
    x: clamp(Number(position.x) || base.x, bounds.x + 46, bounds.x + bounds.width - 46),
    y: clamp(Number(position.y) || base.y, bounds.y + 62, bounds.y + bounds.height - 34),
  };
}

function buildDefaultDepartmentRecord(definition = {}) {
  const template = getDepartmentTemplate(definition.templateId) || getDepartmentTemplate('support');
  const slot = getRoomSlot(definition.slotId) || DEPARTMENT_ROOM_SLOTS[0];
  const bounds = normalizeRoomBounds({ ...slot, slotId: slot.id }, slot);
  return {
    id: definition.id,
    label: definition.label || template.label,
    templateId: template.id,
    kind: template.kind,
    summary: template.summary,
    editable: template.editable,
    visible: true,
    slotId: slot.id,
    bounds,
    deskIds: uniqueStrings(definition.deskIds),
    controlCentreDeskId: CONTROL_CENTRE_DESK_ID,
    staffing: buildDefaultDepartmentStaffingRecord(definition),
  };
}

function buildDefaultDeskRecord(definition = {}) {
  const template = getDeskTemplate(definition.templateId) || getDeskTemplate('support-node');
  return {
    id: definition.id,
    label: definition.label || template.label,
    templateId: template.id,
    type: template.type,
    capabilities: [...template.capabilities],
    editable: definition.editable !== undefined ? Boolean(definition.editable) : Boolean(template.editable),
    departmentId: definition.departmentId || 'dept-support',
    position: { ...(definition.position || {}) },
    assignedAgentIds: uniqueStrings(definition.assignedAgentIds),
    reportsToDeskId: definition.reportsToDeskId || CONTROL_CENTRE_DESK_ID,
    staffing: {
      roleId: String(definition.id || '').trim(),
      seatKind: String(definition.staffing?.seatKind || 'core').trim() || 'core',
      placeholder: definition.staffing?.placeholder !== undefined ? Boolean(definition.staffing.placeholder) : true,
    },
  };
}

function createDefaultStudioLayoutSchema() {
  const departments = CORE_DEPARTMENTS.map((definition) => buildDefaultDepartmentRecord(definition));
  const departmentMap = Object.fromEntries(departments.map((department) => [department.id, department]));
  const desks = {};
  Object.values(CORE_DESKS).forEach((definition) => {
    const department = departmentMap[definition.departmentId] || departments[0];
    desks[definition.id] = {
      ...buildDefaultDeskRecord(definition),
      position: normalizeDeskPosition(definition.position, department.bounds),
    };
  });
  return {
    version: 'studio-layout.v1',
    size: { ...STUDIO_WORLD_SIZE },
    bounds: { ...STUDIO_ROOM_BOUNDS },
    whiteboards: {
      teamBoard: { ...STUDIO_TEAM_BOARD_FRAME },
    },
    controlCentreDeskId: CONTROL_CENTRE_DESK_ID,
    departments,
    desks,
    organization: buildDepartmentOrganizationModel(departments, desks, CONTROL_CENTRE_DESK_ID),
  };
}

function normalizeDepartmentRecord(source = {}, fallback = null) {
  const template = getDepartmentTemplate(source.templateId || fallback?.templateId || 'support') || getDepartmentTemplate('support');
  const slot = getRoomSlot(source.slotId || fallback?.slotId || '') || getRoomSlot(fallback?.slotId || '') || null;
  const fallbackBounds = slot
    ? { ...slot, slotId: slot.id }
    : (fallback?.bounds || STUDIO_ROOM_BOUNDS);
  return {
    id: String(source.id || fallback?.id || '').trim(),
    label: String(source.label || fallback?.label || template.label).trim(),
    templateId: template.id,
    kind: String(source.kind || fallback?.kind || template.kind).trim() || template.kind,
    summary: String(source.summary || fallback?.summary || template.summary).trim(),
    editable: source.editable !== undefined ? Boolean(source.editable) : (fallback?.editable !== undefined ? Boolean(fallback.editable) : Boolean(template.editable)),
    visible: source.visible !== undefined ? Boolean(source.visible) : (fallback?.visible !== undefined ? Boolean(fallback.visible) : true),
    slotId: slot?.id || String(source.slotId || fallback?.slotId || '').trim() || null,
    bounds: normalizeRoomBounds(source.bounds || fallback?.bounds || fallbackBounds, fallbackBounds),
    deskIds: uniqueStrings(source.deskIds || fallback?.deskIds || []),
    controlCentreDeskId: String(source.controlCentreDeskId || fallback?.controlCentreDeskId || CONTROL_CENTRE_DESK_ID).trim() || CONTROL_CENTRE_DESK_ID,
    staffing: buildDefaultDepartmentStaffingRecord({
      ...fallback,
      ...source,
      deskIds: uniqueStrings(source.deskIds || fallback?.deskIds || []),
      staffing: {
        ...(fallback?.staffing || {}),
        ...(source.staffing || {}),
      },
    }),
  };
}

function normalizeDeskRecord(source = {}, fallback = null, departmentsById = {}) {
  const template = getDeskTemplate(source.templateId || fallback?.templateId || 'support-node') || getDeskTemplate('support-node');
  const departmentId = String(source.departmentId || fallback?.departmentId || '').trim() || Object.keys(departmentsById)[0];
  const department = departmentsById[departmentId] || Object.values(departmentsById)[0] || { bounds: STUDIO_ROOM_BOUNDS };
  return {
    id: String(source.id || fallback?.id || '').trim(),
    label: String(source.label || fallback?.label || template.label).trim(),
    templateId: template.id,
    type: String(source.type || fallback?.type || template.type).trim() || template.type,
    capabilities: uniqueStrings(source.capabilities || fallback?.capabilities || template.capabilities),
    editable: source.editable !== undefined ? Boolean(source.editable) : (fallback?.editable !== undefined ? Boolean(fallback.editable) : Boolean(template.editable)),
    departmentId,
    position: normalizeDeskPosition(source.position || fallback?.position, department.bounds, fallback?.position),
    assignedAgentIds: uniqueStrings(source.assignedAgentIds || fallback?.assignedAgentIds || CORE_DESK_AGENT_DEFAULTS[source.id] || []),
    reportsToDeskId: String(source.reportsToDeskId || fallback?.reportsToDeskId || CONTROL_CENTRE_DESK_ID).trim() || CONTROL_CENTRE_DESK_ID,
    staffing: {
      roleId: String(source.staffing?.roleId || fallback?.staffing?.roleId || source.id || fallback?.id || '').trim() || String(source.id || fallback?.id || '').trim(),
      seatKind: String(source.staffing?.seatKind || fallback?.staffing?.seatKind || 'core').trim() || 'core',
      placeholder: source.staffing?.placeholder !== undefined
        ? Boolean(source.staffing.placeholder)
        : (fallback?.staffing?.placeholder !== undefined ? Boolean(fallback.staffing.placeholder) : true),
    },
  };
}

function resolveRelationshipPreset(department = {}) {
  return DEPARTMENT_RELATIONSHIP_PRESETS[String(department.kind || department.templateId || 'support').trim()] || DEPARTMENT_RELATIONSHIP_PRESETS.support;
}

function collectDepartmentIdsByKinds(departments = [], kinds = []) {
  const kindSet = new Set((Array.isArray(kinds) ? kinds : []).map((kind) => String(kind || '').trim()).filter(Boolean));
  return departments
    .filter((department) => kindSet.has(String(department.kind || '').trim()))
    .map((department) => department.id)
    .filter(Boolean);
}

function collectDeskIdsByDepartmentIds(desks = {}, departmentIds = []) {
  const departmentSet = new Set((Array.isArray(departmentIds) ? departmentIds : []).map((departmentId) => String(departmentId || '').trim()).filter(Boolean));
  return Object.values(desks)
    .filter((desk) => departmentSet.has(String(desk.departmentId || '').trim()))
    .map((desk) => desk.id)
    .filter(Boolean);
}

function buildDepartmentOrganizationModel(departments = [], desks = {}, controlCentreDeskId = CONTROL_CENTRE_DESK_ID) {
  const departmentList = Array.isArray(departments) ? departments.filter(Boolean) : [];
  const deskMap = desks && typeof desks === 'object' ? desks : {};
  const departmentById = Object.fromEntries(departmentList.map((department) => [department.id, department]));
  const departmentsModel = {};
  const desksModel = {};

  departmentList.forEach((department) => {
    const preset = resolveRelationshipPreset(department);
    const parentDepartmentId = department.id === 'dept-control'
      ? null
      : String(preset.parentDepartmentId || 'dept-control').trim() || null;
    const peerDepartmentIds = parentDepartmentId
      ? departmentList
        .filter((other) => other.id !== department.id && other.id !== parentDepartmentId)
        .map((other) => other.id)
      : [];
    const supportDepartmentIds = collectDepartmentIdsByKinds(departmentList, preset.supportKinds)
      .filter((departmentId) => departmentId !== department.id);
    const dependencyDepartmentIds = collectDepartmentIdsByKinds(departmentList, preset.dependencyKinds)
      .filter((departmentId) => departmentId !== department.id);
    const supportDeskIds = collectDeskIdsByDepartmentIds(deskMap, supportDepartmentIds);
    const dependencyDeskIds = collectDeskIdsByDepartmentIds(deskMap, dependencyDepartmentIds);

    departmentsModel[department.id] = {
      id: department.id,
      label: department.label,
      kind: department.kind,
      templateId: department.templateId,
      parentDepartmentId,
      peerDepartmentIds: uniqueStrings(peerDepartmentIds),
      supportDepartmentIds: uniqueStrings(supportDepartmentIds),
      dependencyDepartmentIds: uniqueStrings(dependencyDepartmentIds),
      supportDeskIds: uniqueStrings(supportDeskIds),
      dependencyDeskIds: uniqueStrings(dependencyDeskIds),
      deskIds: uniqueStrings(department.deskIds),
      controlCentreDeskId: department.controlCentreDeskId || controlCentreDeskId,
      staffing: cloneJson(department.staffing, null),
    };
  });

  Object.values(deskMap).filter(Boolean).forEach((desk) => {
    const department = departmentById[desk.departmentId] || null;
    const parentDepartmentId = department?.id || null;
    const peerDeskIds = Object.values(deskMap)
      .filter((peer) => peer.id !== desk.id && String(peer.departmentId || '').trim() === String(desk.departmentId || '').trim())
      .map((peer) => peer.id);
    desksModel[desk.id] = {
      id: desk.id,
      label: desk.label,
      departmentId: desk.departmentId,
      parentDepartmentId,
      peerDeskIds: uniqueStrings(peerDeskIds),
      supportDepartmentIds: department ? [...(departmentsModel[department.id]?.supportDepartmentIds || [])] : [],
      dependencyDepartmentIds: department ? [...(departmentsModel[department.id]?.dependencyDepartmentIds || [])] : [],
      supportDeskIds: department ? [...(departmentsModel[department.id]?.supportDeskIds || [])] : [],
      dependencyDeskIds: department ? [...(departmentsModel[department.id]?.dependencyDeskIds || [])] : [],
      reportsToDeskId: desk.reportsToDeskId || controlCentreDeskId,
      staffing: cloneJson(desk.staffing, null),
    };
  });

  return {
    schemaVersion: 'studio-relationships.v1',
    relationshipTypes: DEPARTMENT_RELATIONSHIP_TYPES,
    departments: departmentsModel,
    desks: desksModel,
  };
}

function buildValidationIssue({
  code,
  severity,
  dependencyType,
  requiredId = null,
  requiredKind = null,
  templateId = null,
  departmentId = null,
  targetType = null,
  targetId = null,
  reason = '',
}) {
  return {
    code,
    severity,
    dependencyType,
    requiredId,
    requiredKind,
    templateId,
    departmentId,
    targetType,
    targetId,
    reason,
  };
}

function buildValidationSummary(issues = []) {
  const blockers = issues.filter((issue) => issue.severity === 'block');
  const warnings = issues.filter((issue) => issue.severity === 'warn');
  return {
    status: blockers.length ? 'block' : warnings.length ? 'warn' : 'pass',
    issues,
    blockers,
    warnings,
  };
}

function collectDepartmentKindSet(layout = {}) {
  return new Set(listDepartmentRecords(layout).map((department) => String(department?.kind || '').trim()).filter(Boolean));
}

function collectDepartmentIdSet(layout = {}) {
  return new Set(listDepartmentRecords(layout).map((department) => String(department?.id || '').trim()).filter(Boolean));
}

function collectDeskMap(layout = {}) {
  const desks = {};
  listDeskEntries(layout).forEach((desk) => {
    const id = String(desk?.id || '').trim();
    if (id) desks[id] = desk;
  });
  return desks;
}

function validateDepartmentDependencies(layout = {}, templateId = '') {
  const template = getDepartmentTemplate(templateId);
  if (!template) {
    return buildValidationSummary([buildValidationIssue({
      code: 'unknown-department-template',
      severity: 'block',
      dependencyType: 'template',
      requiredId: String(templateId || '').trim() || null,
      targetType: 'department',
      reason: 'Unsupported department template.',
    })]);
  }
  if (template.id === 'control' || template.id === 'intake' || template.id === 'delivery') {
    return buildValidationSummary([buildValidationIssue({
      code: 'core-department-template',
      severity: 'block',
      dependencyType: 'template',
      requiredKind: template.kind,
      templateId: template.id,
      targetType: 'department',
      reason: 'Core departments are already part of the canonical layout.',
    })]);
  }

  const normalized = normalizeStudioLayoutSchema(layout);
  const departmentKinds = collectDepartmentKindSet(normalized);
  const departmentIds = collectDepartmentIdSet(normalized);
  const controlCentrePresent = departmentIds.has('dept-control');
  const preset = DEPARTMENT_RELATIONSHIP_PRESETS[template.kind] || DEPARTMENT_RELATIONSHIP_PRESETS.support;
  const issues = [];

  if (preset.parentDepartmentId && !departmentIds.has(preset.parentDepartmentId)) {
    issues.push(buildValidationIssue({
      code: 'missing-parent-department',
      severity: 'block',
      dependencyType: 'parent',
      requiredId: preset.parentDepartmentId,
      requiredKind: 'control',
      templateId: template.id,
      targetType: 'department',
      reason: `${template.label} requires the parent department ${preset.parentDepartmentId}.`,
    }));
  }

  if (!controlCentrePresent) {
    issues.push(buildValidationIssue({
      code: 'missing-lead-dependency',
      severity: 'block',
      dependencyType: 'lead',
      requiredId: 'dept-control',
      requiredKind: 'control',
      templateId: template.id,
      targetType: 'department',
      reason: `${template.label} requires the control centre to be present.`,
    }));
  }

  (preset.dependencyKinds || []).forEach((kind) => {
    if (!departmentKinds.has(kind)) {
      issues.push(buildValidationIssue({
        code: 'missing-lead-dependency',
        severity: 'block',
        dependencyType: 'lead',
        requiredKind: kind,
        templateId: template.id,
        targetType: 'department',
        reason: `${template.label} depends on a ${getDepartmentTemplate(kind)?.label || kind} department.`,
      }));
    }
  });

  (preset.supportKinds || []).forEach((kind) => {
    if (!departmentKinds.has(kind)) {
      issues.push(buildValidationIssue({
        code: 'missing-support-dependency',
        severity: 'warn',
        dependencyType: 'support',
        requiredKind: kind,
        templateId: template.id,
        targetType: 'department',
        reason: `${template.label} is normally supported by a ${getDepartmentTemplate(kind)?.label || kind} department.`,
      }));
    }
  });

  return buildValidationSummary(issues);
}

function validateDeskDependencies(layout = {}, departmentId = '', templateId = '') {
  const template = getDeskTemplate(templateId);
  if (!template) {
    return buildValidationSummary([buildValidationIssue({
      code: 'unknown-desk-template',
      severity: 'block',
      dependencyType: 'template',
      requiredId: String(templateId || '').trim() || null,
      targetType: 'desk',
      reason: 'Unsupported desk template.',
    })]);
  }

  const normalized = normalizeStudioLayoutSchema(layout);
  const department = normalized.departments.find((entry) => entry.id === String(departmentId || '').trim()) || null;
  if (!department) {
    return buildValidationSummary([buildValidationIssue({
      code: 'missing-department',
      severity: 'block',
      dependencyType: 'parent',
      requiredId: String(departmentId || '').trim() || null,
      templateId: template.id,
      targetType: 'desk',
      reason: 'Target department is required.',
    })]);
  }

  const departmentsByKind = collectDepartmentKindSet(normalized);
  const departmentIds = collectDepartmentIdSet(normalized);
  const deskMap = collectDeskMap(normalized);
  const preset = DEPARTMENT_RELATIONSHIP_PRESETS[department.kind] || DEPARTMENT_RELATIONSHIP_PRESETS.support;
  const issues = [];

  if (!template.allowedDepartmentKinds.includes(department.kind)) {
    issues.push(buildValidationIssue({
      code: 'desk-template-not-approved',
      severity: 'block',
      dependencyType: 'lead',
      requiredKind: department.kind,
      templateId: template.id,
      departmentId: department.id,
      targetType: 'desk',
      reason: `${template.label} is not approved for ${department.label}.`,
    }));
  }

  if (preset.parentDepartmentId && !departmentIds.has(preset.parentDepartmentId)) {
    issues.push(buildValidationIssue({
      code: 'missing-parent-department',
      severity: 'block',
      dependencyType: 'parent',
      requiredId: preset.parentDepartmentId,
      requiredKind: 'control',
      templateId: template.id,
      departmentId: department.id,
      targetType: 'desk',
      reason: `${department.label} requires the parent department ${preset.parentDepartmentId}.`,
    }));
  }

  if (!deskMap[department.controlCentreDeskId || CONTROL_CENTRE_DESK_ID]) {
    issues.push(buildValidationIssue({
      code: 'missing-lead-dependency',
      severity: 'block',
      dependencyType: 'lead',
      requiredId: department.controlCentreDeskId || CONTROL_CENTRE_DESK_ID,
      requiredKind: 'control',
      templateId: template.id,
      departmentId: department.id,
      targetType: 'desk',
      reason: `${department.label} requires the control desk to be present.`,
    }));
  }

  (preset.dependencyKinds || []).forEach((kind) => {
    if (!departmentsByKind.has(kind)) {
      issues.push(buildValidationIssue({
        code: 'missing-lead-dependency',
        severity: 'block',
        dependencyType: 'lead',
        requiredKind: kind,
        templateId: template.id,
        departmentId: department.id,
        targetType: 'desk',
        reason: `${department.label} depends on a ${getDepartmentTemplate(kind)?.label || kind} department.`,
      }));
    }
  });

  (preset.supportKinds || []).forEach((kind) => {
    if (!departmentsByKind.has(kind)) {
      issues.push(buildValidationIssue({
        code: 'missing-support-dependency',
        severity: 'warn',
        dependencyType: 'support',
        requiredKind: kind,
        templateId: template.id,
        departmentId: department.id,
        targetType: 'desk',
        reason: `${department.label} is normally supported by a ${getDepartmentTemplate(kind)?.label || kind} department.`,
      }));
    }
  });

  return buildValidationSummary(issues);
}

function legacyDeskPositions(layout = {}) {
  const source = layout?.desks && !Array.isArray(layout.desks) ? layout.desks : {};
  const map = {};
  Object.entries(source).forEach(([deskId, value]) => {
    if (value && typeof value === 'object' && !Object.prototype.hasOwnProperty.call(value, 'departmentId') && Object.prototype.hasOwnProperty.call(value, 'x')) {
      map[deskId] = { x: Number(value.x), y: Number(value.y) };
    }
  });
  return map;
}

function listDepartmentRecords(source = {}) {
  if (Array.isArray(source?.departments)) return source.departments;
  if (source?.departments && typeof source.departments === 'object') return Object.values(source.departments);
  return [];
}

function listDeskEntries(source = {}) {
  if (source?.desks && typeof source.desks === 'object' && !Array.isArray(source.desks)) {
    return Object.entries(source.desks).map(([deskId, desk]) => ({ ...desk, id: desk?.id || deskId }));
  }
  if (Array.isArray(source?.desks)) return source.desks;
  return [];
}

function normalizeStudioLayoutSchema(layout = {}) {
  const defaults = createDefaultStudioLayoutSchema();
  const legacyPositions = legacyDeskPositions(layout);
  const normalizedDepartments = [];
  const departmentMap = {};

  CORE_DEPARTMENTS.forEach((definition) => {
    const source = listDepartmentRecords(layout).find((entry) => String(entry?.id || '').trim() === definition.id) || {};
    const record = normalizeDepartmentRecord(source, buildDefaultDepartmentRecord(definition));
    normalizedDepartments.push(record);
    departmentMap[record.id] = record;
  });

  listDepartmentRecords(layout).forEach((entry) => {
    const entryId = String(entry?.id || '').trim();
    if (!entryId || departmentMap[entryId]) return;
    const slot = getRoomSlot(entry?.slotId || '');
    const record = normalizeDepartmentRecord(entry, {
      id: entryId,
      label: entry?.label || entryId,
      templateId: entry?.templateId || 'support',
      slotId: slot?.id || null,
      bounds: slot || entry?.bounds || STUDIO_ROOM_BOUNDS,
      editable: true,
      visible: true,
      deskIds: [],
    });
    normalizedDepartments.push(record);
    departmentMap[record.id] = record;
  });

  const desks = {};
  Object.values(CORE_DESKS).forEach((definition) => {
    const source = listDeskEntries(layout).find((entry) => String(entry?.id || '').trim() === definition.id) || {};
    const department = departmentMap[definition.departmentId] || normalizedDepartments[0];
    desks[definition.id] = normalizeDeskRecord({
      ...source,
      position: source.position || legacyPositions[definition.id] || source,
    }, {
      ...buildDefaultDeskRecord(definition),
      position: definition.position,
    }, departmentMap);
    desks[definition.id].position = normalizeDeskPosition(desks[definition.id].position, department.bounds, definition.position);
  });

  listDeskEntries(layout).forEach((entry) => {
    const deskId = String(entry?.id || '').trim();
    if (!deskId || desks[deskId]) return;
    const fallbackDepartmentId = String(entry.departmentId || normalizedDepartments[0]?.id || '').trim();
    const fallbackDepartment = departmentMap[fallbackDepartmentId] || normalizedDepartments[0];
    const fallbackPosition = buildDepartmentDeskSlots(fallbackDepartment.bounds)[Math.min((fallbackDepartment.deskIds || []).length, 3)];
    desks[deskId] = normalizeDeskRecord({
      ...entry,
      position: entry.position || legacyPositions[deskId] || entry,
    }, {
      id: deskId,
      label: entry.label || deskId,
      templateId: entry.templateId || 'support-node',
      departmentId: fallbackDepartmentId,
      position: fallbackPosition,
      assignedAgentIds: entry.assignedAgentIds || [],
      editable: entry.editable !== undefined ? entry.editable : true,
    }, departmentMap);
  });

  normalizedDepartments.forEach((department) => {
    const knownDeskIds = Object.values(desks)
      .filter((desk) => desk.departmentId === department.id)
      .map((desk) => desk.id);
    department.deskIds = uniqueStrings([...(department.deskIds || []), ...knownDeskIds])
      .filter((deskId) => desks[deskId]?.departmentId === department.id);
  });

  return {
    version: String(layout.version || defaults.version),
    size: {
      width: clamp(Number(layout?.size?.width) || defaults.size.width, defaults.size.width, defaults.size.width),
      height: clamp(Number(layout?.size?.height) || defaults.size.height, defaults.size.height, defaults.size.height),
    },
    bounds: normalizeRoomBounds(layout.bounds || defaults.bounds, defaults.bounds),
    whiteboards: {
      teamBoard: {
        x: Number(layout?.whiteboards?.teamBoard?.x) || defaults.whiteboards.teamBoard.x,
        y: Number(layout?.whiteboards?.teamBoard?.y) || defaults.whiteboards.teamBoard.y,
        width: Number(layout?.whiteboards?.teamBoard?.width) || defaults.whiteboards.teamBoard.width,
        height: Number(layout?.whiteboards?.teamBoard?.height) || defaults.whiteboards.teamBoard.height,
      },
    },
    controlCentreDeskId: String(layout.controlCentreDeskId || defaults.controlCentreDeskId || CONTROL_CENTRE_DESK_ID).trim() || CONTROL_CENTRE_DESK_ID,
    departments: normalizedDepartments,
    desks,
    organization: buildDepartmentOrganizationModel(normalizedDepartments, desks, String(layout.controlCentreDeskId || defaults.controlCentreDeskId || CONTROL_CENTRE_DESK_ID).trim() || CONTROL_CENTRE_DESK_ID),
  };
}

function listStudioDeskIds(layout = {}) {
  const normalized = normalizeStudioLayoutSchema(layout);
  return Object.keys(normalized.desks);
}

function hasStudioDesk(layout = {}, deskId = '') {
  if (!deskId) return false;
  const normalized = normalizeStudioLayoutSchema(layout);
  return Boolean(normalized.desks[String(deskId).trim()]);
}

function findNextDepartmentSlot(layout = {}) {
  const normalized = normalizeStudioLayoutSchema(layout);
  const used = new Set(normalized.departments.map((department) => department.slotId).filter(Boolean));
  return DEPARTMENT_ROOM_SLOTS.find((slot) => !used.has(slot.id)) || null;
}

function findTemplateUsageCount(layout = {}, templateId = '', collection = 'departments') {
  const normalized = normalizeStudioLayoutSchema(layout);
  if (collection === 'desks') {
    return Object.values(normalized.desks).filter((desk) => desk.templateId === templateId).length;
  }
  return normalized.departments.filter((department) => department.templateId === templateId).length;
}

function createDepartmentId(layout = {}, templateId = '') {
  const normalized = normalizeStudioLayoutSchema(layout);
  const base = slugify(templateId) || 'department';
  let index = 1;
  let candidate = `dept-${base}-${index}`;
  const ids = new Set(normalized.departments.map((department) => department.id));
  while (ids.has(candidate)) {
    index += 1;
    candidate = `dept-${base}-${index}`;
  }
  return candidate;
}

function createDeskId(layout = {}, templateId = '') {
  const normalized = normalizeStudioLayoutSchema(layout);
  const base = slugify(templateId.replace(/-node$/, '')) || 'desk';
  let index = 1;
  let candidate = `${base}-${index}`;
  const ids = new Set(Object.keys(normalized.desks));
  while (ids.has(candidate)) {
    index += 1;
    candidate = `${base}-${index}`;
  }
  return candidate;
}

function addDepartmentToLayout(layout = {}, options = {}) {
  const normalized = normalizeStudioLayoutSchema(layout);
  const template = getDepartmentTemplate(options.templateId);
  const validation = validateDepartmentDependencies(normalized, options.templateId);
  if (!template || template.id === 'control' || template.id === 'intake' || template.id === 'delivery') {
    throw new Error('Unsupported department template.');
  }
  if (validation.status === 'block') {
    const blockedResult = {
      ok: false,
      validation,
      layout: normalized,
      createdDepartmentId: null,
      createdDeskId: null,
      focusDeskId: null,
    };
    return options.returnResult ? blockedResult : normalized;
  }
  const slot = findNextDepartmentSlot(normalized);
  if (!slot) {
    throw new Error('No visible room slot is available for another department.');
  }
  const count = findTemplateUsageCount(normalized, template.id, 'departments') + 1;
  const departmentId = createDepartmentId(normalized, template.id);
  const department = normalizeDepartmentRecord({
    id: departmentId,
    label: count > 1 ? `${template.label} ${count}` : template.label,
    templateId: template.id,
    kind: template.kind,
    summary: template.summary,
    editable: true,
    visible: true,
    slotId: slot.id,
    bounds: slot,
    deskIds: [],
    controlCentreDeskId: CONTROL_CENTRE_DESK_ID,
  });
  const result = {
    ok: true,
    validation,
    layout: normalizeStudioLayoutSchema({
      ...normalized,
      departments: [...normalized.departments, department],
      desks: normalized.desks,
    }),
  };
  return options.returnResult ? result : result.layout;
}

function addDeskToLayout(layout = {}, options = {}) {
  const normalized = normalizeStudioLayoutSchema(layout);
  const departmentId = String(options.departmentId || '').trim();
  const template = getDeskTemplate(options.templateId);
  const department = normalized.departments.find((entry) => entry.id === departmentId) || null;
  const validation = validateDeskDependencies(normalized, departmentId, options.templateId);
  if (!department) {
    throw new Error('Target department is required.');
  }
  if (!template) {
    throw new Error('Unsupported desk template.');
  }
  if (validation.status === 'block') {
    const blockedResult = {
      ok: false,
      validation,
      layout: normalized,
      createdDepartmentId: null,
      createdDeskId: null,
      focusDeskId: null,
    };
    return options.returnResult ? blockedResult : normalized;
  }
  if (department.kind === 'control' && template.id !== 'control-node' && template.id !== 'report-node' && template.id !== 'review-node') {
    throw new Error('That desk template is not approved for the control centre.');
  }
  if (!template.allowedDepartmentKinds.includes(department.kind)) {
    throw new Error(`Desk template ${template.label} is not approved for ${department.label}.`);
  }
  const slots = buildDepartmentDeskSlots(department.bounds);
  const deskIds = department.deskIds || [];
  if (deskIds.length >= slots.length) {
    throw new Error(`${department.label} has no free desk slot remaining.`);
  }
  const deskId = createDeskId(normalized, template.id);
  const desk = normalizeDeskRecord({
    id: deskId,
    label: `${template.label} ${findTemplateUsageCount(normalized, template.id, 'desks') + 1}`,
    templateId: template.id,
    departmentId: department.id,
    position: slots[deskIds.length],
    assignedAgentIds: [],
    editable: true,
  }, null, Object.fromEntries(normalized.departments.map((entry) => [entry.id, entry])));
  const result = {
    ok: true,
    validation,
    layout: normalizeStudioLayoutSchema({
      ...normalized,
      departments: normalized.departments.map((entry) => (
        entry.id === department.id
          ? { ...entry, deskIds: [...deskIds, desk.id] }
          : entry
      )),
      desks: {
        ...normalized.desks,
        [desk.id]: desk,
      },
    }),
  };
  return options.returnResult ? result : result.layout;
}

function buildStudioLayoutCatalog() {
  return {
    departmentTemplates: DEPARTMENT_TEMPLATE_ORDER
      .map((id) => getDepartmentTemplate(id))
      .filter(Boolean)
      .map((template) => ({
        id: template.id,
        label: template.label,
        kind: template.kind,
        summary: template.summary,
      })),
    deskTemplates: Object.values(DESK_TEMPLATE_DEFS).map((template) => ({
      id: template.id,
      label: template.label,
      type: template.type,
      summary: template.summary,
      capabilities: [...template.capabilities],
      allowedDepartmentKinds: [...template.allowedDepartmentKinds],
    })),
  };
}

module.exports = {
  STUDIO_WORLD_SIZE,
  STUDIO_ROOM_BOUNDS,
  STUDIO_DESK_SIZE,
  STUDIO_TEAM_BOARD_FRAME,
  CONTROL_CENTRE_DESK_ID,
  DEPARTMENT_RELATIONSHIP_TYPES,
  CORE_DESK_AGENT_DEFAULTS,
  createDefaultStudioLayoutSchema,
  normalizeStudioLayoutSchema,
  buildDepartmentOrganizationModel,
  listStudioDeskIds,
  hasStudioDesk,
  addDepartmentToLayout,
  addDeskToLayout,
  validateDepartmentDependencies,
  validateDeskDependencies,
  buildStudioLayoutCatalog,
};
