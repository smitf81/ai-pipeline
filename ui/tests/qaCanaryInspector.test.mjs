import assert from 'node:assert/strict';
import path from 'node:path';

import { smokeLoadSpatialApp } from './helpers/browser-module-loader.mjs';

function collectRenderText(node, bucket = []) {
  if (node == null) return bucket;
  if (typeof node === 'string' || typeof node === 'number') {
    bucket.push(String(node));
    return bucket;
  }
  if (Array.isArray(node)) {
    for (const entry of node) collectRenderText(entry, bucket);
    return bucket;
  }
  if (node && Array.isArray(node.args)) {
    for (const entry of node.args) collectRenderText(entry, bucket);
    return bucket;
  }
  if (node && typeof node === 'object') {
    for (const value of Object.values(node)) collectRenderText(value, bucket);
  }
  return bucket;
}

export default async function runQaCanaryInspectorTests() {
  const spatialAppPath = path.resolve(process.cwd(), 'public', 'spatial', 'spatialApp.js');
  const spatialApp = await smokeLoadSpatialApp(spatialAppPath, { locationHref: 'http://localhost/?mode=qa' });
  const helpers = {
    runStructuredQA: () => undefined,
    runBrowserPass: () => undefined,
    openQARun: () => undefined,
  };

  const section = {
    id: 'qa-canaries',
    label: 'Lane Canaries',
    kind: 'qa-canaries',
    summary: 'All 3 QA lane canaries passed.',
    defaultOpen: true,
    canaries: {
      last_run_at: '2026-04-06T12:00:00.000Z',
      overall_status: 'pass',
      total_canaries: 3,
      passed_count: 3,
      failed_count: 0,
      failing_canary_ids: [],
      results: [
        {
          canary_id: 'ui_boot_integrity_missing_asset',
          label: 'UI boot missing asset route',
          status: 'pass',
          checked_at: '2026-04-06T12:00:00.000Z',
          target_lane_label: 'UI Boot Integrity',
          owner_department: 'QA',
          trigger: 'missing_client_asset',
          policy_outcome: 'auto_apply_allowed',
          validation_status: 'accepted',
          scoped_targets_summary: '2 targets | ui/public/index.html | spatialBootstrap.js',
          required_validation_gate_ids: ['ui-boot-contract'],
          latest_validation_summary: 'UI Boot Integrity checks passed.',
          notes: ['UI boot missing asset route passed.'],
        },
        {
          canary_id: 'planner_canonical_identity_guard',
          label: 'Planner canonical identity guard',
          status: 'pass',
          checked_at: '2026-04-06T12:00:00.000Z',
          target_lane_label: 'Planner Canonical Integrity',
          owner_department: 'Delivery',
          trigger: 'planner_identity_mismatch',
          policy_outcome: 'guarded_manual_review',
          validation_status: 'accepted',
          scoped_targets_summary: '2 targets | ui/server.js | staffingRules.js',
          required_validation_gate_ids: ['planner-canonical-contract', 'planner-staffing-rules'],
          latest_validation_summary: 'Planner Canonical Integrity checks passed.',
          notes: ['Planner canonical identity guard passed.'],
        },
      ],
    },
  };

  const normalized = spatialApp.normalizeDeskSectionPayload(section);
  assert.equal(normalized.kind, 'qa-canaries');
  assert.equal(normalized.canaries.overall_status, 'pass');

  const rendered = spatialApp.renderDeskSection(section, helpers);
  assert.ok(rendered);
  assert.equal(rendered.args[1]['data-qa'], 'qa-canaries');
  const text = collectRenderText(rendered).join(' ');
  assert.match(text, /Lane Canaries/);
  assert.match(text, /UI boot missing asset route/);
  assert.match(text, /Planner canonical identity guard/);
  assert.match(text, /guarded_manual_review/);
  assert.match(text, /accepted/);

  const emptyRendered = spatialApp.renderDeskSection({
    id: 'qa-canaries-empty',
    label: 'Lane Canaries',
    kind: 'qa-canaries',
    summary: 'No QA lane canary results are recorded yet.',
    emptyState: 'No QA lane canary results are recorded yet.',
    canaries: {
      last_run_at: null,
      overall_status: 'idle',
      total_canaries: 0,
      passed_count: 0,
      failed_count: 0,
      failing_canary_ids: [],
      results: [],
    },
  }, helpers);
  const emptyText = collectRenderText(emptyRendered).join(' ');
  assert.match(emptyText, /No QA lane canary results are recorded yet/);
}
