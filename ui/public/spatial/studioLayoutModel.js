import { STAFFING_RULES, computeTaGapModel } from './staffingRules.js';

export const STUDIO_SIZE = Object.freeze({
  width: 1200,
  height: 800,
});

export const STUDIO_ROOM = Object.freeze({
  x: 56,
  y: 72,
  width: 1088,
  height: 664,
});

export const STUDIO_DESK_SIZE = Object.freeze({
  width: 172,
  height: 140,
});

export const STUDIO_TEAM_BOARD_SIZE = Object.freeze({
  width: 584,
  height: 208,
});

export const STUDIO_ROOM_FIT_PADDING = 56;
export const CONTROL_CENTRE_DESK_ID = 'cto-architect';

const CORE_DEPARTMENTS = Object.freeze([
  { id: 'dept-intake', label: 'Intake', kind: 'intake', bounds: { x: 92, y: 108, width: 220, height: 238 }, deskIds: ['context-manager'], editable: false },
  { id: 'dept-delivery', label: 'Delivery', kind: 'delivery', bounds: { x: 334, y: 86, width: 514, height: 470 }, deskIds: ['planner', 'executor'], editable: true },
  { id: 'dept-quality', label: 'Quality', kind: 'quality', bounds: { x: 92, y: 394, width: 220, height: 232 }, deskIds: ['qa-lead'], editable: true },
  { id: 'dept-archive', label: 'Archive', kind: 'archive', bounds: { x: 454, y: 580, width: 312, height: 120 }, deskIds: ['memory-archivist'], editable: true },
  { id: 'dept-research', label: 'R&D / Research & Development', kind: 'research', bounds: { x: 808, y: 564, width: 292, height: 136 }, deskIds: ['rnd-lead'], editable: true, summary: 'Sandbox department for non-delivery research, experiments, and prototypes.' },
  { id: 'dept-control', label: 'Control Centre', kind: 'control', bounds: { x: 884, y: 286, width: 214, height: 254 }, deskIds: ['cto-architect'], editable: true },
  { id: 'dept-talent-acquisition', label: 'Talent Acquisition', kind: 'talent', bounds: { x: 850, y: 86, width: 250, height: 176 }, deskIds: ['integration_auditor'], editable: false },
]);

const CORE_DESKS = Object.freeze({
  'context-manager': { id: 'context-manager', label: 'Context Manager', departmentId: 'dept-intake', position: { x: 182, y: 252 }, type: 'intake', capabilities: ['context', 'triage'], editable: false, assignedAgentIds: ['context-manager'], visible: false, hidden: true, aliasOf: 'context', staffing: { seatKind: 'lead' } },
  planner: { id: 'planner', label: 'Planner', departmentId: 'dept-delivery', position: { x: 536, y: 252 }, type: 'delivery', capabilities: ['planning', 'queue'], editable: false, assignedAgentIds: ['planner'], staffing: { seatKind: 'lead' } },
  executor: { id: 'executor', label: 'Executor', departmentId: 'dept-delivery', position: { x: 682, y: 252 }, type: 'builder', capabilities: ['execution', 'output'], editable: false, assignedAgentIds: ['executor'], staffing: { seatKind: 'core' } },
  'qa-lead': { id: 'qa-lead', label: 'QA Lead', departmentId: 'dept-quality', position: { x: 182, y: 510 }, type: 'quality', capabilities: ['testing', 'verification'], editable: false, assignedAgentIds: ['qa-lead'], staffing: { seatKind: 'lead' } },
  'memory-archivist': { id: 'memory-archivist', label: 'Memory Archivist', departmentId: 'dept-archive', position: { x: 620, y: 640 }, type: 'archive', capabilities: ['context', 'history'], editable: false, assignedAgentIds: ['memory-archivist', 'dave'], staffing: { seatKind: 'lead' } },
  'rnd-lead': { id: 'rnd-lead', label: 'R&D Lead', departmentId: 'dept-research', position: { x: 954, y: 640 }, type: 'research', capabilities: ['research', 'experimentation', 'prototyping'], editable: false, assignedAgentIds: ['rnd-lead'], summary: 'Sandbox desk for non-delivery research and prototype work.', staffing: { seatKind: 'lead' } },
  'cto-architect': { id: 'cto-architect', label: 'CTO / Architect', departmentId: 'dept-control', position: { x: 990, y: 422 }, type: 'control', capabilities: ['oversight', 'guardrails'], editable: true, assignedAgentIds: ['cto-architect'], staffing: { seatKind: 'lead' } },
  integration_auditor: { id: 'integration_auditor', label: 'Integration Auditor', departmentId: 'dept-talent-acquisition', position: { x: 986, y: 174 }, type: 'talent', capabilities: ['coverage', 'hiring-demand', 'role-readiness'], editable: false, assignedAgentIds: ['integration_auditor'], staffing: { seatKind: 'lead' } },
});

const DEPARTMENT_TONES = Object.freeze({
  intake: 'intake',
  delivery: 'delivery',
  quality: 'quality',
  archive: 'archive',
  control: 'control',
  talent: 'support',
  research: 'research',
  support: 'support',
  integration: 'integration',
});

const DESK_TYPE_ACCENTS = Object.freeze({
  intake: { accent: '#6fd3ff', shadow: 'rgba(91, 180, 255, 0.28)' },
  delivery: { accent: '#ffd36b', shadow: 'rgba(255, 190, 88, 0.28)' },
  builder: { accent: '#72e1a7', shadow: 'rgba(114, 225, 167, 0.26)' },
  quality: { accent: '#ff8f7a', shadow: 'rgba(255, 143, 122, 0.28)' },
  archive: { accent: '#c8a0ff', shadow: 'rgba(200, 160, 255, 0.24)' },
  research: { accent: '#7de6d1', shadow: 'rgba(93, 173, 160, 0.24)' },
  control: { accent: '#ffb36c', shadow: 'rgba(255, 179, 108, 0.26)' },
  talent: { accent: '#8ee7c1', shadow: 'rgba(142, 231, 193, 0.24)' },
  analysis: { accent: '#7de6d1', shadow: 'rgba(125, 230, 209, 0.24)' },
  reporting: { accent: '#b9c6ff', shadow: 'rgba(185, 198, 255, 0.24)' },
  review: { accent: '#ff9eb4', shadow: 'rgba(255, 158, 180, 0.24)' },
  support: { accent: '#97d2ff', shadow: 'rgba(151, 210, 255, 0.24)' },
});

const ORG_STATUS_ORDER = Object.freeze({
  ready: 0,
  'optional hire': 1,
  understaffed: 2,
  blocked: 3,
  'missing lead': 4,
});

const ORG_HEALTH_ORDER = Object.freeze({
  active: 0,
  'support-only': 1,
  draft: 2,
  understaffed: 3,
  blocked: 4,
});

function normalizeRuntimeStatus(status = '') {
  return String(status || '').trim().toLowerCase();
}

function isRuntimeActive(status = '') {
  const normalized = normalizeRuntimeStatus(status);
  return Boolean(normalized) && !['idle', 'queued', 'unknown', 'offline', 'paused'].includes(normalized);
}

function summarizeDependencyWarnings(warnings = []) {
  const filtered = (Array.isArray(warnings) ? warnings : []).filter(Boolean);
  if (!filtered.length) return '';
  if (filtered.length === 1) return filtered[0];
  return `${filtered[0]} +${filtered.length - 1} more`;
}

function summarizeHealthReasons(reasons = []) {
  const filtered = (Array.isArray(reasons) ? reasons : []).map((reason) => String(reason || '').trim()).filter(Boolean);
  if (!filtered.length) return '';
  if (filtered.length === 1) return filtered[0];
  return `${filtered[0]} +${filtered.length - 1} more`;
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((entry) => String(entry || '').trim()).filter(Boolean))];
}

function buildStudioOrganizationModel(departments = [], desks = {}, controlCentreDeskId = CONTROL_CENTRE_DESK_ID) {
  const departmentRecords = Array.isArray(departments) ? departments : [];
  const deskRecords = desks && typeof desks === 'object' ? Object.values(desks) : [];
  const departmentsModel = Object.fromEntries(departmentRecords.map((department) => [department.id, {
    id: department.id,
    label: department.label,
    kind: department.kind,
    deskIds: uniqueStrings(department.deskIds || []),
    controlCentreDeskId: department.controlCentreDeskId || controlCentreDeskId,
    staffing: department.staffing || null,
  }]));
  const desksModel = Object.fromEntries(deskRecords.map((desk) => [desk.id, {
    id: desk.id,
    label: desk.label,
    departmentId: desk.departmentId,
    ownerDepartmentId: desk.departmentId,
    reportsToDeskId: desk.reportsToDeskId || controlCentreDeskId,
    assignedAgentIds: uniqueStrings(desk.assignedAgentIds || []),
    staffing: desk.staffing || null,
  }]));
  const agentsModel = {};

  deskRecords.forEach((desk) => {
    uniqueStrings(desk.assignedAgentIds || []).forEach((agentId) => {
      agentsModel[agentId] = {
        id: agentId,
        roleId: String(desk.staffing?.roleId || agentId).trim() || agentId,
        deskId: desk.id,
        departmentId: desk.departmentId,
        modelProfileId: agentId === 'planner'
          ? 'model-profile.planner-default'
          : `model-profile.default.${agentId}`,
      };
    });
  });

  return {
    departments: departmentsModel,
    desks: desksModel,
    agents: agentsModel,
    planner: {
      deskId: 'planner',
      roleId: 'planner',
      agentId: 'planner',
      modelProfileId: 'model-profile.planner-default',
    },
  };
}

function buildDefaultDepartmentStaffingRecord(definition = {}) {
  const deskIds = Array.isArray(definition.deskIds) ? definition.deskIds.map((entry) => String(entry || '').trim()).filter(Boolean) : [];
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
  const baselineRoleIds = [...new Set((staffing.baselineRoleIds || definition.baselineRoleIds || deskIds).map((entry) => String(entry || '').trim()).filter(Boolean))];
  const placeholderSeatIds = [...new Set((staffing.openSeatPlaceholderIds || definition.openSeatPlaceholderIds || baselineRoleIds).map((entry) => String(entry || '').trim()).filter(Boolean))];
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

function resolveEntityStatus(entry = null) {
  const openRoles = Array.isArray(entry?.openRoles) ? entry.openRoles : [];
  const blockers = Array.isArray(entry?.blockers) ? entry.blockers : [];
  if (openRoles.some((role) => role.kind === 'missing lead') || blockers.some((role) => role.kind === 'missing lead')) {
    return 'missing lead';
  }
  if (blockers.length) return 'blocked';
  if (openRoles.length) return 'understaffed';
  return 'ready';
}

function buildRuntimeWarnings({ liveStatus = '', unresolved = false, dependencyStatus = 'ready', dependencySummary = '' } = {}) {
  const warnings = [];
  const normalizedLiveStatus = normalizeRuntimeStatus(liveStatus);
  if (unresolved) warnings.push('Unresolved activity');
  if (normalizedLiveStatus === 'blocked' || normalizedLiveStatus === 'degraded') {
    warnings.push(`Runtime ${normalizedLiveStatus}`);
  }
  if (dependencyStatus === 'missing lead') {
    warnings.push('Control Centre lead missing');
  } else if (dependencyStatus === 'blocked') {
    warnings.push('Control Centre blocked');
  } else if (dependencyStatus === 'understaffed') {
    warnings.push('Control Centre understaffed');
  }
  if (dependencySummary) warnings.push(dependencySummary);
  return warnings;
}

function buildHealthRequirement({
  kind = 'dependency',
  code = '',
  reason = '',
  severity = 'warn',
  requiredId = null,
  requiredKind = null,
  shortfall = 0,
  source = '',
} = {}) {
  return {
    kind,
    code,
    reason,
    severity,
    requiredId,
    requiredKind,
    shortfall: Number(shortfall) || 0,
    source,
  };
}

function buildDepartmentHealthRecord({
  department = {},
  departmentDesks = [],
  coverageEntry = null,
  plannerCoverage = null,
  controlDesk = null,
  controlDeskStatus = '',
  blockedDeskCount = 0,
  missingDeskCount = 0,
} = {}) {
  const liveDeskCount = departmentDesks.filter((desk) => Boolean(desk.liveAgent)).length;
  const totalDeskCount = departmentDesks.length;
  const statusReasons = [];
  const missingRequirements = [];
  const staffingOpenRoles = Array.isArray(coverageEntry?.openRoles) ? coverageEntry.openRoles : [];
  const staffingBlockers = Array.isArray(coverageEntry?.blockers) ? coverageEntry.blockers : [];
  const plannerCoverageBlocked = Boolean(
    plannerCoverage
    && plannerCoverage.status === 'blocked'
    && Array.isArray(plannerCoverage.failedPredicates)
    && plannerCoverage.failedPredicates.length > 0
    && String(department.id || '').trim() === 'dept-delivery',
  );
  const hasControlBlocker = !controlDesk || !controlDesk.liveAgent || ['blocked', 'degraded'].includes(controlDeskStatus) || controlDesk.unresolved;
  const hasDependencyBlocker = hasControlBlocker || plannerCoverageBlocked || blockedDeskCount > 0 || staffingBlockers.length > 0 || staffingOpenRoles.some((entry) => entry.blocker);
  const isSupportDepartment = String(department.kind || '').trim().toLowerCase() === 'support';

  if (hasControlBlocker) {
    statusReasons.push('Control Centre lead missing or blocked.');
    missingRequirements.push(buildHealthRequirement({
      kind: 'dependency',
      code: 'missing-control-centre',
      severity: 'block',
      requiredId: department.controlCentreDeskId || CONTROL_CENTRE_DESK_ID,
      requiredKind: 'control',
      reason: 'Control Centre lead missing.',
      source: 'relationship',
    }));
  }
  if (blockedDeskCount > 0) {
    statusReasons.push(`${blockedDeskCount} desk${blockedDeskCount === 1 ? '' : 's'} blocked.`);
    missingRequirements.push(buildHealthRequirement({
      kind: 'dependency',
      code: 'blocked-child-desks',
      severity: 'block',
      shortfall: blockedDeskCount,
      reason: `${blockedDeskCount} desk${blockedDeskCount === 1 ? '' : 's'} blocked.`,
      source: 'relationship',
    }));
  }
  if (plannerCoverageBlocked) {
    const failedPredicateSummary = plannerCoverage.failedPredicates
      .map((predicate) => predicate.label || predicate.key)
      .filter(Boolean)
      .join('; ');
    statusReasons.push(failedPredicateSummary
      ? `Planner coverage is needed before the pipeline can continue. Failed predicates: ${failedPredicateSummary}.`
      : 'Planner coverage is needed before the pipeline can continue.');
  }
  staffingBlockers.forEach((entry) => {
    statusReasons.push(entry.kind === 'missing lead'
      ? `Missing lead: ${entry.roleLabel || entry.roleId || 'lead'}`
      : `${entry.roleLabel || entry.roleId || 'Role'} is blocked`);
    missingRequirements.push(buildHealthRequirement({
      kind: 'staffing',
      code: entry.kind === 'missing lead' ? 'missing-lead' : 'staffing-blocker',
      severity: 'block',
      requiredId: entry.roleId || null,
      requiredKind: entry.kind || null,
      shortfall: entry.shortfall || 1,
      reason: entry.kind === 'missing lead'
        ? `Missing lead role ${entry.roleLabel || entry.roleId || 'lead'}.`
        : `${entry.roleLabel || entry.roleId || 'Role'} is blocked.`,
      source: 'staffing',
    }));
  });
  staffingOpenRoles
    .filter((entry) => !entry.blocker)
    .forEach((entry) => {
      if (entry.kind === 'optional hire') {
        statusReasons.push(`Optional hire: ${entry.roleLabel || entry.roleId || 'role'}`);
        return;
      }
      statusReasons.push(`Missing ${entry.roleLabel || entry.roleId || 'role'}`);
      missingRequirements.push(buildHealthRequirement({
        kind: 'staffing',
        code: entry.kind === 'missing lead' ? 'missing-lead' : 'missing-role',
        severity: 'warn',
        requiredId: entry.roleId || null,
        requiredKind: entry.kind || null,
        shortfall: entry.shortfall || 1,
        reason: `Missing ${entry.roleLabel || entry.roleId || 'role'}.`,
        source: 'staffing',
      }));
    });

  let status = 'active';
  if (hasDependencyBlocker) {
    status = 'blocked';
  } else if (isSupportDepartment) {
    status = 'support-only';
    if (!statusReasons.length) {
      statusReasons.push('Support department operating in support-only mode.');
    }
  } else if (totalDeskCount === 0) {
    status = 'draft';
    statusReasons.push('Department is still in draft with no desks added.');
    missingRequirements.push(buildHealthRequirement({
      kind: 'structure',
      code: 'no-desks',
      severity: 'warn',
      shortfall: 1,
      reason: 'Department is still in draft with no desks added.',
      source: 'structure',
    }));
  } else if (liveDeskCount === 0) {
    status = 'understaffed';
    statusReasons.push('No live staffing assigned yet.');
    missingRequirements.push(buildHealthRequirement({
      kind: 'staffing',
      code: 'no-live-staffing',
      severity: 'warn',
      shortfall: totalDeskCount,
      reason: 'No live staffing assigned yet.',
      source: 'staffing',
    }));
  } else if (departmentDesks.some((desk) => !desk.liveAgent)) {
    status = 'understaffed';
    const unassignedCount = departmentDesks.filter((desk) => !desk.liveAgent).length;
    statusReasons.push(`${unassignedCount} desk${unassignedCount === 1 ? '' : 's'} still unassigned.`);
    missingRequirements.push(buildHealthRequirement({
      kind: 'staffing',
      code: 'unassigned-desks',
      severity: 'warn',
      shortfall: unassignedCount,
      reason: `${unassignedCount} desk${unassignedCount === 1 ? '' : 's'} still unassigned.`,
      source: 'staffing',
    }));
  } else if (missingRequirements.some((entry) => entry.severity !== 'block' && entry.code !== 'optional-hire')) {
    status = 'understaffed';
  }

  const severity = ORG_HEALTH_ORDER[status] ?? 0;
  const summary = summarizeHealthReasons(statusReasons);

  return {
    id: department.id,
    label: department.label,
    kind: department.kind,
    templateId: department.templateId,
    status,
    statusLabel: status,
    statusSeverity: severity,
    statusTone: status === 'blocked'
      ? 'bad'
      : (status === 'understaffed'
          ? 'warn'
          : (status === 'draft' ? 'thinking' : 'good')),
    summary,
    reasons: statusReasons,
    missingRequirements,
    missingRequirementCount: missingRequirements.length,
    staffing: {
      liveDeskCount,
      totalDeskCount,
      openRoleCount: staffingOpenRoles.filter((entry) => entry.blocker).length,
      optionalRoleCount: staffingOpenRoles.filter((entry) => !entry.blocker && entry.kind === 'optional hire').length,
      blockerCount: staffingBlockers.length,
    },
    dependency: {
      controlDeskId: department.controlCentreDeskId || CONTROL_CENTRE_DESK_ID,
      controlDeskStatus: controlDeskStatus || null,
      blockedDeskCount,
      missingDeskCount,
      dependencyBlocked: hasDependencyBlocker,
    },
    counts: {
      liveDeskCount,
      totalDeskCount,
      staffedDeskCount: liveDeskCount,
      missingDeskCount,
    },
    plannerCoverage: plannerCoverage || null,
    coverage: coverageEntry || null,
  };
}

export function buildStudioOrgHealthModel(layout = {}, agentSnapshots = []) {
  const normalized = normalizeStudioLayout(layout);
  const agentMap = Object.fromEntries((agentSnapshots || []).map((agent) => [agent.id, agent]));
  const desks = Object.values(normalized.desks).map((desk) => ({
    ...desk,
    liveAgent: agentMap[desk.id] || agentMap[(desk.assignedAgentIds || [])[0]] || null,
  }));
  const deskMap = Object.fromEntries(desks.map((desk) => [desk.id, desk]));
  const staffingCandidates = desks
    .filter((desk) => Boolean(desk.liveAgent))
    .map((desk) => ({
      id: `${desk.id}-snapshot`,
      name: desk.liveAgent?.name || desk.label,
      hiredDeskId: desk.id,
      deskTargets: [desk.id],
      assignedModel: desk.liveAgent?.model || '',
      contractLocked: true,
    }));
  const staffingGapModel = computeTaGapModel(STAFFING_RULES, staffingCandidates, { layout: normalized });
  const staffingCoverageByEntity = new Map(
    staffingGapModel.coverage.map((entry) => [`${entry.entityType}:${entry.entityId}`, entry]),
  );
  const departments = normalized.departments.map((department) => {
    const coverageEntry = staffingCoverageByEntity.get(`department:${department.id}`) || null;
    const departmentDesks = department.deskIds
      .map((deskId) => deskMap[deskId])
      .filter(Boolean);
    const blockedDesks = departmentDesks.filter((desk) => ['blocked', 'degraded'].includes(normalizeRuntimeStatus(desk.liveAgent?.status || desk.status)) || desk.unresolved);
    const controlDeskId = department.controlCentreDeskId || CONTROL_CENTRE_DESK_ID;
    const controlDesk = deskMap[controlDeskId] || null;
    const controlDeskStatus = normalizeRuntimeStatus(controlDesk?.liveAgent?.status || controlDesk?.status);
    const health = buildDepartmentHealthRecord({
      department,
      departmentDesks,
      coverageEntry,
      plannerCoverage: staffingGapModel.plannerCoverage || null,
      controlDesk,
      controlDeskStatus,
      blockedDeskCount: blockedDesks.length,
      missingDeskCount: departmentDesks.filter((desk) => !desk.liveAgent).length,
    });
    return {
      ...department,
      health,
      status: health.status,
      statusLabel: health.statusLabel,
      statusSeverity: health.statusSeverity,
      statusTone: health.statusTone,
      dependencyWarnings: [...health.reasons],
      dependencyWarningSummary: health.summary,
      dependencyWarningCount: health.reasons.length,
      occupiedDeskCount: departmentDesks.filter((desk) => Boolean(desk.liveAgent)).length,
      totalDeskCount: departmentDesks.length,
      staffedDeskCount: departmentDesks.filter((desk) => Boolean(desk.liveAgent)).length,
      gapModel: coverageEntry,
    };
  });
  const departmentMap = Object.fromEntries(departments.map((department) => [department.id, department]));
  const desksWithStatus = desks.map((desk) => {
    const department = departmentMap[desk.departmentId] || null;
    const liveStatus = normalizeRuntimeStatus(desk.liveAgent?.status || desk.status);
    const dependencyWarnings = [];
    if (!desk.liveAgent) {
      dependencyWarnings.push('No agent assigned');
    }
    if (department?.health?.status === 'blocked') {
      dependencyWarnings.push(department.health.summary || 'Department is blocked.');
    } else if (department?.health?.status === 'understaffed') {
      dependencyWarnings.push(department.health.summary || 'Department is understaffed.');
    } else if (department?.health?.status === 'draft') {
      dependencyWarnings.push(department.health.summary || 'Department is still in draft.');
    } else if (department?.health?.status === 'support-only') {
      dependencyWarnings.push(department.health.summary || 'Support-only department.');
    }
    return {
      ...desk,
      department,
      liveStatus,
      health: {
        status: department?.health?.status === 'blocked'
          ? 'blocked'
          : (department?.health?.status === 'understaffed' && !desk.liveAgent ? 'understaffed' : (department?.health?.status === 'support-only' ? 'support-only' : (desk.liveAgent ? 'active' : 'draft'))),
        statusLabel: department?.health?.status === 'blocked'
          ? 'blocked'
          : (department?.health?.status === 'understaffed' && !desk.liveAgent ? 'understaffed' : (department?.health?.status === 'support-only' ? 'support-only' : (desk.liveAgent ? 'active' : 'draft'))),
        reasons: dependencyWarnings,
        summary: summarizeHealthReasons(dependencyWarnings),
      },
      status: liveStatus || (desk.assignedAgentIds?.length ? 'idle' : 'queued'),
      statusLabel: department?.health?.status === 'blocked'
        ? 'blocked'
        : (department?.health?.status === 'understaffed' && !desk.liveAgent ? 'understaffed' : (department?.health?.status === 'support-only' ? 'support-only' : (desk.liveAgent ? 'active' : 'draft'))),
      dependencyWarnings,
      dependencyWarningSummary: summarizeDependencyWarnings(dependencyWarnings),
      dependencyWarningCount: dependencyWarnings.length,
      dependencyStatus: department?.health?.status || 'active',
      gapModel: staffingCoverageByEntity.get(`desk:${desk.id}`) || null,
      reportsToDesk: desk.reportsToDeskId ? deskMap[desk.reportsToDeskId] || null : null,
    };
  });
  const healthDepartments = departments.reduce((acc, department) => {
    acc[department.id] = department.health;
    return acc;
  }, {});
  const healthDesks = desksWithStatus.reduce((acc, desk) => {
    acc[desk.id] = desk.health;
    return acc;
  }, {});

  return {
    layout: normalized,
    staffing: staffingGapModel,
    departments,
    departmentMap,
    desks: desksWithStatus,
    deskMap: Object.fromEntries(desksWithStatus.map((desk) => [desk.id, desk])),
    healthByDepartmentId: healthDepartments,
    healthByDeskId: healthDesks,
    summary: {
      totalDepartments: departments.length,
      activeCount: departments.filter((entry) => entry.health.status === 'active').length,
      draftCount: departments.filter((entry) => entry.health.status === 'draft').length,
      understaffedCount: departments.filter((entry) => entry.health.status === 'understaffed').length,
      blockedCount: departments.filter((entry) => entry.health.status === 'blocked').length,
      supportOnlyCount: departments.filter((entry) => entry.health.status === 'support-only').length,
      missingRequirementCount: departments.reduce((sum, entry) => sum + (entry.health.missingRequirementCount || 0), 0),
    },
  };
}

export const DEFAULT_STUDIO_WHITEBOARDS = Object.freeze({
  teamBoard: Object.freeze({ x: 284, y: 88, width: 584, height: 208 }),
});

export const DEFAULT_STUDIO_DESK_LAYOUT = Object.freeze(Object.fromEntries(
  Object.entries(CORE_DESKS).map(([deskId, desk]) => [deskId, { ...desk.position }]),
));

function cloneJson(value, fallback) {
  if (value === undefined) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeBounds(bounds = {}, fallback = STUDIO_ROOM) {
  const source = bounds && typeof bounds === 'object' ? bounds : {};
  return {
    x: clamp(Number(source.x) || fallback.x, STUDIO_ROOM.x, STUDIO_ROOM.x + STUDIO_ROOM.width),
    y: clamp(Number(source.y) || fallback.y, STUDIO_ROOM.y, STUDIO_ROOM.y + STUDIO_ROOM.height),
    width: clamp(Number(source.width) || fallback.width, 180, STUDIO_ROOM.width),
    height: clamp(Number(source.height) || fallback.height, 110, STUDIO_ROOM.height),
  };
}

function departmentDeskSlots(bounds = {}) {
  const left = bounds.x + 90;
  const right = bounds.x + bounds.width - 90;
  const center = bounds.x + bounds.width / 2;
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

function normalizePosition(position = {}, bounds = STUDIO_ROOM, fallback = null) {
  const base = fallback || departmentDeskSlots(bounds)[0];
  return {
    x: clamp(Number(position.x) || base.x, bounds.x + 46, bounds.x + bounds.width - 46),
    y: clamp(Number(position.y) || base.y, bounds.y + 62, bounds.y + bounds.height - 34),
  };
}

function listDepartments(layout = {}) {
  if (Array.isArray(layout.departments)) return layout.departments;
  if (layout.departments && typeof layout.departments === 'object') return Object.values(layout.departments);
  return [];
}

function listDesks(layout = {}) {
  if (layout.desks && typeof layout.desks === 'object' && !Array.isArray(layout.desks)) {
    return Object.entries(layout.desks).map(([deskId, desk]) => ({ ...desk, id: desk?.id || deskId }));
  }
  if (Array.isArray(layout.desks)) return layout.desks;
  return [];
}

function legacyDeskPositions(layout = {}) {
  const source = layout?.desks && !Array.isArray(layout.desks) ? layout.desks : {};
  const map = {};
  Object.entries(source).forEach(([deskId, value]) => {
    if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'x') && !Object.prototype.hasOwnProperty.call(value, 'departmentId')) {
      map[deskId] = { x: Number(value.x), y: Number(value.y) };
    }
  });
  return map;
}

function cloneDepartment(department = {}) {
  return {
    ...department,
    bounds: { ...(department.bounds || {}) },
    deskIds: Array.isArray(department.deskIds) ? [...department.deskIds] : [],
    staffing: department.staffing ? {
      ...department.staffing,
      baselineRoleIds: Array.isArray(department.staffing.baselineRoleIds) ? [...department.staffing.baselineRoleIds] : [],
      openSeatPlaceholders: Array.isArray(department.staffing.openSeatPlaceholders)
        ? department.staffing.openSeatPlaceholders.map((entry) => ({ ...entry }))
        : [],
    } : null,
  };
}

function cloneDesk(desk = {}) {
  return {
    ...desk,
    position: { ...(desk.position || {}) },
    capabilities: Array.isArray(desk.capabilities) ? [...desk.capabilities] : [],
    assignedAgentIds: Array.isArray(desk.assignedAgentIds) ? [...desk.assignedAgentIds] : [],
    staffing: desk.staffing ? { ...desk.staffing } : null,
  };
}

function isVisibleDesk(desk = {}) {
  return desk.visible !== false && !desk.hidden;
}

export function createDefaultStudioLayout() {
  return {
    version: 'studio-layout.v1',
    size: { ...STUDIO_SIZE },
    room: { ...STUDIO_ROOM },
    bounds: { ...STUDIO_ROOM },
    whiteboards: {
      teamBoard: { ...DEFAULT_STUDIO_WHITEBOARDS.teamBoard },
    },
    controlCentreDeskId: CONTROL_CENTRE_DESK_ID,
    departments: CORE_DEPARTMENTS.map((department) => ({
      ...department,
      bounds: { ...department.bounds },
      deskIds: [...department.deskIds],
      staffing: buildDefaultDepartmentStaffingRecord(department),
      visible: true,
      controlCentreDeskId: CONTROL_CENTRE_DESK_ID,
    })),
    desks: Object.fromEntries(Object.entries(CORE_DESKS).map(([deskId, desk]) => [deskId, {
      ...desk,
      position: { ...desk.position },
      capabilities: [...desk.capabilities],
      assignedAgentIds: [...desk.assignedAgentIds],
      staffing: {
        roleId: deskId,
        seatKind: String(desk.staffing?.seatKind || 'core').trim() || 'core',
        placeholder: desk.staffing?.placeholder !== undefined ? Boolean(desk.staffing.placeholder) : true,
      },
      visible: desk.visible !== undefined ? Boolean(desk.visible) : true,
      hidden: Boolean(desk.hidden),
      aliasOf: String(desk.aliasOf || ''),
      reportsToDeskId: CONTROL_CENTRE_DESK_ID,
    }])),
  };
}

export const STUDIO_LAYOUT_SCHEMA = Object.freeze(cloneJson(createDefaultStudioLayout(), createDefaultStudioLayout()));

export function getStudioLayoutSchema() {
  return cloneJson(STUDIO_LAYOUT_SCHEMA, createDefaultStudioLayout());
}

export function getStudioDeskRecord(deskId = null, layout = null) {
  const normalized = normalizeStudioLayout(layout || {});
  const desk = normalized.desks?.[deskId] || null;
  return desk ? cloneDesk(desk) : null;
}

export function hasStudioDesk(layout = {}, deskId = '') {
  const normalized = normalizeStudioLayout(layout || {});
  return Boolean(normalized.desks[String(deskId || '').trim()]);
}

export function getStudioDepartmentForDesk(deskId = null, layout = null) {
  const normalized = normalizeStudioLayout(layout || {});
  const desk = normalized.desks?.[deskId] || null;
  if (!desk) return null;
  const department = normalized.departments.find((entry) => entry.id === desk.departmentId) || null;
  return department ? cloneDepartment(department) : null;
}

export function clampDeskPosition(position = {}, room = STUDIO_ROOM, fallbackPosition = DEFAULT_STUDIO_DESK_LAYOUT['context-manager']) {
  return normalizePosition(position, room, fallbackPosition);
}

function distanceSquared(a = {}, b = {}) {
  const dx = Number(a.x || 0) - Number(b.x || 0);
  const dy = Number(a.y || 0) - Number(b.y || 0);
  return (dx * dx) + (dy * dy);
}

function isSamePosition(a = {}, b = {}) {
  return Number(a.x) === Number(b.x) && Number(a.y) === Number(b.y);
}

export function snapDeskPositionToDepartment(position = {}, deskId = null, layout = null) {
  const normalized = normalizeStudioLayout(layout || {});
  const desk = normalized.desks?.[deskId] || null;
  if (!desk) {
    return clampDeskPosition(position, normalized.room, DEFAULT_STUDIO_DESK_LAYOUT['context-manager']);
  }
  const department = normalized.departments.find((entry) => entry.id === desk.departmentId) || normalized.departments[0] || null;
  if (!department) {
    return clampDeskPosition(position, normalized.room, desk.position || DEFAULT_STUDIO_DESK_LAYOUT['context-manager']);
  }
  const slots = departmentDeskSlots(department.bounds || normalized.room);
  const fallbackPosition = desk.position || slots[0] || DEFAULT_STUDIO_DESK_LAYOUT['context-manager'];
  const clamped = normalizePosition(position, department.bounds || normalized.room, fallbackPosition);
  const occupiedSlots = Object.values(normalized.desks)
    .filter((entry) => entry.id !== desk.id && entry.departmentId === department.id)
    .map((entry) => entry.position)
    .filter(Boolean);
  const availableSlots = slots.filter((slot) => !occupiedSlots.some((occupied) => isSamePosition(occupied, slot)));
  const candidateSlots = availableSlots.length ? availableSlots : slots;
  const bestSlot = candidateSlots.reduce((best, slot) => {
    if (!best) return slot;
    return distanceSquared(slot, clamped) < distanceSquared(best, clamped) ? slot : best;
  }, null);
  return bestSlot || clamped;
}

export function clampWhiteboardPosition(position = {}, room = STUDIO_ROOM) {
  return {
    x: clamp(Number(position.x) || DEFAULT_STUDIO_WHITEBOARDS.teamBoard.x, room.x + 16, room.x + room.width - STUDIO_TEAM_BOARD_SIZE.width - 16),
    y: clamp(Number(position.y) || DEFAULT_STUDIO_WHITEBOARDS.teamBoard.y, room.y + 16, room.y + room.height - STUDIO_TEAM_BOARD_SIZE.height - 16),
    width: DEFAULT_STUDIO_WHITEBOARDS.teamBoard.width,
    height: DEFAULT_STUDIO_WHITEBOARDS.teamBoard.height,
  };
}

export function resolveStudioRoomZoom(container, room = STUDIO_ROOM, padding = STUDIO_ROOM_FIT_PADDING) {
  if (!container) return 0.94;
  const availableWidth = Math.max(320, container.clientWidth - (padding * 2));
  const availableHeight = Math.max(240, container.clientHeight - (padding * 2));
  const fittedZoom = Math.min(
    availableWidth / Math.max(1, room.width),
    availableHeight / Math.max(1, room.height),
  );
  return clamp(Number(fittedZoom.toFixed(2)), 0.82, 1.9);
}

export function normalizeStudioLayout(layout = {}) {
  const defaults = createDefaultStudioLayout();
  const legacyPositions = legacyDeskPositions(layout);
  const departments = [];
  const departmentMap = {};

  defaults.departments.forEach((fallback) => {
    const source = listDepartments(layout).find((entry) => String(entry?.id || '').trim() === fallback.id) || {};
    const department = {
      ...fallback,
      ...source,
      id: fallback.id,
      label: String(source.label || fallback.label),
      kind: String(source.kind || fallback.kind),
      editable: source.editable !== undefined ? Boolean(source.editable) : Boolean(fallback.editable),
      visible: source.visible !== undefined ? Boolean(source.visible) : true,
      bounds: normalizeBounds(source.bounds || fallback.bounds, fallback.bounds),
      deskIds: Array.isArray(source.deskIds) ? source.deskIds.filter(Boolean) : [...fallback.deskIds],
      controlCentreDeskId: String(source.controlCentreDeskId || CONTROL_CENTRE_DESK_ID),
      slotId: source.slotId || fallback.slotId || null,
      summary: String(source.summary || ''),
      templateId: String(source.templateId || ''),
      staffing: buildDefaultDepartmentStaffingRecord({
        ...fallback,
        ...source,
        deskIds: Array.isArray(source.deskIds) ? source.deskIds.filter(Boolean) : [...fallback.deskIds],
        staffing: {
          ...(fallback.staffing || {}),
          ...(source.staffing || {}),
        },
      }),
    };
    departments.push(department);
    departmentMap[department.id] = department;
  });

  listDepartments(layout).forEach((entry) => {
    const departmentId = String(entry?.id || '').trim();
    if (!departmentId || departmentMap[departmentId]) return;
    const department = {
      id: departmentId,
      label: String(entry.label || departmentId),
      kind: String(entry.kind || 'support'),
      editable: entry.editable !== undefined ? Boolean(entry.editable) : true,
      visible: entry.visible !== undefined ? Boolean(entry.visible) : true,
      bounds: normalizeBounds(entry.bounds || STUDIO_ROOM, STUDIO_ROOM),
      deskIds: Array.isArray(entry.deskIds) ? entry.deskIds.filter(Boolean) : [],
      controlCentreDeskId: String(entry.controlCentreDeskId || CONTROL_CENTRE_DESK_ID),
      slotId: entry.slotId || null,
      summary: String(entry.summary || ''),
      templateId: String(entry.templateId || ''),
      staffing: buildDefaultDepartmentStaffingRecord({
        ...entry,
        deskIds: Array.isArray(entry.deskIds) ? entry.deskIds.filter(Boolean) : [],
      }),
    };
    departments.push(department);
    departmentMap[department.id] = department;
  });

  const desks = {};
  Object.values(CORE_DESKS).forEach((fallback) => {
    const source = listDesks(layout).find((entry) => String(entry?.id || '').trim() === fallback.id) || {};
    const department = departmentMap[source.departmentId || fallback.departmentId] || departmentMap[fallback.departmentId] || departments[0];
    desks[fallback.id] = {
      ...fallback,
      ...source,
      id: fallback.id,
      label: String(source.label || fallback.label),
      departmentId: source.departmentId || fallback.departmentId,
      type: String(source.type || fallback.type),
      capabilities: Array.isArray(source.capabilities) ? [...new Set(source.capabilities.filter(Boolean))] : [...fallback.capabilities],
      editable: source.editable !== undefined ? Boolean(source.editable) : Boolean(fallback.editable),
      assignedAgentIds: Array.isArray(source.assignedAgentIds) ? [...new Set(source.assignedAgentIds.filter(Boolean))] : [...fallback.assignedAgentIds],
      position: normalizePosition(source.position || legacyPositions[fallback.id] || source, department.bounds, fallback.position),
      reportsToDeskId: String(source.reportsToDeskId || CONTROL_CENTRE_DESK_ID),
      visible: source.visible !== undefined ? Boolean(source.visible) : (fallback.visible !== undefined ? Boolean(fallback.visible) : true),
      hidden: source.hidden !== undefined ? Boolean(source.hidden) : Boolean(fallback.hidden),
      aliasOf: String(source.aliasOf || fallback.aliasOf || ''),
      templateId: String(source.templateId || ''),
      staffing: {
        roleId: String(source.staffing?.roleId || fallback.staffing?.roleId || fallback.id || '').trim() || fallback.id,
        seatKind: String(source.staffing?.seatKind || fallback.staffing?.seatKind || 'core').trim() || 'core',
        placeholder: source.staffing?.placeholder !== undefined
          ? Boolean(source.staffing.placeholder)
          : (fallback.staffing?.placeholder !== undefined ? Boolean(fallback.staffing.placeholder) : true),
      },
    };
  });

  listDesks(layout).forEach((entry) => {
    const deskId = String(entry?.id || '').trim();
    if (!deskId || desks[deskId]) return;
    const department = departmentMap[entry.departmentId] || departments[0];
    desks[deskId] = {
      id: deskId,
      label: String(entry.label || deskId),
      departmentId: entry.departmentId || department.id,
      type: String(entry.type || 'support'),
      capabilities: Array.isArray(entry.capabilities) ? [...new Set(entry.capabilities.filter(Boolean))] : [],
      editable: entry.editable !== undefined ? Boolean(entry.editable) : true,
      assignedAgentIds: Array.isArray(entry.assignedAgentIds) ? [...new Set(entry.assignedAgentIds.filter(Boolean))] : [],
      position: normalizePosition(entry.position || legacyPositions[deskId] || entry, department.bounds, departmentDeskSlots(department.bounds)[Math.min((department.deskIds || []).length, 3)]),
      reportsToDeskId: String(entry.reportsToDeskId || CONTROL_CENTRE_DESK_ID),
      visible: entry.visible !== undefined ? Boolean(entry.visible) : true,
      hidden: Boolean(entry.hidden),
      aliasOf: String(entry.aliasOf || ''),
      templateId: String(entry.templateId || ''),
      staffing: {
        roleId: String(entry.staffing?.roleId || deskId).trim() || deskId,
        seatKind: String(entry.staffing?.seatKind || 'core').trim() || 'core',
        placeholder: entry.staffing?.placeholder !== undefined ? Boolean(entry.staffing.placeholder) : true,
      },
    };
  });

  departments.forEach((department) => {
    const memberIds = Object.values(desks)
      .filter((desk) => desk.departmentId === department.id)
      .map((desk) => desk.id);
    department.deskIds = [...new Set([...(department.deskIds || []), ...memberIds])].filter((deskId) => desks[deskId]?.departmentId === department.id);
  });

  const organization = buildStudioOrganizationModel(departments, desks, String(layout.controlCentreDeskId || CONTROL_CENTRE_DESK_ID));

  const staffingCandidates = Object.values(desks)
    .filter((desk) => Boolean(desk.liveAgent))
    .map((desk) => ({
      id: `${desk.id}-snapshot`,
      name: desk.liveAgent?.name || desk.label,
      hiredDeskId: desk.id,
      deskTargets: [desk.id],
      assignedModel: desk.liveAgent?.model || '',
      contractLocked: true,
    }));
  const staffingGapModel = computeTaGapModel(STAFFING_RULES, staffingCandidates, { layout: { organization } });
  const staffingCoverageByEntity = new Map(
    staffingGapModel.coverage.map((entry) => [`${entry.entityType}:${entry.entityId}`, entry]),
  );

  const enrichedDepartments = departments.map((department) => {
    const coverageEntry = staffingCoverageByEntity.get(`department:${department.id}`) || null;
    const departmentDesks = department.deskIds
      .map((deskId) => desks[deskId])
      .filter(Boolean);
    const blockedDesks = departmentDesks.filter((desk) => ['blocked', 'degraded'].includes(normalizeRuntimeStatus(desk.liveAgent?.status || desk.status)) || desk.unresolved);
    const missingDesks = departmentDesks.filter((desk) => !desk.liveAgent);
    const controlDeskId = department.controlCentreDeskId || CONTROL_CENTRE_DESK_ID;
    const controlDesk = desks[controlDeskId] || null;
    const controlDeskStatus = normalizeRuntimeStatus(controlDesk?.liveAgent?.status || controlDesk?.status);
    const dependencyWarnings = [];
    if (!controlDesk || !controlDesk.liveAgent || ['blocked', 'degraded'].includes(controlDeskStatus) || controlDesk.unresolved) {
      dependencyWarnings.push('Control Centre lead missing');
    }
    if (blockedDesks.length) {
      dependencyWarnings.push(`${blockedDesks.length} desk${blockedDesks.length === 1 ? '' : 's'} blocked`);
    }
    if (missingDesks.length) {
      dependencyWarnings.push(`${missingDesks.length} desk${missingDesks.length === 1 ? '' : 's'} understaffed`);
    }
    const status = resolveEntityStatus(coverageEntry);
    const severity = ORG_STATUS_ORDER[status] ?? 0;
    const warningsSummary = summarizeDependencyWarnings(dependencyWarnings);
    return {
      ...department,
      status,
      statusSeverity: severity,
      statusTone: status === 'missing lead'
        ? 'bad'
        : (status === 'blocked'
            ? 'bad'
            : (status === 'understaffed' ? 'warn' : 'good')),
      statusLabel: status === 'ready' ? 'ready' : status,
      dependencyWarnings,
      dependencyWarningSummary: warningsSummary,
      dependencyWarningCount: dependencyWarnings.length,
      occupiedDeskCount: departmentDesks.filter((desk) => Boolean(desk.liveAgent)).length,
      totalDeskCount: departmentDesks.length,
      staffedDeskCount: departmentDesks.filter((desk) => Boolean(desk.liveAgent)).length,
      gapModel: coverageEntry,
    };
  });

  const departmentMapWithStatus = Object.fromEntries(enrichedDepartments.map((department) => [department.id, department]));
  const enrichedDesks = Object.values(desks).map((desk) => {
    const coverageEntry = staffingCoverageByEntity.get(`desk:${desk.id}`) || null;
    const parentDesk = desk.reportsToDeskId ? desks[desk.reportsToDeskId] || null : null;
    const parentCoverage = parentDesk ? staffingCoverageByEntity.get(`desk:${parentDesk.id}`) || null : null;
    const dependencyWarnings = [];
    const liveStatus = normalizeRuntimeStatus(desk.liveAgent?.status || desk.status);
    if (!desk.liveAgent) {
      dependencyWarnings.push('No agent assigned');
    }
    if (parentDesk && (!isRuntimeActive(parentDesk.liveAgent?.status || parentDesk.status) || parentDesk.unresolved)) {
      dependencyWarnings.push(`Reports to ${parentDesk.label} blocked`);
    }
    const status = resolveEntityStatus(coverageEntry);
    if (status === 'understaffed' && liveStatus !== 'blocked' && liveStatus !== 'degraded') {
      dependencyWarnings.push('Staffing below floor');
    }
    const warningsSummary = summarizeDependencyWarnings(dependencyWarnings);
    return {
      ...desk,
      department: departmentMapWithStatus[desk.departmentId] || desk.department || null,
      visible: desk.visible !== false && !desk.hidden,
      liveStatus,
      orgStatus: status,
      statusSeverity: ORG_STATUS_ORDER[status] ?? 0,
      statusTone: status === 'missing lead'
        ? 'bad'
        : (status === 'blocked'
            ? 'bad'
            : (status === 'understaffed' ? 'warn' : 'good')),
      statusLabel: status === 'ready' ? 'ready' : status,
      dependencyWarnings,
      dependencyWarningSummary: warningsSummary,
      dependencyWarningCount: dependencyWarnings.length,
      dependencyStatus: parentCoverage ? resolveEntityStatus(parentCoverage) : 'ready',
      gapModel: coverageEntry,
      reportsToDesk: parentDesk || null,
    };
  });

  return {
    version: String(layout.version || defaults.version),
    size: { ...STUDIO_SIZE },
    room: normalizeBounds(layout.room || layout.bounds || defaults.room, defaults.room),
    bounds: normalizeBounds(layout.bounds || layout.room || defaults.bounds, defaults.bounds),
    whiteboards: {
      teamBoard: clampWhiteboardPosition(layout.whiteboards?.teamBoard || defaults.whiteboards.teamBoard, defaults.bounds),
    },
    controlCentreDeskId: String(layout.controlCentreDeskId || defaults.controlCentreDeskId || CONTROL_CENTRE_DESK_ID),
    departments: enrichedDepartments,
    desks: Object.fromEntries(enrichedDesks.map((desk) => [desk.id, desk])),
    organization,
  };
}

export function deskStagePoint(deskId, layout = null) {
  return getStudioDeskRecord(deskId, layout)?.position || DEFAULT_STUDIO_DESK_LAYOUT['context-manager'];
}

export function deskBounds(deskId, layout = null) {
  const center = deskStagePoint(deskId, layout);
  return {
    left: center.x - STUDIO_DESK_SIZE.width / 2,
    right: center.x + STUDIO_DESK_SIZE.width / 2,
    top: center.y - STUDIO_DESK_SIZE.height / 2,
    bottom: center.y + STUDIO_DESK_SIZE.height / 2,
    center,
  };
}

export function resolveDeskAnchor(fromDeskId, toDeskId, kind = 'workflow', layout = null) {
  const source = deskBounds(fromDeskId, layout);
  const target = deskBounds(toDeskId, layout);
  if (!source || !target) return null;
  const horizontal = Math.abs(target.center.x - source.center.x) >= Math.abs(target.center.y - source.center.y);
  const from = horizontal
    ? { x: target.center.x >= source.center.x ? source.right : source.left, y: source.center.y }
    : { x: source.center.x, y: target.center.y >= source.center.y ? source.bottom : source.top };
  const to = horizontal
    ? { x: target.center.x >= source.center.x ? target.left : target.right, y: target.center.y }
    : { x: target.center.x, y: target.center.y >= source.center.y ? target.top : target.bottom };
  return {
    from,
    to,
    bend: kind === 'handoff' ? 82 : kind === 'memory' ? 68 : 58,
    labelOffsetY: kind === 'conflict' ? -18 : -10,
  };
}

function fallbackThemeForDeskType(deskType = 'support') {
  return DESK_TYPE_ACCENTS[deskType] || DESK_TYPE_ACCENTS.support;
}

export function buildStudioRenderModel(layout = {}, agentSnapshots = []) {
  const orgHealth = buildStudioOrgHealthModel(layout, agentSnapshots);
  const normalized = orgHealth.layout;
  const departments = orgHealth.departments.map((department) => ({
    ...department,
    center: {
      x: department.bounds.x + department.bounds.width / 2,
      y: department.bounds.y + department.bounds.height / 2,
    },
    tone: DEPARTMENT_TONES[department.kind] || 'support',
  }));
  const departmentMap = Object.fromEntries(departments.map((department) => [department.id, department]));
  const allDesks = orgHealth.desks.map((desk) => {
    return {
      ...desk,
      department: departmentMap[desk.departmentId] || null,
      theme: desk.liveAgent?.theme || fallbackThemeForDeskType(desk.type),
      name: desk.liveAgent?.name || desk.label,
      shortLabel: desk.liveAgent?.shortLabel || desk.label,
      role: desk.liveAgent?.role || `${desk.type} desk`,
      focusSummary: desk.liveAgent?.focusSummary || (desk.capabilities?.length ? desk.capabilities.join(' / ') : 'No live workload surfaced yet.'),
      throughputLabel: desk.liveAgent?.throughputLabel || ((desk.assignedAgentIds || []).length ? `${desk.assignedAgentIds.length} assigned agent${desk.assignedAgentIds.length === 1 ? '' : 's'}` : 'No agent assigned'),
      latestSignal: desk.liveAgent?.latestSignal || (desk.editable ? 'Managed via approved templates' : 'Core desk'),
      isOversight: desk.liveAgent?.isOversight || desk.id === normalized.controlCentreDeskId || desk.type === 'control',
      activityPulse: desk.liveAgent?.activityPulse || false,
      unresolved: desk.liveAgent?.unresolved || false,
      thoughtBubble: desk.liveAgent?.deskSnapshot?.statusMessage || null,
    };
  });
  const desks = allDesks.filter((desk) => isVisibleDesk(desk));
  const deskMap = Object.fromEntries(allDesks.map((desk) => [desk.id, desk]));
  const controlCentreDepartment = departments.find((department) => department.deskIds.includes(normalized.controlCentreDeskId))
    || departments.find((department) => department.id === deskMap[normalized.controlCentreDeskId]?.departmentId)
    || null;
  const roomConnections = departments
    .filter((department) => department.id !== controlCentreDepartment?.id)
    .map((department) => ({
      id: `${department.id}-to-control`,
      from: department.center,
      to: controlCentreDepartment?.center || department.center,
      label: `${department.label} -> Control Centre`,
      tone: department.tone,
    }));
  return {
    layout: normalized,
    orgHealth,
    departments,
    departmentMap,
    desks,
    deskMap,
    allDesks,
    controlCentreDepartment,
    roomConnections,
  };
}
