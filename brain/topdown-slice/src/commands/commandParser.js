import { TILE_TYPES } from '../world/tilemap.js';

export function parseCommand(input) {
  const normalized = input.trim().toLowerCase();

  const spawnWorkerMatch = normalized.match(/^spawn worker at (\d+) (\d+)$/);
  if (spawnWorkerMatch) {
    return { ok: true, command: { kind: 'spawn-worker', x: Number(spawnWorkerMatch[1]), y: Number(spawnWorkerMatch[2]) } };
  }

  const spawnMatch = normalized.match(/^spawn unit (\w+) at (\d+) (\d+)$/);
  if (spawnMatch) {
    return { ok: true, command: { kind: 'spawn-unit', unitType: spawnMatch[1], x: Number(spawnMatch[2]), y: Number(spawnMatch[3]) } };
  }

  const placeMatch = normalized.match(/^place building (\w+) at (\d+) (\d+)$/);
  if (placeMatch) {
    return { ok: true, command: { kind: 'place-building', buildingType: placeMatch[1], x: Number(placeMatch[2]), y: Number(placeMatch[3]) } };
  }

  const moveMatch = normalized.match(/^move agent to (\d+) (\d+)$/);
  if (moveMatch) {
    return { ok: true, command: { kind: 'move-agent', x: Number(moveMatch[1]), y: Number(moveMatch[2]) } };
  }

  const assignMoveMatch = normalized.match(/^assign worker ([a-z0-9-]+) move to (\d+) (\d+)$/);
  if (assignMoveMatch) {
    return {
      ok: true,
      command: {
        kind: 'assign-worker-task',
        workerId: assignMoveMatch[1],
        taskSpec: {
          type: 'moveTo',
          target: { x: Number(assignMoveMatch[2]), y: Number(assignMoveMatch[3]) },
          payload: {}
        }
      }
    };
  }

  const assignBuildMatch = normalized.match(/^assign worker ([a-z0-9-]+) build (\w+) at (\d+) (\d+)$/);
  if (assignBuildMatch) {
    return {
      ok: true,
      command: {
        kind: 'assign-worker-task',
        workerId: assignBuildMatch[1],
        taskSpec: {
          type: 'placeBuilding',
          target: { x: Number(assignBuildMatch[3]), y: Number(assignBuildMatch[4]) },
          payload: { buildingType: assignBuildMatch[2] }
        }
      }
    };
  }

  const assignPaintMatch = normalized.match(/^assign worker ([a-z0-9-]+) paint tile (\d+) (\d+) as (\w+)$/);
  if (assignPaintMatch) {
    const tileType = assignPaintMatch[4];
    if (!TILE_TYPES[tileType]) {
      return { ok: false, error: `Unknown tile type: ${tileType}. Valid types: ${Object.keys(TILE_TYPES).join(', ')}` };
    }

    return {
      ok: true,
      command: {
        kind: 'assign-worker-task',
        workerId: assignPaintMatch[1],
        taskSpec: {
          type: 'paintTile',
          target: { x: Number(assignPaintMatch[2]), y: Number(assignPaintMatch[3]) },
          payload: { tileType }
        }
      }
    };
  }

  const deleteMatch = normalized.match(/^delete building ([a-z0-9-]+)$/);
  if (deleteMatch) {
    return { ok: true, command: { kind: 'delete-building', id: deleteMatch[1] } };
  }

  const paintMatch = normalized.match(/^paint tile (\d+) (\d+) as (\w+)$/);
  if (paintMatch) {
    const tileType = paintMatch[3];
    if (!TILE_TYPES[tileType]) {
      return { ok: false, error: `Unknown tile type: ${tileType}. Valid types: ${Object.keys(TILE_TYPES).join(', ')}` };
    }
    return { ok: true, command: { kind: 'paint-tile', x: Number(paintMatch[1]), y: Number(paintMatch[2]), tileType } };
  }

  const setStrategyMatch = normalized.match(/^set assignment strategy (manual|nearest_worker|least_loaded_worker)$/);
  if (setStrategyMatch) {
    return { ok: true, command: { kind: 'set-assignment-strategy', strategy: setStrategyMatch[1] } };
  }

  if (normalized === 'show assignment strategy') {
    return { ok: true, command: { kind: 'show-assignment-strategy' } };
  }

  if (normalized === 'list workers') {
    return { ok: true, command: { kind: 'list-workers' } };
  }

  return {
    ok: false,
    error:
      'Unknown command. Try: spawn worker at 5 5 | assign worker unit-001 move to 8 6 | set assignment strategy nearest_worker | show assignment strategy | list workers'
  };
}
