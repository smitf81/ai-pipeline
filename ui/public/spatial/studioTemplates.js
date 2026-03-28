export const STUDIO_ROOM_BOUNDS = { x: 56, y: 72, width: 1088, height: 664 };
export const STUDIO_DEPARTMENT_BOUNDS = { width: 420, height: 236 };
export const STUDIO_DESK_BOUNDS = { width: 152, height: 72 };

export const STUDIO_DESK_TEMPLATES = {
  'context-manager': {
    id: 'context-manager',
    label: 'Context Manager',
    role: 'Captures intent and routes context into the archive lane.',
    dependencyRules: {
      requiredLeadDeskTemplateIds: [],
      requiredSupportDeskTemplateIds: [],
    },
  },
  planner: {
    id: 'planner',
    label: 'Planner',
    role: 'Breaks intent into sequences, milestones, and handoffs.',
    dependencyRules: {
      requiredLeadDeskTemplateIds: ['context-manager'],
      requiredSupportDeskTemplateIds: ['memory-archivist'],
    },
  },
  executor: {
    id: 'executor',
    label: 'Executor',
    role: 'Applies validated changes and keeps delivery moving.',
    dependencyRules: {
      requiredLeadDeskTemplateIds: ['planner'],
      requiredSupportDeskTemplateIds: ['context-manager'],
    },
  },
  'memory-archivist': {
    id: 'memory-archivist',
    label: 'Memory Archivist',
    role: 'Keeps canonical context slices and historical decisions.',
    dependencyRules: {
      requiredLeadDeskTemplateIds: ['context-manager'],
      requiredSupportDeskTemplateIds: ['planner'],
    },
  },
  'qa-lead': {
    id: 'qa-lead',
    label: 'QA / Test Lead',
    role: 'Runs suites and keeps the evidence bench ready.',
    dependencyRules: {
      requiredLeadDeskTemplateIds: ['executor'],
      requiredSupportDeskTemplateIds: ['planner'],
    },
  },
  'talent-node': {
    id: 'talent-node',
    label: 'Talent Node',
    role: 'Tracks hiring demand, seat coverage, and role readiness.',
    dependencyRules: {
      requiredLeadDeskTemplateIds: ['integration_auditor'],
      requiredSupportDeskTemplateIds: [],
    },
  },
  'cto-architect': {
    id: 'cto-architect',
    label: 'CTO / Architect',
    role: 'Guards ownership, risk, and self-update boundaries.',
    dependencyRules: {
      requiredLeadDeskTemplateIds: ['qa-lead'],
      requiredSupportDeskTemplateIds: ['planner'],
    },
  },
};

export const STUDIO_DEPARTMENT_TEMPLATES = {
  'context-intake': {
    id: 'context-intake',
    label: 'Context Intake',
    bounds: { x: 96, y: 132, width: 420, height: 236 },
    deskTemplateIds: ['context-manager', 'planner'],
    dependencyRules: {
      requiredParentDepartmentTemplateIds: [],
      requiredLeadDeskTemplateIds: [],
      requiredSupportDeskTemplateIds: [],
    },
  },
  delivery: {
    id: 'delivery',
    label: 'Delivery',
    bounds: { x: 548, y: 132, width: 420, height: 236 },
    deskTemplateIds: ['executor', 'memory-archivist'],
    dependencyRules: {
      requiredParentDepartmentTemplateIds: ['context-intake'],
      requiredLeadDeskTemplateIds: ['planner'],
      requiredSupportDeskTemplateIds: ['memory-archivist'],
    },
  },
  governance: {
    id: 'governance',
    label: 'Quality and Governance',
    bounds: { x: 322, y: 412, width: 508, height: 232 },
    deskTemplateIds: ['qa-lead', 'cto-architect'],
    dependencyRules: {
      requiredParentDepartmentTemplateIds: ['delivery'],
      requiredLeadDeskTemplateIds: ['qa-lead'],
      requiredSupportDeskTemplateIds: ['cto-architect'],
    },
  },
  'talent-acquisition': {
    id: 'talent-acquisition',
    label: 'Talent Acquisition',
    bounds: { x: 850, y: 86, width: 250, height: 176 },
    deskTemplateIds: ['talent-node'],
    dependencyRules: {
      requiredParentDepartmentTemplateIds: ['control'],
      requiredLeadDeskTemplateIds: ['integration_auditor'],
      requiredSupportDeskTemplateIds: [],
    },
  },
};
