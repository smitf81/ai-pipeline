import { buildBsbV2RuntimeMap } from '../public/bsb-v2-map-authoring.js';
import { expandPlayableRouteWaypoints, RUNTIME_TRAVERSAL_AUDIT_CONTRACT } from '../public/level-design-boundary-enforcer.js';
import { ACTORS } from '../../../../_A_Projects/BLACK_SKY_BOUND_V2/src/data/actors.js';
import { compileEnvironmentCollisionIndex, circleIntersectsEnvironment } from '../../../../_A_Projects/BLACK_SKY_BOUND_V2/src/physics/environmentCollision.js';
import { normalizeRuntimeMap } from '../../../../_A_Projects/BLACK_SKY_BOUND_V2/src/world/runtimeMapLoader.js';

const DIRECTIONS = Object.freeze([
  Object.freeze({ x: 1, y: 0 }), Object.freeze({ x: -1, y: 0 }),
  Object.freeze({ x: 0, y: 1 }), Object.freeze({ x: 0, y: -1 }),
  Object.freeze({ x: 1, y: 1 }), Object.freeze({ x: 1, y: -1 }),
  Object.freeze({ x: -1, y: 1 }), Object.freeze({ x: -1, y: -1 })
]);

export function auditRuntimeTraversal(authoringDocument, input = {}) {
  const runtimeMap = normalizeRuntimeMap(buildBsbV2RuntimeMap(authoringDocument));
  const collision = compileEnvironmentCollisionIndex(runtimeMap);
  const playerRadius = Number(ACTORS.young_dragon?.radius);
  if (!Number.isFinite(playerRadius) || playerRadius <= 0) throw new Error('runtime_traversal_player_radius_missing');
  const route = expandPlayableRouteWaypoints(authoringDocument.playableSpace?.route?.waypoints || []);
  if (route.length < 2) throw new Error('runtime_traversal_route_missing');
  const shortcutPolicy = String(authoringDocument.playableSpace?.boundaries?.shortcutPolicy || 'controlled');
  const minimumShortcutRatio = shortcutPolicy === 'prevent' ? .68 : shortcutPolicy === 'controlled' ? .48 : 0;
  const traversal = findShortestTraversal(runtimeMap, collision, playerRadius);
  const intendedRouteTiles = Math.max(1, route.length - 1);
  const shortcutRatio = traversal.reachable ? round(traversal.distance / intendedRouteTiles, 3) : 0;
  const pass = traversal.reachable && shortcutRatio >= minimumShortcutRatio;
  return Object.freeze({
    contract: RUNTIME_TRAVERSAL_AUDIT_CONTRACT,
    classification: 'canonical_runtime_collision_evidence',
    mapId: authoringDocument.mapId,
    mapRevision: authoringDocument.revision,
    sessionId: String(input.sessionId || '') || null,
    pass,
    failureReason: traversal.reachable ? (pass ? null : 'unintentional_shortcut_exposed') : 'escape_unreachable',
    reachable: traversal.reachable,
    shortcutPolicy,
    playerRadius,
    shortestPathTiles: traversal.reachable ? traversal.distance : null,
    intendedRouteTiles,
    shortcutRatio,
    minimumShortcutRatio,
    collisionShapeCount: collision.shapes.length,
    collisionDiagnostics: collision.diagnostics,
    sampledPath: Object.freeze(traversal.path.filter((_, index) => index % 4 === 0 || index === traversal.path.length - 1).slice(0, 400)),
    canonicalSources: Object.freeze([
      '_A_Projects/BLACK_SKY_BOUND_V2/src/world/terrain.js',
      '_A_Projects/BLACK_SKY_BOUND_V2/src/physics/environmentCollision.js',
      '_A_Projects/BLACK_SKY_BOUND_V2/src/world/runtimeMapLoader.js',
      '_A_Projects/BLACK_SKY_BOUND_V2/src/data/actors.js'
    ]),
    auditedAt: new Date().toISOString()
  });
}

function findShortestTraversal(map, collision, radius) {
  const start = { x: map.spawn.x, y: map.spawn.y };
  const key = (x, y) => y * map.width + x;
  const open = [start];
  let cursor = 0;
  const visited = new Set([key(start.x, start.y)]);
  const parent = new Map();
  const distance = new Map([[key(start.x, start.y), 0]]);
  while (cursor < open.length) {
    const current = open[cursor++];
    const currentKey = key(current.x, current.y);
    if (insideEscape(current, map.escapeZone)) {
      return { reachable: true, distance: distance.get(currentKey), path: reconstructPath(current, parent, map.width) };
    }
    for (const direction of DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      if (next.x < 0 || next.y < 0 || next.x >= map.width || next.y >= map.height) continue;
      const nextKey = key(next.x, next.y);
      if (visited.has(nextKey)) continue;
      const fromX = current.x + .5;
      const fromY = current.y + .5;
      const toX = next.x + .5;
      const toY = next.y + .5;
      if (circleIntersectsEnvironment(collision, toX, toY, radius)) continue;
      if (circleIntersectsEnvironment(collision, (fromX + toX) * .5, (fromY + toY) * .5, radius)) continue;
      visited.add(nextKey);
      parent.set(nextKey, currentKey);
      distance.set(nextKey, distance.get(currentKey) + 1);
      open.push(next);
    }
  }
  return { reachable: false, distance: null, path: [] };
}

function reconstructPath(end, parent, width) {
  const path = [{ ...end }];
  let currentKey = end.y * width + end.x;
  while (parent.has(currentKey)) {
    currentKey = parent.get(currentKey);
    path.push({ x: currentKey % width, y: Math.floor(currentKey / width) });
  }
  return path.reverse();
}

function insideEscape(point, rect) {
  return point.x >= rect.x && point.y >= rect.y && point.x < rect.x + rect.w && point.y < rect.y + rect.h;
}

function round(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
