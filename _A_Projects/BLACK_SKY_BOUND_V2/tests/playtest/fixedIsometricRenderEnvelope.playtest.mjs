import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifactRoot = path.join(projectRoot, 'artifacts', 'fixed-isometric-render-envelope-v1');
await mkdir(artifactRoot, { recursive: true });
const runtime = await startRuntime();
const browser = await chromium.launch({ headless: true });

try {
  const enabled = await captureScenario(browser, runtime.url, {
    id: 'enabled',
    query: 'renderEnvelope=1&renderEnvelopeMargin=1.5&renderEnvelopeChunkTiles=24',
    positions: null
  });
  const baseline = await captureScenario(browser, runtime.url, {
    id: 'disabled-single-batch-baseline',
    query: 'renderEnvelope=0&renderEnvelopeChunkTiles=256',
    positions: enabled.positions
  });
  const enabledCentre = enabled.frames.find((frame) => frame.id === 'centre');
  const baselineCentre = baseline.frames.find((frame) => frame.id === 'centre');
  assert.ok(enabled.frames.every((frame) => frame.envelope.totalRenderables > 0), 'render envelope diagnostics must be live in the real gameplay renderer');
  assert.ok(enabled.frames.every((frame) => frame.envelope.visible + frame.envelope.margin + frame.envelope.culled === frame.envelope.totalRenderables), 'every renderable must have exactly one envelope state');
  assert.ok(enabled.frames.some((frame) => frame.envelope.margin > 0), 'camera pans must exercise the safety-margin state used to prevent edge pop-in');
  assert.ok(enabledCentre.envelope.culled > 0 && enabledCentre.envelope.culledRatio > 0.2, 'the fixed gameplay camera should skip a meaningful off-envelope set');
  assert.ok(enabledCentre.envelope.byKind.terrain?.culled > 0, 'off-camera terrain chunks should be culled');
  assert.ok((enabledCentre.envelope.byKind.foliage?.culled ?? 0) > 0, 'off-camera trees or foliage should be culled');
  assert.ok(enabledCentre.triangles < baselineCentre.triangles * 0.8, `triangle submission should drop meaningfully: ${enabledCentre.triangles} vs ${baselineCentre.triangles}`);
  assert.equal(enabledCentre.sceneObjectCount, baselineCentre.sceneObjectCount, 'render visibility must not remove gameplay scene objects');
  assert.equal(enabledCentre.terrainTileCount, baselineCentre.terrainTileCount, 'render visibility must not mutate terrain truth');
  assert.deepEqual(enabled.issues, { consoleErrors: [], pageErrors: [], requestFailures: [] }, 'enabled browser proof should have no browser errors');
  assert.deepEqual(baseline.issues, { consoleErrors: [], pageErrors: [], requestFailures: [] }, 'baseline browser proof should have no browser errors');

  const report = {
    contract: 'black-sky-bound.fixed-isometric-render-envelope.browser-proof.v1',
    generatedAt: new Date().toISOString(),
    status: 'passed',
    url: runtime.url,
    viewport: { width: 1440, height: 900 },
    enabled,
    baseline,
    comparison: {
      calls: { enabled: enabledCentre.calls, baseline: baselineCentre.calls },
      triangles: { enabled: enabledCentre.triangles, baseline: baselineCentre.triangles },
      triangleReductionRatio: round(1 - enabledCentre.triangles / baselineCentre.triangles)
    }
  };
  const reportFile = path.join(artifactRoot, 'report.json');
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: 'passed',
    reportFile,
    enabled: compact(enabledCentre),
    baseline: compact(baselineCentre),
    screenshots: enabled.frames.map((frame) => frame.screenshot)
  }, null, 2));
} finally {
  await browser.close();
  runtime.stop();
}

async function captureScenario(browser, baseUrl, scenario) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const issues = { consoleErrors: [], pageErrors: [], requestFailures: [] };
  page.on('console', (message) => { if (message.type() === 'error') issues.consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => issues.pageErrors.push(error.message));
  page.on('requestfailed', (request) => issues.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));
  try {
    await page.goto(`${baseUrl}?skipHatch=1&mamaAuto=0&renderer=webgl3d&debug3d=1&${scenario.query}`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await page.waitForFunction(() => window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dDiagnostics?.liveWorld?.renderEnvelope?.totalRenderables > 0, null, { timeout: 40_000 });
    const baseCamera = await page.evaluate(() => {
      const app = window.BSB_V2_DEMO;
      app.stop();
      return { x: app.state.camera.x, y: app.state.camera.y, zoom: app.state.camera.zoom };
    });
    const positions = scenario.positions ?? [
      { id: 'west', x: baseCamera.x - 96, y: baseCamera.y, zoom: baseCamera.zoom },
      { id: 'centre', ...baseCamera },
      { id: 'north', x: baseCamera.x, y: baseCamera.y - 96, zoom: baseCamera.zoom }
    ];
    const frames = [];
    for (const position of positions) {
      const frame = await page.evaluate((target) => {
        const app = window.BSB_V2_DEMO;
        app.state.camera.x = target.x;
        app.state.camera.y = target.y;
        app.state.camera.zoom = target.zoom;
        app.renderer.render(app.state);
        document.querySelector('canvas')?.getContext('webgl2')?.finish();
        const diagnostics = app.state.game.renderLayers.renderer.webgl3dDiagnostics;
        return {
          id: target.id,
          camera: { x: app.state.camera.x, y: app.state.camera.y, zoom: app.state.camera.zoom },
          envelope: structuredClone(diagnostics.liveWorld.renderEnvelope),
          calls: diagnostics.calls,
          triangles: diagnostics.triangles,
          sceneObjectCount: app.state.game.sceneObjects.length,
          terrainTileCount: app.state.map.width * app.state.map.height
        };
      }, position);
      const screenshot = path.join(artifactRoot, `${scenario.id}-${position.id}.png`);
      await page.screenshot({ path: screenshot });
      frames.push({ ...frame, screenshot });
    }
    return { id: scenario.id, query: scenario.query, positions, frames, issues };
  } finally {
    await context.close();
  }
}

function compact(frame) {
  return {
    calls: frame.calls,
    triangles: frame.triangles,
    total: frame.envelope.totalRenderables,
    visible: frame.envelope.visible,
    margin: frame.envelope.margin,
    culled: frame.envelope.culled,
    culledRatio: frame.envelope.culledRatio
  };
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
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server_exited:${child.exitCode}:${output}`);
    try {
      const response = await fetch(url);
      if (response.ok) return { url, stop: () => child.kill() };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error(`server_start_timeout:${output}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function round(value) { return Math.round(value * 1000) / 1000; }
