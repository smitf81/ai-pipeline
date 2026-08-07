import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifacts = path.join(root, 'artifacts', 'webgl3d-wyvern-poses-v1');
await mkdir(artifacts, { recursive: true });
const runtime = await startRuntime();
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const issues = { consoleErrors: [], pageErrors: [], requestFailures: [] };
page.on('console', (message) => { if (message.type() === 'error') issues.consoleErrors.push(message.text()); });
page.on('pageerror', (error) => issues.pageErrors.push(error.message));
page.on('requestfailed', (request) => issues.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));

try {
  await page.goto(`${runtime.url}?skipHatch=1&mamaAuto=0&renderer=webgl3d&gpuTiming=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dActive === true);
  await page.waitForFunction(() => (window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dDiagnostics?.liveWorld?.actors?.wyvernMeshCount ?? 0) >= 35);
  await page.waitForTimeout(900);
  const captures = [];
  captures.push(await capture('idle-torch'));

  await page.keyboard.down('w');
  await page.waitForTimeout(220);
  captures.push(await capture('crawl-torch'));
  await page.keyboard.up('w');
  await page.waitForTimeout(260);

  for (const expected of ['left_claw_swipe', 'right_claw_swipe', 'bite_attack']) {
    await page.keyboard.press('j');
    await page.waitForFunction((actionId) => window.BSB_V2_DEMO.state.game.actors.find((actor) => actor.team === 'player')?.wyvernProjection?.actionState?.actionId === actionId, expected);
    await page.waitForTimeout(expected === 'bite_attack' ? 130 : 180);
    const shot = await capture(`${expected}-torch`);
    assert.equal(shot.pose.actionId, expected, `${expected} must come from the authoritative combo state`);
    assert.ok(shot.pose.attackVolumes > 0, `${expected} must expose its authoritative swept contact volume`);
    captures.push(shot);
    await page.waitForTimeout(expected === 'bite_attack' ? 410 : 350);
  }

  await page.evaluate(async () => {
    const [{ grantAbility }, { AbilityId }] = await Promise.all([
      import('/src/game/playerAbilities.js'), import('/src/constants/abilityIds.js')
    ]);
    const game = window.BSB_V2_DEMO.state.game;
    grantAbility(game.world, game.dragonId, AbilityId.SMOKE_SPIT, 'webgl3d_pose_browser_proof');
  });
  await page.mouse.click(900, 450, { button: 'right' });
  await page.waitForFunction(() => window.BSB_V2_DEMO.state.game.actors.find((actor) => actor.team === 'player')?.wyvernProjection?.actionState?.actionId === 'smoke_spit');
  await page.waitForTimeout(230);
  const smoke = await capture('smoke-spit-torch');
  assert.equal(smoke.pose.actionId, 'smoke_spit');
  assert.ok(smoke.dynamic.smoke > 0, 'smoke-spit pose must feed the pooled 3D smoke path');
  captures.push(smoke);
  await page.waitForTimeout(520);

  await page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    for (const object of app.state.game.sceneObjects) if (object.emitter) object.emitter.enabled = false;
    const lightEmitters = app.state.game.world.components.get('LightEmitter');
    for (const emitter of lightEmitters?.values?.() ?? []) emitter.enabled = false;
  });
  await page.waitForTimeout(300);
  captures.push(await capture('idle-moon'));

  await page.evaluate(async () => {
    const { queueManualLightningFlash } = await import('/src/data/sceneLights.js');
    const game = window.BSB_V2_DEMO.state.game;
    queueManualLightningFlash(game.sceneLights, game.renderTime, 'webgl3d_wyvern_pose_proof');
  });
  await page.waitForTimeout(42);
  const lightning = await capture('idle-lightning');
  assert.ok(lightning.lights.shadowOwners.some((owner) => String(owner).includes('storm_lightning')), 'lightning must pre-empt a physical point-shadow slot');
  assert.ok(lightning.effects.lightningBolts > 0, 'lightning must render a visible world-space strike as well as a physical light');
  captures.push(lightning);

  const normalOverlayHidden = await page.locator('#bsb-three-diagnostics').evaluate((element) => getComputedStyle(element).display === 'none');
  assert.ok(normalOverlayHidden, 'normal visual captures should keep advanced diagnostics hidden');
  await page.keyboard.press('F3');
  await page.waitForFunction(() => window.BSB_V2_DEMO.state.game.renderLayers.renderer.webgl3dDiagnostics.liveWorld.actors.contactDebug.enabled === true);
  const alignment = await capture('contact-alignment');
  captures.push(alignment);

  const actorStats = alignment.actors;
  assert.ok(actorStats.wyvernMeshCount >= 35, 'accepted faceted player topology must remain live in every pose');
  assert.equal(actorStats.membraneCount, 2, 'both procedural wing membranes must remain live');
  assert.ok(actorStats.wyvernPoseUpdateCount > 0, 'live frames must continue driving the authoritative procedural rig');
  assert.ok(actorStats.contactDebug.enabled && actorStats.contactDebug.pooledVolumes > 0, 'F3 must expose pooled authoritative contact volumes');
  assert.deepEqual(issues.consoleErrors, [], 'console errors');
  assert.deepEqual(issues.pageErrors, [], 'page errors');
  assert.deepEqual(issues.requestFailures, [], 'request failures');
  const report = { contract: 'black-sky-bound.webgl3d-procedural-wyvern-pose-browser-proof.v1', captures, issues };
  const reportFile = path.join(artifacts, 'report.json');
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: 'passed', reportFile, captures: captures.map(({ name, pose, screenshot }) => ({ name, pose, screenshot })), issues }, null, 2));

  async function capture(name) {
    const state = await page.evaluate(() => {
      const app = window.BSB_V2_DEMO;
      const actor = app.state.game.actors.find((entry) => entry.team === 'player');
      const diagnostics = app.state.game.renderLayers.renderer.webgl3dDiagnostics;
      return {
        pose: {
          motionId: actor?.wyvernProjection?.motionState?.motionId ?? null,
          actionId: actor?.wyvernProjection?.actionState?.actionId ?? null,
          phase: actor?.wyvernProjection?.actionState?.phase ?? 0,
          attackVolumes: actor?.bodyContactRig?.attackVolumes?.length ?? 0
        },
        actors: diagnostics.liveWorld.actors,
        lights: diagnostics.liveWorld.lights,
        effects: diagnostics.liveWorld.effects,
        dynamic: diagnostics.projection.dynamicCounts,
        timing: diagnostics.frameTiming?.p95
      };
    });
    const screenshot = path.join(artifacts, `${String(captures.length + 1).padStart(2, '0')}-${name}.png`);
    await page.screenshot({ path: screenshot });
    return { name, ...state, screenshot };
  }
} finally {
  await browser.close();
  runtime.stop();
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
