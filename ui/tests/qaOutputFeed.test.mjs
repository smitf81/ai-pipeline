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
  buildQaOutputFeedEntryFromQaLeadRun,
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
      mcpEvidenceSource: 'external_probe',
      externalProbeLive: false,
      usedFallback: false,
      probeTarget: 'http://127.0.0.1:5051/run_test',
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
    assert.equal(feed.items[0].meta.mcpEvidenceSource, 'external_probe');
    assert.equal(feed.items[0].meta.usedFallback, false);
    assert.equal(feed.items[0].meta.probeTarget, 'http://127.0.0.1:5051/run_test');

    const runEntry = buildQaOutputFeedEntryFromQaLeadRun({
      id: 'qa_lead_run_2',
      source: 'qa_lead_runner',
      status: 'degraded',
      summary: 'QA lead cycle degraded: External probe unreachable.',
      finished_at: '2026-04-08T11:00:00.000Z',
      open_investigation_count: 2,
      external_validation: {
        ok: false,
        probeStatus: 'unreachable',
        mcpEvidenceSource: 'live_helper',
        externalProbeLive: false,
        usedFallback: false,
        probeTarget: 'http://127.0.0.1:5051/run_test',
      },
      boot_health: {
        safeMode: true,
        status: 'blocked',
      },
      repair_loop: {
        summary: {
          activeLanes: 1,
        },
      },
    });
    assert.equal(runEntry.meta.cycleId, 'qa_lead_run_2');
    assert.equal(runEntry.meta.investigationCount, 2);
    assert.equal(runEntry.meta.failedChecks, 1);
    assert.equal(runEntry.meta.activeLanes, 1);
    assert.equal(runEntry.meta.externalStatus, 'unreachable');
    assert.equal(runEntry.meta.mcpEvidenceSource, 'live_helper');
    assert.equal(runEntry.meta.usedFallback, false);
    assert.equal(runEntry.result, 'fail');
    assert.match(runEntry.summary, /degraded/i);

    const liveMcpRunEntry = buildQaOutputFeedEntryFromQaLeadRun({
      id: 'qa_lead_run_live_mcp',
      source: 'qa_lead_runner',
      status: 'degraded',
      summary: 'QA lead cycle degraded: browser pass unavailable.',
      finished_at: '2026-04-08T11:05:00.000Z',
      open_investigation_count: 0,
      external_validation: {
        ok: true,
        probeStatus: 'ok',
        mcpEvidenceSource: 'live_helper',
        externalProbeLive: true,
        usedFallback: false,
        probeTarget: 'http://127.0.0.1:5051/run_test',
      },
      repair_loop: {
        summary: {
          activeLanes: 0,
        },
      },
    });
    assert.match(liveMcpRunEntry.summary, /Live MCP helper evidence captured/i);
    assert.equal(liveMcpRunEntry.meta.mcpEvidenceSource, 'live_helper');
    assert.equal(liveMcpRunEntry.meta.externalProbeLive, true);
    assert.equal(liveMcpRunEntry.meta.usedFallback, false);

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
    const renderedSection = spatialApp.renderDeskSection(outputFeedSection, {
      runStructuredQA: () => undefined,
      runBrowserPass: () => undefined,
      openQARun: () => undefined,
    });
    const renderedText = JSON.stringify(renderedSection);
    assert.match(renderedText, /evidence: external_probe/i);
    assert.match(renderedText, /fallback: no/i);
  } finally {
    fs.rmSync(rootPath, { recursive: true, force: true });
  }
}
