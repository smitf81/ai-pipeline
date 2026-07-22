import { parseWebGLColor, withAlpha } from '../WebGLColor.js';
import { WEBGL_LIGHT_SPACE_GATE_MODE, lightSpaceAlphaForWorldCircle, lightSpaceGateActive } from '../WebGLLightSpaceGate.js';

const FOG_SMOKE_MODE = 'layered_lit_plume_smoke_v1';
const MAX_FOG_SMOKE_SOURCES = 32;
const MAX_FOG_SMOKE_PRIMITIVES = 128;
const MAX_SMOKE_SCATTER_PRIMITIVES = 64;
const MAX_SMOKE_SCATTER_LIGHTS = 8;

export class WebGLFogSmokeLayer {
  constructor() {
    this.id = 'fogSmoke';
    this.mode = FOG_SMOKE_MODE;
    this.status = 'inactive';
    this.objectCount = 0;
    this.sourceCount = 0;
    this.primitiveCount = 0;
    this.smokeRadials = [];
    this.scatterRadials = [];
    this.radials = this.smokeRadials;
    this.smokePrimitiveCount = 0;
    this.scatterPrimitiveCount = 0;
    this.contributingLightCount = 0;
    this.lightSpaceCulledCount = 0;
    this.lightSpaceGateActive = false;
  }

  update(projection, context) {
    const sources = projection.fogSmoke ?? [];
    const lights = collectContributingLights(projection.lights ?? []);
    const bounds = context.camera.visibleWorldBounds(180);
    this.smokeRadials.length = 0;
    this.scatterRadials.length = 0;
    this.sourceCount = 0;
    this.smokePrimitiveCount = 0;
    this.scatterPrimitiveCount = 0;
    this.contributingLightCount = 0;
    this.lightSpaceCulledCount = 0;
    this.lightSpaceGateActive = lightSpaceGateActive(context);

    for (const source of sources) {
      if (this.sourceCount >= MAX_FOG_SMOKE_SOURCES) break;
      if ((source.density ?? 0) <= 0 || (source.radius ?? 0) <= 0) continue;
      const radius = Math.max(source.sourceKind === 'napalm_droplet_wisp' ? 4 : 8, source.radius);
      if (source.worldX + radius < bounds.left || source.worldY + radius < bounds.top
        || source.worldX - radius > bounds.right || source.worldY - radius > bounds.bottom) {
        continue;
      }
      const lightSpaceAlpha = lightSpaceAlphaForWorldCircle(context, source.worldX, source.worldY, radius);
      if (lightSpaceAlpha <= 0.015) {
        this.lightSpaceCulledCount += 1;
        continue;
      }

      this.sourceCount += 1;
      appendSmokeRadials(this.smokeRadials, source, radius, lightSpaceAlpha);
      appendScatterRadials(this.scatterRadials, source, radius, lights, lightSpaceAlpha, () => {
        this.contributingLightCount += 1;
      });
    }

    this.smokePrimitiveCount = this.smokeRadials.length;
    this.scatterPrimitiveCount = this.scatterRadials.length;
    this.primitiveCount = this.smokePrimitiveCount + this.scatterPrimitiveCount;
    this.objectCount = this.sourceCount;
    this.status = this.primitiveCount > 0 ? 'active' : 'inactive';
  }

  render(context) {
    if (this.smokeRadials.length) context.scene.drawWorldRadialDiscs(this.smokeRadials, context.camera);
    if (this.scatterRadials.length) context.scene.drawWorldRadialLights(this.scatterRadials, context.camera);
  }

  statsFields() {
    return {
      mode: this.mode,
      fogSmokeMode: FOG_SMOKE_MODE,
      sourceCount: this.sourceCount,
      primitiveCount: this.primitiveCount,
      smokePrimitiveCount: this.smokePrimitiveCount,
      scatterPrimitiveCount: this.scatterPrimitiveCount,
      contributingLightCount: this.contributingLightCount,
      maxSourceCount: MAX_FOG_SMOKE_SOURCES,
      maxPrimitiveCount: MAX_FOG_SMOKE_PRIMITIVES + MAX_SMOKE_SCATTER_PRIMITIVES,
      lightSpaceMode: WEBGL_LIGHT_SPACE_GATE_MODE,
      lightSpaceCullingActive: this.lightSpaceGateActive,
      lightSpaceCulledCount: this.lightSpaceCulledCount
    };
  }
}

function appendSmokeRadials(radials, source, radius, lightSpaceAlpha) {
  if (radials.length >= MAX_FOG_SMOKE_PRIMITIVES) return;
  const alpha = smokeAlpha(source, lightSpaceAlpha);
  const base = smokeBaseColor(source);
  const life = Math.max(0, Math.min(1, source.life01 ?? 1));
  const softness = Math.max(0.78, Math.min(0.98, source.softness ?? 0.88));
  if (source.sourceKind === 'napalm_droplet_wisp') {
    radials.push({
      x: source.worldX,
      y: source.worldY - radius * 0.24,
      radius: radius * 0.72,
      softness: 0.94,
      color: withAlpha(base, alpha * 0.52)
    });
    if (radials.length < MAX_FOG_SMOKE_PRIMITIVES) {
      radials.push({
        x: source.worldX - radius * 0.1,
        y: source.worldY - radius * 0.82,
        radius: radius * 0.52,
        softness: 0.96,
        color: withAlpha(mixColor(base, [0.2, 0.22, 0.2, 1], 0.34), alpha * 0.3)
      });
    }
    return;
  }
  radials.push({
    x: source.worldX,
    y: source.worldY,
    radius: radius * 1.08,
    softness: Math.max(0.9, softness),
    color: withAlpha(base, alpha * 0.62)
  });

  if (radials.length >= MAX_FOG_SMOKE_PRIMITIVES) return;
  const forward = sourceForward(source);
  radials.push({
    x: source.worldX + forward.x * radius * 0.18,
    y: source.worldY + forward.y * radius * 0.18,
    radius: radius * (source.sourceKind === 'dragon_smoke_plume' ? 0.62 : 0.72),
    softness,
    color: withAlpha(mixColor(base, [0.58, 0.6, 0.52, 1], 0.16), alpha * (0.54 + life * 0.18))
  });

  if (radials.length >= MAX_FOG_SMOKE_PRIMITIVES) return;
  if (source.sourceKind === 'torch_wisp' || source.sourceKind === 'raid_flame_wisp') {
    const side = sourceSideOffset(source, radius);
    radials.push({
      x: source.worldX + side.x * 0.42,
      y: source.worldY - radius * 0.16 + side.y * 0.42,
      radius: radius * 0.42,
      softness: Math.max(0.92, softness),
      color: withAlpha(
        mixColor(base, source.sourceKind === 'raid_flame_wisp' ? [0.58, 0.42, 0.26, 1] : [0.52, 0.48, 0.38, 1], 0.18),
        alpha * 0.46
      )
    });
    return;
  }
  const side = sourceSideOffset(source, radius);
  radials.push({
    x: source.worldX + side.x,
    y: source.worldY + side.y,
    radius: radius * 0.46,
    softness: Math.max(0.9, softness - 0.03),
    color: withAlpha(mixColor(base, [0.25, 0.28, 0.25, 1], 0.18), alpha * 0.42)
  });
}

function appendScatterRadials(radials, source, radius, lights, lightSpaceAlpha, onContributingLight) {
  if (!lights.length || radials.length >= MAX_SMOKE_SCATTER_PRIMITIVES) return;
  const density = Math.max(0, Math.min(1.4, source.density ?? 1));
  const life = Math.max(0, Math.min(1, source.life01 ?? 1));
  const opacity = Math.max(0, Math.min(1.2, source.opacity ?? 1));
  let usedLights = 0;
  for (const light of lights) {
    if (usedLights >= MAX_SMOKE_SCATTER_LIGHTS || radials.length >= MAX_SMOKE_SCATTER_PRIMITIVES) break;
    const dx = light.worldX - source.worldX;
    const dy = light.worldY - source.worldY;
    const distance = Math.hypot(dx, dy);
    const influenceRadius = radius + (light.glowRadius ?? light.radius) * 0.68;
    if (distance > influenceRadius) continue;
    const overlap = 1 - distance / Math.max(1, influenceRadius);
    const intensity = Math.max(0, Math.min(1, light.glowStrength ?? light.effectiveIntensity ?? light.intensity ?? 1));
    const alpha = Math.min(0.14, Math.max(0.012, overlap * density * opacity * life * intensity * 0.13)) * lightSpaceAlpha;
    if (alpha <= 0.006) continue;
    const n = distance > 0.001 ? { x: dx / distance, y: dy / distance } : sourceForward(source);
    const warm = parseWebGLColor(light.innerColour ?? light.colour, [1, 0.64, 0.32, 1]);
    const smokeTint = smokeBaseColor(source);
    radials.push({
      x: source.worldX + n.x * radius * (0.16 + overlap * 0.2),
      y: source.worldY + n.y * radius * (0.16 + overlap * 0.2),
      radius: Math.max(9, Math.min(radius * 0.86, radius * (0.34 + overlap * 0.36))),
      softness: 0.88,
      color: withAlpha(mixColor(warm, smokeTint, 0.32), alpha)
    });
    usedLights += 1;
    onContributingLight();
  }
}

function collectContributingLights(lights) {
  return lights
    .filter((light) => light?.enabled !== false && (light.glowStrength ?? light.effectiveIntensity ?? light.intensity ?? 0) > 0 && (light.glowRadius ?? light.radius ?? 0) > 0)
    .sort((a, b) => (b.glowStrength ?? b.effectiveIntensity ?? b.intensity ?? 0) - (a.glowStrength ?? a.effectiveIntensity ?? a.intensity ?? 0))
    .slice(0, MAX_SMOKE_SCATTER_LIGHTS);
}

function smokeAlpha(source, lightSpaceAlpha) {
  const density = Math.max(0, Math.min(1.4, source.density ?? 1));
  const life = Math.max(0, Math.min(1, source.life01 ?? 1));
  const opacity = Math.max(0, Math.min(1.2, source.opacity ?? 1));
  return Math.max(0.035, Math.min(0.28, density * life * opacity * alphaScaleForKind(source.sourceKind))) * lightSpaceAlpha;
}

function smokeBaseColor(source) {
  if (source.sourceKind === 'dragon_smoke_plume') return [0.48, 0.5, 0.44, 1];
  if (source.sourceKind === 'dragon_smoke_cloud') return [0.43, 0.45, 0.41, 1];
  if (source.sourceKind === 'napalm_droplet_wisp') return [0.52, 0.4, 0.28, 1];
  if (source.sourceKind === 'napalm_smoulder') return [0.45, 0.36, 0.26, 1];
  if (source.sourceKind === 'smoulder_patch_wisp') return [0.44, 0.35, 0.28, 1];
  if (source.sourceKind === 'torch_wisp') return [0.48, 0.43, 0.34, 1];
  if (source.sourceKind === 'raid_flame_wisp') return [0.5, 0.37, 0.26, 1];
  return [0.42, 0.43, 0.39, 1];
}

function alphaScaleForKind(kind) {
  if (kind === 'dragon_smoke_plume') return 0.34;
  if (kind === 'dragon_smoke_cloud') return 0.28;
  if (kind === 'napalm_droplet_wisp') return 0.18;
  if (kind === 'napalm_smoulder') return 0.22;
  if (kind === 'smoulder_patch_wisp') return 0.24;
  if (kind === 'torch_wisp') return 0.22;
  if (kind === 'raid_flame_wisp') return 0.24;
  return 0.18;
}

function sourceForward(source) {
  const x = Number(source.forwardX);
  const y = Number(source.forwardY);
  const length = Math.hypot(x, y);
  if (length > 0.001) return { x: x / length, y: y / length };
  const angle = sourceSeedAngle(source);
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function sourceSideOffset(source, radius) {
  const forward = sourceForward(source);
  const sign = Math.sin(sourceSeedAngle(source) * 1.7) >= 0 ? 1 : -1;
  return {
    x: -forward.y * radius * 0.24 * sign,
    y: forward.x * radius * 0.24 * sign
  };
}

function sourceSeedAngle(source) {
  const text = String(source.id ?? source.sourceId ?? source.segmentIndex ?? 'smoke');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 6283) / 1000;
}

function mixColor(a, b, bWeight) {
  const t = Math.max(0, Math.min(1, bWeight));
  return [
    a[0] * (1 - t) + b[0] * t,
    a[1] * (1 - t) + b[1] * t,
    a[2] * (1 - t) + b[2] * t,
    a[3] * (1 - t) + b[3] * t
  ];
}
