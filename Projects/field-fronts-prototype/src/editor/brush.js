import { getElevation, isInBounds, setElevation, setTile } from '../world/mapModel.js';

export const BRUSH_SHAPES = ['circle', 'square'];

export function createBrush(overrides = {}) {
  return {
    tool: 'terrain',
    terrainId: 'land',
    radius: 2,
    shape: 'circle',
    heightDelta: 0.04,
    heightDirection: 'raise',
    ...overrides
  };
}

export function getBrushTiles(map, centerX, centerY, brush) {
  const radius = Math.max(0, Number(brush.radius ?? 0));
  const tiles = [];

  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      if (!isInBounds(map, x, y)) {
        continue;
      }
      if (brush.shape === 'circle') {
        const dx = x - centerX;
        const dy = y - centerY;
        if (Math.sqrt(dx * dx + dy * dy) > radius + 0.2) {
          continue;
        }
      }
      tiles.push({ x, y });
    }
  }

  return tiles;
}

export function paintMap(map, centerX, centerY, brush) {
  const changes = [];
  getBrushTiles(map, centerX, centerY, brush).forEach(({ x, y }) => {
    const before = map.tiles[y][x];
    const beforeElevation = map.elevation?.[y]?.[x] ?? null;
    if (before === brush.terrainId) {
      return;
    }
    setTile(map, x, y, brush.terrainId);
    changes.push({
      x,
      y,
      before,
      after: brush.terrainId,
      beforeElevation,
      afterElevation: map.elevation?.[y]?.[x] ?? null
    });
  });

  return changes;
}

export function paintHeightMap(map, centerX, centerY, brush, options = {}) {
  const changes = [];
  const direction = options.direction ?? brush.heightDirection ?? 'raise';
  const sign = direction === 'lower' ? -1 : 1;
  const delta = Math.max(0.005, Math.min(0.25, Number(brush.heightDelta ?? 0.04))) * sign;

  getBrushTiles(map, centerX, centerY, brush).forEach(({ x, y }) => {
    const before = map.tiles[y][x];
    const beforeElevation = getElevation(map, x, y);
    const afterElevation = clamp01(beforeElevation + delta);
    if (Math.abs(afterElevation - beforeElevation) < 0.0005) {
      return;
    }
    setElevation(map, x, y, afterElevation);
    changes.push({
      x,
      y,
      before,
      after: before,
      beforeElevation,
      afterElevation
    });
  });

  return changes;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
