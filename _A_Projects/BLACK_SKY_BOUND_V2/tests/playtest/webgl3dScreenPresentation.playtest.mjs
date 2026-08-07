import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifactRoot = path.join(projectRoot, 'artifacts', 'webgl3d-screen-presentation-v1');
await mkdir(artifactRoot, { recursive: true });
const server = await startRuntime();
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const issues = { consoleErrors: [], pageErrors: [], requestFailures: [] };
page.on('console', (message) => { if (message.type() === 'error') issues.consoleErrors.push(message.text()); });
page.on('pageerror', (error) => issues.pageErrors.push(error.message));
page.on('requestfailed', (request) => issues.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));

try {
  const tutorial = await proveTutorial(page, server.url);
  const arena = await proveArena(page, server.url);
  if (issues.consoleErrors.length || issues.pageErrors.length || issues.requestFailures.length) {
    throw new Error(`screen_presentation_browser_issues:${JSON.stringify(issues)}`);
  }
  const report = {
    contract: 'black-sky-bound.webgl3d-screen-presentation.browser-proof.v1',
    generatedAt: new Date().toISOString(),
    tutorial,
    arena,
    issues
  };
  await writeFile(path.join(artifactRoot, 'playtest-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: 'passed', artifactRoot, tutorial, arena, issues }, null, 2));
} finally {
  await browser.close();
  server.stop();
}

async function proveTutorial(page, baseUrl) {
  await page.goto(`${baseUrl}?skipHatch=1&renderer=webgl3d&mamaAuto=0`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dActive === true);
  await page.evaluate(() => { window.BSB_V2_DEMO.stop(); window.advanceTime(900); });
  const layer = page.locator('[data-three-tutorial]');
  await layer.waitFor({ state: 'visible' });
  const view = await layer.evaluate((element) => ({
    title: element.querySelector('.bsb-cue-title')?.textContent?.trim() ?? '',
    keyLabels: [...element.querySelectorAll('.bsb-keycap')].map((entry) => entry.textContent.trim()),
    cueId: element.querySelector('[data-cue-id]')?.dataset.cueId ?? null,
    opacity: Number(getComputedStyle(element).opacity)
  }));
  if (view.title !== 'MOVE' || view.keyLabels.join('') !== 'WASD' || view.opacity <= 0) {
    throw new Error(`three_tutorial_visual_invalid:${JSON.stringify(view)}`);
  }
  const diagnostics = readScreenDiagnostics(page);
  const screenshot = path.join(artifactRoot, '01-movement-tutorial.png');
  await page.screenshot({ path: screenshot });
  return { ...view, diagnostics: await diagnostics, screenshot };
}

async function proveArena(page, baseUrl) {
  const map = encodeURIComponent('/data/maps/axiom-crown-of-cinders.runtime-map.json');
  await page.goto(`${baseUrl}?skipHatch=1&renderer=webgl3d&mamaAuto=0&map=${map}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.BSB_V2_DEMO?.state?.map?.id === 'axiom_crown_of_cinders');
  await page.evaluate(() => {
    window.BSB_V2_DEMO.stop();
    window.BSB_V2_DEMO.state.playerProfile.settings.tutorialPrompts = false;
    window.advanceTime(20);
  });
  const banner = page.locator('[data-three-arena-banner]');
  await banner.waitFor({ state: 'visible' });
  await page.waitForTimeout(240);
  const countdown = await readBanner(banner);
  if (!countdown.title.includes('CROWN OF CINDERS')) throw new Error(`three_arena_countdown_invalid:${JSON.stringify(countdown)}`);
  const countdownScreenshot = path.join(artifactRoot, '02-arena-countdown.png');
  await page.screenshot({ path: countdownScreenshot });

  await page.evaluate(() => {
    window.advanceTime(2600);
    for (const spawner of window.BSB_V2_DEMO.state.game.unitSpawners) {
      spawner.spawnedCount = spawner.limit;
      spawner.spawnedEntityIds = [];
      spawner.destroyed = true;
    }
    window.advanceTime(20);
  });
  await page.waitForFunction(() => document.querySelector('[data-three-arena-banner]')?.textContent?.includes('DODGE'));
  await page.waitForTimeout(240);
  const instinct = await readBanner(banner);
  if (instinct.eyebrow !== 'NEW INSTINCT' || !instinct.title.includes('DODGE')) {
    throw new Error(`three_instinct_unlock_invalid:${JSON.stringify(instinct)}`);
  }
  const diagnostics = await readScreenDiagnostics(page);
  if (diagnostics?.arena?.kind !== 'instinct_unlock') throw new Error(`three_arena_diagnostics_invalid:${JSON.stringify(diagnostics?.arena)}`);
  const instinctScreenshot = path.join(artifactRoot, '03-instinct-awakened.png');
  await page.screenshot({ path: instinctScreenshot });
  return { countdown: { ...countdown, screenshot: countdownScreenshot }, instinct: { ...instinct, screenshot: instinctScreenshot }, diagnostics };
}

function readBanner(locator) {
  return locator.evaluate((element) => ({
    eyebrow: element.querySelector('.bsb-arena-eyebrow')?.textContent?.trim() ?? '',
    title: element.querySelector('.bsb-arena-title')?.textContent?.trim() ?? '',
    detail: element.querySelector('.bsb-arena-detail')?.textContent?.trim() ?? '',
    kind: element.querySelector('[data-arena-banner-kind]')?.dataset.arenaBannerKind ?? null
  }));
}

function readScreenDiagnostics(page) {
  return page.evaluate(() => window.BSB_V2_DEMO.state.game.renderLayers.renderer.webgl3dDiagnostics?.screen ?? null);
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
