export function solveTwoBoneIk(root, target, upperLength, lowerLength, preferredJoint) {
  const dx = target.x - root.x;
  const dy = target.y - root.y;
  const rawDistance = Math.hypot(dx, dy) || 0.0001;
  const maxReach = Math.max(0.0001, upperLength + lowerLength - 0.001);
  const distance = Math.min(rawDistance, maxReach);
  const nx = dx / rawDistance;
  const ny = dy / rawDistance;
  const along = Math.max(0, Math.min(upperLength, (upperLength * upperLength - lowerLength * lowerLength + distance * distance) / (2 * distance)));
  const height = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
  const base = { x: root.x + nx * along, y: root.y + ny * along };
  const perp = { x: -ny, y: nx };
  const optionA = { x: base.x + perp.x * height, y: base.y + perp.y * height };
  const optionB = { x: base.x - perp.x * height, y: base.y - perp.y * height };
  return distanceBetween(optionA, preferredJoint) <= distanceBetween(optionB, preferredJoint) ? optionA : optionB;
}

export function offset(origin, right, rightAmount, forward, forwardAmount) {
  return {
    x: origin.x + right.x * rightAmount + forward.x * forwardAmount,
    y: origin.y + right.y * rightAmount + forward.y * forwardAmount
  };
}

export function midpoint(a, b, fraction = 0.5) {
  return {
    x: a.x + (b.x - a.x) * fraction,
    y: a.y + (b.y - a.y) * fraction
  };
}

export function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function buildFacingVectors(rotation = 0) {
  return {
    forward: { x: Math.cos(rotation), y: Math.sin(rotation) },
    right: { x: -Math.sin(rotation), y: Math.cos(rotation) }
  };
}

export function indexByRole(points) {
  return Object.fromEntries(points.map((point) => [point.role, point]));
}
