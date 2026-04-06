import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import { smokeLoadSpatialApp } from './helpers/browser-module-loader.mjs';

const require = createRequire(import.meta.url);
const {
  evaluateStudioClientBootContract,
  getHealthSnapshot,
} = require('../server.js');
const {
  buildQaRepairExecutorBrief,
  buildQaRepairJobFromInvestigation,
  getQaRepairLaneConfig,
  maybeBridgeOpenInvestigationsToRepairJobs,
  runQaRepairAttempt,
  selectQaRepairLaneForInvestigation,
} = require('../qaRepairLoop.js');
const {
  UI_BOOT_INTEGRITY_LANE,
  buildUiBootIntegrityInvestigation,
} = require('../uiBootIntegrity.js');

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ui-boot-lane-'));
}

function createBrokenBootFixture(rootPath, { assetPath = '/intentAnalysis.js' } = {}) {
  const publicRoot = path.join(rootPath, 'ui', 'public');
  const spatialRoot = path.join(publicRoot, 'spatial');
  fs.mkdirSync(spatialRoot, { recursive: true });
  fs.writeFileSync(path.join(publicRoot, 'index.html'), '<!doctype html><div id="spatial-root"></div>', 'utf8');
  fs.writeFileSync(path.join(spatialRoot, 'spatialBootstrap.js'), 'export const boot = true;\n', 'utf8');
  fs.writeFileSync(
    path.join(spatialRoot, 'spatialApp.js'),
    "import { buildCanonicalIntentContract } from '../../intentAnalysis.js';\nexport function SpatialNotebook() { return { ok: true, buildCanonicalIntentContract }; }\n",
    'utf8',
  );
  fs.writeFileSync(path.join(rootPath, 'ui', 'intentAnalysis.js'), 'module.exports = { buildCanonicalIntentContract() { return {}; } };\n', 'utf8');
  fs.writeFileSync(path.join(spatialRoot, 'boot-manifest.json'), `${JSON.stringify({
    version: 'ace/studio-boot-contract.v1',
    root_id: 'spatial-root',
    mount_marker: {
      attribute: 'data-boot',
      value: 'studio-mounted',
    },
    blank_render_timeout_ms: 5000,
    entry_module_import: './spatialApp.js',
    assets: [
      {
        path: '/spatial/spatialBootstrap.js',
        label: 'Studio bootstrap entry',
        kind: 'boot_entry',
        stage: 'core_bundle_loaded',
        blocking: true,
      },
      {
        path: '/spatial/spatialApp.js',
        label: 'Spatial app entry module',
        kind: 'app_entry',
        stage: 'required_modules_loaded',
        blocking: true,
      },
      {
        path: assetPath,
        label: 'Missing required asset',
        kind: 'required_module',
        stage: 'required_modules_loaded',
        blocking: true,
      },
    ],
  }, null, 2)}\n`, 'utf8');
  return {
    publicRoot,
    manifestPath: path.join(spatialRoot, 'boot-manifest.json'),
    spatialAppPath: path.join(spatialRoot, 'spatialApp.js'),
  };
}

function readFixtureManifest(fixture = null) {
  return JSON.parse(fs.readFileSync(fixture.manifestPath, 'utf8'));
}

function evaluateFixtureContract(fixture = null) {
  return evaluateStudioClientBootContract(process.cwd(), {
    publicRoot: fixture.publicRoot,
    manifest: readFixtureManifest(fixture),
  });
}

export default async function runUiBootIntegrityLaneTests() {
  const repoRoot = path.resolve(process.cwd(), '..');
  const liveContract = evaluateStudioClientBootContract();
  const liveHealth = getHealthSnapshot();
  assert.equal(liveContract.ok, true);
  assert.equal(liveHealth.bootHealth.failureClass, null);

  const laneConfig = getQaRepairLaneConfig(UI_BOOT_INTEGRITY_LANE);
  assert.ok(laneConfig);
  assert.equal(laneConfig.owner_department, 'QA');
  assert.deepEqual(laneConfig.allowed_trigger_classes, ['missing_client_asset']);
  assert.ok(laneConfig.scoped_targets.includes('ui/public/spatial/spatialApp.js'));

  const bridgeRoot = makeTempRoot();
  try {
    const fixture = createBrokenBootFixture(bridgeRoot);
    const brokenContract = evaluateFixtureContract(fixture);
    assert.equal(brokenContract.failure_class, 'missing_client_asset');
    assert.equal(brokenContract.asset, '/intentAnalysis.js');

    const investigationResult = buildUiBootIntegrityInvestigation(bridgeRoot, {
      bootHealth: {
        safeMode: true,
        reason: brokenContract.reason,
        failureClass: brokenContract.failure_class,
        failureStage: brokenContract.failure_stage,
        asset: brokenContract.asset,
        httpStatus: brokenContract.http_status,
        clientBootContract: brokenContract,
      },
    });
    assert.equal(investigationResult.created, true);
    assert.equal(investigationResult.investigation.trigger, 'missing_client_asset');
    assert.equal(selectQaRepairLaneForInvestigation(investigationResult.investigation)?.lane_id, UI_BOOT_INTEGRITY_LANE);

    const job = buildQaRepairJobFromInvestigation(bridgeRoot, investigationResult.investigation);
    assert.ok(job);
    assert.equal(job.lane, UI_BOOT_INTEGRITY_LANE);

    const bridgedJob = maybeBridgeOpenInvestigationsToRepairJobs(bridgeRoot, {
      investigations: [investigationResult.investigation],
    })[0];
    assert.ok(bridgedJob);

    const brief = buildQaRepairExecutorBrief(bridgedJob, investigationResult.investigation);
    assert.equal(brief.boot_asset, '/intentAnalysis.js');
    assert.equal(brief.boot_failure_class, 'missing_client_asset');
    assert.equal(brief.boot_failure_stage, 'required_modules_loaded');
    assert.ok(brief.allowed_files.every((file) => laneConfig.scoped_targets.includes(file)));

    const repairResult = runQaRepairAttempt(bridgeRoot, {
      repairJobId: bridgedJob.id,
      validationRunner: () => {
        const repairedContract = evaluateFixtureContract(fixture);
        return {
          ok: repairedContract.ok,
          verdict: repairedContract.ok ? 'accepted' : 'rejected',
          summary: repairedContract.ok
            ? 'Fixture boot contract no longer reports a missing client asset.'
            : repairedContract.reason,
          checks: [
            {
              id: 'fixture-boot-contract',
              ok: repairedContract.ok,
              asset: repairedContract.asset,
            },
          ],
        };
      },
    });

    assert.equal(repairResult.verdict, 'accepted');
    assert.equal(repairResult.job.status, 'accepted');
    assert.equal(repairResult.retry_allowed, false);
    assert.ok(repairResult.attempt.changed_files.every((file) => laneConfig.scoped_targets.includes(file)));

    const repairedManifest = readFixtureManifest(fixture);
    assert.equal(repairedManifest.assets.some((asset) => asset.path === '/intentAnalysis.js'), false);
    assert.equal(repairedManifest.assets.some((asset) => asset.path === '/spatial/intentContract.browser.js'), true);
    assert.match(fs.readFileSync(fixture.spatialAppPath, 'utf8'), /intentContract\.browser\.js/);
    assert.equal(evaluateFixtureContract(fixture).ok, true);
  } finally {
    fs.rmSync(bridgeRoot, { recursive: true, force: true });
  }

  const ambiguousRoot = makeTempRoot();
  try {
    createBrokenBootFixture(ambiguousRoot, { assetPath: '/mysteryModule.js' });
    const ambiguousInvestigation = buildUiBootIntegrityInvestigation(ambiguousRoot, {
      bootHealth: {
        safeMode: true,
        reason: 'Studio shell mounted, but boot failed because required client asset "/mysteryModule.js" was missing.',
        failureClass: 'missing_client_asset',
        failureStage: 'required_modules_loaded',
        asset: '/mysteryModule.js',
        httpStatus: 404,
      },
    }).investigation;
    const ambiguousJob = maybeBridgeOpenInvestigationsToRepairJobs(ambiguousRoot, {
      investigations: [ambiguousInvestigation],
    })[0];
    const blockedResult = runQaRepairAttempt(ambiguousRoot, {
      repairJobId: ambiguousJob.id,
    });
    assert.equal(blockedResult.verdict, 'inconclusive');
    assert.equal(blockedResult.job.status, 'needs_human_review');
    assert.equal(blockedResult.retry_allowed, false);
    assert.equal(blockedResult.safe_stop, true);
  } finally {
    fs.rmSync(ambiguousRoot, { recursive: true, force: true });
  }

  const spatialAppPath = path.resolve(process.cwd(), 'public', 'spatial', 'spatialApp.js');
  const smoke = await smokeLoadSpatialApp(spatialAppPath, { locationHref: 'http://localhost/?mode=qa' });
  assert.equal(smoke.default.rootElement.getAttribute('data-boot'), 'studio-mounted');
  assert.equal(smoke.default.rootElement.childNodes.length > 0, true);
}
