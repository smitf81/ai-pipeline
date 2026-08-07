import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const artifacts = path.join(root, 'artifacts', 'baby-wyvern-first-cry-v1');
const cryFiles = [
  'assets/audio/production/baby_wyvern_first_cry_01.wav',
  'assets/audio/production/baby_wyvern_first_cry_02.wav'
];
const issues = { consoleErrors: [], pageErrors: [], requestFailures: [], httpErrors: [] };
const responses = Object.fromEntries(cryFiles.map((file) => [file, null]));
let server;
let browser;

await mkdir(artifacts, { recursive: true });
try {
  const port = await freePort();
  server = spawn(process.execPath, ['tools/launch.mjs', String(port)], {
    cwd: root,
    env: { ...process.env, BSB_NO_OPEN: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  const baseUrl = await waitForRuntime(server, port);
  const identity = await (await fetch(`${baseUrl}__bsb_runtime_identity`)).json();
  assert.equal(path.resolve(identity.rootDir), path.resolve(root), 'proof must use the exact BSB checkout');

  browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (message) => { if (message.type() === 'error') issues.consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => issues.pageErrors.push(error.message));
  page.on('requestfailed', (request) => issues.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText}`));
  page.on('response', (response) => {
    if (response.status() >= 400) issues.httpErrors.push(`${response.status()} ${response.url()}`);
    const file = cryFiles.find((candidate) => response.url().endsWith(candidate));
    if (file) responses[file] = { status: response.status(), contentType: response.headers()['content-type'] ?? null, cacheControl: response.headers()['cache-control'] ?? null };
  });

  await page.addInitScript(() => localStorage.clear());
  const response = await page.goto(`${baseUrl}?mamaAuto=0&firstCryProof=1`, { waitUntil: 'networkidle', timeout: 30_000 });
  assert.ok(response?.ok(), `boot_http_${response?.status() ?? 'missing'}`);
  await page.waitForFunction(() => window.BSB_V2_DEMO?.state?.opening?.phase === 'inside_egg' && typeof window.advanceTime === 'function');
  await page.evaluate(() => {
    window.__BSB_FIRST_CRY_BUFFER_STARTS = [];
    const prototype = globalThis.AudioBufferSourceNode?.prototype;
    if (!prototype || prototype.__bsbFirstCryProofWrapped) return;
    const originalStart = prototype.start;
    Object.defineProperty(prototype, '__bsbFirstCryProofWrapped', { value: true });
    prototype.start = function proofFirstCryStart(...args) {
      if (Math.abs((this.buffer?.duration ?? 0) - 1.85) < 0.01) {
        window.__BSB_FIRST_CRY_BUFFER_STARTS.push({
          durationSeconds: Number((this.buffer?.duration ?? 0).toFixed(4)),
          channels: this.buffer?.numberOfChannels ?? 0,
          sampleRate: this.buffer?.sampleRate ?? 0
        });
      }
      return originalStart.apply(this, args);
    };
  });
  await page.locator('#game').click({ position: { x: 720, y: 450 } });
  await page.waitForFunction(() => {
    const audio = window.BSB_V2_DEMO.audio.getDebugState();
    return audio.unlocked && audio.assets.requiredReady;
  }, null, { timeout: 30_000 });
  await page.evaluate(() => { window.BSB_V2_DEMO.stop(); window.advanceTime(950); });

  const acceptedStages = [];
  for (const key of ['w', 'a', 's', 'd', 'w', 'a']) {
    await page.keyboard.press(key);
    acceptedStages.push(await page.evaluate(() => {
      window.advanceTime(20);
      const count = window.BSB_V2_DEMO.state.opening.acceptedInputCount;
      window.advanceTime(620);
      return count;
    }));
  }
  assert.equal(acceptedStages.join(','), '1,2,3,4,5,6', 'real movement edges should reach shell opening');
  await page.evaluate(() => window.advanceTime(2300));
  await page.waitForFunction(() => window.BSB_V2_DEMO.audio.getDebugState().recentCues.some(
    (cue) => cue.cueId === 'player.voice.first_cry' && cue.source === 'file'
  ));

  const emergence = await page.evaluate(({ cryFiles }) => {
    const app = window.BSB_V2_DEMO;
    const audio = app.audio.getDebugState();
    const cue = [...audio.recentCues].reverse().find((entry) => entry.cueId === 'player.voice.first_cry');
    const player = app.state.game.actors.find((actor) => actor.id === app.state.game.dragonId);
    return {
      opening: { phase: app.state.opening.phase, openingProgress: app.state.opening.openingProgress, emergenceProgress: app.state.opening.emergenceProgress },
      player: { id: player.id, audioEmitter: player.audioEmitter },
      cue,
      effectiveEnclosure: audio.audioPerspective.effective,
      activePannerVoiceCount: audio.audioPerspective.activePannerVoiceCount,
      mamaOpeningCues: audio.recentCues.filter((entry) => entry.cueId.startsWith('world.mama_wyvern.')),
      assets: audio.assets.files.filter((entry) => cryFiles.includes(entry.file)),
      recentErrors: audio.recentErrors,
      bufferStarts: window.__BSB_FIRST_CRY_BUFFER_STARTS
    };
  }, { cryFiles });
  assert.equal(emergence.opening.phase, 'emerging', 'first cry should land at body emergence');
  assert.equal(emergence.cue.sourceRef.ownerId, emergence.player.id, 'first cry should use the exact player actor source');
  assert.equal(emergence.player.audioEmitter.cueRoles.firstCry, 'player.voice.first_cry', 'player emitter should own the first-cry cue role');
  assert.ok(emergence.cue.spatial.distanceMeters < 0.2, 'voice should resolve from the hatchling mouth near its listener');
  assert.ok(emergence.activePannerVoiceCount > 0, 'first cry should create a live PannerNode voice');
  assert.ok(emergence.effectiveEnclosure.cutoffHz < 4000 && emergence.effectiveEnclosure.exteriorGain < 1, 'the normal asset should receive live shell transmission at emergence');
  assert.deepEqual(emergence.mamaOpeningCues, [], 'opening release should not play a Mama substitute');
  assert.equal(emergence.assets.length, 2, 'both first-cry variations should preload');
  assert.ok(emergence.assets.every((entry) => entry.status === 'ready' && entry.channels === 1 && Math.abs(entry.durationSeconds - 1.85) < 0.01), 'first-cry assets should decode as 1.85 second mono files');

  const screenshot = path.join(artifacts, '01-hatchling-first-cry-emergence.png');
  await page.screenshot({ path: screenshot, fullPage: true, timeout: 90_000 });

  await page.evaluate(() => window.advanceTime(2050));
  const palette = await page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    const sourceRef = { ownerKind: 'actor', ownerId: app.state.game.dragonId, emitterId: 'voice' };
    const played = app.audio.playCue('player.voice.first_cry', { intensity: 0.84, reason: 'first_cry_palette_proof', sourceRef });
    return { played, debug: app.audio.getDebugState() };
  });
  assert.equal(palette.played, true, 'reusable first-cry cue should play after its opening beat');
  const firstCryCues = palette.debug.recentCues.filter((cue) => cue.cueId === 'player.voice.first_cry');
  assert.equal(new Set(firstCryCues.map((cue) => cue.file)).size, 2, 'opening plus reuse should rotate both authored performances');
  assert.ok(palette.debug.recentErrors.length === 0, `audio_errors:${JSON.stringify(palette.debug.recentErrors)}`);
  assert.ok(emergence.bufferStarts.length >= 1, 'opening should start a real decoded AudioBufferSourceNode');
  assert.ok(Object.values(responses).every((entry) => entry?.status === 200 && entry.cacheControl === 'no-store'), `asset_http:${JSON.stringify(responses)}`);
  assert.deepEqual(issues, { consoleErrors: [], pageErrors: [], requestFailures: [], httpErrors: [] });

  const report = {
    contract: 'black-sky-bound.baby-wyvern-first-cry.browser-proof.v1',
    status: 'passed',
    url: `${baseUrl}?mamaAuto=0&firstCryProof=1`,
    identity,
    acceptedStages,
    emergence,
    palette: { playedFiles: firstCryCues.map((cue) => cue.file), recentErrors: palette.debug.recentErrors },
    responses,
    issues,
    screenshot
  };
  await writeFile(path.join(artifacts, 'playtest-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close().catch(() => {});
  server?.kill();
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => resolve(address.port));
    });
  });
}

async function waitForRuntime(child, port) {
  const url = `http://127.0.0.1:${port}/`;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`runtime_exited:${child.exitCode}`);
    try {
      const response = await fetch(`${url}__bsb_runtime_identity`);
      if (response.ok) return url;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('runtime_start_timeout');
}
