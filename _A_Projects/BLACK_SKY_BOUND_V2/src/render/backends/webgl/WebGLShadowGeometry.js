import { SHADOW_FIELD_CONTRACT } from '../../../projection/occlusionShadowState.js';
import { parseWebGLColor, withAlpha } from './WebGLColor.js';

export function buildShadowGeometry(regions = [], profile = {}, composite = normalizeShadowCompositeProfile(profile)) {
  const shadow = parseWebGLColor(profile.shadowColour, [0, 0, 0, 1]);
  const geometry = {
    triangles: [], penumbraTriangleCount: 0, coreTriangleCount: 0,
    contactTriangleCount: 0, contactFootprintCount: 0, coarseProjectedTriangleCount: 0, segmentCount: 0
  };
  const renderedBlockers = new Set();
  for (const region of regions) {
    if (renderedBlockers.has(region.blockerId) || !region.contactFootprint) continue;
    renderedBlockers.add(region.blockerId);
    const footprint = region.contactFootprint;
    const baseAlpha = clamp01(region.opacity ?? profile.shadowOpacity ?? 0.32);
    const density = clampRange(footprint.density ?? 1, 0.2, 1.6) * composite.contactDensity;
    geometry.contactTriangleCount += appendFootprintFan(
      geometry.triangles, footprint, 1.28,
      withAlpha(shadow, baseAlpha * 0.12 * density)
    );
    geometry.contactTriangleCount += appendFootprintFan(
      geometry.triangles, footprint, 0.82,
      withAlpha(shadow, baseAlpha * 0.34 * density)
    );
    geometry.contactFootprintCount += 1;
  }
  return geometry;
}

export function buildShadowShaderFields(packets = [], profile = {}, composite = normalizeShadowCompositeProfile(profile)) {
  const shadow = parseWebGLColor(profile.shadowColour, [0, 0, 0, 1]);
  const fields = [];
  for (const packet of packets) {
    if (packet.contract !== SHADOW_FIELD_CONTRACT || packet.kernel?.type !== 'screen_space_tapered_capsule_sdf') continue;
    const kernel = packet.kernel;
    const startX = finiteNumber(kernel.start?.x, NaN); const startY = finiteNumber(kernel.start?.y, NaN);
    const endX = finiteNumber(kernel.end?.x, NaN); const endY = finiteNumber(kernel.end?.y, NaN);
    if (![startX, startY, endX, endY].every(Number.isFinite)) continue;
    const radiusStart = Math.max(3, finiteNumber(kernel.radiusStart, 0) * composite.radiusScale);
    const radiusEnd = Math.max(3, finiteNumber(kernel.radiusEnd, 0) * composite.radiusScale * composite.tailTaperScale);
    const samples = packet.samples ?? [];
    const sampleAlpha = samples.reduce((max, sample) => Math.max(max, finiteNumber(sample.dimness, 0)), 0);
    const alpha = clamp01(sampleAlpha * composite.alphaScale);
    if (alpha <= 0.002) continue;
    const averageSoftness = samples.length
      ? samples.reduce((sum, sample) => sum + finiteNumber(sample.softness, 0.72), 0) / samples.length
      : finiteNumber(kernel.softness, 0.62);
    const softness = clampRange(averageSoftness * composite.edgeSoftness, 0.24, 1.65);
    const pad = Math.max(radiusStart, radiusEnd) * (1.18 + softness * 0.42) + 3;
    fields.push({
      packetId: packet.id, startX, startY, endX, endY, radiusStart, radiusEnd, softness,
      left: Math.min(startX, endX) - pad, top: Math.min(startY, endY) - pad,
      right: Math.max(startX, endX) + pad, bottom: Math.max(startY, endY) + pad,
      edgeGamma: composite.penumbraGamma, blendStrength: composite.blendStrength,
      tailFloor: composite.tailFloor, contactBoost: composite.contactBoost,
      color: withAlpha(shadow, alpha)
    });
  }
  return fields;
}

export function normalizeShadowCompositeProfile(profile = {}) {
  return {
    mode: profile.shadowCompositeMode ?? 'light_shadow_attenuation_blend_v0',
    blendStrength: clampRange(profile.shadowLightBlendStrength ?? 1.08, 0.05, 1.8),
    alphaScale: clampRange(profile.shadowFieldAlphaScale ?? 2.05, 0.2, 2.4),
    radiusScale: clampRange(profile.shadowFieldRadiusScale ?? 0.72, 0.2, 1.8),
    tailTaperScale: clampRange(profile.shadowFieldTailTaperScale ?? 0.54, 0.2, 1.2),
    edgeSoftness: clampRange(profile.shadowFieldEdgeSoftness ?? 1.08, 0.4, 2.2),
    penumbraGamma: clampRange(profile.shadowFieldPenumbraGamma ?? 1.08, 0.6, 2.8),
    tailFloor: clampRange(profile.shadowFieldTailFloor ?? 0.24, 0.08, 0.96),
    contactBoost: clampRange(profile.shadowContactDensity ?? 1.08, 0.5, 1.8),
    contactDensity: clampRange(profile.shadowContactDensity ?? 1.08, 0.2, 1.8),
    haloBlendScale: clampRange(profile.lightHaloBlendScale ?? 1.16, 0.4, 1.8),
    haloRadiusScale: clampRange(profile.lightHaloRadiusScale ?? 1.08, 0.6, 1.8),
    outerBlendScale: clampRange(profile.lightOuterBlendScale ?? 0.92, 0.4, 1.4),
    coreBlendScale: clampRange(profile.lightCoreBlendScale ?? 0.84, 0.4, 1.4)
  };
}

function appendFootprintFan(triangles, footprint, scale, color) {
  const center = footprint.center;
  if (!Number.isFinite(center?.x) || !Number.isFinite(center?.y)) return 0;
  const localPoints = footprint.shape === 'polygon' && footprint.points?.length >= 3
    ? footprint.points.map((point) => ({ x: point.x * scale, y: point.y * scale }))
    : ellipsePoints(footprint.radiusX * scale, footprint.radiusY * scale, footprint.shape === 'capsule' ? 12 : 10);
  const points = localPoints.map((point) => rotateAroundCenter(point, center, footprint.rotation ?? 0));
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]; const b = points[(i + 1) % points.length];
    triangles.push({ ax: center.x, ay: center.y, bx: a.x, by: a.y, cx: b.x, cy: b.y, color });
  }
  return points.length;
}

function ellipsePoints(radiusX, radiusY, segments) {
  return Array.from({ length: segments }, (_, index) => {
    const angle = Math.PI * 2 * index / segments;
    return { x: Math.cos(angle) * radiusX, y: Math.sin(angle) * radiusY };
  });
}

function rotateAroundCenter(point, center, rotation) {
  const cosine = Math.cos(rotation); const sine = Math.sin(rotation);
  return { x: center.x + point.x * cosine - point.y * sine, y: center.y + point.x * sine + point.y * cosine };
}

function finiteNumber(value, fallback) {
  const numeric = Number(value); return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp01(value) {
  const numeric = Number(value); return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : 0;
}

function clampRange(value, min, max) {
  const numeric = Number(value); return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : min;
}
