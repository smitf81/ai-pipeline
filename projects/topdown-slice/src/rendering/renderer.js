import { BUILDING_STATE, BUILDING_TYPES } from '../buildings/buildings.js';
import { TILE_SIZE, TILE_TYPES } from '../world/tilemap.js';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function draw(state) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < state.map.height; y += 1) {
      for (let x = 0; x < state.map.width; x += 1) {
        const tileType = state.map.tiles[y][x];
        ctx.fillStyle = TILE_TYPES[tileType].color;
        ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        ctx.strokeStyle = '#00000033';
        ctx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }

    state.store.buildings.forEach((b) => {
      const color = BUILDING_TYPES[b.type]?.color ?? '#ffffff';
      const x = b.x * TILE_SIZE + 4;
      const y = b.y * TILE_SIZE + 4;
      const w = TILE_SIZE - 8;
      const h = TILE_SIZE - 8;

      if (b.state === BUILDING_STATE.UNDER_CONSTRUCTION) {
        ctx.fillStyle = `${color}99`;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#ffe56b';
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);

        const progress = Math.max(0, Math.min(1, (b.buildProgress ?? 0) / (b.buildRequired ?? 1)));
        ctx.fillStyle = '#00000088';
        ctx.fillRect(x, y + h + 2, w, 4);
        ctx.fillStyle = '#64ff7a';
        ctx.fillRect(x, y + h + 2, w * progress, 4);
      } else {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);
      }

      if (state.selectedBuildingId === b.id) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(b.x * TILE_SIZE + 3, b.y * TILE_SIZE + 3, TILE_SIZE - 6, TILE_SIZE - 6);
        ctx.lineWidth = 1;
      }
    });

    state.store.units.forEach((u) => {
      if (u.type === 'worker') {
        ctx.fillStyle = '#5ce1ff';
        ctx.fillRect(u.x * TILE_SIZE + 8, u.y * TILE_SIZE + 8, TILE_SIZE - 16, TILE_SIZE - 16);
        return;
      }

      ctx.fillStyle = '#ffe56b';
      ctx.beginPath();
      ctx.arc(u.x * TILE_SIZE + TILE_SIZE / 2, u.y * TILE_SIZE + TILE_SIZE / 2, 8, 0, Math.PI * 2);
      ctx.fill();
    });

    const a = state.store.agent;
    ctx.fillStyle = '#ff4dd1';
    ctx.beginPath();
    ctx.arc(a.x * TILE_SIZE + TILE_SIZE / 2, a.y * TILE_SIZE + TILE_SIZE / 2, 10, 0, Math.PI * 2);
    ctx.fill();

    if (state.preview) {
      ctx.fillStyle = state.preview.valid ? '#64ff7a88' : '#ff4d4d88';
      ctx.fillRect(state.preview.x * TILE_SIZE + 5, state.preview.y * TILE_SIZE + 5, TILE_SIZE - 10, TILE_SIZE - 10);
    }
  }

  return { draw };
}
