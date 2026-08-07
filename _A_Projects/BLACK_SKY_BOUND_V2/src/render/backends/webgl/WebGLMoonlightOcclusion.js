import { SceneLightSourceKind } from '../../../data/sceneLights.js';
import { parseWebGLColor, withAlpha } from './WebGLColor.js';

export const MOONLIGHT_CLOUD_OCCLUSION_MODE = 'world_anchored_moonlight_cloud_attenuation_v1';

export function isMoonlightProjection(light) {
  return light?.sourceKind === SceneLightSourceKind.MOONLIGHT;
}

export function buildMoonlightLightInfluences(light, radius, profile) {
  const outer = parseWebGLColor(light.colour, [0.38, 0.48, 0.72, 1]);
  const inner = parseWebGLColor(light.innerColour, [0.64, 0.72, 0.88, 1]);
  const intensity = clamp01(light.effectiveIntensity ?? light.intensity ?? 0.2);
  const reveal = clamp01(profile.lightRevealStrength ?? 0.9);
  const sourceSoftness = Math.max(0, Math.min(1, light.softness ?? 0.97));
  const fieldSoftness = clampRange(1.16 - sourceSoftness, 0.22, 0.48);
  return [
    {
      x: light.worldX,
      y: light.worldY,
      radius: radius * 1.18,
      softness: Math.min(0.56, fieldSoftness + 0.12),
      color: withAlpha(mixColor(outer, inner, 0.16), clampRange(intensity * reveal * 0.42, 0.018, 0.42))
    },
    {
      x: light.worldX,
      y: light.worldY,
      radius: radius,
      softness: Math.min(0.5, fieldSoftness + 0.06),
      color: withAlpha(outer, clampRange(intensity * reveal * 0.92, 0.034, 0.92))
    },
    {
      x: light.worldX,
      y: light.worldY,
      radius: radius * 0.62,
      softness: fieldSoftness,
      color: withAlpha(inner, clampRange(intensity * reveal * 0.48, 0.016, 0.48))
    }
  ];
}

export function buildMoonlightCloudOcclusion(light, context, profile) {
  const cloud = light.cloudOcclusion;
  if (!cloud?.enabled) return emptyCloudResult(cloud);
  const bounds = context.camera.visibleWorldBounds(Math.max(180, (cloud.scale ?? 240) * 0.72));
  const direction = normalise(light.direction, { x: 0.58, y: 0.82 });
  const normal = { x: -direction.y, y: direction.x };
  const scale = Math.max(80, cloud.scale ?? 240);
  const spacing = scale * 0.88;
  const bandWidth = scale * 0.34;
  const driftOffset = (cloud.phaseWorldX ?? 0) * normal.x + (cloud.phaseWorldY ?? 0) * normal.y;
  const phase = wrap(driftOffset, spacing);
  const boundsProjection = projectBounds(bounds, direction, normal);
  const span = (boundsProjection.along.max - boundsProjection.along.min) + scale * 2.4;
  const centerAlong = (boundsProjection.along.min + boundsProjection.along.max) * 0.5;
  const normalMargin = bandWidth + scale * 0.62;
  const startIndex = Math.floor((boundsProjection.normal.min + phase - normalMargin) / spacing);
  const endIndex = Math.ceil((boundsProjection.normal.max + phase + normalMargin) / spacing);
  const visibleBandIndices = boundedBandIndices(startIndex, endIndex, boundsProjection.normal, phase, spacing, cloud.bandCount ?? 7);
  const shapeNoise = cloud.shapeNoise?.enabled === false ? null : {
    amplitude: clampRange(cloud.shapeNoise?.amplitude ?? 0, 0, scale * 0.36),
    frequency: clampRange(cloud.shapeNoise?.frequency ?? 0.8, 0.05, 3),
    morphPhase: cloud.shapeNoise?.morphPhase ?? 0,
    segments: Math.max(1, Math.min(12, Math.round(cloud.shapeNoise?.segments ?? 5)))
  };
  const shadow = parseWebGLColor(profile.shadowColour, [0, 0, 0, 1]);
  const triangles = [];
  const bandNormalCoordinates = [];
  for (const bandIndex of visibleBandIndices) {
    const bandNormalCoordinate = bandIndex * spacing - phase;
    const center = {
      x: direction.x * centerAlong + normal.x * bandNormalCoordinate,
      y: direction.y * centerAlong + normal.y * bandNormalCoordinate
    };
    bandNormalCoordinates.push(round3(bandNormalCoordinate));
    const wave = 0.72 + 0.28 * Math.sin((bandIndex + 1) * 1.91 + driftOffset / Math.max(1, scale) + (shapeNoise?.morphPhase ?? 0) * 0.23);
    const alpha = clamp01((cloud.opacity ?? 0.1) * wave * (0.72 + (cloud.contrast ?? 0.4) * 0.28));
    appendBandTriangles(triangles, center, direction, normal, 0, bandWidth, span, withAlpha(shadow, alpha), shapeNoise, bandIndex, scale, centerAlong);
  }
  return {
    mode: MOONLIGHT_CLOUD_OCCLUSION_MODE,
    anchorPolicy: 'world_normal_coordinate_grid_not_camera_centered',
    triangles,
    primitiveCount: triangles.length,
    bandCount: visibleBandIndices.length,
    bandNormalCoordinates,
    scaleWorld: scale,
    phaseWorldX: cloud.phaseWorldX ?? 0,
    phaseWorldY: cloud.phaseWorldY ?? 0,
    transmissionMin: cloud.minTransmission ?? 0.46,
    transmissionMax: cloud.maxTransmission ?? 1
  };
}

function appendBandTriangles(triangles, center, direction, normal, offset, width, span, color, shapeNoise, bandIndex, scale, centerAlong) {
  const segments = shapeNoise?.segments ?? 1;
  let previous = bandCrossSection(center, direction, normal, offset, width, -span, shapeNoise, bandIndex, scale, centerAlong);
  for (let i = 1; i <= segments; i += 1) {
    const along = -span + (span * 2 * i) / segments;
    const current = bandCrossSection(center, direction, normal, offset, width, along, shapeNoise, bandIndex, scale, centerAlong);
    triangles.push(
      { ax: previous.left.x, ay: previous.left.y, bx: previous.right.x, by: previous.right.y, cx: current.right.x, cy: current.right.y, color },
      { ax: previous.left.x, ay: previous.left.y, bx: current.right.x, by: current.right.y, cx: current.left.x, cy: current.left.y, color }
    );
    previous = current;
  }
}

function bandCrossSection(center, direction, normal, offset, width, along, shapeNoise, bandIndex, scale, centerAlong) {
  const worldAlong = centerAlong + along;
  const ripple = cloudEdgeRipple(worldAlong, shapeNoise, bandIndex, scale);
  const widthNoise = shapeNoise
    ? 1 + 0.18 * Math.sin((worldAlong / Math.max(1, scale)) * Math.PI * 3.4 * shapeNoise.frequency + shapeNoise.morphPhase * 0.7 + bandIndex * 1.7)
    : 1;
  const halfWidth = width * clampRange(widthNoise, 0.72, 1.24);
  const cx = center.x + direction.x * along + normal.x * (offset + ripple);
  const cy = center.y + direction.y * along + normal.y * (offset + ripple);
  return {
    left: { x: cx - normal.x * halfWidth, y: cy - normal.y * halfWidth },
    right: { x: cx + normal.x * halfWidth, y: cy + normal.y * halfWidth }
  };
}

function cloudEdgeRipple(along, shapeNoise, bandIndex, scale) {
  if (!shapeNoise) return 0;
  const phase = (along / Math.max(1, scale)) * Math.PI * 2 * shapeNoise.frequency;
  return shapeNoise.amplitude * (
    Math.sin(phase + shapeNoise.morphPhase + bandIndex * 0.91) * 0.66
    + Math.sin(phase * 2.37 + shapeNoise.morphPhase * 0.58 + bandIndex * 2.13) * 0.34
  );
}

function projectBounds(bounds, direction, normal) {
  const corners = [
    { x: bounds.left, y: bounds.top },
    { x: bounds.right, y: bounds.top },
    { x: bounds.right, y: bounds.bottom },
    { x: bounds.left, y: bounds.bottom }
  ];
  return {
    along: projectRange(corners, direction),
    normal: projectRange(corners, normal)
  };
}

function projectRange(points, axis) {
  let min = Infinity;
  let max = -Infinity;
  for (const point of points) {
    const value = point.x * axis.x + point.y * axis.y;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max };
}

function boundedBandIndices(startIndex, endIndex, normalRange, phase, spacing, requestedBandCount) {
  const maxBands = Math.max(3, Math.min(18, Math.max(requestedBandCount, Math.ceil((normalRange.max - normalRange.min) / spacing) + 3)));
  if (endIndex - startIndex + 1 <= maxBands) {
    return Array.from({ length: endIndex - startIndex + 1 }, (_, index) => startIndex + index);
  }
  const centerNormal = (normalRange.min + normalRange.max) * 0.5;
  const centerIndex = Math.round((centerNormal + phase) / spacing);
  const half = Math.floor(maxBands / 2);
  const boundedStart = centerIndex - half;
  return Array.from({ length: maxBands }, (_, index) => boundedStart + index);
}

function normalise(value, fallback) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  const length = Math.hypot(x, y);
  if (!Number.isFinite(length) || length <= 0.001) return fallback;
  return { x: x / length, y: y / length };
}

function emptyCloudResult(cloud) {
  return { mode: cloud?.contract ?? null, triangles: [], primitiveCount: 0, scaleWorld: 0, phaseWorldX: 0, phaseWorldY: 0 };
}

function wrap(value, period) {
  if (period <= 0) return 0;
  return ((value % period) + period) % period;
}

function round3(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

function mixColor(a, b, bWeight) {
  const t = clamp01(bWeight);
  return [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t, a[2] * (1 - t) + b[2] * t, a[3] * (1 - t) + b[3] * t];
}

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function clampRange(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}
