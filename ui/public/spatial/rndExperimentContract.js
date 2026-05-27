const RND_EXPERIMENT_FIELDS = Object.freeze([
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

const RND_EXPERIMENT_LIFECYCLE_VALUES = Object.freeze([
  'proposed',
  'approved',
  'in_progress',
  'failed',
  'salvaged',
  'promoted',
  'archived',
]);

const RND_EXPERIMENT_PRIMITIVE_FIELDS = Object.freeze([
  'primitive',
  'description',
  'data_shape',
  'constraints',
  'example',
  'confidence',
]);

const RND_EXPERIMENT_PROMOTION_READY_LIFECYCLES = Object.freeze([
  'approved',
  'in_progress',
  'salvaged',
]);

export const RND_EXPERIMENT_CONTRACT = Object.freeze({
  id: 'rnd-experiment.v1',
  label: 'R&D Experiment Contract',
  fields: RND_EXPERIMENT_FIELDS,
  description: 'Canonical shape for read-only R&D experiment records.',
  lifecycleValues: RND_EXPERIMENT_LIFECYCLE_VALUES,
});

export const RND_EXPERIMENT_PRIMITIVE_CONTRACT = Object.freeze({
  id: 'rnd-experiment-primitive.v1',
  label: 'R&D Primitive Output Contract',
  fields: RND_EXPERIMENT_PRIMITIVE_FIELDS,
  description: 'Reusable ACE-compatible primitives extracted from successful R&D experiments, not prototypes or feature blobs.',
});

function normalizeText(value = '') {
  return String(value ?? '').trim();
}

function normalizeTextList(value = []) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeText(entry))
    .filter(Boolean);
}

function normalizeConfidence(value = 0) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return 0;
  }
  return Math.min(1, Math.max(0, normalized));
}

function buildIssue(field, code, message) {
  return {
    field,
    code,
    message,
  };
}

export function createDefaultRndExperimentPrimitiveRecord() {
  return {
    primitive: '',
    description: '',
    data_shape: '',
    constraints: [],
    example: '',
    confidence: 0,
  };
}

export function normalizeRndExperimentPrimitiveRecord(record = {}) {
  const source = record && typeof record === 'object' && !Array.isArray(record) ? record : {};
  return {
    primitive: normalizeText(source.primitive),
    description: normalizeText(source.description),
    data_shape: normalizeText(source.data_shape),
    constraints: normalizeTextList(source.constraints),
    example: normalizeText(source.example),
    confidence: normalizeConfidence(source.confidence),
  };
}

export function validateRndExperimentPrimitiveRecord(record = {}) {
  const issues = [];

  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return {
      ok: false,
      issues: [buildIssue('record', 'invalid-type', 'Primitive record must be an object.')],
      record: createDefaultRndExperimentPrimitiveRecord(),
    };
  }

  const normalized = normalizeRndExperimentPrimitiveRecord(record);

  ['primitive', 'description', 'data_shape', 'example'].forEach((field) => {
    if (!normalizeText(record[field])) {
      issues.push(buildIssue(field, 'missing-field', `${field} is required.`));
    }
  });

  if (!Array.isArray(record.constraints)) {
    issues.push(buildIssue('constraints', 'invalid-type', 'constraints must be an array of strings.'));
  } else {
    record.constraints.forEach((entry, index) => {
      if (typeof entry !== 'string' || !normalizeText(entry)) {
        issues.push(buildIssue('constraints', 'invalid-item', `constraints[${index}] must be a non-empty string.`));
      }
    });
  }

  if (!Number.isFinite(Number(record.confidence))) {
    issues.push(buildIssue('confidence', 'invalid-type', 'confidence must be a number between 0 and 1.'));
  } else {
    const confidence = Number(record.confidence);
    if (confidence < 0 || confidence > 1) {
      issues.push(buildIssue('confidence', 'invalid-value', 'confidence must be between 0 and 1.'));
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    record: normalized,
  };
}

function normalizePrimitiveList(value = []) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeRndExperimentPrimitiveRecord(entry))
    .filter((entry) => entry.primitive);
}

function normalizeReadinessFlag(value = null) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return null;
  if (['1', 'true', 'yes', 'y', 'passed', 'pass', 'ok', 'ready'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'failed', 'fail', 'blocked', 'not_ready'].includes(normalized)) return false;
  return null;
}

function normalizePromotionState(lifecycle, eligible) {
  if (lifecycle === 'promoted') return 'promoted';
  if (lifecycle === 'archived') return 'archived';
  return eligible ? 'eligible' : 'blocked';
}

export function createDefaultRndExperimentRecord() {
  return {
    id: '',
    hypothesis: '',
    lifecycle: 'proposed',
    scope: [],
    inputs: [],
    expected_output: '',
    success_criteria: '',
    failure_criteria: '',
    salvageable_components: [],
    integration_target: '',
    what_worked: [],
    what_failed: [],
    reusable_components: [],
    discard_reason: '',
    extracted_primitives: [],
  };
}

export function normalizeRndExperimentRecord(record = {}) {
  const source = record && typeof record === 'object' && !Array.isArray(record) ? record : {};
  const lifecycleSource = normalizeText(source.lifecycle || source.status || '').toLowerCase();
  const lifecycle = lifecycleSource && RND_EXPERIMENT_LIFECYCLE_VALUES.includes(lifecycleSource)
    ? lifecycleSource
    : 'proposed';
  return {
    id: normalizeText(source.id),
    hypothesis: normalizeText(source.hypothesis),
    lifecycle,
    scope: normalizeTextList(source.scope),
    inputs: normalizeTextList(source.inputs),
    expected_output: normalizeText(source.expected_output),
    success_criteria: normalizeText(source.success_criteria),
    failure_criteria: normalizeText(source.failure_criteria),
    salvageable_components: normalizeTextList(source.salvageable_components),
    integration_target: normalizeText(source.integration_target),
    what_worked: normalizeTextList(source.what_worked),
    what_failed: normalizeTextList(source.what_failed),
    reusable_components: normalizeTextList(source.reusable_components),
    discard_reason: normalizeText(source.discard_reason),
    extracted_primitives: normalizePrimitiveList(source.extracted_primitives),
  };
}

export function validateRndExperimentRecord(record = {}) {
  const issues = [];

  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return {
      ok: false,
      issues: [buildIssue('record', 'invalid-type', 'Experiment record must be an object.')],
      record: createDefaultRndExperimentRecord(),
    };
  }

  const normalized = normalizeRndExperimentRecord(record);

  ['id', 'hypothesis', 'expected_output', 'success_criteria', 'failure_criteria', 'integration_target'].forEach((field) => {
    if (!normalizeText(record[field])) {
      issues.push(buildIssue(field, 'missing-field', `${field} is required.`));
    }
  });

  const lifecycleSource = normalizeText(record.lifecycle || record.status || '').toLowerCase();
  if (!lifecycleSource) {
    issues.push(buildIssue('lifecycle', 'missing-field', 'lifecycle is required.'));
  } else if (!RND_EXPERIMENT_LIFECYCLE_VALUES.includes(lifecycleSource)) {
    issues.push(buildIssue('lifecycle', 'invalid-value', `lifecycle must be one of: ${RND_EXPERIMENT_LIFECYCLE_VALUES.join(', ')}.`));
  }

  ['scope', 'inputs', 'salvageable_components'].forEach((field) => {
    const value = record[field];
    if (!Array.isArray(value)) {
      issues.push(buildIssue(field, 'invalid-type', `${field} must be an array of strings.`));
      return;
    }
    value.forEach((entry, index) => {
      if (typeof entry !== 'string' || !normalizeText(entry)) {
        issues.push(buildIssue(field, 'invalid-item', `${field}[${index}] must be a non-empty string.`));
      }
    });
  });

  ['what_worked', 'what_failed', 'reusable_components'].forEach((field) => {
    if (record[field] == null) return;
    const value = record[field];
    if (!Array.isArray(value)) {
      issues.push(buildIssue(field, 'invalid-type', `${field} must be an array of strings.`));
      return;
    }
    value.forEach((entry, index) => {
      if (typeof entry !== 'string' || !normalizeText(entry)) {
        issues.push(buildIssue(field, 'invalid-item', `${field}[${index}] must be a non-empty string.`));
      }
    });
  });

  if (record.extracted_primitives == null) {
    issues.push(buildIssue('extracted_primitives', 'missing-field', 'extracted_primitives is required.'));
  } else if (!Array.isArray(record.extracted_primitives)) {
    issues.push(buildIssue('extracted_primitives', 'invalid-type', 'extracted_primitives must be an array of primitive records.'));
  } else {
    record.extracted_primitives.forEach((primitive, index) => {
      const primitiveValidation = validateRndExperimentPrimitiveRecord(primitive);
      primitiveValidation.issues.forEach((issue) => {
        issues.push(buildIssue(`extracted_primitives[${index}].${issue.field}`, issue.code, issue.message));
      });
    });
  }

  if (record.discard_reason != null && typeof record.discard_reason !== 'string') {
    issues.push(buildIssue('discard_reason', 'invalid-type', 'discard_reason must be a string.'));
  }

  return {
    ok: issues.length === 0,
    issues,
    record: normalized,
  };
}

export function evaluateRndExperimentPromotionReadiness(record = {}) {
  const normalized = normalizeRndExperimentRecord(record);
  const validation = validateRndExperimentRecord(record);
  const primitiveValidations = Array.isArray(normalized.extracted_primitives)
    ? normalized.extracted_primitives.map((primitive) => validateRndExperimentPrimitiveRecord(primitive))
    : [];
  const validPrimitiveCount = primitiveValidations.filter((result) => result.ok).length;
  const hasValidPrimitive = validPrimitiveCount > 0;
  const explicitQaFlag = normalizeReadinessFlag(
    record.basic_qa_passed
    ?? record.qa_passed
    ?? record.qa_status
    ?? record.validation_passed
    ?? null,
  );
  const basicQaPassed = explicitQaFlag != null
    ? explicitQaFlag
    : RND_EXPERIMENT_PROMOTION_READY_LIFECYCLES.includes(normalized.lifecycle);
  const hasIntegrationTarget = Boolean(normalized.integration_target);
  const terminalLifecycle = normalized.lifecycle === 'promoted' || normalized.lifecycle === 'archived';
  const contractValid = validation.ok;
  const eligible = contractValid && basicQaPassed && hasValidPrimitive && hasIntegrationTarget && !terminalLifecycle;
  const reasons = [];

  if (!contractValid) {
    reasons.push('Experiment contract validation failed.');
  }
  if (!basicQaPassed) {
    reasons.push('Basic QA has not passed.');
  }
  if (!hasValidPrimitive) {
    reasons.push('At least one extracted primitive is required.');
  }
  if (!hasIntegrationTarget) {
    reasons.push('A downstream integration target is required.');
  }
  if (normalized.lifecycle === 'promoted') {
    reasons.push('Experiment is already promoted.');
  } else if (normalized.lifecycle === 'archived') {
    reasons.push('Experiment is archived.');
  }

  return {
    eligible,
    state: normalizePromotionState(normalized.lifecycle, eligible),
    contractValid,
    basicQaPassed,
    hasIntegrationTarget,
    hasValidPrimitive,
    primitiveCount: Array.isArray(normalized.extracted_primitives) ? normalized.extracted_primitives.length : 0,
    validPrimitiveCount,
    lifecycle: normalized.lifecycle,
    integrationTarget: normalized.integration_target,
    reasons,
    primitives: primitiveValidations.map((result) => ({
      ok: result.ok,
      issues: result.issues,
      record: result.record,
    })),
    record: normalized,
  };
}
