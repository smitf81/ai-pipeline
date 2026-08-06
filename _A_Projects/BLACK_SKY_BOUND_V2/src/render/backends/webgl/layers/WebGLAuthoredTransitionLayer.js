const ASH = [0.24, 0.23, 0.2, 1];
const IMPACT = [0.48, 0.57, 0.58, 1];
const SMOKE = [0.012, 0.018, 0.019, 1];
const SMOKE_EDGE = [0.07, 0.095, 0.095, 1];

export class WebGLAuthoredTransitionLayer {
  constructor() {
    this.id = 'authoredTransition';
    this.mode = 'authored_departure_sequence_v1';
    this.status = 'inactive';
    this.objectCount = 0;
    this.rects = [];
    this.radials = [];
    this.triangles = [];
    this.phase = 'inactive';
    this.actorTrackCount = 0;
    this.smokeCoverage = 0;
  }

  update(projection, context) {
    this.rects.length = 0;
    this.radials.length = 0;
    this.triangles.length = 0;
    const scene = projection.authoredTransition;
    this.phase = scene?.phase ?? 'inactive';
    this.actorTrackCount = scene?.actorTracks?.length ?? 0;
    this.smokeCoverage = scene?.smoke?.coverage ?? 0;
    if (!scene?.screenActive) {
      this.status = 'inactive';
      this.objectCount = 0;
      return;
    }
    const w = context.camera.viewportW;
    const h = context.camera.viewportH;
    this.buildImpact(w, h, scene);
    this.buildDebris(w, h, scene.landing?.debris ?? []);
    this.buildNorthSmoke(w, h, scene.smoke?.coverage ?? 0, scene.elapsedReal ?? 0);
    this.objectCount = this.rects.length + this.radials.length + this.triangles.length;
    this.status = this.objectCount > 0 ? 'active' : 'inactive';
  }

  render(context) {
    if (this.rects.length) context.scene.drawScreenRects(this.rects, context.camera);
    if (this.radials.length) context.scene.drawScreenRadialDiscs(this.radials, context.camera);
    if (this.triangles.length) context.scene.drawScreenTriangles(this.triangles, context.camera);
  }

  statsFields() {
    return {
      mode: this.mode,
      phase: this.phase,
      actorTrackCount: this.actorTrackCount,
      smokeCoverage: this.smokeCoverage,
      primitiveCount: this.objectCount
    };
  }

  buildImpact(w, h, scene) {
    if (scene.phase !== 'impact') return;
    const pulse = 1 - Math.min(1, (scene.phaseProgress ?? 0) * 1.7);
    if (pulse <= 0.01) return;
    this.radials.push(radial(w * 0.5, -h * 0.06, w * 0.48, h * 0.38, alpha(IMPACT, pulse * 0.24), 0.96));
    this.rects.push(rect(0, 0, w, h, alpha(IMPACT, pulse * 0.035)));
  }

  buildDebris(w, h, debris) {
    for (const item of debris) {
      if (item.opacity <= 0.01 || item.y01 < -0.18 || item.y01 > 1.2) continue;
      const x = item.x01 * w;
      const y = item.y01 * h;
      const size = item.size * 1.35;
      const c = Math.cos(item.rotation);
      const s = Math.sin(item.rotation);
      const p = (dx, dy) => ({ x: x + dx * c - dy * s, y: y + dx * s + dy * c });
      const a = p(0, -size);
      const b = p(-size * 0.72, size * 0.8);
      const cPoint = p(size * 0.9, size * 0.45);
      this.triangles.push(triangle(a, b, cPoint, alpha(ASH, Math.min(0.9, item.opacity * 1.35))));
    }
  }

  buildNorthSmoke(w, h, coverage, elapsed) {
    const amount = Math.max(0, Math.min(1, coverage));
    if (amount <= 0.005) return;
    const edgeY = h * Math.min(1.08, amount * 1.13);
    const radius = Math.min(w, h) * (0.2 + amount * 0.07);
    for (let index = 0; index < 9; index += 1) {
      const x = w * (index / 8) + Math.sin(elapsed * 0.85 + index * 1.73) * 15;
      const y = edgeY - h * (0.055 + (index % 3) * 0.024);
      this.radials.push(radial(x, y, radius * 1.35, radius, alpha(index % 3 === 0 ? SMOKE_EDGE : SMOKE, 0.68 + amount * 0.18), 0.96));
    }
    this.rects.push(rect(0, 0, w, h, alpha(SMOKE, amount * amount * 0.98)));
  }
}

function radial(x, y, radiusX, radiusY, color, softness) {
  return { x, y, radiusX, radiusY, radius: Math.max(radiusX, radiusY), softness, color };
}

function triangle(a, b, c, color) {
  return { ax: a.x, ay: a.y, bx: b.x, by: b.y, cx: c.x, cy: c.y, color };
}

function rect(x, y, w, h, color) {
  return { x, y, w, h, color };
}

function alpha(color, value) {
  return [color[0], color[1], color[2], (color[3] ?? 1) * Math.max(0, Math.min(1, value))];
}
