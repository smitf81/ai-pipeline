import { createBrush, paintHeightMap, paintMap } from './brush.js';
import { createDefaultMap, cloneMap, deserializeMap, serializeMap, summarizeElevation, summarizeTerrain } from '../world/mapModel.js';
import { createFirstNightMap } from '../world/mapGenerator.js';
import { normaliseScenarioCameraRig } from '../world/scenarioLayer.js';
import { normaliseScenarioRuntime } from '../world/scenarioSpine.js';
import { createPlaytestSettings } from '../game/playtestStabilization.js';
import { ensureScenarioCatalogueForMap, selectScenario } from '../world/scenarioCatalogue.js';
import { isNomadicSurvivalScene, summarizeSceneEntity } from '../world/sceneEntity.js';
import { summarizeWorldAssetLifecycle } from '../world/assetLifecycle.js';
import { deriveTerrainFields, updateTerrainFieldsLocally } from '../world/fields.js';
import {
  createInitialGameState,
  deserializeGameState,
  placeStructureBuildOrder,
  placeStructurePathBuildOrder,
  recomputeGameState,
  resetGameForMap,
  serializeGameState,
  summarizeGame,
  validateStructurePathPlacement,
  validateStructurePlacement
} from '../game/gameModel.js';
import { isSketchableStructureType } from '../game/structureJoinery.js';

export function createEditorState(initialMap = createDefaultMap()) {
  const map = ensureScenarioCatalogueForMap(initialMap);
  return {
    mode: 'play',
    experienceMode: 'menu',
    map,
    fields: deriveTerrainFields(map),
    game: createInitialGameState(map),
    gameOverlay: 'none',
    showCommandRadii: false,
    showNoisePings: false,
    showFieldOfView: false,
    showScenarioLayer: true,
    scenarioCamera: normaliseScenarioCameraRig(map.scenario?.scenarioLayer?.cameraRig),
    tacticalCameraPan: null,
    activeScenarioId: map.scenario?.activeScenarioId ?? 'chapter_001',
    scenarioCameraShake: null,
    scenarioRuntime: normaliseScenarioRuntime(map.scenario?.scenarioRuntime, map.scenario?.scenarioSpine),
    dynamicLighting: true,
    playtest: createPlaytestSettings(),
    mousePlaytest: null,
    simTickIntervalMs: 750,
    gameAutosaveIntervalMs: 60000,
    brush: createBrush({ terrainId: 'land' }),
    selectedTile: null,
    hoverTile: null,
    placement: createPlacementState(),
    scenePlacementTool: null,
    intentPreview: null,
    routeFeedback: null,
    orderWheel: null,
    commandFeedback: null,
    renderMotion: null,
    activeField: 'none',
    undoStack: [],
    redoStack: [],
    dirty: false,
    gameDirty: false,
    status: isNomadicSurvivalScene(map) ? 'The First Night ready: move the band into shelter' : 'Ready: leaders are projecting pressure at a neutral outpost',
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
      state.dirtyRegion = null;
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
  state.map = ensureScenarioCatalogueForMap(createFirstNightMap());
  state.fields = deriveTerrainFields(state.map);
  resetGameForMap(state);
  state.selectedTile = null;
  state.hoverTile = null;
  state.placement = createPlacementState();
  state.scenePlacementTool = null;
  state.intentPreview = null;
  state.routeFeedback = null;
  state.commandFeedback = null;
  state.renderMotion = null;
  state.playtest = createPlaytestSettings(state.playtest);
  state.scenarioCamera = normaliseScenarioCameraRig(state.map.scenario?.scenarioLayer?.cameraRig);
  state.tacticalCameraPan = null;
  state.activeScenarioId = state.map.scenario?.activeScenarioId ?? 'chapter_001';
  state.scenarioRuntime = normaliseScenarioRuntime(state.map.scenario?.scenarioRuntime, state.map.scenario?.scenarioSpine);
  state.undoStack = [];
  state.redoStack = [];
  state.dirty = true;
  state.gameDirty = true;
  state.status = 'The First Night blockout reset';
}

export function replaceMap(state, nextMap, { resetGame = true, status = 'Map loaded' } = {}) {
  state.map = ensureScenarioCatalogueForMap(cloneMap(nextMap));
  state.fields = deriveTerrainFields(state.map);
  if (resetGame) {
    resetGameForMap(state);
  } else {
    recomputeGameState(state.game, state.map);
  }
  state.selectedTile = null;
  state.hoverTile = null;
  state.placement = createPlacementState();
  state.scenePlacementTool = null;
  state.intentPreview = null;
  state.routeFeedback = null;
  state.commandFeedback = null;
  state.renderMotion = null;
  state.playtest = createPlaytestSettings(state.playtest);
  state.scenarioCamera = normaliseScenarioCameraRig(state.map.scenario?.scenarioLayer?.cameraRig);
  state.tacticalCameraPan = null;
  state.activeScenarioId = state.map.scenario?.activeScenarioId ?? 'chapter_001';
  state.scenarioRuntime = normaliseScenarioRuntime(state.map.scenario?.scenarioRuntime, state.map.scenario?.scenarioSpine);
  state.undoStack = [];
  state.redoStack = [];
  state.dirty = true;
  state.gameDirty = true;
  state.status = status;
}

export function activateScenario(state, scenarioId) {
  const result = selectScenario(state.map, scenarioId);
  if (!result.ok) {
    state.status = 'No available scenario to activate';
    return result;
  }
  state.activeScenarioId = result.scenario.id;
  state.scenarioCamera = normaliseScenarioCameraRig(state.map.scenario?.scenarioLayer?.cameraRig);
  state.tacticalCameraPan = null;
  state.scenarioRuntime = normaliseScenarioRuntime({}, state.map.scenario?.scenarioSpine);
  state.map.scenario.scenarioRuntime = state.scenarioRuntime;
  state.showScenarioLayer = true;
  state.dirty = true;
  state.gameDirty = true;
  state.status = `${result.scenario.title} selected`;
  return result;
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
  state.tacticalCameraPan = null;
  state.selectedTile = null;
  state.hoverTile = null;
  state.placement = createPlacementState();
  state.intentPreview = null;
  state.routeFeedback = null;
  state.commandFeedback = null;
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
  const mode = isSketchableStructureType(structureType) ? 'path' : 'single';
  state.placement = {
    ...createPlacementState(),
    active: true,
    mode,
    selectedStructureType: structureType,
    path: []
  };
  state.status = mode === 'path'
    ? `Sketching ${structureType}: drag a build path`
    : `Placing ${structureType}: choose a build site`;
  return state.placement;
}

export function cancelStructurePlacement(state, status = 'Structure placement cancelled') {
  state.placement = createPlacementState();
  state.selectedBuild = null;
  state.status = status;
  return state.placement;
}

export function updateStructurePlacementPreview(state, tile, options = {}) {
  if (!state.placement?.active) {
    return state.placement ?? createPlacementState();
  }
  const position = tile ? { x: tile.x, y: tile.y } : null;
  const path = normalisePlacementPath(options.path ?? state.placement.path ?? (position ? [position] : []));
  const validation = position
    ? state.placement.mode === 'path'
      ? validateStructurePathPlacement(state.game, state.map, {
        type: state.placement.selectedStructureType,
        factionId: 'player',
        path
      })
      : validateStructurePlacement(state.game, state.map, {
        type: state.placement.selectedStructureType,
        factionId: 'player',
        position
      })
    : createPlacementValidation(false, 'no-hover', 'Move over the map');
  state.placement = {
    ...state.placement,
    hoverPosition: position,
    path: state.placement.mode === 'path' ? path : [],
    pathPlan: validation.pathPlan ?? null,
    validity: validation,
    invalidReason: validation.valid ? null : validation.reason
  };
  return state.placement;
}

export function placeSelectedStructure(state, tile, options = {}) {
  if (!state.placement?.active || !state.placement.selectedStructureType || !tile) {
    return { ok: false, reason: 'placement-inactive' };
  }
  if (state.placement.mode === 'path') {
    return placeSelectedStructurePath(state, options.path ?? state.placement.path ?? [tile]);
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

export function placeSelectedStructurePath(state, path = []) {
  if (!state.placement?.active || !state.placement.selectedStructureType) {
    return { ok: false, reason: 'placement-inactive' };
  }
  const placementPath = normalisePlacementPath(path);
  const result = placeStructurePathBuildOrder(state.game, state.map, {
    type: state.placement.selectedStructureType,
    factionId: 'player',
    path: placementPath
  });
  if (!result.ok) {
    const finalTile = placementPath[placementPath.length - 1] ?? null;
    updateStructurePlacementPreview(state, finalTile, { path: placementPath });
    state.status = result.validation?.message ?? 'Cannot place structure path here';
    return result;
  }
  state.game = result.game;
  state.gameDirty = true;
  const label = result.structures?.[0]?.name?.replace(/ \d+$/, '') ?? state.placement?.selectedStructureType ?? 'Structure path';
  state.placement = createPlacementState();
  state.selectedBuild = null;
  state.status = `${result.structures.length} ${label} blueprint segment${result.structures.length === 1 ? '' : 's'} planned: -${result.cost} Supplies`;
  return result;
}

export function summarizeEditor(state) {
  return {
    mode: state.mode,
    experienceMode: state.experienceMode ?? 'menu',
    map: {
      width: state.map.width,
      height: state.map.height,
      seed: state.map.scenario?.generator?.seed ?? null,
      preset: state.map.scenario?.generator?.preset ?? null,
      targetTextureSize: state.map.scenario?.generator?.targetTextureSize ?? null,
      neutralOutposts: state.map.scenario?.neutralOutposts?.length ?? 0,
      scenarioLayer: state.map.scenario?.scenarioLayer
        ? {
          seed: state.map.scenario.scenarioLayer.seed ?? null,
          preset: state.map.scenario.scenarioLayer.preset ?? null,
          storyBeats: state.map.scenario.scenarioLayer.storyBeats?.length ?? 0,
          locations: state.map.scenario.scenarioLayer.locations?.length ?? 0,
          items: state.map.scenario.scenarioLayer.items?.length ?? 0,
          assets: state.map.scenario.scenarioLayer.assets?.length ?? 0,
          characters: state.map.scenario.scenarioLayer.characters?.length ?? 0,
          speechBubbles: state.map.scenario.scenarioLayer.speechBubbles?.length ?? 0,
          cameraCues: state.map.scenario.scenarioLayer.cameraCues?.length ?? 0,
          effects: state.map.scenario.scenarioLayer.effects?.length ?? 0
        }
        : null,
      sceneEntity: summarizeSceneEntity(state.map)
    },
    brush: { ...state.brush },
    activeField: state.activeField,
    gameOverlay: state.gameOverlay,
    hoverTile: state.hoverTile,
    selectedTile: state.selectedTile,
    placement: {
      active: Boolean(state.placement?.active),
      selectedStructureType: state.placement?.selectedStructureType ?? null,
      hoverPosition: state.placement?.hoverPosition ?? null,
      mode: state.placement?.mode ?? 'single',
      path: state.placement?.path ?? [],
      pathSegments: state.placement?.pathPlan?.segments?.length ?? 0,
      valid: Boolean(state.placement?.validity?.valid),
      reason: state.placement?.validity?.reason ?? null,
      message: state.placement?.validity?.message ?? null
    },
    terrainCounts: summarizeTerrain(state.map),
    elevation: summarizeElevation(state.map),
    game: summarizeGame(state.game),
    runtime: {
      uiScreen: state.uiScreen ?? 'menu',
      experienceMode: state.experienceMode ?? 'menu',
      paused: Boolean(state.paused),
      tickIntervalMs: state.simTickIntervalMs,
      gameAutosaveIntervalMs: state.gameAutosaveIntervalMs,
      showScenarioLayer: Boolean(state.showScenarioLayer),
      motionSmoothing: {
        active: Boolean(state.renderMotion?.active),
        progress: Number(state.renderMotion?.progress ?? 1)
      },
      mouse: state.mousePlaytest?.enabled
        ? {
          enabled: true,
          status: state.mousePlaytest.status ?? 'waiting',
          stateLabel: state.mousePlaytest.stateLabel ?? null,
          model: state.mousePlaytest.model ?? null,
          modelAvailable: Boolean(state.mousePlaytest.modelAvailable),
          currentMouseMode: state.mousePlaytest.currentMouseMode ?? 'waiting',
          latestThought: state.mousePlaytest.latestThought ?? null,
          latestAction: state.mousePlaytest.latestAction ?? null,
          latestActionStatus: state.mousePlaytest.latestActionStatus ?? null,
          recentActions: state.mousePlaytest.recentActions ?? [],
          updatedAt: state.mousePlaytest.updatedAt ?? null,
          flags: state.mousePlaytest.flags ?? []
        }
        : { enabled: false },
      worldAssets: summarizeWorldAssetLifecycle(state.map, state.game, state)
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


function normalisePlacementPath(path = []) {
  return Array.isArray(path)
    ? path
      .filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y))
      .map((point) => ({ x: Math.round(point.x), y: Math.round(point.y) }))
      .reduce((out, point) => {
        const previous = out[out.length - 1];
        if (!previous || previous.x !== point.x || previous.y !== point.y) {
          out.push(point);
        }
        return out;
      }, [])
    : [];
}

function createPlacementState() {
  return {
    active: false,
    selectedStructureType: null,
    mode: 'single',
    hoverPosition: null,
    path: [],
    pathPlan: null,
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
