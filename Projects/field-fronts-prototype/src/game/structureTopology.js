import { CONSTRUCTION_STATES, GATE_STATES, isStructureEntity } from './structureRegistry.js';

export function getStructureCollisionBody(structure) {
  if (!isStructureEntity(structure)) {
    return null;
  }
  const collision = structure.collision ?? {};
  const footprint = structure.footprint ?? {};
  const position = structure.position ?? structure.tile ?? { x: 0, y: 0 };
  const fallbackDiameter = Number.isFinite(collision.radius) ? collision.radius * 2 : 0;
  const width = Math.max(0, Number(footprint.width ?? collision.width ?? fallbackDiameter) || 0);
  const height = Math.max(0, Number(footprint.height ?? collision.height ?? fallbackDiameter) || 0);
  return {
    id: structure.id,
    type: structure.type,
    factionId: structure.factionId,
    constructionState: structure.construction?.state,
    position: {
      x: Number(position.x) || 0,
      y: Number(position.y) || 0
    },
    tile: {
      x: Math.round(Number(structure.tile?.x ?? position.x) || 0),
      y: Math.round(Number(structure.tile?.y ?? position.y) || 0)
    },
    orientation: normaliseOrientation(structure.orientation),
    layer: collision.layer ?? 'building',
    shape: collision.shape === 'rect' ? 'rect' : 'circle',
    width,
    height,
    radius: Math.max(0, collision.radius ?? footprint.radius ?? Math.max(width, height) / 2),
    solid: Boolean(collision.solid),
    blocksMovement: Boolean(collision.blocksMovement),
    blocksProjectiles: Boolean(collision.blocksProjectiles),
    receivesProjectiles: Boolean(collision.receivesProjectiles),
    separationWeight: Math.max(0, Number(collision.separationWeight) || 0),
    nav: {
      blocksFlowField: Boolean(structure.nav?.blocksFlowField),
      movementCostModifier: positiveNumber(structure.nav?.movementCostModifier, 1),
      allowsFriendlyPassage: Boolean(structure.nav?.allowsFriendlyPassage),
      allowsEnemyPassage: Boolean(structure.nav?.allowsEnemyPassage),
      gateState: Object.values(GATE_STATES).includes(structure.nav?.gateState) ? structure.nav.gateState : null
    }
  };
}

export function collectCompletedStructureBlockers(game, { factionId = null } = {}) {
  return (game?.structures ?? [])
    .filter((structure) => structure?.construction?.state === CONSTRUCTION_STATES.complete)
    .map(getStructureCollisionBody)
    .filter((body) => body && body.blocksMovement && body.nav.blocksFlowField && isBodyBlockingForFaction(body, factionId));
}

export function collectStructureMovementModifiers(game) {
  return (game?.structures ?? [])
    .filter((structure) => structure?.construction?.state === CONSTRUCTION_STATES.complete)
    .filter((structure) => !structure.collision?.blocksMovement && !structure.nav?.blocksFlowField)
    .filter((structure) => Number.isFinite(structure.nav?.movementCostModifier) && structure.nav.movementCostModifier !== 1)
    .map((structure) => ({
      id: structure.id,
      type: structure.type,
      factionId: structure.factionId,
      position: { ...structure.position },
      tile: { ...structure.tile },
      orientation: normaliseOrientation(structure.orientation),
      shape: structure.footprint?.shape ?? 'rect',
      width: Math.max(0, Number(structure.footprint?.width) || 0),
      height: Math.max(0, Number(structure.footprint?.height) || 0),
      radius: Math.max(0, Number(structure.footprint?.radius) || 0),
      movementCostModifier: positiveNumber(structure.nav?.movementCostModifier, 1),
      grantsCover: Boolean(structure.combat?.grantsCover),
      coverRating: Number.isFinite(structure.combat?.coverRating) ? structure.combat.coverRating : 0
    }));
}

export function createStructureBlockerSignature(game) {
  return collectCompletedStructureBlockers(game)
    .map((body) => [
      body.id,
      body.type,
      body.factionId,
      round3(body.position.x),
      round3(body.position.y),
      body.shape,
      round3(body.orientation.angleRadians),
      round3(body.width),
      round3(body.height),
      round3(body.radius),
      body.nav.gateState ?? '',
      body.nav.allowsFriendlyPassage ? 'f' : '',
      body.nav.allowsEnemyPassage ? 'e' : ''
    ].join(','))
    .sort()
    .join('|');
}

export function createStructureMovementModifierSignature(game) {
  return collectStructureMovementModifiers(game)
    .map((modifier) => [
      modifier.id,
      modifier.type,
      modifier.factionId,
      round3(modifier.position.x),
      round3(modifier.position.y),
      modifier.shape,
      round3(modifier.orientation.angleRadians),
      round3(modifier.width),
      round3(modifier.height),
      round3(modifier.radius),
      round3(modifier.movementCostModifier)
    ].join(','))
    .sort()
    .join('|');
}

export function createStructureNavigationSignature(game) {
  const blockerSignature = createStructureBlockerSignature(game);
  const modifierSignature = createStructureMovementModifierSignature(game);
  return [blockerSignature || 'blockers:none', modifierSignature || 'modifiers:none'].join('/');
}

export function summarizeStructureTopology(game) {
  const structures = game?.structures ?? [];
  const completeStructures = structures.filter((structure) => structure?.construction?.state === CONSTRUCTION_STATES.complete);
  const occupiableStructures = structures.filter((structure) => structure?.occupancy?.enabled && (structure.occupancy.capacitySquads ?? 0) > 0);
  const blockers = collectCompletedStructureBlockers(game);
  const modifiers = collectStructureMovementModifiers(game);
  return {
    totalStructures: structures.length,
    completeStructures: completeStructures.length,
    occupiableStructures: occupiableStructures.length,
    blockerStructures: blockers.length,
    trenchModifiers: modifiers.filter((modifier) => modifier.type === 'trench_segment').length,
    navSignature: createStructureNavigationSignature(game)
  };
}

export function getStructureNavigationIndex(game, map, factionId = null) {
  if (!game || !map) {
    return createEmptyNavigationIndex();
  }
  const cacheKey = [
    map.width,
    map.height,
    factionId ?? 'any',
    createStructureNavigationSignature(game)
  ].join(':');
  const cacheRoot = game._runtimeCache?.structureNavigation;
  if (cacheRoot?.key === cacheKey) {
    return cacheRoot.index;
  }

  const blockers = collectCompletedStructureBlockers(game, { factionId });
  const modifiers = collectStructureMovementModifiers(game);
  const index = {
    blockerSignature: createStructureBlockerSignature(game),
    modifierSignature: createStructureMovementModifierSignature(game),
    blockedTiles: new Map(),
    movementModifiers: new Map(),
    blockers,
    modifiers
  };

  blockers.forEach((body) => {
    forEachBodyTile(map, body, (tile) => {
      index.blockedTiles.set(tileKey(tile), body);
    });
  });

  modifiers.forEach((modifier) => {
    forEachModifierTile(map, modifier, (tile) => {
      const key = tileKey(tile);
      const existing = index.movementModifiers.get(key);
      if (!existing || modifier.movementCostModifier > existing.movementCostModifier) {
        index.movementModifiers.set(key, modifier);
      }
    });
  });

  game._runtimeCache = {
    ...(game._runtimeCache ?? {}),
    structureNavigation: {
      key: cacheKey,
      index
    }
  };
  return index;
}

export function isTileBlockedByStructure(game, map, tile, factionId = null) {
  return getStructureNavigationIndex(game, map, factionId).blockedTiles.has(tileKey(tile));
}

export function getStructureMovementCostModifier(game, map, tile, factionId = null) {
  return getStructureNavigationIndex(game, map, factionId).movementModifiers.get(tileKey(tile))?.movementCostModifier ?? 1;
}

function isBodyBlockingForFaction(body, factionId) {
  if (body.type !== 'gate') {
    return true;
  }
  if (body.nav.gateState !== GATE_STATES.open) {
    return true;
  }
  if (factionId && body.factionId === factionId && body.nav.allowsFriendlyPassage) {
    return false;
  }
  if (factionId && body.factionId !== factionId && body.nav.allowsEnemyPassage) {
    return false;
  }
  return true;
}

function forEachBodyTile(map, body, visit) {
  forEachBoundedTile(map, bodyBounds(body), (tile) => {
    if (bodyContainsTile(body, tile)) {
      visit(tile);
    }
  });
}

function forEachModifierTile(map, modifier, visit) {
  const bounds = modifierBounds(modifier);
  forEachBoundedTile(map, bounds, (tile) => {
    if (modifierContainsTile(modifier, tile)) {
      visit(tile);
    }
  });
}

function bodyContainsTile(body, tile) {
  if (body.shape === 'circle') {
    const radius = Math.max(0.45, body.radius);
    return Math.hypot(tile.x - body.position.x, tile.y - body.position.y) <= radius;
  }
  return orientedRectContainsTile(body, tile);
}

function modifierContainsTile(modifier, tile) {
  if (modifier.shape === 'circle') {
    const radius = Math.max(0.45, modifier.radius);
    return Math.hypot(tile.x - modifier.position.x, tile.y - modifier.position.y) <= radius;
  }
  return orientedRectContainsTile(modifier, tile);
}

function orientedRectContainsTile(body, tile) {
  const halfWidth = Math.max(0.45, body.width / 2);
  const halfHeight = Math.max(0.45, body.height / 2);
  const local = rotatePointAround(tile, body.position, -(body.orientation?.angleRadians ?? 0));
  return Math.abs(local.x - body.position.x) <= halfWidth && Math.abs(local.y - body.position.y) <= halfHeight;
}

function bodyBounds(body) {
  const radius = body.shape === 'circle' ? Math.max(0.45, body.radius) : orientedRectRadius(body);
  return {
    minX: Math.floor(body.position.x - radius),
    maxX: Math.ceil(body.position.x + radius),
    minY: Math.floor(body.position.y - radius),
    maxY: Math.ceil(body.position.y + radius)
  };
}

function modifierBounds(modifier) {
  const radius = modifier.shape === 'circle' ? Math.max(0.45, modifier.radius) : orientedRectRadius(modifier);
  return {
    minX: Math.floor(modifier.position.x - radius),
    maxX: Math.ceil(modifier.position.x + radius),
    minY: Math.floor(modifier.position.y - radius),
    maxY: Math.ceil(modifier.position.y + radius)
  };
}

function orientedRectRadius(body) {
  return Math.max(0.45, Math.hypot(body.width / 2, body.height / 2));
}

function rotatePointAround(point, origin, angleRadians = 0) {
  if (!Number.isFinite(angleRadians) || Math.abs(angleRadians) < 0.0001) {
    return point;
  }
  const cos = Math.cos(angleRadians);
  const sin = Math.sin(angleRadians);
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos
  };
}

function forEachBoundedTile(map, bounds, visit) {
  const minX = clamp(0, map.width - 1, bounds.minX);
  const maxX = clamp(0, map.width - 1, bounds.maxX);
  const minY = clamp(0, map.height - 1, bounds.minY);
  const maxY = clamp(0, map.height - 1, bounds.maxY);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      visit({ x, y });
    }
  }
}

function createEmptyNavigationIndex() {
  return {
    blockerSignature: '',
    modifierSignature: '',
    blockedTiles: new Map(),
    movementModifiers: new Map(),
    blockers: [],
    modifiers: []
  };
}

function normaliseOrientation(orientation = {}) {
  const radians = Number(orientation?.angleRadians);
  const tangent = orientation?.tangent ?? {};
  return {
    angleRadians: Number.isFinite(radians) ? radians : 0,
    tangent: {
      x: Number.isFinite(tangent.x) ? Math.sign(tangent.x) : 1,
      y: Number.isFinite(tangent.y) ? Math.sign(tangent.y) : 0
    }
  };
}

function positiveNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function tileKey(tile) {
  return `${tile.x},${tile.y}`;
}

function clamp(min, max, value) {
  return Math.max(min, Math.min(max, value));
}

function round3(value) {
  return Math.round(Number(value) * 1000) / 1000;
}
