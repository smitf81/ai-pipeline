import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const launcherRoot = resolve(__dirname, '..');
const workspaceRoot = resolve(launcherRoot, '..', '..', '..');
const requireFromBsb = createRequire(join(workspaceRoot, '_A_Projects', 'BLACK_SKY_BOUND_V2', 'package.json'));
const { chromium } = requireFromBsb('@playwright/test');
const outDir = join(launcherRoot, 'output', 'playwright');
const authoringScreenshot = join(outDir, 'axiom-bsb-v2-map-authoring.png');
const runtimeScreenshot = join(outDir, 'axiom-bsb-v2-baked-runtime.png');
const secondAuthoringScreenshot = join(outDir, 'axiom-bsb-v2-second-region-authoring.png');
const secondRuntimeScreenshot = join(outDir, 'axiom-bsb-v2-second-region-runtime.png');
const stateFile = join(outDir, 'axiom-bsb-v2-map-authoring-state.json');
const axiomUrl = process.env.AXIOM_PROOF_URL || 'http://localhost:3007/axiom-editor.html';
const canonicalPaths = [
  join(launcherRoot, 'data', 'bsb-v2', 'maps', 'first_escape.authoring.json'),
  join(launcherRoot, 'data', 'bsb-v2', 'maps', 'second_approach.authoring.json'),
  join(workspaceRoot, '_A_Projects', 'BLACK_SKY_BOUND_V2', 'data', 'maps', 'axiom-first-escape.runtime-map.json'),
  join(workspaceRoot, '_A_Projects', 'BLACK_SKY_BOUND_V2', 'data', 'maps', 'axiom-second-approach.runtime-map.json')
];
const canonicalSnapshots = await Promise.all(canonicalPaths.map(async (filePath) => ({
  filePath,
  content: await readFile(filePath)
})));

await mkdir(outDir, { recursive: true });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1680, height: 980 }, deviceScaleFactor: 1 });
const consoleIssues = [];
const appConsoleIssues = [];
const pageErrors = [];
const httpFailures = [];

page.on('console', (message) => {
  if (message.type() !== 'error' && message.type() !== 'warning') return;
  const issue = { type: message.type(), text: message.text() };
  consoleIssues.push(issue);
  if (!isExpectedCaptureWarning(issue) && !isResourceConsoleIssue(issue)) appConsoleIssues.push(issue);
});
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('response', (response) => {
  if (response.status() >= 400) {
    let postData = null;
    try { postData = response.request().postDataJSON(); } catch {}
    httpFailures.push({ url: response.url(), status: response.status(), postData });
  }
});
page.on('requestfailed', (request) => {
  httpFailures.push({ url: request.url(), error: request.failure()?.errorText || 'request_failed' });
});

let proof;
try {
await page.goto(axiomUrl, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.EDITOR && window.FileManagerRuntime && window.BsbV2MapAuthoring);
await page.evaluate(async () => {
  await window.FileManagerRuntime.loadProjectRoot('_A_Projects/BLACK_SKY_BOUND_V2', { sourceSurface: 'playwright_proof' });
  window.switchTab?.('bsb-map');
});
try {
  await page.waitForFunction(() => {
    const status = window.BsbV2MapAuthoring?.status?.();
    return status?.active && status?.document && ['saved', 'new draft'].includes(status.status);
  }, null, { timeout: 25000 });
} catch (error) {
  const diagnostic = await page.evaluate(() => ({
    authoring: window.BsbV2MapAuthoring?.status?.() || null,
    preview: window.AXIOM_PROJECT_PREVIEW?.status?.() || null,
    fileManager: window.FileManagerRuntime?.status?.() || null,
    panelText: document.getElementById('bsb-map-panel')?.innerText || null
  }));
  await page.screenshot({ path: join(outDir, 'axiom-bsb-v2-authoring-failure.png'), fullPage: true });
  console.error(JSON.stringify({ diagnostic, consoleIssues, pageErrors, httpFailures }, null, 2));
  throw error;
}
await page.waitForFunction(() => {
  const status = window.BsbV2MapAuthoring.status();
  return status.mapLibrary?.maps?.length === 4 && status.activeCatalogueMapId === 'first_flightless_night';
});

await page.locator('.bsb-v2-tool[onclick*="terrain:water"]').click();
await clickMapTile(page, 10, 10);
await page.getByRole('tab', { name: 'Objects' }).click();
await page.locator('.bsb-v2-tool[onclick*="object:tree"]').click();
await clickMapTile(page, 12, 10);
await page.getByRole('tab', { name: 'Spawners' }).click();
await page.locator('.bsb-v2-tool[onclick*="spawner:raider"]').click();
await clickMapTile(page, 14, 10);
await page.waitForFunction(() => window.BsbV2MapAuthoring.status().selectedRecord?.kind === 'spawner');
await page.locator('#bsb-v2-inspector-type').selectOption('werewolf');
await page.locator('#bsb-v2-inspector-team').selectOption('wolves');
await changeInspectorValue(page, 'intervalSeconds', '2.5');
await changeInspectorValue(page, 'initialDelaySeconds', '1.25');
await changeInspectorValue(page, 'burstCount', '2');
await changeInspectorValue(page, 'maxAlive', '5');
await changeInspectorValue(page, 'limit', '11');
await changeInspectorValue(page, 'spawnRadiusTiles', '1.75');
await changeInspectorValue(page, 'hitPoints', '64');
await changeInspectorValue(page, 'fixtureRadiusTiles', '0.7');
await page.locator('#bsb-v2-audio-emitter-inspector > summary').click();
await page.locator('#bsb-v2-audio-anchor').fill('mouth');
await page.locator('#bsb-v2-audio-anchor').press('Tab');
await changeAudioEmitterValue(page, 'referenceDistanceMeters', '2.4');
await changeAudioEmitterValue(page, 'maxDistanceMeters', '52');
await changeAudioEmitterValue(page, 'rolloffFactor', '1.05');
await changeAudioEmitterValue(page, 'dopplerScale', '0.7');
await changeAudioEmitterValue(page, 'priority', '74');
await page.waitForFunction(() => {
  const selected = window.BsbV2MapAuthoring.status().selectedRecordData;
  return selected?.type === 'werewolf' && selected?.team === 'wolves' && selected?.hitPoints === 64
    && selected?.audioEmitter?.anchor === 'mouth' && selected?.audioEmitter?.maxDistanceMeters === 52;
});
await page.evaluate(() => window.BsbV2MapAuthoring.setTool('marker:player'));
await clickMapTile(page, 8, 15);
await page.waitForFunction(() => window.BsbV2MapAuthoring.status().dirty === true);
await page.screenshot({ path: authoringScreenshot, fullPage: true });

await page.getByRole('button', { name: 'Save Source' }).click();
await page.waitForFunction(() => {
  const status = window.BsbV2MapAuthoring.status();
  return status.status === 'saved' && status.dirty === false && status.saveReceipt;
}, null, { timeout: 10000 });

await page.getByRole('button', { name: 'Bake & Preview' }).click();
await page.waitForFunction(() => {
  const status = window.BsbV2MapAuthoring.status();
  return status.status === 'runtime ready' && status.view === 'runtime' && status.bakeReceipt;
}, null, { timeout: 15000 });
await page.waitForFunction(() => {
  const frame = document.getElementById('project-preview-frame');
  return frame?.src?.includes('axiom-first-escape.runtime-map.json');
});

const runtimeFrame = await waitForRuntimeFrame(page);
const firstRuntimeFrameUrl = runtimeFrame.url();
await runtimeFrame.waitForFunction(() => window.BSB_V2_DEMO && window.render_game_to_text);
await runtimeFrame.waitForTimeout(350);
const runtimeState = await runtimeFrame.evaluate(() => JSON.parse(window.render_game_to_text()));
await page.screenshot({ path: runtimeScreenshot, fullPage: true });
const firstAuthoringState = await page.evaluate(() => window.BsbV2MapAuthoring.status());

await page.evaluate(() => window.BsbV2MapAuthoring.setView('author'));
await page.locator('#bsb-v2-region-menu > summary').click();
await page.locator('[data-region-id="ash_road_threshold"] button').click();
await page.waitForFunction(() => {
  const status = window.BsbV2MapAuthoring.status();
  return status.activeCatalogueMapId === 'ash_road_threshold'
    && status.document?.mapId === 'axiom_second_approach'
    && status.dirty === false;
}, null, { timeout: 12000 });
await page.getByRole('tab', { name: 'Objects' }).click();
await page.locator('.bsb-v2-tool[onclick*="object:boulder"]').click();
await clickMapTile(page, 15, 17);
await page.waitForFunction(() => {
  const status = window.BsbV2MapAuthoring.status();
  return status.document?.sceneObjects?.some((entry) => entry.type === 'boulder' && entry.x === 15 && entry.y === 17);
});
await page.screenshot({ path: secondAuthoringScreenshot, fullPage: true });

await page.getByRole('button', { name: 'Save Source' }).click();
await page.waitForFunction(() => {
  const status = window.BsbV2MapAuthoring.status();
  return status.status === 'saved' && status.dirty === false && status.saveReceipt;
}, null, { timeout: 10000 });
await page.getByRole('button', { name: 'Bake & Preview' }).click();
await page.waitForFunction(() => {
  const status = window.BsbV2MapAuthoring.status();
  return status.status === 'runtime ready' && status.view === 'runtime' && status.bakeReceipt;
}, null, { timeout: 15000 });
await page.waitForFunction(() => {
  const frame = document.getElementById('project-preview-frame');
  return frame?.src?.includes('axiom-second-approach.runtime-map.json');
});
const secondRuntimeFrame = await waitForRuntimeFrame(page, 'axiom-second-approach.runtime-map.json');
await secondRuntimeFrame.waitForFunction(() => window.BSB_V2_DEMO && window.render_game_to_text);
await secondRuntimeFrame.waitForTimeout(350);
const secondRuntimeState = await secondRuntimeFrame.evaluate(() => JSON.parse(window.render_game_to_text()));
await page.screenshot({ path: secondRuntimeScreenshot, fullPage: true });

const secondAuthoringState = await page.evaluate(() => window.BsbV2MapAuthoring.status());
const previewState = await page.evaluate(() => window.AXIOM_PROJECT_PREVIEW.status());
const classifiedHttpFailures = httpFailures.filter(isExpectedBackgroundHttpFailure);
const unclassifiedHttpFailures = httpFailures.filter((failure) => !isExpectedBackgroundHttpFailure(failure));
proof = {
  axiomUrl: page.url(),
  runtimeFrameUrl: firstRuntimeFrameUrl,
  secondRuntimeFrameUrl: secondRuntimeFrame.url(),
  authoringScreenshot,
  runtimeScreenshot,
  secondAuthoringScreenshot,
  secondRuntimeScreenshot,
  authoring: {
    contract: firstAuthoringState.contract,
    status: firstAuthoringState.status,
    dirty: firstAuthoringState.dirty,
    activeCatalogueMapId: firstAuthoringState.activeCatalogueMapId,
    mapLibraryCount: firstAuthoringState.mapLibrary?.maps?.length ?? null,
    authoringPath: firstAuthoringState.authoringPath,
    bakedMapPath: firstAuthoringState.bakedMapPath,
    revision: firstAuthoringState.document.revision,
    spawn: firstAuthoringState.document.spawn,
    transition: firstAuthoringState.document.transitions?.escapeZone ?? null,
    waterAt1010: firstAuthoringState.document.tiles[10][10],
    treeAt1210: firstAuthoringState.document.sceneObjects.some((entry) => entry.type === 'tree' && entry.x === 12 && entry.y === 10),
    editedSpawner: firstAuthoringState.document.unitSpawners.find((entry) => entry.x === 14 && entry.y === 10) || null,
    saveReceipt: firstAuthoringState.saveReceipt,
    bakeReceipt: firstAuthoringState.bakeReceipt
  },
  runtime: {
    runtimeMap: runtimeState.runtimeMap,
    player: runtimeState.player,
    sceneObjectCount: runtimeState.sceneObjects.length,
    treeAt1210: runtimeState.sceneObjects.some((entry) => entry.type === 'tree' && entry.tileX === 12 && entry.tileY === 10),
    rendererActiveBackend: runtimeState.renderLayerStats?.rendererActiveBackend ?? null
    ,editedSpawner: runtimeState.unitSpawners.find((entry) => entry.x === 14 && entry.y === 10) || null
  },
  secondAuthoring: {
    status: secondAuthoringState.status,
    dirty: secondAuthoringState.dirty,
    activeCatalogueMapId: secondAuthoringState.activeCatalogueMapId,
    authoringPath: secondAuthoringState.authoringPath,
    bakedMapPath: secondAuthoringState.bakedMapPath,
    revision: secondAuthoringState.document.revision,
    mapId: secondAuthoringState.document.mapId,
    transition: secondAuthoringState.document.transitions?.escapeZone ?? null,
    boulderAt1517: secondAuthoringState.document.sceneObjects.some((entry) => entry.type === 'boulder' && entry.x === 15 && entry.y === 17),
    saveReceipt: secondAuthoringState.saveReceipt,
    bakeReceipt: secondAuthoringState.bakeReceipt
  },
  secondRuntime: {
    runtimeMap: secondRuntimeState.runtimeMap,
    player: secondRuntimeState.player,
    sceneObjectCount: secondRuntimeState.sceneObjects.length,
    boulderAt1517: secondRuntimeState.sceneObjects.some((entry) => entry.type === 'boulder' && entry.tileX === 15 && entry.tileY === 17),
    rendererActiveBackend: secondRuntimeState.renderLayerStats?.rendererActiveBackend ?? null
  },
  previewRuntimeQuery: previewState.runtimeQuery,
  browserProof: { consoleIssues, appConsoleIssues, pageErrors, classifiedHttpFailures, unclassifiedHttpFailures }
};
await writeFile(stateFile, `${JSON.stringify(proof, null, 2)}\n`);
} finally {
  await browser.close();
  await Promise.all(canonicalSnapshots.map(snapshot => writeFile(snapshot.filePath, snapshot.content)));
}

if (proof.authoring.contract !== 'axiom.bsb-map-authoring.v0') throw new Error('authoring_contract_missing');
if (proof.authoring.mapLibraryCount !== 4) throw new Error('map_library_not_loaded');
if (proof.authoring.activeCatalogueMapId !== 'first_flightless_night') throw new Error('first_region_not_active_initially');
if (proof.authoring.authoringPath !== 'data/bsb-v2/maps/first_escape.authoring.json') throw new Error('first_region_authoring_path_wrong');
if (proof.authoring.transition?.nextMapPath !== '/data/maps/axiom-second-approach.runtime-map.json') throw new Error('first_region_transition_missing');
if (proof.authoring.waterAt1010 !== 'water') throw new Error('terrain_authoring_not_persisted');
if (!proof.authoring.treeAt1210) throw new Error('scene_object_authoring_not_persisted');
if (proof.authoring.editedSpawner?.type !== 'werewolf') throw new Error('spawner_payload_type_edit_not_persisted');
if (proof.authoring.editedSpawner?.team !== 'wolves') throw new Error('spawner_payload_team_edit_not_persisted');
if (proof.authoring.editedSpawner?.hitPoints !== 64) throw new Error('spawner_health_edit_not_persisted');
if (proof.authoring.editedSpawner?.audioEmitter?.anchor !== 'mouth' || proof.authoring.editedSpawner?.audioEmitter?.maxDistanceMeters !== 52) throw new Error('spawner_audio_emitter_edit_not_persisted');
if (proof.authoring.spawn.x !== 8 || proof.authoring.spawn.y !== 15) throw new Error('player_spawn_authoring_not_persisted');
if (!proof.authoring.saveReceipt?.afterHash || !proof.authoring.bakeReceipt?.afterHash) throw new Error('file_receipts_missing');
if (proof.runtime.runtimeMap?.contract !== 'black-sky-bound.runtime-map.v0') throw new Error('runtime_map_contract_not_loaded');
if (proof.runtime.runtimeMap?.source !== '/data/maps/axiom-first-escape.runtime-map.json') throw new Error('baked_runtime_source_not_loaded');
if (proof.runtime.runtimeMap?.immutable !== true) throw new Error('baked_runtime_map_not_immutable');
if (!proof.runtime.treeAt1210) throw new Error('baked_scene_object_not_visible_to_runtime');
if (proof.runtime.editedSpawner?.audioEmitter?.anchor !== 'mouth' || proof.runtime.editedSpawner?.audioEmitter?.maxDistanceMeters !== 52) throw new Error('baked_audio_emitter_override_not_loaded');
if (proof.runtime.player?.x < 8 || proof.runtime.player?.x > 9) throw new Error('baked_player_spawn_not_loaded');
if (proof.runtime.rendererActiveBackend !== 'webgl3d') throw new Error('bsb_webgl3d_runtime_not_active');
if (proof.secondAuthoring.activeCatalogueMapId !== 'ash_road_threshold') throw new Error('second_region_not_active');
if (proof.secondAuthoring.authoringPath !== 'data/bsb-v2/maps/second_approach.authoring.json') throw new Error('second_region_authoring_path_wrong');
if (proof.secondAuthoring.mapId !== 'axiom_second_approach') throw new Error('second_region_document_wrong');
if (proof.secondAuthoring.transition !== null) throw new Error('second_region_should_be_terminal_placeholder');
if (!proof.secondAuthoring.boulderAt1517) throw new Error('second_region_edit_not_persisted');
if (!proof.secondAuthoring.saveReceipt?.afterHash || !proof.secondAuthoring.bakeReceipt?.afterHash) throw new Error('second_region_file_receipts_missing');
if (proof.secondRuntime.runtimeMap?.source !== '/data/maps/axiom-second-approach.runtime-map.json') throw new Error('second_baked_runtime_source_not_loaded');
if (proof.secondRuntime.runtimeMap?.id !== 'axiom_second_approach') throw new Error('second_baked_runtime_id_wrong');
if (!proof.secondRuntime.boulderAt1517) throw new Error('second_baked_scene_object_not_visible_to_runtime');
if (proof.secondRuntime.rendererActiveBackend !== 'webgl3d') throw new Error('second_bsb_webgl3d_runtime_not_active');
if (proof.previewRuntimeQuery?.skipHatch !== '1') throw new Error('second_region_preview_should_skip_default_hatch');
if (proof.browserProof.appConsoleIssues.length || proof.browserProof.pageErrors.length || proof.browserProof.unclassifiedHttpFailures.length) {
  throw new Error('browser_runtime_issues_detected');
}

console.log(JSON.stringify({
  axiomUrl: proof.axiomUrl,
  runtimeFrameUrl: proof.runtimeFrameUrl,
  secondRuntimeFrameUrl: proof.secondRuntimeFrameUrl,
  authoringScreenshot,
  runtimeScreenshot,
  secondAuthoringScreenshot,
  secondRuntimeScreenshot,
  stateFile,
  revision: proof.authoring.revision,
  sourceHash: proof.authoring.saveReceipt.afterHash,
  bakeHash: proof.authoring.bakeReceipt.afterHash,
  runtimeMap: proof.runtime.runtimeMap,
  secondRuntimeMap: proof.secondRuntime.runtimeMap,
  classifiedBackgroundFailures: proof.browserProof.classifiedHttpFailures.length,
  unclassifiedHttpFailures: proof.browserProof.unclassifiedHttpFailures.length,
  appConsoleIssues: proof.browserProof.appConsoleIssues.length,
  pageErrors: proof.browserProof.pageErrors.length
}, null, 2));

async function clickMapTile(page, tileX, tileY) {
  const point = await page.evaluate(({ tileX, tileY }) => {
    const canvas = document.getElementById('bsb-v2-map-canvas');
    const status = window.BsbV2MapAuthoring.status();
    const rect = canvas.getBoundingClientRect();
    const cell = Math.max(2, Math.min((rect.width - 32) / status.document.width, (rect.height - 32) / status.document.height));
    const offsetX = (rect.width - cell * status.document.width) / 2;
    const offsetY = (rect.height - cell * status.document.height) / 2;
    return { x: rect.left + offsetX + (tileX + 0.5) * cell, y: rect.top + offsetY + (tileY + 0.5) * cell };
  }, { tileX, tileY });
  await page.mouse.click(point.x, point.y);
}

async function changeInspectorValue(page, field, value) {
  const locator = page.locator(`#bsb-v2-inspector-${field}`);
  await locator.fill(value);
  await locator.dispatchEvent('change');
}

async function changeAudioEmitterValue(page, field, value) {
  const locator = page.locator(`#bsb-v2-audio-${field}`);
  await locator.fill(value);
  await locator.dispatchEvent('change');
}

async function waitForRuntimeFrame(page, pathFragment = 'axiom-first-escape.runtime-map.json') {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const frame = page.frames().find((candidate) => candidate.url().includes(pathFragment));
    if (frame) return frame;
    await page.waitForTimeout(100);
  }
  throw new Error(`baked_runtime_frame_timeout:${pathFragment}`);
}

function isExpectedCaptureWarning(issue) {
  if (issue.type !== 'warning') return false;
  if (issue.text.includes('GL Driver Message') && issue.text.includes('ReadPixels')) return true;
  return issue.text.includes('allow-scripts') && issue.text.includes('allow-same-origin');
}

function isResourceConsoleIssue(issue) {
  return issue.type === 'error' && issue.text.startsWith('Failed to load resource:');
}

function isExpectedBackgroundHttpFailure(failure) {
  if (failure.url === 'http://localhost:1234/v1/models' && failure.error === 'net::ERR_CONNECTION_REFUSED') return true;
  if (failure.url === 'http://127.0.0.1:11434/api/tags' && failure.error === 'net::ERR_CONNECTION_REFUSED') return true;
  if (failure.url === 'http://127.0.0.1:4242/call' && failure.error === 'net::ERR_CONNECTION_REFUSED') return true;
  return failure.url === 'http://localhost:3007/mcp/call'
    && failure.status === 500
    && ['fs_ls', 'fs_find'].includes(failure.postData?.tool)
    && /docs\/skills/i.test(String(failure.postData?.params?.path || ''));
}

async function launchBrowser() {
  const channel = process.env.BSB_PLAYWRIGHT_CHANNEL || 'msedge';
  try {
    return await chromium.launch({ channel, headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}
