import { createRenderBackend } from './backends/renderBackend.js';
import { updateFramePerformance } from '../debug/performance.js';
import { RENDER_BUDGETS } from '../data/renderBudgets.js';
import { buildRenderProjection } from '../projection/renderProjection.js';

export function createRenderer(canvas, config) {
  const backend = createRenderBackend(canvas, RENDER_BUDGETS.renderer);

  function render(state) {
    const nowMs = globalThis.performance?.now?.() ?? Date.now();
    state.diagnostics.performance = updateFramePerformance(state.diagnostics.performance, nowMs);
    const timing = state.game?.renderLayers?.frameTiming;
    resetFrameTiming(timing, state.diagnostics.frame);
    const renderStartMs = readNowMs();

    timeRenderPhase(timing, 'backendBeginMs', () => backend.beginFrame(state.camera));
    backend.recordDiagnostics(state.game?.renderLayers?.renderer);

    if (backend.mode === 'webgl_real_layers') {
      timeRenderPhase(timing, 'worldDetailsMs', () => backend.renderProjection(buildRenderProjection(state, config)));
      timeRenderPhase(timing, 'backendPresentMs', () => backend.present());
      backend.recordDiagnostics(state.game?.renderLayers?.renderer);
      if (timing) timing.backendPresentMs = state.game?.renderLayers?.renderer?.backendPresentMs ?? timing.backendPresentMs;
    }

    if (timing) timing.totalMs = roundMs(readNowMs() - renderStartMs);
    state.diagnostics.frame += 1;
  }

  return { render, backend };
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
