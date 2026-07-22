export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function distanceSq(a, b) {
  const dx = a.x - b.x;
  const yKey = 'y' in a ? 'y' : 'z';
  const dy = (a[yKey] ?? 0) - (b[yKey] ?? 0);
  return dx * dx + dy * dy;
}

export function rectsIntersect(a, b) {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}
