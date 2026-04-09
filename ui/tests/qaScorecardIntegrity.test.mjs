import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

const require = createRequire(import.meta.url);

const CURRENT_AT = '2026-04-09T10:00:00.000Z';
const STALE_AT = '2026-03-01T10:00:00.000Z';

function buildStructuredReport({
  sourceFreshness = 'live_canonical',
  sourceObservedAt = CURRENT_AT,
  finishedAt = CURRENT_AT,
  desks = [],
} = {}) {
  return {
    status: 'pass',
    summary: 'Structured QA report available.',
    finishedAt,
    desks,
    sourceTrace: {
      freshnessClass: sourceFreshness,
      sourcePath: 'data/spatial/qa/structured/latest.json',
      observedAt: sourceObservedAt,
    },
  };
}

function buildDeskTest({
  desk = 'planner',
  testName = 'contract_check',
  status = 'pass',
  score = 3.8,
  updatedAt = CURRENT_AT,
  validationOk = true,
} = {}) {
  return {
    desk,
    tests: [
      {
        name: testName,
        status,
        qualityCard: {
          id: `${desk}.${testName}`,
          desk,
          testId: testName,
          testName: `${desk} ${testName}`,
          status,
          updatedAt,
          overallScore: typeof score === 'number'
            ? { value: score, max: 4 }
            : null,
          validation: {
            ok: validationOk,
            issues: validationOk ? [] : ['schema mismatch'],
            summary: validationOk ? 'Quality card validation complete.' : 'Quality card validation failed.',
          },
        },
      },
    ],
  };
}

export default async function runQAScorecardIntegrityTests() {
  const serverPath = path.resolve(process.cwd(), 'server.js');
  const studioDataPath = path.resolve(process.cwd(), 'public', 'spatial', 'studioData.js');
  const {
    buildStructuredQAScorecardBundle,
  } = require(serverPath);
  const { resolveQAScorecardBundle } = await loadModuleCopy(studioDataPath, { label: 'studioData-qa-scorecard-integrity' });

  const freshPassingReport = buildStructuredReport({
    desks: [buildDeskTest({ desk: 'planner', score: 3.8 })],
  });
  const freshPassingBundle = buildStructuredQAScorecardBundle(freshPassingReport);
  assert.equal(freshPassingBundle.status, 'pass');
  assert.equal(freshPassingBundle.cards[0].rollupStatus, 'pass');
  assert.equal(freshPassingBundle.cards[0].freshness, 'fresh');
  assert.equal(freshPassingBundle.cards[0].failureOwnerDeskId, 'planner');
  assert.equal(freshPassingBundle.cards[0].thresholds.passMin, 3.5);
  assert.match(freshPassingBundle.summary, /1 scorecards \| 1 pass/);

  const staleReport = buildStructuredReport({
    sourceFreshness: 'stale',
    sourceObservedAt: STALE_AT,
    finishedAt: STALE_AT,
    desks: [buildDeskTest({ desk: 'runner', score: 3.9, updatedAt: STALE_AT })],
  });
  const staleBundle = buildStructuredQAScorecardBundle(staleReport);
  assert.equal(staleBundle.status, 'stale');
  assert.equal(staleBundle.cards[0].rollupStatus, 'stale');
  assert.match(staleBundle.cards[0].summary, /stale/i);

  const degradedReport = buildStructuredReport({
    desks: [buildDeskTest({ desk: 'ui', status: 'unavailable', score: 3.9 })],
  });
  const degradedBundle = buildStructuredQAScorecardBundle(degradedReport);
  assert.equal(degradedBundle.status, 'warn');
  assert.equal(degradedBundle.cards[0].reportedStatus, 'warn');
  assert.equal(degradedBundle.cards[0].rollupStatus, 'warn');
  assert.match(degradedBundle.cards[0].summary, /reported warn/i);

  const mixedReport = buildStructuredReport({
    desks: [
      buildDeskTest({ desk: 'planner', score: 3.8 }),
      buildDeskTest({ desk: 'ta', status: 'pass', score: 2.2 }),
    ],
  });
  const mixedBundle = buildStructuredQAScorecardBundle(mixedReport);
  assert.equal(mixedBundle.status, 'fail');
  assert.deepEqual(
    mixedBundle.cards.map((card) => ({ desk: card.desk, rollupStatus: card.rollupStatus })),
    [
      { desk: 'planner', rollupStatus: 'pass' },
      { desk: 'ta', rollupStatus: 'fail' },
    ],
  );
  assert.match(mixedBundle.cards[1].summary, /below the fail threshold 2.5/i);

  const missingBundle = buildStructuredQAScorecardBundle(null);
  assert.equal(missingBundle.status, 'missing');
  assert.equal(missingBundle.cards.length, 0);
  assert.match(missingBundle.summary, /missing/i);

  const payloadBackedBundle = resolveQAScorecardBundle({
    structuredReport: mixedReport,
    scorecards: mixedBundle.cards,
    scorecardDefinitions: mixedBundle.definitions,
    scorecardStatus: mixedBundle.status,
    scorecardSummary: mixedBundle.summary,
    scorecardCount: mixedBundle.testCount,
    scorecardDeskCount: mixedBundle.deskCount,
  });
  assert.equal(payloadBackedBundle.status, mixedBundle.status);
  assert.equal(payloadBackedBundle.summary, mixedBundle.summary);
  assert.equal(payloadBackedBundle.testCount, mixedBundle.testCount);
  assert.deepEqual(payloadBackedBundle.cards, mixedBundle.cards);

  const fallbackBundle = resolveQAScorecardBundle({
    structuredReport: mixedReport,
  });
  assert.equal(fallbackBundle.status, mixedBundle.status);
  assert.equal(fallbackBundle.cards[0].rollupStatus, mixedBundle.cards[0].rollupStatus);
  assert.equal(fallbackBundle.cards[1].rollupStatus, mixedBundle.cards[1].rollupStatus);
}
