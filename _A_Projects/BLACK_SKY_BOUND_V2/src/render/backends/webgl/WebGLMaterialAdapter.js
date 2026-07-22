import { parseWebGLColor, withAlpha } from './WebGLColor.js';

export const WEBGL_MATERIAL_ADAPTER_MODE = 'webgl_material_profile_uniform_adapter_v0';

export function adaptMaterialToWebGL(material, fallbackColour = [1, 1, 1, 1]) {
  const uniforms = material?.uniforms ?? {};
  const state = material?.state ?? {};
  let base = parseWebGLColor(uniforms.baseColour, fallbackColour);
  const factionTint = state.factionTint ? parseWebGLColor(state.factionTint, base) : null;
  if (factionTint) base = mixColor(base, factionTint, 0.12);
  base = mixColor(base, [0.1, 0.085, 0.065, 1], (state.burnAmount ?? 0) * 0.58);
  base = mixColor(base, [0.035, 0.026, 0.022, 1], (state.charAmount ?? 0) * 0.72);
  base = mixColor(base, [0.72, 0.12, 0.025, 1], (state.heatAmount ?? 0) * 0.18);
  base = mixColor(base, [0.08, 0.08, 0.08, 1], (state.damageAmount ?? 0) * 0.28);
  base = mixColor(base, [0.12, 0.2, 0.24, 1], (state.wetness ?? 0) * 0.18);
  const alpha = clamp01((Number(uniforms.alpha) || base[3] || 1) * (0.72 + (state.integrity ?? 1) * 0.28));
  let highlight = mixColor(base, [1, 0.92, 0.68, 1], clamp01(state.selectionHighlight ?? 0) * 0.42);
  highlight = mixColor(highlight, [1, 0.42, 0.08, 1], clamp01(state.emberAmount ?? 0) * 0.46);
  return {
    mode: WEBGL_MATERIAL_ADAPTER_MODE,
    profileId: material?.profileId ?? null,
    family: material?.family ?? null,
    shaderVariant: material?.shaderVariant ?? null,
    baseColor: withAlpha(base, alpha),
    shadowColor: withAlpha(mixColor(base, [0, 0, 0, 1], 0.5), alpha),
    highlightColor: withAlpha(highlight, alpha),
    roughness: clamp01(uniforms.roughness ?? 0.8),
    metalness: clamp01(uniforms.metalness ?? 0),
    emissive: parseWebGLColor(uniforms.emissive, [0, 0, 0, 1]),
    nightReveal: clamp01(state.nightReveal ?? 1),
    windSway: clamp01(state.windSway ?? 0),
    density: clamp01(state.density ?? 1),
    firePhase: state.firePhase ?? null,
    fireAge: Math.max(0, Number(state.fireAge) || 0),
    heatAmount: clamp01(state.heatAmount ?? 0),
    emberAmount: clamp01(state.emberAmount ?? 0),
    smokeAmount: clamp01(state.smokeAmount ?? 0),
    charAmount: clamp01(state.charAmount ?? 0)
  };
}

function mixColor(a, b, bWeight) {
  const t = clamp01(bWeight);
  return [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t, a[2] * (1 - t) + b[2] * t, a[3] * (1 - t) + b[3] * t];
}

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}
