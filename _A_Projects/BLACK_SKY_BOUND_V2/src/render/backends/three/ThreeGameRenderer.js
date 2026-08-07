import * as THREE from 'three';
import { CONFIG } from '../../../config.js';
import { ThreeOrthographicCamera } from './ThreeOrthographicCamera.js';
import { ThreeTreeMeshFactory } from './ThreeTreeMeshFactory.js';
import { ThreeReferenceGrove } from './ThreeReferenceGrove.js';
import { ThreeDiagnosticsOverlay } from './ThreeDiagnosticsOverlay.js';
import { ThreeLiveWorld } from './ThreeLiveWorld.js';
import { ThreeScreenOverlay } from './ThreeScreenOverlay.js';
import { ThreeGpuFrameTimer } from './ThreeGpuFrameTimer.js';

export const THREE_RENDERER_MODE = 'three_webgl3d_physical_scene_v1';

export class ThreeGameRenderer {
  constructor(canvas, policy = {}) {
    this.canvas = canvas;
    this.search = globalThis.location?.search ?? '';
    this.referenceId = new URLSearchParams(this.search).get('reference');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.referenceId === 'tree-grove' ? 1.35 : 0.58;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.info.autoReset = true;
    this.gpuTimer = new ThreeGpuFrameTimer(this.renderer.getContext());
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x030609);
    this.scene.fog = new THREE.FogExp2(0x070d11, 0.019);
    this.camera = new ThreeOrthographicCamera(canvas, { reference: this.referenceId === 'tree-grove' });
    this.cameraViewDirection = new THREE.Vector3();
    this.cameraViewRight = new THREE.Vector3();
    this.cameraViewUp = new THREE.Vector3();
    this.treeFactory = new ThreeTreeMeshFactory();
    this.reference = this.referenceId === 'tree-grove' ? new ThreeReferenceGrove(this.scene, this.treeFactory, this.search) : null;
    this.liveWorld = this.reference ? null : new ThreeLiveWorld(this.scene, this.treeFactory, CONFIG.tileSize, {
      anisotropy: this.renderer.capabilities.getMaxAnisotropy(),
      search: this.search
    });
    this.screenOverlay = this.reference ? null : new ThreeScreenOverlay();
    if (this.reference) {
      const preset = this.reference.cameraPreset();
      this.camera.setReferenceTarget(preset.x, preset.y, preset.z, preset.frustumHeight);
    }
    this.diagnosticsOverlay = new ThreeDiagnosticsOverlay({
      enabled: queryFlag(this.search, 'debug3d'),
      onChange: (enabled) => this.liveWorld?.setDebugVisible(enabled)
    });
    this.onTerrainDiagnosticKeyDown = (event) => {
      if (event.code === 'F6') {
        event.preventDefault();
        this.liveWorld?.cycleTerrainDebugMode();
      } else if (event.code === 'F7') {
        event.preventDefault();
        this.liveWorld?.toggleGroundDetail();
      }
    };
    globalThis.addEventListener?.('keydown', this.onTerrainDiagnosticKeyDown);
    this.frame = 0;
    this.lastFrameMs = 0;
    this.cpuHistory = [];
    this.gpuHistory = [];
    this.performanceWarmupFrames = 30;
    this.sceneCompilePending = true;
    this.sceneWarmupCount = 0;
    this.lastSceneWarmupMs = 0;
    this.resourceStats = { geometries: 0, textures: 0, meshes: 0, materials: 0, domNodes: 0 };
    this.status = createStatus(policy);
    this.onContextLost = (event) => {
      event.preventDefault();
      this.status.backendStatus = 'context_lost';
      this.status.fallbackReason = 'webgl3d_context_lost';
    };
    canvas.addEventListener?.('webglcontextlost', this.onContextLost);
  }

  beginFrame(gameplayCamera) {
    if (this.liveWorld && gameplayCamera) this.camera.syncFromGameplay(gameplayCamera, CONFIG.tileSize);
    const size = this.camera.resize(this.renderer);
    if (gameplayCamera) {
      gameplayCamera.viewportW = size.viewportW;
      gameplayCamera.viewportH = size.viewportH;
    }
    return size;
  }

  renderProjection(projection) {
    const start = globalThis.performance?.now?.() ?? Date.now();
    const renderTime = projection?.source?.renderTime ?? this.frame / 60;
    this.reference?.update(renderTime);
    if (this.reference) this.renderer.shadowMap.needsUpdate = true;
    const worldStart = readNowMs();
    const activeCamera = this.camera.camera;
    activeCamera.getWorldDirection(this.cameraViewDirection);
    this.cameraViewRight.set(1, 0, 0).applyQuaternion(activeCamera.quaternion).normalize();
    this.cameraViewUp.set(0, 1, 0).applyQuaternion(activeCamera.quaternion).normalize();
    this.liveWorld?.update(projection, {
      cameraTarget: this.camera.target,
      cameraPosition: activeCamera.position,
      cameraDirection: this.cameraViewDirection,
      cameraRight: this.cameraViewRight,
      cameraUp: this.cameraViewUp,
      frustumHeight: this.camera.frustumHeight
    });
    const worldUpdateMs = readNowMs() - worldStart;
    if (this.liveWorld?.consumeStaticInvalidation()) {
      this.sceneCompilePending = true;
      this.renderer.shadowMap.needsUpdate = true;
    }
    if (this.liveWorld?.lights.consumeShadowInvalidation()) this.renderer.shadowMap.needsUpdate = true;
    const overlayStart = readNowMs();
    this.screenOverlay?.update(projection.screen ?? projection);
    const overlayUpdateMs = readNowMs() - overlayStart;
    this.camera.syncPose();
    let sceneWarmupMs = 0;
    if (this.sceneCompilePending) {
      const warmupStart = readNowMs();
      this.renderer.compile(this.scene, this.camera.camera);
      sceneWarmupMs = readNowMs() - warmupStart;
      this.lastSceneWarmupMs = sceneWarmupMs;
      this.sceneWarmupCount += 1;
      this.sceneCompilePending = false;
    }
    const submitStart = readNowMs();
    this.gpuTimer.measure(() => this.renderer.render(this.scene, this.camera.camera));
    const renderSubmitMs = readNowMs() - submitStart;
    this.frame += 1;
    this.lastFrameMs = (globalThis.performance?.now?.() ?? Date.now()) - start;
    if (this.frame > this.performanceWarmupFrames) pushSample(this.cpuHistory, this.lastFrameMs);
    const gpu = this.gpuTimer.diagnostics();
    if (this.frame > this.performanceWarmupFrames && gpu.frameMs > 0) pushSample(this.gpuHistory, gpu.frameMs);
    const info = this.renderer.info.render;
    if (this.frame === 1 || this.frame % 30 === 0) this.resourceStats = collectResourceStats(this.scene, this.renderer, this.screenOverlay);
    const diagnostics = {
      ...(this.reference?.diagnostics() ?? { reference: null, liveWorld: this.liveWorld?.diagnostics() }),
      camera: this.camera.diagnostics(),
      calls: info.calls,
      triangles: info.triangles,
      points: info.points,
      lines: info.lines,
      frameMs: this.lastFrameMs,
      cpuP95Ms: percentile95(this.cpuHistory),
      gpuP95Ms: percentile95(this.gpuHistory),
      gpuTiming: gpu,
      performanceWarmupFrames: this.performanceWarmupFrames,
      performanceSampleCount: this.cpuHistory.length,
      projection: projection?.diagnostics ?? null,
      phaseTiming: {
        worldUpdateMs: roundMs(worldUpdateMs),
        overlayUpdateMs: roundMs(overlayUpdateMs),
        renderSubmitMs: roundMs(renderSubmitMs),
        coldStartMs: roundMs(sceneWarmupMs)
      },
      screen: this.screenOverlay?.diagnostics?.() ?? null,
      sceneWarmup: { count: this.sceneWarmupCount, lastMs: roundMs(this.lastSceneWarmupMs), pending: this.sceneCompilePending },
      resources: this.resourceStats,
      cache: this.treeFactory.diagnostics()
    };
    this.status.webgl3dDiagnostics = diagnostics;
    this.status.totalRenderMs = Number(this.lastFrameMs.toFixed(3));
    this.diagnosticsOverlay.update(diagnostics);
  }

  present() {}

  setTerrainDebugMode(mode) { return this.liveWorld?.setTerrainDebugMode(mode) ?? null; }
  setGroundDetailEnabled(enabled) { return this.liveWorld?.setGroundDetailEnabled(enabled) ?? false; }
  setTerrainProofCanopyVisible(visible) { return this.liveWorld?.setTerrainProofCanopyVisible(visible) ?? false; }
  setTreeDiagnosticView(mode) { return this.reference?.setDiagnosticView(mode) ?? null; }
  setTreeReferenceCanopyVisible(visible) { return this.reference?.setCanopyVisible(visible) ?? false; }

  setExternalFrameTiming(timing) {
    if (!timing) return;
    if (this.status.webgl3dDiagnostics) this.status.webgl3dDiagnostics.frameTiming = timing;
    this.diagnosticsOverlay.update(this.status.webgl3dDiagnostics ?? { frameTiming: timing });
  }

  recordDiagnostics(target) {
    if (!target) return;
    Object.assign(target, this.status, {
      webgl3dActive: this.status.backendStatus === 'active',
      webgl3dReferenceScene: this.referenceId,
      webgl3dWorldTransformContract: 'black-sky-bound.world-transform-3d.v1',
      webgl3dTreeSpatialRecipeContract: 'black-sky-bound.procedural-tree-spatial-recipe.v1'
    });
  }

  dispose() {
    this.canvas.removeEventListener?.('webglcontextlost', this.onContextLost);
    globalThis.removeEventListener?.('keydown', this.onTerrainDiagnosticKeyDown);
    this.reference?.dispose();
    this.liveWorld?.dispose();
    this.screenOverlay?.dispose();
    this.treeFactory.dispose();
    this.diagnosticsOverlay.dispose();
    this.gpuTimer.dispose();
    this.renderer.dispose();
    this.status.backendStatus = 'disposed';
  }
}

function createStatus(policy) {
  return {
    preferredBackend: policy.preferredBackend ?? 'webgl3d',
    candidateBackend: 'webgl3d',
    requestedBackend: policy.requestedBackend ?? 'webgl3d',
    activeBackend: 'webgl3d',
    backendStatus: 'active',
    fallbackReason: null,
    initializationError: null,
    rendererMode: THREE_RENDERER_MODE,
    webglContext: 'three_webgl',
    activationPolicy: 'webgl3d_default_no_silent_fallback',
    migrationPolicy: 'three3d_default_legacy_webgl_alias_retired_v1',
    sceneLayerPolicy: 'three_scene_graph_consumes_renderer_neutral_projection',
    unsupportedRendererPolicy: 'explicit_error_no_fallback',
    canvas2dRuntimeAvailable: false,
    hiddenCanvasRenderLoopActive: false,
    layerOrder: ['threeWorld', 'threePhysicalLighting', 'threeCameraVisibilityFocus', 'threeDiagnostics'],
    webglLayerOrder: ['threeWorld', 'threePhysicalLighting', 'threeCameraVisibilityFocus', 'threeDiagnostics'],
    fullSceneTextureUploadActive: false,
    textureUploads: 0,
    totalRenderMs: 0,
    tileSize: CONFIG.tileSize,
    webgl3dDiagnostics: null
  };
}

function queryFlag(search, key) {
  const value = new URLSearchParams(search).get(key);
  return ['1', 'true', 'on'].includes(String(value ?? '').toLowerCase());
}

function pushSample(values, value) {
  values.push(Number(value) || 0);
  if (values.length > 240) values.shift();
}

function percentile95(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)].toFixed(3));
}

function readNowMs() { return globalThis.performance?.now?.() ?? Date.now(); }
function roundMs(value) { return Math.round((Number(value) || 0) * 1000) / 1000; }

function collectResourceStats(scene, renderer, screenOverlay) {
  let meshes = 0;
  const materials = new Set();
  scene.traverse((object) => {
    if (!object.isMesh) return;
    meshes += 1;
    const values = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of values) if (material) materials.add(material);
  });
  return {
    geometries: Number(renderer.info.memory.geometries ?? 0),
    textures: Number(renderer.info.memory.textures ?? 0),
    meshes,
    materials: materials.size,
    domNodes: Number(screenOverlay?.diagnostics?.().domNodeCount ?? 0)
  };
}
