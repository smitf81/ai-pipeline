import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifacts = path.join(root, 'artifacts', 'storm-presentation-v1');
await mkdir(artifacts, { recursive: true });
const runtime = await startRuntime();
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const issues = { consoleErrors: [], pageErrors: [], requestFailures: [] };
page.on('console', (message) => { if (message.type() === 'error') issues.consoleErrors.push(message.text()); });
page.on('pageerror', (error) => issues.pageErrors.push(error.message));
page.on('requestfailed', (request) => issues.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));

try {
  await page.goto(`${runtime.url}?skipHatch=1&mamaAuto=0&renderer=webgl3d`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dActive === true);
  await page.mouse.click(720, 450);
  await page.waitForFunction(() => window.BSB_V2_DEMO?.state?.audio?.unlocked === true, null, { timeout: 5000 });
  await page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    const health = app.state.game.world.components.get('Health');
    for (const [entity, value] of health?.entries?.() ?? []) {
      if (entity === app.state.game.dragonId) continue;
      value.hp = 0;
      value.alive = false;
    }
    for (const selector of ['.bsb-tutorial', '.bsb-arena-banner']) document.querySelector(selector)?.style.setProperty('display', 'none', 'important');
  });
  await page.waitForFunction(() => {
    const effects = window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dDiagnostics?.liveWorld?.effects;
    return effects?.rainStreaks >= 280 && effects?.atmosphereSparks >= 1;
  });
  const atmosphere = await diagnostics(page);
  assert.ok(atmosphere.effects.rainStreaks >= 280, 'storm should render the dense bounded rain field');
  assert.ok(atmosphere.effects.atmosphereSparks >= 1 && atmosphere.effects.atmosphereSparks <= 6, 'storm should preserve the sparse pre-3D spark cadence');
  assert.equal(atmosphere.effects.atmosphereSparkPresentation.primitive, 'soft_round_glowing_point_mote', 'storm sparks should be round glowing motes rather than orange triangles');
  assert.equal(atmosphere.effects.atmosphereSparkPresentation.cadencePolicy, 'pre_3d_spawn_rate_lifetime_window_v0', 'storm sparks should treat sparkRate as a temporal cadence');
  assert.equal(atmosphere.effects.atmosphereSparkPresentation.triangleFallbacks, 0, 'storm sparks should expose no cone/triangle fallback');
  assert.ok(atmosphere.effects.atmosphereSparkPresentation.maxPointSizePx <= 5.6, 'storm spark motes should stay small on screen');
  const atmosphereScreenshot = path.join(artifacts, '01-storm-field.png');
  await page.screenshot({ path: atmosphereScreenshot });

  await page.evaluate(async () => {
    const { queueManualLightningFlash } = await import('/src/data/sceneLights.js');
    const app = window.BSB_V2_DEMO;
    const game = app.state.game;
    queueManualLightningFlash(game.sceneLights, game.renderTime, 'storm_presentation_browser_proof');
  });
  await page.waitForFunction(() => window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dDiagnostics?.liveWorld?.effects?.lightningBolts > 0);
  await page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    app.state.paused = true;
    app.renderer.render(app.state, 0);
  });
  const lightning = await diagnostics(page);
  assert.ok(lightning.effects.lightningBolts > 0, 'lightning should render a visible bolt');
  assert.equal(lightning.effects.lightningAnchors[0].visualAnchorPolicy, 'fixed_world_storm_event_origin_v1', 'bolt should expose its fixed world anchor policy');
  assert.equal(lightning.effects.lightningAnchors[0].originAcquisition.policy, 'viewport_acquired_then_world_frozen_v1', 'live storm should acquire the current viewport before freezing its world origin');
  assert.ok(lightning.effects.lightningAnchors[0].originAcquisition.intendedViewportY <= 0.42, 'live strike should enter through the upper rendered band');
  const halfViewWidth = lightning.gameplayCamera.viewportW / (2 * lightning.gameplayCamera.zoom);
  const halfViewHeight = lightning.gameplayCamera.viewportH / (2 * lightning.gameplayCamera.zoom);
  assert.ok(Math.abs(lightning.effects.lightningAnchors[0].worldX - lightning.gameplayCamera.x) < halfViewWidth * 0.85, 'live bolt should begin inside the rendered width');
  assert.ok(Math.abs(lightning.effects.lightningAnchors[0].worldY - lightning.gameplayCamera.y) < halfViewHeight * 0.85, 'live bolt should begin inside the rendered height');
  assert.ok(lightning.lights.shadowOwners.some((owner) => String(owner).includes('storm_lightning')), 'bright lightning should own a physical shadow light');
  assert.ok(lightning.lights.stormSkyIntensity > 1.25, 'lightning should visibly illuminate the broader scene from above');
  const lightningScreenshot = path.join(artifacts, '02-lightning-flash.png');
  await page.screenshot({ path: lightningScreenshot });

  const anchorProof = await page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    app.renderer.render(app.state, 0);
    const anchorBefore = app.state.game.renderLayers.renderer.webgl3dDiagnostics.liveWorld.effects.lightningAnchors[0];
    app.state.camera.x += 320;
    app.state.camera.y += 160;
    app.renderer.render(app.state, 0);
    const anchors = app.state.game.renderLayers.renderer.webgl3dDiagnostics.liveWorld.effects.lightningAnchors;
    const anchorAfter = anchors.find((anchor) => anchor.id === anchorBefore.id);
    return { anchorBefore, anchorAfter };
  });
  const { anchorBefore, anchorAfter } = anchorProof;
  assert.ok(anchorBefore && anchorAfter, 'the same lightning packet should survive an atomic camera move');
  assert.equal(anchorAfter.worldX, anchorBefore.worldX, 'moving the camera must not move lightning world X');
  assert.equal(anchorAfter.worldY, anchorBefore.worldY, 'moving the camera must not move lightning world Y');
  await page.evaluate(() => { window.BSB_V2_DEMO.state.paused = false; });

  await page.waitForFunction(() => window.BSB_V2_DEMO?.state?.audio?.lightning?.cameraShake?.active === true, null, { timeout: 4000 });
  await page.waitForFunction(() => window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dDiagnostics?.camera?.stormImpulse?.active === true);
  const thunder = await diagnostics(page);
  assert.ok(thunder.camera.stormImpulse.active, 'thunder arrival should displace the live Three camera');
  assert.ok(thunder.audio.lightning.thunderCount > 0, 'delayed thunder should actually play');
  assert.equal(thunder.audio.lightning.cameraShake.sourcePolicy, 'delayed_thunder_arrival_only', 'shake should sync to thunder rather than flash');
  const thunderScreenshot = path.join(artifacts, '03-thunder-shake.png');
  await page.screenshot({ path: thunderScreenshot });

  assert.deepEqual(issues.consoleErrors, [], 'console errors');
  assert.deepEqual(issues.pageErrors, [], 'page errors');
  assert.deepEqual(issues.requestFailures, [], 'request failures');
  const report = {
    contract: 'black-sky-bound.storm-presentation-browser-proof.v1',
    atmosphere,
    lightning,
    anchorBefore,
    anchorAfter,
    thunder,
    screenshots: [atmosphereScreenshot, lightningScreenshot, thunderScreenshot],
    issues
  };
  const reportFile = path.join(artifacts, 'report.json');
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: 'passed', reportFile, screenshots: report.screenshots, issues }, null, 2));
} finally {
  await browser.close();
  runtime.stop();
}

function diagnostics(page) {
  return page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    const renderer = app.state.game.renderLayers.renderer.webgl3dDiagnostics;
    return {
      effects: renderer.liveWorld.effects,
      lights: renderer.liveWorld.lights,
      camera: renderer.camera,
      gameplayCamera: { ...app.state.camera },
      audio: app.state.audio
    };
  });
}

async function startRuntime() {
  const port = await freePort();
  const child = spawn(process.execPath, ['tools/launch.mjs', String(port)], {
    cwd: root,
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
    try {
      const response = await fetch(url);
      if (response.ok) return { url, stop: () => child.kill() };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error(`server_timeout:${output}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function launchBrowser() {
  try { return await chromium.launch({ channel: process.env.BSB_PLAYWRIGHT_CHANNEL || 'msedge', headless: true }); }
  catch { return chromium.launch({ headless: true }); }
}
