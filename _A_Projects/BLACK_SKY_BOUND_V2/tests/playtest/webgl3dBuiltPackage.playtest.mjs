import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifacts = path.join(root, 'artifacts', 'webgl3d-built-package-v1');
await mkdir(artifacts, { recursive: true });
const runtime = await startBuiltRuntime();
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const issues = { consoleErrors: [], pageErrors: [], requestFailures: [], httpErrors: [] };
page.on('console', (message) => { if (message.type() === 'error') issues.consoleErrors.push(message.text()); });
page.on('pageerror', (error) => issues.pageErrors.push(error.message));
page.on('requestfailed', (request) => issues.requestFailures.push(`${request.url()} ${request.failure()?.errorText ?? ''}`));
page.on('response', (response) => { if (response.status() >= 400) issues.httpErrors.push(`${response.status()} ${response.url()}`); });

try {
  await page.goto(`${runtime.url}/play/?skipHatch=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dActive === true);
  const before = await player(page);
  await page.keyboard.down('w');
  await page.waitForTimeout(280);
  await page.keyboard.up('w');
  await page.waitForTimeout(100);
  const after = await player(page);
  await page.evaluate(() => window.advanceTime(2800));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.BSB_V2_DEMO.state.paused === true);
  const state = await page.evaluate(() => ({
    backend: window.BSB_V2_DEMO.state.game.renderLayers.renderer.activeBackend,
    arena: JSON.parse(window.render_game_to_text()).arena,
    diagnostics: window.BSB_V2_DEMO.state.game.renderLayers.renderer.webgl3dDiagnostics,
    requests: performance.getEntriesByType('resource').map((entry) => entry.name)
  }));
  const rawSourceStatus = (await fetch(`${runtime.url}/play/src/app.js`)).status;
  if (!(after.x < before.x && after.y < before.y)) throw new Error('built_screen_relative_input_failed');
  if (state.backend !== 'webgl3d') throw new Error(`built_backend_wrong:${state.backend}`);
  if (state.arena?.activeWaveId !== 'first_blood') throw new Error(`built_arena_wave_missing:${state.arena?.activeWaveId}`);
  if ((state.diagnostics?.liveWorld?.terrainTiles ?? 0) <= 0) throw new Error('built_live_world_missing');
  if (state.diagnostics?.liveWorld?.effects?.mamaFlyoverAsset?.status !== 'ready') throw new Error('built_mama_flyover_asset_not_ready');
  if (!state.requests.some((url) => /dragon_main_march_v5_flyover.*\.glb/i.test(url))) throw new Error('built_mama_flyover_asset_not_requested');
  if (state.requests.some((url) => /node_modules|three\.module/i.test(url))) throw new Error('built_runtime_requested_node_modules');
  if (rawSourceStatus !== 404) throw new Error(`built_raw_source_exposed:${rawSourceStatus}`);
  if (issues.consoleErrors.length || issues.pageErrors.length || issues.requestFailures.length || issues.httpErrors.length) throw new Error(`built_browser_issues:${JSON.stringify(issues)}`);
  const screenshot = path.join(artifacts, '01-built-arena-paused.png');
  await page.screenshot({ path: screenshot });
  const report = { contract: 'black-sky-bound.webgl3d-built-package-proof.v1', before, after, state, rawSourceStatus, screenshot, issues };
  await writeFile(path.join(artifacts, 'playtest-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: 'passed', before, after, calls: state.diagnostics.calls, triangles: state.diagnostics.triangles, rawSourceStatus, issues }, null, 2));
} finally {
  await browser.close();
  runtime.stop();
}

function player(page) {
  return page.evaluate(() => {
    const actor = window.BSB_V2_DEMO.state.game.actors.find((entry) => entry.team === 'player' && entry.alive);
    return { x: actor.x, y: actor.y };
  });
}

async function startBuiltRuntime() {
  const port = await freePort();
  const child = spawn(process.execPath, ['tools/launchBuiltPlaytest.mjs', String(port)], { cwd: root, env: { ...process.env, BSB_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`built_server_exited:${child.exitCode}:${output}`);
    try { const response = await fetch(`${url}/play/`); if (response.ok) return { url, stop: () => child.kill() }; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error(`built_server_timeout:${output}`);
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
