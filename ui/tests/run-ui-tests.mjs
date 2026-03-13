const testEntries = [
  { name: 'studioData', path: './studioData.test.mjs' },
  { name: 'orchestratorState', path: './orchestratorState.test.mjs' },
  { name: 'selfUpgrade', path: './selfUpgrade.test.mjs' },
  { name: 'intentAnalysis', path: './intentAnalysis.test.mjs' },
  { name: 'throughputDebug', path: './throughputDebug.test.mjs' },
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
