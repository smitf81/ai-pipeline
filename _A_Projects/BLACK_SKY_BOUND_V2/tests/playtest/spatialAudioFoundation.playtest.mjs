import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const artifacts = path.join(root, 'artifacts', 'spatial-audio-foundation');
const port = 5217;
const url = `http://127.0.0.1:${port}/?skipHatch=1&mamaAuto=0&spatialAudioProof=1`;
const issues = { consoleErrors: [], pageErrors: [], requestFailures: [] };
let server;
let browser;

await mkdir(artifacts, { recursive: true });
try {
  server = spawn(process.execPath, ['tools/launch.mjs', String(port)], {
    cwd: root,
    env: { ...process.env, BSB_NO_OPEN: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await waitForRuntime();
  browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (message) => { if (message.type() === 'error') issues.consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => issues.pageErrors.push(error.message));
  page.on('requestfailed', (request) => issues.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText}`));
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForFunction(() => window.BSB_V2_DEMO?.audio && window.advanceTime, null, { timeout: 20_000 });
  await page.locator('#game').click({ position: { x: 720, y: 450 } });
  await page.waitForFunction(() => window.BSB_V2_DEMO.audio.getDebugState().unlocked, null, { timeout: 15_000 });
  await page.waitForFunction(() => window.BSB_V2_DEMO.audio.getDebugState().assets.requiredReady, null, { timeout: 20_000 });
  await page.evaluate(() => window.BSB_V2_DEMO.stop());

  const baseline = await snapshot(page);
  assert.equal(baseline.available, true, 'browser AudioContext should be available');
  assert.equal(baseline.audioPerspective.listenerRelativeAttenuation, true, 'runtime must report real listener-relative attenuation');
  assert.ok(baseline.audioPerspective.spatialEmitterCount > 0, 'runtime should project transform-owned emitters');
  assert.equal(baseline.audioPerspective.listener.position.y, 0.35, 'listener should use the player-owned 0.35 m ear height');
  assert.equal(baseline.assets.errorCount, 0, 'all production audio should decode');
  assert.ok(baseline.assets.files.filter((entry) => entry.file.includes('direct_mono')).every((entry) => entry.channels === 1), 'all positioned direct layers should decode as mono');

  const warning = await page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    app.worldEvents.flyover();
    window.advanceTime(25);
    const event = app.state.game.worldEvents.activeEvent;
    const key = `worldEvent:${event.id}:voice`;
    return { event: { id: event.id, phase: event.phase, worldX: event.worldX, worldY: event.worldY }, key, audio: app.audio.getDebugState() };
  });
  assert.equal(warning.event.phase, 'warning_roar', 'proof should capture the off-screen warning source');
  assert.ok(warning.audio.recentCues.some((cue) => cue.cueId === 'world.mama_wyvern.distant_roar' && cue.sourceRef?.ownerId === warning.event.id), 'warning roar should bind to Mama sourceRef');
  assert.ok(warning.audio.audioPerspective.activePannerVoiceCount > 0, 'warning roar should create a live PannerNode voice');
  const warningEmitter = warning.audio.audioPerspective.emitters[warning.key];
  assert.ok(warningEmitter?.distanceMeters > 0, 'warning source should have a world-derived listener distance');

  const moving = await page.evaluate((key) => {
    for (let step = 0; step < 180; step += 1) {
      window.advanceTime(25);
      const event = window.BSB_V2_DEMO.state.game.worldEvents.activeEvent;
      if (event?.phase === 'shadow_flyover' && event.progress >= 0.52) break;
    }
    const audio = window.BSB_V2_DEMO.audio.getDebugState();
    return { emitter: audio.audioPerspective.emitters[key], perspective: audio.audioPerspective, recentErrors: audio.recentErrors };
  }, warning.key);
  assert.ok(moving.emitter, 'moving Mama emitter should retain the same stable sourceRef');
  assert.notDeepEqual(moving.emitter.position, warningEmitter.position, 'Mama audio position should follow her live trajectory');
  assert.ok(Math.abs(moving.emitter.distanceMeters - warningEmitter.distanceMeters) > 0.1 || Math.abs(moving.emitter.pan - warningEmitter.pan) > 0.05, 'Mama movement should change geometry-derived distance or pan');
  assert.ok(Math.abs(moving.emitter.dopplerRatio - 1) > 0.0001, 'Mama radial velocity should drive smoothed Doppler');
  assert.equal(moving.perspective.listener.position.y, 0.35, 'listener height should remain stable during movement');
  assert.deepEqual(moving.recentErrors, [], 'spatial proof should have no audio ownership or load errors');

  await writeFile(path.join(artifacts, 'runtime-evidence.json'), `${JSON.stringify({ url, baseline, warning, moving, issues }, null, 2)}\n`);
  await page.locator('#game').screenshot({ path: path.join(artifacts, 'spatial-audio-runtime.png'), timeout: 60_000, animations: 'disabled' });
  assert.deepEqual(issues.consoleErrors, [], 'browser console errors should be empty');
  assert.deepEqual(issues.pageErrors, [], 'browser page errors should be empty');
  assert.deepEqual(issues.requestFailures, [], 'browser request failures should be empty');
  console.log(JSON.stringify({ status: 'passed', url, spatialEmitterCount: baseline.audioPerspective.spatialEmitterCount, warning: warningEmitter, moving: moving.emitter, artifacts }, null, 2));
} finally {
  await browser?.close().catch(() => {});
  server?.kill();
}

async function snapshot(page) {
  return page.evaluate(() => window.BSB_V2_DEMO.audio.getDebugState());
}

async function waitForRuntime() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (server.exitCode != null) throw new Error(`runtime_exited:${server.exitCode}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/__bsb_runtime_identity`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('runtime_start_timeout');
}
