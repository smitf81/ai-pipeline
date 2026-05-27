import assert from 'node:assert/strict';

import {
  CADENCE_OBLIGATION_VERSION,
  CADENCE_SYSTEMS,
  validateCadenceRegistry
} from '../src/game/cadenceRegistry.js';
import {
  RUNTIME_SCHEDULER_DEFAULTS,
  scheduleRuntimeSystem,
  summarizeRuntimeCoordinator
} from '../src/game/runtimeEvents.js';

export function run() {
  assertCadenceRegistryValidatesSchedulerDefaults();
  assertHighRiskSystemsCannotSubscribeToGenericFieldDirty();
  assertRuntimeSummaryPublishesCadenceRegistryContext();
  assertRuntimeSchedulingRecordsContractViolations();
}

function assertCadenceRegistryValidatesSchedulerDefaults() {
  const result = validateCadenceRegistry({ schedulerDefaults: RUNTIME_SCHEDULER_DEFAULTS });
  assert.equal(result.ok, true, result.findings.map((entry) => entry.message).join('\n'));
  assert.equal(result.contractId, CADENCE_OBLIGATION_VERSION);
  assert.deepEqual(Object.keys(RUNTIME_SCHEDULER_DEFAULTS).sort(), Object.keys(CADENCE_SYSTEMS).sort());
}

function assertHighRiskSystemsCannotSubscribeToGenericFieldDirty() {
  for (const systemId of ['weatherFields', 'aiAppraisal', 'enemyAI', 'fieldOverlay']) {
    const contract = CADENCE_SYSTEMS[systemId];
    assert.ok(contract, `${systemId} must be declared in the cadence registry`);
    assert.equal(contract.dirtyKeys.includes('fields'), false, `${systemId} must not wake from generic fields dirtiness`);
    assert.equal(contract.versionKeys.includes('fields'), false, `${systemId} must not wake from generic fields version churn`);
    assert.equal(contract.forbiddenDirtyKeys.includes('fields'), true, `${systemId} should explicitly forbid generic fields dirtiness`);
  }
}

function assertRuntimeSummaryPublishesCadenceRegistryContext() {
  const game = createRuntimeTestGame();
  const summary = summarizeRuntimeCoordinator(game);
  assert.equal(summary.cadenceRegistry.contractId, CADENCE_OBLIGATION_VERSION);
  assert.equal(summary.cadenceRegistry.systems.weatherFields.owner, 'src/game/gameModel.js::deriveCachedWeatherFields');
  assert.equal(summary.cadenceRegistry.systems.weatherFields.everyTicks, 16);
  assert.deepEqual(summary.cadenceRegistry.systems.weatherFields.dirtyKeys, []);
  assert.deepEqual(summary.cadenceRegistry.systems.weatherFields.versionKeys, ['map']);
}

function assertRuntimeSchedulingRecordsContractViolations() {
  const game = createRuntimeTestGame();
  scheduleRuntimeSystem(game, 'weatherFields', { dirtyKeys: ['fields'], versionKeys: ['map'] });
  assert.equal(game.runtimeEvents.handlerErrors.some((entry) => entry.handlerId === 'cadence:registry-contract'
    && entry.message.includes('dirty key fields is forbidden')), true);

  const second = createRuntimeTestGame();
  scheduleRuntimeSystem(second, 'totallyNewHeavyThing', { everyTicks: 1, dirtyKeys: ['fields'] });
  assert.equal(second.runtimeEvents.handlerErrors.some((entry) => entry.message.includes('no cadence registry contract')), true);
}

function createRuntimeTestGame(overrides = {}) {
  return {
    tick: 0,
    events: [],
    dirty: {},
    versions: {},
    scheduler: {},
    runtimeEvents: {},
    ...overrides
  };
}
