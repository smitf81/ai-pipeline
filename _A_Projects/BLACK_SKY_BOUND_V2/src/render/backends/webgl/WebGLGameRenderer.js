import { WebGLSceneRoot } from './WebGLSceneRoot.js';
import { WebGLCamera2D } from './WebGLCamera2D.js';
import { WebGLRenderLayerRegistry } from './WebGLRenderLayerRegistry.js';
import { WebGLPostProcessPipeline } from './WebGLPostProcessPipeline.js';
import { buildWebGLStatsSummary, timeWebGLPhase } from './WebGLRenderStats.js';
import { WebGLTerrainLayer } from './layers/WebGLTerrainLayer.js';
import { WebGLDecalLayer } from './layers/WebGLDecalLayer.js';
import { WebGLWorldDepthLayer } from './layers/WebGLWorldDepthLayer.js';
import { WebGLEffectLayer } from './layers/WebGLEffectLayer.js';
import { WebGLLightingLayer, WEBGL_GROUND_SHADOW_UNDERLAY_MODE } from './layers/WebGLLightingLayer.js';
import { WebGLFogSmokeLayer } from './layers/WebGLFogSmokeLayer.js';
import { WebGLPostProcessLayer } from './layers/WebGLPostProcessLayer.js';
import { WebGLAtmosphericOverlayLayer } from './layers/WebGLAtmosphericOverlayLayer.js';
import { WebGLGameplayOverlayLayer } from './layers/WebGLGameplayOverlayLayer.js';
import { WebGLHudDebugLayer } from './layers/WebGLHudDebugLayer.js';
import { WebGLWorldEventLayer } from './layers/WebGLWorldEventLayer.js';
import { WebGLTutorialLayer } from './layers/WebGLTutorialLayer.js';
import { WebGLOpeningLayer } from './layers/WebGLOpeningLayer.js';
import { WebGLSmokeAwakeningLayer } from './layers/WebGLSmokeAwakeningLayer.js';

export const WEBGL_LIGHTING_WORLD_DEPTH_COMPOSITE_CONTRACT = 'black-sky-bound.webgl-ground-shadows-under-world-depth-light-over-world-depth.v0';

export const WEBGL_LAYER_ORDER = Object.freeze([
  'terrain',
  'decals',
  'shadows',
  'worldDepth',
  'lighting',
  'worldEvents',
  'effects',
  'fogSmoke',
  'postProcess',
  'atmosphere',
  'gameplayOverlay',
  'opening',
  'smokeAwakening',
  'tutorial',
  'hudDebug'
]);

export function createWebGLLayers() {
  return [
    new WebGLTerrainLayer(),
    new WebGLDecalLayer(),
    new WebGLLightingLayer({
      id: 'shadows',
      mode: WEBGL_GROUND_SHADOW_UNDERLAY_MODE,
      renderDarkness: false,
      renderLights: false,
      renderShadows: true
    }),
    new WebGLWorldDepthLayer(),
    new WebGLLightingLayer({
      id: 'lighting',
      renderDarkness: true,
      renderLights: true,
      renderShadows: false
    }),
    new WebGLWorldEventLayer(),
    new WebGLEffectLayer(),
    new WebGLFogSmokeLayer(),
    new WebGLPostProcessLayer(),
    new WebGLAtmosphericOverlayLayer(),
    new WebGLGameplayOverlayLayer(),
    new WebGLOpeningLayer(),
    new WebGLSmokeAwakeningLayer(),
    new WebGLTutorialLayer(),
    new WebGLHudDebugLayer()
  ];
}

export class WebGLGameRenderer {
  constructor(canvas, policy = {}) {
    this.canvas = canvas;
    this.scene = new WebGLSceneRoot(canvas);
    this.camera = new WebGLCamera2D(canvas);
    this.postProcess = new WebGLPostProcessPipeline(this.scene.gl);
    this.renderTargetWidth = canvas.clientWidth || 1280;
    this.renderTargetHeight = canvas.clientHeight || 720;
    this.registry = new WebGLRenderLayerRegistry(createWebGLLayers());
    this.renderFrame = 0;
    this.sceneObjectVisibilityStates = new Map();
    this.status = {
      preferredBackend: policy.preferredBackend ?? 'webgl',
      candidateBackend: policy.candidateBackend ?? 'webgl',
      activeBackend: 'webgl',
      backendStatus: 'active',
      fallbackReason: null,
      initializationError: null,
      webglContext: this.scene.gl.constructor?.name ?? 'webgl',
      textureUploads: 0,
      fullSceneTextureUploadActive: false,
      rendererMode: 'real_layers',
      legacyCompositeActive: false,
      preferenceSource: policy.preferenceSource ?? 'runtime_override',
      requestedBackend: policy.requestedBackend ?? policy.preferredBackend ?? 'webgl',
      activationPolicy: policy.activationPolicy ?? 'webgl_only_no_renderer_fallback',
      migrationPolicy: policy.migrationPolicy ?? 'canvas2d_renderer_culled_webgl_only_v1',
      sceneLayerPolicy: policy.sceneLayerPolicy ?? 'webgl_owned_layer_registry_with_renderer_neutral_projection',
      unsupportedRendererPolicy: policy.unsupportedRendererPolicy ?? 'explicit_error_no_fallback',
      canvas2dRuntimeAvailable: false,
      hiddenCanvasRenderLoopActive: false,
      layerOrder: this.registry.getLayerIds(),
      webglLayerOrder: this.registry.getLayerIds(),
      layerStats: {},
      webglMigrationCoverageStatus: policy.migrationCoverageStatus ?? 'webgl_only_canvas2d_renderer_culled',
      webglDarknessLayerActive: false,
      webglLightCount: 0,
      webglDarknessRenderMs: 0,
      webglDarknessMode: null,
      webglLightingProfileId: null,
      webglLightingInfluenceCount: 0,
      webglEmitterCompositeMode: null,
      webglLocalRevealInfluenceCount: 0,
      webglLocalGlowInfluenceCount: 0,
      webglLocalCoreInfluenceCount: 0,
      webglFlickeringLightCount: 0,
      webglLightSpaceCullingActive: false,
      webglLightSpaceCulledCount: 0,
      webglLightSpaceMode: null,
      webglOcclusionShadowMode: null,
      webglOcclusionShadowRegions: 0,
      webglOcclusionShadowRenderable: false,
      webglShadowShaderMode: null,
      webglShadowCompositeMode: null,
      webglShadowBlendStrength: 0,
      webglShadowFieldEdgeSoftness: 0,
      webglShadowFieldPenumbraGamma: 0,
      webglShadowFieldTailFloor: 0,
      webglShadowLightHaloBlendScale: 0,
      webglShadowPenumbraTriangleCount: 0,
      webglShadowCoreTriangleCount: 0,
      webglShadowContactTriangleCount: 0,
      webglShadowSegmentCount: 0,
      webglShadowFieldPacketCount: 0,
      webglShadowFieldSampleCount: 0,
      webglShadowFieldPrimitiveCount: 0,
      webglShadowSilhouettePrimitiveCount: 0,
      webglShadowShaderPacketCount: 0,
      webglShadowShaderPrimitiveCount: 0,
      webglSceneryLayerActive: false,
      webglSceneryMode: null,
      webglScenerySourceCount: 0,
      webglSceneryPrimitiveCount: 0,
      webglSceneryRenderMs: 0,
      webglWorldDepthLayerActive: false,
      webglWorldDepthMode: null,
      webglWorldDepthItemCount: 0,
      webglDecalLayerActive: false,
      webglDecalMode: null,
      webglDecalSourceCount: 0,
      webglDecalPrimitiveCount: 0,
      webglDecalRenderMs: 0,
      webglEffectLayerActive: false,
      webglEffectMode: null,
      webglEffectSourceCount: 0,
      webglEffectPrimitiveCount: 0,
      webglEffectRenderMs: 0,
      webglParticleCount: 0,
      webglParticlePrimitiveCount: 0,
      webglParticleBudgetMax: 0,
      webglHudLayerActive: false,
      webglHudLineCount: 0,
      webglHudRenderMs: 0,
      webglHudMode: null,
      webglPlayerWyvernSilhouetteActive: false,
      webglPlayerWyvernPartCount: 0,
      webglRaiderHumanoidSilhouetteActive: false,
      webglRaiderHumanoidPartCount: 0,
      webglRaiderHumanoidTorchSocketCount: 0,
      webglRaiderHumanoidSpearSocketCount: 0,
      webglRaiderHumanoidMode: null,
      webglPredatorSilhouetteActive: false,
      webglPredatorPartCount: 0,
      webglPredatorMode: null,
      webglActorRenderMs: 0,
      webglActorMode: null,
      webglActorLightReadabilityMode: null,
      webglActorLightReadabilityCount: 0,
      webglActorLightInfluenceCount: 0,
      webglActorRimPrimitiveCount: 0,
      webglActorCatchlightPrimitiveCount: 0,
      webglActorContactShadowPrimitiveCount: 0,
      webglActorCoreOcclusionPrimitiveCount: 0,
      webglActorShadowLodMode: null,
      webglActorShadowLodCount: 0,
      webglActorShadowLodPrimitiveCount: 0,
      webglPostProcessActive: false,
      webglPostProcessMode: null,
      webglPostProcessRenderMs: 0,
      webglPostProcessPassCount: 0,
      webglPostProcessRenderTargetActive: false,
      webglFogSmokeLayerActive: false,
      webglFogSmokeMode: null,
      webglFogSmokeSourceCount: 0,
      webglFogSmokePrimitiveCount: 0,
      webglFogSmokeRenderMs: 0,
      backendPresentMs: 0,
      totalRenderMs: 0
    };

    if (typeof canvas.addEventListener === 'function') {
      canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        this.status.backendStatus = 'context_lost';
        this.status.fallbackReason = 'webgl_context_lost';
      });
    }
  }

  beginFrame(cameraState) {
    const size = this.camera.resize();
    this.camera.syncFromCamera(cameraState);
    this.scene.resize(size.w, size.h);
    this.renderTargetWidth = size.w;
    this.renderTargetHeight = size.h;
    return size;
  }

  renderProjection(projection) {
    const stats = this.registry.getStats();
    timeWebGLPhase(stats, 'totalMs', () => {
      const context = this.context(projection);
      this.registry.update(projection, context);
      this.postProcess.beginScene(this.renderTargetWidth, this.renderTargetHeight);
      this.scene.clear();
      this.registry.render(context);
      this.renderFrame += 1;
    });
    const summary = buildWebGLStatsSummary(stats);
    this.status.layerStats = summary.layers;
    this.status.layerOrder = summary.layerOrder;
    this.status.webglLayerOrder = summary.layerOrder;
    this.status.textureUploads = summary.textureUploads;
    this.status.fullSceneTextureUploadActive = summary.fullSceneTextureUploadActive;
    this.status.backendPresentMs = summary.backendPresentMs;
    this.status.totalRenderMs = summary.totalMs;
    this.recordWorldDepthDiagnostics(summary.layers.worldDepth);
    this.recordSceneryDiagnostics(summary.layers.worldDepth);
    this.recordDecalDiagnostics(summary.layers.decals);
    this.recordActorDiagnostics(summary.layers.worldDepth);
    this.recordEffectDiagnostics(summary.layers.effects);
    this.recordDarknessDiagnostics(summary.layers.lighting, summary.layers.shadows);
    this.recordLightSpaceDiagnostics(summary.layers);
    this.recordFogSmokeDiagnostics(summary.layers.fogSmoke);
    this.recordPostProcessDiagnostics(summary.layers.postProcess);
    this.recordHudDiagnostics(summary.layers.hudDebug);
  }

  present() {}

  recordDiagnostics(stats) {
    if (!stats) return;
    Object.assign(stats, {
      preferredBackend: this.status.preferredBackend,
      candidateBackend: this.status.candidateBackend,
      activeBackend: this.status.activeBackend,
      backendStatus: this.status.backendStatus,
      fallbackReason: this.status.fallbackReason,
      initializationError: this.status.initializationError,
      webglContext: this.status.webglContext,
      textureUploads: this.status.textureUploads,
      fullSceneTextureUploadActive: this.status.fullSceneTextureUploadActive,
      rendererMode: this.status.rendererMode,
      legacyCompositeActive: this.status.legacyCompositeActive,
      preferenceSource: this.status.preferenceSource,
      requestedBackend: this.status.requestedBackend,
      activationPolicy: this.status.activationPolicy,
      migrationPolicy: this.status.migrationPolicy,
      sceneLayerPolicy: this.status.sceneLayerPolicy,
      unsupportedRendererPolicy: this.status.unsupportedRendererPolicy,
      canvas2dRuntimeAvailable: this.status.canvas2dRuntimeAvailable,
      hiddenCanvasRenderLoopActive: this.status.hiddenCanvasRenderLoopActive,
      layerOrder: [...this.status.layerOrder],
      webglLayerOrder: [...this.status.webglLayerOrder],
      layerStats: { ...this.status.layerStats },
      webglMigrationCoverageStatus: this.status.webglMigrationCoverageStatus,
      webglDarknessLayerActive: this.status.webglDarknessLayerActive,
      webglLightCount: this.status.webglLightCount,
      webglDarknessRenderMs: this.status.webglDarknessRenderMs,
      webglDarknessMode: this.status.webglDarknessMode,
      webglLightingProfileId: this.status.webglLightingProfileId,
      webglLightingInfluenceCount: this.status.webglLightingInfluenceCount,
      webglEmitterCompositeMode: this.status.webglEmitterCompositeMode,
      webglLocalRevealInfluenceCount: this.status.webglLocalRevealInfluenceCount,
      webglLocalGlowInfluenceCount: this.status.webglLocalGlowInfluenceCount,
      webglLocalCoreInfluenceCount: this.status.webglLocalCoreInfluenceCount,
      webglFlickeringLightCount: this.status.webglFlickeringLightCount,
      webglLightSpaceCullingActive: this.status.webglLightSpaceCullingActive,
      webglLightSpaceCulledCount: this.status.webglLightSpaceCulledCount,
      webglLightSpaceMode: this.status.webglLightSpaceMode,
      webglOcclusionShadowMode: this.status.webglOcclusionShadowMode,
      webglOcclusionShadowRegions: this.status.webglOcclusionShadowRegions,
      webglOcclusionShadowRenderable: this.status.webglOcclusionShadowRenderable,
      webglShadowShaderMode: this.status.webglShadowShaderMode,
      webglShadowCompositeMode: this.status.webglShadowCompositeMode,
      webglShadowBlendStrength: this.status.webglShadowBlendStrength,
      webglShadowFieldEdgeSoftness: this.status.webglShadowFieldEdgeSoftness,
      webglShadowFieldPenumbraGamma: this.status.webglShadowFieldPenumbraGamma,
      webglShadowFieldTailFloor: this.status.webglShadowFieldTailFloor,
      webglShadowLightHaloBlendScale: this.status.webglShadowLightHaloBlendScale,
      webglShadowPenumbraTriangleCount: this.status.webglShadowPenumbraTriangleCount,
      webglShadowCoreTriangleCount: this.status.webglShadowCoreTriangleCount,
      webglShadowContactTriangleCount: this.status.webglShadowContactTriangleCount,
      webglShadowSegmentCount: this.status.webglShadowSegmentCount,
      webglShadowFieldPacketCount: this.status.webglShadowFieldPacketCount,
      webglShadowFieldSampleCount: this.status.webglShadowFieldSampleCount,
      webglShadowFieldPrimitiveCount: this.status.webglShadowFieldPrimitiveCount,
      webglShadowSilhouettePrimitiveCount: this.status.webglShadowSilhouettePrimitiveCount,
      webglShadowShaderPacketCount: this.status.webglShadowShaderPacketCount,
      webglShadowShaderPrimitiveCount: this.status.webglShadowShaderPrimitiveCount,
      webglSceneryLayerActive: this.status.webglSceneryLayerActive,
      webglSceneryMode: this.status.webglSceneryMode,
      webglScenerySourceCount: this.status.webglScenerySourceCount,
      webglSceneryPrimitiveCount: this.status.webglSceneryPrimitiveCount,
      webglSceneryRenderMs: this.status.webglSceneryRenderMs,
      webglWorldDepthLayerActive: this.status.webglWorldDepthLayerActive,
      webglWorldDepthMode: this.status.webglWorldDepthMode,
      webglWorldDepthItemCount: this.status.webglWorldDepthItemCount,
      webglDecalLayerActive: this.status.webglDecalLayerActive,
      webglDecalMode: this.status.webglDecalMode,
      webglDecalSourceCount: this.status.webglDecalSourceCount,
      webglDecalPrimitiveCount: this.status.webglDecalPrimitiveCount,
      webglDecalRenderMs: this.status.webglDecalRenderMs,
      webglEffectLayerActive: this.status.webglEffectLayerActive,
      webglEffectMode: this.status.webglEffectMode,
      webglEffectSourceCount: this.status.webglEffectSourceCount,
      webglEffectPrimitiveCount: this.status.webglEffectPrimitiveCount,
      webglEffectRenderMs: this.status.webglEffectRenderMs,
      webglParticleCount: this.status.webglParticleCount,
      webglParticlePrimitiveCount: this.status.webglParticlePrimitiveCount,
      webglParticleBudgetMax: this.status.webglParticleBudgetMax,
      webglHudLayerActive: this.status.webglHudLayerActive,
      webglHudLineCount: this.status.webglHudLineCount,
      webglHudRenderMs: this.status.webglHudRenderMs,
      webglHudMode: this.status.webglHudMode,
      webglPlayerWyvernSilhouetteActive: this.status.webglPlayerWyvernSilhouetteActive,
      webglPlayerWyvernPartCount: this.status.webglPlayerWyvernPartCount,
      webglRaiderHumanoidSilhouetteActive: this.status.webglRaiderHumanoidSilhouetteActive,
      webglRaiderHumanoidPartCount: this.status.webglRaiderHumanoidPartCount,
      webglRaiderHumanoidTorchSocketCount: this.status.webglRaiderHumanoidTorchSocketCount,
      webglRaiderHumanoidSpearSocketCount: this.status.webglRaiderHumanoidSpearSocketCount,
      webglRaiderHumanoidMode: this.status.webglRaiderHumanoidMode,
      webglPredatorSilhouetteActive: this.status.webglPredatorSilhouetteActive,
      webglPredatorPartCount: this.status.webglPredatorPartCount,
      webglPredatorMode: this.status.webglPredatorMode,
      webglActorRenderMs: this.status.webglActorRenderMs,
      webglActorMode: this.status.webglActorMode,
      webglActorLightReadabilityMode: this.status.webglActorLightReadabilityMode,
      webglActorLightReadabilityCount: this.status.webglActorLightReadabilityCount,
      webglActorLightInfluenceCount: this.status.webglActorLightInfluenceCount,
      webglActorRimPrimitiveCount: this.status.webglActorRimPrimitiveCount,
      webglActorCatchlightPrimitiveCount: this.status.webglActorCatchlightPrimitiveCount,
      webglActorContactShadowPrimitiveCount: this.status.webglActorContactShadowPrimitiveCount,
      webglActorCoreOcclusionPrimitiveCount: this.status.webglActorCoreOcclusionPrimitiveCount,
      webglActorShadowLodMode: this.status.webglActorShadowLodMode,
      webglActorShadowLodCount: this.status.webglActorShadowLodCount,
      webglActorShadowLodPrimitiveCount: this.status.webglActorShadowLodPrimitiveCount,
      webglPostProcessActive: this.status.webglPostProcessActive,
      webglPostProcessMode: this.status.webglPostProcessMode,
      webglPostProcessRenderMs: this.status.webglPostProcessRenderMs,
      webglPostProcessPassCount: this.status.webglPostProcessPassCount,
      webglPostProcessRenderTargetActive: this.status.webglPostProcessRenderTargetActive,
      webglFogSmokeLayerActive: this.status.webglFogSmokeLayerActive,
      webglFogSmokeMode: this.status.webglFogSmokeMode,
      webglFogSmokeSourceCount: this.status.webglFogSmokeSourceCount,
      webglFogSmokePrimitiveCount: this.status.webglFogSmokePrimitiveCount,
      webglFogSmokeRenderMs: this.status.webglFogSmokeRenderMs,
      backendPresentMs: this.status.backendPresentMs,
      totalRenderMs: this.status.totalRenderMs
    });
  }

  recordActorDiagnostics(layerStats) {
    this.status.webglPlayerWyvernSilhouetteActive = !!layerStats?.playerWyvernSilhouetteActive;
    this.status.webglPlayerWyvernPartCount = layerStats?.playerWyvernPartCount ?? 0;
    this.status.webglRaiderHumanoidSilhouetteActive = !!layerStats?.raiderHumanoidSilhouetteActive;
    this.status.webglRaiderHumanoidPartCount = layerStats?.raiderHumanoidPartCount ?? 0;
    this.status.webglRaiderHumanoidTorchSocketCount = layerStats?.raiderHumanoidTorchSocketCount ?? 0;
    this.status.webglRaiderHumanoidSpearSocketCount = layerStats?.raiderHumanoidSpearSocketCount ?? 0;
    this.status.webglRaiderHumanoidMode = layerStats?.raiderHumanoidMode ?? null;
    this.status.webglPredatorSilhouetteActive = !!layerStats?.predatorSilhouetteActive;
    this.status.webglPredatorPartCount = layerStats?.predatorPartCount ?? 0;
    this.status.webglPredatorMode = layerStats?.predatorMode ?? null;
    this.status.webglActorRenderMs = layerStats?.renderMs ?? 0;
    this.status.webglActorMode = layerStats?.actorMode ?? null;
    this.status.webglActorLightReadabilityMode = layerStats?.actorLightReadabilityMode ?? null;
    this.status.webglActorLightReadabilityCount = layerStats?.actorLightReadabilityCount ?? 0;
    this.status.webglActorLightInfluenceCount = layerStats?.actorLightInfluenceCount ?? 0;
    this.status.webglActorRimPrimitiveCount = layerStats?.actorRimPrimitiveCount ?? 0;
    this.status.webglActorCatchlightPrimitiveCount = layerStats?.actorCatchlightPrimitiveCount ?? 0;
    this.status.webglActorContactShadowPrimitiveCount = layerStats?.actorContactShadowPrimitiveCount ?? 0;
    this.status.webglActorCoreOcclusionPrimitiveCount = layerStats?.actorCoreOcclusionPrimitiveCount ?? 0;
    this.status.webglActorShadowLodMode = layerStats?.actorShadowLodMode ?? null;
    this.status.webglActorShadowLodCount = layerStats?.actorShadowLodCount ?? 0;
    this.status.webglActorShadowLodPrimitiveCount = layerStats?.actorShadowLodPrimitiveCount ?? 0;
  }

  recordDarknessDiagnostics(lightLayerStats, shadowLayerStats = null) {
    const shadowStats = shadowLayerStats ?? lightLayerStats;
    this.status.webglDarknessLayerActive = lightLayerStats?.status === 'active';
    this.status.webglLightCount = lightLayerStats?.activeLightCount ?? lightLayerStats?.objectCount ?? 0;
    this.status.webglDarknessRenderMs = (lightLayerStats?.renderMs ?? 0) + (shadowLayerStats?.renderMs ?? 0);
    this.status.webglDarknessMode = lightLayerStats?.darknessMode ?? null;
    this.status.webglLightingProfileId = lightLayerStats?.lightingProfileId ?? shadowStats?.lightingProfileId ?? null;
    this.status.webglLightingInfluenceCount = lightLayerStats?.influenceCount ?? 0;
    this.status.webglEmitterCompositeMode = lightLayerStats?.emitterCompositeMode ?? null;
    this.status.webglLocalRevealInfluenceCount = lightLayerStats?.localRevealInfluenceCount ?? 0;
    this.status.webglLocalGlowInfluenceCount = lightLayerStats?.localGlowInfluenceCount ?? 0;
    this.status.webglLocalCoreInfluenceCount = lightLayerStats?.localCoreInfluenceCount ?? 0;
    this.status.webglFlickeringLightCount = lightLayerStats?.flickeringLightCount ?? 0;
    this.status.webglOcclusionShadowMode = shadowStats?.occlusionShadowMode ?? null;
    this.status.webglOcclusionShadowRegions = shadowStats?.occlusionShadowRegions ?? 0;
    this.status.webglOcclusionShadowRenderable = !!shadowStats?.occlusionShadowRenderable;
    this.status.webglShadowShaderMode = shadowStats?.shadowShaderMode ?? null;
    this.status.webglShadowCompositeMode = shadowStats?.shadowCompositeMode ?? null;
    this.status.webglShadowBlendStrength = shadowStats?.shadowBlendStrength ?? 0;
    this.status.webglShadowFieldEdgeSoftness = shadowStats?.shadowFieldEdgeSoftness ?? 0;
    this.status.webglShadowFieldPenumbraGamma = shadowStats?.shadowFieldPenumbraGamma ?? 0;
    this.status.webglShadowFieldTailFloor = shadowStats?.shadowFieldTailFloor ?? 0;
    this.status.webglShadowLightHaloBlendScale = shadowStats?.shadowLightHaloBlendScale ?? 0;
    this.status.webglShadowPenumbraTriangleCount = shadowStats?.shadowPenumbraTriangleCount ?? 0;
    this.status.webglShadowCoreTriangleCount = shadowStats?.shadowCoreTriangleCount ?? 0;
    this.status.webglShadowContactTriangleCount = shadowStats?.shadowContactTriangleCount ?? 0;
    this.status.webglShadowSegmentCount = shadowStats?.shadowSegmentCount ?? 0;
    this.status.webglShadowFieldPacketCount = shadowStats?.shadowFieldPacketCount ?? 0;
    this.status.webglShadowFieldSampleCount = shadowStats?.shadowFieldSampleCount ?? 0;
    this.status.webglShadowFieldPrimitiveCount = shadowStats?.shadowFieldPrimitiveCount ?? 0;
    this.status.webglShadowSilhouettePrimitiveCount = shadowStats?.shadowSilhouettePrimitiveCount ?? 0;
    this.status.webglShadowShaderPacketCount = shadowStats?.shadowShaderPacketCount ?? 0;
    this.status.webglShadowShaderPrimitiveCount = shadowStats?.shadowShaderPrimitiveCount ?? 0;
  }

  recordLightSpaceDiagnostics(layers) {
    const layerStats = Object.values(layers ?? {});
    this.status.webglLightSpaceCullingActive = layerStats.some((layer) => !!layer.lightSpaceCullingActive);
    this.status.webglLightSpaceCulledCount = layerStats.reduce((sum, layer) => sum + (layer.lightSpaceCulledCount ?? 0), 0);
    this.status.webglLightSpaceMode = layerStats.find((layer) => layer.lightSpaceMode)?.lightSpaceMode ?? null;
  }

  recordDecalDiagnostics(layerStats) {
    this.status.webglDecalLayerActive = layerStats?.status === 'active';
    this.status.webglDecalMode = layerStats?.decalMode ?? null;
    this.status.webglDecalSourceCount = layerStats?.sourceCount ?? layerStats?.objectCount ?? 0;
    this.status.webglDecalPrimitiveCount = layerStats?.primitiveCount ?? 0;
    this.status.webglDecalRenderMs = layerStats?.renderMs ?? 0;
  }

  recordEffectDiagnostics(layerStats) {
    this.status.webglEffectLayerActive = layerStats?.status === 'active';
    this.status.webglEffectMode = layerStats?.effectMode ?? layerStats?.mode ?? null;
    this.status.webglEffectSourceCount = layerStats?.sourceCount ?? layerStats?.objectCount ?? 0;
    this.status.webglEffectPrimitiveCount = layerStats?.primitiveCount ?? 0;
    this.status.webglEffectRenderMs = layerStats?.renderMs ?? 0;
    this.status.webglParticleCount = layerStats?.particleCount ?? 0;
    this.status.webglParticlePrimitiveCount = layerStats?.particlePrimitiveCount ?? 0;
    this.status.webglParticleBudgetMax = layerStats?.maxParticleCount ?? 0;
  }

  recordSceneryDiagnostics(layerStats) {
    this.status.webglSceneryLayerActive = layerStats?.status === 'active';
    this.status.webglSceneryMode = layerStats?.sceneryMode ?? layerStats?.mode ?? null;
    this.status.webglScenerySourceCount = layerStats?.scenerySourceCount ?? layerStats?.sourceCount ?? layerStats?.objectCount ?? 0;
    this.status.webglSceneryPrimitiveCount = layerStats?.sceneryPrimitiveCount ?? layerStats?.primitiveCount ?? 0;
    this.status.webglSceneryRenderMs = layerStats?.renderMs ?? 0;
  }

  recordWorldDepthDiagnostics(layerStats) {
    this.status.webglWorldDepthLayerActive = layerStats?.status === 'active';
    this.status.webglWorldDepthMode = layerStats?.worldDepthMode ?? layerStats?.mode ?? null;
    this.status.webglWorldDepthItemCount = layerStats?.depthSortedItemCount ?? 0;
  }

  recordPostProcessDiagnostics(layerStats) {
    this.status.webglPostProcessActive = layerStats?.status === 'active';
    this.status.webglPostProcessMode = layerStats?.postProcessMode ?? null;
    this.status.webglPostProcessRenderMs = layerStats?.renderMs ?? 0;
    this.status.webglPostProcessPassCount = layerStats?.passCount ?? 0;
    this.status.webglPostProcessRenderTargetActive = !!layerStats?.renderTargetActive;
  }

  recordFogSmokeDiagnostics(layerStats) {
    this.status.webglFogSmokeLayerActive = layerStats?.status === 'active';
    this.status.webglFogSmokeMode = layerStats?.fogSmokeMode ?? null;
    this.status.webglFogSmokeSourceCount = layerStats?.sourceCount ?? layerStats?.objectCount ?? 0;
    this.status.webglFogSmokePrimitiveCount = layerStats?.primitiveCount ?? 0;
    this.status.webglFogSmokeRenderMs = layerStats?.renderMs ?? 0;
  }

  recordHudDiagnostics(layerStats) {
    this.status.webglHudLayerActive = layerStats?.status === 'active';
    this.status.webglHudLineCount = layerStats?.lineCount ?? 0;
    this.status.webglHudRenderMs = layerStats?.renderMs ?? 0;
    this.status.webglHudMode = layerStats?.hudMode ?? null;
  }

  context(projection = null) {
    return {
      gl: this.scene.gl,
      scene: this.scene,
      postProcess: this.postProcess,
      camera: this.camera,
      renderTargetWidth: this.renderTargetWidth,
      renderTargetHeight: this.renderTargetHeight,
      renderTimeMs: Number.isFinite(projection?.source?.renderTime) ? projection.source.renderTime * 1000 : null,
      renderFrame: this.renderFrame,
      sceneObjectVisibilityStates: this.sceneObjectVisibilityStates,
      lightSpaceCulling: projection?.lightSpaceCulling ?? null,
      occlusionShadows: projection?.occlusionShadows ?? null,
      status: this.status
    };
  }
}
