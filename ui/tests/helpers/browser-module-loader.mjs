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

export async function loadModuleCopy(modulePath, { label = path.basename(modulePath, '.js'), transform } = {}) {
  const source = await fs.readFile(modulePath, 'utf8');
  const tempFile = await writeTempModule(transform ? transform(source) : source, label);
  return import(pathToFileURL(tempFile).href);
}

export async function smokeLoadSpatialApp(modulePath) {
  const spatialDir = path.dirname(modulePath);
  const graphEngineFile = await writeTempModule(await fs.readFile(path.join(spatialDir, 'graphEngine.js'), 'utf8'), 'graphEngine');
  const sceneStateFile = await writeTempModule(await fs.readFile(path.join(spatialDir, 'sceneState.js'), 'utf8'), 'sceneState');
  const studioDataFile = await writeTempModule(await fs.readFile(path.join(spatialDir, 'studioData.js'), 'utf8'), 'studioData');
  const source = await fs.readFile(modulePath, 'utf8');
  const withoutImports = source.replace(/^import[\s\S]*?;\r?\n/gm, '');
  const shimmedSource = `
import {
  GraphEngine,
  createNode,
  createEdge,
  buildStarterGraph,
  GRAPH_LAYERS,
  getNodeTypesForLayer,
  normalizeGraphBundle,
  buildRsgState,
} from ${JSON.stringify(pathToFileURL(graphEngineFile).href)};
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
} from ${JSON.stringify(pathToFileURL(sceneStateFile).href)};
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
} from ${JSON.stringify(pathToFileURL(studioDataFile).href)};
class AceConnector { async parseIntent() { return { confidence: 0.75, tasks: ['stub task'], classification: { role: 'context', labels: [] }, criteria: [], summary: 'stub summary' }; } async previewMutation() { return { summary: [] }; } async applyMutation() { return { ok: true }; } }
class MutationEngine { constructor() {} buildMutationRequestFromIntent() { return []; } applyMutations() { return undefined; } }
class ArchitectureMemory { constructor() { this.model = { subsystems: [], modules: [], world: { systems: [], mechanics: [], quests: [], items: [], constraints: [] }, adapters: [], proposals: [], rules: [], layers: [], versions: [] }; } syncFromGraph() { return undefined; } }
const loadWorkspace = async () => ({ graph: { nodes: [], edges: [] }, graphs: { system: { nodes: [], edges: [] }, world: { nodes: [], edges: [] } }, sketches: [], annotations: [], agentComments: {}, intentState: { latest: null, contextReport: null, byNode: {}, reports: [] }, studio: {} });
const saveWorkspace = async () => ({ ok: true });
const React = {
  createElement: (...args) => ({ args }),
  useEffect: () => undefined,
  useMemo: (factory) => factory(),
  useRef: (value) => ({ current: value }),
  useState: (value) => [typeof value === 'function' ? value() : value, () => undefined],
};
const ReactDOM = {
  createRoot: () => ({ render: () => undefined }),
};
const fetch = async () => ({ ok: true, json: async () => ({}) });
const requestAnimationFrame = () => 0;
const cancelAnimationFrame = () => undefined;
const window = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  devicePixelRatio: 1,
};
const document = {
  activeElement: null,
  body: { classList: { add: () => undefined, remove: () => undefined } },
  getElementById: () => ({}),
};
${withoutImports}

const firstRender = SpatialNotebook();
export default { loaded: typeof SpatialNotebook === 'function', firstRender };
`;
  const tempFile = await writeTempModule(shimmedSource, 'spatialApp-smoke');
  return import(pathToFileURL(tempFile).href);
}
