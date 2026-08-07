export const THREE_GPU_TIMING_CONTRACT = 'black-sky-bound.three-gpu-frame-timing.v1';

export class ThreeGpuFrameTimer {
  constructor(gl, enabled = queryFlag('gpuTiming')) {
    this.gl = gl;
    this.extension = enabled ? gl?.getExtension?.('EXT_disjoint_timer_query_webgl2') ?? null : null;
    this.supported = !!this.extension && typeof gl?.createQuery === 'function';
    this.pending = [];
    this.latestMs = 0;
    this.disjoint = false;
  }

  measure(render) {
    this.poll();
    if (!this.supported) return render();
    const query = this.gl.createQuery();
    try {
      this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, query);
      return render();
    } catch {
      this.supported = false;
      this.gl.deleteQuery?.(query);
      return render();
    } finally {
      if (this.supported) {
        this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
        this.pending.push(query);
      }
    }
  }

  poll() {
    if (!this.supported) return;
    this.disjoint = !!this.gl.getParameter(this.extension.GPU_DISJOINT_EXT);
    if (this.disjoint) {
      for (const query of this.pending) this.gl.deleteQuery(query);
      this.pending.length = 0;
      return;
    }
    const remaining = [];
    for (const query of this.pending) {
      if (!this.gl.getQueryParameter(query, this.gl.QUERY_RESULT_AVAILABLE)) {
        remaining.push(query);
        continue;
      }
      this.latestMs = Number((Number(this.gl.getQueryParameter(query, this.gl.QUERY_RESULT)) / 1_000_000).toFixed(3));
      this.gl.deleteQuery(query);
    }
    this.pending = remaining.slice(-8);
  }

  diagnostics() {
    return { contract: THREE_GPU_TIMING_CONTRACT, supported: this.supported, disjoint: this.disjoint, frameMs: this.latestMs, pending: this.pending.length };
  }

  dispose() { for (const query of this.pending) this.gl.deleteQuery?.(query); this.pending.length = 0; }
}

function queryFlag(key) {
  try {
    const value = new URLSearchParams(globalThis.location?.search ?? '').get(key);
    return ['1', 'true', 'on'].includes(String(value ?? '').toLowerCase());
  } catch { return false; }
}
