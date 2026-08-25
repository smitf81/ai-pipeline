import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const launcherRoot = resolve(__dirname, '..');
const workspaceRoot = resolve(launcherRoot, '..', '..', '..');
const requireFromBsb = createRequire(join(workspaceRoot, '_A_Projects', 'BLACK_SKY_BOUND_V2', 'package.json'));
const { chromium } = requireFromBsb('@playwright/test');
const outDir = join(launcherRoot, 'output', 'playwright', 'foliage-recovery');
const authoringScreenshot = join(outDir, 'opening-route-authoring.png');
const runtimeScreenshot = join(outDir, 'opening-route-baked-runtime.png');
const proofFile = join(outDir, 'opening-route-authoring-proof.json');
const axiomUrl = process.env.AXIOM_PROOF_URL || 'http://localhost:3007/axiom-editor.html';
const centers = [{ x: 32, y: 52 }, { x: 48, y: 52 }, { x: 30, y: 47 }, { x: 48, y: 46 }, { x: 29, y: 41 }, { x: 46, y: 40 }, { x: 28, y: 35 }, { x: 44, y: 34 }];
const config = { radiusTiles: 2, falloff: 0.65, density: 0.48, seed: 260811, speciesMix: { wood_fern: 0.42, forest_shrub: 0.48, ember_bramble: 0.1 } };
const expectedSpecies = { wood_fern: 10, forest_shrub: 9, ember_bramble: 2 };
let priorProof = null;
try { priorProof = JSON.parse(await readFile(proofFile, 'utf8')); } catch {}

await mkdir(outDir, { recursive: true });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1680, height: 980 }, deviceScaleFactor: 1 });
const consoleIssues = [];
const pageErrors = [];
const requestFailures = [];
const httpErrors = [];
page.on('console', (message) => { if (['error', 'warning'].includes(message.type()) && !expectedConsoleIssue(message)) consoleIssues.push({ type: message.type(), text: message.text() }); });
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('requestfailed', (request) => { if (!expectedRequestFailure(request)) requestFailures.push({ url: request.url(), error: request.failure()?.errorText ?? 'request_failed' }); });
page.on('response', (response) => { if (response.status() >= 400 && !expectedHttpError(response)) httpErrors.push({ url: response.url(), status: response.status() }); });

let proof;
try {
  await page.goto(axiomUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.EDITOR && window.FileManagerRuntime && window.BsbV2MapAuthoring);
  await page.evaluate(async () => {
    await window.FileManagerRuntime.loadProjectRoot('_A_Projects/BLACK_SKY_BOUND_V2', { sourceSurface: 'foliage_recovery_authoring' });
    window.switchTab?.('bsb-map');
  });
  await page.waitForFunction(() => {
    const status = window.BsbV2MapAuthoring?.status?.();
    return status?.active && status?.document?.mapId === 'axiom_first_escape' && ['saved', 'new draft'].includes(status.status);
  }, null, { timeout: 25000 });

  const transaction = await page.evaluate(({ centers, config, expectedSpecies }) => {
    const status = window.BsbV2MapAuthoring.status();
    const before = { revision: status.document.revision, objectCount: status.document.sceneObjects.length };
    const existing = status.document.sceneObjects.filter((record) => record.id?.startsWith('undergrowth:brush:260811:'));
    const existingSpecies = existing.reduce((counts, record) => {
      const species = record.undergrowth?.species;
      if (species) counts[species] = (counts[species] ?? 0) + 1;
      return counts;
    }, {});
    if (existing.length === 21 && Object.entries(expectedSpecies).every(([species, count]) => existingSpecies[species] === count)) {
      return { before, skippedCommit: true, existingSpecies, createdIds: existing.map((record) => record.id), receipt: null, preview: null };
    }
    const preview = window.EDITOR.procedural.undergrowth.brush.preview(centers, config);
    const previewSpecies = preview.candidates.reduce((counts, candidate) => {
      counts[candidate.species] = (counts[candidate.species] ?? 0) + 1;
      return counts;
    }, {});
    if (preview.candidates.length !== 21 || !Object.entries(expectedSpecies).every(([species, count]) => previewSpecies[species] === count)) {
      throw new Error(`foliage_recovery_preview_mismatch:${JSON.stringify({ revision: before.revision, count: preview.candidates.length, previewSpecies })}`);
    }
    const receipt = window.EDITOR.procedural.undergrowth.brush.commit(preview);
    return {
      before,
      skippedCommit: false,
      existingSpecies,
      preview: { contract: preview.contract, sourceRevision: preview.sourceRevision, count: preview.candidates.length, species: previewSpecies, diagnostics: preview.diagnostics, centers: preview.strokeCenters, config: preview.config },
      receipt
    };
  }, { centers, config, expectedSpecies });

  await page.screenshot({ path: authoringScreenshot, fullPage: true });
  const afterCommit = await page.evaluate(() => {
    const status = window.BsbV2MapAuthoring.status();
    return { revision: status.document.revision, objectCount: status.document.sceneObjects.length, dirty: status.dirty };
  });
  if (afterCommit.dirty) {
    await page.getByRole('button', { name: 'Save Source' }).click();
    await page.waitForFunction(() => {
      const status = window.BsbV2MapAuthoring.status();
      return status.status === 'saved' && status.dirty === false && status.saveReceipt?.afterHash;
    }, null, { timeout: 15000 });
  }
  await page.getByRole('button', { name: 'Bake & Preview' }).click();
  await page.waitForFunction(() => {
    const status = window.BsbV2MapAuthoring.status();
    return status.status === 'runtime ready' && status.view === 'runtime' && status.bakeReceipt?.afterHash;
  }, null, { timeout: 20000 });
  const runtimeFrame = await waitForRuntimeFrame(page);
  await runtimeFrame.waitForFunction(() => window.BSB_V2_DEMO && window.render_game_to_text, null, { timeout: 20000 });
  await runtimeFrame.waitForTimeout(500);
  const runtimeText = await runtimeFrame.evaluate(() => JSON.parse(window.render_game_to_text()));
  await page.screenshot({ path: runtimeScreenshot, fullPage: true });
  const finalStatus = await page.evaluate(() => window.BsbV2MapAuthoring.status());
  proof = {
    contract: 'black-sky-bound.foliage-recovery-authoring-proof.v1',
    transaction,
    authoring: {
      revision: finalStatus.document.revision,
      objectCount: finalStatus.document.sceneObjects.length,
      species: finalStatus.document.sceneObjects.reduce((counts, record) => {
        const species = record.undergrowth?.species;
        if (species) counts[species] = (counts[species] ?? 0) + 1;
        return counts;
      }, {}),
      saveReceipt: finalStatus.saveReceipt ?? priorProof?.authoring?.saveReceipt ?? null,
      bakeReceipt: finalStatus.bakeReceipt
    },
    runtime: {
      url: runtimeFrame.url(),
      revision: runtimeText.runtimeMap?.revision,
      objectCount: runtimeText.sceneObjects?.length,
      normalShrubCount: runtimeText.sceneObjects?.filter((object) => object.type === 'forest_shrub').length,
      rendererActiveBackend: runtimeText.renderLayerStats?.rendererActiveBackend
    },
    screenshots: { authoringScreenshot, runtimeScreenshot },
    browser: { consoleIssues, pageErrors, requestFailures, httpErrors }
  };
  await writeFile(proofFile, `${JSON.stringify(proof, null, 2)}\n`);
} finally {
  await browser.close();
}

const sourceDocument = JSON.parse(await readFile(join(launcherRoot, 'data', 'bsb-v2', 'maps', 'first_escape.authoring.json'), 'utf8'));
const runtimeDocument = JSON.parse(await readFile(join(workspaceRoot, '_A_Projects', 'BLACK_SKY_BOUND_V2', 'data', 'maps', 'axiom-first-escape.runtime-map.json'), 'utf8'));
if (proof.authoring.revision !== 2528 || sourceDocument.revision !== 2528 || proof.authoring.objectCount !== 314 || sourceDocument.sceneObjects.length !== 314) throw new Error('foliage_recovery_authoring_shape_invalid');
if (proof.runtime.revision !== 2528 || runtimeDocument.revision !== 2528 || proof.runtime.objectCount !== 314 || runtimeDocument.sceneObjects.length !== 314) throw new Error('foliage_recovery_runtime_shape_invalid');
if (proof.runtime.normalShrubCount !== 9 || runtimeDocument.sceneObjects.filter((object) => object.type === 'forest_shrub').length !== 9) throw new Error('foliage_recovery_runtime_shrub_count_invalid');
if (!proof.authoring.saveReceipt?.afterHash || !proof.authoring.bakeReceipt?.afterHash) throw new Error('foliage_recovery_receipts_missing');
if (proof.browser.consoleIssues.length || proof.browser.pageErrors.length || proof.browser.requestFailures.length || proof.browser.httpErrors.length) throw new Error('foliage_recovery_browser_errors');

console.log(JSON.stringify({ proofFile, ...proof.authoring, runtime: proof.runtime, browser: proof.browser }, null, 2));

async function waitForRuntimeFrame(page) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const frame = page.frames().find((candidate) => candidate.url().includes('axiom-first-escape.runtime-map.json'));
    if (frame) return frame;
    await page.waitForTimeout(100);
  }
  throw new Error('foliage_recovery_runtime_frame_timeout');
}
function expectedConsoleIssue(message) {
  const text = message.text();
  if (message.type() === 'warning' && text.includes('GL Driver Message') && text.includes('ReadPixels')) return true;
  if (message.type() === 'warning' && text.includes('allow-scripts') && text.includes('allow-same-origin')) return true;
  return message.type() === 'error' && text.startsWith('Failed to load resource:');
}
function expectedRequestFailure(request) {
  return ['http://localhost:1234/v1/models', 'http://127.0.0.1:11434/api/tags', 'http://127.0.0.1:4242/call'].includes(request.url());
}
function expectedHttpError(response) {
  return response.url() === 'http://localhost:3007/mcp/call';
}
async function launchBrowser() {
  const channel = process.env.BSB_PLAYWRIGHT_CHANNEL || 'msedge';
  try { return await chromium.launch({ channel, headless: true }); }
  catch { return chromium.launch({ headless: true }); }
}
