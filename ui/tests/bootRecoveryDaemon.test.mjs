import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildBootRecoveryDaemonState,
  readBootRecoveryDaemonState,
  runAutonomousBootRecoveryDaemon,
} = require('../server.js');

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ace-boot-recovery-daemon-'));
}

function makeBootHealth(overrides = {}) {
  return {
    checked: true,
    ok: false,
    safeMode: true,
    reason: 'Spatial app parse failed.',
    checkedAt: '2026-04-06T12:00:00.000Z',
    failureClass: 'module_load_failure',
    failureStage: 'required_modules_loaded',
    asset: '/spatial/spatialApp.js',
    clientBootContract: {
      failure_class: 'module_load_failure',
      failure_stage: 'required_modules_loaded',
      asset: '/spatial/spatialApp.js',
      reason: 'Spatial app parse failed.',
    },
    ...overrides,
  };
}

export default async function runBootRecoveryDaemonTests() {
  const successRoot = makeTempRoot();
  try {
    let bootChecks = 0;
    const recovered = runAutonomousBootRecoveryDaemon(successRoot, {
      bootHealthEvaluator: () => {
        bootChecks += 1;
        if (bootChecks === 1) return makeBootHealth();
        return makeBootHealth({
          ok: true,
          safeMode: false,
          reason: '',
          failureClass: null,
          failureStage: null,
          asset: null,
        });
      },
      constrainedFixRunner: () => ({
        ok: true,
        message: 'Applied a bounded syntax fix.',
        artifactRefs: ['brain/context/safe_mode/constrained-fix-pass.json'],
        autoFix: {
          ok: true,
          status: 'applied',
          reason: 'Rewrote a malformed browser-safe module export.',
        },
      }),
      repairLoopBuilder: () => ({
        jobs: [],
        latestJob: null,
      }),
    });

    assert.equal(recovered.status, 'recovered');
    assert.equal(recovered.phase, 'recovered');
    assert.equal(recovered.auto_reload_ready, true);
    assert.equal(recovered.latest_attempt.kind, 'bounded_fix');
    assert.equal(recovered.attempt_count, 1);
    assert.equal(fs.existsSync(path.join(successRoot, 'brain', 'context', 'safe_mode', 'boot-recovery-daemon.json')), true);
  } finally {
    fs.rmSync(successRoot, { recursive: true, force: true });
  }

  const blockedRoot = makeTempRoot();
  try {
    const blocked = runAutonomousBootRecoveryDaemon(blockedRoot, {
      bootHealthEvaluator: () => makeBootHealth(),
      constrainedFixRunner: () => ({
        ok: false,
        message: 'No safe bounded fix exists.',
        autoFix: {
          ok: false,
          status: 'blocked',
          reason: 'Patch candidate crossed trust-policy scope.',
        },
      }),
      repairLoopBuilder: () => ({
        jobs: [],
        latestJob: null,
      }),
    });

    assert.equal(blocked.status, 'blocked');
    assert.equal(blocked.phase, 'blocked');
    assert.equal(blocked.blocked_reason, 'blocked_needs_external_patch');
    assert.equal(blocked.auto_reload_ready, false);
    assert.equal(readBootRecoveryDaemonState(blockedRoot).blocked_reason, 'blocked_needs_external_patch');
  } finally {
    fs.rmSync(blockedRoot, { recursive: true, force: true });
  }

  const repairRoot = makeTempRoot();
  try {
    let bootChecks = 0;
    const repairDriven = runAutonomousBootRecoveryDaemon(repairRoot, {
      bootHealthEvaluator: () => {
        bootChecks += 1;
        if (bootChecks < 3) return makeBootHealth({ reason: 'Studio still failing preflight.' });
        return makeBootHealth({
          ok: true,
          safeMode: false,
          reason: '',
          failureClass: null,
          failureStage: null,
          asset: null,
        });
      },
      constrainedFixRunner: () => ({
        ok: false,
        message: 'Bounded safe-mode fix could not safely apply.',
        autoFix: {
          ok: false,
          status: 'blocked',
          reason: 'No direct boot-safe fix found.',
        },
      }),
      repairLoopBuilder: () => ({
        jobs: [{
          id: 'repair_job_001',
          lane: 'ui_boot_integrity',
          status: 'open',
          investigation_id: 'qa_inv_boot_001',
        }],
        latestJob: {
          id: 'repair_job_001',
          lane: 'ui_boot_integrity',
          status: 'open',
          investigation_id: 'qa_inv_boot_001',
        },
      }),
      repairAttemptRunner: () => ({
        ok: true,
        verdict: 'accepted',
        reason: 'Repair lane patched the boot helper.',
        validation: {
          ok: true,
          verdict: 'accepted',
          summary: 'Boot helper validation passed.',
        },
        job: {
          id: 'repair_job_001',
          lane: 'ui_boot_integrity',
        },
      }),
    });

    assert.equal(repairDriven.status, 'recovered');
    assert.equal(repairDriven.latest_attempt.kind, 'qa_repair');
    assert.equal(repairDriven.selected_lane, 'ui_boot_integrity');
  } finally {
    fs.rmSync(repairRoot, { recursive: true, force: true });
  }

  const idleState = buildBootRecoveryDaemonState(process.cwd(), {
    bootHealth: makeBootHealth({
      ok: true,
      safeMode: false,
      reason: '',
      failureClass: null,
      failureStage: null,
      asset: null,
    }),
    repairLoop: { latestJob: null, jobs: [] },
  });
  assert.equal(idleState.status, 'healthy');
}
