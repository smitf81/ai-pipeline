import assert from 'node:assert/strict';

import {
  RUNTIME_EVENTS,
  createRuntimeEventState,
  drainRuntimeEvents,
  enqueueRuntimeEvent,
  normaliseRuntimeCoordinator,
  shouldRunScheduledSystem,
  summarizeRuntimeCoordinator
} from '../src/game/runtimeEvents.js';

export function run() {
  assertBoundedQueueAndDeterministicDrain();
  assertEventImpactsDirtyVersionsAndScheduling();
  assertHandlerFailuresAreRecorded();
  assertRuntimeSummaryExposesCoordinatorState();
}

function assertBoundedQueueAndDeterministicDrain() {
  const game = createRuntimeTestGame({
    runtimeEvents: createRuntimeEventState({ queueLimit: 3, drainLimit: 2 })
  });

  for (let index = 1; index <= 5; index += 1) {
    enqueueRuntimeEvent(game, {
      type: RUNTIME_EVENTS.economySpent,
      payload: { index }
    });
  }

  assert.equal(game.runtimeEvents.queue.length, 3);
  assert.equal(game.runtimeEvents.overflowCount, 2);
  assert.equal(game.runtimeEvents.droppedCount, 2);

  const drained = drainRuntimeEvents(game);
  assert.deepEqual(drained.map((event) => event.payload.index), [3, 4]);
  assert.deepEqual(game.events.map((event) => event.payload.index), [3, 4]);
  assert.deepEqual(game.runtimeEvents.queue.map((event) => event.payload.index), [5]);
  assert.equal(game.runtimeEvents.drainedCount, 2);
}

function assertEventImpactsDirtyVersionsAndScheduling() {
  const game = createRuntimeTestGame();
  normaliseRuntimeCoordinator(game);
  const beforeVersions = { ...game.versions };

  enqueueRuntimeEvent(game, {
    type: RUNTIME_EVENTS.constructionJobCreated,
    factionId: 'player',
    payload: { jobId: 'job_test' }
  });
  drainRuntimeEvents(game);

  assert.equal(game.dirty.construction, true);
  assert.equal(game.dirty.logistics, true);
  assert.equal(game.dirty.nav, true);
  assert.equal(game.versions.construction, beforeVersions.construction + 1);
  assert.equal(game.versions.logistics, beforeVersions.logistics + 1);
  assert.equal(game.versions.nav, beforeVersions.nav + 1);
  assert.equal(shouldRunScheduledSystem(game, 'logistics'), true);

  const weather = game.scheduler.weatherFields;
  assert.deepEqual(weather.dirtyKeys, [], 'weather cadence must not be invalidated by generic field dirtiness');
  assert.deepEqual(weather.versionKeys, ['map'], 'weather cadence should only be forced by map/weather substrate changes');

  const fieldOverlay = game.scheduler.fieldOverlay;
  assert.deepEqual(fieldOverlay.dirtyKeys, [], 'debug field overlay must not be invalidated by generic field dirtiness');
  assert.deepEqual(fieldOverlay.versionKeys, ['map'], 'debug field overlay should remain cadenced unless the map substrate changes');

  const aiAppraisal = game.scheduler.aiAppraisal;
  assert.deepEqual(aiAppraisal.versionKeys, [], 'AI appraisal should run from cadence or explicit AI dirtiness, not ordinary world churn');

  const enemyAI = game.scheduler.enemyAI;
  assert.deepEqual(enemyAI.versionKeys, [], 'enemy director decisions should remain cadenced, not wake on every logistics/combat version bump');
}


function assertHandlerFailuresAreRecorded() {
  const game = createRuntimeTestGame();
  enqueueRuntimeEvent(game, { type: RUNTIME_EVENTS.economySpent });
  const drained = drainRuntimeEvents(game, {
    handlers: [{
      id: 'throwing-test-handler',
      handle() {
        throw new Error('expected-handler-failure');
      }
    }]
  });

  assert.equal(drained.length, 1);
  assert.equal(game.events.length, 1);
  assert.equal(game.runtimeEvents.handlerErrors.length, 1);
  assert.equal(game.runtimeEvents.handlerErrors[0].handlerId, 'throwing-test-handler');
  assert.equal(game.runtimeEvents.handlerErrors[0].message, 'expected-handler-failure');
}

function assertRuntimeSummaryExposesCoordinatorState() {
  const game = createRuntimeTestGame();
  enqueueRuntimeEvent(game, { type: RUNTIME_EVENTS.structureNavChanged });
  drainRuntimeEvents(game);
  const summary = summarizeRuntimeCoordinator(game);

  assert.equal(summary.events.queued, 0);
  assert.equal(summary.events.drainedCount, 1);
  assert.equal(summary.recentEvents.length, 1);
  assert.equal(summary.recentEvents[0].type, RUNTIME_EVENTS.structureNavChanged);
  assert.equal(typeof summary.scheduler.logistics.nextTick, 'number');
}

function createRuntimeTestGame(overrides = {}) {
  return {
    tick: 7,
    events: [],
    dirty: {},
    versions: {},
    scheduler: {},
    runtimeEvents: {},
    ...overrides
  };
}
