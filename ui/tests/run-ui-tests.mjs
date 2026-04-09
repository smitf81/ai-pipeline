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
  { name: 'canonicalTruthGovernance', path: './canonicalTruthGovernance.test.mjs' },
  { name: 'canonicalTruthRegistryDrift', path: './canonicalTruthRegistryDrift.test.mjs' },
  { name: 'workspaceRoute', path: './workspaceRoute.test.mjs' },
  { name: 'truthKernelAdapter', path: './truthKernelAdapter.test.mjs' },
  { name: 'truthKernelLayout', path: './truthKernelLayout.test.mjs' },
  { name: 'truthKernelView', path: './truthKernelView.test.mjs' },
  { name: 'truthKernelProvenance', path: './truthKernelProvenance.test.mjs' },
  { name: 'truthKernelIntegration', path: './truthKernelIntegration.test.mjs' },
  { name: 'truthKernelRoute', path: './truthKernelRoute.test.mjs' },
  { name: 'deskProvenance', path: './deskProvenance.test.mjs' },
  { name: 'qaReadableSections', path: './qaReadableSections.test.mjs' },
  { name: 'qaOutputFeed', path: './qaOutputFeed.test.mjs' },
  { name: 'qaSessionSummary', path: './qaSessionSummary.test.mjs' },
  { name: 'qaScorecardIntegrity', path: './qaScorecardIntegrity.test.mjs' },
  { name: 'qaDeskProvenancePlumbing', path: './qaDeskProvenancePlumbing.test.mjs' },
  { name: 'qaEvidenceProvenance', path: './qaEvidenceProvenance.test.mjs' },
  { name: 'qaStructuredProvenance', path: './qaStructuredProvenance.test.mjs' },
  { name: 'deskPropertiesRoute', path: './deskPropertiesRoute.test.mjs' },
  { name: 'intentRoute', path: './intentRoute.test.mjs' },
  { name: 'qaEvidenceRoute', path: './qaEvidenceRoute.test.mjs' },
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
  { name: 'bootIntegrity', path: './bootIntegrity.test.mjs' },
  { name: 'bootRecoveryDaemon', path: './bootRecoveryDaemon.test.mjs' },
  { name: 'recoveryShell', path: './recoveryShell.test.mjs' },
  { name: 'uiBootIntegrityLane', path: './uiBootIntegrityLane.test.mjs' },
  { name: 'spatialAppRsg', path: './spatialApp.rsg.test.mjs' },
  { name: 'sliceRepository', path: './sliceRepository.test.mjs' },
  { name: 'archivistWriteback', path: './archivistWriteback.test.mjs' },
  { name: 'changeHygiene', path: './changeHygiene.test.mjs' },
  { name: 'knownFixes', path: './knownFixes.test.mjs' },
  { name: 'failureMemory', path: './failureMemory.test.mjs' },
  { name: 'agentAudit', path: './agentAudit.test.mjs' },
  { name: 'agentCapabilities', path: './agentCapabilities.test.mjs' },
  { name: 'constrainedAutoFix', path: './constrainedAutoFix.test.mjs' },
  { name: 'autonomyPolicy', path: './autonomyPolicy.test.mjs' },
  { name: 'fixTasks', path: './fixTasks.test.mjs' },
  { name: 'taskArtifacts', path: './taskArtifacts.test.mjs' },
  { name: 'taskCache', path: './taskCache.test.mjs' },
  { name: 'plannerOuttray', path: './plannerOuttray.test.mjs' },
  { name: 'governedLoopContract', path: './governedLoopContract.test.mjs' },
  { name: 'canonicalIntakePersistence', path: './canonicalIntakePersistence.test.mjs' },
  { name: 'intentExtractionSurface', path: './intentExtractionSurface.test.mjs' },
  { name: 'plannerHandoffVisibility', path: './plannerHandoffVisibility.test.mjs' },
  { name: 'executionHandoffState', path: './executionHandoffState.test.mjs' },
  { name: 'archivistGovernedWritebackState', path: './archivistGovernedWritebackState.test.mjs' },
  { name: 'ctoCanonicalReadthrough', path: './ctoCanonicalReadthrough.test.mjs' },
  { name: 'ctoGovernedRepairTruth', path: './ctoGovernedRepairTruth.test.mjs' },
  { name: 'plannerRegressionPack', path: './plannerRegressionPack.test.mjs' },
  { name: 'plannerCanonicalIntegrity', path: './plannerCanonicalIntegrity.test.mjs' },
  { name: 'preflightGuards', path: './preflightGuards.test.mjs' },
  { name: 'debugSuite', path: './debugSuite.test.mjs' },
  { name: 'studioData', path: './studioData.test.mjs' },
  { name: 'roleTaxonomy', path: './roleTaxonomy.test.mjs' },
  { name: 'rndExperimentContract', path: './rndExperimentContract.test.mjs' },
  { name: 'rndExperimentSeed', path: './rndExperimentSeed.test.mjs' },
  { name: 'rndExperimentPayload', path: './rndExperimentPayload.test.mjs' },
  { name: 'rosterSurface', path: './rosterSurface.test.mjs' },
  { name: 'studioMutations', path: './studioMutations.test.mjs' },
  { name: 'studioDependencyValidation', path: './studioDependencyValidation.test.mjs' },
  { name: 'orchestratorState', path: './orchestratorState.test.mjs' },
  { name: 'selfUpgrade', path: './selfUpgrade.test.mjs' },
  { name: 'taCandidates', path: './taCandidates.test.mjs' },
  { name: 'talentUi', path: './talentUi.test.mjs' },
  { name: 'server', path: './server.test.mjs' },
  { name: 'qaTestRegistry', path: './qaTestRegistry.test.mjs' },
  { name: 'qaAuditTrail', path: './qaAuditTrail.test.mjs' },
  { name: 'externalQaProbe', path: './externalQaProbe.test.mjs' },
  { name: 'externalValidation', path: './externalValidation.test.mjs' },
  { name: 'qaMcpLauncher', path: './qaMcpLauncher.test.mjs' },
  { name: 'qaMcpPreflight', path: './qaMcpPreflight.test.mjs' },
  { name: 'qaMcpLiveStatus', path: './qaMcpLiveStatus.test.mjs' },
  { name: 'qaMcpProofOfLife', path: './qaMcpProofOfLife.test.mjs' },
  { name: 'qaLeadRunner', path: './qaLeadRunner.test.mjs' },
  { name: 'qaLeadCyclePublication', path: './qaLeadCyclePublication.test.mjs' },
  { name: 'qaLeadSurfaces', path: './qaLeadSurfaces.test.mjs' },
  { name: 'qaLiveStateCoherence', path: './qaLiveStateCoherence.test.mjs' },
  { name: 'qaLaneCanaries', path: './qaLaneCanaries.test.mjs' },
  { name: 'qaCanaryInspector', path: './qaCanaryInspector.test.mjs' },
  { name: 'qaUiBootCanary', path: './qaUiBootCanary.test.mjs' },
  { name: 'qaPlannerCanonicalCanary', path: './qaPlannerCanonicalCanary.test.mjs' },
  { name: 'qaRouteContractCanary', path: './qaRouteContractCanary.test.mjs' },
  { name: 'qaLoopAudit', path: './qaLoopAudit.test.mjs' },
  { name: 'qaRepairLoop', path: './qaRepairLoop.test.mjs' },
  { name: 'qaRepairLaneContracts', path: './qaRepairLaneContracts.test.mjs' },
  { name: 'qaRepairLaneInspector', path: './qaRepairLaneInspector.test.mjs' },
  { name: 'repairLaneTrustPolicy', path: './repairLaneTrustPolicy.test.mjs' },
  { name: 'qaResearchOperationalStatus', path: './qaResearchOperationalStatus.test.mjs' },
  { name: 'qaResearchTrigger', path: './qaResearchTrigger.test.mjs' },
  { name: 'ctoPipeline', path: './ctoPipeline.test.mjs' },
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
