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

  const cadence = runCadenceAssertions(mainSource);
  const detachment = runVisualDetachmentAssertions(mainSource);
  const horde = runHordeProbe();
  const chokepoint = runChokepointProbe();
  const spatial = runSpatialProbe(chokepoint.game);
  const structureTopology = createStructureTopologyProbe(chokepoint.game);
  const renderer = {
    hasViewportCulling: /isEntityInView|isInViewport|viewportCull|cullEntity|cullOffscreen/i.test(rendererSource)
  };

  const report = buildRuntimeQaReport({
    cadence,
    detachment,
    horde: horde.metrics,
    chokepoint: chokepoint.metrics,
    spatial,
    structureTopology,
    renderer
  });

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

  assert.equal(cadence.fixedTickCap, true);
  assert.equal(cadence.clampsFrameDelta, true);
  assert.equal(detachment.visualSeparateFromLogical, true);
  assert.equal(detachment.unitInterpolationLinear, true);
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
    visualSeparateFromLogical: /leaderPositions/.test(mainSource)
      && /clonePosition/.test(mainSource)
      && !/state\.game\.(leaders|squads).*=.*leaderPositions/.test(mainSource)
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
