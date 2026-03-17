import { createTilemap, TILE_SIZE } from './world/tilemap.js';
import { createEntityStore } from './entities/entityStore.js';
import { createRenderer } from './rendering/renderer.js';
import { bindUI, appendLog } from './editor/ui.js';
import { BUILDING_STATE, canPlaceBuilding, updateBuilding } from './buildings/buildings.js';
import { parseCommand } from './commands/commandParser.js';
import { runCommand } from './commands/commandRunner.js';
import { runValidation } from './debug/validator.js';
import {
  tickAllActors,
  taskToLabel,
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

const canvas = document.getElementById('game-canvas');
const commandLogEl = document.getElementById('command-log');
const debugLogEl = document.getElementById('debug-log');
const eventLogEl = document.getElementById('event-log');

const map = createTilemap();
const store = createEntityStore();

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
  ai: {
    conversationalParser: createConversationalParserStub(),
    mcpBridge: createMcpCommandBridgeStub()
  }
};

const renderer = createRenderer(canvas);

const actions = {
  selectBuilding(id) {
    state.selectedBuildingId = id;
    ui.refreshInspector();
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
      appendLog(eventLogEl, `God Agent issued | ${task.id} | ${task.type} -> queued for ${actorLabel(actor)}`, 'ok');
    });

    ui.refreshTaskPanel();
    ui.refreshWorkerPanel();
    actions.runChecks();
  },
  runChecks() {
    const checks = runValidation(state);
    checks.forEach((msg) => appendLog(debugLogEl, msg.text, msg.level === 'error' ? 'error' : msg.level === 'ok' ? 'ok' : 'warn'));
  },
  cancelCurrentTask() {
    const result = cancelCurrentTask(state.store.agent);
    if (!result.ok) {
      appendLog(eventLogEl, result.error, 'warn');
    } else {
      appendLog(eventLogEl, `${actorLabel(state.store.agent)} | ${result.task.id} | ${result.task.type} -> failed (cancelled by user)`, 'warn');
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

canvas.addEventListener('mousemove', (event) => {
  const tile = getTileFromEvent(event);
  if (!tile) {
    state.preview = null;
    return;
  }

  if (state.tool === 'place-building') {
    const check = canPlaceBuilding(state.store, state.map, tile.x, tile.y);
    state.preview = { ...tile, valid: check.ok };
  } else {
    state.preview = null;
  }
});

canvas.addEventListener('click', (event) => {
  const tile = getTileFromEvent(event);
  if (!tile) return;

  if (state.tool === 'place-building') {
    enqueueTaskForActor(state.store.agent, {
      type: 'placeBuilding',
      target: { x: tile.x, y: tile.y },
      payload: { buildingType: state.activeBuildingType }
    }, 'place building');
    actions.runChecks();
    return;
  }

  if (state.tool === 'spawn-unit') {
    enqueueTaskForActor(state.store.agent, {
      type: 'spawnUnit',
      target: { x: tile.x, y: tile.y },
      payload: { unitType: 'worker' }
    }, 'spawn worker');
    actions.runChecks();
    return;
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
  const x = Math.floor((event.clientX - rect.left) / TILE_SIZE);
  const y = Math.floor((event.clientY - rect.top) / TILE_SIZE);
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
  appendLog(eventLogEl, `Task enqueued (${source}) | ${task.id} | ${task.type} -> ${actorLabel(actor)}`, 'ok');
  ui.refreshTaskPanel();
  ui.refreshWorkerPanel();
}

function getActorById(id) {
  if (id === 'agent' || id === state.store.agent.id) {
    return state.store.agent;
  }
  return state.store.units.find((unit) => unit.id === id) ?? state.store.agent;
}

function gameLoop() {
  tickAllActors(state, (text, level) => {
    appendLog(eventLogEl, text, level);
    ui.refreshTaskPanel();
    ui.refreshWorkerPanel();
    actions.runChecks();
  });
  ui.refreshInspector();
  renderer.draw(state);
  requestAnimationFrame(gameLoop);
}

actions.runChecks();
ui.refreshTaskPanel();
ui.refreshWorkerPanel();
gameLoop();
