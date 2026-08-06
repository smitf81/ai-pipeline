import { writePixelText } from '../WebGLPixelFont.js';

const HUD_MODE = 'projection_debug_text_v0';

export class WebGLHudDebugLayer {
  constructor() {
    this.id = 'hudDebug';
    this.mode = HUD_MODE;
    this.status = 'inactive';
    this.objectCount = 0;
    this.rects = [];
    this.lineCount = 0;
    this.glyphCount = 0;
    this.debugVisible = false;
  }

  update(projection, context) {
    this.debugVisible = isDebugHudVisible(projection.bodyState?.debug?.hudQueryParam ?? 'debugHud');
    this.rects.length = 0;
    this.lineCount = 0;
    this.glyphCount = 0;
    this.objectCount = 0;
    this.status = 'inactive';
    if (!this.debugVisible) return;
    const hud = projection.hud ?? {};
    const debug = projection.debug ?? {};
    const status = context.status ?? {};
    const playerMaxHp = Math.max(1, hud.playerMaxHp ?? 1);
    const hpRatio = Math.max(0, Math.min(1, (hud.playerHp ?? 0) / playerMaxHp));
    const playerMaxStamina = Math.max(1, hud.playerMaxStamina ?? 1);
    const staminaRatio = Math.max(0, Math.min(1, (hud.playerStamina ?? 0) / playerMaxStamina));
    const w = Math.min(560, Math.max(320, context.camera.viewportW - 28));
    const panelH = 140;
    this.rects.push(
      rect(12, 12, w, panelH, [0.012, 0.016, 0.024, 0.84]),
      rect(13, 13, w - 2, 1, [0.95, 0.72, 0.42, 0.26]),
      rect(22, 48, 132, 8, [0.08, 0.11, 0.12, 0.95]),
      rect(22, 48, 132 * hpRatio, 8, healthColor(hpRatio)),
      rect(22, 61, 132, 5, [0.07, 0.09, 0.1, 0.94]),
      rect(22, 61, 132 * staminaRatio, 5, staminaColor(staminaRatio, hud.staminaState)),
      rect(context.camera.viewportW - 164, 12, 150, 34, [0.012, 0.016, 0.024, 0.82])
    );

    const lines = buildHudLines(hud, debug, status);
    this.lineCount = lines.length;
    this.glyphCount = 0;
    lines.forEach((line, index) => {
      const written = writePixelText(this.rects, line.text, line.x, line.y, {
        scale: line.scale ?? 2,
        color: line.color,
        maxWidth: line.maxWidth ?? w - 28
      });
      this.glyphCount += written.glyphs;
    });

    const fpsLine = status.rendererMode === 'real_layers' ? 'WEBGL OK' : 'WEBGL';
    this.glyphCount += writePixelText(this.rects, fpsLine, context.camera.viewportW - 152, 25, {
      scale: 2,
      color: [0.78, 0.96, 0.82, 0.95],
      maxWidth: 132
    }).glyphs;

    this.objectCount = this.rects.length;
    this.status = this.objectCount > 0 ? 'active' : 'inactive';
  }

  render(context) {
    if (!this.rects.length) return;
    context.scene.drawScreenRects(this.rects, context.camera);
  }

  statsFields() {
    return {
      mode: this.mode,
      hudMode: HUD_MODE,
      debugVisible: this.debugVisible,
      lineCount: this.lineCount,
      glyphCount: this.glyphCount,
      rectCount: this.rects.length
    };
  }
}

function isDebugHudVisible(queryParam) {
  const params = new URLSearchParams(globalThis.location?.search ?? '');
  const value = params.get(queryParam);
  return ['1', 'true', 'on'].includes(String(value ?? '').toLowerCase());
}

function buildHudLines(hud, debug, status) {
  const hp = `${Math.ceil(hud.playerHp ?? 0)}/${Math.ceil(hud.playerMaxHp ?? 0)}`;
  const stamina = `${Math.ceil(hud.playerStamina ?? 0)}/${Math.ceil(hud.playerMaxStamina ?? 0)}`;
  const cooldowns = hud.cooldowns ?? {};
  const illuminationMs = formatMs(status.webglIlluminationRenderMs ?? 0);
  const flicker = status.webglFlickeringLightCount ?? 0;
  const lightSpace = status.webglLightSpaceCullingActive ? `LSP ${status.webglLightSpaceCulledCount ?? 0}` : 'LSP OFF';
  const occlusion = `${status.webglOcclusionShadowMode?.includes('scaffolded') ? 'OCC S' : 'OCC'}${status.webglOcclusionShadowRegions ?? 0}`;
  return [
    { text: 'BLACK SKY BOUND V2', x: 22, y: 25, color: [0.95, 0.91, 0.8, 1] },
    { text: `HP ${hp} ST ${stamina} EN ${hud.enemyCount ?? 0} ${compact(hud.status)}`, x: 164, y: 45, color: [0.82, 0.86, 0.82, 0.95] },
    { text: compact(hud.objective || hud.message || 'SURVIVE'), x: 22, y: 78, color: [0.7, 0.77, 0.8, 0.92], maxWidth: 520 },
    { text: `D ${ready(hud.dodgeCooldown)} B ${ready(cooldowns.bite)} L ${ready(cooldowns.lunge)} S ${ready(cooldowns.smoke)}`, x: 22, y: 101, color: [0.86, 0.72, 0.5, 0.95] },
    { text: `LT ${debug.lightCount ?? 0} FLK ${flicker} ${lightSpace} ${occlusion} ${illuminationMs}`, x: 22, y: 124, color: [0.57, 0.68, 0.74, 0.9] }
  ];
}

function rect(x, y, w, h, color) {
  return { x, y, w, h, color };
}

function ready(value) {
  return (value ?? 0) <= 0 ? 'RDY' : `${Math.max(0, value).toFixed(1)}S`;
}

function formatMs(value) {
  return `${Math.max(0, value).toFixed(1)}MS`;
}

function compact(value) {
  return String(value ?? '')
    .replace(/[^a-zA-Z0-9 /.+:%-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function healthColor(ratio) {
  if (ratio < 0.34) return [0.96, 0.32, 0.22, 0.95];
  if (ratio < 0.66) return [0.95, 0.65, 0.26, 0.95];
  return [0.4, 0.86, 0.52, 0.95];
}

function staminaColor(ratio, state) {
  if (state === 'exhausted' || ratio < 0.2) return [0.66, 0.34, 0.2, 0.92];
  if (state === 'sprinting' || state === 'dodging') return [0.95, 0.67, 0.32, 0.96];
  return [0.66, 0.56, 0.34, 0.92];
}
