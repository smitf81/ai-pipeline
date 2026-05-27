import { createField, getFieldValue, setFieldValue } from './fields.js';

export const WORLD_EVENT_DEFAULTS = {
  breach: {
    durationFrames: 180,
    radius: 4,
    strength: 1,
    field: { traversalDelta: -0.26, coverDelta: -0.18, visibilityDelta: 0.22 },
    pressure: { flow: 0.8, defensibility: -0.45, threat: 0.2 }
  },
  fortify: {
    durationFrames: 240,
    radius: 3,
    strength: 1,
    field: { traversalDelta: 0.08, coverDelta: 0.28, visibilityDelta: -0.2 },
    pressure: { flow: -0.12, defensibility: 0.85, threat: -0.08 }
  },
  panic: {
    durationFrames: 150,
    radius: 3,
    strength: 1,
    field: { traversalDelta: 0.12, coverDelta: -0.12, visibilityDelta: 0.14 },
    pressure: { flow: 0.16, defensibility: -0.55, threat: 1 }
  }
};

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export function createWorldEventsState() {
  return {
    nextId: 1,
    active: []
  };
}

export function triggerWorldEvent(worldEvents, spec) {
  if (!worldEvents || !spec || !WORLD_EVENT_DEFAULTS[spec.type]) {
    return null;
  }

  const defaults = WORLD_EVENT_DEFAULTS[spec.type];
  const durationFrames = Math.max(1, Math.floor(Number(spec.durationFrames ?? defaults.durationFrames) || defaults.durationFrames));
  const event = {
    id: spec.id ?? `we-${worldEvents.nextId}`,
    type: spec.type,
    x: Math.floor(Number(spec.x) || 0),
    y: Math.floor(Number(spec.y) || 0),
    radius: Math.max(1, Number(spec.radius ?? defaults.radius) || defaults.radius),
    strength: Math.max(0.1, Number(spec.strength ?? defaults.strength) || defaults.strength),
    durationFrames,
    remainingFrames: durationFrames
  };

  worldEvents.nextId += 1;
  worldEvents.active.push(event);
  return event;
}

export function tickWorldEvents(worldEvents) {
  if (!worldEvents?.active?.length) {
    return worldEvents;
  }

  worldEvents.active.forEach((event) => {
    event.remainingFrames = Math.max(0, Number(event.remainingFrames ?? 0) - 1);
  });
  worldEvents.active = worldEvents.active.filter((event) => event.remainingFrames > 0);
  return worldEvents;
}

function getEventScale(event) {
  const duration = Math.max(1, Number(event.durationFrames ?? 1));
  const remaining = Math.max(0, Number(event.remainingFrames ?? 0));
  return clamp01(remaining / duration) * Math.max(0, Number(event.strength ?? 1));
}

function getRadialStrength(event, x, y) {
  const radius = Math.max(1, Number(event.radius ?? 1));
  const distance = Math.hypot(x - event.x, y - event.y);
  if (distance > radius) {
    return 0;
  }

  const radialFalloff = clamp01(1 - distance / radius);
  if (event.type !== 'breach') {
    return radialFalloff;
  }

  const laneWidth = Math.max(0.8, radius * 0.4);
  const axisDistance = Math.min(Math.abs(x - event.x), Math.abs(y - event.y));
  const laneBoost = clamp01(1 - axisDistance / laneWidth);
  return clamp01(radialFalloff * 0.6 + laneBoost * 0.4);
}

export function applyWorldEventsToFields(fields, worldEvents) {
  if (!fields || !worldEvents?.active?.length) {
    return fields;
  }

  worldEvents.active.forEach((event) => {
    const defaults = WORLD_EVENT_DEFAULTS[event.type];
    if (!defaults) {
      return;
    }

    const lifeScale = getEventScale(event);

    for (let y = 0; y < fields.cover.height; y += 1) {
      for (let x = 0; x < fields.cover.width; x += 1) {
        const radial = getRadialStrength(event, x, y);
        if (radial <= 0) {
          continue;
        }

        const totalScale = radial * lifeScale;
        setFieldValue(fields.cover, x, y, clamp01((getFieldValue(fields.cover, x, y) ?? 0) + defaults.field.coverDelta * totalScale));
        setFieldValue(fields.traversal, x, y, clamp01((getFieldValue(fields.traversal, x, y) ?? 0) + defaults.field.traversalDelta * totalScale));
        setFieldValue(fields.visibility, x, y, clamp01((getFieldValue(fields.visibility, x, y) ?? 0) + defaults.field.visibilityDelta * totalScale));
      }
    }
  });

  return fields;
}

export function buildWorldEventPressureFields(fields, worldEvents) {
  const pressure = {
    defensibility: createField(fields.cover.width, fields.cover.height, 0),
    flow: createField(fields.cover.width, fields.cover.height, 0),
    threat: createField(fields.cover.width, fields.cover.height, 0)
  };

  if (!worldEvents?.active?.length) {
    return pressure;
  }

  worldEvents.active.forEach((event) => {
    const defaults = WORLD_EVENT_DEFAULTS[event.type];
    if (!defaults) {
      return;
    }

    const lifeScale = getEventScale(event);
    for (let y = 0; y < pressure.flow.height; y += 1) {
      for (let x = 0; x < pressure.flow.width; x += 1) {
        const radial = getRadialStrength(event, x, y);
        if (radial <= 0) {
          continue;
        }

        const totalScale = radial * lifeScale;
        setFieldValue(pressure.flow, x, y, (getFieldValue(pressure.flow, x, y) ?? 0) + defaults.pressure.flow * totalScale);
        setFieldValue(pressure.defensibility, x, y, (getFieldValue(pressure.defensibility, x, y) ?? 0) + defaults.pressure.defensibility * totalScale);
        setFieldValue(pressure.threat, x, y, (getFieldValue(pressure.threat, x, y) ?? 0) + defaults.pressure.threat * totalScale);
      }
    }
  });

  return pressure;
}

export function summarizeWorldEvents(worldEvents) {
  return (worldEvents?.active ?? []).map((event) => ({
    id: event.id,
    type: event.type,
    x: event.x,
    y: event.y,
    radius: event.radius,
    remainingFrames: event.remainingFrames,
    durationFrames: event.durationFrames,
    lifeRatio: Number((Math.max(0, event.remainingFrames) / Math.max(1, event.durationFrames)).toFixed(3))
  }));
}
