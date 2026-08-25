import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifacts = path.join(root, 'artifacts', 'webgl3d-wyvern-surface-v2-performance');
const machineDpr = Math.max(1, Number(process.env.BSB_MACHINE_DPR ?? 1.5));
await mkdir(artifacts, { recursive: true });
const runtime = await startRuntime();
const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: machineDpr });
const page = await context.newPage();
const issues = { consoleErrors: [], pageErrors: [], requestFailures: [] };
page.on('console', (message) => { if (message.type() === 'error') issues.consoleErrors.push(message.text()); });
page.on('pageerror', (error) => issues.pageErrors.push(error.message));
page.on('requestfailed', (request) => issues.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));

try {
  await page.goto(`${runtime.url}?skipHatch=1&mamaAuto=0&renderer=webgl3d&gpuTiming=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dDiagnostics?.liveWorld?.actors?.wyvernContract === 'black-sky-bound.procedural-wyvern-mesh-recipe.v2');
  await page.evaluate(async () => {
    const app = window.BSB_V2_DEMO;
    const [{ syncGameViews }, { ComponentType }] = await Promise.all([
      import('/src/game/selectors.js'), import('/src/constants/componentTypes.js')
    ]);
    app.worldEvents.setAutoEnabled(false);
    app.state.game.unitSpawners = [];
    app.state.game.unitSpawnerFixtures = [];
    for (const object of app.state.game.sceneObjects) if (object.emitter) object.emitter.enabled = false;
    for (const emitter of app.state.game.world.components.get(ComponentType.LightEmitter)?.values?.() ?? []) emitter.enabled = false;
    for (const [entity, health] of app.state.game.world.components.get(ComponentType.Health)?.entries?.() ?? []) {
      if (entity !== app.state.game.dragonId) health.alive = false;
    }
    for (const type of [ComponentType.Effect, ComponentType.SmokeCloud]) app.state.game.world.components.get(type)?.clear?.();
    app.state.game.napalmPools = [];
    app.state.game.effects = [];
    app.state.game.smokeClouds = [];
    syncGameViews(app.state.game);
  });
  await page.waitForTimeout(5200);
  const before = await snapshot(page);
  await page.waitForTimeout(6200);
  const after = await snapshot(page);
  const renderSurface = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    return { width: canvas.width, height: canvas.height, clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight, dpr: devicePixelRatio };
  });
  const screenshot = path.join(artifacts, 'machine-dpr.png');
  await page.screenshot({ path: screenshot });
  const reportFile = path.join(artifacts, 'report.json');
  const report = {
    contract: 'black-sky-bound.wyvern-surface-v2-native-dpr-performance.v1',
    status: after.timing.p95.renderPathMs < 16.7 && after.timing.p95.frameIntervalMs <= 17.2 ? 'passed' : 'failed',
    machineDpr,
    renderSurface,
    before,
    after,
    screenshot,
    issues
  };
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  assert.equal(after.actors.wyvernContract, 'black-sky-bound.procedural-wyvern-mesh-recipe.v2');
  assert.equal(after.actors.wyvernTopologyBuildCount, 1, 'candidate topology should remain single-build after sustained native-DPR rendering');
  assert.equal(after.actors.wyvernDrawCallCount, 4, 'candidate should retain four wyvern draw calls');
  assert.ok(after.actors.wyvernTriangleCount <= 6000, 'candidate should retain its triangle budget');
  assert.equal(after.actors.wyvernMalformedFrameCount, 0, 'sustained native-DPR rendering should reject no valid frames');
  assert.equal(after.actors.wyvernNonFiniteVertexCount, 0, 'sustained native-DPR rendering should produce no non-finite vertices');
  for (const key of ['geometries', 'textures', 'meshes', 'materials', 'domNodes']) assert.ok(after.resources[key] <= before.resources[key], `${key} should not grow after warm-up`);
  assert.equal(renderSurface.width, Math.round(renderSurface.clientWidth * renderSurface.dpr), 'canvas width should remain native DPR');
  assert.equal(renderSurface.height, Math.round(renderSurface.clientHeight * renderSurface.dpr), 'canvas height should remain native DPR');
  assert.ok(after.timing.p95.renderPathMs < 16.7, `candidate render path should fit 60 FPS (${after.timing.p95.renderPathMs}ms)`);
  assert.ok(after.timing.p95.frameIntervalMs <= 17.2, `candidate frame interval should remain stable 60 FPS (${after.timing.p95.frameIntervalMs}ms)`);
  if (after.gpu.supported) assert.ok(after.timing.p95.gpuMs < 16.7, `candidate GPU time should fit 60 FPS (${after.timing.p95.gpuMs}ms)`);
  assert.deepEqual(issues, { consoleErrors: [], pageErrors: [], requestFailures: [] });
  console.log(JSON.stringify({ status: 'passed', reportFile, machineDpr, timing: after.timing.p95, actors: after.actors, issues }, null, 2));
} finally {
  await context.close();
  await browser.close();
  runtime.stop();
}

function snapshot(page) {
  return page.evaluate(() => {
    const diagnostics = window.BSB_V2_DEMO.state.game.renderLayers.renderer.webgl3dDiagnostics;
    return {
      timing: diagnostics.frameTiming,
      gpu: diagnostics.gpuTiming,
      resources: diagnostics.resources,
      calls: diagnostics.calls,
      triangles: diagnostics.triangles,
      actors: diagnostics.liveWorld.actors
    };
  });
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
