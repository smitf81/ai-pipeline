import { isInBounds } from '../world/mapModel.js';
import { updateStructurePlacementPreview } from '../editor/editorState.js';
import { getSelectedGameEntity, issuePlayerMoveCommand, issueSquadOccupyStructureAtTile, probeMapAt, selectPlayerControllableEntityAtTile } from '../game/gameModel.js';
import { COMMAND_WHEEL_ACTIONS, getCommandWheelAction, resolveCommandWheelHover } from '../game/commandWheel.js';
import { createRouteFeedback } from '../game/playtestStabilization.js';

const ORDER_WHEEL_HOLD_MS = 260;

export function attachPointerController(canvas, renderer, state, bus) {
  let painting = false;
  let movementDrag = null;
  let placementDrag = null;
  let rightOrder = null;
  let tacticalPanDrag = null;

  function resolveTile(event) {
    const tile = renderer.screenToTile(event.clientX, event.clientY);
    return isInBounds(state.map, tile.x, tile.y) ? tile : null;
  }

  canvas.addEventListener('pointerdown', (event) => {
    const tile = resolveTile(event);
    if (event.button === 1 && state.mode === 'play' && isTacticalLeashCamera()) {
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      tacticalPanDrag = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPan: state.tacticalCameraPan ?? { x: 0, y: 0 }
      };
      return;
    }
    if (event.button === 2 && state.placement?.active) {
      event.preventDefault();
      bus.emit('placement:cancel');
      return;
    }
    if (event.button === 2) {
      event.preventDefault();
      beginRightOrder(event, tile);
      return;
    }
    if (!tile) {
      return;
    }
    if (state.mode === 'edit' && state.scenePlacementTool) {
      event.preventDefault();
      state.selectedTile = tile;
      state.hoverTile = tile;
      bus.emit('scenario:place-entity', { tile });
      return;
    }
    if (state.mode === 'play' && state.placement?.active) {
      event.preventDefault();
      if (state.placement.mode === 'path') {
        canvas.setPointerCapture(event.pointerId);
        placementDrag = {
          startTile: tile,
          path: [tile],
          active: false
        };
        updateStructurePlacementPreview(state, tile, { path: placementDrag.path });
        bus.emit('render');
        return;
      }
      updateStructurePlacementPreview(state, tile);
      bus.emit('placement:place', { tile });
      return;
    }
    canvas.setPointerCapture(event.pointerId);
    state.selectedTile = tile;
    state.hoverTile = tile;

    if (state.mode === 'play') {
      const selectedBeforeClick = getSelectedGameEntity(state.game);
      if (selectedBeforeClick?.type === 'squad' && selectedBeforeClick.factionId === 'player') {
        const occupyResult = issueSquadOccupyStructureAtTile(state.game, state.map, selectedBeforeClick.id, tile);
        if (occupyResult.ok) {
          movementDrag = null;
          state.intentPreview = null;
          state.gameDirty = true;
          const structureName = occupyResult.structure?.name ?? 'structure';
          state.status = occupyResult.mode === 'entered'
            ? `${selectedBeforeClick.name} occupied ${structureName}`
            : `${selectedBeforeClick.name} moving to occupy ${structureName}`;
          bus.emit('render');
          return;
        }
      }

      const previousSelectedEntityId = state.game.selectedEntityId;
      const existingSelected = getSelectedGameEntity(state.game);
      const groundProbe = probeMapAt(state.game, state.map, tile);
      if (isPlayerMovementCommandable(existingSelected) && !groundProbe.entity) {
        movementDrag = {
          entityId: existingSelected.id,
          startTile: tile,
          path: [existingSelected.position ?? existingSelected.tile, tile],
          active: false
        };
        state.intentPreview = {
          entityId: existingSelected.id,
          path: movementDrag.path,
          mode: 'painted-path'
        };
        state.routeFeedback = createRouteFeedback(movementDrag.path);
        state.status = `Paint path for ${existingSelected.name ?? 'unit'}`;
        bus.emit('render');
        return;
      }
      const selection = selectPlayerControllableEntityAtTile(state.game, tile);
      const entity = selection.entity;
      if (state.game.selectedEntityId !== previousSelectedEntityId) {
        state.gameDirty = true;
      }
      if (selection.rejected) {
        movementDrag = null;
        state.intentPreview = null;
        state.status = selection.message ?? 'That entity cannot be commanded.';
        bus.emit('render');
        return;
      }
      if ((entity?.type === 'leader' || entity?.type === 'squad') && entity.factionId === 'player') {
        movementDrag = {
          entityId: entity.id,
          startTile: tile,
          path: [entity.position ?? entity.tile, tile],
          active: false
        };
        state.intentPreview = {
          entityId: entity.id,
          path: movementDrag.path
        };
      } else {
        movementDrag = null;
        state.intentPreview = null;
      }
      state.status = entity ? `${entity.name} selected` : `Selected tile ${tile.x}, ${tile.y}`;
      bus.emit('render');
      return;
    }

    painting = true;
    bus.emit('paint', { tile, lower: event.ctrlKey, isDragging: true });
  });

  canvas.addEventListener('pointermove', (event) => {
    const tile = resolveTile(event);
    state.hoverTile = tile;
    if (tacticalPanDrag) {
      updateTacticalPan(event);
      bus.emit('render');
      return;
    }
    if (rightOrder) {
      if (tile) {
        rightOrder.tile = tile;
      }
      if (rightOrder.wheelOpen) {
        updateRightOrderHover(event);
      }
      bus.emit('render');
      return;
    }
    if (state.mode === 'play' && state.placement?.active) {
      if (state.placement.mode === 'path' && placementDrag && tile) {
        appendIntentTile(placementDrag.path, tile);
        placementDrag.active = placementDrag.active || tileDistance(placementDrag.startTile, tile) >= 1.15;
        updateStructurePlacementPreview(state, tile, { path: placementDrag.path });
      } else {
        updateStructurePlacementPreview(state, tile);
      }
      bus.emit('render');
      return;
    }
    if (state.mode === 'play' && movementDrag && tile) {
      appendIntentTile(movementDrag.path, tile);
      movementDrag.active = movementDrag.active || tileDistance(movementDrag.startTile, tile) >= 1.15;
      state.intentPreview = {
        entityId: movementDrag.entityId,
        path: movementDrag.path,
        mode: 'painted-path'
      };
      state.routeFeedback = createRouteFeedback(movementDrag.path);
      state.status = movementDrag.active
        ? `Movement intent: hold ${tile.x}, ${tile.y}`
        : `${getSelectedGameEntity(state.game)?.name ?? 'Unit'} selected`;
      bus.emit('render');
      return;
    }
    if (state.mode === 'edit' && painting && tile) {
      bus.emit('paint', { tile, lower: event.ctrlKey, isDragging: true });
    } else {
      bus.emit('render');
    }
  });

  canvas.addEventListener('pointerup', (event) => {
    if (event.button === 1 && tacticalPanDrag) {
      tacticalPanDrag = null;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      bus.emit('render');
      return;
    }
    if (event.button === 2 && rightOrder) {
      event.preventDefault();
      finishRightOrder(event);
      return;
    }
    const wasPainting = painting;
    painting = false;
    if (wasPainting) {
      bus.emit('paint:end');
    }
    if (state.mode === 'play' && state.placement?.active && placementDrag) {
      const path = placementDrag.path;
      const target = path[path.length - 1] ?? placementDrag.startTile;
      bus.emit('placement:place-path', { path, tile: target });
      placementDrag = null;
    }
    if (state.mode === 'play' && movementDrag) {
      if (movementDrag.active && movementDrag.path.length >= 2) {
        const result = issuePlayerMoveCommand(state.game, state.map, movementDrag.entityId, movementDrag.path);
        const target = movementDrag.path[movementDrag.path.length - 1];
        state.gameDirty = result.ok;
        state.routeFeedback = createRouteFeedback(movementDrag.path);
        state.status = result.ok
          ? `Movement intent injected: hold ${target.x}, ${target.y}`
          : result.message ?? 'Move order rejected.';
      }
      movementDrag = null;
      state.intentPreview = null;
    }
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    bus.emit('render');
  });

  canvas.addEventListener('pointerleave', () => {
    const wasPainting = painting;
    painting = false;
    if (wasPainting) {
      bus.emit('paint:end');
    }
    movementDrag = null;
    placementDrag = null;
    tacticalPanDrag = null;
    clearRightOrder();
    state.intentPreview = null;
    state.routeFeedback = null;
    state.hoverTile = null;
    updateStructurePlacementPreview(state, null);
    bus.emit('render');
  });

  canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    if (state.placement?.active) {
      bus.emit('placement:cancel');
    }
  });

  canvas.addEventListener('pointercancel', () => {
    tacticalPanDrag = null;
    clearRightOrder();
    bus.emit('render');
  });

  function beginRightOrder(event, tile) {
    clearRightOrder();
    if (!tile || state.mode !== 'play') {
      return;
    }
    const selected = getSelectedGameEntity(state.game);
    const canMove = isPlayerMovementCommandable(selected);
    const context = getOrderContext(tile);
    if (!canMove && context.kind !== 'structure') {
      state.status = 'Select a friendly unit before giving a move order.';
      bus.emit('render');
      return;
    }
    if (canvas.setPointerCapture) {
      canvas.setPointerCapture(event.pointerId);
    }
    rightOrder = {
      pointerId: event.pointerId,
      tile,
      clientX: event.clientX,
      clientY: event.clientY,
      context,
      canMove,
      wheelOpen: false,
      holdTimer: window.setTimeout(() => {
        if (!rightOrder) {
          return;
        }
        rightOrder.wheelOpen = true;
        const highlightedAction = getCommandWheelAction('move_to_target');
        rightOrder.highlightedActionId = highlightedAction?.id ?? 'move_to_target';
        state.orderWheel = {
          active: true,
          position: { x: rightOrder.clientX, y: rightOrder.clientY },
          tile: rightOrder.tile,
          context: rightOrder.context,
          moveEnabled: rightOrder.canMove,
          highlightedActionId: rightOrder.highlightedActionId,
          highlightedLabel: highlightedAction?.label ?? 'Move'
        };
        state.status = rightOrder.context.kind === 'structure'
          ? `Order wheel: ${rightOrder.context.label}`
          : 'Order wheel: hover an order, release to confirm';
        bus.emit('render');
      }, ORDER_WHEEL_HOLD_MS)
    };
  }

  function finishRightOrder(event) {
    const order = rightOrder;
    if (!order) {
      return;
    }
    clearRightOrder({ keepWheel: true });
    const tile = order.tile;
    if (order.wheelOpen) {
      const action = getCommandWheelAction(order.highlightedActionId ?? state.orderWheel?.highlightedActionId ?? 'move_to_target') ?? getCommandWheelAction('move_to_target');
      const enabled = action && (order.canMove || action.id === 'distract');
      if (enabled) {
        bus.emit('orders:survival-intent', {
          actionId: action.id,
          intentType: action.intentType,
          priority: action.priority,
          tile,
          source: 'command-wheel-release'
        });
        state.status = `${action.label}: issued on release.`;
      } else {
        state.status = 'Select a friendly unit before giving a survival order.';
      }
      state.orderWheel = null;
    } else if (order.canMove) {
      issueQuickMove(tile, 'right-click');
      state.orderWheel = null;
    } else {
      state.status = order.context.kind === 'structure'
        ? `${order.context.label}: contextual orders pending.`
        : 'Select a friendly unit before giving a move order.';
      state.orderWheel = null;
    }
    if (canvas.hasPointerCapture?.(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    bus.emit('render');
  }


  function updateRightOrderHover(event) {
    if (!rightOrder?.wheelOpen) {
      return;
    }
    const action = resolveCommandWheelHover(
      { x: rightOrder.clientX, y: rightOrder.clientY },
      { x: event.clientX, y: event.clientY },
      { actions: COMMAND_WHEEL_ACTIONS, fallbackActionId: 'move_to_target' }
    );
    const enabled = action && (rightOrder.canMove || action.id === 'distract');
    rightOrder.highlightedActionId = enabled ? action.id : null;
    state.orderWheel = {
      ...(state.orderWheel ?? {}),
      active: true,
      position: { x: rightOrder.clientX, y: rightOrder.clientY },
      tile: rightOrder.tile,
      context: rightOrder.context,
      moveEnabled: rightOrder.canMove,
      highlightedActionId: rightOrder.highlightedActionId,
      highlightedLabel: enabled ? action.label : 'Unavailable'
    };
    state.status = enabled
      ? `Order wheel: release for ${action.label}`
      : 'Order wheel: command unavailable';
  }

  function issueQuickMove(tile, source) {
    const selected = getSelectedGameEntity(state.game);
    if (!tile || !isPlayerMovementCommandable(selected)) {
      state.status = 'Select a friendly unit before giving a move order.';
      return;
    }
    const start = selected.position ?? selected.tile;
    const result = issuePlayerMoveCommand(state.game, state.map, selected.id, [start, tile]);
    movementDrag = null;
    state.intentPreview = null;
    state.gameDirty = result.ok;
    state.status = result.ok
      ? `${selected.name ?? 'Unit'} ${source === 'wheel' ? 'MoveTo' : 'move'}: ${tile.x}, ${tile.y}`
      : result.message ?? 'Move order rejected.';
  }

  function clearRightOrder({ keepWheel = false } = {}) {
    if (rightOrder?.holdTimer) {
      window.clearTimeout(rightOrder.holdTimer);
    }
    rightOrder = null;
    if (!keepWheel) {
      state.orderWheel = null;
    }
  }

  function isTacticalLeashCamera() {
    return state.scenarioCamera?.mode === 'commander_follow_tactical_leash';
  }

  function updateTacticalPan(event) {
    if (!tacticalPanDrag) {
      return;
    }
    const tileSize = Math.max(1, Number(renderer.getView?.().tileSize) || 1);
    state.tacticalCameraPan = {
      x: tacticalPanDrag.startPan.x - (event.clientX - tacticalPanDrag.startClientX) / tileSize,
      y: tacticalPanDrag.startPan.y - (event.clientY - tacticalPanDrag.startClientY) / tileSize
    };
  }

  function getOrderContext(tile) {
    const probe = probeMapAt(state.game, state.map, tile);
    const entity = probe.entity ? findGameEntityById(probe.entity.id) : null;
    if (probe.entity?.type === 'structure') {
      return {
        kind: 'structure',
        label: entity?.name ?? 'Structure',
        sublabel: probe.entity.factionId === 'player' ? 'Friendly structure' : 'Structure'
      };
    }
    if (probe.entity) {
      return {
        kind: probe.entity.type ?? 'entity',
        label: entity?.name ?? 'Unit',
        sublabel: probe.entity.factionId === 'player' ? 'Friendly' : 'Uncommanded'
      };
    }
    return {
      kind: 'terrain',
      label: `${probe.terrain ?? 'Terrain'} ${tile.x}, ${tile.y}`,
      sublabel: probe.blocked ? 'Blocked terrain' : 'Open ground'
    };
  }

  function findGameEntityById(id) {
    return [
      ...(state.game?.leaders ?? []),
      ...(state.game?.squads ?? []),
      ...(state.game?.structures ?? []),
      ...(state.game?.builders ?? []),
      ...(state.game?.resourceWorkers ?? []),
      ...(state.game?.transports ?? [])
    ].find((entity) => entity.id === id) ?? null;
  }
}

function appendIntentTile(path, tile) {
  const previous = path[path.length - 1];
  if (!previous || tileDistance(previous, tile) >= 0.75) {
    path.push(tile);
  } else {
    path[path.length - 1] = tile;
  }
}

function tileDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isPlayerMovementCommandable(entity) {
  return Boolean(entity && entity.factionId === 'player' && ['leader', 'squad'].includes(entity.type));
}
