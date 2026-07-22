import test from 'node:test';
import assert from 'node:assert/strict';

import { restoreActorEnergy } from '../src/units/energy.js';

test('restoreActorEnergy refills exhausted workers without adding automatic recharge', () => {
  const worker = {
    type: 'worker',
    energy: 0,
    maxEnergy: 16,
    state: 'exhausted',
    currentTask: null
  };

  const result = restoreActorEnergy(worker);

  assert.equal(result.ok, true);
  assert.equal(worker.energy, 16);
  assert.equal(worker.state, 'idle');
});

test('restoreActorEnergy keeps an interrupted task resumable after refill', () => {
  const worker = {
    type: 'worker',
    energy: 0,
    maxEnergy: 16,
    state: 'exhausted',
    currentTask: { id: 'task-0004', status: 'blocked' }
  };

  restoreActorEnergy(worker);

  assert.equal(worker.energy, 16);
  assert.equal(worker.state, 'working');
});
