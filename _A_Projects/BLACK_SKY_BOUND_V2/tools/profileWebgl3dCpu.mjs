import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'artifacts', 'webgl3d-cpu-profile-v1');
await mkdir(artifacts, { recursive: true });
const runtime = await startRuntime();
const browser = await launchBrowser();

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${runtime.url}?skipHatch=1&mamaAuto=0&renderer=webgl3d&gpuTiming=1`, { waitUntil: 'networkidle', timeout: 20_000 });
  await page.waitForFunction(() => window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dDiagnostics?.frameTiming?.warmedUp === true, null, { timeout: 15_000 });
  await page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    app.worldEvents.setAutoEnabled(false);
    app.worldEvents.inferno({ lightningSync: true });
    app.state.game.renderLayers.atmosphericOverlay = {
      ...(app.state.game.renderLayers.atmosphericOverlay ?? {}),
      enabled: true,
      rainEnabled: true,
      rainDensity: 1,
      overlayOpacity: 0.9,
      emitterReactiveOverlayEnabled: true
    };
  });
  await page.waitForTimeout(5200);

  const session = await context.newCDPSession(page);
  await session.send('Profiler.enable');
  await session.send('Profiler.setSamplingInterval', { interval: 100 });
  await session.send('Profiler.start');
  await page.waitForTimeout(8000);
  const { profile } = await session.send('Profiler.stop');
  const diagnostics = await page.evaluate(() => window.BSB_V2_DEMO.state.game.renderLayers.renderer.webgl3dDiagnostics);
  const summary = summarize(profile);
  await writeFile(path.join(artifacts, 'profile.json'), `${JSON.stringify(profile)}\n`, 'utf8');
  await writeFile(path.join(artifacts, 'summary.json'), `${JSON.stringify({ diagnostics, summary }, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ diagnostics: diagnostics.frameTiming.p95, top: summary.slice(0, 40) }, null, 2));
  await context.close();
} finally {
  await browser.close();
  runtime.stop();
}

function summarize(profile) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const totals = new Map();
  for (let index = 0; index < (profile.samples?.length ?? 0); index += 1) {
    const node = nodes.get(profile.samples[index]);
    if (!node) continue;
    const frame = node.callFrame;
    const key = `${frame.functionName || '(anonymous)'}|${frame.url}|${frame.lineNumber + 1}`;
    const item = totals.get(key) ?? {
      functionName: frame.functionName || '(anonymous)',
      url: frame.url,
      line: frame.lineNumber + 1,
      selfMs: 0,
      samples: 0
    };
    item.selfMs += Number(profile.timeDeltas?.[index] ?? 0) / 1000;
    item.samples += 1;
    totals.set(key, item);
  }
  return [...totals.values()].sort((a, b) => b.selfMs - a.selfMs);
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
  try {
    return await chromium.launch({ channel: process.env.BSB_PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}
