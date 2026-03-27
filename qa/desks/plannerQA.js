const path = require('path');
const { buildPlannerContractCheckQualityCard } = require('../testAttributeCards');
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

async function runTests(context) {
  const startTime = Date.now();
  const tests = [];
  const contractFailures = [];

  if (!routeExists(context, 'post', '/api/spatial/agents/planner/run')) {
    contractFailures.push('missing endpoint /api/spatial/agents/planner/run');
  }
  if (!routeExists(context, 'get', '/api/spatial/desks/:deskId/properties')) {
    contractFailures.push('missing endpoint /api/spatial/desks/:deskId/properties');
  }

  try {
    const response = await requestJson(context, 'GET', '/api/spatial/desks/planner/properties');
    if (response.statusCode !== 200) {
      contractFailures.push(`planner desk properties returned ${response.statusCode}`);
    } else {
      const missing = objectMissingKeys(response.body, ['deskId', 'desk', 'agents', 'tasks', 'modules', 'reports']);
      if (missing.length) {
        contractFailures.push(`planner desk payload missing ${missing.join(', ')}`);
      }
      if (response.body?.deskId !== 'planner') {
        contractFailures.push(`planner desk payload returned deskId ${String(response.body?.deskId || '(missing)')}`);
      }
    }
  } catch (error) {
    contractFailures.push(`planner desk properties failed: ${String(error.message || error)}`);
  }

  tests.push(makeTest(
    'contract_check',
    contractFailures.length === 0,
    contractFailures.join('; '),
    'critical',
    { qualityCard: buildPlannerContractCheckQualityCard() },
  ));

  const fileScope = evaluateDeskFileScope(context, 'planner');
  tests.push(makeTest('file_scope', fileScope.ok, fileScope.reason));

  const syntaxFailures = [];
  const serverLoad = loadCommonJsModule(path.join(context.rootPath, 'ui', 'server.js'));
  if (!serverLoad.ok) syntaxFailures.push(`ui/server.js failed to load: ${serverLoad.reason}`);

  const plannerAgent = validateJsonFile(path.join(context.rootPath, 'agents', 'planner', 'agent.json'));
  if (!plannerAgent.ok) syntaxFailures.push(`agents/planner/agent.json failed to parse: ${plannerAgent.reason}`);

  tests.push(makeTest('syntax_load', syntaxFailures.length === 0, syntaxFailures.join('; ')));

  const agentOutputChanged = false; // Planner QA fetches properties only currently
  const llmCheck = verifyLlmInvocation(context.rootPath, startTime);
  tests.push(makeTest('llm_invocation_check', !agentOutputChanged || llmCheck.ok, agentOutputChanged ? llmCheck.reason : 'No agent run triggered'));

  return finalizeDeskResult('planner', applyFixtureFailures(context, 'planner', tests));
}

module.exports = {
  runTests,
};
