import { createField, getFieldValue, setFieldValue } from './fields.js';

export const DIRECTOR_PHASE_ORDER = ['blackout', 'stampede', 'siege_doctrine', 'collapse'];

export const DIRECTOR_PHASE_DEFAULTS = {
  blackout: { durationFrames: 180 },
  stampede: { durationFrames: 160 },
  siege_doctrine: { durationFrames: 220 },
  collapse: { durationFrames: 200 }
};

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export function createDirectorState(width, height) {
  return {
    activePhase: null,
    nextPhaseIndex: 0,
    cooldownFrames: 120,
    autoTriggerEveryFrames: 360,
    lastAutoTriggerFrame: -999,
    collapseRegion: createDirectorRegion(width, height, 0)
  };
}

function createDirectorRegion(width, height, index) {
  const centerX = Math.floor((width * (0.22 + (index % 3) * 0.26)));
  const centerY = Math.floor((height * (0.25 + (Math.floor(index / 2) % 3) * 0.22)));
  const radius = Math.max(2, Math.floor(Math.min(width, height) * 0.22));
  return { x: Math.max(0, Math.min(width - 1, centerX)), y: Math.max(0, Math.min(height - 1, centerY)), radius };
}

export function triggerDirectorPhase(director, map, type, origin = 'manual') {
  if (!director || !DIRECTOR_PHASE_DEFAULTS[type]) {
    return null;
  }

  const durationFrames = DIRECTOR_PHASE_DEFAULTS[type].durationFrames;
  director.activePhase = {
    type,
    durationFrames,
    remainingFrames: durationFrames,
    origin,
    startedAtFrame: null
  };

  if (type === 'collapse') {
    director.collapseRegion = createDirectorRegion(map.width, map.height, director.nextPhaseIndex + director.cooldownFrames);
  }

  return director.activePhase;
}

export function tickDirectorPhase(director, map, frame) {
  if (!director) {
    return null;
  }

  if (director.activePhase) {
    if (director.activePhase.startedAtFrame == null) {
      director.activePhase.startedAtFrame = frame;
    }
    director.activePhase.remainingFrames = Math.max(0, director.activePhase.remainingFrames - 1);
    if (director.activePhase.remainingFrames === 0) {
      director.activePhase = null;
      director.cooldownFrames = 90;
    }
    return director.activePhase;
  }

  director.cooldownFrames = Math.max(0, director.cooldownFrames - 1);
  const canAutoTrigger = director.cooldownFrames === 0 && frame - director.lastAutoTriggerFrame >= director.autoTriggerEveryFrames;
  if (!canAutoTrigger) {
    return null;
  }

  const phaseType = DIRECTOR_PHASE_ORDER[director.nextPhaseIndex % DIRECTOR_PHASE_ORDER.length];
  director.nextPhaseIndex += 1;
  director.lastAutoTriggerFrame = frame;
  return triggerDirectorPhase(director, map, phaseType, 'auto');
}

export function applyDirectorPhaseToFields(fields, world, frame) {
  const phase = world?.emergence?.director?.activePhase;
  if (!phase) {
    return fields;
  }

  const life = clamp01((phase.remainingFrames ?? 0) / Math.max(1, phase.durationFrames ?? 1));
  const map = world.map;

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const cover = getFieldValue(fields.cover, x, y) ?? 0;
      const traversal = getFieldValue(fields.traversal, x, y) ?? 0;
      const visibility = getFieldValue(fields.visibility, x, y) ?? 0;

      if (phase.type === 'blackout') {
        const localWeight = 0.35 + (1 - Math.hypot(x - Math.floor(map.width / 2), y - Math.floor(map.height / 2)) / Math.max(map.width, map.height)) * 0.65;
        setFieldValue(fields.cover, x, y, clamp01(cover + 0.08 * life * localWeight));
        setFieldValue(fields.visibility, x, y, clamp01(visibility * (0.52 + 0.28 * (1 - life))));
        setFieldValue(fields.traversal, x, y, clamp01(traversal - 0.04 * life * localWeight));
      } else if (phase.type === 'stampede') {
        const progress = ((frame - (phase.startedAtFrame ?? frame)) % Math.max(1, map.width + map.height)) / Math.max(1, map.width + map.height);
        const bandX = progress * (map.width - 1);
        const distance = Math.abs(x - bandX);
        const intensity = clamp01(1 - distance / Math.max(1.5, map.width * 0.18));
        if (intensity > 0) {
          setFieldValue(fields.traversal, x, y, clamp01(traversal + 0.25 * intensity * life));
          setFieldValue(fields.cover, x, y, clamp01(cover - 0.14 * intensity * life));
          setFieldValue(fields.visibility, x, y, clamp01(visibility + 0.2 * intensity * life));
        }
      } else if (phase.type === 'siege_doctrine') {
        const nearestAnchorDistance = getNearestAnchorDistance(world, x, y);
        const anchorWeight = clamp01(1 - nearestAnchorDistance / 6);
        setFieldValue(fields.cover, x, y, clamp01(cover + 0.18 * anchorWeight * life));
        setFieldValue(fields.traversal, x, y, clamp01(traversal - 0.12 * anchorWeight * life));
        setFieldValue(fields.visibility, x, y, clamp01(visibility * (1 - 0.18 * anchorWeight * life)));
      } else if (phase.type === 'collapse') {
        const region = world.emergence?.director?.collapseRegion;
        const distance = Math.hypot(x - region.x, y - region.y);
        const regionWeight = clamp01(1 - distance / Math.max(1, region.radius));
        if (regionWeight > 0) {
          setFieldValue(fields.cover, x, y, clamp01(cover - 0.32 * regionWeight * life));
          setFieldValue(fields.traversal, x, y, clamp01(traversal + 0.28 * regionWeight * life));
          setFieldValue(fields.visibility, x, y, clamp01(visibility + 0.22 * regionWeight * life));
        }
      }
    }
  }

  return fields;
}

function getNearestAnchorDistance(world, x, y) {
  const anchors = world?.store?.buildings ?? [];
  if (!anchors.length) {
    return 999;
  }

  return anchors.reduce((closest, anchor) => Math.min(closest, Math.hypot(x - anchor.x, y - anchor.y)), 999);
}

export function buildDirectorPressureFields(fields, world, frame) {
  const pressure = {
    defensibility: createField(fields.cover.width, fields.cover.height, 0),
    flow: createField(fields.cover.width, fields.cover.height, 0),
    threat: createField(fields.cover.width, fields.cover.height, 0)
  };

  const phase = world?.emergence?.director?.activePhase;
  if (!phase) {
    return pressure;
  }

  const life = clamp01((phase.remainingFrames ?? 0) / Math.max(1, phase.durationFrames ?? 1));
  for (let y = 0; y < fields.cover.height; y += 1) {
    for (let x = 0; x < fields.cover.width; x += 1) {
      if (phase.type === 'blackout') {
        setFieldValue(pressure.flow, x, y, 0.1 * life);
      } else if (phase.type === 'stampede') {
        const progress = ((frame - (phase.startedAtFrame ?? frame)) % Math.max(1, fields.cover.width + fields.cover.height)) / Math.max(1, fields.cover.width + fields.cover.height);
        const bandX = progress * (fields.cover.width - 1);
        const intensity = clamp01(1 - Math.abs(x - bandX) / Math.max(1.5, fields.cover.width * 0.2));
        setFieldValue(pressure.threat, x, y, intensity * 0.9 * life);
        setFieldValue(pressure.defensibility, x, y, -intensity * 0.35 * life);
      } else if (phase.type === 'siege_doctrine') {
        const anchorWeight = clamp01(1 - getNearestAnchorDistance(world, x, y) / 6);
        setFieldValue(pressure.defensibility, x, y, anchorWeight * 0.95 * life);
        setFieldValue(pressure.threat, x, y, -anchorWeight * 0.15 * life);
      } else if (phase.type === 'collapse') {
        const region = world.emergence?.director?.collapseRegion;
        const regionWeight = clamp01(1 - Math.hypot(x - region.x, y - region.y) / Math.max(1, region.radius));
        setFieldValue(pressure.threat, x, y, regionWeight * 1.1 * life);
        setFieldValue(pressure.defensibility, x, y, -regionWeight * 0.6 * life);
      }
    }
  }

  return pressure;
}

export function summarizeDirectorPhase(director) {
  if (!director?.activePhase) {
    return { label: 'idle', active: null };
  }

  const phase = director.activePhase;
  return {
    label: `${phase.type} (${phase.remainingFrames}f)` ,
    active: {
      type: phase.type,
      remainingFrames: phase.remainingFrames,
      durationFrames: phase.durationFrames,
      origin: phase.origin
    }
  };
}
