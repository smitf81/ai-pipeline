export const WYVERN_RIG_SHAPE_CONTRACT = Object.freeze({
  height: 'render_metres_above_ground',
  verticalRadius: 'render_metres_from_point_centre'
});

export function requireWyvernRigShape(profile, heightKey, depthKey) {
  const height = Number(profile?.stance?.[heightKey]);
  const verticalRadius = Number(profile?.surface?.[depthKey]);
  if (!Number.isFinite(height) || !Number.isFinite(verticalRadius) || verticalRadius <= 0) {
    throw new Error(`wyvern_rig_shape_missing:${heightKey}:${depthKey}`);
  }
  return { height, verticalRadius };
}

export function interpolateWyvernRigShape(start, end, amount) {
  const t = clamp01(amount);
  return {
    height: start.height + (end.height - start.height) * t,
    verticalRadius: start.verticalRadius + (end.verticalRadius - start.verticalRadius) * t
  };
}

export function offsetWyvernRigShape(shape, heightOffset = 0, radiusScale = 1) {
  return {
    height: shape.height + heightOffset,
    verticalRadius: shape.verticalRadius * radiusScale
  };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}
