import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import {
  buildStudioBootFailureMarkup,
  normalizeStudioBootManifest,
  probeStudioBootAssets,
} from '../public/spatial/bootContract.js';

const require = createRequire(import.meta.url);
const {
  evaluateSpatialBootHealth,
  evaluateStudioClientBootContract,
} = require('../server.js');

export default async function runBootIntegrityTests() {
  const liveContract = evaluateStudioClientBootContract();
  assert.equal(liveContract.ok, true);
  assert.equal(liveContract.safeMode, false);
  assert.equal(liveContract.failure_class, null);
  assert.equal(liveContract.failure_stage, null);
  assert.equal(liveContract.asset, null);
  assert.equal(liveContract.http_status, null);
  assert.equal(liveContract.assets.some((asset) => asset.path === '/vendor/react.development.js' && asset.ok), true);
  assert.equal(liveContract.assets.some((asset) => asset.path === '/vendor/react-dom.development.js' && asset.ok), true);
  assert.equal(liveContract.assets.some((asset) => asset.path === '/spatial/intentContract.browser.js' && asset.ok), true);
  assert.equal(liveContract.assets.some((asset) => asset.path === '/spatial/spatialSeamContract.js' && asset.ok), true);

  const bootHealth = evaluateSpatialBootHealth();
  assert.equal(bootHealth.checked, true);
  assert.equal(bootHealth.safeMode, false);
  assert.equal(bootHealth.failureClass, null);
  assert.equal(bootHealth.failureStage, null);
  assert.equal(bootHealth.asset, null);
  assert.equal(bootHealth.httpStatus, null);
  assert.equal(bootHealth.clientBootContract.asset, null);

  const publicRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-boot-contract-'));
  fs.mkdirSync(path.join(publicRoot, 'spatial'), { recursive: true });
  fs.writeFileSync(path.join(publicRoot, 'index.html'), '<!doctype html><div id="spatial-root"></div>', 'utf8');
  fs.writeFileSync(path.join(publicRoot, 'spatial', 'spatialBootstrap.js'), 'export const loaded = true;', 'utf8');
  fs.writeFileSync(path.join(publicRoot, 'spatial', 'spatialApp.js'), 'export const mounted = true;', 'utf8');

  const syntheticContract = evaluateStudioClientBootContract(process.cwd(), {
    publicRoot,
    manifest: {
      root_id: 'spatial-root',
      assets: [
        { path: '/spatial/spatialBootstrap.js', stage: 'core_bundle_loaded', blocking: true },
        { path: '/spatial/spatialApp.js', stage: 'required_modules_loaded', blocking: true },
      ],
    },
  });
  assert.equal(syntheticContract.ok, true);
  assert.equal(syntheticContract.safeMode, false);
  assert.equal(syntheticContract.failure_class, null);

  const manifest = normalizeStudioBootManifest({
    assets: [
      { path: '/spatial/spatialApp.js', label: 'Spatial app', stage: 'required_modules_loaded', blocking: true },
      { path: '/intentAnalysis.js', label: 'Intent analysis', stage: 'required_modules_loaded', blocking: true },
      { path: '/favicon.ico', label: 'Favicon', stage: 'required_modules_loaded', blocking: false },
    ],
  });
  const assetProbe = await probeStudioBootAssets(manifest, {
    fetchImpl: async (targetPath) => ({
      status: targetPath === '/spatial/spatialApp.js' ? 200 : 404,
    }),
  });
  assert.equal(assetProbe.ok, false);
  assert.equal(assetProbe.blockingFailure.type, 'missing_required_asset');
  assert.equal(assetProbe.blockingFailure.asset, '/intentAnalysis.js');
  assert.equal(assetProbe.assets.find((asset) => asset.path === '/favicon.ico').blocking, false);

  const syntheticFailureContract = evaluateStudioClientBootContract(process.cwd(), {
    publicRoot,
    manifest,
  });
  assert.equal(syntheticFailureContract.ok, false);
  assert.equal(syntheticFailureContract.failure_class, 'missing_client_asset');
  assert.equal(syntheticFailureContract.asset, '/intentAnalysis.js');
  assert.equal(syntheticFailureContract.http_status, 404);

  const failureMarkup = buildStudioBootFailureMarkup(assetProbe.blockingFailure, {
    errors: [{ message: 'Failed to load /intentAnalysis.js' }],
    warnings: [{ reason: 'Favicon unavailable but non-blocking.' }],
  });
  assert.match(failureMarkup, /Boot failed/);
  assert.match(failureMarkup, /\/intentAnalysis\.js/);
  assert.match(failureMarkup, /Favicon unavailable but non-blocking/);
  assert.match(failureMarkup, /Loading boot-safe recovery controls/);
  assert.match(failureMarkup, /data-recovery-shell="boot-failure"/);
}
