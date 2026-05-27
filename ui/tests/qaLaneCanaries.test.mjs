import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  QA_LANE_CANARIES,
  buildQaLaneCanaryState,
  emptyQaLaneCanaryState,
  getQaLaneCanaryRegistry,
  runQaLaneCanary,
  runQaLaneCanarySuite,
} = require('../qaLaneCanaries.js');

export default async function runQaLaneCanaryTests() {
  const repoRoot = path.resolve(process.cwd(), '..');
  const registry = getQaLaneCanaryRegistry();
  const validationRunner = ({ lane }) => ({
    ok: true,
    verdict: 'accepted',
    summary: `${lane.label} canary validation passed.`,
    checks: [],
  });

  assert.equal(QA_LANE_CANARIES.length, 3);
  assert.equal(registry.length, 3);
  assert.deepEqual(registry.map((entry) => entry.target_lane_id), [
    'ui_boot_integrity',
    'route_contract_health',
    'planner_canonical_integrity',
  ]);

  const bootCanary = runQaLaneCanary(repoRoot, registry.find((entry) => entry.target_lane_id === 'ui_boot_integrity'), {
    validationRunner,
  });
  assert.equal(bootCanary.selected_lane_id, 'ui_boot_integrity');
  assert.equal(bootCanary.policy_outcome, 'auto_apply_allowed');
  assert.equal(bootCanary.validation_status, 'accepted');
  assert.equal(bootCanary.status, 'pass');

  const routeCanary = runQaLaneCanary(repoRoot, registry.find((entry) => entry.target_lane_id === 'route_contract_health'), {
    validationRunner,
  });
  assert.equal(routeCanary.selected_lane_id, 'route_contract_health');
  assert.equal(routeCanary.policy_outcome, 'auto_apply_allowed');
  assert.equal(routeCanary.validation_status, 'accepted');
  assert.equal(routeCanary.status, 'pass');

  const plannerCanary = runQaLaneCanary(repoRoot, registry.find((entry) => entry.target_lane_id === 'planner_canonical_integrity'), {
    validationRunner,
  });
  assert.equal(plannerCanary.selected_lane_id, 'planner_canonical_integrity');
  assert.equal(plannerCanary.policy_outcome, 'guarded_manual_review');
  assert.equal(plannerCanary.validation_status, 'accepted');
  assert.equal(plannerCanary.status, 'pass');

  const suite = runQaLaneCanarySuite(repoRoot, { force: true, validationRunner });
  assert.equal(suite.total_canaries, 3);
  assert.equal(suite.failed_count, 0);
  assert.equal(suite.overall_status, 'pass');
  assert.deepEqual(suite.failing_canary_ids, []);

  const empty = emptyQaLaneCanaryState();
  assert.equal(empty.overall_status, 'idle');
  assert.equal(empty.total_canaries, 0);
  assert.deepEqual(empty.results, []);

  const failingSummary = buildQaLaneCanaryState([
    {
      canary_id: 'broken_canary',
      label: 'Broken canary',
      status: 'fail',
      checked_at: '2026-04-06T12:00:00.000Z',
      notes: ['Lane mismatch'],
    },
  ]);
  assert.equal(failingSummary.overall_status, 'fail');
  assert.equal(failingSummary.failed_count, 1);
  assert.deepEqual(failingSummary.failing_canary_ids, ['broken_canary']);
}
