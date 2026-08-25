import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testRoot = dirname(fileURLToPath(import.meta.url));
const launcherRoot = resolve(testRoot, '..');
const workspaceRoot = resolve(launcherRoot, '..', '..', '..');
const bsbRoot = join(workspaceRoot, '_A_Projects', 'BLACK_SKY_BOUND_V2');
const requireFromBsb = createRequire(join(bsbRoot, 'package.json'));
const { chromium } = requireFromBsb('@playwright/test');
const artifactDir = join(launcherRoot, 'output', 'playwright', 'atmosphere-authoring');
const issues = { consoleErrors: [], pageErrors: [], requestFailures: [], httpFailures: [] };

await mkdir(artifactDir, { recursive: true });
const runtime = await startAxiom();
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1600, height: 980 }, deviceScaleFactor: 1 });
trackIssues(page);

try {
  await page.goto(`${runtime.url}/axiom-editor.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.EDITOR && window.FileManagerRuntime && window.BsbV2MapAuthoring);
  await page.evaluate(async () => {
    await window.FileManagerRuntime.loadProjectRoot('_A_Projects/BLACK_SKY_BOUND_V2', { sourceSurface: 'atmosphere_authoring_proof' });
    window.switchTab?.('bsb-map');
  });
  await page.waitForFunction(() => {
    const status = window.BsbV2MapAuthoring?.status?.();
    return status?.active && status?.document && status.mapLibrary?.maps?.length === 4;
  }, null, { timeout: 25_000 });

  const regionIds = ['first_flightless_night', 'ash_road_threshold', 'crown_of_cinders_demo', 'ash_road_threshold_2'];
  const regions = [];
  for (const regionId of regionIds) regions.push(await inspectRegion(page, regionId));
  assert.equal(regions.every((entry) => entry.checked && entry.rainAndSparksEnabled), true, 'all current regions should expose atmosphere enabled by default');

  await page.evaluate(() => document.querySelector('.bsb-v2-atmosphere-authoring')?.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: join(artifactDir, '01-default-on-current-region.png'), fullPage: true });

  const revisionBefore = await page.evaluate(() => window.BsbV2MapAuthoring.status().document.revision);
  await page.locator('.bsb-v2-atmosphere-authoring input[type="checkbox"]').uncheck();
  await page.waitForFunction((revision) => {
    const status = window.BsbV2MapAuthoring.status();
    return status.document.revision === revision + 1
      && status.document.atmosphere.rainAndSparksEnabled === false
      && status.dirty === true;
  }, revisionBefore);
  const locallyDisabled = await inspectCurrent(page);
  assert.equal(locallyDisabled.checked, false);
  assert.equal(locallyDisabled.rainAndSparksEnabled, false);
  assert.match(locallyDisabled.summary, /disabled/i);
  await page.screenshot({ path: join(artifactDir, '02-local-disable-unsaved.png'), fullPage: true });

  const unexpected = classifyUnexpectedIssues(issues);
  assert.deepEqual(unexpected, { consoleErrors: [], pageErrors: [], requestFailures: [], httpFailures: [] });
  const report = {
    contract: 'axiom.bsb-region-atmosphere-authoring.browser-proof.v1',
    regions,
    locallyDisabled,
    issues: { raw: issues, unexpected }
  };
  const reportFile = join(artifactDir, 'report.json');
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: 'passed', reportFile, regions, locallyDisabled, issues: unexpected }, null, 2));
} finally {
  await browser.close();
  runtime.stop();
}

async function inspectRegion(target, catalogueMapId) {
  await target.evaluate((id) => window.BsbV2MapAuthoring.load(id), catalogueMapId);
  await target.waitForFunction((id) => {
    const status = window.BsbV2MapAuthoring.status();
    return status.activeCatalogueMapId === id && status.document && status.dirty === false;
  }, catalogueMapId, { timeout: 15_000 });
  await target.waitForFunction(() => document.querySelectorAll('.bsb-v2-atmosphere-authoring input[type="checkbox"]').length === 1);
  return inspectCurrent(target);
}

function inspectCurrent(target) {
  return target.evaluate(() => {
    const status = window.BsbV2MapAuthoring.status();
    const checkbox = document.querySelector('.bsb-v2-atmosphere-authoring input[type="checkbox"]');
    return {
      catalogueMapId: status.activeCatalogueMapId,
      mapId: status.document.mapId,
      title: status.document.title,
      contract: status.document.atmosphere.contract,
      rainAndSparksEnabled: status.document.atmosphere.rainAndSparksEnabled,
      checked: checkbox?.checked === true,
      summary: document.querySelector('.bsb-v2-atmosphere-authoring summary')?.textContent?.trim() ?? ''
    };
  });
}

function trackIssues(target) {
  target.on('console', (message) => { if (message.type() === 'error') issues.consoleErrors.push(message.text()); });
  target.on('pageerror', (error) => issues.pageErrors.push(error.message));
  target.on('requestfailed', (request) => issues.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || 'request_failed'}`));
  target.on('response', (response) => { if (response.status() >= 400) issues.httpFailures.push(`${response.status()} ${response.request().method()} ${response.url()}`); });
}

function classifyUnexpectedIssues(source) {
  return {
    consoleErrors: source.consoleErrors.filter((message) => !/^Failed to load resource: (?:net::ERR_CONNECTION_REFUSED|the server responded with a status of 500)/.test(message)),
    pageErrors: source.pageErrors,
    requestFailures: source.requestFailures.filter((message) => !/^GET http:\/\/localhost:1234\/v1\/models net::ERR_CONNECTION_REFUSED$/.test(message)),
    httpFailures: source.httpFailures.filter((message) => !/^500 POST http:\/\/127\.0\.0\.1:\d+\/(?:mcp\/call|api\/project-diary\/events)$/.test(message))
  };
}

async function startAxiom() {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: launcherRoot,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`axiom_server_exited:${child.exitCode}:${output}`);
    try {
      const response = await fetch(`${url}/axiom-editor.html`);
      if (response.ok) return { url, stop: () => child.kill() };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error(`axiom_server_timeout:${output}`);
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
