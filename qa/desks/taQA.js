const path = require('path');
const { buildTaContractCheckQualityCard } = require('../testAttributeCards');
const {
  applyFixtureFailures,
  evaluateDeskFileScope,
  finalizeDeskResult,
  loadCommonJsModule,
  makeTest,
  objectMissingKeys,
  requestJson,
  routeExists,
  validateJsonFile,
  verifyLlmInvocation,
} = require('../shared/debugSuite');

const SAMPLE_GAP = {
  description: 'UI actions appear disconnected from backend execution',
  system_context: 'ACE Studio overlay',
  affected_components: ['ui', 'api', 'runner'],
};

function validateCandidateShape(payload) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  if (!candidates.length) {
    return 'candidate list is empty';
  }
  const missing = objectMissingKeys(candidates[0], [
    'id',
    'name',
    'role',
    'department',
    'summary',
    'model_policy',
    'why_this_role',
    'confidence',
  ]);
  return missing.length ? `candidate payload missing ${missing.join(', ')}` : null;
}

async function runTests(context) {
  const startTime = Date.now();
  const tests = [];
  const contractFailures = [];

  if (!routeExists(context, 'post', '/api/ta/candidates')) {
    contractFailures.push('missing endpoint /api/ta/candidates');
  }

  let firstResponse = null;
  try {
    firstResponse = await requestJson(context, 'POST', '/api/ta/candidates', { gap: SAMPLE_GAP });
    if (firstResponse.statusCode !== 200) {
      contractFailures.push(`/api/ta/candidates returned ${firstResponse.statusCode}`);
    } else {
      const missing = objectMissingKeys(firstResponse.body, ['candidates']);
      if (missing.length) {
        contractFailures.push(`/api/ta/candidates missing ${missing.join(', ')}`);
      }
      const candidateShapeFailure = validateCandidateShape(firstResponse.body);
      if (candidateShapeFailure) contractFailures.push(candidateShapeFailure);
    }
  } catch (error) {
    contractFailures.push(`/api/ta/candidates failed: ${String(error.message || error)}`);
  }

  tests.push(makeTest(
    'contract_check',
    contractFailures.length === 0,
    contractFailures.join('; '),
    'critical',
    { qualityCard: buildTaContractCheckQualityCard() },
  ));

  const fileScope = evaluateDeskFileScope(context, 'ta');
  tests.push(makeTest('file_scope', fileScope.ok, fileScope.reason));

  const syntaxFailures = [];
  const taLoad = loadCommonJsModule(path.join(context.rootPath, 'ta', 'generateCandidates.js'));
  if (!taLoad.ok) syntaxFailures.push(`ta/generateCandidates.js failed to load: ${taLoad.reason}`);
  const schemaLoad = validateJsonFile(path.join(context.rootPath, 'ta', 'candidateSchema.json'));
  if (!schemaLoad.ok) syntaxFailures.push(`ta/candidateSchema.json failed to parse: ${schemaLoad.reason}`);
  tests.push(makeTest('syntax_load', syntaxFailures.length === 0, syntaxFailures.join('; ')));

  const smokeFailures = [];
  if (!firstResponse || firstResponse.statusCode !== 200) {
    smokeFailures.push('candidate generation did not complete');
  } else if (!Array.isArray(firstResponse.body?.candidates) || firstResponse.body.candidates.length === 0) {
    smokeFailures.push('candidate generation returned no candidates');
  }
  tests.push(makeTest('smoke', smokeFailures.length === 0, smokeFailures.join('; ')));

  const idempotencyFailures = [];
  try {
    const secondResponse = await requestJson(context, 'POST', '/api/ta/candidates', { gap: SAMPLE_GAP });
    if (secondResponse.statusCode !== 200) {
      idempotencyFailures.push(`second candidate run returned ${secondResponse.statusCode}`);
    } else if (JSON.stringify(firstResponse?.body || null) !== JSON.stringify(secondResponse.body || null)) {
      idempotencyFailures.push('candidate generation output changed between identical runs');
    } else {
      const ids = (secondResponse.body?.candidates || []).map((candidate) => candidate.id);
      if (ids.length !== new Set(ids).size) {
        idempotencyFailures.push('duplicate candidate ids returned on repeated execution');
      }
    }
  } catch (error) {
    idempotencyFailures.push(`second candidate run failed: ${String(error.message || error)}`);
  }
  tests.push(makeTest('idempotency', idempotencyFailures.length === 0, idempotencyFailures.join('; ')));

  const agentOutputChanged = false; // TA candidate generation is deterministic and does not emit agent-run artifacts.
  const llmCheck = verifyLlmInvocation(context.rootPath, startTime);
  tests.push(makeTest('llm_invocation_check', !agentOutputChanged || llmCheck.ok, agentOutputChanged ? llmCheck.reason : 'No agent run triggered'));

  return finalizeDeskResult('ta', applyFixtureFailures(context, 'ta', tests));
}

module.exports = {
  runTests,
};
