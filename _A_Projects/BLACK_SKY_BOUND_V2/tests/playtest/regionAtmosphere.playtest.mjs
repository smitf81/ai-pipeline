import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifacts = path.join(root, 'artifacts', 'region-atmosphere-v1');
const maps = [
  ['axiom_first_escape', '/data/maps/axiom-first-escape.runtime-map.json'],
  ['axiom_second_approach', '/data/maps/axiom-second-approach.runtime-map.json'],
  ['axiom_crown_of_cinders', '/data/maps/axiom-crown-of-cinders.runtime-map.json'],
  ['axiom_ash_road_threshold_2', '/data/maps/axiom-ash-road-threshold-2.runtime-map.json']
];

await mkdir(artifacts, { recursive: true });
const runtime = await startRuntime();
const browser = await launchBrowser();
const issues = { consoleErrors: [], pageErrors: [], requestFailures: [] };
const enabledRegions = [];
let transitionedRegion = null;

try {
  for (let index = 0; index < maps.length; index += 1) {
    const [mapId, mapPath] = maps[index];
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    trackIssues(page);
    await openRegion(page, runtime.url, mapId, mapPath);
    const snapshot = await readSnapshot(page);
    assert.equal(snapshot.mapAtmosphere.rainAndSparksEnabled, true, `${mapId}: baked atmosphere should be enabled`);
    assert.equal(snapshot.runtimePolicy.enabled, true, `${mapId}: runtime atmosphere policy should be enabled`);
    assert.ok(snapshot.effects.rainStreaks >= 280, `${mapId}: Three.js rain should be rendered`);
    assert.ok(snapshot.effects.atmosphereSparks >= 1, `${mapId}: Three.js sparks should be rendered`);
    enabledRegions.push(snapshot);
    await page.screenshot({ path: path.join(artifacts, `${index + 1}-${mapId}-atmosphere-on.png`) });
    if (index === 0) {
      await page.evaluate(() => {
        const app = window.BSB_V2_DEMO;
        const zone = app.state.map.escapeZone;
        const transform = app.state.game.world.components.get('Transform').get(app.state.game.dragonId);
        transform.x = zone.x + 0.5;
        transform.y = zone.y + 0.5;
        window.advanceTime(17);
      });
      await page.waitForFunction(() => {
        const app = window.BSB_V2_DEMO;
        const effects = app?.state?.game?.renderLayers?.renderer?.webgl3dDiagnostics?.liveWorld?.effects;
        return app?.state?.runtimeMapLoad?.mapId === 'axiom_second_approach'
          && app.state.game.renderLayers.atmosphericOverlay?.enabled === true
          && effects?.rainStreaks >= 280
          && effects?.atmosphereSparks >= 1;
      }, null, { timeout: 30_000 });
      transitionedRegion = await readSnapshot(page);
      assert.equal(transitionedRegion.mapId, 'axiom_second_approach', 'escape/cutscene handoff should enter the authored next region');
      assert.equal(transitionedRegion.runtimePolicy.enabled, true, 'transition-created game state should reapply atmosphere policy');
      await page.screenshot({ path: path.join(artifacts, '1b-transition-entry-atmosphere-on.png') });
    }
    await page.close();
  }

  const disabledPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  trackIssues(disabledPage);
  const disabledPath = maps[2][1];
  const source = JSON.parse(await readFile(path.join(root, disabledPath.replace(/^\//, '').replaceAll('/', path.sep)), 'utf8'));
  await disabledPage.route(`**${disabledPath}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...source,
        atmosphere: { contract: 'black-sky-bound.region-atmosphere.v1', rainAndSparksEnabled: false }
      })
    });
  });
  await openRegion(disabledPage, runtime.url, maps[2][0], disabledPath, false);
  const disabledRegion = await readSnapshot(disabledPage);
  assert.equal(disabledRegion.mapAtmosphere.rainAndSparksEnabled, false, 'intercepted runtime map should carry the authored local disable');
  assert.equal(disabledRegion.runtimePolicy.enabled, false, 'runtime policy should apply the local disable');
  assert.equal(disabledRegion.effects.rainStreaks, 0, 'disabled region should render no rain');
  assert.equal(disabledRegion.effects.atmosphereSparks, 0, 'disabled region should render no sparks');
  await disabledPage.screenshot({ path: path.join(artifacts, '5-crown-of-cinders-atmosphere-disabled.png') });
  await disabledPage.close();

  const unexpectedIssues = {
    consoleErrors: issues.consoleErrors.filter((message) => !message.startsWith('[BSB audio]')),
    pageErrors: issues.pageErrors,
    requestFailures: issues.requestFailures.filter((message) => !/\/assets\/audio\/production\/.+ net::ERR_ABORTED$/.test(message))
  };
  assert.deepEqual(unexpectedIssues.consoleErrors, [], 'unexpected console errors');
  assert.deepEqual(unexpectedIssues.pageErrors, [], 'page errors');
  assert.deepEqual(unexpectedIssues.requestFailures, [], 'unexpected request failures');
  const report = {
    contract: 'black-sky-bound.region-atmosphere.browser-proof.v1',
    enabledRegions,
    transitionedRegion,
    disabledRegion,
    issues: { raw: issues, unexpected: unexpectedIssues }
  };
  const reportFile = path.join(artifacts, 'report.json');
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: 'passed', reportFile, enabledRegions, transitionedRegion, disabledRegion, issues: unexpectedIssues }, null, 2));
} finally {
  await browser.close();
  runtime.stop();
}

async function openRegion(page, origin, mapId, mapPath, waitForSparks = true) {
  const query = new URLSearchParams({ skipHatch: '1', mamaAuto: '0', renderer: 'webgl3d', map: mapPath, proof: `${mapId}-${Date.now()}` });
  await page.goto(`${origin}?${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction((expectedMapId) => {
    const app = window.BSB_V2_DEMO;
    return app?.state?.runtimeMapLoad?.mapId === expectedMapId
      && app.state.game?.renderLayers?.renderer?.webgl3dActive === true;
  }, mapId, { timeout: 30_000 });
  await page.waitForFunction((expectSparks) => {
    const effects = window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dDiagnostics?.liveWorld?.effects;
    if (!effects) return false;
    return expectSparks ? effects.rainStreaks >= 280 && effects.atmosphereSparks >= 1 : effects.rainStreaks === 0 && effects.atmosphereSparks === 0;
  }, waitForSparks, { timeout: 30_000 });
}

function readSnapshot(page) {
  return page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    return {
      mapId: app.state.runtimeMapLoad.mapId,
      path: app.state.runtimeMapLoad.path,
      mapAtmosphere: structuredClone(app.state.map.atmosphere),
      runtimePolicy: structuredClone(app.state.game.renderLayers.atmosphericOverlay),
      backend: app.state.game.renderLayers.renderer.activeBackend,
      webgl3dActive: app.state.game.renderLayers.renderer.webgl3dActive,
      effects: structuredClone(app.state.game.renderLayers.renderer.webgl3dDiagnostics.liveWorld.effects)
    };
  });
}

function trackIssues(page) {
  page.on('console', (message) => { if (message.type() === 'error') issues.consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => issues.pageErrors.push(error.message));
  page.on('requestfailed', (request) => issues.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));
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
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolvePort(address.port));
    });
  });
}

async function launchBrowser() {
  try { return await chromium.launch({ channel: process.env.BSB_PLAYWRIGHT_CHANNEL || 'msedge', headless: true }); }
  catch { return chromium.launch({ headless: true }); }
}
