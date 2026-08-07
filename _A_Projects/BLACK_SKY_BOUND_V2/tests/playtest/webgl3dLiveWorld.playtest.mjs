import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifactRoot = path.join(projectRoot, 'artifacts', 'webgl3d-live-world-v1');
await mkdir(artifactRoot, { recursive: true });
const server = await startRuntime();
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const issues = { consoleErrors: [], pageErrors: [], requestFailures: [] };
page.on('console', (message) => { if (message.type() === 'error') issues.consoleErrors.push(message.text()); });
page.on('pageerror', (error) => issues.pageErrors.push(error.message));
page.on('requestfailed', (request) => issues.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));

try {
  await page.goto(`${server.url}?skipHatch=1&renderer=webgl3d&debug3d=1&gpuTiming=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dActive === true);
  await page.evaluate(() => window.advanceTime?.(1000 / 60));
  const before = await playerPosition(page);
  await page.keyboard.down('w');
  await page.waitForTimeout(340);
  await page.keyboard.up('w');
  await page.evaluate(() => window.advanceTime?.(1000 / 30));
  await page.waitForTimeout(2200);
  const after = await playerPosition(page);
  const state = await page.evaluate(() => {
    const renderer = window.BSB_V2_DEMO.state.game.renderLayers.renderer;
    return {
      activeBackend: renderer.activeBackend,
      backendStatus: renderer.backendStatus,
      diagnostics: renderer.webgl3dDiagnostics,
      hudVisible: getComputedStyle(document.getElementById('bsb-three-screen-overlay')).display !== 'none'
    };
  });
  if (state.activeBackend !== 'webgl3d' || state.backendStatus !== 'active') throw new Error('webgl3d_live_backend_not_active');
  if ((state.diagnostics?.liveWorld?.terrainTiles ?? 0) <= 0) throw new Error('live_terrain_missing');
  if ((state.diagnostics?.liveWorld?.sceneryCount ?? 0) <= 0) throw new Error('live_scenery_missing');
  if ((state.diagnostics?.liveWorld?.actors?.actorCount ?? 0) <= 0) throw new Error('live_actors_missing');
  const unsupported = state.diagnostics?.liveWorld?.scenery?.unsupportedKinds ?? [];
  if (unsupported.length) throw new Error(`unsupported_scenery:${unsupported.join(',')}`);
  if (!(after.x < before.x && after.y < before.y)) throw new Error(`screen_relative_w_failed:${JSON.stringify({ before, after })}`);
  if (!state.hudVisible) throw new Error('screen_space_hud_missing');
  if ((state.diagnostics.cpuP95Ms ?? Infinity) >= 16.7) throw new Error(`cpu_p95_budget_failed:${JSON.stringify({ cpuP95Ms: state.diagnostics.cpuP95Ms, frameMs: state.diagnostics.frameMs, gpuP95Ms: state.diagnostics.gpuP95Ms, gpuTiming: state.diagnostics.gpuTiming, live: state.diagnostics.liveWorld })}`);
  if (state.diagnostics.gpuTiming?.supported && (state.diagnostics.gpuP95Ms ?? Infinity) >= 16.7) throw new Error(`gpu_p95_budget_failed:${state.diagnostics.gpuP95Ms}`);
  const screenshot = path.join(artifactRoot, '01-live-first-escape.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await page.keyboard.press('F3');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('bsb-three-diagnostics')).display === 'none');
  const interactions = await proveScreenSpaceAndLifecycle(page);
  if (issues.consoleErrors.length || issues.pageErrors.length || issues.requestFailures.length) throw new Error(`browser_issues:${JSON.stringify(issues)}`);
  const report = { contract: 'black-sky-bound.webgl3d-live-world.browser-proof.v1', generatedAt: new Date().toISOString(), before, after, state, interactions, screenshot, issues };
  await writeFile(path.join(artifactRoot, 'playtest-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: 'passed', artifactRoot, before, after, calls: state.diagnostics.calls, triangles: state.diagnostics.triangles, cpuP95Ms: state.diagnostics.cpuP95Ms, gpuP95Ms: state.diagnostics.gpuP95Ms, gpuTimingSupported: state.diagnostics.gpuTiming?.supported, issues }, null, 2));
} finally {
  await browser.close();
  server.stop();
}

async function proveScreenSpaceAndLifecycle(page) {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.BSB_V2_DEMO.state.paused === true);
  const pauseLayer = page.locator('#bsb-three-screen-overlay [data-three-pause]');
  const pauseVisible = await pauseLayer.evaluate((element) => getComputedStyle(element).display === 'block' && element.textContent.includes('CONTROLS & INSTINCTS'));
  if (!pauseVisible) throw new Error('three_pause_overlay_missing');
  const masterRail = pauseLayer.locator('[data-setting-id="audio_master"][data-pause-target="rail"]');
  const railBox = await masterRail.boundingBox();
  if (!railBox) throw new Error('three_pause_master_rail_missing');
  await page.mouse.click(railBox.x + railBox.width * .45, railBox.y + railBox.height * .5);
  await page.waitForFunction(() => Math.abs(window.BSB_V2_DEMO.state.playerProfile.settings.audio.master - .45) < .001);
  const masterValue = await pauseLayer.locator('[data-setting-value="audio_master"]').textContent();
  if (masterValue !== '45%') throw new Error(`three_pause_master_value_stale:${masterValue}`);
  await page.screenshot({ path: path.join(artifactRoot, '02-pause-menu.png') });

  await page.setViewportSize({ width: 760, height: 600 });
  await page.waitForTimeout(180);
  const compact = await pauseLayer.evaluate((element) => {
    const footer = element.querySelector('.bsb-pause-footer')?.getBoundingClientRect();
    const rail = element.querySelector('[data-setting-id="audio_master"][data-pause-target="rail"]')?.getBoundingClientRect();
    return { footerBottom: footer?.bottom ?? Infinity, railRight: rail?.right ?? Infinity, text: element.textContent };
  });
  if (compact.footerBottom > 600 || compact.railRight > 760 || !compact.text.includes('CLICK / DRAG / WHEEL')) throw new Error(`three_pause_compact_layout_failed:${JSON.stringify(compact)}`);
  await page.screenshot({ path: path.join(artifactRoot, '02b-pause-menu-compact.png') });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(120);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.BSB_V2_DEMO.state.paused === false);

  const dodgeBefore = await page.evaluate(() => window.BSB_V2_DEMO.state.game.actors.find((actor) => actor.team === 'player')?.dodgeState?.count ?? 0);
  await page.keyboard.down('d');
  await page.keyboard.down('Space');
  await page.waitForTimeout(80);
  await page.keyboard.up('Space');
  await page.waitForTimeout(220);
  await page.keyboard.up('d');
  const dodgeAfter = await page.evaluate(() => window.BSB_V2_DEMO.state.game.actors.find((actor) => actor.team === 'player')?.dodgeState?.count ?? 0);
  if (dodgeAfter !== dodgeBefore + 1) throw new Error(`live_dodge_failed:${dodgeBefore}:${dodgeAfter}`);

  await page.evaluate(async () => {
    const { applyDamageToEntity } = await import('/src/systems/healthSystem.js');
    const app = window.BSB_V2_DEMO;
    const health = app.state.game.world.components.get('Health').get(app.state.game.dragonId);
    applyDamageToEntity(app.state.game.world, app.state.game.dragonId, health.maxHp * .55, null, 'browser_body_feedback_proof');
  });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-three-body-feedback]')).display === 'block');
  const bodyFeedback = await page.locator('[data-three-body-feedback]').evaluate((element) => ({
    active: getComputedStyle(element).display === 'block',
    healthPressure: Number(element.dataset.healthPressure),
    hitPulse: Number(element.dataset.hitPulse),
    backdropFilter: getComputedStyle(element).backdropFilter
  }));
  if (!bodyFeedback.active || bodyFeedback.healthPressure <= 0) throw new Error(`three_body_feedback_missing:${JSON.stringify(bodyFeedback)}`);
  await page.screenshot({ path: path.join(artifactRoot, '03-body-pressure.png') });

  await page.evaluate(async () => {
    const { applyDamageToEntity } = await import('/src/systems/healthSystem.js');
    const app = window.BSB_V2_DEMO;
    const health = app.state.game.world.components.get('Health').get(app.state.game.dragonId);
    applyDamageToEntity(app.state.game.world, app.state.game.dragonId, health.hp + health.maxHp, null, 'browser_lifecycle_proof');
  });
  await page.waitForFunction(() => window.BSB_V2_DEMO.state.game.actors.find((actor) => actor.team === 'player')?.playerLifecycle?.state === 'deathFade');
  await page.waitForTimeout(650);
  await page.screenshot({ path: path.join(artifactRoot, '03-death-fade.png') });
  await page.waitForFunction(() => {
    const actor = window.BSB_V2_DEMO.state.game.actors.find((entry) => entry.team === 'player');
    return actor?.alive === true && actor?.playerLifecycle?.state === 'alive' && actor?.playerLifecycle?.respawnCount >= 1;
  }, null, { timeout: 6000 });
  await page.screenshot({ path: path.join(artifactRoot, '04-respawned.png') });
  return { pauseVisible, masterValue, compact, dodgeBefore, dodgeAfter, bodyFeedback, respawned: true };
}

function playerPosition(page) {
  return page.evaluate(() => {
    const actor = window.BSB_V2_DEMO.state.game.actors.find((entry) => entry.team === 'player' && entry.alive);
    return { x: actor.x, y: actor.y };
  });
}

async function startRuntime() {
  const port = await freePort();
  const child = spawn(process.execPath, ['tools/launch.mjs', String(port)], { cwd: projectRoot, env: { ...process.env, BSB_NO_OPEN: '1', BSB_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
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
