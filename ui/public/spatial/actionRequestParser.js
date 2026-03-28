const ACTION_REQUEST_TYPES = Object.freeze([
  'propose_add_department',
  'propose_add_desk',
  'propose_move_desk_to_department',
]);

const ACTION_REQUEST_HELPERS = Object.freeze({
  propose_add_department: 'addDepartmentFromTemplate',
  propose_add_desk: 'addDeskToDepartment',
  propose_move_desk_to_department: 'moveDeskToDepartment',
});

const DEMO_ACTION_TEMPLATES = Object.freeze([
  {
    type: 'propose_add_department',
    intent: 'propose add department',
    target: { kind: 'department', templateId: 'context-intake' },
    parameters: { templateId: 'context-intake', id: 'context-intake-department' },
    confidence: 0.94,
    rationale: 'Demo action for adding a new intake department.',
  },
  {
    type: 'propose_add_desk',
    intent: 'propose add desk',
    target: { kind: 'desk', templateId: 'qa-lead', departmentTemplateId: 'governance' },
    parameters: { templateId: 'qa-lead', departmentTemplateId: 'governance', id: 'governance-qa-lead-desk' },
    confidence: 0.91,
    rationale: 'Demo action for adding a desk to a governance department.',
  },
  {
    type: 'propose_move_desk_to_department',
    intent: 'propose move desk to department',
    target: { kind: 'desk', deskId: 'qa-lead-desk', departmentId: 'delivery-department' },
    parameters: { deskId: 'qa-lead-desk', departmentId: 'delivery-department' },
    confidence: 0.88,
    rationale: 'Demo action for re-homing a desk into another department.',
  },
]);

const ACTION_PATTERNS = {
  propose_add_department: [/\b(?:propose\s+)?add\s+department\b/i],
  propose_add_desk: [/\b(?:propose\s+)?add\s+desk\b/i],
  propose_move_desk_to_department: [/\b(?:propose\s+)?move\s+desk\s+to\s+department\b/i, /\b(?:propose\s+)?move\s+desk\b/i, /\breassign\s+desk\b/i],
};

const DEPARTMENT_TEMPLATE_HINTS = [
  { templateId: 'governance', patterns: [/\bqa\b/i, /\bquality\b/i, /\bgovernance\b/i, /\breview\b/i, /\bcompliance\b/i] },
  { templateId: 'delivery', patterns: [/\bdelivery\b/i, /\bship\b/i, /\bexecutor\b/i, /\bbuild\b/i, /\bops\b/i] },
  { templateId: 'context-intake', patterns: [/\bcontext\b/i, /\bintake\b/i, /\bplanner\b/i, /\bbrief\b/i, /\bintroduction\b/i] },
];

const DESK_TEMPLATE_HINTS = [
  { templateId: 'qa-lead', patterns: [/\bqa\b/i, /\btest\b/i, /\breview\b/i, /\bquality\b/i, /\bverification\b/i] },
  { templateId: 'planner', patterns: [/\bplanner\b/i, /\bplanning\b/i, /\bsequence\b/i, /\brouting\b/i] },
  { templateId: 'executor', patterns: [/\bexecutor\b/i, /\bexecute\b/i, /\bdelivery\b/i, /\bimplementation\b/i] },
  { templateId: 'memory-archivist', patterns: [/\barchivist\b/i, /\barchive\b/i, /\bmemory\b/i, /\bhistory\b/i] },
  { templateId: 'cto-architect', patterns: [/\bcto\b/i, /\barchitect\b/i, /\bgovernance\b/i, /\brisk\b/i, /\bownership\b/i] },
  { templateId: 'context-manager', patterns: [/\bcontext\b/i, /\bintake\b/i, /\bbridge\b/i] },
];

let actionRequestCounter = 0;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeText(value = '') {
  return String(value || '').trim();
}

function normalizeActionText(value = '') {
  return normalizeText(value).toLowerCase();
}

function nextActionRequestId(type) {
  actionRequestCounter += 1;
  return `action_request_${actionRequestCounter}_${String(type || 'proposal')}`;
}

function buildActionRequest(type, sourceText, details = {}) {
  return {
    id: nextActionRequestId(type),
    type,
    status: 'proposed',
    execution: 'blocked',
    routedTo: 'mutation-helper',
    mutationHelper: ACTION_REQUEST_HELPERS[type] || null,
    sourceText: normalizeText(sourceText),
    intent: details.intent || type.replaceAll('_', ' '),
    target: details.target || null,
    parameters: details.parameters || {},
    confidence: Number.isFinite(Number(details.confidence)) ? Number(details.confidence) : 0.5,
    rationale: normalizeText(details.rationale),
    mode: details.mode || 'parsed',
  };
}

function pickTemplateId(text = '', hints = []) {
  for (const hint of hints) {
    if ((hint.patterns || []).some((pattern) => pattern.test(text))) {
      return hint.templateId;
    }
  }
  return null;
}

function inferDepartmentTemplateId(text = '') {
  return pickTemplateId(text, DEPARTMENT_TEMPLATE_HINTS) || 'context-intake';
}

function inferDeskTemplateId(text = '') {
  return pickTemplateId(text, DESK_TEMPLATE_HINTS) || 'planner';
}

function extractExplicitId(text = '', kind = 'desk') {
  const patterns = kind === 'department'
    ? [
        /\bdepartment\s+([a-z0-9][a-z0-9_-]*)\b/i,
        /\b([a-z0-9][a-z0-9_-]*)\s+department\b/i,
      ]
    : [
        /\bdesk\s+([a-z0-9][a-z0-9_-]*)\b/i,
        /\b([a-z0-9][a-z0-9_-]*)\s+desk\b/i,
      ];
  for (const pattern of patterns) {
    const match = String(text || '').match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return '';
}

function parseAddDepartmentAction(text, options = {}) {
  const departmentTemplateId = normalizeText(options.departmentTemplateId || options.templateId || '') || inferDepartmentTemplateId(text);
  const requestedId = normalizeText(options.id || extractExplicitId(text, 'department'));
  return buildActionRequest('propose_add_department', text, {
    intent: 'propose add department',
    target: {
      kind: 'department',
      templateId: departmentTemplateId,
      departmentId: requestedId || null,
    },
    parameters: {
      templateId: departmentTemplateId,
      id: requestedId || null,
    },
    confidence: options.confidence ?? 0.82,
    rationale: options.rationale || 'Parsed as a safe department proposal.',
    mode: options.mode || 'parsed',
  });
}

function parseAddDeskAction(text, options = {}) {
  const deskTemplateId = normalizeText(options.deskTemplateId || options.templateId || '') || inferDeskTemplateId(text);
  const departmentTemplateId = normalizeText(options.departmentTemplateId || '') || inferDepartmentTemplateId(text);
  const requestedId = normalizeText(options.id || extractExplicitId(text, 'desk'));
  return buildActionRequest('propose_add_desk', text, {
    intent: 'propose add desk',
    target: {
      kind: 'desk',
      templateId: deskTemplateId,
      departmentTemplateId,
      deskId: requestedId || null,
    },
    parameters: {
      templateId: deskTemplateId,
      departmentTemplateId,
      id: requestedId || null,
    },
    confidence: options.confidence ?? 0.8,
    rationale: options.rationale || 'Parsed as a safe desk proposal.',
    mode: options.mode || 'parsed',
  });
}

function parseMoveDeskAction(text, options = {}) {
  const deskId = normalizeText(options.deskId || extractExplicitId(text, 'desk'));
  const departmentId = normalizeText(options.departmentId || options.toDepartmentId || '');
  const departmentTemplateId = normalizeText(options.departmentTemplateId || '') || inferDepartmentTemplateId(text);
  return buildActionRequest('propose_move_desk_to_department', text, {
    intent: 'propose move desk to department',
    target: {
      kind: 'desk',
      deskId: deskId || null,
      departmentId: departmentId || null,
      departmentTemplateId,
    },
    parameters: {
      deskId: deskId || null,
      departmentId: departmentId || null,
      departmentTemplateId,
    },
    confidence: options.confidence ?? 0.79,
    rationale: options.rationale || 'Parsed as a safe desk move proposal.',
    mode: options.mode || 'parsed',
  });
}

function collectSupportedActions(text, options = {}) {
  const normalized = normalizeActionText(text);
  if (ACTION_PATTERNS.propose_move_desk_to_department.some((pattern) => pattern.test(normalized))) {
    return [parseMoveDeskAction(text, options)];
  }
  const actions = [];
  if (ACTION_PATTERNS.propose_add_department.some((pattern) => pattern.test(normalized))) {
    actions.push(parseAddDepartmentAction(text, options));
  }
  if (ACTION_PATTERNS.propose_add_desk.some((pattern) => pattern.test(normalized))) {
    actions.push(parseAddDeskAction(text, options));
  }

  return actions;
}

function buildDemoActions() {
  return DEMO_ACTION_TEMPLATES.map((action) => ({
    ...action,
    id: nextActionRequestId(action.type),
    status: 'proposed',
    execution: 'blocked',
    routedTo: 'mutation-helper',
    mutationHelper: ACTION_REQUEST_HELPERS[action.type] || null,
    sourceText: 'demo',
    mode: 'demo',
  }));
}

export function parseActionRequest(input = '', options = {}) {
  const mode = String(options.mode || '').trim().toLowerCase();
  if (mode === 'demo' || options.demo === true) {
    return buildDemoActions();
  }

  const text = normalizeText(input);
  if (!text) return [];

  return collectSupportedActions(text, options).map((action) => ({
    ...action,
    mode: 'parsed',
  }));
}

export function buildActionRequestSkeleton(type, details = {}) {
  if (!ACTION_REQUEST_TYPES.includes(type)) {
    return null;
  }
  const safeDetails = isPlainObject(details) ? details : {};
  const sourceText = safeDetails.sourceText || '';
  if (type === 'propose_add_department') {
    return parseAddDepartmentAction(sourceText, safeDetails);
  }
  if (type === 'propose_add_desk') {
    return parseAddDeskAction(sourceText, safeDetails);
  }
  if (type === 'propose_move_desk_to_department') {
    return parseMoveDeskAction(sourceText, safeDetails);
  }
  return buildActionRequest(type, sourceText, {
    ...safeDetails,
    mode: safeDetails.mode || 'parsed',
  });
}

export { ACTION_REQUEST_TYPES, ACTION_REQUEST_HELPERS };
