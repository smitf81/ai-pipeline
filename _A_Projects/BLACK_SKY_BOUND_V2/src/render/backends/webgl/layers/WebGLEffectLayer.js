import { parseWebGLColor, withAlpha } from '../WebGLColor.js';
import { WEBGL_LIGHT_SPACE_GATE_MODE, lightSpaceAlphaForWorldCircle, lightSpaceGateActive } from '../WebGLLightSpaceGate.js';
import { RENDER_BUDGETS } from '../../../../data/renderBudgets.js';
import { appendSmokeBurstPop, appendSmokePursuitBreak } from '../SmokePursuitBreakEffect.js';

const WEBGL_EFFECT_MODE = 'webgl_effects_particles_v0';

export class WebGLEffectLayer {
  constructor() {
    this.id = 'effects';
    this.mode = WEBGL_EFFECT_MODE;
    this.status = 'inactive';
    this.objectCount = 0;
    this.sourceCount = 0;
    this.primitiveCount = 0;
    this.rects = [];
    this.triangles = [];
    this.radials = [];
    this.projectileCount = 0;
    this.liveEffectCount = 0;
    this.particleCount = 0;
    this.particlePrimitiveCount = 0;
    this.bloodEffectCount = 0;
    this.bloodPrimitiveCount = 0;
    this.lightSpaceCulledCount = 0;
    this.lightSpaceGateActive = false;
  }

  update(projection, context) {
    const bounds = context.camera.visibleWorldBounds(96);
    this.rects = [];
    this.triangles = [];
    this.radials = [];
    this.lightSpaceCulledCount = 0;
    this.bloodEffectCount = 0;
    this.bloodPrimitiveCount = 0;
    this.lightSpaceGateActive = lightSpaceGateActive(context);
    const projectilePackets = projection.projectiles ?? [];
    const liveEffectPackets = projection.effects ?? [];
    const particlePackets = projection.particles ?? [];
    this.projectileCount = projectilePackets.length;
    this.liveEffectCount = liveEffectPackets.length;
    this.particleCount = particlePackets.length;
    for (const projectile of projectilePackets) this.appendLegacyEffect(projectile, context, bounds);
    for (const effect of liveEffectPackets) this.appendLiveEffect(effect, context, bounds);
    const primitiveCountBeforeParticles = this.rects.length + this.triangles.length + this.radials.length;
    for (const particle of particlePackets) this.appendParticle(particle, context, bounds);
    this.primitiveCount = this.rects.length + this.triangles.length + this.radials.length;
    this.particlePrimitiveCount = Math.max(0, this.primitiveCount - primitiveCountBeforeParticles);
    this.objectCount = projectilePackets.length + liveEffectPackets.length + particlePackets.length;
    this.sourceCount = this.objectCount;
    this.status = this.primitiveCount > 0 ? 'active' : 'inactive';
  }

  render(context) {
    if (this.radials.length) context.scene.drawWorldRadialDiscs(this.radials, context.camera);
    if (this.triangles.length) context.scene.drawTriangles(this.triangles, context.camera);
    if (this.rects.length) context.scene.drawRects(this.rects, context.camera);
  }

  statsFields() {
    return {
      mode: this.mode,
      effectMode: WEBGL_EFFECT_MODE,
      sourceCount: this.sourceCount,
      primitiveCount: this.primitiveCount,
      projectileCount: this.projectileCount,
      liveEffectCount: this.liveEffectCount,
      particleCount: this.particleCount,
      particlePrimitiveCount: this.particlePrimitiveCount,
      maxParticleCount: RENDER_BUDGETS.ambientParticles.maxActive,
      bloodEffectCount: this.bloodEffectCount,
      bloodPrimitiveCount: this.bloodPrimitiveCount,
      rectCount: this.rects.length,
      triangleCount: this.triangles.length,
      radialCount: this.radials.length,
      lightSpaceMode: WEBGL_LIGHT_SPACE_GATE_MODE,
      lightSpaceCullingActive: this.lightSpaceGateActive,
      lightSpaceCulledCount: this.lightSpaceCulledCount
    };
  }

  appendLegacyEffect(effect, context, bounds) {
    const packet = this.resolveEffectPacket(effect, context, bounds, 1);
    if (!packet) return;
    if (effect.visualRole === 'falling_napalm_drip' || effect.kind === 'napalm_droplet') {
      appendNapalmDrip(this, effect, packet.radius, packet.lightSpaceAlpha);
      return;
    }
    appendEffectRect(this.rects, effect, packet.radius, packet.lightSpaceAlpha);
  }

  appendLiveEffect(effect, context, bounds) {
    const packet = this.resolveEffectPacket(effect, context, bounds, isBloodEffect(effect) ? 1.8 : 1);
    if (!packet) return;
    if (!isBloodEffect(effect)) {
      if (effect.visualRole === 'enemy_fire_swing_arc') {
        appendFireSwingArc(this, effect, packet.radius, packet.lightSpaceAlpha);
        return;
      }
      if (effect.visualRole === 'smoke_pop') {
        appendSmokeBurstPop(this, effect, packet.radius, packet.lightSpaceAlpha);
        return;
      }
      if (effect.visualRole === 'smoke_pursuit_break') {
        appendSmokePursuitBreak(this, effect, packet.radius, packet.lightSpaceAlpha);
        return;
      }
      if (isAttackFlashEffect(effect)) {
        appendAttackFlash(this, effect, packet.radius, packet.lightSpaceAlpha);
        return;
      }
      appendEffectRect(this.rects, effect, packet.radius, packet.lightSpaceAlpha);
      return;
    }
    const before = primitiveCount(this);
    this.bloodEffectCount += 1;
    if (effect.visualRole === 'blood_spatter_arc' || effect.kind === 'blood_spatter_arc') {
      appendBloodSpatter(this, effect, packet.radius, packet.lightSpaceAlpha);
    } else {
      appendBloodMist(this, effect, packet.radius, packet.lightSpaceAlpha);
    }
    this.bloodPrimitiveCount += Math.max(0, primitiveCount(this) - before);
  }

  resolveEffectPacket(effect, context, bounds, boundsScale = 1) {
    const radius = Math.max(2, effect.radius ?? 3);
    const boundsRadius = radius * boundsScale;
    if (effect.worldX + boundsRadius < bounds.left || effect.worldY + boundsRadius < bounds.top
      || effect.worldX - boundsRadius > bounds.right || effect.worldY - boundsRadius > bounds.bottom) {
      return null;
    }
    const lightSpaceAlpha = lightSpaceAlphaForWorldCircle(context, effect.worldX, effect.worldY, boundsRadius);
    if (lightSpaceAlpha <= 0.015) {
      this.lightSpaceCulledCount += 1;
      return null;
    }
    return { radius, lightSpaceAlpha };
  }

  appendParticle(particle, context, bounds) {
    const r = Math.max(0.8, particle.radius ?? 1.6);
    if (particle.worldX + r * 3 < bounds.left || particle.worldY + r * 3 < bounds.top
      || particle.worldX - r * 3 > bounds.right || particle.worldY - r * 3 > bounds.bottom) return;
    const lightSpaceAlpha = lightSpaceAlphaForWorldCircle(context, particle.worldX, particle.worldY, Math.max(3, r * 2));
    if (lightSpaceAlpha <= 0.015) {
      this.lightSpaceCulledCount += 1;
      return;
    }
    const base = parseWebGLColor(particle.colour, [1, 0.64, 0.28, 0.55]);
    const core = parseWebGLColor(particle.coreColour, base);
    const alpha = Math.min(base[3], particle.opacity ?? 0.5) * lightSpaceAlpha;
    if (alpha <= 0.004) return;
    if (particle.visualRole === 'leaf_drift') {
      addLeafTriangle(this.triangles, particle.worldX, particle.worldY, r, withAlpha(base, alpha));
      return;
    }
    if (particle.visualRole === 'smoke_trail_mote') {
      this.radials.push(radial(particle, r * 2.8, particle.softness ?? 0.9, withAlpha(base, alpha * 0.8)));
      return;
    }
    if (particle.visualRole === 'ash_fleck') {
      addAshFleck(this.triangles, particle.worldX, particle.worldY, r, withAlpha(base, alpha));
      return;
    }
    if (particle.visualRole === 'flame_spark' || particle.visualRole === 'hot_ember') {
      this.radials.push(radial(particle, r * 1.65, particle.softness ?? 0.78, withAlpha(core, alpha * 0.22)));
      addFlameSpark(this.triangles, particle, r, withAlpha(base, alpha));
      return;
    }
    this.radials.push(radial(particle, r * 2.4, particle.softness ?? 0.7, withAlpha(core, alpha * 0.42)));
    this.rects.push({
      x: particle.worldX - r * 0.45,
      y: particle.worldY - r * 0.9,
      w: r * 0.9,
      h: r * 1.8,
      color: withAlpha(base, alpha)
    });
  }
}

function appendNapalmDrip(layer, effect, r, lightSpaceAlpha) {
  const drop01 = clamp01(effect.drop01 ?? 0);
  const stretch = Math.max(1, Math.min(2.2, effect.stretch ?? 1.5));
  const outer = parseWebGLColor(effect.colour, [0.93, 0.3, 0.08, 0.9]);
  const core = parseWebGLColor(effect.coreColour, [1, 0.82, 0.38, 0.94]);
  const shadow = parseWebGLColor(effect.shadowColour, [0.32, 0.08, 0.03, 0.4]);
  const alpha = lightSpaceAlpha * (0.82 + drop01 * 0.12);
  const glowRadius = Math.max(r * 1.8, effect.glowRadius ?? r * 2.4);

  if (Number.isFinite(effect.groundWorldX) && Number.isFinite(effect.groundWorldY)) {
    layer.radials.push({
      x: effect.groundWorldX,
      y: effect.groundWorldY,
      radius: Math.max(1.2, r * (0.72 + drop01 * 0.34)),
      softness: 0.88,
      color: withAlpha(shadow, shadow[3] * alpha * (0.28 + drop01 * 0.42))
    });
  }
  layer.radials.push({
    x: effect.worldX,
    y: effect.worldY,
    radius: glowRadius,
    softness: 0.9,
    color: withAlpha(outer, outer[3] * alpha * 0.1)
  });

  if (Number.isFinite(effect.previousWorldX) && Number.isFinite(effect.previousWorldY)) {
    addStreakTriangle(
      layer.triangles,
      effect.previousWorldX,
      effect.previousWorldY,
      effect.worldX,
      effect.worldY,
      Math.max(0.55, r * 0.34),
      withAlpha(outer, outer[3] * alpha * 0.2)
    );
  }

  const topY = effect.worldY - r * stretch;
  const bottomY = effect.worldY + r * 0.62;
  layer.triangles.push(
    {
      ax: effect.worldX,
      ay: topY,
      bx: effect.worldX - r * 0.56,
      by: effect.worldY,
      cx: effect.worldX,
      cy: bottomY,
      color: withAlpha(outer, outer[3] * alpha)
    },
    {
      ax: effect.worldX,
      ay: topY,
      bx: effect.worldX,
      by: bottomY,
      cx: effect.worldX + r * 0.56,
      cy: effect.worldY,
      color: withAlpha(outer, outer[3] * alpha)
    }
  );
  layer.triangles.push({
    ax: effect.worldX,
    ay: effect.worldY - r * stretch * 0.48,
    bx: effect.worldX - r * 0.22,
    by: effect.worldY + r * 0.28,
    cx: effect.worldX + r * 0.22,
    cy: effect.worldY + r * 0.28,
    color: withAlpha(core, core[3] * alpha * 0.92)
  });
}

function appendEffectRect(rects, effect, r, lightSpaceAlpha) {
  const base = parseWebGLColor(effect.colour, [1, 0.64, 0.28, 0.55]);
  rects.push({
    x: effect.worldX - r,
    y: effect.worldY - r,
    w: r * 2,
    h: r * 2,
    color: withAlpha(base, Math.min(base[3], effect.opacity ?? 0.58) * lightSpaceAlpha)
  });
}

function appendBloodMist(layer, effect, r, lightSpaceAlpha) {
  const life = clamp01(effect.life01 ?? 1);
  const born = 1 - life;
  const seed = stableSeed(effect.id ?? `${effect.worldX}:${effect.worldY}:mist`);
  const count = clampInt(effect.particleCount, 6, 16, 9);
  const alpha = bloodAlpha(effect, lightSpaceAlpha, life, born);
  if (alpha <= 0.004) return;
  const base = parseWebGLColor(effect.fillColour ?? effect.colour, [0.58, 0.06, 0.1, 0.5]);
  const core = parseWebGLColor(effect.coreColour ?? effect.colour, [0.9, 0.18, 0.16, 0.24]);
  const centerAngle = directionAngle(effect, seed);
  const spread = clampScale(effect.spreadRadians, 0.7, Math.PI * 2, Math.PI * 1.4);
  for (let i = 0; i < count; i += 1) {
    const t = count <= 1 ? 0.5 : i / (count - 1);
    const angle = centerAngle + (t - 0.5) * spread + signedNoise(seed + i * 31) * 0.42;
    const distance = r * (0.08 + pseudo(seed + i * 17) * 0.48) * (0.48 + born * 0.92);
    const moteRadius = Math.max(1.1, r * (0.045 + pseudo(seed + i * 23) * 0.055) * (0.72 + born * 0.55));
    const color = i % 3 === 0 ? core : base;
    layer.radials.push({
      x: effect.worldX + Math.cos(angle) * distance,
      y: effect.worldY + Math.sin(angle) * distance * 0.72,
      radius: moteRadius * (i % 3 === 0 ? 1.45 : 1),
      softness: clampScale(effect.softness, 0.46, 0.95, 0.84),
      color: withAlpha(color, Math.min(color[3], alpha * (0.32 + pseudo(seed + i * 29) * 0.34)))
    });
  }
}

function appendBloodSpatter(layer, effect, r, lightSpaceAlpha) {
  const life = clamp01(effect.life01 ?? 1);
  const born = 1 - life;
  const seed = stableSeed(effect.id ?? `${effect.worldX}:${effect.worldY}:spatter`);
  const count = clampInt(effect.particleCount, 5, 14, 7);
  const alpha = bloodAlpha(effect, lightSpaceAlpha, life, born);
  if (alpha <= 0.004) return;
  const base = parseWebGLColor(effect.fillColour ?? effect.colour, [0.6, 0.06, 0.1, 0.56]);
  const dark = parseWebGLColor(effect.coreColour ?? effect.colour, [0.22, 0.01, 0.04, 0.42]);
  const angle = directionAngle(effect, seed);
  const spread = clampScale(effect.spreadRadians, 0.5, Math.PI * 2, 1.6);
  for (let i = 0; i < count; i += 1) {
    const t = count <= 1 ? 0.5 : i / (count - 1);
    const theta = angle + (t - 0.5) * spread + signedNoise(seed + i * 41) * 0.22;
    const length = r * (0.22 + pseudo(seed + i * 13) * 0.72) * (0.72 + born * 0.58);
    const start = r * (0.08 + pseudo(seed + i * 19) * 0.08);
    const sx = effect.worldX + Math.cos(theta) * start;
    const sy = effect.worldY + Math.sin(theta) * start * 0.74;
    const tx = effect.worldX + Math.cos(theta) * length;
    const ty = effect.worldY + Math.sin(theta) * length * 0.74;
    const width = Math.max(0.8, r * (0.018 + pseudo(seed + i * 37) * 0.026));
    const streakAlpha = alpha * (0.42 + pseudo(seed + i * 43) * 0.34);
    addStreakTriangle(layer.triangles, sx, sy, tx, ty, width, withAlpha(i % 4 === 0 ? dark : base, streakAlpha));
    layer.radials.push({
      x: tx,
      y: ty,
      radius: Math.max(1, width * (1.3 + pseudo(seed + i * 47) * 1.8)),
      softness: 0.68,
      color: withAlpha(base, streakAlpha * 0.7)
    });
  }
}

function appendAttackFlash(layer, effect, r, lightSpaceAlpha) {
  const life = clamp01(effect.life01 ?? 1);
  const seed = stableSeed(effect.id ?? `${effect.worldX}:${effect.worldY}:flash`);
  const base = parseWebGLColor(effect.colour, [1, 0.82, 0.48, 0.58]);
  const alpha = Math.min(base[3], (effect.opacity ?? 0.62) * Math.pow(life, 0.8)) * lightSpaceAlpha;
  if (alpha <= 0.004) return;
  const angle = directionAngle(effect, seed);
  const lunge = effect.kind === 'lunge';
  const count = lunge ? 3 : 4;
  const spread = lunge ? 0.42 : 1.05;
  const width = Math.max(1.1, (effect.lineWidth ?? 2) * (lunge ? 1.25 : 0.92));
  for (let i = 0; i < count; i += 1) {
    const t = count <= 1 ? 0.5 : i / (count - 1);
    const theta = angle + (t - 0.5) * spread + signedNoise(seed + i * 17) * 0.08;
    const start = r * (0.12 + pseudo(seed + i * 23) * 0.08);
    const length = r * (lunge ? 0.88 : 0.68) * (0.82 + pseudo(seed + i * 29) * 0.18);
    addStreakTriangle(
      layer.triangles,
      effect.worldX + Math.cos(theta) * start,
      effect.worldY + Math.sin(theta) * start * 0.76,
      effect.worldX + Math.cos(theta) * length,
      effect.worldY + Math.sin(theta) * length * 0.76,
      width,
      withAlpha(base, alpha * (0.32 + pseudo(seed + i * 31) * 0.28))
    );
  }
  layer.radials.push({
    x: effect.worldX,
    y: effect.worldY,
    radius: Math.max(2, r * 0.16),
    softness: 0.64,
    color: withAlpha(base, alpha * 0.22)
  });
}

function appendFireSwingArc(layer, effect, r, lightSpaceAlpha) {
  const life = clamp01(effect.life01 ?? 1);
  const base = parseWebGLColor(effect.colour, [1, 0.48, 0.12, 0.72]);
  const core = parseWebGLColor(effect.fillColour, [1, 0.8, 0.36, 0.48]);
  const alpha = Math.min(base[3], (effect.opacity ?? 0.78) * Math.pow(life, 0.72)) * lightSpaceAlpha;
  if (alpha <= 0.004) return;
  const facing = directionAngle(effect, 0);
  const arcStart = facing - 0.92;
  const arcEnd = facing + 0.74;
  let previous = null;
  for (let index = 0; index <= 8; index += 1) {
    const t = index / 8;
    const angle = arcStart + (arcEnd - arcStart) * t;
    const radius = r * (0.68 + Math.sin(t * Math.PI) * 0.18);
    const point = {
      x: effect.worldX + Math.cos(angle) * radius,
      y: effect.worldY + Math.sin(angle) * radius * 0.78
    };
    if (previous) addStreakTriangle(layer.triangles, previous.x, previous.y, point.x, point.y, Math.max(2, (effect.lineWidth ?? 3) * life), withAlpha(base, alpha * (0.42 + t * 0.28)));
    previous = point;
  }
  layer.radials.push({
    x: effect.worldX + Math.cos(arcEnd) * r * 0.78,
    y: effect.worldY + Math.sin(arcEnd) * r * 0.62,
    radius: Math.max(2.5, r * 0.15),
    softness: 0.58,
    color: withAlpha(core, alpha * 0.42)
  });
}

function radial(particle, radius, softness, color) {
  return {
    x: particle.worldX,
    y: particle.worldY,
    radius,
    softness,
    color
  };
}

function addLeafTriangle(triangles, x, y, r, color) {
  triangles.push({
    ax: x - r * 1.1,
    ay: y - r * 0.2,
    bx: x + r * 1.2,
    by: y - r * 0.7,
    cx: x + r * 0.35,
    cy: y + r * 1.1,
    color
  });
}

function addAshFleck(triangles, x, y, r, color) {
  triangles.push({
    ax: x - r * 0.55,
    ay: y,
    bx: x + r * 0.65,
    by: y - r * 0.35,
    cx: x + r * 0.2,
    cy: y + r * 0.55,
    color
  });
}

function addFlameSpark(triangles, particle, r, color) {
  const phase = clamp01(particle.phase ?? 0);
  const lean = Math.sin(phase * Math.PI * 2 + particle.worldX * 0.03) * r * 0.48;
  triangles.push({
    ax: particle.worldX + lean,
    ay: particle.worldY - r * 1.25,
    bx: particle.worldX - r * 0.34,
    by: particle.worldY + r * 0.74,
    cx: particle.worldX + r * 0.34,
    cy: particle.worldY + r * 0.46,
    color
  });
}

function addStreakTriangle(triangles, sx, sy, tx, ty, width, color) {
  const dx = tx - sx;
  const dy = ty - sy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len * width;
  const ny = dx / len * width;
  triangles.push({
    ax: sx - nx,
    ay: sy - ny,
    bx: sx + nx,
    by: sy + ny,
    cx: tx,
    cy: ty,
    color
  });
}

function isBloodEffect(effect) {
  return effect.visualRole === 'blood_mist'
    || effect.visualRole === 'blood_spatter_arc'
    || effect.kind === 'blood_mist'
    || effect.kind === 'blood_spatter_arc';
}

function isAttackFlashEffect(effect) {
  return effect.kind === 'slash'
    || effect.kind === 'lunge'
    || effect.kind === 'hurt'
    || effect.visualRole === 'enemy_attack_streak';
}

function bloodAlpha(effect, lightSpaceAlpha, life, born) {
  const birthFade = Math.min(1, 0.28 + born * 6);
  return clamp01(effect.opacity ?? 0.78) * birthFade * Math.pow(life, 1.28) * lightSpaceAlpha;
}

function directionAngle(effect, seed) {
  const dx = Number(effect.directionX ?? 0);
  const dy = Number(effect.directionY ?? 0);
  if (Math.hypot(dx, dy) > 0.001) return Math.atan2(dy, dx);
  return signedNoise(seed + 7) * Math.PI;
}

function primitiveCount(layer) {
  return layer.rects.length + layer.triangles.length + layer.radials.length;
}

function clampScale(value, min, max, fallback) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(min, Math.min(max, next));
}

function clampInt(value, min, max, fallback) {
  const next = Math.round(Number(value));
  if (!Number.isFinite(next)) return fallback;
  return Math.max(min, Math.min(max, next));
}

function clamp01(value) {
  const next = Number(value);
  if (!Number.isFinite(next)) return 0;
  return Math.max(0, Math.min(1, next));
}

function stableSeed(value) {
  const text = String(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pseudo(seed) {
  let value = Math.imul(seed ^ 0x9e3779b9, 1597334677);
  value ^= value >>> 15;
  value = Math.imul(value, 3812015801);
  value ^= value >>> 13;
  return ((value >>> 0) % 10000) / 10000;
}

function signedNoise(seed) {
  return pseudo(seed) * 2 - 1;
}
