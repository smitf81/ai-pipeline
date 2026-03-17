import { TILE_TYPES, getTileType } from '../world/tilemap.js';
import { nextEntityId } from '../entities/entityStore.js';

export function spawnUnit(store, map, { type, x, y }) {
  const tile = getTileType(map, x, y);
  if (!tile) {
    return { ok: false, error: 'Tile out of bounds.' };
  }
  if (!TILE_TYPES[tile].walkable) {
    return { ok: false, error: `Cannot spawn on ${tile}.` };
  }

  const unit = {
    id: nextEntityId(store, 'unit'),
    type,
    x,
    y,
    state: 'idle'
  };

  store.units.push(unit);
  return { ok: true, unit };
}
