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
  if (/api|service|module|subsystem|architecture/.test(text)) return 'module';
  if (/file|\.js|\.py|\.ts|src\//.test(text)) return 'file';
  if (/todo|build|make|implement|task|ship/.test(text) || outgoing > 1) return 'task';
  if (/ux|ui|screen|flow/.test(text)) return 'ux';
  return 'thought';
}

function SpatialNotebook() {
  const [graphEngine] = useState(() => new GraphEngine(buildStarterGraph()));
  const [ace] = useState(() => new AceConnector());
  const [memory] = useState(() => new ArchitectureMemory());
  const [mutationEngine] = useState(() => new MutationEngine(graphEngine));
  const [graph, setGraph] = useState(graphEngine.getState());
  const [selectedId, setSelectedId] = useState(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
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

  const canvasRef = useRef(null);
  const draggingNode = useRef(null);
  const isPanning = useRef(false);
  const connectState = useRef(null);
  const keys = useRef(new Set());
  const raf = useRef(null);
  const activeSketch = useRef(null);

  const selected = graph.nodes.find((n) => n.id === selectedId) || null;

  useEffect(() => {
    loadWorkspace().then((ws) => {
      if (ws.graph?.nodes?.length) {
        graphEngine.setState(ws.graph);
        setGraph({ ...graphEngine.getState() });
      }
      setSketches(Array.isArray(ws.sketches) ? ws.sketches : []);
      setAnnotations(Array.isArray(ws.annotations) ? ws.annotations : []);
    }).catch(() => {});
  }, [graphEngine]);

  useEffect(() => {
    memory.syncFromGraph(graph);
    draw(canvasRef.current, graph, viewport, connectState.current, pointerWorld, simulating && !paused ? simStep : -1, sketches, annotations, selectedSketchId, selectedAnnotationId);
  }, [graph, viewport, memory, pointerWorld, simulating, simStep, paused, sketches, annotations, selectedSketchId, selectedAnnotationId]);

  useEffect(() => {
    setPaused(sketchMode);
  }, [sketchMode]);

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
      if (document.activeElement?.tagName === 'TEXTAREA') return;
      if (key === 'k') {
        e.preventDefault();
        setSketchMode((v) => !v);
      }
      if (key === 'escape') {
        setSketchMode(false);
        setSelectedSketchId(null);
        setSelectedAnnotationId(null);
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
    if (!simulating || paused) return undefined;
    const timer = setInterval(() => {
      setSimStep((s) => (s + 1) % Math.max(1, graph.edges.length));
    }, 650);
    return () => clearInterval(timer);
  }, [simulating, graph.edges.length, paused]);

  const toWorld = (clientX, clientY) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: (clientX - r.left - viewport.x) / viewport.zoom, y: (clientY - r.top - viewport.y) / viewport.zoom };
  };

  const addNodeAt = (position, type = 'text', content = 'new note') => {
    const node = createNode({ type, content, position, metadata: { role: 'thought' } });
    graphEngine.addNode(node);
    setGraph({ ...graphEngine.getState() });
    setSelectedId(node.id);
  };

  const onCanvasDblClick = (e) => addNodeAt(toWorld(e.clientX, e.clientY));

  const onNodeMouseDown = (e, node) => {
    if (sketchMode) return;
    e.stopPropagation();
    setSelectedId(node.id);
    if (e.shiftKey) {
      connectState.current = { source: node.id };
      return;
    }
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

    if (activeSketch.current) {
      activeSketch.current.path.push(world);
      setSketches((prev) => prev.map((stroke) => (
        stroke.id === activeSketch.current.id ? { ...stroke, path: [...activeSketch.current.path] } : stroke
      )));
    }

    if (isPanning.current) {
      setViewport((v) => ({ ...v, x: v.x + e.movementX, y: v.y + e.movementY }));
    }
  };

  const onMouseUp = () => {
    draggingNode.current = null;
    isPanning.current = false;
    activeSketch.current = null;
    document.body.classList.remove('canvas-dragging');
  };

  const hitTestStroke = (world) => {
    const threshold = 10 / viewport.zoom;
    for (let i = sketches.length - 1; i >= 0; i -= 1) {
      const stroke = sketches[i];
      for (const point of stroke.path || []) {
        const dx = point.x - world.x;
        const dy = point.y - world.y;
        if (Math.hypot(dx, dy) <= threshold) return stroke.id;
      }
    }
    return null;
  };

  const hitTestAnnotation = (world) => {
    const width = 170;
    const height = 90;
    for (let i = annotations.length - 1; i >= 0; i -= 1) {
      const note = annotations[i];
      const x = note.position?.x || 0;
      const y = note.position?.y || 0;
      if (world.x >= x && world.x <= x + width && world.y >= y && world.y <= y + height) return note.id;
    }
    return null;
  };

  const onCanvasMouseDown = (e) => {
    if (e.target !== canvasRef.current) return;
    const world = toWorld(e.clientX, e.clientY);
    if (sketchMode && e.button === 0) {
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
      setSketches((prev) => [...prev, stroke]);
      return;
    }
    if (e.button === 1 || e.button === 2 || e.shiftKey) {
      e.preventDefault();
      isPanning.current = true;
      canvasRef.current.focus();
      document.body.classList.add('canvas-dragging');
    }
  };

  const onSketchDoubleClick = (e) => {
    if (!sketchMode) {
      onCanvasDblClick(e);
      return;
    }
    const position = toWorld(e.clientX, e.clientY);
    const content = window.prompt('New annotation', 'Intent note') || '';
    if (!content.trim()) return;
    const annotation = {
      id: `annotation_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      content: content.trim(),
      position,
      metadata: { tag: null, meaning: null },
    };
    setAnnotations((prev) => [...prev, annotation]);
    setSelectedAnnotationId(annotation.id);
    setSelectedSketchId(null);
  };

  const updateAnnotationContent = (id, content) => {
    setAnnotations((prev) => prev.map((note) => (note.id === id ? { ...note, content } : note)));
  };

  const onWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.08 : -0.08;
    setViewport((v) => ({ ...v, zoom: Math.min(2.4, Math.max(0.35, Number((v.zoom + delta).toFixed(2)))) }));
  };

  const updateNode = (id, patch) => {
    graphEngine.updateNode(id, patch);
    setGraph({ ...graphEngine.getState() });
  };

  const save = async () => {
    memory.snapshot('manual-save', { nodes: graph.nodes.length, edges: graph.edges.length });
    await saveWorkspace({ graph, sketches, annotations, architectureMemory: memory.model });
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
      setSketches((prev) => prev.filter((stroke) => stroke.id !== selectedSketchId));
      setSelectedSketchId(null);
    }
    if (selectedAnnotationId) {
      setAnnotations((prev) => prev.filter((note) => note.id !== selectedAnnotationId));
      setSelectedAnnotationId(null);
    }
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
    setPreview(null);
    setStatus('ACE suggestions applied');
  };

  const architectureMemory = useMemo(() => ({
    subsystems: memory.model.subsystems,
    modules: memory.model.modules,
    rules: memory.model.rules,
    layers: memory.model.layers,
  }), [memory, graph]);

  return React.createElement('section', { className: 'spatial-main' },
    React.createElement('div', { className: 'canvas-column' },
      React.createElement('div', { className: 'canvas-toolbar' },
        React.createElement('div', { className: 'workspace-title' }, 'Sketchpad Workspace'),
        React.createElement('div', { className: 'toolbar-actions' },
          React.createElement('button', { className: 'mini', onClick: save }, '💾 Save'),
          React.createElement('button', { className: `mini ${sketchMode ? 'active' : ''}`, onClick: () => setSketchMode((v) => !v), title: 'Toggle sketch mode (K)' }, sketchMode ? '✏️ Sketch On' : '✏️ Sketch'),
          React.createElement('button', { className: 'mini', onClick: clearSketchLayer, title: 'Clear all sketches and annotations' }, '🧹 Clear'),
          (selectedSketchId || selectedAnnotationId) && React.createElement('button', { className: 'mini', onClick: deleteSelection }, '🗑 Delete'),
          React.createElement('button', { className: 'mini', onClick: () => setSimulating((v) => !v) }, simulating ? '⏹ Stop' : '▶ Simulate'),
          selected && React.createElement('button', { className: 'mini', onClick: () => runAiProcess(selected).catch((err) => setStatus(err.message)) }, '✨ Ask ACE'),
          React.createElement('span', { className: 'toolbar-status' }, `${sketchMode ? 'Sketch mode active – simulation paused • ' : ''}Double-click ${sketchMode ? 'add annotation' : 'add note'} • Shift-link • Zoom ${Math.round(viewport.zoom * 100)}% • ${status}`),
        ),
      ),
      React.createElement('div', {
        className: 'canvas-shell',
        onMouseMove,
        onMouseUp,
        onMouseLeave: onMouseUp,
      },
      React.createElement('canvas', {
        ref: canvasRef,
        width: 1600,
        height: 920,
        tabIndex: 0,
        onDoubleClick: onSketchDoubleClick,
        onWheel,
        onMouseDown: onCanvasMouseDown,
        onContextMenu: (e) => e.preventDefault(),
      }),
      annotations.map((note) => {
        const x = note.position.x * viewport.zoom + viewport.x;
        const y = note.position.y * viewport.zoom + viewport.y;
        return React.createElement('div', {
          key: note.id,
          className: `annotation ${selectedAnnotationId === note.id ? 'selected' : ''}`,
          style: { left: `${x}px`, top: `${y}px`, transform: `scale(${viewport.zoom})`, transformOrigin: 'top left' },
          onMouseDown: () => {
            if (!sketchMode) return;
            setSelectedAnnotationId(note.id);
            setSelectedSketchId(null);
          },
        },
        React.createElement('div', { className: 'annotation-header' }, 'Annotation'),
        React.createElement('textarea', {
          value: note.content,
          onChange: (e) => updateAnnotationContent(note.id, e.target.value),
          onMouseDown: (e) => e.stopPropagation(),
          disabled: !sketchMode,
        }));
      }),
      graph.nodes.map((node) => {
        const x = node.position.x * viewport.zoom + viewport.x;
        const y = node.position.y * viewport.zoom + viewport.y;
        const suggested = suggestRole(node, graph);
        return React.createElement('div', {
          key: node.id,
          className: `node ${suggested} ${selectedId === node.id ? 'selected' : ''}`,
          style: { left: `${x}px`, top: `${y}px`, transform: `scale(${viewport.zoom})`, transformOrigin: 'top left', pointerEvents: sketchMode ? 'none' : 'auto', opacity: sketchMode ? 0.82 : 1 },
          onMouseDown: (e) => onNodeMouseDown(e, node),
          onMouseUp: () => {
            if (connectState.current?.source && connectState.current.source !== node.id) {
              graphEngine.addEdge(createEdge({ source: connectState.current.source, target: node.id }));
              setGraph({ ...graphEngine.getState() });
            }
            connectState.current = null;
          },
        },
        React.createElement('div', { className: 'node-header' }, `${suggested.toUpperCase()} • ${node.id.slice(-4)}`),
        React.createElement('textarea', {
          value: node.content,
          onChange: (e) => {
            updateNode(node.id, { content: e.target.value });
            if (node.type === 'text') ace.parseIntent(e.target.value).catch(() => {});
          },
        }),
        React.createElement('div', { className: 'button-row' },
          React.createElement('button', {
            className: 'mini',
            onClick: (e) => {
              e.stopPropagation();
              updateNode(node.id, { type: suggested === 'thought' ? 'text' : suggested, metadata: { ...node.metadata, role: suggested } });
            },
          }, `Adopt ${suggested}`),
          React.createElement('button', {
            className: 'mini',
            onClick: (e) => {
              e.stopPropagation();
              connectState.current = { source: node.id };
            },
          }, 'Connect'),
        ));
      }))),
    React.createElement('aside', { className: 'spatial-sidebar' },
      React.createElement('div', { className: 'inspector-block' },
        React.createElement('div', { className: 'inspector-label' }, 'Notebook Inspector'),
        selected ? React.createElement('div', { className: 'muted' }, `Selected note: ${selected.id}`) : React.createElement('div', { className: 'muted' }, 'Select any note for context actions.'),
      ),
      React.createElement('div', { className: 'inspector-block' },
        React.createElement('div', { className: 'inspector-label' }, 'Architecture Memory'),
        React.createElement('pre', { className: 'doc' }, JSON.stringify(architectureMemory, null, 2)),
      ),
      React.createElement('div', { className: 'inspector-block' },
        React.createElement('div', { className: 'inspector-label' }, 'Quick Node Types'),
        React.createElement('div', { className: 'button-row' }, NODE_TYPES.map((t) => React.createElement('button', {
          key: t,
          className: 'mini',
          onClick: () => addNodeAt({ x: 180, y: 180 }, t, `${t} note`),
        }, t))),
      ),
      React.createElement('div', { className: 'inspector-block' },
        React.createElement('div', { className: 'inspector-label' }, 'Future Layers'),
        React.createElement('div', { className: 'muted' }, 'Notes and links already sit in a dedicated layer. Add sketch-stroke and AI annotation layers as parallel overlays.'),
      ),
    ),
    preview && React.createElement('div', { className: 'modal' },
      React.createElement('div', { className: 'modal-content card' },
        React.createElement('div', { className: 'card-title' }, 'ACE Suggestion Preview'),
        React.createElement('pre', { className: 'doc' }, preview.summary.join('\n')),
        React.createElement('div', { className: 'button-row' },
          React.createElement('button', { onClick: approvePreview }, 'Apply'),
          React.createElement('button', { onClick: () => setPreview(null) }, 'Dismiss'),
        ),
      ),
    ),
  );
}

function draw(canvas, graph, viewport, connecting, pointerWorld, simIndex, sketches, annotations, selectedSketchId, selectedAnnotationId) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0a1220';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(183,200,229,0.09)';
  for (let x = viewport.x % 48; x < canvas.width; x += 48) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = viewport.y % 48; y < canvas.height; y += 48) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }

  sketches.forEach((stroke) => {
    if (!Array.isArray(stroke.path) || stroke.path.length < 2) return;
    ctx.strokeStyle = stroke.id === selectedSketchId ? 'rgba(255, 209, 103, 0.95)' : 'rgba(132, 185, 255, 0.7)';
    ctx.lineWidth = stroke.id === selectedSketchId ? 3 : 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    stroke.path.forEach((p, idx) => {
      const x = p.x * viewport.zoom + viewport.x;
      const y = p.y * viewport.zoom + viewport.y;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });

  annotations.forEach((note) => {
    const x = note.position.x * viewport.zoom + viewport.x;
    const y = note.position.y * viewport.zoom + viewport.y;
    const w = 170 * viewport.zoom;
    const h = 90 * viewport.zoom;
    ctx.fillStyle = note.id === selectedAnnotationId ? 'rgba(255, 209, 103, 0.22)' : 'rgba(255, 241, 184, 0.14)';
    ctx.strokeStyle = note.id === selectedAnnotationId ? 'rgba(255, 209, 103, 0.9)' : 'rgba(255, 241, 184, 0.46)';
    ctx.lineWidth = 1.2;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  });

  graph.edges.forEach((e, idx) => {
    const s = graph.nodes.find((n) => n.id === e.source);
    const t = graph.nodes.find((n) => n.id === e.target);
    if (!s || !t) return;
    const x1 = s.position.x * viewport.zoom + viewport.x + 220 * viewport.zoom;
    const y1 = s.position.y * viewport.zoom + viewport.y + 54 * viewport.zoom;
    const x2 = t.position.x * viewport.zoom + viewport.x;
    const y2 = t.position.y * viewport.zoom + viewport.y + 54 * viewport.zoom;
    ctx.strokeStyle = simIndex === idx ? '#27d49a' : 'rgba(143,167,255,0.85)';
    ctx.lineWidth = simIndex === idx ? 3 : 1.6;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(x1 + 70, y1, x2 - 70, y2, x2, y2);
    ctx.stroke();
  });

  if (connecting?.source && pointerWorld) {
    const source = graph.nodes.find((n) => n.id === connecting.source);
    if (!source) return;
    const x1 = source.position.x * viewport.zoom + viewport.x + 210 * viewport.zoom;
    const y1 = source.position.y * viewport.zoom + viewport.y + 35 * viewport.zoom;
    const x2 = pointerWorld.x * viewport.zoom + viewport.x;
    const y2 = pointerWorld.y * viewport.zoom + viewport.y;
    ctx.strokeStyle = '#ffd167';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
}

ReactDOM.createRoot(document.getElementById('spatial-root')).render(React.createElement(SpatialNotebook));
