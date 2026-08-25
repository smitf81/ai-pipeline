import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifactRoot = path.join(projectRoot, 'artifacts', 'webgl3d-foliage-pbr-v1');
await mkdir(artifactRoot, { recursive: true });
const server = await startRuntime();
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const issues = { consoleErrors: [], pageErrors: [], requestFailures: [] };
page.on('console', (message) => { if (message.type() === 'error') issues.consoleErrors.push(message.text()); });
page.on('pageerror', (error) => issues.pageErrors.push(error.message));
page.on('requestfailed', (request) => issues.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));

const captures = [];
try {
  for (const [index, lighting] of ['moon', 'torch-a', 'torch-b', 'lightning'].entries()) {
    captures.push(await capture(`${String(index + 1).padStart(2, '0')}-grove-${lighting}`, { lighting }, 3));
  }
  const isolated = [
    ['05-oak-roots-front', { lighting: 'studio', tree: 'ancient_oak', canopy: 0, framing: 'roots', angle: 'front' }],
    ['06-oak-roots-rear', { lighting: 'studio', tree: 'ancient_oak', canopy: 0, framing: 'roots', angle: 'rear' }],
    ['07-oak-roots-right', { lighting: 'studio', tree: 'ancient_oak', canopy: 0, framing: 'roots', angle: 'right' }],
    ['08-oak-roots-left', { lighting: 'studio', tree: 'ancient_oak', canopy: 0, framing: 'roots', angle: 'left' }],
    ['09-oak-full-three-quarter', { lighting: 'lightning', tree: 'ancient_oak', canopy: 0, framing: 'full', angle: 'three-quarter' }],
    ['10-oak-wireframe', { lighting: 'lightning', tree: 'ancient_oak', canopy: 0, framing: 'full', angle: 'three-quarter', treeView: 'wireframe' }],
    ['11-oak-normals', { lighting: 'lightning', tree: 'ancient_oak', canopy: 0, framing: 'full', angle: 'three-quarter', treeView: 'normals' }],
    ['12-oak-gameplay-canopy', { lighting: 'torch-b', tree: 'ancient_oak', canopy: 1, framing: 'gameplay', angle: 'three-quarter' }]
  ];
  for (const [name, params] of isolated) captures.push(await capture(name, params, 1));
  const barkVariants = [
    ['13-pine-bark-close', { lighting: 'studio', tree: 'old_pine', canopy: 0, framing: 'bark', angle: 'front' }],
    ['14-birch-bark-close', { lighting: 'studio', tree: 'silver_birch', canopy: 0, framing: 'bark', angle: 'front' }],
    ['15-oak-bark-close', { lighting: 'studio', tree: 'ancient_oak', canopy: 0, framing: 'bark', angle: 'front' }]
  ];
  for (const [name, params] of barkVariants) captures.push(await capture(name, params, 1));
  const foliageVariants = [
    ['16-pine-foliage-close', { lighting: 'studio', tree: 'old_pine', canopy: 1, framing: 'foliage', angle: 'front' }],
    ['17-birch-foliage-close', { lighting: 'studio', tree: 'silver_birch', canopy: 1, framing: 'foliage', angle: 'front' }],
    ['18-oak-foliage-close', { lighting: 'studio', tree: 'ancient_oak', canopy: 1, framing: 'foliage', angle: 'front' }]
  ];
  for (const [name, params] of foliageVariants) captures.push(await capture(name, params, 1));
  const rootViews = captures.slice(4, 8);
  if (rootViews.some(({ state }) => state.diagnostics.tree.boundaryEdges !== 0 || state.diagnostics.tree.nonManifoldEdges !== 0)) {
    throw new Error('tree_topology_invalid_in_browser');
  }
  if (issues.consoleErrors.length || issues.pageErrors.length || issues.requestFailures.length) {
    throw new Error(`browser_issues:${JSON.stringify(issues)}`);
  }
  const report = {
    contract: 'black-sky-bound.webgl3d-foliage-pbr.browser-proof.v1',
    generatedAt: new Date().toISOString(),
    captures,
    issues
  };
  await writeFile(path.join(artifactRoot, 'playtest-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: 'passed', artifactRoot, captures: captures.length, issues }, null, 2));
} finally {
  await browser.close();
  server.stop();
}

async function capture(name, values, expectedTreeCount) {
  const params = new URLSearchParams({ skipHatch: '1', renderer: 'webgl3d', reference: 'tree-grove', debug3d: '1' });
  for (const [key, value] of Object.entries(values)) params.set(key, String(value));
  const url = `${server.url}?${params}`;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dActive === true);
  await page.waitForFunction(() => window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dDiagnostics?.cache?.barkPbr?.status === 'ready');
  await page.waitForFunction(() => window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dDiagnostics?.cache?.foliagePbr?.status === 'ready');
  await page.evaluate(() => window.advanceTime?.(1000 / 60));
  await page.waitForTimeout(220);
  const state = await page.evaluate(() => {
    const renderer = window.BSB_V2_DEMO.state.game.renderLayers.renderer;
    return {
      activeBackend: renderer.activeBackend,
      backendStatus: renderer.backendStatus,
      reference: renderer.webgl3dReferenceScene,
      diagnostics: renderer.webgl3dDiagnostics,
      overlayVisible: getComputedStyle(document.getElementById('bsb-three-diagnostics')).display !== 'none'
    };
  });
  if (state.activeBackend !== 'webgl3d' || state.backendStatus !== 'active') throw new Error(`webgl3d_not_active:${name}`);
  if (state.diagnostics?.cache?.barkPbr?.loadedTextureCount !== 4 || state.diagnostics?.cache?.barkPbr?.errors?.length) {
    throw new Error(`bark_pbr_not_ready:${name}:${JSON.stringify(state.diagnostics?.cache?.barkPbr)}`);
  }
  if (state.diagnostics?.cache?.barkPbr?.textureSetCount !== 1) throw new Error(`bark_texture_set_duplicated:${name}`);
  if (state.diagnostics?.cache?.foliagePbr?.loadedTextureCount !== 4 || state.diagnostics?.cache?.foliagePbr?.errors?.length) {
    throw new Error(`foliage_pbr_not_ready:${name}:${JSON.stringify(state.diagnostics?.cache?.foliagePbr)}`);
  }
  if (state.diagnostics?.cache?.foliagePbr?.textureSetCount !== 1) throw new Error(`foliage_texture_set_duplicated:${name}`);
  if (state.diagnostics?.tree?.count !== expectedTreeCount) throw new Error(`tree_count_invalid:${name}:${state.diagnostics?.tree?.count}`);
  if (state.diagnostics?.triangles <= 0 || state.diagnostics?.calls <= 0) throw new Error(`render_geometry_missing:${name}`);
  const screenshot = path.join(artifactRoot, `${name}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  return { name, values, url, screenshot, state };
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
