import assert from 'node:assert/strict';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

const contractPath = path.resolve(process.cwd(), 'public', 'spatial', 'rndExperimentContract.js');

export default async function runRndExperimentContractTests() {
  const contract = await loadModuleCopy(contractPath, { label: 'rndExperimentContract' });

  assert.equal(contract.RND_EXPERIMENT_CONTRACT.id, 'rnd-experiment.v1');
  assert.deepEqual(contract.RND_EXPERIMENT_CONTRACT.fields, [
    'id',
    'hypothesis',
    'lifecycle',
    'scope',
    'inputs',
    'expected_output',
    'success_criteria',
    'failure_criteria',
    'salvageable_components',
    'integration_target',
    'what_worked',
    'what_failed',
    'reusable_components',
    'discard_reason',
    'extracted_primitives',
  ]);
  assert.deepEqual(contract.RND_EXPERIMENT_CONTRACT.lifecycleValues, [
    'proposed',
    'approved',
    'in_progress',
    'failed',
    'salvaged',
    'promoted',
    'archived',
  ]);
  assert.equal(contract.RND_EXPERIMENT_PRIMITIVE_CONTRACT.id, 'rnd-experiment-primitive.v1');
  assert.deepEqual(contract.RND_EXPERIMENT_PRIMITIVE_CONTRACT.fields, [
    'primitive',
    'description',
    'data_shape',
    'constraints',
    'example',
    'confidence',
  ]);

  const validPrimitive = {
    primitive: 'delivery-boundary-checklist',
    description: 'A reusable checklist for keeping sandbox work out of live delivery flows.',
    data_shape: 'ordered list of guardrail steps',
    constraints: ['must stay read-only', 'must not mutate delivery state'],
    example: 'Step 1: validate scope before any output is promoted.',
    confidence: 0.88,
  };

  const primitiveResult = contract.validateRndExperimentPrimitiveRecord(validPrimitive);
  assert.equal(primitiveResult.ok, true);
  assert.deepEqual(primitiveResult.issues, []);
  assert.deepEqual(primitiveResult.record, validPrimitive);

  const validExperiment = {
    id: 'rnd-exp-001',
    hypothesis: 'A sandbox prototype will reduce delivery uncertainty.',
    lifecycle: 'approved',
    scope: ['delivery handoff notes', 'prototype review'],
    inputs: ['brief', 'current layout truth'],
    expected_output: 'A grounded research note and prototype summary.',
    success_criteria: 'We can explain the delivery impact without shipping from R&D.',
    failure_criteria: 'The experiment produces no actionable learning.',
    salvageable_components: ['summary copy', 'validation notes'],
    integration_target: 'delivery-planning',
    what_worked: ['Fast feedback from the desk panel'],
    what_failed: ['No direct shipping pathway'],
    reusable_components: ['summary copy'],
    discard_reason: '',
    extracted_primitives: [validPrimitive],
  };

  const validResult = contract.validateRndExperimentRecord(validExperiment);
  assert.equal(validResult.ok, true);
  assert.deepEqual(validResult.issues, []);
  assert.deepEqual(validResult.record, validExperiment);

  const readinessResult = contract.evaluateRndExperimentPromotionReadiness(validExperiment);
  assert.equal(readinessResult.eligible, true);
  assert.equal(readinessResult.state, 'eligible');
  assert.equal(readinessResult.contractValid, true);
  assert.equal(readinessResult.basicQaPassed, true);
  assert.equal(readinessResult.hasValidPrimitive, true);
  assert.equal(readinessResult.validPrimitiveCount, 1);
  assert.equal(readinessResult.hasIntegrationTarget, true);

  const invalidPrimitiveResult = contract.validateRndExperimentPrimitiveRecord({
    primitive: '',
    description: '',
    data_shape: '',
    constraints: 'nope',
    example: '',
    confidence: 1.4,
  });
  assert.equal(invalidPrimitiveResult.ok, false);
  assert.ok(invalidPrimitiveResult.issues.some((issue) => issue.field === 'primitive' && issue.code === 'missing-field'));
  assert.ok(invalidPrimitiveResult.issues.some((issue) => issue.field === 'constraints' && issue.code === 'invalid-type'));
  assert.ok(invalidPrimitiveResult.issues.some((issue) => issue.field === 'confidence' && issue.code === 'invalid-value'));

  const invalidResult = contract.validateRndExperimentRecord({
    id: 'rnd-exp-002',
    hypothesis: '',
    lifecycle: 'unsupported',
    scope: 'not-an-array',
    inputs: [''],
    expected_output: '   ',
    success_criteria: '   ',
    failure_criteria: null,
    salvageable_components: [],
    integration_target: '',
    what_worked: 'nope',
    what_failed: [''],
    reusable_components: 'nope',
    discard_reason: 42,
    extracted_primitives: 'nope',
  });

  assert.equal(invalidResult.ok, false);
  assert.ok(invalidResult.issues.some((issue) => issue.field === 'hypothesis' && issue.code === 'missing-field'));
  assert.ok(invalidResult.issues.some((issue) => issue.field === 'lifecycle' && issue.code === 'invalid-value'));
  assert.ok(invalidResult.issues.some((issue) => issue.field === 'scope' && issue.code === 'invalid-type'));
  assert.ok(invalidResult.issues.some((issue) => issue.field === 'inputs' && issue.code === 'invalid-item'));
  assert.ok(invalidResult.issues.some((issue) => issue.field === 'failure_criteria' && issue.code === 'missing-field'));
  assert.ok(invalidResult.issues.some((issue) => issue.field === 'integration_target' && issue.code === 'missing-field'));
  assert.ok(invalidResult.issues.some((issue) => issue.field === 'what_worked' && issue.code === 'invalid-type'));
  assert.ok(invalidResult.issues.some((issue) => issue.field === 'what_failed' && issue.code === 'invalid-item'));
  assert.ok(invalidResult.issues.some((issue) => issue.field === 'reusable_components' && issue.code === 'invalid-type'));
  assert.ok(invalidResult.issues.some((issue) => issue.field === 'discard_reason' && issue.code === 'invalid-type'));
  assert.ok(invalidResult.issues.some((issue) => issue.field === 'extracted_primitives' && issue.code === 'invalid-type'));

  const blockedReadiness = contract.evaluateRndExperimentPromotionReadiness({
    id: 'rnd-exp-003',
    hypothesis: 'A prototype needs promotion gates.',
    lifecycle: 'proposed',
    scope: ['sandbox'],
    inputs: ['brief'],
    expected_output: 'A note.',
    success_criteria: 'A note exists.',
    failure_criteria: 'No note exists.',
    salvageable_components: ['notes'],
    integration_target: 'delivery-planning',
    extracted_primitives: [],
    what_worked: [],
    what_failed: [],
    reusable_components: [],
    discard_reason: '',
  });
  assert.equal(blockedReadiness.eligible, false);
  assert.equal(blockedReadiness.state, 'blocked');
  assert.ok(blockedReadiness.reasons.includes('Basic QA has not passed.'));
  assert.ok(blockedReadiness.reasons.includes('At least one extracted primitive is required.'));
}
