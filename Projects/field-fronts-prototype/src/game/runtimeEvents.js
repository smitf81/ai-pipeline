import {
  buildRuntimeSchedulerDefaultsFromCadenceRegistry,
  getCadenceSystemContract,
  summarizeCadenceRegistry
} from './cadenceRegistry.js';

export const RUNTIME_EVENTS = Object.freeze({
  constructionJobCreated: 'construction:job_created',
  constructionJobCompleted: 'construction:job_completed',
  constructionJobCancelled: 'construction:job_cancelled',
  economySpent: 'economy:spent',
  logisticsResourceRequested: 'logistics:resource_requested',
  logisticsResourceDelivered: 'logistics:resource_delivered',
  squadSpawned: 'squad:spawned',
  entityDied: 'entity:died',
  stanceChanged: 'stance:changed',
  movementOrderIssued: 'movement:order_issued',
  movementBlocked: 'movement:blocked',
  movementArrived: 'movement:arrived',
  structureCompleted: 'structure:completed',
  structureRemoved: 'structure:removed',
  structureNavChanged: 'structure:nav_changed',
  navChanged: 'nav:changed',
  runtimeSystemScheduled: 'runtime:system_scheduled',
  aiIntentIssued: 'ai:intent_issued',
  aiIntentResponse: 'ai:intent_response',
  aiAttentionMarker: 'ai:attention_marker',
  aiAppraisalRequested: 'ai:appraisal_requested'
});

export const RUNTIME_EVENT_HISTORY_LIMIT = 96;
export const RUNTIME_EVENT_QUEUE_LIMIT = 64;
export const RUNTIME_EVENT_DRAIN_LIMIT = 48;

export const RUNTIME_DIRTY_DEFAULTS = Object.freeze({
  nav: false,
  economy: false,
  logistics: false,
  construction: false,
  combatTargets: false,
  ai: false,
  fields: false,
  renderUi: false
});

export const RUNTIME_VERSION_KEYS = Object.freeze([
  'map',
  'structures',
  'nav',
  'economy',
  'squads',
  'construction',
  'logistics',
  'combatTargets',
  'ai',
  'fields',
  'renderUi'
]);

export const RUNTIME_SCHEDULER_DEFAULTS = buildRuntimeSchedulerDefaultsFromCadenceRegistry();

export const RUNTIME_EVENT_IMPACTS = Object.freeze({
  [RUNTIME_EVENTS.constructionJobCreated]: {
    dirty: ['construction', 'logistics', 'nav', 'combatTargets', 'renderUi'],
    versions: ['construction', 'logistics', 'structures', 'nav', 'combatTargets', 'renderUi']
  },
  [RUNTIME_EVENTS.constructionJobCompleted]: {
    dirty: ['construction', 'logistics', 'nav', 'combatTargets', 'fields', 'renderUi'],
    versions: ['construction', 'logistics', 'structures', 'nav', 'combatTargets', 'fields', 'renderUi']
  },
  [RUNTIME_EVENTS.economySpent]: {
    dirty: ['economy', 'logistics', 'renderUi'],
    versions: ['economy', 'logistics', 'renderUi']
  },
  [RUNTIME_EVENTS.squadSpawned]: {
    dirty: ['logistics', 'combatTargets', 'fields', 'renderUi'],
    versions: ['squads', 'logistics', 'combatTargets', 'fields', 'renderUi']
  },
  [RUNTIME_EVENTS.entityDied]: {
    dirty: ['nav', 'logistics', 'combatTargets', 'fields', 'renderUi'],
    versions: ['squads', 'structures', 'nav', 'logistics', 'combatTargets', 'fields', 'renderUi']
  },
  [RUNTIME_EVENTS.movementOrderIssued]: {
    dirty: ['fields', 'combatTargets', 'renderUi'],
    versions: ['squads', 'fields', 'combatTargets', 'renderUi']
  },
  [RUNTIME_EVENTS.stanceChanged]: {
    dirty: ['fields', 'combatTargets', 'renderUi'],
    versions: ['fields', 'combatTargets', 'renderUi']
  },
  [RUNTIME_EVENTS.structureNavChanged]: {
    dirty: ['nav', 'combatTargets', 'fields', 'renderUi'],
    versions: ['structures', 'nav', 'combatTargets', 'fields', 'renderUi']
  },
  [RUNTIME_EVENTS.aiIntentIssued]: {
    dirty: ['ai', 'fields', 'renderUi'],
    versions: ['ai', 'fields', 'renderUi']
  },
  [RUNTIME_EVENTS.aiIntentResponse]: {
    dirty: ['ai', 'renderUi'],
    versions: ['ai', 'renderUi']
  },
  [RUNTIME_EVENTS.aiAttentionMarker]: {
    dirty: ['ai', 'fields', 'renderUi'],
    versions: ['ai', 'fields', 'renderUi']
  },
  [RUNTIME_EVENTS.aiAppraisalRequested]: {
    dirty: ['ai', 'fields'],
    versions: ['ai', 'fields']
  }
});

export function createRuntimeDirtyState(overrides = {}) {
  return Object.fromEntries(Object.entries(RUNTIME_DIRTY_DEFAULTS).map(([key, fallback]) => [
    key,
    Boolean(overrides?.[key] ?? fallback)
  ]));
}

export function createRuntimeVersions(map = null, overrides = {}) {
  return Object.fromEntries(RUNTIME_VERSION_KEYS.map((key) => {
    const fallback = key === 'map' ? Math.max(0, Number(map?.revision) || 0) : 0;
    const value = Number(overrides?.[key]);
    return [key, Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback];
  }));
}

export function createRuntimeScheduler(overrides = {}, tick = 0) {
  return Object.fromEntries(Object.entries(RUNTIME_SCHEDULER_DEFAULTS).map(([id, defaults]) => {
    const existing = overrides?.[id] ?? {};
    const everyTicks = Math.max(1, Math.floor(Number(existing.everyTicks ?? defaults.everyTicks) || defaults.everyTicks));
    const nextTick = Math.max(0, Math.floor(Number(existing.nextTick ?? defaults.nextTick ?? tick) || 0));
    return [id, {
      everyTicks,
      nextTick,
      lastRunTick: Number.isInteger(existing.lastRunTick) ? Math.max(0, existing.lastRunTick) : null,
      runCount: Math.max(0, Math.floor(Number(existing.runCount) || 0)),
      versionKeys: Array.isArray(existing.versionKeys) && existing.versionKeys.length > 0
        ? existing.versionKeys.filter((key) => RUNTIME_VERSION_KEYS.includes(key))
        : [...defaults.versionKeys],
      dirtyKeys: Array.isArray(existing.dirtyKeys)
        ? existing.dirtyKeys.filter((key) => key in RUNTIME_DIRTY_DEFAULTS)
        : [...(defaults.dirtyKeys ?? [])],
      lastVersions: normaliseSchedulerVersionSnapshot(existing.lastVersions)
    }];
  }));
}

export function createRuntimeEventState(overrides = {}) {
  return {
    queue: normaliseRuntimeEvents(overrides.queue ?? []),
    queueLimit: normalisePositiveInteger(overrides.queueLimit, RUNTIME_EVENT_QUEUE_LIMIT),
    drainLimit: normalisePositiveInteger(overrides.drainLimit, RUNTIME_EVENT_DRAIN_LIMIT),
    overflowCount: Math.max(0, Math.floor(Number(overrides.overflowCount) || 0)),
    droppedCount: Math.max(0, Math.floor(Number(overrides.droppedCount) || 0)),
    drainedCount: Math.max(0, Math.floor(Number(overrides.drainedCount) || 0)),
    lastDrainedTick: Number.isInteger(overrides.lastDrainedTick) ? Math.max(0, overrides.lastDrainedTick) : null,
    handlerErrors: normaliseRuntimeHandlerErrors(overrides.handlerErrors)
  };
}

export function normaliseRuntimeEvents(events = [], limit = RUNTIME_EVENT_HISTORY_LIMIT) {
  if (!Array.isArray(events)) {
    return [];
  }
  return events
    .filter((event) => event && typeof event === 'object' && typeof event.type === 'string')
    .map((event, index) => ({
      id: typeof event.id === 'string' ? event.id : `event_${event.tick ?? 0}_${index}`,
      type: event.type,
      tick: Number.isInteger(event.tick) ? Math.max(0, event.tick) : 0,
      factionId: typeof event.factionId === 'string' ? event.factionId : null,
      payload: event.payload && typeof event.payload === 'object' ? { ...event.payload } : {}
    }))
    .slice(-normalisePositiveInteger(limit, RUNTIME_EVENT_HISTORY_LIMIT));
}

export function normaliseRuntimeCoordinator(game, map = null) {
  game.events = normaliseRuntimeEvents(game.events);
  game.dirty = createRuntimeDirtyState(game.dirty);
  game.versions = createRuntimeVersions(map, game.versions);
  game.scheduler = createRuntimeScheduler(game.scheduler, game.tick ?? 0);
  game.runtimeEvents = createRuntimeEventState(game.runtimeEvents);
  if (map) {
    game.versions.map = Math.max(game.versions.map ?? 0, Math.max(0, Number(map.revision) || 0));
  }
  return game;
}

export function enqueueRuntimeEvent(game, event = {}, options = {}) {
  normaliseRuntimeCoordinator(game, options.map ?? null);
  const type = typeof event.type === 'string' ? event.type : null;
  if (!type) {
    return null;
  }
  const state = game.runtimeEvents;
  const entry = normaliseRuntimeEvents([{
    id: typeof event.id === 'string' ? event.id : `event_${game.tick ?? 0}_${(game.events?.length ?? 0) + state.queue.length + 1}`,
    type,
    tick: game.tick ?? 0,
    factionId: typeof event.factionId === 'string' ? event.factionId : null,
    payload: event.payload && typeof event.payload === 'object' ? { ...event.payload } : {}
  }], 1)[0];

  state.queue = [...state.queue, entry];
  while (state.queue.length > state.queueLimit) {
    state.queue.shift();
    state.overflowCount += 1;
    state.droppedCount += 1;
  }
  return entry;
}

export function drainRuntimeEvents(game, options = {}) {
  normaliseRuntimeCoordinator(game, options.map ?? null);
  const drainLimit = normalisePositiveInteger(options.maxEvents, game.runtimeEvents.drainLimit);
  const handlers = normaliseHandlerList(options.handlers ?? registerRuntimeEventHandlers());
  const drained = [];

  while (game.runtimeEvents.queue.length > 0 && drained.length < drainLimit) {
    const event = game.runtimeEvents.queue.shift();
    runRuntimeEventHandlers(game, event, handlers, options.context ?? {});
    game.events = normaliseRuntimeEvents([...(game.events ?? []), event]);
    drained.push(event);
  }

  if (drained.length > 0) {
    game.runtimeEvents.drainedCount += drained.length;
    game.runtimeEvents.lastDrainedTick = game.tick ?? 0;
  }
  return drained;
}

export function registerRuntimeEventHandlers(extraHandlers = []) {
  const handlers = [
    {
      id: 'runtime:event-impact',
      handle(game, event) {
        const impact = RUNTIME_EVENT_IMPACTS[event.type];
        if (!impact) {
          return;
        }
        markRuntimeDirty(game, impact.dirty);
        bumpRuntimeVersions(game, impact.versions);
      }
    },
    ...normaliseHandlerList(extraHandlers)
  ];
  return handlers;
}

export function markRuntimeDirty(game, keys = []) {
  normaliseRuntimeCoordinator(game);
  keys.filter((key) => key in RUNTIME_DIRTY_DEFAULTS).forEach((key) => {
    game.dirty[key] = true;
  });
}

export function clearRuntimeDirty(game, keys = []) {
  normaliseRuntimeCoordinator(game);
  keys.filter((key) => key in RUNTIME_DIRTY_DEFAULTS).forEach((key) => {
    game.dirty[key] = false;
  });
}

export function bumpRuntimeVersion(game, key) {
  bumpRuntimeVersions(game, [key]);
}

export function bumpRuntimeVersions(game, keys = []) {
  normaliseRuntimeCoordinator(game);
  keys.filter((key) => RUNTIME_VERSION_KEYS.includes(key)).forEach((key) => {
    game.versions[key] = Math.max(0, Math.floor(Number(game.versions[key]) || 0)) + 1;
  });
}

export function scheduleRuntimeSystem(game, systemId, options = {}) {
  normaliseRuntimeCoordinator(game);
  const contract = getCadenceSystemContract(systemId);
  const current = game.scheduler?.[systemId] ?? RUNTIME_SCHEDULER_DEFAULTS[systemId] ?? {
    everyTicks: contract?.everyTicks ?? 1,
    nextTick: game.tick ?? 0,
    dirtyKeys: contract ? [...contract.dirtyKeys] : [],
    versionKeys: contract ? [...contract.versionKeys] : []
  };
  const requestedDirtyKeys = Array.isArray(options.dirtyKeys)
    ? options.dirtyKeys.filter((key) => key in RUNTIME_DIRTY_DEFAULTS)
    : [...(current.dirtyKeys ?? [])];
  const requestedVersionKeys = Array.isArray(options.versionKeys)
    ? options.versionKeys.filter((key) => RUNTIME_VERSION_KEYS.includes(key))
    : [...(current.versionKeys ?? [])];
  recordCadenceScheduleViolations(game, systemId, {
    everyTicks: normalisePositiveInteger(options.everyTicks ?? current.everyTicks, 1),
    dirtyKeys: requestedDirtyKeys,
    versionKeys: requestedVersionKeys
  }, contract);
  game.scheduler[systemId] = {
    ...current,
    ...options,
    everyTicks: normalisePositiveInteger(options.everyTicks ?? current.everyTicks, 1),
    nextTick: Math.max(0, Math.floor(Number(options.nextTick ?? current.nextTick ?? game.tick ?? 0) || 0)),
    dirtyKeys: requestedDirtyKeys,
    versionKeys: requestedVersionKeys,
    lastVersions: normaliseSchedulerVersionSnapshot(options.lastVersions ?? current.lastVersions)
  };
  enqueueRuntimeEvent(game, {
    type: RUNTIME_EVENTS.runtimeSystemScheduled,
    payload: { systemId }
  });
  drainRuntimeEvents(game);
  return game.scheduler[systemId];
}

export function shouldRunScheduledSystem(game, systemId) {
  normaliseRuntimeCoordinator(game);
  const schedule = game.scheduler?.[systemId];
  if (!schedule) {
    return true;
  }
  const tick = game.tick ?? 0;
  if (tick >= schedule.nextTick) {
    return true;
  }
  if ((schedule.dirtyKeys ?? []).some((key) => game.dirty?.[key])) {
    return true;
  }
  return (schedule.versionKeys ?? []).some((key) => game.versions?.[key] !== schedule.lastVersions?.[key]);
}

export function completeScheduledSystem(game, systemId) {
  normaliseRuntimeCoordinator(game);
  const schedule = game.scheduler?.[systemId];
  if (!schedule) {
    return;
  }
  const tick = game.tick ?? 0;
  game.scheduler[systemId] = {
    ...schedule,
    nextTick: tick + Math.max(1, schedule.everyTicks ?? 1),
    lastRunTick: tick,
    runCount: Math.max(0, Number(schedule.runCount) || 0) + 1,
    lastVersions: Object.fromEntries((schedule.versionKeys ?? []).map((key) => [key, game.versions?.[key] ?? 0]))
  };
}

export function summarizeRuntimeCoordinator(game) {
  normaliseRuntimeCoordinator(game);
  return {
    dirty: { ...game.dirty },
    versions: { ...game.versions },
    scheduler: Object.fromEntries(Object.entries(game.scheduler ?? {}).map(([id, schedule]) => [id, {
      everyTicks: schedule.everyTicks,
      nextTick: schedule.nextTick,
      lastRunTick: schedule.lastRunTick,
      runCount: schedule.runCount,
      dirtyKeys: [...(schedule.dirtyKeys ?? [])],
      versionKeys: [...(schedule.versionKeys ?? [])]
    }])),
    events: {
      queued: game.runtimeEvents.queue.length,
      queueLimit: game.runtimeEvents.queueLimit,
      drainLimit: game.runtimeEvents.drainLimit,
      overflowCount: game.runtimeEvents.overflowCount,
      droppedCount: game.runtimeEvents.droppedCount,
      drainedCount: game.runtimeEvents.drainedCount,
      lastDrainedTick: game.runtimeEvents.lastDrainedTick,
      handlerErrors: [...game.runtimeEvents.handlerErrors]
    },
    cadenceRegistry: summarizeCadenceRegistry(),
    recentEvents: normaliseRuntimeEvents(game.events).slice(-12)
  };
}


function recordCadenceScheduleViolations(game, systemId, schedule, contract) {
  if (!contract) {
    game.runtimeEvents.handlerErrors = [
      ...(game.runtimeEvents.handlerErrors ?? []),
      {
        tick: game.tick ?? 0,
        eventId: null,
        eventType: RUNTIME_EVENTS.runtimeSystemScheduled,
        handlerId: 'cadence:registry-contract',
        message: `${systemId} has no cadence registry contract; declare it before scheduling runtime work.`
      }
    ].slice(-12);
    return;
  }

  const messages = [];
  if (schedule.everyTicks !== contract.everyTicks) {
    messages.push(`everyTicks ${schedule.everyTicks} differs from registry ${contract.everyTicks}`);
  }
  for (const key of schedule.dirtyKeys ?? []) {
    if ((contract.forbiddenDirtyKeys ?? []).includes(key)) {
      messages.push(`dirty key ${key} is forbidden by cadence registry`);
    }
  }
  for (const key of schedule.versionKeys ?? []) {
    if ((contract.forbiddenVersionKeys ?? []).includes(key)) {
      messages.push(`version key ${key} is forbidden by cadence registry`);
    }
  }
  if (messages.length === 0) {
    return;
  }
  game.runtimeEvents.handlerErrors = [
    ...(game.runtimeEvents.handlerErrors ?? []),
    {
      tick: game.tick ?? 0,
      eventId: null,
      eventType: RUNTIME_EVENTS.runtimeSystemScheduled,
      handlerId: 'cadence:registry-contract',
      message: `${systemId} cadence contract violation: ${messages.join('; ')}`
    }
  ].slice(-12);
}

function runRuntimeEventHandlers(game, event, handlers, context) {
  handlers.forEach((handler) => {
    try {
      handler.handle(game, event, context);
    } catch (error) {
      game.runtimeEvents.handlerErrors = [
        ...game.runtimeEvents.handlerErrors,
        {
          tick: game.tick ?? 0,
          eventId: event.id,
          eventType: event.type,
          handlerId: handler.id,
          message: error instanceof Error ? error.message : String(error)
        }
      ].slice(-12);
    }
  });
}

function normaliseHandlerList(handlers) {
  if (!Array.isArray(handlers)) {
    return [];
  }
  return handlers
    .map((handler, index) => {
      if (typeof handler === 'function') {
        return { id: `handler_${index}`, handle: handler };
      }
      if (handler && typeof handler.handle === 'function') {
        return {
          id: typeof handler.id === 'string' ? handler.id : `handler_${index}`,
          handle: handler.handle
        };
      }
      return null;
    })
    .filter(Boolean);
}

function normaliseSchedulerVersionSnapshot(snapshot = {}) {
  return Object.fromEntries(RUNTIME_VERSION_KEYS.map((key) => {
    const value = Number(snapshot?.[key]);
    return [key, Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0];
  }));
}

function normaliseRuntimeHandlerErrors(errors = []) {
  if (!Array.isArray(errors)) {
    return [];
  }
  return errors
    .filter((error) => error && typeof error === 'object')
    .map((error, index) => ({
      tick: Number.isInteger(error.tick) ? Math.max(0, error.tick) : 0,
      eventId: typeof error.eventId === 'string' ? error.eventId : `unknown_${index}`,
      eventType: typeof error.eventType === 'string' ? error.eventType : 'unknown',
      handlerId: typeof error.handlerId === 'string' ? error.handlerId : 'unknown',
      message: typeof error.message === 'string' ? error.message : 'Runtime event handler failed'
    }))
    .slice(-12);
}

function normalisePositiveInteger(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
}
