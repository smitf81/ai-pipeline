import { createEventBus } from './core/eventBus.js';
import {
  cancelStructurePlacement,
  createEditorState,
  importGameState,
  paintAtTile,
  placeSelectedStructure,
  replaceMap,
  selectStructurePlacement,
  summarizeEditor,
  refreshDerivedState
} from './editor/editorState.js';
import { getBuildOption } from './game/buildCatalog.js';
import { spendSupplies } from './game/economy.js';
import { advanceGameTick, serializeGameState, spawnInfantrySquad } from './game/gameModel.js';
import { createCanvasRenderer } from './rendering/canvasRenderer.js';
import { attachPointerController } from './input/pointerController.js';
import {
  mountBrushControls,
  mountCommandGraph,
  mountFieldControls,
  mountGameControls,
  mountInspector,
  mountMapControls,
  mountModeControls,
  mountTerrainPalette
} from './ui/components.js';
import { mountGameUI } from './ui/gameUI.js';
import { deserializeMap } from './world/mapModel.js';

const MAP_STORAGE_KEY = 'field-fronts-map-autosave-v1';
const GAME_STORAGE_KEY = 'field-fronts-game-state-v1';
const LEGACY_STORAGE_KEY = 'field-fronts-core-loop-state-v1';
const PROJECT_MAP_PATH = './data/maps/field-fronts-map.json';
const canvas = document.querySelector('#map-canvas');
const renderer = createCanvasRenderer(canvas);
const bus = createEventBus();
const state = createEditorState(loadInitialMap());
state.renderer = renderer;
const DEFAULT_TICK_INTERVAL_MS = 750;
const DEFAULT_GAME_AUTOSAVE_INTERVAL_MS = 60000;
const MAX_FRAME_DELTA_MS = 100;
const MAX_TICKS_PER_FRAME = 1;
const MOVEMENT_INTERPOLATION_PORTION = 0.98;
const MIN_MOVEMENT_INTERPOLATION_MS = 180;
const FPS_PUBLISH_INTERVAL_MS = 500;
let tickAccumulatorMs = 0;
let lastFrameTime = performance.now();
let runtimeFrameSample = {
  startedAt: lastFrameTime,
  frames: 0,
  frameMsTotal: 0
};
let gameAutosavePending = false;
let lastGameAutosaveAt = performance.now();
state.runtimeStats = {
  fps: 0,
  frameMs: 0,
  publishedAt: lastFrameTime
};

// Game UI layers (main menu, pause, HUD) layered over the canvas
mountGameUI(document.querySelector('.canvas-stage'), state, bus);

mountModeControls(document.querySelector('#mode-controls'), state, bus);
mountGameControls(document.querySelector('#game-controls'), state, bus);
mountCommandGraph(document.querySelector('#command-graph'), state, bus);
mountTerrainPalette(document.querySelector('#terrain-palette'), state, bus);
mountBrushControls(document.querySelector('#brush-controls'), state, bus);
mountFieldControls(document.querySelector('#field-controls'), state, bus);
mountMapControls(document.querySelector('#map-controls'), state, bus);
mountInspector(document.querySelector('#tile-inspector'), state, bus);
attachPointerController(canvas, renderer, state, bus);

bus.on('paint', (payload) => {
  if (state.uiScreen !== 'game' || state.paused) return;
  const tile = payload?.tile ?? payload;
  paintAtTile(state, tile, { lower: Boolean(payload?.lower), isDragging: Boolean(payload?.isDragging) });
  bus.emit('render');
});

bus.on('paint:end', () => {
  if (state.dirtyRegion) {
    refreshDerivedState(state);
    state.dirtyRegion = null;
    persistMapState();
    persistGameState({ immediate: true });
    bus.emit('render');
  }
});

bus.on('build:select', (id) => {
  state.selectedBuild = id;
  state.selectedUnit = null;
});

bus.on('unit:select', (id) => {
  state.selectedUnit = id;
  state.selectedBuild = null;
});

bus.on('purchase:request', ({ type, id }) => {
  const option = getBuildOption(type, id);
  if (!option) {
    state.status = 'Unknown build order';
    bus.emit('purchase:failed', { type, id, reason: 'unknown-option' });
    bus.emit('render');
    return;
  }

  if (option.type === 'building') {
    selectStructurePlacement(state, option.id);
    state.uiSelection = { type: option.type, id: option.id, label: option.label, cost: option.cost };
    bus.emit('placement:selected', option);
    bus.emit('render');
    return;
  }

  const purchase = spendSupplies(state.game.economy, 'player', option.cost);
  if (!purchase.ok) {
    state.status = `Need ${option.cost} Supplies for ${option.label}`;
    bus.emit('purchase:failed', { ...option, reason: purchase.reason });
    bus.emit('render');
    return;
  }

  state.game.economy = purchase.economy;
  if (option.type === 'unit' && option.id === 'infantry') {
    const deployment = spawnInfantrySquad(state.game, state.map, { factionId: 'player' });
    if (!deployment.ok) {
      state.status = `Infantry paid for, but deployment failed: ${deployment.reason}`;
      bus.emit('purchase:failed', { ...option, reason: deployment.reason });
      bus.emit('render');
      return;
    }
  }
  state.selectedBuild = null;
  state.selectedUnit = option.type === 'unit' ? option.id : null;
  state.uiSelection = { type: option.type, id: option.id, label: option.label, cost: option.cost };
  state.gameDirty = true;
  state.status = `${option.label} ordered: -${option.cost} Supplies`;
  bus.emit('purchase:completed', option);
  bus.emit('render');
});

bus.on('placement:place', ({ tile }) => {
  const result = placeSelectedStructure(state, tile);
  if (!result.ok) {
    bus.emit('purchase:failed', {
      type: 'building',
      id: state.placement?.selectedStructureType,
      reason: result.reason
    });
    bus.emit('render');
    return;
  }
  bus.emit('purchase:completed', { type: 'building', id: result.structure.type, label: result.structure.name, cost: result.cost });
  bus.emit('render');
});

bus.on('placement:cancel', () => {
  if (!state.placement?.active) {
    return;
  }
  cancelStructurePlacement(state);
  bus.emit('placement:cancelled');
  bus.emit('render');
});

bus.on('econ:change', ({ id, value }) => {
  state.economy = { ...(state.economy ?? {}), [id]: value };
});

bus.on('settings:game-autosave-interval', (value) => {
  state.gameAutosaveIntervalMs = value;
  state.status = `Game autosave every ${Math.round(getGameAutosaveIntervalMs() / 1000)}s`;
  bus.emit('render');
});

bus.on('game:step-tick', () => {
  tickAccumulatorMs = 0;
  stepGameTick({ source: 'manual', forceRender: true });
});

bus.on('render', () => {
  renderer.render(state);
  if (state.dirty) {
    persistMapState();
    state.dirty = false;
  }
  if (state.gameDirty) {
    requestGameAutosave();
    state.gameDirty = false;
  }
});

window.addEventListener('resize', () => bus.emit('render'));

function isTextEntryTarget(target) {
  const tagName = target?.tagName?.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target?.isContentEditable;
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.placement?.active) {
    event.preventDefault();
    bus.emit('placement:cancel');
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    import('./editor/editorState.js').then(({ undo }) => {
      undo(state);
      persistMapState();
      persistGameState({ immediate: true });
      bus.emit('render');
    });
  }
  if (event.key === ' ') {
    if (isTextEntryTarget(event.target) || state.uiScreen !== 'game' || state.paused) {
      return;
    }
    event.preventDefault();
    tickAccumulatorMs = 0;
    stepGameTick({ source: 'manual' });
  }
});

window.render_game_to_text = () => {
  const summary = summarizeEditor(state);
  summary.runtime.renderer = renderer.getStats?.() ?? null;
  summary.runtime.frame = state.runtimeStats ?? null;
  return JSON.stringify({
    coordinateSystem: 'origin top-left; x increases right; y increases down; one cell is one terrain tile',
    ...summary
  });
};

window.advanceTime = (ms = getTickIntervalMs()) => {
  if (state.uiScreen !== 'game' || state.paused) {
    return window.render_game_to_text();
  }
  accumulateGameTime(Number.isFinite(ms) ? ms : getTickIntervalMs(), { source: 'test' });
  return window.render_game_to_text();
};

function isGameRunning() {
  return state.uiScreen === 'game' && state.mode === 'play' && !state.paused;
}

function getTickIntervalMs() {
  return Math.max(120, Number(state.simTickIntervalMs) || DEFAULT_TICK_INTERVAL_MS);
}

function stepGameTick({ source = 'auto', forceRender = false } = {}) {
  const visualStartPositions = captureVisibleLeaderPositions();
  advanceGameTick(state.game, state.map);
  startLeaderMotionInterpolation(visualStartPositions);
  state.mode = 'play';
  state.gameDirty = true;
  state.status = source === 'manual'
    ? `Manual tick ${state.game.tick}: command fields recalculated`
    : `Battle running: tick ${state.game.tick}`;
  if (forceRender) {
    bus.emit('render');
  }
}

function accumulateGameTime(deltaMs, { source = 'auto' } = {}) {
  if (!isGameRunning()) {
    tickAccumulatorMs = 0;
    return 0;
  }

  tickAccumulatorMs += Math.max(0, deltaMs);
  const interval = getTickIntervalMs();
  let ticks = 0;
  while (tickAccumulatorMs >= interval && ticks < MAX_TICKS_PER_FRAME) {
    tickAccumulatorMs -= interval;
    stepGameTick({ source });
    ticks += 1;
  }
  if (ticks >= MAX_TICKS_PER_FRAME) {
    tickAccumulatorMs = Math.min(tickAccumulatorMs, interval);
  }
  return ticks;
}

function animationLoop(now) {
  const deltaMs = Math.min(MAX_FRAME_DELTA_MS, Math.max(0, now - lastFrameTime));
  lastFrameTime = now;
  updateRuntimeFrameStats(deltaMs, now);
  accumulateGameTime(deltaMs);
  updateLeaderMotionInterpolation(deltaMs);
  if (isGameRunning() || state.renderMotion?.active) {
    renderer.render(state);
  }
  flushScheduledGameAutosave(now);
  requestAnimationFrame(animationLoop);
}

function updateRuntimeFrameStats(deltaMs, now) {
  runtimeFrameSample.frames += 1;
  runtimeFrameSample.frameMsTotal += deltaMs;
  const elapsedMs = now - runtimeFrameSample.startedAt;
  if (elapsedMs < FPS_PUBLISH_INTERVAL_MS) {
    return;
  }
  const fps = runtimeFrameSample.frames > 0 ? (runtimeFrameSample.frames * 1000) / Math.max(1, elapsedMs) : 0;
  const frameMs = runtimeFrameSample.frames > 0 ? runtimeFrameSample.frameMsTotal / runtimeFrameSample.frames : 0;
  state.runtimeStats = {
    fps: Math.round(fps),
    frameMs: Math.round(frameMs * 10) / 10,
    publishedAt: now
  };
  runtimeFrameSample = {
    startedAt: now,
    frames: 0,
    frameMsTotal: 0
  };
  bus.emit('runtime:stats', state.runtimeStats);
}

function captureVisibleLeaderPositions() {
  const visualPositions = state.renderMotion?.leaderPositions ?? {};
  return Object.fromEntries(getMovableEntities().map((entity) => [
    entity.id,
    clonePosition(visualPositions[entity.id] ?? entity.position ?? entity.tile)
  ]));
}

function startLeaderMotionInterpolation(startPositions) {
  const durationMs = Math.max(MIN_MOVEMENT_INTERPOLATION_MS, getTickIntervalMs() * MOVEMENT_INTERPOLATION_PORTION);
  const leaderMotions = Object.fromEntries(getMovableEntities().map((entity) => {
    const to = clonePosition(entity.position ?? entity.tile);
    const from = clonePosition(startPositions[entity.id] ?? to);
    return [entity.id, { from, to }];
  }));
  const active = Object.values(leaderMotions).some((motion) => positionDistance(motion.from, motion.to) > 0.001);
  state.renderMotion = {
    active,
    elapsedMs: 0,
    durationMs,
    leaderMotions,
    leaderPositions: active ? interpolateLeaderPositions(leaderMotions, 0) : interpolateLeaderPositions(leaderMotions, 1),
    progress: active ? 0 : 1
  };
}

function getMovableEntities() {
  return [...(state.game?.leaders ?? []), ...(state.game?.squads ?? []), ...(state.game?.builders ?? [])];
}

function updateLeaderMotionInterpolation(deltaMs) {
  if (!state.renderMotion?.active) {
    return;
  }
  state.renderMotion.elapsedMs += Math.max(0, deltaMs);
  const progress = Math.min(1, state.renderMotion.elapsedMs / Math.max(1, state.renderMotion.durationMs));
  state.renderMotion.leaderPositions = interpolateLeaderPositions(state.renderMotion.leaderMotions, progress);
  state.renderMotion.progress = progress;
  if (progress >= 1) {
    state.renderMotion.active = false;
    state.renderMotion.leaderPositions = interpolateLeaderPositions(state.renderMotion.leaderMotions, 1);
    state.renderMotion.progress = 1;
  }
}

function interpolateLeaderPositions(leaderMotions, progress) {
  return Object.fromEntries(Object.entries(leaderMotions).map(([id, motion]) => [
    id,
    {
      x: lerp(motion.from.x, motion.to.x, progress),
      y: lerp(motion.from.y, motion.to.y, progress)
    }
  ]));
}

function clonePosition(position) {
  return {
    x: Number(position?.x) || 0,
    y: Number(position?.y) || 0
  };
}

function positionDistance(a, b) {
  return Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0));
}

function lerp(start, end, t) {
  return start + (end - start) * t;
}

function persistMapState() {
  try {
    localStorage.setItem(MAP_STORAGE_KEY, JSON.stringify({
      contract: 'field-fronts.map-autosave.v1',
      savedAt: new Date().toISOString(),
      map: state.map
    }));
  } catch {
    state.status = 'Map autosave unavailable';
  }
}

function getGameAutosaveIntervalMs() {
  return Math.max(15000, Number(state.gameAutosaveIntervalMs) || DEFAULT_GAME_AUTOSAVE_INTERVAL_MS);
}

function requestGameAutosave() {
  gameAutosavePending = true;
}

function flushScheduledGameAutosave(now = performance.now()) {
  if (!gameAutosavePending) {
    return;
  }
  if (now - lastGameAutosaveAt < getGameAutosaveIntervalMs()) {
    return;
  }
  persistGameState();
}

function persistGameState({ immediate = false } = {}) {
  try {
    localStorage.setItem(GAME_STORAGE_KEY, serializeGameState(state.game, state.map, { recompute: false }));
    gameAutosavePending = false;
    lastGameAutosaveAt = performance.now();
    if (immediate) {
      state.gameDirty = false;
    }
  } catch {
    state.status = 'Game autosave unavailable';
  }
}

function loadInitialMap() {
  try {
    const saved = JSON.parse(localStorage.getItem(MAP_STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY) ?? 'null');
    return saved?.map ? deserializeMap(saved.map) : undefined;
  } catch {
    return undefined;
  }
}

function loadSavedGameState({ skip = false } = {}) {
  if (skip) {
    return false;
  }
  try {
    const savedGame = localStorage.getItem(GAME_STORAGE_KEY);
    if (!savedGame) {
      return false;
    }
    importGameState(state, savedGame);
    state.gameDirty = false;
    state.status = `Loaded saved game state: tick ${state.game.tick}`;
    return true;
  } catch (error) {
    state.status = `Saved game state ignored: ${error.message}`;
    state.gameDirty = true;
    return false;
  }
}

async function loadProjectMap() {
  const savedMap = localStorage.getItem(MAP_STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
  const forceSeed = new URLSearchParams(window.location.search).has('seed');
  if (savedMap && !forceSeed) {
    const loadedGame = loadSavedGameState();
    if (!loadedGame) {
      state.status = 'Loaded autosaved map. Add ?seed=1 to reload the exported field-fronts-map.json.';
    }
    bus.emit('render');
    return;
  }

  try {
    const response = await fetch(PROJECT_MAP_PATH, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const projectMap = deserializeMap(await response.json());
    replaceMap(state, projectMap, { status: 'Loaded data/maps/field-fronts-map.json with neutral Signal Knoll contest node' });
    if (!forceSeed) {
      loadSavedGameState();
    }
    bus.emit('render');
  } catch (error) {
    state.status = `Project map unavailable; using generated fallback (${error.message})`;
    loadSavedGameState();
    bus.emit('render');
  }
}

bus.emit('render');
loadProjectMap();
requestAnimationFrame(animationLoop);
