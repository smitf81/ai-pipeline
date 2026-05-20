import { isInBounds } from '../world/mapModel.js';
import { updateStructurePlacementPreview } from '../editor/editorState.js';
import { getSelectedGameEntity, selectGameEntityAtTile, setPlayerMovementIntent } from '../game/gameModel.js';

export function attachPointerController(canvas, renderer, state, bus) {
  let painting = false;
  let movementDrag = null;

  function resolveTile(event) {
    const tile = renderer.screenToTile(event.clientX, event.clientY);
    return isInBounds(state.map, tile.x, tile.y) ? tile : null;
  }

  canvas.addEventListener('pointerdown', (event) => {
    const tile = resolveTile(event);
    if (event.button === 2 && state.placement?.active) {
      event.preventDefault();
      bus.emit('placement:cancel');
      return;
    }
    if (!tile) {
      return;
    }
    if (state.mode === 'play' && state.placement?.active) {
      event.preventDefault();
      updateStructurePlacementPreview(state, tile);
      bus.emit('placement:place', { tile });
      return;
    }
    canvas.setPointerCapture(event.pointerId);
    state.selectedTile = tile;
    state.hoverTile = tile;

    if (state.mode === 'play') {
      const previousSelectedEntityId = state.game.selectedEntityId;
      const entity = selectGameEntityAtTile(state.game, tile);
      if (state.game.selectedEntityId !== previousSelectedEntityId) {
        state.gameDirty = true;
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
    if (state.mode === 'play' && state.placement?.active) {
      updateStructurePlacementPreview(state, tile);
      bus.emit('render');
      return;
    }
    if (state.mode === 'play' && movementDrag && tile) {
      appendIntentTile(movementDrag.path, tile);
      movementDrag.active = movementDrag.active || tileDistance(movementDrag.startTile, tile) >= 1.15;
      state.intentPreview = {
        entityId: movementDrag.entityId,
        path: movementDrag.path
      };
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
    const wasPainting = painting;
    painting = false;
    if (wasPainting) {
      bus.emit('paint:end');
    }
    if (state.mode === 'play' && movementDrag) {
      if (movementDrag.active && movementDrag.path.length >= 2) {
        setPlayerMovementIntent(state.game, state.map, movementDrag.entityId, movementDrag.path);
        const target = movementDrag.path[movementDrag.path.length - 1];
        state.gameDirty = true;
        state.status = `Movement intent injected: hold ${target.x}, ${target.y}`;
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
    state.intentPreview = null;
    state.hoverTile = null;
    updateStructurePlacementPreview(state, null);
    bus.emit('render');
  });

  canvas.addEventListener('contextmenu', (event) => {
    if (state.placement?.active) {
      event.preventDefault();
      bus.emit('placement:cancel');
    }
  });
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
