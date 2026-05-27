import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSimulationHarnessState,
  getRealtimeFrameBudget,
  getSimulationStatusSummary,
  getStepCountForDurationMs,
  pauseSimulation,
  recordSimulationAdvance,
  resumeSimulation,
  setSimulationSpeed
} from '../src/simulation/harness.js';

test('simulation harness defaults to a running 1x realtime loop', () => {
  const simulation = createSimulationHarnessState();

  assert.equal(simulation.mode, 'running');
  assert.equal(simulation.speedMultiplier, 1);
  assert.equal(getRealtimeFrameBudget(simulation), 1);
});

test('speed changes are deterministic and pause gates realtime stepping', () => {
  const simulation = createSimulationHarnessState();

  assert.equal(setSimulationSpeed(simulation, 11), 10);
  assert.equal(getRealtimeFrameBudget(simulation), 10);

  pauseSimulation(simulation);
  assert.equal(getRealtimeFrameBudget(simulation), 0);

  resumeSimulation(simulation);
  assert.equal(getRealtimeFrameBudget(simulation), 10);
});

test('manual duration advances convert to fixed simulation frames', () => {
  const simulation = createSimulationHarnessState();

  assert.equal(getStepCountForDurationMs(simulation, 1000 / 60), 1);
  assert.equal(getStepCountForDurationMs(simulation, 1000), 60);
  assert.equal(getStepCountForDurationMs(simulation, 0), 1);
});

test('simulation summary reports accumulated fast-forward time', () => {
  const simulation = createSimulationHarnessState({ speedMultiplier: 100 });

  recordSimulationAdvance(simulation, 120, 'fast-forward');
  const summary = getSimulationStatusSummary(simulation);

  assert.equal(summary.speedMultiplier, 100);
  assert.equal(summary.totalFrames, 120);
  assert.equal(summary.elapsedSeconds, 2);
  assert.equal(summary.lastAdvanceFrames, 120);
  assert.equal(summary.lastAdvanceSource, 'fast-forward');
  assert.match(summary.label, /Running \| 100x \| frame 120 \| 2\.00s sim/);
});
