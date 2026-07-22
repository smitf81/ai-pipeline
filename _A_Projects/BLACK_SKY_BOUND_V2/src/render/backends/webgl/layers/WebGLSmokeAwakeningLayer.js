import { writePixelText } from '../WebGLPixelFont.js';

const NIGHT = [0.008, 0.012, 0.02, 1];
const SMOKE = [0.018, 0.024, 0.025, 1];
const SMOKE_LIT = [0.105, 0.13, 0.135, 1];
const MOON = [0.46, 0.63, 0.82, 1];
const TORCH = [0.92, 0.42, 0.13, 1];
const IVORY = [0.82, 0.85, 0.8, 1];

export class WebGLSmokeAwakeningLayer {
  constructor() {
    this.id = 'smokeAwakening';
    this.mode = 'night_smoke_instinct_transition_v1';
    this.status = 'inactive';
    this.objectCount = 0;
    this.rects = [];
    this.radials = [];
    this.triangles = [];
    this.textRects = [];
    this.phase = 'released';
    this.glyphCount = 0;
    this.raiderShadowCount = 0;
  }

  update(projection, context) {
    this.rects.length = 0;
    this.radials.length = 0;
    this.triangles.length = 0;
    this.textRects.length = 0;
    this.glyphCount = 0;
    const scene = projection.smokeAwakening;
    this.phase = scene?.phase ?? 'released';
    this.raiderShadowCount = scene?.raiderShadows?.length ?? 0;
    if (!scene?.screenActive) {
      this.objectCount = 0;
      this.status = 'inactive';
      return;
    }

    const w = context.camera.viewportW;
    const h = context.camera.viewportH;
    const centerX = w * 0.5;
    const centerY = h * 0.49;
    this.buildNightVignette(w, h, scene);
    this.buildImpactDebris(w, h, scene);
    for (const shadow of scene.raiderShadows ?? []) this.buildRaiderShadow(w, h, shadow, scene);
    this.buildRollingSmoke(centerX, centerY, w, h, scene);
    if (scene.prompt) this.buildPrompt(scene.prompt, centerX, h * 0.71, scene);

    this.objectCount = this.rects.length + this.radials.length + this.triangles.length + this.textRects.length;
    this.status = this.objectCount > 0 ? 'active' : 'inactive';
  }

  render(context) {
    if (this.rects.length) context.scene.drawScreenRects(this.rects, context.camera);
    if (this.radials.length) context.scene.drawScreenRadialDiscs(this.radials, context.camera);
    if (this.triangles.length) context.scene.drawScreenTriangles(this.triangles, context.camera);
    if (this.textRects.length) context.scene.drawScreenRects(this.textRects, context.camera);
  }

  statsFields() {
    return {
      mode: this.mode,
      phase: this.phase,
      raiderShadowCount: this.raiderShadowCount,
      glyphCount: this.glyphCount,
      primitiveCount: this.objectCount
    };
  }

  buildNightVignette(w, h, scene) {
    const coverage = scene.smokeCoverage;
    this.rects.push(rect(0, 0, w, h, withAlpha(NIGHT, 0.08 + coverage * 0.16)));
    this.radials.push(radial(w * 0.5, h * 0.48, w * 0.68, h * 0.72, [0, 0, 0, 0.18 + coverage * 0.12], 0.99));
    if (scene.phase === 'clearing') {
      this.radials.push(radial(w * 0.5, h * 0.47, w * (0.12 + scene.pocket01 * 0.26), h * (0.1 + scene.pocket01 * 0.22), withAlpha(MOON, 0.035 + scene.clearing01 * 0.045), 0.98));
    }
  }

  buildImpactDebris(w, h, scene) {
    if (scene.phase !== 'impact' && scene.phase !== 'scatter') return;
    const progress = scene.phase === 'impact' ? scene.phaseProgress : Math.min(1, 0.7 + scene.phaseProgress * 0.3);
    const reduced = scene.settings?.reducedMotion === true;
    const burst = 1 - smoothstep(0.16, 1, progress);
    this.radials.push(radial(w * 0.82, h * 0.15, w * 0.3, h * 0.25, withAlpha(SMOKE_LIT, burst * 0.24), 0.96));
    for (let index = 0; index < 18; index += 1) {
      const seed = noise(index);
      const x = w * (0.61 + (index % 6) * 0.073) + seed * 18;
      const travel = reduced ? 8 : progress * (34 + (index % 5) * 13);
      const y = h * (0.1 + Math.floor(index / 6) * 0.06) + travel;
      const size = 2.2 + (index % 4) * 1.1;
      this.triangles.push(triangle(
        { x, y: y - size },
        { x: x - size, y: y + size },
        { x: x + size * 0.72, y: y + size * 0.48 },
        [0.34, 0.31, 0.25, 0.3 + burst * 0.38]
      ));
    }
  }

  buildRaiderShadow(w, h, shadow, scene) {
    const travel = shadow.travel;
    const x = (shadow.x + shadow.directionX * travel * 0.28) * w;
    const y = (shadow.y + shadow.directionY * travel * 0.24) * h;
    const size = Math.min(w, h) * 0.055 * shadow.scale;
    const alpha = shadow.opacity;
    this.radials.push(radial(x, y, size * 1.3, size * 1.08, [0.18, 0.23, 0.24, alpha * 0.045], 0.97));
    this.radials.push(radial(x, y - size * 0.68, size * 0.18, size * 0.2, [0.005, 0.006, 0.007, alpha], 0.84));
    this.triangles.push(triangle(
      { x: x - size * 0.28, y: y - size * 0.45 },
      { x: x + size * 0.24, y: y - size * 0.48 },
      { x: x + size * shadow.directionX * 0.18, y: y + size * 0.66 },
      [0.004, 0.005, 0.006, alpha * 0.92]
    ));
    const silhouette = [0.004, 0.005, 0.006, alpha * 0.88];
    addLine(this.triangles, x - size * 0.06, y - size * 0.28, x + shadow.directionX * size * 0.54, y - size * 0.02, size * 0.09, silhouette);
    addLine(this.triangles, x - size * 0.1, y + size * 0.3, x - size * 0.34, y + size * 0.72, size * 0.11, silhouette);
    addLine(this.triangles, x + size * 0.08, y + size * 0.3, x + size * 0.38, y + size * 0.66, size * 0.11, silhouette);
    if (!shadow.torch) return;
    const torchX = x - shadow.directionX * size * 0.52;
    const torchY = y - size * 0.25;
    this.rects.push(rect(torchX, torchY, 2, size * 0.74, [0.22, 0.16, 0.09, alpha * 0.82]));
    this.radials.push(radial(torchX, torchY, size * 0.14, size * 0.18, withAlpha(TORCH, alpha * (0.52 + scene.phaseProgress * 0.18)), 0.88));
  }

  buildRollingSmoke(centerX, centerY, w, h, scene) {
    const coverage = scene.smokeCoverage;
    if (coverage <= 0.015) return;
    const pocket = scene.pocket01;
    const centerAlpha = coverage * (1 - smoothstep(0.02, 0.5, pocket));
    if (centerAlpha > 0.015) {
      this.radials.push(radial(centerX, centerY, w * (0.46 + coverage * 0.18), h * (0.42 + coverage * 0.2), withAlpha(SMOKE, centerAlpha * 0.88), 0.94));
    }
    const minSize = Math.min(w, h);
    for (let index = 0; index < 12; index += 1) {
      const angle = index / 12 * Math.PI * 2;
      const edgeDistanceX = w * (0.34 + pocket * 0.24);
      const edgeDistanceY = h * (0.3 + pocket * 0.23);
      const drift = scene.settings?.reducedMotion ? 0 : Math.sin(scene.elapsedReal * 0.7 + index * 1.9) * 12;
      const radius = minSize * (0.22 + (index % 3) * 0.025) * (1 - pocket * 0.2);
      const colour = index % 3 === 0 ? SMOKE_LIT : SMOKE;
      this.radials.push(radial(
        centerX + Math.cos(angle) * edgeDistanceX + drift,
        centerY + Math.sin(angle) * edgeDistanceY + drift * 0.3,
        radius * 1.3,
        radius,
        withAlpha(colour, coverage * (0.5 + (index % 4) * 0.045)),
        0.95
      ));
    }
    if (scene.exhalePulse > 0) {
      this.radials.push(radial(centerX, centerY, minSize * (0.08 + pocket * 0.42), minSize * (0.06 + pocket * 0.32), withAlpha(MOON, scene.exhalePulse * 0.09), 0.99));
    }
  }

  buildPrompt(prompt, centerX, y, scene) {
    const binding = prompt.bindings?.[0] ?? 'RMB';
    const keyScale = 2;
    const keyWidth = pixelWidth(binding, keyScale) + 18;
    this.rects.push(rect(centerX - keyWidth * 0.5, y, keyWidth, 31, [0.025, 0.03, 0.03, 0.74]));
    outline(this.rects, centerX - keyWidth * 0.5, y, keyWidth, 31, withAlpha(IVORY, 0.7));
    this.writeCentered(binding, centerX, y + 8, keyScale, IVORY);
    this.writeCentered(prompt.title, centerX, y + 47, 2, IVORY);
    const stageY = y + 76;
    for (let index = 0; index < scene.requiredInputCount; index += 1) {
      this.rects.push(rect(centerX - 20 + index * 16, stageY, 9, 2, index < scene.acceptedInputCount ? withAlpha(MOON, 0.86) : [0.42, 0.46, 0.45, 0.28]));
    }
  }

  writeCentered(text, centerX, y, scale, color) {
    const result = writePixelText(this.textRects, text, centerX - pixelWidth(text, scale) * 0.5, y, { scale, color });
    this.glyphCount += result.glyphs;
  }
}

function outline(rects, x, y, w, h, color) {
  rects.push(rect(x, y, w, 1, color), rect(x, y + h - 1, w, 1, color), rect(x, y, 1, h, color), rect(x + w - 1, y, 1, h, color));
}

function noise(index) {
  return Math.sin((index + 1) * 12.9898) * 0.5 + Math.sin((index + 1) * 4.1414) * 0.25;
}

function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(0.001, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function pixelWidth(text, scale) {
  return Math.max(0, String(text ?? '').length * 6 * scale - scale);
}

function radial(x, y, radiusX, radiusY, color, softness) {
  return { x, y, radiusX, radiusY, radius: Math.max(radiusX, radiusY), softness, color };
}

function triangle(a, b, c, color) {
  return { ax: a.x, ay: a.y, bx: b.x, by: b.y, cx: c.x, cy: c.y, color };
}

function addLine(triangles, ax, ay, bx, by, width, color) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length * width * 0.5;
  const ny = dx / length * width * 0.5;
  const p1 = { x: ax + nx, y: ay + ny };
  const p2 = { x: ax - nx, y: ay - ny };
  const p3 = { x: bx - nx, y: by - ny };
  const p4 = { x: bx + nx, y: by + ny };
  triangles.push(triangle(p1, p2, p3, color), triangle(p1, p3, p4, color));
}

function withAlpha(color, alpha) {
  return [color[0], color[1], color[2], (color[3] ?? 1) * alpha];
}

function rect(x, y, w, h, color) {
  return { x, y, w, h, color };
}
