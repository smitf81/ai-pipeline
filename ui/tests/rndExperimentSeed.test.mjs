import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

const contractPath = path.resolve(process.cwd(), 'public', 'spatial', 'rndExperimentContract.js');

export default async function runRndExperimentSeedTests() {
  const contract = await loadModuleCopy(contractPath, { label: 'rndExperimentContract' });
  const seedPath = path.resolve(process.cwd(), '..', 'data', 'spatial', 'rnd-experiments.json');
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

  assert.equal(seed.contract, contract.RND_EXPERIMENT_CONTRACT.id);
  assert.equal(Array.isArray(seed.experiments), true);
  assert.equal(seed.experiments.length, 1);

  const record = seed.experiments[0];
  const validation = contract.validateRndExperimentRecord(record);

  assert.equal(validation.ok, true);
  assert.deepEqual(validation.issues, []);
  assert.equal(validation.record.id, 'RND-0001-JFA-2D');
  assert.equal(validation.record.lifecycle, 'proposed');
  assert.equal(validation.record.integration_target, 'delivery-planning');
  assert.equal(validation.record.scope.length > 0, true);
  assert.deepEqual(validation.record.what_worked, []);
  assert.deepEqual(validation.record.what_failed, []);
  assert.deepEqual(validation.record.reusable_components, []);
  assert.deepEqual(validation.record.extracted_primitives, []);
}
