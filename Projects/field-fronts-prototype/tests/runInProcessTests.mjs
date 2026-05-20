import { run as runEditorModel } from './editorModel.test.mjs';
import { run as runGameModel } from './gameModel.test.mjs';
import { run as runCollisionAuthority } from './collisionAuthority.test.mjs';
import { run as runConstructionJobs } from './constructionJobs.test.mjs';
import { run as runRuntimePerformanceQa } from './runtimePerformanceQa.test.mjs';
import { run as runStructureRegistry } from './structureRegistry.test.mjs';
import { run as runStructureTopology } from './structureTopology.test.mjs';

const tests = [
  ['editor model', runEditorModel],
  ['structure registry', runStructureRegistry],
  ['structure topology', runStructureTopology],
  ['collision authority', runCollisionAuthority],
  ['construction jobs', runConstructionJobs],
  ['game model', runGameModel],
  ['runtime performance QA', runRuntimePerformanceQa]
];

let failures = 0;
for (const [name, run] of tests) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}`);
    console.error(error);
  }
}

if (failures > 0) {
  process.exitCode = 1;
}
