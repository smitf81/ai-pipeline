import { getFieldValue } from './fields.js';

export const DEFAULT_WHISPER_TTL = 150;
export const DEFAULT_IMPACT_TTL = 16;

export function createMythicTheatreState() {
  return {
    whispers: [],
    impacts: [],
    focus: null,
    lastFocusSignature: null
  };
}

export function registerBattlefieldWhisper(theatre, {
  text,
  tone = 'neutral',
  ttlFrames = DEFAULT_WHISPER_TTL,
  frame = 0
} = {}) {
  if (!theatre || !text) {
    return null;
  }

  const whisper = {
    id: `whisper-${frame}-${theatre.whispers.length + 1}`,
    text,
    tone,
    ttlFrames: Math.max(1, Math.floor(ttlFrames)),
    remainingFrames: Math.max(1, Math.floor(ttlFrames)),
    frame
  };

  theatre.whispers.unshift(whisper);
  theatre.whispers = theatre.whispers.slice(0, 5);
  return whisper;
}

export function registerImpactMoment(theatre, {
  type,
  x,
  y,
  strength = 1,
  ttlFrames = DEFAULT_IMPACT_TTL,
  frame = 0
} = {}) {
  if (!theatre || !type || !Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  const impact = {
    id: `impact-${frame}-${theatre.impacts.length + 1}`,
    type,
    x,
    y,
    strength: Math.max(0.2, Number(strength) || 1),
    ttlFrames: Math.max(1, Math.floor(ttlFrames)),
    remainingFrames: Math.max(1, Math.floor(ttlFrames)),
    frame
  };

  theatre.impacts.push(impact);
  return impact;
}

export function tickMythicTheatre(theatre) {
  if (!theatre) {
    return theatre;
  }

  theatre.whispers.forEach((whisper) => {
    whisper.remainingFrames = Math.max(0, whisper.remainingFrames - 1);
  });
  theatre.impacts.forEach((impact) => {
    impact.remainingFrames = Math.max(0, impact.remainingFrames - 1);
  });

  theatre.whispers = theatre.whispers.filter((whisper) => whisper.remainingFrames > 0);
  theatre.impacts = theatre.impacts.filter((impact) => impact.remainingFrames > 0);
  return theatre;
}

export function deriveDominantRegion(world) {
  const threat = world?.emergence?.pressures?.threat;
  const defensibility = world?.emergence?.pressures?.defensibility;
  const flow = world?.emergence?.pressures?.flow;
  if (!threat || !defensibility || !flow) {
    return null;
  }

  let best = null;
  for (let y = 0; y < threat.height; y += 1) {
    for (let x = 0; x < threat.width; x += 1) {
      const threatValue = getFieldValue(threat, x, y) ?? 0;
      const defensibilityValue = getFieldValue(defensibility, x, y) ?? 0;
      const flowValue = getFieldValue(flow, x, y) ?? 0;
      const score = threatValue * 0.5 + defensibilityValue * 0.35 + flowValue * 0.15;

      if (!best || score > best.score) {
        best = {
          x,
          y,
          score,
          threatValue,
          defensibilityValue,
          flowValue
        };
      }
    }
  }

  if (!best || best.score < 0.2) {
    return null;
  }

  const mood = best.threatValue >= best.defensibilityValue
    ? 'violent'
    : 'entrenched';

  return {
    ...best,
    mood,
    signature: `${best.x},${best.y}:${mood}:${best.score.toFixed(2)}`
  };
}
