import { WebGLGameRenderer } from './webgl/WebGLGameRenderer.js';

export const RenderBackendId = Object.freeze({
  WEBGL: 'webgl',
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

  if (preference.backend === RenderBackendId.WEBGL) {
    try {
      const renderer = new WebGLGameRenderer(canvas, selectedPolicy);
      return {
        id: RenderBackendId.WEBGL,
        mode: 'webgl_real_layers',
        status: renderer.status,
        beginFrame(camera) {
          return renderer.beginFrame(camera);
        },
        renderProjection(projection) {
          renderer.renderProjection(projection);
        },
        present() {
          renderer.present();
        },
        recordDiagnostics(stats) {
          renderer.recordDiagnostics(stats);
        }
      };
    } catch (error) {
      const backend = createWebGLErrorBackend(canvas, selectedPolicy, error);
      console.error(`Black Sky Bound WebGL renderer failed to initialize: ${backend.status.initializationError}`);
      return backend;
    }
  }

  const backend = createUnsupportedRendererBackend(canvas, selectedPolicy);
  console.error(`Black Sky Bound renderer request is unsupported: ${backend.status.initializationError}`);
  return backend;
}

function createWebGLErrorBackend(canvas, policy, error) {
  const status = createBaseStatus(policy, {
    activeBackend: RenderBackendId.WEBGL,
    backendStatus: 'error',
    fallbackReason: 'webgl_initialization_failed',
    initializationError: error?.message ?? 'webgl_renderer_unavailable',
    webglContext: 'unavailable',
    rendererMode: 'webgl_error',
    webglMigrationCoverageStatus: 'webgl_boot_error_no_renderer_fallback'
  });

  return createNoopBackend(canvas, RenderBackendId.WEBGL, 'webgl_error', status);
}

function createUnsupportedRendererBackend(canvas, policy) {
  const requested = policy.requestedBackend ?? policy.preferredBackend ?? 'unknown';
  const status = createBaseStatus(policy, {
    activeBackend: RenderBackendId.UNSUPPORTED,
    backendStatus: 'error',
    fallbackReason: 'unsupported_renderer_backend',
    initializationError: `Renderer "${requested}" is unsupported. Canvas 2D runtime rendering was culled; use renderer=webgl.`,
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
    }
  };
}

function createBaseStatus(policy, overrides = {}) {
  return {
    preferredBackend: policy.preferredBackend ?? RenderBackendId.WEBGL,
    candidateBackend: policy.candidateBackend ?? RenderBackendId.WEBGL,
    requestedBackend: policy.requestedBackend ?? policy.preferredBackend ?? RenderBackendId.WEBGL,
    activeBackend: RenderBackendId.WEBGL,
    backendStatus: 'pending',
    fallbackReason: null,
    initializationError: null,
    webglContext: 'uninitialized',
    textureUploads: 0,
    fullSceneTextureUploadActive: false,
    rendererMode: 'pending',
    legacyCompositeActive: false,
    preferenceSource: policy.preferenceSource ?? 'budget_default',
    activationPolicy: policy.activationPolicy ?? 'webgl_only_no_renderer_fallback',
    migrationPolicy: policy.migrationPolicy ?? 'canvas2d_renderer_culled_webgl_only_v1',
    sceneLayerPolicy: policy.sceneLayerPolicy ?? 'webgl_owned_layer_registry_with_renderer_neutral_projection',
    unsupportedRendererPolicy: policy.unsupportedRendererPolicy ?? 'explicit_error_no_fallback',
    hiddenCanvasRenderLoopActive: false,
    canvas2dRuntimeAvailable: false,
    layerOrder: [],
    webglLayerOrder: [],
    layerStats: {},
    webglMigrationCoverageStatus: policy.migrationCoverageStatus ?? 'webgl_only_canvas2d_renderer_culled',
    webglDarknessLayerActive: false,
    webglLightCount: 0,
    webglDarknessRenderMs: 0,
    webglDarknessMode: null,
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

  const policyBackend = policy.preferredBackend ?? RenderBackendId.WEBGL;
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
  if (value === RenderBackendId.WEBGL || value === 'webgl') return RenderBackendId.WEBGL;
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
  stats.webglDarknessLayerActive = !!status.webglDarknessLayerActive;
  stats.webglLightCount = status.webglLightCount ?? 0;
  stats.webglDarknessRenderMs = status.webglDarknessRenderMs ?? 0;
  stats.webglDarknessMode = status.webglDarknessMode ?? null;
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
}
