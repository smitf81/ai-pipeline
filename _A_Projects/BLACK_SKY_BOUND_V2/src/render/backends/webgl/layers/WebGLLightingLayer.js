import { parseWebGLColor } from '../WebGLColor.js';
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
import {
  WEBGL_ILLUMINATION_COMPOSITE_MODE,
  WEBGL_ILLUMINATION_FIELD_MODE
} from '../WebGLIlluminationPipeline.js';
import { WebGLShadowGeometryCache } from '../WebGLShadowGeometryCache.js';
import { WebGLStaticLightInfluenceCache } from '../WebGLStaticLightInfluenceCache.js';
import {
  buildShadowGeometry as buildShadowFamilyGeometry,
  buildShadowShaderFields as buildShadowFamilyShaderFields,
  normalizeShadowCompositeProfile
} from '../WebGLShadowGeometry.js';

export const WEBGL_GROUND_SHADOW_UNDERLAY_MODE = 'ground_contact_shadows_under_world_depth_v0';
export const WEBGL_SHADOW_MODE = 'webgl_bounded_capsule_sdf_shadow_shader_v0';
export const WEBGL_SHADOW_COMPOSITE_MODE = 'light_shadow_attenuation_blend_v0';

export class WebGLLightingLayer {
  constructor({
    id = 'lighting',
    mode = WEBGL_ILLUMINATION_COMPOSITE_MODE,
    renderIllumination = true,
    renderLights = true,
    renderShadows = true
  } = {}) {
    this.id = id;
    this.mode = mode;
    this.renderIllumination = renderIllumination;
    this.renderLights = renderLights;
    this.renderShadows = renderShadows;
    this.status = 'inactive';
    this.objectCount = 0;
    this.sourceLightCount = 0;
    this.flickeringLightCount = 0;
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
    this.illuminationModel = WEBGL_ILLUMINATION_FIELD_MODE;
    this.illuminationCompositeMode = WEBGL_ILLUMINATION_COMPOSITE_MODE;
    this.illuminationCompositeActive = false;
    this.illuminationFieldPassCount = 0;
    this.illuminationCompositePassCount = 0;
    this.ambientIllumination = 0;
    this.ambientIlluminationColour = [0, 0, 0];
    this.lightRevealStrength = 0;
    this.warmBloomOpacity = 0;
    this.occlusionShadowMode = 'projection_unavailable';
    this.occlusionShadowRegions = 0;
    this.occlusionShadowRenderable = false;
    this.shadowTriangles = [];
    this.shadowPenumbraTriangleCount = 0;
    this.shadowCoreTriangleCount = 0;
    this.shadowContactTriangleCount = 0;
    this.shadowContactFootprintCount = 0;
    this.coarseProjectedShadowTriangleCount = 0;
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
    this.shadowShaderPacketCount = 0; this.shadowShaderPrimitiveCount = 0;
    this.shadowGeometryCache = new WebGLShadowGeometryCache({ buildShadowGeometry, buildShadowShaderFields });
    this.shadowGeometryCacheHit = false; this.shadowGeometryCacheRebuilds = 0;
    this.staticShadowPacketCount = 0; this.dynamicShadowPacketCount = 0;
    this.staticLightInfluenceCache = new WebGLStaticLightInfluenceCache(buildEmitterLightInfluences);
    this.staticLightCacheHits = 0; this.staticLightCacheMisses = 0;
    this.emitterCompositeMode = EMITTER_LIGHT_COMPOSITE_MODE;
  }

  update(projection, context) {
    const paddedBounds = context.camera.visibleWorldBounds(160);
    const profile = projection.lightingProfile ?? fallbackLightingProfile();
    this.profileId = profile.id ?? 'unknown';
    const composite = normalizeShadowCompositeProfile(profile);
    this.illuminationModel = profile.illuminationModel ?? WEBGL_ILLUMINATION_FIELD_MODE;
    this.illuminationCompositeMode = profile.illuminationCompositeMode ?? WEBGL_ILLUMINATION_COMPOSITE_MODE;
    this.ambientIllumination = clamp01(profile.ambientIllumination ?? 0.14);
    this.ambientIlluminationColour = scaleRgb(parseWebGLColor(profile.ambientIlluminationColour, [0.42, 0.49, 0.6, 1]), this.ambientIllumination);
    this.illuminationCompositeActive = false;
    this.illuminationFieldPassCount = 0; this.illuminationCompositePassCount = 0;
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
    const shadowBuild = this.renderShadows
      ? this.shadowGeometryCache.resolve(projection.occlusionShadows?.shadowRegions, projection.occlusionShadows?.shadowFieldPackets, profile, composite)
      : this.shadowGeometryCache.empty();
    const shadowGeometry = shadowBuild.geometry;
    this.shadowTriangles = shadowGeometry.triangles;
    this.shadowPenumbraTriangleCount = shadowGeometry.penumbraTriangleCount;
    this.shadowCoreTriangleCount = shadowGeometry.coreTriangleCount;
    this.shadowContactTriangleCount = shadowGeometry.contactTriangleCount;
    this.shadowContactFootprintCount = shadowGeometry.contactFootprintCount ?? 0;
    this.coarseProjectedShadowTriangleCount = shadowGeometry.coarseProjectedTriangleCount ?? 0;
    this.shadowSegmentCount = shadowGeometry.segmentCount;
    this.shadowShaderFields = shadowBuild.fields;
    this.shadowGeometryCacheHit = shadowBuild.cacheHit; this.shadowGeometryCacheRebuilds = shadowBuild.rebuildCount;
    this.staticShadowPacketCount = shadowBuild.staticPacketCount; this.dynamicShadowPacketCount = shadowBuild.dynamicPacketCount;
    this.shadowFieldPacketCount = projection.occlusionShadows?.shadowFieldPacketCount ?? 0;
    this.shadowFieldSampleCount = projection.occlusionShadows?.shadowFieldSampleCount ?? 0;
    this.shadowFieldPrimitiveCount = this.shadowShaderFields.length;
    this.shadowSilhouettePrimitiveCount = projection.occlusionShadows?.shadowSilhouettePrimitiveCount ?? 0;
    this.shadowShaderPacketCount = this.shadowShaderFields.length;
    this.shadowShaderPrimitiveCount = this.shadowShaderFields.length;
    this.occlusionShadowRenderable = this.shadowTriangles.length > 0 || this.shadowShaderFields.length > 0;
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
    this.staticLightInfluenceCache.beginFrame();
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
        const influences = this.staticLightInfluenceCache.resolve(light, profile, composite);
        const split = splitEmitterInfluences(influences);
        this.localLightInfluences.push(...influences);
        this.localRevealInfluences.push(...split.reveal);
        this.localGlowInfluences.push(...split.glow);
        this.localCoreInfluences.push(...split.core);
      }
    }
    const staticLightCache = this.staticLightInfluenceCache.endFrame();
    this.staticLightCacheHits = staticLightCache.hitCount; this.staticLightCacheMisses = staticLightCache.missCount;
    this.lightInfluences = [...this.localLightInfluences, ...this.moonlightInfluences];
    const shadowRenderable = this.shadowTriangles.length > 0 || this.shadowShaderFields.length > 0;
    this.objectCount = this.renderLights ? this.sourceLightCount : this.occlusionShadowRegions;
    this.status = this.renderIllumination
      || (this.renderLights && this.lightInfluences.length > 0)
      || (this.renderShadows && shadowRenderable)
      ? 'active'
      : 'inactive';
  }

  render(context) {
    if (this.renderIllumination) {
      const result = context.illumination.compositeWorld({
        scene: context.scene,
        postProcess: context.postProcess,
        camera: context.camera,
        width: context.renderTargetWidth,
        height: context.renderTargetHeight,
        ambientColour: this.ambientIlluminationColour,
        lightInfluences: this.renderLights ? this.lightInfluences : [],
        attenuationTriangles: this.renderLights ? this.moonlightCloudTriangles : []
      });
      this.illuminationCompositeActive = result.active;
      this.illuminationFieldPassCount = result.fieldPassCount;
      this.illuminationCompositePassCount = result.compositePassCount;
    }
    if (this.renderShadows && this.shadowTriangles.length) context.scene.drawScreenTriangles(this.shadowTriangles, context.camera);
    if (this.renderShadows && this.shadowShaderFields.length) context.scene.drawScreenSdfShadowFields(this.shadowShaderFields, context.camera);
  }

  statsFields() {
    const shadowRenderable = this.renderShadows && (this.shadowTriangles.length > 0 || this.shadowShaderFields.length > 0);
    return {
      mode: this.mode,
      activeLightCount: this.renderLights ? this.sourceLightCount : 0,
      overlayCount: 0,
      influenceCount: this.renderLights ? this.lightInfluences.length : 0,
      lightingProfileId: this.profileId,
      illuminationModel: this.illuminationModel,
      illuminationCompositeMode: this.illuminationCompositeMode,
      illuminationCompositeActive: this.renderIllumination && this.illuminationCompositeActive,
      illuminationFieldPassCount: this.renderIllumination ? this.illuminationFieldPassCount : 0,
      illuminationCompositePassCount: this.renderIllumination ? this.illuminationCompositePassCount : 0,
      ambientIllumination: this.ambientIllumination,
      ambientIlluminationColour: [...this.ambientIlluminationColour],
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
      shadowContactFootprintCount: this.renderShadows ? this.shadowContactFootprintCount : 0,
      coarseProjectedShadowTriangleCount: this.renderShadows ? this.coarseProjectedShadowTriangleCount : 0,
      shadowSegmentCount: this.renderShadows ? this.shadowSegmentCount : 0,
      shadowFieldPacketCount: this.renderShadows ? this.shadowFieldPacketCount : 0,
      shadowFieldSampleCount: this.renderShadows ? this.shadowFieldSampleCount : 0,
      shadowFieldPrimitiveCount: this.renderShadows ? this.shadowFieldPrimitiveCount : 0,
      shadowSilhouettePrimitiveCount: this.renderShadows ? this.shadowSilhouettePrimitiveCount : 0,
      shadowShaderPacketCount: this.renderShadows ? this.shadowShaderPacketCount : 0,
      shadowShaderPrimitiveCount: this.renderShadows ? this.shadowShaderPrimitiveCount : 0,
      shadowGeometryCacheHit: this.renderShadows && this.shadowGeometryCacheHit,
      shadowGeometryCacheRebuilds: this.renderShadows ? this.shadowGeometryCacheRebuilds : 0,
      staticShadowPacketCount: this.renderShadows ? this.staticShadowPacketCount : 0,
      dynamicShadowPacketCount: this.renderShadows ? this.dynamicShadowPacketCount : 0,
      staticLightCacheHits: this.renderLights ? this.staticLightCacheHits : 0,
      staticLightCacheMisses: this.renderLights ? this.staticLightCacheMisses : 0,
      triangleCount: this.renderShadows ? this.shadowTriangles.length : 0
    };
  }
}

export function buildShadowGeometry(regions, profile, composite = normalizeShadowCompositeProfile(profile)) {
  return buildShadowFamilyGeometry(regions, profile, composite);
}

export function buildShadowShaderFields(packets, profile, composite = normalizeShadowCompositeProfile(profile)) {
  return buildShadowFamilyShaderFields(packets, profile, composite);
}

function fallbackLightingProfile() {
  return {
    id: 'fallback_early_night',
    illuminationModel: WEBGL_ILLUMINATION_FIELD_MODE,
    illuminationCompositeMode: WEBGL_ILLUMINATION_COMPOSITE_MODE,
    ambientIllumination: 0.14,
    ambientIlluminationColour: 'rgba(108, 124, 154, 1)',
    shadowColour: 'rgba(0, 0, 0, 1)',
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

function scaleRgb(colour, scale) {
  return [colour[0] * scale, colour[1] * scale, colour[2] * scale];
}

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}
