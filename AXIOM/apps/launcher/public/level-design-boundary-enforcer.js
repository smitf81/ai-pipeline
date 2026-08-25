export const PLAYABLE_BOUNDARY_PREVIEW_CONTRACT = 'axiom.playable-boundary-preview.v1';
export const PLAYABLE_BOUNDARY_RECEIPT_CONTRACT = 'axiom.playable-boundary-receipt.v1';
export const RUNTIME_TRAVERSAL_AUDIT_CONTRACT = 'axiom.runtime-traversal-audit.v1';

export function createPlayableBoundaryPreview(source, input = {}) {
  assertDocument(source);
  const boundaries = source.playableSpace?.boundaries;
  if (!boundaries) throw new Error('playable_boundary_intent_missing');
  const shortcutPolicy = String(boundaries.shortcutPolicy || 'controlled');
  if (shortcutPolicy === 'open') throw new Error('playable_boundary_enforcement_not_required');
  const route = expandRoute(source.playableSpace.route?.waypoints || []);
  if (route.length < 2) throw new Error('playable_boundary_route_missing');
  const envelope = normalizeEnvelope(boundaries.envelope, route.length, boundaries.corridorHalfWidthTiles);
  const corridorInsetTiles = integer(input.corridorInsetTiles ?? 0, 'corridorInsetTiles', 0, 6);
  const tileChanges = [];
  for (let y = 1; y < source.height - 1; y += 1) {
    for (let x = 1; x < source.width - 1; x += 1) {
      if (source.tiles[y]?.[x] === 'rock') continue;
      const nearest = nearestRoutePoint(route, x, y);
      const halfWidth = Math.max(3, envelopeHalfWidth(envelope, nearest.index) - corridorInsetTiles);
      if (nearest.distance < halfWidth + .2 || nearest.distance > halfWidth + 2.35) continue;
      tileChanges.push(Object.freeze({ x, y, before: source.tiles[y][x], after: 'rock' }));
    }
  }
  if (!tileChanges.length) throw new Error('playable_boundary_preview_empty');
  const preparedDocument = clone(source);
  for (const change of tileChanges) preparedDocument.tiles[change.y][change.x] = change.after;
  preparedDocument.revision = source.revision + 1;
  preparedDocument.updatedAt = new Date().toISOString();
  preparedDocument.playableSpace.boundaries = {
    ...clone(boundaries),
    enforcementStatus: 'runtime_audit_candidate',
    compiler: {
      contract: 'axiom.natural-ridge-boundary-compiler.v1',
      collisionMaterial: 'rock',
      visible: true,
      tileCount: tileChanges.length,
      corridorInsetTiles
    }
  };
  return Object.freeze({
    contract: PLAYABLE_BOUNDARY_PREVIEW_CONTRACT,
    previewId: `boundary_preview_${source.revision}_${stableHash(`${source.mapId}:${tileChanges.length}:${corridorInsetTiles}`)}`,
    classification: 'projection',
    mapId: source.mapId,
    sourceRevision: source.revision,
    candidateRevision: preparedDocument.revision,
    shortcutPolicy,
    boundaryStyle: String(boundaries.style || boundaries.boundaryStyle || 'mixed_natural'),
    corridorInsetTiles,
    candidateCount: tileChanges.length,
    candidates: Object.freeze(tileChanges),
    preparedDocument
  });
}

export function applyPlayableBoundaryPreview(source, preview, audit, input = {}) {
  assertDocument(source);
  if (preview?.contract !== PLAYABLE_BOUNDARY_PREVIEW_CONTRACT) throw new Error('playable_boundary_preview_contract_invalid');
  if (preview.mapId !== source.mapId || preview.sourceRevision !== source.revision) {
    throw new Error(`playable_boundary_preview_stale:${preview?.sourceRevision}:${source.revision}`);
  }
  if (audit?.contract !== RUNTIME_TRAVERSAL_AUDIT_CONTRACT) throw new Error('playable_boundary_runtime_audit_contract_invalid');
  if (audit.mapId !== source.mapId || audit.mapRevision !== preview.candidateRevision) throw new Error('playable_boundary_runtime_audit_binding_mismatch');
  if (audit.pass !== true) throw new Error(`playable_boundary_runtime_audit_failed:${audit.failureReason || 'shortcut_exposed'}`);
  const document = clone(preview.preparedDocument);
  document.playableSpace.boundaries = {
    ...document.playableSpace.boundaries,
    enforcementStatus: 'runtime_verified',
    verifiedAt: audit.auditedAt,
    runtimeAudit: compactAudit(audit)
  };
  const sessionId = identifier(input.sessionId, 'sessionId');
  return Object.freeze({
    document,
    receipt: Object.freeze({
      contract: PLAYABLE_BOUNDARY_RECEIPT_CONTRACT,
      receiptId: `boundary_receipt_${document.revision}_${stableHash(`${sessionId}:${preview.previewId}`)}`,
      operation: 'boundary_enforcement',
      sessionId,
      mapId: source.mapId,
      previewId: preview.previewId,
      beforeRevision: source.revision,
      afterRevision: document.revision,
      createdIds: Object.freeze([]),
      createdCount: 0,
      changedTileCount: preview.candidateCount,
      tileChanges: preview.candidates,
      runtimeAudit: compactAudit(audit),
      appliedAt: new Date().toISOString()
    })
  });
}

export function expandPlayableRouteWaypoints(waypoints) {
  return expandRoute(waypoints);
}

function normalizeEnvelope(value, routeLength, fallback) {
  const rows = Array.isArray(value) ? value : [];
  const normalized = rows.map((entry, index) => ({
    routeIndex: clamp(integer(entry?.routeIndex, `envelope:${index}:routeIndex`, 0, routeLength - 1), 0, routeLength - 1),
    halfWidthTiles: boundedNumber(entry?.halfWidthTiles, `envelope:${index}:halfWidthTiles`, 3, 24)
  })).sort((a, b) => a.routeIndex - b.routeIndex);
  if (!normalized.length) {
    normalized.push({ routeIndex: 0, halfWidthTiles: boundedNumber(fallback ?? 7, 'corridorHalfWidthTiles', 3, 24) });
    normalized.push({ routeIndex: routeLength - 1, halfWidthTiles: normalized[0].halfWidthTiles });
  }
  if (normalized[0].routeIndex > 0) normalized.unshift({ routeIndex: 0, halfWidthTiles: normalized[0].halfWidthTiles });
  if (normalized.at(-1).routeIndex < routeLength - 1) normalized.push({ routeIndex: routeLength - 1, halfWidthTiles: normalized.at(-1).halfWidthTiles });
  return normalized;
}

function envelopeHalfWidth(envelope, routeIndex) {
  for (let index = 1; index < envelope.length; index += 1) {
    const left = envelope[index - 1];
    const right = envelope[index];
    if (routeIndex > right.routeIndex) continue;
    const span = Math.max(1, right.routeIndex - left.routeIndex);
    const fraction = clamp((routeIndex - left.routeIndex) / span, 0, 1);
    return left.halfWidthTiles + (right.halfWidthTiles - left.halfWidthTiles) * fraction;
  }
  return envelope.at(-1).halfWidthTiles;
}

function nearestRoutePoint(route, x, y) {
  let best = { index: 0, distance: Number.POSITIVE_INFINITY };
  for (let index = 0; index < route.length; index += 1) {
    const distance = Math.hypot(route[index].x - x, route[index].y - y);
    if (distance < best.distance) best = { index, distance };
  }
  return best;
}

function expandRoute(waypoints) {
  if (!Array.isArray(waypoints) || !waypoints.length) return [];
  const points = [{ x: integer(waypoints[0]?.x, 'waypoint:0:x', 0, 100000), y: integer(waypoints[0]?.y, 'waypoint:0:y', 0, 100000) }];
  waypoints.slice(1).forEach((targetValue, targetIndex) => {
    const target = { x: integer(targetValue?.x, `waypoint:${targetIndex + 1}:x`, 0, 100000), y: integer(targetValue?.y, `waypoint:${targetIndex + 1}:y`, 0, 100000) };
    let { x, y } = points.at(-1);
    const dx = Math.abs(target.x - x);
    const sx = x < target.x ? 1 : -1;
    const dy = -Math.abs(target.y - y);
    const sy = y < target.y ? 1 : -1;
    let error = dx + dy;
    while (x !== target.x || y !== target.y) {
      const doubled = error * 2;
      if (doubled >= dy) { error += dy; x += sx; }
      if (doubled <= dx) { error += dx; y += sy; }
      points.push({ x, y });
    }
  });
  return points;
}

function compactAudit(audit) {
  return Object.freeze({
    contract: audit.contract,
    pass: audit.pass,
    reachable: audit.reachable,
    shortcutPolicy: audit.shortcutPolicy,
    shortestPathTiles: audit.shortestPathTiles,
    intendedRouteTiles: audit.intendedRouteTiles,
    shortcutRatio: audit.shortcutRatio,
    minimumShortcutRatio: audit.minimumShortcutRatio,
    collisionShapeCount: audit.collisionShapeCount,
    canonicalSources: clone(audit.canonicalSources),
    auditedAt: audit.auditedAt
  });
}

function assertDocument(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('playable_boundary_document_missing');
  identifier(value.mapId, 'mapId');
  integer(value.revision, 'revision', 0, Number.MAX_SAFE_INTEGER);
  integer(value.width, 'width', 4, 256);
  integer(value.height, 'height', 4, 256);
  if (!Array.isArray(value.tiles) || value.tiles.length !== value.height) throw new Error('playable_boundary_tiles_invalid');
}

function identifier(value, label) {
  const result = String(value || '').trim();
  if (!/^[a-z0-9:_-]{1,180}$/i.test(result)) throw new Error(`playable_boundary_identifier_invalid:${label}`);
  return result;
}

function integer(value, label, minimum, maximum) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < minimum || result > maximum) throw new Error(`playable_boundary_integer_invalid:${label}`);
  return result;
}

function boundedNumber(value, label, minimum, maximum) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < minimum || result > maximum) throw new Error(`playable_boundary_number_invalid:${label}`);
  return result;
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value || '')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
