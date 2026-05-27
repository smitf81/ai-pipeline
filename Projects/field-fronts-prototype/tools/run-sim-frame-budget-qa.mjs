import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import {
  advanceGameTick,
  createInitialGameState,
  issuePlayerMoveCommand,
  placeStructureBuildOrder,
  probeMapAt,
  spawnInfantrySquad,
  spawnWarriorSquad,
  summarizeGame,
  validateStructurePlacement
} from '../src/game/gameModel.js';
import { createBlankMap } from '../src/world/mapModel.js';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputDir = resolve(projectRoot, 'output/sim-frame-budget-qa');
const reportPath = join(outputDir, 'report.json');
const thresholds = {
  maxAverageFrameMs: numberEnv('FIELD_FRONTS_SIM_FRAME_MAX_AVG_MS', 22),
  maxP95FrameMs: numberEnv('FIELD_FRONTS_SIM_FRAME_MAX_P95_MS', 55),
  maxWorstFrameMs: numberEnv('FIELD_FRONTS_SIM_FRAME_MAX_WORST_MS', 180),
  maxLongFrameRatio: numberEnv('FIELD_FRONTS_SIM_FRAME_MAX_LONG_RATIO', 0.22),
  maxPathOrderP95Ms: numberEnv('FIELD_FRONTS_SIM_PATH_ORDER_MAX_P95_MS', 42),
  maxBlueprintP95Ms: numberEnv('FIELD_FRONTS_SIM_BLUEPRINT_MAX_P95_MS', 52),
  maxHardBlockerChecks: numberEnv('FIELD_FRONTS_SIM_HARD_BLOCKER_MAX_CHECKS', 60000),
  minFrames: numberEnv('FIELD_FRONTS_SIM_FRAME_MIN_SAMPLES', 18)
};

const startedAt = performance.now();
const operationSamples = createOperationBuckets([
  'bootstrap',
  'spawn',
  'pathOrder',
  'blueprintValidate',
  'blueprintPlace',
  'pathBlueprintValidate',
  'pathBlueprintPlace',
  'probe',
  'tick',
  'summary'
]);
const frameSamples = [];
const notes = [];
let lastSummary = null;
let report;

try {
  const { game, map } = measure('bootstrap', () => createScenario());
  const cadenceStart = snapshotRuntimeCadence(game);
  const frameCount = Math.max(thresholds.minFrames, numberEnv('FIELD_FRONTS_SIM_FRAME_COUNT', 18));
  const squadIds = () => (game.squads ?? []).filter((squad) => squad.factionId === 'player').map((squad) => squad.id);

  for (let frame = 0; frame < frameCount; frame += 1) {
    const frameStart = performance.now();
    const phase = frame % 12;

    if (frame === 0 || frame === 12) {
      measure('spawn', () => spawnWarriorSquad(game, map, { factionId: 'player', select: false }));
    }

    if (phase === 0 || phase === 6) {
      const ids = squadIds().slice(0, 8);
      for (let index = 0; index < ids.length; index += 1) {
        const target = deterministicTarget(index + frame, map);
        measure('pathOrder', () => issuePlayerMoveCommand(game, map, ids[index], [
          { x: 5 + (index % 6), y: 5 + Math.floor(index / 6) },
          target
        ]));
      }
    }

    if (phase === 2 || phase === 8) {
      for (const tile of blueprintProbeTiles(frame, map, 6)) {
        measure('blueprintValidate', () => validateStructurePlacement(game, map, {
          type: frame % 4 === 0 ? 'builder_lodge' : 'hunting_tent',
          factionId: 'player',
          tile,
          checkConstructionAccess: true
        }));
      }
    }

    if (phase === 3 || phase === 9) {
      const tile = blueprintProbeTiles(frame + 3, map, 1)[0];
      const result = measure('blueprintPlace', () => placeStructureBuildOrder(game, map, {
        type: frame % 2 === 0 ? 'wood_gathering_post' : 'builder_lodge',
        factionId: 'player',
        tile
      }));
      if (!result?.ok && result?.reason && !notes.includes(result.reason)) {
        notes.push(result.reason);
      }
    }

    if ((phase === 4 || phase === 10) && !notes.includes('path_blueprints_locked_at_tribal_camp')) {
      notes.push('path_blueprints_locked_at_tribal_camp');
    }

    if (phase === 1 || phase === 7) {
      for (const tile of blueprintProbeTiles(frame + 7, map, 4)) {
        measure('probe', () => probeMapAt(game, map, tile));
      }
    }

    if (frame % 6 === 0) {
      measure('tick', () => advanceGameTick(game, map));
    }
    lastSummary = measure('summary', () => summarizeGame(game));

    frameSamples.push(round3(performance.now() - frameStart));
  }

  const metrics = buildMetrics(frameSamples, operationSamples, game, startedAt, cadenceStart, lastSummary);
  const findings = evaluateSimFrameBudget(metrics, thresholds);
  report = {
    status: findings.some((entry) => entry.severity === 'high') ? 'fail' : findings.length ? 'warn' : 'pass',
    generatedAt: new Date().toISOString(),
    testType: 'sim-frame-budget-qa',
    description: 'Sandbox-safe proxy for FPS regressions. Stresses blueprint placement/validation, path-order churn, simulation ticks, and render-summary generation without launching a browser.',
    thresholds,
    metrics,
    notes: notes.slice(0, 12),
    findings
  };
} catch (error) {
  report = {
    status: 'fail',
    generatedAt: new Date().toISOString(),
    testType: 'sim-frame-budget-qa',
    thresholds,
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? null
    },
    findings: [finding('high', 'sim_frame_budget_probe_failed', error?.message ?? String(error), 'Do not validate ChatGPT-generated slices until the sandbox-safe frame-budget probe can run.')]
  };
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
const frame = report.metrics?.frameBudget ?? {};
console.log(`Sim frame-budget QA: ${report.status.toUpperCase()} (${frame.averageFrameMs ?? 0}ms avg, p95 ${frame.p95FrameMs ?? 0}ms, worst ${frame.worstFrameMs ?? 0}ms).`);
console.log(`Report: ${reportPath}`);
if (report.status === 'fail') {
  process.exitCode = 1;
}

function createScenario() {
  const map = createBlankMap({ width: 40, height: 28, fill: 'land' });
  const game = createInitialGameState(map);
  // Keep this QA gate focused on player blueprint/path/order frame budget.
  // Enemy build cadence gets its own director test so it does not add noisy, unrelated construction bursts here.
  game.enemyAI = { ...(game.enemyAI ?? {}), buildCooldownUntil: 99999, nextDecisionTick: 99999 };
  game.performanceBudgets = {
    ...(game.performanceBudgets ?? {}),
    navigationFlowBuildsPerTick: 0
  };
  grantQaSupplies(game, 'player', 20000);
  grantQaSupplies(game, 'enemy', 20000);

  for (let index = 0; index < 8; index += 1) {
    spawnWarriorSquad(game, map, { factionId: 'player', select: false });
  }
  for (let index = 0; index < 4; index += 1) {
    spawnInfantrySquad(game, map, { factionId: 'enemy', select: false });
  }

  placeStructureBuildOrder(game, map, { type: 'hunting_tent', factionId: 'player', tile: { x: 13, y: 9 } });
  placeStructureBuildOrder(game, map, { type: 'wood_gathering_post', factionId: 'player', tile: { x: 10, y: 15 } });
  placeStructureBuildOrder(game, map, { type: 'builder_lodge', factionId: 'player', tile: { x: 16, y: 15 } });
  return { game, map };
}

function grantQaSupplies(game, factionId, amount) {
  const faction = game.economy?.factions?.[factionId];
  if (!faction?.stockpiles) return;
  const resources = ['supplies', 'gold', 'food', 'wood', 'population'];
  for (const resourceId of resources) {
    const stockpile = faction.stockpiles[resourceId];
    if (!stockpile) continue;
    const nextAmount = Math.max(Number(stockpile.amount) || 0, amount);
    stockpile.amount = nextAmount;
    stockpile.components = resourceId === 'supplies'
      ? { provisions: nextAmount / 3, materiel: nextAmount / 3, transit: nextAmount / 3 }
      : { [resourceId]: nextAmount };
  }
  if (faction.storage) {
    faction.storage = {
      ...faction.storage,
      capacity: Math.max(Number(faction.storage.capacity) || 0, amount * 2),
      used: Math.min(Number(faction.storage.used) || 0, amount * 2),
      free: Math.max(0, (amount * 2) - (Number(faction.storage.used) || 0))
    };
  }
}

function deterministicTarget(seed, map) {
  return {
    x: 6 + ((seed * 7) % Math.max(1, map.width - 12)),
    y: 5 + ((seed * 5) % Math.max(1, map.height - 10))
  };
}

function blueprintProbeTiles(seed, map, count) {
  const tiles = [];
  for (let index = 0; index < count; index += 1) {
    tiles.push({
      x: 4 + ((seed * 3 + index * 5) % Math.max(1, map.width - 8)),
      y: 4 + ((seed * 5 + index * 3) % Math.max(1, map.height - 8))
    });
  }
  return tiles;
}


function createOperationBuckets(names) {
  return Object.fromEntries(names.map((name) => [name, []]));
}

function measure(name, fn) {
  const started = performance.now();
  const result = fn();
  operationSamples[name]?.push(round3(performance.now() - started));
  return result;
}

function buildMetrics(frameSamples, operations, game, startedAtMs, cadenceStart = null, latestSummary = null) {
  const frameBudget = summariseSamples(frameSamples, 33.34);
  const cadenceEnd = snapshotRuntimeCadence(game, latestSummary);
  return {
    elapsedMs: round3(performance.now() - startedAtMs),
    frameBudget,
    operations: Object.fromEntries(Object.entries(operations).map(([name, samples]) => [name, summariseSamples(samples, 33.34)])),
    cadence: summarizeCadenceDelta(cadenceStart, cadenceEnd),
    finalState: {
      tick: game.tick,
      squads: game.squads?.length ?? 0,
      structures: game.structures?.length ?? 0,
      constructionJobs: game.constructionJobs?.length ?? 0,
      projectiles: game.projectiles?.length ?? 0,
      collision: game.collisionStats ?? null,
      runtime: cadenceEnd?.runtime ?? latestSummary?.runtime ?? game.runtimeSummary ?? game.runtime ?? null
    }
  };
}


function snapshotRuntimeCadence(game, latestSummary = null) {
  const runtime = latestSummary?.runtime ?? summarizeGame(game).runtime ?? null;
  const scheduler = runtime?.scheduler ?? {};
  return {
    tick: game.tick ?? 0,
    dirty: { ...(runtime?.dirty ?? game.dirty ?? {}) },
    versions: { ...(runtime?.versions ?? game.versions ?? {}) },
    runtime,
    scheduler: Object.fromEntries(Object.entries(scheduler).map(([id, schedule]) => [id, {
      everyTicks: schedule.everyTicks,
      nextTick: schedule.nextTick,
      lastRunTick: schedule.lastRunTick,
      runCount: Math.max(0, Number(schedule.runCount) || 0),
      dirtyKeys: [...(schedule.dirtyKeys ?? [])],
      versionKeys: [...(schedule.versionKeys ?? [])]
    }]))
  };
}

function summarizeCadenceDelta(start = null, end = null) {
  const schedulerIds = new Set([
    ...Object.keys(start?.scheduler ?? {}),
    ...Object.keys(end?.scheduler ?? {})
  ]);
  const schedulerRuns = Object.fromEntries([...schedulerIds].sort().map((id) => {
    const before = start?.scheduler?.[id] ?? {};
    const after = end?.scheduler?.[id] ?? {};
    return [id, {
      everyTicks: after.everyTicks ?? before.everyTicks ?? null,
      startedRunCount: before.runCount ?? 0,
      endedRunCount: after.runCount ?? 0,
      runDelta: Math.max(0, (after.runCount ?? 0) - (before.runCount ?? 0)),
      nextTick: after.nextTick ?? null,
      lastRunTick: after.lastRunTick ?? null,
      dirtyKeys: [...(after.dirtyKeys ?? before.dirtyKeys ?? [])],
      versionKeys: [...(after.versionKeys ?? before.versionKeys ?? [])]
    }];
  }));
  const dirtyEnd = end?.dirty ?? {};
  const stillDirty = Object.entries(dirtyEnd)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key);
  const weather = schedulerRuns.weatherFields ?? null;
  return {
    tickStart: start?.tick ?? null,
    tickEnd: end?.tick ?? null,
    dirtyStart: start?.dirty ?? {},
    dirtyEnd,
    stillDirty,
    schedulerRuns,
    cadenceWarnings: buildCadenceWarnings({ schedulerRuns, stillDirty, ticksElapsed: Math.max(0, (end?.tick ?? 0) - (start?.tick ?? 0)) }),
    weatherCadenceRestored: weather ? weather.runDelta <= Math.max(1, Math.ceil(Math.max(0, (end?.tick ?? 0) - (start?.tick ?? 0)) / Math.max(1, weather.everyTicks ?? 16))) : null
  };
}

function buildCadenceWarnings({ schedulerRuns = {}, stillDirty = [], ticksElapsed = 0 } = {}) {
  const warnings = [];
  const weather = schedulerRuns.weatherFields;
  if (weather && ticksElapsed > 0) {
    const expectedMax = Math.max(1, Math.ceil(ticksElapsed / Math.max(1, weather.everyTicks ?? 16)));
    if (weather.runDelta > expectedMax) {
      warnings.push({
        code: 'weather_fields_over_cadence',
        message: `weatherFields ran ${weather.runDelta} times across ${ticksElapsed} ticks; expected at most ${expectedMax}.`
      });
    }
    if ((weather.dirtyKeys ?? []).includes('fields')) {
      warnings.push({
        code: 'weather_fields_listens_to_generic_fields_dirty',
        message: 'weatherFields still subscribes to generic fields dirtiness, which can force every-tick recompute.'
      });
    }
  }
  if (stillDirty.includes('fields') && schedulerRuns.fieldOverlay?.dirtyKeys?.includes('fields')) {
    warnings.push({
      code: 'field_overlay_generic_fields_dirty_pending',
      message: 'fieldOverlay still listens to generic fields dirtiness; keep it disabled or clear fields ownership before making it active.'
    });
  }
  return warnings;
}

function summariseSamples(samples, longFrameMs = 33.34) {
  const values = [...samples].sort((a, b) => a - b);
  const count = values.length;
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    samples: count,
    averageFrameMs: count ? round3(sum / count) : 0,
    p50FrameMs: percentile(values, 0.5),
    p95FrameMs: percentile(values, 0.95),
    p99FrameMs: percentile(values, 0.99),
    worstFrameMs: count ? round3(values[count - 1]) : 0,
    longFrameRatio: count ? round3(values.filter((value) => value > longFrameMs).length / count) : 0
  };
}

function evaluateSimFrameBudget(metrics, limits) {
  const findings = [];
  const frame = metrics.frameBudget;
  const pathOrder = metrics.operations.pathOrder;
  const blueprintValidate = metrics.operations.blueprintValidate;
  const blueprintPlace = metrics.operations.blueprintPlace;
  const pathBlueprintValidate = metrics.operations.pathBlueprintValidate;
  const pathBlueprintPlace = metrics.operations.pathBlueprintPlace;
  const blueprintP95 = Math.max(
    blueprintValidate?.p95FrameMs ?? 0,
    blueprintPlace?.p95FrameMs ?? 0,
    pathBlueprintValidate?.p95FrameMs ?? 0,
    pathBlueprintPlace?.p95FrameMs ?? 0
  );

  if ((frame.samples ?? 0) < limits.minFrames) {
    findings.push(finding('high', 'sim_frame_probe_too_few_samples', `Only ${frame.samples} frame-proxy samples were captured.`, 'Increase FIELD_FRONTS_SIM_FRAME_COUNT or keep the default sample count.'));
  }
  if ((frame.averageFrameMs ?? 0) > limits.maxAverageFrameMs) {
    findings.push(finding('high', 'sim_average_frame_ms_over_budget', `Average sim frame-proxy cost ${frame.averageFrameMs}ms exceeds ${limits.maxAverageFrameMs}ms.`, 'Profile repeated per-frame work before validating the slice.'));
  }
  if ((frame.p95FrameMs ?? 0) > limits.maxP95FrameMs) {
    findings.push(finding('medium', 'sim_p95_frame_ms_over_budget', `p95 sim frame-proxy cost ${frame.p95FrameMs}ms exceeds ${limits.maxP95FrameMs}ms.`, 'Treat this as a jank warning in the sandbox proxy. Use browser FPS locally for hard pass/fail, and investigate if operation-specific budgets also rise.'));
  }
  if ((frame.worstFrameMs ?? 0) > limits.maxWorstFrameMs) {
    findings.push(finding('medium', 'sim_worst_frame_spike_over_budget', `Worst sim frame-proxy cost ${frame.worstFrameMs}ms exceeds ${limits.maxWorstFrameMs}ms.`, 'Investigate one-off spikes around path blueprint placement or route cache invalidation.'));
  }
  if ((frame.longFrameRatio ?? 0) > limits.maxLongFrameRatio) {
    findings.push(finding('medium', 'sim_long_frame_ratio_over_budget', `Long-frame ratio ${frame.longFrameRatio} exceeds ${limits.maxLongFrameRatio}.`, 'Sandbox tick frames are noisy; keep as warning unless average frame cost, hard blocker checks, path-order, or blueprint budgets also breach.'));
  }
  if ((pathOrder?.p95FrameMs ?? 0) > limits.maxPathOrderP95Ms) {
    findings.push(finding('high', 'sim_path_order_p95_over_budget', `Path-order p95 ${pathOrder.p95FrameMs}ms exceeds ${limits.maxPathOrderP95Ms}ms.`, 'Path order generation needs queueing, sharing, or stricter cache reuse before more unit/path features land.'));
  }
  if (blueprintP95 > limits.maxBlueprintP95Ms) {
    findings.push(finding('high', 'sim_blueprint_p95_over_budget', `Blueprint p95 ${round3(blueprintP95)}ms exceeds ${limits.maxBlueprintP95Ms}ms.`, 'Blueprint validation/placement/access checks need caching or per-frame budgeting before future construction slices.'));
  }
  const hardBlockerChecks = metrics.finalState?.collision?.hardBlockerChecks ?? 0;
  const cadenceWarnings = metrics.cadence?.cadenceWarnings ?? [];
  for (const warning of cadenceWarnings) {
    findings.push(finding(warning.code === 'weather_fields_over_cadence' ? 'high' : 'medium', warning.code, warning.message, 'Restore scheduler dirty/version ownership before accepting new runtime features.'));
  }
  if (hardBlockerChecks > limits.maxHardBlockerChecks) {
    findings.push(finding('high', 'sim_hard_blocker_checks_over_budget', `${hardBlockerChecks} hard blocker checks exceeded the ${limits.maxHardBlockerChecks} sim-frame budget.`, 'Movement/pathfinding/blocker checks are likely the jank source; cache blocker lookups or budget path/construction access checks before adding gameplay slices.'));
  }
  return findings;
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * ratio) - 1));
  return round3(values[index]);
}

function finding(severity, code, message, recommendation) {
  return { severity, code, message, recommendation };
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function round3(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}
