import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default async function runTestAttributeCardTests() {
  const {
    TEST_METRIC_DEFINITIONS,
    TEST_METRIC_ORDER,
    buildPlannerContractCheckQualityCard,
    buildRunnerContractCheckQualityCard,
    buildTaContractCheckQualityCard,
    buildUiContractCheckQualityCard,
    validateTestQualityCard,
  } = require('../../qa/testAttributeCards.js');

  const plannerCard = buildPlannerContractCheckQualityCard('2026-03-24T08:00:00.000Z');
  const runnerCard = buildRunnerContractCheckQualityCard('2026-03-24T09:00:00.000Z');
  const uiCard = buildUiContractCheckQualityCard('2026-03-24T10:00:00.000Z');
  const taCard = buildTaContractCheckQualityCard('2026-03-24T11:00:00.000Z');

  const cards = [plannerCard, runnerCard, uiCard, taCard];

  for (const card of cards) {
    assert.equal(card.schema, 'qa.test-attribute-card.v1');
    assert.equal(card.testId, 'contract_check');
    assert.deepEqual(card.ui.metricOrder, TEST_METRIC_ORDER);
    assert.deepEqual(card.validation, validateTestQualityCard(card));
    assert.equal(card.validation.ok, true);
    assert.deepEqual(card.validation.issues, []);
  }

  assert.equal(plannerCard.id, 'planner.contract_check');
  assert.equal(plannerCard.desk, 'planner');
  assert.equal(plannerCard.metrics.integrity.score, 4);
  assert.equal(plannerCard.metrics.coverage.score, 2);
  assert.equal(plannerCard.overallScore.value, 3.5);

  assert.equal(runnerCard.id, 'runner.contract_check');
  assert.equal(runnerCard.desk, 'runner');
  assert.equal(runnerCard.metrics.integrity.score, 4);
  assert.equal(runnerCard.metrics.coverage.score, 3);
  assert.equal(runnerCard.overallScore.value, 3.6);

  assert.equal(uiCard.id, 'ui.contract_check');
  assert.equal(uiCard.desk, 'ui');
  assert.equal(uiCard.metrics.integrity.score, 4);
  assert.equal(uiCard.metrics.specificity.score, 4);
  assert.equal(uiCard.metrics.coverage.score, 3);
  assert.equal(uiCard.metrics.observability.score, 3);
  assert.equal(uiCard.metrics.reliability.score, 4);
  assert.equal(uiCard.metrics.integrity.calculation.method, 'rounded_weighted_average');
  assert.equal(uiCard.metrics.integrity.calculation.rawValue, 4);
  assert.equal(uiCard.metrics.reliability.calculation.rawValue, 3.67);
  assert.equal(uiCard.overallScore.method, 'weighted_average');
  assert.equal(uiCard.overallScore.value, 3.6);

  assert.equal(taCard.id, 'ta.contract_check');
  assert.equal(taCard.desk, 'ta');
  assert.equal(taCard.metrics.specificity.calculation.rawValue, 3.67);
  assert.equal(taCard.metrics.observability.score, 3);
  assert.equal(taCard.metrics.reliability.score, 3);
  assert.equal(taCard.overallScore.value, 3.2);

  assert.equal(TEST_METRIC_DEFINITIONS.metrics.integrity.label, 'Integrity');
}
