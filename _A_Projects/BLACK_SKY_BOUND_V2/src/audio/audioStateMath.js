export function resolveOpeningMix(opening) {
  if (opening?.released !== false) return { ambience: 1, breath: 1, heartbeat: 0, muffle: 0 };
  const shellOpening = clamp01(opening.openingProgress ?? 0);
  const emergence = clamp01(opening.emergenceProgress ?? 0);
  const settling = clamp01(opening.settleProgress ?? 0);
  const exposure = Math.max(shellOpening * 0.42, clamp01(emergence * 1.32), settling);
  return {
    ambience: 0.16 + exposure * 0.84,
    breath: 0.14 + exposure * 0.86,
    heartbeat: 0.9 - exposure * 0.42,
    muffle: 0.8 * (1 - exposure)
  };
}

export function damageIntensity(amount) {
  return clamp01((Number(amount) || 0) / 44);
}

export function summarizePayload(payload) {
  const summary = {};
  for (const [key, value] of Object.entries(payload ?? {})) {
    if (typeof value === 'number') summary[key] = rounded(value);
    else if (typeof value === 'string' || typeof value === 'boolean' || value == null) summary[key] = value;
  }
  return summary;
}

function rounded(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(3)) : 0;
}

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}
