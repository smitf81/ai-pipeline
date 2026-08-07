import { parseWebGLColor, withAlpha } from './WebGLColor.js';

export const EMITTER_LIGHT_COMPOSITE_MODE = 'split_additive_illumination_reveal_glow_core_v1';

export function buildEmitterLightInfluences(light, profile, composite) {
  const outer = parseWebGLColor(light.colour, [1, 0.5, 0.22, 1]);
  const inner = parseWebGLColor(light.innerColour, [1, 0.76, 0.38, 1]);
  const revealNeutral = parseWebGLColor(profile.emitterRevealColour ?? 'rgba(226, 220, 202, 1)', [0.89, 0.86, 0.79, 1]);
  const revealWarmth = clampRange(light.revealWarmth ?? 0.1, 0, 0.34);
  const revealTint = mixColor(revealNeutral, mixColor(outer, inner, 0.2), revealWarmth);
  const warmCore = mixColor(inner, outer, 0.34);
  const revealStrength = clamp01(light.revealStrength ?? light.effectiveIntensity ?? light.intensity ?? 0);
  const glowStrength = clamp01(light.glowStrength ?? light.effectiveIntensity ?? light.intensity ?? 0);
  const coreStrength = clamp01(light.coreStrength ?? light.effectiveIntensity ?? light.intensity ?? 0);
  const alphaScale = clampRange(light.influenceAlphaScale ?? 1, 0, 2);
  const profileReveal = clamp01(profile.lightRevealStrength ?? 0.9);
  const bloom = clamp01(profile.warmBloomOpacity ?? 0.2);
  const softness = Math.max(0.18, Math.min(0.97, light.softness ?? 0.72));
  const revealRadius = Math.max(8, light.revealRadius ?? light.radius ?? 1) * composite.haloRadiusScale;
  const glowRadius = Math.max(5, light.glowRadius ?? light.radius ?? revealRadius * 0.46) * (1 + bloom * 0.08);
  const coreRadius = Math.max(2.4, light.coreRadius ?? glowRadius * 0.16);
  return [
    {
      role: 'reveal',
      x: light.worldX,
      y: light.worldY,
      radius: revealRadius,
      softness: Math.max(0.86, softness),
      color: withAlpha(revealTint, contributionAlpha(revealStrength * profileReveal * 0.72 * composite.haloBlendScale * alphaScale, 0.78))
    },
    {
      role: 'glow',
      x: light.worldX,
      y: light.worldY,
      radius: glowRadius,
      softness: Math.max(0.72, softness),
      color: withAlpha(mixColor(outer, inner, 0.1), contributionAlpha(glowStrength * profileReveal * (0.34 + bloom * 0.16) * composite.outerBlendScale * alphaScale, 0.42))
    },
    {
      role: 'core',
      x: light.worldX,
      y: light.worldY,
      radius: coreRadius,
      softness: Math.max(0.34, softness * 0.52),
      color: withAlpha(warmCore, contributionAlpha(coreStrength * profileReveal * (0.4 + bloom * 0.18) * composite.coreBlendScale * alphaScale, 0.46))
    }
  ];
}

export function splitEmitterInfluences(influences) {
  return {
    reveal: influences.filter((item) => item.role === 'reveal'),
    glow: influences.filter((item) => item.role === 'glow'),
    core: influences.filter((item) => item.role === 'core')
  };
}

function contributionAlpha(value, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0.001) return 0;
  return Math.max(0.004, Math.min(max, numeric));
}

function mixColor(a, b, bWeight) {
  const t = clamp01(bWeight);
  return [
    a[0] * (1 - t) + b[0] * t,
    a[1] * (1 - t) + b[1] * t,
    a[2] * (1 - t) + b[2] * t,
    a[3] * (1 - t) + b[3] * t
  ];
}

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function clampRange(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}
