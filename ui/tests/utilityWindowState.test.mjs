import assert from 'node:assert/strict';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

const windowStatePath = path.resolve(process.cwd(), 'public', 'spatial', 'windowState.js');

export default async function runUtilityWindowStateTests() {
  const windowState = await loadModuleCopy(windowStatePath, { label: 'windowState' });
  const defaults = windowState.createDefaultUtilityWindows();

  assert.ok(defaults['studio-map']);
  assert.equal(defaults['studio-map'].open, false);
  assert.equal(defaults['studio-map'].docked, true);
  assert.deepEqual(Object.keys(defaults), [
    'environment',
    'qa',
    'context',
    'reports',
    'roster',
    'studio-map',
    'scorecards',
  ]);

  const normalized = windowState.normalizeUtilityWindowsState({
    'studio-map': {
      open: true,
      docked: false,
      minimized: true,
      position: { left: 12, top: 18 },
    },
  });
  assert.equal(normalized['studio-map'].open, true);
  assert.equal(normalized['studio-map'].docked, false);
  assert.equal(normalized['studio-map'].minimized, true);
  assert.equal(normalized['studio-map'].position.left >= 24, true);
  assert.equal(normalized['studio-map'].position.top >= 24, true);
}
