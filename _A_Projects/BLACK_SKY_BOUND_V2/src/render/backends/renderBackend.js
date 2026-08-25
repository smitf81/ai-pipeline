import { ThreeGameRenderer } from './three/ThreeGameRenderer.js';

export const RenderBackendId = Object.freeze({
  WEBGL: 'webgl',
  WEBGL3D: 'webgl3d',
  UNSUPPORTED: 'unsupported_renderer'
});

export function createRenderBackend(canvas, policy = {}) {
  const preference = resolveBackendPreference(policy);
  const selectedPolicy = {
    ...policy,
    preferredBackend: preference.backend,
    requestedBackend: preference.requestedBackend,
    preferenceSource: preference.source
  };

  if (preference.backend === RenderBackendId.WEBGL3D) {
    try {
      const renderer = new ThreeGameRenderer(canvas, selectedPolicy);
      return {
        id: RenderBackendId.WEBGL3D,
        mode: 'three3d_real_scene',
        status: renderer.status,
        projectionRequired: !renderer.referenceId,
        beginFrame(camera) { return renderer.beginFrame(camera); },
        renderProjection(projection) { renderer.renderProjection(projection); },
        present() { renderer.present(); },
        recordDiagnostics(stats) { renderer.recordDiagnostics(stats); },
        setExternalFrameTiming(timing) { renderer.setExternalFrameTiming(timing); },
        setTerrainDebugMode(mode) { return renderer.setTerrainDebugMode(mode); },
        setGroundDetailEnabled(enabled) { return renderer.setGroundDetailEnabled(enabled); },
        setTerrainProofCanopyVisible(visible) { return renderer.setTerrainProofCanopyVisible(visible); },
        resourceAuditTarget() { return renderer.resourceAuditTarget(); },
        dispose() { renderer.dispose(); }
      };
    } catch (error) {
      const backend = createWebGL3DErrorBackend(canvas, selectedPolicy, error);
      console.error(`Black Sky Bound WebGL3D renderer failed to initialize: ${backend.status.initializationError}`);
      return backend;
    }
  }

  const backend = createUnsupportedRendererBackend(canvas, selectedPolicy);
  console.error(`Black Sky Bound renderer request is unsupported: ${backend.status.initializationError}`);
  return backend;
}

function createWebGL3DErrorBackend(canvas, policy, error) {
  const status = createBaseStatus(policy, {
    activeBackend: RenderBackendId.WEBGL3D,
    candidateBackend: RenderBackendId.WEBGL3D,
    backendStatus: 'error',
    fallbackReason: 'webgl3d_initialization_failed',
    initializationError: error?.message ?? 'webgl3d_renderer_unavailable',
    webglContext: 'unavailable',
    rendererMode: 'webgl3d_error',
    webglMigrationCoverageStatus: 'webgl3d_candidate_boot_error_no_renderer_fallback',
    webgl3dActive: false
  });
  return createNoopBackend(canvas, RenderBackendId.WEBGL3D, 'webgl3d_error', status);
}

function createUnsupportedRendererBackend(canvas, policy) {
  const requested = policy.requestedBackend ?? policy.preferredBackend ?? 'unknown';
  const status = createBaseStatus(policy, {
    activeBackend: RenderBackendId.UNSUPPORTED,
    backendStatus: 'error',
    fallbackReason: 'unsupported_renderer_backend',
    initializationError: `Renderer "${requested}" is unsupported. Legacy 2D rendering is retired; use renderer=webgl3d.`,
    webglContext: 'not_requested',
    rendererMode: 'unsupported_renderer',
    webglMigrationCoverageStatus: 'unsupported_renderer_request_no_canvas2d_runtime'
  });

  return createNoopBackend(canvas, RenderBackendId.UNSUPPORTED, 'unsupported_renderer', status);
}

function createNoopBackend(canvas, id, mode, status) {
  return {
    id,
    mode,
    status,
    beginFrame(camera) {
      const size = resizeCanvasToDisplaySize(canvas);
      if (camera) {
        camera.viewportW = size.viewportW;
        camera.viewportH = size.viewportH;
      }
      return size;
    },
    renderProjection() {},
    present() {},
    recordDiagnostics(stats) {
      writeBackendStats(stats, status);
    },
    dispose() {}
  };
}

function createBaseStatus(policy, overrides = {}) {
  return {
    preferredBackend: policy.preferredBackend ?? RenderBackendId.WEBGL3D,
    candidateBackend: policy.candidateBackend ?? RenderBackendId.WEBGL3D,
    requestedBackend: policy.requestedBackend ?? policy.preferredBackend ?? RenderBackendId.WEBGL3D,
    activeBackend: RenderBackendId.WEBGL3D,
    backendStatus: 'pending',
    fallbackReason: null,
    initializationError: null,
    webglContext: 'uninitialized',
    textureUploads: 0,
    fullSceneTextureUploadActive: false,
    rendererMode: 'pending',
    legacyCompositeActive: false,
    preferenceSource: policy.preferenceSource ?? 'budget_default',
    activationPolicy: policy.activationPolicy ?? 'webgl3d_default_no_renderer_fallback',
    migrationPolicy: policy.migrationPolicy ?? 'three3d_default_legacy_webgl_alias_retired_v1',
    sceneLayerPolicy: policy.sceneLayerPolicy ?? 'three_scene_graph_consumes_renderer_neutral_projection',
    unsupportedRendererPolicy: policy.unsupportedRendererPolicy ?? 'explicit_error_no_fallback',
    hiddenCanvasRenderLoopActive: false,
    canvas2dRuntimeAvailable: false,
    layerOrder: [],
    webglLayerOrder: [],
    layerStats: {},
    webglMigrationCoverageStatus: policy.migrationCoverageStatus ?? 'three3d_default_legacy_scene_root_unregistered',
    webglIlluminationCompositeActive: false,
    webglLightCount: 0,
    webglIlluminationRenderMs: 0,
    webglIlluminationCompositeMode: null,
    webglDecalLayerActive: false,
    webglDecalMode: null,
    webglDecalSourceCount: 0,
    webglDecalPrimitiveCount: 0,
    webglDecalRenderMs: 0,
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
    totalRenderMs: 0,
    ...overrides
  };
}

function resizeCanvasToDisplaySize(canvas) {
  const dpr = Math.max(1, Math.min(2, globalThis.devicePixelRatio || 1));
  const w = Math.max(1, Math.floor(canvas.clientWidth * dpr || 1280));
  const h = Math.max(1, Math.floor(canvas.clientHeight * dpr || 720));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { dpr, w, h, viewportW: w / dpr, viewportH: h / dpr };
}

function resolveBackendPreference(policy) {
  const runtimeBackend = readRuntimeBackendPreference();
  if (runtimeBackend) {
    const backend = normalizeBackendPreference(runtimeBackend);
    return {
      backend: backend ?? RenderBackendId.UNSUPPORTED,
      requestedBackend: runtimeBackend,
      source: 'runtime_override'
    };
  }

  const policyBackend = policy.preferredBackend ?? RenderBackendId.WEBGL3D;
  const backend = normalizeBackendPreference(policyBackend);
  return {
    backend: backend ?? RenderBackendId.UNSUPPORTED,
    requestedBackend: policyBackend,
    source: 'budget_default'
  };
}

function readRuntimeBackendPreference() {
  const search = globalThis.location?.search;
  if (search) {
    const value = new URLSearchParams(search).get('renderer');
    if (value) return value;
  }
  try {
    return globalThis.localStorage?.getItem?.('bsb.rendererBackend') ?? null;
  } catch {
    return null;
  }
}

function normalizeBackendPreference(value) {
  if (value === RenderBackendId.WEBGL || value === 'webgl') return RenderBackendId.WEBGL3D;
  if (value === RenderBackendId.WEBGL3D || value === 'webgl3d') return RenderBackendId.WEBGL3D;
  return null;
}

function writeBackendStats(stats, status) {
  if (!stats) return;
  stats.preferredBackend = status.preferredBackend;
  stats.candidateBackend = status.candidateBackend;
  stats.requestedBackend = status.requestedBackend;
  stats.activeBackend = status.activeBackend;
  stats.backendStatus = status.backendStatus;
  stats.fallbackReason = status.fallbackReason;
  stats.initializationError = status.initializationError;
  stats.webglContext = status.webglContext;
  stats.textureUploads = status.textureUploads;
  stats.fullSceneTextureUploadActive = status.fullSceneTextureUploadActive;
  stats.rendererMode = status.rendererMode;
  stats.legacyCompositeActive = status.legacyCompositeActive;
  stats.preferenceSource = status.preferenceSource;
  stats.activationPolicy = status.activationPolicy;
  stats.migrationPolicy = status.migrationPolicy;
  stats.sceneLayerPolicy = status.sceneLayerPolicy;
  stats.unsupportedRendererPolicy = status.unsupportedRendererPolicy;
  stats.hiddenCanvasRenderLoopActive = !!status.hiddenCanvasRenderLoopActive;
  stats.canvas2dRuntimeAvailable = !!status.canvas2dRuntimeAvailable;
  stats.layerOrder = [...(status.layerOrder ?? [])];
  stats.webglLayerOrder = [...(status.webglLayerOrder ?? [])];
  stats.layerStats = { ...(status.layerStats ?? {}) };
  stats.webglMigrationCoverageStatus = status.webglMigrationCoverageStatus ?? null;
  stats.webglIlluminationCompositeActive = !!status.webglIlluminationCompositeActive;
  stats.webglLightCount = status.webglLightCount ?? 0;
  stats.webglIlluminationRenderMs = status.webglIlluminationRenderMs ?? 0;
  stats.webglIlluminationCompositeMode = status.webglIlluminationCompositeMode ?? null;
  stats.webglDecalLayerActive = !!status.webglDecalLayerActive;
  stats.webglDecalMode = status.webglDecalMode ?? null;
  stats.webglDecalSourceCount = status.webglDecalSourceCount ?? 0;
  stats.webglDecalPrimitiveCount = status.webglDecalPrimitiveCount ?? 0;
  stats.webglDecalRenderMs = status.webglDecalRenderMs ?? 0;
  stats.webglHudLayerActive = !!status.webglHudLayerActive;
  stats.webglHudLineCount = status.webglHudLineCount ?? 0;
  stats.webglHudRenderMs = status.webglHudRenderMs ?? 0;
  stats.webglHudMode = status.webglHudMode ?? null;
  stats.webglPlayerWyvernSilhouetteActive = !!status.webglPlayerWyvernSilhouetteActive;
  stats.webglPlayerWyvernPartCount = status.webglPlayerWyvernPartCount ?? 0;
  stats.webglRaiderHumanoidSilhouetteActive = !!status.webglRaiderHumanoidSilhouetteActive;
  stats.webglRaiderHumanoidPartCount = status.webglRaiderHumanoidPartCount ?? 0;
  stats.webglRaiderHumanoidTorchSocketCount = status.webglRaiderHumanoidTorchSocketCount ?? 0;
  stats.webglRaiderHumanoidSpearSocketCount = status.webglRaiderHumanoidSpearSocketCount ?? 0;
  stats.webglRaiderHumanoidMode = status.webglRaiderHumanoidMode ?? null;
  stats.webglPredatorSilhouetteActive = !!status.webglPredatorSilhouetteActive;
  stats.webglPredatorPartCount = status.webglPredatorPartCount ?? 0;
  stats.webglPredatorMode = status.webglPredatorMode ?? null;
  stats.webglActorRenderMs = status.webglActorRenderMs ?? 0;
  stats.webglActorMode = status.webglActorMode ?? null;
  stats.webglPostProcessActive = !!status.webglPostProcessActive;
  stats.webglPostProcessMode = status.webglPostProcessMode ?? null;
  stats.webglPostProcessRenderMs = status.webglPostProcessRenderMs ?? 0;
  stats.webglPostProcessPassCount = status.webglPostProcessPassCount ?? 0;
  stats.webglPostProcessRenderTargetActive = !!status.webglPostProcessRenderTargetActive;
  stats.webglFogSmokeLayerActive = !!status.webglFogSmokeLayerActive;
  stats.webglFogSmokeMode = status.webglFogSmokeMode ?? null;
  stats.webglFogSmokeSourceCount = status.webglFogSmokeSourceCount ?? 0;
  stats.webglFogSmokePrimitiveCount = status.webglFogSmokePrimitiveCount ?? 0;
  stats.webglFogSmokeRenderMs = status.webglFogSmokeRenderMs ?? 0;
  stats.backendPresentMs = status.backendPresentMs ?? 0;
  stats.totalRenderMs = status.totalRenderMs ?? 0;
  stats.webgl3dActive = !!status.webgl3dActive;
  stats.webgl3dReferenceScene = status.webgl3dReferenceScene ?? null;
  stats.webgl3dWorldTransformContract = status.webgl3dWorldTransformContract ?? null;
  stats.webgl3dTreeSpatialRecipeContract = status.webgl3dTreeSpatialRecipeContract ?? null;
  stats.webgl3dDiagnostics = status.webgl3dDiagnostics ?? null;
}
