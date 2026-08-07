import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const launcherRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(launcherRoot, '..', '..', '..');
const requireFromBsb = createRequire(join(workspaceRoot, '_A_Projects', 'BLACK_SKY_BOUND_V2', 'package.json'));
const { chromium } = requireFromBsb('@playwright/test');
const outDir = join(launcherRoot, 'output', 'playwright', 'bsb-demo-arena-v1');
const authoringScreenshot = join(outDir, '01-crown-of-cinders-axiom-source.png');
const runtimeScreenshot = join(outDir, '02-crown-of-cinders-runtime-preview.png');
const reportPath = join(outDir, 'playtest-report.json');
const axiomUrl = process.env.AXIOM_PROOF_URL || 'http://127.0.0.1:3007/axiom-editor.html';
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1720, height: 980 }, deviceScaleFactor: 1 });
const consoleIssues = [];
const pageErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error' && !/favicon|capture/i.test(message.text())) consoleIssues.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));

let proof;
try {
  await page.goto(axiomUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.EDITOR && window.FileManagerRuntime && window.BsbV2MapAuthoring);
  await page.evaluate(async () => {
    await window.FileManagerRuntime.loadProjectRoot('_A_Projects/BLACK_SKY_BOUND_V2', { sourceSurface: 'demo_arena_playwright_proof' });
    window.switchTab?.('bsb-map');
  });
  await page.waitForFunction(() => window.BsbV2MapAuthoring.status().mapLibrary?.maps?.length === 3);
  await page.evaluate(() => window.BsbV2MapAuthoring.selectRegion('crown_of_cinders_demo'));
  await page.waitForFunction(() => {
    const status = window.BsbV2MapAuthoring.status();
    return status.activeCatalogueMapId === 'crown_of_cinders_demo'
      && status.document?.mapId === 'axiom_crown_of_cinders'
      && status.document?.arena?.waves?.length === 5;
  });
  const authoring = await page.evaluate(() => window.BsbV2MapAuthoring.status());
  await page.screenshot({ path: authoringScreenshot, fullPage: true });
  await page.getByRole('button', { name: 'Bake & Preview' }).click();
  await page.waitForFunction(() => {
    const status = window.BsbV2MapAuthoring.status();
    return status.status === 'runtime ready' && status.view === 'runtime' && status.bakeReceipt;
  }, null, { timeout: 20000 });
  await page.waitForFunction(() => document.getElementById('project-preview-frame')?.src?.includes('axiom-crown-of-cinders.runtime-map.json'));
  const frameHandle = await page.locator('#project-preview-frame').elementHandle();
  const runtimeFrame = await frameHandle.contentFrame();
  await runtimeFrame.waitForFunction(() => window.BSB_V2_DEMO && window.render_game_to_text);
  const runtimeState = await runtimeFrame.evaluate(() => JSON.parse(window.render_game_to_text()));
  await page.screenshot({ path: runtimeScreenshot, fullPage: true });
  const finalStatus = await page.evaluate(() => window.BsbV2MapAuthoring.status());
  proof = {
    contract: 'axiom.bsb-demo-arena-authoring-proof.v1',
    axiomUrl,
    authoringScreenshot,
    runtimeScreenshot,
    authoring: {
      activeCatalogueMapId: authoring.activeCatalogueMapId,
      authoringPath: authoring.authoringPath,
      mapId: authoring.document.mapId,
      dimensions: `${authoring.document.width}x${authoring.document.height}`,
      spawnerCount: authoring.document.unitSpawners.length,
      waveCount: authoring.document.arena.waves.length,
      rewards: authoring.document.arena.waves.map((wave) => wave.rewardAbilityId).filter(Boolean)
    },
    bake: {
      status: finalStatus.status,
      bakedMapPath: finalStatus.bakedMapPath,
      receipt: finalStatus.bakeReceipt,
      runtimeMapId: runtimeState.runtimeMap.id,
      runtimeArena: runtimeState.arena
    },
    consoleIssues,
    appConsoleIssues: consoleIssues.filter((issue) => !/Failed to load resource/i.test(issue)),
    pageErrors
  };
  await writeFile(reportPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
  if (proof.authoring.spawnerCount !== 15 || proof.authoring.waveCount !== 5) throw new Error('axiom_demo_arena_authoring_incomplete');
  if (proof.bake.runtimeMapId !== 'axiom_crown_of_cinders') throw new Error('axiom_demo_arena_runtime_preview_wrong_map');
  if (proof.appConsoleIssues.length || pageErrors.length) throw new Error('axiom_demo_arena_browser_issues');
} finally {
  await browser.close();
}
await writeFile(reportPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(proof, null, 2));
