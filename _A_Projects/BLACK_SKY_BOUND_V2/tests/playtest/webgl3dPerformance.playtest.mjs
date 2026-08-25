import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RENDER_BUDGETS } from '../../src/data/renderBudgets.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const embodiment = 'surface-v2-production';
const expectedContract = 'black-sky-bound.procedural-wyvern-mesh-recipe.v2';
const query = '';
const artifacts = path.join(root, 'artifacts', `webgl3d-performance-${embodiment}`);
const machineDpr = Math.max(1, Number(process.env.BSB_MACHINE_DPR ?? 1.5));
const requestedProfile = process.env.BSB_PERF_PROFILE ?? null;
const profiles = [{ id: 'locked-1x', dpr: 1 }, { id: 'machine-dpr', dpr: machineDpr }]
  .filter((profile) => !requestedProfile || profile.id === requestedProfile);
if (!profiles.length) throw new Error(`performance_profile_unknown:${requestedProfile}`);
await mkdir(artifacts, { recursive: true });
const runtime = await startRuntime();
const browser = await launchBrowser();
const results = [];

try {
  for (const profile of profiles) results.push(await runProfile(browser, runtime.url, profile));
  const report = {
    contract: 'black-sky-bound.webgl3d-full-frame-performance-proof.v2',
    generatedAt: new Date().toISOString(),
    viewport: { width: 1440, height: 900 },
    machineDprSource: process.env.BSB_MACHINE_DPR ? 'environment' : 'windows_applied_dpi_144_default',
    embodiment,
    rendererContract: expectedContract,
    results
  };
  const reportFile = path.join(artifacts, 'report.json');
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: 'passed', reportFile, results: results.map(compact) }, null, 2));
} finally {
  await browser.close();
  runtime.stop();
}

async function runProfile(browser, baseUrl, profile) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: profile.dpr });
  const page = await context.newPage();
  const issues = { consoleErrors: [], pageErrors: [], requestFailures: [] };
  page.on('console', (message) => { if (message.type() === 'error') issues.consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => issues.pageErrors.push(error.message));
  page.on('requestfailed', (request) => issues.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));
  try {
    await page.goto(`${baseUrl}?skipHatch=1&mamaAuto=0&renderer=webgl3d&gpuTiming=1${query}`, { waitUntil: 'networkidle', timeout: 20_000 });
    await page.waitForFunction(() => window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dDiagnostics?.frameTiming?.warmedUp === true, null, { timeout: 15_000 });
    await page.waitForFunction((contract) => window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dDiagnostics?.liveWorld?.actors?.wyvernContract === contract, expectedContract);
    await page.evaluate(() => {
      const app = window.BSB_V2_DEMO;
      app.worldEvents.setAutoEnabled(false);
      app.worldEvents.inferno({ lightningSync: true });
      app.state.game.unitSpawners = [];
      app.state.game.unitSpawnerFixtures = [];
      app.state.game.renderLayers.atmosphericOverlay = {
        ...(app.state.game.renderLayers.atmosphericOverlay ?? {}),
        enabled: true, rainEnabled: true, rainDensity: 1, overlayOpacity: 0.9,
        emitterReactiveOverlayEnabled: true
      };
    });
    await page.waitForTimeout(5200);
    const baseline = await snapshot(page);
    await page.evaluate(() => {
      window.__bsbPerformanceSamples = [];
      window.__bsbPerformanceTimer = setInterval(() => {
        const diagnostics = window.BSB_V2_DEMO.state.game.renderLayers.renderer.webgl3dDiagnostics;
        window.__bsbPerformanceSamples.push({
          timing: structuredClone(diagnostics.frameTiming),
          projection: structuredClone(diagnostics.projection),
          effects: structuredClone(diagnostics.liveWorld.effects),
          resources: structuredClone(diagnostics.resources),
          sceneWarmup: structuredClone(diagnostics.sceneWarmup),
          gpu: structuredClone(diagnostics.gpuTiming),
          calls: diagnostics.calls,
          triangles: diagnostics.triangles
        });
      }, 1000);
    });
    await page.waitForTimeout(10_200);
    const samples = await page.evaluate(() => {
      clearInterval(window.__bsbPerformanceTimer);
      return window.__bsbPerformanceSamples;
    });
    const final = await snapshot(page);
    const renderSurface = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      return { width: canvas.width, height: canvas.height, clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight, dpr: devicePixelRatio };
    });
    const screenshot = path.join(artifacts, `${profile.id}.png`);
    await page.screenshot({ path: screenshot });
    const sampledResult = { ...profile, actualDevicePixelRatio: await page.evaluate(() => devicePixelRatio), renderSurface, baseline, final, samples, screenshot, issues };
    await writeFile(path.join(artifacts, `${profile.id}-sample.json`), `${JSON.stringify({
      contract: 'black-sky-bound.webgl3d-full-frame-performance-sample.v1',
      status: final.timing.p95.renderPathMs < 16.7 && final.timing.p95.frameIntervalMs <= 17.2 && (!final.gpu.supported || final.timing.p95.gpuMs < 16.7) ? 'passed' : 'failed',
      embodiment,
      rendererContract: expectedContract,
      result: sampledResult
    }, null, 2)}\n`, 'utf8');

    assert.equal(final.projection.legacy2DProjectionActive, false, `${profile.id}: legacy 2D projection must remain retired`);
    assert.equal(final.actors.wyvernContract, expectedContract, `${profile.id}: requested wyvern embodiment contract must remain live`);
    assert.ok(final.timing.p95.renderPathMs < 16.7, `${profile.id}: full CPU render-path p95 ${final.timing.p95.renderPathMs}ms exceeds 16.7ms`);
    assert.ok(final.timing.p95.frameIntervalMs <= 17.2, `${profile.id}: frame-interval p95 ${final.timing.p95.frameIntervalMs}ms misses stable 60 FPS:${JSON.stringify({ timing: final.timing.p95, gpu: final.gpu, calls: final.calls, triangles: final.triangles, effects: final.effects })}`);
    assert.ok(final.timing.p95.projectionMs < 3, `${profile.id}: projection p95 ${final.timing.p95.projectionMs}ms exceeds 3ms`);
    if (final.gpu.supported) assert.ok(final.timing.p95.gpuMs < 16.7, `${profile.id}: GPU p95 ${final.timing.p95.gpuMs}ms exceeds 16.7ms`);
    assert.equal(final.timing.longFrameCount, baseline.timing.longFrameCount, `${profile.id}: post-ready frame exceeded 50ms: ${JSON.stringify(final.timing.longFrames)}`);
    assertStableTail(samples.map((sample) => sample.effects.allocations), `${profile.id}: effect pool allocations grew after warm-up`);
    for (const key of ['geometries', 'textures', 'meshes', 'materials', 'domNodes']) {
      assertNoTailGrowth(samples.map((sample) => sample.resources[key]), `${profile.id}: ${key} exceeded its warmed bound`);
    }
    assert.ok(final.effects.reuses > 0, `${profile.id}: pooled effects reported no reuse`);
    assert.equal(final.lights.physicalLocalCapacity, RENDER_BUDGETS.lightEmitters.threeShaderSlotCapacity, `${profile.id}: unexpected physical light shader capacity`);
    assert.equal(final.lights.droppedLocalCount, 0, `${profile.id}: stress scene exceeded the content-complete physical light capacity`);
    assert.equal(final.lights.qualityState, 'native_full', `${profile.id}: physical lighting entered a degraded state`);
    assert.equal(renderSurface.width, Math.round(renderSurface.clientWidth * renderSurface.dpr), `${profile.id}: canvas width must remain native DPR`);
    assert.equal(renderSurface.height, Math.round(renderSurface.clientHeight * renderSurface.dpr), `${profile.id}: canvas height must remain native DPR`);
    assert.ok(final.sceneWarmup.count >= 1 && final.sceneWarmup.pending === false, `${profile.id}: scene shader warm-up did not complete`);
    assert.deepEqual(issues.consoleErrors, [], `${profile.id}: console errors`);
    assert.deepEqual(issues.pageErrors, [], `${profile.id}: page errors`);
    assert.deepEqual(issues.requestFailures, [], `${profile.id}: request failures`);
    return sampledResult;
  } finally {
    await context.close();
  }
}

function snapshot(page) {
  return page.evaluate(() => {
    const diagnostics = window.BSB_V2_DEMO.state.game.renderLayers.renderer.webgl3dDiagnostics;
    return {
      timing: diagnostics.frameTiming,
      projection: diagnostics.projection,
      effects: diagnostics.liveWorld.effects,
      resources: diagnostics.resources,
      lights: diagnostics.liveWorld.lights,
      sceneWarmup: diagnostics.sceneWarmup,
      gpu: diagnostics.gpuTiming,
      calls: diagnostics.calls,
      triangles: diagnostics.triangles,
      shadows: diagnostics.liveWorld.lights.shadowOwners,
      dynamicCounts: diagnostics.projection.dynamicCounts,
      actors: diagnostics.liveWorld.actors
    };
  });
}

function assertStableTail(values, message) {
  const tail = values.slice(-4);
  assert.ok(tail.length === 4 && tail.every((value) => value === tail[0]), `${message}: ${tail.join(',')}`);
}

function assertNoTailGrowth(values, message) {
  const tail = values.slice(-4);
  assert.ok(tail.length === 4 && Math.max(...tail) <= tail[0], `${message}: ${tail.join(',')}`);
}

function compact(result) {
  return {
    id: result.id,
    dpr: result.actualDevicePixelRatio,
    p95: result.final.timing.p95,
    longFrames: result.final.timing.longFrameCount - result.baseline.timing.longFrameCount,
    resources: result.final.resources,
    effects: result.final.effects,
    calls: result.final.calls,
    triangles: result.final.triangles,
    screenshot: result.screenshot
  };
}

async function startRuntime() {
  const port = await freePort();
  const child = spawn(process.execPath, ['tools/launch.mjs', String(port)], { cwd: root, env: { ...process.env, BSB_NO_OPEN: '1', BSB_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
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
