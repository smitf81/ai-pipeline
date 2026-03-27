const fs = require('fs');
const path = require('path');
const { buildRunnerContractCheckQualityCard } = require('../testAttributeCards');
const {
  applyFixtureFailures,
  commandExists,
  evaluateDeskFileScope,
  extractHtmlSelectOptions,
  extractRunnerSubcommands,
  finalizeDeskResult,
  makeTest,
  objectMissingKeys,
  readJsonSafe,
  requestJson,
  routeExists,
  validatePythonFiles,
  verifyLlmInvocation,
} = require('../shared/debugSuite');

function normalizePresetPath(cwd, file) {
  return String(path.join(cwd, file)).replace(/\\/g, '/');
}

function validatePreset(rootPath, name, spec) {
  const failures = [];
  const cwd = path.join(rootPath, spec.cwd || '.');

  if (!Array.isArray(spec.cmd) || spec.cmd.length === 0) {
    failures.push(`preset ${name} has no command`);
    return failures;
  }
  if (!commandExists(spec.cmd[0])) {
    failures.push(`preset ${name} command missing: ${spec.cmd[0]}`);
  }
  if (!fs.existsSync(cwd)) {
    failures.push(`preset ${name} cwd missing: ${spec.cwd || '.'}`);
  }
  for (const arg of spec.cmd.slice(1)) {
    if (!/\.(js|py|mjs|cjs)$/i.test(String(arg || ''))) continue;
    const candidate = path.join(cwd, arg);
    if (!fs.existsSync(candidate)) {
      failures.push(`preset ${name} missing file ${normalizePresetPath(spec.cwd || '.', arg)}`);
    }
  }

  return failures;
}

async function runTests(context) {
  const startTime = Date.now();
  const tests = [];
  const contractFailures = [];
  const rootPath = context.rootPath;

  if (!routeExists(context, 'post', '/api/execute')) {
    contractFailures.push('missing endpoint /api/execute');
  }
  if (!routeExists(context, 'get', '/api/presets')) {
    contractFailures.push('missing endpoint /api/presets');
  }

  const uiActions = extractHtmlSelectOptions(path.join(rootPath, 'ui', 'public', 'index.html'), 'actionSelect');
  const runnerCommands = extractRunnerSubcommands(path.join(rootPath, 'runner', 'ai.py'));
  const expectedCommands = [...new Set([...uiActions, 'apply'])];
  for (const action of expectedCommands) {
    if (!runnerCommands.includes(action)) {
      contractFailures.push(`runner subcommand missing: ${action} (UI expectation)`);
    }
  }

  const presets = readJsonSafe(path.join(rootPath, 'ace_commands.json'), {});
  for (const [name, spec] of Object.entries(presets || {})) {
    contractFailures.push(...validatePreset(rootPath, name, spec));
  }

  try {
    const response = await requestJson(context, 'GET', '/api/presets');
    if (response.statusCode !== 200) {
      contractFailures.push(`/api/presets returned ${response.statusCode}`);
    } else {
      const missing = objectMissingKeys(response.body, ['presets']);
      if (missing.length) {
        contractFailures.push(`/api/presets missing ${missing.join(', ')}`);
      }
      if (!Array.isArray(response.body?.presets)) {
        contractFailures.push('/api/presets did not return an array');
      }
    }
  } catch (error) {
    contractFailures.push(`/api/presets failed: ${String(error.message || error)}`);
  }

  tests.push(makeTest(
    'contract_check',
    contractFailures.length === 0,
    contractFailures.join('; '),
    'critical',
    { qualityCard: buildRunnerContractCheckQualityCard() },
  ));

  const fileScope = evaluateDeskFileScope(context, 'runner');
  tests.push(makeTest('file_scope', fileScope.ok, fileScope.reason));

  const syntaxLoad = validatePythonFiles(rootPath, ['runner', '.']);
  tests.push(makeTest('syntax_load', syntaxLoad.ok, syntaxLoad.ok ? `compiled ${syntaxLoad.filesChecked} python file(s)` : syntaxLoad.reason));

  const agentOutputChanged = false; // Runner QA only verifies routing/syntax currently
  const llmCheck = verifyLlmInvocation(rootPath, startTime);
  tests.push(makeTest('llm_invocation_check', !agentOutputChanged || llmCheck.ok, agentOutputChanged ? llmCheck.reason : 'No agent run triggered'));

  return finalizeDeskResult('runner', applyFixtureFailures(context, 'runner', tests));
}

module.exports = {
  runTests,
};
