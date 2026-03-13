import assert from 'node:assert/strict';
import path from 'node:path';

import { smokeLoadSpatialApp } from './helpers/browser-module-loader.mjs';

export default async function runSpatialAppSmokeTest() {
  const spatialAppPath = path.resolve(process.cwd(), 'public', 'spatial', 'spatialApp.js');
  const loaded = await smokeLoadSpatialApp(spatialAppPath);
  assert.equal(loaded.default.loaded, true);
  assert.ok(loaded.default.firstRender);
}
