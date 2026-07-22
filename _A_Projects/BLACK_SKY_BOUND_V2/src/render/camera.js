import { clamp, lerp } from '../core/math.js';
import { CONFIG } from '../config.js';

export function createCamera(canvas, map) {
  return {
    x: (map.width * CONFIG.tileSize) / 2,
    y: (map.height * CONFIG.tileSize) / 2,
    zoom: 2.5,
    viewportW: canvas.clientWidth || 1280,
    viewportH: canvas.clientHeight || 720
  };
}

export function updateCameraForAction(camera, input, focus, dt, settings, map = null) {
  const wheel = input.consumeWheel();
  camera.zoom = 2.75;
  if (focus) {
    camera.x = lerp(camera.x, focus.x, 1 - Math.exp(-settings.followSharpness * dt));
    camera.y = lerp(camera.y, focus.y, 1 - Math.exp(-settings.followSharpness * dt));
  }
  //if (wheel) camera.zoom = clamp(camera.zoom - wheel * settings.wheelZoomStep, settings.minZoom, settings.maxZoom);
  if (map) clampCameraToMap(camera, map);
}

export function clampCameraToMap(camera, map, tileSize = CONFIG.tileSize) {
  const worldWidth = Math.max(1, Number(map?.width) || 1) * tileSize;
  const worldHeight = Math.max(1, Number(map?.height) || 1) * tileSize;
  const halfWidth = Math.max(0, Number(camera.viewportW) || 0) / (2 * Math.max(0.001, camera.zoom));
  const halfHeight = Math.max(0, Number(camera.viewportH) || 0) / (2 * Math.max(0.001, camera.zoom));
  camera.x = worldWidth <= halfWidth * 2 ? worldWidth / 2 : clamp(camera.x, halfWidth, worldWidth - halfWidth);
  camera.y = worldHeight <= halfHeight * 2 ? worldHeight / 2 : clamp(camera.y, halfHeight, worldHeight - halfHeight);
  return camera;
}

export function worldToScreen(camera, wx, wy) {
  return {
    x: (wx - camera.x) * camera.zoom + camera.viewportW / 2,
    y: (wy - camera.y) * camera.zoom + camera.viewportH / 2
  };
}

export function screenToWorld(camera, sx, sy) {
  return {
    x: (sx - camera.viewportW / 2) / camera.zoom + camera.x,
    y: (sy - camera.viewportH / 2) / camera.zoom + camera.y
  };
}
