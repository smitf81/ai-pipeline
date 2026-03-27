import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function writeTempModule(source, label) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ace-ui-tests-'));
  const file = path.join(dir, `${label}.mjs`);
  await fs.writeFile(file, source, 'utf8');
  return file;
}

export async function materializeModuleCopy(modulePath, { label = path.basename(modulePath, path.extname(modulePath)), transform } = {}) {
  const source = await fs.readFile(modulePath, 'utf8');
  const tempFile = await writeTempModule(transform ? transform(source) : source, label);
  return {
    tempFile,
    url: pathToFileURL(tempFile).href,
  };
}

export async function loadModuleCopy(modulePath, options = {}) {
  const materialized = await materializeModuleCopy(modulePath, options);
  return import(materialized.url);
}

function stripImportLines(source = '') {
  const lines = source.split(/\r?\n/);
  const output = [];
  let insideImport = false;
  for (const line of lines) {
    if (!insideImport && /^import\b/.test(line.trim())) {
      insideImport = !/;\s*$/.test(line);
      output.push(line.replace(/[^\n]/g, ' '));
      continue;
    }
    if (insideImport) {
      insideImport = !/;\s*$/.test(line);
      output.push(line.replace(/[^\n]/g, ' '));
      continue;
    }
    output.push(line);
  }
  return output.join('\n');
}

export async function smokeLoadSpatialApp(modulePath, { locationHref = 'http://localhost/' } = {}) {
  const spatialDir = path.dirname(modulePath);
  const graphEngineModule = await materializeModuleCopy(path.join(spatialDir, 'graphEngine.js'), { label: 'graphEngine' });
  const sceneStateModule = await materializeModuleCopy(path.join(spatialDir, 'sceneState.js'), { label: 'sceneState' });
  const studioDataModule = await materializeModuleCopy(path.join(spatialDir, 'studioData.js'), { label: 'studioData' });
  const source = await fs.readFile(modulePath, 'utf8');
  const withoutImports = stripImportLines(source);
  const shimmedSource = `
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
} from ${JSON.stringify(graphEngineModule.url)};
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
} from ${JSON.stringify(sceneStateModule.url)};
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
} from ${JSON.stringify(studioDataModule.url)};
class AceConnector { async parseIntent() { return { confidence: 0.75, tasks: ['stub task'], classification: { role: 'context', labels: [] }, criteria: [], summary: 'stub summary', extractedIntent: { id: 'intent_stub', sourceNodeId: 'node_stub', sourceText: 'stub source', summary: 'stub summary', explicitClaims: ['stub claim'], inferredClaims: [], candidateNodes: [{ id: 'candidate_stub', label: 'stub task', kind: 'task', basis: 'explicit', rationale: 'stub rationale', confidence: 0.75 }], candidateEdges: [], gaps: [], provenance: { backend: 'ollama', model: 'mistral:latest', runId: 'context_stub', usedFallback: false, inferenceMode: 'small-inference' }, audit: { confidence: 0.75, criteria: [], classification: { role: 'context', labels: [] }, matchedTerms: [] } } }; } async previewMutation() { return { summary: [] }; } async applyMutation() { return { ok: true }; } async runAgentWorker() { return { ok: true, report: { summary: 'stub executor run', decision: 'ready-apply' }, runtime: {} }; } async getProjects() { return { projects: [{ key: 'topdown-slice', name: 'topdown-slice', launchable: true, supportedOrigin: 'http://127.0.0.1:4173/' }] }; } async runProject() { return { ok: true, url: 'http://127.0.0.1:4173/', supportedOrigin: 'http://127.0.0.1:4173/', reused: true }; } }
class MutationEngine {
  constructor() {}
  buildMutationRequestFromIntent() { return []; }
  applyMutations() { return undefined; }
  removeLinkedDraftsForSource() { return []; }
  syncDraftNodesFromReport() {
    return {
      generationId: 'stub-generation',
      createdAt: new Date().toISOString(),
      generatedNodes: [],
      replacedNodeIds: [],
      usedFallback: false,
      reason: 'stub',
    };
  }
}
class ArchitectureMemory { constructor() { this.model = { subsystems: [], modules: [], world: { systems: [], mechanics: [], quests: [], items: [], constraints: [] }, adapters: [], proposals: [], rules: [], layers: [], versions: [] }; } syncFromGraph() { return undefined; } }
const loadWorkspace = async () => ({ graph: { nodes: [], edges: [] }, graphs: { system: { nodes: [], edges: [] }, world: { nodes: [], edges: [] } }, sketches: [], annotations: [], agentComments: {}, intentState: { latest: null, contextReport: null, byNode: {}, reports: [] }, studio: {} });
const saveWorkspace = async () => ({ ok: true });
const savePages = async () => ({ ok: true });
const saveIntentState = async () => ({ ok: true });
const saveStudioState = async () => ({ ok: true });
const saveArchitectureMemory = async () => ({ ok: true });
const React = {
  createElement: (...args) => ({ args }),
  Fragment: Symbol.for('react.fragment'),
  useEffect: () => undefined,
  useMemo: (factory) => factory(),
  useRef: (value) => ({ current: value }),
  useState: (value) => [typeof value === 'function' ? value() : value, () => undefined],
  useCallback: (callback) => callback,
};
const ReactDOM = {
  createRoot: () => ({ render: () => undefined }),
};
const fetch = async () => ({ ok: true, json: async () => ({}) });
const requestAnimationFrame = () => 0;
const cancelAnimationFrame = () => undefined;
const window = {
  location: { href: ${JSON.stringify(locationHref)}, search: new URL(${JSON.stringify(locationHref)}).search },
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  devicePixelRatio: 1,
  innerWidth: 1600,
  innerHeight: 1100,
  prompt: () => null,
};
const document = {
  activeElement: null,
  body: { classList: { add: () => undefined, remove: () => undefined } },
  getElementById: () => ({}),
};
${withoutImports}

const firstRender = SpatialNotebook();
export default { loaded: typeof SpatialNotebook === 'function', firstRender };
export { renderDeskSection, renderSimLaunchOverlay };
`;
  const tempFile = await writeTempModule(shimmedSource, 'spatialApp-smoke');
  if (process.env.ACE_DEBUG_SMOKE === '1') {
    await fs.writeFile(path.join(os.tmpdir(), 'spatialApp-smoke-debug.mjs'), shimmedSource, 'utf8');
  }
  return import(pathToFileURL(tempFile).href);
}
