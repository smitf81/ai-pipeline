export const COLLISION_SHAPE_2D_CONTRACT = 'black-sky-bound.collision-shape-2d.v1';

export const CollisionShape2DKind = Object.freeze({
  CIRCLE: 'circle',
  CAPSULE: 'capsule',
  CONVEX_POLYGON: 'convex_polygon'
});

export function createConvexPolygonCollision(points, source = {}) {
  const hull = convexHull(points);
  if (hull.length < 3) throw new Error('collision_shape_polygon_requires_three_points');
  return Object.freeze({
    contract: COLLISION_SHAPE_2D_CONTRACT,
    kind: CollisionShape2DKind.CONVEX_POLYGON,
    source: Object.freeze({ ...source }),
    points: Object.freeze(hull.map((point) => Object.freeze({ x: round(point.x), y: round(point.y) }))),
    bounds: Object.freeze(boundsFor(hull))
  });
}

export function createCircleCollision(x, y, radius, source = {}) {
  const safeRadius = Math.max(0, finite(radius));
  return Object.freeze({
    contract: COLLISION_SHAPE_2D_CONTRACT,
    kind: CollisionShape2DKind.CIRCLE,
    source: Object.freeze({ ...source }),
    x: round(x),
    y: round(y),
    radius: round(safeRadius),
    bounds: Object.freeze({
      left: round(x - safeRadius), top: round(y - safeRadius),
      right: round(x + safeRadius), bottom: round(y + safeRadius)
    })
  });
}

export function createCapsuleCollision(ax, ay, bx, by, radius, source = {}) {
  const safeRadius = Math.max(0, finite(radius));
  const values = [ax, ay, bx, by].map(finite);
  return Object.freeze({
    contract: COLLISION_SHAPE_2D_CONTRACT,
    kind: CollisionShape2DKind.CAPSULE,
    source: Object.freeze({ ...source }),
    ax: round(values[0]), ay: round(values[1]),
    bx: round(values[2]), by: round(values[3]),
    radius: round(safeRadius),
    bounds: Object.freeze({
      left: round(Math.min(values[0], values[2]) - safeRadius),
      top: round(Math.min(values[1], values[3]) - safeRadius),
      right: round(Math.max(values[0], values[2]) + safeRadius),
      bottom: round(Math.max(values[1], values[3]) + safeRadius)
    })
  });
}

export function translateCollisionShape(shape, offsetX, offsetY, source = shape?.source ?? {}) {
  if (shape?.kind === CollisionShape2DKind.CIRCLE) {
    return createCircleCollision(shape.x + offsetX, shape.y + offsetY, shape.radius, source);
  }
  if (shape?.kind === CollisionShape2DKind.CAPSULE) {
    return createCapsuleCollision(
      shape.ax + offsetX, shape.ay + offsetY,
      shape.bx + offsetX, shape.by + offsetY,
      shape.radius, source
    );
  }
  if (shape?.kind === CollisionShape2DKind.CONVEX_POLYGON) {
    return createConvexPolygonCollision(
      shape.points.map((point) => ({ x: point.x + offsetX, y: point.y + offsetY })),
      source
    );
  }
  throw new Error(`collision_shape_translate_kind_unsupported:${shape?.kind ?? 'missing'}`);
}

export function circleIntersectsCollisionShape(x, y, radius, shape) {
  if (shape?.contract !== COLLISION_SHAPE_2D_CONTRACT) return false;
  if (!circleIntersectsBounds(x, y, radius, shape.bounds)) return false;
  if (shape.kind === CollisionShape2DKind.CIRCLE) {
    return Math.hypot(x - shape.x, y - shape.y) <= radius + shape.radius;
  }
  if (shape.kind === CollisionShape2DKind.CAPSULE) {
    return distanceToSegment(x, y, shape.ax, shape.ay, shape.bx, shape.by) <= radius + shape.radius;
  }
  if (shape.kind === CollisionShape2DKind.CONVEX_POLYGON) {
    return pointInPolygon(x, y, shape.points)
      || shape.points.some((point, index) => distanceToSegment(
        x, y, point.x, point.y,
        shape.points[(index + 1) % shape.points.length].x,
        shape.points[(index + 1) % shape.points.length].y
      ) <= radius);
  }
  return false;
}

export function collisionShapesIntersect(a, b) {
  if (a?.contract !== COLLISION_SHAPE_2D_CONTRACT || b?.contract !== COLLISION_SHAPE_2D_CONTRACT) return false;
  if (!boundsOverlap(a.bounds, b.bounds)) return false;
  if (a.kind === CollisionShape2DKind.CIRCLE) return circleIntersectsCollisionShape(a.x, a.y, a.radius, b);
  if (b.kind === CollisionShape2DKind.CIRCLE) return circleIntersectsCollisionShape(b.x, b.y, b.radius, a);
  if (a.kind === CollisionShape2DKind.CAPSULE && b.kind === CollisionShape2DKind.CAPSULE) {
    return segmentDistance(a.ax, a.ay, a.bx, a.by, b.ax, b.ay, b.bx, b.by) <= a.radius + b.radius;
  }
  if (a.kind === CollisionShape2DKind.CAPSULE && b.kind === CollisionShape2DKind.CONVEX_POLYGON) return capsuleIntersectsPolygon(a, b);
  if (b.kind === CollisionShape2DKind.CAPSULE && a.kind === CollisionShape2DKind.CONVEX_POLYGON) return capsuleIntersectsPolygon(b, a);
  return a.points.some((point) => pointInPolygon(point.x, point.y, b.points))
    || b.points.some((point) => pointInPolygon(point.x, point.y, a.points));
}

function convexHull(points = []) {
  const values = points
    .filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y))
    .map((point) => ({ x: Number(point.x), y: Number(point.y) }))
    .sort((a, b) => a.x - b.x || a.y - b.y);
  if (values.length <= 3) return values;
  const lower = [];
  for (const point of values) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const point = values[index];
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function cross(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function boundsFor(points) {
  return {
    left: round(Math.min(...points.map((point) => point.x))),
    top: round(Math.min(...points.map((point) => point.y))),
    right: round(Math.max(...points.map((point) => point.x))),
    bottom: round(Math.max(...points.map((point) => point.y)))
  };
}

function circleIntersectsBounds(x, y, radius, bounds) {
  return x + radius >= bounds.left && x - radius <= bounds.right
    && y + radius >= bounds.top && y - radius <= bounds.bottom;
}

function boundsOverlap(a, b) {
  return a.right >= b.left && a.left <= b.right && a.bottom >= b.top && a.top <= b.bottom;
}

function capsuleIntersectsPolygon(capsule, polygon) {
  if (pointInPolygon(capsule.ax, capsule.ay, polygon.points) || pointInPolygon(capsule.bx, capsule.by, polygon.points)) return true;
  return polygon.points.some((point, index) => {
    const next = polygon.points[(index + 1) % polygon.points.length];
    return segmentDistance(capsule.ax, capsule.ay, capsule.bx, capsule.by, point.x, point.y, next.x, next.y) <= capsule.radius;
  });
}

function segmentDistance(ax, ay, bx, by, cx, cy, dx, dy) {
  if (segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
  return Math.min(
    distanceToSegment(ax, ay, cx, cy, dx, dy), distanceToSegment(bx, by, cx, cy, dx, dy),
    distanceToSegment(cx, cy, ax, ay, bx, by), distanceToSegment(dx, dy, ax, ay, bx, by)
  );
}

function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const abC = orientation(ax, ay, bx, by, cx, cy);
  const abD = orientation(ax, ay, bx, by, dx, dy);
  const cdA = orientation(cx, cy, dx, dy, ax, ay);
  const cdB = orientation(cx, cy, dx, dy, bx, by);
  return abC * abD <= 0 && cdA * cdB <= 0;
}

function orientation(ax, ay, bx, by, cx, cy) {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i];
    const b = points[j];
    const deltaY = b.y - a.y;
    const crosses = (a.y > y) !== (b.y > y)
      && x < (b.x - a.x) * (y - a.y) / (Math.abs(deltaY) < 0.0000001 ? 0.0000001 : deltaY) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function round(value) {
  return Number(Number(value).toFixed(4));
}
