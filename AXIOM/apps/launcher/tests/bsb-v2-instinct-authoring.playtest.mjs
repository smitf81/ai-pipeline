import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testRoot = dirname(fileURLToPath(import.meta.url));
const launcherRoot = resolve(testRoot, '..');
const workspaceRoot = resolve(launcherRoot, '..', '..', '..');
const bsbRoot = join(workspaceRoot, '_A_Projects', 'BLACK_SKY_BOUND_V2');
const requireFromBsb = createRequire(join(bsbRoot, 'package.json'));
const { chromium } = requireFromBsb('@playwright/test');
const artifactDir = join(launcherRoot, 'output', 'playwright', 'instinct-authoring');
const axiomUrl = process.env.AXIOM_PROOF_URL || 'http://127.0.0.1:3007/axiom-editor.html';
const issues = { consoleErrors: [], pageErrors: [], requestFailures: [], httpFailures: [] };
const evidence = {};

await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 980 }, deviceScaleFactor: 1 });
page.on('console', (message) => {
  if (message.type() === 'error') issues.consoleErrors.push(message.text());
});
page.on('pageerror', (error) => issues.pageErrors.push(error.message));
page.on('requestfailed', (request) => issues.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || 'request_failed'}`));
page.on('response', (response) => {
  if (response.status() >= 400) issues.httpFailures.push(`${response.status()} ${response.request().method()} ${response.url()}`);
});

try {
  await page.goto(axiomUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.EDITOR && window.FileManagerRuntime && window.BsbV2MapAuthoring);
  await page.evaluate(async () => {
    await window.FileManagerRuntime.loadProjectRoot('_A_Projects/BLACK_SKY_BOUND_V2', { sourceSurface: 'instinct_authoring_proof' });
    window.switchTab?.('bsb-map');
  });
  await page.waitForFunction(() => {
    const status = window.BsbV2MapAuthoring?.status?.();
    return status?.active && status?.document && status.mapLibrary?.maps?.length === 4;
  }, null, { timeout: 25_000 });

  evidence.firstRegion = await inspectRegion(page, 'first_flightless_night');
  assert.equal(evidence.firstRegion.regionTitle, 'First Flightless Night');
  assert.equal(evidence.firstRegion.checkboxCount, 5);
  assert.deepEqual(evidence.firstRegion.checkedLabels, []);
  await page.screenshot({ path: join(artifactDir, '01-first-flightless-night-instinct-controls.png'), fullPage: true });

  evidence.ashRegion = await inspectRegion(page, 'ash_road_threshold');
  assert.equal(evidence.ashRegion.regionTitle, 'Ash Road Threshold');
  assert.equal(evidence.ashRegion.checkboxCount, 5);
  assert.deepEqual(evidence.ashRegion.checkedLabels, ['Smoke Veil']);
  assert.deepEqual(evidence.ashRegion.availableInstinctIds, ['smoke_veil']);
  await page.screenshot({ path: join(artifactDir, '02-ash-threshold-smoke-baseline.png'), fullPage: true });

  const unexpectedIssues = classifyUnexpectedIssues(issues);
  assert.deepEqual(unexpectedIssues, { consoleErrors: [], pageErrors: [], requestFailures: [], httpFailures: [] });
  await writeFile(join(artifactDir, 'proof.json'), `${JSON.stringify({ ok: true, evidence, issues: { raw: issues, unexpected: unexpectedIssues } }, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, artifactDir, evidence, issues: unexpectedIssues }, null, 2));
} finally {
  await browser.close();
}

async function inspectRegion(target, catalogueMapId) {
  await target.evaluate((id) => window.BsbV2MapAuthoring.load(id), catalogueMapId);
  await target.waitForFunction((id) => {
    const status = window.BsbV2MapAuthoring.status();
    return status.activeCatalogueMapId === id && status.document && status.dirty === false;
  }, catalogueMapId, { timeout: 15_000 });
  await target.waitForFunction(() => document.querySelectorAll('.bsb-v2-instinct-authoring input[type="checkbox"]').length === 5);
  await target.evaluate(() => document.querySelector('.bsb-v2-instinct-authoring')?.scrollIntoView({ block: 'center' }));
  return target.evaluate(() => {
    const status = window.BsbV2MapAuthoring.status();
    const checkboxes = [...document.querySelectorAll('.bsb-v2-instinct-authoring input[type="checkbox"]')];
    return {
      catalogueMapId: status.activeCatalogueMapId,
      regionTitle: status.mapLibrary.maps.find((entry) => entry.id === status.activeCatalogueMapId)?.title ?? null,
      mapTitle: status.document.title,
      firstPlaythroughContract: status.document.firstPlaythrough.contract,
      availableInstinctIds: [...status.document.firstPlaythrough.availableInstinctIds],
      checkboxCount: checkboxes.length,
      checkedLabels: checkboxes
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => checkbox.closest('label')?.textContent?.trim() || '')
    };
  });
}

function classifyUnexpectedIssues(source) {
  return {
    consoleErrors: source.consoleErrors.filter((message) => !/^Failed to load resource: (?:net::ERR_CONNECTION_REFUSED|the server responded with a status of 500)/.test(message)),
    pageErrors: source.pageErrors,
    requestFailures: source.requestFailures.filter((message) => !/^GET http:\/\/localhost:1234\/v1\/models net::ERR_CONNECTION_REFUSED$/.test(message)),
    httpFailures: source.httpFailures.filter((message) => !/^500 POST http:\/\/127\.0\.0\.1:3007\/(?:mcp\/call|api\/project-diary\/events)$/.test(message))
  };
}
