import test from 'node:test';
import assert from 'node:assert/strict';

import {
  advanceFixedStepAccumulator,
  buildRuntimePerformanceReport,
  createChokepointPathRequests,
  createDetachedVisualTransform,
  createFixedStepAccumulator,
  createMassUnitScenario,
  createSpatialHashGrid,
  interpolateDetachedVisual,
  processPathfindingBudget,
  runMassEntityProbe,
  stepDetachedCollider
} from '../src/qa/runtimePerformanceQa.js';

test('fixed-step accumulator feeds fixed simulation delta and variable render delta separately', () => {
  const clock = createFixedStepAccumulator({ fixedStepMs: 1000 / 60, maxDeltaMs: 50, nowMs: 0 });
  const fixedDeltas = [];
  const interpolationFrames = [];

  advanceFixedStepAccumulator(clock, 8, {
    fixedUpdate: (dt) => fixedDeltas.push(dt),
    interpolate: (frame) => interpolationFrames.push(frame)
  });
  const second = advanceFixedStepAccumulator(clock, 41, {
    fixedUpdate: (dt) => fixedDeltas.push(dt),
    interpolate: (frame) => interpolationFrames.push(frame)
  });

  assert.equal(fixedDeltas.length, 2);
  assert.ok(fixedDeltas.every((dt) => Math.abs(dt - (1000 / 60)) < 0.0001));
  assert.equal(interpolationFrames[0].frameDeltaMs, 8);
  assert.equal(second.frameDeltaMs, 33);
  assert.equal(second.fixedStepsThisFrame, 2);
});

test('accumulator remainder is exposed as interpolation alpha for visual smoothing', () => {
  const clock = createFixedStepAccumulator({ fixedStepMs: 10, nowMs: 0 });
  const frame = advanceFixedStepAccumulator(clock, 25);

  assert.equal(frame.fixedStepsThisFrame, 2);
  assert.equal(frame.accumulatorRemainderMs, 5);
  assert.equal(frame.interpolationAlpha, 0.5);
});

test('visual transform can interpolate independently from the logical collider', () => {
  const binding = createDetachedVisualTransform({ collider: { x: 0, y: 0, z: 0 } });

  stepDetachedCollider(binding, { x: 10, y: 0, z: 0 });
  const visual = interpolateDetachedVisual(binding, 0.25);

  assert.deepEqual(binding.collider, { x: 10, y: 0, z: 0 });
  assert.deepEqual(visual, { x: 2.5, y: 0, z: 0 });
  assert.notStrictEqual(binding.visual, binding.collider);
  assert.notStrictEqual(binding.previousCollider, binding.collider);
});

test('unit spawn horde probe handles 500 moving units with stable TPS/FPS counters', () => {
  const units = createMassUnitScenario({ count: 500, columns: 25, spacing: 8 });
  const metrics = runMassEntityProbe(units, { frames: 60, fixedStepMs: 1000 / 60 });

  assert.equal(metrics.unitCount, 500);
  assert.equal(metrics.frames, 60);
  assert.equal(metrics.logicalUpdates, 30000);
  assert.equal(metrics.visibleUpdates, 30000);
  assert.equal(metrics.estimatedFps, 60);
  assert.equal(metrics.estimatedTps, 60);
  assert.ok(units.every((unit) => unit.updateCount === 60));
});

test('pathfinding chokepoint probe budgets hundreds of requests instead of resolving all at once', () => {
  const units = createMassUnitScenario({ count: 500, columns: 50, spacing: 4 });
  const requests = createChokepointPathRequests(units, { x: 100, y: 100, z: 0 });
  const metrics = processPathfindingBudget(requests, { maxRequestsPerTick: 40, ticks: 3 });

  assert.equal(metrics.queued, 500);
  assert.equal(metrics.processed, 120);
  assert.equal(metrics.deferred, 380);
  assert.equal(metrics.maxBatch, 40);
  assert.deepEqual(metrics.batches, [40, 40, 40]);
});

test('spatial partitioning culls off-screen unit visual updates', () => {
  const units = createMassUnitScenario({ count: 500, columns: 50, spacing: 10 });
  const viewport = { x: 0, y: 0, width: 120, height: 40 };
  const metrics = runMassEntityProbe(units, {
    frames: 10,
    viewport,
    spatialGrid: createSpatialHashGrid({ cellSize: 20 })
  });

  const updatedUnits = units.filter((unit) => unit.updateCount > 0);
  const untouchedUnits = units.filter((unit) => unit.updateCount === 0);

  assert.ok(updatedUnits.length > 0);
  assert.ok(untouchedUnits.length > 0);
  assert.ok(metrics.culledUpdates > metrics.visibleUpdates);
  assert.ok(updatedUnits.every((unit) =>
    unit.position.x >= viewport.x
    && unit.position.x <= viewport.x + viewport.width + 1
    && unit.position.y >= viewport.y
    && unit.position.y <= viewport.y + viewport.height + 1
  ));
});

test('runtime performance report converts raw metrics into action-ready findings', () => {
  const report = buildRuntimePerformanceReport({
    cadence: { fixedStepsThisFrame: 8 },
    massEntity: { unitCount: 500, culledUpdates: 0 },
    pathfinding: { queued: 500, deferred: 0 },
    spatial: { offscreenUpdated: 3 }
  });

  assert.equal(report.status, 'fail');
  assert.deepEqual(
    report.findings.map((finding) => finding.code),
    [
      'fixed_step_spiral_risk',
      'mass_entity_no_culling',
      'pathfinding_unbounded_batch',
      'offscreen_update_leak'
    ]
  );
  assert.ok(report.findings.every((finding) => finding.action.length > 20));
});
