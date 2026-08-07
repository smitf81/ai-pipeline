import { assert, equal } from './assert.mjs';
import { createWebGLRenderStats, buildWebGLStatsSummary } from '../src/render/backends/webgl/WebGLRenderStats.js';
import { WebGLGpuTimerQueries, WEBGL_GPU_TIMING_MODE } from '../src/render/backends/webgl/WebGLGpuTimerQueries.js';

const gl = fakeGl();
const stats = createWebGLRenderStats(['lighting']);
const timer = new WebGLGpuTimerQueries(gl, { enabled: true });
timer.beginFrame(stats);
equal(stats.layers.lighting.gpuTimingSupported, true, 'opt-in performance diagnostics should report GPU timer support');
timer.timeLayer('lighting', () => { gl.drawCalls += 1; });
equal(gl.drawCalls, 1, 'GPU timing must execute the real render callback');
gl.available = true;
timer.beginFrame(stats);
const summary = buildWebGLStatsSummary(stats);
equal(summary.layers.lighting.gpuTimingMode, WEBGL_GPU_TIMING_MODE, 'layer summary should expose the GPU timing contract');
equal(summary.layers.lighting.gpuRenderMs, 2.5, 'timer query nanoseconds should be reported as milliseconds');
assert(summary.layers.lighting.gpuSampleAgeFrames >= 1, 'GPU timing should expose asynchronous sample age');
equal(gl.deletedQueries, 1, 'completed GPU queries should be released');
gl.disjoint = true;
timer.beginFrame(stats);
equal(stats.layers.lighting.gpuRenderMs, 0, 'disjoint GPU state should invalidate previously completed timing samples');

function fakeGl() {
  const extension = { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 };
  return {
    QUERY_RESULT_AVAILABLE: 3,
    QUERY_RESULT: 4,
    available: false,
    drawCalls: 0,
    deletedQueries: 0,
    disjoint: false,
    getExtension(name) { return name === 'EXT_disjoint_timer_query_webgl2' ? extension : null; },
    createQuery() { return {}; },
    beginQuery() {},
    endQuery() {},
    getParameter() { return this.disjoint; },
    getQueryParameter(_query, key) { return key === this.QUERY_RESULT_AVAILABLE ? this.available : 2_500_000; },
    deleteQuery() { this.deletedQueries += 1; }
  };
}
