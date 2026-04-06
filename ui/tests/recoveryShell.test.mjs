import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildRecoveryShellMarkup,
  buildRecoveryViewModel,
} from '../public/spatial/recoveryShell.js';

export default async function runRecoveryShellTests() {
  const model = buildRecoveryViewModel({
    failure: {
      stage: 'required_modules_loaded',
      type: 'module_load_failure',
      asset: '/spatial/spatialApp.js',
      reason: 'Failed to import the main studio entry.',
    },
    daemon: {
      daemon: {
        status: 'blocked',
        phase: 'blocked',
        failure_class: 'module_load_failure',
        failure_stage: 'required_modules_loaded',
        asset: '/spatial/spatialApp.js',
        reason: 'Failed to import the main studio entry.',
        selected_lane: 'ui_boot_integrity',
        attempt_count: 1,
        max_attempts: 2,
        blocked_reason: 'blocked_needs_external_patch',
        updated_at: '2026-04-06T12:02:00.000Z',
        latest_attempt: {
          kind: 'bounded_fix',
          status: 'blocked',
          verdict: 'blocked',
          summary: 'No safe bounded syntax fix was available.',
          reason: 'Model output was not safe to apply.',
          at: '2026-04-06T12:01:30.000Z',
        },
      },
    },
  });

  assert.equal(model.daemon.status, 'blocked');
  assert.equal(model.daemon.selectedLane, 'ui_boot_integrity');
  assert.equal(model.daemon.blockedReason, 'blocked_needs_external_patch');
  assert.equal(model.latestAttempt.kind, 'bounded_fix');

  const markup = buildRecoveryShellMarkup(model);
  assert.match(markup, /Autonomous Boot Recovery Daemon v0/);
  assert.match(markup, /Current phase:/);
  assert.match(markup, /blocked_needs_external_patch/);
  assert.match(markup, /No recovery attempt has been recorded yet|No safe bounded syntax fix was available/);
  assert.doesNotMatch(markup, /CTO attempts executive fix/);
  assert.doesNotMatch(markup, /Run bounded QA recovery/);

  const recoverySource = fs.readFileSync(path.resolve(process.cwd(), 'public', 'spatial', 'recoveryShell.js'), 'utf8');
  assert.doesNotMatch(recoverySource, /spatialApp\.js/);
  assert.doesNotMatch(recoverySource, /studioData\.js/);
}
