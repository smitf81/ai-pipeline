import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ADAPTIVE_WEIGHT_LIMIT,
  createAdaptiveResolverState,
  deriveAdaptiveResolverState,
  formatAdaptiveModifierSummary
} from '../src/ai/adaptiveResolverWeights.js';

function assertApproxEqual(actual, expected, epsilon = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`
  );
}

test('maps QA signals into deterministic adaptive resolver nudges', () => {
  const next = deriveAdaptiveResolverState({
    qa: {
      signals: {
        blockersCount: 4,
        opennessPreserved: 0.8,
        structureCoherence: 0.55,
        convergenceAchieved: 0.05,
        stableCycles: 3
      }
    },
    previousState: createAdaptiveResolverState(),
    resolveCycle: 7
  });

  assertApproxEqual(next.mem, -0.02);
  assertApproxEqual(next.hold, -0.03);
  assertApproxEqual(next.flow, 0.1);
  assertApproxEqual(next.trav, 0.1);
  assertApproxEqual(next.corr, 0.05);
  assertApproxEqual(next.def, 0.04);
  assertApproxEqual(next.reg, 0.05);
  assert.equal(next.lastUpdatedCycle, 7);
  assert.deepEqual(next.lastQaSignals, {
    blockersCount: 4,
    opennessPreserved: 0.8,
    structureCoherence: 0.55,
    convergenceAchieved: 0.05,
    stableCycles: 3
  });
  assert.equal(next.changed, true);
  assert.match(formatAdaptiveModifierSummary(next), /flow \+0\.10/);
  assert.ok(
    Object.entries(next)
      .filter(([key]) => ['def', 'reg', 'mem', 'hold', 'flow', 'trav', 'corr'].includes(key))
      .every(([, value]) => Math.abs(value) <= ADAPTIVE_WEIGHT_LIMIT)
  );
});

test('repeating the same QA snapshot keeps the same adaptive weights without reporting a new change', () => {
  const qa = {
    signals: {
      blockersCount: 3,
      opennessPreserved: 0.82,
      structureCoherence: 0.58,
      convergenceAchieved: 0.05,
      stableCycles: 2
    }
  };

  const previous = deriveAdaptiveResolverState({
    qa,
    previousState: createAdaptiveResolverState(),
    resolveCycle: 2
  });
  const next = deriveAdaptiveResolverState({
    qa,
    previousState: previous,
    resolveCycle: 3
  });

  assert.equal(next.changed, false);
  assert.deepEqual(next.changedTerms, []);
  assert.equal(next.summary, previous.summary);
});

test('applies a tiny bounded plateau nudge when monitor history is stable-but-stuck', () => {
  const next = deriveAdaptiveResolverState({
    qa: {
      signals: {
        blockersCount: 3,
        opennessPreserved: 0.84,
        structureCoherence: 0.58,
        convergenceAchieved: 0.0,
        stableCycles: 0
      }
    },
    previousState: createAdaptiveResolverState(),
    resolveCycle: 8,
    adaptiveMonitor: {
      plateau: {
        detected: true,
        reason: 'flat score/blockers/openness with convergence 0% and near-static adaptive weights'
      }
    }
  });

  assert.equal(next.plateauDetected, true);
  assert.equal(next.plateauNudgeApplied, true);
  assert.match(next.plateauNudgeSummary, /def \+0\.02/);
  assert.match(next.plateauNudgeSummary, /reg \+0\.01/);
  assert.match(next.plateauNudgeSummary, /corr \+0\.01/);
  assert.match(next.plateauNudgeSummary, /flow -0\.02/);
  assert.match(next.plateauNudgeSummary, /trav -0\.01/);
  assertApproxEqual(next.def, 0.02);
  assertApproxEqual(next.reg, 0.04);
  assertApproxEqual(next.corr, 0.06);
  assertApproxEqual(next.flow, 0.08);
  assertApproxEqual(next.trav, 0.09);
  assert.equal(next.lastPlateauNudgeCycle, 8);
});

test('plateau nudge respects a deterministic cooldown to avoid cycle-by-cycle flapping', () => {
  const previous = deriveAdaptiveResolverState({
    qa: {
      signals: {
        blockersCount: 3,
        opennessPreserved: 0.84,
        structureCoherence: 0.58,
        convergenceAchieved: 0.0,
        stableCycles: 0
      }
    },
    previousState: createAdaptiveResolverState(),
    resolveCycle: 8,
    adaptiveMonitor: {
      plateau: {
        detected: true,
        reason: 'flat score/blockers/openness with convergence 0% and near-static adaptive weights'
      }
    }
  });

  const next = deriveAdaptiveResolverState({
    qa: {
      signals: {
        blockersCount: 3,
        opennessPreserved: 0.84,
        structureCoherence: 0.58,
        convergenceAchieved: 0.0,
        stableCycles: 0
      }
    },
    previousState: previous,
    resolveCycle: 9,
    adaptiveMonitor: {
      plateau: {
        detected: true,
        reason: 'flat score/blockers/openness with convergence 0% and near-static adaptive weights'
      }
    }
  });

  assert.equal(next.plateauDetected, true);
  assert.equal(next.plateauNudgeApplied, false);
  assert.equal(next.plateauNudgeSummary, 'none');
  assert.equal(next.lastPlateauNudgeCycle, 8);
});
