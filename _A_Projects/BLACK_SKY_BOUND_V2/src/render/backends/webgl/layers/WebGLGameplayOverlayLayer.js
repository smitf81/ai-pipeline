export class WebGLGameplayOverlayLayer {
  constructor() {
    this.id = 'gameplayOverlay';
    this.status = 'inactive';
    this.objectCount = 0;
    this.mode = 'player_lifecycle_screen_overlay_v0';
    this.playerLifecycle = null;
    this.lifecycleOverlay = null;
    this.primitiveCount = 0;
    this.rects = [{ x: 0, y: 0, w: 1, h: 1, color: [0, 0, 0, 0] }];
  }

  update(projection) {
    this.playerLifecycle = projection.playerLifecycle ?? null;
    this.lifecycleOverlay = this.playerLifecycle?.overlay ?? null;
    this.objectCount = (this.lifecycleOverlay?.opacity ?? 0) > 0.001 ? 1 : 0;
    this.primitiveCount = 0;
    this.status = this.objectCount > 0 ? 'active' : 'inactive';
  }

  render(context) {
    if ((this.lifecycleOverlay?.opacity ?? 0) <= 0.001) {
      this.primitiveCount = 0;
      this.status = 'inactive';
      return;
    }
    const rect = this.rects[0];
    rect.x = 0;
    rect.y = 0;
    rect.w = context.camera.viewportW;
    rect.h = context.camera.viewportH;
    writeLifecycleOverlayColor(rect.color, this.lifecycleOverlay);
    this.primitiveCount = context.scene.drawScreenRects(this.rects, context.camera);
    this.status = this.primitiveCount > 0 ? 'active' : 'inactive';
  }

  statsFields() {
    return {
      mode: this.mode,
      lifecycleState: this.playerLifecycle?.state ?? 'alive',
      lifecycleOverlayOpacity: this.lifecycleOverlay?.opacity ?? 0,
      lifecycleOverlayPolicy: this.lifecycleOverlay?.opacityPolicy ?? null,
      rectCount: this.objectCount,
      primitiveCount: this.primitiveCount
    };
  }
}

function writeLifecycleOverlayColor(target, overlay) {
  const colour = Array.isArray(overlay.colour) ? overlay.colour : [0, 0, 0, 1];
  target[0] = clamp01(colour[0]);
  target[1] = clamp01(colour[1]);
  target[2] = clamp01(colour[2]);
  target[3] = clamp01(overlay.opacity);
}

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}
