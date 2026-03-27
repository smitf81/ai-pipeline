import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createAdaptiveTuningMonitor,
  detectAdaptivePlateau,
  formatAdaptiveHistoryLine,
  formatAdaptiveTrendLine,
  recordAdaptiveTuningCycle
} from '../src/debug/adaptiveTuningMonitor.js';

test('records per-cycle adaptive snapshots and trims history to the configured limit', () => {
  let monitor = createAdaptiveTuningMonitor({ historyLimit: 2, trendWindow: 2 });

  monitor = recordAdaptiveTuningCycle(monitor, {
    resolveCycle: 1,
    adaptiveResolver: { def: 0, reg: 0.03, mem: 0, hold: 0, flow: 0.05, trav: 0.05, corr: 0, summary: 'reg +0.03, flow +0.05, trav +0.05' },
    qa: { signals: { blockersCount: 2, opennessPreserved: 0.8, convergenceAchieved: 0.1 } },
    candidates: [{ score: 0.14 }]
  });
  monitor = recordAdaptiveTuningCycle(monitor, {
    resolveCycle: 2,
    adaptiveResolver: { def: 0.04, reg: 0.03, mem: -0.02, hold: 0, flow: 0.1, trav: 0.1, corr: 0.05, summary: 'def +0.04, reg +0.03, flow +0.10' },
    qa: { signals: { blockersCount: 3, opennessPreserved: 0.84, convergenceAchieved: 0.15 } },
    candidates: [{ scoreBreakdown: { finalScore: 0.18 } }]
  });
  monitor = recordAdaptiveTuningCycle(monitor, {
    resolveCycle: 3,
    adaptiveResolver: { def: 0.02, reg: 0.05, mem: -0.02, hold: -0.03, flow: 0.1, trav: 0.1, corr: 0.05, summary: 'reg +0.05, flow +0.10' },
    qa: { signals: { blockersCount: 4, opennessPreserved: 0.9, convergenceAchieved: 0.25 } },
    candidates: [{ score: 0.22 }]
  });

  assert.equal(monitor.history.length, 2);
  assert.equal(monitor.history[0].resolveCycle, 3);
  assert.equal(monitor.history[1].resolveCycle, 2);
});

test('computes rising and falling trends from recent adaptive history', () => {
  let monitor = createAdaptiveTuningMonitor({ historyLimit: 8, trendWindow: 3 });

  monitor = recordAdaptiveTuningCycle(monitor, {
    resolveCycle: 1,
    adaptiveResolver: { def: 0, reg: 0, mem: 0, hold: 0, flow: 0, trav: 0, corr: 0 },
    qa: { signals: { blockersCount: 4, opennessPreserved: 0.75, convergenceAchieved: 0.05 } },
    candidates: [{ score: 0.1 }]
  });
  monitor = recordAdaptiveTuningCycle(monitor, {
    resolveCycle: 2,
    adaptiveResolver: { def: 0, reg: 0, mem: 0, hold: 0, flow: 0.05, trav: 0.05, corr: 0 },
    qa: { signals: { blockersCount: 3, opennessPreserved: 0.82, convergenceAchieved: 0.08 } },
    candidates: [{ score: 0.14 }]
  });
  monitor = recordAdaptiveTuningCycle(monitor, {
    resolveCycle: 3,
    adaptiveResolver: { def: 0, reg: 0, mem: 0, hold: 0, flow: 0.1, trav: 0.1, corr: 0 },
    qa: { signals: { blockersCount: 2, opennessPreserved: 0.9, convergenceAchieved: 0.12 } },
    candidates: [{ score: 0.18 }]
  });

  assert.equal(monitor.trends.score.direction, 'rising');
  assert.equal(monitor.trends.blockers.direction, 'falling');
  assert.equal(monitor.trends.openness.direction, 'rising');
  assert.equal(monitor.trends.convergence.direction, 'rising');
  assert.match(formatAdaptiveTrendLine('Score', monitor.trends.score), /Score: rising/);
  assert.match(formatAdaptiveHistoryLine(monitor.history[0]), /C3 \| flow \+0\.10/);
});

test('detects stable-but-stuck plateaus from monitor history only', () => {
  let monitor = createAdaptiveTuningMonitor({ historyLimit: 8, trendWindow: 6 });

  [1, 2, 3, 4, 5].forEach((resolveCycle) => {
    monitor = recordAdaptiveTuningCycle(monitor, {
      resolveCycle,
      adaptiveResolver: { def: 0, reg: 0.03, mem: -0.02, hold: -0.03, flow: 0.1, trav: 0.1, corr: 0.05 },
      qa: { signals: { blockersCount: 3, opennessPreserved: 0.84, convergenceAchieved: 0.0 } },
      candidates: [{ score: 0.18 }]
    });
  });

  const plateau = detectAdaptivePlateau(monitor.history, monitor.trendWindow);
  assert.equal(plateau.detected, true);
  assert.match(plateau.reason, /flat score\/blockers\/openness/);
});
