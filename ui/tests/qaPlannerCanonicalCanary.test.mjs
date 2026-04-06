import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildPlannerCanonicalIntegrityState,
} = require('../plannerCanonicalIntegrity.js');

export default async function runQaPlannerCanonicalCanaryTests() {
  const repoRoot = path.resolve(process.cwd(), '..');
  const state = buildPlannerCanonicalIntegrityState(repoRoot);

  assert.ok(state);
  assert.equal(state.source, 'planner_canonical_integrity');
  assert.ok(['healthy', 'blocked'].includes(state.status));
  assert.ok(Object.prototype.hasOwnProperty.call(state, 'covered'));
  assert.equal(typeof state.summary, 'string');
}
