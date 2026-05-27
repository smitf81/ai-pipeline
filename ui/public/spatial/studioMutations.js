import {
  STUDIO_ROOM_BOUNDS,
  STUDIO_DESK_BOUNDS,
  STUDIO_DESK_TEMPLATES,
  STUDIO_DEPARTMENT_BOUNDS,
  STUDIO_DEPARTMENT_TEMPLATES,
} from './studioTemplates.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneBounds(bounds = {}) {
  return {
    x: Number(bounds.x) || 0,
    y: Number(bounds.y) || 0,
    width: Number(bounds.width) || 0,
    height: Number(bounds.height) || 0,
  };
}

function resolveNumber(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeBounds(bounds = {}, fallback = STUDIO_DEPARTMENT_BOUNDS, room = null) {
  const source = isPlainObject(bounds) ? bounds : {};
  const resolved = {
    x: resolveNumber(source.x, fallback.x),
    y: resolveNumber(source.y, fallback.y),
    width: resolveNumber(source.width, fallback.width),
    height: resolveNumber(source.height, fallback.height),
  };
  if (!room) return resolved;
  const maxX = room.x + room.width - resolved.width;
  const maxY = room.y + room.height - resolved.height;
  return {
    x: Math.min(Math.max(resolved.x, room.x), maxX),
    y: Math.min(Math.max(resolved.y, room.y), maxY),
    width: resolved.width,
    height: resolved.height,
  };
}

function cloneDeskTemplate(template, departmentId, bounds, index) {
  const x = bounds.x + 24 + ((index % 2) * 168);
  const y = bounds.y + 52 + (Math.floor(index / 2) * 92);
  const deskBounds = {
    x,
    y,
    width: STUDIO_DESK_BOUNDS.width,
    height: STUDIO_DESK_BOUNDS.height,
  };
  return {
    id: template.id,
    templateId: template.id,
    departmentId,
    label: template.label,
    role: template.role,
    bounds: deskBounds,
    position: {
      x: deskBounds.x + (deskBounds.width / 2),
      y: deskBounds.y + (deskBounds.height / 2),
    },
  };
}

function collectUsedIds(departments = []) {
  const ids = new Set();
  for (const department of departments || []) {
    if (!department) continue;
    if (department.id) ids.add(department.id);
    for (const desk of department.desks || []) {
      if (desk?.id) ids.add(desk.id);
    }
  }
  return ids;
}

function uniqueId(baseId, usedIds) {
  if (!usedIds.has(baseId)) return baseId;
  let suffix = 2;
  while (usedIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseId}-${suffix}`;
}

function normalizeHierarchy(hierarchy = {}) {
  const source = isPlainObject(hierarchy) ? hierarchy : {};
  return {
    departments: Array.isArray(source.departments) ? source.departments.map((department) => ({
      ...department,
      bounds: cloneBounds(department?.bounds),
      desks: Array.isArray(department?.desks) ? department.desks.map((desk) => ({
        ...desk,
        bounds: cloneBounds(desk?.bounds),
        position: isPlainObject(desk?.position) ? { x: Number(desk.position.x) || 0, y: Number(desk.position.y) || 0 } : { x: 0, y: 0 },
      })) : [],
    })) : [],
  };
}

function resolveDepartmentTemplate(templateId) {
  return STUDIO_DEPARTMENT_TEMPLATES[templateId] || null;
}

function resolveDeskTemplate(templateId) {
  return STUDIO_DESK_TEMPLATES[templateId] || null;
}

function collectHierarchyPresence(hierarchy = {}) {
  const normalized = normalizeHierarchy(hierarchy);
  const departments = normalized.departments || [];
  const departmentTemplateIds = new Set(departments.map((department) => department?.templateId).filter(Boolean));
  const deskTemplateIds = new Set(
    departments.flatMap((department) => (department.desks || []).map((desk) => desk?.templateId).filter(Boolean)),
  );
  return {
    normalized,
    departmentTemplateIds,
    deskTemplateIds,
  };
}

function makeDependencyIssue({
  code,
  severity,
  dependencyType,
  requiredTemplateId,
  templateId,
  targetType,
  targetId = null,
}) {
  return {
    code,
    severity,
    dependencyType,
    requiredTemplateId,
    templateId,
    targetType,
    targetId,
  };
}

function dependencyStatus(issues = []) {
  if (issues.some((issue) => issue.severity === 'block')) return 'block';
  if (issues.some((issue) => issue.severity === 'warn')) return 'warn';
  return 'pass';
}

function buildValidationResult(issues = []) {
  return {
    status: dependencyStatus(issues),
    issues,
    blockers: issues.filter((issue) => issue.severity === 'block'),
    warnings: issues.filter((issue) => issue.severity === 'warn'),
  };
}

function validateRequiredTemplateDependencies({
  hierarchy,
  template,
  targetType,
  targetId = null,
  excludeDepartmentId = null,
}) {
  const { departmentTemplateIds, deskTemplateIds } = collectHierarchyPresence(hierarchy);
  const dependencyRules = template?.dependencyRules || {};
  const issues = [];
  const departmentRequirements = [
    ...(dependencyRules.requiredParentDepartmentTemplateIds || []).map((requiredTemplateId) => ({
      code: 'missing-parent-department',
      severity: 'block',
      dependencyType: 'parent',
      requiredTemplateId,
    })),
    ...(dependencyRules.requiredLeadDeskTemplateIds || []).map((requiredTemplateId) => ({
      code: 'missing-lead-dependency',
      severity: 'block',
      dependencyType: 'lead',
      requiredTemplateId,
    })),
    ...(dependencyRules.requiredSupportDeskTemplateIds || []).map((requiredTemplateId) => ({
      code: 'missing-support-dependency',
      severity: 'warn',
      dependencyType: 'support',
      requiredTemplateId,
    })),
  ];

  for (const requirement of departmentRequirements) {
    const present = requirement.dependencyType === 'parent'
      ? departmentTemplateIds.has(requirement.requiredTemplateId)
      : deskTemplateIds.has(requirement.requiredTemplateId);
    if (!present) {
      issues.push(makeDependencyIssue({
        ...requirement,
        templateId: template?.id || null,
        targetType,
        targetId,
      }));
    }
  }

  if (targetType === 'desk' && excludeDepartmentId) {
    const department = (hierarchy?.departments || []).find((entry) => entry?.id === excludeDepartmentId);
    if (department?.templateId === template?.id) {
      // no-op, the validator keeps the current department in scope
    }
  }

  return buildValidationResult(issues);
}

function buildDepartmentFromTemplate(template, departmentId, options = {}) {
  const bounds = normalizeBounds(options.bounds, template.bounds || STUDIO_DEPARTMENT_BOUNDS, options.room || null);
  const deskTemplates = (template.deskTemplateIds || [])
    .map((deskTemplateId) => resolveDeskTemplate(deskTemplateId))
    .filter(Boolean);
  const desks = deskTemplates.map((deskTemplate, index) => cloneDeskTemplate(deskTemplate, departmentId, bounds, index));
  return {
    id: departmentId,
    templateId: template.id,
    label: template.label,
    bounds,
    desks,
  };
}

function buildDeskForDepartment(department, deskTemplate, deskId, index) {
  const bounds = department.bounds || STUDIO_DEPARTMENT_BOUNDS;
  return {
    ...cloneDeskTemplate(deskTemplate, department.id, bounds, index),
    id: deskId,
  };
}

function dependencyResultForDepartment(hierarchy, template, options = {}) {
  return validateRequiredTemplateDependencies({
    hierarchy,
    template,
    targetType: 'department',
    targetId: options.id || null,
  });
}

function dependencyResultForDesk(hierarchy, departmentId, template, options = {}) {
  return validateRequiredTemplateDependencies({
    hierarchy,
    template,
    targetType: 'desk',
    targetId: options.id || null,
    excludeDepartmentId: departmentId,
  });
}

export function addDepartmentFromTemplate(hierarchy = {}, templateId, options = {}) {
  const normalized = normalizeHierarchy(hierarchy);
  const template = resolveDepartmentTemplate(templateId);
  if (!template) {
    return {
      ok: false,
      reason: 'unknown-department-template',
      validation: { status: 'block', issues: [{ code: 'unknown-department-template', severity: 'block', dependencyType: 'template', requiredTemplateId: templateId, templateId: null, targetType: 'department', targetId: options.id || null }], blockers: [], warnings: [] },
      hierarchy: normalized,
    };
  }

  const usedIds = collectUsedIds(normalized.departments);
  const requestedId = String(options.id || '').trim();
  if (requestedId && usedIds.has(requestedId)) {
    return {
      ok: false,
      reason: 'duplicate-department-id',
      validation: { status: 'block', issues: [{ code: 'duplicate-department-id', severity: 'block', dependencyType: 'id', requiredTemplateId: null, templateId: template.id, targetType: 'department', targetId: requestedId }], blockers: [], warnings: [] },
      hierarchy: normalized,
    };
  }

  const departmentId = requestedId || uniqueId(`${template.id}-department`, usedIds);
  const validation = dependencyResultForDepartment(normalized, template, { id: departmentId });
  if (validation.status === 'block') {
    return {
      ok: false,
      reason: 'dependency-validation-blocked',
      validation,
      hierarchy: normalized,
    };
  }
  const department = buildDepartmentFromTemplate(template, departmentId, options);

  for (const desk of department.desks) {
    if (usedIds.has(desk.id)) {
      return {
        ok: false,
        reason: 'duplicate-desk-id',
        validation: { status: 'block', issues: [{ code: 'duplicate-desk-id', severity: 'block', dependencyType: 'id', requiredTemplateId: null, templateId: template.id, targetType: 'department', targetId: departmentId }], blockers: [], warnings: [] },
        hierarchy: normalized,
      };
    }
    usedIds.add(desk.id);
  }

  usedIds.add(departmentId);
  const nextHierarchy = {
    ...normalized,
    departments: [...normalized.departments, department],
  };

  return {
    ok: true,
    reason: null,
    validation,
    hierarchy: nextHierarchy,
    department,
  };
}

export function addDeskToDepartment(hierarchy = {}, departmentId, deskTemplateId, options = {}) {
  const normalized = normalizeHierarchy(hierarchy);
  const template = resolveDeskTemplate(deskTemplateId);
  if (!template) {
    return {
      ok: false,
      reason: 'unknown-desk-template',
      validation: { status: 'block', issues: [{ code: 'unknown-desk-template', severity: 'block', dependencyType: 'template', requiredTemplateId: deskTemplateId, templateId: null, targetType: 'desk', targetId: options.id || null }], blockers: [], warnings: [] },
      hierarchy: normalized,
    };
  }

  const departmentIndex = normalized.departments.findIndex((department) => department?.id === departmentId);
  if (departmentIndex === -1) {
    return {
      ok: false,
      reason: 'unknown-department',
      validation: { status: 'block', issues: [{ code: 'unknown-department', severity: 'block', dependencyType: 'parent', requiredTemplateId: null, templateId: template.id, targetType: 'desk', targetId: options.id || null }], blockers: [], warnings: [] },
      hierarchy: normalized,
    };
  }

  const usedIds = collectUsedIds(normalized.departments);
  const department = normalized.departments[departmentIndex];
  const requestedId = String(options.id || '').trim();
  if (requestedId && usedIds.has(requestedId)) {
    return {
      ok: false,
      reason: 'duplicate-desk-id',
      validation: { status: 'block', issues: [{ code: 'duplicate-desk-id', severity: 'block', dependencyType: 'id', requiredTemplateId: null, templateId: template.id, targetType: 'desk', targetId: requestedId }], blockers: [], warnings: [] },
      hierarchy: normalized,
    };
  }

  const deskId = requestedId || uniqueId(`${department.id}-${template.id}`, usedIds);
  if (usedIds.has(deskId)) {
    return {
      ok: false,
      reason: 'duplicate-desk-id',
      validation: { status: 'block', issues: [{ code: 'duplicate-desk-id', severity: 'block', dependencyType: 'id', requiredTemplateId: null, templateId: template.id, targetType: 'desk', targetId: deskId }], blockers: [], warnings: [] },
      hierarchy: normalized,
    };
  }

  const validation = dependencyResultForDesk(normalized, departmentId, template, { id: deskId });
  if (validation.status === 'block') {
    return {
      ok: false,
      reason: 'dependency-validation-blocked',
      validation,
      hierarchy: normalized,
    };
  }

  const desk = buildDeskForDepartment(department, template, deskId, department.desks.length);
  const nextDepartment = {
    ...department,
    desks: [...department.desks, desk],
  };
  const nextDepartments = [...normalized.departments];
  nextDepartments[departmentIndex] = nextDepartment;

  return {
    ok: true,
    reason: null,
    validation,
    hierarchy: {
      ...normalized,
      departments: nextDepartments,
    },
    department: nextDepartment,
    desk,
  };
}

export function validateStudioDependencies({ hierarchy = {}, action, templateId, departmentId = null, targetId = null } = {}) {
  if (action === 'add-department') {
    const template = resolveDepartmentTemplate(templateId);
    if (!template) {
      return buildValidationResult([makeDependencyIssue({
        code: 'unknown-department-template',
        severity: 'block',
        dependencyType: 'template',
        requiredTemplateId: templateId,
        templateId: null,
        targetType: 'department',
        targetId,
      })]);
    }
    return dependencyResultForDepartment(hierarchy, template, { id: targetId });
  }
  if (action === 'add-desk') {
    const template = resolveDeskTemplate(templateId);
    if (!template) {
      return buildValidationResult([makeDependencyIssue({
        code: 'unknown-desk-template',
        severity: 'block',
        dependencyType: 'template',
        requiredTemplateId: templateId,
        templateId: null,
        targetType: 'desk',
        targetId,
      })]);
    }
    return dependencyResultForDesk(hierarchy, departmentId, template, { id: targetId });
  }
  return buildValidationResult([makeDependencyIssue({
    code: 'unknown-action',
    severity: 'block',
    dependencyType: 'action',
    requiredTemplateId: null,
    templateId: templateId || null,
    targetType: action || null,
    targetId,
  })]);
}

export const studioMutationTemplates = {
  departments: STUDIO_DEPARTMENT_TEMPLATES,
  desks: STUDIO_DESK_TEMPLATES,
  room: { ...STUDIO_ROOM_BOUNDS },
};
