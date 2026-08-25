import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectSoundAssetFiles, SOUND_CUES } from '../../src/audio/soundManifest.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const externalUrl = process.env.BSB_PLAYTEST_URL?.replace(/\/$/, '') || null;
const proofKind = externalUrl ? 'production' : 'staged';
const artifactRoot = path.join(projectRoot, 'artifacts', `public-3d-demo-revival-${proofKind}-v1`);
await mkdir(artifactRoot, { recursive: true });

const runtime = externalUrl ? { url: externalUrl, stop() {} } : await startStagedSite();
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const issues = { consoleErrors: [], pageErrors: [], requestFailures: [], httpErrors: [] };
page.on('console', (message) => {
  if (message.type() === 'error') issues.consoleErrors.push(message.text());
});
page.on('pageerror', (error) => issues.pageErrors.push(error.message));
page.on('requestfailed', (request) => issues.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));
page.on('response', (response) => {
  if (response.status() >= 400) issues.httpErrors.push(`${response.status()} ${response.url()}`);
});

let report;
try {
  const cacheBust = `build-04-${Date.now()}`;
  const landing = await proveLanding(page, runtime.url, cacheBust);
  const hardening = await inspectReleaseSurface(runtime.url, cacheBust);
  const gameplay = await proveGameplay(page, runtime.url, cacheBust);
  assertNoBrowserIssues(issues);
  report = {
    contract: 'black-sky-bound.public-3d-demo-revival.browser-proof.v1',
    generatedAt: new Date().toISOString(),
    proofKind,
    baseUrl: runtime.url,
    landing,
    hardening,
    gameplay,
    issues
  };
  await writeFile(path.join(artifactRoot, 'playtest-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: 'passed',
    proofKind,
    baseUrl: runtime.url,
    backend: gameplay.renderer.backend,
    waves: gameplay.waves.map((entry) => entry.activeWaveId),
    rewards: gameplay.rewards,
    victory: gameplay.victory,
    audioAssetCount: hardening.audioAssetCount,
    artifactRoot,
    issues
  }, null, 2));
} finally {
  await browser.close();
  runtime.stop();
}

async function proveLanding(target, origin, cacheBust) {
  const landingResponse = await target.goto(`${origin}/?proof=${cacheBust}`, { waitUntil: 'networkidle' });
  const noIndexHeader = landingResponse?.headers()['x-robots-tag'] ?? null;
  const desktopPath = path.join(artifactRoot, '01-landing-desktop.png');
  await target.screenshot({ path: desktopPath, fullPage: true });
  const desktop = await target.evaluate(() => ({
    title: document.title,
    text: document.body.innerText,
    playHref: document.querySelector('a.play')?.getAttribute('href') ?? null,
    robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth
  }));
  if (desktop.title !== 'Black Sky Bound · Early Playtest') throw new Error(`landing_title_wrong:${desktop.title}`);
  if (!desktop.text.includes('BUILD 0.4 · 3D')) throw new Error('landing_build_label_missing');
  if (!desktop.text.includes('five escalating assaults')) throw new Error('landing_field_copy_missing');
  if (desktop.playHref !== '/play/index.html') throw new Error(`landing_play_path_wrong:${desktop.playHref}`);
  if (!/noindex/i.test(desktop.robots ?? '') || noIndexHeader !== 'noindex, nofollow, noarchive' || desktop.horizontalOverflow) {
    throw new Error(`landing_desktop_contract_failed:${JSON.stringify({ ...desktop, noIndexHeader })}`);
  }

  await target.setViewportSize({ width: 760, height: 600 });
  await target.waitForTimeout(100);
  const compactPath = path.join(artifactRoot, '02-landing-compact.png');
  await target.screenshot({ path: compactPath, fullPage: true });
  const compact = await target.evaluate(() => ({
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
    playVisible: document.querySelector('a.play')?.getBoundingClientRect().bottom <= document.documentElement.scrollHeight
  }));
  if (compact.horizontalOverflow || !compact.playVisible) throw new Error(`landing_compact_contract_failed:${JSON.stringify(compact)}`);

  await target.setViewportSize({ width: 1440, height: 900 });
  await Promise.all([
    target.waitForURL((url) => url.pathname === '/play/index.html' || url.pathname === '/play/'),
    target.locator('a.play').click()
  ]);
  await target.waitForLoadState('networkidle');
  return { desktop, compact, noIndexHeader, navigationPath: new URL(target.url()).pathname, screenshots: { desktopPath, compactPath } };
}

async function inspectReleaseSurface(origin, cacheBust) {
  const required = [
    '/data/maps/manifest.json',
    '/data/maps/axiom-crown-of-cinders.runtime-map.json'
  ];
  const forbidden = [
    '/data/maps/axiom-first-escape.runtime-map.json',
    '/data/maps/axiom-second-approach.runtime-map.json',
    '/play/src/app.js',
    '/play/node_modules/three/build/three.module.js'
  ];
  const statuses = {};
  for (const pathname of required) {
    const response = await fetchRequired(`${origin}${pathname}?proof=${cacheBust}`, {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' }
    });
    statuses[pathname] = response.status;
    await response.arrayBuffer();
  }
  for (const pathname of forbidden) {
    const response = await fetch(`${origin}${pathname}?proof=${cacheBust}`, {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' }
    });
    statuses[pathname] = response.status;
    await response.arrayBuffer();
  }
  for (const pathname of required) {
    if (statuses[pathname] !== 200) throw new Error(`required_release_path_unavailable:${pathname}:${statuses[pathname]}`);
  }
  for (const pathname of forbidden) {
    if (statuses[pathname] !== 404) throw new Error(`forbidden_release_path_available:${pathname}:${statuses[pathname]}`);
  }
  const manifestResponse = await fetch(`${origin}/data/maps/manifest.json?proof=${cacheBust}-manifest`, { cache: 'no-store' });
  const manifest = await manifestResponse.json();
  if (manifest.defaultMapId !== 'crown_of_cinders_demo' || manifest.maps?.length !== 1) {
    throw new Error(`public_manifest_not_bounded:${JSON.stringify(manifest)}`);
  }
  const audioStatuses = {};
  await Promise.all(collectSoundAssetFiles(SOUND_CUES).map(async (file) => {
    const pathname = `/play/${file}`;
    const response = await fetchRequired(`${origin}${pathname}?proof=${cacheBust}`, { method: 'HEAD', cache: 'no-store' });
    audioStatuses[pathname] = response.status;
  }));
  const failedAudio = Object.entries(audioStatuses).filter(([, status]) => status !== 200);
  if (failedAudio.length) throw new Error(`required_audio_unavailable:${JSON.stringify(failedAudio)}`);
  return { statuses, manifest, audioAssetCount: Object.keys(audioStatuses).length, audioStatuses };
}

async function fetchRequired(url, init) {
  let response;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    response = await fetch(url, init);
    if (response.status === 200) return response;
    await response.arrayBuffer();
    if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return response;
}

async function proveGameplay(target, origin, cacheBust) {
  await target.goto(`${origin}/play/index.html?skipHatch=1&mamaAuto=0&proof=${cacheBust}`, { waitUntil: 'networkidle' });
  await target.waitForFunction(() => window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dActive === true);
  await target.waitForFunction(() => window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dDiagnostics?.liveWorld?.effects?.mamaFlyoverAsset?.status === 'ready');

  const before = await playerPosition(target);
  await target.keyboard.down('w');
  await target.waitForTimeout(300);
  await target.keyboard.up('w');
  await target.waitForTimeout(120);
  const after = await playerPosition(target);
  if (!(after.x < before.x && after.y < before.y)) throw new Error(`screen_relative_movement_failed:${JSON.stringify({ before, after })}`);

  await target.keyboard.press('Escape');
  await target.waitForFunction(() => window.BSB_V2_DEMO.state.paused === true);
  const pauseLayer = target.locator('#bsb-three-screen-overlay [data-three-pause]');
  const masterRail = pauseLayer.locator('[data-setting-id="audio_master"][data-pause-target="rail"]');
  const rail = await masterRail.boundingBox();
  if (!rail) throw new Error('pause_audio_master_control_missing');
  await target.mouse.click(rail.x + rail.width * 0.45, rail.y + rail.height * 0.5);
  await target.waitForFunction(() => Math.abs(window.BSB_V2_DEMO.state.playerProfile.settings.audio.master - 0.45) < 0.001);
  const pauseDesktopPath = path.join(artifactRoot, '03-pause-audio-desktop.png');
  await target.screenshot({ path: pauseDesktopPath });

  await target.setViewportSize({ width: 760, height: 600 });
  await target.waitForTimeout(100);
  const compactHud = await target.evaluate(() => {
    const pause = document.querySelector('[data-three-pause]')?.getBoundingClientRect();
    const hud = document.querySelector('#bsb-three-screen-overlay [data-hud]')?.getBoundingClientRect();
    return {
      pauseRight: pause?.right ?? Infinity,
      pauseBottom: pause?.bottom ?? Infinity,
      hudRight: hud?.right ?? Infinity,
      hudBottom: hud?.bottom ?? Infinity,
      viewport: { width: innerWidth, height: innerHeight }
    };
  });
  if (compactHud.pauseRight > 760 || compactHud.pauseBottom > 600 || compactHud.hudRight > 760 || compactHud.hudBottom > 600) {
    throw new Error(`compact_game_hud_overflow:${JSON.stringify(compactHud)}`);
  }
  const pauseCompactPath = path.join(artifactRoot, '04-pause-audio-compact.png');
  await target.screenshot({ path: pauseCompactPath });
  await target.setViewportSize({ width: 1440, height: 900 });
  await target.keyboard.press('Escape');
  await target.waitForFunction(() => window.BSB_V2_DEMO.state.paused === false);
  await target.evaluate(() => window.BSB_V2_DEMO.stop());

  const lifecycle = await proveDeathAndRespawn(target);
  await ensureWaveOneActive(target);
  const expectedWaves = ['first_blood', 'spearline', 'the_press', 'the_hunt', 'black_sky'];
  const expectedRewards = ['dodge', 'body_lunge', 'smoke_burst', 'charge_counter'];
  const initialAbilities = ['move', 'bite_claw'];
  const waves = [];
  const rewards = [];
  for (let index = 0; index < expectedWaves.length; index += 1) {
    await target.evaluate(() => window.advanceTime(420));
    await target.waitForTimeout(160);
    const active = await snapshot(target);
    if (active.arena.activeWaveId !== expectedWaves[index] || active.arena.phase !== 'active') {
      throw new Error(`wave_activation_wrong:${index}:${JSON.stringify(active.arena)}`);
    }
    waves.push({
      activeWaveId: active.arena.activeWaveId,
      waveNumber: active.arena.waveNumber,
      spawnerIds: active.unitSpawners.map((entry) => entry.id),
      fixtureCount: active.unitSpawnerFixtures.length,
      activeEnemyCount: active.actors.filter((entry) => entry.team !== 'player' && entry.alive && entry.type !== 'unit_spawner').length,
      unlockedAbilityIds: active.arena.unlockedAbilityIds
    });
    if (waves.at(-1).activeEnemyCount <= 0) throw new Error(`wave_spawn_readiness_missing:${index}:${JSON.stringify(waves.at(-1))}`);
    if (index === 0 || index === 2 || index === 4) {
      await target.screenshot({ path: path.join(artifactRoot, `wave-${index + 1}-active.png`) });
    }
    if (index === 0) {
      await target.setViewportSize({ width: 760, height: 600 });
      await target.waitForTimeout(100);
      await target.screenshot({ path: path.join(artifactRoot, 'wave-1-active-compact.png') });
      await target.setViewportSize({ width: 1440, height: 900 });
    }
    await clearActiveWave(target);
    await target.waitForTimeout(160);
    const cleared = await snapshot(target);
    if (index < expectedRewards.length) {
      if (cleared.arena.lastRewardAbilityId !== expectedRewards[index]) {
        throw new Error(`wave_reward_wrong:${index}:${cleared.arena.lastRewardAbilityId}`);
      }
      rewards.push(cleared.arena.lastRewardAbilityId);
      const expectedAbilities = [...initialAbilities, ...expectedRewards.slice(0, index + 1)];
      if (JSON.stringify(cleared.arena.unlockedAbilityIds) !== JSON.stringify(expectedAbilities)) {
        throw new Error(`wave_unlock_order_wrong:${index}:${JSON.stringify(cleared.arena.unlockedAbilityIds)}`);
      }
      if (index === 0 || index === 3) {
        await target.screenshot({ path: path.join(artifactRoot, `unlock-${index + 1}-${expectedRewards[index]}.png`) });
      }
    }
    if (index < expectedWaves.length - 1) {
      if (cleared.arena.phase !== 'intermission') throw new Error(`wave_intermission_missing:${index}:${cleared.arena.phase}`);
      await target.evaluate(() => window.advanceTime(4100));
    }
  }
  const victoryState = await snapshot(target);
  const victory = {
    phase: victoryState.arena.phase,
    status: victoryState.status,
    banner: victoryState.arena.banner,
    completedWaveIds: victoryState.arena.completedWaveIds
  };
  if (victory.phase !== 'complete' || victory.status !== 'won' || JSON.stringify(victory.completedWaveIds) !== JSON.stringify(expectedWaves)) {
    throw new Error(`arena_victory_wrong:${JSON.stringify(victory)}`);
  }
  const victoryPath = path.join(artifactRoot, '10-victory.png');
  await target.screenshot({ path: victoryPath });

  const renderer = await target.evaluate(() => {
    const state = window.BSB_V2_DEMO.state.game.renderLayers.renderer;
    return {
      backend: state.activeBackend,
      backendStatus: state.backendStatus,
      webgl3dActive: state.webgl3dActive,
      legacyCompositeActive: state.legacyCompositeActive,
      canvas2dRuntimeAvailable: state.canvas2dRuntimeAvailable,
      mamaFlyoverAsset: state.webgl3dDiagnostics?.liveWorld?.effects?.mamaFlyoverAsset ?? null,
      terrainTiles: state.webgl3dDiagnostics?.liveWorld?.terrainTiles ?? 0,
      actorCount: state.webgl3dDiagnostics?.liveWorld?.actors?.actorCount ?? 0
    };
  });
  if (renderer.backend !== 'webgl3d' || renderer.backendStatus !== 'active' || renderer.webgl3dActive !== true) {
    throw new Error(`three_renderer_not_active:${JSON.stringify(renderer)}`);
  }
  if (renderer.legacyCompositeActive === true || renderer.canvas2dRuntimeAvailable === true) {
    throw new Error(`legacy_renderer_runtime_present:${JSON.stringify(renderer)}`);
  }
  if (renderer.mamaFlyoverAsset?.status !== 'ready' || renderer.terrainTiles <= 0 || renderer.actorCount <= 0) {
    throw new Error(`three_scene_readiness_failed:${JSON.stringify(renderer)}`);
  }
  return {
    renderer,
    movement: { before, after },
    audioMaster: 0.45,
    compactHud,
    lifecycle,
    waves,
    rewards,
    victory,
    screenshots: { pauseDesktopPath, pauseCompactPath, victoryPath }
  };
}

async function proveDeathAndRespawn(target) {
  const before = await snapshot(target);
  await target.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    const health = app.state.game.world.components.get('Health').get(app.state.game.dragonId);
    health.hp = 0;
    health.alive = false;
    app.state.game.world.events.push({
      type: 'entity_died',
      payload: { entity: app.state.game.dragonId, source: null, damageType: 'release_gate' },
      at: app.state.game.world.events.length
    });
    window.advanceTime(20);
  });
  await target.evaluate(() => window.advanceTime(650));
  const death = await snapshot(target);
  if (death.player.lifecycle.state !== 'deathFade' || death.player.alive !== false) {
    throw new Error(`death_lifecycle_missing:${JSON.stringify(death.player)}`);
  }
  const deathPath = path.join(artifactRoot, '05-death-fade.png');
  await target.screenshot({ path: deathPath });
  await target.evaluate(() => window.advanceTime(420));
  await target.evaluate(() => window.advanceTime(50));
  await target.evaluate(() => window.advanceTime(1460));
  const respawn = await snapshot(target);
  if (respawn.player.lifecycle.state !== 'alive' || respawn.player.lifecycle.respawnCount !== before.player.lifecycle.respawnCount + 1 || respawn.player.alive !== true) {
    throw new Error(`canonical_respawn_failed:${JSON.stringify(respawn.player)}`);
  }
  return { deathState: death.player.lifecycle.state, respawnState: respawn.player.lifecycle.state, respawnCount: respawn.player.lifecycle.respawnCount, deathPath };
}

async function ensureWaveOneActive(target) {
  const state = await snapshot(target);
  if (state.arena.phase === 'active' && state.arena.activeWaveId === 'first_blood') return;
  if (state.arena.phase !== 'countdown') throw new Error(`unexpected_pre_wave_state:${JSON.stringify(state.arena)}`);
  await target.evaluate(() => window.advanceTime(3000));
}

async function clearActiveWave(target) {
  await target.evaluate(() => {
    const world = window.BSB_V2_DEMO.state.game.world;
    for (const spawner of window.BSB_V2_DEMO.state.game.unitSpawners) {
      for (const entity of spawner.spawnedEntityIds) {
        world.entities.delete(entity);
        for (const store of world.components.values()) store.delete(entity);
      }
      spawner.spawnedCount = spawner.limit;
      spawner.spawnedEntityIds = [];
    }
    window.advanceTime(20);
  });
}

function snapshot(target) {
  return target.evaluate(() => JSON.parse(window.render_game_to_text()));
}

function playerPosition(target) {
  return target.evaluate(() => {
    const actor = window.BSB_V2_DEMO.state.game.actors.find((entry) => entry.team === 'player' && entry.alive);
    return { x: actor.x, y: actor.y };
  });
}

function assertNoBrowserIssues(currentIssues) {
  if (currentIssues.consoleErrors.length || currentIssues.pageErrors.length || currentIssues.requestFailures.length || currentIssues.httpErrors.length) {
    throw new Error(`browser_release_issues:${JSON.stringify(currentIssues)}`);
  }
}

async function startStagedSite() {
  const port = await freePort();
  const cli = path.join(projectRoot, 'site', 'node_modules', 'vinext', 'dist', 'cli.js');
  const child = spawn(process.execPath, [cli, 'start', '--port', String(port)], {
    cwd: path.join(projectRoot, 'site'),
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`staged_site_exited:${child.exitCode}:${output}`);
    try {
      const response = await fetch(url);
      if (response.ok) return { url, stop: () => child.kill() };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error(`staged_site_timeout:${output}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: process.env.BSB_PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}
