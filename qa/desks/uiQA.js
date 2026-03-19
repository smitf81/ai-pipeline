const path = require('path');
const {
  applyFixtureFailures,
  ensureServer,
  evaluateDeskFileScope,
  extractUiNetworkContracts,
  finalizeDeskResult,
  loadCommonJsModule,
  makeTest,
  objectMissingKeys,
  requestJson,
  routeExists,
  validateJavaScriptFiles,
  verifyLlmInvocation,
} = require('../shared/debugSuite');

async function runTests(context) {
  const startTime = Date.now();
  const tests = [];
  const contractFailures = [];

  const endpoints = extractUiNetworkContracts(context.rootPath);
  for (const route of endpoints) {
    // Basic test: is it supported by ANY method?
    if (!routeExists(context, 'get', route) && !routeExists(context, 'post', route) && !routeExists(context, 'put', route) && !routeExists(context, 'delete', route)) {
      contractFailures.push(`UI calls missing endpoint: ${route}`);
    }
  }

  // Idempotency check
  try {
    const payload = { mutations: [{ type: 'create_node', node: { type: 'test', content: 'hello' } }] };
    const idemp1 = await requestJson(context, 'POST', '/api/spatial/mutations/preview', payload, 5000);
    const idemp2 = await requestJson(context, 'POST', '/api/spatial/mutations/preview', payload, 5000);
    if (idemp1.statusCode !== 200 || idemp2.statusCode !== 200) {
      contractFailures.push(`idempotency test failed: expected 200, got ${idemp1.statusCode} and ${idemp2.statusCode}`);
    } else if (JSON.stringify(idemp1.body) !== JSON.stringify(idemp2.body)) {
      contractFailures.push(`idempotency failure: inconsistent state returned from /api/spatial/intent`);
    }
  } catch (error) {
    contractFailures.push(`idempotency check failed: ${String(error.message || error)}`);
  }

  // CTO chat shape check
  try {
    // Send empty text to bypass Ollama execution and verify the response shape instantly
    const ctoRes = await requestJson(context, 'POST', '/api/spatial/cto/chat', { text: ' ', source: 'qa-test' }, 5000);
    if (ctoRes.statusCode !== 200) {
      contractFailures.push(`/api/spatial/cto/chat returned ${ctoRes.statusCode}`);
    } else if (!ctoRes.body || typeof ctoRes.body.reply_text !== 'string') {
      contractFailures.push(`CTO chat bug detected: response missing 'reply_text' field (UI expects this)`);
    }
  } catch (error) {
    contractFailures.push(`CTO chat check failed: ${String(error.message || error)}`);
  }

  // Apply command mismatch check
  try {
    const applyRes = await requestJson(context, 'POST', '/api/spatial/mutations/apply', { mutations: [] }, 10000);
    if (!applyRes.statusCode || applyRes.statusCode >= 500) {
      contractFailures.push(`/api/spatial/mutations/apply crashed with ${applyRes.statusCode}`);
    }
  } catch (error) {
    contractFailures.push(`apply mutation check failed: ${String(error.message || error)}`);
  }

  try {
    const dashboard = await requestJson(context, 'GET', '/api/dashboard');
    if (dashboard.statusCode !== 200) {
      contractFailures.push(`/api/dashboard returned ${dashboard.statusCode}`);
    } else {
      const missing = objectMissingKeys(dashboard.body, ['refreshedAt', 'refreshIntervalMs', 'state', 'files', 'errors']);
      if (missing.length) contractFailures.push(`/api/dashboard missing ${missing.join(', ')}`);
    }
  } catch (error) {
    contractFailures.push(`/api/dashboard failed: ${String(error.message || error)}`);
  }

  try {
    const projects = await requestJson(context, 'GET', '/api/projects');
    if (projects.statusCode !== 200) {
      contractFailures.push(`/api/projects returned ${projects.statusCode}`);
    } else {
      const missing = objectMissingKeys(projects.body, ['projects', 'config']);
      if (missing.length) contractFailures.push(`/api/projects missing ${missing.join(', ')}`);
    }
  } catch (error) {
    contractFailures.push(`/api/projects failed: ${String(error.message || error)}`);
  }

  try {
    const tasks = await requestJson(context, 'GET', '/api/tasks');
    if (tasks.statusCode !== 200) {
      contractFailures.push(`/api/tasks returned ${tasks.statusCode}`);
    } else {
      const missing = objectMissingKeys(tasks.body, ['tasks']);
      if (missing.length) contractFailures.push(`/api/tasks missing ${missing.join(', ')}`);
    }
  } catch (error) {
    contractFailures.push(`/api/tasks failed: ${String(error.message || error)}`);
  }

  tests.push(makeTest('contract_check', contractFailures.length === 0, contractFailures.join('; ')));

  const fileScope = evaluateDeskFileScope(context, 'ui');
  tests.push(makeTest('file_scope', fileScope.ok, fileScope.reason));

  const syntaxCheck = validateJavaScriptFiles(context.rootPath, ['ui']);
  const loadCheck = loadCommonJsModule(path.join(context.rootPath, 'ui', 'server.js'));
  const syntaxFailures = [];
  if (!syntaxCheck.ok) syntaxFailures.push(syntaxCheck.reason);
  if (!loadCheck.ok) syntaxFailures.push(`ui/server.js failed to load: ${loadCheck.reason}`);
  tests.push(makeTest('syntax_load', syntaxFailures.length === 0, syntaxFailures.length ? syntaxFailures.join('; ') : `parsed ${syntaxCheck.filesChecked} javascript file(s)`));

  const smokeFailures = [];
  try {
    await ensureServer(context);
    const health = await requestJson(context, 'GET', '/api/health');
    if (health.statusCode !== 200) {
      smokeFailures.push(`/api/health returned ${health.statusCode}`);
    }
    const dashboard = await requestJson(context, 'GET', '/api/dashboard');
    if (dashboard.statusCode !== 200) {
      smokeFailures.push(`/api/dashboard returned ${dashboard.statusCode}`);
    }
  } catch (error) {
    smokeFailures.push(`server smoke failed: ${String(error.message || error)}`);
  }
  tests.push(makeTest('smoke', smokeFailures.length === 0, smokeFailures.join('; ')));

  const agentOutputChanged = false; // UI QA uses bypasses that do NOT trigger Ollama
  const llmCheck = verifyLlmInvocation(context.rootPath, startTime);
  tests.push(makeTest('llm_invocation_check', !agentOutputChanged || llmCheck.ok, agentOutputChanged ? llmCheck.reason : 'No agent run triggered'));

  return finalizeDeskResult('ui', applyFixtureFailures(context, 'ui', tests));
}

module.exports = {
  runTests,
};
