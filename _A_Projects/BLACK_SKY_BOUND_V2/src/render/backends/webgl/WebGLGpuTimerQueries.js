export const WEBGL_GPU_TIMING_MODE = 'ext_disjoint_timer_query_per_render_layer_v1';

export class WebGLGpuTimerQueries {
  constructor(gl, { enabled = runtimeGpuTimingRequested(), maxPending = 192 } = {}) {
    this.gl = gl;
    this.extension = enabled ? gl?.getExtension?.('EXT_disjoint_timer_query_webgl2') ?? null : null;
    this.supported = !!this.extension && typeof gl?.createQuery === 'function';
    this.maxPending = Math.max(16, maxPending);
    this.pending = [];
    this.latest = new Map();
    this.frame = 0;
    this.disjoint = false;
  }

  beginFrame(stats) {
    this.frame += 1;
    this.poll();
    stats.gpuTimingMode = WEBGL_GPU_TIMING_MODE;
    stats.gpuTimingSupported = this.supported;
    stats.gpuTimingDisjoint = this.disjoint;
    stats.gpuPendingSamples = this.pending.length;
    for (const layerId of stats.layerOrder ?? []) {
      const layer = stats.layers[layerId];
      const sample = this.latest.get(layerId);
      layer.gpuTimingMode = WEBGL_GPU_TIMING_MODE;
      layer.gpuTimingSupported = this.supported;
      layer.gpuTimingDisjoint = this.disjoint;
      layer.gpuRenderMs = sample?.gpuRenderMs ?? 0;
      layer.gpuSampleFrame = sample?.frame ?? -1;
      layer.gpuSampleAgeFrames = sample ? Math.max(0, this.frame - sample.frame) : -1;
    }
  }

  timeLayer(layerId, fn) {
    if (!this.supported) return fn();
    const query = this.gl.createQuery();
    if (!query) return fn();
    try {
      this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, query);
    } catch {
      this.gl.deleteQuery?.(query);
      this.supported = false;
      return fn();
    }
    try {
      return fn();
    } finally {
      this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
      this.pending.push({ layerId, query, frame: this.frame });
      this.trimPending();
    }
  }

  poll() {
    if (!this.supported) return;
    this.disjoint = !!this.gl.getParameter(this.extension.GPU_DISJOINT_EXT);
    if (this.disjoint) {
      for (const sample of this.pending) this.gl.deleteQuery?.(sample.query);
      this.pending = [];
      this.latest.clear();
      return;
    }
    const remaining = [];
    for (const sample of this.pending) {
      const available = this.gl.getQueryParameter(sample.query, this.gl.QUERY_RESULT_AVAILABLE);
      if (!available) {
        remaining.push(sample);
        continue;
      }
      const elapsedNanoseconds = Number(this.gl.getQueryParameter(sample.query, this.gl.QUERY_RESULT));
      if (Number.isFinite(elapsedNanoseconds)) {
        this.latest.set(sample.layerId, {
          gpuRenderMs: roundMs(elapsedNanoseconds / 1_000_000),
          frame: sample.frame
        });
      }
      this.gl.deleteQuery?.(sample.query);
    }
    this.pending = remaining;
  }

  trimPending() {
    while (this.pending.length > this.maxPending) {
      const stale = this.pending.shift();
      this.gl.deleteQuery?.(stale.query);
    }
  }
}

function runtimeGpuTimingRequested() {
  try {
    const value = new URLSearchParams(globalThis.location?.search ?? '').get('gpuTiming');
    return ['1', 'true', 'on'].includes(String(value ?? '').toLowerCase());
  } catch {
    return false;
  }
}

function roundMs(value) {
  return Math.round(value * 1000) / 1000;
}
