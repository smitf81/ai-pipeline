import { createRenderBackend } from './backends/renderBackend.js';
import { updateFramePerformance } from '../debug/performance.js';
import { RENDER_BUDGETS } from '../data/renderBudgets.js';
import { createRenderProjection3DCompiler } from '../projection/renderProjection3D.js';
import { createRenderFrameTiming } from '../debug/renderFrameTiming.js';

export function createRenderer(canvas, config) {
  const backend = createRenderBackend(canvas, RENDER_BUDGETS.renderer);
  const projectionCompiler = createRenderProjection3DCompiler(config);
  const frameTiming = createRenderFrameTiming();

  function render(state) {
    const nowMs = globalThis.performance?.now?.() ?? Date.now();
    state.diagnostics.performance = updateFramePerformance(state.diagnostics.performance, nowMs);
    const timing = state.game?.renderLayers?.frameTiming;
    resetFrameTiming(timing, state.diagnostics.frame);
    const renderStartMs = readNowMs();

    timeRenderPhase(timing, 'backendBeginMs', () => backend.beginFrame(state.camera));
    backend.recordDiagnostics(state.game?.renderLayers?.renderer);

    if (backend.mode === 'three3d_real_scene') {
      const projectionStart = readNowMs();
      const projection = backend.projectionRequired === false
        ? { source: { renderTime: state.game?.renderTime ?? state.time ?? 0 } }
        : projectionCompiler.compile(state);
      frameTiming.record('projectionMs', readNowMs() - projectionStart);
      frameTiming.record('projectionStaticMs', projection.diagnostics?.staticProjectionMs ?? 0);
      frameTiming.record('projectionDynamicMs', projection.diagnostics?.dynamicProjectionMs ?? 0);
      timeRenderPhase(timing, 'worldDetailsMs', () => backend.renderProjection(projection));
      timeRenderPhase(timing, 'backendPresentMs', () => backend.present());
      backend.recordDiagnostics(state.game?.renderLayers?.renderer);
      if (timing) timing.backendPresentMs = state.game?.renderLayers?.renderer?.backendPresentMs ?? timing.backendPresentMs;
      const phases = backend.status?.webgl3dDiagnostics?.phaseTiming ?? {};
      frameTiming.record('worldUpdateMs', phases.worldUpdateMs ?? 0);
      frameTiming.record('overlayUpdateMs', phases.overlayUpdateMs ?? 0);
      frameTiming.record('renderSubmitMs', phases.renderSubmitMs ?? 0);
      frameTiming.record('gpuMs', backend.status?.webgl3dDiagnostics?.gpuTiming?.frameMs ?? 0);
      frameTiming.record('coldStartMs', phases.coldStartMs ?? 0);
    }

    const renderPathMs = readNowMs() - renderStartMs;
    frameTiming.record('renderPathMs', renderPathMs);
    if (timing) timing.totalMs = roundMs(renderPathMs);
    state.diagnostics.frame += 1;
  }

  function recordLoopTiming(sample) {
    frameTiming.record('simulationMs', sample.simulationMs);
    frameTiming.record('frameIntervalMs', sample.frameIntervalMs);
    backend.setExternalFrameTiming?.(frameTiming.diagnostics());
  }

  return {
    render,
    backend,
    recordLoopTiming,
    dispose() {
      projectionCompiler.dispose();
      backend.dispose?.();
    }
  };
}

function resetFrameTiming(timing, frame) {
  if (!timing) return;
  timing.frame = frame;
  timing.totalMs = 0;
  timing.backendBeginMs = 0;
  timing.lightSpaceMs = 0;
  timing.terrainMs = 0;
  timing.worldDetailsMs = 0;
  timing.lightingMs = 0;
  timing.smokeMs = 0;
  timing.postProcessMs = 0;
  timing.hudMs = 0;
  timing.backendPresentMs = 0;
}

function timeRenderPhase(timing, key, fn) {
  if (!timing) return fn();
  const start = readNowMs();
  const result = fn();
  timing[key] = roundMs((timing[key] ?? 0) + readNowMs() - start);
  return result;
}

function readNowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function roundMs(value) {
  return Math.round(value * 1000) / 1000;
}
