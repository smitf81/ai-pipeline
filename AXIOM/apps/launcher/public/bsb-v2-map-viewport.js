export const BSB_V2_MAP_VIEWPORT_ZOOM = Object.freeze({ min: 1, max: 8 });

export function createBsbV2MapViewport(map = null) {
  return {
    zoom: 1,
    centerX: map ? map.width / 2 : null,
    centerY: map ? map.height / 2 : null
  };
}

export function resolveBsbV2MapCanvasLayout(map, viewport, canvasWidth, canvasHeight) {
  const width = Math.max(1, Number(canvasWidth) || 1);
  const height = Math.max(1, Number(canvasHeight) || 1);
  const mapWidth = positiveInteger(map?.width, 'map_width');
  const mapHeight = positiveInteger(map?.height, 'map_height');
  const fitCell = Math.max(1, Math.min((width - 32) / mapWidth, (height - 32) / mapHeight));
  const zoom = clamp(Number(viewport?.zoom) || 1, BSB_V2_MAP_VIEWPORT_ZOOM.min, BSB_V2_MAP_VIEWPORT_ZOOM.max);
  const cell = fitCell * zoom;
  const halfVisibleX = width / (2 * cell);
  const halfVisibleY = height / (2 * cell);
  const centerX = clampViewportAxis(viewport?.centerX, mapWidth, halfVisibleX);
  const centerY = clampViewportAxis(viewport?.centerY, mapHeight, halfVisibleY);
  const offsetX = width / 2 - centerX * cell;
  const offsetY = height / 2 - centerY * cell;
  return {
    viewport: { zoom, centerX, centerY },
    cell,
    fitCell,
    offsetX,
    offsetY,
    mapWidth: mapWidth * cell,
    mapHeight: mapHeight * cell,
    visibleTiles: {
      minX: Math.max(0, Math.floor((0 - offsetX) / cell)),
      minY: Math.max(0, Math.floor((0 - offsetY) / cell)),
      maxX: Math.min(mapWidth - 1, Math.ceil((width - offsetX) / cell) - 1),
      maxY: Math.min(mapHeight - 1, Math.ceil((height - offsetY) / cell) - 1)
    }
  };
}

export function panBsbV2MapViewport(map, viewport, layout, deltaX, deltaY, canvasWidth, canvasHeight) {
  const next = {
    ...viewport,
    centerX: layout.viewport.centerX - Number(deltaX || 0) / layout.cell,
    centerY: layout.viewport.centerY - Number(deltaY || 0) / layout.cell
  };
  return resolveBsbV2MapCanvasLayout(map, next, canvasWidth, canvasHeight).viewport;
}

export function zoomBsbV2MapViewport(map, viewport, layout, nextZoom, pointerX, pointerY, canvasWidth, canvasHeight) {
  const zoom = clamp(Number(nextZoom) || 1, BSB_V2_MAP_VIEWPORT_ZOOM.min, BSB_V2_MAP_VIEWPORT_ZOOM.max);
  const anchorX = Number.isFinite(Number(pointerX)) ? Number(pointerX) : canvasWidth / 2;
  const anchorY = Number.isFinite(Number(pointerY)) ? Number(pointerY) : canvasHeight / 2;
  const tileX = (anchorX - layout.offsetX) / layout.cell;
  const tileY = (anchorY - layout.offsetY) / layout.cell;
  const nextCell = layout.fitCell * zoom;
  const next = {
    zoom,
    centerX: tileX - (anchorX - canvasWidth / 2) / nextCell,
    centerY: tileY - (anchorY - canvasHeight / 2) / nextCell
  };
  return resolveBsbV2MapCanvasLayout(map, next, canvasWidth, canvasHeight).viewport;
}

function clampViewportAxis(value, mapSize, halfVisible) {
  if (mapSize <= halfVisible * 2) return mapSize / 2;
  return clamp(Number.isFinite(Number(value)) ? Number(value) : mapSize / 2, halfVisible, mapSize - halfVisible);
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error(`bsb_map_viewport_integer_invalid:${label}`);
  return number;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
