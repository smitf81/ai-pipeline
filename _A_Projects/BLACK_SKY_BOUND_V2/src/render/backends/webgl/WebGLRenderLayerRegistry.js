import {
  createWebGLRenderStats,
  recordWebGLLayerStats,
  resetWebGLFrameStats,
  timeWebGLLayer
} from './WebGLRenderStats.js';
import { WebGLGpuTimerQueries } from './WebGLGpuTimerQueries.js';

export class WebGLRenderLayerRegistry {
  constructor(layers, gl = null) {
    this.layers = layers;
    this.stats = createWebGLRenderStats(layers.map((layer) => layer.id));
    this.gpuTimer = new WebGLGpuTimerQueries(gl);
  }

  update(projection, context) {
    resetWebGLFrameStats(this.stats);
    this.gpuTimer.beginFrame(this.stats);
    for (const layer of this.layers) {
      timeWebGLLayer(this.stats, layer.id, 'updateMs', () => layer.update(projection, context));
      recordWebGLLayerStats(this.stats, layer.id, {
        status: layer.status,
        objectCount: layer.objectCount,
        ...readLayerStatsFields(layer)
      });
    }
  }

  render(context) {
    for (const layer of this.layers) {
      timeWebGLLayer(this.stats, layer.id, 'renderMs', () => this.gpuTimer.timeLayer(layer.id, () => layer.render(context)));
      recordWebGLLayerStats(this.stats, layer.id, {
        status: layer.status,
        objectCount: layer.objectCount,
        ...readLayerStatsFields(layer)
      });
    }
  }

  getStats() {
    return this.stats;
  }

  getLayerIds() {
    return this.layers.map((layer) => layer.id);
  }
}

function readLayerStatsFields(layer) {
  if (typeof layer.statsFields === 'function') return layer.statsFields();
  return layer.mode ? { mode: layer.mode } : {};
}
