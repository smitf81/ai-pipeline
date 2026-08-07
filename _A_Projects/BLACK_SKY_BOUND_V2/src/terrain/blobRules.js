import { buildConnectionMask, resolveConnectedRule } from './connectedRules.js';

export function paintTerrainBlob(map, { cx, cy, radius, type, roughness = 0.18 }) {
  const painted = [];
  for (let y = Math.floor(cy - radius - 1); y <= Math.ceil(cy + radius + 1); y += 1) {
    for (let x = Math.floor(cx - radius - 1); x <= Math.ceil(cx + radius + 1); x += 1) {
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      const dx = x - cx;
      const dy = y - cy;
      const wobble = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const noise = (wobble - Math.floor(wobble) - 0.5) * roughness * radius;
      if (Math.hypot(dx, dy) + noise <= radius) {
        map.tiles[y][x] = type;
        painted.push({ x, y });
      }
    }
  }
  return painted;
}

export function buildTerrainBlobMasks(map, type) {
  const occupied = new Set();
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      if (map.tiles[y][x] === type) occupied.add(`${x},${y}`);
    }
  }
  return [...occupied].map((key) => {
    const [x, y] = key.split(',').map(Number);
    const mask = buildConnectionMask({ x, y }, occupied);
    return { x, y, type, mask, rule: resolveConnectedRule(mask) };
  });
}
