import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  evaluateStudioClientBootContract,
} = require('../server.js');

export default async function runQaUiBootCanaryTests() {
  const repoRoot = path.resolve(process.cwd(), '..');
  const contract = evaluateStudioClientBootContract(repoRoot);

  assert.ok(contract);
  assert.equal(typeof contract.ok, 'boolean');
  assert.ok(contract.stages && typeof contract.stages === 'object');
  assert.ok(Object.prototype.hasOwnProperty.call(contract.stages, 'required_modules_loaded'));
  assert.ok(Object.prototype.hasOwnProperty.call(contract, 'failure_class'));
}
