import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const launcherRoot = resolve(__dirname, '..');
const workspaceRoot = resolve(launcherRoot, '..', '..', '..');
const requireFromBsb = createRequire(join(workspaceRoot, '_A_Projects', 'BLACK_SKY_BOUND_V2', 'package.json'));
const { chromium } = requireFromBsb('@playwright/test');
const outDir = resolve(process.env.AXIOM_SCENE_AUTHORING_PROOF_DIR || join(launcherRoot, 'output', 'playwright', 'scene-authoring'));
const selectedScreenshot = join(outDir, 'selected-record.png');
const treePreviewScreenshot = join(outDir, 'tree-brush-preview.png');
const finalScreenshot = join(outDir, 'rock-brush-and-erase.png');
const narrowScreenshot = join(outDir, 'narrow-scene-brush.png');
const proofFile = join(outDir, 'scene-authoring-proof.json');
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
    await window.FileManagerRuntime.loadProjectRoot('_A_Projects/BLACK_SKY_BOUND_V2', { sourceSurface: 'scene_authoring_playtest' });
    window.switchTab?.('bsb-map');
  });
  await page.waitForFunction(() => {
    const status = window.BsbV2MapAuthoring?.status?.();
    return status?.active && status?.document && status?.inputOwner === 'forge' && ['saved', 'new draft'].includes(status.status);
  }, null, { timeout: 25000 });

  const initial = await authoringState(page);
  const singleRockTile = await findOpenCenter(page, 2, 'geology');
  await page.evaluate(() => {
    window.BsbV2MapAuthoring.setTool('object:boulder');
    window.BsbV2MapAuthoring.setScenePlacementMode('single');
  });
  await clickMapTile(page, singleRockTile.x, singleRockTile.y);
  const placedRock = await page.evaluate(({ x, y }) => {
    const status = window.BsbV2MapAuthoring.status();
    return status.document.sceneObjects.find((entry) => entry.type === 'boulder' && entry.x === x && entry.y === y) || null;
  }, singleRockTile);
  if (!placedRock) throw new Error('single_rock_setup_failed');

  await page.keyboard.press('v');
  await clickMapTile(page, singleRockTile.x + 1, singleRockTile.y + 1);
  await page.waitForFunction((id) => window.BsbV2MapAuthoring.status().selectedRecord?.id === id, placedRock.id);
  await page.evaluate(() => document.querySelector('.bsb-v2-inspector')?.scrollIntoView({ block: 'nearest' }));
  const footprintSelection = await authoringState(page);
  await page.screenshot({ path: selectedScreenshot, fullPage: true });

  await page.keyboard.press('x');
  await page.waitForFunction((id) => !window.BsbV2MapAuthoring.status().document.sceneObjects.some((entry) => entry.id === id), placedRock.id);
  const keyboardDeleted = await authoringState(page);

  const treeCenter = await findBrushCenter(page, 3, 'tree');
  await page.evaluate(() => {
    window.BsbV2MapAuthoring.setTool('object:tree');
    window.BsbV2MapAuthoring.setScenePlacementMode('brush');
    window.BsbV2MapAuthoring.setSceneBrushField('radiusTiles', 3);
    window.BsbV2MapAuthoring.setSceneBrushField('falloff', 0);
    window.BsbV2MapAuthoring.setSceneBrushField('density', 1);
  });
  await dragMapStroke(page, [treeCenter, { x: treeCenter.x + 2, y: treeCenter.y }]);
  await page.waitForFunction(() => window.BsbV2MapAuthoring.status().sceneBrush.preview?.candidates?.length > 1);
  const treePreview = await authoringState(page);
  await page.evaluate(() => document.querySelector('.bsb-v2-scene-brush')?.scrollIntoView({ block: 'nearest' }));
  await page.screenshot({ path: treePreviewScreenshot, fullPage: true });
  await page.locator('#bsb-v2-scene-commit').click();
  await page.waitForFunction((revision) => {
    const state = window.BsbV2MapAuthoring.status();
    return state.document.revision === revision + 1 && state.sceneBrush.lastReceipt?.operation === 'paint';
  }, treePreview.revision);
  const treesCommitted = await authoringState(page);
  const treeReceipt = treesCommitted.sceneBrushReceipt;

  const rockCenter = await findBrushCenter(page, 4, 'geology');
  await page.evaluate(() => {
    window.BsbV2MapAuthoring.setTool('object:boulder');
    window.BsbV2MapAuthoring.setScenePlacementMode('brush');
    window.BsbV2MapAuthoring.setSceneBrushField('radiusTiles', 4);
    window.BsbV2MapAuthoring.setSceneBrushField('falloff', .2);
    window.BsbV2MapAuthoring.setSceneBrushField('density', 1);
  });
  await dragMapStroke(page, [rockCenter]);
  await page.waitForFunction(() => window.BsbV2MapAuthoring.status().sceneBrush.preview?.candidates?.length > 1);
  const rockPreview = await authoringState(page);
  await page.locator('#bsb-v2-scene-commit').click();
  await page.waitForFunction((revision) => {
    const state = window.BsbV2MapAuthoring.status();
    return state.document.revision === revision + 1
      && state.sceneBrush.lastReceipt?.operation === 'paint'
      && state.sceneBrush.lastReceipt?.family === 'geology';
  }, rockPreview.revision);
  const rocksCommitted = await authoringState(page);

  const firstRockId = rocksCommitted.sceneBrushReceipt.createdIds[0];
  const firstRock = await page.evaluate((id) => window.BsbV2MapAuthoring.status().document.sceneObjects.find((entry) => entry.id === id), firstRockId);
  const terrainBeforeErase = await page.evaluate(({ x, y }) => window.BsbV2MapAuthoring.status().document.tiles[y][x], firstRock);
  await page.keyboard.press('e');
  await page.evaluate(() => window.BsbV2MapAuthoring.setBrushRadius(0));
  await clickMapTile(page, firstRock.x + 1, firstRock.y + 1);
  await page.waitForFunction((id) => !window.BsbV2MapAuthoring.status().document.sceneObjects.some((entry) => entry.id === id), firstRockId);
  const erased = await authoringState(page);
  const terrainAfterErase = await page.evaluate(({ x, y }) => window.BsbV2MapAuthoring.status().document.tiles[y][x], firstRock);

  const treeToDelete = treeReceipt.createdIds[0];
  await page.evaluate((id) => {
    window.BsbV2MapAuthoring.setOutlinerQuery(id);
  }, treeToDelete);
  await page.locator('.bsb-v2-outliner-select').click();
  await page.waitForFunction((id) => window.BsbV2MapAuthoring.status().selectedRecord?.id === id, treeToDelete);
  const outlinerSelected = await authoringState(page);
  await page.locator('#bsb-v2-delete-selected').click();
  await page.waitForFunction((id) => !window.BsbV2MapAuthoring.status().document.sceneObjects.some((entry) => entry.id === id), treeToDelete);
  const inspectorDeleted = await authoringState(page);
  await page.evaluate(() => window.BsbV2MapAuthoring.setOutlinerQuery(''));
  await page.screenshot({ path: finalScreenshot, fullPage: true });

  await page.setViewportSize({ width: 1024, height: 820 });
  await page.evaluate(() => {
    window.BsbV2MapAuthoring.setTool('object:tree');
    window.BsbV2MapAuthoring.setScenePlacementMode('brush');
  });
  await page.evaluate(() => document.querySelector('.bsb-v2-scene-brush')?.scrollIntoView({ block: 'nearest' }));
  const narrowLayout = await page.evaluate(() => {
    const panel = document.querySelector('.bsb-v2-scene-brush')?.getBoundingClientRect();
    const root = document.getElementById('bsb-map-panel');
    const modes = document.querySelector('.bsb-v2-authoring-modes')?.getBoundingClientRect();
    return {
      panel: panel ? { left: panel.left, right: panel.right, width: panel.width } : null,
      modes: modes ? { left: modes.left, right: modes.right, width: modes.width } : null,
      rootOverflow: root ? root.scrollWidth - root.clientWidth : null,
      controlsVisible: Boolean(panel && panel.width > 180 && modes && modes.width > 180)
    };
  });
  await page.screenshot({ path: narrowScreenshot, fullPage: true });

  const classifiedHttpFailures = httpFailures.filter(isExpectedBackgroundHttpFailure);
  const unclassifiedHttpFailures = httpFailures.filter((failure) => !isExpectedBackgroundHttpFailure(failure));
  proof = {
    contract: 'axiom.scene-authoring-browser-proof.v1',
    axiomUrl: page.url(),
    initial,
    placedRock,
    footprintSelection,
    keyboardDeleted,
    treePreview,
    treesCommitted,
    rockPreview,
    rocksCommitted,
    erased,
    eraseTerrainPreserved: terrainBeforeErase === terrainAfterErase,
    outlinerSelected,
    inspectorDeleted,
    narrowLayout,
    screenshots: { selectedScreenshot, treePreviewScreenshot, finalScreenshot, narrowScreenshot },
    browser: { consoleIssues, appConsoleIssues, pageErrors, classifiedHttpFailures, unclassifiedHttpFailures }
  };
  await writeFile(proofFile, `${JSON.stringify(proof, null, 2)}\n`);
} finally {
  await browser.close();
}

if (proof.footprintSelection.selectedRecord?.id !== proof.placedRock.id || proof.footprintSelection.selectedToolId !== 'select') throw new Error('viewport_footprint_selection_failed');
if (proof.keyboardDeleted.revision !== proof.footprintSelection.revision + 1 || proof.keyboardDeleted.selectedRecord) throw new Error('keyboard_delete_failed');
if (proof.treePreview.revision !== proof.keyboardDeleted.revision || proof.treePreview.sceneBrushPreviewCount < 2) throw new Error('tree_preview_mutated_or_missing');
if (proof.treesCommitted.revision !== proof.treePreview.revision + 1 || proof.treesCommitted.sceneBrushReceipt?.family !== 'tree') throw new Error('tree_batch_commit_failed');
if (proof.rockPreview.revision !== proof.treesCommitted.revision || proof.rockPreview.sceneBrushPreviewCount < 2) throw new Error('rock_preview_mutated_or_missing');
if (proof.rocksCommitted.revision !== proof.rockPreview.revision + 1 || proof.rocksCommitted.sceneBrushReceipt?.family !== 'geology') throw new Error('rock_batch_commit_failed');
if (!proof.eraseTerrainPreserved || proof.erased.lastEraseReceipt?.removedCount < 1) throw new Error('scene_erase_failed_or_changed_terrain');
if (proof.outlinerSelected.selectedToolId !== 'select' || !proof.outlinerSelected.selectedRecord) throw new Error('outliner_selection_handoff_failed');
if (proof.inspectorDeleted.selectedRecord || !proof.inspectorDeleted.lastDeleteReceipt?.removedId) throw new Error('inspector_delete_failed');
if (!proof.narrowLayout.controlsVisible || proof.narrowLayout.rootOverflow > 1) throw new Error('narrow_scene_authoring_layout_overflow');
if (proof.browser.appConsoleIssues.length || proof.browser.pageErrors.length || proof.browser.unclassifiedHttpFailures.length) throw new Error('browser_runtime_issues_detected');

console.log(JSON.stringify({
  proofFile,
  selectedScreenshot,
  treePreviewScreenshot,
  finalScreenshot,
  narrowScreenshot,
  treePreviewCount: proof.treePreview.sceneBrushPreviewCount,
  treeCreated: proof.treesCommitted.sceneBrushReceipt.createdCount,
  rockPreviewCount: proof.rockPreview.sceneBrushPreviewCount,
  rockCreated: proof.rocksCommitted.sceneBrushReceipt.createdCount,
  erasedCount: proof.erased.lastEraseReceipt.removedCount,
  appConsoleIssues: proof.browser.appConsoleIssues.length,
  pageErrors: proof.browser.pageErrors.length,
  unclassifiedHttpFailures: proof.browser.unclassifiedHttpFailures.length
}, null, 2));

async function authoringState(page) {
  return page.evaluate(() => {
    const state = window.BsbV2MapAuthoring.status();
    return {
      revision: state.document.revision,
      sceneObjectCount: state.document.sceneObjects.length,
      treeCount: state.document.sceneObjects.filter((entry) => entry.tree).length,
      rockCount: state.document.sceneObjects.filter((entry) => entry.geology).length,
      selectedToolId: state.selectedToolId,
      selectedRecord: state.selectedRecord,
      scenePlacementMode: state.scenePlacementMode,
      sceneBrushPreviewCount: state.sceneBrush.preview?.candidates?.length ?? 0,
      sceneBrushBlockedCount: state.sceneBrush.preview?.diagnostics?.blocked ?? 0,
      sceneBrushReceipt: state.sceneBrush.lastReceipt,
      lastDeleteReceipt: state.lastDeleteReceipt,
      lastEraseReceipt: state.lastEraseReceipt
    };
  });
}

async function findOpenCenter(page, radius, family) {
  return page.evaluate(({ radius, family }) => {
    const state = window.BsbV2MapAuthoring.status();
    const doc = state.document;
    const occupied = [
      { x: doc.spawn.x, y: doc.spawn.y, w: 1, h: 1 },
      { ...doc.escapeZone },
      ...doc.sceneObjects.map((record) => ({ x: record.x, y: record.y, w: record.type === 'boulder' ? 2 : 1, h: record.type === 'boulder' ? 2 : 1 })),
      ...doc.unitPlacements.map((record) => ({ x: record.x, y: record.y, w: 1, h: 1 })),
      ...doc.unitSpawners.map((record) => ({ x: record.x, y: record.y, w: 1, h: 1 }))
    ];
    const footprint = family === 'geology' ? 2 : 1;
    const overlaps = (left, right) => left.x < right.x + right.w && left.x + left.w > right.x && left.y < right.y + right.h && left.y + left.h > right.y;
    for (let y = radius + 1; y < doc.height - radius - footprint - 1; y += 1) {
      for (let x = radius + 1; x < doc.width - radius - footprint - 1; x += 1) {
        const area = { x: x - radius, y: y - radius, w: radius * 2 + footprint, h: radius * 2 + footprint };
        if (occupied.some((entry) => overlaps(area, entry))) continue;
        let blocked = false;
        for (let ty = area.y; ty < area.y + area.h && !blocked; ty += 1) {
          for (let tx = area.x; tx < area.x + area.w; tx += 1) {
            const terrain = doc.tiles[ty]?.[tx];
            if (terrain === 'water' || (family === 'tree' && terrain === 'rock')) { blocked = true; break; }
          }
        }
        if (!blocked) return { x, y };
      }
    }
    throw new Error(`open_scene_brush_area_missing:${family}:${radius}`);
  }, { radius, family });
}

async function findBrushCenter(page, radius, family) {
  return page.evaluate(({ radius, family }) => {
    const state = window.BsbV2MapAuthoring.status();
    const api = family === 'geology' ? window.EDITOR.procedural.geology.brush : window.EDITOR.procedural.trees.brush;
    let best = null;
    for (let y = 2; y < state.document.height - 2; y += 2) {
      for (let x = 2; x < state.document.width - 2; x += 2) {
        try {
          const preview = api.preview([{ x, y }], {
            radiusTiles: radius,
            falloff: 0,
            density: 1,
            seed: family === 'geology' ? 88173 : 77123
          });
          if (!best || preview.candidates.length > best.count) best = { x, y, count: preview.candidates.length };
        } catch {}
      }
    }
    if (!best || best.count < 2) throw new Error(`scene_brush_candidate_area_missing:${family}:${radius}`);
    return best;
  }, { radius, family });
}

async function clickMapTile(page, tileX, tileY) {
  const point = await mapPoint(page, { x: tileX, y: tileY });
  await page.mouse.click(point.x, point.y);
}

async function dragMapStroke(page, tiles) {
  const points = [];
  for (const tile of tiles) points.push(await mapPoint(page, tile));
  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  for (const point of points.slice(1)) await page.mouse.move(point.x, point.y, { steps: 5 });
  await page.mouse.up();
}

async function mapPoint(page, tile) {
  return page.evaluate((requestedTile) => {
    const canvas = document.getElementById('bsb-v2-map-canvas');
    const rect = canvas.getBoundingClientRect();
    const layout = window.BsbV2MapAuthoring.status().viewportLayout;
    if (!layout) throw new Error('map_canvas_layout_missing');
    return {
      x: rect.left + layout.offsetX + (requestedTile.x + .5) * layout.cell,
      y: rect.top + layout.offsetY + (requestedTile.y + .5) * layout.cell
    };
  }, tile);
}

function isExpectedCaptureWarning(issue) {
  if (issue.type !== 'warning') return false;
  if (issue.text.includes('GL Driver Message') && issue.text.includes('ReadPixels')) return true;
  return issue.text.includes('allow-scripts') && issue.text.includes('allow-same-origin');
}
function isResourceConsoleIssue(issue) { return issue.type === 'error' && issue.text.startsWith('Failed to load resource:'); }
function isExpectedBackgroundHttpFailure(failure) {
  if (/^http:\/\/(localhost|127\.0\.0\.1):(11434|1234|3000|4242)\//.test(failure.url) && failure.error === 'net::ERR_CONNECTION_REFUSED') return true;
  return /\/mcp\/call$/.test(failure.url)
    && failure.status === 500
    && failure.postData?.tool === 'fs_ls'
    && /docs\/skills/i.test(String(failure.postData?.params?.path || ''));
}
async function launchBrowser() {
  const channel = process.env.BSB_PLAYWRIGHT_CHANNEL || 'msedge';
  try { return await chromium.launch({ channel, headless: true }); }
  catch { return chromium.launch({ headless: true }); }
}
