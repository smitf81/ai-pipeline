import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = join(root, 'artifacts', 'public-demo-arena-v1');
const baseUrl = process.env.BSB_PLAYTEST_URL || 'http://127.0.0.1:4187';
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const consoleIssues = [];
const pageErrors = [];
const failedRequests = [];
page.on('console', (message) => {
  if (/GL Driver Message|GPU stall due to ReadPixels/i.test(message.text())) return;
  if (message.type() === 'error' || message.type() === 'warning') consoleIssues.push({ type: message.type(), text: message.text() });
});
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('requestfailed', (request) => failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? 'request_failed' }));

const screenshots = {
  landing: join(outDir, '01-sites-demo-landing.png'),
  countdown: join(outDir, '02-arena-countdown.png'),
  waveOne: join(outDir, '03-wave-one-active.png'),
  firstUnlock: join(outDir, '04-dodge-unlocked.png'),
  compact: join(outDir, '05-compact-wave-hud.png')
};
let proof;
try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.screenshot({ path: screenshots.landing, fullPage: true });
  const landingText = await page.locator('body').innerText();
  if (!landingText.includes('five escalating assaults')) throw new Error('demo_landing_copy_missing');
  const hardening = await inspectHardening(baseUrl);
  await page.goto(`${baseUrl}/play/index.html?skipHatch=1&mamaAuto=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.BSB_V2_DEMO && window.render_game_to_text);
  await page.evaluate(() => window.BSB_V2_DEMO.stop());
  const countdown = await snapshot(page);
  await page.screenshot({ path: screenshots.countdown });
  await page.evaluate(() => window.advanceTime(2600));
  const waveOne = await snapshot(page);
  await page.screenshot({ path: screenshots.waveOne });
  await page.evaluate(() => {
    for (const spawner of window.BSB_V2_DEMO.state.game.unitSpawners) {
      spawner.spawnedCount = spawner.limit;
      spawner.spawnedEntityIds = [];
    }
    window.advanceTime(20);
  });
  const firstUnlock = await snapshot(page);
  await page.screenshot({ path: screenshots.firstUnlock });
  await page.setViewportSize({ width: 760, height: 600 });
  await page.evaluate(() => window.advanceTime(4100));
  const waveTwoCompact = await snapshot(page);
  await page.screenshot({ path: screenshots.compact });
  proof = {
    contract: 'black-sky-bound.public-demo-playtest-proof.v1',
    baseUrl,
    screenshots,
    landing: { hasArenaCopy: landingText.includes('five escalating assaults') },
    hardening,
    countdown: summarize(countdown),
    waveOne: summarize(waveOne),
    firstUnlock: summarize(firstUnlock),
    waveTwoCompact: summarize(waveTwoCompact),
    consoleIssues,
    pageErrors,
    failedRequests
  };
  await writeFile(join(outDir, 'playtest-report.json'), `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
  assertProof(proof);
} finally {
  await browser.close();
}
await writeFile(join(outDir, 'playtest-report.json'), `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(proof, null, 2));

async function snapshot(target) {
  return target.evaluate(() => JSON.parse(window.render_game_to_text()));
}

function summarize(state) {
  return {
    runtimeMap: state.runtimeMap,
    arena: state.arena,
    activeSpawnerIds: state.unitSpawners.map((entry) => entry.id),
    fixtureCount: state.unitSpawnerFixtures.length,
    playerAbilityIds: state.player?.abilities?.unlockedAbilities ?? state.arena?.unlockedAbilityIds ?? []
  };
}

async function inspectHardening(origin) {
  const paths = [
    '/data/maps/manifest.json',
    '/data/maps/axiom-crown-of-cinders.runtime-map.json',
    '/data/maps/axiom-first-escape.runtime-map.json',
    '/data/maps/axiom-second-approach.runtime-map.json',
    '/play/src/app.js'
  ];
  const proofVersion = `sites-v2-${Date.now()}`;
  const responses = await Promise.all(paths.map((path) => fetch(`${origin}${path}?proof=${proofVersion}`, {
    cache: 'no-store',
    headers: { 'cache-control': 'no-cache' }
  })));
  const statuses = Object.fromEntries(paths.map((path, index) => [path, responses[index].status]));
  const manifest = await responses[0].json();
  await Promise.all(responses.slice(1).map((response) => response.arrayBuffer()));
  return { statuses, manifest };
}

function assertProof(result) {
  if (result.hardening.manifest.defaultMapId !== 'crown_of_cinders_demo') throw new Error('public_manifest_default_not_arena');
  if (result.hardening.manifest.maps.length !== 1) throw new Error('public_manifest_not_bounded');
  if (result.hardening.statuses['/data/maps/manifest.json'] !== 200) throw new Error('public_manifest_unavailable');
  if (result.hardening.statuses['/data/maps/axiom-crown-of-cinders.runtime-map.json'] !== 200) throw new Error('public_arena_unavailable');
  for (const path of ['/data/maps/axiom-first-escape.runtime-map.json', '/data/maps/axiom-second-approach.runtime-map.json', '/play/src/app.js']) {
    if (result.hardening.statuses[path] !== 404) throw new Error(`public_forbidden_path_available:${path}`);
  }
  if (result.countdown.runtimeMap.id !== 'axiom_crown_of_cinders') throw new Error('browser_loaded_wrong_map');
  if (result.countdown.arena.phase !== 'countdown') throw new Error('arena_countdown_missing');
  if (result.waveOne.arena.activeWaveId !== 'first_blood' || result.waveOne.fixtureCount !== 2) throw new Error('wave_one_activation_invalid');
  if (!result.firstUnlock.arena.unlockedAbilityIds.includes('dodge')) throw new Error('first_wave_dodge_unlock_missing');
  if (result.waveTwoCompact.arena.activeWaveId !== 'spearline') throw new Error('wave_two_activation_invalid');
  if (result.consoleIssues.length || result.pageErrors.length || result.failedRequests.length) throw new Error('browser_runtime_issues_detected');
}
