import { GraphEngine, createNode, createEdge, buildStarterGraph, NODE_TYPES } from './graphEngine.js';
import { AceConnector } from './aceConnector.js';
import { MutationEngine } from './mutationEngine.js';
import { ArchitectureMemory } from './architectureMemory.js';
import { loadWorkspace, saveWorkspace } from './persistence.js';

const { useEffect, useMemo, useRef, useState } = React;

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
  const canvasRef = useRef(null);
  const draggingNode = useRef(null);
  const panning = useRef(null);

  const selected = graph.nodes.find((n) => n.id === selectedId) || null;

  useEffect(() => {
    loadWorkspace().then((ws) => {
      if (ws.graph) {
        graphEngine.setState(ws.graph);
        setGraph({ ...graphEngine.getState() });
      }
    }).catch(() => {});
  }, [graphEngine]);

  useEffect(() => {
    memory.syncFromGraph(graph);
    const validation = memory.validate(graph);
    setStatus(validation.valid ? 'architecture-valid' : validation.errors.join(' | '));
    draw(canvasRef.current, graph, viewport, connecting, simulating ? simStep : -1);
  }, [graph, viewport, connecting, memory, simulating, simStep]);

  useEffect(() => {
    const handler = (e) => {
      const step = 40;
      if (e.key.toLowerCase() === 'w') setViewport((v) => ({ ...v, y: v.y + step }));
      if (e.key.toLowerCase() === 's') setViewport((v) => ({ ...v, y: v.y - step }));
      if (e.key.toLowerCase() === 'a') setViewport((v) => ({ ...v, x: v.x + step }));
      if (e.key.toLowerCase() === 'd') setViewport((v) => ({ ...v, x: v.x - step }));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
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
    const node = createNode({ type: 'text', content: 'New node', position: pos });
    graphEngine.addNode(node);
    setGraph({ ...graphEngine.getState() });
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
    setSelectedId(node.id);
    draggingNode.current = { id: node.id, offset: toWorld(e.clientX, e.clientY) };
  };

  const onMouseMove = (e) => {
    if (draggingNode.current) {
      const world = toWorld(e.clientX, e.clientY);
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
    panning.current = null;
  };

  const onWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    setViewport((v) => ({ ...v, zoom: Math.min(2.5, Math.max(0.4, Number((v.zoom + delta).toFixed(2)))) }));
  };

  const onCanvasMouseDown = (e) => {
    if (e.button === 1 || e.button === 2 || e.target === canvasRef.current) {
      panning.current = true;
    }
  };

  return React.createElement('section', { className: 'card spatial-wrap' },
    React.createElement('div', { className: 'card-title' }, 'Spatial IDE Interface Layer'),
    React.createElement('div', { className: 'button-row' },
      React.createElement('button', { onClick: save }, 'Save Workspace JSON'),
      React.createElement('button', { onClick: () => setSimulating((v) => !v) }, simulating ? 'Stop Simulation' : 'Simulate Flow'),
      React.createElement('span', { className: 'muted' }, `Status: ${status}`),
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
        onDoubleClick: onCanvasDblClick,
        onWheel,
        onMouseDown: onCanvasMouseDown,
      }),
      graph.nodes.map((node) => {
        const x = node.position.x * viewport.zoom + viewport.x;
        const y = node.position.y * viewport.zoom + viewport.y;
        return React.createElement('div', {
          key: node.id,
          className: `node ${node.type} ${selectedId === node.id ? 'selected' : ''}`,
          style: { left: `${x}px`, top: `${y}px`, transform: `scale(${viewport.zoom})`, transformOrigin: 'top left' },
          onMouseDown: (e) => onNodeMouseDown(e, node),
          onMouseUp: () => {
            if (connecting && connecting.source !== node.id) {
              graphEngine.addEdge(createEdge({ source: connecting.source, target: node.id }));
              setGraph({ ...graphEngine.getState() });
            }
            setConnecting(null);
          },
          onClick: (e) => { e.stopPropagation(); setSelectedId(node.id); },
        },
        React.createElement('div', { className: 'node-header' }, `${node.type.toUpperCase()} • ${node.id.slice(-4)}`),
        React.createElement('textarea', {
          value: node.content,
          onChange: (e) => {
            updateNode(node.id, { content: e.target.value });
            if (node.type === 'text') ace.parseIntent(e.target.value).catch(() => {});
          },
        }),
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
        ),
        ['module', 'code'].includes(node.type) && React.createElement('div', { className: 'inline-code' },
          React.createElement('textarea', {
            value: node.metadata.code || '',
            onChange: (e) => updateNode(node.id, { metadata: { ...node.metadata, code: e.target.value } }),
            placeholder: 'inline code view',
          }),
          React.createElement('div', { className: 'button-row' },
            React.createElement('button', { className: 'mini', onClick: async (e) => { e.stopPropagation(); const r = await ace.regenerateCode(node); updateNode(node.id, { metadata: { ...node.metadata, code: r.code } }); } }, 'Regenerate'),
            React.createElement('button', { className: 'mini', onClick: async (e) => { e.stopPropagation(); const t = await ace.generateTests(node); updateNode(node.id, { metadata: { ...node.metadata, tests: t.tests } }); } }, 'Generate Tests'),
            node.type === 'module' && React.createElement('button', { className: 'mini', onClick: (e) => { e.stopPropagation(); updateNode(node.id, { metadata: { ...node.metadata, expanded: !node.metadata.expanded } }); } }, node.metadata.expanded ? 'Collapse' : 'Expand'),
          ),
          node.metadata.expanded && React.createElement('ul', null, ...(node.metadata.subcomponents || []).map((sc) => React.createElement('li', { key: sc }, sc))),
        ));
      })),
      React.createElement('aside', { className: 'spatial-sidebar' },
        React.createElement('div', { className: 'card-title' }, 'Architecture Memory'),
        React.createElement('pre', { className: 'doc' }, JSON.stringify(architectureDiff, null, 2)),
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

function draw(canvas, graph, viewport, connecting, simIndex) {
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
    ctx.strokeStyle = simIndex === idx ? '#27d49a' : 'rgba(143,167,255,0.8)';
    ctx.lineWidth = simIndex === idx ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(x1 + 60, y1, x2 - 60, y2, x2, y2);
    ctx.stroke();
  });

  if (connecting) {
    const source = graph.nodes.find((n) => n.id === connecting.source);
    if (source) {
      const x1 = source.position.x * viewport.zoom + viewport.x + 210 * viewport.zoom;
      const y1 = source.position.y * viewport.zoom + viewport.y + 35 * viewport.zoom;
      ctx.strokeStyle = '#ffd167';
      ctx.beginPath();
      ctx.arc(x1, y1, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

ReactDOM.createRoot(document.getElementById('spatial-root')).render(React.createElement(SpatialIDE));
