const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
  requestOllamaJson,
  DEFAULT_OLLAMA_HOST,
  DEFAULT_OLLAMA_TIMEOUT_MS,
} = require('./localModelClient');
const {
  resolveAgentDefinition,
} = require('./agentRegistry');

const EVALUATOR_DIR = path.join('data', 'spatial', 'evaluator');
const EVALUATOR_RUNS_DIR = path.join(EVALUATOR_DIR, 'runs');
const EVALUATOR_HISTORY_LIMIT = 60;

const ALLOWED_VERDICTS = new Set(['better', 'worse', 'no_change']);
const MODEL_COGNITION_MODE = 'model_live';
const FALLBACK_COGNITION_MODE = 'deterministic_fallback';

function nowIso() {
  return new Date().toISOString();
}

function clamp01(value, fallback = 0.5) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function asFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeText(value = '') {
  return String(value || '').trim();
}

function normalizeStringArray(values = []) {
  return Array.isArray(values)
    ? [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))]
    : [];
}

function readJsonSafe(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function sha1(value = '') {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex');
}

function statusWeight(status = '') {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'pass') return 4;
  if (normalized === 'warn') return 2;
  if (normalized === 'stale') return 1;
  if (normalized === 'fail') return 0;
  return 0;
}

function normalizeScoreValue(value = null) {
  if (Number.isFinite(Number(value))) return Number(value);
  if (value && typeof value === 'object') {
    if (Number.isFinite(Number(value.value))) return Number(value.value);
    if (Number.isFinite(Number(value.score))) return Number(value.score);
  }
  return null;
}

function buildMinimalScorecard(card = {}) {
  const id = normalizeText(card.id || `${card.desk || 'desk'}.${card.testId || card.testName || 'scorecard'}`) || null;
  const overallScore = normalizeScoreValue(card.overallScore || card.score || null);
  return {
    id,
    desk: normalizeText(card.desk) || null,
    test_id: normalizeText(card.testId || card.test_id) || null,
    test_name: normalizeText(card.testName || card.test_name) || null,
    rollup_status: normalizeText(card.rollupStatus || card.rollup_status || card.status) || 'missing',
    reported_status: normalizeText(card.reportedStatus || card.reported_status || card.status) || 'missing',
    overall_score: overallScore,
    summary: normalizeText(card.summary) || null,
  };
}

function buildSnapshotScorecards(cards = []) {
  return (Array.isArray(cards) ? cards : [])
    .map((card) => buildMinimalScorecard(card))
    .filter((card) => card.id)
    .sort((left, right) => String(left.id || '').localeCompare(String(right.id || '')));
}

function buildScorecardCounts(scorecards = []) {
  return {
    pass: scorecards.filter((card) => card.rollup_status === 'pass').length,
    warn: scorecards.filter((card) => card.rollup_status === 'warn').length,
    stale: scorecards.filter((card) => card.rollup_status === 'stale').length,
    fail: scorecards.filter((card) => card.rollup_status === 'fail').length,
    missing: scorecards.filter((card) => card.rollup_status === 'missing').length,
  };
}

function snapshotAggregateScore(snapshot = null) {
  const cards = Array.isArray(snapshot?.scorecards) ? snapshot.scorecards : [];
  if (!cards.length) return 0;
  const total = cards.reduce((sum, card) => {
    const score = normalizeScoreValue(card.overall_score);
    if (Number.isFinite(score)) return sum + score;
    return sum + statusWeight(card.rollup_status);
  }, 0);
  return Number((total / cards.length).toFixed(2));
}

function buildEvaluatorSnapshot({
  scorecards = [],
  comparisonTarget = 'qa_scorecards',
  capturedAt = null,
  snapshotId = null,
} = {}) {
  const normalizedScorecards = buildSnapshotScorecards(scorecards);
  const counts = buildScorecardCounts(normalizedScorecards);
  const fingerprint = sha1(JSON.stringify({
    comparisonTarget,
    scorecards: normalizedScorecards,
  }));
  const resolvedCapturedAt = normalizeText(capturedAt) || nowIso();
  return {
    snapshot_id: normalizeText(snapshotId) || `eval_snapshot_${fingerprint.slice(0, 12)}`,
    captured_at: resolvedCapturedAt,
    comparison_target: normalizeText(comparisonTarget) || 'qa_scorecards',
    fingerprint,
    scorecard_count: normalizedScorecards.length,
    counts,
    aggregate_score: snapshotAggregateScore({ scorecards: normalizedScorecards }),
    summary: normalizedScorecards.length
      ? `${normalizedScorecards.length} scorecards | ${counts.pass} pass | ${counts.warn} warn | ${counts.stale} stale | ${counts.fail} fail`
      : 'No comparable scorecards were available for evaluator input.',
    scorecards: normalizedScorecards,
  };
}

function ensureEvaluatorStorage(rootPath) {
  const stateDir = path.join(rootPath, EVALUATOR_DIR);
  fs.mkdirSync(path.join(rootPath, EVALUATOR_RUNS_DIR), { recursive: true });
  return stateDir;
}

function evaluatorStatePath(rootPath) {
  return path.join(rootPath, EVALUATOR_DIR, 'state.json');
}

function evaluatorHistoryPath(rootPath) {
  return path.join(rootPath, EVALUATOR_DIR, 'history.json');
}

function evaluatorRunFilePath(rootPath, runId) {
  return path.join(rootPath, EVALUATOR_RUNS_DIR, `${runId}.json`);
}

function normalizeScorecardImpact(entry = {}) {
  if (!entry || typeof entry !== 'object') return null;
  const cardId = normalizeText(entry.card_id || entry.cardId || entry.id);
  if (!cardId) return null;
  const verdict = normalizeVerdict(entry.verdict);
  return {
    card_id: cardId,
    desk: normalizeText(entry.desk) || null,
    test_id: normalizeText(entry.test_id || entry.testId) || null,
    verdict,
    delta_score: Number(asFiniteNumber(entry.delta_score ?? entry.deltaScore ?? 0, 0).toFixed(2)),
    progress_summary: normalizeText(entry.progress_summary || entry.progressSummary || entry.summary) || 'No evaluator change summary recorded.',
    score_pressure: normalizeText(entry.score_pressure || entry.scorePressure) || inferScorePressure(asFiniteNumber(entry.delta_score ?? entry.deltaScore ?? 0, 0)),
  };
}

function normalizeVerdict(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (ALLOWED_VERDICTS.has(normalized)) return normalized;
  return 'no_change';
}

function inferVerdict(deltaScore = 0) {
  if (deltaScore > 0.1) return 'better';
  if (deltaScore < -0.1) return 'worse';
  return 'no_change';
}

function inferScorePressure(deltaScore = 0) {
  if (deltaScore > 0.1) return 'upward';
  if (deltaScore < -0.1) return 'downward';
  return 'flat';
}

function makeEvaluatorRunId(comparedAt = nowIso()) {
  return `evaluator_${comparedAt.replace(/[^0-9]/g, '').slice(0, 14)}`;
}

function buildPrompt({
  promptTemplate = '',
  previousSnapshot = null,
  currentSnapshot = null,
  comparisonTarget = 'qa_scorecards',
  contextSummary = '',
} = {}) {
  const contract = [
    normalizeText(promptTemplate),
    'Compare only the supplied previous and current snapshots.',
    'Do not invent context, missing history, or remediation steps.',
    'Return JSON only with these fields:',
    '{',
    '  "verdict": "better" | "worse" | "no_change",',
    '  "delta_score": number,',
    '  "progress_summary": "string",',
    '  "changed_dimensions": ["string"],',
    '  "evaluation_confidence": number,',
    '  "score_pressure": "string",',
    '  "progress_state": "stable" | "regressive" | "stalled",',
    '  "scorecard_impacts": [',
    '    {',
    '      "card_id": "string",',
    '      "desk": "string",',
    '      "test_id": "string",',
    '      "verdict": "better" | "worse" | "no_change",',
    '      "delta_score": number,',
    '      "progress_summary": "string",',
    '      "score_pressure": "string"',
    '    }',
    '  ]',
    '}',
    `Comparison target: ${comparisonTarget}`,
    `Context summary: ${normalizeText(contextSummary) || 'No extra context supplied.'}`,
    `Previous snapshot: ${JSON.stringify(previousSnapshot || null)}`,
    `Current snapshot: ${JSON.stringify(currentSnapshot || null)}`,
  ].filter(Boolean);
  return contract.join('\n');
}

function buildDeterministicFallback({
  definition,
  comparedAt,
  comparisonTarget,
  previousSnapshot = null,
  currentSnapshot = null,
  fallbackReason = '',
} = {}) {
  const previousCards = new Map((Array.isArray(previousSnapshot?.scorecards) ? previousSnapshot.scorecards : []).map((card) => [card.id, card]));
  const currentCards = Array.isArray(currentSnapshot?.scorecards) ? currentSnapshot.scorecards : [];
  const impacts = [];
  currentCards.forEach((card) => {
    const previous = previousCards.get(card.id) || null;
    const previousScore = normalizeScoreValue(previous?.overall_score);
    const currentScore = normalizeScoreValue(card.overall_score);
    const deltaScore = Number((
      (Number.isFinite(currentScore) ? currentScore : statusWeight(card.rollup_status))
      - (Number.isFinite(previousScore) ? previousScore : statusWeight(previous?.rollup_status))
    ).toFixed(2));
    const changed = !previous
      || previous.rollup_status !== card.rollup_status
      || deltaScore !== 0;
    if (!changed) return;
    impacts.push({
      card_id: card.id,
      desk: card.desk || previous?.desk || null,
      test_id: card.test_id || previous?.test_id || null,
      verdict: inferVerdict(deltaScore),
      delta_score: deltaScore,
      progress_summary: !previous
        ? `New scorecard observed for ${card.test_name || card.test_id || card.id}.`
        : `${card.test_name || card.test_id || card.id} moved from ${previous.rollup_status || 'missing'} to ${card.rollup_status || 'missing'}.`,
      score_pressure: inferScorePressure(deltaScore),
    });
  });
  const previousAggregate = snapshotAggregateScore(previousSnapshot);
  const currentAggregate = snapshotAggregateScore(currentSnapshot);
  const deltaScore = Number((currentAggregate - previousAggregate).toFixed(2));
  const verdict = inferVerdict(deltaScore);
  const changedDimensions = normalizeStringArray([
    impacts.length ? 'scorecards' : '',
    previousSnapshot?.scorecard_count !== currentSnapshot?.scorecard_count ? 'coverage' : '',
    previousSnapshot?.counts?.fail !== currentSnapshot?.counts?.fail ? 'failure_pressure' : '',
    previousSnapshot?.counts?.warn !== currentSnapshot?.counts?.warn ? 'warning_pressure' : '',
  ]);
  const summary = !previousSnapshot
    ? 'Evaluator baseline established from the current snapshot only.'
    : impacts.length
      ? `${impacts.length} scorecard change${impacts.length === 1 ? '' : 's'} detected across the compared snapshots.`
      : 'No material movement was detected across the compared snapshots.';
  return {
    run_id: makeEvaluatorRunId(comparedAt),
    evaluator_id: definition.manifest.id || 'evaluator',
    compared_at: comparedAt,
    comparison_target: comparisonTarget,
    verdict,
    delta_score: deltaScore,
    progress_summary: summary,
    changed_dimensions: changedDimensions,
    evaluation_confidence: previousSnapshot ? 0.44 : 0.32,
    cognition_mode: FALLBACK_COGNITION_MODE,
    model_name: null,
    source_snapshot_ids: {
      previous: previousSnapshot?.snapshot_id || null,
      current: currentSnapshot?.snapshot_id || null,
    },
    score_pressure: inferScorePressure(deltaScore),
    progress_state: verdict === 'better' ? 'stable' : (verdict === 'worse' ? 'regressive' : 'stalled'),
    scorecard_impacts: impacts,
    fallback_reason: normalizeText(fallbackReason) || 'Evaluator fell back to deterministic comparison.',
  };
}

function normalizeEvaluationPayload(rawPayload = {}, {
  definition,
  comparedAt,
  comparisonTarget,
  previousSnapshot = null,
  currentSnapshot = null,
  cognitionMode,
  modelName = null,
} = {}) {
  const deltaScore = Number(asFiniteNumber(rawPayload.delta_score ?? rawPayload.deltaScore, 0).toFixed(2));
  const verdict = normalizeVerdict(rawPayload.verdict || inferVerdict(deltaScore));
  const scorecardImpacts = normalizeStringArray(
    (Array.isArray(rawPayload.changed_dimensions) ? rawPayload.changed_dimensions : []).map((entry) => normalizeText(entry))
  );
  const normalizedImpacts = (Array.isArray(rawPayload.scorecard_impacts) ? rawPayload.scorecard_impacts : [])
    .map((entry) => normalizeScorecardImpact(entry))
    .filter(Boolean);
  return {
    run_id: makeEvaluatorRunId(comparedAt),
    evaluator_id: definition.manifest.id || 'evaluator',
    compared_at: comparedAt,
    comparison_target: normalizeText(rawPayload.comparison_target || comparisonTarget) || comparisonTarget,
    verdict,
    delta_score: deltaScore,
    progress_summary: normalizeText(rawPayload.progress_summary || rawPayload.delta_summary || rawPayload.summary) || 'Evaluator completed comparison.',
    changed_dimensions: scorecardImpacts.length
      ? scorecardImpacts
      : normalizeStringArray(normalizedImpacts.map((entry) => entry.card_id)),
    evaluation_confidence: clamp01(rawPayload.evaluation_confidence ?? rawPayload.confidence, 0.61),
    cognition_mode: cognitionMode,
    model_name: cognitionMode === MODEL_COGNITION_MODE ? (modelName || null) : null,
    source_snapshot_ids: {
      previous: previousSnapshot?.snapshot_id || null,
      current: currentSnapshot?.snapshot_id || null,
    },
    score_pressure: normalizeText(rawPayload.score_pressure || rawPayload.scorePressure) || inferScorePressure(deltaScore),
    progress_state: normalizeText(rawPayload.progress_state || rawPayload.progressState) || (verdict === 'better' ? 'stable' : (verdict === 'worse' ? 'regressive' : 'stalled')),
    scorecard_impacts: normalizedImpacts,
  };
}

function persistEvaluation(rootPath, evaluation, {
  previousSnapshot = null,
  currentSnapshot = null,
} = {}) {
  ensureEvaluatorStorage(rootPath);
  const runRecord = {
    run_id: evaluation.run_id,
    stored_at: nowIso(),
    evaluation,
    previous_snapshot: previousSnapshot,
    current_snapshot: currentSnapshot,
  };
  writeJson(evaluatorRunFilePath(rootPath, evaluation.run_id), runRecord);
  const historyPath = evaluatorHistoryPath(rootPath);
  const nextHistory = [
    evaluation,
    ...(Array.isArray(readJsonSafe(historyPath, [])) ? readJsonSafe(historyPath, []) : []),
  ]
    .filter(Boolean)
    .filter((entry, index, items) => items.findIndex((candidate) => candidate?.run_id === entry?.run_id) === index)
    .slice(0, EVALUATOR_HISTORY_LIMIT);
  writeJson(historyPath, nextHistory);
  writeJson(evaluatorStatePath(rootPath), {
    updated_at: nowIso(),
    latest_evaluation: evaluation,
    latest_snapshot: currentSnapshot,
    previous_snapshot: previousSnapshot,
    history_count: nextHistory.length,
  });
  return {
    run: evaluatorRunFilePath(rootPath, evaluation.run_id),
    history: historyPath,
    state: evaluatorStatePath(rootPath),
  };
}

function readEvaluatorState(rootPath) {
  return {
    state: readJsonSafe(evaluatorStatePath(rootPath), {}),
    history: Array.isArray(readJsonSafe(evaluatorHistoryPath(rootPath), []))
      ? readJsonSafe(evaluatorHistoryPath(rootPath), [])
      : [],
  };
}

function readLatestEvaluation(rootPath) {
  return readEvaluatorState(rootPath).state?.latest_evaluation || null;
}

function readEvaluatorHistory(rootPath, limit = 10) {
  return readEvaluatorState(rootPath).history.slice(0, Math.max(0, Number(limit) || 0));
}

async function evaluateSnapshots({
  rootPath,
  previousSnapshot = null,
  currentSnapshot = null,
  comparisonTarget = 'qa_scorecards',
  contextSummary = '',
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!rootPath) throw new Error('rootPath is required for evaluator runs.');
  const definition = resolveAgentDefinition(rootPath, 'evaluator', {
    fallbackManifest: {
      id: 'evaluator',
      name: 'Evaluator',
      deskId: 'qa-lead',
      runtime: 'ollama-json',
      backend: 'ollama',
      model: 'mistral:latest',
      host: DEFAULT_OLLAMA_HOST,
      timeoutMs: DEFAULT_OLLAMA_TIMEOUT_MS,
      autoRun: false,
    },
    fallbackPrompt: 'Return strict evaluator JSON only.',
  });
  const comparedAt = nowIso();
  const prompt = buildPrompt({
    promptTemplate: definition.prompt,
    previousSnapshot,
    currentSnapshot,
    comparisonTarget,
    contextSummary,
  });
  let evaluation;
  try {
    const response = await requestOllamaJson({
      prompt,
      model: definition.manifest.model,
      host: definition.manifest.host,
      timeoutMs: Number(definition.manifest.timeoutMs || DEFAULT_OLLAMA_TIMEOUT_MS),
      fetchImpl,
    });
    evaluation = normalizeEvaluationPayload(response?.json || {}, {
      definition,
      comparedAt,
      comparisonTarget,
      previousSnapshot,
      currentSnapshot,
      cognitionMode: MODEL_COGNITION_MODE,
      modelName: definition.manifest.model,
    });
  } catch (error) {
    evaluation = buildDeterministicFallback({
      definition,
      comparedAt,
      comparisonTarget,
      previousSnapshot,
      currentSnapshot,
      fallbackReason: String(error?.message || error),
    });
  }
  const persistedPaths = persistEvaluation(rootPath, evaluation, { previousSnapshot, currentSnapshot });
  return {
    ok: evaluation.cognition_mode === MODEL_COGNITION_MODE,
    evaluation,
    previousSnapshot,
    currentSnapshot,
    persistedPaths,
  };
}

async function maybeRunEvaluatorCycle({
  rootPath,
  scorecards = [],
  comparisonTarget = 'qa_scorecards',
  contextSummary = '',
  capturedAt = null,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!rootPath) throw new Error('rootPath is required for evaluator cycles.');
  const currentSnapshot = buildEvaluatorSnapshot({
    scorecards,
    comparisonTarget,
    capturedAt,
  });
  const state = readEvaluatorState(rootPath);
  const previousSnapshot = state.state?.latest_snapshot || null;
  const previousFingerprint = normalizeText(previousSnapshot?.fingerprint);
  const currentFingerprint = normalizeText(currentSnapshot?.fingerprint);
  const latestEvaluation = state.state?.latest_evaluation || null;
  if (previousFingerprint && currentFingerprint && previousFingerprint === currentFingerprint && latestEvaluation) {
    return {
      ok: latestEvaluation.cognition_mode === MODEL_COGNITION_MODE,
      skipped: true,
      reason: 'Evaluator snapshot fingerprint is unchanged.',
      evaluation: latestEvaluation,
      previousSnapshot,
      currentSnapshot,
      persistedPaths: {
        state: evaluatorStatePath(rootPath),
        history: evaluatorHistoryPath(rootPath),
        run: latestEvaluation.run_id ? evaluatorRunFilePath(rootPath, latestEvaluation.run_id) : null,
      },
    };
  }
  return evaluateSnapshots({
    rootPath,
    previousSnapshot,
    currentSnapshot,
    comparisonTarget,
    contextSummary,
    fetchImpl,
  });
}

module.exports = {
  EVALUATOR_DIR,
  EVALUATOR_RUNS_DIR,
  FALLBACK_COGNITION_MODE,
  MODEL_COGNITION_MODE,
  buildEvaluatorSnapshot,
  evaluateSnapshots,
  evaluatorHistoryPath,
  evaluatorRunFilePath,
  evaluatorStatePath,
  maybeRunEvaluatorCycle,
  readEvaluatorHistory,
  readEvaluatorState,
  readLatestEvaluation,
};
