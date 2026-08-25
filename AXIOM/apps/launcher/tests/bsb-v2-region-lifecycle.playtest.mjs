import { createRequire } from 'node:module';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const launcherRoot = resolve(__dirname, '..');
const workspaceRoot = resolve(launcherRoot, '..', '..', '..');
const bsbRoot = join(workspaceRoot, '_A_Projects', 'BLACK_SKY_BOUND_V2');
const requireFromBsb = createRequire(join(bsbRoot, 'package.json'));
const { chromium } = requireFromBsb('@playwright/test');
const outputRoot = resolve(process.env.CODEX_OUTPUT_DIR || join(launcherRoot, 'output', 'playwright', 'region-lifecycle'));
const authoringShot = join(outputRoot, 'region-lifecycle-authoring.png');
const runtimeShot = join(outputRoot, 'region-lifecycle-webgl3d.png');
const proofPath = join(outputRoot, 'region-lifecycle-proof.json');
const manifestPath = join(bsbRoot, 'data', 'maps', 'manifest.json');
const manifestBefore = await readFile(manifestPath);
const manifestSnapshot = JSON.parse(manifestBefore.toString('utf8'));
const originalMapIds = new Set(manifestSnapshot.maps.map((entry) => entry.id));
const recoveredAuthoringPath = join(launcherRoot, 'data', 'bsb-v2', 'maps', 'ash_road_threshold_2.authoring.json');
const recoveredAuthoringBefore = await readFile(recoveredAuthoringPath);
const recoveredAuthoringSnapshot = JSON.parse(recoveredAuthoringBefore.toString('utf8'));
const axiomUrl = process.env.AXIOM_PROOF_URL || 'http://127.0.0.1:3007/axiom-editor.html';

await mkdir(outputRoot, { recursive: true });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1680, height: 980 }, deviceScaleFactor: 1 });
const issues = { console: [], pageErrors: [], requestFailures: [], http: [] };
page.on('console', (message) => {
  if (message.type() === 'error') issues.console.push(message.text());
});
page.on('pageerror', (error) => issues.pageErrors.push(error.message));
page.on('requestfailed', (request) => issues.requestFailures.push({ url: request.url(), reason: request.failure()?.errorText || 'request_failed' }));
page.on('response', async (response) => {
  if (response.status() < 400) return;
  const request = response.request();
  issues.http.push({
    url: response.url(),
    status: response.status(),
    method: request.method(),
    requestBody: request.postData() || null,
    responseBody: await response.text().catch(() => null)
  });
});

let proof = null;
try {
  await page.goto(axiomUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.EDITOR && window.FileManagerRuntime && window.BsbV2MapAuthoring);
  await page.evaluate(async () => {
    await window.FileManagerRuntime.loadProjectRoot('_A_Projects/BLACK_SKY_BOUND_V2', { sourceSurface: 'region_lifecycle_proof' });
    window.switchTab?.('bsb-map');
  });
  await page.waitForFunction(() => {
    const status = window.BsbV2MapAuthoring?.status?.();
    return status?.active && status?.document && status.mapLibrary?.maps?.length === 4;
  }, null, { timeout: 25000 });

  const recovered = await page.evaluate(() => {
    const status = window.BsbV2MapAuthoring.status();
    return status.mapLibrary.maps.find((entry) => entry.id === 'ash_road_threshold_2') || null;
  });
  if (recovered?.title !== 'The winding path') throw new Error(`recovered_region_title_missing:${recovered?.title || 'missing'}`);

  await page.getByRole('button', { name: 'Create and save a new region' }).click();
  await page.waitForFunction(() => {
    const status = window.BsbV2MapAuthoring.status();
    return status.mapLibrary?.maps?.length === 5 && status.dirty === false && status.status === 'saved'
      && status.saveReceipt?.manifestReceipt && status.activeCatalogueMapId?.startsWith('region_');
  }, null, { timeout: 15000 });
  const created = await page.evaluate(() => {
    const status = window.BsbV2MapAuthoring.status();
    return {
      catalogueMapId: status.activeCatalogueMapId,
      mapId: status.document.mapId,
      authoringPath: status.authoringPath,
      runtimePath: status.publication.runtimePath,
      initialTitle: status.document.title,
      revision: status.document.revision
    };
  });

  const titleInput = page.getByRole('textbox', { name: 'Map title' });
  await titleInput.fill('Lifecycle Proof Region');
  await titleInput.press('Tab');
  await page.waitForFunction((catalogueMapId) => {
    const status = window.BsbV2MapAuthoring.status();
    return status.document?.title === 'Lifecycle Proof Region' && status.dirty === false
      && status.mapLibrary?.maps?.find((entry) => entry.id === catalogueMapId)?.title === 'Lifecycle Proof Region';
  }, created.catalogueMapId, { timeout: 12000 });
  await page.evaluate((catalogueMapId) => window.BsbV2MapAuthoring.load(catalogueMapId), created.catalogueMapId);
  await page.waitForFunction(() => window.BsbV2MapAuthoring.status().document?.title === 'Lifecycle Proof Region');

  await page.getByRole('tab', { name: 'Spawners' }).click();
  await page.getByRole('button', { name: 'Player spawn' }).click();
  await setNumber(page, 'playerSpawn X', '10');
  await setNumber(page, 'playerSpawn Y', '38');
  await setNumber(page, 'playerSpawn Facing °', '-90');
  await page.getByRole('button', { name: 'Escape zone' }).click();
  await setNumber(page, 'escapeZone X', '51');
  await setNumber(page, 'escapeZone Y', '3');
  await setNumber(page, 'escapeZone Width', '5');
  await setNumber(page, 'escapeZone Height', '6');
  await page.getByRole('combobox', { name: 'Escape target region' }).selectOption('ash_road_threshold_2');
  await page.getByRole('combobox', { name: 'Escape arrival scene' }).selectOption('smoke_instinct_awakening');
  await page.waitForFunction(() => {
    const transition = window.BsbV2MapAuthoring.status().document?.transitions?.escapeZone;
    return transition?.nextMapId === 'axiom_ash_road_threshold_2' && transition.arrivalSequenceId === 'smoke_instinct_awakening';
  });

  await page.locator('#bsb-v2-region-menu > summary').click();
  const createdRow = page.locator(`[data-region-id="${created.catalogueMapId}"]`);
  const firstRow = page.locator('[data-region-id="first_flightless_night"]');
  const firstRowBox = await firstRow.boundingBox();
  if (!firstRowBox) throw new Error('region_drag_target_missing');
  await createdRow.dragTo(firstRow, {
    targetPosition: { x: Math.max(4, Math.round(firstRowBox.width / 2)), y: Math.max(2, Math.round(firstRowBox.height - 2)) }
  });
  await page.waitForFunction((catalogueMapId) => {
    const maps = window.BsbV2MapAuthoring.status().mapLibrary?.maps || [];
    return maps[1]?.id === catalogueMapId && window.BsbV2MapAuthoring.status().mapLibraryDirty === false;
  }, created.catalogueMapId, { timeout: 12000 });
  await page.screenshot({ path: authoringShot, fullPage: true });

  await page.getByRole('button', { name: 'Bake & Preview' }).click();
  await page.waitForFunction(() => {
    const status = window.BsbV2MapAuthoring.status();
    return status.status === 'runtime ready' && status.view === 'runtime' && status.runtimeVerification?.status === 'current';
  }, null, { timeout: 20000 });
  await page.waitForFunction((runtimePath) => {
    const frame = document.getElementById('project-preview-frame');
    return frame?.src?.includes(runtimePath.split('/').at(-1)) && frame.src.includes('skipHatch=1');
  }, created.runtimePath, { timeout: 15000 });
  const runtimeFrame = await waitForRuntimeFrame(page, created.runtimePath.split('/').at(-1));
  await runtimeFrame.waitForFunction(() => window.BSB_V2_DEMO && window.render_game_to_text);
  await runtimeFrame.waitForTimeout(500);
  const runtime = await runtimeFrame.evaluate(() => JSON.parse(window.render_game_to_text()));
  await page.screenshot({ path: runtimeShot, fullPage: true });

  const finalAuthoring = await page.evaluate(() => window.BsbV2MapAuthoring.status());
  const preview = await page.evaluate(() => window.AXIOM_PROJECT_PREVIEW.status());
  const issueAssessment = assessBrowserIssues(issues);
  proof = {
    contract: 'axiom.bsb-region-lifecycle-proof.v1',
    created,
    recovered,
    recoveredAuthoring: {
      title: recoveredAuthoringSnapshot.title,
      revision: recoveredAuthoringSnapshot.revision,
      sceneObjectCount: recoveredAuthoringSnapshot.sceneObjects?.length ?? 0,
      unitPlacementCount: recoveredAuthoringSnapshot.unitPlacements?.length ?? 0,
      unitSpawnerCount: recoveredAuthoringSnapshot.unitSpawners?.length ?? 0
    },
    authoring: {
      catalogueMapId: finalAuthoring.activeCatalogueMapId,
      mapId: finalAuthoring.document.mapId,
      title: finalAuthoring.document.title,
      revision: finalAuthoring.document.revision,
      spawn: finalAuthoring.document.spawn,
      escapeZone: finalAuthoring.document.escapeZone,
      transition: finalAuthoring.document.transitions.escapeZone,
      order: finalAuthoring.mapLibrary.maps.map((entry) => entry.id),
      dirty: finalAuthoring.dirty,
      saveReceipt: finalAuthoring.saveReceipt,
      bakeReceipt: finalAuthoring.bakeReceipt
    },
    runtime: {
      url: runtimeFrame.url(),
      map: runtime.runtimeMap,
      player: runtime.player,
      opening: runtime.opening,
      rendererActiveBackend: runtime.renderLayerStats?.rendererActiveBackend || null
    },
    previewRuntimeQuery: preview.runtimeQuery,
    screenshots: { authoring: authoringShot, runtime: runtimeShot },
    issues: issueAssessment
  };
  await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`);
} finally {
  await browser.close();
  await cleanupCreatedRegions();
}

if (!proof) throw new Error('region_lifecycle_proof_missing');
const recoveredAuthoringAfter = await readFile(recoveredAuthoringPath);
if (!recoveredAuthoringAfter.equals(recoveredAuthoringBefore)) throw new Error('historical_ai_session_overwrote_recovered_authoring');
if (proof.recoveredAuthoring.title !== 'The winding path' || proof.recoveredAuthoring.revision !== 6310 || proof.recoveredAuthoring.sceneObjectCount !== 483) {
  throw new Error(`recovered_authoring_snapshot_invalid:${JSON.stringify(proof.recoveredAuthoring)}`);
}
if (proof.authoring.title !== 'Lifecycle Proof Region') throw new Error('region_title_not_persisted');
if (proof.authoring.order[1] !== proof.created.catalogueMapId) throw new Error('region_order_not_persisted');
if (proof.authoring.spawn.x !== 10 || proof.authoring.spawn.y !== 38 || Math.abs(proof.authoring.spawn.rotation + Math.PI / 2) > .001) throw new Error('player_spawn_attributes_not_persisted');
if (proof.authoring.transition?.nextMapId !== 'axiom_ash_road_threshold_2') throw new Error('escape_target_not_persisted');
if (proof.authoring.transition?.arrivalSequenceId !== 'smoke_instinct_awakening') throw new Error('arrival_scene_not_persisted');
if (proof.runtime.map?.id !== proof.created.mapId || proof.runtime.map?.fallbackUsed) throw new Error('selected_runtime_map_not_loaded');
if (proof.runtime.rendererActiveBackend !== 'webgl3d') throw new Error(`runtime_backend_not_webgl3d:${proof.runtime.rendererActiveBackend}`);
if (proof.runtime.opening?.active !== false || proof.runtime.opening?.source !== 'debug_query_skip_hatch') throw new Error(`opening_not_skipped:${JSON.stringify(proof.runtime.opening)}`);
if (proof.previewRuntimeQuery.skipHatch !== '1') throw new Error('preview_skip_hatch_query_missing');
if (proof.issues.relevant.console.length || proof.issues.relevant.pageErrors.length || proof.issues.relevant.requestFailures.length || proof.issues.relevant.http.length) {
  throw new Error(`browser_issues:${JSON.stringify(proof.issues.relevant)}`);
}

console.log(JSON.stringify({ ok: true, proofPath, authoringShot, runtimeShot, created: proof.created, renderer: proof.runtime.rendererActiveBackend }, null, 2));

async function setNumber(targetPage, name, value) {
  const input = targetPage.getByRole('spinbutton', { name });
  await input.fill(value);
  await input.press('Tab');
}

async function waitForRuntimeFrame(targetPage, pathFragment) {
  await targetPage.waitForFunction((fragment) => Array.from(document.querySelectorAll('iframe')).some((frame) => frame.src.includes(fragment)), pathFragment);
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const frame = targetPage.frames().find((candidate) => candidate.url().includes(pathFragment));
    if (frame) return frame;
    await targetPage.waitForTimeout(100);
  }
  throw new Error(`runtime_frame_missing:${pathFragment}`);
}

function assessBrowserIssues(observed) {
  const backgroundHttp = observed.http.filter((entry) => {
    if (entry.url !== 'http://127.0.0.1:3007/mcp/call') return false;
    try {
      const request = JSON.parse(entry.requestBody || '{}');
      const path = String(request.params?.path || '').replaceAll('\\\\', '/').replace(/^\.\//, '');
      return ['fs_ls', 'fs_find'].includes(request.tool) && (path.endsWith('docs/skills') || path.includes('plugin-builder/docs/skills'));
    } catch {
      return false;
    }
  });
  const backgroundRequestFailures = observed.requestFailures.filter((entry) => entry.url.startsWith('http://localhost:1234/v1/models'));
  const resourceConsole = observed.console.filter((entry) => entry.startsWith('Failed to load resource:'));
  const accountedResourceErrors = backgroundHttp.length + backgroundRequestFailures.length;
  const allResourceErrorsAccountedFor = resourceConsole.length === accountedResourceErrors;
  const backgroundConsole = allResourceErrorsAccountedFor ? resourceConsole : [];
  return {
    observed,
    acceptedBackground: {
      console: backgroundConsole,
      requestFailures: backgroundRequestFailures,
      http: backgroundHttp,
      reasons: [
        'optional_local_model_scan_unavailable',
        'plugin_skill_discovery_paths_absent_or_outside_axiom_project_root'
      ]
    },
    relevant: {
      console: allResourceErrorsAccountedFor ? observed.console.filter((entry) => !entry.startsWith('Failed to load resource:')) : observed.console,
      pageErrors: observed.pageErrors,
      requestFailures: observed.requestFailures.filter((entry) => !backgroundRequestFailures.includes(entry)),
      http: observed.http.filter((entry) => !backgroundHttp.includes(entry))
    }
  };
}

async function cleanupCreatedRegions() {
  let liveManifest = null;
  try { liveManifest = JSON.parse(await readFile(manifestPath, 'utf8')); } catch {}
  const added = (liveManifest?.maps || []).filter((entry) => !originalMapIds.has(entry.id));
  await writeFile(manifestPath, manifestBefore);
  const authoringRoot = resolve(launcherRoot, 'data', 'bsb-v2', 'maps');
  const runtimeRoot = resolve(bsbRoot, 'data', 'maps');
  for (const entry of added) {
    const authoringFile = resolve(launcherRoot, String(entry.authoringPath || ''));
    const runtimeFile = resolve(bsbRoot, String(entry.runtimePath || '').replace(/^\//, ''));
    if (authoringFile.startsWith(`${authoringRoot}${sep}`)) await rm(authoringFile, { force: true });
    if (runtimeFile.startsWith(`${runtimeRoot}${sep}`)) await rm(runtimeFile, { force: true });
  }
}

async function launchBrowser() {
  try { return await chromium.launch({ channel: process.env.BSB_PLAYWRIGHT_CHANNEL || 'msedge', headless: true }); }
  catch { return chromium.launch({ headless: true }); }
}
