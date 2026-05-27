export const SCENES = {
  CANVAS: 'canvas',
  STUDIO: 'studio',
};

export const STUDIO_ZOOM_THRESHOLD = 0.48;
export const MAX_CANVAS_ZOOM = 2.4;
export const MIN_CANVAS_ZOOM = 0.32;
export const MAX_STUDIO_ZOOM = 1.9;
export const MIN_STUDIO_ZOOM = 0.82;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createDefaultCanvasViewport() {
  return { x: 0, y: 0, zoom: 1 };
}

export function createDefaultStudioViewport() {
  return { x: 0, y: 0, zoom: 1 };
}

export function sceneFromCanvasZoom(zoom) {
  return zoom <= STUDIO_ZOOM_THRESHOLD ? SCENES.STUDIO : SCENES.CANVAS;
}
