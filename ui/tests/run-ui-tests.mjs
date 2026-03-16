const testEntries = [
  { name: 'anchorResolver', path: './anchorResolver.test.mjs' },
  { name: 'agentRegistry', path: './agentRegistry.test.mjs' },
  { name: 'agentWorkers', path: './agentWorkers.test.mjs' },
  { name: 'aceConnector', path: './aceConnector.test.mjs' },
  { name: 'aceRuntimeMcp', path: './aceRuntimeMcp.test.mjs' },
  { name: 'graphEngine', path: './graphEngine.test.mjs' },
  { name: 'mutationEngine', path: './mutationEngine.test.mjs' },
  { name: 'studioData', path: './studioData.test.mjs' },
  { name: 'orchestratorState', path: './orchestratorState.test.mjs' },
  { name: 'selfUpgrade', path: './selfUpgrade.test.mjs' },
  { name: 'taCandidates', path: './taCandidates.test.mjs' },
  { name: 'talentUi', path: './talentUi.test.mjs' },
  { name: 'server', path: './server.test.mjs' },
  { name: 'intentAnalysis', path: './intentAnalysis.test.mjs' },
  { name: 'throughputDebug', path: './throughputDebug.test.mjs' },
  { name: 'qaRunner', path: './qaRunner.test.mjs' },
  { name: 'spatialApp RSG', path: './spatialApp.rsg.test.mjs' },
  { name: 'spatialApp smoke', path: './spatialApp.smoke.test.mjs' },
];

let failures = 0;

for (const entry of testEntries) {
  try {
    const module = await import(entry.path);
    if (typeof module.default !== 'function') {
      throw new Error(`Test module ${entry.path} does not export a default runner`);
    }
    await module.default();
    console.log(`PASS ${entry.name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${entry.name}`);
    console.error(error?.stack || String(error));
  }
}

if (failures) {
  process.exitCode = 1;
} else {
  console.log(`All ${testEntries.length} UI checks passed.`);
}
