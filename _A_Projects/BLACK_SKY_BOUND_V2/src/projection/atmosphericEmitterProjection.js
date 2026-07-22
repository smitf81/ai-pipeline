export const ATMOSPHERIC_EMITTER_PROJECTION_MODE = 'capped_screen_space_warm_emitter_influence_v0';

const WARM_SOURCE_PATTERN = /(torch|flame|fire|napalm|ember|smoulder|smolder|spark)/i;
const COLD_SCENE_PATTERN = /(moonlight|lightning|storm)/i;

export function buildAtmosphericEmitterProjection({ lights = [], camera = null, maxEmitters = 12 } = {}) {
  try {
    return buildAtmosphericEmitterProjectionUnsafe(lights, camera, maxEmitters);
  } catch {
    return [];
  }
}

function buildAtmosphericEmitterProjectionUnsafe(lights, camera, maxEmitters) {
  const max = clampInteger(maxEmitters, 0, 16, 0);
  if (!Array.isArray(lights) || !camera || max <= 0) return [];
  const viewportW = finite(camera.viewportW, 1280);
  const viewportH = finite(camera.viewportH, 720);
  const zoom = Math.max(0.001, finite(camera.zoom, 1));
  const candidates = [];
  for (const light of lights) {
    const emitter = projectWarmEmitter(light, camera, viewportW, viewportH, zoom);
    if (emitter) candidates.push(emitter);
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, max).map(({ score, ...emitter }) => emitter);
}

function projectWarmEmitter(light, camera, viewportW, viewportH, zoom) {
  if (!light || light.enabled === false) return null;
  const sourceKind = String(light.sourceKind ?? '');
  if (COLD_SCENE_PATTERN.test(sourceKind) || light.sourceAnchor?.type === 'scene_light') return null;
  const intensity = clamp01(light.glowStrength ?? light.effectiveIntensity ?? light.intensity ?? 0);
  const warmth = resolveWarmth(light, sourceKind);
  const worldX = finite(light.worldX, NaN);
  const worldY = finite(light.worldY, NaN);
  const radiusWorld = Math.max(1, finite(light.glowRadius ?? light.radius, 0));
  if (!Number.isFinite(worldX) || !Number.isFinite(worldY) || intensity <= 0.015 || warmth < 0.28) return null;
  const screenX = (worldX - camera.x) * zoom + viewportW * 0.5;
  const screenY = (worldY - camera.y) * zoom + viewportH * 0.5;
  const screenRadius = clampNumber(radiusWorld * zoom * 0.42, 28, 190, 64);
  if (screenX < -screenRadius || screenX > viewportW + screenRadius || screenY < -screenRadius || screenY > viewportH + screenRadius) return null;
  const centerBias = 1 - clamp01(Math.hypot(screenX - viewportW * 0.5, screenY - viewportH * 0.5) / Math.hypot(viewportW, viewportH));
  return {
    classification: 'renderer_neutral_atmosphere_emitter_influence_projection',
    mode: ATMOSPHERIC_EMITTER_PROJECTION_MODE,
    id: light.id ?? `${sourceKind}:${round2(screenX)}:${round2(screenY)}`,
    sourceId: light.sourceEntity ?? light.sourceAnchor?.id ?? light.id ?? null,
    sourceKind: sourceKind || 'warm_light',
    sourceType: light.sourceAnchor?.type ?? (light.sceneLight ? 'scene_object_light' : 'local_light'),
    screenX: round2(screenX),
    screenY: round2(screenY),
    screenRadius: round2(screenRadius),
    intensity: round3(intensity),
    warmth: round3(warmth),
    colour: light.colour ?? 'rgba(255,154,72,0.85)',
    score: intensity * warmth * (0.72 + centerBias * 0.28) * Math.sqrt(screenRadius)
  };
}

function resolveWarmth(light, sourceKind) {
  const keywordWarmth = WARM_SOURCE_PATTERN.test(sourceKind) ? 0.86 : 0;
  return Math.max(keywordWarmth, colourWarmth(light.colour), colourWarmth(light.innerColour) * 0.82);
}

function colourWarmth(value) {
  const channels = parseColour(value);
  if (!channels) return 0;
  const [r, g, b] = channels;
  const warmBias = (r - b * 0.68) / 255;
  const emberBias = (r + g * 0.32 - b * 1.18) / 330;
  return clamp01(Math.max(warmBias, emberBias));
}

function parseColour(value) {
  if (typeof value !== 'string') return null;
  const rgba = value.match(/rgba?\(([^)]+)\)/i);
  if (rgba) {
    const parts = rgba[1].split(',').map((part) => Number.parseFloat(part.trim()));
    return parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite) ? parts.slice(0, 3) : null;
  }
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i);
  if (!hex) return null;
  const numeric = Number.parseInt(hex[1], 16);
  return [(numeric >> 16) & 255, (numeric >> 8) & 255, numeric & 255];
}

function finite(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
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

function round2(value) {
  return Math.round(value * 100) / 100;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}
