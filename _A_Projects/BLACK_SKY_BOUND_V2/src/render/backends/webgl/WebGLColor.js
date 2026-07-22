export function parseWebGLColor(value, fallback = [1, 1, 1, 1]) {
  if (Array.isArray(value) && value.length >= 3) {
    return [
      clamp01(value[0]),
      clamp01(value[1]),
      clamp01(value[2]),
      clamp01(value[3] ?? 1)
    ];
  }
  if (typeof value !== 'string') return fallback;
  if (value.startsWith('#')) return parseHex(value, fallback);
  if (value.startsWith('rgba(')) return parseRgb(value.slice(5, -1), fallback, true);
  if (value.startsWith('rgb(')) return parseRgb(value.slice(4, -1), fallback, false);
  return fallback;
}

export function withAlpha(color, alpha) {
  return [color[0], color[1], color[2], clamp01(alpha)];
}

function parseHex(value, fallback) {
  const text = value.slice(1);
  if (![3, 6].includes(text.length)) return fallback;
  const expanded = text.length === 3
    ? text.split('').map((part) => `${part}${part}`).join('')
    : text;
  const number = Number.parseInt(expanded, 16);
  if (!Number.isFinite(number)) return fallback;
  return [
    ((number >> 16) & 255) / 255,
    ((number >> 8) & 255) / 255,
    (number & 255) / 255,
    1
  ];
}

function parseRgb(value, fallback, hasAlpha) {
  const parts = value.split(',').map((part) => Number(part.trim()));
  if (parts.length < 3 || parts.some((part) => !Number.isFinite(part))) return fallback;
  return [
    clamp01(parts[0] / 255),
    clamp01(parts[1] / 255),
    clamp01(parts[2] / 255),
    hasAlpha ? clamp01(parts[3] ?? 1) : 1
  ];
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
