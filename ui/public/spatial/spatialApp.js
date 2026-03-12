import { GraphEngine, createNode, createEdge, buildStarterGraph, NODE_TYPES } from './graphEngine.js';
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
import { buildAgentSnapshots, createInitialComments, getStudioAgents } from './studioData.js';

const { useEffect, useMemo, useRef, useState } = React;
const h = React.createElement;

const STUDIO_SIZE = { width: 1200, height: 800 };
const STATUS_META = {
  idle: { badge: 'IDLE', tone: 'idle' },
  thinking: { badge: 'THINK', tone: 'thinking' },
  processing: { badge: 'RUN', tone: 'processing' },
  blocked: { badge: 'BLOCK', tone: 'blocked' },
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

const LABEL_MAP = [
  { label: 'context', match: /context|brief|constraint|intent|memory/i },
  { label: 'plan', match: /plan|task|sequence|milestone|todo|roadmap/i },
  { label: 'execution', match: /build|implement|ship|code|module|service/i },
  { label: 'ux', match: /ux|ui|screen|flow/i },
  { label: 'governance', match: /rule|review|guardrail|architect|ace/i },
];

function suggestRole(node, graph) {
  const text = (node.content || '').toLowerCase();
  const outgoing = graph.edges.filter((edge) => edge.source === node.id).length;
  if (/rule|constraint|must|never|always/.test(text)) return 'constraint';
  if (/api|service|module|subsystem|architecture/.test(text)) return 'module';
  if (/file|\.js|\.py|\.ts|src\//.test(text)) return 'file';
  if (/todo|build|make|implement|task|ship/.test(text) || outgoing > 1) return 'task';
  if (/ux|ui|screen|flow/.test(text)) return 'ux';
  return 'thought';
}

function deriveLabels(content = '', metadata = {}) {
  const base = Array.isArray(metadata.labels) ? metadata.labels : [];
  const inferred = LABEL_MAP.filter((entry) => entry.match.test(content)).map((entry) => entry.label);
  return [...new Set([...base, ...inferred])];
}

function classifyNode(node, graph) {
  const inferredRole = suggestRole(node, graph);
  const role = node.metadata?.manualOverride
    ? (node.metadata?.role || node.type || inferredRole)
    : inferredRole;
  return {
    type: node.metadata?.manualOverride ? (node.type || 'text') : (role === 'thought' ? 'text' : role),
    metadata: {
      ...node.metadata,
      role,
      labels: deriveLabels(node.content, node.metadata),
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

function SpatialNotebook() {
  const [graphEngine] = useState(() => new GraphEngine(buildStarterGraph()));
  const [ace] = useState(() => new AceConnector());
  const [memory] = useState(() => new ArchitectureMemory());
  const [mutationEngine] = useState(() => new MutationEngine(graphEngine));

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
  const [dashboardState, setDashboardState] = useState({});
  const [recentRuns, setRecentRuns] = useState([]);
  const [recentHistory, setRecentHistory] = useState([]);
  const [agentComments, setAgentComments] = useState(createInitialComments());
  const [selectedAgentId, setSelectedAgentId] = useState('context-manager');
  const [commentDraft, setCommentDraft] = useState('');
  const [contextDraft, setContextDraft] = useState('');
  const [scanPreview, setScanPreview] = useState(null);
  const [scannerBusy, setScannerBusy] = useState(false);
  const [intentState, setIntentState] = useState(EMPTY_INTENT_STATE);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(380);
  const [reviewPanelOpen, setReviewPanelOpen] = useState(false);

  const canvasRef = useRef(null);
  const studioRef = useRef(null);
  const draggingNode = useRef(null);
  const isPanning = useRef(false);
  const connectState = useRef(null);
  const keys = useRef(new Set());
  const raf = useRef(null);
  const activeSketch = useRef(null);
  const studioPanning = useRef(false);
  const hasLoadedWorkspace = useRef(false);
  const autosaveTimer = useRef(null);
  const lastCanvasViewport = useRef(createDefaultCanvasViewport());
  const lastStudioViewport = useRef(createDefaultStudioViewport());
  const sidebarResize = useRef(null);

  const selected = graph.nodes.find((node) => node.id === selectedId) || null;
  const contextNode = graph.nodes.find((node) => node.metadata?.agentId === 'context-manager') || null;
  const latestIntentReport = intentState.contextReport || intentState.latest || null;
  const selectedIntent = selected?.metadata?.intentAnalysis || intentState.byNode?.[selected?.id] || null;

  const workspacePayload = useMemo(() => ({
    graph,
    sketches,
    annotations,
    architectureMemory: memory.model,
    agentComments,
    intentState,
    studio: {
      scene,
      selectedAgentId,
      canvasViewport,
      studioViewport,
      sidebar: {
        collapsed: sidebarCollapsed,
        width: sidebarWidth,
      },
    },
  }), [graph, sketches, annotations, agentComments, intentState, scene, selectedAgentId, canvasViewport, studioViewport, sidebarCollapsed, sidebarWidth, memory]);

  const agentSnapshots = useMemo(() => buildAgentSnapshots({
    workspace: workspacePayload,
    dashboardState,
    runs: recentRuns,
    agentComments,
  }), [workspacePayload, dashboardState, recentRuns, agentComments]);

  const selectedAgent = agentSnapshots.find((agent) => agent.id === selectedAgentId) || agentSnapshots[0] || null;
  const latestRun = recentRuns[0] || null;
  const reviewReport = selectedAgent?.reviewReport || null;
  const reviewSourceNode = reviewReport?.nodeId
    ? graph.nodes.find((node) => node.id === reviewReport.nodeId) || null
    : contextNode;
  const sidebarColumnWidth = sidebarCollapsed ? 74 : sidebarWidth;
  const architectureMemory = useMemo(() => ({
    subsystems: memory.model.subsystems,
    modules: memory.model.modules,
    rules: memory.model.rules,
    layers: memory.model.layers,
  }), [memory, graph]);

  useEffect(() => {
    let cancelled = false;
    loadWorkspace().then((workspace) => {
      if (cancelled) return;
      graphEngine.setState(workspace.graph || buildStarterGraph());
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
      const storedStudio = workspace.studio || {};
      setCanvasViewport(storedStudio.canvasViewport || createDefaultCanvasViewport());
      setStudioViewport(storedStudio.studioViewport || createDefaultStudioViewport());
      setScene(storedStudio.scene || SCENES.CANVAS);
      setSelectedAgentId(storedStudio.selectedAgentId || 'context-manager');
      setSidebarCollapsed(Boolean(storedStudio.sidebar?.collapsed));
      setSidebarWidth(clamp(Number(storedStudio.sidebar?.width) || 380, 300, 520));
      const contextNode = (workspace.graph?.nodes || []).find((node) => node.metadata?.agentId === 'context-manager');
      const storedIntentState = workspace.intentState || EMPTY_INTENT_STATE;
      setIntentState({
        latest: storedIntentState.latest || null,
        contextReport: storedIntentState.contextReport || null,
        byNode: storedIntentState.byNode || {},
        reports: Array.isArray(storedIntentState.reports) ? storedIntentState.reports : [],
      });
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
    memory.syncFromGraph(graph);
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
  }, [graph, canvasViewport, memory, pointerWorld, simulating, simStep, paused, sketches, annotations, selectedSketchId, selectedAnnotationId]);

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
    if (!hasLoadedWorkspace.current) return undefined;
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      saveWorkspace(workspacePayload)
        .then(() => setStatus(`autosaved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`))
        .catch((error) => setStatus(`save failed: ${error.message}`));
    }, 700);
    return () => clearTimeout(autosaveTimer.current);
  }, [workspacePayload]);

  async function refreshFeeds() {
    try {
      const [dashboardResponse, runsResponse, historyResponse] = await Promise.all([
        fetch('/api/dashboard'),
        fetch('/api/runs'),
        fetch('/api/spatial/history'),
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
    } catch {
      setStatus('feed refresh unavailable');
    }
  }

  useEffect(() => {
    refreshFeeds();
  }, []);

  useInterval(refreshFeeds, 15000);

  const toWorld = (clientX, clientY) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - canvasViewport.x) / canvasViewport.zoom,
      y: (clientY - rect.top - canvasViewport.y) / canvasViewport.zoom,
    };
  };

  const addNodeAt = (position, type = 'text', content = 'new note', metadata = { role: 'thought' }) => {
    const node = createNode({ type, content, position, metadata });
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
    const node = upsertContextNode(contextDraft);
    if (!node) {
      setStatus('add context before sending it to ACE');
      return null;
    }
    setStatus('context manager intake updated');
    return graphEngine.getState().nodes.find((entry) => entry.id === node.id) || node;
  };

  const scanContextIntent = async () => {
    if (!contextDraft.trim()) {
      setStatus('context intake is empty');
      return;
    }
    setScannerBusy(true);
    try {
      const contextNode = captureContextInput();
      const response = await ace.parseIntent(contextDraft);
      const report = {
        ...response,
        nodeId: contextNode?.id || null,
        source: 'context-intake',
        createdAt: new Date().toISOString(),
      };
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
            agentId: 'context-manager',
          },
        });
        setGraph({ ...graphEngine.getState() });
      }
      setIntentState((current) => ({
        latest: report,
        contextReport: report,
        byNode: contextNode?.id ? { ...current.byNode, [contextNode.id]: report } : current.byNode,
        reports: [report, ...(current.reports || []).filter((entry) => entry.nodeId !== contextNode?.id)].slice(0, 24),
      }));
      setSelectedAgentId('context-manager');
      setStatus(`intent manager confidence ${Math.round((response.confidence || 0) * 100)}% | ${(response.tasks || []).length} intent items`);
    } catch (error) {
      setStatus(`scan failed: ${error.message}`);
    } finally {
      setScannerBusy(false);
    }
  };

  const promoteScanPreview = (overrideReport = null) => {
    const report = overrideReport || scanPreview || reviewReport;
    const contextNode = upsertContextNode(contextDraft || reviewSourceNode?.content || '');
    if (!contextNode || !report?.tasks?.length) {
      setStatus('scan context first');
      return;
    }
    const mutations = mutationEngine.buildMutationRequestFromIntent(contextNode, report);
    mutationEngine.applyMutations(mutations);
    setGraph({ ...graphEngine.getState() });
    setSelectedAgentId('planner');
    setReviewPanelOpen(false);
    setStatus(`planner received ${report.tasks.length} tasks`);
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

  const commitNodeIntent = async (nodeId, rawContent) => {
    const current = graphEngine.getState().nodes.find((node) => node.id === nodeId);
    if (!current) return;
    const content = (rawContent || '').trim();
    graphEngine.updateNode(nodeId, {
      content,
      metadata: {
        ...(current.metadata || {}),
        intentStatus: content ? 'processing' : 'idle',
      },
    });
    let nextNode = graphEngine.getState().nodes.find((node) => node.id === nodeId);
    const patch = classifyNode(nextNode, graphEngine.getState());
    graphEngine.updateNode(nodeId, patch);
    setGraph({ ...graphEngine.getState() });
    if (!content) {
      setStatus('node updated');
      return;
    }
    try {
      const response = await ace.parseIntent(content);
      nextNode = graphEngine.getState().nodes.find((node) => node.id === nodeId);
      const report = {
        ...response,
        nodeId,
        source: 'node-enter',
        createdAt: new Date().toISOString(),
      };
      const mergedLabels = [...new Set([...(patch.metadata?.labels || []), ...(response.classification?.labels || [])])];
      const resolvedRole = nextNode?.metadata?.manualOverride
        ? (nextNode.metadata.role || patch.metadata.role)
        : (response.classification?.role || patch.metadata.role || 'thought');
      graphEngine.updateNode(nodeId, {
        type: nextNode?.metadata?.manualOverride ? (nextNode.type || patch.type) : (resolvedRole === 'thought' ? 'text' : resolvedRole),
        metadata: {
          ...(nextNode?.metadata || {}),
          ...patch.metadata,
          role: resolvedRole,
          labels: mergedLabels,
          intentAnalysis: report,
          intentStatus: 'ready',
        },
      });
      setGraph({ ...graphEngine.getState() });
      setIntentState((currentState) => ({
        latest: report,
        contextReport: current?.metadata?.agentId === 'context-manager' ? report : currentState.contextReport,
        byNode: { ...currentState.byNode, [nodeId]: report },
        reports: [report, ...(currentState.reports || []).filter((entry) => entry.nodeId !== nodeId)].slice(0, 24),
      }));
      if (current?.metadata?.agentId === 'context-manager') {
        setContextDraft(content);
        setScanPreview(report);
      }
      setSelectedAgentId('context-manager');
      setStatus(`intent manager confidence ${Math.round((response.confidence || 0) * 100)}% | ${(response.tasks || []).length} tasks for ${resolvedRole}`);
    } catch {
      graphEngine.updateNode(nodeId, {
        metadata: {
          ...(graphEngine.getState().nodes.find((node) => node.id === nodeId)?.metadata || {}),
          intentStatus: 'error',
        },
      });
      setGraph({ ...graphEngine.getState() });
      setStatus('intent parsing unavailable');
    }
  };

  const removeNode = (id) => {
    graphEngine.removeNode(id);
    setGraph({ ...graphEngine.getState() });
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
    graphEngine.clear();
    setGraph({ ...graphEngine.getState() });
    setSketches([]);
    setAnnotations([]);
    setSelectedId(null);
    setSelectedSketchId(null);
    setSelectedAnnotationId(null);
    setCanvasViewport(createDefaultCanvasViewport());
    setScene(SCENES.CANVAS);
    setContextDraft('');
    setScanPreview(null);
    setStatus('new blank canvas ready');
  };

  const startSidebarResize = (event) => {
    if (sidebarCollapsed) return;
    event.preventDefault();
    sidebarResize.current = { startX: event.clientX, startWidth: sidebarWidth };
  };

  const focusStudioAgent = (agentId) => {
    const baseAgent = getStudioAgents().find((agent) => agent.id === agentId);
    const container = studioRef.current;
    if (!baseAgent || !container) return;
    const zoom = agentId === 'cto-architect' ? 1.24 : 1.36;
    const stageX = (baseAgent.position.x / 100) * STUDIO_SIZE.width;
    const stageY = (baseAgent.position.y / 100) * STUDIO_SIZE.height;
    const nextViewport = {
      zoom,
      x: container.clientWidth / 2 - stageX * zoom,
      y: container.clientHeight / 2 - stageY * zoom,
    };
    setSelectedAgentId(agentId);
    setStudioViewport(nextViewport);
    setReviewPanelOpen(agentId === 'context-manager');
    setScene(SCENES.STUDIO);
  };

  const focusCanvasNode = (nodeId) => {
    const node = graphEngine.getState().nodes.find((entry) => entry.id === nodeId);
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
    if (selectedAgentId === 'context-manager' && reviewReport) {
      setReviewPanelOpen(true);
      setStatus('reviewing latest context intent in studio');
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

  const onStudioMouseDown = (event) => {
    if (event.target.closest('.agent-station')) return;
    studioPanning.current = true;
  };

  const onStudioMouseMove = (event) => {
    if (!studioPanning.current) return;
    setStudioViewport((viewport) => ({ ...viewport, x: viewport.x + event.movementX, y: viewport.y + event.movementY }));
  };

  const onStudioMouseUp = () => {
    studioPanning.current = false;
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
    setGraph({ ...graphEngine.getState() });
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
    const decomposition = await ace.decomposeTask(node);
    const mutations = mutationEngine.buildMutationRequestFromIntent(node, decomposition);
    const previewResponse = await ace.previewMutation(mutations);
    setPreview({ mutations, summary: previewResponse.summary });
  };

  const approvePreview = async () => {
    await ace.applyMutation(preview.mutations);
    mutationEngine.applyMutations(preview.mutations);
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
  const canReviewIntent = selectedAgentId === 'context-manager' && !!reviewReport;
  const canPromoteIntent = selectedAgentId === 'context-manager' && !!reviewReport?.tasks?.length;

  return h('section', { className: 'spatial-main ace-shell', style: { gridTemplateColumns: `minmax(0, 1fr) ${sidebarColumnWidth}px` } },
    h('div', { className: 'canvas-column scene-column' },
      h('div', { className: 'canvas-toolbar ace-toolbar' },
        h('div', null,
          h('div', { className: 'workspace-title' }, 'ACE Overlay Workspace'),
          h('div', { className: 'toolbar-caption muted' }, 'Canvas remains primary. Zoom out or press Tab for ACE Studio.'),
        ),
        h('div', { className: 'toolbar-actions toolbar-main' },
          h('div', { className: 'toolbar-meta' },
            h('div', { className: 'scene-switcher' },
              h('button', { className: `mini ${scene === SCENES.CANVAS ? 'active' : ''}`, onClick: () => setScene(SCENES.CANVAS), type: 'button' }, 'Canvas'),
              h('button', { className: `mini ${scene === SCENES.STUDIO ? 'active' : ''}`, onClick: () => setScene(SCENES.STUDIO), type: 'button' }, 'ACE Studio'),
            ),
            h('select', {
              className: 'mini recent-select',
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
            h('span', { className: 'toolbar-status' }, `${sceneLabel} | Canvas ${Math.round(canvasViewport.zoom * 100)}% | Studio ${Math.round(studioViewport.zoom * 100)}% | ${status}`),
          ),
          h('div', { className: 'canvas-control-dock' },
            h('div', { className: 'button-row' },
              h('button', { className: 'mini', onClick: newCanvas, type: 'button' }, 'New Canvas'),
              h('button', { className: `mini ${sketchMode ? 'active' : ''}`, onClick: () => setSketchMode((value) => !value), type: 'button', disabled: scene !== SCENES.CANVAS }, sketchMode ? 'Sketch On' : 'Sketch'),
              h('button', { className: 'mini', onClick: clearSketchLayer, type: 'button', disabled: scene !== SCENES.CANVAS }, 'Clear Marks'),
              h('button', { className: 'mini', onClick: () => setSimulating((value) => !value), type: 'button' }, simulating ? 'Stop Sim' : 'Simulate'),
              selected && h('button', { className: 'mini', onClick: () => runAiProcess(selected).catch((error) => setStatus(error.message)), type: 'button' }, 'Ask ACE'),
            ),
          ),
        ),
      ),
      h('div', { className: 'scene-shell' },
        h('div', {
          className: `scene-layer canvas-scene ${scene === SCENES.CANVAS ? 'active' : 'inactive'}`,
          'aria-hidden': scene !== SCENES.CANVAS,
        },
          h('div', {
            className: 'canvas-shell',
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
              const classified = classifyNode(node, graph);
              const labels = classified.metadata.labels || [];
              return h('div', {
                key: node.id,
                className: `node ${classified.metadata.role} ${selectedId === node.id ? 'selected' : ''}`,
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
                h('div', { className: 'node-header' }, `${classified.metadata.role.toUpperCase()} | ${node.id.slice(-4)}`),
                h('textarea', {
                  className: 'node-editor',
                  value: node.content,
                  onChange: (event) => updateNode(node.id, { content: event.target.value }),
                  onFocus: () => keys.current.clear(),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      commitNodeIntent(node.id, event.target.value).catch((error) => setStatus(error.message));
                    }
                  },
                  onMouseDown: (event) => event.stopPropagation(),
                }),
                h('div', { className: 'node-footer' },
                  h('div', { className: 'node-labels' }, labels.length ? labels.join(' - ') : 'press Enter to classify'),
                  h('div', { className: 'node-intent-summary' }, summarizeIntentReport(node.metadata?.intentAnalysis)),
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
          'aria-hidden': scene !== SCENES.STUDIO,
        },
          h('div', {
            ref: studioRef,
            className: 'studio-shell',
            onMouseDown: onStudioMouseDown,
            onMouseMove: onStudioMouseMove,
            onMouseUp: onStudioMouseUp,
            onMouseLeave: onStudioMouseUp,
            onWheel: onStudioWheel,
          },
            h('div', {
              className: 'studio-world',
              style: {
                width: `${STUDIO_SIZE.width}px`,
                height: `${STUDIO_SIZE.height}px`,
                transform: `translate(${studioViewport.x}px, ${studioViewport.y}px) scale(${studioViewport.zoom})`,
              },
            },
              h('div', { className: 'studio-floor' }),
              h('div', { className: 'studio-lane lane-top' }),
              h('div', { className: 'studio-lane lane-mid' }),
              h('div', { className: 'studio-lane lane-side' }),
              agentSnapshots.map((agent) => {
                const meta = STATUS_META[agent.status] || STATUS_META.idle;
                return h('button', {
                  key: agent.id,
                  className: `agent-station ${selectedAgentId === agent.id ? 'selected' : ''} ${agent.isOversight ? 'oversight' : ''}`,
                  style: {
                    left: `${agent.position.x}%`,
                    top: `${agent.position.y}%`,
                    '--agent-accent': agent.theme.accent,
                    '--agent-shadow': agent.theme.shadow,
                  },
                  type: 'button',
                  onClick: () => focusStudioAgent(agent.id),
                },
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
                  style: { left: `${agent.position.x}%`, top: `${agent.position.y}%`, background: agent.theme.accent },
                  onClick: () => focusStudioAgent(agent.id),
                  title: agent.name,
                })),
              ),
              h('div', { className: 'muted' }, 'Click a station to inspect scope and leave feedback.'),
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
            h('div', { className: 'muted' }, 'This is the direct input surface for the context agent and intent scanner.'),
            h('textarea', {
              value: contextDraft,
              placeholder: 'Describe the project intent, architecture concerns, and what ACE should understand next.',
              onChange: (event) => setContextDraft(event.target.value),
              onFocus: () => keys.current.clear(),
            }),
            h('div', { className: 'button-row' },
              h('button', { className: 'mini', type: 'button', onClick: captureContextInput }, 'Save to Context'),
              h('button', { className: 'mini', type: 'button', onClick: () => scanContextIntent().catch((error) => setStatus(error.message)), disabled: scannerBusy }, scannerBusy ? 'Scanning...' : 'Scan Intent'),
              scanPreview?.tasks?.length ? h('button', { className: 'mini', type: 'button', onClick: promoteScanPreview }, 'Send to Planner') : null,
            ),
            scanPreview?.tasks?.length
              ? h(React.Fragment, null,
                h('div', { className: 'intent-summary-card' },
                  h('div', { className: 'confidence-pill' }, `${Math.round((scanPreview.confidence || 0) * 100)}% confidence`),
                  h('div', null, scanPreview.summary || 'Intent captured.'),
                ),
                h('ul', { className: 'signal-list' }, scanPreview.tasks.map((task, index) => h('li', { key: `scan-${index}` }, task))),
                h('div', { className: 'criteria-list' }, (scanPreview.criteria || []).map((criterion) => h('div', { key: criterion.id || criterion.label, className: 'criteria-row' },
                  h('span', null, `${criterion.label}: ${Math.round((criterion.score || 0) * 100)}%`),
                  h('span', { className: 'muted' }, criterion.reason || ''),
                ))),
              )
              : h('div', { className: 'signal-empty muted' }, 'Run the scanner to preview extracted intent items.'),
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
            h('div', { className: 'muted' }, 'Double-click to add nodes. Drag from node handles to create arrows. Press Enter inside a node to classify and judge intent. Use Delete or Backspace to remove selections. Use K for sketch mode.'),
          ),
          h('div', { className: 'inspector-block' },
            h('div', { className: 'inspector-label' }, 'Architecture Memory'),
            h('pre', { className: 'doc' }, JSON.stringify(architectureMemory, null, 2)),
          ),
          h('div', { className: 'inspector-block' },
            h('div', { className: 'inspector-label' }, 'Quick Node Types'),
            h('div', { className: 'button-row' }, NODE_TYPES.map((type) => h('button', {
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
          selectedAgent.id === 'context-manager' && reviewReport && reviewPanelOpen ? h('div', { className: 'inspector-block panel-card review-panel' },
            h('div', { className: 'inline review-header' },
              h('div', null,
                h('div', { className: 'inspector-label' }, 'Studio Review'),
                h('div', { className: 'signal-summary' }, reviewReport.summary || 'Intent ready for review'),
              ),
              h('button', { className: 'mini', type: 'button', onClick: () => setReviewPanelOpen(false) }, 'Close')
            ),
            h('div', { className: 'muted' }, `Source: ${reviewSourceNode?.id || reviewReport.nodeId || 'context input'}`),
            h('div', { className: 'confidence-pill' }, `${Math.round((reviewReport.confidence || 0) * 100)}% confidence`),
            h('div', { className: 'criteria-list' }, (reviewReport.criteria || []).map((criterion) => h('div', { key: criterion.id || criterion.label, className: 'criteria-row' },
              h('span', null, `${criterion.label}: ${Math.round((criterion.score || 0) * 100)}%`),
              h('span', { className: 'muted' }, criterion.reason || ''),
            ))),
            reviewReport.tasks?.length ? h('ul', { className: 'signal-list' }, reviewReport.tasks.map((task, index) => h('li', { key: `review-task-${index}` }, task))) : h('div', { className: 'signal-empty muted' }, 'No extracted tasks yet.'),
            h('div', { className: 'button-row' },
              h('button', { className: 'mini', type: 'button', onClick: () => promoteScanPreview(reviewReport) }, 'Send to planner'),
              reviewSourceNode ? h('button', { className: 'mini', type: 'button', onClick: () => focusCanvasNode(reviewSourceNode.id) }, 'Open source node') : null,
            ),
          ) : null,
          h('div', { className: 'inspector-block panel-card' },
            h('div', { className: 'inspector-label' }, 'Workstation'),
            h('div', { className: 'muted' }, selectedAgent.responsibility),
            h('div', { className: 'agent-focus muted' }, selectedAgent.focusSummary),
          ),
          h('div', { className: 'inspector-block panel-card' },
            h('div', { className: 'inspector-label' }, 'Throughput'),
            h(ThroughputBar, { label: 'Assigned', value: selectedAgent.workload.assignedTasks, max: 6 }),
            h(ThroughputBar, { label: 'Queue', value: selectedAgent.workload.queueSize, max: 5 }),
            h(ThroughputBar, { label: 'Outputs', value: selectedAgent.workload.outputs, max: 4 }),
          ),
          h('div', { className: 'inspector-block panel-card' },
            h('div', { className: 'inspector-label' }, 'Recent Actions'),
            h('ul', { className: 'list compact-list' },
              selectedAgent.recentActions.map((entry, index) => h('li', { key: `${selectedAgent.id}-${index}` }, entry)),
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
              canReviewIntent ? h('button', { className: 'mini', type: 'button', onClick: reviewSelectedAgent }, reviewPanelOpen ? 'Review open' : 'Review intent') : null,
              canPromoteIntent ? h('button', { className: 'mini', type: 'button', onClick: () => promoteScanPreview(reviewReport) }, 'Send to planner') : null,
            ),
          ),
        ),
      ),
    ),
    preview && h('div', { className: 'modal' },
      h('div', { className: 'modal-content card' },
        h('div', { className: 'card-title' }, 'ACE Suggestion Preview'),
        h('pre', { className: 'doc' }, preview.summary.join('\n')),
        h('div', { className: 'button-row' },
          h('button', { type: 'button', onClick: approvePreview }, 'Apply'),
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




























