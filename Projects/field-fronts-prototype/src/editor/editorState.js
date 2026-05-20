import { createBrush, paintHeightMap, paintMap } from './brush.js';
import { createDefaultMap, cloneMap, deserializeMap, serializeMap, summarizeElevation, summarizeTerrain } from '../world/mapModel.js';
import { deriveTerrainFields, updateTerrainFieldsLocally } from '../world/fields.js';
import {
  createInitialGameState,
  deserializeGameState,
  placeStructureBuildOrder,
  recomputeGameState,
  resetGameForMap,
  serializeGameState,
  summarizeGame,
  validateStructurePlacement
} from '../game/gameModel.js';

export function createEditorState(initialMap = createDefaultMap()) {
  return {
    mode: 'play',
    map: initialMap,
    fields: deriveTerrainFields(initialMap),
    game: createInitialGameState(initialMap),
    gameOverlay: 'none',
    showCommandRadii: false,
    dynamicLighting: true,
    simTickIntervalMs: 750,
    gameAutosaveIntervalMs: 60000,
    brush: createBrush({ terrainId: 'land' }),
    selectedTile: null,
    hoverTile: null,
    placement: createPlacementState(),
    intentPreview: null,
    renderMotion: null,
    activeField: 'none',
    undoStack: [],
    redoStack: [],
    dirty: false,
    gameDirty: false,
    status: 'Ready: leaders are projecting pressure at a neutral outpost',
    dirtyRegion: null
  };
}

export function paintAtTile(state, tile, options = {}) {
  if (!tile || state.mode !== 'edit') {
    return [];
  }
  const direction = options.lower ? 'lower' : state.brush.heightDirection;
  const changes = state.brush.tool === 'height'
    ? paintHeightMap(state.map, tile.x, tile.y, state.brush, { direction })
    : paintMap(state.map, tile.x, tile.y, state.brush);
  if (changes.length > 0) {
    state.undoStack.push(changes);
    state.redoStack = [];
    
    if (options.isDragging) {
      updateTerrainFieldsLocally(state.map, state.fields, tile.x, tile.y, state.brush.radius);
      if (!state.dirtyRegion) {
        state.dirtyRegion = {
          minX: tile.x,
          maxX: tile.x,
          minY: tile.y,
          maxY: tile.y
        };
      }
      changes.forEach((c) => {
        state.dirtyRegion.minX = Math.min(state.dirtyRegion.minX, c.x);
        state.dirtyRegion.maxX = Math.max(state.dirtyRegion.maxX, c.x);
        state.dirtyRegion.minY = Math.min(state.dirtyRegion.minY, c.y);
        state.dirtyRegion.maxY = Math.max(state.dirtyRegion.maxY, c.y);
      });
    } else {
      refreshDerivedState(state);
    }
    
    state.dirty = true;
    state.gameDirty = true;
    const action = state.brush.tool === 'height'
      ? direction === 'lower' ? 'lowered' : 'raised'
      : 'painted';
    state.status = `${changes.length} tile${changes.length === 1 ? '' : 's'} ${action}`;
  }
  return changes;
}

export function undo(state) {
  const changes = state.undoStack.pop();
  if (!changes) {
    state.status = 'Nothing to undo';
    return false;
  }
  changes.forEach((change) => {
    const { x, y, before, beforeElevation } = change;
    state.map.tiles[y][x] = before;
    if (state.map.elevation && Number.isFinite(beforeElevation)) {
      state.map.elevation[y][x] = beforeElevation;
    }
  });
  state.redoStack.push(changes);
  refreshDerivedState(state);
  state.dirty = true;
  state.gameDirty = true;
  state.status = 'Undo applied';
  return true;
}

export function redo(state) {
  const changes = state.redoStack.pop();
  if (!changes) {
    state.status = 'Nothing to redo';
    return false;
  }
  changes.forEach((change) => {
    const { x, y, after, afterElevation } = change;
    state.map.tiles[y][x] = after;
    if (state.map.elevation && Number.isFinite(afterElevation)) {
      state.map.elevation[y][x] = afterElevation;
    }
  });
  state.undoStack.push(changes);
  refreshDerivedState(state);
  state.dirty = true;
  state.gameDirty = true;
  state.status = 'Redo applied';
  return true;
}

export function resetMap(state) {
  state.map = createDefaultMap();
  state.fields = deriveTerrainFields(state.map);
  resetGameForMap(state);
  state.selectedTile = null;
  state.hoverTile = null;
  state.placement = createPlacementState();
  state.intentPreview = null;
  state.renderMotion = null;
  state.undoStack = [];
  state.redoStack = [];
  state.dirty = true;
  state.gameDirty = true;
  state.status = 'Map reset and core loop reseeded';
}

export function replaceMap(state, nextMap, { resetGame = true, status = 'Map loaded' } = {}) {
  state.map = cloneMap(nextMap);
  state.fields = deriveTerrainFields(state.map);
  if (resetGame) {
    resetGameForMap(state);
  } else {
    recomputeGameState(state.game, state.map);
  }
  state.selectedTile = null;
  state.hoverTile = null;
  state.placement = createPlacementState();
  state.intentPreview = null;
  state.renderMotion = null;
  state.undoStack = [];
  state.redoStack = [];
  state.dirty = true;
  state.gameDirty = true;
  state.status = status;
}

export function exportEditorMap(state) {
  return serializeMap(state.map);
}

export function importEditorMap(state, json) {
  replaceMap(state, deserializeMap(json), { status: 'Map imported and leaders reseeded' });
}

export function exportGameState(state) {
  return serializeGameState(state.game, state.map);
}

export function importGameState(state, json) {
  state.game = deserializeGameState(json, state.map);
  state.mode = 'play';
  state.selectedTile = null;
  state.hoverTile = null;
  state.placement = createPlacementState();
  state.intentPreview = null;
  state.renderMotion = null;
  state.gameDirty = true;
  state.status = `Game state imported: tick ${state.game.tick}`;
  return state.game;
}

export function replaceGameState(state, nextGame, { status = 'Game state loaded' } = {}) {
  state.game = recomputeGameState(nextGame, state.map);
  state.mode = 'play';
  state.selectedTile = null;
  state.hoverTile = null;
  state.placement = createPlacementState();
  state.gameDirty = true;
  state.status = status;
  return state.game;
}

export function refreshDerivedState(state) {
  state.fields = deriveTerrainFields(state.map);
  recomputeGameState(state.game, state.map);
}

export function selectStructurePlacement(state, structureType) {
  state.mode = 'play';
  state.selectedBuild = structureType;
  state.selectedUnit = null;
  state.placement = {
    ...createPlacementState(),
    active: true,
    selectedStructureType: structureType
  };
  state.status = `Placing ${structureType}: choose a build site`;
  return state.placement;
}

export function cancelStructurePlacement(state, status = 'Structure placement cancelled') {
  state.placement = createPlacementState();
  state.selectedBuild = null;
  state.status = status;
  return state.placement;
}

export function updateStructurePlacementPreview(state, tile) {
  if (!state.placement?.active) {
    return state.placement ?? createPlacementState();
  }
  const position = tile ? { x: tile.x, y: tile.y } : null;
  const validation = position
    ? validateStructurePlacement(state.game, state.map, {
      type: state.placement.selectedStructureType,
      factionId: 'player',
      position
    })
    : createPlacementValidation(false, 'no-hover', 'Move over the map');
  state.placement = {
    ...state.placement,
    hoverPosition: position,
    validity: validation,
    invalidReason: validation.valid ? null : validation.reason
  };
  return state.placement;
}

export function placeSelectedStructure(state, tile) {
  if (!state.placement?.active || !state.placement.selectedStructureType || !tile) {
    return { ok: false, reason: 'placement-inactive' };
  }
  const result = placeStructureBuildOrder(state.game, state.map, {
    type: state.placement.selectedStructureType,
    factionId: 'player',
    position: { x: tile.x, y: tile.y }
  });
  if (!result.ok) {
    updateStructurePlacementPreview(state, tile);
    state.status = result.validation?.message ?? 'Cannot place structure here';
    return result;
  }
  state.game = result.game;
  state.gameDirty = true;
  state.placement = createPlacementState();
  state.selectedBuild = null;
  state.status = `${result.structure.name} planned: -${result.cost} Supplies`;
  return result;
}

export function summarizeEditor(state) {
  return {
    mode: state.mode,
    map: { width: state.map.width, height: state.map.height },
    brush: { ...state.brush },
    activeField: state.activeField,
    gameOverlay: state.gameOverlay,
    hoverTile: state.hoverTile,
    selectedTile: state.selectedTile,
    placement: {
      active: Boolean(state.placement?.active),
      selectedStructureType: state.placement?.selectedStructureType ?? null,
      hoverPosition: state.placement?.hoverPosition ?? null,
      valid: Boolean(state.placement?.validity?.valid),
      reason: state.placement?.validity?.reason ?? null,
      message: state.placement?.validity?.message ?? null
    },
    terrainCounts: summarizeTerrain(state.map),
    elevation: summarizeElevation(state.map),
    game: summarizeGame(state.game),
    runtime: {
      uiScreen: state.uiScreen ?? 'menu',
      paused: Boolean(state.paused),
      tickIntervalMs: state.simTickIntervalMs,
      gameAutosaveIntervalMs: state.gameAutosaveIntervalMs,
      motionSmoothing: {
        active: Boolean(state.renderMotion?.active),
        progress: Number(state.renderMotion?.progress ?? 1)
      }
    },
    persistence: {
      mapDirty: state.dirty,
      gameDirty: state.gameDirty
    },
    undoDepth: state.undoStack.length,
    redoDepth: state.redoStack.length,
    status: state.status
  };
}

function createPlacementState() {
  return {
    active: false,
    selectedStructureType: null,
    hoverPosition: null,
    validity: null,
    invalidReason: null
  };
}

function createPlacementValidation(valid, reason, message) {
  return {
    valid,
    reason,
    message,
    cost: 0,
    sourceBaseId: null,
    position: null,
    tile: null,
    structureType: null
  };
}
