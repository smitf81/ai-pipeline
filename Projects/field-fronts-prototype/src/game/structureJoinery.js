import { getStructureDefinition } from './structureRegistry.js';

export const STRUCTURE_JOIN_FAMILIES = Object.freeze({
  wall: 'wall',
  trench: 'trench',
  stronghold: 'stronghold'
});

export function getStructureJoinProfile(type) {
  const definition = getStructureDefinition(type);
  const joinery = definition?.joinery ?? {};
  return {
    family: joinery.family ?? null,
    sketchable: Boolean(joinery.sketchable),
    connectable: Boolean(joinery.connectable),
    allowsPathBlueprint: Boolean(joinery.allowsPathBlueprint ?? joinery.sketchable),
    canConnectTo: Array.isArray(joinery.canConnectTo) ? [...joinery.canConnectTo] : [],
    acceptsConnectionsFrom: Array.isArray(joinery.acceptsConnectionsFrom) ? [...joinery.acceptsConnectionsFrom] : [],
    placement: joinery.placement ?? 'single',
    builtOn: Array.isArray(joinery.builtOn) ? [...joinery.builtOn] : [],
    adjacentTo: Array.isArray(joinery.adjacentTo) ? [...joinery.adjacentTo] : []
  };
}

export function isSketchableStructureType(type) {
  return Boolean(getStructureJoinProfile(type).allowsPathBlueprint);
}

export function canStructuresJoin(sourceType, targetType) {
  if (!sourceType || !targetType) {
    return false;
  }
  if (sourceType === targetType) {
    const profile = getStructureJoinProfile(sourceType);
    return profile.connectable || profile.sketchable;
  }
  const source = getStructureJoinProfile(sourceType);
  const target = getStructureJoinProfile(targetType);
  return source.canConnectTo.includes(targetType)
    || target.acceptsConnectionsFrom.includes(sourceType)
    || source.adjacentTo.includes(targetType)
    || target.adjacentTo.includes(sourceType)
    || (source.family && target.family && source.family === target.family && source.connectable && target.connectable);
}

export function canStructureUseExistingTile(sourceType, existingStructure) {
  if (!existingStructure) {
    return false;
  }
  if (sourceType === existingStructure.type) {
    return true;
  }
  const profile = getStructureJoinProfile(sourceType);
  return profile.builtOn.includes(existingStructure.type) || canStructuresJoin(sourceType, existingStructure.type);
}

export function materialiseStructureSketchPath(path = []) {
  const source = normalisePath(path);
  if (source.length === 0) {
    return [];
  }
  const tiles = [];
  for (let index = 0; index < source.length - 1; index += 1) {
    const segment = bresenhamLine(source[index], source[index + 1]);
    segment.forEach((tile) => appendUniqueTile(tiles, tile));
  }
  if (tiles.length === 0) {
    appendUniqueTile(tiles, source[0]);
  }
  return tiles;
}

export function enrichStructureSketchTiles(type, tiles = [], connectors = []) {
  const profile = getStructureJoinProfile(type);
  const dedupedConnectors = dedupeConnectors(connectors);
  return tiles.map((tile, index) => {
    const previous = tiles[index - 1] ?? null;
    const next = tiles[index + 1] ?? null;
    const orientation = createSegmentOrientation(previous, tile, next);
    const localConnections = [];
    if (previous) localConnections.push(createConnectionRef(tile, previous, 'previous', type, 'tail'));
    if (next) localConnections.push(createConnectionRef(tile, next, 'next', type, 'nose'));
    dedupedConnectors
      .filter((connector) => areAdjacentOrSame(tile, connector.tile ?? connector.position))
      .forEach((connector) => {
        localConnections.push({
          kind: 'structure',
          direction: directionFromTo(tile, connector.tile ?? connector.position),
          structureId: connector.id,
          structureType: connector.type,
          distance: tileDistance(tile, connector.tile ?? connector.position),
          socket: connector.socket ?? directionFromTo(connector.tile ?? connector.position, tile),
          socketRole: connector.socketRole ?? connector.mode ?? 'adjacent'
        });
      });
    const joinMask = createJoinMask(localConnections);
    return {
      tile: { x: tile.x, y: tile.y },
      position: { x: tile.x, y: tile.y },
      orientation,
      joinery: {
        family: profile.family,
        pathBlueprint: true,
        segmentIndex: index,
        segmentCount: tiles.length,
        connections: localConnections,
        joinMask,
        junction: createJoinJunction(previous, tile, next, localConnections, joinMask)
      }
    };
  });
}

export function createSegmentOrientation(previous, current, next) {
  const incoming = previous
    ? { x: Math.sign(current.x - previous.x), y: Math.sign(current.y - previous.y) }
    : null;
  const outgoing = next
    ? { x: Math.sign(next.x - current.x), y: Math.sign(next.y - current.y) }
    : null;
  const role = getSegmentRole(incoming, outgoing);
  const resolved = resolveSegmentTangent(incoming, outgoing, role);
  const dx = resolved.x;
  const dy = resolved.y;
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const angleRadians = Math.atan2(stepY, stepX || 0.0001);
  const degrees = normaliseDegrees(angleRadians * 180 / Math.PI);
  return {
    angleRadians: round3(angleRadians),
    degrees: round3(degrees),
    direction: directionName(stepX, stepY),
    tangent: { x: stepX, y: stepY },
    incoming: incoming ? directionName(incoming.x, incoming.y) : null,
    outgoing: outgoing ? directionName(outgoing.x, outgoing.y) : null,
    role
  };
}

export function createJoinMask(connections = []) {
  const mask = { n: false, e: false, s: false, w: false, ne: false, nw: false, se: false, sw: false, same: false };
  connections.forEach((connection) => {
    const key = connection.direction;
    if (Object.prototype.hasOwnProperty.call(mask, key)) {
      mask[key] = true;
    }
  });
  return mask;
}

export function areAdjacentOrSame(a, b) {
  if (!a || !b) {
    return false;
  }
  return Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;
}

export function directionFromTo(a, b) {
  if (!a || !b) return 'same';
  const dx = Math.sign(b.x - a.x);
  const dy = Math.sign(b.y - a.y);
  return directionName(dx, dy);
}

function createConnectionRef(origin, target, kind, type, socketRole = null) {
  return {
    kind,
    direction: directionFromTo(origin, target),
    structureType: type,
    distance: tileDistance(origin, target),
    socket: directionFromTo(target, origin),
    socketRole
  };
}

function createJoinJunction(previous, tile, next, connections, joinMask) {
  const pathDirections = connections
    .filter((connection) => connection.kind === 'previous' || connection.kind === 'next')
    .map((connection) => connection.direction);
  const structureDirections = connections
    .filter((connection) => connection.kind === 'structure')
    .map((connection) => connection.direction);
  const role = getSegmentRole(
    previous ? { x: Math.sign(tile.x - previous.x), y: Math.sign(tile.y - previous.y) } : null,
    next ? { x: Math.sign(next.x - tile.x), y: Math.sign(next.y - tile.y) } : null
  );
  const directions = uniqueDirections([...pathDirections, ...structureDirections]);
  return {
    role,
    kind: classifyJoinJunction(role, directions),
    pathDirections,
    structureDirections,
    directions,
    degree: directions.length,
    capStart: !previous,
    capEnd: !next
  };
}

function resolveSegmentTangent(incoming, outgoing, role = getSegmentRole(incoming, outgoing)) {
  if (role === 'corner') {
    // Corners are rendered explicitly by joinery. Do not average an L-bend into a fake diagonal,
    // otherwise 90° walls/trenches visually cut the corner and their nav body drifts.
    return outgoing ?? incoming ?? { x: 1, y: 0 };
  }
  if (incoming && outgoing) {
    const x = incoming.x + outgoing.x;
    const y = incoming.y + outgoing.y;
    if (x !== 0 || y !== 0) {
      return { x, y };
    }
  }
  return outgoing ?? incoming ?? { x: 1, y: 0 };
}

function classifyJoinJunction(role, directions = []) {
  const degree = directions.length;
  if (degree >= 4) return 'cross';
  if (degree === 3) return 't';
  if (degree <= 0) return 'isolated';
  if (degree === 1) return role === 'single' ? 'single' : 'end';
  if (directionsContainOpposites(directions)) return 'straight';
  if (role === 'corner' || degree === 2) return 'corner';
  return role;
}

function uniqueDirections(directions = []) {
  return [...new Set(directions.filter((direction) => direction && direction !== 'same'))];
}

function directionsContainOpposites(directions = []) {
  const set = new Set(directions);
  return (set.has('n') && set.has('s'))
    || (set.has('e') && set.has('w'))
    || (set.has('ne') && set.has('sw'))
    || (set.has('nw') && set.has('se'));
}

function getSegmentRole(incoming, outgoing) {
  if (!incoming && !outgoing) return 'single';
  if (!incoming) return 'start';
  if (!outgoing) return 'end';
  if (incoming.x === outgoing.x && incoming.y === outgoing.y) return 'straight';
  if (incoming.x === -outgoing.x && incoming.y === -outgoing.y) return 'through';
  return 'corner';
}

function bresenhamLine(a, b) {
  let x0 = Math.round(a.x);
  let y0 = Math.round(a.y);
  const x1 = Math.round(b.x);
  const y1 = Math.round(b.y);
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  const tiles = [];
  while (true) {
    tiles.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) {
      break;
    }
    const doubledError = 2 * error;
    if (doubledError >= dy) {
      error += dy;
      x0 += sx;
    }
    if (doubledError <= dx) {
      error += dx;
      y0 += sy;
    }
  }
  return tiles;
}

function normalisePath(path) {
  return Array.isArray(path)
    ? path
      .filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y))
      .map((point) => ({ x: Math.round(point.x), y: Math.round(point.y) }))
      .reduce((acc, tile) => {
        appendUniqueTile(acc, tile);
        return acc;
      }, [])
    : [];
}

function appendUniqueTile(tiles, tile) {
  const previous = tiles[tiles.length - 1];
  if (!previous || previous.x !== tile.x || previous.y !== tile.y) {
    tiles.push({ x: tile.x, y: tile.y });
  }
}

function dedupeConnectors(connectors = []) {
  const seen = new Set();
  const out = [];
  connectors.forEach((connector) => {
    const tile = connector.tile ?? connector.position ?? {};
    const key = `${connector.id ?? 'none'}:${connector.mode ?? 'structure'}:${Math.round(tile.x ?? 0)},${Math.round(tile.y ?? 0)}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(connector);
    }
  });
  return out;
}

function directionName(dx, dy) {
  if (dx === 0 && dy === 0) return 'same';
  if (dx === 0 && dy < 0) return 'n';
  if (dx === 0 && dy > 0) return 's';
  if (dx > 0 && dy === 0) return 'e';
  if (dx < 0 && dy === 0) return 'w';
  if (dx > 0 && dy < 0) return 'ne';
  if (dx < 0 && dy < 0) return 'nw';
  if (dx > 0 && dy > 0) return 'se';
  if (dx < 0 && dy > 0) return 'sw';
  return 'same';
}

function normaliseDegrees(value) {
  let degrees = value;
  while (degrees < 0) degrees += 360;
  while (degrees >= 360) degrees -= 360;
  return degrees;
}

function tileDistance(a, b) {
  return Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0));
}

function round3(value) {
  return Math.round(Number(value) * 1000) / 1000;
}
