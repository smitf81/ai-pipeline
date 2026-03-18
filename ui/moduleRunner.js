const fs = require('node:fs');
const path = require('node:path');

const MODULE_ID = 'material_gen';
const MODULE_MANIFEST_PATH = path.resolve(__dirname, '..', 'modules', 'examples', 'material_gen.module.json');

class ModuleRunError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ModuleRunError';
    this.code = code;
    this.details = details;
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateRunEnvelope(payload) {
  if (!ensureObject(payload)) throw new ModuleRunError('invalid-request', 'Module request must be an object.');
  if (payload.action !== 'run_module') throw new ModuleRunError('invalid-action', 'Only action "run_module" is supported.');
  if (payload.module_id !== MODULE_ID) {
    throw new ModuleRunError('unsupported-module', `Unsupported module_id: ${payload.module_id || 'undefined'}.`);
  }
  if (!ensureObject(payload.input)) throw new ModuleRunError('invalid-input', 'input must be an object.');
  if (!ensureObject(payload.input.intent)) throw new ModuleRunError('invalid-input-intent', 'input.intent must be an object.');
  if (!ensureObject(payload.input.constraints)) throw new ModuleRunError('invalid-input-constraints', 'input.constraints must be an object.');
}

function validateManifest(manifest) {
  if (!ensureObject(manifest)) throw new ModuleRunError('invalid-manifest', 'Module manifest must be an object.');
  if (manifest.module_id !== MODULE_ID) throw new ModuleRunError('invalid-manifest-module', 'Manifest module_id mismatch.');
  const stages = Array.isArray(manifest.pipeline) ? manifest.pipeline.map((entry) => entry?.step).filter(Boolean) : [];
  if (!stages.length) throw new ModuleRunError('invalid-pipeline', 'Module pipeline must declare at least one stage.');
  const unsupportedStage = stages.find((stage) => !['plan', 'generate', 'refine', 'validate', 'export'].includes(stage));
  if (unsupportedStage) throw new ModuleRunError('invalid-pipeline-stage', `Unsupported pipeline stage: ${unsupportedStage}.`);
  const requiredStages = ['plan', 'generate', 'refine', 'validate', 'export'];
  const missing = requiredStages.filter((stage) => !stages.includes(stage));
  if (missing.length) throw new ModuleRunError('invalid-pipeline', `Module pipeline missing required stages: ${missing.join(', ')}.`);
  return stages;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function runValidationChecks(artifact) {
  const checks = ['is_tileable', 'pbr_consistent', 'no_missing_dependencies'];
  const errors = [];
  const maps = artifact?.data?.maps || {};
  if (artifact?.data?.tileable !== true) errors.push('is_tileable failed: artifact.data.tileable must be true.');
  if (!(maps.albedo && maps.normal && maps.roughness)) errors.push('pbr_consistent failed: albedo/normal/roughness maps are required.');
  if (!Array.isArray(artifact?.dependencies)) errors.push('no_missing_dependencies failed: dependencies must be an array.');
  const status = errors.length ? 'fail' : 'pass';
  return { checks, status, errors };
}

function runMaterialGenModule(payload, { logger = null } = {}) {
  validateRunEnvelope(payload);

  if (!fs.existsSync(MODULE_MANIFEST_PATH)) {
    throw new ModuleRunError('module-not-found', `Module manifest not found: ${MODULE_MANIFEST_PATH}`);
  }

  const manifest = readJson(MODULE_MANIFEST_PATH);
  const declaredStages = validateManifest(manifest);

  const input = deepClone(payload.input);
  const state = {
    module_id: manifest.module_id,
    version: manifest.version,
    input,
    plan: null,
    artifact: null,
    validation: null,
  };
  const stages = [];

  for (const stage of declaredStages) {
    if (typeof logger === 'function') {
      logger(`[module-runner] module=${manifest.module_id} stage=${stage}`);
    }
    stages.push(stage);

    if (stage === 'plan') {
      state.plan = {
        type: input.intent.type || 'material',
        surface: input.intent.surface || 'generic',
        properties: {
          ...(ensureObject(input.intent.properties) ? input.intent.properties : {}),
          tileable: input.intent.properties?.tileable ?? true,
        },
      };
      continue;
    }

    if (stage === 'generate') {
      state.artifact = deepClone(manifest.output.artifact);
      state.artifact.id = `${state.plan.surface || 'material'}_v1`.replace(/[^a-zA-Z0-9_\-]+/g, '_');
      if (input.constraints.force_missing_normal_map) {
        state.artifact.data.maps.normal = '';
      }
      continue;
    }

    if (stage === 'refine') {
      if (input.constraints.require_tileable !== false) {
        state.artifact.data.tileable = true;
      }
      continue;
    }

    if (stage === 'validate') {
      state.validation = runValidationChecks(state.artifact);
      if (typeof logger === 'function') {
        logger(`[module-runner] module=${manifest.module_id} validation=${state.validation.status}`);
      }
      if (state.validation.status !== 'pass') {
        throw new ModuleRunError('validation-failed', 'Module output failed validation checks.', {
          validation: state.validation,
          module_id: manifest.module_id,
          stages,
        });
      }
      continue;
    }

    if (stage === 'export') {
      const result = {
        ok: true,
        action: payload.action,
        module_id: manifest.module_id,
        version: manifest.version,
        stages,
        output: {
          artifact: state.artifact,
          metadata: {
            ...deepClone(manifest.output.metadata),
            module_version: manifest.version,
          },
          validation: state.validation,
        },
        confidence: manifest.confidence,
        requires_human_review: manifest.requires_human_review,
      };
      if (typeof logger === 'function') {
        logger(`[module-runner] module=${manifest.module_id} confidence=${result.confidence} requires_human_review=${result.requires_human_review}`);
      }
      return result;
    }
  }

  throw new ModuleRunError('pipeline-incomplete', 'Module did not reach export stage.');
}

function executeModuleAction(payload, options = {}) {
  try {
    return runMaterialGenModule(payload, options);
  } catch (error) {
    if (error instanceof ModuleRunError) {
      return {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details || {},
        },
      };
    }
    return {
      ok: false,
      error: {
        code: 'runtime-error',
        message: String(error.message || error),
        details: {},
      },
    };
  }
}

module.exports = {
  MODULE_ID,
  executeModuleAction,
  runMaterialGenModule,
  ModuleRunError,
};
