import { CONFIG } from '../config.js';

const EPSILON = 1e-6;

export function bindMamaFlyoverTrajectory(event, { camera = null, map = null, player = null, tuning }) {
  const trajectoryTuning = tuning.shadow ?? tuning;
  const viewport = resolveCameraBoundsTiles(camera, event, player, map, trajectoryTuning);
  const requested = resolveRequestedCrossing(event, player, viewport, trajectoryTuning);
  const crossing = clampPointToBounds(requested, viewport, trajectoryTuning.crossingInsetTiles);
  const expanded = expandBounds(viewport, trajectoryTuning.entryExitMarginTiles);
  const interval = lineBoundsInterval(crossing.x, crossing.y, event.forwardX, event.forwardY, expanded);
  if (!interval) throw new Error('mama_flyover_camera_trajectory_unresolvable');

  Object.assign(event, {
    centerX: crossing.x,
    centerY: crossing.y,
    startX: crossing.x + event.forwardX * interval.min,
    startY: crossing.y + event.forwardY * interval.min,
    endX: crossing.x + event.forwardX * interval.max,
    endY: crossing.y + event.forwardY * interval.max,
    cameraBoundsAtFlyoverStart: viewport,
    expandedCameraBoundsAtFlyoverStart: expanded,
    trajectoryDistanceTiles: interval.max - interval.min,
    trajectorySource: camera ? 'active_camera_frustum' : 'player_centered_camera_fallback'
  });
  updateMamaFlyoverPose(event, 0, tuning);
  return event;
}

export function updateMamaFlyoverPose(event, progress, tuning) {
  const rawProgress = clamp01(progress);
  const easedProgress = smoothStep(rawProgress);
  event.progress = rawProgress;
  event.easedProgress = easedProgress;
  event.worldX = lerp(event.startX, event.endX, easedProgress);
  event.worldY = lerp(event.startY, event.endY, easedProgress);
  event.breath = resolveMamaBreathPose(event, rawProgress, tuning.breath);
  return event;
}

export function resolveMamaInfernoSegment(event, map, fireTuning) {
  const safeBounds = {
    left: 1.2,
    top: 1.2,
    right: Math.max(1.2, map.width - 1.2),
    bottom: Math.max(1.2, map.height - 1.2)
  };
  const centerX = clamp(event.worldX + event.forwardX * fireTuning.depositForwardTiles, safeBounds.left, safeBounds.right);
  const centerY = clamp(event.worldY + event.forwardY * fireTuning.depositForwardTiles, safeBounds.top, safeBounds.bottom);
  const interval = lineBoundsInterval(centerX, centerY, event.forwardX, event.forwardY, safeBounds);
  const half = fireTuning.lengthTiles * 0.5;
  const startT = Math.max(-half, interval?.min ?? -half);
  const endT = Math.min(half, interval?.max ?? half);
  return {
    ax: centerX + event.forwardX * startT,
    ay: centerY + event.forwardY * startT,
    bx: centerX + event.forwardX * endT,
    by: centerY + event.forwardY * endT,
    centerX,
    centerY,
    deliveryX: event.breath?.targetX ?? centerX,
    deliveryY: event.breath?.targetY ?? centerY,
    headingRadians: event.headingRadians,
    forwardX: event.forwardX,
    forwardY: event.forwardY,
    rightX: event.rightX,
    rightY: event.rightY
  };
}

export function normalizeHeadingRadians(value) {
  const tau = Math.PI * 2;
  const numeric = Number(value) || 0;
  return ((numeric % tau) + tau) % tau;
}

export function angularDistanceRadians(a, b) {
  const tau = Math.PI * 2;
  const delta = Math.abs(normalizeHeadingRadians(a) - normalizeHeadingRadians(b));
  return Math.min(delta, tau - delta);
}

function resolveCameraBoundsTiles(camera, event, player, map, tuning) {
  const zoom = Math.max(0.001, Number(camera?.zoom) || 0);
  const viewportW = Number(camera?.viewportW) || 0;
  const viewportH = Number(camera?.viewportH) || 0;
  if (camera && zoom > 0 && viewportW > 0 && viewportH > 0) {
    const centerX = (Number(camera.x) || 0) / CONFIG.tileSize;
    const centerY = (Number(camera.y) || 0) / CONFIG.tileSize;
    const halfW = viewportW / (2 * zoom * CONFIG.tileSize);
    const halfH = viewportH / (2 * zoom * CONFIG.tileSize);
    return { left: centerX - halfW, top: centerY - halfH, right: centerX + halfW, bottom: centerY + halfH };
  }
  const centerX = finite(event.requestedCenterX, player?.x ?? map?.spawn?.x ?? 0);
  const centerY = finite(event.requestedCenterY, player?.y ?? map?.spawn?.y ?? 0);
  return {
    left: centerX - tuning.fallbackViewportWidthTiles * 0.5,
    top: centerY - tuning.fallbackViewportHeightTiles * 0.5,
    right: centerX + tuning.fallbackViewportWidthTiles * 0.5,
    bottom: centerY + tuning.fallbackViewportHeightTiles * 0.5
  };
}

function resolveRequestedCrossing(event, player, viewport, tuning) {
  if (Number.isFinite(event.requestedCenterX) || Number.isFinite(event.requestedCenterY)) {
    return {
      x: finite(event.requestedCenterX, (viewport.left + viewport.right) * 0.5),
      y: finite(event.requestedCenterY, (viewport.top + viewport.bottom) * 0.5)
    };
  }
  const anchorX = finite(player?.x, (viewport.left + viewport.right) * 0.5);
  const anchorY = finite(player?.y, (viewport.top + viewport.bottom) * 0.5);
  return {
    x: anchorX + event.rightX * tuning.cameraPeripheryOffsetTiles,
    y: anchorY + event.rightY * tuning.cameraPeripheryOffsetTiles
  };
}

function resolveMamaBreathPose(event, progress, tuning) {
  const active = event.kind === 'mama_wyvern_inferno'
    && progress >= tuning.startProgress
    && progress <= tuning.endProgress;
  const span = Math.max(EPSILON, tuning.endProgress - tuning.startProgress);
  const phase = clamp01((progress - tuning.startProgress) / span);
  const opacity = active ? Math.pow(Math.sin(phase * Math.PI), 0.55) : 0;
  return {
    mode: tuning.mode,
    active,
    phase,
    opacity,
    originX: event.worldX + event.forwardX * tuning.headForwardTiles,
    originY: event.worldY + event.forwardY * tuning.headForwardTiles,
    targetX: event.worldX + event.forwardX * tuning.groundForwardTiles + event.rightX * tuning.rightOffsetTiles,
    targetY: event.worldY + event.forwardY * tuning.groundForwardTiles + event.rightY * tuning.rightOffsetTiles
  };
}

function lineBoundsInterval(x, y, dx, dy, bounds) {
  let min = -Infinity;
  let max = Infinity;
  for (const [origin, direction, lower, upper] of [
    [x, dx, bounds.left, bounds.right],
    [y, dy, bounds.top, bounds.bottom]
  ]) {
    if (Math.abs(direction) < EPSILON) {
      if (origin < lower || origin > upper) return null;
      continue;
    }
    const a = (lower - origin) / direction;
    const b = (upper - origin) / direction;
    min = Math.max(min, Math.min(a, b));
    max = Math.min(max, Math.max(a, b));
    if (max < min) return null;
  }
  return { min, max };
}

function clampPointToBounds(point, bounds, inset) {
  const maxInsetX = Math.max(0, (bounds.right - bounds.left) * 0.5 - 0.01);
  const maxInsetY = Math.max(0, (bounds.bottom - bounds.top) * 0.5 - 0.01);
  const insetX = Math.min(Math.max(0, inset), maxInsetX);
  const insetY = Math.min(Math.max(0, inset), maxInsetY);
  return {
    x: clamp(point.x, bounds.left + insetX, bounds.right - insetX),
    y: clamp(point.y, bounds.top + insetY, bounds.bottom - insetY)
  };
}

function expandBounds(bounds, amount) {
  return { left: bounds.left - amount, top: bounds.top - amount, right: bounds.right + amount, bottom: bounds.bottom + amount };
}

function smoothStep(value) {
  return value * value * (3 - 2 * value);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function finite(value, fallback) {
  if (value == null || value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value) {
  return clamp(Number(value) || 0, 0, 1);
}
