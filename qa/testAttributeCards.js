const { TEST_METRIC_DEFINITIONS, TEST_METRIC_ORDER } = require('./testMetricDefinitions');

function clampScore(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(5, Math.max(1, parsed));
}

function roundTo(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function deriveFactorContribution(factorDefinition, rawScore) {
  const score = clampScore(rawScore);
  return factorDefinition?.invert ? (6 - score) : score;
}

function weightedAverage(items = []) {
  const weighted = items.filter((item) => Number.isFinite(item?.value) && Number.isFinite(item?.weight));
  if (!weighted.length) return 0;
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return 0;
  return weighted.reduce((sum, item) => sum + (item.value * item.weight), 0) / totalWeight;
}

function validateTestQualityCard(card = null) {
  const issues = [];

  if (!card || typeof card !== 'object') {
    return {
      ok: false,
      issues: ['quality card is missing'],
      missingMetricIds: [...TEST_METRIC_ORDER],
      summary: 'quality card is missing',
      metricCount: 0,
    };
  }

  if (card.schema !== 'qa.test-attribute-card.v1') {
    issues.push(`unexpected schema ${String(card.schema || '(missing)')}`);
  }
  if (!card.id) issues.push('missing id');
  if (!card.testId) issues.push('missing testId');
  if (!card.testName) issues.push('missing testName');

  const overallValue = Number(card.overallScore?.value);
  const overallMax = Number(card.overallScore?.max);
  if (!Number.isFinite(overallValue)) issues.push('missing overall score value');
  if (!Number.isFinite(overallMax)) issues.push('missing overall score max');

  const metrics = card.metrics && typeof card.metrics === 'object' ? card.metrics : null;
  const missingMetricIds = TEST_METRIC_ORDER.filter((metricId) => !metrics?.[metricId]);
  if (missingMetricIds.length) {
    issues.push(`missing metrics: ${missingMetricIds.join(', ')}`);
  }

  TEST_METRIC_ORDER.forEach((metricId) => {
    const metric = metrics?.[metricId];
    if (!metric) return;
    if (!Number.isFinite(Number(metric.score))) issues.push(`${metricId} score is not numeric`);
    if (!Number.isFinite(Number(metric.weight))) issues.push(`${metricId} weight is not numeric`);
    if (!metric.calculation || !Number.isFinite(Number(metric.calculation.rawValue))) {
      issues.push(`${metricId} calculation is incomplete`);
    }
  });

  const metricOrder = Array.isArray(card.ui?.metricOrder) ? card.ui.metricOrder : [];
  const orderMatches = metricOrder.length === TEST_METRIC_ORDER.length
    && metricOrder.every((metricId, index) => metricId === TEST_METRIC_ORDER[index]);
  if (!orderMatches) {
    issues.push('metric order does not match scorecard definitions');
  }

  return {
    ok: issues.length === 0,
    issues,
    missingMetricIds,
    summary: issues.length ? issues.join('; ') : 'Scorecard schema and metrics are complete.',
    metricCount: metrics ? Object.keys(metrics).length : 0,
  };
}

function deriveMetric(metricId, metricInput = {}) {
  const definition = TEST_METRIC_DEFINITIONS.metrics?.[metricId];
  if (!definition) {
    throw new Error(`Unknown test metric definition: ${metricId}`);
  }

  const factorScores = { ...(metricInput.factorScores || {}) };
  const contributions = definition.factors.map((factor) => {
    if (!Object.prototype.hasOwnProperty.call(factorScores, factor.id)) {
      throw new Error(`Metric ${metricId} is missing factor score ${factor.id}`);
    }
    return {
      value: deriveFactorContribution(factor, factorScores[factor.id]),
      weight: Number.isFinite(Number(factor.weight)) ? Number(factor.weight) : 1,
    };
  });

  const rawValue = weightedAverage(contributions);
  const score = Math.round(rawValue);
  const weight = Number.isFinite(Number(metricInput.weight))
    ? Number(metricInput.weight)
    : Number(definition.defaultWeight || 1);

  return {
    definitionId: metricId,
    score,
    weight,
    summary: String(metricInput.summary || '').trim(),
    evidence: Array.isArray(metricInput.evidence) ? metricInput.evidence.filter(Boolean) : [],
    factorScores,
    calculation: {
      method: 'rounded_weighted_average',
      rawValue: roundTo(rawValue, 2),
      displayFormula: `avg(${definition.factors.map((factor) => (
        factor.invert ? `invert(${factor.id})` : factor.id
      )).join(', ')})`,
    },
    improvementHint: String(metricInput.improvementHint || '').trim() || null,
  };
}

function buildTestQualityCard({
  id,
  desk,
  testId,
  testName,
  status = 'pass',
  metrics = {},
  updatedAt = null,
} = {}) {
  if (!id) throw new Error('quality card id is required');
  if (!testId) throw new Error('quality card testId is required');
  if (!testName) throw new Error('quality card testName is required');

  const derivedMetrics = Object.fromEntries(TEST_METRIC_ORDER.map((metricId) => {
    if (!metrics[metricId]) {
      throw new Error(`quality card ${id} is missing metric ${metricId}`);
    }
    return [metricId, deriveMetric(metricId, metrics[metricId])];
  }));

  const overallValue = weightedAverage(TEST_METRIC_ORDER.map((metricId) => ({
    value: derivedMetrics[metricId].score,
    weight: derivedMetrics[metricId].weight,
  })));
  const card = {
    schema: 'qa.test-attribute-card.v1',
    id,
    desk: desk || null,
    testId,
    testName,
    status: status || 'pass',
    overallScore: {
      value: roundTo(overallValue, 1),
      max: 5,
      method: 'weighted_average',
    },
    metrics: derivedMetrics,
    ui: {
      cardVariant: 'qa-test-attribute-card',
      metricOrder: [...TEST_METRIC_ORDER],
      clickableMetrics: true,
      defaultExpandedMetricId: null,
    },
    updatedAt: updatedAt || new Date().toISOString(),
  };

  return {
    ...card,
    validation: validateTestQualityCard(card),
  };
}

function buildDeskContractCheckQualityCard({
  desk,
  deskLabel,
  updatedAt = null,
  metrics = {},
} = {}) {
  if (!desk) throw new Error('quality card desk is required');
  return buildTestQualityCard({
    id: `${desk}.contract_check`,
    desk,
    testId: 'contract_check',
    testName: `${deskLabel} contract check`,
    status: 'pass',
    updatedAt,
    metrics,
  });
}

function buildPlannerContractCheckQualityCard(updatedAt = null) {
  return buildDeskContractCheckQualityCard({
    desk: 'planner',
    deskLabel: 'Planner',
    updatedAt,
    metrics: {
      integrity: {
        summary: 'Checks the planner desk contract through the real properties route and planner run route registration.',
        evidence: [
          'Validates planner run route existence',
          'Requests /api/spatial/desks/planner/properties',
          'Checks desk payload shape and returned deskId',
        ],
        factorScores: {
          assertion_relevance: 4,
          real_path_alignment: 4,
          false_positive_risk: 2,
        },
        improvementHint: 'Add one assertion for planner-specific payload content beyond the shared desk shell.',
      },
      specificity: {
        summary: 'Failures identify whether the planner route, desk payload shape, or desk identity drifted.',
        evidence: [
          'Reports missing route names directly',
          'Calls out missing payload keys by name',
          'Flags deskId mismatches explicitly',
        ],
        factorScores: {
          assertion_precision: 4,
          failure_localization: 4,
          noise_risk: 2,
        },
        improvementHint: 'Split route registration and payload-shape failures into separate checks when the scorecard model expands.',
      },
      coverage: {
        summary: 'Covers the primary planner contract, but not downstream planner execution branches or proposal artifacts.',
        evidence: [
          'Exercises the planner properties payload',
          'Checks run-route registration without executing a planner run',
          'Does not inspect produced card or artifact payloads',
        ],
        factorScores: {
          path_coverage: 3,
          branch_coverage: 2,
          edge_case_coverage: 1,
        },
        improvementHint: 'Add a scored card for planner output artifacts once planner execution becomes deterministic enough for QA.',
      },
      observability: {
        summary: 'Contract failures are readable, but the test still reports string failures instead of structured evidence.',
        evidence: [
          'Includes route names and missing keys in failure strings',
          'Does not attach a structured payload excerpt to the result',
        ],
        factorScores: {
          debug_signal: 3,
          artifact_visibility: 2,
          failure_readability: 4,
        },
        improvementHint: 'Attach a compact planner desk payload excerpt when contract assertions fail.',
      },
      reliability: {
        summary: 'The planner contract check is stable because it relies on route registration and a read-only desk properties request.',
        evidence: [
          'Uses deterministic route existence checks',
          'Hits a read-only planner desk properties endpoint',
          'Does not depend on live model execution',
        ],
        factorScores: {
          repeatability: 5,
          environment_stability: 4,
          dependency_fragility: 2,
        },
        improvementHint: 'Keep planner desk properties read-only and fixture-safe so the contract check stays deterministic.',
      },
    },
  });
}

function buildRunnerContractCheckQualityCard(updatedAt = null) {
  return buildDeskContractCheckQualityCard({
    desk: 'runner',
    deskLabel: 'Runner',
    updatedAt,
    metrics: {
      integrity: {
        summary: 'Checks the real runner contract across execute and presets routes, UI-command alignment, and preset file presence.',
        evidence: [
          'Validates /api/execute and /api/presets route existence',
          'Compares UI action options to runner subcommands',
          'Checks preset commands and referenced files on disk',
        ],
        factorScores: {
          assertion_relevance: 5,
          real_path_alignment: 4,
          false_positive_risk: 2,
        },
        improvementHint: 'Add one assertion for an execute payload contract once the runner has a stable dry-run response shape.',
      },
      specificity: {
        summary: 'Failures pinpoint which command, preset, route, or response field drifted.',
        evidence: [
          'Reports missing runner subcommands by UI action name',
          'Reports missing preset files with normalized paths',
          'Checks /api/presets response keys explicitly',
        ],
        factorScores: {
          assertion_precision: 4,
          failure_localization: 4,
          noise_risk: 2,
        },
        improvementHint: 'Separate preset-file failures from API-shape failures once the suite grows more cards.',
      },
      coverage: {
        summary: 'Covers more runner surface area than a single route check, but does not execute a full command lifecycle.',
        evidence: [
          'Checks command parity between UI and runner',
          'Validates preset configuration and the presets API',
          'Does not run /api/execute with a live command payload',
        ],
        factorScores: {
          path_coverage: 4,
          branch_coverage: 3,
          edge_case_coverage: 2,
        },
        improvementHint: 'Add a deterministic execute dry-run assertion for one representative command path.',
      },
      observability: {
        summary: 'The runner contract check gives useful failure messages, but it does not emit structured artifacts yet.',
        evidence: [
          'Failure strings include command names, preset names, and missing files',
          'No structured preset diff or command manifest is attached to the test result',
        ],
        factorScores: {
          debug_signal: 3,
          artifact_visibility: 2,
          failure_readability: 4,
        },
        improvementHint: 'Attach the resolved preset name and command when a runner contract assertion fails.',
      },
      reliability: {
        summary: 'The runner contract check is stable under normal runs because it relies on static inspection and a read-only presets call.',
        evidence: [
          'Uses static command extraction and file existence checks',
          'Calls the read-only /api/presets endpoint',
          'Avoids executing arbitrary runner commands in the contract test',
        ],
        factorScores: {
          repeatability: 4,
          environment_stability: 4,
          dependency_fragility: 2,
        },
        improvementHint: 'Keep execution out of this card unless a deterministic fixture mode is added for runner actions.',
      },
    },
  });
}

function buildTaContractCheckQualityCard(updatedAt = null) {
  return buildDeskContractCheckQualityCard({
    desk: 'ta',
    deskLabel: 'TA',
    updatedAt,
    metrics: {
      integrity: {
        summary: 'Checks the TA candidate contract through the live candidates route and the required candidate payload shape.',
        evidence: [
          'Validates /api/ta/candidates route existence',
          'Posts a representative gap payload to the candidates route',
          'Checks the first candidate for required fields',
        ],
        factorScores: {
          assertion_relevance: 4,
          real_path_alignment: 4,
          false_positive_risk: 2,
        },
        improvementHint: 'Add one assertion for candidate rationale quality once a stable rubric exists for TA output.',
      },
      specificity: {
        summary: 'Failures distinguish route availability, top-level payload shape, and candidate field drift.',
        evidence: [
          'Reports non-200 candidate responses directly',
          'Flags missing top-level candidates array',
          'Names the specific candidate fields that are missing',
        ],
        factorScores: {
          assertion_precision: 4,
          failure_localization: 3,
          noise_risk: 2,
        },
        improvementHint: 'Include candidate index and a compact response excerpt when candidate shape checks fail.',
      },
      coverage: {
        summary: 'Covers the core candidate-generation path, but not alternate gap types or deeper recommendation edge cases.',
        evidence: [
          'Exercises one representative gap payload end to end',
          'Checks top-level and first-candidate shape only',
          'Does not score alternate inputs or empty-result branches',
        ],
        factorScores: {
          path_coverage: 3,
          branch_coverage: 2,
          edge_case_coverage: 1,
        },
        improvementHint: 'Add a second scored TA card for alternate gap shapes or empty-result handling when needed.',
      },
      observability: {
        summary: 'The TA contract test produces readable failures, but the evidence remains mostly string-based.',
        evidence: [
          'Reports missing payload keys clearly',
          'Does not attach candidate excerpts or a structured artifact bundle',
        ],
        factorScores: {
          debug_signal: 3,
          artifact_visibility: 2,
          failure_readability: 3,
        },
        improvementHint: 'Attach a compact candidate payload excerpt when the TA contract check fails.',
      },
      reliability: {
        summary: 'The TA contract check is mostly stable, but it depends on live candidate generation rather than a fixture path.',
        evidence: [
          'Uses a fixed sample gap payload',
          'Relies on deterministic candidate generation logic in normal runs',
          'Still depends on the TA generation path remaining stable across environments',
        ],
        factorScores: {
          repeatability: 4,
          environment_stability: 3,
          dependency_fragility: 3,
        },
        improvementHint: 'Introduce a fixture-backed TA contract mode if the live candidate path starts drifting by environment.',
      },
    },
  });
}

function buildUiContractCheckQualityCard(updatedAt = null) {
  return buildDeskContractCheckQualityCard({
    desk: 'ui',
    deskLabel: 'UI',
    updatedAt,
    metrics: {
      integrity: {
        summary: 'Checks the real UI/backend contract surface instead of a shallow proxy.',
        evidence: [
          'Validates endpoint existence for UI fetch calls',
          'Checks live and degraded LLM response branches',
          'Verifies contract shapes for intent and CTO chat',
        ],
        factorScores: {
          assertion_relevance: 5,
          real_path_alignment: 4,
          false_positive_risk: 3,
        },
        improvementHint: 'Assert one concrete payload field per route, not only top-level shape presence.',
      },
      specificity: {
        summary: 'Failures point at a narrow contract mismatch instead of a vague UI crash.',
        evidence: [
          'Reports missing response keys per endpoint',
          'Separates idempotency, dashboard, project, task, and LLM contract checks',
        ],
        factorScores: {
          assertion_precision: 4,
          failure_localization: 4,
          noise_risk: 3,
        },
        improvementHint: 'Split the large contract check into smaller named checks once the card model expands.',
      },
      coverage: {
        summary: 'Covers the main UI-facing endpoints, but not every route permutation or desk path.',
        evidence: [
          'Exercises mutations, dashboard, tasks, projects, CTO chat, intent, and LLM test',
          'Does not cover every route method or every degraded edge case',
        ],
        factorScores: {
          path_coverage: 3,
          branch_coverage: 3,
          edge_case_coverage: 2,
        },
        improvementHint: 'Add one targeted card for mutation apply edge cases and one for dashboard/task drift.',
      },
      observability: {
        summary: 'The test surfaces contract failures clearly, but runner-level artifact visibility is still limited.',
        evidence: [
          'Failure strings include endpoint names and missing keys',
          'No structured artifact bundle is attached to the test itself yet',
        ],
        factorScores: {
          debug_signal: 3,
          artifact_visibility: 3,
          failure_readability: 3,
        },
        improvementHint: 'Attach structured endpoint evidence or response excerpts when a contract check fails.',
      },
      reliability: {
        summary: 'Contract assertions are stable and deterministic under normal runs.',
        evidence: [
          'Checks rely on explicit endpoint responses rather than timing-sensitive UI behavior',
          'Idempotency check runs the same preview twice against the same payload',
        ],
        factorScores: {
          repeatability: 4,
          environment_stability: 4,
          dependency_fragility: 3,
        },
        improvementHint: 'Reduce external model dependency further by isolating a deterministic contract fixture mode.',
      },
    },
  });
}

module.exports = {
  TEST_METRIC_DEFINITIONS,
  TEST_METRIC_ORDER,
  buildPlannerContractCheckQualityCard,
  buildRunnerContractCheckQualityCard,
  buildTaContractCheckQualityCard,
  buildTestQualityCard,
  buildUiContractCheckQualityCard,
  validateTestQualityCard,
};
