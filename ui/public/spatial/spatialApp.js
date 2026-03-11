import { GraphEngine, createNode, createEdge, buildStarterGraph, NODE_TYPES } from './graphEngine.js';
import { AceConnector } from './aceConnector.js';
import { MutationEngine } from './mutationEngine.js';
import { ArchitectureMemory } from './architectureMemory.js';
import { loadWorkspace, saveWorkspace } from './persistence.js';

const { useEffect, useMemo, useRef, useState } = React;

function suggestRole(node, graph) {
  const text = (node.content || '').toLowerCase();
  const outgoing = graph.edges.filter((e) => e.source === node.id).length;
  if (/rule|constraint|must|never|always/.test(text)) return 'constraint';
  if (/api|service|module|subsystem/.test(text)) return 'module';
  if (/file|\.js|\.py|\.ts|src\//.test(text)) return 'file';
  if (/todo|build|make|implement|task/.test(text) || outgoing > 1) return 'task';
  if (/ux|ui|screen|flow/.test(text)) return 'ux';
  return 'thought';
}

function zoomLevel(zoom) {
  if (zoom < 0.7) return 'overview';
  if (zoom < 1.2) return 'structure';
  return 'detail';
}

function SpatialIDE() {
  const [graphEngine] = useState(() => new GraphEngine(buildStarterGraph()));
  const [ace] = useState(() => new AceConnector());
  const [memory] = useState(() => new ArchitectureMemory());
  const [mutationEngine] = useState(() => new MutationEngine(graphEngine));
  const [graph, setGraph] = useState(graphEngine.getState());
  const [selectedId, setSelectedId] = useState(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [connecting, setConnecting] = useState(null);
  const [preview, setPreview] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [simStep, setSimStep] = useState(0);
  const [status, setStatus] = useState('ready');
  const [pointerWorld, setPointerWorld] = useState(null);

  const canvasRef = useRef(null);
  const draggingNode = useRef(null);
  const panning = useRef(false);
  const connecting = useRef(null);
  const keys = useRef(new Set());
  const raf = useRef(null);

  const selected = graph.nodes.find((n) => n.id === selectedId) || null;
  const level = zoomLevel(viewport.zoom);

  useEffect(() => {
    loadWorkspace().then((ws) => {
      if (ws.graph?.nodes?.length) {
        graphEngine.setState(ws.graph);
        setGraph({ ...graphEngine.getState() });
      }
    }).catch(() => {});
  }, [graphEngine]);

  useEffect(() => {
    memory.syncFromGraph(graph);
    const validation = memory.validate(graph);
    setStatus(validation.valid ? 'architecture-valid' : validation.errors.join(' | '));
    draw(canvasRef.current, graph, viewport, connecting.current, pointerWorld, simulating ? simStep : -1);
  }, [graph, viewport, memory, simulating, simStep, pointerWorld]);

  useEffect(() => {
    const tick = () => {
      const panSpeed = 8;
      let dx = 0;
      let dy = 0;
      if (keys.current.has('w')) dy += panSpeed;
      if (keys.current.has('s')) dy -= panSpeed;
      if (keys.current.has('a')) dx += panSpeed;
      if (keys.current.has('d')) dx -= panSpeed;
      if (dx || dy) setViewport((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);

    const down = (e) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd'].includes(key)) {
        keys.current.add(key);
        if (document.activeElement?.tagName !== 'TEXTAREA') e.preventDefault();
      }
    };
    const up = (e) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    if (!simulating) return undefined;
    const t = setInterval(() => setSimStep((s) => (s + 1) % Math.max(1, graph.edges.length)), 650);
    return () => clearInterval(t);
  }, [simulating, graph.edges.length]);

  const architectureDiff = useMemo(() => ({
    subsystems: memory.model.subsystems,
    modules: memory.model.modules,
    rules: memory.model.rules,
    versions: memory.model.versions,
    layers: memory.model.layers,
  }), [memory, graph]);

  const toWorld = (clientX, clientY) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: (clientX - r.left - viewport.x) / viewport.zoom, y: (clientY - r.top - viewport.y) / viewport.zoom };
  };

  const onCanvasDblClick = (e) => {
    const pos = toWorld(e.clientX, e.clientY);
    const node = createNode({ type: 'text', content: 'new thought', position: pos, metadata: { role: 'thought' } });
    graphEngine.addNode(node);
    setGraph({ ...graphEngine.getState() });
    setSelectedId(node.id);
  };

  const save = async () => {
    memory.snapshot('manual-save', { nodes: graph.nodes.length, edges: graph.edges.length });
    await saveWorkspace({ graph, architectureMemory: memory.model });
    setStatus('saved');
  };

  const runAiProcess = async (node) => {
    const decomposition = await ace.decomposeTask(node);
    const mutations = mutationEngine.buildMutationRequestFromIntent(node, decomposition);
    const previewRes = await ace.previewMutation(mutations);
    setPreview({ mutations, summary: previewRes.summary });
  };

  const approvePreview = async () => {
    await ace.applyMutation(preview.mutations);
    mutationEngine.applyMutations(preview.mutations);
    setGraph({ ...graphEngine.getState() });
    memory.snapshot('mutation-applied', { summary: preview.summary });
    setPreview(null);
  };

  const updateNode = (id, patch) => {
    graphEngine.updateNode(id, patch);
    setGraph({ ...graphEngine.getState() });
  };

  const onNodeMouseDown = (e, node) => {
    e.stopPropagation();
    if (e.shiftKey) {
      connecting.current = { source: node.id };
      return;
    }
    setSelectedId(node.id);
    draggingNode.current = { id: node.id };
    document.body.classList.add('canvas-dragging');
  };

  const onMouseMove = (e) => {
    const world = toWorld(e.clientX, e.clientY);
    setPointerWorld(world);

    if (draggingNode.current) {
      const node = graph.nodes.find((n) => n.id === draggingNode.current.id);
      if (node) {
        node.position = { x: world.x, y: world.y };
        setGraph({ ...graphEngine.getState() });
      }
    }
    if (panning.current) {
      setViewport((v) => ({ ...v, x: v.x + e.movementX, y: v.y + e.movementY }));
    }
  };

  const onMouseUp = () => {
    draggingNode.current = null;
    panning.current = false;
    connecting.current = null;
    document.body.classList.remove('canvas-dragging');
  };

  const onWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.08 : -0.08;
    setViewport((v) => ({ ...v, zoom: Math.min(2.5, Math.max(0.35, Number((v.zoom + delta).toFixed(2)))) }));
  };

  const onCanvasMouseDown = (e) => {
    const isCanvas = e.target === canvasRef.current;
    if (isCanvas && (e.button === 1 || e.button === 2)) {
      e.preventDefault();
      panning.current = true;
      canvasRef.current.focus();
      document.body.classList.add('canvas-dragging');
    }
  };

  return React.createElement('section', { className: 'card spatial-wrap' },
    React.createElement('div', { className: 'card-title' }, 'Spatial Notebook IDE'),
    React.createElement('div', { className: 'button-row' },
      React.createElement('button', { onClick: save }, 'Save Workspace JSON'),
      React.createElement('button', { onClick: () => setSimulating((v) => !v) }, simulating ? 'Stop Simulation' : 'Simulate Architecture'),
      React.createElement('span', { className: 'muted' }, `Status: ${status} • zoom mode: ${level}`),
    ),
    React.createElement('div', { className: 'spatial-main' },
      React.createElement('div', {
        className: 'canvas-shell',
        onMouseMove,
        onMouseUp,
        onMouseLeave: onMouseUp,
      },
      React.createElement('canvas', {
        ref: canvasRef,
        width: 1200,
        height: 700,
        tabIndex: 0,
        onDoubleClick: onCanvasDblClick,
        onWheel,
        onMouseDown: onCanvasMouseDown,
        onContextMenu: (e) => e.preventDefault(),
      }),
      graph.nodes.map((node) => {
        const x = node.position.x * viewport.zoom + viewport.x;
        const y = node.position.y * viewport.zoom + viewport.y;
        const suggested = suggestRole(node, graph);
        const compact = level === 'overview';

        return React.createElement('div', {
          key: node.id,
          className: `node ${suggested} ${selectedId === node.id ? 'selected' : ''}`,
          style: { left: `${x}px`, top: `${y}px`, transform: `scale(${viewport.zoom})`, transformOrigin: 'top left' },
          onMouseDown: (e) => onNodeMouseDown(e, node),
          onMouseUp: () => {
            if (connecting.current && connecting.current.source !== node.id) {
              graphEngine.addEdge(createEdge({ source: connecting.current.source, target: node.id }));
              setGraph({ ...graphEngine.getState() });
            }
            connecting.current = null;
          },
          onClick: (e) => { e.stopPropagation(); setSelectedId(node.id); },
        },
        React.createElement('div', { className: 'node-header' }, `${suggested.toUpperCase()} • ${node.id.slice(-4)}`),
        React.createElement('textarea', {
          value: node.content,
          disabled: compact,
          onChange: (e) => {
            updateNode(node.id, { content: e.target.value });
            if (node.type === 'text') ace.parseIntent(e.target.value).catch(() => {});
          },
        }),
        !compact && React.createElement('div', { className: 'button-row' },
        React.createElement('div', { className: 'button-row' },
          React.createElement('button', { className: 'mini', onClick: (e) => { e.stopPropagation(); setConnecting({ source: node.id }); } }, '↗ connect'),
          React.createElement('button', { className: 'mini', onClick: (e) => { e.stopPropagation(); runAiProcess(node).catch((err) => setStatus(err.message)); } }, 'AI Process'),
          React.createElement('button', { className: 'mini', onClick: (e) => {
            e.stopPropagation();
            const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SR) return setStatus('voice input not supported');
            const sr = new SR();
            sr.onresult = (ev) => updateNode(node.id, { content: ev.results[0][0].transcript });
            sr.start();
          } }, '🎤'),
          React.createElement('button', { className: 'mini', onClick: (e) => { e.stopPropagation(); updateNode(node.id, { type: suggested === 'thought' ? 'text' : suggested, metadata: { ...node.metadata, role: suggested } }); } }, `Adopt ${suggested}`),
        ),
        level === 'detail' && ['module', 'code'].includes(node.type) && React.createElement('div', { className: 'inline-code' },
        ),
        ['module', 'code'].includes(node.type) && React.createElement('div', { className: 'inline-code' },
          React.createElement('textarea', {
            value: node.metadata.code || '',
            onChange: (e) => updateNode(node.id, { metadata: { ...node.metadata, code: e.target.value } }),
            placeholder: 'inline code view',
          }),
        ));
      })),
      React.createElement('aside', { className: 'spatial-sidebar' },
        React.createElement('div', { className: 'card-title' }, 'Architecture Memory'),
        React.createElement('pre', { className: 'doc' }, JSON.stringify(architectureDiff, null, 2)),
        selected && React.createElement('div', { className: 'muted' }, `Selected: ${selected.id}`),
        React.createElement('div', { className: 'card-title' }, 'Create Node'),
        React.createElement('div', { className: 'button-row' }, NODE_TYPES.map((t) => React.createElement('button', {
          key: t,
          className: 'mini',
          onClick: () => {
            graphEngine.addNode(createNode({ type: t, content: `${t} node`, position: { x: 180, y: 180 } }));
            setGraph({ ...graphEngine.getState() });
          },
        }, t))),
      ),
    ),
    preview && React.createElement('div', { className: 'modal' },
      React.createElement('div', { className: 'modal-content card' },
        React.createElement('div', { className: 'card-title' }, 'Workspace Mutation Preview'),
        React.createElement('pre', { className: 'doc' }, `I generated the following changes:\n\n${preview.summary.join('\n')}`),
        React.createElement('div', { className: 'button-row' },
          React.createElement('button', { onClick: approvePreview }, 'Approve & Apply'),
          React.createElement('button', { onClick: () => setPreview(null) }, 'Reject'),
        ),
      ),
    ),
  );
}

function draw(canvas, graph, viewport, connecting, pointerWorld, simIndex) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0a1020';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  for (let x = viewport.x % 40; x < canvas.width; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = viewport.y % 40; y < canvas.height; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }

  graph.edges.forEach((e, idx) => {
    const s = graph.nodes.find((n) => n.id === e.source);
    const t = graph.nodes.find((n) => n.id === e.target);
    if (!s || !t) return;
    const x1 = s.position.x * viewport.zoom + viewport.x + 220 * viewport.zoom;
    const y1 = s.position.y * viewport.zoom + viewport.y + 50 * viewport.zoom;
    const x2 = t.position.x * viewport.zoom + viewport.x;
    const y2 = t.position.y * viewport.zoom + viewport.y + 50 * viewport.zoom;
    ctx.strokeStyle = simIndex === idx ? '#27d49a' : 'rgba(143,167,255,0.85)';
    ctx.lineWidth = simIndex === idx ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(x1 + 60, y1, x2 - 60, y2, x2, y2);
    ctx.stroke();
  });

  if (connecting && pointerWorld) {
    const source = graph.nodes.find((n) => n.id === connecting.source);
    if (source) {
      const x1 = source.position.x * viewport.zoom + viewport.x + 210 * viewport.zoom;
      const y1 = source.position.y * viewport.zoom + viewport.y + 35 * viewport.zoom;
      const x2 = pointerWorld.x * viewport.zoom + viewport.x;
      const y2 = pointerWorld.y * viewport.zoom + viewport.y;
      ctx.strokeStyle = '#ffd167';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = '#ffd167';
      ctx.beginPath();
      ctx.arc(x1, y1, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

ReactDOM.createRoot(document.getElementById('spatial-root')).render(React.createElement(SpatialIDE));
