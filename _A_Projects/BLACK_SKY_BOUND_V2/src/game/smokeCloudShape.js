export function resolveSmokeCloudShape(transform, smoke, lifetime) {
  const age = Math.max(0, lifetime?.age ?? 0);
  const duration = lifetime?.duration ?? null;
  const life01 = normalisedLife(age, duration);
  return {
    x: transform.x + (smoke.driftX ?? 0) * age,
    y: transform.y + (smoke.driftY ?? 0) * age,
    radius: Math.max(0.01, (smoke.radius ?? 0) + age * (smoke.expandRate ?? 0)),
    age,
    lifetime: duration,
    life01,
    density: (smoke.density ?? 1) * Math.pow(life01, smoke.fadeExponent ?? 1),
    opacity: (smoke.opacity ?? 1) * Math.pow(life01, smoke.fadeExponent ?? 1)
  };
}

export function normalisedLife(age, lifetime) {
  if (!Number.isFinite(lifetime) || lifetime <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - age / lifetime));
}
