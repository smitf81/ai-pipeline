import { writePixelText } from '../WebGLPixelFont.js';

export class WebGLGameplayOverlayLayer {
  constructor() {
    this.id = 'gameplayOverlay';
    this.status = 'inactive';
    this.objectCount = 0;
    this.mode = 'player_lifecycle_screen_overlay_v0';
    this.playerLifecycle = null;
    this.lifecycleOverlay = null;
    this.arena = null;
    this.primitiveCount = 0;
    this.rects = [{ x: 0, y: 0, w: 1, h: 1, color: [0, 0, 0, 0] }];
    this.arenaRects = [];
  }

  update(projection) {
    this.playerLifecycle = projection.playerLifecycle ?? null;
    this.lifecycleOverlay = this.playerLifecycle?.overlay ?? null;
    this.arena = projection.hud?.arena ?? null;
    this.objectCount = ((this.lifecycleOverlay?.opacity ?? 0) > 0.001 ? 1 : 0) + (this.arena ? 1 : 0);
    this.primitiveCount = 0;
    this.status = this.objectCount > 0 ? 'active' : 'inactive';
  }

  render(context) {
    this.primitiveCount = 0;
    if ((this.lifecycleOverlay?.opacity ?? 0) > 0.001) {
      const rect = this.rects[0];
      rect.x = 0;
      rect.y = 0;
      rect.w = context.camera.viewportW;
      rect.h = context.camera.viewportH;
      writeLifecycleOverlayColor(rect.color, this.lifecycleOverlay);
      this.primitiveCount += context.scene.drawScreenRects(this.rects, context.camera);
    }
    if (this.arena) this.primitiveCount += this.renderArena(context);
    this.status = this.primitiveCount > 0 ? 'active' : 'inactive';
  }

  renderArena(context) {
    const arena = this.arena;
    const viewportW = context.camera.viewportW;
    const panelW = Math.min(420, Math.max(300, viewportW - 28));
    const x = 14;
    this.arenaRects.length = 0;
    this.arenaRects.push(
      screenRect(x, 14, panelW, 57, [0.018, 0.022, 0.024, 0.82]),
      screenRect(x + 1, 15, panelW - 2, 1, [0.96, 0.48, 0.22, 0.72])
    );
    const wave = Math.max(0, arena.waveNumber ?? 0);
    const header = arena.phase === 'active'
      ? `WAVE ${wave}/${arena.totalWaves} - ${arena.waveLabel}`
      : arena.phase === 'complete' ? 'THE CROWN HOLDS' : `WAVE ${Math.min(wave + 1, arena.totalWaves)}/${arena.totalWaves} APPROACHES`;
    writePixelText(this.arenaRects, clean(header), x + 12, 25, { scale: 2, color: [0.98, 0.88, 0.68, 1], maxWidth: panelW - 24 });
    const detail = arena.phase === 'active'
      ? `THREATS ${arena.remainingThreats}  INSTINCTS ${arena.unlockedAbilityIds.length}`
      : arena.phase === 'complete' ? 'DEMO COMPLETE' : `RECOVER  ${Math.ceil(arena.timeRemaining)} SECONDS`;
    writePixelText(this.arenaRects, detail, x + 12, 50, { scale: 1, color: [0.78, 0.84, 0.82, 0.94], maxWidth: panelW - 24 });
    if ((arena.bannerSeconds ?? 0) > 0) {
      const banner = clean(arena.banner);
      const bannerW = Math.min(viewportW - 30, Math.max(360, pixelWidth(banner, 3) + 42));
      const bannerX = (viewportW - bannerW) * 0.5;
      this.arenaRects.push(screenRect(bannerX, 94, bannerW, 74, [0.012, 0.016, 0.018, 0.87]));
      writePixelText(this.arenaRects, banner, bannerX + Math.max(18, (bannerW - pixelWidth(banner, 3)) * 0.5), 110, {
        scale: 3,
        color: [1, 0.72, 0.38, 1],
        maxWidth: bannerW - 36
      });
      const bannerDetail = clean(arena.bannerDetail);
      writePixelText(this.arenaRects, bannerDetail, bannerX + Math.max(18, (bannerW - pixelWidth(bannerDetail, 1)) * 0.5), 148, {
        scale: 1,
        color: [0.82, 0.86, 0.8, 0.96],
        maxWidth: bannerW - 36
      });
    }
    context.scene.drawScreenRects(this.arenaRects, context.camera);
    return this.arenaRects.length;
  }

  statsFields() {
    return {
      mode: this.mode,
      lifecycleState: this.playerLifecycle?.state ?? 'alive',
      lifecycleOverlayOpacity: this.lifecycleOverlay?.opacity ?? 0,
      lifecycleOverlayPolicy: this.lifecycleOverlay?.opacityPolicy ?? null,
      arenaPhase: this.arena?.phase ?? null,
      arenaWaveNumber: this.arena?.waveNumber ?? null,
      rectCount: this.objectCount,
      primitiveCount: this.primitiveCount
    };
  }
}

function screenRect(x, y, w, h, color) {
  return { x, y, w, h, color };
}

function pixelWidth(text, scale) {
  return Math.max(0, String(text ?? '').length * 6 * scale - scale);
}

function clean(value) {
  return String(value ?? '').replaceAll('·', '-');
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
