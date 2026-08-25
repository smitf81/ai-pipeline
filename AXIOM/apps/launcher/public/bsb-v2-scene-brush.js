import {
  createBsbV2TreeDefinition,
  normalizeBsbV2TreeRecord
} from './bsb-v2-tree-authoring.js';
import {
  createBsbV2GeologyDefinition,
  normalizeBsbV2GeologyRecord
} from './bsb-v2-geology-authoring.js';

export const BSB_V2_SCENE_BRUSH_CONFIG_CONTRACT = 'axiom.scene-brush-config.v1';
export const BSB_V2_SCENE_BRUSH_PREVIEW_CONTRACT = 'axiom.scene-brush-preview.v1';
export const BSB_V2_SCENE_BRUSH_RECEIPT_CONTRACT = 'axiom.scene-brush-receipt.v1';
export const BSB_V2_SCENE_BRUSH_FAMILIES = Object.freeze(['tree', 'geology']);

export const BSB_V2_DEFAULT_SCENE_BRUSH = Object.freeze({
  contract: BSB_V2_SCENE_BRUSH_CONFIG_CONTRACT,
  family: 'tree',
  radiusTiles: 4,
  falloff: 0.68,
  density: 0.34,
  seed: 42917,
  treeType: 'tree',
  treeSpecies: 'old_pine',
  geologyFormation: 'fieldstone'
});

export function normalizeBsbV2SceneBrushConfig(source = {}) {
  const family = text(source.family ?? BSB_V2_DEFAULT_SCENE_BRUSH.family);
  if (!BSB_V2_SCENE_BRUSH_FAMILIES.includes(family)) throw new Error(`bsb_scene_brush_family_invalid:${family || 'missing'}`);
  const treeType = text(source.treeType ?? BSB_V2_DEFAULT_SCENE_BRUSH.treeType);
  if (!['tree', 'birch_tree'].includes(treeType)) throw new Error(`bsb_scene_brush_tree_type_invalid:${treeType || 'missing'}`);
  const treeSpecies = text(source.treeSpecies ?? (treeType === 'birch_tree' ? 'silver_birch' : BSB_V2_DEFAULT_SCENE_BRUSH.treeSpecies));
  const geologyFormation = text(source.geologyFormation ?? BSB_V2_DEFAULT_SCENE_BRUSH.geologyFormation);
  return freeze({
    contract: BSB_V2_SCENE_BRUSH_CONFIG_CONTRACT,
    family,
    radiusTiles: integer(source.radiusTiles ?? BSB_V2_DEFAULT_SCENE_BRUSH.radiusTiles, 'radiusTiles', 1, 8),
    falloff: decimal(source.falloff ?? BSB_V2_DEFAULT_SCENE_BRUSH.falloff, 'falloff', 0, 1),
    density: decimal(source.density ?? BSB_V2_DEFAULT_SCENE_BRUSH.density, 'density', .05, 1),
    seed: integer(source.seed ?? BSB_V2_DEFAULT_SCENE_BRUSH.seed, 'seed', 1, 2147483647),
    treeType,
    treeSpecies,
    geologyFormation
  });
}

export function createBsbV2SceneBrushPreview(document, strokeCenters, configuration = {}) {
  assertDocumentShape(document);
  const config = normalizeBsbV2SceneBrushConfig(configuration);
  const centers = normalizeStrokeCenters(strokeCenters);
  if (!centers.length) throw new Error('bsb_scene_brush_stroke_missing');

  const sampledTiles = new Map();
  const diagnostics = {
    visitedTiles: 0,
    deduplicated: 0,
    outOfBounds: 0,
    densityRejected: 0,
    terrainBlocked: 0,
    occupied: 0,
    blocked: 0,
    candidates: 0
  };
  for (const center of centers) {
    for (let dy = -config.radiusTiles; dy <= config.radiusTiles; dy += 1) {
      for (let dx = -config.radiusTiles; dx <= config.radiusTiles; dx += 1) {
        const distance = Math.hypot(dx, dy);
        if (distance > config.radiusTiles) continue;
        diagnostics.visitedTiles += 1;
        const x = center.x + dx;
        const y = center.y + dy;
        const key = tileKey(x, y);
        const previous = sampledTiles.get(key);
        if (previous) {
          diagnostics.deduplicated += 1;
          if (distance < previous.distance) previous.distance = distance;
          continue;
        }
        sampledTiles.set(key, { x, y, distance });
      }
    }
  }

  const candidates = [];
  const blocked = [];
  const occupied = occupiedFootprints(document);
  const footprintSize = config.family === 'geology' ? 2 : 1;
  const orderedTiles = [...sampledTiles.values()].sort((left, right) => left.y - right.y || left.x - right.x);
  for (const tile of orderedTiles) {
    const footprint = { x: tile.x, y: tile.y, w: footprintSize, h: footprintSize };
    if (tile.x < 0 || tile.y < 0 || tile.x + footprintSize > document.width || tile.y + footprintSize > document.height) {
      diagnostics.outOfBounds += 1;
      diagnostics.blocked += 1;
      blocked.push(freeze({ x: tile.x, y: tile.y, reason: 'map_bounds' }));
      continue;
    }
    const terrainReason = blockedTerrain(document, footprint, config.family);
    if (terrainReason) {
      diagnostics.terrainBlocked += 1;
      diagnostics.blocked += 1;
      blocked.push(freeze({ x: tile.x, y: tile.y, reason: terrainReason }));
      continue;
    }
    const collision = occupied.find((entry) => rectanglesOverlap(footprint, entry));
    if (collision) {
      diagnostics.occupied += 1;
      diagnostics.blocked += 1;
      blocked.push(freeze({ x: tile.x, y: tile.y, reason: collision.reason }));
      continue;
    }
    const probability = config.density * (1 - config.falloff * (tile.distance / config.radiusTiles));
    if (unitRandom(config.seed, document.mapId, tile.x, tile.y, config.family, 'density') >= probability) {
      diagnostics.densityRejected += 1;
      continue;
    }
    const seed = positiveSeed(config.seed, document.mapId, tile.x, tile.y, config.family);
    const id = `${config.family}:brush:${config.seed}:${document.revision + 1}:${tile.x}:${tile.y}`;
    const candidate = config.family === 'tree'
      ? { id, x: tile.x, y: tile.y, family: config.family, type: config.treeType, species: config.treeSpecies, seed, footprint }
      : { id, x: tile.x, y: tile.y, family: config.family, type: 'boulder', formation: config.geologyFormation, seed, footprint };
    candidates.push(freeze(candidate));
    occupied.push({ ...footprint, reason: `preview:${id}` });
  }

  diagnostics.candidates = candidates.length;
  const previewIdentity = positiveSeed(
    config.seed,
    document.mapId,
    document.revision,
    centers.map((point) => `${point.x},${point.y}`).join(';'),
    JSON.stringify(config)
  );
  return freeze({
    contract: BSB_V2_SCENE_BRUSH_PREVIEW_CONTRACT,
    previewId: `scene-preview:${previewIdentity}`,
    mapId: document.mapId,
    sourceRevision: document.revision,
    config,
    strokeCenters: Object.freeze(centers.map(freeze)),
    candidates: Object.freeze(candidates),
    blocked: Object.freeze(blocked),
    diagnostics: freeze(diagnostics)
  });
}

export function applyBsbV2SceneBrushPreview(document, preview) {
  assertDocumentShape(document);
  assertPreview(preview, document);
  if (preview.mapId !== document.mapId || preview.sourceRevision !== document.revision) {
    throw new Error(`bsb_scene_brush_preview_stale:${preview.sourceRevision}:${document.revision}`);
  }
  if (!preview.candidates.length) throw new Error('bsb_scene_brush_preview_empty');

  const occupied = occupiedFootprints(document);
  const ids = new Set([
    ...document.sceneObjects.map((record) => record.id),
    ...document.unitPlacements.map((record) => record.id),
    ...document.unitSpawners.map((record) => record.id)
  ]);
  const createdRecords = preview.candidates.map((candidate) => {
    if (ids.has(candidate.id)) throw new Error(`bsb_scene_brush_id_collision:${candidate.id}`);
    const collision = occupied.find((entry) => rectanglesOverlap(candidate.footprint, entry));
    if (collision) throw new Error(`bsb_scene_brush_collision_changed:${candidate.x}:${candidate.y}`);
    ids.add(candidate.id);
    occupied.push({ ...candidate.footprint, reason: `sceneObject:${candidate.id}` });
    return candidate.family === 'tree'
      ? normalizeBsbV2TreeRecord({
          id: candidate.id,
          type: candidate.type,
          x: candidate.x,
          y: candidate.y,
          tree: createBsbV2TreeDefinition({ seed: candidate.seed, species: candidate.species }, candidate)
        })
      : normalizeBsbV2GeologyRecord({
          id: candidate.id,
          type: 'boulder',
          x: candidate.x,
          y: candidate.y,
          geology: createBsbV2GeologyDefinition({ seed: candidate.seed, formation: candidate.formation }, candidate)
        });
  });
  const beforeRevision = document.revision;
  const nextDocument = {
    ...clone(document),
    revision: beforeRevision + 1,
    updatedAt: new Date().toISOString(),
    sceneObjects: [...clone(document.sceneObjects), ...createdRecords]
  };
  return freeze({
    contract: BSB_V2_SCENE_BRUSH_RECEIPT_CONTRACT,
    receiptId: `scene-brush:${preview.previewId.split(':').at(-1)}:${nextDocument.revision}`,
    operation: 'paint',
    family: preview.config.family,
    previewId: preview.previewId,
    mapId: document.mapId,
    beforeRevision,
    afterRevision: nextDocument.revision,
    createdIds: Object.freeze(createdRecords.map((record) => record.id)),
    createdCount: createdRecords.length,
    diagnostics: preview.diagnostics,
    document: nextDocument
  });
}

export function undoBsbV2SceneBrush(document, receipt) {
  assertDocumentShape(document);
  if (receipt?.contract !== BSB_V2_SCENE_BRUSH_RECEIPT_CONTRACT || receipt?.operation !== 'paint') {
    throw new Error('bsb_scene_brush_receipt_invalid');
  }
  if (!Array.isArray(receipt.createdIds) || !receipt.createdIds.length || new Set(receipt.createdIds).size !== receipt.createdIds.length) {
    throw new Error('bsb_scene_brush_receipt_ids_invalid');
  }
  if (receipt.mapId !== document.mapId || receipt.afterRevision !== document.revision) {
    throw new Error(`bsb_scene_brush_undo_stale:${receipt.afterRevision ?? 'missing'}:${document.revision}`);
  }
  const removalIds = new Set(receipt.createdIds);
  const presentIds = new Set(document.sceneObjects.map((record) => record.id));
  for (const id of removalIds) if (!presentIds.has(id)) throw new Error(`bsb_scene_brush_undo_record_missing:${id}`);
  const beforeRevision = document.revision;
  const nextDocument = {
    ...clone(document),
    revision: beforeRevision + 1,
    updatedAt: new Date().toISOString(),
    sceneObjects: clone(document.sceneObjects.filter((record) => !removalIds.has(record.id)))
  };
  return freeze({
    contract: BSB_V2_SCENE_BRUSH_RECEIPT_CONTRACT,
    receiptId: `${receipt.receiptId}:undo:${nextDocument.revision}`,
    operation: 'undo',
    family: receipt.family,
    originalReceiptId: receipt.receiptId,
    mapId: document.mapId,
    beforeRevision,
    afterRevision: nextDocument.revision,
    removedIds: Object.freeze([...removalIds]),
    removedCount: removalIds.size,
    document: nextDocument
  });
}

function blockedTerrain(document, footprint, family) {
  for (let y = footprint.y; y < footprint.y + footprint.h; y += 1) {
    for (let x = footprint.x; x < footprint.x + footprint.w; x += 1) {
      const terrain = document.tiles[y]?.[x];
      if (terrain === 'water' || (family === 'tree' && terrain === 'rock')) return `terrain:${terrain}`;
    }
  }
  return null;
}

function occupiedFootprints(document) {
  const result = [
    { x: document.spawn.x, y: document.spawn.y, w: 1, h: 1, reason: 'playerSpawn' },
    { ...document.escapeZone, reason: 'escapeZone' }
  ];
  for (const [kind, records] of [
    ['sceneObject', document.sceneObjects],
    ['unit', document.unitPlacements],
    ['spawner', document.unitSpawners]
  ]) {
    for (const record of records) result.push({
      x: record.x,
      y: record.y,
      w: record.w ?? record.widthTiles ?? (record.type === 'boulder' ? 2 : 1),
      h: record.h ?? record.heightTiles ?? (record.type === 'boulder' ? 2 : 1),
      reason: `${kind}:${record.id}`
    });
  }
  return result;
}

function assertPreview(preview, document) {
  if (preview?.contract !== BSB_V2_SCENE_BRUSH_PREVIEW_CONTRACT || !Array.isArray(preview.candidates)) {
    throw new Error('bsb_scene_brush_preview_invalid');
  }
  if (typeof preview.previewId !== 'string' || !preview.previewId.startsWith('scene-preview:')) throw new Error('bsb_scene_brush_preview_identity_invalid');
  integer(preview.sourceRevision, 'preview.sourceRevision', 0, Number.MAX_SAFE_INTEGER);
  const config = normalizeBsbV2SceneBrushConfig(preview.config);
  const ids = new Set();
  const footprints = [];
  for (const candidate of preview.candidates) {
    if (candidate?.family !== config.family) throw new Error(`bsb_scene_brush_candidate_family_invalid:${candidate?.family ?? 'missing'}`);
    if (config.family === 'tree' && (candidate.type !== config.treeType || candidate.species !== config.treeSpecies)) {
      throw new Error(`bsb_scene_brush_candidate_tree_recipe_invalid:${candidate?.type ?? 'missing'}`);
    }
    if (config.family === 'geology' && (candidate.type !== 'boulder' || candidate.formation !== config.geologyFormation)) {
      throw new Error(`bsb_scene_brush_candidate_geology_recipe_invalid:${candidate?.type ?? 'missing'}`);
    }
    integer(candidate.x, 'candidate.x', 0, document.width - 1);
    integer(candidate.y, 'candidate.y', 0, document.height - 1);
    integer(candidate.seed, 'candidate.seed', 1, 2147483647);
    if (!/^[a-z0-9][a-z0-9._:-]*$/i.test(candidate.id || '') || ids.has(candidate.id)) throw new Error(`bsb_scene_brush_candidate_id_invalid:${candidate.id ?? 'missing'}`);
    const expectedSize = config.family === 'geology' ? 2 : 1;
    if (candidate.footprint?.x !== candidate.x || candidate.footprint?.y !== candidate.y || candidate.footprint?.w !== expectedSize || candidate.footprint?.h !== expectedSize) {
      throw new Error(`bsb_scene_brush_candidate_footprint_invalid:${candidate.id ?? 'missing'}`);
    }
    if (footprints.some((entry) => rectanglesOverlap(candidate.footprint, entry))) throw new Error(`bsb_scene_brush_candidate_overlap:${candidate.id}`);
    ids.add(candidate.id);
    footprints.push(candidate.footprint);
  }
}

function assertDocumentShape(document) {
  if (!document || typeof document !== 'object' || !Array.isArray(document.tiles)) throw new Error('bsb_scene_brush_document_invalid');
  for (const field of ['sceneObjects', 'unitPlacements', 'unitSpawners']) {
    if (!Array.isArray(document[field])) throw new Error(`bsb_scene_brush_document_invalid:${field}`);
  }
  integer(document.width, 'document.width', 1, 256);
  integer(document.height, 'document.height', 1, 256);
  integer(document.revision, 'document.revision', 0, Number.MAX_SAFE_INTEGER);
  if (!document.mapId || !document.spawn || !document.escapeZone) throw new Error('bsb_scene_brush_document_invalid:identity');
}

function normalizeStrokeCenters(source) {
  if (!Array.isArray(source)) throw new Error('bsb_scene_brush_stroke_invalid');
  const seen = new Set();
  const centers = [];
  for (const point of source) {
    const x = integer(point?.x, 'stroke.x', -256, 512);
    const y = integer(point?.y, 'stroke.y', -256, 512);
    const key = tileKey(x, y);
    if (seen.has(key)) continue;
    seen.add(key);
    centers.push({ x, y });
  }
  return centers;
}

function rectanglesOverlap(left, right) {
  return left.x < right.x + right.w && left.x + left.w > right.x
    && left.y < right.y + right.h && left.y + left.h > right.y;
}
function unitRandom(...parts) { return (hash(parts.join(':')) >>> 0) / 4294967296; }
function positiveSeed(...parts) { return (hash(parts.join(':')) >>> 0) % 2147483646 + 1; }
function hash(value) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  result += result << 13;
  result ^= result >>> 7;
  result += result << 3;
  result ^= result >>> 17;
  result += result << 5;
  return result;
}
function tileKey(x, y) { return `${x},${y}`; }
function integer(value, label, min, max) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < min || numeric > max) throw new Error(`bsb_scene_brush_integer_invalid:${label}`);
  return numeric;
}
function decimal(value, label, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) throw new Error(`bsb_scene_brush_number_invalid:${label}`);
  return Math.round(numeric * 1e6) / 1e6;
}
function text(value) { return String(value ?? '').trim().toLowerCase().replace(/-/g, '_'); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function freeze(value) { return Object.freeze(value); }
