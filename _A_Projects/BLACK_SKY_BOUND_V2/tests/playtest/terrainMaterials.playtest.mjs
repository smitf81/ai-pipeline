import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const label = process.argv[2] ?? 'current';
const artifactRoot = path.join(projectRoot, 'artifacts', 'terrain-material-v1', label);
const viewport = { width: 1440, height: 900 };
const issues = { consoleErrors: [], pageErrors: [], requestFailures: [] };
const lockedBaselineTargets = Object.freeze({
  grass: { x: 40.5, y: 15.5 },
  largeGrass: { x: 40.5, y: 11.5 },
  grassDirt: { x: 34, y: 45.5 },
  scorched: { x: 47, y: 52.5 }
});

await mkdir(artifactRoot, { recursive: true });
const server = await startRuntime();
const browser = await launchBrowser();
const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
const page = await context.newPage();
recordIssues(page);

try {
  const url = `${server.url}?skipHatch=1&mamaAuto=0&renderer=webgl3d&gpuTiming=1&terrainProof=1`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
  await page.waitForFunction(
    () => window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dActive === true,
    null,
    { timeout: 20_000 }
  );
  const targets = await prepareFixture(page);
  assert.ok(targets.grass && targets.grassDirt && targets.scorched, 'required terrain proof targets must exist');

  const captures = {};
  captures.closeGrass = await captureScenario(page, '01-close-grass', targets.grass, 5.1, 'torch-left', false);
  captures.gameplayHeight = await captureScenario(page, '02-gameplay-height', targets.grassDirt, 2.65, 'torch-left', true);
  captures.grassDirtBoundary = await captureScenario(page, '03-grass-dirt-boundary', targets.grassDirt, 4.25, 'torch-left', false);
  captures.scorchedBoundary = await captureScenario(page, '04-scorched-boundary', targets.scorched, 4.25, 'torch-left', false);
  captures.movingLightLeft = await captureScenario(page, '05-light-left', targets.grassDirt, 4.25, 'torch-left', false);
  captures.movingLightRight = await captureScenario(page, '06-light-right', targets.grassDirt, 4.25, 'torch-right', false);
  captures.darkReadability = await captureScenario(page, '07-dark-readability', targets.scorched, 3.2, 'dark', false);
  captures.largeGrass = await captureScenario(page, '08-large-grass-area', targets.largeGrass, 1.35, 'moon', false);
  captures.largeGrassLit = await captureScenario(page, '09-large-grass-area-lit', targets.largeGrass, 1.35, 'torch-left', false);
  captures.lockedBaselineCloseGrass = await captureScenario(page, '10-locked-baseline-close-grass', lockedBaselineTargets.grass, 5.1, 'baseline-torch-left', true);
  captures.lockedBaselineGrassDirt = await captureScenario(page, '11-locked-baseline-grass-dirt', lockedBaselineTargets.grassDirt, 4.25, 'baseline-torch-left', true);
  captures.lockedBaselineScorched = await captureScenario(page, '12-locked-baseline-scorched', lockedBaselineTargets.scorched, 4.25, 'baseline-torch-left', true);
  captures.lockedBaselineLargeGrass = await captureScenario(page, '13-locked-baseline-large-grass', lockedBaselineTargets.largeGrass, 1.35, 'baseline-moon', true);

  await page.evaluate(() => window.BSB_V2_DEMO.renderer.backend.setTerrainProofCanopyVisible(true));
  const performance = {
    detailDisabled: await measurePerformance(page, targets.grassDirt, false),
    detailEnabled: await measurePerformance(page, targets.grassDirt, true),
    lockedBaselineCameraDetailDisabled: await measurePerformance(page, lockedBaselineTargets.grassDirt, false, 'baseline-torch-left'),
    lockedBaselineCameraDetailEnabled: await measurePerformance(page, lockedBaselineTargets.grassDirt, true, 'baseline-torch-left')
  };
  const debug = await captureDebugViews(page, targets.grassDirt);
  assert.equal(performance.detailDisabled.terrain?.status, 'ready', 'terrain materials must report ready with detail disabled');
  assert.equal(performance.detailEnabled.terrain?.status, 'ready', 'terrain materials must report ready with detail enabled');
  assert.equal(performance.detailDisabled.grassDetail?.visibleCount, 0, 'detail toggle must remove all visible grass instances');
  assert.ok(performance.detailEnabled.grassDetail?.visibleCount > 0, 'detail-enabled proof must contain visible grass instances');
  assert.equal(
    performance.detailEnabled.calls - performance.detailDisabled.calls,
    1,
    'grass detail must add exactly one instanced draw call'
  );
  assert.equal(
    performance.detailEnabled.triangles - performance.detailDisabled.triangles,
    performance.detailEnabled.grassDetail.visibleTriangles,
    'grass detail triangle delta must match its diagnostic count'
  );
  assert.equal(
    performance.lockedBaselineCameraDetailEnabled.calls - performance.lockedBaselineCameraDetailDisabled.calls,
    1,
    'the locked baseline camera should also add exactly one grass-detail draw call'
  );
  assert.equal(
    performance.lockedBaselineCameraDetailEnabled.triangles - performance.lockedBaselineCameraDetailDisabled.triangles,
    performance.lockedBaselineCameraDetailEnabled.grassDetail.visibleTriangles,
    'locked baseline camera triangle delta should equal its visible grass detail'
  );
  assert.ok(performance.detailDisabled.renderPathMs.p95 < 16.7, 'detail-disabled render-path p95 must fit a 60 FPS frame');
  assert.ok(performance.detailEnabled.renderPathMs.p95 < 16.7, 'detail-enabled render-path p95 must fit a 60 FPS frame');
  assert.equal(debug.supported, true, 'terrain debug views must be supported');
  assert.equal(debug.detailToggle, true, 'ground detail toggle must be supported');
  assert.deepEqual(issues.consoleErrors, [], 'browser console errors');
  assert.deepEqual(issues.pageErrors, [], 'browser page errors');
  assert.deepEqual(issues.requestFailures, [], 'browser request failures');

  const report = {
    contract: 'black-sky-bound.terrain-material-browser-proof.v1',
    label,
    generatedAt: new Date().toISOString(),
    url,
    viewport,
    deviceScaleFactor: 1,
    targets,
    captures,
    debug,
    performance,
    issues
  };
  const reportPath = path.join(artifactRoot, 'report.json');
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: 'passed', label, reportPath, performance, debug, issues }, null, 2));
} finally {
  await context.close();
  await browser.close();
  server.stop();
}

async function prepareFixture(target) {
  return target.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    app.stop();
    const map = app.state.map;
    const targets = findTerrainTargets(map);
    app.state.game.actors = [];
    app.state.game.effects = [];
    app.state.game.smokeSources = [];
    app.state.game.corpses = [];
    app.state.game.renderLayers.atmosphericOverlay = {
      ...(app.state.game.renderLayers.atmosphericOverlay ?? {}),
      enabled: false,
      rainEnabled: false,
      sparkEnabled: false
    };
    app.worldEvents.setAutoEnabled(false);
    const proofStyle = document.createElement('style');
    proofStyle.id = 'terrain-material-proof-style';
    proofStyle.textContent = '#bsb-three-screen-overlay{display:none!important}';
    document.head.appendChild(proofStyle);
    return targets;

    function findTerrainTargets(sourceMap) {
      const center = { x: sourceMap.width * 0.5, y: sourceMap.height * 0.5 };
      const grass = bestTile('grass', (x, y) => sameNeighbourCount('grass', x, y, 3));
      const largeGrass = bestTile('grass', (x, y) => sameNeighbourCount('grass', x, y, 7));
      const grassDirt = bestBoundary('grass', 'dirt');
      const scorched = bestBoundary('scorched', 'grass') ?? bestBoundary('scorched', 'dirt') ?? bestTile('scorched', () => 1);
      return { grass, largeGrass, grassDirt, scorched };

      function bestTile(type, scoreTile) {
        let best = null;
        for (let y = 1; y < sourceMap.height - 1; y += 1) {
          for (let x = 1; x < sourceMap.width - 1; x += 1) {
            if (sourceMap.tiles[y][x] !== type) continue;
            const clearance = visualClearance(x + 0.5, y + 0.5);
            const score = scoreTile(x, y) + clearance.score - Math.hypot(x - center.x, y - center.y) * 0.018;
            if (!best || score > best.score) best = { x: x + 0.5, y: y + 0.5, score, clearance };
          }
        }
        return best;
      }

      function bestBoundary(a, b) {
        let best = null;
        const directions = [[1, 0], [0, 1], [-1, 0], [0, -1]];
        for (let y = 1; y < sourceMap.height - 1; y += 1) {
          for (let x = 1; x < sourceMap.width - 1; x += 1) {
            if (sourceMap.tiles[y][x] !== a) continue;
            for (const [dx, dy] of directions) {
              if (sourceMap.tiles[y + dy][x + dx] !== b) continue;
              const targetX = x + 0.5 + dx * 0.5;
              const targetY = y + 0.5 + dy * 0.5;
              const clearance = visualClearance(targetX, targetY);
              const score = sameNeighbourCount(a, x, y, 2) + sameNeighbourCount(b, x + dx, y + dy, 2)
                + clearance.score * 5.5 - Math.hypot(targetX - center.x, targetY - center.y) * 0.025;
              if (!best || score > best.score) best = { x: targetX, y: targetY, score, a, b, clearance };
            }
          }
        }
        return best;
      }

      function sameNeighbourCount(type, x, y, radius) {
        let count = 0;
        for (let oy = -radius; oy <= radius; oy += 1) {
          for (let ox = -radius; ox <= radius; ox += 1) {
            if (sourceMap.tiles[y + oy]?.[x + ox] === type) count += 1;
          }
        }
        return count;
      }

      function visualClearance(x, y) {
        const objects = sourceMap.sceneObjects ?? [];
        let nearestCanopy = 99;
        let nearestObject = 99;
        for (const object of objects) {
          const distance = Math.hypot(Number(object.x ?? 0) - x, Number(object.y ?? 0) - y);
          nearestObject = Math.min(nearestObject, distance);
          if (/tree|snag|shrub/.test(String(object.type ?? ''))) nearestCanopy = Math.min(nearestCanopy, distance);
        }
        return {
          nearestCanopy: Math.round(nearestCanopy * 100) / 100,
          nearestObject: Math.round(nearestObject * 100) / 100,
          score: Math.min(6, nearestCanopy) * 2.4 + Math.min(3.5, nearestObject) * 0.7
        };
      }
    }
  });
}

async function captureScenario(target, name, focus, zoom, lighting, canopyVisible) {
  await target.evaluate((visible) => window.BSB_V2_DEMO.renderer.backend.setTerrainProofCanopyVisible(visible), canopyVisible);
  const state = await renderFrames(target, { focus, zoom, lighting, frames: 28, collectTiming: false });
  const screenshot = path.join(artifactRoot, `${name}.png`);
  await target.locator('canvas').first().screenshot({ path: screenshot });
  return { screenshot, camera: state.camera, canopyVisible, diagnostics: compactDiagnostics(state.diagnostics) };
}

async function captureDebugViews(target, focus) {
  const backendMethods = await target.evaluate(() => ({
    materialId: typeof window.BSB_V2_DEMO.renderer.backend.setTerrainDebugMode === 'function',
    detailToggle: typeof window.BSB_V2_DEMO.renderer.backend.setGroundDetailEnabled === 'function'
  }));
  if (!backendMethods.materialId) return { supported: false, captures: [] };
  await target.evaluate(() => window.BSB_V2_DEMO.renderer.backend.setTerrainProofCanopyVisible(false));
  const captures = [];
  for (const mode of ['material-id', 'normal-only']) {
    await target.evaluate((value) => window.BSB_V2_DEMO.renderer.backend.setTerrainDebugMode(value), mode);
    await renderFrames(target, { focus, zoom: 4.25, lighting: 'torch-left', frames: 18, collectTiming: false });
    const screenshot = path.join(artifactRoot, `debug-${mode}.png`);
    await target.locator('canvas').first().screenshot({ path: screenshot });
    captures.push({ mode, screenshot });
  }
  await target.evaluate(() => window.BSB_V2_DEMO.renderer.backend.setTerrainDebugMode('lit'));
  await target.keyboard.press('F3');
  await renderFrames(target, { focus, zoom: 3.2, lighting: 'torch-left', frames: 18, collectTiming: false });
  const boundsScreenshot = path.join(artifactRoot, 'debug-grass-instancing-bounds-count.png');
  await target.screenshot({ path: boundsScreenshot, fullPage: true });
  const overlayText = await target.locator('#bsb-three-diagnostics').textContent();
  await target.keyboard.press('F3');
  return { supported: true, detailToggle: backendMethods.detailToggle, captures, boundsScreenshot, overlayText };
}

async function measurePerformance(target, focus, detailEnabled, lighting = 'torch-left') {
  const canToggle = await target.evaluate(() => typeof window.BSB_V2_DEMO.renderer.backend.setGroundDetailEnabled === 'function');
  if (canToggle) await target.evaluate((enabled) => window.BSB_V2_DEMO.renderer.backend.setGroundDetailEnabled(enabled), detailEnabled);
  const sample = await renderFrames(target, { focus, zoom: 2.65, lighting, frames: 180, collectTiming: true });
  return {
    requestedDetailEnabled: detailEnabled,
    detailToggleSupported: canToggle,
    renderPathMs: summarize(sample.samples),
    frameIntervalMs: summarize(sample.frameIntervals),
    gpuFrameMs: summarize(sample.gpuSamples),
    calls: sample.diagnostics.calls,
    triangles: sample.diagnostics.triangles,
    lifetimeGpuP95Ms: sample.diagnostics.gpuP95Ms,
    gpuTiming: sample.diagnostics.gpuTiming,
    terrain: sample.diagnostics.liveWorld?.terrain ?? null,
    grassDetail: sample.diagnostics.liveWorld?.grassDetail ?? null,
    resources: sample.diagnostics.resources
  };
}

function renderFrames(target, options) {
  return target.evaluate(async ({ focus, zoom, lighting, frames, collectTiming }) => {
    const app = window.BSB_V2_DEMO;
    const tileSize = 32;
    app.state.camera.x = focus.x * tileSize;
    app.state.camera.y = focus.y * tileSize;
    app.state.camera.zoom = zoom;
    app.state.game.renderTime = 12.25;
    app.state.time = 12.25;
    app.state.game.lights = buildLighting(focus, lighting);
    const samples = [];
    const frameIntervals = [];
    const gpuSamples = [];
    let previousFrameStart = null;
    for (let frame = 0; frame < frames; frame += 1) {
      const start = performance.now();
      if (collectTiming && frame >= 60 && previousFrameStart != null) frameIntervals.push(start - previousFrameStart);
      previousFrameStart = start;
      app.renderer.render(app.state);
      const elapsed = performance.now() - start;
      if (collectTiming && frame >= 60) {
        samples.push(elapsed);
        const gpuFrameMs = app.state.game.renderLayers.renderer.webgl3dDiagnostics?.gpuTiming?.frameMs;
        if (Number.isFinite(gpuFrameMs) && gpuFrameMs > 0) gpuSamples.push(gpuFrameMs);
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    const diagnostics = structuredClone(app.state.game.renderLayers.renderer.webgl3dDiagnostics);
    return {
      camera: { x: app.state.camera.x, y: app.state.camera.y, zoom: app.state.camera.zoom },
      samples,
      frameIntervals,
      gpuSamples,
      diagnostics
    };

    function buildLighting(point, mode) {
      const baseline = mode.startsWith('baseline-');
      const resolvedMode = baseline ? mode.slice('baseline-'.length) : mode;
      const moonStrength = baseline ? 0.48 : resolvedMode === 'dark' ? 0.24 : resolvedMode === 'moon' ? 0.95 : 0.62;
      const result = [{
        id: 'terrain-proof:moon', enabled: true, x: point.x, y: point.y, radius: 80,
        intensity: moonStrength, revealRadius: 80, revealStrength: moonStrength,
        glowRadius: 80, glowStrength: moonStrength, coreRadius: 1, coreStrength: moonStrength,
        colour: 'rgba(130,157,190,1)', sourceKind: 'moonlight', direction: { x: -0.62, y: -0.78 },
        sceneLight: true, castsShadows: true
      }];
      if (resolvedMode === 'moon' && !baseline) {
        for (const offsetY of [-6, 0, 6]) {
          for (const offsetX of [-6, 0, 6]) {
            result.push({
              id: `terrain-proof:area:${offsetX}:${offsetY}`, enabled: true,
              x: point.x + offsetX, y: point.y + offsetY, radius: 7.5,
              intensity: 0.16, revealRadius: 7.5, revealStrength: 0.16,
              glowRadius: 7.5, glowStrength: 0.16, coreRadius: 0.5, coreStrength: 0.2,
              colour: 'rgba(151,170,157,1)', sourceKind: 'terrain_proof_area_torch',
              sourceAnchor: { type: 'terrain_proof' }, castsShadows: false
            });
          }
        }
        return result;
      }
      if (resolvedMode === 'moon') return result;
      const side = resolvedMode === 'torch-right' ? 1 : -1;
      const dark = resolvedMode === 'dark';
      const localIntensity = baseline ? 0.72 : dark ? 0.22 : 0.64;
      result.push({
        id: `terrain-proof:${mode}`, enabled: true, x: point.x + side * 2.1, y: point.y - 1.4,
        radius: dark ? 4.8 : 5.8, intensity: localIntensity, revealRadius: dark ? 5.6 : 7.2, revealStrength: baseline ? 0.7 : dark ? 0.2 : 0.62,
        glowRadius: dark ? 4.8 : 5.8, glowStrength: localIntensity, coreRadius: 0.38, coreStrength: baseline ? 0.9 : dark ? 0.28 : 0.82,
        colour: baseline ? 'rgba(255,171,103,1)' : 'rgba(243,182,121,1)', innerColour: 'rgba(255,226,167,1)', sourceKind: 'torch',
        sourceAnchor: { type: 'terrain_proof' }, shadowPriority: 200, castsShadows: true
      });
      return result;
    }
  }, options);
}

function compactDiagnostics(diagnostics) {
  return {
    calls: diagnostics.calls,
    triangles: diagnostics.triangles,
    cpuP95Ms: diagnostics.cpuP95Ms,
    gpuP95Ms: diagnostics.gpuP95Ms,
    liveWorld: diagnostics.liveWorld,
    resources: diagnostics.resources
  };
}

function summarize(values) {
  if (!values.length) return { samples: 0, mean: 0, median: 0, p95: 0, max: 0, fpsFromMean: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const middle = Math.floor(sorted.length * 0.5);
  return {
    samples: sorted.length,
    mean: round(mean),
    median: round(sorted[middle]),
    p95: round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]),
    max: round(sorted.at(-1)),
    fpsFromMean: round(1000 / Math.max(0.001, mean))
  };
}

function recordIssues(target) {
  target.on('console', (message) => { if (message.type() === 'error') issues.consoleErrors.push(message.text()); });
  target.on('pageerror', (error) => issues.pageErrors.push(error.message));
  target.on('requestfailed', (request) => issues.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));
}

async function startRuntime() {
  const port = await freePort();
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

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const address = server.address(); server.close(() => resolve(address.port)); });
  });
}

async function launchBrowser() {
  try { return await chromium.launch({ channel: process.env.BSB_PLAYWRIGHT_CHANNEL || 'msedge', headless: true }); }
  catch { return chromium.launch({ headless: true }); }
}

function round(value) { return Math.round(Number(value || 0) * 1000) / 1000; }
