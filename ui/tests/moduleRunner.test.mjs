import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default async function runModuleRunnerTests() {
  const moduleRunnerPath = path.resolve(process.cwd(), 'moduleRunner.js');
  const { executeModuleAction } = require(moduleRunnerPath);

  const successLogs = [];
  const successResult = executeModuleAction({
    action: 'run_module',
    module_id: 'material_gen',
    input: {
      intent: {
        type: 'material',
        surface: 'wet stone',
        properties: {
          tileable: true,
        },
      },
      constraints: {
        engine_target: 'unreal',
      },
      context: {},
    },
  }, {
    logger: (line) => successLogs.push(line),
  });

  assert.equal(successResult.ok, true);
  assert.deepEqual(successResult.stages, ['plan', 'generate', 'refine', 'validate', 'export']);
  assert.equal(successResult.module_id, 'material_gen');
  assert.equal(successResult.output.validation.status, 'pass');
  assert.equal(successResult.confidence, 0.82);
  assert.equal(successResult.requires_human_review, false);
  assert.equal(successLogs.length >= 6, true);

  const invalidAction = executeModuleAction({
    action: 'run_wrong_action',
    module_id: 'material_gen',
    input: {
      intent: {},
      constraints: {},
    },
  });
  assert.equal(invalidAction.ok, false);
  assert.equal(invalidAction.error.code, 'invalid-action');


  const unknownModule = executeModuleAction({
    action: 'run_module',
    module_id: 'unknown_module',
    input: {
      intent: {},
      constraints: {},
    },
  });
  assert.equal(unknownModule.ok, false);
  assert.equal(unknownModule.error.code, 'unsupported-module');

  const malformedInput = executeModuleAction({
    action: 'run_module',
    module_id: 'material_gen',
    input: {
      intent: 'not-an-object',
      constraints: {},
    },
  });
  assert.equal(malformedInput.ok, false);
  assert.equal(malformedInput.error.code, 'invalid-input-intent');

  const validationFailure = executeModuleAction({
    action: 'run_module',
    module_id: 'material_gen',
    input: {
      intent: {
        type: 'material',
        surface: 'wet stone',
      },
      constraints: {
        force_missing_normal_map: true,
      },
      context: {},
    },
  });
  assert.equal(validationFailure.ok, false);
  assert.equal(validationFailure.error.code, 'validation-failed');
  assert.equal(validationFailure.error.details.validation.status, 'fail');
  assert.equal(Array.isArray(validationFailure.error.details.validation.errors), true);
}
