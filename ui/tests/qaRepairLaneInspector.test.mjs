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

export default async function runQARepairLaneInspectorTests() {
  const spatialAppPath = path.resolve(process.cwd(), 'public', 'spatial', 'spatialApp.js');
  const spatialApp = await smokeLoadSpatialApp(spatialAppPath, { locationHref: 'http://localhost/?mode=qa' });
  const helpers = {
    runStructuredQA: () => undefined,
    runBrowserPass: () => undefined,
    openQARun: () => undefined,
  };

  const populatedSection = {
    id: 'qa-repair-lanes',
    label: 'Repair Lanes',
    kind: 'qa-repair-lanes',
    summary: '2 active or recent lanes | 1 blocked | 0 active',
    defaultOpen: true,
    repairLoopSummary: {
      blockedLanes: 1,
      activeLanes: 0,
    },
    lanes: [
      {
        lane_id: 'planner_canonical_integrity',
        label: 'Planner Canonical Integrity',
        owner_department: 'QA',
        trust_level: 'guarded',
        trust_reason: 'Planner integrity is policy-guarded.',
        current_status: 'blocked',
        latest_job_status: 'policy_blocked',
        latest_validation_result: 'policy_blocked',
        latest_attempt_at: '2026-04-06T08:00:00.000Z',
        latest_policy_block_reason: 'Auto-apply is not permitted for this lane trust policy.',
        latest_stop_reason: 'Auto-apply is not permitted for this lane trust policy.',
        open_investigations: 1,
        repair_job_count: 1,
        attempt_count: 1,
        blocked_count: 1,
        auto_apply_allowed: false,
        retry_budget: 1,
        required_validation_gate_ids: ['planner-canonical-contract', 'planner-staffing-rules'],
        allowed_trigger_classes: ['planner_identity_mismatch'],
        scoped_targets: ['ui/server.js', 'ui/public/spatial/staffingRules.js'],
        scoped_targets_summary: '2 targets | ui/server.js | spatial/staffingRules.js',
      },
      {
        lane_id: 'ui_boot_integrity',
        label: 'UI Boot Integrity',
        owner_department: 'QA',
        trust_level: 'high',
        trust_reason: 'Boot failures can auto-apply inside browser boot scope.',
        current_status: 'healthy',
        latest_job_status: 'accepted',
        latest_validation_result: 'accepted',
        latest_attempt_at: '2026-04-06T08:05:00.000Z',
        latest_stop_reason: 'Boot contract passed after stale reference cleanup.',
        open_investigations: 0,
        repair_job_count: 1,
        attempt_count: 1,
        blocked_count: 0,
        auto_apply_allowed: true,
        retry_budget: 2,
        required_validation_gate_ids: ['ui-boot-contract'],
        allowed_trigger_classes: ['missing_client_asset'],
        scoped_targets: ['ui/public/index.html', 'ui/public/spatial/spatialBootstrap.js'],
        scoped_targets_summary: '2 targets | ui/public/index.html | spatial/spatialBootstrap.js',
      },
    ],
  };

  const normalized = spatialApp.normalizeDeskSectionPayload(populatedSection);
  assert.equal(normalized.kind, 'qa-repair-lanes');
  assert.equal(normalized.lanes.length, 2);
  assert.equal(normalized.repairLoopSummary.blockedLanes, 1);

  const rendered = spatialApp.renderDeskSection(populatedSection, helpers);
  assert.ok(rendered);
  assert.equal(rendered.args[1]['data-qa'], 'qa-repair-lanes');
  const renderedText = collectRenderText(rendered).join(' ');
  assert.match(renderedText, /Planner Canonical Integrity/);
  assert.match(renderedText, /UI Boot Integrity/);
  assert.match(renderedText, /Policy blocked/);
  assert.match(renderedText, /Success/);
  assert.match(renderedText, /Auto-apply blocked/);
  assert.match(renderedText, /Auto-apply allowed/);
  assert.match(renderedText, /planner-canonical-contract/);
  assert.match(renderedText, /ui-boot-contract/);

  const emptyRendered = spatialApp.renderDeskSection({
    id: 'qa-repair-lanes-empty',
    label: 'Repair Lanes',
    kind: 'qa-repair-lanes',
    summary: 'Repair lanes surface trust policy, blocked actions, and validation status.',
    emptyState: 'No active or recent repair lanes are recorded yet.',
    repairLoopSummary: { blockedLanes: 0, activeLanes: 0 },
    lanes: [],
  }, helpers);
  assert.ok(emptyRendered);
  const emptyText = collectRenderText(emptyRendered).join(' ');
  assert.match(emptyText, /No active or recent repair lanes are recorded yet/);
}
