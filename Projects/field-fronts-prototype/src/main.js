import { EXPERIENCE_MODES, isSimDebugMode, shouldShowDeveloperPanel } from './core/appModes.js';
import { createEventBus } from './core/eventBus.js';
import {
  cancelStructurePlacement,
  createEditorState,
  importGameState,
  paintAtTile,
  placeSelectedStructure,
  placeSelectedStructurePath,
  replaceMap,
  activateScenario,
  selectStructurePlacement,
  summarizeEditor,
  refreshDerivedState
} from './editor/editorState.js';
import { getBuildOption } from './game/buildCatalog.js';
import { getBuildOptionLockReason, isBuildOptionUnlocked } from './game/progressionSystem.js';
import { RESOURCE_IDS, describeResourceCost, spendCost } from './game/economy.js';
import { createCommandFeedback, createCommandWheelIntentArgs, getCommandWheelAction } from './game/commandWheel.js';
import { collectCommandTargetCandidates, executeCommandIntent, validateCommandIntent } from './game/commandWheelAdapter.js';
import { createPlaytestSettings, cycleWeatherQuality } from './game/playtestStabilization.js';
import { advanceGameTick, evacuateStructureOccupants, issueAIBehaviourIntent, issuePlayerMoveCommand, resetGameForMap, serializeGameState, spawnBuilderCrew, spawnInfantrySquad, spawnWarriorSquad, setPlayerEntityPressureStance, setPlayerPressureStance, validateBuilderCrewTraining } from './game/gameModel.js';
import { createCanvasRenderer } from './rendering/canvasRenderer.js';
import { attachPointerController } from './input/pointerController.js';
import { createMousePlaytester, isMouseModeEnabled } from './playtest/mousePlaytester.js';
import {
  mountBrushControls,
  mountCommandGraph,
  mountFieldControls,
  mountGameControls,
  mountInspector,
  mountMapControls,
  mountModeControls,
  mountScenarioControls,
  mountTerrainPalette
} from './ui/components.js';
import { mountGameUI } from './ui/gameUI.js';
import { deserializeMap } from './world/mapModel.js';
import { createFirstNightMap, createRandomMapSeed, createSeededMap } from './world/mapGenerator.js';
import { advanceScenarioSpineRuntime, applyScenarioRuntimeProgress } from './world/scenarioSpine.js';
import { isNomadicSurvivalScene } from './world/sceneEntity.js';

const MAP_STORAGE_KEY = 'field-fronts-map-autosave-v1';
const GAME_STORAGE_KEY = 'field-fronts-game-state-v1';
const LEGACY_STORAGE_KEY = 'field-fronts-core-loop-state-v1';
const PROJECT_MAP_PATH = './data/maps/field-fronts-map.json';
const appShell = document.querySelector('[data-app]');
const canvas = document.querySelector('#map-canvas');
const toolPanel = document.querySelector('[data-dev-panel]');
const renderer = createCanvasRenderer(canvas);
const bus = createEventBus();
const state = createEditorState(loadInitialMap() ?? createFirstNightMap());
state.renderer = renderer;
const mouseModeEnabled = isMouseModeEnabled();
const mousePlaytester = createMousePlaytester({ state, bus, enabled: mouseModeEnabled });
const DEFAULT_TICK_INTERVAL_MS = 750;
const DEFAULT_GAME_AUTOSAVE_INTERVAL_MS = 60000;
const MAX_FRAME_DELTA_MS = 100;
const MAX_TICKS_PER_FRAME = 1;
const MOVEMENT_INTERPOLATION_PORTION = 0.98;
const MIN_MOVEMENT_INTERPOLATION_MS = 180;
const FPS_PUBLISH_INTERVAL_MS = 500;
const FRAME_BUDGET_HISTORY_LIMIT = 240;
const LONG_FRAME_MS = 33.4;
const BAD_FRAME_MS = 50;
let tickAccumulatorMs = 0;
let lastFrameTime = performance.now();
let runtimeFrameSample = {
  startedAt: lastFrameTime,
  frames: 0,
  frameMsTotal: 0
};
let runtimeFrameBudgetStats = createRuntimeFrameBudgetStats(lastFrameTime);
let gameAutosavePending = false;
let lastGameAutosaveAt = performance.now();
state.runtimeStats = {
  fps: 0,
  frameMs: 0,
  frameBudget: getRuntimeFrameBudgetSnapshot(),
  publishedAt: lastFrameTime,
  interpolationAlpha: 1,
  tickAccumulatorMs: 0,
  tickIntervalMs: DEFAULT_TICK_INTERVAL_MS
};
state.renderClock = {
  alpha: 1,
  accumulatorMs: 0,
  tickIntervalMs: DEFAULT_TICK_INTERVAL_MS,
  updatedAt: lastFrameTime
};

// Game UI layers (main menu, pause, HUD) layered over the canvas
mountGameUI(document.querySelector('.canvas-stage'), state, bus);

mountToolPanelVisibility();
mountModeControls(document.querySelector('#mode-controls'), state, bus);
mountGameControls(document.querySelector('#game-controls'), state, bus);
mountCommandGraph(document.querySelector('#command-graph'), state, bus);
mountTerrainPalette(document.querySelector('#terrain-palette'), state, bus);
mountBrushControls(document.querySelector('#brush-controls'), state, bus);
mountFieldControls(document.querySelector('#field-controls'), state, bus);
mountMapControls(document.querySelector('#map-controls'), state, bus);
mountScenarioControls(document.querySelector('#scenario-controls'), state, bus);
mountInspector(document.querySelector('#tile-inspector'), state, bus);
attachPointerController(canvas, renderer, state, bus);


function mountToolPanelVisibility() {
  function render() {
    const mode = state.experienceMode ?? EXPERIENCE_MODES.MENU;
    const visible = shouldShowDeveloperPanel(state);
    if (appShell) {
      appShell.dataset.uiScreen = state.uiScreen ?? 'menu';
      appShell.dataset.experienceMode = mode;
      appShell.dataset.toolPanel = visible ? 'visible' : 'hidden';
    }
    if (toolPanel) {
      toolPanel.hidden = !visible;
      toolPanel.setAttribute('aria-hidden', String(!visible));
      const title = toolPanel.querySelector('[data-tool-title]');
      const eyebrow = toolPanel.querySelector('[data-tool-eyebrow]');
      if (eyebrow) {
        eyebrow.textContent = mode === EXPERIENCE_MODES.MAP_MAKER ? 'Map Maker' : 'Sim / Debug';
      }
      if (title) {
        title.textContent = mode === EXPERIENCE_MODES.MAP_MAKER ? 'Authoring Tools' : 'Simulation Tools';
      }
    }
  }
  bus.on('ui:screen', render);
  bus.on('render', render);
  render();
}

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

  if (!isBuildOptionUnlocked(state.game?.progression, option)) {
    const lock = getBuildOptionLockReason(state.game?.progression, option);
    state.status = lock?.message ?? `${option.label} is locked.`;
    bus.emit('purchase:failed', { ...option, reason: lock?.reason ?? 'progression-locked' });
    bus.emit('render');
    return;
  }

  if (option.type === 'building') {
    selectStructurePlacement(state, option.id);
    state.uiSelection = { type: option.type, id: option.id, label: option.label, cost: option.cost, resourceCost: option.resourceCost, costLabel: option.costLabel };
    bus.emit('placement:selected', option);
    bus.emit('render');
    return;
  }

  if (option.type === 'unit' && option.id === 'builder') {
    const validation = validateBuilderCrewTraining(state.game, state.map, { factionId: 'player' });
    if (!validation.ok) {
      const cap = validation.capacity;
      state.status = validation.reason === 'builder-capacity-reached'
        ? `Builder cap reached: ${cap.used}/${cap.capacity}. Build a Builder Lodge.`
        : 'Need a completed Outpost or Builder Lodge to train builders.';
      bus.emit('purchase:failed', { ...option, reason: validation.reason });
      bus.emit('render');
      return;
    }
  }

  const resourceCost = option.resourceCost ?? { [RESOURCE_IDS.gold]: option.cost ?? 0 };
  const purchase = spendCost(state.game.economy, 'player', resourceCost);
  if (!purchase.ok) {
    const missing = purchase.missing?.map((entry) => `${entry.missing} ${entry.resourceId}`).join(', ');
    state.status = `Need ${missing || describeResourceCost(resourceCost)} for ${option.label}`;
    bus.emit('purchase:failed', { ...option, reason: purchase.reason, missing: purchase.missing });
    bus.emit('render');
    return;
  }

  state.game.economy = purchase.economy;
  if (option.type === 'unit' && option.id === 'builder') {
    const deployment = spawnBuilderCrew(state.game, state.map, { factionId: 'player' });
    if (!deployment.ok) {
      state.status = `Builder paid for, but training failed: ${deployment.reason}`;
      bus.emit('purchase:failed', { ...option, reason: deployment.reason });
      bus.emit('render');
      return;
    }
  } else if (option.type === 'unit' && option.id === 'warrior') {
    const deployment = spawnWarriorSquad(state.game, state.map, { factionId: 'player' });
    if (!deployment.ok) {
      state.status = `Warrior paid for, but deployment failed: ${deployment.reason}`;
      bus.emit('purchase:failed', { ...option, reason: deployment.reason });
      bus.emit('render');
      return;
    }
  } else if (option.type === 'unit' && option.id === 'infantry') {
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
  state.uiSelection = { type: option.type, id: option.id, label: option.label, cost: option.cost, resourceCost: option.resourceCost, costLabel: option.costLabel };
  state.gameDirty = true;
  state.status = `${option.label} ordered: -${describeResourceCost(resourceCost)}`;
  bus.emit('purchase:completed', option);
  bus.emit('render');
});

bus.on('orders:army-stance', ({ stanceId }) => {
  setPlayerPressureStance(state.game, state.map, stanceId);
  state.gameDirty = true;
  state.status = `Army order: ${stanceId}`;
  bus.emit('render');
});

bus.on('orders:selected-stance', ({ entityId, stanceId }) => {
  const result = setPlayerEntityPressureStance(state.game, state.map, entityId, stanceId);
  state.gameDirty = result.ok;
  state.status = result.ok
    ? `Selection override: ${stanceId}`
    : 'Select a friendly unit before issuing an override.';
  bus.emit('render');
});

bus.on('mouse:action-decision', ({ decision } = {}) => {
  const validation = validateCommandIntent(decision, state);
  if (!validation.ok) {
    void mousePlaytester.reportActionOutcome({
      actionId: decision?.actionId ?? null,
      commandId: decision?.commandId ?? null,
      targetId: decision?.targetId ?? null,
      validationStatus: validation.reason,
      executionStatus: 'not_executed',
      outcomeSummary: validation.message,
      objectiveBefore: getCurrentScenarioObjectiveLabel(),
      objectiveAfter: getCurrentScenarioObjectiveLabel(),
      commanderState: getCommanderState(),
      fps: state.runtimeStats?.fps ?? null
    });
    return;
  }
  if (validation.observeOnly) {
    void mousePlaytester.reportActionOutcome({
      actionId: decision?.actionId ?? null,
      commandId: 'observe',
      targetId: null,
      validationStatus: 'accepted',
      executionStatus: 'observed',
      outcomeSummary: 'Mouse waited and watched the commander-local situation.',
      objectiveBefore: getCurrentScenarioObjectiveLabel(),
      objectiveAfter: getCurrentScenarioObjectiveLabel(),
      commanderState: getCommanderState(),
      fps: state.runtimeStats?.fps ?? null
    });
    return;
  }
  executeCommandIntent(validation, bus);
});

bus.on('orders:survival-intent', ({
  actionId,
  intentType,
  priority,
  tile,
  source = 'command-wheel',
  scope,
  sourceEntityId,
  mouseActionId = null,
  mouseTargetId = null,
  mouseTargetLabel = null,
  audienceId = null,
  commandTarget = null
}) => {
  const action = getCommandWheelAction(actionId ?? intentType);
  const objectiveBefore = getCurrentScenarioObjectiveLabel();
  const args = createCommandWheelIntentArgs(action?.id ?? intentType, tile, {
    priority,
    scope,
    sourceEntityId,
    metadata: {
      inputSource: source,
      mouseActionId,
      mouseTargetId,
      mouseTargetLabel,
      commandTarget
    }
  });
  const result = issueAIBehaviourIntent(state.game, state.map, args);
  state.game = result.game;
  state.gameDirty = result.ok;
  const response = result.responses?.[0];
  const label = action?.label ?? args.type;
  state.commandFeedback = createCommandFeedback({ action, result, tile, source });
  state.status = !result.ok
    ? result.message ?? `${label}: command unavailable.`
    : response
    ? `${label}: ${response.status.replaceAll('_', ' ')} — ${response.reason}`
    : `${label}: no unit received the intent.`;
  bus.emit('render');
  if (mouseActionId) {
    void mousePlaytester.reportActionOutcome({
      actionId: mouseActionId,
      commandId: action?.id ?? args.actionId,
      targetId: mouseTargetId,
      targetPosition: tile ?? null,
      targetLabel: mouseTargetLabel,
      audienceId,
      validationStatus: result.ok ? 'accepted' : (result.reason ?? 'rejected'),
      executionStatus: result.ok ? 'executed' : 'not_executed',
      commandResponseStatus: state.commandFeedback.status,
      outcomeSummary: state.commandFeedback.reason,
      objectiveBefore,
      objectiveAfter: getCurrentScenarioObjectiveLabel(),
      commanderState: getCommanderState(),
      unitsResponded: result.responses?.length ?? 0,
      targetHonoured: summariseTargetHonoured(result.responses),
      shelterRating: getFirstResponseValue(result.responses, 'shelterRating') ?? commandTarget?.shelterRating ?? null,
      degradationReason: getFirstResponseValue(result.responses, 'degradationReason'),
      fps: state.runtimeStats?.fps ?? null
    });
  }
});


function summariseTargetHonoured(responses = []) {
  if (!Array.isArray(responses) || responses.length === 0) return null;
  if (responses.some((response) => response?.targetHonoured === false)) return false;
  if (responses.some((response) => response?.targetHonoured === true)) return true;
  return null;
}

function getFirstResponseValue(responses = [], key) {
  if (!Array.isArray(responses)) return null;
  for (const response of responses) {
    if (response && response[key] != null) return response[key];
  }
  return null;
}

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

bus.on('placement:place-path', ({ path }) => {
  const result = placeSelectedStructurePath(state, path);
  if (!result.ok) {
    bus.emit('purchase:failed', {
      type: 'building',
      id: state.placement?.selectedStructureType,
      reason: result.reason
    });
    bus.emit('render');
    return;
  }
  bus.emit('purchase:completed', {
    type: 'building',
    id: result.structures?.[0]?.type,
    label: `${result.structures?.length ?? 0} segment blueprint`,
    cost: result.cost
  });
  bus.emit('render');
});

bus.on('occupancy:evacuate-structure', ({ structureId, squadId = null } = {}) => {
  const result = evacuateStructureOccupants(state.game, state.map, structureId, { squadId });
  state.gameDirty = result.ok;
  state.status = result.ok
    ? `Evacuated ${result.evacuatedSquadIds.length} squad${result.evacuatedSquadIds.length === 1 ? '' : 's'} from ${result.structure?.name ?? 'structure'}`
    : result.message ?? 'Evacuation failed.';
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

bus.on('scenario:camera-shake', ({ cue } = {}) => {
  const durationMs = Math.max(80, Math.min(2400, Number(cue?.durationMs) || 500));
  const strengthPx = Math.max(0, Math.min(24, Number(cue?.strengthPx) || 6));
  state.scenarioCameraShake = {
    active: strengthPx > 0,
    startedAt: performance.now(),
    until: performance.now() + durationMs,
    durationMs,
    strengthPx,
    cueId: cue?.id ?? null,
    tile: cue?.tile ?? null
  };
  state.status = cue?.id ? `Previewing scenario cue: ${cue.id}` : 'Previewing scenario camera cue';
  bus.emit('render');
});


bus.on('playtest:start-chapter', ({ scenarioId = 'chapter_001' } = {}) => {
  launchPlaytestChapter({ scenarioId, resetGame: false, status: 'Playtest launched: The First Night' });
});

bus.on('playtest:restart-chapter', ({ scenarioId = 'chapter_001' } = {}) => {
  launchPlaytestChapter({ scenarioId, resetGame: true, status: 'Chapter restarted on current seed' });
});

bus.on('playtest:random-seed', () => {
  const currentPreset = state.map?.scenario?.generator?.preset ?? state.map?.provenance?.preset ?? 'frontier_2k';
  const seed = createRandomMapSeed('chapter1');
  const nextMap = state.map?.scenario?.scenarioLayer?.preset === 'first_night'
    ? createFirstNightMap({ seed })
    : createSeededMap({ seed, preset: currentPreset, scenarioPreset: state.map?.scenario?.scenarioLayer?.preset ?? 'black_sky_arrival' });
  replaceMap(state, nextMap, { status: `Generated Chapter 1 seed: ${seed}` });
  state.playtest = createPlaytestSettings({ ...(state.playtest ?? {}), lastResetSeed: seed, lastChapterId: 'chapter_001' });
  launchPlaytestChapter({ scenarioId: 'chapter_001', resetGame: false, status: `Playing Chapter 1 seed ${seed}` });
});

bus.on('playtest:cycle-weather-quality', () => {
  state.playtest = createPlaytestSettings({
    ...(state.playtest ?? {}),
    weatherQuality: cycleWeatherQuality(state.playtest?.weatherQuality)
  });
  state.status = `Weather visual quality: ${state.playtest.weatherQuality}`;
  bus.emit('render');
});

bus.on('playtest:toggle-map-clarity', () => {
  state.playtest = createPlaytestSettings({
    ...(state.playtest ?? {}),
    mapClarityMode: !state.playtest?.mapClarityMode
  });
  state.status = state.playtest.mapClarityMode ? 'Map clarity mode on: storm visuals reduced' : 'Map clarity mode off';
  bus.emit('render');
});

bus.on('playtest:toggle-ai-debug', () => {
  state.playtest = createPlaytestSettings({
    ...(state.playtest ?? {}),
    aiDebug: !state.playtest?.aiDebug
  });
  state.status = state.playtest.aiDebug ? 'AI debug chips enabled' : 'AI debug chips hidden';
  bus.emit('render');
});


function launchPlaytestChapter({ scenarioId = 'chapter_001', resetGame = false, status = 'Chapter ready' } = {}) {
  if (resetGame) {
    resetGameForMap(state);
  }
  const activation = activateScenario(state, scenarioId);
  state.experienceMode = EXPERIENCE_MODES.GAME;
  state.mode = 'play';
  state.uiScreen = 'game';
  state.paused = false;
  state.gameOverlay = 'none';
  state.showCommandRadii = false;
  state.activeField = 'none';
  state.showScenarioLayer = true;
  state.intentPreview = null;
  state.orderWheel = null;
  state.commandFeedback = null;
  state.playtest = createPlaytestSettings({
    ...(state.playtest ?? {}),
    lastChapterId: scenarioId,
    lastResetSeed: state.map?.scenario?.generator?.seed ?? state.map?.provenance?.seed ?? state.playtest?.lastResetSeed ?? null
  });
  resetRuntimeFrameBudgetStats();
  state.status = activation.ok ? status : 'Chapter launch failed: no playable scenario';
  bus.emit('ui:screen', 'game');
  bus.emit('render');
  return activation;
}

function getCurrentScenarioObjectiveLabel() {
  const objectives = state.map?.scenario?.scenarioSpine?.objectives ?? [];
  const complete = new Set(state.scenarioRuntime?.completedObjectiveIds ?? []);
  return objectives.find((objective) => !complete.has(objective.id))?.label ?? 'Scenario complete';
}

function getScenarioProgressSnapshot() {
  const objectives = state.map?.scenario?.scenarioSpine?.objectives ?? [];
  const completedObjectiveIds = [...(state.scenarioRuntime?.completedObjectiveIds ?? [])];
  const complete = new Set(completedObjectiveIds);
  const activeObjective = objectives.find((objective) => !complete.has(objective.id)) ?? null;
  return {
    status: state.scenarioRuntime?.status ?? 'inactive',
    completed: completedObjectiveIds.length,
    total: objectives.length,
    completedObjectiveIds,
    activeObjectiveId: activeObjective?.id ?? null,
    activeObjectiveLabel: activeObjective?.label ?? 'Scenario complete',
    activeShelterNodeId: activeObjective?.condition?.shelterNodeId ?? null
  };
}

function getCommanderState() {
  const commander = (state.game?.leaders ?? []).find((leader) => leader.factionId === 'player');
  return commander?.ai?.emotionalState ?? commander?.behavior?.intent ?? 'unavailable';
}

bus.on('game:step-tick', () => {
  if (!isSimDebugMode(state)) {
    state.status = 'Manual tick is locked to Sim / Debug mode';
    bus.emit('render');
    return;
  }
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
  if (!isTextEntryTarget(event.target) && state.uiScreen === 'game') {
    const key = event.key.toLowerCase();
    if (key === 'r') {
      event.preventDefault();
      bus.emit('playtest:restart-chapter', { sameSeed: true });
      return;
    }
    if (key === 'w') {
      event.preventDefault();
      bus.emit('playtest:cycle-weather-quality');
      return;
    }
    if (key === 'c') {
      event.preventDefault();
      bus.emit('playtest:toggle-map-clarity');
      return;
    }
  }
  if (event.key === ' ') {
    if (isTextEntryTarget(event.target) || state.uiScreen !== 'game' || state.paused || !isSimDebugMode(state)) {
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


window.__fieldFrontsQa = {
  start(mode = 'game') {
    state.experienceMode = mode === 'sim-debug' ? EXPERIENCE_MODES.SIM_DEBUG : EXPERIENCE_MODES.GAME;
    state.mode = 'play';
    state.uiScreen = 'game';
    state.paused = false;
    state.gameOverlay = mode === 'sim-debug' ? state.gameOverlay : 'none';
    state.showCommandRadii = mode === 'sim-debug' ? state.showCommandRadii : false;
    state.activeField = mode === 'sim-debug' ? state.activeField : 'none';
    resetRuntimeFrameBudgetStats();
    bus.emit('ui:screen', 'game');
    bus.emit('render');
    return getQaRuntimeSnapshot('start');
  },
  resetFrameStats() {
    resetRuntimeFrameBudgetStats();
    return getRuntimeFrameBudgetSnapshot();
  },
  frameBudget() {
    return getRuntimeFrameBudgetSnapshot();
  },
  snapshot(label = 'snapshot') {
    return getQaRuntimeSnapshot(label);
  },
  shelterTargets() {
    const commander = (state.game?.leaders ?? []).find((leader) => leader.factionId === 'player');
    return collectCommandTargetCandidates(state, commander?.id)
      .filter((target) => target.type === 'shelter')
      .map((target) => ({
        id: target.id,
        label: target.label,
        objectiveState: target.objectiveState,
        knowledgeState: target.knowledgeState,
        directVisibility: target.directVisibility,
        distanceFromCommander: target.distanceFromCommander
      }));
  },
  scenarioProgress() {
    return getScenarioProgressSnapshot();
  },
  issueSurvivalCommand(targetId, commandId = 'seek_shelter') {
    const validation = validateCommandIntent({ commandId, targetId, audienceId: 'all_band' }, state);
    if (!validation.ok) {
      return {
        ok: false,
        reason: validation.reason,
        message: validation.message,
        targets: this.shelterTargets(),
        progress: getScenarioProgressSnapshot()
      };
    }
    executeCommandIntent(validation, bus);
    return {
      ok: true,
      commandId,
      targetId,
      target: validation.target,
      feedback: state.commandFeedback,
      progress: getScenarioProgressSnapshot()
    };
  },
  async requestMouseObservation() {
    await mousePlaytester.pump({ eventType: 'qa_follow_on', forceSnapshot: true });
    return state.mousePlaytest;
  },
  fundPlayer(amount = 5000) {
    grantQaSupplies('player', amount);
    return getQaRuntimeSnapshot('fund-player');
  },
  spawnInfantry(count = 12) {
    const total = Math.max(0, Math.floor(Number(count) || 0));
    const results = [];
    for (let index = 0; index < total; index += 1) {
      results.push(spawnInfantrySquad(state.game, state.map, { factionId: 'player', select: false }));
    }
    state.gameDirty = true;
    bus.emit('render');
    return { requested: total, spawned: results.filter((entry) => entry?.ok).length };
  },
  issuePathOrders(target = { x: 24, y: 12 }) {
    const entities = [...(state.game.leaders ?? []), ...(state.game.squads ?? [])]
      .filter((entity) => entity?.factionId === 'player');
    const path = [target];
    let accepted = 0;
    for (const entity of entities) {
      const result = issuePlayerMoveCommand(state.game, state.map, entity.id, path);
      if (result.ok) {
        state.game = result.game;
        accepted += 1;
      }
    }
    state.gameDirty = true;
    bus.emit('render');
    return { target, requested: entities.length, accepted };
  },
  placeBlueprints({ type = 'wall_segment', count = 16, start = { x: 8, y: 8 }, spacing = { x: 1, y: 0 } } = {}) {
    grantQaSupplies('player', 5000);
    const total = Math.max(0, Math.floor(Number(count) || 0));
    let placed = 0;
    const failures = [];
    for (let index = 0; index < total; index += 1) {
      const tile = {
        x: Math.round((Number(start.x) || 0) + index * (Number(spacing.x) || 0)),
        y: Math.round((Number(start.y) || 0) + index * (Number(spacing.y) || 0))
      };
      selectStructurePlacement(state, type);
      const result = placeSelectedStructure(state, tile);
      if (result.ok) {
        placed += 1;
      } else {
        failures.push({ tile, reason: result.reason ?? result.validation?.reason ?? 'unknown' });
      }
    }
    state.gameDirty = true;
    bus.emit('render');
    return { type, requested: total, placed, failures: failures.slice(0, 8) };
  },
  placeBlueprintPath({ type = 'wall_segment', path = [] } = {}) {
    grantQaSupplies('player', 5000);
    selectStructurePlacement(state, type);
    const result = placeSelectedStructurePath(state, path);
    bus.emit('render');
    return {
      ok: result.ok,
      type,
      placed: result.structures?.length ?? 0,
      reason: result.reason ?? result.validation?.reason ?? null
    };
  },
  runFrameStressScenario() {
    this.start('game');
    this.fundPlayer(8000);
    const spawned = this.spawnInfantry(24);
    const pathOrders = this.issuePathOrders({ x: 23, y: 13 });
    const blueprints = this.placeBlueprints({ type: 'wall_segment', count: 18, start: { x: 9, y: 8 }, spacing: { x: 1, y: 0 } });
    const trenchPath = this.placeBlueprintPath({
      type: 'trench_segment',
      path: Array.from({ length: 10 }, (_, index) => ({ x: 10 + index, y: 10 }))
    });
    resetRuntimeFrameBudgetStats();
    return { spawned, pathOrders, blueprints, trenchPath, snapshot: getQaRuntimeSnapshot('stress-scenario-ready') };
  }
};

function isGameRunning() {
  return state.uiScreen === 'game' && state.mode === 'play' && !state.paused && state.experienceMode !== EXPERIENCE_MODES.MAP_MAKER;
}

function getTickIntervalMs() {
  return Math.max(120, Number(state.simTickIntervalMs) || DEFAULT_TICK_INTERVAL_MS);
}

function stepGameTick({ source = 'auto', forceRender = false } = {}) {
  const visualStartPositions = captureVisibleLeaderPositions();
  advanceGameTick(state.game, state.map);
  startLeaderMotionInterpolation(visualStartPositions);
  state.mode = 'play';
  updateRenderClock();
  state.gameDirty = true;
  state.status = source === 'manual'
    ? `Manual tick ${state.game.tick}: command fields recalculated`
    : isNomadicSurvivalScene(state.map) ? `Night movement: tick ${state.game.tick}` : `Battle running: tick ${state.game.tick}`;
  advanceScenarioSpineAfterTick();
  bus.emit('game:tick', { tick: state.game.tick, source });
  if (forceRender) {
    bus.emit('render');
  }
}


function advanceScenarioSpineAfterTick() {
  const spine = state.map?.scenario?.scenarioSpine ?? null;
  if (!spine) return;
  const before = state.scenarioRuntime?.effectHistory?.length ?? 0;
  const result = advanceScenarioSpineRuntime({
    spine,
    runtime: state.scenarioRuntime ?? state.map.scenario?.scenarioRuntime,
    game: state.game,
    map: state.map
  });
  state.scenarioRuntime = result.runtime;
  state.map.scenario.scenarioRuntime = result.runtime;
  if (result.runtime?.status === 'completed') {
    applyScenarioRuntimeProgress(state.map, result.runtime, state.activeScenarioId ?? state.map.scenario?.activeScenarioId ?? 'chapter_001');
    state.status = result.runtime.unlockNextChapter
      ? `Scenario completed: ${result.runtime.nextScenarioId ?? 'next chapter'} unlocked`
      : 'Scenario completed: enough survivors reached shelter';
  } else if (result.runtime?.status === 'failed') {
    state.status = 'Scenario failed: commander lost';
  }
  const after = result.runtime?.effectHistory?.length ?? 0;
  if (after > before) {
    const effect = result.runtime.effectHistory[after - 1];
    if (['camera_nudge', 'storm_pulse', 'lightning_flash', 'silhouette_reveal'].includes(effect?.type)) {
      bus.emit('scenario:camera-shake', {
        cue: {
          id: effect.id,
          intensity: effect.type === 'lightning_flash' ? 0.62 : 0.38,
          durationMs: effect.type === 'silhouette_reveal' ? 360 : 260,
          tile: effect.tile
        }
      });
    }
  }
}

function accumulateGameTime(deltaMs, { source = 'auto' } = {}) {
  if (!isGameRunning()) {
    tickAccumulatorMs = 0;
    updateRenderClock();
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
  updateRenderClock();
  return ticks;
}

function isScenarioCameraShakeActive(now = performance.now()) {
  const shake = state.scenarioCameraShake;
  if (!shake?.active) {
    return false;
  }
  if (now > shake.until) {
    state.scenarioCameraShake = { ...shake, active: false };
    return false;
  }
  return true;
}

function animationLoop(now) {
  const deltaMs = Math.min(MAX_FRAME_DELTA_MS, Math.max(0, now - lastFrameTime));
  lastFrameTime = now;
  updateRuntimeFrameStats(deltaMs, now);
  accumulateGameTime(deltaMs);
  updateLeaderMotionInterpolation(deltaMs);
  if (isGameRunning() || state.renderMotion?.active || isScenarioCameraShakeActive(now)) {
    renderer.render(state);
  }
  flushScheduledGameAutosave(now);
  requestAnimationFrame(animationLoop);
}

function updateRuntimeFrameStats(deltaMs, now) {
  const frameDelta = Math.max(0, Number(deltaMs) || 0);
  runtimeFrameSample.frames += 1;
  runtimeFrameSample.frameMsTotal += frameDelta;
  recordRuntimeFrameBudget(frameDelta, now);
  const elapsedMs = now - runtimeFrameSample.startedAt;
  if (elapsedMs < FPS_PUBLISH_INTERVAL_MS) {
    state.runtimeStats = {
      ...(state.runtimeStats ?? {}),
      frameBudget: getRuntimeFrameBudgetSnapshot()
    };
    return;
  }
  const fps = runtimeFrameSample.frames > 0 ? (runtimeFrameSample.frames * 1000) / Math.max(1, elapsedMs) : 0;
  const frameMs = runtimeFrameSample.frames > 0 ? runtimeFrameSample.frameMsTotal / runtimeFrameSample.frames : 0;
  state.runtimeStats = {
    ...(state.runtimeStats ?? {}),
    fps: Math.round(fps),
    frameMs: Math.round(frameMs * 10) / 10,
    frameBudget: getRuntimeFrameBudgetSnapshot(),
    publishedAt: now
  };
  runtimeFrameSample = {
    startedAt: now,
    frames: 0,
    frameMsTotal: 0
  };
  bus.emit('runtime:stats', state.runtimeStats);
}


function createRuntimeFrameBudgetStats(now = performance.now()) {
  return {
    startedAt: now,
    lastFrameAt: now,
    frames: 0,
    frameMs: [],
    longFrames: 0,
    badFrames: 0,
    worstFrameMs: 0
  };
}

function resetRuntimeFrameBudgetStats(now = performance.now()) {
  runtimeFrameBudgetStats = createRuntimeFrameBudgetStats(now);
  state.runtimeStats = {
    ...(state.runtimeStats ?? {}),
    frameBudget: getRuntimeFrameBudgetSnapshot()
  };
}

function recordRuntimeFrameBudget(deltaMs, now = performance.now()) {
  if (!runtimeFrameBudgetStats) {
    runtimeFrameBudgetStats = createRuntimeFrameBudgetStats(now);
  }
  const frameMs = Math.max(0, Number(deltaMs) || 0);
  runtimeFrameBudgetStats.frames += 1;
  runtimeFrameBudgetStats.lastFrameAt = now;
  runtimeFrameBudgetStats.frameMs.push(frameMs);
  if (runtimeFrameBudgetStats.frameMs.length > FRAME_BUDGET_HISTORY_LIMIT) {
    runtimeFrameBudgetStats.frameMs.splice(0, runtimeFrameBudgetStats.frameMs.length - FRAME_BUDGET_HISTORY_LIMIT);
  }
  if (frameMs >= LONG_FRAME_MS) runtimeFrameBudgetStats.longFrames += 1;
  if (frameMs >= BAD_FRAME_MS) runtimeFrameBudgetStats.badFrames += 1;
  runtimeFrameBudgetStats.worstFrameMs = Math.max(runtimeFrameBudgetStats.worstFrameMs, frameMs);
}

function getRuntimeFrameBudgetSnapshot() {
  const samples = runtimeFrameBudgetStats?.frameMs ?? [];
  const sorted = [...samples].sort((a, b) => a - b);
  const averageFrameMs = samples.length > 0
    ? samples.reduce((sum, value) => sum + value, 0) / samples.length
    : 0;
  const p95FrameMs = percentileSorted(sorted, 0.95);
  const p99FrameMs = percentileSorted(sorted, 0.99);
  const worstFrameMs = samples.length > 0 ? Math.max(...samples) : 0;
  const longFrames = samples.filter((value) => value >= LONG_FRAME_MS).length;
  const badFrames = samples.filter((value) => value >= BAD_FRAME_MS).length;
  return {
    contract: 'field-fronts.frame-budget.v1',
    samples: samples.length,
    averageFps: averageFrameMs > 0 ? round1(1000 / averageFrameMs) : 0,
    averageFrameMs: round1(averageFrameMs),
    p95FrameMs: round1(p95FrameMs),
    p99FrameMs: round1(p99FrameMs),
    worstFrameMs: round1(worstFrameMs),
    longFrames,
    badFrames,
    longFrameRatio: samples.length > 0 ? round3(longFrames / samples.length) : 0,
    badFrameRatio: samples.length > 0 ? round3(badFrames / samples.length) : 0,
    thresholds: {
      longFrameMs: LONG_FRAME_MS,
      badFrameMs: BAD_FRAME_MS,
      historyLimit: FRAME_BUDGET_HISTORY_LIMIT
    }
  };
}

function percentileSorted(sorted, ratio) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function round3(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

function getQaRuntimeSnapshot(label = 'snapshot') {
  const summary = JSON.parse(window.render_game_to_text());
  return {
    label,
    uiScreen: state.uiScreen,
    mode: state.mode,
    experienceMode: state.experienceMode,
    paused: state.paused,
    gameTick: state.game?.tick ?? 0,
    structures: state.game?.structures?.length ?? 0,
    constructionJobs: state.game?.constructionJobs?.length ?? 0,
    squads: state.game?.squads?.length ?? 0,
    builders: state.game?.builders?.length ?? 0,
    frameBudget: getRuntimeFrameBudgetSnapshot(),
    runtime: summary.runtime
  };
}

function grantQaSupplies(factionId = 'player', amount = 5000) {
  const faction = state.game?.economy?.factions?.[factionId];
  if (!faction?.stockpiles) return false;
  const nextAmount = Math.max(Number(amount) || 0, 0);
  for (const resourceId of [RESOURCE_IDS.supplies, RESOURCE_IDS.gold, RESOURCE_IDS.food, RESOURCE_IDS.wood, RESOURCE_IDS.population]) {
    const stockpile = faction.stockpiles[resourceId];
    if (!stockpile) continue;
    const amountForResource = Math.max(stockpile.amount ?? 0, nextAmount);
    faction.stockpiles[resourceId] = {
      ...stockpile,
      amount: amountForResource,
      components: resourceId === RESOURCE_IDS.supplies
        ? { provisions: amountForResource / 3, materiel: amountForResource / 3, transit: amountForResource / 3 }
        : { [resourceId]: amountForResource }
    };
  }
  if (faction.storage) {
    faction.storage = {
      ...faction.storage,
      capacity: Math.max(Number(faction.storage.capacity) || 0, nextAmount),
      used: Math.max(Number(faction.storage.used) || 0, nextAmount),
      free: Math.max(0, (Number(faction.storage.capacity) || nextAmount) - nextAmount)
    };
  }
  return true;
}

function updateRenderClock(now = performance.now()) {
  const interval = getTickIntervalMs();
  const alpha = isGameRunning()
    ? Math.max(0, Math.min(1, tickAccumulatorMs / Math.max(1, interval)))
    : 1;
  const accumulatorMs = Math.round(tickAccumulatorMs * 10) / 10;
  state.renderClock = {
    alpha,
    accumulatorMs,
    tickIntervalMs: interval,
    updatedAt: now
  };
  state.runtimeStats = {
    ...(state.runtimeStats ?? {}),
    interpolationAlpha: alpha,
    tickAccumulatorMs: accumulatorMs,
    tickIntervalMs: interval
  };
}

function captureVisibleLeaderPositions() {
  return Object.fromEntries(getMovableEntities().map((entity) => [
    entity.id,
    clonePosition(entity.position ?? entity.tile)
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
  return [...(state.game?.leaders ?? []), ...(state.game?.squads ?? []), ...(state.game?.builders ?? []), ...(state.game?.resourceWorkers ?? []), ...(state.game?.transports ?? [])];
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
  const forceSeed = new URLSearchParams(window.location.search).has('seed') || mouseModeEnabled;
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
    await response.json();
    const projectMap = createFirstNightMap({ seed: 'first-night-project' });
    replaceMap(state, projectMap, { status: 'Loaded Chapter 1: The First Night wilderness blockout' });
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
void loadProjectMap().then(async () => {
  if (!mouseModeEnabled) return;
  launchPlaytestChapter({
    scenarioId: 'chapter_001',
    resetGame: true,
    status: 'Mouse playtest running: The First Night'
  });
  await mousePlaytester.start();
});
requestAnimationFrame(animationLoop);
