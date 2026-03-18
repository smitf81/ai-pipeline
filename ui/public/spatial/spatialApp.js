import {
  GraphEngine,
  createNode,
  createEdge,
  buildStarterGraph,
  GRAPH_LAYERS,
  getNodeTypesForLayer,
  createDefaultRsgState,
  normalizeGraphBundle,
  buildRsgState,
} from './graphEngine.js';
import { AceConnector } from './aceConnector.js';
import { MutationEngine } from './mutationEngine.js';
import { ArchitectureMemory } from './architectureMemory.js';
import { loadWorkspace, saveWorkspace } from './persistence.js';
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
  advanceOrchestratorState,
  buildAgentSnapshots,
  createDefaultPage,
  createDefaultTeamBoard,
  createInitialComments,
  createPlannerHandoff,
  getStudioAgents,
  normalizeNotebookState,
  normalizeTeamBoardState,
} from './studioData.js';

const { useEffect, useMemo, useRef, useState } = React;
const h = React.createElement;

const STUDIO_SIZE = { width: 1200, height: 800 };
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
export const RSG_IDLE_DELAY_MS = 1200;
const RSG_LOW_CONFIDENCE_THRESHOLD = 0.55;
const RSG_ACTIVITY_LIMIT = 24;

const STUDIO_ROOM = { x: 72, y: 86, width: 1056, height: 642 };
const STUDIO_DESK_SIZE = { width: 172, height: 140 };
const STUDIO_TEAM_BOARD_SIZE = { width: 560, height: 164 };
const DEFAULT_STUDIO_DESK_LAYOUT = {
  'context-manager': { x: 182, y: 252 },
  planner: { x: 970, y: 252 },
  executor: { x: 182, y: 585 },
  'memory-archivist': { x: 620, y: 595 },
  'cto-architect': { x: 930, y: 422 },
};
const DEFAULT_STUDIO_WHITEBOARDS = {
  teamBoard: { x: 320, y: 96 },
};
const DESK_PROPERTY_TABS = [
  { id: 'agents', label: 'Agents' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'tools', label: 'Tools (Modules)' },
  { id: 'reports', label: 'Reports (Tests)' },
];

function clampDeskPosition(position = {}, room = STUDIO_ROOM, fallbackPosition = DEFAULT_STUDIO_DESK_LAYOUT['context-manager']) {
  return {
    x: clamp(Number(position.x) || fallbackPosition.x, room.x + STUDIO_DESK_SIZE.width / 2, room.x + room.width - STUDIO_DESK_SIZE.width / 2),
    y: clamp(Number(position.y) || fallbackPosition.y, room.y + STUDIO_DESK_SIZE.height / 2, room.y + room.height - STUDIO_DESK_SIZE.height / 2),
  };
}

function clampWhiteboardPosition(position = {}, room = STUDIO_ROOM) {
  return {
    x: clamp(Number(position.x) || DEFAULT_STUDIO_WHITEBOARDS.teamBoard.x, room.x + 16, room.x + room.width - STUDIO_TEAM_BOARD_SIZE.width - 16),
    y: clamp(Number(position.y) || DEFAULT_STUDIO_WHITEBOARDS.teamBoard.y, room.y + 16, room.y + room.height - STUDIO_TEAM_BOARD_SIZE.height - 16),
  };
}

function createDefaultStudioLayout() {
  return {
    room: { ...STUDIO_ROOM },
    desks: Object.fromEntries(Object.entries(DEFAULT_STUDIO_DESK_LAYOUT).map(([deskId, position]) => [deskId, { ...position }])),
    whiteboards: {
      teamBoard: { ...DEFAULT_STUDIO_WHITEBOARDS.teamBoard },
    },
  };
}

function normalizeStudioLayout(layout = {}) {
  const defaults = createDefaultStudioLayout();
  const room = {
    ...defaults.room,
    ...(layout.room || {}),
  };
  const desks = Object.fromEntries(getStudioAgents().map((agent) => [
    agent.id,
    clampDeskPosition(layout.desks?.[agent.id] || defaults.desks[agent.id], room, defaults.desks[agent.id]),
  ]));
  return {
    room,
    desks,
    whiteboards: {
      teamBoard: clampWhiteboardPosition(layout.whiteboards?.teamBoard || defaults.whiteboards.teamBoard, room),
    },
  };
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

const EMPTY_THROUGHPUT_DEBUG = {
  latestSession: null,
  sessions: [],
};

const EMPTY_QA_DEBUG = {
  latestRun: null,
  runs: [],
};

const TRACE_HISTORY_LIMIT = 5;

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
  if (normalizedNodeContent(rawContent ?? node.content).length === 0) return { ok: false, reason: 'empty-content' };
  if (node?.metadata?.intentStatus === 'processing') return { ok: false, reason: 'processing' };
  if (isLinkedDraftNode(node)) return { ok: false, reason: 'linked-draft' };
  return { ok: true, reason: '' };
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
  if (!report) return 'Press Enter in a node to judge intent against project context.';
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
}

function formatTimestamp(value) {
  if (!value) return 'unknown time';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'unknown time';
  return parsed.toLocaleString();
}

function isStudioViewportOutOfRange(viewport) {
  if (!viewport) return true;
  if (![viewport.x, viewport.y, viewport.zoom].every((value) => Number.isFinite(value))) return true;
  if (viewport.zoom < MIN_STUDIO_ZOOM || viewport.zoom > MAX_STUDIO_ZOOM) return true;
  return Math.abs(viewport.x) > STUDIO_SIZE.width * 2 || Math.abs(viewport.y) > STUDIO_SIZE.height * 2;
}

function renderDeskSection(section, helpers = {}) {
  if (!section) return null;
  if (section.kind === 'summary') {
    return h('div', { key: section.id, className: 'inspector-block panel-card' },
      h('div', { className: 'inspector-label' }, section.label),
      h('div', { className: 'signal-summary' }, section.value || section.emptyState || 'No data.'),
      section.detail ? h('div', { className: 'signal-meta muted' }, section.detail) : null,
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
    const truth = section.value;
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

function deskStagePoint(agentId, studioLayout = null) {
  const agent = getStudioAgents().find((entry) => entry.id === agentId);
  if (!agent) return null;
  if (studioLayout?.desks?.[agentId]) return studioLayout.desks[agentId];
  return {
    x: (agent.position.x / 100) * STUDIO_SIZE.width,
    y: (agent.position.y / 100) * STUDIO_SIZE.height,
  };
}

function truncateLabel(text, limit = 26) {
  const value = String(text || '').trim();
  if (!value) return '';
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function deskBounds(agentId, studioLayout = null) {
  const center = deskStagePoint(agentId, studioLayout);
  if (!center) return null;
  const width = STUDIO_DESK_SIZE.width;
  const height = STUDIO_DESK_SIZE.height;
  return {
    center,
    left: center.x - (width / 2),
    right: center.x + (width / 2),
    top: center.y - (height / 2),
    bottom: center.y + (height / 2),
    width,
    height,
  };
}

function resolveDeskAnchor(agentId, targetId, kind = 'workflow', studioLayout = null) {
  const source = deskBounds(agentId, studioLayout);
  const target = deskBounds(targetId, studioLayout);
  if (!source || !target) return null;
  const dx = target.center.x - source.center.x;
  const dy = target.center.y - source.center.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const sourceInset = kind === 'conflict' ? 18 : 12;
  const targetInset = kind === 'conflict' ? 20 : 14;
  if (horizontal) {
    return {
      from: {
        x: dx >= 0 ? source.right - sourceInset : source.left + sourceInset,
        y: source.center.y - 4,
      },
      to: {
        x: dx >= 0 ? target.left + targetInset : target.right - targetInset,
        y: target.center.y - 4,
      },
      bend: Math.max(48, Math.min(160, Math.abs(dx) * 0.35)),
      labelOffsetY: kind === 'conflict' ? -26 : -18,
    };
  }
  return {
    from: {
      x: source.center.x,
      y: dy >= 0 ? source.bottom - sourceInset : source.top + sourceInset,
    },
    to: {
      x: target.center.x,
      y: dy >= 0 ? target.top + targetInset : target.bottom - targetInset,
    },
    bend: Math.max(48, Math.min(150, Math.abs(dy) * 0.35)),
    labelOffsetY: kind === 'conflict' ? -30 : -20,
  };
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

function buildStudioLinks(orchestratorState, handoffs) {
  const links = [];
  if (handoffs?.contextToPlanner) {
    links.push({
      id: `handoff-${handoffs.contextToPlanner.id || 'context-planner'}`,
      from: 'context-manager',
      to: 'planner',
      kind: 'handoff',
      label: 'Problem brief',
    });
  }
  const plannerItems = orchestratorState?.desks?.planner?.workItems || [];
  if (plannerItems.length) {
    links.push({
      id: 'planner-executor',
      from: 'planner',
      to: 'executor',
      kind: 'workflow',
      label: plannerItems.length > 1 ? `${plannerItems.length} plan items` : '1 plan item',
    });
  }
  const executorItems = orchestratorState?.desks?.executor?.workItems || [];
  if (executorItems.length || plannerItems.length) {
    links.push({
      id: 'work-to-memory',
      from: 'executor',
      to: 'memory-archivist',
      kind: 'memory',
      label: executorItems.length ? `${executorItems.length} outputs` : 'Artifacts',
    });
  }
  (orchestratorState?.conflicts || []).forEach((conflict, index) => {
    (conflict.desks || []).forEach((deskId) => {
      if (deskId === 'cto-architect') return;
      links.push({
        id: `conflict-${index}-${deskId}`,
        from: 'cto-architect',
        to: deskId,
        kind: 'conflict',
        label: conflict.kind === 'low-confidence-context'
          ? 'Low confidence'
          : conflict.kind === 'parallel-plan-execution'
            ? 'Scope overlap'
            : 'Needs review',
      });
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

function SpatialNotebook() {
  const [graphEngine] = useState(() => new GraphEngine(buildStarterGraph()));
  const [ace] = useState(() => new AceConnector());
  const [memory] = useState(() => new ArchitectureMemory());
  const [mutationEngine] = useState(() => new MutationEngine(graphEngine));

  const [graphLayers, setGraphLayers] = useState(() => normalizeGraphBundle({ graph: buildStarterGraph() }));
  const [activeGraphLayer, setActiveGraphLayer] = useState('system');
  const [graph, setGraph] = useState(graphEngine.getState());
  const [selectedId, setSelectedId] = useState(null);
  const [canvasViewport, setCanvasViewport] = useState(createDefaultCanvasViewport());
  const [studioViewport, setStudioViewport] = useState(createDefaultStudioViewport());
  const [scene, setScene] = useState(SCENES.CANVAS);
  const [status, setStatus] = useState('ready');
  const [preview, setPreview] = useState(null);
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
  const [selectedAgentId, setSelectedAgentId] = useState('context-manager');
  const [commentDraft, setCommentDraft] = useState('');
  const [contextDraft, setContextDraft] = useState('');
  const [scanPreview, setScanPreview] = useState(null);
  const [scannerBusy, setScannerBusy] = useState(false);
  const [executiveResult, setExecutiveResult] = useState(null);
  const [intentState, setIntentState] = useState(EMPTY_INTENT_STATE);
  const [rsgMeta, setRsgMeta] = useState(() => createDefaultRsgState());
  const [pages, setPages] = useState([createDefaultPage()]);
  const [activePageId, setActivePageId] = useState(null);
  const [handoffs, setHandoffs] = useState(EMPTY_HANDOFFS);
  const [teamBoard, setTeamBoard] = useState(EMPTY_TEAM_BOARD);
  const [orchestratorState, setOrchestratorState] = useState(EMPTY_ORCHESTRATOR_STATE);
  const [selfUpgrade, setSelfUpgrade] = useState(EMPTY_SELF_UPGRADE);
  const [serverHealth, setServerHealth] = useState(EMPTY_SERVER_HEALTH);
  const [throughputDebug, setThroughputDebug] = useState(EMPTY_THROUGHPUT_DEBUG);
  const [qaDebug, setQaDebug] = useState(EMPTY_QA_DEBUG);
  const [qaRunDetail, setQaRunDetail] = useState(null);
  const [qaScenario, setQaScenario] = useState('layout-pass');
  const [qaBusy, setQaBusy] = useState(false);
  const [throughputPrompt, setThroughputPrompt] = useState('I think we should add a desk to the studio for a QA agent');
  const [throughputBusy, setThroughputBusy] = useState(false);
  const [selfUpgradeTaskId, setSelfUpgradeTaskId] = useState('');
  const [selfUpgradeBusy, setSelfUpgradeBusy] = useState(false);
  const [teamBoardBusy, setTeamBoardBusy] = useState(false);
  const [agentWorkerBusyId, setAgentWorkerBusyId] = useState(null);
  const [studioLayout, setStudioLayout] = useState(() => normalizeStudioLayout());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(380);
  const [reviewPanelOpen, setReviewPanelOpen] = useState(false);
  const [expandedReviewCardId, setExpandedReviewCardId] = useState(null);
  const [traceLog, setTraceLog] = useState([]);
  const [expandedTraceIds, setExpandedTraceIds] = useState({});
  const [deskPanelState, setDeskPanelState] = useState({ open: false, deskId: null, mode: 'properties' });
  const [deskPanelTab, setDeskPanelTab] = useState('agents');
  const [deskPanelBusy, setDeskPanelBusy] = useState(false);
  const [deskPanelActionBusy, setDeskPanelActionBusy] = useState(false);
  const [deskPanelData, setDeskPanelData] = useState(null);
  const [ctoEditTargetDeskId, setCtoEditTargetDeskId] = useState('planner');
  const [deskChatDraft, setDeskChatDraft] = useState('');
  const [deskChatBusy, setDeskChatBusy] = useState(false);
  const [deskChatLog, setDeskChatLog] = useState([]);

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
  const hasLoadedWorkspace = useRef(false);
  const autosaveTimer = useRef(null);
  const lastCanvasViewport = useRef(createDefaultCanvasViewport());
  const lastStudioViewport = useRef(createDefaultStudioViewport());
  const lastScene = useRef(SCENES.CANVAS);
  const sidebarResize = useRef(null);

  const graphBundle = useMemo(() => ({
    ...graphLayers,
    [activeGraphLayer]: graph,
  }), [graphLayers, activeGraphLayer, graph]);
  const systemGraph = graphBundle.system || buildStarterGraph();
  const selected = graph.nodes.find((node) => node.id === selectedId) || null;
  const contextNode = systemGraph.nodes.find((node) => node.metadata?.agentId === 'context-manager') || null;
  const latestIntentReport = intentState.contextReport || intentState.latest || null;
  const selectedIntent = selected?.metadata?.intentAnalysis || intentState.byNode?.[selected?.id] || null;
  const notebookState = useMemo(() => normalizeNotebookState({ graph: systemGraph, graphs: graphBundle, intentState, pages, activePageId }), [systemGraph, graphBundle, intentState, pages, activePageId]);
  const activePage = notebookState.activePage;
  const activeLayerNodeTypes = useMemo(() => getNodeTypesForLayer(activeGraphLayer), [activeGraphLayer]);
  const rsgState = useMemo(() => buildRsgState({
    graph: systemGraph,
    graphs: graphBundle,
    rsg: rsgMeta,
    studio: {
      teamBoard,
    },
  }), [systemGraph, graphBundle, teamBoard, rsgMeta]);
  const latestRsgActivity = rsgState.activity?.[0] || null;

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
      handoffs,
      teamBoard,
      orchestrator: orchestratorState,
      selfUpgrade,
      layout: studioLayout,
      canvasViewport,
      studioViewport,
      sidebar: {
        collapsed: sidebarCollapsed,
        width: sidebarWidth,
      },
    },
  }), [systemGraph, graphBundle, sketches, annotations, agentComments, intentState, pages, notebookState.activePageId, rsgState, scene, selectedAgentId, activeGraphLayer, handoffs, teamBoard, orchestratorState, selfUpgrade, studioLayout, canvasViewport, studioViewport, sidebarCollapsed, sidebarWidth, memory]);

  const agentSnapshots = useMemo(() => buildAgentSnapshots({
    workspace: workspacePayload,
    dashboardState,
    runs: recentRuns,
    agentComments,
    recentHistory,
  }), [workspacePayload, dashboardState, recentRuns, agentComments, recentHistory]);

  const selectedAgent = agentSnapshots.find((agent) => agent.id === selectedAgentId) || agentSnapshots[0] || null;
  const latestRun = recentRuns[0] || null;
  const sidebarColumnWidth = sidebarCollapsed ? 74 : sidebarWidth;
  const architectureMemory = useMemo(() => ({
    subsystems: memory.model.subsystems,
    modules: memory.model.modules,
    world: memory.model.world,
    adapters: memory.model.adapters,
    proposals: memory.model.proposals,
    rules: memory.model.rules,
    layers: memory.model.layers,
  }), [memory, graphBundle]);
  const studioRoom = studioLayout.room || STUDIO_ROOM;
  const teamBoardFrame = studioLayout.whiteboards?.teamBoard || DEFAULT_STUDIO_WHITEBOARDS.teamBoard;

  const loadDeskPanel = async (deskId) => {
    if (!deskId) return;
    setDeskPanelBusy(true);
    try {
      const payload = await ace.getDeskProperties(deskId);
      setDeskPanelData(payload);
      setStatus(`desk properties loaded: ${deskId}`);
      console.debug('[desk-properties-panel] sources', payload.sources);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setDeskPanelBusy(false);
    }
  };

  function openDeskPropertiesPanel(deskId, mode = 'properties') {
    if (!deskId) return;
    setSelectedAgentId(deskId);
    setDeskPanelState({ open: true, deskId, mode });
    if (mode === 'edit') {
      setDeskPanelTab('agents');
      if (deskId === 'cto-architect') loadDeskPanel(ctoEditTargetDeskId);
    } else {
      loadDeskPanel(deskId);
    }
  }

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
    return trace;
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
    const zoom = 0.94;
    setStudioViewport({
      zoom,
      x: container.clientWidth / 2 - (studioRoom.x + studioRoom.width / 2) * zoom,
      y: container.clientHeight / 2 - (studioRoom.y + studioRoom.height / 2) * zoom,
    });
    if (nextStatus) setStatus(nextStatus);
  }

  function centerStudioOnDesk(agentId, nextStatus = null) {
    const container = studioRef.current;
    const position = studioLayout.desks?.[agentId] || deskStagePoint(agentId);
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
      const storedStudio = workspace.studio || {};
      const initialLayer = GRAPH_LAYERS.includes(storedStudio.activeGraphLayer) ? storedStudio.activeGraphLayer : 'system';
      setGraphLayers(graphs);
      setActiveGraphLayer(initialLayer);
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
      setSelectedAgentId(storedStudio.selectedAgentId || 'context-manager');
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
      setSidebarCollapsed(Boolean(storedStudio.sidebar?.collapsed));
      setSidebarWidth(clamp(Number(storedStudio.sidebar?.width) || 380, 300, 520));
      const contextNode = (graphs.system?.nodes || []).find((node) => node.metadata?.agentId === 'context-manager');
      const storedIntentState = workspace.intentState || EMPTY_INTENT_STATE;
      setIntentState({
        latest: storedIntentState.latest || null,
        contextReport: storedIntentState.contextReport || null,
        byNode: storedIntentState.byNode || {},
        reports: Array.isArray(storedIntentState.reports) ? storedIntentState.reports : [],
      });
      setRsgMeta(workspace.rsg || createDefaultRsgState());
      setContextDraft(contextNode?.content || '');
      setScanPreview(storedIntentState.contextReport || null);
      hasLoadedWorkspace.current = true;
    }).catch(() => {
      hasLoadedWorkspace.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, [graphEngine, memory]);

  useEffect(() => {
    memory.syncFromGraph(graphBundle);
    drawCanvasScene(
      canvasRef.current,
      graph,
      canvasViewport,
      connectState.current,
      pointerWorld,
      simulating && !paused ? simStep : -1,
      sketches,
      annotations,
      selectedSketchId,
      selectedAnnotationId,
    );
  }, [graph, graphBundle, canvasViewport, memory, pointerWorld, simulating, simStep, paused, sketches, annotations, selectedSketchId, selectedAnnotationId]);

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
    const move = (event) => {
      if (!sidebarResize.current) return;
      const delta = sidebarResize.current.startX - event.clientX;
      setSidebarWidth(clamp(sidebarResize.current.startWidth + delta, 300, 520));
    };
    const up = () => {
      sidebarResize.current = null;
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, []);

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
    if (!hasLoadedWorkspace.current) return undefined;
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      saveWorkspace(workspacePayload)
        .then(() => setStatus(`autosaved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`))
        .catch((error) => setStatus(`save failed: ${error.message}`));
    }, 700);
    return () => clearTimeout(autosaveTimer.current);
  }, [workspacePayload]);

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
        setServerHealth({
          ...EMPTY_SERVER_HEALTH,
          ...(health || {}),
        });
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
    const latestRunId = qaDebug.latestRun?.id || qaDebug.runs?.[0]?.id || null;
    if (!latestRunId) {
      setQaRunDetail(null);
      return;
    }
    if (qaRunDetail?.id === latestRunId) return;
    loadQARunDetails(latestRunId);
  }, [qaDebug.latestRun?.id, qaDebug.runs, qaRunDetail?.id]);

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
      setStatus(`opened task folder ${taskId}`);
    } catch (error) {
      setStatus(`open task folder failed: ${error.message}`);
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

  async function runBrowserPass() {
    setQaBusy(true);
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
      setSelectedAgentId('cto-architect');
      setScene(SCENES.STUDIO);
      setStatus(payload.run?.verdict === 'pass'
        ? `browser pass ${payload.run.scenario} passed`
        : `browser pass ${payload.run?.scenario || qaScenario} ${payload.run?.verdict || 'completed'}`);
    } catch (error) {
      setStatus(`browser pass failed: ${error.message}`);
    } finally {
      setQaBusy(false);
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
    setStatus(`switched to ${GRAPH_LAYER_TITLES[nextLayer] || nextLayer}`);
  };

  const addNodeAt = (position, type = 'text', content = 'new note', metadata = { role: 'thought' }) => {
    const node = createNode({
      type,
      content,
      position,
      metadata: {
        ...metadata,
        graphLayer: activeGraphLayer,
      },
    });
    graphEngine.addNode(node);
    setGraph({ ...graphEngine.getState() });
    setSelectedId(node.id);
    return node;
  };

  const findContextNode = () => graphEngine.getState().nodes.find((node) => node.metadata?.agentId === 'context-manager');

  const upsertContextNode = (content) => {
    if (!content.trim()) return null;
    const existing = findContextNode();
    if (existing) {
      graphEngine.updateNode(existing.id, { content, type: 'text', metadata: { ...existing.metadata, role: 'context', agentId: 'context-manager' } });
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
      metadata: { role: 'context', agentId: 'context-manager' },
    });
    graphEngine.addNode(node);
    setGraph({ ...graphEngine.getState() });
    setSelectedId(node.id);
    return node;
  };

  const captureContextInput = () => {
    if (activeGraphLayer !== 'system') {
      setStatus('context intake currently writes to the system graph');
      return null;
    }
    const node = upsertContextNode(contextDraft);
    if (!node) {
      setStatus('add context before sending it to ACE');
      return null;
    }
    setStatus('context manager intake updated');
    return graphEngine.getState().nodes.find((entry) => entry.id === node.id) || node;
  };

  const buildRuntimePayloadFromWorkspace = (workspace, fallbackTeamBoard = EMPTY_TEAM_BOARD) => ({
    activePageId: workspace.activePageId,
    pages: workspace.pages,
    handoffs: workspace.studio?.handoffs || EMPTY_HANDOFFS,
    teamBoard: workspace.studio?.teamBoard || fallbackTeamBoard,
    orchestrator: workspace.studio?.orchestrator || EMPTY_ORCHESTRATOR_STATE,
    selfUpgrade: workspace.studio?.selfUpgrade || EMPTY_SELF_UPGRADE,
    rsg: workspace.rsg || createDefaultRsgState(),
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
    if (isLinkedDraftNode(node) && content !== node.content) {
      patch.metadata = {
        ...(node.metadata || {}),
        rsg: {
          ...(node.metadata?.rsg || {}),
          state: 'adopted',
        },
      };
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
      ...workspacePayload,
      intentState: nextIntentState,
      pages: nextPages,
      activePageId: notebook.activePageId,
      studio: {
        ...workspacePayload.studio,
        handoffs: nextHandoffs,
        teamBoard,
      },
    });
    applyRuntimePayload(buildRuntimePayloadFromWorkspace(workspace, teamBoard));
    return nextHandoff;
  };

  function applyRuntimePayload(runtime, intentOverride = null) {
    const runtimeIntentState = intentOverride || runtime.intentState || intentState;
    const notebook = normalizeNotebookState({
      graph: systemGraph,
      graphs: graphBundle,
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
    if (runtime.throughputDebug) {
      setThroughputDebug({
        ...EMPTY_THROUGHPUT_DEBUG,
        ...(runtime.throughputDebug || {}),
      });
    }
    if (runtime.qaDebug) {
      setQaDebug({
        ...EMPTY_QA_DEBUG,
        ...(runtime.qaDebug || {}),
      });
    }
    if (!selfUpgradeTaskId && runtime.selfUpgrade?.taskId) {
      setSelfUpgradeTaskId(runtime.selfUpgrade.taskId);
    }
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
      setStatus('switch to the system graph to run context intake');
      return;
    }
    if (!contextDraft.trim()) {
      setStatus('context intake is empty');
      return;
    }
    const trace = beginTrace(contextDraft);
    setScannerBusy(true);
    try {
      const contextNode = captureContextInput();
      addTraceStep(trace, 'executor_input', { operation: 'executive_route', nodeId: contextNode?.id || null, forceIntentScan });
      const response = await ace.runExecutiveRoute({
        envelope: {
          version: 'ace/studio-envelope.v1',
          entries: [
            {
              type: 'prompt',
              node_id: contextNode?.id || 'prompt-1',
              content: contextDraft,
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
      setExecutiveResult(response);
      if (response.route === 'module' && response.preview) {
        addTraceStep(trace, 'executor_output', response.preview);
        if (response.report) {
          setScanPreview(response.report);
        }
        if (response.runtime) {
          applyRuntimePayload(response.runtime);
        }
        setStatus(`executive module route complete | ${response.preview.artifact_type || 'artifact'} | ${Math.round((response.preview.confidence || 0) * 100)}% confidence`);
        return;
      }
      if (response.route === 'legacy-fallback') {
        addTraceStep(trace, 'executor_output', response.legacy || response);
        const legacyAction = response.legacy?.action || 'legacy';
        setStatus(`executive fallback ran legacy ${legacyAction}`);
        return;
      }
      const report = {
        ...(response.report || response),
        nodeId: (response.report || response).nodeId || contextNode?.id || null,
        source: (response.report || response).source || 'context-intake',
        createdAt: (response.report || response).createdAt || new Date().toISOString(),
      };
      const intentObject = buildIntentObject(contextDraft, { ...report, extractedIntent: response.extractedIntent }, trace.trace_id);
      addTraceStep(trace, 'intent_object', intentObject);
      addTraceStep(trace, 'planner_output', { tasks: report.tasks || [], handoff: response.handoff || null });
      addTraceStep(trace, 'executor_output', report);
      setScanPreview(report);
      if (contextNode?.id) {
        const currentNode = graphEngine.getState().nodes.find((node) => node.id === contextNode.id);
        graphEngine.updateNode(contextNode.id, {
          type: currentNode?.metadata?.manualOverride ? currentNode.type : (response.classification?.role === 'thought' ? 'text' : (response.classification?.role || currentNode?.type || 'text')),
          metadata: {
            ...(currentNode?.metadata || {}),
            role: currentNode?.metadata?.manualOverride ? (currentNode.metadata.role || 'context') : (response.classification?.role || 'context'),
            labels: [...new Set([...(currentNode?.metadata?.labels || []), ...(response.classification?.labels || [])])],
            intentAnalysis: report,
            intentStatus: 'ready',
            lastCommittedContent: normalizedNodeContent(contextDraft),
            agentId: 'context-manager',
          },
        });
        syncGraphState();
      }
      const nextIntentState = {
        latest: report,
        contextReport: report,
        byNode: contextNode?.id ? { ...(intentState.byNode || {}), [contextNode.id]: report } : (intentState.byNode || {}),
        reports: [report, ...((intentState.reports || []).filter((entry) => entry.nodeId !== contextNode?.id))].slice(0, 24),
      };
      let handoff = response.handoff || (response.runtime ? response.runtime.handoffs?.contextToPlanner : null) || null;
      if (response.runtime) {
        applyRuntimePayload(response.runtime, nextIntentState);
      } else {
        setIntentState(nextIntentState);
        handoff = await updatePlannerHandoff(report);
      }
      const rsgResult = contextNode?.id
        ? applyFocusedRsgLoop(graphEngine.getState().nodes.find((node) => node.id === contextNode.id), report, {
            trigger: 'context-intake',
          })
        : null;
      addTraceStep(trace, 'engine_result', {
        generated_nodes: rsgResult?.generatedNodes?.map((node) => node.id) || [],
        reason: rsgResult?.reason || null,
      });
      setSelectedAgentId('context-manager');
      setStatus(`intent manager confidence ${Math.round((report.confidence || 0) * 100)}% | ${(report.tasks || []).length} intent items | planner brief ${handoff?.status || 'updated'}${rsgResult?.entry ? ` | ${formatRsgActivity(rsgResult.entry)}` : ''}`);
    } catch (error) {
      addTraceStep(trace, 'ERROR', { stage: 'intent_parse', reason: error.message });
      setStatus(`scan failed: ${error.message}`);
    } finally {
      setScannerBusy(false);
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
    graphEngine.updateNode(nodeId, {
      content,
      metadata: {
        ...(current.metadata || {}),
        intentStatus: content ? 'processing' : 'idle',
        lastCommittedContent: content,
      },
    });
    let nextNode = graphEngine.getState().nodes.find((node) => node.id === nodeId);
    const patch = classifyNode(nextNode, graphEngine.getState(), activeGraphLayer);
    graphEngine.updateNode(nodeId, patch);
    syncGraphState();
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
      setStatus(`intent manager confidence ${Math.round((report.confidence || 0) * 100)}% | ${(report.tasks || []).length} tasks for ${resolvedRole}${rsgResult?.entry ? ` | ${formatRsgActivity(rsgResult.entry)}` : ''}`);
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
    setContextDraft('');
    setScanPreview(null);
    setIntentState({
      latest: null,
      contextReport: null,
      byNode: {},
      reports: [],
    });
    setRsgMeta(createDefaultRsgState());
    setHandoffs(EMPTY_HANDOFFS);
    setTeamBoard(EMPTY_TEAM_BOARD);
    const newPage = createDefaultPage();
    setPages([newPage]);
    setActivePageId(newPage.id);
    setOrchestratorState(EMPTY_ORCHESTRATOR_STATE);
    setStatus('new blank canvas ready');
  };

  const startSidebarResize = (event) => {
    if (sidebarCollapsed) return;
    event.preventDefault();
    sidebarResize.current = { startX: event.clientX, startWidth: sidebarWidth };
  };

  const focusStudioAgent = (agentId) => {
    setSelectedAgentId(agentId);
    centerStudioOnDesk(agentId);
    setReviewPanelOpen(false);
    setScene(SCENES.STUDIO);
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
    if (selectedAgentId === 'context-manager' && selectedAgent?.deskSnapshot?.handoff) {
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
    event.preventDefault();
    event.stopPropagation();
    studioElementDrag.current = {
      ...descriptor,
      startX: event.clientX,
      startY: event.clientY,
      initial: descriptor.type === 'desk'
        ? { ...(studioLayout.desks?.[descriptor.id] || deskStagePoint(descriptor.id, studioLayout)) }
        : { ...(studioLayout.whiteboards?.[descriptor.id] || DEFAULT_STUDIO_WHITEBOARDS.teamBoard) },
    };
  };

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
          nextLayout.desks[drag.id] = clampDeskPosition({
            x: drag.initial.x + deltaX,
            y: drag.initial.y + deltaY,
          }, current.room || STUDIO_ROOM);
        } else if (drag.type === 'whiteboard') {
          nextLayout.whiteboards[drag.id] = clampWhiteboardPosition({
            x: drag.initial.x + deltaX,
            y: drag.initial.y + deltaY,
          }, current.room || STUDIO_ROOM);
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
    await saveWorkspace({ ...workspacePayload, architectureMemory: memory.model });
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
      setStatus('RSG v1 only drafts linked notes from the system graph');
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
    await ace.applyMutation(preview.mutations);
    addTraceStep(trace, 'executor_output', { ok: true, applied: preview.mutations.length });
    mutationEngine.applyMutations(preview.mutations);
    addTraceStep(trace, 'engine_result', { nodes: graphEngine.getState().nodes.length, edges: graphEngine.getState().edges.length });
    setGraph({ ...graphEngine.getState() });
    setPreview(null);
    setStatus('ACE suggestions applied');
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
  const canReviewIntent = selectedAgentId === 'context-manager' && !!selectedAgent?.deskSnapshot?.handoff;
  const contextDeskSnapshot = selectedAgent?.deskSnapshot || null;
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
  const latestQARun = qaRunDetail || qaDebug.latestRun || qaDebug.runs?.[0] || null;
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
    const sourceDeskId = deskPanelState.mode === 'edit' && deskPanelState.deskId === 'cto-architect'
      ? ctoEditTargetDeskId
      : deskPanelState.deskId;
    loadDeskPanel(sourceDeskId);
  }, [deskPanelState.open, deskPanelState.deskId, deskPanelState.mode, ctoEditTargetDeskId]);

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
              h('div', { className: 'team-board-card-id muted' }, `#${card.id} • ${card.desk || 'Desk'}`),
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
                    }, 'Open task')
                  : null,
              ),
            );
          }))
        : h('div', { className: 'signal-empty muted team-board-empty' }, meta.empty),
    );
  };

  const renderStudioTeamBoard = () => h('section', {
    className: 'studio-team-board',
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
      width: `${STUDIO_TEAM_BOARD_SIZE.width}px`,
      minHeight: `${STUDIO_TEAM_BOARD_SIZE.height}px`,
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
        h('div', { className: 'studio-team-board-title' }, 'Team Board'),
        h('div', { className: 'studio-team-board-subtitle muted' }, 'Global workflow truth for planner output, builder packages, executor apply/deploy, and risk-gated approvals.'),
      ),
      h('div', { className: 'studio-team-board-meta' },
        h('span', null, `Page ${activePage?.title || 'Current Page'}`),
        h('span', null, `Plan ${teamBoard.summary?.plan || 0}`),
        h('span', null, `Active ${teamBoard.summary?.active || 0}`),
        h('span', null, `Idle workers ${teamBoard.summary?.idleWorkers || 0}`),
        h('span', { className: selectedExecutionCard ? 'selected' : '' }, selectedExecutionCard ? `Executor ${selectedExecutionCard.state}: ${selectedExecutionCard.title}` : `Ready to Apply ${teamBoard.summary?.review || 0}`),
        h('button', {
          className: 'mini studio-edit-handle whiteboard-edit-handle',
          type: 'button',
          onMouseDown: (event) => startStudioElementDrag(event, { type: 'whiteboard', id: 'teamBoard' }),
          onClick: (event) => {
            event.preventDefault();
            event.stopPropagation();
          },
        }, 'Move'),
      ),
    ),
        h('div', { className: 'team-board-columns' },
      ['plan', 'active', 'complete', 'review'].map(renderTeamBoardColumn),
    ),
  );

  const renderBrowserPassPanel = () => h('div', { className: 'inspector-block panel-card review-panel browser-pass-panel' },
    h('div', { className: 'inspector-label' }, 'Browser Pass'),
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
      h('button', { className: 'mini', type: 'button', disabled: qaBusy, onClick: runBrowserPass }, qaBusy ? 'Running...' : 'Run Browser Pass'),
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
            ? h('div', { className: 'qa-findings-list' }, latestQARun.findings.slice(0, 6).map((finding) => h('button', {
              key: finding.id,
              className: `qa-finding severity-${finding.severity || 'info'}`,
              type: 'button',
              onClick: () => {
                if (finding.relatedDeskIds?.[0]) setSelectedAgentId(finding.relatedDeskIds[0]);
                setScene(SCENES.STUDIO);
              },
              title: finding.details || finding.summary,
            }, `${finding.summary}`)))
            : h('div', { className: 'signal-empty muted' }, 'No browser-pass findings recorded yet.'),
          (latestQARun.steps || []).length
            ? h('div', { className: 'qa-step-list' }, latestQARun.steps.map((step) => h('div', { key: step.id, className: 'qa-step-row muted' }, `${step.label}: ${step.verdict || step.status}`)))
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
      latestThroughputSession?.runnerTaskId ? h('button', { className: 'mini', type: 'button', onClick: () => openTaskFolder(latestThroughputSession.runnerTaskId) }, 'Open runner task') : null,
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

  const renderDeskPropertiesPanel = () => {
    if (!deskPanelState.open || !deskPanelState.deskId) return null;
    const deskId = deskPanelState.deskId;
    const deskLabel = getStudioAgents().find((entry) => entry.id === deskId)?.name || deskId;
    const isCtoEdit = deskPanelState.mode === 'edit' && deskId === 'cto-architect';
    const targetDeskId = isCtoEdit ? ctoEditTargetDeskId : deskId;
    const targetDeskLabel = getStudioAgents().find((entry) => entry.id === targetDeskId)?.name || targetDeskId;
    const panelData = deskPanelData && deskPanelData.deskId === targetDeskId ? deskPanelData : null;
    return h('div', { className: 'desk-properties-modal' },
      h('div', { className: 'desk-properties-card panel-card' },
        h('div', { className: 'inline review-header' },
          h('div', null,
            h('div', { className: 'inspector-label' }, isCtoEdit ? 'CTO Desk Edit Panel' : 'Desk Properties Panel'),
            h('div', { className: 'signal-summary' }, isCtoEdit ? `${deskLabel} managing ${targetDeskLabel}` : deskLabel),
          ),
          h('button', { className: 'mini', type: 'button', onClick: () => setDeskPanelState({ open: false, deskId: null, mode: 'properties' }) }, 'Close'),
        ),
        isCtoEdit ? h('div', { className: 'desk-cto-controls' },
          h('label', { className: 'muted', htmlFor: 'cto-target-desk' }, 'Managed desk'),
          h('select', {
            id: 'cto-target-desk',
            className: 'mini recent-select',
            value: ctoEditTargetDeskId,
            onChange: async (event) => {
              setCtoEditTargetDeskId(event.target.value);
              await loadDeskPanel(event.target.value);
            },
          }, getStudioAgents().filter((entry) => entry.id !== 'cto-architect').map((entry) => h('option', { key: entry.id, value: entry.id }, entry.name))),
          h('div', { className: 'button-row' },
            h('button', {
              className: 'mini',
              type: 'button',
              disabled: deskPanelActionBusy,
              onClick: async () => {
                const agentId = window.prompt(`Add agent id to ${targetDeskLabel}`);
                if (!agentId) return;
                await runDeskPanelAction('add_agent', { agentId }, targetDeskId);
              },
            }, deskPanelActionBusy ? 'Saving...' : '+ Add Agent'),
            h('button', {
              className: 'mini',
              type: 'button',
              disabled: deskPanelActionBusy,
              onClick: async () => {
                const moduleId = window.prompt(`Assign module id to ${targetDeskLabel}`);
                if (!moduleId) return;
                await runDeskPanelAction('assign_module', { moduleId }, targetDeskId);
              },
            }, deskPanelActionBusy ? 'Saving...' : '+ Assign Module'),
            h('button', {
              className: 'mini',
              type: 'button',
              disabled: deskPanelActionBusy,
              onClick: async () => {
                const testId = window.prompt(`Add test/report id for ${targetDeskLabel}`);
                if (!testId) return;
                await runDeskPanelAction('add_test', { testId, verdict: 'pending' }, targetDeskId);
              },
            }, deskPanelActionBusy ? 'Saving...' : '+ Add Test'),
          ),
        ) : null,
        h('div', { className: 'scene-switcher desk-tabs' },
          DESK_PROPERTY_TABS.map((tab) => h('button', {
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
          h('div', { className: 'inspector-label' }, 'LLM chatbox'),
          h('div', { className: 'comment-thread' },
            deskChatLog.length
              ? deskChatLog.map((entry) => h('div', { key: entry.id, className: 'comment-entry' },
                  h('div', { className: 'comment-meta muted' }, entry.role),
                  h('div', null, entry.text),
                ))
              : h('div', { className: 'muted' }, 'Ask about desk state and task coordination.'),
          ),
          h('textarea', {
            className: 'comment-box',
            value: deskChatDraft,
            placeholder: 'Ask ACE about this desk...',
            onChange: (event) => setDeskChatDraft(event.target.value),
          }),
          h('div', { className: 'button-row' },
            h('button', {
              className: 'mini',
              type: 'button',
              disabled: deskChatBusy || !deskChatDraft.trim(),
              onClick: async () => {
                const prompt = deskChatDraft.trim();
                if (!prompt) return;
                setDeskChatBusy(true);
                setDeskChatDraft('');
                setDeskChatLog((current) => [{ id: `chat-${Date.now()}-u`, role: 'user', text: prompt }, ...current].slice(0, 10));
                try {
                  const response = await ace.parseIntent({ text: prompt, source: 'desk-properties-chat' });
                  setDeskChatLog((current) => [{ id: `chat-${Date.now()}-a`, role: 'ace', text: response?.summary || 'No summary returned.' }, ...current].slice(0, 10));
                } catch (error) {
                  setDeskChatLog((current) => [{ id: `chat-${Date.now()}-e`, role: 'error', text: error.message }, ...current].slice(0, 10));
                } finally {
                  setDeskChatBusy(false);
                }
              },
            }, deskChatBusy ? 'Asking...' : 'Send'),
          ),
        ) : null,
      ),
    );
  };

  return h('section', { className: 'spatial-main ace-shell', 'data-qa': 'spatial-root', style: { gridTemplateColumns: `minmax(0, 1fr) ${sidebarColumnWidth}px` } },
    h('div', { className: 'canvas-column scene-column' },
      h('div', { className: 'canvas-toolbar ace-toolbar' },
        h('div', { className: 'toolbar-primary' },
          h('div', { className: 'workspace-title' }, 'ACE Overlay Workspace'),
          h('div', { className: 'toolbar-caption muted' }, `Page: ${activePage?.title || 'Current Page'} | Orchestrator: ${orchestratorState.status || 'idle'} | Active desks: ${(orchestratorState.activeDeskIds || []).length}`),
        ),
        h('div', { className: 'toolbar-secondary' },
          h('div', { className: 'toolbar-meta toolbar-meta-top' },
            h('div', { className: 'scene-switcher' },
              h('button', { className: `mini ${scene === SCENES.CANVAS ? 'active' : ''}`, 'data-qa': 'scene-canvas-button', onClick: () => setScene(SCENES.CANVAS), type: 'button' }, 'Canvas'),
              h('button', { className: `mini ${scene === SCENES.STUDIO ? 'active' : ''}`, 'data-qa': 'scene-studio-button', onClick: () => setScene(SCENES.STUDIO), type: 'button' }, 'ACE Studio'),
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
            scene === SCENES.STUDIO ? h('button', { className: 'mini', 'data-qa': 'reset-view-button', type: 'button', onClick: () => resetStudioView() }, 'Reset View') : null,
            h('span', { className: 'toolbar-status' }, `${sceneLabel} | ${activeGraphLabel} | Page ${activePage?.title || 'Current Page'} | Canvas ${Math.round(canvasViewport.zoom * 100)}% | Studio ${Math.round(studioViewport.zoom * 100)}% | ${status}`),
          ),
          h('div', { className: 'canvas-control-dock toolbar-meta toolbar-meta-bottom' },
            h('div', { className: 'button-row' },
              h('button', { className: 'mini', onClick: newCanvas, type: 'button' }, 'New Canvas'),
              h('button', { className: `mini ${sketchMode ? 'active' : ''}`, onClick: () => setSketchMode((value) => !value), type: 'button', disabled: scene !== SCENES.CANVAS }, sketchMode ? 'Sketch On' : 'Sketch'),
              h('button', { className: 'mini', onClick: clearSketchLayer, type: 'button', disabled: scene !== SCENES.CANVAS }, 'Clear Marks'),
              h('button', { className: 'mini', onClick: () => setSimulating((value) => !value), type: 'button' }, simulating ? 'Stop Sim' : 'Simulate'),
              selected && h('button', {
                className: 'mini',
                onClick: () => runAiProcess(selected).catch((error) => setStatus(error.message)),
                type: 'button',
                disabled: activeGraphLayer !== 'system',
                title: activeGraphLayer === 'system' ? 'Ask ACE' : 'RSG v1 only mutates the system graph.',
              }, 'Ask ACE'),
            ),
          ),
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
              const x = node.position.x * canvasViewport.zoom + canvasViewport.x;
              const y = node.position.y * canvasViewport.zoom + canvasViewport.y;
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
              const rsgSummary = String(node.metadata?.rsg?.summary || '').trim();
              const intentFooterText = node.metadata?.intentAnalysis
                ? summarizeIntentReport(node.metadata.intentAnalysis)
                : (node.metadata?.rsg
                    ? (rsgNodeState === 'linked-draft' ? 'Linked draft ready for edit' : 'Adopted draft stays in place on rerun')
                    : 'press Enter to classify');
              return h('div', {
                key: node.id,
                className: `node ${classified.type} ${classified.metadata.role} layer-${activeGraphLayer} ${selectedId === node.id ? 'selected' : ''} ${isLinkedDraftNode(node) ? 'rsg-linked-draft' : ''} ${isAdoptedDraftNode(node) ? 'rsg-adopted' : ''} ${lowConfidenceDraft ? 'rsg-low-confidence' : ''} ${expandedGenerated ? 'expanded' : ''}`,
                style: {
                  left: `${x}px`,
                  top: `${y}px`,
                  transform: `scale(${canvasViewport.zoom})`,
                  transformOrigin: 'top left',
                  pointerEvents: sketchMode ? 'none' : 'auto',
                  opacity: sketchMode ? 0.82 : 1,
                },
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
                    rsgNodeState ? h('div', { className: `node-rsg-chip ${rsgNodeState}` }, rsgNodeState === 'linked-draft' ? 'RSG draft' : 'Adopted') : null,
                    generatedInspection?.basis ? h('div', { className: `node-rsg-chip basis-${generatedInspection.basis}` }, generatedInspection.basis) : null,
                    lowConfidenceDraft ? h('div', { className: 'node-rsg-chip low-confidence' }, 'Low confidence') : null,
                  ),
                ),
                h('textarea', {
                  className: 'node-editor',
                  value: node.content,
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
                  h('div', { className: 'node-labels' }, labels.length ? labels.join(' - ') : 'press Enter to classify'),
                  h('div', { className: 'node-intent-summary muted' }, `${node.id.slice(-4)} | ${classified.metadata.role}`),
                  node.metadata?.rsg ? h('div', { className: 'node-intent-summary muted' }, `${node.metadata.rsg.state === 'linked-draft' ? 'Generated from' : 'Adopted from'} ${String(node.metadata.rsg.sourceNodeId || '').slice(-4) || 'note'}${Number.isFinite(Number(node.metadata.rsg.confidence)) ? ` | ${Math.round(Number(node.metadata.rsg.confidence) * 100)}%` : ''}${node.metadata.rsg.usedFallback ? ' | fallback' : ''}`) : null,
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
              }),
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
                  return h('g', { key: link.id, className: `studio-link ${link.kind}` },
                    h('path', {
                      d: `M ${from.x} ${from.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${to.x} ${to.y}`,
                      className: 'studio-link-path',
                      'data-qa': 'studio-link-path',
                      'data-link-id': link.id,
                      'data-link-label': link.label,
                      'data-link-kind': link.kind,
                      'data-from-desk': link.from,
                      'data-to-desk': link.to,
                      'data-start-x': from.x,
                      'data-start-y': from.y,
                      'data-end-x': to.x,
                      'data-end-y': to.y,
                    }),
                    showLabel ? h('text', { x: midX, y: midY, className: 'studio-link-label' }, link.label) : null,
                  );
                }),
              ),
              agentSnapshots.map((agent) => {
                const deskPosition = studioLayout.desks?.[agent.id] || deskStagePoint(agent.id, studioLayout);
                const meta = STATUS_META[agent.status] || STATUS_META.idle;
                const thoughtBubble = orchestratorState.desks?.[agent.id]?.thoughtBubble || null;
                const pageBadge = orchestratorState.activeDeskIds?.includes(agent.id)
                  ? buildDeskBadge(agent.id, orchestratorState, activePage)
                  : null;
                return h('button', {
                  key: agent.id,
                  className: `agent-station ${selectedAgentId === agent.id ? 'selected' : ''} ${agent.isOversight ? 'oversight' : ''}`,
                  'data-qa': `desk-${agent.id}`,
                  'data-desk-id': agent.id,
                  'data-desk-label': agent.name,
                  'data-stage-x': deskPosition.x,
                  'data-stage-y': deskPosition.y,
                  style: {
                    left: `${deskPosition.x}px`,
                    top: `${deskPosition.y}px`,
                    '--agent-accent': agent.theme.accent,
                    '--agent-shadow': agent.theme.shadow,
                  },
                  type: 'button',
                  onClick: () => focusStudioAgent(agent.id),
                  title: `${agent.name} | ${orchestratorState.desks?.[agent.id]?.currentGoal || agent.role}`,
                },
                  h(DeskThoughtBubble, { text: thoughtBubble, tone: meta.tone }),
                  h('span', {
                    className: 'studio-edit-handle station-edit-handle',
                    onMouseDown: (event) => startStudioElementDrag(event, { type: 'desk', id: agent.id }),
                    onClick: (event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    },
                  }, 'Move'),
                  h('button', {
                    className: 'mini desk-properties-trigger',
                    type: 'button',
                    onClick: (event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      openDeskPropertiesPanel(agent.id, 'properties');
                    },
                  }, 'Props'),
                  agent.id === 'cto-architect' ? h('button', {
                    className: 'mini desk-properties-trigger cto-edit-trigger',
                    type: 'button',
                    onClick: (event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      openDeskPropertiesPanel(agent.id, 'edit');
                    },
                  }, 'Edit desks') : null,
                  pageBadge ? h('div', { className: 'desk-page-badge' }, pageBadge) : null,
                  h('div', { className: 'station-desk' },
                    h('div', { className: `desk-light ${agent.activityPulse ? 'pulse' : ''} ${agent.unresolved ? 'warning' : ''}` }),
                    h('div', { className: 'station-prop' }),
                    h('div', { className: 'station-screen' }),
                  ),
                  h(PixelAvatar, { accent: agent.theme.accent, status: agent.status }),
                  h('div', { className: `status-chip ${meta.tone}` }, meta.badge),
                  h('div', { className: 'agent-label' }, agent.shortLabel),
                );
              }),
              h('div', { className: 'studio-plaque' },
                h('div', { className: 'studio-name' }, 'ACE Studio'),
                h('div', { className: 'muted' }, 'System visualization and control layer'),
              ),
            ),
            h('div', { className: 'scene-indicator studio-indicator' },
              h('div', { className: 'indicator-title' }, 'Studio Map'),
              h('div', { className: 'minimap-dots' },
                agentSnapshots.map((agent) => h('button', {
                  key: `${agent.id}-dot`,
                  type: 'button',
                  className: `minimap-dot ${selectedAgentId === agent.id ? 'selected' : ''}`,
                  style: {
                    left: `${((studioLayout.desks?.[agent.id]?.x || deskStagePoint(agent.id, studioLayout).x) / STUDIO_SIZE.width) * 100}%`,
                    top: `${((studioLayout.desks?.[agent.id]?.y || deskStagePoint(agent.id, studioLayout).y) / STUDIO_SIZE.height) * 100}%`,
                    background: agent.theme.accent,
                  },
                  onClick: () => focusStudioAgent(agent.id),
                  title: agent.name,
                })),
              ),
              h('div', { className: 'muted' }, `Click a station to inspect scope. Active layer: ${activeGraphLabel}. World domain: ${rsgState.worldDomain}.`),
            ),
          ),
        ),
      ),
    ),
    h('aside', { className: `spatial-sidebar ace-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`, style: sidebarCollapsed ? undefined : { width: `${sidebarWidth}px` } },
      h('button', { className: 'sidebar-resize-handle', type: 'button', tabIndex: -1, 'aria-hidden': true, onMouseDown: startSidebarResize }),
      h('div', { className: 'sidebar-header' },
        h('div', { className: 'inspector-label' }, scene === SCENES.CANVAS ? 'Canvas Inspector' : 'Studio Inspector'),
        h('button', { className: 'mini', type: 'button', onClick: () => setSidebarCollapsed((value) => !value) }, sidebarCollapsed ? 'Open' : 'Collapse'),
      ),
      !sidebarCollapsed && h('div', { className: 'sidebar-scroll' },
      scene === SCENES.CANVAS
        ? h(React.Fragment, null,
          h('div', { className: 'inspector-block' },
            h('div', { className: 'inspector-label' }, 'Notebook Inspector'),
            selected
              ? h('div', { className: 'muted' }, `Selected note: ${selected.id}`)
              : h('div', { className: 'muted' }, 'Select a node to inspect. Right-click a node to override type or labels.'),
          ),
          h('div', { className: 'inspector-block panel-card context-intake' },
            h('div', { className: 'inspector-label' }, 'Context Intake'),
            h('div', { className: 'muted' }, activeGraphLayer === 'system'
              ? 'This is the direct input surface for the context agent and intent scanner.'
              : 'Context intake currently writes to the system graph. Switch layers to scan or publish context.'),
            h('textarea', {
              value: contextDraft,
              placeholder: 'Describe the project intent, architecture concerns, and what ACE should understand next.',
              onChange: (event) => setContextDraft(event.target.value),
              onFocus: () => keys.current.clear(),
              disabled: activeGraphLayer !== 'system',
            }),
            h('div', { className: 'button-row' },
              h('button', { className: 'mini', type: 'button', onClick: captureContextInput, disabled: activeGraphLayer !== 'system' }, 'Save to Context'),
              h('button', { className: 'mini', type: 'button', onClick: () => scanContextIntent().catch((error) => setStatus(error.message)), disabled: scannerBusy || activeGraphLayer !== 'system' }, scannerBusy ? 'Routing...' : 'Run Executive Route'),
              h('button', { className: 'mini', type: 'button', onClick: () => scanContextIntent({ forceIntentScan: true }).catch((error) => setStatus(error.message)), disabled: scannerBusy || activeGraphLayer !== 'system' }, 'Scan for intent'),
              scanPreview ? h('button', { className: 'mini', type: 'button', onClick: () => { setSelectedAgentId('context-manager'); setScene(SCENES.STUDIO); setReviewPanelOpen(true); } }, 'Open problem report') : null,
            ),
            scanPreview
              ? h(React.Fragment, null,
                h('div', { className: 'intent-summary-card' },
                  h('div', { className: 'confidence-pill' }, `${Math.round((scanPreview.confidence || 0) * 100)}% confidence`),
                  h('div', null, scanPreview.summary || 'Intent captured.'),
                ),
                h('div', { className: 'muted' }, 'Planner handoff updates automatically from this report.'),
                scanPreview.tasks?.length ? h('ul', { className: 'signal-list' }, scanPreview.tasks.map((task, index) => h('li', { key: `scan-${index}` }, task))) : h('div', { className: 'signal-empty muted' }, 'No extracted tasks yet.'),
                h('div', { className: 'criteria-list' }, (scanPreview.criteria || []).map((criterion) => h('div', { key: criterion.id || criterion.label, className: 'criteria-row' },
                  h('span', null, `${criterion.label}: ${Math.round((criterion.score || 0) * 100)}%`),
                  h('span', { className: 'muted' }, criterion.reason || ''),
                ))),
              )
              : h('div', { className: 'signal-empty muted' }, 'Run the scanner to preview extracted intent items.'),
            executiveResult?.route === 'module' && executiveResult.preview
              ? h(React.Fragment, null,
                h('div', { className: 'intent-summary-card' },
                  h('div', { className: 'confidence-pill' }, `${Math.round((executiveResult.preview.confidence || 0) * 100)}% confidence`),
                  h('div', null, `Artifact: ${executiveResult.preview.artifact_type || 'unknown'}`),
                ),
                h('div', { className: 'muted' }, `Validation ${executiveResult.preview.validation_status} | Human review ${executiveResult.preview.requires_human_review ? 'required' : 'not required'}`),
                (executiveResult.preview.output_paths || []).length
                  ? h('ul', { className: 'signal-list' }, executiveResult.preview.output_paths.map((item) => h('li', { key: item }, item)))
                  : h('div', { className: 'signal-empty muted' }, 'No output paths reported.'),
                h('div', { className: 'button-row' },
                  h('button', { className: 'mini', type: 'button', onClick: () => exportExecutiveManifest().catch((error) => setStatus(error.message)) }, 'Export Manifest'),
                  h('button', { className: 'mini', type: 'button', onClick: () => copyExecutiveMetadata().catch((error) => setStatus(error.message)) }, 'Copy Metadata'),
                  h('button', { className: 'mini', type: 'button', onClick: revealExecutiveOutputPaths }, 'Reveal Paths'),
                ),
              )
              : null,
          ),
          h('div', { className: 'inspector-block panel-card' },
            h('div', { className: 'inspector-label' }, 'Backend Signal Check'),
            h('div', { className: 'muted' }, `Current focus: ${dashboardState.current_focus || 'none reported'}`),
            h('div', { className: 'muted' }, `Latest run: ${latestRun ? `${latestRun.action} (${latestRun.status})` : 'no run history yet'}`),
            (dashboardState.next_actions || []).length
              ? h('ul', { className: 'signal-list' }, dashboardState.next_actions.slice(0, 4).map((item, index) => h('li', { key: `next-${index}` }, item)))
              : h('div', { className: 'signal-empty muted' }, 'No next actions exposed by the current dashboard state.'),
            (dashboardState.blockers || []).length
              ? h('ul', { className: 'signal-list' }, dashboardState.blockers.slice(0, 3).map((item, index) => h('li', { key: `blocker-${index}` }, item)))
              : null,
          ),
          h('div', { className: 'inspector-block panel-card' },
            h('div', { className: 'inspector-label' }, 'Latest Intent Capture'),
            selectedIntent || intentState.latest
              ? h(React.Fragment, null,
                h('div', { className: 'intent-summary-card' },
                  h('div', { className: 'confidence-pill' }, `${Math.round((((selectedIntent || intentState.latest).confidence) || 0) * 100)}% confidence`),
                  h('div', null, (selectedIntent || intentState.latest).summary || 'Intent captured'),
                ),
                h('div', { className: 'muted' }, `Agent: ${(selectedIntent || intentState.latest).agent?.name || 'Context Manager'}`),
                h('div', { className: 'criteria-list' }, ((selectedIntent || intentState.latest).criteria || []).map((criterion) => h('div', { key: criterion.id || criterion.label, className: 'criteria-row' },
                  h('span', null, `${criterion.label}: ${Math.round((criterion.score || 0) * 100)}%`),
                  h('span', { className: 'muted' }, criterion.reason || ''),
                ))),
              )
              : h('div', { className: 'signal-empty muted' }, 'Press Enter in a node or run Context Intake to inspect how ACE is judging intent.'),
          ),
          h('div', { className: 'inspector-block panel-card' },
            h('div', { className: 'inspector-label' }, 'Canvas Controls'),
            h('div', { className: 'muted' }, 'Double-click to add nodes. Drag from node handles to create arrows. Press Enter in a system node, or pause for 1.2s while editing, to classify intent and let RSG draft up to three linked notes. Edit generated text to adopt it. Use Delete or Backspace to remove selections. Use K for sketch mode.'),
          ),
          h('div', { className: 'inspector-block panel-card' },
            h('div', { className: 'inspector-label' }, 'RSG Architecture'),
            h('div', { className: 'signal-summary' }, `${rsgState.mode} | ${activeGraphLabel}`),
            h('div', { className: 'signal-meta muted' }, `World domain: ${rsgState.worldDomain}`),
            h('div', { className: 'criteria-list desk-metric-list' },
              h('div', { className: 'criteria-row' }, h('span', null, 'System structure'), h('span', { className: 'muted' }, String(rsgState.summary?.systemStructure || 0))),
              h('div', { className: 'criteria-row' }, h('span', null, 'World structure'), h('span', { className: 'muted' }, String(rsgState.summary?.worldStructure || 0))),
              h('div', { className: 'criteria-row' }, h('span', null, 'Adapters'), h('span', { className: 'muted' }, String(rsgState.summary?.adapterTranslation || 0))),
              h('div', { className: 'criteria-row' }, h('span', null, 'Runtime mutations'), h('span', { className: 'muted' }, String(rsgState.summary?.codeRuntimeMutation || 0))),
            ),
            h('div', { className: 'signal-meta muted' }, `Policy: system/world/adapter proposals auto-record, code/runtime changes stay risk-gated.`),
          ),
          h('div', { className: 'inspector-block panel-card' },
            h('div', { className: 'inspector-label' }, 'RSG Activity'),
            latestRsgActivity
              ? h(React.Fragment, null,
                h('div', { className: 'signal-summary' }, formatRsgActivity(latestRsgActivity)),
                h('div', { className: 'signal-meta muted' }, `Source: ${latestRsgActivity.sourceNodeLabel || latestRsgActivity.sourceNodeId || 'unknown node'}`),
                latestRsgActivity.summary ? h('div', { className: 'signal-meta muted' }, latestRsgActivity.summary) : null,
                h('div', { className: 'criteria-list desk-metric-list' },
                  h('div', { className: 'criteria-row' }, h('span', null, 'Status'), h('span', { className: 'muted' }, latestRsgActivity.type || 'rsg-skip')),
                  h('div', { className: 'criteria-row' }, h('span', null, 'Trigger'), h('span', { className: 'muted' }, latestRsgActivity.trigger || 'manual')),
                  h('div', { className: 'criteria-row' }, h('span', null, 'Generated'), h('span', { className: 'muted' }, String(latestRsgActivity.generatedCount || 0))),
                  h('div', { className: 'criteria-row' }, h('span', null, 'Replaced'), h('span', { className: 'muted' }, String(latestRsgActivity.replacedCount || 0))),
                  h('div', { className: 'criteria-row' }, h('span', null, 'Confidence'), h('span', { className: 'muted' }, Number.isFinite(Number(latestRsgActivity.confidence)) ? `${Math.round(Number(latestRsgActivity.confidence) * 100)}%` : 'n/a')),
                ),
                latestRsgActivity.usedFallback || latestRsgActivity.reason
                  ? h('div', { className: 'signal-meta muted' }, `${latestRsgActivity.usedFallback ? 'Fallback used' : 'Reason'}${latestRsgActivity.reason ? ` | ${latestRsgActivity.reason}` : ''}`)
                  : null,
              )
              : h('div', { className: 'signal-empty muted' }, 'RSG runs appear here after Enter or idle-triggered intent capture on the system canvas.'),
          ),
          h('div', { className: 'inspector-block panel-card' },
            h('div', { className: 'inspector-label' }, 'Graph Layer Summary'),
            h('div', { className: 'criteria-list desk-metric-list' },
              h('div', { className: 'criteria-row' }, h('span', null, 'System graph'), h('span', { className: 'muted' }, `${systemGraph.nodes.length} nodes / ${systemGraph.edges.length} edges`)),
              h('div', { className: 'criteria-row' }, h('span', null, 'World graph'), h('span', { className: 'muted' }, `${(graphBundle.world?.nodes || []).length} nodes / ${(graphBundle.world?.edges || []).length} edges`)),
              h('div', { className: 'criteria-row' }, h('span', null, 'Active layer'), h('span', { className: 'muted' }, activeGraphLabel)),
            ),
          ),
          h('div', { className: 'inspector-block' },
            h('div', { className: 'inspector-label' }, 'Architecture Memory'),
            h('pre', { className: 'doc' }, JSON.stringify(architectureMemory, null, 2)),
          ),
          h('div', { className: 'inspector-block' },
            h('div', { className: 'inspector-label' }, `${activeGraphLabel} Node Types`),
            h('div', { className: 'button-row' }, activeLayerNodeTypes.map((type) => h('button', {
              key: type,
              className: 'mini',
              type: 'button',
              onClick: () => addNodeAt({ x: 180, y: 180 }, type, `${type} note`),
            }, type))),
          ),
        )
        : selectedAgent && h(React.Fragment, null,
          h('div', { className: 'inspector-block' },
            h('div', { className: 'inspector-label' }, 'Agent Scope'),
            h('div', { className: 'agent-panel-title' }, selectedAgent.name),
            h('div', { className: `agent-panel-status ${STATUS_META[selectedAgent.status]?.tone || 'idle'}` }, selectedAgent.status),
            h('p', { className: 'muted' }, selectedAgent.role),
          ),
          h('div', { className: 'inspector-block panel-card' },
            h('div', { className: 'inspector-label' }, 'Agent Signal'),
            h('div', { className: 'signal-summary' }, selectedAgent.latestSignal || selectedAgent.statusDetail),
            h('div', { className: 'signal-meta muted' }, `Run state: ${selectedAgent.latestRunStatus || 'idle'}`),
            h('div', { className: 'signal-meta muted' }, selectedAgent.latestRunSummary || 'No recent run logs surfaced for this station yet.'),
          ),
          selectedAgent.id === 'cto-architect' && orchestratorState.desks?.['cto-architect']?.thoughtBubble ? h('div', { className: 'inspector-block panel-card review-panel' },
            h('div', { className: 'inspector-label' }, 'Orchestrator Thought Bubble'),
            h('div', { className: 'signal-summary' }, orchestratorState.desks['cto-architect'].thoughtBubble),
            h('div', { className: 'signal-meta muted' }, `Last heartbeat: ${formatTimestamp(orchestratorState.lastTickAt)}`),
          ) : null,
          selectedAgent.id === 'cto-architect' ? h('div', { className: 'inspector-block panel-card' },
            h('div', { className: 'inspector-label' }, 'Architecture Layers'),
            h('div', { className: 'signal-summary' }, `${rsgState.mode} | ${rsgState.worldDomain}`),
            h('div', { className: 'criteria-list desk-metric-list' },
              h('div', { className: 'criteria-row' }, h('span', null, 'System proposals'), h('span', { className: 'muted' }, String(rsgState.summary?.systemStructure || 0))),
              h('div', { className: 'criteria-row' }, h('span', null, 'World proposals'), h('span', { className: 'muted' }, String(rsgState.summary?.worldStructure || 0))),
              h('div', { className: 'criteria-row' }, h('span', null, 'Adapter links'), h('span', { className: 'muted' }, String(rsgState.summary?.adapterTranslation || 0))),
              h('div', { className: 'criteria-row' }, h('span', null, 'Mutation packages'), h('span', { className: 'muted' }, String(rsgState.summary?.codeRuntimeMutation || 0))),
            ),
            (rsgState.proposals || []).length
              ? h('ul', { className: 'signal-list' }, rsgState.proposals.slice(0, 6).map((proposal) => h('li', { key: proposal.id },
                  h('div', null, proposal.title),
                  h('div', { className: 'muted' }, `${proposal.target} | ${proposal.approval}`),
                )))
              : h('div', { className: 'signal-empty muted' }, 'No explicit RSG proposals recorded yet.'),
          ) : null,
          selectedAgent.id === 'cto-architect' ? h('div', { className: 'inspector-block panel-card review-panel' },
            h('div', { className: 'inspector-label' }, 'ACE Self Upgrade'),
            h('div', { className: 'signal-summary' }, `Status: ${selfUpgrade.status || 'idle'}`),
            h('div', { className: 'signal-meta muted' }, `Target: ${selfUpgrade.targetProjectKey || 'ace-self'} | Permission: ${selfUpgrade.requiresPermission || 'none'}`),
            h('div', { className: 'signal-meta muted' }, `Server health: ${serverHealth.selfUpgrade?.deploy?.health?.status || serverHealth.selfUpgrade?.deploy?.status || 'unknown'} | PID: ${serverHealth.pid || 'n/a'}`),
            h('div', { className: 'self-upgrade-grid' },
              h('label', { className: 'muted', htmlFor: 'self-upgrade-task-id' }, 'Task ID'),
              h('input', {
                id: 'self-upgrade-task-id',
                className: 'comment-box self-upgrade-input',
                type: 'text',
                value: selfUpgradeTaskId,
                placeholder: '0001',
                onChange: (event) => setSelfUpgradeTaskId(event.target.value),
              }),
            ),
            selfUpgrade.patchReview?.changedFiles?.length
              ? h('div', { className: 'signal-meta muted' }, `Patch scope: ${selfUpgrade.patchReview.changedFiles.join(', ')}`)
              : h('div', { className: 'signal-empty muted' }, 'No self-patch review has been recorded yet.'),
            (selfUpgrade.preflight?.checks || []).length
              ? h('ul', { className: 'signal-list' }, selfUpgrade.preflight.checks.map((check) => h('li', { key: check.id },
                  h('div', null, `${check.ok ? 'PASS' : 'FAIL'} ${check.label}`),
                  h('div', { className: 'muted' }, check.output || check.command),
                )))
              : h('div', { className: 'signal-empty muted' }, 'Run preflight to verify ACE can safely apply this self patch.'),
            selfUpgrade.patchReview?.refusalReasons?.length
              ? h('ul', { className: 'signal-list' }, selfUpgrade.patchReview.refusalReasons.map((reason, index) => h('li', { key: `self-refusal-${index}` }, reason)))
              : null,
            h('div', { className: 'button-row' },
              h('button', { className: 'mini', type: 'button', disabled: selfUpgradeBusy, onClick: runSelfUpgradePreflight }, selfUpgradeBusy ? 'Running...' : 'Run preflight'),
              h('button', { className: 'mini', type: 'button', disabled: selfUpgradeBusy || !selfUpgrade.apply?.ok, onClick: deploySelfUpgrade }, selfUpgrade.deploy?.status === 'restarting' ? 'Restarting...' : 'Deploy & restart'),
            ),
          selfUpgrade.apply?.ok ? h('div', { className: 'signal-meta muted' }, `Applied commit ${selfUpgrade.apply.commit || 'pending'} on ${selfUpgrade.apply.branch || 'apply branch'}`) : null,
        ) : null,
        selectedAgent.id === 'cto-architect' ? renderBrowserPassPanel() : null,
        selectedAgent.id === 'cto-architect' ? renderThroughputDebugPanel() : null,
        selectedAgent.id === 'context-manager'
            ? h(React.Fragment, null,
                reviewPanelOpen && contextDeskSnapshot?.handoff ? h('div', { className: 'inspector-block panel-card review-panel' },
                  h('div', { className: 'inline review-header' },
                    h('div', null,
                      h('div', { className: 'inspector-label' }, 'Problem Report'),
                      h('div', { className: 'signal-summary' }, contextDeskSnapshot.handoff.summary || 'Planner brief ready'),
                    ),
                    h('button', { className: 'mini', type: 'button', onClick: () => setReviewPanelOpen(false) }, 'Close')
                  ),
                  h('pre', { className: 'doc desk-problem-report' }, contextDeskSnapshot.handoff.problemStatement || 'No problem report generated yet.'),
                  contextDeskSnapshot.handoff.truth?.plannerBrief
                    ? h('div', { className: 'truth-inline' }, contextDeskSnapshot.handoff.truth.plannerBrief)
                    : null,
                  h('div', { className: 'button-row' },
                    contextDeskSnapshot.handoff.sourceNodeId ? h('button', { className: 'mini', type: 'button', onClick: () => focusCanvasNode(contextDeskSnapshot.handoff.sourceNodeId) }, 'Open source node') : null,
                  ),
                ) : null,
                renderDeskSection(contextDeskSnapshot?.sections?.find((section) => section.id === 'core-truth')),
                h('div', { className: 'inspector-block panel-card review-panel' },
                  h('div', { className: 'inspector-label' }, 'Problem To Solve'),
                  contextDeskSnapshot?.handoff
                    ? h(React.Fragment, null,
                        h('div', { className: 'signal-summary' }, contextDeskSnapshot.handoff.summary || 'Planner brief ready.'),
                        h('div', { className: 'signal-meta muted' }, `Sent to Planner: ${formatTimestamp(contextDeskSnapshot.handoff.createdAt)}`),
                        h('div', { className: 'signal-meta muted' }, `Status: ${contextDeskSnapshot.handoff.status}`),
                        contextDeskSnapshot.handoff.truth?.plannerBrief ? h('div', { className: 'truth-inline muted' }, contextDeskSnapshot.handoff.truth.plannerBrief) : null,
                        contextDeskSnapshot.handoff.tasks?.length
                          ? h('ul', { className: 'signal-list' }, contextDeskSnapshot.handoff.tasks.map((task, index) => h('li', { key: `handoff-task-${index}` }, task)))
                          : h('div', { className: 'signal-empty muted' }, 'No extracted tasks yet.'),
                        h('div', { className: 'button-row' },
                          h('button', { className: 'mini', type: 'button', onClick: reviewSelectedAgent }, reviewPanelOpen ? 'Hide report' : 'Open problem report'),
                          contextDeskSnapshot.handoff.sourceNodeId ? h('button', { className: 'mini', type: 'button', onClick: () => focusCanvasNode(contextDeskSnapshot.handoff.sourceNodeId) }, 'Open source node') : null,
                        ),
                      )
                    : h('div', { className: 'signal-empty muted' }, 'Planner handoff will appear after the next context scan.'),
                ),
                h('div', { className: 'inspector-block panel-card' },
                  h('div', { className: 'inspector-label' }, 'Workstation'),
                  h('div', { className: 'muted' }, selectedAgent.responsibility),
                  h('div', { className: 'agent-focus muted' }, contextDeskSnapshot?.focus?.summary || selectedAgent.focusSummary),
                  contextDeskSnapshot?.focus?.detail ? h('div', { className: 'signal-meta muted' }, contextDeskSnapshot.focus.detail) : null,
                ),
                h('div', { className: 'inspector-block panel-card' },
                  h('div', { className: 'inspector-label' }, 'Throughput'),
                  h(ThroughputBar, { label: 'Assigned', value: selectedAgent.workload.assignedTasks, max: 6 }),
                  h(ThroughputBar, { label: 'Queue', value: selectedAgent.workload.queueSize, max: 5 }),
                  h(ThroughputBar, { label: 'Outputs', value: selectedAgent.workload.outputs, max: 4 }),
                ),
                h('div', { className: 'inspector-block panel-card' },
                  h('div', { className: 'inspector-label' }, 'Intent Extraction'),
                  contextDeskSnapshot?.sections?.find((section) => section.id === 'intent-pipeline')?.value
                    ? h(React.Fragment, null,
                        h('div', { className: 'confidence-pill' }, `${Math.round((contextDeskSnapshot.sections.find((section) => section.id === 'intent-pipeline').value.confidence || 0) * 100)}% confidence`),
                        h('div', { className: 'signal-summary' }, contextDeskSnapshot.sections.find((section) => section.id === 'intent-pipeline').value.summary || 'Intent captured.'),
                        h('div', { className: 'signal-meta muted' }, `Source: ${contextDeskSnapshot.sections.find((section) => section.id === 'intent-pipeline').value.nodeId || 'context input'} | Classified as ${contextDeskSnapshot.sections.find((section) => section.id === 'intent-pipeline').value.classification?.role || 'context'}`),
                        contextDeskSnapshot.sections.find((section) => section.id === 'intent-pipeline').value.truth?.plannerBrief
                          ? h('div', { className: 'truth-inline muted' }, contextDeskSnapshot.sections.find((section) => section.id === 'intent-pipeline').value.truth.plannerBrief)
                          : null,
                        h('div', { className: 'criteria-list' }, (contextDeskSnapshot.sections.find((section) => section.id === 'intent-pipeline').value.criteria || []).map((criterion) => h('div', { key: criterion.id || criterion.label, className: 'criteria-row' },
                          h('span', null, `${criterion.label}: ${Math.round((criterion.score || 0) * 100)}%`),
                          h('span', { className: 'muted' }, criterion.reason || ''),
                        ))),
                      )
                    : h('div', { className: 'signal-empty muted' }, 'Run context intake to generate an intent report.'),
                ),
                h('div', { className: 'inspector-block panel-card' },
                  h('div', { className: 'inspector-label' }, 'Recent History'),
                  (contextDeskSnapshot?.history || []).length
                    ? h('ul', { className: 'signal-list' }, contextDeskSnapshot.history.map((entry, index) => h('li', { key: entry.id || `history-${index}` },
                        h('div', null, summarizeHistoryEntry(entry)),
                        entry.at ? h('div', { className: 'muted' }, formatTimestamp(entry.at)) : null,
                      )))
                    : h('div', { className: 'signal-empty muted' }, 'No recent context history yet.'),
                ),
                h('div', { className: 'inspector-block panel-card' },
                  h('div', { className: 'inspector-label' }, 'Waiting On You'),
                  (contextDeskSnapshot?.userActions || []).length
                    ? h('ul', { className: 'signal-list' }, contextDeskSnapshot.userActions.map((entry, index) => h('li', { key: `action-${index}` }, entry)))
                    : h('div', { className: 'signal-empty muted' }, 'No manual clarification needed right now.'),
                ),
              )
            : h(React.Fragment, null,
                (selectedAgent.deskSnapshot?.sections || []).map((section) => renderDeskSection(section)),
                selectedAgent.id === 'executor' ? h('div', { className: 'inspector-block panel-card' },
                  h('div', { className: 'inspector-label' }, 'Worker Controls'),
                  selectedExecutionCard
                    ? h(React.Fragment, null,
                        h('div', { className: 'signal-summary' }, selectedExecutionCard.title || 'Selected mutation package'),
                        h('div', { className: 'signal-meta muted' }, `Task ${selectedExecutionCard.runnerTaskId || selectedExecutionCard.builderTaskId || selectedExecutionCard.executionPackage?.taskId || 'unbound'} | Verify ${selectedExecutionCard.verifyStatus || 'idle'} | Apply ${selectedExecutionCard.applyStatus || 'idle'} | Deploy ${selectedExecutionCard.deployStatus || 'idle'}`),
                        h('div', { className: 'signal-meta muted' }, `Action: ${selectedExecutionCard.executionPackage?.expectedAction || 'apply'} | Risk: ${selectedExecutionCard.riskLevel || 'unknown'}`),
                        selectedExecutionCard.executorBlocker?.message ? h('div', { className: 'signal-meta muted' }, `Blocker: ${selectedExecutionCard.executorBlocker.message}`) : null,
                      )
                    : h('div', { className: 'signal-empty muted' }, 'No execution card is selected or queued for executor review.'),
                  h('div', { className: 'button-row' },
                    h('button', {
                      className: 'mini',
                      type: 'button',
                      'data-qa': 'executor-run-button',
                      disabled: agentWorkerBusyId === 'executor' || !selectedExecutionCard,
                      onClick: () => runExecutorWorkerAssessment().catch((error) => setStatus(error.message)),
                    }, agentWorkerBusyId === 'executor' ? 'Running...' : 'Run executor check'),
                  ),
                ) : null,
                h('div', { className: 'inspector-block panel-card' },
                  h('div', { className: 'inspector-label' }, 'Throughput'),
                  h(ThroughputBar, { label: 'Assigned', value: selectedAgent.workload.assignedTasks, max: 6 }),
                  h(ThroughputBar, { label: 'Queue', value: selectedAgent.workload.queueSize, max: 5 }),
                  h(ThroughputBar, { label: 'Outputs', value: selectedAgent.workload.outputs, max: 4 }),
                ),
              ),
          h('div', { className: 'inspector-block panel-card' },
            h('div', { className: 'inspector-label' }, 'Feedback Thread'),
            h('div', { className: 'comment-thread' },
              (selectedAgent.comments || []).length
                ? selectedAgent.comments.map((entry) => h('div', { key: entry.id, className: 'comment-entry' },
                    h('div', { className: 'comment-meta muted' }, new Date(entry.createdAt).toLocaleString()),
                    h('div', null, entry.text),
                  ))
                : h('div', { className: 'muted' }, 'No comments yet for this agent.'),
            ),
            h('textarea', {
              className: 'comment-box',
              placeholder: `Leave feedback for ${selectedAgent.name}`,
              value: commentDraft,
              onChange: (event) => setCommentDraft(event.target.value),
              onFocus: () => keys.current.clear(),
            }),
            h('div', { className: 'button-row' },
              h('button', { className: 'mini', type: 'button', onClick: addComment }, 'Add comment'),
              h('button', { className: 'mini', type: 'button', onClick: () => focusStudioAgent(selectedAgent.id) }, 'Refocus station'),
              canReviewIntent ? h('button', { className: 'mini', type: 'button', onClick: reviewSelectedAgent }, reviewPanelOpen ? 'Report open' : 'Open problem report') : null,
            ),
          ),
          h('div', { className: 'inspector-block panel-card trace-panel' },
            h('div', { className: 'inspector-label' }, 'Trace Debug (last 5)'),
            traceLog.length
              ? traceLog.map((trace) => {
                  const latestStage = trace.steps?.[trace.steps.length - 1]?.stage || 'pending';
                  const expanded = Boolean(expandedTraceIds[trace.trace_id]);
                  return h('div', { key: trace.trace_id, className: 'trace-entry' },
                    h('button', {
                      className: 'mini',
                      type: 'button',
                      onClick: () => setExpandedTraceIds((current) => ({ ...current, [trace.trace_id]: !expanded })),
                    }, `${expanded ? 'Hide' : 'Show'} ${trace.trace_id}`),
                    h('div', { className: 'muted' }, `${trace.steps.length} steps | latest: ${latestStage}`),
                    expanded ? h('pre', { className: 'doc trace-json' }, JSON.stringify(trace, null, 2)) : null,
                  );
                })
              : h('div', { className: 'signal-empty muted' }, 'No traces yet. Run context intake or executor actions.'),
          ),
        ),
      ),
    ),
    renderDeskPropertiesPanel(),
    preview && h('div', { className: 'modal' },
      h('div', { className: 'modal-content card' },
        h('div', { className: 'card-title' }, 'ACE Suggestion Preview'),
        h('pre', { className: 'doc' }, preview.summary.join('\n')),
        h('div', { className: 'button-row' },
          h('button', { type: 'button', onClick: approvePreview }, 'Accept Preview'),
          h('button', { type: 'button', onClick: () => setPreview(null) }, 'Dismiss'),
        ),
      ),
    ),
  );
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

function drawCanvasScene(canvas, graph, viewport, connecting, pointerWorld, simIndex, sketches, annotations, selectedSketchId, selectedAnnotationId) {
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
    const x1 = source.position.x * viewport.zoom + viewport.x + NODE_LAYOUT.outputAnchorX * viewport.zoom;
    const y1 = source.position.y * viewport.zoom + viewport.y + NODE_LAYOUT.anchorY * viewport.zoom;
    const x2 = target.position.x * viewport.zoom + viewport.x + NODE_LAYOUT.inputAnchorX * viewport.zoom;
    const y2 = target.position.y * viewport.zoom + viewport.y + NODE_LAYOUT.anchorY * viewport.zoom;
    const color = simIndex === index ? '#5ce29f' : 'rgba(143, 167, 255, 0.9)';
    ctx.strokeStyle = color;
    ctx.lineWidth = simIndex === index ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(x1 + 90, y1, x2 - 90, y2, x2, y2);
    ctx.stroke();
    drawArrowHead(ctx, x1, y1, x2, y2, color);
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

ReactDOM.createRoot(document.getElementById('spatial-root')).render(h(SpatialNotebook));












