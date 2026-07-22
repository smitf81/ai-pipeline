export const BSB_V2_MAP_SIZE_LIMITS = Object.freeze({ min: 4, max: 256 });
export const BSB_V2_MAP_RESIZE_CONTRACT = 'axiom.bsb-map-resize.v0';

export function resizeBsbV2AuthoringDocument(source, targetWidth, targetHeight, options = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('bsb_map_resize_source_invalid');
  }
  const oldWidth = integer(source.width, 'source_width');
  const oldHeight = integer(source.height, 'source_height');
  const width = integer(targetWidth, 'target_width');
  const height = integer(targetHeight, 'target_height');
  if (width < oldWidth || height < oldHeight) {
    throw new Error(`bsb_map_resize_shrink_not_supported:${oldWidth}x${oldHeight}:${width}x${height}`);
  }
  if (width === oldWidth && height === oldHeight) throw new Error('bsb_map_resize_no_change');

  const anchor = String(options.anchor || 'center');
  if (anchor !== 'center') throw new Error(`bsb_map_resize_anchor_unsupported:${anchor}`);
  const fillTerrain = String(options.fillTerrain || 'grass').trim();
  if (!fillTerrain) throw new Error('bsb_map_resize_fill_terrain_missing');
  if (!Array.isArray(source.tiles) || source.tiles.length !== oldHeight) {
    throw new Error('bsb_map_resize_source_tiles_invalid');
  }
  const offsetX = Math.floor((width - oldWidth) / 2);
  const offsetY = Math.floor((height - oldHeight) / 2);
  const tiles = Array.from({ length: height }, () => Array.from({ length: width }, () => fillTerrain));
  for (let y = 0; y < oldHeight; y += 1) {
    if (!Array.isArray(source.tiles[y]) || source.tiles[y].length !== oldWidth) {
      throw new Error(`bsb_map_resize_source_tiles_width_invalid:${y}`);
    }
    for (let x = 0; x < oldWidth; x += 1) tiles[y + offsetY][x + offsetX] = source.tiles[y][x];
  }

  const resizedAt = String(options.resizedAt || new Date().toISOString());
  const sceneObjects = shiftRecords(source.sceneObjects, offsetX, offsetY);
  const unitPlacements = shiftRecords(source.unitPlacements, offsetX, offsetY);
  const unitSpawners = shiftRecords(source.unitSpawners, offsetX, offsetY);
  return {
    ...clone(source),
    width,
    height,
    tiles,
    revision: integer(source.revision ?? 0, 'source_revision', 0, Number.MAX_SAFE_INTEGER) + 1,
    spawn: shiftPoint(source.spawn, offsetX, offsetY),
    escapeZone: { ...clone(source.escapeZone), ...shiftPoint(source.escapeZone, offsetX, offsetY) },
    sceneObjects,
    unitPlacements,
    unitSpawners,
    lastResize: {
      contract: BSB_V2_MAP_RESIZE_CONTRACT,
      from: { width: oldWidth, height: oldHeight },
      to: { width, height },
      anchor,
      offset: { x: offsetX, y: offsetY },
      fillTerrain,
      preserved: {
        tiles: oldWidth * oldHeight,
        sceneObjects: sceneObjects.length,
        unitPlacements: unitPlacements.length,
        unitSpawners: unitSpawners.length
      },
      resizedAt
    },
    updatedAt: resizedAt
  };
}

function shiftRecords(records, offsetX, offsetY) {
  if (!Array.isArray(records)) throw new Error('bsb_map_resize_records_invalid');
  return records.map((entry) => ({ ...clone(entry), ...shiftPoint(entry, offsetX, offsetY) }));
}

function shiftPoint(point, offsetX, offsetY) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isInteger(x) || !Number.isInteger(y)) throw new Error('bsb_map_resize_point_invalid');
  return { x: x + offsetX, y: y + offsetY };
}

function integer(value, label, min = BSB_V2_MAP_SIZE_LIMITS.min, max = BSB_V2_MAP_SIZE_LIMITS.max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`bsb_map_resize_integer_invalid:${label}`);
  }
  return number;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
