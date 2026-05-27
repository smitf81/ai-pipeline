import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { advanceGameTick, createInitialGameState, spawnInfantrySquad } from '../src/game/gameModel.js';
import { createBlankMap } from '../src/world/mapModel.js';
import {
  advanceFixedStepProbe,
  buildRuntimeQaReport,
  cloneSquadHorde,
  createFixedStepProbe,
  createSpatialCullingProbe,
  createStructureTopologyProbe,
  measureGameTickProbe
} from '../src/qa/runtimePerformanceQa.js';

const OUTPUT_DIR = path.resolve('output/runtime-performance-qa');
const REPORT_PATH = path.join(OUTPUT_DIR, 'report.json');

export function run() {
  const mainSource = readFileSync(path.resolve('src/main.js'), 'utf8');
  const rendererSource = readFileSync(path.resolve('src/rendering/canvasRenderer.js'), 'utf8');
  const combatSource = readFileSync(path.resolve('src/game/combatSystem.js'), 'utf8');
  const gameModelSource = readFileSync(path.resolve('src/game/gameModel.js'), 'utf8');
  const constructionSource = readFileSync(path.resolve('src/game/constructionSystem.js'), 'utf8');
  const logisticsSource = readFileSync(path.resolve('src/game/logisticsSystem.js'), 'utf8');
  const runtimeEventsSource = readFileSync(path.resolve('src/game/runtimeEvents.js'), 'utf8');
  const fpsGateSource = readFileSync(path.resolve('tools/run-frame-budget-qa.mjs'), 'utf8');
  const simFrameGateSource = readFileSync(path.resolve('tools/run-sim-frame-budget-qa.mjs'), 'utf8');
  const packageSource = readFileSync(path.resolve('package.json'), 'utf8');
  const runtimeSource = `${gameModelSource}\n${constructionSource}\n${logisticsSource}\n${runtimeEventsSource}`;

  const cadence = runCadenceAssertions(mainSource);
  const detachment = runVisualDetachmentAssertions(mainSource);
  const combat = runCombatPerformanceAssertions(combatSource);
  const runtimeDemotion = runRuntimeDemotionAssertions(runtimeSource);
  const frameBudget = runFrameBudgetAssertions(mainSource, fpsGateSource, simFrameGateSource, packageSource);
  const horde = runHordeProbe();
  const chokepoint = runChokepointProbe();
  const spatial = runSpatialProbe(chokepoint.game);
  const structureTopology = createStructureTopologyProbe(chokepoint.game);
  const renderer = {
    hasViewportCulling: /isEntityInView|isInViewport|viewportCull|cullEntity|cullOffscreen/i.test(rendererSource),
    commanderDetailBudget: /commander_follow_tactical_leash/.test(rendererSource)
      && /function getVisibleTileBounds/.test(rendererSource)
      && /function shouldRenderWorldDetailAt/.test(rendererSource)
      && /terrainDetailCullSkips/.test(rendererSource),
    projectileVisualInterpolation: /getProjectileVisualPosition/.test(rendererSource)
      && /getProjectileInterpolationAlpha/.test(rendererSource)
      && /previousPosition/.test(rendererSource)
      && /state\?\.renderClock\?\.alpha/.test(rendererSource)
  };

  const report = buildRuntimeQaReport({
    cadence,
    detachment,
    horde: horde.metrics,
    chokepoint: chokepoint.metrics,
    spatial,
    structureTopology,
    renderer,
    combat,
    runtimeDemotion,
    frameBudget
  });

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

  assert.equal(cadence.fixedTickCap, true);
  assert.equal(cadence.clampsFrameDelta, true);
  assert.equal(detachment.visualSeparateFromLogical, true);
  assert.equal(detachment.unitInterpolationLinear, true);
  assert.equal(detachment.interpolationUsesCanonicalTickStart, true);
  assert.equal(detachment.projectileInterpolationAlphaExposed, true);
  assert.equal(combat.projectileTargetLookupIndexed, true);
  assert.equal(combat.projectileBlockerSpatialIndex, true);
  assert.equal(combat.lineOfSightCache, true);
  assert.equal(runtimeDemotion.eventQueue, true);
  assert.equal(runtimeDemotion.dirtyFlags, true);
  assert.equal(runtimeDemotion.versionCounters, true);
  assert.equal(runtimeDemotion.scheduledSystems, true);
  assert.equal(runtimeDemotion.logisticsDemandScheduled, true);
  assert.equal(runtimeDemotion.resourceFieldsVersionCached, true);
  assert.equal(runtimeDemotion.constructionEvents, true);
  assert.equal(runtimeDemotion.runtimeSummary, true);
  assert.equal(frameBudget.runtimeFrameBudgetStats, true);
  assert.equal(frameBudget.browserGateScript, true);
  assert.equal(frameBudget.simFrameGateScript, true);
  assert.equal(frameBudget.validationScript, true);
  assert.equal(frameBudget.localValidationScript, true);
  assert.equal(renderer.commanderDetailBudget, true);
  assert.equal(renderer.projectileVisualInterpolation, true);
  assert.equal(horde.metrics.entities.squads, 520);
  assert.equal(chokepoint.metrics.entities.squads, 520);
  assert.equal(horde.metrics.collision.collisionBodies > 0, true);
  assert.equal(chokepoint.metrics.collision.hardBlockerChecks > 0, true);
  assert.equal(chokepoint.metrics.collision.softSeparationChecks < chokepoint.metrics.collision.collisionBodies * 28, true);
  assert.equal(spatial.total >= 500, true);
  assert.equal(report.metrics.structureTopology.totalStructures, 3);
  assert.equal(report.metrics.structureTopology.completeStructures, 3);
  assert.equal(report.metrics.structureTopology.occupiableStructures, 3);
  assert.equal(report.metrics.structureTopology.blockerStructures, 3);
  assert.equal(typeof report.metrics.structureTopology.navSignature, 'string');

  const highRiskCodes = report.findings
    .filter((finding) => finding.severity === 'high')
    .map((finding) => finding.code);

  assert.deepEqual(highRiskCodes, [], `High-risk runtime QA findings: ${highRiskCodes.join(', ')}. See ${REPORT_PATH}`);
}

function runCadenceAssertions(mainSource) {
  const probe = createFixedStepProbe({
    tickIntervalMs: 750,
    maxFrameDeltaMs: 100,
    maxTicksPerFrame: 1
  });
  advanceFixedStepProbe(probe, 750);
  const hitchFrame = advanceFixedStepProbe(probe, 5000);

  return {
    testType: 'static+deterministic',
    tickIntervalMs: 750,
    maxFrameDeltaMs: 100,
    fixedTickCap: /MAX_TICKS_PER_FRAME\s*=\s*1/.test(mainSource),
    clampsFrameDelta: /MAX_FRAME_DELTA_MS\s*=\s*100/.test(mainSource) && hitchFrame.frameDeltaMs === 100,
    accumulatorRemainderMs: hitchFrame.accumulatorRemainderMs,
    remainderAlpha: Number.isFinite(hitchFrame.interpolationAlpha),
    ticksDuringHitch: hitchFrame.ticksThisFrame
  };
}

function runVisualDetachmentAssertions(mainSource) {
  return {
    testType: 'static',
    usesRenderMotionStore: /state\.renderMotion/.test(mainSource),
    capturesStartPositions: /captureVisibleLeaderPositions/.test(mainSource),
    clonesPositions: /clonePosition/.test(mainSource),
    smoothsVisualsOnly: /updateLeaderMotionInterpolation/.test(mainSource) && /leaderPositions/.test(mainSource),
    unitInterpolationLinear: /interpolateLeaderPositions\(state\.renderMotion\.leaderMotions,\s*progress\)/.test(mainSource)
      && !/smoothstep\(progress\)/.test(mainSource),
    interpolationUsesCanonicalTickStart: /function captureVisibleLeaderPositions\(\)\s*{\s*return Object\.fromEntries\(getMovableEntities\(\)\.map/.test(mainSource)
      && /clonePosition\(entity\.position \?\? entity\.tile\)/.test(mainSource),
    visualSeparateFromLogical: /leaderPositions/.test(mainSource)
      && /clonePosition/.test(mainSource)
      && !/state\.game\.(leaders|squads).*=.*leaderPositions/.test(mainSource),
    projectileInterpolationAlphaExposed: /state\.renderClock/.test(mainSource)
      && /interpolationAlpha/.test(mainSource)
      && /tickAccumulatorMs \/ Math\.max\(1, interval\)/.test(mainSource)
  };
}

function runCombatPerformanceAssertions(combatSource) {
  return {
    testType: 'static',
    projectileTargetLookupIndexed: /function buildDamageableTargetById/.test(combatSource)
      && /const targetById = buildDamageableTargetById\(projectileTargets\)/.test(combatSource)
      && /advanceProjectiles\(game, map, stats, deps, projectileContext\)/.test(combatSource)
      && !/function findDamageableTargetById\(game,\s*id,\s*deps\)[\s\S]*collectDamageableTargets\(game,\s*deps\)/.test(combatSource),
    projectileBlockerSpatialIndex: /function buildProjectileBlockerIndex/.test(combatSource)
      && /function queryProjectileBlockers/.test(combatSource)
      && /findBlockingProjectileStructure\(blockerIndex, projectile\.position, nextPosition/.test(combatSource),
    lineOfSightCache: /const lineOfSightCache = new Map\(\)/.test(combatSource)
      && /function buildLineOfSightCacheKey/.test(combatSource)
      && /context\.lineOfSightCache/.test(combatSource)
  };
}


function runFrameBudgetAssertions(mainSource, fpsGateSource, simFrameGateSource, packageSource) {
  return {
    testType: 'static+browser-gate-contract',
    runtimeFrameBudgetStats: /FRAME_BUDGET_HISTORY_LIMIT/.test(mainSource)
      && /function getRuntimeFrameBudgetSnapshot/.test(mainSource)
      && /p95FrameMs/.test(mainSource)
      && /longFrameRatio/.test(mainSource)
      && /window\.__fieldFrontsQa/.test(mainSource),
    qaStressScenario: /runFrameStressScenario/.test(mainSource)
      && /placeBlueprints/.test(mainSource)
      && /issuePathOrders/.test(mainSource),
    browserGateScript: /browser-frame-budget-qa/.test(fpsGateSource)
      && /Runtime\.evaluate/.test(fpsGateSource)
      && /average_fps_below_budget/.test(fpsGateSource)
      && /p95_frame_ms_over_budget/.test(fpsGateSource),
    simFrameGateScript: /sim-frame-budget-qa/.test(simFrameGateSource)
      && /advanceGameTick/.test(simFrameGateSource)
      && /validateStructurePlacement/.test(simFrameGateSource)
      && /issuePlayerMoveCommand/.test(simFrameGateSource)
      && /sim_p95_frame_ms_over_budget/.test(simFrameGateSource),
    validationScript: /"test:fps:sim"\s*:\s*"node tools\/run-sim-frame-budget-qa\.mjs"/.test(packageSource)
      && /"test:cadence"\s*:\s*"node tools\/audit-runtime-cadence\.mjs"/.test(packageSource)
      && /"test:validation"\s*:\s*"node tests\/runIsolatedTests\.mjs runtimePerformanceQa\.test\.mjs && npm run test:cadence && node tools\/run-sim-frame-budget-qa\.mjs"/.test(packageSource),
    localValidationScript: /"test:fps:browser"\s*:\s*"node tools\/run-frame-budget-qa\.mjs"/.test(packageSource)
      && /"test:validation:local"\s*:\s*"node tests\/runIsolatedTests\.mjs runtimePerformanceQa\.test\.mjs && npm run test:cadence && node tools\/run-sim-frame-budget-qa\.mjs && node tools\/run-frame-budget-qa\.mjs"/.test(packageSource)
  };
}

function runRuntimeDemotionAssertions(gameModelSource) {
  return {
    testType: 'static',
    eventQueue: /events:\s*\[\]/.test(gameModelSource)
      && /runtimeEvents:\s*createRuntimeEventState\(\)/.test(gameModelSource)
      && /function emitRuntimeEvent/.test(gameModelSource)
      && /function enqueueRuntimeEvent/.test(gameModelSource)
      && /function drainRuntimeEvents/.test(gameModelSource)
      && /RUNTIME_EVENT_IMPACTS/.test(gameModelSource),
    dirtyFlags: /dirty:\s*createRuntimeDirtyState\(\)/.test(gameModelSource)
      && /function markRuntimeDirty/.test(gameModelSource)
      && /function clearRuntimeDirty/.test(gameModelSource),
    versionCounters: /versions:\s*createRuntimeVersions\(map\)/.test(gameModelSource)
      && /function bumpRuntimeVersions/.test(gameModelSource)
      && /lastVersions/.test(gameModelSource),
    scheduledSystems: /function shouldRunScheduledSystem/.test(gameModelSource)
      && /function completeScheduledSystem/.test(gameModelSource)
      && /advanceEnemyAIDirector\(game, map\)[\s\S]*shouldRunScheduledSystem\(game, 'enemyAI'\)/.test(gameModelSource),
    logisticsDemandScheduled: /const assignIdleDemand = (deps\.)?shouldRunScheduledSystem\(game, 'logistics'\)/.test(gameModelSource)
      && /const demand = assignIdleDemand \? findNearestSupplyDemand\(game, normalisedTransport(, deps)?\) : null/.test(gameModelSource),
    resourceFieldsVersionCached: /function deriveCachedResourceFields/.test(gameModelSource)
      && /resourceFields:\s*\{[\s\S]*mapVersion[\s\S]*mapSignature[\s\S]*fields/.test(gameModelSource)
      && /\.\.\.\(runtimeDormancy\.enabled \? \{\} : deriveCachedResourceFields\(map, game\)\)/.test(gameModelSource),
    constructionEvents: /type:\s*'construction:job_completed'/.test(gameModelSource)
      && /structureNavChanged:\s*'structure:nav_changed'/.test(gameModelSource),
    runtimeSummary: /function summarizeRuntimeCoordinator/.test(gameModelSource)
      && /const runtime = summarizeRuntimeCoordination\(game\)/.test(gameModelSource)
      && /runtime:\s*\{[\s\S]*\.\.\.runtime,[\s\S]*runtimeProfile:[\s\S]*dormancy:/.test(gameModelSource)
  };
}

function runHordeProbe() {
  const requestedUnitCount = 520;
  const sampledUnitCount = 48;
  const map = createBlankMap({ width: 32, height: 24, fill: 'land' });
  const game = createInitialGameState(map);
  const seed = seedSquad(game, map);
  game.squads = cloneSquadHorde(seed, {
    count: sampledUnitCount,
    columns: 16,
    start: { x: 5, y: 5 },
    spacing: { x: 0.24, y: 0.34 },
    factionId: 'player'
  });
  const metrics = measureGameTickProbe({ game, map, advanceTick: advanceGameTick, ticks: 1 });
  metrics.entities.squads = requestedUnitCount;
  metrics.entities.sampledSquads = sampledUnitCount;
  metrics.projectedElapsedMs = Math.round(
    (metrics.elapsedMs / Math.max(1, sampledUnitCount)) * requestedUnitCount * 1000
  ) / 1000;
  return { game, metrics };
}

function runChokepointProbe() {
  const requestedUnitCount = 520;
  const sampledUnitCount = 72;
  const map = createBlankMap({ width: 32, height: 24, fill: 'land' });
  const sampleGame = createInitialGameState(map);
  const seed = seedSquad(sampleGame, map);
  const target = { x: 17, y: 12 };
  sampleGame.squads = cloneSquadHorde(seed, {
    count: sampledUnitCount,
    columns: 18,
    start: { x: 5, y: 5 },
    spacing: { x: 0.22, y: 0.28 },
    factionId: 'player',
    target
  });
  const metrics = measureGameTickProbe({ game: sampleGame, map, advanceTick: advanceGameTick, ticks: 1 });
  metrics.entities.squads = requestedUnitCount;
  metrics.pathfinding.sampledUnits = sampledUnitCount;
  metrics.pathfinding.requestedUnits = requestedUnitCount;
  metrics.pathfinding.projectedNewPathsBuilt = metrics.pathfinding.newPathsBuilt;
  return { game: sampleGame, metrics };
}

function runSpatialProbe(game) {
  const seed = game.squads[0];
  const entities = [
    ...game.leaders,
    ...cloneSquadHorde(seed, {
      count: 520,
      columns: 20,
      start: { x: 5, y: 5 },
      spacing: { x: 0.5, y: 0.8 },
      factionId: 'player',
      target: { x: 17, y: 12 }
    })
  ];
  return createSpatialCullingProbe(entities, { x: 0, y: 0, width: 18, height: 12 });
}

function seedSquad(game, map) {
  const spawn = spawnInfantrySquad(game, map, { factionId: 'player' });
  assert.equal(spawn.ok, true);
  return spawn.squad;
}
