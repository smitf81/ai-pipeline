import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const outputDir = path.resolve(process.argv[2] ?? path.join(projectRoot, 'artifacts', 'illumination-performance-v1'));
const label = process.argv[3] ?? 'current';
const captureDir = path.join(outputDir, label);
const scenarios = ['composite_only', 'visible_lights', 'shadow_stress', 'offscreen_stress', 'atmosphere_stress'];
const browserIssues = { consoleErrors: [], consoleWarnings: [], pageErrors: [], requestFailures: [] };

await mkdir(captureDir, { recursive: true });
const runtime = await startRuntime();
let browser;

try {
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  recordBrowserIssues(page);
  await page.goto(`${runtime.url}?skipHatch=1&mamaAuto=0&gpuTiming=1&proof=illumination-performance-v1`, { waitUntil: 'networkidle', timeout: 20_000 });
  await page.waitForFunction(() => window.BSB_V2_DEMO && window.render_game_to_text, null, { timeout: 15_000 });
  const results = {};
  for (const scenario of scenarios) {
    results[scenario] = await runScenario(page, scenario);
    const screenshot = path.join(captureDir, `${scenario}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    results[scenario].screenshot = screenshot;
  }
  const evidence = {
    label,
    generatedAt: new Date().toISOString(),
    url: runtime.url,
    viewport: page.viewportSize(),
    renderer: 'webgl',
    timingPolicy: 'cpu_performance_now_plus_ext_disjoint_timer_query_webgl2',
    results,
    browserIssues
  };
  const evidenceFile = path.join(captureDir, 'evidence.json');
  await writeFile(evidenceFile, `${JSON.stringify(evidence, null, 2)}\n`);
  assert.equal(results.composite_only.gpuTimingSupported, true, 'performance proof requires real WebGL GPU timer queries');
  assert.ok(results.offscreen_stress.counts.inputLights > results.offscreen_stress.counts.viewportIntersectingLightRegions, 'offscreen scenario must contain culling candidates');
  assert.equal(results.offscreen_stress.counts.projectedLights, 8, 'off-screen lights must be culled before renderer projection');
  assert.ok(results.shadow_stress.counts.shadowFieldPackets > 0, 'shadow scenario must exercise geometric shadow work');
  assert.ok(results.shadow_stress.counts.shadowCastingLights <= 4, 'shadow-casting light cap must stay active');
  assert.ok(results.shadow_stress.counts.shadowRegions <= 32, 'shadow light/blocker product must stay bounded');
  assert.equal(results.shadow_stress.runtime.shadowGeometryCacheHit, true, 'stable static shadow geometry must be reused');
  assert.ok(results.visible_lights.runtime.staticLightCacheHits > 0, 'nearby static light influences must be reused');
  assert.ok(results.atmosphere_stress.counts.smokeSources > 0 && results.atmosphere_stress.counts.rainStreaks > 0, 'atmosphere scenario must exercise smoke and rain overdraw');
  assert.deepEqual(browserIssues.consoleErrors, [], 'browser console errors');
  assert.deepEqual(browserIssues.pageErrors, [], 'browser page errors');
  assert.deepEqual(browserIssues.requestFailures, [], 'browser request failures');
  console.log(JSON.stringify({ status: 'passed', label, evidenceFile, summaries: compactSummaries(results), browserIssues }, null, 2));
} finally {
  await browser?.close();
  runtime.stop();
}

async function runScenario(page, scenario) {
  return page.evaluate(async ({ scenarioName, warmupFrames, measuredFrames }) => {
    const app = window.BSB_V2_DEMO;
    app.stop?.();
    const { CONFIG } = await import('./src/config.js');
    const { syncGameViews } = await import('./src/game/selectors.js');
    const { buildRenderProjection } = await import('./src/projection/renderProjection.js');
    const game = app.state.game;
    const target = selectTarget(game);
    syncGameViews(game);
    game.actors = game.actors.filter((actor) => actor.team === 'player').slice(0, 1);
    const visibleLights = buildLights(target, 8, false);
    const offscreenLights = buildLights(target, 24, true);
    game.lights = scenarioName === 'composite_only' ? []
      : scenarioName === 'visible_lights' || scenarioName === 'shadow_stress' ? visibleLights
        : [...visibleLights, ...offscreenLights];
    game.occlusionBlockers = scenarioName === 'shadow_stress' || scenarioName === 'offscreen_stress' || scenarioName === 'atmosphere_stress'
      ? buildBlockers(target, 96)
      : [];
    game.smokeSources = scenarioName === 'atmosphere_stress' ? buildSmoke(target, 32) : [];
    game.renderLayers.atmosphericOverlay = {
      ...(game.renderLayers.atmosphericOverlay ?? {}),
      enabled: scenarioName === 'atmosphere_stress',
      rainEnabled: true,
      sparkEnabled: true
    };
    app.state.paused = false;
    app.state.camera.x = target.x * CONFIG.tileSize;
    app.state.camera.y = target.y * CONFIG.tileSize;
    app.state.camera.zoom = 2.65;

    const cpuProjection = [];
    const cpuBackend = [];
    const cpuByLayer = {};
    const gpuByLayer = {};
    const gpuFramesByLayer = {};
    let finalProjection = null;
    for (let frame = 0; frame < warmupFrames + measuredFrames; frame += 1) {
      const time = 8.25 + frame / 60;
      app.state.time = time;
      game.renderTime = time;
      for (const light of game.lights) light.renderTime = time;
      const projectionStart = performance.now();
      const projection = buildRenderProjection(app.state, CONFIG);
      const projectionMs = performance.now() - projectionStart;
      const backendStart = performance.now();
      app.renderer.backend.beginFrame(app.state.camera);
      app.renderer.backend.renderProjection(projection);
      app.renderer.backend.present();
      app.renderer.backend.recordDiagnostics(game.renderLayers.renderer);
      const backendMs = performance.now() - backendStart;
      finalProjection = projection;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (frame < warmupFrames) continue;
      cpuProjection.push(projectionMs);
      cpuBackend.push(backendMs);
      const layers = game.renderLayers.renderer.layerStats ?? {};
      for (const [layerId, stats] of Object.entries(layers)) {
        (cpuByLayer[layerId] ??= []).push((stats.updateMs ?? 0) + (stats.renderMs ?? 0));
        const sampleFrame = stats.gpuSampleFrame ?? -1;
        if ((stats.gpuRenderMs ?? 0) <= 0 || sampleFrame < 0) continue;
        const seen = (gpuFramesByLayer[layerId] ??= new Set());
        if (seen.has(sampleFrame)) continue;
        seen.add(sampleFrame);
        (gpuByLayer[layerId] ??= []).push(stats.gpuRenderMs);
      }
    }
    const layerStats = game.renderLayers.renderer.layerStats ?? {};
    const gpuLayersMs = summarizeLayers(gpuByLayer);
    return {
      scenario: scenarioName,
      gpuTimingSupported: !!layerStats.lighting?.gpuTimingSupported,
      gpuTimingMode: layerStats.lighting?.gpuTimingMode ?? null,
      measuredFrames,
      cpuMs: {
        projection: summarize(cpuProjection),
        backend: summarize(cpuBackend),
        total: summarize(cpuProjection.map((value, index) => value + cpuBackend[index]))
      },
      cpuLayersMs: summarizeLayers(cpuByLayer),
      gpuLayersMs,
      gpuTotalMedianMs: round(Object.values(gpuByLayer).reduce((sum, values) => sum + median(values), 0)),
      gpuSteadyLayersMedianMs: round(Object.values(gpuByLayer).filter((values) => values.length >= measuredFrames * 0.5).reduce((sum, values) => sum + median(values), 0)),
      counts: {
        inputLights: game.lights.length,
        projectedLights: finalProjection?.lights?.length ?? 0,
        visibleLightCandidates: finalProjection?.lightSpaceCulling?.activeLightCount ?? 0,
        viewportIntersectingLightRegions: finalProjection?.lightSpaceCulling?.rawRegionCount ?? 0,
        dormantLights: finalProjection?.illuminationSelection?.dormantCount ?? 0,
        nearbyStaticLights: finalProjection?.illuminationSelection?.nearbyStaticCount ?? 0,
        activeDynamicLights: finalProjection?.illuminationSelection?.activeDynamicCount ?? 0,
        criticalLights: finalProjection?.illuminationSelection?.criticalCount ?? 0,
        shadowCastingLights: finalProjection?.occlusionShadows?.shadowCastingLights ?? 0,
        shadowCandidateLights: finalProjection?.occlusionShadows?.shadowCandidateLights ?? 0,
        shadowBudgetDroppedLights: finalProjection?.occlusionShadows?.shadowBudgetDroppedLights ?? 0,
        activeBlockers: finalProjection?.occlusionShadows?.activeBlockers ?? 0,
        shadowRegions: finalProjection?.occlusionShadows?.shadowRegions?.length ?? 0,
        shadowFieldPackets: finalProjection?.occlusionShadows?.shadowFieldPacketCount ?? 0,
        skippedByBlockerLightLimit: finalProjection?.occlusionShadows?.skippedByBlockerLightLimit ?? 0,
        staticBlockerCacheHits: finalProjection?.occlusionShadows?.staticBlockerCacheHits ?? 0,
        illuminationInfluences: layerStats.lighting?.influenceCount ?? 0,
        smokeSources: finalProjection?.fogSmoke?.length ?? 0,
        smokePrimitives: layerStats.fogSmoke?.primitiveCount ?? 0,
        rainStreaks: layerStats.atmosphere?.rainStreakCount ?? 0
      },
      runtime: {
        layerOrder: game.renderLayers.renderer.webglLayerOrder,
        compositeMode: layerStats.lighting?.illuminationCompositeMode ?? null,
        overlayCount: layerStats.lighting?.overlayCount ?? null,
        shadowGeometryCacheHit: !!layerStats.shadows?.shadowGeometryCacheHit,
        shadowGeometryCacheRebuilds: layerStats.shadows?.shadowGeometryCacheRebuilds ?? 0,
        staticShadowPacketCount: layerStats.shadows?.staticShadowPacketCount ?? 0,
        dynamicShadowPacketCount: layerStats.shadows?.dynamicShadowPacketCount ?? 0,
        staticLightCacheHits: layerStats.lighting?.staticLightCacheHits ?? 0,
        staticLightCacheMisses: layerStats.lighting?.staticLightCacheMisses ?? 0
      }
    };

    function selectTarget(sourceGame) {
      const object = sourceGame.sceneObjects.find((item) => item.id === 'tree:torch-edge')
        ?? sourceGame.sceneObjects.find((item) => item.type === 'tree')
        ?? sourceGame.sceneObjects[0];
      return { x: Number.isFinite(object?.visualX) ? object.visualX : (object?.x ?? 12), y: Number.isFinite(object?.visualY) ? object.visualY : (object?.y ?? 13) };
    }

    function buildLights(center, count, offscreen) {
      return Array.from({ length: count }, (_, index) => {
        const angle = index / count * Math.PI * 2;
        const distance = offscreen ? 34 + (index % 4) * 4 : 1.8 + (index % 3) * 1.25;
        return {
          id: `perf:${offscreen ? 'offscreen' : 'visible'}:${index}`,
          enabled: true,
          x: center.x + Math.cos(angle) * distance,
          y: center.y + Math.sin(angle) * distance,
          radius: 3.2,
          intensity: 0.58,
          revealRadius: 7.2,
          revealStrength: 0.7,
          glowRadius: 3.2,
          glowStrength: 0.46,
          coreRadius: 0.36,
          coreStrength: 0.66,
          softness: 0.7,
          colour: 'rgba(255,154,72,1)',
          innerColour: 'rgba(255,223,156,1)',
          flickerAmount: index % 2 ? 0.12 : 0,
          flickerSpeed: 7,
          flickerPhase: index * 0.71,
          shadowPriority: offscreen ? 1 : 20 - index,
          sourceKind: 'torch',
          sourceAnchor: { type: 'performance_fixture', id: index }
        };
      });
    }

    function buildBlockers(center, count) {
      return Array.from({ length: count }, (_, index) => {
        const ring = 1 + Math.floor(index / 16);
        const angle = index % 16 / 16 * Math.PI * 2 + ring * 0.17;
        return {
          id: `perf:blocker:${index}`,
          x: center.x + Math.cos(angle) * (0.9 + ring * 0.58),
          y: center.y + Math.sin(angle) * (0.9 + ring * 0.58),
          radius: 0.18 + (index % 4) * 0.035,
          height: 0.55 + (index % 3) * 0.14,
          castsShadow: true,
          static: true,
          blockerKind: 'performance_fixture'
        };
      });
    }

    function buildSmoke(center, count) {
      return Array.from({ length: count }, (_, index) => {
        const angle = index / count * Math.PI * 2;
        const distance = 0.5 + (index % 8) * 0.48;
        return {
          id: `perf:smoke:${index}`,
          sourceId: `perf:smoke:${index}`,
          sourceKind: 'dragon_smoke',
          x: center.x + Math.cos(angle) * distance,
          y: center.y + Math.sin(angle) * distance,
          radius: 1.2 + (index % 4) * 0.34,
          density: 0.65,
          opacity: 0.58,
          age: 0.4,
          lifetime: 5,
          softness: 0.9,
          renderPriority: 12
        };
      });
    }

    function summarizeLayers(input) {
      return Object.fromEntries(Object.entries(input).map(([key, values]) => [key, summarize(values)]));
    }

    function summarize(values) {
      if (!values?.length) return { samples: 0, mean: 0, median: 0, p95: 0, max: 0 };
      const sorted = [...values].sort((a, b) => a - b);
      return {
        samples: sorted.length,
        mean: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
        median: round(median(sorted)),
        p95: round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]),
        max: round(sorted.at(-1))
      };
    }

    function median(values) {
      if (!values?.length) return 0;
      const sorted = [...values].sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) * 0.5;
    }

    function round(value) { return Math.round(value * 1000) / 1000; }
  }, { scenarioName: scenario, warmupFrames: 45, measuredFrames: 120 });
}

function compactSummaries(results) {
  return Object.fromEntries(Object.entries(results).map(([scenario, result]) => [scenario, {
    cpuMedianMs: result.cpuMs.total.median,
    gpuSteadyMedianMs: result.gpuSteadyLayersMedianMs,
    projectedLights: result.counts.projectedLights,
    shadowFields: result.counts.shadowFieldPackets,
    smokePrimitives: result.counts.smokePrimitives,
    rainStreaks: result.counts.rainStreaks
  }]));
}

function recordBrowserIssues(page) {
  page.on('console', (message) => {
    if (message.type() === 'error') browserIssues.consoleErrors.push(message.text());
    if (message.type() === 'warning' && !message.text().includes('GL Driver Message')) browserIssues.consoleWarnings.push(message.text());
  });
  page.on('pageerror', (error) => browserIssues.pageErrors.push(error.message));
  page.on('requestfailed', (request) => browserIssues.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));
}

async function startRuntime() {
  const port = await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const address = server.address(); server.close(() => resolve(address.port)); });
  });
  const child = spawn(process.execPath, ['tools/launch.mjs', String(port)], {
    cwd: projectRoot,
    env: { ...process.env, BSB_NO_OPEN: '1', BSB_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const url = `http://127.0.0.1:${port}/`;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server_exited:${child.exitCode}:${output}`);
    try { const response = await fetch(url); if (response.ok) return { url, stop: () => child.kill() }; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error(`server_timeout:${output}`);
}

async function launchBrowser() {
  try { return await chromium.launch({ channel: process.env.BSB_PLAYWRIGHT_CHANNEL || 'msedge', headless: true }); }
  catch { return chromium.launch({ headless: true }); }
}
