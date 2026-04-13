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
import {
  buildCanonicalIntentContract,
} from './intentContract.browser.js';
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
  buildGhostProjectionRegistryPayload,
  createEmptyGhostProjectionRegistry,
  getCurrentGhostProjection,
  summarizeGhostProjection,
} from './ghostProjection.js';
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
  normalizeDeskProvenance,
} from './deskProvenance.js';
import {
  decorateQaReadableSections,
} from './qaReadableSections.js';
import {
  buildTruthKernelNodeInspectorModel,
  buildTruthKernelRenderModel,
  buildTruthKernelProvenancePresentation,
  summarizeTruthKernelPositionOrigin,
  summarizeTruthKernelSpread,
  summarizeTruthKernelRenderStatus,
} from './truthKernelAdapter.js';
export { buildTruthKernelNodeInspectorModel, summarizeTruthKernelPositionOrigin, summarizeTruthKernelSpread };
import {
  buildStudioQuickAccessStrip,
} from './studioQuickAccess.js';
import {
  buildResourceSignalModel,
  listDepartmentsByPriority,
} from './resourceSignalModel.js';
import {
  EMPTY_TRUTH_KERNEL,
  normalizeTruthKernelPayload,
} from './truthKernelAdapter.js';
import {
  buildTruthKernelLayout,
} from './truthKernelLayout.js';
import {
  buildSketchNodeAnchorMap,
} from './spatialSeamContract.js';
import {
  drawTruthKernelScene,
  hitTestTruthKernelNode,
} from './truthKernelView.js';

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
  registry: {
    currentIntentId: null,
    latestIntentId: null,
    byId: {},
    records: [],
  },
  currentIntentId: null,
  summary: '',
  status: 'idle',
};
const EMPTY_GHOST_PROJECTION_REGISTRY = createEmptyGhostProjectionRegistry();
const CANVAS_BACKGROUND_SOLID = '#08111d';
const CANVAS_BACKGROUND_TRUTH_VISIBLE = 'rgba(8, 17, 29, 0.72)';
const TRUTH_KERNEL_LOAD_STATES = Object.freeze({
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
});

export function normalizeSketchPath(path = []) {
  return (Array.isArray(path) ? path : [])
    .map((point) => ({
      x: Number(point?.x),
      y: Number(point?.y),
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

export function latestKnownTimestamp(...values) {
  const candidates = values.flat ? values.flat() : values;
  let latestNumeric = null;
  let latestValue = null;
  for (const candidate of candidates) {
    const normalized = normalizeRenderText(candidate, '');
    if (!normalized) continue;
    const parsed = Date.parse(normalized);
    if (Number.isFinite(parsed)) {
      if (latestNumeric === null || parsed > latestNumeric) {
        latestNumeric = parsed;
        latestValue = new Date(parsed).toISOString();
      }
      continue;
    }
    if (!latestValue) latestValue = normalized;
  }
  return latestValue;
}

export function boundsToSketchPath(bounds = null) {
  if (!bounds || typeof bounds !== 'object') return [];
  const left = Number(bounds.left ?? bounds.x ?? bounds.minX);
  const top = Number(bounds.top ?? bounds.y ?? bounds.minY);
  const width = Number(bounds.width);
  const height = Number(bounds.height);
  if (![left, top, width, height].every(Number.isFinite)) return [];
  return decorateQaReadableSections([
    { x: left, y: top },
    { x: left + width, y: top },
    { x: left + width, y: top + height },
    { x: left, y: top + height },
    { x: left, y: top },
  ], {
    provenanceLabel: 'Derived',
    canonicalTruthSections,
  });
}

export function intentRecordToSketch(record = null) {
  if (!record || typeof record !== 'object') return null;
  const geometry = record.geometry && typeof record.geometry === 'object' ? record.geometry : {};
  const path = normalizeSketchPath(geometry.stroke).length
    ? normalizeSketchPath(geometry.stroke)
    : normalizeSketchPath(geometry.path).length
      ? normalizeSketchPath(geometry.path)
      : normalizeSketchPath(geometry.region?.points).length
        ? normalizeSketchPath(geometry.region?.points)
        : boundsToSketchPath(geometry.region?.bounds || geometry.bounds || null);
  if (!path.length) return null;
  return {
    id: String(record.id || record.intentId || '').trim() || null,
    path,
    metadata: {
      intentId: String(record.id || record.intentId || '').trim() || null,
      intentStatus: record.status || 'canonical',
      meaning: record.semanticMeaning?.summary || record.semanticMeaning?.statement || record.semanticMeaning?.goal || record.summary || null,
      sourceType: record.source?.type || record.sourceType || null,
    },
  };
}

export function intentRegistryToSketches(intentState = EMPTY_INTENT_STATE) {
  const registry = intentState?.registry || null;
  const records = Array.isArray(registry?.records) ? registry.records : [];
  return records.map(intentRecordToSketch).filter(Boolean);
}

export function resolveCanvasBackgroundFill(truthKernelVisible = false) {
  return truthKernelVisible ? CANVAS_BACKGROUND_TRUTH_VISIBLE : CANVAS_BACKGROUND_SOLID;
}

export function formatTruthKernelTimestamp(timestamp = 0) {
  const numeric = Number(timestamp);
  if (!Number.isFinite(numeric) || numeric <= 0) return 'Unknown';
  try {
    return new Date(numeric).toISOString();
  } catch (_error) {
    return 'Unknown';
  }
}

export function resolveTruthKernelToggleState({
  scene = SCENES.CANVAS,
  truthKernel = EMPTY_TRUTH_KERNEL,
  loadState = TRUTH_KERNEL_LOAD_STATES.LOADING,
  visible = false,
} = {}) {
  const nodeCount = Number.isFinite(Number(truthKernel?.nodeCount))
    ? Math.max(0, Number(truthKernel.nodeCount))
    : 0;
  const available = nodeCount > 0;
  const unavailableReason = String(truthKernel?.meta?.reason || truthKernel?.renderStatus?.reason || '').trim() || null;
  let title = 'Truth kernel loading...';
  if (available) {
    title = `${visible ? 'Hide' : 'Show'} truth kernel (${nodeCount} real entities)`;
  } else if (loadState === TRUTH_KERNEL_LOAD_STATES.ERROR) {
    title = unavailableReason ? `Truth kernel unavailable: ${unavailableReason}` : 'Truth kernel unavailable';
  } else if (loadState === TRUTH_KERNEL_LOAD_STATES.READY) {
    title = unavailableReason ? `Truth kernel loaded with 0 entities: ${unavailableReason}` : 'Truth kernel loaded with 0 entities';
  }
  if (scene !== SCENES.CANVAS) {
    title = available
      ? `${title}. Switch to Canvas to view it.`
      : 'Truth kernel is available on Canvas only.';
  }
  return {
    disabled: scene !== SCENES.CANVAS || !available,
    title,
    label: visible ? `Truth On (${nodeCount})` : `Truth (${nodeCount})`,
    nodeCount,
    available,
    loadState,
  };
}

export function resolveTruthInspectionPanelState({
  truthKernelVisible = false,
  compactPreference = false,
} = {}) {
  const compact = !!truthKernelVisible && !!compactPreference;
  return {
    compact,
    railWidth: compact ? 256 : 332,
    showObservabilityCards: !compact,
    toggleLabel: compact ? 'Expand' : 'Compact',
    title: compact ? 'Expand observability details' : 'Compact observability details',
  };
}

export function buildTruthInspectionLegend() {
  return [
    { axis: 'R', meaning: 'Health degradation rises toward red' },
    { axis: 'G', meaning: 'Health integrity rises toward green' },
    { axis: 'B', meaning: 'Activity / live processing rises toward blue glow' },
    { axis: 'A', meaning: 'Decay lowers opacity as nodes go stale or redundant' },
    { axis: 'SAT', meaning: 'Confidence increases vividness and saturation' },
    { axis: 'NOISE', meaning: 'Instability adds subtle flicker and visual noise' },
  ];
}

export function buildSketchCanonicalIntentRecord(stroke = {}, source = {}) {
  const strokePath = normalizeSketchPath(stroke?.path || []);
  const createdAt = String(stroke?.createdAt || source.timestamp || new Date().toISOString()).trim() || new Date().toISOString();
  const sourceRef = String(stroke?.id || source.sourceRef || `sketch_${createdAt}`).trim() || `sketch_${createdAt}`;
  const geometry = {
    kind: 'stroke',
    stroke: strokePath,
    region: null,
  };
  const contract = buildCanonicalIntentContract({
    report: {
      summary: '',
      statement: '',
      goal: '',
      requestType: 'sketchpad_input',
      requestedOutcomes: [],
      tasks: [],
      targets: [],
      constraints: [],
      urgency: 'normal',
      confidence: Number.isFinite(Number(stroke?.metadata?.confidence)) ? Number(stroke.metadata.confidence) : 0,
      geometry,
      source: 'sketchpad-stroke',
      nodeId: sourceRef,
      requestedBy: 'sketchpad',
    },
    packet: {
      summary: '',
      statement: '',
      goal: '',
      requestType: 'sketchpad_input',
      requestedOutcomes: [],
      tasks: [],
      targets: [],
      constraints: [],
      confidence: Number.isFinite(Number(stroke?.metadata?.confidence)) ? Number(stroke.metadata.confidence) : 0,
      geometry,
      sourceType: 'sketchpad-stroke',
      sourceRef,
      requestedBy: 'sketchpad',
      priority: 'normal',
    },
    sourceType: 'sketchpad-stroke',
    sourceRef,
    requestedBy: 'sketchpad',
    priority: 'normal',
    timestamp: createdAt,
    provenance: {
      sourceNodeId: sourceRef,
      inputMode: 'sketchpad',
      sketchMode: true,
      createdAt,
    },
    intentId: source.sourceRef || sourceRef,
  });
  return contract.canonicalIntent;
}

export function removeIntentRegistryRecord(intentState = EMPTY_INTENT_STATE, intentId = null) {
  const recordId = String(intentId || '').trim();
  if (!recordId) return intentState;
  const baseState = intentState && typeof intentState === 'object' ? intentState : EMPTY_INTENT_STATE;
  const registry = baseState.registry && typeof baseState.registry === 'object' ? baseState.registry : EMPTY_INTENT_STATE.registry;
  const nextRecords = (Array.isArray(registry.records) ? registry.records : []).filter((record) => String(record?.id || '').trim() !== recordId);
  const nextById = { ...(registry.byId || {}) };
  delete nextById[recordId];
  const nextCurrentId = registry.currentIntentId === recordId
    ? (nextRecords[0]?.id || null)
    : registry.currentIntentId || nextRecords[0]?.id || null;
  const currentIntent = nextCurrentId ? nextById[nextCurrentId] || nextRecords.find((record) => record.id === nextCurrentId) || null : null;
  return {
    registry: {
      currentIntentId: nextCurrentId,
      latestIntentId: registry.latestIntentId === recordId ? nextCurrentId : (registry.latestIntentId || nextCurrentId || null),
      byId: nextById,
      records: nextRecords,
    },
    currentIntentId: nextCurrentId,
    summary: String(currentIntent?.semanticMeaning?.summary || currentIntent?.statement || currentIntent?.goal || '').trim(),
    status: currentIntent?.status || (nextCurrentId ? 'canonical' : 'idle'),
  };
}

function normalizeIntentRecord(report = {}) {
  const source = report?.spatialIntent && typeof report.spatialIntent === 'object'
    ? report.spatialIntent
    : report?.intentContract?.canonicalIntent && typeof report.intentContract.canonicalIntent === 'object'
      ? report.intentContract.canonicalIntent
      : report?.canonicalIntent && typeof report.canonicalIntent === 'object'
        ? report.canonicalIntent
        : report || {};
  const sourceObject = source.source && typeof source.source === 'object'
    ? source.source
    : {
        type: String(source.sourceType || report?.sourceType || report?.source || 'sanctioned-intent-parser').trim() || 'sanctioned-intent-parser',
        ref: String(source.sourceRef || report?.sourceRef || report?.nodeId || 'unknown').trim() || 'unknown',
        requestedBy: String(source.requestedBy || report?.requestedBy || 'context-manager').trim() || 'context-manager',
      };
  const semanticMeaning = source.semanticMeaning && typeof source.semanticMeaning === 'object'
    ? source.semanticMeaning
    : {
        summary: String(source.summary || report?.summary || '').trim(),
        statement: String(source.statement || report?.statement || report?.summary || '').trim(),
        goal: String(source.goal || report?.goal || report?.summary || '').trim(),
        requestType: String(source.requestType || report?.requestType || 'context_request').trim() || 'context_request',
        requestedOutcomes: Array.isArray(source.requestedOutcomes) ? source.requestedOutcomes : (Array.isArray(report?.requestedOutcomes) ? report.requestedOutcomes : []),
        targets: Array.isArray(source.targets) ? source.targets : (Array.isArray(report?.targets) ? report.targets : []),
        constraints: Array.isArray(source.constraints) ? source.constraints : (Array.isArray(report?.constraints) ? report.constraints : []),
        urgency: String(source.urgency || report?.priority || 'normal').trim() || 'normal',
        labels: Array.isArray(source.labels) ? source.labels : (Array.isArray(report?.classification?.labels) ? report.classification.labels : []),
      };
  const geometry = source.geometry && typeof source.geometry === 'object'
    ? source.geometry
    : {
        kind: String(report?.geometry?.kind || report?.geometry?.type || 'unknown').trim().toLowerCase() || 'unknown',
        region: report?.geometry?.region || report?.geometry?.bounds || null,
        stroke: report?.geometry?.stroke || report?.geometry?.path || null,
      };
  const createdAt = String(source.createdAt || report?.createdAt || report?.timestamp || new Date().toISOString()).trim();
  const id = String(source.id || report?.id || report?.intentId || `intent_${sourceObject.type}_${sourceObject.ref}_${createdAt}`).trim() || `intent_${sourceObject.type}_${sourceObject.ref}_${createdAt}`;
  const confidence = Number.isFinite(Number(source.confidence))
    ? Number(source.confidence)
    : Number.isFinite(Number(report?.confidence))
      ? Number(report.confidence)
      : 0;
  const record = {
    id,
    source: sourceObject,
    geometry: {
      kind: String(geometry.kind || geometry.type || 'unknown').trim().toLowerCase() || 'unknown',
      region: geometry.region || null,
      stroke: geometry.stroke || null,
    },
    semanticMeaning: {
      summary: String(semanticMeaning.summary || semanticMeaning.statement || semanticMeaning.goal || '').trim(),
      statement: String(semanticMeaning.statement || semanticMeaning.goal || semanticMeaning.summary || '').trim(),
      goal: String(semanticMeaning.goal || semanticMeaning.statement || semanticMeaning.summary || '').trim(),
      requestType: String(semanticMeaning.requestType || 'context_request').trim() || 'context_request',
      requestedOutcomes: Array.isArray(semanticMeaning.requestedOutcomes) ? [...new Set(semanticMeaning.requestedOutcomes.filter(Boolean))] : [],
      targets: Array.isArray(semanticMeaning.targets) ? [...new Set(semanticMeaning.targets.filter(Boolean))] : [],
      constraints: Array.isArray(semanticMeaning.constraints) ? [...new Set(semanticMeaning.constraints.filter(Boolean))] : [],
      urgency: String(semanticMeaning.urgency || 'normal').trim() || 'normal',
      labels: Array.isArray(semanticMeaning.labels) ? [...new Set(semanticMeaning.labels.filter(Boolean))] : [],
    },
    confidence: Number(confidence.toFixed(2)),
    createdAt,
    provenance: {
      ...(source.provenance || report?.provenance || {}),
      sourceType: sourceObject.type,
      sourceRef: sourceObject.ref,
      requestedBy: sourceObject.requestedBy,
    },
  };
  const missingFields = [];
  if (!record.geometry || record.geometry.kind === 'unknown') missingFields.push('geometry');
  if (!String(record.semanticMeaning.summary || record.semanticMeaning.statement || record.semanticMeaning.goal || '').trim()) {
    missingFields.push('semanticMeaning');
  }
  if (!Number.isFinite(record.confidence)) missingFields.push('confidence');
  record.missingFields = missingFields;
  record.status = missingFields.length ? 'degraded' : 'canonical';
  record.intentId = record.id;
  record.sourceType = record.source.type;
  record.sourceRef = record.source.ref;
  record.nodeId = String(source.provenance?.sourceNodeId || report?.nodeId || record.source.ref || '').trim() || null;
  record.sourceNodeId = record.nodeId;
  record.agentRunId = String(source.provenance?.runId || report?.provenance?.runId || '').trim() || null;
  record.reason = String(source.reason || report?.extractedIntent?.reason || report?.reason || '').trim() || null;
  record.requestedBy = record.source.requestedBy;
  record.timestamp = record.createdAt;
  record.priority = record.semanticMeaning.urgency;
  record.summary = record.semanticMeaning.summary;
  record.statement = record.semanticMeaning.statement;
  record.goal = record.semanticMeaning.goal;
  record.requestType = record.semanticMeaning.requestType;
  record.requestedOutcomes = record.semanticMeaning.requestedOutcomes;
  record.tasks = record.semanticMeaning.requestedOutcomes;
  record.targets = record.semanticMeaning.targets;
  record.constraints = record.semanticMeaning.constraints;
  record.projectContext = {
    currentFocus: record.nodeId || record.source.ref || null,
    matchedTerms: record.semanticMeaning.labels,
    blockers: record.semanticMeaning.constraints,
    anchorRefs: Array.isArray(record.provenance?.anchorRefs) ? record.provenance.anchorRefs : [],
  };
  return record;
}

function getCurrentIntentRecord(intentState = EMPTY_INTENT_STATE) {
  const registry = intentState?.registry || null;
  if (!registry?.currentIntentId) return null;
  return registry.byId?.[registry.currentIntentId] || null;
}

function upsertIntentRegistry(intentState = EMPTY_INTENT_STATE, report = null) {
  const baseState = intentState && typeof intentState === 'object' ? intentState : EMPTY_INTENT_STATE;
  const registry = baseState.registry && typeof baseState.registry === 'object' ? baseState.registry : EMPTY_INTENT_STATE.registry;
  const nextRegistry = {
    currentIntentId: registry.currentIntentId || baseState.currentIntentId || null,
    latestIntentId: registry.latestIntentId || registry.currentIntentId || baseState.currentIntentId || null,
    byId: { ...(registry.byId || {}) },
    records: Array.isArray(registry.records) ? [...registry.records] : [],
  };
  if (report) {
    const record = normalizeIntentRecord(report);
    if (record?.id) {
      nextRegistry.byId[record.id] = record;
      nextRegistry.records = [record, ...nextRegistry.records.filter((entry) => entry.id !== record.id)];
      nextRegistry.currentIntentId = record.id;
      nextRegistry.latestIntentId = record.id;
    }
  }
  const currentIntent = nextRegistry.currentIntentId ? nextRegistry.byId[nextRegistry.currentIntentId] || null : null;
  return {
    registry: nextRegistry,
    currentIntentId: nextRegistry.currentIntentId,
    summary: String(currentIntent?.semanticMeaning?.summary || currentIntent?.statement || currentIntent?.goal || baseState.summary || '').trim(),
    status: currentIntent?.status || baseState.status || 'idle',
  };
}

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
const UTILITY_WINDOW_ORDER = ['executive-advisory', 'cto-chat', 'environment', 'qa', 'context', 'reports', 'relationship', 'roster', 'studio-map', 'scorecards'];
const UTILITY_WINDOW_META = {
  'executive-advisory': { title: 'Chief of Staff', deskId: 'cto-chief-of-staff', chromeLabel: 'Executive Advisory' },
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

const CHIEF_OF_STAFF_QUICK_PROMPTS = Object.freeze([
  'What should we do next?',
  'Why is planning blocked?',
  'What is the highest-leverage slice?',
  'Is CTO ready to act on this?',
  'What is the biggest blocker right now?',
]);

export function buildChiefOfStaffQuickPrompts() {
  return [...CHIEF_OF_STAFF_QUICK_PROMPTS];
}

function normalizeChiefOfStaffText(value = '', fallback = '') {
  return typeof value === 'string' ? value.trim() || fallback : fallback;
}

function normalizeChiefOfStaffNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeChiefOfStaffRecommendation(recommendation = null) {
  const source = recommendation && typeof recommendation === 'object' && !Array.isArray(recommendation) ? recommendation : {};
  const confidence = normalizeChiefOfStaffNumber(source.confidence, 0);
  return {
    id: normalizeChiefOfStaffText(source.id, null),
    title: normalizeChiefOfStaffText(source.title, 'No recommendation available'),
    category: normalizeChiefOfStaffText(source.category, 'info'),
    priority: normalizeChiefOfStaffText(source.priority, 'normal'),
    blocker: normalizeChiefOfStaffText(source.blocker, null),
    stage: normalizeChiefOfStaffText(source.stage, null),
    why_now: normalizeChiefOfStaffText(source.why_now, ''),
    recommendation_text: normalizeChiefOfStaffText(source.recommendation_text, ''),
    execution_ready: Boolean(source.execution_ready),
    confidence,
    confidence_percent: Math.max(0, Math.min(100, Math.round(confidence * 100))),
  };
}

function normalizeChiefOfStaffPosture(posture = null) {
  const source = posture && typeof posture === 'object' && !Array.isArray(posture) ? posture : {};
  const blocker = source.blocker && typeof source.blocker === 'object' && !Array.isArray(source.blocker)
    ? {
        failure_key: normalizeChiefOfStaffText(source.blocker.failure_key, null),
        stage: normalizeChiefOfStaffText(source.blocker.stage, null),
        count: normalizeChiefOfStaffNumber(source.blocker.count, 0) || 0,
      }
    : null;
  return {
    blocked: Boolean(source.blocked),
    blocker,
    canonical_available: Boolean(source.canonical_available),
    canonical_summary: source.canonical_summary && typeof source.canonical_summary === 'object' && !Array.isArray(source.canonical_summary)
      ? source.canonical_summary
      : null,
    system_confidence: normalizeChiefOfStaffNumber(source.system_confidence, null),
  };
}

export function normalizeChiefOfStaffAdvisoryPayload(payload = null) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const recommendation = normalizeChiefOfStaffRecommendation(source.recommendation);
  const posture = normalizeChiefOfStaffPosture(source.posture);
  const replySource = normalizeChiefOfStaffText(source.reply_source, source.reply_text ? 'deterministic_fallback' : null);
  const modelStatus = normalizeChiefOfStaffText(source.model_status, replySource === 'model_live' ? 'ok' : 'fallback');
  const blocker = recommendation.blocker || posture.blocker?.failure_key || null;
  const degraded = ['timeout', 'unavailable', 'fallback'].includes(modelStatus) || replySource === 'deterministic_fallback';
  const contradictionDetected = Boolean(source.contradiction_detected);
  const tone = contradictionDetected || degraded
    ? 'blocked'
    : recommendation.execution_ready && !blocker
      ? 'processing'
      : blocker || source.execution_ready === false || recommendation.execution_ready === false
        ? 'review'
        : 'idle';
  const readinessLabel = recommendation.execution_ready
    ? 'Ready for CTO'
    : blocker
      ? 'Not ready for CTO'
      : 'Advisory only';
  const bridgeDetail = recommendation.execution_ready
    ? 'CTO may review matching canonical actions, but the Chief of Staff still does not execute.'
    : blocker
      ? `Blocked by ${blocker}${recommendation.stage ? ` at ${recommendation.stage}` : ''}.`
      : 'Execution preconditions are not satisfied yet.';
  return {
    advisory_available: Boolean(source.reply_text || source.recommendation || source.posture || source.advisory_available),
    reply_text: normalizeChiefOfStaffText(source.reply_text, 'Executive advisory is waiting for a fresh query.'),
    reply_source: replySource,
    model_status: modelStatus,
    model_backend: normalizeChiefOfStaffText(source.model_backend, replySource ? 'ollama_http' : null),
    model_name: normalizeChiefOfStaffText(source.model_name, replySource ? 'qwen2.5-coder:1.5b' : null),
    advisory_generated_at: normalizeChiefOfStaffText(source.advisory_generated_at, null),
    execution_ready: Object.prototype.hasOwnProperty.call(source, 'execution_ready')
      ? Boolean(source.execution_ready)
      : recommendation.execution_ready,
    recommendation,
    posture,
    blocker,
    fallback_used: replySource === 'deterministic_fallback',
    tone,
    readiness_label: readinessLabel,
    bridge_detail: bridgeDetail,
    why_now: recommendation.why_now || recommendation.recommendation_text || (blocker ? 'System execution is currently blocked.' : 'No immediate blocker was elevated.'),
  };
}

export function buildChiefOfStaffDeskPresentation(payload = null) {
  const advisory = normalizeChiefOfStaffAdvisoryPayload(payload);
  const focusSummary = advisory.recommendation.title || 'Executive advisory ready';
  const throughputLabel = [
    advisory.recommendation.category || 'info',
    `${advisory.recommendation.confidence_percent}% confidence`,
    advisory.execution_ready ? 'ready' : 'hold',
  ].filter(Boolean).join(' | ');
  const latestSignal = [
    advisory.reply_source || 'pending',
    advisory.blocker ? `blocker ${advisory.blocker}` : 'no blocker elevated',
  ].join(' | ');
  return {
    focusSummary,
    throughputLabel,
    latestSignal,
    statusTone: advisory.tone,
    statusBadge: advisory.execution_ready
      ? 'Ready'
      : advisory.tone === 'blocked'
        ? 'Degraded'
        : advisory.blocker
          ? 'Blocked'
          : 'Advisory',
  };
}

export function buildChiefOfStaffAdvisoryViewModel({ payload = null, history = [] } = {}) {
  const advisory = normalizeChiefOfStaffAdvisoryPayload(payload);
  const entries = Array.isArray(history) && history.length
    ? history
    : advisory.advisory_available
      ? [{
          id: 'chief-latest-reply',
          role: 'assistant',
          text: advisory.reply_text,
          reply_source: advisory.reply_source,
          model_status: advisory.model_status,
          advisory_generated_at: advisory.advisory_generated_at,
          blocker: advisory.blocker,
        }]
      : [];
  return {
    panelTitle: 'Executive Advisory',
    panelKind: 'executive-advisory',
    renderMode: 'dedicated-panel',
    deskLabel: 'Chief of Staff',
    roleLabel: 'Advisory',
    relationshipLabel: 'Advises CTO Architect',
    replySource: advisory.reply_source,
    modelStatus: advisory.model_status,
    modelBackend: advisory.model_backend,
    modelName: advisory.model_name,
    generatedAt: advisory.advisory_generated_at,
    replyText: advisory.reply_text,
    recommendation: advisory.recommendation,
    posture: advisory.posture,
    blocker: advisory.blocker,
    executionReady: advisory.execution_ready,
    readinessLabel: advisory.readiness_label,
    bridgeDetail: advisory.bridge_detail,
    whyNow: advisory.why_now,
    entries,
    quickPrompts: buildChiefOfStaffQuickPrompts(),
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

function normalizeQaEvidenceProvenance(trace = null) {
  const source = normalizeRenderObject(trace);
  const sourcePath = normalizeRenderText(source.sourcePath || source.source_route || source.route || source.routePath, '') || null;
  const classification = normalizeRenderText(source.classification || source.sourceClass || source.kind, '') || null;
  const freshnessClass = normalizeRenderText(source.freshnessClass || source.freshness, '') || null;
  const generatedAt = normalizeRenderText(source.generatedAt || source.updatedAt || source.observedAt || source.createdAt || source.lastUpdatedAt, '') || null;
  const observedAt = normalizeRenderText(source.observedAt || source.updatedAt || source.generatedAt || source.createdAt || source.lastUpdatedAt, '') || null;
  const fallbackUsed = typeof source.fallbackUsed === 'boolean'
    ? source.fallbackUsed
    : (typeof source.usedFallback === 'boolean' ? source.usedFallback : null);
  const chips = [];
  if (sourcePath) chips.push({ label: 'Source', value: sourcePath, tone: 'neutral' });
  if (classification) {
    chips.push({
      label: 'Class',
      value: classification,
      tone: ['live', 'live_canonical', 'projection', 'canonical'].includes(classification)
        ? 'good'
        : (['derived_current', 'derived', 'fallback'].includes(classification) ? 'warn' : 'neutral'),
    });
  }
  if (freshnessClass) {
    chips.push({
      label: 'Freshness',
      value: freshnessClass.replace(/_/g, ' '),
      tone: freshnessClass === 'stale' ? 'warn' : (freshnessClass === 'missing' ? 'bad' : 'good'),
    });
  }
  if (generatedAt) chips.push({ label: 'Generated', value: generatedAt, tone: 'neutral' });
  if (observedAt && observedAt !== generatedAt) chips.push({ label: 'Observed', value: observedAt, tone: 'neutral' });
  if (fallbackUsed !== null) chips.push({ label: 'Fallback', value: fallbackUsed ? 'yes' : 'no', tone: fallbackUsed ? 'warn' : 'good' });
  return {
    sourcePath,
    classification,
    freshnessClass,
    generatedAt,
    observedAt,
    fallbackUsed,
    chips,
    hasProvenance: chips.length > 0,
  };
}

function buildQaEvidenceProvenance(trace = null, { fallbackLabel = '' } = {}) {
  const provenance = normalizeQaEvidenceProvenance(trace);
  const chips = Array.isArray(provenance?.chips) ? provenance.chips.slice(0, 6) : [];
  return {
    ...provenance,
    chips,
    hasRenderableProvenance: Boolean(provenance?.hasProvenance) && chips.length > 0,
    fallbackLabel: provenance?.hasProvenance ? '' : normalizeRenderText(fallbackLabel, ''),
  };
}

function normalizeQAEvidenceTracePayload(trace = {}) {
  const source = normalizeRenderObject(trace);
  return {
    kind: normalizeRenderText(source.kind, '') || null,
    label: normalizeRenderText(source.label, '') || null,
    detail: normalizeRenderText(source.detail, '') || null,
    sourcePath: normalizeRenderText(source.sourcePath, '') || null,
    sourceClass: normalizeRenderText(source.sourceClass, '') || null,
    freshnessClass: normalizeRenderText(source.freshnessClass, '') || null,
    observedAt: normalizeRenderText(source.observedAt, '') || null,
    derivedFrom: normalizeRenderText(source.derivedFrom, '') || null,
    ageMs: Number.isFinite(Number(source.ageMs)) ? Number(source.ageMs) : null,
    generatedBy: source.generatedBy && typeof source.generatedBy === 'object'
      ? {
          system: normalizeRenderText(source.generatedBy.system || source.generatedBy.source || source.generatedBy.kind, '') || null,
          module: normalizeRenderText(source.generatedBy.module || source.generatedBy.moduleName, '') || null,
          label: normalizeRenderText(source.generatedBy.label, '') || null,
        }
      : null,
    sourceArtifacts: normalizeRenderList(source.sourceArtifacts).map((artifact) => {
      const artifactSource = normalizeRenderObject(artifact);
      return {
        path: normalizeRenderText(artifactSource.path || artifactSource.sourcePath, '') || null,
        label: normalizeRenderText(artifactSource.label, '') || normalizeRenderText(artifactSource.path || artifactSource.sourcePath, '') || null,
        kind: normalizeRenderText(artifactSource.kind, '') || 'artifact',
        freshnessClass: normalizeRenderText(artifactSource.freshnessClass, '') || null,
        observedAt: normalizeRenderText(artifactSource.observedAt, '') || null,
        derivedFrom: normalizeRenderText(artifactSource.derivedFrom, '') || null,
      };
    }),
  };
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
    sourceTrace: normalizeQAEvidenceTracePayload(source.sourceTrace),
  };
}

export function normalizeQAReportPayload(report = {}) {
  const source = normalizeRenderObject(report);
  return {
    status: normalizeRenderText(source.status) || 'idle',
    summary: normalizeRenderText(source.summary),
    desks: normalizeRenderList(source.desks),
    failures: normalizeRenderList(source.failures).map((failure) => normalizeRenderObject(failure)),
    sourceTrace: normalizeQAEvidenceTracePayload(source.sourceTrace),
  };
}

function normalizeQAUnitGatePayload(unitGate = {}) {
  const source = normalizeRenderObject(unitGate);
  return {
    status: normalizeRenderText(source.status, 'pending'),
    passedCount: Number(source.passedCount ?? 0) || 0,
    totalChecks: Number(source.totalChecks ?? 0) || 0,
    failures: normalizeRenderList(source.failures).map((failure) => normalizeRenderObject(failure)),
    sourceTrace: normalizeQAEvidenceTracePayload(source.sourceTrace),
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
    sourceTrace: normalizeQAEvidenceTracePayload(source.sourceTrace),
  };
}

function normalizeQALocalGatePayload(localGate = {}) {
  const source = normalizeRenderObject(localGate);
  const unit = source.unit ? normalizeQAUnitGatePayload(source.unit) : null;
  const studioBoot = source.studioBoot ? normalizeQABootGatePayload(source.studioBoot) : null;
  const evidenceSources = normalizeRenderList(source.evidenceSources).map((entry) => normalizeQAEvidenceTracePayload(entry));
  return unit || studioBoot || evidenceSources.length
    ? {
        unit,
        studioBoot,
        evidenceSources,
        evidenceSummary: normalizeRenderObject(source.evidenceSummary),
      }
      : null;
}

function localGateOutputCount(localGate = null) {
  if (!localGate || typeof localGate !== 'object') return 0;
  let count = 0;
  if (localGate.unit) count += 1;
  if (localGate.studioBoot) count += 1;
  return count;
}

function normalizeQATestRegistryEntry(entry = {}) {
  const source = normalizeRenderObject(entry);
  const owner = normalizeRenderObject(source.owner);
  const qaSource = normalizeRenderObject(source.source);
  const runtimeTest = normalizeRenderObject(source.runtimeTest);
  return {
    ...source,
    id: normalizeRenderText(source.id, '') || null,
    deskId: normalizeRenderText(source.deskId, '') || owner.id || null,
    deskLabel: normalizeRenderText(source.deskLabel, '') || owner.label || 'Unknown desk',
    testId: normalizeRenderText(source.testId, '') || null,
    testName: normalizeRenderText(source.testName, '') || 'Unnamed QA test',
    owner: owner.kind || owner.id || owner.label || qaSource.modulePath
      ? {
          ...owner,
          kind: normalizeRenderText(owner.kind, '') || (owner.id ? 'desk' : 'unknown'),
          id: normalizeRenderText(owner.id, '') || null,
          label: normalizeRenderText(owner.label, '') || 'Unknown owner',
          module: normalizeRenderText(owner.module, '') || null,
        }
      : null,
    source: qaSource.modulePath || qaSource.runtimePath || qaSource.kind
      ? {
          ...qaSource,
          kind: normalizeRenderText(qaSource.kind, '') || 'module',
          modulePath: normalizeRenderText(qaSource.modulePath, '') || null,
          runtimePath: normalizeRenderText(qaSource.runtimePath, '') || null,
          runtimeTestPath: normalizeRenderText(qaSource.runtimeTestPath, '') || null,
        }
      : null,
    currentStatus: normalizeRenderText(source.currentStatus, '') || 'missing',
    lastExecutionAt: normalizeRenderText(source.lastExecutionAt, '') || null,
    runtimeReason: normalizeRenderText(source.runtimeReason, '') || null,
    validityClass: normalizeRenderText(source.validityClass, '') || 'stale_target',
    validityReason: normalizeRenderText(source.validityReason, '') || '',
    deprecated: Boolean(source.deprecated),
    runtimeTest: runtimeTest.status || runtimeTest.reason || runtimeTest.qualityCard
      ? {
          ...runtimeTest,
          status: normalizeRenderText(runtimeTest.status, '') || 'missing',
          reason: normalizeRenderText(runtimeTest.reason, '') || null,
        }
      : null,
    reportFinishedAt: normalizeRenderText(source.reportFinishedAt, '') || null,
  };
}

function normalizeQATestRegistryPayload(testRegistry = null) {
  const source = normalizeRenderObject(testRegistry);
  const entries = normalizeRenderList(source.entries).map((entry) => normalizeQATestRegistryEntry(entry));
  const summary = normalizeRenderObject(source.summary);
  return entries.length || Object.keys(summary).length
    ? {
        ...source,
        schema: normalizeRenderText(source.schema, '') || 'qa.test-registry.v1',
        generatedAt: normalizeRenderText(source.generatedAt, '') || null,
        reportFinishedAt: normalizeRenderText(source.reportFinishedAt, '') || null,
        entries,
        summary,
      }
    : null;
}

function normalizeQAAuditArtifactPayload(artifact = {}) {
  const source = normalizeRenderObject(artifact);
  return {
    path: normalizeRenderText(source.path || source.sourcePath, '') || null,
    label: normalizeRenderText(source.label, '') || normalizeRenderText(source.path || source.sourcePath, '') || 'Artifact',
    kind: normalizeRenderText(source.kind, '') || 'artifact',
    freshnessClass: normalizeRenderText(source.freshnessClass, '') || null,
    observedAt: normalizeRenderText(source.observedAt, '') || null,
    derivedFrom: normalizeRenderText(source.derivedFrom, '') || null,
  };
}

function normalizeQAAuditEntryPayload(entry = {}) {
  const source = normalizeRenderObject(entry);
  return {
    ...source,
    kind: normalizeRenderText(source.kind, '') || 'qa-output',
    label: normalizeRenderText(source.label, '') || 'QA output',
    status: normalizeRenderText(source.status, '') || 'ok',
    freshnessClass: normalizeRenderText(source.freshnessClass, '') || 'missing',
    generatedAt: normalizeRenderText(source.generatedAt, '') || null,
    generator: source.generator && typeof source.generator === 'object'
      ? {
          system: normalizeRenderText(source.generator.system, '') || null,
          module: normalizeRenderText(source.generator.module, '') || null,
          label: normalizeRenderText(source.generator.label, '') || null,
        }
      : null,
    sourceArtifacts: normalizeRenderList(source.sourceArtifacts).map((artifact) => normalizeQAAuditArtifactPayload(artifact)),
    mismatch: Boolean(source.mismatch),
    mismatchReason: normalizeRenderText(source.mismatchReason, '') || null,
    detail: normalizeRenderText(source.detail, '') || null,
    sourceTrace: normalizeQAEvidenceTracePayload(source.sourceTrace),
  };
}

function normalizeQAAuditTrailPayload(auditTrail = null) {
  const source = normalizeRenderObject(auditTrail);
  const entries = normalizeRenderList(source.entries).map((entry) => normalizeQAAuditEntryPayload(entry));
  const summary = normalizeRenderObject(source.summary);
  return entries.length || Object.keys(summary).length
    ? {
        ...source,
        schema: normalizeRenderText(source.schema, '') || 'qa.audit-trail.v1',
        generatedAt: normalizeRenderText(source.generatedAt, '') || null,
        entries,
        summary,
      }
    : null;
}

function normalizeQAExternalValidationPayload(externalValidation = null) {
  const source = normalizeRenderObject(externalValidation);
  const notes = normalizeRenderList(source.notes).map((note) => normalizeRenderText(note, '')).filter(Boolean);
  return Object.keys(source).length
    ? {
        status: normalizeRenderText(source.status, 'unavailable') || 'unavailable',
        probeStatus: normalizeRenderText(source.probeStatus, 'unavailable') || 'unavailable',
        lastCheckedAt: normalizeRenderText(source.lastCheckedAt, '') || null,
        statusMatch: Boolean(source.statusMatch),
        freshnessKnown: Boolean(source.freshnessKnown),
        notes,
        source: normalizeRenderText(source.source, 'external_mcp') || 'external_mcp',
        errorMessage: normalizeRenderText(source.errorMessage, '') || null,
        probeTarget: normalizeRenderText(source.probeTarget || source.probe_target, '') || null,
        externalProbeLive: typeof source.externalProbeLive === 'boolean' ? source.externalProbeLive : null,
        usedFallback: typeof source.usedFallback === 'boolean' ? source.usedFallback : null,
        mcpEvidenceSource: normalizeRenderText(source.mcpEvidenceSource, '') || null,
    }
    : null;
}

function normalizeQAInvestigationPayload(investigation = null) {
  const source = normalizeRenderObject(investigation);
  const evidence = normalizeRenderObject(source.evidence);
  const repeatCount = Number(source.repeat_count ?? source.repeatCount ?? 1) || 1;
  return Object.keys(source).length
    ? {
        ...source,
        id: normalizeRenderText(source.id, '') || null,
        type: normalizeRenderText(source.type, '') || 'qa_investigation',
        trigger: normalizeRenderText(source.trigger, '') || 'external_mismatch',
        severity: normalizeRenderText(source.severity, '') || 'medium',
        created_at: normalizeRenderText(source.created_at || source.createdAt || source.first_seen_at || source.firstSeenAt, '') || null,
        first_seen_at: normalizeRenderText(source.first_seen_at || source.firstSeenAt || source.created_at || source.createdAt, '') || null,
        last_seen_at: normalizeRenderText(source.last_seen_at || source.lastSeenAt || source.created_at || source.createdAt, '') || null,
        repeat_count: repeatCount,
        status: normalizeRenderText(source.status, '') || 'open',
        summary: normalizeRenderText(source.summary, '') || 'External probe disagrees with internal QA status',
        evidence: {
          external: normalizeRenderObject(evidence.external),
          internal: normalizeRenderObject(evidence.internal),
          comparison: normalizeRenderObject(evidence.comparison),
        },
        latest_evidence: normalizeRenderObject(source.latest_evidence),
        signature: normalizeRenderText(source.signature, '') || null,
        evidence_events: normalizeRenderList(source.evidence_events).map((entry) => normalizeRenderObject(entry)),
        research_available: Boolean(source.research_available),
        latest_research_at: normalizeRenderText(source.latest_research_at, '') || null,
        research_note_count: Number(source.research_note_count ?? 0) || 0,
        research_status: normalizeRenderText(source.research_status, '') || null,
        research_error_message: normalizeRenderText(source.research_error_message, '') || null,
        research_summary: normalizeRenderText(source.research_summary, '') || null,
        research_recommendation: normalizeRenderText(source.research_recommendation, '') || null,
      }
    : null;
}

function normalizeQAInvestigationsPayload(investigations = null) {
  const items = normalizeRenderList(investigations).map((entry) => normalizeQAInvestigationPayload(entry)).filter(Boolean);
  if (!items.length) {
    return [];
  }
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(left.last_seen_at || left.created_at || '');
    const rightTime = Date.parse(right.last_seen_at || right.created_at || '');
    const leftKnown = Number.isFinite(leftTime);
    const rightKnown = Number.isFinite(rightTime);
    if (leftKnown && rightKnown && leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    if (leftKnown !== rightKnown) {
      return leftKnown ? -1 : 1;
    }
    return String(right.id || '').localeCompare(String(left.id || ''));
  });
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
    evidenceSources: normalizeRenderList(source.evidenceSources).map((entry) => normalizeQAEvidenceTracePayload(entry)),
    evidenceSummary: normalizeRenderObject(source.evidenceSummary),
    testRegistry: normalizeQATestRegistryPayload(source.testRegistry || null),
    testRegistrySummary: normalizeRenderObject(source.testRegistrySummary),
    auditTrail: normalizeQAAuditTrailPayload(source.auditTrail || null),
    auditTrailSummary: normalizeRenderObject(source.auditTrailSummary),
    externalValidation: normalizeQAExternalValidationPayload(source.externalValidation || null),
    investigations: normalizeQAInvestigationsPayload(source.investigations || source.openInvestigations || null),
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
  const canonicalSeats = normalizeRenderList(source.canonicalSeats).map((entry) => ({
    ...normalizeRenderObject(entry),
    blocker: Boolean(entry?.blocker),
    entityLabel: normalizeRenderText(entry?.entityLabel, '') || entry?.entityId || 'Unknown entity',
    entityType: normalizeRenderText(entry?.entityType, '') || 'desk',
    entityId: normalizeRenderText(entry?.entityId, '') || null,
    departmentLabel: normalizeRenderText(entry?.departmentLabel, '') || normalizeRenderText(entry?.departmentId, '') || 'Unknown department',
    departmentId: normalizeRenderText(entry?.departmentId, '') || null,
    roleLabel: normalizeRenderText(entry?.roleLabel, '') || normalizeRenderText(entry?.roleId, '') || normalizeRenderText(entry?.kind, '') || 'open seat',
    roleId: normalizeRenderText(entry?.roleId, '') || null,
    kind: normalizeRenderText(entry?.kind, '') || 'open-seat',
    shortfall: Number(entry?.shortfall ?? 0) || 0,
    urgency: normalizeRenderText(entry?.urgency, '') || 'low',
  }));
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
  const activeDepartmentCards = desks.length ? desks : departments;
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
    canonicalSeats,
    openRoles,
    blockers,
    hiringSignals,
    plannerCoverage: normalizeRenderObject(source.plannerCoverage),
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
      summary: normalizeRenderText(source.summary),
      status: normalizeRenderText(source.status),
    value: source.value ?? null,
    truth: source.truth && typeof source.truth === 'object' ? source.truth : null,
    report: source.report && typeof source.report === 'object' ? normalizeQAReportPayload(source.report) : null,
    latestBrowserRun,
    latestRun: latestBrowserRun,
    localGate: source.localGate || source.gate ? normalizeQALocalGatePayload(source.localGate || source.gate || null) : null,
    gate: source.gate || source.localGate ? normalizeQALocalGatePayload(source.gate || source.localGate || null) : null,
    cards: normalizeRenderList(source.cards),
    items: normalizeRenderList(source.items),
    notes: normalizeRenderList(source.notes),
    surfaces: normalizeRenderList(source.surfaces).map((entry) => normalizeRenderObject(entry)),
    lanes: normalizeRenderList(source.lanes).map((entry) => normalizeRenderObject(entry)),
    canaries: normalizeRenderObject(source.canaries),
    repairLoopSummary: normalizeRenderObject(source.repairLoopSummary),
    liveStatus: normalizeRenderObject(source.liveStatus || source.mcpLiveStatus),
    economy: normalizeRenderObject(source.economy),
    suiteSummary: normalizeRenderText(source.suiteSummary),
    structuredStatus: normalizeRenderText(source.structuredStatus),
    structuredSummary: normalizeRenderText(source.structuredSummary),
    externalValidation: normalizeQAExternalValidationPayload(source.externalValidation || null),
    researchState: normalizeRenderObject(source.researchState),
    overview: normalizeRenderObject(source.overview),
    busy: Boolean(source.busy),
    collapsible: source.collapsible !== false,
    defaultOpen: Boolean(source.defaultOpen),
    scorecardCount: Number(source.scorecardCount ?? 0) || 0,
    scorecardDeskCount: Number(source.scorecardDeskCount ?? 0) || 0,
  };
}

function normalizeQAHygieneSurfacePayload(surface = {}) {
  const source = normalizeRenderObject(surface);
  return {
    ...source,
    surface_id: normalizeRenderText(source.surface_id, '') || null,
    label: normalizeRenderText(source.label, '') || 'Surface',
    status: normalizeRenderText(source.status, 'unknown') || 'unknown',
    freshness: normalizeRenderText(source.freshness, 'unknown') || 'unknown',
    last_updated: normalizeRenderText(source.last_updated, '') || null,
    source: normalizeRenderText(source.source, 'unknown') || 'unknown',
    coverage_hint: normalizeRenderText(source.coverage_hint, '') || '',
    notes: normalizeRenderList(source.notes).map((note) => normalizeRenderText(note, '')).filter(Boolean),
  };
}

function normalizeQAMcpLiveStatusPayload(status = {}) {
  const source = normalizeRenderObject(status);
  return Object.keys(source).length
    ? {
        ...source,
        status: normalizeRenderText(source.status, 'offline') || 'offline',
        usage_state: normalizeRenderText(source.usage_state || source.usageState, 'configured_but_unused') || 'configured_but_unused',
        freshness: normalizeRenderText(source.freshness, 'unknown') || 'unknown',
        summary: normalizeRenderText(source.summary, 'QA MCP proof-of-life has not been recorded yet.') || 'QA MCP proof-of-life has not been recorded yet.',
        heartbeat_at: normalizeRenderText(source.heartbeat_at || source.heartbeatAt, '') || null,
        last_completed_cycle_at: normalizeRenderText(source.last_completed_cycle_at || source.lastCompletedCycleAt, '') || null,
        mcp_configured: source.mcp_configured !== false,
        configured_tools: normalizeRenderList(source.configured_tools || source.configuredTools),
        mcp_reachable: source.mcp_reachable === true,
        last_ping_at: normalizeRenderText(source.last_ping_at || source.lastPingAt, '') || null,
        last_ping_status: normalizeRenderText(source.last_ping_status || source.lastPingStatus, 'unavailable') || 'unavailable',
        last_ping_source: normalizeRenderText(source.last_ping_source || source.lastPingSource, 'external_mcp') || 'external_mcp',
        last_ping_failure_kind: normalizeRenderText(source.last_ping_failure_kind || source.lastPingFailureKind, '') || null,
        last_ping_failure_detail: normalizeRenderText(source.last_ping_failure_detail || source.lastPingFailureDetail, '') || null,
        last_ping_target: normalizeRenderText(source.last_ping_target || source.lastPingTarget, '') || null,
        research_target: normalizeRenderText(source.research_target || source.researchTarget, '') || null,
        research_last_call_at: normalizeRenderText(source.research_last_call_at || source.researchLastCallAt, '') || null,
        research_last_call_status: normalizeRenderText(source.research_last_call_status || source.researchLastCallStatus, 'unknown') || 'unknown',
        research_failure_kind: normalizeRenderText(source.research_failure_kind || source.researchFailureKind, '') || null,
        research_failure_detail: normalizeRenderText(source.research_failure_detail || source.researchFailureDetail, '') || null,
        last_call_at: normalizeRenderText(source.last_call_at || source.lastCallAt, '') || null,
        last_call_tool: normalizeRenderText(source.last_call_tool || source.lastCallTool, '') || null,
        last_call_status: normalizeRenderText(source.last_call_status || source.lastCallStatus, 'unknown') || 'unknown',
        last_call_source: normalizeRenderText(source.last_call_source || source.lastCallSource, '') || null,
        last_qa_gate_source: normalizeRenderText(source.last_qa_gate_source || source.lastQaGateSource, 'unknown') || 'unknown',
        last_success_at: normalizeRenderText(source.last_success_at || source.lastSuccessAt, '') || null,
        last_failure_at: normalizeRenderText(source.last_failure_at || source.lastFailureAt, '') || null,
        current_failure_kind: normalizeRenderText(source.current_failure_kind || source.currentFailureKind, '') || null,
        current_failure_tool: normalizeRenderText(source.current_failure_tool || source.currentFailureTool, '') || null,
        recovery_detected: Boolean(source.recovery_detected ?? source.recoveryDetected),
        recovered_at: normalizeRenderText(source.recovered_at || source.recoveredAt, '') || null,
        recovered_from_kind: normalizeRenderText(source.recovered_from_kind || source.recoveredFromKind, '') || null,
        using_mcp_for_qa_decisions: Boolean(source.using_mcp_for_qa_decisions ?? source.usingMcpForQaDecisions),
        notes: normalizeRenderList(source.notes).map((note) => normalizeRenderText(note, '')).filter(Boolean),
      }
    : {
        status: 'offline',
        usage_state: 'configured_but_unused',
        freshness: 'unknown',
        summary: 'QA MCP proof-of-life has not been recorded yet.',
        heartbeat_at: null,
        last_completed_cycle_at: null,
        mcp_configured: false,
        configured_tools: [],
        mcp_reachable: false,
        last_ping_at: null,
        last_ping_status: 'unavailable',
        last_ping_source: 'external_mcp',
        last_ping_failure_kind: null,
        last_ping_failure_detail: null,
        last_ping_target: null,
        research_target: null,
        research_last_call_at: null,
        research_last_call_status: 'unknown',
        research_failure_kind: null,
        research_failure_detail: null,
        last_call_at: null,
        last_call_tool: null,
        last_call_status: 'unknown',
        last_call_source: null,
        last_qa_gate_source: 'unknown',
        last_success_at: null,
        last_failure_at: null,
        current_failure_kind: null,
        current_failure_tool: null,
        recovery_detected: false,
        recovered_at: null,
        recovered_from_kind: null,
        using_mcp_for_qa_decisions: false,
        notes: [],
      };
}

function normalizeQALeadFeedItem(item = {}) {
  const source = normalizeRenderObject(item);
  return {
    id: normalizeRenderText(source.id, '') || null,
    label: normalizeRenderText(source.label, normalizeRenderText(source.summary, 'QA tool result')) || 'QA tool result',
    tool: normalizeRenderText(source.tool, normalizeRenderText(source.source, 'qa_tool')) || 'qa_tool',
    status: normalizeRenderText(source.status || source.result || source.verdict, 'unknown') || 'unknown',
    verdict: normalizeRenderText(source.verdict || source.result || source.status, 'unknown') || 'unknown',
    result: normalizeRenderText(source.result || source.verdict || source.status, 'unknown') || 'unknown',
    summary: normalizeRenderText(source.summary, '') || 'No summary recorded.',
    detail: normalizeRenderText(source.detail, '') || '',
    createdAt: normalizeRenderText(source.createdAt || source.created_at || source.observed_at || source.observedAt, '') || null,
    observed_at: normalizeRenderText(source.observed_at || source.observedAt, '') || null,
    type: normalizeRenderText(source.type, '') || null,
    source: normalizeRenderText(source.source, '') || null,
    meta: normalizeRenderObject(source.meta),
    artifact_refs: normalizeRenderList(source.artifact_refs || source.artifactRefs),
    notes: normalizeRenderList(source.notes),
  };
}

function normalizeQALeadRunnerPayload(state = {}) {
  const source = normalizeRenderObject(state);
  const outputFeed = normalizeRenderList(source.output_feed || source.outputFeed).map((item) => normalizeQALeadFeedItem(item)).filter((item) => item.id || item.summary);
  return {
    source: normalizeRenderText(source.source, 'qa_lead_runner') || 'qa_lead_runner',
    agent_id: normalizeRenderText(source.agent_id || source.agentId, 'qa-lead') || 'qa-lead',
    id: normalizeRenderText(source.id || source.run_id, '') || null,
    run_type: normalizeRenderText(source.run_type || source.runType, 'scheduled_cycle') || 'scheduled_cycle',
    status: normalizeRenderText(source.status, 'idle') || 'idle',
    current_task: normalizeRenderText(source.current_task || source.currentTask, 'QA proof-of-life, browser pass, lane canaries, and loop audit') || 'QA proof-of-life, browser pass, lane canaries, and loop audit',
    current_batch: normalizeRenderText(source.current_batch || source.currentBatch || source.run_id, '') || null,
    base_url: normalizeRenderText(source.base_url || source.baseUrl, '') || null,
    probe_url: normalizeRenderText(source.probe_url || source.probeUrl, '') || null,
    started_at: normalizeRenderText(source.started_at || source.startedAt, '') || null,
    finished_at: normalizeRenderText(source.finished_at || source.finishedAt, '') || null,
    last_completed_cycle_at: normalizeRenderText(source.last_completed_cycle_at || source.lastCompletedCycleAt, '') || null,
    active_tools: normalizeRenderList(source.active_tools || source.activeTools),
    live_status: normalizeQAMcpLiveStatusPayload(source.live_status || source.liveStatus || null),
    output_feed: outputFeed,
    result_paths: normalizeRenderObject(source.result_paths || source.resultPaths),
    failure_reason: normalizeRenderText(source.failure_reason || source.failureReason, '') || null,
    summary: normalizeRenderText(source.summary, 'QA lead has not run yet.') || 'QA lead has not run yet.',
    automation_started: Boolean(source.automation_started ?? source.automationStarted),
    automation_enabled: Boolean(source.automation_enabled ?? source.automationEnabled),
    automation_interval_ms: Number(source.automation_interval_ms ?? source.automationIntervalMs) || null,
    automation_last_kick_at: normalizeRenderText(source.automation_last_kick_at || source.automationLastKickAt, '') || null,
    automation_last_result: normalizeRenderObject(source.automation_last_result || source.automationLastResult || null),
  };
}

function normalizeQALiveCyclePayload(cycle = {}) {
  const source = normalizeRenderObject(cycle);
  return {
    current_run_id: normalizeRenderText(source.current_run_id || source.currentRunId, '') || null,
    current_status: normalizeRenderText(source.current_status || source.currentStatus, 'idle') || 'idle',
    latest_completed_cycle_id: normalizeRenderText(source.latest_completed_cycle_id || source.latestCompletedCycleId, '') || null,
    latest_completed_cycle_at: normalizeRenderText(source.latest_completed_cycle_at || source.latestCompletedCycleAt, '') || null,
    latest_completed_status: normalizeRenderText(source.latest_completed_status || source.latestCompletedStatus, 'unknown') || 'unknown',
    latest_completed_summary: normalizeRenderText(source.latest_completed_summary || source.latestCompletedSummary, '') || null,
    ran_once: Boolean(source.ran_once ?? source.ranOnce),
    mcp_status: normalizeRenderText(source.mcp_status || source.mcpStatus, 'unknown') || 'unknown',
    mcp_reachable: typeof source.mcp_reachable === 'boolean'
      ? source.mcp_reachable
      : Boolean(source.mcpReachable),
    current_gate_source: normalizeRenderText(source.current_gate_source || source.currentGateSource, 'unknown') || 'unknown',
    external_status: normalizeRenderText(source.external_status || source.externalStatus, 'unknown') || 'unknown',
    output_feed_loaded: Boolean(source.output_feed_loaded ?? source.outputFeedLoaded),
    output_feed_count: Number(source.output_feed_count ?? source.outputFeedCount) || 0,
    output_feed_captured: Boolean(source.output_feed_captured ?? source.outputFeedCaptured),
    latest_feed_entry_id: normalizeRenderText(source.latest_feed_entry_id || source.latestFeedEntryId, '') || null,
    latest_feed_result: normalizeRenderText(source.latest_feed_result || source.latestFeedResult, '') || null,
    summary: normalizeRenderText(source.summary, 'QA has not completed a live cycle yet.') || 'QA has not completed a live cycle yet.',
  };
}

function normalizeQALaneCanaryStatePayload(state = {}) {
  const source = normalizeRenderObject(state);
  const results = normalizeRenderList(source.results).map((entry) => {
    const result = normalizeRenderObject(entry);
    return {
      canary_id: normalizeRenderText(result.canary_id || result.canaryId, '') || null,
      label: normalizeRenderText(result.label, '') || 'Lane Canary',
      status: normalizeRenderText(result.status, 'fail') || 'fail',
      checked_at: normalizeRenderText(result.checked_at || result.checkedAt, '') || null,
      target_lane_id: normalizeRenderText(result.target_lane_id || result.targetLaneId, '') || null,
      target_lane_label: normalizeRenderText(result.target_lane_label || result.targetLaneLabel, '') || null,
      owner_department: normalizeRenderText(result.owner_department || result.ownerDepartment, 'QA') || 'QA',
      trigger: normalizeRenderText(result.trigger, '') || null,
      policy_outcome: normalizeRenderText(result.policy_outcome || result.policyOutcome, '') || null,
      validation_status: normalizeRenderText(result.validation_status || result.validationStatus, '') || null,
      trust_level: normalizeRenderText(result.trust_level || result.trustLevel, 'unknown') || 'unknown',
      summary: normalizeRenderText(result.summary, '') || 'No canary summary recorded.',
      latest_validation_summary: normalizeRenderText(result.latest_validation_summary || result.latestValidationSummary, '') || null,
      scoped_targets_summary: normalizeRenderText(result.scoped_targets_summary || result.scopedTargetsSummary, '') || '',
      required_validation_gate_ids: normalizeRenderList(result.required_validation_gate_ids || result.requiredValidationGateIds),
      notes: normalizeRenderList(result.notes).map((note) => normalizeRenderText(note, '')).filter(Boolean),
    };
  }).filter((result) => result.canary_id);
  return {
    last_run_at: normalizeRenderText(source.last_run_at || source.lastRunAt, '') || null,
    overall_status: normalizeRenderText(source.overall_status || source.overallStatus, 'idle') || 'idle',
    total_canaries: Number(source.total_canaries ?? source.totalCanaries ?? results.length) || results.length,
    passed_count: Number(source.passed_count ?? source.passedCount ?? results.filter((result) => result.status === 'pass').length) || 0,
    failed_count: Number(source.failed_count ?? source.failedCount ?? 0) || 0,
    failing_canary_ids: normalizeRenderList(source.failing_canary_ids || source.failingCanaryIds),
    results,
    summary: normalizeRenderText(source.summary, 'No QA lane canary results are recorded yet.') || 'No QA lane canary results are recorded yet.',
  };
}

function normalizeQARepairLaneOutcomeStatus(lane = {}) {
  const laneStatus = normalizeRenderText(lane.current_status || lane.status, 'idle');
  const latestJobStatus = normalizeRenderText(lane.latest_job_status || lane.latestJobStatus, '');
  const latestValidationResult = normalizeRenderText(lane.latest_validation_result || lane.latestValidationResult, '');
  if (latestJobStatus === 'policy_blocked' || laneStatus === 'blocked') return 'policy_blocked';
  if (['needs_human_review', 'stalled_after_retries'].includes(latestJobStatus) || laneStatus === 'stalled') return 'safe_stop';
  if (latestValidationResult === 'accepted' || latestJobStatus === 'accepted' || laneStatus === 'healthy') return 'success';
  if (['rejected', 'inconclusive'].includes(latestValidationResult)) return 'validation_failed';
  if (laneStatus === 'active') return 'active';
  if (laneStatus === 'watching') return 'watching';
  return 'idle';
}

function normalizeQARepairLanePayload(lane = {}) {
  const source = normalizeRenderObject(lane);
  return Object.keys(source).length
    ? {
        ...source,
        lane_id: normalizeRenderText(source.lane_id || source.laneId, '') || null,
        label: normalizeRenderText(source.label, '') || normalizeRenderText(source.observability_label, '') || 'Repair Lane',
        owner_department: normalizeRenderText(source.owner_department || source.ownerDepartment, '') || 'QA',
        trust_level: normalizeRenderText(source.trust_level || source.trustLevel, '') || 'unknown',
        trust_reason: normalizeRenderText(source.trust_reason || source.trustReason, '') || '',
        current_status: normalizeRenderText(source.current_status || source.status, '') || 'idle',
        latest_job_status: normalizeRenderText(source.latest_job_status || source.latestJobStatus, '') || null,
        latest_validation_result: normalizeRenderText(source.latest_validation_result || source.latestValidationResult || source.latest_attempt_verdict || source.latestAttemptVerdict, '') || null,
        latest_attempt_at: normalizeRenderText(source.latest_attempt_at || source.latestAttemptAt, '') || null,
        latest_stop_reason: normalizeRenderText(source.latest_stop_reason || source.latestStopReason || source.latest_policy_block_reason || source.latestPolicyBlockReason, '') || null,
        latest_policy_block_reason: normalizeRenderText(source.latest_policy_block_reason || source.latestPolicyBlockReason, '') || null,
        open_investigations: Number(source.open_investigations ?? source.openInvestigations ?? 0) || 0,
        repair_job_count: Number(source.repair_job_count ?? source.repairJobCount ?? 0) || 0,
        attempt_count: Number(source.attempt_count ?? source.attemptCount ?? source.latest_job?.attempt_count ?? 0) || 0,
        blocked_count: Number(source.blocked_count ?? source.blockedCount ?? source.policy_blocked_job_count ?? source.policyBlockedJobCount ?? 0) || 0,
        auto_apply_allowed: source.auto_apply_allowed !== false,
        human_review_required_on_ambiguity: source.human_review_required_on_ambiguity !== false,
        retry_budget: Number(source.retry_budget ?? source.retryBudget ?? source.max_attempts ?? source.maxAttempts ?? 0) || 0,
        required_validation_gate_ids: normalizeRenderList(source.required_validation_gate_ids || source.requiredValidationGateIds),
        allowed_trigger_classes: normalizeRenderList(source.allowed_trigger_classes || source.allowedTriggerClasses),
        scoped_targets: normalizeRenderList(source.scoped_targets || source.scopedTargets),
        scoped_targets_summary: normalizeRenderText(source.scoped_targets_summary || source.scopedTargetsSummary, '') || '',
        trust_summary: normalizeRenderText(source.trust_summary || source.trustSummary, '') || '',
        eligibility_summary: normalizeRenderText(source.eligibility_summary || source.eligibilitySummary, '') || '',
        outcome_status: normalizeQARepairLaneOutcomeStatus(source),
      }
    : null;
}

function normalizeQARepairLanePayloadList(lanes = null) {
  const items = normalizeRenderList(lanes).map((entry) => normalizeQARepairLanePayload(entry)).filter(Boolean);
  if (!items.length) return [];
  const rankLane = (lane) => {
    if (lane.outcome_status === 'policy_blocked') return 0;
    if (lane.outcome_status === 'safe_stop') return 1;
    if (lane.current_status === 'active') return 2;
    if (lane.current_status === 'watching') return 3;
    if (lane.outcome_status === 'validation_failed') return 4;
    if (lane.outcome_status === 'success') return 5;
    return 6;
  };
  return [...items].sort((left, right) => {
    const leftRank = rankLane(left);
    const rightRank = rankLane(right);
    if (leftRank !== rightRank) return leftRank - rightRank;
    const leftTime = Date.parse(left.latest_attempt_at || '');
    const rightTime = Date.parse(right.latest_attempt_at || '');
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return String(left.label || left.lane_id || '').localeCompare(String(right.label || right.lane_id || ''));
  });
}

export function buildQAReadableSectionsFromState(source = {}) {
  const normalized = normalizeRenderObject(source);
  const canonicalTruthSections = normalizeRenderObject(normalized.canonicalTruthSections || normalized.canonicalTruth?.sections || {});
  if (Array.isArray(normalized.sections) && normalized.sections.length) {
    return decorateQaReadableSections(
      normalized.sections.map((section) => normalizeDeskSectionPayload(section)),
      {
        provenanceLabel: 'Governed',
        canonicalTruthSections,
      },
    );
  }
  const structuredReport = normalized.structuredReport ? normalizeQAReportPayload(normalized.structuredReport) : null;
  const structuredSummary = normalizeRenderObject(normalized.structuredSummary);
  const latestBrowserRun = normalizeQARunPayload(normalized.latestBrowserRun || normalized.latestRun || null);
  const browserRuns = normalizeRenderList(normalized.browserRuns);
  const localGate = normalizeQALocalGatePayload(normalized.localGate || null);
  const testRegistry = normalizeQATestRegistryPayload(normalized.testRegistry || null);
  const testRegistrySummary = normalizeRenderObject(normalized.testRegistrySummary);
  const auditTrail = normalizeQAAuditTrailPayload(normalized.auditTrail || null);
  const externalValidation = normalizeQAExternalValidationPayload(normalized.externalValidation || null);
  const openInvestigations = normalizeQAInvestigationsPayload(normalized.openInvestigations || normalized.investigations || null);
  const repairLoop = normalizeRenderObject(normalized.repairLoop);
  const repairLanes = normalizeQARepairLanePayloadList(normalized.repairLanes || repairLoop.lanes || []);
  const repairLoopSummary = normalizeRenderObject(normalized.repairLoopSummary || repairLoop.summary || {});
  const qaCanaries = normalizeQALaneCanaryStatePayload(normalized.qaCanaries || normalized.canaries || {});
  const qaMcpLiveStatus = normalizeQAMcpLiveStatusPayload(normalized.qaMcpLiveStatus || normalized.mcpLiveStatus || null);
  const qaLead = normalizeQALeadRunnerPayload(normalized.qaLead || null);
  const qaLeadLatestRun = normalizeQALeadRunnerPayload(normalized.qaLeadLatestRun || (Array.isArray(normalized.qaLeadRuns) ? normalized.qaLeadRuns[0] : null) || null);
  const qaLiveCycle = normalizeQALiveCyclePayload(normalized.qaLiveCycle || normalized.qa_live_cycle || null);
  const evaluator = normalizeRenderObject(normalized.evaluator || {});
  const agentCognitionSummary = normalizeRenderObject(normalized.agentCognitionSummary || normalized.agent_cognition_summary || {});
  const qaOutputFeedLoaded = Boolean(normalized.outputFeedLoaded || normalized.output_feed_loaded);
  const qaOutputFeed = normalizeRenderList(normalized.outputFeed || normalized.output_feed || []).map((item) => normalizeQALeadFeedItem(item));
  const qaLeadFeed = qaOutputFeedLoaded
    ? qaOutputFeed
    : (qaLeadLatestRun.output_feed.length ? qaLeadLatestRun.output_feed : qaLead.output_feed).map((item) => normalizeQALeadFeedItem(item));
  const researchState = normalizeRenderObject(normalized.researchState);
  const researchNotes = normalizeRenderList(normalized.researchNotes || researchState.notes || []);
  const latestResearchNote = researchNotes[0] || null;
  const latestIntent = normalizeRenderObject(normalized.intent || normalized.latestIntent || null);
  const scorecards = normalizeRenderList(normalized.scorecards || structuredReport?.scorecards || []);
  const plannerStatus = structuredReport?.status || 'unknown';
  const qaStatus = externalValidation?.status || (openInvestigations.length ? 'warn' : 'unknown');
  const executorStatus = latestBrowserRun?.verdict || latestBrowserRun?.status || localGate?.studioBoot?.verdict || localGate?.unit?.status || 'unknown';
  const ctoStatus = auditTrail?.summary?.mismatch > 0
    ? 'warn'
    : (auditTrail?.summary?.ok > 0 ? 'pass' : 'unknown');
  const archiveStatus = Number(testRegistry?.entries?.length || 0) > 0 ? 'pass' : 'unknown';
  const intentStatus = latestIntent?.summary ? 'pass' : 'unknown';
  const researchStatus = Number(researchState?.summary?.availableNotes || 0) > 0
    ? 'pass'
    : (Number(researchState?.summary?.unavailableNotes || 0) > 0 ? 'warn' : 'unknown');
  const recurringInvestigations = openInvestigations.filter((entry) => Number(entry.repeat_count || 0) > 1);

  const plannerLastUpdated = structuredSummary?.finishedAt || structuredReport?.finishedAt || structuredReport?.updatedAt || structuredReport?.createdAt || null;
  const qaLastUpdated = externalValidation?.lastCheckedAt || null;
  const executorLastUpdated = latestBrowserRun?.sourceTrace?.observedAt || latestBrowserRun?.finishedAt || latestBrowserRun?.createdAt || localGate?.studioBoot?.sourceTrace?.observedAt || localGate?.unit?.sourceTrace?.observedAt || null;
  const ctoLastUpdated = auditTrail?.generatedAt || null;
  const archiveLastUpdated = testRegistry?.generatedAt || testRegistrySummary?.generatedAt || null;
  const intentLastUpdated = latestIntent?.updatedAt || latestIntent?.createdAt || null;
  const researchLastUpdated = researchState?.summary?.latestNoteAt || latestResearchNote?.created_at || latestResearchNote?.updated_at || null;

  return decorateQaReadableSections([
    {
      id: 'qa-overview',
      label: 'QA Health Overview',
      kind: 'qa-overview',
      overview: {
        status: structuredReport?.status === 'fail' || externalValidation?.status === 'fail'
          ? 'fail'
          : (plannerStatus === 'pass' && qaStatus === 'pass' && openInvestigations.length === 0
              ? 'pass'
              : (openInvestigations.length || plannerStatus === 'warn' || qaStatus === 'warn'
                  ? 'warn'
                  : 'unknown')),
        structuredStatus: plannerStatus,
        externalStatus: externalValidation?.status || 'unknown',
        openInvestigationsCount: openInvestigations.length,
        recurringInvestigationsCount: recurringInvestigations.length,
        researchBackedInvestigationsCount: openInvestigations.filter((entry) => Boolean(entry.research_available) || Number(entry.research_note_count || 0) > 0).length,
        researchAvailableCount: Number(researchState?.summary?.availableNotes || 0),
        latestStructuredAt: latestKnownTimestamp(plannerLastUpdated),
        latestExternalAt: latestKnownTimestamp(qaLastUpdated),
        latestResearchAt: latestKnownTimestamp(researchLastUpdated),
        notes: [
          structuredSummary?.summary || structuredReport?.summary || 'Structured QA report unavailable.',
          externalValidation?.notes?.[0] || externalValidation?.errorMessage || 'External validation snapshot available.',
        ].filter(Boolean),
      },
      summary: 'Overall QA health at a glance.',
      collapsible: false,
      defaultOpen: true,
    },
    {
      id: 'qa-mcp-live',
      label: 'QA MCP Proof of Life',
      kind: 'qa-mcp-live',
      liveStatus: qaMcpLiveStatus,
      liveCycle: qaLiveCycle,
      summary: qaMcpLiveStatus.summary,
      collapsible: false,
      defaultOpen: true,
    },
    {
      id: 'qa-operator',
      label: 'QA Live Operator',
      kind: 'qa-operator',
      lead: qaLeadLatestRun.id ? qaLeadLatestRun : qaLead,
      liveCycle: qaLiveCycle,
      summary: qaLiveCycle.ran_once
        ? qaLiveCycle.summary
        : (qaLead.current_task || qaLead.summary || 'QA lead automation is not running yet.'),
      collapsible: false,
      defaultOpen: true,
    },
    {
      id: 'qa-output-feed',
      label: 'QA Output Feed',
      kind: 'qa-output-feed',
      feed: qaLeadFeed,
      liveCycle: qaLiveCycle,
      summary: qaLiveCycle.ran_once
        ? (qaLiveCycle.output_feed_captured
            ? `Latest cycle ${qaLiveCycle.latest_completed_cycle_id || 'unknown'} is captured in the QA output feed.`
            : `Latest cycle ${qaLiveCycle.latest_completed_cycle_id || 'unknown'} completed but the QA output feed has not captured it yet.`)
        : (qaLeadFeed.length
            ? `${qaLeadFeed.length} QA output item${qaLeadFeed.length === 1 ? '' : 's'} ready for executor review.`
            : 'QA output feed is empty until the lead run completes.'),
      emptyState: 'No QA output feed is available yet.',
      collapsible: true,
      defaultOpen: qaLeadFeed.length > 0,
    },
    {
      id: 'qa-canaries',
      label: 'Lane Canaries',
      kind: 'qa-canaries',
      canaries: qaCanaries,
      summary: qaCanaries.summary,
      emptyState: 'No QA lane canary results are recorded yet.',
      collapsible: true,
      defaultOpen: qaCanaries.failed_count > 0,
    },
    {
      id: 'qa-hygiene',
      label: 'Freshness & Hygiene',
      kind: 'qa-hygiene',
      surfaces: [
        normalizeQAHygieneSurfacePayload({
          surface_id: 'planner',
          label: 'Planner',
          status: plannerStatus,
          freshness: structuredReport?.sourceTrace?.freshnessClass || (structuredReport ? 'fresh' : 'missing'),
          last_updated: plannerLastUpdated,
          source: structuredReport?.sourceTrace?.sourcePath || 'data/spatial/qa/structured/latest.json',
          coverage_hint: `${scorecards.length} scorecard${scorecards.length === 1 ? '' : 's'} | ${Number(structuredReport?.tests?.length || structuredReport?.desks?.length || 0)} test surface${Number(structuredReport?.tests?.length || structuredReport?.desks?.length || 0) === 1 ? '' : 's'}`,
          notes: [structuredSummary?.summary || structuredReport?.summary || 'Structured QA report available.'],
        }),
        normalizeQAHygieneSurfacePayload({
          surface_id: 'qa',
          label: 'QA',
          status: qaStatus,
          freshness: externalValidation?.lastCheckedAt ? 'fresh' : (externalValidation ? 'unknown' : 'missing'),
          last_updated: qaLastUpdated,
          source: externalValidation?.source || 'external_mcp',
          coverage_hint: `${openInvestigations.length} open investigation${openInvestigations.length === 1 ? '' : 's'} | ${recurringInvestigations.length} recurring`,
          notes: [externalValidation?.notes?.[0] || externalValidation?.errorMessage || 'External validation snapshot available.'],
        }),
        normalizeQAHygieneSurfacePayload({
          surface_id: 'executor',
          label: 'Executor',
          status: executorStatus,
          freshness: executorLastUpdated ? 'fresh' : 'missing',
          last_updated: executorLastUpdated,
          source: latestBrowserRun?.sourceTrace?.sourcePath || localGate?.studioBoot?.sourceTrace?.sourcePath || localGate?.unit?.sourceTrace?.sourcePath || 'data/spatial/qa/local-gates/*.json',
          coverage_hint: `${browserRuns.length} browser run${browserRuns.length === 1 ? '' : 's'} | ${localGateOutputCount(localGate)} local gate${localGateOutputCount(localGate) === 1 ? '' : 's'}`,
          notes: [summarizeQABrowserRun(latestBrowserRun), summarizeLocalGate(localGate)].filter(Boolean),
        }),
        normalizeQAHygieneSurfacePayload({
          surface_id: 'cto',
          label: 'CTO',
          status: ctoStatus,
          freshness: ctoLastUpdated ? 'fresh' : 'missing',
          last_updated: ctoLastUpdated,
          source: 'qa/qaAuditTrail.js',
          coverage_hint: `${Number(auditTrail?.entries?.length || 0)} audit entr${Number(auditTrail?.entries?.length || 0) === 1 ? 'y' : 'ies'}`,
          notes: [auditTrail?.summary ? `Audit summary: ${auditTrail.summary.ok || 0} ok / ${auditTrail.summary.mismatch || 0} mismatch` : 'QA audit trail available.'],
        }),
        normalizeQAHygieneSurfacePayload({
          surface_id: 'archive',
          label: 'Archive',
          status: archiveStatus,
          freshness: archiveLastUpdated ? 'fresh' : 'missing',
          last_updated: archiveLastUpdated,
          source: 'qa/testRegistry.js',
          coverage_hint: `${Number(testRegistry?.entries?.length || scorecards.length || 0)} registered test${Number(testRegistry?.entries?.length || scorecards.length || 0) === 1 ? '' : 's'}`,
          notes: [testRegistrySummary?.total ? `Executable ${testRegistrySummary.executable || 0} | stale ${testRegistrySummary.staleTarget || 0}` : 'QA test registry available.'],
        }),
        normalizeQAHygieneSurfacePayload({
          surface_id: 'intent',
          label: 'Intent',
          status: intentStatus,
          freshness: intentLastUpdated ? 'fresh' : 'missing',
          last_updated: intentLastUpdated,
          source: 'workspace.intentState.registry',
          coverage_hint: latestIntent?.summary ? 'Active intent captured' : 'No active intent',
          notes: [latestIntent?.summary || 'No active intent captured.'],
        }),
        normalizeQAHygieneSurfacePayload({
          surface_id: 'research',
          label: 'Research',
          status: researchStatus,
          freshness: researchLastUpdated ? 'fresh' : 'missing',
          last_updated: researchLastUpdated,
          source: 'data/spatial/qa/research-notes.json',
          coverage_hint: `${Number(researchState?.summary?.availableNotes || 0)} available / ${Number(researchState?.summary?.totalNotes || 0)} total note${Number(researchState?.summary?.totalNotes || 0) === 1 ? '' : 's'}`,
          notes: [latestResearchNote?.summary || researchState?.research_summary || 'No research notes yet.'],
        }),
      ],
      summary: 'Freshness, provenance, and coverage by surface.',
      collapsible: false,
      defaultOpen: true,
    },
    {
      id: 'qa-repair-lanes',
      label: 'Repair Lanes',
      kind: 'qa-repair-lanes',
      lanes: repairLanes,
      repairLoopSummary,
      summary: repairLanes.length
        ? `${repairLanes.length} active or recent lane${repairLanes.length === 1 ? '' : 's'} | ${Number(repairLoopSummary.blockedLanes || 0)} blocked | ${Number(repairLoopSummary.activeLanes || 0)} active`
        : 'Repair lanes surface trust policy, blocked actions, and validation status.',
      emptyState: 'No active or recent repair lanes are recorded yet.',
      collapsible: true,
      defaultOpen: repairLanes.length > 0,
    },
    {
      id: 'qa-evaluator',
      label: 'Evaluator Movement',
      kind: 'qa-evaluator',
      evaluator,
      summary: normalizeRenderText(evaluator.latestEvaluation?.progress_summary || evaluator.movement?.progressSummary || '')
        || 'Evaluator movement will appear once two comparable snapshots exist.',
      emptyState: 'No evaluator artefact is recorded yet.',
      collapsible: true,
      defaultOpen: Boolean(evaluator.latestEvaluation),
    },
    {
      id: 'qa-agent-cognition',
      label: 'Assigned Agent Liveness',
      kind: 'qa-agent-cognition',
      cognition: agentCognitionSummary,
      summary: normalizeRenderText(agentCognitionSummary.summary) || 'Assigned-agent cognition telemetry is not available yet.',
      emptyState: 'Assigned-agent cognition telemetry is not available yet.',
      collapsible: true,
      defaultOpen: true,
    },
    {
      id: 'qa-scorecards',
      label: 'Scorecards',
      kind: 'qa-scorecards',
      cards: scorecards,
      evaluator,
      sourceTrace: structuredReport?.sourceTrace || null,
      definitions: normalizeRenderObject(normalized.scorecardDefinitions || normalized.definitions || {}),
      suiteStatus: normalizeRenderText(normalized.suiteStatus || normalized.structuredStatus || structuredReport?.status || ''),
      suiteSummary: normalizeRenderText(normalized.suiteSummary || structuredSummary?.summary || structuredReport?.summary || ''),
      meta: {
        deskCount: Number(normalized.scorecardDeskCount || scorecards.length || 0) || 0,
        testCount: Number(normalized.scorecardCount || scorecards.length || 0) || 0,
      },
      emptyState: structuredReport
        ? 'Latest structured QA report does not include any scored test cards yet.'
        : 'Run structured QA to load test quality scorecards.',
      collapsible: true,
      defaultOpen: false,
    },
    {
      id: 'qa-investigations',
      label: 'Investigations',
      kind: 'qa-investigations',
      items: openInvestigations,
      summary: `${openInvestigations.length} open investigation${openInvestigations.length === 1 ? '' : 's'} | ${recurringInvestigations.length} recurring`,
      emptyState: 'No open QA investigations are recorded yet.',
      collapsible: true,
      defaultOpen: openInvestigations.length > 0,
    },
    {
      id: 'qa-research',
      label: 'Advisory / Research',
      kind: 'qa-research',
      notes: researchNotes,
      researchState,
      summary: researchLastUpdated
        ? `Latest research at ${researchLastUpdated}`
        : 'Research notes stay advisory and read-only.',
      emptyState: 'No advisory research notes are recorded yet.',
      collapsible: true,
      defaultOpen: false,
    },
  ], {
    provenanceLabel: 'Derived',
    canonicalTruthSections,
  });
}

export function getQaDeskCanonicalTruthSections(panelData = {}) {
  const normalized = normalizeRenderObject(panelData);
  const authoritativeSections = normalizeRenderObject(normalized.canonicalTruthSections?.qa?.sections);
  if (Object.keys(authoritativeSections).length) {
    return authoritativeSections;
  }
  return normalizeRenderObject(
    normalized.qa?.canonicalTruthSections
    || normalized.qa?.canonicalTruth?.sections
    || {},
  );
}

export function buildQaDeskReadableState(panelData = {}) {
  const normalized = normalizeRenderObject(panelData);
  const qaState = normalizeRenderObject(normalized.qa);
  if (!Object.keys(qaState).length) {
    return qaState;
  }
  const canonicalTruthSections = getQaDeskCanonicalTruthSections(normalized);
  return Object.keys(canonicalTruthSections).length
    ? {
        ...qaState,
        canonicalTruthSections,
      }
    : qaState;
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
  if (deskId === 'cto-chief-of-staff') {
    windows.unshift({ id: 'executive-advisory', label: 'Executive Advisory' });
  }
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
  evidenceSources: [],
  evidenceSummary: {
    total: 0,
    liveCanonical: 0,
    derivedCurrent: 0,
    stale: 0,
    missing: 0,
    nonExecutable: 0,
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
const EMPTY_CANONICAL_INTAKE_STATE = {
  version: 'ace/canonical-intake.v1',
  records: [],
  latestByChannel: {
    cto_prompt: null,
    canvas_text: null,
  },
};

function createCanvasIntentRunState(state = null) {
  return {
    ...EMPTY_CANVAS_INTENT_RUN_STATE,
    ...(state && typeof state === 'object' ? state : {}),
  };
}

function normalizeCanonicalIntakeState(state = null) {
  const source = state && typeof state === 'object' ? state : EMPTY_CANONICAL_INTAKE_STATE;
  const records = Array.isArray(source.records)
    ? source.records
      .filter((record) => record && typeof record === 'object')
      .map((record) => ({
        id: String(record.id || '').trim() || null,
        channel: String(record.channel || '').trim() || null,
        text: String(record.text || '').trim() || '',
        sourceRef: String(record.sourceRef || '').trim() || null,
        processingStatus: String(record.processingStatus || '').trim() || 'recorded',
        resultSummary: String(record.resultSummary || '').trim() || null,
        route: String(record.route || '').trim() || null,
        createdAt: String(record.createdAt || '').trim() || null,
        updatedAt: String(record.updatedAt || '').trim() || null,
        acknowledgement: record.acknowledgement && typeof record.acknowledgement === 'object'
          ? {
              status: String(record.acknowledgement.status || '').trim() || 'recorded',
              summary: String(record.acknowledgement.summary || '').trim() || '',
            }
          : null,
        intentExtraction: record.intentExtraction && typeof record.intentExtraction === 'object'
          ? {
              status: String(record.intentExtraction.status || '').trim() || 'pending',
              canonicalIntentId: String(record.intentExtraction.canonicalIntentId || '').trim() || null,
              intentStatus: String(record.intentExtraction.intentStatus || '').trim() || null,
              summary: String(record.intentExtraction.summary || '').trim() || null,
              sourceType: String(record.intentExtraction.sourceType || '').trim() || null,
              sourceRef: String(record.intentExtraction.sourceRef || '').trim() || null,
              reason: String(record.intentExtraction.reason || '').trim() || null,
            }
          : null,
        governedLoop: record.governedLoop && typeof record.governedLoop === 'object'
          ? {
              route: String(record.governedLoop.route || '').trim() || null,
              contractVersion: String(record.governedLoop.contractVersion || '').trim() || null,
              domain: String(record.governedLoop.domain || '').trim() || null,
            }
          : null,
      }))
      .filter((record) => record.id && record.channel)
    : [];
  return {
    version: String(source.version || EMPTY_CANONICAL_INTAKE_STATE.version).trim() || EMPTY_CANONICAL_INTAKE_STATE.version,
    records,
    latestByChannel: {
      cto_prompt: String(source.latestByChannel?.cto_prompt || records.find((record) => record.channel === 'cto_prompt')?.id || '').trim() || null,
      canvas_text: String(source.latestByChannel?.canvas_text || records.find((record) => record.channel === 'canvas_text')?.id || '').trim() || null,
    },
  };
}

function getLatestCanonicalIntakeRecord(intakeState = EMPTY_CANONICAL_INTAKE_STATE, channel = null) {
  const normalized = normalizeCanonicalIntakeState(intakeState);
  const targetChannel = String(channel || '').trim();
  if (!targetChannel) {
    return normalized.records[0] || null;
  }
  return normalized.records.find((record) => record.channel === targetChannel) || null;
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

export function resolveGeneratedNodeInspection(node = null) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return null;
  return {
    id: typeof node.id === 'string' ? node.id : null,
    kind: typeof node.kind === 'string' ? node.kind : (typeof node.type === 'string' ? node.type : null),
    label: typeof node.label === 'string'
      ? node.label
      : (typeof node.name === 'string' ? node.name : (typeof node.content === 'string' ? node.content : null)),
    summary: typeof node.summary === 'string'
      ? node.summary
      : (typeof node.content === 'string' ? node.content : (typeof node.label === 'string' ? node.label : null)),
    node,
  };
}

export function resolveEvaluatorDirection(verdict = '') {
  const normalized = String(verdict || '').trim().toLowerCase();
  if (normalized === 'better') {
    return {
      verdict: 'better',
      arrow: '↑',
      tone: 'good',
      label: 'improving',
      color: '#7fdca4',
    };
  }
  if (normalized === 'worse') {
    return {
      verdict: 'worse',
      arrow: '↓',
      tone: 'bad',
      label: 'degrading',
      color: '#ff8c6f',
    };
  }
  return {
    verdict: 'no_change',
    arrow: '→',
    tone: 'neutral',
    label: 'stable',
    color: '#9ab7d7',
  };
}

export function formatSignedDelta(value = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0.00';
  return numeric > 0 ? `+${numeric.toFixed(2)}` : numeric.toFixed(2);
}

function toneForTruthKernelStatus(status = '') {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'healthy') return 'good';
  if (normalized === 'degraded') return 'warn';
  if (normalized === 'blocked' || normalized === 'orphaned') return 'bad';
  return 'neutral';
}

function toneForTruthKernelDiagnosis(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized.includes('healthy')) return 'good';
  if (normalized.includes('pressured') || normalized.includes('narrow')) return 'warn';
  if (normalized.includes('collapsed') || normalized.includes('unavailable')) return 'bad';
  return 'neutral';
}

function toneForDeskReportVerdict(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'pass' || normalized === 'healthy' || normalized === 'better' || normalized === 'verified_healthy') return 'good';
  if (normalized === 'warn' || normalized === 'degraded' || normalized === 'no_change' || normalized === 'informational') return 'warn';
  if (normalized === 'fail' || normalized === 'blocked' || normalized === 'worse' || normalized === 'orphaned') return 'bad';
  return 'neutral';
}

function buildTruthKernelStatusSummary(renderModel = null) {
  const dots = Array.isArray(renderModel?.dots) ? renderModel.dots : [];
  const counts = {
    healthy: 0,
    degraded: 0,
    blocked: 0,
    orphaned: 0,
    informational: 0,
  };
  dots.forEach((node) => {
    const status = String(node?.status || '').trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(counts, status)) {
      counts[status] += 1;
      return;
    }
    counts.informational += 1;
  });
  const issueCount = counts.blocked + counts.degraded + counts.orphaned;
  return {
    counts,
    total: dots.length,
    issueCount,
    dominantStatus: issueCount > 0
      ? (counts.blocked > 0 ? 'blocked' : (counts.degraded > 0 ? 'degraded' : 'orphaned'))
      : (counts.healthy > 0 ? 'healthy' : 'informational'),
  };
}

export function buildScorecardMovementModel(card = {}) {
  const movement = normalizeRenderObject(card.evaluatorMovement || {});
  const confidence = Number.isFinite(Number(movement.evaluationConfidence))
    ? Math.max(0, Math.min(1, Number(movement.evaluationConfidence)))
    : null;
  const delta = Number.isFinite(Number(movement.deltaScore)) ? Number(movement.deltaScore) : 0;
  const direction = resolveEvaluatorDirection(movement.verdict || card.evaluatorVerdict || 'no_change');
  return {
    direction,
    delta,
    deltaLabel: formatSignedDelta(delta),
    confidence,
    comparedAt: normalizeRenderText(movement.comparedAt, '') || null,
    cognitionMode: normalizeRenderText(movement.cognitionMode, '') || null,
    progressSummary: normalizeRenderText(movement.progressSummary, '') || null,
    scorePressure: normalizeRenderText(movement.scorePressure, '') || null,
    currentScore: Number.isFinite(Number(card?.overallScore?.value)) ? Number(card.overallScore.value) : null,
    maxScore: Number.isFinite(Number(card?.overallScore?.max)) ? Number(card.overallScore.max) : null,
  };
}

export function buildAgentWorkerCardModel(agent = null) {
  const presence = normalizeRenderObject(agent?.presence || {});
  const cognitionMode = normalizeRenderText(presence.cognitionMode, '') || 'deterministic_tool';
  return {
    name: normalizeRenderText(presence.name, '') || normalizeRenderText(agent?.name, '') || 'Agent',
    role: normalizeRenderText(presence.role, '') || normalizeRenderText(agent?.role, '') || 'Desk worker',
    cognitionMode,
    icon: normalizeRenderText(presence.icon, '') || (cognitionMode === 'model_live' ? '🧠' : (cognitionMode === 'fallback' ? '⚠️' : '⚙️')),
    tone: normalizeRenderText(presence.tone, '') || 'idle',
    currentActivity: normalizeRenderText(presence.currentActivity, '') || normalizeRenderText(agent?.latestSignal, '') || normalizeRenderText(agent?.focusSummary, '') || 'No active task recorded.',
    energy: Number.isFinite(Number(presence.energy)) ? Math.max(0, Math.min(1, Number(presence.energy))) : 0,
    health: Number.isFinite(Number(presence.health)) ? Math.max(0, Math.min(1, Number(presence.health))) : 0,
    confidence: presence.confidence == null
      ? null
      : (Number.isFinite(Number(presence.confidence)) ? Math.max(0, Math.min(1, Number(presence.confidence))) : null),
    fallbackCount: Number.isFinite(Number(presence.fallbackCount)) ? Number(presence.fallbackCount) : 0,
    intendedCognitionMode: normalizeRenderText(presence.intendedCognitionMode, '') || null,
    lastLiveModelCallAt: normalizeRenderText(presence.lastLiveModelCallAt, '') || null,
  };
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
  return { ok: true, reason: '' };
}

export function isPrimaryIntentNode(node = null) {
  const labels = Array.isArray(node?.metadata?.labels) ? node.metadata.labels : [];
  return node?.metadata?.agentId === 'context-manager' || labels.includes('primary-input');
}

function formatRsgActivity(entry = null) {
  if (!entry) return 'RSG idle';
  const label = String(entry.type || 'rsg-skip').replace(/^rsg-/, 'RSG ').replace(/-/g, ' ');
  if (entry.type === 'rsg-blocked') {
    return `${label} | ${entry.reason || 'no candidate projection'}`;
  }
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

function renderContinuousMeter(value = null, {
  fill = '#7fdca4',
  track = 'rgba(255, 255, 255, 0.12)',
  label = '',
} = {}) {
  const normalized = Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : null;
  return h('div', {
    className: 'continuous-meter',
    title: normalized === null ? `${label || 'value'} unavailable` : `${label || 'value'} ${Math.round(normalized * 100)}%`,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      minWidth: 0,
    },
  },
    h('div', {
      style: {
        flex: 1,
        height: '7px',
        borderRadius: '999px',
        background: track,
        overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      },
    },
      h('div', {
        style: {
          width: `${Math.max(0, Math.min(100, (normalized ?? 0) * 100))}%`,
          height: '100%',
          borderRadius: '999px',
          background: fill,
          transition: 'width 160ms ease',
        },
      }),
    ),
    h('span', { className: 'signal-meta muted', style: { minWidth: '42px', textAlign: 'right' } }, normalized === null ? 'n/a' : normalized.toFixed(2)),
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

function summarizeQABrowserRun(run = null) {
  if (!run || typeof run !== 'object') return '';
  const scenario = normalizeRenderText(run.scenario, '') || 'layout-pass';
  const verdict = normalizeRenderText(run.verdict || run.status, '') || 'pending';
  const findingCount = Number(run.findingCount ?? run.findings?.length ?? 0) || 0;
  return `Browser run ${scenario} | ${verdict} | findings ${findingCount}`;
}

function summarizeLocalGate(localGate = null) {
  if (!localGate || typeof localGate !== 'object') return '';
  const parts = [];
  if (localGate.unit) {
    parts.push(`Unit gate ${summarizeGateStatus(localGate.unit)} | failures ${summarizeGateFailures(localGate.unit)}`);
  }
  if (localGate.studioBoot) {
    parts.push(`Studio boot ${summarizeGateStatus(localGate.studioBoot)} | findings ${Number(localGate.studioBoot.findingCount ?? 0) || 0}`);
  }
  return parts.join(' | ');
}

function formatQAEvidenceFreshness(freshnessClass = '') {
  const normalized = String(freshnessClass || '').trim();
  if (normalized === 'live_canonical') return 'Live canonical';
  if (normalized === 'derived_current') return 'Derived current';
  if (normalized === 'stale') return 'Stale';
  if (normalized === 'missing') return 'Missing';
  if (normalized === 'non_executable') return 'Non-executable';
  return normalized || 'Unknown';
}

function toneForQAEvidenceFreshness(freshnessClass = '') {
  const normalized = String(freshnessClass || '').trim();
  if (normalized === 'live_canonical' || normalized === 'derived_current') return 'good';
  if (normalized === 'stale') return 'warn';
  return 'bad';
}

function renderQAEvidenceProvenanceChips(trace = null, emptyState = null) {
  const provenance = buildQaEvidenceProvenance(trace);
  if (!provenance.hasRenderableProvenance) {
    return emptyState ? h('div', { className: 'signal-meta muted' }, emptyState) : null;
  }
  return h('div', { className: 'qa-metric-pill-row qa-evidence-provenance-row' },
    provenance.chips.map((chip) => h('span', {
      key: `${chip.label}-${chip.value}`,
      className: `qa-metric-pill tone-${chip.tone || 'neutral'}`,
      title: `${chip.label}: ${chip.value}`,
    }, `${chip.label} ${chip.value}`)),
  );
}

function renderQASummaryProvenanceChips(trace = null, fallbackLabel = 'Derived summary') {
  const provenance = buildQaEvidenceProvenance(trace, { fallbackLabel });
  if (provenance.hasRenderableProvenance) {
    return h('div', { className: 'qa-metric-pill-row qa-summary-provenance-row' },
      provenance.chips.map((chip) => h('span', {
        key: `${chip.label}-${chip.value}`,
        className: `qa-metric-pill tone-${chip.tone || 'neutral'}`,
        title: `${chip.label}: ${chip.value}`,
      }, `${chip.label} ${chip.value}`)),
    );
  }
  if (!provenance.fallbackLabel) return null;
  return h('div', { className: 'qa-metric-pill-row qa-summary-provenance-row' },
    h('span', {
      className: 'qa-metric-pill tone-neutral',
      title: 'Summary is locally shaped rather than directly governed',
    }, provenance.fallbackLabel),
  );
}

function renderTruthKernelProvenanceRail(truthKernel = EMPTY_TRUTH_KERNEL) {
  const provenance = buildTruthKernelProvenancePresentation(truthKernel);
  if (!provenance.hasGovernedProvenance && provenance.chips.length === 0) {
    return h('div', { className: 'qa-metric-pill-row truth-kernel-provenance-row' },
      h('span', {
        className: 'qa-metric-pill tone-neutral',
        title: 'Truth kernel provenance is not available yet',
      }, provenance.fallbackLabel || 'No governed provenance'),
    );
  }
  return h('div', { className: 'qa-metric-pill-row truth-kernel-provenance-row' },
    !provenance.hasGovernedProvenance ? h('span', {
      key: 'fallback',
      className: 'qa-metric-pill tone-neutral',
      title: 'Truth kernel provenance is not available yet',
    }, provenance.fallbackLabel || 'No governed provenance') : null,
    provenance.chips.slice(0, 8).map((chip) => h('span', {
      key: `${chip.label}-${chip.value}`,
      className: `qa-metric-pill tone-${chip.tone || 'neutral'}`,
      title: `${chip.label}: ${chip.value}`,
    }, `${chip.label} ${chip.value}`)),
  );
}

function formatQATestValidity(validityClass = '') {
  const normalized = String(validityClass || '').trim();
  if (normalized === 'executable') return 'Executable';
  if (normalized === 'missing_dependency') return 'Missing dependency';
  if (normalized === 'stale_target') return 'Stale target';
  if (normalized === 'deprecated') return 'Deprecated';
  if (normalized === 'unknown_owner') return 'Unknown owner';
  return normalized || 'Unknown';
}

function toneForQATestValidity(validityClass = '') {
  const normalized = String(validityClass || '').trim();
  if (normalized === 'executable') return 'good';
  if (normalized === 'stale_target') return 'warn';
  if (normalized === 'missing_dependency' || normalized === 'unknown_owner') return 'bad';
  if (normalized === 'deprecated') return 'neutral';
  return 'warn';
}

function renderQAEvidenceSource(source = null, options = {}) {
  if (!source) return null;
  const trace = normalizeQAEvidenceTracePayload(source);
  const generatedBy = trace.generatedBy
    ? [trace.generatedBy.system, trace.generatedBy.module].filter(Boolean).join(' | ')
    : '';
  const sourceArtifacts = Array.isArray(trace.sourceArtifacts) ? trace.sourceArtifacts : [];
  const provenanceRow = renderQAEvidenceProvenanceChips({
    ...trace,
    classification: trace.sourceClass || trace.freshnessClass || null,
    sourcePath: trace.sourcePath || null,
  });
  return h('div', {
    key: options.key || `${trace.kind || 'qa-source'}-${trace.sourcePath || trace.label || 'source'}`,
    className: 'desk-panel-item qa-evidence-source',
    'data-qa': options.dataQa || 'qa-evidence-source',
  },
    h('div', { className: 'inline review-header' },
      h('div', null,
    h('div', { className: 'signal-summary' }, trace.label || trace.kind || 'QA evidence'),
    trace.detail ? h('div', { className: 'signal-meta muted' }, trace.detail) : null,
      ),
      h('span', { className: `qa-metric-pill tone-${toneForQAEvidenceFreshness(trace.freshnessClass)}` }, formatQAEvidenceFreshness(trace.freshnessClass)),
    ),
    provenanceRow,
    h('div', { className: 'signal-meta muted' }, `Source: ${trace.sourcePath || 'unknown'}`),
    generatedBy ? h('div', { className: 'signal-meta muted' }, `Generated by: ${generatedBy}`) : null,
    trace.observedAt ? h('div', { className: 'signal-meta muted' }, `Observed: ${formatTimestamp(trace.observedAt)}`) : null,
    trace.derivedFrom ? h('div', { className: 'signal-meta muted' }, `Derived from: ${trace.derivedFrom}`) : null,
    sourceArtifacts.length
      ? h('div', { className: 'signal-meta muted' }, `Source artifacts: ${sourceArtifacts.map((artifact) => artifact.label || artifact.path || 'artifact').join(' | ')}`)
      : null,
  );
  }

function formatQAAuditStatus(status = '') {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'ok') return 'OK';
  if (value === 'stale') return 'STALE';
  if (value === 'missing') return 'MISSING';
  if (value === 'mismatch') return 'MISMATCH';
  return value ? value.toUpperCase() : 'OK';
}

function toneForQAAuditStatus(status = '') {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'ok') return 'good';
  if (value === 'stale') return 'warn';
  if (value === 'missing' || value === 'mismatch') return 'bad';
  return 'neutral';
}

function renderQAAuditTrailSummary(auditTrail = null) {
  const trail = normalizeQAAuditTrailPayload(auditTrail);
  const summary = trail?.summary || {};
  return h('div', { className: 'qa-metric-pill-row', 'data-qa': 'qa-audit-summary' },
    h('span', { className: 'qa-metric-pill tone-good' }, `OK ${Number(summary.ok || 0)}`),
    h('span', { className: 'qa-metric-pill tone-warn' }, `Stale ${Number(summary.stale || 0)}`),
    h('span', { className: 'qa-metric-pill tone-bad' }, `Missing ${Number(summary.missing || 0)}`),
    h('span', { className: 'qa-metric-pill tone-bad' }, `Mismatch ${Number(summary.mismatch || 0)}`),
    h('span', { className: 'qa-metric-pill tone-neutral' }, `Total ${Number(summary.total || 0)}`),
  );
}

function renderQAAuditTrailList(auditTrail = null, emptyState = 'No QA audit trail is recorded yet.') {
  const trail = normalizeQAAuditTrailPayload(auditTrail);
  const entries = Array.isArray(trail?.entries) ? [...trail.entries] : [];
  if (!entries.length) {
    return h('div', { className: 'signal-empty muted', 'data-qa': 'qa-audit-trail-empty' }, emptyState);
  }
  const statusOrder = {
    mismatch: 0,
    missing: 1,
    stale: 2,
    ok: 3,
  };
  const sortedEntries = [...entries].sort((left, right) => {
    const leftRank = Object.prototype.hasOwnProperty.call(statusOrder, left.status) ? statusOrder[left.status] : 2;
    const rightRank = Object.prototype.hasOwnProperty.call(statusOrder, right.status) ? statusOrder[right.status] : 2;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return String(left.kind || left.label || '').localeCompare(String(right.kind || right.label || ''));
  });
  return h('div', { className: 'desk-panel-list utility-list qa-audit-trail-list', 'data-qa': 'qa-audit-trail-list' },
    sortedEntries.map((entry, index) => h('div', {
      key: `${entry.kind || 'audit'}-${entry.label || index}`,
      className: `desk-panel-item utility-card qa-audit-card status-${entry.status || 'ok'}`,
      'data-status': entry.status || 'ok',
    },
      h('div', { className: 'inline review-header' },
        h('div', null,
          h('div', { className: 'signal-summary' }, entry.label || entry.kind || 'QA output'),
          h('div', { className: 'signal-meta muted' }, entry.kind || 'qa-output'),
        ),
        h('span', { className: `qa-metric-pill tone-${toneForQAAuditStatus(entry.status)}` }, formatQAAuditStatus(entry.status)),
      ),
      h('div', { className: 'signal-meta muted' }, `Generated at: ${entry.generatedAt ? formatTimestamp(entry.generatedAt) : 'unknown'}`),
      entry.generator ? h('div', { className: 'signal-meta muted' }, `Generated by: ${[entry.generator.system, entry.generator.module].filter(Boolean).join(' | ') || 'unknown'}`) : null,
      h('div', { className: 'signal-meta muted' }, `Freshness: ${formatQAEvidenceFreshness(entry.freshnessClass)}`),
      entry.detail ? h('div', { className: 'signal-meta muted' }, entry.detail) : null,
      entry.sourceArtifacts?.length
        ? h('div', { className: 'signal-meta muted' }, `Source artifacts: ${entry.sourceArtifacts.map((artifact) => artifact.label || artifact.path || 'artifact').join(' | ')}`)
        : null,
      entry.mismatchReason ? h('div', { className: 'signal-meta error' }, entry.mismatchReason) : null,
    )),
  );
}

function renderQATestRegistrySummary(registrySummary = null) {
  const summary = normalizeRenderObject(registrySummary);
  const total = Number(summary.total ?? 0) || 0;
  const executable = Number(summary.executable ?? 0) || 0;
  const missingDependency = Number(summary.missingDependency ?? 0) || 0;
  const staleTarget = Number(summary.staleTarget ?? 0) || 0;
  const deprecated = Number(summary.deprecated ?? 0) || 0;
  const unknownOwner = Number(summary.unknownOwner ?? 0) || 0;
  return h('div', { className: 'qa-metric-pill-row', 'data-qa': 'qa-test-registry-summary' },
    h('span', { className: 'qa-metric-pill tone-good' }, `Executable ${executable}`),
    h('span', { className: 'qa-metric-pill tone-warn' }, `Stale ${staleTarget}`),
    h('span', { className: 'qa-metric-pill tone-bad' }, `Missing deps ${missingDependency}`),
    h('span', { className: 'qa-metric-pill tone-neutral' }, `Deprecated ${deprecated}`),
    h('span', { className: 'qa-metric-pill tone-bad' }, `Unknown owner ${unknownOwner}`),
    h('span', { className: 'qa-metric-pill tone-neutral' }, `Total ${total}`),
  );
}

function renderQAExternalValidationBlock(externalValidation = null) {
  const validation = normalizeQAExternalValidationPayload(externalValidation);
  if (!validation) {
    return h('div', { className: 'signal-empty muted', 'data-qa': 'qa-external-validation-empty' }, 'No external validation snapshot is available yet.');
  }
  const statusTone = validation.status === 'pass'
    ? 'good'
    : (validation.status === 'fail' ? 'bad' : 'neutral');
  const probeTone = validation.probeStatus === 'ok'
    ? 'good'
    : (validation.probeStatus === 'timeout' ? 'warn' : 'bad');
  return h('div', { className: 'desk-panel-item qa-external-validation-card', 'data-qa': 'qa-external-validation' },
    h('div', { className: 'signal-summary' }, 'External validation'),
    h('div', { className: 'signal-meta muted' }, `Status: ${validation.status} | Match: ${validation.statusMatch ? 'yes' : 'no'} | Freshness known: ${validation.freshnessKnown ? 'yes' : 'no'}`),
    h('div', { className: 'qa-metric-pill-row' },
      h('span', { className: `qa-metric-pill tone-${statusTone}` }, validation.status),
      h('span', { className: `qa-metric-pill tone-${probeTone}` }, `Probe ${validation.probeStatus}`),
      h('span', { className: 'qa-metric-pill tone-neutral' }, validation.lastCheckedAt ? `Checked ${formatTimestamp(validation.lastCheckedAt)}` : 'Checked —'),
    ),
    h('div', { className: 'signal-meta muted' }, [
      `Source: ${validation.source}`,
      validation.mcpEvidenceSource ? `evidence: ${validation.mcpEvidenceSource}` : null,
      validation.usedFallback == null ? null : `fallback: ${validation.usedFallback ? 'yes' : 'no'}`,
      validation.probeTarget ? `target: ${validation.probeTarget}` : null,
    ].filter(Boolean).join(' | ')),
    validation.errorMessage ? h('div', { className: 'signal-meta error' }, validation.errorMessage) : null,
    validation.notes.length
      ? h('ul', { className: 'signal-list compact' }, validation.notes.slice(0, 4).map((note, index) => h('li', { key: `qa-external-validation-note-${index}` }, note)))
      : h('div', { className: 'signal-meta muted' }, 'No comparison notes recorded.'),
  );
}

function formatQAInvestigationEvidenceHint(investigation = null) {
  const record = normalizeQAInvestigationPayload(investigation);
  const externalStatus = record?.evidence?.external?.status || record?.evidence?.external?.result || 'unknown';
  const internalStatus = record?.evidence?.internal?.status || 'unknown';
  return `internal=${internalStatus} / external=${externalStatus}`;
}

function formatQAInvestigationResearchHint(investigation = null) {
  const record = normalizeQAInvestigationPayload(investigation);
  if (!record) {
    return null;
  }
  const latestResearchAt = record.latest_research_at ? formatTimestamp(record.latest_research_at) : null;
  if (record.research_available) {
    return latestResearchAt ? `Research available - ${latestResearchAt}` : 'Research available';
  }
  if (record.research_status === 'unavailable') {
    return latestResearchAt ? `Research unavailable - ${latestResearchAt}` : 'Research unavailable';
  }
  return null;
}

function renderQAInvestigationInboxBlock(investigations = null) {
  const items = normalizeQAInvestigationsPayload(investigations);
  if (!items.length) {
    return h('div', { className: 'signal-empty muted', 'data-qa': 'qa-investigations-empty' }, 'No open QA investigations are recorded yet.');
  }
  const openItems = items.filter((item) => item.status === 'open').slice(0, 5);
  if (!openItems.length) {
    return h('div', { className: 'signal-empty muted', 'data-qa': 'qa-investigations-empty' }, 'No open QA investigations are recorded yet.');
  }
  return h('div', { className: 'desk-panel-item qa-investigations-card', 'data-qa': 'qa-investigations' },
    h('div', { className: 'signal-summary' }, `Investigations (${openItems.length})`),
    h('div', { className: 'signal-meta muted' }, 'Read-only inbox of unresolved QA contradictions.'),
    h('div', { className: 'desk-panel-list utility-list qa-investigation-list' },
      openItems.map((item, index) => {
        const researchHint = formatQAInvestigationResearchHint(item);
        return h('div', {
          key: item.id || `${item.trigger}-${index}`,
          className: `desk-panel-item utility-card qa-investigation-card severity-${item.severity || 'medium'}`,
          'data-status': item.status || 'open',
        },
          h('div', { className: 'inline review-header' },
            h('div', null,
              h('div', { className: 'signal-summary' }, item.summary || 'QA investigation'),
              h('div', { className: 'signal-meta muted' }, `Trigger: ${item.trigger || 'external_mismatch'}`),
            ),
            h('div', { className: 'qa-metric-pill-row' },
              h('span', { className: 'qa-metric-pill tone-neutral' }, item.severity || 'medium'),
              h('span', { className: 'qa-metric-pill tone-neutral' }, `x${item.repeat_count || 1}`),
            ),
          ),
          h('div', { className: 'signal-meta muted' }, `Created: ${item.first_seen_at || item.created_at ? formatTimestamp(item.first_seen_at || item.created_at) : 'unknown'}`),
          item.last_seen_at ? h('div', { className: 'signal-meta muted' }, `Last seen: ${formatTimestamp(item.last_seen_at)}`) : null,
          h('div', { className: 'signal-meta muted' }, `Status: ${item.status || 'open'}`),
          h('div', { className: 'signal-meta muted' }, formatQAInvestigationEvidenceHint(item)),
          researchHint ? h('div', { className: 'signal-meta muted' }, researchHint) : null,
        );
      }),
    ),
  );
}

function renderQATestRegistryList(testRegistry = null, emptyState = 'No QA tests are registered yet.') {
  const registry = normalizeQATestRegistryPayload(testRegistry);
  const entries = Array.isArray(registry?.entries) ? [...registry.entries] : [];
  if (!entries.length) {
    return h('div', { className: 'signal-empty muted', 'data-qa': 'qa-test-registry-empty' }, emptyState);
  }
  const validityOrder = {
    missing_dependency: 0,
    stale_target: 1,
    deprecated: 2,
    unknown_owner: 3,
    executable: 4,
  };
  const sortedEntries = [...entries].sort((left, right) => {
    const leftRank = Object.prototype.hasOwnProperty.call(validityOrder, left.validityClass) ? validityOrder[left.validityClass] : 1;
    const rightRank = Object.prototype.hasOwnProperty.call(validityOrder, right.validityClass) ? validityOrder[right.validityClass] : 1;
    if (leftRank !== rightRank) return leftRank - rightRank;
    const leftOwner = String(left.owner?.label || left.deskLabel || left.deskId || '').toLowerCase();
    const rightOwner = String(right.owner?.label || right.deskLabel || right.deskId || '').toLowerCase();
    if (leftOwner !== rightOwner) return leftOwner.localeCompare(rightOwner);
    return String(left.testName || left.testId || '').localeCompare(String(right.testName || right.testId || ''));
  });
  return h('div', { className: 'desk-panel-list utility-list qa-test-registry-list', 'data-qa': 'qa-test-registry-list' },
    sortedEntries.map((entry, index) => {
      const sourcePath = entry.source?.modulePath || entry.source?.runtimePath || 'unknown source';
      const runtimePath = entry.source?.runtimePath || 'unknown runtime';
      const ownerLabel = entry.owner?.label || entry.deskLabel || 'Unknown owner';
      const ownerDetail = entry.owner?.module || entry.source?.modulePath || null;
      return h('div', {
        key: entry.id || `${entry.deskId || 'unknown'}-${entry.testId || index}`,
        className: `desk-panel-item utility-card qa-test-registry-card validity-${entry.validityClass || 'stale_target'}`,
        'data-validity': entry.validityClass || 'stale_target',
      },
        h('div', { className: 'inline review-header' },
          h('div', null,
            h('div', { className: 'signal-summary' }, entry.testName || entry.testId || 'Unnamed QA test'),
            h('div', { className: 'signal-meta muted' }, `${ownerLabel}${ownerDetail ? ` | ${ownerDetail}` : ''}`),
          ),
          h('span', { className: `qa-metric-pill tone-${toneForQATestValidity(entry.validityClass)}` }, formatQATestValidity(entry.validityClass)),
        ),
        h('div', { className: 'signal-meta muted' }, `Source: ${sourcePath}`),
        h('div', { className: 'signal-meta muted' }, `Runtime: ${runtimePath}`),
        h('div', { className: 'signal-meta muted' }, `Current status: ${entry.currentStatus || 'missing'}`),
        h('div', { className: 'signal-meta muted' }, `Last execution: ${entry.lastExecutionAt ? formatTimestamp(entry.lastExecutionAt) : 'unknown'}`),
        entry.validityReason ? h('div', { className: `signal-meta ${entry.validityClass === 'executable' ? 'muted' : 'error'}` }, entry.validityReason) : null,
      );
    }),
  );
}

function renderDeskSection(rawSection, helpers = {}) {
    const section = normalizeDeskSectionPayload(rawSection);
    if (!section.kind) return null;
  if (section.kind === 'qa-overview') {
    const overview = normalizeRenderObject(section.overview);
    const metricRow = (label, value) => h('div', { className: 'criteria-row' }, h('span', null, label), h('span', { className: 'muted' }, value));
    const statusTone = overview.status === 'pass' ? 'good' : (overview.status === 'warn' ? 'warn' : (overview.status === 'fail' ? 'bad' : 'neutral'));
    const structuredTone = overview.structuredStatus === 'pass' ? 'good' : (overview.structuredStatus === 'fail' ? 'bad' : 'neutral');
    const externalTone = overview.externalStatus === 'pass' ? 'good' : (overview.externalStatus === 'fail' ? 'bad' : 'neutral');
    return h('div', { key: section.id, className: 'inspector-block panel-card qa-overview-panel' },
      h('div', { className: 'inspector-label' }, section.label),
      h('div', { className: 'signal-summary' }, section.summary || 'Overall QA health at a glance.'),
      h('div', { className: 'qa-metric-pill-row truth-surface-banner' },
        h('span', { className: 'qa-metric-pill tone-good' }, 'Adjudicated QA posture'),
        h('span', { className: `qa-metric-pill tone-${statusTone}` }, `Overall ${overview.status || 'unknown'}`),
        h('span', { className: `qa-metric-pill tone-${structuredTone}` }, `Structured ${overview.structuredStatus || 'unknown'}`),
        h('span', { className: `qa-metric-pill tone-${externalTone}` }, `External ${overview.externalStatus || 'unknown'}`),
      ),
      h('div', { className: 'qa-metric-pill-row' },
        h('span', { className: 'qa-metric-pill tone-neutral' }, `Investigations ${Number(overview.openInvestigationsCount || 0)}`),
        h('span', { className: 'qa-metric-pill tone-neutral' }, `Recurring ${Number(overview.recurringInvestigationsCount || 0)}`),
        h('span', { className: 'qa-metric-pill tone-neutral' }, `Research-backed ${Number(overview.researchBackedInvestigationsCount || 0)}`),
      ),
      h('div', { className: 'criteria-list desk-metric-list' },
        metricRow('Structured updated', overview.latestStructuredAt ? formatTimestamp(overview.latestStructuredAt) : 'unknown'),
        metricRow('External checked', overview.latestExternalAt ? formatTimestamp(overview.latestExternalAt) : 'unknown'),
        metricRow('Research updated', overview.latestResearchAt ? formatTimestamp(overview.latestResearchAt) : 'unknown'),
      ),
      overview.notes?.length
        ? h('ul', { className: 'signal-list compact' }, overview.notes.slice(0, 4).map((note, index) => h('li', { key: `${section.id}-note-${index}` }, note)))
        : h('div', { className: 'signal-empty muted' }, 'No QA summary notes surfaced yet.'),
    );
  }
  if (section.kind === 'qa-hygiene') {
    const surfaces = normalizeRenderList(section.surfaces).map((surface) => normalizeQAHygieneSurfacePayload(surface));
    return h('div', { key: section.id, className: 'inspector-block panel-card qa-hygiene-panel' },
      h('div', { className: 'inspector-label' }, section.label),
      h('div', { className: 'signal-summary' }, section.summary || 'Freshness, provenance, and coverage by surface.'),
      surfaces.length
        ? h('div', { className: 'desk-panel-list utility-list qa-hygiene-list' },
            surfaces.map((surface) => h('details', {
              key: surface.surface_id || surface.label,
              className: `desk-panel-item utility-card qa-hygiene-card status-${surface.status || 'unknown'} freshness-${surface.freshness || 'unknown'}`,
            },
              h('summary', { className: 'inline review-header' },
                h('div', null,
                  h('div', { className: 'signal-summary' }, surface.label || 'Surface'),
                  h('div', { className: 'signal-meta muted' }, surface.coverage_hint || 'No coverage hint surfaced.'),
                ),
                h('div', { className: 'qa-metric-pill-row' },
                  h('span', { className: `qa-metric-pill tone-${surface.status === 'pass' ? 'good' : (surface.status === 'warn' ? 'warn' : (surface.status === 'fail' ? 'bad' : 'neutral'))}` }, surface.status || 'unknown'),
                  h('span', { className: `qa-metric-pill tone-${surface.freshness === 'fresh' ? 'good' : (surface.freshness === 'stale' ? 'warn' : (surface.freshness === 'missing' ? 'bad' : 'neutral'))}` }, surface.freshness || 'unknown'),
                ),
              ),
              h('div', { className: 'signal-meta muted' }, `Source: ${surface.source || 'unknown'}`),
              h('div', { className: 'signal-meta muted' }, `Last updated: ${surface.last_updated ? formatTimestamp(surface.last_updated) : 'unknown'}`),
              surface.notes?.length
                ? h('ul', { className: 'signal-list compact' }, surface.notes.slice(0, 4).map((note, index) => h('li', { key: `${surface.surface_id || 'surface'}-note-${index}` }, note)))
                : h('div', { className: 'signal-empty muted' }, 'No additional surface notes recorded.'),
            )))
        : h('div', { className: 'signal-empty muted' }, section.emptyState || 'No hygiene surfaces recorded yet.'),
    );
  }
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
            section.evidenceSummary ? h('div', { className: 'signal-meta muted' }, `Evidence freshness: ${section.evidenceSummary.liveCanonical || 0} live canonical | ${section.evidenceSummary.derivedCurrent || 0} derived current | ${section.evidenceSummary.stale || 0} stale | ${section.evidenceSummary.missing || 0} missing | ${section.evidenceSummary.nonExecutable || 0} non-executable`) : null,
            (section.evidenceSources || []).length ? h('div', { className: 'desk-panel-list' }, section.evidenceSources.map((source, index) => renderQAEvidenceSource(source, { key: `${section.id}-evidence-${index}` }))) : null,
          )
        : h('div', { className: 'signal-empty muted' }, section.emptyState || 'No QA summary recorded yet.'),
    );
  }
  if (section.kind === 'qa-mcp-live') {
    const liveStatus = normalizeQAMcpLiveStatusPayload(section.liveStatus || section.mcpLiveStatus || null);
    const liveCycle = normalizeQALiveCyclePayload(section.liveCycle || section.qaLiveCycle || null);
    const metricRow = (label, value) => h('div', { className: 'criteria-row' }, h('span', null, label), h('span', { className: 'muted' }, value));
    const statusTone = liveStatus.status === 'live'
      ? 'good'
      : (liveStatus.status === 'reachable_but_idle'
          ? 'neutral'
          : (liveStatus.status === 'stale'
              ? 'warn'
              : (['degraded', 'offline'].includes(liveStatus.status) ? 'bad' : 'neutral')));
    const reachabilityLabel = liveStatus.mcp_configured
      ? (liveStatus.mcp_reachable ? 'reachable' : 'not reachable')
      : 'not configured';
    const usageLabel = liveStatus.usage_state === 'active_gating'
      ? 'active MCP gating'
      : (liveStatus.usage_state === 'configured_but_unused'
          ? 'configured but unused'
          : liveStatus.usage_state.replace(/_/g, ' '));
    return h('div', {
      key: section.id,
      className: `inspector-block panel-card qa-mcp-live-panel status-${liveStatus.status || 'offline'}`,
      'data-qa': 'qa-mcp-live',
    },
      h('div', { className: 'inline review-header' },
        h('div', null,
          h('div', { className: 'inspector-label' }, section.label),
          h('div', { className: 'signal-summary' }, section.summary || liveStatus.summary || 'QA MCP proof-of-life has not been recorded yet.'),
        ),
        h('div', { className: 'qa-metric-pill-row' },
          h('span', { className: `qa-metric-pill tone-${statusTone}` }, liveStatus.status || 'offline'),
          h('span', { className: `qa-metric-pill tone-${liveStatus.mcp_reachable ? 'good' : (liveStatus.mcp_configured ? 'warn' : 'bad')}` }, reachabilityLabel),
          h('span', { className: `qa-metric-pill tone-${liveStatus.using_mcp_for_qa_decisions ? 'good' : 'neutral'}` }, usageLabel),
        ),
      ),
      h('div', { className: 'criteria-list desk-metric-list' },
        metricRow('Heartbeat', liveStatus.heartbeat_at ? formatTimestamp(liveStatus.heartbeat_at) : 'unknown'),
        metricRow('Last completed cycle', liveCycle.latest_completed_cycle_id
          ? `${liveCycle.latest_completed_cycle_id} @ ${formatTimestamp(liveCycle.latest_completed_cycle_at || liveStatus.last_completed_cycle_at)}`
          : (liveStatus.last_completed_cycle_at ? formatTimestamp(liveStatus.last_completed_cycle_at) : 'unknown')),
        metricRow('Configured tools', liveStatus.configured_tools.length ? liveStatus.configured_tools.join(' | ') : 'none'),
        metricRow('Last ping', liveStatus.last_ping_at ? `${liveStatus.last_ping_status || 'unknown'} @ ${formatTimestamp(liveStatus.last_ping_at)}` : (liveStatus.mcp_configured ? 'not yet recorded' : 'not configured')),
        metricRow('Ping target', liveStatus.last_ping_target || 'unknown'),
        metricRow('Research call', liveStatus.research_last_call_at ? `${liveStatus.research_last_call_status || 'unknown'} @ ${formatTimestamp(liveStatus.research_last_call_at)}` : 'not yet recorded'),
        metricRow('Last MCP call', liveStatus.last_call_at ? `${liveStatus.last_call_tool || 'unknown'} | ${liveStatus.last_call_status || 'unknown'} @ ${formatTimestamp(liveStatus.last_call_at)}` : 'not yet recorded'),
        metricRow('Last QA gate source', liveStatus.last_qa_gate_source || 'unknown'),
        metricRow('Feed captured', liveCycle.ran_once ? (liveCycle.output_feed_captured ? 'yes' : 'no') : 'not yet'),
        metricRow('Freshness', liveStatus.freshness || 'unknown'),
        metricRow('Current failure', liveStatus.current_failure_kind ? `${liveStatus.current_failure_kind}${liveStatus.current_failure_tool ? ` via ${liveStatus.current_failure_tool}` : ''}` : 'none'),
        metricRow('Recovery', liveStatus.recovery_detected ? `${liveStatus.recovered_from_kind || 'previous failure'} recovered @ ${formatTimestamp(liveStatus.recovered_at)}` : 'not detected'),
      ),
      liveStatus.notes.length
        ? h('ul', { className: 'signal-list compact' }, liveStatus.notes.slice(0, 4).map((note, index) => h('li', { key: `${section.id}-note-${index}` }, note)))
        : h('div', { className: 'signal-empty muted' }, 'No proof-of-life notes recorded yet.'),
    );
  }
  if (section.kind === 'qa-operator') {
    const lead = normalizeQALeadRunnerPayload(section.lead || section.qaLead || null);
    const liveStatus = normalizeQAMcpLiveStatusPayload(lead.live_status || null);
    const liveCycle = normalizeQALiveCyclePayload(section.liveCycle || section.qaLiveCycle || null);
    const metricRow = (label, value) => h('div', { className: 'criteria-row' }, h('span', null, label), h('span', { className: 'muted' }, value));
    const statusTone = lead.status === 'live'
      ? 'good'
      : (['degraded', 'offline', 'stale'].includes(lead.status) ? 'bad' : 'neutral');
    return h('div', {
      key: section.id,
      className: `inspector-block panel-card qa-operator-panel status-${lead.status || 'idle'}`,
      'data-qa': 'qa-operator',
    },
      h('div', { className: 'inline review-header' },
        h('div', null,
          h('div', { className: 'inspector-label' }, section.label),
          h('div', { className: 'signal-summary' }, section.summary || lead.summary || 'QA lead automation is not running yet.'),
        ),
        h('div', { className: 'qa-metric-pill-row' },
          h('span', { className: `qa-metric-pill tone-${statusTone}` }, lead.status || 'idle'),
          h('span', { className: `qa-metric-pill tone-${lead.active_tools.length ? 'good' : 'neutral'}` }, lead.active_tools.length ? `${lead.active_tools.length} tools` : 'No tools'),
          h('span', { className: `qa-metric-pill tone-${liveStatus.using_mcp_for_qa_decisions ? 'good' : 'neutral'}` }, liveStatus.using_mcp_for_qa_decisions ? 'MCP gating' : 'Read-only'),
        ),
      ),
      h('div', { className: 'criteria-list desk-metric-list' },
        metricRow('Current task', lead.current_task || 'QA lead automation idle.'),
        metricRow('Batch', lead.current_batch || lead.id || 'unknown'),
        metricRow('Last completed cycle', liveCycle.latest_completed_cycle_id
          ? `${liveCycle.latest_completed_cycle_id} @ ${formatTimestamp(liveCycle.latest_completed_cycle_at || lead.last_completed_cycle_at)}`
          : (lead.last_completed_cycle_at ? formatTimestamp(lead.last_completed_cycle_at) : 'unknown')),
        metricRow('Cycle result', liveCycle.ran_once ? (liveCycle.latest_completed_status || 'unknown') : (lead.status || 'idle')),
        metricRow('External status', liveCycle.external_status || 'unknown'),
        metricRow('Feed captured', liveCycle.ran_once
          ? (liveCycle.output_feed_captured
              ? `yes${liveCycle.latest_feed_entry_id ? ` (${liveCycle.latest_feed_entry_id})` : ''}`
              : 'no')
          : 'not yet'),
        metricRow('Started at', lead.started_at ? formatTimestamp(lead.started_at) : 'unknown'),
        metricRow('Finished at', lead.finished_at ? formatTimestamp(lead.finished_at) : 'unknown'),
        metricRow('Result paths', Object.keys(lead.result_paths || {}).length ? Object.values(lead.result_paths).filter(Boolean).join(' | ') : 'No result paths recorded yet.'),
        metricRow('Active tools', lead.active_tools.length ? lead.active_tools.join(' | ') : 'none'),
        metricRow('Live gate source', liveCycle.current_gate_source || liveStatus.last_qa_gate_source || 'unknown'),
      ),
      lead.failure_reason ? h('div', { className: 'signal-meta error' }, lead.failure_reason) : null,
      liveCycle.output_feed_captured || lead.output_feed.length
        ? h('div', { className: 'signal-meta muted' }, `Latest output feed is available in the QA Output Feed section and executor read-only surfaces.`)
        : h('div', { className: 'signal-empty muted' }, liveCycle.ran_once ? 'The latest completed cycle has not been captured in the QA output feed yet.' : 'No QA output feed has been captured yet.'),
    );
  }
  if (section.kind === 'qa-output-feed') {
    const feed = normalizeRenderList(section.feed || section.items || []).map((item) => normalizeQALeadFeedItem(item));
    const liveCycle = normalizeQALiveCyclePayload(section.liveCycle || section.qaLiveCycle || null);
    return h('details', {
      key: section.id,
      className: 'inspector-block panel-card qa-output-feed-panel',
      open: Boolean(section.defaultOpen),
      'data-qa': 'qa-output-feed',
    },
      h('summary', { className: 'inline review-header' },
        h('div', null,
          h('div', { className: 'inspector-label' }, section.label),
          h('div', { className: 'signal-summary' }, section.summary || section.emptyState || 'QA output feed is empty until the lead run completes.'),
        ),
        h('div', { className: 'qa-metric-pill-row' },
          h('span', { className: 'qa-metric-pill tone-neutral' }, `Items ${feed.length}`),
          h('span', { className: `qa-metric-pill tone-${liveCycle.ran_once ? (liveCycle.output_feed_captured ? 'good' : 'bad') : 'neutral'}` }, liveCycle.ran_once ? (liveCycle.output_feed_captured ? 'Latest cycle captured' : 'Latest cycle missing') : 'Awaiting cycle'),
          h('span', { className: `qa-metric-pill tone-${feed.some((item) => ['degraded', 'blocked', 'fail', 'failed', 'error'].includes(String(item.status || '').toLowerCase())) ? 'bad' : 'good'}` }, feed.some((item) => ['degraded', 'blocked', 'fail', 'failed', 'error'].includes(String(item.status || '').toLowerCase())) ? 'Has failures' : 'Healthy'),
        ),
      ),
      feed.length
        ? h('div', { className: 'desk-panel-list utility-list qa-output-feed-list' },
            feed.slice(0, 8).map((item, index) => h('details', {
              key: item.id || `${section.id}-${index}`,
              className: `desk-panel-item utility-card qa-output-feed-card status-${item.status || 'unknown'}`,
            },
              h('summary', { className: 'inline review-header' },
                h('div', null,
                  h('div', { className: 'signal-summary' }, item.label || item.tool || 'QA tool result'),
                  h('div', { className: 'signal-meta muted' }, `${item.tool || 'qa_tool'} | ${item.result || item.verdict || item.status || 'unknown'}`),
                ),
                h('span', { className: `qa-metric-pill tone-${['validated', 'available', 'pass'].includes(String(item.result || item.verdict || item.status || '').toLowerCase()) ? 'good' : (['degraded', 'blocked', 'fail', 'failed', 'error', 'unavailable'].includes(String(item.result || item.verdict || item.status || '').toLowerCase()) ? 'bad' : 'neutral')}` }, item.result || item.verdict || item.status || 'unknown'),
              ),
              h('div', { className: 'signal-meta muted' }, item.summary || 'No summary recorded.'),
              item.detail ? h('div', { className: 'signal-meta muted' }, item.detail) : null,
              item.createdAt || item.observed_at ? h('div', { className: 'signal-meta muted' }, `Created: ${formatTimestamp(item.createdAt || item.observed_at)}`) : null,
              item.meta && (
                item.meta.investigationCount !== undefined
                || item.meta.failedChecks !== undefined
                || item.meta.activeLanes !== undefined
                || item.meta.externalStatus
                || item.meta.mcpEvidenceSource
                || item.meta.usedFallback !== null
              )
                ? h('div', { className: 'signal-meta muted' }, [
                    Number.isFinite(Number(item.meta.investigationCount)) ? `${Number(item.meta.investigationCount)} investigations` : null,
                    Number.isFinite(Number(item.meta.failedChecks)) ? `${Number(item.meta.failedChecks)} failed check${Number(item.meta.failedChecks) === 1 ? '' : 's'}` : null,
                    Number.isFinite(Number(item.meta.activeLanes)) ? `${Number(item.meta.activeLanes)} active lanes` : null,
                    item.meta.externalStatus ? `external: ${item.meta.externalStatus}` : null,
                    item.meta.mcpEvidenceSource ? `evidence: ${item.meta.mcpEvidenceSource}` : null,
                    item.meta.usedFallback !== null ? `fallback: ${item.meta.usedFallback ? 'yes' : 'no'}` : null,
                  ].filter(Boolean).join(' | '))
                : null,
              item.artifact_refs?.length
                ? h('div', { className: 'signal-meta muted' }, `Artifacts: ${item.artifact_refs.slice(0, 4).join(' | ')}`)
                : null,
              item.notes?.length
                ? h('ul', { className: 'signal-list compact' }, item.notes.slice(0, 4).map((note, noteIndex) => h('li', { key: `${item.id || 'qa-feed'}-note-${noteIndex}` }, note)))
                : null,
            )))
        : h('div', { className: 'signal-empty muted' }, section.emptyState || 'No QA output feed is available yet.'),
    );
  }
  if (section.kind === 'qa-canaries') {
    const canaries = normalizeQALaneCanaryStatePayload(section.canaries || {});
    const resultTone = (result) => (result.status === 'pass' ? 'good' : 'bad');
    return h('details', {
      key: section.id,
      className: 'inspector-block panel-card qa-canaries-panel',
      open: Boolean(section.defaultOpen),
      'data-qa': 'qa-canaries',
    },
      h('summary', { className: 'inline review-header' },
        h('div', null,
          h('div', { className: 'inspector-label' }, section.label),
          h('div', { className: 'signal-summary' }, section.summary || canaries.summary || section.emptyState || 'No QA lane canary results are recorded yet.'),
        ),
        h('div', { className: 'qa-metric-pill-row' },
          h('span', { className: `qa-metric-pill tone-${canaries.overall_status === 'pass' ? 'good' : (canaries.overall_status === 'fail' ? 'bad' : 'neutral')}` }, canaries.overall_status || 'idle'),
          h('span', { className: 'qa-metric-pill tone-neutral' }, `Passed ${canaries.passed_count || 0}`),
          h('span', { className: `qa-metric-pill tone-${Number(canaries.failed_count || 0) > 0 ? 'bad' : 'neutral'}` }, `Failed ${canaries.failed_count || 0}`),
        ),
      ),
      canaries.results.length
        ? h('div', { className: 'desk-panel-list utility-list qa-canary-list' },
            canaries.last_run_at ? h('div', { className: 'signal-meta muted' }, `Last run: ${formatTimestamp(canaries.last_run_at)}`) : null,
            canaries.results.map((result) => h('details', {
              key: result.canary_id || result.label,
              className: `desk-panel-item utility-card qa-canary-card status-${result.status || 'fail'}`,
            },
              h('summary', { className: 'inline review-header' },
                h('div', null,
                  h('div', { className: 'signal-summary' }, result.label || result.canary_id || 'Lane Canary'),
                  h('div', { className: 'signal-meta muted' }, `${result.target_lane_label || result.target_lane_id || 'unknown lane'} | ${result.owner_department || 'QA'}`),
                ),
                h('div', { className: 'qa-metric-pill-row' },
                  h('span', { className: `qa-metric-pill tone-${resultTone(result)}` }, result.status || 'fail'),
                  h('span', { className: 'qa-metric-pill tone-neutral' }, result.policy_outcome || 'policy'),
                  h('span', { className: 'qa-metric-pill tone-neutral' }, result.validation_status || 'validation'),
                ),
              ),
              h('div', { className: 'criteria-list desk-metric-list' },
                h('div', { className: 'criteria-row' }, h('span', null, 'Trigger'), h('span', { className: 'muted' }, result.trigger || 'unknown')),
                h('div', { className: 'criteria-row' }, h('span', null, 'Scope'), h('span', { className: 'muted' }, result.scoped_targets_summary || 'No scope summary surfaced.')),
                h('div', { className: 'criteria-row' }, h('span', null, 'Validation gates'), h('span', { className: 'muted' }, result.required_validation_gate_ids.length ? result.required_validation_gate_ids.join(' | ') : 'none declared')),
              ),
              result.latest_validation_summary ? h('div', { className: 'signal-meta muted' }, `Latest validation: ${result.latest_validation_summary}`) : null,
              result.checked_at ? h('div', { className: 'signal-meta muted' }, `Checked at: ${formatTimestamp(result.checked_at)}`) : null,
              result.notes.length
                ? h('ul', { className: 'signal-list compact' }, result.notes.slice(0, 4).map((note, index) => h('li', { key: `${result.canary_id || 'canary'}-note-${index}` }, note)))
                : null,
            )),
          )
        : h('div', { className: 'signal-empty muted' }, section.emptyState || 'No QA lane canary results are recorded yet.'),
    );
  }
  if (section.kind === 'qa-structured') {
    const report = section.report || null;
    const freshnessTone = report?.sourceTrace?.freshnessClass === 'fresh'
      ? 'good'
      : (report?.sourceTrace?.freshnessClass === 'stale' ? 'warn' : 'neutral');
    return h('div', { key: section.id, className: 'inspector-block panel-card review-panel' },
      h('div', { className: 'inline review-header' },
        h('div', null,
          h('div', { className: 'inspector-label' }, section.label),
          h('div', { className: 'signal-summary' }, section.busy ? 'Structured QA suite is running...' : (report?.summary || section.emptyState || 'No structured QA report loaded yet.')),
          report ? renderQASummaryProvenanceChips(report.sourceTrace, 'Derived summary') : null,
        ),
      ),
      report
        ? h(React.Fragment, null,
            h('div', { className: 'qa-metric-pill-row truth-surface-banner' },
              h('span', { className: 'qa-metric-pill tone-good' }, 'QA evidence'),
              h('span', { className: `qa-metric-pill tone-${report.status === 'pass' ? 'good' : (report.status === 'fail' ? 'bad' : 'warn')}` }, `Status ${report.status || 'unknown'}`),
              h('span', { className: `qa-metric-pill tone-${freshnessTone}` }, formatQAEvidenceFreshness(report.sourceTrace?.freshnessClass)),
            ),
            h('div', { className: 'signal-meta muted' }, `Status: ${report.status || 'unknown'} | Desks ${(report.desks || []).length} | Scorecards ${section.scorecardCount || 0}`),
            report.sourceTrace ? h('div', { className: 'signal-meta muted' }, `Source: ${report.sourceTrace.sourcePath || 'unknown'} | ${formatQAEvidenceFreshness(report.sourceTrace.freshnessClass)}`) : null,
            (report.failures || []).length
              ? h('ul', { className: 'signal-list qa-important-list' }, report.failures.slice(0, 4).map((failure, index) => h('li', { key: `${section.id}-failure-${index}` }, `${failure.desk}: ${failure.test} | ${failure.reason}`)))
              : h('div', { className: 'signal-meta muted' }, 'No structured QA failures are recorded in the latest suite.'),
          )
        : h('div', { className: 'signal-empty muted' }, section.emptyState || 'No structured QA report loaded yet.'),
    );
  }
  if (section.kind === 'qa-scorecards') {
    const cards = normalizeRenderList(section.cards);
    const summaryProvenance = renderQASummaryProvenanceChips(section.sourceTrace, 'Derived summary');
    return h('details', {
      key: section.id,
      className: 'inspector-block panel-card qa-scorecards-panel',
      open: Boolean(section.defaultOpen),
      'data-qa': 'qa-scorecards',
    },
      h('summary', { className: 'inline review-header' },
        h('div', null,
          h('div', { className: 'inspector-label' }, section.label),
          h('div', { className: 'signal-summary' }, section.suiteSummary || section.emptyState || 'No structured QA scorecards recorded yet.'),
          summaryProvenance,
        ),
        h('div', { className: 'qa-metric-pill-row' },
          h('span', { className: 'qa-metric-pill tone-neutral' }, 'Derived score summaries'),
          h('span', { className: 'qa-metric-pill tone-neutral' }, `Tests ${Number(section.meta?.testCount || cards.length || 0)}`),
          h('span', { className: 'qa-metric-pill tone-neutral' }, `Desks ${Number(section.meta?.deskCount || 0)}`),
        ),
      ),
      cards.length
        ? h('div', { className: 'desk-panel-list utility-list qa-scorecard-list' }, cards.slice(0, 6).map((card) => h('details', {
            key: card.id || `${card.desk}-${card.testId}`,
            className: `desk-panel-item utility-card qa-scorecard-card status-${card.status || 'pass'}`,
          },
            (() => {
              const scoreValue = Number.isFinite(Number(card?.overallScore?.value)) ? Number(card.overallScore.value) : null;
              const scoreMax = Number.isFinite(Number(card?.overallScore?.max)) ? Number(card.overallScore.max) : null;
              const statusTone = card.status === 'pass' ? 'good' : (card.status === 'fail' ? 'bad' : 'neutral');
              return h('summary', { className: 'inline review-header' },
                h('div', null,
                  h('div', { className: 'signal-summary' }, `${card.desk || 'desk'} | ${card.testName || card.testId || 'QA test'}`),
                  h('div', { className: 'signal-meta muted' }, `Status ${card.status || 'pass'} | Rollup ${card.rollupStatus || 'missing'} | Score ${scoreValue ?? 'n/a'} / ${scoreMax ?? 4}`),
                  renderQASummaryProvenanceChips(card.sourceTrace, 'Derived summary'),
                ),
                h('div', { className: 'qa-metric-pill-row' },
                  h('span', { className: `qa-metric-pill tone-${statusTone}` }, card.status || 'pass'),
                  h('span', { className: `qa-metric-pill tone-${card.rollupStatus === 'pass' ? 'good' : (card.rollupStatus === 'fail' ? 'bad' : 'neutral')}` }, card.rollupStatus || 'missing'),
                ),
              );
            })(),
            h('div', { className: 'signal-meta muted' }, `Source: ${card.sourceTrace?.sourcePath || 'unknown'} | ${formatQAEvidenceFreshness(card.sourceTrace?.freshnessClass)}`),
            card.sourceTrace?.observedAt ? h('div', { className: 'signal-meta muted' }, `Last updated: ${formatTimestamp(card.sourceTrace.observedAt)}`) : null,
            card.rollupReasons?.length
              ? h('ul', { className: 'signal-list compact qa-scorecard-reasons' }, card.rollupReasons.slice(0, 3).map((reason, index) => h('li', { key: `${card.id || 'scorecard'}-rollup-${index}` }, reason)))
              : null,
            card.validation?.summary ? h('div', { className: 'signal-meta muted' }, card.validation.summary) : null,
            card.validation?.issues?.length
              ? h('ul', { className: 'signal-list compact' }, card.validation.issues.slice(0, 4).map((issue, index) => h('li', { key: `${card.id || 'scorecard'}-issue-${index}` }, issue)))
              : null,
          )))
        : h('div', { className: 'signal-empty muted' }, section.emptyState || 'No structured QA scorecards recorded yet.'),
    );
  }
  if (section.kind === 'qa-evaluator') {
    const evaluator = normalizeRenderObject(section.evaluator || {});
    const latestEvaluation = normalizeRenderObject(evaluator.latestEvaluation || evaluator.movement || {});
    const history = normalizeRenderList(evaluator.history || []);
    const direction = resolveEvaluatorDirection(latestEvaluation.verdict || 'no_change');
    const dimensionImpacts = normalizeRenderList(latestEvaluation.dimensionImpacts || latestEvaluation.dimension_impacts || []);
    const grounding = normalizeRenderObject(latestEvaluation.grounding || {});
    const consultedSeams = normalizeRenderList(latestEvaluation.consultedSeams || latestEvaluation.consulted_seams || []);
    const missingInputIds = normalizeRenderList(grounding.missingInputIds || grounding.missing_input_ids || []);
    const caveats = normalizeRenderList(grounding.caveats || []);
    const sourceSnapshotIds = normalizeRenderObject(latestEvaluation.sourceSnapshotIds || latestEvaluation.source_snapshot_ids || {});
    const qaAuthority = normalizeRenderObject(latestEvaluation.qaAuthority || latestEvaluation.qa_authority || {});
    const provenance = normalizeRenderObject(latestEvaluation.provenance || {});
    const groundingTone = grounding.status === 'grounded' ? 'good' : (missingInputIds.length ? 'warn' : 'neutral');
    return h('details', {
      key: section.id,
      className: 'inspector-block panel-card qa-evaluator-panel',
      open: Boolean(section.defaultOpen),
      'data-qa': 'qa-evaluator',
    },
      h('summary', { className: 'inline review-header' },
        h('div', null,
          h('div', { className: 'inspector-label' }, section.label),
          h('div', { className: 'signal-summary' }, section.summary || section.emptyState || 'No evaluator artefact is recorded yet.'),
        ),
        h('div', { className: 'qa-metric-pill-row' },
          h('span', { className: `qa-metric-pill tone-${direction.tone}` }, `${direction.arrow} ${direction.verdict}`),
          h('span', { className: 'qa-metric-pill tone-neutral' }, `History ${Number(evaluator.historyCount || history.length || 0)}`),
          h('span', { className: 'qa-metric-pill tone-neutral' }, normalizeRenderText(latestEvaluation.analysis_classification || latestEvaluation.analysisClassification, '') || 'derived_analysis'),
        ),
      ),
      latestEvaluation.verdict
        ? h(React.Fragment, null,
            h('div', { className: 'qa-metric-pill-row truth-surface-banner' },
              h('span', { className: `qa-metric-pill tone-${direction.tone}` }, `${direction.arrow} ${direction.verdict}`),
              h('span', { className: 'qa-metric-pill tone-neutral' }, normalizeRenderText(latestEvaluation.analysis_classification || latestEvaluation.analysisClassification, '') || 'derived_analysis'),
              h('span', { className: `qa-metric-pill tone-${groundingTone}` }, `Grounding ${grounding.status || 'unknown'}`),
              h('span', { className: 'qa-metric-pill tone-neutral' }, `Authority ${normalizeRenderText(latestEvaluation.authority_scope || latestEvaluation.authorityScope, '') || 'comparative_projection'}`),
            ),
            h('div', { className: 'truth-surface-grid' },
              h('div', { className: 'truth-surface-card truth-surface-card--derived' },
                h('div', { className: 'truth-surface-card__label' }, 'Evaluator judgement'),
                h('div', { className: 'truth-surface-card__value', style: { color: direction.color } }, `${direction.arrow} ${direction.label}`),
                h('div', { className: 'signal-meta muted' }, `Target ${latestEvaluation.comparison_target || latestEvaluation.comparisonTarget || 'system_runtime'} | delta ${formatSignedDelta(latestEvaluation.delta_score || latestEvaluation.deltaScore || 0)} | pressure ${latestEvaluation.score_pressure || latestEvaluation.scorePressure || 'flat'}`),
                h('div', { className: 'signal-meta muted' }, latestEvaluation.progress_summary || latestEvaluation.progressSummary || 'No evaluator summary recorded.'),
              ),
              h('div', { className: 'truth-surface-card' },
                h('div', { className: 'truth-surface-card__label' }, 'Grounding and provenance'),
                h('div', { className: 'truth-surface-card__value' }, Number.isFinite(Number(grounding.completeness)) ? `${Math.round(Number(grounding.completeness) * 100)}% complete` : 'Completeness unknown'),
                h('div', { className: 'signal-meta muted' }, `Compared ${formatTimestamp(latestEvaluation.compared_at || latestEvaluation.comparedAt)} | cognition ${latestEvaluation.cognition_mode || latestEvaluation.cognitionMode || 'unknown'} | model ${latestEvaluation.model_name || latestEvaluation.modelName || 'n/a'}`),
                sourceSnapshotIds.previous || sourceSnapshotIds.current
                  ? h('div', { className: 'signal-meta muted' }, `Snapshots: prev ${sourceSnapshotIds.previous || 'n/a'} | curr ${sourceSnapshotIds.current || 'n/a'}`)
                  : null,
                qaAuthority.owner || qaAuthority.role || qaAuthority.evaluatorRole
                  ? h('div', { className: 'signal-meta muted' }, `QA authority: ${qaAuthority.owner || 'qa'} | ${qaAuthority.role || 'adjudicated_reference'} | evaluator ${qaAuthority.evaluatorRole || 'derived_analysis_only'}`)
                  : null,
                provenance.comparisonBasis || provenance.qaRole || provenance.scorecardRole
                  ? h('div', { className: 'signal-meta muted' }, [
                      provenance.comparisonBasis ? `Basis ${provenance.comparisonBasis}` : null,
                      provenance.qaRole ? `QA ${provenance.qaRole}` : null,
                      provenance.scorecardRole ? `Scorecards ${provenance.scorecardRole}` : null,
                    ].filter(Boolean).join(' | '))
                  : null,
              ),
            ),
            Number.isFinite(Number(latestEvaluation.evaluation_confidence || latestEvaluation.evaluationConfidence))
              ? renderContinuousMeter(Number(latestEvaluation.evaluation_confidence || latestEvaluation.evaluationConfidence), {
                  fill: direction.color,
                  label: 'confidence',
                })
              : null,
            missingInputIds.length
              ? h('div', { className: 'signal-meta warn' }, `Missing inputs: ${missingInputIds.join(', ')}`)
              : null,
            caveats.length
              ? h('ul', { className: 'signal-list compact qa-important-list' }, caveats.slice(0, 4).map((caveat, index) => h('li', { key: `${section.id}-caveat-${index}` }, caveat)))
              : null,
            consultedSeams.length
              ? h('div', { className: 'desk-panel-list utility-list truth-surface-grid', style: { marginTop: '8px' } }, consultedSeams.map((seam, index) => h('div', {
                  key: seam.id || `${section.id}-seam-${index}`,
                  className: `desk-panel-item utility-card truth-surface-card ${seam.available === false ? 'truth-surface-card--warn' : ''}`,
                },
                  h('div', { className: 'truth-surface-card__label' }, 'Consulted seam'),
                  h('div', { className: 'signal-summary' }, seam.label || seam.id || 'source seam'),
                  h('div', { className: 'signal-meta muted' }, [
                    seam.role || null,
                    seam.classification || null,
                    seam.available === false ? 'missing' : 'available',
                    seam.freshness || null,
                  ].filter(Boolean).join(' | ')),
                  seam.summary ? h('div', { className: 'signal-meta muted' }, seam.summary) : null,
                  Array.isArray(seam.sourcePaths) && seam.sourcePaths.length
                    ? h('div', { className: 'signal-meta muted' }, `Sources: ${seam.sourcePaths.slice(0, 3).join(', ')}`)
                    : null,
                )))
              : null,
            dimensionImpacts.length
              ? h('div', { className: 'desk-panel-list utility-list truth-surface-grid', style: { marginTop: '8px' } }, dimensionImpacts.map((impact, index) => {
                  const impactDirection = resolveEvaluatorDirection(impact.verdict || 'no_change');
                  return h('div', {
                    key: impact.id || `${section.id}-impact-${index}`,
                    className: 'desk-panel-item utility-card truth-surface-card',
                  },
                    h('div', { className: 'truth-surface-card__label' }, 'Change driver'),
                    h('div', { className: 'signal-summary', style: { color: impactDirection.color } }, `${impactDirection.arrow} ${impact.label || impact.id || 'dimension'}`),
                    h('div', { className: 'signal-meta muted' }, `Delta ${formatSignedDelta(impact.delta || 0)} | weight ${Number.isFinite(Number(impact.weight)) ? Number(impact.weight).toFixed(2) : 'n/a'}`),
                    impact.summary ? h('div', { className: 'signal-meta muted' }, impact.summary) : null,
                  );
                }))
              : null,
          )
        : h('div', { className: 'signal-empty muted' }, section.emptyState || 'No evaluator artefact is recorded yet.'),
    );
  }
  if (section.kind === 'qa-agent-cognition') {
    const cognition = normalizeRenderObject(section.cognition || {});
    const agents = normalizeRenderList(cognition.agents || []);
    return h('details', {
      key: section.id,
      className: 'inspector-block panel-card qa-agent-cognition-panel',
      open: Boolean(section.defaultOpen),
      'data-qa': 'qa-agent-cognition',
    },
      h('summary', { className: 'inline review-header' },
        h('div', null,
          h('div', { className: 'inspector-label' }, section.label),
          h('div', { className: 'signal-summary' }, section.summary || section.emptyState || 'Assigned-agent cognition telemetry is not available yet.'),
        ),
      ),
      agents.length
        ? h('div', { className: 'desk-panel-list utility-list qa-agent-cognition-list' }, agents.map((entry) => h('div', {
            key: entry.agent_id || entry.label,
            className: 'desk-panel-item utility-card',
          },
            h('div', { className: 'inline review-header' },
              h('div', null,
                h('div', { className: 'signal-summary' }, entry.label || entry.agent_id || 'Agent'),
                h('div', { className: 'signal-meta muted' }, `Intended ${entry.intended_cognition_mode || 'unknown'} | Actual ${entry.actual_last_cognition_mode || 'unknown'}`),
              ),
              h('span', { className: `qa-metric-pill tone-${entry.matches_intended === false ? 'bad' : (entry.actual_last_cognition_mode === 'model_live' ? 'good' : 'neutral')}` }, entry.matches_intended === false ? 'mismatch' : (entry.actual_last_cognition_mode || 'unknown')),
            ),
            h('div', { className: 'signal-meta muted' }, `Last live model call: ${entry.last_live_model_call_at ? formatTimestamp(entry.last_live_model_call_at) : 'none'} | fallbacks ${Number(entry.fallback_count || 0)}`),
            h('div', { className: 'signal-meta muted' }, `Backend ${entry.backend || 'unknown'} | model ${entry.model_name || 'n/a'}`),
          )))
        : h('div', { className: 'signal-empty muted' }, section.emptyState || 'Assigned-agent cognition telemetry is not available yet.'),
    );
  }
  if (section.kind === 'qa-investigations') {
    return renderQAInvestigationInboxBlock(section.items || section.investigations || []);
  }
  if (section.kind === 'qa-repair-lanes') {
    const lanes = normalizeQARepairLanePayloadList(section.lanes || []);
    const repairLoopSummary = normalizeRenderObject(section.repairLoopSummary);
    const metricRow = (label, value) => h('div', { className: 'criteria-row' }, h('span', null, label), h('span', { className: 'muted' }, value));
    const outcomeMeta = (lane) => {
      if (lane.outcome_status === 'policy_blocked') return { label: 'Policy blocked', tone: 'bad' };
      if (lane.outcome_status === 'safe_stop') return { label: 'Safe stop', tone: 'warn' };
      if (lane.outcome_status === 'validation_failed') return { label: 'Validation failed', tone: 'warn' };
      if (lane.outcome_status === 'success') return { label: 'Success', tone: 'good' };
      if (lane.current_status === 'active') return { label: 'Active', tone: 'neutral' };
      if (lane.current_status === 'watching') return { label: 'Watching', tone: 'neutral' };
      return { label: 'Idle', tone: 'neutral' };
    };
    return h('details', {
      key: section.id,
      className: 'inspector-block panel-card qa-repair-lanes-panel',
      open: Boolean(section.defaultOpen),
      'data-qa': 'qa-repair-lanes',
    },
      h('summary', { className: 'inline review-header' },
        h('div', null,
          h('div', { className: 'inspector-label' }, section.label),
          h('div', { className: 'signal-summary' }, section.summary || section.emptyState || 'No active or recent repair lanes are recorded yet.'),
        ),
        h('div', { className: 'qa-metric-pill-row' },
          h('span', { className: 'qa-metric-pill tone-neutral' }, `Visible ${lanes.length}`),
          h('span', { className: `qa-metric-pill tone-${Number(repairLoopSummary.blockedLanes || 0) > 0 ? 'bad' : 'neutral'}` }, `Blocked ${Number(repairLoopSummary.blockedLanes || 0)}`),
          h('span', { className: `qa-metric-pill tone-${Number(repairLoopSummary.activeLanes || 0) > 0 ? 'warn' : 'neutral'}` }, `Active ${Number(repairLoopSummary.activeLanes || 0)}`),
        ),
      ),
      lanes.length
        ? h('div', { className: 'desk-panel-list utility-list qa-repair-lane-list' }, lanes.map((lane) => {
            const outcome = outcomeMeta(lane);
            const statusTone = lane.current_status === 'blocked'
              ? 'bad'
              : (lane.current_status === 'stalled'
                  ? 'warn'
                  : (lane.current_status === 'healthy' ? 'good' : 'neutral'));
            return h('details', {
              key: lane.lane_id || lane.label,
              className: `desk-panel-item utility-card qa-repair-lane-card status-${lane.current_status || 'idle'} outcome-${lane.outcome_status || 'idle'}`,
            },
              h('summary', { className: 'inline review-header' },
                h('div', null,
                  h('div', { className: 'signal-summary' }, lane.label || lane.lane_id || 'Repair lane'),
                  h('div', { className: 'signal-meta muted' }, `${lane.lane_id || 'unknown lane'} | ${lane.owner_department || 'QA'}`),
                ),
                h('div', { className: 'qa-metric-pill-row' },
                  h('span', { className: `qa-metric-pill tone-${outcome.tone}` }, outcome.label),
                  h('span', { className: `qa-metric-pill tone-${statusTone}` }, lane.current_status || 'idle'),
                  h('span', { className: `qa-metric-pill tone-${lane.auto_apply_allowed ? 'good' : 'bad'}` }, lane.auto_apply_allowed ? 'Auto-apply allowed' : 'Auto-apply blocked'),
                  h('span', { className: 'qa-metric-pill tone-neutral' }, `Trust ${lane.trust_level || 'unknown'}`),
                ),
              ),
              h('div', { className: 'criteria-list desk-metric-list' },
                metricRow('Triggers', lane.allowed_trigger_classes.length ? lane.allowed_trigger_classes.join(' | ') : 'unknown'),
                metricRow('Scope', lane.scoped_targets_summary || (lane.scoped_targets.length ? `${lane.scoped_targets.length} targets` : 'No scoped targets surfaced.')),
                metricRow('Retry budget', `${lane.retry_budget || 0}`),
                metricRow('Validation gates', lane.required_validation_gate_ids.length ? lane.required_validation_gate_ids.join(' | ') : 'none declared'),
                metricRow('Attempt count', `${lane.attempt_count || 0}`),
                metricRow('Blocked count', `${lane.blocked_count || 0}`),
                metricRow('Open investigations', `${lane.open_investigations || 0}`),
                metricRow('Latest validation', lane.latest_validation_result || lane.latest_job_status || 'none'),
              ),
              lane.trust_reason ? h('div', { className: 'signal-meta muted' }, `Trust reason: ${lane.trust_reason}`) : null,
              lane.latest_policy_block_reason ? h('div', { className: 'signal-meta error' }, `Policy block: ${lane.latest_policy_block_reason}`) : null,
              lane.latest_stop_reason && lane.latest_stop_reason !== lane.latest_policy_block_reason
                ? h('div', { className: 'signal-meta muted' }, `Latest stop / validation: ${lane.latest_stop_reason}`)
                : null,
              lane.latest_attempt_at ? h('div', { className: 'signal-meta muted' }, `Latest attempt: ${formatTimestamp(lane.latest_attempt_at)}`) : null,
              lane.scoped_targets.length
                ? h('div', { className: 'signal-meta muted' }, `Scoped targets: ${lane.scoped_targets.join(' | ')}`)
                : null,
            );
          }))
        : h('div', { className: 'signal-empty muted' }, section.emptyState || 'No active or recent repair lanes are recorded yet.'),
    );
  }
  if (section.kind === 'qa-research') {
    const notes = normalizeRenderList(section.notes);
    const researchState = normalizeRenderObject(section.researchState);
    return h('details', {
      key: section.id,
      className: 'inspector-block panel-card qa-research-panel',
      open: Boolean(section.defaultOpen),
      'data-qa': 'qa-research',
    },
      h('summary', { className: 'inline review-header' },
        h('div', null,
          h('div', { className: 'inspector-label' }, section.label),
          h('div', { className: 'signal-summary' }, section.summary || section.emptyState || 'No advisory research notes recorded yet.'),
        ),
        h('div', { className: 'qa-metric-pill-row' },
          h('span', { className: 'qa-metric-pill tone-neutral' }, `Notes ${notes.length}`),
          h('span', { className: 'qa-metric-pill tone-neutral' }, researchState?.summary?.availableNotes != null ? `Available ${researchState.summary.availableNotes}` : 'Advisory'),
        ),
      ),
      notes.length
        ? h('div', { className: 'desk-panel-list utility-list qa-research-list' }, notes.slice(0, 6).map((note, index) => h('details', {
            key: note.id || `${section.id}-note-${index}`,
            className: `desk-panel-item utility-card qa-research-card status-${note.status || 'available'}`,
          },
            h('summary', { className: 'inline review-header' },
              h('div', null,
                h('div', { className: 'signal-summary' }, note.summary || 'Research note'),
                h('div', { className: 'signal-meta muted' }, note.recommendation || note.error_message || 'Advisory only.'),
              ),
              h('span', { className: `qa-metric-pill tone-${note.research_available ? 'good' : (note.status === 'unavailable' ? 'warn' : 'neutral')}` }, note.research_available ? 'available' : (note.status || 'unknown')),
            ),
            note.created_at ? h('div', { className: 'signal-meta muted' }, `Last updated: ${formatTimestamp(note.created_at)}`) : null,
            note.query ? h('div', { className: 'signal-meta muted' }, `Query: ${note.query}`) : null,
            note.likely_causes?.length ? h('div', { className: 'signal-meta muted' }, `Likely causes: ${note.likely_causes.slice(0, 4).join(' | ')}`) : null,
            note.suggested_extra_checks?.length ? h('div', { className: 'signal-meta muted' }, `Extra checks: ${note.suggested_extra_checks.slice(0, 4).join(' | ')}`) : null,
            note.suggested_scorecard_additions?.length ? h('div', { className: 'signal-meta muted' }, `Scorecard additions: ${note.suggested_scorecard_additions.slice(0, 4).join(' | ')}`) : null,
            note.sources?.length ? h('div', { className: 'signal-meta muted' }, `Sources: ${note.sources.map((source) => source.url || source.source_url || source.title || 'source').join(' | ')}`) : null,
            note.error_message ? h('div', { className: 'signal-meta error' }, note.error_message) : null,
          )))
        : h('div', { className: 'signal-empty muted' }, section.emptyState || 'No advisory research notes recorded yet.'),
    );
  }
  if (section.kind === 'qa-browser') {
    const run = section.latestRun || null;
  const provenance = run?.sourceTrace ? normalizeQaEvidenceProvenance({
      ...run.sourceTrace,
      classification: run.sourceTrace.sourceClass || run.sourceTrace.freshnessClass || null,
    }) : null;
    return h('div', { key: section.id, className: 'inspector-block panel-card review-panel browser-pass-panel' },
      h('div', { className: 'inline review-header' },
        h('div', null,
          h('div', { className: 'inspector-label' }, section.label),
          h('div', { className: 'signal-summary' }, section.busy ? 'Browser QA is running...' : (run ? `${run.scenario || 'layout-pass'} | ${run.verdict || run.status || 'pending'}` : (section.emptyState || 'No browser pass has been recorded yet.'))),
        ),
        provenance?.hasProvenance ? h('div', { className: 'qa-metric-pill-row qa-evidence-provenance-row' },
          provenance.chips.slice(0, 4).map((chip) => h('span', {
            key: `${section.id}-${chip.label}-${chip.value}`,
            className: `qa-metric-pill tone-${chip.tone || 'neutral'}`,
            title: `${chip.label}: ${chip.value}`,
          }, `${chip.label} ${chip.value}`)),
        ) : null,
      ),
      run
        ? h(React.Fragment, null,
            h('div', { className: 'signal-meta muted' }, `Trigger: ${run.trigger || 'manual'} | Findings ${run.findingCount || 0}`),
            run.sourceTrace ? h('div', { className: 'signal-meta muted' }, `Source: ${run.sourceTrace.sourcePath || 'unknown'} | ${formatQAEvidenceFreshness(run.sourceTrace.freshnessClass)}`) : null,
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
  const unitProvenance = unitGate?.sourceTrace ? normalizeQaEvidenceProvenance({
      ...unitGate.sourceTrace,
      classification: unitGate.sourceTrace.sourceClass || unitGate.sourceTrace.freshnessClass || null,
    }) : null;
  const bootProvenance = studioBootGate?.sourceTrace ? normalizeQaEvidenceProvenance({
      ...studioBootGate.sourceTrace,
      classification: studioBootGate.sourceTrace.sourceClass || studioBootGate.sourceTrace.freshnessClass || null,
    }) : null;
    return h('div', { key: section.id, className: 'inspector-block panel-card', 'data-qa': 'qa-local-gates-section' },
      h('div', { className: 'inspector-label' }, section.label),
      h('div', { className: 'signal-summary' }, section.summary || section.emptyState || 'No local UI gate results recorded yet.'),
      unitGate ? h('div', { className: 'desk-panel-item' },
        h('div', { className: 'signal-summary' }, 'Fast Unit Gate'),
        unitProvenance?.hasProvenance ? h('div', { className: 'qa-metric-pill-row qa-evidence-provenance-row' }, unitProvenance.chips.slice(0, 4).map((chip) => h('span', {
          key: `unit-${chip.label}-${chip.value}`,
          className: `qa-metric-pill tone-${chip.tone || 'neutral'}`,
          title: `${chip.label}: ${chip.value}`,
        }, `${chip.label} ${chip.value}`))) : null,
        h('div', { className: 'signal-meta muted' }, `${unitGate.status || 'pending'} | ${unitGate.passedCount || 0}/${unitGate.totalChecks || 0} checks passed`),
        unitGate.sourceTrace ? h('div', { className: 'signal-meta muted' }, `Source: ${unitGate.sourceTrace.sourcePath || 'unknown'} | ${formatQAEvidenceFreshness(unitGate.sourceTrace.freshnessClass)}`) : null,
        (unitGate.failures || []).length
          ? h('ul', { className: 'signal-list compact' }, unitGate.failures.slice(0, 3).map((failure) => h('li', { key: failure.name }, `${failure.name}: ${failure.error}`)))
          : h('div', { className: 'signal-meta muted' }, 'No failing fast UI checks in the latest run.'),
      ) : null,
      studioBootGate ? h('div', { className: 'desk-panel-item' },
        h('div', { className: 'signal-summary' }, 'Studio Boot Guardrail'),
        bootProvenance?.hasProvenance ? h('div', { className: 'qa-metric-pill-row qa-evidence-provenance-row' }, bootProvenance.chips.slice(0, 4).map((chip) => h('span', {
          key: `boot-${chip.label}-${chip.value}`,
          className: `qa-metric-pill tone-${chip.tone || 'neutral'}`,
          title: `${chip.label}: ${chip.value}`,
        }, `${chip.label} ${chip.value}`))) : null,
        h('div', { className: 'signal-meta muted' }, `${studioBootGate.verdict || studioBootGate.status || 'pending'} | console ${studioBootGate.consoleErrorCount || 0} | network ${studioBootGate.networkFailureCount || 0}`),
        studioBootGate.sourceTrace ? h('div', { className: 'signal-meta muted' }, `Source: ${studioBootGate.sourceTrace.sourcePath || 'unknown'} | ${formatQAEvidenceFreshness(studioBootGate.sourceTrace.freshnessClass)}`) : null,
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
  const [ghostProjectionState, setGhostProjectionState] = useState(() => createEmptyGhostProjectionRegistry());

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
  const [qaOutputFeed, setQaOutputFeed] = useState([]);
  const [qaOutputFeedLoaded, setQaOutputFeedLoaded] = useState(false);
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
  const [chiefOfStaffDraft, setChiefOfStaffDraft] = useState('');
  const [chiefOfStaffBusy, setChiefOfStaffBusy] = useState(false);
  const [chiefOfStaffHistory, setChiefOfStaffHistory] = useState([]);
  const [chiefOfStaffLatest, setChiefOfStaffLatest] = useState(() => normalizeChiefOfStaffAdvisoryPayload(null));
  const [ctoChatDraft, setCtoChatDraft] = useState('');
  const [ctoChatBusy, setCtoChatBusy] = useState(false);
  const [ctoChatHistory, setCtoChatHistory] = useState([]);
  const [ctoChatStatus, setCtoChatStatus] = useState(() => buildDefaultCtoChatStatus());
  const [canonicalIntake, setCanonicalIntake] = useState(EMPTY_CANONICAL_INTAKE_STATE);
  const [truthKernel, setTruthKernel] = useState(EMPTY_TRUTH_KERNEL);
  const [truthKernelLoadState, setTruthKernelLoadState] = useState(TRUTH_KERNEL_LOAD_STATES.LOADING);
  const [truthKernelVisible, setTruthKernelVisible] = useState(false);
  const [truthInspectionCompact, setTruthInspectionCompact] = useState(false);
  const [selectedTruthNodeId, setSelectedTruthNodeId] = useState(null);

  const truthKernelCanvasRef = useRef(null);
  const truthKernelLoadStateRef = useRef(TRUTH_KERNEL_LOAD_STATES.LOADING);
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
  const chiefOfStaffSubmitLock = useRef(false);
  const ctoChatSubmitLock = useRef(false);
  const lastCanvasViewport = useRef(createDefaultCanvasViewport());
  const lastStudioViewport = useRef(createDefaultStudioViewport());
  const lastScene = useRef(SCENES.CANVAS);

  const graphBundle = useMemo(() => ({
    ...graphLayers,
    [activeGraphLayer]: graph,
  }), [graphLayers, activeGraphLayer, graph]);
  const truthInspectionLegend = useMemo(() => buildTruthInspectionLegend(), []);
  const truthKernelSourceAnchors = useMemo(
    () => buildSketchNodeAnchorMap(graphBundle, canvasViewport),
    [graphBundle, canvasViewport],
  );
  const truthKernelLayout = useMemo(() => buildTruthKernelLayout(truthKernel.dots, {
    sourceAnchors: truthKernelSourceAnchors,
  }), [truthKernel, truthKernelSourceAnchors]);
  const truthKernelRenderModel = useMemo(() => {
    const model = buildTruthKernelRenderModel(truthKernel, truthKernelLayout);
    return {
      ...model,
      renderStatus: {
        ...(model.renderStatus || {}),
        spread: summarizeTruthKernelSpread(model, truthKernelLayout?.bounds),
        positionOrigin: summarizeTruthKernelPositionOrigin(model, truthKernelLayout?.bounds),
      },
    };
  }, [truthKernel, truthKernelLayout]);
  const truthKernelRenderSummary = useMemo(() => summarizeTruthKernelRenderStatus(truthKernelRenderModel), [truthKernelRenderModel]);
  const truthKernelStatusSummary = useMemo(() => buildTruthKernelStatusSummary(truthKernelRenderModel), [truthKernelRenderModel]);
  const truthKernelToggleState = useMemo(() => resolveTruthKernelToggleState({
    scene,
    truthKernel,
    loadState: truthKernelLoadState,
    visible: truthKernelVisible,
  }), [scene, truthKernel, truthKernelLoadState, truthKernelVisible]);
  const truthInspectionPanelState = useMemo(() => resolveTruthInspectionPanelState({
    truthKernelVisible,
    compactPreference: truthInspectionCompact,
  }), [truthKernelVisible, truthInspectionCompact]);
  const selectedTruthNode = useMemo(
    () => truthKernelRenderModel.dots.find((node) => node.id === selectedTruthNodeId) || null,
    [truthKernelRenderModel, selectedTruthNodeId],
  );
  const selectedTruthNodeInspector = useMemo(
    () => buildTruthKernelNodeInspectorModel(selectedTruthNode, truthKernel),
    [selectedTruthNode, truthKernel],
  );
  useEffect(() => {
    truthKernelLoadStateRef.current = truthKernelLoadState;
  }, [truthKernelLoadState]);
  const systemGraph = graphBundle.system || buildStarterGraph();
  const selected = graph.nodes.find((node) => node.id === selectedId) || null;
  const selectedRelationshipId = selectedRelationship?.id || null;
  const selectedRelationshipInspector = useMemo(() => buildRelationshipInspectorPayload(selectedRelationship), [selectedRelationship]);
  const selectedSupportsSecondaryDrafting = Boolean(selected && activeGraphLayer === 'system' && !isPrimaryIntentNode(selected));
  const contextNode = systemGraph.nodes.find((node) => isPrimaryIntentNode(node)) || null;
  const latestIntentReport = getCurrentIntentRecord(intentState);
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
  const chiefOfStaffDeskPresentation = useMemo(
    () => buildChiefOfStaffDeskPresentation(chiefOfStaffLatest),
    [chiefOfStaffLatest],
  );
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
  const normalizedGhostProjectionState = useMemo(
    () => buildGhostProjectionRegistryPayload(ghostProjectionState || EMPTY_GHOST_PROJECTION_REGISTRY),
    [ghostProjectionState],
  );
  const currentGhostProjection = useMemo(
    () => getCurrentGhostProjection(normalizedGhostProjectionState),
    [normalizedGhostProjectionState],
  );
  const currentCanonicalIntentRecord = getCurrentIntentRecord(intentState);
  const currentFieldInfluence = currentCanonicalIntentRecord?.fieldInfluence || null;
  const latestCanvasIntakeRecord = getLatestCanonicalIntakeRecord(canonicalIntake, 'canvas_text');
  const latestCtoIntakeRecord = getLatestCanonicalIntakeRecord(canonicalIntake, 'cto_prompt');

  const workspacePayload = useMemo(() => ({
    graph: systemGraph,
    graphs: graphBundle,
    sketches,
    annotations,
    architectureMemory: memory.model,
    agentComments,
    intentState,
    ghostProjections: normalizedGhostProjectionState,
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
  }), [systemGraph, graphBundle, sketches, annotations, agentComments, intentState, normalizedGhostProjectionState, pages, notebookState.activePageId, rsgState, scene, selectedAgentId, activeGraphLayer, worldViewMode, handoffs, teamBoard, orchestratorState, selfUpgrade, studioLayout, canvasViewport, studioViewport, memory]);

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
    ghostProjections: normalizedGhostProjectionState,
  }), [activePageId, selectedAgentId, deskPanelTab, scene, activeGraphLayer, worldViewMode, studioViewport, canvasViewport, openTraceId, openReportId, openTaskId, normalizedGhostProjectionState]);

  const slimIntentStatePayload = useMemo(() => intentState, [intentState]);

  const slimStudioStatePayload = useMemo(() => buildStudioStatePayload({
    handoffs,
    teamBoard,
  }), [handoffs, teamBoard]);

  const qaStateForSnapshots = useMemo(() => {
    const nextState = qaRunDetail ? {
      ...qaState,
      latestBrowserRun: qaRunDetail,
      browserRuns: [qaRunDetail, ...(qaState.browserRuns || []).filter((entry) => entry?.id !== qaRunDetail.id)],
    } : qaState;
    const nextQaLead = normalizeRenderObject(nextState.qaLead || {});
    const nextQaLeadFeed = qaOutputFeedLoaded ? qaOutputFeed : normalizeRenderList(nextQaLead.output_feed || nextQaLead.outputFeed || []);
    return {
      ...nextState,
      qaLead: {
        ...nextQaLead,
        outputFeed: nextQaLeadFeed,
        output_feed: nextQaLeadFeed,
      },
      outputFeed: qaOutputFeed,
      output_feed: qaOutputFeed,
      outputFeedLoaded: qaOutputFeedLoaded,
    };
  }, [qaState, qaRunDetail, qaOutputFeed, qaOutputFeedLoaded]);

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
    const nextPosition = options.position
      ? clampUtilityWindowPosition(options.position)
      : (current) => current[windowId]?.position || defaultState.position;
    setUtilityDockOpen(true);
    setUtilityWindows((current) => ({
      ...current,
      [windowId]: {
        ...(current[windowId] || defaultState),
        open: true,
        minimized: false,
        targetDeskId,
        docked: options.docked ?? current[windowId]?.docked ?? defaultState.docked,
        position: typeof nextPosition === 'function' ? nextPosition(current) : nextPosition,
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

  const getExecutiveAdvisoryWindowPosition = useCallback(() => {
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth || 1600 : 1600;
    return clampUtilityWindowPosition({
      left: Math.max(32, Math.round((viewportWidth - 680) / 2)),
      top: 84,
    });
  }, []);

  const refreshChiefOfStaffAdvisory = useCallback(async () => {
    try {
      const response = await ace.getChiefOfStaffLatest();
      setChiefOfStaffLatest(normalizeChiefOfStaffAdvisoryPayload(response));
    } catch (error) {
      const payload = error?.payload || {};
      setChiefOfStaffLatest(normalizeChiefOfStaffAdvisoryPayload({
        reply_text: payload?.reply_text || payload?.error || error.message || 'Executive advisory is unavailable right now.',
        reply_source: 'deterministic_fallback',
        model_backend: payload?.model_backend || 'ollama_http',
        model_name: payload?.model_name || 'qwen2.5-coder:1.5b',
        model_status: payload?.model_status || 'unavailable',
        advisory_generated_at: new Date().toISOString(),
        recommendation: payload?.recommendation || null,
        posture: payload?.posture || null,
      }));
    }
  }, [ace]);

  const sendChiefOfStaffMessage = useCallback(async (text = '') => {
    const prompt = String(text || '').trim();
    if (!prompt) return;
    if (chiefOfStaffSubmitLock.current) return;
    chiefOfStaffSubmitLock.current = true;
    const userEntry = {
      id: `chief-user-${Date.now()}`,
      role: 'user',
      text: prompt,
    };
    setChiefOfStaffBusy(true);
    setChiefOfStaffDraft('');
    setChiefOfStaffHistory((current) => [...current, userEntry].slice(-10));
    try {
      const response = await ace.askChiefOfStaff(prompt);
      const advisory = normalizeChiefOfStaffAdvisoryPayload(response);
      setChiefOfStaffLatest(advisory);
      setChiefOfStaffHistory((current) => [...current, {
        id: `chief-assistant-${Date.now()}`,
        role: 'assistant',
        text: advisory.reply_text,
        reply_source: advisory.reply_source,
        model_status: advisory.model_status,
        model_backend: advisory.model_backend,
        model_name: advisory.model_name,
        advisory_generated_at: advisory.advisory_generated_at,
        recommendation: advisory.recommendation,
        blocker: advisory.blocker,
        execution_ready: advisory.execution_ready,
      }].slice(-10));
    } catch (error) {
      const payload = error?.payload || {};
      const advisory = normalizeChiefOfStaffAdvisoryPayload({
        reply_text: payload?.reply_text || payload?.error || error.message || 'Executive advisory could not complete the request.',
        reply_source: 'deterministic_fallback',
        model_backend: payload?.model_backend || 'ollama_http',
        model_name: payload?.model_name || 'qwen2.5-coder:1.5b',
        model_status: payload?.model_status || 'unavailable',
        advisory_generated_at: new Date().toISOString(),
        recommendation: payload?.recommendation || null,
        posture: payload?.posture || null,
      });
      setChiefOfStaffLatest(advisory);
      setChiefOfStaffHistory((current) => [...current, {
        id: `chief-assistant-${Date.now()}`,
        role: 'assistant',
        text: advisory.reply_text,
        reply_source: advisory.reply_source,
        model_status: advisory.model_status,
        model_backend: advisory.model_backend,
        model_name: advisory.model_name,
        advisory_generated_at: advisory.advisory_generated_at,
        recommendation: advisory.recommendation,
        blocker: advisory.blocker,
        execution_ready: advisory.execution_ready,
      }].slice(-10));
    } finally {
      chiefOfStaffSubmitLock.current = false;
      setChiefOfStaffBusy(false);
    }
  }, [ace]);

  const sendCtoChatMessage = useCallback(async ({ text, confirmActionId = null, override = null } = {}) => {
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
        override,
        history: nextHistory.map((entry) => ({
          id: entry.id,
          role: entry.role,
          text: entry.text,
          action: entry.action || null,
        })),
        source: scene === SCENES.STUDIO ? 'studio-cto-utility' : 'canvas-cto-utility',
      });
      if (response?.intakeState) {
        setCanonicalIntake(normalizeCanonicalIntakeState(response.intakeState));
      }
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
      if (payload?.intakeState) {
        setCanonicalIntake(normalizeCanonicalIntakeState(payload.intakeState));
      }
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
    refreshChiefOfStaffAdvisory();
  }, [refreshChiefOfStaffAdvisory]);

  useEffect(() => {
    if (!utilityWindows['executive-advisory']?.open) return;
    refreshChiefOfStaffAdvisory();
  }, [refreshChiefOfStaffAdvisory, utilityWindows]);

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
      setSketches(intentRegistryToSketches(workspace.intentState || EMPTY_INTENT_STATE));
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
      setCanonicalIntake(normalizeCanonicalIntakeState(storedStudio.intake));
      const contextNode = (graphs.system?.nodes || []).find((node) => node.metadata?.agentId === 'context-manager');
      const storedIntentState = workspace.intentState || EMPTY_INTENT_STATE;
      const storedGhostProjections = buildGhostProjectionRegistryPayload(
        workspace.ghostProjections
        || storedStudio.ghostProjections
        || storedStudio.ghostProjectionState
        || EMPTY_GHOST_PROJECTION_REGISTRY,
      );
      setIntentState(storedIntentState);
      setGhostProjectionState(storedGhostProjections);
      mutationEngine.setGhostProjectionRegistry(storedGhostProjections);
      setSketches(intentRegistryToSketches(storedIntentState));
      setOpenTraceId(workspace.openTraceId || storedStudio.ui?.openTraceId || null);
      setOpenReportId(workspace.openReportId || storedStudio.ui?.openReportId || null);
      setOpenTaskId(workspace.openTaskId || storedStudio.ui?.openTaskId || null);
      setRsgMeta(workspace.rsg || createDefaultRsgState());
      setMutationGate(normalizeMutationGateState(workspace.mutationGate));
      setContextDraft(contextNode?.content || '');
      setScanPreview(getCurrentIntentRecord(storedIntentState));
      setTruthKernelLoadState(TRUTH_KERNEL_LOAD_STATES.LOADING);
      ace.getTruthKernel()
        .then((payload) => {
          if (cancelled) return;
          setTruthKernel(normalizeTruthKernelPayload(payload));
          setTruthKernelLoadState(TRUTH_KERNEL_LOAD_STATES.READY);
        })
        .catch(() => {
          if (cancelled) return;
          if (truthKernelLoadStateRef.current !== TRUTH_KERNEL_LOAD_STATES.READY) {
            setTruthKernelLoadState(TRUTH_KERNEL_LOAD_STATES.ERROR);
          }
        });
      activeCanvasIntentTraceId.current = null;
      setCanvasIntentRunState(EMPTY_CANVAS_INTENT_RUN_STATE);
      hasLoadedWorkspace.current = true;
    }).catch(() => {
      setNormalizedGraphBundlePresent(false);
      activeCanvasIntentTraceId.current = null;
      setCanvasIntentRunState(EMPTY_CANVAS_INTENT_RUN_STATE);
      setCanonicalIntake(EMPTY_CANONICAL_INTAKE_STATE);
      setTruthKernel(EMPTY_TRUTH_KERNEL);
      setTruthKernelLoadState(TRUTH_KERNEL_LOAD_STATES.ERROR);
      setGhostProjectionState(EMPTY_GHOST_PROJECTION_REGISTRY);
      mutationEngine.setGhostProjectionRegistry(EMPTY_GHOST_PROJECTION_REGISTRY);
      hasLoadedWorkspace.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, [graphEngine, memory]);

  useEffect(() => {
    loadQaOutputFeed();
  }, []);

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
      truthKernelVisible,
      selectedAgent?.name || '',
    );
  }, [graph, graphBundle, canvasViewport, memory, activeGraphLayer, worldViewMode, recentWorldChange, showRecentWorldChanges, pointerWorld, simulating, simStep, paused, sketches, annotations, selectedSketchId, selectedAnnotationId, selectedRelationshipId, selectedAgentId, truthKernelVisible, selectedAgent?.name]);

  useEffect(() => {
    drawTruthKernelScene(
      truthKernelCanvasRef.current,
      truthKernelRenderModel,
      truthKernelLayout,
      { selectedNodeId: selectedTruthNodeId },
    );
  }, [truthKernelRenderModel, truthKernelLayout, selectedTruthNodeId]);

  useEffect(() => {
    if (!selectedTruthNodeId) return;
    if (truthKernelRenderModel.dots.some((node) => node.id === selectedTruthNodeId)) return;
    setSelectedTruthNodeId(null);
  }, [truthKernelRenderModel, selectedTruthNodeId]);

  useEffect(() => {
    setTruthInspectionCompact(!!truthKernelVisible);
  }, [truthKernelVisible]);

  useEffect(() => {
    if (!hasLoadedWorkspace.current) return;
    setSketches(intentRegistryToSketches(intentState));
  }, [intentState]);

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
    updatePlannerHandoff(latestIntentReport, currentGhostProjection).catch(() => {});
  }, [handoffs.contextToPlanner, latestIntentReport, dashboardState, currentGhostProjection]);

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

  async function loadQaOutputFeed() {
    try {
      const payload = await ace.getQaOutputFeed();
      setQaOutputFeed(normalizeRenderList(payload.items || payload.feed || []));
      setQaOutputFeedLoaded(true);
    } catch {
      // Keep the existing fallback path if the dedicated feed route is unavailable.
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
        loadQaOutputFeed();
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
      loadQaOutputFeed();
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
    intake: normalizeCanonicalIntakeState(workspace.studio?.intake),
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
    setGhostProjectionState(syncResult.registry || mutationEngine.getGhostProjectionRegistry());
    const activityType = syncResult.status === 'blocked'
      ? 'rsg-blocked'
      : (syncResult.projectionRecords.length
        ? (syncResult.replacedProjectionIds.length ? 'rsg-replace' : 'rsg-generate')
        : (syncResult.replacedProjectionIds.length ? 'rsg-replace' : 'rsg-skip'));
    const entry = buildRsgActivityEntry({
      type: activityType,
      sourceNode: currentSourceNode,
      report,
      generationId: syncResult.generationId,
      generatedCount: syncResult.projectionRecords.length,
      replacedCount: syncResult.replacedProjectionIds.length,
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

  const updatePlannerHandoff = async (canonicalIntent, ghostProjection = currentGhostProjection) => {
    if (!canonicalIntent) return null;
    const nextIntentState = upsertIntentRegistry(intentState, canonicalIntent);
    const previousHandoff = handoffs.contextToPlanner;
    const nextHandoff = createPlannerHandoff(canonicalIntent, ghostProjection, dashboardState, previousHandoff);
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
          title: canonicalIntent.summary ? canonicalIntent.summary.slice(0, 48) : page.title,
          summary: canonicalIntent.summary || page.summary,
          sourceNodeId: canonicalIntent.nodeId || canonicalIntent.sourceRef || page.sourceNodeId,
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
      saveIntentState({ intentState: nextIntentState }),
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
    if (runtime.intake) {
      setCanonicalIntake(normalizeCanonicalIntakeState(runtime.intake));
    }
    if (runtime && Object.prototype.hasOwnProperty.call(runtime, 'truthKernel')) {
      setTruthKernel(normalizeTruthKernelPayload(runtime, {
        source: 'runtime-fallback',
        fallbackUsed: true,
      }));
      setTruthKernelLoadState(TRUTH_KERNEL_LOAD_STATES.READY);
    }
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
      if (response?.intakeState) {
        setCanonicalIntake(normalizeCanonicalIntakeState(response.intakeState));
      }
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
      const nextIntentState = upsertIntentRegistry(intentState, report);
      let handoff = tracedResponse.handoff || (tracedResponse.runtime ? tracedResponse.runtime.handoffs?.contextToPlanner : null) || null;
      if (tracedResponse.runtime) {
        applyRuntimePayload(tracedResponse.runtime, nextIntentState);
      } else {
        setIntentState(nextIntentState);
        handoff = await updatePlannerHandoff(getCurrentIntentRecord(nextIntentState), currentGhostProjection);
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
      if (routePayload?.intakeState) {
        setCanonicalIntake(normalizeCanonicalIntakeState(routePayload.intakeState));
      }
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
      const removedGhosts = mutationEngine.removeGhostProjectionsForSource(nodeId);
      setGhostProjectionState(removedGhosts.registry);
      if (removedGhosts.removedProjectionIds.length) {
        const entry = recordRsgActivity(buildRsgActivityEntry({
          type: 'rsg-replace',
          sourceNode: current,
          reason: 'source-cleared',
          replacedCount: removedGhosts.removedProjectionIds.length,
          trigger,
        }));
        setStatus(`node updated | ${formatRsgActivity(entry)}`);
        return null;
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
      const nextIntentState = upsertIntentRegistry(intentState, report);
      if (response.runtime && current?.metadata?.agentId === 'context-manager') {
        applyRuntimePayload(response.runtime, nextIntentState);
      } else {
        setIntentState(nextIntentState);
      }
      if (current?.metadata?.agentId === 'context-manager') {
        setContextDraft(content);
        setScanPreview(report);
        if (!response.runtime) {
          await updatePlannerHandoff(getCurrentIntentRecord(nextIntentState), currentGhostProjection);
        }
      }
      const rsgResult = applyFocusedRsgLoop(graphEngine.getState().nodes.find((node) => node.id === nodeId), report, {
        trigger,
        recordSkip,
      });
      addTraceStep(trace, 'engine_result', {
        generated_nodes: rsgResult?.syncResult?.projectionRecords?.map((projection) => projection.id) || [],
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
    let removedGhostIds = [];
    const removal = mutationEngine.removeGhostProjectionsForSource(id);
    removedGhostIds = removal.removedProjectionIds;
    setGhostProjectionState(removal.registry);
    graphEngine.removeNode(id);
    syncGraphState();
    if (removedGhostIds.length && currentNode) {
      recordRsgActivity(buildRsgActivityEntry({
        type: 'rsg-replace',
        sourceNode: currentNode,
        replacedCount: removedGhostIds.length,
        reason: 'source-deleted',
        trigger: 'delete',
      }));
    }
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
    setCanvasViewport(createDefaultCanvasViewport());
    setScene(SCENES.CANVAS);
    setWorldViewMode(DEFAULT_WORLD_VIEW_MODE);
    setContextDraft('');
    setScanPreview(null);
    setPreview(null);
    setIntentState(EMPTY_INTENT_STATE);
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
    if (agentId === 'cto-chief-of-staff') {
      closeDeskInspector();
      openUtilityWindow('executive-advisory', {
        targetDeskId: 'cto-chief-of-staff',
        docked: false,
        position: getExecutiveAdvisoryWindowPosition(),
      });
      return;
    }
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
    if (activeSketch.current && Array.isArray(activeSketch.current.path) && activeSketch.current.path.length) {
      const canonicalIntent = buildSketchCanonicalIntentRecord(activeSketch.current, {
        sourceRef: activeSketch.current.id,
        timestamp: activeSketch.current.createdAt || new Date().toISOString(),
      });
      const nextIntentState = upsertIntentRegistry(intentState, canonicalIntent);
      setIntentState(nextIntentState);
      setSketches(intentRegistryToSketches(nextIntentState));
      setSelectedSketchId(canonicalIntent.id);
      setScanPreview(canonicalIntent);
      const ghostSourceNode = {
        id: canonicalIntent.id,
        content: canonicalIntent.summary || canonicalIntent.statement || canonicalIntent.goal || '',
        metadata: {
          graphLayer: activeGraphLayer,
        },
      };
      const ghostResult = mutationEngine.syncDraftNodesFromReport(ghostSourceNode, canonicalIntent, {
        layer: activeGraphLayer,
      });
      setGhostProjectionState(ghostResult.registry);
      setStatus([
        canonicalIntent.missingFields.length ? `sketch intent captured | missing: ${canonicalIntent.missingFields.join(', ')}` : 'sketch intent captured',
        ghostResult.projectionRecords.length ? `ghost projection ${ghostResult.projectionRecords[0].status} | ${ghostResult.projectionRecords.length} candidate${ghostResult.projectionRecords.length === 1 ? '' : 's'}` : ghostResult.reason || 'ghost projection pending',
      ].join(' | '));
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
    if (truthKernelVisible && !sketchMode && event.button === 0) {
      const rect = canvasRef.current?.getBoundingClientRect?.();
      const localPoint = rect
        ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
        : null;
      const truthHit = hitTestTruthKernelNode(localPoint, truthKernelRenderModel, truthKernelLayout);
      setSelectedTruthNodeId(truthHit?.id || null);
      if (truthHit) {
        event.preventDefault();
        return;
      }
    }
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
    setIntentState(EMPTY_INTENT_STATE);
    setGhostProjectionState(EMPTY_GHOST_PROJECTION_REGISTRY);
    mutationEngine.setGhostProjectionRegistry(EMPTY_GHOST_PROJECTION_REGISTRY);
    setSketches([]);
    setAnnotations([]);
    setSelectedSketchId(null);
    setSelectedAnnotationId(null);
    setScanPreview(null);
    setStatus('canonical sketch registry cleared');
  };

  const deleteSelection = () => {
    if (selectedSketchId) {
      const nextIntentState = removeIntentRegistryRecord(intentState, selectedSketchId);
      const removedGhosts = mutationEngine.removeGhostProjectionsForSource(selectedSketchId);
      setIntentState(nextIntentState);
      setGhostProjectionState(removedGhosts.registry);
      setSketches(intentRegistryToSketches(nextIntentState));
      setSelectedSketchId(null);
      setScanPreview(getCurrentIntentRecord(nextIntentState));
      setStatus('canonical sketch deleted');
      return;
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
              (card.sourceIntakeId || card.sourceIntentId || card.sourceHandoffId)
                ? h('div', { className: 'team-board-card-meta muted' }, [
                    card.sourceIntakeId ? `Intake ${card.sourceIntakeId}` : null,
                    card.sourceIntentId ? `Intent ${card.sourceIntentId}` : null,
                    card.sourceHandoffId ? `Handoff ${card.sourceHandoffId}` : null,
                  ].filter(Boolean).join(' | '))
                : null,
              (card.taskFlow?.ownerDeskId || card.taskFlow?.assigneeDeskId)
                ? h('div', { className: 'team-board-card-meta muted' }, `Owner ${card.taskFlow?.ownerDeskId || 'planner'} → Next ${card.taskFlow?.assigneeDeskId || 'executor'}`)
                : null,
              taskId ? h('div', { className: 'team-board-card-meta muted' }, `Task ${taskId}`) : null,
              card.executionState?.status && card.executionState.status !== 'not_requested'
                ? h('div', { className: 'team-board-card-meta muted' }, `Execution ${card.executionState.status} | Diff ${card.executionState.diff?.status || 'missing'}`)
                : null,
              (card.executorBlocker?.summary || card.executorBlocker?.message)
                ? h('div', { className: 'team-board-card-meta muted' }, `Blocked ${card.executorBlocker.summary || card.executorBlocker.message}`)
                : null,
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

  const renderQAWorkbenchPanel = () => {
    const qaDesk = getDeskPayload('qa-lead');
    const qaSections = buildQAReadableSectionsFromState(qaState);
    return h('div', { className: 'inspector-block panel-card review-panel browser-pass-panel', 'data-qa': 'qa-desk-summary' },
      h('div', { className: 'inspector-label' }, 'QA Workbench'),
      h('div', { className: 'signal-meta muted' }, 'QA lead is a live automated operator: it runs MCP-backed scans, tests, audits, and evidence capture. Outputs stay read-only downstream.'),
      qaDesk?.desk?.panel ? renderDeskPanelMetadata(qaDesk.desk.panel) : null,
      h('div', { className: 'desk-panel-list qa-readable-sections' }, qaSections.map((section) => renderDeskSection(section, {
        focusCanvasNode: (nodeId) => focusStudioAgent(nodeId),
        openQARun: (runId) => loadQARunDetails(runId),
      }))),
      latestQARun ? h('div', { className: 'signal-meta muted' }, `Latest browser run: ${latestQARun.scenario || 'layout-pass'} | ${latestQARun.verdict || latestQARun.status || 'pending'} | findings ${(latestQARun.findings || []).length || latestQARun.findingCount || 0}`) : null,
    );
  };

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
    const ctoOversight = truth?.ctoOversight && typeof truth.ctoOversight === 'object' ? truth.ctoOversight : null;
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
      ctoOversight ? h('div', { className: 'criteria-row' }, h('span', null, 'Approval-needed items'), h('span', { className: 'muted' }, String(ctoOversight.approvalNeededCount || 0))) : null,
      ctoOversight ? h('div', { className: 'criteria-row' }, h('span', null, 'Completed artefacts'), h('span', { className: 'muted' }, String(ctoOversight.completedArtifactCount || 0))) : null,
      ctoOversight ? h('div', { className: 'criteria-row' }, h('span', null, 'Latest canonical event'), h('span', { className: 'muted' }, ctoOversight.latestActivityAt || 'n/a')) : null,
      h('div', { className: 'criteria-row' }, h('span', null, 'Assessments'), h('span', { className: 'muted' }, String(assessments.length))),
      h('div', { className: 'criteria-row' }, h('span', null, 'Context'), h('span', { className: 'muted' }, describeDeskValue(truth?.context) || 'n/a')),
      h('div', { className: 'criteria-row' }, h('span', null, 'Guardrails'), h('span', { className: 'muted' }, String(guardrails.length))),
      ctoOversight?.approvalNeededItems?.length
        ? h('div', { className: 'criteria-row' }, h('span', null, 'Approval queue'), h('span', { className: 'muted' }, ctoOversight.approvalNeededItems.map((item) => `${item.title} @ ${item.requestedAt || 'n/a'}`).join(' | ')))
        : null,
      ctoOversight?.completedArtifacts?.length
        ? h('div', { className: 'criteria-row' }, h('span', null, 'Archived outcomes'), h('span', { className: 'muted' }, ctoOversight.completedArtifacts.map((item) => `${item.title} @ ${item.archivedAt || item.diffPath || 'n/a'}`).join(' | ')))
        : null,
    );
  };

  const renderDeskProvenanceStrip = (panelData = null, targetDeskId = null) => {
    if (!panelData) return null;
    const provenance = normalizeDeskProvenance(panelData, targetDeskId);
    const summaryText = provenance.sectionSummary.count
      ? `Sections ${provenance.sectionSummary.count}${provenance.sectionSummary.keys.length ? ` | ${provenance.sectionSummary.keys.join(' / ')}` : ''}`
      : 'No canonicalTruthSections surfaced.';
    return h('div', { className: 'desk-panel-item desk-provenance-strip desk-inspector-truth', 'data-qa': 'desk-provenance-strip' },
      h('div', { className: 'inspector-label' }, 'Governed provenance'),
      provenance.hasGovernedProvenance
        ? h(React.Fragment, null,
            h('div', { className: 'signal-summary' }, provenance.domain || targetDeskId || 'desk_properties'),
            h('div', { className: 'criteria-list desk-metric-list' },
              h('div', { className: 'criteria-row' }, h('span', null, 'Domain'), h('span', { className: 'muted' }, provenance.domain || 'n/a')),
              h('div', { className: 'criteria-row' }, h('span', null, 'Projection id'), h('span', { className: 'muted' }, provenance.projectionId || 'n/a')),
              provenance.classification ? h('div', { className: 'criteria-row' }, h('span', null, 'Classification'), h('span', { className: 'muted' }, provenance.classification)) : null,
              provenance.freshness ? h('div', { className: 'criteria-row' }, h('span', null, 'Freshness'), h('span', { className: 'muted' }, provenance.freshness)) : null,
              provenance.generatedAt ? h('div', { className: 'criteria-row' }, h('span', null, 'Generated at'), h('span', { className: 'muted' }, formatTimestamp(provenance.generatedAt))) : null,
              provenance.fallbackUsed !== null ? h('div', { className: 'criteria-row' }, h('span', null, 'Fallback used'), h('span', { className: 'muted' }, provenance.fallbackUsed ? 'yes' : 'no')) : null,
            ),
            h('div', { className: 'signal-meta muted' }, summaryText),
          )
        : h('div', { className: 'signal-empty muted' }, 'No governed provenance.'),
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
    if (deskId === 'cto-chief-of-staff') {
      actions.push({
        id: 'executive-advisory',
        label: 'Executive Advisory',
        onClick: () => openUtilityWindow('executive-advisory', {
          targetDeskId: 'cto-chief-of-staff',
          docked: false,
          position: getExecutiveAdvisoryWindowPosition(),
        }),
      });
    }
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
      ? h('div', { className: 'desk-panel-list utility-list truth-report-list' }, (Array.isArray(reports) ? reports : []).map((report) => h('div', {
          key: report.id || `${report.name}-${report.source}`,
          className: `desk-panel-item utility-card truth-report-card verdict-${report.verdict || 'unknown'}`,
        },
          h('div', { className: 'inline review-header', style: { alignItems: 'flex-start' } },
            h('div', null,
              h('div', { className: 'signal-summary' }, report.name || report.id || 'Report'),
              h('div', { className: 'signal-meta muted' }, report.detail || 'No additional report detail surfaced.'),
            ),
            h('div', { className: 'qa-metric-pill-row truth-report-pill-row' },
              report.verdict ? h('span', { className: `qa-metric-pill tone-${toneForDeskReportVerdict(report.verdict)}` }, report.verdict) : null,
              h('span', { className: 'qa-metric-pill tone-neutral' }, report.type || 'report'),
            ),
          ),
          h('div', { className: 'signal-meta muted' }, `Source ${report.source || 'unknown source'}`),
        )))
      : h('div', { className: 'signal-empty muted' }, emptyState)
  );

  const renderScorecardsList = (scorecards = [], emptyState = 'No scorecards are available yet.') => (
    (Array.isArray(scorecards) ? scorecards : []).length
      ? h('div', { className: 'desk-panel-list utility-list qa-scorecard-list' }, (Array.isArray(scorecards) ? scorecards : []).map((card) => {
          const lifecycleStatus = card.rollupStatus || card.status || 'missing';
          const scoreValue = Number.isFinite(Number(card?.overallScore?.value)) ? Number(card.overallScore.value) : null;
          const scoreMax = Number.isFinite(Number(card?.overallScore?.max)) ? Number(card.overallScore.max) : null;
          return h('div', {
            key: card.id || `${card.desk}-${card.testId}`,
            className: `desk-panel-item utility-card qa-scorecard-card status-${card.status || 'pass'}`,
          },
            h('div', {
              className: 'inline review-header',
              style: { alignItems: 'flex-start' },
            },
              h('div', null,
                h('div', { className: 'signal-summary' }, `${card.desk || 'Desk'} | ${card.testName || card.testId || 'Scorecard'}`),
                h('div', { className: 'signal-meta muted' }, `Rollup ${lifecycleStatus} | Reported ${card.reportedStatus || card.status || 'missing'} | Score ${scoreValue ?? 'n/a'} / ${scoreMax ?? 4}`),
              ),
              h('div', { className: 'qa-metric-pill-row' },
                h('span', { className: 'qa-metric-pill tone-neutral' }, 'Derived score summary'),
              ),
            ),
            card.sourceTrace ? h('div', { className: 'signal-meta muted' }, `Source: ${card.sourceTrace.sourcePath || card.sourcePath || 'unknown'} | ${formatQAEvidenceFreshness(card.sourceTrace.freshnessClass)}`) : null,
            !card.sourceTrace && card.sourceSeam ? h('div', { className: 'signal-meta muted' }, `Source seam: ${card.sourceSeam}`) : null,
            card.sourceTrace?.observedAt ? h('div', { className: 'signal-meta muted' }, `Last updated: ${formatTimestamp(card.sourceTrace.observedAt)}`) : null,
            card.rollupReasons?.[0] ? h('div', { className: 'signal-meta muted' }, card.rollupReasons[0]) : null,
            card.validation?.summary ? h('div', { className: 'signal-meta muted' }, card.validation.summary) : null,
          );
        }))
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
        latestCtoIntakeRecord ? h('div', { className: 'desk-panel-item utility-card' },
          h('div', { className: 'signal-summary' }, 'Canonical intake acknowledgement'),
          h('div', { className: 'signal-meta muted' }, latestCtoIntakeRecord.acknowledgement?.summary || 'Canonical CTO intake recorded.'),
          h('div', { className: 'signal-meta muted' }, [
            latestCtoIntakeRecord.processingStatus || null,
            latestCtoIntakeRecord.updatedAt ? `updated ${formatTimestamp(latestCtoIntakeRecord.updatedAt)}` : null,
            latestCtoIntakeRecord.route || null,
          ].filter(Boolean).join(' | ')),
          latestCtoIntakeRecord.governedLoop?.route
            ? h('div', { className: 'signal-meta muted' }, `Governed loop: ${latestCtoIntakeRecord.governedLoop.route}`)
            : null,
        ) : null,
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
                      entry.action.blockedGates?.length
                        ? h('div', { className: 'signal-meta muted' }, `Blocked by: ${entry.action.blockedGates.map((gate) => gate.label || gate.code).join(', ')}`)
                        : null,
                      h('div', { className: 'button-row cto-chat-action-row' },
                        entry.action.available && entry.action.requiresConfirmation && entry.action.status === 'pending'
                          ? h('button', {
                              className: 'mini',
                              type: 'button',
                              disabled: ctoChatBusy,
                              onClick: () => sendCtoChatMessage({ text: 'Yes, do it.', confirmActionId: entry.action.id }),
                            }, ctoChatBusy ? 'Submitting...' : 'Confirm Action')
                          : null,
                        entry.action.overrideAvailable && entry.action.requiresConfirmation
                          ? h('button', {
                              className: 'mini',
                              type: 'button',
                              disabled: ctoChatBusy,
                              title: entry.action.reason || 'Proceed with an explicit operator override.',
                              onClick: () => sendCtoChatMessage({
                                text: 'Proceed anyway.',
                                confirmActionId: entry.action.id,
                                override: {
                                  enabled: true,
                                  origin: 'cto',
                                  executionMode: 'operator_override',
                                  execution_mode: 'operator_override',
                                  overrideReason: entry.action.reason || null,
                                  override_reason: entry.action.reason || null,
                                  operatorNote: entry.action.reason || null,
                                  operator_note: entry.action.reason || null,
                                  blockedBy: Array.isArray(entry.action.blockedGates) ? entry.action.blockedGates : [],
                                  blocked_by: Array.isArray(entry.action.blockedGates) ? entry.action.blockedGates.map((gate) => gate.code).filter(Boolean) : [],
                                  skippedGates: Array.isArray(entry.action.blockedGates) ? entry.action.blockedGates : [],
                                  skipped_gates: Array.isArray(entry.action.blockedGates) ? entry.action.blockedGates : [],
                                },
                              }),
                            }, ctoChatBusy ? 'Submitting...' : 'Proceed Anyway')
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
                entry.execution?.executionMode
                  ? h('div', { className: 'signal-meta muted' }, `execution_mode: ${entry.execution.executionMode}`)
                  : null,
                entry.execution?.override
                  ? h('div', { className: 'signal-meta muted' }, [
                      entry.execution.override.origin ? `origin: ${entry.execution.override.origin}` : null,
                      entry.execution.override.execution_mode || entry.execution.override.executionMode
                        ? `execution_mode: ${entry.execution.override.execution_mode || entry.execution.override.executionMode}`
                        : null,
                      entry.execution.override.override_reason || entry.execution.override.operator_note
                        ? `override_reason: ${entry.execution.override.override_reason || entry.execution.override.operator_note}`
                        : null,
                      Array.isArray(entry.execution.override.blocked_by) && entry.execution.override.blocked_by.length
                        ? `blocked_by: ${entry.execution.override.blocked_by.join(', ')}`
                        : null,
                    ].filter(Boolean).join(' | '))
                  : null,
                entry.execution?.skippedGates?.length
                  ? h('div', { className: 'signal-meta muted' }, `Skipped gates: ${entry.execution.skippedGates.map((gate) => gate.label || gate.code).join(', ')}`)
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

  const renderChiefOfStaffUtility = () => {
    const advisory = chiefOfStaffLatest;
    const quickPrompts = buildChiefOfStaffQuickPrompts();
    const threadEntries = chiefOfStaffHistory.length
      ? chiefOfStaffHistory
      : advisory.advisory_available
        ? [{
            id: 'chief-latest-reply',
            role: 'assistant',
            text: advisory.reply_text,
            reply_source: advisory.reply_source,
            model_status: advisory.model_status,
            advisory_generated_at: advisory.advisory_generated_at,
            recommendation: advisory.recommendation,
            blocker: advisory.blocker,
            execution_ready: advisory.execution_ready,
          }]
        : [];
    return h('div', { className: 'utility-window-stack executive-advisory-window', 'data-qa': 'executive-advisory-window' },
      h('div', { className: 'utility-window-section utility-window-hero executive-advisory-header', 'data-qa': 'executive-advisory-header' },
        h('div', { className: 'executive-advisory-heading-row' },
          h('div', null,
            h('div', { className: 'inspector-label' }, 'Chief of Staff'),
            h('div', { className: 'signal-summary' }, 'Advisory'),
            h('div', { className: 'signal-meta muted' }, 'Advises CTO Architect | Executive advisory for CTO'),
          ),
          h('div', { className: 'executive-advisory-header-meta' },
            h('span', { className: `agent-panel-status ${advisory.tone}` }, advisory.reply_source || 'pending'),
            h('span', { className: 'signal-meta muted' }, advisory.model_status || 'pending'),
            advisory.advisory_generated_at ? h('span', { className: 'signal-meta muted' }, formatTimestamp(advisory.advisory_generated_at)) : null,
          ),
        ),
      ),
      h('div', { className: 'utility-window-section executive-advisory-card', 'data-qa': 'executive-advisory-recommendation' },
        h('div', { className: 'inspector-label' }, 'Recommendation Summary'),
        h('div', { className: 'signal-summary' }, advisory.recommendation.title),
        h('div', { className: 'executive-advisory-badges' },
          h('span', { className: 'qa-metric-pill tone-neutral' }, advisory.recommendation.category || 'info'),
          h('span', { className: `qa-metric-pill tone-${advisory.execution_ready ? 'good' : (advisory.blocker ? 'warn' : 'neutral')}` }, advisory.readiness_label),
          h('span', { className: 'qa-metric-pill tone-neutral' }, `${advisory.recommendation.confidence_percent}% confidence`),
          advisory.blocker ? h('span', { className: 'qa-metric-pill tone-warn' }, advisory.blocker) : null,
        ),
        h('div', { className: 'criteria-list desk-metric-list' },
          h('div', { className: 'criteria-row' }, h('span', null, 'Category'), h('span', { className: 'muted' }, advisory.recommendation.category || 'info')),
          h('div', { className: 'criteria-row' }, h('span', null, 'Confidence'), h('span', { className: 'muted' }, `${advisory.recommendation.confidence_percent}%`)),
          h('div', { className: 'criteria-row' }, h('span', null, 'Readiness'), h('span', { className: 'muted' }, advisory.execution_ready ? 'Ready for CTO review' : 'Not execution-ready')),
          h('div', { className: 'criteria-row' }, h('span', null, 'Provenance'), h('span', { className: 'muted' }, [
            advisory.reply_source || 'pending',
            advisory.model_status || null,
          ].filter(Boolean).join(' | '))),
        ),
      ),
      h('div', { className: 'utility-window-section executive-advisory-reply', 'data-qa': 'executive-advisory-reply' },
        h('div', { className: 'signal-summary' }, 'Conversational Reply'),
        threadEntries.length
          ? h('div', { className: 'comment-thread executive-advisory-thread' },
              threadEntries.map((entry) => h('div', {
                key: entry.id,
                className: `comment-entry cto-chat-entry ${entry.role === 'user' ? 'is-user' : 'is-assistant'}`,
              },
              h('div', { className: 'comment-meta muted' }, entry.role === 'user' ? 'You' : 'Chief of Staff'),
              entry.reply_source || entry.model_status
                ? h('div', { className: 'signal-meta muted' }, [
                    entry.reply_source || null,
                    entry.model_status || null,
                    entry.advisory_generated_at ? formatTimestamp(entry.advisory_generated_at) : null,
                  ].filter(Boolean).join(' | '))
                : null,
              h('div', { className: 'cto-chat-text' }, entry.text),
              entry.role !== 'user' && entry.blocker
                ? h('div', { className: 'signal-meta muted' }, `Blocker: ${entry.blocker}`)
                : null,
              )))
          : h('div', { className: 'signal-empty muted' }, 'Ask the Chief of Staff for a bounded executive recommendation.'),
      ),
      h('div', { className: 'utility-window-section', 'data-qa': 'executive-advisory-why-now' },
        h('div', { className: 'signal-summary' }, 'Why This Now'),
        h('div', { className: 'signal-meta' }, advisory.why_now || 'No immediate priority has been surfaced yet.'),
      ),
      h('details', { className: 'utility-window-section executive-advisory-evidence', 'data-qa': 'executive-advisory-evidence' },
        h('summary', { className: 'signal-summary executive-advisory-evidence-summary' }, 'Evidence'),
        h('div', { className: 'criteria-list desk-metric-list' },
          h('div', { className: 'criteria-row' }, h('span', null, 'Blocked'), h('span', { className: 'muted' }, advisory.posture.blocked ? 'yes' : 'no')),
          h('div', { className: 'criteria-row' }, h('span', null, 'Blocker'), h('span', { className: 'muted' }, advisory.blocker || 'none')),
          h('div', { className: 'criteria-row' }, h('span', null, 'Canonical available'), h('span', { className: 'muted' }, advisory.posture.canonical_available ? 'yes' : 'no')),
          h('div', { className: 'criteria-row' }, h('span', null, 'System confidence'), h('span', { className: 'muted' }, advisory.posture.system_confidence == null ? 'n/a' : `${Math.round(advisory.posture.system_confidence * 100)}%`)),
          advisory.posture.blocker?.stage ? h('div', { className: 'criteria-row' }, h('span', null, 'Stage'), h('span', { className: 'muted' }, advisory.posture.blocker.stage)) : null,
        ),
      ),
      h('div', { className: 'utility-window-section executive-advisory-bridge', 'data-qa': 'executive-advisory-bridge' },
        h('div', { className: 'signal-summary' }, 'Execution Bridge'),
        h('div', { className: `agent-panel-status ${advisory.execution_ready ? 'processing' : advisory.tone}` }, advisory.readiness_label),
        h('div', { className: 'signal-meta muted' }, advisory.bridge_detail),
        h('button', {
          className: 'mini',
          type: 'button',
          disabled: true,
          title: 'Chief of Staff recommendations are advisory context only. CTO remains the execution authority.',
        }, 'Visible to CTO Context'),
      ),
      h('div', { className: 'utility-window-section executive-advisory-compose', 'data-qa': 'executive-advisory-compose' },
        h('div', { className: 'signal-summary' }, 'Ask Chief of Staff'),
        h('div', { className: 'button-row executive-advisory-prompts' },
          quickPrompts.map((prompt) => h('button', {
            key: prompt,
            className: 'mini',
            type: 'button',
            disabled: chiefOfStaffBusy,
            onClick: () => sendChiefOfStaffMessage(prompt),
          }, prompt)),
        ),
        h('textarea', {
          className: 'comment-box cto-chat-box executive-advisory-box',
          value: chiefOfStaffDraft,
          placeholder: 'Ask for posture, blockers, slice guidance, or CTO readiness...',
          onChange: (event) => setChiefOfStaffDraft(event.target.value),
          onKeyDown: (event) => {
            if (event.key !== 'Enter' || event.shiftKey) return;
            event.preventDefault();
            if (chiefOfStaffBusy || !chiefOfStaffDraft.trim()) return;
            sendChiefOfStaffMessage(chiefOfStaffDraft);
          },
          disabled: chiefOfStaffBusy,
        }),
        h('div', { className: 'button-row cto-chat-compose-row' },
          h('button', {
            className: 'mini',
            type: 'button',
            onClick: () => refreshChiefOfStaffAdvisory(),
            disabled: chiefOfStaffBusy,
          }, 'Refresh Advisory'),
          h('button', {
            className: 'mini',
            type: 'button',
            disabled: chiefOfStaffBusy || !chiefOfStaffDraft.trim(),
            onClick: () => sendChiefOfStaffMessage(chiefOfStaffDraft),
          }, chiefOfStaffBusy ? 'Advising...' : 'Ask'),
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
      const canonicalSeats = rosterSurface.canonicalSeats;
      const openRoles = rosterSurface.openRoles;
      const blockers = rosterSurface.blockers;
      const hiringSignals = rosterSurface.hiringSignals;
    const prioritizedResourceSignals = listDepartmentsByPriority(resourceSignalModel);
  const resourceSignals = Array.isArray(prioritizedResourceSignals) ? prioritizedResourceSignals : [];
    const activeDepartmentCards = desks.length ? desks : departments;
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
              h('div', { className: 'criteria-row' }, h('span', null, 'Canonical open seats'), h('span', { className: 'muted' }, String(summary.openRoleCount || canonicalSeats.length || 0))),
              h('div', { className: 'criteria-row' }, h('span', null, 'Missing leads'), h('span', { className: 'muted' }, String(summary.missingLeadCount || 0))),
              h('div', { className: 'criteria-row' }, h('span', null, 'Canonical blockers'), h('span', { className: 'muted' }, String(summary.blockerCount || blockers.length || 0))),
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
            h('div', { className: 'signal-summary' }, desks.length ? 'Canonical desk coverage' : 'Department coverage'),
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
        h('div', { className: 'signal-summary' }, 'Canonical open seats'),
        blockers.length
          ? h('div', { className: 'desk-panel-list utility-list' }, canonicalSeats.filter((entry) => entry.blocker).map((entry) => h('div', {
              key: `${entry.entityType}-${entry.entityId}-${entry.roleId || entry.kind}`,
              className: 'desk-panel-item utility-card',
            },
              h('div', { className: 'signal-summary' }, `${entry.entityLabel || entry.entityId} | ${entry.roleLabel || entry.roleId || entry.kind}`),
              h('div', { className: 'signal-meta muted' }, `${entry.kind} | shortfall ${entry.shortfall || 0} | urgency ${entry.urgency || 'low'}`),
              h('div', { className: 'signal-meta muted' }, `${entry.departmentLabel || entry.departmentId || 'Unknown department'} | ${entry.entityType}`),
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
        if (windowId === 'executive-advisory') {
          content = renderChiefOfStaffUtility();
        } else if (windowId === 'cto-chat') {
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
            renderScorecardsList(panelData?.qa?.scorecards || []),
          );
        }
        const windowMeta = UTILITY_WINDOW_META[windowId] || {};
        return h('section', {
          key: windowId,
          className: `utility-window ${config.docked ? 'docked' : 'floating'} ${config.minimized ? 'minimized' : ''} ${windowId === 'cto-chat' ? 'cto-chat-shell' : ''} ${windowId === 'executive-advisory' ? 'executive-advisory-shell' : ''}`.trim(),
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
              h('div', { className: 'inspector-label' }, windowMeta.chromeLabel || 'Utility Window'),
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
            className: `utility-window-body ${windowId === 'cto-chat' ? 'cto-chat-utility-body' : ''} ${windowId === 'executive-advisory' ? 'executive-advisory-utility-body' : ''}`.trim(),
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
        renderDeskProvenanceStrip(panelData, targetDeskId),
        renderDeskPanelMetadata(panelData?.desk?.panel),
        contextDeskSnapshot?.qa ? h('div', { className: 'desk-panel-item desk-truth-summary desk-inspector-truth qa-evidence-feed', 'data-qa': 'qa-evidence-feed' },
          h('div', { className: 'inspector-label' }, 'QA Evidence Feed'),
          h('div', { className: 'signal-summary' }, contextDeskSnapshot.qa.summary || 'QA evidence feed available for downstream review.'),
          h('div', { className: 'signal-meta muted' }, contextDeskSnapshot.qa.liveStatus?.summary || 'QA live status unavailable.'),
          h('div', { className: 'criteria-list' },
            h('div', { className: 'criteria-row' }, h('span', null, 'Live gate'), h('span', { className: 'muted' }, contextDeskSnapshot.qa.liveStatus?.status || 'unknown')),
            h('div', { className: 'criteria-row' }, h('span', null, 'Feed items'), h('span', { className: 'muted' }, String(contextDeskSnapshot.qa.feed?.length || 0))),
            h('div', { className: 'criteria-row' }, h('span', null, 'Last completed cycle'), h('span', { className: 'muted' }, contextDeskSnapshot.qa.lead?.last_completed_cycle_at ? formatTimestamp(contextDeskSnapshot.qa.lead.last_completed_cycle_at) : 'unknown')),
          ),
          contextDeskSnapshot.qa.feed?.length
            ? h('div', { className: 'desk-panel-list utility-list qa-output-feed-list' },
                contextDeskSnapshot.qa.feed.slice(0, 3).map((item, index) => h('div', {
                  key: item.id || `qa-evidence-${index}`,
                  className: `desk-panel-item utility-card qa-output-feed-card status-${item.status || 'unknown'}`,
                },
                  h('div', { className: 'signal-summary' }, item.label || item.tool || 'QA tool result'),
                  h('div', { className: 'signal-meta muted' }, `${item.tool || 'qa_tool'} | ${item.verdict || item.status || 'unknown'}`),
                  h('div', { className: 'signal-meta muted' }, item.summary || 'No summary recorded.'),
                )))
            : h('div', { className: 'signal-empty muted' }, 'No QA evidence feed items are available yet.'),
        ) : null,
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
                buildQAReadableSectionsFromState(buildQaDeskReadableState(panelData)).map((section) => renderDeskSection(section, {
                  openQARun: (runId) => loadQARunDetails(runId),
                })),
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
                (task.sourceIntakeId || task.sourceIntentId || task.sourceHandoffId)
                  ? h('div', { className: 'signal-meta muted' }, [
                      task.sourceIntakeId ? `intake ${task.sourceIntakeId}` : null,
                      task.sourceIntentId ? `intent ${task.sourceIntentId}` : null,
                      task.sourceHandoffId ? `handoff ${task.sourceHandoffId}` : null,
                    ].filter(Boolean).join(' | '))
                  : null,
                (task.ownerDeskId || task.nextOwnerDeskId || task.taskPhase || task.assignmentState)
                  ? h('div', { className: 'signal-meta muted' }, [
                      task.ownerDeskId || task.nextOwnerDeskId ? `owner ${task.ownerDeskId || 'unknown'} → ${task.nextOwnerDeskId || 'unknown'}` : null,
                      task.taskPhase ? `phase ${task.taskPhase}` : null,
                      task.assignmentState ? `assignment ${task.assignmentState}` : null,
                    ].filter(Boolean).join(' | '))
                  : null,
                task.blockedReason
                  ? h('div', { className: 'signal-meta muted' }, `blocked ${task.blockedReason}`)
                  : null,
                task.executionState?.status && task.executionState.status !== 'not_requested'
                  ? h('div', { className: 'signal-meta muted' }, [
                      `execution ${task.executionState.status}`,
                      `package ${task.executionState.packageStatus || 'idle'}`,
                      `diff ${task.executionState.diff?.status || 'missing'}`,
                      task.executionState.taskId ? `task ${task.executionState.taskId}` : null,
                    ].filter(Boolean).join(' | '))
                  : null,
                task.executionState?.diff?.path
                  ? h('div', { className: 'signal-meta muted' }, `patch ${task.executionState.diff.path}`)
                  : null,
                task.qaState?.status
                  ? h('div', { className: 'signal-meta muted' }, [
                      `qa ${task.qaState.status}`,
                      task.qaState.scorecardId ? `scorecard ${task.qaState.scorecardId}` : null,
                      task.qaState.qaRunId ? `run ${task.qaState.qaRunId}` : null,
                    ].filter(Boolean).join(' | '))
                  : null,
                task.qaState?.followup?.deskId
                  ? h('div', { className: 'signal-meta muted' }, `qa route ${task.qaState.followup.deskId}${task.qaState.followup.reason ? ` | ${task.qaState.followup.reason}` : ''}`)
                  : null,
                task.archivistState?.status
                  ? h('div', { className: 'signal-meta muted' }, [
                      `archivist ${task.archivistState.status}`,
                      task.archivistState.outcomeStatus ? `outcome ${task.archivistState.outcomeStatus}` : null,
                      task.archivistState.archivedAt ? `at ${task.archivistState.archivedAt}` : null,
                    ].filter(Boolean).join(' | '))
                  : null,
                task.archivistState?.summary
                  ? h('div', { className: 'signal-meta muted' }, `archive summary ${task.archivistState.summary}`)
                  : null,
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
        !deskPanelBusy && panelData && deskPanelTab === 'reports'
          ? renderReportsList(panelData.reports || [], 'no reports available')
          : null,
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
            h('button', {
              className: `mini ${truthKernelVisible ? 'active' : ''}`,
              onClick: () => setTruthKernelVisible((value) => !value),
              type: 'button',
              disabled: truthKernelToggleState.disabled,
              title: truthKernelToggleState.title,
              'data-qa': 'truth-kernel-toggle',
            }, truthKernelToggleState.label),
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
              ref: truthKernelCanvasRef,
              className: 'truth-kernel-canvas',
              width: 1600,
              height: 920,
              'aria-hidden': true,
              style: {
                opacity: truthKernelVisible ? 1 : 0,
              },
            }),
            h('canvas', {
              ref: canvasRef,
              className: 'spatial-main-canvas',
              width: 1600,
              height: 920,
              style: truthKernelVisible ? {
                opacity: 0.62,
                filter: 'saturate(0.68) brightness(0.72)',
              } : null,
              tabIndex: 0,
              onDoubleClick: onCanvasDoubleClick,
              onWheel: onCanvasWheel,
              onMouseDown: onCanvasMouseDown,
              onContextMenu: (event) => event.preventDefault(),
            }),
            truthKernelVisible ? h('div', {
              className: 'truth-inspection-veil',
              'aria-hidden': true,
            }) : null,
            h('div', {
              className: 'truth-kernel-hud',
              'data-qa': 'truth-kernel-status',
            },
              h('div', { className: 'truth-kernel-hud__header' },
                h('div', null,
                  h('div', { className: 'truth-kernel-hud__eyebrow' }, truthKernelVisible ? 'Truth overlay active' : 'Truth render ready'),
                  h('div', { className: 'truth-kernel-hud__title' }, truthKernelRenderSummary.line),
                ),
                h('div', { className: 'qa-metric-pill-row truth-kernel-status-pills' },
                  h('span', { className: `qa-metric-pill tone-${toneForTruthKernelStatus(truthKernelStatusSummary.dominantStatus)}` }, `${truthKernelStatusSummary.issueCount ? 'Issues surfaced' : 'Kernel stable'}`),
                  h('span', { className: 'qa-metric-pill tone-neutral' }, `Nodes ${truthKernelStatusSummary.total}`),
                  truthKernelRenderSummary.fallbackUsed ? h('span', { className: 'qa-metric-pill tone-warn' }, 'Fallback route') : null,
                ),
              ),
              truthKernelVisible ? h('div', { className: 'qa-metric-pill-row truth-kernel-status-pills' },
                Object.entries(truthKernelStatusSummary.counts).map(([status, count]) => h('span', {
                  key: status,
                  className: `qa-metric-pill tone-${toneForTruthKernelStatus(status)}`,
                }, `${status} ${count}`)),
              ) : null,
              truthKernelVisible ? h('div', { className: 'truth-kernel-diagnostic-grid' },
                h('div', {
                  className: `truth-kernel-diagnostic-card tone-${toneForTruthKernelDiagnosis(truthKernelRenderSummary.spread?.diagnosis)}`,
                  'data-qa': 'truth-kernel-spread',
                },
                  h('div', { className: 'truth-kernel-diagnostic-card__label' }, 'Spread'),
                  h('div', { className: 'truth-kernel-diagnostic-card__value' }, truthKernelRenderSummary.spread?.diagnosis || 'unavailable'),
                  h('div', { className: 'truth-kernel-diagnostic-card__detail mono' }, truthKernelRenderSummary.spread?.line || 'No spread diagnostics available.'),
                ),
                h('div', {
                  className: `truth-kernel-diagnostic-card tone-${toneForTruthKernelDiagnosis(truthKernelRenderSummary.positionOrigin?.verdict)}`,
                  'data-qa': 'truth-kernel-origin',
                },
                  h('div', { className: 'truth-kernel-diagnostic-card__label' }, 'Position origin'),
                  h('div', { className: 'truth-kernel-diagnostic-card__value' }, truthKernelRenderSummary.positionOrigin?.verdict || 'unavailable'),
                  h('div', { className: 'truth-kernel-diagnostic-card__detail mono' }, truthKernelRenderSummary.positionOrigin?.likelyOrigin || 'No position-origin diagnosis available.'),
                ),
              ) : null,
            ),
            truthKernelVisible ? h('div', {
              className: 'truth-inspection-legend',
              'data-qa': 'truth-inspection-legend',
            },
              h('div', { className: 'truth-inspection-legend__title' }, 'Truth Status + Visual Encoding'),
              h('div', { className: 'qa-metric-pill-row truth-kernel-status-pills' },
                h('span', { className: 'qa-metric-pill tone-good' }, 'healthy'),
                h('span', { className: 'qa-metric-pill tone-warn' }, 'degraded'),
                h('span', { className: 'qa-metric-pill tone-bad' }, 'blocked / orphaned'),
                h('span', { className: 'qa-metric-pill tone-neutral' }, 'derived visual'),
              ),
              truthInspectionLegend.map((entry) => h('div', {
                key: entry.axis,
                className: 'truth-inspection-legend__row',
              },
                h('span', { className: 'truth-inspection-legend__axis mono' }, entry.axis),
                h('span', { className: 'truth-inspection-legend__meaning' }, entry.meaning),
              )),
            ) : null,
            h('div', {
              className: `observability-rail ${truthInspectionPanelState.compact ? 'compact' : 'expanded'}`,
              'data-qa': 'observability-rail',
              'data-compact': truthInspectionPanelState.compact ? 'true' : 'false',
              style: {
                position: 'absolute',
                top: '16px',
                right: '16px',
                width: `${truthInspectionPanelState.railWidth}px`,
                maxHeight: 'calc(100% - 32px)',
                overflowY: 'auto',
                pointerEvents: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                zIndex: 6,
            },
            },
              truthKernelVisible && selectedTruthNodeInspector ? h('div', {
                className: 'truth-kernel-inspector',
                'data-qa': 'truth-kernel-inspector',
              },
                h('div', { className: 'truth-kernel-inspector-label' }, 'Truth Node'),
                h('div', { className: 'truth-kernel-inspector-value' }, selectedTruthNodeInspector.label),
                h('div', { className: 'truth-kernel-inspector-meta mono' }, selectedTruthNodeInspector.id),
                h('div', { className: 'qa-metric-pill-row truth-kernel-status-pills' },
                  h('span', { className: `qa-metric-pill tone-${toneForTruthKernelStatus(selectedTruthNode.status)}` }, selectedTruthNode.status || 'informational'),
                  h('span', { className: 'qa-metric-pill tone-neutral' }, selectedTruthNodeInspector.type),
                  h('span', {
                    className: `qa-metric-pill tone-${selectedTruthNode.canonicalSource ? 'good' : (selectedTruthNode.derivedSource ? 'warn' : 'neutral')}`,
                  }, selectedTruthNode.canonicalSource ? 'canonical source' : (selectedTruthNode.derivedSource ? 'derived source' : 'source unknown')),
                ),
                h('div', { className: 'truth-kernel-inspector-meta' }, `source ${selectedTruthNodeInspector.meta.sourceType} / ${selectedTruthNodeInspector.meta.sourceRef}`),
                h('div', { className: 'truth-kernel-inspector-meta' }, `timestamp ${formatTruthKernelTimestamp(selectedTruthNode.timestamp)} | parents ${selectedTruthNodeInspector.meta.parents} | children ${selectedTruthNodeInspector.meta.children}`),
                selectedTruthNodeInspector.meta.summary ? h('div', { className: 'truth-kernel-inspector-summary' }, selectedTruthNodeInspector.meta.summary) : null,
                h('div', { className: 'truth-kernel-inspector-grid' },
                  selectedTruthNodeInspector.rows.map((row) => h('div', {
                    key: row.label,
                    className: 'truth-kernel-inspector-row',
                  },
                    h('div', { className: 'truth-kernel-inspector-row__label' }, row.label),
                    h('div', { className: 'truth-kernel-inspector-row__value' }, row.value),
                    h('div', { className: `truth-kernel-inspector-row__origin origin-${row.origin}` }, row.origin),
                  )),
                ),
              ) : null,
              renderTruthKernelProvenanceRail(truthKernel),
              h('div', {
                className: 'observability-title',
                style: {
                  background: 'rgba(10, 16, 26, 0.92)',
                  border: '1px solid rgba(112, 161, 255, 0.32)',
                  borderRadius: '12px',
                  padding: '10px 12px',
                  color: '#d8e7fb',
                  boxShadow: '0 10px 24px rgba(0, 0, 0, 0.28)',
                },
              },
                h('div', {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                  },
                },
                  h('div', null,
                    h('div', { style: { fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8fb2ff' } }, 'Observability'),
                    h('div', { style: { marginTop: '4px', fontSize: '14px', fontWeight: 600 } }, truthInspectionPanelState.compact ? 'Inspection focus mode' : 'Canonical intent, field, and ghost layers'),
                  ),
                  truthKernelVisible ? h('button', {
                    type: 'button',
                    className: 'observability-toggle mini',
                    onClick: () => setTruthInspectionCompact((value) => !value),
                    title: truthInspectionPanelState.title,
                    style: {
                      pointerEvents: 'auto',
                      alignSelf: 'flex-start',
                    },
                    'data-qa': 'observability-compact-toggle',
                  }, truthInspectionPanelState.toggleLabel) : null,
                ),
                truthInspectionPanelState.compact
                  ? h('div', {
                    className: 'observability-compact-caption',
                    style: {
                      marginTop: '6px',
                      fontSize: '12px',
                      color: '#b8c8e6',
                    },
                  }, 'Truth inspection keeps provenance visible while collapsing the larger observability cards.')
                  : null,
              ),
              truthInspectionPanelState.showObservabilityCards ? h('div', {
                className: 'observability-card intent',
                style: {
                  background: 'rgba(10, 16, 26, 0.88)',
                  border: '1px solid rgba(112, 161, 255, 0.22)',
                  borderRadius: '12px',
                  padding: '10px 12px',
                  color: '#d8e7fb',
                  boxShadow: '0 10px 24px rgba(0, 0, 0, 0.24)',
                },
              },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8fb2ff' } },
                  h('span', null, 'Intent'),
                  h('span', null, currentCanonicalIntentRecord?.status || 'missing'),
                ),
                h('div', { style: { marginTop: '6px', fontSize: '13px', fontWeight: 600 } }, String(currentCanonicalIntentRecord?.summary || currentCanonicalIntentRecord?.statement || currentCanonicalIntentRecord?.goal || 'No canonical intent record')),
                h('div', { style: { marginTop: '4px', fontSize: '12px', color: '#b8c8e6' } }, `id: ${currentCanonicalIntentRecord?.id || 'missing'} | generatedAt: ${currentCanonicalIntentRecord?.provenance?.createdAt || currentCanonicalIntentRecord?.createdAt || 'missing'}`),
                h('div', { style: { marginTop: '4px', fontSize: '12px', color: '#b8c8e6' } }, `confidence: ${Number.isFinite(Number(currentCanonicalIntentRecord?.confidence)) ? `${Math.round(Number(currentCanonicalIntentRecord.confidence) * 100)}%` : 'missing'}`),
                h('div', { style: { marginTop: '4px', fontSize: '12px', color: '#b8c8e6' } }, `provenance: ${currentCanonicalIntentRecord?.provenance?.sourceType || 'missing'} / ${currentCanonicalIntentRecord?.provenance?.sourceRef || currentCanonicalIntentRecord?.sourceRef || 'missing'}`),
                currentCanonicalIntentRecord?.missingFields?.length ? h('div', { style: { marginTop: '4px', fontSize: '12px', color: '#ffcf7a' } }, `missing: ${currentCanonicalIntentRecord.missingFields.join(', ')}`) : null,
              ) : null,
              truthInspectionPanelState.showObservabilityCards ? h('div', {
                className: 'observability-card intake',
                style: {
                  background: 'rgba(10, 16, 26, 0.88)',
                  border: '1px solid rgba(112, 161, 255, 0.22)',
                  borderRadius: '12px',
                  padding: '10px 12px',
                  color: '#d8e7fb',
                  boxShadow: '0 10px 24px rgba(0, 0, 0, 0.24)',
                },
              },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8fb2ff' } },
                  h('span', null, 'Intake'),
                  h('span', null, latestCanvasIntakeRecord?.processingStatus || 'missing'),
                ),
                h('div', { style: { marginTop: '6px', fontSize: '13px', fontWeight: 600 } }, String(latestCanvasIntakeRecord?.acknowledgement?.summary || 'No canonical canvas intake acknowledgement')),
                h('div', { style: { marginTop: '4px', fontSize: '12px', color: '#b8c8e6' } }, `id: ${latestCanvasIntakeRecord?.id || 'missing'} | updatedAt: ${latestCanvasIntakeRecord?.updatedAt || latestCanvasIntakeRecord?.createdAt || 'missing'}`),
                h('div', { style: { marginTop: '4px', fontSize: '12px', color: '#b8c8e6' } }, `sourceRef: ${latestCanvasIntakeRecord?.sourceRef || 'missing'} | route: ${latestCanvasIntakeRecord?.route || 'pending'}`),
                h('div', { style: { marginTop: '4px', fontSize: '12px', color: '#b8c8e6' } }, `intent extraction: ${latestCanvasIntakeRecord?.intentExtraction?.status || 'pending'}${latestCanvasIntakeRecord?.intentExtraction?.canonicalIntentId ? ` | intentId: ${latestCanvasIntakeRecord.intentExtraction.canonicalIntentId}` : ''}`),
                latestCanvasIntakeRecord?.intentExtraction?.summary
                  ? h('div', { style: { marginTop: '4px', fontSize: '12px', color: '#b8c8e6' } }, latestCanvasIntakeRecord.intentExtraction.summary)
                  : null,
                ['degraded', 'failed'].includes(String(latestCanvasIntakeRecord?.intentExtraction?.status || '').trim().toLowerCase())
                  ? h('div', { style: { marginTop: '4px', fontSize: '12px', color: '#ffcf7a' } }, `raw input: ${latestCanvasIntakeRecord?.text || 'missing'}`)
                  : null,
                latestCanvasIntakeRecord?.intentExtraction?.reason
                  ? h('div', { style: { marginTop: '4px', fontSize: '12px', color: '#ffcf7a' } }, latestCanvasIntakeRecord.intentExtraction.reason)
                  : null,
                h('div', { style: { marginTop: '4px', fontSize: '12px', color: '#b8c8e6' } }, `governed loop: ${latestCanvasIntakeRecord?.governedLoop?.route || 'missing'}`),
                latestCanvasIntakeRecord?.resultSummary ? h('div', { style: { marginTop: '4px', fontSize: '12px', color: '#b8c8e6' } }, latestCanvasIntakeRecord.resultSummary) : null,
              ) : null,
              truthInspectionPanelState.showObservabilityCards ? h('div', {
                className: 'observability-card field',
                style: {
                  background: 'rgba(10, 16, 26, 0.88)',
                  border: '1px solid rgba(112, 161, 255, 0.22)',
                  borderRadius: '12px',
                  padding: '10px 12px',
                  color: '#d8e7fb',
                  boxShadow: '0 10px 24px rgba(0, 0, 0, 0.24)',
                },
              },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8fb2ff' } },
                  h('span', null, 'Field'),
                  h('span', null, currentFieldInfluence?.status || 'missing'),
                ),
                h('div', { style: { marginTop: '6px', fontSize: '13px', fontWeight: 600 } }, String(currentFieldInfluence?.summary || currentFieldInfluence?.field?.summary || 'No canonical field influence')),
                h('div', { style: { marginTop: '4px', fontSize: '12px', color: '#b8c8e6' } }, `fieldKey: ${currentFieldInfluence?.fieldKey || 'missing'} | generatedAt: ${currentFieldInfluence?.provenance?.createdAt || currentCanonicalIntentRecord?.createdAt || 'missing'}`),
                h('div', { style: { marginTop: '4px', fontSize: '12px', color: '#b8c8e6' } }, `sourceIntentId: ${currentFieldInfluence?.sourceIntentId || currentCanonicalIntentRecord?.id || 'missing'} | confidence: ${Number.isFinite(Number(currentFieldInfluence?.sourceIntentConfidence)) ? `${Math.round(Number(currentFieldInfluence.sourceIntentConfidence) * 100)}%` : 'missing'}`),
                h('div', { style: { marginTop: '4px', fontSize: '12px', color: '#b8c8e6' } }, `provenance: ${currentFieldInfluence?.provenance?.interpreter || currentCanonicalIntentRecord?.provenance?.interpreter || 'missing'}`),
                currentFieldInfluence?.missingFields?.length ? h('div', { style: { marginTop: '4px', fontSize: '12px', color: '#ffcf7a' } }, `missing: ${currentFieldInfluence.missingFields.join(', ')}`) : null,
              ) : null,
              truthInspectionPanelState.showObservabilityCards ? h('div', {
                className: 'observability-card ghost',
                style: {
                  background: 'rgba(10, 16, 26, 0.88)',
                  border: '1px solid rgba(112, 161, 255, 0.22)',
                  borderRadius: '12px',
                  padding: '10px 12px',
                  color: '#d8e7fb',
                  boxShadow: '0 10px 24px rgba(0, 0, 0, 0.24)',
                },
              },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8fb2ff' } },
                  h('span', null, 'Ghost'),
                  h('span', null, currentGhostProjection?.status || 'missing'),
                ),
                h('div', { style: { marginTop: '6px', fontSize: '13px', fontWeight: 600 } }, currentGhostProjection ? summarizeGhostProjection(currentGhostProjection) : 'No ghost projection record'),
                h('div', { style: { marginTop: '4px', fontSize: '12px', color: '#b8c8e6' } }, `id: ${currentGhostProjection?.id || 'missing'} | generatedAt: ${currentGhostProjection?.provenance?.createdAt || 'missing'}`),
                h('div', { style: { marginTop: '4px', fontSize: '12px', color: '#b8c8e6' } }, `sourceIntentIds: ${Array.isArray(currentGhostProjection?.sourceIntentIds) && currentGhostProjection.sourceIntentIds.length ? currentGhostProjection.sourceIntentIds.join(', ') : 'missing'}`),
                h('div', { style: { marginTop: '4px', fontSize: '12px', color: '#b8c8e6' } }, `confidence: ${Number.isFinite(Number(currentGhostProjection?.confidence)) ? `${Math.round(Number(currentGhostProjection.confidence) * 100)}%` : 'missing'}`),
                h('div', { style: { marginTop: '4px', fontSize: '12px', color: '#b8c8e6' } }, `provenance: ${currentGhostProjection?.provenance?.sourceType || 'missing'} / ${currentGhostProjection?.provenance?.sourceRef || 'missing'}`),
                currentGhostProjection?.reasoning?.length ? h('div', { style: { marginTop: '4px', fontSize: '12px', color: '#b8c8e6' } }, currentGhostProjection.reasoning.join(' | ')) : null,
              ) : null,
            ),
            annotations.map((note) => {
              const x = note.position.x * canvasViewport.zoom + canvasViewport.x;
              const y = note.position.y * canvasViewport.zoom + canvasViewport.y;
              return h('div', {
                key: note.id,
                className: `annotation ${selectedAnnotationId === note.id ? 'selected' : ''}`,
                style: {
                  left: `${x}px`,
                  top: `${y}px`,
                  transform: `scale(${canvasViewport.zoom})`,
                  transformOrigin: 'top left',
                  opacity: truthKernelVisible ? 0.46 : 1,
                },
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
              const draftConfidence = node.metadata?.rsg?.confidence;
              const lowConfidenceDraft = isLowConfidence(draftConfidence);
              const primaryIntentNode = isPrimaryIntentNode(node);
              const recentNodeChange = activeGraphLayer === 'world' && showRecentWorldChanges
                ? resolveRecentWorldNodeChange(recentWorldChange, node.id)
                : null;
              const intentFooterText = primaryIntentNode
                ? PRIMARY_INTENT_REDIRECT_HINT
                : node.metadata?.intentAnalysis
                  ? summarizeIntentReport(node.metadata.intentAnalysis)
                  : SECONDARY_DRAFT_HINT;
              return h('div', {
                key: node.id,
                className: `node ${classified.type} ${classified.metadata.role} layer-${activeGraphLayer} origin-${nodeOrigin} ${selectedId === node.id ? 'selected' : ''} ${lowConfidenceDraft ? 'rsg-low-confidence' : ''} ${recentNodeChange ? `recent-world-change recent-world-${recentNodeChange.changeType}` : ''}`,
                'data-representation-id': nodeRepresentation?.rep_id || null,
                'data-representation-kind': nodeRepresentation?.kind || 'legacy',
                style: {
                  left: `${x}px`,
                  top: `${y}px`,
                  transform: `scale(${canvasViewport.zoom})`,
                  transformOrigin: 'top left',
                  pointerEvents: sketchMode ? 'none' : 'auto',
                  opacity: truthKernelVisible ? 0.52 : (sketchMode ? 0.82 : 1),
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
                  h('div', { className: 'node-intent-summary' }, intentFooterText),
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
                const workerCard = buildAgentWorkerCardModel(desk);
                const chiefDesk = desk.id === 'cto-chief-of-staff';
                const cardMeta = chiefDesk
                  ? {
                      tone: chiefOfStaffDeskPresentation.statusTone,
                      badge: chiefOfStaffDeskPresentation.statusBadge,
                    }
                  : meta;
                const cardFocusSummary = chiefDesk ? chiefOfStaffDeskPresentation.focusSummary : desk.focusSummary;
                const cardThroughputLabel = chiefDesk ? chiefOfStaffDeskPresentation.throughputLabel : desk.throughputLabel;
                const cardLatestSignal = chiefDesk ? chiefOfStaffDeskPresentation.latestSignal : desk.latestSignal;
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
                    h('div', { className: 'desk-card-truth-line' }, cardFocusSummary || desk.role),
                    h('div', { className: 'desk-card-truth-line muted' }, cardThroughputLabel),
                    cardLatestSignal ? h('div', { className: 'desk-card-truth-line muted' }, cardLatestSignal) : null,
                    desk.dependencyWarningSummary ? h('div', { className: 'desk-card-truth-line warning' }, desk.dependencyWarningSummary) : null,
                  ),
                  pageBadge ? h('div', { className: 'desk-page-badge' }, pageBadge) : null,
                  h('div', { className: 'station-desk' },
                    h('div', { className: `desk-light ${desk.activityPulse ? 'pulse' : ''} ${desk.unresolved ? 'warning' : ''}` }),
                    h('div', { className: 'station-prop' }),
                    h('div', { className: 'station-screen' }),
                  ),
                  h('div', {
                    style: {
                      position: 'relative',
                      display: 'inline-flex',
                    },
                  },
                    h(PixelAvatar, { accent: desk.theme.accent, status: desk.status }),
                    h('div', {
                      style: {
                        position: 'absolute',
                        right: '-10px',
                        bottom: '2px',
                        minWidth: '22px',
                        height: '22px',
                        borderRadius: '999px',
                        border: `1px solid ${workerCard.cognitionMode === 'fallback' ? 'rgba(255, 120, 95, 0.52)' : (workerCard.cognitionMode === 'model_live' ? 'rgba(127, 220, 164, 0.5)' : 'rgba(152, 183, 215, 0.45)')}`,
                        background: 'rgba(9, 15, 24, 0.9)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        boxShadow: '0 8px 18px rgba(0, 0, 0, 0.28)',
                      },
                      title: `${workerCard.name} | ${workerCard.cognitionMode}`,
                    }, workerCard.icon),
                  ),
                  h('div', { className: `status-chip ${cardMeta.tone}` }, cardMeta.badge),
                  h('div', { className: `org-status-chip ${getOrgStatusMeta(desk.statusLabel || desk.orgStatus).tone}` }, getOrgStatusMeta(desk.statusLabel || desk.orgStatus).badge),
                  h('div', { className: 'agent-label' }, desk.shortLabel),
                  selectedAgentId === desk.id ? h('div', {
                    style: {
                      position: 'absolute',
                      left: 'calc(100% + 14px)',
                      top: '-6px',
                      width: '228px',
                      padding: '12px 14px',
                      borderRadius: '16px',
                      background: 'rgba(8, 13, 22, 0.96)',
                      border: `1px solid ${workerCard.cognitionMode === 'fallback' ? 'rgba(255, 120, 95, 0.36)' : (workerCard.cognitionMode === 'model_live' ? 'rgba(127, 220, 164, 0.34)' : 'rgba(152, 183, 215, 0.28)')}`,
                      boxShadow: '0 18px 42px rgba(0, 0, 0, 0.38)',
                      zIndex: 7,
                      pointerEvents: 'none',
                    },
                    'data-qa': `worker-card-${desk.id}`,
                  },
                    h('div', {
                      style: {
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: '10px',
                      },
                    },
                      h('div', null,
                        h('div', { className: 'signal-summary' }, workerCard.name),
                        h('div', { className: 'signal-meta muted' }, workerCard.role),
                      ),
                      h('div', {
                        style: {
                          fontSize: '18px',
                          lineHeight: 1,
                        },
                      }, workerCard.icon),
                    ),
                    h('div', {
                      style: {
                        marginTop: '8px',
                        color: workerCard.cognitionMode === 'fallback' ? '#ff9a82' : (workerCard.cognitionMode === 'model_live' ? '#8fe1af' : '#b6cae6'),
                        fontSize: '12px',
                        fontWeight: 600,
                      },
                    }, workerCard.cognitionMode),
                    h('div', { className: 'signal-meta muted', style: { marginTop: '6px' } }, workerCard.currentActivity),
                    h('div', { style: { marginTop: '10px' } },
                      h('div', { className: 'signal-meta muted', style: { marginBottom: '4px' } }, 'Energy'),
                      renderContinuousMeter(workerCard.energy, {
                        fill: '#77c8ff',
                        label: 'energy',
                      }),
                    ),
                    h('div', { style: { marginTop: '8px' } },
                      h('div', { className: 'signal-meta muted', style: { marginBottom: '4px' } }, 'Health'),
                      renderContinuousMeter(workerCard.health, {
                        fill: workerCard.cognitionMode === 'fallback' ? '#ff8c6f' : '#7fdca4',
                        label: 'health',
                      }),
                    ),
                    workerCard.confidence !== null ? h('div', { style: { marginTop: '8px' } },
                      h('div', { className: 'signal-meta muted', style: { marginBottom: '4px' } }, 'Confidence'),
                      renderContinuousMeter(workerCard.confidence, {
                        fill: '#c7b2ff',
                        label: 'confidence',
                      }),
                    ) : null,
                    h('div', { className: 'signal-meta muted', style: { marginTop: '8px' } }, `Fallbacks ${workerCard.fallbackCount}${workerCard.lastLiveModelCallAt ? ` | live ${formatTimestamp(workerCard.lastLiveModelCallAt)}` : ''}`),
                  ) : null,
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

function drawCanvasScene(canvas, graph, viewport, activeGraphLayer, worldViewMode, recentWorldChange, showRecentWorldChanges, connecting, pointerWorld, simIndex, sketches, annotations, selectedSketchId, selectedAnnotationId, selectedRelationshipId, selectedDeskId = '', truthKernelVisible = false, selectedDeskLabel = '') {
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
  ctx.fillStyle = resolveCanvasBackgroundFill(truthKernelVisible);
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

function markSpatialStudioMounted() {
  const root = document.getElementById('spatial-root');
  if (root && typeof root.setAttribute === 'function') {
    root.setAttribute('data-boot', 'studio-mounted');
  }
  if (document.body && typeof document.body.setAttribute === 'function') {
    document.body.setAttribute('data-boot', 'studio-mounted');
  }
}

if (typeof requestAnimationFrame === 'function') {
  requestAnimationFrame(() => markSpatialStudioMounted());
} else {
  markSpatialStudioMounted();
}














