import { run as runEditorModel } from './editorModel.test.mjs';
import { run as runGameModel } from './gameModel.test.mjs';
import { run as runCollisionAuthority } from './collisionAuthority.test.mjs';
import { run as runConstructionJobs } from './constructionJobs.test.mjs';
import { run as runResourceGathering } from './resourceGathering.test.mjs';
import { run as runStorageSupplyLines } from './storageSupplyLines.test.mjs';
import { run as runNavigationConstructionRegressionLock } from './navigationConstructionRegressionLock.test.mjs';
import { run as runPlayerControlEnemyDirector } from './playerControlEnemyDirector.test.mjs';
import { run as runRuntimePerformanceQa } from './runtimePerformanceQa.test.mjs';
import { run as runRuntimeEvents } from './runtimeEvents.test.mjs';
import { run as runCadenceRegistry } from './cadenceRegistry.test.mjs';
import { run as runAppModeRouting } from './appModeRouting.test.mjs';
import { run as runOpeningCommanderSupplyRegression } from './openingCommanderSupplyRegression.test.mjs';
import { run as runUiHudRegression } from './uiHudRegression.test.mjs';
import { run as runStructureRegistry } from './structureRegistry.test.mjs';
import { run as runStructureTopology } from './structureTopology.test.mjs';
import { run as runStructureOccupancy } from './structureOccupancy.test.mjs';
import { run as runStructureJoinery } from './structureJoinery.test.mjs';
import { run as runCombatMechanics } from './combatMechanics.test.mjs';
import { run as runMarchingSquares } from './marchingSquares.test.mjs';
import { run as runBuilderPopulation } from './builderPopulation.test.mjs';
import { run as runSeededMapGenerator } from './seededMapGenerator.test.mjs';
import { run as runScenarioLayer } from './scenarioLayer.test.mjs';
import { run as runScenarioCatalogue } from './scenarioCatalogue.test.mjs';
import { run as runScenarioSpine } from './scenarioSpine.test.mjs';
import { run as runSceneEntity } from './sceneEntity.test.mjs';
import { run as runAiBehaviourContracts } from './aiBehaviourContracts.test.mjs';
import { run as runBehaviourFields } from './behaviourFields.test.mjs';
import { run as runAiBehaviourAppraisal } from './aiBehaviourAppraisal.test.mjs';
import { run as runCommandWheel } from './commandWheel.test.mjs';
import { run as runCommandWheelAdapter } from './commandWheelAdapter.test.mjs';
import { run as runCoverSystem } from './coverSystem.test.mjs';
import { run as runWeatherFields } from './weatherFields.test.mjs';
import { run as runWeatherVisuals } from './weatherVisuals.test.mjs';
import { run as runPlaytestStabilization } from './playtestStabilization.test.mjs';
import { run as runBattlefieldTrace } from './battlefieldTrace.test.mjs';
import { run as runMousePlaytester } from './mousePlaytester.test.mjs';

const tests = [
  ['editor model', runEditorModel],
  ['structure registry', runStructureRegistry],
  ['structure topology', runStructureTopology],
  ['structure occupancy', runStructureOccupancy],
  ['structure joinery', runStructureJoinery],
  ['marching squares', runMarchingSquares],
  ['seeded map generator', runSeededMapGenerator],
  ['scenario layer', runScenarioLayer],
  ['scenario catalogue', runScenarioCatalogue],
  ['scenario spine', runScenarioSpine],
  ['scene entity authoring', runSceneEntity],
  ['AI behaviour contracts', runAiBehaviourContracts],
  ['behaviour fields', runBehaviourFields],
  ['AI behaviour appraisal', runAiBehaviourAppraisal],
  ['command wheel', runCommandWheel],
  ['command wheel adapter', runCommandWheelAdapter],
  ['cover system', runCoverSystem],
  ['weather fields', runWeatherFields],
  ['weather visuals', runWeatherVisuals],
  ['battlefield trace visuals', runBattlefieldTrace],
  ['pre-playtest stabilisation', runPlaytestStabilization],
  ['collision authority', runCollisionAuthority],
  ['construction jobs', runConstructionJobs],
  ['resource gathering', runResourceGathering],
  ['storage + supply lines', runStorageSupplyLines],
  ['combat mechanics', runCombatMechanics],
  ['navigation + construction regression lock', runNavigationConstructionRegressionLock],
  ['player control + enemy director', runPlayerControlEnemyDirector],
  ['game model', runGameModel],
  ['builder population', runBuilderPopulation],
  ['runtime events', runRuntimeEvents],
  ['cadence registry', runCadenceRegistry],
  ['runtime performance QA', runRuntimePerformanceQa],
  ['app mode routing', runAppModeRouting],
  ['opening commander + supply regression', runOpeningCommanderSupplyRegression],
  ['UI HUD regression', runUiHudRegression],
  ['Mouse playtester', runMousePlaytester]
];

let failures = 0;
for (const [name, run] of tests) {
  try {
    await run();
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
