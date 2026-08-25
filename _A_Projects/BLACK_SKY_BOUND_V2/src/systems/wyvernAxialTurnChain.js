const ROLE_FOLLOW_KEYS = Object.freeze({
  neck: 'neckFollowSharpness',
  chest: 'chestFollowSharpness',
  hips: 'hipFollowSharpness',
  tailBase: 'tailBaseFollowSharpness',
  tailMid: 'tailMidFollowSharpness',
  tailTip: 'tailTipFollowSharpness'
});

export function transportWyvernAxialChain(projection, transform) {
  const previousX = finite(projection.lastX, transform.x);
  const previousY = finite(projection.lastY, transform.y);
  const deltaX = transform.x - previousX;
  const deltaY = transform.y - previousY;
  const rotationDelta = shortestAngle((transform.rotation ?? 0) - finite(projection.lastRotation, transform.rotation ?? 0));
  for (const point of projection.bodyPoints ?? []) {
    point.x += deltaX;
    point.y += deltaY;
  }
  projection.rootTransport = {
    classification: 'wyvern_root_translation_axial_follow_v1',
    deltaX,
    deltaY,
    rotationDelta,
    rotationAppliedToChain: false
  };
}

export function updateWyvernAxialTurnChain(projection, transform, radius, recipe, dt, motionState = null, actionState = null) {
  const points = projection.bodyPoints ?? [];
  if (!points.length) return;
  const turning = recipe.proportionProfile?.turning ?? {};
  const constraints = recipe.proportionProfile?.constraints ?? {};
  const minStretch = constraints.minBodyChainStretch ?? 0.92;
  const maxStretch = constraints.maxBodyChainStretch ?? 1.09;
  const maxBend = radians(turning.maxSegmentBendDegrees ?? 70);
  const rootBackAngle = shortestAngle((transform.rotation ?? 0) + Math.PI);
  const idleSway = Math.sin(projection.idlePhase * 0.7) * recipe.chain.idleTailSway * radius;
  let malformed = false;

  points[0].x = transform.x;
  points[0].y = transform.y;
  let parentAngle = rootBackAngle;
  for (let index = 1; index < points.length; index += 1) {
    const anchor = points[index - 1];
    const point = points[index];
    const role = point.role;
    const desiredLength = radius * (recipe.chain.segmentLengthScales[index - 1] ?? 0.5);
    const observed = segmentState(anchor, point, parentAngle, desiredLength);
    malformed ||= observed.malformed;
    const currentAngle = Number.isFinite(point.turnAngle) ? point.turnAngle : observed.angle;
    const currentLength = Number.isFinite(point.turnLength) ? point.turnLength : observed.length;
    const followRate = followSharpness(turning, role, recipe.chain.followSharpness) * actionFollowMultiplier(turning, role, actionState);
    const follow = 1 - Math.exp(-followRate * Math.max(0, dt));
    const targetAngle = parentAngle + tailSwayAngle(index, points.length, idleSway, desiredLength, Math.max(projection.movement01 ?? 0, motionState?.turnEffort ?? 0));
    let nextAngle = lerpAngle(currentAngle, targetAngle, follow);
    nextAngle = parentAngle + clamp(shortestAngle(nextAngle - parentAngle), -maxBend, maxBend);
    const actionLagLimit = actionFacingLagLimit(role, actionState);
    if (Number.isFinite(actionLagLimit)) {
      nextAngle = rootBackAngle + clamp(shortestAngle(nextAngle - rootBackAngle), -actionLagLimit, actionLagLimit);
    }
    const nextLength = clamp(lerp(currentLength, desiredLength, follow), desiredLength * minStretch, desiredLength * maxStretch);
    point.turnAngle = nextAngle;
    point.turnLength = nextLength;
    point.x = anchor.x + Math.cos(nextAngle) * nextLength;
    point.y = anchor.y + Math.sin(nextAngle) * nextLength;
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      point.x = anchor.x + Math.cos(parentAngle) * desiredLength;
      point.y = anchor.y + Math.sin(parentAngle) * desiredLength;
      malformed = true;
    }
    parentAngle = nextAngle;
  }

  if (malformed) projection.malformedTurnFrameCount = (projection.malformedTurnFrameCount ?? 0) + 1;
  projection.axialTurn = buildAxialDiagnostics(points, transform.rotation ?? 0, projection.malformedTurnFrameCount ?? 0);
}

function buildAxialDiagnostics(points, rootFacing, malformedFrameCount) {
  const byRole = Object.fromEntries(points.map((point) => [point.role, point]));
  const headFacing = rootFacing;
  const neckFacing = forwardAngle(byRole.neck, byRole.head, headFacing);
  const chestFacing = forwardAngle(byRole.chest, byRole.neck, neckFacing);
  const hipFacing = forwardAngle(byRole.hips, byRole.chest, chestFacing);
  const tailFacing = forwardAngle(byRole.tailTip, byRole.tailMid, hipFacing);
  return {
    classification: 'renderer_neutral_wyvern_axial_turn_v1',
    headFacing,
    neckFacing,
    chestFacing,
    hipFacing,
    tailFacing,
    headLag: 0,
    neckLag: shortestAngle(rootFacing - neckFacing),
    chestLag: shortestAngle(rootFacing - chestFacing),
    hipLag: shortestAngle(rootFacing - hipFacing),
    tailLag: shortestAngle(rootFacing - tailFacing),
    malformedFrameCount
  };
}

function segmentState(anchor, point, fallbackAngle, fallbackLength) {
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length <= 0.0001) return { angle: fallbackAngle, length: fallbackLength, malformed: true };
  return { angle: Math.atan2(dy, dx), length, malformed: false };
}

function followSharpness(turning, role, fallback) {
  const key = ROLE_FOLLOW_KEYS[role];
  const value = key ? Number(turning[key]) : NaN;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function actionFollowMultiplier(turning, role, actionState) {
  if (!actionState?.active) return 1;
  return role.startsWith('tail')
    ? (turning.actionTailCatchupMultiplier ?? 1.8)
    : (turning.actionBodyCatchupMultiplier ?? 3);
}

function actionFacingLagLimit(role, actionState) {
  if (!actionState?.active) return NaN;
  const degreesByRole = {
    neck: 24,
    chest: 38,
    hips: 52,
    tailBase: 65,
    tailMid: 78,
    tailTip: 88
  };
  const degrees = degreesByRole[role];
  return Number.isFinite(degrees) ? radians(degrees) : NaN;
}

function tailSwayAngle(index, count, sway, length, movement01) {
  if (index < 4 || Math.abs(sway) <= 0.000001) return 0;
  const tail01 = (index - 3) / Math.max(1, count - 4);
  return clamp((sway / Math.max(0.001, length)) * tail01 * (1 - (movement01 ?? 0) * 0.65), -0.24, 0.24);
}

function forwardAngle(back, front, fallback) {
  if (!back || !front) return fallback;
  const dx = front.x - back.x;
  const dy = front.y - back.y;
  return Math.hypot(dx, dy) > 0.0001 ? Math.atan2(dy, dx) : fallback;
}

function finite(value, fallback) { return Number.isFinite(value) ? value : fallback; }
function radians(value) { return value * Math.PI / 180; }
function shortestAngle(value) { return Math.atan2(Math.sin(value), Math.cos(value)); }
function lerpAngle(from, to, amount) { return from + shortestAngle(to - from) * clamp(amount, 0, 1); }
function lerp(from, to, amount) { return from + (to - from) * amount; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
