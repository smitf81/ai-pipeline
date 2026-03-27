const plannerQA = require('./desks/plannerQA');
const runnerQA = require('./desks/runnerQA');
const taQA = require('./desks/taQA');
const { TEST_METRIC_DEFINITIONS } = require('./testMetricDefinitions');
const uiQA = require('./desks/uiQA');
const { closeContext, createContext } = require('./shared/debugSuite');

const DESK_RUNNERS = [
  plannerQA,
  runnerQA,
  uiQA,
  taQA,
];

function collectFailures(deskReports) {
  return deskReports.flatMap((deskReport) => (
    deskReport.tests
      .filter((test) => test.status === 'fail')
      .map((test) => ({
        desk: deskReport.desk,
        test: test.name,
        reason: test.reason || 'validation failed',
      }))
  ));
}

function buildSummary(deskReports, failures) {
  const deskCount = deskReports.length;
  const testCount = deskReports.reduce((total, deskReport) => total + deskReport.tests.length, 0);
  if (!failures.length) {
    return `all ${deskCount} desks passed ${testCount} checks`;
  }
  const failedDesks = Array.from(new Set(failures.map((failure) => failure.desk)));
  return `${failedDesks.length} of ${deskCount} desks failed; ${failures.length} of ${testCount} checks failed`;
}

async function runAll(options = {}) {
  const context = createContext(options);
  const originalConsoleDebug = console.debug;
  try {
    console.debug = () => {};
    const desks = [];
    for (const runner of DESK_RUNNERS) {
      desks.push(await runner.runTests(context));
    }
    const failures = collectFailures(desks);
    return {
      status: failures.length ? 'fail' : 'pass',
      summary: buildSummary(desks, failures),
      failures,
      desks,
      metricDefinitions: TEST_METRIC_DEFINITIONS,
      startedAt: context.startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - context.startedMs,
    };
  } finally {
    console.debug = originalConsoleDebug;
    await closeContext(context);
  }
}

module.exports = {
  runAll,
};
