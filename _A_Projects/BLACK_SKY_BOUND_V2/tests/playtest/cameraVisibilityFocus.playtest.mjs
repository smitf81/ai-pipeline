import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifactRoot = path.join(projectRoot, 'artifacts', 'camera-visibility-focus-v1');
await mkdir(artifactRoot, { recursive: true });
const server = await startRuntime();
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const issues = { consoleErrors: [], pageErrors: [], requestFailures: [] };
page.on('console', (message) => { if (message.type() === 'error') issues.consoleErrors.push(message.text()); });
page.on('pageerror', (error) => issues.pageErrors.push(error.message));
page.on('requestfailed', (request) => issues.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));

try {
  await page.goto(`${server.url}?skipHatch=1&mamaAuto=0&renderer=webgl3d&gpuTiming=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dActive === true);
  const setup = await page.evaluate(async () => {
    const app = window.BSB_V2_DEMO;
    const [{ ComponentType }, { syncGameViews }, { wyvernProjectionSystem }, tuning] = await Promise.all([
      import('/src/constants/componentTypes.js'),
      import('/src/game/selectors.js'),
      import('/src/systems/wyvernProjectionSystem.js'),
      import('/src/data/creatures/creatureTuning.js')
    ]);
    app.stop();
    app.state.paused = true;
    const tree = app.state.game.sceneObjects
      .filter((object) => object.type === 'tree')
      .sort((left, right) => Number(right.tree?.leafDensity ?? 0) * Number(right.tree?.canopySpread ?? 0)
        - Number(left.tree?.leafDensity ?? 0) * Number(left.tree?.canopySpread ?? 0))[0];
    if (!tree) throw new Error('camera_focus_canopy_fixture_missing');
    const transform = app.state.game.world.components.get(ComponentType.Transform).get(app.state.game.dragonId);
    Object.assign(transform, { x: tree.x, y: tree.y, rotation: -Math.PI * 0.25 });
    wyvernProjectionSystem({ state: app.state, game: app.state.game, dt: 1 / 60 });
    syncGameViews(app.state.game);
    Object.assign(app.state.camera, { x: tree.x * 32, y: tree.y * 32, zoom: 4.15 });
    for (const [entity, health] of app.state.game.world.components.get(ComponentType.Health)?.entries?.() ?? []) {
      if (entity === app.state.game.dragonId) continue;
      health.alive = false;
      health.hp = 0;
    }
    for (const emitter of app.state.game.world.components.get(ComponentType.LightEmitter)?.values?.() ?? []) emitter.enabled = false;
    for (const selector of ['.bsb-tutorial', '.bsb-arena-banner', '.bsb-pause', '#bsb-three-screen-overlay']) {
      document.querySelector(selector)?.style.setProperty('display', 'none', 'important');
    }
    const profileId = app.state.game.actors.find((actor) => actor.id === app.state.game.dragonId)?.wyvernProjection?.rigPose?.profileId
      ?? 'grounded_wyvern_hatchling_skeletal_gait_v0';
    let creatureTuning = app.state.game.creatureTuning;
    for (const [field, value] of [
      ['visibilityFocus.radiusMeters', 1.15],
      ['visibilityFocus.featherMeters', 0.3],
      ['visibilityFocus.minimumOccluderOpacity', 0.025]
    ]) {
      const result = tuning.setCreatureTuningValue(creatureTuning, profileId, field, value);
      if (!result.ok) throw new Error(result.reason);
      creatureTuning = result.tuning;
    }
    app.state.game.creatureTuning = creatureTuning;
    app.state.game.cameraVisibilityFocus.targetEntityId = app.state.game.dragonId;
    app.state.game.cameraVisibilityFocus.source = 'camera_focus_browser_canopy_proof';
    return {
      tree: { id: tree.id, x: tree.x, y: tree.y, heightMeters: tree.tree?.heightMeters, leafDensity: tree.tree?.leafDensity, canopySpread: tree.tree?.canopySpread },
      playerId: app.state.game.dragonId,
      profileId
    };
  });

  const disabled = await renderState(false, '01-trace-disabled-canopy.png');
  assert.equal(disabled.focus.active, false, 'disabled comparison frame must not apply the visibility focus');
  const enabled = await renderState(true, '02-traced-sightline-cut.png');
  assert.equal(enabled.focus.active, true, 'enabled comparison frame must apply the visibility focus');
  assert.equal(enabled.focus.targetEntityId, setup.playerId, 'the live focus effect must use the exact player entity id');
  assert.equal(enabled.focus.radiusMeters, 1.15, 'the live sightline cut must consume the tuned cross-section radius');
  assert.equal(enabled.focus.minimumOccluderOpacity, 0.025, 'the live focus effect must consume the tuned blocker opacity');
  assert.equal(enabled.focus.syntheticLightCount, 0, 'the live focus effect must not add a player-following readability light');
  assert.equal(enabled.focus.illuminationPolicy, 'occluder_fade_only_no_actor_tracking_light_v2', 'the live focus effect must remain occluder-only');
  assert.equal(enabled.focus.opacityMode, 'traced_orthographic_sightline_corridor_stable_dither', 'the live proof must use traced corridor semantics');
  assert.equal(enabled.focus.crossSectionSampleCount, 9, 'the live proof must trace the player-sized camera cross-section');
  assert.equal(enabled.focus.occlusionActive, true, 'the authored canopy must be confirmed as a real camera-target blocker');
  assert.ok(enabled.focus.blockerObjectCount > 0, 'the live trace must report at least one exact blocker');
  assert.ok(enabled.focus.blockerIds.includes(setup.tree.id), 'the densest authored tree must be identified by stable scene-object id');
  assert.ok(enabled.focus.patchedMaterialCount > 0, 'real live scenery materials must be focus-patched');
  assert.ok(enabled.calls > 0 && enabled.triangles > 0, 'the comparison must render the real Three scene');
  assert.deepEqual(issues, { consoleErrors: [], pageErrors: [], requestFailures: [] });
  const report = {
    contract: 'black-sky-bound.camera-visibility-focus.browser-proof.v1',
    generatedAt: new Date().toISOString(),
    url: page.url(),
    viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
    setup,
    captures: { disabled, enabled },
    issues
  };
  const reportPath = path.join(artifactRoot, 'report.json');
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: 'passed', reportPath, screenshots: [disabled.screenshot, enabled.screenshot], focus: enabled.focus, issues }, null, 2));
} finally {
  await browser.close();
  server.stop();
}

async function renderState(active, screenshotName) {
  const state = await page.evaluate((enabled) => {
    const app = window.BSB_V2_DEMO;
    app.state.game.cameraVisibilityFocus.enabled = enabled;
    app.renderer.render(app.state, 0);
    app.renderer.render(app.state, 0);
    const diagnostics = app.state.game.renderLayers.renderer.webgl3dDiagnostics;
    return {
      activeBackend: app.state.game.renderLayers.renderer.activeBackend,
      focus: structuredClone(diagnostics.liveWorld.cameraVisibilityFocus),
      calls: diagnostics.calls,
      triangles: diagnostics.triangles,
      cpuP95Ms: diagnostics.cpuP95Ms,
      gpuP95Ms: diagnostics.gpuP95Ms
    };
  }, active);
  await page.waitForTimeout(120);
  const screenshot = path.join(artifactRoot, screenshotName);
  await page.screenshot({ path: screenshot, fullPage: true });
  return { ...state, screenshot };
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
