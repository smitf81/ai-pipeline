import { TILE_TYPES, getTileType } from '../world/tilemap.js';
import { createTaskActorBase, nextEntityId } from '../entities/entityStore.js';
import { createWorldPosition } from '../world/coordinates.js';

export function spawnUnit(store, map, { type, x, y, z = 0, position = null, ...unitState }) {
  const worldPosition = createWorldPosition(position ?? { x, y, z });
  const tile = getTileType(map, worldPosition);
  if (!tile) {
    return { ok: false, error: 'Tile out of bounds.' };
  }
  if (!TILE_TYPES[tile].walkable) {
    return { ok: false, error: `Cannot spawn on ${tile}.` };
  }
  if (store.buildings.some((building) => building.x === worldPosition.x && building.y === worldPosition.y)) {
    return { ok: false, error: 'Tile is occupied by a building.' };
  }
  if (store.agent?.x === worldPosition.x && store.agent?.y === worldPosition.y) {
    return { ok: false, error: 'Tile is occupied by another actor.' };
  }
  if (store.units.some((unit) => unit.x === worldPosition.x && unit.y === worldPosition.y)) {
    return { ok: false, error: 'Tile is occupied by another actor.' };
  }

  const unit = createTaskActorBase({
    id: nextEntityId(store, 'unit'),
    type,
    position: worldPosition
  });
  Object.assign(unit, unitState);

  store.units.push(unit);
  return { ok: true, unit };
}
