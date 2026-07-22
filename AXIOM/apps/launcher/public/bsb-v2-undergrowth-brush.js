import {
  BSB_V2_UNDERGROWTH_SPECIES_RECIPES,
  createBsbV2UndergrowthDefinition,
  normalizeBsbV2UndergrowthRecord
} from './bsb-v2-undergrowth-authoring.js';

export const BSB_V2_UNDERGROWTH_BRUSH_CONFIG_CONTRACT = 'axiom.undergrowth-brush-config.v1';
export const BSB_V2_UNDERGROWTH_BRUSH_PREVIEW_CONTRACT = 'axiom.undergrowth-brush-preview.v1';
export const BSB_V2_UNDERGROWTH_BRUSH_RECEIPT_CONTRACT = 'axiom.undergrowth-brush-receipt.v1';

export const BSB_V2_UNDERGROWTH_BRUSH_SPECIES = Object.freeze(['wood_fern', 'forest_shrub', 'ember_bramble']);

export const BSB_V2_DEFAULT_UNDERGROWTH_BRUSH = Object.freeze({
  contract: BSB_V2_UNDERGROWTH_BRUSH_CONFIG_CONTRACT,
  radiusTiles: 3,
  falloff: 0.72,
  density: 0.62,
  seed: 18273,
  woodFernType: 'fern_patch',
  speciesMix: Object.freeze({ wood_fern: 0.58, forest_shrub: 0.3, ember_bramble: 0.12 })
});

export function normalizeBsbV2UndergrowthBrushConfig(source = {}) {
  const speciesMix = normalizeSpeciesMix(source.speciesMix ?? BSB_V2_DEFAULT_UNDERGROWTH_BRUSH.speciesMix);
  return Object.freeze({
    contract: BSB_V2_UNDERGROWTH_BRUSH_CONFIG_CONTRACT,
    radiusTiles: integer(source.radiusTiles ?? BSB_V2_DEFAULT_UNDERGROWTH_BRUSH.radiusTiles, 'radiusTiles', 1, 8),
    falloff: decimal(source.falloff ?? BSB_V2_DEFAULT_UNDERGROWTH_BRUSH.falloff, 'falloff', 0, 1),
    density: decimal(source.density ?? BSB_V2_DEFAULT_UNDERGROWTH_BRUSH.density, 'density', 0.05, 1),
    seed: integer(source.seed ?? BSB_V2_DEFAULT_UNDERGROWTH_BRUSH.seed, 'seed', 1, 2147483647),
    woodFernType: normalizeWoodFernType(source.woodFernType ?? BSB_V2_DEFAULT_UNDERGROWTH_BRUSH.woodFernType),
    speciesMix
  });
}

export function createBsbV2UndergrowthBrushPreview(document, strokeCenters, configuration = {}) {
  assertDocumentShape(document);
  const config = normalizeBsbV2UndergrowthBrushConfig(configuration);
  const centers = normalizeStrokeCenters(strokeCenters);
  if (!centers.length) throw new Error('bsb_undergrowth_brush_stroke_missing');

  const occupied = occupiedTiles(document);
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
        if (x < 0 || y < 0 || x >= document.width || y >= document.height) {
          diagnostics.outOfBounds += 1;
          continue;
        }
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
  const orderedTiles = [...sampledTiles.values()].sort((left, right) => left.y - right.y || left.x - right.x);
  for (const tile of orderedTiles) {
    const terrain = document.tiles[tile.y]?.[tile.x];
    if (terrain === 'water' || terrain === 'rock') {
      diagnostics.terrainBlocked += 1;
      diagnostics.blocked += 1;
      blocked.push(freeze({ x: tile.x, y: tile.y, reason: `terrain:${terrain}` }));
      continue;
    }
    const collision = occupied.get(tileKey(tile.x, tile.y));
    if (collision) {
      diagnostics.occupied += 1;
      diagnostics.blocked += 1;
      blocked.push(freeze({ x: tile.x, y: tile.y, reason: collision }));
      continue;
    }
    const edge = tile.distance / config.radiusTiles;
    const probability = config.density * (1 - config.falloff * edge);
    if (unitRandom(config.seed, document.mapId, tile.x, tile.y, 'density') >= probability) {
      diagnostics.densityRejected += 1;
      continue;
    }
    const species = selectSpecies(config.speciesMix, unitRandom(config.seed, document.mapId, tile.x, tile.y, 'species'));
    const type = species === 'wood_fern' ? config.woodFernType : BSB_V2_UNDERGROWTH_SPECIES_RECIPES[species].defaultType;
    const seed = positiveSeed(config.seed, document.mapId, tile.x, tile.y, species);
    const id = `undergrowth:brush:${config.seed}:${document.revision + 1}:${tile.x}:${tile.y}`;
    candidates.push(freeze({ id, x: tile.x, y: tile.y, type, species, seed }));
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
    contract: BSB_V2_UNDERGROWTH_BRUSH_PREVIEW_CONTRACT,
    previewId: `undergrowth-preview:${previewIdentity}`,
    mapId: document.mapId,
    sourceRevision: document.revision,
    config,
    strokeCenters: Object.freeze(centers.map(freeze)),
    candidates: Object.freeze(candidates),
    blocked: Object.freeze(blocked),
    diagnostics: freeze(diagnostics)
  });
}

export function applyBsbV2UndergrowthBrushPreview(document, preview) {
  assertDocumentShape(document);
  assertPreview(preview, document);
  if (preview.mapId !== document.mapId || preview.sourceRevision !== document.revision) {
    throw new Error(`bsb_undergrowth_brush_preview_stale:${preview.sourceRevision}:${document.revision}`);
  }
  if (!preview.candidates.length) throw new Error('bsb_undergrowth_brush_preview_empty');

  const ids = new Set([
    ...document.sceneObjects.map((record) => record.id),
    ...document.unitPlacements.map((record) => record.id),
    ...document.unitSpawners.map((record) => record.id)
  ]);
  const occupied = occupiedTiles(document);
  const createdRecords = preview.candidates.map((candidate) => {
    if (ids.has(candidate.id)) throw new Error(`bsb_undergrowth_brush_id_collision:${candidate.id}`);
    if (occupied.has(tileKey(candidate.x, candidate.y))) throw new Error(`bsb_undergrowth_brush_collision_changed:${candidate.x}:${candidate.y}`);
    ids.add(candidate.id);
    occupied.set(tileKey(candidate.x, candidate.y), `sceneObject:${candidate.id}`);
    return normalizeBsbV2UndergrowthRecord({
      id: candidate.id,
      type: candidate.type,
      x: candidate.x,
      y: candidate.y,
      undergrowth: createBsbV2UndergrowthDefinition({ seed: candidate.seed, species: candidate.species }, candidate)
    });
  });
  const beforeRevision = document.revision;
  const nextDocument = {
    ...clone(document),
    revision: beforeRevision + 1,
    updatedAt: new Date().toISOString(),
    sceneObjects: [...clone(document.sceneObjects), ...createdRecords]
  };
  const receiptId = `undergrowth-brush:${preview.previewId.split(':').at(-1)}:${nextDocument.revision}`;
  return freeze({
    contract: BSB_V2_UNDERGROWTH_BRUSH_RECEIPT_CONTRACT,
    receiptId,
    operation: 'paint',
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

export function undoBsbV2UndergrowthBrush(document, receipt) {
  assertDocumentShape(document);
  if (receipt?.contract !== BSB_V2_UNDERGROWTH_BRUSH_RECEIPT_CONTRACT || receipt?.operation !== 'paint') {
    throw new Error('bsb_undergrowth_brush_receipt_invalid');
  }
  if (!Array.isArray(receipt.createdIds) || !receipt.createdIds.length || new Set(receipt.createdIds).size !== receipt.createdIds.length) {
    throw new Error('bsb_undergrowth_brush_receipt_ids_invalid');
  }
  if (receipt.mapId !== document.mapId || receipt.afterRevision !== document.revision) {
    throw new Error(`bsb_undergrowth_brush_undo_stale:${receipt.afterRevision ?? 'missing'}:${document.revision}`);
  }
  const removalIds = new Set(receipt.createdIds ?? []);
  const presentIds = new Set(document.sceneObjects.map((record) => record.id));
  for (const id of removalIds) if (!presentIds.has(id)) throw new Error(`bsb_undergrowth_brush_undo_record_missing:${id}`);
  const beforeRevision = document.revision;
  const nextDocument = {
    ...clone(document),
    revision: beforeRevision + 1,
    updatedAt: new Date().toISOString(),
    sceneObjects: clone(document.sceneObjects.filter((record) => !removalIds.has(record.id)))
  };
  return freeze({
    contract: BSB_V2_UNDERGROWTH_BRUSH_RECEIPT_CONTRACT,
    receiptId: `${receipt.receiptId}:undo:${nextDocument.revision}`,
    operation: 'undo',
    originalReceiptId: receipt.receiptId,
    mapId: document.mapId,
    beforeRevision,
    afterRevision: nextDocument.revision,
    removedIds: Object.freeze([...removalIds]),
    removedCount: removalIds.size,
    document: nextDocument
  });
}

function normalizeSpeciesMix(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('bsb_undergrowth_brush_species_mix_invalid');
  const weights = {};
  let total = 0;
  for (const species of BSB_V2_UNDERGROWTH_BRUSH_SPECIES) {
    const value = Number(source[species] ?? 0);
    if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(`bsb_undergrowth_brush_species_weight_invalid:${species}`);
    weights[species] = value;
    total += value;
  }
  if (total <= 0) throw new Error('bsb_undergrowth_brush_species_mix_empty');
  for (const species of BSB_V2_UNDERGROWTH_BRUSH_SPECIES) weights[species] = round(weights[species] / total);
  const normalizedTotal = BSB_V2_UNDERGROWTH_BRUSH_SPECIES.reduce((sum, species) => sum + weights[species], 0);
  weights[BSB_V2_UNDERGROWTH_BRUSH_SPECIES.at(-1)] = round(weights[BSB_V2_UNDERGROWTH_BRUSH_SPECIES.at(-1)] + (1 - normalizedTotal));
  return Object.freeze(weights);
}

function selectSpecies(mix, sample) {
  let cursor = 0;
  for (const species of BSB_V2_UNDERGROWTH_BRUSH_SPECIES) {
    cursor += mix[species];
    if (sample < cursor) return species;
  }
  return BSB_V2_UNDERGROWTH_BRUSH_SPECIES.at(-1);
}

function normalizeWoodFernType(value) {
  const type = String(value ?? '').trim();
  if (!['fern_patch', 'smouldering_fern'].includes(type)) throw new Error(`bsb_undergrowth_brush_wood_fern_type_invalid:${type || 'missing'}`);
  return type;
}

function normalizeStrokeCenters(source) {
  if (!Array.isArray(source)) throw new Error('bsb_undergrowth_brush_stroke_invalid');
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

function occupiedTiles(document) {
  const occupied = new Map();
  occupied.set(tileKey(document.spawn.x, document.spawn.y), 'playerSpawn');
  for (let y = document.escapeZone.y; y < document.escapeZone.y + document.escapeZone.h; y += 1) {
    for (let x = document.escapeZone.x; x < document.escapeZone.x + document.escapeZone.w; x += 1) occupied.set(tileKey(x, y), 'escapeZone');
  }
  for (const [collection, records] of [
    ['sceneObject', document.sceneObjects],
    ['unit', document.unitPlacements],
    ['spawner', document.unitSpawners]
  ]) {
    for (const record of records) occupied.set(tileKey(record.x, record.y), `${collection}:${record.id}`);
  }
  return occupied;
}

function assertDocumentShape(document) {
  if (!document || typeof document !== 'object' || !Array.isArray(document.tiles)) throw new Error('bsb_undergrowth_brush_document_invalid');
  for (const field of ['sceneObjects', 'unitPlacements', 'unitSpawners']) {
    if (!Array.isArray(document[field])) throw new Error(`bsb_undergrowth_brush_document_invalid:${field}`);
  }
  integer(document.width, 'document.width', 1, 256);
  integer(document.height, 'document.height', 1, 256);
  integer(document.revision, 'document.revision', 0, Number.MAX_SAFE_INTEGER);
  if (!document.mapId || !document.spawn || !document.escapeZone) throw new Error('bsb_undergrowth_brush_document_invalid:identity');
}

function assertPreview(preview, document) {
  if (preview?.contract !== BSB_V2_UNDERGROWTH_BRUSH_PREVIEW_CONTRACT || !Array.isArray(preview.candidates)) {
    throw new Error('bsb_undergrowth_brush_preview_invalid');
  }
  if (typeof preview.previewId !== 'string' || !preview.previewId.startsWith('undergrowth-preview:')) throw new Error('bsb_undergrowth_brush_preview_identity_invalid');
  integer(preview.sourceRevision, 'preview.sourceRevision', 0, Number.MAX_SAFE_INTEGER);
  const config = normalizeBsbV2UndergrowthBrushConfig(preview.config);
  const candidateIds = new Set();
  const candidateTiles = new Set();
  for (const candidate of preview.candidates) {
    if (!BSB_V2_UNDERGROWTH_BRUSH_SPECIES.includes(candidate?.species)) throw new Error(`bsb_undergrowth_brush_candidate_species_invalid:${candidate?.species ?? 'missing'}`);
    const expectedType = candidate.species === 'wood_fern' ? config.woodFernType : BSB_V2_UNDERGROWTH_SPECIES_RECIPES[candidate.species].defaultType;
    if (candidate.type !== expectedType) throw new Error(`bsb_undergrowth_brush_candidate_type_invalid:${candidate.type ?? 'missing'}`);
    integer(candidate.x, 'candidate.x', 0, document.width - 1);
    integer(candidate.y, 'candidate.y', 0, document.height - 1);
    integer(candidate.seed, 'candidate.seed', 1, 2147483647);
    if (!/^[a-z0-9][a-z0-9._:-]*$/i.test(candidate.id || '') || candidateIds.has(candidate.id)) throw new Error(`bsb_undergrowth_brush_candidate_id_invalid:${candidate.id ?? 'missing'}`);
    const key = tileKey(candidate.x, candidate.y);
    if (candidateTiles.has(key)) throw new Error(`bsb_undergrowth_brush_candidate_tile_duplicate:${key}`);
    candidateIds.add(candidate.id);
    candidateTiles.add(key);
  }
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
  if (!Number.isInteger(numeric) || numeric < min || numeric > max) throw new Error(`bsb_undergrowth_brush_integer_invalid:${label}`);
  return numeric;
}
function decimal(value, label, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) throw new Error(`bsb_undergrowth_brush_number_invalid:${label}`);
  return round(numeric);
}
function round(value) { return Math.round(value * 1e6) / 1e6; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function freeze(value) { return Object.freeze(value); }
