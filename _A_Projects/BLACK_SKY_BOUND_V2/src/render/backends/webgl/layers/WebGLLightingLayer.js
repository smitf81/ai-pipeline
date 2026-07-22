import { parseWebGLColor, withAlpha } from '../WebGLColor.js';
import { SHADOW_FIELD_CONTRACT } from '../../../../projection/occlusionShadowState.js';
import {
  buildMoonlightCloudOcclusion,
  buildMoonlightLightInfluences,
  isMoonlightProjection,
  MOONLIGHT_CLOUD_OCCLUSION_MODE
} from '../WebGLMoonlightOcclusion.js';
import {
  buildEmitterLightInfluences,
  EMITTER_LIGHT_COMPOSITE_MODE,
  splitEmitterInfluences
} from '../WebGLEmitterLightComposite.js';

const DARKNESS_MODE = 'profiled_flicker_light_cutouts_v2';
export const WEBGL_GROUND_SHADOW_UNDERLAY_MODE = 'ground_contact_shadows_under_world_depth_v0';
export const WEBGL_SHADOW_MODE = 'webgl_bounded_capsule_sdf_shadow_shader_v0';
export const WEBGL_SHADOW_COMPOSITE_MODE = 'light_shadow_attenuation_blend_v0';

export class WebGLLightingLayer {
  constructor({
    id = 'lighting',
    mode = DARKNESS_MODE,
    renderDarkness = true,
    renderLights = true,
    renderShadows = true
  } = {}) {
    this.id = id;
    this.mode = mode;
    this.renderDarkness = renderDarkness;
    this.renderLights = renderLights;
    this.renderShadows = renderShadows;
    this.status = 'inactive';
    this.objectCount = 0;
    this.sourceLightCount = 0;
    this.flickeringLightCount = 0;
    this.overlayRects = [];
    this.lightInfluences = [];
    this.localLightInfluences = [];
    this.localRevealInfluences = [];
    this.localGlowInfluences = [];
    this.localCoreInfluences = [];
    this.moonlightInfluences = [];
    this.moonlightCloudTriangles = [];
    this.moonlightSceneLightCount = 0;
    this.moonlightCloudOcclusionMode = null;
    this.moonlightCloudPrimitiveCount = 0;
    this.moonlightCloudScaleWorld = 0;
    this.moonlightCloudPhaseWorldX = 0;
    this.moonlightCloudPhaseWorldY = 0;
    this.profileId = null;
    this.darknessOpacity = 0;
    this.lightRevealStrength = 0;
    this.warmBloomOpacity = 0;
    this.occlusionShadowMode = 'projection_unavailable';
    this.occlusionShadowRegions = 0;
    this.occlusionShadowRenderable = false;
    this.shadowTriangles = [];
    this.shadowPenumbraTriangleCount = 0;
    this.shadowCoreTriangleCount = 0;
    this.shadowContactTriangleCount = 0;
    this.shadowSegmentCount = 0;
    this.shadowShaderFields = [];
    this.shadowShaderMode = WEBGL_SHADOW_MODE;
    this.shadowCompositeMode = WEBGL_SHADOW_COMPOSITE_MODE;
    this.shadowBlendStrength = 0;
    this.shadowFieldEdgeSoftness = 0;
    this.shadowFieldPenumbraGamma = 0;
    this.shadowFieldTailFloor = 0;
    this.shadowLightHaloBlendScale = 0;
    this.shadowFieldPacketCount = 0;
    this.shadowFieldSampleCount = 0;
    this.shadowFieldPrimitiveCount = 0;
    this.shadowSilhouettePrimitiveCount = 0;
    this.shadowShaderPacketCount = 0;
    this.shadowShaderPrimitiveCount = 0;
    this.emitterCompositeMode = EMITTER_LIGHT_COMPOSITE_MODE;
  }

  update(projection, context) {
    const bounds = context.camera.visibleWorldBounds(0);
    const paddedBounds = context.camera.visibleWorldBounds(160);
    const profile = projection.lightingProfile ?? fallbackLightingProfile();
    const darkness = parseWebGLColor(profile.darknessColour, [0.004, 0.007, 0.012, 1]);
    this.profileId = profile.id ?? 'unknown';
    const composite = normalizeShadowCompositeProfile(profile);
    this.darknessOpacity = clamp01(profile.darknessOpacity ?? 0.76);
    this.lightRevealStrength = clamp01(profile.lightRevealStrength ?? 0.9);
    this.warmBloomOpacity = clamp01(profile.warmBloomOpacity ?? 0.2);
    this.shadowCompositeMode = composite.mode;
    this.shadowBlendStrength = composite.blendStrength;
    this.shadowFieldEdgeSoftness = composite.edgeSoftness;
    this.shadowFieldPenumbraGamma = composite.penumbraGamma;
    this.shadowFieldTailFloor = composite.tailFloor;
    this.shadowLightHaloBlendScale = composite.haloBlendScale;
    this.occlusionShadowRegions = projection.occlusionShadows?.approximateShadowRegions ?? 0;
    this.occlusionShadowMode = projection.occlusionShadows
      ? WEBGL_SHADOW_MODE
      : 'projection_unavailable';
    const shadowGeometry = buildShadowGeometry(projection.occlusionShadows?.shadowRegions ?? [], profile, composite);
    this.shadowTriangles = shadowGeometry.triangles;
    this.shadowPenumbraTriangleCount = shadowGeometry.penumbraTriangleCount;
    this.shadowCoreTriangleCount = shadowGeometry.coreTriangleCount;
    this.shadowContactTriangleCount = shadowGeometry.contactTriangleCount;
    this.shadowSegmentCount = shadowGeometry.segmentCount;
    this.shadowShaderFields = buildShadowShaderFields(projection.occlusionShadows?.shadowFieldPackets ?? [], profile, composite);
    this.shadowFieldPacketCount = projection.occlusionShadows?.shadowFieldPacketCount ?? 0;
    this.shadowFieldSampleCount = projection.occlusionShadows?.shadowFieldSampleCount ?? 0;
    this.shadowFieldPrimitiveCount = this.shadowShaderFields.length;
    this.shadowSilhouettePrimitiveCount = projection.occlusionShadows?.shadowSilhouettePrimitiveCount ?? 0;
    this.shadowShaderPacketCount = this.shadowShaderFields.length;
    this.shadowShaderPrimitiveCount = this.shadowShaderFields.length;
    this.occlusionShadowRenderable = this.shadowTriangles.length > 0 || this.shadowShaderFields.length > 0;
    this.overlayRects = [{
      x: bounds.left,
      y: bounds.top,
      w: bounds.right - bounds.left,
      h: bounds.bottom - bounds.top,
      color: withAlpha(darkness, this.darknessOpacity)
    }];
    this.lightInfluences = [];
    this.localLightInfluences = [];
    this.localRevealInfluences = [];
    this.localGlowInfluences = [];
    this.localCoreInfluences = [];
    this.moonlightInfluences = [];
    this.moonlightCloudTriangles = [];
    this.sourceLightCount = 0;
    this.flickeringLightCount = 0;
    this.moonlightSceneLightCount = 0;
    this.moonlightCloudOcclusionMode = null;
    this.moonlightCloudPrimitiveCount = 0;
    this.moonlightCloudScaleWorld = 0;
    this.moonlightCloudPhaseWorldX = 0;
    this.moonlightCloudPhaseWorldY = 0;
    for (const light of projection.lights.filter((item) => item.enabled && (item.revealStrength ?? item.effectiveIntensity ?? item.intensity) > 0 && (item.revealRadius ?? item.radius) > 0)) {
      const r = Math.max(14, light.revealRadius ?? light.radius);
      if (light.worldX + r < paddedBounds.left || light.worldY + r < paddedBounds.top
        || light.worldX - r > paddedBounds.right || light.worldY - r > paddedBounds.bottom) {
        continue;
      }
      this.sourceLightCount += 1;
      if ((light.flickerAmount ?? 0) > 0) this.flickeringLightCount += 1;
      if (isMoonlightProjection(light)) {
        this.moonlightSceneLightCount += 1;
        this.moonlightInfluences.push(...buildMoonlightLightInfluences(light, r, profile));
        const cloud = buildMoonlightCloudOcclusion(light, context, profile);
        this.moonlightCloudOcclusionMode = cloud.mode;
        this.moonlightCloudTriangles.push(...cloud.triangles);
        this.moonlightCloudPrimitiveCount += cloud.primitiveCount;
        this.moonlightCloudScaleWorld = Math.max(this.moonlightCloudScaleWorld, cloud.scaleWorld);
        this.moonlightCloudPhaseWorldX = cloud.phaseWorldX;
        this.moonlightCloudPhaseWorldY = cloud.phaseWorldY;
      } else {
        const influences = buildEmitterLightInfluences(light, profile, composite);
        const split = splitEmitterInfluences(influences);
        this.localLightInfluences.push(...influences);
        this.localRevealInfluences.push(...split.reveal);
        this.localGlowInfluences.push(...split.glow);
        this.localCoreInfluences.push(...split.core);
      }
    }
    this.lightInfluences = [...this.localLightInfluences, ...this.moonlightInfluences];
    const shadowRenderable = this.shadowTriangles.length > 0 || this.shadowShaderFields.length > 0;
    this.objectCount = this.renderLights ? this.sourceLightCount : this.occlusionShadowRegions;
    this.status = (this.renderDarkness && this.overlayRects.length > 0)
      || (this.renderLights && this.lightInfluences.length > 0)
      || (this.renderShadows && shadowRenderable)
      ? 'active'
      : 'inactive';
  }

  render(context) {
    if (this.renderDarkness && this.overlayRects.length) context.scene.drawRects(this.overlayRects, context.camera);
    if (this.renderLights && this.moonlightInfluences.length) context.scene.drawWorldRadialLights(this.moonlightInfluences, context.camera);
    if (this.renderLights && this.moonlightCloudTriangles.length) context.scene.drawTriangles(this.moonlightCloudTriangles, context.camera);
    if (this.renderLights && this.localRevealInfluences.length) context.scene.drawWorldRadialSaturatedLights(this.localRevealInfluences, context.camera);
    if (this.renderLights && this.localGlowInfluences.length) context.scene.drawWorldRadialSaturatedLights(this.localGlowInfluences, context.camera);
    if (this.renderLights && this.localCoreInfluences.length) context.scene.drawWorldRadialSaturatedLights(this.localCoreInfluences, context.camera);
    if (this.renderShadows && this.shadowTriangles.length) context.scene.drawScreenTriangles(this.shadowTriangles, context.camera);
    if (this.renderShadows && this.shadowShaderFields.length) context.scene.drawScreenSdfShadowFields(this.shadowShaderFields, context.camera);
  }

  statsFields() {
    const shadowRenderable = this.renderShadows && (this.shadowTriangles.length > 0 || this.shadowShaderFields.length > 0);
    return {
      mode: this.mode,
      darknessMode: this.renderDarkness ? DARKNESS_MODE : null,
      activeLightCount: this.renderLights ? this.sourceLightCount : 0,
      overlayCount: this.renderDarkness ? this.overlayRects.length : 0,
      influenceCount: this.renderLights ? this.lightInfluences.length : 0,
      lightingProfileId: this.profileId,
      darknessOpacity: this.darknessOpacity,
      lightRevealStrength: this.lightRevealStrength,
      warmBloomOpacity: this.warmBloomOpacity,
      emitterCompositeMode: this.emitterCompositeMode,
      localRevealInfluenceCount: this.renderLights ? this.localRevealInfluences.length : 0,
      localGlowInfluenceCount: this.renderLights ? this.localGlowInfluences.length : 0,
      localCoreInfluenceCount: this.renderLights ? this.localCoreInfluences.length : 0,
      flickeringLightCount: this.renderLights ? this.flickeringLightCount : 0,
      moonlightSceneLightCount: this.renderLights ? this.moonlightSceneLightCount : 0,
      moonlightCloudOcclusionMode: this.renderLights && this.moonlightSceneLightCount > 0 ? (this.moonlightCloudOcclusionMode ?? MOONLIGHT_CLOUD_OCCLUSION_MODE) : null,
      moonlightCloudPrimitiveCount: this.renderLights ? this.moonlightCloudPrimitiveCount : 0,
      moonlightCloudScaleWorld: this.renderLights ? this.moonlightCloudScaleWorld : 0,
      moonlightCloudPhaseWorldX: this.renderLights ? this.moonlightCloudPhaseWorldX : 0,
      moonlightCloudPhaseWorldY: this.renderLights ? this.moonlightCloudPhaseWorldY : 0,
      occlusionShadowMode: this.occlusionShadowMode,
      occlusionShadowRegions: this.occlusionShadowRegions,
      occlusionShadowRenderable: shadowRenderable,
      shadowShaderMode: this.shadowShaderMode,
      shadowCompositeMode: this.shadowCompositeMode,
      shadowBlendStrength: this.shadowBlendStrength,
      shadowFieldEdgeSoftness: this.shadowFieldEdgeSoftness,
      shadowFieldPenumbraGamma: this.shadowFieldPenumbraGamma,
      shadowFieldTailFloor: this.shadowFieldTailFloor,
      shadowLightHaloBlendScale: this.shadowLightHaloBlendScale,
      shadowPenumbraTriangleCount: this.renderShadows ? this.shadowPenumbraTriangleCount : 0,
      shadowCoreTriangleCount: this.renderShadows ? this.shadowCoreTriangleCount : 0,
      shadowContactTriangleCount: this.renderShadows ? this.shadowContactTriangleCount : 0,
      shadowSegmentCount: this.renderShadows ? this.shadowSegmentCount : 0,
      shadowFieldPacketCount: this.renderShadows ? this.shadowFieldPacketCount : 0,
      shadowFieldSampleCount: this.renderShadows ? this.shadowFieldSampleCount : 0,
      shadowFieldPrimitiveCount: this.renderShadows ? this.shadowFieldPrimitiveCount : 0,
      shadowSilhouettePrimitiveCount: this.renderShadows ? this.shadowSilhouettePrimitiveCount : 0,
      shadowShaderPacketCount: this.renderShadows ? this.shadowShaderPacketCount : 0,
      shadowShaderPrimitiveCount: this.renderShadows ? this.shadowShaderPrimitiveCount : 0,
      triangleCount: this.renderShadows ? this.shadowTriangles.length : 0
    };
  }
}

function buildShadowGeometry(regions, profile, composite = normalizeShadowCompositeProfile(profile)) {
  const darkness = parseWebGLColor(profile.darknessColour, [0.004, 0.007, 0.012, 1]);
  const geometry = {
    triangles: [],
    penumbraTriangleCount: 0,
    coreTriangleCount: 0,
    contactTriangleCount: 0,
    segmentCount: 0
  };
  for (const region of regions) {
    const points = region.points ?? [];
    if (points.length !== 4) continue;
    const baseAlpha = clamp01(region.opacity ?? profile.shadowOpacity ?? 0.32);
    const softness = clamp01(region.softness ?? profile.shadowSoftness ?? 0.62);
    appendQuadTriangles(
      geometry.triangles,
      expandQuad(points, (8 + softness * 28) * (profile.shadowPenumbraScale ?? 1.2)),
      withAlpha(darkness, baseAlpha * (0.13 + softness * 0.12) * composite.penumbraAlphaScale)
    );
    geometry.penumbraTriangleCount += 2;

    const falloff = normaliseFalloff(profile.shadowCoreFalloff);
    const stops = [0, 0.34, 0.68, 1];
    for (let i = 0; i < falloff.length; i += 1) {
      appendBandTriangles(
        geometry.triangles,
        points,
        stops[i],
        stops[i + 1],
        withAlpha(darkness, baseAlpha * falloff[i] * composite.coreDensityScale)
      );
      geometry.coreTriangleCount += 2;
      geometry.segmentCount += 1;
    }

    const contactCount = appendContactShadowTriangles(
      geometry.triangles,
      region,
      withAlpha(darkness, baseAlpha * (0.36 + softness * 0.1) * composite.contactDensity)
    );
    geometry.contactTriangleCount += contactCount;
  }
  return geometry;
}

function buildShadowShaderFields(packets, profile, composite = normalizeShadowCompositeProfile(profile)) {
  const darkness = parseWebGLColor(profile.darknessColour, [0.004, 0.007, 0.012, 1]);
  const fields = [];
  for (const packet of packets) {
    if (packet.contract !== SHADOW_FIELD_CONTRACT) continue;
    if (packet.kernel?.type !== 'screen_space_tapered_capsule_sdf') continue;
    const kernel = packet.kernel;
    const startX = finiteNumber(kernel.start?.x, NaN);
    const startY = finiteNumber(kernel.start?.y, NaN);
    const endX = finiteNumber(kernel.end?.x, NaN);
    const endY = finiteNumber(kernel.end?.y, NaN);
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
      packetId: packet.id,
      startX,
      startY,
      endX,
      endY,
      radiusStart,
      radiusEnd,
      softness,
      left: Math.min(startX, endX) - pad,
      top: Math.min(startY, endY) - pad,
      right: Math.max(startX, endX) + pad,
      bottom: Math.max(startY, endY) + pad,
      edgeGamma: composite.penumbraGamma,
      blendStrength: composite.blendStrength,
      tailFloor: composite.tailFloor,
      contactBoost: composite.contactBoost,
      color: withAlpha(darkness, alpha)
    });
  }
  return fields;
}

function appendQuadTriangles(triangles, points, color) {
  triangles.push(
    { ax: points[0].x, ay: points[0].y, bx: points[1].x, by: points[1].y, cx: points[2].x, cy: points[2].y, color },
    { ax: points[0].x, ay: points[0].y, bx: points[2].x, by: points[2].y, cx: points[3].x, cy: points[3].y, color }
  );
}

function appendBandTriangles(triangles, points, startT, endT, color) {
  const left0 = lerpPoint(points[0], points[3], startT);
  const right0 = lerpPoint(points[1], points[2], startT);
  const right1 = lerpPoint(points[1], points[2], endT);
  const left1 = lerpPoint(points[0], points[3], endT);
  appendQuadTriangles(triangles, [left0, right0, right1, left1], color);
}

function appendContactShadowTriangles(triangles, region, color) {
  const center = region.start ?? midpoint(region.points?.[0], region.points?.[1]);
  if (!center) return 0;
  const direction = normalisedVector(region.direction ?? vectorBetween(region.start, region.end), { x: 1, y: 0 });
  const normal = normalisedVector(region.normal, { x: -direction.y, y: direction.x });
  const radius = Math.max(3, finiteNumber(region.contactRadius, finiteNumber(region.nearWidth, 14) * 0.36));
  const along = Math.max(3, radius * 0.62);
  const across = Math.max(4, radius * 1.08);
  const segments = 8;
  const points = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (Math.PI * 2 * i) / segments;
    points.push({
      x: center.x + normal.x * Math.cos(angle) * across + direction.x * Math.sin(angle) * along,
      y: center.y + normal.y * Math.cos(angle) * across + direction.y * Math.sin(angle) * along
    });
  }
  for (let i = 0; i < segments; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % segments];
    triangles.push({ ax: center.x, ay: center.y, bx: a.x, by: a.y, cx: b.x, cy: b.y, color });
  }
  return segments;
}

function expandQuad(points, amount) {
  const center = points.reduce((sum, point) => ({
    x: sum.x + point.x / points.length,
    y: sum.y + point.y / points.length
  }), { x: 0, y: 0 });
  return points.map((point) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const length = Math.hypot(dx, dy);
    if (length <= 0.001) return { x: point.x, y: point.y };
    return {
      x: point.x + (dx / length) * amount,
      y: point.y + (dy / length) * amount
    };
  });
}

function normaliseFalloff(value) {
  if (!Array.isArray(value) || value.length < 3) return [0.58, 0.34, 0.16];
  return value.slice(0, 3).map((item, index) => {
    const fallback = [0.58, 0.34, 0.16][index];
    const numeric = Number(item);
    return Number.isFinite(numeric) ? Math.max(0.04, Math.min(0.8, numeric)) : fallback;
  });
}

function lerpPoint(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t
  };
}

function midpoint(a, b) {
  if (!a || !b) return null;
  return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
}

function vectorBetween(a, b) {
  if (!a || !b) return null;
  return { x: b.x - a.x, y: b.y - a.y };
}

function normalisedVector(vector, fallback) {
  const x = Number(vector?.x);
  const y = Number(vector?.y);
  const length = Math.hypot(x, y);
  if (!Number.isFinite(length) || length <= 0.001) return fallback;
  return { x: x / length, y: y / length };
}

function finiteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeShadowCompositeProfile(profile = {}) {
  return {
    mode: profile.shadowCompositeMode ?? WEBGL_SHADOW_COMPOSITE_MODE,
    blendStrength: clampRange(profile.shadowLightBlendStrength ?? 1.08, 0.05, 1.8),
    alphaScale: clampRange(profile.shadowFieldAlphaScale ?? 2.05, 0.2, 2.4),
    radiusScale: clampRange(profile.shadowFieldRadiusScale ?? 0.72, 0.2, 1.8),
    tailTaperScale: clampRange(profile.shadowFieldTailTaperScale ?? 0.54, 0.2, 1.2),
    edgeSoftness: clampRange(profile.shadowFieldEdgeSoftness ?? 1.08, 0.4, 2.2),
    penumbraGamma: clampRange(profile.shadowFieldPenumbraGamma ?? 1.08, 0.6, 2.8),
    tailFloor: clampRange(profile.shadowFieldTailFloor ?? 0.24, 0.08, 0.96),
    contactBoost: clampRange(profile.shadowContactDensity ?? 1.08, 0.5, 1.8),
    penumbraAlphaScale: clampRange(profile.shadowPenumbraAlphaScale ?? 0.44, 0.2, 1.4),
    coreDensityScale: clampRange(profile.shadowCoreDensityScale ?? 0.38, 0.2, 1.4),
    contactDensity: clampRange(profile.shadowContactDensity ?? 1.08, 0.2, 1.8),
    haloBlendScale: clampRange(profile.lightHaloBlendScale ?? 1.16, 0.4, 1.8),
    haloRadiusScale: clampRange(profile.lightHaloRadiusScale ?? 1.08, 0.6, 1.8),
    outerBlendScale: clampRange(profile.lightOuterBlendScale ?? 0.92, 0.4, 1.4),
    coreBlendScale: clampRange(profile.lightCoreBlendScale ?? 0.84, 0.4, 1.4)
  };
}

function fallbackLightingProfile() {
  return {
    id: 'fallback_early_night',
    darknessOpacity: 0.8,
    darknessColour: 'rgba(3, 7, 14, 1)',
    lightRevealStrength: 0.9,
    warmBloomOpacity: 0.2,
    shadowCoreFalloff: [0.58, 0.34, 0.16],
    shadowPenumbraScale: 1.2,
    shadowPenumbraAlphaScale: 0.44,
    shadowCoreDensityScale: 0.38,
    shadowContactDensity: 1.08,
    shadowFieldSampleCount: 5,
    shadowFieldSoftnessScale: 1.12,
    shadowCompositeMode: WEBGL_SHADOW_COMPOSITE_MODE,
    shadowLightBlendStrength: 1.08,
    shadowFieldAlphaScale: 2.05,
    shadowFieldRadiusScale: 0.72,
    shadowFieldTailTaperScale: 0.54,
    shadowFieldEdgeSoftness: 1.08,
    shadowFieldPenumbraGamma: 1.08,
    shadowFieldTailFloor: 0.24,
    lightHaloBlendScale: 1.16,
    lightHaloRadiusScale: 1.08,
    lightOuterBlendScale: 0.92,
    lightCoreBlendScale: 0.84
  };
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
