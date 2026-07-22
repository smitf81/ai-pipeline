import { writePixelText } from '../WebGLPixelFont.js';

const DARK = [0.006, 0.009, 0.014, 1];
const SHELL_COLORS = [
  [0.48, 0.45, 0.37, 0.98],
  [0.36, 0.34, 0.29, 0.98],
  [0.62, 0.58, 0.47, 0.98]
];
const SHELL_EDGE = [0.78, 0.75, 0.63, 0.92];
const MOON = [0.55, 0.76, 0.98, 0.88];
const CRACK_CORE = [0.82, 0.92, 1, 0.98];
const PROMPT = [0.82, 0.86, 0.84, 0.92];

export class WebGLOpeningLayer {
  constructor() {
    this.id = 'opening';
    this.mode = 'embodied_hatch_screen_projection_v2';
    this.status = 'inactive';
    this.objectCount = 0;
    this.backgroundRects = [];
    this.radials = [];
    this.triangles = [];
    this.textRects = [];
    this.phase = 'released';
    this.crackStage = 0;
    this.fragmentCount = 0;
    this.rayCount = 0;
    this.glyphCount = 0;
  }

  update(projection, context) {
    this.backgroundRects.length = 0;
    this.radials.length = 0;
    this.triangles.length = 0;
    this.textRects.length = 0;
    this.glyphCount = 0;
    const opening = projection.opening;
    this.phase = opening?.phase ?? 'released';
    this.crackStage = opening?.crackStage ?? 0;
    this.fragmentCount = opening?.shellFragments?.length ?? 0;
    this.rayCount = opening?.lightRays?.length ?? 0;
    if (!opening?.screenActive) {
      this.objectCount = 0;
      this.status = 'inactive';
      return;
    }

    const w = context.camera.viewportW;
    const h = context.camera.viewportH;
    const reducedMotion = opening.settings?.reducedMotion === true;
    const direction = opening.lastMovementDirection ?? { x: 0, y: -1 };
    const shakeScale = reducedMotion ? 0 : opening.rockPulse * 7;
    const shakeX = direction.x * shakeScale;
    const shakeY = direction.y * shakeScale * 0.72;
    const centerX = w * 0.5 + shakeX;
    const centerY = h * 0.44 + shakeY;

    this.backgroundRects.push(rect(0, 0, w, h, withAlpha(DARK, opening.darknessOpacity)));
    this.buildShellInterior(centerX, centerY, w, h, opening);
    for (const ray of opening.lightRays ?? []) {
      addLightRay(this.triangles, ray, w, h, shakeX, shakeY, opening);
    }
    for (const crack of opening.cracks ?? []) {
      const ax = crack.ax * w + shakeX;
      const ay = crack.ay * h + shakeY;
      const bx = crack.bx * w + shakeX;
      const by = crack.by * h + shakeY;
      const fractureFade = opening.phase === 'opening'
        ? 1 - smoothstep(0.04, 0.78, opening.openingProgress) * 0.88
        : 1;
      addLine(this.triangles, ax, ay, bx, by, Math.max(2.6, crack.width * 4.6), withAlpha(MOON, (0.12 + opening.moonlightStrength * 0.12) * fractureFade));
      addLine(this.triangles, ax, ay, bx, by, Math.max(0.65, crack.width), withAlpha(CRACK_CORE, (0.66 + opening.moonlightStrength * 0.3) * fractureFade));
    }
    (opening.shellFragments ?? []).forEach((fragment, index) => {
      addShellFragment(this.triangles, fragment, index, w, h, reducedMotion);
    });
    if (opening.prompt) this.buildPrompt(opening.prompt.title, centerX, h * 0.74);

    this.objectCount = this.backgroundRects.length + this.radials.length
      + this.triangles.length + this.textRects.length;
    this.status = this.objectCount > 0 ? 'active' : 'inactive';
  }

  render(context) {
    if (this.backgroundRects.length) context.scene.drawScreenRects(this.backgroundRects, context.camera);
    if (this.radials.length) context.scene.drawScreenRadialDiscs(this.radials, context.camera);
    if (this.triangles.length) context.scene.drawScreenTriangles(this.triangles, context.camera);
    if (this.textRects.length) context.scene.drawScreenRects(this.textRects, context.camera);
  }

  statsFields() {
    return {
      mode: this.mode,
      phase: this.phase,
      crackStage: this.crackStage,
      fragmentCount: this.fragmentCount,
      rayCount: this.rayCount,
      glyphCount: this.glyphCount,
      primitiveCount: this.objectCount
    };
  }

  buildShellInterior(centerX, centerY, w, h, opening) {
    const opacity = opening.shellInteriorOpacity;
    this.radials.push(radial(centerX, centerY, w * 0.5, h * 0.64, [0.14, 0.115, 0.078, opacity], 0.9));
    this.radials.push(radial(centerX - w * 0.16, centerY - h * 0.12, w * 0.22, h * 0.31, [0.25, 0.18, 0.105, opacity * 0.16], 0.82));
    this.radials.push(radial(centerX + w * 0.19, centerY + h * 0.07, w * 0.19, h * 0.27, [0.06, 0.055, 0.046, opacity * 0.36], 0.86));
    this.radials.push(radial(centerX - w * 0.03, centerY + h * 0.24, w * 0.3, h * 0.18, [0.29, 0.2, 0.11, opacity * 0.12], 0.9));
    this.radials.push(radial(
      w * 0.512,
      h * 0.405,
      Math.max(52, w * (0.028 + opening.crackStage * 0.026)),
      Math.max(68, h * (0.07 + opening.crackStage * 0.03)),
      withAlpha(MOON, opening.moonlightStrength * (0.3 + opening.lightPulse * 0.2)),
      0.97
    ));
  }

  buildPrompt(title, centerX, y) {
    const text = String(title || 'MOVE').toUpperCase();
    const scale = 2;
    const width = pixelWidth(text, scale);
    const result = writePixelText(this.textRects, text, centerX - width * 0.5, y, {
      scale,
      color: PROMPT
    });
    this.glyphCount += result.glyphs;
    this.textRects.push(rect(centerX - 44, y + 24, 88, 1, [0.54, 0.68, 0.72, 0.18]));
  }
}

function addLightRay(triangles, ray, w, h, shakeX, shakeY, opening) {
  const phaseFade = opening.phase === 'opening'
    ? 1 - smoothstep(0.04, 0.74, opening.openingProgress) * 0.94
    : 1;
  const pulse = 0.78 + ray.pulse * 0.22;
  const origin = { x: ray.originX * w + shakeX, y: ray.originY * h + shakeY };
  const edgeA = { x: ray.ax * w, y: ray.ay * h };
  const edgeB = { x: ray.bx * w, y: ray.by * h };
  const mid = { x: (edgeA.x + edgeB.x) * 0.5, y: (edgeA.y + edgeB.y) * 0.5 };
  const halfX = (edgeB.x - edgeA.x) * 0.5;
  const halfY = (edgeB.y - edgeA.y) * 0.5;
  const alpha = ray.strength * opening.moonlightStrength * pulse * phaseFade;
  triangles.push(triangle(
    origin,
    { x: mid.x - halfX * 0.3, y: mid.y - halfY * 0.3 },
    { x: mid.x + halfX * 0.3, y: mid.y + halfY * 0.3 },
    withAlpha(MOON, alpha * 0.34)
  ));
  triangles.push(triangle(
    origin,
    { x: mid.x - halfX * 0.1, y: mid.y - halfY * 0.1 },
    { x: mid.x + halfX * 0.1, y: mid.y + halfY * 0.1 },
    withAlpha(CRACK_CORE, alpha * 0.22)
  ));
}

function addShellFragment(triangles, fragment, index, w, h, reducedMotion) {
  const progress = clamp01((fragment.progress - fragment.delay) / Math.max(0.01, 1 - fragment.delay));
  if (progress <= 0) return;
  const eased = smooth01(progress);
  const travel = reducedMotion ? fragment.travel * 0.42 : fragment.travel;
  const x = fragment.x * w + fragment.directionX * travel * eased * w * 0.24;
  const y = fragment.y * h + fragment.directionY * travel * eased * h * 0.22 + eased * eased * h * 0.08;
  const rotation = fragment.rotation + fragment.spin * (reducedMotion ? eased * 0.18 : eased);
  const size = fragment.size * Math.min(w, h) * (1 - eased * 0.16);
  const points = fragment.shape.map((point) => rotatedPoint(x, y, point.x * size, point.y * size, rotation));
  const center = centroid(points);
  const opacity = 1 - eased * 0.28;
  const fill = withAlpha(SHELL_COLORS[index % SHELL_COLORS.length], opacity);
  for (let i = 0; i < points.length; i += 1) {
    const next = points[(i + 1) % points.length];
    triangles.push(triangle(center, points[i], next, fill));
    if (i < 2) addLine(triangles, points[i].x, points[i].y, next.x, next.y, 1.1, withAlpha(SHELL_EDGE, opacity * 0.72));
  }
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

function radial(x, y, radiusX, radiusY, color, softness) {
  return { x, y, radiusX, radiusY, radius: Math.max(radiusX, radiusY), softness, color };
}

function rotatedPoint(cx, cy, x, y, rotation) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return { x: cx + x * cos - y * sin, y: cy + x * sin + y * cos };
}

function centroid(points) {
  return points.reduce((result, point) => ({
    x: result.x + point.x / points.length,
    y: result.y + point.y / points.length
  }), { x: 0, y: 0 });
}

function triangle(a, b, c, color) {
  return { ax: a.x, ay: a.y, bx: b.x, by: b.y, cx: c.x, cy: c.y, color };
}

function rect(x, y, w, h, color) {
  return { x, y, w, h, color };
}

function pixelWidth(text, scale) {
  return Math.max(0, String(text ?? '').length * 6 * scale - scale);
}

function withAlpha(color, alpha) {
  return [color[0], color[1], color[2], (color[3] ?? 1) * clamp01(alpha)];
}

function smooth01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function smoothstep(edge0, edge1, value) {
  return smooth01((value - edge0) / Math.max(0.001, edge1 - edge0));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}
