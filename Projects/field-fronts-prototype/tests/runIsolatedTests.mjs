import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_TIMEOUT_MS = 12000;
const TEST_TIMEOUT_OVERRIDES_MS = {
  'constructionJobs.test.mjs': 30000,
  'storageSupplyLines.test.mjs': 45000,
  'combatMechanics.test.mjs': 25000,
  'navigationConstructionRegressionLock.test.mjs': 25000,
  'playerControlEnemyDirector.test.mjs': 25000,
  'gameModel.test.mjs': 25000
};
const TEST_MODULES = [
  'editorModel.test.mjs',
  'structureRegistry.test.mjs',
  'structureTopology.test.mjs',
  'structureOccupancy.test.mjs',
  'structureJoinery.test.mjs',
  'marchingSquares.test.mjs',
  'collisionAuthority.test.mjs',
  'constructionJobs.test.mjs',
  'resourceGathering.test.mjs',
  'storageSupplyLines.test.mjs',
  'combatMechanics.test.mjs',
  'navigationConstructionRegressionLock.test.mjs',
  'playerControlEnemyDirector.test.mjs',
  'gameModel.test.mjs',
  'builderPopulation.test.mjs',
  'progressionSystem.test.mjs',
  'coverSystem.test.mjs',
  'cadenceRegistry.test.mjs',
  'runtimeEvents.test.mjs',
  'runtimePerformanceQa.test.mjs',
  'appModeRouting.test.mjs',
  'openingCommanderSupplyRegression.test.mjs',
  'uiHudRegression.test.mjs',
  'commandWheelAdapter.test.mjs',
  'mousePlaytester.test.mjs'
];

const runnerPath = fileURLToPath(import.meta.url);
const testsDir = path.dirname(runnerPath);
const projectRoot = path.dirname(testsDir);
const { timeoutMs, filters } = parseArgs(process.argv.slice(2));
const testFiles = resolveTestFiles(filters);

if (testFiles.length === 0) {
  console.error(`No test modules matched: ${filters.join(', ') || '(default list)'}`);
  process.exit(1);
}

let failures = 0;
let timeouts = 0;
const suiteStartedAt = Date.now();

for (const file of testFiles) {
  const result = await runTestModule(file, getTimeoutForTest(file, timeoutMs));
  if (result.status === 'PASS') {
    console.log(`${result.status} ${result.name} ${formatDuration(result.durationMs)}`);
    continue;
  }

  if (result.status === 'TIMEOUT') {
    timeouts += 1;
  } else {
    failures += 1;
  }
  console.error(`${result.status} ${result.name} ${formatDuration(result.durationMs)}`);
  printCapturedOutput(result);
}

const suiteDuration = Date.now() - suiteStartedAt;
console.log(`\nIsolated test run complete: ${testFiles.length - failures - timeouts} passed, ${failures} failed, ${timeouts} timed out in ${formatDuration(suiteDuration)}.`);

if (failures > 0 || timeouts > 0) {
  process.exitCode = 1;
}

function parseArgs(args) {
  let timeout = null;
  const selected = [];
  args.forEach((arg) => {
    if (arg.startsWith('--timeout=')) {
      timeout = parsePositiveInt(arg.slice('--timeout='.length), DEFAULT_TIMEOUT_MS);
      return;
    }
    selected.push(arg);
  });
  return {
    timeoutMs: timeout,
    filters: selected
  };
}

function getTimeoutForTest(file, explicitTimeoutMs) {
  if (explicitTimeoutMs) {
    return explicitTimeoutMs;
  }
  return TEST_TIMEOUT_OVERRIDES_MS[path.basename(file)] ?? DEFAULT_TIMEOUT_MS;
}

function resolveTestFiles(filters) {
  if (filters.length === 0) {
    return TEST_MODULES.map((file) => path.join(testsDir, file));
  }

  return filters.flatMap((filter) => {
    const normalized = filter.replaceAll('\\', '/');
    const directPath = path.isAbsolute(filter)
      ? filter
      : path.resolve(projectRoot, filter);
    if (existsSync(directPath) && directPath.endsWith('.test.mjs')) {
      return [directPath];
    }

    const fileName = path.basename(normalized).endsWith('.mjs')
      ? path.basename(normalized)
      : `${path.basename(normalized).replace(/\.test$/, '')}.test.mjs`;
    return TEST_MODULES
      .filter((candidate) => candidate === fileName || candidate.includes(fileName))
      .map((candidate) => path.join(testsDir, candidate));
  });
}

function runTestModule(file, timeoutMs) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, [
      '--input-type=module',
      '--eval',
      createWorkerSource(file)
    ], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    const chunks = { stdout: [], stderr: [] };
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => chunks.stdout.push(chunk));
    child.stderr.on('data', (chunk) => chunks.stderr.push(chunk));
    child.on('error', (error) => {
      chunks.stderr.push(Buffer.from(`${error.stack ?? error}\n`));
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startedAt;
      const status = timedOut ? 'TIMEOUT' : code === 0 ? 'PASS' : 'FAIL';
      resolve({
        status,
        name: path.basename(file),
        file,
        durationMs,
        code,
        signal,
        stdout: Buffer.concat(chunks.stdout).toString('utf8').trimEnd(),
        stderr: Buffer.concat(chunks.stderr).toString('utf8').trimEnd()
      });
    });
  });
}

function createWorkerSource(file) {
  const moduleUrl = pathToFileURL(file).href;
  return `
    try {
      const module = await import(${JSON.stringify(moduleUrl)});
      if (typeof module.run !== 'function') {
        throw new Error('Test module must export run()');
      }
      await module.run();
      process.exit(0);
    } catch (error) {
      console.error(error?.stack ?? error);
      process.exit(1);
    }
  `;
}

function printCapturedOutput(result) {
  if (result.stdout) {
    console.error(indentBlock('stdout', result.stdout));
  }
  if (result.stderr) {
    console.error(indentBlock('stderr', result.stderr));
  }
  if (!result.stdout && !result.stderr && result.signal) {
    console.error(`  signal: ${result.signal}`);
  }
}

function indentBlock(label, value) {
  return `  ${label}:\n${value.split('\n').map((line) => `    ${line}`).join('\n')}`;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatDuration(ms) {
  return `${ms}ms`;
}
