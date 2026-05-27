import { createAttentionMarker } from './aiStateMachine.js';

export const SOUND_MODEL = Object.freeze({
  maxEvents: 72,
  profiles: Object.freeze({
    footstep: Object.freeze({
      label: 'Footsteps',
      audibleRadiusTiles: 2.6,
      strength: 0.32,
      durationTicks: 3
    }),
    stone_impact: Object.freeze({
      label: 'Stone landing',
      audibleRadiusTiles: 8,
      strength: 0.86,
      durationTicks: 11
    }),
    arrow_impact: Object.freeze({
      label: 'Arrow landing',
      audibleRadiusTiles: 3.7,
      strength: 0.43,
      durationTicks: 5
    }),
    melee_attack: Object.freeze({
      label: 'Combat strike',
      audibleRadiusTiles: 5.4,
      strength: 0.65,
      durationTicks: 5
    })
  })
});

export function createSoundEvent(args = {}) {
  const tick = Math.max(0, Math.floor(Number(args.tick) || 0));
  const kind = Object.prototype.hasOwnProperty.call(SOUND_MODEL.profiles, args.kind)
    ? args.kind
    : 'footstep';
  const profile = SOUND_MODEL.profiles[kind];
  const durationTicks = Math.max(1, Math.floor(Number(args.durationTicks) || profile.durationTicks));
  const position = normalisePosition(args.position);
  return {
    id: typeof args.id === 'string' ? args.id : `sound_${kind}_${tick}_${Math.round(position.x)}_${Math.round(position.y)}`,
    kind,
    label: typeof args.label === 'string' ? args.label : profile.label,
    sourceId: typeof args.sourceId === 'string' ? args.sourceId : null,
    sourceIntentId: typeof args.sourceIntentId === 'string' ? args.sourceIntentId : null,
    sourceFactionId: typeof args.sourceFactionId === 'string' ? args.sourceFactionId : null,
    position,
    audibleRadiusTiles: round3(positiveNumber(args.audibleRadiusTiles, profile.audibleRadiusTiles)),
    strength: round3(clamp01(Number.isFinite(args.strength) ? args.strength : profile.strength)),
    createdAtTick: tick,
    expiresAtTick: tick + durationTicks
  };
}

export function normaliseSoundEvents(events = [], tick = 0) {
  const safeTick = Math.max(0, Math.floor(Number(tick) || 0));
  return (Array.isArray(events) ? events : [])
    .filter(Boolean)
    .map((event) => createSoundEvent({
      ...event,
      tick: event.createdAtTick,
      durationTicks: Math.max(1, (event.expiresAtTick ?? safeTick + 1) - (event.createdAtTick ?? safeTick))
    }))
    .filter((event) => event.expiresAtTick >= safeTick)
    .slice(-SOUND_MODEL.maxEvents);
}

export function appendSoundEvent(game, args = {}) {
  const event = createSoundEvent({ ...args, tick: args.tick ?? game?.tick ?? 0 });
  game.soundEvents = normaliseSoundEvents([...(game.soundEvents ?? []), event], game?.tick ?? 0);
  const marker = createAttentionMarker({
    id: `attention_${event.id}`,
    type: 'sound',
    factionId: event.sourceFactionId,
    position: event.position,
    strength: event.strength,
    audibleRadiusTiles: event.audibleRadiusTiles,
    createdAtTick: event.createdAtTick,
    durationTicks: Math.max(1, event.expiresAtTick - event.createdAtTick),
    sourceId: event.sourceId,
    sourceIntentId: event.sourceIntentId,
    label: event.label,
    noiseKind: event.kind
  });
  game.ai = {
    ...(game.ai ?? {}),
    attentionMarkers: [...(game.ai?.attentionMarkers ?? []), marker]
  };
  return event;
}

export function summarizeSoundEvents(game = {}) {
  const events = normaliseSoundEvents(game.soundEvents, game.tick ?? 0);
  return {
    active: events.length,
    recent: events.slice(-8)
  };
}

function normalisePosition(position = {}) {
  return {
    x: round3(Number(position.x) || 0),
    y: round3(Number(position.y) || 0)
  };
}

function positiveNumber(value, fallback) {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function round3(value) {
  return Math.round(Number(value) * 1000) / 1000;
}
