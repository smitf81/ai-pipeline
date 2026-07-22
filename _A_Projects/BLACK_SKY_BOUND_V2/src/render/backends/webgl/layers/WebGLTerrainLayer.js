import { parseWebGLColor, withAlpha } from '../WebGLColor.js';
import { WEBGL_LIGHT_SPACE_GATE_MODE, lightSpaceAlphaForWorldCircle } from '../WebGLLightSpaceGate.js';
import { adaptMaterialToWebGL } from '../WebGLMaterialAdapter.js';

const WEBGL_TERRAIN_MODE = 'webgl_connected_terrain_16mask_spline_texture_v1';
const CONNECTED_TERRAIN_TYPES = Object.freeze(new Set(['grass', 'dirt']));
const TERRAIN_TEXTURE_PIXELS_PER_TILE = 12;
const TERRAIN_TEXTURE_MAX_SIZE = 2048;
const TERRAIN_MASK_SHARPNESS = 1.45;

export class WebGLTerrainLayer {
  constructor() {
    this.id = 'terrain';
    this.status = 'inactive';
    this.mode = WEBGL_TERRAIN_MODE;
    this.objectCount = 0;
    this.rects = [];
    this.detailRects = [];
    this.detailTriangles = [];
    this.detailRadials = [];
    this.sourceCount = 0;
    this.lightSpaceGateActive = false;
    this.lightSpaceCulledCount = 0;
    this.texture = null;
    this.textureCanvas = null;
    this.textureKey = null;
    this.textureQuad = null;
    this.textureActive = false;
    this.textureDisabledByRuntime = false;
    this.textureUploadCount = 0;
  }

  update(projection, context) {
    const terrain = projection.terrain;
    const bounds = context.camera.visibleWorldBounds(64);
    this.rects = [];
    this.detailRects = [];
    this.detailTriangles = [];
    this.detailRadials = [];
    this.sourceCount = terrain.tiles.length;
    this.lightSpaceGateActive = !!context.lightSpaceCulling?.enabled;
    this.lightSpaceCulledCount = 0;
    this.textureDisabledByRuntime = terrainTextureDisabledByRuntime();
    this.textureQuad = this.textureDisabledByRuntime ? null : ensureTerrainTexture(this, terrain, context.gl);
    this.textureActive = !!this.textureQuad;

    for (const tile of terrain.tiles) {
      if (tile.worldX + tile.width < bounds.left || tile.worldY + tile.height < bounds.top
        || tile.worldX > bounds.right || tile.worldY > bounds.bottom) {
        continue;
      }
      if (!this.textureActive) this.rects.push(fallbackTileRect(tile));
      if (shouldDrawConnectedTerrain(tile)) {
        const detailAlpha = lightSpaceAlphaForWorldCircle(
          context,
          tile.worldX + tile.width * 0.5,
          tile.worldY + tile.height * 0.5,
          Math.max(tile.width, tile.height) * 0.72
        );
        if (detailAlpha <= 0.015) {
          this.lightSpaceCulledCount += 1;
          continue;
        }
        addConnectedTerrainPrimitives(
          tile,
          detailPalette(tile, detailAlpha),
          this.detailRects,
          this.detailTriangles,
          this.detailRadials
        );
      }
    }
    this.objectCount = this.textureActive ? 1 : this.rects.length;
    this.status = this.sourceCount > 0 ? 'active' : 'inactive';
  }

  render(context) {
    if (!this.textureQuad && !this.rects.length) return;
    if (this.textureQuad) context.scene.drawWorldTexture(this.textureQuad, context.camera);
    else context.scene.drawRects(this.rects, context.camera);
    if (this.detailRadials.length) context.scene.drawWorldRadialDiscs(this.detailRadials, context.camera);
    if (this.detailRects.length) context.scene.drawRects(this.detailRects, context.camera);
    if (this.detailTriangles.length) context.scene.drawTriangles(this.detailTriangles, context.camera);
  }

  statsFields() {
    const basePrimitiveCount = this.textureActive ? 1 : this.rects.length;
    return {
      mode: this.mode,
      sourceCount: this.sourceCount,
      primitiveCount: basePrimitiveCount + this.detailRects.length + this.detailTriangles.length + this.detailRadials.length,
      rectCount: (this.textureActive ? 0 : this.rects.length) + this.detailRects.length,
      triangleCount: this.detailTriangles.length,
      radialCount: this.detailRadials.length,
      terrainTextureActive: this.textureActive,
      terrainTextureDisabledByRuntime: this.textureDisabledByRuntime,
      terrainTextureUploadCount: this.textureUploadCount,
      terrainTextureKey: this.textureKey,
      lightSpaceMode: this.lightSpaceGateActive ? WEBGL_LIGHT_SPACE_GATE_MODE : null,
      lightSpaceCullingActive: this.lightSpaceGateActive,
      lightSpaceCulledCount: this.lightSpaceCulledCount
    };
  }
}

function fallbackTileRect(tile) {
  const base = adaptMaterialToWebGL(tile.material, parseWebGLColor(tile.colour, [0.18, 0.28, 0.16, 1])).baseColor;
  const alpha = tile.obscures ? 0.9 : 0.98;
  const bleed = 0.35;
  return {
    x: tile.worldX - bleed,
    y: tile.worldY - bleed,
    w: tile.width + bleed * 2,
    h: tile.height + bleed * 2,
    color: withAlpha(base, alpha)
  };
}

function shouldDrawConnectedTerrain(tile) {
  return CONNECTED_TERRAIN_TYPES.has(tile.type) && tile.connectedRule && tile.terrainSpline;
}

function addConnectedTerrainPrimitives(tile, palette, rects, triangles, radials) {
  if (tile.type !== 'dirt') return;
  const directions = new Set(tile.connectedRule.directions ?? []);
  addExposedBoundaryRadials(tile, directions, palette.boundary, radials);
  addExposedEdgeBands(tile, directions, palette.edge, rects);
  addExposedCornerTriangles(tile, directions, palette.corner, triangles);
  addSurfaceMottle(tile, palette.mottle, radials);
}

function addExposedBoundaryRadials(tile, directions, color, radials) {
  const radius = Math.max(8, tile.width * 0.58);
  const x = tile.worldX;
  const y = tile.worldY;
  const cx = x + tile.width * 0.5;
  const cy = y + tile.height * 0.5;
  if (!directions.has('n')) addRadial(radials, cx, y + tile.height * 0.08, radius, 0.72, color);
  if (!directions.has('s')) addRadial(radials, cx, y + tile.height * 0.92, radius, 0.72, color);
  if (!directions.has('w')) addRadial(radials, x + tile.width * 0.08, cy, radius, 0.72, color);
  if (!directions.has('e')) addRadial(radials, x + tile.width * 0.92, cy, radius, 0.72, color);
}

function addExposedEdgeBands(tile, directions, color, rects) {
  const band = Math.max(1.25, tile.width * 0.052);
  if (!directions.has('n')) addRect(rects, tile.worldX, tile.worldY, tile.width, band, color);
  if (!directions.has('s')) addRect(rects, tile.worldX, tile.worldY + tile.height - band, tile.width, band, color);
  if (!directions.has('w')) addRect(rects, tile.worldX, tile.worldY, band, tile.height, color);
  if (!directions.has('e')) addRect(rects, tile.worldX + tile.width - band, tile.worldY, band, tile.height, color);
}

function addExposedCornerTriangles(tile, directions, color, triangles) {
  const x = tile.worldX;
  const y = tile.worldY;
  const w = tile.width;
  const h = tile.height;
  const inset = Math.max(3, Math.min(w, h) * 0.32);
  if (!directions.has('n') && !directions.has('w')) addTriangle(triangles, x, y, x + inset, y, x, y + inset, color);
  if (!directions.has('n') && !directions.has('e')) addTriangle(triangles, x + w, y, x + w - inset, y, x + w, y + inset, color);
  if (!directions.has('s') && !directions.has('e')) addTriangle(triangles, x + w, y + h, x + w - inset, y + h, x + w, y + h - inset, color);
  if (!directions.has('s') && !directions.has('w')) addTriangle(triangles, x, y + h, x + inset, y + h, x, y + h - inset, color);
}

function addSurfaceMottle(tile, color, radials) {
  const seed = seededNoise(tile.x, tile.y);
  if (seed < 0.3) return;
  const radius = tile.width * (0.08 + seed * 0.12);
  const x = tile.worldX + tile.width * (0.22 + seededNoise(tile.y, tile.x) * 0.52);
  const y = tile.worldY + tile.height * (0.24 + seed * 0.46);
  addRadial(radials, x, y, radius, 0.68, color);
}

function detailPalette(tile, lightAlpha) {
  const alpha = Math.max(0, Math.min(1, lightAlpha));
  if (tile.type === 'dirt') {
    return {
      boundary: withAlpha([0.34, 0.22, 0.11, 1], 0.18 * alpha),
      edge: withAlpha([0.16, 0.1, 0.052, 1], 0.16 * alpha),
      corner: withAlpha([0.58, 0.42, 0.24, 1], 0.13 * alpha),
      mottle: withAlpha([0.74, 0.56, 0.34, 1], 0.11 * alpha)
    };
  }
  return {
    boundary: withAlpha([0.1, 0.18, 0.1, 1], 0.08 * alpha),
    edge: withAlpha([0.08, 0.14, 0.085, 1], 0.08 * alpha),
    corner: withAlpha([0.23, 0.34, 0.17, 1], 0.06 * alpha),
    mottle: withAlpha([0.2, 0.32, 0.17, 1], 0.04 * alpha)
  };
}

function ensureTerrainTexture(layer, terrain, gl) {
  if (!gl || typeof document === 'undefined' || !terrain?.tiles?.length) return null;
  const tilePixels = chooseTexturePixelsPerTile(terrain);
  const width = Math.max(1, terrain.mapWidth * tilePixels);
  const height = Math.max(1, terrain.mapHeight * tilePixels);
  const key = terrainTextureKey(terrain, tilePixels, width, height);
  if (!layer.textureCanvas) layer.textureCanvas = document.createElement('canvas');
  if (layer.textureCanvas.width !== width || layer.textureCanvas.height !== height) {
    layer.textureCanvas.width = width;
    layer.textureCanvas.height = height;
    layer.textureKey = null;
  }
  if (!layer.texture || layer.textureKey !== key) {
    renderTerrainTexture(layer.textureCanvas, terrain, tilePixels);
    uploadTerrainTexture(layer, gl, layer.textureCanvas);
    layer.textureKey = key;
    layer.textureUploadCount += 1;
  }
  return {
    texture: layer.texture,
    x: 0,
    y: 0,
    w: terrain.worldWidth,
    h: terrain.worldHeight
  };
}

function chooseTexturePixelsPerTile(terrain) {
  const longestAxis = Math.max(1, terrain.mapWidth, terrain.mapHeight);
  return Math.max(4, Math.min(TERRAIN_TEXTURE_PIXELS_PER_TILE, Math.floor(TERRAIN_TEXTURE_MAX_SIZE / longestAxis)));
}

function terrainTextureKey(terrain, tilePixels, width, height) {
  let hash = 2166136261;
  for (const tile of terrain.tiles) {
    hash ^= terrainTypeHash(tile.type);
    hash ^= terrainTypeHash(tile.material?.profileId ?? '');
    hash = Math.imul(hash, 16777619);
  }
  return `${terrain.mapWidth}:${terrain.mapHeight}:${terrain.revision}:${tilePixels}:${width}:${height}:${hash >>> 0}`;
}

function terrainTypeHash(type) {
  const text = String(type ?? 'grass');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  return hash;
}

function uploadTerrainTexture(layer, gl, canvas) {
  if (!layer.texture) layer.texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, layer.texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
}

function renderTerrainTexture(canvas, terrain, tilePixels) {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;
  const image = ctx.createImageData(canvas.width, canvas.height);
  const grid = buildTerrainGrid(terrain);
  const palette = buildTerrainPalette(terrain);
  for (let py = 0; py < canvas.height; py += 1) {
    for (let px = 0; px < canvas.width; px += 1) {
      const sampleX = (px + 0.5) / tilePixels;
      const sampleY = (py + 0.5) / tilePixels;
      const color = sampleTerrainColor(grid, palette, sampleX, sampleY);
      const offset = (py * canvas.width + px) * 4;
      image.data[offset] = color.r;
      image.data[offset + 1] = color.g;
      image.data[offset + 2] = color.b;
      image.data[offset + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

function buildTerrainGrid(terrain) {
  const grid = Array.from({ length: terrain.mapHeight }, () => Array.from({ length: terrain.mapWidth }, () => null));
  for (const tile of terrain.tiles) {
    if (grid[tile.y]) grid[tile.y][tile.x] = tile;
  }
  return {
    width: terrain.mapWidth,
    height: terrain.mapHeight,
    values: grid
  };
}

function buildTerrainPalette(terrain) {
  const palette = new Map();
  for (const tile of terrain.tiles) {
    if (!palette.has(tile.type)) {
      const color = adaptMaterialToWebGL(tile.material, parseWebGLColor(tile.colour, [0.18, 0.28, 0.16, 1])).baseColor;
      palette.set(tile.type, {
        r: Math.round(color[0] * 255),
        g: Math.round(color[1] * 255),
        b: Math.round(color[2] * 255)
      });
    }
  }
  return palette;
}

function sampleTerrainColor(grid, palette, x, y) {
  const memberships = sampleTerrainMemberships(grid, x, y);
  const mixed = memberships.reduce((accumulator, sample) => {
    const color = terrainMaterialColor(sample.type, palette.get(sample.type) ?? palette.get('grass'), x, y);
    accumulator.r += color.r * sample.weight;
    accumulator.g += color.g * sample.weight;
    accumulator.b += color.b * sample.weight;
    return accumulator;
  }, { r: 0, g: 0, b: 0 });
  return {
    r: clampByte(mixed.r),
    g: clampByte(mixed.g),
    b: clampByte(mixed.b)
  };
}

function sampleTerrainMemberships(grid, x, y) {
  const sampleX = clamp(x - 0.5, 0, Math.max(0, grid.width - 1));
  const sampleY = clamp(y - 0.5, 0, Math.max(0, grid.height - 1));
  const x0 = Math.floor(sampleX);
  const y0 = Math.floor(sampleY);
  const x1 = Math.min(grid.width - 1, x0 + 1);
  const y1 = Math.min(grid.height - 1, y0 + 1);
  const tx = smoothstep(sampleX - x0);
  const ty = smoothstep(sampleY - y0);
  const rawWeights = [
    { type: terrainAt(grid, x0, y0), weight: (1 - tx) * (1 - ty) },
    { type: terrainAt(grid, x1, y0), weight: tx * (1 - ty) },
    { type: terrainAt(grid, x0, y1), weight: (1 - tx) * ty },
    { type: terrainAt(grid, x1, y1), weight: tx * ty }
  ].reduce((weights, sample) => {
    weights.set(sample.type, (weights.get(sample.type) ?? 0) + sample.weight);
    return weights;
  }, new Map());
  const sharpened = [...rawWeights.entries()]
    .map(([type, weight]) => ({ type, weight: Math.pow(weight, TERRAIN_MASK_SHARPNESS) }))
    .filter((sample) => sample.weight > 0.0001);
  const total = sharpened.reduce((sum, sample) => sum + sample.weight, 0) || 1;
  return applyConnectedDirtShape(
    grid,
    sharpened.map((sample) => ({ type: sample.type, weight: sample.weight / total })),
    x,
    y
  );
}

function applyConnectedDirtShape(grid, memberships, x, y) {
  const dirt = memberships.find((sample) => sample.type === 'dirt');
  if (!dirt || dirt.weight <= 0) return memberships;
  const tile = tileAt(grid, Math.floor(clamp(x, 0, Math.max(0, grid.width - 1))), Math.floor(clamp(y, 0, Math.max(0, grid.height - 1))));
  if (tile?.type !== 'dirt' || !tile.connectedRule) return memberships;

  const scale = connectedDirtCornerScale(tile, x - tile.x, y - tile.y);
  if (scale >= 0.995) return memberships;
  const removed = dirt.weight * (1 - scale);
  dirt.weight *= scale;
  const grass = memberships.find((sample) => sample.type === 'grass');
  if (grass) grass.weight += removed;
  else memberships.push({ type: 'grass', weight: removed });
  const total = memberships.reduce((sum, sample) => sum + sample.weight, 0) || 1;
  return memberships.map((sample) => ({ type: sample.type, weight: sample.weight / total }));
}

function connectedDirtCornerScale(tile, localX, localY) {
  const directions = new Set(tile.connectedRule.directions ?? []);
  let scale = 1;
  if (!directions.has('n') && !directions.has('w')) scale = Math.min(scale, quarterRoundKeep(localX, localY, 1, 1));
  if (!directions.has('n') && !directions.has('e')) scale = Math.min(scale, quarterRoundKeep(localX, localY, 0, 1));
  if (!directions.has('s') && !directions.has('e')) scale = Math.min(scale, quarterRoundKeep(localX, localY, 0, 0));
  if (!directions.has('s') && !directions.has('w')) scale = Math.min(scale, quarterRoundKeep(localX, localY, 1, 0));
  return scale;
}

function quarterRoundKeep(localX, localY, centerX, centerY) {
  const distance = Math.hypot(localX - centerX, localY - centerY);
  return 1 - smoothRange(1.01, 1.2, distance);
}

function terrainAt(grid, x, y) {
  return tileAt(grid, x, y)?.type ?? 'grass';
}

function tileAt(grid, x, y) {
  return grid.values[y]?.[x] ?? null;
}

function terrainMaterialColor(type, base = { r: 49, g: 77, b: 47 }, x, y) {
  const seed = terrainSeed(type);
  const coarse = valueNoise(x, y, 0.68, seed);
  const fine = valueNoise(x, y, 3.35, seed + 19);
  const grain = terrainDither(Math.floor(x * 15), Math.floor(y * 15));

  if (type === 'dirt') {
    const soil = (coarse - 0.5) * 18 + (fine - 0.5) * 11 + grain * 5;
    const path = Math.sin((x * 0.7 + y * 0.22) * Math.PI) * 4;
    return shiftColor(base, soil * 0.72 + path + 5, soil * 0.52 + 2, soil * 0.28 - 2);
  }
  if (type === 'grass') {
    const meadow = (coarse - 0.5) * 17 + (fine - 0.5) * 7 + grain * 4;
    return shiftColor(base, meadow * 0.3 - 5, meadow * 0.7 + 3, meadow * 0.22 - 4);
  }
  if (type === 'forest') {
    const canopy = (coarse - 0.5) * 24 + (fine - 0.5) * 16;
    return shiftColor(base, -12 + canopy * 0.25, canopy * 0.54, -8 + canopy * 0.18);
  }
  if (type === 'water') {
    const ripple = Math.sin((x * 1.7 + y * 0.42) * Math.PI * 1.9) * 5 + (fine - 0.5) * 10;
    return shiftColor(base, -5 + ripple * 0.2, 2 + ripple * 0.35, 8 + ripple * 0.72);
  }
  if (type === 'rock') {
    const ridge = Math.abs(Math.sin((x * 0.88 - y * 0.64) * Math.PI * 2.4));
    const shade = (ridge - 0.5) * 26 + (fine - 0.5) * 12;
    return shiftColor(base, shade, shade, shade * 0.86);
  }
  if (type === 'scorched') {
    const ash = (coarse - 0.5) * 13 + (fine - 0.5) * 9;
    return shiftColor(base, ash * 0.66, ash * 0.52, ash * 0.4);
  }
  return base;
}

function addRect(rects, x, y, w, h, color) {
  if (w <= 0 || h <= 0) return;
  rects.push({ x, y, w, h, color });
}

function addTriangle(triangles, ax, ay, bx, by, cx, cy, color) {
  triangles.push({ ax, ay, bx, by, cx, cy, color });
}

function addRadial(radials, x, y, radius, softness, color) {
  if (radius <= 0) return;
  radials.push({ x, y, radius, softness, color });
}

function terrainTextureDisabledByRuntime() {
  try {
    const value = new URLSearchParams(globalThis.location?.search ?? '').get('terrainTexture');
    return value === 'off' || value === '0' || value === 'false';
  } catch {
    return false;
  }
}

function shiftColor(base, dr, dg, db) {
  return {
    r: clampByte(base.r + dr),
    g: clampByte(base.g + dg),
    b: clampByte(base.b + db)
  };
}

function valueNoise(x, y, frequency, seed) {
  const sx = x * frequency;
  const sy = y * frequency;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const tx = smoothstep(sx - x0);
  const ty = smoothstep(sy - y0);
  const a = hashUnit(x0, y0, seed);
  const b = hashUnit(x0 + 1, y0, seed);
  const c = hashUnit(x0, y0 + 1, seed);
  const d = hashUnit(x0 + 1, y0 + 1, seed);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}

function hashUnit(x, y, seed) {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function terrainSeed(type) {
  return String(type).split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function terrainDither(x, y) {
  return (((x * 13 + y * 17) % 7) / 6) - 0.5;
}

function seededNoise(x, y) {
  const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function smoothstep(value) {
  const x = clamp(value, 0, 1);
  return x * x * (3 - 2 * x);
}

function smoothRange(edge0, edge1, value) {
  return smoothstep((value - edge0) / Math.max(0.0001, edge1 - edge0));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}
