import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const embodiment = 'surface-v2-production';
const expectedContract = 'black-sky-bound.procedural-wyvern-mesh-recipe.v2';
const query = '';
const artifactRoot = path.join(projectRoot, 'artifacts', `webgl3d-opening-wyvern-${embodiment}`);
await mkdir(artifactRoot, { recursive: true });
const server = await startRuntime();
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const issues = { consoleErrors: [], pageErrors: [], requestFailures: [] };
page.on('console', (message) => { if (message.type() === 'error') issues.consoleErrors.push(message.text()); });
page.on('pageerror', (error) => issues.pageErrors.push(error.message));
page.on('requestfailed', (request) => issues.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));

try {
  await page.goto(`${server.url}?renderer=webgl3d&debug3d=1&gpuTiming=1${query}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dActive === true);
  await page.waitForFunction((contract) => window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dDiagnostics?.liveWorld?.actors?.wyvernContract === contract, expectedContract);
  await page.evaluate(() => window.BSB_V2_DEMO.stop());
  const phases = [
    ['inside', { phase: 'inside_egg', crackStage: 0, openingProgress: 0, emergenceProgress: 0, settleProgress: 0, egressProgress: 0, released: false }],
    ['cracked', { phase: 'cracking', crackStage: 4, openingProgress: 0, emergenceProgress: 0, settleProgress: 0, egressProgress: 0, lightPulse: 1, released: false }],
    ['half-open', { phase: 'opening', crackStage: 6, openingProgress: 0.5, emergenceProgress: 0, settleProgress: 0, egressProgress: 0, lightPulse: 0.7, released: false }],
    ['emerging', { phase: 'emerging', crackStage: 6, openingProgress: 1, emergenceProgress: 0.55, settleProgress: 0, egressProgress: 0.45, released: false }],
    ['released', { phase: 'released', crackStage: 6, openingProgress: 1, emergenceProgress: 1, settleProgress: 1, egressProgress: 1, released: true }]
  ];
  const captures = [];
  for (let index = 0; index < phases.length; index += 1) {
    const [name, state] = phases[index];
    const runtime = await page.evaluate((openingState) => {
      const app = window.BSB_V2_DEMO;
      Object.assign(app.state.opening, openingState);
      app.renderer.render(app.state);
      const diagnostics = app.state.game.renderLayers.renderer.webgl3dDiagnostics;
      return {
        opening: diagnostics.liveWorld?.opening,
        actors: diagnostics.liveWorld?.actors,
        effects: diagnostics.liveWorld?.effects,
        projection: diagnostics.projection,
        screenActive: getComputedStyle(document.querySelector('[data-opening-interior]')).display !== 'none'
      };
    }, state);
    const screenshot = path.join(artifactRoot, `${String(index + 1).padStart(2, '0')}-${name}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    captures.push({ name, runtime, screenshot });
  }
  const halfOpen = captures.find((capture) => capture.name === 'half-open');
  const emerging = captures.find((capture) => capture.name === 'emerging');
  if (!captures[0].runtime.screenActive || !captures[1].runtime.screenActive) throw new Error('opening_interior_not_visible');
  if ((halfOpen.runtime.opening?.shellPieces ?? 0) < 8) throw new Error(`opening_shell_pieces_missing:${JSON.stringify(halfOpen.runtime.opening)}`);
  if ((emerging.runtime.actors?.wyvernMeshCount ?? Infinity) > 10
    || emerging.runtime.actors?.wyvernContract !== expectedContract
    || (emerging.runtime.actors?.membraneCount ?? 0) !== 2
    || (emerging.runtime.actors?.wyvernPoseUpdateCount ?? 0) < 1) {
    throw new Error(`procedural_wyvern_missing:${JSON.stringify(emerging.runtime.actors)}`);
  }
  if (captures.at(-1).runtime.screenActive) throw new Error('opening_interior_did_not_release');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.BSB_V2_DEMO?.state?.opening?.phase === 'inside_egg');
  await page.evaluate(() => { window.BSB_V2_DEMO.stop(); window.advanceTime(950); });
  const acceptedStages = [];
  for (const key of ['w', 'a', 's', 'd', 'w', 'a']) {
    await page.keyboard.press(key);
    acceptedStages.push(await page.evaluate(() => {
      window.advanceTime(20);
      const count = window.BSB_V2_DEMO.state.opening.acceptedInputCount;
      window.advanceTime(620);
      return count;
    }));
  }
  const actualFlow = await page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    const before = { x: app.state.game.actors.find((actor) => actor.team === 'player')?.x, y: app.state.game.actors.find((actor) => actor.team === 'player')?.y };
    window.advanceTime(10_250);
    app.renderer.render(app.state);
    const actor = app.state.game.actors.find((entry) => entry.team === 'player');
    return {
      acceptedInputCount: app.state.opening.acceptedInputCount,
      requiredInputCount: app.state.opening.requiredInputCount,
      phase: app.state.opening.phase,
      released: app.state.opening.released,
      releaseCount: app.state.opening.diagnostics.releaseCount,
      before,
      after: { x: actor?.x, y: actor?.y },
      screenActive: getComputedStyle(document.querySelector('[data-opening-interior]')).display !== 'none',
      openingWorld: app.state.game.renderLayers.renderer.webgl3dDiagnostics.liveWorld.opening
    };
  });
  if (acceptedStages.join(',') !== '1,2,3,4,5,6') throw new Error(`opening_input_edges_wrong:${acceptedStages.join(',')}`);
  if (!actualFlow.released || actualFlow.phase !== 'released' || actualFlow.releaseCount !== 1) throw new Error(`opening_real_flow_did_not_release:${JSON.stringify(actualFlow)}`);
  if (actualFlow.screenActive || (actualFlow.openingWorld?.shellPieces ?? 0) < 8) throw new Error(`opening_release_visual_state_wrong:${JSON.stringify(actualFlow)}`);
  const actualFlowScreenshot = path.join(artifactRoot, '06-actual-flow-released.png');
  await page.screenshot({ path: actualFlowScreenshot, fullPage: true });
  if (issues.consoleErrors.length || issues.pageErrors.length || issues.requestFailures.length) throw new Error(`browser_issues:${JSON.stringify(issues)}`);
  const report = { contract: 'black-sky-bound.webgl3d-opening-wyvern.browser-proof.v1', embodiment, rendererContract: expectedContract, url: server.url, captures, actualFlow: { acceptedStages, ...actualFlow, screenshot: actualFlowScreenshot }, issues };
  await writeFile(path.join(artifactRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: 'passed', artifactRoot, captures: captures.map(({ name, runtime, screenshot }) => ({ name, runtime, screenshot })), issues }, null, 2));
} finally {
  await browser.close();
  server.stop();
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
