import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default async function runCtoOverridesTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-cto-overrides-'));
  const {
    appendCtoOverrideLedgerEntry,
    readCtoOverrideLedger,
    summarizeCtoOverrideLedger,
    deriveCtoOverrideLayer,
  } = require(path.resolve(process.cwd(), 'ctoOverrides.js'));

  const writeResult = appendCtoOverrideLedgerEntry(rootPath, {
    kind: 'force-plan-generation',
    requestedBy: 'cto',
    reason: 'Planner must keep producing artifacts even when staffing is thin.',
    target: {
      deskId: 'planner',
      handoffId: 'handoff_123',
    },
    canonicalTruth: {
      staffing: { state: 'absent' },
      handoff: { state: 'blocked' },
    },
    provenance: {
      sourceType: 'cto-chat',
      sourceRef: 'override-console',
      sourceActionId: 'force-plan-generation',
    },
  });
  assert.ok(fs.existsSync(writeResult.jsonPath));
  assert.ok(fs.existsSync(writeResult.markdownPath));

  const ledger = readCtoOverrideLedger(rootPath);
  const summary = summarizeCtoOverrideLedger(ledger);
  const layer = deriveCtoOverrideLayer(ledger);
  assert.equal(summary.entryCount, 1);
  assert.equal(summary.activeCount, 1);
  assert.equal(summary.flags.forcePlanning, true);
  assert.equal(summary.latestEntry.kind, 'force-plan-generation');
  assert.equal(layer.planningMode, 'forced');
  assert.equal(layer.activeOverrides[0].target.deskId, 'planner');
  assert.equal(layer.activeOverrides[0].canonicalTruth.staffing.state, 'absent');
  assert.ok(layer.activeOverrides[0].provenance.sourceActionId);
}
