import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const launcherRoot = resolve(__dirname, '..');
const workspaceRoot = resolve(launcherRoot, '..', '..', '..');
const requireFromBsb = createRequire(join(workspaceRoot, '_A_Projects', 'BLACK_SKY_BOUND_V2', 'package.json'));
const { chromium } = requireFromBsb('@playwright/test');
const outDir = resolve(process.env.AXIOM_BRUSH_PROOF_DIR || join(launcherRoot, 'output', 'playwright', 'undergrowth-brush'));
const previewScreenshot = join(outDir, 'undergrowth-brush-preview.png');
const committedScreenshot = join(outDir, 'undergrowth-brush-committed.png');
const narrowScreenshot = join(outDir, 'undergrowth-brush-narrow.png');
const proofFile = join(outDir, 'undergrowth-brush-proof.json');
const axiomUrl = process.env.AXIOM_PROOF_URL || 'http://localhost:3007/axiom-editor.html';

await mkdir(outDir, { recursive: true });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1680, height: 980 }, deviceScaleFactor: 1 });
const consoleIssues = [];
const appConsoleIssues = [];
const pageErrors = [];
const httpFailures = [];

page.on('console', (message) => {
  if (!['error', 'warning'].includes(message.type())) return;
  const issue = { type: message.type(), text: message.text() };
  consoleIssues.push(issue);
  if (!isExpectedCaptureWarning(issue) && !isResourceConsoleIssue(issue)) appConsoleIssues.push(issue);
});
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('response', (response) => {
  if (response.status() < 400) return;
  let postData = null;
  try { postData = response.request().postDataJSON(); } catch {}
  httpFailures.push({ url: response.url(), status: response.status(), postData });
});
page.on('requestfailed', (request) => httpFailures.push({ url: request.url(), error: request.failure()?.errorText || 'request_failed' }));

let proof;
try {
  await page.goto(axiomUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.EDITOR && window.FileManagerRuntime && window.BsbV2MapAuthoring);
  await page.evaluate(async () => {
    await window.FileManagerRuntime.loadProjectRoot('_A_Projects/BLACK_SKY_BOUND_V2', { sourceSurface: 'undergrowth_brush_playtest' });
    window.switchTab?.('bsb-map');
  });
  await page.waitForFunction(() => {
    const status = window.BsbV2MapAuthoring?.status?.();
    return status?.active && status?.document && status?.inputOwner === 'forge' && ['saved', 'new draft'].includes(status.status);
  }, null, { timeout: 25000 });

  const apiProjection = await page.evaluate(() => {
    const before = window.BsbV2MapAuthoring.status();
    const catalogue = window.EDITOR.procedural.undergrowth.catalogue();
    const preview = window.EDITOR.procedural.undergrowth.brush.preview([{ x: 10, y: 22 }], {
      radiusTiles: 3,
      falloff: 0,
      density: 1,
      seed: 91273,
      speciesMix: { wood_fern: .5, forest_shrub: .5, ember_bramble: 0 }
    });
    const after = window.BsbV2MapAuthoring.status();
    return {
      catalogue: catalogue.brush,
      previewContract: preview.contract,
      previewCount: preview.candidates.length,
      beforeRevision: before.document.revision,
      afterRevision: after.document.revision,
      beforeCount: before.document.sceneObjects.length,
      afterCount: after.document.sceneObjects.length
    };
  });

  await page.getByRole('tab', { name: 'Objects' }).click();
  await page.locator('.bsb-v2-tool[onclick*="object:smouldering_fern"]').click();
  await page.waitForFunction(() => window.BsbV2MapAuthoring.status().undergrowthBrush?.config?.woodFernType === 'smouldering_fern');
  await page.locator('.bsb-v2-tool[onclick*="object:fern_patch"]').click();
  await page.waitForFunction(() => {
    const config = window.BsbV2MapAuthoring.status().undergrowthBrush?.config;
    return config?.speciesMix?.wood_fern === 1 && config?.woodFernType === 'fern_patch';
  });
  const controlsVisible = await page.locator('.bsb-v2-undergrowth-brush').isVisible();
  const initial = await brushState(page);

  await dragMapStroke(page, [{ x: 10, y: 22 }, { x: 12, y: 22 }, { x: 14, y: 23 }]);
  await page.waitForFunction(() => window.BsbV2MapAuthoring.status().undergrowthBrush.preview?.candidates?.length > 0);
  const preview = await brushState(page);
  await page.screenshot({ path: previewScreenshot, fullPage: true });

  if (preview.revision !== initial.revision || preview.sceneObjectCount !== initial.sceneObjectCount) {
    throw new Error('preview_mutated_canonical_document');
  }
  if (preview.previewCount < 1 || preview.strokeCenterCount < 2) throw new Error('drag_preview_missing');

  await page.locator('#bsb-v2-undergrowth-commit').click();
  await page.waitForFunction(({ revision, count }) => {
    const state = window.BsbV2MapAuthoring.status();
    return state.document.revision === revision + 1
      && state.document.sceneObjects.length === count + state.undergrowthBrush.lastReceipt.createdCount
      && state.undergrowthBrush.lastReceipt.operation === 'paint';
  }, { revision: initial.revision, count: initial.sceneObjectCount });
  const committed = await brushState(page);
  await page.screenshot({ path: committedScreenshot, fullPage: true });

  await page.locator('#bsb-v2-undergrowth-undo').click();
  await page.waitForFunction(({ revision, count }) => {
    const state = window.BsbV2MapAuthoring.status();
    return state.document.revision === revision + 2
      && state.document.sceneObjects.length === count
      && state.undergrowthBrush.lastReceipt.operation === 'undo';
  }, { revision: initial.revision, count: initial.sceneObjectCount });
  const undone = await brushState(page);

  await page.setViewportSize({ width: 1024, height: 820 });
  await page.locator('.bsb-v2-tool[onclick*="object:forest_shrub"]').click();
  await dragMapStroke(page, [{ x: 28, y: 20 }, { x: 30, y: 20 }]);
  await page.waitForFunction(() => window.BsbV2MapAuthoring.status().undergrowthBrush.preview?.candidates?.length > 0);
  const narrowLayout = await page.evaluate(() => {
    const panel = document.querySelector('.bsb-v2-undergrowth-brush')?.getBoundingClientRect();
    const root = document.getElementById('bsb-map-panel');
    const actions = document.querySelector('.bsb-v2-undergrowth-actions')?.getBoundingClientRect();
    return {
      panel: panel ? { left: panel.left, right: panel.right, top: panel.top, bottom: panel.bottom } : null,
      actions: actions ? { left: actions.left, right: actions.right, width: actions.width } : null,
      viewportWidth: window.innerWidth,
      rootOverflow: root ? root.scrollWidth - root.clientWidth : null,
      controlsVisible: Boolean(panel && panel.width > 180 && actions && actions.width > 180)
    };
  });
  await page.locator('.bsb-v2-undergrowth-brush').scrollIntoViewIfNeeded();
  await page.screenshot({ path: narrowScreenshot, fullPage: true });

  const classifiedHttpFailures = httpFailures.filter(isExpectedBackgroundHttpFailure);
  const unclassifiedHttpFailures = httpFailures.filter((failure) => !isExpectedBackgroundHttpFailure(failure));
  proof = {
    contract: 'axiom.undergrowth-brush-browser-proof.v1',
    axiomUrl: page.url(),
    controlsVisible,
    apiProjection,
    initial,
    preview,
    committed,
    undone,
    narrowLayout,
    screenshots: { previewScreenshot, committedScreenshot, narrowScreenshot },
    browser: { consoleIssues, appConsoleIssues, pageErrors, classifiedHttpFailures, unclassifiedHttpFailures }
  };
  await writeFile(proofFile, `${JSON.stringify(proof, null, 2)}\n`);
} finally {
  await browser.close();
}

if (!proof.controlsVisible) throw new Error('brush_controls_not_visible');
if (proof.apiProjection.previewContract !== 'axiom.undergrowth-brush-preview.v1' || proof.apiProjection.catalogue?.operations?.join(',') !== 'preview,commit,undo') throw new Error('editor_brush_api_missing');
if (proof.apiProjection.previewCount < 1) throw new Error('editor_brush_api_preview_empty');
if (proof.apiProjection.beforeRevision !== proof.apiProjection.afterRevision || proof.apiProjection.beforeCount !== proof.apiProjection.afterCount) throw new Error('editor_api_preview_mutated_source');
if (proof.committed.revision !== proof.initial.revision + 1) throw new Error('batch_commit_revision_wrong');
if (proof.committed.sceneObjectCount !== proof.initial.sceneObjectCount + proof.preview.previewCount) throw new Error('preview_commit_count_mismatch');
if (proof.committed.receipt?.createdCount !== proof.preview.previewCount) throw new Error('receipt_count_mismatch');
if (proof.undone.revision !== proof.initial.revision + 2 || proof.undone.sceneObjectCount !== proof.initial.sceneObjectCount) throw new Error('undo_did_not_restore_batch');
if (!proof.narrowLayout.controlsVisible || proof.narrowLayout.rootOverflow > 1) throw new Error('narrow_brush_layout_overflow');
if (proof.browser.appConsoleIssues.length || proof.browser.pageErrors.length || proof.browser.unclassifiedHttpFailures.length) throw new Error('browser_runtime_issues_detected');

console.log(JSON.stringify({
  proofFile,
  previewScreenshot,
  committedScreenshot,
  narrowScreenshot,
  previewCount: proof.preview.previewCount,
  blockedCount: proof.preview.blockedCount,
  revisions: [proof.initial.revision, proof.committed.revision, proof.undone.revision],
  classifiedBackgroundFailures: proof.browser.classifiedHttpFailures.length,
  appConsoleIssues: proof.browser.appConsoleIssues.length,
  pageErrors: proof.browser.pageErrors.length,
  unclassifiedHttpFailures: proof.browser.unclassifiedHttpFailures.length
}, null, 2));

async function brushState(page) {
  return page.evaluate(() => {
    const state = window.BsbV2MapAuthoring.status();
    return {
      revision: state.document.revision,
      sceneObjectCount: state.document.sceneObjects.length,
      undergrowthCount: state.document.sceneObjects.filter((record) => record.undergrowth).length,
      previewCount: state.undergrowthBrush.preview?.candidates?.length ?? 0,
      blockedCount: state.undergrowthBrush.preview?.diagnostics?.blocked ?? 0,
      strokeCenterCount: state.undergrowthBrush.strokeCenters.length,
      previewSourceRevision: state.undergrowthBrush.preview?.sourceRevision ?? null,
      canUndo: state.undergrowthBrush.canUndo,
      receipt: state.undergrowthBrush.lastReceipt
    };
  });
}

async function dragMapStroke(page, tiles) {
  const points = await page.evaluate((requestedTiles) => {
    const canvas = document.getElementById('bsb-v2-map-canvas');
    const state = window.BsbV2MapAuthoring.status();
    const rect = canvas.getBoundingClientRect();
    const layout = state.viewportLayout;
    if (!layout) throw new Error('map_canvas_layout_missing');
    return requestedTiles.map((tile) => ({
      x: rect.left + layout.offsetX + (tile.x + .5) * layout.cell,
      y: rect.top + layout.offsetY + (tile.y + .5) * layout.cell
    }));
  }, tiles);
  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  for (const point of points.slice(1)) await page.mouse.move(point.x, point.y, { steps: 5 });
  await page.mouse.up();
}

function isExpectedCaptureWarning(issue) {
  if (issue.type !== 'warning') return false;
  if (issue.text.includes('GL Driver Message') && issue.text.includes('ReadPixels')) return true;
  return issue.text.includes('allow-scripts') && issue.text.includes('allow-same-origin');
}
function isResourceConsoleIssue(issue) { return issue.type === 'error' && issue.text.startsWith('Failed to load resource:'); }
function isExpectedBackgroundHttpFailure(failure) {
  if (failure.url === 'http://localhost:1234/v1/models' && failure.error === 'net::ERR_CONNECTION_REFUSED') return true;
  return failure.url === 'http://localhost:3007/mcp/call'
    && failure.status === 500
    && failure.postData?.tool === 'fs_ls'
    && /docs\/skills/i.test(String(failure.postData?.params?.path || ''));
}
async function launchBrowser() {
  const channel = process.env.BSB_PLAYWRIGHT_CHANNEL || 'msedge';
  try { return await chromium.launch({ channel, headless: true }); }
  catch { return chromium.launch({ headless: true }); }
}
