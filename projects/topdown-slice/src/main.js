import { createTilemap, TILE_SIZE } from './world/tilemap.js';
import { createEntityStore } from './entities/entityStore.js';
import { createRenderer } from './rendering/renderer.js';
import { bindUI, appendLog } from './editor/ui.js';
import { BUILDING_STATE, canPlaceBuilding, placeBuilding, updateBuilding } from './buildings/buildings.js';
import {
  advanceBuilderSpawnerCooldowns,
  getBuilderSpawnerActivation,
  getBuilderSpawnerSummary
} from './buildings/builderSpawner.js';
import { parseCommand } from './commands/commandParser.js';
import { runCommand, resolveAssignee } from './commands/commandRunner.js';
import { runValidation } from './debug/validator.js';
import { createEmergenceQaTracker, evaluateEmergenceQa } from './debug/emergenceQa.js';
import { createAdaptiveTuningMonitor, recordAdaptiveTuningCycle } from './debug/adaptiveTuningMonitor.js';
import { buildResolverDecisionSnapshot, createResolverDecisionSnapshot } from './debug/resolverPresentation.js';
import { createDefensibilityIntent, createFlowIntent, createThreatIntent, evaluateIntentPressure } from './ai/intents.js';
import { inspectIntentResolution } from './ai/resolver.js';
import {
  createConflictState,
  seedConflictScenario,
  summarizeConflictState,
  tickConflictLoop
} from './combat/conflictLoop.js';
import {
  createIntentTranslationState,
  translateIntentPrompt as translateIntentTextToSchema,
  upsertTranslatedIntent
} from './ai/intentTranslator.js';
import {
  createAdaptiveResolverState,
  deriveAdaptiveResolverState,
  formatAdaptiveModifierSummary,
  snapshotAdaptiveResolverState
} from './ai/adaptiveResolverWeights.js';
import {
  tickAllActors,
  taskToLabel,
  formatTaskTraceLabel,
  createTask,
  enqueueActorTask,
  cancelCurrentTask,
  clearTaskQueue,
  removeQueuedTask,
  moveQueuedTask,
  retryFailedTask,
  actorLabel,
  createConversationalParserStub,
  createMcpCommandBridgeStub,
  executeImmediateDeleteBuilding
} from './ai/agentStub.js';
import { getActorEnergyText, getTaskEnergyLabel, isActorExhausted, restoreActorEnergy } from './units/energy.js';
import {
  createSimulationHarnessState,
  getRealtimeFrameBudget,
  getSimulationStatusSummary,
  getStepCountForDurationMs,
  pauseSimulation,
  recordSimulationAdvance,
  resumeSimulation,
  setSimulationSpeed as applySimulationSpeed
} from './simulation/harness.js';
import { spawnUnit } from './units/units.js';
import { createWorldPosition, getTileKey } from './world/coordinates.js';
import {
  REINFORCEMENT_DECAY_PER_FRAME,
  createField,
  createProtoWeatherState,
  decayFieldValues,
  recomputeFieldsFromWorld,
  summarizeProtoWeather,
  tickProtoWeather
} from './world/fields.js';

const canvas = document.getElementById('game-canvas');
const commandLogEl = document.getElementById('command-log');
const debugLogEl = document.getElementById('debug-log');
const eventLogEl = document.getElementById('event-log');

const DEMO_INTENT_SPECS = [
  {
    type: 'defensibility',
    config: {
      id: 'demo-defensibility-east-ridge',
      x: 17,
      y: 8,
      radius: 4,
      weight: 1
    }
  },
  {
    type: 'flow',
    config: {
      id: 'demo-flow-east-opening',
      x: 18,
      y: 8,
      radius: 3,
      weight: 1.2
    }
  },
  {
    type: 'threat',
    config: {
      id: 'demo-threat-east-ridge',
      x: 16,
      y: 8,
      radius: 5,
      weight: 0.9
    }
  }
];
const DEMO_WORKER_SPAWN = { x: 18, y: 8 };
const DEMO_RELAY_SPAWN = { x: 19, y: 8 };
const DEMO_WORKER_VISIBLE_ENERGY = 12;
const INTENT_DRAFT_ID = '__intent-draft__';
const DEFAULT_MANUAL_INTENT_BY_TYPE = {
  defensibility: { radius: 4, weight: 1, label: '' },
  flow: { radius: 3, weight: 1.2, label: '' },
  threat: { radius: 5, weight: 0.9, label: '' }
};
const DEBUG_FIELD_LAYER_ORDER = [
  'cover',
  'defensibility',
  'visibility',
  'traversal',
  'reinforcement',
  'heat',
  'moisture',
  'condensation',
  'clouds',
  'defensibilityPressure',
  'flowPressure',
  'threat'
];

const map = createTilemap();
const store = createEntityStore();
const initialIntents = createDemoIntents();
const demoRelayResult = seedDemoRelay(store, map);
const demoWorkerResult = seedDemoWorker(store, map);
const demoConflictResult = seedConflictScenario(store, map);

const state = {
  map,
  store,
  tool: 'select',
  activeBuildingType: 'house',
  assignmentStrategy: 'manual',
  selectedBuildingId: null,
  selectedWorkerId: null,
  preview: null,
  describeTask: taskToLabel,
  debugOverlay: createDebugOverlayState(),
  debug: {
    scoreSummaryEnabled: true,
    scoreSummaryLimit: 3,
    resolverLogEnabled: true,
    resolverLogCycleLimit: 8,
    resolverInspectorEnabled: true,
    selectedIntentId: initialIntents[0].id,
    intentPickMode: false,
    intentCreateMode: false,
    intentDraft: createIntentDraft(),
    intentTranslation: createIntentTranslationState(),
    resolverHoverTile: null,
    resolverPinnedTile: null,
    postResetCycles: 0
  },
  emergence: {
    intents: initialIntents,
    fields: null,
    reinforcement: createField(map.width, map.height, 0),
    weather: createProtoWeatherState(map.width, map.height),
    pressures: {},
    candidates: [],
    resolverInspector: {
      topRanked: [],
      tileDiagnostics: {}
    },
    resolverDecision: createResolverDecisionSnapshot(),
    candidateLog: [],
    qa: null,
    qaTracker: null,
    adaptiveResolver: createAdaptiveResolverState(),
    adaptiveMonitor: createAdaptiveTuningMonitor(),
    tileCooldowns: {},
    tileCooldownCycles: 2,
    frame: 0,
    resolveCycle: 0,
    resolveEveryFrames: 24,
    maxCandidates: 3,
    maxQueuedTasksPerWorker: 2
  },
  conflict: createConflictState(),
  simulation: createSimulationHarnessState(),
  ai: {
    conversationalParser: createConversationalParserStub(),
    mcpBridge: createMcpCommandBridgeStub()
  }
};

state.emergence.qaTracker = createEmergenceQaTracker(state);
state.conflict.seeded = demoConflictResult.ok;

const renderer = createRenderer(canvas);

const actions = {
  selectBuilding(id) {
    state.selectedBuildingId = id;
    ui.refreshInspector();
  },
  setDebugOverlayEnabled(enabled) {
    state.debugOverlay.enabled = Boolean(enabled);
    ui.refreshFieldLayerControls();
    renderer.draw(state);
  },
  setDebugOverlayMode(mode) {
    state.debugOverlay.mode = mode === 'combined' ? 'combined' : 'isolated';
    ui.refreshFieldLayerControls();
    renderer.draw(state);
  },
  setDebugOverlayFocusField(fieldName) {
    if (!state.debugOverlay.layers[fieldName]) {
      return;
    }
    state.debugOverlay.selectedField = fieldName;
    state.debugOverlay.isolatedField = fieldName;
    ui.refreshFieldLayerControls();
    renderer.draw(state);
  },
  setDebugOverlayLayerEnabled(fieldName, enabled) {
    if (!state.debugOverlay.layers[fieldName]) {
      return;
    }
    state.debugOverlay.layers[fieldName].enabled = Boolean(enabled);
    ui.refreshFieldLayerControls();
    renderer.draw(state);
  },
  setDebugOverlayLayerOpacity(fieldName, opacity) {
    if (!state.debugOverlay.layers[fieldName]) {
      return;
    }
    state.debugOverlay.layers[fieldName].opacity = Math.max(0, Math.min(1, Number(opacity) || 0));
    ui.refreshFieldLayerControls();
    renderer.draw(state);
  },
  soloDebugOverlayField(fieldName) {
    if (!state.debugOverlay.layers[fieldName]) {
      return;
    }
    state.debugOverlay.mode = 'isolated';
    state.debugOverlay.selectedField = fieldName;
    state.debugOverlay.isolatedField = fieldName;
    state.debugOverlay.layers[fieldName].enabled = true;
    ui.refreshFieldLayerControls();
    renderer.draw(state);
  },
  clearResolverInspectorPin() {
    state.debug.resolverPinnedTile = null;
    ui.refreshResolverInspector();
  },
  selectIntent(intentId) {
    state.debug.selectedIntentId = intentId;
    state.debug.intentPickMode = false;
    state.debug.intentCreateMode = false;
    ui.refreshIntentControls();
    renderer.draw(state);
  },
  updateSelectedIntent(updates) {
    const draftSelected = state.debug.selectedIntentId === INTENT_DRAFT_ID;
    const intent = draftSelected ? state.debug.intentDraft : getSelectedIntent();
    if (!intent) {
      return;
    }

    if (updates.x != null) {
      intent.position.x = clampToMapX(updates.x);
    }
    if (updates.y != null) {
      intent.position.y = clampToMapY(updates.y);
    }
    intent.center = intent.position;

    if (updates.radius != null && Number.isFinite(updates.radius)) {
      intent.radius = Math.max(0, Math.round(updates.radius));
    }

    if (updates.weight != null && Number.isFinite(updates.weight)) {
      intent.weight = clampIntentWeight(updates.weight);
    }

    if (updates.type && DEFAULT_MANUAL_INTENT_BY_TYPE[updates.type]) {
      intent.type = updates.type;
    }

    if (updates.label != null) {
      intent.label = sanitizeIntentLabel(updates.label);
    }

    refreshIntentAuthoringState();
  },
  toggleIntentPickMode() {
    if (!getSelectedIntent()) {
      return;
    }
    state.debug.intentCreateMode = false;
    state.debug.intentPickMode = !state.debug.intentPickMode;
    ui.refreshIntentControls();
    renderer.draw(state);
  },
  toggleIntentCreateMode() {
    if (!state.debug.intentCreateMode) {
      syncDraftFromSelectedIntent();
      state.debug.selectedIntentId = INTENT_DRAFT_ID;
      state.debug.intentPickMode = false;
    }
    state.debug.intentCreateMode = !state.debug.intentCreateMode;
    ui.refreshIntentControls();
    renderer.draw(state);
  },
  removeSelectedIntent() {
    const selectedIntent = getSelectedIntent();
    if (!selectedIntent) {
      return;
    }

    state.emergence.intents = state.emergence.intents.filter((intent) => intent.id !== selectedIntent.id);
    state.debug.selectedIntentId = state.emergence.intents[0]?.id ?? INTENT_DRAFT_ID;
    state.debug.intentPickMode = false;
    state.debug.intentCreateMode = false;
    syncDraftFromSelectedIntent();
    refreshIntentAuthoringState();
    appendLog(eventLogEl, `Influence removed | ${selectedIntent.id}`, 'warn');
  },
  updateIntentPrompt(prompt) {
    state.debug.intentTranslation.prompt = String(prompt ?? '');
    if (state.debug.intentTranslation.status !== 'idle') {
      state.debug.intentTranslation = {
        ...state.debug.intentTranslation,
        status: 'idle',
        translatedIntent: null,
        error: '',
        appliedIntentId: null
      };
    }
  },
  translateIntentPrompt() {
    const translation = translateIntentTextToSchema({
      text: state.debug.intentTranslation.prompt,
      parser: state.ai.conversationalParser,
      map: state.map,
      existingIntents: state.emergence.intents,
      selectedIntent: getSelectedIntent()
    });

    state.debug.intentTranslation = translation;
    ui.refreshIntentControls();

    if (translation.status === 'error') {
      appendLog(debugLogEl, `Intent translation failed | ${translation.error}`, 'error');
      return translation;
    }

    appendLog(
      eventLogEl,
      `Intent translation ready | ${translation.source} | ${translation.translatedIntent.id} (${translation.translatedIntent.type}) @ (${translation.translatedIntent.position.x}, ${translation.translatedIntent.position.y}) r${translation.translatedIntent.radius} w${translation.translatedIntent.weight.toFixed(1)}`,
      'ok'
    );
    return translation;
  },
  applyTranslatedIntent() {
    const translation = state.debug.intentTranslation;
    if (translation?.status !== 'ready' || !translation.translatedIntent) {
      appendLog(debugLogEl, 'Intent injection skipped | translate a valid intent first.', 'warn');
      return { ok: false, error: 'No valid translated intent is ready.' };
    }

    const result = upsertTranslatedIntent(state.emergence.intents, translation.translatedIntent);
    state.emergence.intents = result.intents;
    state.debug.selectedIntentId = result.runtimeIntent.id;
    state.debug.intentPickMode = false;
    state.debug.intentCreateMode = false;
    state.debug.intentTranslation = {
      ...translation,
      appliedIntentId: result.runtimeIntent.id
    };

    refreshEmergenceCandidates();
    updateEmergenceQa();
    ui.refreshAdaptiveFeedback();
    ui.refreshQaScorecard();
    ui.refreshScoreSummary();
    ui.refreshResolverInspector();
    ui.refreshResolverLog();
    ui.refreshIntentControls();
    renderer.draw(state);

    appendLog(
      eventLogEl,
      `Intent injected | ${result.mode} ${result.runtimeIntent.id} (${result.runtimeIntent.type}) @ (${result.runtimeIntent.position.x}, ${result.runtimeIntent.position.y}) radius ${result.runtimeIntent.radius} weight ${result.runtimeIntent.weight.toFixed(1)} via ${translation.source}`,
      'ok'
    );
    return { ok: true, mode: result.mode, intent: result.runtimeIntent };
  },
  updateSelectedBuilding(updates) {
    if (!state.selectedBuildingId) return;
    const result = updateBuilding(state.store, state.selectedBuildingId, updates);
    logResult(result, 'building updated');
    ui.refreshInspector();
  },
  deleteSelectedBuilding() {
    if (!state.selectedBuildingId) return;
    const selected = state.store.buildings.find((b) => b.id === state.selectedBuildingId);
    if (selected?.state === BUILDING_STATE.UNDER_CONSTRUCTION) {
      const result = executeImmediateDeleteBuilding(state, state.store.agent, selected.id);
      if (result.ok) {
        appendLog(eventLogEl, result.eventText, 'warn');
      } else {
        appendLog(eventLogEl, result.error, 'error');
      }
      state.selectedBuildingId = null;
      ui.refreshInspector();
      ui.refreshTaskPanel();
      ui.refreshWorkerPanel();
      return;
    }

    enqueueTaskForActor(state.store.agent, {
      type: 'deleteBuilding',
      target: null,
      payload: { id: state.selectedBuildingId }
    }, 'inspector delete request');
    state.selectedBuildingId = null;
    ui.refreshInspector();
  },
  activateSelectedSpawner() {
    if (!state.selectedBuildingId) {
      return;
    }

    const selected = state.store.buildings.find((building) => building.id === state.selectedBuildingId);
    if (!selected) {
      appendLog(eventLogEl, 'Selected building no longer exists.', 'error');
      ui.refreshInspector();
      return;
    }

    const activation = getBuilderSpawnerActivation(state, selected);
    if (!activation.ok) {
      appendLog(eventLogEl, `Builder spawner ${selected.id} | ${activation.reason}`, 'warn');
      ui.refreshInspector();
      return;
    }

    enqueueTaskForActor(state.store.agent, {
      type: 'spawnUnit',
      target: { x: selected.x, y: selected.y },
      payload: {
        unitType: 'worker',
        role: 'builder',
        source: 'builder-spawner',
        spawnerId: selected.id,
        spawnAt: activation.spawnTile
      }
    }, 'builder spawner');
    ui.refreshInspector();
    actions.runChecks();
  },
  runCommandText(text) {
    const parsed = parseCommand(text);
    if (!parsed.ok) {
      appendLog(commandLogEl, parsed.error, 'error');
      return;
    }

    const result = runCommand(state, parsed.command);
    if (!result.ok) {
      logResult(result, `command: ${text}`);
      return;
    }

    appendLog(commandLogEl, result.message ?? `command handled: ${text}`, 'ok');

    if (result.mode === 'list-workers' || result.mode === 'strategy') {
      appendLog(eventLogEl, `God Agent | runtime | ${result.message}`, 'ok');
      ui.refreshWorkerPanel();
      return;
    }

    result.queuedTasks.forEach((task) => {
      const actor = getActorById(task.assignedActorId);
      appendLog(eventLogEl, `God Agent issued | ${task.id} | ${formatTaskTraceLabel(task)} -> queued for ${actorLabel(actor)}`, 'ok');
    });

    ui.refreshTaskPanel();
    ui.refreshWorkerPanel();
    actions.runChecks();
  },
  runChecks() {
    const checks = runValidation(state);
    checks.forEach((msg) => appendLog(debugLogEl, msg.text, msg.level === 'error' ? 'error' : msg.level === 'ok' ? 'ok' : 'warn'));
  },
  resetAdaptiveWeights() {
    state.emergence.adaptiveResolver = createAdaptiveResolverState();
    appendLog(eventLogEl, 'Adaptive weights reset: base resolver weights', 'warn');
    refreshEmergenceCandidates();
    ui.refreshAdaptiveFeedback();
    ui.refreshScoreSummary();
    ui.refreshResolverLog();
  },
  updatePostResetCycles(value) {
    state.debug.postResetCycles = sanitizeResolveCycleCount(value);
  },
  setSimulationSpeed(multiplier) {
    const nextSpeed = applySimulationSpeed(state.simulation, multiplier);
    appendLog(eventLogEl, `Simulation speed | ${nextSpeed}x realtime`, 'ok');
    ui.refreshScenarioControls();
  },
  toggleSimulationPaused() {
    if (state.simulation.mode === 'paused') {
      resumeSimulation(state.simulation);
      appendLog(eventLogEl, `Simulation resumed | ${getSimulationStatusSummary(state.simulation).label}`, 'ok');
    } else {
      pauseSimulation(state.simulation);
      appendLog(eventLogEl, `Simulation paused | ${getSimulationStatusSummary(state.simulation).label}`, 'warn');
    }
    ui.refreshScenarioControls();
  },
  stepSimulation(frames = 1) {
    pauseSimulation(state.simulation);
    const requestedFrames = Math.max(1, Math.round(Number(frames) || 1));
    const advancedFrames = runSimulationFrames(requestedFrames, { source: 'step' });
    appendLog(eventLogEl, `Simulation step | advanced ${advancedFrames} frame(s)`, 'ok');
    ui.refreshScenarioControls();
  },
  resetWorkerEnergy() {
    const restored = state.store.units
      .filter((unit) => unit.type === 'worker')
      .filter((worker) => restoreActorEnergy(worker).ok);

    appendLog(
      eventLogEl,
      restored.length > 0
        ? `Worker energy reset | restored ${restored.length} worker(s) to full energy`
        : 'Worker energy reset | no worker energy state found',
      restored.length > 0 ? 'ok' : 'warn'
    );
    ui.refreshWorkerPanel();
    ui.refreshTaskPanel();
    runPostResetResolveCycles('Worker energy reset');
  },
  resetScenario() {
    resetScenarioState();
    appendLog(eventLogEl, 'Scenario reset | restored authored demo state', 'warn');
    runPostResetResolveCycles('Scenario reset');
  },
  cancelCurrentTask() {
    const result = cancelCurrentTask(state.store.agent);
    if (!result.ok) {
      appendLog(eventLogEl, result.error, 'warn');
    } else {
      appendLog(eventLogEl, `${actorLabel(state.store.agent)} | ${result.task.id} | ${formatTaskTraceLabel(result.task)} -> failed (cancelled by user)`, 'warn');
    }
    ui.refreshTaskPanel();
  },
  clearTaskQueue() {
    const result = clearTaskQueue(state.store.agent);
    appendLog(eventLogEl, `${actorLabel(state.store.agent)} cleared queued tasks: ${result.cleared}`, 'warn');
    ui.refreshTaskPanel();
  },
  removeQueuedTask(actorId, taskId) {
    const actor = getActorById(actorId);
    const result = removeQueuedTask(actor, taskId);
    appendLog(eventLogEl, result.ok ? `${actorLabel(actor)} removed queued task ${taskId}` : result.error, result.ok ? 'warn' : 'error');
    ui.refreshTaskPanel();
    ui.refreshWorkerPanel();
  },
  moveQueuedTask(actorId, taskId, direction) {
    const actor = getActorById(actorId);
    const result = moveQueuedTask(actor, taskId, direction);
    appendLog(eventLogEl, result.ok ? `${actorLabel(actor)} moved ${taskId} ${direction}` : result.error, result.ok ? 'ok' : 'warn');
    ui.refreshTaskPanel();
    ui.refreshWorkerPanel();
  },
  retryFailedTask(actorId, taskId) {
    const actor = getActorById(actorId);
    const result = retryFailedTask(actor, taskId);
    appendLog(eventLogEl, result.ok ? `${actorLabel(actor)} retried failed task ${taskId}` : result.error, result.ok ? 'ok' : 'warn');
    ui.refreshTaskPanel();
    ui.refreshWorkerPanel();
  }
};

const ui = bindUI({ state, actions });

if (demoWorkerResult.ok) {
  appendLog(
    eventLogEl,
    `Demo setup | seeded ${demoWorkerResult.unit.id} at (${DEMO_WORKER_SPAWN.x}, ${DEMO_WORKER_SPAWN.y}) with energy ${getActorEnergyText(demoWorkerResult.unit)} for visible constraint feedback`,
    'ok'
  );
} else {
  appendLog(eventLogEl, `Demo setup failed: ${demoWorkerResult.error}`, 'error');
}
if (demoRelayResult.ok) {
  appendLog(
    eventLogEl,
    `Demo setup | seeded relay ${demoRelayResult.building.id} at (${DEMO_RELAY_SPAWN.x}, ${DEMO_RELAY_SPAWN.y}) for explicit worker recharge`,
    'ok'
  );
} else {
  appendLog(eventLogEl, `Demo relay setup failed: ${demoRelayResult.error}`, 'error');
}
if (demoConflictResult.ok) {
  const conflictSummary = summarizeConflictState(state);
  appendLog(
    eventLogEl,
    `Conflict setup | seeded ${demoConflictResult.spawnedUnits.length} fighters | red ${conflictSummary.livingByFaction.red} vs blue ${conflictSummary.livingByFaction.blue}`,
    'ok'
  );
} else {
  appendLog(eventLogEl, `Conflict setup failed: ${demoConflictResult.errors.join(' | ')}`, 'error');
}
state.emergence.intents.forEach((intent) => {
  appendLog(
    eventLogEl,
    `Emergence intent active | ${intent.id} (${intent.type}) at (${intent.position.x}, ${intent.position.y}) radius ${intent.radius} weight ${intent.weight}`,
    'ok'
  );
});

canvas.addEventListener('mousemove', (event) => {
  const tile = getTileFromEvent(event);
  if (!tile) {
    state.preview = null;
    setResolverHoverTile(null);
    return;
  }

  if (state.tool === 'place-building') {
    const check = canPlaceBuilding(state.store, state.map, tile.x, tile.y);
    state.preview = { ...tile, valid: check.ok };
  } else {
    state.preview = null;
  }

  setResolverHoverTile(tile);
});

canvas.addEventListener('mouseleave', () => {
  setResolverHoverTile(null);
});

canvas.addEventListener('click', (event) => {
  const tile = getTileFromEvent(event);
  if (!tile) return;

  if (state.debug.intentCreateMode) {
    const createdIntent = createIntentAtTile(tile);
    if (createdIntent) {
      appendLog(
        eventLogEl,
        `Influence placed | ${createdIntent.id} (${createdIntent.type}) @ (${createdIntent.position.x}, ${createdIntent.position.y})`,
        'ok'
      );
    }
    return;
  }

  if (state.debug.intentPickMode) {
    actions.updateSelectedIntent(tile);
    state.debug.intentPickMode = false;
    ui.refreshIntentControls();
    renderer.draw(state);
    return;
  }

  const clickedIntent = findIntentAtTile(tile);
  if (clickedIntent && state.tool === 'select') {
    actions.selectIntent(clickedIntent.id);
  }

  if (state.tool === 'place-building') {
    enqueueTaskWithStrategy({
      type: 'placeBuilding',
      target: { x: tile.x, y: tile.y },
      payload: { buildingType: state.activeBuildingType }
    }, 'place building');
    actions.runChecks();
    return;
  }

  if (state.tool === 'spawn-unit') {
    enqueueTaskWithStrategy({
      type: 'spawnUnit',
      target: { x: tile.x, y: tile.y },
      payload: { unitType: 'worker' }
    }, 'spawn worker');
    actions.runChecks();
    return;
  }

  if (state.debug.resolverInspectorEnabled && state.tool === 'select') {
    toggleResolverInspectorPin(tile);
  }

  const selected = state.store.buildings.find((b) => b.x === tile.x && b.y === tile.y);
  actions.selectBuilding(selected?.id ?? null);
});

window.addEventListener('keydown', (event) => {
  const move = {
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0]
  }[event.key];

  if (!move) return;
  const [dx, dy] = move;
  const nextX = Math.max(0, Math.min(state.map.width - 1, state.store.agent.x + dx));
  const nextY = Math.max(0, Math.min(state.map.height - 1, state.store.agent.y + dy));

  enqueueTaskForActor(state.store.agent, {
    type: 'moveTo',
    target: { x: nextX, y: nextY },
    payload: {}
  }, 'keyboard move');
});

function getTileFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width === 0 ? 1 : canvas.width / rect.width;
  const scaleY = rect.height === 0 ? 1 : canvas.height / rect.height;
  const canvasX = (event.clientX - rect.left) * scaleX;
  const canvasY = (event.clientY - rect.top) * scaleY;
  const x = Math.floor(canvasX / TILE_SIZE);
  const y = Math.floor(canvasY / TILE_SIZE);
  if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) {
    return null;
  }
  return { x, y };
}

function logResult(result, label) {
  if (result.ok) {
    appendLog(commandLogEl, `${label}: ok`, 'ok');
  } else {
    appendLog(commandLogEl, `${label}: ${result.error}`, 'error');
  }
}

function enqueueTaskForActor(actor, taskSpec, source) {
  const task = createTask(state.store, {
    ...taskSpec,
    assignedActorId: actor.id,
    issuedByActorId: state.store.agent.id
  });
  enqueueActorTask(actor, task);
  if (task.type === 'paintTile' && task.payload?.source === 'field-emergence' && task.target) {
    markTileCooldown(task.target);
  }
  appendLog(eventLogEl, `Task enqueued (${source}) | ${task.id} | ${formatTaskTraceLabel(task)} -> ${actorLabel(actor)}`, 'ok');
  ui.refreshTaskPanel();
  ui.refreshWorkerPanel();
}

function enqueueTaskWithStrategy(taskSpec, source) {
  const assignee = resolveAssignee(state, taskSpec);
  enqueueTaskForActor(assignee, taskSpec, source);
}

function getActorById(id) {
  if (id === 'agent' || id === state.store.agent.id) {
    return state.store.agent;
  }
  return state.store.units.find((unit) => unit.id === id) ?? state.store.agent;
}

function getSelectedIntent() {
  if (state.debug.selectedIntentId === INTENT_DRAFT_ID) {
    return null;
  }
  return state.emergence.intents.find((intent) => intent.id === state.debug.selectedIntentId)
    ?? state.emergence.intents[0]
    ?? null;
}

function createIntentDraft(type = 'defensibility') {
  const defaults = DEFAULT_MANUAL_INTENT_BY_TYPE[type] ?? DEFAULT_MANUAL_INTENT_BY_TYPE.defensibility;
  return {
    id: INTENT_DRAFT_ID,
    type,
    position: createWorldPosition({ x: 0, y: 0 }),
    center: createWorldPosition({ x: 0, y: 0 }),
    radius: defaults.radius,
    weight: defaults.weight,
    label: defaults.label
  };
}

function createDebugOverlayState() {
  return {
    enabled: true,
    mode: 'isolated',
    selectedField: 'defensibility',
    isolatedField: 'defensibility',
    layers: Object.fromEntries(DEBUG_FIELD_LAYER_ORDER.map((fieldName) => [fieldName, {
      enabled: true,
      opacity: 1
    }]))
  };
}

function syncDraftFromSelectedIntent() {
  const selectedIntent = getSelectedIntent();
  if (!selectedIntent) {
    state.debug.intentDraft = createIntentDraft();
    return;
  }

  state.debug.intentDraft = {
    id: INTENT_DRAFT_ID,
    type: selectedIntent.type,
    position: createWorldPosition(selectedIntent.position),
    center: createWorldPosition(selectedIntent.position),
    radius: selectedIntent.radius,
    weight: selectedIntent.weight,
    label: selectedIntent.label ?? ''
  };
}

function createIntentAtTile(tile) {
  const draft = state.debug.intentDraft ?? createIntentDraft();
  const runtimeIntent = createRuntimeIntent({
    id: buildManualIntentId(draft.type, draft.label, tile),
    type: draft.type,
    x: tile.x,
    y: tile.y,
    radius: draft.radius,
    weight: draft.weight,
    label: draft.label
  });

  state.emergence.intents = [...state.emergence.intents, runtimeIntent];
  state.debug.selectedIntentId = runtimeIntent.id;
  state.debug.intentCreateMode = false;
  state.debug.intentPickMode = false;
  state.debug.intentDraft = {
    ...draft,
    position: createWorldPosition(tile),
    center: createWorldPosition(tile)
  };
  refreshIntentAuthoringState();
  return runtimeIntent;
}

function createRuntimeIntent({ id, type, x, y, radius, weight, label }) {
  const config = {
    id,
    x,
    y,
    radius,
    weight,
    label: sanitizeIntentLabel(label)
  };

  if (type === 'flow') {
    return createFlowIntent(config);
  }
  if (type === 'threat') {
    return createThreatIntent(config);
  }
  return createDefensibilityIntent(config);
}

function buildManualIntentId(type, label, position) {
  const base = slugifyIntentToken(label || `${position.x}-${position.y}`);
  let candidateId = `manual-${type}-${base}`;
  let suffix = 2;
  while (state.emergence.intents.some((intent) => intent.id === candidateId)) {
    candidateId = `manual-${type}-${base}-${suffix}`;
    suffix += 1;
  }
  return candidateId;
}

function slugifyIntentToken(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'influence';
}

function sanitizeIntentLabel(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed.slice(0, 48) : '';
}

function findIntentAtTile(tile) {
  return state.emergence.intents.find((intent) =>
    intent.position?.x === tile.x && intent.position?.y === tile.y
  ) ?? null;
}

function createDemoIntents() {
  return DEMO_INTENT_SPECS.map(({ type, config }) => {
    if (type === 'defensibility') {
      return createDefensibilityIntent({ ...config });
    }
    if (type === 'flow') {
      return createFlowIntent({ ...config });
    }
    return createThreatIntent({ ...config });
  });
}

function seedDemoWorker(targetStore, targetMap) {
  const result = spawnUnit(targetStore, targetMap, { type: 'worker', x: DEMO_WORKER_SPAWN.x, y: DEMO_WORKER_SPAWN.y });
  if (result.ok) {
    result.unit.energy = Math.min(result.unit.energy ?? DEMO_WORKER_VISIBLE_ENERGY, DEMO_WORKER_VISIBLE_ENERGY);
  }
  return result;
}

function seedDemoRelay(targetStore, targetMap) {
  return placeBuilding(targetStore, targetMap, {
    type: 'relay',
    x: DEMO_RELAY_SPAWN.x,
    y: DEMO_RELAY_SPAWN.y,
    state: BUILDING_STATE.COMPLETE,
    buildProgress: 5,
    buildRequired: 5,
    name: 'relay east 1'
  });
}

function resetScenarioState() {
  state.map = createTilemap();
  state.store = createEntityStore();
  state.selectedBuildingId = null;
  state.selectedWorkerId = null;
  state.preview = null;
  state.debugOverlay = createDebugOverlayState();
  state.debug.intentPickMode = false;
  state.debug.intentCreateMode = false;
  state.debug.intentDraft = createIntentDraft();
  state.debug.intentTranslation = createIntentTranslationState();
  state.conflict = createConflictState();
  state.emergence.intents = createDemoIntents();
  state.debug.selectedIntentId = state.emergence.intents[0]?.id ?? null;

  const seededRelay = seedDemoRelay(state.store, state.map);
  if (seededRelay.ok) {
    appendLog(
      eventLogEl,
      `Demo setup | seeded relay ${seededRelay.building.id} at (${DEMO_RELAY_SPAWN.x}, ${DEMO_RELAY_SPAWN.y}) for explicit worker recharge`,
      'ok'
    );
  } else {
    appendLog(eventLogEl, `Demo relay setup failed: ${seededRelay.error}`, 'error');
  }

  const seededWorker = seedDemoWorker(state.store, state.map);
  if (seededWorker.ok) {
    appendLog(
      eventLogEl,
      `Demo setup | seeded ${seededWorker.unit.id} at (${DEMO_WORKER_SPAWN.x}, ${DEMO_WORKER_SPAWN.y}) with energy ${getActorEnergyText(seededWorker.unit)} for visible constraint feedback`,
      'ok'
    );
  } else {
    appendLog(eventLogEl, `Demo setup failed: ${seededWorker.error}`, 'error');
  }

  const seededConflict = seedConflictScenario(state.store, state.map);
  state.conflict.seeded = seededConflict.ok;
  if (seededConflict.ok) {
    const conflictSummary = summarizeConflictState(state);
    appendLog(
      eventLogEl,
      `Conflict setup | seeded ${seededConflict.spawnedUnits.length} fighters | red ${conflictSummary.livingByFaction.red} vs blue ${conflictSummary.livingByFaction.blue}`,
      'ok'
    );
  } else {
    appendLog(eventLogEl, `Conflict setup failed: ${seededConflict.errors.join(' | ')}`, 'error');
  }

  resetEmergenceRuntime();
  updateEmergenceQa();
  recordAdaptiveMonitorSnapshot();
  actions.runChecks();
  refreshAllPanels();
  renderer.draw(state);
}

function resetEmergenceRuntime() {
  state.emergence.fields = null;
  state.emergence.reinforcement = createField(state.map.width, state.map.height, 0);
  state.emergence.weather = createProtoWeatherState(state.map.width, state.map.height);
  state.emergence.pressures = {};
  state.emergence.candidates = [];
  state.emergence.candidateLog = [];
  state.emergence.qa = null;
  state.emergence.qaTracker = createEmergenceQaTracker(state);
  state.emergence.adaptiveResolver = createAdaptiveResolverState();
  state.emergence.adaptiveMonitor = createAdaptiveTuningMonitor();
  state.emergence.resolverDecision = createResolverDecisionSnapshot();
  state.emergence.frame = 0;
  state.emergence.resolveCycle = 0;
}

function runPostResetResolveCycles(source) {
  const cycles = sanitizeResolveCycleCount(state.debug.postResetCycles);
  if (cycles <= 0) {
    return;
  }

  appendLog(eventLogEl, `${source} | stepping ${cycles} resolve cycle(s)`, 'ok');
  advanceResolveCycles(cycles);
}

function advanceResolveCycles(cycles) {
  const totalCycles = sanitizeResolveCycleCount(cycles);
  if (totalCycles <= 0) {
    return 0;
  }

  const totalFrames = totalCycles * state.emergence.resolveEveryFrames;
  runSimulationFrames(totalFrames, { source: 'resolve-cycle' });
  return totalCycles;
}

function tickEmergence() {
  decayFieldValues(state.emergence.reinforcement, REINFORCEMENT_DECAY_PER_FRAME);
  const { candidates } = refreshEmergenceCandidates();
  state.emergence.frame += 1;

  if (state.emergence.frame % state.emergence.resolveEveryFrames !== 0) {
    updateEmergenceQa();
    return;
  }

  state.emergence.resolveCycle += 1;
  advanceTileCooldowns();
  advanceBuilderSpawnerCooldowns(state);

  const worker = selectEmergenceWorker();
  const workerPaintLoad = worker ? countEmergencePaintTasks(worker) : 0;
  const candidate = worker && workerPaintLoad < state.emergence.maxQueuedTasksPerWorker
    ? candidates.find((item) =>
        !hasDuplicatePaintTask(item)
        && getTileCooldownRemaining(item.target.x, item.target.y) <= 0
      )
    : null;

  state.emergence.resolverDecision = buildResolverDecisionSnapshot({
    cycle: state.emergence.resolveCycle,
    frame: state.emergence.frame,
    topRanked: state.emergence.resolverInspector?.topRanked ?? [],
    winnerCandidate: candidate
  });
  recordResolverCycle(state.emergence.resolverDecision);
  ui.refreshResolverLog();

  if (!worker) {
    updateEmergenceQa();
    updateAdaptiveResolverFeedback();
    refreshEmergenceCandidates();
    recordAdaptiveMonitorSnapshot();
    return;
  }

  if (workerPaintLoad >= state.emergence.maxQueuedTasksPerWorker) {
    updateEmergenceQa();
    updateAdaptiveResolverFeedback();
    refreshEmergenceCandidates();
    recordAdaptiveMonitorSnapshot();
    return;
  }

  if (!candidate) {
    updateEmergenceQa();
    updateAdaptiveResolverFeedback();
    refreshEmergenceCandidates();
    recordAdaptiveMonitorSnapshot();
    return;
  }

  enqueueTaskForActor(worker, candidate, 'field balance');
  updateEmergenceQa();
  updateAdaptiveResolverFeedback();
  refreshEmergenceCandidates();
  recordAdaptiveMonitorSnapshot();
  actions.runChecks();
}

function updateEmergenceQa() {
  if (!state.emergence.fields) {
    refreshEmergenceCandidates();
  }

  const qa = evaluateEmergenceQa(state, state.emergence.qaTracker);
  state.emergence.qa = qa;
  state.emergence.qaTracker = qa.tracker;
}

function refreshEmergenceCandidates() {
  const fields = recomputeFieldsFromWorld(state);
  const pressures = Object.fromEntries(
    state.emergence.intents.map((intent) => [intent.type, evaluateIntentPressure(intent, fields)])
  );
  const inspection = inspectIntentResolution({
    world: state,
    fields,
    intents: state.emergence.intents,
    pressureFields: pressures,
    maxCandidates: state.emergence.maxCandidates,
    adaptiveWeights: state.emergence.adaptiveResolver,
    isAlreadyQueued: hasDuplicatePaintTask,
    getCooldownRemaining: getTileCooldownRemaining
  });
  const candidates = inspection.candidates;

  state.emergence.fields = fields;
  state.emergence.pressures = pressures;
  state.emergence.candidates = candidates;
  state.emergence.resolverInspector = inspection;

  return { fields, pressures, candidates };
}

function updateAdaptiveResolverFeedback() {
  const previousState = state.emergence.adaptiveResolver ?? createAdaptiveResolverState();
  const nextState = deriveAdaptiveResolverState({
    qa: state.emergence.qa,
    previousState,
    resolveCycle: state.emergence.resolveCycle,
    adaptiveMonitor: state.emergence.adaptiveMonitor
  });

  state.emergence.adaptiveResolver = nextState;
  ui.refreshAdaptiveFeedback();

  if (nextState.changed) {
    appendLog(eventLogEl, `Adaptive weights updated: ${nextState.changedTerms.join(', ')}`, 'ok');
  } else {
    appendLog(eventLogEl, `Adaptive weights unchanged: ${nextState.summary}`, 'ok');
  }
  appendLog(eventLogEl, `Plateau guard | ${nextState.plateauDetected ? 'detected' : 'clear'} | ${nextState.plateauReason}`, nextState.plateauDetected ? 'warn' : 'ok');
  if (nextState.plateauNudgeApplied) {
    appendLog(eventLogEl, `Plateau nudge applied: ${nextState.plateauNudgeSummary}`, 'warn');
  }
  appendLog(eventLogEl, `Reason: ${nextState.reasons.join('; ')}`, 'ok');
}

function recordAdaptiveMonitorSnapshot() {
  state.emergence.adaptiveMonitor = recordAdaptiveTuningCycle(state.emergence.adaptiveMonitor, {
    resolveCycle: state.emergence.resolveCycle,
    adaptiveResolver: state.emergence.adaptiveResolver,
    qa: state.emergence.qa,
    candidates: state.emergence.candidates
  });
  ui.refreshAdaptiveFeedback();
}

function selectEmergenceWorker() {
  const workers = state.store.units.filter((unit) => unit.type === 'worker' && unit.state !== 'exhausted');
  if (workers.length === 0) {
    return null;
  }

  const focus = getEmergenceFocusPosition();

  return workers.reduce((best, worker) => {
    const workerDistance = Math.abs(worker.x - focus.x) + Math.abs(worker.y - focus.y);
    const bestDistance = Math.abs(best.x - focus.x) + Math.abs(best.y - focus.y);
    if (workerDistance !== bestDistance) {
      return workerDistance < bestDistance ? worker : best;
    }

    const workerLoad = countEmergencePaintTasks(worker);
    const bestLoad = countEmergencePaintTasks(best);
    return workerLoad < bestLoad ? worker : best;
  }, workers[0]);
}

function countEmergencePaintTasks(actor) {
  return getActorTasks(actor).filter((task) =>
    task.type === 'paintTile'
    && task.payload?.source === 'field-emergence'
  ).length;
}

function hasDuplicatePaintTask(candidate) {
  return getAllActors().some((actor) => getActorTasks(actor).some((task) =>
    task.type === 'paintTile'
    && task.target?.x === candidate.target.x
    && task.target?.y === candidate.target.y
    && task.payload?.tileType === candidate.payload.tileType
  ));
}

function getAllActors() {
  return [state.store.agent, ...state.store.units];
}

function getEmergenceFocusPosition() {
  const scoringIntents = state.emergence.intents.filter((intent) => intent.type !== 'threat');
  const weightedIntents = scoringIntents.length > 0 ? scoringIntents : state.emergence.intents;

  const totals = weightedIntents.reduce((accumulator, intent) => {
    accumulator.weight += intent.weight;
    accumulator.x += intent.position.x * intent.weight;
    accumulator.y += intent.position.y * intent.weight;
    return accumulator;
  }, { x: 0, y: 0, weight: 0 });

  if (totals.weight === 0) {
    return weightedIntents[0]?.position ?? { x: 0, y: 0 };
  }

  return {
    x: totals.x / totals.weight,
    y: totals.y / totals.weight
  };
}

function getActorTasks(actor) {
  return [
    ...(actor.currentTask ? [actor.currentTask] : []),
    ...actor.taskQueue
  ];
}

function setResolverHoverTile(tile) {
  if (!state.debug.resolverInspectorEnabled) {
    return;
  }

  const current = state.debug.resolverHoverTile;
  if (current?.x === tile?.x && current?.y === tile?.y) {
    return;
  }

  state.debug.resolverHoverTile = tile ? { ...tile } : null;
  ui.refreshResolverInspector();
}

function toggleResolverInspectorPin(tile) {
  const current = state.debug.resolverPinnedTile;
  state.debug.resolverPinnedTile = current?.x === tile.x && current?.y === tile.y ? null : { ...tile };
  ui.refreshResolverInspector();
}

function getActiveResolverInspectorTile() {
  return state.debug.resolverPinnedTile ?? state.debug.resolverHoverTile;
}

function getTileDiagnostics(tile) {
  if (!tile) {
    return null;
  }

  return state.emergence.resolverInspector?.tileDiagnostics?.[getTileKey(tile)] ?? null;
}

function getTileCooldownRemaining(x, y) {
  return Number(state.emergence.tileCooldowns?.[getTileKey({ x, y })] ?? 0);
}

function markTileCooldown(tile, cycles = state.emergence.tileCooldownCycles) {
  const tileKey = getTileKey(tile);
  state.emergence.tileCooldowns[tileKey] = Math.max(
    Number(state.emergence.tileCooldowns[tileKey] ?? 0),
    Number(cycles ?? 0)
  );
}

function advanceTileCooldowns() {
  Object.entries(state.emergence.tileCooldowns).forEach(([tileKey, remaining]) => {
    const next = Number(remaining ?? 0) - 1;
    if (next > 0) {
      state.emergence.tileCooldowns[tileKey] = next;
      return;
    }

    delete state.emergence.tileCooldowns[tileKey];
  });
}

function clampToMapX(value) {
  const fallback = getSelectedIntent()?.position.x ?? 0;
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(state.map.width - 1, Math.round(value)));
}

function clampToMapY(value) {
  const fallback = getSelectedIntent()?.position.y ?? 0;
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(state.map.height - 1, Math.round(value)));
}

function roundToTenths(value) {
  return Math.round(value * 10) / 10;
}

function clampIntentWeight(value) {
  return Math.max(0.1, Math.min(2, roundToTenths(value)));
}

function sanitizeResolveCycleCount(value) {
  if (!Number.isFinite(Number(value))) {
    return 0;
  }
  return Math.max(0, Math.min(20, Math.round(Number(value))));
}

function refreshIntentAuthoringState() {
  refreshEmergenceCandidates();
  updateEmergenceQa();
  ui.refreshAdaptiveFeedback();
  ui.refreshQaScorecard();
  ui.refreshScoreSummary();
  ui.refreshResolverInspector();
  ui.refreshResolverLog();
  ui.refreshIntentControls();
  renderer.draw(state);
}

function refreshAllPanels() {
  ui.refreshInspector();
  ui.refreshFieldLayerControls();
  ui.refreshTaskPanel();
  ui.refreshWorkerPanel();
  ui.refreshQaScorecard();
  ui.refreshAdaptiveFeedback();
  ui.refreshScenarioControls();
  ui.refreshScoreSummary();
  ui.refreshResolverInspector();
  ui.refreshResolverLog();
  ui.refreshIntentControls();
}

function recordResolverCycle(decisionSnapshot) {
  if (!state.debug?.resolverLogEnabled) {
    return;
  }

  const snapshot = {
    cycle: decisionSnapshot?.cycle ?? state.emergence.resolveCycle,
    adaptive: snapshotAdaptiveResolverState(state.emergence.adaptiveResolver),
    entries: (decisionSnapshot?.entries ?? [])
      .slice(0, state.debug.scoreSummaryLimit ?? 3)
      .map((entry) => ({
        x: entry.target.x,
        y: entry.target.y,
        rank: entry.rank,
        finalScore: entry.finalScore,
        presentationStatus: entry.presentationStatus,
        rejectionCategory: entry.rejectionCategory,
        rejectionReason: entry.rejectionReason,
        tieGroupSize: entry.tieGroupSize,
        tieBreakReason: entry.tieBreakReason
      }))
  };

  state.emergence.candidateLog.unshift(snapshot);
  if (state.emergence.candidateLog.length > state.debug.resolverLogCycleLimit) {
    state.emergence.candidateLog.pop();
  }
}

function gameLoop() {
  const frameBudget = getRealtimeFrameBudget(state.simulation);
  if (frameBudget > 0) {
    runSimulationFrames(frameBudget, { source: frameBudget > 1 ? 'fast-forward' : 'realtime' });
  }
  requestAnimationFrame(gameLoop);
}

function advanceSimulationFrame() {
  tickAllActors(state, (text, level) => {
    appendLog(eventLogEl, text, level);
  });
  tickConflictLoop(state, (text, level) => {
    appendLog(eventLogEl, text, level);
  });
  tickProtoWeather(state);
  tickEmergence();
}

function runSimulationFrames(totalFrames, { source = 'manual' } = {}) {
  const frameCount = Math.max(0, Math.floor(Number(totalFrames) || 0));
  if (frameCount <= 0) {
    return 0;
  }

  for (let index = 0; index < frameCount; index += 1) {
    advanceSimulationFrame();
  }

  recordSimulationAdvance(state.simulation, frameCount, source);
  refreshSimulationPanels();
  return frameCount;
}

function refreshSimulationPanels() {
  actions.runChecks();
  ui.refreshInspector();
  ui.refreshTaskPanel();
  ui.refreshWorkerPanel();
  ui.refreshQaScorecard();
  ui.refreshAdaptiveFeedback();
  ui.refreshScenarioControls();
  ui.refreshScoreSummary();
  ui.refreshResolverInspector();
  ui.refreshResolverLog();
  renderer.draw(state);
}

function renderGameToText() {
  const workers = state.store.units
    .filter((unit) => unit.type === 'worker')
    .map((worker) => ({
      id: worker.id,
      role: worker.role ?? 'worker',
      spawnedBySpawnerId: worker.spawnedBySpawnerId ?? null,
      position: createWorldPosition(worker.position),
      state: worker.state,
      energy: getActorEnergyText(worker),
      rechargeBuildingId: worker.rechargeBuildingId ?? null,
      exhausted: worker.state === 'exhausted' || isActorExhausted(worker),
      currentTask: worker.currentTask
        ? {
            id: worker.currentTask.id,
            type: worker.currentTask.type,
            status: worker.currentTask.status,
            energyCost: getTaskEnergyLabel(worker.currentTask),
            reason: worker.currentTask.statusReason
          }
        : null,
      queuedTaskCosts: worker.taskQueue.map((task) => ({
        id: task.id,
        type: task.type,
        energyCost: getTaskEnergyLabel(task)
      }))
    }));
  const spawners = state.store.buildings
    .map((building) => ({
      building,
      summary: getBuilderSpawnerSummary(state, building)
    }))
    .filter(({ summary }) => summary.status !== 'invalid')
    .map(({ building, summary }) => ({
      id: building.id,
      position: createWorldPosition(building.position),
      cooldownRemaining: summary.cooldownRemaining,
      activeBuilders: summary.activeBuilders.map((unit) => unit.id),
      pendingTasks: summary.pendingTasks.map((task) => task.id),
      spawnCap: summary.spawnCap,
      canActivate: summary.ok,
      status: summary.status,
      reason: summary.reason,
      spawnTile: summary.spawnTile
    }));
  const conflict = summarizeConflictState(state);
  const weather = summarizeProtoWeather(state);

  return JSON.stringify({
    coordinateSystem: 'origin top-left, x increases right, y increases down, z defaults to ground plane 0',
    simulation: getSimulationStatusSummary(state.simulation),
    workers,
    spawners,
    conflict,
    weather,
    reinforcementPeaks: getTopReinforcementTiles(state.emergence.reinforcement),
    resolverInspector: {
      enabled: Boolean(state.debug.resolverInspectorEnabled),
      topRanked: (state.emergence.resolverInspector?.topRanked ?? []).map((diagnostic) => ({
        x: diagnostic.target.x,
        y: diagnostic.target.y,
        rank: diagnostic.rank,
        status: diagnostic.selectionStatus,
        rejectionCategory: diagnostic.rejectionCategory,
        finalScore: Number(diagnostic.finalScore.toFixed(3))
      })),
      inspectedTile: (() => {
        const tile = getActiveResolverInspectorTile();
        const diagnostic = getTileDiagnostics(tile);
        if (!tile || !diagnostic) {
          return null;
        }

        return {
          x: tile.x,
          y: tile.y,
          status: diagnostic.selectionStatus,
          rejectionCategory: diagnostic.rejectionCategory,
          finalScore: Number(diagnostic.finalScore.toFixed(3)),
          gradient: Number(diagnostic.gradient.toFixed(3)),
          coverDelta: Number(diagnostic.coverDelta.toFixed(3)),
          visibilityDelta: Number(diagnostic.visibilityDelta.toFixed(3)),
          traversalCost: Number(diagnostic.traversalCost.toFixed(3))
        };
      })()
    },
    resolverDecision: {
      cycle: state.emergence.resolverDecision?.cycle ?? null,
      winnerTile: state.emergence.resolverDecision?.winnerTile ?? null,
      entries: (state.emergence.resolverDecision?.entries ?? []).map((entry) => ({
        x: entry.target.x,
        y: entry.target.y,
        rank: entry.rank,
        status: entry.presentationStatus,
        rejectionCategory: entry.rejectionCategory,
        finalScore: Number(entry.finalScore.toFixed(3))
      }))
    },
    adaptiveResolver: {
      cycle: state.emergence.adaptiveResolver?.lastUpdatedCycle ?? null,
      summary: formatAdaptiveModifierSummary(state.emergence.adaptiveResolver),
      changed: Boolean(state.emergence.adaptiveResolver?.changed),
      reasons: state.emergence.adaptiveResolver?.reasons ?? [],
      lastQaSignals: state.emergence.adaptiveResolver?.lastQaSignals ?? null,
      plateauDetected: Boolean(state.emergence.adaptiveResolver?.plateauDetected),
      plateauReason: state.emergence.adaptiveResolver?.plateauReason ?? '',
      plateauNudgeApplied: Boolean(state.emergence.adaptiveResolver?.plateauNudgeApplied),
      plateauNudgeSummary: state.emergence.adaptiveResolver?.plateauNudgeSummary ?? 'none'
    },
    adaptiveMonitor: {
      trends: state.emergence.adaptiveMonitor?.trends ?? null,
      history: (state.emergence.adaptiveMonitor?.history ?? []).slice(0, 5)
    },
    intentTranslation: {
      status: state.debug.intentTranslation?.status ?? 'idle',
      source: state.debug.intentTranslation?.source ?? 'none',
      translatedIntent: state.debug.intentTranslation?.translatedIntent ?? null,
      error: state.debug.intentTranslation?.error ?? '',
      appliedIntentId: state.debug.intentTranslation?.appliedIntentId ?? null
    }
  });
}

function getTopReinforcementTiles(field, limit = 3) {
  if (!field) {
    return [];
  }

  const peaks = [];
  for (let y = 0; y < field.height; y += 1) {
    for (let x = 0; x < field.width; x += 1) {
      const value = field.values[y]?.[x] ?? 0;
      if (value <= 0.01) {
        continue;
      }

      peaks.push({ x, y, value: Number(value.toFixed(3)) });
    }
  }

  return peaks
    .sort((left, right) => right.value - left.value || left.y - right.y || left.x - right.x)
    .slice(0, limit);
}

updateEmergenceQa();
recordAdaptiveMonitorSnapshot();
actions.runChecks();
refreshAllPanels();
renderer.draw(state);

window.render_game_to_text = renderGameToText;
window.advanceTime = (ms = 1000 / 60) => {
  pauseSimulation(state.simulation);
  const steps = getStepCountForDurationMs(state.simulation, ms);
  return runSimulationFrames(steps, { source: 'manual-advance' });
};
window.pauseSimulation = () => {
  pauseSimulation(state.simulation);
  ui.refreshScenarioControls();
};
window.resumeRealtime = () => {
  resumeSimulation(state.simulation);
  ui.refreshScenarioControls();
};
window.setSimulationSpeed = (multiplier = 1) => {
  const nextSpeed = applySimulationSpeed(state.simulation, multiplier);
  ui.refreshScenarioControls();
  return nextSpeed;
};
window.stepSimulation = (frames = 1) => {
  pauseSimulation(state.simulation);
  return runSimulationFrames(Math.max(1, Math.round(Number(frames) || 1)), { source: 'window-step' });
};
window.getSimulationState = () => getSimulationStatusSummary(state.simulation);

gameLoop();
