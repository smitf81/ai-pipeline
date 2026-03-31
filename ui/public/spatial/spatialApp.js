import {
  GraphEngine,
  createNode,
  createEdge,
  buildStarterGraph,
  GRAPH_LAYERS,
  getNodeTypesForLayer,
  createDefaultRsgState,
  deriveRelationshipVisual,
  getSketchRepresentation,
  getWorldRepresentation,
  normalizeGraphBundle,
  buildRsgState,
} from './graphEngine.js';
import { AceConnector } from './aceConnector.js';
import { MutationEngine } from './mutationEngine.js';
import { ArchitectureMemory } from './architectureMemory.js';
import {
  buildStudioStatePayload,
  loadWorkspace,
  saveWorkspace,
  savePages,
  saveIntentState,
  saveStudioState,
  saveArchitectureMemory,
} from './persistence.js';
import { buildRosterSurfaceModel } from './rosterSurface.js';
import {
  clampUtilityWindowPosition,
  createDefaultUtilityWindowState,
  getDefaultUtilityWindowPosition,
  loadUtilityWindowsState,
  saveUtilityWindowsState,
} from './windowState.js';
import {
  SCENES,
  STUDIO_ZOOM_THRESHOLD,
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
  MAX_STUDIO_ZOOM,
  MIN_STUDIO_ZOOM,
  clamp,
  createDefaultCanvasViewport,
  createDefaultStudioViewport,
  sceneFromCanvasZoom,
} from './sceneState.js';
import {
  DEFAULT_WORLD_VIEW_MODE,
  WORLD_VIEW_MODES,
  describeWorldScaffoldNode,
  describeWorldScaffoldField,
  drawWorldScaffolds,
  findWorldScaffoldNodes,
  normalizeWorldViewMode,
} from './worldScaffoldView.js';
import {
  describeScaffoldFieldLayer,
  normalizeScaffoldFieldBundle,
} from './spatialFieldBridge.js';
import {
  STUDIO_SIZE,
  STUDIO_ROOM,
  STUDIO_DESK_SIZE,
  STUDIO_TEAM_BOARD_SIZE,
  CONTROL_CENTRE_DESK_ID,
  DEFAULT_STUDIO_WHITEBOARDS,
  clampDeskPosition,
  clampWhiteboardPosition,
  createDefaultStudioLayout,
  resolveStudioRoomZoom,
  normalizeStudioLayout,
  buildStudioRenderModel,
  deskStagePoint,
  snapDeskPositionToDepartment,
  resolveDeskAnchor,
  hasStudioDesk,
} from './studioLayoutModel.js';
import {
  advanceOrchestratorState,
  buildAgentSnapshots,
  createDefaultPage,
  createDefaultTeamBoard,
  createInitialComments,
  createPlannerHandoff,
  normalizeNotebookState,
  normalizeTeamBoardState,
} from './studioData.js';
import {
  ActionButton,
  buildActionPayload,
  runUiAction,
} from './uiActionRegistry.js';
import {
  buildMutationFeedback,
} from './studioMutationFeedback.js';
import {
  buildStudioQuickAccessStrip,
} from './studioQuickAccess.js';
import {
  buildResourceSignalModel,
  listDepartmentsByPriority,
} from './resourceSignalModel.js';

const { useEffect, useMemo, useRef, useState, useCallback } = React;
const h = React.createElement;

const STATUS_META = {
  idle: { badge: 'IDLE', tone: 'idle' },
  queued: { badge: 'QUEUE', tone: 'thinking' },
  processing: { badge: 'RUN', tone: 'processing' },
  blocked: { badge: 'BLOCK', tone: 'blocked' },
  degraded: { badge: 'DEGRADED', tone: 'review' },
  review: { badge: 'REVIEW', tone: 'review' },
  thinking: { badge: 'THINK', tone: 'thinking' },
  'needs review': { badge: 'REVIEW', tone: 'review' },
};
const ORG_STATUS_META = {
  active: { badge: 'ACTIVE', tone: 'good' },
  draft: { badge: 'DRAFT', tone: 'thinking' },
  'support-only': { badge: 'SUPPORT ONLY', tone: 'review' },
  understaffed: { badge: 'UNDERSTAFFED', tone: 'review' },
  blocked: { badge: 'BLOCKED', tone: 'blocked' },
  ready: { badge: 'READY', tone: 'good' },
  'optional hire': { badge: 'OPTIONAL HIRE', tone: 'review' },
  'missing lead': { badge: 'MISSING LEAD', tone: 'blocked' },
};
const DAVE_DEFAULT_MODEL = 'mistral:latest';
const DAVE_STATUS_OPTIONS = ['idle', 'queued', 'processing', 'blocked', 'degraded', 'review'];
const DAVE_RESPONSE_STATUSES = ['live', 'degraded_fallback', 'model_unavailable', 'timed_out', 'model_error'];

const NODE_LAYOUT = {
  outputAnchorX: 229,
  inputAnchorX: -1,
  anchorY: 74,
};

const EMPTY_INTENT_STATE = {
  latest: null,
  contextReport: null,
  byNode: {},
  reports: [],
};

const GRAPH_LAYER_TITLES = {
  system: 'System Graph',
  world: 'World Graph',
};
const NODE_ORIGINS = ['user_input', 'system_generated', 'agent_generated', 'agent_edited'];
const NODE_ORIGIN_DEFAULT = 'system_generated';
const NODE_ORIGIN_LABELS = {
  user_input: 'User input',
  system_generated: 'System',
  agent_generated: 'Agent suggestion',
  agent_edited: 'Agent edited',
};
const NODE_ORIGIN_FILTER_OPTIONS = [
  { value: 'all', label: 'All nodes' },
  ...NODE_ORIGINS.map((origin) => ({ value: origin, label: NODE_ORIGIN_LABELS[origin] || origin })),
];
export const RSG_IDLE_DELAY_MS = 1200;
const RSG_LOW_CONFIDENCE_THRESHOLD = 0.55;
const RSG_ACTIVITY_LIMIT = 24;
const PRIMARY_INTENT_ROUTE_SUMMARY = 'Canvas Intent -> interpretation -> evaluation -> mutation gate -> world state';
const PRIMARY_INTENT_REDIRECT_HINT = 'Primary world routing lives in Canvas Intent. Use Route Intent there.';
const SECONDARY_DRAFT_HINT = 'Secondary drafting only. Canvas Intent owns live world routing.';

const DESK_PROPERTY_BASE_TABS = [
  { id: 'hierarchy', label: 'Hierarchy' },
  { id: 'agents', label: 'Agents' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'tools', label: 'Tools (Modules)' },
  { id: 'reports', label: 'Reports (Tests)' },
];
const UTILITY_WINDOW_ORDER = ['cto-chat', 'environment', 'qa', 'context', 'reports', 'relationship', 'roster', 'studio-map', 'scorecards'];
const UTILITY_WINDOW_META = {
  'cto-chat': { title: 'CTO Chat', deskId: 'cto-architect' },
  environment: { title: 'Environment', deskId: 'cto-architect' },
  qa: { title: 'QA Workbench', deskId: 'qa-lead' },
  context: { title: 'Context Archive', deskId: 'memory-archivist' },
  reports: { title: 'Desk Reports', deskId: null },
  relationship: { title: 'Relationship Inspector', deskId: null },
  roster: { title: 'People Plan', deskId: null },
  'studio-map': { title: 'Studio Map', deskId: null },
  scorecards: { title: 'Scorecards', deskId: 'qa-lead' },
};

const CTO_CHAT_STATUS_META = {
  idle: { label: 'Idle', tone: 'idle' },
  live: { label: 'Live', tone: 'processing' },
  degraded: { label: 'Degraded', tone: 'review' },
  offline: { label: 'Offline', tone: 'blocked' },
  blocked: { label: 'Blocked', tone: 'blocked' },
  actionable: { label: 'Actionable', tone: 'processing' },
  advisory: { label: 'Advisory', tone: 'idle' },
  'model_error': { label: 'Model Error', tone: 'blocked' },
  'model_unavailable': { label: 'Offline', tone: 'blocked' },
  'timed_out': { label: 'Timed Out', tone: 'blocked' },
};

function normalizeCtoChatStatus(status = null) {
  const value = String(status || '').trim().toLowerCase();
  if (!value) return 'idle';
  if (value === 'model_unavailable') return 'offline';
  if (value === 'degraded_fallback') return 'degraded';
  return value;
}

function buildDefaultCtoChatStatus() {
  return {
    status: 'idle',
    backend: 'ollama',
    model: null,
    detail: 'Waiting for the live CTO backend.',
    checkedAt: null,
  };
}

function describeDeskValue(value) {
  if (value == null || value === false) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map((entry) => describeDeskValue(entry)).filter(Boolean).join(' | ');
  if (typeof value === 'object') {
    if (typeof value.summary === 'string' && value.summary.trim()) return value.summary;
    if (typeof value.detail === 'string' && value.detail.trim()) return value.detail;
    if (typeof value.label === 'string' && value.label.trim()) return value.label;
    if (typeof value.title === 'string' && value.title.trim()) return value.title;
    if (Array.isArray(value.slices) && value.slices.length) {
      return value.slices.map((entry) => describeDeskValue(entry)).filter(Boolean).join(' | ');
    }
  }
  return '';
}

function normalizeDeskEntries(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizeRenderObject(value = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeRenderList(value = []) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizeRenderText(value = '', fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

export function normalizeTruthPayload(truth = {}) {
  const source = normalizeRenderObject(truth);
  return {
      department: normalizeRenderText(source.department) || 'Desk truth',
    workload: {
      assignedTasks: Number(source.workload?.assignedTasks ?? 0) || 0,
      queueSize: Number(source.workload?.queueSize ?? 0) || 0,
      outputs: Number(source.workload?.outputs ?? 0) || 0,
    },
      throughput: normalizeRenderText(source.throughput) || 'No throughput signal',
    reports: normalizeRenderList(source.reports),
    scorecards: normalizeRenderList(source.scorecards),
    assessments: normalizeRenderList(source.assessments),
    guardrails: normalizeRenderList(source.guardrails),
    context: source.context && typeof source.context === 'object' ? source.context : source.context ?? null,
      plannerBrief: normalizeRenderText(source.plannerBrief),
      statement: normalizeRenderText(source.statement),
      intentType: normalizeRenderText(source.intentType),
      rawInput: normalizeRenderText(source.rawInput),
    requestedOutcomes: normalizeRenderList(source.requestedOutcomes),
    unresolved: normalizeRenderList(source.unresolved),
    evidence: normalizeRenderList(source.evidence),
  };
}

function normalizeQARunPayload(run = {}) {
  const source = normalizeRenderObject(run);
  const failedSteps = normalizeRenderList(source.failedSteps);
  const steps = normalizeRenderList(source.steps);
  const findings = normalizeRenderList(source.findings);
  return {
    id: normalizeRenderText(source.id, '') || null,
    scenario: normalizeRenderText(source.scenario, '') || null,
    mode: normalizeRenderText(source.mode, '') || null,
    trigger: normalizeRenderText(source.trigger, '') || null,
    status: normalizeRenderText(source.status, '') || null,
    verdict: normalizeRenderText(source.verdict, '') || null,
    error: normalizeRenderText(source.error, '') || null,
    createdAt: normalizeRenderText(source.createdAt, '') || null,
    finishedAt: normalizeRenderText(source.finishedAt, '') || null,
    findingCount: Number(source.findingCount ?? findings.length ?? 0) || 0,
    highestSeverity: normalizeRenderText(source.highestSeverity, '') || null,
    primaryScreenshot: source.primaryScreenshot && typeof source.primaryScreenshot === 'object' ? source.primaryScreenshot : null,
    stepSummary: normalizeRenderList(source.stepSummary),
    steps,
    findings,
    failedSteps,
    console: normalizeRenderList(source.console),
    network: normalizeRenderList(source.network),
  };
}

export function normalizeQAReportPayload(report = {}) {
  const source = normalizeRenderObject(report);
  return {
      status: normalizeRenderText(source.status) || 'idle',
      summary: normalizeRenderText(source.summary),
    desks: normalizeRenderList(source.desks),
    failures: normalizeRenderList(source.failures).map((failure) => normalizeRenderObject(failure)),
  };
}

function normalizeQAUnitGatePayload(unitGate = {}) {
  const source = normalizeRenderObject(unitGate);
  return {
    status: normalizeRenderText(source.status, 'pending'),
    passedCount: Number(source.passedCount ?? 0) || 0,
    totalChecks: Number(source.totalChecks ?? 0) || 0,
    failures: normalizeRenderList(source.failures).map((failure) => normalizeRenderObject(failure)),
  };
}

function normalizeQABootGatePayload(studioBootGate = {}) {
  const source = normalizeRenderObject(studioBootGate);
  return {
    verdict: normalizeRenderText(source.verdict, 'pending'),
    status: normalizeRenderText(source.status, 'pending'),
    findingCount: Number(source.findingCount ?? 0) || 0,
    consoleErrorCount: Number(source.consoleErrorCount ?? 0) || 0,
    networkFailureCount: Number(source.networkFailureCount ?? 0) || 0,
    failedSteps: normalizeRenderList(source.failedSteps).map((step) => normalizeRenderObject(step)),
  };
}

function normalizeQALocalGatePayload(localGate = {}) {
  const source = normalizeRenderObject(localGate);
  const unit = source.unit ? normalizeQAUnitGatePayload(source.unit) : null;
  const studioBoot = source.studioBoot ? normalizeQABootGatePayload(source.studioBoot) : null;
  return unit || studioBoot ? { unit, studioBoot } : null;
}

function normalizeQASectionPayload(section = {}) {
  const source = normalizeRenderObject(section);
  return {
    ...source,
    id: normalizeRenderText(source.id, '') || null,
    label: normalizeRenderText(source.label, '') || 'QA',
    kind: normalizeRenderText(source.kind, '') || null,
    emptyState: normalizeRenderText(source.emptyState, ''),
    summary: normalizeRenderText(source.summary, ''),
    suiteSummary: normalizeRenderText(source.suiteSummary, ''),
    structuredStatus: normalizeRenderText(source.structuredStatus, ''),
    structuredSummary: normalizeRenderText(source.structuredSummary, ''),
    busy: Boolean(source.busy),
    scorecardCount: Number(source.scorecardCount ?? 0) || 0,
    scorecardDeskCount: Number(source.scorecardDeskCount ?? 0) || 0,
    report: normalizeRenderObject(source.report),
    latestBrowserRun: normalizeQARunPayload(source.latestBrowserRun || source.latestRun || null),
    localGate: normalizeQALocalGatePayload(source.localGate || source.gate || null),
    cards: normalizeRenderList(source.cards),
    items: normalizeRenderList(source.items),
  };
}

export function normalizeRosterSurfacePayload(rosterSurfaceModel = {}) {
  const source = normalizeRenderObject(rosterSurfaceModel);
  const department = normalizeRenderObject(source.department);
  const summary = normalizeRenderObject(source.summary);
  const normalizeRosterEntity = (entry = {}) => {
    const entity = normalizeRenderObject(entry);
    return {
      ...entity,
      entityId: normalizeRenderText(entity.entityId, '') || entity.entityId || null,
      label: normalizeRenderText(entity.label, '') || 'Unnamed entity',
      health: normalizeRenderText(entity.health, '') || 'unknown',
      statusLabel: normalizeRenderText(entity.statusLabel, '') || 'covered',
      leadLabel: normalizeRenderText(entity.leadLabel, '') || 'n/a',
      entityType: normalizeRenderText(entity.entityType, '') || 'desk',
      assignedRoster: normalizeRenderList(entity.assignedRoster),
      assignedRoles: normalizeRenderList(entity.assignedRoles),
      roleCoverage: normalizeRenderList(entity.roleCoverage),
      roster: normalizeRenderList(entity.roster),
      openSeatCount: Number(entity.openSeatCount ?? 0) || 0,
    };
  };
  const normalizeRosterSignal = (entry = {}) => {
    const signal = normalizeRenderObject(entry);
    return {
      ...signal,
      id: normalizeRenderText(signal.id, '') || null,
      label: normalizeRenderText(signal.label, '') || 'Signal',
      kind: normalizeRenderText(signal.kind, '') || 'signal',
      scope: normalizeRenderText(signal.scope, '') || 'scope',
      suggestedHire: normalizeRenderText(signal.suggestedHire, '') || 'Suggested hire unavailable.',
      reasons: normalizeRenderList(signal.reasons),
      strandCount: Number(signal.strandCount ?? 0) || 0,
      blockerCount: Number(signal.blockerCount ?? 0) || 0,
      staffingGapCount: Number(signal.staffingGapCount ?? 0) || 0,
      weakRelationshipCount: Number(signal.weakRelationshipCount ?? 0) || 0,
      priorityScore: Number(signal.priorityScore ?? 0) || 0,
    };
  };
  const departments = normalizeRenderList(source.departments).map(normalizeRosterEntity);
  const desks = normalizeRenderList(source.desks).map(normalizeRosterEntity);
  const roster = normalizeRenderList(source.roster).map(normalizeRosterEntity);
  const openRoles = normalizeRenderList(source.openRoles).map((entry) => ({
    ...normalizeRenderObject(entry),
    blocker: Boolean(entry?.blocker),
    entityLabel: normalizeRenderText(entry?.entityLabel, '') || entry?.entityId || 'Unknown entity',
    entityType: normalizeRenderText(entry?.entityType, '') || 'desk',
    entityId: normalizeRenderText(entry?.entityId, '') || null,
    roleLabel: normalizeRenderText(entry?.roleLabel, '') || normalizeRenderText(entry?.roleId, '') || normalizeRenderText(entry?.kind, '') || 'open seat',
    roleId: normalizeRenderText(entry?.roleId, '') || null,
    kind: normalizeRenderText(entry?.kind, '') || 'open-seat',
    shortfall: Number(entry?.shortfall ?? 0) || 0,
    urgency: normalizeRenderText(entry?.urgency, '') || 'low',
  }));
  const blockers = normalizeRenderList(source.blockers);
  const hiringSignals = normalizeRenderList(source.hiringSignals).map(normalizeRosterSignal);
  const resourceSignals = normalizeRenderList(Array.isArray(source.resourceSignals) ? source.resourceSignals : listDepartmentsByPriority(source.resourceSignalModel))
    .map((entry) => ({
      ...normalizeRenderObject(entry),
      departmentId: normalizeRenderText(entry?.departmentId, '') || null,
      departmentLabel: normalizeRenderText(entry?.departmentLabel, '') || 'Department',
      resourcePressure: normalizeRenderText(entry?.resourcePressure, '') || 'unknown',
      reasonSummary: normalizeRenderList(entry?.reasonSummary),
      priorityScore: Number(entry?.priorityScore ?? 0) || 0,
      blockerCount: Number(entry?.blockerCount ?? 0) || 0,
      staffingGapCount: Number(entry?.staffingGapCount ?? 0) || 0,
      weakRelationshipCount: Number(entry?.weakRelationshipCount ?? 0) || 0,
    }));
  const activeDepartmentCards = departments.length ? departments : desks;
  return {
    department: {
        name: normalizeRenderText(department.name) || 'People Plan',
        summary: normalizeRenderText(department.summary) || 'Who we have and who we still need',
        updatedAt: normalizeRenderText(department.updatedAt) || 'just now',
    },
    summary: {
      urgency: normalizeRenderText(summary.urgency) || 'low',
      totalCoverage: Number(summary.totalCoverage ?? 0) || 0,
      healthyCount: Number(summary.healthyCount ?? 0) || 0,
      openEntityCount: Number(summary.openEntityCount ?? 0) || 0,
      openRoleCount: Number(summary.openRoleCount ?? 0) || 0,
      missingLeadCount: Number(summary.missingLeadCount ?? 0) || 0,
      blockerCount: Number(summary.blockerCount ?? 0) || 0,
      rosterCount: Number(summary.rosterCount ?? roster.length) || 0,
    },
    departments,
    desks,
    roster,
    openRoles,
    blockers,
    hiringSignals,
    resourceSignals,
    activeDepartmentCards,
  };
}

export function normalizeDeskSectionPayload(section = {}) {
  const source = normalizeRenderObject(section);
  const latestBrowserRun = source.latestBrowserRun || source.latestRun
    ? normalizeQARunPayload(source.latestBrowserRun || source.latestRun || null)
    : null;
  return {
    ...source,
      id: normalizeRenderText(source.id) || null,
      label: normalizeRenderText(source.label),
      kind: normalizeRenderText(source.kind),
      emptyState: normalizeRenderText(source.emptyState),
    value: source.value ?? null,
    truth: source.truth && typeof source.truth === 'object' ? source.truth : null,
    report: source.report && typeof source.report === 'object' ? normalizeQAReportPayload(source.report) : null,
    latestBrowserRun,
    latestRun: latestBrowserRun,
    localGate: source.localGate || source.gate ? normalizeQALocalGatePayload(source.localGate || source.gate || null) : null,
    gate: source.gate || source.localGate ? normalizeQALocalGatePayload(source.gate || source.localGate || null) : null,
    cards: normalizeRenderList(source.cards),
    items: normalizeRenderList(source.items),
    economy: normalizeRenderObject(source.economy),
    suiteSummary: normalizeRenderText(source.suiteSummary),
    structuredStatus: normalizeRenderText(source.structuredStatus),
    structuredSummary: normalizeRenderText(source.structuredSummary),
    busy: Boolean(source.busy),
    scorecardCount: Number(source.scorecardCount ?? 0) || 0,
    scorecardDeskCount: Number(source.scorecardDeskCount ?? 0) || 0,
  };
}

function normalizeDeskStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function getOrgStatusMeta(status = '') {
  return ORG_STATUS_META[String(status || 'ready').trim().toLowerCase()] || ORG_STATUS_META.ready;
}

function getOrgStatusClass(status = '') {
  return `org-${String(status || 'ready').trim().toLowerCase().replace(/\s+/g, '-')}`;
}

function buildDeskUtilityWindows(deskId = '') {
  const windows = [
    { id: 'reports', label: 'Desk Reports' },
  ];
  if (deskId === 'cto-architect') {
    windows.unshift({ id: 'environment', label: 'Environment' });
  }
  if (deskId === 'qa-lead') {
    windows.unshift({ id: 'scorecards', label: 'Scorecards' });
    windows.unshift({ id: 'qa', label: 'QA Workbench' });
  }
  if (deskId === 'memory-archivist' || deskId === 'context-manager') {
    windows.unshift({ id: 'context', label: 'Context Archive' });
  }
  return windows;
}

function buildDeskFocusSummary({
  deskId = '',
  deskLabel = '',
  panelData = null,
} = {}) {
  const truth = panelData?.truth && typeof panelData.truth === 'object' ? panelData.truth : {};
  const agents = normalizeDeskEntries(panelData?.agents);
  const tasks = normalizeDeskEntries(panelData?.tasks);
  const reports = normalizeDeskEntries(panelData?.reports);
  const liveAgents = Number.isFinite(truth.liveAgents)
    ? truth.liveAgents
    : agents.filter((agent) => {
        const status = normalizeDeskStatus(agent?.status || agent?.lifecycle);
        return Boolean(agent?.id) && !['idle', 'unknown', 'offline', 'paused'].includes(status);
      }).length;
  const assignedAgents = Number.isFinite(truth.assignedAgents)
    ? truth.assignedAgents
    : agents.length;
  const activeWork = Number.isFinite(truth.activeWork)
    ? truth.activeWork
    : tasks.filter((task) => normalizeDeskStatus(task?.lifecycle) === 'in_progress').length;
  const queueCount = Number.isFinite(truth.queueCount)
    ? truth.queueCount
    : Number.isFinite(truth.workload?.queueSize)
      ? truth.workload.queueSize
      : tasks.filter((task) => normalizeDeskStatus(task?.lifecycle) !== 'complete').length;
  const blockerEntries = normalizeDeskEntries(truth.blockers || truth.blockerList || []);
  const taskBlockers = tasks
    .filter((task) => normalizeDeskStatus(task?.lifecycle) === 'blocked')
    .map((task) => task?.title || task?.id || 'blocked task');
  const blockers = blockerEntries.length
    ? blockerEntries.map((entry) => describeDeskValue(entry)).filter(Boolean)
    : taskBlockers;
  const linkedWindows = buildDeskUtilityWindows(deskId);
  const reportCount = reports.length;
  const focusLabel = deskLabel || deskId || 'Desk';
  const blockerSummary = blockers.length ? blockers.slice(0, 3).join(' | ') : 'none';
  return {
    liveAgents,
    assignedAgents,
    activeWork,
    queueCount,
    blockers,
    blockerCount: blockers.length,
    linkedReports: reportCount,
    linkedWindows,
    summary: `Agents ${liveAgents}/${assignedAgents} | Active ${activeWork} | Queue ${queueCount} | Blockers ${blockerSummary} | Reports ${reportCount} | Windows ${linkedWindows.map((window) => window.label).join(' / ') || 'none'}`,
    detail: `${focusLabel} focus | ${blockers.length ? `${blockers.length} blocker${blockers.length === 1 ? '' : 's'} surfaced` : 'no blockers surfaced'} | ${reportCount} report${reportCount === 1 ? '' : 's'} linked`,
  };
}

function getDeskPropertyTabs(deskId = null) {
  return deskId === 'qa-lead'
    ? [{ id: 'qa', label: 'QA' }, ...DESK_PROPERTY_BASE_TABS]
    : DESK_PROPERTY_BASE_TABS;
}

function normalizeDeskHierarchyDraft(draft = {}) {
  return {
    departments: Array.isArray(draft.departments) ? draft.departments.filter(Boolean) : [],
    desks: Array.isArray(draft.desks) ? draft.desks.filter(Boolean) : [],
    recruits: Array.isArray(draft.recruits) ? draft.recruits.filter(Boolean) : [],
    assessments: Array.isArray(draft.assessments) ? draft.assessments.filter(Boolean) : [],
    contexts: Array.isArray(draft.contexts) ? draft.contexts.filter(Boolean) : [],
    guardrails: Array.isArray(draft.guardrails) ? draft.guardrails.filter(Boolean) : [],
  };
}

const EMPTY_DESK_MANAGEMENT_DRAFT = {
  recruit: {
    agentId: '',
    traits: '',
    role: '',
  },
  assessment: {
    testId: '',
    notes: '',
  },
  context: {
    summary: '',
    detail: '',
  },
  guardrails: {
    summary: '',
    detail: '',
  },
};

export function normalizeDeskManagementDraft(draft = {}) {
  const source = draft && typeof draft === 'object' ? draft : {};
  return {
    recruit: {
      ...EMPTY_DESK_MANAGEMENT_DRAFT.recruit,
      ...(source.recruit && typeof source.recruit === 'object' ? source.recruit : {}),
    },
    assessment: {
      ...EMPTY_DESK_MANAGEMENT_DRAFT.assessment,
      ...(source.assessment && typeof source.assessment === 'object' ? source.assessment : {}),
    },
    context: {
      ...EMPTY_DESK_MANAGEMENT_DRAFT.context,
      ...(source.context && typeof source.context === 'object' ? source.context : {}),
    },
    guardrails: {
      ...EMPTY_DESK_MANAGEMENT_DRAFT.guardrails,
      ...(source.guardrails && typeof source.guardrails === 'object' ? source.guardrails : {}),
    },
  };
}

export function updateDeskManagementDraft(setter, deskId, updater) {
  if (!deskId) return;
  setter((current) => {
    const existing = normalizeDeskManagementDraft(current?.[deskId]);
    const nextValue = typeof updater === 'function' ? updater(existing) : updater;
    const nextDraft = normalizeDeskManagementDraft(nextValue || existing);
    return {
      ...current,
      [deskId]: nextDraft,
    };
  });
}

export function clearDeskManagementDraft(setter, deskId) {
  if (!deskId) return;
  setter((current) => {
    if (!current?.[deskId]) return current;
    const next = { ...current };
    delete next[deskId];
    return next;
  });
}

export function clearDeskManagementDraftSection(setter, deskId, section) {
  if (!deskId || !section) return;
  setter((current) => {
    const existing = normalizeDeskManagementDraft(current?.[deskId]);
    if (section !== 'recruit' && section !== 'assessment' && section !== 'context' && section !== 'guardrails') return current;
    const nextDraft = {
      ...existing,
      [section]: { ...EMPTY_DESK_MANAGEMENT_DRAFT[section] },
    };
    const next = { ...current, [deskId]: nextDraft };
    return next;
  });
}

export function buildDeskHierarchyModel({
  deskId = '',
  deskLabel = '',
  targetDeskId = '',
  targetDeskLabel = '',
  panelData = null,
  isCtoEdit = false,
  draft = {},
} = {}) {
  const normalizedDraft = normalizeDeskHierarchyDraft(draft);
  const desk = panelData?.desk || {};
  const agents = Array.isArray(panelData?.agents) ? panelData.agents : [];
  const tasks = Array.isArray(panelData?.tasks) ? panelData.tasks : [];
  const modules = Array.isArray(panelData?.modules) ? panelData.modules : [];
  const reports = Array.isArray(panelData?.reports) ? panelData.reports : [];
  const truth = panelData?.truth || {};
  const activeDeskLabel = targetDeskLabel || deskLabel || targetDeskId || deskId || 'Desk';
  const departmentLabel = isCtoEdit ? 'CTO Desk' : `${activeDeskLabel} Department`;
  const focusSummary = buildDeskFocusSummary({
    deskId: targetDeskId || deskId,
    deskLabel: activeDeskLabel,
    panelData,
  });
  return {
    managedDeskId: targetDeskId || deskId,
    managedDeskLabel: activeDeskLabel,
    departmentLabel,
    departmentDetail: isCtoEdit
      ? 'Cross-desk governance, scoped edits, and managed desk selection.'
      : `Scoped local context for ${activeDeskLabel}.`,
    deskLabel: activeDeskLabel,
    deskDetail: `State ${desk.localState || 'idle'} | Goal ${desk.currentGoal || 'No current goal'} | Workload ${truth.workload ? `${truth.workload.assignedTasks || 0}/${truth.workload.queueSize || 0}` : 'n/a'}`,
    deskMission: describeDeskValue(desk.mission || truth.context || null) || null,
    focusSummary,
    managementSummary: isCtoEdit
      ? `Managing ${activeDeskLabel} from CTO Desk`
      : `Managing ${activeDeskLabel}`,
    managementDetail: isCtoEdit
      ? `Drafts and actions stay scoped to ${activeDeskLabel}.`
      : `This panel only affects ${activeDeskLabel}.`,
    counts: {
      departments: normalizedDraft.departments.length,
      desks: normalizedDraft.desks.length,
      recruits: normalizedDraft.recruits.length,
      assessments: normalizedDraft.assessments.length,
      agents: agents.length,
      tasks: tasks.length,
      modules: modules.filter((module) => module?.assigned).length,
      reports: reports.length,
      contexts: Array.isArray(truth.context?.slices) ? truth.context.slices.length : 0,
      guardrails: Array.isArray(truth.guardrails) ? truth.guardrails.length : 0,
    },
    departments: normalizedDraft.departments,
    desks: normalizedDraft.desks,
    recruits: normalizedDraft.recruits,
    assessments: normalizedDraft.assessments,
    contexts: normalizedDraft.contexts,
    guardrails: normalizedDraft.guardrails,
    truth,
    agents: agents.map((entry) => ({
      ...entry,
      summary: `${entry.id} | Status: ${entry.status || 'idle'} | ${entry.backend || 'backend n/a'} ${entry.model || ''}`.trim(),
      currentTaskSummary: entry.currentTask
        ? `${entry.currentTask.title} | ${entry.currentTask.lifecycle} | ${entry.currentTask.progress?.label || 'n/a'}`
        : 'No current task assigned',
    })),
    tasks: tasks.map((task) => ({
      ...task,
      summary: `${task.lifecycle || 'planned'} | ${task.progress?.label || 'n/a'} | source ${task.source || 'n/a'}`,
    })),
    modules: modules.map((module) => ({
      ...module,
      summary: `${module.version || 'unknown'} | ${module.manifestPath || 'n/a'}`,
    })),
    reports: reports.map((report) => ({
      ...report,
      summary: `${report.type || 'report'} | ${report.source || 'local'}${report.detail ? ` | ${report.detail}` : ''}`,
    })),
  };
}

function updateDeskHierarchyDraft(setter, targetDeskId, updater) {
  setter((current) => {
    const existing = normalizeDeskHierarchyDraft(current?.[targetDeskId] || {});
    return {
      ...current,
      [targetDeskId]: normalizeDeskHierarchyDraft(updater(existing) || existing),
    };
  });
}

const EMPTY_HANDOFFS = {
  contextToPlanner: null,
  history: [],
};

const EMPTY_ORCHESTRATOR_STATE = {
  status: 'idle',
  lastTickAt: null,
  activeDeskIds: [],
  conflicts: [],
  pendingUserActions: [],
  desks: {},
  activePageId: null,
};

const EMPTY_SELF_UPGRADE = {
  status: 'idle',
  targetProjectKey: 'ace-self',
  taskId: '',
  patchReview: null,
  preflight: {
    status: 'idle',
    ok: null,
    checkedAt: null,
    checks: [],
    summary: 'Run preflight before applying a self patch.',
  },
  apply: {
    status: 'idle',
    ok: null,
    appliedAt: null,
    branch: null,
    commit: null,
    taskId: '',
  },
  deploy: {
    status: 'idle',
    requestedAt: null,
    restartedAt: null,
    health: {
      status: 'ready',
      pid: null,
      startedAt: null,
    },
  },
  requiresPermission: 'none',
};

const EMPTY_TEAM_BOARD = createDefaultTeamBoard();

const EMPTY_SERVER_HEALTH = {
  ok: false,
  pid: null,
  startedAt: null,
  safeMode: false,
  bootHealth: {
    checked: false,
    ok: true,
    safeMode: false,
    reason: '',
    checkedAt: null,
    stateShape: null,
  },
  selfUpgrade: {
    status: 'idle',
    deploy: {
      status: 'idle',
      health: {
        status: 'ready',
        pid: null,
        startedAt: null,
      },
    },
  },
};

const SPATIAL_SAFE_MODE_SESSION_KEY = 'ace.spatial.safeMode';
const SPATIAL_SAFE_MODE_REASON_SESSION_KEY = 'ace.spatial.safeModeReason';
const EMPTY_BOOT_HEALTH = {
  checked: false,
  ok: true,
  safeMode: false,
  reason: '',
  checkedAt: null,
  stateShape: null,
};

const EMPTY_SAFE_MODE_SNAPSHOT = {
  safeMode: true,
  reason: '',
  checkedAt: null,
  bootHealth: EMPTY_BOOT_HEALTH,
  health: EMPTY_SERVER_HEALTH,
  criticalErrors: [],
  recentQaResults: [],
  latestQARun: null,
  localGate: {
    unit: null,
    studioBoot: null,
  },
  failingTestNames: [],
  failureHistory: {
    updated_at: null,
    entries: [],
  },
  artifactRefs: [],
};

function getSpatialSessionStorage() {
  try {
    return window.sessionStorage || null;
  } catch {
    return null;
  }
}

function readSpatialSafeModeSession() {
  const storage = getSpatialSessionStorage();
  if (!storage) return false;
  try {
    return storage.getItem(SPATIAL_SAFE_MODE_SESSION_KEY) === 'true';
  } catch {
    return false;
  }
}

function readSpatialSafeModeReasonSession() {
  const storage = getSpatialSessionStorage();
  if (!storage) return '';
  try {
    return String(storage.getItem(SPATIAL_SAFE_MODE_REASON_SESSION_KEY) || '').trim();
  } catch {
    return '';
  }
}

function writeSpatialSafeModeSession(safeMode = false, reason = '') {
  const storage = getSpatialSessionStorage();
  if (!storage) return;
  try {
    if (safeMode) {
      storage.setItem(SPATIAL_SAFE_MODE_SESSION_KEY, 'true');
      storage.setItem(SPATIAL_SAFE_MODE_REASON_SESSION_KEY, String(reason || '').trim());
      return;
    }
    storage.removeItem(SPATIAL_SAFE_MODE_SESSION_KEY);
    storage.removeItem(SPATIAL_SAFE_MODE_REASON_SESSION_KEY);
  } catch {
    // session storage is a best-effort convenience
  }
}

function normalizeSafeModeList(value = []) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizeSafeModeSnapshot(snapshot = null) {
  const source = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const health = source.health && typeof source.health === 'object' ? source.health : EMPTY_SERVER_HEALTH;
  const bootHealth = source.bootHealth && typeof source.bootHealth === 'object' ? source.bootHealth : health.bootHealth || EMPTY_BOOT_HEALTH;
  const localGate = source.localGate && typeof source.localGate === 'object'
    ? source.localGate
    : EMPTY_SAFE_MODE_SNAPSHOT.localGate;
  const failureHistory = source.failureHistory && typeof source.failureHistory === 'object'
    ? source.failureHistory
    : EMPTY_SAFE_MODE_SNAPSHOT.failureHistory;
  return {
    ...EMPTY_SAFE_MODE_SNAPSHOT,
    ...source,
    safeMode: Boolean(source.safeMode || health.safeMode || bootHealth.safeMode),
    reason: String(source.reason || bootHealth.reason || '').trim(),
    checkedAt: source.checkedAt || bootHealth.checkedAt || null,
    bootHealth: {
      ...EMPTY_BOOT_HEALTH,
      ...bootHealth,
    },
    health: {
      ...EMPTY_SERVER_HEALTH,
      ...health,
      bootHealth: {
        ...EMPTY_BOOT_HEALTH,
        ...(health.bootHealth || bootHealth || {}),
      },
    },
    criticalErrors: normalizeSafeModeList(source.criticalErrors).map((entry) => (entry && typeof entry === 'object'
      ? entry
      : { source: 'unknown', message: String(entry || '') })).filter(Boolean),
    recentQaResults: normalizeSafeModeList(source.recentQaResults),
    latestQARun: source.latestQARun && typeof source.latestQARun === 'object' ? source.latestQARun : null,
    localGate: {
      ...EMPTY_SAFE_MODE_SNAPSHOT.localGate,
      ...localGate,
    },
    failingTestNames: normalizeSafeModeList(source.failingTestNames).map((entry) => String(entry || '').trim()).filter(Boolean),
    failureHistory: {
      ...EMPTY_SAFE_MODE_SNAPSHOT.failureHistory,
      ...failureHistory,
      entries: normalizeSafeModeList(failureHistory.entries).map((entry) => (entry && typeof entry === 'object' ? entry : null)).filter(Boolean),
    },
    artifactRefs: normalizeSafeModeList(source.artifactRefs).map((entry) => String(entry || '').trim()).filter(Boolean),
  };
}

function buildSafeModeInitialSnapshot({ health = EMPTY_SERVER_HEALTH, reason = '', snapshot = null } = {}) {
  const baseSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : {};
  return normalizeSafeModeSnapshot({
    ...baseSnapshot,
    safeMode: true,
    reason: String(baseSnapshot.reason || reason || health.bootHealth?.reason || '').trim(),
    health,
    bootHealth: health?.bootHealth || EMPTY_BOOT_HEALTH,
  });
}

async function fetchSafeModeSnapshot() {
  const response = await fetch('/api/spatial/safe-mode/status');
  if (!response.ok) {
    throw new Error(`Safe-mode status request failed with ${response.status}.`);
  }
  const payload = await response.json();
  return normalizeSafeModeSnapshot(payload?.snapshot || payload);
}

function renderSafeModeListSection({ title, emptyState, items = [], renderItem = null, dataQa = '' }) {
  const normalizedItems = normalizeSafeModeList(items);
  return h('div', { className: 'utility-window-section', 'data-qa': dataQa || undefined },
    h('div', { className: 'inspector-label' }, title),
    normalizedItems.length
      ? h('div', { className: 'criteria-list' },
          normalizedItems.map((item, index) => (
            typeof renderItem === 'function'
              ? renderItem(item, index)
              : h('div', { className: 'criteria-row', key: `${title}-${index}` },
                  h('span', null, String(item || '')),
                  h('span', { className: 'muted' }, ''),
                )
          )))
      : h('div', { className: 'signal-empty muted' }, emptyState),
  );
}

export function evaluateSpatialBootHealthSnapshot(health = null) {
  const resolvedHealth = health && typeof health === 'object' ? health : {};
  const selfUpgradeHealth = resolvedHealth.selfUpgrade?.deploy?.health || null;
  const bootHealth = resolvedHealth.bootHealth && typeof resolvedHealth.bootHealth === 'object'
    ? resolvedHealth.bootHealth
    : EMPTY_BOOT_HEALTH;
  const shapeOk = Boolean(
    typeof resolvedHealth.ok === 'boolean'
      && typeof resolvedHealth.pid === 'number'
      && typeof resolvedHealth.startedAt === 'string'
      && resolvedHealth.selfUpgrade
      && typeof resolvedHealth.selfUpgrade === 'object'
      && resolvedHealth.selfUpgrade.deploy
      && typeof resolvedHealth.selfUpgrade.deploy === 'object'
      && selfUpgradeHealth
      && typeof selfUpgradeHealth === 'object'
      && typeof selfUpgradeHealth.status === 'string'
      && typeof bootHealth.checked === 'boolean'
      && typeof bootHealth.safeMode === 'boolean',
  );
  const safeMode = Boolean(resolvedHealth.safeMode) || Boolean(bootHealth.safeMode) || !shapeOk;
  const reason = String(bootHealth.reason || resolvedHealth.reason || '').trim()
    || (shapeOk ? '' : 'Spatial health payload shape mismatch.');
  return {
    checked: true,
    ok: shapeOk && !safeMode,
    safeMode,
    reason,
    health: {
      ...EMPTY_SERVER_HEALTH,
      ...resolvedHealth,
      safeMode,
      bootHealth: {
        ...EMPTY_BOOT_HEALTH,
        ...bootHealth,
        safeMode,
        reason,
      },
    },
  };
}

export function SafeShell({
  health = EMPTY_SERVER_HEALTH,
  reason = '',
  initialSnapshot = null,
  onReturnNormalMode = null,
} = {}) {
  const [snapshot, setSnapshot] = useState(() => buildSafeModeInitialSnapshot({
    health,
    reason,
    snapshot: initialSnapshot,
  }));
  const [actionState, setActionState] = useState({ busy: null, message: '', error: '' });
  const mountedRef = useRef(true);

  async function refreshSafeModeSnapshot() {
    try {
      const nextSnapshot = await fetchSafeModeSnapshot();
      if (mountedRef.current) {
        setSnapshot(nextSnapshot);
      }
      return nextSnapshot;
    } catch (error) {
      if (mountedRef.current) {
        setActionState((current) => ({
          ...current,
          error: String(error.message || error),
        }));
      }
      return null;
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    refreshSafeModeSnapshot();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function runSafeModeAction(actionId, endpoint, busyLabel) {
    setActionState({ busy: actionId, message: busyLabel || '', error: '' });
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ snapshot }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || payload.message || `Safe-mode action failed with ${response.status}.`);
      }
      const nextSnapshot = normalizeSafeModeSnapshot(payload.snapshot || payload.diagnosis || payload);
      if (mountedRef.current) {
        setSnapshot(nextSnapshot);
        setActionState({
          busy: null,
          message: payload.message || payload.summary || 'Action complete.',
          error: '',
        });
      }
      await refreshSafeModeSnapshot();
      return payload;
    } catch (error) {
      if (mountedRef.current) {
        setActionState({
          busy: null,
          message: '',
          error: String(error.message || error),
        });
      }
      return null;
    }
  }

  const criticalErrors = normalizeSafeModeList(snapshot.criticalErrors);
  const recentQaResults = normalizeSafeModeList(snapshot.recentQaResults);
  const failingTestNames = normalizeSafeModeList(snapshot.failingTestNames);
  const returnToNormalMode = typeof onReturnNormalMode === 'function'
    ? onReturnNormalMode
    : () => {
      writeSpatialSafeModeSession(false);
      window.location.reload();
    };

  return h('section', { className: 'spatial-main ace-shell spatial-safe-mode-shell', 'data-qa': 'spatial-safe-mode-shell' },
    h('div', { className: 'signal-empty muted' },
      h('div', { className: 'inspector-label' }, 'SafeShell'),
      h('div', { className: 'signal-summary' }, 'SpatialNotebook is in safe mode.'),
      h('div', { className: 'signal-meta muted' }, snapshot.reason || reason || health.bootHealth?.reason || 'A simplified shell is active to keep the tab alive.'),
      h('div', { className: 'signal-meta muted' }, `Server: ${health.pid || snapshot.health?.pid || 'unknown'} | Started: ${health.startedAt || snapshot.health?.startedAt || 'n/a'}`),
      actionState.message ? h('div', { className: 'signal-meta muted' }, actionState.message) : null,
      actionState.error ? h('div', { className: 'signal-meta muted' }, actionState.error) : null,
      h('div', { className: 'button-row' },
        h('button', {
          type: 'button',
          className: 'mini',
          onClick: () => runSafeModeAction('diagnosis', '/api/spatial/safe-mode/diagnosis', 'Running diagnosis...'),
          disabled: Boolean(actionState.busy),
          'data-qa': 'safe-shell-diagnosis',
        }, actionState.busy === 'diagnosis' ? 'Running diagnosis...' : 'Run diagnosis'),
        h('button', {
          type: 'button',
          className: 'mini',
          onClick: () => runSafeModeAction('fix-pass', '/api/spatial/safe-mode/constrained-fix-pass', 'Running constrained fix pass...'),
          disabled: Boolean(actionState.busy),
          'data-qa': 'safe-shell-fix-pass',
        }, actionState.busy === 'fix-pass' ? 'Running constrained fix pass...' : 'Run constrained fix pass'),
        h('button', {
          type: 'button',
          className: 'mini',
          onClick: returnToNormalMode,
          disabled: Boolean(actionState.busy),
          'data-qa': 'safe-shell-return-normal',
        }, 'Return to normal mode'),
      ),
    ),
    renderSafeModeListSection({
      title: 'Last critical errors',
      emptyState: 'No critical errors have been recorded yet.',
      items: criticalErrors,
      dataQa: 'safe-shell-critical-errors',
      renderItem: (entry, index) => h('div', { className: 'criteria-row', key: `critical-${index}` },
        h('span', null, entry.message || entry.summary || 'Unknown error'),
        h('span', { className: 'muted' }, [entry.source || 'unknown', entry.stage || null, entry.count ? `x${entry.count}` : null].filter(Boolean).join(' | ')),
      ),
    }),
    renderSafeModeListSection({
      title: 'Recent QA results',
      emptyState: 'No QA runs are available yet.',
      items: recentQaResults,
      dataQa: 'safe-shell-recent-qa',
      renderItem: (entry, index) => h('div', { className: 'criteria-row', key: `qa-${index}` },
        h('span', null, entry.scenario || entry.id || `QA run ${index + 1}`),
        h('span', { className: 'muted' }, [
          entry.verdict || entry.status || 'unknown',
          typeof entry.findingCount === 'number' ? `${entry.findingCount} finding${entry.findingCount === 1 ? '' : 's'}` : null,
        ].filter(Boolean).join(' | ')),
      ),
    }),
    renderSafeModeListSection({
      title: 'Failing test names',
      emptyState: 'No failing test names were surfaced.',
      items: failingTestNames,
      dataQa: 'safe-shell-failing-tests',
      renderItem: (entry, index) => h('div', { className: 'criteria-row', key: `test-${index}` },
        h('span', null, entry),
        h('span', { className: 'muted' }, 'failed'),
      ),
    }),
  );
}

export function buildSpatialSafeModeShell({
  health = EMPTY_SERVER_HEALTH,
  reason = '',
  snapshot = null,
  initialSnapshot = null,
  onRetry = null,
  onReturnNormalMode = null,
} = {}) {
  const resolvedSnapshot = snapshot || initialSnapshot || buildSafeModeInitialSnapshot({ health, reason });
  return h(SafeShell, {
    health,
    reason,
    initialSnapshot: resolvedSnapshot,
    onReturnNormalMode: onReturnNormalMode || onRetry || null,
  });
}

const EMPTY_THROUGHPUT_DEBUG = {
  latestSession: null,
  sessions: [],
};

const EMPTY_QA_STATE = {
  structuredReport: null,
  structuredBusy: false,
  latestBrowserRun: null,
  browserRuns: [],
  browserBusy: false,
  localGate: {
    unit: null,
    studioBoot: null,
  },
};

const EMPTY_MUTATION_GATE = {
  activity: [],
  approvalQueue: [],
};

const EMPTY_SIM_LAUNCHER = {
  project: null,
  status: 'Checking sim launcher availability...',
  launchedUrl: '',
  supportedOrigin: 'http://127.0.0.1:4173/',
  busy: false,
  error: '',
};

const TRACE_HISTORY_LIMIT = 5;
const EMPTY_CANVAS_INTENT_RUN_STATE = {
  traceId: null,
  submittedInput: '',
  phase: 'idle',
  route: null,
  forceIntentScan: false,
};

function createCanvasIntentRunState(state = null) {
  return {
    ...EMPTY_CANVAS_INTENT_RUN_STATE,
    ...(state && typeof state === 'object' ? state : {}),
  };
}

function attachTraceId(record = null, traceId = null) {
  if (!record || typeof record !== 'object') return record;
  const resolvedTraceId = String(record.trace_id || traceId || '').trim();
  return resolvedTraceId
    ? { ...record, trace_id: resolvedTraceId }
    : { ...record };
}

function resolveCanvasIntentTraceId(canvasIntentRunState = null) {
  const traceId = String(canvasIntentRunState?.traceId || '').trim();
  return traceId || null;
}

function resolveCurrentExecutiveResult(executiveResult = null, canvasIntentRunState = null) {
  if (!executiveResult || typeof executiveResult !== 'object') return null;
  const activeTraceId = resolveCanvasIntentTraceId(canvasIntentRunState);
  if (!activeTraceId) return executiveResult;
  return executiveResult.trace_id === activeTraceId ? executiveResult : null;
}

export function resolveIntentTraceReport({
  scanPreview = null,
  latestIntentReport = null,
  canvasIntentRunState = null,
} = {}) {
  const activeTraceId = resolveCanvasIntentTraceId(canvasIntentRunState);
  const currentPreview = scanPreview && typeof scanPreview === 'object' ? scanPreview : null;
  const historicalPreview = latestIntentReport && typeof latestIntentReport === 'object' ? latestIntentReport : null;
  if (!activeTraceId) {
    return currentPreview || historicalPreview || null;
  }
  return currentPreview?.trace_id === activeTraceId ? currentPreview : null;
}

export function buildMutationTraceEmptyReason({
  canvasIntentRunState = null,
  executiveResult = null,
  latestTracePlannerOutput = null,
  latestTraceEngineResult = null,
} = {}) {
  const phase = String(canvasIntentRunState?.phase || 'idle').trim().toLowerCase();
  const route = String(
    executiveResult?.route
    || canvasIntentRunState?.route
    || latestTracePlannerOutput?.route
    || latestTraceEngineResult?.route
    || '',
  ).trim().toLowerCase();
  if (phase === 'routing') {
    return 'Waiting for the current route to produce a mutation package.';
  }
  if (route === 'debug-intent-scan' || canvasIntentRunState?.forceIntentScan) {
    return 'Debug scan only. The current run did not request world mutations.';
  }
  if (route === 'world-edit') {
    return executiveResult?.mutationGeneration?.reason
      || executiveResult?.validation?.reason
      || executiveResult?.error
      || 'Existing-world tile edits are not implemented yet.';
  }
  if (route === 'module') {
    return 'Module routes do not generate world mutations.';
  }
  if (route === 'legacy-fallback') {
    return 'Legacy fallback routes do not generate canonical world mutations.';
  }
  if (route === 'primary-intent-route') {
    return 'Interpretation only. The current run did not request world mutations.';
  }
  if (route === 'world-scaffold') {
    return executiveResult?.mutationGeneration?.reason
      || latestTracePlannerOutput?.mutation_generation?.reason
      || latestTraceEngineResult?.reason
      || executiveResult?.error
      || 'The current scaffold run did not produce a mutation package.';
  }
  if (phase === 'error') {
    return latestTraceEngineResult?.reason || 'The current run ended before a mutation package was produced.';
  }
  return 'No mutation package has been proposed yet.';
}

function normalizeMutationGateState(state = null) {
  const source = state && typeof state === 'object' ? state : {};
  return {
    ...EMPTY_MUTATION_GATE,
    ...source,
    activity: Array.isArray(source.activity) ? source.activity.filter(Boolean) : [],
    approvalQueue: Array.isArray(source.approvalQueue) ? source.approvalQueue.filter(Boolean) : [],
  };
}

function formatMutationGateEntry(entry = null) {
  if (!entry) return 'No mutation activity yet.';
  const status = String(entry.status || '').replace(/-/g, ' ');
  const summary = String(entry.summary || 'Mutation event').trim();
  const reason = String(entry.reason || '').trim();
  return reason ? `${status || 'update'} | ${summary} | ${reason}` : `${status || 'update'} | ${summary}`;
}

function buildMutationApplyStatus(result = {}) {
  const applied = Number(result.applied || 0);
  const queued = Number(result.queued || 0);
  const blocked = Number(result.blocked || 0);
  if (result.status === 'queued') {
    return `ACE queued ${queued} risky mutation${queued === 1 ? '' : 's'} for approval`;
  }
  if (result.status === 'blocked') {
    return result.reason || 'ACE blocked the requested mutations.';
  }
  if (result.status === 'mixed') {
    const parts = [];
    if (applied) parts.push(`auto-applied ${applied}`);
    if (queued) parts.push(`queued ${queued}`);
    if (blocked) parts.push(`blocked ${blocked}`);
    return `ACE ${parts.join(' | ')}`;
  }
  if (applied) {
    return `ACE auto-applied ${applied} safe mutation${applied === 1 ? '' : 's'}`;
  }
  return result.reason || 'ACE did not apply a canonical mutation.';
}

function normalizeRecentWorldCell(cell = null) {
  if (!cell || typeof cell !== 'object') return null;
  const x = Number(cell.x);
  const y = Number(cell.y);
  const z = Number(cell.z || 0);
  if (![x, y, z].every((value) => Number.isFinite(value))) return null;
  return {
    x: Math.round(x),
    y: Math.round(y),
    z: Math.round(z),
  };
}

function buildRecentWorldEdgeKey(edge = {}) {
  const source = String(edge?.source || '').trim();
  const target = String(edge?.target || '').trim();
  return `${source}->${target}`;
}

function normalizeRecentWorldChangeItem(item = null) {
  if (!item || typeof item !== 'object') return null;
  const kind = item.kind === 'scaffold'
    ? 'scaffold'
    : (item.kind === 'edge' ? 'edge' : 'node');
  const changeType = item.changeType === 'added' ? 'added' : 'modified';
  const addedCells = Array.isArray(item.addedCells)
    ? item.addedCells.map((cell) => normalizeRecentWorldCell(cell)).filter(Boolean)
    : [];
  const modifiedCells = Array.isArray(item.modifiedCells)
    ? item.modifiedCells.map((cell) => normalizeRecentWorldCell(cell)).filter(Boolean)
    : [];
  return {
    ...item,
    kind,
    changeType,
    label: String(item.label || 'Recent world change').trim() || 'Recent world change',
    detail: String(item.detail || item.summary || '').trim(),
    summary: String(item.summary || item.label || '').trim(),
    nodeId: item.nodeId || null,
    source: item.source || null,
    target: item.target || null,
    counts: {
      addedCells: Number(item?.counts?.addedCells || addedCells.length),
      modifiedCells: Number(item?.counts?.modifiedCells || modifiedCells.length),
    },
    addedCells,
    modifiedCells,
  };
}

function buildRecentWorldCountsLabel(counts = {}) {
  const parts = [];
  if (Number(counts.addedNodes || 0) > 0) parts.push(`${counts.addedNodes} node${Number(counts.addedNodes) === 1 ? '' : 's'} added`);
  if (Number(counts.modifiedNodes || 0) > 0) parts.push(`${counts.modifiedNodes} node${Number(counts.modifiedNodes) === 1 ? '' : 's'} modified`);
  if (Number(counts.addedEdges || 0) > 0) parts.push(`${counts.addedEdges} edge${Number(counts.addedEdges) === 1 ? '' : 's'} added`);
  if (Number(counts.addedCells || 0) > 0) parts.push(`${counts.addedCells} cell${Number(counts.addedCells) === 1 ? '' : 's'} added`);
  if (Number(counts.modifiedCells || 0) > 0) parts.push(`${counts.modifiedCells} cell${Number(counts.modifiedCells) === 1 ? '' : 's'} modified`);
  return parts.join(' | ') || 'No applied world diff derived.';
}

export function normalizeRecentWorldChange(change = null) {
  if (!change || typeof change !== 'object') return null;
  const items = Array.isArray(change.items)
    ? change.items.map((item) => normalizeRecentWorldChangeItem(item)).filter(Boolean)
    : [];
  if (!items.length) return null;
  const counts = {
    addedNodes: Number(change?.counts?.addedNodes || 0),
    modifiedNodes: Number(change?.counts?.modifiedNodes || 0),
    addedEdges: Number(change?.counts?.addedEdges || 0),
    addedCells: Number(change?.counts?.addedCells || 0),
    modifiedCells: Number(change?.counts?.modifiedCells || 0),
  };
  if (!Object.values(counts).some((value) => value > 0)) {
    items.forEach((item) => {
      if (item.kind === 'edge') counts.addedEdges += 1;
      if (item.kind === 'scaffold' || item.kind === 'node') {
        if (item.changeType === 'added') counts.addedNodes += 1;
        if (item.changeType === 'modified') counts.modifiedNodes += 1;
      }
      if (item.kind === 'scaffold') {
        counts.addedCells += Number(item?.counts?.addedCells || 0);
        counts.modifiedCells += Number(item?.counts?.modifiedCells || 0);
      }
    });
  }
  const highlights = {
    nodeIds: [...new Set(items.map((item) => item?.nodeId).filter(Boolean))],
    edgeKeys: [...new Set(items.filter((item) => item.kind === 'edge').map((item) => buildRecentWorldEdgeKey(item)).filter(Boolean))],
  };
  return {
    id: String(change.id || `recent-world-change-${Date.now()}`),
    at: change.at || null,
    scope: String(change.scope || 'session-local'),
    status: String(change.status || 'applied'),
    summary: String(change.summary || '').trim() || buildRecentWorldCountsLabel(counts),
    counts,
    items,
    highlights,
    itemByNodeId: Object.fromEntries(items.filter((item) => item?.nodeId).map((item) => [item.nodeId, item])),
    itemByEdgeKey: Object.fromEntries(items.filter((item) => item.kind === 'edge').map((item) => [buildRecentWorldEdgeKey(item), item])),
  };
}

export function formatRecentWorldChangeItem(item = null) {
  if (!item) return 'Recent world change';
  return item.detail ? `${item.label} | ${item.detail}` : item.label;
}

function buildRecentWorldChangeItemKey(item = null, index = 0) {
  if (!item || typeof item !== 'object') return `recent-world-change-${index}`;
  if (item.kind === 'edge') {
    return `recent-world-edge-${buildRecentWorldEdgeKey(item) || index}`;
  }
  return `recent-world-${item.kind}-${item.nodeId || item.label || index}`;
}

function resolveRecentWorldNodeChange(recentWorldChange = null, nodeId = '') {
  return recentWorldChange?.itemByNodeId?.[nodeId] || null;
}

function resolveRecentWorldEdgeChange(recentWorldChange = null, edge = {}) {
  return recentWorldChange?.itemByEdgeKey?.[buildRecentWorldEdgeKey(edge)] || null;
}

function formatMutationSummary(mutation = null) {
  if (!mutation || typeof mutation !== 'object') return 'Pending mutation';
  if (mutation.type === 'create_node') {
    const node = mutation.node || {};
    return `create ${node.type || 'node'} ${node.id || 'pending'}`;
  }
  if (mutation.type === 'modify_node') {
    return `modify ${mutation.id || 'node'}`;
  }
  if (mutation.type === 'create_edge') {
    return `connect ${mutation.edge?.source || '?'} -> ${mutation.edge?.target || '?'}`;
  }
  return mutation.type || 'mutation';
}

function formatWorldScaffoldIntent(intent = null) {
  if (!intent) return 'World scaffold';
  if (intent.summary) return intent.summary;
  const dimensions = Number.isFinite(Number(intent.width)) && Number.isFinite(Number(intent.height))
    ? `${intent.width}x${intent.height}`
    : 'unparsed';
  return `${dimensions} ${intent.material || intent.tileType || 'scaffold'} grid`;
}

function resolveScaffoldExecutiveIntent(result = null) {
  return result?.evaluation?.finalCandidate || result?.intent || result?.interpretation?.candidate || null;
}

function formatWorldScaffoldPosition(position = null) {
  if (!position || typeof position !== 'object') return '0, 0, 0';
  return `${Number(position.x || 0)}, ${Number(position.y || 0)}, ${Number(position.z || 0)}`;
}

function formatWorldScaffoldParsedIntent(intent = null) {
  if (!intent || typeof intent !== 'object') return 'none';
  return JSON.stringify({
    type: intent.type || 'world_scaffold',
    shape: intent.shape || 'grid',
    width: Number.isFinite(Number(intent.width)) ? Number(intent.width) : null,
    height: Number.isFinite(Number(intent.height)) ? Number(intent.height) : null,
    material: intent.material || null,
    position: intent.position || null,
  });
}

function formatWorldScaffoldValidation(validation = null) {
  if (!validation || typeof validation !== 'object') return 'not evaluated';
  return validation.ok ? 'valid' : (validation.reason || 'invalid');
}

function formatWorldScaffoldConfidence(confidence = null) {
  if (!confidence || typeof confidence !== 'object') return 'not reported';
  return `${confidence.label || 'unknown'} (${Math.round((confidence.score || 0) * 100)}%)`;
}

function formatWorldScaffoldMutationGeneration(mutationGeneration = null) {
  if (!mutationGeneration || typeof mutationGeneration !== 'object') return 'not generated';
  if (mutationGeneration.ok === false) {
    return mutationGeneration.reason || 'not generated';
  }
  const count = Number(mutationGeneration.mutationCount || 0);
  const label = count === 1 ? 'mutation' : 'mutations';
  return `${count} ${label} ready | ${mutationGeneration.mode || 'unknown'}`;
}

export function formatScaffoldInterpretationLabel(interpretation = null) {
  if (!interpretation || typeof interpretation !== 'object') return 'no accepted interpretation';
  return interpretation.label || interpretation.source || 'no accepted interpretation';
}

function formatScaffoldInterpretationStatus(interpretation = null) {
  if (!interpretation || typeof interpretation !== 'object') return 'not attempted';
  return interpretation.status || 'not attempted';
}

function formatScaffoldInterpretationAttempted(interpretation = null) {
  return interpretation?.attempted ? 'yes' : 'no';
}

function formatScaffoldInterpretationAccepted(interpretation = null) {
  return interpretation?.accepted ? 'yes' : 'no';
}

function formatScaffoldInterpretationFallback(interpretation = null) {
  return interpretation?.fallbackUsed ? 'yes' : 'no';
}

function formatScaffoldInterpretationRoute(interpretation = null) {
  if (!interpretation?.attempted) return 'not attempted';
  if (interpretation.backend && interpretation.model) {
    return `${interpretation.backend} | ${interpretation.model}`;
  }
  return 'attempted';
}

function formatWorldScaffoldScorecardValue(value = null) {
  if (value === null || value === undefined || value === '') return 'not evaluated';
  return String(value).replace(/_/g, ' ');
}

function formatWorldScaffoldEvaluationCues(cues = []) {
  if (!Array.isArray(cues) || !cues.length) return 'none';
  return cues.join(', ');
}

export function formatWorldScaffoldEvaluationSummary(evaluation = null) {
  if (!evaluation || typeof evaluation !== 'object') return 'not evaluated';
  const scorecard = evaluation.scorecard && typeof evaluation.scorecard === 'object'
    ? evaluation.scorecard
    : {};
  const suitability = formatWorldScaffoldScorecardValue(scorecard.suitability);
  const correction = scorecard.correctionApplied ? 'corrected' : 'no correction';
  const accepted = scorecard.acceptedForMutationGeneration ? 'accepted' : 'rejected';
  return `${suitability} | ${correction} | ${accepted}`;
}

function buildListItemKey(prefix, value, index = 0) {
  const source = typeof value === 'string'
    ? value
    : (value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''));
  const normalized = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'item';
  return `${prefix}-${normalized}-${index}`;
}

function buildMutationTraceKey(mutation = null, index = 0) {
  if (!mutation || typeof mutation !== 'object') return `mutation-${index}`;
  if (mutation.type === 'create_node') {
    const node = mutation.node || {};
    return `mutation-create-node-${node.id || node.type || 'pending'}-${index}`;
  }
  if (mutation.type === 'modify_node') {
    return `mutation-modify-node-${mutation.id || 'pending'}-${index}`;
  }
  if (mutation.type === 'create_edge') {
    const edge = mutation.edge || {};
    return `mutation-create-edge-${edge.source || 'source'}-${edge.target || 'target'}-${index}`;
  }
  return `mutation-${mutation.type || 'unknown'}-${index}`;
}

function buildMutationDecisionKey(decision = null, index = 0) {
  if (!decision || typeof decision !== 'object') return `decision-${index}`;
  return `${buildMutationTraceKey(decision.mutation, index)}-${decision.classification || 'unknown'}-${decision.code || 'none'}`;
}

function getLatestTraceStep(trace = null, stage = '', predicate = null) {
  const steps = Array.isArray(trace?.steps) ? trace.steps : [];
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (step?.stage !== stage) continue;
    if (typeof predicate === 'function' && !predicate(step)) continue;
    return step;
  }
  return null;
}

function buildAgentAttemptSummary(agent = null) {
  const worker = agent?.workerState || {};
  return {
    outcome: worker.lastOutcome || agent?.latestRunStatus || agent?.status || 'idle',
    at: worker.lastOutcomeAt || null,
    detail: worker.lastBlockedReason || agent?.latestRunSummary || agent?.latestSignal || agent?.statusDetail || '',
    blockedReason: worker.lastBlockedReason || null,
    decision: worker.lastDecision || null,
  };
}

const LABEL_MAP = [
  { label: 'context', match: /context|brief|constraint|intent|memory/i },
  { label: 'plan', match: /plan|task|sequence|milestone|todo|roadmap/i },
  { label: 'execution', match: /build|implement|ship|code|module|service/i },
  { label: 'ux', match: /ux|ui|screen|flow/i },
  { label: 'governance', match: /rule|review|guardrail|architect|ace/i },
];

function suggestRole(node, graph, layer = 'system') {
  const text = (node.content || '').toLowerCase();
  const outgoing = graph.edges.filter((edge) => edge.source === node.id).length;
  if (layer === 'world') {
    if (/bridge|adapter|translate|map|projection|link/.test(text)) return 'adapter';
    if (/constraint|rule|balance|cap|limit|must|never/.test(text)) return 'world-constraint';
    if (/quest|mission|objective|campaign/.test(text)) return 'quest';
    if (/item|inventory|loot|weapon|gear|craft/.test(text)) return 'item';
    if (/combat|progression|ability|mechanic|loop|system|economy|faction/.test(text) || outgoing > 1) return 'mechanic';
    return 'gameplay-system';
  }
  if (/rule|constraint|must|never|always/.test(text)) return 'constraint';
  if (/api|service|module|subsystem|architecture/.test(text)) return 'module';
  if (/file|\.js|\.py|\.ts|src\//.test(text)) return 'file';
  if (/todo|build|make|implement|task|ship/.test(text) || outgoing > 1) return 'task';
  if (/ux|ui|screen|flow/.test(text)) return 'ux';
  return 'thought';
}

function normalizedNodeContent(value = '') {
  return String(value || '').trim();
}

export function isLinkedDraftNode(node) {
  return node?.metadata?.rsg?.state === 'linked-draft';
}

export function isAdoptedDraftNode(node) {
  return node?.metadata?.rsg?.state === 'adopted';
}

export function buildRsgActivityEntry({
  type = 'rsg-skip',
  sourceNode = null,
  report = null,
  generationId = null,
  generatedCount = 0,
  replacedCount = 0,
  reason = '',
  trigger = 'manual',
  at = null,
} = {}) {
  const summary = String(report?.summary || reason || '').trim();
  return {
    id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    at: at || new Date().toISOString(),
    sourceNodeId: sourceNode?.id || report?.nodeId || null,
    sourceNodeLabel: normalizedNodeContent(sourceNode?.content || '').slice(0, 80),
    summary,
    confidence: Number.isFinite(Number(report?.confidence)) ? Number(report.confidence) : null,
    generatedCount: Number(generatedCount || 0),
    replacedCount: Number(replacedCount || 0),
    usedFallback: Boolean(report?.usedFallback),
    reason: String(reason || '').trim(),
    trigger,
    generationId: generationId || null,
  };
}

export function pushRsgActivityEntry(rsgState = createDefaultRsgState(), entry = null) {
  const base = {
    ...createDefaultRsgState(),
    ...(rsgState || {}),
  };
  if (!entry) return base;
  return {
    ...base,
    activity: [
      entry,
      ...((base.activity || []).filter((item) => item?.id && item.id !== entry.id)),
    ].slice(0, RSG_ACTIVITY_LIMIT),
    lastSourceNodeId: entry.sourceNodeId || base.lastSourceNodeId || null,
    lastGenerationAt: entry.at || base.lastGenerationAt || null,
    lastStatus: entry.type || base.lastStatus || 'idle',
  };
}

export function shouldRunFocusedRsgLoop({
  node = null,
  trigger = 'enter',
  activeGraphLayer = 'system',
  scene = SCENES.CANVAS,
  selectedId = null,
  rawContent = null,
} = {}) {
  if (!node?.id) return { ok: false, reason: 'missing-node' };
  if (activeGraphLayer !== 'system') return { ok: false, reason: 'not-system-layer' };
  if (scene !== SCENES.CANVAS) return { ok: false, reason: 'not-canvas' };
  if (trigger === 'idle' && selectedId !== node.id) return { ok: false, reason: 'not-selected' };
  if (isPrimaryIntentNode(node)) return { ok: false, reason: 'primary-intent-node' };
  if (normalizedNodeContent(rawContent ?? node.content).length === 0) return { ok: false, reason: 'empty-content' };
  if (node?.metadata?.intentStatus === 'processing') return { ok: false, reason: 'processing' };
  if (isLinkedDraftNode(node)) return { ok: false, reason: 'linked-draft' };
  return { ok: true, reason: '' };
}

export function isPrimaryIntentNode(node = null) {
  const labels = Array.isArray(node?.metadata?.labels) ? node.metadata.labels : [];
  return node?.metadata?.agentId === 'context-manager' || labels.includes('primary-input');
}

export function getExtractedIntent(report = null) {
  return report?.extractedIntent && typeof report.extractedIntent === 'object'
    ? report.extractedIntent
    : null;
}

export function resolveGeneratedNodeInspection(node = null, graph = { nodes: [] }) {
  const intentRef = node?.metadata?.rsg?.intentRef || null;
  if (!intentRef?.sourceNodeId || !intentRef?.candidateNodeId) return null;
  const sourceNode = (graph?.nodes || []).find((entry) => entry.id === intentRef.sourceNodeId) || null;
  const sourceReport = sourceNode?.metadata?.intentAnalysis || null;
  const extractedIntent = getExtractedIntent(sourceReport);
  if (!extractedIntent) return null;
  const candidate = (extractedIntent.candidateNodes || []).find((entry) => entry.id === intentRef.candidateNodeId)
    || (extractedIntent.candidateNodes || []).find((entry) => String(entry.label || '').trim() === String(node.content || '').trim())
    || null;
  const relatedEdges = (extractedIntent.candidateEdges || []).filter((edge) => (
    edge.sourceCandidateId === intentRef.candidateNodeId || edge.targetCandidateId === intentRef.candidateNodeId
  ));
  return {
    extractedIntent,
    sourceNode,
    candidate,
    relatedEdges,
    basis: candidate?.basis || intentRef.basis || 'explicit',
    confidence: Number.isFinite(Number(candidate?.confidence))
      ? Number(candidate.confidence)
      : (Number.isFinite(Number(node?.metadata?.rsg?.confidence)) ? Number(node.metadata.rsg.confidence) : null),
  };
}

function formatRsgActivity(entry = null) {
  if (!entry) return 'RSG idle';
  const label = String(entry.type || 'rsg-skip').replace(/^rsg-/, 'RSG ').replace(/-/g, ' ');
  if (entry.type === 'rsg-skip') {
    return `${label} | ${entry.reason || 'no draft updates'}`;
  }
  return `${label} | ${entry.generatedCount || 0} drafts${entry.replacedCount ? ` | replaced ${entry.replacedCount}` : ''}`;
}

function isLowConfidence(value) {
  return Number.isFinite(Number(value)) && Number(value) < RSG_LOW_CONFIDENCE_THRESHOLD;
}

function deriveLabels(content = '', metadata = {}, layer = 'system') {
  const base = Array.isArray(metadata.labels) ? metadata.labels : [];
  const inferred = LABEL_MAP.filter((entry) => entry.match.test(content)).map((entry) => entry.label);
  if (/should|propose|improve|upgrade|add|refactor/i.test(content)) inferred.push('proposal');
  if (/bridge|adapter|translate|map|link|projection/i.test(content)) inferred.push('adapter');
  if (layer === 'world') inferred.push('world');
  return [...new Set([...base, ...inferred])];
}

function inferProposalTarget(node, layer, role, labels = []) {
  if (node.metadata?.proposalTarget) return node.metadata.proposalTarget;
  if (role === 'adapter' || labels.includes('adapter')) return 'adapter-translation';
  if (layer === 'world') return 'world-structure';
  if (role === 'task' || /build|apply|deploy|patch|execute/i.test(node.content || '')) return 'code-runtime-mutation';
  return 'system-structure';
}

function classifyNode(node, graph, layer = 'system') {
  const inferredRole = suggestRole(node, graph, layer);
  const role = node.metadata?.manualOverride
    ? (node.metadata?.role || node.type || inferredRole)
    : inferredRole;
  const labels = deriveLabels(node.content, node.metadata, layer);
  const proposalTarget = inferProposalTarget(node, layer, role, labels);
  return {
    type: node.metadata?.manualOverride ? (node.type || 'text') : (role === 'thought' ? 'text' : role),
    metadata: {
      ...node.metadata,
      role,
      graphLayer: layer,
      labels,
      proposalTarget,
      approvalPolicy: proposalTarget === 'code-runtime-mutation' ? 'risk-gated-review' : 'auto-record',
    },
  };
}

function resolveNodeOrigin(node) {
  if (!node) return NODE_ORIGIN_DEFAULT;
  const metadata = node.metadata || {};
  if (NODE_ORIGINS.includes(metadata.origin)) return metadata.origin;
  if (metadata.agentId === 'context-manager') return 'user_input';
  if (metadata.agentId) return 'agent_generated';
  if (metadata.rsg) return 'agent_generated';
  return NODE_ORIGIN_DEFAULT;
}

function mergeComments(saved) {
  return { ...createInitialComments(), ...(saved || {}) };
}

function useInterval(callback, delay) {
  useEffect(() => {
    if (!delay) return undefined;
    const timer = setInterval(callback, delay);
    return () => clearInterval(timer);
  }, [callback, delay]);
}

function isEditableTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  if (typeof target.closest === 'function' && target.closest('textarea, input, select, [contenteditable="true"]')) return true;
  const tagName = target.tagName || '';
  return ['TEXTAREA', 'INPUT', 'SELECT'].includes(tagName);
}

function summarizeIntentReport(report) {
  if (!report) return SECONDARY_DRAFT_HINT;
  const confidence = typeof report.confidence === 'number' ? `${Math.round(report.confidence * 100)}% confidence` : 'pending confidence';
  return `${report.summary || 'Intent captured'} | ${confidence}`;
}

function deltaFromWheel(deltaY) {
  return deltaY < 0 ? 0.08 : -0.08;
}

function PixelAvatar({ accent, status }) {
  return h('div', { className: `pixel-avatar ${STATUS_META[status]?.tone || 'idle'}` },
    h('span', { className: 'pixel-head', style: { background: accent } }),
    h('span', { className: 'pixel-body' }),
    h('span', { className: 'pixel-shadow' }),
  );
}

function ThroughputBar({ label, value, max }) {
  const ratio = max ? Math.min(1, value / max) : 0;
  return h('div', { className: 'throughput-row' },
    h('div', { className: 'throughput-label muted' }, `${label}: ${value}`),
    h('div', { className: 'throughput-track' },
      h('div', { className: 'throughput-fill', style: { width: `${Math.max(8, ratio * 100)}%` } }),
    ),
  );

  if (serverHealth.safeMode || serverHealth.bootHealth?.safeMode) {
    return buildSpatialSafeModeShell({
      health: serverHealth,
      reason: serverHealth.bootHealth?.reason || 'Spatial notebook boot health failed.',
      onReturnNormalMode: () => {
        writeSpatialSafeModeSession(false);
        window.location.reload();
      },
    });
  }

  return renderSpatialNotebookSectionWithBoundary(renderMainPanel, { boundaryId: 'main-panel', title: 'Main panel unavailable' });
}

function formatTimestamp(value) {
  if (!value) return 'unknown time';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'unknown time';
  return parsed.toLocaleString();
}

function describeRelationshipItem(value) {
  if (value == null || value === false) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    return String(value.summary || value.label || value.title || value.name || value.id || '').trim();
  }
  return '';
}

function normalizeRelationshipInspectorList(value = []) {
  const source = Array.isArray(value) ? value : (value == null ? [] : [value]);
  return [...new Set(source.map((entry) => describeRelationshipItem(entry)).filter(Boolean))];
}

function formatRelationshipVisualForm(value = '') {
  if (value === 'woven-rope') return 'rope';
  return String(value || '').trim() || 'n/a';
}

function formatRelationshipListSummary(items = []) {
  const entries = normalizeRelationshipInspectorList(items);
  if (!entries.length) return '0';
  const preview = entries.slice(0, 3).join(' / ');
  return entries.length > 3 ? `${entries.length} | ${preview} ...` : `${entries.length} | ${preview}`;
}

export function buildRelationshipInspectorPayload(edge = null) {
  if (!edge || typeof edge !== 'object') return null;
  const relationshipType = String(edge.relationshipType || edge.relationship_type || edge.type || 'relates_to').trim() || 'relates_to';
  const supports = normalizeRelationshipInspectorList(edge.supports);
  const validatedBy = normalizeRelationshipInspectorList(edge.validatedBy);
  return {
    id: String(edge.id || '').trim() || null,
    source: String(edge.source || '').trim() || null,
    target: String(edge.target || '').trim() || null,
    label: String(edge.label || '').trim() || relationshipType.replace(/_/g, ' '),
    relationshipType,
    strength: Number.isFinite(Number(edge.strength)) ? Number(edge.strength) : null,
    strandCount: Number.isFinite(Number(edge.strandCount)) ? Number(edge.strandCount) : null,
    visualForm: String(edge.visualForm || '').trim() || null,
    supports,
    supportsCount: supports.length,
    validatedBy,
    validatedByCount: validatedBy.length,
    health: String(edge.health || '').trim() || null,
    lastActive: edge.lastActive || null,
  };
}

export function resolveSelectedRelationshipInspector(graph = { edges: [] }, selectedRelationshipId = null) {
  const edge = (Array.isArray(graph?.edges) ? graph.edges : []).find((entry) => entry?.id === selectedRelationshipId) || null;
  return buildRelationshipInspectorPayload(edge);
}

export function hitTestRelationshipEdgeAtPoint(graph = { nodes: [], edges: [] }, world = null, viewport = { zoom: 1 }) {
  if (!graph || !world) return null;
  const zoom = Math.max(0.0001, Number(viewport?.zoom) || 1);
  const threshold = 12 / zoom;
  const nodesById = new Map((Array.isArray(graph.nodes) ? graph.nodes : []).filter((node) => node && node.id).map((node) => [node.id, node]));
  let bestEdge = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  (Array.isArray(graph.edges) ? graph.edges : []).forEach((edge) => {
    const source = nodesById.get(edge?.source);
    const target = nodesById.get(edge?.target);
    if (!source || !target || !source.position || !target.position) return;
    const sourcePoint = {
      x: source.position.x + NODE_LAYOUT.outputAnchorX,
      y: source.position.y + NODE_LAYOUT.anchorY,
    };
    const targetPoint = {
      x: target.position.x + NODE_LAYOUT.inputAnchorX,
      y: target.position.y + NODE_LAYOUT.anchorY,
    };
    const dx = targetPoint.x - sourcePoint.x;
    const dy = targetPoint.y - sourcePoint.y;
    const lengthSquared = (dx * dx) + (dy * dy);
    if (!lengthSquared) return;
    const projection = Math.max(0, Math.min(1, (((world.x - sourcePoint.x) * dx) + ((world.y - sourcePoint.y) * dy)) / lengthSquared));
    const closest = {
      x: sourcePoint.x + (dx * projection),
      y: sourcePoint.y + (dy * projection),
    };
    const distance = Math.hypot(world.x - closest.x, world.y - closest.y);
    if (distance <= threshold && distance < bestDistance) {
      bestDistance = distance;
      bestEdge = edge;
    }
  });
  return bestEdge;
}

export function renderRelationshipInspectorPanel(payload = null) {
  if (!payload) {
    return h('div', { className: 'utility-window-stack', 'data-qa': 'relationship-inspector-window' },
      h('div', { className: 'utility-window-section utility-window-hero' },
        h('div', { className: 'inspector-label' }, 'Relationship Inspector'),
        h('div', { className: 'signal-summary' }, 'No relationship selected'),
        h('div', { className: 'signal-meta muted' }, 'Click a line to inspect the relationship entity.'),
      ),
      h('div', { className: 'signal-empty muted' }, 'Select a relationship edge to inspect its data.'),
    );
  }
  return h('div', { className: 'utility-window-stack', 'data-qa': 'relationship-inspector-window' },
    h('div', { className: 'utility-window-section utility-window-hero' },
      h('div', { className: 'inspector-label' }, 'Relationship Inspector'),
      h('div', { className: 'signal-summary' }, payload.label || `${payload.source || 'unknown'} -> ${payload.target || 'unknown'}`),
      h('div', { className: 'signal-meta muted' }, `${payload.source || 'unknown'} -> ${payload.target || 'unknown'}`),
    ),
    h('div', { className: 'utility-window-section' },
      h('div', { className: 'criteria-list desk-metric-list' },
        h('div', { className: 'criteria-row' }, h('span', null, 'relationshipType'), h('span', { className: 'muted' }, payload.relationshipType || 'n/a')),
        h('div', { className: 'criteria-row' }, h('span', null, 'strength'), h('span', { className: 'muted' }, payload.strength ?? 'n/a')),
        h('div', { className: 'criteria-row' }, h('span', null, 'strandCount'), h('span', { className: 'muted' }, payload.strandCount ?? 'n/a')),
        h('div', { className: 'criteria-row' }, h('span', null, 'visualForm'), h('span', { className: 'muted' }, formatRelationshipVisualForm(payload.visualForm))),
        h('div', { className: 'criteria-row' }, h('span', null, 'supports'), h('span', { className: 'muted' }, formatRelationshipListSummary(payload.supports))),
        h('div', { className: 'criteria-row' }, h('span', null, 'validatedBy'), h('span', { className: 'muted' }, formatRelationshipListSummary(payload.validatedBy))),
        h('div', { className: 'criteria-row' }, h('span', null, 'health'), h('span', { className: 'muted' }, payload.health || 'n/a')),
        h('div', { className: 'criteria-row' }, h('span', null, 'lastActive'), h('span', { className: 'muted' }, payload.lastActive ? formatTimestamp(payload.lastActive) : 'n/a')),
      ),
    ),
  );

  return renderSpatialNotebookSectionWithBoundary(renderMainPanel, { boundaryId: 'main-panel', title: 'Main panel unavailable' });
}

function SpatialNotebookSection({ render = null }) {
  return typeof render === 'function' ? render() : null;
}

export function buildSpatialNotebookErrorFallback({ boundaryId = 'panel', title = 'Panel unavailable', error = null } = {}) {
  const summary = error?.message ? `Recovered from: ${error.message}` : 'An unexpected render error occurred.';
  return h('div', {
      className: 'signal-empty muted spatial-error-fallback',
      'data-qa': `spatial-error-fallback-${boundaryId}`,
    },
    h('div', { className: 'signal-summary' }, title),
    h('div', { className: 'signal-meta muted' }, summary),
    h('div', { className: 'signal-meta muted' }, 'The rest of SpatialNotebook stays alive.'),
  );
}

export class SpatialNotebookErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[SpatialNotebookErrorBoundary]', this.props?.boundaryId || 'panel', error, info);
  }

  render() {
    if (this.state.hasError) {
      return buildSpatialNotebookErrorFallback({
        boundaryId: this.props?.boundaryId || 'panel',
        title: this.props?.title || 'Panel unavailable',
        error: this.state.error,
      });
    }
    return this.props.children;
  }
}

function renderSpatialNotebookSectionWithBoundary(render, { boundaryId = 'panel', title = 'Panel unavailable' } = {}) {
  return h(SpatialNotebookErrorBoundary, { boundaryId, title },
    h(SpatialNotebookSection, { render }),
  );
}

function isStudioViewportOutOfRange(viewport) {
  if (!viewport) return true;
  if (![viewport.x, viewport.y, viewport.zoom].every((value) => Number.isFinite(value))) return true;
  if (viewport.zoom < MIN_STUDIO_ZOOM || viewport.zoom > MAX_STUDIO_ZOOM) return true;
  return Math.abs(viewport.x) > STUDIO_SIZE.width * 2 || Math.abs(viewport.y) > STUDIO_SIZE.height * 2;
}

function summarizeGateStatus(entry = null) {
  return entry?.verdict || entry?.status || 'pending';
}

function summarizeGateFailures(entry = null) {
  if (!entry) return 0;
  return Number(entry.failedCount || entry.findingCount || entry.consoleErrorCount || entry.failures?.length || 0);
}

function renderDeskSection(rawSection, helpers = {}) {
    const section = normalizeDeskSectionPayload(rawSection);
    if (!section.kind) return null;
  if (section.kind === 'summary') {
    return h('div', { key: section.id, className: 'inspector-block panel-card' },
      h('div', { className: 'inspector-label' }, section.label),
      h('div', { className: 'signal-summary' }, section.value || section.emptyState || 'No data.'),
      section.detail ? h('div', { className: 'signal-meta muted' }, section.detail) : null,
    );
  }
    if (section.kind === 'desk-truth') {
      const truth = normalizeTruthPayload(section.truth || {});
    const listValue = (value) => {
      if (Array.isArray(value)) return value.filter(Boolean);
      if (value == null || value === false) return [];
      if (typeof value === 'object') return Object.values(value).filter(Boolean);
      return [value];
    };
    const renderList = (items, emptyState = 'No items surfaced.') => (
      listValue(items).length
        ? h('ul', { className: 'signal-list desk-truth-list' }, listValue(items).slice(0, 4).map((entry, index) => h('li', {
          key: `${section.id}-truth-${index}`,
        }, typeof entry === 'object'
          ? `${entry.summary || entry.label || entry.title || 'Item'}${entry.detail ? ` | ${entry.detail}` : ''}`
          : String(entry))))
        : h('div', { className: 'signal-empty muted' }, emptyState)
    );
    return h('div', { key: section.id, className: 'inspector-block panel-card desk-truth-panel' },
      h('div', { className: 'inspector-label' }, section.label),
      h('div', { className: 'signal-summary' }, truth.department || 'Desk truth'),
      truth.context ? h('div', { className: 'signal-meta muted' }, describeDeskValue(truth.context)) : null,
      h('div', { className: 'criteria-list desk-metric-list' },
        h('div', { className: 'criteria-row' }, h('span', null, 'Workload'), h('span', { className: 'muted' }, `${truth.workload?.assignedTasks ?? 0} assigned / ${truth.workload?.queueSize ?? 0} queued / ${truth.workload?.outputs ?? 0} outputs`)),
        h('div', { className: 'criteria-row' }, h('span', null, 'Throughput'), h('span', { className: 'muted' }, truth.throughput || 'No throughput signal')),
        h('div', { className: 'criteria-row' }, h('span', null, 'Reports'), h('span', { className: 'muted' }, `${listValue(truth.reports).length} surfaced`)),
        h('div', { className: 'criteria-row' }, h('span', null, 'Scorecards'), h('span', { className: 'muted' }, `${listValue(truth.scorecards).length} surfaced`)),
        h('div', { className: 'criteria-row' }, h('span', null, 'Assessments'), h('span', { className: 'muted' }, `${listValue(truth.assessments).length} surfaced`)),
      ),
      h('div', { className: 'desk-truth-grid' },
        h('div', { className: 'desk-truth-column' },
          h('div', { className: 'inspector-label' }, 'Context'),
          renderList(truth.context?.slices || truth.context, 'No context slices surfaced.'),
        ),
        h('div', { className: 'desk-truth-column' },
          h('div', { className: 'inspector-label' }, 'Reports'),
          renderList(truth.reports, 'No reports surfaced.'),
        ),
        h('div', { className: 'desk-truth-column' },
          h('div', { className: 'inspector-label' }, 'Scorecards'),
          renderList(truth.scorecards, 'No scorecards surfaced.'),
        ),
        h('div', { className: 'desk-truth-column' },
          h('div', { className: 'inspector-label' }, 'Assessments'),
          renderList(truth.assessments, 'No assessments surfaced.'),
        ),
        h('div', { className: 'desk-truth-column' },
          h('div', { className: 'inspector-label' }, 'Guardrails'),
          renderList(truth.guardrails, 'No guardrails surfaced.'),
        ),
      ),
    );
  }
  if (section.kind === 'handoff') {
    const handoff = section.value;
    return h('div', { key: section.id, className: 'inspector-block panel-card review-panel' },
      h('div', { className: 'inspector-label' }, section.label),
      handoff
        ? h(React.Fragment, null,
            h('div', { className: 'signal-summary' }, handoff.summary || 'Planner brief ready.'),
            h('div', { className: 'signal-meta muted' }, `Sent to Planner: ${formatTimestamp(handoff.createdAt)}`),
            h('div', { className: 'signal-meta muted' }, `Source: ${handoff.sourceNodeId || 'context input'}`),
            h('div', { className: 'confidence-pill' }, `${Math.round((handoff.confidence || 0) * 100)}% confidence | ${handoff.status}`),
            h('div', { className: 'muted' }, handoff.constraints?.length ? `Constraints: ${handoff.constraints.join(' | ')}` : 'Constraints: none surfaced from the latest report.'),
            handoff.truth?.plannerBrief ? h('div', { className: 'truth-inline muted' }, handoff.truth.plannerBrief) : null,
            handoff.tasks?.length
              ? h('ul', { className: 'signal-list' }, handoff.tasks.map((task, index) => h('li', { key: `${handoff.id}-task-${index}` }, task)))
              : h('div', { className: 'signal-empty muted' }, 'No extracted tasks yet.'),
            h('div', { className: 'button-row' },
              handoff.sourceNodeId ? h('button', { className: 'mini', type: 'button', onClick: () => helpers.focusCanvasNode?.(handoff.sourceNodeId) }, 'Open source node') : null,
              h('button', { className: 'mini', type: 'button', onClick: () => helpers.toggleReview?.() }, helpers.reviewPanelOpen ? 'Hide report' : 'Open problem report'),
            ),
          )
        : h('div', { className: 'signal-empty muted' }, section.emptyState || 'No handoff yet.'),
    );
  }
  if (section.kind === 'intent') {
    const report = section.value;
    return h('div', { key: section.id, className: 'inspector-block panel-card' },
      h('div', { className: 'inspector-label' }, section.label),
      report
        ? h(React.Fragment, null,
            h('div', { className: 'confidence-pill' }, `${Math.round((report.confidence || 0) * 100)}% confidence`),
            h('div', { className: 'signal-summary' }, report.summary || 'Intent captured.'),
            h('div', { className: 'signal-meta muted' }, `Source: ${report.nodeId || 'context input'} | Classified as ${report.classification?.role || 'context'}`),
            h('div', { className: 'criteria-list' }, (report.criteria || []).map((criterion) => h('div', { key: criterion.id || criterion.label, className: 'criteria-row' },
              h('span', null, `${criterion.label}: ${Math.round((criterion.score || 0) * 100)}%`),
              h('span', { className: 'muted' }, criterion.reason || ''),
            ))),
            report.tasks?.length ? h('ul', { className: 'signal-list' }, report.tasks.map((task, index) => h('li', { key: `intent-${index}` }, task))) : null,
          )
        : h('div', { className: 'signal-empty muted' }, section.emptyState || 'No intent data.'),
    );
  }
    if (section.kind === 'truth') {
      const truth = section.value && typeof section.value === 'object' ? normalizeTruthPayload(section.value) : null;
    return h('div', { key: section.id, className: 'inspector-block panel-card truth-panel' },
      h('div', { className: 'inspector-label' }, section.label),
      truth
        ? h(React.Fragment, null,
            h('div', { className: 'signal-summary' }, truth.statement || 'No truth statement recorded.'),
            h('div', { className: 'signal-meta muted' }, truth.intentType || 'Intent type unavailable.'),
            h('div', { className: 'truth-grid' },
              h('div', { className: 'truth-block' },
                h('div', { className: 'muted truth-block-label' }, 'Planner brief'),
                h('div', null, truth.plannerBrief || 'Planner brief unavailable.'),
              ),
              h('div', { className: 'truth-block' },
                h('div', { className: 'muted truth-block-label' }, 'Source input'),
                h('div', null, truth.rawInput || 'No raw input recorded.'),
              ),
            ),
            truth.requestedOutcomes?.length
              ? h('div', { className: 'truth-block' },
                  h('div', { className: 'muted truth-block-label' }, 'Requested outcomes'),
                  h('ul', { className: 'signal-list' }, truth.requestedOutcomes.map((item, index) => h('li', { key: `truth-outcome-${index}` }, item))),
                )
              : null,
            truth.unresolved?.length
              ? h('div', { className: 'truth-block truth-block-warning' },
                  h('div', { className: 'muted truth-block-label' }, 'Still unresolved'),
                  h('ul', { className: 'signal-list' }, truth.unresolved.map((item, index) => h('li', { key: `truth-unresolved-${index}` }, item))),
                )
              : h('div', { className: 'signal-meta muted' }, 'No unresolved truth gaps surfaced from the latest report.'),
            truth.evidence?.length
              ? h('div', { className: 'truth-block' },
                  h('div', { className: 'muted truth-block-label' }, 'Why ACE believes this'),
                  h('ul', { className: 'signal-list' }, truth.evidence.map((item, index) => h('li', { key: `truth-evidence-${index}` }, item))),
                )
              : null,
          )
        : h('div', { className: 'signal-empty muted' }, section.emptyState || 'No core truth data.'),
    );
  }
  if (section.kind === 'metrics') {
    return h('div', { key: section.id, className: 'inspector-block panel-card' },
      h('div', { className: 'inspector-label' }, section.label),
      h('div', { className: 'criteria-list desk-metric-list' }, (section.items || []).map((item) => h('div', { key: item.label, className: 'criteria-row' },
        h('span', null, item.label),
        h('span', { className: 'muted' }, item.value),
      ))),
    );
  }
  if (section.kind === 'task-economy') {
    const economy = section.economy || section.value || null;
    const lanes = Array.isArray(economy?.lanes) ? economy.lanes : [];
    const toneForLane = (lane) => {
      if (!lane) return 'warn';
      if (lane.id === 'bottleneck') return 'bad';
      if (lane.id === 'completion' || lane.id === 'reward') return 'good';
      if (lane.id === 'shelved') return 'warn';
      return lane.value > 0 ? 'warn' : 'neutral';
    };
    return h('div', { key: section.id, className: 'inspector-block panel-card task-economy-panel' },
      h('div', { className: 'inline review-header' },
        h('div', null,
          h('div', { className: 'inspector-label' }, section.label),
          h('div', { className: 'signal-summary' }, economy?.headline || section.emptyState || 'No task economy recorded yet.'),
          economy?.detail ? h('div', { className: 'signal-meta muted' }, economy.detail) : null,
        ),
        economy?.selectedLane ? h('div', { className: 'confidence-pill' }, economy.selectedLane.detail || economy.selectedLane.value || 'Selected card') : null,
      ),
      economy
        ? h(React.Fragment, null,
            h('div', { className: 'qa-metric-pill-row task-economy-pill-row' },
              h('span', { className: `qa-metric-pill tone-${economy.pressureTone || 'warn'}` }, `Pressure ${economy.backlogPressure ?? 0}%`),
              h('span', { className: `qa-metric-pill tone-${(economy.momentum || 0) >= 60 ? 'good' : 'warn'}` }, `Momentum ${economy.momentum ?? 0}%`),
              h('span', { className: `qa-metric-pill tone-${(economy.upgradeReadiness || 0) >= 60 ? 'good' : 'warn'}` }, `Upgrade ${economy.upgradeReadiness ?? 0}%`),
              h('span', { className: `qa-metric-pill tone-${(economy.rewardYield || 0) >= 40 ? 'good' : 'warn'}` }, `Reward ${economy.rewardYield ?? 0}%`),
            ),
            h('div', { className: 'task-economy-grid' }, lanes.map((lane) => h('div', {
              key: lane.id,
              className: `task-economy-card tone-${toneForLane(lane)}`,
            },
              h('div', { className: 'task-economy-card-label' }, lane.label),
              h('div', { className: 'task-economy-card-value' }, String(lane.value ?? 0)),
              h('div', { className: 'task-economy-card-detail muted' }, lane.detail || 'No detail recorded.'),
            ))),
            economy.selectedLane ? h('div', { className: 'task-economy-selected panel-card' },
              h('div', { className: 'inspector-label' }, economy.selectedLane.label || 'Selected Card'),
              h('div', { className: 'signal-summary' }, economy.selectedLane.value || 'Selected card'),
              h('div', { className: 'signal-meta muted' }, economy.selectedLane.detail || 'No selected card detail available.'),
            ) : null,
          )
        : h('div', { className: 'signal-empty muted' }, section.emptyState || 'No task economy recorded yet.'),
    );
  }
  if (section.kind === 'qa-summary') {
    const latestRun = section.latestBrowserRun || null;
    return h('div', { key: section.id, className: 'inspector-block panel-card review-panel' },
      h('div', { className: 'inspector-label' }, section.label),
      section.structuredSummary || latestRun || section.localGate?.unit || section.localGate?.studioBoot
        ? h(React.Fragment, null,
            h('div', { className: 'signal-summary' }, section.structuredStatus === 'running' ? 'Structured QA suite is running now.' : (section.structuredSummary || 'No structured QA summary recorded.')),
            h('div', { className: 'signal-meta muted' }, `Scorecards: ${section.scorecardCount || 0} across ${section.scorecardDeskCount || 0} desk${Number(section.scorecardDeskCount || 0) === 1 ? '' : 's'}`),
            latestRun ? h('div', { className: 'signal-meta muted' }, `Browser: ${latestRun.scenario || 'layout-pass'} | ${latestRun.verdict || latestRun.status || 'pending'} | findings ${latestRun.findingCount || 0}`) : null,
            section.localGate?.unit ? h('div', { className: 'signal-meta muted' }, `Unit gate: ${summarizeGateStatus(section.localGate.unit)} | failures ${summarizeGateFailures(section.localGate.unit)}`) : null,
            section.localGate?.studioBoot ? h('div', { className: 'signal-meta muted' }, `Studio boot: ${summarizeGateStatus(section.localGate.studioBoot)} | findings ${section.localGate.studioBoot.findingCount || 0}`) : null,
          )
        : h('div', { className: 'signal-empty muted' }, section.emptyState || 'No QA summary recorded yet.'),
    );
  }
  if (section.kind === 'qa-structured') {
    const report = section.report || null;
    return h('div', { key: section.id, className: 'inspector-block panel-card review-panel' },
      h('div', { className: 'inline review-header' },
        h('div', null,
          h('div', { className: 'inspector-label' }, section.label),
          h('div', { className: 'signal-summary' }, section.busy ? 'Structured QA suite is running...' : (report?.summary || section.emptyState || 'No structured QA report loaded yet.')),
        ),
        helpers.runStructuredQA ? h('button', { className: 'mini', type: 'button', disabled: section.busy, onClick: helpers.runStructuredQA }, section.busy ? 'Running...' : 'Run Structured QA') : null,
      ),
      report
        ? h(React.Fragment, null,
            h('div', { className: 'signal-meta muted' }, `Status: ${report.status || 'unknown'} | Desks ${(report.desks || []).length} | Scorecards ${section.scorecardCount || 0}`),
            (report.failures || []).length
              ? h('ul', { className: 'signal-list' }, report.failures.slice(0, 4).map((failure, index) => h('li', { key: `${section.id}-failure-${index}` }, `${failure.desk}: ${failure.test} | ${failure.reason}`)))
              : h('div', { className: 'signal-meta muted' }, 'No structured QA failures are recorded in the latest suite.'),
          )
        : h('div', { className: 'signal-empty muted' }, section.emptyState || 'No structured QA report loaded yet.'),
    );
  }
  if (section.kind === 'qa-scorecards') {
    return h('div', { key: section.id, className: 'inspector-block panel-card' },
      h('div', { className: 'inspector-label' }, section.label),
      section.suiteSummary ? h('div', { className: 'signal-summary' }, section.suiteSummary) : null,
      (section.cards || []).length
        ? h('div', { className: 'desk-panel-list' }, section.cards.slice(0, 6).map((card) => h('div', { key: card.id || `${card.desk}-${card.testId}`, className: 'desk-panel-item' },
            h('div', { className: 'signal-summary' }, `${card.desk || 'desk'} | ${card.testName || card.testId || 'QA test'}`),
            h('div', { className: 'signal-meta muted' }, `Status: ${card.status || 'pass'} | Overall ${card.overallScore?.value ?? 'n/a'} / ${card.overallScore?.max ?? 4}`),
            card.validation?.summary ? h('div', { className: 'signal-meta muted' }, card.validation.summary) : null,
          )))
        : h('div', { className: 'signal-empty muted' }, section.emptyState || 'No structured QA scorecards recorded yet.'),
    );
  }
  if (section.kind === 'qa-browser') {
    const run = section.latestRun || null;
    return h('div', { key: section.id, className: 'inspector-block panel-card review-panel browser-pass-panel' },
      h('div', { className: 'inline review-header' },
        h('div', null,
          h('div', { className: 'inspector-label' }, section.label),
          h('div', { className: 'signal-summary' }, section.busy ? 'Browser QA is running...' : (run ? `${run.scenario || 'layout-pass'} | ${run.verdict || run.status || 'pending'}` : (section.emptyState || 'No browser pass has been recorded yet.'))),
        ),
        helpers.runBrowserPass ? h('button', { className: 'mini', type: 'button', disabled: section.busy, onClick: helpers.runBrowserPass }, section.busy ? 'Running...' : 'Run Browser Pass') : null,
      ),
      run
        ? h(React.Fragment, null,
            h('div', { className: 'signal-meta muted' }, `Trigger: ${run.trigger || 'manual'} | Findings ${run.findingCount || 0}`),
            run.primaryScreenshot?.url ? h('img', {
              className: 'qa-screenshot-preview',
              alt: 'Latest QA screenshot',
              src: run.primaryScreenshot.url,
            }) : null,
            (run.stepSummary || []).length
              ? h('div', { className: 'qa-step-list' }, run.stepSummary.map((step) => h('div', { key: step.id, className: 'qa-step-row muted' }, `${step.label}: ${step.verdict || step.status}`)))
              : null,
          )
        : h('div', { className: 'signal-empty muted' }, section.emptyState || 'No browser pass has been recorded yet.'),
    );
  }
  if (section.kind === 'qa-local-gates') {
    const unitGate = section.gate?.unit || null;
    const studioBootGate = section.gate?.studioBoot || null;
    return h('div', { key: section.id, className: 'inspector-block panel-card', 'data-qa': 'qa-local-gates-section' },
      h('div', { className: 'inspector-label' }, section.label),
      h('div', { className: 'signal-summary' }, section.summary || section.emptyState || 'No local UI gate results recorded yet.'),
      unitGate ? h('div', { className: 'desk-panel-item' },
        h('div', { className: 'signal-summary' }, 'Fast Unit Gate'),
        h('div', { className: 'signal-meta muted' }, `${unitGate.status || 'pending'} | ${unitGate.passedCount || 0}/${unitGate.totalChecks || 0} checks passed`),
        (unitGate.failures || []).length
          ? h('ul', { className: 'signal-list compact' }, unitGate.failures.slice(0, 3).map((failure) => h('li', { key: failure.name }, `${failure.name}: ${failure.error}`)))
          : h('div', { className: 'signal-meta muted' }, 'No failing fast UI checks in the latest run.'),
      ) : null,
      studioBootGate ? h('div', { className: 'desk-panel-item' },
        h('div', { className: 'signal-summary' }, 'Studio Boot Guardrail'),
        h('div', { className: 'signal-meta muted' }, `${studioBootGate.verdict || studioBootGate.status || 'pending'} | console ${studioBootGate.consoleErrorCount || 0} | network ${studioBootGate.networkFailureCount || 0}`),
        (studioBootGate.failedSteps || []).length
          ? h('ul', { className: 'signal-list compact' }, studioBootGate.failedSteps.map((step) => h('li', { key: step.id }, `${step.label}: ${step.verdict}`)))
          : h('div', { className: 'signal-meta muted' }, 'No failing studio boot steps in the latest guardrail run.'),
      ) : null,
      !unitGate && !studioBootGate ? h('div', { className: 'signal-empty muted' }, section.emptyState || 'No local UI gate results recorded yet.') : null,
    );
  }
  if (section.kind === 'qa-run-history') {
    return h('div', { key: section.id, className: 'inspector-block panel-card' },
      h('div', { className: 'inspector-label' }, section.label),
      (section.items || []).length
        ? h('div', { className: 'desk-panel-list' }, section.items.map((item, index) => h('div', { key: item.id || `${section.id}-${index}`, className: 'desk-panel-item' },
            h('div', { className: 'signal-summary' }, item.summary || 'QA run'),
            item.detail ? h('div', { className: 'signal-meta muted' }, item.detail) : null,
            item.at ? h('div', { className: 'signal-meta muted' }, formatTimestamp(item.at)) : null,
            item.runId && helpers.openQARun ? h('div', { className: 'button-row' },
              h('button', { className: 'mini', type: 'button', onClick: () => helpers.openQARun(item.runId) }, 'Open run'),
            ) : null,
          )))
        : h('div', { className: 'signal-empty muted' }, section.emptyState || 'No browser QA runs recorded yet.'),
    );
  }
  if (section.kind === 'history' || section.kind === 'actions') {
    return h('div', { key: section.id, className: 'inspector-block panel-card' },
      h('div', { className: 'inspector-label' }, section.label),
      (section.items || []).length
        ? h('ul', { className: 'signal-list' }, section.items.map((item, index) => h('li', { key: item.id || `${section.id}-${index}` },
            h('div', null, item.summary || item),
            item.detail ? h('div', { className: 'muted' }, item.detail) : null,
            item.at ? h('div', { className: 'muted' }, formatTimestamp(item.at)) : null,
          )))
        : h('div', { className: 'signal-empty muted' }, section.emptyState || 'No items.'),
    );
  }
  return null;
}

function renderSimLaunchOverlay({
  project = null,
  status = 'Sim launcher unavailable.',
  launchedUrl = '',
  supportedOrigin = '',
  busy = false,
  error = '',
  onLaunch = null,
} = {}) {
  const resolvedOrigin = supportedOrigin || project?.supportedOrigin || '';
  const displayName = project?.name || 'topdown-slice';
  const launchable = Boolean(project?.launchable);
  const buttonLabel = busy ? 'Launching...' : (launchedUrl ? 'Relaunch / Reuse' : 'Launch Sim');
  return h('section', {
    className: 'sim-launch-overlay panel-card',
    'data-qa': 'sim-launch-overlay',
  },
  h('div', { className: 'sim-launch-header' },
    h('div', null,
      h('div', { className: 'inspector-label' }, 'Sim Launch'),
      h('div', { className: 'signal-summary' }, displayName),
    ),
    h('button', {
      className: 'mini',
      type: 'button',
      disabled: busy || !launchable || !onLaunch,
      onClick: onLaunch || undefined,
      'data-qa': 'sim-launch-button',
    }, buttonLabel),
  ),
  resolvedOrigin ? h('div', { className: 'signal-meta muted', 'data-qa': 'sim-launch-supported-origin' }, `Supported URL: ${resolvedOrigin}`) : null,
  h('div', { className: 'signal-meta muted', 'data-qa': 'sim-launch-status' }, status),
  launchedUrl ? h('a', {
    className: 'signal-meta muted sim-launch-link',
    href: launchedUrl,
    target: '_blank',
    rel: 'noreferrer noopener',
    'data-qa': 'sim-launch-url',
  }, `Launched URL: ${launchedUrl}`) : null,
  error ? h('div', { className: 'signal-meta sim-launch-error', 'data-qa': 'sim-launch-error' }, error) : null,
  !launchable && !busy ? h('div', { className: 'signal-meta muted' }, 'topdown-slice launch is currently unavailable in this workspace.') : null,
  );
}

function summarizeHistoryEntry(entry) {
  if (!entry) return '';
  return entry.summary || entry.detail || String(entry);
}

function DeskThoughtBubble({ text, tone = 'idle' }) {
  if (!text) return null;
  return h('div', {
    className: `desk-thought-bubble ${tone}`,
    title: text,
  }, truncateLabel(text, 74));
}

function truncateLabel(text, limit = 26) {
  const value = String(text || '').trim();
  if (!value) return '';
  return value.length > limit ? `${value.slice(0, limit - 1)}â€¦` : value;
}

function buildDeskBadge(agentId, orchestratorState, activePage) {
  const desk = orchestratorState?.desks?.[agentId] || null;
  if (!desk) return null;
  if (desk.statusLabel) return desk.statusLabel;
  if (agentId === 'context-manager' && activePage?.title) return 'Page focus';
  if (desk.localState === 'blocked') return 'Blocked';
  if (desk.localState === 'running') return 'Live';
  if (desk.localState === 'ready') return 'Queued';
  return null;
}

function buildStudioRelationshipLink({
  id,
  from,
  to,
  kind,
  label,
  supports = [],
  validatedBy = [],
  lastActive = null,
  risk = null,
}) {
  const relationship = deriveRelationshipVisual({
    source: from,
    target: to,
    relationshipType: kind,
    supports,
    validatedBy,
    lastActive,
    risk,
  });
  return {
    id,
    from,
    to,
    kind,
    label,
    risk,
    lastActive,
    ...relationship,
  };
}

export function buildStudioLinks(orchestratorState, handoffs) {
  const links = [];
  if (handoffs?.contextToPlanner) {
    const handoff = handoffs.contextToPlanner;
    links.push(buildStudioRelationshipLink({
      id: `handoff-${handoff.id || 'context-planner'}`,
      from: 'context-manager',
      to: 'planner',
      kind: 'handoff',
      label: 'Problem brief',
      supports: [
        ...(Array.isArray(handoff.anchorRefs) ? handoff.anchorRefs : []),
        ...(Array.isArray(handoff.requestedOutcomes) ? handoff.requestedOutcomes : []),
        handoff.status || 'handoff',
      ],
      validatedBy: ['context-manager', 'planner'],
      lastActive: handoff.updatedAt || handoff.createdAt || handoff.id || null,
      risk: handoff.status === 'needs-clarification' ? 'medium' : 'low',
    }));
  }
  const plannerItems = orchestratorState?.desks?.planner?.workItems || [];
  if (plannerItems.length) {
    links.push(buildStudioRelationshipLink({
      id: 'planner-executor',
      from: 'planner',
      to: 'executor',
      kind: 'workflow',
      label: plannerItems.length > 1 ? `${plannerItems.length} plan items` : '1 plan item',
      supports: plannerItems.map((item) => item?.id || item?.title || 'plan-item').slice(0, 4),
      lastActive: plannerItems[0]?.updatedAt || plannerItems[0]?.createdAt || null,
    }));
  }
  const executorItems = orchestratorState?.desks?.executor?.workItems || [];
  if (executorItems.length || plannerItems.length) {
    links.push(buildStudioRelationshipLink({
      id: 'work-to-memory',
      from: 'executor',
      to: 'memory-archivist',
      kind: 'memory',
      label: executorItems.length ? `${executorItems.length} outputs` : 'Artifacts',
      supports: executorItems.map((item) => item?.id || item?.title || 'output').slice(0, 4),
      lastActive: executorItems[0]?.updatedAt || executorItems[0]?.createdAt || null,
    }));
  }
  (orchestratorState?.conflicts || []).forEach((conflict, index) => {
    (conflict.desks || []).forEach((deskId) => {
      if (deskId === 'cto-architect') return;
      links.push(buildStudioRelationshipLink({
        id: `conflict-${index}-${deskId}`,
        from: 'cto-architect',
        to: deskId,
        kind: 'conflict',
        label: conflict.kind === 'low-confidence-context'
          ? 'Low confidence'
          : conflict.kind === 'parallel-plan-execution'
            ? 'Scope overlap'
            : 'Needs review',
        supports: [conflict.kind, ...(Array.isArray(conflict.desks) ? conflict.desks : []), conflict.id || `conflict-${index}`],
        validatedBy: ['cto-architect'],
        lastActive: conflict.updatedAt || conflict.createdAt || null,
        risk: 'high',
      }));
    });
  });
  return links;
}

function buildLaneState(orchestratorState, studioLinks, selfUpgrade) {
  const activeDesks = new Set(orchestratorState?.activeDeskIds || []);
  const linkKinds = new Set((studioLinks || []).map((link) => link.kind));
  const desks = orchestratorState?.desks || {};
  const topLoad = (desks['context-manager']?.workItems?.length || 0) + (desks.planner?.workItems?.length || 0);
  const midLoad = (desks.planner?.workItems?.length || 0) + (desks.executor?.workItems?.length || 0) + (desks['memory-archivist']?.workItems?.length || 0);
  const sideLoad = (orchestratorState?.conflicts?.length || 0) + (desks['cto-architect']?.workItems?.length || 0) + (selfUpgrade?.status && selfUpgrade.status !== 'idle' ? 1 : 0);
  const hasGovernance = linkKinds.has('conflict') || selfUpgrade?.status === 'ready-to-deploy' || selfUpgrade?.status === 'deploying';
  const level = (count) => {
    if (count >= 5) return 3;
    if (count >= 2) return 2;
    if (count >= 1) return 1;
    return 0;
  };
  return {
    top: {
      active: activeDesks.has('context-manager') || activeDesks.has('planner') || linkKinds.has('handoff'),
      tone: linkKinds.has('handoff') ? 'handoff' : 'active',
      strength: level(topLoad),
    },
    mid: {
      active: activeDesks.has('planner') || activeDesks.has('executor') || activeDesks.has('memory-archivist') || linkKinds.has('workflow') || linkKinds.has('memory'),
      tone: linkKinds.has('workflow') ? 'workflow' : (linkKinds.has('memory') ? 'memory' : 'active'),
      strength: level(midLoad),
    },
    side: {
      active: activeDesks.has('cto-architect') || hasGovernance,
      tone: hasGovernance ? 'conflict' : 'active',
      strength: level(sideLoad),
    },
  };
}

function SpatialNotebook({ initialServerHealth = EMPTY_SERVER_HEALTH } = {}) {
  const [graphEngine] = useState(() => new GraphEngine(buildStarterGraph()));
  const [ace] = useState(() => new AceConnector());
  const [memory] = useState(() => new ArchitectureMemory());
  const [mutationEngine] = useState(() => new MutationEngine(graphEngine));

  const [graphLayers, setGraphLayers] = useState(() => normalizeGraphBundle({ graph: buildStarterGraph() }));
  const [activeGraphLayer, setActiveGraphLayer] = useState('system');
  const [graph, setGraph] = useState(graphEngine.getState());
  const [selectedId, setSelectedId] = useState(null);
  const [selectedRelationship, setSelectedRelationship] = useState(null);
  const [canvasViewport, setCanvasViewport] = useState(createDefaultCanvasViewport());
  const [studioViewport, setStudioViewport] = useState(createDefaultStudioViewport());
  const [scene, setScene] = useState(SCENES.CANVAS);
  const [status, setStatus] = useState('ready');
  const [originFilter, setOriginFilter] = useState('all');
  const [preview, setPreview] = useState(null);
  const [normalizedGraphBundlePresent, setNormalizedGraphBundlePresent] = useState(null);
  const [pointerWorld, setPointerWorld] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [simStep, setSimStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [sketchMode, setSketchMode] = useState(false);
  const [sketches, setSketches] = useState([]);
  const [annotations, setAnnotations] = useState([]);
  const [selectedSketchId, setSelectedSketchId] = useState(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState(null);
  const [expandedGeneratedNodeIds, setExpandedGeneratedNodeIds] = useState({});
  const [dashboardState, setDashboardState] = useState({});
  const [recentRuns, setRecentRuns] = useState([]);
  const [recentHistory, setRecentHistory] = useState([]);
  const [agentComments, setAgentComments] = useState(createInitialComments());
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [contextDraft, setContextDraft] = useState('');
  const [scanPreview, setScanPreview] = useState(null);
  const [scannerBusy, setScannerBusy] = useState(false);
  const [executiveResult, setExecutiveResult] = useState(null);
  const [canvasIntentRunState, setCanvasIntentRunState] = useState(EMPTY_CANVAS_INTENT_RUN_STATE);
  const [intentState, setIntentState] = useState(EMPTY_INTENT_STATE);
  const [rsgMeta, setRsgMeta] = useState(() => createDefaultRsgState());
  const [pages, setPages] = useState([createDefaultPage()]);
  const [activePageId, setActivePageId] = useState(null);
  const [openTraceId, setOpenTraceId] = useState(null);
  const [openReportId, setOpenReportId] = useState(null);
  const [openTaskId, setOpenTaskId] = useState(null);
  const [architectureDirty, setArchitectureDirty] = useState(0);
  const [handoffs, setHandoffs] = useState(EMPTY_HANDOFFS);
  const [teamBoard, setTeamBoard] = useState(EMPTY_TEAM_BOARD);
  const [orchestratorState, setOrchestratorState] = useState(EMPTY_ORCHESTRATOR_STATE);
  const [teamBoardWallBoardExpanded, setTeamBoardWallBoardExpanded] = useState(false);
  const [selfUpgrade, setSelfUpgrade] = useState(EMPTY_SELF_UPGRADE);
  const [serverHealth, setServerHealth] = useState(() => ({
    ...EMPTY_SERVER_HEALTH,
    ...(initialServerHealth || {}),
    bootHealth: {
      ...EMPTY_BOOT_HEALTH,
      ...(initialServerHealth?.bootHealth || {}),
    },
  }));
  const [throughputDebug, setThroughputDebug] = useState(EMPTY_THROUGHPUT_DEBUG);
  const [qaState, setQaState] = useState(EMPTY_QA_STATE);
  const [mutationGate, setMutationGate] = useState(EMPTY_MUTATION_GATE);
  const [worldViewMode, setWorldViewMode] = useState(DEFAULT_WORLD_VIEW_MODE);
  const [recentWorldChange, setRecentWorldChange] = useState(null);
  const [showRecentWorldChanges, setShowRecentWorldChanges] = useState(true);
  const [qaRunDetail, setQaRunDetail] = useState(null);
  const [qaScenario, setQaScenario] = useState('layout-pass');
  const [throughputPrompt, setThroughputPrompt] = useState('I think we should add a desk to the studio for a QA agent');
  const [throughputBusy, setThroughputBusy] = useState(false);
  const [simLauncher, setSimLauncher] = useState(EMPTY_SIM_LAUNCHER);
  const [workspaceBannerTitle, setWorkspaceBannerTitle] = useState('ACE Overlay Workspace');
  const [toolbarSectionsOpen, setToolbarSectionsOpen] = useState({
    view: false,
    launch: false,
  });
  const [selfUpgradeTaskId, setSelfUpgradeTaskId] = useState('');
  const [selfUpgradeBusy, setSelfUpgradeBusy] = useState(false);
  const [teamBoardBusy, setTeamBoardBusy] = useState(false);
  const [agentWorkerBusyId, setAgentWorkerBusyId] = useState(null);
  const [studioLayout, setStudioLayout] = useState(() => normalizeStudioLayout());
  const [reviewPanelOpen, setReviewPanelOpen] = useState(false);
  const [expandedReviewCardId, setExpandedReviewCardId] = useState(null);
  const [traceLog, setTraceLog] = useState([]);
  const [expandedTraceIds, setExpandedTraceIds] = useState({});
  const [deskPanelState, setDeskPanelState] = useState({ open: false, deskId: null, mode: 'properties' });
  const [deskPanelTab, setDeskPanelTab] = useState('hierarchy');
  const [deskPanelBusy, setDeskPanelBusy] = useState(false);
  const [deskPanelActionBusy, setDeskPanelActionBusy] = useState(false);
  const [deskPanelData, setDeskPanelData] = useState(null);
  const [deskPayloadCache, setDeskPayloadCache] = useState({});
  const [deskManagementDrafts, setDeskManagementDrafts] = useState({});
  const [layoutCatalog, setLayoutCatalog] = useState({ departmentTemplates: [], deskTemplates: [] });
  const [layoutMutationDraft, setLayoutMutationDraft] = useState({
    departmentTemplateId: 'research',
    deskTemplateId: 'report-node',
    deskDepartmentId: 'dept-delivery',
  });
  const [uiActionStatus, setUiActionStatus] = useState({});
  const [layoutMutationFeedback, setLayoutMutationFeedback] = useState(null);
  const [utilityDockOpen, setUtilityDockOpen] = useState(false);
  const [utilityWindows, setUtilityWindows] = useState(() => loadUtilityWindowsState());
  const [taDepartmentPayload, setTaDepartmentPayload] = useState(null);
  const [taDepartmentBusy, setTaDepartmentBusy] = useState(false);
  const [taDepartmentError, setTaDepartmentError] = useState(null);
  const [daveLedger, setDaveLedger] = useState({ entries: [], stats: {} });
  const [daveLedgerLoading, setDaveLedgerLoading] = useState(false);
  const [daveLedgerError, setDaveLedgerError] = useState(null);
  const [daveLedgerDraft, setDaveLedgerDraft] = useState({
    taskPrompt: '',
    generatedOutput: '',
    responseStatus: 'live',
    qaOutcome: 'unknown',
    qaReason: '',
    datasetReady: false,
  });
  const [daveModelOptions, setDaveModelOptions] = useState([]);
  const [davePropertiesForm, setDavePropertiesForm] = useState({
    name: 'Dave',
    role: 'Practical learning companion',
    model: DAVE_DEFAULT_MODEL,
    status: 'idle',
    responseStatus: 'idle',
    backend: 'ollama',
  });
  const [daveFixDrafts, setDaveFixDrafts] = useState({});
  const [ctoEditTargetDeskId, setCtoEditTargetDeskId] = useState('planner');
  const [ctoChatDraft, setCtoChatDraft] = useState('');
  const [ctoChatBusy, setCtoChatBusy] = useState(false);
  const [ctoChatHistory, setCtoChatHistory] = useState([]);
  const [ctoChatStatus, setCtoChatStatus] = useState(() => buildDefaultCtoChatStatus());

  const canvasRef = useRef(null);
  const studioRef = useRef(null);
  const draggingNode = useRef(null);
  const isPanning = useRef(false);
  const connectState = useRef(null);
  const keys = useRef(new Set());
  const raf = useRef(null);
  const activeSketch = useRef(null);
  const studioPanning = useRef(false);
  const studioElementDrag = useRef(null);
  const activeCanvasIntentTraceId = useRef(null);
  const hasLoadedWorkspace = useRef(false);
  const autosaveTimer = useRef(null);
  const pagesSaveTimer = useRef(null);
  const intentSaveTimer = useRef(null);
  const studioStateTimer = useRef(null);
  const architectureSaveTimer = useRef(null);
  const utilityWindowSaveTimer = useRef(null);
  const utilityWindowDrag = useRef(null);
  const ctoChatSubmitLock = useRef(false);
  const lastCanvasViewport = useRef(createDefaultCanvasViewport());
  const lastStudioViewport = useRef(createDefaultStudioViewport());
  const lastScene = useRef(SCENES.CANVAS);

  const graphBundle = useMemo(() => ({
    ...graphLayers,
    [activeGraphLayer]: graph,
  }), [graphLayers, activeGraphLayer, graph]);
  const systemGraph = graphBundle.system || buildStarterGraph();
  const selected = graph.nodes.find((node) => node.id === selectedId) || null;
  const selectedRelationshipId = selectedRelationship?.id || null;
  const selectedRelationshipInspector = useMemo(() => buildRelationshipInspectorPayload(selectedRelationship), [selectedRelationship]);
  const selectedSupportsSecondaryDrafting = Boolean(selected && activeGraphLayer === 'system' && !isPrimaryIntentNode(selected));
  const contextNode = systemGraph.nodes.find((node) => isPrimaryIntentNode(node)) || null;
  const latestIntentReport = intentState.contextReport || intentState.latest || null;
  const notebookState = useMemo(() => normalizeNotebookState({ graph: systemGraph, graphs: graphBundle, intentState, pages, activePageId }), [systemGraph, graphBundle, intentState, pages, activePageId]);
  const activePage = notebookState.activePage;
  const activeLayerNodeTypes = useMemo(() => getNodeTypesForLayer(activeGraphLayer), [activeGraphLayer]);
  const graphInspectorPreviewCount = Array.isArray(preview?.mutations) ? preview.mutations.length : null;
  const graphInspectorLayerRows = GRAPH_LAYERS.map((layer) => {
    const layerGraph = graphBundle[layer] || buildStarterGraph();
    return {
      layer,
      nodes: Array.isArray(layerGraph.nodes) ? layerGraph.nodes.length : 0,
      edges: Array.isArray(layerGraph.edges) ? layerGraph.edges.length : 0,
    };
  });
  const graphInspectorContextNodeFound = Boolean(systemGraph.nodes.find((node) => node?.metadata?.agentId === 'context-manager'));
  const rsgState = useMemo(() => buildRsgState({
    graph: systemGraph,
    graphs: graphBundle,
    rsg: rsgMeta,
    studio: {
      teamBoard,
    },
  }), [systemGraph, graphBundle, teamBoard, rsgMeta]);
  const latestRsgActivity = rsgState.activity?.[0] || null;
  const latestMutationActivity = mutationGate.activity?.[0] || null;
  const worldGraph = graphBundle.world || buildStarterGraph();
  const worldScaffoldNodes = useMemo(() => findWorldScaffoldNodes(graphBundle.world || buildStarterGraph()), [graphBundle]);
  const latestWorldScaffold = worldScaffoldNodes[0] || null;
  const worldScaffoldMeta = latestWorldScaffold?.metadata?.scaffold || null;
  const worldScaffoldField = useMemo(
    () => normalizeScaffoldFieldBundle(worldScaffoldMeta),
    [worldScaffoldMeta],
  );
  const latestTrace = useMemo(() => {
    const activeTraceId = resolveCanvasIntentTraceId(canvasIntentRunState);
    if (!activeTraceId) return traceLog[0] || null;
    return traceLog.find((entry) => entry?.trace_id === activeTraceId) || traceLog[0] || null;
  }, [traceLog, canvasIntentRunState]);
  const latestTraceRawInput = String(
    getLatestTraceStep(latestTrace, 'raw_input')?.data?.raw_input
      || contextNode?.content
      || contextDraft
      || '',
  ).trim();
  const latestTraceIntentObject = getLatestTraceStep(latestTrace, 'intent_object')?.data || null;
  const latestTracePlannerOutput = getLatestTraceStep(latestTrace, 'planner_output')?.data || null;
  const latestTraceMutationInput = getLatestTraceStep(
    latestTrace,
    'executor_input',
    (step) => Array.isArray(step?.data),
  )?.data || [];
  const latestTraceMutationOutput = getLatestTraceStep(
    latestTrace,
    'executor_output',
    (step) => step?.data
      && typeof step.data === 'object'
      && (
        Object.prototype.hasOwnProperty.call(step.data, 'status')
        || Object.prototype.hasOwnProperty.call(step.data, 'applied')
        || Object.prototype.hasOwnProperty.call(step.data, 'queued')
        || Object.prototype.hasOwnProperty.call(step.data, 'blocked')
        || Array.isArray(step.data.results)
      ),
  )?.data || null;
  const latestTraceEngineResult = getLatestTraceStep(latestTrace, 'engine_result')?.data || null;
  const currentExecutiveResult = resolveCurrentExecutiveResult(executiveResult, canvasIntentRunState);
  const currentIntentTraceReport = resolveIntentTraceReport({
    scanPreview,
    latestIntentReport,
    canvasIntentRunState,
  });
  const latestMutationPackage = (Array.isArray(currentExecutiveResult?.mutations) && currentExecutiveResult.mutations.length)
    ? currentExecutiveResult.mutations
    : ((Array.isArray(preview?.mutations) && preview.mutations.length) ? preview.mutations : latestTraceMutationInput);
  const latestMutationResult = currentExecutiveResult?.autoApply || latestTraceMutationOutput || null;
  const latestMutationDecisionResults = Array.isArray(latestMutationResult?.results) ? latestMutationResult.results : [];
  const latestMutationEmptyReason = buildMutationTraceEmptyReason({
    canvasIntentRunState,
    executiveResult: currentExecutiveResult,
    latestTracePlannerOutput,
    latestTraceEngineResult,
  });
  const blockedMutationEntries = (mutationGate.activity || []).filter((entry) => entry?.status === 'blocked');
  const recentWorldChangeItems = recentWorldChange?.items || [];
  const recentWorldChangeMeta = recentWorldChange
    ? buildRecentWorldCountsLabel(recentWorldChange.counts || {})
    : 'No recent applied world diff is active in this session.';

  const workspacePayload = useMemo(() => ({
    graph: systemGraph,
    graphs: graphBundle,
    sketches,
    annotations,
    architectureMemory: memory.model,
    agentComments,
    intentState,
    pages,
    activePageId: notebookState.activePageId,
    rsg: rsgState,
    studio: {
      scene,
      selectedAgentId,
      activeGraphLayer,
      worldViewMode,
      handoffs,
      teamBoard,
      orchestrator: orchestratorState,
      selfUpgrade,
      layout: studioLayout,
      canvasViewport,
      studioViewport,
    },
  }), [systemGraph, graphBundle, sketches, annotations, agentComments, intentState, pages, notebookState.activePageId, rsgState, scene, selectedAgentId, activeGraphLayer, worldViewMode, handoffs, teamBoard, orchestratorState, selfUpgrade, studioLayout, canvasViewport, studioViewport, memory]);

  const lightweightWorkspacePayload = useMemo(() => ({
    activePageId,
    selectedDeskId: selectedAgentId,
    selectedTab: deskPanelTab,
    scene,
    activeGraphLayer,
    worldViewMode,
    camera: studioViewport,
    zoom: canvasViewport?.zoom,
    openTraceId,
    openReportId,
    openTaskId,
  }), [activePageId, selectedAgentId, deskPanelTab, scene, activeGraphLayer, worldViewMode, studioViewport, canvasViewport, openTraceId, openReportId, openTaskId]);

  const slimIntentStatePayload = useMemo(() => {
    const source = intentState.contextReport || intentState.latest || null;
    return {
      currentIntentId: source?.currentIntentId || source?.id || null,
      summary: source?.summary || '',
      status: source?.status || 'idle',
    };
  }, [intentState]);

  const slimStudioStatePayload = useMemo(() => buildStudioStatePayload({
    handoffs,
    teamBoard,
  }), [handoffs, teamBoard]);

  const qaStateForSnapshots = useMemo(() => {
    if (!qaRunDetail) return qaState;
    return {
      ...qaState,
      latestBrowserRun: qaRunDetail,
      browserRuns: [qaRunDetail, ...(qaState.browserRuns || []).filter((entry) => entry?.id !== qaRunDetail.id)],
    };
  }, [qaState, qaRunDetail]);

  const agentSnapshots = useMemo(() => buildAgentSnapshots({
    workspace: workspacePayload,
    dashboardState,
    runs: recentRuns,
    agentComments,
    recentHistory,
    qaState: qaStateForSnapshots,
  }), [workspacePayload, dashboardState, recentRuns, agentComments, recentHistory, qaStateForSnapshots]);
  const coreAgentAttempts = agentSnapshots
    .filter((agent) => ['context-manager', 'planner', 'executor'].includes(agent.id))
    .map((agent) => ({
      id: agent.id,
      name: agent.name,
      ...buildAgentAttemptSummary(agent),
    }));

  const selectedAgent = agentSnapshots.find((agent) => agent.id === selectedAgentId) || null;
  const latestRun = recentRuns[0] || null;
  const architectureMemory = useMemo(() => ({
    subsystems: memory.model.subsystems,
    modules: memory.model.modules,
    world: memory.model.world,
    adapters: memory.model.adapters,
    proposals: memory.model.proposals,
    rules: memory.model.rules,
    layers: memory.model.layers,
  }), [memory, graphBundle]);
  const studioRenderModel = useMemo(() => buildStudioRenderModel(studioLayout, agentSnapshots), [studioLayout, agentSnapshots]);
  const studioRoom = studioLayout.bounds || studioLayout.room || STUDIO_ROOM;
  const teamBoardFrame = studioLayout.whiteboards?.teamBoard || DEFAULT_STUDIO_WHITEBOARDS.teamBoard;
  const studioDeskMap = studioRenderModel.deskMap || {};
  const studioDeskEntries = studioRenderModel.desks || [];
  const studioDeskOptions = studioDeskEntries.map((desk) => ({
    id: desk.id,
    label: desk.name || desk.label || desk.id,
    departmentLabel: desk.department?.label || 'Department',
  }));
  const studioDeskLabelById = Object.fromEntries(studioDeskOptions.map((desk) => [desk.id, desk.label]));
  const managedDeskOptions = studioDeskOptions.filter((desk) => desk.id !== CONTROL_CENTRE_DESK_ID);
  const getStudioDeskLabel = useCallback((deskId) => studioDeskLabelById[deskId] || deskId || 'Desk', [studioDeskLabelById]);
  const rosterSurfaceModel = useMemo(() => buildRosterSurfaceModel(taDepartmentPayload || {}), [taDepartmentPayload]);
  const resourceSignalModel = useMemo(() => buildResourceSignalModel({
    orgHealthModel: studioRenderModel.orgHealth,
    relationshipSignals: rosterSurfaceModel.hiringSignals,
  }), [studioRenderModel.orgHealth, rosterSurfaceModel.hiringSignals]);

  const getDeskPayload = useCallback((deskId) => {
    if (!deskId) return null;
    if (deskPanelData?.deskId === deskId) return deskPanelData;
    return deskPayloadCache[deskId] || null;
  }, [deskPanelData, deskPayloadCache]);

  const loadDeskPanel = async (deskId, options = {}) => {
    if (!deskId) return;
    const { silent = false } = options;
    if (!silent) setDeskPanelBusy(true);
    try {
      const payload = await ace.getDeskProperties(deskId);
      setDeskPayloadCache((current) => ({
        ...current,
        [deskId]: payload,
      }));
      setDeskPanelData(payload);
      setStatus(`desk properties loaded: ${deskId}`);
      console.debug('[desk-properties-panel] sources', payload.sources);
    } catch (error) {
      setStatus(error.message);
    } finally {
      if (!silent) setDeskPanelBusy(false);
    }
  };

  const loadLayoutCatalog = useCallback(async () => {
    try {
      const payload = await ace.getStudioLayoutCatalog();
      setLayoutCatalog({
        departmentTemplates: Array.isArray(payload.departmentTemplates) ? payload.departmentTemplates : [],
        deskTemplates: Array.isArray(payload.deskTemplates) ? payload.deskTemplates : [],
      });
    } catch (error) {
      console.debug('[studio-layout] catalog load failed', error);
    }
  }, [ace]);

  const loadTaDepartmentPanel = useCallback(async (options = {}) => {
    const { silent = false } = options;
    if (!silent) setTaDepartmentBusy(true);
    try {
      const payload = await ace.getTaDepartment();
      setTaDepartmentPayload(payload);
      setTaDepartmentError(null);
    } catch (error) {
      setTaDepartmentError(error.message);
      if (!silent) {
        setStatus(error.message);
      }
    } finally {
      if (!silent) setTaDepartmentBusy(false);
    }
  }, [ace, setStatus]);

  const updateUiActionStatus = useCallback((actionId, nextStatus) => {
    const id = String(actionId || '').trim();
    if (!id) return;
    setUiActionStatus((current) => ({
      ...current,
      [id]: nextStatus,
    }));
  }, []);

  const reconcileUiActionResult = useCallback(async (actionId, outcome = null) => {
    const result = outcome?.result || null;
    if (!result) {
      return outcome;
    }
    if (actionId === 'add_department' || actionId === 'add_desk') {
      const feedback = buildMutationFeedback(actionId, outcome);
      setLayoutMutationFeedback(feedback);
      if (!feedback.shouldCommit) {
        const blockedMessage = feedback.message || 'Dependency validation blocked the mutation.';
        setStatus(blockedMessage);
        console.debug('[studio-layout] action blocked', {
          action: actionId,
          blockers: Array.isArray(feedback.validation?.blockers) ? feedback.validation.blockers : [],
        });
        return outcome;
      }
      const nextLayout = normalizeStudioLayout(result.layout || {});
      setStudioLayout(nextLayout);
      if (result.catalog) {
        setLayoutCatalog({
          departmentTemplates: Array.isArray(result.catalog.departmentTemplates) ? result.catalog.departmentTemplates : [],
          deskTemplates: Array.isArray(result.catalog.deskTemplates) ? result.catalog.deskTemplates : [],
        });
      } else {
        await loadLayoutCatalog();
      }
      if (result.focusDeskId && hasStudioDesk(nextLayout, result.focusDeskId)) {
        setSelectedAgentId(result.focusDeskId);
        if (deskPanelState.open) {
          setDeskPanelState((current) => (current.open ? { ...current, deskId: result.focusDeskId, mode: 'properties' } : current));
          await loadDeskPanel(result.focusDeskId, { silent: true });
        }
      } else if (deskPanelState.open && deskPanelState.deskId) {
        await loadDeskPanel(deskPanelState.deskId, { silent: true });
      }
      console.debug('[studio-layout] action reconciled', {
        action: actionId,
        createdDepartmentId: result.createdDepartmentId || null,
        createdDeskId: result.createdDeskId || null,
        focusDeskId: result.focusDeskId || null,
        validationStatus: feedback.phase,
      });
      setStatus(feedback.phase === 'warning' ? feedback.message : (actionId === 'add_department' ? 'department added to studio layout' : 'desk added to studio layout'));
    } else if (actionId === 'toggle_utility_dock') {
      setStatus(result.utilityDockOpen ? 'utilities shown' : 'utilities hidden');
    }
    return outcome;
  }, [deskPanelState.deskId, deskPanelState.open, loadDeskPanel, loadLayoutCatalog]);

  const runStudioUiAction = useCallback(async (actionId, overrides = {}) => {
    const payloadPreview = buildActionPayload(actionId, {
      ace,
      layoutMutationDraft,
      utilityDockOpen,
      setUtilityDockOpen,
      ...overrides,
    });
    console.debug('[ui-action] dispatch', { action: actionId, payload: payloadPreview });
    if (actionId === 'add_department' || actionId === 'add_desk') {
      setLayoutMutationFeedback(null);
    }
    const outcome = await runUiAction(actionId, {
      ace,
      layoutMutationDraft,
      utilityDockOpen,
      setUtilityDockOpen,
      setActionStatus: updateUiActionStatus,
      setStatus,
      ...overrides,
    });
    await reconcileUiActionResult(actionId, outcome);
    return outcome;
  }, [ace, layoutMutationDraft, reconcileUiActionResult, setStatus, setUtilityDockOpen, updateUiActionStatus, utilityDockOpen]);
  const layoutMutationBusy = Boolean(uiActionStatus.add_department?.busy || uiActionStatus.add_desk?.busy);
  const rosterUtilityOpen = Boolean(utilityWindows.roster?.open);
  const studioMapUtilityOpen = Boolean(utilityWindows['studio-map']?.open);
  const studioQuickAccessStrip = useMemo(() => buildStudioQuickAccessStrip({
    selectedAgentId,
    deskPanelDeskId: deskPanelState.deskId,
    ctoEditTargetDeskId,
    utilityDockOpen,
    rosterUtilityOpen,
    teamBoardWallBoardExpanded,
  }), [
    ctoEditTargetDeskId,
    deskPanelState.deskId,
    rosterUtilityOpen,
    selectedAgentId,
    teamBoardWallBoardExpanded,
    utilityDockOpen,
  ]);

  function openDeskPropertiesPanel(deskId, mode = 'properties') {
    if (!deskId) return;
    setSelectedAgentId(deskId);
    setDeskPanelState({ open: true, deskId, mode });
    setDeskPanelTab(deskId === 'qa-lead' ? 'qa' : 'hierarchy');
    loadDeskPanel(deskId);
  }

  const closeDeskInspector = useCallback(({ clearSelection = true } = {}) => {
    setDeskPanelState({ open: false, deskId: null, mode: 'properties' });
    setDeskPanelData(null);
    if (clearSelection) setSelectedAgentId(null);
  }, []);

  const openUtilityWindow = useCallback((windowId, options = {}) => {
    if (!windowId) return;
    const targetDeskId = options.targetDeskId || UTILITY_WINDOW_META[windowId]?.deskId || null;
    const defaultState = createDefaultUtilityWindowState(windowId);
    setUtilityDockOpen(true);
    setUtilityWindows((current) => ({
      ...current,
      [windowId]: {
        ...(current[windowId] || defaultState),
        open: true,
        minimized: false,
        targetDeskId,
        docked: options.docked ?? current[windowId]?.docked ?? true,
        position: current[windowId]?.position || defaultState.position,
      },
    }));
  }, []);

  const focusRelationshipEdge = useCallback((edge, selectionSource = 'studio') => {
    if (!edge) return;
    setSelectedId(null);
    setSelectedSketchId(null);
    setSelectedAnnotationId(null);
    setSelectedRelationship({
      ...edge,
      selectionSource,
    });
    openUtilityWindow('relationship');
    setStatus(`relationship selected: ${edge.label || edge.relationshipType || edge.id || 'edge'}`);
  }, [openUtilityWindow]);

  const closeUtilityWindow = useCallback((windowId) => {
    const defaultState = createDefaultUtilityWindowState(windowId);
    setUtilityWindows((current) => ({
      ...current,
      [windowId]: {
        ...(current[windowId] || defaultState),
        open: false,
        minimized: false,
      },
    }));
  }, []);

  const toggleUtilityWindowMinimized = useCallback((windowId) => {
    const defaultState = createDefaultUtilityWindowState(windowId);
    setUtilityWindows((current) => ({
      ...current,
      [windowId]: {
        ...(current[windowId] || defaultState),
        minimized: !current[windowId]?.minimized,
      },
    }));
  }, []);

  const toggleUtilityWindowDocked = useCallback((windowId) => {
    const defaultState = createDefaultUtilityWindowState(windowId);
    setUtilityWindows((current) => ({
      ...current,
      [windowId]: {
        ...(current[windowId] || defaultState),
        docked: !current[windowId]?.docked,
        position: current[windowId]?.position || defaultState.position,
      },
    }));
  }, []);

  const computeDaveContextAlignment = useCallback(() => {
    const summary = (workspacePayload.intentState?.summary || '').toLowerCase();
    const anchors = workspacePayload.studio?.handoffs?.contextToPlanner?.anchorRefs || [];
    const keywords = ['context', 'memory', 'ledger', 'learning', 'intent'];
    const matchedKeywords = keywords.filter((keyword) => summary.includes(keyword)).length;
    const anchorScore = Math.min(1, anchors.length / 4);
    const keywordScore = Math.min(0.4, matchedKeywords * 0.1);
    const score = Math.min(1, anchorScore + keywordScore);
    const reasonParts = [];
    if (anchors.length) reasonParts.push(`${anchors.length} anchors referenced`);
    if (matchedKeywords) reasonParts.push(`${matchedKeywords} keywords matched`);
    const reason = reasonParts.join(', ') || 'No anchors or keywords matched yet';
    return { score: Math.round(score * 100) / 100, reason };
  }, [workspacePayload]);
  const daveContextAlignment = useMemo(() => computeDaveContextAlignment(), [computeDaveContextAlignment]);

  const loadModelOptions = useCallback(async () => {
    try {
      const payload = await ace.listModelOptions();
      setDaveModelOptions(Array.isArray(payload.models) ? payload.models : []);
    } catch (error) {
      console.debug('[Dave] model options load failed', error);
    }
  }, [ace]);

  useEffect(() => {
    loadModelOptions();
  }, [loadModelOptions]);

  const refreshCtoChatStatus = useCallback(async () => {
    try {
      const payload = await ace.getCtoDeskStatus();
      setCtoChatStatus({
        status: normalizeCtoChatStatus(payload?.status),
        backend: payload?.backend || 'ollama',
        model: payload?.model || null,
        detail: payload?.reason || (payload?.ok ? 'Local CTO model is available.' : 'Live CTO backend is unavailable.'),
        checkedAt: payload?.checkedAt || null,
      });
    } catch (error) {
      const payload = error?.payload || {};
      setCtoChatStatus({
        status: normalizeCtoChatStatus(payload?.status || 'offline'),
        backend: payload?.backend || 'ollama',
        model: payload?.model || null,
        detail: payload?.reason || payload?.error || error.message,
        checkedAt: payload?.checkedAt || null,
      });
    }
  }, [ace]);

  const sendCtoChatMessage = useCallback(async ({ text, confirmActionId = null } = {}) => {
    const prompt = String(text || '').trim();
    if (!prompt) return;
    if (ctoChatSubmitLock.current) return;
    ctoChatSubmitLock.current = true;
    const userEntry = {
      id: `cto-user-${Date.now()}`,
      role: 'user',
      text: prompt,
      replyKind: null,
      status: null,
      action: null,
      backend: null,
      model: null,
      runId: null,
      detail: null,
    };
    const nextHistory = [...ctoChatHistory, userEntry].slice(-12);
    setCtoChatBusy(true);
    setCtoChatHistory(nextHistory);
    setCtoChatDraft('');
    try {
      const response = await ace.askCtoDesk({
        text: prompt,
        confirmActionId,
        history: nextHistory.map((entry) => ({
          id: entry.id,
          role: entry.role,
          text: entry.text,
          action: entry.action || null,
        })),
        source: scene === SCENES.STUDIO ? 'studio-cto-utility' : 'canvas-cto-utility',
      });
      const backendStatus = response?.backendStatus || {};
      setCtoChatStatus({
        status: normalizeCtoChatStatus(backendStatus?.status || response?.status || 'live'),
        backend: response?.backend || backendStatus?.backend || 'ollama',
        model: response?.model || backendStatus?.model || null,
        detail: backendStatus?.reason || (response?.status === 'live' ? 'Live CTO response received.' : 'CTO backend returned a non-live status.'),
        checkedAt: backendStatus?.checkedAt || null,
      });
      setCtoChatHistory((current) => [...current, {
        id: `cto-assistant-${Date.now()}`,
        role: 'assistant',
        text: response?.reply_text || 'No CTO reply text returned.',
        replyKind: response?.replyKind || 'advisory',
        status: normalizeCtoChatStatus(response?.status || backendStatus?.status || 'live'),
        action: response?.action || null,
        execution: response?.execution || null,
        delegation: response?.delegation || null,
        backend: response?.backend || backendStatus?.backend || null,
        model: response?.model || backendStatus?.model || null,
        runId: response?.runId || null,
        detail: backendStatus?.reason || null,
      }].slice(-12));
    } catch (error) {
      const payload = error?.payload || {};
      const backendStatus = payload?.backendStatus || {};
      setCtoChatStatus({
        status: normalizeCtoChatStatus(payload?.status || backendStatus?.status || 'offline'),
        backend: payload?.backend || backendStatus?.backend || 'ollama',
        model: payload?.model || backendStatus?.model || null,
        detail: payload?.reason || payload?.error || backendStatus?.reason || error.message,
        checkedAt: backendStatus?.checkedAt || null,
      });
      setCtoChatHistory((current) => [...current, {
        id: `cto-assistant-${Date.now()}`,
        role: 'assistant',
        text: payload?.reply_text || payload?.error || error.message,
        replyKind: payload?.replyKind || 'blocked',
        status: normalizeCtoChatStatus(payload?.status || backendStatus?.status || 'offline'),
        action: payload?.action || null,
        execution: payload?.execution || null,
        delegation: payload?.delegation || null,
        backend: payload?.backend || backendStatus?.backend || null,
        model: payload?.model || backendStatus?.model || null,
        runId: payload?.runId || null,
        detail: payload?.reason || backendStatus?.reason || null,
      }].slice(-12));
    } finally {
      ctoChatSubmitLock.current = false;
      setCtoChatBusy(false);
    }
  }, [ace, ctoChatHistory, scene]);

  useEffect(() => {
    if (!utilityWindows['cto-chat']?.open) return;
    refreshCtoChatStatus();
    loadTaDepartmentPanel({ silent: true });
  }, [loadTaDepartmentPanel, refreshCtoChatStatus, utilityWindows]);

  useEffect(() => {
    if (!rosterUtilityOpen) return;
    loadTaDepartmentPanel({ silent: false });
  }, [loadTaDepartmentPanel, rosterUtilityOpen]);

  useEffect(() => {
    loadLayoutCatalog();
  }, [loadLayoutCatalog]);

  useEffect(() => {
    if (managedDeskOptions.some((desk) => desk.id === ctoEditTargetDeskId)) return;
    if (managedDeskOptions[0]?.id) {
      setCtoEditTargetDeskId(managedDeskOptions[0].id);
    }
  }, [managedDeskOptions, ctoEditTargetDeskId]);

  useEffect(() => {
    const departmentIds = studioRenderModel.departments.filter((department) => department.id !== 'dept-control').map((department) => department.id);
    if (departmentIds.includes(layoutMutationDraft.deskDepartmentId)) return;
    if (departmentIds[0]) {
      setLayoutMutationDraft((current) => ({ ...current, deskDepartmentId: departmentIds[0] }));
    }
  }, [studioRenderModel.departments, layoutMutationDraft.deskDepartmentId]);

  useEffect(() => {
    const selectedDepartment = studioRenderModel.departments.find((department) => department.id === layoutMutationDraft.deskDepartmentId) || null;
    const allowedTemplateIds = (layoutCatalog.deskTemplates || [])
      .filter((entry) => !Array.isArray(entry.allowedDepartmentKinds) || !entry.allowedDepartmentKinds.length || (selectedDepartment && entry.allowedDepartmentKinds.includes(selectedDepartment.kind)))
      .map((entry) => entry.id);
    if (allowedTemplateIds.includes(layoutMutationDraft.deskTemplateId)) return;
    if (allowedTemplateIds[0]) {
      setLayoutMutationDraft((current) => ({ ...current, deskTemplateId: allowedTemplateIds[0] }));
    }
  }, [layoutCatalog.deskTemplates, studioRenderModel.departments, layoutMutationDraft.deskDepartmentId, layoutMutationDraft.deskTemplateId]);

  const loadSimLauncher = useCallback(async () => {
    try {
      const payload = await ace.getProjects();
      const project = (payload.projects || []).find((entry) => entry?.key === 'topdown-slice') || null;
      setSimLauncher((current) => ({
        ...current,
        project,
        busy: false,
        error: '',
        supportedOrigin: project?.supportedOrigin || current.supportedOrigin,
        status: project
          ? (project.launchable
            ? 'Ready to launch from the canvas layer.'
            : 'Sim launch is listed but not launchable.')
          : 'topdown-slice is not registered in the project list.',
      }));
    } catch (error) {
      setSimLauncher((current) => ({
        ...current,
        project: null,
        busy: false,
        error: '',
        status: `Sim launcher unavailable: ${error.message}`,
      }));
    }
  }, [ace]);

  useEffect(() => {
    loadSimLauncher();
  }, [loadSimLauncher]);

  const runSimLaunch = useCallback(async () => {
    const project = simLauncher.project;
    if (!project?.launchable) {
      const fallbackStatus = project
        ? 'topdown-slice is registered but not launchable.'
        : 'topdown-slice is not available to launch yet.';
      setSimLauncher((current) => ({
        ...current,
        error: '',
        status: fallbackStatus,
      }));
      setStatus(fallbackStatus);
      return;
    }
    setSimLauncher((current) => ({
      ...current,
      busy: true,
      error: '',
      status: `Launching ${project.name || project.key} from the canvas layer...`,
    }));
    try {
      const payload = await ace.runProject(project.key);
      const nextUrl = payload.url || '';
      const nextSupportedOrigin = payload.supportedOrigin || project.supportedOrigin || simLauncher.supportedOrigin;
      const nextStatus = payload.reused
        ? `${project.name || project.key} is already running locally.`
        : `${project.name || project.key} launched successfully.`;
      setSimLauncher((current) => ({
        ...current,
        busy: false,
        error: '',
        launchedUrl: nextUrl,
        supportedOrigin: nextSupportedOrigin,
        status: nextStatus,
      }));
      setStatus(nextStatus);
    } catch (error) {
      const message = `Sim launch failed: ${error.message}`;
      setSimLauncher((current) => ({
        ...current,
        busy: false,
        error: message,
        status: message,
      }));
      setStatus(message);
    }
  }, [ace, setStatus, simLauncher.project, simLauncher.supportedOrigin]);

  const toggleToolbarSection = useCallback((sectionId) => {
    const id = String(sectionId || '').trim();
    if (!id) return;
    setToolbarSectionsOpen((current) => ({
      ...current,
      [id]: !current[id],
    }));
  }, []);

  const loadDaveLedger = useCallback(async () => {
    setDaveLedgerLoading(true);
    setDaveLedgerError(null);
    try {
      const payload = await ace.getAgentLedger('dave');
      setDaveLedger({
        entries: Array.isArray(payload.entries) ? payload.entries : [],
        stats: payload.stats || {},
      });
    } catch (error) {
      setDaveLedgerError(error.message);
    } finally {
      setDaveLedgerLoading(false);
    }
  }, [ace]);

  useEffect(() => {
    if (selectedAgentId === 'dave') loadDaveLedger();
  }, [selectedAgentId, loadDaveLedger]);

  const saveDaveProperties = useCallback(async () => {
    setStatus('Saving Dave properties...');
    try {
      await ace.updateAgentProperties('dave', davePropertiesForm);
      setStatus('Dave properties saved.');
    } catch (error) {
      setStatus(error.message || 'Failed to save Dave properties');
    }
  }, [ace, davePropertiesForm]);

  useEffect(() => {
    if (selectedAgentId !== 'dave' || !selectedAgent) return;
    const workerState = selectedAgent.workerState || {};
    setDavePropertiesForm((previous) => ({
      ...previous,
      name: workerState.name || selectedAgent.name || 'Dave',
      role: workerState.role || selectedAgent.role || 'Practical learning companion',
      model: workerState.model || previous.model || DAVE_DEFAULT_MODEL,
      status: workerState.status || selectedAgent.status || 'idle',
      responseStatus: workerState.responseStatus || previous.responseStatus || 'idle',
      backend: workerState.backend || previous.backend || 'ollama',
    }));
  }, [selectedAgentId, selectedAgent]);

  const submitDaveLedgerEntry = useCallback(async () => {
    setDaveLedgerLoading(true);
    try {
      await ace.createAgentLedgerEntry('dave', {
        ...daveLedgerDraft,
        backend: davePropertiesForm.backend,
        model: davePropertiesForm.model,
        contextAlignmentScore: daveContextAlignment.score,
        contextAlignmentReason: daveContextAlignment.reason,
      });
      setStatus('Dave ledger entry saved');
      setDaveLedgerDraft({
        taskPrompt: '',
        generatedOutput: '',
        responseStatus: 'live',
        qaOutcome: 'unknown',
        qaReason: '',
        datasetReady: false,
      });
      await loadDaveLedger();
    } catch (error) {
      setStatus(error.message || 'Failed to save ledger entry');
    } finally {
      setDaveLedgerLoading(false);
    }
  }, [ace, daveContextAlignment, daveLedgerDraft, davePropertiesForm, loadDaveLedger]);

  const saveDaveLedgerFix = useCallback(async (entryId) => {
    setDaveLedgerLoading(true);
    try {
      const draft = daveFixDrafts[entryId] || {};
      await ace.updateAgentLedgerEntry('dave', entryId, {
        approvedFix: draft.text || '',
        datasetReady: Boolean(draft.datasetReady),
      });
      setStatus('Learning ledger entry updated');
      await loadDaveLedger();
    } catch (error) {
      setStatus(error.message || 'Failed to update ledger entry');
    } finally {
      setDaveLedgerLoading(false);
    }
  }, [ace, daveFixDrafts, loadDaveLedger]);

  async function runDeskPanelAction(action, payload = {}, targetDeskId = null) {
    const deskId = targetDeskId || deskPanelState.deskId;
    if (!deskId) return;
    setDeskPanelActionBusy(true);
    try {
      await ace.updateDeskProperties(deskId, action, payload);
      await loadDeskPanel(deskId);
      setStatus(`${action} updated for ${deskId}`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setDeskPanelActionBusy(false);
    }
  }

  function createTraceId() {
    return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function beginTrace(rawInput) {
    const trace = { trace_id: createTraceId(), steps: [] };
    addTraceStep(trace, 'raw_input', { raw_input: String(rawInput || '') });
    return trace;
  }

  function addTraceStep(trace, stage, data) {
    if (!trace?.trace_id) return trace;
    trace.steps.push({
      stage,
      timestamp: Date.now(),
      data,
    });
    setTraceLog((current) => {
      const withoutCurrent = current.filter((entry) => entry.trace_id !== trace.trace_id);
      return [
        {
          trace_id: trace.trace_id,
          steps: [...trace.steps],
        },
        ...withoutCurrent,
      ].slice(0, TRACE_HISTORY_LIMIT);
    });
    setOpenTraceId(trace.trace_id);
    return trace;
  }

  function isActiveCanvasIntentTrace(traceId) {
    return Boolean(traceId) && activeCanvasIntentTraceId.current === traceId;
  }

  function startCanvasIntentRun(trace, rawInput, forceIntentScan = false) {
    activeCanvasIntentTraceId.current = trace?.trace_id || null;
    setCanvasIntentRunState(createCanvasIntentRunState({
      traceId: trace?.trace_id || null,
      submittedInput: String(rawInput || '').trim(),
      phase: 'routing',
      route: null,
      forceIntentScan,
    }));
    setScanPreview(null);
    setExecutiveResult(null);
    setPreview(null);
  }

  function updateCanvasIntentRun(traceId, updates = {}) {
    if (!isActiveCanvasIntentTrace(traceId)) return false;
    setCanvasIntentRunState((current) => {
      if (current.traceId !== traceId) return current;
      return createCanvasIntentRunState({
        ...current,
        ...(typeof updates === 'function' ? updates(current) : updates),
      });
    });
    return true;
  }

  function buildIntentObject(rawInput, report, traceId) {
    const extractedIntent = report?.extractedIntent || null;
    const firstTask = Array.isArray(report?.tasks) && report.tasks.length ? report.tasks[0] : null;
    return {
      trace_id: traceId,
      action: extractedIntent?.action || firstTask || 'unspecified',
      target: extractedIntent?.target || null,
      parameters: extractedIntent?.parameters || {},
      raw_input: String(rawInput || ''),
    };
  }

  function centerStudioOnRoom(nextStatus = null) {
    const container = studioRef.current;
    if (!container) return;
    const zoom = resolveStudioRoomZoom(container, studioRoom);
    setStudioViewport({
      zoom,
      x: container.clientWidth / 2 - (studioRoom.x + studioRoom.width / 2) * zoom,
      y: container.clientHeight / 2 - (studioRoom.y + studioRoom.height / 2) * zoom,
    });
    if (nextStatus) setStatus(nextStatus);
  }

  function centerStudioOnDesk(agentId, nextStatus = null) {
    const container = studioRef.current;
    const position = studioDeskMap[agentId]?.position || studioLayout.desks?.[agentId] || deskStagePoint(agentId, studioLayout);
    if (!container || !position) return;
    const zoom = agentId === 'cto-architect' ? 1.2 : 1.28;
    setStudioViewport({
      zoom,
      x: container.clientWidth / 2 - position.x * zoom,
      y: container.clientHeight / 2 - position.y * zoom,
    });
    if (nextStatus) setStatus(nextStatus);
  }

  useEffect(() => {
    let cancelled = false;
    loadWorkspace().then((workspace) => {
      if (cancelled) return;
      const graphs = normalizeGraphBundle(workspace);
      setNormalizedGraphBundlePresent(true);
      const storedStudio = workspace.studio || {};
      const initialLayer = GRAPH_LAYERS.includes(storedStudio.activeGraphLayer) ? storedStudio.activeGraphLayer : 'system';
      setGraphLayers(graphs);
      setActiveGraphLayer(initialLayer);
      setWorldViewMode(normalizeWorldViewMode(storedStudio.worldViewMode));
      graphEngine.setState(graphs[initialLayer] || buildStarterGraph());
      setGraph({ ...graphEngine.getState() });
      setSketches(Array.isArray(workspace.sketches) ? workspace.sketches : []);
      setAnnotations(Array.isArray(workspace.annotations) ? workspace.annotations : []);
      setAgentComments(mergeComments(workspace.agentComments));
      if (workspace.architectureMemory) {
        memory.model = {
          ...memory.model,
          ...workspace.architectureMemory,
          layers: workspace.architectureMemory.layers || memory.model.layers,
          rules: workspace.architectureMemory.rules || memory.model.rules,
          versions: workspace.architectureMemory.versions || memory.model.versions,
        };
      }
      setCanvasViewport(storedStudio.canvasViewport || createDefaultCanvasViewport());
      setStudioViewport(storedStudio.studioViewport || createDefaultStudioViewport());
      setScene(storedStudio.scene || SCENES.CANVAS);
      setSelectedAgentId(storedStudio.selectedAgentId || null);
      setDeskPanelTab(storedStudio.selectedTab || workspace.selectedTab || 'hierarchy');
      const notebook = normalizeNotebookState({
        graph: graphs.system || buildStarterGraph(),
        graphs,
        intentState: workspace.intentState || EMPTY_INTENT_STATE,
        pages: workspace.pages,
        activePageId: workspace.activePageId,
      });
      setPages(notebook.pages);
      setActivePageId(notebook.activePageId);
      setHandoffs({
        contextToPlanner: storedStudio.handoffs?.contextToPlanner || null,
        history: Array.isArray(storedStudio.handoffs?.history) ? storedStudio.handoffs.history : [],
      });
      setTeamBoard(normalizeTeamBoardState({
        studio: {
          teamBoard: storedStudio.teamBoard || EMPTY_TEAM_BOARD,
        },
      }));
      setOrchestratorState({
        ...EMPTY_ORCHESTRATOR_STATE,
        ...(storedStudio.orchestrator || {}),
      });
      setSelfUpgrade({
        ...EMPTY_SELF_UPGRADE,
        ...(storedStudio.selfUpgrade || {}),
      });
      setSelfUpgradeTaskId(storedStudio.selfUpgrade?.taskId || '');
      setStudioLayout(normalizeStudioLayout(storedStudio.layout));
      const contextNode = (graphs.system?.nodes || []).find((node) => node.metadata?.agentId === 'context-manager');
      const storedIntentState = workspace.intentState || EMPTY_INTENT_STATE;
      setIntentState({
        latest: storedIntentState.latest || null,
        contextReport: storedIntentState.contextReport || null,
        byNode: storedIntentState.byNode || {},
        reports: Array.isArray(storedIntentState.reports) ? storedIntentState.reports : [],
      });
      setOpenTraceId(workspace.openTraceId || storedStudio.ui?.openTraceId || null);
      setOpenReportId(workspace.openReportId || storedStudio.ui?.openReportId || null);
      setOpenTaskId(workspace.openTaskId || storedStudio.ui?.openTaskId || null);
      setRsgMeta(workspace.rsg || createDefaultRsgState());
      setMutationGate(normalizeMutationGateState(workspace.mutationGate));
      setContextDraft(contextNode?.content || '');
      setScanPreview(storedIntentState.contextReport || null);
      activeCanvasIntentTraceId.current = null;
      setCanvasIntentRunState(EMPTY_CANVAS_INTENT_RUN_STATE);
      hasLoadedWorkspace.current = true;
    }).catch(() => {
      setNormalizedGraphBundlePresent(false);
      activeCanvasIntentTraceId.current = null;
      setCanvasIntentRunState(EMPTY_CANVAS_INTENT_RUN_STATE);
      hasLoadedWorkspace.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, [graphEngine, memory]);

  useEffect(() => {
    memory.syncFromGraph(graphBundle);
    setArchitectureDirty((value) => value + 1);
    drawCanvasScene(
      canvasRef.current,
      graph,
      canvasViewport,
      activeGraphLayer,
      worldViewMode,
      recentWorldChange,
      showRecentWorldChanges,
      connectState.current,
      pointerWorld,
      simulating && !paused ? simStep : -1,
      sketches,
      annotations,
      selectedSketchId,
      selectedAnnotationId,
      selectedRelationshipId,
      selectedAgentId,
      selectedAgent?.name || '',
    );
  }, [graph, graphBundle, canvasViewport, memory, activeGraphLayer, worldViewMode, recentWorldChange, showRecentWorldChanges, pointerWorld, simulating, simStep, paused, sketches, annotations, selectedSketchId, selectedAnnotationId, selectedRelationshipId, selectedAgentId, selectedAgent?.name]);

  useEffect(() => {
    if (selectedRelationship?.selectionSource === 'graph' && selectedRelationshipId && !graph.edges.some((edge) => edge.id === selectedRelationshipId)) {
      setSelectedRelationship(null);
    }
  }, [graph, selectedRelationship, selectedRelationshipId]);

  useEffect(() => {
    setGraphLayers((current) => {
      if (current[activeGraphLayer] === graph) return current;
      return {
        ...current,
        [activeGraphLayer]: graph,
      };
    });
  }, [graph, activeGraphLayer]);

  useEffect(() => {
    setPaused(sketchMode || scene === SCENES.STUDIO);
  }, [sketchMode, scene]);

  useEffect(() => {
    if (scene === SCENES.CANVAS) lastCanvasViewport.current = canvasViewport;
  }, [canvasViewport, scene]);

  useEffect(() => {
    if (scene === SCENES.STUDIO) lastStudioViewport.current = studioViewport;
  }, [studioViewport, scene]);

  useEffect(() => {
    const previousScene = lastScene.current;
    lastScene.current = scene;
    if (scene !== SCENES.STUDIO) return;
    if (!studioRef.current) return;
    if (previousScene !== SCENES.STUDIO) {
      centerStudioOnRoom();
      return;
    }
    if (!isStudioViewportOutOfRange(studioViewport)) return;
    centerStudioOnRoom('studio recentered on room');
  }, [scene, studioViewport, selectedAgentId, studioLayout]);

  useEffect(() => {
    const tick = () => {
      if (scene !== SCENES.CANVAS) {
        raf.current = requestAnimationFrame(tick);
        return;
      }
      const panSpeed = 8;
      let dx = 0;
      let dy = 0;
      if (keys.current.has('w')) dy += panSpeed;
      if (keys.current.has('s')) dy -= panSpeed;
      if (keys.current.has('a')) dx += panSpeed;
      if (keys.current.has('d')) dx -= panSpeed;
      if (dx || dy) setCanvasViewport((viewport) => ({ ...viewport, x: viewport.x + dx, y: viewport.y + dy }));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);

    const down = (event) => {
      const key = event.key.toLowerCase();
      const isEditable = isEditableTarget(event.target) || isEditableTarget(document.activeElement);
      if (isEditable && ['w', 'a', 's', 'd', 'delete', 'backspace'].includes(key)) {
        keys.current.delete(key);
        return;
      }
      if (key === 'tab' && !isEditable) {
        event.preventDefault();
        setScene((current) => (current === SCENES.CANVAS ? SCENES.STUDIO : SCENES.CANVAS));
        setStatus('scene toggled');
        return;
      }
      if ((key === 'delete' || key === 'backspace') && !isEditable) {
        event.preventDefault();
        deleteCurrentSelection();
        return;
      }
      if (isEditable) return;
      if (['w', 'a', 's', 'd'].includes(key)) {
        keys.current.add(key);
        event.preventDefault();
      }
      if (key === 'k' && scene === SCENES.CANVAS) {
        event.preventDefault();
        setSketchMode((value) => !value);
      }
      if (key === 'escape') {
        setSketchMode(false);
        setSelectedSketchId(null);
        setSelectedAnnotationId(null);
        connectState.current = null;
      }
    };

    const up = (event) => keys.current.delete(event.key.toLowerCase());
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);

    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [scene]);

  useEffect(() => {
    if (!simulating || paused) return undefined;
    const timer = setInterval(() => {
      setSimStep((step) => (step + 1) % Math.max(1, graph.edges.length));
    }, 650);
    return () => clearInterval(timer);
  }, [simulating, paused, graph.edges.length]);

  useEffect(() => {
    if (!selected) return undefined;
    if (normalizedNodeContent(selected.content) === normalizedNodeContent(selected.metadata?.lastCommittedContent)) return undefined;
    const eligibility = shouldRunFocusedRsgLoop({
      node: selected,
      trigger: 'idle',
      activeGraphLayer,
      scene,
      selectedId,
      rawContent: selected.content,
    });
    if (!eligibility.ok) return undefined;
    const timer = setTimeout(() => {
      commitNodeIntent(selected.id, selected.content, {
        source: 'node-idle',
        trigger: 'idle',
        recordSkip: false,
      }).catch((error) => setStatus(error.message));
    }, RSG_IDLE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [
    selected?.id,
    selected?.content,
    selected?.metadata?.intentStatus,
    selected?.metadata?.lastCommittedContent,
    selected?.metadata?.rsg?.state,
    activeGraphLayer,
    scene,
    selectedId,
  ]);

  useEffect(() => {
    setOpenReportId(reviewPanelOpen ? 'problem-report' : null);
  }, [reviewPanelOpen]);

  useEffect(() => {
    setOpenTraceId(traceLog?.[0]?.trace_id || null);
  }, [traceLog]);

  useEffect(() => {
    if (!hasLoadedWorkspace.current) return undefined;
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      saveWorkspace(lightweightWorkspacePayload)
        .then(() => setStatus(`autosaved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`))
        .catch((error) => setStatus(`save failed: ${error.message}`));
    }, 700);
    return () => clearTimeout(autosaveTimer.current);
  }, [lightweightWorkspacePayload]);

  useEffect(() => {
    if (!hasLoadedWorkspace.current) return undefined;
    clearTimeout(pagesSaveTimer.current);
    pagesSaveTimer.current = setTimeout(() => {
      savePages({ pages, activePageId }).catch(() => {});
    }, 1500);
    return () => clearTimeout(pagesSaveTimer.current);
  }, [pages, activePageId]);

  useEffect(() => {
    if (!hasLoadedWorkspace.current) return undefined;
    clearTimeout(intentSaveTimer.current);
    intentSaveTimer.current = setTimeout(() => {
      saveIntentState({ intentState: slimIntentStatePayload }).catch(() => {});
    }, 1500);
    return () => clearTimeout(intentSaveTimer.current);
  }, [slimIntentStatePayload]);

  useEffect(() => {
    if (!hasLoadedWorkspace.current) return undefined;
    clearTimeout(studioStateTimer.current);
    studioStateTimer.current = setTimeout(() => {
      saveStudioState(slimStudioStatePayload).catch(() => {});
    }, 1500);
    return () => clearTimeout(studioStateTimer.current);
  }, [slimStudioStatePayload]);

  useEffect(() => {
    if (!hasLoadedWorkspace.current) return undefined;
    clearTimeout(architectureSaveTimer.current);
    architectureSaveTimer.current = setTimeout(() => {
      saveArchitectureMemory({ architectureMemory: memory.model }).catch(() => {});
    }, 1800);
    return () => clearTimeout(architectureSaveTimer.current);
  }, [architectureDirty]);

  useEffect(() => {
    clearTimeout(utilityWindowSaveTimer.current);
    utilityWindowSaveTimer.current = setTimeout(() => {
      saveUtilityWindowsState(utilityWindows);
    }, 150);
    return () => clearTimeout(utilityWindowSaveTimer.current);
  }, [utilityWindows]);

  useEffect(() => {
    if (!hasLoadedWorkspace.current) return;
    if (handoffs.contextToPlanner || !latestIntentReport) return;
    updatePlannerHandoff(latestIntentReport).catch(() => {});
  }, [handoffs.contextToPlanner, latestIntentReport, dashboardState]);

  useEffect(() => {
    if (!hasLoadedWorkspace.current) return;
    setPages((currentPages) => {
      const notebook = normalizeNotebookState({ graph, intentState, pages: currentPages, activePageId });
      return notebook.pages.map((page) => page.id === notebook.activePageId
        ? {
            ...page,
            title: latestIntentReport?.summary ? latestIntentReport.summary.slice(0, 48) : page.title,
            summary: latestIntentReport?.summary || page.summary,
            sourceNodeId: latestIntentReport?.nodeId || page.sourceNodeId,
            updatedAt: new Date().toISOString(),
            handoffs: handoffs.contextToPlanner ? [handoffs.contextToPlanner, ...(page.handoffs || []).filter((entry) => entry.id !== handoffs.contextToPlanner.id)].slice(0, 8) : (page.handoffs || []),
          }
        : page);
    });
  }, [latestIntentReport, handoffs.contextToPlanner, graph, activePageId]);

  async function refreshFeeds() {
    try {
      const [dashboardResponse, runsResponse, historyResponse, runtimeResponse, healthResponse, throughputResponse] = await Promise.all([
        fetch('/api/dashboard'),
        fetch('/api/runs'),
        fetch('/api/spatial/history'),
        fetch('/api/spatial/runtime'),
        fetch('/api/health'),
        fetch('/api/spatial/debug/throughput'),
      ]);
      if (dashboardResponse.ok) {
        const dashboard = await dashboardResponse.json();
        setDashboardState(dashboard.state || {});
      }
      if (runsResponse.ok) {
        const runs = await runsResponse.json();
        setRecentRuns(runs.runs || []);
      }
      if (historyResponse.ok) {
        const history = await historyResponse.json();
        setRecentHistory((history.history || []).slice(-8).reverse());
      }
      if (runtimeResponse.ok) {
        const runtime = await runtimeResponse.json();
        applyRuntimePayload(runtime);
      }
      if (healthResponse.ok) {
        const health = await healthResponse.json();
        const bootHealth = evaluateSpatialBootHealthSnapshot(health);
        writeSpatialSafeModeSession(bootHealth.safeMode, bootHealth.reason);
        setServerHealth(bootHealth.health);
      }
      if (throughputResponse.ok) {
        const throughput = await throughputResponse.json();
        setThroughputDebug({
          ...EMPTY_THROUGHPUT_DEBUG,
          ...(throughput || {}),
        });
      }
    } catch {
      setStatus('feed refresh unavailable');
    }
  }

  useEffect(() => {
    refreshFeeds();
  }, []);

  useInterval(refreshFeeds, 15000);

  useEffect(() => {
    const latestRunId = qaState.latestBrowserRun?.id || qaState.browserRuns?.[0]?.id || null;
    if (!latestRunId) {
      setQaRunDetail(null);
      return;
    }
    if (qaRunDetail?.id === latestRunId) return;
    loadQARunDetails(latestRunId);
  }, [qaState.latestBrowserRun?.id, qaState.browserRuns, qaRunDetail?.id]);

  async function runSelfUpgradePreflight() {
    const taskId = String(selfUpgradeTaskId || '').trim();
    if (!taskId) {
      setStatus('enter a task id before running ACE self-upgrade preflight');
      return;
    }
    setSelfUpgradeBusy(true);
    try {
      const response = await fetch('/api/spatial/self-upgrade/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          project: 'ace-self',
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'self-upgrade preflight failed');
      setSelfUpgrade({
        ...EMPTY_SELF_UPGRADE,
        ...(payload.selfUpgrade || {}),
      });
      setStatus(payload.selfUpgrade?.preflight?.summary || 'self-upgrade preflight completed');
      setSelectedAgentId('cto-architect');
      refreshFeeds();
    } catch (error) {
      setStatus(`self-upgrade preflight failed: ${error.message}`);
    } finally {
      setSelfUpgradeBusy(false);
    }
  }

  async function deploySelfUpgrade() {
    if (!selfUpgrade.apply?.ok) {
      setStatus('apply the self-upgrade patch before requesting deploy');
      return;
    }
    setSelfUpgradeBusy(true);
    try {
      const response = await fetch('/api/spatial/self-upgrade/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmRestart: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'self-upgrade deploy failed');
      setSelfUpgrade({
        ...EMPTY_SELF_UPGRADE,
        ...(payload.selfUpgrade || {}),
      });
      setStatus(payload.restarting ? 'ACE self-upgrade restarting local server' : 'ACE self-upgrade deploy completed');
      if (payload.restarting) {
        setTimeout(refreshFeeds, 2500);
      } else {
        refreshFeeds();
      }
    } catch (error) {
      setStatus(`self-upgrade deploy failed: ${error.message}`);
    } finally {
      setSelfUpgradeBusy(false);
    }
  }

  async function openTaskFolder(taskId) {
    if (!taskId) return;
    try {
      const response = await fetch('/api/open-task-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'unable to open task folder');
      setStatus(`opened legacy task folder ${taskId}`);
      setOpenTaskId(taskId);
    } catch (error) {
      setStatus(`open legacy task folder failed: ${error.message}`);
    }
  }

  async function runThroughputDebug(mode = 'live') {
    if (!throughputPrompt.trim()) {
      setStatus('enter a throughput prompt before running the debug pass');
      return;
    }
    setThroughputBusy(true);
    try {
      const response = await fetch('/api/spatial/debug/throughput', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: throughputPrompt,
          mode,
          project: 'ace-self',
          confirmDeploy: true,
          simulate: mode === 'fixture',
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'throughput debug failed');
      if (payload.runtime) {
        applyRuntimePayload(payload.runtime);
      }
      setThroughputDebug((current) => ({
        ...current,
        latestSession: payload.session || null,
        sessions: payload.session
          ? [payload.session, ...(current.sessions || []).filter((entry) => entry.id !== payload.session.id)].slice(0, 12)
          : current.sessions,
      }));
      if (payload.session?.runnerTaskId) {
        setSelfUpgradeTaskId(payload.session.runnerTaskId);
      }
      setSelectedAgentId('cto-architect');
      setScene(SCENES.STUDIO);
      setStatus(payload.session?.status === 'completed'
        ? `throughput debug passed for ${payload.session.runnerTaskId || 'session'}`
        : `throughput debug ${payload.session?.status || 'completed'} | ${payload.session?.verdict || 'pending'}`);
      setTimeout(refreshFeeds, mode === 'live' ? 2000 : 250);
    } catch (error) {
      setStatus(`throughput debug failed: ${error.message}`);
    } finally {
      setThroughputBusy(false);
    }
  }

  async function loadQARunDetails(runId) {
    if (!runId) {
      setQaRunDetail(null);
      return;
    }
    try {
      const run = await ace.getQARun(runId);
      setQaRunDetail(run || null);
    } catch {
      setQaRunDetail(null);
    }
  }

  async function runStructuredQA() {
    setQaState((current) => ({
      ...current,
      structuredBusy: true,
    }));
    try {
      const payload = await ace.runStructuredQA();
      if (payload.runtime) {
        applyRuntimePayload(payload.runtime);
      } else {
        setQaState((current) => ({
          ...current,
          structuredReport: payload,
          structuredBusy: false,
        }));
      }
      setSelectedAgentId('qa-lead');
      setScene(SCENES.STUDIO);
      setStatus(payload.summary || `structured QA ${payload.status || 'completed'}`);
      if (deskPanelState.open && deskPanelState.deskId === 'qa-lead') {
        loadDeskPanel('qa-lead');
      }
    } catch (error) {
      setQaState((current) => ({
        ...current,
        structuredBusy: false,
      }));
      setStatus(`structured QA failed: ${error.message}`);
    }
  }

  async function runBrowserPass() {
    setQaState((current) => ({
      ...current,
      browserBusy: true,
    }));
    try {
      const payload = await ace.runBrowserPass({
        scenario: qaScenario,
        mode: 'interactive',
        prompt: throughputPrompt,
      });
      if (payload.runtime) {
        applyRuntimePayload(payload.runtime);
      }
      setQaRunDetail(payload.run || null);
      setSelectedAgentId('qa-lead');
      setScene(SCENES.STUDIO);
      setStatus(payload.run?.verdict === 'pass'
        ? `browser pass ${payload.run.scenario} passed`
        : `browser pass ${payload.run?.scenario || qaScenario} ${payload.run?.verdict || 'completed'}`);
      if (deskPanelState.open && deskPanelState.deskId === 'qa-lead') {
        loadDeskPanel('qa-lead');
      }
    } catch (error) {
      setStatus(`browser pass failed: ${error.message}`);
    } finally {
      setQaState((current) => ({
        ...current,
        browserBusy: false,
      }));
    }
  }

  const toWorld = (clientX, clientY) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - canvasViewport.x) / canvasViewport.zoom,
      y: (clientY - rect.top - canvasViewport.y) / canvasViewport.zoom,
    };
  };

  const snapshotGraphState = (source = graphEngine.getState()) => ({
    nodes: [...(source?.nodes || [])],
    edges: [...(source?.edges || [])],
  });

  const switchGraphLayer = (nextLayer) => {
    if (!GRAPH_LAYERS.includes(nextLayer) || nextLayer === activeGraphLayer) return;
    const currentSnapshot = snapshotGraphState();
    const nextLayers = {
      ...graphBundle,
      [activeGraphLayer]: currentSnapshot,
    };
    const nextGraph = nextLayers[nextLayer] || buildStarterGraph();
    graphEngine.setState(nextGraph);
    setGraphLayers(nextLayers);
    setGraph({ ...graphEngine.getState() });
    setActiveGraphLayer(nextLayer);
    setSelectedId(null);
    setSelectedRelationship(null);
    setStatus(`switched to ${GRAPH_LAYER_TITLES[nextLayer] || nextLayer}`);
  };

  const addNodeAt = (position, type = 'text', content = 'new note', metadata = { role: 'thought' }) => {
    const node = createNode({
      type,
      content,
      position,
      metadata: {
        ...metadata,
        origin: metadata.origin || 'user_input',
        graphLayer: activeGraphLayer,
      },
    });
    graphEngine.addNode(node);
    setGraph({ ...graphEngine.getState() });
    setSelectedId(node.id);
    return node;
  };

  const buildPrimaryIntentNodeMetadata = (metadata = {}, overrides = {}) => ({
    ...metadata,
    role: 'context',
    agentId: 'context-manager',
    origin: 'user_input',
    graphLayer: 'system',
    labels: ['primary-input'],
    proposalTarget: 'canvas-intent',
    intentAnalysis: null,
    intentStatus: 'idle',
    rsg: null,
    ...overrides,
  });

  const findContextNode = () => graphEngine.getState().nodes.find((node) => isPrimaryIntentNode(node));

  const upsertContextNode = (content) => {
    if (!content.trim()) return null;
    const existing = findContextNode();
    if (existing) {
      graphEngine.updateNode(existing.id, {
        content,
        type: 'text',
        metadata: buildPrimaryIntentNodeMetadata(existing.metadata, {
          lastCommittedContent: normalizedNodeContent(content),
        }),
      });
      setGraph({ ...graphEngine.getState() });
      setSelectedId(existing.id);
      return existing;
    }
    const position = {
      x: (320 - canvasViewport.x) / canvasViewport.zoom,
      y: (170 - canvasViewport.y) / canvasViewport.zoom,
    };
    const node = createNode({
      type: 'text',
      content,
      position,
      metadata: buildPrimaryIntentNodeMetadata({}, {
        lastCommittedContent: normalizedNodeContent(content),
      }),
    });
    graphEngine.addNode(node);
    setGraph({ ...graphEngine.getState() });
    setSelectedId(node.id);
    return node;
  };

  const captureContextInput = () => {
    if (activeGraphLayer !== 'system') {
      setStatus('Primary canvas intent only routes from the system layer.');
      return null;
    }
    const node = upsertContextNode(contextDraft);
    if (!node) {
      setStatus('Enter primary intent in Canvas Intent before routing.');
      return null;
    }
    setScanPreview(null);
    setStatus('Primary canvas note updated.');
    return graphEngine.getState().nodes.find((entry) => entry.id === node.id) || node;
  };

  const buildRuntimePayloadFromWorkspace = (workspace, fallbackTeamBoard = EMPTY_TEAM_BOARD) => ({
    activePageId: workspace.activePageId,
    pages: workspace.pages,
    handoffs: workspace.studio?.handoffs || EMPTY_HANDOFFS,
    teamBoard: workspace.studio?.teamBoard || fallbackTeamBoard,
    orchestrator: workspace.studio?.orchestrator || EMPTY_ORCHESTRATOR_STATE,
    selfUpgrade: workspace.studio?.selfUpgrade || EMPTY_SELF_UPGRADE,
    activeGraphLayer: workspace.studio?.activeGraphLayer || activeGraphLayer,
    worldViewMode: normalizeWorldViewMode(workspace.studio?.worldViewMode || worldViewMode),
    rsg: workspace.rsg || createDefaultRsgState(),
    mutationGate: normalizeMutationGateState(workspace.mutationGate || mutationGate),
    qaState,
  });

  const syncGraphState = () => setGraph({ ...graphEngine.getState() });

  const recordRsgActivity = (entry) => {
    if (!entry) return entry;
    setRsgMeta((current) => pushRsgActivityEntry(current, entry));
    return entry;
  };

  const applyFocusedRsgLoop = (sourceNode, report, { trigger = 'enter', recordSkip = true } = {}) => {
    const currentSourceNode = graphEngine.getState().nodes.find((node) => node.id === sourceNode?.id) || sourceNode;
    const eligibility = shouldRunFocusedRsgLoop({
      node: currentSourceNode,
      trigger,
      activeGraphLayer,
      scene,
      selectedId,
      rawContent: currentSourceNode?.content,
    });
    if (!eligibility.ok) {
      if (!recordSkip) return { skipped: true, reason: eligibility.reason, entry: null };
      return {
        skipped: true,
        reason: eligibility.reason,
        entry: recordRsgActivity(buildRsgActivityEntry({
          type: 'rsg-skip',
          sourceNode: currentSourceNode,
          report,
          reason: eligibility.reason,
          trigger,
        })),
      };
    }

    const syncResult = mutationEngine.syncDraftNodesFromReport(currentSourceNode, report, {
      layer: activeGraphLayer,
    });
    syncGraphState();
    const activityType = syncResult.generatedNodes.length
      ? (syncResult.replacedNodeIds.length ? 'rsg-replace' : 'rsg-generate')
      : (syncResult.replacedNodeIds.length ? 'rsg-replace' : 'rsg-skip');
    const entry = buildRsgActivityEntry({
      type: activityType,
      sourceNode: currentSourceNode,
      report,
      generationId: syncResult.generationId,
      generatedCount: syncResult.generatedNodes.length,
      replacedCount: syncResult.replacedNodeIds.length,
      reason: syncResult.reason || '',
      trigger,
      at: syncResult.createdAt,
    });
    return {
      skipped: activityType === 'rsg-skip',
      reason: syncResult.reason || '',
      syncResult,
      entry: recordRsgActivity(entry),
    };
  };

  const handleNodeContentChange = (node, content) => {
    const patch = { content };
    const contentChanged = content !== node.content;
    const nextMetadata = { ...(node.metadata || {}) };
    let metadataChanged = false;
    if (contentChanged) {
      if (isLinkedDraftNode(node)) {
        nextMetadata.rsg = {
          ...(nextMetadata.rsg || {}),
          state: 'adopted',
        };
        metadataChanged = true;
      }
      const currentOrigin = nextMetadata.origin || resolveNodeOrigin(node);
      if (['agent_generated', 'system_generated'].includes(currentOrigin) && currentOrigin !== 'agent_edited') {
        nextMetadata.origin = 'agent_edited';
        metadataChanged = true;
      }
    }
    if (metadataChanged) {
      patch.metadata = nextMetadata;
    }
    graphEngine.updateNode(node.id, patch);
    syncGraphState();
  };

  const toggleGeneratedNodeExpansion = (nodeId) => {
    setExpandedGeneratedNodeIds((current) => ({
      ...current,
      [nodeId]: !current[nodeId],
    }));
  };

  const updatePlannerHandoff = async (report) => {
    if (!report) return null;
    const nextIntentState = {
      ...intentState,
      latest: report,
      contextReport: report,
    };
    const nextSlimIntentStatePayload = {
      currentIntentId: report?.currentIntentId || report?.id || null,
      summary: report?.summary || '',
      status: report?.status || 'idle',
    };
    const previousHandoff = handoffs.contextToPlanner;
    const nextHandoff = createPlannerHandoff(report, dashboardState, previousHandoff);
    const nextHandoffs = {
      contextToPlanner: nextHandoff,
      history: [nextHandoff, ...(handoffs.history || []).filter((entry) => entry.id !== nextHandoff.id)].slice(0, 12),
    };
    const notebook = normalizeNotebookState({
      ...workspacePayload,
      intentState: nextIntentState,
      pages,
      activePageId,
    });
    const nextPages = notebook.pages.map((page) => page.id === notebook.activePageId
      ? {
          ...page,
          title: report.summary ? report.summary.slice(0, 48) : page.title,
          summary: report.summary || page.summary,
          sourceNodeId: report.nodeId || page.sourceNodeId,
          updatedAt: new Date().toISOString(),
          handoffs: [nextHandoff, ...(page.handoffs || []).filter((entry) => entry.id !== nextHandoff.id)].slice(0, 8),
        }
      : page);
    setIntentState(nextIntentState);
    setHandoffs(nextHandoffs);
    setPages(nextPages);
    setActivePageId(notebook.activePageId);
    const workspace = await saveWorkspace({
      ...lightweightWorkspacePayload,
      activePageId: notebook.activePageId,
    });
    await Promise.all([
      savePages({ pages: nextPages, activePageId: notebook.activePageId }),
      saveStudioState(buildStudioStatePayload({ handoffs: nextHandoffs, teamBoard })),
      saveIntentState({ intentState: nextSlimIntentStatePayload }),
    ]);
    applyRuntimePayload(buildRuntimePayloadFromWorkspace(workspace, teamBoard));
    return nextHandoff;
  };

  function applyRuntimePayload(runtime, intentOverride = null, options = {}) {
    const runtimeGraphs = runtime?.graphs ? normalizeGraphBundle({ graphs: runtime.graphs }) : graphBundle;
    const runtimeSystemGraph = runtimeGraphs.system || buildStarterGraph();
    const requestedLayer = GRAPH_LAYERS.includes(options.preferredLayer)
      ? options.preferredLayer
      : (GRAPH_LAYERS.includes(runtime?.activeGraphLayer) ? runtime.activeGraphLayer : activeGraphLayer);
    if (runtime?.graphs) {
      const resolvedLayer = runtimeGraphs[requestedLayer] ? requestedLayer : activeGraphLayer;
      const nextActiveGraph = runtimeGraphs[resolvedLayer] || runtimeSystemGraph;
      graphEngine.setState(nextActiveGraph);
      setGraphLayers(runtimeGraphs);
      setGraph({ ...nextActiveGraph });
      if (resolvedLayer !== activeGraphLayer) {
        setActiveGraphLayer(resolvedLayer);
      }
    }
    const runtimeIntentState = intentOverride || runtime.intentState || intentState;
    const notebook = normalizeNotebookState({
      graph: runtimeSystemGraph,
      graphs: runtimeGraphs,
      intentState: runtimeIntentState,
      pages: runtime.pages,
      activePageId: runtime.activePageId,
    });
    if (intentOverride) {
      setIntentState(intentOverride);
    }
    setPages(notebook.pages);
    setActivePageId(notebook.activePageId);
    setHandoffs({
      contextToPlanner: runtime.handoffs?.contextToPlanner || null,
      history: Array.isArray(runtime.handoffs?.history) ? runtime.handoffs.history : [],
    });
    setTeamBoard(normalizeTeamBoardState({
      studio: {
        teamBoard: runtime.teamBoard || EMPTY_TEAM_BOARD,
      },
    }));
    setOrchestratorState({
      ...EMPTY_ORCHESTRATOR_STATE,
      ...(runtime.orchestrator || {}),
    });
    setSelfUpgrade({
      ...EMPTY_SELF_UPGRADE,
      ...(runtime.selfUpgrade || {}),
    });
    if (runtime.rsg) {
      setRsgMeta(runtime.rsg);
    }
    setMutationGate(normalizeMutationGateState(runtime.mutationGate));
    setWorldViewMode(normalizeWorldViewMode(options.worldViewMode || runtime.worldViewMode || worldViewMode));
    if (runtime.throughputDebug) {
      setThroughputDebug({
        ...EMPTY_THROUGHPUT_DEBUG,
        ...(runtime.throughputDebug || {}),
      });
    }
    if (runtime.qaState || runtime.qaDebug) {
      setQaState({
        ...EMPTY_QA_STATE,
        ...(runtime.qaState || {}),
        latestBrowserRun: runtime.qaState?.latestBrowserRun || runtime.qaDebug?.latestRun || null,
        browserRuns: runtime.qaState?.browserRuns || runtime.qaDebug?.runs || [],
        localGate: {
          ...EMPTY_QA_STATE.localGate,
          ...(runtime.qaState?.localGate || runtime.qaDebug?.localGate || {}),
        },
      });
    }
    if (!selfUpgradeTaskId && runtime.selfUpgrade?.taskId) {
      setSelfUpgradeTaskId(runtime.selfUpgrade.taskId);
    }
  }

function syncRecentWorldChange(change = null) {
  const normalized = normalizeRecentWorldChange(change);
  setRecentWorldChange(normalized);
  if (normalized) {
    setShowRecentWorldChanges(true);
  }
  return normalized;
}

  async function runTeamBoardAction(action, cardId, statusMessage) {
    setTeamBoardBusy(true);
    try {
      const payload = await ace.teamBoardAction(action, cardId);
      if (payload.runtime) {
        applyRuntimePayload(payload.runtime);
      }
      if (action === 'approve-apply') {
        setSelectedAgentId('executor');
        setScene(SCENES.STUDIO);
        setExpandedReviewCardId(null);
      }
      if (action === 'reject-to-builder') {
        setSelectedAgentId('planner');
      }
      setStatus(statusMessage || 'team board updated');
    } catch (error) {
      setStatus(`team board action failed: ${error.message}`);
      refreshFeeds();
    } finally {
      setTeamBoardBusy(false);
    }
  }

  async function runExecutorWorkerAssessment() {
    if (!selectedExecutionCard?.id) {
      setStatus('queue or select a mutation package before running executor');
      return;
    }
    const trace = beginTrace(`executor_check:${selectedExecutionCard.id}`);
    setAgentWorkerBusyId('executor');
    try {
      addTraceStep(trace, 'planner_output', {
        card_id: selectedExecutionCard.id,
        execution_package: selectedExecutionCard.executionPackage || null,
      });
      addTraceStep(trace, 'executor_input', {
        cardId: selectedExecutionCard.id,
        mode: 'manual',
      });
      const payload = await ace.runAgentWorker('executor', {
        cardId: selectedExecutionCard.id,
        mode: 'manual',
        trace_id: trace.trace_id,
      });
      addTraceStep(trace, 'executor_output', payload.report || payload);
      addTraceStep(trace, 'engine_result', payload.runtime?.teamBoard || payload.runtime || { status: 'executor-check-complete' });
      if (payload.runtime) {
        applyRuntimePayload(payload.runtime);
      }
      setSelectedAgentId('executor');
      setScene(SCENES.STUDIO);
      const decision = payload.report?.decision ? ` ${String(payload.report.decision).replace(/-/g, ' ')}` : '';
      setStatus(payload.report?.summary
        ? `executor${decision}: ${payload.report.summary}`
        : 'executor assessment complete');
    } catch (error) {
      addTraceStep(trace, 'ERROR', { stage: 'executor', reason: error.message });
      setStatus(`executor run failed: ${error.message}`);
      refreshFeeds();
    } finally {
      setAgentWorkerBusyId(null);
    }
  }

  const scanContextIntent = async ({ forceIntentScan = false } = {}) => {
    if (activeGraphLayer !== 'system') {
      setStatus('Switch to the system layer to use Canvas Intent.');
      return;
    }
    const rawInput = contextDraft.trim();
    if (!rawInput) {
      setStatus('Canvas Intent is empty.');
      return;
    }
    const trace = beginTrace(rawInput);
    startCanvasIntentRun(trace, rawInput, forceIntentScan);
    setScannerBusy(true);
    try {
      const contextNode = captureContextInput();
      if (!isActiveCanvasIntentTrace(trace.trace_id)) return;
      addTraceStep(trace, 'executor_input', { operation: 'executive_route', nodeId: contextNode?.id || null, forceIntentScan });
      const response = await ace.runExecutiveRoute({
        envelope: {
          version: 'ace/studio-envelope.v1',
          entries: [
            {
              type: 'prompt',
              node_id: contextNode?.id || 'prompt-1',
              content: rawInput,
              data: {},
            },
            {
              type: 'constraints',
              node_id: 'constraints-1',
              content: '',
              data: {
                engine_target: 'unreal',
                require_tileable: true,
              },
            },
            {
              type: 'target',
              node_id: 'target-1',
              content: 'Preview in studio',
              data: {
                module_id: 'material_gen',
                export_format: 'manifest',
              },
            },
          ],
        },
        override: {
          force_intent_scan: forceIntentScan,
        },
        trace_id: trace.trace_id,
      });
      if (!isActiveCanvasIntentTrace(trace.trace_id)) return;
      const tracedResponse = attachTraceId(response, trace.trace_id);
      setExecutiveResult(tracedResponse);
      if (tracedResponse.route === 'module' && tracedResponse.preview) {
        addTraceStep(trace, 'executor_output', tracedResponse.preview);
        addTraceStep(trace, 'engine_result', {
          route: 'module',
          status: 'preview-ready',
          mutation_count: 0,
          reason: null,
        });
        updateCanvasIntentRun(trace.trace_id, {
          phase: 'complete',
          route: 'module',
          forceIntentScan: false,
        });
        setStatus(`executive module route complete | ${tracedResponse.preview.artifact_type || 'artifact'} | ${Math.round((tracedResponse.preview.confidence || 0) * 100)}% confidence`);
        return;
      }
      if (tracedResponse.route === 'legacy-fallback') {
        addTraceStep(trace, 'executor_output', tracedResponse.legacy || tracedResponse);
        addTraceStep(trace, 'engine_result', {
          route: 'legacy-fallback',
          status: 'legacy-action-ran',
          mutation_count: 0,
          reason: null,
        });
        updateCanvasIntentRun(trace.trace_id, {
          phase: 'complete',
          route: 'legacy-fallback',
          forceIntentScan: false,
        });
        const legacyAction = tracedResponse.legacy?.action || 'legacy';
        setStatus(`executive fallback ran legacy ${legacyAction}`);
        return;
      }
      if (tracedResponse.route === 'world-scaffold') {
        addTraceStep(trace, 'intent_object', tracedResponse.intent || null);
        addTraceStep(trace, 'planner_output', {
          route: tracedResponse.route,
          summary: formatWorldScaffoldIntent(tracedResponse.intent),
          interpretation: tracedResponse.interpretation || null,
          validation: tracedResponse.validation || tracedResponse.intent?.validation || null,
          evaluation: tracedResponse.evaluation || null,
          final_candidate: tracedResponse.evaluation?.finalCandidate || tracedResponse.intent || null,
          confidence: tracedResponse.intent?.confidence || null,
          mutation_generation: tracedResponse.mutationGeneration || null,
          mutation_count: tracedResponse.mutations?.length || 0,
        });
        addTraceStep(trace, 'executor_input', tracedResponse.mutations || []);
        updateCanvasIntentRun(trace.trace_id, {
          phase: 'routing',
          route: 'world-scaffold',
          forceIntentScan: false,
        });
        if (!isActiveCanvasIntentTrace(trace.trace_id)) return;
        try {
          const applyResponse = await ace.applyMutation(tracedResponse.mutations || []);
          if (!isActiveCanvasIntentTrace(trace.trace_id)) return;
          addTraceStep(trace, 'executor_output', applyResponse.mutationResult || applyResponse);
          const currentRunWorldChange = syncRecentWorldChange(applyResponse.recentWorldChange || null);
          if (applyResponse.runtime) {
            applyRuntimePayload(applyResponse.runtime, null, { preferredLayer: 'world' });
          }
          addTraceStep(trace, 'engine_result', {
            route: 'world-scaffold',
            status: applyResponse.mutationResult?.status || applyResponse.status || 'unknown',
            applied: applyResponse.mutationResult?.applied || 0,
            queued: applyResponse.mutationResult?.queued || 0,
            blocked: applyResponse.mutationResult?.blocked || 0,
          });
          setExecutiveResult({
            ...tracedResponse,
            recentWorldChange: currentRunWorldChange,
            autoApply: applyResponse.mutationResult || applyResponse,
          });
          updateCanvasIntentRun(trace.trace_id, {
            phase: 'complete',
            route: 'world-scaffold',
            forceIntentScan: false,
          });
          setScene(SCENES.CANVAS);
          setStatus(buildMutationApplyStatus(applyResponse.mutationResult || applyResponse));
        } catch (error) {
          if (!isActiveCanvasIntentTrace(trace.trace_id)) return;
          const currentRunWorldChange = syncRecentWorldChange(error?.payload?.recentWorldChange || null);
          if (error?.payload?.runtime) {
            applyRuntimePayload(error.payload.runtime, null, { preferredLayer: 'world' });
          }
          addTraceStep(trace, 'executor_output', error?.payload?.mutationResult || { ok: false, error: error.message });
          addTraceStep(trace, 'engine_result', {
            route: 'world-scaffold',
            status: 'blocked',
            applied: 0,
            queued: 0,
            blocked: 1,
            reason: error?.payload?.mutationResult?.reason || error.message || 'World scaffold apply failed.',
          });
          setExecutiveResult({
            ...tracedResponse,
            recentWorldChange: currentRunWorldChange,
            autoApply: error?.payload?.mutationResult || { status: 'blocked', reason: error.message || 'World scaffold apply failed.' },
          });
          updateCanvasIntentRun(trace.trace_id, {
            phase: 'complete',
            route: 'world-scaffold',
            forceIntentScan: false,
          });
          setScene(SCENES.CANVAS);
          setStatus(buildMutationApplyStatus(error?.payload?.mutationResult || { status: 'blocked', reason: error.message || 'World scaffold apply failed.' }));
        }
        return;
      }
      const reportSource = tracedResponse.report || tracedResponse;
      const report = attachTraceId({
        ...reportSource,
        nodeId: reportSource.nodeId || contextNode?.id || null,
        source: reportSource.source || 'context-intake',
        createdAt: reportSource.createdAt || new Date().toISOString(),
      }, trace.trace_id);
      const intentObject = buildIntentObject(rawInput, { ...report, extractedIntent: tracedResponse.extractedIntent }, trace.trace_id);
      addTraceStep(trace, 'intent_object', intentObject);
      addTraceStep(trace, 'planner_output', { tasks: report.tasks || [], handoff: tracedResponse.handoff || null });
      addTraceStep(trace, 'executor_output', report);
      setScanPreview(report);
      if (contextNode?.id) {
        const currentNode = graphEngine.getState().nodes.find((node) => node.id === contextNode.id);
        graphEngine.updateNode(contextNode.id, {
          type: 'text',
          metadata: buildPrimaryIntentNodeMetadata(currentNode?.metadata || {}, {
            intentAnalysis: report,
            intentStatus: 'ready',
            lastCommittedContent: normalizedNodeContent(rawInput),
          }),
        });
        syncGraphState();
      }
      const nextIntentState = {
        latest: report,
        contextReport: report,
        byNode: contextNode?.id ? { ...(intentState.byNode || {}), [contextNode.id]: report } : (intentState.byNode || {}),
        reports: [report, ...((intentState.reports || []).filter((entry) => entry.nodeId !== contextNode?.id))].slice(0, 24),
      };
      let handoff = tracedResponse.handoff || (tracedResponse.runtime ? tracedResponse.runtime.handoffs?.contextToPlanner : null) || null;
      if (tracedResponse.runtime) {
        applyRuntimePayload(tracedResponse.runtime, nextIntentState);
      } else {
        setIntentState(nextIntentState);
        handoff = await updatePlannerHandoff(report);
      }
      if (!isActiveCanvasIntentTrace(trace.trace_id)) return;
      addTraceStep(trace, 'engine_result', {
        route: forceIntentScan ? 'debug-intent-scan' : 'primary-intent-route',
        generated_nodes: [],
        reason: null,
      });
      updateCanvasIntentRun(trace.trace_id, {
        phase: 'complete',
        route: forceIntentScan ? 'debug-intent-scan' : 'primary-intent-route',
        forceIntentScan,
      });
      setSelectedAgentId('context-manager');
      setStatus(`${forceIntentScan ? 'debug scan' : 'primary route'} | ${Math.round((report.confidence || 0) * 100)}% confidence | ${(report.tasks || []).length} intent items | planner brief ${handoff?.status || 'updated'}`);
    } catch (error) {
      const routePayload = attachTraceId(error?.payload, trace.trace_id);
      if (routePayload?.route === 'world-scaffold') {
        if (!isActiveCanvasIntentTrace(trace.trace_id)) return;
        addTraceStep(trace, 'intent_object', routePayload.intent || null);
        addTraceStep(trace, 'planner_output', {
          route: routePayload.route,
          summary: formatWorldScaffoldIntent(routePayload.intent),
          interpretation: routePayload.interpretation || null,
          validation: routePayload.validation || routePayload.intent?.validation || null,
          evaluation: routePayload.evaluation || null,
          final_candidate: routePayload.evaluation?.finalCandidate || routePayload.intent || null,
          confidence: routePayload.intent?.confidence || null,
          mutation_generation: routePayload.mutationGeneration || null,
          mutation_count: routePayload.mutations?.length || 0,
        });
        addTraceStep(trace, 'executor_output', {
          status: 'blocked',
          reason: routePayload.error || error.message,
          route: routePayload.route,
        });
        addTraceStep(trace, 'engine_result', {
          route: 'world-scaffold',
          status: 'blocked',
          reason: routePayload.error || error.message,
        });
        setExecutiveResult(routePayload);
        updateCanvasIntentRun(trace.trace_id, {
          phase: 'complete',
          route: 'world-scaffold',
          forceIntentScan: false,
        });
        setScene(SCENES.CANVAS);
        setStatus(routePayload.error || error.message);
        return;
      }
      if (routePayload?.route === 'world-edit') {
        if (!isActiveCanvasIntentTrace(trace.trace_id)) return;
        addTraceStep(trace, 'intent_object', routePayload.intent || null);
        addTraceStep(trace, 'planner_output', {
          route: routePayload.route,
          summary: routePayload.intent?.summary || 'Existing-world tile edit request',
          validation: routePayload.validation || routePayload.intent?.validation || null,
          mutation_generation: routePayload.mutationGeneration || null,
          mutation_count: routePayload.mutations?.length || 0,
          supported: routePayload.supported !== false,
        });
        addTraceStep(trace, 'executor_output', {
          status: 'unsupported',
          reason: routePayload.error || routePayload.validation?.reason || error.message,
          route: routePayload.route,
        });
        addTraceStep(trace, 'engine_result', {
          route: 'world-edit',
          status: 'unsupported',
          reason: routePayload.error || routePayload.validation?.reason || error.message,
        });
        setExecutiveResult(routePayload);
        updateCanvasIntentRun(trace.trace_id, {
          phase: 'complete',
          route: 'world-edit',
          forceIntentScan: false,
        });
        setScene(SCENES.CANVAS);
        setStatus(`world edit unsupported | ${routePayload.error || routePayload.validation?.reason || error.message}`);
        return;
      }
      if (!isActiveCanvasIntentTrace(trace.trace_id)) return;
      addTraceStep(trace, 'ERROR', { stage: 'intent_parse', reason: error.message });
      updateCanvasIntentRun(trace.trace_id, {
        phase: 'error',
        route: forceIntentScan ? 'debug-intent-scan' : null,
        forceIntentScan,
      });
      setStatus(`scan failed: ${error.message}`);
    } finally {
      if (isActiveCanvasIntentTrace(trace.trace_id)) {
        setScannerBusy(false);
      }
    }
  };

  const exportExecutiveManifest = async () => {
    if (!executiveResult) {
      setStatus('run the executive route before exporting');
      return;
    }
    try {
      const payload = await ace.exportExecutiveManifest(executiveResult);
      setStatus(`manifest exported to ${payload.manifest_path}`);
    } catch (error) {
      setStatus(`manifest export failed: ${error.message}`);
    }
  };

  const copyExecutiveMetadata = async () => {
    if (!executiveResult?.preview) {
      setStatus('no executive preview metadata to copy');
      return;
    }
    const text = JSON.stringify({
      route: executiveResult.route || null,
      preview: executiveResult.preview,
      module_id: executiveResult.moduleRun?.module_id || null,
    }, null, 2);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setStatus('executive metadata copied');
        return;
      }
      throw new Error('clipboard unavailable');
    } catch (error) {
      setStatus(`copy failed: ${error.message}`);
    }
  };

  const revealExecutiveOutputPaths = () => {
    const paths = executiveResult?.preview?.output_paths || [];
    if (!paths.length) {
      setStatus('no output paths available');
      return;
    }
    setStatus(`output paths: ${paths.join(', ')}`);
  };

  const openAdvancedProperties = (event, node) => {
    event.preventDefault();
    const nextType = window.prompt('Node type', node.type || 'text');
    if (!nextType) return;
    const nextLabels = window.prompt('Labels (comma separated)', (node.metadata?.labels || []).join(', ')) || '';
    graphEngine.updateNode(node.id, {
      type: nextType,
      metadata: {
        ...node.metadata,
        labels: nextLabels.split(',').map((entry) => entry.trim()).filter(Boolean),
        manualOverride: true,
      },
    });
    setGraph({ ...graphEngine.getState() });
    setStatus('advanced properties updated');
  };

  const commitNodeIntent = async (nodeId, rawContent, { source = 'node-enter', trigger = 'enter', recordSkip = true } = {}) => {
    const current = graphEngine.getState().nodes.find((node) => node.id === nodeId);
    if (!current) return;
    const content = (rawContent || '').trim();
    const primaryIntentNode = isPrimaryIntentNode(current);
    graphEngine.updateNode(nodeId, {
      content,
      type: primaryIntentNode ? 'text' : current.type,
      metadata: primaryIntentNode
        ? buildPrimaryIntentNodeMetadata(current.metadata, {
            lastCommittedContent: content,
          })
        : {
            ...(current.metadata || {}),
            origin: 'user_input',
            intentStatus: content ? 'processing' : 'idle',
            lastCommittedContent: content,
          },
    });
    let nextNode = graphEngine.getState().nodes.find((node) => node.id === nodeId);
    let patch = null;
    if (!primaryIntentNode) {
      patch = classifyNode(nextNode, graphEngine.getState(), activeGraphLayer);
      graphEngine.updateNode(nodeId, patch);
    }
    syncGraphState();
    if (primaryIntentNode) {
      setContextDraft(content);
      setScanPreview(null);
      setStatus(content ? PRIMARY_INTENT_REDIRECT_HINT : 'Primary canvas note cleared.');
      return null;
    }
    if (!content) {
      if (!isLinkedDraftNode(current)) {
        const removedDraftIds = mutationEngine.removeLinkedDraftsForSource(nodeId);
        if (removedDraftIds.length) {
          syncGraphState();
          const entry = recordRsgActivity(buildRsgActivityEntry({
            type: 'rsg-replace',
            sourceNode: current,
            reason: 'source-cleared',
            replacedCount: removedDraftIds.length,
            trigger,
          }));
          setStatus(`node updated | ${formatRsgActivity(entry)}`);
          return null;
        }
      }
      setStatus('node updated');
      return;
    }
    const trace = beginTrace(content);
    try {
      addTraceStep(trace, 'executor_input', { operation: 'intent_parse', nodeId, source });
      const response = await ace.parseIntent({
        text: content,
        nodeId,
        source,
        trace_id: trace.trace_id,
      });
      nextNode = graphEngine.getState().nodes.find((node) => node.id === nodeId);
      const report = {
        ...(response.report || response),
        nodeId: (response.report || response).nodeId || nodeId,
        source: (response.report || response).source || source,
        createdAt: (response.report || response).createdAt || new Date().toISOString(),
      };
      const intentObject = buildIntentObject(content, { ...report, extractedIntent: response.extractedIntent }, trace.trace_id);
      addTraceStep(trace, 'intent_object', intentObject);
      addTraceStep(trace, 'planner_output', { tasks: report.tasks || [], handoff: response.handoff || null });
      addTraceStep(trace, 'executor_output', report);
      const mergedLabels = [...new Set([...(patch.metadata?.labels || []), ...(report.classification?.labels || [])])];
      const resolvedRole = nextNode?.metadata?.manualOverride
        ? (nextNode.metadata.role || patch.metadata.role)
        : (report.classification?.role || patch.metadata.role || 'thought');
      graphEngine.updateNode(nodeId, {
        type: nextNode?.metadata?.manualOverride ? (nextNode.type || patch.type) : (resolvedRole === 'thought' ? 'text' : resolvedRole),
        metadata: {
          ...(nextNode?.metadata || {}),
          ...patch.metadata,
          role: resolvedRole,
          labels: mergedLabels,
          intentAnalysis: report,
          intentStatus: 'ready',
          lastCommittedContent: content,
        },
      });
      syncGraphState();
      const nextIntentState = {
        latest: report,
        contextReport: current?.metadata?.agentId === 'context-manager' ? report : intentState.contextReport,
        byNode: { ...(intentState.byNode || {}), [nodeId]: report },
        reports: [report, ...((intentState.reports || []).filter((entry) => entry.nodeId !== nodeId))].slice(0, 24),
      };
      if (response.runtime && current?.metadata?.agentId === 'context-manager') {
        applyRuntimePayload(response.runtime, nextIntentState);
      } else {
        setIntentState(nextIntentState);
      }
      if (current?.metadata?.agentId === 'context-manager') {
        setContextDraft(content);
        setScanPreview(report);
        if (!response.runtime) {
          await updatePlannerHandoff(report);
        }
      }
      const rsgResult = applyFocusedRsgLoop(graphEngine.getState().nodes.find((node) => node.id === nodeId), report, {
        trigger,
        recordSkip,
      });
      addTraceStep(trace, 'engine_result', {
        generated_nodes: rsgResult?.generatedNodes?.map((node) => node.id) || [],
        reason: rsgResult?.reason || null,
      });
      setSelectedAgentId('context-manager');
      setStatus(`secondary draft scan | ${Math.round((report.confidence || 0) * 100)}% confidence | ${(report.tasks || []).length} tasks for ${resolvedRole}${rsgResult?.entry ? ` | ${formatRsgActivity(rsgResult.entry)}` : ''}`);
      return report;
    } catch (error) {
      addTraceStep(trace, 'ERROR', { stage: 'intent_parse', reason: error.message });
      graphEngine.updateNode(nodeId, {
        metadata: {
          ...(graphEngine.getState().nodes.find((node) => node.id === nodeId)?.metadata || {}),
          intentStatus: 'error',
        },
      });
      syncGraphState();
      setStatus('intent parsing unavailable');
    }
  };

  const removeNode = (id) => {
    const currentNode = graphEngine.getState().nodes.find((node) => node.id === id) || null;
    let removedDraftIds = [];
    if (!isLinkedDraftNode(currentNode)) {
      removedDraftIds = mutationEngine.removeLinkedDraftsForSource(id);
    }
    graphEngine.removeNode(id);
    syncGraphState();
    if (removedDraftIds.length && currentNode) {
      recordRsgActivity(buildRsgActivityEntry({
        type: 'rsg-replace',
        sourceNode: currentNode,
        replacedCount: removedDraftIds.length,
        reason: 'source-deleted',
        trigger: 'delete',
      }));
    }
    setExpandedGeneratedNodeIds((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
    if (selectedId === id) setSelectedId(null);
  };

  const deleteCurrentSelection = () => {
    if (selectedId) {
      removeNode(selectedId);
      setStatus('node deleted');
      return;
    }
    if (selectedSketchId) {
      setSketches((previous) => previous.filter((stroke) => stroke.id !== selectedSketchId));
      setSelectedSketchId(null);
      setStatus('sketch deleted');
      return;
    }
    if (selectedAnnotationId) {
      setAnnotations((previous) => previous.filter((note) => note.id !== selectedAnnotationId));
      setSelectedAnnotationId(null);
      setStatus('annotation deleted');
    }
  };

  const beginConnection = (event, nodeId) => {
    event.stopPropagation();
    setSelectedId(nodeId);
    connectState.current = { source: nodeId };
  };

  const completeConnection = (targetId) => {
    if (!connectState.current?.source || connectState.current.source === targetId) {
      connectState.current = null;
      return;
    }
    graphEngine.addEdge(createEdge({ source: connectState.current.source, target: targetId }));
    setGraph({ ...graphEngine.getState() });
    connectState.current = null;
    setStatus('connection updated');
  };

  const newCanvas = () => {
    const nextGraphs = normalizeGraphBundle({});
    graphEngine.clear();
    setGraphLayers(nextGraphs);
    setActiveGraphLayer('system');
    setGraph({ ...graphEngine.getState() });
    setSketches([]);
    setAnnotations([]);
    setSelectedId(null);
    setSelectedSketchId(null);
    setSelectedAnnotationId(null);
    setExpandedGeneratedNodeIds({});
    setCanvasViewport(createDefaultCanvasViewport());
    setScene(SCENES.CANVAS);
    setWorldViewMode(DEFAULT_WORLD_VIEW_MODE);
    setContextDraft('');
    setScanPreview(null);
    setPreview(null);
    setIntentState({
      latest: null,
      contextReport: null,
      byNode: {},
      reports: [],
    });
    setRsgMeta(createDefaultRsgState());
    setMutationGate(EMPTY_MUTATION_GATE);
    setRecentWorldChange(null);
    setShowRecentWorldChanges(true);
    setHandoffs(EMPTY_HANDOFFS);
    setTeamBoard(EMPTY_TEAM_BOARD);
    const newPage = createDefaultPage();
    setPages([newPage]);
    setActivePageId(newPage.id);
    setOrchestratorState(EMPTY_ORCHESTRATOR_STATE);
    setExecutiveResult(null);
    activeCanvasIntentTraceId.current = null;
    setCanvasIntentRunState(EMPTY_CANVAS_INTENT_RUN_STATE);
    setTraceLog([]);
    setOpenTraceId(null);
    setExpandedTraceIds({});
    setStatus('new blank canvas ready');
  };

  const focusStudioAgent = (agentId) => {
    setSelectedAgentId(agentId);
    centerStudioOnDesk(agentId);
    setReviewPanelOpen(false);
    setScene(SCENES.STUDIO);
    openDeskPropertiesPanel(agentId, 'properties');
  };

  const resetStudioView = () => {
    centerStudioOnRoom('studio recentered on room');
  };

  const focusCanvasNode = (nodeId) => {
    if (activeGraphLayer !== 'system' && systemGraph.nodes.some((entry) => entry.id === nodeId)) {
      const nextGraph = graphBundle.system || buildStarterGraph();
      graphEngine.setState(nextGraph);
      setGraphLayers(graphBundle);
      setGraph({ ...graphEngine.getState() });
      setActiveGraphLayer('system');
    }
    const activeGraph = activeGraphLayer === 'system' ? (graphBundle.system || graphEngine.getState()) : graphEngine.getState();
    const node = (activeGraph.nodes || []).find((entry) => entry.id === nodeId);
    const container = canvasRef.current;
    if (!node || !container) return;
    const rect = container.getBoundingClientRect();
    const zoom = Math.max(canvasViewport.zoom, STUDIO_ZOOM_THRESHOLD + 0.12);
    setCanvasViewport({
      zoom,
      x: rect.width / 2 - node.position.x * zoom - 115 * zoom,
      y: rect.height / 2 - node.position.y * zoom - 58 * zoom,
    });
    setSelectedId(nodeId);
    setReviewPanelOpen(false);
    setScene(SCENES.CANVAS);
    setStatus('reviewing intent on canvas');
  };

  const reviewSelectedAgent = () => {
    if (selectedAgentId === 'memory-archivist' && selectedAgent?.deskSnapshot?.handoff) {
      setReviewPanelOpen((value) => !value);
      setStatus('reviewing planner handoff report in studio');
      return;
    }
    setStatus('no focused review target available');
  };

  const onCanvasDblClick = (event) => addNodeAt(toWorld(event.clientX, event.clientY));

  const onNodeMouseDown = (event, node) => {
    if (sketchMode || scene !== SCENES.CANVAS) return;
    event.stopPropagation();
    setSelectedId(node.id);
    setSelectedRelationship(null);
    if (event.shiftKey) {
      connectState.current = { source: node.id };
      return;
    }
    draggingNode.current = { id: node.id };
    document.body.classList.add('canvas-dragging');
  };

  const onCanvasMouseMove = (event) => {
    if (scene !== SCENES.CANVAS) return;
    const world = toWorld(event.clientX, event.clientY);
    setPointerWorld(world);

    if (draggingNode.current) {
      const node = graph.nodes.find((entry) => entry.id === draggingNode.current.id);
      if (node) {
        node.position = { x: world.x, y: world.y };
        setGraph({ ...graphEngine.getState() });
      }
    }

    if (activeSketch.current) {
      activeSketch.current.path.push(world);
      setSketches((previous) => previous.map((stroke) => (
        stroke.id === activeSketch.current.id ? { ...stroke, path: [...activeSketch.current.path] } : stroke
      )));
    }

    if (isPanning.current) {
      setCanvasViewport((viewport) => ({ ...viewport, x: viewport.x + event.movementX, y: viewport.y + event.movementY }));
    }
  };

  const onCanvasMouseUp = (event) => {
    if (scene === SCENES.CANVAS && connectState.current?.source && pointerWorld && event?.target === canvasRef.current) {
      const created = addNodeAt(pointerWorld, 'text', 'new note', { role: 'thought' });
      if (created) {
        graphEngine.addEdge(createEdge({ source: connectState.current.source, target: created.id }));
        setGraph({ ...graphEngine.getState() });
        setStatus('node created from connector');
      }
    }
    draggingNode.current = null;
    isPanning.current = false;
    activeSketch.current = null;
    connectState.current = null;
    document.body.classList.remove('canvas-dragging');
  };

  const hitTestStroke = (world) => {
    const threshold = 10 / canvasViewport.zoom;
    for (let index = sketches.length - 1; index >= 0; index -= 1) {
      const stroke = sketches[index];
      for (const point of stroke.path || []) {
        if (Math.hypot(point.x - world.x, point.y - world.y) <= threshold) return stroke.id;
      }
    }
    return null;
  };

  const hitTestAnnotation = (world) => {
    const width = 170;
    const height = 90;
    for (let index = annotations.length - 1; index >= 0; index -= 1) {
      const note = annotations[index];
      const x = note.position?.x || 0;
      const y = note.position?.y || 0;
      if (world.x >= x && world.x <= x + width && world.y >= y && world.y <= y + height) return note.id;
    }
    return null;
  };

  const onCanvasMouseDown = (event) => {
    if (scene !== SCENES.CANVAS || event.target !== canvasRef.current) return;
    const world = toWorld(event.clientX, event.clientY);
    if (sketchMode && event.button === 0) {
      const annotationId = hitTestAnnotation(world);
      const strokeId = annotationId ? null : hitTestStroke(world);
      setSelectedAnnotationId(annotationId);
      setSelectedSketchId(strokeId);
      setSelectedRelationship(null);
      if (annotationId || strokeId) return;
      const stroke = {
        id: `sketch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        path: [world],
        metadata: { tag: null, meaning: null },
      };
      activeSketch.current = stroke;
      setSelectedSketchId(stroke.id);
      setSelectedAnnotationId(null);
      setSketches((previous) => [...previous, stroke]);
      return;
    }
    if (event.button === 0 && !event.shiftKey) {
      const relationshipEdge = hitTestRelationshipEdgeAtPoint(graph, world, canvasViewport);
      if (relationshipEdge) {
        event.preventDefault();
        focusRelationshipEdge(relationshipEdge, 'graph');
        return;
      }
    }
    if (event.button === 1 || event.button === 2 || event.shiftKey) {
      event.preventDefault();
      isPanning.current = true;
      canvasRef.current.focus();
      document.body.classList.add('canvas-dragging');
    }
  };

  const onCanvasDoubleClick = (event) => {
    if (scene !== SCENES.CANVAS) return;
    if (!sketchMode) {
      onCanvasDblClick(event);
      return;
    }
    const position = toWorld(event.clientX, event.clientY);
    const content = window.prompt('New annotation', 'Intent note') || '';
    if (!content.trim()) return;
    const annotation = {
      id: `annotation_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      content: content.trim(),
      position,
      metadata: { tag: null, meaning: null },
    };
    setAnnotations((previous) => [...previous, annotation]);
    setSelectedAnnotationId(annotation.id);
    setSelectedSketchId(null);
  };

  const onCanvasWheel = (event) => {
    if (scene !== SCENES.CANVAS) return;
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.08 : -0.08;
    const nextZoom = clamp(Number((canvasViewport.zoom + delta).toFixed(2)), MIN_CANVAS_ZOOM, MAX_CANVAS_ZOOM);
    const nextViewport = { ...canvasViewport, zoom: nextZoom };
    setCanvasViewport(nextViewport);
    if (sceneFromCanvasZoom(nextZoom) === SCENES.STUDIO) {
      lastCanvasViewport.current = nextViewport;
      setScene(SCENES.STUDIO);
      setStatus(`ACE Studio ready at ${Math.round(nextZoom * 100)}% canvas zoom`);
    }
  };

  const startStudioElementDrag = (event, descriptor) => {
    if (event.button !== 0) return;
    if (descriptor.type === 'desk' && descriptor.id === CONTROL_CENTRE_DESK_ID) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    studioElementDrag.current = {
      ...descriptor,
      startX: event.clientX,
      startY: event.clientY,
      initial: descriptor.type === 'desk'
        ? { ...((studioLayout.desks?.[descriptor.id]?.position || studioLayout.desks?.[descriptor.id]) || deskStagePoint(descriptor.id, studioLayout)) }
        : { ...(studioLayout.whiteboards?.[descriptor.id] || DEFAULT_STUDIO_WHITEBOARDS.teamBoard) },
    };
  };

  const startUtilityWindowDrag = useCallback((event, windowId) => {
    if (event.button !== 0) return;
    if (event.target.closest('button')) return;
    const config = utilityWindows[windowId];
    if (!config || config.docked) return;
    event.preventDefault();
    event.stopPropagation();
    utilityWindowDrag.current = {
      windowId,
      startX: event.clientX,
      startY: event.clientY,
      initial: config.position || getDefaultUtilityWindowPosition(windowId),
    };
  }, [utilityWindows]);

  useEffect(() => {
    const onMouseMove = (event) => {
      if (!utilityWindowDrag.current) return;
      const drag = utilityWindowDrag.current;
      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;
      setUtilityWindows((current) => {
        const existing = current[drag.windowId] || createDefaultUtilityWindowState(drag.windowId);
        return {
          ...current,
          [drag.windowId]: {
            ...existing,
            position: clampUtilityWindowPosition({
              left: drag.initial.left + deltaX,
              top: drag.initial.top + deltaY,
            }),
          },
        };
      });
    };
    const onMouseUp = () => {
      utilityWindowDrag.current = null;
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const onStudioMouseDown = (event) => {
    if (event.target.closest('.agent-station') || event.target.closest('.studio-team-board')) return;
    studioPanning.current = true;
  };

  const onStudioMouseMove = (event) => {
    if (studioElementDrag.current) {
      const drag = studioElementDrag.current;
      const deltaX = (event.clientX - drag.startX) / studioViewport.zoom;
      const deltaY = (event.clientY - drag.startY) / studioViewport.zoom;
      setStudioLayout((current) => {
        const nextLayout = {
          ...current,
          desks: {
            ...(current.desks || {}),
          },
          whiteboards: {
            ...(current.whiteboards || {}),
          },
        };
        if (drag.type === 'desk') {
          nextLayout.desks[drag.id] = {
            ...(current.desks?.[drag.id] || {}),
            position: snapDeskPositionToDepartment({
              x: drag.initial.x + deltaX,
              y: drag.initial.y + deltaY,
            }, drag.id, current),
          };
        } else if (drag.type === 'whiteboard') {
          nextLayout.whiteboards[drag.id] = clampWhiteboardPosition({
            x: drag.initial.x + deltaX,
            y: drag.initial.y + deltaY,
          }, current.bounds || current.room || STUDIO_ROOM);
        }
        return nextLayout;
      });
      return;
    }
    if (!studioPanning.current) return;
    setStudioViewport((viewport) => ({ ...viewport, x: viewport.x + event.movementX, y: viewport.y + event.movementY }));
  };

  const onStudioMouseUp = () => {
    studioPanning.current = false;
    studioElementDrag.current = null;
  };

  const onStudioWheel = (event) => {
    event.preventDefault();
    setStudioViewport((viewport) => {
      const nextZoom = clamp(Number((viewport.zoom + deltaFromWheel(event.deltaY)).toFixed(2)), MIN_STUDIO_ZOOM, MAX_STUDIO_ZOOM);
      const nextViewport = { ...viewport, zoom: nextZoom };
      if (event.deltaY < 0 && nextZoom >= 1.44) {
        const restoreViewport = {
          ...(lastCanvasViewport.current || createDefaultCanvasViewport()),
          zoom: Math.max((lastCanvasViewport.current?.zoom || 1), STUDIO_ZOOM_THRESHOLD + 0.12),
        };
        lastStudioViewport.current = nextViewport;
        setCanvasViewport(restoreViewport);
        setScene(SCENES.CANVAS);
        setStatus('returned to canvas');
      }
      return nextViewport;
    });
  };

  const updateNode = (id, patch) => {
    graphEngine.updateNode(id, patch);
    syncGraphState();
  };

  const saveNow = async () => {
    memory.snapshot('manual-save', { nodes: graph.nodes.length, edges: graph.edges.length });
    await Promise.all([
      saveWorkspace(lightweightWorkspacePayload),
      savePages({ pages, activePageId }),
      saveIntentState({ intentState: slimIntentStatePayload }),
      saveStudioState(slimStudioStatePayload),
      saveArchitectureMemory({ architectureMemory: memory.model }),
    ]);
    setStatus('workspace saved');
  };

  const clearSketchLayer = () => {
    setSketches([]);
    setAnnotations([]);
    setSelectedSketchId(null);
    setSelectedAnnotationId(null);
  };

  const deleteSelection = () => {
    if (selectedSketchId) {
      setSketches((previous) => previous.filter((stroke) => stroke.id !== selectedSketchId));
      setSelectedSketchId(null);
    }
    if (selectedAnnotationId) {
      setAnnotations((previous) => previous.filter((note) => note.id !== selectedAnnotationId));
      setSelectedAnnotationId(null);
    }
  };

  const runAiProcess = async (node) => {
    if (activeGraphLayer !== 'system') {
      setStatus('Secondary drafting only runs on the system graph.');
      return;
    }
    if (isPrimaryIntentNode(node)) {
      setContextDraft(String(node.content || ''));
      setScanPreview(null);
      setStatus(PRIMARY_INTENT_REDIRECT_HINT);
      return;
    }
    if (node.metadata?.intentAnalysis && normalizedNodeContent(node.metadata?.lastCommittedContent) === normalizedNodeContent(node.content)) {
      const result = applyFocusedRsgLoop(node, node.metadata.intentAnalysis, {
        trigger: 'manual',
      });
      if (result?.entry) setStatus(formatRsgActivity(result.entry));
      return;
    }
    await commitNodeIntent(node.id, node.content, {
      source: 'ask-ace',
      trigger: 'manual',
    });
  };

  const approvePreview = async () => {
    const trace = beginTrace('apply preview mutations');
    addTraceStep(trace, 'planner_output', {
      mutation_count: preview?.mutations?.length || 0,
      summary: preview?.summary || [],
    });
    addTraceStep(trace, 'executor_input', preview?.mutations || []);
    try {
      const response = await ace.applyMutation(preview.mutations);
      addTraceStep(trace, 'executor_output', response.mutationResult || response);
      syncRecentWorldChange(response.recentWorldChange || null);
      if (response.runtime) {
        applyRuntimePayload(response.runtime);
      }
      addTraceStep(trace, 'engine_result', {
        nodes: response.runtime?.graphs?.[activeGraphLayer]?.nodes?.length ?? graphEngine.getState().nodes.length,
        edges: response.runtime?.graphs?.[activeGraphLayer]?.edges?.length ?? graphEngine.getState().edges.length,
        confirmed: Boolean(response.confirmed),
        status: response.status || response.mutationResult?.status || 'unknown',
      });
      setPreview(null);
      setStatus(buildMutationApplyStatus(response.mutationResult || response));
    } catch (error) {
      syncRecentWorldChange(error?.payload?.recentWorldChange || null);
      if (error?.payload?.runtime) {
        applyRuntimePayload(error.payload.runtime);
      }
      addTraceStep(trace, 'executor_output', error?.payload?.mutationResult || { ok: false, error: error.message });
      setStatus(buildMutationApplyStatus(error?.payload?.mutationResult || { status: 'blocked', reason: error.message || 'Mutation apply failed' }));
    }
  };

  const addComment = () => {
    if (!selectedAgent || !commentDraft.trim()) return;
    const entry = {
      id: `comment_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text: commentDraft.trim(),
      createdAt: new Date().toISOString(),
    };
    setAgentComments((current) => ({
      ...current,
      [selectedAgent.id]: [...(current[selectedAgent.id] || []), entry],
    }));
    setCommentDraft('');
    setStatus(`comment added for ${selectedAgent.name}`);
  };

  const sceneLabel = scene === SCENES.CANVAS ? 'Canvas' : 'ACE Studio';
  const activeGraphLabel = GRAPH_LAYER_TITLES[activeGraphLayer] || activeGraphLayer;
  const canReviewIntent = selectedAgentId === 'memory-archivist' && !!selectedAgent?.deskSnapshot?.handoff;
  const contextDeskSnapshot = selectedAgent?.agentContext || selectedAgent?.deskSnapshot || null;
  const studioLinks = buildStudioLinks(orchestratorState, handoffs);
  const laneState = buildLaneState(orchestratorState, studioLinks, selfUpgrade);
  const teamBoardColumns = useMemo(() => ({
    plan: (teamBoard.cards || []).filter((card) => card.status === 'plan'),
    active: (teamBoard.cards || []).filter((card) => card.status === 'active'),
    complete: (teamBoard.cards || []).filter((card) => card.status === 'complete'),
    review: (teamBoard.cards || []).filter((card) => card.status === 'review'),
  }), [teamBoard]);
  const selectedExecutionCard = useMemo(() => (
    (teamBoard.cards || []).find((card) => card.id === teamBoard.selectedCardId)
    || (teamBoard.cards || []).find((card) => (
      ['queued', 'applying', 'applied'].includes(card.applyStatus)
      || ['queued', 'deploying', 'deployed', 'flagged', 'failed'].includes(card.deployStatus)
      || card.approvalState === 'approved'
    ))
    || null
  ), [teamBoard]);
  const latestThroughputSession = throughputDebug.latestSession || throughputDebug.sessions?.[0] || null;
  useEffect(() => {
    setOpenTaskId(latestThroughputSession?.runnerTaskId || null);
  }, [latestThroughputSession]);
  const latestQARun = qaRunDetail || qaState.latestBrowserRun || qaState.browserRuns?.[0] || null;
  const teamBoardColumnMeta = {
    plan: { title: 'Plan', empty: 'Planner tasks land here.' },
    active: { title: 'Active', empty: 'Agents are not advancing anything right now.' },
    complete: { title: 'Complete', empty: 'Completed tasks settle here.' },
    review: { title: 'Ready to Apply', empty: 'No risky mutation package is waiting for approval.' },
  };

  useEffect(() => {
    if (expandedReviewCardId && !(teamBoard.cards || []).some((card) => card.id === expandedReviewCardId && card.status === 'review')) {
      setExpandedReviewCardId(null);
    }
  }, [expandedReviewCardId, teamBoard]);

  useEffect(() => {
    if (!deskPanelState.open || !deskPanelState.deskId) return;
    const sourceDeskId = deskPanelState.deskId;
    setSelectedAgentId(sourceDeskId);
    loadDeskPanel(sourceDeskId);
  }, [deskPanelState.open, deskPanelState.deskId]);

  useEffect(() => {
    if (!deskPanelState.open || !deskPanelState.deskId) return;
    const sourceDeskId = deskPanelState.deskId;
    const availableTabs = getDeskPropertyTabs(sourceDeskId);
    if (!availableTabs.some((tab) => tab.id === deskPanelTab)) {
      setDeskPanelTab(availableTabs[0]?.id || 'hierarchy');
    }
  }, [deskPanelState.open, deskPanelState.deskId, deskPanelTab]);

  useEffect(() => {
    if (scene === SCENES.STUDIO) return;
    if (deskPanelState.open) {
      closeDeskInspector();
    }
  }, [scene, deskPanelState.open, closeDeskInspector]);

  useEffect(() => {
    if (utilityWindows.environment.open) {
      loadDeskPanel(ctoEditTargetDeskId, { silent: true });
    }
    if (utilityWindows.qa.open || utilityWindows.scorecards.open) {
      loadDeskPanel('qa-lead', { silent: true });
    }
    if (utilityWindows.context.open) {
      loadDeskPanel('memory-archivist', { silent: true });
    }
    if (utilityWindows.reports.open && utilityWindows.reports.targetDeskId) {
      loadDeskPanel(utilityWindows.reports.targetDeskId, { silent: true });
    }
  }, [
    utilityWindows.environment.open,
    utilityWindows.qa.open,
    utilityWindows.scorecards.open,
    utilityWindows.context.open,
    utilityWindows.reports.open,
    utilityWindows.reports.targetDeskId,
    ctoEditTargetDeskId,
  ]);

  const resolvePageTitle = (pageId) => {
    if (!pageId) return 'Unknown page';
    if (pageId === activePage?.id) return 'Current page';
    return notebookState.pages.find((page) => page.id === pageId)?.title || pageId;
  };

  const stopStudioInteraction = (event) => {
    if (studioElementDrag.current) return;
    event.stopPropagation();
  };

  const renderTeamBoardColumn = (columnId) => {
    const meta = teamBoardColumnMeta[columnId];
    const cards = teamBoardColumns[columnId] || [];
    return h('div', { key: columnId, className: `team-board-column ${columnId}` },
      h('div', { className: 'team-board-column-header' },
        h('span', null, meta.title),
        h('span', { className: 'muted' }, String(cards.length)),
      ),
      cards.length
        ? h('div', { className: 'team-board-card-list' }, cards.map((card) => {
            const isExpandedReview = columnId === 'review' && expandedReviewCardId === card.id;
            const taskId = card.runnerTaskId || card.builderTaskId || card.executionPackage?.taskId || null;
            const changedFiles = card.executionPackage?.changedFiles || [];
            const actionLabel = card.executionPackage?.expectedAction || (card.targetProjectKey === 'ace-self' ? 'apply + deploy' : 'apply');
            return h('div', {
              key: card.id,
              className: `team-board-card ${selectedExecutionCard?.id === card.id ? 'selected' : ''} ${isExpandedReview ? 'expanded' : ''}`,
              onClick: columnId === 'review' ? () => setExpandedReviewCardId((value) => value === card.id ? null : card.id) : undefined,
            },
              h('div', { className: 'team-board-card-id muted' }, `#${card.id} â€¢ ${card.desk || 'Desk'}`),
              h('div', { className: 'team-board-card-title' }, card.title),
              h('div', { className: 'team-board-card-meta muted' }, card.state || 'Ready'),
              h('div', { className: 'team-board-card-meta muted' }, resolvePageTitle(card.pageId)),
              taskId ? h('div', { className: 'team-board-card-meta muted' }, `Task ${taskId}`) : null,
              card.riskLevel && card.riskLevel !== 'unknown' ? h('div', { className: 'team-board-card-meta muted' }, `Risk ${card.riskLevel}`) : null,
              card.applyStatus && card.applyStatus !== 'idle' ? h('div', { className: 'team-board-card-meta muted' }, `Apply ${card.applyStatus}`) : null,
              card.deployStatus && card.deployStatus !== 'idle' ? h('div', { className: 'team-board-card-meta muted' }, `Deploy ${card.deployStatus}`) : null,
              card.auditSessionId ? h('div', { className: 'team-board-card-meta muted' }, `Audit ${card.auditSessionId.slice(-8)}`) : null,
              isExpandedReview ? h('div', { className: 'team-board-card-review' },
                h('div', { className: 'team-board-card-review-line' }, `Target: ${card.targetProjectKey || 'ace-self'}`),
                h('div', { className: 'team-board-card-review-line' }, `Mutation: ${actionLabel}`),
                h('div', { className: 'team-board-card-review-line' }, `Preflight: ${card.executionPackage?.preflightStatus || 'idle'}`),
                h('div', { className: 'team-board-card-review-line' }, changedFiles.length ? `Scope: ${changedFiles.join(', ')}` : (card.executionPackage?.summary || 'No patch scope recorded yet.')),
                card.riskReasons?.length ? h('ul', { className: 'team-board-card-risk-list' },
                  card.riskReasons.map((reason, index) => h('li', { key: `${card.id}-risk-${index}` }, reason)),
                ) : null,
              ) : null,
              h('div', { className: 'button-row team-board-actions' },
                columnId === 'review'
                  ? h(React.Fragment, null,
                      h('button', {
                        className: 'mini',
                        type: 'button',
                        disabled: teamBoardBusy,
                        onClick: (event) => {
                          event.stopPropagation();
                          runTeamBoardAction('approve-apply', card.id, `approved ${card.title} for apply`);
                        },
                      }, teamBoardBusy ? 'Working...' : 'Send'),
                      h('button', {
                        className: 'mini',
                        type: 'button',
                        disabled: teamBoardBusy,
                        onClick: (event) => {
                          event.stopPropagation();
                          runTeamBoardAction('reject-to-builder', card.id, `sent ${card.title} back to Builder`);
                        },
                      }, 'Reject'),
                      h('button', {
                        className: 'mini',
                        type: 'button',
                        disabled: teamBoardBusy,
                        onClick: (event) => {
                          event.stopPropagation();
                          runTeamBoardAction('bin', card.id, `binned ${card.title}`);
                        },
                      }, 'Bin'),
                    )
                  : null,
                taskId
                  ? h('button', {
                      className: 'mini',
                      type: 'button',
                      onClick: (event) => {
                        event.stopPropagation();
                        openTaskFolder(taskId);
                      },
                    }, 'Legacy task folder')
                  : null,
              ),
            );
          }))
        : h('div', { className: 'signal-empty muted team-board-empty' }, meta.empty),
    );
  };

  const renderStudioTeamBoard = () => {
    const compact = !teamBoardWallBoardExpanded;
    const summaryPills = [
      { label: 'Plan', value: teamBoard.summary?.plan || 0 },
      { label: 'Active', value: teamBoard.summary?.active || 0 },
      { label: 'Complete', value: teamBoard.summary?.complete || 0 },
      { label: 'Review', value: teamBoard.summary?.review || 0 },
    ];
    return h('section', {
      className: `studio-team-board ${compact ? 'compact' : 'expanded'}`,
      'data-qa': 'whiteboard-teamBoard',
      'data-whiteboard-id': 'teamBoard',
      'data-whiteboard-label': 'Team Board',
      'data-stage-x': teamBoardFrame.x,
      'data-stage-y': teamBoardFrame.y,
      'data-stage-width': STUDIO_TEAM_BOARD_SIZE.width,
      'data-stage-height': STUDIO_TEAM_BOARD_SIZE.height,
      style: {
        left: `${teamBoardFrame.x}px`,
        top: `${teamBoardFrame.y}px`,
        width: compact ? '360px' : `${STUDIO_TEAM_BOARD_SIZE.width}px`,
        minHeight: compact ? '132px' : `${STUDIO_TEAM_BOARD_SIZE.height}px`,
      },
      onMouseDown: stopStudioInteraction,
      onMouseMove: stopStudioInteraction,
      onMouseUp: stopStudioInteraction,
      onWheel: stopStudioInteraction,
    },
      h('div', { className: 'studio-team-board-hangers', 'aria-hidden': true },
        h('span', null),
        h('span', null),
      ),
      h('div', { className: 'studio-team-board-header' },
        h('div', null,
          h('div', { className: 'studio-team-board-title' }, compact ? 'Team Board Preview' : 'Team Board'),
          h('div', { className: 'studio-team-board-subtitle muted' }, compact
            ? 'Compact wall-board preview. Click to expand the full kanban and pipeline board.'
            : 'Secondary execution whiteboard only. Canvas Intent owns scaffold/world routing; this board reflects downstream packages and approvals.'),
        ),
        h('div', { className: 'studio-team-board-meta' },
          h('span', null, `Page ${activePage?.title || 'Current Page'}`),
          h('span', null, `Plan ${teamBoard.summary?.plan || 0}`),
          h('span', null, `Active ${teamBoard.summary?.active || 0}`),
          h('span', null, `Idle ${teamBoard.summary?.idleWorkers || 0}`),
          h('span', { className: selectedExecutionCard ? 'selected' : '' }, selectedExecutionCard ? `Executor ${selectedExecutionCard.state}: ${selectedExecutionCard.title}` : `Ready to Apply ${teamBoard.summary?.review || 0}`),
          compact
            ? h('button', {
                className: 'mini studio-edit-handle whiteboard-edit-handle',
                type: 'button',
                onClick: (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setTeamBoardWallBoardExpanded(true);
                },
              }, 'Open')
            : h('div', { className: 'button-row' },
                h('button', {
                  className: 'mini studio-edit-handle whiteboard-edit-handle',
                  type: 'button',
                  onMouseDown: (event) => startStudioElementDrag(event, { type: 'whiteboard', id: 'teamBoard' }),
                  onClick: (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  },
                }, 'Move'),
                h('button', {
                  className: 'mini',
                  type: 'button',
                  onClick: (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setTeamBoardWallBoardExpanded(false);
                  },
                }, 'Compact'),
              ),
        ),
      ),
      compact
        ? h('div', {
            className: 'team-board-preview',
            role: 'button',
            tabIndex: 0,
            onClick: () => setTeamBoardWallBoardExpanded(true),
            onKeyDown: (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setTeamBoardWallBoardExpanded(true);
              }
            },
          },
            h('div', { className: 'team-board-preview-pills' },
              summaryPills.map((pill) => h('div', { key: pill.label, className: 'team-board-preview-pill' },
                h('div', { className: 'team-board-preview-pill-label' }, pill.label),
                h('div', { className: 'team-board-preview-pill-value' }, String(pill.value)),
              )),
            ),
            h('div', { className: 'team-board-preview-line' }, selectedExecutionCard
              ? `Executor ${selectedExecutionCard.state}: ${selectedExecutionCard.title}`
              : `Ready to Apply ${teamBoard.summary?.review || 0}`),
            h('div', { className: 'team-board-preview-line muted' }, 'Click to expand the full whiteboard.'),
          )
        : h('div', { className: 'team-board-columns' },
            ['plan', 'active', 'complete', 'review'].map(renderTeamBoardColumn),
          ),
    );
  };

  const renderQAWorkbenchPanel = () => h('div', { className: 'inspector-block panel-card review-panel browser-pass-panel', 'data-qa': 'qa-desk-summary' },
    h('div', { className: 'inspector-label' }, 'QA Workbench'),
    h('div', { className: 'signal-summary' }, qaState.structuredBusy
      ? 'Structured QA suite is running...'
      : qaState.browserBusy
        ? 'Browser QA is running...'
        : (qaState.structuredReport?.summary || qaState.localGate?.unit?.summary || latestQARun?.summary || 'Run structured QA or a browser pass to refresh QA truth.')),
    h('div', { className: 'signal-meta muted' }, qaState.localGate?.unit
      ? `Unit gate: ${qaState.localGate.unit.status || 'pending'} | ${qaState.localGate.unit.passedCount || 0}/${qaState.localGate.unit.totalChecks || 0} checks passed`
      : 'No local unit gate summary recorded yet.'),
    h('div', { className: 'signal-meta muted' }, qaState.localGate?.studioBoot
      ? `Studio boot: ${qaState.localGate.studioBoot.verdict || qaState.localGate.studioBoot.status || 'pending'} | findings ${qaState.localGate.studioBoot.findingCount || 0}`
      : 'No studio boot guardrail result recorded yet.'),
    h('div', { className: 'self-upgrade-grid' },
      h('label', { className: 'muted', htmlFor: 'browser-pass-scenario' }, 'Scenario'),
      h('select', {
        id: 'browser-pass-scenario',
        className: 'mini recent-select',
        value: qaScenario,
        onChange: (event) => setQaScenario(event.target.value),
      },
        h('option', { value: 'layout-pass' }, 'Layout Pass'),
        h('option', { value: 'studio-smoke' }, 'Studio Smoke'),
        h('option', { value: 'throughput-visual-pass' }, 'Throughput Visual Pass'),
        h('option', { value: 'whiteboard-board-pass' }, 'Whiteboard Board Pass'),
      ),
    ),
    h('div', { className: 'button-row' },
      h('button', { className: 'mini', type: 'button', disabled: qaState.structuredBusy, onClick: runStructuredQA }, qaState.structuredBusy ? 'Running...' : 'Run Structured QA'),
      h('button', { className: 'mini', type: 'button', disabled: qaState.browserBusy, onClick: runBrowserPass }, qaState.browserBusy ? 'Running...' : 'Run Browser Pass'),
      latestQARun?.id ? h('button', { className: 'mini', type: 'button', onClick: () => loadQARunDetails(latestQARun.id) }, 'Refresh run detail') : null,
    ),
    latestQARun
      ? h(React.Fragment, null,
          h('div', { className: 'signal-summary' }, `${latestQARun.scenario || 'layout-pass'} | ${latestQARun.verdict || latestQARun.status || 'pending'}`),
          h('div', { className: 'signal-meta muted' }, `Trigger: ${latestQARun.trigger || 'manual'} | Findings: ${(latestQARun.findings || []).length || latestQARun.findingCount || 0}`),
          latestQARun.primaryScreenshot?.url || latestQARun.artifacts?.screenshots?.[0]?.url
            ? h('img', {
                className: 'qa-screenshot-preview',
                alt: 'Latest ACE browser pass screenshot',
                src: latestQARun.primaryScreenshot?.url || latestQARun.artifacts?.screenshots?.[0]?.url,
              })
            : null,
          (latestQARun.findings || []).length
            ? h('div', { className: 'qa-findings-list' }, latestQARun.findings.slice(0, 6).map((finding, index) => h('button', {
              key: `${finding.id || 'finding'}-${index}`,
              className: `qa-finding severity-${finding.severity || 'info'}`,
              type: 'button',
              onClick: () => {
                if (finding.relatedDeskIds?.[0]) {
                  focusStudioAgent(finding.relatedDeskIds[0]);
                } else {
                  setScene(SCENES.STUDIO);
                }
              },
              title: finding.details || finding.summary,
            }, `${finding.summary}`)))
            : h('div', { className: 'signal-empty muted' }, 'No browser-pass findings recorded yet.'),
          (latestQARun.steps || latestQARun.stepSummary || []).length
            ? h('div', { className: 'qa-step-list' }, (latestQARun.steps || latestQARun.stepSummary || []).map((step) => h('div', { key: step.id, className: 'qa-step-row muted' }, `${step.label}: ${step.verdict || step.status}`)))
            : null,
        )
      : h('div', { className: 'signal-empty muted' }, 'No browser pass has been recorded yet.'),
  );

  const renderThroughputDebugPanel = () => h('div', { className: 'inspector-block panel-card review-panel throughput-debug-panel' },
    h('div', { className: 'inspector-label' }, 'Throughput Debug'),
    h('div', { className: 'self-upgrade-grid' },
      h('label', { className: 'muted', htmlFor: 'throughput-debug-prompt' }, 'Seed prompt'),
      h('textarea', {
        id: 'throughput-debug-prompt',
        className: 'comment-box throughput-debug-input',
        value: throughputPrompt,
        onChange: (event) => setThroughputPrompt(event.target.value),
        rows: 3,
      }),
    ),
    h('div', { className: 'button-row' },
      h('button', { className: 'mini', type: 'button', disabled: throughputBusy, onClick: () => runThroughputDebug('fixture') }, throughputBusy ? 'Running...' : 'Run fixture'),
      h('button', { className: 'mini', type: 'button', disabled: throughputBusy, onClick: () => runThroughputDebug('live') }, throughputBusy ? 'Running...' : 'Run live ACE pass'),
      latestThroughputSession?.runnerTaskId ? h('button', { className: 'mini', type: 'button', onClick: () => openTaskFolder(latestThroughputSession.runnerTaskId) }, 'Open legacy runner task') : null,
    ),
    latestThroughputSession
      ? h(React.Fragment, null,
          h('div', { className: 'signal-summary' }, latestThroughputSession.prompt || 'Throughput debug session'),
          h('div', { className: 'signal-meta muted' }, `Session ${latestThroughputSession.id} | ${latestThroughputSession.status} | ${latestThroughputSession.verdict}`),
          h('div', { className: 'signal-meta muted' }, `Task ${latestThroughputSession.runnerTaskId || 'n/a'} | Page ${latestThroughputSession.pageId || 'n/a'} | Node ${latestThroughputSession.nodeId || 'n/a'}`),
          (latestThroughputSession.stages || latestThroughputSession.stageSummary || []).length
            ? h('ul', { className: 'signal-list throughput-stage-list' }, (latestThroughputSession.stages || latestThroughputSession.stageSummary || []).map((stage) => h('li', { key: stage.id },
                h('div', null, `${stage.label || stage.id}: ${stage.verdict || stage.status || 'pending'}`),
                stage.failureReason ? h('div', { className: 'muted' }, stage.failureReason) : null,
                stage.output?.summary ? h('div', { className: 'muted' }, stage.output.summary) : null,
              )))
            : h('div', { className: 'signal-empty muted' }, 'No throughput stages recorded yet.'),
          latestThroughputSession.sinks
            ? h('div', { className: 'throughput-sink-grid' }, Object.entries(latestThroughputSession.sinks).map(([sinkId, sink]) => h('div', { key: sinkId, className: 'throughput-sink' },
                h('div', { className: 'muted' }, sinkId),
                h('div', null, `${sink.write ? 'WRITE' : 'READ'} | ${sink.summary || 'No summary.'}`),
              )))
            : null,
        )
      : h('div', { className: 'signal-empty muted' }, 'No throughput session recorded yet. Run a fixture pass or a live ACE pass to inspect the full pipeline.'),
  );

  const renderTruthMetricRows = (truth = {}, focusSummary = null) => {
    const workload = truth?.workload && typeof truth.workload === 'object' ? truth.workload : {};
    const reports = normalizeDeskEntries(truth?.reports);
    const scorecards = normalizeDeskEntries(truth?.scorecards);
    const assessments = normalizeDeskEntries(truth?.assessments);
    const guardrails = normalizeDeskEntries(truth?.guardrails);
    const linkedWindows = normalizeDeskEntries(focusSummary?.linkedWindows);
    const blockers = normalizeDeskEntries(focusSummary?.blockers);
    return h('div', { className: 'criteria-list desk-metric-list' },
      h('div', { className: 'criteria-row' }, h('span', null, 'Live / assigned agents'), h('span', { className: 'muted' }, `${focusSummary?.liveAgents ?? 0} / ${focusSummary?.assignedAgents ?? 0}`)),
      h('div', { className: 'criteria-row' }, h('span', null, 'Active work'), h('span', { className: 'muted' }, String(focusSummary?.activeWork ?? 0))),
      h('div', { className: 'criteria-row' }, h('span', null, 'Queue'), h('span', { className: 'muted' }, String(focusSummary?.queueCount ?? workload.queueSize ?? 0))),
      h('div', { className: 'criteria-row' }, h('span', null, 'Blockers'), h('span', { className: 'muted' }, blockers.length ? blockers.slice(0, 3).join(' | ') : 'none')),
      h('div', { className: 'criteria-row' }, h('span', null, 'Linked reports'), h('span', { className: 'muted' }, String(focusSummary?.linkedReports ?? reports.length))),
      h('div', { className: 'criteria-row' }, h('span', null, 'Windows available'), h('span', { className: 'muted' }, linkedWindows.length ? linkedWindows.map((window) => window.label).join(' / ') : 'none')),
      h('div', { className: 'criteria-row' }, h('span', null, 'Workload'), h('span', { className: 'muted' }, `${workload.assignedTasks ?? 0} / ${workload.queueSize ?? 0} / ${workload.outputs ?? 0}`)),
      h('div', { className: 'criteria-row' }, h('span', null, 'Throughput'), h('span', { className: 'muted' }, truth?.throughput || 'n/a')),
      h('div', { className: 'criteria-row' }, h('span', null, 'Reports'), h('span', { className: 'muted' }, String(reports.length))),
      h('div', { className: 'criteria-row' }, h('span', null, 'Scorecards'), h('span', { className: 'muted' }, String(scorecards.length))),
      h('div', { className: 'criteria-row' }, h('span', null, 'Assessments'), h('span', { className: 'muted' }, String(assessments.length))),
      h('div', { className: 'criteria-row' }, h('span', null, 'Context'), h('span', { className: 'muted' }, describeDeskValue(truth?.context) || 'n/a')),
      h('div', { className: 'criteria-row' }, h('span', null, 'Guardrails'), h('span', { className: 'muted' }, String(guardrails.length))),
    );
  };

  const renderDeskPanelMetadata = (panel = null) => {
    if (!panel) return null;
    const responsibilities = Array.isArray(panel.responsibilities) ? panel.responsibilities.filter(Boolean) : [];
    const hardRules = Array.isArray(panel.hardRules) ? panel.hardRules.filter(Boolean) : [];
    return h('div', { className: 'desk-panel-item desk-guidance-panel', 'data-qa': 'desk-guidance-panel' },
      h('div', { className: 'signal-summary' }, panel.mission || 'Read-only desk guidance'),
      h('div', { className: 'signal-meta muted' }, panel.deliveryRelationship || 'Parallel sandbox layer; does not directly ship.'),
      h('div', { className: 'criteria-list desk-metric-list' },
        h('div', { className: 'criteria-row' }, h('span', null, 'Mission'), h('span', { className: 'muted' }, panel.mission || 'n/a')),
        h('div', { className: 'criteria-row' }, h('span', null, 'Visibility'), h('span', { className: 'muted' }, panel.visibility || 'read-only')),
      ),
      h('div', { className: 'desk-truth-grid' },
        h('div', { className: 'desk-truth-column' },
          h('div', { className: 'inspector-label' }, 'Responsibilities'),
          responsibilities.length
            ? h('ul', { className: 'signal-list' }, responsibilities.map((item, index) => h('li', { key: `desk-guidance-responsibility-${index}` }, item)))
            : h('div', { className: 'signal-empty muted' }, 'No responsibilities surfaced.'),
        ),
        h('div', { className: 'desk-truth-column' },
          h('div', { className: 'inspector-label' }, 'Hard rules'),
          hardRules.length
            ? h('ul', { className: 'signal-list' }, hardRules.map((item, index) => h('li', { key: `desk-guidance-rule-${index}` }, item)))
            : h('div', { className: 'signal-empty muted' }, 'No hard rules surfaced.'),
        ),
      ),
    );
  };

  const renderRndExperimentCards = (experiments = [], emptyState = 'No R&D experiments are seeded yet.') => {
    const cards = Array.isArray(experiments) ? experiments.filter((entry) => entry && typeof entry === 'object') : [];
    const lifecycleTone = (value) => {
      switch (String(value || 'proposed').trim()) {
        case 'approved':
        case 'promoted':
          return 'good';
        case 'in_progress':
          return 'warn';
        case 'failed':
          return 'bad';
        case 'salvaged':
        case 'archived':
          return 'neutral';
        default:
          return 'warn';
      }
    };
    const lifecycleLabel = (value) => {
      const normalized = String(value || 'proposed').trim();
      return normalized
        .split('_')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
    };
    const renderRndPrimitiveCards = (primitives = [], primitiveEmptyState = 'No extracted primitives captured yet.') => {
      const primitiveCards = Array.isArray(primitives) ? primitives.filter((entry) => entry && typeof entry === 'object') : [];
      return primitiveCards.length
        ? h('div', { className: 'desk-panel-list', 'data-qa': 'rnd-primitive-list' }, primitiveCards.map((primitive, index) => {
            const constraints = Array.isArray(primitive.constraints) ? primitive.constraints.filter(Boolean) : [];
            const confidenceValue = Number(primitive.confidence);
            const confidenceLabel = Number.isFinite(confidenceValue) ? confidenceValue.toFixed(2) : 'n/a';
            return h('div', {
              key: primitive.primitive || `rnd-primitive-${index}`,
              className: 'desk-panel-item utility-card',
            },
              h('div', { className: 'signal-summary' }, primitive.primitive || 'Untitled primitive'),
              h('div', { className: 'signal-meta muted' }, primitive.description || 'No description provided.'),
              h('div', { className: 'criteria-list desk-metric-list' },
                h('div', { className: 'criteria-row' }, h('span', null, 'Data shape'), h('span', { className: 'muted' }, primitive.data_shape || 'n/a')),
                h('div', { className: 'criteria-row' }, h('span', null, 'Confidence'), h('span', { className: 'muted' }, confidenceLabel)),
                h('div', { className: 'criteria-row' }, h('span', null, 'Example'), h('span', { className: 'muted' }, primitive.example || 'n/a')),
              ),
              h('div', { className: 'inspector-label' }, 'Constraints'),
              constraints.length
                ? h('ul', { className: 'signal-list' }, constraints.map((constraint, constraintIndex) => h('li', { key: `rnd-primitive-${index}-constraint-${constraintIndex}` }, constraint)))
                : h('div', { className: 'signal-empty muted' }, 'No constraints surfaced.'),
            );
          }))
        : h('div', { className: 'signal-empty muted', 'data-qa': 'rnd-primitive-empty' }, primitiveEmptyState);
    };
    const renderPromotionReadiness = (readiness = null) => {
      const state = String(readiness?.state || (readiness?.eligible ? 'eligible' : 'blocked')).trim();
      const eligible = Boolean(readiness?.eligible);
      const reasons = Array.isArray(readiness?.reasons) ? readiness.reasons.filter(Boolean) : [];
      const primitiveCount = Number(readiness?.validPrimitiveCount ?? readiness?.primitiveCount ?? 0);
      const integrationTarget = String(readiness?.integrationTarget || '').trim() || 'n/a';
      const qaState = readiness?.basicQaPassed ? 'passed' : 'blocked';
      const tone = state === 'eligible' || state === 'promoted' ? 'good' : state === 'archived' ? 'neutral' : 'warn';
      const label = state === 'promoted'
        ? 'Already promoted'
        : state === 'archived'
          ? 'Archived'
          : eligible
            ? 'Eligible for promotion'
            : 'Not eligible for promotion';
      return h('div', { className: 'criteria-list desk-metric-list', 'data-qa': 'rnd-promotion-readiness' },
        h('div', { className: 'criteria-row' }, h('span', null, 'Promotion readiness'), h('span', { className: `qa-metric-pill tone-${tone}` }, label)),
        h('div', { className: 'criteria-row' }, h('span', null, 'Basic QA'), h('span', { className: 'muted' }, qaState)),
        h('div', { className: 'criteria-row' }, h('span', null, 'Valid primitives'), h('span', { className: 'muted' }, String(primitiveCount))),
        h('div', { className: 'criteria-row' }, h('span', null, 'Downstream target'), h('span', { className: 'muted' }, integrationTarget)),
        reasons.length
          ? h('div', { className: 'signal-empty muted' }, reasons.join(' | '))
          : h('div', { className: 'signal-empty muted' }, 'Ready for promotion bridge review.'),
      );
    };
    return cards.length
      ? h('div', { className: 'desk-panel-list', 'data-qa': 'rnd-experiment-list' }, cards.map((experiment, index) => {
          const scope = Array.isArray(experiment.scope) ? experiment.scope.filter(Boolean) : [];
          const whatWorked = Array.isArray(experiment.what_worked) ? experiment.what_worked.filter(Boolean) : [];
          const whatFailed = Array.isArray(experiment.what_failed) ? experiment.what_failed.filter(Boolean) : [];
          const reusableComponents = Array.isArray(experiment.reusable_components) ? experiment.reusable_components.filter(Boolean) : [];
          const extractedPrimitives = Array.isArray(experiment.extracted_primitives) ? experiment.extracted_primitives.filter((entry) => entry && typeof entry === 'object') : [];
          const readiness = experiment.promotion_readiness || null;
          const status = String(experiment.lifecycle || experiment.status || experiment.state || 'proposed').trim() || 'proposed';
          const integrationTarget = String(experiment.integration_target || experiment.integrationTarget || 'n/a').trim() || 'n/a';
          return h('div', {
            key: experiment.id || `rnd-experiment-${index}`,
            className: 'desk-panel-item utility-card',
          },
            h('div', { className: 'inline review-header' },
              h('div', null,
                h('div', { className: 'signal-summary' }, experiment.id || 'Untitled experiment'),
                h('div', { className: 'signal-meta muted' }, experiment.hypothesis || 'No hypothesis provided.'),
              ),
              h('span', { className: `qa-metric-pill tone-${lifecycleTone(status)}` }, lifecycleLabel(status)),
            ),
            h('div', { className: 'signal-meta muted' }, `Integration target: ${integrationTarget}`),
            scope.length
              ? h('div', { className: 'signal-meta muted' }, `Scope: ${scope.join(' | ')}`)
              : h('div', { className: 'signal-empty muted' }, 'No scope surfaced.'),
            h('div', { className: 'criteria-list desk-metric-list' },
              h('div', { className: 'criteria-row' }, h('span', null, 'What worked'), h('span', { className: 'muted' }, whatWorked.length ? whatWorked.join(' | ') : 'none surfaced')),
              h('div', { className: 'criteria-row' }, h('span', null, 'What failed'), h('span', { className: 'muted' }, whatFailed.length ? whatFailed.join(' | ') : 'none surfaced')),
              h('div', { className: 'criteria-row' }, h('span', null, 'Reusable'), h('span', { className: 'muted' }, reusableComponents.length ? reusableComponents.join(' | ') : 'none surfaced')),
              h('div', { className: 'criteria-row' }, h('span', null, 'Discard reason'), h('span', { className: 'muted' }, String(experiment.discard_reason || '').trim() || 'not provided')),
            ),
            renderPromotionReadiness(readiness),
            h('div', { className: 'desk-panel-item', 'data-qa': 'rnd-primitive-section' },
              h('div', { className: 'inspector-label' }, `Extracted primitives (${extractedPrimitives.length})`),
              h('div', { className: 'signal-meta muted' }, 'Reusable ACE-compatible outputs only; prototypes stay inside the experiment record.'),
              renderRndPrimitiveCards(extractedPrimitives),
            ),
          );
        }))
      : h('div', { className: 'signal-empty muted', 'data-qa': 'rnd-experiment-empty' }, emptyState);
  };

  const renderDeskUtilityActions = (deskId, options = {}) => {
    if (!deskId) return null;
    const ctoActive = selectedAgentId === 'cto-architect' || deskPanelState.deskId === 'cto-architect';
    const actions = [];
    if (deskId === 'cto-architect') {
      actions.push({ id: 'cto-chat', label: 'CTO Chat', onClick: () => openUtilityWindow('cto-chat') });
      actions.push({ id: 'environment', label: 'Environment', onClick: () => openUtilityWindow('environment') });
    }
    if (deskId === 'qa-lead') {
      actions.push({ id: 'qa', label: 'QA Workbench', onClick: () => openUtilityWindow('qa') });
      actions.push({ id: 'scorecards', label: 'Scorecards', onClick: () => openUtilityWindow('scorecards', { targetDeskId: 'qa-lead' }) });
    }
    if (deskId === 'memory-archivist' || deskId === 'context-manager') {
      actions.push({ id: 'context', label: 'Context Archive', onClick: () => openUtilityWindow('context') });
    }
    actions.push({ id: 'reports', label: 'Reports', onClick: () => openUtilityWindow('reports', { targetDeskId: deskId }) });
    return h('div', { className: `button-row desk-utility-actions ${options.compact ? 'compact' : ''}` },
      actions.map((action) => h('button', {
        key: `${deskId}-${action.id}`,
        className: 'mini',
        type: 'button',
        disabled: action.id === 'environment' && !ctoActive,
        onClick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          action.onClick();
        },
      }, action.label)),
    );
  };

  const renderReportsList = (reports = [], emptyState = 'No desk reports are cached yet.') => (
    (Array.isArray(reports) ? reports : []).length
      ? h('div', { className: 'desk-panel-list utility-list' }, (Array.isArray(reports) ? reports : []).map((report) => h('div', { key: report.id || `${report.name}-${report.source}`, className: 'desk-panel-item utility-card' },
          h('div', { className: 'signal-summary' }, `${report.name || report.id || 'Report'}${report.verdict ? ` (${report.verdict})` : ''}`),
          h('div', { className: 'signal-meta muted' }, `${report.type || 'report'} | ${report.source || 'unknown source'}${report.detail ? ` | ${report.detail}` : ''}`),
        )))
      : h('div', { className: 'signal-empty muted' }, emptyState)
  );

  const renderScorecardsList = (scorecards = [], emptyState = 'No scorecards are available yet.') => (
    (Array.isArray(scorecards) ? scorecards : []).length
      ? h('div', { className: 'desk-panel-list utility-list' }, (Array.isArray(scorecards) ? scorecards : []).map((card) => h('div', { key: card.id || `${card.desk}-${card.testId}`, className: 'desk-panel-item utility-card' },
          h('div', { className: 'signal-summary' }, `${card.desk || 'Desk'} | ${card.testName || card.testId || 'Scorecard'}`),
          h('div', { className: 'signal-meta muted' }, `Status ${card.status || 'pass'} | Overall ${card.overallScore?.value ?? 'n/a'} / ${card.overallScore?.max ?? 4}`),
          card.validation?.summary ? h('div', { className: 'signal-meta muted' }, card.validation.summary) : null,
        )))
      : h('div', { className: 'signal-empty muted' }, emptyState)
  );

  const renderCtoChatUtility = () => {
    const ctoDesk = getDeskPayload('cto-architect');
    const statusKey = normalizeCtoChatStatus(ctoChatStatus.status);
    const statusMeta = CTO_CHAT_STATUS_META[statusKey] || CTO_CHAT_STATUS_META.idle;
    const taSummary = taDepartmentPayload?.department?.summary || 'Talent Acquisition summary unavailable until the live roster payload refreshes.';
    return h('div', { className: 'utility-window-stack cto-chat-window', 'data-qa': 'cto-chat-window' },
      h('div', { className: 'utility-window-section utility-window-hero' },
        h('div', { className: 'inspector-label' }, 'CTO / Architect'),
        h('div', { className: 'signal-summary' }, 'Governance chat over the live local model'),
        h('div', { className: 'cto-chat-status-row' },
          h('span', { className: `agent-panel-status ${statusMeta.tone}` }, statusMeta.label),
          h('span', { className: 'signal-meta muted' }, [
            ctoChatStatus.backend || null,
            ctoChatStatus.model || null,
            ctoChatStatus.checkedAt ? `checked ${new Date(ctoChatStatus.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : null,
          ].filter(Boolean).join(' | ') || 'CTO backend status pending'),
        ),
        h('div', { className: 'signal-meta muted' }, ctoChatStatus.detail || 'The panel reports local-model health honestly.'),
        h('div', { className: 'signal-meta muted' }, taSummary),
      ),
      ctoDesk?.truth ? h('div', { className: 'utility-window-section' },
        h('div', { className: 'signal-summary' }, 'Current control-desk truth'),
        renderTruthMetricRows(ctoDesk.truth),
      ) : null,
      h('div', { className: 'utility-window-section cto-chat-thread-section' },
        h('div', { className: 'signal-summary' }, 'Conversation'),
        h('div', { className: 'comment-thread cto-chat-thread' },
          ctoChatHistory.length
            ? ctoChatHistory.map((entry) => h('div', { key: entry.id, className: `comment-entry cto-chat-entry ${entry.role === 'user' ? 'is-user' : 'is-assistant'}` },
                h('div', { className: 'comment-meta muted' }, entry.role === 'user'
                  ? 'You'
                  : `CTO | ${entry.replyKind || entry.status || 'advisory'}`),
                entry.backend || entry.model || entry.runId || entry.detail
                  ? h('div', { className: 'signal-meta muted' }, [
                      entry.backend || null,
                      entry.model || null,
                      entry.runId || null,
                      entry.detail || null,
                    ].filter(Boolean).join(' | '))
                  : null,
                h('div', { className: 'cto-chat-text' }, entry.text),
                entry.delegation?.deskLabel
                  ? h('div', { className: 'signal-meta muted' }, `Delegation: ${entry.delegation.deskLabel}${entry.delegation.why ? ` | ${entry.delegation.why}` : ''}`)
                  : null,
                entry.action
                  ? h('div', { className: 'cto-chat-action-block' },
                      h('div', { className: 'signal-meta muted' }, `${entry.action.label}${entry.action.reason ? ` | ${entry.action.reason}` : ''}`),
                      h('div', { className: 'button-row cto-chat-action-row' },
                        entry.action.available && entry.action.requiresConfirmation && entry.action.status === 'pending'
                          ? h('button', {
                              className: 'mini',
                              type: 'button',
                              disabled: ctoChatBusy,
                              onClick: () => sendCtoChatMessage({ text: 'Yes, do it.', confirmActionId: entry.action.id }),
                            }, ctoChatBusy ? 'Submitting...' : 'Confirm Action')
                          : h('button', {
                              className: 'mini',
                              type: 'button',
                              disabled: true,
                              title: entry.action.reason || 'This action is not available from CTO chat.',
                            }, entry.action.status === 'executed' ? 'Executed' : (entry.action.available ? 'Pending' : 'Not Wired')),
                        entry.action.routeStatus ? h('span', { className: 'signal-meta muted' }, entry.action.routeStatus) : null,
                      ),
                    )
                  : null,
                entry.execution?.summary
                  ? h('div', { className: 'signal-meta muted' }, entry.execution.summary)
                  : null,
              ))
            : h('div', { className: 'signal-empty muted' }, 'Ask the CTO about desk coverage, delegation, or whether a real hire path exists for a gap.'),
        ),
      ),
      h('div', { className: 'utility-window-section cto-chat-compose' },
        h('textarea', {
          className: 'comment-box cto-chat-box',
          value: ctoChatDraft,
          placeholder: 'Ask the CTO about staffing, desk ownership, or delegation...',
          onChange: (event) => setCtoChatDraft(event.target.value),
          onKeyDown: (event) => {
            if (event.key !== 'Enter' || event.shiftKey) return;
            event.preventDefault();
            if (ctoChatBusy || !ctoChatDraft.trim()) return;
            sendCtoChatMessage({ text: ctoChatDraft });
          },
          disabled: ctoChatBusy,
        }),
        h('div', { className: 'button-row cto-chat-compose-row' },
          h('button', {
            className: 'mini',
            type: 'button',
            onClick: () => refreshCtoChatStatus(),
            disabled: ctoChatBusy,
          }, 'Refresh Status'),
          h('button', {
            className: 'mini',
            type: 'button',
            disabled: ctoChatBusy || !ctoChatDraft.trim(),
            onClick: () => sendCtoChatMessage({ text: ctoChatDraft }),
          }, ctoChatBusy ? 'Asking...' : 'Send'),
        ),
      ),
    );
  };

  const renderStudioMapUtility = () => {
    const desks = studioDeskEntries || [];
    const activeDesk = selectedAgentId ? studioDeskEntries.find((desk) => desk.id === selectedAgentId) || null : null;
    return h('div', { className: 'utility-window-stack', 'data-qa': 'studio-map-window' },
      h('div', { className: 'utility-window-section utility-window-hero' },
        h('div', { className: 'inspector-label' }, 'Studio Map'),
        h('div', { className: 'signal-summary' }, activeDesk ? activeDesk.name : 'Studio overview'),
        h('div', { className: 'signal-meta muted' }, 'The map stays in Utilities when you want it and gets out of the way when you do not.'),
      ),
      h('div', { className: 'utility-window-section' },
        h('div', { className: 'studio-map-toolbar' },
          h('button', {
            className: 'mini',
            type: 'button',
            onClick: () => centerStudioOnRoom('Studio view centered on the full room.'),
          }, 'Center room'),
          activeDesk ? h('button', {
            className: 'mini',
            type: 'button',
            onClick: () => focusStudioAgent(activeDesk.id),
          }, `Focus ${activeDesk.id}`) : null,
        ),
        h('div', { className: 'minimap-dots minimap-dots-panel' },
          desks.map((desk) => h('button', {
            key: `${desk.id}-dot`,
            type: 'button',
            className: `minimap-dot ${selectedAgentId === desk.id ? 'selected' : ''}`,
            style: {
              left: `${((desk.position?.x || deskStagePoint(desk.id, studioLayout).x) / STUDIO_SIZE.width) * 100}%`,
              top: `${((desk.position?.y || deskStagePoint(desk.id, studioLayout).y) / STUDIO_SIZE.height) * 100}%`,
              background: desk.theme.accent,
            },
            onClick: () => focusStudioAgent(desk.id),
            title: desk.name,
          })),
        ),
        h('div', { className: 'signal-meta muted' }, `Active layer: ${activeGraphLabel}. Click a station to inspect scope.`),
      ),
    );
  };

  const renderRosterUtility = () => {
      const rosterSurface = normalizeRosterSurfacePayload(rosterSurfaceModel);
      const department = rosterSurface.department;
      const summary = rosterSurface.summary;
      const departments = rosterSurface.departments;
      const desks = rosterSurface.desks;
      const roster = rosterSurface.roster;
      const openRoles = rosterSurface.openRoles;
      const blockers = rosterSurface.blockers;
      const hiringSignals = rosterSurface.hiringSignals;
    const prioritizedResourceSignals = listDepartmentsByPriority(resourceSignalModel);
    const resourceSignals = Array.isArray(prioritizedResourceSignals) ? prioritizedResourceSignals : [];
    const activeDepartmentCards = departments.length ? departments : desks;
    return h('div', { className: 'utility-window-stack', 'data-qa': 'people-plan-window' },
      h('div', { className: 'utility-window-section utility-window-hero' },
        h('div', { className: 'inspector-label' }, department.name || 'People Plan'),
        h('div', { className: 'signal-summary' }, department.summary || 'Who we have and who we still need'),
        h('div', { className: 'signal-meta muted' }, `Updated ${department.updatedAt || 'just now'} | Urgency ${String(summary.urgency || 'low').toUpperCase()}`),
        h('div', { className: 'signal-meta muted' }, taDepartmentError ? `Load error: ${taDepartmentError}` : 'Canonical staffing truth is sourced from the TA department payload.'),
      ),
      h('div', { className: 'utility-window-section' },
        taDepartmentBusy
          ? h('div', { className: 'signal-empty muted' }, 'Loading department staffing coverage...')
          : h('div', { className: 'criteria-list' },
              h('div', { className: 'criteria-row' }, h('span', null, 'Departments'), h('span', { className: 'muted' }, String(summary.totalCoverage || 0))),
              h('div', { className: 'criteria-row' }, h('span', null, 'Healthy / open'), h('span', { className: 'muted' }, `${summary.healthyCount || 0} / ${summary.openEntityCount || 0}`)),
              h('div', { className: 'criteria-row' }, h('span', null, 'Open roles'), h('span', { className: 'muted' }, String(summary.openRoleCount || 0))),
              h('div', { className: 'criteria-row' }, h('span', null, 'Missing leads'), h('span', { className: 'muted' }, String(summary.missingLeadCount || 0))),
              h('div', { className: 'criteria-row' }, h('span', null, 'Open seats'), h('span', { className: 'muted' }, String(summary.blockerCount || 0))),
              h('div', { className: 'criteria-row' }, h('span', null, 'Rostered hires'), h('span', { className: 'muted' }, String(summary.rosterCount || roster.length || 0))),
            ),
      ),
      hiringSignals.length
        ? h('div', { className: 'utility-window-section' },
            h('div', { className: 'signal-summary' }, 'Hiring signals'),
            h('div', { className: 'signal-meta muted' }, 'Read-only suggestions derived from staffing pressure and module ownership.'),
            h('div', { className: 'desk-panel-list utility-list' }, hiringSignals.map((signal) => h('div', {
              key: signal.id,
              className: 'desk-panel-item utility-card',
            },
              h('div', { className: 'signal-summary' }, signal.label),
              h('div', { className: 'signal-meta muted' }, `${signal.kind} | ${signal.scope} | strandCount ${signal.strandCount}`),
                h('div', { className: 'signal-meta muted' }, `Reasons: ${signal.reasons.length ? signal.reasons.join(', ') : 'n/a'}`),
              h('div', { className: 'signal-meta muted' }, signal.suggestedHire || 'Suggested hire unavailable.'),
            ))),
          )
        : null,
      resourceSignals.length
        ? h('div', { className: 'utility-window-section' },
            h('div', { className: 'signal-summary' }, 'Resource signals'),
            h('div', { className: 'signal-meta muted' }, 'Read-only support pressure derived from org health, staffing gaps, and weak relationships.'),
            h('div', { className: 'desk-panel-list utility-list' }, resourceSignals.slice(0, 3).map((signal) => h('div', {
              key: signal.departmentId,
              className: 'desk-panel-item utility-card',
            },
              h('div', { className: 'signal-summary' }, `${signal.departmentLabel} | ${signal.resourcePressure}`),
              h('div', { className: 'signal-meta muted' }, `Priority ${signal.priorityScore} | blockers ${signal.blockerCount} | staffing gaps ${signal.staffingGapCount}`),
              h('div', { className: 'signal-meta muted' }, `Weak relationships ${signal.weakRelationshipCount} | ${(Array.isArray(signal.reasonSummary) && signal.reasonSummary.length) ? signal.reasonSummary.join(', ') : 'No additional reasons.'}`),
            ))),
          )
        : null,
      activeDepartmentCards.length
        ? h('div', { className: 'utility-window-section' },
            h('div', { className: 'signal-summary' }, departments.length ? 'Department coverage' : 'Desk coverage'),
            h('div', { className: 'desk-panel-list utility-list' }, activeDepartmentCards.map((entity) => h('div', {
                key: entity.entityId,
                className: 'desk-panel-item utility-card',
              },
                h('div', { className: 'signal-summary' }, `${entity.label} | ${entity.health || 'unknown'}`),
                h('div', { className: 'signal-meta muted' }, `${entity.entityType === 'department' ? 'Department' : 'Desk'} | ${entity.statusLabel || 'covered'}`),
                h('div', { className: 'signal-meta muted' }, `Lead ${entity.leadLabel || 'n/a'} | Open seats ${entity.openSeatCount || 0}`),
                h('div', { className: 'signal-meta muted' }, `Rostered ${entity.assignedRoster.length} | Roles ${entity.assignedRoles.length}`),
                entity.roleCoverage.length
                  ? h('div', { className: 'desk-hierarchy-leaf-list' }, entity.roleCoverage.map((role) => h('div', {
                      key: `${entity.entityId}-${role.roleId}`,
                      className: `desk-hierarchy-leaf ${role.covered ? '' : 'draft'}`,
                    }, `${role.roleLabel}${role.isLeadRole ? ' (Lead)' : ''} | ${role.covered ? `x${role.count}` : 'open'}`)))
                  : null,
                entity.roster.length
                  ? h('div', { className: 'desk-hierarchy-leaf-list' }, entity.roster.map((candidate) => h('div', {
                      key: candidate.id,
                      className: 'desk-hierarchy-leaf',
                    }, `${candidate.name} | ${candidate.role}${candidate.deskId ? ` | ${candidate.deskId}` : ''}`)))
                  : h('div', { className: 'signal-empty muted' }, 'No hires are assigned here yet.'),
              ))),
          )
        : h('div', { className: 'utility-window-section' },
            h('div', { className: 'signal-empty muted' }, 'No department coverage is available yet.'),
          ),
      h('div', { className: 'utility-window-section' },
        h('div', { className: 'signal-summary' }, 'Open seats'),
        blockers.length
          ? h('div', { className: 'desk-panel-list utility-list' }, openRoles.filter((entry) => entry.blocker).map((entry) => h('div', {
              key: `${entry.entityType}-${entry.entityId}-${entry.roleId || entry.kind}`,
              className: 'desk-panel-item utility-card',
            },
              h('div', { className: 'signal-summary' }, `${entry.entityLabel || entry.entityId} | ${entry.roleLabel || entry.roleId || entry.kind}`),
              h('div', { className: 'signal-meta muted' }, `${entry.kind} | shortfall ${entry.shortfall || 0} | urgency ${entry.urgency || 'low'}`),
            )))
          : h('div', { className: 'signal-empty muted' }, 'No required seats are open right now.'),
      ),
      h('div', { className: 'utility-window-section' },
        h('div', { className: 'signal-summary' }, 'Roster'),
        roster.length
          ? h('div', { className: 'desk-panel-list utility-list' }, roster.map((candidate) => h('div', {
              key: candidate.id,
              className: 'desk-panel-item utility-card',
            },
              h('div', { className: 'signal-summary' }, `${candidate.name} | ${candidate.role}`),
              h('div', { className: 'signal-meta muted' }, `${candidate.deskId || 'unassigned desk'}${candidate.assignedModel ? ` | ${candidate.assignedModel}` : ''}`),
              h('div', { className: 'signal-meta muted' }, candidate.summary || 'No hire summary available.'),
            )))
          : h('div', { className: 'signal-empty muted' }, 'No hires have been assigned yet.'),
      ),
    );
  };

  const renderEnvironmentUtility = () => {
    const targetDeskId = ctoEditTargetDeskId;
    const targetDeskLabel = getStudioDeskLabel(targetDeskId);
    const panelData = getDeskPayload(targetDeskId);
    const managementDraft = normalizeDeskManagementDraft(deskManagementDrafts[targetDeskId] || {});
    const selectedDeskDepartment = studioRenderModel.departments.find((department) => department.id === layoutMutationDraft.deskDepartmentId) || null;
    const allowedDeskTemplates = (layoutCatalog.deskTemplates || []).filter((entry) => {
      if (!Array.isArray(entry.allowedDepartmentKinds) || !entry.allowedDepartmentKinds.length) return true;
      return selectedDeskDepartment ? entry.allowedDepartmentKinds.includes(selectedDeskDepartment.kind) : true;
    });
    const recruitAgent = async () => {
      const agentId = String(managementDraft.recruit.agentId || '').trim();
      const traits = String(managementDraft.recruit.traits || '').trim();
      const role = String(managementDraft.recruit.role || '').trim();
      if (!agentId) {
        setStatus(`Enter an agent id before recruiting for ${targetDeskLabel}.`);
        return;
      }
      await runDeskPanelAction('add_agent', { agentId, traits, role }, targetDeskId);
      clearDeskManagementDraftSection(setDeskManagementDrafts, targetDeskId, 'recruit');
      await loadDeskPanel(targetDeskId, { silent: true });
      setStatus(`Recruit agent submitted for ${targetDeskLabel}.`);
    };
    const addAssessment = async () => {
      const testId = String(managementDraft.assessment.testId || '').trim();
      const notes = String(managementDraft.assessment.notes || '').trim();
      if (!testId) {
        setStatus(`Enter an assessment id before adding one for ${targetDeskLabel}.`);
        return;
      }
      await runDeskPanelAction('add_test', { testId, verdict: 'pending', notes }, targetDeskId);
      clearDeskManagementDraftSection(setDeskManagementDrafts, targetDeskId, 'assessment');
      await loadDeskPanel(targetDeskId, { silent: true });
      setStatus(`Assessment submitted for ${targetDeskLabel}.`);
    };
    return h('div', { className: 'utility-window-stack', 'data-qa': 'utility-environment-window' },
      h('div', { className: 'utility-window-section utility-window-hero' },
        h('div', { className: 'inspector-label' }, 'CTO Control Tower'),
        h('div', { className: 'signal-summary' }, `Managing ${targetDeskLabel}`),
        h('div', { className: 'signal-meta muted' }, 'Department contexts, hiring pressure, and guardrails are scoped here instead of living on every desk.'),
      ),
      h('div', { className: 'utility-window-section' },
        h('label', { className: 'desk-management-field' },
          h('span', { className: 'muted' }, 'Managed desk'),
          h('select', {
            className: 'mini recent-select',
            value: ctoEditTargetDeskId,
            onChange: async (event) => {
              setCtoEditTargetDeskId(event.target.value);
              await loadDeskPanel(event.target.value, { silent: true });
            },
          }, managedDeskOptions.map((entry) => h('option', { key: entry.id, value: entry.id }, `${entry.label} | ${entry.departmentLabel}`))),
        ),
        panelData?.truth ? renderTruthMetricRows(panelData.truth) : h('div', { className: 'signal-empty muted' }, 'Desk truth is loading for the managed department.'),
      ),
      h('div', { className: 'desk-management-grid utility-window-grid' },
        h('section', { className: 'desk-management-section', 'data-qa': 'layout-controls-panel' },
          h('div', { className: 'desk-management-section-header' },
            h('div', { className: 'signal-summary' }, 'Studio Layout'),
            h('div', { className: 'signal-meta muted' }, 'Approved templates only'),
          ),
          h('label', { className: 'desk-management-field' },
            h('span', { className: 'muted' }, 'Department template'),
            h('select', {
              className: 'mini recent-select',
              value: layoutMutationDraft.departmentTemplateId,
              onChange: (event) => setLayoutMutationDraft((current) => ({ ...current, departmentTemplateId: event.target.value })),
            }, (layoutCatalog.departmentTemplates || []).map((entry) => h('option', { key: entry.id, value: entry.id }, entry.label))),
          ),
          h('div', { className: 'signal-meta muted' }, (layoutCatalog.departmentTemplates || []).find((entry) => entry.id === layoutMutationDraft.departmentTemplateId)?.summary || 'Add a bounded room from the approved catalog.'),
          h('div', { className: 'button-row desk-management-actions' },
            h(ActionButton, {
              actionId: 'add_department',
              context: { layoutMutationDraft },
              actionStatus: uiActionStatus,
              onAction: runStudioUiAction,
              className: 'mini',
              type: 'button',
              disabled: layoutMutationBusy,
              dataQa: 'add-department-button',
            }, '+ Add Department'),
          ),
          h('label', { className: 'desk-management-field' },
            h('span', { className: 'muted' }, 'Desk department'),
            h('select', {
              className: 'mini recent-select',
              value: layoutMutationDraft.deskDepartmentId,
              onChange: (event) => setLayoutMutationDraft((current) => ({ ...current, deskDepartmentId: event.target.value })),
            }, studioRenderModel.departments.filter((department) => department.id !== 'dept-control').map((department) => h('option', { key: department.id, value: department.id }, department.label))),
          ),
          h('label', { className: 'desk-management-field' },
            h('span', { className: 'muted' }, 'Desk template'),
            h('select', {
              className: 'mini recent-select',
              value: layoutMutationDraft.deskTemplateId,
              onChange: (event) => setLayoutMutationDraft((current) => ({ ...current, deskTemplateId: event.target.value })),
            }, allowedDeskTemplates.map((entry) => h('option', { key: entry.id, value: entry.id }, entry.label))),
          ),
          h('div', { className: 'signal-meta muted' }, allowedDeskTemplates.find((entry) => entry.id === layoutMutationDraft.deskTemplateId)?.summary || 'Add a desk using an approved template and slot.'),
          h('div', { className: 'button-row desk-management-actions' },
            h(ActionButton, {
              actionId: 'add_desk',
              context: { layoutMutationDraft },
              actionStatus: uiActionStatus,
              onAction: runStudioUiAction,
              className: 'mini',
              type: 'button',
              disabled: layoutMutationBusy,
              dataQa: 'add-desk-button',
            }, '+ Add Desk'),
          ),
          layoutMutationFeedback && ['add_department', 'add_desk'].includes(layoutMutationFeedback.actionId)
            ? h('div', {
                className: `utility-inline-status studio-mutation-feedback ${layoutMutationFeedback.phase}`,
                'data-qa': 'layout-mutation-feedback',
              },
                h('div', { className: 'signal-summary' }, layoutMutationFeedback.title),
                h('div', { className: 'signal-meta muted' }, layoutMutationFeedback.message),
                Array.isArray(layoutMutationFeedback.reasons) && layoutMutationFeedback.reasons.length
                  ? h('ul', { className: 'signal-meta muted' },
                      layoutMutationFeedback.reasons.map((reason, index) => h('li', { key: `${layoutMutationFeedback.actionId}-${index}` }, reason)),
                    )
                  : null,
              )
            : null,
        ),
        h('section', { className: 'desk-management-section' },
          h('div', { className: 'desk-management-section-header' },
            h('div', { className: 'signal-summary' }, 'Hire Agent'),
            h('button', {
              className: 'mini',
              type: 'button',
              onClick: () => clearDeskManagementDraftSection(setDeskManagementDrafts, targetDeskId, 'recruit'),
            }, 'Reset'),
          ),
          h('label', { className: 'desk-management-field' },
            h('span', { className: 'muted' }, 'Agent id'),
            h('input', {
              type: 'text',
              value: managementDraft.recruit.agentId,
              placeholder: 'planner-agent',
              onChange: (event) => updateDeskManagementDraft(setDeskManagementDrafts, targetDeskId, (draft) => ({
                ...draft,
                recruit: { ...draft.recruit, agentId: event.target.value },
              })),
            }),
          ),
          h('label', { className: 'desk-management-field' },
            h('span', { className: 'muted' }, 'Traits'),
            h('textarea', {
              rows: 3,
              value: managementDraft.recruit.traits,
              placeholder: 'calm, systems-minded, desk-aware',
              onChange: (event) => updateDeskManagementDraft(setDeskManagementDrafts, targetDeskId, (draft) => ({
                ...draft,
                recruit: { ...draft.recruit, traits: event.target.value },
              })),
            }),
          ),
          h('label', { className: 'desk-management-field' },
            h('span', { className: 'muted' }, 'Character card'),
            h('textarea', {
              rows: 3,
              value: managementDraft.recruit.role,
              placeholder: 'role, strengths, recruitment notes',
              onChange: (event) => updateDeskManagementDraft(setDeskManagementDrafts, targetDeskId, (draft) => ({
                ...draft,
                recruit: { ...draft.recruit, role: event.target.value },
              })),
            }),
          ),
          h('div', { className: 'button-row desk-management-actions' },
            h('button', {
              className: 'mini',
              type: 'button',
              disabled: deskPanelActionBusy,
              onClick: recruitAgent,
            }, deskPanelActionBusy ? 'Submitting...' : 'Recruit Agent'),
          ),
        ),
        h('section', { className: 'desk-management-section' },
          h('div', { className: 'desk-management-section-header' },
            h('div', { className: 'signal-summary' }, 'Department Context'),
            h('button', {
              className: 'mini',
              type: 'button',
              onClick: () => clearDeskManagementDraftSection(setDeskManagementDrafts, targetDeskId, 'context'),
            }, 'Reset'),
          ),
          h('label', { className: 'desk-management-field' },
            h('span', { className: 'muted' }, 'Summary'),
            h('input', {
              type: 'text',
              value: managementDraft.context.summary,
              placeholder: 'Department context summary',
              onChange: (event) => updateDeskManagementDraft(setDeskManagementDrafts, targetDeskId, (draft) => ({
                ...draft,
                context: { ...draft.context, summary: event.target.value },
              })),
            }),
          ),
          h('label', { className: 'desk-management-field' },
            h('span', { className: 'muted' }, 'Detail'),
            h('textarea', {
              rows: 3,
              value: managementDraft.context.detail,
              placeholder: 'Context ownership, routing, and source of truth notes',
              onChange: (event) => updateDeskManagementDraft(setDeskManagementDrafts, targetDeskId, (draft) => ({
                ...draft,
                context: { ...draft.context, detail: event.target.value },
              })),
            }),
          ),
          h('div', { className: 'signal-meta muted' }, 'Drafts stay local to the CTO utility window in this slice.'),
        ),
        h('section', { className: 'desk-management-section' },
          h('div', { className: 'desk-management-section-header' },
            h('div', { className: 'signal-summary' }, 'Guardrails'),
            h('button', {
              className: 'mini',
              type: 'button',
              onClick: () => clearDeskManagementDraftSection(setDeskManagementDrafts, targetDeskId, 'guardrails'),
            }, 'Reset'),
          ),
          h('label', { className: 'desk-management-field' },
            h('span', { className: 'muted' }, 'Summary'),
            h('input', {
              type: 'text',
              value: managementDraft.guardrails.summary,
              placeholder: 'Guardrail summary',
              onChange: (event) => updateDeskManagementDraft(setDeskManagementDrafts, targetDeskId, (draft) => ({
                ...draft,
                guardrails: { ...draft.guardrails, summary: event.target.value },
              })),
            }),
          ),
          h('label', { className: 'desk-management-field' },
            h('span', { className: 'muted' }, 'Detail'),
            h('textarea', {
              rows: 3,
              value: managementDraft.guardrails.detail,
              placeholder: 'Approval gates, ownership rules, and safety constraints',
              onChange: (event) => updateDeskManagementDraft(setDeskManagementDrafts, targetDeskId, (draft) => ({
                ...draft,
                guardrails: { ...draft.guardrails, detail: event.target.value },
              })),
            }),
          ),
          h('div', { className: 'signal-meta muted' }, 'Guardrail notes are staged here before we wire persistence.'),
        ),
        h('section', { className: 'desk-management-section' },
          h('div', { className: 'desk-management-section-header' },
            h('div', { className: 'signal-summary' }, 'Assessments'),
            h('button', {
              className: 'mini',
              type: 'button',
              onClick: () => clearDeskManagementDraftSection(setDeskManagementDrafts, targetDeskId, 'assessment'),
            }, 'Reset'),
          ),
          h('label', { className: 'desk-management-field' },
            h('span', { className: 'muted' }, 'Assessment id'),
            h('input', {
              type: 'text',
              value: managementDraft.assessment.testId,
              placeholder: 'qa-assessment-1',
              onChange: (event) => updateDeskManagementDraft(setDeskManagementDrafts, targetDeskId, (draft) => ({
                ...draft,
                assessment: { ...draft.assessment, testId: event.target.value },
              })),
            }),
          ),
          h('label', { className: 'desk-management-field' },
            h('span', { className: 'muted' }, 'Notes'),
            h('textarea', {
              rows: 3,
              value: managementDraft.assessment.notes,
              placeholder: 'Coverage gaps or readiness notes',
              onChange: (event) => updateDeskManagementDraft(setDeskManagementDrafts, targetDeskId, (draft) => ({
                ...draft,
                assessment: { ...draft.assessment, notes: event.target.value },
              })),
            }),
          ),
          h('div', { className: 'button-row desk-management-actions' },
            h('button', {
              className: 'mini',
              type: 'button',
              disabled: deskPanelActionBusy,
              onClick: addAssessment,
            }, deskPanelActionBusy ? 'Submitting...' : 'Add Assessment'),
          ),
        ),
      ),
    );
  };

  const renderUtilityWindows = () => {
    const windows = UTILITY_WINDOW_ORDER.filter((id) => utilityWindows[id]?.open);
    if (!windows.length) return null;
    return h('div', { className: 'utility-window-layer', 'data-qa': 'utility-window-layer' },
      windows.map((windowId) => {
        const config = utilityWindows[windowId];
        const targetDeskId = config.targetDeskId || UTILITY_WINDOW_META[windowId]?.deskId || deskPanelState.deskId || null;
        const panelData = getDeskPayload(targetDeskId);
        const title = targetDeskId && !UTILITY_WINDOW_META[windowId]?.deskId
          ? `${UTILITY_WINDOW_META[windowId].title} | ${getStudioDeskLabel(targetDeskId)}`
          : UTILITY_WINDOW_META[windowId].title;
        let content = h('div', { className: 'signal-empty muted' }, 'No utility content is available yet.');
        if (windowId === 'cto-chat') {
          content = renderCtoChatUtility();
        } else if (windowId === 'environment') {
          content = renderEnvironmentUtility();
        } else if (windowId === 'qa') {
          content = renderSpatialNotebookSectionWithBoundary(() => renderQAWorkbenchPanel(), {
            boundaryId: 'utility-qa',
            title: 'QA Workbench unavailable',
          });
        } else if (windowId === 'context') {
          content = h('div', { className: 'utility-window-stack' },
            h('div', { className: 'utility-window-section utility-window-hero' },
              h('div', { className: 'inspector-label' }, 'Archivist Context'),
              h('div', { className: 'signal-summary' }, describeDeskValue(panelData?.truth?.context) || 'Context archive loading'),
              h('div', { className: 'signal-meta muted' }, 'Memory Archivist is the canonical holder of department context with CTO oversight.'),
            ),
            panelData?.truth ? renderTruthMetricRows(panelData.truth) : h('div', { className: 'signal-empty muted' }, 'No archivist truth is cached yet.'),
            renderReportsList(panelData?.reports || [], 'No archivist reports are recorded yet.'),
          );
        } else if (windowId === 'reports') {
          content = h('div', { className: 'utility-window-stack' },
            h('div', { className: 'utility-window-section utility-window-hero' },
              h('div', { className: 'inspector-label' }, 'Desk Reports'),
              h('div', { className: 'signal-summary' }, targetDeskId ? getStudioDeskLabel(targetDeskId) : 'No desk selected'),
              h('div', { className: 'signal-meta muted' }, 'Relevant tests, QA evidence, and surfaced downstream reports for the current desk.'),
            ),
            panelData?.truth ? renderTruthMetricRows(panelData.truth) : null,
            renderReportsList(panelData?.reports || []),
          );
        } else if (windowId === 'relationship') {
          content = renderSpatialNotebookSectionWithBoundary(() => renderRelationshipInspectorPanel(selectedRelationshipInspector), {
            boundaryId: 'utility-relationship',
            title: 'Relationship Inspector unavailable',
          });
        } else if (windowId === 'roster') {
          content = renderRosterUtility();
        } else if (windowId === 'studio-map') {
          content = renderStudioMapUtility();
        } else if (windowId === 'scorecards') {
          content = h('div', { className: 'utility-window-stack' },
            h('div', { className: 'utility-window-section utility-window-hero' },
              h('div', { className: 'inspector-label' }, 'Scorecards'),
              h('div', { className: 'signal-summary' }, targetDeskId ? getStudioDeskLabel(targetDeskId) : 'QA'),
              h('div', { className: 'signal-meta muted' }, 'Cross-cutting assessments that should stay visible without living on the floor.'),
            ),
            renderScorecardsList(panelData?.qa?.scorecards || panelData?.truth?.scorecards || []),
          );
        }
        return h('section', {
          key: windowId,
          className: `utility-window ${config.docked ? 'docked' : 'floating'} ${config.minimized ? 'minimized' : ''} ${windowId === 'cto-chat' ? 'cto-chat-shell' : ''}`.trim(),
          style: config.docked ? null : (() => {
            const position = config.position || getDefaultUtilityWindowPosition(windowId);
            return { top: `${position.top}px`, left: `${position.left}px` };
          })(),
          'data-qa': `utility-window-${windowId}`,
        },
          h('div', {
            className: 'utility-window-header',
            onMouseDown: (event) => startUtilityWindowDrag(event, windowId),
          },
            h('div', null,
              h('div', { className: 'inspector-label' }, 'Utility Window'),
              h('div', { className: 'signal-summary' }, title),
            ),
            h('div', { className: 'button-row utility-window-controls' },
              h('button', {
                className: 'mini',
                type: 'button',
                onClick: () => toggleUtilityWindowDocked(windowId),
              }, config.docked ? 'Float' : 'Dock'),
              h('button', {
                className: 'mini',
                type: 'button',
                onClick: () => toggleUtilityWindowMinimized(windowId),
              }, config.minimized ? 'Restore' : 'Minimize'),
              h('button', {
                className: 'mini',
                type: 'button',
              onClick: () => closeUtilityWindow(windowId),
              }, 'Close'),
            ),
          ),
          !config.minimized ? h('div', {
            className: `utility-window-body ${windowId === 'cto-chat' ? 'cto-chat-utility-body' : ''}`.trim(),
          }, content) : null,
        );
      }),
    );
  };

  const renderUtilityDock = () => {
    const ctoActive = selectedAgentId === 'cto-architect' || deskPanelState.deskId === 'cto-architect';
    if (scene !== SCENES.STUDIO) return null;
    return h('div', { className: 'utility-dock' },
      h('button', {
        className: `mini utility-dock-toggle ${utilityDockOpen ? 'active' : ''}`,
        type: 'button',
        'data-qa': 'utility-dock-toggle',
        onClick: () => setUtilityDockOpen((value) => !value),
      }, utilityDockOpen ? 'Hide Utilities' : 'Utilities'),
      utilityDockOpen ? h('div', { className: 'utility-dock-panel', 'data-qa': 'utility-dock-panel' },
        UTILITY_WINDOW_ORDER.map((windowId) => h('button', {
          key: windowId,
          className: `mini utility-dock-button ${utilityWindows[windowId]?.open ? 'active' : ''}`,
          type: 'button',
          disabled: windowId === 'environment' && !ctoActive,
          onClick: () => openUtilityWindow(windowId, {
            targetDeskId: windowId === 'reports'
              ? (deskPanelState.deskId || selectedAgentId || null)
              : utilityWindows[windowId]?.targetDeskId,
          }),
        }, UTILITY_WINDOW_META[windowId].title)),
      ) : null,
    );
  };

  const renderDeskPropertiesPanel = () => {
    if (!deskPanelState.open || !deskPanelState.deskId) return null;
    const deskId = deskPanelState.deskId;
    const deskLabel = getStudioDeskLabel(deskId);
    const isCtoEdit = deskPanelState.mode === 'edit' && deskId === 'cto-architect';
    const targetDeskId = isCtoEdit ? ctoEditTargetDeskId : deskId;
    const targetDeskLabel = getStudioDeskLabel(targetDeskId);
    const panelData = getDeskPayload(targetDeskId);
    const availableTabs = getDeskPropertyTabs(targetDeskId);
    const isQADesk = targetDeskId === 'qa-lead';
    const managementDraft = normalizeDeskManagementDraft(deskManagementDrafts[targetDeskId] || {});
    const hierarchyModel = buildDeskHierarchyModel({
      deskId,
      deskLabel,
      targetDeskId,
      targetDeskLabel,
      panelData,
      isCtoEdit,
    });
    const recruitAgent = async () => {
      const agentId = String(managementDraft.recruit.agentId || '').trim();
      const traits = String(managementDraft.recruit.traits || '').trim();
      const role = String(managementDraft.recruit.role || '').trim();
      if (!agentId) {
        setStatus(`Enter an agent id before recruiting for ${targetDeskLabel}.`);
        return;
      }
      await runDeskPanelAction('add_agent', { agentId, traits, role }, targetDeskId);
      clearDeskManagementDraftSection(setDeskManagementDrafts, targetDeskId, 'recruit');
      setStatus(`Recruit agent submitted for ${targetDeskLabel}.`);
    };
    const addAssessment = async () => {
      const testId = String(managementDraft.assessment.testId || '').trim();
      const notes = String(managementDraft.assessment.notes || '').trim();
      if (!testId) {
        setStatus(`Enter an assessment id before adding one for ${targetDeskLabel}.`);
        return;
      }
      await runDeskPanelAction('add_test', { testId, verdict: 'pending', notes }, targetDeskId);
      clearDeskManagementDraftSection(setDeskManagementDrafts, targetDeskId, 'assessment');
      setStatus(`Assessment submitted for ${targetDeskLabel}.`);
    };
    const resetDeskDrafts = () => {
      clearDeskManagementDraft(setDeskManagementDrafts, targetDeskId);
      setStatus(`Drafts reset for ${targetDeskLabel}.`);
    };
    const cancelDeskDrafts = () => {
      clearDeskManagementDraft(setDeskManagementDrafts, targetDeskId);
      closeDeskInspector();
    };
    return h('div', {
      className: 'desk-properties-modal',
      'data-qa': isQADesk ? 'qa-properties-modal' : 'desk-properties-modal',
      'data-desk-id': targetDeskId,
      onClick: () => closeDeskInspector(),
    },
      h('div', {
        className: 'desk-properties-card panel-card',
        onClick: (event) => event.stopPropagation(),
      },
        h('div', { className: 'inline review-header' },
          h('div', null,
            h('div', { className: 'inspector-label' }, isCtoEdit ? 'CTO Desk Edit Panel' : 'Desk Inspection'),
            h('div', { className: 'signal-summary', 'data-qa': 'desk-management-target' }, isCtoEdit ? hierarchyModel.managementSummary : `${targetDeskLabel} truth surface`),
            h('div', { className: 'signal-meta muted', 'data-qa': 'desk-focus-summary' }, hierarchyModel.focusSummary.summary),
            h('div', { className: 'signal-meta muted' }, hierarchyModel.focusSummary.detail),
            h('div', { className: 'signal-meta muted' }, hierarchyModel.departmentDetail),
            h('div', { className: 'signal-meta muted' }, isCtoEdit ? hierarchyModel.managementDetail : 'Inspector stays hidden until a desk is clicked, then closes when you leave the desk view.'),
          ),
          h('button', { className: 'mini', type: 'button', onClick: cancelDeskDrafts }, 'Leave Desk'),
        ),
        renderDeskUtilityActions(targetDeskId),
        renderDeskPanelMetadata(panelData?.desk?.panel),
        targetDeskId === 'rnd-lead'
          ? h('div', { className: 'desk-panel-item desk-truth-summary desk-inspector-truth', 'data-qa': 'rnd-experiment-panel' },
              h('div', { className: 'inspector-label' }, 'R&D Experiments'),
              h('div', { className: 'signal-summary' }, 'Seeded experiment records'),
              h('div', { className: 'signal-meta muted' }, 'Read-only cards sourced from canonical spatial storage.'),
              renderRndExperimentCards(panelData?.experiments),
            )
          : null,
        panelData?.truth ? h('div', { className: 'desk-panel-item desk-truth-summary desk-inspector-truth', 'data-qa': 'desk-truth-summary' },
          h('div', { className: 'inspector-label' }, 'Desk Truth'),
          h('div', { className: 'signal-summary' }, `${targetDeskLabel} canonical truth`),
          renderTruthMetricRows(panelData.truth, hierarchyModel.focusSummary),
        ) : null,
        isCtoEdit ? h('div', { className: 'desk-cto-controls' },
          h('label', { className: 'muted', htmlFor: 'cto-target-desk' }, 'Managed desk'),
          h('select', {
            id: 'cto-target-desk',
            className: 'mini recent-select',
            value: ctoEditTargetDeskId,
            onChange: async (event) => {
              setCtoEditTargetDeskId(event.target.value);
              setSelectedAgentId(event.target.value);
              await loadDeskPanel(event.target.value);
              setDeskPanelTab('hierarchy');
            },
              }, managedDeskOptions.map((entry) => h('option', { key: entry.id, value: entry.id }, `${entry.label} | ${entry.departmentLabel}`))),
          h('div', { className: 'button-row desk-management-actions' },
            h('button', {
              className: 'mini',
              type: 'button',
              disabled: deskPanelActionBusy,
              onClick: resetDeskDrafts,
            }, deskPanelActionBusy ? 'Saving...' : 'Reset Drafts'),
            h('button', {
              className: 'mini',
              type: 'button',
              disabled: deskPanelActionBusy,
              onClick: recruitAgent,
            }, deskPanelActionBusy ? 'Saving...' : 'Recruit Agent'),
            h('button', {
              className: 'mini',
              type: 'button',
              disabled: deskPanelActionBusy,
              onClick: addAssessment,
            }, deskPanelActionBusy ? 'Saving...' : 'Add Assessment'),
          ),
        ) : null,
        h('div', { className: 'scene-switcher desk-tabs' },
          availableTabs.map((tab) => h('button', {
            key: tab.id,
            className: `mini ${deskPanelTab === tab.id ? 'active' : ''}`,
            type: 'button',
            onClick: () => setDeskPanelTab(tab.id),
          }, tab.label)),
        ),
        deskPanelBusy
          ? h('div', { className: 'signal-empty muted' }, 'Loading desk properties...')
          : null,
        !deskPanelBusy && !panelData ? h('div', { className: 'signal-empty muted' }, 'No desk properties available.') : null,
        !deskPanelBusy && panelData && deskPanelTab === 'hierarchy' ? h('div', { className: 'desk-hierarchy', 'data-qa': 'desk-hierarchy-panel' },
          h('div', { className: 'desk-hierarchy-header' },
            h('div', { className: 'desk-hierarchy-title-row' },
              h('div', { className: 'inspector-label' }, hierarchyModel.departmentLabel),
              h('div', { className: 'signal-summary' }, hierarchyModel.deskLabel),
            ),
            h('div', { className: 'signal-meta muted' }, hierarchyModel.focusSummary.summary),
            h('div', { className: 'signal-meta muted' }, hierarchyModel.focusSummary.detail),
            h('div', { className: 'signal-meta muted' }, hierarchyModel.departmentDetail),
            h('div', { className: 'signal-meta muted' }, hierarchyModel.deskDetail),
            hierarchyModel.deskMission ? h('div', { className: 'signal-meta muted' }, hierarchyModel.deskMission) : null,
          ),
          h('div', { className: 'desk-hierarchy-tree' },
            h('div', { className: 'desk-hierarchy-node department' },
              h('div', { className: 'desk-hierarchy-node-label' }, hierarchyModel.departmentLabel),
              h('div', { className: 'signal-meta muted' }, `Departments ${hierarchyModel.counts.departments}`),
              hierarchyModel.departments.length
                ? h('div', { className: 'desk-hierarchy-leaf-list' }, hierarchyModel.departments.map((item) => h('div', { key: item.id, className: 'desk-hierarchy-leaf' }, item.label)))
                : h('div', { className: 'signal-empty muted' }, 'No local departments drafted yet.'),
            ),
            h('div', { className: 'desk-hierarchy-node desk' },
              h('div', { className: 'desk-hierarchy-node-label' }, hierarchyModel.deskLabel),
              h('div', { className: 'signal-meta muted' }, `Desk ${targetDeskId}`),
              h('div', { className: 'signal-meta muted' }, `Agents ${hierarchyModel.counts.agents} | Tasks ${hierarchyModel.counts.tasks} | Reports ${hierarchyModel.counts.reports}`),
              hierarchyModel.desks.length
                ? h('div', { className: 'desk-hierarchy-leaf-list' }, hierarchyModel.desks.map((item) => h('div', { key: item.id, className: 'desk-hierarchy-leaf' }, item.label)))
                : null,
            ),
            h('div', { className: 'desk-hierarchy-node agents' },
              h('div', { className: 'desk-hierarchy-node-label' }, 'Agents'),
              hierarchyModel.agents.length
                ? h('div', { className: 'desk-hierarchy-agent-grid' }, hierarchyModel.agents.map((agent) => h('button', {
                    key: agent.id,
                    className: 'desk-hierarchy-agent-card',
                    type: 'button',
                    onClick: () => {
                      setSelectedAgentId(agent.id);
                      setDeskPanelTab('agents');
                    },
                  },
                    h('div', { className: 'signal-summary' }, agent.id),
                    h('div', { className: 'signal-meta muted' }, agent.summary),
                    h('div', { className: 'signal-meta muted' }, agent.currentTaskSummary),
                  )))
                : h('div', { className: 'signal-empty muted' }, 'No agents assigned to this desk yet.'),
              hierarchyModel.recruits.length
                ? h('div', { className: 'desk-hierarchy-leaf-list' }, hierarchyModel.recruits.map((item) => h('div', { key: item.id, className: 'desk-hierarchy-leaf draft' }, `${item.agentId}${item.traits ? ` | ${item.traits}` : ''}${item.role ? ` | ${item.role}` : ''}`)))
                : null,
            ),
          ),
          h('div', { className: 'desk-hierarchy-footer' },
              hierarchyModel.assessments.length
                ? h('div', { className: 'desk-hierarchy-leaf-list' }, hierarchyModel.assessments.map((item) => h('div', { key: item.id, className: 'desk-hierarchy-leaf draft' }, `${item.testId}${item.notes ? ` | ${item.notes}` : ''}`)))
                : h('div', { className: 'signal-empty muted' }, 'No local assessments drafted yet.'),
          ),
          isCtoEdit
            ? h('div', { className: 'desk-management-workflow' },
                h('div', { className: 'desk-management-panel', 'data-qa': 'desk-management-panel', 'data-managed-desk-id': targetDeskId },
                  h('div', { className: 'desk-management-header' },
                    h('div', null,
                      h('div', { className: 'inspector-label' }, 'CTO Control Tower'),
                      h('div', { className: 'signal-summary' }, `Managing ${targetDeskLabel}`),
                      h('div', { className: 'signal-meta muted' }, 'Recruit, context, and guardrail changes stay bound to the selected desk.'),
                    ),
                    h('button', {
                      className: 'mini',
                      type: 'button',
                      onClick: resetDeskDrafts,
                    }, 'Reset Drafts'),
                  ),
                  h('div', { className: 'desk-management-grid' },
                    h('section', { className: 'desk-management-section' },
                      h('div', { className: 'desk-management-section-header' },
                        h('div', { className: 'signal-summary' }, 'Recruit Agent'),
                        h('button', {
                          className: 'mini',
                          type: 'button',
                          onClick: () => clearDeskManagementDraftSection(setDeskManagementDrafts, targetDeskId, 'recruit'),
                        }, 'Reset'),
                      ),
                      h('label', { className: 'desk-management-field' },
                        h('span', { className: 'muted' }, 'Agent id'),
                        h('input', {
                          type: 'text',
                          value: managementDraft.recruit.agentId,
                          placeholder: 'planner-agent',
                          onChange: (event) => updateDeskManagementDraft(setDeskManagementDrafts, targetDeskId, (draft) => ({
                            ...draft,
                            recruit: {
                              ...draft.recruit,
                              agentId: event.target.value,
                            },
                          })),
                        }),
                      ),
                      h('label', { className: 'desk-management-field' },
                        h('span', { className: 'muted' }, 'Traits'),
                        h('textarea', {
                          rows: 3,
                          value: managementDraft.recruit.traits,
                          placeholder: 'calm, systems-minded, desk-aware',
                          onChange: (event) => updateDeskManagementDraft(setDeskManagementDrafts, targetDeskId, (draft) => ({
                            ...draft,
                            recruit: {
                              ...draft.recruit,
                              traits: event.target.value,
                            },
                          })),
                        }),
                      ),
                      h('label', { className: 'desk-management-field' },
                        h('span', { className: 'muted' }, 'Character card'),
                        h('textarea', {
                          rows: 3,
                          value: managementDraft.recruit.role,
                          placeholder: 'role, strengths, recruitment notes',
                          onChange: (event) => updateDeskManagementDraft(setDeskManagementDrafts, targetDeskId, (draft) => ({
                            ...draft,
                            recruit: {
                              ...draft.recruit,
                              role: event.target.value,
                            },
                          })),
                        }),
                      ),
                      h('div', { className: 'button-row desk-management-actions' },
                        h('button', {
                          className: 'mini',
                          type: 'button',
                          disabled: deskPanelActionBusy,
                          onClick: recruitAgent,
                        }, deskPanelActionBusy ? 'Submitting...' : 'Recruit Agent'),
                      ),
                    ),
                    h('section', { className: 'desk-management-section' },
                      h('div', { className: 'desk-management-section-header' },
                        h('div', { className: 'signal-summary' }, 'Department Context'),
                        h('button', {
                          className: 'mini',
                          type: 'button',
                          onClick: () => clearDeskManagementDraftSection(setDeskManagementDrafts, targetDeskId, 'context'),
                        }, 'Reset'),
                      ),
                      h('label', { className: 'desk-management-field' },
                        h('span', { className: 'muted' }, 'Summary'),
                        h('input', {
                          type: 'text',
                          value: managementDraft.context.summary,
                          placeholder: 'Department context summary',
                          onChange: (event) => updateDeskManagementDraft(setDeskManagementDrafts, targetDeskId, (draft) => ({
                            ...draft,
                            context: {
                              ...draft.context,
                              summary: event.target.value,
                            },
                          })),
                        }),
                      ),
                      h('label', { className: 'desk-management-field' },
                        h('span', { className: 'muted' }, 'Detail'),
                        h('textarea', {
                          rows: 3,
                          value: managementDraft.context.detail,
                          placeholder: 'Context ownership, routing, and source of truth notes',
                          onChange: (event) => updateDeskManagementDraft(setDeskManagementDrafts, targetDeskId, (draft) => ({
                            ...draft,
                            context: {
                              ...draft.context,
                              detail: event.target.value,
                            },
                          })),
                        }),
                      ),
                    ),
                    h('section', { className: 'desk-management-section' },
                      h('div', { className: 'desk-management-section-header' },
                        h('div', { className: 'signal-summary' }, 'Guardrails'),
                        h('button', {
                          className: 'mini',
                          type: 'button',
                          onClick: () => clearDeskManagementDraftSection(setDeskManagementDrafts, targetDeskId, 'guardrails'),
                        }, 'Reset'),
                      ),
                      h('label', { className: 'desk-management-field' },
                        h('span', { className: 'muted' }, 'Summary'),
                        h('input', {
                          type: 'text',
                          value: managementDraft.guardrails.summary,
                          placeholder: 'Guardrail summary',
                          onChange: (event) => updateDeskManagementDraft(setDeskManagementDrafts, targetDeskId, (draft) => ({
                            ...draft,
                            guardrails: {
                              ...draft.guardrails,
                              summary: event.target.value,
                            },
                          })),
                        }),
                      ),
                      h('label', { className: 'desk-management-field' },
                        h('span', { className: 'muted' }, 'Detail'),
                        h('textarea', {
                          rows: 3,
                          value: managementDraft.guardrails.detail,
                          placeholder: 'Approval gates, ownership rules, and safety constraints',
                          onChange: (event) => updateDeskManagementDraft(setDeskManagementDrafts, targetDeskId, (draft) => ({
                            ...draft,
                            guardrails: {
                              ...draft.guardrails,
                              detail: event.target.value,
                            },
                          })),
                        }),
                      ),
                    ),
                    h('section', { className: 'desk-management-section' },
                      h('div', { className: 'desk-management-section-header' },
                        h('div', { className: 'signal-summary' }, 'Add Assessment'),
                        h('button', {
                          className: 'mini',
                          type: 'button',
                          onClick: () => clearDeskManagementDraftSection(setDeskManagementDrafts, targetDeskId, 'assessment'),
                        }, 'Reset'),
                      ),
                      h('label', { className: 'desk-management-field' },
                        h('span', { className: 'muted' }, 'Assessment id'),
                        h('input', {
                          type: 'text',
                          value: managementDraft.assessment.testId,
                          placeholder: 'qa-assessment-1',
                          onChange: (event) => updateDeskManagementDraft(setDeskManagementDrafts, targetDeskId, (draft) => ({
                            ...draft,
                            assessment: {
                              ...draft.assessment,
                              testId: event.target.value,
                            },
                          })),
                        }),
                      ),
                      h('label', { className: 'desk-management-field' },
                        h('span', { className: 'muted' }, 'Notes'),
                        h('textarea', {
                          rows: 3,
                          value: managementDraft.assessment.notes,
                          placeholder: 'pass criteria, caveats, follow-up notes',
                          onChange: (event) => updateDeskManagementDraft(setDeskManagementDrafts, targetDeskId, (draft) => ({
                            ...draft,
                            assessment: {
                              ...draft.assessment,
                              notes: event.target.value,
                            },
                          })),
                        }),
                      ),
                      h('div', { className: 'button-row desk-management-actions' },
                        h('button', {
                          className: 'mini',
                          type: 'button',
                          disabled: deskPanelActionBusy,
                          onClick: addAssessment,
                        }, deskPanelActionBusy ? 'Submitting...' : 'Add Assessment'),
                      ),
                    ),
                  ),
                ),
              )
            : h('div', { className: 'desk-truth-summary panel-card', 'data-qa': 'desk-truth-summary' },
                h('div', { className: 'inspector-label' }, 'Desk Truth'),
                h('div', { className: 'signal-summary' }, `${targetDeskLabel} is read-only`),
                panelData?.truth
                  ? renderTruthMetricRows(panelData.truth)
                  : h('div', { className: 'signal-empty muted' }, 'No desk truth payload available.'),
              ),
        ) : null,
        !deskPanelBusy && panelData && deskPanelTab === 'qa' ? h('div', { className: 'desk-panel-list', 'data-qa': 'qa-properties-panel' },
          panelData.qa
            ? h(React.Fragment, null,
                h('div', { className: 'desk-panel-item desk-truth-summary', 'data-qa': 'desk-truth-summary' },
                  h('div', { className: 'inspector-label' }, 'Desk Truth'),
                  h('div', { className: 'signal-summary' }, `${targetDeskLabel} truth bundle`),
                  renderTruthMetricRows(panelData.truth || {}, hierarchyModel.focusSummary),
                ),
                h('div', { className: 'desk-panel-item' },
                  h('div', { className: 'signal-summary' }, panelData.qa.structuredSummary?.summary || 'Structured QA'),
                  h('div', { className: 'signal-meta muted' }, `Status: ${panelData.qa.structuredSummary?.status || 'idle'} | Desks ${panelData.qa.structuredSummary?.deskCount || 0} | Tests ${panelData.qa.structuredSummary?.testCount || 0}`),
                  (panelData.qa.structuredReport?.failures || []).length
                    ? h('ul', { className: 'signal-list compact' }, panelData.qa.structuredReport.failures.slice(0, 4).map((failure, index) => h('li', { key: `qa-structured-failure-${index}` }, `${failure.desk || 'desk'}: ${failure.test || failure.id || 'test'} | ${failure.reason || 'Needs review'}`)))
                    : h('div', { className: 'signal-meta muted' }, 'No structured QA failures are recorded in the latest suite.'),
                ),
                h('div', { className: 'signal-meta muted' }, 'Execution controls live in the QA utility window so desk inspection stays read-only.'),
                renderDeskUtilityActions('qa-lead', { compact: true }),
                (panelData.qa.scorecards || []).length
                  ? h('div', { className: 'desk-panel-item' },
                      h('div', { className: 'signal-summary' }, `Scorecards (${panelData.qa.scorecards.length})`),
                      h('div', { className: 'desk-panel-list' }, panelData.qa.scorecards.slice(0, 6).map((card) => h('div', { key: card.id || `${card.desk}-${card.testId}`, className: 'desk-panel-item' },
                        h('div', { className: 'signal-summary' }, `${card.desk || 'desk'} | ${card.testName || card.testId || 'QA test'}`),
                        h('div', { className: 'signal-meta muted' }, `Status ${card.status || 'pass'} | Overall ${card.overallScore?.value ?? 'n/a'} / ${card.overallScore?.max ?? 4}`),
                        card.validation?.summary ? h('div', { className: 'signal-meta muted' }, card.validation.summary) : null,
                      ))),
                    )
                  : h('div', { className: 'signal-empty muted' }, 'No structured QA scorecards are recorded yet.'),
                panelData.qa.latestBrowserRun
                  ? h('div', { className: 'desk-panel-item' },
                      h('div', { className: 'signal-summary' }, `Browser: ${panelData.qa.latestBrowserRun.scenario || 'layout-pass'} | ${panelData.qa.latestBrowserRun.verdict || panelData.qa.latestBrowserRun.status || 'pending'}`),
                      h('div', { className: 'signal-meta muted' }, `Findings ${panelData.qa.latestBrowserRun.findingCount || 0}`),
                      panelData.qa.latestBrowserRun.id
                        ? h('div', { className: 'button-row' },
                            h('button', { className: 'mini', type: 'button', onClick: () => loadQARunDetails(panelData.qa.latestBrowserRun.id) }, 'Open latest browser run'),
                          )
                        : null,
                    )
                  : h('div', { className: 'signal-empty muted' }, 'No browser QA run is recorded yet.'),
                (panelData.qa.browserRuns || []).length
                  ? h('div', { className: 'desk-panel-item' },
                      h('div', { className: 'signal-summary' }, `Recent Browser Runs (${panelData.qa.browserRuns.length})`),
                      h('div', { className: 'desk-panel-list' }, panelData.qa.browserRuns.slice(0, 4).map((run) => h('div', { key: run.id || `${run.scenario}-${run.finishedAt || run.createdAt || 'latest'}`, className: 'desk-panel-item' },
                        h('div', { className: 'signal-summary' }, `${run.scenario || 'layout-pass'} | ${run.verdict || run.status || 'pending'}`),
                        h('div', { className: 'signal-meta muted' }, `Trigger ${run.trigger || 'manual'} | Findings ${run.findingCount || 0}`),
                        run.id ? h('div', { className: 'button-row' },
                          h('button', { className: 'mini', type: 'button', onClick: () => loadQARunDetails(run.id) }, 'Open run'),
                        ) : null,
                      ))),
                    )
                  : h('div', { className: 'signal-empty muted' }, 'No browser QA history is recorded yet.'),
                panelData.qa.localGate?.unit || panelData.qa.localGate?.studioBoot
                  ? h('div', { className: 'desk-panel-item' },
                      h('div', { className: 'signal-summary' }, 'Local Gate'),
                      panelData.qa.localGate?.unit ? h('div', { className: 'desk-panel-item' },
                        h('div', { className: 'signal-summary' }, 'Fast Unit Gate'),
                        h('div', { className: 'signal-meta muted' }, `Status ${panelData.qa.localGate.unit.status || 'pending'} | ${panelData.qa.localGate.unit.passedCount || 0}/${panelData.qa.localGate.unit.totalChecks || 0} checks passed`),
                        (panelData.qa.localGate.unit.failures || []).length
                          ? h('ul', { className: 'signal-list compact' }, panelData.qa.localGate.unit.failures.slice(0, 3).map((failure) => h('li', { key: failure.name || failure.path || failure.error }, `${failure.name || failure.path || 'check'}: ${failure.error || 'failed'}`)))
                          : h('div', { className: 'signal-meta muted' }, 'No failing fast UI checks in the latest run.'),
                      ) : null,
                      panelData.qa.localGate?.studioBoot ? h('div', { className: 'desk-panel-item' },
                        h('div', { className: 'signal-summary' }, 'Studio Boot Guardrail'),
                        h('div', { className: 'signal-meta muted' }, `Status ${panelData.qa.localGate.studioBoot.verdict || panelData.qa.localGate.studioBoot.status || 'pending'} | findings ${panelData.qa.localGate.studioBoot.findingCount || 0}`),
                        (panelData.qa.localGate.studioBoot.failedSteps || []).length
                          ? h('ul', { className: 'signal-list compact' }, panelData.qa.localGate.studioBoot.failedSteps.map((step) => h('li', { key: step.id }, `${step.label}: ${step.verdict}`)))
                          : h('div', { className: 'signal-meta muted' }, 'No failing Studio boot steps in the latest guardrail run.'),
                      ) : null,
                    )
                  : h('div', { className: 'signal-empty muted' }, 'No local gate evidence is recorded yet.'),
                (panelData.qa.availableTests || []).length
                  ? h('div', { className: 'desk-panel-item' },
                      h('div', { className: 'signal-summary' }, 'Runnable Suites'),
                      h('div', { className: 'signal-meta muted' }, panelData.qa.availableTests.map((suite) => suite.name).join(' | ')),
                    )
                  : null,
              )
            : h('div', { className: 'signal-empty muted' }, 'No QA properties available.'),
        ) : null,
        !deskPanelBusy && panelData && deskPanelTab === 'agents' ? h('div', { className: 'desk-panel-list' },
          (panelData.agents || []).length
            ? panelData.agents.map((entry) => h('div', { key: entry.id, className: 'desk-panel-item' },
                h('div', { className: 'signal-summary' }, entry.id),
                h('div', { className: 'signal-meta muted' }, `Status: ${entry.status} | ${entry.backend || 'backend n/a'} ${entry.model || ''}`),
                entry.currentTask
                  ? h('div', { className: 'signal-meta muted' }, `Task: ${entry.currentTask.title} | ${entry.currentTask.lifecycle} | ${entry.currentTask.progress?.label || 'n/a'}`)
                  : h('div', { className: 'signal-meta muted' }, 'No current task assigned'),
              ))
            : h('div', { className: 'signal-empty muted' }, 'No agents assigned.'),
        ) : null,
        !deskPanelBusy && panelData && deskPanelTab === 'tasks' ? h('div', { className: 'desk-panel-list' },
          (panelData.tasks || []).length
            ? panelData.tasks.map((task) => h('div', { key: task.id, className: 'desk-panel-item' },
                h('div', { className: 'signal-summary' }, task.title),
                h('div', { className: 'signal-meta muted' }, `${task.lifecycle} | ${task.progress?.label || 'n/a'} | source ${task.source}`),
              ))
            : h('div', { className: 'signal-empty muted' }, 'No backlog tasks assigned to this desk.'),
        ) : null,
        !deskPanelBusy && panelData && deskPanelTab === 'tools' ? h('div', { className: 'desk-panel-list' },
          (panelData.modules || []).length
            ? panelData.modules.map((module) => h('div', { key: module.id, className: 'desk-panel-item' },
                h('div', { className: 'signal-summary' }, `${module.id} ${module.assigned ? '(assigned)' : ''}`),
                h('div', { className: 'signal-meta muted' }, `${module.version} | ${module.manifestPath}`),
              ))
            : h('div', { className: 'signal-empty muted' }, 'No modules found in workspace registry.'),
        ) : null,
        !deskPanelBusy && panelData && deskPanelTab === 'reports' ? h('div', { className: 'desk-panel-list' },
          (panelData.reports || []).length
            ? panelData.reports.map((report) => h('div', { key: report.id, className: 'desk-panel-item' },
                h('div', { className: 'signal-summary' }, `${report.name} (${report.verdict})`),
                h('div', { className: 'signal-meta muted' }, `${report.type} | ${report.source}${report.detail ? ` | ${report.detail}` : ''}`),
              ))
            : h('div', { className: 'signal-empty muted' }, 'no reports available'),
        ) : null,
        isCtoEdit ? h('div', { className: 'desk-chat-panel' },
          h('div', { className: 'signal-summary' }, 'Shared CTO utility'),
          h('div', { className: 'signal-meta muted' }, 'The live CTO chat now lives in one shared floating panel so Studio and Canvas use the same grounded backend path.'),
          h('div', { className: 'button-row' },
            h('button', {
              className: 'mini',
              type: 'button',
              onClick: () => openUtilityWindow('cto-chat'),
            }, 'Open CTO Chat'),
          ),
        ) : null,
      ),
    );
  };

  const renderMainPanel = () => h('section', { className: 'spatial-main ace-shell', 'data-qa': 'spatial-root', style: { gridTemplateColumns: 'minmax(0, 1fr)' } },
    h('div', { className: 'canvas-column scene-column' },
      h('div', { className: 'canvas-toolbar ace-toolbar' },
        h('div', { className: 'toolbar-summary-row' },
          h('div', { className: 'toolbar-summary-primary' },
            h('input', {
              className: 'mini toolbar-title-input',
              type: 'text',
              value: workspaceBannerTitle,
              onChange: (event) => setWorkspaceBannerTitle(event.target.value),
              'data-qa': 'toolbar-title-input',
              'aria-label': 'Workspace banner title',
            }),
            h('div', { className: 'toolbar-caption muted' }, `Page: ${activePage?.title || 'Current Page'} | Orchestrator: ${orchestratorState.status || 'idle'} | Active desks: ${(orchestratorState.activeDeskIds || []).length}`),
          ),
          h('div', { className: 'toolbar-summary-actions' },
            h('div', { className: 'scene-switcher' },
              h('button', { className: `mini ${scene === SCENES.CANVAS ? 'active' : ''}`, 'data-qa': 'scene-canvas-button', onClick: () => setScene(SCENES.CANVAS), type: 'button' }, 'Canvas'),
              h('button', { className: `mini ${scene === SCENES.STUDIO ? 'active' : ''}`, 'data-qa': 'scene-studio-button', onClick: () => setScene(SCENES.STUDIO), type: 'button' }, 'ACE Studio'),
            ),
            h('span', { className: 'toolbar-status' }, `${sceneLabel} | ${activeGraphLabel}${activeGraphLayer === 'world' ? ` | View ${worldViewMode}` : ''} | Page ${activePage?.title || 'Current Page'} | Canvas ${Math.round(canvasViewport.zoom * 100)}% | Studio ${Math.round(studioViewport.zoom * 100)}% | ${status}`),
          ),
        ),
        h('div', { className: 'toolbar-toggle-row' },
          h('button', {
            className: `mini toolbar-section-toggle ${utilityWindows['cto-chat']?.open ? 'active' : ''}`,
            type: 'button',
            'data-qa': 'toolbar-cto-chat-button',
            onClick: () => openUtilityWindow('cto-chat', { docked: false }),
          }, utilityWindows['cto-chat']?.open ? 'CTO Chat Open' : 'CTO Chat'),
          h('button', {
            className: `mini toolbar-section-toggle ${toolbarSectionsOpen.view ? 'active' : ''}`,
            type: 'button',
            onClick: () => toggleToolbarSection('view'),
            'data-qa': 'toolbar-view-toggle',
          }, toolbarSectionsOpen.view ? 'Hide View' : 'View Controls'),
          h('button', {
            className: `mini toolbar-section-toggle ${toolbarSectionsOpen.launch ? 'active' : ''}`,
            type: 'button',
            onClick: () => toggleToolbarSection('launch'),
            'data-qa': 'toolbar-launch-toggle',
          }, toolbarSectionsOpen.launch ? 'Hide Sim Launch' : 'Sim Launch'),
          scene === SCENES.STUDIO ? h(ActionButton, {
            actionId: 'toggle_utility_dock',
            context: { utilityDockOpen },
            actionStatus: uiActionStatus,
            onAction: runStudioUiAction,
            className: `mini ${utilityDockOpen ? 'active' : ''}`,
            type: 'button',
            dataQa: 'toolbar-utilities-button',
          }) : null,
          scene === SCENES.STUDIO ? h('button', { className: 'mini', 'data-qa': 'reset-view-button', type: 'button', onClick: () => resetStudioView() }, 'Reset View') : null,
        ),
        scene === SCENES.STUDIO ? h('div', { className: 'toolbar-quick-access', 'data-qa': 'studio-default-controls' },
          h('div', { className: 'toolbar-caption muted' }, 'Quick access'),
          h('div', { className: 'toolbar-quick-access-row' },
            studioQuickAccessStrip.map((control) => h('button', {
              key: control.id,
              className: `mini quick-access-pill ${control.tone || ''} ${control.active ? 'active' : ''}`,
              type: 'button',
              'data-qa': `studio-quick-access-${control.id}`,
              onClick: () => {
                if (control.id === 'department' || control.id === 'desk') {
                  focusStudioAgent(control.targetDeskId);
                  return;
                }
                if (control.id === 'people-plan') {
                  setScene(SCENES.STUDIO);
                  openUtilityWindow(control.windowId || 'roster');
                  return;
                }
                if (control.id === 'whiteboard') {
                  setScene(SCENES.STUDIO);
                  setTeamBoardWallBoardExpanded(true);
                  centerStudioOnRoom('whiteboard opened');
                  return;
                }
                if (control.id === 'utilities') {
                  runStudioUiAction('toggle_utility_dock');
                }
              },
            }, control.label)),
          ),
        ) : null,
        toolbarSectionsOpen.view ? h('div', { className: 'toolbar-panel' },
          h('div', { className: 'toolbar-panel-header' },
            h('div', { className: 'workspace-title' }, 'View Controls'),
            h('div', { className: 'toolbar-caption muted' }, 'Scene, graph, pages, and viewport settings.'),
          ),
          h('div', { className: 'toolbar-meta toolbar-meta-top' },
            h('div', { className: 'scene-switcher' },
              h('button', { className: `mini ${scene === SCENES.CANVAS ? 'active' : ''}`, 'data-qa': 'scene-canvas-button-panel', onClick: () => setScene(SCENES.CANVAS), type: 'button' }, 'Canvas'),
              h('button', { className: `mini ${scene === SCENES.STUDIO ? 'active' : ''}`, 'data-qa': 'scene-studio-button-panel', onClick: () => setScene(SCENES.STUDIO), type: 'button' }, 'ACE Studio'),
            ),
            h('div', { className: 'scene-switcher graph-layer-switcher' },
              GRAPH_LAYERS.map((layer) => h('button', {
                key: layer,
                className: `mini graph-layer-pill ${activeGraphLayer === layer ? 'active' : ''}`,
                'data-qa': `graph-layer-${layer}`,
                onClick: () => switchGraphLayer(layer),
                type: 'button',
              }, GRAPH_LAYER_TITLES[layer] || layer)),
            ),
            activeGraphLayer === 'world' ? h('div', { className: 'scene-switcher graph-layer-switcher' },
              WORLD_VIEW_MODES.map((mode) => h('button', {
                key: mode,
                className: `mini graph-layer-pill ${worldViewMode === mode ? 'active' : ''}`,
                type: 'button',
                disabled: mode === '3d',
                title: mode === '3d' ? '3D is a placeholder in this slice.' : `Switch world view to ${mode}`,
                onClick: mode === '3d' ? undefined : () => setWorldViewMode(mode),
              }, mode.toUpperCase())),
            ) : null,
            activeGraphLayer === 'world' ? h('button', {
              className: `mini ${showRecentWorldChanges ? 'active' : ''}`,
              type: 'button',
              disabled: !recentWorldChange,
              title: recentWorldChange
                ? 'Toggle the recent world change overlay.'
                : 'No recent world change has been derived in this session yet.',
              'data-qa': 'recent-world-changes-toggle',
              onClick: () => setShowRecentWorldChanges((value) => !value),
            }, showRecentWorldChanges ? 'Hide Recent' : 'Show Recent') : null,
            h('select', {
              className: 'mini origin-filter-select',
              value: originFilter,
              onChange: (event) => setOriginFilter(event.target.value),
              'data-qa': 'origin-filter',
            }, NODE_ORIGIN_FILTER_OPTIONS.map((option) => h('option', { key: option.value, value: option.value }, option.label))),
            h('select', {
              className: 'mini recent-select',
              'data-qa': 'page-select',
              value: notebookState.activePageId || '',
              onChange: (event) => setActivePageId(event.target.value),
            },
              notebookState.pages.map((page) => h('option', { key: page.id, value: page.id }, page.title)),
            ),
            h('select', {
              className: 'mini recent-select',
              'data-qa': 'recent-saves-select',
              value: '',
              onChange: (event) => {
                const selectedEntry = recentHistory.find((entry) => entry.at === event.target.value);
                if (selectedEntry) setStatus(`recent autosave ${new Date(selectedEntry.at).toLocaleString()} | ${selectedEntry.summary?.nodes || 0} nodes`);
                event.target.value = '';
              },
            },
              h('option', { value: '' }, 'Recent Saves'),
              recentHistory.map((entry) => h('option', { key: entry.at, value: entry.at }, `${new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${entry.summary?.nodes || 0} nodes`)),
            ),
          ),
        ) : null,
        toolbarSectionsOpen.launch ? h('div', { className: 'toolbar-panel' },
          h('div', { className: 'toolbar-panel-header' },
            h('div', { className: 'workspace-title' }, 'Sim Launch'),
            h('div', { className: 'toolbar-caption muted' }, 'Launch from a dedicated utility panel instead of the default banner.'),
          ),
          renderSimLaunchOverlay({
            project: simLauncher.project,
            status: simLauncher.status,
            launchedUrl: simLauncher.launchedUrl,
            supportedOrigin: simLauncher.supportedOrigin,
            busy: simLauncher.busy,
            error: simLauncher.error,
            onLaunch: runSimLaunch,
          }),
        ) : null,
        h('div', { className: 'canvas-control-dock toolbar-meta toolbar-meta-bottom' },
          h('div', { className: 'button-row' },
            h('button', { className: 'mini', onClick: newCanvas, type: 'button' }, 'New Canvas'),
            h('button', {
              className: `mini ${utilityWindows['cto-chat']?.open ? 'active' : ''}`,
              onClick: () => openUtilityWindow('cto-chat', { docked: false }),
              type: 'button',
              'data-qa': 'canvas-cto-chat-button',
            }, 'CTO Chat'),
            h('button', { className: `mini ${sketchMode ? 'active' : ''}`, onClick: () => setSketchMode((value) => !value), type: 'button', disabled: scene !== SCENES.CANVAS }, sketchMode ? 'Sketch On' : 'Sketch'),
            h('button', { className: 'mini', onClick: clearSketchLayer, type: 'button', disabled: scene !== SCENES.CANVAS }, 'Clear Marks'),
            h('button', { className: 'mini', onClick: () => setSimulating((value) => !value), type: 'button' }, simulating ? 'Stop Sim' : 'Simulate'),
            selectedSupportsSecondaryDrafting && h('button', {
              className: 'mini',
              onClick: () => runAiProcess(selected).catch((error) => setStatus(error.message)),
              type: 'button',
              title: 'Secondary drafting only. This does not route live world scaffolds.',
            }, 'Draft Notes'),
          ),
          selected && isPrimaryIntentNode(selected) ? h('div', { className: 'toolbar-caption' }, 'Primary context node mirrors Canvas Intent only. Route live intent from the Canvas Intent panel.') : null,
        ),
      ),
      h('div', { className: 'scene-shell' },
        h('div', {
          className: `scene-layer canvas-scene ${scene === SCENES.CANVAS ? 'active' : 'inactive'}`,
          'data-qa': 'canvas-scene',
          'aria-hidden': scene !== SCENES.CANVAS,
        },
          h('div', {
            className: 'canvas-shell',
            'data-qa': 'canvas-shell',
            onMouseMove: onCanvasMouseMove,
            onMouseUp: onCanvasMouseUp,
            onMouseLeave: onCanvasMouseUp,
          },
            h('canvas', {
              ref: canvasRef,
              width: 1600,
              height: 920,
              tabIndex: 0,
              onDoubleClick: onCanvasDoubleClick,
              onWheel: onCanvasWheel,
              onMouseDown: onCanvasMouseDown,
              onContextMenu: (event) => event.preventDefault(),
            }),
            annotations.map((note) => {
              const x = note.position.x * canvasViewport.zoom + canvasViewport.x;
              const y = note.position.y * canvasViewport.zoom + canvasViewport.y;
              return h('div', {
                key: note.id,
                className: `annotation ${selectedAnnotationId === note.id ? 'selected' : ''}`,
                style: { left: `${x}px`, top: `${y}px`, transform: `scale(${canvasViewport.zoom})`, transformOrigin: 'top left' },
                onMouseDown: () => {
                  if (!sketchMode) return;
                  setSelectedAnnotationId(note.id);
                  setSelectedSketchId(null);
                },
              },
                h('div', { className: 'annotation-header' }, 'Annotation'),
                h('textarea', {
                  value: note.content,
                  onChange: (event) => setAnnotations((previous) => previous.map((entry) => (entry.id === note.id ? { ...entry, content: event.target.value } : entry))),
                  onMouseDown: (event) => event.stopPropagation(),
                  disabled: !sketchMode,
                }),
              );
            }),
            graph.nodes.map((node) => {
              const nodeOrigin = resolveNodeOrigin(node);
              if (originFilter !== 'all' && nodeOrigin !== originFilter) return null;
              const x = node.position.x * canvasViewport.zoom + canvasViewport.x;
              const y = node.position.y * canvasViewport.zoom + canvasViewport.y;
              const nodeRepresentation = activeGraphLayer === 'world'
                ? getWorldRepresentation(node, canvasViewport.zoom)
                : getSketchRepresentation(node, canvasViewport.zoom);
              const originLabel = NODE_ORIGIN_LABELS[nodeOrigin] || nodeOrigin;
              const classified = classifyNode(node, graph, activeGraphLayer);
              const labels = classified.metadata.labels || [];
              const rsgNodeState = node.metadata?.rsg?.state || null;
              const draftConfidence = node.metadata?.rsg?.confidence;
              const lowConfidenceDraft = isLowConfidence(draftConfidence);
              const generatedInspection = resolveGeneratedNodeInspection(node, graph);
              const extractedIntent = generatedInspection?.extractedIntent || getExtractedIntent(node.metadata?.intentAnalysis);
              const expandedGenerated = Boolean(expandedGeneratedNodeIds[node.id]);
              const relatedEdgeSummaries = (generatedInspection?.relatedEdges || []).map((edge) => {
                const sourceLabel = (extractedIntent?.candidateNodes || []).find((entry) => entry.id === edge.sourceCandidateId)?.label || edge.sourceCandidateId;
                const targetLabel = (extractedIntent?.candidateNodes || []).find((entry) => entry.id === edge.targetCandidateId)?.label || edge.targetCandidateId;
                return `${sourceLabel} -> ${targetLabel} | ${edge.kind}${edge.rationale ? ` | ${edge.rationale}` : ''}`;
              });
              const rsg = node.metadata?.rsg || null;
              const rsgSummary = String(rsg?.summary || '').trim();
              const rsgSourceLabel = rsg?.sourceNodeId ? `node ${String(rsg.sourceNodeId).slice(-4)}` : 'manual input';
              const rsgConfidenceLabel = Number.isFinite(Number(rsg?.confidence)) ? `${Math.round(Number(rsg.confidence) * 100)}% confidence` : null;
              const rsgFallbackLabel = rsg?.usedFallback ? 'fallback' : null;
              const rsgGenerationLabel = rsg?.state === 'linked-draft' ? 'Generated' : 'Adopted';
              const primaryIntentNode = isPrimaryIntentNode(node);
              const recentNodeChange = activeGraphLayer === 'world' && showRecentWorldChanges
                ? resolveRecentWorldNodeChange(recentWorldChange, node.id)
                : null;
              const rsgAttribution = rsg
                ? [rsgGenerationLabel, `from ${rsgSourceLabel}`, rsgConfidenceLabel, rsgFallbackLabel].filter(Boolean).join(' | ')
                : null;
              const intentFooterText = primaryIntentNode
                ? PRIMARY_INTENT_REDIRECT_HINT
                : node.metadata?.intentAnalysis
                  ? summarizeIntentReport(node.metadata.intentAnalysis)
                  : (rsg
                      ? (rsgNodeState === 'linked-draft' ? 'Linked draft ready for edit' : 'Adopted draft stays in place on rerun')
                      : SECONDARY_DRAFT_HINT);
              return h('div', {
                key: node.id,
                className: `node ${classified.type} ${classified.metadata.role} layer-${activeGraphLayer} origin-${nodeOrigin} ${selectedId === node.id ? 'selected' : ''} ${isLinkedDraftNode(node) ? 'rsg-linked-draft' : ''} ${isAdoptedDraftNode(node) ? 'rsg-adopted' : ''} ${lowConfidenceDraft ? 'rsg-low-confidence' : ''} ${expandedGenerated ? 'expanded' : ''} ${recentNodeChange ? `recent-world-change recent-world-${recentNodeChange.changeType}` : ''}`,
                'data-representation-id': nodeRepresentation?.rep_id || null,
                'data-representation-kind': nodeRepresentation?.kind || 'legacy',
                style: {
                  left: `${x}px`,
                  top: `${y}px`,
                  transform: `scale(${canvasViewport.zoom})`,
                  transformOrigin: 'top left',
                  pointerEvents: sketchMode ? 'none' : 'auto',
                  opacity: sketchMode ? 0.82 : 1,
                },
                title: nodeRepresentation
                  ? `${node.content || 'Node'} | ${nodeRepresentation.kind} | ${nodeRepresentation.rep_id}`
                  : node.content || 'Node',
                onMouseDown: (event) => onNodeMouseDown(event, node),
                onContextMenu: (event) => openAdvancedProperties(event, node),
              },
                h('button', {
                  className: 'node-handle input',
                  type: 'button',
                  title: 'Drop connector here',
                  onMouseUp: (event) => {
                    event.stopPropagation();
                    completeConnection(node.id);
                  },
                }),
                h('button', {
                  className: 'node-close',
                  type: 'button',
                  title: 'Delete node',
                  onClick: (event) => {
                    event.stopPropagation();
                    removeNode(node.id);
                    setStatus('node deleted');
                  },
                }, 'X'),
                h('div', { className: 'node-header-row' },
                  h('div', { className: 'node-header' }, `${activeGraphLayer.toUpperCase()} | ${classified.metadata.proposalTarget || classified.metadata.role}`),
                  h('div', { className: 'node-header-tags' },
                    h('div', { className: `node-origin-badge origin-${nodeOrigin}` }, originLabel),
                    primaryIntentNode ? h('div', { className: 'node-rsg-chip primary-intent' }, 'Primary mirror') : null,
                    recentNodeChange ? h('div', { className: `node-rsg-chip recent-world-chip ${recentNodeChange.changeType}` }, recentNodeChange.changeType === 'added' ? 'Recent +' : 'Recent ~') : null,
                    rsgNodeState ? h('div', { className: `node-rsg-chip ${rsgNodeState}` }, rsgNodeState === 'linked-draft' ? 'RSG draft' : 'Adopted') : null,
                    generatedInspection?.basis ? h('div', { className: `node-rsg-chip basis-${generatedInspection.basis}` }, generatedInspection.basis) : null,
                    lowConfidenceDraft ? h('div', { className: 'node-rsg-chip low-confidence' }, 'Low confidence') : null,
                  ),
                ),
                h('textarea', {
                  className: 'node-editor',
                  value: node.content,
                  title: primaryIntentNode ? 'Primary canvas mirror only. Route live world changes from Canvas Intent.' : 'Secondary drafting note. Enter refreshes note analysis only.',
                  onChange: (event) => handleNodeContentChange(node, event.target.value),
                  onFocus: () => keys.current.clear(),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      commitNodeIntent(node.id, event.target.value, {
                        source: 'node-enter',
                        trigger: 'enter',
                      }).catch((error) => setStatus(error.message));
                    }
                  },
                  onMouseDown: (event) => event.stopPropagation(),
                }),
                h('div', { className: 'node-footer' },
                  h('div', { className: 'node-labels' }, labels.length ? labels.join(' - ') : (primaryIntentNode ? 'primary canvas mirror' : 'secondary draft note')),
                  h('div', { className: 'node-intent-summary muted' }, `${node.id.slice(-4)} | ${classified.metadata.role}`),
                  rsgAttribution ? h('div', { className: 'node-intent-summary muted' }, rsgAttribution) : null,
                  rsgSummary ? h('div', { className: 'node-intent-summary muted' }, rsgSummary) : null,
                  h('div', { className: 'node-intent-summary' }, intentFooterText),
                  generatedInspection?.candidate ? h('div', { className: 'node-generated-controls' },
                    h('button', {
                      className: 'mini',
                      type: 'button',
                      onMouseDown: (event) => event.stopPropagation(),
                      onClick: (event) => {
                        event.stopPropagation();
                        toggleGeneratedNodeExpansion(node.id);
                      },
                    }, expandedGenerated ? 'Hide details' : 'Inspect intent'),
                  ) : null,
                  generatedInspection?.candidate && expandedGenerated ? h('div', { className: 'generated-intent-panel' },
                    h('div', { className: 'generated-intent-row' }, h('span', null, 'Basis'), h('span', { className: 'muted' }, generatedInspection.basis)),
                    generatedInspection.candidate.rationale ? h('div', { className: 'generated-intent-block' },
                      h('div', { className: 'generated-intent-label' }, 'Rationale'),
                      h('div', null, generatedInspection.candidate.rationale),
                    ) : null,
                    extractedIntent?.summary ? h('div', { className: 'generated-intent-block' },
                      h('div', { className: 'generated-intent-label' }, 'Source summary'),
                      h('div', null, extractedIntent.summary),
                    ) : null,
                    h('div', { className: 'generated-intent-row' }, h('span', null, 'Confidence'), h('span', { className: 'muted' }, Number.isFinite(Number(generatedInspection.confidence)) ? `${Math.round(Number(generatedInspection.confidence) * 100)}%` : 'n/a')),
                    h('div', { className: 'generated-intent-row' }, h('span', null, 'Fallback'), h('span', { className: 'muted' }, extractedIntent?.provenance?.usedFallback ? 'Yes' : 'No')),
                    (generatedInspection.basis === 'explicit' ? extractedIntent?.explicitClaims : extractedIntent?.inferredClaims)?.length
                      ? h('div', { className: 'generated-intent-block' },
                        h('div', { className: 'generated-intent-label' }, generatedInspection.basis === 'explicit' ? 'Explicit claims' : 'Inferred claims'),
                        h('ul', { className: 'signal-list compact' }, (generatedInspection.basis === 'explicit' ? extractedIntent.explicitClaims : extractedIntent.inferredClaims).map((entry, index) => h('li', { key: `${node.id}-claim-${index}` }, entry))),
                      ) : null,
                    (extractedIntent?.gaps || []).length
                      ? h('div', { className: 'generated-intent-block' },
                        h('div', { className: 'generated-intent-label' }, 'Gaps'),
                        h('ul', { className: 'signal-list compact' }, extractedIntent.gaps.map((entry, index) => h('li', { key: `${node.id}-gap-${index}` }, entry))),
                      ) : null,
                    relatedEdgeSummaries.length
                      ? h('div', { className: 'generated-intent-block' },
                        h('div', { className: 'generated-intent-label' }, 'Hidden edge suggestions'),
                        h('ul', { className: 'signal-list compact' }, relatedEdgeSummaries.map((entry, index) => h('li', { key: `${node.id}-edge-${index}` }, entry))),
                      ) : null,
                  ) : null,
                ),
                h('button', {
                  className: 'node-handle output',
                  type: 'button',
                  title: 'Drag connection',
                  onMouseDown: (event) => beginConnection(event, node.id),
                }),
              );
            }),
            h('div', { className: 'scene-indicator canvas-indicator' },
              h('div', { className: 'indicator-title' }, 'Canvas Layer'),
              h('div', { className: 'muted' }, `Zoom below ${Math.round(STUDIO_ZOOM_THRESHOLD * 100)}% or press Tab to open ACE Studio.`),
            ),
          ),
        ),
        h('div', {
          className: `scene-layer studio-scene ${scene === SCENES.STUDIO ? 'active' : 'inactive'}`,
          'data-qa': 'studio-scene',
          'aria-hidden': scene !== SCENES.STUDIO,
        },
          h('div', {
            ref: studioRef,
            className: 'studio-shell',
            'data-qa': 'studio-shell',
            onMouseDown: onStudioMouseDown,
            onMouseMove: onStudioMouseMove,
            onMouseUp: onStudioMouseUp,
            onMouseLeave: onStudioMouseUp,
            onWheel: onStudioWheel,
          },
            h('div', {
              className: 'studio-world',
              'data-qa': 'studio-world',
              style: {
                width: `${STUDIO_SIZE.width}px`,
                height: `${STUDIO_SIZE.height}px`,
                transform: `translate(${studioViewport.x}px, ${studioViewport.y}px) scale(${studioViewport.zoom})`,
            },
          },
              h('div', { className: 'studio-floor' }),
              h('svg', {
                className: 'studio-boundary-layer',
                'data-qa': 'studio-boundary-layer',
                viewBox: `0 0 ${STUDIO_SIZE.width} ${STUDIO_SIZE.height}`,
                'aria-hidden': true,
              },
                studioRenderModel.departments.map((room) => h('g', {
                  key: room.id,
                  className: `studio-boundary room-${room.tone || room.id}`,
                },
                  h('rect', {
                    x: room.bounds.x,
                    y: room.bounds.y,
                    width: room.bounds.width,
                    height: room.bounds.height,
                    rx: 18,
                    ry: 18,
                    className: 'studio-boundary-rect',
                    'data-room-id': room.id,
                    'data-room-label': room.label,
                    'data-room-status': room.statusLabel || room.status || 'ready',
                  }),
                  h('text', {
                    x: room.bounds.x + 14,
                    y: room.bounds.y + 21,
                    className: 'studio-boundary-label',
                  }, room.label),
                  h('g', { className: `studio-boundary-status ${getOrgStatusMeta(room.statusLabel || room.status).tone}` },
                    h('rect', {
                      x: room.bounds.x + room.bounds.width - 116,
                      y: room.bounds.y + 10,
                      width: 102,
                      height: 18,
                      rx: 9,
                      className: 'studio-boundary-status-pill',
                    }),
                    h('text', {
                      x: room.bounds.x + room.bounds.width - 65,
                      y: room.bounds.y + 22,
                      className: 'studio-boundary-status-text',
                      textAnchor: 'middle',
                    }, getOrgStatusMeta(room.statusLabel || room.status).badge),
                  ),
                  room.dependencyWarningSummary ? h('text', {
                    x: room.bounds.x + 14,
                    y: room.bounds.y + room.bounds.height - 14,
                    className: 'studio-boundary-warning',
                  }, room.dependencyWarningSummary) : null,
                )),
                studioRenderModel.roomConnections.map((link) => h('g', {
                  key: link.id,
                  className: `studio-boundary-anchor ${link.tone}`,
                },
                  h('path', {
                    d: `M ${link.from.x} ${link.from.y} L ${link.to.x} ${link.to.y}`,
                    className: 'studio-boundary-anchor-line',
                    'data-link-id': link.id,
                    'data-link-label': link.label,
                  }),
                  h('circle', {
                    cx: link.from.x,
                    cy: link.from.y,
                    r: 4,
                    className: 'studio-boundary-anchor-node control',
                  }),
                  h('circle', {
                    cx: link.to.x,
                    cy: link.to.y,
                    r: 3.5,
                    className: 'studio-boundary-anchor-node',
                  }),
                )),
              ),
              h('div', {
                className: 'studio-room',
                'data-qa': 'studio-room',
                'data-stage-x': studioRoom.x,
                'data-stage-y': studioRoom.y,
                'data-stage-width': studioRoom.width,
                'data-stage-height': studioRoom.height,
                style: {
                  left: `${studioRoom.x}px`,
                  top: `${studioRoom.y}px`,
                  width: `${studioRoom.width}px`,
                  height: `${studioRoom.height}px`,
                },
              },
                h('div', { className: 'studio-room-label' }, 'Studio Floor'),
              ),
              h('div', { className: `studio-lane lane-top ${laneState.top.active ? `active ${laneState.top.tone} level-${laneState.top.strength}` : ''}` }),
              h('div', { className: `studio-lane lane-mid ${laneState.mid.active ? `active ${laneState.mid.tone} level-${laneState.mid.strength}` : ''}` }),
              h('div', { className: `studio-lane lane-side ${laneState.side.active ? `active ${laneState.side.tone} level-${laneState.side.strength}` : ''}` }),
              renderStudioTeamBoard(),
              h('svg', { className: 'studio-links-layer', 'data-qa': 'studio-links-layer', viewBox: `0 0 ${STUDIO_SIZE.width} ${STUDIO_SIZE.height}`, 'aria-hidden': true },
                studioLinks.map((link) => {
                  const geometry = resolveDeskAnchor(link.from, link.to, link.kind, studioLayout);
                  if (!geometry) return null;
                  const { from, to, bend, labelOffsetY } = geometry;
                  const horizontal = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
                  const cp1x = horizontal ? from.x + (to.x >= from.x ? bend : -bend) : from.x;
                  const cp1y = horizontal ? from.y : from.y + (to.y >= from.y ? bend : -bend);
                  const cp2x = horizontal ? to.x - (to.x >= from.x ? bend : -bend) : to.x;
                  const cp2y = horizontal ? to.y : to.y - (to.y >= from.y ? bend : -bend);
                  const midX = (from.x + to.x) / 2;
                  const midY = (from.y + to.y) / 2 + labelOffsetY;
                  const showLabel = link.kind === 'handoff'
                    || selectedAgentId === link.from
                    || selectedAgentId === link.to
                    || (link.kind === 'conflict' && selectedAgentId === 'cto-architect');
                  const isSelectedRelationship = selectedRelationshipId === link.id;
                  return h('g', { key: link.id, className: `studio-link ${link.kind} relationship-${link.visualForm} ${isSelectedRelationship ? 'selected' : ''}` },
                    h('path', {
                      d: `M ${from.x} ${from.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${to.x} ${to.y}`,
                      className: `studio-link-path relationship-${link.visualForm} ${isSelectedRelationship ? 'selected' : ''}`,
                      'data-qa': 'studio-link-path',
                      'data-link-id': link.id,
                      'data-link-label': link.label,
                      'data-link-kind': link.kind,
                      'data-from-desk': link.from,
                      'data-to-desk': link.to,
                      'data-relationship-type': link.relationshipType,
                      'data-relationship-strength': link.strength,
                      'data-relationship-strands': link.strandCount,
                      'data-relationship-health': link.health,
                      'data-relationship-form': link.visualForm,
                      'data-start-x': from.x,
                      'data-start-y': from.y,
                      'data-end-x': to.x,
                      'data-end-y': to.y,
                      strokeDasharray: link.dashArray && link.dashArray.length ? link.dashArray.join(' ') : undefined,
                      onMouseDown: (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        focusRelationshipEdge(link, 'studio');
                      },
                      style: {
                        strokeWidth: link.strokeWidth,
                        opacity: link.opacity,
                        cursor: 'pointer',
                      },
                    }),
                    showLabel ? h('text', { x: midX, y: midY, className: 'studio-link-label' }, link.label) : null,
                  );
                }),
              ),
              studioDeskEntries.map((desk) => {
                const deskPosition = desk.position || deskStagePoint(desk.id, studioLayout);
                const meta = STATUS_META[desk.status] || STATUS_META.idle;
                const thoughtBubble = orchestratorState.desks?.[desk.id]?.thoughtBubble || desk.thoughtBubble || null;
                const pageBadge = orchestratorState.activeDeskIds?.includes(desk.id)
                  ? buildDeskBadge(desk.id, orchestratorState, activePage)
                  : null;
                return h('div', {
                  key: desk.id,
                  className: `agent-station ${selectedAgentId === desk.id ? 'selected' : ''} ${desk.isOversight ? 'oversight' : ''} ${getOrgStatusClass(desk.statusLabel || desk.orgStatus || 'ready')}`,
                  'data-qa': `desk-${desk.id}`,
                  'data-desk-id': desk.id,
                  'data-desk-label': desk.name,
                  'data-desk-status': desk.statusLabel || desk.orgStatus || 'ready',
                  'data-stage-x': deskPosition.x,
                  'data-stage-y': deskPosition.y,
                  style: {
                    left: `${deskPosition.x}px`,
                    top: `${deskPosition.y}px`,
                    '--agent-accent': desk.theme.accent,
                    '--agent-shadow': desk.theme.shadow,
                  },
                  role: 'button',
                  tabIndex: 0,
                  onMouseDown: (event) => startStudioElementDrag(event, { type: 'desk', id: desk.id }),
                  onClick: () => focusStudioAgent(desk.id),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      focusStudioAgent(desk.id);
                    }
                  },
                  title: `${desk.name} | ${orchestratorState.desks?.[desk.id]?.currentGoal || desk.role}`,
                },
                  h(DeskThoughtBubble, { text: thoughtBubble, tone: meta.tone }),
                  h('div', { className: 'desk-card-truth' },
                    h('div', { className: 'desk-card-truth-line' }, desk.focusSummary || desk.role),
                    h('div', { className: 'desk-card-truth-line muted' }, desk.throughputLabel),
                    desk.latestSignal ? h('div', { className: 'desk-card-truth-line muted' }, desk.latestSignal) : null,
                    desk.dependencyWarningSummary ? h('div', { className: 'desk-card-truth-line warning' }, desk.dependencyWarningSummary) : null,
                  ),
                  pageBadge ? h('div', { className: 'desk-page-badge' }, pageBadge) : null,
                  h('div', { className: 'station-desk' },
                    h('div', { className: `desk-light ${desk.activityPulse ? 'pulse' : ''} ${desk.unresolved ? 'warning' : ''}` }),
                    h('div', { className: 'station-prop' }),
                    h('div', { className: 'station-screen' }),
                  ),
                  h(PixelAvatar, { accent: desk.theme.accent, status: desk.status }),
                  h('div', { className: `status-chip ${meta.tone}` }, meta.badge),
                  h('div', { className: `org-status-chip ${getOrgStatusMeta(desk.statusLabel || desk.orgStatus).tone}` }, getOrgStatusMeta(desk.statusLabel || desk.orgStatus).badge),
                  h('div', { className: 'agent-label' }, desk.shortLabel),
                );
              }),
              h('div', { className: 'studio-plaque' },
                h('div', { className: 'studio-name' }, 'ACE Studio'),
                h('div', { className: 'muted' }, 'System visualization and control layer'),
              ),
            ),
            h('div', { className: 'scene-indicator studio-indicator' },
              h('div', { className: 'indicator-title-row' },
                h('div', { className: 'indicator-title' }, 'Studio Map'),
                h('button', {
                  className: `mini studio-map-toggle ${studioMapUtilityOpen ? 'active' : ''}`,
                  type: 'button',
                  onClick: () => openUtilityWindow('studio-map'),
                  title: studioMapUtilityOpen ? 'Restore studio map from Utilities' : 'Open studio map in Utilities',
                  'aria-label': 'Open studio map',
                }, 'Map'),
              ),
              h('div', { className: 'muted' }, `Map stays tucked into Utilities. Active layer: ${activeGraphLabel}. World domain: ${rsgState.worldDomain}.`),
            ),
          ),
        ),
      ),
    ),
    renderSpatialNotebookSectionWithBoundary(renderUtilityDock, { boundaryId: 'utility-dock', title: 'Utility dock unavailable' }),
    renderSpatialNotebookSectionWithBoundary(renderDeskPropertiesPanel, { boundaryId: 'qa-panels', title: 'QA panels unavailable' }),
    renderSpatialNotebookSectionWithBoundary(renderUtilityWindows, { boundaryId: 'utility-windows', title: 'Utility windows unavailable' }),
    preview && h('div', { className: 'modal' },
      h('div', { className: 'modal-content card' },
        h('div', { className: 'card-title' }, 'ACE Suggestion Preview'),
        h('pre', { className: 'doc' }, Array.isArray(preview.summary) ? preview.summary.join('\n') : String(preview.summary || '')),
        h('div', { className: 'button-row' },
          h('button', { type: 'button', onClick: approvePreview }, 'Accept Preview'),
          h('button', { type: 'button', onClick: () => setPreview(null) }, 'Dismiss'),
        ),
      ),
    ),
  );

  return renderSpatialNotebookSectionWithBoundary(renderMainPanel, { boundaryId: 'main-panel', title: 'Main panel unavailable' });
}

function SpatialNotebookBootstrap() {
  const [bootState, setBootState] = useState(() => {
    const safeMode = readSpatialSafeModeSession();
    const reason = readSpatialSafeModeReasonSession();
    const health = safeMode
      ? {
          ...EMPTY_SERVER_HEALTH,
          ok: false,
          safeMode: true,
          bootHealth: {
            ...EMPTY_BOOT_HEALTH,
            checked: true,
            ok: false,
            safeMode: true,
            reason,
          },
        }
      : null;
    return {
      checked: safeMode,
      safeMode,
      reason,
      health,
    };
  });

  useEffect(() => {
    if (bootState.checked && bootState.safeMode) return undefined;
    let cancelled = false;
    const runBootCheck = async () => {
      try {
        const response = await fetch('/api/health');
        const payload = response.ok ? await response.json() : null;
        const health = evaluateSpatialBootHealthSnapshot(payload);
        if (cancelled) return;
        writeSpatialSafeModeSession(health.safeMode, health.reason);
        setBootState({
          checked: true,
          safeMode: health.safeMode,
          reason: health.reason,
          health: health.health,
        });
      } catch (error) {
        if (cancelled) return;
        const reason = String(error.message || error);
        const health = {
          ...EMPTY_SERVER_HEALTH,
          ok: false,
          safeMode: true,
          bootHealth: {
            ...EMPTY_BOOT_HEALTH,
            checked: true,
            ok: false,
            safeMode: true,
            reason,
          },
        };
        writeSpatialSafeModeSession(true, reason);
        setBootState({
          checked: true,
          safeMode: true,
          reason,
          health,
        });
      }
    };
    runBootCheck();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!bootState.checked) {
    return h('section', { className: 'spatial-main ace-shell spatial-boot-shell', 'data-qa': 'spatial-boot-shell' },
      h('div', { className: 'signal-empty muted' },
        h('div', { className: 'inspector-label' }, 'SpatialNotebook boot check'),
        h('div', { className: 'signal-summary' }, 'Checking notebook state shape before mounting the full shell.'),
        h('div', { className: 'signal-meta muted' }, 'This keeps boot-time failures from taking down the UI.'),
      ),
    );
  }

  if (bootState.safeMode) {
    return buildSpatialSafeModeShell({
      health: bootState.health || EMPTY_SERVER_HEALTH,
      reason: bootState.reason,
      onReturnNormalMode: () => {
        writeSpatialSafeModeSession(false);
        window.location.reload();
      },
    });
  }

  return h(SpatialNotebook, { initialServerHealth: bootState.health || EMPTY_SERVER_HEALTH });
}

function drawArrowHead(ctx, fromX, fromY, toX, toY, color) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const size = 10;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - size * Math.cos(angle - Math.PI / 6), toY - size * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(toX - size * Math.cos(angle + Math.PI / 6), toY - size * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function drawRelationshipStrand(ctx, source, target, viewport, visual, color, offset = 0, dashArray = []) {
  const angle = Math.atan2(target.y - source.y, target.x - source.x);
  const normalX = -Math.sin(angle);
  const normalY = Math.cos(angle);
  const offsetX = normalX * offset * viewport.zoom;
  const offsetY = normalY * offset * viewport.zoom;
  const x1 = source.x * viewport.zoom + viewport.x + offsetX;
  const y1 = source.y * viewport.zoom + viewport.y + offsetY;
  const x2 = target.x * viewport.zoom + viewport.x + offsetX;
  const y2 = target.y * viewport.zoom + viewport.y + offsetY;
  const bend = 90 * viewport.zoom;
  const horizontal = Math.abs(target.x - source.x) >= Math.abs(target.y - source.y);
  const cp1x = horizontal ? x1 + (target.x >= source.x ? bend : -bend) : x1;
  const cp1y = horizontal ? y1 : y1 + (target.y >= source.y ? bend : -bend);
  const cp2x = horizontal ? x2 - (target.x >= source.x ? bend : -bend) : x2;
  const cp2y = horizontal ? y2 : y2 - (target.y >= source.y ? bend : -bend);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = visual.opacity;
  ctx.lineWidth = Math.max(1.4, visual.strokeWidth - Math.abs(offset) * 0.18);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (dashArray.length) ctx.setLineDash(dashArray);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
  ctx.stroke();
  ctx.restore();
  return { x1, y1, x2, y2 };
}

function drawRelationshipEdge(ctx, source, target, viewport, visual, color, dashArray = []) {
  const strandOffsets = visual.visualForm === 'woven-rope'
    ? [-4, 0, 4]
    : (visual.visualForm === 'bundle' ? [-2.5, 2.5] : [0]);
  let center = null;
  strandOffsets.forEach((offset, index) => {
    const strandColor = index === 0 || visual.visualForm === 'string'
      ? color
      : 'rgba(255,255,255,0.18)';
    const strand = drawRelationshipStrand(ctx, source, target, viewport, visual, strandColor, offset, dashArray);
    if (offset === 0) center = strand;
  });
  const finalCenter = center || drawRelationshipStrand(ctx, source, target, viewport, visual, color, 0, []) || {
    x1: source.x * viewport.zoom + viewport.x,
    y1: source.y * viewport.zoom + viewport.y,
    x2: target.x * viewport.zoom + viewport.x,
    y2: target.y * viewport.zoom + viewport.y,
  };
  drawArrowHead(ctx, finalCenter.x1, finalCenter.y1, finalCenter.x2, finalCenter.y2, color);
}

function drawCanvasScene(canvas, graph, viewport, activeGraphLayer, worldViewMode, recentWorldChange, showRecentWorldChanges, connecting, pointerWorld, simIndex, sketches, annotations, selectedSketchId, selectedAnnotationId, selectedRelationshipId, selectedDeskId = '', selectedDeskLabel = '') {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = rect.width || canvas.clientWidth || canvas.width;
  const height = rect.height || canvas.clientHeight || canvas.height;
  const scaledWidth = Math.max(1, Math.round(width * dpr));
  const scaledHeight = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
    canvas.width = scaledWidth;
    canvas.height = scaledHeight;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#08111d';
  ctx.fillRect(0, 0, width, height);

  if (activeGraphLayer === 'world') {
    drawWorldScaffolds(ctx, graph, viewport, {
      viewMode: worldViewMode,
      recentChange: recentWorldChange,
      showRecentChanges: showRecentWorldChanges,
      selectedDeskId,
      selectedDeskLabel,
    });
  }

  ctx.strokeStyle = 'rgba(173, 204, 235, 0.08)';
  for (let x = viewport.x % 48; x < width; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = viewport.y % 48; y < height; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  sketches.forEach((stroke) => {
    if (!Array.isArray(stroke.path) || stroke.path.length < 2) return;
    ctx.strokeStyle = stroke.id === selectedSketchId ? 'rgba(255, 211, 110, 0.95)' : 'rgba(111, 177, 255, 0.72)';
    ctx.lineWidth = stroke.id === selectedSketchId ? 3 : 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    stroke.path.forEach((point, index) => {
      const x = point.x * viewport.zoom + viewport.x;
      const y = point.y * viewport.zoom + viewport.y;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });

  annotations.forEach((note) => {
    const x = note.position.x * viewport.zoom + viewport.x;
    const y = note.position.y * viewport.zoom + viewport.y;
    const width = 170 * viewport.zoom;
    const height = 90 * viewport.zoom;
    ctx.fillStyle = note.id === selectedAnnotationId ? 'rgba(255, 211, 110, 0.22)' : 'rgba(255, 241, 184, 0.14)';
    ctx.strokeStyle = note.id === selectedAnnotationId ? 'rgba(255, 211, 110, 0.9)' : 'rgba(255, 241, 184, 0.46)';
    ctx.lineWidth = 1.2;
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);
  });

  graph.edges.forEach((edge, index) => {
    const source = graph.nodes.find((node) => node.id === edge.source);
    const target = graph.nodes.find((node) => node.id === edge.target);
    if (!source || !target) return;
    const visual = deriveRelationshipVisual(edge);
    const recentEdgeChange = activeGraphLayer === 'world' && showRecentWorldChanges
      ? resolveRecentWorldEdgeChange(recentWorldChange, edge)
      : null;
    const color = simIndex === index
      ? '#5ce29f'
      : (recentEdgeChange
          ? (recentEdgeChange.changeType === 'added' ? 'rgba(155, 247, 199, 0.96)' : 'rgba(255, 224, 156, 0.96)')
          : 'rgba(143, 167, 255, 0.9)');
    const sourcePoint = {
      x: source.position.x + NODE_LAYOUT.outputAnchorX,
      y: source.position.y + NODE_LAYOUT.anchorY,
    };
    const targetPoint = {
      x: target.position.x + NODE_LAYOUT.inputAnchorX,
      y: target.position.y + NODE_LAYOUT.anchorY,
    };
    const dashArray = recentEdgeChange ? [10, 6] : visual.dashArray;
    const isSelectedRelationship = edge.id === selectedRelationshipId;
    const relationshipVisual = isSelectedRelationship
      ? { ...visual, strokeWidth: visual.strokeWidth + 1.4, opacity: 1 }
      : visual;
    drawRelationshipEdge(ctx, sourcePoint, targetPoint, viewport, relationshipVisual, isSelectedRelationship ? '#ffd36e' : color, dashArray);
  });

  if (connecting?.source && pointerWorld) {
    const source = graph.nodes.find((node) => node.id === connecting.source);
    if (!source) return;
    const x1 = source.position.x * viewport.zoom + viewport.x + NODE_LAYOUT.outputAnchorX * viewport.zoom;
    const y1 = source.position.y * viewport.zoom + viewport.y + NODE_LAYOUT.anchorY * viewport.zoom;
    const x2 = pointerWorld.x * viewport.zoom + viewport.x;
    const y2 = pointerWorld.y * viewport.zoom + viewport.y;
    ctx.strokeStyle = '#ffd36e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(x1 + 80, y1, x2 - 80, y2, x2, y2);
    ctx.stroke();
    drawArrowHead(ctx, x1, y1, x2, y2, '#ffd36e');
  }
}

ReactDOM.createRoot(document.getElementById('spatial-root')).render(h(SpatialNotebookBootstrap));














