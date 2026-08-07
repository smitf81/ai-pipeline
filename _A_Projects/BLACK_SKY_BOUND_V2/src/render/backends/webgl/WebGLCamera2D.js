export class WebGLCamera2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.dpr = 1;
    this.viewportW = canvas.clientWidth || 1280;
    this.viewportH = canvas.clientHeight || 720;
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
  }

  resize() {
    this.dpr = Math.max(1, Math.min(2, globalThis.devicePixelRatio || 1));
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * this.dpr || 1280));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * this.dpr || 720));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.viewportW = w / this.dpr;
    this.viewportH = h / this.dpr;
    return { dpr: this.dpr, w, h, viewportW: this.viewportW, viewportH: this.viewportH };
  }

  syncFromCamera(camera) {
    this.x = camera.x;
    this.y = camera.y;
    this.zoom = camera.zoom;
    camera.viewportW = this.viewportW;
    camera.viewportH = this.viewportH;
    return this;
  }

  visibleWorldBounds(paddingPx = 0) {
    const paddingWorld = paddingPx / Math.max(0.001, this.zoom);
    const halfW = this.viewportW / (2 * Math.max(0.001, this.zoom));
    const halfH = this.viewportH / (2 * Math.max(0.001, this.zoom));
    return {
      left: this.x - halfW - paddingWorld,
      top: this.y - halfH - paddingWorld,
      right: this.x + halfW + paddingWorld,
      bottom: this.y + halfH + paddingWorld
    };
  }

  uniforms() {
    return [this.x, this.y, this.zoom, this.viewportW, this.viewportH];
  }
}
