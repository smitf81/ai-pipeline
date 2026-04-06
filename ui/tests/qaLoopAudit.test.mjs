import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  runQaLoopAudit,
} = require('../qaLoopAudit.js');

export default async function runQaLoopAuditTests() {
  const repoRoot = path.resolve(process.cwd(), '..');
  const report = runQaLoopAudit(repoRoot);

  assert.ok(report);
  assert.equal(report.source, 'qa_loop_audit');
  assert.equal(report.total_faults, 3);
  assert.equal(report.faults.length, 3);
  assert.equal(report.comparisons.length, 3);

  const boot = report.faults.find((entry) => entry.fault_id === 'missing_required_asset');
  assert.ok(boot);
  assert.equal(boot.detected, true);
  assert.equal(boot.actual_lane, 'ui_boot_integrity');
  assert.equal(boot.validation_result, 'accepted');
  assert.equal(boot.final_state, 'boot_restored');

  const planner = report.faults.find((entry) => entry.fault_id === 'planner_canonical_mismatch');
  assert.ok(planner);
  assert.equal(planner.detected, true);
  assert.equal(planner.actual_lane, 'planner_canonical_integrity');
  assert.equal(planner.validation_result, 'policy_blocked');
  assert.equal(planner.final_state, 'safe_stop');

  const mcp = report.faults.find((entry) => entry.fault_id === 'qa_mcp_stale');
  assert.ok(mcp);
  assert.equal(mcp.detected, true);
  assert.equal(mcp.actual_lane, null);
  assert.equal(mcp.validation_result, 'stale');
  assert.equal(mcp.final_state, 'stale');
}
