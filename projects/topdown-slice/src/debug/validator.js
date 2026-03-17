import { TILE_TYPES, getTileType } from '../world/tilemap.js';

export function runValidation(state) {
  const messages = [];

  if (state.map.tiles.length !== state.map.height) {
    messages.push({ level: 'error', text: 'Map height does not match tile rows.' });
  }

  const badRow = state.map.tiles.find((row) => row.length !== state.map.width);
  if (badRow) {
    messages.push({ level: 'error', text: 'Map width does not match one or more rows.' });
  }

  const ids = new Set();
  [...state.store.units, ...state.store.buildings, state.store.agent].forEach((entity) => {
    if (ids.has(entity.id)) {
      messages.push({ level: 'error', text: `Duplicate entity id found: ${entity.id}` });
    }
    ids.add(entity.id);
  });

  const occupied = new Set();
  state.store.buildings.forEach((building) => {
    const key = `${building.x},${building.y}`;
    if (occupied.has(key)) {
      messages.push({ level: 'error', text: `Building overlap at ${key}` });
    }
    occupied.add(key);

    const tile = getTileType(state.map, building.x, building.y);
    if (!tile || !TILE_TYPES[tile].buildable) {
      messages.push({ level: 'error', text: `Building ${building.id} is on invalid tile.` });
    }

    const progress = building.buildProgress ?? 0;
    const required = building.buildRequired ?? 1;
    if (progress < 0 || progress > required) {
      messages.push({ level: 'error', text: `Building ${building.id} has invalid build progress.` });
    }
  });

  if (messages.length === 0) {
    messages.push({ level: 'ok', text: 'All validation checks passed.' });
  }

  return messages;
}
