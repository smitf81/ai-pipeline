export function normalisePoint(point) {
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

export function interpolateTileLine(a, b) {
  const start = normalisePoint(a);
  const end = normalisePoint(b);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = steps === 0 ? 0 : i / steps;
    const p = { x: Math.round(start.x + dx * t), y: Math.round(start.y + dy * t) };
    if (!points.some((q) => q.x === p.x && q.y === p.y)) points.push(p);
  }
  return points;
}

export function materialiseControlPath(controlPoints) {
  const result = [];
  for (let i = 0; i < controlPoints.length - 1; i += 1) {
    const line = interpolateTileLine(controlPoints[i], controlPoints[i + 1]);
    for (const point of line) {
      const last = result[result.length - 1];
      if (!last || last.x !== point.x || last.y !== point.y) result.push(point);
    }
  }
  return result;
}

export function segmentOrientation(a, b) {
  const dx = Math.sign(b.x - a.x);
  const dy = Math.sign(b.y - a.y);
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'east' : 'west';
  if (dy !== 0) return dy > 0 ? 'south' : 'north';
  return 'point';
}

export const TERRAIN_TILE_SPLINE_CONTRACT = 'black-sky-bound.terrain-tile-spline.v0';

export function createTerrainTileSplineSegment({ tile, type, rule }) {
  const directions = rule?.directions ?? [];
  const tangent = resolveRuleTangent(rule);
  return {
    contract: TERRAIN_TILE_SPLINE_CONTRACT,
    source: 'terrain_projection.connected_rule',
    terrainType: type,
    tile: { x: tile.x, y: tile.y },
    orientation: {
      role: rule?.role ?? 'isolated',
      direction: directionName(tangent.x, tangent.y),
      tangent,
      degrees: rule?.rotationDeg ?? 0,
      incoming: directions[0] ?? null,
      outgoing: directions[directions.length - 1] ?? null
    },
    joinery: {
      joinMask: createJoinMaskFromDirections(directions),
      tileRule: rule,
      junction: {
        kind: rule?.role ?? 'isolated',
        directions: [...directions],
        degree: directions.length,
        capStart: directions.length <= 1,
        capEnd: directions.length <= 1
      }
    }
  };
}

function resolveRuleTangent(rule) {
  const directions = rule?.directions ?? [];
  if (rule?.role === 'corner') return directionVector(directions[directions.length - 1]);
  if (rule?.role === 'tee') return directionVector(oppositeDirection(rule.missingDirection));
  if (directions.includes('e') && directions.includes('w')) return { x: 1, y: 0 };
  if (directions.includes('n') && directions.includes('s')) return { x: 0, y: 1 };
  if (directions.length === 1) return directionVector(directions[0]);
  return { x: 0, y: 0 };
}

function createJoinMaskFromDirections(directions) {
  const set = new Set(directions);
  return { n: set.has('n'), e: set.has('e'), s: set.has('s'), w: set.has('w') };
}

function directionVector(direction) {
  switch (direction) {
    case 'n': return { x: 0, y: -1 };
    case 'e': return { x: 1, y: 0 };
    case 's': return { x: 0, y: 1 };
    case 'w': return { x: -1, y: 0 };
    default: return { x: 0, y: 0 };
  }
}

function oppositeDirection(direction) {
  switch (direction) {
    case 'n': return 's';
    case 'e': return 'w';
    case 's': return 'n';
    case 'w': return 'e';
    default: return null;
  }
}

function directionName(dx, dy) {
  if (dx === 0 && dy < 0) return 'north';
  if (dx > 0 && dy === 0) return 'east';
  if (dx === 0 && dy > 0) return 'south';
  if (dx < 0 && dy === 0) return 'west';
  return 'point';
}
