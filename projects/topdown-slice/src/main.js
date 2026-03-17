import { createTilemap, TILE_SIZE } from './world/tilemap.js';
import { createEntityStore } from './entities/entityStore.js';
import { createRenderer } from './rendering/renderer.js';
import { bindUI, appendLog } from './editor/ui.js';
import { placeBuilding, canPlaceBuilding, updateBuilding, removeBuilding } from './buildings/buildings.js';
import { spawnUnit } from './units/units.js';
import { parseCommand } from './commands/commandParser.js';
import { runCommand } from './commands/commandRunner.js';
import { runValidation } from './debug/validator.js';
import { tickAgentActionQueue, createConversationalParserStub, createMcpCommandBridgeStub } from './ai/agentStub.js';

const canvas = document.getElementById('game-canvas');
const commandLogEl = document.getElementById('command-log');
const debugLogEl = document.getElementById('debug-log');

const map = createTilemap();
const store = createEntityStore();

const state = {
  map,
  store,
  tool: 'select',
  activeBuildingType: 'house',
  selectedBuildingId: null,
  preview: null,
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
    const result = removeBuilding(state.store, state.selectedBuildingId);
    if (result.ok) {
      state.selectedBuildingId = null;
    }
    logResult(result, 'building deleted');
    ui.refreshInspector();
  },
  runCommandText(text) {
    const parsed = parseCommand(text);
    if (!parsed.ok) {
      appendLog(commandLogEl, parsed.error, 'error');
      return;
    }

    const result = runCommand(state, parsed.command);
    logResult(result, `command: ${text}`);
    if (parsed.command.kind === 'delete-building' && parsed.command.id === state.selectedBuildingId) {
      state.selectedBuildingId = null;
      ui.refreshInspector();
    }
    actions.runChecks();
  },
  runChecks() {
    const checks = runValidation(state);
    checks.forEach((msg) => appendLog(debugLogEl, msg.text, msg.level === 'error' ? 'error' : msg.level === 'ok' ? 'ok' : 'warn'));
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
    const result = placeBuilding(state.store, state.map, {
      type: state.activeBuildingType,
      x: tile.x,
      y: tile.y
    });
    logResult(result, 'place building');
    actions.runChecks();
    return;
  }

  if (state.tool === 'spawn-unit') {
    const result = spawnUnit(state.store, state.map, { type: 'worker', x: tile.x, y: tile.y });
    logResult(result, 'spawn unit');
    actions.runChecks();
    return;
  }

  const selected = state.store.buildings.find((b) => b.x === tile.x && b.y === tile.y);
  actions.selectBuilding(selected?.id ?? null);
});

window.addEventListener('keydown', (event) => {
  const { agent } = state.store;
  const move = {
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0]
  }[event.key];

  if (!move) return;
  const [dx, dy] = move;
  agent.x = Math.max(0, Math.min(state.map.width - 1, agent.x + dx));
  agent.y = Math.max(0, Math.min(state.map.height - 1, agent.y + dy));
  agent.state = 'moving';
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

function gameLoop() {
  tickAgentActionQueue(state.store.agent);
  renderer.draw(state);
  requestAnimationFrame(gameLoop);
}

actions.runChecks();
gameLoop();
