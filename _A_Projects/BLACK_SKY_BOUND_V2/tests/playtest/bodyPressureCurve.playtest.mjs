import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifactRoot = path.join(projectRoot, 'artifacts', 'body-pressure-curve-v1');
const issues = { consoleErrors: [], pageErrors: [], requestFailures: [] };
await mkdir(artifactRoot, { recursive: true });
const runtime = await startRuntime();
let browser;

try {
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  trackIssues(page);
  await page.goto(`${runtime.url}?skipHatch=1&renderer=webgl3d`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dActive === true);
  await preparePressureStage(page);

  const healthy = await capture(page, '01-healthy.png', { healthRatio: 1, staminaRatio: 1, staminaState: 'ready', renderTime: 0 });
  const healthWarning = await capture(page, '02-health-warning-50.png', { healthRatio: .5, staminaRatio: 1, staminaState: 'ready', renderTime: .2 });
  const healthCritical = await capture(page, '03-health-critical-30.png', { healthRatio: .3, staminaRatio: 1, staminaState: 'ready', renderTime: .55 });
  const healthTerminal = await capture(page, '04-health-terminal-10.png', { healthRatio: .1, staminaRatio: 1, staminaState: 'ready', renderTime: .82 });
  const staminaLow = await capture(page, '05-stamina-low-30.png', { healthRatio: 1, staminaRatio: .3, staminaState: 'recovering', renderTime: .36 });
  const staminaCritical = await capture(page, '06-stamina-critical-12.png', { healthRatio: 1, staminaRatio: .12, staminaState: 'exhausted', renderTime: .68 });
  const compound = await capture(page, '07-compound-critical.png', { healthRatio: .1, staminaRatio: .12, staminaState: 'exhausted', renderTime: .82 });
  const drain = await proveLiveStaminaDrain(page);
  const death = await proveTerminalToDeath(page);

  assert(healthy.active === false, 'healthy play should not carry a permanent body-pressure overlay');
  assert(healthWarning.healthPressure > 0 && healthWarning.healthPressure < .15, 'fifty-percent health should remain a faint warning');
  assert(healthWarning.healthPressure < healthCritical.healthPressure && healthCritical.healthPressure < healthTerminal.healthPressure, 'health pressure must increase monotonically toward death');
  assert(healthWarning.healthClearRadius > healthCritical.healthClearRadius && healthCritical.healthClearRadius > healthTerminal.healthClearRadius, 'health clear radius must contract monotonically toward death');
  assert(healthTerminal.healthBand === 'terminal' && healthTerminal.healthEdgeAlpha > .5, 'terminal health should be oppressive and explicitly classified');
  assert(staminaLow.staminaPressure > 0 && staminaLow.staminaPressure < staminaCritical.staminaPressure, 'stamina pressure must begin subtly and accelerate into exhaustion');
  assert(staminaLow.staminaClearRadius > staminaCritical.staminaClearRadius, 'stamina exhaustion must constrain the peripheral field');
  assert(staminaCritical.staminaBand === 'exhausted' && staminaCritical.staminaSaturation < .9, 'critical stamina should visibly desaturate only its peripheral layer');
  assert(compound.healthEdgeAlpha > 0 && compound.staminaAlpha > 0, 'critical health and stamina should compound through the same two owned layers');
  assert(drain.samples.some((sample) => sample.ratio <= .3) && drain.samples.some((sample) => sample.ratio <= .15), 'real sprint drain should cross both visual pressure thresholds');
  assert(death.preDeath.healthBand === 'terminal' && death.lifecycleState !== 'alive', 'the terminal warning must visibly precede the separate death lifecycle mask');
  assert(!issues.consoleErrors.length && !issues.pageErrors.length && !issues.requestFailures.length, `browser issues: ${JSON.stringify(issues)}`);

  const report = {
    contract: 'black-sky-bound.body-pressure-curve.browser-proof.v1',
    generatedAt: new Date().toISOString(),
    url: runtime.url,
    captures: { healthy, healthWarning, healthCritical, healthTerminal, staminaLow, staminaCritical, compound },
    drain,
    death,
    issues,
    dependenciesInstalled: false,
    browserInstalled: false
  };
  await writeFile(path.join(artifactRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: 'passed', artifactRoot, health: [healthWarning.healthPressure, healthCritical.healthPressure, healthTerminal.healthPressure], stamina: [staminaLow.staminaPressure, staminaCritical.staminaPressure], drainSamples: drain.samples.length, issues }, null, 2));
} finally {
  await browser?.close();
  await runtime.stop();
}

async function preparePressureStage(page) {
  await page.evaluate(async () => {
    const [{ ComponentType }, { syncGameViews }] = await Promise.all([
      import('/src/constants/componentTypes.js'),
      import('/src/game/selectors.js')
    ]);
    const app = window.BSB_V2_DEMO;
    app.stop();
    app.state.game.unitSpawners = [];
    app.state.game.worldEvents.enabled = false;
    app.state.game.worldEvents.autoEnabled = false;
    for (const actor of app.state.game.actors) {
      const ai = app.state.game.world.components.get(ComponentType.EnemyPressureAI)?.get(actor.id);
      if (ai) ai.disabled = true;
    }
    syncGameViews(app.state.game, { camera: app.state.camera, map: app.state.map });
    app.renderer.render(app.state, 0);
  });
}

async function capture(page, fileName, fixture) {
  const state = await setBodyState(page, fixture);
  const screenshot = path.join(artifactRoot, fileName);
  await hideDiagnostics(page);
  await page.screenshot({ path: screenshot, animations: 'disabled' });
  return { ...state, screenshot };
}

async function setBodyState(page, fixture) {
  await page.evaluate(async ({ healthRatio, staminaRatio, staminaState, renderTime }) => {
    const [{ ComponentType }, { syncGameViews }] = await Promise.all([
      import('/src/constants/componentTypes.js'),
      import('/src/game/selectors.js')
    ]);
    const app = window.BSB_V2_DEMO;
    const world = app.state.game.world;
    const health = world.components.get(ComponentType.Health).get(app.state.game.dragonId);
    const stamina = world.components.get(ComponentType.Stamina).get(app.state.game.dragonId);
    const lifecycle = world.components.get(ComponentType.PlayerLifecycle).get(app.state.game.dragonId);
    Object.assign(health, { hp: health.maxHp * healthRatio, alive: healthRatio > 0, hitPulseRemainingMs: 0, recoveryDelayRemainingMs: 9000 });
    Object.assign(stamina, { current: stamina.max * staminaRatio, state: staminaState, exhausted: staminaState === 'exhausted', sprinting: false, recoveryTimer: 1 });
    Object.assign(lifecycle, { state: 'alive', stateElapsed: 0, controlSuppressed: false });
    app.state.time = renderTime;
    app.state.game.renderTime = renderTime;
    syncGameViews(app.state.game, { camera: app.state.camera, map: app.state.map });
    app.renderer.render(app.state, 0);
  }, fixture);
  await page.waitForTimeout(90);
  return page.evaluate(({ healthRatio, staminaRatio }) => {
    const app = window.BSB_V2_DEMO;
    const root = document.querySelector('[data-three-body-feedback]');
    const healthLayer = root.querySelector('.bsb-health-pressure');
    const staminaLayer = root.querySelector('.bsb-stamina-pressure');
    const diagnostics = app.state.game.renderLayers.renderer.webgl3dDiagnostics?.screen?.bodyState ?? {};
    return {
      active: getComputedStyle(root).display === 'block',
      healthRatio,
      staminaRatio,
      healthPressure: Number(root.dataset.healthPressure),
      staminaPressure: Number(root.dataset.staminaPressure),
      healthBand: root.dataset.healthBand,
      staminaBand: root.dataset.staminaBand,
      healthClearRadius: Number(root.dataset.healthClearRadius),
      staminaClearRadius: Number(root.dataset.staminaClearRadius),
      healthEdgeAlpha: Number(diagnostics.healthEdgeAlpha),
      healthBloodAlpha: Number(diagnostics.healthBloodAlpha),
      staminaAlpha: Number(diagnostics.staminaAlpha),
      staminaSaturation: Number(diagnostics.staminaSaturation),
      healthBackground: getComputedStyle(healthLayer).backgroundImage,
      staminaMask: getComputedStyle(staminaLayer).maskImage,
      staminaBackdropFilter: getComputedStyle(staminaLayer).backdropFilter
    };
  }, fixture);
}

async function proveLiveStaminaDrain(page) {
  await setBodyState(page, { healthRatio: 1, staminaRatio: 1, staminaState: 'ready', renderTime: 1 });
  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  const samples = [];
  for (let elapsedMs = 100; elapsedMs <= 2600; elapsedMs += 100) {
    await page.evaluate((ms) => window.advanceTime(ms), 100);
    const sample = await page.evaluate((atMs) => {
      const app = window.BSB_V2_DEMO;
      const stamina = app.state.game.world.components.get('Stamina').get(app.state.game.dragonId);
      const root = document.querySelector('[data-three-body-feedback]');
      return { atMs, ratio: stamina.current / stamina.max, pressure: Number(root.dataset.staminaPressure), clearRadius: Number(root.dataset.staminaClearRadius) };
    }, elapsedMs);
    samples.push(sample);
    if (sample.ratio <= .08) break;
  }
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  await hideDiagnostics(page);
  await page.screenshot({ path: path.join(artifactRoot, '08-live-sprint-exhaustion.png'), animations: 'disabled' });
  assert(samples.at(-1).pressure > samples[0].pressure + .4, 'sprint-driven pressure should rise materially across the full drain despite its authored breath pulse');
  assert(samples.at(-1).clearRadius < samples[0].clearRadius - 8, 'real sprint exhaustion should contract the clear peripheral radius materially');
  return { samples, screenshot: path.join(artifactRoot, '08-live-sprint-exhaustion.png') };
}

async function proveTerminalToDeath(page) {
  const preDeath = await setBodyState(page, { healthRatio: .1, staminaRatio: .12, staminaState: 'exhausted', renderTime: 2.2 });
  await page.evaluate(async () => {
    const { applyDamageToEntity } = await import('/src/systems/healthSystem.js');
    const app = window.BSB_V2_DEMO;
    const health = app.state.game.world.components.get('Health').get(app.state.game.dragonId);
    applyDamageToEntity(app.state.game.world, app.state.game.dragonId, health.hp + 1, null, 'pressure_curve_death_proof');
    window.advanceTime(240);
  });
  const lifecycleState = await page.evaluate(() => window.BSB_V2_DEMO.state.game.world.components.get('PlayerLifecycle').get(window.BSB_V2_DEMO.state.game.dragonId).state);
  const screenshot = path.join(artifactRoot, '09-death-mask-after-terminal-pressure.png');
  await hideDiagnostics(page);
  await page.screenshot({ path: screenshot, animations: 'disabled' });
  return { preDeath, lifecycleState, screenshot };
}

async function hideDiagnostics(page) {
  await page.evaluate(() => { const element = document.getElementById('bsb-three-diagnostics'); if (element) element.style.display = 'none'; });
}

function trackIssues(page) {
  page.on('console', (message) => { if (message.type() === 'error') issues.consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => issues.pageErrors.push(String(error.message || error)));
  page.on('requestfailed', (request) => issues.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));
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
    try { const response = await fetch(url); if (response.ok && (await response.text()).includes('Black Sky Bound v2 Demo')) return { url, stop: async () => { if (child.exitCode === null) child.kill(); } }; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error(`server_timeout:${output}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function launchBrowser() {
  try { return await chromium.launch({ channel: process.env.BSB_PLAYWRIGHT_CHANNEL || 'msedge', headless: true }); }
  catch { return chromium.launch({ headless: true }); }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
