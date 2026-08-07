import { ATMOSPHERIC_CAMERA_OVERLAY_MODE } from '../../../../data/atmosphericOverlay.js';
import { RENDER_BUDGETS } from '../../../../data/renderBudgets.js';

const DEG_TO_RAD = Math.PI / 180;
const EMPTY_EMITTERS = Object.freeze([]);

/**
 * AUTHORIAL ATMOSPHERE VISIBILITY BASELINE — FELIX, 2026-07-14
 *
 * These are deliberate presentation values, not temporary debug boosts.
 * Rain and sparks had regressed into near-invisibility against Black Sky Bound's
 * darkness-first scene. Upstream tuning still owns whether each effect is enabled,
 * its density/rate, direction and overall overlay opacity; this profile only protects
 * the authored on-screen legibility of each generated primitive.
 *
 * IMPORTANT FOR FUTURE CODEX/REFACTOR PASSES:
 * Do not "normalise", reduce or remove these values without a side-by-side live
 * capture proving that rain and sparks remain clearly readable during gameplay.
 * Work around this baseline rather than silently returning to the former faint output.
 */
const AUTHORED_ATMOSPHERE_VISIBILITY = Object.freeze({
  rain: Object.freeze({
    lengthScale: 1.12,
    widthScale: 1.45,
    alphaScale: 2.15,
    alphaCeiling: 0.26,
    coolRed: 0.7,
    coolGreen: 0.8,
    coolBlue: 0.94
  }),
  sparks: Object.freeze({
    radiusScale: 1.18,
    alphaScale: 1.65,
    alphaCeiling: 0.48,
    haloAlphaScale: 0.58,
    streakLengthScale: 1.22,
    streakWidthScale: 1.25,
    streakAlphaScale: 1.45,
    streakAlphaCeiling: 0.24
  })
});

export class WebGLAtmosphericOverlayLayer {
  constructor() {
    this.id = 'atmosphere';
    this.mode = ATMOSPHERIC_CAMERA_OVERLAY_MODE;
    this.status = 'inactive';
    this.objectCount = 0;
    this.primitiveCount = 0;
    this.enabled = false;
    this.rainEnabled = false;
    this.sparkEnabled = false;
    this.overlayOpacity = 0;
    this.rainDensity = 0;
    this.rainSpeed = 0;
    this.rainAngle = 0;
    this.sparkRate = 0;
    this.sparkDrift = { x: 0, y: -180 };
    this.emitters = EMPTY_EMITTERS;
    this.emitterReactiveOverlayEnabled = false;
    this.atmosphereEmitterCount = 0;
    this.maxAtmosphereEmitters = 0;
    this.rainLightCatchStrength = 0;
    this.rainWarmTintStrength = 0;
    this.sparkLightCatchStrength = 0;
    this.emitterInfluenceFalloff = 1;
    this.rainEmitterHitCount = 0;
    this.sparkEmitterHitCount = 0;
    this.emitterInfluenceMax = 0;
    this.rainStreakCount = 0;
    this.rainPrimitiveCount = 0;
    this.sparkActiveCount = 0;
    this.sparkPrimitiveCount = 0;
    this.triangles = [];
    this.radials = [];
    this.screenCamera = { x: 0, y: 0, zoom: 1, viewportW: 1, viewportH: 1 };
    this.rainPool = makePool(RENDER_BUDGETS.atmosphericCameraOverlay.maxRainStreaks, createRainStreak);
    this.sparkPool = makePool(RENDER_BUDGETS.atmosphericCameraOverlay.maxSparkPool, createSpark);
    this.rainTriangles = makePool(this.rainPool.length, createTriangle);
    this.sparkTriangles = makePool(this.sparkPool.length, createTriangle);
    this.sparkRadials = makePool(this.sparkPool.length, createRadial);
  }

  update(projection, context) {
    const packet = projection.atmosphericOverlay ?? null;
    const tuning = packet?.tuning ?? {};
    const width = context.camera.viewportW || context.renderTargetWidth || 1280;
    const height = context.camera.viewportH || context.renderTargetHeight || 720;
    const renderTime = Number.isFinite(packet?.renderTime) ? packet.renderTime : 0;
    this.triangles.length = 0;
    this.radials.length = 0;
    this.rainStreakCount = 0;
    this.rainPrimitiveCount = 0;
    this.sparkActiveCount = 0;
    this.sparkPrimitiveCount = 0;
    this.rainEmitterHitCount = 0;
    this.sparkEmitterHitCount = 0;
    this.emitterInfluenceMax = 0;
    this.overlayOpacity = clamp01(tuning.overlayOpacity ?? 0);
    this.rainDensity = clamp01(tuning.rainDensity ?? 0);
    this.rainSpeed = Math.max(0, Number(tuning.rainSpeed) || 0);
    this.rainAngle = clampNumber(tuning.rainAngle, -42, 42, 0);
    this.sparkRate = Math.max(0, Number(tuning.sparkRate) || 0);
    this.sparkDrift = resolveDrift(tuning.sparkDrift);
    this.enabled = packet?.enabled !== false && this.overlayOpacity > 0 && isToggleEnabled(tuning.debugToggleParam ?? 'atmosphere');
    this.maxAtmosphereEmitters = clampInteger(tuning.maxAtmosphereEmitters, 0, RENDER_BUDGETS.atmosphericCameraOverlay.maxEmitterInfluences, 0);
    this.emitterReactiveOverlayEnabled = this.enabled && tuning.emitterReactiveOverlayEnabled !== false && isToggleEnabled(tuning.emitterReactiveToggleParam ?? 'atmosphereEmitters');
    this.rainLightCatchStrength = clampNumber(tuning.rainLightCatchStrength, 0, 1, 0);
    this.rainWarmTintStrength = clampNumber(tuning.rainWarmTintStrength, 0, 1, 0);
    this.sparkLightCatchStrength = clampNumber(tuning.sparkLightCatchStrength, 0, 1, 0);
    this.emitterInfluenceFalloff = clampNumber(tuning.emitterInfluenceFalloff, 0.5, 4, 1.65);
    this.emitters = this.emitterReactiveOverlayEnabled && Array.isArray(packet?.emitters) ? packet.emitters : EMPTY_EMITTERS;
    this.atmosphereEmitterCount = Math.min(this.maxAtmosphereEmitters, this.emitters.length);
    this.rainEnabled = this.enabled && tuning.rainEnabled !== false && isToggleEnabled(tuning.rainToggleParam ?? 'rain');
    this.sparkEnabled = this.enabled && tuning.sparkEnabled !== false && isToggleEnabled(tuning.sparkToggleParam ?? 'sparks');

    if (this.rainEnabled) this.appendRain(renderTime, width, height);
    if (this.sparkEnabled) this.appendSparks(renderTime, width, height);

    this.primitiveCount = this.triangles.length + this.radials.length;
    this.objectCount = this.rainStreakCount + this.sparkActiveCount;
    this.status = this.primitiveCount > 0 ? 'active' : (this.enabled ? 'active_empty' : 'inactive');
  }

  render(context) {
    if (!this.primitiveCount) return;
    if (this.triangles.length) context.scene.drawScreenTriangles(this.triangles, context.camera);
    if (this.radials.length) {
      syncScreenCamera(this.screenCamera, context.camera);
      context.scene.drawWorldRadials(this.radials, this.screenCamera, 'additive');
    }
  }

  statsFields() {
    return {
      mode: this.mode,
      cameraAtmosphereMode: this.mode,
      cameraAtmosphereEnabled: this.enabled,
      cameraAtmospherePolicy: RENDER_BUDGETS.atmosphericCameraOverlay.policy,
      cameraAtmosphereToggleParam: 'atmosphere',
      overlayOpacity: this.overlayOpacity,
      rainEnabled: this.rainEnabled,
      rainDensity: this.rainDensity,
      rainSpeed: this.rainSpeed,
      rainAngle: this.rainAngle,
      rainStreakCount: this.rainStreakCount,
      rainPrimitiveCount: this.rainPrimitiveCount,
      sparkEnabled: this.sparkEnabled,
      sparkRate: this.sparkRate,
      sparkDriftX: this.sparkDrift.x,
      sparkDriftY: this.sparkDrift.y,
      sparkActiveCount: this.sparkActiveCount,
      sparkPrimitiveCount: this.sparkPrimitiveCount,
      emitterReactiveOverlayEnabled: this.emitterReactiveOverlayEnabled,
      atmosphereEmitterCount: this.atmosphereEmitterCount,
      maxAtmosphereEmitters: this.maxAtmosphereEmitters,
      rainLightCatchStrength: this.rainLightCatchStrength,
      rainWarmTintStrength: this.rainWarmTintStrength,
      sparkLightCatchStrength: this.sparkLightCatchStrength,
      emitterInfluenceFalloff: this.emitterInfluenceFalloff,
      rainEmitterHitCount: this.rainEmitterHitCount,
      sparkEmitterHitCount: this.sparkEmitterHitCount,
      emitterInfluenceMax: this.emitterInfluenceMax,
      primitiveCount: this.primitiveCount,
      maxRainStreaks: this.rainPool.length,
      maxSparkCount: this.sparkPool.length
    };
  }

  appendRain(time, width, height) {
    const areaScale = clampNumber((width * height) / (1280 * 720), 0.56, 1.45, 1);
    const count = Math.min(this.rainPool.length, Math.round(this.rainPool.length * this.rainDensity * areaScale));
    const angle = this.rainAngle * DEG_TO_RAD;
    const dirX = Math.sin(angle);
    const dirY = Math.max(0.24, Math.cos(angle));
    const pad = 80;
    const travelSpan = (height + pad * 2) / dirY + Math.abs(dirX) * (width + pad * 2);
    for (let i = 0; i < count; i += 1) {
      const drop = this.rainPool[i];
      const distance = fract(drop.offset + (time * this.rainSpeed * drop.speedScale) / travelSpan) * travelSpan;
      const baseX = -pad + drop.lane * (width + pad * 2) - Math.max(0, dirX) * pad;
      const sway = Math.sin(time * drop.swaySpeed + drop.seed * 6.283) * drop.sway;
      const x = baseX + dirX * distance + sway;
      const y = -pad + dirY * distance;
      if (x < -pad || x > width + pad || y < -pad || y > height + pad) continue;
      const triangle = this.rainTriangles[this.rainStreakCount];
      const life = 0.74 + 0.26 * Math.sin(time * 2.1 + drop.seed * 17);
      const lightCatch = sampleEmitterInfluence(x, y, this.emitters, this.atmosphereEmitterCount, this.emitterInfluenceFalloff, drop.seed, time);
      if (lightCatch > 0.018) this.rainEmitterHitCount += 1;
      this.emitterInfluenceMax = Math.max(this.emitterInfluenceMax, lightCatch);
      const warmth = lightCatch * this.rainWarmTintStrength;
      // INTENTIONAL ART DIRECTION:
      // Preserve a readable rain silhouette over the dark scene. Density and master
      // opacity still come from canonical tuning; these authored scales prevent the
      // individual streaks from fading back into sub-pixel grey noise.
      const rainVisibility = AUTHORED_ATMOSPHERE_VISIBILITY.rain;
      const alpha = Math.min(
        rainVisibility.alphaCeiling,
        this.overlayOpacity
          * drop.alpha
          * life
          * rainVisibility.alphaScale
          * (1 + lightCatch * this.rainLightCatchStrength)
      );
      writeStreakTriangle(
        triangle,
        x,
        y,
        dirX,
        dirY,
        drop.length * rainVisibility.lengthScale,
        drop.width * rainVisibility.widthScale,
        mix(rainVisibility.coolRed, 1, warmth),
        mix(rainVisibility.coolGreen, 0.66, warmth),
        mix(rainVisibility.coolBlue, 0.3, warmth),
        alpha
      );
      this.triangles.push(triangle);
      this.rainStreakCount += 1;
    }
    this.rainPrimitiveCount = this.rainStreakCount;
  }

  appendSparks(time, width, height) {
    if (this.sparkRate <= 0) return;
    const cycle = Math.max(1.2, this.sparkPool.length / this.sparkRate);
    for (let i = 0; i < this.sparkPool.length; i += 1) {
      const spark = this.sparkPool[i];
      const activeWindow = spark.lifetime / cycle;
      const phase = fract((time + spark.offset * cycle) / cycle);
      if (phase > activeWindow) continue;
      const t = clamp01(phase / activeWindow);
      const fade = Math.pow(Math.sin(Math.PI * t), 1.35);
      if (fade <= 0.01) continue;
      const spawnX = width * spark.spawnX;
      const x = spawnX + this.sparkDrift.x * t + Math.sin(t * Math.PI * 2.4 + spark.seed * 13) * spark.wobble;
      const y = height + spark.spawnY + (this.sparkDrift.y - spark.rise) * t;
      if (x < -36 || x > width + 36 || y < -42 || y > height + 48) continue;
      const lightCatch = sampleEmitterInfluence(x, y, this.emitters, this.atmosphereEmitterCount, this.emitterInfluenceFalloff, spark.seed, time);
      if (lightCatch > 0.02) this.sparkEmitterHitCount += 1;
      this.emitterInfluenceMax = Math.max(this.emitterInfluenceMax, lightCatch);
      // INTENTIONAL ART DIRECTION:
      // Sparks should read as brief hot embers, not imperceptible orange pixels.
      // Keep their spawn rate/lifetime data-driven, while protecting their authored
      // core, halo and trailing-streak visibility here.
      const sparkVisibility = AUTHORED_ATMOSPHERE_VISIBILITY.sparks;
      const bright = spark.bright ? 1.7 : 1;
      const alpha = Math.min(
        sparkVisibility.alphaCeiling,
        this.overlayOpacity
          * spark.alpha
          * fade
          * bright
          * sparkVisibility.alphaScale
          * (1 + lightCatch * this.sparkLightCatchStrength)
      );
      const radius = spark.radius
        * (0.72 + 0.42 * fade)
        * (spark.bright ? 1.22 : 1)
        * sparkVisibility.radiusScale
        * (1 + lightCatch * 0.14);
      const radial = this.sparkRadials[this.sparkActiveCount];
      radial.x = x;
      radial.y = y;
      radial.radius = radius * (spark.bright ? 5.2 : 4.2);
      radial.softness = 0.82;
      setColor(
        radial.color,
        1,
        0.46 + spark.warmth * 0.18,
        0.13,
        alpha * sparkVisibility.haloAlphaScale
      );
      this.radials.push(radial);
      const triangle = this.sparkTriangles[this.sparkActiveCount];
      writeStreakTriangle(
        triangle,
        x,
        y,
        -0.18 + spark.wind * 0.28,
        -1,
        radius * 5.4 * sparkVisibility.streakLengthScale,
        Math.max(0.7, radius * 0.42) * sparkVisibility.streakWidthScale,
        1,
        0.58 + spark.warmth * 0.24,
        0.22,
        Math.min(
          sparkVisibility.streakAlphaCeiling,
          alpha * 0.9 * sparkVisibility.streakAlphaScale
        )
      );
      this.triangles.push(triangle);
      this.sparkActiveCount += 1;
    }
    this.sparkPrimitiveCount = this.sparkActiveCount * 2;
  }
}

function makePool(count, factory) {
  return Array.from({ length: count }, (_, index) => factory(index));
}

function createRainStreak(index) {
  const seed = seeded01('rain', index);
  return {
    seed,
    lane: seeded01('rain', index, 'lane'),
    offset: seeded01('rain', index, 'offset'),
    speedScale: 0.76 + seeded01('rain', index, 'speed') * 0.48,
    length: 21 + seeded01('rain', index, 'length') * 27,
    width: 0.58 + seeded01('rain', index, 'width') * 0.6,
    alpha: 0.052 + seeded01('rain', index, 'alpha') * 0.052,
    sway: seededSigned('rain', index, 'sway') * 3.2,
    swaySpeed: 0.9 + seeded01('rain', index, 'swaySpeed') * 1.6
  };
}

function createSpark(index) {
  const bright = seeded01('spark', index, 'bright') > 0.86;
  return {
    seed: seeded01('spark', index),
    offset: seeded01('spark', index, 'offset'),
    spawnX: seeded01('spark', index, 'spawnX'),
    spawnY: 10 + seeded01('spark', index, 'spawnY') * 42,
    lifetime: 0.7 + seeded01('spark', index, 'life') * 0.72,
    rise: 42 + seeded01('spark', index, 'rise') * 58,
    wobble: 8 + seeded01('spark', index, 'wobble') * 20,
    wind: seededSigned('spark', index, 'wind'),
    radius: 1.08 + seeded01('spark', index, 'radius') * 0.92,
    alpha: bright ? 0.3 : 0.14 + seeded01('spark', index, 'alpha') * 0.09,
    warmth: seeded01('spark', index, 'warmth'),
    bright
  };
}

function createTriangle() {
  return { ax: 0, ay: 0, bx: 0, by: 0, cx: 0, cy: 0, color: [0, 0, 0, 0] };
}

function createRadial() {
  return { x: 0, y: 0, radius: 0, softness: 0.8, color: [0, 0, 0, 0] };
}

function sampleEmitterInfluence(x, y, emitters, count, falloff, seed, time) {
  if (!count) return 0;
  let influence = 0;
  for (let i = 0; i < count; i += 1) {
    const emitter = emitters[i];
    const radius = Number(emitter?.screenRadius) || 0;
    if (radius <= 0) continue;
    const dx = x - emitter.screenX;
    const dy = y - emitter.screenY;
    const distSq = dx * dx + dy * dy;
    if (distSq >= radius * radius) continue;
    const local = 1 - Math.sqrt(distSq) / radius;
    const softened = Math.pow(smooth01(local), falloff);
    influence = Math.max(influence, softened * clamp01(emitter.intensity) * clamp01(emitter.warmth));
  }
  if (influence <= 0) return 0;
  const shimmer = 0.86 + 0.14 * Math.sin(time * 4.4 + seed * 21.17);
  return clamp01(influence * shimmer);
}

function writeStreakTriangle(target, x, y, dirX, dirY, length, width, r, g, b, a) {
  const len = Math.hypot(dirX, dirY) || 1;
  const ux = dirX / len;
  const uy = dirY / len;
  const nx = -uy * width;
  const ny = ux * width;
  const sx = x - ux * length * 0.5;
  const sy = y - uy * length * 0.5;
  target.ax = sx - nx;
  target.ay = sy - ny;
  target.bx = sx + nx;
  target.by = sy + ny;
  target.cx = x + ux * length * 0.5;
  target.cy = y + uy * length * 0.5;
  setColor(target.color, r, g, b, a);
}

function syncScreenCamera(target, camera) {
  target.viewportW = camera.viewportW;
  target.viewportH = camera.viewportH;
  target.x = camera.viewportW * 0.5;
  target.y = camera.viewportH * 0.5;
  target.zoom = 1;
}

function resolveDrift(value) {
  const drift = value && typeof value === 'object' ? value : {};
  return {
    x: clampNumber(drift.x, -180, 180, -34),
    y: clampNumber(drift.y, -240, 60, -118)
  };
}

function setColor(target, r, g, b, a) {
  target[0] = clamp01(r);
  target[1] = clamp01(g);
  target[2] = clamp01(b);
  target[3] = clamp01(a);
}

function isToggleEnabled(param) {
  const value = new URLSearchParams(globalThis.location?.search ?? '').get(param);
  return !['0', 'false', 'off'].includes(String(value ?? '').toLowerCase());
}

function seededSigned(...parts) {
  return seeded01(...parts) * 2 - 1;
}

function seeded01(...parts) {
  const text = parts.join(':');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function fract(value) {
  return value - Math.floor(value);
}

function clamp01(value) {
  return clampNumber(value, 0, 1, 0);
}

function clampInteger(value, min, max, fallback) {
  return Math.round(clampNumber(value, min, max, fallback));
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function mix(a, b, t) {
  return a + (b - a) * clamp01(t);
}

function smooth01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}
