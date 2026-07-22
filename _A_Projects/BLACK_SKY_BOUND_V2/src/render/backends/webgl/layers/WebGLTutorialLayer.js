import { writePixelText } from '../WebGLPixelFont.js';

const IVORY = [0.88, 0.86, 0.76, 0.96];
const ASH = [0.58, 0.61, 0.6, 0.9];
const EMBER = [0.92, 0.58, 0.28, 0.98];
const DIM = [0.14, 0.15, 0.15, 0.78];

export class WebGLTutorialLayer {
  constructor() {
    this.id = 'tutorial';
    this.mode = 'atmospheric_tutorial_and_pause_overlay_v1';
    this.status = 'inactive';
    this.objectCount = 0;
    this.rects = [];
    this.radials = [];
    this.glyphCount = 0;
    this.activeCueId = null;
    this.pauseVisible = false;
  }

  update(projection, context) {
    this.rects.length = 0;
    this.radials.length = 0;
    this.glyphCount = 0;
    const tutorial = projection.tutorial ?? {};
    this.pauseVisible = tutorial.paused === true && !!tutorial.pauseMenu;
    this.activeCueId = tutorial.activeCue?.id ?? null;
    if (this.pauseVisible) this.buildPauseMenu(tutorial.pauseMenu, context);
    else if (tutorial.activeCue) this.buildCue(tutorial.activeCue, tutorial.settings ?? {}, projection.actors ?? [], context);
    this.objectCount = this.rects.length + this.radials.length;
    this.status = this.objectCount > 0 ? 'active' : 'inactive';
  }

  render(context) {
    if (this.radials.length) context.scene.drawScreenRadialDiscs(this.radials, context.camera);
    if (this.rects.length) context.scene.drawScreenRects(this.rects, context.camera);
  }

  statsFields() {
    return {
      mode: this.mode,
      activeCueId: this.activeCueId,
      pauseVisible: this.pauseVisible,
      glyphCount: this.glyphCount,
      rectCount: this.rects.length,
      radialCount: this.radials.length
    };
  }

  buildCue(cue, settings, actors, context) {
    const opacity = cueOpacity(cue);
    if (opacity <= 0.001) return;
    const viewport = context.camera;
    const anchor = resolveSafeAnchor(cue, actors, viewport);
    const reducedMotion = settings.reducedMotion === true;
    const driftY = reducedMotion ? 0 : (1 - opacity) * 10;
    const y = anchor.y + driftY;
    this.radials.push({
      x: anchor.x,
      y: y + 34,
      radiusX: cue.presentationType === 'combo_only' ? 210 : 178,
      radiusY: cue.presentationType === 'combo_only' ? 96 : 88,
      radius: 178,
      softness: 0.94,
      color: [0.015, 0.02, 0.022, 0.46 * opacity]
    });
    this.addAshStreaks(anchor.x, y, cue.elapsedReal, opacity, reducedMotion);
    if (cue.presentationType === 'movement_keys') this.buildMovementCue(cue, anchor.x, y, opacity);
    else if (cue.presentationType === 'combo_only') this.buildCombatCue(cue, anchor.x, y, opacity);
    else if (cue.presentationType === 'dodge_charge_sequence') this.buildChargeCue(cue, anchor.x, y, opacity);
    else if (cue.presentationType === 'message') this.buildMessageCue(cue, anchor.x, y, opacity);
    else this.buildSingleCue(cue, anchor.x, y, opacity);
  }

  buildMovementCue(cue, centerX, y, opacity) {
    const labels = cue.inputRows[0]?.bindings ?? ['W', 'A', 'S', 'D'];
    const widths = labels.map((label) => keyWidth(label, 2));
    const total = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, labels.length - 1) * 9;
    let x = centerX - total * 0.5;
    labels.forEach((label, index) => {
      this.drawKey(label, x, y, cue.progress.pressedLabels.includes(label), opacity, 2);
      x += widths[index] + 9;
    });
    this.writeCentered(cue.title, centerX, y + 43, 2, withAlpha(IVORY, opacity));
  }

  buildCombatCue(cue, centerX, y, opacity) {
    const attackKey = cue.inputRows.find((row) => row.actionId === 'melee')?.bindings?.[0] ?? 'LMB';
    const keyW = keyWidth(attackKey, 2);
    const total = keyW * 3 + 26;
    let x = centerX - total * 0.5;
    for (let index = 0; index < 3; index += 1) {
      const accepted = cue.progress.comboAccepted > index;
      const pressed = cue.progress.pressedLabels.includes(attackKey) && index === Math.min(2, cue.progress.comboAccepted);
      this.drawKey(attackKey, x, y, accepted || pressed, opacity, 2, accepted);
      x += keyW;
      if (index < 2) {
        this.rects.push(rect(x + 5, y + 13, 5, 1, withAlpha(ASH, opacity * 0.72)));
        x += 13;
      }
    }
    const comboText = cue.comboLabels.length ? cue.comboLabels.join(' · ') : cue.title;
    this.writeCentered(comboText, centerX, y + 39, comboText.length > 25 ? 1 : 2, withAlpha(IVORY, opacity));
  }

  buildSingleCue(cue, centerX, y, opacity) {
    const label = cue.inputRows[0]?.bindings?.[0] ?? 'SPACE';
    const width = keyWidth(label, 2);
    this.drawKey(label, centerX - width * 0.5, y, cue.progress.pressedLabels.includes(label) || cue.progress.dodgeAccepted, opacity, 2, cue.progress.dodgeAccepted);
    this.writeCentered(cue.title, centerX, y + 43, 2, withAlpha(IVORY, opacity));
    if (cue.supportingText) this.writeCentered(cue.supportingText, centerX, y + 65, 1, withAlpha(ASH, opacity));
  }

  buildChargeCue(cue, centerX, y, opacity) {
    const label = cue.inputRows[0]?.bindings?.[0] ?? 'SPACE';
    const width = keyWidth(label, 2);
    const gap = 38;
    const total = width * 2 + gap;
    const firstX = centerX - total * 0.5;
    const secondX = firstX + width + gap;
    this.drawKey(label, firstX, y, cue.progress.dodgeAccepted || cue.progress.pressedLabels.includes(label), opacity, 2, cue.progress.dodgeAccepted);
    this.write('>', firstX + width + 13, y + 9, 2, withAlpha(cue.progress.dodgeAccepted ? EMBER : ASH, opacity));
    this.drawKey(label, secondX, y, cue.progress.chargeAccepted || (cue.progress.dodgeAccepted && cue.progress.pressedLabels.includes(label)), opacity, 2, cue.progress.chargeAccepted);
    this.writeCentered(cue.title, centerX, y + 43, 2, withAlpha(IVORY, opacity));
    if (cue.supportingText) this.writeCentered(cue.supportingText, centerX, y + 65, 1, withAlpha(ASH, opacity));
  }

  buildMessageCue(cue, centerX, y, opacity) {
    this.writeCentered(cue.title, centerX, y + 10, 2, withAlpha(EMBER, opacity));
    if (cue.supportingText) this.writeCentered(cue.supportingText, centerX, y + 38, 1, withAlpha(IVORY, opacity));
  }

  drawKey(label, x, y, pressed, opacity, scale = 2, completed = false) {
    const width = keyWidth(label, scale);
    const height = 31;
    const depression = pressed ? 2 : 0;
    const py = y + depression;
    const edge = completed ? EMBER : pressed ? [0.95, 0.7, 0.38, 1] : IVORY;
    this.rects.push(rect(x + 1, py + 1, width - 2, height - 2, withAlpha(pressed ? [0.22, 0.17, 0.1, 0.72] : DIM, opacity)));
    this.rects.push(
      rect(x, py, width, 1, withAlpha(edge, opacity * 0.88)),
      rect(x, py + height - 1, width, 1, withAlpha(edge, opacity * 0.58)),
      rect(x, py, 1, height, withAlpha(edge, opacity * 0.72)),
      rect(x + width - 1, py, 1, height, withAlpha(edge, opacity * 0.72))
    );
    this.writeCenteredAt(label, x, width, py + 8, scale, withAlpha(completed || pressed ? EMBER : IVORY, opacity));
    return width;
  }

  buildPauseMenu(menu, context) {
    const w = context.camera.viewportW;
    const h = context.camera.viewportH;
    const compact = w < 820 || h < 620;
    this.rects.push(rect(0, 0, w, h, [0.012, 0.016, 0.019, 0.86]));
    this.radials.push({ x: w * 0.18, y: h * 0.12, radiusX: Math.max(220, w * 0.36), radiusY: Math.max(160, h * 0.42), radius: 260, softness: 0.95, color: [0.16, 0.12, 0.07, 0.18] });
    this.rects.push(rect(42, 38, Math.min(520, w - 84), 1, [0.91, 0.58, 0.28, 0.42]));
    this.write(menu.title, 48, 52, compact ? 2 : 3, IVORY);
    this.write('PAUSED', w - (compact ? 104 : 140), 54, 2, ASH);

    const rowGap = compact ? 35 : 43;
    const startY = compact ? 94 : 116;
    const keyX = 50;
    const labelX = compact ? 148 : 176;
    menu.controls.forEach((control, index) => {
      const rowY = startY + index * rowGap;
      const scale = compact ? 1 : 2;
      this.drawKey(control.bindings, keyX, rowY, false, 0.92, scale);
      this.write(control.label, labelX, rowY + 3, scale, IVORY);
      if (control.detail) this.write(control.detail, labelX, rowY + (compact ? 17 : 22), 1, ASH, Math.max(180, w * 0.42));
    });

    const settingsX = compact ? 48 : Math.max(620, w * 0.62);
    let settingsY = compact ? startY + menu.controls.length * rowGap + 12 : 118;
    let section = null;
    menu.settings.forEach((setting, index) => {
      if (setting.section !== section) {
        section = setting.section;
        this.write(section, settingsX, settingsY, 2, ASH);
        settingsY += compact ? 24 : 29;
      }
      const rowY = settingsY;
      const selected = menu.selectedSettingIndex === index;
      const availableWidth = Math.max(210, w - settingsX - 50);
      if (selected) {
        this.rects.push(rect(settingsX - 14, rowY - 5, 2, setting.kind === 'level' ? 29 : 20, EMBER));
        this.rects.push(rect(settingsX - 8, rowY - 6, availableWidth, setting.kind === 'level' ? 30 : 21, [0.19, 0.15, 0.1, 0.18]));
      }
      this.write(setting.label, settingsX, rowY, 1, selected ? IVORY : ASH);
      const valueX = settingsX + availableWidth - pixelWidth(setting.value, 1) - 8;
      this.write(setting.value, valueX, rowY, 1, selected ? EMBER : IVORY);
      if (setting.kind === 'level') {
        const railWidth = Math.min(216, availableWidth - 8);
        this.rects.push(rect(settingsX, rowY + 16, railWidth, 3, [0.34, 0.35, 0.33, 0.48]));
        this.rects.push(rect(settingsX, rowY + 16, railWidth * setting.level, 3, selected ? EMBER : [0.66, 0.51, 0.3, 0.72]));
        for (let step = 0; step <= 10; step += 1) {
          this.rects.push(rect(settingsX + railWidth * step / 10, rowY + 14, 1, 7, [0.66, 0.62, 0.52, step / 10 <= setting.level ? 0.42 : 0.18]));
        }
      }
      settingsY += setting.kind === 'level' ? (compact ? 31 : 35) : (compact ? 24 : 29);
    });
    this.write(menu.footer, 48, h - 42, compact ? 1 : 2, ASH, w - 96);
  }

  addAshStreaks(centerX, y, elapsed, opacity, reducedMotion) {
    for (let index = 0; index < 4; index += 1) {
      const phase = reducedMotion ? index * 0.21 : (elapsed * (0.12 + index * 0.018) + index * 0.23) % 1;
      const x = centerX - 138 + phase * 276;
      const py = y - 16 + index * 18 + Math.sin(elapsed * 1.7 + index) * (reducedMotion ? 0 : 3);
      this.rects.push(rect(x, py, 8 + index * 2, 1, [0.72, 0.5, 0.3, opacity * (0.09 + index * 0.025)]));
    }
  }

  write(text, x, y, scale, color, maxWidth = Number.POSITIVE_INFINITY) {
    const result = writePixelText(this.rects, text, x, y, { scale, color, maxWidth });
    this.glyphCount += result.glyphs;
    return result;
  }

  writeCentered(text, centerX, y, scale, color) {
    return this.write(text, centerX - pixelWidth(text, scale) * 0.5, y, scale, color);
  }

  writeCenteredAt(text, x, width, y, scale, color) {
    return this.write(text, x + (width - pixelWidth(text, scale)) * 0.5, y, scale, color);
  }
}

function resolveSafeAnchor(cue, actors, camera) {
  const w = camera.viewportW;
  const h = camera.viewportH;
  let x = w * 0.5;
  const y = Math.max(210, Math.min(h - 150, h * 0.68));
  const dangerIds = new Set([cue.context?.attackerId, actors.find((actor) => actor.team === 'player')?.id].filter(Boolean));
  for (const actor of actors) {
    if (!dangerIds.has(actor.id)) continue;
    const sx = (actor.worldX - camera.x) * camera.zoom + w * 0.5;
    const sy = (actor.worldY - camera.y) * camera.zoom + h * 0.5;
    if (Math.abs(sx - x) < 185 && Math.abs(sy - y) < 115) x += sx <= x ? w * 0.23 : -w * 0.23;
  }
  return { x: Math.max(190, Math.min(w - 190, x)), y };
}

function cueOpacity(cue) {
  if (cue.phase === 'exiting') return smooth01(1 - cue.exitElapsed / 0.22);
  return smooth01(cue.elapsedReal / 0.18);
}

function smooth01(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function keyWidth(label, scale) {
  return Math.max(31, pixelWidth(label, scale) + 14);
}

function pixelWidth(text, scale) {
  return Math.max(0, String(text ?? '').length * 6 * scale - scale);
}

function withAlpha(color, alpha) {
  return [color[0], color[1], color[2], (color[3] ?? 1) * alpha];
}

function rect(x, y, w, h, color) {
  return { x, y, w, h, color };
}
