import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { writeLocalGateReport } = require('../qaRunner.js');

const testEntries = [
  { name: 'actionRequestParser', path: './actionRequestParser.test.mjs' },
  { name: 'anchorResolver', path: './anchorResolver.test.mjs' },
  { name: 'agentRegistry', path: './agentRegistry.test.mjs' },
  { name: 'agentWorkers', path: './agentWorkers.test.mjs' },
  { name: 'aceConnector', path: './aceConnector.test.mjs' },
  { name: 'componentRegistry', path: './componentRegistry.test.mjs' },
  { name: 'agentOwnershipModel', path: './agentOwnershipModel.test.mjs' },
  { name: 'relationshipHiringSignals', path: './relationshipHiringSignals.test.mjs' },
  { name: 'resourceSignalModel', path: './resourceSignalModel.test.mjs' },
  { name: 'uiActionRegistry', path: './uiActionRegistry.test.mjs' },
  { name: 'studioQuickAccess', path: './studioQuickAccess.test.mjs' },
  { name: 'testAttributeCards', path: './testAttributeCards.test.mjs' },
  { name: 'aceRuntimeMcp', path: './aceRuntimeMcp.test.mjs' },
  { name: 'llmAdapter', path: './llmAdapter.test.mjs' },
  { name: 'moduleRunner', path: './moduleRunner.test.mjs' },
  { name: 'graphEngine', path: './graphEngine.test.mjs' },
  { name: 'graphQueries', path: './graphQueries.test.mjs' },
  { name: 'graphMutations', path: './graphMutations.test.mjs' },
  { name: 'mutationEngine', path: './mutationEngine.test.mjs' },
  { name: 'worldScaffoldView', path: './worldScaffoldView.test.mjs' },
  { name: 'persistence', path: './persistence.test.mjs' },
  { name: 'utilityWindowState', path: './utilityWindowState.test.mjs' },
  { name: 'studioLayoutModel', path: './studioLayoutModel.test.mjs' },
  { name: 'studioOrgHealthModel', path: './studioOrgHealthModel.test.mjs' },
  { name: 'studioLayoutRelationships', path: './studioLayoutRelationships.test.mjs' },
  { name: 'spatialAppSmoke', path: './spatialApp.smoke.test.mjs' },
  { name: 'spatialAppRsg', path: './spatialApp.rsg.test.mjs' },
  { name: 'sliceRepository', path: './sliceRepository.test.mjs' },
  { name: 'archivistWriteback', path: './archivistWriteback.test.mjs' },
  { name: 'knownFixes', path: './knownFixes.test.mjs' },
  { name: 'failureMemory', path: './failureMemory.test.mjs' },
  { name: 'agentAudit', path: './agentAudit.test.mjs' },
  { name: 'agentCapabilities', path: './agentCapabilities.test.mjs' },
  { name: 'autonomyPolicy', path: './autonomyPolicy.test.mjs' },
  { name: 'fixTasks', path: './fixTasks.test.mjs' },
  { name: 'taskArtifacts', path: './taskArtifacts.test.mjs' },
  { name: 'taskCache', path: './taskCache.test.mjs' },
  { name: 'preflightGuards', path: './preflightGuards.test.mjs' },
  { name: 'debugSuite', path: './debugSuite.test.mjs' },
  { name: 'studioData', path: './studioData.test.mjs' },
  { name: 'roleTaxonomy', path: './roleTaxonomy.test.mjs' },
  { name: 'rosterSurface', path: './rosterSurface.test.mjs' },
  { name: 'studioMutations', path: './studioMutations.test.mjs' },
  { name: 'studioDependencyValidation', path: './studioDependencyValidation.test.mjs' },
  { name: 'orchestratorState', path: './orchestratorState.test.mjs' },
  { name: 'selfUpgrade', path: './selfUpgrade.test.mjs' },
  { name: 'taCandidates', path: './taCandidates.test.mjs' },
  { name: 'talentUi', path: './talentUi.test.mjs' },
  { name: 'server', path: './server.test.mjs' },
  { name: 'intentAnalysis', path: './intentAnalysis.test.mjs' },
  { name: 'staffingRules', path: './staffingRules.test.mjs' },
  { name: 'throughputDebug', path: './throughputDebug.test.mjs' },
  { name: 'qaRunner', path: './qaRunner.test.mjs' },
  { name: 'appViewerMode', path: './appViewerMode.test.mjs' },
];

let failures = 0;
const startedAt = new Date().toISOString();
const startedMs = Date.now();
const results = [];

for (const entry of testEntries) {
  const entryStartedMs = Date.now();
  try {
    const module = await import(entry.path);
    if (typeof module.default !== 'function') {
      throw new Error(`Test module ${entry.path} does not export a default runner`);
    }
    await module.default();
    results.push({
      name: entry.name,
      path: entry.path,
      status: 'pass',
      durationMs: Date.now() - entryStartedMs,
      error: null,
    });
    console.log(`PASS ${entry.name}`);
  } catch (error) {
    failures += 1;
    results.push({
      name: entry.name,
      path: entry.path,
      status: 'fail',
      durationMs: Date.now() - entryStartedMs,
      error: String(error?.message || error),
    });
    console.error(`FAIL ${entry.name}`);
    console.error(error?.stack || String(error));
  }
}

const finishedAt = new Date().toISOString();
const report = {
  id: 'test-unit-latest',
  source: 'ui-test-runner',
  command: 'npm run test:unit',
  status: failures ? 'fail' : 'pass',
  summary: failures
    ? `${failures} of ${testEntries.length} UI checks failed.`
    : `All ${testEntries.length} UI checks passed.`,
  startedAt,
  finishedAt,
  durationMs: Date.now() - startedMs,
  totalChecks: testEntries.length,
  passedCount: testEntries.length - failures,
  failedCount: failures,
  failures: results
    .filter((entry) => entry.status === 'fail')
    .map((entry) => ({
      name: entry.name,
      path: entry.path,
      error: entry.error,
    })),
  results,
};
writeLocalGateReport(path.resolve(process.cwd(), '..'), 'test-unit-latest', report);

if (failures) {
  process.exitCode = 1;
} else {
  console.log(`All ${testEntries.length} UI checks passed.`);
}
