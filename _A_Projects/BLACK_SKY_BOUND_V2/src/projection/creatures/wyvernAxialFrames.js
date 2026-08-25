import { buildFacingVectors } from './creatureKinematics.js';

export function buildWyvernAxialFrames(points, transform) {
  const rootRotation = transform.rotation ?? 0;
  const head = frame(rootRotation, 'head_root_facing');
  const neck = frameFromPoints(points.neck, points.head, head, 'neck_to_head_tangent');
  const chest = frameFromPoints(points.chest, points.neck, neck, 'chest_to_neck_tangent');
  const hips = frameFromPoints(points.hips, points.chest, chest, 'hips_to_chest_tangent');
  return { head, neck, chest, hips };
}

export function frameFromPoints(back, front, fallback, source = 'adjacent_axial_tangent') {
  const dx = Number(front?.x) - Number(back?.x);
  const dy = Number(front?.y) - Number(back?.y);
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) <= 0.0001) {
    return { ...fallback, source: `${source}:fallback` };
  }
  return frame(Math.atan2(dy, dx), source);
}

export function frame(rotation, source = 'explicit_rotation') {
  const vectors = buildFacingVectors(rotation);
  return { rotation, ...vectors, source };
}
