import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import { smokeLoadSpatialApp } from './helpers/browser-module-loader.mjs';

const require = createRequire(import.meta.url);
const {
  appendQaOutputFeedEntry,
  buildQaOutputFeedEntryFromCycle,
  classifyQaOutputFeedResult,
  readQaOutputFeed,
} = require('../qaOutputFeed.js');

export default async function runQaOutputFeedTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-qa-output-feed-'));

  try {
    assert.deepEqual(readQaOutputFeed(rootPath), { items: [] });
    assert.equal(classifyQaOutputFeedResult({ failedChecks: 0, externalStatus: 'ok' }), 'pass');
    assert.equal(classifyQaOutputFeedResult({ failedChecks: 2, externalStatus: 'ok' }), 'fail');
    assert.equal(classifyQaOutputFeedResult({ failedChecks: 0, externalStatus: 'unreachable' }), 'degraded');

    const firstEntry = buildQaOutputFeedEntryFromCycle({
      cycleId: 'qa_cycle_1',
      createdAt: '2026-04-08T10:00:00.000Z',
      investigationCount: 3,
      failedChecks: 1,
      activeLanes: 2,
      externalStatus: 'degraded',
    });
    const duplicateEntry = buildQaOutputFeedEntryFromCycle({
      cycleId: 'qa_cycle_1',
      createdAt: '2026-04-08T10:05:00.000Z',
      investigationCount: 4,
      failedChecks: 0,
      activeLanes: 1,
      externalStatus: 'ok',
    });

    const appendedFirst = appendQaOutputFeedEntry(rootPath, firstEntry);
    const appendedDuplicate = appendQaOutputFeedEntry(rootPath, duplicateEntry);
    const feed = readQaOutputFeed(rootPath);

    assert.equal(appendedFirst.result, 'fail');
    assert.equal(appendedDuplicate.id, appendedFirst.id);
    assert.equal(feed.items.length, 1);
    assert.equal(feed.items[0].meta.investigationCount, 3);
    assert.equal(feed.items[0].meta.failedChecks, 1);
    assert.equal(feed.items[0].meta.activeLanes, 2);
    assert.equal(feed.items[0].meta.externalStatus, 'degraded');

    const spatialAppPath = path.resolve(process.cwd(), 'public', 'spatial', 'spatialApp.js');
    const spatialApp = await smokeLoadSpatialApp(spatialAppPath, { locationHref: 'http://localhost/?mode=qa' });
    const qaSections = spatialApp.buildQAReadableSectionsFromState({
      qaLead: { output_feed: [] },
      outputFeedLoaded: true,
      outputFeed: feed.items,
    });
    const outputFeedSection = qaSections.find((section) => section.kind === 'qa-output-feed');
    assert.ok(outputFeedSection);
    assert.equal(outputFeedSection.feed.length, 1);
    assert.equal(outputFeedSection.feed[0].result, 'fail');
    assert.equal(outputFeedSection.feed[0].meta.externalStatus, 'degraded');
  } finally {
    fs.rmSync(rootPath, { recursive: true, force: true });
  }
}
